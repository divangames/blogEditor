"""Account presence metadata over the existing users row; isolated storage only."""
import io
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime,timedelta,timezone
from pathlib import Path
from PIL import Image
from flask import Flask
import app as core
from accounts import install_accounts

class UserActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=core.ARTICLES;core.ARTICLES=Path(self.temp.name)
        self.app=Flask('presence-test');self.app.config['TESTING']=True
        install_accounts(self.app,core,'presence-admin','AdminPassword1')
        self.admin=self.app.test_client();self.admin.post('/login',data={'login':'presence-admin','password':'AdminPassword1'})
        self.user=self.admin.post('/api/users',json={'name':'Мария Иванова','login':'presence-editor','password':'EditorPassword1','role':'editor'}).json
        self.editor=self.app.test_client();self.login()
    def tearDown(self):core.ARTICLES=self.old;self.temp.cleanup()
    def login(self):return self.editor.post('/login',data={'login':'presence-editor','password':'EditorPassword1'})
    def presence(self):return next(x for x in self.admin.get('/api/users/presence').json if x['id']==self.user['id'])
    def test_continuous_session_gap_and_logout_preserve_last_visit(self):
        now=datetime.now(timezone.utc);started=(now-timedelta(minutes=12)).isoformat()
        database=core.ARTICLES/'_accounts/users.sqlite3'
        with closing(sqlite3.connect(database)) as db,db:db.execute('UPDATE users SET presence_started=?,last_seen=? WHERE id=?',(started,now.isoformat(),self.user['id']))
        self.assertEqual(self.editor.post('/api/presence').status_code,200)
        active=self.presence();self.assertTrue(active['online']);self.assertEqual(active['onlineSince'],started);self.assertGreaterEqual(active['onlineSeconds'],720)
        with closing(sqlite3.connect(database)) as db,db:db.execute('UPDATE users SET last_seen=? WHERE id=?',((now-timedelta(minutes=3)).isoformat(),self.user['id']))
        stale=self.presence();self.assertFalse(stale['online']);self.assertEqual(stale['onlineSeconds'],0);self.assertIsNone(stale['onlineSince'])
        self.editor.post('/api/presence');self.assertNotEqual(self.presence()['onlineSince'],started)
        self.editor.post('/api/logout');offline=self.presence();self.assertFalse(offline['online']);self.assertIsNotNone(offline['lastSeen'])
    def test_avatar_refresh_and_presence_permissions(self):
        image=io.BytesIO();Image.new('RGB',(24,24),(60,120,180)).save(image,format='PNG');image.seek(0)
        result=self.editor.post('/api/profile/avatar',data={'avatar':(image,'demo.png')});self.assertEqual(result.status_code,200)
        item=self.presence();self.assertTrue(item['avatarUrl']);self.assertNotIn('password',item)
        response=self.admin.get(item['avatarUrl'].replace('/editor-api/','/api/'));self.assertEqual(response.status_code,200);response.close()
        self.assertEqual(self.editor.get('/api/users/presence').status_code,403)
        self.assertEqual(self.app.test_client().post('/api/presence').status_code,401)
        self.editor.delete('/api/profile/avatar');self.assertEqual(self.presence()['avatarUrl'],'')
    def test_block_preserves_last_visit_and_rejects_heartbeats(self):
        before=self.presence()['lastSeen']
        self.assertEqual(self.admin.patch('/api/users/'+self.user['id']+'/blocked',json={'blocked':True}).status_code,200)
        item=self.presence();self.assertFalse(item['online']);self.assertEqual(item['lastSeen'],before)
        self.assertEqual(self.editor.post('/api/presence').status_code,403)
    def test_admin_email_access_cannot_be_revoked_by_stored_flag(self):
        database=core.ARTICLES/'_accounts/users.sqlite3'
        with closing(sqlite3.connect(database)) as db,db:db.execute('UPDATE users SET email_access=0 WHERE admin=1')
        self.assertTrue(self.admin.get('/api/me').json['emailAccess'])
        self.assertFalse(self.editor.get('/api/me').json['emailAccess'])

if __name__=='__main__':unittest.main()
