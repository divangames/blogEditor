"""A deployed QA package must delete text without reading unrelated metadata."""
from pathlib import Path
import re
import sys
import time
import uuid
import requests

root = Path(__file__).resolve().parent.parent
base, state = sys.argv[1], Path(sys.argv[2]).resolve()
assert re.fullmatch(r'http://127\.0\.0\.1:\d+', base)
assert state.is_relative_to((root / 'release').resolve())
admin = requests.Session()
admin.headers['Origin'] = base
admin.post(base + '/login', data={'login': 'wiki-demo', 'password': 'wiki-local-demo-only'}, timeout=30).raise_for_status()
users = []
broken = None
try:
    for index in range(2):
        login = 'cleanup-package-' + uuid.uuid4().hex
        response = admin.post(base + '/editor-api/users', json={'login': login, 'name': 'Demo package', 'role': 'editor', 'password': 'PackagePassword1'}, timeout=30)
        assert response.status_code == 201
        user = response.json()
        assert re.fullmatch(r'user-[a-f0-9]{24}', user['id'])
        users.append(user)
    broken = state / 'users' / users[1]['id'] / 'foreign-broken.json'
    assert broken.parent.is_dir(), 'Wrong isolated package storage'
    broken.write_text('{unrelated broken metadata', encoding='utf-8')
    own = requests.Session()
    own.headers['Origin'] = base
    own.post(base + '/login', data={'login': users[0]['login'], 'password': 'PackagePassword1'}, timeout=30).raise_for_status()
    response = own.post(base + '/editor-api/save', json={'id': 'plain-text', 'title': 'Demo text', 'body': '<p>No images</p>', 'products': []}, timeout=30)
    assert response.status_code == 200
    started = time.monotonic()
    response = own.delete(base + '/editor-api/draft/plain-text?brand=outmax', timeout=30)
    assert response.status_code == 200, response.status_code
    assert own.get(base + '/editor-api/draft/plain-text?brand=outmax', timeout=30).status_code == 404
    response = admin.delete(base + '/editor-api/users/' + users[0]['id'], json={'confirmLogin': users[0]['login']}, timeout=30)
    assert response.status_code == 200, response.status_code
    assert broken.read_text(encoding='utf-8') == '{unrelated broken metadata'
    print('PASS package article/account deletion ignores foreign broken metadata:', round(time.monotonic() - started, 3), 'seconds')
finally:
    if broken:
        broken.unlink(missing_ok=True)
    for user in users:
        response = admin.delete(base + '/editor-api/users/' + user['id'], json={'confirmLogin': user['login']}, timeout=30)
        assert response.status_code == 200
