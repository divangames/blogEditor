"""Remote photos must never be downloaded on save or HTML + image export."""
import io
import zipfile
from unittest.mock import patch
from test_article_image_url import core, web
import unittest
from bs4 import BeautifulSoup

class RemoteExportTests(unittest.TestCase):
    def test_save_and_export_both_brands(self):
        client=web.application.test_client()
        client.post('/login',data={'login':'image-demo','password':'ImageDemoOnly123'})
        for brand in ('outmax','hasl'):
            upload=client.post('/api/upload?draft=remote-export&brand='+brand,data=b'local-image',content_type='image/png')
            local=upload.json['src']
            remote=['https://example.com/a.jpg','http://example.com/b.png','//example.com/c.webp']
            body='<h1>Demo</h1><meta name="article-cover" content="'+remote[0]+'">'+''.join('<img src="'+url+'" srcset="https://example.com/large.jpg 2x" alt="Remote">' for url in remote)+'<img src="'+local+'" alt="Local">'
            with patch.object(core,'download_external_image',side_effect=AssertionError('Export/save must not download remote images')) as fetch:
                saved=client.post('/api/save',json={'id':'remote-export','title':'Demo','brand':brand,'body':body,'products':[]})
                self.assertEqual(saved.status_code,200,saved.text)
                self.assertEqual(saved.json['localizedImages'],0)
                record=client.get('/api/draft/remote-export?brand='+brand).json
                self.assertIn(remote[0],record['body'])
                for mode in ('0','1'):
                    result=client.get('/api/export/remote-export?brand='+brand+'&site=both&format=zip&localImages='+mode)
                    self.assertEqual(result.status_code,200,result.text[:100] if result.status_code!=200 else '')
                    with zipfile.ZipFile(io.BytesIO(result.data)) as z:
                        assets=[n for n in z.namelist() if n.endswith(('.png','.jpg','.webp'))]
                        self.assertEqual(len(assets),1,z.namelist())
                        self.assertEqual(z.read(assets[0]),b'local-image')
                        for name in [n for n in z.namelist() if n.endswith('.html')]:
                            soup=BeautifulSoup(z.read(name),'html.parser')
                            images=soup.select('img[alt="Remote"]')
                            self.assertEqual(len(images),3)
                            self.assertEqual(images[0]['src'],remote[0])
                            self.assertEqual(images[1]['src'],remote[1])
                            self.assertTrue(images[2]['src'].endswith('//example.com/c.webp'))
                            self.assertTrue(all(n.get('srcset')=='https://example.com/large.jpg 2x' for n in images))
                fetch.assert_not_called()

if __name__=='__main__':unittest.main()
