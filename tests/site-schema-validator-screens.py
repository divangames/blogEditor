"""Preserve full external-validator screenshots and publish exact result-panel crops."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

root=Path(__file__).resolve().parent.parent
folder=Path(sys.argv[1]).resolve()
originals=folder/'screens-full'
originals.mkdir(exist_ok=True)
records=[]
for service in ['schema','google']:
    for suffix in ['html','zip','zip-second']:
        name=f'{service}-hasl-{suffix}.png'
        capture_name=f'{service}-hasl-{suffix}-20261025.png'
        target=root/'instructions/screens'/name
        original=originals/capture_name
        if not original.exists():
            original.write_bytes(target.read_bytes())
        with Image.open(original) as image:
            assert image.size==(1280,720),(name,image.size)
            # Crop only surrounding input/source code; never alter result pixels.
            box=(640,155,1280,365) if service=='schema' else (640,65,1280,720)
            image.crop(box).save(target,format='PNG',optimize=True)
        digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
        records.append({'image':name,'fullImage':capture_name,'fullSha256':digest(original),'cropSha256':digest(target),'box':box})
(folder/'screenshot-manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print('PASS six external-validator result crops; original full captures and pixel coordinates retained')
