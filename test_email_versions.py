"""Isolated email history/CAS/media/workflow regression. No real provider calls."""
import base64
import importlib
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import app as core

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=')

class EmailVersionsTests(unittest.TestCase):
 def test_versions_media_restore_conflicts_permissions_and_legacy(self):
  original=core.ARTICLES
  with tempfile.TemporaryDirectory() as temporary:
   core.ARTICLES=Path(temporary)
   try:
    server=importlib.import_module('wsgi_app');app=server.application
    owner=app.test_client();owner.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD})
    user=owner.get('/api/account').json
    sender_profiles=owner.get('/api/email-sender-profiles').json
    base='/api/email-projects/demo'
    def upload(data):
     r=owner.post(base+'/asset?path=images/photo.png',data=data,content_type='image/png');self.assertEqual(r.status_code,200);return r.json['filename']
    first_file=upload(PNG)
    payload=dict(filename='demo',subject='Первая 👟',preheader='[%name%] начало',site='hasl_ru',canvasHtml='<table><tr><td><strong>Первая 👟</strong></td></tr></table><img data-email-src="images/photo.png" src="images/photo.png">',renderedHtml=f'<img src="__EMAIL_PROJECT_ASSET__/{first_file}"><a href="[%unsubscribe_link%]">Отписка</a>',assets={'images/photo.png':first_file},importState={'css':'td{color:#123456}','root':{'tag':'article'},'chrome':{'brand':'hasl','phone':'Телефон демо','banner':'images/photo.png'},'chromeByBrand':{'hasl':{'brand':'hasl','phone':'Телефон демо'}}},fromEmail='sender@example.com',fromName='Демо',testEmail='test@example.com',listIds=['demo-list'],utm={'enabled':True,'source':'qa','medium':'email','campaign':'before'},notisendCampaignId=123,campaignFingerprint='old',requestId='first')
    first=owner.post(base,json=payload);self.assertEqual(first.status_code,200);first=first.json
    self.assertEqual(owner.post(base,json=payload).json['revision'],first['revision'])
    second_file=upload(PNG+b'new');self.assertNotEqual(first_file,second_file)
    response=owner.get(base+'/asset/'+first_file);self.assertEqual(response.data,PNG);response.close()
    second_payload={**payload,'subject':'Вторая','preheader':'После','canvasHtml':'<p>Вторая</p>','importState':{'chrome':{'brand':'outmax','phone':'Новый'}},'assets':{'images/photo.png':second_file},'renderedHtml':f'<img src="__EMAIL_PROJECT_ASSET__/{second_file}">','expectedRevision':first['revision'],'documentId':first['documentId'],'requestId':'second'}
    second=owner.post(base,json=second_payload);self.assertEqual(second.status_code,200);second=second.json
    page=owner.get(base+'/history').json;self.assertEqual(len(page['items']),2)
    historical=owner.get(base+'/history/'+first['revision']).json;self.assertEqual(historical['subject'],'Первая 👟');self.assertTrue(historical['frozenAssets'])
    stale=owner.post(base,json={**second_payload,'subject':'stale','requestId':'stale'});self.assertEqual(stale.status_code,409)
    self.assertEqual(owner.post(base,json={**second_payload,'expectedRevision':None,'requestId':'blind'}).status_code,409)
    restored=owner.post(base+'/history/'+first['revision']+'/restore',json={'expectedRevision':second['revision'],'documentId':second['documentId'],'requestId':'restore'});self.assertEqual(restored.status_code,200);third=restored.json
    again=owner.post(base+'/history/'+first['revision']+'/restore',json={'expectedRevision':second['revision'],'documentId':second['documentId'],'requestId':'restore'});self.assertEqual(again.json['revision'],third['revision'])
    current=owner.get(base).json
    for key in ('subject','preheader','site','canvasHtml','importState','fromEmail','fromName','testEmail','listIds','utm'):self.assertEqual(current[key],payload[key])
    self.assertIsNone(current['notisendCampaignId']);self.assertEqual(current['workflowStatus'],'draft');self.assertEqual(current['campaignFingerprint'],'');self.assertEqual(current['restoredFrom'],first['revision'])
    response=owner.get(base+'/asset/'+current['assets']['images/photo.png']);self.assertEqual(response.data,PNG);response.close()
    self.assertIn('[%unsubscribe_link%]',current['renderedHtml'])
    self.assertEqual(owner.get('/api/email-sender-profiles').json,sender_profiles)
    self.assertEqual(len(owner.get(base+'/history').json['items']),3)
    self.assertEqual(owner.get(base+'/history/../bad').status_code,404)
    anonymous=app.test_client();self.assertEqual(anonymous.get(base+'/history').status_code,401)
    users=owner.get('/api/users').json;other_user=next(u for u in users if u['role']=='editor')
    owner.patch('/api/users/'+other_user['id'],json={'name':other_user['name'],'login':other_user['login'],'emailAccess':True})
    other=app.test_client();other.post('/login',data={'login':other_user['login'],'password':other_user['password']});self.assertEqual(other.get(base+'/history').status_code,404);self.assertEqual(other.get(base+'/history/'+first['revision']).status_code,404)
    submitted=owner.post(base+'/workflow',json={'action':'submit','expectedRevision':third['revision']});self.assertEqual(submitted.status_code,200);workflow=submitted.json
    self.assertNotEqual(workflow['revision'],third['revision']);self.assertEqual(owner.post(base,json={**second_payload,'expectedRevision':third['revision'],'requestId':'before-review'}).status_code,409)
    # Two independent sessions start from the same acknowledged revision.
    def concurrent(label):
     client=app.test_client();client.post('/login',data={'login':server.AUTH_USER,'password':server.AUTH_PASSWORD});return client.post(base,json={**second_payload,'subject':label,'expectedRevision':workflow['revision'],'requestId':label}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:self.assertEqual(sorted(pool.map(concurrent,['writer-a','writer-b'])),[200,409])
    latest=owner.get(base).json
    frozen=owner.get(base+'/history/'+first['revision']).json['frozenAssets']['images/photo.png']
    target=next(Path(temporary).glob('users/*/_email_projects/_email_history/'+first['documentId']+'/assets/'+frozen));target.unlink()
    count=len(owner.get(base+'/history').json['items']);failed=owner.post(base+'/history/'+first['revision']+'/restore',json={'expectedRevision':latest['revision']});self.assertEqual(failed.status_code,400);self.assertEqual(owner.get(base).json['revision'],latest['revision']);self.assertEqual(len(owner.get(base+'/history').json['items']),count)
    # Legacy JSON remains readable and migrates at its first successful save.
    folder=next(Path(temporary).glob('users/*/_email_projects'));legacy=folder/'legacy.json';legacy.write_text(json.dumps({'id':'legacy','subject':'Старый проект','canvasHtml':'<p>Старый</p>','renderedHtml':'<p>Старый</p>','assets':{}},ensure_ascii=False),encoding='utf-8')
    self.assertEqual(owner.get('/api/email-projects/legacy').json['subject'],'Старый проект')
    migrated=owner.post('/api/email-projects/legacy',json={'subject':'Новый','canvasHtml':'<p>Новый</p>','renderedHtml':'<p>Новый</p>'});self.assertEqual(migrated.status_code,200);self.assertEqual(len(owner.get('/api/email-projects/legacy/history').json['items']),2)
    old_assets=folder/'old-media_files';old_assets.mkdir();(old_assets/'01234567890123456789.png').write_bytes(PNG)
    old_record={'id':'old-media','subject':'Старая фотография','canvasHtml':'<img data-email-src="images/old.png" src="images/old.png">','renderedHtml':'<img src="__EMAIL_PROJECT_ASSET__/01234567890123456789.png">','assets':{'images/old.png':'01234567890123456789.png'}}
    (folder/'old-media.json').write_text(json.dumps(old_record),encoding='utf-8')
    baseline=owner.get('/api/email-projects/old-media').json
    new_asset=owner.post('/api/email-projects/old-media/asset?path=images/old.png',data=PNG+b'new',content_type='image/png').json['filename']
    self.assertEqual((old_assets/'01234567890123456789.png').read_bytes(),PNG)
    updated=owner.post('/api/email-projects/old-media',json={**old_record,'assets':{'images/old.png':new_asset},'expectedRevision':baseline['revision']});self.assertEqual(updated.status_code,200)
    old_snapshot=owner.get('/api/email-projects/old-media/history/'+baseline['revision']).json
    self.assertEqual(old_snapshot['frozenAssets']['images/old.png'].split('.')[0],__import__('hashlib').sha256(PNG).hexdigest())
    self.assertEqual(owner.delete(base).status_code,200);self.assertEqual(owner.get(base+'/history').status_code,404);self.assertFalse((target.parent.parent).exists())
   finally:core.ARTICLES=original

if __name__=='__main__':unittest.main()
