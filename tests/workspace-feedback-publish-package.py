"""Freeze complete and legacy-compatible packages without machine credentials/data."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import zipfile

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
import prepare_full_deploy as build
import deploy_vps
from ops.deploy.loader import REQUIRED,inspect_archive
from deployment_package import package_files

release=ROOT/'release/workspace-feedback-menu-publish-20261101'
if release.exists():
    raise RuntimeError('Use a new directory; do not overwrite tested packages')
previous_state=json.loads((ROOT/'release/card-actions-publish-state.json').read_text(encoding='utf-8'))
previous=ROOT/'release/card-actions-publish-polish-20261101/manifest-vps.zip'
assert hashlib.sha256(previous.read_bytes()).hexdigest()==previous_state['archive']['sha256']
assert 'DEPLOY_OK' in previous_state['deployment']['stdout']
build.RELEASE=release
full,_=build.build_python_hosting({'user':'wiki-demo','password':'wiki-local-demo-only'})
rollback=release/'rollback';rollback.mkdir()
shutil.copy2(previous,rollback/'previous-accepted.zip')
deploy_vps.PACKAGE_DIR=full
deploy_vps.PATCH_ARCHIVE=release/'manifest-vps.zip'
archive=deploy_vps.build_vps_patch()
files,mode=inspect_archive(archive)
assert mode=='manifest' and 'site-builder/mobile-motion.js' in files
for name in ('instructions/screens/account-menu-articles-desktop.png','instructions/screens/account-menu-email-desktop.png','instructions/screens/account-menu-site-desktop.png','instructions/screens/site-project-actions.png','instructions/screens/site-project-actions-phone.png','instructions/screens/workspace-delete-progress-desktop.png','instructions/screens/workspace-delete-progress-phone.png','instructions/screens/workspace-delete-done-desktop.png','instructions/screens/workspace-delete-done-phone.png','instructions/screens/instructions-home-desktop.png','instructions/screens/instructions-home-phone.png','instructions/screens/developers-home-desktop.png','instructions/screens/developers-home-phone.png','instructions/screens/workspace-tool-hover.png','instructions/screens/home-avatar-desktop.png','instructions/screens/home-avatar-phone.png','instructions/screens/archive-actions-desktop.png','instructions/screens/archive-actions-phone.png','instructions/screens/avatar-crop-desktop.png','instructions/screens/avatar-crop-phone.png','instructions/screens/user-directory-desktop.png','instructions/screens/user-directory-phone.png','instructions/screens/site-archive-banners.png','instructions/screens/site-archive-banners-phone.png','instructions/screens/workspace-actions-desktop.png','instructions/screens/workspace-actions-phone.png','instructions/screens/workspace-actions-wide.png','instructions/screens/workspace-card-hover.png','instructions/screens/workspace-delete-confirm.png','instructions/screens/user-delete-confirm.png','workspace.py','instructions/screens/site-template-profile.png','instructions/screens/site-profile-menu-phone.png','instructions/screens/workspace-recent-named.png','instructions/screens/workspace-phosphor-home.png','instructions/screens/workspace-phosphor-menu.png','instructions/screens/workspace-phosphor-menu-phone.png','instructions/screens/workspace-banners-wide.png','instructions/screens/workspace-resume-banners.png','instructions/screens/workspace-banners-desktop.png','instructions/screens/workspace-banners-phone.png','instructions/screens/workspace-home-desktop.png','instructions/screens/workspace-home-phone.png','instructions/screens/workspace-tool-start.png','instructions/screens/article-export-server.png','instructions/screens/article-phosphor-tools.png','site-builder/finder-brands-seed.json','instructions/screens/site-finder-search-phone.png','instructions/screens/site-finder-google-html.png','instructions/screens/site-finder-schema-zip.png'):
    assert name in files
assert 'deploy_settings.py' not in files
compatible=release/'outmax-editor-compatible';compatible.mkdir()
compat_archive=release/'legacy-compatible.zip'
with zipfile.ZipFile(compat_archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in REQUIRED:
        raw=(full/name).read_bytes();target=compatible/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);z.writestr(name,raw)
legacy_files,legacy_mode=inspect_archive(compat_archive)
assert legacy_mode=='legacy' and set(legacy_files)==set(REQUIRED)
assert not (compatible/'site-builder').exists() and not (compatible/'instructions').exists()
def descriptor(path):
    return {'path':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
state={'full':str(full),'compatible':str(compatible),'archive':descriptor(archive),'legacyArchive':descriptor(compat_archive),
       'rollback':descriptor(rollback/'previous-accepted.zip'),'files':len(files),
       'fullHashes':{name:hashlib.sha256((full/name).read_bytes()).hexdigest() for name in package_files(full)},
       'compatibleHashes':{name:hashlib.sha256((compatible/name).read_bytes()).hexdigest() for name in REQUIRED}}
(ROOT/'release/workspace-feedback-publish-state.json').write_text(json.dumps(state,indent=2),encoding='utf-8')
print(json.dumps({'files':len(files),'archiveBytes':state['archive']['bytes'],'legacyBytes':state['legacyArchive']['bytes'],'rollbackVerified':True}))
