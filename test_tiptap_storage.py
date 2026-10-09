import copy
import hashlib
import importlib
from pathlib import Path
import tempfile
import unittest
import app as core


class TiptapStorageTests(unittest.TestCase):
    def test_private_media_native_history_copy_and_legacy_conversion(self):
        previous=core.ARTICLES
        with tempfile.TemporaryDirectory() as directory:
            core.ARTICLES=Path(directory)
            try:
                server=importlib.reload(importlib.import_module('wsgi_app'))
                server.application.config['TESTING']=True
                admin=server.application.test_client()
                admin.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
                user=admin.post('/api/users',json={'name':'Tiptap author','login':'tiptap-author','password':'TiptapTest123'}).json
                author=server.application.test_client();author.post('/login',data={'login':user['login'],'password':'TiptapTest123'})
                image=(core.ROOT/'images/outmax.png').read_bytes();name=hashlib.sha256(image).hexdigest()+'.png'
                endpoint='/api/tiptap-assets/'+name
                self.assertEqual(author.post(endpoint,data=b'wrong').status_code,400)
                self.assertEqual(server.application.test_client().post(endpoint,data=image).status_code,401)
                src=author.post(endpoint,data=image,content_type='image/png').json['src']
                with author.get(src) as response:self.assertEqual(response.data,image)
                self.assertEqual(admin.get(src).status_code,404)
                native={'format':'brand-block-prototype-v2','brand':'hasl','document':{'type':'doc','content':[{'type':'paragraph','attrs':{'tag':'p','htmlAttrs':{}},'content':[{'type':'text','text':'Before'}]}]},'fileMeta':{'page':'article.html','css':['p{color:#123456}'],'resources':['photo.png']},'serverAssets':{'photo.png':src}}
                payload={'id':'native','brand':'hasl','title':'Before','body':'<p>Before</p><img src="'+src+'">','tiptap':native,'requestId':'first'}
                self.assertEqual(admin.post('/api/tiptap/save',json=payload).status_code,400)
                first=author.post('/api/tiptap/save',json=payload);self.assertEqual(first.status_code,200,first.json)
                self.assertEqual(author.post('/api/tiptap/save',json=payload).json,first.json)
                second_payload=copy.deepcopy(payload);second_payload['tiptap']['fileMeta']['css']=['p{color:#654321}'];second_payload.update(expectedRevision=first.json['revision'],requestId='second')
                second=author.post('/api/tiptap/save',json=second_payload);self.assertEqual(second.status_code,200)
                self.assertNotEqual(second.json['revision'],first.json['revision'])
                self.assertEqual(author.post('/api/tiptap/save',json={**payload,'requestId':'stale'}).status_code,409)
                restore=author.post('/api/draft/native/history/'+first.json['revision']+'/restore?brand=hasl',json={'expectedRevision':second.json['revision'],'requestId':'restore'})
                self.assertEqual(restore.status_code,200,restore.json)
                record=author.get('/api/draft/native?brand=hasl').json
                self.assertEqual(record['tiptap'],native)
                self.assertEqual(record['editorEngine'],'tiptap')
                copied=admin.post('/api/archive/'+user['id']+'/article/native/copy?brand=hasl')
                self.assertEqual(copied.status_code,200,copied.json)
                with admin.get(src) as response:self.assertEqual(response.data,image)
                self.assertEqual(admin.get('/api/draft/'+copied.json['id']+'?brand=hasl').json['tiptap'],native)
                for body in ('<script>alert(1)</script>','<p onclick="alert(1)">x</p>','<img src="javascript:alert(1)">'):
                    self.assertEqual(author.post('/api/tiptap/save',json={**payload,'id':'unsafe','body':body}).status_code,400)
                legacy=author.post('/api/save',json={'id':'native','brand':'hasl','title':'Legacy','body':'<p>Legacy edit</p>','automatic':True,'expectedRevision':restore.json['revision'],'requestId':'legacy'})
                self.assertEqual(legacy.status_code,200,legacy.json)
                self.assertIsNone(author.get('/api/draft/native?brand=hasl').json['tiptap'])
            finally:core.ARTICLES=previous


if __name__=='__main__':unittest.main()
