"""Constructor auth, immutable reference, private project CAS; isolated storage."""
import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import app as core

storage = tempfile.TemporaryDirectory(prefix='site-builder-qa-')
core.ARTICLES = Path(storage.name)
os.environ['OUTMAX_USER'] = 'site-demo'
os.environ['OUTMAX_PASSWORD'] = 'site-demo-only'
import wsgi_app as server


class SiteBuilderTests(unittest.TestCase):
    def test_full_catalog_loading_and_cross_worker_reload(self):
        import site_catalog as catalog
        with patch.object(catalog, 'catalog_loading', return_value=True):
            result=self.client.get('/api/site-builder/products?codes=43820',headers=self.auth)
            self.assertEqual(result.status_code,202)
            self.assertNotIn('missing',result.json)
        with patch.object(catalog, 'catalog_loading', side_effect=ValueError('Каталог недоступен')):
            self.assertEqual(self.client.get('/api/site-builder/products?codes=43820',headers=self.auth).status_code,503)
        feed=Path(storage.name)/'fixture.xml'
        feed.write_text('<yml_catalog><shop><offers><offer id="sku-43820"><vendorCode>43820</vendorCode><name>Тестовый товар</name><price>100</price><picture>https://example.com/a.jpg</picture></offer><offer id="other"><vendorCode>99999</vendorCode><name>Другой товар</name><price>200</price></offer></offers></shop></yml_catalog>',encoding='utf-8')
        data=catalog.parse_feed(feed)
        self.assertEqual(len(data['products']),2)
        catalog.write_json(catalog.CACHE/'products.json',data)
        with patch.object(catalog,'PRODUCTS',{}),patch.object(catalog,'CATALOG_STAMP',None):
            result=self.client.get('/api/site-builder/products?codes=43820,sku-43820,99999',headers=self.auth)
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json['missing'],[])
            self.assertEqual(result.json['total'],2)

    def test_feed_video_variants_and_old_cache(self):
        import site_catalog as catalog
        feed=Path(storage.name)/'videos.xml'
        feed.write_text('<yml_catalog><shop><offers><offer id="a"><vendorCode>v</vendorCode><video>https://example.com/a.mp4</video><video>javascript:bad</video></offer><offer id="b"><vendorCode>v</vendorCode><video>https://example.com/a.mp4</video><video>https://example.com/b.mp4</video></offer></offers></shop></yml_catalog>')
        data=catalog.parse_feed(feed)
        self.assertEqual(data['products']['v']['videos'],['https://example.com/a.mp4','https://example.com/b.mp4'])
        with patch.object(catalog,'PRODUCTS',{}),patch.object(catalog,'ALIASES',{}),patch.object(catalog,'CATALOG_FULL',False):
            catalog.load_products(data)
            self.assertTrue(catalog.CATALOG_FULL)
            data.pop('media_version')
            catalog.load_products(data)
            self.assertFalse(catalog.CATALOG_FULL)

    def setUp(self):
        self.client=server.application.test_client()
        self.auth={'Authorization':'Basic '+base64.b64encode(b'site-demo:site-demo-only').decode()}

    def as_user(self, uid):
        client=server.application.test_client()
        with client.session_transaction() as session:
            session.update(uid=uid,version=1)
        return client

    def test_roles_revocation_and_grant_scope(self):
        self.assertEqual(self.client.get('/api/site-builder/reference').status_code,401)
        editor=self.as_user('editor-01');moderator=self.as_user('ivan-nekrut')
        self.assertEqual(editor.get('/site-builder/hasl/').status_code,403)
        self.assertEqual(editor.post('/api/site-builder/access/editor-01',json={'allowed':True}).status_code,403)
        self.assertEqual(moderator.post('/api/site-builder/access/editor-01',json={'allowed':True}).status_code,200)
        self.assertTrue(editor.get('/api/me').json['siteAccess'])
        self.assertEqual(editor.get('/site-builder/hasl/').status_code,200)
        self.assertEqual(moderator.post('/api/site-builder/access/admin',json={'allowed':False}).status_code,400)
        self.assertEqual(moderator.post('/api/site-builder/access/editor-01',json={'allowed':False},headers={'Origin':'https://bad.example'}).status_code,403)
        self.assertEqual(moderator.post('/api/site-builder/access/editor-01',json={'allowed':False}).status_code,200)
        self.assertEqual(editor.get('/api/site-builder/content').status_code,403)

    def test_reference_is_private_projects_are_cas(self):
        reference=self.client.get('/api/site-builder/reference',headers=self.auth).json
        original=json.dumps(reference,sort_keys=True)
        created=self.client.post('/api/site-builder/projects',json=reference,headers=self.auth)
        self.assertEqual(created.status_code,201)
        path='/api/site-builder/projects/'+created.json['id']
        other=self.as_user('ivan-nekrut')
        self.assertEqual(other.get(path).status_code,404)
        reference['title']='Обновлённая страница'
        saved=self.client.post(path,json={'state':reference,'revision':1},headers=self.auth)
        self.assertEqual(saved.json['revision'],2)
        self.assertEqual(self.client.post(path,json={'state':reference,'revision':1},headers=self.auth).status_code,409)
        self.assertEqual(self.client.get(path,headers=self.auth).json['state']['title'],reference['title'])
        self.assertEqual(json.dumps(self.client.get('/api/site-builder/reference',headers=self.auth).json,sort_keys=True),original)
        self.assertEqual(self.client.post('/api/site-builder/reference',json=reference,headers=self.auth).status_code,405)

    def test_section_spacing_validation(self):
        from site_builder import validate_project
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        item={'id':'spacing','source':'s1','spacing':{'top':0,'bottom':400}}
        data['layout']=[item]
        validate_project(data)
        for bad in [-1,401,1.5,True,'20']:
            item['spacing']['top']=bad
            with self.assertRaises(ValueError):
                validate_project(data)

    def test_validation_static_and_provider_failure(self):
        self.assertEqual(self.client.post('/api/site-builder/projects',json={},headers=self.auth).status_code,400)
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        data['layout']=[{'id':'bad"','source':'s0'}]
        self.assertEqual(self.client.post('/api/site-builder/projects',json=data,headers=self.auth).status_code,400)
        self.assertEqual(self.client.get('/site-builder/assets/reference.json',headers=self.auth).status_code,404)
        with patch('site_catalog.refresh_one',side_effect=RuntimeError('secret upstream details')):
            result=self.client.post('/api/site-builder/sync',json={'kinds':['news']},headers=self.auth)
        self.assertEqual(result.status_code,200)
        self.assertNotIn('secret upstream details',result.text)
        self.assertTrue(result.json['content']['news']['items'])


if __name__=='__main__':
    unittest.main()
