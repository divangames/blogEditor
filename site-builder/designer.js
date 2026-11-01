/* Visual editing adapter for the canonical HASL state and existing CAS saves. */
(() => {
  'use strict';
  const X=window.SiteElements;
  let chosen=null,device='desktop',editing=true,historyEpoch=-1,baseline='',undo=[],redo=[],lastGroup='',lastTime=0,libraryTicket=0;
  const builder=()=>window.SiteBuilder;
  const item=()=>builder().current();
  const element=()=>item()?.elements?.find(e=>e.id===chosen);
  const makeId=()=>crypto.randomUUID();
  const visibility={all:'На всех устройствах',desktop:'Только компьютер',phone:'Только телефон',hidden:'Скрыт'};
  const select=(label,key,value,options)=>`<label class="field"><span>${E(label)}</span><select ${key}>${(Array.isArray(options)?options:Object.entries(options)).map(([v,name])=>`<option value="${E(v)}" ${String(value)===String(v)?'selected':''}>${E(name)}</option>`).join('')}</select></label>`;
  function observe(){if(!state)return;if(historyEpoch!==builder().scope()){historyEpoch=builder().scope();baseline=JSON.stringify(state);undo=[];redo=[];chosen=null;lastGroup='';}historyButtons();}
  function historyButtons(){for(const a of document.querySelectorAll('#site-undo,[data-site-history=undo]')){a.disabled=!undo.length;a.title='Шаг назад · Ctrl+Z / ⌘Z';a.setAttribute('aria-label','Шаг назад');a.setAttribute('aria-keyshortcuts','Control+z Meta+z');}for(const b of document.querySelectorAll('#site-redo,[data-site-history=redo]')){b.disabled=!redo.length;b.title='Шаг вперёд · Ctrl+Shift+Z / Ctrl+Y';b.setAttribute('aria-label','Шаг вперёд');b.setAttribute('aria-keyshortcuts','Control+Shift+z Control+y Meta+Shift+z');}}
  function record(){
    if(!state)return;if(historyEpoch!==builder().scope()){observe();return;}
    const next=JSON.stringify(state);if(next===baseline)return;
    const focused=document.activeElement,active=focused?.tagName==='IFRAME'?focused.contentDocument?.activeElement:focused;
    const group=(active?.matches('input,textarea,[contenteditable]')?'input:'+active.tagName+':'+(active.dataset.editorText||active.dataset.styleProp||active.dataset.elementProp||active.id||active.outerHTML.slice(0,180)):'');
    const now=Date.now();if(!group||group!==lastGroup||now-lastTime>700){undo.push(baseline);while(undo.length>1&&(undo.length>80||undo.reduce((n,s)=>n+s.length*2,0)>16_000_000))undo.shift();}
    baseline=next;redo=[];lastGroup=group;lastTime=now;historyButtons();
  }
  function restore(direction){
    if(window.ObjectStudio?.cancelGesture())return;
    if(syncing){notify('Дождитесь завершения обновления данных.');return;}
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;if(!from.length)return;
    if(document.activeElement?.tagName==='IFRAME'){const frame=document.activeElement;window.ObjectStudio?.historyFocus(frame.id);frame.blur();}
    to.push(JSON.stringify(state));state=JSON.parse(from.pop());baseline=JSON.stringify(state);lastGroup='';chosen=null;dirtyBlocks.clear();
    for(const [key,b] of Object.entries(state.blocks))if(b.codes!==b.appliedCodes)dirtyBlocks.add(key);
    builder().markChanged({normalize:false});render();updatePreviews();historyButtons();
  }
  function createElement(type){
    const e={id:makeId(),type,visibility:'all',span:1,mobileSpan:1,style:{},mobileStyle:{},rect:{x:24,y:24,width:300,height:100},mobileRect:{x:16,y:24,width:280,height:100}};
    if(type==='heading')Object.assign(e,{text:'Новый заголовок',tag:'h2'});
    if(type==='text')e.text='Добавьте текст. Расскажите о товаре, услуге или предложении.';
    if(type==='button')Object.assign(e,{text:'Подробнее',href:''});
    if(type==='image')Object.assign(e,{src:'',alt:''});
    if(type==='video')Object.assign(e,{src:'',poster:''});
    if(type==='spacer')e.height=40;
    if(type==='form')Object.assign(e,{text:'Отправить',action:''});
    return e;
  }
  function cloneSection(source){
    const copy=structuredClone(source);copy.id=makeId();delete copy.backgroundFolder;delete copy.anchor;copy.name=(copy.name||'Секция')+' — копия';
    const ids=new Map();for(const e of copy.elements||[]){const old=e.id;e.id=makeId();for(const prefix of ['element-','text-element-','link-element-','image-element-'])ids.set(prefix+old,prefix+e.id);}
    // Object keys are scoped to a section; rekey custom elements and copied HTML IDs as well.
    const addedIds=new Map();for(const record of copy.addedObjects||[]){const old=record.id;record.id=makeId();addedIds.set(old,record.id);}
    const rename=value=>{if(typeof value!=='string')return value;if(ids.has(value))return ids.get(value);for(const [old,next] of ids)if(old.startsWith('element-')&&value.startsWith('child-'+old.slice(8)+'-'))value='child-'+next.slice(8)+value.slice(('child-'+old.slice(8)).length);for(const [old,next] of addedIds)value=value.replaceAll(old,next);return value;};
    const visit=value=>{if(Array.isArray(value))return value.map(visit);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[rename(k),visit(v)]));return rename(value);};
    for(const key of ['texts','inlineLinks','elementStyles','objects','addedObjects','objectGroups'])if(copy[key])copy[key]=visit(copy[key]);
    return copy;
  }
  function insertSection(mode='grid',preset,{preserveAnchor=false}={}){
    if(builder().layout().length>=120)throw new Error('Максимум 120 секций на странице.');
    const section=preset?cloneSection(preset):{id:makeId(),source:'custom',name:mode==='free'?'Свободная секция':'Своя секция',visibility:'all',mode,columns:1,mobileColumns:1,gap:24,contentWidth:1200,height:600,mobileHeight:700,elements:[]};
    if(preserveAnchor&&preset?.anchor&&!builder().layout().some(block=>R.anchorFor(block)===preset.anchor))section.anchor=preset.anchor;
    const i=builder().layout().findIndex(b=>b===item());state.layout.splice(i<0?state.layout.length:i+1,0,section);builder().select(section.id);chosen=null;tab='elements';changed();render();jump('[data-site-block="'+section.id+'"]');
  }
  function styleEditor(value,attr){
    const input=(label,key,min,max,step=1)=>field(label,value[key]??'',`${attr} data-style-prop="${key}" min="${min}" max="${max}" step="${step}" placeholder="По шаблону"`,'number');
    return `<p class="muted">Montserrat: Thin 100 → Black 900. Выберите насыщенность и обычный/курсивный наклон — доступны все 18 сочетаний.</p><div class="designer-two">${select('Шрифт',attr+' data-style-prop="fontFamily"',value.fontFamily??'',{'':'По шаблону',Arial:'Arial',Montserrat:'Montserrat',Manrope:'Manrope',Georgia:'Georgia',Verdana:'Verdana'})}${select('Наклон',attr+' data-style-prop="fontStyle"',value.fontStyle??'',{'':'По шаблону',normal:'Обычный',italic:'Курсив'})}${select('Подчёркивание',attr+' data-style-prop="textDecoration"',value.textDecoration??'',{'':'По шаблону',none:'Без линии',underline:'Подчёркнутый','line-through':'Зачёркнутый'})}${input('Размер текста, px','fontSize',8,200)}${select('Насыщенность / начертание',attr+' data-style-prop="fontWeight"',value.fontWeight??'',X.fontWeights.some(([w])=>w===value.fontWeight)||value.fontWeight===undefined?X.fontWeights:[...X.fontWeights,[value.fontWeight,'Своё — '+value.fontWeight]])}${input('Межстрочный интервал','lineHeight',.6,3,.05)}${input('Межбуквенный интервал, px','letterSpacing',-5,30,.1)}${field('Цвет текста',value.color||'#20241f',attr+' data-style-prop="color"','color')}${field('Цвет фона',value.background||'#ffffff',attr+' data-style-prop="background"','color')}${select('Выравнивание',attr+' data-style-prop="align"',value.align??'',{'':'По шаблону',left:'Слева',center:'По центру',right:'Справа'})}${input('Скругление, px','radius',0,200)}${input('Внутренний отступ, px','padding',0,200)}${input('Отступ сверху, px','marginTop',0,400)}${input('Отступ снизу, px','marginBottom',0,400)}${input('Ширина, %','width',1,100)}${input('Прозрачность','opacity',0,1,.05)}</div><button data-designer-action="reset-style">Сбросить оформление ${device==='phone'?'телефона':'компьютера'}</button>`;
  }
  function renderElements(){
    const section=item(),e=element();
    const header=`<h2>Элементы и оформление</h2><p class="intro">Выберите текст, картинку или кнопку на холсте. Своя секция собирается из элементов.</p><div class="row wrap"><button data-designer-action="add-grid">Добавить свою секцию</button><button data-designer-action="add-free">Свободная секция</button></div>`;
    if(!section)return header;
    const top=`<div class="designer-selected"><strong>${E(section.name)}</strong><button data-designer-action="section-settings" class="small">Настройки секции</button></div>`;
    const palette=section.source==='custom'?`<div class="designer-palette" role="toolbar" aria-label="Добавить элемент">${Object.entries(X.types).map(([type,name])=>`<button data-add-element="${type}">${E(name)}</button>`).join('')}</div><ol class="designer-elements" aria-label="Элементы секции">${section.elements.map((el,i)=>`<li><button data-choose-element="${el.id}" aria-pressed="${el.id===chosen}"><span>${E(X.types[el.type])}</span><small>${E((section.texts?.['element-'+el.id]??el.text??el.alt??'').slice(0,45))}</small></button><button class="small" data-element-order="${el.id}" data-direction="-1" aria-label="Поднять элемент ${i+1}" ${!i?'disabled':''}>↑</button><button class="small" data-element-order="${el.id}" data-direction="1" aria-label="Опустить элемент ${i+1}" ${i===section.elements.length-1?'disabled':''}>↓</button></li>`).join('')}</ol>`:'';
    const customSettings=section.source==='custom'?`<details class="text-section" ${!chosen?'open':''}><summary>Сетка и размеры секции</summary>${select('Размещение','data-section-prop="mode"',section.mode||'grid',{grid:'Сетка колонок',free:'Свободное размещение'})}<div class="designer-two">${field('Колонок на компьютере',section.columns||1,'data-section-prop="columns" min="1" max="4"','number')}${field('Колонок на телефоне',section.mobileColumns||1,'data-section-prop="mobileColumns" min="1" max="4"','number')}${field('Промежуток, px',section.gap??24,'data-section-prop="gap" min="0" max="120"','number')}${field('Ширина содержимого, px',section.contentWidth||1200,'data-section-prop="contentWidth" min="280" max="1920"','number')}${section.mode==='free'?field('Высота на компьютере, px',section.height||600,'data-section-prop="height" min="100" max="3000"','number')+field('Высота на телефоне, px',section.mobileHeight||700,'data-section-prop="mobileHeight" min="100" max="3000"','number'):''}</div><p class="muted">В свободной секции элементы перемещаются за ручку ↔ на холсте. На телефоне координаты настраиваются отдельно.</p></details>`:'';
    let inspector='';
    if(chosen){
      const saved=e?(device==='phone'?(e.mobileStyle||={}):(e.style||={})):(section.elementStyles?.[chosen]?.[device]||{});
      inspector=`<div class="designer-element-inspector"><h3>${E(e?X.types[e.type]:'Элемент шаблона')}</h3><div class="designer-device" role="group" aria-label="Оформление устройства"><button data-design-device="desktop" aria-pressed="${device==='desktop'}">Компьютер</button><button data-design-device="phone" aria-pressed="${device==='phone'}">Телефон</button></div>${e?elementFields(e):'<p class="muted">Исходные тексты и ссылки редактируются на холсте и в настройках секции. Здесь можно изменить оформление выбранного элемента.</p>'}<details open class="text-section"><summary>Оформление элемента</summary>${styleEditor(saved,'data-designer-style')}</details></div>`;
    }else inspector='<p class="notice">Нажмите на элемент в списке или на холсте. Текст можно редактировать прямо в предпросмотре.</p>';
    return header+top+palette+customSettings+inspector+'<button class="full section-top" data-designer-action="save-section">Сохранить секцию в библиотеку</button>';
  }
  function elementFields(e){
    const text=['heading','text','button','form'].includes(e.type)?field('Текст элемента',item().texts?.['element-'+e.id]??e.text??'','data-element-prop="text" maxlength="10000"'):'';
    const media=['image','video'].includes(e.type)?field('Адрес файла (http/https)',e.src||'','data-element-prop="src" maxlength="2000"','url')+(e.type==='image'?field('Описание изображения (alt)',e.alt||'','data-element-prop="alt" maxlength="500"','text')+'<button data-designer-action="upload-image">Загрузить изображение</button><button data-designer-action="image-library">Библиотека изображений</button><input id="designer-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>':field('Постер видео (URL)',e.poster||'','data-element-prop="poster" maxlength="2000"','url')):'';
    const rectangle=e[device==='phone'?'mobileRect':'rect']||{};
    return `<div class="row wrap"><button data-designer-action="duplicate-element">Дублировать</button><button class="danger" data-designer-action="delete-element">Удалить элемент</button></div>${text}${e.type==='heading'?select('Уровень заголовка','data-element-prop="tag"',e.tag||'h2',{h1:'H1',h2:'H2',h3:'H3',h4:'H4'}):''}${media}${e.type==='button'?field('Ссылка или #якорь',e.href||'','data-element-prop="href" maxlength="2000"','text')+`<label class="check"><input type="checkbox" data-element-prop="newTab" ${e.newTab?'checked':''}>Открыть в новой вкладке</label>`:''}${e.type==='form'?field('HTTPS-адрес обработчика POST',e.action||'','data-element-prop="action" maxlength="2000"','url')+'<p class="notice">В предпросмотре отправка отключена. В опубликованном HTML форма отправляет данные указанному обработчику. Без адреса кнопка неактивна.</p>':''}${e.type==='spacer'?field('Высота отступа, px',e.height??40,'data-element-prop="height" min="0" max="1000"','number'):''}${select('Видимость элемента','data-element-prop="visibility"',e.visibility||'all',visibility)}${item().mode==='free'?`<fieldset><legend>Положение: ${device==='phone'?'телефон':'компьютер'}</legend><div class="designer-two">${[['x','X',0,1920],['y','Y',0,3000],['width','Ширина',20,1920],['height','Высота',20,3000]].map(([key,label,min,max])=>field(label+', px',rectangle[key]??(key==='width'?280:key==='height'?100:0),`data-element-rect="${key}" min="${min}" max="${max}"`,'number')).join('')}</div></fieldset>`:`<div class="designer-two">${field('Колонок по ширине (ПК)',e.span||1,'data-element-prop="span" min="1" max="4"','number')}${field('Колонок по ширине (телефон)',e.mobileSpan||1,'data-element-prop="mobileSpan" min="1" max="4"','number')}</div>`}`;
  }
  async function libraryRequest(path='',options={}){const r=await fetch('/editor-api/site-builder/sections'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw new Error(data.error||'Не удалось открыть библиотеку');return data;}
  function renderLibrary(){
    const ticket=++libraryTicket,scope=builder().scope();libraryRequest().then(data=>{if(ticket!==libraryTicket||scope!==builder().scope()||tab!=='library')return;$('#section-library-items').innerHTML=data.map(p=>`<article class="designer-library-item"><h3>${E(p.name)}</h3><div class="row"><button data-use-section="${p.id}">Вставить</button><button class="danger" data-remove-section="${p.id}">Удалить из библиотеки</button></div></article>`).join('')||'<p class="empty">Выберите секцию и нажмите «Сохранить секцию в библиотеку».</p>';}).catch(e=>notify(e.message));
    return '<h2>Библиотека секций</h2><p class="intro">Ваши сохранённые секции доступны во всех ваших страницах. Вставляется независимая копия.</p><button class="full" data-designer-action="save-section">Сохранить выбранную секцию</button><div id="section-library-items" role="status">Загрузка…</div>';
  }
  function analyticsFields(){return '<h3>Общие счётчики аналитики</h3><p class="muted">Укажите публичные ID один раз для этой страницы. В кнопках достаточно имени цели или события. API-ключи и пароли здесь не нужны.</p>'+[['hasl','хасл.рф'],['hasle','haslestore.com']].map(([site,label])=>{const c=state.analytics?.[site]||{};return `<fieldset class="site-analytics-settings"><legend>${label}</legend>${field('Яндекс Метрика — ID счётчика',c.yandexCounter||'',`data-analytics-site="${site}" data-analytics-key="yandexCounter" inputmode="numeric" maxlength="15" pattern="[1-9][0-9]{0,14}"`,'text')}${field('Google Analytics — Measurement ID',c.googleMeasurementId||'',`data-analytics-site="${site}" data-analytics-key="googleMeasurementId" placeholder="G-XXXXXXXXXX" maxlength="22" pattern="G-[A-Z0-9]{4,20}"`,'text')}<label class="check"><input type="checkbox" data-analytics-site="${site}" data-analytics-key="loadScripts" ${c.loadScripts?'checked':''}>Подключать счётчики в экспортированном HTML</label></fieldset>`;}).join('')+'<p class="muted">Если Метрика и Google уже подключены в CMS, оставьте подключение выключенным. Предпросмотр не загружает счётчики и не отправляет цели. Настройки сохраняются в вашем шаблоне и его копиях.</p>';}
  function renderSettings(){const p=state.pageSettings||{};return `<h2>Настройки страницы</h2>${state.templateId&&state.templateId!=='hasl'?'':analyticsFields()}<p class="intro">Метаданные попадают в полный HTML. При вставке фрагмента для CMS задайте SEO в самой CMS.</p><div class="notice" ${state.templateId&&state.templateId!=='hasl'?'hidden':''} id="site-schema-note"><strong>Schema.org — автоматически</strong><p>Разметка страницы, товаров, вопросов и блога формируется из текущего содержимого. JSON-LD включается в HTML, фрагмент для CMS и каждую страницу ZIP сайта.</p><p>Полностью скрытые и прозрачные объекты исключаются. Валидная Schema.org не гарантирует расширенный результат Google: FAQ больше не поддерживается в поиске, а Product предназначен для страниц конкретного товара.</p></div>${field('Название страницы (title)',state.title,'id="page-title" maxlength="200"','text')}${field('Адрес HTML-файла',p.path||'','data-page-setting="path" placeholder="index.html или about.html" maxlength="160"','text')}${field('Описание для поиска',p.description||'','data-page-setting="description" maxlength="1000"')}${field('Канонический URL',p.canonical||'','data-page-setting="canonical" maxlength="2000"','url')}${field('Иконка сайта (URL)',p.favicon||'','data-page-setting="favicon" maxlength="2000"','url')}<label class="check"><input type="checkbox" data-page-setting="noindex" ${p.noindex?'checked':''}>Не индексировать страницу (noindex)</label><p class="muted">Поисковый робот должен иметь доступ к странице, чтобы увидеть noindex. Содержимое страницы сохраняется. Настройки магазина используются только в шаблоне ХАСЛ.</p>`;}
  const imageLibrary=document.createElement('dialog');imageLibrary.id='designer-image-library';imageLibrary.innerHTML='<header class="dialog-head"><h2>Изображения</h2><button data-close-image-library>Закрыть</button></header><p class="muted">Загрузки из общей библиотеки фонов и изображений, доступные вашему аккаунту.</p><div class="site-banner-grid" role="status"></div>';document.body.append(imageLibrary);
  let imageTarget=null;
  imageLibrary.querySelector('[data-close-image-library]').onclick=()=>imageLibrary.close();
  imageLibrary.addEventListener('close',()=>imageTarget=null);
  imageLibrary.addEventListener('click',ev=>{const b=ev.target.closest('[data-image-library-url]');if(!b||!imageTarget)return;const t=imageTarget;if(t.scope!==builder().scope()||!state.layout.includes(t.section)||!t.section.elements.includes(t.element)){imageLibrary.close();return;}t.element.src=b.dataset.imageLibraryUrl;changed();render();imageLibrary.close();});
  async function openImages(){const section=item(),e=element();if(!e)return;imageTarget={section,element:e,scope:builder().scope()};const ticket=imageTarget;imageLibrary.querySelector('.site-banner-grid').textContent='Загрузка…';imageLibrary.showModal();try{const response=await fetch('/editor-api/site-builder/banners'),data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось открыть изображения');if(imageTarget!==ticket||!imageLibrary.open)return;imageLibrary.querySelector('.site-banner-grid').innerHTML=data.items.map(x=>`<article class="site-banner-item"><img src="${E(x.url)}" alt="${E(x.name)}" loading="lazy"><strong>${E(x.name)}</strong><button data-image-library-url="${E(x.url)}">Использовать</button></article>`).join('')||'<p>Изображений пока нет. Закройте окно и нажмите «Загрузить изображение».</p>';}catch(e){if(imageTarget===ticket)imageLibrary.querySelector('.site-banner-grid').textContent=e.message;}}
  let siteTicket=0,zipLoader=null;
  async function projectRequest(path){const response=await fetch('/editor-api/site-builder/projects'+path);const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось прочитать страницу');return result;}
  function renderSiteExport(){
    const ticket=++siteTicket,scope=builder().scope();projectRequest('').then(pages=>{if(ticket!==siteTicket||scope!==builder().scope()||tab!=='siteExport')return;$('#site-export-pages').innerHTML=pages.map(p=>`<label class="checkline designer-export-page"><input type="checkbox" data-bundle-page="${E(p.id)}"><span><strong>${E(p.title)}</strong><small>${E(new Date(p.updated).toLocaleString('ru-RU'))}</small></span></label>`).join('')||'<p>Сначала сохраните хотя бы одну страницу через «Мои страницы».</p>';}).catch(e=>notify(e.message));
    return '<h2>Сайт целиком</h2><p class="intro">Выберите сохранённые страницы и скачайте один ZIP с полным HTML. Текущие правки сохранятся перед сборкой.</p><p class="notice">Задайте каждой странице свой «Адрес HTML-файла» в настройках: index.html для главной, about.html или promo/index.html для остальных. Кнопки могут ссылаться на /about.html. Изображения и шрифты остаются сетевыми ссылками.</p><div id="site-export-pages" role="status">Загрузка страниц…</div><button class="primary full" data-designer-action="export-site">Скачать сайт ZIP</button><p class="muted section-top">До 30 страниц за раз. Страницы без заданного адреса получают page-ID.html. Выберите все страницы, на которые ведут внутренние кнопки. ZIP размещается в корне сайта; публикация на хостинге выполняется отдельно.</p>';
  }
  async function zipLibrary(){
    if(window.JSZip)return window.JSZip;
    if(!zipLoader)zipLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/jszip.min.js';script.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('Библиотека ZIP недоступна'));script.onerror=()=>reject(new Error('Не удалось загрузить библиотеку ZIP. Повторите позже.'));document.head.append(script);}).catch(error=>{zipLoader=null;throw error;});
    return zipLoader;
  }
  async function buildSiteBundle(ids){
    if(!ids.length||ids.length>30)throw new Error('Выберите от 1 до 30 сохранённых страниц.');
    const scope=builder().scope();await builder().save();
    const alive=()=>{if(scope!==builder().scope())throw new Error('Страница изменилась. Запустите сборку сайта заново.');};alive();
    const docs=[],paths=new Set(),allProducts={...products};let bytes=0;
    for(const uid of ids){const record=await projectRequest('/'+encodeURIComponent(uid));alive();const value=validateProject(record.state),path=value.pageSettings?.path||'page-'+uid+'.html';
      if(!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.html$/.test(path)||path.length>160)throw new Error('Недопустимый адрес HTML-файла: '+path);
      const normalized=path.toLowerCase();if(paths.has(normalized))throw new Error('Одинаковые адреса HTML-файлов: '+path+'. Измените адрес в настройках одной из страниц.');paths.add(normalized);
      if(Object.values(value.blocks).some(b=>(b.missing||[]).length||(b.appliedCodes!==undefined&&b.appliedCodes!==b.codes)))throw new Error('Сначала примените и проверьте товарные списки страницы «'+value.title+'».');
      bytes+=JSON.stringify(value).length;if(bytes>20_000_000)throw new Error('Выбранные страницы слишком большие. Соберите сайт несколькими частями.');docs.push({value,path});
    }
    const codes=[...new Set(docs.flatMap(({value})=>[...Object.values(value.blocks),...(value.layout||[]).map(b=>b.products).filter(Boolean)].flatMap(b=>b.resolved||[])))];
    for(let i=0;i<codes.length;i+=250){const result=await api('products?codes='+encodeURIComponent(codes.slice(i,i+250).join(',')));alive();if(result.missing?.length)throw new Error('Не найдены товары для сайта: '+result.missing.join(', '));result.products.forEach(p=>allProducts[p.code]=p);}
    const exportContent=await prepareExportContent(docs.map(({value})=>value.exportSite));alive();
    const documents=docs.map(({value,path})=>({path,doc:new DOMParser().parseFromString(R.build(value,allProducts,exportContent,{site:value.exportSite,clean:true}),'text/html')}));
    const targets=new Map(documents.map(x=>[x.path,x.doc]));
    for(const {path,doc} of documents)for(const a of doc.querySelectorAll('[data-site-element] a[href],a[data-site-element][href]')){
      const raw=a.getAttribute('href');if(!X.pageHref(raw))continue;const [target,hash]=raw.replace(/^\//,'').split('#');if(!targets.has(target))throw new Error('Внутренняя ссылка '+raw+' ведёт на страницу, не выбранную для ZIP.');
      if(hash&&!targets.get(target).getElementById(hash))throw new Error('Якорь #'+hash+' не найден на странице '+target+'.');
      a.setAttribute('href','../'.repeat(path.split('/').length-1)+target+(hash?'#'+hash:''));
    }
    const Zip=await zipLibrary();alive();const zip=new Zip();for(const {path,doc} of documents)zip.file(path,'<!doctype html>\n'+doc.documentElement.outerHTML);
    zip.file('README.txt','Сайт ХАСЛ\nРазместите файлы с сохранением папок на вашем хостинге.\nГлавная страница обычно index.html. Изображения, видео и шрифты загружаются из сети.\nФормы требуют настроенного обработчика POST.\nСтраницы: '+documents.map(x=>x.path).join(', ')+'\n');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});alive();return blob;
  }
  function afterRender(){
    observe();
    if(tab==='layout'){$('.site-insert')?.insertAdjacentHTML('afterbegin','<button data-designer-action="add-grid">＋ Своя секция</button><button data-designer-action="add-free">＋ Свободная секция</button>');if(item())$('#inspector').insertAdjacentHTML('beforeend','<div class="designer-section-actions"><button class="full" data-designer-action="open-elements">Элементы и оформление этой секции</button><button class="full" data-designer-action="save-section">Сохранить секцию в библиотеку</button></div>');}
    paint();
  }
  function paint(){for(const id of ['desktop','phone']){const doc=$('#'+id)?.contentDocument;if(!doc)continue;doc.querySelectorAll('[data-site-element]').forEach(n=>{const on=editing&&n.dataset.siteElement===chosen&&n.closest('[data-site-block]')?.dataset.siteBlock===item()?.id;n.classList.toggle('designer-selected-element',on);});}}
  function bindPreview(frame){
    const doc=frame.contentDocument;
    const style=doc.createElement('style');style.textContent=!editing?'':'[data-site-element]{position:relative;scroll-margin-top:40px}[data-site-element]:hover{outline:1px dashed #648100;outline-offset:3px}.designer-selected-element{outline:2px solid #648100!important;outline-offset:4px}[data-design-handle]{position:absolute!important;top:-24px!important;right:0!important;min-width:32px!important;height:24px!important;padding:0 8px!important;border:0!important;border-radius:4px!important;background:#20241f!important;color:white!important;font:12px Arial!important;cursor:move;z-index:10;touch-action:none}';doc.head.append(style);
    doc.addEventListener('click',ev=>{if(!editing)return;const node=ev.target.closest('[data-site-element]'),section=ev.target.closest('[data-site-block]');if(!section)return;if(node){ev.preventDefault();builder().select(section.dataset.siteBlock);chosen=node.dataset.siteElement;tab='elements';render();}else if(!ev.target.closest('a,button,input,textarea,select')){builder().select(section.dataset.siteBlock);chosen=null;tab='layout';render();}},true);
    doc.addEventListener('submit',ev=>{ev.preventDefault();notify('Отправка формы доступна в опубликованном HTML.');},true);
    doc.addEventListener('keydown',hotkeys,true);
    if(!editing)doc.querySelectorAll('[contenteditable]').forEach(n=>n.contentEditable='false');
    for(const node of editing?doc.querySelectorAll('[data-layout=free] > [data-site-element]'):[]){
      for(const kind of ['move','resize']){
      const handle=doc.createElement('button');handle.type='button';handle.dataset.designHandle=kind;handle.textContent=kind==='move'?'↔':'↘';handle.setAttribute('aria-label',kind==='move'?'Переместить элемент':'Изменить размер элемента');if(kind==='resize')handle.style.cssText='top:auto!important;bottom:-24px!important;cursor:nwse-resize!important';node.append(handle);
      handle.addEventListener('pointerdown',ev=>{
        if(ev.button!==0||!editing)return;ev.preventDefault();ev.stopPropagation();const section=state.layout.find(b=>b.id===node.closest('[data-site-block]').dataset.siteBlock),e=section?.elements.find(e=>e.id===node.dataset.siteElement);if(!e)return;
        builder().select(section.id);chosen=e.id;device=(window.SiteLayout?.deviceFor(frame)||frame.id);const key=device==='phone'?'mobileRect':'rect',rect={...(e[key]||{x:0,y:0,width:280,height:100})},scope=builder().scope(),sx=ev.clientX,sy=ev.clientY;let moved=false;
        handle.setPointerCapture(ev.pointerId);
        const move=ev2=>{if(scope!==builder().scope()||!state.layout.includes(section))return;const width=node.parentElement.clientWidth,height=device==='phone'?section.mobileHeight||700:section.height||600;e[key]=kind==='move'?{...rect,x:Math.round(Math.max(0,Math.min(Math.max(0,width-rect.width),rect.x+ev2.clientX-sx))),y:Math.round(Math.max(0,Math.min(Math.max(0,height-rect.height),rect.y+ev2.clientY-sy)))}:{...rect,width:Math.round(Math.max(20,Math.min(Math.max(20,width-rect.x),rect.width+ev2.clientX-sx))),height:Math.round(Math.max(20,Math.min(Math.max(20,height-rect.y),rect.height+ev2.clientY-sy)))};for(const prop of ['x','y','width','height'])node.style.setProperty('--'+(device==='phone'?'phone-':'')+prop,e[key][prop]+'px');moved=true;};
        const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);handle.removeEventListener('lostpointercapture',end);if(moved&&scope===builder().scope()&&state.layout.includes(section)){changed();render();}};
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
      });
      }
    }paint();
  }
  function hotkeys(ev){
    if(!(ev.ctrlKey||ev.metaKey)||ev.altKey||document.querySelector('dialog[open]'))return;
    const key=ev.code==='KeyZ'?'z':ev.code==='KeyY'?'y':ev.key.toLowerCase();if(key==='z'||key==='y'){ev.preventDefault();ev.stopImmediatePropagation();restore(key==='y'||ev.shiftKey?'redo':'undo');}
  }
  const tool=document.createElement('div');tool.className='designer-history';tool.innerHTML='<button id="site-undo" aria-label="Отменить действие" disabled>↶</button><button id="site-redo" aria-label="Повторить действие" disabled>↷</button>';$('.top-actions').prepend(tool);
  const modeButton=document.createElement('button');modeButton.id='designer-edit-mode';modeButton.textContent='Редактирование';modeButton.setAttribute('aria-pressed','true');$('.preview-toolbar').append(modeButton);
  const more=document.createElement('details');more.className='designer-project-menu';more.innerHTML='<summary>Проект, инструкции и доступ</summary>';
  const bottom=$('.nav-bottom');while(bottom.firstChild)more.append(bottom.firstChild);bottom.append(more);
  const mobile=matchMedia('(max-width:767px)'),fitMenu=()=>more.open=!mobile.matches;fitMenu();mobile.addEventListener('change',fitMenu);
  const jumpCanvas=document.createElement('button');jumpCanvas.className='designer-mobile-jump';jumpCanvas.textContent='К холсту';jumpCanvas.onclick=()=>$('.preview-area').scrollIntoView({block:'start'});$('.top-actions').append(jumpCanvas);
  const jumpSettings=document.createElement('button');jumpSettings.className='designer-mobile-jump';jumpSettings.textContent='К настройкам';jumpSettings.onclick=()=>$('#inspector').scrollIntoView({block:'start'});$('.preview-toolbar').append(jumpSettings);
  $('.navigation nav').insertAdjacentHTML('beforeend','<button data-tab="elements">Элементы и оформление</button><button data-tab="library">Библиотека секций</button><button data-tab="commerce">Данные товаров</button><button data-tab="pageSettings">Настройки страницы</button><button data-tab="siteExport">Сайт целиком</button>');
  document.addEventListener('keydown',hotkeys,true);
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('button');if(!b||!state)return;
    try{
      if(b.dataset.siteHistory){restore(b.dataset.siteHistory);return;}
      if(b.id==='site-undo'){restore('undo');return;}if(b.id==='site-redo'){restore('redo');return;}
      if(b.id==='designer-edit-mode'){editing=!editing;b.textContent=editing?'Редактирование':'Просмотр';b.setAttribute('aria-pressed',String(editing));updatePreviews();return;}
      if(b.dataset.designDevice){device=b.dataset.designDevice;render();return;}
      if(b.dataset.chooseElement){chosen=b.dataset.chooseElement;render();jump('[data-site-block="'+item().id+'"] [data-site-element="'+chosen+'"]');return;}
      if(b.dataset.addElement){if(item()?.source!=='custom')return;if(item().elements.length>=100)throw new Error('До 100 элементов в секции.');const e=createElement(b.dataset.addElement);e.rect.y=Math.min(item().elements.length*120,500);e.mobileRect.y=Math.min(item().elements.length*120,600);item().elements.push(e);chosen=e.id;changed();render();jump('[data-site-block="'+item().id+'"] [data-site-element="'+chosen+'"]');return;}
      if(b.dataset.elementOrder){const a=item()?.elements,at=a?.findIndex(e=>e.id===b.dataset.elementOrder),to=at+Number(b.dataset.direction);if(at>=0&&to>=0&&to<a.length){[a[at],a[to]]=[a[to],a[at]];changed();render();}return;}
      if(b.dataset.useSection){const scope=builder().scope(),data=await libraryRequest('/'+b.dataset.useSection);if(scope!==builder().scope())return;insertSection('grid',data.section);return;}
      if(b.dataset.removeSection){await libraryRequest('/'+b.dataset.removeSection,{method:'DELETE'});if(tab==='library')render();return;}
      const action=b.dataset.designerAction;if(!action)return;
      if(action==='add-grid'||action==='add-free'){insertSection(action==='add-free'?'free':'grid');return;}
      if(action==='section-settings'){tab='layout';render();return;}
      if(action==='open-elements'){tab='elements';chosen=null;render();return;}
      if(action==='save-section'){if(!item())throw new Error('Сначала выберите секцию.');await libraryRequest('',{method:'POST',body:JSON.stringify({section:item()})});notify('Секция сохранена в вашу библиотеку.');return;}
      if(action==='upload-image'){$('#designer-image-file').click();return;}
      if(action==='image-library'){await openImages();return;}
      if(action==='export-site'){const ids=[...document.querySelectorAll('[data-bundle-page]:checked')].map(n=>n.dataset.bundlePage);b.disabled=true;try{const blob=await buildSiteBundle(ids);download('ХАСЛ-сайт.zip',blob,'application/zip');notify('Сайт собран: '+ids.length+' страниц.');}finally{b.disabled=false;}return;}
      if(action==='delete-element'&&element()){const e=element();item().elements=item().elements.filter(x=>x!==e);delete item().texts?.['element-'+e.id];delete item().inlineLinks?.['element-'+e.id];chosen=null;changed();render();return;}
      if(action==='duplicate-element'&&element()){if(item().elements.length>=100)throw new Error('До 100 элементов в секции.');const e=structuredClone(element()),oldKey='element-'+e.id;e.id=makeId();const newKey='element-'+e.id;if(item().texts?.[oldKey]!==undefined)(item().texts||={})[newKey]=item().texts[oldKey];if(item().inlineLinks?.[oldKey])(item().inlineLinks||={})[newKey]=structuredClone(item().inlineLinks[oldKey]);item().elements.splice(item().elements.indexOf(element())+1,0,e);chosen=e.id;changed();render();return;}
      if(action==='reset-style'&&chosen){if(element())element()[device==='phone'?'mobileStyle':'style']={};else if(item().elementStyles?.[chosen])delete item().elementStyles[chosen][device];changed();render();}
    }catch(error){notify(error.message);}
  });
  document.addEventListener('input',ev=>{
    const input=ev.target;if(!state)return;if(input.type==='number'&&(!input.checkValidity()||(input.value===''&&!input.hasAttribute('data-designer-style'))))return;
    const urlKey=input.dataset.pageSetting||input.dataset.elementProp;
    if(urlKey==='path'){const valid=/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.html$/.test(input.value)&&input.value.length<=160;input.setCustomValidity(valid?'':'Укажите index.html или folder/page.html.');if(!valid)return;}
    if(['src','poster','href','action','canonical','favicon'].includes(urlKey)){
      const valid=!input.value||(urlKey==='href'?X.href(input.value):X.url(input.value))&&(urlKey!=='action'||input.value.startsWith('https://'));
      input.setCustomValidity(valid?'':'Укажите корректный адрес http(s) или допустимый якорь. Для формы требуется HTTPS.');if(!valid)return;
    }
    let handled=true;
    if(input.dataset.analyticsSite){if(!input.checkValidity()){input.reportValidity();return;}((state.analytics||={})[input.dataset.analyticsSite]||={})[input.dataset.analyticsKey]=input.type==='checkbox'?input.checked:input.value.trim();}
    else if(input.dataset.pageSetting){(state.pageSettings||={})[input.dataset.pageSetting]=input.type==='checkbox'?input.checked:input.value;}
    else if(input.dataset.sectionProp&&item()){item()[input.dataset.sectionProp]=input.type==='number'?Number(input.value):input.value;}
    else if(input.dataset.elementProp&&element()){const key=input.dataset.elementProp,value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;element()[key]=value;if(key==='text'){(item().texts||={})['element-'+element().id]=value;delete item().inlineLinks?.['element-'+element().id];}}
    else if(input.dataset.elementRect&&element()){const key=device==='phone'?'mobileRect':'rect';(element()[key]||={})[input.dataset.elementRect]=Number(input.value);}
    else if(input.hasAttribute('data-designer-style')&&chosen){let value;if(element())value=element()[device==='phone'?'mobileStyle':'style']||={};else value=(((item().elementStyles||={})[chosen]||={})[device]||={});const key=input.dataset.styleProp;if(input.value==='')delete value[key];else value[key]=['color','background','align','fontFamily','fontStyle','textDecoration'].includes(key)?input.value:Number(input.value);}
    else handled=false;
    if(handled){changed();if(input.dataset.sectionProp==='mode')render();}
  });
  document.addEventListener('change',async ev=>{
    if(ev.target.id!=='designer-image-file')return;const input=ev.target,file=input.files[0],e=element(),section=item(),scope=builder().scope();if(!file||!e)return;
    try{if(file.size>4900000)throw new Error('Изображение должно быть не больше 4,9 МБ.');input.disabled=true;const r=await fetch('/editor-api/site-builder/banners?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type},body:file}),data=await r.json();if(!r.ok)throw new Error(data.error||'Не удалось загрузить изображение');if(scope!==builder().scope()||!state.layout.includes(section)||!section.elements.includes(e))return;e.src=data.url;changed();render();notify('Изображение загружено и добавлено в элемент.');}catch(error){notify(error.message);}finally{input.disabled=false;input.value='';}
  });
  window.SiteDesigner={insertSection,beginGesture:()=>{lastGroup='';},historyButtons,observe,record,afterRender,bindPreview,cloneSection,buildSiteBundle,renders:{elements:renderElements,library:renderLibrary,pageSettings:renderSettings,siteExport:renderSiteExport}};
})();
