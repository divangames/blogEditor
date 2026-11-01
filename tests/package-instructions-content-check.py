"""Compare packaged instruction data with the checked source before publishing."""
import json
import os
from pathlib import Path
import re
import sys
from urllib.request import build_opener, HTTPCookieProcessor
from urllib.parse import urlencode
from http.cookiejar import CookieJar

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_instructions import changelog_entries

base = os.environ['WIKI_TEST_BASE']
assert re.fullmatch(r'http://127\.0\.0\.1:\d+', base), 'Isolated packages only'
opener = build_opener(HTTPCookieProcessor(CookieJar()))
opener.open(base + '/login', urlencode({'login': 'wiki-demo', 'password': 'wiki-local-demo-only'}).encode(), timeout=20).close()
with opener.open(base + '/instructions/', timeout=20) as response:
    html = response.read().decode('utf-8')
data = json.loads(re.search(r'<script id="wiki-data" type="application/json">(.*?)</script>', html, re.S).group(1))
assert data['articles'] == json.loads((ROOT / 'instructions/articles.json').read_text(encoding='utf-8'))['articles']
assert data['changes'] == changelog_entries(), 'Packaged changelog differs from source'
print('PASS exact packaged guides/changelog match source')
