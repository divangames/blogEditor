"""Проверяет опубликованную базу знаний штатной авторизацией публикации, не меняя серверные данные."""
import base64
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
credentials = json.loads((ROOT / 'release/.outmax-deploy-credentials.json').read_text(encoding='utf-8'))
token = base64.b64encode((credentials['user'] + ':' + credentials['password']).encode()).decode()
base = 'https://news.outmax-office.ru'


def get(path):
    """Получает опубликованный ресурс, не раскрывая авторизацию в выводе."""
    request = Request(base + path, headers={'Authorization': 'Basic ' + token, 'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=30) as response:
        assert response.status == 200
        return response.read(), response.headers.get_content_type()


body, mime = get('/instructions/')
assert mime == 'text/html'
html = body.decode('utf-8')
data = json.loads(re.search(r'<script id="wiki-data" type="application/json">(.*?)</script>', html, re.S).group(1))
assert len(data['articles']) == 34
assert data['changes'][0]['title'].endswith('Инструкции, поиск и общий ченжлог')
assert '__WIKI_' not in html
for article in data['articles']:
    if article.get('image'):
        image, mime = get('/instructions/screens/' + article['image'])
        assert mime == 'image/png' and image.startswith(b'\x89PNG\r\n\x1a\n')
for path in ('/', '/hasl/', '/email/', '/OUTMAX.html'):
    page, _ = get(path)
    assert 'Инструкции' in page.decode('utf-8'), path
page, _ = get('/tiptap/')
assert 'id="instructions-link" href="/instructions/"' in page.decode('utf-8')
print('PASS: рабочий домен, 34 руководства, актуальный ченжлог, PNG, меню OUTMAX / ХАСЛ / email / Tiptap.')
