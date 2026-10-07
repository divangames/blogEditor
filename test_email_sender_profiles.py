"""Personal sender defaults are distinct per site and never overwrite projects."""
import importlib,tempfile,unittest
from pathlib import Path
import app as core
class SenderProfilesTests(unittest.TestCase):
 def test_personal_site_profiles_and_validation(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as directory:
   core.ARTICLES=Path(directory)
   try:
    server=importlib.import_module('wsgi_app');app=server.application;a=app.test_client();anon=app.test_client()
    a.post('/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD))
    self.assertEqual(anon.get('/editor-api/email-sender-profiles').status_code,401)
    user=next(u for u in a.get('/api/users').json if u['role']=='editor');e=app.test_client();e.post('/login',data=dict(login=user['login'],password=user['password']))
    for site in ('outmax_ru','outmax_com','hasl_ru','hasle_com'):
     data=dict(fromEmail=site+'@example.com',fromName=site,testEmail='test@example.com',listIds=[1,'1','2'])
     r=a.put('/editor-api/email-sender-profiles/'+site,json=data);self.assertEqual(r.status_code,200);self.assertEqual(r.json['profile']['listIds'],['1','2'])
    profiles=a.get('/api/email-sender-profiles').json['profiles'];self.assertEqual(len(profiles),4)
    self.assertEqual(e.get('/api/email-sender-profiles').status_code,403)
    a.patch('/api/users/'+user['id'],json=dict(name=user['name'],login=user['login'],emailAccess=True))
    self.assertEqual(e.get('/api/email-sender-profiles').json['profiles'],{})
    self.assertEqual(a.put('/api/email-sender-profiles/bogus',json={}).status_code,400)
    for bad in [dict(fromEmail='bad'),dict(testEmail='bad'),dict(fromName='A\nB'),dict(listIds='1'),dict(listIds=['a'*101])]:
     self.assertEqual(a.put('/api/email-sender-profiles/outmax_ru',json=bad).status_code,400)
    self.assertEqual(a.get('/api/email-sender-profiles').json['profiles'],profiles)
    project=dict(subject='Project',site='hasl_ru',fromEmail='project@example.com',fromName='Special',testEmail='project-test@example.com',listIds=['3'],canvasHtml='',renderedHtml='')
    self.assertEqual(a.post('/api/email-projects/test',json=project).status_code,200)
    a.put('/api/email-sender-profiles/hasl_ru',json=dict(fromEmail='changed@example.com',listIds=[]))
    saved=a.get('/api/email-projects/test').json;self.assertEqual(saved['fromEmail'],'project@example.com');self.assertEqual(saved['testEmail'],'project-test@example.com')
    fresh=app.test_client();fresh.post('/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD));self.assertEqual(fresh.get('/api/email-sender-profiles').json['profiles']['hasl_ru']['fromEmail'],'changed@example.com')
    self.assertFalse(any(item['id'].startswith('senders') for item in a.get('/api/archive').json))
   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
