"""Passwordless admin account view over isolated existing accounts/storage."""
import os,tempfile,sqlite3,unittest,base64,re
from pathlib import Path
from contextlib import closing
os.environ['OUTMAX_USER']='view-demo';os.environ['OUTMAX_PASSWORD']='ViewDemoOnly123'
import app as core
_state=tempfile.TemporaryDirectory(prefix='admin-view-qa-');core.ARTICLES=Path(_state.name)
import wsgi_app as web

class ImpersonationTests(unittest.TestCase):
 def setUp(self):
  self.admin=web.application.test_client();self.admin.post('/login',data=dict(login='view-demo',password='ViewDemoOnly123'));self.users={u['id']:u for u in self.admin.get('/api/users').json}
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:con.execute('UPDATE users SET blocked=0');con.commit()
 def client(self,uid):
  c=web.application.test_client();u=self.users[uid];c.post('/login',data=dict(login=u['login'],password=u['password']));return c
 def start(self,c,uid='editor-01'):return c.post('/api/impersonation/start',json=dict(userId=uid))
 def record(self,uid):
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:return con.execute('SELECT hash,password,role,version,last_seen FROM users WHERE id=?',(uid,)).fetchone()
 def test_roles_validation_and_actual_target_permissions(self):
  self.assertNotIn('Set-Cookie',self.admin.get('/api/me').headers)
  for uid in ['editor-01','ivan-nekrut']:self.assertEqual(self.start(self.client(uid)).status_code,403)
  self.assertEqual(self.start(self.admin,'admin').status_code,400);self.assertEqual(self.start(self.admin,'missing').status_code,404)
  for payload in [None,[],{},dict(userId=3),dict(userId='editor-01',role='admin')]:self.assertEqual(self.admin.post('/api/impersonation/start',json=payload).status_code,400)
  self.assertEqual(self.admin.post('/api/impersonation/start',json=dict(userId='editor-01'),headers={'Origin':'https://evil.example'}).status_code,403)
  target=self.client('editor-01');target.post('/api/save',json=dict(id='private-target',title='Target only',body='<h1>Target only</h1>'));self.admin.post('/api/save',json=dict(id='private-admin',title='Admin only',body='<h1>Admin only</h1>'));before=self.record('editor-01')
  with self.admin.get('/') as response:old_context=re.search(r'name="editor-account-context" content="([^"]+)"',response.get_data(as_text=True)).group(1)
  preview=self.admin.post('/api/preview/private-admin').json['url']
  with self.admin.get(preview) as response:self.assertIn('name="editor-account-context" content="'+old_context+'"',response.get_data(as_text=True))
  self.assertEqual(self.start(self.admin).status_code,200);me=self.admin.get('/api/me').json;self.assertEqual(me['id'],'editor-01');self.assertFalse(me['admin']);self.assertTrue(me['impersonation']['active']);self.assertNotIn('password',me)
  self.assertNotIn('Set-Cookie',self.admin.get('/api/me').headers)
  denied=self.admin.post('/api/save',json=dict(id='wrong-account',body='<p>Must not save</p>'),headers={'X-Editor-Account':old_context});self.assertEqual(denied.status_code,409);self.assertTrue(denied.json['accountChanged']);self.assertEqual(target.get('/api/draft/wrong-account').status_code,404)
  with self.admin.get('/') as response:view_context=re.search(r'name="editor-account-context" content="([^"]+)"',response.get_data(as_text=True)).group(1)
  basic='Basic '+base64.b64encode(b'view-demo:ViewDemoOnly123').decode()
  self.assertEqual(self.admin.get('/api/users',headers={'Authorization':basic}).status_code,403)
  self.assertFalse(self.admin.get('/api/seo-requirements').json['canEdit']);self.assertEqual(self.admin.post('/api/wordstat/configure',json={}).status_code,403)
  self.assertEqual(self.start(self.admin,'ivan-nekrut').status_code,403)
  self.assertNotIn('private-admin',[r['id'] for r in self.admin.get('/api/drafts').json])
  self.assertEqual(self.admin.post('/api/save',json=dict(id='view-write',title='Target write',body='<p>Only target store</p>')).status_code,200)
  self.admin.post('/api/presence');self.assertEqual(self.record('editor-01'),before)
  self.assertEqual(self.admin.post('/api/impersonation/stop',headers={'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(self.admin.post('/api/impersonation/stop').status_code,200);self.assertEqual(self.admin.get('/api/me').json['id'],'admin')
  denied=self.admin.post('/api/save',json=dict(id='wrong-admin-account',body='<p>Must not save</p>'),headers={'X-Editor-Account':view_context});self.assertEqual(denied.status_code,409);self.assertTrue(denied.json['accountChanged']);self.assertEqual(self.admin.get('/api/draft/wrong-admin-account').status_code,404)
  self.assertEqual(target.get('/api/draft/view-write').status_code,200);self.assertEqual(self.admin.get('/api/draft/view-write').status_code,404)
 def test_blocked_and_stale_targets_keep_explicit_return(self):
  self.admin.patch('/api/users/editor-01/blocked',json=dict(blocked=True));self.assertEqual(self.start(self.admin).status_code,200)
  with self.admin.get('/') as response:
   self.assertEqual(response.status_code,403);html=response.get_data(as_text=True);self.assertIn('Вы заблокированы.',html);self.assertIn('admin-view-banner',html);self.assertIn('Вернуться в аккаунт администратора',html)
  self.assertEqual(self.admin.post('/impersonation/return').status_code,302);self.assertEqual(self.admin.get('/api/me').json['id'],'admin');self.admin.patch('/api/users/editor-01/blocked',json=dict(blocked=False))
  self.start(self.admin)
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:con.execute("UPDATE users SET version=version+1 WHERE id='editor-01'");con.commit()
  stale=self.admin.post('/api/save',json=dict(id='forbidden-stale',body='Must not enter admin store'));self.assertEqual(stale.status_code,409);self.assertTrue(stale.json['impersonationExpired']);self.assertEqual(self.admin.get('/api/me').status_code,409)
  self.assertIn('admin-view-banner',self.admin.get('/impersonation-ended').get_data(as_text=True));self.admin.post('/impersonation/return');self.assertEqual(self.admin.get('/api/me').json['id'],'admin');self.assertEqual(self.admin.get('/api/draft/forbidden-stale').status_code,404)
 def test_original_admin_revocation_and_moderator_view(self):
  self.start(self.admin,'ivan-nekrut');me=self.admin.get('/api/me').json;self.assertEqual(me['role'],'moderator');self.assertTrue(self.admin.get('/api/seo-requirements').json['canEdit']);self.assertTrue(all('password' not in u for u in self.admin.get('/api/users').json));self.assertEqual(self.admin.post('/api/users',json={}).status_code,403)
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:con.execute("UPDATE users SET version=version+1 WHERE id='admin'");con.commit()
  response=self.admin.get('/api/me');self.assertEqual(response.status_code,401);self.assertTrue(response.json['loginRequired']);self.assertEqual(self.admin.post('/api/impersonation/stop').status_code,401)

if __name__=='__main__':unittest.main()
