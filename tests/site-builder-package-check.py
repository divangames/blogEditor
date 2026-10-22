"""Run against an isolated full or legacy package in a fresh Python process."""
import os
import sys
import tempfile
from pathlib import Path

package=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(package))
os.environ['OUTMAX_USER']='site-package-demo'
os.environ['OUTMAX_PASSWORD']='site-package-demo-only'
import app as core
with tempfile.TemporaryDirectory(prefix='site-package-') as folder:
    core.ARTICLES=Path(folder)
    import wsgi_app as web
    client=web.application.test_client()
    response=client.post('/login',data={'login':'site-package-demo','password':'site-package-demo-only'})
    assert response.status_code==302
    assert client.get('/editor-api/me').json['siteAccess']
    for name in ('index.html','app.js','builder.js','renderer.js','runtime.js','style.css','template.html','wordstat.js','wordstat-seo.js','wordstat-page.js'):
        url='/site-builder/hasl/' if name=='index.html' else '/site-builder/assets/'+name
        result=client.get(url)
        assert result.status_code==200,(url,result.status_code)
        assert len(result.data)>100
    data=client.get('/editor-api/site-builder/reference').json
    created=client.post('/editor-api/site-builder/projects',json=data)
    assert created.status_code==201,created.text
    uid=created.json['id']
    assert client.get('/editor-api/site-builder/projects/'+uid).json['revision']==1
    assert client.get('/instructions/').status_code==200
    assert b'site-builder-access' in client.get('/instructions/').data
    for image in ('site-builder.png','site-builder-phone.png','site-builder-access.png'):
        assert client.get('/instructions/screens/'+image).status_code==200
    assert client.get('/site-builder/outmax/').status_code==200
    print('PASS full/legacy embedded constructor, project storage, permissions, Wordstat asset, instructions')
