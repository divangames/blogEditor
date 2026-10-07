"""Portable project/data backups with checksums and non-overwriting restoration."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import tempfile
import uuid
import zipfile

ROOT=Path(__file__).resolve().parent
DIRECTORIES=('articles','email','vendor','images','OUTMAX_files','docs','tests','tooling')
CONFIGS=('.env','.notisend.txt','notisend.txt','deploy_settings.py',
         'release/.outmax-deploy-credentials.json','release/notisend.txt')
MANIFEST='BACKUP_MANIFEST.json'


def digest(file):
    value=hashlib.sha256()
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()


def selected_files(project, include_materials=False):
    project=Path(project).resolve()
    files=set()
    for path in project.iterdir():
        if path.is_file() and (path.suffix.lower() in ('.py','.js','.css','.html','.bat','.cmd','.ps1','.md') or
                              path.name.startswith('requirements') and path.suffix=='.txt' or path.name=='.gitignore'):
            files.add(path)
    for name in DIRECTORIES+(('OUTMAX','ХАСЛ') if include_materials else ()):
        directory=project/name
        if directory.exists():files.update(path for path in directory.rglob('*') if path.is_file())
    for name in CONFIGS:
        path=project/name
        if path.is_file():files.add(path)
    for file in files:
        # Reject links/junctions instead of copying data outside the project.
        for component in (file,*file.parents):
            if component==project:break
            if component.is_symlink() or getattr(component,'is_junction',lambda:False)():
                raise ValueError('Ссылки и junction в копируемых данных не поддерживаются')
        if not file.resolve().is_relative_to(project):raise ValueError('Файл находится вне проекта')
    return sorted(file for file in files if '__pycache__' not in file.parts and file.suffix not in ('.pyc','.pyo') and not file.name.endswith('.tmp'))


def inventory(files):
    return {str(file):(file.stat().st_size,file.stat().st_mtime_ns) for file in files}


def sqlite_check(file):
    with closing(sqlite3.connect(Path(file).resolve().as_uri()+'?mode=ro',uri=True)) as connection:
        if connection.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Повреждена SQLite база')


def staged_directory(parent):
    return Path(tempfile.mkdtemp(prefix='.editor-backup-',dir=parent)).resolve()


def cleanup_stage(stage,parent):
    stage=stage.resolve();parent=Path(parent).resolve()
    if stage.parent!=parent or not stage.name.startswith('.editor-backup-'):
        raise ValueError('Недопустимый каталог временных данных')
    shutil.rmtree(stage)


def create_backup(project, output, include_materials=False):
    project=Path(project).resolve();output=Path(output).resolve()
    if output.exists():raise FileExistsError('Архив уже существует')
    output.parent.mkdir(parents=True,exist_ok=True)
    files=selected_files(project,include_materials);before=inventory(files)
    if not (project/'articles').is_dir():raise ValueError('Каталог articles не найден')
    if output in files:raise ValueError('Архив не может входить в исходные данные')
    stage=staged_directory(output.parent)
    try:
        entries=[]
        for source in files:
            if source.name.endswith(('-wal','-shm','-journal')):continue
            relative=source.relative_to(project).as_posix();target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True)
            with source.open('rb') as stream:signature=stream.read(16)
            database=source.suffix.lower() in ('.sqlite3','.sqlite') or signature==b'SQLite format 3\x00'
            if database:
                with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src,closing(sqlite3.connect(target)) as dst:
                    src.backup(dst)
                sqlite_check(target)
            else:shutil.copy2(source,target)
            entries.append({'path':relative,'size':target.stat().st_size,'sha256':digest(target),'sqlite':database})
        if inventory(selected_files(project,include_materials))!=before:
            raise RuntimeError('Данные изменились во время копирования. Остановите редактор и повторите.')
        manifest={'format':1,'createdAt':datetime.now(timezone.utc).isoformat(),'files':entries,
                  'scope':'runtime, articles, accounts, history, media, settings'+(', publication materials' if include_materials else ''),
                  'requiresStoppedEditor':True,'excluded':['.git','.deploy','node_modules','venv','other release files','browser IndexedDB','environment variables']}
        packed=stage/'archive.zip'
        with zipfile.ZipFile(packed,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            archive.writestr(MANIFEST,json.dumps(manifest,ensure_ascii=False,indent=2))
            for entry in entries:archive.write(stage/entry['path'],entry['path'])
        verify_backup(packed)
        # Never overwrite a competing backup created at the same destination.
        created=False
        try:
            with output.open('xb') as stream,packed.open('rb') as source:
                created=True;shutil.copyfileobj(source,stream);stream.flush();os.fsync(stream.fileno())
            verify_backup(output)
        except Exception:
            if created:output.unlink()
            raise
        return {'archive':str(output),'files':len(entries),'bytes':output.stat().st_size,'sha256':digest(output)}
    finally:cleanup_stage(stage,output.parent)


def safe_archive_path(name):
    path=PurePosixPath(name)
    if not name or path.as_posix()!=name or '\\' in name or ':' in name or path.is_absolute() or any(part in ('..','.') for part in name.split('/')):
        raise ValueError('Недопустимый путь в архиве')
    return path


def verify_backup(archive_path):
    archive_path=Path(archive_path).resolve()
    stage=staged_directory(archive_path.parent)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            names=archive.namelist()
            if len(names)!=len(set(names)):raise ValueError('Повторяющиеся пути в архиве')
            for name in names:safe_archive_path(name)
            if archive.getinfo(MANIFEST).file_size>16*1024*1024:raise ValueError('Слишком большой манифест')
            manifest=json.loads(archive.read(MANIFEST))
            if manifest.get('format')!=1:raise ValueError('Неизвестный формат копии')
            entries=manifest['files'];expected={entry['path'] for entry in entries}
            if len(expected)!=len(entries) or expected|{MANIFEST}!=set(names):raise ValueError('Состав архива не совпадает с манифестом')
            if sum(entry['size'] for entry in entries)>50*1024**3:raise ValueError('Копия превышает лимит 50 ГБ')
            for entry in entries:
                safe_archive_path(entry['path']);info=archive.getinfo(entry['path'])
                if info.file_size!=entry['size'] or (info.external_attr>>16)&0o170000==0o120000:
                    raise ValueError('Недопустимый размер или ссылка в архиве')
                hashed=hashlib.sha256()
                with archive.open(info) as stream:
                    for chunk in iter(lambda:stream.read(1024*1024),b''):hashed.update(chunk)
                if hashed.hexdigest()!=entry['sha256']:raise ValueError('Контрольная сумма не совпала')
                if entry.get('sqlite'):
                    target=stage/entry['path'];target.parent.mkdir(parents=True,exist_ok=True)
                    with archive.open(info) as source,target.open('xb') as destination:shutil.copyfileobj(source,destination)
                    sqlite_check(target)
            return {'files':len(entries),'createdAt':manifest['createdAt'],'verified':True}
    finally:cleanup_stage(stage,archive_path.parent)


def restore_backup(archive_path, destination):
    destination=Path(destination).resolve()
    if destination.exists():raise FileExistsError('Восстановление разрешено только в новую папку')
    verify_backup(archive_path)
    destination.parent.mkdir(parents=True,exist_ok=True);stage=staged_directory(destination.parent)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            manifest=json.loads(archive.read(MANIFEST))
            for entry in manifest['files']:
                relative=safe_archive_path(entry['path']);target=stage/str(relative)
                if not target.resolve().is_relative_to(stage):raise ValueError('Путь вне каталога восстановления')
                target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(entry['path']) as source,target.open('xb') as stream:shutil.copyfileobj(source,stream)
                if digest(target)!=entry['sha256']:raise ValueError('Контрольная сумма восстановленного файла не совпала')
        if stage.parent!=destination.parent or destination.exists():raise FileExistsError('Каталог восстановления уже существует')
        os.rename(stage,destination)
        return {'destination':str(destination),'files':len(manifest['files']),'restored':True}
    finally:
        if stage.exists():cleanup_stage(stage,destination.parent)


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    create=sub.add_parser('create');create.add_argument('--project',type=Path,default=ROOT);create.add_argument('--output',type=Path)
    create.add_argument('--stopped',action='store_true',help='Confirm all editor processes writing this project are stopped')
    create.add_argument('--include-materials',action='store_true')
    verify=sub.add_parser('verify');verify.add_argument('archive',type=Path)
    restore=sub.add_parser('restore');restore.add_argument('archive',type=Path);restore.add_argument('--destination',type=Path,required=True)
    args=parser.parse_args()
    if args.command=='create':
        if not args.stopped:parser.error('Остановите редактор и добавьте --stopped')
        output=args.output or args.project/'backups'/('editor-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]+'.zip')
        result=create_backup(args.project,output,args.include_materials)
    elif args.command=='verify':result=verify_backup(args.archive)
    else:result=restore_backup(args.archive,args.destination)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,zipfile.BadZipFile,KeyError,sqlite3.Error) as error:
        raise SystemExit('Backup failed: '+str(error))
