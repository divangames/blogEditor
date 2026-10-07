"""Backup integrity, unsafe archive refusal and full isolated restore drill."""
import importlib
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import app as core
import article_storage as storage
import backup_project as backup


class BackupTests(unittest.TestCase):
    def test_roundtrip_and_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);project=root/'source';project.mkdir();(project/'articles').mkdir()
            (project/'README.md').write_text('Portable project');(project/'articles/media.png').write_bytes(b'media')
            (project/'articles/Thumbs.db').write_bytes(b'not a SQLite database')
            with closing(sqlite3.connect(project/'articles/users.sqlite3')) as connection, connection:
                connection.execute('CREATE TABLE sample (value TEXT)');connection.execute('INSERT INTO sample VALUES(?)',('persisted',))
            archive=root/'backup.zip';result=backup.create_backup(project,archive)
            self.assertGreater(result['files'],0);self.assertTrue(backup.verify_backup(archive)['verified'])
            restored=root/'restored';backup.restore_backup(archive,restored)
            self.assertEqual((restored/'articles/media.png').read_bytes(),b'media')
            with closing(sqlite3.connect(restored/'articles/users.sqlite3')) as connection:self.assertEqual(connection.execute('SELECT value FROM sample').fetchone()[0],'persisted')
            with self.assertRaises(FileExistsError):backup.restore_backup(archive,project)
            with self.assertRaises(FileExistsError):backup.create_backup(project,archive)

    def test_corruption_and_unsafe_paths_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);project=root/'source';project.mkdir();(project/'articles').mkdir();(project/'articles/a.json').write_text('{}')
            original=root/'original.zip';backup.create_backup(project,original)
            corrupt=root/'corrupt.zip'
            with zipfile.ZipFile(original) as source,zipfile.ZipFile(corrupt,'w') as target:
                for name in source.namelist():target.writestr(name,b'changed' if name=='articles/a.json' else source.read(name))
            with self.assertRaises(ValueError):backup.verify_backup(corrupt)
            unsafe=root/'unsafe.zip'
            with zipfile.ZipFile(unsafe,'w') as archive:archive.writestr('../outside.txt','unsafe')
            with self.assertRaises(ValueError):backup.restore_backup(unsafe,root/'never-created')
            self.assertFalse((root/'never-created').exists());self.assertFalse((root/'outside.txt').exists())

    def test_changing_source_aborts_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'articles').mkdir();(root/'articles/a.json').write_text('{}')
            real_inventory=backup.inventory;calls=0
            def changing(files):
                nonlocal calls
                calls+=1
                if calls==2:(root/'articles/a.json').write_text('{"changed":true}')
                return real_inventory(files)
            with patch.object(backup,'inventory',side_effect=changing):
                with self.assertRaises(RuntimeError):backup.create_backup(root,root/'backup.zip')
            self.assertFalse((root/'backup.zip').exists())

    def test_restored_accounts_history_feedback_and_export(self):
        original_articles=core.ARTICLES
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);project=root/'source';project.mkdir();(project/'articles').mkdir()
            (project/'app.py').write_text('# fixture runtime')
            core.ARTICLES=project/'articles'
            try:
                server=importlib.reload(importlib.import_module('wsgi_app'));server.application.config['TESTING']=True
                admin=server.application.test_client();admin.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
                created=admin.post('/api/users',json={'name':'Backup author','login':'backup-author','password':'BackupTest123'}).json
                author=server.application.test_client();author.post('/login',data={'login':created['login'],'password':'BackupTest123'})
                assets=core.ARTICLES/'users'/created['id']/'drill_files';assets.mkdir();(assets/'photo.png').write_bytes(b'original-photo')
                first=author.post('/api/save',json={'id':'drill','title':'Original','body':'<h1>Original</h1><p>Text</p><img src="drill_files/photo.png">','automatic':True,'requestId':'first'}).json
                second=author.post('/api/save',json={'id':'drill','title':'Updated','body':'<h1>Updated</h1><p>New text</p>','expectedRevision':first['revision'],'automatic':True,'requestId':'second'}).json
                token=author.post('/api/preview/drill').json['url'].strip('/').split('/')[-1]
                note=author.post('/api/preview-feedback/'+token,json={'anchor':{'quote':'New text','selector':'body > p:nth-of-type(1)','kind':'text','x':.5,'y':.5},'text':'Preserve discussion'});
                self.assertEqual(note.status_code,201)
                key=(project/'articles/_accounts/key').read_bytes()
                archive=root/'complete.zip';backup.create_backup(project,archive);restored=root/'restored';backup.restore_backup(archive,restored)
                core.ARTICLES=restored/'articles'
                rebuilt=importlib.reload(server);rebuilt.application.config['TESTING']=True
                fresh=rebuilt.application.test_client();self.assertEqual(fresh.post('/login',data={'login':'backup-author','password':'BackupTest123'}).status_code,302)
                self.assertEqual((core.ARTICLES/'_accounts/key').read_bytes(),key)
                history=fresh.get('/api/draft/drill/history').json
                self.assertEqual(len(history['items']),2);self.assertEqual(history['currentRevision'],second['revision'])
                self.assertEqual(fresh.get('/api/preview-feedback/'+token).json['items'][0]['text'],'Preserve discussion')
                response=fresh.post('/api/draft/drill/history/'+first['revision']+'/restore',json={'expectedRevision':second['revision'],'requestId':'restored'})
                self.assertEqual(response.status_code,200)
                doc=fresh.get('/api/draft/drill').json;image=core.BeautifulSoup(doc['body'],'html.parser').img['src']
                self.assertEqual((core.ARTICLES/'users'/created['id']/image).read_bytes(),b'original-photo')
                export=fresh.get('/api/export/drill?format=zip',buffered=True);self.assertEqual(export.status_code,200);export.close()
                self.assertEqual(len(fresh.get('/api/draft/drill/history').json['items']),3)
            finally:core.ARTICLES=original_articles


if __name__=='__main__':unittest.main()
