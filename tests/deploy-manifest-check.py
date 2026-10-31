"""Archive validation and transactional deployment against isolated directories."""
from pathlib import Path
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from deployment_package import package_files, write_archive
from ops.deploy.loader import Deployer, DeploymentError, MANIFEST, REQUIRED, inspect_archive


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = self.root / 'app'
        self.app.mkdir()
        self.backups = self.root / 'backups'
        self.entries = {name: b'x = 1\n' if name.endswith('.py') else b'demo\n' for name in REQUIRED}
        self.archive = self.root / 'update.zip'

    def tearDown(self):
        self.tmp.cleanup()

    def package(self):
        write_archive(self.archive, self.entries)
        return inspect_archive(self.archive)[0]

    def rewrite(self, change):
        self.package()
        with zipfile.ZipFile(self.archive) as z:
            values = [(i, z.read(i)) for i in z.infolist()]
        change(values)
        with zipfile.ZipFile(self.archive, 'w') as z:
            for info, data in values:
                z.writestr(info, data)

    def test_nested_files_install_and_data_preserved(self):
        self.entries.update({'new-section/deep/widget.js': b'new widget', 'instructions/new-guide.html': b'guide'})
        for name in ['articles/account/key', 'deploy_settings.py', '.venv/unchanged']:
            p = self.app / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'protected')
        calls = []
        backup = Deployer(self.app, self.backups, calls.append).install(self.package())
        self.assertEqual((self.app / 'new-section/deep/widget.js').read_bytes(), b'new widget')
        for name in ['articles/account/key', 'deploy_settings.py', '.venv/unchanged']:
            self.assertEqual((self.app / name).read_bytes(), b'protected')
        self.assertEqual(json.loads((backup / 'receipt.json').read_text())['status'], 'healthy')
        self.assertEqual(calls, [True])

    def test_health_failure_restores_and_removes_new_files(self):
        for name, data in self.entries.items():
            p = self.app / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        self.entries['index.html'] = b'changed'
        self.entries['new/nested/asset.svg'] = b'<svg/>'
        calls = []
        def activate(deps):
            calls.append(deps)
            if len(calls) == 1:
                raise RuntimeError('simulated failed health')
        with self.assertRaisesRegex(DeploymentError, 'rolled back'):
            Deployer(self.app, self.backups, activate).install(self.package())
        self.assertEqual((self.app / 'index.html').read_bytes(), b'demo\n')
        self.assertFalse((self.app / 'new').exists())
        self.assertEqual(calls, [False, False])

    def test_mid_copy_failure_rolls_back(self):
        (self.app / 'index.html').write_bytes(b'old')
        from ops.deploy import loader
        original = loader.atomic_write
        failed = False
        def write(target, *args, **kwargs):
            nonlocal failed
            if target == self.app / 'z/fail.txt' and not failed:
                failed = True
                raise OSError('simulated disk failure')
            return original(target, *args, **kwargs)
        files = {'index.html': b'new', 'z/fail.txt': b'new'}
        with patch.object(loader, 'atomic_write', side_effect=write):
            with self.assertRaises(DeploymentError):
                Deployer(self.app, self.backups, lambda _: None).install(files)
        self.assertEqual((self.app / 'index.html').read_bytes(), b'old')
        self.assertFalse((self.app / 'z').exists())

    def test_protected_paths(self):
        for name in ['articles/new.txt', '.venv/bin/python', 'deploy_settings.py', '.env',
                     'logs/private.txt', 'nested/key.pem', 'nested/__pycache__/a.pyc']:
            with self.subTest(name=name):
                self.entries[name] = b'secret'
                with self.assertRaises(DeploymentError):
                    self.package()
                del self.entries[name]

    def test_unsafe_names(self):
        for name in ['../escape', '/tmp/escape', 'x/../../escape', 'x\\y', 'C:/x', 'x//y', 'x/./y']:
            with self.subTest(name=name):
                self.entries[name] = b'bad'
                with self.assertRaises(DeploymentError):
                    self.package()
                del self.entries[name]

    def test_checksum_failure(self):
        def tamper(values):
            for i, (info, _) in enumerate(values):
                if info.filename == 'index.html':
                    values[i] = (info, b'changed')
        self.rewrite(tamper)
        with self.assertRaisesRegex(DeploymentError, 'checksum'):
            inspect_archive(self.archive)

    def test_server_rejects_protected_path_in_handcrafted_manifest(self):
        def tamper(values):
            for i, (info, data) in enumerate(values):
                if info.filename == MANIFEST:
                    from ops.deploy.loader import digest
                    manifest = json.loads(data)
                    manifest['files'].append({'path': 'deploy_settings.py', 'size': 3, 'sha256': digest(b'bad')})
                    values[i] = (info, json.dumps(manifest).encode())
            values.append(('deploy_settings.py', b'bad'))
        self.rewrite(tamper)
        with self.assertRaisesRegex(DeploymentError, 'Protected'):
            inspect_archive(self.archive)

    def test_expanded_size_and_count_limits(self):
        from ops.deploy import loader
        self.package()
        for name, value in [('MAX_EXPANDED_BYTES', 1), ('MAX_FILE_BYTES', 1), ('MAX_FILES', 1)]:
            with self.subTest(limit=name), patch.object(loader, name, value):
                with self.assertRaises(DeploymentError):
                    inspect_archive(self.archive)

    def test_extra_file_and_duplicates(self):
        for extra in ['unlisted.txt', 'index.html']:
            with self.subTest(extra=extra):
                self.rewrite(lambda values: values.append((extra, b'bad')))
                with self.assertRaises(DeploymentError):
                    inspect_archive(self.archive)

    def test_symlink_in_archive(self):
        def add(values):
            info = zipfile.ZipInfo('link')
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            values.append((info, b'/etc/passwd'))
        self.rewrite(add)
        with self.assertRaisesRegex(DeploymentError, 'Links'):
            inspect_archive(self.archive)

    def test_destination_symlink_and_collision(self):
        external = self.root / 'external'
        external.mkdir()
        try:
            (self.app / 'outside').symlink_to(external, target_is_directory=True)
        except OSError:
            self.skipTest('Symlink creation unavailable; also run this suite on Linux')
        with self.assertRaisesRegex(DeploymentError, 'Symlink'):
            Deployer(self.app, self.backups, lambda _: None).install({'outside/file': b'bad'})
        self.assertFalse((external / 'file').exists())

    def test_python_compile_before_install(self):
        self.entries['new/broken.py'] = b'def broken(\n'
        with self.assertRaises(SyntaxError):
            self.package()

    def test_file_directory_collision(self):
        self.entries.update({'nested': b'file', 'nested/child': b'child'})
        with self.assertRaisesRegex(DeploymentError, 'collision'):
            self.package()

    def test_legacy_ignores_extra_and_settings(self):
        with zipfile.ZipFile(self.archive, 'w') as z:
            for name, data in {**self.entries, 'deploy_settings.py': b'private', 'new.js': b'extra'}.items():
                z.writestr(name, data)
        files, mode = inspect_archive(self.archive)
        self.assertEqual(mode, 'legacy')
        self.assertEqual(set(files), set(REQUIRED))

    def test_builder_excludes_machine_and_data(self):
        for name in ['articles/secret', '.env', 'deploy_settings.py', 'README-RU.txt', 'site-builder/new.js']:
            p = self.app / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'demo')
        self.assertEqual(package_files(self.app), ['site-builder/new.js'])


if __name__ == '__main__':
    unittest.main()
