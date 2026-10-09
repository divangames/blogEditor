"""Изолированный локальный стенд базы знаний с демонстрационным аккаунтом без серверных секретов."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ['OUTMAX_USER'] = 'wiki-demo'
os.environ['OUTMAX_PASSWORD'] = 'wiki-local-demo-only'
import app as core
core.ARTICLES = core.ROOT / 'release' / 'instructions-check' / 'state'
core.ARTICLES.mkdir(parents=True, exist_ok=True)
import base64
import json
import sqlite3
import zipfile
import wsgi_app as web
web.TIPTAP_BUNDLE = base64.b64encode((core.ROOT / 'release/tiptap-prototype/server.zip').read_bytes()).decode('ascii')
manifest = web.tiptap_media_manifest()
with zipfile.ZipFile(core.ROOT / 'release/tiptap-prototype/media.zip') as archive:
    for name, item in manifest.items():
        (web.tiptap_media_folder() / (item['sha256'] + '.bin')).write_bytes(archive.read(name))
with sqlite3.connect(core.ARTICLES / '_accounts' / 'users.sqlite3') as connection:
    connection.execute('UPDATE users SET name=? WHERE login=?', ('Демонстрационный аккаунт', 'wiki-demo'))
application = web.application
from waitress import serve

serve(application, host='127.0.0.1', port=8878)
