import unittest
from bs4 import BeautifulSoup
import app

class ModelRatingTests(unittest.TestCase):
 def test_zero_half_and_max_stars_in_standalone_preview(self):
  for score,expected in [('0',[]),('2.5',['100%','100%','50%']),('5',['100%']*5)]:
   with self.subTest(score=score):
    body=f'<div class="om-model-rating"><div class="om-model-rating-grid"><div class="om-model-rating-item"><b>{score}/5</b><span>Теплоизоляция</span></div></div></div>'
    for brand in ['outmax','hasl']:
     doc=BeautifulSoup(app.admin_document('Тест',body,brand),'html.parser')
     stars=doc.select_one('.om-rating-stars')
     self.assertEqual(stars['aria-label'],score+' из 5')
     self.assertEqual(len(stars.find_all('span',recursive=False)),5)
     widths=[s['style'].split('width:')[1].split(';')[0] for s in stars.select(':scope > span > span')]
     self.assertEqual(widths,expected)
     self.assertEqual(doc.select_one('.om-model-rating-item > b').get_text(),score+'/5')
 def test_non_numeric_criterion_is_not_rewritten(self):
  body='<div class="om-model-rating-item"><b>Отлично</b><span>Посадка</span></div>'
  doc=BeautifulSoup(app.admin_document('Тест',body),'html.parser')
  self.assertIsNone(doc.select_one('.om-rating-stars'))
  self.assertEqual(doc.select_one('b').get_text(),'Отлично')
if __name__=='__main__':unittest.main()
