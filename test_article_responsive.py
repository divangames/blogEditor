import unittest
from bs4 import BeautifulSoup
import app

class ArticleResponsiveTests(unittest.TestCase):
    def test_legacy_toc_preserves_links_text_and_is_idempotent(self):
        body='<nav class="om-toc"><h2>В этой статье</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))"><a href="#first" style="grid-area:auto / 1 / auto / -1">Длинное название<span>↓</span></a><a href="#second">Второй пункт</a></div></nav><section id="first">Текст</section>'
        result=app.responsive_toc_body(body)
        before,after=BeautifulSoup(body,'html.parser'),BeautifulSoup(result,'html.parser')
        self.assertEqual(before.get_text(),after.get_text())
        self.assertEqual([a['href'] for a in before.select('a')],[a['href'] for a in after.select('a')])
        self.assertIn('display:grid!important',after.select_one('.om-toc > div')['style'])
        self.assertIn('grid-auto-rows:minmax(54px,auto)',after.select_one('.om-toc > div')['style'])
        self.assertNotIn('grid-auto-rows:1fr',after.select_one('.om-toc > div')['style'])
        self.assertIn('repeat(auto-fit,minmax(min(100%,340px),1fr))',result)
        self.assertNotIn('grid-area',result)
        self.assertEqual(result,app.responsive_toc_body(result))

    def test_public_preview_labels_every_metric_for_both_brands(self):
        body='<div class="om-table-scroll"><table><thead><tr><th>Модель</th><th>Цена</th><th>Материалы</th></tr></thead><tbody><tr><td>Модель А</td><td>7 790 ₽</td><td>Текстиль</td></tr></tbody></table></div>'
        for brand in ['outmax','hasl']:
            with self.subTest(brand=brand):
                doc=BeautifulSoup(app.admin_document('Тест',body,brand),'html.parser')
                self.assertIn('om-guide',doc.select_one('article')['class'])
                self.assertEqual([c['data-label'] for c in doc.select('tbody td')],['Модель','Цена','Материалы'])
                self.assertEqual(doc.select('tbody td')[1]['data-price-cell'],'1')
                self.assertIn('display:table-row-group!important',doc.select_one('style').get_text())
                self.assertIn('overflow-x:auto!important',doc.select_one('style').get_text())
                self.assertIn('white-space:nowrap!important',doc.select_one('style').get_text())

    def test_old_branded_accent_is_repaired_but_custom_accent_is_preserved(self):
        body='<aside class="om-callout" style="background:linear-gradient(135deg,#fff 0%,#fff7f7 100%)"><p>Сравнение</p></aside><aside class="om-callout om-callout--custom" style="background:#abc!important;--accent-kind:fill"><p>Авторский</p></aside>'
        doc=BeautifulSoup(app.admin_document('Тест',body),'html.parser')
        accents=doc.select('.om-callout')
        self.assertIn('radial-gradient',accents[0]['style'])
        self.assertEqual(accents[1]['style'],'background:#abc!important;--accent-kind:fill')

    def test_cms_export_keeps_responsive_inline_fallback(self):
        body='<nav class="om-toc" data-module="toc"><div style="display:grid"><a href="#first" aria-label="Пункт">Пункт</a></div></nav>'
        for brand in ['outmax','hasl']:
            result=app.export_body(body,'ru',brand)
            self.assertNotIn('class="om-toc"',result)
            self.assertNotIn('data-module="toc"',result)
            self.assertNotIn('aria-label="Пункт"',result)
            self.assertIn('display:grid!important',result)
            self.assertIn('grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))',result)
            self.assertIn('href="#first"',result)

    def test_preview_and_export_share_brand_wrapper_and_font(self):
        for brand,font in [('outmax','Open+Sans'),('hasl','Montserrat')]:
            with self.subTest(brand=brand):
                doc=BeautifulSoup(app.admin_document('Тест','<p>Текст</p>',brand),'html.parser')
                article=doc.select_one('article.om-guide')
                self.assertIsNotNone(article)
                self.assertIn('font-family',article.get('style',''))
                self.assertIsNone(article.select_one(':scope > style'))
                self.assertIsNotNone(doc.select_one('head style'))
                self.assertIn(f'family={font}',doc.select_one('link[rel="stylesheet"]')['href'])

    def test_preview_normalizes_legacy_heading_line_height(self):
        body='<h1><p><span style="font-size:40px!important;font-weight:400">Заголовок в две строки</span></p></h1>'
        doc=BeautifulSoup(app.admin_document('Тест',body),'html.parser')
        heading=doc.select_one('article > h1')
        self.assertIsNone(heading.select_one(':scope > p'))
        self.assertIn('font-size:40px!important',heading['style'])

    def test_preview_flattens_every_direct_block_inside_heading(self):
        body='<h1><p><span>ТОП-5 технологичных</span></p><div>зимних кроссовок для</div><span>города 2026/27</span></h1>'
        doc=BeautifulSoup(app.admin_document('Тест',body),'html.parser')
        heading=doc.select_one('article > h1')
        self.assertFalse(heading.select(':scope > p,:scope > div'))
        self.assertEqual(' '.join(heading.get_text(' ',strip=True).split()),'ТОП-5 технологичных зимних кроссовок для города 2026/27')

if __name__=='__main__':unittest.main()
