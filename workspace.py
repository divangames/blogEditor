"""Shared home and tool entry UI; existing editors own every document operation."""
import json
from html.parser import HTMLParser
from urllib.parse import urlsplit, quote


def safe_cover_url(source, base='/articles/'):
    """Only browser image URLs; never fetch a thumbnail on the server."""
    if not isinstance(source, str) or not source.strip():
        return ''
    source = source.strip()
    try:
        parsed = urlsplit(source)
    except ValueError:
        return ''
    if parsed.scheme and parsed.scheme.lower() not in ('http', 'https'):
        return ''
    if source.startswith('//') or parsed.scheme:
        return source
    if source.startswith('/'):
        return source
    if '..' in parsed.path.split('/'):
        return ''
    return base + source


def document_cover(body, assets=None, project_id=None, *, email_rendered=False):
    class CoverParser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.cover = self.image = self.banner = ''

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'meta' and (attrs.get('name', '').lower() == 'article-cover' or attrs.get('property', '').lower() == 'og:image'):
                self.cover = attrs.get('content', '')
            if tag == 'img' and attrs.get('width') != '1' and attrs.get('height') != '1':
                if email_rendered:
                    classes = attrs.get('class', '').lower()
                    if any(mark in classes for mark in ('logo', 'social')) or attrs.get('alt', '').strip().lower() in ('outmax', 'хасл', 'telegram', 'vk', 'max'):
                        return
                source = attrs.get('data-email-src') or attrs.get('src', '')
                if not self.image:
                    self.image = source
                if email_rendered and attrs.get('alt') == 'Баннер рассылки':
                    self.banner = source

    parser = CoverParser()
    try:
        parser.feed(str(body or ''))
    except (ValueError, AssertionError):
        return ''
    source = parser.cover or parser.banner or parser.image
    if project_id and source in (assets or {}):
        return '/editor-api/email-projects/' + quote(str(project_id), safe='') + '/asset/' + quote(str(assets[source]), safe='')
    return safe_cover_url(source)


def email_cover(record):
    return (document_cover(record.get('canvasHtml', ''), record.get('assets', {}), record.get('id'))
            or document_cover(record.get('renderedHtml', ''), record.get('assets', {}), record.get('id'), email_rendered=True))


def site_cover(state, defaults=None):
    # Match the renderer: block settings override page settings and global defaults,
    # including an explicit empty value that removes the background.
    backgrounds = {**(defaults or {}), **state.get('heroBackgrounds', {})}
    layout = [item for item in state.get('layout', []) if isinstance(item, dict)]
    heroes = [item for item in layout if item.get('source') == 's0' or 'heroBackgrounds' in item]
    sources = [{**backgrounds, **item.get('heroBackgrounds', {})}.get('desktop') for item in heroes]
    if not layout:
        sources.append(backgrounds.get('desktop'))
    for source in sources:
        url = safe_cover_url(source, '/')
        if url:
            return url
    for item in state.get('layout', []):
        if isinstance(item, dict):
            background = safe_cover_url(item.get('blockBackgrounds', {}).get('desktop'), '/')
            if background:
                return background
            for key in ('heroBackgroundDesktop', 'backgroundImage', 'image'):
                url = safe_cover_url(item.get(key), '/')
                if url:
                    return url
    for value in state.get('images', {}).values():
        url = safe_cover_url(value, '/')
        if url:
            return url
    return ''
HOME_HTML = r'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Главная · OUTMAX / ХАСЛ</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap"><style>
*{box-sizing:border-box}body{margin:0;background:#f6f6f7;color:#242428;font:14px/1.55 "Open Sans",Arial,sans-serif}a{color:inherit}button,input{font:inherit}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #336be0;outline-offset:4px}aside{position:fixed;inset:0 auto 0 0;width:230px;padding:32px 22px;background:white;border-right:1px solid #e5e5e7}.brand{display:block;color:#d71920;font-weight:800;font-size:22px;text-decoration:none;letter-spacing:-.04em}.brand small{display:block;font-size:12px;font-weight:500;letter-spacing:0;color:#62626a;margin-top:3px}nav{display:grid;gap:8px;margin-top:45px}nav a{padding:12px 16px;text-decoration:none;border-radius:7px}nav a[aria-current]{background:#efeff1;font-weight:700}nav a:hover{background:#f5f5f6}.sidebar-foot{position:absolute;bottom:25px;left:38px;color:#62626a;font-size:12px}main{min-width:0;margin-left:230px;padding:30px clamp(24px,3vw,72px) 60px}.top{display:flex;justify-content:flex-end;align-items:center;gap:16px;min-height:36px;color:#62626a}.top a{font-size:13px}h1{font-size:34px;line-height:1.25;font-weight:600;letter-spacing:-.035em;margin:48px 0 12px}.intro{color:#62626a;font-size:16px;margin:0 0 36px}h2{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:0 0 20px}.tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-bottom:48px}.tool{display:flex;flex-direction:column;min-height:205px;text-decoration:none;background:#fff;border:1px solid #e0e0e4;border-radius:12px;padding:24px;transition:border-color .15s}.tool:hover{border-color:#8a8a94}.app-icon{width:56px;height:56px;border-radius:12px;display:grid;place-items:center;background:var(--tint);color:var(--ink);font-size:24px;font-weight:700;letter-spacing:-.04em}.tool h3{font-size:16px;margin:19px 0 6px}.tool p{color:#62626a;font-size:13px;margin:0}.tool small{margin-top:15px;color:#43434a}.recent-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:16px}.recent-head h2{margin:0}.recent-head input{width:270px;max-width:100%;background:white;border:1px solid #d5d5db;border-radius:6px;padding:10px 13px}#recent{background:white;border:1px solid #e0e0e4;border-radius:10px;overflow:hidden}.work{display:grid;grid-template-columns:44px minmax(0,1fr) 150px 135px;align-items:center;gap:18px;padding:18px 24px;text-decoration:none;border-bottom:1px solid #ededf0}.work:last-child{border:0}.work:hover{background:#fafafa}.work .app-icon{width:38px;height:40px;font-size:16px;border-radius:6px}.work strong{display:block;font-size:14px;font-weight:600;overflow-wrap:break-word}.work span,.work time{color:#62626a;font-size:12px}.empty{padding:36px;color:#62626a;margin:0}.error{color:#a72428}footer{margin-top:24px;color:#62626a;font-size:12px}@media(max-width:1100px){main{padding:24px 30px}.tools{grid-template-columns:repeat(2,minmax(0,1fr))}.work{grid-template-columns:40px minmax(0,1fr) 100px}.work>span{display:none}}@media(max-width:700px){aside{position:static;width:auto;padding:18px 22px;border-right:0;border-bottom:1px solid #e5e5e7;display:flex;justify-content:space-between;align-items:center}.brand{font-size:19px}.brand small,.sidebar-foot{display:none}nav{display:flex;margin:0;gap:0}nav a{padding:8px;font-size:12px}nav a:first-child{display:none}main{margin:0;padding:20px}h1{font-size:28px;margin-top:30px}.intro{font-size:14px}.tools{gap:12px;margin-bottom:34px}.tool{padding:18px;min-height:185px}.tool h3{font-size:14px}.recent-head{align-items:stretch;flex-direction:column;gap:12px}.recent-head input{width:100%;font-size:16px}.work{padding:16px;gap:12px;grid-template-columns:38px minmax(0,1fr)}.work time{grid-column:2}.top{justify-content:space-between}.empty{padding:24px}}
</style></head><body><aside><a class="brand" href="/">OUTMAX / ХАСЛ<small>Рабочее пространство</small></a><nav aria-label="Навигация"><a href="/" aria-current="page">Главная</a><a href="/instructions/">Инструкция</a><a href="/instructions/#developers">Разработчики</a></nav><span class="sidebar-foot">Создавайте. Продолжайте. Публикуйте.</span></aside><main><header class="top"><span id="profile">Ваше рабочее пространство</span><a href="/articles/">Профиль и настройки</a></header><h1>Что будем создавать?</h1><p class="intro">Все инструменты для вашего контента — в одном месте.</p><h2>Инструменты</h2><section class="tools" id="tools" aria-label="Инструменты"></section><section aria-labelledby="recent-title"><div class="recent-head"><h2 id="recent-title">Последние работы</h2><input id="search" type="search" placeholder="Найти работу" aria-label="Поиск последних работ"></div><p id="load-state" role="status">Загружаем ваши материалы…</p><div id="recent"></div></section><footer>Здесь показаны ваши сохранённые материалы. Несохранённая работа восстанавливается в своей вкладке инструмента.</footer></main><script src="/workspace.js"></script></body></html>'''

START_JS = r'''(()=>{'use strict';
const tools=[{key:'outmax',name:'Статьи',desc:'Материалы OUTMAX и ХАСЛ',url:'/articles/',mark:'Ot',ink:'#b41923',tint:'#fff0f0'}, {key:'hasl',name:'Статьи ХАСЛ',desc:'Истории и материалы магазина',url:'/hasl/',mark:'Хс',ink:'#86601c',tint:'#fff6db'}, {key:'email',name:'Email-редактор',desc:'Письма и рассылки',url:'/OUTMAX.html',mark:'Em',ink:'#6c37b3',tint:'#f4eaff'}, {key:'site',name:'Конструктор сайта',desc:'Страницы и шаблоны',url:'/site-builder/hasl/',mark:'Web',ink:'#2357bd',tint:'#ebf1ff'}];
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=t=>`<span class="app-icon" style="--ink:${t.ink};--tint:${t.tint}" aria-hidden="true">${t.mark}</span>`;
async function readyAdapter(){for(let i=0;i<600;i++){if(window.WorkspaceAdapter?.resume&&window.WorkspaceAdapter?.create)return window.WorkspaceAdapter;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Инструмент не загрузился. Обновите страницу и повторите.');}
async function api(path){const r=await fetch('/editor-api'+path,{cache:'no-store'});if(!r.ok){const error=new Error(r.status===403?'Доступ к инструменту закрыт':'Не удалось загрузить материалы');error.status=r.status;throw error;}return r.json();}
async function recent(t){const path=t.key==='email'?'/email-projects':t.key==='site'?'/site-builder/projects':'/drafts?brand='+t.key;const data=await api(path);return (Array.isArray(data)?data:data.items||[]).filter(x=>x.id!=='email-editor').map(x=>({id:x.id,title:x.fileName||x.subject||x.title||x.id,date:x.updated||x.savedAt||'',thumbnail:x.thumbnail||'',tool:t,url:t.url+'?'+(t.key==='site'?'page':t.key==='email'?'project':'article')+'='+encodeURIComponent(x.id)}));}
const dateLabel=x=>Number.isNaN(Date.parse(x.date))?'':new Date(x.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
const brandLabel=t=>({outmax:'OUTMAX',hasl:'ХАСЛ',email:'Email',site:'Сайт'}[t.key]);
function workCard(x){const url=/^(?:https?:\/\/|\/(?!\/))/i.test(x.thumbnail)?x.thumbnail:'';return `<a class="work" href="${E(x.url)}" title="${E(x.title)}"><div class="work-banner" style="--ink:${x.tool.ink};--tint:${x.tool.tint}"><div class="work-placeholder">${icon(x.tool)}<span>${brandLabel(x.tool)}</span></div>${url?`<img src="${E(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</div><div class="work-info"><strong>${E(x.title)}</strong><div class="work-meta"><span>${brandLabel(x.tool)}</span><time>${E(dateLabel(x))}</time></div></div></a>`;}
document.addEventListener('error',event=>{if(event.target.matches?.('.work-banner img'))event.target.remove();},true);
const home=!!document.getElementById('tools');
if(home){(async()=>{let user;try{user=await api('/me');document.getElementById('profile').textContent=user.name||user.login;}catch{document.getElementById('load-state').textContent='Не удалось загрузить профиль. Обновите страницу.';return;}const allowed=tools.filter(t=>t.key!=='email'||user.emailAccess);document.getElementById('tools').innerHTML=allowed.filter(t=>t.key!=='hasl').map(t=>`<a class="tool" href="${t.url}">${icon(t)}<h3>${t.name}</h3><p>${t.desc}</p><small>Открыть инструмент</small></a>`).join('');const results=await Promise.allSettled(allowed.map(recent));const works=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60);const status=document.getElementById('load-state');status.textContent=results.some(r=>r.status==='rejected')?'Часть инструментов недоступна. Обновите страницу, чтобы повторить загрузку.':'';function render(){const needle=document.getElementById('search').value.toLocaleLowerCase('ru');const list=works.filter(x=>(x.title+' '+x.tool.name).toLocaleLowerCase('ru').includes(needle));document.getElementById('recent').innerHTML=list.length?list.map(workCard).join(''):`<p class="empty">${needle?'Ничего не найдено. Попробуйте другое название.':'Здесь появятся ваши работы. Выберите инструмент и сохраните первый материал.'}</p>`;}document.getElementById('search').addEventListener('input',render);render();})();return;}
// Explicit document links and reloads keep their editor's existing recovery path.
const query=new URLSearchParams(location.search),reload=performance.getEntriesByType('navigation')[0]?.type==='reload';
const t=tools.find(t=>t.key==='hasl'&&location.pathname.startsWith('/hasl'))||tools.find(t=>t.key==='site'&&location.pathname.includes('site-builder'))||tools.find(t=>t.key==='email'&&(/email|OUTMAX/.test(location.pathname)))||tools[0];
const homeLink=document.createElement('a');homeLink.href='/';homeLink.textContent='Главная';homeLink.className='workspace-home';homeLink.style.cssText='display:inline-flex;align-items:center;min-height:32px;padding:6px 12px;color:inherit;text-decoration:none;font:13px Arial,sans-serif;border:1px solid #ddd;border-radius:6px;margin:6px';const header=document.querySelector('.topbar,.app-header,header');header?.append(homeLink);
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target==='_blank')return;
 const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname!=='/'||url.search||url.hash)return;
 event.preventDefault();if(link.dataset.leaving)return;link.dataset.leaving='1';
 try{if(!window.WorkspaceAdapter?.leave)throw Error('Инструмент ещё загружается. Повторите переход через несколько секунд.');await window.WorkspaceAdapter.leave();window.__WORKSPACE_LEAVING__=true;location.href=url.href;}
 catch(error){link.title=error.message;if(window.toast)window.toast(error.message,true);else if(window.notify)window.notify(error.message);else link.textContent=error.message;link.removeAttribute('data-leaving');}
});
if(reload||query.get('resume')==='1'||query.has('article')||query.has('page')||query.has('project'))return;
const style=document.createElement('style');style.textContent='.workspace-start{border:1px solid #dedee4;border-radius:16px;width:min(680px,calc(100% - 32px));max-height:85dvh;padding:32px;color:#242428;font:14px/1.5 "Open Sans",Arial,sans-serif}.workspace-start::backdrop{background:#1c202866}.workspace-start h2{font-size:26px;margin:0 0 8px}.workspace-start p{color:#62626a}.workspace-start .start-actions{display:flex;gap:12px;margin:24px 0}.workspace-start button,.workspace-start a{font:inherit}.workspace-start button{padding:10px 16px;border:1px solid #d4d4dc;border-radius:7px;background:white;cursor:pointer}.workspace-start .start-new{background:#26262c;color:white;border-color:#26262c}.workspace-start .start-list a{display:block;padding:13px 0;border-bottom:1px solid #eee;color:inherit;text-decoration:none}.workspace-start .start-list{max-height:32dvh;overflow:auto}.workspace-start :focus-visible{outline:3px solid #336be0;outline-offset:3px}@media(max-width:600px){.workspace-start{padding:24px}.workspace-start .start-actions{flex-wrap:wrap}}';style.textContent+=workCSS;document.head.append(style);
const d=document.createElement('dialog');d.className='workspace-start';d.id='workspace-start';d.setAttribute('aria-labelledby','workspace-start-title');d.innerHTML=`<h2 id="workspace-start-title">${['outmax','hasl'].includes(t.key)?'Статьи':t.name}</h2>${['outmax','hasl'].includes(t.key)?'<p>Выберите бренд: <a href="/articles/">OUTMAX</a> · <a href="/hasl/">ХАСЛ</a>. Сейчас открыт '+(t.key==='hasl'?'ХАСЛ':'OUTMAX')+'.</p>':''}<p>Начните новую работу или откройте один из последних материалов.</p><div class="start-actions"><button class="start-new" type="button">Создать новое</button><button class="start-continue" type="button">Продолжить работу</button><a href="/">На главную</a></div><h3>Последние работы</h3><div class="start-list" role="status">Загружаем…</div><p class="start-error" role="status"></p>`;document.body.append(d);d.showModal();
(['outmax','hasl'].includes(t.key)?Promise.all(tools.filter(x=>['outmax','hasl'].includes(x.key)).map(recent)).then(groups=>groups.flat().sort((a,b)=>b.date.localeCompare(a.date))):recent(t)).then(items=>{d.querySelector('.start-list').innerHTML=items.slice(0,8).map(workCard).join('')||'<p>Сохранённых материалов пока нет.</p>';}).catch(e=>{d.querySelector('.start-list').textContent=e.message+'. Повторите вход в инструмент.';});
d.querySelector('.start-continue').onclick=async()=>{const button=d.querySelector('.start-continue');button.disabled=true;button.textContent='Восстанавливаем…';try{const adapter=await readyAdapter();if(await adapter.resume()!==false)d.close();}catch(error){d.querySelector('.start-error').textContent=error.message;}finally{button.disabled=false;button.textContent='Продолжить работу';}};d.querySelector('.start-new').onclick=async()=>{const button=d.querySelector('.start-new');button.disabled=true;try{const adapter=await readyAdapter();await adapter.create();d.close();}catch(e){d.querySelector('.start-error').textContent=e.message;}finally{button.disabled=false;}};
})();'''


WORK_CSS = r"""
#recent{display:grid;grid-template-columns:repeat(auto-fill,minmax(max(280px,calc((100% - 110px)/6)),1fr));gap:22px;background:transparent;border:0;overflow:visible}.work{display:block;min-width:0;padding:0;border:1px solid #e0e1e6!important;border-radius:12px;background:white;overflow:hidden;text-decoration:none;color:#242428}.work:hover{border-color:#9a9eaa!important;background:white}.work-banner{aspect-ratio:16/9;position:relative;overflow:hidden;background:#f0f1f4}.work-banner>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}.work-placeholder{display:flex;align-items:center;justify-content:center;gap:12px;height:100%;background:var(--tint);color:var(--ink)}.work-placeholder .app-icon{width:auto;height:auto;background:transparent;font-size:28px}.work-placeholder>span{color:var(--ink);font-size:14px;font-weight:600}.work-info{padding:17px 18px 15px}.work strong{font:600 14px/1.5 "Open Sans",Arial,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:42px;overflow-wrap:break-word}.work-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}.work-meta span,.work-meta time{font-size:12px;color:#62626a}.workspace-start{width:min(1000px,calc(100% - 40px));padding:30px!important;outline:none;border:1px solid #e0e1e6!important;box-shadow:0 24px 70px #17213929}.workspace-start .start-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;max-height:48dvh;padding:2px 6px 4px 2px}.workspace-start .start-list .work{padding:0;border-bottom:1px solid #e0e1e6}.workspace-start .start-list .work-info{padding:13px 14px}.workspace-start .start-list .work-meta{margin-top:9px}.workspace-start .start-actions a{align-self:center;color:#404654}.workspace-start .start-new:disabled,.workspace-start .start-continue:disabled{opacity:.65;cursor:wait}.workspace-start .start-error:empty{display:none}@media(max-width:1100px){#recent{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.workspace-start{padding:22px!important}.workspace-start .start-list{grid-template-columns:repeat(2,minmax(0,1fr))}.work-info{padding:14px}.work-meta{flex-wrap:wrap;gap:5px}}@media(max-width:480px){#recent{gap:16px;grid-template-columns:1fr}.workspace-start{width:calc(100% - 24px)}.workspace-start .start-list{grid-template-columns:1fr;max-height:42dvh}.workspace-start h2{font-size:24px}.workspace-start .start-actions{gap:8px}}
"""
HOME_HTML = HOME_HTML.replace('</style>', WORK_CSS + '</style>', 1)
START_JS = START_JS.replace('const tools=', 'const workCSS=' + json.dumps(WORK_CSS) + ';const tools=', 1)
