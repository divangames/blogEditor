"""Email snapshots over the existing atomic JSON/CAS journal, with immutable media."""
import hashlib
import json
import re
import sqlite3
from contextlib import closing
from bs4 import BeautifulSoup
from pathlib import Path
from article_storage import atomic_write, read_document, save_document, document_history, history_revision

HISTORY='_email_history'
EDITABLE=('filename','subject','preheader','site','canvasHtml','renderedHtml','importState',
          'fromEmail','fromName','testEmail','listIds','utm','assets')

def snapshot(file, record):
    file=Path(file)
    if not all(re.fullmatch(r'[A-Za-z0-9_-]{1,100}',str(record.get(key,''))) for key in ('documentId','revision')):
        raise ValueError('Некорректный идентификатор истории письма')
    root=file.parent/HISTORY/record['documentId'];target=root/record['revision']/'snapshot.json'
    if target.is_file():return
    target.parent.mkdir(parents=True,exist_ok=True)
    saved=json.loads(json.dumps(record));frozen={};warnings=[]
    folder=file.parent/(file.stem+'_files')
    for path,filename in record.get('assets',{}).items():
        candidate=folder/str(filename)
        if Path(str(filename)).name!=filename or not candidate.is_file() or candidate.suffix.lower() not in ('.jpg','.png','.webp','.gif'):
            warnings.append(path);continue
        data=candidate.read_bytes()
        if not data or len(data)>12*1024*1024:warnings.append(path);continue
        name=hashlib.sha256(data).hexdigest()+candidate.suffix.lower()
        assets=root/'assets';assets.mkdir(exist_ok=True)
        if not (assets/name).is_file():atomic_write(assets/name,data)
        frozen[path]=name
    sources={img.get('data-email-src') or img.get('src','') for img in BeautifulSoup(record.get('canvasHtml',''),'html.parser').select('img')}
    saved['unfrozenImages']=sorted(source for source in sources if source.startswith(('http:','https:','blob:')) and source not in frozen)
    saved['frozenAssets']=frozen;saved['assetWarnings']=warnings
    record.update(frozenAssets=frozen,assetWarnings=warnings,unfrozenImages=saved['unfrozenImages'])
    atomic_write(target,json.dumps(saved,ensure_ascii=False).encode('utf-8'))

def save(file, payload, record):
    return save_document(file,payload,record,lambda item:item.get('renderedHtml',''),
                         snapshot=snapshot,migrate_legacy=True)

def history(file, before=None):
    return document_history(file,before=before,history_dir=HISTORY,summary_fields=(
        'revision','savedAt','savedBy','subject','saveKind','restoredFrom','assetWarnings','unfrozenImages'))

def revision(file, value):
    return history_revision(file,value,history_dir=HISTORY)

def restore(file, value, payload, actor):
    saved=revision(file,value)
    # No edits and no live media replacement until every frozen source is verified.
    frozen=saved.get('frozenAssets',{});copies={}
    if saved.get('assets') and not frozen:raise ValueError('Изображения старого сохранения ещё не зафиксированы. Восстановление отменено.')
    if saved.get('assetWarnings'):raise ValueError('Изображения версии недоступны. Восстановление отменено.')
    for path,name in frozen.items():
        if not re.fullmatch(r'[a-f0-9]{64}\.(png|jpg|gif|webp)',name):raise ValueError('Некорректное изображение истории')
        source=Path(file).parent/HISTORY/saved['documentId']/'assets'/name
        if not source.is_file():raise ValueError('Изображение версии недоступно; восстановление отменено')
        data=source.read_bytes()
        if hashlib.sha256(data).hexdigest()!=name.split('.')[0]:raise ValueError('Изображение версии повреждено; восстановление отменено')
        # Keep the existing 20-character filename contract used by preview/publishing.
        live=hashlib.sha256(path.encode('utf-8')+b'\0'+data).hexdigest()[:20]+source.suffix
        copies[path]=(live,data)
    def record(current):
        if not current:raise FileNotFoundError('Email-проект не найден')
        folder=Path(file).parent/(Path(file).stem+'_files');folder.mkdir(exist_ok=True)
        assets={}
        rendered=saved.get('renderedHtml','')
        for path,(name,data) in copies.items():
            destination=folder/name
            if destination.exists() and destination.read_bytes()!=data:raise ValueError('Конфликт имени изображения')
            if not destination.exists():atomic_write(destination,data)
            assets[path]=name
            rendered=rendered.replace('__EMAIL_PROJECT_ASSET__/'+saved.get('assets',{}).get(path,''),'__EMAIL_PROJECT_ASSET__/'+name)
        result={**current,**{key:saved.get(key) for key in EDITABLE},'assets':assets,'renderedHtml':rendered,
                'workflowStatus':'draft','reviewComment':'','reviewerId':None,'reviewerName':'','reviewUpdatedAt':None,
                'submittedAt':None,'notisendCampaignId':None,'campaignFingerprint':'',
                'saveKind':'restore','restoredFrom':value,'savedBy':actor}
        for key in ('revision','previousRevision','_saveRequest','_saveFingerprint'):result.pop(key,None)
        return result
    return save(file,payload,record)

def metadata(file, update, actor, expected=None):
    current=read_document(file)
    if not current:raise FileNotFoundError('Email-проект не найден')
    payload={'expectedRevision':expected or current['revision']}
    def record(latest):
        result={**latest,**update(latest),'saveKind':'workflow','savedBy':actor}
        for key in ('revision','previousRevision','_saveRequest','_saveFingerprint','restoredFrom'):result.pop(key,None)
        return result
    return save(file,payload,record)

def publication(file, expected, names):
    # Derived public URLs do not alter editable content or its revision.
    from article_storage import SaveConflict
    with closing(sqlite3.connect(Path(file).parent/'_article_saves.sqlite3',timeout=30)) as con,con:
        con.execute('BEGIN IMMEDIATE')
        current=read_document(file)
        if not current or current['revision']!=expected:raise SaveConflict(current)
        current['publishedImages']=sorted(set(current.get('publishedImages',[]))|set(names))
        atomic_write(file,json.dumps(current,ensure_ascii=False).encode('utf-8'))
