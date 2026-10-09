import importlib,json,tempfile,unittest
from pathlib import Path
import app as core
class CleanupTests(unittest.TestCase):
 def test_article_deletion_removes_assets_history_and_preview(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as folder:
   core.ARTICLES=Path(folder)
   try:
    server=importlib.import_module('wsgi_app');client=server.application.test_client()
    client.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
    data={'id':'cleanup-article','title':'Проверка удаления','body':'<p>Текст</p>','products':[],'requestId':'create'}
    first=client.post('/api/save',json=data);self.assertEqual(first.status_code,200)
    file=next(Path(folder).rglob('cleanup-article.json'));record=json.loads(file.read_text(encoding='utf-8'));history=file.parent/'_article_history'/record['documentId'];self.assertTrue(history.exists())
    assets=file.parent/'cleanup-article_files';assets.mkdir(exist_ok=True);(assets/'photo.png').write_bytes(b'test')
    preview=client.post('/api/preview/cleanup-article');self.assertEqual(preview.status_code,200)
    result=client.delete('/api/draft/cleanup-article');self.assertEqual(result.status_code,200)
    self.assertFalse(file.exists());self.assertFalse(assets.exists());self.assertFalse(history.exists());self.assertFalse(file.with_suffix('.html').exists())
   finally:core.ARTICLES=original
if __name__=='__main__':unittest.main()
