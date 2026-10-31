import io,json,tempfile,unittest,sys,os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import site_catalog as c
class Shops(unittest.TestCase):
 def test_independent_cache_ids_sources_failure(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(c,'CACHE',Path(folder)),patch.dict(os.environ,{'OUTMAX_SITE_STATS_NETWORK':'0'}):
   def raw(kind,shop):
    p={'testimonialData':{'TestimonialList':{'data':[{'id':1,'name':shop,'text':'review','city':'demo','rating':3}]}}} if kind=='reviews' else {'initialState':{'api':{'queries':{'news':{'endpointName':'getNewsList','data':{'NewsList':{'data':[{'id':1,'title':shop,'slug':'demo'}]}}}}}}}
    return ('<script id="__NEXT_DATA__">'+json.dumps({'props':{'pageProps':p}})+'</script>').encode()
   with patch.object(c,'fetch',side_effect=lambda path:raw('reviews' if path=='/testimonials' else 'news','hasl')),patch.object(c,'urlopen',side_effect=lambda req,**kw:io.BytesIO(raw('reviews' if req.full_url.endswith('testimonials') else 'news','hasle'))):
    for site in ['hasl','hasle']:
     for kind in ['reviews','news']:c.refresh_one(kind,site=site)
   first=c.content('hasl');second=c.content('hasle')
   self.assertEqual(first['reviews']['items'][0]['name'],'hasl');self.assertEqual(second['reviews']['items'][0]['name'],'hasle');self.assertEqual(second['reviews']['items'][0]['id'],'hasle:1');self.assertEqual(second['news']['items'][0]['url'],'https://haslestore.com/news/demo');self.assertEqual(second['reviews']['items'][0]['rating'],3)
   with patch.object(c,'urlopen',side_effect=OSError('offline')):
    with self.assertRaises(OSError):c.refresh_one('reviews',site='hasle')
   self.assertEqual(c.content('hasle'),second);self.assertEqual(c.content('hasl'),first)
if __name__=='__main__':unittest.main()
