"""Provider is mocked. No paid calls or real document data."""
import os
import unittest
from unittest.mock import patch, Mock
import requests
import tempfile
from pathlib import Path
import app as core

# Separate demo storage; do not read or change the local production accounts.
_state = tempfile.TemporaryDirectory(prefix='article-assist-qa-')
core.ARTICLES = Path(_state.name)
os.environ['OUTMAX_USER'] = 'assist-demo'
os.environ['OUTMAX_PASSWORD'] = 'assist-demo-test-only'
import wsgi_app as server


class ArticleAssistTests(unittest.TestCase):
    def setUp(self):
        self.client = server.application.test_client()
        self.auth = {'Authorization': 'Basic ' + __import__('base64').b64encode(
            (server.AUTH_USER + ':' + server.AUTH_PASSWORD).encode()).decode()}

    def test_disabled_validation_auth_and_no_provider_calls(self):
        with patch.dict(os.environ, {'ARTICLE_AI_API_KEY':'', 'ARTICLE_AI_MODEL':''}), patch.object(server.requests,'post') as provider:
            self.assertEqual(self.client.get('/api/article-assist/status').status_code, 401)
            self.assertFalse(self.client.get('/editor-api/article-assist/status',headers=self.auth).json['available'])
            for payload in ([], {'text':'x','task':'unknown'}, {'text':2,'task':'correct'}, {'text':'x'*8001,'task':'correct'}):
                self.assertEqual(self.client.post('/api/article-assist/propose',json=payload,headers=self.auth).status_code,400)
            self.assertEqual(self.client.post('/api/article-assist/propose',json={'text':'Текст','task':'shorten'},headers=self.auth).status_code,503)
            provider.assert_not_called()

    def test_success_errors_and_key_not_exposed(self):
        with patch.dict(os.environ, {'ARTICLE_AI_API_KEY':'test-provider-secret', 'ARTICLE_AI_MODEL':'configured-model'}), patch.object(server.requests,'post') as provider:
            provider.return_value=Mock(status_code=200)
            provider.return_value.json.return_value={'choices':[{'message':{'content':'Исправленный текст 👟'}}]}
            result=self.client.post('/api/article-assist/propose',json={'text':'Исходник 👟','task':'correct'},headers=self.auth)
            self.assertEqual(result.json,{'text':'Исправленный текст 👟'})
            self.assertEqual(provider.call_args.kwargs['json']['messages'][1]['content'],'Исходник 👟')
            self.assertNotIn('test-provider-secret',self.client.get('/api/article-assist/status',headers=self.auth).text)
            provider.return_value.status_code=429
            self.assertEqual(self.client.post('/api/article-assist/propose',json={'text':'Текст','task':'correct'},headers=self.auth).status_code,502)
            provider.return_value.status_code=200;provider.return_value.json.return_value={}
            self.assertEqual(self.client.post('/api/article-assist/propose',json={'text':'Текст','task':'correct'},headers=self.auth).status_code,502)
            provider.return_value.json.return_value={'choices':[{'finish_reason':'length','message':{'content':'Незавершённый текст'}}]}
            self.assertEqual(self.client.post('/api/article-assist/propose',json={'text':'Текст','task':'correct'},headers=self.auth).status_code,502)
            provider.side_effect=requests.Timeout()
            self.assertEqual(self.client.post('/api/article-assist/propose',json={'text':'Текст','task':'correct'},headers=self.auth).status_code,502)

    def test_credit_balance_error_is_clear_and_does_not_expose_provider_message(self):
        with patch.dict(os.environ, {'ARTICLE_AI_API_KEY':'test-provider-secret', 'ARTICLE_AI_MODEL':'configured-model'}), patch.object(server.requests, 'post') as provider:
            provider.return_value = Mock(status_code=429)
            provider.return_value.json.return_value = {'error':{'code':'credit_balance_exhausted', 'type':'insufficient_quota', 'message':'Untrusted provider message test-provider-secret'}}
            result = self.client.post('/api/article-assist/propose', json={'text':'Демонстрационный текст', 'task':'correct'}, headers=self.auth)
            self.assertEqual(result.status_code, 502)
            self.assertIn('API-баланс OpenAI исчерпан', result.json['error'])
            self.assertIn('Исходный текст сохранён', result.json['error'])
            self.assertNotIn('test-provider-secret', result.text)
            self.assertNotIn('Untrusted provider message', result.text)
            self.assertEqual(provider.call_count, 1)
            provider.return_value.json.return_value = {'error':{'code':'rate_limit_exceeded'}}
            result = self.client.post('/api/article-assist/propose', json={'text':'Текст', 'task':'correct'}, headers=self.auth)
            self.assertNotIn('баланс', result.json['error'])
            provider.return_value.json.side_effect = ValueError('Malformed response')
            self.assertEqual(self.client.post('/api/article-assist/propose', json={'text':'Текст', 'task':'correct'}, headers=self.auth).status_code, 502)

    def test_admin_configuration_encrypted_persistence_and_role(self):
        with patch.dict(os.environ, {'ARTICLE_AI_API_KEY':'', 'ARTICLE_AI_MODEL':''}):
            try:
                result=self.client.post('/api/article-assist/configure',json={'apiKey':'sk-qa-only-secret','model':'test-model'},headers=self.auth)
                self.assertEqual(result.status_code,200)
                saved=(core.ARTICLES/'_accounts/article-ai.json').read_text()
                self.assertNotIn('sk-qa-only-secret',saved)
                self.assertEqual(server.article_assist_config()['key'],'sk-qa-only-secret')
                status=self.client.get('/api/article-assist/status',headers=self.auth)
                self.assertTrue(status.json['available']);self.assertNotIn('sk-qa-only-secret',status.text)
                self.assertEqual(self.client.post('/api/article-assist/configure',json={'model':'new-model'},headers=self.auth).status_code,200)
                self.assertEqual(server.article_assist_config()['model'],'new-model')
                with server.application.test_request_context('/api/article-assist/configure',method='POST',json={'clear':True}):
                    server.g.editor_user={'role':'editor'}
                    self.assertEqual(server.article_assist_configure()[1],403)
                self.assertEqual(self.client.post('/api/article-assist/configure',json={'apiKey':'bad\nkey','model':'valid'},headers=self.auth).status_code,400)
            finally:
                self.client.post('/api/article-assist/configure',json={'clear':True},headers=self.auth)
            self.assertFalse(server.article_assist_configured())


if __name__ == '__main__':
    unittest.main()
