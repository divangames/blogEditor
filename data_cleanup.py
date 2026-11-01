"""Owner-scoped deletion with reference checks and recoverable file staging.

Application writers and exporters share an OS lock across WSGI processes. The
SQLite commit is the decision point: an interrupted job is either restored or
purged on the next write. Public immutable media is removed only when no live
document, historical snapshot, reusable block or publication still references it.
"""
import hashlib
import itertools
from contextlib import closing
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
import uuid
from urllib.parse import unquote

from flask import g, jsonify, request

RASTER = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
MEDIA = re.compile(r'[a-f0-9]{64}\.(?:png|jpg|jpeg|gif|webp)')


def file_digest(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()


def referenced(text,relative):
    return re.search(r'(?<![A-Za-z0-9_.-])'+re.escape(relative)+r'(?![A-Za-z0-9_.-])',text) is not None


class CleanupBusy(ValueError):
    pass


class DataCleanup:
    def __init__(self, core, db):
        self.root = core.ARTICLES.resolve()
        self.db = db
        self.jobs = self.root / '_accounts' / 'deletion-jobs'
        self.jobs.mkdir(exist_ok=True)
        with db() as con:
            con.executescript('''CREATE TABLE IF NOT EXISTS deleted_accounts(id TEXT PRIMARY KEY);
              CREATE TABLE IF NOT EXISTS deletion_commits(id TEXT PRIMARY KEY);
              CREATE TABLE IF NOT EXISTS published_media(owner TEXT,document TEXT,kind TEXT,filename TEXT,
                PRIMARY KEY(owner,document,kind,filename));''')

    def path(self, path):
        path = Path(path).absolute()
        if path == self.root or not path.is_relative_to(self.root):
            raise ValueError('Недопустимый путь удаления')
        for part in (path, *path.parents):
            if part == self.root:break
            if part.is_symlink() or getattr(part,'is_junction',lambda:False)():raise ValueError('Символьные ссылки и junction не удаляются автоматически')
        if not path.resolve().is_relative_to(self.root):raise ValueError('Недопустимый путь удаления')
        return path

    def lock(self):
        stream = (self.root / '_accounts' / 'data-write.lock').open('a+b')
        stream.seek(0);stream.write(b'0');stream.flush();stream.seek(0)
        end=time.monotonic()+30
        while True:
            try:
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                return stream
            except (OSError,BlockingIOError):
                if time.monotonic()>=end:
                    stream.close();raise CleanupBusy('Хранилище занято. Повторите действие через несколько секунд.')
                time.sleep(.05)

    @staticmethod
    def unlock(stream):
        if os.name=='nt':
            import msvcrt
            stream.seek(0);msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(),fcntl.LOCK_UN)
        stream.close()

    def recover(self):
        for job in self.jobs.iterdir():
            self.path(job)
            if not re.fullmatch(r'[a-f0-9]{32}',job.name) or not job.is_dir():continue
            manifest=job/'plan.json'
            if not manifest.exists():
                job.rmdir();continue
            plan=json.loads(manifest.read_text(encoding='utf-8'))
            with self.db() as con:committed=con.execute('SELECT 1 FROM deletion_commits WHERE id=?',(job.name,)).fetchone()
            if not committed:
                for index,relative in reversed(list(enumerate(plan))):
                    source=job/str(index);target=self.path(self.root/relative)
                    if source.exists():
                        if target.exists():raise ValueError('Не удалось восстановить прерванное удаление')
                        target.parent.mkdir(parents=True,exist_ok=True);os.replace(source,target)
            shutil.rmtree(job)
            if committed:
                for relative in plan:
                    parent=self.path(self.root/relative).parent
                    while parent.is_relative_to(self.root/'users') and len(parent.relative_to(self.root).parts)>2:
                        if not parent.exists() or any(parent.iterdir()):break
                        parent.rmdir();parent=parent.parent
            with self.db() as con:con.execute('DELETE FROM deletion_commits WHERE id=?',(job.name,))

    def tree_files(self, path):
        path=self.path(path)
        if not path.exists():return []
        if path.is_file():return [path]
        result=[]
        for item in path.rglob('*'):
            self.path(item)
            if item.is_file():result.append(item)
        return result

    def references(self, excluded, owner=None, document=None, site_project=None, local=False, needles=None):
        """Fail closed on unreadable metadata; never infer ownership from a slug."""
        texts=[];found=set()
        wanted=None if needles is None else set(needles)
        def collect(text):
            text=unquote(text.replace('\\/','/'))
            if wanted is None:texts.append(text)
            else:found.update(value for value in wanted if value in text)
        def collect_many(values):
            for value in values:collect(value)
        def skipped(p):return any(p==x or p.is_relative_to(x) for x in excluded)
        files=itertools.chain(self.root.glob('*.json'),self.root.glob('*.html'))
        users=self.root/'users'
        if users.exists():files=itertools.chain(files,users.rglob('*'))
        for p in files:
            self.path(p)
            if local and not p.is_relative_to(self.root/'users'/owner):continue
            if skipped(p) or not p.is_file():continue
            if p.suffix in ('.json','.html'):
                text=p.read_text(encoding='utf-8')
                if p.suffix=='.json':json.loads(text)
                collect(text)
            elif p.suffix.lower() in RASTER:
                collect(file_digest(p)+p.suffix.lower().replace('.jpeg','.jpg'))
            elif p.name=='_shared_blocks.sqlite3':
                with closing(sqlite3.connect(p)) as con:collect_many(r[0] for r in con.execute('SELECT record FROM blocks'))
        with self.db() as con:
            for row in con.execute('SELECT owner,document,filename FROM published_media'):
                if row[0]==owner and (document is None or row[1]==document):continue
                collect(row[2])
        site=self.root/'_accounts'/'site-projects.sqlite3'
        if site.exists():
            with closing(sqlite3.connect(site)) as con:
                for table,column in [('projects','body'),('project_versions','body'),('sections','body'),('site_previews','html')]:
                    identity='id' if table in ('projects','sections') else 'project'
                    for item in con.execute('SELECT owner,'+identity+','+column+' FROM '+table):
                        if local and item[0]!=owner:continue
                        if item[0]==owner and (document is None or (site_project and table!='sections' and item[1]==site_project)):continue
                        collect(item[2])
                collect_many(r[0] for r in con.execute('SELECT body FROM banner_settings'))
                collect_many(r[0] for r in con.execute("SELECT filename FROM banners WHERE owner NOT IN (?,'_shared')",(owner or '',)))
        return '\n'.join(texts if wanted is None else sorted(found)).replace('\\/','/')

    def media_candidates(self, paths, owner, document=None):
        result=set()
        for path in paths:
            for p in self.tree_files(path):
                if p.suffix.lower() in RASTER:
                    result.add(file_digest(p)+p.suffix.lower().replace('.jpeg','.jpg'))
                elif p.suffix in ('.json','.html'):
                    result.update(MEDIA.findall(p.read_text(encoding='utf-8')))
        with self.db() as con:
            query='SELECT filename FROM published_media WHERE owner=?';args=[owner]
            if document is not None:query+=' AND document=?';args.append(document)
            result.update(r[0] for r in con.execute(query,args))
        return result

    def public_files(self, candidates, refs):
        return [self.root/folder/name for folder in ('_article_public_images','_email_public_images')
                for name in candidates if MEDIA.fullmatch(name) and name not in refs and (self.root/folder/name).is_file()]

    def execute(self, paths, metadata):
        paths=sorted(set(self.path(p) for p in paths if Path(p).exists()),key=lambda p:len(p.parts))
        paths=[p for p in paths if not any(p!=x and p.is_relative_to(x) for x in paths)]
        for p in paths:self.tree_files(p)  # reject symlinks before changing anything
        job=self.jobs/uuid.uuid4().hex;job.mkdir()
        plan=[p.relative_to(self.root).as_posix() for p in paths]
        (job/'plan.json').write_text(json.dumps(plan),encoding='utf-8')
        committed=False
        try:
            with self.db() as con:
                con.execute('BEGIN IMMEDIATE')
                metadata(con)
                for i,p in enumerate(paths):os.replace(p,job/str(i))
                con.execute('INSERT INTO deletion_commits VALUES(?)',(job.name,))
            committed=True
        finally:
            # Recovery reads the durable transaction marker, including a crash
            # immediately after SQLite commit and before this Python assignment.
            self.recover()
        return {'ok':committed,'removedEntries':len(paths)}

    @staticmethod
    def feedback(con, owner, name=None):
        where='owner=?'+(' AND name=?' if name is not None else '');args=[owner]+([name] if name is not None else [])
        con.execute('DELETE FROM feedback_replies WHERE thread IN (SELECT id FROM feedback_threads WHERE '+where+')',args)
        con.execute('DELETE FROM feedback_threads WHERE '+where,args)
        con.execute('DELETE FROM previews WHERE '+where,args)

    def article(self, owner, stored):
        from article_storage import read_document
        base=self.path(self.root/'users'/owner);draft=self.path(base/(stored+'.json'))
        record=read_document(draft)
        if not record:raise FileNotFoundError()
        history_id=record['documentId']
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',history_id):raise ValueError('Некорректная история статьи')
        excluded=[draft,draft.with_suffix('.html'),base/(stored+'_files'),base/'_article_history'/history_id]
        # Shared document IDs from legacy copies must not donate their history.
        for other in base.glob('*.json'):
            if other!=draft and (read_document(other) or {}).get('documentId')==history_id:
                excluded.pop();break
        candidates=self.media_candidates(excluded,owner,stored)
        refs=self.references(excluded,owner,stored,needles=candidates)
        local_refs=self.references(excluded,owner,stored,local=True)
        paths=excluded[:2]
        for folder in excluded[2:]:
            files=self.tree_files(folder)
            if all(not referenced(local_refs,p.relative_to(base).as_posix()) for p in files):paths.append(folder)
            else:paths.extend(p for p in files if not referenced(local_refs,p.relative_to(base).as_posix()))
        # Older imports can share a private photo by its original material URL.
        # The last consumer removes that photo even if its first article is gone.
        source_text='\n'.join(p.read_text(encoding='utf-8') for folder in excluded for p in self.tree_files(folder) if p.suffix in ('.json','.html'))
        for relative in re.findall(r'(?:[A-Za-z0-9_-]+_files|_tiptap_assets|_article_history/[A-Za-z0-9_-]+/assets)/[^\s"<>?\\]+',source_text):
            relative=unquote(relative)
            if not referenced(local_refs,relative):
                candidate=self.path(base/relative)
                if candidate.is_file() and candidate.suffix.lower() in RASTER:paths.append(candidate)
        # Tiptap uses content-addressed files shared between this owner's articles.
        for p in (base/'_tiptap_assets').glob('*'):
            if p.name in str(record) and not referenced(local_refs,p.relative_to(base).as_posix()):paths.append(p)
        paths+=self.public_files(candidates,refs)
        def metadata(con):
            self.feedback(con,owner,stored)
            con.execute('DELETE FROM published_media WHERE owner=? AND document=?',(owner,stored))
            journal=base/'_article_saves.sqlite3'
            if journal.exists():
                con.execute('ATTACH DATABASE ? AS saves_db',(str(journal),))
                if con.execute("SELECT 1 FROM saves_db.sqlite_master WHERE name='saves'").fetchone():
                    con.execute('DELETE FROM saves_db.saves WHERE name=?',(draft.name,))
        return self.execute(paths,metadata)

    def email(self,owner,name):
        from article_storage import read_document
        base=self.path(self.root/'users'/owner/'_email_projects');file=self.path(base/(name+'.json'))
        record=read_document(file)
        if not record:raise FileNotFoundError()
        history=record['documentId']
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',history):raise ValueError('Некорректная история письма')
        excluded=[file,file.with_suffix('.html'),base/(name+'_files'),base/'_email_history'/history]
        candidates=self.media_candidates(excluded,owner,'email::'+name)
        refs=self.references(excluded,owner,'email::'+name,needles=candidates) if candidates else ''
        paths=excluded+self.public_files(candidates,refs)
        def metadata(con):
            self.feedback(con,owner,'email::'+name)
            con.execute('DELETE FROM published_media WHERE owner=? AND document=?',(owner,'email::'+name))
            journal=base/'_article_saves.sqlite3'
            if journal.exists():
                con.execute('ATTACH DATABASE ? AS saves_db',(str(journal),))
                if con.execute("SELECT 1 FROM saves_db.sqlite_master WHERE name='saves'").fetchone():con.execute('DELETE FROM saves_db.saves WHERE name=?',(file.name,))
        return self.execute(paths,metadata)

    def user(self, owner):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',owner):raise ValueError('Некорректный пользователь')
        folder=self.path(self.root/'users'/owner)
        excluded=[folder];candidates=self.media_candidates(excluded,owner)
        paths=[folder]
        paths+=list((self.root/'_accounts'/'avatars').glob(owner+'-*.png'))
        site=self.root/'_accounts'/'site-projects.sqlite3';banners=[]
        if site.exists():
            with closing(sqlite3.connect(site)) as con:banners=con.execute('SELECT filename,folder FROM banners WHERE owner=?',(owner,)).fetchall()
        refs=self.references(excluded,owner,needles=candidates|{row[0] for row in banners})
        paths+=self.public_files(candidates,refs)
        removable=[]
        for name,subfolder in banners:
            if name in refs:continue
            if not re.fullmatch(r'[A-Za-z0-9_.-]+',name) or (subfolder and not re.fullmatch(r'[a-f0-9]{24}/[a-zA-Z0-9_-]{1,70}',subfolder)):
                raise ValueError('Некорректный путь баннера')
            paths.append(self.root/'images'/'banners'/'_hasl'/subfolder/name);removable.append(name)
        def metadata(con):
            target=con.execute('SELECT admin FROM users WHERE id=?',(owner,)).fetchone()
            if not target:raise FileNotFoundError()
            if target[0]:raise ValueError('Администратора удалить нельзя')
            self.feedback(con,owner)
            con.execute('DELETE FROM feedback_replies WHERE author=?',(owner,))
            con.execute('DELETE FROM feedback_threads WHERE author=? AND NOT EXISTS (SELECT 1 FROM feedback_replies WHERE thread=feedback_threads.id)',(owner,))
            con.execute("UPDATE feedback_threads SET author='',author_name='Удалённый пользователь',text='Комментарий удалён' WHERE author=?",(owner,))
            con.execute('DELETE FROM published_media WHERE owner=?',(owner,))
            if site.exists():
                con.execute('ATTACH DATABASE ? AS site_db',(str(site),))
                for table in ('projects','project_versions','project_requests','project_archive','site_previews','sections'):
                    con.execute('DELETE FROM site_db.'+table+' WHERE owner=?',(owner,))
                for name in removable:con.execute('DELETE FROM site_db.banners WHERE filename=? AND owner=?',(name,owner))
                con.execute("UPDATE site_db.banners SET owner='_shared' WHERE owner=?",(owner,))
            con.execute('INSERT OR IGNORE INTO deleted_accounts VALUES(?)',(owner,))
            con.execute('DELETE FROM users WHERE id=?',(owner,))
        return self.execute(paths,metadata)

    def site(self,owner,uid,revision):
        site=self.root/'_accounts'/'site-projects.sqlite3'
        with closing(sqlite3.connect(site)) as con:
            row=con.execute('SELECT revision,body FROM projects WHERE id=? AND owner=?',(uid,owner)).fetchone()
            if not row:raise FileNotFoundError()
            if type(revision) is not int or row[0]!=revision:raise CleanupBusy('Сайт изменился. Обновите список и повторите удаление.')
            bodies=[row[1]]+[r[0] for r in con.execute('SELECT body FROM project_versions WHERE project=? AND owner=?',(uid,owner))]
            banners=con.execute("SELECT filename,folder FROM banners WHERE owner IN (?,'_shared')",(owner,)).fetchall()
        text='\n'.join(bodies);candidates=set(MEDIA.findall(text))
        refs=self.references([],owner,'site::'+uid,site_project=uid,needles=candidates|{row[0] for row in banners})
        paths=self.public_files(candidates,refs);removed=[]
        for name,folder in banners:
            if name not in text or name in refs:continue
            if not re.fullmatch(r'[A-Za-z0-9_.-]+',name) or (folder and not re.fullmatch(r'[a-f0-9]{24}/[a-zA-Z0-9_-]{1,70}',folder)):raise ValueError('Некорректный баннер')
            paths.append(self.root/'images'/'banners'/'_hasl'/folder/name);removed.append(name)
        def metadata(con):
            self.feedback(con,owner,'site::'+uid)
            con.execute('ATTACH DATABASE ? AS site_db',(str(site),))
            for table,column in [('projects','id'),('project_versions','project'),('project_archive','project'),('site_previews','project')]:
                con.execute('DELETE FROM site_db.'+table+' WHERE '+column+'=? AND owner=?',(uid,owner))
            for request_id,response in con.execute('SELECT request_id,response FROM site_db.project_requests WHERE owner=?',(owner,)).fetchall():
                if json.loads(response).get('id')==uid:con.execute('DELETE FROM site_db.project_requests WHERE owner=? AND request_id=?',(owner,request_id))
            for name in removed:con.execute("DELETE FROM site_db.banners WHERE filename=? AND owner IN (?,'_shared')",(name,owner))
            con.execute('DELETE FROM published_media WHERE owner=? AND document=?',(owner,'site::'+uid))
        return self.execute(paths,metadata)


def install_cleanup(application, core, db):
    service=DataCleanup(core,db)
    application.extensions['data_cleanup']=service

    @application.before_request
    def serialize_data_writes():
        if request.method not in ('GET','HEAD','OPTIONS') or request.path.startswith('/api/export/'):
            try:
                g.data_write_lock=service.lock();service.recover()
            except (OSError,ValueError):
                return jsonify(error='Не удалось подготовить хранилище. Повторите действие или обратитесь к администратору.'),503

    @application.teardown_request
    def release_data_lock(error):
        stream=g.pop('data_write_lock',None)
        if stream is not None:service.unlock(stream)

    def register(owner,document,kind,body):
        names=set(MEDIA.findall(body))
        with db() as con:
            con.executemany('INSERT OR IGNORE INTO published_media VALUES(?,?,?,?)',[(owner,document,kind,n) for n in names])
    application.extensions['cleanup_register_media']=register
