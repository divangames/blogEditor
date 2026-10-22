"""Serve a Wordstat QA package, isolated from production packages/accounts."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
kind = os.getenv('WORDSTAT_PACKAGE_KIND', 'python-hosting')
if kind not in ('python-hosting', 'docker', 'compatible'):
    raise ValueError('Unknown package kind')
package_root = Path(os.getenv('WORDSTAT_PACKAGE_ROOT', str(root / 'release' / 'wordstat-qa-packages'))).resolve()
if not package_root.is_relative_to((root / 'release').resolve()):
    raise ValueError('QA package root must be inside release')
package = package_root / ('outmax-editor-' + kind)
sys.path.insert(0, str(package))
os.environ['OUTMAX_USER'] = 'wiki-demo'
os.environ['OUTMAX_PASSWORD'] = 'wiki-local-demo-only'
import app as core
core.ARTICLES = package_root / ('state-' + kind)
core.ARTICLES.mkdir(parents=True, exist_ok=True)
import wsgi_app as server
import sqlite3
with sqlite3.connect(core.ARTICLES / '_accounts/users.sqlite3') as connection:
    connection.execute('UPDATE users SET name=? WHERE login=?', ('Демонстрационный аккаунт', 'wiki-demo'))
from waitress import serve
serve(server.application, host='127.0.0.1', port=int(os.getenv('WORDSTAT_PACKAGE_PORT', '8893')))
