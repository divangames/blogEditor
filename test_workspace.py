"""Workspace routes stay authenticated and reuse account-scoped archives."""
import unittest
from test_article_image_url import core, web

class WorkspaceTests(unittest.TestCase):
    def test_routes_and_personal_archives(self):
        anonymous=web.application.test_client()
        self.assertEqual(anonymous.get('/').status_code,302)
        self.assertEqual(anonymous.get('/workspace.js').status_code,302)
        client=web.application.test_client()
        client.post('/login',data={'login':'image-demo','password':'ImageDemoOnly123'})
        home=client.get('/')
        self.assertEqual(home.status_code,200)
        self.assertIn('Последние работы',home.text)
        self.assertIn('id="tools"',home.text)
        self.assertNotIn('id="canvas"',home.text)
        editor=client.get('/articles/')
        self.assertIn('id="canvas"',editor.text)
        editor.close()
        self.assertEqual(client.get('/workspace.js').status_code,200)
        self.assertEqual(client.post('/api/save',json={'id':'workspace-private','title':'Личная работа','body':'<p>Личный текст</p>','products':[]}).status_code,200)
        self.assertTrue(any(x['id']=='workspace-private' for x in client.get('/api/drafts').json))
        created=client.post('/api/users',json={'name':'Другой демо-пользователь','login':'workspace-other','password':'WorkspaceOtherOnly123','role':'editor','emailAccess':False})
        self.assertEqual(created.status_code,201)
        other=web.application.test_client()
        self.assertEqual(other.post('/login',data={'login':'workspace-other','password':'WorkspaceOtherOnly123'}).status_code,302)
        self.assertFalse(any(x['id']=='workspace-private' for x in other.get('/api/drafts').json))
        self.assertEqual(other.get('/api/draft/workspace-private').status_code,404)
        self.assertEqual(other.get('/api/email-projects').status_code,403)
        self.assertEqual(other.get('/').status_code,200)

if __name__=='__main__':unittest.main()
