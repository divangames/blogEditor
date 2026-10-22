"""Local HASL editor. Python 3.10+, standard library only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
import argparse
import html
import json
import os
import re
import threading
import time
import uuid
import xml.etree.ElementTree as ET

CACHE = None
ORIGIN = 'https://xn--80awro.xn--p1ai'
LOCK = threading.RLock()
SYNC_LOCK = threading.Lock()
PRODUCTS = {}
ALIASES = {}
CATALOG_FULL = False
CATALOG_STAMP = None


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback


def write_json(path, value):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def now():
    return datetime.now(timezone.utc).isoformat()


def fetch(path):
    with urlopen(Request(ORIGIN + path, headers={'User-Agent': 'HASL-Page-Editor/1.0'}), timeout=90) as response:
        return response.read()


def next_data(raw):
    match = re.search(r'<script\b[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', raw.decode('utf-8'), re.S)
    if not match:
        raise ValueError('Сайт изменил формат данных. Предыдущая версия сохранена.')
    return json.loads(match.group(1))['props']['pageProps']


def plain(value):
    return html.unescape(re.sub('<[^>]+>', '', str(value or ''))).strip()


def parse_content(kind, raw):
    props = next_data(raw)
    if kind == 'reviews':
        items = props['testimonialData']['TestimonialList']['data']
        result = [{'id': str(x['id']), 'name': x['name'], 'city': x.get('city', ''),
                   'text': plain(x['text']), 'rating': x.get('rating'),
                   'product': x.get('product') or {}, 'date': x.get('createdAt', ''),
                   'photos': [i['source'] for i in (x.get('images') or []) if i.get('source')]} for x in items]
    else:
        queries = props['initialState']['api']['queries'].values()
        items = next(q['data']['NewsList']['data'] for q in queries if q.get('endpointName') == 'getNewsList')
        result = [{'id': str(x['id']), 'title': plain(x['title']), 'url': ORIGIN + '/news/' + x['slug'],
                   'image': ((x.get('thumbnail') or {}).get('desktop') or {}).get('url', ''),
                   'text': plain(x.get('excerpt')), 'views': x.get('views'), 'date': x.get('publishedAt', '')} for x in items]
    if not result:
        raise ValueError('Источник вернул пустой список. Предыдущая версия сохранена.')
    return result


def parse_feed(path):
    products, aliases = {}, {}
    for _, offer in ET.iterparse(path, events=('end',)):
        if offer.tag != 'offer':
            continue
        code = offer.findtext('vendorCode') or offer.get('group_id') or offer.get('id')
        price = float(offer.findtext('price') or 0)
        available = offer.get('available') != 'false'
        params = {p.get('name', ''): p.text or '' for p in offer.findall('param')}
        if code not in products:
            products[code] = {'code': code, 'name': offer.findtext('name') or code,
                              'url': offer.findtext('url'), 'brand': offer.findtext('vendor') or '',
                              'model': offer.findtext('model') or '', 'price': price,
                              'oldprice': float(offer.findtext('oldprice') or 0),
                              'photos': [p.text for p in offer.findall('picture') if p.text],
                              'videos': list(dict.fromkeys(v.text.strip() for v in offer.findall('video') if v.text and urlparse(v.text.strip()).scheme in ('https', 'http'))),
                              'available': available, 'params': params}
        else:
            p = products[code]
            if available and (not p['available'] or price < p['price']):
                p['price'], p['oldprice'] = price, float(offer.findtext('oldprice') or 0)
            p['available'] = p['available'] or available
            p['videos'] = list(dict.fromkeys(p['videos'] + [v.text.strip() for v in offer.findall('video') if v.text and urlparse(v.text.strip()).scheme in ('https', 'http')]))
        for alias in [code, offer.get('id'), offer.get('group_id'), offer.findtext('barcode')]:
            if alias:
                aliases[alias.lower()] = code
        offer.clear()
    if not products:
        raise ValueError('В фиде не найдено товаров. Предыдущий каталог сохранён.')
    return {'products': products, 'aliases': aliases, 'updated': now(), 'full': True, 'media_version': 1, 'source': ORIGIN + '/feeds/all_yandex.xml'}


def load_products(data):
    global PRODUCTS, ALIASES, CATALOG_FULL
    with LOCK:
        PRODUCTS, ALIASES = data['products'], data['aliases']
        CATALOG_FULL = data.get('full') is True and data.get('media_version') == 1 and data.get('source') == ORIGIN + '/feeds/all_yandex.xml'


def reload_catalog():
    """Every worker observes the same atomically replaced complete catalog."""
    global CATALOG_STAMP
    path = CACHE / 'products.json'
    with LOCK:
        stamp = path.stat().st_mtime_ns if path.exists() else None
        if stamp != CATALOG_STAMP:
            data = read_json(path, None)
            if data:
                load_products(data)
                CATALOG_STAMP = stamp


def catalog_loading():
    reload_catalog()
    if CATALOG_FULL:
        return False
    failure = read_json(CACHE / 'catalog-error.json', {})
    if time.time() - failure.get('time', 0) < 30:
        raise ValueError('Полный каталог ХАСЛ временно недоступен. Повторите запрос через 30 секунд или нажмите «Обновить каталог».')
    # Exclusive file lease coordinates threads and separate WSGI workers.
    lease = CACHE / 'catalog-loading.lock'
    try:
        if lease.exists() and time.time() - lease.stat().st_mtime > 600:
            lease.unlink(missing_ok=True)
        descriptor = os.open(lease, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return True
    os.close(descriptor)
    def worker():
        try:
            refresh_one('products', leased=True)
        except Exception:
            write_json(CACHE / 'catalog-error.json', {'time': time.time()})
        finally:
            lease.unlink(missing_ok=True)
    threading.Thread(target=worker, name='hasl-full-catalog', daemon=True).start()
    return True


def refresh_one(kind, leased=False):
    if kind == 'products':
        lease = CACHE / 'catalog-loading.lock'
        if not leased:
            try:
                descriptor = os.open(lease, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(descriptor)
            except FileExistsError:
                return {'loading': True}
        temp = CACHE / ('feed-download-' + uuid.uuid4().hex + '.tmp')
        try:
            with urlopen(Request(ORIGIN + '/feeds/all_yandex.xml', headers={'User-Agent': 'HASL-Page-Editor/1.0'}), timeout=90) as response, temp.open('wb') as out:
                while chunk := response.read(1024 * 1024):
                    out.write(chunk)
            data = parse_feed(temp)
            with LOCK:
                write_json(CACHE / 'products.json', data)
                load_products(data)
                (CACHE / 'catalog-error.json').unlink(missing_ok=True)
            return {'updated': data['updated'], 'count': len(data['products'])}
        finally:
            temp.unlink(missing_ok=True)
            if not leased:
                lease.unlink(missing_ok=True)
    items = parse_content(kind, fetch('/testimonials' if kind == 'reviews' else '/news'))
    data = {'items': items, 'updated': now()}
    with LOCK:
        write_json(CACHE / (kind + '-parsed.json'), data)
    return {'updated': data['updated'], 'count': len(items)}


def content():
    with LOCK:
        return {k: read_json(CACHE / (k + '-parsed.json'), {'items': [], 'updated': None}) for k in ['reviews', 'news']}


def bootstrap():
    index = read_json(CACHE / 'products.json', None)
    if not index and (CACHE / 'feed.txt').exists():
        index = parse_feed(CACHE / 'feed.txt')
        write_json(CACHE / 'products.json', index)
    if index:
        load_products(index)
    for kind in ['reviews', 'news']:
        target = CACHE / (kind + '-parsed.json')
        raw = CACHE / (kind + '.txt')
        if not target.exists() and raw.exists():
            write_json(target, {'items': parse_content(kind, raw.read_bytes()), 'updated': now()})


