import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

import app


OUTMAX_PRODUCT = '''<!doctype html><html><body>
<h1 class="product__title">Кроссовки Adidas</h1><p>Артикул 46472</p>
<meta itemprop="price" content="6490"><div class="product__price product__price--line">12 990 руб.</div>
<table class="product-chars"><tr><td>Материал верха</td><td>Текстиль</td></tr></table>
<div class="product-info--detail"><ul><li>Амортизация подошвы</li></ul></div>
<div itemprop="description"><p>Описание с <a href="/delivery">ссылкой</a>.</p><script>alert(1)</script></div>
<input class="size-input" name="jshop_attr_id[17]" id="size-46" type="radio">
<label class="size-label" for="size-46"><span class="radio_attr_label">46</span><span class="size-label__cm">Длина стельки - 30 см.</span></label>
<input class="size-input" name="size_ids[]" id="notify-47" type="radio">
<label class="size-label" for="notify-47">47</label>
</body></html>'''


class ProductSizeTests(unittest.TestCase):
    def response(self, html, url='https://outmaxshop.ru/snickers/adidas-46472'):
        return SimpleNamespace(content=html.encode('utf-8'), url=url)

    def test_outmax_product_keeps_only_available_sizes_with_centimetres(self):
        with patch('app.get_site', return_value=self.response(OUTMAX_PRODUCT)):
            product=app.fetch_product('https://outmaxshop.ru/snickers/adidas-46472',brand='outmax')
        self.assertEqual(product['sizes'],[{'name':'46','hint':'30 см'}])
        self.assertEqual(product['price'],6490)
        self.assertEqual(product['oldPrice'],12990)
        self.assertEqual(product['properties'],['Материал верха: Текстиль'])
        self.assertEqual(product['details'],['Амортизация подошвы'])
        self.assertIn('href="https://outmaxshop.ru/delivery"',product['descriptionHtml'])
        self.assertNotIn('script',product['descriptionHtml'])

    def test_hasl_numeric_hints_get_units_and_null_old_price_is_safe(self):
        product={
            'sku':'43368','id':43368,'name':'Puma California Vintage','images':[],'characteristics':[],
            'price':{'value':469000},'oldPrice':None,'attributes':[{'name':'Размер','values':[{'name':'40','hint':'24,5'}]}],
            'labels':[],'inStock':True,
        }
        html=f'<script id="__NEXT_DATA__" type="application/json">{json.dumps({"props":{"pageProps":{"product":product}}},ensure_ascii=False)}</script>'
        response=self.response(html,'https://haslestore.com/sneakers/muzhskie/puma-43368')
        with patch('app.get_site',return_value=response):
            result=app.fetch_product(response.url,brand='hasl')
        self.assertEqual(result['sizes'],[{'name':'40','hint':'24,5 см'}])
        self.assertEqual(result['price'],4690)
        self.assertEqual(result['oldPrice'],0)

    def test_hasl_keeps_description_properties_and_any_number_of_details(self):
        product={
            'sku':'43368','name':'Puma California Vintage','images':[],'price':{'value':469000},'oldPrice':None,
            'characteristics':[{'name':'Цвет','value':'Чёрный'}],
            'description':'<p>Описание <a href="/help">модели</a></p><ul><li>Мягкая стелька</li><li>Цепкая подошва</li></ul>',
            'attributes':[],'labels':[],'inStock':True,
        }
        html=f'<script id="__NEXT_DATA__" type="application/json">{json.dumps({"props":{"pageProps":{"product":product}}},ensure_ascii=False)}</script>'
        response=self.response(html,'https://haslestore.com/sneakers/muzhskie/puma-43368')
        with patch('app.get_site',return_value=response):
            result=app.fetch_product(response.url,brand='hasl')
        self.assertEqual(result['properties'],['Цвет: Чёрный'])
        self.assertEqual(result['details'],['Мягкая стелька','Цепкая подошва'])
        self.assertIn('href="https://haslestore.com/help"',result['descriptionHtml'])

    def test_imported_product_card_receives_visible_hint(self):
        soup=BeautifulSoup('''<article class="om-guide"><article class="om-product"><h3><a href="/snickers/adidas-46472">Adidas</a></h3><div class="om-product-offer-sizes"><strong>Размеры</strong><div><span>46</span></div></div></article></article>''','html.parser')
        article=soup.select_one('.om-guide')
        with patch('app.get_site',return_value=self.response(OUTMAX_PRODUCT)):
            app.enrich_article_product_size_hints(article,soup,'outmax','https://outmaxshop.ru/article/test')
        self.assertEqual(article.select_one('.om-product-offer-sizes span').get_text(' ',strip=True),'46 30 см')
        self.assertEqual(article.select_one('.om-product-offer-sizes span small').get_text(strip=True),'30 см')


if __name__=='__main__':
    unittest.main()
