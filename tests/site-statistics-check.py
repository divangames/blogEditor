"""Deterministic aggregate counters: totals, shop isolation and last-good fallback."""
import io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import site_catalog as c

def page(kind,value):
 p={'testimonialData':{'TestimonialList':{'data':[{}]*20,'paginatorInfo':{'total':value,'count':20}}}} if kind=='reviews' else {'initialState':{'api':{'queries':{'catalog':{'endpointName':'getCatalogProducts','data':{'Catalog':{'products':{'paginatorInfo':{'total':383,'totalItems':value}}}}}}}}}
 return ('<script id="__NEXT_DATA__">'+json.dumps({'props':{'pageProps':p}})+'</script>').encode()
class StatisticsTests(unittest.TestCase):
 def test_totals_not_page_lengths(self):
  self.assertEqual(c.parse_shop_count(page('reviews',7310),'reviews'),7310)
  self.assertEqual(c.parse_shop_count(page('sneakers',6878),'sneakers'),6878)
  for invalid in [True,-1,'100',100000001]:
   with self.assertRaises(ValueError):c.parse_shop_count(page('reviews',invalid),'reviews')
 def test_separate_shops_and_failure_preserves_values(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(c,'CACHE',Path(folder)):
   def fetch(req,**kw):return io.BytesIO(page('reviews' if req.full_url.endswith('testimonials') else 'sneakers',6445 if 'haslestore' in req.full_url else 7310))
   with patch.object(c,'urlopen',side_effect=fetch):self.assertEqual(c.refresh_statistics()['errors'],[])
   first=c.read_json(Path(folder)/'shop-statistics.json',{})['shops']
   self.assertEqual(first['hasl']['reviews']['value'],7310);self.assertEqual(first['hasle']['reviews']['value'],6445)
   with patch.object(c,'urlopen',side_effect=OSError('offline')):self.assertEqual(len(c.refresh_statistics()['errors']),4)
   self.assertEqual(c.read_json(Path(folder)/'shop-statistics.json',{})['shops'],first)
if __name__=='__main__':unittest.main()
