"""Names, archive, rename concurrency and icon persistence in isolated storage."""
import unittest,copy
import test_site_builder as fixture
class TemplateArchiveTests(unittest.TestCase):
    def setUp(self):
        fixture.SiteBuilderTests.setUp(self)
    def create(self):
        state=self.client.get('/api/site-builder/reference',headers=self.auth).json
        state['fileName']='Осенняя главная'
        state['layout']=[{'id':'test','source':'s0','name':'Главная','objects':{'button':{'buttonIcon':'up-right'}},'buttonStyles':{'l0':{'icon':'down-right'}}}]
        r=self.client.post('/api/site-builder/projects',json=state,headers=self.auth)
        self.assertEqual(r.status_code,201,r.text)
        return r.json,state
    def test_rename_preserves_page_content_and_rejects_stale_or_invalid_names(self):
        p,state=self.create();url='/api/site-builder/projects/'+p['id']
        for bad in ['', 'a/b',None,42,'x'*201]:
            self.assertEqual(self.client.post(url+'/rename',json={'revision':1,'fileName':bad},headers=self.auth).status_code,400)
        h={**self.auth,'X-Site-Request-Id':'archive-rename-test'}
        request={'revision':1,'fileName':'Новое имя'}
        renamed=self.client.post(url+'/rename',json=request,headers=h)
        self.assertEqual(renamed.status_code,200,renamed.text)
        self.assertEqual(self.client.post(url+'/rename',json=request,headers=h).json,renamed.json)
        self.assertEqual(self.client.post(url+'/rename',json=request,headers=self.auth).status_code,409)
        saved=self.client.get(url,headers=self.auth).json['state'];state['fileName']='Новое имя';self.assertEqual(saved,state)
        row=next(p for p in self.client.get('/api/site-builder/projects',headers=self.auth).json if p['id']==renamed.json['id'])
        self.assertTrue(row['created']);self.assertEqual(row['fileName'],'Новое имя');self.assertEqual(row['title'],state['title'])
    def test_archive_is_reversible_and_revision_checked(self):
        p,state=self.create();url='/api/site-builder/projects/'+p['id']
        self.assertEqual(self.client.post(url+'/archive',json={'revision':2,'restore':False},headers=self.auth).status_code,409)
        self.assertEqual(self.client.post(url+'/archive',json={'revision':1,'restore':False},headers=self.auth).status_code,200)
        self.assertNotIn(p['id'],[p['id'] for p in self.client.get('/api/site-builder/projects',headers=self.auth).json])
        self.assertEqual(self.client.get(url,headers=self.auth).status_code,404)
        self.assertEqual(self.client.post(url,json={'revision':1,'state':state},headers=self.auth).status_code,404)
        self.assertEqual(self.client.post(url+'/archive',json={'revision':1,'restore':True},headers=self.auth).status_code,200)
        self.assertEqual(self.client.get(url,headers=self.auth).json['state'],state)
        self.assertEqual(self.client.post(url+'/rename',json={'revision':1,'fileName':'x'}).status_code,401)
    def test_invalid_icons_rejected(self):
        p,state=self.create()
        for choice in ['left',None,True,'<script>']:
            invalid=copy.deepcopy(state);invalid['layout'][0]['objects']['button']['buttonIcon']=choice
            self.assertEqual(self.client.post('/api/site-builder/projects',json=invalid,headers=self.auth).status_code,400)
if __name__=='__main__':unittest.main()
