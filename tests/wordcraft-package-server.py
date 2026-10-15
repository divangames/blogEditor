"""Run the built VPS package against a separate demo account and storage."""
import os
import sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
package = root / 'release/outmax-editor-python-hosting'
sys.path.insert(0, str(package))
os.environ['OUTMAX_USER'] = 'wiki-demo'
os.environ['OUTMAX_PASSWORD'] = 'wiki-local-demo-only'
import app as core
core.ARTICLES = root / 'release/wordcraft-package-check/state'
core.ARTICLES.mkdir(parents=True, exist_ok=True)
import wsgi_app as server
import sqlite3
with sqlite3.connect(core.ARTICLES / '_accounts/users.sqlite3') as connection:
    connection.execute('UPDATE users SET name=? WHERE login=?', ('Демонстрационный аккаунт', 'wiki-demo'))
from waitress import serve
serve(server.application, host='127.0.0.1', port=8879)
