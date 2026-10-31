"""Run against an isolated full or legacy package in a fresh Python process."""
import os
import sys
import tempfile
import json
import re
import io
from PIL import Image
from pathlib import Path
from unittest.mock import patch

package=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(package))
os.environ['OUTMAX_USER']='site-package-demo'
os.environ['OUTMAX_PASSWORD']='site-package-demo-only'
if not (package/'shared_blocks.py').exists():
    # Passenger enters WSGI first; preload its embedded core dependencies before
    # this harness imports app to redirect storage to a temporary directory.
    bootstrap=(package/'wsgi_app.py').read_text(encoding='utf-8').split('\nimport app as core',1)[0]
    exec(compile(bootstrap,str(package/'wsgi_app.py'),'exec'),{'__file__':str(package/'wsgi_app.py')})
import app as core
with tempfile.TemporaryDirectory(prefix='site-package-') as folder:
    core.ARTICLES=Path(folder)
    import wsgi_app as web
    client=web.application.test_client()
    response=client.post('/login',data={'login':'site-package-demo','password':'site-package-demo-only'})
    assert response.status_code==302
    icon=client.get('/images/hasle.png')
    assert icon.status_code==200
    with Image.open(io.BytesIO(icon.data)) as picture:picture.verify()
    assert client.get('/editor-api/me').json['siteAccess']
    motion=web.application.test_client().get('/editor-api/public-site-motion.js?v=20261026-1')
    assert motion.status_code==200 and 'HaslMobileMotion' in motion.text
    assert motion.headers['Access-Control-Allow-Origin']=='*'
    assert 'max-age=3600' in motion.headers['Cache-Control']
    bound = web.install_site_builder.__globals__
    source_catalog, source_feedback = bound['catalog'], bound['site_feedback']
    imported = {'code': '43816', 'aggregate': {'enabled': True, 'value': '4.5', 'ratingCount': '', 'reviewCount': '2'}, 'reviews': [],
                'source': {'provider': 'hasl', 'url': 'https://xn--80awro.xn--p1ai/krossovki/qa-43816', 'productId': '43816', 'fetchedAt': '2026-10-25T06:00:00+00:00', 'total': 2, 'loaded': 0, 'skipped': 2, 'incentive': False, 'auto': False, 'edited': False}}
    with patch.object(source_catalog, 'reload_catalog'), patch.object(source_catalog, 'PRODUCTS', {'43816': {'code': '43816', 'url': imported['source']['url']}}), patch.object(source_catalog, 'ALIASES', {}), patch.object(source_feedback, 'load', return_value=imported):
        result = client.get('/editor-api/site-builder/product-feedback?code=43816')
        assert result.status_code == 200, result.text
        assert result.json['feedback']['aggregate']['ratingCount'] == ''
        assert result.json['feedback']['aggregate']['reviewCount'] == '2'
    zip_library=client.get('/vendor/jszip.min.js')
    assert zip_library.status_code==200 and b'JSZip' in zip_library.data
    for name in ('index.html','global-styles.js','feedback.js','commerce.js','app.js','builder.js','elements.js','designer.js','objects.js','guides.js','object-studio.js','layers.js','layout.js','versions.js','renderer.js','runtime.js','style.css','template.html','wordstat.js','wordstat-seo.js','wordstat-page.js'):
        url='/site-builder/hasl/' if name=='index.html' else '/site-builder/assets/'+name
        result=client.get(url)
        assert result.status_code==200,(url,result.status_code)
        assert len(result.data)>100
    data=client.get('/editor-api/site-builder/reference').json
    data['layout']=[{'id':'package-faq','source':'s8','name':'FAQ',
                     'faqSettings':{'initial':'first','mode':'single','heading':'right'}}]
    data['fileName']='Package template'
    data['layout'][0]['buttonStyles']={'qa':{'icon':'up-right'}}
    data['layout'][0]['objects']={'qa':{'buttonIcon':'down-right'}}
    data['layout'][0]['objects']['qa']['textStyles']={'text':'Demo text','runs':[{'start':0,'end':4,'color':'#2244ee','background':'#ffee88','fontSize':28,'fontWeight':700}]}

    data['layout'][0]['objects']['qa']['phoneTextStyles']={'text':'Demo text','runs':[{'start':0,'end':4,'fontSize':22}]}
    data['globalStyles']={'reviewCard':{'desktop':{'backgroundColor':'#112233'}}}
    data['commerce']={'descriptions':{'43816':'Package commerce roundtrip'},'shipping':{'enabled':True,'country':'RU','rate':'0','handlingMin':'0','handlingMax':'1','transitMin':'2','transitMax':'5'},'returns':{'enabled':True,'country':'RU','category':'MerchantReturnFiniteReturnWindow','days':'14','method':'ReturnByMail','fees':'FreeReturn'}}
    data['commerce']['feedback']={'43816':{'aggregate':{'enabled':True,'value':'4.5','ratingCount':'2','reviewCount':'2'},'reviews':[{'id':'package-review','enabled':True,'author':'Demo buyer','body':'Demo package review','rating':'5','date':'2026-10-24'}]}}
    created=client.post('/editor-api/site-builder/projects',json=data)
    assert created.status_code==201,created.text
    uid=created.json['id']
    assert client.get('/editor-api/site-builder/projects/'+uid).json['revision']==1
    assert client.get('/editor-api/site-builder/projects/'+uid).json['state']['layout'][0]['faqSettings']==data['layout'][0]['faqSettings']
    version_url='/editor-api/site-builder/projects/'+uid
    assert client.get(version_url+'/versions').json['items'][0]['revision']==1
    data['title']='Package versions QA'
    assert client.post(version_url,json={'revision':1,'state':data}).json['revision']==2
    restored=client.post(version_url+'/restore',json={'revision':2,'version':1},headers={'X-Site-Request-Id':'package-restore-check'})
    assert client.get(version_url).json['state']['commerce']['feedback']==data['commerce']['feedback']
    assert restored.json['revision']==3
    assert client.post(version_url+'/restore',json={'revision':2,'version':1},headers={'X-Site-Request-Id':'package-restore-check'}).json['revision']==3
    old_state=client.get(version_url).json['state']
    renamed=client.post(version_url+'/rename',json={'revision':3,'fileName':'Renamed package template'})
    assert renamed.status_code==200,renamed.text
    new_state=client.get(version_url).json['state'];old_state['fileName']='Renamed package template';assert new_state==old_state
    assert client.post(version_url+'/archive',json={'revision':4,'restore':False}).status_code==200
    assert client.get(version_url).status_code==404
    assert not any(p['id']==uid for p in client.get('/editor-api/site-builder/projects').json)
    assert client.post(version_url+'/archive',json={'revision':4,'restore':True}).status_code==200
    assert client.get(version_url).json['state']==old_state
    assert client.get('/instructions/').status_code==200
    wiki=client.get('/instructions/').data.decode('utf-8')
    wiki_data=json.loads(re.search(r'<script id="wiki-data" type="application/json">(.*?)</script>',wiki,re.S).group(1))
    shots={image['image'] for change in wiki_data['changes'] for image in change.get('images',[])}
    shots.update(article['image'] for article in wiki_data['articles'] if article.get('image'))
    shots.update(step['image'] for article in wiki_data['articles'] for step in article.get('stepImages',{}).values())
    for name in shots:
        response=client.get('/instructions/screens/'+name)
        assert response.status_code==200,name
        with Image.open(io.BytesIO(response.data)) as image:
            assert min(image.size)>0,name
            image.verify()
    assert b'site-builder-access' in client.get('/instructions/').data
    for image in ('site-builder.png','site-builder-phone.png','site-builder-access.png'):
        assert client.get('/instructions/screens/'+image).status_code==200
    assert client.get('/site-builder/outmax/').status_code==200
    print('PASS full/legacy embedded constructor, project storage, permissions, Wordstat asset, instructions')
