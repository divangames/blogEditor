import unittest,tempfile,importlib
from pathlib import Path
from unittest.mock import patch
import notisend_client as n
import app as core

class ArchiveTests(unittest.TestCase):
 def test_pagination_and_compact_markup(self):
  raw={"total_count":1604,"total_pages":65,"page_number":65,"collection":[
   dict(id=1,from_name="OUTMAX",subject="Theme",html='<img src="javascript:bad"><img width="600" src="https://cdn.example.com/hero.png">',statistics={"delivered":100,"uniq_open":25}),
   dict(id=2,from_name="ХАСЛ",html='<a href="https://haslestore.com/news">link</a>'),
   dict(id=3,from_name="ХАСЛ",html=''),
   dict(id=4,from_name="ХАСЛ",html='<a href="https://хасл.рф/news">link</a><img width="600" src="/media/hero.png">')
  ]}
  with patch.object(n,'api_request',return_value=raw) as api:
   result=n.campaign_archive_page(Path('.'),65)
  self.assertEqual(api.call_args.kwargs['params']['page_number'],65)
  self.assertEqual(result['totalCount'],1604)
  self.assertEqual([i['brand'] for i in result['items']],['outmax','haslestore','unassigned','hasl'])
  self.assertEqual(result['items'][0]['previewImage'],'https://cdn.example.com/hero.png')
  self.assertNotIn('html',result['items'][0])
  self.assertEqual(result['items'][3]['previewImage'],'https://app.notisend.ru/media/hero.png')
  self.assertEqual(result['items'][0]['statistics']['uniqOpen'],25)
 def test_labels_permissions_and_persistence(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as folder:
   core.ARTICLES=Path(folder)
   try:
    server=importlib.import_module('wsgi_app');app=server.application;admin=app.test_client()
    admin.post('/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD))
    users=admin.get('/api/users').json
    editor=next(u for u in users if u['id']=='editor-01');moderator=next(u for u in users if u['id']=='ivan-nekrut')
    admin.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess=True))
    e=app.test_client();e.post('/login',data=dict(login=editor['login'],password=editor['password']))
    self.assertEqual(e.put('/api/notisend/archive/42/brand',json=dict(brand='hasl')).status_code,403)
    mod=app.test_client();mod.post('/login',data=dict(login=moderator['login'],password=moderator['password']))
    self.assertEqual(mod.put('/api/notisend/archive/42/brand',json=dict(brand='haslestore')).status_code,200)
    self.assertEqual(admin.put('/api/notisend/archive/42/brand',json=dict(brand='bad')).status_code,400)
    with patch.object(n,'campaign_archive_page',return_value=dict(items=[dict(id=42,brand='unassigned')],totalCount=1,totalPages=1)):
     self.assertEqual(e.get('/editor-api/notisend/archive?page=2').json['items'][0]['brand'],'haslestore')
    admin.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess=False))
    self.assertEqual(e.get('/api/notisend/archive').status_code,403)
   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
