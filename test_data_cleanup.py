"""Isolated deletion/copy, ownership, shared files, interrupted jobs and stale writers."""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid


class DeletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        os.environ['OUTMAX_USER']='cleanup-admin';os.environ['OUTMAX_PASSWORD']='CleanupAdminPassword1'
        import app as core
        core.ARTICLES=Path(cls.temp.name)
        import wsgi_app as web
        cls.core=core;cls.app=web.application;cls.app.config['TESTING']=True
        cls.root=core.ARTICLES
        cls.admin=cls.app.test_client();cls.admin.post('/login',data={'login':'cleanup-admin','password':'CleanupAdminPassword1'})

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def setUp(self):
        self.a,self.ca=self.user();self.b,self.cb=self.user()

    def user(self):
        login='cleanup-'+uuid.uuid4().hex
        data=self.admin.post('/editor-api/users',json={'name':'Демо редактор','login':login,'password':'EditorPassword1','role':'editor','emailAccess':True}).json
        client=self.app.test_client();client.post('/login',data={'login':login,'password':'EditorPassword1'})
        return data,client

    def folder(self,user):return self.root/'users'/user['id']
    def sql(self,db,query,args=()):
        with closing(sqlite3.connect(db)) as con,con:return con.execute(query,args).fetchall()

    def article(self,client,user,name='material',brand='outmax',image=b'original-image',body=None):
        stored=('hasl--' if brand=='hasl' else '')+name
        assets=self.folder(user)/(stored+'_files');assets.mkdir(exist_ok=True)
        (assets/'cover.png').write_bytes(image)
        r=client.post('/editor-api/save',json={'id':name,'brand':brand,'title':'Демонстрационная статья','body':body or '<h1>Статья</h1><img src="'+stored+'_files/cover.png">','products':[]})
        self.assertEqual(r.status_code,200,r.json)
        return r.json,stored

    def publish(self,client,name='material',brand='outmax'):
        response=client.get('/editor-api/export/'+name+'?brand='+brand+'&format=html')
        self.assertEqual(response.status_code,200);response.close()

    def test_article_removes_history_replay_preview_comments_and_private_public_files(self):
        saved,stored=self.article(self.ca,self.a);self.article(self.ca,self.a,brand='hasl',image=b'hasl-photo')
        self.article(self.cb,self.b,image=b'other-photo');self.publish(self.ca)
        db=self.root/'_accounts/users.sqlite3';owner=self.a['id']
        self.sql(db,'INSERT INTO previews VALUES(?,?,?)',('cleanup-token',owner,stored))
        self.sql(db,'INSERT INTO feedback_threads VALUES(?,?,?,?,?,?,?,?,?,?)',('thread',owner,stored,'{}','Note',owner,'Демо','now','now',0))
        self.sql(db,'INSERT INTO feedback_replies VALUES(?,?,?,?,?,?)',('reply','thread','Reply',self.b['id'],'Другой','now'))
        public=self.root/'_article_public_images'/(hashlib.sha256(b'original-image').hexdigest()+'.png');self.assertTrue(public.exists())
        r=self.ca.delete('/editor-api/draft/material?brand=outmax');self.assertEqual(r.status_code,200,r.json)
        base=self.folder(self.a)
        self.assertFalse((base/(stored+'.json')).exists());self.assertFalse((base/(stored+'_files')).exists());self.assertFalse((base/'_article_history'/saved['documentId']).exists());self.assertFalse(public.exists())
        self.assertEqual(self.sql(base/'_article_saves.sqlite3','SELECT * FROM saves WHERE name=?',(stored+'.json',)),[])
        self.assertEqual(self.sql(db,'SELECT * FROM previews WHERE owner=?',(owner,)),[]);self.assertEqual(self.sql(db,'SELECT * FROM feedback_replies WHERE thread=?',('thread',)),[])
        self.assertTrue((base/'hasl--material.json').exists());self.assertTrue((self.folder(self.b)/'material.json').exists())
        self.assertEqual(self.ca.post('/editor-api/save',json={'id':'material','documentId':saved['documentId'],'title':'Stale','body':'old','products':[]}).status_code,409)

    def test_shared_assets_other_article_and_other_users_history_survive(self):
        photo=('shared-'+uuid.uuid4().hex).encode()
        self.article(self.ca,self.a,image=photo);self.publish(self.ca)
        self.article(self.ca,self.a,name='consumer',image=b'different',body='<h1>Копия</h1><img src="material_files/cover.png">')
        self.article(self.cb,self.b,image=photo);self.publish(self.cb)
        image=self.root/'_article_public_images'/(hashlib.sha256(photo).hexdigest()+'.png')
        self.assertEqual(self.ca.delete('/editor-api/draft/material').status_code,200)
        self.assertTrue((self.folder(self.a)/'material_files/cover.png').exists());self.assertTrue(image.exists())
        self.assertEqual(self.ca.delete('/editor-api/draft/consumer').status_code,200);self.assertTrue(image.exists())
        self.assertFalse((self.folder(self.a)/'material_files').exists())
        self.assertEqual(self.cb.delete('/editor-api/draft/material').status_code,200)
        self.assertFalse(image.exists())

    def test_user_deletes_owned_data_and_sessions_but_keeps_foreign_material(self):
        self.article(self.ca,self.a);self.article(self.cb,self.b,image=b'original-image');self.publish(self.ca);self.publish(self.cb)
        before=(self.folder(self.b)/'material.json').read_bytes()
        avatars=self.root/'_accounts/avatars';avatars.mkdir(exist_ok=True);(avatars/(self.a['id']+'-avatar.png')).write_bytes(b'avatar')
        site=self.root/'_accounts/site-projects.sqlite3';uid=uuid.uuid4().hex
        self.sql(site,'INSERT INTO projects VALUES(?,?,?,?,?,?)',(uid,self.a['id'],1,'Сайт','{"title":"Сайт"}','now'))
        self.sql(site,'INSERT INTO project_versions VALUES(?,?,?,?,?,?,?,?,?)',(uid,self.a['id'],1,'Сайт','{"title":"Сайт"}','now','Демо','create',None))
        self.sql(site,'INSERT INTO project_requests VALUES(?,?,?,?)',(self.a['id'],'req','hash',json.dumps({'id':uid})))
        self.sql(site,'INSERT INTO site_previews VALUES(?,?,?,?,?)',(uid,self.a['id'],'site-token','<p>Сайт</p>',1))
        self.assertEqual(self.cb.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':self.a['login']}).status_code,403)
        self.assertEqual(self.admin.delete('/editor-api/users/admin',json={'confirmLogin':'cleanup-admin'}).status_code,403)
        self.assertEqual(self.admin.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':'wrong'}).status_code,400)
        r=self.admin.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':self.a['login']});self.assertEqual(r.status_code,200,r.json)
        self.assertFalse(self.folder(self.a).exists());self.assertFalse((avatars/(self.a['id']+'-avatar.png')).exists())
        self.assertEqual((self.folder(self.b)/'material.json').read_bytes(),before)
        for table in ('projects','project_versions','project_requests','site_previews'):
            self.assertEqual(self.sql(site,'SELECT * FROM '+table+' WHERE owner=?',(self.a['id'],)),[])
        self.assertEqual(self.ca.post('/editor-api/save',json={'id':'late','body':'late'}).status_code,401)
        self.assertFalse(self.folder(self.a).exists())
        self.assertTrue((self.root/'_article_public_images'/(hashlib.sha256(b'original-image').hexdigest()+'.png')).exists())

    def test_failed_staging_restores_metadata_and_files_then_retry_succeeds(self):
        self.article(self.ca,self.a);before=(self.folder(self.a)/'material.json').read_bytes()
        import data_cleanup
        original=data_cleanup.os.replace;count=0
        def fail_once(a,b):
            nonlocal count
            count+=1
            if count==2:raise OSError('injected staging failure')
            return original(a,b)
        with patch.object(data_cleanup.os,'replace',side_effect=fail_once):
            self.assertEqual(self.ca.delete('/editor-api/draft/material').status_code,503)
        self.assertEqual((self.folder(self.a)/'material.json').read_bytes(),before)
        self.assertEqual(list((self.root/'_accounts/deletion-jobs').iterdir()),[])
        self.assertEqual(self.ca.delete('/editor-api/draft/material').status_code,200)

    def test_corrupt_foreign_metadata_aborts_before_removing_anything(self):
        self.article(self.ca,self.a);bad=self.folder(self.b)/'broken.json';bad.write_text('{')
        try:
            self.assertEqual(self.ca.delete('/editor-api/draft/material').status_code,503)
            self.assertTrue((self.folder(self.a)/'material.json').exists())
        finally:bad.unlink()

    def test_waiting_writer_rechecks_deleted_account_and_cannot_resurrect(self):
        service=self.app.extensions['data_cleanup'];lock=service.lock();results=[]
        thread=threading.Thread(target=lambda:results.append(self.ca.post('/editor-api/save',json={'id':'late','body':'Late'}).status_code))
        thread.start()
        try:service.user(self.a['id'])
        finally:service.unlock(lock)
        thread.join(10);self.assertFalse(thread.is_alive());self.assertEqual(results,[401]);self.assertFalse(self.folder(self.a).exists())

    def test_email_copy_resets_workflow_and_deletion_preserves_copy(self):
        folder=self.folder(self.a)/'_email_projects/letter_files';folder.mkdir(parents=True,exist_ok=True)
        (folder/'photo.png').write_bytes(b'email-copy-photo')
        payload={'filename':'Письмо','subject':'Тема','canvasHtml':'<p>Здравствуйте</p><img src="photo.png">','renderedHtml':'<p>Здравствуйте</p>','notisendCampaignId':123,'campaignFingerprint':'old','assets':{'photo.png':'photo.png'}}
        saved=self.ca.post('/editor-api/email-projects/letter',json=payload);self.assertEqual(saved.status_code,200)
        copy=self.ca.post('/editor-api/email-projects/letter/copy');self.assertEqual(copy.status_code,201,copy.json)
        record=self.ca.get('/editor-api/email-projects/'+copy.json['id']).json
        self.assertIsNone(record['notisendCampaignId']);self.assertEqual(record['workflowStatus'],'draft');self.assertNotEqual(record['documentId'],saved.json['documentId'])
        self.assertEqual(self.ca.delete('/editor-api/email-projects/letter').status_code,200)
        self.assertEqual(self.ca.get('/editor-api/email-projects/'+copy.json['id']).status_code,200)
        asset=self.ca.get('/editor-api/email-projects/'+copy.json['id']+'/asset/photo.png')
        self.assertEqual(asset.status_code,200);self.assertEqual(asset.data,b'email-copy-photo');asset.close()
        self.assertFalse((self.folder(self.a)/'_email_projects/_email_history'/saved.json['documentId']).exists())

    def test_email_without_media_does_not_scan_foreign_histories(self):
        saved=self.ca.post('/editor-api/email-projects/no-media',json={'subject':'Техническая проверка','canvasHtml':'<p>Текст</p>','renderedHtml':'<p>Текст</p>'})
        self.assertEqual(saved.status_code,200)
        service=self.app.extensions['data_cleanup']
        with patch.object(service,'references',side_effect=AssertionError('Unnecessary global scan')):
            deleted=self.ca.delete('/editor-api/email-projects/no-media')
        self.assertEqual(deleted.status_code,200,deleted.json)
        self.assertTrue(deleted.json['ok'])
        self.assertEqual(self.ca.get('/editor-api/email-projects/no-media').status_code,404)

    def test_global_reference_scan_retains_only_candidate_names(self):
        service=self.app.extensions['data_cleanup']
        foreign=self.folder(self.b)
        for index in range(20):
            (foreign/('scan-'+str(index)+'.html')).write_text('<p>'+('large unrelated text '*5000)+'</p><img src="/images/shared-banner.png">',encoding='utf-8')
        (foreign/'overlap.html').write_text('<img src="long-shared-banner.png">',encoding='utf-8')
        before=(foreign/'scan-0.html').read_bytes()
        refs=service.references([],needles={'shared-banner.png','long-shared-banner.png','absent.png'})
        self.assertEqual(set(refs.splitlines()),{'shared-banner.png','long-shared-banner.png'})
        self.assertLess(len(refs),100)
        self.assertEqual((foreign/'scan-0.html').read_bytes(),before)

    def test_committed_purge_failure_is_recovered_and_user_retry_is_idempotent(self):
        self.article(self.ca,self.a)
        import data_cleanup
        original=data_cleanup.shutil.rmtree;once=True
        def fail_once(path,*args,**kwargs):
            nonlocal once
            if once and Path(path).parent.name=='deletion-jobs':once=False;raise OSError('injected purge failure')
            return original(path,*args,**kwargs)
        with patch.object(data_cleanup.shutil,'rmtree',side_effect=fail_once):
            self.assertEqual(self.admin.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':self.a['login']}).status_code,503)
        self.assertEqual(self.ca.get('/editor-api/me').status_code,401)
        self.assertEqual(self.admin.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':self.a['login']}).status_code,200)
        self.assertEqual(list((self.root/'_accounts/deletion-jobs').iterdir()),[])

    def test_user_banner_shared_with_foreign_site_survives_until_last_site_deleted(self):
        self.admin.post('/editor-api/site-builder/access/'+self.b['id'],json={'allowed':True})
        site=self.root/'_accounts/site-projects.sqlite3';filename=uuid.uuid4().hex+'.png'
        banner=self.root/'images/banners/_hasl'/filename;banner.write_bytes(b'site-banner')
        self.sql(site,'INSERT INTO banners(filename,owner,name,width,height,size,created,folder) VALUES(?,?,?,?,?,?,?,?)',(filename,self.a['id'],'Фото',1,1,11,'now',''))
        ids=[]
        for user in (self.a,self.b):
            uid=uuid.uuid4().hex;ids.append(uid);body=json.dumps({'title':'Сайт','images':{'cover':'/editor-api/public-site-banners/'+filename}})
            self.sql(site,'INSERT INTO projects VALUES(?,?,?,?,?,?)',(uid,user['id'],1,'Сайт',body,'now'))
            self.sql(site,'INSERT INTO project_versions VALUES(?,?,?,?,?,?,?,?,?)',(uid,user['id'],1,'Сайт',body,'now','Демо','create',None))
        self.assertEqual(self.admin.delete('/editor-api/users/'+self.a['id'],json={'confirmLogin':self.a['login']}).status_code,200)
        self.assertTrue(banner.exists());self.assertEqual(self.sql(site,'SELECT owner FROM banners WHERE filename=?',(filename,)),[('_shared',)])
        self.assertEqual(self.cb.delete('/editor-api/site-builder/projects/'+ids[1],json={'revision':0}).status_code,409);self.assertTrue(banner.exists())
        self.assertEqual(self.cb.delete('/editor-api/site-builder/projects/'+ids[1],json={'revision':1}).status_code,200)
        self.assertFalse(banner.exists());self.assertEqual(self.sql(site,'SELECT * FROM project_versions WHERE project=?',(ids[1],)),[])

    def test_z_deleted_bootstrap_user_is_not_recreated_on_restart(self):
        self.assertEqual(self.admin.delete('/editor-api/users/editor-01',json={'confirmLogin':'editor01'}).status_code,200)
        from flask import Flask
        from accounts import install_accounts
        fresh=Flask('restart-check');install_accounts(fresh,self.core,'cleanup-admin','CleanupAdminPassword1')
        self.assertEqual(self.sql(self.root/'_accounts/users.sqlite3','SELECT * FROM users WHERE id=?',('editor-01',)),[])


if __name__=='__main__':unittest.main()
