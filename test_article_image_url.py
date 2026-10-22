"""URL image upload uses existing scoped storage and downloader; no live requests."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

if len(sys.argv)>1 and sys.argv[1].startswith('--package='):
    sys.path.insert(0,sys.argv.pop(1).split('=',1)[1])
os.environ['OUTMAX_USER']='image-demo'
os.environ['OUTMAX_PASSWORD']='ImageDemoOnly123'
import app as core
state=tempfile.TemporaryDirectory(prefix='image-url-qa-')
core.ARTICLES=Path(state.name)
import wsgi_app as web

class ImageUrlTests(unittest.TestCase):
    def setUp(self):
        self.client=web.application.test_client()
        self.client.post('/login',data={'login':'image-demo','password':'ImageDemoOnly123'})

    def test_scoped_upload_both_brands_and_no_overwrite(self):
        for brand in ('outmax','hasl'):
            with patch.object(core,'download_external_image',return_value=(b'image-data','.png')) as fetch:
                url='/editor-api/upload?draft=url-photo&brand='+brand
                first=self.client.post(url,json={'url':'https://example.com/photo.png'})
                second=self.client.post(url,json={'url':'https://example.com/photo.png'})
                self.assertEqual(first.status_code,200,first.text)
                self.assertNotEqual(first.json['src'],second.json['src'])
                fetch.assert_called_with('https://example.com/photo.png')
                expected='hasl--url-photo_files/' if brand=='hasl' else 'url-photo_files/'
                self.assertTrue(first.json['src'].startswith(expected))
                self.assertTrue(any(p.read_bytes()==b'image-data' for p in core.ARTICLES.rglob(Path(first.json['src']).name)))

    def test_failures_and_legacy_file_upload(self):
        for payload in ({},[],{'url':12},{'url':'file:///secret'},{'url':'http://127.0.0.1/photo.png'}):
            self.assertEqual(self.client.post('/api/upload',json=payload).status_code,400)
        for error in (ValueError('Ссылка не ведёт на поддерживаемое изображение'),core.requests.Timeout()):
            with patch.object(core,'download_external_image',side_effect=error):
                self.assertEqual(self.client.post('/api/upload',json={'url':'https://example.com/x'}).status_code,400)
        self.assertEqual(self.client.post('/api/upload',data=b'old-file-upload',content_type='image/png').status_code,200)
        anonymous=web.application.test_client()
        self.assertNotEqual(anonymous.post('/api/upload',json={'url':'https://example.com/x'}).status_code,200)

    def test_downloader_redirect_mime_size_empty(self):
        address=[(2,1,6,'',('93.184.216.34',443))]
        with patch.object(core.socket,'getaddrinfo',return_value=address):
            for mime,chunks in [('text/html',[b'page']),('image/png',[b'x'*(core.MAX_IMAGE+1)]),('image/png',[])]:
                response=Mock(is_redirect=False,headers={'Content-Type':mime})
                response.iter_content.return_value=chunks
                session=Mock();session.get.return_value=response
                with patch.object(core.IMAGE_HTTP,'session',session,create=True):
                    with self.assertRaises(ValueError):core.download_external_image('https://example.com/image')
        response=Mock(is_redirect=True,headers={'Location':'http://127.0.0.1/private'})
        session=Mock();session.get.return_value=response
        real=core.socket.getaddrinfo
        with patch.object(core.socket,'getaddrinfo',side_effect=lambda host,*a,**k:address if host=='example.com' else real(host,*a,**k)),patch.object(core.IMAGE_HTTP,'session',session,create=True):
            with self.assertRaises(ValueError):core.download_external_image('https://example.com/image')
            self.assertEqual(session.get.call_count,1)

    def test_pages_contain_url_control(self):
        for url in ('/','/hasl/'):
            self.assertIn(b'id="image-url-load"',self.client.get(url).data)

if __name__=='__main__':unittest.main()
