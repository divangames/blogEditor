"""Isolated LPmotor configuration/access contract; external API is mocked."""
import base64
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import requests
import app as core
import lpmotor_client as lp

_state = tempfile.TemporaryDirectory(prefix='lpmotor-qa-')
core.ARTICLES = Path(_state.name)
os.environ['OUTMAX_USER'] = 'lp-demo'
os.environ['OUTMAX_PASSWORD'] = 'lp-demo-only'
import wsgi_app as web


class LPmotorTests(unittest.TestCase):
    def setUp(self):
        self.client = web.application.test_client()
        self.auth = {'Authorization': 'Basic ' + base64.b64encode(b'lp-demo:lp-demo-only').decode()}
        (core.ARTICLES / '_accounts' / 'lpmotor.enc').unlink(missing_ok=True)
        self.data = {'login': 'demo@example.test', 'password': 'Demo-only-password',
                     'apiKey': 'demo-only-api-secret', 'userId': '12345'}
        self.provider = patch.object(lp.requests, 'get').start()
        self.addCleanup(patch.stopall)
        self.provider.return_value = Mock(status_code=200)
        self.provider.return_value.json.return_value = {'count': 2, 'sites': [{'id': 9, 'title': 'Demo'}]}

    def post(self, action, data=None, **kwargs):
        return self.client.post('/editor-api/lpmotor/' + action, json=data or {}, headers=kwargs.get('headers', self.auth))

    def test_encrypted_import_status_partial_and_missing_id(self):
        partial = {**self.data, 'userId': ''}
        result = self.post('configure', partial)
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json['needsUserId'])
        self.assertFalse(result.json['configured'])
        self.assertEqual(self.post('check').status_code, 502)
        self.provider.assert_not_called()
        encrypted = (core.ARTICLES / '_accounts' / 'lpmotor.enc').read_bytes()
        for secret in self.data.values():
            self.assertNotIn(secret.encode(), encrypted)
            self.assertNotIn(secret, result.text)
        self.assertEqual(lp.load_config(core.ARTICLES), partial)
        self.assertTrue(self.post('configure', {'userId': '12345'}).json['configured'])
        status = self.client.get('/api/lpmotor/status', headers=self.auth)
        self.assertTrue(status.json['cabinetCredentialsStored'])
        self.provider.assert_not_called()

    def test_auth_csrf_validation_and_private_paths(self):
        self.assertEqual(self.client.get('/api/lpmotor/status').status_code, 401)
        for action, method in [('status', 'GET'), ('configure', 'POST'), ('check', 'POST')]:
            with web.application.test_request_context('/api/lpmotor/' + action, method=method):
                web.g.editor_user = {'role': 'editor'}
                self.assertEqual(web.application.view_functions['lpmotor'](action)[1], 403)
        self.assertEqual(self.post('configure', self.data, headers={**self.auth, 'Origin': 'https://evil.example'}).status_code, 403)
        for data in [{'userId': 'mail@example.test'}, {'apiKey': 'bad\r\nheader'}, {'userId': []}, {'extra': 'x'}]:
            self.assertEqual(self.post('configure', data).status_code, 400)
        self.post('configure', self.data)
        for path in ['/docs/passwordLP.txt', '/articles/_accounts/lpmotor.enc', '/articles/_accounts/key']:
            response = self.client.get(path, headers=self.auth)
            self.assertNotEqual(response.status_code, 200, path)
        self.provider.assert_not_called()

    def test_readonly_check_and_sanitized_errors(self):
        self.post('configure', self.data)
        result = self.post('check')
        self.assertEqual(result.json, {'ok': True, 'siteCount': 2})
        args = self.provider.call_args
        self.assertEqual(args.args, (lp.API_URL,))
        self.assertEqual(args.kwargs['headers']['Authorization'], 'Bearer ' + self.data['apiKey'])
        self.assertEqual(args.kwargs['headers']['X-Api-User-Id'], '12345')
        self.assertNotIn(self.data['password'], str(args))
        self.assertFalse(args.kwargs['allow_redirects'])
        for code in [302, 401, 403, 429, 500]:
            self.provider.return_value.status_code = code
            self.provider.return_value.json.return_value = {'error': self.data['apiKey']}
            result = self.post('check')
            self.assertEqual(result.status_code, 502)
            self.assertNotIn(self.data['apiKey'], result.text)
        self.provider.side_effect = requests.Timeout(self.data['password'])
        self.assertNotIn(self.data['password'], self.post('check').text)
        self.provider.side_effect = None
        self.provider.return_value.status_code = 200
        for payload in [[], {}, {'count': True, 'sites': []}, {'count': 1, 'sites': 'bad'}]:
            self.provider.return_value.json.return_value = payload
            self.assertEqual(self.post('check').status_code, 502)


if __name__ == '__main__':
    unittest.main()
