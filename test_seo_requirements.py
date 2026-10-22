"""Shared editorial requirements: roles, CAS and no provider/document writes."""
import os,tempfile,base64,json,sqlite3,unittest
from contextlib import closing
from pathlib import Path
from werkzeug.security import generate_password_hash
_state=tempfile.TemporaryDirectory(prefix='seo-policy-qa-')
os.environ['OUTMAX_USER']='seo-demo';os.environ['OUTMAX_PASSWORD']='seo-demo-only'
import app as core
core.ARTICLES=Path(_state.name)
import wsgi_app as web

class SeoPolicyTests(unittest.TestCase):
 def setUp(self):
  self.client=web.application.test_client();self.file=core.ARTICLES/'_accounts/seo-requirements.json';self.file.unlink(missing_ok=True)
  with closing(sqlite3.connect(core.ARTICLES/'_accounts/users.sqlite3')) as con:
   for role in ('editor','moderator'):
    con.execute('INSERT OR REPLACE INTO users(id,name,login,hash,password,admin,role) VALUES(?,?,?,?,?,?,?)',(role,role,role,generate_password_hash('qa-only'),'unused',0,role))
   con.commit()
 def headers(self,role='seo-demo'):return {'Authorization':'Basic '+base64.b64encode((role+':'+('seo-demo-only' if role=='seo-demo' else 'qa-only')).encode()).decode()}
 def get(self,role='seo-demo'):return self.client.get('/editor-api/seo-requirements',headers=self.headers(role))
 def test_access_and_default(self):
  self.assertEqual(self.client.get('/editor-api/seo-requirements').status_code,401)
  for role in ('seo-demo','moderator','editor'):
   result=self.get(role).json;self.assertIn('2.2',result['text']);self.assertIn('Research',result['text']);self.assertEqual(result['canEdit'],role!='editor')
   status=self.client.get('/editor-api/wordstat/status',headers=self.headers(role));self.assertEqual(status.status_code,200)
 def test_roles_csrf_and_cas(self):
  initial=self.get().json;payload={'text':'Проверенные общие требования','expectedRevision':initial['revision']}
  self.assertEqual(self.client.post('/editor-api/seo-requirements',json=payload,headers=self.headers('editor')).status_code,403)
  self.assertEqual(self.client.post('/editor-api/seo-requirements',json=payload,headers={**self.headers(),'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(self.client.post('/editor-api/seo-requirements',json=payload,headers=self.headers('moderator')).status_code,200)
  self.assertEqual(self.client.post('/editor-api/seo-requirements',json=payload,headers=self.headers()).status_code,409)
  self.assertEqual(self.get('editor').json['text'],payload['text'])
  self.assertEqual(self.client.post('/editor-api/seo-requirements',json={'text':'','expectedRevision':self.get().json['revision']},headers=self.headers()).status_code,400)

if __name__=='__main__':unittest.main()
