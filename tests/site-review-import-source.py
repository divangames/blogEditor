"""Explicit, read-only live HASL sample for export/validator QA; never logs customer content."""
import argparse
import json
import sys
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import site_feedback

parser = argparse.ArgumentParser()
parser.add_argument('--code', default='25264')
parser.add_argument('--url', default='https://xn--80awro.xn--p1ai/krossovki/muzhskie/krossovki-reebok-zig-kinetica-edge-25264')
args = parser.parse_args()
path = site_feedback.product_path(args.url)
raw = site_feedback.download(path)
site_feedback.identity(raw, args.code, path)
doc = BeautifulSoup(raw, 'html.parser')
p = json.loads(doc.find('script', id='__NEXT_DATA__').string)['props']['pageProps']['product']
price = p.get('price') or {}
if price.get('currency') != 'RUB' or type(price.get('value')) not in (float, int):
    raise RuntimeError('Live sample has no confirmed RUB price')
old = p.get('oldPrice') or {}
product = {'code': args.code, 'name': p['name'], 'url': site_feedback.ORIGIN + path,
           'brand': (p.get('manufacturer') or {}).get('name', ''), 'price': price['value'] / 100,
           'oldprice': old.get('value', 0) / 100 if old.get('currency') == 'RUB' else 0,
           'photos': [x['url'] for x in p.get('images', []) if isinstance(x, dict) and isinstance(x.get('url'), str)],
           'videos': [], 'available': p.get('inStock'), 'params': {}}
description = site_feedback.clean_text(p.get('description'))
if 0 < len(description) <= 5000:
    product['description'] = description
folder = ROOT / 'release/hasl-review-import-audit-20261025'
folder.mkdir(parents=True, exist_ok=True)
data = site_feedback.load(args.code, product, folder / 'live-cache', force=True)
(folder / 'real-product.json').write_text(json.dumps(product, ensure_ascii=False, indent=2), encoding='utf-8')
(folder / 'real-import.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'code': args.code, 'aggregate': data['aggregate'], 'loaded': len(data['reviews']), 'total': data['source']['total'], 'source': data['source']['url']}, ensure_ascii=True))
