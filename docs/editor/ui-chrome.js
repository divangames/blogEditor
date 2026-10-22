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
 const fields=[['keywords','Поисковые запросы — по одному на строку'],['audience','Аудитория'],['points','Тезисы и требования'],['questions','Вопросы читателя'],['sources','Источники и ссылки']];
 const read=()=>email?(window.emailImportState?.editorBrief||{}):articleBrief;
 const panel=document.createElement('div');panel.id='workspace-brief';panel.className='workspace-brief';panel.innerHTML='<button type="button" id="workspace-brief-edit" aria-haspopup="dialog">'+(email?'ТЗ письма':'ТЗ статьи')+'</button><span data-brief-preview class="workspace-brief-status"></span>';document.querySelector('.main-head')?.after(panel);
 const dialog=document.createElement('dialog');dialog.id='workspace-brief-dialog';dialog.className='workspace-report';dialog.setAttribute('aria-labelledby','workspace-brief-title');dialog.innerHTML='<form><header><h2 id="workspace-brief-title">ТЗ и источники</h2><button type="button" data-cancel aria-label="Закрыть">×</button></header><p>Рабочие заметки сохраняются с материалом и его историей. В опубликованный HTML и письмо они не попадают.</p><div data-fields></div><p data-status role="status"></p><div class="workspace-report-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Применить</button></div></form>';
 for(const [key,label] of fields){const node=document.createElement('label'),input=document.createElement('textarea');node.textContent=label;input.name=key;input.rows=3;input.maxLength=20000;node.append(input);dialog.querySelector('[data-fields]').append(node);}
 document.body.append(dialog);const open=panel.querySelector('button');let stamp='';
 function render(){const values=read(),count=fields.filter(([key])=>values[key]?.trim()).length;panel.querySelector('[data-brief-preview]').textContent=count?'ТЗ заполнено':'ТЗ не заполнено';window.WordstatSeo?.refreshEditor?.();}
 open.onclick=()=>{stamp=EditorQuality.signature();for(const [key] of fields)dialog.querySelector('[name='+key+']').value=read()[key]||'';dialog.querySelector('[data-status]').textContent='';dialog.showModal();};
 dialog.querySelectorAll('[data-cancel]').forEach(n=>n.onclick=()=>dialog.close());dialog.addEventListener('close',()=>open.focus({preventScroll:true}));
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(stamp!==EditorQuality.signature()){dialog.querySelector('[data-status]').textContent='Материал изменился. Закройте окно и откройте ТЗ заново.';return;}
  const value=Object.fromEntries(fields.map(([key])=>[key,dialog.querySelector('[name='+key+']').value]));if(fields.every(([key])=>value[key]===(read()[key]||''))){dialog.close();return;}
  if(email){flushEmailHistorySnapshot();window.emailImportState={...window.emailImportState,editorBrief:value};changed();}else{captureArticleHistorySnapshot();articleBrief=value;changed();}render();dialog.close();
 };
 root.addEventListener('editor:body-replaced',render);document.addEventListener('email-editor-change',render);render();commands.register({id:'document.brief',label:'ТЗ и источники',run:()=>open.click()});
})();
/* Global SEO policy is separate from the document brief and its undo history. */
(()=>{
 const panel=document.getElementById('workspace-brief');if(!panel)return;
 const open=document.createElement('button');open.type='button';open.id='workspace-general-brief';open.textContent='Общее ТЗ';open.setAttribute('aria-haspopup','dialog');panel.querySelector('#workspace-brief-edit').after(open);
 const section=document.createElement('dialog');section.id='workspace-seo-requirements';section.className='workspace-report';section.setAttribute('aria-labelledby','workspace-policy-title');section.innerHTML='<header><h2 id="workspace-policy-title">Общее ТЗ: требования для SEO</h2><button type="button" data-policy-close aria-label="Закрыть общее ТЗ">×</button></header><p>Памятка исполнителю, версия 2.2. Общая для редакции; в экспорт не попадает.</p><pre class="workspace-policy-text" data-policy-text></pre><button type="button" data-policy-edit hidden>Изменить общие требования</button><p data-policy-status role="status"></p>';document.body.append(section);
 const dialog=document.createElement('dialog');dialog.id='seo-requirements-dialog';dialog.className='workspace-report';dialog.innerHTML='<form><header><h2>Общие требования для SEO</h2><button type="button" data-cancel aria-label="Закрыть">×</button></header><p>Изменение действует для всех пользователей. Редактировать могут администратор и модератор.</p><label>Требования<textarea name="requirements" rows="16" maxlength="20000" style="width:100%"></textarea></label><p role="status" data-status></p><div class="workspace-report-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Сохранить требования</button></div></form>';document.body.append(dialog);
 let current=null;
 async function request(data){const response=await fetch('/editor-api/seo-requirements',{credentials:'same-origin',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Не удалось загрузить требования');return result;}
 function render(data){current=data;section.querySelector('[data-policy-text]').textContent=data.text;section.querySelector('[data-policy-edit]').hidden=!data.canEdit;}
 request().then(render).catch(error=>section.querySelector('[data-policy-status]').textContent=error.message);
 open.onclick=async()=>{section.showModal();section.querySelector('[data-policy-status]').textContent='Загружаем требования…';try{render(await request());section.querySelector('[data-policy-status]').textContent='';}catch(error){section.querySelector('[data-policy-status]').textContent=error.message;}};
 section.querySelector('[data-policy-close]').onclick=()=>section.close();section.addEventListener('close',()=>open.focus({preventScroll:true}));
 section.querySelector('[data-policy-edit]').onclick=async()=>{if(!current?.canEdit)return;try{render(await request());if(!current.canEdit)return;dialog.querySelector('textarea').value=current.text;dialog.querySelector('[data-status]').textContent='';section.close();dialog.showModal();}catch(error){section.querySelector('[data-policy-status]').textContent=error.message;}};
 dialog.addEventListener('close',()=>{if(!section.open)section.showModal();});
 dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>dialog.close());
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{const data=await request({text:dialog.querySelector('textarea').value,expectedRevision:current.revision});render(data);dialog.close();}catch(error){dialog.querySelector('[data-status]').textContent=error.message;}finally{button.disabled=false;}};
})();
/* Plain-text alternative over emailProjectBridge and the existing email history. */
(()=>{
 if(!window.EmailCommands||!window.EditorQuality)return;
 function generate(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  function walk(node){
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue.replace(/\s+/g,' ');
   if(node.nodeType!==Node.ELEMENT_NODE)return '';
   const tag=node.tagName;if(/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|HEAD)$/.test(tag)||node.hidden||node.getAttribute('aria-hidden')==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.getAttribute('style')||''))return '';
   if(tag==='BR')return '\n';if(tag==='IMG')return node.getAttribute('alt')||'';
   let value=[...node.childNodes].map(walk).join('');
   if(tag==='A'){const href=node.getAttribute('href')||'';if(href&&!href.startsWith('#'))value=(value.trim()||href)+(value.trim()===href||!value.trim()?'':' <'+href+'>');}
   if(/^(P|DIV|SECTION|HEADER|FOOTER|ARTICLE|H[1-6]|UL|OL|TABLE|TR|BLOCKQUOTE)$/.test(tag))return '\n'+value+'\n';
   if(tag==='A')return value+' ';
   if(tag==='LI')return '\n• '+value;
   if(/^(TD|TH)$/.test(tag)&&node.nextElementSibling?.matches('td,th')&&!node.querySelector('table'))return value+' | ';
   return value;
  }
  return walk(doc.body).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 const stored=()=>window.emailImportState?.textAlternative;
 const value=(html=emailDocument(activeSite))=>stored()?.mode==='custom'?String(stored().text||''):generate(html);
 const markers=text=>{const decoded=text.replace(/%5b%25[\s\S]*?%25%5d/gi,token=>{try{return decodeURIComponent(token);}catch{return token;}});return [...new Set([...decoded.matchAll(/\[%[^%\]]+%\]/g)].map(m=>m[0]))];};
 function checks(html){const text=value(html),expected=generate(html),missing=markers(expected).filter(m=>!markers(text).includes(m));const target=EditorQuality.field('#email-plaintext-open',null,'editor');const result=[{level:missing.length||!text.trim()?'error':'pass',title:'Текстовая версия письма',detail:missing.length?'Не хватает служебных переменных: '+missing.join(', '):text.trim()?'Текстовая часть заполнена; служебные переменные сохранены.':'Текстовая часть пуста.',targets:[target]}];
  if(stored()?.mode==='custom'){
   const stale=stored().baseText!==generate(emailDocument(activeSite));const urls=[...new Set(expected.match(/(?:https?:\/\/|mailto:|tel:)[^\s<>]+/g)||[])],lost=urls.filter(url=>!text.includes(url));result.push({level:stale||lost.length?'warn':'pass',title:'Актуальность текстовой версии',detail:stale?'HTML или ссылки изменились после ручной правки. Обновите текстовую версию.':lost.length?'В ручном тексте отсутствуют адреса из итогового HTML: '+lost.length+'. Проверьте ссылки и UTM.':'Ручная текстовая версия соответствует исходному содержанию и содержит адреса итогового HTML.',targets:[target]});
  }return result;
 }
 window.EmailPlainText={generate,value,checks};
 const open=document.createElement('button');open.id='email-plaintext-open';open.type='button';open.className='email-command-icon';open.title='Текстовая версия письма';open.setAttribute('aria-label',open.title);open.setAttribute('aria-haspopup','dialog');open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14M12 4v16M8 20h8M4 9h3m10 0h3"/></svg>';document.querySelector('#editor-toolbar').append(open);
 const dialog=document.createElement('dialog');dialog.id='email-plaintext-dialog';dialog.className='workspace-report';dialog.setAttribute('aria-labelledby','email-plaintext-title');dialog.innerHTML='<form><header><h2 id="email-plaintext-title">Текстовая версия письма</h2><button type="button" data-cancel aria-label="Закрыть">×</button></header><p>Автоматическая версия включает текст, подписи фото и адреса ссылок итогового письма. Ручная версия сохраняется в проекте и передаётся в текстовую часть через NotiSend.</p><p data-mode></p><label>Текст письма<textarea rows="14" maxlength="200000" name="text"></textarea></label><div class="workspace-report-actions"><button type="button" data-auto>Собрать из HTML</button><button type="button" data-download>Скачать TXT</button><button type="button" data-copy>Копировать текст</button></div><p data-status role="status"></p><div class="workspace-report-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Применить</button></div></form>';document.body.append(dialog);
 const input=dialog.querySelector('textarea'),status=dialog.querySelector('[data-status]');let stamp='',mode='auto',baseText='';
 const updateMode=()=>dialog.querySelector('[data-mode]').textContent=mode==='custom'?'Ручная версия: после изменения письма проверьте её снова.':'Автоматическая версия: обновляется при изменении письма.';
 open.onclick=()=>{stamp=EditorQuality.signature();baseText=generate(emailDocument(activeSite));mode=stored()?.mode==='custom'?'custom':'auto';input.value=value();status.textContent=htmlDirty?'Сначала примените изменения HTML, затем откройте текстовую версию заново.':'';updateMode();dialog.showModal();};
 input.oninput=()=>{mode='custom';updateMode();};dialog.querySelector('[data-auto]').onclick=()=>{mode='auto';input.value=baseText;updateMode();status.textContent='Версия собрана. Нажмите «Применить», чтобы включить автоматическое обновление.';};
 dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>dialog.close());dialog.addEventListener('close',()=>open.focus({preventScroll:true}));
 dialog.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(input.value);status.textContent='Текст скопирован.';}catch{input.focus();input.select();status.textContent='Выделен текст. Нажмите Ctrl+C или Cmd+C.';}};
 dialog.querySelector('[data-download]').onclick=()=>{const url=URL.createObjectURL(new Blob([input.value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(document.getElementById('filename').value.replace(/[^\p{L}\p{N}_-]/gu,'-')||'rassylka')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(stamp!==EditorQuality.signature()||htmlDirty){status.textContent='Письмо или HTML изменились. Закройте окно, примените HTML при необходимости и откройте версию заново.';return;}
  if(mode==='custom'&&!input.value.trim()){status.textContent='Заполните текст или соберите автоматическую версию из HTML.';return;}
  const next=mode==='custom'?{mode,text:input.value,baseText}:undefined;if(JSON.stringify(next)===JSON.stringify(stored())){dialog.close();return;}
  flushEmailHistorySnapshot();window.emailImportState={...window.emailImportState};if(next)window.emailImportState.textAlternative=next;else delete window.emailImportState.textAlternative;changed();dialog.close();
 };
 EmailCommands.register({id:'document.plaintext',label:'Текстовая версия письма',run:()=>open.click()});
})();
/* Constructor entry is resolved against server permissions on every page load. */
(()=>{
 const menus=document.querySelectorAll('.editor-switcher-menu');if(!menus.length)return;
 fetch('/editor-api/me').then(r=>r.ok?r.json():null).then(user=>{
  if(!user?.siteAccess)return;
  menus.forEach(menu=>{if(menu.querySelector('[data-site-menu]'))return;const group=document.createElement('details');group.dataset.siteMenu='';group.className='site-switcher-group';group.innerHTML='<summary>Конструктор сайтов</summary><a href="/site-builder/hasl/" target="_blank" rel="noopener"><strong>ХАСЛ</strong><small>Страницы, блоки и экспорт HTML</small></a><a href="/site-builder/outmax/" target="_blank" rel="noopener"><strong>OUTMAX</strong><small>Пока в работе</small></a>';menu.append(group);});
 }).catch(()=>{});
})();
