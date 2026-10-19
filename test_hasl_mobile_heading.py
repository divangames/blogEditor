import unittest
from bs4 import BeautifulSoup
import app


class HaslMobileHeadingTests(unittest.TestCase):
    def test_preserves_text_styles_and_is_idempotent(self):
        source = '<h1 id="title" style="font-size:56px!important;line-height:64px!important;color:red"><span style="font-size:56px!important;text-decoration:underline">Зимние кроссовки</span></h1>'
        result = app.hasl_mobile_heading_body(source)
        self.assertEqual(app.hasl_mobile_heading_body(result), result)
        heading = BeautifulSoup(result, 'html.parser').h1
        self.assertEqual(heading.get_text(), 'Зимние кроссовки')
        self.assertEqual(heading['id'], 'title')
        self.assertIn('color:red', heading['style'])
        self.assertIn('min(56px,var(--hasl-mobile-h1-size,56px))!important', heading['style'])
        self.assertIn('min(64px,var(--hasl-mobile-h1-leading,64px))!important', heading['style'])
        self.assertIn('text-decoration:underline', heading.span['style'])

    def test_shorthand_and_smaller_custom_size(self):
        result = app.hasl_mobile_heading_body('<h1 style="font:italic 700 56px/64px Montserrat!important">Текст</h1><h1 style="font-size:20px!important">Ещё</h1>')
        self.assertIn('font:italic 700 min(56px,var(--hasl-mobile-h1-size,56px))/min(64px,var(--hasl-mobile-h1-leading,64px)) Montserrat!important', result)
        self.assertIn('min(20px,var(--hasl-mobile-h1-size,20px))!important', result)

    def test_export_keeps_one_rule_inside_cms_body(self):
        body = app.hasl_mobile_heading_body('<h1 style="font-size:56px!important">Заголовок</h1>')
        for render in (app.document, app.admin_document):
            result = render('Заголовок', app.export_body(body, 'ru', 'hasl'), 'hasl')
            article = BeautifulSoup(result, 'html.parser').article
            self.assertEqual(len(article.select('style[data-hasl-mobile-heading]')), 1)
            self.assertEqual(article.h1.get_text(), 'Заголовок')

    def test_outmax_is_unaffected(self):
        result = app.admin_document('Заголовок', '<h1 style="font-size:56px!important">Текст</h1>', 'outmax')
        self.assertNotIn('--hasl-mobile-h1-size', result)


if __name__ == '__main__':
    unittest.main()
