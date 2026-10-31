import json
from pathlib import Path

root=Path(__file__).resolve().parent.parent
path=root/'instructions/articles.json'
data=json.loads(path.read_text(encoding='utf-8'))
guide={
 'id':'site-fonts','group':'sites','title':'ХАСЛ: полное семейство Montserrat',
 'description':'Девять насыщенностей, настоящий курсив, оформление телефона и сохранение в HTML/ZIP.',
 'keywords':'шрифт Montserrat Монсеррат семейство начертание насыщенность Thin Light Regular Bold Black курсив 100 900',
 'updated':'2026-10-25','image':'site-montserrat-family.png','caption':'Montserrat Light 300 Italic: насыщенность и наклон выбираются отдельно',
 'steps':[
  'Выберите текстовый элемент на холсте или в списке «Элементы и оформление». Откройте «Оформление элемента» и установите «Шрифт» → Montserrat.',
  'В «Насыщенность / начертание» доступны Thin 100, ExtraLight 200, Light 300, Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800 и Black 900. «По шаблону» сохраняет наследование. Прежнее промежуточное значение, например 250, не теряется при открытии проекта.',
  'Поле «Наклон» задаёт «Обычный» или «Курсив». Это отдельная ось, поэтому 9 насыщенностей × 2 наклона дают 18 сочетаний Montserrat. Например, для Light Italic выберите Light — 300 и «Курсив». Курсив загружается как настоящее начертание семейства, а не получается только искусственным наклоном обычного шрифта.',
  'Для узла исходного шаблона откройте «Объекты» → выберите текст → «Текст, цвет и скругление». Укажите Montserrat, насыщенность 100–900 и наклон. Числовое поле предлагает подсказки девяти стандартных весов и позволяет сохранить промежуточное значение переменного шрифта.',
  'Настройте «Компьютер» и «Телефон» отдельно. Пустые телефонные свойства наследуются; заданная насыщенность/наклон телефона не меняют компьютер. Проверьте оба предпросмотра. При неожиданном результате проверьте блокировку и отдельные объектные правки оформления, которые могут переопределять оформление элемента.',
  'Сохраните страницу и заново скачайте HTML или ZIP сайта. Подключение всего диапазона Montserrat и заданные CSS-свойства сохраняются в конечных файлах. Ранее скачанный HTML сам не обновится; соберите его повторно.',
  'Шрифты загружаются из Google Fonts, как и раньше: это не автономные файлы внутри ZIP. Разрешите fonts.googleapis.com и fonts.gstatic.com. При недоступности сети браузер использует запасной системный шрифт — он может выглядеть иначе и не иметь всех насыщенностей. Повторите проверку с доступной сетью. Кириллица и все 18 сочетаний проверены реальной загрузкой FontFace на демонстрационной странице.'
 ],
 'related':['site-designer','site-objects','site-history','site-bundle','site-quality']
}
data['articles'][:]=[a for a in data['articles'] if a['id']!='site-fonts']
data['articles'].insert(next(i for i,a in enumerate(data['articles']) if a['id']=='site-designer'),guide)
for a in data['articles']:
    if a['id'] in ['site-designer','site-objects','site-quality']:
        a['related']=list(dict.fromkeys(a.get('related',[])+['site-fonts']))
data['updated']='2026-10-25'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
