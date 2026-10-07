"""Access is independent of role, server-enforced, and keeps credentials unchanged."""
import importlib,tempfile,unittest,sqlite3
from pathlib import Path
import app as core
class EmailAccessTests(unittest.TestCase):
 def test_defaults_grant_revoke_and_credentials(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as directory:
   core.ARTICLES=Path(directory)
   try:
    server=importlib.import_module('wsgi_app');app=server.application;a=app.test_client();a.post('/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD));users=a.get('/api/users').json
    def snapshot():
     con=sqlite3.connect(core.ARTICLES/'_accounts'/'users.sqlite3')
     try:return con.execute('SELECT id,login,hash,password FROM users ORDER BY id').fetchall()
     finally:con.close()
    before=snapshot();clients={}
    for u in users:
     c=app.test_client();c.post('/login',data=dict(login=u['login'],password=u['password']));clients[u['id']]=c;self.assertEqual(c.get('/api/me').json['emailAccess'],bool(u['admin'] or u['role']=='moderator'))
    editor=next(u for u in users if u['role']=='editor');mod=next(u for u in users if u['role']=='moderator');e=clients[editor['id']];m=clients[mod['id']]
    routes=['/email','/email/','/email/index.html','/email/email-controller.js','/OUTMAX.html','/articles/email-editor.html','/api/email-projects','/api/email-sender-profiles','/api/email-review-queue','/editor-api/notisend/status','/api/email/fetch-image']
    for route in routes:self.assertEqual(e.get(route).status_code,403,route)
    self.assertEqual(e.post('/api/email-projects/test',json={}).status_code,403)
    self.assertEqual(e.post('/api/notisend/campaigns',json={}).status_code,403)
    self.assertEqual(e.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess=True)).status_code,403)
    self.assertEqual(a.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess=True)).status_code,200)
    self.assertEqual(e.get('/email/').status_code,200);self.assertEqual(e.get('/api/email-projects').status_code,200);self.assertEqual(e.get('/api/email-review-queue').status_code,403)
    self.assertEqual(a.patch('/api/users/'+mod['id'],json=dict(name=mod['name'],login=mod['login'],emailAccess=False)).status_code,200)
    self.assertEqual(m.get('/email/').status_code,403);self.assertEqual(m.get('/api/email-projects').status_code,403);self.assertEqual(m.get('/api/archive-users').status_code,200)
    self.assertEqual(a.patch('/api/users/'+mod['id'],json=dict(name=mod['name'],login=mod['login'],role='editor')).status_code,200)
    m.post('/login',data=dict(login=mod['login'],password=mod['password']));self.assertEqual(m.get('/api/me').json['role'],'editor');self.assertEqual(m.get('/email/').status_code,403)
    self.assertEqual(a.patch('/api/users/'+mod['id'],json=dict(name=mod['name'],login=mod['login'],role='moderator',emailAccess=True)).status_code,200)
    m.post('/login',data=dict(login=mod['login'],password=mod['password']));self.assertEqual(m.get('/email/').status_code,200)
    admin=next(u for u in users if u['admin']);a.patch('/api/users/'+admin['id'],json=dict(name=admin['name'],login=admin['login'],emailAccess=False));self.assertTrue(a.get('/api/me').json['emailAccess'])
    self.assertEqual(a.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess='false')).status_code,400)
    self.assertEqual(before,snapshot())
    a.patch('/api/users/'+editor['id'],json=dict(name=editor['name'],login=editor['login'],emailAccess=False,password=editor['password']));self.assertEqual(before,snapshot())
    self.assertEqual(e.get('/email/').status_code,403);self.assertEqual(e.get('/api/me').status_code,200)
   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
