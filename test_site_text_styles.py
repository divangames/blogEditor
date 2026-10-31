"""Selected-word style records: bounded values, UTF-16 ranges and CAS roundtrip."""
import copy
import unittest
import test_site_builder as fixture
class TextStyleTests(unittest.TestCase):
    def setUp(self):fixture.SiteBuilderTests.setUp(self)
    def state(self):
        s=self.client.get('/api/site-builder/reference',headers=self.auth).json
        s['layout']=[{'id':'styles','source':'s0','name':'Текст','objects':{'text-t1':{'textStyles':{'text':'Пара 👟 для прогулок','runs':[{'start':0,'end':7,'color':'#123456','background':'#ffee99','fontSize':42,'fontWeight':700}]}}}}]
        return s
    def test_roundtrip_and_revision(self):
        s=self.state();r=self.client.post('/api/site-builder/projects',json=s,headers=self.auth);self.assertEqual(r.status_code,201,r.text)
        url='/api/site-builder/projects/'+r.json['id'];self.assertEqual(self.client.get(url,headers=self.auth).json['state'],s)
        self.assertEqual(self.client.post(url,json={'revision':1,'state':s},headers=self.auth).status_code,200)
        self.assertEqual(self.client.post(url,json={'revision':1,'state':s},headers=self.auth).status_code,409)
    def test_phone_styles_roundtrip_and_validation(self):
        s=self.state();patch=s['layout'][0]['objects']['text-t1'];patch['phoneTextStyles']=copy.deepcopy(patch['textStyles']);patch['phoneTextStyles']['runs'][0]['fontSize']=22
        r=self.client.post('/api/site-builder/projects',json=s,headers=self.auth);self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(self.client.get('/api/site-builder/projects/'+r.json['id'],headers=self.auth).json['state'],s)
        patch['phoneTextStyles']['runs'][0]['fontSize']='22px';self.assertEqual(self.client.post('/api/site-builder/projects',json=s,headers=self.auth).status_code,400)
    def test_bad_values_rejected(self):
        for key,value in [('color','red'),('background','url(javascript:x)'),('fontSize',201),('fontSize',True),('fontWeight',650),('fontWeight','700'),('start',-1),('end',100),('end',True),('position','absolute')]:
            s=self.state();s['layout'][0]['objects']['text-t1']['textStyles']['runs'][0][key]=value
            self.assertEqual(self.client.post('/api/site-builder/projects',json=s,headers=self.auth).status_code,400,(key,value))
        for record in [{'text':'x','runs':[{'start':0,'end':1},{'start':0,'end':1}]},{'text':'x','runs':[],'html':'<script>'},{'text':'x','runs':'bad'}]:
            s=self.state();s['layout'][0]['objects']['text-t1']['textStyles']=record;self.assertEqual(self.client.post('/api/site-builder/projects',json=s,headers=self.auth).status_code,400)
if __name__=='__main__':unittest.main()
