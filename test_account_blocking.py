"""Account blocking integration: isolated accounts, no real materials/providers."""
import os,tempfile,unittest,sqlite3,base64
from pathlib import Path
from contextlib import closing
os.environ['OUTMAX_USER']='block-demo';os.environ['OUTMAX_PASSWORD']='BlockDemoOnly123'
import app as core
_state=tempfile.TemporaryDirectory(prefix='account-blocking-qa-');core.ARTICLES=Path(_state.name)
import wsgi_app as web

class AccountBlockingTests(unittest.TestCase):
 def setUp(self):
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:
   con.execute('UPDATE users SET blocked=0')
   for uid,role,admin in [('other-admin','admin',1),('other-moderator','moderator',0)]:con.execute('INSERT OR IGNORE INTO users(id,name,login,hash,password,admin,role) SELECT ?,?,?,hash,password,?,? FROM users WHERE id=?',(uid,uid,uid,admin,role,'admin'))
   con.commit()
  self.admin=web.application.test_client();self.admin.post('/login',data=dict(login='block-demo',password='BlockDemoOnly123'))
  self.users={u['id']:u for u in self.admin.get('/api/users').json}
  self.mod=self.client('ivan-nekrut');self.editor=self.client('editor-01')
 def client(self,uid):
  user=self.users[uid];client=web.application.test_client();client.post('/login',data=dict(login=user['login'],password=user['password']));return client
 def status(self,actor,uid,blocked):return actor.patch('/api/users/'+uid+'/blocked',json=dict(blocked=blocked))
 def test_role_matrix_and_no_moderator_secrets(self):
  listing=self.mod.get('/api/users');self.assertEqual(listing.status_code,200)
  self.assertTrue(all('password' not in u for u in listing.json));self.assertFalse(next(u for u in listing.json if u['id']=='admin')['canSetBlocked'])
  self.assertEqual(self.editor.get('/api/users').status_code,403)
  for uid in ['admin','other-admin','ivan-nekrut','other-moderator']:
   for blocked in [True,False]:self.assertEqual(self.status(self.mod,uid,blocked).status_code,403)
  for uid in ['admin','other-admin']:
   for blocked in [True,False]:self.assertEqual(self.status(self.admin,uid,blocked).status_code,403)
  self.assertEqual(self.status(self.editor,'editor-02',True).status_code,403)
  self.assertEqual(self.status(self.mod,'editor-01',True).status_code,200)
  self.assertEqual(self.status(self.mod,'editor-01',False).status_code,200)
  self.assertEqual(self.status(self.admin,'ivan-nekrut',True).status_code,200)
  self.assertEqual(self.mod.get('/api/users').json['blocked'],True)
  self.assertEqual(self.status(self.mod,'editor-02',True).status_code,403)
  self.assertEqual(self.status(self.admin,'ivan-nekrut',False).status_code,200)
  self.assertEqual(self.mod.get('/api/me').status_code,200)
  self.assertEqual(self.mod.post('/api/users',json=dict(name='no',login='no')).status_code,403)
  self.assertEqual(self.mod.patch('/api/users/editor-01',json=dict(name='No',login='no',role='moderator')).status_code,403)
 def test_live_session_basic_login_gate_and_restoration(self):
  self.assertEqual(self.editor.post('/api/save',json=dict(id='retained',title='Сохранить материал',body='<h1>Останется</h1>')).status_code,200)
  draft=self.editor.get('/api/draft/retained').json
  preview=self.editor.post('/api/preview/retained').json['url']
  self.assertEqual(self.status(self.admin,'editor-01',True).status_code,200)
  for path in ['/','/hasl/','/email/','/OUTMAX.html','/instructions/','/tiptap/','/login',preview,preview+'?content=1','/email-templates/outmax/anything.html','/editor.css']:
   response=self.editor.get(path);self.assertEqual(response.status_code,403,path);soup=core.BeautifulSoup(response.get_data(as_text=True),'html.parser');self.assertIn(web.BLOCKED_MESSAGE if hasattr(web,'BLOCKED_MESSAGE') else 'Обратитесь к администратору или модератору сервиса',soup.get_text(' ',strip=True));self.assertEqual(len(soup.select('button,a')),2);self.assertFalse(soup.select('script,nav,menu'));self.assertEqual(soup.a['href'],'https://t.me/delbraun')
  for method,path,data in [('get','/api/me',None),('get','/api/draft/retained',None),('post','/api/save',dict(id='retained',body='Forbidden')),('get','/api/export/retained',None),('get','/api/wordstat/status',None),('post','/api/wordstat/query',dict(mode='tree')),('post','/api/presence',{}),('get','/api/public-email-images/example.png',None)]:
   response=getattr(self.editor,method)(path,**({'json':data} if data is not None else {}));self.assertEqual(response.status_code,403);self.assertTrue(response.json['blocked']);self.assertEqual(response.headers['Cache-Control'],'no-store')
  anon=web.application.test_client();self.assertEqual(anon.get(preview).status_code,200)
  user=self.users['editor-01'];basic='Basic '+base64.b64encode((user['login']+':'+user['password']).encode()).decode();self.assertTrue(anon.get('/api/me',headers={'Authorization':basic}).json['blocked'])
  self.assertEqual(anon.post('/login',data=dict(login=user['login'],password=user['password'])).location,'/blocked')
  self.assertEqual(self.editor.post('/logout',headers={'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(self.editor.post('/logout').location,'/login');self.assertEqual(self.editor.get('/api/me').status_code,401)
  self.assertEqual(self.status(self.admin,'editor-01',False).status_code,200)
  self.assertEqual(self.client('editor-01').get('/api/draft/retained').json,draft)
  self.assertEqual(self.editor.post('/login',data=dict(login=user['login'],password=user['password'])).location,'/')
 def test_validation_csrf_persistence_and_guard_scope(self):
  endpoint='/api/users/editor-01/blocked'
  for payload in [None,[],{'blocked':'true'},{'blocked':1},{'blocked':True,'role':'admin'}]:self.assertEqual(self.admin.patch(endpoint,json=payload).status_code,400)
  self.assertEqual(self.admin.patch(endpoint,json=dict(blocked=True),headers={'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(self.status(self.admin,'missing',True).status_code,404)
  self.assertEqual(self.status(self.admin,'editor-01',True).status_code,200)
  from flask import Flask
  from accounts import install_accounts
  restarted=Flask('block-restart');install_accounts(restarted,core,'block-demo','UnusedDifferent123');client=restarted.test_client();user=self.users['editor-01'];self.assertEqual(client.post('/login',data=dict(login=user['login'],password=user['password'])).location,'/blocked')
  self.assertEqual(client.get('/blocked').status_code,403)
  self.assertEqual(self.admin.get('/account-access.js').mimetype,'application/javascript')
  with self.admin.get('/') as response:self.assertTrue('/account-access.js' in response.get_data(as_text=True))
  self.admin.post('/api/save',json=dict(id='guard-export',body='<h1>Без сценария доступа</h1>'))
  self.assertNotIn('/account-access.js',self.admin.get('/api/export/guard-export?format=html').get_data(as_text=True))

if __name__=='__main__':unittest.main()
