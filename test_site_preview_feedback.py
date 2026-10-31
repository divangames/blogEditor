import importlib,tempfile,unittest,os
from pathlib import Path
import app as core
os.environ['OUTMAX_SITE_STATS_NETWORK']='0'
class SiteFeedbackTests(unittest.TestCase):
 def test_existing_feedback_owner_inbox_permissions_revoke(self):
  old=core.ARTICLES
  with tempfile.TemporaryDirectory() as directory:
   core.ARTICLES=Path(directory)
   try:
    server=importlib.import_module('wsgi_app');app=server.application;admin=app.test_client();anon=app.test_client();admin.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
    users=admin.get('/api/users').json;owner=next(x for x in users if x['id']=='editor-01');viewer=next(x for x in users if x['id']=='editor-02')
    result=admin.post('/api/site-builder/access/'+owner['id'],json={'allowed':True});self.assertEqual(result.status_code,200)
    a=app.test_client();a.post('/login',data={'login':owner['login'],'password':owner['password']});b=app.test_client();b.post('/login',data={'login':viewer['login'],'password':viewer['password']})
    data=a.get('/api/site-builder/reference').json;r=a.post('/api/site-builder/projects',json=data);self.assertEqual(r.status_code,201,r.text);uid=r.json['id'];publish='/api/site-builder/projects/'+uid+'/preview'
    url=a.post(publish,json={'revision':1,'html':'<!doctype html><html><body><h1>Site demo</h1><p>Content</p></body></html>'}).json['url'];token=url.strip('/').split('/')[-1];api='/api/preview-feedback/'+token
    self.assertIn('review-phone-frame',anon.get(url).text);raw=anon.get(url+'?content=1');self.assertIn('editor-feedback',raw.text);self.assertNotIn('allow-same-origin',raw.headers['Content-Security-Policy']);self.assertIn("connect-src 'none'",raw.headers['Content-Security-Policy']);self.assertEqual(anon.post(api,json={}).status_code,401)
    anchor={'selector':'body > p:nth-of-type(1)','quote':'Content','kind':'text','x':.5,'y':.5};r=b.post(api,json={'text':'Please update','anchor':anchor});self.assertEqual(r.status_code,201,r.text);note=r.json['id'];path=api+'/'+note
    inbox=a.get('/api/feedback/inbox').json;self.assertEqual(inbox['items'][0]['kind'],'site');self.assertEqual(inbox['items'][0]['previewUrl'],url);self.assertEqual(inbox['openCount'],1);self.assertEqual(b.get('/api/feedback/inbox').json['openCount'],0)
    self.assertEqual(a.patch(path,json={'text':'spoof'}).status_code,403);self.assertEqual(a.delete(path).status_code,403);self.assertEqual(b.post(api,json={'text':'csrf','anchor':anchor},headers={'Origin':'https://evil.test'}).status_code,403)
    self.assertEqual(a.post(path,json={'text':'Will fix'}).status_code,200);self.assertEqual(a.patch(path,json={'resolved':True}).status_code,200);self.assertEqual(a.get('/api/feedback/inbox').json['openCount'],0)
    other=a.post('/api/site-builder/projects',json=data).json['id'];otherurl=a.post('/api/site-builder/projects/'+other+'/preview',json={'revision':1,'html':'<p>Other</p>'}).json['url'];otherapi='/api/preview-feedback/'+otherurl.strip('/').split('/')[-1]
    self.assertEqual(b.post(otherapi+'/'+note,json={'text':'cross-page'}).status_code,404)
    self.assertEqual(a.delete(publish).status_code,200);self.assertEqual(b.get(api).status_code,404);self.assertEqual(anon.get(url).status_code,404);self.assertIsNone(a.get('/api/feedback/inbox').json['items'][0]['previewUrl'])
    fresh=a.post(publish,json={'revision':1,'html':'<p>Updated</p>'}).json['url'];self.assertNotEqual(fresh,url);freshapi='/api/preview-feedback/'+fresh.strip('/').split('/')[-1];self.assertEqual(len(a.get(freshapi).json['items']),1)
   finally:core.ARTICLES=old
if __name__=='__main__':unittest.main()
