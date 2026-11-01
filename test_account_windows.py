"""Account windows reuse account components without starting an editor."""
import tempfile
import unittest
from pathlib import Path

from flask import Flask
import app as core
from accounts import install_accounts


class AccountWindowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = core.ARTICLES
        core.ARTICLES = Path(self.temp.name)
        self.app = Flask('account-window-test')
        self.app.config['TESTING'] = True
        install_accounts(self.app, core, 'window-admin', 'WindowAdminPassword1')
        self.admin = self.app.test_client()
        self.admin.post('/login', data={'login': 'window-admin', 'password': 'WindowAdminPassword1'})
        self.clients = {'admin': self.admin}
        for role in ('moderator', 'editor'):
            self.admin.post('/api/users', json={'name': 'Demo', 'login': 'window-' + role,
                'password': 'WindowUserPassword1', 'role': role})
            client = self.app.test_client()
            client.post('/login', data={'login': 'window-' + role, 'password': 'WindowUserPassword1'})
            self.clients[role] = client

    def tearDown(self):
        core.ARTICLES = self.old
        self.temp.cleanup()

    def test_permissions_are_checked_on_the_server(self):
        for role, client in self.clients.items():
            for view in ('articles', 'about', 'feedback', 'users', 'archives', 'impersonation'):
                allowed = view in ('articles', 'about', 'feedback') or (
                    view in ('users', 'archives') and role != 'editor') or (
                    view == 'impersonation' and role == 'admin')
                self.assertEqual(client.get('/account-window/?view=' + view).status_code,
                                 200 if allowed else 403, (role, view))
        self.assertEqual(self.admin.get('/account-window/?view=unknown').status_code, 400)
        self.assertEqual(self.app.test_client().get('/account-window/?view=users').status_code, 302)

    def test_shell_has_no_editor_document_and_does_not_create_materials(self):
        before = sorted(str(p.relative_to(core.ARTICLES)) for p in core.ARTICLES.rglob('*'))
        response = self.admin.get('/account-window/?view=articles&brand=hasl')
        html = response.get_data(as_text=True)
        self.assertIn('window.__ACCOUNT_WINDOW__=true', html)
        self.assertIn('editor-account-context', html)
        for element in ('id="content"', 'id="canvas"', 'id="page-title"', 'src="editor.js"'):
            self.assertNotIn(element, html)
        self.assertEqual(response.headers['X-Frame-Options'], 'SAMEORIGIN')
        self.assertIn("frame-ancestors 'self'", response.headers['Content-Security-Policy'])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(before, sorted(str(p.relative_to(core.ARTICLES)) for p in core.ARTICLES.rglob('*')))


if __name__ == '__main__':
    unittest.main()
