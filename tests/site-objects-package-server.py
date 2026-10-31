"""Serve only an explicitly supplied QA package on loopback with a demonstration account."""
import os
import sqlite3
import sys
from pathlib import Path

package=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(package))
os.environ['OUTMAX_USER']='wiki-demo'
os.environ['OUTMAX_PASSWORD']='wiki-local-demo-only'
if not (package/'shared_blocks.py').exists():
    bootstrap=(package/'wsgi_app.py').read_text(encoding='utf-8').split('\nimport app as core',1)[0]
    exec(compile(bootstrap,str(package/'wsgi_app.py'),'exec'),{'__file__':str(package/'wsgi_app.py')})
import app as core
core.ARTICLES=package.parent/('qa-state-'+package.name)
core.ARTICLES.mkdir(parents=True,exist_ok=True)
import wsgi_app as web
with sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3') as connection:
    connection.execute('UPDATE users SET name=? WHERE login=?',('Демонстрационный аккаунт','wiki-demo'))
from waitress import serve
serve(web.application,host='127.0.0.1',port=int(sys.argv[2]))
