from pathlib import Path
import sys,json,hashlib,shutil
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import prepare_full_deploy as build
import deploy_vps
root=Path(__file__).resolve().parent.parent
release=root/'release/refresh-button-deploy-20261026'
assert not release.exists()
build.RELEASE=release
full,fullzip=build.build_python_hosting({'user':'wiki-demo','password':'wiki-local-demo-only'})
deploy_vps.PACKAGE_DIR=full
deploy_vps.PATCH_ARCHIVE=release/'manifest-vps.zip'
archive=deploy_vps.build_vps_patch()
from ops.deploy.loader import inspect_archive
files,mode=inspect_archive(archive)
assert mode=='manifest'
assert 'site-builder/renderer.js' in files and 'instructions/screens/site-figma-benefits-desktop.png' in files
assert 'deploy_settings.py' not in files
rollback=release/'rollback';rollback.mkdir()
previous=root/'release/shop-settings-deploy-20261026/manifest-vps.zip'
shutil.copy2(previous,rollback/'previous-accepted.zip')
state={'full':str(full),'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(files),'previous':str(rollback/'previous-accepted.zip')}
(root/'release/refresh-button-deploy-state.json').write_text(json.dumps(state,indent=2),encoding='utf-8')
print(json.dumps({'bytes':state['bytes'],'files':len(files),'mode':mode}))
