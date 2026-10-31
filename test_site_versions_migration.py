"""Run separately: preserve the only existing legacy snapshot on startup."""
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest

class LegacyVersionsTest(unittest.TestCase):
    def test_existing_project_and_repeat_startup(self):
        import app as core
        with tempfile.TemporaryDirectory(prefix='hasl-versions-migration-') as folder:
            core.ARTICLES=Path(folder)
            database=core.ARTICLES/'_accounts/site-projects.sqlite3'
            database.parent.mkdir()
            body=json.dumps({'title':'Legacy snapshot','layout':[]})
            with sqlite3.connect(database) as db:
                db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY,owner TEXT,revision INTEGER,title TEXT,body TEXT,updated TEXT)')
                db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?)',('legacy','owner',7,'Legacy snapshot',body,'2026-10-20T00:00:00+00:00'))
            db.close()
            os.environ['OUTMAX_USER']='migration-demo'
            os.environ['OUTMAX_PASSWORD']='migration-demo-only'
            import wsgi_app
            from flask import Flask
            from site_builder import install_site_builder
            install_site_builder(Flask('repeat-migration'),core)
            with sqlite3.connect(database) as db:
                self.assertEqual(db.execute('SELECT revision,body FROM projects').fetchone(),(7,body))
                rows=db.execute('SELECT revision,body,kind FROM project_versions').fetchall()
                self.assertEqual(rows,[(7,body,'migration')])
            db.close()

if __name__=='__main__':unittest.main()
