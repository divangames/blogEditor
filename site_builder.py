"""Authenticated HASL constructor; private projects, immutable reference and CAS saves."""
import json
import re
import sqlite3
import uuid
from pathlib import Path
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from flask import Response, g, jsonify, request
import site_catalog as catalog

SITE_ASSETS = {}


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
    if name in ('wordstat.js', 'wordstat-seo.js'):
        return (Path(__file__).resolve().parent / ('editor-' + name)).read_text(encoding='utf-8')
    return (Path(__file__).resolve().parent / 'site-builder' / name).read_text(encoding='utf-8')


def validate_project(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('Неверный формат проекта')
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
                or item['id'] in ids or not re.fullmatch(r's(?:[0-9]|10)', str(item.get('source', '')))
                or item.get('visibility', 'all') not in ('all', 'desktop', 'phone', 'hidden')):
            raise ValueError('Повреждена структура блоков')
        ids.add(item['id'])
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


def install_site_builder(app, core):
    catalog.CACHE = core.ARTICLES / '_site_catalog'
    catalog.CACHE.mkdir(parents=True, exist_ok=True)
    for name, seed in [('products.json', 'catalog-seed.json'), ('reviews-parsed.json', 'reviews-seed.json'), ('news-parsed.json', 'news-seed.json')]:
        if not (catalog.CACHE / name).exists():
            catalog.write_json(catalog.CACHE / name, json.loads(asset(seed)))
    catalog.bootstrap()
    database = core.ARTICLES / '_accounts' / 'site-projects.sqlite3'
    with connection(database) as db:
        db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL)')

    @app.before_request
    def site_gate():
        if not request.path.startswith(('/site-builder', '/api/site-builder')):
            return
        user = getattr(g, 'editor_user', None)
        if user is None or not (user['admin'] or user['role'] == 'moderator' or user['site_access']):
            if request.path.startswith('/api/'):
                return jsonify(error='Конструктор недоступен. Попросите администратора или модератора выдать доступ.'), 403
            return Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>Конструктор недоступен</h1><p>Доступ выдаёт администратор или модератор.</p><a href="/">Вернуться к статьям</a>', status=403, mimetype='text/html')
        if request.method not in ('GET', 'HEAD') and (request.content_length is None or request.content_length > 5_000_000):
            return jsonify(error='Размер проекта не должен превышать 5 МБ'), 413

    @app.get('/site-builder/')
    @app.get('/site-builder/hasl/')
    def site_index():
        return Response(asset('index.html'), mimetype='text/html')

    @app.get('/site-builder/outmax/')
    def site_outmax():
        return Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OUTMAX — конструктор сайтов</title><style>body{font:16px/1.6 Arial,sans-serif;background:#f5f6f8;color:#23272f;margin:0;padding:clamp(24px,8vw,100px)}main{max-width:650px}a{color:inherit;display:inline-block;padding:12px}</style><main><h1>Конструктор OUTMAX</h1><p>Пока в работе.</p><a href="/site-builder/hasl/">Открыть конструктор ХАСЛ</a><a href="/">Редактор статей</a></main></html>', mimetype='text/html')

    @app.get('/site-builder/assets/<name>')
    def site_asset(name):
        allowed = {'app.js':'text/javascript', 'renderer.js':'text/javascript', 'builder.js':'text/javascript', 'runtime.js':'text/javascript', 'wordstat.js':'text/javascript', 'wordstat-seo.js':'text/javascript', 'wordstat-page.js':'text/javascript', 'style.css':'text/css', 'template.html':'text/html'}
        if name not in allowed:
            return jsonify(error='Не найдено'), 404
        return Response(asset(name), mimetype=allowed[name], headers={'Cache-Control':'no-cache'})

    @app.get('/api/site-builder/reference')
    def reference():
        return jsonify(json.loads(asset('reference.json')))

    @app.route('/api/site-builder/projects', methods=['GET', 'POST'])
    def projects():
        owner = g.editor_user['id']
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            if request.method == 'GET':
                return jsonify([dict(row) for row in db.execute('SELECT id,title,revision,updated FROM projects WHERE owner=? ORDER BY updated DESC', (owner,))])
            data = request.get_json(silent=True)
            try:
                validate_project(data)
            except ValueError as error:
                return jsonify(error=str(error)), 400
            uid = uuid.uuid4().hex
            db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?)', (uid, owner, 1, data['title'], json.dumps(data, ensure_ascii=False), catalog.now()))
            return jsonify(id=uid, revision=1, state=data), 201

    @app.route('/api/site-builder/projects/<uid>', methods=['GET', 'POST'])
    def project(uid):
        with connection(database) as db:
            db.row_factory = sqlite3.Row
            row = db.execute('SELECT * FROM projects WHERE id=? AND owner=?', (uid, g.editor_user['id'])).fetchone()
            if not row:
                return jsonify(error='Страница не найдена в вашем аккаунте'), 404
            if request.method == 'GET':
                return jsonify(id=uid, revision=row['revision'], state=json.loads(row['body']))
            data = request.get_json(silent=True)
            try:
                if not isinstance(data, dict):
                    raise ValueError('Неверный запрос')
                if type(data.get('revision')) is not int or data['revision'] < 1:
                    raise ValueError('Укажите версию страницы')
                validate_project(data.get('state'))
            except ValueError as error:
                return jsonify(error=str(error)), 400
            state = data['state']
            result = db.execute('UPDATE projects SET body=?,title=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?', (json.dumps(state, ensure_ascii=False), state['title'], catalog.now(), uid, g.editor_user['id'], data.get('revision')))
            if result.rowcount != 1:
                return jsonify(error='Страница изменена в другой вкладке. Скачайте JSON или сохраните отдельную копию.', conflict=True), 409
            return jsonify(id=uid, revision=row['revision']+1, saved=catalog.now())

    @app.get('/api/site-builder/content')
    def content():
        return jsonify(catalog.content())

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
            return jsonify(products=found, missing=missing, total=len(catalog.PRODUCTS))

    @app.post('/api/site-builder/sync')
    def sync():
        data = request.get_json(silent=True)
        kinds = data.get('kinds') if isinstance(data, dict) else None
        if not isinstance(kinds, list) or not kinds or any(k not in ('products','reviews','news') for k in kinds):
            return jsonify(error='Выберите источник'), 400
        if not catalog.SYNC_LOCK.acquire(blocking=False):
            return jsonify(error='Обновление уже выполняется. Попробуйте позже.'), 409
        try:
            results = {}
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {k:pool.submit(catalog.refresh_one,k) for k in set(kinds)}
                for kind, task in futures.items():
                    try:
                        results[kind] = task.result()
                    except Exception:
                        results[kind] = {'error':'Источник временно недоступен. Сохранённые данные оставлены.'}
            return jsonify(results=results, content=catalog.content())
        finally:
            catalog.SYNC_LOCK.release()
