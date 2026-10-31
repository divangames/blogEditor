"""Upload exactly the checked compatible archive; never rebuilds packages."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root))
from deploy_vps import MAX_DEPLOY_ARCHIVE_BYTES
meta_path=root/'release/site-quality-deploy-state.json'
meta=json.loads(meta_path.read_text(encoding='utf-8'))
item=meta['archives']['compatible']
archive=Path(item['archive'])
assert archive.stat().st_size==item['bytes']<=MAX_DEPLOY_ARCHIVE_BYTES
assert hashlib.sha256(archive.read_bytes()).hexdigest()==item['sha256']
with zipfile.ZipFile(archive) as new,zipfile.ZipFile(meta['previousArchive']) as old:
    assert set(new.namelist())==set(old.namelist())
    assert sorted(name for name in new.namelist() if new.read(name)!=old.read(name))==['tmp/restart.txt','wsgi_app.py']
    for info in new.infolist():
        assert info.compress_type in (zipfile.ZIP_DEFLATED,zipfile.ZIP_BZIP2)
        assert new.read(info.filename)==(Path(meta['target'])/info.filename).read_bytes()
if '--upload' not in sys.argv:
    print('PASS frozen archive, previous static/email bytes preserved, only WSGI/restart changed, size cap and SHA256')
else:
    import deploy_vps
    result=deploy_vps.upload_archive(archive)
    output=result.stdout.decode('utf-8','replace') if isinstance(result.stdout,bytes) else result.stdout
    assert result.returncode==0,(result.stderr.decode('utf-8','replace') if isinstance(result.stderr,bytes) else result.stderr)
    assert 'DEPLOY_OK' in output,output
    meta['deployment']={'returncode':result.returncode,'stdout':output}
    meta_path.write_text(json.dumps(meta,ensure_ascii=True,indent=2),encoding='utf-8')
    print(output.strip())
