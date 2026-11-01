'use strict';
const R = window.HaslRenderer, $ = s => document.querySelector(s), E = R.esc;
const names = {catalog:'Витрина «Прямо сейчас»',collections:'Коллекции «Наши акции»',promos:'Две карточки под первым экраном'};
let state, meta, products = {}, content = {reviews:{items:[]},news:{items:[]}}, tab='layout', block='catalog', syncing=false;
let previewTimer, saveTimer, noticeTimer, saving=false, saveAgain=false, syncTimer, focusBeforeDialog;
const dirtyBlocks = new Set();
async function api(path, data, attempt=0) {
  const response = await fetch('/editor-api/site-builder/'+path,data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Ошибка соединения с конструктором');
  if(result.loading && path.startsWith('products?')){
    $('#data-status').textContent='Загружаем весь каталог ХАСЛ из all_yandex.xml…';
    if(attempt>=180)throw new Error('Каталог ещё загружается. Подождите и примените список повторно.');
    await new Promise(resolve=>setTimeout(resolve,1000));return api(path,data,attempt+1);
  }
  if(path.startsWith('products?')){$('#data-status').textContent='Полный каталог ХАСЛ: '+result.total+' товаров';if(Array.isArray(result.finderBrands))content.finderBrands=result.finderBrands;}
  return result;
}
async function switchPreviewShop(){
  const select=$('#preview-site'),site=select.value,previous=content.site||'hasl';
  if(syncing){select.value=previous;notify('Дождитесь обновления данных.');return;}
  const guarded=['#refresh-all','#site-preview','#site-remote-preview','#site-preview-comments'].map(s=>$(s)).filter(Boolean),disabled=guarded.map(n=>n.disabled);guarded.forEach(n=>n.disabled=true);
  select.disabled=true;$('#data-status').textContent='Загружаем контент '+select.selectedOptions[0].textContent+'…';
  try{
    const next=await api('content?site='+site+'&load=1');content={...content,...next};
    render();updatePreviews();
    $('#data-status').textContent=next.errors?.length?'Часть источников недоступна. Нажмите «Обновить данные», чтобы повторить.':'Контент '+select.selectedOptions[0].textContent;
    if(next.errors?.length)notify('Не удалось загрузить часть контента выбранного магазина. Данные другого магазина не подставляются.');
  }catch(error){select.value=previous;notify(error.message);$('#data-status').textContent='Не удалось переключить магазин. Предыдущий контент сохранён.';}
  finally{select.disabled=false;guarded.forEach((n,i)=>n.disabled=disabled[i]);}
}
function notify(text) { clearTimeout(noticeTimer); $('#notification').textContent=text;$('#notification').hidden=false;noticeTimer=setTimeout(()=>$('#notification').hidden=true,6500); }
function freshState() {
  const settings = limit => ({mode:'auto',limit,selected:[],hidden:[],overrides:{},manual:[],pinned:{}});
  return {version:1,title:'ХАСЛ — твой город, твоя пара',texts:{},links:{},images:{},
    blocks:Object.fromEntries(Object.entries(meta.blocks).map(([key,codes])=>[key,{codes,photos:{},resolved:[],missing:[],loaded:false,appliedCodes:codes}])),
    reviews:settings(6),news:settings(3),exportSite:'both',exportFormat:'document',autoRefresh:true};
}
function validateProject(value) {
  if(!value || value.version!==1 || !value.blocks || !value.reviews || !value.news) throw new Error('Это не файл проекта конструктора ХАСЛ. Выберите JSON, сохранённый кнопкой «Скачать проект».');
  for(const key of Object.keys(names)) {
    const b=value.blocks[key];
    if(!b || typeof b.codes!=='string' || !b.photos || !Array.isArray(b.resolved)) throw new Error('Повреждены настройки товарного блока: '+key);
  }
  for(const key of ['reviews','news']) {
    const c=value[key];
    if(!['auto','selected'].includes(c.mode) || !Array.isArray(c.selected) || !Array.isArray(c.hidden) || !Array.isArray(c.manual) || !c.overrides) throw new Error('Повреждены настройки '+key);
    c.limit=Math.min(30,Math.max(1,Number(c.limit)||3));c.pinned ||= {};
  }
  window.SiteElements?.validate(value);
  window.SiteObjects?.validate(value);
  window.SiteCommerce?.validate(value);
  return value;
}
function changed({preview=true}={}) {
  if(window.SiteBuilder) SiteBuilder.markChanged();
  if(preview){clearTimeout(previewTimer);previewTimer=setTimeout(updatePreviews,350);}
}
async function save() { return window.SiteBuilder?.save(); }
function field(label,value,attrs='',type='textarea') {
  return `<label class="field"><span>${E(label)}</span>${type==='textarea'?`<textarea ${attrs}>${E(value)}</textarea>`:`<input type="${type}" value="${E(value)}" ${attrs}>`}</label>`;
}
function render() {
  document.querySelectorAll('nav [data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
  const renders={products:renderProducts,texts:renderTexts,reviews:()=>renderContent('reviews'),news:()=>renderContent('news'),export:renderExport,templates:()=>SiteTemplates.panel(),...(window.SiteBuilder?.renders||{}),...(window.SiteDesigner?.renders||{}),...(window.ObjectStudio?.renders||{})};
  renders.commerce=()=>SiteCommerce.render();
  renders.globalStyles=()=>SiteGlobalStyles.panel();
  $('#inspector').innerHTML=renders[tab]();
  $('#product-count').textContent=String(state.blocks.catalog.resolved.length);
  window.SiteDesigner?.afterRender();
  window.ObjectStudio?.afterRender();
  window.SiteCommerce?.afterRender();
}
function renderProducts() {
  const b=state.blocks[block];
  return `<h2>Товары на странице</h2><p class="intro">Вставьте артикулы. Фото, названия и цены подтянутся из каталога магазина.</p><label class="field"><span>Товарный блок</span><select id="block-select" class="block-switch">${Object.entries(names).map(([key,label])=>`<option value="${key}" ${key===block?'selected':''}>${E(label)}</option>`).join('')}</select></label>${field('Артикулы товаров',b.codes,'id="codes" class="codes" placeholder="43816, 46713\n47509"')}<p class="muted">Через запятую, пробел или с новой строки. Порядок в списке = порядок на странице.${block==='promos'?' До двух артикулов; пустой список возвращает исходные промо.':''}</p><div class="row section-top"><button class="dark" id="apply-products">Применить список</button><button class="small" data-jump="${block==='catalog'?'#hasl-embed-catalog':block==='collections'?'#hasl-embed-collections':'.hero-side'}">Показать блок</button></div><div class="notice error" id="products-error">${b.missing.length?'Не найдены: '+E(b.missing.join(', '))+'. Проверьте артикулы и обновите каталог.':''}</div>${dirtyBlocks.has(block)?'<div class="notice">Список изменён. Нажмите «Применить список».</div>':''}<div class="products-list"><div class="row"><h3>${b.resolved.length} товаров</h3><button class="small" data-sync="products">Обновить каталог</button></div>${b.resolved.map((code,i)=>{const p=products[code];if(!p)return '';const chosen=b.photos[code]||p.photos[0];return `<article class="product-row"><img src="${E(R.optimized(p.photos.includes(chosen)?chosen:p.photos[0],256))}" alt="${E(p.name)}" loading="lazy"><div><h3>${E(p.name)}</h3><p class="code">Арт. ${E(code)} · ${E(Number(p.price).toLocaleString('ru-RU'))} ₽${p.available?'':' · Нет в наличии'}</p><div class="row wrap"><button class="small" data-photo="${E(code)}">${(p.videos||[]).includes(chosen)?'Видео '+((p.videos||[]).indexOf(chosen)+1):'Фото '+(Math.max(0,p.photos.indexOf(chosen))+1)} · Выбрать медиа</button><button class="small" data-move="${i}" data-direction="-1" aria-label="Поднять товар ${E(code)}" ${i===0?'disabled':''}>↑</button><button class="small" data-move="${i}" data-direction="1" aria-label="Опустить товар ${E(code)}" ${i===b.resolved.length-1?'disabled':''}>↓</button><button class="small" data-remove-product="${E(code)}" aria-label="Убрать товар ${E(code)}">Убрать</button></div></div></article>`;}).join('')}${!b.resolved.length?'<p class="empty">Здесь появятся товары и выбор фотографии для каждого.</p>':''}</div>`;
}
function renderTexts() {
  return `<h2>Тексты и ссылки</h2><p class="intro">Содержание всех блоков: заголовки, акции, доставка, вопросы и кнопки. Форматирование страницы сохраняется.</p>${field('Название страницы',state.title,'id="page-title"','text')}${meta.sections.map((s,i)=>`<details class="text-section" ${i===0?'open':''}><summary>${E(s.name)}</summary><button class="small section-top" data-jump="[data-editor-section='${s.id}']">Показать в предпросмотре</button>${meta.fields.filter(f=>f.section===s.id).map(f=>field(f.value.length>65?f.value.slice(0,65)+'…':f.value,state.texts[f.id]??f.value,`data-text="${f.id}"`)).join('')}${meta.links.filter(f=>f.section===s.id).map(f=>field('Ссылка: '+(f.label.slice(0,50)||'Переход'),state.links[f.id]??f.value,`data-link="${f.id}"`,'text')+`<label class="check"><input type="checkbox" data-link-target="${f.id}" ${(state.linkTargets?.[f.id]??f.newTab)?'checked':''}> Открыть в новой вкладке</label>`).join('')}${meta.pictures.filter(f=>f.section===s.id).map(f=>field('Фото (URL): '+f.label,state.images[f.id]??f.value,`data-image="${f.id}"`,'url')).join('')}</details>`).join('')}`;
}
function renderContent(kind) {
  const reviews=kind==='reviews', settings=state[kind], pool=content[kind].items;
  const chosen=R.selectItems(kind,state,content);
  const date=content[kind].updated?new Date(content[kind].updated).toLocaleString('ru-RU'):'ещё не загружены';
  const items = [...(reviews?settings.manual:[]),...pool,...Object.values(settings.pinned).filter(x=>!pool.some(p=>p.id===x.id))];
  return `<h2>${reviews?'Отзывы покупателей':'Блог магазина'}</h2><p class="intro">${reviews?'Свежие отзывы, имена и фотографии — с сайта. Можно выбрать нужные или добавить свой отзыв.':'Обложка, заголовок и краткое описание загружаются вместе. Даты и просмотры на странице не показываются.'}</p><div class="row"><button class="dark" data-sync="${kind}">Обновить ${reviews?'отзывы':'блог'}</button><button class="small" data-jump="#hasl-embed-${reviews?'reviews':'content'}">Показать блок</button></div><p class="muted section-top">Обновлено: ${E(date)}</p><label class="field"><span>Что показывать на странице</span><select data-mode="${kind}"><option value="auto" ${settings.mode==='auto'?'selected':''}>Свежие автоматически</option><option value="selected" ${settings.mode==='selected'?'selected':''}>Только выбранные вручную</option></select></label>${settings.mode==='auto'?field('Количество',settings.limit,`data-limit="${kind}" min="1" max="30"`,'number'):'<p class="muted">Отметьте материалы ниже. Выбор сохранится после обновления.</p>'}<div class="notice">На странице: ${chosen.length}. ${reviews?'Добавленные вручную отзывы сохраняются при обновлении.':'Просмотры ниже — только для вашей работы в редакторе.'}</div>${reviews?'<button class="full" id="add-review">Добавить свой отзыв</button>':''}${items.map(raw=>{
    const r={...raw,...settings.overrides[raw.id]}, visible=chosen.some(x=>x.id===r.id);
    const manual=r.manual;
    return `<details class="edit-card" data-content-card="${E(r.id)}"><summary>${E(reviews?r.name+' · '+r.city:r.title)}</summary>${!reviews&&r.image?`<img src="${E(R.optimized(r.image,640))}" alt="${E(r.title)}" loading="lazy">`:''}${!reviews?`<p class="muted">Просмотры: ${E(r.views??'нет данных')}</p>`:''}<label class="checkline"><input type="checkbox" data-visible="${kind}" data-id="${E(r.id)}" ${visible?'checked':''}>Показывать на странице</label>${reviews?field('Имя',r.name,`data-edit="name" data-kind="${kind}" data-id="${E(r.id)}"`,'text')+field('Город',r.city,`data-edit="city" data-kind="${kind}" data-id="${E(r.id)}"`,'text')+field('Дата',r.date?.slice(0,10)||'',`data-edit="date" data-kind="${kind}" data-id="${E(r.id)}"`,'date'):field('Заголовок',r.title,`data-edit="title" data-kind="${kind}" data-id="${E(r.id)}"`,'text')}${field(reviews?'Текст отзыва':'Краткое описание',r.text,`data-edit="text" data-kind="${kind}" data-id="${E(r.id)}"`)}${reviews?field('Фотографии — URL по одной в строке',(r.photos||[]).join('\n'),`data-edit="photos" data-kind="${kind}" data-id="${E(r.id)}"`)+field('Товар',r.product?.name||'',`data-edit="product-name" data-kind="${kind}" data-id="${E(r.id)}"`,'text')+field('Ссылка на товар',r.product?.url||'',`data-edit="product-url" data-kind="${kind}" data-id="${E(r.id)}"`,'url'):field('Обложка — URL',r.image,`data-edit="image" data-kind="${kind}" data-id="${E(r.id)}"`,'url')+field('Ссылка на статью',r.url,`data-edit="url" data-kind="${kind}" data-id="${E(r.id)}"`,'url')}<button class="small ${manual?'danger':''}" data-reset-content="${kind}" data-id="${E(r.id)}">${manual?'Удалить свой отзыв':'Вернуть данные источника'}</button></details>`;
  }).join('')}${!items.length?'<p class="empty">Пока нет данных. Нажмите кнопку обновления. При недоступности сайта сохранённая страница остаётся в предпросмотре.</p>':''}`;
}
function renderExport() {
  if(state.templateId&&state.templateId!=='hasl')return `<h2>Публикация сайта</h2><p class="intro">Скачайте готовую страницу или вставьте её код в свою CMS. Ссылки на изображения останутся прямыми с сервера.</p><label class="field"><span>Формат HTML</span><select id="export-format"><option value="document" ${state.exportFormat==='document'?'selected':''}>Полная страница</option><option value="fragment" ${state.exportFormat==='fragment'?'selected':''}>Фрагмент для CMS</option></select></label><button class="primary full" id="download-html">Скачать HTML</button><button class="full" id="copy-html">Скопировать код</button><p class="muted">Проверьте свои ссылки и обработчик формы. Изображения загружаются через интернет.</p><button class="full" data-backup>Скачать проект JSON</button>`;
  return `<h2>Готово к публикации</h2><p class="intro">Один HTML со стилями и интерактивными элементами. Конструктор для его работы не нужен.</p>${state.syncErrors?.length?`<div class="notice error">Не все источники обновлены. Используются сохранённые данные.<br>${state.syncErrors.map(E).join('<br>')}</div>`:''}<h3>Для какого сайта</h3>${[['both','Оба сайта · универсальный'],['hasl','Только хасл.рф'],['hasle','Только haslestore.com']].map(([v,l])=>`<label class="export-choice"><input type="radio" name="export-site" value="${v}" ${state.exportSite===v?'checked':''}>${l}</label>`).join('')}<div class="notice">Универсальный файл определяет домен при размещении. На компьютере используется хасл.рф. Ссылки на внешние сервисы и sale.хасл.рф сохраняются.</div><label class="field"><span>Формат HTML</span><select id="export-format"><option value="document" ${state.exportFormat==='document'?'selected':''}>Полная страница · открыть в браузере</option><option value="fragment" ${state.exportFormat==='fragment'?'selected':''}>Блок для HTML-поля сайта · без шапки</option></select></label><button class="primary full" id="download-html">Скачать один HTML</button><button class="full" id="copy-html">Скопировать HTML-код</button><h3 class="section-top">Обновление данных</h3><label class="checkline"><input type="checkbox" id="auto-refresh" ${state.autoRefresh?'checked':''}>Обновлять данные при запуске и каждый час, пока открыт конструктор</label><p class="muted">Экспорт — снимок текущей версии. После обновления данных сохраните HTML заново. Фотографии и шрифты загружаются через интернет.</p><h3 class="section-top">Сохранить работу</h3><p class="intro">Проект сохраняется на сервере в вашем аккаунте. JSON позволяет перенести его или вернуться к сохранённой версии.</p><button class="full" data-backup>Скачать проект JSON</button><label class="import-label" for="import-project">Открыть проект JSON</label><p class="muted section-top">При конфликте скачайте JSON или сохраните отдельную копию в разделе «Мои страницы».</p>`;
}
async function resolveBlock(key, codes) {
  const b=state.blocks[key], parts=[...new Set(codes.split(/[,;\s]+/).filter(Boolean))];
  if(key==='promos' && parts.length>2) throw new Error('В этом блоке две карточки. Укажите не больше двух артикулов.');
  if(parts.length>250) throw new Error('Укажите до 250 артикулов в одном блоке.');
  const result=await api('products?codes='+encodeURIComponent(parts.join(',')));
  result.products.forEach(p=>products[p.code]=p);
  b.resolved=[...new Set(result.products.map(p=>p.code))];b.missing=result.missing;
  // Retain the original template if there is no catalog cache at all.
  b.loaded=Boolean(result.total)||parts.length===0;b.appliedCodes=codes;
  return result;
}
async function resolveAll() {
  if(state.templateId&&state.templateId!=='hasl')return;
  await Promise.all(Object.keys(names).map(key=>resolveBlock(key,state.blocks[key].appliedCodes??state.blocks[key].codes)));
}
async function applyProducts() {
  const button=$('#apply-products');button.disabled=true;button.textContent='Подбираем товары…';
  try{await resolveBlock(block,state.blocks[block].codes);dirtyBlocks.delete(block);changed();render();jump(block==='catalog'?'#hasl-embed-catalog':block==='collections'?'#hasl-embed-collections':'.hero-side');}
  catch(error){notify(error.message);button.disabled=false;button.textContent='Применить список';}
}
const desktopPreview={width:1440,height:900,zoom:'100'};
const tabletPreview={width:820,height:1180,zoom:'100'};
const phonePreview={width:430,height:932,zoom:'fit',device:'430x932'};
// Full logical screens in CSS px; sources and Android limits: docs/DEVICE_PRESETS.md.
const phoneDeviceGroups=[
 ['Apple · iPhone 18',[['iphone-18-pro','iPhone 18 Pro',402,874],['iphone-18-pro-max','iPhone 18 Pro Max',440,956]]],
 ['Apple · iPhone 17 и Air',[['iphone-17','iPhone 17',402,874],['iphone-17-pro','iPhone 17 Pro',402,874],['iphone-17-pro-max','iPhone 17 Pro Max',440,956],['iphone-17e','iPhone 17e',390,844],['iphone-air','iPhone Air',420,912]]],
 ['Apple · iPhone 16',[['iphone-16','iPhone 16',393,852],['iphone-16-plus','iPhone 16 Plus',430,932],['iphone-16-pro','iPhone 16 Pro',402,874],['iphone-16-pro-max','iPhone 16 Pro Max',440,956],['iphone-16e','iPhone 16e',390,844]]],
 ['Apple · iPhone 15',[['iphone-15','iPhone 15',393,852],['iphone-15-plus','iPhone 15 Plus',430,932],['iphone-15-pro','iPhone 15 Pro',393,852],['iphone-15-pro-max','iPhone 15 Pro Max',430,932]]],
 ['Apple · iPhone 14',[['390x844','iPhone 14 / 13',390,844],['iphone-14-plus','iPhone 14 Plus',428,926],['393x852','iPhone 14 Pro',393,852],['430x932','iPhone 14 Pro Max',430,932]]],
 ['Apple · Компактные модели',[['iphone-13-mini','iPhone 13 mini',375,812],['375x667','iPhone SE',375,667]]],
 ['Samsung · Galaxy S',[['galaxy-s26','Galaxy S26',360,780],['galaxy-s24','Galaxy S24',360,780]]],
 ['Samsung · Galaxy A',[['galaxy-a55','Galaxy A55',480,1040]]],
 ['Google · Pixel 10',[['pixel-10','Pixel 10',360,808],['pixel-10-pro','Pixel 10 Pro',427,952],['pixel-10-pro-xl','Pixel 10 Pro XL',448,997]]],
 ['Google · Pixel 9',[['pixel-9','Pixel 9',360,808],['pixel-9-pro','Pixel 9 Pro',427,952],['pixel-9-pro-xl','Pixel 9 Pro XL',448,997]]],
 ['Типовые размеры',[['360x800','Android',360,800]]]
];
const phoneDevices=new Map(phoneDeviceGroups.flatMap(([,items])=>items.map(([id,label,width,height])=>[id,{label,width,height}])));
const previewPreferenceKey=()=>{const account=document.querySelector('meta[name="editor-account-context"]')?.content;return account?'hasl-builder-preview:v1:'+account:null;};
const previewZooms=['fit','25','50','75','100','125','150','200'];
function loadPreviewPreferences(){
 try{const key=previewPreferenceKey(),raw=key&&localStorage.getItem(key);if(!raw||raw.length>4096)return null;const saved=JSON.parse(raw);if(saved?.version!==1)return null;
  const size=(v,max)=>Number.isInteger(v)&&v>=240&&v<=max;
  for(const [name,target] of [['desktop',desktopPreview],['tablet',tabletPreview]]){const p=saved[name];if(!p||typeof p!=='object')continue;if(size(p.width,3840))target.width=p.width;if(size(p.height,3840))target.height=p.height;if(previewZooms.includes(p.zoom))target.zoom=p.zoom;}
  const p=saved.phone;if(p&&typeof p==='object'){if(previewZooms.includes(p.zoom))phonePreview.zoom=p.zoom;const device=phoneDevices.get(p.device);if((device||p.device==='custom')&&size(p.width,2400)&&size(p.height,2400)&&(!device||p.width===device.width&&p.height===device.height||p.width===device.height&&p.height===device.width))Object.assign(phonePreview,{device:p.device,width:p.width,height:p.height});}
  return ['both','desktop','tablet','phone'].includes(saved.mode)?saved.mode:'both';
 }catch{return null;}
}
const savedPreviewMode=loadPreviewPreferences();
function savePreviewPreferences(){try{const key=previewPreferenceKey();if(key)localStorage.setItem(key,JSON.stringify({version:1,mode:$('.preview-area').dataset.mode,desktop:desktopPreview,tablet:tabletPreview,phone:phonePreview}));}catch{/* Browser storage may be unavailable; the current view still works. */}}
function scaleFrames() {
  const area=$('.preview-area'),tablet=area.dataset.mode==='tablet',profile=tablet?tabletPreview:desktopPreview,exact=true,zoom=profile.zoom;
  const controls=$('#desktop-preview-controls');if(controls)controls.hidden=false;
  const normal=$('#preview-zoom-control');if(normal)normal.hidden=false;
  for(const id of ['desktop-zoom','preview-zoom'])if($('#'+id))$('#'+id).value=zoom;
  for(const [id,value] of [['phone-device',phonePreview.device],['phone-zoom',phonePreview.zoom],['phone-width',phonePreview.width],['phone-height',phonePreview.height]]){const input=$('#'+id);if(input&&document.activeElement!==input)input.value=value;}
  if($('#phone-custom-size'))$('#phone-custom-size').hidden=phonePreview.device!=='custom';
  $('#desktop-wrap').classList.add('desktop-viewport-scroll');
  for(const id of ['desktop','phone']) {
    const wrap=$('#'+id+'-wrap'),frame=$('#'+id),stage=$('#'+id+'-stage');
    if(!wrap||!frame||!stage)continue;
    if(id==='phone'){
      const port=$('#phone-viewport');if(!port?.clientWidth||!port.clientHeight)continue;
      const {width:w,height:h,zoom:pz}=phonePreview,ratio=pz==='fit'?Math.max(.01,Math.min(1,(port.clientWidth-24)/(w+12),(port.clientHeight-24)/(h+12))):Number(pz)/100;
      wrap.style.width=((w+12)*ratio)+'px';wrap.style.height=((h+12)*ratio)+'px';wrap.style.borderWidth=(6*ratio)+'px';wrap.style.borderRadius=(38*ratio)+'px';
      stage.style.width=(w*ratio)+'px';stage.style.height=(h*ratio)+'px';
      frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform=`scale(${ratio})`;
      $('#phone-scale').textContent=(pz==='fit'?'Вписать · ':'')+Math.round(ratio*100)+'%';
      const label=$('#phone-resolution');if(label)label.textContent=w+' × '+h;
      continue;
    }
    if(!wrap.clientWidth||!wrap.clientHeight)continue;
    const w=profile.width,h=profile.height,ratio=zoom==='fit'?Math.min(1,wrap.clientWidth/w,exact?wrap.clientHeight/h:1):Number(zoom)/100;
    const viewportHeight=exact?h:Math.max(240,Math.ceil(wrap.clientHeight/ratio));
    stage.style.width=(w*ratio)+'px';stage.style.height=(viewportHeight*ratio)+'px';
    frame.style.width=w+'px';frame.style.height=viewportHeight+'px';frame.style.transform=`scale(${ratio})`;
    const label=$('#desktop-resolution');if(label)label.textContent=exact?w+' × '+h:'1440 px';
    const title=$('.device.desktop .device-label strong');if(title)title.textContent=tablet?'Планшет':'Десктоп';frame.title=tablet?'Предпросмотр планшета':'Предпросмотр десктопа';
    $('#desktop-scale').textContent=(zoom==='fit'?'Вписать · ':'')+Math.round(ratio*100)+'%';
  }
  window.SiteLayout?.syncPreview?.();
}
// This bootstrap runs before canvas assets load; onload is too late for links.
function guardEditorLinks(){
  const inspectLink=e=>{const link=e.target.closest?.('a[href]');if(!link)return;e.preventDefault();e.stopImmediatePropagation();parent.notify('Ссылка: '+link.getAttribute('href'));};
  document.addEventListener('click',inspectLink,true);
  document.addEventListener('auxclick',inspectLink,true);
}
let pendingJump=null;
function updatePreviews() {
  clearTimeout(previewTimer);
  // Keep the active document and native controls alive until editing finishes.
  const control=document.activeElement;
  if(control?.closest('#inspector')&&control.matches('input,textarea,select')||window.ObjectStudio?.busy||window.SiteLayers?.gesturing){
    previewTimer=setTimeout(updatePreviews,150);return;
  }
  const viewing=$('#designer-edit-mode')?.getAttribute('aria-pressed')==='false';
  let markup=R.build(state,products,content,{site:$('#preview-site').value,clean:viewing,preview:true});
  if(!viewing)markup=markup.replace(/<head([^>]*)>/i,tag=>tag+'<script>('+guardEditorLinks.toString()+')();<\/script>');
  const previewState=state,previewScope=window.SiteBuilder?.scope();
  for(const id of ['desktop','phone']) {
    const frame=$('#'+id), scroll=frame.contentWindow?.scrollY || 0;
    if(frame.__haslDocState===state&&frame.__haslDocScope===previewScope)frame.__faqOpen=[...frame.contentDocument.querySelectorAll('section[data-faq-mode]')].map(section=>({id:section.dataset.siteBlock,settings:section.dataset.faqInitial+'|'+section.dataset.faqMode,open:[...section.querySelectorAll('.faq-q[aria-expanded="true"]')].map(q=>q.getAttribute('aria-controls'))}));
    else if(frame.__faqScope!==previewScope||frame.__faqState!==state)frame.__faqOpen=[];
    frame.__faqScope=previewScope;frame.__faqState=state;
    frame.onload=()=>{
      if(state!==previewState||window.SiteBuilder?.scope()!==previewScope)return;
      frame.__haslDocState=previewState;frame.__haslDocScope=previewScope;
      const doc=frame.contentDocument;
      if(!viewing)for(const section of doc.querySelectorAll('section[data-faq-mode]')){const saved=frame.__faqOpen?.find(entry=>entry.id===section.dataset.siteBlock&&entry.settings===section.dataset.faqInitial+'|'+section.dataset.faqMode);if(saved)section.__haslFaq?.restore(saved.open);}
      if(!viewing){window.SiteBuilder?.bindPreview(frame);window.SiteWordstat?.attach(frame);}
      if(pendingJump)doc.querySelector(pendingJump)?.scrollIntoView();else frame.contentWindow.scrollTo(0,scroll);
    };
    frame.__haslDocState=null;frame.__haslDocScope=null;frame.srcdoc=markup;
  }
  scaleFrames();
}
function jump(selector) {
  pendingJump=selector;
  for(const id of ['desktop','phone']) $('#'+id).contentDocument?.querySelector(selector)?.scrollIntoView({behavior:'instant'});
}
function showPhotos(code) {
  const p=products[code], current=state.blocks[block].photos[code]||p.photos[0];
  focusBeforeDialog=document.activeElement;
  $('#photos-title').textContent='Выберите фото или видео';$('#photos-caption').textContent=p.name+' · арт. '+code;
  $('#photo-options').innerHTML=[...p.photos,...(p.videos||[])].map((url,i)=>`<button class="${url===current?'selected':''}" data-choose-photo="${i}" data-code="${E(code)}" aria-pressed="${url===current}">${i<p.photos.length?`<img src="${E(R.optimized(url,640))}" alt="Фото ${i+1}: ${E(p.name)}" loading="lazy">`:`<video src="${E(R.safe(url))}" poster="${E(R.optimized(p.photos[0],640))}" muted playsinline preload="none"></video>`}<span>${url===current?'Выбрано · ':''}${i<p.photos.length?'Фото '+(i+1):'Видео '+(i-p.photos.length+1)}</span></button>`).join('')||'<p>В каталоге нет фотографий этого товара.</p>';
  $('#photos-dialog').showModal();
}
async function sync(kinds=['products','reviews','news'],quiet=false) {
  if(syncing){if(!quiet)notify('Обновление уже выполняется.');return;}
  syncing=true;$('#refresh-all').disabled=true;($('#refresh-all .studio-button-label')||$('#refresh-all')).textContent='Обновляем…';$('#refresh-all').setAttribute('aria-busy','true');$('#data-status').textContent='Загружаем данные магазина. Каталог большой — это может занять минуту.';
  try {
    const result=await api('sync',{kinds,site:$('#preview-site').value}); content={...content,...result.content};
    if(kinds.includes('products')){await resolveAll();await window.SiteBuilder?.resolveInstances();}
    const errors=Object.entries(result.results).map(([k,v])=>[k,v.errors?.length?{...v,error:'Не удалось получить часть показателей магазинов. Используются последние сохранённые значения.'}:v]).filter(([,v])=>v.error);
    state.lastSync=new Date().toISOString();state.syncErrors=errors.map(([k,v])=>`${{products:'Каталог',reviews:'Отзывы',news:'Блог',statistics:'Показатели магазинов'}[k]}: ${v.error}`);
    changed();if(!$('#inspector').contains(document.activeElement)||!['TEXTAREA','INPUT'].includes(document.activeElement.tagName))render();
    $('#data-status').textContent=errors.length?'Часть данных не обновлена. Сохранённая версия доступна.':'Данные обновлены '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    if(errors.length)notify(state.syncErrors.join('\n'));
    else if(!quiet)notify('Данные обновлены. Ваши тексты, выбранные фото и свои отзывы сохранены.');
  } catch(error){$('#data-status').textContent='Не удалось обновить. Сохранённая версия доступна.';notify(error.message);}
  finally{syncing=false;$('#refresh-all').disabled=false;($('#refresh-all .studio-button-label')||$('#refresh-all')).textContent='Обновить данные';$('#refresh-all').removeAttribute('aria-busy');}
}
function download(name,text,type) {
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function backup(){download((state.fileName||'ХАСЛ-проект-'+new Date().toISOString().slice(0,10)).replace(/[\\/:*?"<>|]/g,'-')+'.json',JSON.stringify(state,null,2),'application/json');}
async function prepareExportContent(sites=[state.exportSite]){
  if(state.templateId&&state.templateId!=='hasl')return content;
  const shops=[...new Set(sites.flatMap(site=>site==='both'?['hasl','hasle']:[site==='hasle'?'hasle':'hasl']))];
  const data={...content,shops:{...content.shops}};
  const loaded=await Promise.all(shops.map(async site=>({site,value:await api('content?site='+site+'&load=1')})));
  for(const {site,value} of loaded){
    if(Array.isArray(value.finderBrands))data.finderBrands=value.finderBrands;
    for(const kind of ['reviews','news'])if(!value[kind]?.updated&&!value[kind]?.items?.length)throw Error('Не загружены '+(kind==='reviews'?'отзывы':'новости')+' '+(site==='hasle'?'HASLESTORE':'ХАСЛ')+'. Обновите данные магазина перед экспортом.');
    data.shops[site]={reviews:value.reviews,news:value.news};data.statistics={...data.statistics,...value.statistics};
  }
  return data;
}
async function preparedExport(){
  const snapshot=JSON.stringify(state),scope=window.SiteBuilder?.scope(),data=await prepareExportContent();
  if(snapshot!==JSON.stringify(state)||scope!==window.SiteBuilder?.scope())throw Error('Страница изменилась во время подготовки. Повторите экспорт.');
  return exported(data);
}
function exported(data=content) {
  if(dirtyBlocks.size)throw new Error('Сначала примените изменённые списки артикулов: '+[...dirtyBlocks].map(x=>names[x]).join(', '));
  const missing=[...Object.values(state.blocks).flatMap(b=>b.missing),...(state.layout||[]).flatMap(b=>b.products?.missing||[])];
  if(missing.length)throw new Error('Не найдены артикулы: '+missing.join(', ')+'. Исправьте список перед экспортом.');
  return R.build(state,products,data,{site:state.exportSite,fragment:state.exportFormat==='fragment',clean:true});
}
function toggleVisible(kind,id,checked) {
  const s=state[kind],manual=s.manual.find(x=>x.id===id);
  if(manual){s.hidden=s.hidden.filter(x=>x!==id);if(!checked)s.hidden.push(id);changed();return;}
  if(s.mode==='auto'){
    s.selected=R.selectItems(kind,state,content).filter(x=>!x.manual).map(x=>x.id);s.mode='selected';
  }
  s.hidden=s.hidden.filter(x=>x!==id);
  if(checked&&!s.selected.includes(id))s.selected.push(id);
  if(!checked)s.selected=s.selected.filter(x=>x!==id);
  for(const chosen of s.selected){const item=content[kind].items.find(x=>x.id===chosen);if(item)s.pinned[chosen]=item;}
  changed();
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!state)return;
  try{
    if(b.dataset.tab){tab=b.dataset.tab;render();$('#inspector').scrollTop=0;}
    if(b.id==='export-top'){tab='export';render();$('#inspector').scrollTop=0;}
    if(b.id==='apply-products')await applyProducts();
    if(b.dataset.photo)showPhotos(b.dataset.photo);
    if(b.dataset.choosePhoto!==undefined){const p=products[b.dataset.code];state.blocks[block].photos[p.code]=[...p.photos,...(p.videos||[])][Number(b.dataset.choosePhoto)];$('#photos-dialog').close();changed();render();}
    if(b.id==='close-photos')$('#photos-dialog').close();
    if(b.dataset.jump)jump(b.dataset.jump);
    if(b.dataset.move!==undefined || b.dataset.removeProduct){
      if(dirtyBlocks.has(block))throw new Error('Сначала примените изменённый список артикулов.');
      const settings=state.blocks[block];
      if(b.dataset.removeProduct)settings.resolved=settings.resolved.filter(x=>x!==b.dataset.removeProduct);
      else{const i=+b.dataset.move,j=i+Number(b.dataset.direction);if(j>=0&&j<settings.resolved.length)[settings.resolved[i],settings.resolved[j]]=[settings.resolved[j],settings.resolved[i]];}
      settings.codes=settings.resolved.join(', ');settings.appliedCodes=settings.codes;settings.missing=[];changed();render();
    }
    if(b.id==='refresh-all')await sync();
    if(b.dataset.sync)await sync([b.dataset.sync]);
    if(b.id==='add-review'){
      const r={id:'manual-'+crypto.randomUUID(),manual:true,name:'Имя покупателя',city:'',text:'Текст отзыва',photos:[],product:{name:'',url:''},date:new Date().toISOString().slice(0,10)};
      state.reviews.manual.push(r);changed();render();const card=$(`[data-content-card="${r.id}"]`);card.open=true;card.scrollIntoView({block:'nearest'});
    }
    if(b.dataset.resetContent){const s=state[b.dataset.resetContent],id=b.dataset.id;delete s.overrides[id];s.manual=s.manual.filter(x=>x.id!==id);changed();render();}
    if(b.id==='backup-project'||b.hasAttribute('data-backup'))backup();
    if(b.id==='download-html'){download((state.templateId&&state.templateId!=='hasl'?'сайт-'+(state.fileName||'страница'):'ХАСЛ-главная-'+({both:'оба-сайта',hasl:'хасл',hasle:'haslestore'}[state.exportSite]))+'.html',await preparedExport(),'text/html;charset=utf-8');await save();notify('HTML сохранён в загрузки браузера.');}
    if(b.id==='copy-html'){await navigator.clipboard.writeText(await preparedExport());notify('HTML-код скопирован.');}
  }catch(error){notify(error.message);}
});
document.addEventListener('input',e=>{
  const el=e.target;if(!state)return;
  if(el.id==='codes'){state.blocks[block].codes=el.value;dirtyBlocks.add(block);changed({preview:false});return;}
  if(el.id==='page-title')state.title=el.value;
  else if(el.dataset.text)state.texts[el.dataset.text]=el.value;
  else if(el.dataset.linkTarget)(state.linkTargets||={})[el.dataset.linkTarget]=el.checked;
  else if(el.dataset.link)state.links[el.dataset.link]=el.value;
  else if(el.dataset.image)state.images[el.dataset.image]=el.value;
  else if(el.dataset.edit){
    const s=state[el.dataset.kind],id=el.dataset.id,raw=s.manual.find(x=>x.id===id)||content[el.dataset.kind].items.find(x=>x.id===id)||s.pinned[id];
    const target=raw.manual?raw:(s.overrides[id]||={});let key=el.dataset.edit;
    if(key==='photos')target.photos=el.value.split(/\n/).map(x=>x.trim()).filter(Boolean);
    else if(key.startsWith('product-')){target.product={...(raw.product||{}),...target.product,[key.split('-')[1]]:el.value};}
    else target[key]=el.value;
  }else return;
  pendingJump=null;changed();
});
document.addEventListener('change',async e=>{
  const el=e.target;if(!state)return;
  try{
    if(el.id==='block-select'){block=el.value;render();return;}
    if(el.id==='preview-site'){switchPreviewShop();return;}
    if(el.dataset.mode){state[el.dataset.mode].mode=el.value;render();}
    else if(el.dataset.limit){state[el.dataset.limit].limit=Math.min(30,Math.max(1,Number(el.value)||1));el.value=state[el.dataset.limit].limit;}
    else if(el.dataset.visible){toggleVisible(el.dataset.visible,el.dataset.id,el.checked);const mode=$(`[data-mode="${el.dataset.visible}"]`);if(mode)mode.value=state[el.dataset.visible].mode;return;}
    else if(el.name==='export-site')state.exportSite=el.value;
    else if(el.id==='export-format')state.exportFormat=el.value;
    else if(el.id==='auto-refresh'){state.autoRefresh=el.checked;scheduleSync();}
    else if(el.id==='import-project'){
      const file=el.files[0];if(!file)return;if(file.size>20_000_000)throw new Error('Файл проекта превышает 20 МБ.');
      const imported=validateProject(JSON.parse(await file.text()));
      await SiteBuilder.beforeSwitch();backup();state=imported;SiteBuilder.newDraft();dirtyBlocks.clear();for(const [key,b] of Object.entries(state.blocks))if(b.appliedCodes!==undefined&&b.codes!==b.appliedCodes)dirtyBlocks.add(key);await resolveAll();render();notify('Проект открыт. Предыдущий проект скачан как резервная копия.');el.value='';scheduleSync();
    }else return;
    changed();
  }catch(error){notify(error.message);}
});
function scheduleSync(){clearInterval(syncTimer);if(state.autoRefresh)syncTimer=setInterval(()=>sync(undefined,true),3600000);}
$('#photos-dialog').addEventListener('close',()=>focusBeforeDialog?.isConnected&&focusBeforeDialog.focus());
new ResizeObserver(scaleFrames).observe($('#preview-area')||$('.preview-area'));
