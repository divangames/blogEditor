"""Isolated Wordstat contract/security tests. Provider never receives real calls."""
import base64
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
import requests
import app as core

_state = tempfile.TemporaryDirectory(prefix='wordstat-qa-')
core.ARTICLES = Path(_state.name)
os.environ['OUTMAX_USER'] = 'wordstat-demo'
os.environ['OUTMAX_PASSWORD'] = 'wordstat-demo-only'
import wsgi_app as server


class WordstatTests(unittest.TestCase):
    def setUp(self):
        self.client = server.application.test_client()
        self.auth = {'Authorization': 'Basic '+base64.b64encode(b'wordstat-demo:wordstat-demo-only').decode()}
        self.env = patch.dict(os.environ, {'WORDSTAT_API_KEY': 'qa-secret-key', 'WORDSTAT_FOLDER_ID': 'qa-folder'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.provider = patch.object(server.requests, 'post').start()
        self.addCleanup(patch.stopall)
        self.provider.return_value = Mock(status_code=200)
        self.provider.return_value.json.return_value = {'results': []}

    def query(self, data):
        return self.client.post('/editor-api/wordstat/query', json=data, headers=self.auth)

    def test_auth_readonly_and_validation(self):
        self.assertEqual(self.client.get('/api/wordstat/status').status_code, 401)
        status = self.client.get('/editor-api/wordstat/status', headers=self.auth)
        self.assertTrue(status.json['available'])
        self.assertNotIn('qa-secret-key', status.text)
        for data in ([], {}, {'mode': []}, {'mode':'top','phrase':''}, {'mode':'top','phrase':1},
                     {'mode':'top','phrase':'a'*401}, {'mode':'top','phrase':'x','regions':['invalid']},
                     {'mode':'dynamics','phrase':'x','fromDate':'2026-02-30','toDate':'2026-03-01'},
                     {'mode':'dynamics','phrase':'x','fromDate':'2026-03-10','toDate':'2026-03-01'},
                     {'mode':'regions','phrase':'x','region':'unknown'}):
            self.assertEqual(self.query(data).status_code, 400, data)
        self.provider.assert_not_called()
        with patch.dict(os.environ, {'WORDSTAT_API_KEY':'','WORDSTAT_FOLDER_ID':''}):
            self.assertEqual(self.query({'mode':'top','phrase':'x'}).status_code,503)

    def test_contract_all_modes(self):
        self.provider.return_value.json.return_value = {
            'totalCount':'9007199254740993', 'results':[{'phrase':'кроссовки','count':'12'}],
            'associations':[{'phrase':'обувь','count':'8'}], 'secret':'must not leak'}
        result = self.query({'mode':'top','phrase':'!кроссовки','regions':['213'],'device':'DEVICE_PHONE','folderId':'attacker'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['totalCount'],'9007199254740993')
        self.assertNotIn('secret',result.json)
        args = self.provider.call_args
        self.assertTrue(args.args[0].endswith('/v2/wordstat/topRequests'))
        self.assertEqual(args.kwargs['json'], {'phrase':'!кроссовки','devices':['DEVICE_PHONE'],'regions':['213'],'numPhrases':'100','folderId':'qa-folder'})
        self.assertEqual(args.kwargs['headers']['Authorization'],'Api-Key qa-secret-key')
        self.assertFalse(args.kwargs['allow_redirects'])
        self.provider.return_value.json.return_value={'results':[{'date':'2026-01-01T00:00:00Z','count':'10','share':'0.1'}]}
        result=self.query({'mode':'dynamics','phrase':'обувь','fromDate':'2026-01-01','toDate':'2026-01-31','period':'PERIOD_MONTHLY'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.provider.call_args.kwargs['json']['fromDate'],'2026-01-01T00:00:00Z')
        self.provider.return_value.json.return_value={'results':[{'region':'213','count':'10','share':'0.1','affinityIndex':'1.5'}]}
        result=self.query({'mode':'regions','phrase':'обувь','region':'REGION_CITIES','regions':['213']})
        self.assertEqual(result.json['results'][0]['region'],'213')
        self.assertNotIn('regions',self.provider.call_args.kwargs['json'])
        self.provider.return_value.json.return_value={'regions':[{'id':'1','label':'Россия','children':[{'id':'213','label':'Москва'}]}]}
        result=self.query({'mode':'tree'})
        self.assertEqual(result.json['regions'][0]['children'][0]['name'],'Москва')
        self.assertEqual(self.provider.call_args.kwargs['json'],{'folderId':'qa-folder'})

    def test_errors_no_retry_no_provider_diagnostics(self):
        for status in [302,400,401,403,429,500]:
            self.provider.reset_mock()
            self.provider.return_value.status_code=status
            self.provider.return_value.json.return_value={'error':'qa-secret-key'}
            result=self.query({'mode':'top','phrase':'обувь'})
            self.assertEqual(result.status_code,502)
            self.assertNotIn('qa-secret-key',result.text)
            self.assertEqual(self.provider.call_count,1)
        self.provider.side_effect=requests.Timeout('qa-secret-key')
        self.assertNotIn('qa-secret-key',self.query({'mode':'tree'}).text)
        self.provider.side_effect=None
        self.provider.return_value.status_code=200
        for bad in ([], {'results':False}, {'results':[None]}):
            self.provider.return_value.json.return_value=bad
            self.assertEqual(self.query({'mode':'top','phrase':'x'}).status_code,502)

    def test_admin_encrypted_configuration_and_csrf(self):
        with patch.dict(os.environ, {'WORDSTAT_API_KEY':'','WORDSTAT_FOLDER_ID':''}):
            url='/api/wordstat/configure'
            self.assertEqual(self.client.post(url,json={'clear':True},headers={**self.auth,'Origin':'https://evil.example'}).status_code,403)
            with server.application.test_request_context(url,method='POST',json={'clear':True}):
                server.g.editor_user={'role':'editor'}
                self.assertEqual(server.wordstat_configure()[1],403)
            result=self.client.post(url,json={'apiKey':'saved-secret-key','folderId':'folder-demo'},headers=self.auth)
            self.assertEqual(result.status_code,200)
            self.assertNotIn('saved-secret-key',result.text)
            self.assertNotIn('saved-secret-key',(core.ARTICLES/'_accounts/wordstat.json').read_text())
            self.assertEqual(server.wordstat_config()['key'],'saved-secret-key')
            self.assertEqual(self.client.post(url,json={'folderId':'other-folder'},headers=self.auth).status_code,200)
            self.assertEqual(server.wordstat_config()['key'],'saved-secret-key')
            result=self.client.post(url,json={'clear':True},headers=self.auth)
            self.assertFalse(result.json['available'])
        self.assertEqual(self.client.post('/api/wordstat/configure',json={'clear':True},headers=self.auth).status_code,409)
        self.provider.assert_not_called()


if __name__ == '__main__':
    unittest.main()
