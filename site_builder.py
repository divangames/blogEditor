"""Authenticated HASL constructor; private projects, immutable reference and CAS saves."""
import json
import re
import sqlite3
import uuid
import io
import hashlib
from urllib.parse import urlsplit
from pathlib import Path
from contextlib import contextmanager
from datetime import date as calendar_date, datetime as calendar_datetime
from concurrent.futures import ThreadPoolExecutor
from flask import Response, g, jsonify, request, send_file
import site_catalog as catalog
import site_feedback
from bs4 import BeautifulSoup

SITE_ASSETS = {}
COMMERCE_COUNTRIES = set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split())


def banner_values(data):
    for value in [data.get('heroBackgrounds', {}), *(x.get('heroBackgrounds', {}) for x in data.get('layout', [])), *(x.get('blockBackgrounds', {}) for x in data.get('layout', []))]:
        if not isinstance(value, dict) or set(value) - {'desktop', 'phone', 'finderDesktop', 'finderPhone'}:
            raise ValueError('Повреждены фоны первого экрана')
        for url in value.values():
            if not isinstance(url, str) or (url and not re.fullmatch(r'https?://[^/\s]+/(?:editor-api|api)/public-site-banners/[a-f0-9]{32}\.(?:jpg|png|webp)', url)):
                raise ValueError('Выберите фон из библиотеки баннеров')
            if url:
                yield url.rsplit('/', 1)[-1]
    for section in data.get('layout', []):
        for element in section.get('elements', []):
            for field in ('src', 'poster'):
                url = element.get(field, '')
                match = re.fullmatch(r'https?://[^/\s]+/(?:editor-api|api)/public-site-banners/([a-f0-9]{32}\.(?:jpg|png|webp))', url)
                if match:
                    yield match[1]
        urls = []
        for patch in section.get('objects', {}).values():
            urls.extend(patch.get('attrs', {}).get(k, '') for k in ('src', 'poster'))
            urls.extend(v.get('src', '') for v in patch.get('background', {}).values())
        urls.extend(record.get('html', '') for record in section.get('addedObjects', []))
        for value in urls:
            yield from re.findall(r'/(?:editor-api|api)/public-site-banners/([a-f0-9]{32}\.(?:jpg|png|webp))', value)


def validate_design(data):
    """Bounded element values; renderer constructs tags and CSS from this whitelist."""
    def number(value, low, high):
        return type(value) in (int, float) and low <= value <= high

    def address(value, anchor=False):
        if not isinstance(value, str) or len(value) > 2000 or re.search(r'[\s<>"\x00-\x1f]', value):
            return False
        if not value or (anchor and re.fullmatch(r'#[a-zA-Z][\w-]*', value)):
            return True
        try:
            parsed = urlsplit(value)
            return parsed.scheme in ('https', 'http') and bool(parsed.hostname) and not parsed.username and not parsed.password
        except ValueError:
            return False

    limits = {'fontSize': (8, 200), 'fontWeight': (100, 900), 'lineHeight': (.6, 3),
              'letterSpacing': (-5, 30), 'radius': (0, 200), 'padding': (0, 200), 'paddingX': (0, 200), 'paddingY': (0, 200),
              'marginTop': (0, 400), 'marginBottom': (0, 400), 'opacity': (0, 1), 'width': (1, 100)}
    choices = {'align': ('left', 'center', 'right'), 'fontFamily': ('Arial', 'Montserrat', 'Manrope', 'Georgia', 'Verdana'),
               'fontStyle': ('normal', 'italic'), 'textDecoration': ('none', 'underline', 'line-through')}

    def style(values):
        if not isinstance(values, dict) or set(values) - (set(limits) | set(choices) | {'color', 'background'}):
            raise ValueError('Недопустимое оформление элемента')
        for key, value in values.items():
            valid = number(value, *limits[key]) if key in limits else value in choices[key] if key in choices else isinstance(value, str) and bool(re.fullmatch(r'#[0-9a-fA-F]{6}', value))
            if not valid:
                raise ValueError('Значение оформления элемента вне допустимого диапазона')

    def object_design(section):
        def fail():
            raise ValueError('Повреждены настройки объекта шаблона')

        def identifier(value):
            return isinstance(value, str) and value not in ('__proto__', 'constructor', 'prototype') and bool(re.fullmatch(r'[a-zA-Z0-9_-]{1,180}', value))

        def link(value):
            return address(value, True) or isinstance(value, str) and bool(re.fullmatch(r'/?(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z][\w-]*)?', value))

        def crop(values):
            if not isinstance(values, dict) or set(values) - {'top', 'bottom', 'left', 'right'} or any(not number(v, 0, 99) for v in values.values()):
                fail()
            if values.get('left', 0) + values.get('right', 0) >= 100 or values.get('top', 0) + values.get('bottom', 0) >= 100:
                fail()

        bounds = {'x': (-10000, 10000), 'y': (-10000, 10000), 'width': (1, 10000), 'height': (1, 10000), 'rotation': (-3600, 3600), 'scale': (1, 1000), 'opacity': (0, 1), 'z': (-1000, 1000), 'positionX': (0, 100), 'positionY': (0, 100)}
        layout_choices = {'mode': ('row', 'column', 'block'), 'wrap': ('nowrap', 'wrap'), 'justify': ('flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'), 'align': ('stretch', 'flex-start', 'center', 'flex-end', 'baseline'), 'widthMode': ('fixed', 'hug', 'fill'), 'heightMode': ('fixed', 'hug', 'fill'), 'anchorX': ('flow', 'start', 'end', 'stretch', 'center'), 'anchorY': ('flow', 'start', 'end', 'stretch', 'center')}
        layout_bounds = {'gap': (0, 400), 'gapY': (0, 400), 'left': (-10000, 10000), 'right': (-10000, 10000), 'top': (-10000, 10000), 'bottom': (-10000, 10000)}
        choices = {'position': ('static', 'relative', 'absolute', 'fixed', 'sticky'), 'display': ('inline-block',), 'overflow': ('visible', 'hidden', 'clip'), 'fit': ('cover', 'contain', 'fill')}
        objects = section.get('objects', {})
        if not isinstance(objects, dict) or len(objects) > 2000:
            fail()
        for key, patch in objects.items():
            if not identifier(key) or not isinstance(patch, dict) or set(patch) - {'parent', 'before', 'deleted', 'text', 'attrs', 'desktop', 'phone', 'background', 'goals', 'name', 'locked', 'reveal', 'buttonIcon', 'textStyles', 'phoneTextStyles'}:
                fail()
            if not isinstance(patch.get('name', ''), str) or len(patch.get('name', '')) > 120 or type(patch.get('locked', False)) is not bool:
                fail()
            for text_key in ('textStyles','phoneTextStyles'):
                if text_key not in patch:continue
                record=patch[text_key]
                if not isinstance(record,dict) or set(record)-{'text','runs'} or not isinstance(record.get('text'),str) or len(record['text'].encode('utf-16-le','surrogatepass'))//2>10000 or not isinstance(record.get('runs'),list) or len(record['runs'])>1000:
                    fail()
                end=0
                for run in record['runs']:
                    if not isinstance(run,dict) or set(run)-{'start','end','color','background','fontSize','fontWeight'} or type(run.get('start')) is not int or type(run.get('end')) is not int or run['start']<end or run['end']<=run['start'] or run['end']>len(record['text'].encode('utf-16-le','surrogatepass'))//2:
                        fail()
                    for key in ('color','background'):
                        if key in run and (not isinstance(run[key],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',run[key])):fail()
                    if 'fontSize' in run and (type(run['fontSize']) is not int or not 8<=run['fontSize']<=200):fail()
                    if 'fontWeight' in run and (type(run['fontWeight']) is not int or run['fontWeight'] not in (400,500,600,700,800,900)):fail()
                    end=run['end']
            if patch.get('buttonIcon', 'none') not in ('none', 'right', 'up-right', 'down-right'):
                fail()
            if type(patch.get('reveal', False)) is not bool:
                fail()
            for prop in ('parent', 'before'):
                if prop in patch and (not identifier(patch[prop]) or patch[prop] == key or key == 'root'):
                    fail()
            if type(patch.get('deleted', False)) is not bool or not isinstance(patch.get('text', ''), str) or len(patch.get('text', '')) > 10000:
                fail()
            for device in ('desktop', 'phone'):
                value = patch.get(device, {})
                if not isinstance(value, dict) or set(value) - (set(bounds) | set(choices) | {'visible', 'flipX', 'flipY', 'crop', 'style', 'layout'}):
                    fail()
                for prop, entry in value.items():
                    if prop in bounds and not number(entry, *bounds[prop]) or prop in choices and entry not in choices[prop] or prop in ('visible', 'flipX', 'flipY') and type(entry) is not bool:
                        fail()
                if 'crop' in value:
                    crop(value['crop'])
                style(value.get('style', {}))
                layout = value.get('layout', {})
                if not isinstance(layout, dict) or set(layout) - (set(layout_choices) | set(layout_bounds) | {'flow'}):
                    fail()
                for name, entry in layout.items():
                    if name in layout_choices and entry not in layout_choices[name] or name in layout_bounds and not number(entry, *layout_bounds[name]) or name == 'flow' and type(entry) is not bool:
                        fail()
            attrs = patch.get('attrs', {})
            if not isinstance(attrs, dict) or set(attrs) - {'src', 'poster', 'href', 'action', 'alt', 'title', 'placeholder', 'newTab'}:
                fail()
            for prop, value in attrs.items():
                if prop in ('alt', 'title', 'placeholder') and (not isinstance(value, str) or len(value) > 1000) or prop == 'newTab' and type(value) is not bool:
                    fail()
                if prop in ('src', 'poster', 'href', 'action') and not (link(value) if prop == 'href' else address(value)):
                    fail()
                if prop == 'action' and value and not value.startswith('https://'):
                    fail()
            background = patch.get('background', {})
            if not isinstance(background, dict) or set(background) - {'desktop', 'phone'}:
                fail()
            for value in background.values():
                if not isinstance(value, dict) or set(value) - {'src', 'x', 'y', 'zoom', 'rotation', 'opacity', 'fit', 'crop'} or not address(value.get('src', '')):
                    fail()
                for prop in ('x', 'y', 'rotation', 'opacity', 'zoom'):
                    if prop in value and not number(value[prop], *(bounds['scale' if prop == 'zoom' else prop])):
                        fail()
                if value.get('fit', 'cover') not in choices['fit']:
                    fail()
                if 'crop' in value:
                    crop(value['crop'])
            goals = patch.get('goals', {})
            limits = {'counterId': 15, 'yandexGoal': 200, 'googleCategory': 100, 'googleAction': 40}
            if not isinstance(goals, dict) or set(goals) - set(limits) or any(not isinstance(v, str) or len(v) > limits[k] or re.search(r'[\x00-\x1f]', v) for k, v in goals.items()):
                fail()
            if goals.get('counterId') and not re.fullmatch(r'[1-9]\d{0,14}', goals['counterId']) or goals.get('yandexGoal') and not goals.get('counterId') and not any(c.get('yandexCounter') for c in analytics.values()) or goals.get('googleCategory') and not goals.get('googleAction') or goals.get('googleAction') and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,39}', goals['googleAction']):
                fail()
        for relation in ('parent', 'before'):
            complete = set()
            for start in objects:
                path, cursor = set(), start
                while cursor in objects and cursor not in complete:
                    if cursor in path:
                        fail()
                    path.add(cursor)
                    cursor = objects[cursor].get(relation)
                complete.update(path)
        groups = section.get('objectGroups', [])
        if not isinstance(groups, list) or len(groups) > 200:
            fail()
        group_ids, grouped_members = set(), set()
        for group in groups:
            if not isinstance(group, dict) or set(group) - {'id', 'name', 'members', 'locked'} or not identifier(group.get('id')) or group['id'] in group_ids or not isinstance(group.get('name'), str) or not 1 <= len(group['name']) <= 120 or type(group.get('locked', False)) is not bool:
                fail()
            members = group.get('members')
            if not isinstance(members, list) or not 2 <= len(members) <= 200 or any(not identifier(m) or m == 'root' or m in grouped_members for m in members) or len(set(members)) != len(members):
                fail()
            group_ids.add(group['id'])
            grouped_members.update(members)
        added = section.get('addedObjects', [])
        if not isinstance(added, list) or len(added) > 200:
            fail()
        seen = set()
        tags = set('section div article aside header footer main nav h1 h2 h3 h4 h5 h6 p span strong em b i u s small a button img video audio source details summary hr ul ol li label input select option textarea form figure figcaption table thead tbody tr td th svg path circle rect line polyline polygon g defs stop lineargradient clippath br'.split())
        for record in added:
            if not isinstance(record, dict) or set(record) != {'id', 'parent', 'html'} or not identifier(record['id']) or record['id'] in seen or not identifier(record['parent']) or not isinstance(record['html'], str) or len(record['html']) > 200000:
                fail()
            seen.add(record['id'])
            doc = BeautifulSoup(record['html'], 'html.parser')
            if len(doc.find_all(recursive=False)) != 1:
                fail()
            for node in doc.find_all(True):
                if node.name.lower() not in tags:
                    fail()
                for attr, raw in node.attrs.items():
                    value = ' '.join(raw) if isinstance(raw, list) else str(raw)
                    if attr == 'data-site-object' and not identifier(value):
                        fail()
                    if attr.lower().startswith('on') or attr in ('srcdoc', 'contenteditable', 'autofocus', 'formaction'):
                        fail()
                    if attr in ('src', 'poster', 'href', 'action', 'xlink:href') and not (link(value) if attr in ('href', 'xlink:href') else address(value)):
                        fail()
                    if attr == 'style':
                        if re.search(r'expression|javascript:|@import|behavior\s*:|[\\\x00-\x1f]', value, re.I):
                            fail()
                        for url in re.findall(r'url\(\s*[\'"]?([^\)\'"\s]+)', value, re.I):
                            if not address(url, True):
                                fail()

    analytics = data.get('analytics', {})
    if not isinstance(analytics, dict) or set(analytics)-{'hasl','hasle'}:
        raise ValueError('Некорректные настройки аналитики')
    for config in analytics.values():
        if not isinstance(config, dict) or set(config)-{'yandexCounter','googleMeasurementId','loadScripts'}:
            raise ValueError('Некорректные настройки счётчиков')
        for key, pattern in [('yandexCounter',r'[1-9]\d{0,14}'),('googleMeasurementId',r'G-[A-Z0-9]{4,20}')]:
            value=config.get(key,'')
            if not isinstance(value,str) or value and not re.fullmatch(pattern,value):
                raise ValueError('Метрика: числовой ID; Google Analytics: G-…')
        if type(config.get('loadScripts',False)) is not bool:
            raise ValueError('Некорректный режим подключения счётчиков')
    settings = data.get('pageSettings', {})
    if not isinstance(settings, dict) or set(settings) - {'description', 'canonical', 'favicon', 'noindex', 'path'}:
        raise ValueError('Повреждены настройки страницы')
    if 'path' in settings and (not isinstance(settings['path'], str) or not re.fullmatch(r'(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.html', settings['path']) or len(settings['path']) > 160):
        raise ValueError('Адрес файла: index.html или folder/page.html, без пробелов и переходов ..')
    if not isinstance(settings.get('description', ''), str) or len(settings.get('description', '')) > 1000 or type(settings.get('noindex', False)) is not bool:
        raise ValueError('Проверьте описание и индексацию страницы')
    if any(not address(settings.get(key, '')) for key in ('canonical', 'favicon')):
        raise ValueError('Укажите http(s)-адрес в настройках страницы')
    for section in data.get('layout', []):
        object_design(section)
        styles = section.get('elementStyles', {})
        if not isinstance(styles, dict) or len(styles) > 1000:
            raise ValueError('Повреждено оформление элементов шаблона')
        for key, value in styles.items():
            if not isinstance(key, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', key) or not isinstance(value, dict) or set(value) - {'desktop', 'phone'}:
                raise ValueError('Повреждено оформление элементов шаблона')
            for entry in value.values():
                style(entry)
        if section.get('source') != 'custom':
            if section.get('elements'):
                raise ValueError('Свои элементы добавляются в собственную секцию')
            continue
        if section.get('mode', 'grid') not in ('grid', 'free'):
            raise ValueError('Неизвестное размещение секции')
        for key, low, high in [('columns', 1, 4), ('mobileColumns', 1, 4), ('gap', 0, 120), ('contentWidth', 280, 1920), ('height', 100, 3000), ('mobileHeight', 100, 3000)]:
            if key in section and (type(section[key]) is not int or not low <= section[key] <= high):
                raise ValueError('Размеры секции вне допустимого диапазона')
        elements = section.get('elements')
        if not isinstance(elements, list) or len(elements) > 100:
            raise ValueError('Допускается до 100 элементов в секции')
        ids = set()
        for element in elements:
            if (not isinstance(element, dict) or not isinstance(element.get('id'), str)
                    or not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}', element['id']) or element['id'] in ids
                    or element.get('type') not in ('heading', 'text', 'image', 'button', 'video', 'divider', 'spacer', 'form')
                    or element.get('visibility', 'all') not in ('all', 'desktop', 'phone', 'hidden')):
                raise ValueError('Повреждена структура элементов')
            ids.add(element['id'])
            for key, limit in [('text', 10000), ('alt', 500)]:
                if not isinstance(element.get(key, ''), str) or len(element.get(key, '')) > limit:
                    raise ValueError('Текст элемента слишком большой')
            if element.get('tag', 'h2') not in ('h1', 'h2', 'h3', 'h4') or type(element.get('newTab', False)) is not bool:
                raise ValueError('Повреждён заголовок или ссылка элемента')
            for key in ('src', 'poster', 'href', 'action'):
                value = element.get(key, '')
                relative = key == 'href' and isinstance(value, str) and re.fullmatch(r'/?(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z][\w-]*)?', value)
                if not relative and not address(value, anchor=key == 'href'):
                    raise ValueError('Недопустимый адрес элемента')
            if element.get('action') and not element['action'].startswith('https://'):
                raise ValueError('Обработчик формы должен использовать HTTPS')
            for key, low, high in [('span', 1, 4), ('mobileSpan', 1, 4), ('height', 0, 1000)]:
                if key in element and (type(element[key]) is not int or not low <= element[key] <= high):
                    raise ValueError('Размер элемента вне допустимого диапазона')
            for key in ('rect', 'mobileRect'):
                rect = element.get(key, {})
                if not isinstance(rect, dict) or set(rect) - {'x', 'y', 'width', 'height'}:
                    raise ValueError('Повреждены координаты элемента')
                for prop, value in rect.items():
                    low = 20 if prop in ('width', 'height') else 0
                    if not number(value, low, 1920 if prop in ('x', 'width') else 3000):
                        raise ValueError('Координаты элемента вне допустимого диапазона')
            style(element.get('style', {}))
            style(element.get('mobileStyle', {}))


@contextmanager
def connection(path):
    db = sqlite3.connect(path, timeout=30)
    try:
        with db:
            yield db
    finally:
        db.close()


def asset(name):
    if name in SITE_ASSETS:
        return SITE_ASSETS[name]
    if name == 'zip.js':
        return (Path(__file__).resolve().parent / 'vendor' / 'jszip.min.js').read_text(encoding='utf-8')
    if name in ('wordstat.js', 'wordstat-seo.js'):
        return (Path(__file__).resolve().parent / ('editor-' + name)).read_text(encoding='utf-8')
    return (Path(__file__).resolve().parent / 'site-builder' / name).read_text(encoding='utf-8')


def validate_product_feedback(feedback):
    """Only bounded user-supplied product reviews and explicit aggregate values."""
    if not isinstance(feedback, dict) or len(feedback) > 1000:
        raise ValueError('Отзывы: до 1000 артикулов')
    for code, f in feedback.items():
        if (code in ('__proto__', 'constructor', 'prototype') or not re.fullmatch(r'[-\w.]{1,100}', code, re.ASCII)
                or not isinstance(f, dict) or set(f) - {'aggregate', 'reviews', 'source'}):
            raise ValueError('Повреждены отзывы товара')
        if 'source' in f:
            source = f['source']
            if (not isinstance(source, dict) or set(source) - {'provider', 'url', 'productId', 'fetchedAt', 'total', 'loaded', 'skipped', 'incentive', 'auto', 'edited'}
                    or source.get('provider') != 'hasl'
                    or any(k in source and type(source[k]) is not bool for k in ('auto', 'edited', 'incentive'))
                    or any(k in source and (type(source[k]) is not int or not 0 <= source[k] <= (20 if k == 'loaded' else 10000000)) for k in ('total', 'loaded', 'skipped'))):
                raise ValueError('Повреждён источник отзывов')
            if source.get('url'):
                site_feedback.product_path(source['url'])
            if 'url' in source and not isinstance(source['url'], str):
                raise ValueError('Повреждён адрес источника отзывов')
            if 'productId' in source and (not isinstance(source['productId'], str) or not re.fullmatch(r'[1-9][0-9]{0,17}', source['productId'])):
                raise ValueError('Повреждён ID товара источника')
            if 'fetchedAt' in source and (not isinstance(source['fetchedAt'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00', source['fetchedAt'])):
                raise ValueError('Повреждена дата загрузки отзывов')
            if 'fetchedAt' in source:
                try:
                    calendar_datetime.fromisoformat(source['fetchedAt'])
                except ValueError:
                    raise ValueError('Повреждена дата загрузки отзывов') from None
        a, rows = f.get('aggregate', {}), f.get('reviews', [])
        if (not isinstance(a, dict) or set(a) - {'enabled', 'value', 'ratingCount', 'reviewCount'}
                or 'enabled' in a and type(a['enabled']) is not bool):
            raise ValueError('Повреждён сводный рейтинг')
        for k in ('value', 'ratingCount', 'reviewCount'):
            if k not in a:
                continue
            v = a[k]
            if not isinstance(v, str) or len(v) > 30:
                raise ValueError('Повреждён сводный рейтинг')
            if v and (not re.fullmatch(r'\d+(?:\.\d{1,2})?', v, re.ASCII)
                      or not (1 <= float(v) <= 5 if k == 'value' else 0 <= float(v) <= 10000000 and float(v).is_integer())):
                raise ValueError('Рейтинг: 1–5; количество — целое число 0–10 000 000')
        if not isinstance(rows, list) or len(rows) > 20:
            raise ValueError('До 20 отзывов на артикул')
        ids = set()
        for r in rows:
            if (not isinstance(r, dict) or set(r) - {'id', 'enabled', 'author', 'body', 'rating', 'date'}
                    or not isinstance(r.get('id'), str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}', r['id'])
                    or r['id'] in ('__proto__', 'constructor', 'prototype') or r['id'] in ids
                    or 'enabled' in r and type(r['enabled']) is not bool):
                raise ValueError('Повреждён отзыв товара')
            ids.add(r['id'])
            for k, limit in [('author', 99), ('body', 5000), ('rating', 30), ('date', 10)]:
                if k in r and (not isinstance(r[k], str) or len(r[k].encode('utf-16-le', errors='surrogatepass')) // 2 > limit):
                    raise ValueError('Автор: до 99 символов; отзыв: до 5000 символов')
            if r.get('rating') and (not re.fullmatch(r'\d+(?:\.\d{1,2})?', r['rating'], re.ASCII) or not 1 <= float(r['rating']) <= 5):
                raise ValueError('Оценка: от 1 до 5')
            if r.get('date'):
                try:
                    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['date'], re.ASCII):
                        raise ValueError()
                    calendar_date.fromisoformat(r['date'])
                except ValueError:
                    raise ValueError('Дата отзыва: реальная дата YYYY-MM-DD') from None


def validate_commerce(data):
    """Allow incomplete drafts, never coerce blanks into free delivery or returns."""
    c = data.get('commerce')
    if c is None and 'commerce' not in data:
        return
    if not isinstance(c, dict) or set(c) - {'descriptions', 'shipping', 'returns', 'feedback'}:
        raise ValueError('Повреждены данные товаров Schema.org')
    if 'feedback' in c:
        validate_product_feedback(c['feedback'])
    descriptions = c.get('descriptions', {})
    if (not isinstance(descriptions, dict) or len(descriptions) > 1000 or
            any(k in ('__proto__', 'constructor', 'prototype') or not re.fullmatch(r'[-\w.]{1,100}', k, re.ASCII) or not isinstance(v, str) or len(v) > 5000 for k, v in descriptions.items())):
        raise ValueError('Описание товара: до 5000 символов, до 1000 артикулов')
    categories = {'MerchantReturnFiniteReturnWindow', 'MerchantReturnUnlimitedWindow', 'MerchantReturnNotPermitted'}
    methods = {'ReturnByMail', 'ReturnInStore', 'ReturnAtKiosk'}
    fees = {'FreeReturn', 'ReturnFeesCustomerResponsibility', 'ReturnShippingFees'}
    for kind in ('shipping', 'returns'):
        p = c.get(kind, {})
        keys = ({'enabled', 'country', 'rate', 'handlingMin', 'handlingMax', 'transitMin', 'transitMax'} if kind == 'shipping'
                else {'enabled', 'country', 'category', 'days', 'method', 'fees', 'amount'})
        if not isinstance(p, dict) or set(p) - keys or ('enabled' in p and type(p['enabled']) is not bool):
            raise ValueError('Повреждены условия доставки или возврата')
        for k, v in p.items():
            if k == 'enabled':
                continue
            if not isinstance(v, str) or len(v) > 100:
                raise ValueError('Неверное значение условия товара')
            if not v:
                continue
            if k in ('country', 'category', 'method', 'fees'):
                allowed = {'country': COMMERCE_COUNTRIES, 'category': categories, 'method': methods, 'fees': fees}[k]
                valid = v in allowed
            else:
                maximum = 3650 if k == 'days' else 10000000 if k in ('rate', 'amount') else 365
                valid = bool(re.fullmatch(r'\d+(?:\.\d{1,2})?', v, re.ASCII)) and float(v) <= maximum
                if valid and k not in ('rate', 'amount'):
                    valid = float(v).is_integer()
            if not valid:
                raise ValueError('Проверьте страну, сумму и сроки условий товара')
        for a, b in [('handlingMin', 'handlingMax'), ('transitMin', 'transitMax')]:
            if p.get(a) and p.get(b) and float(p[a]) > float(p[b]):
                raise ValueError('Минимальный срок больше максимального')


def validate_project(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('Неверный формат проекта')
    shared=data.get('globalStyles',{})
    types={'reviewCard','reviewText','reviewName','productCard','productName','productPrice','reviewPopup','popupText','button','heading','faq'}
    bounds={'fontSize':(8,96),'fontWeight':(100,900),'lineHeight':(.8,3),'paddingTop':(0,160),'paddingBottom':(0,160),'paddingLeft':(0,160),'paddingRight':(0,160),'borderWidth':(0,12),'borderRadius':(0,80),'maxWidth':(100,1800)}
    colors={'color','backgroundColor','borderColor'}
    if not isinstance(shared,dict) or set(shared)-types:raise ValueError('Неверные глобальные элементы')
    for variants in shared.values():
        if not isinstance(variants,dict) or set(variants)-{'desktop','phone'}:raise ValueError('Неверная версия глобального элемента')
        for values in variants.values():
            if not isinstance(values,dict) or set(values)-(set(bounds)|colors):raise ValueError('Неверные свойства глобального элемента')
            for key,value in values.items():
                if key in colors:
                    if not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):raise ValueError('Неверный цвет глобального элемента')
                elif type(value) not in (int,float) or not bounds[key][0]<=value<=bounds[key][1]:raise ValueError('Размер глобального элемента вне диапазона')
    validate_commerce(data)
    for key in ('texts', 'links', 'images', 'blocks'):
        if not isinstance(data.get(key), dict):
            raise ValueError('Повреждены настройки проекта')
    for key in ('catalog', 'collections', 'promos'):
        b = data['blocks'].get(key)
        if not isinstance(b, dict) or not isinstance(b.get('codes'), str) or not isinstance(b.get('resolved'), list) or not isinstance(b.get('photos'), dict):
            raise ValueError('Повреждён товарный блок')
    for key in ('reviews', 'news'):
        c = data.get(key)
        if not isinstance(c, dict) or c.get('mode') not in ('auto', 'selected'):
            raise ValueError('Повреждены настройки материалов')
        for field in ('selected', 'hidden', 'manual'):
            if not isinstance(c.get(field), list):
                raise ValueError('Повреждён список материалов')
        if not isinstance(c.get('overrides'), dict):
            raise ValueError('Повреждены настройки материалов')
    layout = data.get('layout', [])
    if not isinstance(layout, list) or len(layout) > 120:
        raise ValueError('Допускается до 120 блоков')
    ids = set()
    anchors = set()
    for item in layout:
        if (not isinstance(item, dict) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}', str(item.get('id', '')))
                or item['id'] in ids or not re.fullmatch(r'(?:s(?:[0-9]|10|11)|custom)', str(item.get('source', '')))
                or item.get('visibility', 'all') not in ('all', 'desktop', 'phone', 'hidden')):
            raise ValueError('Повреждена структура блоков')
        ids.add(item['id'])
        if not isinstance(item.get('name', ''), str) or len(item.get('name', '')) > 120:
            raise ValueError('Название секции: до 120 символов')
        anchor=item.get('anchor') or 'section-'+item['id']
        if not isinstance(anchor,str) or not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_-]{0,79}',anchor) or anchor in anchors:
            raise ValueError('Якоря секций должны быть уникальными')
        anchors.add(anchor)
        inline=item.get('inlineLinks',{})
        if not isinstance(inline,dict) or len(inline)>500:
            raise ValueError('Повреждены ссылки в тексте')
        for record in inline.values():
            if not isinstance(record,dict) or not isinstance(record.get('text'),str) or not isinstance(record.get('links'),list) or len(record['links'])>100:
                raise ValueError('Повреждены ссылки в тексте')
            for link in record['links']:
                if not isinstance(link,dict) or type(link.get('start')) is not int or type(link.get('end')) is not int or not 0 <= link['start'] < link['end'] or not isinstance(link.get('href'),str) or not re.fullmatch(r'(?:https?://[^\s]+|#[a-zA-Z][\w-]*)',link['href']):
                    raise ValueError('Некорректная ссылка в тексте')
        for field in ('spacing', 'spacingMobile'):
            spacing = item.get(field, {})
            if not isinstance(spacing, dict) or any(key not in ('top', 'bottom') or type(value) is not int or not 0 <= value <= 400 for key, value in spacing.items()):
                raise ValueError('Отступы блока: целое число от 0 до 400 px')
        if 'faqSettings' in item:
            settings = item['faqSettings']
            if (not isinstance(settings, dict) or set(settings) - {'initial', 'mode', 'heading'}
                    or settings.get('initial', 'closed') not in ('closed', 'first')
                    or settings.get('mode', 'multiple') not in ('multiple', 'single')
                    or settings.get('heading', 'left') not in ('left', 'right', 'top')):
                raise ValueError('Повреждены настройки раскрытия FAQ')
        if 'faq' in item:
            faq = item['faq']
            if not isinstance(faq, list) or len(faq) > 30:
                raise ValueError('Допускается до 30 вопросов в блоке')
            question_ids = set()
            for question in faq:
                if (not isinstance(question, dict)
                        or not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}', str(question.get('id', '')))
                        or question['id'] in question_ids
                        or any(not isinstance(question.get(k, ''), str) or len(question.get(k, '')) > limit
                               for k, limit in [('question', 500), ('answer', 10000), ('url', 2000), ('linkText', 300)])):
                    raise ValueError('Повреждены пункты спойлера')
                question_ids.add(question['id'])
    if not isinstance(data.get('title'), str) or not 1 <= len(data['title'].strip()) <= 200:
        raise ValueError('Укажите название страницы до 200 символов')
    if 'fileName' in data and (not isinstance(data['fileName'], str) or not 1 <= len(data['fileName'].strip()) <= 200 or re.search(r'[\\/:*?"<>|\x00-\x1f]', data['fileName'])):
        raise ValueError('Имя файла: от 1 до 200 символов, без \\ / : * ? " < > |')
    for item in [data, *layout]:
        if 'backgroundFolder' in item and not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}',str(item['backgroundFolder'])):
            raise ValueError('Повреждена папка фонов')
        for position_key in ('finderBackgroundPosition','heroBackgroundPosition','blockBackgroundPosition'):
            positions=item.get(position_key,{})
            if not isinstance(positions,dict) or set(positions)-{'desktop','phone'}:
                raise ValueError('Повреждена позиция фона')
            for position in positions.values():
                if not isinstance(position,dict) or set(position)-{'x','y','scale','rotation','flipX','flipY','opacity'}:
                    raise ValueError('Повреждена позиция фона')
                for key,value in position.items():
                    if key in ('flipX','flipY'):
                        if type(value) is not bool: raise ValueError('Неверное отражение фона')
                        continue
                    low,high=(0,100) if key=='opacity' else (30,300) if key=='scale' else (-180,180) if key=='rotation' else (-100,200)
                    if type(value) not in (int,float) or not low<=value<=high:
                        raise ValueError('Позиция фона вне допустимого диапазона')
        for paint_key in ('blockBackgroundPaint','heroBackgroundPaint','finderBackgroundPaint'):
            paints=item.get(paint_key,{})
            if not isinstance(paints,dict) or set(paints)-{'desktop','phone'}:raise ValueError('Неверная заливка фона')
            for paint in paints.values():
                if not isinstance(paint,dict) or set(paint)-{'mode','color','color2','angle'} or paint.get('mode','none') not in ('none','color','gradient'):raise ValueError('Неверная заливка фона')
                for key in ('color','color2'):
                    if key in paint and (not isinstance(paint[key],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',paint[key])):raise ValueError('Неверный цвет фона')
                if 'angle' in paint and (type(paint['angle']) not in (int,float) or not -180<=paint['angle']<=180):raise ValueError('Неверный угол градиента')
        styles=item.get('buttonStyles',{})
        if not isinstance(styles,dict) or len(styles)>500:
            raise ValueError('Повреждены настройки кнопок')
        for key,value in styles.items():
            if not isinstance(key,str) or not isinstance(value,dict) or set(value)-{'visibility','variant','background','color','borderColor','radius','fontSize','width','paddingX','paddingY','phoneWidth','phonePaddingX','phonePaddingY','icon'}:
                raise ValueError('Повреждён стиль кнопки')
            if value.get('icon','none') not in ('none','right','up-right','down-right'):
                raise ValueError('Неверная иконка кнопки')
            if value.get('visibility','visible') not in ('visible','hidden','deleted') or value.get('variant','') not in ('','primary','dark','outline'):
                raise ValueError('Неверный вид кнопки')
            for color in ('background','color','borderColor'):
                if color in value and (not isinstance(value[color],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value[color])):
                    raise ValueError('Неверный цвет кнопки')
            for prop,low,high in [('radius',0,40),('fontSize',12,32),('width',0,1200),('paddingX',0,100),('paddingY',0,100),('phoneWidth',0,1200),('phonePaddingX',0,100),('phonePaddingY',0,100)]:
                if prop in value and (type(value[prop]) is not int or not low<=value[prop]<=high):
                    raise ValueError('Неверный размер оформления кнопки')
        targets=item.get('linkTargets', {})
        if not isinstance(targets,dict) or len(targets)>500 or any(not isinstance(k,str) or type(v) is not bool for k,v in targets.items()):
            raise ValueError('Повреждены настройки открытия ссылок')
        if 'heroBackgroundFixed' in item and type(item['heroBackgroundFixed']) is not bool:
            raise ValueError('Повреждена настройка фиксированного фона')
        ribbon=item.get('heroRibbon',{})
        if not isinstance(ribbon,dict) or set(ribbon)-{'enabled','text','background','color'}:
            raise ValueError('Повреждены настройки плашки')
        if 'enabled' in ribbon and type(ribbon['enabled']) is not bool:
            raise ValueError('Повреждена видимость плашки')
        if 'text' in ribbon and (not isinstance(ribbon['text'],str) or len(ribbon['text'])>500):
            raise ValueError('Текст плашки: до 500 символов')
        for key in ('background','color'):
            if key in ribbon and (not isinstance(ribbon[key],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',ribbon[key])):
                raise ValueError('Неверный цвет плашки')
    validate_design(data)
    list(banner_values(data))


def install_site_builder(app, core):
    app.extensions['site_zip_library'] = lambda: asset('zip.js')
    catalog.CACHE = core.ARTICLES / '_site_catalog'
    catalog.CACHE.mkdir(parents=True, exist_ok=True)
    identifiers = json.loads(asset('finder-brands-seed.json'))
    catalog.FINDER_MANUFACTURERS.update({catalog.finder_brand_key(b['name']): str(b['id']) for b in identifiers['brands']})
    for name, seed in [('products.json', 'catalog-seed.json'), ('reviews-parsed.json', 'reviews-seed.json'), ('news-parsed.json', 'news-seed.json')]:
        if not (catalog.CACHE / name).exists():
            catalog.write_json(catalog.CACHE / name, json.loads(asset(seed)))
    catalog.bootstrap()
    database = core.ARTICLES / '_accounts' / 'site-projects.sqlite3'
    with connection(database) as db:
        db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS project_versions (project TEXT NOT NULL, owner TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, author TEXT NOT NULL, kind TEXT NOT NULL, restored_from INTEGER, PRIMARY KEY(project,revision))')
        db.execute('CREATE TABLE IF NOT EXISTS project_requests (owner TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(owner,request_id))')
        db.execute('CREATE TABLE IF NOT EXISTS project_archive (project TEXT PRIMARY KEY, owner TEXT NOT NULL, deleted TEXT NOT NULL)')
        db.execute("INSERT OR IGNORE INTO project_versions SELECT id,owner,revision,title,body,updated,'','migration',NULL FROM projects")
        db.execute('CREATE TABLE IF NOT EXISTS banners (filename TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL)')
        if 'folder' not in {row[1] for row in db.execute('PRAGMA table_info(banners)')}:
            db.execute("ALTER TABLE banners ADD COLUMN folder TEXT NOT NULL DEFAULT ''")
        db.execute('CREATE TABLE IF NOT EXISTS banner_settings (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS site_previews (project TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT UNIQUE NOT NULL, html TEXT NOT NULL, revision INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL)')
    def feedback_site_document(owner, uid):
        with connection(database) as db:
            row=db.execute('SELECT body FROM projects WHERE id=? AND owner=?',(uid,owner)).fetchone()
            shared=db.execute('SELECT token FROM site_previews WHERE project=? AND owner=?',(uid,owner)).fetchone()
        if not row:return None
        return dict(id=uid,title=json.loads(row[0]).get('title','Страница сайта'),brand='hasl',previewUrl='/editor-api/public-site-preview/'+shared[0]+'/' if shared else None)

    def feedback_site_preview(token):
        with connection(database) as db:
            row=db.execute('SELECT s.owner,s.project FROM site_previews s JOIN projects p ON p.id=s.project AND p.owner=s.owner WHERE s.token=?',(token,)).fetchone()
        return dict(owner=row[0],name='site::'+row[1],token=token) if row else None
    app.extensions['feedback_site_document']=feedback_site_document
    app.extensions['feedback_site_preview']=feedback_site_preview

    # Persistent data lives outside the deployable application; the requested folder suffix is retained.
    banner_folder = core.ARTICLES / 'images' / 'banners' / '_hasl'
    banner_folder.mkdir(parents=True, exist_ok=True)

    def banner_defaults(db):
        row = db.execute('SELECT body FROM banner_settings WHERE id=1').fetchone()
        return json.loads(row[0]) if row else {}

    def banner_path(db, filename):
        row=db.execute('SELECT folder FROM banners WHERE filename=?',(filename,)).fetchone()
        if not row:return None
        folder=row[0]
        if folder and not re.fullmatch(r'[a-f0-9]{24}/[a-zA-Z0-9_-]{1,70}',folder):return None
        return banner_folder / folder / filename

    def check_banners(db, data):
        for filename in banner_values(data):
            if not (path:=banner_path(db,filename)) or not path.is_file():
                raise ValueError('Фон удалён. Выберите другое изображение из библиотеки.')

    @app.get('/api/public-site-motion.js')
    def public_site_motion():
        return Response(asset('mobile-motion.js'), mimetype='text/javascript', headers={
            'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
        })

    @app.get('/api/public-site-statistics')
    def public_site_statistics():
        response = jsonify(catalog.statistics_snapshot())
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response

    @app.get('/api/public-site-banners/<filename>')
    def public_site_banner(filename):
        if not re.fullmatch(r'[a-f0-9]{32}\.(?:jpg|png|webp)', filename):
            return Response(status=404)
        with connection(database) as db:
            path=banner_path(db,filename)
        if not path or not path.is_file():return Response(status=404)
        response = send_file(path, conditional=True, max_age=3600)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def banner_item(row):
        item = dict(row)
        origin = request.host_url.rstrip('/')
        if request.host.split(':')[0] in ('news.outmax-office.ru', '213.139.209.107'):
            origin = 'https://news.outmax-office.ru'
        item['url'] = origin + '/editor-api/public-site-banners/' + item['filename']
        item['canDelete'] = bool(g.editor_user['admin'] or item['owner'] == g.editor_user['id'])
        item['folder']=item.get('folder','').split('/')[-1]
        item.pop('owner')
        return item

    @app.route('/api/site-builder/banners', methods=['GET', 'POST'])
    def banners():
        folder=request.args.get('folder','')
        if folder and not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}',folder):
            return jsonify(error='Неверная папка блока'),400
        folder=(hashlib.sha256(str(g.editor_user['id']).encode()).hexdigest()[:24]+'/'+folder) if folder else ''
        if request.method == 'GET':
            with connection(database) as db:
                db.row_factory = sqlite3.Row
                defaults = banner_defaults(db)
                shared = {url.rsplit('/', 1)[-1] for url in defaults.values() if url}
                rows = db.execute('SELECT * FROM banners ORDER BY created DESC').fetchall()
                items = [banner_item(row) for row in rows if (not folder or row['folder'] in ('',folder)) and (g.editor_user['admin'] or row['owner'] == g.editor_user['id'] or row['filename'] in shared)]
            return jsonify(items=items, defaults=defaults)
        try:
            from PIL import Image
            raw = request.get_data(cache=False)
            if not raw or len(raw) > 4_900_000:
                raise ValueError('Выберите JPG, PNG или WebP до 4,9 МБ')
            with Image.open(io.BytesIO(raw)) as im:
                extension = {'JPEG':'jpg', 'PNG':'png', 'WEBP':'webp'}.get(im.format)
                width, height = im.size
                if not extension or width * height > 24_000_000 or getattr(im, 'n_frames', 1) > 1:
                    raise ValueError('Нужна статичная картинка JPG, PNG или WebP до 24 мегапикселей')
                im.verify()
            with Image.open(io.BytesIO(raw)) as im:
                im.load()
            filename = uuid.uuid4().hex + '.' + extension
            name = re.split(r'[/\\]', request.args.get('name', 'Фон'))[-1][:180] or 'Фон'
            path = banner_folder / folder / filename
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(raw)
            try:
                with connection(database) as db:
                    db.execute('INSERT INTO banners(filename,owner,name,width,height,size,created,folder) VALUES(?,?,?,?,?,?,?,?)', (filename, g.editor_user['id'], name, width, height, len(raw), catalog.now(),folder))
                    db.row_factory = sqlite3.Row
                    result = banner_item(db.execute('SELECT * FROM banners WHERE filename=?', (filename,)).fetchone())
            except Exception:
                path.unlink(missing_ok=True)
                raise
            return jsonify(result), 201
        except (ValueError, OSError, SyntaxError, Image.DecompressionBombError):
            return jsonify(error='Не удалось прочитать картинку. Нужен статичный JPG, PNG или WebP до 4,9 МБ и 24 мегапикселей.'), 400

    @app.delete('/api/site-builder/banners/<filename>')
    def delete_banner(filename):
        with connection(database) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT owner FROM banners WHERE filename=?', (filename,)).fetchone()
            if not row or (not g.editor_user['admin'] and row[0] != g.editor_user['id']):
                return jsonify(error='Изображение не найдено'), 404
            used = filename in set(banner_values({'heroBackgrounds':banner_defaults(db)}))
            used = used or any(filename in set(banner_values(json.loads(row[0]))) for row in db.execute('SELECT body FROM projects'))
            used = used or any(filename in set(banner_values(json.loads(row[0]))) for row in db.execute('SELECT body FROM project_versions'))
            used = used or any(filename in set(banner_values({'layout':[json.loads(row[0])]})) for row in db.execute('SELECT body FROM sections'))
            if used:
                return jsonify(error='Фон используется в сохранённом проекте или эталоне. Сначала замените фон и сохраните изменения.'), 409
            try:
                path=banner_path(db,filename)
                if path:path.unlink(missing_ok=True)
            except OSError:
                return jsonify(error='Файл сейчас занят. Повторите удаление через несколько секунд.'), 409
            db.execute('DELETE FROM banners WHERE filename=?', (filename,))
        return jsonify(ok=True)

    @app.post('/api/site-builder/banner-defaults')
    def set_banner_defaults():
        if not g.editor_user['admin']:
            return jsonify(error='Фоны эталона меняет администратор'), 403
        value = request.get_json(silent=True)
        try:
            with connection(database) as db:
                db.execute('BEGIN IMMEDIATE')
                check_banners(db, {'heroBackgrounds':value})
                db.execute('INSERT OR REPLACE INTO banner_settings VALUES(1,?)', (json.dumps(value),))
            return jsonify(ok=True)
        except ValueError as e:
            return jsonify(error=str(e)), 400

    @app.before_request
    def site_gate():
        if not request.path.startswith(('/site-builder', '/api/site-builder')):
            return
        user = getattr(g, 'editor_user', None)
        if user is None or not (user['admin'] or user['role'] == 'moderator' or user['site_access']):
            if request.path.startswith('/api/'):
                return jsonify(error='Конструктор недоступен. Попросите администратора или модератора выдать доступ.'), 403
            return Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>Конструктор недоступен</h1><p>Доступ выдаёт администратор или модератор.</p><a href="/">Вернуться к статьям</a>', status=403, mimetype='text/html')
        if request.method not in ('GET', 'HEAD') and ((request.content_length is None and request.method != 'DELETE') or (request.content_length or 0) > 5_000_000):
            return jsonify(error='Размер проекта не должен превышать 5 МБ'), 413

    @app.get('/site-builder/')
    @app.get('/site-builder/hasl/')
    def site_index():
        return Response(asset('index.html'), mimetype='text/html')

    @app.get('/site-builder/outmax/')
    def site_outmax():
        return Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OUTMAX — конструктор сайтов</title><style>body{font:16px/1.6 Arial,sans-serif;background:#f5f6f8;color:#23272f;margin:0;padding:clamp(24px,8vw,100px)}main{max-width:650px}a{color:inherit;display:inline-block;padding:12px}</style><main><h1>Конструктор OUTMAX</h1><p>Пока в работе.</p><a href="/site-builder/hasl/">Открыть конструктор ХАСЛ</a><a href="/articles/">Редактор статей</a></main></html>', mimetype='text/html')

    @app.get('/site-builder/assets/<name>')
    def site_asset(name):
        allowed = {'global-styles.js':'text/javascript', 'feedback.js':'text/javascript', 'commerce.js':'text/javascript', 'app.js':'text/javascript', 'elements.js':'text/javascript', 'designer.js':'text/javascript', 'objects.js':'text/javascript', 'guides.js':'text/javascript', 'object-studio.js':'text/javascript', 'layers.js':'text/javascript', 'layout.js':'text/javascript', 'versions.js':'text/javascript', 'renderer.js':'text/javascript', 'builder.js':'text/javascript', 'runtime.js':'text/javascript', 'wordstat.js':'text/javascript', 'wordstat-seo.js':'text/javascript', 'wordstat-page.js':'text/javascript', 'style.css':'text/css', 'template.html':'text/html'}
        if name not in allowed:
            return jsonify(error='Не найдено'), 404
        return Response(asset(name), mimetype=allowed[name], headers={'Cache-Control':'no-cache'})

    @app.get('/api/site-builder/reference')
    def reference():
        data = json.loads(asset('reference.json'))
        with connection(database) as db:
            data['heroBackgrounds'] = banner_defaults(db)
        return jsonify(data)

    @app.route('/api/site-builder/sections', methods=['GET', 'POST'])
    @app.route('/api/site-builder/sections/<uid>', methods=['GET', 'DELETE'])
    def sections(uid=None):
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            if uid:
                row = db.execute('SELECT * FROM sections WHERE id=? AND owner=?', (uid, owner)).fetchone()
                if not row:
                    return jsonify(error='Секция не найдена в вашей библиотеке'), 404
                if request.method == 'DELETE':
                    db.execute('DELETE FROM sections WHERE id=? AND owner=?', (uid, owner))
                    return jsonify(ok=True)
                return jsonify(id=uid, name=row['name'], section=json.loads(row['body']))
            if request.method == 'GET':
                return jsonify([dict(row) for row in db.execute('SELECT id,name,updated FROM sections WHERE owner=? ORDER BY updated DESC', (owner,))])
            db.execute('BEGIN IMMEDIATE')
            data = request.get_json(silent=True)
            try:
                section = data.get('section') if isinstance(data, dict) else None
                project = json.loads(asset('reference.json'))
                project['layout'] = [section]
                project['heroBackgrounds'] = {}
                validate_project(project)
                check_banners(db, project)
            except ValueError as error:
                return jsonify(error=str(error)), 400
            if db.execute('SELECT count(*) FROM sections WHERE owner=?', (owner,)).fetchone()[0] >= 200:
                return jsonify(error='Допускается до 200 секций в библиотеке'), 400
            uid = uuid.uuid4().hex
            db.execute('INSERT INTO sections VALUES(?,?,?,?,?)', (uid, owner, section.get('name') or 'Секция', json.dumps(section, ensure_ascii=False), catalog.now()))
            return jsonify(id=uid), 201

    def replay_request(db, data):
        key = request.headers.get('X-Site-Request-Id', '')
        if not key:
            return '', '', None
        if not re.fullmatch(r'[A-Za-z0-9_-]{8,100}', key):
            return '', '', (jsonify(error='Некорректный идентификатор сохранения'), 400)
        digest = hashlib.sha256((request.path + '\n' + json.dumps(data, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
        row = db.execute('SELECT digest,response FROM project_requests WHERE owner=? AND request_id=?', (g.editor_user['id'], key)).fetchone()
        if row:
            if row[0] != digest:
                return key, digest, (jsonify(error='Идентификатор запроса уже использован для другого содержимого'), 409)
            return key, digest, jsonify(json.loads(row[1]))
        return key, digest, None

    def remember_request(db, key, digest, payload):
        if key:
            db.execute('INSERT INTO project_requests VALUES(?,?,?,?)', (g.editor_user['id'], key, digest, json.dumps(payload, ensure_ascii=False)))

    def record_version(db, uid, owner, revision, state, kind='save', restored_from=None):
        user = dict(g.editor_user)
        db.execute('INSERT INTO project_versions VALUES(?,?,?,?,?,?,?,?,?)', (uid, owner, revision, state['title'], json.dumps(state, ensure_ascii=False), catalog.now(), user.get('name') or user.get('login') or 'Пользователь', kind, restored_from))

    @app.route('/api/site-builder/projects', methods=['GET', 'POST'])
    def projects():
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            if request.method == 'GET':
                items=[]
                rows=db.execute('SELECT p.*, (SELECT MIN(created) FROM project_versions v WHERE v.project=p.id) AS created FROM projects p WHERE p.owner=? AND NOT EXISTS (SELECT 1 FROM project_archive a WHERE a.project=p.id) ORDER BY p.updated DESC', (owner,)).fetchall()
                for row in rows:
                    state=json.loads(row['body'])
                    import workspace
                    items.append(dict(thumbnail=workspace.site_cover(state, banner_defaults(db)),id=row['id'],title=row['title'],fileName=state.get('fileName',''),revision=row['revision'],updated=row['updated'],created=row['created'] or row['updated'],site=state.get('exportSite','both')))
                return jsonify(items)
            data = request.get_json(silent=True)
            try:
                db.execute('BEGIN IMMEDIATE')
                key, digest, replay = replay_request(db, data)
                if replay is not None:
                    return replay
                validate_project(data)
                check_banners(db, data)
            except ValueError as error:
                return jsonify(error=str(error)), 400
            uid = uuid.uuid4().hex
            db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?)', (uid, owner, 1, data['title'], json.dumps(data, ensure_ascii=False), catalog.now()))
            record_version(db, uid, owner, 1, data, 'create')
            payload = dict(id=uid, revision=1, state=data)
            remember_request(db, key, digest, payload)
            return jsonify(payload), 201

    @app.route('/api/site-builder/projects/<uid>', methods=['GET', 'POST', 'DELETE'])
    def project(uid):
        if request.method=='DELETE':
            payload=request.get_json(silent=True)
            try:return jsonify(app.extensions['data_cleanup'].site(g.editor_user['id'],uid,payload.get('revision') if isinstance(payload,dict) else None))
            except FileNotFoundError:return jsonify(error='Сайт не найден'),404
            except ValueError as error:return jsonify(error=str(error)),409
            except (OSError,sqlite3.Error):return jsonify(error='Удаление не завершено. Повторите действие.'),503
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            if request.method == 'POST':
                db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM projects WHERE id=? AND owner=? AND NOT EXISTS (SELECT 1 FROM project_archive WHERE project=projects.id)', (uid, g.editor_user['id'])).fetchone()
            if not row:
                return jsonify(error='Страница не найдена в вашем аккаунте'), 404
            if request.method == 'GET':
                return jsonify(id=uid, revision=row['revision'], state=json.loads(row['body']))
            data = request.get_json(silent=True)
            key, digest, replay = replay_request(db, data)
            if replay is not None:
                return replay
            try:
                if not isinstance(data, dict):
                    raise ValueError('Неверный запрос')
                if type(data.get('revision')) is not int or data['revision'] < 1:
                    raise ValueError('Укажите версию страницы')
                validate_project(data.get('state'))
                check_banners(db, data['state'])
            except ValueError as error:
                return jsonify(error=str(error)), 400
            state = data['state']
            result = db.execute('UPDATE projects SET body=?,title=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?', (json.dumps(state, ensure_ascii=False), state['title'], catalog.now(), uid, g.editor_user['id'], data.get('revision')))
            if result.rowcount != 1:
                return jsonify(error='Страница изменена в другой вкладке. Скачайте JSON или сохраните отдельную копию.', conflict=True), 409
            record_version(db, uid, g.editor_user['id'], row['revision']+1, state)
            payload = dict(id=uid, revision=row['revision']+1, saved=catalog.now())
            remember_request(db, key, digest, payload)
            return jsonify(payload)

    @app.post('/api/site-builder/projects/<uid>/copy')
    def copy_project(uid):
        owner=g.editor_user['id']
        with connection(database) as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT body FROM projects WHERE id=? AND owner=?',(uid,owner)).fetchone()
            if not row:return jsonify(error='Сайт не найден'),404
            state=json.loads(row[0]);state['fileName']=(state.get('fileName') or state['title'])[:100]+' — копия'
            validate_project(state);check_banners(db,state)
            new=uuid.uuid4().hex
            db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?)',(new,owner,1,state['title'],json.dumps(state,ensure_ascii=False),catalog.now()))
            record_version(db,new,owner,1,state,'create')
        return jsonify(id=new,revision=1),201

    @app.post('/api/site-builder/projects/<uid>/rename')
    def rename_project(uid):
        owner=g.editor_user['id']
        with connection(database) as db:
            db.row_factory=sqlite3.Row
            db.execute('BEGIN IMMEDIATE')
            data=request.get_json(silent=True)
            try:
                key,digest,replay=replay_request(db,data)
                if replay is not None:return replay
                row=db.execute('SELECT * FROM projects WHERE id=? AND owner=? AND NOT EXISTS (SELECT 1 FROM project_archive WHERE project=projects.id)',(uid,owner)).fetchone()
                if not row:return jsonify(error='Шаблон не найден в вашем аккаунте'),404
                if not isinstance(data,dict) or type(data.get('revision')) is not int or data['revision']!=row['revision']:
                    return jsonify(error='Шаблон изменился. Обновите архив и повторите переименование.'),409
                state=json.loads(row['body']);state['fileName']=data.get('fileName','').strip() if isinstance(data.get('fileName'),str) else None
                validate_project(state)
            except ValueError as error:return jsonify(error=str(error)),400
            version=row['revision']+1
            db.execute('UPDATE projects SET body=?,revision=?,updated=? WHERE id=? AND owner=?',(json.dumps(state,ensure_ascii=False),version,catalog.now(),uid,owner))
            record_version(db,uid,owner,version,state,'rename')
            payload=dict(id=uid,revision=version,fileName=state['fileName'])
            remember_request(db,key,digest,payload)
            return jsonify(payload)

    @app.post('/api/site-builder/projects/<uid>/archive')
    def archive_project(uid):
        owner=g.editor_user['id'];data=request.get_json(silent=True)
        with connection(database) as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT revision FROM projects WHERE id=? AND owner=?',(uid,owner)).fetchone()
            if not row:return jsonify(error='Шаблон не найден в вашем аккаунте'),404
            if not isinstance(data,dict) or type(data.get('revision')) is not int or data['revision']!=row[0] or type(data.get('restore')) is not bool:
                return jsonify(error='Шаблон изменился. Обновите архив и повторите действие.'),409
            if data['restore']:db.execute('DELETE FROM project_archive WHERE project=? AND owner=?',(uid,owner))
            else:db.execute('INSERT OR REPLACE INTO project_archive VALUES(?,?,?)',(uid,owner,catalog.now()))
            return jsonify(id=uid,archived=not data['restore'])

    @app.route('/api/site-builder/projects/<uid>/preview', methods=['POST', 'DELETE'])
    def site_preview_publish(uid):
        with connection(database) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision FROM projects WHERE id=? AND owner=?', (uid, g.editor_user['id'])).fetchone()
            if not row:
                return jsonify(error='Страница не найдена'), 404
            if request.method == 'DELETE':
                db.execute('DELETE FROM site_previews WHERE project=? AND owner=?', (uid, g.editor_user['id']))
                return jsonify(revoked=True)
            data = request.get_json(silent=True)
            if not isinstance(data, dict) or type(data.get('revision')) is not int or data['revision'] != row[0]:
                return jsonify(error='Страница изменилась. Сохраните её и обновите предпросмотр.'), 409
            html = data.get('html')
            if not isinstance(html, str) or not html.strip() or len(html.encode('utf-8')) > 4_500_000:
                return jsonify(error='Предпросмотр должен содержать HTML размером до 4,5 МБ'), 400
            existing = db.execute('SELECT token FROM site_previews WHERE project=?', (uid,)).fetchone()
            token = existing[0] if existing else uuid.uuid4().hex + uuid.uuid4().hex
            db.execute('INSERT OR REPLACE INTO site_previews VALUES(?,?,?,?,?)', (uid, g.editor_user['id'], token, html, row[0]))
            return jsonify(url='/editor-api/public-site-preview/' + token + '/')

    @app.get('/api/public-site-preview/<token>/')
    def site_preview_public(token):
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            return Response(status=404)
        with connection(database) as db:
            row = db.execute('SELECT html FROM site_previews WHERE token=?', (token,)).fetchone()
        if not row:
            return Response('Ссылка предпросмотра недоступна.', status=404, mimetype='text/plain')
        feedback_page=app.extensions['feedback_viewer_page']
        FRAME_JS=app.extensions['feedback_frame_script']
        if request.args.get('content') != '1':
            response=feedback_page('Предпросмотр сайта','Конструктор ХАСЛ',desktop_width=1440,include_wordstat=False)
            source=response.get_data(as_text=True).replace('ПК и телефон','Оба').replace('360 px','390 px')
            source=source.replace('</body>','<script>'+asset('feedback.js').split('/* PUBLIC_VIEWER */',1)[1]+'</script></body>')
            response.set_data(source)
            response.headers.update({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff'})
            return response
        # User HTML stays isolated; only the trusted annotation bridge talks to the viewer.
        doc=BeautifulSoup(row[0],'html.parser')
        script=doc.new_tag('script');script.string=FRAME_JS
        (doc.body or doc).append(script)
        return Response(str(doc), mimetype='text/html', headers={
            'Content-Security-Policy': "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src https: data: blob: 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'",
            'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
            'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff'})

    @app.get('/api/site-builder/projects/<uid>/versions')
    def project_versions(uid):
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            head = db.execute('SELECT revision FROM projects WHERE id=? AND owner=?', (uid, owner)).fetchone()
            if not head:
                return jsonify(error='Страница не найдена в вашем аккаунте'), 404
            before = request.args.get('before', '')
            if before and (not before.isdigit() or len(before) > 12):
                return jsonify(error='Неверная граница истории'), 400
            rows = db.execute('SELECT revision,title,created,author,kind,restored_from FROM project_versions WHERE project=? AND owner=? AND revision<? ORDER BY revision DESC LIMIT 51', (uid, owner, int(before) if before else head['revision']+1)).fetchall()
            return jsonify(revision=head['revision'], items=[dict(r) for r in rows[:50]], before=rows[49]['revision'] if len(rows) > 50 else None)

    @app.get('/api/site-builder/projects/<uid>/versions/<int:version>')
    def project_version(uid, version):
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            row = db.execute('SELECT v.*,p.revision AS current_revision FROM project_versions v JOIN projects p ON p.id=v.project AND p.owner=v.owner WHERE v.project=? AND v.owner=? AND v.revision=?', (uid, owner, version)).fetchone()
            if not row:
                return jsonify(error='Версия не найдена в вашем аккаунте'), 404
            return jsonify(revision=row['revision'], currentRevision=row['current_revision'], state=json.loads(row['body']), title=row['title'], created=row['created'], author=row['author'], kind=row['kind'], restoredFrom=row['restored_from'])

    @app.post('/api/site-builder/projects/<uid>/restore')
    def restore_project(uid):
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or type(data.get('revision')) is not int or type(data.get('version')) is not int:
            return jsonify(error='Укажите текущую и восстанавливаемую версии'), 400
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            db.execute('BEGIN IMMEDIATE')
            head = db.execute('SELECT * FROM projects WHERE id=? AND owner=?', (uid, owner)).fetchone()
            if not head:
                return jsonify(error='Страница не найдена в вашем аккаунте'), 404
            key, digest, replay = replay_request(db, data)
            if replay is not None:
                return replay
            if head['revision'] != data['revision']:
                return jsonify(error='Страница изменилась. Заново откройте историю версий.', conflict=True), 409
            row = db.execute('SELECT body FROM project_versions WHERE project=? AND owner=? AND revision=?', (uid, owner, data['version'])).fetchone()
            if not row:
                return jsonify(error='Версия не найдена'), 404
            state = json.loads(row['body'])
            try:
                validate_project(state)
                check_banners(db, state)
            except ValueError as error:
                return jsonify(error=str(error)), 400
            revision = head['revision']+1
            db.execute('UPDATE projects SET body=?,title=?,revision=?,updated=? WHERE id=? AND owner=? AND revision=?', (row['body'], state['title'], revision, catalog.now(), uid, owner, head['revision']))
            record_version(db, uid, owner, revision, state, 'restore', data['version'])
            payload = dict(id=uid, revision=revision, saved=catalog.now(), restoredFrom=data['version'], state=state)
            remember_request(db, key, digest, payload)
            return jsonify(payload)

    @app.get('/api/site-builder/content')
    def content():
        site = request.args.get('site', 'hasl')
        if site not in ('hasl', 'hasle'):
            return jsonify(error='Неизвестный магазин'), 400
        data = catalog.content(site)
        errors = []
        if request.args.get('load') == '1':
            with ThreadPoolExecutor(max_workers=2) as pool:
                pending = {k: pool.submit(catalog.refresh_one, k, site=site) for k in ('reviews', 'news') if not data[k].get('updated')}
                for kind, task in pending.items():
                    try: task.result()
                    except Exception: errors.append(kind)
            data = catalog.content(site)
        data['errors'] = errors
        with connection(database) as db:
            data['bannerDefaults'] = banner_defaults(db)
        return jsonify(data)

    @app.get('/api/site-builder/products')
    def products():
        codes = list(dict.fromkeys(filter(None, re.split(r'[,;\s]+', request.args.get('codes', '')))))
        if len(codes) > 250:
            return jsonify(error='Не больше 250 артикулов'), 400
        try:
            if catalog.catalog_loading():
                return jsonify(loading=True, message='Загружаем полный каталог ХАСЛ из all_yandex.xml…'), 202
        except ValueError as error:
            return jsonify(error=str(error)), 503
        found, missing = [], []
        with catalog.LOCK:
            for code in codes:
                item = catalog.PRODUCTS.get(catalog.ALIASES.get(code.lower(), code))
                if item:
                    found.append({**item, 'requested':code})
                else:
                    missing.append(code)
            return jsonify(products=found, missing=missing, total=len(catalog.PRODUCTS), finderBrands=catalog.finder_brands_snapshot())

    @app.get('/api/site-builder/product-feedback')
    def product_feedback():
        code = request.args.get('code', '')
        if not re.fullmatch(r'[-\w.]{1,100}', code, re.ASCII) or code in ('__proto__', 'constructor', 'prototype'):
            return jsonify(error='Укажите артикул товара из каталога ХАСЛ'), 400
        catalog.reload_catalog()
        with catalog.LOCK:
            item = catalog.PRODUCTS.get(catalog.ALIASES.get(code.lower(), code))
            item = dict(item) if item else None
        if not item:
            return jsonify(error='Артикул не найден. Обновите каталог и примените товарный список.'), 404
        try:
            result = site_feedback.load(item['code'], item, catalog.CACHE / 'product-feedback', force=request.args.get('refresh') == '1')
            feedback = {k: result[k] for k in ('aggregate', 'reviews', 'source')}
            validate_product_feedback({result['code']: feedback})
            return jsonify(code=result['code'], feedback=feedback)
        except ValueError as error:
            return jsonify(error=str(error)), 503
        except Exception:
            return jsonify(error='Отзывы ХАСЛ временно недоступны. Сохранённые отзывы и рейтинг оставлены.'), 503

    @app.post('/api/site-builder/sync')
    def sync():
        data = request.get_json(silent=True)
        kinds = data.get('kinds') if isinstance(data, dict) else None
        site = data.get('site', 'hasl') if isinstance(data, dict) else 'hasl'
        if site not in ('hasl', 'hasle'):
            return jsonify(error='Неизвестный магазин'), 400
        if not isinstance(kinds, list) or not kinds or any(k not in ('products','reviews','news') for k in kinds):
            return jsonify(error='Выберите источник'), 400
        if not catalog.SYNC_LOCK.acquire(blocking=False):
            return jsonify(error='Обновление уже выполняется. Попробуйте позже.'), 409
        try:
            results = {}
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {k:pool.submit(catalog.refresh_one,k,site=site) for k in set(kinds)}
                for kind, task in futures.items():
                    try:
                        results[kind] = task.result()
                    except Exception:
                        results[kind] = {'error':'Источник временно недоступен. Сохранённые данные оставлены.'}
            results['statistics'] = catalog.refresh_statistics()
            return jsonify(results=results, content=catalog.content(site))
        finally:
            catalog.SYNC_LOCK.release()
