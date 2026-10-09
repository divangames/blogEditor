"""Собирает базу знаний и общий ченжлог в самостоятельную страницу инструкций."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def build():
    """Возвращает HTML с актуальными материалами и историей изменений проекта."""
    folder = ROOT / 'instructions'
    data = json.loads((folder / 'articles.json').read_text(encoding='utf-8'))
    changes = []
    for section in re.split(r'^## ', (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8'), flags=re.M)[1:]:
        lines = section.strip().splitlines()
        changes.append(dict(title=lines[0], items=[re.sub(r'[`*]', '', line[2:]) for line in lines[1:] if line.startswith('- ')]))
    data['changes'] = changes
    source = (folder / 'index.html').read_text(encoding='utf-8')
    source = source.replace('__WIKI_CSS__', (folder / 'wiki.css').read_text(encoding='utf-8'))
    source = source.replace('__WIKI_JS__', (folder / 'wiki.js').read_text(encoding='utf-8').replace('</script', '<\\/script'))
    return source.replace('__WIKI_DATA__', json.dumps(data, ensure_ascii=False).replace('<', '\\u003c'))


if __name__ == '__main__':
    target = ROOT / 'release' / 'instructions.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(build(), encoding='utf-8')
    print('База знаний собрана.')
