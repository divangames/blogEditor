"""Build an allowlisted, self-contained Tiptap preview bundle for the VPS."""
import io
import subprocess
import zipfile
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PACKS = {'outmax':ROOT/'OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1',
         'hasl':ROOT/'ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4'}

def build_bundle():
    subprocess.run(['node', str(HERE/'build-source.cjs')], cwd=ROOT, check=True, capture_output=True)
    files = {'index.html':(HERE/'index.html').read_bytes(), 'prototype.css':(HERE/'prototype.css').read_bytes(),
             'app.js':(ROOT/'release/tiptap-prototype/app.js').read_bytes(),
             'outmax.css':(ROOT/'outmax.css').read_bytes(), 'hasl.css':(ROOT/'hasl.css').read_bytes(),
             'fixtures/blocks.html':(HERE/'fixture.html').read_bytes(), 'fixtures/controls.html':(HERE/'controls.html').read_bytes()}
    html=files['index.html'].decode('utf-8')
    html=html.replace('href="/','href="/tiptap/').replace('src="/','src="/tiptap/')
    # The return link deliberately points to the existing production editor.
    html=html.replace('id="production-link" href="/tiptap/"','id="production-link" href="/"')
    html=html.replace('id="instructions-link" href="/tiptap/instructions/"', 'id="instructions-link" href="/instructions/"')
    files['index.html']=html.encode('utf-8')
    for brand,folder in PACKS.items():
        source=(folder/'article-body.html').read_bytes();files[f'fixtures/{brand}.html']=source
        soup=BeautifulSoup(source,'html.parser')
        references=[]
        for node in soup.select('img[src],source[srcset]'):
            if node.get('src'):references.append(node['src'])
            if node.get('srcset'):references.extend(item.strip().split()[0] for item in node['srcset'].split(',') if item.strip())
        for reference in references:
            parsed=urlsplit(reference)
            if parsed.scheme or parsed.netloc or parsed.path.startswith('/'):continue
            asset=(folder/unquote(parsed.path)).resolve()
            if not asset.is_relative_to((folder/'assets').resolve()) or not asset.is_file():continue
            if asset.suffix.lower() not in {'.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2'}:continue
            files[f'media/{brand}/{asset.relative_to(folder.resolve()).as_posix()}']=asset.read_bytes()
    # The SSH deployer has a strict package-size limit. Publish binary media
    # separately, in verified immutable chunks; preserve original pixel bytes.
    media={name:body for name,body in files.items() if name.startswith('media/')}
    manifest={name:{'sha256':hashlib.sha256(body).hexdigest(),'size':len(body),'chunks':[hashlib.sha256(body[i:i+262144]).hexdigest() for i in range(0,len(body),262144)]} for name,body in media.items()}
    for name in media:del files[name]
    files['media-manifest.json']=json.dumps(manifest,ensure_ascii=False).encode('utf-8')
    media_out=ROOT/'release/tiptap-prototype/media.zip'
    with zipfile.ZipFile(media_out,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,body in media.items():archive.writestr(name,body)
    memory=io.BytesIO()
    with zipfile.ZipFile(memory,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,body in sorted(files.items()):archive.writestr(name,body)
    data=memory.getvalue();out=ROOT/'release/tiptap-prototype/server.zip';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
    return data

if __name__=='__main__':
    data=build_bundle();print(f'Tiptap server bundle: {len(data)} bytes')
