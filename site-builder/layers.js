/* Selection and logical groups over the existing objects; no second document or undo. */
(() => {
  'use strict';
  const A=()=>ObjectStudio.bridge,B=()=>SiteBuilder,S=()=>B().current(),O=SiteObjects;
  let ids=new Set(),scope='',activeGroup=null,query='',collapsed=new Set(),marqueeMode=false,drag=null;
  let pageEpoch=-1,focusKey='',lastSelection='',seen=new Set(),treeDoc=null,treeDrag=null,keepPlace=false;
  const marqueeClicks=new WeakSet();
  const key=(section,id)=>section+'::'+id,frameFor=()=>A().frame||document.getElementById(A().device),sectionBy=id=>B().layout().find(s=>s.id===id);
  const find=(sid,id)=>A().nodeFor(id,frameFor(),sid);
  function expandPath(sid,id){const map=new Map(A().metadata(sid).map(n=>[n.id,n]));for(let n=map.get(id);n;n=map.get(n.parent))collapsed.delete(key(sid,n.id));}
  function repaintTree(restore=false){const el=document.getElementById('layer-tree');if(!el)return;const top=el.scrollTop,left=el.scrollLeft;el.innerHTML=tree();el.scrollTop=top;el.scrollLeft=left;if(restore)focusRow(focusKey);}
  function focusRow(k){const el=document.getElementById('layer-tree');if(!el)return;const row=[...el.querySelectorAll('[role=treeitem]')].find(n=>n.dataset.layerKey===k);if(row){for(const r of el.querySelectorAll('[role=treeitem]'))r.tabIndex=r===row?0:-1;focusKey=k;row.focus({preventScroll:true});row.scrollIntoView({block:'nearest',inline:'nearest'});}}
  const lockIcon='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  const layerIcon=path=>`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`,unlockIcon=layerIcon('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2.6"/>'),eyeIcon=layerIcon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),eyeOffIcon=layerIcon('<path d="m3 3 18 18M10.6 5.1A13 13 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 4M6.1 6.1A22 22 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5-1.1M10 10a3 3 0 0 0 4 4"/>'),renameIcon=layerIcon('<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>');
  const groups=()=>S()?.objectGroups||[],node=(id,frame)=>A().nodeFor(id,frame),patch=id=>{O.normalize(state,frameFor()?.contentDocument);return (S().objects||={})[id]||={};},value=id=>{const p=S()?.objects?.[id]||S()?.objects?.[node(id)?.dataset.objectLegacy]||{};return O.values(p,A().device,node(id));};
  const part=id=>patch(id)[A().device]||={},round=n=>Math.round(n*1000)/1000,clamp=(n,a=-10000,b=10000)=>Math.max(a,Math.min(b,n));
  function livePatch(id,n){const section=S();return (section.objects||={})[id]||=structuredClone(section.objects[n?.dataset.objectLegacy]||{});}
  function sync(){
    if(pageEpoch!==B().scope()){pageEpoch=B().scope();scope='';query='';collapsed=new Set();seen=new Set();lastSelection='';focusKey='';treeDoc=null;treeDrag=null;}
    const next=B().scope()+':'+S()?.id;
    if(scope!==next){scope=next;ids=new Set([A().selected]);activeGroup=null;}
    else if(!ids.has(A().selected)){ids=new Set([A().selected]);activeGroup=null;}
    if(activeGroup&&!groups().some(g=>g.id===activeGroup))activeGroup=null;
    if(!activeGroup)activeGroup=groups().find(g=>g.members.length===ids.size&&g.members.every(k=>ids.has(k)))?.id||null;
    const chosen=key(S()?.id,A().selected);if(lastSelection!==chosen){lastSelection=chosen;focusKey=chosen;expandPath(S()?.id,A().selected);}
  }
  function locked(n){if(!n)return false;const section=B().layout().find(s=>s.id===n.closest('[data-site-block]')?.dataset.siteBlock)||S();for(let p=n;p&&p.closest('[data-site-block]')===n.closest('[data-site-block]');p=p.parentElement){const id=p.dataset.siteObject;if((section?.objects?.[id]||section?.objects?.[p.dataset.objectLegacy])?.locked||(section?.objectGroups||[]).some(g=>g.locked&&(g.members.includes(id)||g.members.includes(p.dataset.objectLegacy))))return true;}return false;}
  function roots(){const all=[...ids].map(id=>node(id)).filter(Boolean);return all.filter(n=>!all.some(p=>p!==n&&p.contains(n)));}
  function usable(){const ns=roots();if(!ns.length||ns.length!==ids.size||ns.some(locked)){notify('Снимите блокировку или выберите доступные объекты.');return null;}return ns;}
  function choose(keys,group=null,d=A().device,sectionId,frameId){
    if(sectionId)B().select(sectionId);scope=B().scope()+':'+S()?.id;
    const frame=document.getElementById(frameId||(d===A().device?frameFor().id:d)),all=[...new Set(keys)].filter(k=>k!=='root').map(k=>node(k,frame)).filter(Boolean);
    ids=new Set(all.filter(n=>!all.some(p=>p!==n&&p.contains(n))).slice(0,200).map(n=>n.dataset.siteObject));
    if(group&&ids.size)for(const k of keys)if(!node(k,frame)&&ids.size<200)ids.add(k);
    activeGroup=group||groups().find(g=>g.members.length===ids.size&&g.members.every(k=>ids.has(k)))?.id||null;if(!ids.size)ids.add('root');
    focusKey=key(S()?.id,[...ids][0]);expandPath(S()?.id,[...ids][0]);A().select([...ids][0],d,sectionId,frame.id);
  }
  function chooseNode(n,frame,{toggle=false,individual=false}={}){const section=n.closest('[data-site-block]');if(!section)return;const id=n.dataset.siteObject;if(section.dataset.siteBlock!==S()?.id){B().select(section.dataset.siteBlock);ids=new Set();activeGroup=null;scope=B().scope()+':'+section.dataset.siteBlock;}
    const group=!individual&&groups().find(g=>g.members.some(k=>{const p=node(k,frame);return p&&(p===n||p.contains(n));}));
    if(group){const next=new Set([...ids].filter(k=>k!=='root'));if(toggle){const remove=group.members.every(k=>next.has(k));for(const k of group.members)remove?next.delete(k):next.add(k);choose([...next],null,(window.SiteLayout?.deviceFor(frame)||frame.id),undefined,frame.id);}else choose(group.members,group.id,(window.SiteLayout?.deviceFor(frame)||frame.id),undefined,frame.id);return;}
    if(toggle&&id!=='root'){const next=new Set([...ids].filter(k=>k!=='root'));if(next.has(id))next.delete(id);else next.add(id);choose([...next],null,(window.SiteLayout?.deviceFor(frame)||frame.id),undefined,frame.id);}
    else choose([id],null,(window.SiteLayout?.deviceFor(frame)||frame.id),undefined,frame.id);
  }
  function selectObject(n,frame,options){chooseNode(n,frame,options);return true;}
  function visibility(n,sid,d=A().device){
    if(!n)return {hidden:true,own:false,inherited:false};const section=sectionBy(sid),root=n.closest('[data-site-block]');
    const local=(el)=>{const p=section?.objects?.[el.dataset.siteObject]||{},v=d==='phone'?{...p.desktop,...p.phone}:p.desktop||{},c=el.ownerDocument.defaultView.getComputedStyle(el),isRoot=el===root;
      return v.visible===false||v.opacity===0||el.hidden||el.getAttribute('aria-hidden')==='true'||el.style.visibility==='hidden'||el.style.display==='none'||el.style.opacity!==''&&Number(el.style.opacity)===0||c.display==='none'||Number(c.opacity)===0||isRoot&&(['hidden',d==='phone'?'desktop':'phone'].includes(section?.visibility));};
    let inherited=false;for(let p=n.parentElement;p&&root?.contains(p);p=p.parentElement)if(local(p)){inherited=true;break;}
    const own=local(n)||!inherited&&n.ownerDocument.defaultView.getComputedStyle(n).visibility==='hidden';return {hidden:own||inherited,own,inherited};
  }
  function movementControls(){const list=A().metadata(),selected=[...ids].map(id=>node(id)).filter(Boolean),valid=list.filter(n=>!selected.some(p=>p.dataset.siteObject===n.id||p.contains(node(n.id))));
    return `<details class="layer-movement"><summary>Переместить слой / выделение</summary><label class="field"><span>Слой назначения в этой секции</span><select id="layer-destination">${valid.map(n=>`<option value="${E(n.id)}">${E(n.label)}</option>`).join('')}</select></label><label class="field"><span>Положение</span><select id="layer-placement"><option value="inside">Внутрь контейнера</option><option value="before">Перед слоем</option><option value="after">После слоя</option></select></label><label class="checkline"><input type="checkbox" id="layer-keep-position" ${keepPlace?'checked':''}>Сохранить координаты в видимых превью</label><button type="button" data-layer-action="move" ${ids.has('root')?'disabled':''}>Переместить</button><div class="row layer-order"><button type="button" data-layer-action="raise">Выше по дереву</button><button type="button" data-layer-action="lower">Ниже по дереву</button></div><p class="muted">Перетаскивайте строки: верх / середина / низ — перед / внутрь / после. Объекты переносятся между контейнерами одной секции; секции меняют порядок. Вложенность общая для компьютера и телефона.</p></details>`;
  }
  function panel(){sync();const group=groups().find(g=>g.id===activeGroup),name=group?.name||S()?.objects?.[A().selected]?.name||(A().selected==='root'?S()?.name:'')||'';
    return `<section class="layer-panel" aria-label="Слои страницы"><div class="row"><h3>Слои всей страницы</h3><span>${ids.size} выбрано</span></div><label class="field"><span>Найти слой</span><input id="layer-search" maxlength="200" value="${E(query)}" placeholder="Имя, текст или ID · все секции"></label><div class="layer-tree-actions"><button type="button" data-layer-action="expand-all">Развернуть всё</button><button type="button" data-layer-action="collapse-all">Свернуть всё</button><button type="button" data-layer-action="reveal">К выбранному</button></div><div class="layer-tree" id="layer-tree" role="tree" aria-label="Секции и объекты страницы" aria-multiselectable="true">${tree()}</div><div class="layer-actions"><button data-layer-action="lock">${group?.locked?'Разблокировать группу':'Блокировка'}</button></div><label class="field"><span>${activeGroup?'Название группы':A().selected==='root'?'Название секции':'Имя слоя'}</span><input id="layer-name" maxlength="120" value="${E(name)}" placeholder="Понятное имя"></label>${movementControls()}<p class="muted">Стрелки — по дереву; Enter — выбрать; F2 — имя; пробел — выделение; H — видимость; L — блокировка. Shift + щелчок — несколько объектов одной секции. Глаз относится к выбранному устройству. Пустое/прозрачное/скрытое содержимое также доступно в дереве.</p><p id="layer-feedback" class="muted" role="status" aria-live="polite"></p></section>`;
  }
  function tree(){
    treeDoc=frameFor()?.contentDocument;const q=query.trim().toLocaleLowerCase();let matches=0;
    const sections=B().layout().map(section=>{
      const list=A().metadata(section.id),map=new Map(list.map(n=>[n.id,n])),children=new Map(),matched=new Set();
      for(const n of list){if(!children.has(n.parent||''))children.set(n.parent||'',[]);children.get(n.parent||'').push(n);const k=key(section.id,n.id);if(!seen.has(k)){seen.add(k);if((n.id==='root'?section.id!==S()?.id:n.depth>=2&&n.container)&&!(section.id===S()?.id&&find(section.id,n.id)?.contains(find(section.id,A().selected))))collapsed.add(k);}}
      const mark=id=>{for(let n=map.get(id);n&&!matched.has(n.id);n=map.get(n.parent))matched.add(n.id);};
      if(q)for(const n of list)if((n.label+' '+(n.search||'')).toLocaleLowerCase().includes(q)){mark(n.id);matches++;}
      for(const g of section.objectGroups||[])if(q&&g.name.toLocaleLowerCase().includes(q))for(const id of g.members){mark(id);matches++;}
      const groupsHtml=()=> (section.objectGroups||[]).filter(g=>!q||g.name.toLocaleLowerCase().includes(q)||g.members.some(id=>matched.has(id))).map(g=>`<li role="none"><div class="layer-row layer-group-row${section.id===S()?.id&&activeGroup===g.id?' selected':''}" role="treeitem" aria-level="2" aria-label="Группа ${E(g.name)}" aria-selected="${section.id===S()?.id&&activeGroup===g.id}" tabindex="${focusKey===key(section.id,'group-'+g.id)?0:-1}" data-layer-key="${E(key(section.id,'group-'+g.id))}" data-layer-section="${E(section.id)}"><button tabindex="-1" class="layer-title" data-layer-group="${E(g.id)}" data-layer-section="${E(section.id)}">▣ ${E(g.name)} · ${g.members.length}</button><button tabindex="-1" data-layer-group-lock="${E(g.id)}" data-layer-section="${E(section.id)}" aria-label="${g.locked?'Разблокировать':'Заблокировать'} группу">${g.locked?lockIcon:unlockIcon}</button></div></li>`).join('');
      const row=n=>{if(q&&!matched.has(n.id))return '';const sub=children.get(n.id)||[],k=key(section.id,n.id),open=!!q||!collapsed.has(k),p=section.objects?.[n.id]||{},dom=find(section.id,n.id),isLocked=locked(dom),hidden=visibility(dom,section.id),picked=section.id===S()?.id&&ids.has(n.id),title=n.id==='root'?'Секция · '+n.label:n.label,branch=n.id==='root'&&(section.objectGroups||[]).length||sub.length;
        return `<li role="none"><div class="layer-row${picked?' selected':''}${hidden.hidden?' layer-hidden':''}" role="treeitem" tabindex="${focusKey===k?0:-1}" aria-level="${n.id==='root'?1:n.depth+2}" aria-selected="${picked}" ${branch?`aria-expanded="${open}"`:''} aria-label="${E(title+(hidden.inherited?' · скрыт родителем':hidden.hidden?' · скрыт':'')+(isLocked?' · заблокирован':''))}" data-layer-key="${E(k)}" data-layer-id="${E(n.id)}" data-layer-section="${E(section.id)}" draggable="true" style="--layer-depth:${Math.min(n.id==='root'?0:n.depth+1,4)}">${branch?`<button tabindex="-1" class="layer-disclosure" data-layer-fold="${E(n.id)}" data-layer-section="${E(section.id)}" aria-expanded="${open}" aria-label="${open?'Свернуть':'Развернуть'} ${E(n.label)}">${open?'▾':'▸'}</button>`:'<span class="layer-indent"></span>'}<input tabindex="-1" type="checkbox" data-layer-check="${E(n.id)}" data-layer-section="${E(section.id)}" aria-label="Выбрать ${E(n.label)}" ${picked?'checked':''} ${n.id==='root'?'disabled':''}><button tabindex="-1" class="layer-title" data-layer-select="${E(n.id)}" data-layer-section="${E(section.id)}" title="${E(title+' · '+n.id)}"><span class="layer-kind" aria-hidden="true">${n.id==='root'?'▣':n.container?'▱':'◇'}</span>${E(n.label)}</button><button tabindex="-1" data-layer-rename="${E(n.id)}" data-layer-section="${E(section.id)}" aria-label="Переименовать ${E(n.label)}" title="Переименовать · F2">${renameIcon}</button><button tabindex="-1" data-layer-lock="${E(n.id)}" data-layer-section="${E(section.id)}" aria-label="${p.locked?'Разблокировать':'Заблокировать'} ${E(n.label)}" title="${isLocked?'Блокировка (включая родителей/группу)':'Заблокировать'}">${isLocked?lockIcon:unlockIcon}</button><button tabindex="-1" data-layer-visible="${E(n.id)}" data-layer-section="${E(section.id)}" aria-label="${hidden.hidden?'Показать':'Скрыть'} ${E(n.label)}" title="${hidden.inherited?'Скрыт родительским контейнером':hidden.hidden?'Показать на выбранном устройстве':'Скрыть на выбранном устройстве'}">${hidden.hidden?eyeOffIcon:eyeIcon}</button></div>${branch&&open?`<ul role="group">${n.id==='root'?groupsHtml():''}${sub.map(row).join('')}</ul>`:''}</li>`;};
      if(!list.length)return q?'':`<li role="none"><div class="layer-row" role="treeitem" aria-level="1" aria-label="${E(section.name)} · предпросмотр загружается" data-layer-id="root" data-layer-section="${E(section.id)}"><button class="layer-title" data-layer-select="root" data-layer-section="${E(section.id)}">▣ ${E(section.name)} · загрузка…</button></div></li>`;
      return (children.get('')||[]).map(row).join('');
    }).join('');
    return `<ul role="group" class="layer-page-roots">${sections||'<li role="none" class="layer-empty">'+(q?'Слои не найдены. Попробуйте часть текста или ID.':'Предпросмотр загружается…')+'</li>'}</ul>${q?`<p class="layer-search-total" role="status">Найдено: ${matches}</p>`:''}`;
  }
  function paint(frame){const doc=frame.contentDocument;if(!doc?.head)return;let css=doc.querySelector('[data-layers-selection]');if(!css){css=doc.createElement('style');css.dataset.layersSelection='true';doc.head.append(css);}css.textContent=A().active?[...ids].map(id=>`.hasl-home-embed [data-site-block="${CSS.escape(S()?.id||'')}"]${id==='root'?'':' [data-site-object="'+CSS.escape(id)+'"]'}{outline:2px solid #496cf0!important;outline-offset:2px}`).join(''):'';
  }
  function bounds(ns){const rs=ns.map(n=>n.getBoundingClientRect()),left=Math.min(...rs.map(r=>r.left)),top=Math.min(...rs.map(r=>r.top)),right=Math.max(...rs.map(r=>r.right)),bottom=Math.max(...rs.map(r=>r.bottom));return {left,top,right,bottom,width:right-left,height:bottom-top,cx:(left+right)/2,cy:(top+bottom)/2};}
  let controlsSignature='';
  const selectionIcon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const selectionIcons={marquee:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5"/>',group:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h4v4H7Zm6 6h4v4h-4Z"/>',ungroup:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5"/><rect x="7" y="7" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/>',x:'<path d="M3 4v16m18-16v16M8 7v10m8-10v10M8 12h8m-8 0 2-2m-2 2 2 2m6-2-2-2m2 2-2 2"/>',y:'<path d="M4 3h16M4 21h16M7 8h10M7 16h10M12 8v8m0-8-2 2m2-2 2 2m-2 6-2-2m2 2 2-2"/>',settings:'<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',clear:'<path d="m6 6 12 12M6 18 18 6"/>'};
  function selectionControls(){
    const tools=document.querySelector('.studio-canvas-tools');if(!tools||tools.querySelector('.selection-bar'))return;
    const button=document.createElement('button');button.type='button';button.className='selection-marquee';button.dataset.layerAction='marquee';button.title='Выделить объекты рамкой';button.innerHTML=selectionIcon(selectionIcons.marquee)+'<span>Рамка</span>';tools.insertBefore(button,tools.querySelector('.designer-history'));
    const bar=document.createElement('div');bar.className='selection-bar';bar.hidden=true;bar.setAttribute('role','group');bar.setAttribute('aria-label','Множественное выделение');
    const action=(id,label,icon,title)=>`<button type="button" data-layer-action="${id}" ${id==='group'?'aria-keyshortcuts="Control+g Meta+g"':id==='ungroup'?'aria-keyshortcuts="Control+Shift+g Meta+Shift+g"':''} title="${title||label}">${selectionIcon(selectionIcons[icon])}<span>${label}</span></button>`;
    bar.innerHTML='<span class="selection-status" role="status" aria-live="polite"></span>'+action('group','Сгруппировать','group','Сгруппировать · Ctrl/⌘+G')+action('ungroup','Разгруппировать','ungroup','Разгруппировать · Ctrl/⌘+Shift+G')+action('gap-x','Равные X','x','Равные промежутки по горизонтали')+action('gap-y','Равные Y','y','Равные промежутки по вертикали')+`<details class="selection-settings"><summary>${selectionIcon(selectionIcons.settings)}<span>Параметры</span></summary><div><strong>Вся выбранная композиция</strong><div class="selection-inputs"><label>Сдвиг X, px<input id="selection-dx" type="number" min="-10000" max="10000" step="1" value="0"></label><label>Сдвиг Y, px<input id="selection-dy" type="number" min="-10000" max="10000" step="1" value="0"></label><label>Масштаб, %<input id="selection-scale" type="number" min="1" max="1000" step="1" value="100"></label></div>${action('transform','Применить ко всем','settings')}<label class="selection-gap-label">Промежуток, px<input id="selection-gap" type="number" min="0" max="10000" step="1" placeholder="Авто"></label><p>Пусто — равные промежутки между крайними объектами (от 3 объектов). Число — заданный промежуток от первого объекта (от 2). Затем нажмите «Равные X» или «Равные Y».</p><p>Масштабирование пропорциональное, от левого верхнего угла. Одна операция — один шаг отмены.</p></div></details>`+action('clear','Снять','clear','Снять выделение · Escape');tools.append(bar);
  }
  function updateControls(){
    selectionControls();const bar=document.querySelector('.selection-bar');if(!bar)return;document.querySelector('.selection-marquee').disabled=false;bar.hidden=!A().active||ids.size<2;
    const group=groups().find(g=>g.id===activeGroup),lockedSelection=roots().some(locked)||[...ids].some(k=>S().objects?.[k]?.locked)||!!group?.locked,missing=roots().length!==ids.size,signature=[scope,A().device,activeGroup,...ids].join('|');
    if(signature!==controlsSignature){controlsSignature=signature;for(const [id,v] of [['selection-dx','0'],['selection-dy','0'],['selection-scale','100'],['selection-gap','']])document.getElementById(id).value=v;bar.querySelector('details').open=false;}
    const text=(group?group.name+' · ':'')+ids.size+' '+(ids.size%10===1&&ids.size%100!==11?'объект':ids.size%10>=2&&ids.size%10<=4&&!(ids.size%100>=12&&ids.size%100<=14)?'объекта':'объектов'),status=bar.querySelector('.selection-status');if(status.textContent!==text)status.textContent=text;status.title=text;
    for(const b of document.querySelectorAll('[data-layer-action=marquee]'))b.setAttribute('aria-pressed',String(marqueeMode));
    for(const b of document.querySelectorAll('[data-layer-action=group]'))b.disabled=ids.size<2||!!group||lockedSelection||missing||ids.has('root');
    for(const b of document.querySelectorAll('[data-layer-action=ungroup]'))b.disabled=lockedSelection||!groups().some(g=>g.members.every(k=>ids.has(k)));
    const fixed=document.getElementById('selection-gap').value.trim()!=='';
    for(const b of bar.querySelectorAll('[data-layer-action]'))if(['gap-x','gap-y','transform'].includes(b.dataset.layerAction))b.disabled=lockedSelection||missing||ids.size<(b.dataset.layerAction==='transform'||fixed?2:3);
  }
  function refresh(){if(!S())return;if(document.getElementById('layer-tree')&&treeDoc!==frameFor()?.contentDocument)repaintTree();for(const id of ['desktop','phone']){const frame=document.getElementById(id),doc=frame.contentDocument;if(!doc)continue;paint(frame);const box=doc.querySelector('[data-layers-bounds]');if(!box)continue;const ns=[...ids].map(k=>node(k,frame)).filter(Boolean);box.hidden=!A().active||ids.size<2||frame!==frameFor()||ns.length!==ids.size;if(box.hidden)continue;const r=bounds(ns);box.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;box.querySelector('span').textContent=`${ids.size} объектов · ${Math.round(r.width)} × ${Math.round(r.height)}`;}}
  function afterRender(){if(!S()){ids=new Set();activeGroup=null;const bar=document.querySelector('.selection-bar');if(bar)bar.hidden=true;const frame=document.querySelector('.selection-marquee');if(frame)frame.disabled=true;return;}sync();const multi=ids.size>1,isLocked=roots().some(locked);const name=document.getElementById('layer-name');if(name)name.disabled=isLocked||multi&&!activeGroup;for(const button of document.querySelectorAll('[data-layer-action=move],[data-layer-action=raise],[data-layer-action=lower]'))button.disabled=isLocked||(button.dataset.layerAction==='move'&&ids.has('root'));for(const el of document.querySelectorAll('#inspector [data-object-prop],#inspector [data-object-attr],#inspector [data-object-text],#inspector [data-object-bg],#inspector [data-object-crop],#object-parent'))el.disabled=multi||isLocked;for(const el of document.querySelectorAll('.site-toolbox [data-object-quick],.site-toolbox [data-object-add],.site-toolbox [data-object-action],.object-context [data-object-action]'))if(isLocked&&el.dataset.objectAction!=='layers')el.disabled=true;updateControls();refresh();}
  function commit(){SiteDesigner.beginGesture();A().commit();}
  function groupSelection(){const ns=usable();if(!ns||ns.length<2||activeGroup||ns.some(n=>n.dataset.siteObject==='root'))return;const keys=ns.map(n=>n.dataset.siteObject),overlap=groups().filter(g=>g.members.some(k=>keys.includes(k)));if(overlap.some(g=>!g.members.every(k=>keys.includes(k)))){notify('Выберите группу целиком или сначала разгруппируйте её.');return;}const id=crypto.randomUUID(),name='Группа '+(groups().length+1);S().objectGroups=groups().filter(g=>!overlap.includes(g));S().objectGroups.push({id,name,members:keys});ids=new Set(keys);activeGroup=id;commit();}
  function ungroup(){const chosen=groups().filter(g=>g.members.every(k=>ids.has(k)));if(!chosen.length)return;if(roots().some(locked)||[...ids].some(k=>S().objects?.[k]?.locked)||chosen.some(g=>g.locked)){notify('Сначала разблокируйте группу или её участников.');return;}S().objectGroups=groups().filter(g=>!chosen.includes(g));activeGroup=null;commit();}
  function applyTransform(ns,dx,dy,angle=0,factor=1,flip=null,base=null){const r=base?.bounds||bounds(ns),origin=base?.origin||{x:r.cx,y:r.cy},rad=angle*Math.PI/180;
    const plans=ns.map(n=>{const id=n.dataset.siteObject,entry=base?.entries?.find(x=>x.id===id),v=entry?.value||structuredClone(value(id)),a=entry?.rect||n.getBoundingClientRect(),cx=a.left+a.width/2,cy=a.top+a.height/2,rx=(cx-origin.x)*(flip==='x'?-1:1)*factor,ry=(cy-origin.y)*(flip==='y'?-1:1)*factor,tx=origin.x+rx*Math.cos(rad)-ry*Math.sin(rad)+dx,ty=origin.y+rx*Math.sin(rad)+ry*Math.cos(rad)+dy,d=A().vector(n,tx-cx,ty-cy),c=n.ownerDocument.defaultView.getComputedStyle(n),p={x:round((v.x||0)+d.x),y:round((v.y||0)+d.y),position:v.position||(c.position==='static'?'relative':c.position)};
      if(c.display==='inline')p.display='inline-block';if(angle)p.rotation=((v.rotation??(parseFloat(c.rotate)||0))+angle)%360;if(factor!==1)p.scale=round((v.scale??100)*factor);if(flip)p[flip==='x'?'flipX':'flipY']=!v[flip==='x'?'flipX':'flipY'];return {n,id,p,tx,ty,previous:S().objects?.[id]===undefined?undefined:structuredClone(S().objects[id])};});
    const valid=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=10000&&Math.abs(p.y)<=10000&&(p.scale===undefined||p.scale>=1&&p.scale<=1000);
    if(plans.some(p=>!valid(p.p))){notify('Операция выходит за пределы координат ±10000 px или масштаба 1–1000%. Измените параметры.');return false;}
    for(const {id,n,p} of plans)Object.assign(livePatch(id,n)[A().device]||={},p);
    // CSS transform origins need not be centred. Correct the measured centres in
    // one read/write batch so scaling and rotation keep the whole composition.
    if(angle||factor!==1||flip){live(ns,false);const corrections=plans.map(p=>{const a=p.n.getBoundingClientRect(),d=A().vector(p.n,p.tx-a.left-a.width/2,p.ty-a.top-a.height/2);return {...p.p,x:round(p.p.x+d.x),y:round(p.p.y+d.y)};});
      if(corrections.some(p=>!valid(p))){for(const p of plans){if(p.previous===undefined)delete S().objects[p.id];else S().objects[p.id]=p.previous;}live(ns);notify('Не удалось сохранить общую геометрию в допустимых координатах.');return false;}
      plans.forEach((p,i)=>Object.assign(S().objects[p.id][A().device],corrections[i]));
    }live(ns);return true;
  }
  function transformSelection(){const ns=usable();if(!ns||ns.length<2)return;const fields=['selection-dx','selection-dy','selection-scale'].map(id=>document.getElementById(id));if(fields.some(n=>!n.value.trim()||!n.checkValidity())){fields.find(n=>!n.value.trim()||!n.checkValidity())?.reportValidity();notify('Укажите сдвиг и масштаб в допустимых пределах.');return;}const [dx,dy,scale]=fields.map(n=>Number(n.value));if(dx===0&&dy===0&&scale===100)return;const r=bounds(ns);if(applyTransform(ns,dx,dy,0,scale/100,null,{bounds:r,origin:{x:r.left,y:r.top}})){commit();fields[0].value=fields[1].value='0';fields[2].value='100';}}
  function distribute(axis){const ns=usable();if(!ns)return;const input=document.getElementById('selection-gap'),fixed=input.value.trim()!=='';if(!input.checkValidity()){input.reportValidity();return;}if(ns.length<(fixed?2:3)){notify(fixed?'Выберите хотя бы два объекта.':'Для автоматических промежутков выберите хотя бы три объекта.');return;}
    const start=axis==='x'?'left':'top',size=axis==='x'?'width':'height',end=axis==='x'?'right':'bottom',items=ns.map(n=>({n,r:n.getBoundingClientRect()})).sort((a,b)=>a.r[start]-b.r[start]);
    if(items.some(x=>!x.r.width||!x.r.height||visibility(x.n,S().id).hidden)){notify('Для распределения покажите все выбранные объекты на этом устройстве.');return;}
    const gap=fixed?Number(input.value):(items.at(-1).r[end]-items[0].r[start]-items.reduce((sum,x)=>sum+x.r[size],0))/(items.length-1);let next=items[0].r[start];
    const plans=items.map((entry,i)=>{const delta=!fixed&&(i===0||i===items.length-1)?0:next-entry.r[start];next+=entry.r[size]+gap;const v=value(entry.n.dataset.siteObject),d=A().vector(entry.n,axis==='x'?delta:0,axis==='y'?delta:0),c=entry.n.ownerDocument.defaultView.getComputedStyle(entry.n);return {id:entry.n.dataset.siteObject,n:entry.n,p:{x:round((v.x||0)+d.x),y:round((v.y||0)+d.y),position:v.position||(c.position==='static'?'relative':c.position),...(c.display==='inline'?{display:'inline-block'}:{})}};});
    if(plans.some(({p})=>Math.abs(p.x)>10000||Math.abs(p.y)>10000)){notify('Промежуток выводит объекты за пределы ±10000 px.');return;}
    for(const {id,n,p} of plans)Object.assign(livePatch(id,n)[A().device]||={},p);live(ns);commit();message('Промежуток '+axis.toUpperCase()+': '+round(gap)+' px'+(gap<0?' (объекты перекрываются)':''));
  }
  function live(ns,repaint=true){const doc=ns[0]?.ownerDocument;if(!doc)return;let sheet=doc.querySelector('[data-layers-live]');if(!sheet){sheet=doc.createElement('style');sheet.dataset.layersLive='true';doc.head.append(sheet);}sheet.textContent=ns.map(n=>`html .hasl-home-embed [data-site-block="${S().id}"] [data-site-object="${n.dataset.siteObject}"]{${O.css(value(n.dataset.siteObject))}}`).join('');if(repaint)refresh();}
  function bulkQuick(action){const ns=usable();if(!ns)return;const r=bounds(ns),parent=ns[0].parentElement.getBoundingClientRect();
    if(['left','right','top','bottom','center-x','center-y'].includes(action))applyTransform(ns,action==='left'?parent.left-r.left:action==='right'?parent.right-r.right:action==='center-x'?(parent.left+parent.right)/2-r.cx:0,action==='top'?parent.top-r.top:action==='bottom'?parent.bottom-r.bottom:action==='center-y'?(parent.top+parent.bottom)/2-r.cy:0);
    else if(action==='rotate-left'||action==='rotate-right')applyTransform(ns,0,0,action==='rotate-left'?-90:90);
    else if(action==='flip-x'||action==='flip-y')applyTransform(ns,0,0,0,1,action==='flip-x'?'x':'y');
    else if(action==='visible'){const show=ns.every(n=>value(n.dataset.siteObject).visible===false);for(const n of ns)part(n.dataset.siteObject).visible=show;}
    else if(action==='front'||action==='back')for(const n of ns){const v=value(n.dataset.siteObject),p=part(n.dataset.siteObject);p.position||='relative';p.z=clamp((v.z||0)+(action==='front'?1:-1),-1000,1000);}
    else if(action==='bold'||action==='italic'){if(ns.some(n=>!O.canText(n))){notify('Выберите только текстовые объекты.');return;}for(const n of ns){const c=n.ownerDocument.defaultView.getComputedStyle(n),s=part(n.dataset.siteObject).style||={};if(action==='bold')s.fontWeight=parseInt(c.fontWeight)>=600?400:700;else s.fontStyle=c.fontStyle==='italic'?'normal':'italic';}}
    else{notify('Для подробного оформления выберите один объект.');return;}commit();
  }
  function copyMany(){const ns=usable();if(!ns||ns.some(n=>n.dataset.siteObject==='root'))return;if((S().addedObjects?.length||0)+ns.length>200){notify('В секции допускается до 200 добавленных объектов.');return;}const keys=[];
    for(const n of ns){const id=crypto.randomUUID(),html=O.snapshot(n,id),parent=n.parentElement.closest('[data-site-object]');let i=0;for(const old of [n,...n.querySelectorAll('[data-site-object]')]){const p=S().objects?.[old.dataset.siteObject];if(p){const c=structuredClone(p);delete c.parent;delete c.before;delete c.deleted;(S().objects||={})['add-'+id+'-'+i]=c;}i++;}(S().addedObjects||=[]).push({id,parent:parent?.dataset.siteObject||'root',html});keys.push('add-'+id+'-0');}
    const id=crypto.randomUUID();(S().objectGroups||=[]).push({id,name:'Группа — копия',members:keys});ids=new Set(keys);activeGroup=id;A().select(keys[0]);commit();
  }
  function removeMany(){const ns=usable();if(!ns)return;for(const n of ns)patch(n.dataset.siteObject).deleted=true;S().objectGroups=groups().filter(g=>!g.members.some(k=>ids.has(k)));activeGroup=null;ids=new Set(['root']);A().select('root');commit();}
  function message(text){const el=document.getElementById('layer-feedback');if(el)el.textContent=text;notify(text);}
  function renameLayer(sid,id){const n=find(sid,id);if(!n)return;if(locked(n)){message('Снимите блокировку слоя, его родителя или группы.');return;}choose([id],null,A().device,sid);const input=document.getElementById('layer-name');input?.focus();input?.select();}
  function toggleVisible(sid,id){
    const n=find(sid,id),section=sectionBy(sid);if(!n||!section)return;if(locked(n)){message('Сначала снимите блокировку.');return;}
    const info=visibility(n,sid);if(info.hidden&&info.inherited&&!info.own){message('Слой скрыт родителем. Сначала покажите родительский контейнер.');return;}
    O.normalize(state,frameFor()?.contentDocument);const p=(section.objects||={})[id]||={},current=A().device,other=current==='phone'?'desktop':'phone',v=current==='phone'?{...p.desktop,...p.phone}:p.desktop||{},own=p[current]||={};
    const otherNode=A().nodeFor(id,document.getElementById(other),sid),otherHidden=visibility(otherNode,sid,other).own;
    if(p[other]?.visible===undefined)(p[other]||={}).visible=!otherHidden;
    if(info.hidden){
      if(id==='root'&&['hidden',current==='phone'?'desktop':'phone'].includes(section.visibility))section.visibility='all';
      if(id!=='root')p.reveal=true;own.visible=true;
      const css=n.ownerDocument.defaultView.getComputedStyle(n);if(v.opacity===0||Number(css.opacity)===0)own.opacity=1;
      if(css.display==='none'&&!n.hidden&&!n.hasAttribute('data-visibility')&&!n.hasAttribute('data-element-visibility')&&n.style.display!=='none')own.display='inline-block';
    }else own.visible=false;
    commit();
  }
  function prepareMove(keys,sid,targetId,where){
    const frame=frameFor();if(frame?.__haslDocState!==state||frame?.__haslDocScope!==B().scope())throw Error('Дождитесь обновления предпросмотра.');
    if(!['inside','before','after'].includes(where))throw Error('Выберите положение слоя.');
    const section=sectionBy(sid),target=find(sid,targetId),nodes=keys.map(id=>find(sid,id));
    if(!section||!target||!nodes.length||nodes.length!==keys.length||nodes.some(n=>!n||n.dataset.siteObject==='root'||section.objects?.[n.dataset.siteObject]?.deleted||locked(n)))throw Error('Выберите незаблокированные объекты одной секции.');
    const ns=nodes.filter(n=>!nodes.some(p=>p!==n&&p.contains(n))).sort((a,b)=>a.compareDocumentPosition(b)&4?-1:1);
    if(ns.length!==nodes.length)throw Error('Не выбирайте одновременно контейнер и его дочерний слой.');
    if(ns.some(n=>n===target||n.contains(target)))throw Error('Нельзя перенести слой в себя или своего потомка.');
    const parent=where==='inside'?target:target.parentElement,before=where==='before'?target:where==='after'?target.nextElementSibling:null;
    if(!parent?.dataset.siteObject||!O.containers.has(parent.tagName)||locked(parent)||ns.some(n=>!O.canContain(parent,n)))throw Error('Этот контейнер не подходит или заблокирован. Для списка и таблицы соблюдайте типы дочерних узлов; вложенные формы запрещены.');
    if(parent.closest('[data-site-block]')?.dataset.siteBlock!==sid)throw Error('Объекты переносятся между контейнерами одной секции.');
    if(before?.tagName==='SUMMARY'&&ns.some(n=>n.tagName!=='SUMMARY'))throw Error('Содержимое спойлера располагается после его заголовка.');
    return {section,ns,parent,before};
  }
  function moveLayers(keys,sid,targetId,where){
    try{
      const plan=prepareMove(keys,sid,targetId,where),orders=new Map(),geometry=new Map(),frame=frameFor();
      // Simulate only in the existing preview, then restore it before making one state transaction.
      const affected=new Set([plan.parent,...plan.ns.map(n=>n.parentElement)]),saved=plan.ns.map(n=>({n,parent:n.parentElement,next:n.nextSibling})),originalOrders=new Map([...affected].map(p=>[p,[...p.children].filter(n=>n.dataset.siteObject).map(n=>n.dataset.siteObject)]));
      for(const f of [frameFor(),document.getElementById('desktop'),document.getElementById('phone')]){
        const targetDevice=window.SiteLayout?.deviceFor(f)||f.id;if(geometry.has(targetDevice))continue;
        if(!keepPlace||!f.getClientRects().length||f.__haslDocState!==state||f.__haslDocScope!==B().scope())continue;
        const ns=plan.ns.map(n=>A().nodeFor(n.dataset.siteObject,f,sid)),target=A().nodeFor(targetId,f,sid);if(ns.some(n=>!n)||!target)throw Error('Дождитесь обновления обоих превью.');
        const parent=where==='inside'?target:target.parentElement,before=where==='before'?target:where==='after'?target.nextElementSibling:null,old=ns.map(n=>({n,parent:n.parentElement,next:n.nextSibling,rect:n.getBoundingClientRect(),value:structuredClone(O.values(plan.section.objects?.[n.dataset.siteObject],targetDevice,n))}));
        if(old.some(x=>!x.rect.width&&!x.rect.height))throw Error('Для сохранения координат сначала покажите слой в превью.');
        try{for(const n of ns)if(!O.place(parent,n,before))throw Error('Недопустимая вложенность в адаптивном превью.');const values=[];for(const x of old){const r=x.n.getBoundingClientRect(),d=A().vector(x.n,x.rect.left-r.left,x.rect.top-r.top),v={...x.value,x:round((x.value.x||0)+d.x),y:round((x.value.y||0)+d.y)};if(Math.abs(v.x)>10000||Math.abs(v.y)>10000)throw Error('Перенос выходит за пределы координат ±10 000 px.');if(x.n.ownerDocument.defaultView.getComputedStyle(x.n).display==='inline')v.display='inline-block';values.push([x.n.dataset.siteObject,v]);}geometry.set(targetDevice,values);}
        finally{for(const x of [...old].reverse())x.parent.insertBefore(x.n,x.next?.parentNode===x.parent?x.next:null);}
      }
      try{for(const n of plan.ns)O.place(plan.parent,n,plan.before);for(const parent of affected)orders.set(parent,[...parent.children].filter(n=>n.dataset.siteObject).map(n=>n.dataset.siteObject));}
      finally{for(const x of [...saved].reverse())x.parent.insertBefore(x.n,x.next?.parentNode===x.parent?x.next:null);}
      if(saved.every(x=>x.parent===plan.parent)&&[...orders].every(([p,order])=>JSON.stringify(order)===JSON.stringify(originalOrders.get(p)))){message('Слой уже находится в этом положении.');return;}
      if([...affected].some(p=>[...p.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())))throw Error('Контейнер содержит текст без отдельного слоя. Сначала оберните его в текстовый объект: перенос может изменить порядок текста.');
      const beforeState=JSON.stringify(plan.section),next=structuredClone(plan.section);O.normalize({layout:[next]},frame.contentDocument);next.objects||={};
      for(const n of plan.ns){const p=next.objects[n.dataset.siteObject]||={};p.parent=plan.parent.dataset.siteObject;delete p.before;}
      for(const order of orders.values())for(let i=0;i<order.length;i++){const p=next.objects[order[i]]||={};if(i+1<order.length)p.before=order[i+1];else delete p.before;}
      for(const [d,entries] of geometry)for(const [id,v] of entries)(next.objects[id]||={})[d]=v;
      // Validate the entire proposed project before exposing any intermediate autosave.
      const candidate={...state,layout:state.layout.map(s=>s===plan.section?next:s)};if(Object.keys(next.objects).length>2000)throw Error('В секции достигнут лимит 2000 правок объектов.');O.validate(candidate);
      if(beforeState===JSON.stringify(next)){message('Слой уже находится в этом положении.');return;}
      Object.assign(plan.section,next);B().select(sid);scope=B().scope()+':'+sid;ids=new Set(keys);activeGroup=null;expandPath(sid,plan.parent.dataset.siteObject);focusKey=key(sid,keys[0]);commit();updatePreviews();
    }catch(error){message(error.message);}
  }
  function moveSection(sid,targetId,where){
    if(sid===targetId)return;if(!['before','after'].includes(where)){message('Секции можно менять местами; вложить секцию в объект нельзя.');return;}
    const source=sectionBy(sid),target=sectionBy(targetId);if(!source||!target||locked(find(sid,'root'))){message('Сначала разблокируйте секцию.');return;}
    const next=state.layout.filter(s=>s!==source),at=next.indexOf(target);next.splice(at+(where==='after'?1:0),0,source);if(next.every((s,i)=>s===state.layout[i]))return;
    state.layout=next;choose(['root'],null,A().device,sid);commit();updatePreviews();
  }
  function reorder(direction){
    if(ids.has('root')){const i=state.layout.indexOf(S()),other=state.layout[i+direction];if(other)moveSection(S().id,other.id,direction<0?'before':'after');return;}
    const ns=roots();if(ns.length!==1){message('Для пошагового порядка выберите один слой. Для нескольких используйте перенос.');return;}const target=direction<0?ns[0].previousElementSibling:ns[0].nextElementSibling;if(target?.dataset.siteObject)moveLayers([...ids],S().id,target.dataset.siteObject,direction<0?'before':'after');
  }
  function handleAction(button,ev){const act=button.dataset.layerAction,id=button.dataset.layerSelect,sid=button.dataset.layerSection||S()?.id;
    if(act){
      if(act==='clear'){choose(['root']);return true;}
      if(act==='transform'){transformSelection();return true;}
      if(act==='gap-x'||act==='gap-y'){distribute(act==='gap-x'?'x':'y');return true;}
      if(act==='move'){moveLayers([...ids],S().id,document.getElementById('layer-destination')?.value,document.getElementById('layer-placement')?.value);return true;}
      if(act==='raise'||act==='lower'){reorder(act==='raise'?-1:1);return true;}
      if(act==='expand-all'){collapsed.clear();repaintTree();return true;}
      if(act==='collapse-all'){for(const section of B().layout())for(const n of A().metadata(section.id))if(n.container)collapsed.add(key(section.id,n.id));repaintTree();return true;}
      if(act==='reveal'){expandPath(S().id,A().selected);focusKey=key(S().id,A().selected);repaintTree(true);node(A().selected)?.scrollIntoView({block:'center'});return true;}
      if(act==='group')groupSelection();if(act==='ungroup')ungroup();if(act==='marquee'){marqueeMode=!marqueeMode;A().enableTools();A().select(A().selected);}if(act==='lock'){const g=groups().find(g=>g.id===activeGroup);if(g)g.locked=!g.locked;else{const lock=![...ids].every(k=>S().objects?.[k]?.locked);for(const k of ids)patch(k).locked=lock;}commit();}return true;
    }
    if(id){const n=find(sid,id);if(n){if(sid!==S()?.id)choose([id],null,A().device,sid);else chooseNode(n,frameFor(),{toggle:ev.shiftKey,individual:true});node(id)?.scrollIntoView({block:'center'});}return true;}
    if(button.dataset.layerRename){renameLayer(sid,button.dataset.layerRename);return true;}
    if(button.dataset.layerFold){const k=key(sid,button.dataset.layerFold);if(collapsed.has(k))collapsed.delete(k);else collapsed.add(k);focusKey=k;repaintTree(true);return true;}
    if(button.dataset.layerGroup){const g=sectionBy(sid)?.objectGroups?.find(g=>g.id===button.dataset.layerGroup);if(g)choose(g.members,g.id,A().device,sid);return true;}
    if(button.dataset.layerGroupLock){const g=sectionBy(sid)?.objectGroups?.find(g=>g.id===button.dataset.layerGroupLock);if(g){g.locked=!g.locked;commit();}return true;}
    if(button.dataset.layerLock){const section=sectionBy(sid);if(section){O.normalize(state,frameFor()?.contentDocument);const p=(section.objects||={})[button.dataset.layerLock]||={};p.locked=!p.locked;commit();}return true;}
    if(button.dataset.layerVisible){toggleVisible(sid,button.dataset.layerVisible);return true;}
    if(button.dataset.objectAction==='layers'){A().enableTools();A().select(A().selected);document.getElementById('layer-search')?.focus();return true;}
    const editing=button.dataset.objectQuick||button.dataset.objectAction||button.dataset.objectAdd;if(editing&&roots().some(locked)){notify('Объект заблокирован. Снимите блокировку в дереве слоёв.');return true;}
    if(ids.size>1){if(button.dataset.objectQuick==='geometry'){const details=document.querySelector('.selection-settings');if(details){details.open=true;document.getElementById('selection-dx')?.focus();}return true;}if(button.dataset.objectQuick){bulkQuick(button.dataset.objectQuick);return true;}if(button.dataset.objectAction==='copy'){copyMany();return true;}if(button.dataset.objectAction==='delete'){removeMany();return true;}if(button.dataset.objectAction&&!['activate','parent'].includes(button.dataset.objectAction)){notify('Для этого действия выберите один объект.');return true;}}
    return false;
  }
  function finish(cancel=false){const g=drag;if(!g)return false;drag=null;delete g.doc.documentElement.dataset.objectMoving;g.cleanup();g.guide?.destroy();g.box?.remove();if(g.scope!==scope||S()?.id!==g.section||g.state!==state||g.epoch!==B().scope())return true;
    if(g.kind==='marquee'){marqueeMode=false;marqueeClicks.add(g.doc);if(!cancel){choose([...g.add,...g.keys]);}else{render();refresh();}return true;}
    if(cancel){for(const e of g.entries){if(e.previous===undefined)delete S().objects?.[e.id];else (S().objects||={})[e.id]=e.previous;}if(!g.hadObjects&&!Object.keys(S().objects||{}).length)delete S().objects;g.doc.querySelector('[data-layers-live]')?.remove();if(g.dirty&&B().isDirty())B().markChanged({normalize:false});updatePreviews();}
    else if(g.moved&&JSON.stringify(state)!==g.snapshot)commit();else if(g.dirty&&B().isDirty())B().markChanged({normalize:false});return true;
  }
    function begin(ev,frame,ns,kind){if(ev.button!==0)return;ev.preventDefault();ev.stopImmediatePropagation();if(drag||!ns.length||ns.some(locked))return;clearTimeout(previewTimer);frame.contentWindow.focus();ns[0].tabIndex=-1;ns[0].focus({preventScroll:true});SiteDesigner.beginGesture();const r=bounds(ns),doc=frame.contentDocument,target=ev.target;
    const g={kind,scope,state,epoch:B().scope(),snapshot:JSON.stringify(state),doc,hadObjects:!!S().objects,section:S().id,entries:ns.map(n=>({id:n.dataset.siteObject,node:n,previous:S().objects?.[n.dataset.siteObject]===undefined?undefined:structuredClone(S().objects[n.dataset.siteObject]),value:structuredClone(value(n.dataset.siteObject)),rect:n.getBoundingClientRect()})),bounds:r,origin:kind==='resize'?{x:r.left,y:r.top}:null,last:ev,x:ev.clientX,y:ev.clientY,angle:Math.atan2(ev.clientY-r.cy,ev.clientX-r.cx),pointer:ev.pointerId,dirty:B().isDirty(),moved:false};drag=g;clearTimeout(saveTimer);if(kind==='move')g.guide=SiteGuides?.create(frame,ns[0],ns,()=>bounds(ns));
    const move=e=>{if(e.pointerId!==g.pointer||g.scope!==scope||S()?.id!==g.section)return;g.last=e;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.moved&&Math.hypot(dx,dy)*(frame.getBoundingClientRect().width/frame.clientWidth||1)<4)return;clearTimeout(saveTimer);if(kind==='move')doc.documentElement.dataset.objectMoving='true';g.moved=true;
      for(const entry of g.entries){if(entry.previous===undefined)delete S().objects?.[entry.id];else (S().objects||={})[entry.id]=structuredClone(entry.previous);}
      if(kind==='resize'){const min=Math.max(...g.entries.map(e=>1/(e.value.scale||100))),max=Math.min(...g.entries.map(e=>1000/(e.value.scale||100))),factor=clamp(1+(dx*r.width+dy*r.height)/Math.max(1,r.width*r.width+r.height*r.height),min,max);applyTransform(ns,0,0,0,factor,null,g);}
      else if(kind==='rotate'){let angle=(Math.atan2(e.clientY-r.cy,e.clientX-r.cx)-g.angle)*180/Math.PI;if(e.shiftKey)angle=Math.round(angle/15)*15;applyTransform(ns,0,0,angle,1,null,g);}
      else{applyTransform(ns,dx,dy,0,1,null,g);let hits={};if(g.guide&&!e.ctrlKey&&!e.metaKey){const snap=g.guide.snap(bounds(ns),{gap:document.getElementById('object-snap')?.getAttribute('aria-pressed')==='true'?Number(document.getElementById('object-snap-gap')?.value||0):0});if(document.getElementById('object-snap')?.getAttribute('aria-pressed')==='true'){applyTransform(ns,snap.x,snap.y);hits=snap.hits;}}g.guide?.draw({alt:e.altKey,x:e.clientX,y:e.clientY,hits});}
    };
    const end=e=>{if(e.pointerId===g.pointer)finish(false);},cancel=e=>{if(!e.pointerId||e.pointerId===g.pointer)finish(true);},key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}else if(e.key==='Alt'||e.key==='Control'||e.key==='Meta')g.guide?.draw({alt:e.altKey,x:g.last.clientX,y:g.last.clientY});};
    g.cleanup=()=>{doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',end,true);doc.removeEventListener('pointercancel',cancel,true);target.removeEventListener('lostpointercapture',cancel);doc.removeEventListener('keydown',key,true);doc.removeEventListener('keyup',key,true);frame.contentWindow.removeEventListener('blur',cancel);if(target.hasPointerCapture?.(g.pointer))target.releasePointerCapture(g.pointer);};
    target.setPointerCapture?.(g.pointer);target.addEventListener('lostpointercapture',cancel);doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerup',end,true);doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('keydown',key,true);doc.addEventListener('keyup',key,true);frame.contentWindow.addEventListener('blur',cancel);
  }
  function marquee(ev,frame,section){ev.preventDefault();ev.stopImmediatePropagation();frame.contentWindow.focus();section.tabIndex=-1;section.focus({preventScroll:true});const add=ev.shiftKey&&section.dataset.siteBlock===S()?.id?[...ids].filter(k=>k!=='root'):[],device=(window.SiteLayout?.deviceFor(frame)||frame.id);if(section.dataset.siteBlock!==S()?.id||(device!==A().device||frame!==frameFor()))choose(add.length?add:['root'],null,device,section.dataset.siteBlock,frame.id);scope=B().scope()+':'+S().id;
    const doc=frame.contentDocument,target=ev.target,box=doc.createElement('div');box.dataset.layerMarquee='true';box.style.cssText='position:fixed;border:1px solid #496cf0;background:#496cf022;pointer-events:none;z-index:2147483300';doc.body.append(box);const g={kind:'marquee',scope,state,doc,epoch:B().scope(),add,section:S().id,x:ev.clientX,y:ev.clientY,pointer:ev.pointerId,box,keys:[]};drag=g;
    const move=e=>{if(e.pointerId!==g.pointer||g.state!==state||g.epoch!==B().scope())return;const left=Math.min(g.x,e.clientX),top=Math.min(g.y,e.clientY),right=Math.max(g.x,e.clientX),bottom=Math.max(g.y,e.clientY);Object.assign(box.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});const hits=[...section.querySelectorAll('[data-site-object]')].filter(n=>{const r=n.getBoundingClientRect();return !locked(n)&&!visibility(n,S().id,(window.SiteLayout?.deviceFor(frame)||frame.id)).hidden&&r.width>0&&r.height>0&&r.left>=left&&r.top>=top&&r.right<=right&&r.bottom<=bottom;});g.keys=hits.filter(n=>!hits.some(p=>p!==n&&p.contains(n))).slice(0,200).map(n=>n.dataset.siteObject);};
    const up=e=>{if(e.pointerId===g.pointer)finish(false);},cancel=()=>finish(true),key=e=>{if(e.key==='Escape'){e.preventDefault();finish(true);}};g.cleanup=()=>{doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',cancel,true);target.removeEventListener('lostpointercapture',cancel);doc.removeEventListener('keydown',key,true);doc.removeEventListener('keyup',key,true);frame.contentWindow.removeEventListener('blur',cancel);if(target.hasPointerCapture?.(g.pointer))target.releasePointerCapture(g.pointer);};target.setPointerCapture?.(g.pointer);target.addEventListener('lostpointercapture',cancel);doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('keydown',key,true);doc.addEventListener('keyup',key,true);frame.contentWindow.addEventListener('blur',cancel);
  }
  function bindPreview(frame){const doc=frame.contentDocument,box=doc.createElement('div');box.dataset.layersBounds='true';box.hidden=true;box.innerHTML='<span></span><button data-layer-handle="resize" aria-label="Масштабировать выделение"></button><button data-layer-handle="rotate" aria-label="Повернуть выделение"></button>';doc.body.append(box);const style=doc.createElement('style');style.textContent='[data-layers-bounds]{position:fixed;border:1px solid #496cf0;pointer-events:none;z-index:2147483200;box-sizing:border-box}[data-layers-bounds][hidden]{display:none}[data-layers-bounds]>span{position:absolute;bottom:100%;background:#3456ce;color:#fff;font:12px Arial;white-space:nowrap;padding:5px}[data-layer-handle]{position:absolute;width:24px;height:24px;pointer-events:auto;background:#3456ce;border:2px solid white;border-radius:50%;padding:0}[data-layer-handle=resize]{bottom:-12px;right:-12px;cursor:nwse-resize}[data-layer-handle=rotate]{top:-36px;left:50%;cursor:grab}';doc.head.append(style);
    doc.addEventListener('pointerdown',ev=>{marqueeClicks.delete(doc);if(!A().active||ev.target.closest?.('[contenteditable=true],[contenteditable=plaintext-only]'))return;sync();const section=ev.target.closest?.('[data-site-block]'),n=ev.target.closest?.('[data-site-object]'),handle=ev.target.closest?.('[data-layer-handle]');
      if(handle){begin(ev,frame,usable()||[],handle.dataset.layerHandle);return;}
      if(!section||!n)return;if(marqueeMode||n.dataset.siteObject==='root'&&ev.target===n){marquee(ev,frame,section);return;}
      if(ev.shiftKey){frame.contentWindow.focus();ev.preventDefault();ev.stopImmediatePropagation();chooseNode(n,frame,{toggle:true});return;}
      if(locked(n)){frame.contentWindow.focus();ev.preventDefault();ev.stopImmediatePropagation();chooseNode(n,frame,{individual:true});return;}
      if(ev.ctrlKey||ev.metaKey){chooseNode(n,frame,{individual:true});begin(ev,frame,[n],'move');return;}
      const sid=section.dataset.siteBlock,device=(window.SiteLayout?.deviceFor(frame)||frame.id),inside=S()?.id===sid&&[...ids].some(id=>{const p=A().nodeFor(id,frame,sid);return p&&(p===n||p.contains(n));}),group=(sectionBy(sid)?.objectGroups||[]).find(g=>g.members.some(id=>{const p=A().nodeFor(id,frame,sid);return p&&(p===n||p.contains(n));}));
      if(group&&!inside)choose(group.members,group.id,device,sid,frame.id);else if(inside&&(device!==A().device||frame!==frameFor()))choose([...ids],activeGroup,device,sid,frame.id);
      if(ids.size>1&&(inside||group)){begin(ev,frame,usable()||[],'move');}
    },true);
    doc.addEventListener('click',ev=>{if(marqueeClicks.has(doc)){marqueeClicks.delete(doc);ev.preventDefault();ev.stopImmediatePropagation();return;}if(A().active&&(ev.shiftKey||ev.ctrlKey||ev.metaKey||ids.size>1||locked(ev.target.closest?.('[data-site-object]')))){ev.preventDefault();ev.stopImmediatePropagation();}},true);
    doc.addEventListener('dblclick',ev=>{const n=ev.target.closest?.('[data-site-object]');if(n&&locked(n)){ev.preventDefault();ev.stopImmediatePropagation();}},true);
    for(const kind of ['paste','cut','drop'])doc.addEventListener(kind,ev=>{if(A().active&&locked(ev.target.closest?.('[data-site-object]'))){ev.preventDefault();ev.stopImmediatePropagation();}},true);
    doc.addEventListener('beforeinput',ev=>{if(locked(ev.target.closest?.('[data-site-object]'))){ev.preventDefault();ev.stopImmediatePropagation();}},true);
    doc.addEventListener('keydown',selectionKeys,true);doc.addEventListener('scroll',refresh,true);refresh();
  }
  function selectionKeys(ev){if(!A().active||ev.isComposing||ev.target.closest?.('input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]'))return;
    if(ev.key==='Escape'&&!drag&&ids.size>1&&!document.querySelector('dialog[open],.topbar details[open],.selection-settings[open],.studio-screen-settings[open],.studio-object-more[open],.studio-nav-more[open]')){ev.preventDefault();ev.stopImmediatePropagation();choose(['root']);return;}
    if((ev.ctrlKey||ev.metaKey)&&ev.code==='KeyG'&&ids.size>1){ev.preventDefault();ev.stopImmediatePropagation();ev.shiftKey?ungroup():groupSelection();return;}
    if(ev.currentTarget===document)return;
    if(roots().some(locked)&&['Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){ev.preventDefault();ev.stopImmediatePropagation();return;}if(ids.size<2)return;
    if(['Delete','Backspace'].includes(ev.key)){ev.preventDefault();ev.stopImmediatePropagation();removeMany();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)&&!ev.ctrlKey&&!ev.metaKey){ev.preventDefault();ev.stopImmediatePropagation();const ns=usable();if(!ns)return;const step=ev.shiftKey?10:1;if(applyTransform(ns,ev.key==='ArrowLeft'?-step:ev.key==='ArrowRight'?step:0,ev.key==='ArrowUp'?-step:ev.key==='ArrowDown'?step:0))commit();}
  }
  document.addEventListener('keydown',selectionKeys,true);
  document.addEventListener('input',ev=>{if(ev.target.id==='selection-gap')updateControls();});
  document.addEventListener('input',ev=>{if(ev.target.id==='layer-search'){query=ev.target.value;repaintTree();return;}if(ev.target.id==='layer-name'){const name=ev.target.value.slice(0,120),g=groups().find(g=>g.id===activeGroup);if(g){if(g.locked)return;g.name=name||'Группа';}else{if(roots().some(locked))return;patch(A().selected).name=name;if(A().selected==='root')S().name=name||'Секция';}B().markChanged();repaintTree();}},true);
  document.addEventListener('change',ev=>{if(ev.target.dataset.layerCheck){const sid=ev.target.dataset.layerSection||S()?.id,n=find(sid,ev.target.dataset.layerCheck);if(n){if(sid!==S()?.id)choose([n.dataset.siteObject],null,A().device,sid);else chooseNode(n,frameFor(),{toggle:true,individual:true});}}});
  document.addEventListener('change',ev=>{if(ev.target.id==='layer-keep-position')keepPlace=ev.target.checked;});
  document.addEventListener('dblclick',ev=>{const row=ev.target.closest('#layer-tree [data-layer-id]');if(row){ev.preventDefault();renameLayer(row.dataset.layerSection,row.dataset.layerId);}});
  document.addEventListener('click',ev=>{const row=ev.target.closest('#layer-tree [data-layer-id]');if(row&&!ev.target.closest('button,input'))handleAction({dataset:{layerSelect:row.dataset.layerId,layerSection:row.dataset.layerSection}},ev);});
  document.addEventListener('keydown',ev=>{
    const row=ev.target.closest('#layer-tree [role=treeitem]');if(!row||ev.isComposing||ev.ctrlKey||ev.metaKey||ev.altKey)return;
    const sid=row.dataset.layerSection,id=row.dataset.layerId,k=row.dataset.layerKey,rows=[...document.querySelectorAll('#layer-tree [role=treeitem]')],at=rows.indexOf(row),level=Number(row.getAttribute('aria-level')),groupButton=row.querySelector('[data-layer-group]');
    const activate=()=>groupButton?handleAction(groupButton,ev):handleAction({dataset:{layerSelect:id,layerSection:sid}},ev);
    if(['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight','Enter',' ','F2'].includes(ev.key)||['KeyH','KeyL'].includes(ev.code))ev.preventDefault();else return;
    if(ev.key==='ArrowDown'||ev.key==='ArrowUp')focusRow(rows[Math.max(0,Math.min(rows.length-1,at+(ev.key==='ArrowDown'?1:-1)))]?.dataset.layerKey);
    else if(ev.key==='Home'||ev.key==='End')focusRow(rows[ev.key==='Home'?0:rows.length-1]?.dataset.layerKey);
    else if(ev.key==='ArrowRight'){if(row.getAttribute('aria-expanded')==='false'){collapsed.delete(k);focusKey=k;repaintTree(true);}else if(Number(rows[at+1]?.getAttribute('aria-level'))>level)focusRow(rows[at+1].dataset.layerKey);}
    else if(ev.key==='ArrowLeft'){if(row.getAttribute('aria-expanded')==='true'&&!query.trim()){collapsed.add(k);focusKey=k;repaintTree(true);}else{const parent=rows.slice(0,at).reverse().find(n=>Number(n.getAttribute('aria-level'))<level);if(parent)focusRow(parent.dataset.layerKey);}}
    else if(ev.key==='Enter'){activate();focusRow(k);}
    else if(ev.key===' '){if(groupButton){activate();}else{const n=find(sid,id);if(n){if(sid!==S()?.id)choose([id],null,A().device,sid);else chooseNode(n,frameFor(),{toggle:id!=='root',individual:true});}}focusRow(k);}
    else if(ev.key==='F2'){if(groupButton){activate();document.getElementById('layer-name')?.focus();}else renameLayer(sid,id);}
    else if(id&&ev.code==='KeyH'){toggleVisible(sid,id);focusRow(k);}
    else if(id&&ev.code==='KeyL'){handleAction({dataset:{layerLock:id,layerSection:sid}},ev);focusRow(k);}
  });
  function clearDrop(){for(const n of document.querySelectorAll('[data-layer-drop]'))delete n.dataset.layerDrop;}
  function dropPlan(ev,row){
    const r=row.getBoundingClientRect(),ratio=(ev.clientY-r.top)/Math.max(1,r.height),sid=row.dataset.layerSection,id=row.dataset.layerId,n=find(sid,id);
    let where=treeDrag?.keys.includes('root')?(ratio<.5?'before':'after'):n&&O.containers.has(n.tagName)?ratio<.25?'before':ratio>.75?'after':'inside':ratio<.5?'before':'after';
    return {sid,id,where};
  }
  document.addEventListener('dragstart',ev=>{
    const row=ev.target.closest('#layer-tree [data-layer-id]');if(!row)return;
    const sid=row.dataset.layerSection,id=row.dataset.layerId,n=find(sid,id),section=sectionBy(sid);if(!n||locked(n)||frameFor()?.__haslDocState!==state){ev.preventDefault();return;}
    const keys=sid===S()?.id&&ids.has(id)?[...ids]:[id];if(keys.map(k=>find(sid,k)).some(n=>!n||locked(n))){ev.preventDefault();return;}
    treeDrag={sid,keys,epoch:B().scope(),state,doc:frameFor().contentDocument,section:JSON.stringify(section)};ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('application/x-hasl-layer','internal');
  });
  document.addEventListener('dragover',ev=>{
    const row=ev.target.closest('#layer-tree [data-layer-id]');if(!row||!treeDrag)return;ev.preventDefault();clearDrop();
    const p=dropPlan(ev,row);let valid=true;try{if(treeDrag.keys.includes('root')){if(p.id!=='root')throw Error();}else{if(p.sid!==treeDrag.sid)throw Error();prepareMove(treeDrag.keys,p.sid,p.id,p.where);}}catch{valid=false;}
    row.dataset.layerDrop=valid?p.where:'invalid';ev.dataTransfer.dropEffect=valid?'move':'none';
  });
  document.addEventListener('drop',ev=>{
    const row=ev.target.closest('#layer-tree');if(!row)return;ev.preventDefault();const target=ev.target.closest('[data-layer-id]'),g=treeDrag;treeDrag=null;clearDrop();if(!target||!g)return;
    if(g.epoch!==B().scope()||g.state!==state||g.doc!==frameFor()?.contentDocument||g.section!==JSON.stringify(sectionBy(g.sid))){message('Документ изменился во время перетаскивания. Повторите перенос.');return;}
    const r=target.getBoundingClientRect(),p=dropPlan(ev,target);if(g.keys.includes('root')){if(p.id==='root')moveSection(g.sid,p.sid,ev.clientY<r.top+r.height/2?'before':'after');else message('Перенесите секцию перед или после другой секции.');}
    else if(p.sid!==g.sid)message('Объекты переносятся между контейнерами одной секции. Между секциями переносите всю секцию.');else moveLayers(g.keys,g.sid,p.id,p.where);
  });
  document.addEventListener('dragend',()=>{treeDrag=null;clearDrop();});
  document.addEventListener('input',ev=>{if((ev.target.matches('[data-object-prop],[data-object-attr],[data-object-bg],[data-object-text],[data-object-crop]'))&&(ids.size>1||roots().some(locked))){ev.stopImmediatePropagation();notify('Для изменения выберите один незаблокированный объект.');}},true);
  const button=document.createElement('button');button.type='button';button.dataset.objectAction='layers';button.innerHTML=ObjectStudio.bridge?'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4m-18 5 9 4 9-4"/></svg> Слои':'';document.querySelector('.site-toolbox-heading').prepend(button);
  window.SiteLayers={panel,afterRender,bindPreview,selectObject,handleAction,refresh,locked,move:moveLayers,cancelGesture:()=>finish(true),get multiple(){return ids.size>1;},get gesturing(){return !!drag&&drag.kind!=='marquee';},get gestureSnapshot(){return drag?.snapshot;}};
})();
