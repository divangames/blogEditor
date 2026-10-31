"""Проверяет опубликованную базу знаний штатной авторизацией публикации, не меняя серверные данные."""
import base64
import json
from pathlib import Path
import re
import io
import sys
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from http.client import IncompleteRead

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_instructions import changelog_entries
credentials = json.loads((ROOT / 'release/.outmax-deploy-credentials.json').read_text(encoding='utf-8'))
token = base64.b64encode((credentials['user'] + ':' + credentials['password']).encode()).decode()
base = 'https://news.outmax-office.ru'


def get(path):
    """Получает опубликованный ресурс, не раскрывая авторизацию в выводе."""
    request = Request(base + path, headers={'Authorization': 'Basic ' + token, 'Cache-Control': 'no-cache'})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=60) as response:
                assert response.status == 200
                return response.read(), response.headers.get_content_type()
        except HTTPError:
            raise
        except (TimeoutError, URLError, IncompleteRead, ConnectionResetError):
            if attempt:
                raise RuntimeError('Не удалось полностью загрузить ' + path) from None
            print('Повтор загрузки: ' + path, flush=True)


body, mime = get('/instructions/')
assert mime == 'text/html'
html = body.decode('utf-8')
data = json.loads(re.search(r'<script id="wiki-data" type="application/json">(.*?)</script>', html, re.S).group(1))
assert len(data['articles']) == len(json.loads((ROOT / 'instructions/articles.json').read_text(encoding='utf-8'))['articles'])
assert data['articles'] == json.loads((ROOT / 'instructions/articles.json').read_text(encoding='utf-8'))['articles'], 'Published guides differ from checked source'
expected = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8').splitlines()[0].removeprefix('## ')
assert data['changes'][0]['title'] == expected
assert data['changes'] == changelog_entries(), 'Published changelog differs from checked source'
assert '__WIKI_' not in html
images = {article['image'] for article in data['articles'] if article.get('image')}
images.update(step['image'] for article in data['articles'] for step in article.get('stepImages', {}).values() if step.get('image'))
images.update(image['image'] for change in data['changes'] for image in change['images'])
def check_image(name):
    image, mime = get('/instructions/screens/' + name)
    assert mime in ('image/png', 'image/webp'), (name, mime)
    with Image.open(io.BytesIO(image)) as actual, Image.open(ROOT / 'instructions/screens' / name) as source:
        original_size = source.size
        source.thumbnail((1152, 2000), Image.Resampling.LANCZOS)
        assert actual.size in (source.size, original_size), name
        actual.verify()
with ThreadPoolExecutor(max_workers=6) as workers:
    list(workers.map(check_image, sorted(images)))
for path in ('/', '/hasl/', '/email/', '/OUTMAX.html'):
    page, _ = get(path)
    assert 'Инструкции' in page.decode('utf-8'), path
page, _ = get('/tiptap/')
assert 'id="instructions-link" href="/instructions/"' in page.decode('utf-8')
print('PASS: live guides/changelog match source, all guide/changelog images decode as PNG/WebP, editor navigation.')
