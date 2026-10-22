/* Server project adapter and block inspector for the existing HASL constructor. */
(() => {
  'use strict';
  let projectId=null,revision=0,dirty=false,blocked=false,pending=null,epoch=0,selected=null,user=null,accountStamp='';
  accountStamp=document.querySelector('meta[name="editor-account-context"]')?.content||'';
  let pages=[],users=[],loadTicket=0,switching=false;
  const labels=['Первый экран и акции','Витрина товаров','Подбор по параметрам','Коллекции','Доставка и преимущества','Отзывы','Блог','Сообщество','Вопросы и ответы','Выбор размера'];
  const visibility={all:'На всех устройствах',desktop:'Только на компьютере',phone:'Только на телефоне',hidden:'Скрыт везде'};
  const layout=()=>state.layout||(state.layout=meta.sections.filter(s=>!s.optional).map((s,i)=>({id:'block-'+i,source:s.id,name:labels[i]||s.name,visibility:'all'})));
  const current=()=>layout().find(b=>b.id===selected);
  const id=()=>crypto.randomUUID();
  async function request(path,data){
    const response=await fetch('/editor-api/'+path,{headers:{'Content-Type':'application/json',...(accountStamp?{'X-Editor-Account':accountStamp}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'Ошибка сервера');error.status=response.status;throw error;}return result;
  }
  const safeAction=fn=>async()=>{try{await fn();}catch(error){notify(error.message);}};
  function status(){ $('#save-status').textContent=blocked?'Сохранение остановлено — создайте копию':dirty?'Есть несохранённые изменения':projectId?'Все изменения сохранены':'Эталон · создайте новую страницу'; }
  function markChanged(){dirty=true;status();clearTimeout(saveTimer);if(projectId&&!blocked)saveTimer=setTimeout(()=>save().catch(()=>{}),700);}
  async function save(){
    clearTimeout(saveTimer);if(pending){await pending;if(dirty)return save();return;}
    if(blocked)throw new Error('Сохранение остановлено. Скачайте JSON или сохраните отдельную копию.');
    if(!dirty&&projectId)return;
    const snapshot=JSON.stringify(state),ticket=epoch,oldId=projectId;
    pending=(async()=>{
      try{
        const result=await request('site-builder/projects'+(oldId?'/'+oldId:''),oldId?{revision,state:JSON.parse(snapshot)}:JSON.parse(snapshot));
        if(ticket!==epoch)return;
        projectId=result.id;revision=result.revision;dirty=JSON.stringify(state)!==snapshot;
        history.replaceState(null,'','?page='+projectId);status();
      }catch(error){if(ticket===epoch){blocked=true;status();notify(error.message);}throw error;}
      finally{pending=null;}
    })();
    await pending;if(dirty&&!blocked)return save();
  }
  async function beforeSwitch(){if(syncing)throw new Error('Дождитесь завершения обновления данных.');if(pending)await pending;if(dirty)await save();clearTimeout(previewTimer);epoch++;}
  function newDraft(){projectId=null;revision=0;blocked=false;dirty=true;epoch++;history.replaceState(null,'',location.pathname);status();}
  async function resolveInstances(){for(const item of layout())if(item.products){const result=await api('products?codes='+encodeURIComponent(item.products.codes));result.products.forEach(p=>products[p.code]=p);item.products.resolved=result.products.map(p=>p.code);item.products.missing=result.missing;}}
  async function transition(action){
    if(switching)return;switching=true;const workspace=document.querySelector('.workspace');workspace.inert=true;$('#site-save').disabled=true;
    try{await action();}finally{switching=false;workspace.inert=false;$('#site-save').disabled=false;}
  }
  async function openProject(uid){return transition(async()=>{await beforeSwitch();const result=await request('site-builder/projects/'+uid);state=validateProject(result.state);projectId=result.id;revision=result.revision;blocked=false;dirty=false;dirtyBlocks.clear();await resolveAll();await resolveInstances();selected=layout()[0]?.id;history.replaceState(null,'','?page='+uid);tab='layout';render();updatePreviews();status();scheduleSync();});}
  async function createReference(){return transition(async()=>{await beforeSwitch();state=validateProject(await request('site-builder/reference'));state.autoRefresh=false;newDraft();layout();selected=layout()[0]?.id;dirtyBlocks.clear();await resolveAll();await save();tab='layout';render();updatePreviews();});}
  async function saveCopy(){return transition(async()=>{if(pending)try{await pending;}catch{}clearTimeout(saveTimer);newDraft();state.title=(state.title.slice(0,185)+' — копия');await save();notify('Отдельная копия сохранена.');render();});}
  function renderPages(){
    const ticket=++loadTicket;request('site-builder/projects').then(data=>{if(ticket!==loadTicket||tab!=='pages')return;pages=data;const list=$('#site-page-list');if(list)list.innerHTML=pages.map(p=>`<button class="site-page" data-open-page="${E(p.id)}"><strong>${E(p.title)}</strong><span>${E(new Date(p.updated).toLocaleString('ru-RU'))}</span></button>`).join('')||'<p>У вас пока нет страниц. Создайте первую из эталона.</p>';}).catch(e=>notify(e.message));
    return `<h2>Мои страницы</h2><p class="intro">Каждая страница хранится отдельно в вашем аккаунте. Эталон ХАСЛ остаётся неизменным.</p><button class="primary full" data-new-reference>Создать новую из эталона</button><button class="full" data-copy-page>Сохранить отдельную копию</button>${field('Название страницы',state.title,'id="page-title" maxlength="200"','text')}<button class="full" data-save-page>Сохранить страницу</button><h3 class="section-top">Сохранённые страницы</h3><div id="site-page-list" role="status">Загружаем список…</div>`;
  }
  function settingsFields(item){
    let result='';
    for(const [kind,fields] of [['text',meta.fields],['link',meta.links],['image',meta.pictures]])result+=fields.filter(f=>f.section===item.source).map(f=>field(kind==='text'?(f.value.slice(0,65)||'Текст'):kind==='link'?'Ссылка: '+f.label.slice(0,40):'Фото: '+f.label,item[kind+'s']?.[f.id]??state[kind+'s']?.[f.id]??f.value,`data-instance-kind="${kind}" data-field-id="${f.id}"`,kind==='text'?'textarea':'text')).join('');
    if(item.source==='s8')return meta.fields.filter(f=>f.section==='s8'&&f.label==='h2').map(f=>field('Заголовок раздела',item.texts?.[f.id]??state.texts?.[f.id]??f.value,`data-instance-kind="text" data-field-id="${f.id}"`,'textarea')).join('');
    return result;
  }
  const faqItems=item=>item.faq||R.faqDefaults(state,item);
  function faqSettings(item){return `<details class="text-section" open><summary>Пункты спойлера</summary><p class="muted">До 30 вопросов. Ответ — обычный текст; ссылку задайте отдельно.</p>${faqItems(item).map((f,i,a)=>`<div class="faq-setting">${field('Вопрос '+(i+1),f.question,`data-faq-index="${i}" data-faq-field="question" maxlength="500"`,'textarea')}${field('Ответ',f.answer,`data-faq-index="${i}" data-faq-field="answer" maxlength="10000"`,'textarea')}${field('Ссылка в ответе',f.url,`data-faq-index="${i}" data-faq-field="url" maxlength="2000"`,'text')}${field('Текст ссылки',f.linkText,`data-faq-index="${i}" data-faq-field="linkText" maxlength="300"`,'text')}<div class="row wrap"><button data-faq-action="up" data-faq-index="${i}" ${i===0?'disabled':''}>Выше</button><button data-faq-action="down" data-faq-index="${i}" ${i===a.length-1?'disabled':''}>Ниже</button><button data-faq-action="delete" data-faq-index="${i}">Удалить вопрос</button></div></div>`).join('')}<button data-faq-action="add" ${faqItems(item).length>=30?'disabled':''}>Добавить вопрос</button></details>`;}
  function renderLayout(){
    const items=layout();if(!current())selected=items[0]?.id;const item=current();
    const productsSource=item&&['s0','s1','s3'].includes(item.source);
    return `<h2>Блоки страницы</h2><p class="intro">Вставляйте секции из эталона, меняйте порядок и настройте каждую отдельно.</p><div class="site-insert" role="toolbar" aria-label="Вставка блоков">${meta.sections.map((s,i)=>`<button data-insert-section="${s.id}">${E(labels[i]||s.name)}</button>`).join('')}</div><ol class="site-structure" aria-label="Структура страницы">${items.map((b,i)=>`<li draggable="true" data-structure-id="${E(b.id)}" class="${b.id===selected?'selected':''} ${b.visibility==='hidden'?'is-hidden':''}"><span class="site-drag" aria-hidden="true">⠿</span><button type="button" data-select-block="${E(b.id)}" class="site-structure-name">${E(b.name)}</button><button type="button" data-toggle-block="${E(b.id)}" aria-label="${b.visibility==='hidden'?'Показать':'Скрыть'} ${E(b.name)}" aria-pressed="${b.visibility==='hidden'}" title="${b.visibility==='hidden'?'Вернуть в экспорт':'Скрыть и исключить из экспорта'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${b.visibility==='hidden'?'<path d="m3 3 18 18"/>':''}</svg></button><button type="button" data-delete-block="${E(b.id)}" class="danger" aria-label="Удалить блок: ${E(b.name)}" title="Удалить блок"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button><button type="button" data-order-block="${E(b.id)}" data-direction="-1" aria-label="Выше: ${E(b.name)}" ${i===0?'disabled':''}>↑</button><button type="button" data-order-block="${E(b.id)}" data-direction="1" aria-label="Ниже: ${E(b.name)}" ${i===items.length-1?'disabled':''}>↓</button></li>`).join('')}</ol><p class="muted">Перетащите строку или используйте стрелки. Перечёркнутый глаз исключает блок из экспорта.</p><label class="field"><span>Блок на странице</span><select id="site-block-select">${items.map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${E(b.name)} · ${E(visibility[b.visibility]||visibility.all)}</option>`).join('')}</select></label>${!item?'<p>Страница пустая. Выберите блок в панели вставки.</p>':`
    <div class="row wrap"><button data-block-up ${items.indexOf(item)===0?'disabled':''}>Выше</button><button data-block-down ${items.indexOf(item)===items.length-1?'disabled':''}>Ниже</button><button data-block-copy>Дублировать</button><button data-block-delete class="danger">Удалить</button><button data-block-show>Показать блок</button></div>
    ${field('Название блока в конструкторе',item.name,'id="site-block-name" maxlength="120"','text')}
    <label class="field"><span>Видимость блока</span><select id="site-block-visibility">${Object.entries(visibility).map(([k,v])=>`<option value="${k}" ${item.visibility===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <details class="text-section"><summary>Оформление блока</summary>${field('Внутренние отступы сверху и снизу, px',item.spacing??32,'id="site-block-spacing" min="0" max="160"','number')}${field('Цвет фона',item.background||'#ffffff','id="site-block-background"','color')}${field('Цвет текста',item.color||'#202020','id="site-block-color"','color')}<button data-reset-appearance>Вернуть оформление эталона</button></details>
    ${productsSource?`<details class="text-section"><summary>Товары этого блока</summary>${field('Артикулы для этого экземпляра',item.products?.codes||'','id="instance-codes"')}<button data-instance-products>Применить товары к блоку</button><p class="muted">${item.source==='s0'?'Не более двух товаров.':'До 250 товаров.'} Фото или видео можно выбрать ниже после применения.</p>${(item.products?.missing||[]).length?`<p class="notice error">Не найдены: ${E(item.products.missing.join(', '))}</p>`:''}${(item.products?.resolved||[]).map(code=>{const p=products[code];return p?`<label class="field"><span>${E(p.name)}</span><select data-instance-photo="${E(code)}">${[...p.photos,...(p.videos||[])].map((url,i)=>`<option value="${E(url)}" ${item.products.photos?.[code]===url?'selected':''}>${i<p.photos.length?'Фото '+(i+1):'Видео '+(i-p.photos.length+1)}</option>`).join('')}</select></label>`:'';}).join('')}</details>`:''}
    ${['s5','s6'].includes(item.source)?field('Количество материалов в этом блоке',item.limit||6,'id="site-block-limit" min="1" max="30"','number'):''}
    ${item.source==='s1'?`<fieldset class="text-section"><legend>Сезонные плашки над товарами</legend><p class="muted">Выберите нужные фильтры или снимите все галочки.</p>${Object.entries({winter:'Зима',demi:'Демисезон',summer:'Лето'}).map(([key,label])=>`<label class="checkline"><input type="checkbox" data-season-tab="${key}" ${(item.seasons||[]).includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset>`:''}
    ${item.source==='s8'?faqSettings(item):''}
    <details class="text-section" open><summary>Тексты, ссылки и изображения</summary>${settingsFields(item)||'<p>Материалы этого блока настраиваются в разделе «Отзывы» или «Блог».</p>'}</details>`}`;
  }
  function renderAccess(){
    if(!['admin','moderator'].includes(user?.role))return '<h2>Доступ закрыт</h2>';
    request('users').then(data=>{users=data.filter(u=>u.role==='editor');const list=$('#site-access-list');if(list)list.innerHTML=users.map(u=>`<label class="checkline"><input type="checkbox" data-site-access="${E(u.id)}" ${u.siteAccess?'checked':''}>${E(u.name)}${u.blocked?' · аккаунт заблокирован':''}</label>`).join('')||'<p>Редакторов пока нет.</p>';}).catch(e=>notify(e.message));
    return '<h2>Доступ редакторов</h2><p class="intro">Администраторы и модераторы имеют доступ всегда. Разрешение редактора можно выдать или отозвать здесь. Блокировка аккаунта имеет приоритет.</p><div id="site-access-list" role="status">Загрузка…</div>';
  }
  let editingFrame=null,mirrorTimer;
  function bindPreview(frame){
    const doc=frame.contentDocument;
    const style=doc.createElement('style');style.textContent='[data-editor-text]{cursor:text}[data-editor-text]:hover{outline:1px dashed #527000;outline-offset:3px}[data-editor-text]:focus{outline:2px solid #527000;outline-offset:3px;min-width:1ch}';doc.head.append(style);
    doc.querySelectorAll('[data-editor-text]').forEach(node=>{
      node.contentEditable='plaintext-only';node.setAttribute('role','textbox');node.setAttribute('aria-label','Редактировать текст: '+node.textContent.trim().slice(0,65));node.spellcheck=true;
      node.addEventListener('focus',()=>{editingFrame=frame;});
      node.addEventListener('click',e=>{if(node.closest('a'))e.preventDefault();e.stopPropagation();});
      node.addEventListener('paste',e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');doc.execCommand('insertText',false,value);});
      node.addEventListener('input',()=>{
        const item=layout().find(b=>b.id===node.closest('[data-site-block]')?.dataset.siteBlock);if(!item)return;
        const key=node.dataset.editorText,value=node.innerText;
        const faq=item.faq?.find(f=>key==='faq-'+f.id+'-question'||key==='faq-'+f.id+'-answer');
        if(faq){const field=key.endsWith('-question')?'question':'answer';faq[field]=value;const input=document.querySelector(`[data-faq-index="${item.faq.indexOf(faq)}"][data-faq-field="${field}"]`);if(input&&selected===item.id)input.value=value;}else (item.texts||={})[key]=value;
        markChanged();
        const input=document.querySelector('[data-instance-kind="text"][data-field-id="'+key+'"]');if(input&&selected===item.id)input.value=value;
        clearTimeout(mirrorTimer);mirrorTimer=setTimeout(()=>{
          const other=document.getElementById(frame.id==='desktop'?'phone':'desktop'),otherDoc=other.contentDocument;
          const target=otherDoc?.querySelector('[data-site-block="'+item.id+'"] [data-editor-text="'+key+'"]');if(target)target.textContent=value;
        },120);
      });
      node.addEventListener('blur',()=>{if(editingFrame===frame)editingFrame=null;});
      node.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(()=>{});}if(e.key==='Escape'){node.blur();document.getElementById('preview-fullscreen').focus();}});
    });
  }
  window.SiteBuilder={scope:()=>epoch,save,beforeSwitch,newDraft,markChanged,bindPreview,resolveInstances,renders:{pages:renderPages,layout:renderLayout,access:renderAccess}};
  const previewArea=document.querySelector('.preview-area');
  const modes=document.createElement('div');modes.className='preview-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Режим предпросмотра');
  modes.innerHTML='<button data-preview-mode="both" aria-pressed="true">Оба</button><button data-preview-mode="desktop" aria-pressed="false">Десктоп</button><button data-preview-mode="phone" aria-pressed="false">Телефон</button><button id="preview-fullscreen" aria-pressed="false">На весь экран</button>';
  document.querySelector('.preview-toolbar').append(modes);
  const stage=document.createElement('div');stage.id='desktop-stage';document.getElementById('desktop-wrap').append(stage);stage.append(document.getElementById('desktop'));
  const desktopLabel=document.getElementById('desktop-scale').parentElement;
  desktopLabel.firstChild.replaceWith(Object.assign(document.createElement('span'),{id:'desktop-resolution',textContent:'1440 px'}));
  desktopLabel.insertBefore(document.createTextNode(' · '),document.getElementById('desktop-scale'));
  const desktopControls=document.createElement('div');desktopControls.id='desktop-preview-controls';desktopControls.hidden=true;
  desktopControls.innerHTML='<label>Разрешение <select id="desktop-resolution-select" aria-label="Разрешение десктопного предпросмотра">'+['1366x768','1440x900','1536x864','1600x900','1920x1080','2560x1440','3840x2160'].map(value=>`<option value="${value}" ${value==='1920x1080'?'selected':''}>${value.replace('x',' × ')}</option>`).join('')+'</select></label><label>Масштаб <select id="desktop-zoom" aria-label="Масштаб десктопного предпросмотра"><option value="fit">Вписать в окно</option>'+[25,50,75,100,125,150,200].map(value=>`<option value="${value}">${value}%</option>`).join('')+'</select></label><span class="preview-zoom-note">100% — реальный размер. Для большого экрана используйте прокрутку.</span>';
  document.querySelector('.preview-toolbar').append(desktopControls);
  desktopControls.addEventListener('change',()=>{const [width,height]=$('#desktop-resolution-select').value.split('x').map(Number);Object.assign(desktopPreview,{width,height,zoom:$('#desktop-zoom').value});scaleFrames();});
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
  $('#site-save').onclick=safeAction(save);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||!state)return;
    try{
      if(button.hasAttribute('data-new-reference'))return await createReference();
      if(button.hasAttribute('data-copy-page'))return await saveCopy();
      if(button.hasAttribute('data-save-page'))return await save();
      if(button.dataset.openPage)return await openProject(button.dataset.openPage);
      if(button.dataset.insertSection){if(layout().length>=60)throw new Error('Максимум 60 блоков на странице.');const source=button.dataset.insertSection;const item={id:id(),source,name:labels[Number(source.slice(1))],visibility:'all'};layout().splice(selected?layout().findIndex(b=>b.id===selected)+1:layout().length,0,item);selected=item.id;changed();render();return;}
      if(button.dataset.selectBlock){selected=button.dataset.selectBlock;render();return;}
      if(button.dataset.deleteBlock){const i=layout().findIndex(b=>b.id===button.dataset.deleteBlock);if(i<0)return;const [removed]=state.layout.splice(i,1);if(selected===removed.id)selected=state.layout[Math.min(i,state.layout.length-1)]?.id;changed();render();return;}
      if(button.dataset.toggleBlock){const b=layout().find(x=>x.id===button.dataset.toggleBlock);if(b){b.visibility=b.visibility==='hidden'?'all':'hidden';changed();render();}return;}
      if(button.dataset.orderBlock){const i=layout().findIndex(x=>x.id===button.dataset.orderBlock),j=i+Number(button.dataset.direction);if(i>=0&&j>=0&&j<layout().length){[state.layout[i],state.layout[j]]=[state.layout[j],state.layout[i]];changed();render();}return;}
      const item=current();if(!item)return;
      if(button.dataset.faqAction){
        item.faq||=R.faqDefaults(state,item);const i=Number(button.dataset.faqIndex),action=button.dataset.faqAction;
        if(action==='add'&&item.faq.length<30)item.faq.push({id:id(),question:'Новый вопрос',answer:'Ответ на вопрос',url:'',linkText:''});
        if(action==='delete')item.faq.splice(i,1);
        const j=i+(action==='up'?-1:1);if(['up','down'].includes(action)&&j>=0&&j<item.faq.length)[item.faq[i],item.faq[j]]=[item.faq[j],item.faq[i]];
        changed();render();return;
      }
      if(button.hasAttribute('data-block-show')){jump('[data-site-block="'+item.id+'"]');return;}
      if(button.hasAttribute('data-block-delete')){state.layout=layout().filter(b=>b!==item);selected=state.layout[0]?.id;}
      else if(button.hasAttribute('data-block-copy')){if(layout().length>=60)throw new Error('Максимум 60 блоков.');const copy=structuredClone(item);copy.id=id();copy.name+=' — копия';layout().splice(layout().indexOf(item)+1,0,copy);selected=copy.id;}
      else if(button.hasAttribute('data-block-up')||button.hasAttribute('data-block-down')){const i=layout().indexOf(item),j=i+(button.hasAttribute('data-block-up')?-1:1);if(j>=0&&j<layout().length)[state.layout[i],state.layout[j]]=[state.layout[j],state.layout[i]];}
      else if(button.hasAttribute('data-reset-appearance')){delete item.color;delete item.background;delete item.spacing;}
      else if(button.hasAttribute('data-instance-products')){
        const codes=$('#instance-codes').value,parts=[...new Set(codes.split(/[,;\s]+/).filter(Boolean))];if(parts.length>(item.source==='s0'?2:250))throw new Error('Слишком много артикулов для этого блока.');
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
    if(el.dataset.faqField){item.faq||=R.faqDefaults(state,item);const f=item.faq[Number(el.dataset.faqIndex)];if(!f)return;f[el.dataset.faqField]=el.value;}
    else if(el.dataset.instanceKind){(item[el.dataset.instanceKind+'s']||={})[el.dataset.fieldId]=el.value;}
    else if(el.id==='site-block-name')item.name=el.value;
    else if(el.id==='site-block-spacing')item.spacing=Math.max(0,Math.min(160,Number(el.value)||0));
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
      if(el.id==='site-block-visibility'){current().visibility=el.value;changed();}
      if(el.dataset.instancePhoto){current().products.photos[el.dataset.instancePhoto]=el.value;changed();}
      if(el.dataset.siteAccess){el.disabled=true;try{await request('site-builder/access/'+el.dataset.siteAccess,{allowed:el.checked});notify('Право доступа обновлено.');}catch(error){el.checked=!el.checked;throw error;}finally{el.disabled=false;}}
    }catch(error){notify(error.message);}
  });
  window.addEventListener('beforeunload',e=>{if(dirty||pending){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(()=>{});}});
  (async()=>{try{
    const [template,reference,data,profile]=await Promise.all([fetch('/site-builder/assets/template.html').then(r=>r.text()),api('reference'),api('content'),request('me')]);
    meta=R.init(template);content=data;user=profile;state=validateProject(reference);state.autoRefresh=false;
    $('#site-access').hidden=!['admin','moderator'].includes(user.role);
    const uid=new URLSearchParams(location.search).get('page');if(uid){await openProject(uid);return;}
    layout();selected=layout()[0]?.id;await resolveAll();render();updatePreviews();status();
  }catch(error){$('#inspector').innerHTML='<h2>Не удалось открыть конструктор</h2><p>'+E(error.message)+'</p><a href="/">Вернуться к редактору</a>';$('#save-status').textContent='Ошибка загрузки';}})();
})();
