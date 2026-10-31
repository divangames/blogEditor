"""Manifest-driven VPS deployment. Runs as root through a forced SSH command."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 500 * 1024 * 1024
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_FILES = 10000
MANIFEST = 'deploy-manifest.json'
REQUIRED = ('app.py', 'wsgi_app.py', 'requirements.txt', 'requirements-server.txt',
            'index.html', 'editor-domains.js', 'editor.js', 'editor-library.js',
            'editor-tools.js', 'editor.css', 'outmax.css', 'OUTMAX.html', 'images/outmax.png')
PROTECTED = {'articles', 'uploads', 'logs', 'backups', 'deploy_settings.py',
             'readme-ru.txt', 'node_modules', '__pycache__'}


class DeploymentError(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name, protected=True):
    if not isinstance(name, str) or not name or len(name) > 512:
        raise DeploymentError('Invalid archive path')
    if '\\' in name or ':' in name or any(ord(c) < 32 for c in name):
        raise DeploymentError('Unsafe archive path')
    parts = name.split('/')
    if any(p in ('', '.', '..') for p in parts) or PurePosixPath(name).is_absolute():
        raise DeploymentError('Unsafe archive path')
    if protected and (any(p.startswith('.') or p.lower() in PROTECTED for p in parts)
                      or name.lower().endswith(('.sqlite', '.sqlite3', '.db', '.pem', '.key', '.pyc'))):
        raise DeploymentError('Protected deployment path')
    return name


def json_unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise DeploymentError('Duplicate manifest key')
        result[key] = value
    return result


def inspect_archive(path):
    if not 1000 <= path.stat().st_size <= MAX_ARCHIVE_BYTES:
        raise DeploymentError('Invalid package size')
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > MAX_EXPANDED_BYTES:
            raise DeploymentError('Expanded package limit exceeded')
        names = {}
        for info in infos:
            name = safe_name(info.filename.rstrip('/') if info.is_dir() else info.filename, False)
            if name in names:
                raise DeploymentError('Duplicate archive path')
            mode = info.external_attr >> 16
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR) or info.flag_bits & 1:
                raise DeploymentError('Links, special files and encrypted entries are not supported')
            if info.file_size > MAX_FILE_BYTES:
                raise DeploymentError('File size limit exceeded')
            names[name] = info
        modern = MANIFEST in names
        if modern:
            if names[MANIFEST].file_size > 4 * 1024 * 1024:
                raise DeploymentError('Manifest too large')
            manifest = json.loads(archive.read(MANIFEST), object_pairs_hook=json_unique)
            if manifest.get('version') != 1 or not isinstance(manifest.get('files'), list):
                raise DeploymentError('Unsupported manifest')
            records = {}
            for item in manifest['files']:
                name = safe_name(item['path'])
                if name == MANIFEST or name in records:
                    raise DeploymentError('Duplicate or reserved manifest path')
                if type(item.get('size')) is not int or not isinstance(item.get('sha256'), str):
                    raise DeploymentError('Invalid manifest record')
                records[name] = item
            actual = {n for n, i in names.items() if not i.is_dir()} - {MANIFEST}
            if actual != set(records):
                raise DeploymentError('Manifest does not match archive files')
            for n, i in names.items():
                if i.is_dir():
                    safe_name(n)
        else:
            # Old accepted archives remain usable for rollback. Never install their
            # settings or extra files: retain the exact previous 14-file contract.
            if archive.testzip() is not None:
                raise DeploymentError('Archive CRC mismatch')
            records = {name: None for name in REQUIRED}
        for name in REQUIRED:
            if name not in records or name not in names or names[name].is_dir():
                raise DeploymentError('Missing ' + name)
        files = {}
        for name, record in records.items():
            data = archive.read(name)  # verifies ZIP CRC too
            if record and (len(data) != record['size'] or digest(data) != record['sha256']):
                raise DeploymentError('Manifest checksum mismatch: ' + name)
            if name.endswith('.py'):
                compile(data, name, 'exec')
            files[name] = data
        for name in files:
            if any(str(p) in files for p in PurePosixPath(name).parents if str(p) != '.'):
                raise DeploymentError('File/directory collision')
        return files, 'manifest' if modern else 'legacy'


def destination(app, name):
    safe_name(name)
    target = app / name
    if app.is_symlink() or not app.is_dir():
        raise DeploymentError('Unsafe application directory')
    for parent in [target, *target.parents]:
        if parent == app:
            break
        if parent.is_symlink():
            raise DeploymentError('Symlink in destination path')
        if parent != target and parent.exists() and not parent.is_dir():
            raise DeploymentError('Destination parent is not a directory')
    if target.exists() and not target.is_file():
        raise DeploymentError('Destination is not a regular file')
    return target


def atomic_write(target, data, mode=0o644, uid=None, gid=None):
    fd, temporary = tempfile.mkstemp(prefix='.deploy-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        if uid is not None and hasattr(os, 'chown'):
            os.chown(temporary, uid, gid)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Deployer:
    def __init__(self, app, backups, activate):
        self.app, self.backups, self.activate = app, backups, activate

    def install(self, files):
        # Validate every target before making any changes or backups.
        for name in files:
            destination(self.app, name)
        self.backups.mkdir(parents=True, exist_ok=True)
        backup = self.backups / ('manifest-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
        backup.mkdir(mode=0o700)
        receipt = {'status': 'prepared', 'files': {}, 'createdDirectories': []}
        dependencies = False
        for name, data in files.items():
            target = destination(self.app, name)
            info = target.stat() if target.exists() else None
            receipt['files'][name] = {'existed': info is not None, 'mode': stat.S_IMODE(info.st_mode) if info else 0o644,
                                     'uid': info.st_uid if info else None, 'gid': info.st_gid if info else None,
                                     'sha256': digest(data)}
            if info:
                saved = backup / 'files' / name
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
            if name in ('requirements.txt', 'requirements-server.txt'):
                dependencies |= info is None or target.read_bytes() != data
        receipt['dependenciesChanged'] = dependencies
        def persist():
            atomic_write(backup / 'receipt.json', json.dumps(receipt, indent=2).encode(), 0o600)
        persist()
        written = []
        try:
            for name, data in files.items():
                target = destination(self.app, name)
                missing = []
                parent = target.parent
                while not parent.exists():
                    missing.append(parent)
                    parent = parent.parent
                for parent in reversed(missing):
                    parent.mkdir(mode=0o755)
                    receipt['createdDirectories'].append(parent.relative_to(self.app).as_posix())
                written.append(name)
                atomic_write(target, data)
            receipt['status'] = 'installed'
            persist()
            self.activate(dependencies)
            receipt['status'] = 'healthy'
            persist()
        except BaseException:
            for name in reversed(written):
                target = destination(self.app, name)
                item = receipt['files'][name]
                if item['existed']:
                    atomic_write(target, (backup / 'files' / name).read_bytes(), item['mode'], item['uid'], item['gid'])
                elif target.exists():
                    target.unlink()
            for name in reversed(receipt['createdDirectories']):
                try:
                    (self.app / name).rmdir()
                except OSError:
                    pass  # preserve anything concurrently created by the application
            receipt['status'] = 'rolled-back'
            persist()
            try:
                self.activate(dependencies)
            except Exception:
                raise DeploymentError('Code restored; service recovery requires administrator attention') from None
            raise DeploymentError('Update rolled back') from None
        return backup


def activate(app, dependencies):
    if dependencies:
        subprocess.run([str(app / '.venv/bin/pip'), 'install', '-q', '-r', str(app / 'requirements-server.txt')],
                       check=True, timeout=240, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['systemctl', 'restart', 'outmax-editor'], check=True, timeout=60,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    check = 'set -a; source /etc/outmax-editor.env; set +a; curl -fsS --max-time 10 -u "$OUTMAX_USER:$OUTMAX_PASSWORD" http://127.0.0.1:8765/ >/dev/null'
    for _ in range(6):
        time.sleep(2)
        if subprocess.run(['bash', '-c', check], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            return
    raise DeploymentError('Health check failed')


def main():
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', type=Path)
    args = parser.parse_args()
    app = Path('/opt/outmax-editor')
    with open('/run/lock/outmax-editor-deploy.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeploymentError('Another deployment is running') from None
        with tempfile.TemporaryDirectory(prefix='outmax-update-') as tmp:
            archive = args.check or Path(tmp) / 'update.zip'
            if not args.check:
                received = 0
                with archive.open('wb') as output:
                    while True:
                        chunk = sys.stdin.buffer.read(1024 * 1024)
                        if not chunk:
                            break
                        received += len(chunk)
                        if received > MAX_ARCHIVE_BYTES:
                            raise DeploymentError('Invalid package size')
                        output.write(chunk)
            files, mode = inspect_archive(archive)
            for name in files:
                destination(app, name)
            if args.check:
                print('CHECK_OK', mode, len(files))
                return
            backup = Deployer(app, Path('/opt/outmax-editor-backups'), lambda deps: activate(app, deps)).install(files)
            print('DEPLOY_OK', time.strftime('%Y-%m-%dT%H:%M:%S%z'), mode, len(files), 'backup=' + backup.name)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not emit package content, environment variables or dependency logs.
        message = str(error) if isinstance(error, DeploymentError) else type(error).__name__
        print('DEPLOY_ERROR ' + message, file=sys.stderr)
        sys.exit(1)
