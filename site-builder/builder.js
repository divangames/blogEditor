/* Server project adapter and block inspector for the existing HASL constructor. */
(() => {
  'use strict';
  let projectId=null,revision=0,dirty=false,blocked=false,pending=null,epoch=0,selected=null,user=null,accountStamp='';
  accountStamp=document.querySelector('meta[name="editor-account-context"]')?.content||'';
  let pages=[],users=[],loadTicket=0,switching=false,failedSave=null,recoveryAttempt=null,workspaceReady=false;
  let resolveWorkspaceReady,workspaceBootError;const workspaceReadyPromise=new Promise(resolve=>{resolveWorkspaceReady=resolve;});
  const awaitWorkspace=async()=>{await workspaceReadyPromise;if(workspaceBootError)throw workspaceBootError;};
  window.WorkspaceAdapter={create:async()=>{await awaitWorkspace();return createBlank();},resume:async()=>{await awaitWorkspace();return true;},leave:async()=>{await awaitWorkspace();if(!checkpoint())throw Error("Не удалось сохранить локальную копию сайта.");}};
  const recoveryKey=()=>user?.id?'workspace:site:'+user.id:null;
  function checkpoint(){const key=recoveryKey();if(!workspaceReady||!key||!state)return false;try{sessionStorage.setItem(key,JSON.stringify({state,projectId,revision,dirty,blocked,failedSave:failedSave||recoveryAttempt}));return true;}catch{notify('Не удалось сохранить локальную копию. Сохраните шаблон на сервере перед обновлением страницы.');}}
  async function recoverWorkspace(uid){
    if(uid&&performance.getEntriesByType('navigation')[0]?.type!=='reload')return false;
    let saved;try{saved=JSON.parse(sessionStorage.getItem(recoveryKey())||'null');}catch{return false;}
    if(!saved||(uid&&uid!==saved.projectId))return false;
    let server=null;if(saved.projectId){try{server=await request('site-builder/projects/'+encodeURIComponent(saved.projectId));}catch{saved.blocked=true;notify('Серверная страница недоступна. Восстановлена локальная копия.');}}
    if(server&&!saved.dirty&&!saved.failedSave){await openProject(saved.projectId);return true;}
    state=validateProject(saved.state);projectId=saved.projectId;revision=saved.revision;dirty=!!saved.dirty;blocked=!!saved.blocked||!!(server&&server.revision!==revision);failedSave=saved.failedSave?{...saved.failedSave,ticket:epoch}:null;
    layout();selected=layout()[0]?.id;await resolveAll();await resolveInstances();tab='layout';render();updatePreviews();status();
    if(blocked)notify('Восстановлены локальные правки. Серверная версия изменилась — сохраните отдельную копию.');return true;
  }
  window.addEventListener('pagehide',checkpoint);
  const labels=['Первый экран','Витрина товаров','Подбор по параметрам','Коллекции','Доставка и преимущества','Отзывы','Блог','Сообщество','Вопросы и ответы','Выбор размера','ХАСЛ','Акционный блок'];
  const visibility={all:'На всех устройствах',desktop:'Только на компьютере',phone:'Только на телефоне',hidden:'Скрыт везде'};
  const layout=()=>{if(!state)return [];if(!state.layout){state.layout=meta.sections.filter(s=>!s.optional).map((s,i)=>({id:'block-'+s.id.slice(1),source:s.id,name:labels[Number(s.id.slice(1))]||s.name,visibility:'all'}));state.haslSectionVersion=1;}R.upgradeLayout(state);return state.layout;};
  const current=()=>layout().find(b=>b.id===selected);
  const id=()=>crypto.randomUUID();
  const fileName=()=>state.fileName?.trim()||'';
  let nameRequest=null;
  const nameDialog=document.createElement('dialog');nameDialog.id='site-file-name-dialog';nameDialog.className='site-file-dialog';nameDialog.setAttribute('aria-labelledby','site-file-name-title');
  nameDialog.innerHTML='<form><header><h2 id="site-file-name-title">Сохранить шаблон</h2><button type="button" data-name-cancel aria-label="Закрыть">×</button></header><label>Имя файла<input name="fileName" required maxlength="200" autocomplete="off" placeholder="Например, Главная — осенняя акция"></label><p>Под этим именем шаблон появится в вашем архиве. Заголовок страницы и адрес HTML не изменятся.</p><p data-name-error role="status"></p><footer><button type="button" data-name-cancel>Отмена</button><button type="submit" class="primary">Сохранить</button></footer></form>';document.body.append(nameDialog);
  function askFileName(value='',title='Сохранить шаблон'){
    if(nameRequest)return nameRequest;
    const input=nameDialog.querySelector('input'),form=nameDialog.querySelector('form');input.value=value;input.setCustomValidity('');nameDialog.querySelector('h2').textContent=title;nameDialog.querySelector('[data-name-error]').textContent='';
    nameRequest=new Promise(resolve=>{
      let chosen=null;
      form.onsubmit=event=>{event.preventDefault();const value=input.value.trim();if(!value||/[\\/:*?"<>|\x00-\x1f]/.test(value)){input.setCustomValidity('Введите имя без \\ / : * ? " < > |');input.reportValidity();return;}chosen=value;nameDialog.close();};
      input.oninput=()=>input.setCustomValidity('');
      nameDialog.onclose=()=>{nameRequest=null;resolve(chosen);};
      nameDialog.querySelectorAll('[data-name-cancel]').forEach(b=>b.onclick=()=>nameDialog.close());nameDialog.showModal();input.focus();input.select();
    });return nameRequest;
  }
  async function request(path,data,requestId){
    const response=await fetch('/editor-api/'+path,{headers:{'Content-Type':'application/json',...(accountStamp?{'X-Editor-Account':accountStamp}:{}),...(requestId?{'X-Site-Request-Id':requestId}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'Ошибка сервера');error.status=response.status;throw error;}return result;
  }
  const finishBoot=()=>{workspaceReady=true;checkpoint();resolveWorkspaceReady();if(window.HaslBuilderBoot){if(window.StudioShell)window.HaslBuilderBoot.ready();else document.addEventListener('hasl:studio-ready',()=>window.HaslBuilderBoot.ready(),{once:true});}else{document.body.classList.remove('site-starting');document.getElementById('site-boot-status')?.remove();}};
  const safeAction=fn=>async()=>{try{await fn();}catch(error){notify(error.message);}};
  function status(){ const text=blocked?'Сохранение остановлено — создайте копию':dirty?'Есть несохранённые изменения':projectId?'Все изменения сохранены':'Эталон · создайте новую страницу';$('#save-status').textContent=text;$('#save-status').title=text; }
  function markChanged({normalize=true}={}){if(window.SiteLayers?.gesturing){window.SiteLayers.cancelGesture();notify('Перетаскивание отменено: содержимое страницы изменилось.');}if(normalize)window.SiteObjects?.normalize(state,document.getElementById('desktop')?.contentDocument);window.SiteDesigner?.record();dirty=true;status();checkpoint();clearTimeout(saveTimer);if(projectId&&!blocked)saveTimer=setTimeout(()=>save({automatic:true}).catch(()=>{}),700);}
  async function executeSave(attempt){
    recoveryAttempt=attempt;checkpoint();
    pending=(async()=>{
      try{
        const result=await request(attempt.path,attempt.data,attempt.requestId);
        if(attempt.ticket!==epoch)return;
        projectId=result.id;revision=result.revision;dirty=(window.SiteLayers?.gestureSnapshot||JSON.stringify(state))!==attempt.snapshot;blocked=false;failedSave=null;recoveryAttempt=null;checkpoint();
        history.replaceState(null,'','?page='+projectId);status();
      }catch(error){if(attempt.ticket===epoch){failedSave=attempt;blocked=true;status();notify(error.message);}throw error;}
      finally{pending=null;}
    })();
    await pending;if(dirty&&!blocked)return save({automatic:true});
  }
  async function save({automatic=false}={}){
    clearTimeout(saveTimer);if(window.SiteLayers?.gesturing)return;if(pending){await pending;if(dirty)return save();return;}
    if(blocked)throw new Error('Сохранение остановлено. Повторите запрос кнопкой «Повторить сохранение» или создайте отдельную копию.');
    if(!fileName()&&!automatic){const ticket=epoch,name=await askFileName();if(name===null)throw Error('Сохранение отменено. Шаблон остаётся открытым.');if(ticket!==epoch)throw Error('Страница изменилась. Повторите сохранение.');state.fileName=name;dirty=true;status();if(pending){await pending;return save();}}
    if(!fileName()&&!projectId)return;
    if(!dirty&&projectId)return;
    const snapshot=JSON.stringify(state),oldId=projectId;
    return executeSave({path:'site-builder/projects'+(oldId?'/'+oldId:''),data:oldId?{revision,state:JSON.parse(snapshot)}:JSON.parse(snapshot),ticket:epoch,snapshot,requestId:crypto.randomUUID()});
  }
  async function retrySave(){
    if(pending)return pending;
    if(!failedSave||failedSave.ticket!==epoch)throw Error('Нет запроса для повтора в этой странице.');
    const attempt=failedSave;blocked=false;return executeSave(attempt);
  }
  async function beforeSwitch(){window.ObjectStudio?.cancelGesture();if(syncing)throw new Error('Дождитесь завершения обновления данных.');if(pending)await pending;if(dirty)await save();clearTimeout(previewTimer);epoch++;}
  function newDraft(){projectId=null;revision=0;blocked=false;dirty=true;failedSave=null;epoch++;history.replaceState(null,'',location.pathname);status();}
  async function resolveInstances(){for(const item of layout())if(item.products){const result=await api('products?codes='+encodeURIComponent(item.products.codes));result.products.forEach(p=>products[p.code]=p);item.products.resolved=result.products.map(p=>p.code);item.products.missing=result.missing;}}
  async function transition(action){
    if(switching)return;switching=true;const workspace=document.querySelector('.workspace');workspace.inert=true;$('#site-save').disabled=true;
    try{await action();}finally{switching=false;workspace.inert=false;$('#site-save').disabled=false;}
  }
  async function openProject(uid){return transition(async()=>{await beforeSwitch();const result=await request('site-builder/projects/'+uid);state=validateProject(result.state);projectId=result.id;revision=result.revision;blocked=false;dirty=false;dirtyBlocks.clear();await resolveAll();await resolveInstances();selected=layout()[0]?.id;history.replaceState(null,'','?page='+uid);checkpoint();tab='layout';render();updatePreviews();status();scheduleSync();});}
  async function createReference(){return transition(async()=>{await beforeSwitch();state=validateProject(await request('site-builder/reference'));state.autoRefresh=false;newDraft();layout();selected=layout()[0]?.id;dirtyBlocks.clear();await resolveAll();await save();tab='layout';render();updatePreviews();});}
  async function createBlank(){return transition(async()=>{await beforeSwitch();state=freshState();state.title='Новый сайт';state.layout=[];state.haslSectionVersion=1;state.autoRefresh=false;newDraft();selected=null;dirtyBlocks.clear();await save();tab='layout';render();updatePreviews();window.StudioShell?.showPanels();});}
  /* Phosphor Regular icons. MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */
  const profileIcons={"folder-simple": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"folder-simple\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,72H130.67L102.93,51.2a16.12,16.12,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm0,128H40V64H93.33L123.2,86.4A8,8,0,0,0,128,88h88Z\"/></svg>", "file-plus": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"file-plus\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z\"/></svg>", "plus-circle": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"plus-circle\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm48-88a8,8,0,0,1-8,8H136v32a8,8,0,0,1-16,0V136H88a8,8,0,0,1,0-16h32V88a8,8,0,0,1,16,0v32h32A8,8,0,0,1,176,128Z\"/></svg>", "copy": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"copy\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z\"/></svg>", "pencil-simple": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"pencil-simple\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z\"/></svg>", "chat-circle-text": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"chat-circle-text\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M168,112a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,112Zm-8,24H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm72-8A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.81,172.06a8,8,0,0,1,.66,6.54L40,216,77.4,203.53a7.85,7.85,0,0,1,2.53-.42,8,8,0,0,1,4,1.08A88,88,0,0,0,216,128Z\"/></svg>", "book-open": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"book-open\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z\"/></svg>", "sign-out": "<svg aria-hidden=\"true\" focusable=\"false\" data-phosphor=\"sign-out\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z\"/></svg>"};
  function profileTemplates(){
    const menu=document.querySelector('.account-menu'),dropdown=menu?.querySelector('.account-dropdown');if(!dropdown||dropdown.querySelector('.profile-site-templates'))return;
    const section=document.createElement('section');section.className='profile-site-templates';section.innerHTML='<strong>Сайты и шаблоны</strong><button type="button" data-new-reference>Новый из шаблона ХАСЛ</button><button type="button" data-new-blank>Создать сайт с нуля</button><div class="profile-site-current"><button type="button" data-copy-page>Сохранить отдельную копию</button><button type="button" data-rename-current>Переименовать файл</button></div>';
    dropdown.prepend(section);const pagesButton=document.querySelector('.studio-my-templates');if(pagesButton)section.querySelector('strong').after(pagesButton);
    const decorate=()=>{const selectors={'.studio-my-templates':'folder-simple','[data-new-reference]':'file-plus','[data-new-blank]':'plus-circle','[data-copy-page]':'copy','[data-rename-current]':'pencil-simple','.studio-feedback':'chat-circle-text','a[href*="instructions"]':'book-open','#studio-logout':'sign-out'};for(const [selector,name] of Object.entries(selectors))dropdown.querySelectorAll(selector).forEach(button=>{button.classList.add('profile-menu-action');if(button.querySelector('.profile-menu-icon'))return;button.insertAdjacentHTML('afterbegin','<span class="profile-menu-icon" aria-hidden="true">'+profileIcons[name]+'</span>');});};
    decorate();new MutationObserver(decorate).observe(dropdown,{childList:true,subtree:true});
    section.addEventListener('click',e=>{if(!e.target.closest('button'))return;menu.open=false;if(e.target.closest('[data-tab="pages"]'))window.StudioShell?.showPanels();});
  }
  document.addEventListener('hasl:studio-ready',profileTemplates,{once:true});
  async function saveCopy(){const name=await askFileName((fileName()||state.title).slice(0,185)+' — копия','Сохранить отдельную копию');if(name===null)return;return transition(async()=>{if(pending)try{await pending;}catch{}clearTimeout(saveTimer);newDraft();state.fileName=name;await save();notify('Отдельная копия сохранена.');render();});}
  const archiveIcon=name=>{const paths={close:'m6 6 12 12M6 18 18 6',search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',edit:'m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5',copy:'M9 9h12v12H9ZM15 9V3H3v12h6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15',plus:'M12 5v14M5 12h14',grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',file:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6'};return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';};
  const archive=document.createElement('dialog');archive.id='site-template-archive';archive.className='site-template-archive';archive.setAttribute('aria-labelledby','site-archive-title');
  archive.innerHTML='<header class="site-archive-head"><div><span>РАБОЧЕЕ ПРОСТРАНСТВО</span><h2 id="site-archive-title">Все шаблоны</h2><p>Ваши шаблоны, сгруппированные по месяцу создания</p></div><button type="button" data-archive-close aria-label="Закрыть">'+archiveIcon('close')+'</button></header><div class="site-archive-body"><div class="site-archive-tools"><label class="site-archive-owner">Архив пользователя<select aria-label="Архив пользователя"></select></label><label class="site-archive-search">'+archiveIcon('search')+'<input type="search" placeholder="Найти шаблон…" aria-label="Найти шаблон"></label><select data-archive-shop aria-label="Магазин"><option value="">Все магазины</option value="hasl">ХАСЛ</option><option value="hasle">HASLESTORE</option><option value="both">Оба магазина</option></select><div class="site-archive-view" role="group" aria-label="Вид архива"><button type="button" data-archive-view="grid" aria-pressed="true" aria-label="Карточки">'+archiveIcon('grid')+'</button><button type="button" data-archive-view="list" aria-pressed="false" aria-label="Список">'+archiveIcon('list')+'</button></div><button type="button" data-archive-new>'+archiveIcon('plus')+'Создать новый шаблон</button></div><div class="site-archive-context"><span data-archive-count></span><button type="button" data-archive-refresh>Обновить</button></div><div class="site-archive-feedback" role="status"></div><div class="site-archive-results" aria-live="polite"></div></div>';document.body.append(archive);
  let archiveView='grid',archiveTicket=0,archiveOpener=null,archiveBusy=false,removedTemplate=null;
  const date=value=>{const d=new Date(value);return isNaN(d)?'—':d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});};
  const templateCount=n=>n+' '+({one:'шаблон',few:'шаблона',many:'шаблонов',other:'шаблона'}[new Intl.PluralRules('ru-RU').select(n)]);
  function drawArchive(){
    const query=archive.querySelector('input[type=search]').value.trim().toLocaleLowerCase('ru'),shop=archive.querySelector('[data-archive-shop]').value;
    const visible=pages.filter(p=>(!query||(p.fileName+' '+p.title).toLocaleLowerCase('ru').includes(query))&&(!shop||p.site===shop));
    archive.querySelector('[data-archive-count]').textContent=query||shop?'Найдено: '+templateCount(visible.length):templateCount(pages.length)+' в вашем архиве';
    const groups=new Map();for(const p of visible){const d=new Date(p.created||p.updated),key=isNaN(d)?'unknown':d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
    const results=archive.querySelector('.site-archive-results');results.innerHTML=[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([month,items])=>{
      const label=month==='unknown'?'Без даты':new Date(month+'-15T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
      return '<section class="site-archive-month"><h3>'+E(label)+'<span>'+templateCount(items.length)+'</span></h3><div class="site-archive-items '+(archiveView==='list'?'is-list':'')+'">'+items.map(p=>'<article class="site-template-card"><button type="button" class="site-template-open" data-archive-open="'+E(p.id)+'"><span class="site-template-thumb">'+archiveIcon('file')+'</span><span class="site-template-copy"><small><img src="/images/hasle.png" alt="">'+E(p.site==='hasle'?'HASLESTORE':p.site==='both'?'ХАСЛ / HASLESTORE':'ХАСЛ')+'</small><strong>'+E(p.fileName||p.title)+'</strong><span>'+E(p.title)+'</span></span></button><footer><div class="site-template-dates"><span>Создан <time>'+date(p.created||p.updated)+'</time></span><span>Изменён <time>'+date(p.updated)+'</time></span></div><div class="site-template-actions">'+[['rename','edit','Переименовать'],['copy','copy','Создать копию'],['remove','trash','Удалить']].map(([action,icon,title])=>'<button type="button" data-archive-'+action+'="'+E(p.id)+'" aria-label="'+title+': '+E(p.fileName||p.title)+'" title="'+title+'">'+archiveIcon(icon)+'</button>').join('')+'</div></footer></article>').join('')+'</div></section>';
    }).join('')||'<div class="site-archive-empty"><h3>'+(pages.length?'Ничего не найдено':'У вас пока нет шаблонов')+'</h3><p>'+(pages.length?'Измените запрос или выберите другой магазин.':'Создайте первый шаблон, чтобы сохранить свою страницу.')+'</p></div>';
  }
  async function loadArchive(){const ticket=++archiveTicket;const results=archive.querySelector('.site-archive-results');results.setAttribute('aria-busy','true');results.textContent='Загружаем шаблоны…';try{const data=await request('site-builder/projects');if(ticket!==archiveTicket||!archive.open)return;pages=data;drawArchive();}catch(error){if(ticket===archiveTicket){results.textContent=error.message;}}finally{if(ticket===archiveTicket)results.removeAttribute('aria-busy');}}
  function openArchive(){archiveOpener=document.activeElement;document.querySelector('.account-menu')?.removeAttribute('open');const select=archive.querySelector('.site-archive-owner select');select.replaceChildren(new Option((user?.name||user?.login||'Мой аккаунт')+' · мой архив','mine'));if(!archive.open)archive.showModal();archive.querySelector('input').focus();loadArchive();}
  archive.querySelector('[data-archive-close]').onclick=()=>archive.close();archive.addEventListener('close',()=>{archiveTicket++;archiveOpener?.isConnected&&archiveOpener.focus({preventScroll:true});});
  archive.querySelector('input').oninput=drawArchive;archive.querySelector('[data-archive-shop]').onchange=drawArchive;
  async function renameTemplate(p){const name=await askFileName(p.fileName||p.title,'Переименовать шаблон');if(name===null)return;if(p.id===projectId){state.fileName=name;dirty=true;await save();render();}else await request('site-builder/projects/'+p.id+'/rename',{revision:p.revision,fileName:name},crypto.randomUUID());await loadArchive();}
  archive.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||archiveBusy)return;
    if(b.dataset.archiveView){archiveView=b.dataset.archiveView;archive.querySelectorAll('[data-archive-view]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));drawArchive();return;}
    if(b.hasAttribute('data-archive-refresh')){await loadArchive();return;}
    const key=['open','rename','copy','remove'].find(k=>b.hasAttribute('data-archive-'+k)),p=pages.find(p=>p.id===b.getAttribute('data-archive-'+key));
    const status=archive.querySelector('.site-archive-feedback');archiveBusy=true;b.disabled=true;status.textContent='';
    try{
      if(b.hasAttribute('data-archive-new')){archive.close();await createReference();return;}
      if(b.hasAttribute('data-archive-undo')&&removedTemplate){await request('site-builder/projects/'+removedTemplate.id+'/archive',{revision:removedTemplate.revision,restore:true});removedTemplate=null;await loadArchive();return;}
      if(!p)return;
      if(key==='open'){await openProject(p.id);archive.close();return;}
      if(key==='rename')await renameTemplate(p);
      if(key==='copy'){const name=await askFileName((p.fileName||p.title).slice(0,185)+' — копия','Сохранить отдельную копию');if(name===null)return;const source=p.id===projectId?structuredClone(state):(await request('site-builder/projects/'+p.id)).state;source.fileName=name;await request('site-builder/projects',source,crypto.randomUUID());await loadArchive();status.textContent='Копия сохранена.';}
      if(key==='remove'){if(p.id===projectId){await save();p.revision=revision;}await request('site-builder/projects/'+p.id+'/archive',{revision:p.revision,restore:false});if(p.id===projectId)newDraft();removedTemplate=p;await loadArchive();status.innerHTML='Шаблон удалён из архива. <button type="button" data-archive-undo>Отменить</button>';}
    }catch(error){status.textContent=error.message;}finally{archiveBusy=false;if(b.isConnected)b.disabled=false;}
  });
  document.addEventListener('click',event=>{const b=event.target.closest('button[data-tab="pages"],button[data-open-archive]');if(b){event.preventDefault();event.stopImmediatePropagation();openArchive();}},true);
  function renderPages(){return '<h2>Мои шаблоны</h2><p>Сохранённые страницы доступны в вашем архиве.</p><button type="button" class="full" data-open-archive>Открыть архив шаблонов</button><button type="button" class="full" data-rename-current>Переименовать файл</button>';}
  function staticImageNode(item,key){for(const id of ['desktop','phone']){const f=document.getElementById(id);if(f?.__haslDocState===state&&f.__haslDocScope===epoch){const n=f.contentDocument?.querySelector('[data-site-block="'+CSS.escape(item.id)+'"] [data-editor-image="'+CSS.escape(key)+'"]');if(n)return n;}}return null;}
  function staticImageValue(item,f){const n=staticImageNode(item,f.id),p=n&&item.objects?.[n.dataset.siteObject];return p?.attrs?.src??item.images?.[f.id]??state.images?.[f.id]??f.value;}
  function setStaticImage(item,key,url){
    const n=staticImageNode(item,key);if(!n&&Object.values(item.objects||{}).some(p=>p.attrs?.src)){notify('Дождитесь предпросмотра или верните карточки акций вместо товаров.');return false;}
    if(n){SiteObjects.normalize(state,n.ownerDocument);const p=item.objects?.[n.dataset.siteObject];if(p?.attrs&&Object.hasOwn(p.attrs,'src'))p.attrs.src=url;}
    (item.images||={})[key]=url;return true;
  }
  function staticImageField(item,f){const url=staticImageValue(item,f);return `<fieldset class="site-static-image" data-static-image="${E(f.id)}"><legend>${E(f.label)}</legend><img src="${E(url)}" alt="${E(f.label)}" loading="lazy"><div class="row wrap"><button type="button" data-static-library="${E(f.id)}">Выбрать / загрузить</button><button type="button" data-static-reset="${E(f.id)}">Вернуть изображение шаблона</button></div>${field('Адрес изображения',url,`data-instance-kind="image" data-field-id="${f.id}" maxlength="2000"`,'text')}<p class="muted">Общее изображение для компьютера и телефона. Загрузка и выбор — из той же библиотеки, что и фон главного экрана. Для обрезки и геометрии выберите само фото в «Объектах шаблона».</p></fieldset>`;}
  function settingsFields(item){
    let result='';
    for(const [kind,fields] of [['image',meta.pictures],['text',meta.fields],['link',meta.links]])result+=fields.filter(f=>f.section===item.source).map(f=>kind==='image'?staticImageField(item,f):field(kind==='text'?(f.value.slice(0,65)||'Текст'):'Ссылка: '+f.label.slice(0,40),item[kind+'s']?.[f.id]??state[kind+'s']?.[f.id]??f.value,`data-instance-kind="${kind}" data-field-id="${f.id}"`,kind==='text'?'textarea':'text')+(kind==='link'?`<label class="check"><input type="checkbox" data-instance-target="${f.id}" ${(item.linkTargets?.[f.id]??state.linkTargets?.[f.id]??f.newTab)?'checked':''}> Открыть в новой вкладке</label>`:'')).join('');
    if(item.source==='s8')return meta.fields.filter(f=>f.section==='s8'&&f.label==='h2').map(f=>field('Заголовок раздела',item.texts?.[f.id]??state.texts?.[f.id]??f.value,`data-instance-kind="text" data-field-id="${f.id}"`,'textarea')).join('');
    return result;
  }
  function buttonSettings(item){const buttons=meta.links.filter(f=>f.section===item.source&&f.button);if(item.source==='s0')buttons.push({id:'hero-more',label:'Подробнее об акции'});return `<details class="text-section"><summary>Кнопки: видимость и стиль</summary><p class="muted">Удалённую кнопку можно вернуть здесь. Настройки относятся к этому экземпляру блока.</p>${buttons.map(f=>{const v=item.buttonStyles?.[f.id]||{};return `<fieldset class="site-button-setting"><legend>${E(f.label)}</legend><label class="field"><span>Отображение</span><select data-button-id="${f.id}" data-button-option="visibility">${[['visible','Показывать'],['hidden','Скрыть'],['deleted','Удалить из страницы']].map(([key,name])=>`<option value="${key}" ${(v.visibility||(f.defaultHidden?'hidden':'visible'))===key?'selected':''}>${name}</option>`).join('')}</select></label><label class="check"><input type="checkbox" data-button-id="${f.id}" data-button-option="showIcon" ${(v.icon??f.icon??'none')!=='none'?'checked':''}> Показать иконку</label><label class="field"><span>Направление иконки</span><select data-button-id="${f.id}" data-button-option="icon">${[['right','Вправо'],['up-right','Вверх-вправо'],['down-right','Вниз-вправо']].map(([key,label])=>`<option value="${key}" ${(v.icon||f.icon||'right')===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>Стиль</span><select data-button-id="${f.id}" data-button-option="variant">${[['','Из шаблона'],['primary','Основная'],['dark','Тёмная'],['outline','Контурная']].map(([key,name])=>`<option value="${key}" ${(v.variant||'')===key?'selected':''}>${name}</option>`).join('')}</select></label>${[['background','Фон','#baff00'],['color','Текст','#111510'],['borderColor','Контур','#111510']].map(([key,label,fallback])=>field(label,v[key]||fallback,`data-button-id="${f.id}" data-button-option="${key}"`,'color')).join('')}${field('Скругление, px',v.radius??'',`data-button-id="${f.id}" data-button-option="radius" min="0" max="40"`,'number')}${field('Размер текста, px',v.fontSize??'',`data-button-id="${f.id}" data-button-option="fontSize" min="12" max="32"`,'number')}${[['width','Ширина на компьютере, px',1200],['paddingX','Отступ слева и справа, px',100],['paddingY','Отступ сверху и снизу, px',100],['phoneWidth','Ширина на телефоне, px',1200],['phonePaddingX','Отступ слева и справа на телефоне, px',100],['phonePaddingY','Отступ сверху и снизу на телефоне, px',100]].map(([key,label,max])=>field(label,v[key]??'',`data-button-id="${f.id}" data-button-option="${key}" min="0" max="${max}" placeholder="Из шаблона"`,'number')).join('')}<p class="muted">Пустое поле — размер из шаблона. На телефоне без отдельного значения используется настройка компьютера; ширина ограничена блоком.</p><button type="button" data-button-reset="${f.id}">Сбросить настройки кнопки</button></fieldset>`;}).join('')}</details>`;}
  const heroBackgrounds=item=>({...content.bannerDefaults,...state.heroBackgrounds,...item?.heroBackgrounds});
  function heroSettings(item){const backgrounds=heroBackgrounds(item),ribbon=item.heroRibbon||{};return `<fieldset class="site-ribbon-settings"><legend>Плашка отзывов над акцией</legend><label class="check"><input type="checkbox" data-ribbon="enabled" ${ribbon.enabled!==false?'checked':''}> Показывать плашку</label>${field('Текст плашки',ribbon.text??'БОЛЕЕ 5000 ОТЗЫВОВ ТУТ! ●','data-ribbon="text"','text')}${field('Цвет фона',ribbon.background||'#4aa3d5','data-ribbon="background"','color')}${field('Цвет текста',ribbon.color||'#ffffff','data-ribbon="color"','color')}<p class="muted">Адрес и новая вкладка — ниже, в поле «Ссылка: Плашка отзывов».</p></fieldset>${backgroundSettings(item,'hero')}`;}
  const finderPosition=(item,device)=>{const raw=item.finderBackgroundPosition?.[device]||{};return Object.fromEntries([['x',50,-100,200],['y',60,-100,200],['scale',120,30,300]].map(([k,d,min,max])=>[k,Number.isFinite(raw[k])?Math.max(min,Math.min(max,raw[k])):d]));};
  const bgPositionKey=kind=>kind==='finder'?'finderBackgroundPosition':kind==='hero'?'heroBackgroundPosition':'blockBackgroundPosition';
  const bgImageKey=(kind,device)=>kind==='finder'?(device==='phone'?'finderPhone':'finderDesktop'):kind==='block'?'block-'+device:device;
  const bgValues=(item,kind,device)=>({x:50,y:kind==='finder'?60:50,scale:kind==='finder'?120:100,rotation:0,flipX:false,flipY:false,opacity:100,...item[bgPositionKey(kind)]?.[device]});
  const bgPaintKey=kind=>kind+'BackgroundPaint';
  const bgPaint=(item,kind,device)=>({mode:'none',color:'#f4f5ee',color2:'#c8ff00',angle:90,...item[bgPaintKey(kind)]?.[device]});
  const bgFill=p=>p.mode==='gradient'?`linear-gradient(${p.angle}deg,${p.color},${p.color2})`:p.mode==='color'?p.color:'transparent';
  const bgStyle=p=>`left:${p.x}%;top:${p.y}%;width:${p.scale}%;transform:translate(-50%,-50%) rotate(${p.rotation}deg) scale(${p.flipX?-1:1},${p.flipY?-1:1});opacity:${p.opacity/100}`;
  function backgroundSettings(item,kind='block'){
    const title=kind==='finder'?'Фон чёрного блока':kind==='hero'?'Фон главной акции':'Фон блока';
    return `<details class="text-section site-background-settings" data-background-settings="${kind}"><summary>${title}</summary><p class="muted">Перетащите фон или задайте положение, масштаб, поворот и отражение. Телефон и компьютер настраиваются отдельно. Новые загрузки сохраняются в папку этого блока; старые изображения доступны из общей библиотеки.</p>${['desktop','phone'].map(device=>{const key=bgImageKey(kind,device),src=kind==='block'?item.blockBackgrounds?.[device]||'':heroBackgrounds(item)[key]||'',p=bgValues(item,kind,device),paint=bgPaint(item,kind,device);return `<fieldset><legend>${device==='phone'?'Телефон':'Компьютер'}</legend><div class="finder-background-drag" data-bg-drag="${kind}" data-bg-device="${device}" style="background:${bgFill(paint)}">${src?`<img src="${E(src)}" alt="${title}" draggable="false" style="${bgStyle(p)}">`:'<span>Выберите изображение</span>'}</div><div class="row wrap"><button type="button" data-hero-library="${key}">Выбрать / загрузить</button><button type="button" data-hero-clear="${key}">Без фона</button></div>${[['x','По горизонтали, %',-100,200],['y','По вертикали, %',-100,200],['scale','Масштаб, %',30,300],['rotation','Поворот, °',-180,180],['opacity','Непрозрачность фона, %',0,100]].map(([axis,label,min,max])=>field(label,p[axis],`data-bg-kind="${kind}" data-bg-device="${device}" data-bg-axis="${axis}" min="${min}" max="${max}" step="1"`,'number')).join('')}${[['flipX','Отразить слева направо'],['flipY','Отразить сверху вниз']].map(([axis,label])=>`<label class="checkline"><input type="checkbox" data-bg-kind="${kind}" data-bg-device="${device}" data-bg-axis="${axis}" ${p[axis]?'checked':''}> ${label}</label>`).join('')}<label class="field"><span>Заливка</span><select data-bg-paint="mode" data-bg-kind="${kind}" data-bg-device="${device}">${[['none','Без заливки'],['color','Цвет'],['gradient','Градиент']].map(([v,label])=>`<option value="${v}" ${paint.mode===v?'selected':''}>${label}</option>`).join('')}</select></label>${[['color','Основной цвет'],['color2','Второй цвет градиента']].map(([key,label])=>field(label,paint[key],`data-bg-paint="${key}" data-bg-kind="${kind}" data-bg-device="${device}"`,'color')).join('')}${field('Угол градиента, °',paint.angle,`data-bg-paint="angle" data-bg-kind="${kind}" data-bg-device="${device}" min="-180" max="180" step="1"`,'number')}<button type="button" data-bg-reset="${kind}" data-bg-device="${device}">Сбросить положение</button></fieldset>`;}).join('')}</details>`;
  }
  function finderBackgroundSettings(item){return backgroundSettings(item,'finder');}

  const bannerDialog=document.createElement('dialog');bannerDialog.id='site-banner-dialog';bannerDialog.innerHTML='<header class="dialog-head"><h2>Библиотека фонов</h2><button type="button" data-banner-close>Закрыть</button></header><p>JPG, PNG или WebP до 4,9 МБ и 24 Мп. Загруженный фон получает постоянную публичную ссылку.</p><label class="field"><span>Загрузить изображение</span><input type="file" id="site-banner-upload" accept="image/jpeg,image/png,image/webp"></label><p data-banner-status role="status"></p><div class="site-banner-grid"></div><p class="muted">Перед удалением убедитесь, что ссылка не используется в уже опубликованном HTML. Используемые в сохранённых проектах и эталоне файлы защищены.</p>';document.body.append(bannerDialog);
  let bannerTarget=null,bannerTicket=0,bannerItems=[];
  const bannerStatus=text=>bannerDialog.querySelector('[data-banner-status]').textContent=text;
  const bannerValid=()=>bannerTarget&&bannerTarget.epoch===epoch&&layout().some(b=>b.id===bannerTarget.id)&&bannerDialog.open;
  async function bannerApi(path,options={}){const response=await fetch('/editor-api/site-builder/'+path,{...options,headers:{...(accountStamp?{'X-Editor-Account':accountStamp}:{}),...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось загрузить библиотеку');return data;}
  function bannerGrid(){bannerDialog.querySelector('.site-banner-grid').innerHTML=bannerItems.length?bannerItems.map(b=>`<article class="site-banner-item"><img src="${E(b.url)}" alt="${E(b.name)}" loading="lazy"><strong>${E(b.name)}</strong><p>${b.width} × ${b.height} · ${Math.ceil(b.size/1024)} КБ</p><label class="field"><span>Публичная ссылка</span><input readonly value="${E(b.url)}" aria-label="Ссылка на ${E(b.name)}"></label><div class="row wrap"><button type="button" data-banner-use="${E(b.filename)}">Использовать</button>${b.canDelete?`<button type="button" data-banner-delete="${E(b.filename)}">Удалить файл</button>`:''}</div></article>`).join(''):'<p>Здесь пока нет изображений. Загрузите первый фон.</p>';}
  async function openBanners(device,image=null){const item=current();if(!item||(!image&&item.source!=='s0'&&!device.startsWith('block-'))||(image&&!meta.pictures.some(f=>f.id===image&&f.section===item.source)))return;if(!item.backgroundFolder){item.backgroundFolder=crypto.randomUUID();changed();}bannerTarget={id:item.id,epoch,device,image,folder:item.backgroundFolder};bannerDialog.querySelector('h2').textContent=image?'Библиотека изображений':'Библиотека фонов';const ticket=++bannerTicket;bannerDialog.querySelector('.site-banner-grid').replaceChildren();bannerDialog.showModal();bannerDialog.querySelector('input[type=file]').disabled=true;bannerStatus('Загружаем библиотеку…');try{const result=await bannerApi('banners?folder='+encodeURIComponent(bannerTarget.folder));if(ticket!==bannerTicket||!bannerValid())return;bannerItems=result.items;bannerGrid();bannerStatus(image?'Выберите изображение карточки': 'Выберите фон для '+(['phone','finderPhone'].includes(device)?'телефона':'компьютера'));}catch(e){if(ticket===bannerTicket)bannerStatus(e.message);}finally{if(ticket===bannerTicket)bannerDialog.querySelector('input[type=file]').disabled=false;}}
  bannerDialog.addEventListener('close',()=>{bannerTarget=null;bannerTicket++;});
  bannerDialog.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button)return;e.stopPropagation();if(button.hasAttribute('data-banner-close')){bannerDialog.close();return;}try{if(!bannerValid())throw new Error('Страница изменилась. Откройте библиотеку заново.');const filename=button.dataset.bannerUse||button.dataset.bannerDelete,banner=bannerItems.find(b=>b.filename===filename);if(!banner)return;if(button.dataset.bannerUse){const item=layout().find(b=>b.id===bannerTarget.id);if(bannerTarget.image){if(!setStaticImage(item,bannerTarget.image,banner.url))return;}else if(bannerTarget.device.startsWith('block-')){(item.blockBackgrounds||={})[bannerTarget.device.slice(6)]=banner.url;}else{item.heroBackgrounds||={};item.heroBackgrounds[bannerTarget.device]=banner.url;}changed();render();bannerDialog.close();return;}if(button.dataset.bannerDelete){if(JSON.stringify(state).includes(filename))throw new Error('Этот фон выбран в текущей странице. Сначала замените его и сохраните страницу.');if(!confirm('Удалить файл «'+banner.name+'» с сервера? Ссылки в ранее экспортированном HTML перестанут работать.'))return;button.disabled=true;await bannerApi('banners/'+filename,{method:'DELETE'});bannerItems=bannerItems.filter(b=>b.filename!==filename);bannerGrid();bannerStatus('Файл удалён');}}catch(error){bannerStatus(error.message);button.disabled=false;}});
  bannerDialog.querySelector('input[type=file]').addEventListener('change',async e=>{const input=e.target,file=input.files[0],ticket=bannerTicket;if(!file)return;try{if(file.size>4900000)throw new Error('Размер изображения — не больше 4,9 МБ.');input.disabled=true;bannerStatus('Загружаем изображение…');const result=await bannerApi('banners?folder='+encodeURIComponent(bannerTarget.folder)+'&name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});if(ticket!==bannerTicket||!bannerValid())return;bannerItems.unshift(result);bannerGrid();bannerStatus('Изображение загружено. Нажмите «Использовать», чтобы применить его.');}catch(error){if(ticket===bannerTicket)bannerStatus(error.message);}finally{input.disabled=false;input.value='';}});
  const faqItems=item=>item.faq||R.faqDefaults(state,item);
  function faqBehaviorSettings(item){return `<details class="text-section" open data-faq-behavior><summary>Раскрытие FAQ</summary><label class="field"><span>При загрузке страницы</span><select data-faq-setting="initial"><option value="closed" ${item.faqSettings?.initial!=='first'?'selected':''}>Все ответы закрыты</option><option value="first" ${item.faqSettings?.initial==='first'?'selected':''}>Первый ответ открыт</option></select></label><label class="field"><span>Можно открыть</span><select data-faq-setting="mode"><option value="multiple" ${item.faqSettings?.mode!=='single'?'selected':''}>Несколько ответов одновременно</option><option value="single" ${item.faqSettings?.mode==='single'?'selected':''}>Только один ответ</option></select></label><label class="field"><span>Положение заголовка</span><select data-faq-setting="heading"><option value="left" ${!['right','top'].includes(item.faqSettings?.heading)?'selected':''}>Заголовок сбоку слева</option><option value="right" ${item.faqSettings?.heading==='right'?'selected':''}>Заголовок сбоку справа</option><option value="top" ${item.faqSettings?.heading==='top'?'selected':''}>Заголовок сверху</option></select></label><p class="muted">Ответы раскрываются плавно. На компьютере заголовок следует за центром списка. При сокращении движения в системе анимация отключена.</p></details>`;}
  function faqSettings(item){return `<details class="text-section" open><summary>Пункты спойлера</summary><p class="muted">До 30 вопросов. Ответ — обычный текст; ссылку задайте отдельно.</p>${faqItems(item).map((f,i,a)=>`<div class="faq-setting">${field('Вопрос '+(i+1),f.question,`data-faq-index="${i}" data-faq-field="question" maxlength="500"`,'textarea')}${field('Ответ',f.answer,`data-faq-index="${i}" data-faq-field="answer" maxlength="10000"`,'textarea')}${field('Ссылка в ответе',f.url,`data-faq-index="${i}" data-faq-field="url" maxlength="2000"`,'text')}${field('Текст ссылки',f.linkText,`data-faq-index="${i}" data-faq-field="linkText" maxlength="300"`,'text')}<div class="row wrap"><button data-faq-action="up" data-faq-index="${i}" ${i===0?'disabled':''}>Выше</button><button data-faq-action="down" data-faq-index="${i}" ${i===a.length-1?'disabled':''}>Ниже</button><button data-faq-action="delete" data-faq-index="${i}">Удалить вопрос</button></div></div>`).join('')}<button data-faq-action="add" ${faqItems(item).length>=30?'disabled':''}>Добавить вопрос</button></details>`;}
  function instanceMedia(p,url,large=false){
    const video=(p.videos||[]).includes(url);
    return video?`<video src="${E(R.safe(url))}" poster="${E(R.optimized(p.photos?.[0]||'',640))}" controls muted playsinline preload="metadata" aria-label="Видео товара ${E(p.name)}"></video>`:`<img src="${E(R.optimized(url,640))}" alt="${E(p.name)}" loading="lazy">`;
  }
  function renderInstanceProducts(item){return (item.products?.resolved||[]).map((code,index,list)=>{const p=products[code];if(!p)return '';const url=item.products.photos?.[code]||p.photos?.[0]||p.videos?.[0]||'',video=(p.videos||[]).includes(url),number=(video?p.videos:p.photos||[]).indexOf(url)+1;return `<article class="instance-product" data-instance-card="${E(code)}"><div class="instance-product-media">${url?instanceMedia(p,url):'<span>Нет фото</span>'}</div><div class="instance-product-info"><strong>${E(p.name)}</strong><small>Арт. ${E(code)} · ${video?'Видео':'Фото'} ${Math.max(1,number)}</small><button type="button" data-instance-media="${E(code)}">Выбрать фото / видео</button><div class="instance-product-order"><button type="button" data-instance-order="${E(code)}" data-direction="-1" ${index===0?'disabled':''} aria-label="Выше: ${E(p.name)}">↑ Выше</button><button type="button" data-instance-order="${E(code)}" data-direction="1" ${index===list.length-1?'disabled':''} aria-label="Ниже: ${E(p.name)}">↓ Ниже</button></div></div></article>`;}).join('');}
  const mediaDialog=document.createElement('dialog');mediaDialog.id='instance-media-dialog';mediaDialog.setAttribute('aria-labelledby','instance-media-title');mediaDialog.innerHTML='<div class="dialog-head"><h2 id="instance-media-title">Фото и видео товара</h2><button type="button" data-instance-media-close>Закрыть</button></div><p class="instance-media-description"></p><div class="instance-media-options"></div>';document.body.append(mediaDialog);
  let mediaSelection=null,mediaOpener=null;
  mediaDialog.querySelector('[data-instance-media-close]').onclick=()=>mediaDialog.close();
  mediaDialog.addEventListener('close',()=>{mediaDialog.querySelectorAll('video').forEach(v=>v.pause());mediaDialog.querySelector('.instance-media-options').replaceChildren();mediaSelection=null;if(mediaOpener?.isConnected)mediaOpener.focus();});
  function openInstanceMedia(item,code,button){const p=products[code];if(!p)return;mediaSelection={item,code,epoch};mediaOpener=button;mediaDialog.querySelector('.instance-media-description').textContent=p.name+' · арт. '+code;const chosen=item.products.photos?.[code]||p.photos?.[0];mediaDialog.querySelector('.instance-media-options').innerHTML=[...(p.photos||[]),...(p.videos||[])].map((url,i)=>`<div class="instance-media-option">${instanceMedia(p,url,true)}<button type="button" data-instance-media-choice="${i}" aria-pressed="${url===chosen}">${url===chosen?'Выбрано · ':''}${i<(p.photos||[]).length?'Фото '+(i+1):'Видео '+(i-(p.photos||[]).length+1)}</button></div>`).join('')||'<p>У товара нет доступных фото и видео.</p>';mediaDialog.showModal();}
  mediaDialog.addEventListener('click',event=>{const button=event.target.closest('[data-instance-media-choice]');if(!button||!mediaSelection)return;const {item,code,epoch:ticket}=mediaSelection;if(ticket!==epoch||current()!==item||!layout().includes(item)){mediaDialog.close();notify('Страница изменилась. Откройте выбор фото заново.');return;}const p=products[code],url=[...(p.photos||[]),...(p.videos||[])][Number(button.dataset.instanceMediaChoice)];if(!url)return;(item.products.photos||={})[code]=url;const scroll=$('#inspector').scrollTop;changed();mediaDialog.close();render();$('#inspector').querySelector('[data-instance-card]')?.closest('details')?.setAttribute('open','');$('#inspector').scrollTop=scroll;$('#inspector').querySelector('[data-instance-media="'+CSS.escape(code)+'"]')?.focus({preventScroll:true});});
  function renderLayout(){
    const items=layout();if(!current())selected=items[0]?.id;const item=current();
    const productsSource=item&&['s11','s1','s3'].includes(item.source);
    return `<h2>Блоки страницы</h2><p class="intro">Вставляйте секции из эталона, меняйте порядок и настройте каждую отдельно.</p><div class="site-insert" role="toolbar" aria-label="Вставка блоков">${meta.sections.map((s,i)=>`<button data-insert-section="${s.id}">${E(labels[i]||s.name)}</button>`).join('')}</div><ol class="site-structure" aria-label="Структура страницы">${items.map((b,i)=>`<li draggable="true" data-structure-id="${E(b.id)}" class="${b.id===selected?'selected':''} ${b.visibility==='hidden'?'is-hidden':''}"><span class="site-drag" aria-hidden="true">⠿</span><button type="button" data-select-block="${E(b.id)}" class="site-structure-name">${E(b.name)}</button><button type="button" data-toggle-block="${E(b.id)}" aria-label="${b.visibility==='hidden'?'Показать':'Скрыть'} ${E(b.name)}" aria-pressed="${b.visibility==='hidden'}" title="${b.visibility==='hidden'?'Вернуть в экспорт':'Скрыть и исключить из экспорта'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${b.visibility==='hidden'?'<path d="m3 3 18 18"/>':''}</svg></button><button type="button" data-delete-block="${E(b.id)}" class="danger" aria-label="Удалить блок: ${E(b.name)}" title="Удалить блок"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button><button type="button" data-order-block="${E(b.id)}" data-direction="-1" aria-label="Выше: ${E(b.name)}" ${i===0?'disabled':''}>↑</button><button type="button" data-order-block="${E(b.id)}" data-direction="1" aria-label="Ниже: ${E(b.name)}" ${i===items.length-1?'disabled':''}>↓</button></li>`).join('')}</ol><p class="muted">Перетащите строку или используйте стрелки. Перечёркнутый глаз исключает блок из экспорта.</p><label class="field"><span>Блок на странице</span><select id="site-block-select">${items.map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${E(b.name)} · ${E(visibility[b.visibility]||visibility.all)}</option>`).join('')}</select></label>${!item?'<p>Страница пустая. Выберите блок в панели вставки.</p>':`
    <div class="row wrap"><button data-block-up ${items.indexOf(item)===0?'disabled':''}>Выше</button><button data-block-down ${items.indexOf(item)===items.length-1?'disabled':''}>Ниже</button><button data-block-copy>Дублировать</button><button data-block-delete class="danger">Удалить</button><button data-block-show>Показать блок</button></div>
    ${item.source==='s5'?'<button class="full" data-tab="reviews">Список отзывов и данные карточек</button>':''}
    ${field('Название блока в конструкторе',item.name,'id="site-block-name" maxlength="120"','text')}
    <label class="field"><span>Якорь секции (без #)</span><input id="site-block-anchor" value="${E(R.anchorFor(item))}" pattern="[a-zA-Z][a-zA-Z0-9_-]{0,79}" maxlength="80"><small>Для ссылки: #${E(R.anchorFor(item))}</small></label>
    <label class="field"><span>Видимость блока</span><select id="site-block-visibility">${Object.entries(visibility).map(([k,v])=>`<option value="${k}" ${item.visibility===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <details class="text-section"><summary>Оформление блока</summary>${field('Цвет фона',item.background||'#ffffff','id="site-block-background"','color')}${field('Цвет текста',item.color||'#202020','id="site-block-color"','color')}<button data-reset-appearance>Вернуть оформление эталона</button></details>
    ${productsSource?`<details class="text-section"><summary>Товары этого блока</summary>${field('Артикулы для этого экземпляра',item.products?.codes||'','id="instance-codes"')}<button data-instance-products>Применить товары к блоку</button><p class="muted">${item.source==='s11'?'Не более двух товаров.':'До 250 товаров.'} Фото или видео можно выбрать ниже после применения.</p>${(item.products?.missing||[]).length?`<p class="notice error">Не найдены: ${E(item.products.missing.join(', '))}</p>`:''}${renderInstanceProducts(item)}</details>`:''}
    ${['s5','s6'].includes(item.source)?field('Количество материалов в этом блоке',item.limit||6,'id="site-block-limit" min="1" max="30"','number'):''}
    ${item.source==='s1'?`<fieldset class="text-section"><legend>Сезонные плашки над товарами</legend><p class="muted">Выберите нужные фильтры или снимите все галочки.</p>${Object.entries({winter:'Зима',demi:'Демисезон',summer:'Лето'}).map(([key,label])=>`<label class="checkline"><input type="checkbox" data-season-tab="${key}" ${(item.seasons||[]).includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset>`:''}
    ${item.source==='s8'?faqBehaviorSettings(item)+faqSettings(item):''}
    ${item.source==='s0'?heroSettings(item)+finderBackgroundSettings(item):backgroundSettings(item)}${buttonSettings(item)}
    <fieldset class="site-spacing"><legend>Отступы блока, px</legend><p class="muted">Пусто — по шаблону; 0 — без отступа. На телефоне действуют, если не заданы мобильные отступы.</p>${['top','bottom'].map(side=>`<label class="field"><span>${side==='top'?'Сверху':'Снизу'}</span><input type="number" min="0" max="400" step="1" data-block-spacing="${side}" placeholder="По шаблону" value="${item.spacing?.[side]??''}"></label>`).join('')}</fieldset>
    <fieldset class="site-spacing-phone"><legend>Отступы на телефоне, px</legend><p class="muted">Пусто — основной отступ. 0 — убрать только на телефоне (ширина до 767 px).</p>${['top','bottom'].map(side=>`<label class="field"><span>${side==='top'?'Сверху на телефоне':'Снизу на телефоне'}</span><input type="number" min="0" max="400" step="1" data-block-spacing="${side}" data-spacing-phone="true" placeholder="Как основной" value="${item.spacingMobile?.[side]??''}"></label>`).join('')}</fieldset>
    <details class="text-section" open><summary>Тексты, ссылки и изображения</summary>${settingsFields(item)||'<p>Материалы этого блока настраиваются в разделе «Отзывы» или «Блог».</p>'}</details>`}`;
  }
  function renderAccess(){
    if(!['admin','moderator'].includes(user?.role))return '<h2>Доступ закрыт</h2>';
    request('users').then(data=>{users=data.filter(u=>u.role==='editor');const list=$('#site-access-list');if(list)list.innerHTML=users.map(u=>`<label class="checkline"><input type="checkbox" data-site-access="${E(u.id)}" ${u.siteAccess?'checked':''}>${E(u.name)}${u.blocked?' · аккаунт заблокирован':''}</label>`).join('')||'<p>Редакторов пока нет.</p>';}).catch(e=>notify(e.message));
    return '<h2>Доступ редакторов</h2><p class="intro">Администраторы и модераторы имеют доступ всегда. Разрешение редактора можно выдать или отозвать здесь. Блокировка аккаунта имеет приоритет.</p><div id="site-access-list" role="status">Загрузка…</div>';
  }
  let editingFrame=null,mirrorTimer;
  function readTextLinks(node){
    const links=[];for(const a of node.querySelectorAll('a[href]')){a.classList.add('site-inline-link');const r=node.ownerDocument.createRange();r.selectNodeContents(node);r.setEndBefore(a);const start=r.toString().length;links.push({start,end:start+a.textContent.length,href:a.getAttribute('href')});}return {text:node.textContent,links};
  }
  let linkSelection=null;
  const linkButton=document.createElement('button');linkButton.type='button';linkButton.id='site-text-link';linkButton.textContent='Ссылка';linkButton.title='Выделите текст в превью · Ctrl+K';document.querySelector('.preview-toolbar').append(linkButton);
  const linkDialog=document.createElement('dialog');linkDialog.id='site-link-dialog';linkDialog.innerHTML='<form><div class="dialog-head"><h2>Ссылка в тексте</h2><button type="button" data-link-close>Закрыть</button></div><label class="field">Адрес или якорь<input name="href" required placeholder="https://example.com или #section"></label><label class="field">Секция страницы<select name="section"><option value="">Выбрать секцию…</option></select></label><p data-link-error role="status"></p><button type="submit">Применить</button> <button type="button" data-link-remove>Убрать ссылку</button></form>';document.body.append(linkDialog);
  function openTextLink(){
    const saved=linkSelection;if(!saved||saved.epoch!==epoch||!saved.node.isConnected||saved.node.textContent!==saved.text){notify('Выделите текст внутри одного поля в превью.');return;}
    if(saved.node.closest('button')){notify('Внутри кнопки ссылка недоступна. Выберите обычный текст.');return;}
    const select=linkDialog.querySelector('[name=section]');select.innerHTML='<option value="">Выбрать секцию…</option>'+layout().filter(b=>b.visibility!=='hidden').map(b=>'<option value="#'+E(R.anchorFor(b))+'">'+E(b.name)+'</option>').join('');
    const n=saved.range.startContainer.parentElement,a=n?.closest('a');linkDialog.querySelector('[name=href]').value=a?.getAttribute('href')||'';linkDialog.querySelector('[data-link-error]').textContent='';linkDialog.showModal();linkDialog.querySelector('[name=href]').focus();
  }
  linkButton.addEventListener('mousedown',e=>e.preventDefault());linkButton.onclick=openTextLink;
  linkDialog.querySelector('[data-link-close]').onclick=()=>linkDialog.close();
  linkDialog.querySelector('[name=section]').onchange=e=>{if(e.target.value)linkDialog.querySelector('[name=href]').value=e.target.value;};
  function insertTextLink(remove=false){
    const saved=linkSelection,error=linkDialog.querySelector('[data-link-error]');if(!saved||saved.epoch!==epoch||!saved.node.isConnected||saved.node.textContent!==saved.text){error.textContent='Текст изменился. Закройте окно и выделите его снова.';return;}
    const href=linkDialog.querySelector('[name=href]').value.trim();if(!remove&&!/^(https?:\/\/[^\s]+|#[a-zA-Z][\w-]*)$/.test(href)){error.textContent='Укажите http(s)-адрес или #якорь.';return;}
    if(!remove&&href.startsWith('#')&&!layout().some(b=>R.anchorFor(b)===href.slice(1)&&b.visibility!=='hidden')){error.textContent='Такой видимый якорь секции не найден.';return;}
    const node=saved.node,doc=node.ownerDocument,outer=node.closest('a[data-editor-link]');
    node.focus();const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(saved.range);
    if(outer){const item=layout().find(b=>b.id===node.closest('[data-site-block]').dataset.siteBlock);(item.links||={})[outer.dataset.editorLink]=remove?'':href;outer.setAttribute('href',remove?'':href);changed();}
    else{node.contentEditable='true';try{doc.execCommand(remove?'unlink':'createLink',false,remove?null:href);}finally{node.contentEditable='plaintext-only';}node.dispatchEvent(new Event('input',{bubbles:true}));}
    linkDialog.close();linkSelection=null;
  }
  linkDialog.querySelector('form').onsubmit=e=>{e.preventDefault();insertTextLink();};linkDialog.querySelector('[data-link-remove]').onclick=()=>insertTextLink(true);

  function bindPreview(frame){
    const doc=frame.contentDocument;
    // Open answers without starting an object drag or editing the document state.
    doc.addEventListener('pointerdown',e=>{if(e.target.closest('.faq-q,.brand-picker'))e.stopImmediatePropagation();},true);
    doc.addEventListener('click',e=>{
      const picker=e.target.closest('.brand-picker');
      doc.querySelectorAll('.brand-picker[open]').forEach(n=>{if(n!==picker)n.open=false;});
      if(!picker||window.ObjectStudio?.busy)return;
      e.stopImmediatePropagation();
      if(e.target.closest('.brand-any'))picker.closest('section')?.__haslFinder?.resetBrands();
    },true);
    doc.addEventListener('dblclick',e=>{if(e.target.closest('.brand-picker'))e.stopImmediatePropagation();},true);
    doc.addEventListener('keydown',e=>{if(e.target.closest('.brand-picker')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(e.key))e.stopImmediatePropagation();},true);
    doc.addEventListener('click',e=>{
      const q=e.target.closest('.faq-q');if(!q||window.ObjectStudio?.busy)return;
      e.preventDefault();e.stopImmediatePropagation();if(e.detail>1)return;
      q.closest('section')?.__haslFaq?.toggle(q,e);
    },true);
    doc.addEventListener('selectionchange',()=>{const selection=doc.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;const range=selection.getRangeAt(0),node=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement).closest('[data-editor-text]');if(node&&node.contains(range.endContainer))linkSelection={node,range:range.cloneRange(),text:node.textContent,epoch};else linkSelection=null;});
    doc.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openTextLink();}});

    const style=doc.createElement('style');style.textContent='[data-editor-text]{cursor:text}[data-editor-text]:hover{outline:1px dashed #527000;outline-offset:3px}[data-editor-text]:focus{outline:2px solid #527000;outline-offset:3px;min-width:1ch}';doc.head.append(style);
    doc.querySelectorAll('[data-editor-text]').forEach(node=>{
      node.contentEditable='plaintext-only';node.setAttribute('role','textbox');node.setAttribute('aria-label','Редактировать текст: '+node.textContent.trim().slice(0,65));node.spellcheck=true;
      node.addEventListener('focus',()=>{editingFrame=frame;});
      node.addEventListener('click',e=>{if(node.closest('a'))e.preventDefault();e.stopPropagation();});
      node.addEventListener('paste',e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');doc.execCommand('insertText',false,value);});
      node.addEventListener('input',()=>{
        const item=layout().find(b=>b.id===node.closest('[data-site-block]')?.dataset.siteBlock);if(!item)return;
        const key=node.dataset.editorText,value=node.textContent;
        (item.inlineLinks||={})[key]=readTextLinks(node);
        const faq=item.faq?.find(f=>key==='faq-'+f.id+'-question'||key==='faq-'+f.id+'-answer');
        if(faq){const field=key.endsWith('-question')?'question':'answer';faq[field]=value;const input=document.querySelector(`[data-faq-index="${item.faq.indexOf(faq)}"][data-faq-field="${field}"]`);if(input&&selected===item.id)input.value=value;}else (item.texts||={})[key]=value;
        markChanged();
        const input=document.querySelector('[data-instance-kind="text"][data-field-id="'+key+'"]');if(input&&selected===item.id)input.value=value;
        clearTimeout(mirrorTimer);mirrorTimer=setTimeout(()=>{
          const other=document.getElementById(frame.id==='desktop'?'phone':'desktop'),otherDoc=other.contentDocument;
          const target=otherDoc?.querySelector('[data-site-block="'+item.id+'"] [data-editor-text="'+key+'"]');if(target){target.textContent=value;R.applyTextLinks(target,item.inlineLinks?.[key]);window.SiteObjects?.applyTextStyles(target,item.objects?.[node.dataset.siteObject]?.textStyles,item.objects?.[node.dataset.siteObject]?.phoneTextStyles);}
        },120);
      });
      node.addEventListener('blur',()=>{if(editingFrame===frame)editingFrame=null;});
      node.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(()=>{});}if(e.key==='Escape'){node.blur();document.getElementById('preview-fullscreen').focus();}});
    });
  }
  const bindOriginal=bindPreview;
  const previewButton=document.createElement('button');previewButton.id='site-preview';previewButton.type='button';previewButton.textContent='Предпросмотр';document.querySelector('.top-actions').append(previewButton);
  const previewDialog=document.createElement('dialog');previewDialog.id='site-preview-dialog';previewDialog.setAttribute('aria-labelledby','site-preview-title');
  previewDialog.innerHTML='<header><strong id="site-preview-title">Предпросмотр страницы <small id="site-preview-resolution"></small></strong><div><label class="studio-shop-select">Сайт <select id="site-preview-shop"><option value="hasl">хасл.рф</option><option value="hasle">haslestore.com</option></select></label><button type="button" data-preview-size="desktop" aria-pressed="true">Экран</button><button type="button" data-preview-size="phone" aria-pressed="false">Телефон</button><button type="button" id="site-preview-reload">Обновить просмотр</button><button type="button" id="site-preview-comments">Комментарии</button><button type="button" id="site-remote-preview">Предпросмотр удалённо</button><button type="button" data-close-preview aria-label="Закрыть предпросмотр">Закрыть</button></div></header><section class="site-preview-sharing" hidden><p>Ссылка доступна без входа. Она показывает снимок страницы на момент нажатия «Предпросмотр удалённо». Нажмите эту кнопку снова, чтобы обновить снимок.</p><label>Ссылка для просмотра<input id="site-preview-url" readonly></label><div><button type="button" id="site-preview-copy">Скопировать ссылку</button><a id="site-preview-open" target="_blank" rel="noopener noreferrer">Открыть</a><button type="button" id="site-preview-revoke">Отключить ссылку</button></div></section><div class="site-preview-viewport"><div class="site-preview-stage"><iframe title="Предпросмотр без редактирования" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe></div></div><p class="site-preview-message" role="status"></p>';
  document.body.append(previewDialog);let sharedProject=null;
  const previewFrame=previewDialog.querySelector('iframe'),previewMessage=previewDialog.querySelector('.site-preview-message');
  const previewViewport=previewDialog.querySelector('.site-preview-viewport'),previewStage=previewDialog.querySelector('.site-preview-stage');
  let previewSizes={desktop:{width:1440,height:900},phone:{width:430,height:932}};
  function sizePreview(){
    if(!previewDialog.open)return;
    const size=previewSizes[previewDialog.dataset.device||'desktop'];
    const scale=Math.min(1,Math.max(1,previewViewport.clientWidth)/size.width,Math.max(1,previewViewport.clientHeight)/size.height);
    previewFrame.style.width=size.width+'px';previewFrame.style.height=size.height+'px';previewFrame.style.transform='scale('+scale+')';
    previewStage.style.width=size.width*scale+'px';previewStage.style.height=size.height*scale+'px';
    $('#site-preview-resolution').textContent=size.width+' × '+size.height;
  }
  new ResizeObserver(sizePreview).observe(previewViewport);
  let previewLoad=0,previewLoadTimer;
  function loadPreview(){
    try{const html=R.build(state,products,content,{site:$('#preview-site').value,clean:true,preview:true});
      if(!html||!html.includes('hasl-home-embed'))throw Error('Не удалось собрать страницу.');
      const ticket=++previewLoad;clearTimeout(previewLoadTimer);previewMessage.textContent='Открываем страницу…';
      const ready='<script>parent.postMessage({channel:"site-preview-ready",ticket:'+ticket+'},"*");<\/script>';
      previewFrame.srcdoc=html.replace('</body>',ready+'</body>');sizePreview();
      previewLoadTimer=setTimeout(()=>{if(previewDialog.open&&ticket===previewLoad)previewMessage.textContent='Страница загружается дольше обычного. Нажмите «Обновить просмотр», чтобы повторить.';},8000);
    }catch(error){previewMessage.textContent='Предпросмотр не создан: '+error.message;}
  }
  window.addEventListener('message',event=>{if(event.source===previewFrame.contentWindow&&event.data?.channel==='site-preview-ready'&&event.data.ticket===previewLoad){clearTimeout(previewLoadTimer);if(previewMessage.textContent==='Открываем страницу…'||previewMessage.textContent.startsWith('Страница загружается дольше'))previewMessage.textContent='';}});
  $('#site-preview-reload').onclick=loadPreview;
  previewButton.onclick=()=>{if(!state)return;window.ObjectStudio?.cancelGesture();previewDialog.querySelector('.site-preview-sharing').hidden=true;previewMessage.textContent='';sharedProject=null;
    for(const device of ['desktop','phone']){const frame=document.getElementById(device);previewSizes[device]={width:parseFloat(frame.style.width)||frame.clientWidth||previewSizes[device].width,height:parseFloat(frame.style.height)||frame.clientHeight||previewSizes[device].height};}
    previewDialog.dataset.device=window.ObjectStudio?.bridge.device||'desktop';
    for(const b of previewDialog.querySelectorAll('[data-preview-size]'))b.setAttribute('aria-pressed',String(b.dataset.previewSize===previewDialog.dataset.device));
    $('#site-preview-shop').value=$('#preview-site').value;if(!previewDialog.open)previewDialog.showModal();loadPreview();};
  $('#site-preview-shop').onchange=async()=>{const select=$('#site-preview-shop');select.disabled=true;try{$('#preview-site').value=select.value;await switchPreviewShop();select.value=$('#preview-site').value;previewDialog.querySelector('.site-preview-sharing').hidden=true;sharedProject=null;if(previewDialog.open)loadPreview();}catch(error){previewMessage.textContent=error.message;}finally{select.disabled=false;}};
  previewDialog.querySelector('[data-close-preview]').onclick=()=>previewDialog.close();
  previewDialog.addEventListener('close',()=>{if(previewDialog.open)return;clearTimeout(previewLoadTimer);previewLoad++;previewFrame.removeAttribute('srcdoc');previewButton.focus();});
  for(const button of previewDialog.querySelectorAll('[data-preview-size]'))button.onclick=()=>{previewDialog.dataset.device=button.dataset.previewSize;for(const b of previewDialog.querySelectorAll('[data-preview-size]'))b.setAttribute('aria-pressed',String(b===button));sizePreview();};
  $('#site-remote-preview').onclick=async()=>{
    const button=$('#site-remote-preview');button.disabled=true;previewMessage.textContent='Сохраняем страницу и готовим ссылку…';const ticket=epoch;
    try{
      await save();if(ticket!==epoch||!previewDialog.open)throw Error('Страница изменилась. Откройте предпросмотр заново.');
      const uid=projectId,version=revision,snapshot=JSON.stringify(state),html=R.build(state,products,content,{site:$('#preview-site').value,clean:true,preview:true});
      const result=await request('site-builder/projects/'+uid+'/preview',{revision:version,html});
      if(ticket!==epoch||snapshot!==JSON.stringify(state)||!previewDialog.open)throw Error('Страница изменилась. Обновите предпросмотр.');
      sharedProject=uid;const url=new URL(result.url,location.origin).href;$('#site-preview-url').value=url;$('#site-preview-open').href=url;previewFrame.srcdoc=html;previewDialog.querySelector('.site-preview-sharing').hidden=false;previewMessage.textContent='Ссылка готова. Текущая версия страницы сохранена.';return url;
    }catch(error){previewMessage.textContent=error.message;}finally{button.disabled=false;}
  };
  $('#site-preview-comments').onclick=async()=>{const button=$('#site-preview-comments');button.disabled=true;const popup=window.open('','_blank');if(popup)popup.opener=null;try{const url=await $('#site-remote-preview').onclick();if(url){if(popup)popup.location.href=url+'?comments=1';else previewMessage.textContent='Ссылка готова. Разрешите всплывающие окна или нажмите «Открыть», затем «Обсуждения».';}else popup?.close();}finally{button.disabled=false;}};
  $('#site-preview-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#site-preview-url').value);previewMessage.textContent='Ссылка скопирована.';}catch{$('#site-preview-url').select();previewMessage.textContent='Скопируйте выделенную ссылку сочетанием Ctrl+C.';}};
  $('#site-preview-revoke').onclick=async()=>{if(!sharedProject)return;const button=$('#site-preview-revoke');button.disabled=true;try{const response=await fetch('/editor-api/site-builder/projects/'+sharedProject+'/preview',{method:'DELETE',headers:accountStamp?{'X-Editor-Account':accountStamp}:{}});if(!response.ok)throw Error('Не удалось отключить ссылку. Попробуйте снова.');sharedProject=null;previewDialog.querySelector('.site-preview-sharing').hidden=true;$('#site-preview-url').value='';$('#site-preview-open').removeAttribute('href');previewMessage.textContent='Ссылка отключена.';}catch(error){previewMessage.textContent=error.message;}finally{button.disabled=false;}};
  window.SiteBuilder={openArchive,renameCurrent:async()=>{const name=await askFileName(fileName()||state.title,'Переименовать шаблон');if(name!==null){state.fileName=name;dirty=true;await save();}},versionContext:()=>({id:projectId,revision,epoch,snapshot:JSON.stringify(state)}),canRestore:()=>!!projectId&&!dirty&&!pending&&!blocked&&!syncing,retrySave,hasFailedSave:()=>!!failedSave,historyRequest:request,applyHistory:(result,context)=>{if(context.id!==projectId||context.epoch!==epoch||context.revision!==revision||context.snapshot!==JSON.stringify(state)||dirty||pending||blocked)throw Error('Документ изменился. Откройте страницу заново, чтобы увидеть восстановленную серверную версию.');state=validateProject(result.state);revision=result.revision;dirty=false;failedSave=null;epoch++;selected=layout()[0]?.id;dirtyBlocks.clear();render();updatePreviews();status();},isDirty:()=>dirty,scope:()=>epoch,current,layout,select:value=>{selected=value;},save,beforeSwitch,newDraft,markChanged,bindPreview:frame=>{bindOriginal(frame);window.ObjectStudio?.bindPreview(frame);window.SiteDesigner?.bindPreview(frame);},resolveInstances,renders:{pages:renderPages,layout:renderLayout,access:renderAccess}};
  const previewArea=document.querySelector('.preview-area');previewArea.dataset.mode=savedPreviewMode||'both';
  const modes=document.createElement('div');modes.className='preview-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Режим предпросмотра');
  modes.innerHTML='<button data-preview-mode="both" aria-pressed="true">Оба</button><button data-preview-mode="desktop" aria-pressed="false">Десктоп</button><button data-preview-mode="tablet" aria-pressed="false">Планшет</button><button data-preview-mode="phone" aria-pressed="false">Телефон</button><button id="preview-fullscreen" aria-pressed="false">На весь экран</button>';
  document.querySelector('.preview-toolbar').append(modes);
  const stage=document.createElement('div');stage.id='desktop-stage';document.getElementById('desktop-wrap').append(stage);stage.append(document.getElementById('desktop'));
  const phoneStage=document.createElement('div');phoneStage.id='phone-stage';document.getElementById('phone-wrap').append(phoneStage);phoneStage.append(document.getElementById('phone'));
  const phonePort=document.createElement('div');phonePort.id='phone-viewport';document.getElementById('phone-wrap').before(phonePort);phonePort.append(document.getElementById('phone-wrap'));
  const phoneLabel=document.getElementById('phone-scale').parentElement;phoneLabel.firstChild.replaceWith(Object.assign(document.createElement('span'),{id:'phone-resolution',textContent:'430 × 932'}));phoneLabel.insertBefore(document.createTextNode(' · '),document.getElementById('phone-scale'));
  const phoneControls=document.createElement('div');phoneControls.className='phone-preview-controls';phoneControls.innerHTML='<label>Устройство<select id="phone-device" aria-label="Устройство телефона"><option value="430x932">iPhone 14 Pro Max · 430 × 932</option><option value="393x852">iPhone 14 Pro · 393 × 852</option><option value="390x844">iPhone 14 / 13 · 390 × 844</option><option value="375x667">iPhone SE · 375 × 667</option><option value="360x800">Android · 360 × 800</option><option value="custom">Свой размер</option></select></label><label>Масштаб телефона<select id="phone-zoom" aria-label="Масштаб телефона"><option value="fit" selected>Вписать</option>'+[25,50,75,100,125,150,200].map(v=>`<option value="${v}">${v}%</option>`).join('')+'</select></label><div id="phone-custom-size" hidden><label>Ширина, px<input id="phone-width" type="number" required min="240" max="2400" value="430"></label><label>Высота, px<input id="phone-height" type="number" required min="240" max="2400" value="932"></label></div>';
  phonePort.before(phoneControls);
  phoneControls.querySelector('#phone-device').innerHTML=phoneDeviceGroups.map(([group,items])=>`<optgroup label="${E(group)}">${items.map(([id,label,width,height])=>`<option value="${E(id)}">${E(label)} · ${width} × ${height}</option>`).join('')}</optgroup>`).join('')+'<option value="custom">Свой размер</option>';
  phoneControls.addEventListener('change',event=>{const el=event.target;if(el.id==='phone-device'){const device=phoneDevices.get(el.value);if(!device&&el.value!=='custom')return;phonePreview.device=el.value;document.getElementById('phone-custom-size').hidden=el.value!=='custom';if(device){phonePreview.width=device.width;phonePreview.height=device.height;document.getElementById('phone-width').value=device.width;document.getElementById('phone-height').value=device.height;}}else if(el.id==='phone-zoom')phonePreview.zoom=el.value;else if(['phone-width','phone-height'].includes(el.id)){if(!el.checkValidity()){el.reportValidity();return;}phonePreview[el.id==='phone-width'?'width':'height']=Number(el.value);}scaleFrames();});
  new ResizeObserver(scaleFrames).observe(phonePort);
  const zoomControl=document.createElement('label');zoomControl.id='preview-zoom-control';zoomControl.innerHTML='Масштаб десктопа <select id="preview-zoom" aria-label="Масштаб десктопа"><option value="fit">Вписать в окно</option>'+[25,50,75,100,125,150,200].map(value=>`<option value="${value}" ${value===100?'selected':''}>${value}%</option>`).join('')+'</select>';
  document.querySelector('.preview-toolbar').append(zoomControl);zoomControl.querySelector('select').addEventListener('change',event=>{(previewArea.dataset.mode==='tablet'?tabletPreview:desktopPreview).zoom=event.target.value;scaleFrames();});
  const desktopLabel=document.getElementById('desktop-scale').parentElement;
  desktopLabel.firstChild.replaceWith(Object.assign(document.createElement('span'),{id:'desktop-resolution',textContent:'1440 px'}));
  desktopLabel.insertBefore(document.createTextNode(' · '),document.getElementById('desktop-scale'));
  const desktopControls=document.createElement('div');desktopControls.id='desktop-preview-controls';desktopControls.hidden=true;
  desktopControls.innerHTML='<label>Разрешение <select id="desktop-resolution-select" aria-label="Разрешение десктопного предпросмотра">'+['768x1024','820x1180','1024x1366','1366x768','1440x900','1536x864','1600x900','1920x1080','2560x1440','3840x2160'].map(value=>`<option value="${value}" ${value==='1440x900'?'selected':''}>${value.replace('x',' × ')}</option>`).join('')+'</select></label><label>Масштаб <select id="desktop-zoom" aria-label="Масштаб десктопного предпросмотра"><option value="fit">Вписать в окно</option>'+[25,50,75,100,125,150,200].map(value=>`<option value="${value}" ${value===100?'selected':''}>${value}%</option>`).join('')+'</select></label><span class="preview-zoom-note">100% — реальный размер. Для большого экрана используйте прокрутку.</span>';
  document.querySelector('.preview-toolbar').append(desktopControls);
  desktopControls.addEventListener('change',()=>{if($('#desktop-resolution-select').value==='custom'){(previewArea.dataset.mode==='tablet'?tabletPreview:desktopPreview).zoom=$('#desktop-zoom').value;scaleFrames();return;}const [width,height]=$('#desktop-resolution-select').value.split('x').map(Number);Object.assign(previewArea.dataset.mode==='tablet'?tabletPreview:desktopPreview,{width,height,zoom:$('#desktop-zoom').value});scaleFrames();});
  function closeFull(){previewArea.classList.remove('preview-expanded');document.body.classList.remove('preview-is-expanded');$('#preview-fullscreen').textContent='На весь экран';$('#preview-fullscreen').setAttribute('aria-pressed','false');scaleFrames();$('#preview-fullscreen').focus();}
  modes.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.previewMode){previewArea.dataset.mode=button.dataset.previewMode;modes.querySelectorAll('[data-preview-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
    else if(button.id==='preview-fullscreen'){if(previewArea.classList.contains('preview-expanded'))return closeFull();previewArea.classList.add('preview-expanded');document.body.classList.add('preview-is-expanded');button.textContent='Вернуться к настройкам';button.setAttribute('aria-pressed','true');}
    scaleFrames();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&previewArea.classList.contains('preview-expanded')&&!document.querySelector('dialog[open]'))closeFull();});
  new ResizeObserver(scaleFrames).observe(document.getElementById('desktop-wrap'));
  new ResizeObserver(scaleFrames).observe(document.getElementById('phone-wrap'));
  $('#site-save').onclick=safeAction(async()=>{await save();if(tab==='pages')render();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||!state)return;
    try{
      if(button.hasAttribute('data-rename-current')){const name=await askFileName(fileName()||state.title,'Переименовать шаблон');if(name!==null){state.fileName=name;dirty=true;await save();render();}return;}
      if(button.hasAttribute('data-new-reference'))return await createReference();
      if(button.hasAttribute('data-new-blank'))return await createBlank();
      if(button.hasAttribute('data-copy-page'))return await saveCopy();
      if(button.hasAttribute('data-save-page')){await save();render();return;}
      if(button.dataset.openPage)return await openProject(button.dataset.openPage);
      if(button.dataset.insertSection){if(layout().length>=120)throw new Error('Максимум 120 блоков на странице.');const source=button.dataset.insertSection;const item={id:id(),source,name:labels[Number(source.slice(1))],visibility:'all'};layout().splice(selected?layout().findIndex(b=>b.id===selected)+1:layout().length,0,item);selected=item.id;changed();render();return;}
      if(button.dataset.selectBlock){selected=button.dataset.selectBlock;render();return;}
      if(button.dataset.deleteBlock){const i=layout().findIndex(b=>b.id===button.dataset.deleteBlock);if(i<0)return;const [removed]=state.layout.splice(i,1);if(selected===removed.id)selected=state.layout[Math.min(i,state.layout.length-1)]?.id;changed();render();return;}
      if(button.dataset.toggleBlock){const b=layout().find(x=>x.id===button.dataset.toggleBlock);if(b){b.visibility=b.visibility==='hidden'?'all':'hidden';changed();render();}return;}
      if(button.dataset.orderBlock){const i=layout().findIndex(x=>x.id===button.dataset.orderBlock),j=i+Number(button.dataset.direction);if(i>=0&&j>=0&&j<layout().length){[state.layout[i],state.layout[j]]=[state.layout[j],state.layout[i]];changed();render();}return;}
      const item=current();if(!item)return;
      if(button.dataset.instanceMedia){openInstanceMedia(item,button.dataset.instanceMedia,button);return;}
      if(button.dataset.instanceOrder){const list=item.products?.resolved||[],at=list.indexOf(button.dataset.instanceOrder),to=at+Number(button.dataset.direction);if(at<0||to<0||to>=list.length)return;[list[at],list[to]]=[list[to],list[at]];item.products.codes=[...list,...(item.products.missing||[])].join(', ');const scroll=$('#inspector').scrollTop;changed();render();$('#inspector').querySelector('[data-instance-card]')?.closest('details')?.setAttribute('open','');$('#inspector').scrollTop=scroll;$('#inspector').querySelector('[data-instance-order="'+CSS.escape(button.dataset.instanceOrder)+'"][data-direction="'+button.dataset.direction+'"]')?.focus({preventScroll:true});return;}
      if(button.dataset.staticLibrary){await openBanners(null,button.dataset.staticLibrary);return;}
      if(button.dataset.staticReset){const f=meta.pictures.find(f=>f.id===button.dataset.staticReset&&f.section===item.source);if(f&&setStaticImage(item,f.id,f.value)){changed();render();}return;}
      if(button.dataset.heroLibrary){await openBanners(button.dataset.heroLibrary);return;}
      if(button.dataset.bgReset){delete (item[bgPositionKey(button.dataset.bgReset)]||{})[button.dataset.bgDevice];changed();render();return;}
      if(button.dataset.heroClear){if(button.dataset.heroClear.startsWith('block-'))(item.blockBackgrounds||={})[button.dataset.heroClear.slice(6)]='';else{item.heroBackgrounds||={};item.heroBackgrounds[button.dataset.heroClear]='';}changed();render();return;}
      if(button.dataset.faqAction){
        item.faq||=R.faqDefaults(state,item);const i=Number(button.dataset.faqIndex),action=button.dataset.faqAction;
        if(action==='add'&&item.faq.length<30)item.faq.push({id:id(),question:'Новый вопрос',answer:'Ответ на вопрос',url:'',linkText:''});
        if(action==='delete')item.faq.splice(i,1);
        const j=i+(action==='up'?-1:1);if(['up','down'].includes(action)&&j>=0&&j<item.faq.length)[item.faq[i],item.faq[j]]=[item.faq[j],item.faq[i]];
        changed();render();return;
      }
      if(button.hasAttribute('data-block-show')){jump('[data-site-block="'+item.id+'"]');return;}
      if(button.hasAttribute('data-block-delete')){state.layout=layout().filter(b=>b!==item);selected=state.layout[0]?.id;}
      else if(button.hasAttribute('data-block-copy')){if(layout().length>=120)throw new Error('Максимум 120 блоков.');const copy=window.SiteDesigner?SiteDesigner.cloneSection(item):structuredClone(item);if(!window.SiteDesigner){copy.id=id();copy.name+=' — копия';delete copy.anchor;}layout().splice(layout().indexOf(item)+1,0,copy);selected=copy.id;}
      else if(button.hasAttribute('data-block-up')||button.hasAttribute('data-block-down')){const i=layout().indexOf(item),j=i+(button.hasAttribute('data-block-up')?-1:1);if(j>=0&&j<layout().length)[state.layout[i],state.layout[j]]=[state.layout[j],state.layout[i]];}
      else if(button.hasAttribute('data-reset-appearance')){delete item.color;delete item.background;delete item.spacing;delete item.spacingMobile;}
      else if(button.hasAttribute('data-instance-products')){
        const codes=$('#instance-codes').value,parts=[...new Set(codes.split(/[,;\s]+/).filter(Boolean))];if(parts.length>(item.source==='s11'?2:250))throw new Error('Слишком много артикулов для этого блока.');
        const ticket=epoch;button.disabled=true;const result=await api('products?codes='+encodeURIComponent(parts.join(',')));if(ticket!==epoch||!layout().includes(item))return;result.products.forEach(p=>products[p.code]=p);item.products={codes:parts.join(', '),resolved:result.products.map(p=>p.code),missing:result.missing,photos:item.products?.photos||{}};
      }else return;
      changed();render();
    }catch(error){notify(error.message);button.disabled=false;}
  });
  let draggedBlock=null;
  document.addEventListener('dragstart',event=>{const row=event.target.closest('[data-structure-id]');if(!row)return;draggedBlock={id:row.dataset.structureId,epoch};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedBlock.id);});
  document.addEventListener('dragover',event=>{if(draggedBlock?.epoch===epoch&&event.target.closest('[data-structure-id]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',event=>{const row=event.target.closest('[data-structure-id]');if(!row||draggedBlock?.epoch!==epoch)return;event.preventDefault();const a=layout().findIndex(b=>b.id===draggedBlock.id),b=layout().findIndex(b=>b.id===row.dataset.structureId);draggedBlock=null;if(a<0||b<0||a===b)return;const [item]=state.layout.splice(a,1);state.layout.splice(b,0,item);selected=item.id;changed();render();});
  document.addEventListener('dragend',()=>{draggedBlock=null;});
  document.addEventListener('input',event=>{
    const el=event.target,item=current();if(!item)return;
    if(el.dataset.bgPaint){if(!el.checkValidity()||el.type==='number'&&el.value==='')return;const p=((item[bgPaintKey(el.dataset.bgKind)]||={})[el.dataset.bgDevice]||={});p[el.dataset.bgPaint]=el.type==='number'?Number(el.value):el.value;const pad=document.querySelector('[data-bg-drag="'+el.dataset.bgKind+'"][data-bg-device="'+el.dataset.bgDevice+'"]');if(pad)pad.style.background=bgFill(bgPaint(item,el.dataset.bgKind,el.dataset.bgDevice));}
    else if(el.dataset.bgAxis){if(!el.checkValidity()||el.type==='number'&&el.value==='')return;const p=((item[bgPositionKey(el.dataset.bgKind)]||={})[el.dataset.bgDevice]||={});p[el.dataset.bgAxis]=el.type==='checkbox'?el.checked:Number(el.value);const image=document.querySelector('[data-bg-drag="'+el.dataset.bgKind+'"][data-bg-device="'+el.dataset.bgDevice+'"] img');if(image)image.style.cssText=bgStyle(bgValues(item,el.dataset.bgKind,el.dataset.bgDevice));}
    else if(el.dataset.finderAxis){if(!el.checkValidity())return;const position=((item.finderBackgroundPosition||={})[el.dataset.finderDevice]||={});position[el.dataset.finderAxis]=Number(el.value);const image=document.querySelector('[data-finder-drag="'+el.dataset.finderDevice+'"] img');if(image)image.style[el.dataset.finderAxis==='scale'?'width':el.dataset.finderAxis==='x'?'left':'top']=el.value+'%';}
    else if(el.dataset.buttonOption){const settings=((item.buttonStyles||={})[el.dataset.buttonId]||={});const key=el.dataset.buttonOption;if(key==='showIcon'){settings.icon=el.checked?'right':'none';changed();render();return;}if(el.type==='number'){if(!el.checkValidity())return;if(el.value==='')delete settings[key];else settings[key]=Number(el.value);}else settings[key]=el.value;}
    else if(el.dataset.ribbon){(item.heroRibbon||={})[el.dataset.ribbon]=el.type==='checkbox'?el.checked:el.value;}
    else if(el.hasAttribute('data-hero-fixed'))item.heroBackgroundFixed=el.checked;
    else if(el.dataset.instanceTarget){(item.linkTargets||={})[el.dataset.instanceTarget]=el.checked;}
    else if(el.dataset.faqSetting){(item.faqSettings||={})[el.dataset.faqSetting]=el.value;}
    else if(el.dataset.faqField){item.faq||=R.faqDefaults(state,item);const f=item.faq[Number(el.dataset.faqIndex)];if(!f)return;f[el.dataset.faqField]=el.value;}
    else if(el.dataset.instanceKind){if(el.dataset.instanceKind==='image'){if(!setStaticImage(item,el.dataset.fieldId,el.value))return;const preview=el.closest('.site-static-image')?.querySelector('img');if(preview)preview.src=el.value;}else(item[el.dataset.instanceKind+'s']||={})[el.dataset.fieldId]=el.value;}
    else if(el.id==='site-block-name')item.name=el.value;
    else if(el.id==='site-block-limit')item.limit=Math.max(1,Math.min(30,Number(el.value)||1));
    else if(el.id==='site-block-background')item.background=el.value;
    else if(el.id==='site-block-color')item.color=el.value;
    else return;
    changed();
  });
  document.addEventListener('change',async event=>{
    const el=event.target;try{
      if(el.id==='site-block-select'){selected=el.value;render();}
      if(el.dataset.seasonTab){const item=current();if(!item)return;const choices=new Set(item.seasons||[]);if(el.checked)choices.add(el.dataset.seasonTab);else choices.delete(el.dataset.seasonTab);item.seasons=[...choices];changed();return;}
      if(el.dataset.blockSpacing){if(!el.checkValidity()){el.reportValidity();return;}const item=current(),key=el.dataset.spacingPhone?'spacingMobile':'spacing';item[key]||={};if(el.value==='')delete item[key][el.dataset.blockSpacing];else item[key][el.dataset.blockSpacing]=Number(el.value);changed();}
      if(el.id==='site-block-anchor'){const item=current(),old=R.anchorFor(item),value=el.value.trim();if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value)||layout().some(b=>b!==item&&R.anchorFor(b)===value)){el.value=old;notify('Якорь: уникальное имя латиницей, цифры, дефис или подчёркивание.');return;}item.anchor=value;const replace=o=>{if(!o||typeof o!=='object')return;for(const key of Object.keys(o)){if(o[key]==='#'+old)o[key]='#'+value;else if(typeof o[key]==='object')replace(o[key]);}};replace(state.links);for(const b of layout()){replace(b.links);for(const r of Object.values(b.inlineLinks||{}))for(const l of r.links||[])if(l.href==='#'+old)l.href='#'+value;for(const f of b.faq||[])if(f.url==='#'+old)f.url='#'+value;}changed();render();}
      if(el.id==='site-block-visibility'){current().visibility=el.value;changed();}
      if(el.dataset.instancePhoto){current().products.photos[el.dataset.instancePhoto]=el.value;changed();}
      if(el.dataset.siteAccess){el.disabled=true;try{await request('site-builder/access/'+el.dataset.siteAccess,{allowed:el.checked});notify('Право доступа обновлено.');}catch(error){el.checked=!el.checked;throw error;}finally{el.disabled=false;}}
    }catch(error){notify(error.message);}
  });
  document.addEventListener('click',e=>{const button=e.target.closest('[data-button-reset]');if(!button)return;const item=current();if(item?.buttonStyles)delete item.buttonStyles[button.dataset.buttonReset];changed();render();});
  let finderDrag=null;
  document.addEventListener('pointerdown',e=>{const pad=e.target.closest('[data-bg-drag]'),item=current();if(!pad||!item||!pad.querySelector('img')||e.button!==0)return;e.preventDefault();const kind=pad.dataset.bgDrag,device=pad.dataset.bgDevice,p=bgValues(item,kind,device);finderDrag={pad,item,kind,device,epoch,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:p.x,y:p.y};pad.setPointerCapture(e.pointerId);});
  document.addEventListener('pointermove',e=>{const d=finderDrag;if(!d||d.pointer!==e.pointerId||d.epoch!==epoch||current()!==d.item)return;const rect=d.pad.getBoundingClientRect(),p=((d.item[bgPositionKey(d.kind)]||={})[d.device]||={});p.x=Math.round(Math.max(-100,Math.min(200,d.x+(e.clientX-d.startX)/rect.width*100)));p.y=Math.round(Math.max(-100,Math.min(200,d.y+(e.clientY-d.startY)/rect.height*100)));d.pad.querySelector('img').style.cssText=bgStyle(bgValues(d.item,d.kind,d.device));for(const axis of ['x','y'])document.querySelector('[data-bg-kind="'+d.kind+'"][data-bg-device="'+d.device+'"][data-bg-axis="'+axis+'"]').value=p[axis];});
  const finishFinderDrag=e=>{const d=finderDrag;if(!d||d.pointer!==e.pointerId)return;finderDrag=null;if(d.epoch===epoch&&current()===d.item)changed();};
  document.addEventListener('pointerup',finishFinderDrag);document.addEventListener('pointercancel',finishFinderDrag);document.addEventListener('lostpointercapture',finishFinderDrag);
  window.addEventListener('beforeunload',e=>{if(!window.__WORKSPACE_LEAVING__&&(dirty||pending)){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(()=>{});}});
  (async()=>{try{
    window.HaslBuilderBoot?.stage('Загружаем шаблон и настройки…');
    const [template,reference,data,profile]=await Promise.all([fetch('/site-builder/assets/template.html').then(r=>r.text()),api('reference'),api('content'),request('me')]);
    meta=R.init(template);content=data;user=profile;if($('#studio-account-name'))$('#studio-account-name').textContent=profile.name||profile.login||'Профиль';if($('.account-avatar'))$('.account-avatar').textContent=(profile.name||profile.login||'Х').slice(0,1).toUpperCase();state=validateProject(reference);state.autoRefresh=false;
    $('#site-access').hidden=!['admin','moderator'].includes(user.role);
    window.HaslBuilderBoot?.stage('Подготавливаем страницу и предпросмотр…');
    const uid=new URLSearchParams(location.search).get('page');if(await recoverWorkspace(uid)){finishBoot();return;}if(uid){await openProject(uid);finishBoot();return;}
    layout();selected=layout()[0]?.id;await resolveAll();render();updatePreviews();status();
    finishBoot();
  }catch(error){workspaceBootError=error;resolveWorkspaceReady();$('#inspector').innerHTML='<h2>Не удалось открыть конструктор</h2><p>'+E(error.message)+'</p><a href="/">Вернуться к редактору</a>';$('#save-status').textContent='Ошибка загрузки';if(window.HaslBuilderBoot)window.HaslBuilderBoot.fail();else finishBoot();}})();
})();
