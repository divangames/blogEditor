"""Integration regression checks with isolated storage, never real editor drafts."""
import base64
import importlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import app as core


class ProfileIntegrationTests(unittest.TestCase):
    def test_legacy_schema_migrates_without_resetting_accounts(self):
        from accounts import install_accounts
        from cryptography.fernet import Fernet
        from flask import Flask
        from werkzeug.security import generate_password_hash
        import sqlite3
        original=core.ARTICLES
        with tempfile.TemporaryDirectory() as directory:
            core.ARTICLES=Path(directory)
            try:
                state=core.ARTICLES/'_accounts';state.mkdir()
                key=Fernet.generate_key();(state/'key').write_bytes(key);cipher=Fernet(key)
                with sqlite3.connect(state/'users.sqlite3') as connection:
                    connection.execute('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,login TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1)')
                    for uid,name,login,admin in [('admin','Иван Радыгин','admin',1),('ivan-nekrut','Иван Некрут','nekrut.custom',0)]:
                        connection.execute('INSERT INTO users(id,name,login,hash,password,admin) VALUES(?,?,?,?,?,?)',(uid,name,login,generate_password_hash('ExistingPassword123'),cipher.encrypt(b'ExistingPassword123').decode(),admin))
                connection.close()
                saved=core.ARTICLES/'legacy.json';saved.write_text('{"title":"Старый черновик"}',encoding='utf-8')
                application=Flask('migration-test');install_accounts(application,core,'admin','UnusedBootstrapPassword123')
                client=application.test_client()
                self.assertEqual(client.post('/login',data=dict(login='nekrut.custom',password='ExistingPassword123')).status_code,302)
                self.assertEqual(client.get('/api/me').json['role'],'moderator')
                admin_client=application.test_client();admin_client.post('/login',data=dict(login='admin',password='ExistingPassword123'))
                self.assertEqual(admin_client.patch('/api/users/ivan-nekrut',json=dict(name='Иван Некрут',login='nekrut.custom',role='editor')).status_code,200)
                restarted=Flask('migration-restart-test');install_accounts(restarted,core,'admin','AnotherUnusedPassword123')
                fresh=restarted.test_client();fresh.post('/login',data=dict(login='nekrut.custom',password='ExistingPassword123'))
                self.assertEqual(fresh.get('/api/me').json['role'],'editor')
                self.assertTrue(saved.exists())
                self.assertEqual((state/'key').read_bytes(),key)
            finally:
                core.ARTICLES=original

    def test_profiles_archives_previews_and_legacy(self):
        original = core.ARTICLES
        with tempfile.TemporaryDirectory() as directory:
            core.ARTICLES = Path(directory)
            try:
                server = importlib.import_module('wsgi_app')
                application = server.application
                application.config.update(TESTING=True)
                def client_factory():
                    client = application.test_client()
                    original_open = client.open
                    def closed_open(*args, **kwargs):
                        kwargs['buffered'] = True
                        response = original_open(*args, **kwargs)
                        response.close()
                        return response
                    client.open = closed_open
                    return client
                admin = client_factory()
                anonymous = client_factory()
                bootstrap = None
                self.assertEqual(anonymous.get('/editor-api/me').status_code,401)
                self.assertEqual(anonymous.get('/').status_code,302)
                self.assertEqual(anonymous.get('/login').headers['Referrer-Policy'],'same-origin')
                if server.AUTH_USER and server.AUTH_PASSWORD:
                    login, password = server.AUTH_USER, server.AUTH_PASSWORD
                else:
                    bootstrap = (core.ARTICLES/'_accounts'/'local-admin.txt').read_text(encoding='utf-8').splitlines()
                    login, password = [line.split(': ',1)[1] for line in bootstrap]
                self.assertEqual(admin.post('/login',data=dict(login=login,password=password)).status_code,302)
                self.assertEqual(admin.get('/editor-api/me').json['name'],'Иван Радыгин')
                users = admin.get('/editor-api/users').json
                self.assertEqual(len(users),4)
                clients=[]
                for user in users:
                    if user['admin']:
                        continue
                    client=client_factory()
                    self.assertEqual(client.post('/login',data=dict(login=user['login'],password=user['password'])).status_code,302)
                    self.assertEqual(client.get('/api/users').status_code,403)
                    clients.append((client,user))
                first,user=clients[0]; second,second_user=clients[1]
                self.assertEqual(first.get('/api/me').json['role'],'moderator')
                self.assertEqual(second.get('/api/me').json['role'],'editor')
                email_asset=first.post('/api/email-projects/october/asset?path=images/hero.png',data=b'email-image',content_type='image/png')
                self.assertEqual(email_asset.status_code,200)
                email_filename=email_asset.json['filename']
                email_rendered='<!doctype html><html><body><h1>Рассылка</h1><img src="__EMAIL_PROJECT_ASSET__/'+email_filename+'"><a href="[%unsubscribe_link%]">Отписаться</a></body></html>'
                email_payload=dict(filename='october',subject='Рассылка октября',preheader='Прехедер',site='outmax_ru',canvasHtml='<h1>Рассылка</h1>',renderedHtml=email_rendered,importState={},fromEmail='news@example.test',fromName='OUTMAX',listIds=['1','2'],utm=dict(enabled=True,source='notisend',medium='email',campaign='october'),notisendCampaignId=12345,campaignFingerprint='abc',assets={'images/hero.png':email_filename})
                self.assertEqual(first.post('/api/email-projects/october',json=email_payload).status_code,200)
                self.assertEqual(first.get('/api/email-projects').json['items'][0]['campaignId'],12345)
                opened=first.get('/api/email-projects/october').json
                self.assertEqual(opened['subject'],'Рассылка октября')
                self.assertEqual(opened['utm']['campaign'],'october')
                self.assertEqual(first.get('/api/email-projects/october/asset/'+email_asset.json['filename']).data,b'email-image')
                self.assertEqual(second.get('/api/email-projects').json['items'],[])
                self.assertEqual(second.get('/api/email-projects/october').status_code,404)
                preview=first.post('/api/email-projects/october/preview').json['url']
                self.assertEqual(anonymous.get(preview).status_code,200)
                self.assertIn('Десктоп',anonymous.get(preview).get_data(as_text=True))
                preview_content=anonymous.get(preview+'?content=1')
                self.assertEqual(preview_content.status_code,200)
                self.assertNotIn('[%unsubscribe_link%]',preview_content.get_data(as_text=True))
                self.assertEqual(anonymous.get(preview+'email-assets/'+email_filename).data,b'email-image')
                self.assertEqual(second.post('/api/email-projects/october/preview').status_code,404)
                submitted=first.post('/api/email-projects/october/workflow',json=dict(action='submit'))
                self.assertEqual(submitted.json['status'],'review')
                self.assertEqual(second.get('/api/email-review-queue').status_code,403)
                queue=admin.get('/api/email-review-queue').json['items']
                self.assertTrue(any(item['id']=='october' and item['ownerId']==user['id'] for item in queue))
                approved=admin.post('/api/email-review-queue/'+user['id']+'/october/workflow',json=dict(action='approve',comment='Всё хорошо'))
                self.assertEqual(approved.json['status'],'approved')
                self.assertEqual(first.get('/api/email-projects/october').json['workflowStatus'],'approved')
                changed_payload=dict(email_payload)
                changed_payload['subject']='Рассылка после правки'
                changed_payload['renderedHtml']=email_rendered.replace('Рассылка</h1>','Изменённая рассылка</h1>')
                self.assertEqual(first.post('/api/email-projects/october',json=changed_payload).status_code,200)
                changed_project=first.get('/api/email-projects/october').json
                self.assertEqual(changed_project['workflowStatus'],'draft')
                self.assertEqual(changed_project['reviewerName'],'')
                self.assertEqual(first.delete('/api/email-projects/october').status_code,200)
                self.assertEqual(first.get('/api/email-projects/october').status_code,404)
                self.assertEqual(anonymous.get(preview).status_code,404)
                self.assertEqual(second.get('/api/archive-users').status_code,403)
                directory=first.get('/api/archive-users').json
                self.assertEqual(len(directory),4)
                self.assertTrue(all('password' not in member for member in directory))
                self.assertEqual(first.post('/api/users',json=dict(name='Forbidden',login='forbidden')).status_code,403)
                self.assertEqual(first.post('/api/users/password').status_code,403)
                generated=admin.post('/api/users/password').json['password']
                self.assertGreaterEqual(len(generated),8)
                created_user=admin.post('/api/users',json=dict(name='Новый редактор',login='test-new')).json
                self.assertEqual(created_user['role'],'editor')
                self.assertGreaterEqual(len(created_user['password']),8)
                new_client=client_factory()
                self.assertEqual(new_client.post('/login',data=dict(login=created_user['login'],password=created_user['password'])).status_code,302)
                self.assertEqual(admin.post('/api/users',json=dict(name='Дубликат',login='test-new')).status_code,409)
                manual=admin.post('/api/users',json=dict(name='Новый модератор',login='test-moderator',password='ManualPassword123',role='moderator'))
                self.assertEqual(manual.status_code,201)
                self.assertEqual(manual.json['password'],'ManualPassword123')
                self.assertEqual(admin.post('/api/users',json=dict(name='Bad',login='bad',role='admin')).status_code,400)
                for client,title in [(first,'Первая статья'),(second,'Чужая статья')]:
                    uploaded=client.post('/api/upload?draft=same&name=cover',data=b'test-image',content_type='image/png')
                    self.assertEqual(uploaded.status_code,200)
                    saved=client.post('/api/save',json=dict(id='same',title=title,body='<h1>'+title+'</h1><img src="same_files/cover.png">',products=[]))
                    self.assertEqual(saved.status_code,200)
                foreign_base='/api/archive/'+second_user['id']
                self.assertEqual(first.get(foreign_base).json[0]['title'],'Чужая статья')
                self.assertEqual(second.get('/api/archive/'+user['id']).status_code,403)
                self.assertEqual(first.get(foreign_base+'/article/same').status_code,200)
                self.assertIn('Чужая статья',first.get(foreign_base+'/article/same').get_data(as_text=True))
                self.assertEqual(first.get(foreign_base+'/assets/same_files/cover.png').data,b'test-image')
                self.assertEqual(second.get('/api/archive/'+user['id']+'/assets/same_files/cover.png').status_code,403)
                self.assertEqual(first.patch(foreign_base+'/article/same',json=dict(title='Запрещённая правка')).status_code,405)
                self.assertEqual(first.delete(foreign_base+'/article/same').status_code,405)
                self.assertEqual(second.post('/api/archive/'+user['id']+'/article/same/copy').status_code,403)
                second.post('/api/upload?draft=materials&name=reused',data=b'reused-photo',content_type='image/png')
                second.post('/api/save',json=dict(id='same',title='Чужая статья',body='<img src="same_files/cover.png"><img src="materials_files/reused.png">',products=[]))
                before=second.get('/api/draft/same').json
                cloned=first.post(foreign_base+'/article/same/copy').json
                self.assertNotEqual(cloned['id'],'same')
                self.assertEqual(first.get('/api/draft/'+cloned['id']).json['copiedFrom']['owner'],second_user['id'])
                self.assertEqual(first.get('/articles/'+cloned['id']+'_files/cover.png').data,b'test-image')
                cloned_body=first.get('/api/draft/'+cloned['id']).json['body']
                reused_src=core.BeautifulSoup(cloned_body,'html.parser').select('img')[1]['src']
                self.assertEqual(first.get('/articles/'+reused_src).data,b'reused-photo')
                self.assertNotIn('materials_files/',cloned_body)
                first.post('/api/save',json=dict(id=cloned['id'],title='Правка своей копии',body='<p>Моё</p>'))
                self.assertEqual(second.get('/api/draft/same').json,before)
                self.assertEqual(first.delete('/api/draft/'+cloned['id']).status_code,200)
                admin_clone=admin.post('/api/archive/'+user['id']+'/article/same/copy').json
                self.assertEqual(admin.get('/api/draft/'+admin_clone['id']).status_code,200)
                self.assertEqual(admin.delete('/api/draft/'+admin_clone['id']).status_code,200)
                self.assertEqual(first.get('/api/archive/not-a-user').status_code,404)
                self.assertEqual(first.get('/api/draft/same').json['title'],'Первая статья')
                self.assertEqual(second.get('/api/draft/same').json['title'],'Чужая статья')
                created=first.get('/api/archive').json[0]['createdAt']
                self.assertTrue(first.get('/api/archive').json[0]['preview'])
                self.assertEqual(first.get('/articles/same_files/cover.png').data,b'test-image')
                self.assertEqual(second.get('/articles/users/'+user['id']+'/same.json').status_code,404)
                self.assertEqual(first.post('/api/save',json=dict(id='same',title='Правка',body='<img src="same_files/cover.png">',products=[])).status_code,200)
                self.assertEqual(first.get('/api/archive').json[0]['createdAt'],created)
                self.assertEqual(first.get('/api/export/same?format=html').status_code,200)
                export=first.get('/api/export/same?format=zip&localImages=1')
                self.assertEqual(export.status_code,200)
                with zipfile.ZipFile(io.BytesIO(export.data)) as archive:
                    self.assertTrue(any(name.endswith('.png') for name in archive.namelist()))
                link=first.post('/api/preview/same').json['url']
                self.assertEqual(first.post('/api/preview/same').json['url'],link)
                self.assertEqual(anonymous.get(link).status_code,200)
                self.assertIn('Телефон',anonymous.get(link).get_data(as_text=True))
                self.assertEqual(anonymous.get(link+'?content=1').status_code,200)
                self.assertIn('sandbox',anonymous.get(link+'?content=1').headers['Content-Security-Policy'])
                self.assertEqual(anonymous.get(link+'same_files/cover.png').data,b'test-image')
                self.assertEqual(anonymous.get(link+'other.json').status_code,404)
                self.assertEqual(first.post('/api/save',json=dict(id='same',brand='hasl',title='ХАСЛ',body='<p>Бренд</p>')).status_code,200)
                self.assertEqual(len(first.get('/api/archive').json),2)
                long_id = 'x'*70
                self.assertEqual(first.post('/api/save',json=dict(id=long_id,brand='hasl',title='Длинное имя',body='<p>Тест</p>')).status_code,200)
                long_link=first.post('/api/preview/'+long_id+'?brand=hasl').json['url']
                self.assertEqual(anonymous.get(long_link).status_code,200)
                self.assertEqual(first.delete('/api/draft/'+long_id+'?brand=hasl').status_code,200)
                self.assertEqual(anonymous.get(long_link).status_code,404)
                self.assertEqual(len(first.get('/api/drafts?brand=hasl').json),1)
                legacy=core.ARTICLES/'old.json';legacy.write_text(json.dumps(dict(id='old',title='Старая',body='<img src="old_files/photo.png">',savedAt='2025-01-01T00:00:00+07:00')),encoding='utf-8')
                (core.ARTICLES/'old_files').mkdir();(core.ARTICLES/'old_files'/'photo.png').write_bytes(b'legacy')
                copy=first.post('/api/legacy-drafts/old/copy').json
                copied=first.get('/api/draft/'+copy['id']).json
                self.assertEqual(first.get('/articles/'+copy['id']+'_files/photo.png').data,b'legacy')
                self.assertIn(copy['id']+'_files',copied['body'])
                self.assertTrue(legacy.exists())
                self.assertEqual(second.get('/api/draft/'+copy['id']).status_code,404)
                self.assertEqual(first.delete('/api/draft/same').status_code,200)
                self.assertEqual(anonymous.get(link).status_code,404)
                self.assertEqual(second.get('/api/draft/same').status_code,200)
                self.assertEqual(first.post('/api/save',json=dict(id='blocked'),headers={'Origin':'https://evil.example'}).status_code,403)
                updated=dict(name='Новое имя',login='new.login',password='NewPassword123')
                self.assertEqual(admin.patch('/api/users/'+user['id'],json=updated).status_code,200)
                self.assertEqual(first.get('/api/me').status_code,401)
                self.assertEqual(first.post('/login',data=dict(login='new.login',password='NewPassword123')).status_code,302)
                self.assertEqual(first.get('/api/me').json['name'],'Новое имя')
                self.assertEqual(admin.get('/api/users').json[[row['id'] for row in admin.get('/api/users').json].index(user['id'])]['password'],'NewPassword123')
                role_edit=admin.patch('/api/users/'+created_user['id'],json=dict(name=created_user['name'],login=created_user['login'],role='moderator'))
                self.assertEqual(role_edit.status_code,200)
                self.assertEqual(new_client.get('/api/me').status_code,401)
                self.assertEqual(new_client.post('/login',data=dict(login=created_user['login'],password=created_user['password'])).status_code,302)
                self.assertEqual(new_client.get('/api/me').json['role'],'moderator')
                self.assertEqual(new_client.get('/api/archive-users').status_code,200)
                self.assertEqual(first.post('/api/logout').status_code,200)
                self.assertEqual(first.get('/api/me').status_code,401)
            finally:
                core.ARTICLES=original


if __name__=='__main__':
    unittest.main()
