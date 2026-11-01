"""Upload exactly the frozen, checked package through the existing forced deploy command."""
from pathlib import Path
import hashlib
import json
import sys

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
import deploy_vps
from ops.deploy.loader import inspect_archive

state_path=ROOT/'release/home-account-publish-state.json'
state=json.loads(state_path.read_text(encoding='utf-8'))
for key in ('archive','legacyArchive','rollback'):
    item=state[key];p=Path(item['path'])
    assert p.stat().st_size==item['bytes']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256']
for folder_key,hash_key in [('full','fullHashes'),('compatible','compatibleHashes')]:
    for name,digest in state[hash_key].items():
        assert hashlib.sha256((Path(state[folder_key])/name).read_bytes()).hexdigest()==digest,name
files,mode=inspect_archive(Path(state['archive']['path']))
assert mode=='manifest' and len(files)==state['files']
print('PASS frozen full/compatible file hashes, archive checksums, rollback archive and manifest')
if '--upload' in sys.argv:
    result=deploy_vps.upload_archive(Path(state['archive']['path']))
    output=result.stdout.decode('utf-8','replace');errors=result.stderr.decode('utf-8','replace')
    state['deployment']={'returncode':result.returncode,'stdout':output,'stderr':errors}
    state_path.write_text(json.dumps(state,indent=2),encoding='utf-8')
    lines=[line for line in output.splitlines() if line.startswith('DEPLOY_OK')]
    if result.returncode or not lines:
        raise RuntimeError('Deployment did not confirm success; diagnostic output retained in local release state')
    print(lines[-1])
