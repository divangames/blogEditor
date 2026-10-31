"""Build a complete VPS ZIP without machine settings or mutable user data."""
import hashlib
import json
from pathlib import Path
import zipfile

from ops.deploy.loader import MANIFEST, MAX_ARCHIVE_BYTES, REQUIRED, DeploymentError, safe_name


def package_files(folder):
    files = []
    for source in sorted(folder.rglob('*')):
        relative = source.relative_to(folder).as_posix()
        try:
            safe_name(relative)
        except DeploymentError:
            continue  # generated hosting settings/data are never VPS payloads
        if source.is_symlink():
            raise ValueError('Symlinks are not deployment files')
        if source.is_file() and relative != MANIFEST:
            files.append(relative)
    return files


def write_archive(output, entries):
    for name in entries:
        safe_name(name)
    if MANIFEST in entries or not set(REQUIRED).issubset(entries):
        raise ValueError('Incomplete deployment package')
    manifest = {'version': 1, 'files': [
        {'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in sorted(entries.items())]}
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
        archive.writestr(MANIFEST, json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
    if Path(output).stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError('Deployment ZIP exceeds 50 MiB')
    return Path(output)
