"""Local browser-test server with isolated users and articles."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import app as core
state=core.ROOT/'release'/'ui-check'/'state'
state.mkdir(parents=True,exist_ok=True)
core.ARTICLES=state
from wsgi_app import application
for owner in ('admin','ivan-nekrut','editor-01','editor-02'):
 folder=state/'users'/owner;folder.mkdir(parents=True,exist_ok=True)
 for index,title in enumerate(('Как выбрать кроссовки для осени','Обзор новой коллекции — комфорт на каждый день','Топ-10 моделей для города: подробный гид по материалам и размерам')):
  identifier=f'sample-{index+1}'
  record=dict(id=identifier,brand='outmax',title=title,body=f'<h1>{title}</h1><p>Материал пользователя {owner}. Это проверочная статья с фотографией.</p><img src="/images/outmax.png" alt="OUTMAX">',products=[],createdAt=f'2026-10-0{index+1}T10:30:00+07:00',savedAt='2026-10-02T14:00:00+07:00')
  (folder/f'{identifier}.json').write_text(json.dumps(record,ensure_ascii=False),encoding='utf-8')
from waitress import serve
serve(application,host='127.0.0.1',port=8877)
