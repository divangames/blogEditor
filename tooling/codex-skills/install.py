"""Install the project skills snapshot, or fetch skills through skill-installer."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only inventory, no installation')
    parser.add_argument('--from-github', action='store_true', help='Use official skill-installer instead of bundled snapshot')
    parser.add_argument('--dest', type=Path, help='Override destination skills directory')
    args = parser.parse_args()
    folder = Path(__file__).resolve().parent
    codex_directory = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex')
    destination = (args.dest or codex_directory / 'skills').resolve()
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    skills = manifest['skills']
    for skill in skills:
        name = skill['name']
        if Path(name).name != name or name in ('.', '..'):
            raise ValueError('Invalid skill name')
        if not (folder / 'bundled' / name / 'SKILL.md').is_file():
            raise FileNotFoundError('Incomplete bundled skill: ' + name)
        target = destination / name
        if target.exists() and not (target / 'SKILL.md').is_file():
            raise RuntimeError('Incomplete existing installation; inspect manually: ' + str(target))
    missing = [s for s in skills if not (destination / s['name'] / 'SKILL.md').is_file()]
    for skill in skills:
        print(('MISSING' if skill in missing else 'INSTALLED') + ': ' + skill['name'])
    if args.check:
        print('Read-only check completed. Destination: ' + str(destination))
        return 0
    if args.from_github and missing:
        installer = codex_directory / 'skills/.system/skill-installer/scripts/install-skill-from-github.py'
        if not installer.is_file():
            raise FileNotFoundError('skill-installer not found: ' + str(installer))
        for repository in dict.fromkeys(s['repo'] for s in missing):
            paths = [s['path'] for s in missing if s['repo'] == repository]
            subprocess.run([sys.executable, str(installer), '--repo', repository,
                            '--path', *paths, '--dest', str(destination)], check=True)
    elif missing:
        destination.mkdir(parents=True, exist_ok=True)
        for skill in missing:
            # copytree rejects an existing target; never overwrite an installed skill.
            shutil.copytree(folder / 'bundled' / skill['name'], destination / skill['name'])
            print('Installed bundled snapshot: ' + skill['name'])
    if not all((destination / s['name'] / 'SKILL.md').is_file() for s in skills):
        raise RuntimeError('Installation verification failed')
    print('All six skills are installed. They are available to Codex on the next turn.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print('Error: ' + str(error), file=sys.stderr)
        sys.exit(1)
