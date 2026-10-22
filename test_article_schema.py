"""Article JSON-LD stays with article metadata and remains inert on export."""
import json
import io
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from bs4 import BeautifulSoup
import app


class ArticleSchemaTests(unittest.TestCase):
    def test_invalid_imported_author_dates_and_urls(self):
        original={'@type':'Article','author':['Автор',None,42,{'@type':'Product','name':'Редакция','url':'javascript:alert(1)'}],
                  'publisher':0,'datePublished':'2026-02-30','dateModified':'вчера','url':'javascript:alert(1)','@id':42}
        body=app.serialize_article_structured_data([original])+'<h1>Проверка</h1><p>Статья</p>'
        for render in (app.document,app.admin_document):
            result=app.read_article_structured_data(BeautifulSoup(render('Проверка',body),'html.parser'))[0]
            self.assertEqual(result['author'][0],{'@type':'Person','name':'Автор'})
            self.assertEqual(result['author'][1],{'@type':'Person','name':'Редакция'})
            for key in ('publisher','datePublished','dateModified','url','@id'):self.assertNotIn(key,result)
        self.assertIn('javascript',body)
    def test_overflowing_import_does_not_break_export(self):
        for number in ('1e999', '-1e999', 'NaN', 'Infinity'):
            body='<script type="application/ld+json">{"@type":"Article","author":{"name":"Bad","rating":'+number+'}}</script><h1>Safe</h1>'
            for render in (app.document, app.admin_document):
                value=app.read_article_structured_data(BeautifulSoup(render('Safe',body),'html.parser'))[0]
                self.assertEqual(value['headline'],'Safe')
                self.assertNotIn('author',value)

    def test_invalid_image_candidates_are_skipped(self):
        for bad in ('https://', 'https://user:secret@example.com/a.jpg', 'https://example.com:99999/a.jpg', 'https://exa mple.com/a.jpg', 'blob:local', 'data:image/png;base64,AA'):
            with self.subTest(bad=bad):
                html=app.admin_document('Test','<h1>Test</h1><img src="'+bad+'"><img src="https://example.com/good.jpg">')
                value=app.read_article_structured_data(BeautifulSoup(html,'html.parser'))[0]
                self.assertEqual(value['image'],'https://example.com/good.jpg')

    def test_local_zip_selected_cover_and_domains(self):
        body='<meta name="article-cover" content="https://example.com/b.png"><h1>Test</h1><img src="https://example.com/a.png"><img src="https://example.com/b.png">'
        record={'title':'Test','body':body}
        with TemporaryDirectory() as folder,patch.object(app,'download_external_image',return_value=(b'demo-image','.png')):
            for brand in ('outmax','hasl'):
                with zipfile.ZipFile(io.BytesIO(app.export_archive('schema-demo',record,Path(folder),['ru','com'],True,brand))) as archive:
                    for site in ('ru','com'):
                        html=BeautifulSoup(archive.read(app.export_filename('schema-demo',site,brand)),'html.parser')
                        article=app.read_article_structured_data(html.head)[0]
                        target=html.select('img')[1]['src']
                        domain=app.brand_sites(brand)[site].encode('idna').decode('ascii')
                        self.assertEqual(article['image'],'https://'+domain+target)
                        self.assertIn(target.lstrip('/'),archive.namelist())
                        self.assertEqual(html.select_one('meta[name=article-cover]')['content'],target)
                        self.assertFalse(html.body.select('script[type="application/ld+json"]'))
            self.assertEqual(record['body'],body)
    def test_selected_cover_and_fallback(self):
        body='<meta name="article-cover" content="https://example.com/b.jpg"><h1>Фото</h1><img src="https://example.com/a.jpg"><img src="https://example.com/b.jpg">'
        for render in (app.document, app.admin_document):
            html=BeautifulSoup(render('Фото',body,'hasl'),'html.parser')
            self.assertEqual(app.read_article_structured_data(html)[0]['image'],'https://example.com/b.jpg')
            self.assertEqual(len(html.head.select('meta[name="article-cover"]')),1)
            self.assertFalse(html.body.select('meta[name="article-cover"]'))
        metadata,_=app.split_article_metadata(body.replace('<img src="https://example.com/b.jpg">',''),'Фото')
        self.assertEqual(app.read_article_structured_data(BeautifulSoup(metadata,'html.parser'))[0]['image'],'https://example.com/a.jpg')
    def test_both_generators_and_brands(self):
        description = 'Советы & "фото" 👟 </script><img src=x onerror=alert(1)>'
        original = {'@context': 'https://schema.org', '@graph': [
            {'@type': 'Article', 'headline': 'Старое', 'author': {'@type': 'Person', 'name': 'Автор'}, 'datePublished': '2026-10-01T12:00:00+07:00'},
            {'@type': 'BreadcrumbList', 'itemListElement': []}, {'@type': 'NewsArticle', 'headline': 'Дубликат'}]}
        body = '<h1>Обувь <em>для осени</em></h1><p>Текст</p><img src="https://example.com/photo.jpg" alt="Обувь">'
        metadata = '<meta name="description" content="' + app.escape(description, quote=True) + '">'
        content = metadata + app.serialize_article_structured_data([original]) + body
        for render in (app.document, app.admin_document):
            for brand in ('outmax', 'hasl'):
                with self.subTest(render=render.__name__, brand=brand):
                    html = render('Название', content, brand)
                    doc = BeautifulSoup(html, 'html.parser')
                    values = app.read_article_structured_data(doc.head)
                    self.assertEqual(values[0]['@type'], 'Article')
                    self.assertEqual(values[0]['headline'], 'Обувь для осени')
                    self.assertEqual(values[0]['description'], description)
                    self.assertEqual(values[0]['image'], 'https://example.com/photo.jpg')
                    self.assertEqual(values[0]['author']['name'], 'Автор')
                    self.assertEqual(values[1]['@graph'][0]['@type'], 'BreadcrumbList')
                    self.assertFalse(doc.body.select('script[type="application/ld+json"],meta[name=description]'))
                    self.assertEqual(len(doc.select('img')), 1)
                    self.assertIn('\\u003c/script>', html)
        self.assertEqual(app.split_article_metadata(content, 'Название')[1], body)

    def test_legacy_empty_malformed_and_private_images(self):
        for prefix in ('', '<script type="application/ld+json">{bad}</script>', '<script type="application/ld+json">null</script>', '<script type="application/ld+json">NaN</script>'):
            meta, body = app.split_article_metadata(prefix+'<p>Текст</p><img src="blob:private">', 'Название')
            article = app.read_article_structured_data(BeautifulSoup(meta, 'html.parser'))[0]
            self.assertEqual(article['headline'], 'Название')
            self.assertEqual(article['inLanguage'], 'ru')
            for name in ('author', 'datePublished', 'dateModified', 'description', 'image'):
                self.assertNotIn(name, article)

    def test_fetch_article_keeps_imported_schema(self):
        data = {'@context': 'https://schema.org', '@type': 'Article', 'author': {'@type': 'Person', 'name': 'Автор'}, 'datePublished': '2026-10-01'}
        for brand, url in (('outmax', 'https://outmaxshop.ru/article/123-test'), ('hasl', 'https://хасл.рф/news/test')):
            html = '<article>'+app.serialize_article_structured_data([data])+'<h1>Статья</h1><p>Текст</p></article>'
            response = SimpleNamespace(url=url, content=html.encode())
            with self.subTest(brand=brand), patch.object(app, 'get_site', return_value=response):
                result = app.fetch_article(url, brand)
                self.assertEqual(app.read_article_structured_data(BeautifulSoup(result['html'], 'html.parser')), [data])


if __name__ == '__main__':
    unittest.main()
