"""Constructor auth, immutable reference, private project CAS; isolated storage."""
import base64
import json
import os
import tempfile
import unittest
import io
from PIL import Image
from pathlib import Path
from unittest.mock import patch
import app as core

storage = tempfile.TemporaryDirectory(prefix='site-builder-qa-')
core.ARTICLES = Path(storage.name)
os.environ['OUTMAX_USER'] = 'site-demo'
os.environ['OUTMAX_PASSWORD'] = 'site-demo-only'
import wsgi_app as server


class SiteBuilderTests(unittest.TestCase):
    def test_optional_motion_module_is_public_and_embedded(self):
        response = server.application.test_client().get('/api/public-site-motion.js')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], '*')
        self.assertIn('max-age=3600', response.headers['Cache-Control'])
        self.assertIn('HaslMobileMotion', response.text)
        import site_builder
        with patch.object(site_builder, 'SITE_ASSETS', {'mobile-motion.js': '/* embedded motion */'}):
            self.assertEqual(server.application.test_client().get('/api/public-site-motion.js').text,
                             '/* embedded motion */')

    def test_faq_options_roundtrip_and_validation(self):
        import copy
        data = self.client.get('/api/site-builder/reference', headers=self.auth).json
        data['layout'] = [{'id': 'faq-demo', 'source': 's8', 'name': 'FAQ',
                           'faqSettings': {'initial': 'first', 'mode': 'single', 'heading': 'right'}}]
        result = self.client.post('/api/site-builder/projects', json=data, headers=self.auth)
        self.assertEqual(result.status_code, 201, result.text)
        saved = self.client.get('/api/site-builder/projects/' + result.json['id'], headers=self.auth).json['state']
        self.assertEqual(saved['layout'][0]['faqSettings'], data['layout'][0]['faqSettings'])
        from site_builder import validate_project
        for settings in ({}, {'initial': 'closed', 'mode': 'multiple', 'heading': 'top'}, {'heading': 'left'}):
            valid = copy.deepcopy(data); valid['layout'][0]['faqSettings'] = settings
            validate_project(valid)
        for settings in (None, [], {'initial': True}, {'initial': 'all'}, {'mode': 'none'}, {'heading': 'bottom'}, {'unknown': 1}):
            invalid = copy.deepcopy(data); invalid['layout'][0]['faqSettings'] = settings
            with self.assertRaises(ValueError):
                validate_project(invalid)

    def test_shared_analytics_roundtrip_and_validation(self):
        import copy
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        data['analytics']={'hasl':{'yandexCounter':'12345678','googleMeasurementId':'G-DEMOHASL','loadScripts':True},'hasle':{'yandexCounter':'87654321','googleMeasurementId':'G-DEMOHASLE'}}
        data['layout']=[{'id':'analytics-demo','source':'custom','mode':'grid','elements':[],'objects':{'root':{'goals':{'yandexGoal':'choose_pair','googleAction':'choose_pair'}}}}]
        response=self.client.post('/api/site-builder/projects',json=data,headers=self.auth)
        self.assertEqual(response.status_code,201,response.text)
        saved=self.client.get('/api/site-builder/projects/'+response.json['id'],headers=self.auth).json['state']
        self.assertEqual(saved['analytics'],data['analytics'])
        for key,value in [('yandexCounter','wrong'),('googleMeasurementId','<script>'),('loadScripts','true'),('secret','oops')]:
            bad=copy.deepcopy(data);bad['analytics']['hasl'][key]=value
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400)
        public=self.client.get('/api/public-site-statistics')
        self.assertEqual(public.status_code,200);self.assertEqual(public.headers['Access-Control-Allow-Origin'],'*')

    def test_remote_site_preview_snapshot_revision_and_revoke(self):
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        project=self.client.post('/api/site-builder/projects',json=data,headers=self.auth).json
        endpoint='/api/site-builder/projects/'+project['id']+'/preview'
        self.assertEqual(self.client.post(endpoint,json={'revision':1,'html':'test'}).status_code,401)
        self.assertEqual(self.client.post(endpoint,json={'revision':2,'html':'test'},headers=self.auth).status_code,409)
        response=self.client.post(endpoint,json={'revision':1,'html':'<!doctype html><h1>Demo</h1><script>window.demo=1</script>'},headers=self.auth)
        self.assertEqual(response.status_code,200,response.text)
        url=response.json['url'];public=self.client.get(url)
        self.assertEqual(public.status_code,200)
        self.assertIn('review-phone-frame',public.text)
        content=self.client.get(url+'?content=1');self.assertIn('Demo',content.text)
        policy=content.headers['Content-Security-Policy']
        self.assertIn('sandbox allow-scripts',policy);self.assertNotIn('allow-same-origin',policy)
        self.assertIn("connect-src 'none'",policy)
        repeat=self.client.post(endpoint,json={'revision':1,'html':'<h1>Updated</h1>'},headers=self.auth)
        self.assertEqual(repeat.json['url'],url);self.assertIn('Updated',self.client.get(url+'?content=1').text)
        self.assertEqual(self.client.delete(endpoint,headers=self.auth).status_code,200)
        self.assertEqual(self.client.get(url).status_code,404)

    def test_auto_layout_validation_and_roundtrip(self):
        import copy
        data = self.client.get('/api/site-builder/reference', headers=self.auth).json
        layout = {'mode': 'row', 'wrap': 'wrap', 'gap': 24, 'gapY': 16, 'justify': 'space-between', 'align': 'center', 'widthMode': 'fill', 'heightMode': 'hug', 'anchorX': 'stretch', 'anchorY': 'end', 'left': 12, 'right': 20, 'bottom': 10, 'flow': True}
        data['layout'] = [{'id': 'adaptive', 'source': 'custom', 'name': 'Adaptive QA', 'mode': 'grid', 'elements': []}]
        data['layout'][0]['objects'] = {'root': {'desktop': {'layout': layout}, 'phone': {'layout': {'mode': 'column', 'gap': 0}}}}
        created = self.client.post('/api/site-builder/projects', json=data, headers=self.auth)
        self.assertEqual(created.status_code, 201, created.text)
        saved = self.client.get('/api/site-builder/projects/' + created.json['id'], headers=self.auth).json['state']
        self.assertEqual(saved['layout'][0]['objects'], data['layout'][0]['objects'])
        for key, value in [('mode', 'grid;position:fixed'), ('gap', True), ('gap', -1), ('gapY', 401), ('left', 10001), ('widthMode', 'url(test)'), ('flow', 'true'), ('unknown', 1)]:
            bad = copy.deepcopy(data)
            bad['layout'][0]['objects']['root']['desktop']['layout'][key] = value
            self.assertEqual(self.client.post('/api/site-builder/projects', json=bad, headers=self.auth).status_code, 400, (key, value))
        self.assertEqual(self.client.get('/site-builder/assets/layout.js', headers=self.auth).status_code, 200)

    def test_product_feedback_authenticated_read_and_failure(self):
        import site_builder
        from test_site_feedback import response, PATH
        import site_feedback
        data = site_feedback.parse_response(response(), '123', PATH, '123', True, '2026-10-25T00:00:00+00:00')
        url = '/api/site-builder/product-feedback?code=123'
        self.assertEqual(self.client.get(url).status_code, 401)
        before = self.client.get('/api/site-builder/reference', headers=self.auth).json
        with patch.object(site_builder.catalog, 'reload_catalog'), patch.object(site_builder.catalog, 'PRODUCTS', {'123': {'code': '123', 'url': site_feedback.ORIGIN + PATH}}), patch.object(site_builder.catalog, 'ALIASES', {}), patch.object(site_builder.site_feedback, 'load', return_value=data) as load:
            result = self.client.get(url, headers=self.auth)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json['feedback']['aggregate']['ratingCount'], '')
            self.assertEqual(result.json['feedback']['aggregate']['reviewCount'], '2')
            self.assertEqual(self.client.get('/api/site-builder/product-feedback?code=../bad', headers=self.auth).status_code, 400)
            self.assertEqual(self.client.get('/api/site-builder/product-feedback?code=999', headers=self.auth).status_code, 404)
            load.side_effect = TimeoutError('upstream internal detail')
            failed = self.client.get(url, headers=self.auth)
            self.assertEqual(failed.status_code, 503)
            self.assertNotIn('upstream internal detail', failed.text)
        self.assertEqual(self.client.get('/api/site-builder/reference', headers=self.auth).json, before)

    def test_zip_library_embedded_fallback(self):
        import site_builder
        self.assertEqual(self.client.get('/vendor/jszip.min.js').status_code,302)
        library=(core.ROOT/'vendor/jszip.min.js').read_text(encoding='utf-8')
        with patch.object(site_builder,'SITE_ASSETS',{'zip.js':library}):
            response=self.client.get('/vendor/jszip.min.js',headers=self.auth)
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.mimetype,'text/javascript')
            self.assertEqual(response.get_data(as_text=True),library)

    def design_section(self):
        return {'id':'design-demo','source':'custom','name':'Демо секция','visibility':'all',
                'mode':'grid','columns':2,'mobileColumns':1,'elements':[
                    {'id':'demo-heading','type':'heading','text':'Демо','tag':'h2',
                     'style':{'fontSize':48,'color':'#20241f'},'mobileStyle':{'fontSize':28}},
                    {'id':'demo-image','type':'image','src':'https://example.test/photo.png','alt':'Фото'}]}

    def test_designer_validation_library_isolation_and_cas(self):
        import copy
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        data['layout']=[self.design_section()]
        data['pageSettings']={'description':'Демо описание','canonical':'https://example.test/demo','noindex':True,'path':'info/about.html'}
        data['layout'][0]['elements'].append({'id':'demo-button','type':'button','text':'Домой','href':'/index.html','style':{'fontFamily':'Arial','fontStyle':'italic','textDecoration':'underline'}})
        created=self.client.post('/api/site-builder/projects',json=data,headers=self.auth)
        self.assertEqual(created.status_code,201,created.text)
        url='/api/site-builder/projects/'+created.json['id']
        saved=self.client.post(url,json={'revision':1,'state':data},headers=self.auth)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(self.client.post(url,json={'revision':1,'state':data},headers=self.auth).status_code,409)
        self.assertEqual(self.client.get(url,headers=self.auth).json['state'],data)
        for path in ('../index.html','/index.html','index.php','https://example.test','a b.html','a/../../x.html'):
            bad=copy.deepcopy(data);bad['pageSettings']['path']=path
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400,path)
        for mutate in [lambda s:s.update(columns=5),lambda s:s.update(mode='eval'),
                       lambda s:s['elements'][0].update(type='script'),
                       lambda s:s['elements'][0].update(style={'background':'url(https://evil.test)'}),
                       lambda s:s['elements'][0].update(style={'fontSize':True}),
                       lambda s:s['elements'][1].update(src='javascript:alert(1)'),
                       lambda s:s['elements'][1].update(src='https://user:password@example.test/x'),
                       lambda s:s['elements'][1].update(mobileRect={'x':-1}),
                       lambda s:s['elements'].append(s['elements'][0].copy())]:
            bad=copy.deepcopy(data);mutate(bad['layout'][0])
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400,bad['layout'])
        result=self.client.post('/editor-api/site-builder/sections',json={'section':data['layout'][0]},headers=self.auth)
        self.assertEqual(result.status_code,201,result.text)
        preset='/api/site-builder/sections/'+result.json['id']
        self.assertEqual(self.client.get(preset,headers=self.auth).json['section'],data['layout'][0])
        other=self.as_user('ivan-nekrut')
        self.assertEqual(other.get(preset).status_code,404)
        self.assertEqual(other.delete(preset).status_code,404)
        self.assertEqual(self.client.post('/api/site-builder/sections',json={'section':None},headers=self.auth).status_code,400)
        self.assertEqual(self.client.post('/api/site-builder/sections',json={'section':data['layout'][0]},headers={**self.auth,'Origin':'https://evil.test'}).status_code,403)
        self.assertEqual(self.client.delete(preset,headers=self.auth).status_code,200)
        self.assertEqual(self.client.get(preset,headers=self.auth).status_code,404)

    def test_designer_images_protected_by_project_and_library(self):
        image,_=self.upload_banner();section=self.design_section();section['elements'][1]['src']=image['url']
        result=self.client.post('/api/site-builder/sections',json={'section':section},headers=self.auth)
        self.assertEqual(result.status_code,201,result.text)
        url='/api/site-builder/banners/'+image['filename']
        self.assertEqual(self.client.delete(url,headers=self.auth).status_code,409)
        self.client.delete('/api/site-builder/sections/'+result.json['id'],headers=self.auth)
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json;data['layout']=[section]
        project=self.client.post('/api/site-builder/projects',json=data,headers=self.auth)
        self.assertEqual(project.status_code,201,project.text)
        self.assertEqual(self.client.delete(url,headers=self.auth).status_code,409)

    def upload_banner(self):
        data=io.BytesIO();Image.new('RGB',(110,100),'lime').save(data,format='PNG')
        result=self.client.post('/editor-api/site-builder/banners?name=demo.png',data=data.getvalue(),content_type='image/png',headers=self.auth)
        self.assertEqual(result.status_code,201,result.text)
        return result.json,data.getvalue()

    def test_block_background_folders_and_shared_styles(self):
        import copy
        data=io.BytesIO();Image.new('RGB',(40,40),'lime').save(data,format='PNG')
        result=self.client.post('/api/site-builder/banners?folder=block-a&name=folder.png',data=data.getvalue(),content_type='image/png',headers=self.auth)
        self.assertEqual(result.status_code,201,result.text)
        image=result.json
        self.assertEqual(image['folder'],'block-a')
        self.assertIn(image['filename'],[x['filename'] for x in self.client.get('/api/site-builder/banners?folder=block-a',headers=self.auth).json['items']])
        self.assertNotIn(image['filename'],[x['filename'] for x in self.client.get('/api/site-builder/banners?folder=block-b',headers=self.auth).json['items']])
        other=self.as_user('ivan-nekrut')
        self.assertNotIn(image['filename'],[x['filename'] for x in other.get('/api/site-builder/banners?folder=block-a').json['items']])
        self.assertEqual(self.client.get('/api/site-builder/banners?folder=../bad',headers=self.auth).status_code,400)
        project=self.client.get('/api/site-builder/reference',headers=self.auth).json
        project['layout']=[{'id':'bg-test','source':'s5','backgroundFolder':'block-a','blockBackgrounds':{'desktop':image['url']},'blockBackgroundPosition':{'desktop':{'rotation':45,'flipX':True,'opacity':65}},'blockBackgroundPaint':{'phone':{'mode':'gradient','color':'#112233','color2':'#aabbcc','angle':90}},'buttonStyles':{'l1':{'width':280,'paddingX':12,'paddingY':8,'phoneWidth':240}}}]
        project['globalStyles']={'reviewCard':{'desktop':{'backgroundColor':'#112233'},'phone':{'paddingTop':12}},'button':{'desktop':{'fontWeight':500}}}
        saved=self.client.post('/api/site-builder/projects',json=project,headers=self.auth)
        self.assertEqual(saved.status_code,201,saved.text)
        restored=self.client.get('/api/site-builder/projects/'+saved.json['id'],headers=self.auth).json['state']
        self.assertEqual(restored['layout'],project['layout']);self.assertEqual(restored['globalStyles'],project['globalStyles'])
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+image['filename'],headers=self.auth).status_code,409)
        for key,value in [('opacity',101),('rotation',181),('flipX','yes')]:
            bad=copy.deepcopy(project);bad['layout'][0]['blockBackgroundPosition']['desktop'][key]=value
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400)
        bad=copy.deepcopy(project);bad['globalStyles']['reviewCard']['desktop']['backgroundImage']='url(https://bad.example)'
        self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400)

    def test_banner_library_public_and_protected_delete(self):
        item,raw=self.upload_banner();filename=item['filename']
        self.assertTrue((core.ARTICLES/'images/banners/_hasl'/filename).is_file())
        public='/editor-api/public-site-banners/'+filename
        result=server.application.test_client().get(public)
        self.assertEqual(result.status_code,200);self.assertEqual(result.data,raw)
        result.close()
        self.assertEqual(self.client.get('/editor-api/site-builder/banners').status_code,401)
        self.assertEqual(self.client.post('/api/site-builder/banner-defaults',json={'phone':item['url'],'desktop':item['url']},headers=self.auth).status_code,200)
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+filename,headers=self.auth).status_code,409)
        ref=self.client.get('/api/site-builder/reference',headers=self.auth).json
        self.assertEqual(ref['heroBackgrounds']['phone'],item['url'])
        self.assertEqual(self.client.post('/api/site-builder/banner-defaults',json={},headers=self.auth).status_code,200)
        project=self.client.post('/api/site-builder/projects',json=ref,headers=self.auth)
        self.assertEqual(project.status_code,201)
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+filename,headers=self.auth).status_code,409)
        ref['heroBackgrounds']={}
        self.assertEqual(self.client.post('/api/site-builder/projects/'+project.json['id'],json={'state':ref,'revision':1},headers=self.auth).status_code,200)
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+filename,headers=self.auth).status_code,409)  # retained by immutable version
        self.assertEqual(server.application.test_client().get(public).status_code,200)  # old versions retain media
        ref['heroBackgrounds']={'phone':item['url']+'missing'}
        self.assertEqual(self.client.post('/api/site-builder/projects',json=ref,headers=self.auth).status_code,400)

    def test_banner_upload_validation_and_permissions(self):
        for raw,mime in [(b'<svg onload="alert(1)"/>','image/svg+xml'),(b'bad','image/png'),(b'', 'image/webp')]:
            self.assertIn(self.client.post('/api/site-builder/banners',data=raw,content_type=mime,headers=self.auth).status_code,(400,413))
        item,_=self.upload_banner()
        moderator=self.as_user('ivan-nekrut')
        self.assertNotIn(item['filename'],[x['filename'] for x in moderator.get('/api/site-builder/banners').json['items']])
        self.assertEqual(moderator.delete('/api/site-builder/banners/'+item['filename']).status_code,404)
        self.assertEqual(moderator.post('/api/site-builder/banner-defaults',json={}).status_code,403)
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+item['filename'],headers={**self.auth,'Origin':'https://bad.example'}).status_code,403)
        self.assertEqual(self.client.delete('/api/site-builder/banners/'+item['filename'],headers=self.auth).status_code,200)

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

    def test_versions_cas_isolation_idempotency_and_groups(self):
        import copy
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        data['layout']=[self.design_section()]
        section=data['layout'][0]
        section['objects']={'one':{'name':'Первый слой','locked':True}}
        section['objectGroups']=[{'id':'group1','name':'Композиция','members':['one','two'],'locked':False}]
        headers={**self.auth,'X-Site-Request-Id':'create-version-test'}
        created=self.client.post('/api/site-builder/projects',json=data,headers=headers)
        self.assertEqual(created.status_code,201,created.text)
        self.assertEqual(self.client.post('/api/site-builder/projects',json=data,headers=headers).json,created.json)
        url='/api/site-builder/projects/'+created.json['id']
        old=copy.deepcopy(data);data['title']='Версия два'
        payload={'revision':1,'state':data};headers={**self.auth,'X-Site-Request-Id':'save-version-test'}
        saved=self.client.post(url,json=payload,headers=headers)
        self.assertEqual(saved.json['revision'],2)
        self.assertEqual(self.client.post(url,json=payload,headers=headers).json,saved.json)
        payload['state']['title']='Подмена повтора'
        self.assertEqual(self.client.post(url,json=payload,headers=headers).status_code,409)
        listing=self.client.get(url+'/versions',headers=self.auth).json
        self.assertEqual([x['revision'] for x in listing['items']],[2,1])
        self.assertNotIn('state',listing['items'][0])
        self.assertEqual(self.client.get(url+'/versions/1',headers=self.auth).json['state'],old)
        self.assertEqual(self.client.get(url,headers=self.auth).json['revision'],2,'read history never saves')
        other=self.as_user('ivan-nekrut')
        for suffix in ['/versions','/versions/1']:
            self.assertEqual(other.get(url+suffix).status_code,404)
        self.assertEqual(other.post(url+'/restore',json={'revision':2,'version':1}).status_code,404)
        self.assertEqual(self.client.post(url+'/restore',json={'revision':1,'version':1},headers=self.auth).status_code,409)
        headers={**self.auth,'X-Site-Request-Id':'restore-version-test'}
        restored=self.client.post(url+'/restore',json={'revision':2,'version':1},headers=headers)
        self.assertEqual(restored.json['revision'],3)
        self.assertEqual(restored.json['state'],old)
        self.assertEqual(self.client.post(url+'/restore',json={'revision':2,'version':1},headers=headers).json,restored.json)
        self.assertEqual(self.client.get(url+'/versions/3',headers=self.auth).json['restoredFrom'],1)
        self.assertEqual(len(self.client.get(url+'/versions',headers=self.auth).json['items']),3)
        self.assertEqual(self.client.get(url+'/versions?before=2',headers=self.auth).json['items'][0]['revision'],1)
        for revision in range(3,55):
            self.assertEqual(self.client.post(url,json={'revision':revision,'state':old},headers=self.auth).json['revision'],revision+1)
        first=self.client.get(url+'/versions',headers=self.auth).json
        self.assertEqual(len(first['items']),50)
        self.assertEqual(first['before'],6)
        second=self.client.get(url+'/versions?before=6',headers=self.auth).json
        self.assertEqual([x['revision'] for x in second['items']],[5,4,3,2,1])
        self.assertIsNone(second['before'])
        from site_builder import validate_project
        for bad in [True, 'yes']:
            broken=copy.deepcopy(old);broken['layout'][0]['objects']['one']['locked']=bad
            if bad is True: validate_project(broken)
            else:
                with self.assertRaises(ValueError):validate_project(broken)
        for members in [['one'],['root','two'],['one','one']]:
            broken=copy.deepcopy(old);broken['layout'][0]['objectGroups'][0]['members']=members
            with self.assertRaises(ValueError):validate_project(broken)

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
        self.assertNotIn(created.json['id'],[r['id'] for r in other.get('/api/site-builder/projects').json])
        self.assertIn(created.json['id'],[r['id'] for r in self.client.get('/api/site-builder/projects',headers=self.auth).json])
        reference['title']='Обновлённая страница'
        saved=self.client.post(path,json={'state':reference,'revision':1},headers=self.auth)
        self.assertEqual(saved.json['revision'],2)
        self.assertEqual(self.client.post(path,json={'state':reference,'revision':1},headers=self.auth).status_code,409)
        self.assertEqual(self.client.get(path,headers=self.auth).json['state']['title'],reference['title'])
        self.assertEqual(json.dumps(self.client.get('/api/site-builder/reference',headers=self.auth).json,sort_keys=True),original)
        self.assertEqual(self.client.post('/api/site-builder/reference',json=reference,headers=self.auth).status_code,405)

    def test_layer_reveal_and_cycle_validation(self):
        import copy
        from site_builder import validate_project
        data = self.client.get('/api/site-builder/reference', headers=self.auth).json
        data['layout'] = [{'id': 'layers', 'source': 'custom', 'elements': [], 'objects': {'a': {'reveal': True, 'parent': 'root', 'before': 'b'}, 'b': {'parent': 'root'}}}]
        validate_project(data)
        for objects in ({'a': {'reveal': 'true'}}, {'a': {'parent': 'b'}, 'b': {'parent': 'a'}}, {'a': {'before': 'b'}, 'b': {'before': 'a'}}, {'root': {'parent': 'a'}}, {'a': {'before': 'a'}}):
            bad = copy.deepcopy(data)
            bad['layout'][0]['objects'] = objects
            with self.assertRaises(ValueError):
                validate_project(bad)

    def test_section_links_validation(self):
        from site_builder import validate_project
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        item={'id':'links','source':'s10','anchor':'my-section','inlineLinks':{'t1':{'text':'hello','links':[{'start':0,'end':5,'href':'https://example.com'}]}}}
        data['layout']=[item]
        validate_project(data)
        item['inlineLinks']['t1']['links'][0]['href']='javascript:alert(1)'
        with self.assertRaises(ValueError): validate_project(data)
        item['inlineLinks']={}
        data['layout'].append({'id':'other','source':'s1','anchor':'my-section'})
        with self.assertRaises(ValueError): validate_project(data)

    def test_section_spacing_validation(self):
        from site_builder import validate_project
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        item={'id':'spacing','source':'s1','spacing':{'top':0,'bottom':400}}
        data['layout']=[item]
        validate_project(data)
        item['source']='s10'
        item['spacingMobile']={'top':8,'bottom':0}
        validate_project(data)
        item['spacingMobile']={'top':-1}
        with self.assertRaises(ValueError):
            validate_project(data)
        item['spacingMobile']={}
        for bad in [-1,401,1.5,True,'20']:
            item['spacing']['top']=bad
            with self.assertRaises(ValueError):
                validate_project(data)

    def test_hero_controls_validation(self):
        import copy
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        data['layout']=[{'id':'hero','source':'s0','heroRibbon':{'enabled':False,'text':'Отзывы','background':'#123456','color':'#ffffff'},'heroBackgroundFixed':False,'linkTargets':{'l0':True,'hero-ribbon':False},'buttonStyles':{'l0':{'visibility':'deleted','variant':'outline','radius':8,'fontSize':17,'color':'#112233'}}}]
        result=self.client.post('/api/site-builder/projects',json=data,headers=self.auth)
        self.assertEqual(result.status_code,201)
        saved=self.client.get('/api/site-builder/projects/'+result.json['id'],headers=self.auth).json
        self.assertEqual(saved['state']['layout'],data['layout'])
        for key,value in [('finderBackgroundPosition',{'phone':{'scale':301}}),('finderBackgroundPosition',{'desktop':{'x':float('inf')}}),('buttonStyles',{'l0':{'fontSize':8}}),('buttonStyles',{'l0':{'radius':99}}),('buttonStyles',{'l0':{'background':'url(x)'}}),('buttonStyles',{'l0':{'visibility':'unexpected'}}),('heroBackgroundFixed','false'),('linkTargets',{'l0':'true'}),('heroRibbon',{'color':'url(https://example.com)'}),('heroRibbon',{'enabled':'false'}),('heroRibbon',{'text':'a'*501})]:
            bad=copy.deepcopy(data);bad['layout'][0][key]=value
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400)

    def test_object_studio_validation_and_assets(self):
        import copy
        from site_builder import banner_values
        data=self.client.get('/api/site-builder/reference',headers=self.auth).json
        uploaded,_=self.upload_banner();image=uploaded['url']
        data['layout']=[{'id':'objects','source':'s0','objects':{'native-1':{'desktop':{'x':1,'y':-.25,'rotation':90,'scale':125,'style':{'color':'#112233'}},'phone':{'visible':True,'crop':{'left':10}},'background':{'desktop':{'src':image,'zoom':140,'opacity':.5}},'goals':{'counterId':'12345678','yandexGoal':'choose','googleCategory':'Каталог','googleAction':'choose_pair'}}},'addedObjects':[{'id':'copy1','parent':'root','html':'<div data-site-object="add-copy1-0"><img src="'+image+'" alt="demo"></div>'}]}]
        result=self.client.post('/api/site-builder/projects',json=data,headers=self.auth)
        self.assertEqual(result.status_code,201,result.text)
        self.assertEqual(self.client.get('/api/site-builder/projects/'+result.json['id'],headers=self.auth).json['state']['layout'],data['layout'])
        self.assertIn(uploaded['filename'],list(banner_values(data)));self.assertEqual(self.client.delete('/api/site-builder/banners/'+uploaded['filename'],headers=self.auth).status_code,409)
        for value in [{'desktop':{'x':True}},{'desktop':{'x':float('nan')}},{'desktop':{'scale':0}},{'desktop':{'width':10001}},{'phone':{'crop':{'left':50,'right':50}}},{'attrs':{'href':'javascript:alert(1)'}},{'attrs':{'onload':'alert(1)'}},{'goals':{'yandexGoal':'click'}},{'goals':{'googleCategory':'Cat'}},{'goals':{'googleAction':'bad-event'}},{'parent':'native-1'},{'background':{'desktop':{'src':'data:image/png;base64,xxx'}}}]:
            bad=copy.deepcopy(data);bad['layout'][0]['objects']['native-1']=value
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400,str(value))
        for html in ['<script>alert(1)</script>','<img src="https://example.test/a" onerror="alert(1)">','<a href="javascript:alert(1)">X</a>','<div style="background:url(javascript:alert)">X</div>','<iframe src="https://example.test"></iframe>']:
            bad=copy.deepcopy(data);bad['layout'][0]['addedObjects'][0]['html']=html
            self.assertEqual(self.client.post('/api/site-builder/projects',json=bad,headers=self.auth).status_code,400,html)
        for name in ('objects.js','guides.js','object-studio.js'):
            self.assertEqual(self.client.get('/site-builder/assets/'+name,headers=self.auth).status_code,200)

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
