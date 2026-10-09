"""Isolated regression checks for immutable public email images."""
import base64,importlib,json,tempfile,unittest
from pathlib import Path
import app as core

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=')
class PublicImagesTests(unittest.TestCase):
 def test_publication_is_owned_immutable_and_independent_of_preview(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as directory:
   core.ARTICLES=Path(directory)
   try:
    server=importlib.import_module('wsgi_app');app=server.application
    admin=app.test_client();anon=app.test_client()
    def call(client,method,url,**kw):
     response=getattr(client,method)(url,buffered=True,**kw);response.close();return response
    call(admin,'post','/login',data=dict(login=server.AUTH_USER,password=server.AUTH_PASSWORD))
    users=call(admin,'get','/api/users').json;user=next(u for u in users if u['role']=='editor');call(admin,'patch','/api/users/'+user['id'],json=dict(name=user['name'],login=user['login'],emailAccess=True));editor=app.test_client()
    call(editor,'post','/login',data=dict(login=user['login'],password=user['password']))
    upload=call(editor,'post','/api/email-projects/demo/asset?path=images/test.png',data=PNG,content_type='image/png').json
    filename=upload['filename'];payload=dict(subject='Фото',canvasHtml='<img>',renderedHtml='<img src="__EMAIL_PROJECT_ASSET__/'+filename+'"><a href="[%unsubscribe_link%]">Отписка</a>',assets={'images/test.png':filename})
    call(editor,'post','/api/email-projects/demo',json=payload)
    self.assertEqual(call(anon,'post','/api/email-projects/demo/publish-images').status_code,401)
    self.assertEqual(call(admin,'post','/api/email-projects/demo/publish-images').status_code,404)
    result=call(editor,'post','/editor-api/email-projects/demo/publish-images');self.assertEqual(result.status_code,200)
    html=result.json['html'];self.assertIn('[%unsubscribe_link%]',html);self.assertNotIn('__EMAIL_PROJECT_ASSET__',html)
    from urllib.parse import urlsplit
    url=urlsplit(core.BeautifulSoup(html,'html.parser').img['src']).path
    photo=call(anon,'get',url);self.assertEqual(photo.data,PNG);self.assertIn('immutable',photo.headers['Cache-Control']);self.assertEqual(photo.headers['Content-Type'],'image/png')
    self.assertEqual(call(anon,'get','/api/email-projects/demo/asset/'+filename).status_code,401)
    self.assertEqual(call(anon,'get','/api/public-email-images/key').status_code,404)
    preview=call(editor,'post','/api/email-projects/demo/preview');self.assertEqual(preview.status_code,200)
    call(editor,'delete','/api/email-projects/demo/preview');self.assertEqual(call(anon,'get',url).data,PNG)
    call(editor,'post','/api/email-projects/demo/asset?path=images/test.png',data=PNG+b'new version',content_type='image/png')
    second=call(editor,'post','/api/email-projects/demo/publish-images');self.assertNotEqual(second.json['html'],html);self.assertEqual(call(anon,'get',url).data,PNG)
    payload['renderedHtml']='<img src="__EMAIL_PROJECT_ASSET__/ffffffffffffffffffff.png">';call(editor,'post','/api/email-projects/demo',json=payload)
    self.assertEqual(call(editor,'post','/api/email-projects/demo/publish-images').status_code,400)
    call(editor,'delete','/api/email-projects/demo');self.assertEqual(call(anon,'get',url).status_code,404)
    shared_urls=[]
    for identifier in ('shared-one','shared-two'):
     uploaded=call(editor,'post',f'/api/email-projects/{identifier}/asset?path=images/shared.png',data=PNG,content_type='image/png').json['filename']
     call(editor,'post',f'/api/email-projects/{identifier}',json=dict(canvasHtml='<img>',renderedHtml=f'<img src="__EMAIL_PROJECT_ASSET__/{uploaded}">',assets={'images/shared.png':uploaded}))
     html=call(editor,'post',f'/api/email-projects/{identifier}/publish-images').json['html']
     shared_urls.append(urlsplit(core.BeautifulSoup(html,'html.parser').img['src']).path)
    self.assertEqual(shared_urls[0],shared_urls[1])
    call(editor,'delete','/api/email-projects/shared-one');self.assertEqual(call(anon,'get',shared_urls[0]).status_code,200)
    call(editor,'delete','/api/email-projects/shared-two');self.assertEqual(call(anon,'get',shared_urls[0]).status_code,404)

   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
