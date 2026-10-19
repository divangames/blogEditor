// Shared menu and keyboard behavior; no dependencies or document-content writes.
(()=>{
 const root=document.documentElement;
 root.dataset.uiInput='keyboard';
 document.addEventListener('pointerdown',()=>{root.dataset.uiInput='pointer';},true);
 document.addEventListener('keydown',event=>{
  root.dataset.uiInput='keyboard';
  if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
  const open=[...document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]')];
  if(!open.length)return;
  open.forEach(menu=>{menu.open=false;});
  open.at(-1).querySelector('summary')?.focus({preventScroll:true});
 },true);
 document.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]').forEach(menu=>{
   if(!menu.contains(event.target))menu.open=false;
  });
 });
 document.addEventListener('toggle',event=>{
  const menu=event.target;
  if(!(menu instanceof Element)||!menu.matches('.editor-switcher,.account-menu,.document-info')||!menu.open)return;
  document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]').forEach(other=>{if(other!==menu)other.open=false;});
 },true);
})();
/* Mobile entry into the existing focus command; never changes document/history. */
(()=>{
 const email=!!window.EmailCommands,commands=email?window.EmailCommands:window.ArticleCommands;
 const canvas=document.getElementById('canvas');
 if(!commands||!canvas||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const button=document.createElement('button');button.id='mobile-writing-toggle';button.type='button';button.className='mobile-writing-toggle';
 const active=()=>document.body.classList.contains(email?'email-focus':'article-focus');
 function update(){button.textContent=active()?'К инструментам':'К тексту';button.setAttribute('aria-pressed',String(active()));}
 button.addEventListener('mousedown',event=>event.preventDefault());
 button.onclick=()=>{
  const bookmark=email?emailSelectionBookmark():articleSelectionBookmark(),enter=!active();
  if(enter){if(email)document.querySelector('.tab[data-view="editor"]')?.click();else setTab('editor');}
  commands.execute('view.focus',email?{}:{value:enter});
  if(enter){if(email)restoreEmailSelection(bookmark);else restoreArticleSelection(bookmark);canvas.focus({preventScroll:true});canvas.scrollIntoView({block:'start',behavior:'auto'});}
  else {const sidebar=document.querySelector('.sidebar');sidebar?.scrollIntoView({block:'start',behavior:'auto'});sidebar?.querySelector('input,button,summary')?.focus({preventScroll:true});}
  update();
 };
 new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class']});update();document.body.append(button);
})();
/* Read-only link inventory, sharing the quality inspector's stale/location guards. */
(()=>{
 const email=!!window.EmailCommands,commands=email?window.EmailCommands:window.ArticleCommands,root=document.getElementById('canvas');
 if(!commands||!root||!window.EditorQuality||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const toolbar=document.querySelector(email?'#editor-toolbar':'.toolstrip');
 const text=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
 function report({id,title,help,command,icon,collect}){
  const open=document.createElement('button');open.type='button';open.id=id+'-open';open.className=email?'email-command-icon':'article-tool-icon';open.title=title;open.setAttribute('aria-label',title);open.setAttribute('aria-haspopup','dialog');open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon+'</svg>';toolbar.insertBefore(open,toolbar.querySelector('.editor-canvas-help'));
  const dialog=document.createElement('dialog');dialog.id=id+'-dialog';dialog.className='workspace-report';dialog.setAttribute('aria-labelledby',id+'-title');
  dialog.innerHTML='<header><h2 id="'+id+'-title"></h2><button type="button" data-close aria-label="Закрыть">×</button></header><p data-help></p><label>Поиск по списку<input type="search" autocomplete="off"></label><div class="workspace-report-actions"><button type="button" data-refresh>Обновить список</button><span data-count role="status"></span></div><div data-list></div><p data-status role="status"></p>';
  dialog.querySelector('h2').textContent=title;dialog.querySelector('[data-help]').textContent=help;document.body.append(dialog);
  let entries=[],stamp='';const search=dialog.querySelector('input'),list=dialog.querySelector('[data-list]'),status=dialog.querySelector('[data-status]');
  function draw(){list.replaceChildren();const query=search.value.trim().toLocaleLowerCase(),filtered=entries.filter(item=>(item.label+' '+item.detail).toLocaleLowerCase().includes(query));dialog.querySelector('[data-count]').textContent='Найдено: '+filtered.length+' из '+entries.length;
   for(const item of filtered){const row=document.createElement('article'),label=document.createElement('strong'),detail=document.createElement('p'),go=document.createElement('button');row.className='workspace-report-row';label.textContent=item.label;detail.textContent=item.detail;go.type='button';go.textContent='Показать место';go.disabled=!item.target?.node;go.title=item.target?.reason||'';go.onclick=()=>{try{EditorQuality.validate(item.target,stamp);dialog.close();EditorQuality.jump(item.target,stamp);}catch(error){status.textContent=error.message;}};row.append(label,detail,go);list.append(row);}
  }
  function refresh(){stamp=EditorQuality.signature();status.textContent='';entries=collect();draw();if(email&&htmlDirty)status.textContent='В HTML есть неприменённые изменения. Список построен по текущему письму; примените HTML и обновите список.';}
  open.onclick=()=>{search.value='';refresh();dialog.showModal();search.focus();};search.oninput=draw;dialog.querySelector('[data-refresh]').onclick=refresh;dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>open.focus({preventScroll:true}));commands.register({id:command,label:title,run:()=>open.click()});return {open,dialog};
 }
 window.EditorWorkspaceTools={report};
 report({id:'workspace-links',title:'Ссылки материала',command:'document.links',icon:'<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',help:email?'Ссылки итогового HTML, включая шапку и подвал. Проверка локальная; доступность сайтов не проверяется.':'Ссылки холста: подписи, адреса, UTM и внутренние якоря. Проверка локальная; доступность сайтов не проверяется.',collect:()=>{
  const container=email?new DOMParser().parseFromString(emailDocument(activeSite),'text/html').body:root;
  const nodes=[...container.querySelectorAll('a[href]')];const ids=[...container.querySelectorAll('[id],a[name]')];
  return nodes.map(node=>{const href=node.getAttribute('href')||'',label=text(node)||node.querySelector('img')?.alt||'Без подписи';let detail=href||'Пустой адрес';
   if(href.startsWith('#')){let id;try{id=decodeURIComponent(href.slice(1));}catch{id=href.slice(1);}const targets=ids.filter(n=>n.id===id||n.getAttribute('name')===id);detail+=' · '+(targets.length===1?'Якорь найден':targets.length?'Повторяющийся якорь':'Якорь не найден');}
   else {try{const url=new URL(href,location.origin);const utm=[...url.searchParams].filter(([key])=>/^utm_/i.test(key));if(utm.length)detail+=' · UTM: '+utm.map(([key,value])=>key+'='+value).join(', ');}catch{detail+=' · Проверьте адрес';}}
   return {label,detail,target:email?EditorQuality.emailTargets([node],'a')[0]:EditorQuality.bodyTarget(node)};
  });
 }});
})();
/* All article headings, independent of template sections and authored anchor IDs. */
(()=>{
 if(!window.ArticleCommands||window.EmailCommands||!window.EditorWorkspaceTools||window.__ARTICLE_WORKFLOW_DISABLED__)return;
 const root=document.getElementById('canvas');
 EditorWorkspaceTools.report({id:'workspace-outline',title:'Все заголовки H2/H3',command:'document.outline',icon:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',help:'Все H2 и H3 в порядке статьи, включая заголовки вне шаблонных разделов. Переход не создаёт якоря и не меняет содержание.',collect:()=>[...root.querySelectorAll('h2,h3')].map(node=>({label:(node.textContent||'').trim()||'Пустой заголовок',detail:node.tagName+(node.id?' · #'+node.id:''),target:EditorQuality.bodyTarget(node)}))});
})();
/* Working brief stored with the existing article snapshot / email import state. */
(()=>{
 const email=!!window.EmailCommands,commands=email?window.EmailCommands:window.ArticleCommands,root=document.getElementById('canvas');
 if(!commands||!root||!window.EditorQuality||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const fields=[['audience','Аудитория'],['points','Тезисы и требования'],['questions','Вопросы читателя'],['sources','Источники и ссылки']];
 const read=()=>email?(window.emailImportState?.editorBrief||{}):articleBrief;
 const panel=document.createElement('details');panel.id='workspace-brief';panel.className='workspace-brief';panel.innerHTML='<summary>ТЗ и источники</summary><div data-brief-preview></div><button type="button" id="workspace-brief-edit">Изменить ТЗ</button>';document.querySelector('.main-head')?.after(panel);
 const dialog=document.createElement('dialog');dialog.id='workspace-brief-dialog';dialog.className='workspace-report';dialog.setAttribute('aria-labelledby','workspace-brief-title');dialog.innerHTML='<form><header><h2 id="workspace-brief-title">ТЗ и источники</h2><button type="button" data-cancel aria-label="Закрыть">×</button></header><p>Рабочие заметки сохраняются с материалом и его историей. В опубликованный HTML и письмо они не попадают.</p><div data-fields></div><p data-status role="status"></p><div class="workspace-report-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Применить</button></div></form>';
 for(const [key,label] of fields){const node=document.createElement('label'),input=document.createElement('textarea');node.textContent=label;input.name=key;input.rows=3;input.maxLength=20000;node.append(input);dialog.querySelector('[data-fields]').append(node);}
 document.body.append(dialog);const open=panel.querySelector('button');let stamp='';
 function render(){const values=read(),preview=panel.querySelector('[data-brief-preview]');preview.replaceChildren();for(const [key,label] of fields)if(values[key]){const heading=document.createElement('strong'),body=document.createElement('p');heading.textContent=label;body.textContent=values[key];preview.append(heading,body);}if(!preview.children.length)preview.textContent='Добавьте аудиторию, требования, вопросы и источники.';}
 open.onclick=()=>{stamp=EditorQuality.signature();for(const [key] of fields)dialog.querySelector('[name='+key+']').value=read()[key]||'';dialog.querySelector('[data-status]').textContent='';dialog.showModal();};
 dialog.querySelectorAll('[data-cancel]').forEach(n=>n.onclick=()=>dialog.close());dialog.addEventListener('close',()=>open.focus({preventScroll:true}));
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(stamp!==EditorQuality.signature()){dialog.querySelector('[data-status]').textContent='Материал изменился. Закройте окно и откройте ТЗ заново.';return;}
  const value=Object.fromEntries(fields.map(([key])=>[key,dialog.querySelector('[name='+key+']').value]));if(fields.every(([key])=>value[key]===(read()[key]||''))){dialog.close();return;}
  if(email){flushEmailHistorySnapshot();window.emailImportState={...window.emailImportState,editorBrief:value};changed();}else{captureArticleHistorySnapshot();articleBrief=value;changed();}render();dialog.close();
 };
 root.addEventListener('editor:body-replaced',render);document.addEventListener('email-editor-change',render);render();commands.register({id:'document.brief',label:'ТЗ и источники',run:()=>{panel.open=true;open.click();}});
})();
