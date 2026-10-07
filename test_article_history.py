import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import app as core
import article_storage as storage


class HistoryTests(unittest.TestCase):
    def test_snapshots_restore_and_local_image_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);file=root/'article.json';assets=root/'article_files';assets.mkdir()
            image=assets/'photo.png';image.write_bytes(b'original-image')
            original={'id':'article','brand':'outmax','title':'Original','body':'<p>Old</p><img src="article_files/photo.png">','products':[{'sku':'1','images':['article_files/photo.png'],'price':50}]}
            first=storage.save_document(file,{'requestId':'first'},original,lambda r:r['body'])
            image.write_bytes(b'replaced-image')
            second=storage.save_document(file,{'requestId':'second','expectedRevision':first['revision']},{**original,'title':'Changed','body':'<p>New</p>'},lambda r:r['body'])
            page=storage.document_history(file)
            self.assertEqual([item['revision'] for item in page['items']],[second['revision'],first['revision']])
            old=storage.history_revision(file,first['revision'])
            frozen=core.BeautifulSoup(old['body'],'html.parser').img['src']
            self.assertEqual((root/frozen).read_bytes(),b'original-image')
            restored=storage.restored_content(file,first['revision'])
            image_src=core.BeautifulSoup(restored['body'],'html.parser').img['src']
            self.assertEqual((root/image_src).read_bytes(),b'original-image')
            payload={'requestId':'restore','expectedRevision':second['revision']}
            third=storage.save_document(file,payload,restored,lambda r:r['body'])
            self.assertNotIn(third['revision'],[first['revision'],second['revision']])
            self.assertEqual(storage.read_document(file)['title'],'Original')
            self.assertEqual(storage.read_document(file)['products'][0]['price'],50)
            self.assertEqual(len(storage.document_history(file)['items']),3)
            self.assertEqual(storage.save_document(file,payload,restored,lambda r:r['body']),third)
            with self.assertRaises(storage.SaveConflict):storage.save_document(file,{'requestId':'stale','expectedRevision':second['revision']},restored,lambda r:r['body'])
            with self.assertRaises(FileNotFoundError):storage.history_revision(file,'unknown')

    def test_orphan_snapshot_hidden_and_pagination(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'a.json';first=storage.save_document(file,{}, {'id':'a','body':'first'},lambda r:r['body'])
            replace=storage.atomic_write
            def fail(file_path,data):
                if file_path==file:raise OSError('crash')
                replace(file_path,data)
            with patch.object(storage,'atomic_write',side_effect=fail):
                with self.assertRaises(OSError):storage.save_document(file,{'expectedRevision':first['revision']},{'id':'a','body':'orphan'},lambda r:r['body'])
            self.assertEqual(len(storage.document_history(file)['items']),1)
            second=storage.save_document(file,{'expectedRevision':first['revision']},{'id':'a','body':'second'},lambda r:r['body'])
            page=storage.document_history(file,limit=1)
            self.assertEqual(page['items'][0]['revision'],second['revision'])
            self.assertEqual(storage.document_history(file,limit=1,before=page['nextBefore'])['items'][0]['revision'],first['revision'])

    def test_api_access_brand_isolation_restore_and_export(self):
        original=core.ARTICLES
        with tempfile.TemporaryDirectory() as directory:
            core.ARTICLES=Path(directory)
            try:
                server=importlib.reload(importlib.import_module('wsgi_app'));server.application.config['TESTING']=True
                admin=server.application.test_client();admin.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
                user=admin.post('/api/users',json={'name':'History author','login':'history-author','password':'HistoryTest123'}).json
                author=server.application.test_client();author.post('/login',data={'login':user['login'],'password':'HistoryTest123'})
                payload={'id':'history','brand':'hasl','title':'Before','body':'<h1>Before</h1>','products':[],'automatic':True,'requestId':'first'}
                first=author.post('/api/save',json=payload).json
                second=author.post('/api/save',json={**payload,'title':'After','body':'<h1>After</h1>','expectedRevision':first['revision'],'requestId':'second'}).json
                history='/api/draft/history/history'
                self.assertEqual(admin.get(history+'?brand=hasl').status_code,404)
                self.assertEqual(author.get(history).status_code,404)
                self.assertEqual(server.application.test_client().get(history+'?brand=hasl').status_code,401)
                versions=author.get(history+'?brand=hasl').json['items'];self.assertEqual(len(versions),2)
                self.assertEqual(versions[0]['savedBy']['name'],'History author')
                restore=history+'/'+first['revision']+'/restore?brand=hasl'
                self.assertEqual(author.post(restore,json={'expectedRevision':first['revision'],'requestId':'stale'}).status_code,409)
                restored=author.post(restore,json={'expectedRevision':second['revision'],'requestId':'restore'})
                self.assertEqual(restored.status_code,200)
                self.assertEqual(author.get('/api/draft/history?brand=hasl').json['title'],'Before')
                export=author.get('/api/export/history?brand=hasl&format=html&site=ru',buffered=True)
                self.assertEqual(export.status_code,200);self.assertIn(b'Before',export.data);export.close()
                self.assertEqual(len(author.get(history+'?brand=hasl').json['items']),3)
            finally:core.ARTICLES=original


if __name__=='__main__':unittest.main()
