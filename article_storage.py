"""Versioned, atomic JSON saves, coordinated across processes through SQLite.

JSON stays canonical for compatibility with existing archives and exporters.
SQLite serializes writers and journals request acknowledgements; it is not a
second independently editable document store.
"""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import re
import uuid
from contextlib import closing
from datetime import datetime, timezone
from bs4 import BeautifulSoup


class SaveConflict(ValueError):
    def __init__(self, current=None):
        super().__init__('Статья изменилась в другой вкладке. Локальные правки сохранены; откройте серверную версию или сохраните копию.')
        self.current = current


def read_document(file):
    file = Path(file)
    if not file.is_file():
        return None
    raw = file.read_bytes()
    record = json.loads(raw)
    record.setdefault('revision', hashlib.sha256(raw).hexdigest())
    record.setdefault('documentId', str(uuid.uuid5(uuid.NAMESPACE_URL, file.parent.name + '/' + file.name)))
    return record


def atomic_write(file, data):
    file = Path(file)
    fd, temporary = tempfile.mkstemp(prefix='.' + file.name, suffix='.tmp', dir=file.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def archive_snapshot(file, record):
    """Immutable revision and available local media, written before replacement."""
    file = Path(file)
    if not all(re.fullmatch(r'[A-Za-z0-9_-]{1,100}',str(record[key])) for key in ('documentId','revision')):
        raise ValueError('Некорректный идентификатор истории')
    target = file.parent / '_article_history' / record['documentId'] / record['revision']
    snapshot = target / 'snapshot.json'
    if snapshot.is_file():
        return
    target.mkdir(parents=True, exist_ok=True)
    saved = json.loads(json.dumps(record))
    replacements = {}
    warnings = set()
    soup = BeautifulSoup(saved.get('body',''), 'html.parser')
    sources = {img.get('src','') for img in soup.select('img[src]')}
    for product in saved.get('products', []):
        sources.update(src for src in product.get('images',[]) if isinstance(src,str))
    for source in sources:
        relative = source.removeprefix('/articles/').removeprefix('articles/')
        if relative.startswith('data:'):
            continue
        candidate = (file.parent / relative).resolve()
        if (relative.startswith(('http:','https:','blob:','/')) or
                not candidate.is_relative_to(file.parent.resolve()) or not candidate.is_file() or
                candidate.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif')):
            warnings.add(source)
            continue
        content = candidate.read_bytes()
        if len(content) > 12*1024*1024:
            warnings.add(source)
            continue
        name = hashlib.sha256(content).hexdigest() + candidate.suffix.lower()
        assets = target.parent / 'assets'; assets.mkdir(exist_ok=True)
        if not (assets/name).exists():atomic_write(assets/name, content)
        replacements[source] = (assets/name).relative_to(file.parent).as_posix()
    for img in soup.select('img[src]'):
        if img['src'] in replacements:img['src'] = replacements[img['src']]
    saved['body'] = str(soup)
    for product in saved.get('products',[]):
        if 'images' in product:product['images'] = [replacements.get(src,src) for src in product.get('images',[])]
    saved['unfrozenImages'] = sorted(warnings)
    atomic_write(snapshot, json.dumps(saved,ensure_ascii=False).encode('utf-8'))


def document_history(file, limit=100, before=None):
    current = read_document(file)
    if not current:raise FileNotFoundError('Статья не найдена')
    root = Path(file).parent / '_article_history' / current['documentId']
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',str(current['documentId'])):raise ValueError('Некорректный идентификатор истории')
    items=[];seen=set();record=current;found=before is None
    while record and record['revision'] not in seen:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',str(record['revision'])):raise ValueError('Некорректная версия истории')
        revision=record['revision'];seen.add(revision)
        if found:
            snapshot=root/revision/'snapshot.json'
            frozen=json.loads(snapshot.read_text(encoding='utf-8')) if snapshot.is_file() else record
            items.append({key:frozen.get(key) for key in ('revision','savedAt','savedBy','title','saveKind','restoredFrom','unfrozenImages')})
            if len(items)==limit:break
        elif revision==before:found=True
        previous=record.get('previousRevision')
        if previous and not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',str(previous)):raise ValueError('Некорректная версия истории')
        source=root/str(previous)/'snapshot.json'
        record=json.loads(source.read_text(encoding='utf-8')) if previous and source.is_file() else None
    return {'documentId':current['documentId'],'currentRevision':current['revision'],'items':items,
            'nextBefore':items[-1]['revision'] if record and record.get('previousRevision') and len(items)==limit else None}


def history_revision(file, revision):
    # Only reachable revisions belong to this document; orphaned crash snapshots are hidden.
    cursor=None
    while True:
        page=document_history(file,100,cursor)
        if any(item['revision']==revision for item in page['items']):break
        cursor=page['nextBefore']
        if not cursor:raise FileNotFoundError('Версия не найдена')
    current=read_document(file)
    snapshot=Path(file).parent/'_article_history'/current['documentId']/revision/'snapshot.json'
    return json.loads(snapshot.read_text(encoding='utf-8')) if snapshot.is_file() else current


def restored_content(file, revision):
    saved=history_revision(file,revision)
    body=BeautifulSoup(saved.get('body',''),'html.parser');replacements={}
    sources={img.get('src','') for img in body.select('img[src]')}
    for product in saved.get('products',[]):sources.update(product.get('images',[]))
    for source in sources:
        if not source.startswith('_article_history/'):continue
        candidate=(Path(file).parent/source).resolve()
        if not candidate.is_relative_to(Path(file).parent.resolve()) or not candidate.is_file():
            raise ValueError('Изображение версии недоступно; восстановление отменено')
        folder=Path(file).parent/(Path(file).stem+'_files');folder.mkdir(exist_ok=True)
        destination=folder/('history-'+candidate.name)
        if not destination.exists():atomic_write(destination,candidate.read_bytes())
        replacements[source]=destination.relative_to(Path(file).parent).as_posix()
    for image in body.select('img[src]'):image['src']=replacements.get(image['src'],image['src'])
    products=json.loads(json.dumps(saved.get('products',[])))
    for product in products:product['images']=[replacements.get(src,src) for src in product.get('images',[])]
    return {'id':saved['id'],'brand':saved.get('brand','outmax'),'title':saved.get('title','Статья'),
            'body':str(body),'products':products,'restoredFrom':revision}


def save_document(file, payload, record, render):
    """CAS plus request replay. Network/asset work must happen before this call."""
    file = Path(file)
    request_id = payload.get('requestId')
    if request_id is not None and (not isinstance(request_id, str) or not 1 <= len(request_id) <= 100):
        raise ValueError('Некорректный requestId')
    expected = payload.get('expectedRevision')
    if expected is not None and (not isinstance(expected, str) or len(expected) > 100):
        raise ValueError('Некорректная версия документа')
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    with closing(sqlite3.connect(file.parent / '_article_saves.sqlite3', timeout=30)) as connection, connection:
        connection.execute('CREATE TABLE IF NOT EXISTS saves (name TEXT, request TEXT, fingerprint TEXT, result TEXT, PRIMARY KEY(name,request))')
        connection.execute('BEGIN IMMEDIATE')
        current = read_document(file)
        previous = connection.execute('SELECT fingerprint,result FROM saves WHERE name=? AND request=?', (file.name, request_id)).fetchone() if request_id else None
        if previous:
            result = json.loads(previous[1])
            if previous[0] != fingerprint:
                raise ValueError('requestId уже использован для другого содержимого')
            if not current or current['documentId'] != result['documentId']:
                raise SaveConflict(current)
            return result
        # Recover a committed JSON write if the process died before journal commit.
        if current and request_id and current.get('_saveRequest') == request_id:
            if current.get('_saveFingerprint') != fingerprint:
                raise ValueError('requestId уже использован для другого содержимого')
            atomic_write(file.with_suffix('.html'), render(current).encode('utf-8'))
            archive_snapshot(file,current)
            result = acknowledgement(current)
        else:
            if current and (expected != current['revision'] or
                            payload.get('documentId') not in (None, current['documentId'])):
                raise SaveConflict(current)
            if not current and expected is not None:
                raise SaveConflict(None)
            if current and all(current.get(key) == value for key, value in record.items()
                               if key not in ('savedAt', 'createdAt', 'savedBy', 'saveKind')):
                cached = file.with_suffix('.html')
                rendered = render(current).encode('utf-8')
                if not cached.is_file() or cached.read_bytes() != rendered:
                    atomic_write(cached, rendered)
                result = acknowledgement(current)
                if request_id:
                    connection.execute('INSERT INTO saves VALUES(?,?,?,?)', (file.name, request_id, fingerprint, json.dumps(result)))
                return result
            now = datetime.now(timezone.utc).isoformat()
            if current:archive_snapshot(file,current)
            record = {**record, 'createdAt': (current or {}).get('createdAt') or (current or {}).get('savedAt') or now,
                      'savedAt': now, 'documentId': (current or {}).get('documentId') or str(uuid.uuid4()),
                      'revision': uuid.uuid4().hex, '_saveRequest': request_id, '_saveFingerprint': fingerprint}
            if current:record['previousRevision']=current['revision']
            html = render(record).encode('utf-8')
            archive_snapshot(file,record)
            atomic_write(file, json.dumps(record, ensure_ascii=False, indent=2).encode('utf-8'))
            # HTML is a derived cache; a retry repairs it after an interrupted write.
            atomic_write(file.with_suffix('.html'), html)
            result = acknowledgement(record)
        if request_id:
            connection.execute('INSERT INTO saves VALUES(?,?,?,?)', (file.name, request_id, fingerprint, json.dumps(result)))
        return result


def acknowledgement(record):
    return {key: record[key] for key in ('id', 'documentId', 'revision', 'savedAt')}
