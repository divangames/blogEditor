import base64,json,secrets
from pathlib import Path
from urllib.parse import urljoin
import requests
BASE='https://news.outmax-office.ru'
credentials=json.loads(Path('release/.outmax-deploy-credentials.json').read_text())
admin=requests.Session()
r=admin.post(BASE+'/login',data={'login':credentials['user'],'password':credentials['password']},headers={'Origin':BASE},timeout=20,allow_redirects=False)
print('domain login',r.status_code)
r.raise_for_status()
users=admin.get(BASE+'/editor-api/users',timeout=20);users.raise_for_status();users=users.json()
Path('users-access.txt').write_text('\n\n'.join('Имя: '+u['name']+'\nЛогин: '+u['login']+'\nПароль: '+u['password'] for u in users),encoding='utf-8')
clients=[]
for user in users:
 if user['admin']:continue
 client=requests.Session();r=client.post(BASE+'/login',data={'login':user['login'],'password':user['password']},headers={'Origin':BASE},timeout=20,allow_redirects=False);r.raise_for_status()
 me=client.get(BASE+'/editor-api/me',timeout=20);assert me.json()['id']==user['id']
 assert client.get(BASE+'/editor-api/users',timeout=20).status_code==403
 clients.append(client)
print('all profiles login on domain: OK')
identifier='deploy-check-'+secrets.token_hex(6)
created=[]
try:
 for index,client in enumerate(clients[:2]):
  for brand in ('outmax','hasl'):
   upload=client.post(BASE+f'/editor-api/upload?draft={identifier}&name=test&brand={brand}',data=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII='),headers={'Content-Type':'image/png','Origin':BASE},timeout=20);upload.raise_for_status()
   body=f'<h1>Проверка публикации {index}</h1><img src="{upload.json()["src"]}" alt="Тест">'
   saved=client.post(BASE+'/editor-api/save',json={'id':identifier,'brand':brand,'title':f'Проверка публикации {index}','body':body,'products':[]},headers={'Origin':BASE},timeout=20);saved.raise_for_status();created.append((client,brand))
   read=client.get(BASE+f'/editor-api/draft/{identifier}?brand={brand}',timeout=20);assert read.json()['title']==f'Проверка публикации {index}'
   export=client.get(BASE+f'/editor-api/export/{identifier}?format=zip&brand={brand}',timeout=20);export.raise_for_status();assert export.content.startswith(b'PK')
   preview=client.post(BASE+f'/editor-api/preview/{identifier}?brand={brand}',headers={'Origin':BASE},timeout=20);preview.raise_for_status();link=BASE+preview.json()['url']
   public=requests.get(link,timeout=20);public.raise_for_status();assert 'Телефон' in public.text
   page=requests.get(link+'?content=1',timeout=20);page.raise_for_status();assert f'Проверка публикации {index}' in page.text
   photo=requests.get(urljoin(link,upload.json()['src']),timeout=20);photo.raise_for_status();assert photo.content.startswith(b'\x89PNG')
   assert requests.get(BASE+'/articles/'+upload.json()['src'],timeout=20,allow_redirects=False).status_code==302
   archive=client.get(BASE+'/editor-api/archive',timeout=20).json();assert any(a['id']==identifier and a['brand']==brand for a in archive)
 print('isolation, saves, uploads, ZIP and anonymous previews for both brands: OK')
 shared=admin.get(BASE+'/editor-api/legacy-drafts',timeout=20);shared.raise_for_status();print('legacy drafts available:',len(shared.json()))
finally:
 for client,brand in created:
  deleted=client.delete(BASE+f'/editor-api/draft/{identifier}?brand={brand}',headers={'Origin':BASE},timeout=20)
  if deleted.status_code!=200:raise RuntimeError('Cannot remove temporary verification article')
print('temporary verification articles removed')
for path in ('/','/hasl/','/email/','/OUTMAX.html'):
 r=admin.get(BASE+path,timeout=20);r.raise_for_status();print('page',path,'OK')
