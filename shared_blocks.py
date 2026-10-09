"""Account/brand scoped reusable blocks, optimistic updates and frozen assets."""
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import base64
import json
from pathlib import Path
import re
import sqlite3
import uuid
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup
from article_storage import atomic_write


class BlockConflict(ValueError):
    def __init__(self, current):
        super().__init__('Блок уже обновлён в другом окне. Получите новую версию перед сохранением.')
        self.current = current


def validate_brand(brand):
    if brand not in ('outmax', 'hasl'):
        raise ValueError('Неизвестный бренд')
    return brand


def database(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(folder / '_shared_blocks.sqlite3', timeout=30)
    connection.execute('CREATE TABLE IF NOT EXISTS blocks (brand TEXT, id TEXT, record TEXT, PRIMARY KEY(brand,id))')
    return connection


def list_blocks(folder, brand):
    validate_brand(brand)
    with closing(database(folder)) as connection:
        return [json.loads(row[0]) for row in connection.execute('SELECT record FROM blocks WHERE brand=? ORDER BY rowid DESC', (brand,))]


def clean_fragment(html):
    if not isinstance(html, str) or not html.strip() or len(html.encode()) > 2 * 1024 * 1024:
        raise ValueError('Блок пустой или больше 2 МБ')
    soup = BeautifulSoup(html, 'html.parser')
    for tag in soup.select('script,style,link,meta,iframe,object,embed,form,input,button,textarea,select'):
        tag.decompose()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            value = str(tag.attrs[attr])
            if (attr.lower().startswith(('on', 'data-shared-', 'data-editor-')) or
                    attr.lower() in ('contenteditable', 'srcdoc') or
                    attr.lower() in ('href', 'src', 'xlink:href') and re.match(r'\s*(?:javascript|vbscript|file):', value, re.I) or
                    attr.lower() == 'style' and re.search(r'expression\s*\(|javascript\s*:', value, re.I)):
                del tag.attrs[attr]
    roots = [node for node in soup.contents if getattr(node, 'name', None)]
    if len(roots) != 1 or any(str(node).strip() for node in soup.contents if not getattr(node, 'name', None)):
        raise ValueError('Выберите один целый блок')
    if roots[0].name not in ('div', 'section', 'article', 'figure', 'nav', 'aside', 'p', 'blockquote', 'ul', 'ol', 'table', 'hr', 'img', 'h2', 'h3', 'h4', 'h5', 'h6'):
        raise ValueError('Этот элемент нельзя сохранить как блок')
    if soup.select('[data-shared-id]'):
        raise ValueError('Вложенные связанные блоки не поддерживаются')
    return str(soup)


def freeze_images(html, folder, public_prefix):
    """Copy local images by digest so another article never relies on a draft folder."""
    soup = BeautifulSoup(html, 'html.parser')
    def freeze(source):
        parsed = urlparse(source)
        if parsed.scheme in ('http', 'https'):
            return source
        match = re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)', source)
        if match:
            try:
                data = base64.b64decode(re.sub(r'\s', '', match[2]), validate=True)
            except ValueError:
                raise ValueError('Некорректное встроенное изображение')
            extension = '.jpg' if match[1] == 'jpeg' else '.' + match[1]
            return store(data, extension)
        if parsed.scheme or source.startswith('//'):
            raise ValueError('Загрузите изображение на сервер перед сохранением блока')
        relative = unquote(parsed.path).removeprefix('/articles/')
        if relative.startswith('/'):
            # Application-owned static images are stable across articles.
            if relative.startswith('/images/'):
                return source
            raise ValueError('Изображение должно быть загружено в статью')
        candidate = (Path(folder) / relative).resolve()
        if (not candidate.is_relative_to(Path(folder).resolve()) or not candidate.is_file() or
                candidate.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.gif', '.webp')):
            raise ValueError('Локальное изображение блока не найдено. Загрузите его на сервер.')
        return store(candidate.read_bytes(), candidate.suffix.lower())

    def store(data, extension):
        if len(data) > 12 * 1024 * 1024:
            raise ValueError('Изображение больше 12 МБ')
        name = hashlib.sha256(data).hexdigest() + extension
        target = Path(folder) / '_shared_assets' / name
        target.parent.mkdir(exist_ok=True)
        if not target.exists():
            atomic_write(target, data)
        return public_prefix + '_shared_assets/' + name

    for image in soup.select('img[src],source[src]'):
        image['src'] = freeze(image['src'])
    for node in soup.select('[href]'):
        source = node['href']
        if not urlparse(source).scheme and re.search(r'\.(?:jpg|jpeg|png|gif|webp)(?:\?.*)?$', source, re.I):
            node['href'] = freeze(source)
    for node in soup.select('[srcset]'):
        if 'data:' in node['srcset']:
            node.attrs.pop('srcset', None)
            if node.name == 'source' and not node.get('src'):
                node.decompose()
            continue
        sources = []
        for part in node['srcset'].split(','):
            parts = part.strip().split()
            if parts:
                sources.append(' '.join([freeze(parts[0]), *parts[1:]]))
        node['srcset'] = ', '.join(sources)
    for node in soup.select('[style]'):
        node['style'] = re.sub(r'url\(\s*([\'"]?)(.*?)\1\s*\)', lambda match: 'url("' + freeze(match[2]) + '")', node['style'], flags=re.I)
    return str(soup)


def save_block(folder, brand, payload, public_prefix='/articles/'):
    validate_brand(brand)
    if not isinstance(payload, dict):
        raise ValueError('Неверные данные блока')
    name = str(payload.get('name', '')).strip()
    if not name or len(name) > 120:
        raise ValueError('Название блока должно содержать от 1 до 120 символов')
    identifier = payload.get('id') or uuid.uuid4().hex
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise ValueError('Некорректный идентификатор блока')
    # Reject nested links before stripping editor metadata.
    raw = BeautifulSoup(str(payload.get('html', '')), 'html.parser')
    root = next((node for node in raw.contents if getattr(node, 'name', None)), None)
    if root and root.select('[data-shared-id]'):
        raise ValueError('Сначала отвяжите вложенные блоки')
    html = freeze_images(clean_fragment(payload.get('html')), folder, public_prefix)
    export_html = freeze_images(clean_fragment(payload.get('exportHtml')), folder, public_prefix)
    with closing(database(folder)) as connection, connection:
        connection.execute('BEGIN IMMEDIATE')
        row = connection.execute('SELECT record FROM blocks WHERE brand=? AND id=?', (brand, identifier)).fetchone()
        current = json.loads(row[0]) if row else None
        if (current and payload.get('expectedRevision') != current['revision'] or
                not current and (payload.get('id') or payload.get('expectedRevision'))):
            raise BlockConflict(current)
        record = dict(id=identifier, brand=brand, name=name, html=html, exportHtml=export_html,
                      revision=uuid.uuid4().hex, updatedAt=datetime.now(timezone.utc).isoformat())
        connection.execute('INSERT OR REPLACE INTO blocks VALUES(?,?,?)', (brand, identifier, json.dumps(record, ensure_ascii=False)))
        return record


def resolve_body(body, folder, brand, exporting=False):
    """Resolve on read/export without rewriting draft revisions or article history."""
    if 'data-shared-id' not in body:
        return body
    records = {record['id']: record for record in list_blocks(folder, brand)}
    soup = BeautifulSoup(body, 'html.parser')
    for node in list(soup.select('[data-shared-id]')):
        if node.get('data-shared-dirty') == 'true':
            if exporting:
                raise ValueError('В связанном блоке есть правки. Обновите общий блок или отвяжите его перед экспортом.')
            continue
        record = records.get(node.get('data-shared-id'))
        if not record:
            if exporting:
                raise ValueError('Оригинал связанного блока недоступен. Отвяжите сохранённую копию перед экспортом.')
            continue
        replacement = BeautifulSoup(record['exportHtml'] if exporting else record['html'], 'html.parser').find()
        instance = node.get('data-shared-instance') or uuid.uuid4().hex[:8]
        ids = {}
        for element in [replacement, *replacement.select('[id]')]:
            if not element.get('id'):
                continue
            old = element['id']
            new = node['id'] if element is replacement and node.get('id') else re.sub(r'--shared-[a-f0-9-]+$', '', old) + '--shared-' + instance
            ids[old] = new
            element['id'] = new
        for link in replacement.select('a[href^="#"]'):
            if link['href'][1:] in ids:
                link['href'] = '#' + ids[link['href'][1:]]
        if node.get('id'):
            replacement['id'] = node['id']
        if not exporting:
            replacement['data-shared-id'] = record['id']
            replacement['data-shared-revision'] = record['revision']
            replacement['data-shared-name'] = record['name']
            replacement['data-shared-instance'] = instance
        node.replace_with(replacement)
    return str(soup)
