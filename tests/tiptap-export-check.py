"""Compare the actual Python RU/COM exporter before/after the prototype.

External downloads are disabled; this verifies delta/parity, not completeness
of remote product media or the browser's adminBody transformation.
"""
import io
import json
import hashlib
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app

OUT = ROOT/('release/tiptap-prototype/results-block' if '--block' in sys.argv else 'release/tiptap-prototype/results')
report = json.loads((OUT/'report.json').read_text(encoding='utf-8'))
results = []
for item in report['results']:
    brand = item['brand'].split('-')[0]
    if brand not in ('outmax', 'hasl'):
        continue
    source = ROOT/item['source']
    if source.suffix == '.json':
        record = json.loads(source.read_text(encoding='utf-8'))
        folder = source.parent/(source.stem+'_files')
    else:
        record = {'title': 'Проверка сохранности', 'body': source.read_text(encoding='utf-8'), 'products': []}
        folder = source.parent
    candidate = dict(record, body=(OUT/(item['brand']+'-export.html')).read_text(encoding='utf-8'))
    archives = []
    # Never make exporter network requests during an isolated preservation test.
    with patch.object(app, 'download_external_image', side_effect=ValueError('Offline experiment')):
        for label, payload in [('original', record), ('prototype', candidate)]:
            data = app.export_archive('tiptap-check', payload, folder, ['ru','com'], local_images=True, brand=brand)
            archive = zipfile.ZipFile(io.BytesIO(data))
            archives.append(archive)
            for name in archive.namelist():
                if name.endswith('.html'):
                    (OUT/f"{item['brand']}-{label}-{name}").write_bytes(archive.read(name))
            (OUT/f"{item['brand']}-{label}.zip").write_bytes(data)
    def media(archive):
        return {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist() if name.startswith('image/')}
    assert set(archives[0].namelist()) == set(archives[1].namelist()), 'Archive entries changed'
    assert media(archives[0]) == media(archives[1]), 'Local asset bytes changed'
    results.append({'case': item['brand'], 'archiveEntriesRetained': True, 'localAssetsRetained': len(media(archives[0])), 'mediaHashesEqual': True, 'domains': ['ru','com']})
(OUT/'export-report.json').write_text(json.dumps({'results':results,'remoteDownloadsDisabled':True,'browserAdminBodyCovered':False,'migrationAllowed':False},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
