"""Article-owned metadata survives document generation and store import."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from bs4 import BeautifulSoup
import app


class DescriptionTests(unittest.TestCase):
    def test_head_and_body_are_separate_for_both_brands(self):
        value = 'Обувь "Осень" & <советы> > детали 👟'
        body = '<p style="color:red">Текст <b>статьи</b></p>'
        metadata = '<meta name="DESCRIPTION" content="Обувь &quot;Осень&quot; &amp; &lt;советы&gt; &gt; детали 👟">'
        for brand in ('outmax', 'hasl'):
            for render in (app.document, app.admin_document):
                with self.subTest(brand=brand, render=render.__name__):
                    html = BeautifulSoup(render('Заголовок', metadata + body, brand), 'html.parser')
                    self.assertEqual(html.head.select_one('meta[name=description]')['content'], value)
                    self.assertEqual(len(html.select('meta[name=description]')), 1)
                    self.assertFalse(html.body.select('meta[name=description]'))
                    self.assertEqual(html.article.get_text(), 'Текст статьи')
        self.assertEqual(app.split_article_description(metadata + body)[1], body)

    def test_legacy_empty_and_duplicates(self):
        body = '<p data-test="original">Не менять HTML</p>'
        self.assertEqual(app.split_article_description(body), ('', body))
        self.assertEqual(app.split_article_description('<meta name="description" content="">' + body), ('', body))
        metadata, result = app.split_article_description('<meta name="description" content="Первое"><meta name="description" content="Второе">' + body)
        self.assertEqual(BeautifulSoup(metadata, 'html.parser').meta['content'], 'Первое')
        self.assertEqual(result, body)

    def test_store_import_keeps_description(self):
        for brand, url in (('outmax', 'https://outmaxshop.ru/article/123-test'), ('hasl', 'https://хасл.рф/news/test')):
            response = SimpleNamespace(url=url, content='<html><head><meta name="description" content="Описание &amp; фото"></head><body><article><h1>Заголовок</h1><p>Текст</p></article></body></html>'.encode())
            with self.subTest(brand=brand), patch.object(app, 'get_site', return_value=response):
                imported = app.fetch_article(url, brand)
                self.assertEqual(BeautifulSoup(imported['html'], 'html.parser').meta['content'], 'Описание & фото')


if __name__ == '__main__':
    unittest.main()
