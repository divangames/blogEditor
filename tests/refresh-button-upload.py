from pathlib import Path
import json,hashlib,sys
sys.path.insert(0,str(Path.cwd()))
import deploy_vps
p=Path('release/refresh-button-deploy-state.json');m=json.loads(p.read_text());a=Path(m['archive'])
assert a.stat().st_size==m['bytes']
assert hashlib.sha256(a.read_bytes()).hexdigest()==m['sha256']
assert Path(m['previous']).is_file()
print('PASS frozen archive hash, size, previous accepted rollback archive')
if '--upload' in sys.argv:
 r=deploy_vps.upload_archive(a)
 output=r.stdout.decode('utf-8','replace')
 assert r.returncode==0 and 'DEPLOY_OK' in output, (r.returncode,r.stderr.decode('utf-8','replace'),output)
 m['deployment']={'returncode':r.returncode,'stdout':output};p.write_text(json.dumps(m,indent=2),encoding='utf-8')
 print(output.strip())
