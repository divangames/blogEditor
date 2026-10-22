'use strict';
const R = window.HaslRenderer, $ = s => document.querySelector(s), E = R.esc;
const names = {catalog:'Витрина «Пары с характером»',collections:'Коллекции «Узнаешь из тысячи»',promos:'Две карточки под первым экраном'};
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
  if(path.startsWith('products?'))$('#data-status').textContent='Полный каталог ХАСЛ: '+result.total+' товаров';
  return result;
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
  const renders={products:renderProducts,texts:renderTexts,reviews:()=>renderContent('reviews'),news:()=>renderContent('news'),export:renderExport,...(window.SiteBuilder?.renders||{})};
  $('#inspector').innerHTML=renders[tab]();
  $('#product-count').textContent=String(state.blocks.catalog.resolved.length);
}
function renderProducts() {
  const b=state.blocks[block];
  return `<h2>Товары на странице</h2><p class="intro">Вставьте артикулы. Фото, названия и цены подтянутся из каталога магазина.</p><label class="field"><span>Товарный блок</span><select id="block-select" class="block-switch">${Object.entries(names).map(([key,label])=>`<option value="${key}" ${key===block?'selected':''}>${E(label)}</option>`).join('')}</select></label>${field('Артикулы товаров',b.codes,'id="codes" class="codes" placeholder="43816, 46713\n47509"')}<p class="muted">Через запятую, пробел или с новой строки. Порядок в списке = порядок на странице.${block==='promos'?' До двух артикулов; пустой список возвращает исходные промо.':''}</p><div class="row section-top"><button class="dark" id="apply-products">Применить список</button><button class="small" data-jump="${block==='catalog'?'#hasl-embed-catalog':block==='collections'?'#hasl-embed-collections':'.hero-side'}">Показать блок</button></div><div class="notice error" id="products-error">${b.missing.length?'Не найдены: '+E(b.missing.join(', '))+'. Проверьте артикулы и обновите каталог.':''}</div>${dirtyBlocks.has(block)?'<div class="notice">Список изменён. Нажмите «Применить список».</div>':''}<div class="products-list"><div class="row"><h3>${b.resolved.length} товаров</h3><button class="small" data-sync="products">Обновить каталог</button></div>${b.resolved.map((code,i)=>{const p=products[code];if(!p)return '';const chosen=b.photos[code]||p.photos[0];return `<article class="product-row"><img src="${E(R.optimized(p.photos.includes(chosen)?chosen:p.photos[0],256))}" alt="${E(p.name)}" loading="lazy"><div><h3>${E(p.name)}</h3><p class="code">Арт. ${E(code)} · ${E(Number(p.price).toLocaleString('ru-RU'))} ₽${p.available?'':' · Нет в наличии'}</p><div class="row wrap"><button class="small" data-photo="${E(code)}">${(p.videos||[]).includes(chosen)?'Видео '+((p.videos||[]).indexOf(chosen)+1):'Фото '+(Math.max(0,p.photos.indexOf(chosen))+1)} · Выбрать медиа</button><button class="small" data-move="${i}" data-direction="-1" aria-label="Поднять товар ${E(code)}" ${i===0?'disabled':''}>↑</button><button class="small" data-move="${i}" data-direction="1" aria-label="Опустить товар ${E(code)}" ${i===b.resolved.length-1?'disabled':''}>↓</button><button class="small" data-remove-product="${E(code)}" aria-label="Убрать товар ${E(code)}">Убрать</button></div></div></article>`;}).join('')}${!b.resolved.length?'<p class="empty">Здесь появятся товары и выбор фотографии для каждого.</p>':''}</div>`;
}
function renderTexts() {
  return `<h2>Тексты и ссылки</h2><p class="intro">Содержание всех блоков: заголовки, акции, доставка, вопросы и кнопки. Форматирование страницы сохраняется.</p>${field('Название страницы',state.title,'id="page-title"','text')}${meta.sections.map((s,i)=>`<details class="text-section" ${i===0?'open':''}><summary>${E(s.name)}</summary><button class="small section-top" data-jump="[data-editor-section='${s.id}']">Показать в предпросмотре</button>${meta.fields.filter(f=>f.section===s.id).map(f=>field(f.value.length>65?f.value.slice(0,65)+'…':f.value,state.texts[f.id]??f.value,`data-text="${f.id}"`)).join('')}${meta.links.filter(f=>f.section===s.id).map(f=>field('Ссылка: '+(f.label.slice(0,50)||'Переход'),state.links[f.id]??f.value,`data-link="${f.id}"`,'text')).join('')}${meta.pictures.filter(f=>f.section===s.id).map(f=>field('Фото (URL): '+f.label,state.images[f.id]??f.value,`data-image="${f.id}"`,'url')).join('')}</details>`).join('')}`;
}
function renderContent(kind) {
  const reviews=kind==='reviews', settings=state[kind], pool=content[kind].items;
  const chosen=R.selectItems(kind,state,content);
  const date=content[kind].updated?new Date(content[kind].updated).toLocaleString('ru-RU'):'ещё не загружены';
  const items = [...(reviews?settings.manual:[]),...pool,...Object.values(settings.pinned).filter(x=>!pool.some(p=>p.id===x.id))];
  return `<h2>${reviews?'Отзывы покупателей':'Блог магазина'}</h2><p class="intro">${reviews?'Свежие отзывы, имена и фотографии — с сайта. Можно выбрать нужные или добавить свой отзыв.':'Обложка, заголовок и краткое описание загружаются вместе. Даты и просмотры на странице не показываются.'}</p><div class="row"><button class="dark" data-sync="${kind}">Обновить ${reviews?'отзывы':'блог'}</button><button class="small" data-jump="#hasl-embed-${reviews?'reviews':'content'}">Показать блок</button></div><p class="muted section-top">Обновлено: ${E(date)}</p><label class="field"><span>Что показывать на странице</span><select data-mode="${kind}"><option value="auto" ${settings.mode==='auto'?'selected':''}>Свежие автоматически</option><option value="selected" ${settings.mode==='selected'?'selected':''}>Только выбранные вручную</option></select></label>${settings.mode==='auto'?field('Количество',settings.limit,`data-limit="${kind}" min="1" max="30"`,'number'):'<p class="muted">Отметьте материалы ниже. Выбор сохранится после обновления.</p>'}<div class="notice">На странице: ${chosen.length}. ${reviews?'Добавленные вручную отзывы сохраняются при обновлении.':'Просмотры ниже — только для вашей работы в редакторе.'}</div>${reviews?'<button class="full" id="add-review">Добавить свой отзыв</button>':''}${items.map(raw=>{
    const r={...raw,...settings.overrides[raw.id]}, visible=chosen.some(x=>x.id===r.id);
    const manual=r.manual;
    return `<details class="edit-card" data-content-card="${E(r.id)}"><summary>${E(reviews?r.name+' · '+r.city:r.title)}</summary>${!reviews&&r.image?`<img src="${E(R.optimized(r.image,640))}" alt="${E(r.title)}" loading="lazy">`:''}${!reviews?`<p class="muted">Просмотры: ${E(r.views??'нет данных')}</p>`:''}<label class="checkline"><input type="checkbox" data-visible="${kind}" data-id="${E(r.id)}" ${visible?'checked':''}>Показывать на странице</label>${reviews?field('Имя',r.name,`data-edit="name" data-kind="${kind}" data-id="${E(r.id)}"`,'text')+field('Город',r.city,`data-edit="city" data-kind="${kind}" data-id="${E(r.id)}"`,'text'):field('Заголовок',r.title,`data-edit="title" data-kind="${kind}" data-id="${E(r.id)}"`,'text')}${field(reviews?'Текст отзыва':'Краткое описание',r.text,`data-edit="text" data-kind="${kind}" data-id="${E(r.id)}"`)}${reviews?field('Фотографии — URL по одной в строке',(r.photos||[]).join('\n'),`data-edit="photos" data-kind="${kind}" data-id="${E(r.id)}"`)+field('Товар',r.product?.name||'',`data-edit="product-name" data-kind="${kind}" data-id="${E(r.id)}"`,'text')+field('Ссылка на товар',r.product?.url||'',`data-edit="product-url" data-kind="${kind}" data-id="${E(r.id)}"`,'url'):field('Обложка — URL',r.image,`data-edit="image" data-kind="${kind}" data-id="${E(r.id)}"`,'url')+field('Ссылка на статью',r.url,`data-edit="url" data-kind="${kind}" data-id="${E(r.id)}"`,'url')}<button class="small ${manual?'danger':''}" data-reset-content="${kind}" data-id="${E(r.id)}">${manual?'Удалить свой отзыв':'Вернуть данные источника'}</button></details>`;
  }).join('')}${!items.length?'<p class="empty">Пока нет данных. Нажмите кнопку обновления. При недоступности сайта сохранённая страница остаётся в предпросмотре.</p>':''}`;
}
function renderExport() {
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
  await Promise.all(Object.keys(names).map(key=>resolveBlock(key,state.blocks[key].appliedCodes??state.blocks[key].codes)));
}
async function applyProducts() {
  const button=$('#apply-products');button.disabled=true;button.textContent='Подбираем товары…';
  try{await resolveBlock(block,state.blocks[block].codes);dirtyBlocks.delete(block);changed();render();jump(block==='catalog'?'#hasl-embed-catalog':block==='collections'?'#hasl-embed-collections':'.hero-side');}
  catch(error){notify(error.message);button.disabled=false;button.textContent='Применить список';}
}
const desktopPreview={width:1920,height:1080,zoom:'fit'};
function scaleFrames() {
  const exact=$('.preview-area').classList.contains('preview-expanded')&&$('.preview-area').dataset.mode==='desktop';
  const controls=$('#desktop-preview-controls');if(controls)controls.hidden=!exact;
  const stage=$('#desktop-stage');
  const resolutionLabel=$('#desktop-resolution');
  $('#desktop-wrap').classList.toggle('desktop-viewport-scroll',exact);
  for(const [id,width] of [['desktop',1440],['phone',390]]) {
    const wrap=$('#'+id+'-wrap'),frame=$('#'+id),scale=wrap.clientWidth/width;
    if(!scale)continue;
    if(id==='desktop'&&exact&&stage){
      const {width:w,height:h,zoom}=desktopPreview;
      const ratio=zoom==='fit'?Math.min(1,wrap.clientWidth/w,wrap.clientHeight/h):Number(zoom)/100;
      stage.style.width=(w*ratio)+'px';stage.style.height=(h*ratio)+'px';
      frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform=`scale(${ratio})`;
      if(resolutionLabel)resolutionLabel.textContent=w+' × '+h;
      $('#desktop-scale').textContent=(zoom==='fit'?'Вписать · ':'')+Math.round(ratio*100)+'%';
      continue;
    }
    if(id==='desktop'){if(stage){stage.style.width='100%';stage.style.height='100%';}if(resolutionLabel)resolutionLabel.textContent='1440 px';}
    frame.style.width=width+'px';frame.style.height=Math.ceil(wrap.clientHeight/scale)+'px';frame.style.transform=`scale(${scale})`;
    $('#'+id+'-scale').textContent=Math.round(scale*100)+'%';
  }
}
let pendingJump=null;
function updatePreviews() {
  const markup=R.build(state,products,content,{site:$('#preview-site').value});
  for(const id of ['desktop','phone']) {
    const frame=$('#'+id), scroll=frame.contentWindow?.scrollY || 0;
    frame.onload=()=>{
      const doc=frame.contentDocument;
      window.SiteBuilder?.bindPreview(frame);
      window.SiteWordstat?.attach(frame);
      doc.addEventListener('click',e=>{if(e.target.closest('[contenteditable]'))return;const link=e.target.closest('a');if(link&&!link.getAttribute('href')?.startsWith('#')){e.preventDefault();notify('В предпросмотре внешние переходы отключены. Ссылка: '+link.getAttribute('href'));}},true);
      if(pendingJump)doc.querySelector(pendingJump)?.scrollIntoView();else frame.contentWindow.scrollTo(0,scroll);
    };
    frame.srcdoc=markup;
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
  syncing=true;$('#refresh-all').disabled=true;$('#refresh-all').textContent='Обновляем…';$('#data-status').textContent='Загружаем данные магазина. Каталог большой — это может занять минуту.';
  try {
    const result=await api('sync',{kinds}); content=result.content;
    if(kinds.includes('products')){await resolveAll();await window.SiteBuilder?.resolveInstances();}
    const errors=Object.entries(result.results).filter(([,v])=>v.error);
    state.lastSync=new Date().toISOString();state.syncErrors=errors.map(([k,v])=>`${{products:'Каталог',reviews:'Отзывы',news:'Блог'}[k]}: ${v.error}`);
    changed();if(!$('#inspector').contains(document.activeElement)||!['TEXTAREA','INPUT'].includes(document.activeElement.tagName))render();
    $('#data-status').textContent=errors.length?'Часть данных не обновлена. Сохранённая версия доступна.':'Данные обновлены '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    if(errors.length)notify(state.syncErrors.join('\n'));
    else if(!quiet)notify('Данные обновлены. Ваши тексты, выбранные фото и свои отзывы сохранены.');
  } catch(error){$('#data-status').textContent='Не удалось обновить. Сохранённая версия доступна.';notify(error.message);}
  finally{syncing=false;$('#refresh-all').disabled=false;$('#refresh-all').textContent='Обновить данные';}
}
function download(name,text,type) {
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function backup(){download('ХАСЛ-проект-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json');}
function exported() {
  if(dirtyBlocks.size)throw new Error('Сначала примените изменённые списки артикулов: '+[...dirtyBlocks].map(x=>names[x]).join(', '));
  const missing=[...Object.values(state.blocks).flatMap(b=>b.missing),...(state.layout||[]).flatMap(b=>b.products?.missing||[])];
  if(missing.length)throw new Error('Не найдены артикулы: '+missing.join(', ')+'. Исправьте список перед экспортом.');
  return R.build(state,products,content,{site:state.exportSite,fragment:state.exportFormat==='fragment',clean:true});
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
    if(b.id==='download-html'){download('ХАСЛ-главная-'+({both:'оба-сайта',hasl:'хасл',hasle:'haslestore'}[state.exportSite])+'.html',exported(),'text/html;charset=utf-8');await save();notify('HTML сохранён в загрузки браузера.');}
    if(b.id==='copy-html'){await navigator.clipboard.writeText(exported());notify('HTML-код скопирован.');}
  }catch(error){notify(error.message);}
});
document.addEventListener('input',e=>{
  const el=e.target;if(!state)return;
  if(el.id==='codes'){state.blocks[block].codes=el.value;dirtyBlocks.add(block);changed({preview:false});return;}
  if(el.id==='page-title')state.title=el.value;
  else if(el.dataset.text)state.texts[el.dataset.text]=el.value;
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
    if(el.id==='preview-site'){updatePreviews();return;}
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
