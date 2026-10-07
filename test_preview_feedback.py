import importlib,json,tempfile,unittest
from pathlib import Path
import app as core

class PreviewFeedbackTests(unittest.TestCase):
 def test_authenticated_review_permissions_persistence_and_sandbox(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as directory:
   core.ARTICLES=Path(directory)
   try:
    server=importlib.import_module('wsgi_app');app=server.application;admin=app.test_client();anon=app.test_client()
    admin.post('/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD))
    users=admin.get('/api/users').json;owner=next(u for u in users if u['id']=='editor-01');viewer=next(u for u in users if u['id']=='editor-02')
    a=app.test_client();a.post('/login',data=dict(login=owner['login'],password=owner['password']));b=app.test_client();b.post('/login',data=dict(login=viewer['login'],password=viewer['password']))
    body='<h1>Heading</h1><p>Original text</p><script>window.EVIL=1</script><p onclick="alert(1)">Tail</p>'
    a.post('/api/save',json=dict(id='review',title='Review',body=body));url=a.post('/api/preview/review').json['url'];token=url.strip('/').split('/')[-1];api='/api/preview-feedback/'+token
    self.assertEqual(anon.get(url).status_code,200);self.assertIn('Войти',anon.get(url).get_data(as_text=True));self.assertEqual(anon.get(api).status_code,401);self.assertEqual(anon.post(api,json={}).status_code,401)
    content=anon.get(url+'?content=1');html=content.get_data(as_text=True);self.assertNotIn('window.EVIL',html);self.assertNotIn('onclick="alert(1)"',html);self.assertIn("script-src 'nonce-",content.headers['Content-Security-Policy']);self.assertNotIn('allow-same-origin',content.headers['Content-Security-Policy'])
    anchor=dict(selector='body > p:nth-of-type(1)',quote='Original text',kind='text',x=.5,y=.5)
    note=b.post(api,json=dict(text='Please correct this',anchor=anchor,author=owner['id']));self.assertEqual(note.status_code,201);uid=note.json['id'];path=api+'/'+uid
    t=a.get(api).json['items'][0];self.assertEqual(t['author'],viewer['id']);self.assertTrue(t['canResolve']);self.assertFalse(t['canEdit']);self.assertEqual(a.get('/api/feedback/inbox').json['openCount'],1);self.assertEqual(b.get('/api/feedback/inbox').json['openCount'],0)
    self.assertEqual(a.patch(path,json=dict(text='Changed')).status_code,403);self.assertEqual(a.delete(path).status_code,403)
    self.assertEqual(a.post(path,json=dict(text='Will fix')).status_code,200);self.assertEqual(b.patch(path,json=dict(text='Updated note')).status_code,200);self.assertEqual(a.patch(path,json=dict(resolved=True)).status_code,200)
    self.assertEqual(a.get('/api/feedback/inbox').json['openCount'],0);self.assertEqual(len(b.get(api).json['items'][0]['replies']),1)
    a.post('/api/save',json=dict(id='review',expectedRevision=a.get('/api/draft/review').json['revision'],title='Review updated',body='<p>Edited article</p>'));self.assertEqual(a.get(api).json['items'][0]['text'],'Updated note');self.assertEqual(a.get('/api/draft/review').json['body'],'<p>Edited article</p>')
    a.post('/api/save',json=dict(id='other',body='<p>Other</p>'));token2=a.post('/api/preview/other').json['url'].strip('/').split('/')[-1];self.assertEqual(b.post('/api/preview-feedback/'+token2+'/'+uid,json=dict(text='cross-document')).status_code,404)
    self.assertEqual(b.get('/api/preview-feedback/invalid').status_code,404)
    self.assertEqual(b.post(api,json=dict(text='x',anchor={**anchor,'x':2})).status_code,400);self.assertEqual(b.post(api,json=[]).status_code,400);self.assertEqual(b.post(api,json=dict(text='x'*5001,anchor=anchor)).status_code,400)
    self.assertEqual(b.post(api,json=dict(text='CSRF',anchor=anchor),headers={'Origin':'https://evil.example'}).status_code,403)
    self.assertEqual(b.delete(path).status_code,200);self.assertEqual(a.get(api).json['items'],[])
    good=anon.post('/login?next='+url,data=dict(login=viewer['login'],password=viewer['password']));self.assertEqual(good.location,url)
    bad=anon.post('/login?next=https://evil.example',data=dict(login=viewer['login'],password=viewer['password']));self.assertEqual(bad.location,'/')
    admin.patch('/api/users/'+owner['id'],json=dict(name=owner['name'],login=owner['login'],emailAccess=True))
    a.post('/api/email-projects/mail',json=dict(subject='Email',renderedHtml='<p>Email body</p>',canvasHtml='<p>Email body</p>'))
    link=a.post('/api/email-projects/mail/preview').json['url'];et=link.strip('/').split('/')[-1];ep='/api/preview-feedback/'+et
    self.assertEqual(b.post(ep,json=dict(text='Email note',anchor={**anchor,'quote':'Email body'})).status_code,201)
    self.assertEqual(a.delete('/api/email-projects/mail/preview').status_code,200);self.assertEqual(b.get(ep).status_code,404)
    fresh=a.post('/api/email-projects/mail/preview').json['url'];self.assertNotEqual(fresh,link);self.assertEqual(len(a.get('/api/preview-feedback/'+fresh.strip('/').split('/')[-1]).json['items']),1)
    self.assertEqual(a.delete('/api/email-projects/mail').status_code,200);self.assertFalse(any(i['kind']=='email' for i in a.get('/api/feedback/inbox').json['items']))
   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
