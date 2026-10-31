"""Собирает базу знаний и общий ченжлог в самостоятельную страницу инструкций."""
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def changelog_items(lines):
    """Keep both historical prose and categorized lists visible and searchable."""
    items, paragraph = [], []
    category, fenced = '', False

    def add(text):
        text = re.sub(r'[`*]', '', text).strip()
        if text:
            items.append((category + ': ' if category else '') + text)

    def flush():
        if paragraph:
            add(' '.join(paragraph))
            paragraph.clear()

    for raw in lines:
        line = raw.strip()
        if line.startswith('```'):
            flush()
            fenced = not fenced
            continue
        if fenced:
            continue
        heading = re.fullmatch(r'###\s+(Добавлено|Изменено|Исправлено)\s*:?', line)
        if heading:
            flush()
            category = heading[1]
        elif not line or line.startswith(('![', '#')) or line == '---':
            flush()
        elif re.match(r'^[-*]\s+', line):
            flush()
            add(re.sub(r'^[-*]\s+', '', line))
        else:
            paragraph.append(line)
    flush()
    return items


def changelog_entries():
    """Читает единственный ченжлог и проверяет локальные снимки записей."""
    changes = []
    for section in re.split(r'^## ', (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8'), flags=re.M)[1:]:
        lines = section.strip().splitlines()
        images = []
        for line in lines[1:]:
            match = re.fullmatch(r'!\[([^\]]+)\]\(instructions/screens/([a-zA-Z0-9][a-zA-Z0-9_.-]*\.png)\)', line.strip())
            if line.lstrip().startswith('!['):
                if not match or not (ROOT / 'instructions/screens' / match[2]).is_file():
                    raise ValueError('Invalid or missing changelog screenshot: ' + line)
                images.append(dict(image=match[2], caption=match[1]))
        dated = re.fullmatch(r'(?:(Версия[^—]+)\s*—\s*)?(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\s*[—–-]\s*(.+)', lines[0])
        day = datetime.strptime(dated[2], '%d.%m.%Y' if '.' in dated[2] else '%Y-%m-%d').date().isoformat() if dated else ''
        title = ((dated[1].strip() + ' — ') if dated and dated[1] else '') + dated[3] if dated else lines[0]
        changes.append(dict(title=lines[0], date=day,
                            heading=title, images=images,
                            items=changelog_items(lines[1:])))
    return changes


def build():
    """Возвращает HTML с актуальными материалами и историей изменений проекта."""
    folder = ROOT / 'instructions'
    data = json.loads((folder / 'articles.json').read_text(encoding='utf-8'))
    data['changes'] = changelog_entries()
    source = (folder / 'index.html').read_text(encoding='utf-8')
    source = source.replace('__WIKI_CSS__', (folder / 'wiki.css').read_text(encoding='utf-8') + '\n' + (ROOT / 'ui-chrome.css').read_text(encoding='utf-8'))
    source = source.replace('__WIKI_JS__', (folder / 'wiki.js').read_text(encoding='utf-8').replace('</script', '<\\/script'))
    source = source.replace('</body>', '<script>' + (ROOT / 'ui-chrome.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '</script></body>')
    return source.replace('__WIKI_DATA__', json.dumps(data, ensure_ascii=False).replace('<', '\\u003c'))


if __name__ == '__main__':
    target = ROOT / 'release' / 'instructions.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(build(), encoding='utf-8')
    print('База знаний собрана.')
