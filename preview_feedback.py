"""Authenticated, anchored review threads shared by article and email previews."""
import json
import math
import re
import secrets
from datetime import datetime, timezone
from flask import Response, g, jsonify, request
from bs4 import BeautifulSoup


def install_feedback(application, core, db, user_folder):
    with db() as con:
        con.executescript("""CREATE TABLE IF NOT EXISTS feedback_threads (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, anchor TEXT NOT NULL,
          text TEXT NOT NULL, author TEXT NOT NULL, author_name TEXT NOT NULL,
          created TEXT NOT NULL, updated TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
          CREATE INDEX IF NOT EXISTS feedback_document ON feedback_threads(owner,name);
          CREATE TABLE IF NOT EXISTS feedback_replies (
          id TEXT PRIMARY KEY, thread TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL,
          author_name TEXT NOT NULL, created TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS feedback_reply_thread ON feedback_replies(thread);""")

    def cleanup(owner,name):
        with db() as con:
            con.execute('DELETE FROM feedback_replies WHERE thread IN (SELECT id FROM feedback_threads WHERE owner=? AND name=?)',(owner,name))
            con.execute('DELETE FROM feedback_threads WHERE owner=? AND name=?',(owner,name))
            con.execute('DELETE FROM previews WHERE owner=? AND name=?',(owner,name))
    application.extensions['feedback_cleanup']=cleanup

    def document(row):
        folder=user_folder(row['owner'])
        name=row['name']
        file=(folder/'_email_projects'/f"{name[7:]}.json") if name.startswith('email::') else folder/f'{name}.json'
        if not file.is_file(): return None
        return json.loads(file.read_text(encoding='utf-8'))

    def preview(token):
        with db() as con: row=con.execute('SELECT * FROM previews WHERE token=?',(token,)).fetchone()
        return row if row and document(row) is not None else None

    def threads(row):
        with db() as con:
            rows=con.execute('SELECT t.*,COALESCE(u.name,t.author_name) display_name FROM feedback_threads t LEFT JOIN users u ON u.id=t.author WHERE t.owner=? AND t.name=? ORDER BY t.created',(row['owner'],row['name'])).fetchall()
            result=[]
            for t in rows:
                replies=con.execute('SELECT r.*,COALESCE(u.name,r.author_name) display_name FROM feedback_replies r LEFT JOIN users u ON u.id=r.author WHERE thread=? ORDER BY created',(t['id'],)).fetchall()
                result.append(dict(id=t['id'],anchor=json.loads(t['anchor']),text=t['text'],author=t['author'],authorName=t['display_name'],createdAt=t['created'],updatedAt=t['updated'],resolved=bool(t['resolved']),
                  canEdit=t['author']==g.editor_user['id'],canDelete=bool(t['author']==g.editor_user['id'] or g.editor_user['admin']),
                  canResolve=bool(t['author']==g.editor_user['id'] or row['owner']==g.editor_user['id'] or g.editor_user['admin'] or g.editor_user['role']=='moderator'),
                  replies=[dict(id=r['id'],text=r['text'],author=r['author'],authorName=r['display_name'],createdAt=r['created']) for r in replies]))
        return result

    def text_value(data):
        value=data.get('text')
        return value.strip() if isinstance(value,str) and 1<=len(value.strip())<=5000 else None

    def anchor_value(data):
        anchor=data.get('anchor')
        if not isinstance(anchor,dict): return None
        selector=anchor.get('selector','')
        quote=anchor.get('quote','')
        if not isinstance(selector,str) or len(selector)>1200 or not re.fullmatch(r'body(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]{0,4}\)){1,30}',selector): return None
        if not isinstance(quote,str) or len(quote)>300: return None
        result=dict(selector=selector,quote=quote,kind='image' if anchor.get('kind')=='image' else 'text')
        for key in ('x','y'):
            value=anchor.get(key)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=1:return None
            result[key]=value
        return result

    @application.get('/api/preview-feedback/<token>')
    def feedback_list(token):
        row=preview(token)
        if row is None:return jsonify(error='Предпросмотр недоступен'),404
        return jsonify(items=threads(row),viewer=dict(id=g.editor_user['id'],name=g.editor_user['name']),owner=row['owner'])

    @application.post('/api/preview-feedback/<token>')
    def feedback_create(token):
        row=preview(token)
        if row is None:return jsonify(error='Предпросмотр недоступен'),404
        data=request.get_json(silent=True) or {}
        if not isinstance(data,dict):return jsonify(error='Неверный запрос'),400
        text=text_value(data);anchor=anchor_value(data)
        if text is None or anchor is None:return jsonify(error='Укажите место и заметку до 5000 символов'),400
        uid=secrets.token_urlsafe(16);now=datetime.now(timezone.utc).isoformat()
        with db() as con:
            count=con.execute('SELECT COUNT(*) FROM feedback_threads WHERE owner=? AND name=?',(row['owner'],row['name'])).fetchone()[0]
            if count>=1000:return jsonify(error='Достигнут предел обсуждений для этого материала'),400
            con.execute('INSERT INTO feedback_threads(id,owner,name,anchor,text,author,author_name,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',(uid,row['owner'],row['name'],json.dumps(anchor),text,g.editor_user['id'],g.editor_user['name'],now,now))
        return jsonify(id=uid),201

    @application.route('/api/preview-feedback/<token>/<thread_id>',methods=['PATCH','DELETE','POST'])
    def feedback_change(token,thread_id):
        row=preview(token)
        if row is None:return jsonify(error='Предпросмотр недоступен'),404
        with db() as con:
            t=con.execute('SELECT * FROM feedback_threads WHERE id=? AND owner=? AND name=?',(thread_id,row['owner'],row['name'])).fetchone()
            if t is None:return jsonify(error='Обсуждение не найдено'),404
            author=t['author']==g.editor_user['id'];admin=bool(g.editor_user['admin'])
            data=request.get_json(silent=True) or {}
            if not isinstance(data,dict):return jsonify(error='Неверный запрос'),400
            now=datetime.now(timezone.utc).isoformat()
            if request.method=='DELETE':
                if not(author or admin):return jsonify(error='Удалять может автор заметки или администратор'),403
                con.execute('DELETE FROM feedback_replies WHERE thread=?',(thread_id,));con.execute('DELETE FROM feedback_threads WHERE id=?',(thread_id,))
            elif request.method=='POST':
                text=text_value(data)
                if text is None:return jsonify(error='Ответ должен содержать от 1 до 5000 символов'),400
                count=con.execute('SELECT COUNT(*) FROM feedback_replies WHERE thread=?',(thread_id,)).fetchone()[0]
                if count>=500:return jsonify(error='Достигнут предел ответов'),400
                con.execute('INSERT INTO feedback_replies VALUES(?,?,?,?,?,?)',(secrets.token_urlsafe(16),thread_id,text,g.editor_user['id'],g.editor_user['name'],now))
                con.execute('UPDATE feedback_threads SET updated=? WHERE id=?',(now,thread_id))
            else:
                if 'resolved' in data:
                    if not(author or admin or row['owner']==g.editor_user['id'] or g.editor_user['role']=='moderator'):return jsonify(error='Недостаточно прав'),403
                    if not isinstance(data['resolved'],bool):return jsonify(error='Неверный статус'),400
                if 'text' in data and (not author or text_value(data) is None):return jsonify(error='Изменять текст может только автор; длина до 5000 символов'),403
                if not any(k in data for k in ('text','resolved')):return jsonify(error='Изменение не указано'),400
                con.execute('UPDATE feedback_threads SET text=?,resolved=?,updated=? WHERE id=?',(text_value(data) if 'text' in data else t['text'],int(data.get('resolved',bool(t['resolved']))),now,thread_id))
        return jsonify(ok=True)

    @application.get('/api/feedback/inbox')
    def feedback_inbox():
        with db() as con:
            rows=con.execute("""SELECT t.name,MAX(t.updated) updated,SUM(CASE WHEN t.resolved=0 THEN 1 ELSE 0 END) open_count,COUNT(*) total_count,p.token
            FROM feedback_threads t LEFT JOIN previews p ON p.owner=t.owner AND p.name=t.name WHERE t.owner=? GROUP BY t.name ORDER BY updated DESC""",(g.editor_user['id'],)).fetchall()
        items=[]
        for row in rows:
            record=document(dict(owner=g.editor_user['id'],name=row['name']))
            if record is None:continue
            email=row['name'].startswith('email::');name=row['name'][7:] if email else record.get('id',row['name'])
            items.append(dict(name=name,kind='email' if email else 'article',brand=record.get('brand','outmax'),title=record.get('subject') if email else record.get('title'),openCount=row['open_count'],totalCount=row['total_count'],updatedAt=row['updated'],previewUrl=f"/preview/{row['token']}/" if row['token'] else None))
        return jsonify(items=items,openCount=sum(i['openCount'] for i in items))


def feedback_document(document):
    """Only our nonce-authorized annotator can execute in the opaque preview frame."""
    soup=BeautifulSoup(document,'html.parser')
    for node in soup.find_all(['script','base','iframe','object','embed','form']):node.decompose()
    for node in soup.find_all(True):
        for key in list(node.attrs):
            if key.lower().startswith('on'):del node.attrs[key]
        if node.name=='meta' and node.get('http-equiv','').lower() in ('refresh','content-security-policy'):node.decompose()
    nonce=secrets.token_urlsafe(24)
    script=soup.new_tag('script',nonce=nonce);script.string=FRAME_JS
    (soup.body or soup).append(script)
    response=Response(str(soup),mimetype='text/html')
    response.headers['Content-Security-Policy']=f"sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; base-uri 'none'; form-action 'none'; connect-src 'none'"
    return response


def feedback_page(title,subtitle):
    import html
    return Response(PAGE.replace('SUBTITLE_TEXT',html.escape(subtitle)).replace('TITLE_TEXT',html.escape(title)).replace('DESKTOP_WIDTH','700' if 'email' in subtitle.lower() else '920'),mimetype='text/html')

FRAME_JS = r"""
(()=>{
 let armed=false,pins=[],active=null,draft=null,hover=null,suppressNextClick=false;
 const layer=document.createElement('div');layer.dataset.feedbackUi='1';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2147483646';document.body.append(layer);
 const send=data=>parent.postMessage({channel:'editor-feedback',...data},'*');
 const path=node=>{const parts=[];while(node&&node!==document.body){const tag=node.tagName.toLowerCase(),index=[...node.parentElement.children].filter(n=>n.tagName===node.tagName).indexOf(node)+1;parts.unshift(`${tag}:nth-of-type(${index})`);node=node.parentElement;}return 'body > '+parts.join(' > ');};
 const elements=()=>[...document.querySelectorAll('a,p,h1,h2,h3,h4,li,td,figcaption,img,section,header,nav,div')].filter(n=>!n.closest('[data-feedback-ui]'));
 function locate(anchor){let node;try{node=document.querySelector(anchor.selector);}catch{}const matches=n=>n&&(anchor.kind==='image'?n.tagName==='IMG'&&(n.getAttribute('src')||'').includes(anchor.quote):(n.textContent||'').includes(anchor.quote));return matches(node)?node:elements().find(matches);}
 const target=node=>node?.closest?.('img,a,p,h1,h2,h3,h4,li,td,figcaption,section,header,nav,div');
 function outline(node){if(!node)return;const r=node.getBoundingClientRect();if(!r.width||!r.height)return;const box=document.createElement('div');box.dataset.feedbackOutline='1';box.style.cssText=`position:absolute;left:${r.left+scrollX}px;top:${r.top+scrollY}px;width:${r.width}px;height:${r.height}px;box-sizing:border-box;border:2px solid #2684ff;background:rgba(38,132,255,.035);pointer-events:none`;layer.append(box);}
 function pin(anchor,label,item){const node=locate(anchor);if(!node)return;const r=node.getBoundingClientRect(),button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.feedbackPin='1';button.setAttribute('aria-label',item?'Открыть заметку '+label:'Новая заметка '+label);button.style.cssText=`position:absolute;left:${Math.max(0,Math.min(document.documentElement.clientWidth-32,r.left+scrollX+r.width*anchor.x-15))}px;top:${Math.max(0,r.top+scrollY+r.height*anchor.y-15)}px;width:32px;height:32px;min-height:32px;padding:0;border:2px solid white;border-radius:50%;background:${item?.resolved?'#768477':'#2684ff'};color:#fff;font:700 13px Arial,sans-serif;cursor:pointer;pointer-events:auto`;button.onclick=()=>{if(item){active=item.id;paint();send({type:'select',id:item.id});}};layer.append(button);}
 function paint(){layer.replaceChildren();const selected=draft?locate(draft):active?locate(pins.find(p=>p.id===active)?.anchor||{}):null;outline(armed&&hover?hover:selected);pins.forEach((item,index)=>pin(item.anchor,index+1,item));if(draft)pin(draft,pins.length+1,null);}
 addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='editor-feedback')return;const data=event.data;
  if(data.type==='mode'){armed=!!data.armed;hover=null;document.body.style.cursor=armed?'crosshair':'';paint();}
  if(data.type==='pins'){pins=data.items||[];paint();}
  if(data.type==='draft'){draft=data.anchor||null;paint();}
  if(data.type==='focus'||data.type==='select'){active=data.id;const node=locate(pins.find(i=>i.id===active)?.anchor||{});if(data.type==='focus'){if(node)node.scrollIntoView({block:'center',behavior:'auto'});else send({type:'missing',id:active});}paint();}
 });
 document.addEventListener('pointermove',event=>{if(!armed||event.target.closest('[data-feedback-ui]'))return;const node=target(event.target);if(node&&node!==document.body&&node!==hover){hover=node;paint();}});
 document.addEventListener('pointerleave',()=>{hover=null;if(armed)paint();});
 document.addEventListener('click',event=>{if((armed||suppressNextClick)&&!event.target.closest('[data-feedback-ui]')){event.preventDefault();event.stopPropagation();suppressNextClick=false;}},true);
 document.addEventListener('pointerup',event=>{if(!armed||event.target.closest('[data-feedback-ui]'))return;const node=target(event.target);if(!node||node===document.body||!document.body.contains(node))return;suppressNextClick=true;const r=node.getBoundingClientRect(),selected=getSelection()?.toString().trim();const anchor={selector:path(node),quote:(node.tagName==='IMG'?(node.getAttribute('src')||''):selected||node.textContent.trim()).slice(0,300),kind:node.tagName==='IMG'?'image':'text',x:r.width?Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)):.5,y:r.height?Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)):.5};draft=anchor;paint();send({type:'anchor',anchor,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}});});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')send({type:'cancel'});if(event.key.toLowerCase()==='c'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.matches('input,textarea,[contenteditable=true]'))send({type:'toggle-mode'});});
 addEventListener('resize',paint);addEventListener('load',paint);new ResizeObserver(paint).observe(document.body);send({type:'ready'});
})();

"""

PAGE = r"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TITLE_TEXT · Предпросмотр</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap"><style>
*{box-sizing:border-box}body{margin:0;height:100dvh;display:flex;flex-direction:column;background:#f2f4f7;color:#2e3540;font:12px/1.5 "Open Sans",Arial,sans-serif}button,input,textarea,a{font:inherit}button,a.action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:36px;padding:8px 11px;border:1px solid #dfe3e8;border-radius:7px;background:#fff;color:#4e5967;cursor:pointer;text-decoration:none;white-space:nowrap}button:focus-visible,a:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #858b94;outline-offset:2px}button:active{transform:scale(.97)}button:disabled{opacity:.5;cursor:default}[hidden]{display:none!important}.review-header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 20px;border-bottom:1px solid #e3e7ec;background:#fff;flex:none}.preview-title{min-width:0}.preview-title strong{display:block;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}.preview-title small{color:#8992a0;font-size:10px}.review-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.device-toggle{display:flex;padding:3px;background:#f2f4f7;border:1px solid #e4e7ec;border-radius:8px}.device-toggle button{min-height:28px;padding:5px 8px;border:0;background:transparent;font-size:10px}.device-toggle button[aria-pressed=true]{background:#fff;color:#27313d;box-shadow:0 1px 3px #0001}.review-primary,button.review-primary{background:#303d50;border-color:#303d50;color:white}#review-mode[aria-pressed=true]{background:#e8eef7;border-color:#bdcce0;color:#355b8b}#review-identity{color:#6c7685;font-size:11px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-layout{display:grid;grid-template-columns:minmax(0,1fr);min-height:0;flex:1}.comments-open .review-layout{grid-template-columns:minmax(0,1fr) 330px}.preview-pane{padding:16px;min-width:0;min-height:0;position:relative}.preview-pane iframe{display:block;width:100%;max-width:1100px;height:100%;border:0;background:#fff;box-shadow:0 4px 25px #0000000b;margin:auto}.preview-pane iframe.mobile{max-width:390px}.review-sidebar{display:none;flex-direction:column;min-height:0;border-left:1px solid #e2e6ec;background:#fff}.comments-open .review-sidebar{display:flex}.review-sidebar-head{padding:18px 16px 12px;border-bottom:1px solid #edf0f3}.review-sidebar-head h2{font-size:14px;margin:0 0 8px;font-weight:600}.review-filter{display:flex;gap:5px}.review-filter button{min-height:28px;font-size:10px;padding:5px 8px}.review-filter button[aria-pressed=true]{background:#edf1f6;color:#354b67;border-color:#d9e2ed}.review-threads{overflow:auto;overscroll-behavior:contain;flex:1;padding:14px}.review-empty{padding:20px 6px;color:#8a93a0;font-size:11px;line-height:1.7}.review-thread{padding:13px;border:1px solid #e4e8ee;border-radius:9px;margin-bottom:12px;background:#fff;scroll-margin-top:10px}.review-thread.is-selected{border-color:#acbfd8;background:#fafcfe}.review-thread.is-resolved{opacity:.8}.review-thread-head,.review-reply-head{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#6d7786;font-size:10px}.review-thread-head strong,.review-reply-head strong{font-weight:600;color:#3a4655;overflow-wrap:anywhere}.review-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:8px 0;line-height:1.65}.review-quote{padding:7px 9px;border-left:2px solid #c5d2e2;background:#f4f7fb;color:#778396;font-size:10px;overflow-wrap:anywhere;margin:9px 0;max-height:76px;overflow:auto}.review-thread-actions{display:flex;flex-wrap:wrap;gap:5px;margin:9px 0}.review-thread-actions button{font-size:9px;min-height:27px;padding:4px 7px}.review-reply{padding-top:10px;margin-top:10px;border-top:1px solid #edf0f3}.review-reply .review-text{font-size:11px}.review-reply-form{display:grid;gap:7px;margin-top:12px}.review-reply-form textarea,dialog textarea{width:100%;min-height:64px;resize:vertical;border:1px solid #dfe4eb;border-radius:7px;padding:9px;color:#384454;background:#fff;font-size:12px}.review-reply-form button{justify-self:end;min-height:30px;font-size:10px}.review-message{padding:8px 18px;color:#657288;font-size:11px;background:#edf2f8;flex:none;overflow-wrap:anywhere}dialog{width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:22px;border:1px solid #dfe4eb;border-radius:12px;background:#fff;box-shadow:0 20px 80px #0003;color:#354050;overflow:auto}dialog::backdrop{background:#202b3b66}dialog h2{font-size:17px;font-weight:600;margin:0 0 12px}dialog label{display:grid;gap:7px;font-size:11px}dialog textarea{min-height:140px}.review-dialog-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:15px}.review-form-error{font-size:11px;color:#a53b42;margin-top:10px}#review-confirm p{font-size:12px;color:#788190}button:hover,a.action:hover{border-color:#b8c1ce}.review-refresh{float:right;min-height:27px;font-size:10px;padding:4px 7px}
@media(max-width:800px){.review-header{padding:10px 12px;align-items:flex-start;flex-wrap:wrap;gap:8px}.preview-title strong{max-width:calc(100vw - 24px)}.review-actions{width:100%;gap:5px}.review-actions>button,.review-actions>a{font-size:10px;padding:7px 8px}.comments-open .review-layout{grid-template-columns:1fr}.preview-pane{padding:8px}.review-sidebar{position:fixed;z-index:20;top:122px;bottom:10px;right:10px;left:10px;border:1px solid #dfe5ed;border-radius:11px;box-shadow:0 10px 40px #0002;overflow:hidden}.review-sidebar-head{padding:14px}#review-identity{max-width:100px;font-size:10px}.review-thread-actions button{min-height:32px}.review-reply-form textarea,dialog textarea{font-size:16px}}
@media(prefers-reduced-motion:no-preference){button,a.action{transition:background-color 150ms ease,border-color 150ms ease,transform 120ms cubic-bezier(.23,1,.32,1)}}@media(prefers-reduced-motion:reduce){button:active{transform:none}}

.review-header{padding:12px 24px}.preview-pane{overflow:auto;padding:24px;background:#e8e9eb}.review-stage{display:flex;gap:28px;align-items:flex-start;justify-content:center;width:max-content;min-width:100%;padding-bottom:80px}.review-device{flex:none;min-width:0}.review-desktop{width:DESKTOP_WIDTHpx}.review-phone{width:360px}.review-device-label{display:flex;justify-content:space-between;color:#66717a;font-size:12px;margin:0 0 12px}.preview-pane .review-device iframe{width:100%;max-width:none;height:calc(100dvh - 190px);min-height:380px;margin:0;box-shadow:none}.review-stage[data-device=desktop] .review-phone,.review-stage[data-device=mobile] .review-desktop{display:none}.review-stage[data-device=desktop] .review-desktop{width:min(DESKTOP_WIDTHpx,calc(100vw - 80px))}.comments-open .review-stage[data-device=desktop] .review-desktop{width:min(DESKTOP_WIDTHpx,calc(100vw - 410px))}
.annotation-bar{position:fixed;z-index:40;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;max-width:calc(100vw - 24px);padding:8px;background:#282828;border-radius:10px;color:#fff;box-shadow:0 4px 20px #0002}.annotation-bar button{background:transparent;border-color:transparent;color:#fff;min-height:44px;transition:none}.annotation-bar #review-mode[aria-pressed=true]{background:#2684ff;border-color:#2684ff;color:#fff}.annotation-count{font-size:11px;padding:0 8px;white-space:nowrap}.review-thread.is-selected{border-color:#2684ff;background:#f6faff}.review-thread-number{display:inline-grid;place-items:center;width:24px;height:24px;margin-right:6px;background:#2684ff;border-radius:50%;color:#fff;font-size:11px}.review-sidebar{box-shadow:none}#review-composer{position:fixed;z-index:50;width:min(360px,calc(100vw - 24px));margin:0;padding:18px;border:1px solid #dce3ed;border-radius:10px;box-shadow:0 8px 30px #0002}#review-composer h2{font-size:15px}#review-composer textarea{min-height:96px}#review-submit{background:#2684ff;border-color:#2684ff}#review-composer .review-quote{max-height:46px}
@media(max-width:800px){.preview-pane{padding:16px 12px}.review-stage[data-device=both]{flex-direction:column;align-items:center;width:100%;min-width:0}.review-stage[data-device=both] .review-desktop{width:100%}.review-stage[data-device=both] .review-phone{width:min(360px,100%)}.review-stage[data-device=desktop] .review-desktop,.comments-open .review-stage[data-device=desktop] .review-desktop{width:100%}.review-stage[data-device=mobile]{width:100%;min-width:0}.review-stage[data-device=mobile] .review-phone{width:min(360px,100%)}.annotation-bar{bottom:12px;gap:2px}.annotation-count{padding:0 4px}.annotation-bar button{font-size:11px;padding:8px}.review-sidebar{top:110px;bottom:82px}#review-composer{left:12px!important;top:auto!important;bottom:82px}}
</style></head><body><header class="review-header"><div class="preview-title"><strong>TITLE_TEXT</strong><small>SUBTITLE_TEXT · только чтение</small></div><div class="review-actions"><div class="device-toggle" aria-label="Устройство"><button data-size="both" aria-pressed="true">ПК и телефон</button><button data-size="desktop" aria-pressed="false">Десктоп</button><button data-size="mobile" aria-pressed="false">Телефон</button></div><button id="review-mode" aria-pressed="false" disabled>Аннотирование</button><button id="review-toggle" aria-expanded="false">Обсуждения <span id="review-count"></span></button><a id="review-login" class="action review-primary">Войти</a><span id="review-identity" hidden></span></div></header><div id="review-message" class="review-message" role="status" hidden></div><main class="review-layout"><section class="preview-pane"><div class="review-stage" data-device="both"><div class="review-device review-desktop"><div class="review-device-label"><span>ПК</span><span>DESKTOP_WIDTH px</span></div><iframe id="review-frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="?content=1" title="Материал для просмотра"></iframe></div><div class="review-device review-phone"><div class="review-device-label"><span>ТЕЛЕФОН</span><span>360 px</span></div><iframe id="review-phone-frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="?content=1" title="Материал на телефоне"></iframe></div></div></section><aside class="review-sidebar" aria-label="Обсуждения материала"><div class="review-sidebar-head"><button id="review-refresh" class="review-refresh">Обновить</button><h2>Обратная связь</h2><div class="review-filter"><button data-filter="open" aria-pressed="true">Открытые</button><button data-filter="all" aria-pressed="false">Все</button><button data-filter="resolved" aria-pressed="false">Решённые</button></div></div><div id="review-threads" class="review-threads"><p class="review-empty">Для заметок и обсуждений войдите в свой аккаунт. Просмотр материала доступен без входа.</p></div></aside></main><div class="annotation-bar" role="toolbar" aria-label="Аннотирование"><span class="annotation-count" id="annotation-count">0 заметок</span><button id="annotation-discussions" type="button">Обсуждения</button></div><dialog id="review-composer" aria-labelledby="review-composer-title"><form id="review-note-form"><h2 id="review-composer-title">Новая заметка</h2><div id="review-anchor-quote" class="review-quote"></div><label>Комментарий или предлагаемая правка<textarea id="review-note-text" required maxlength="5000" placeholder="Опишите, что нужно исправить…"></textarea></label><div id="review-note-error" class="review-form-error" role="alert" hidden></div><div class="review-dialog-actions"><button type="button" id="review-cancel">Отмена</button><button class="review-primary" id="review-submit" type="submit">Сохранить заметку</button></div></form></dialog><dialog id="review-confirm" aria-labelledby="review-confirm-title"><h2 id="review-confirm-title">Удалить обсуждение?</h2><p>Заметка и ответы будут удалены.</p><div class="review-dialog-actions"><button id="review-delete-cancel">Отмена</button><button id="review-delete-yes" class="review-primary">Удалить</button></div></dialog><script>
(()=>{
 const q=s=>document.querySelector(s),frame=q('#review-frame'),composer=q('#review-composer');let items=[],viewer=null,filter='open',armed=false,anchor=null,editing=null,selected=null,deleting=null,loading=false;const replyDrafts=new Map();
 const frames=[frame,q('#review-phone-frame')];q('.annotation-bar').prepend(q('#review-mode'));
 const token=location.pathname.split('/').filter(Boolean).pop(),endpoint='/editor-api/preview-feedback/'+encodeURIComponent(token);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=s=>new Date(s).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const send=data=>frames.forEach(f=>f.contentWindow?.postMessage({channel:'editor-feedback',...data},'*'));
 const message=text=>{q('#review-message').hidden=!text;q('#review-message').textContent=text;};
 async function api(path='',options={}){const r=await fetch(endpoint+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});const d=await r.json();if(!r.ok){const error=new Error(d.error||'Ошибка сервера');error.status=r.status;throw error;}return d;}
 function setMode(value){armed=value;q('#review-mode').setAttribute('aria-pressed',String(value));send({type:'mode',armed:value});message(value?'Нажмите на место в материале или выделите текст, чтобы оставить заметку.':'');if(value && innerWidth<=800)setPanel(false);}
 function setPanel(value){document.body.classList.toggle('comments-open',value);q('#review-toggle').setAttribute('aria-expanded',String(value));}
 setPanel(new URLSearchParams(location.search).get('comments')==='1');q('#review-login').href='/login?next='+encodeURIComponent(location.pathname);
 q('#review-toggle').onclick=()=>setPanel(!document.body.classList.contains('comments-open'));
 q('#review-mode').onclick=()=>setMode(!armed);q('#annotation-discussions').onclick=()=>setPanel(!document.body.classList.contains('comments-open'));
 document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{q('.review-stage').dataset.device=button.dataset.size;document.querySelectorAll('[data-size]').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));});
 document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));render();});
 function render(){
  document.querySelectorAll('[data-reply] textarea').forEach(n=>{if(n.value)replyDrafts.set(n.closest('form').dataset.reply,n.value);});
  const focused=document.activeElement;const typing=focused?.matches('.review-reply-form textarea');
  q('#review-count').textContent=items.filter(i=>!i.resolved).length;q('#annotation-count').textContent=items.length+' заметок';
  send({type:'pins',items:items.map(i=>({id:i.id,anchor:i.anchor,resolved:i.resolved}))});if(selected)send({type:'select',id:selected});
  if(typing)return;
  const visible=items.filter(i=>filter==='all' || (filter==='resolved')===i.resolved);
  q('#review-threads').innerHTML=visible.map(item=>`<article class="review-thread ${item.resolved?'is-resolved':''} ${selected===item.id?'is-selected':''}" data-thread="${esc(item.id)}"><div class="review-thread-head"><strong><span class="review-thread-number">${items.indexOf(item)+1}</span>${esc(item.authorName)}</strong><time>${date(item.createdAt)}</time></div>${item.anchor.quote?`<div class="review-quote">${esc(item.anchor.quote)}</div>`:''}<p class="review-text">${esc(item.text)}</p><div class="review-thread-actions"><button data-focus="${esc(item.id)}">Показать место</button>${item.canResolve?`<button data-resolve="${esc(item.id)}">${item.resolved?'Открыть снова':'Решено'}</button>`:''}${item.canEdit?`<button data-edit="${esc(item.id)}">Изменить</button>`:''}${item.canDelete?`<button data-delete="${esc(item.id)}">Удалить</button>`:''}</div>${item.replies.map(r=>`<div class="review-reply"><div class="review-reply-head"><strong>${esc(r.authorName)}</strong><time>${date(r.createdAt)}</time></div><p class="review-text">${esc(r.text)}</p></div>`).join('')}<form class="review-reply-form" data-reply="${esc(item.id)}"><textarea required maxlength="5000" placeholder="Ответить…" aria-label="Ответ в обсуждение">${esc(replyDrafts.get(item.id)||'')}</textarea><button type="submit">Ответить</button></form></article>`).join('')||'<p class="review-empty">Здесь пока нет обсуждений. Нажмите «Аннотирование» и укажите место в материале.</p>';
 }
 async function load(){if(loading)return;loading=true;try{const data=await api();items=data.items;viewer=data.viewer;q('#review-mode').disabled=false;q('#review-login').hidden=true;q('#review-identity').hidden=false;q('#review-identity').textContent=viewer.name;q('#review-identity').title=viewer.name;render();}catch(error){if(viewer)message(error.message);if([401,404].includes(error.status)){viewer=null;items=[];setMode(false);q('#review-mode').disabled=true;q('#review-login').hidden=false;q('#review-identity').hidden=true;q('#review-threads').innerHTML='<p class="review-empty">Для обсуждений войдите в аккаунт. Проверьте, что ссылка на предпросмотр ещё действует.</p>';}}finally{loading=false;}}
 q('#review-refresh').onclick=load;
 addEventListener('message',event=>{const originFrame=frames.find(f=>f.contentWindow===event.source);if(!originFrame||event.data?.channel!=='editor-feedback')return;const data=event.data;
  if(data.type==='toggle-mode'&&viewer)setMode(!armed);if(data.type==='cancel'){setMode(false);composer.close();}
  if(data.type==='ready'){send({type:'pins',items:items.map(i=>({id:i.id,anchor:i.anchor,resolved:i.resolved}))});send({type:'mode',armed});}
  if(data.type==='anchor' && viewer && armed){anchor=data.anchor;editing=null;q('#review-composer-title').textContent='Новая заметка';q('#review-anchor-quote').textContent=anchor.quote||'Заметка к этому месту';q('#review-note-text').value='';q('#review-note-error').hidden=true;setMode(false);composer.show();const r=originFrame.getBoundingClientRect(),a=data.rect||{right:0,top:40};positionComposer(r.left+a.right+12,r.top+a.top);send({type:'draft',anchor});q('#review-note-text').focus();}
  if(data.type==='select'){selected=data.id;send({type:'select',id:selected});filter='all';document.querySelectorAll('[data-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.filter==='all')));setPanel(true);render();document.querySelector(`[data-thread="${CSS.escape(selected)}"]`)?.scrollIntoView({block:'nearest'});}
  if(data.type==='missing')message('Это место изменилось после правки материала. Текст заметки сохранён в обсуждении.');
 });
 function positionComposer(left=innerWidth/2-180,top=120){const r=composer.getBoundingClientRect();composer.style.left=Math.max(12,Math.min(innerWidth-r.width-12,left))+'px';composer.style.top=Math.max(12,Math.min(innerHeight-r.height-82,top))+'px';}
 composer.addEventListener('close',()=>send({type:'draft',anchor:null}));q('#review-note-text').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();q('#review-note-form').requestSubmit();}});
 q('#review-cancel').onclick=()=>composer.close();composer.addEventListener('click',e=>{if(e.target===composer)composer.close();});
 q('#review-note-form').onsubmit=async event=>{event.preventDefault();const submit=q('#review-submit');submit.disabled=true;try{const d=await api(editing?'/'+encodeURIComponent(editing):'',{method:editing?'PATCH':'POST',body:JSON.stringify({text:q('#review-note-text').value,anchor})});selected=d.id||editing;composer.close();setPanel(true);await load();message('Заметка сохранена. Она доступна автору материала в редакторе.');}catch(error){q('#review-note-error').hidden=false;q('#review-note-error').textContent=error.message;}finally{submit.disabled=false;}};
 q('#review-threads').onclick=async event=>{const button=event.target.closest('button');if(!button || button.closest('.review-reply-form'))return;const id=button.dataset.focus||button.dataset.resolve||button.dataset.edit||button.dataset.delete,item=items.find(i=>i.id===id);if(!item)return;
  if(button.dataset.focus){send({type:'focus',id});if(innerWidth<=800)setPanel(false);}
  if(button.dataset.edit){editing=id;anchor=item.anchor;q('#review-composer-title').textContent='Изменить заметку';q('#review-anchor-quote').textContent=anchor.quote;q('#review-note-text').value=item.text;q('#review-note-error').hidden=true;composer.show();positionComposer();send({type:'draft',anchor});q('#review-note-text').focus();}
  if(button.dataset.delete){deleting=id;q('#review-confirm').showModal();}
  if(button.dataset.resolve){button.disabled=true;try{await api('/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({resolved:!item.resolved})});await load();}catch(error){message(error.message);button.disabled=false;}}
 };
 q('#review-threads').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;try{await api('/'+encodeURIComponent(form.dataset.reply),{method:'POST',body:JSON.stringify({text:form.querySelector('textarea').value})});form.querySelector('textarea').value='';replyDrafts.delete(form.dataset.reply);form.querySelector('textarea').blur();await load();}catch(error){message(error.message);button.disabled=false;}};
 q('#review-delete-cancel').onclick=()=>q('#review-confirm').close();q('#review-delete-yes').onclick=async()=>{const button=q('#review-delete-yes');button.disabled=true;try{await api('/'+encodeURIComponent(deleting),{method:'DELETE'});q('#review-confirm').close();await load();}catch(error){message(error.message);}finally{button.disabled=false;}};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')setMode(false);});
 load();setInterval(()=>{if(!document.hidden && viewer && !composer.open && !q('#review-confirm').open)load();},15000);
})();
</script></body></html>"""
