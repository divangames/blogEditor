"""Build isolated full/compatible schema validation artifacts; never uploads or prints credentials."""
import ast
import base64
import hashlib
import io
import json
import shutil
import sys
import tokenize
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
import prepare_full_deploy as build

release=ROOT/'release/site-commerce-qa-20261025'
if release.exists():
    raise RuntimeError('Use a fresh package directory; tested artifacts must not be overwritten')
build.RELEASE=release
full,_=build.build_python_hosting({'user':'wiki-demo','password':'wiki-local-demo-only'})
previous=ROOT/'release/site-quality-qa-20261025-fonts/site-quality-vps-bzip-compatible.zip'
rollback=ROOT/'release/site-commerce-rollback-20261025'
rollback.mkdir(exist_ok=False)
shutil.copy2(previous,rollback/'previous-accepted.zip')
with zipfile.ZipFile(previous) as old:
    entries={i.filename:old.read(i.filename) for i in old.infolist()}
code=(full/'wsgi_app.py').read_text(encoding='utf-8')
mail=(ROOT/'images/mail.png').read_bytes()
name=hashlib.sha256(mail).hexdigest()+'.png'
code=code.replace('EMAIL_BRAND_ASSET_DATA = {','EMAIL_BRAND_ASSET_DATA = {'+repr(name)+':'+repr(base64.b64encode(mail).decode('ascii'))+',',1)
tokens=[t for t in tokenize.generate_tokens(io.StringIO(code).readline) if t.type!=tokenize.COMMENT]
compact=tokenize.untokenize(tokens)
assert ast.dump(ast.parse(code))==ast.dump(ast.parse(compact))
entries['wsgi_app.py']=compact.encode('utf-8')
entries['tmp/restart.txt']=datetime.now(timezone.utc).isoformat(timespec='seconds').encode()
target=release/'outmax-editor-compatible'
target.mkdir()
for path,raw in entries.items():
    dest=target/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
archives={}
for label,method in [('deflate',zipfile.ZIP_DEFLATED),('bzip2',zipfile.ZIP_BZIP2)]:
    archive=release/('site-commerce-vps-'+label+'.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as output:
        for path,raw in entries.items():
            output.writestr(path,raw,compress_type=method if path=='wsgi_app.py' else zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(archive) as check:
        assert all(check.read(path)==raw for path,raw in entries.items())
    archives[label]={'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
# The restricted server uses unzip without LZMA support. Choose BZIP2 only when smaller.
archive=release/'site-commerce-vps-bzip-compatible.zip'
with zipfile.ZipFile(archive,'w') as output:
    for path,raw in entries.items():
        choices=[]
        for method in (zipfile.ZIP_DEFLATED,zipfile.ZIP_BZIP2):
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w',compression=method,compresslevel=9) as one:
                one.writestr(path,raw)
            choices.append((len(stream.getvalue()),method))
        output.writestr(path,raw,compress_type=min(choices)[1],compresslevel=9)
with zipfile.ZipFile(archive) as check:
    assert all(check.read(path)==raw for path,raw in entries.items())
archives['compatible']={'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
state={'full':str(full),'target':str(target),'rollback':str(rollback),'previousArchive':str(previous),'archives':archives}
(ROOT/'release/site-commerce-deploy-state.json').write_text(json.dumps(state,ensure_ascii=True,indent=2),encoding='utf-8')
print(json.dumps({'full':str(full),'target':str(target),'archives':{k:v['bytes'] for k,v in archives.items()}},ensure_ascii=True))
