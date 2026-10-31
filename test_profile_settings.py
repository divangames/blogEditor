"""Self-profile permissions, existing sessions, image validation and mocked Cloud billing."""
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

from flask import Flask
from PIL import Image
import app as core
import account_profile
from accounts import install_accounts


class ProfileSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=core.ARTICLES;core.ARTICLES=Path(self.temp.name)
        self.app=Flask('profile-test');self.app.config['TESTING']=True
        install_accounts(self.app,core,'profile-admin','AdminTestPassword1')
        self.admin=self.app.test_client();self.admin.post('/login',data={'login':'profile-admin','password':'AdminTestPassword1'})
        response=self.admin.post('/api/users',json={'name':'Мария Иванова','login':'profile-editor','password':'EditorTestPassword1','role':'editor'})
        self.uid=response.json['id'];self.editor=self.app.test_client();self.login(self.editor)

    def tearDown(self):
        core.ARTICLES=self.old;self.temp.cleanup()

    def login(self,client,password='EditorTestPassword1'):
        return client.post('/login',data={'login':'profile-editor','password':password})

    def test_self_details_do_not_change_permissions_or_password(self):
        me=self.editor.get('/api/me').json;self.assertEqual(me['firstName'],'Мария');self.assertEqual(me['lastName'],'Иванова')
        data={'firstName':'Анна','lastName':'Петрова','telegram':'https://t.me/profile_demo'}
        result=self.editor.patch('/api/profile',json=data);self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['user']['name'],'Анна Петрова');self.assertEqual(result.json['user']['telegram'],'profile_demo')
        self.assertFalse(result.json['user']['admin']);self.assertNotIn('password',result.json['user'])
        self.assertEqual(self.editor.patch('/api/profile',json={**data,'role':'admin'}).status_code,400)
        self.assertEqual(self.editor.patch('/api/profile',json={**data,'telegram':'https://evil.invalid/name'}).status_code,400)
        self.assertEqual(self.editor.patch('/api/profile',json=data,headers={'Origin':'https://evil.invalid'}).status_code,403)
        self.assertEqual(self.app.test_client().get('/api/me').status_code,401)

    def test_password_requires_current_and_revokes_old_sessions(self):
        other=self.app.test_client();self.login(other)
        self.assertEqual(self.editor.post('/api/profile/password',json={'currentPassword':'wrong','newPassword':'NewEditorPassword2'}).status_code,400)
        result=self.editor.post('/api/profile/password',json={'currentPassword':'EditorTestPassword1','newPassword':'NewEditorPassword2'})
        self.assertEqual(result.status_code,200);self.assertEqual(len(result.json['context']),64)
        self.assertEqual(self.editor.get('/api/me').status_code,200);self.assertEqual(other.get('/api/me').status_code,401)
        fresh=self.app.test_client();self.assertIn('loginError=1',self.login(fresh).headers['Location']);self.assertEqual(fresh.get('/api/me').status_code,401);self.assertEqual(self.login(fresh,'NewEditorPassword2').status_code,302)
        self.assertEqual(self.admin.get('/api/me').status_code,200)

    def test_avatar_decodes_and_removes_metadata_and_rejects_svg(self):
        image=Image.new('RGB',(1000,800),'red');buffer=io.BytesIO();image.save(buffer,format='JPEG')
        result=self.editor.post('/api/profile/avatar',data={'avatar':(io.BytesIO(buffer.getvalue()),'photo.jpg')})
        self.assertEqual(result.status_code,200);url=result.json['user']['avatarUrl'].replace('/editor-api/','/api/')
        response=self.editor.get(url);self.assertEqual(response.status_code,200);self.assertEqual(response.mimetype,'image/png')
        photo=Image.open(io.BytesIO(response.data));self.assertLessEqual(max(photo.size),512);response.close()
        self.assertEqual(self.editor.post('/api/profile/avatar',data={'avatar':(io.BytesIO(b'<svg onload="alert(1)"/>'),'test.svg')}).status_code,400)
        self.assertEqual(self.editor.get('/api/me').json['avatarUrl'],result.json['user']['avatarUrl'])
        self.assertEqual(self.editor.delete('/api/profile/avatar').json['user']['avatarUrl'],'')

    def test_impersonation_cannot_change_user_profile_or_read_billing(self):
        self.assertEqual(self.admin.post('/api/impersonation/start',json={'userId':self.uid}).status_code,200)
        self.assertEqual(self.admin.patch('/api/profile',json={'firstName':'Другой','lastName':'','telegram':''}).status_code,403)
        self.assertEqual(self.admin.post('/api/profile/password',json={'currentPassword':'EditorTestPassword1','newPassword':'ChangedPassword2'}).status_code,403)
        self.assertEqual(self.admin.get('/api/profile/cloud-balance').status_code,403)
        self.assertEqual(self.editor.get('/api/profile/cloud-balance').status_code,403)

    def test_billing_reads_existing_connection_and_never_returns_secret(self):
        response=Mock(ok=True,status_code=200);response.json.return_value={'billingAccounts':[{'id':'account-test','name':'Тестовый аккаунт','balance':'1234.56','currency':'RUB'}]}
        with patch.dict('os.environ',{'YANDEX_CLOUD_IAM_TOKEN':'fake-private-token'}),patch.object(account_profile.requests,'get',return_value=response) as get:
            result=self.admin.get('/api/profile/cloud-balance');self.assertEqual(result.status_code,200);self.assertEqual(result.json['balance'],'1234.56')
            self.assertNotIn('fake-private-token',result.get_data(as_text=True));self.assertEqual(get.call_args.kwargs['headers']['Authorization'],'Bearer fake-private-token')
        response.status_code=403;response.ok=False;response.json.return_value={'error':'fake-private-token'}
        with patch.dict('os.environ',{'YANDEX_CLOUD_IAM_TOKEN':'fake-private-token'}),patch.object(account_profile.requests,'get',return_value=response):
            result=self.admin.get('/api/profile/cloud-balance');self.assertEqual(result.status_code,503);self.assertNotIn('fake-private-token',result.get_data(as_text=True))
        self.assertEqual(self.admin.get('/api/profile/cloud-balance?accountId=../../etc').status_code,400)


if __name__=='__main__':unittest.main()
