"""Read-only HASL product testimonials. Identity, bounded responses and honest counts."""
import hashlib
import json
import math
import re
import time
import os
from datetime import datetime, timezone, date
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from bs4 import BeautifulSoup

ORIGIN = 'https://xn--80awro.xn--p1ai'
HOSTS = {'xn--80awro.xn--p1ai', 'www.xn--80awro.xn--p1ai', 'хасл.рф', 'www.хасл.рф', 'haslestore.com', 'www.haslestore.com'}
QUERY = '''query EditorProductReviews($productId: ID!, $page: Int) {
 TestimonialList(id: $productId, page: $page) {
  rating data { id name text rating createdAt: created_at product { url } }
  paginatorInfo { count currentPage total perPage lastPage }
 }
}'''


def product_path(url):
    if not isinstance(url, str) or len(url) > 2000 or re.search(r'[\x00-\x20\\]', url):
        raise ValueError('Некорректный адрес товара ХАСЛ')
    u = urlsplit(url)
    if (u.scheme != 'https' or u.hostname not in HOSTS or u.username or u.password or u.port not in (None, 443)
            or not u.path.startswith('/') or u.path.startswith('//') or any(p in ('.', '..') for p in u.path.split('/'))):
        raise ValueError('Разрешены только HTTPS-страницы товаров ХАСЛ')
    return u.path.rstrip('/')


class HaslRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        product_path(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(path, payload=None):
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    headers = {'User-Agent': 'HASL-Page-Editor/1.0', 'Accept': 'application/json' if body else 'text/html'}
    if body:
        headers['Content-Type'] = 'application/json'
    with build_opener(HaslRedirect()).open(Request(ORIGIN + path, data=body, headers=headers), timeout=18) as response:
        product_path(response.geturl())
        raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError('Ответ ХАСЛ слишком большой')
        return raw


def clean_text(value):
    if not isinstance(value, str):
        return ''
    doc = BeautifulSoup(value, 'html.parser')
    for n in doc.select('script,style,noscript'):
        n.decompose()
    return ' '.join(doc.get_text(' ').split())


def identity(raw, code, path):
    doc = BeautifulSoup(raw, 'html.parser')
    node = doc.find('script', id='__NEXT_DATA__')
    if node is None:
        raise ValueError('Формат страницы ХАСЛ изменился; прежние данные сохранены')
    props = json.loads(node.string or node.get_text())['props']['pageProps']
    p = props['product']
    if (not isinstance(p, dict) or str(p.get('sku')) != code or not re.fullmatch(r'[1-9][0-9]{0,17}', str(p.get('id', '')))
            or product_path(ORIGIN + p.get('href', '')) != path):
        raise ValueError('Страница ХАСЛ не соответствует выбранному артикулу')
    promo = props.get('_nextI18Next', {}).get('initialI18nStore', {}).get('ru', {}).get('product', {}).get('empty-testimonials', '')
    return str(p['id']), isinstance(promo, str) and bool(re.search('скидк', promo, re.I) and re.search('отзыв', promo, re.I))


def parse_response(response, code, path, product_id, incentive, fetched_at):
    if not isinstance(response, dict) or response.get('errors'):
        raise ValueError('API отзывов ХАСЛ вернул ошибку; прежние данные сохранены')
    data = (response.get('data') or {}).get('TestimonialList')
    if not isinstance(data, dict) or not isinstance(data.get('data'), list):
        raise ValueError('ХАСЛ изменил формат отзывов; прежние данные сохранены')
    rows, pages = data['data'], data.get('paginatorInfo')
    if (not isinstance(pages, dict) or any(type(pages.get(k)) is not int for k in ('count', 'currentPage', 'total', 'perPage', 'lastPage'))
            or pages['currentPage'] != 1 or not 1 <= pages['perPage'] <= 100 or not 1 <= pages['lastPage'] <= 10000000
            or not 0 <= pages['total'] <= 10000000 or pages['count'] != len(rows) or not len(rows) <= pages['perPage']
            or pages['total'] < len(rows) or bool(pages['total']) != bool(rows)):
        raise ValueError('Неполный ответ отзывов ХАСЛ; прежние данные сохранены')
    total, reviews, ids, skipped = pages['total'], [], set(), 0
    for row in rows:
        # A server ignoring the product filter must never donate its global rating.
        if not isinstance(row, dict) or product_path((row.get('product') or {}).get('url')) != path:
            raise ValueError('Отзыв ХАСЛ относится к другому товару; загрузка отменена')
        raw_id = str(row.get('id', ''))
        if not re.fullmatch(r'[0-9]{1,30}', raw_id) or raw_id in ids:
            raise ValueError('Неоднозначные идентификаторы отзывов ХАСЛ')
        ids.add(raw_id)
        author, body, rating = clean_text(row.get('name')), clean_text(row.get('text')), row.get('rating')
        if (not author or not body or len(author.encode('utf-16-le')) // 2 > 99 or len(body.encode('utf-16-le')) // 2 > 5000
                or type(rating) not in (int, float) or not math.isfinite(rating) or not 1 <= rating <= 5 or round(rating, 2) != rating):
            skipped += 1
            continue
        published = row.get('createdAt')
        day = ''
        if isinstance(published, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:[ T].*)?', published):
            try:
                day = date.fromisoformat(published[:10]).isoformat()
            except ValueError:
                pass
        if len(reviews) < 20:
            reviews.append({'id': 'hasl-' + raw_id, 'enabled': True, 'author': author, 'body': body, 'rating': format(rating, '.2f').rstrip('0').rstrip('.'), 'date': day})
    average = data.get('rating')
    aggregate = {}
    if total and type(average) in (int, float) and math.isfinite(average) and 1 <= average <= 5:
        # HASL renders overallRating.toFixed(1); the API publishes review total, not ratingCount.
        aggregate = {'enabled': True, 'value': format(average, '.1f').rstrip('0').rstrip('.'), 'ratingCount': '', 'reviewCount': str(total)}
    return {'code': code, 'aggregate': aggregate, 'reviews': reviews, 'source': {
        'provider': 'hasl', 'url': ORIGIN + path, 'productId': product_id, 'fetchedAt': fetched_at,
        'total': total, 'loaded': len(reviews), 'skipped': skipped, 'incentive': incentive, 'auto': False, 'edited': False}}


def load(code, product, cache_dir, force=False):
    if not isinstance(product, dict) or product.get('code') != code:
        raise ValueError('Артикул не найден в каталоге ХАСЛ')
    path = product_path(product.get('url'))
    folder = Path(cache_dir)
    folder.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256((code + '\n' + path).encode()).hexdigest()
    target, lease = folder / (key + '.json'), folder / (key + '.lock')
    if not force:
        try:
            cached = json.loads(target.read_text(encoding='utf-8'))
            age = time.time() - target.stat().st_mtime
            if 0 <= age < 300 and cached.get('code') == code and cached.get('source', {}).get('url') == ORIGIN + path:
                return cached
        except (OSError, ValueError):
            pass
    if lease.exists() and time.time() - lease.stat().st_mtime > 90:
        lease.unlink(missing_ok=True)
    try:
        descriptor = os.open(lease, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise ValueError('Отзывы этого товара уже загружаются. Повторите чуть позже.') from None
    os.close(descriptor)
    try:
        product_id, incentive = identity(download(path), code, path)
        response = json.loads(download('/graphql', {'query': QUERY, 'variables': {'productId': product_id, 'page': 1}}))
        result = parse_response(response, code, path, product_id, incentive, datetime.now(timezone.utc).isoformat(timespec='seconds'))
        temp = target.with_suffix('.tmp')
        try:
            temp.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)
        return result
    finally:
        lease.unlink(missing_ok=True)
