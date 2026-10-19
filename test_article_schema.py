"""Article JSON-LD stays with article metadata and remains inert on export."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from bs4 import BeautifulSoup
import app


class ArticleSchemaTests(unittest.TestCase):
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
