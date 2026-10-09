// Product shelf, article outline and editable table of contents.
let productLibrary = [];

function productsFromArticle() {
  return [...canvas.querySelectorAll('.om-product')].map(card => {
    const sku = (card.querySelector('.om-sku')?.textContent || card.id).match(/\d{3,12}/)?.[0];
    const link = card.querySelector('h3 a');
    const price=card.querySelector('.om-price');
    const currentPrice=price?.cloneNode(true);currentPrice?.querySelectorAll('.om-price-old,s,del').forEach(node=>node.remove());
    const number=value=>Number(String(value || '').replace(/\s/g,'').match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',','.')) || 0;
    const badge=card.querySelector('.om-product-badge')?.textContent.trim().toLowerCase();
    return sku && link ? {sku, title:link.textContent.replace(/\s*→\s*$/, '').trim(), url:link.href,
      images:[...card.querySelectorAll('.om-gallery img')].map(img => img.src),
      price:number(price?.querySelector('.om-price-current,b,strong')?.textContent || currentPrice?.textContent),
      oldPrice:number(price?.querySelector('.om-price-old,s,del')?.textContent),
      sizes:[...card.querySelectorAll('.om-sizes>div>span,.om-size-list>span,.email-size-list>.email-size-chip')].map(node=>({name:node.querySelector('b,strong')?.textContent || node.textContent,hint:node.querySelector('small')?.textContent || ''})),
      properties:[...card.querySelectorAll('.om-product-properties li')].map(node=>node.textContent.trim()),
      details:[...card.querySelectorAll('.om-product-details li')].map(node=>node.textContent.trim()),
      features:[...card.querySelectorAll('.om-features li')].map(node=>node.textContent.trim()),
      inStock:badge==='в наличии' ? true : badge==='нет в наличии' ? false : undefined} : null;
  }).filter(Boolean);
}

function restoreProducts(value, {enhance = true} = {}) {
  productLibrary = Array.isArray(value) ? value.filter(item => item && /^\d{3,12}$/.test(item.sku) && /^https?:\/\//.test(item.url))
    .map(item=>({...item,
      images:Array.isArray(item.images)?item.images.filter(src=>typeof src==='string'):[],
      features:Array.isArray(item.features)?item.features.filter(feature=>typeof feature==='string'):[],
      properties:Array.isArray(item.properties)?item.properties.filter(value=>typeof value==='string'):[],
      details:Array.isArray(item.details)?item.details.filter(value=>typeof value==='string'):[],
      descriptionHtml:typeof item.descriptionHtml==='string'?item.descriptionHtml:'',
    })) : productsFromArticle();
  renderProducts();
  if (enhance) enhanceComparisonTables();
}

function enhanceComparisonTables() {
  const productTitle = value => String(value || '').replace(/\s*→\s*$/, '').trim().toLocaleLowerCase('ru-RU');
  for (const table of canvas.querySelectorAll('.om-table-scroll table')) {
    const headings = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.cells].forEach((cell,index) => cell.dataset.label = headings[index] || `Показатель ${index}`);
      const cell = row.cells[0];
      const link = cell?.querySelector('a[href]');
      if (!link) continue;
      const sku = row.dataset.sku || link.getAttribute('href').match(/(\d{3,12})\/?$/)?.[1];
      const title = productTitle(link.textContent);
      const product = productLibrary.find(item => item.sku === sku) || productLibrary.find(item => productTitle(item.title) === title);
      const resolvedSku = product?.sku || sku;
      const card = (resolvedSku ? canvas.querySelector(`[id="product-${CSS.escape(resolvedSku)}"],[id$="-${CSS.escape(resolvedSku)}"].om-product`) : null)
        || [...canvas.querySelectorAll('.om-product')].find(item => productTitle(item.querySelector('h3 a')?.textContent) === title);
      const source = product?.images?.[1] || product?.images?.[0] || card?.querySelector('.om-gallery img')?.getAttribute('src');
      if (!source || cell.querySelector('img')) continue;
      let wrapper = link.closest('.om-model-cell');
      if (!wrapper) {wrapper=document.createElement('span');wrapper.className='om-model-cell';link.replaceWith(wrapper);wrapper.append(link);}
      const image = document.createElement('img'); image.className='om-model-thumb';image.src=source;image.alt=`${link.textContent.replace(/\s*→\s*$/, '').trim()}, фото товара`;
      wrapper.prepend(image);
    }
  }
}

function renderProducts() {
  $('#products').innerHTML = productLibrary.length ? productLibrary.map(product => `
    <div class="product-shelf-card" draggable="true" data-sku="${escapeHtml(product.sku)}" title="Перетащите в статью">
      ${product.images?.[0] ? `<img src="${escapeHtml(product.images[0])}" alt="" loading="lazy">` : `<span class="product-placeholder">${ACTIVE_EDITOR.name}</span>`}
      <div class="product-shelf-info"><strong>${escapeHtml(product.title)}</strong><small>Арт. ${escapeHtml(product.sku)}</small><div class="product-shelf-actions"><button type="button" data-insert="${escapeHtml(product.sku)}">Вставить</button><button type="button" data-remove="${escapeHtml(product.sku)}" aria-label="Убрать товар">×</button></div></div>
    </div>`).join('') : '<p class="help">Загруженные товары появятся здесь.</p>';
}

function insertProduct(product, point) {
  const existing = document.getElementById(`product-${product.sku}`);
  if (existing && canvas.contains(existing)) {existing.scrollIntoView({behavior:'smooth',block:'center'});return toast('Этот товар уже есть в статье');}
  if (!point) {const card=addProduct(product);updateComparisonLinks(product);renderOutline();return card;}
  const before = Object.hasOwn(point, 'before') ? point.before : rootBeforeAtY(point.y);
  const card = insertBlockAt(productMarkup(product), before);
  updateComparisonLinks(product);renderOutline();
  return card;
}
function updateComparisonLinks(product) {
  canvas.querySelectorAll('.om-table-scroll tbody a[href]').forEach(link=>{
    if(sameOutmaxDestination(link.getAttribute('href'),product.url)){link.setAttribute('href',`#product-${product.sku}`);link.removeAttribute('target');link.removeAttribute('rel');}
  });
}

$('#products').addEventListener('click', event => {
  const insert = event.target.closest('[data-insert]');
  const remove = event.target.closest('[data-remove]');
  if (insert) {const product=productLibrary.find(item => item.sku === insert.dataset.insert);if(product) insertProduct(product);}
  if (remove) {productLibrary=productLibrary.filter(item => item.sku !== remove.dataset.remove);renderProducts();changed();}
});
$('#products').addEventListener('dragstart', event => {
  const card=event.target.closest('[data-sku]'); if (!card) return;
  event.dataTransfer.effectAllowed='copy';
  event.dataTransfer.setData('application/x-outmax-product', card.dataset.sku);
  event.dataTransfer.setData('text/plain', card.dataset.sku);
});
$('#products').addEventListener('dragend', () => {if(!insertionLocked) $('#insertion-marker').hidden=true;});
canvas.addEventListener('drop', event => {
  const sku=event.dataTransfer.getData('application/x-outmax-product');
  if (!sku) return;
  event.preventDefault();
  const product=productLibrary.find(item => item.sku === sku);
  if(product) insertProduct(product,{y:event.clientY});
});

$('#load-products').addEventListener('click', async () => {
  const input=$('#product-input');
  const values=[...new Set(input.value.split(/[,;\n\r]+/).map(v=>v.trim()).filter(Boolean))];
  if (!values.length) return toast('Вставьте артикулы или ссылки',true);
  if (values.length > 30) return toast('За один раз можно загрузить до 30 товаров',true);
  const button=$('#load-products'); button.disabled=true;
  const failed=[]; let loaded=0;
  for (const value of values) {
    button.textContent=`Загружено ${loaded} из ${values.length}…`;
    try {
      const product=await api('/api/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value,site:$('#product-site').value})});
      const at=productLibrary.findIndex(item=>item.sku===product.sku);
      if(at>=0) productLibrary[at]=product; else productLibrary.push(product);
      loaded++; renderProducts();
    } catch(error) {failed.push(`${value}: ${error.message}`);}
  }
  input.value=failed.map(item=>item.split(': ')[0]).join('\n');
  button.disabled=false;button.innerHTML='Загрузить товары <span>↗</span>';
  if(loaded) changed();
  toast(failed.length ? `Загружено ${loaded}. Ошибки: ${failed.join('; ')}` : `Загружено товаров: ${loaded}`,!!failed.length);
});

function comparisonCriteria(products) {
  const counts=new Map();
  products.forEach(product=>new Set((product.features||[]).map(feature=>feature.trim()).filter(Boolean)).forEach(feature=>{
    const key=feature.toLocaleLowerCase('ru-RU');
    if(!counts.has(key)) counts.set(key,{label:feature,count:0});
    counts.get(key).count++;
  }));
  return [...counts.values()].sort((a,b)=>{
    const aDistinct=a.count<products.length?1:0,bDistinct=b.count<products.length?1:0;
    return bDistinct-aDistinct || b.count-a.count;
  }).slice(0,3).map(item=>item.label);
}
function comparisonRow(product,criteria,autoCount) {
  const image=product.images?.[1] || product.images?.[0];
  const target=canvas.querySelector(`[id="product-${CSS.escape(product.sku)}"]`) ? `#product-${product.sku}` : product.url;
  const external=target.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
  const features=new Set((product.features||[]).map(feature=>feature.trim().toLocaleLowerCase('ru-RU')));
  const cells=criteria.map((criterion,index)=>`<td data-label="${escapeHtml(criterion)}">${index>=autoCount?'—':features.has(criterion.toLocaleLowerCase('ru-RU'))?'Указано':'Не указано'}</td>`).join('');
  return `<tr data-sku="${escapeHtml(product.sku)}"><td data-label="Модель"><span class="om-model-cell">${image?`<img class="om-model-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}, фото товара">`:''}<a href="${escapeHtml(target)}"${external}>${escapeHtml(product.title)} →</a></span></td>${cells}</tr>`;
}
$('#add-comparison').addEventListener('click',()=>openComparisonDialog());

const comparisonSources={custom:'Свой показатель',price:'Цена',oldPrice:'Старая цена',sizes:'Размеры',inStock:'Наличие',property:'Отдельное свойство',properties:'Материалы и свойства',features:'Особенности',details:'Детали'};
let editingComparison=null,comparisonPool=[];
const comparisonDialog=document.createElement('dialog');comparisonDialog.id='comparison-dialog';comparisonDialog.className='comparison-dialog';comparisonDialog.setAttribute('aria-labelledby','comparison-dialog-title');
comparisonDialog.innerHTML=`<header><h2 id="comparison-dialog-title">Таблица сравнения товаров</h2><button type="button" data-comparison-close aria-label="Закрыть">×</button></header><form><div class="comparison-settings"><label>Название сравнения<input id="comparison-title" value="Сравнение моделей"></label><label>Первый столбец<input id="comparison-model-header" value="Модель"></label><label>Размер заголовков, px<input id="comparison-heading-size" type="number" min="8" max="60" value="14"></label><label>Регистр заголовков<select id="comparison-heading-case"><option value="none">Как введено</option><option value="uppercase">Верхний регистр</option></select></label><label>Фон заголовков<input id="comparison-heading-background" type="color"></label><label>Цвет заголовков<input id="comparison-heading-color" type="color"></label><label>Размер миниатюры 1:1, px<input id="comparison-photo-width" type="number" min="24" max="240" value="72"></label><label>Кадрирование<select id="comparison-photo-fit"><option value="cover">Заполнить квадрат</option></select></label><label>Скругление, px<input id="comparison-photo-radius" type="number" min="0" max="120" value="0"></label><label>Сортировка<select id="comparison-sort"><option value="none">Порядок списка</option><option value="price-asc">Цена по возрастанию</option><option value="price-desc">Цена по убыванию</option><option value="title">Название</option></select></label><label class="comparison-check"><input id="comparison-photos" type="checkbox" checked> Показывать фото</label><label class="comparison-check"><input id="comparison-skus" type="checkbox"> Показывать артикулы</label><label class="comparison-check"><input id="comparison-refresh" type="checkbox"> Обновить значения из данных товаров</label></div><section><h3>Товары</h3><div class="comparison-product-actions"><button type="button" data-comparison-select="all">Выбрать все</button><button type="button" data-comparison-select="none">Снять выбор</button></div><div id="comparison-products"></div></section><section><h3>Показатели сравнения</h3><p>Цена, размеры и свойства берутся из загруженных данных. Свой показатель заполняется вручную на холсте.</p><div id="comparison-criteria"></div><button id="comparison-add-criterion" type="button">＋ Добавить показатель</button></section><p id="comparison-error" role="status"></p><footer><button type="button" data-comparison-close>Отмена</button><button class="primary" type="submit">Применить таблицу</button></footer></form>`;
document.body.append(comparisonDialog);comparisonDialog.querySelectorAll('[data-comparison-close]').forEach(button=>button.onclick=()=>comparisonDialog.close());
for(const axis of ['y','x']){const label=document.createElement('label');label.innerHTML=`Центр фото ${axis.toUpperCase()}, %<input id="comparison-photo-${axis}" type="number" min="0" max="100" value="50">`;$('#comparison-photo-fit').parentElement.after(label);}

function comparisonValue(product,source,key=''){
  if(source==='price'||source==='oldPrice'){const value=Number(product[source]);return Number.isFinite(value)&&value>0 ? value.toLocaleString('ru-RU')+' ₽' : '—';}
  if(source==='inStock')return product.inStock===true ? 'В наличии' : product.inStock===false ? 'Нет в наличии' : '—';
  if(source==='sizes')return (product.sizes || []).map(size=>typeof size==='object' ? size.name+(size.hint ? ' · '+size.hint : '') : size).join(', ') || '—';
  if(source==='property'){const wanted=key.trim().toLocaleLowerCase('ru-RU');const values=[...(product.properties || []),...(product.features || [])];const found=values.find(value=>value.includes(':') && value.split(':')[0].trim().toLocaleLowerCase('ru-RU')===wanted);return found ? found.slice(found.indexOf(':')+1).trim() || '—' : '—';}
  return ['properties','features','details'].includes(source) ? (product[source] || []).join('; ') || '—' : '—';
}
function comparisonProductKey(row,index){const cell=row.querySelector(':scope > .om-comparison-model-column') || [...row.cells].find(candidate=>!candidate.classList.contains('om-comparison-thumb-column')),link=cell?.querySelector('a');let address=link?.getAttribute('href') || '';try{const parsed=new URL(address,location.href);address=parsed.hash || parsed.pathname;}catch{}
  return row.dataset.sku || cell?.querySelector('small,.om-sku')?.textContent.match(/\d{3,12}/)?.[0] || (address.match(/\d{3,12}/g)||[]).at(-1) || `existing-${index}`;
}
function comparisonCriterion(data={}){
  data={...data,source:Object.hasOwn(comparisonSources,data.source) ? data.source : 'custom'};
  const row=document.createElement('div');row.className='comparison-criterion';row.dataset.original=String(data.original ?? -1);row.dataset.originalSource=data.source || 'custom';
  row.innerHTML=`<input data-criterion="name" aria-label="Заголовок показателя" value="${escapeHtml(data.name || 'Новый показатель')}"><select data-criterion="source" aria-label="Данные показателя">${Object.entries(comparisonSources).map(([key,label])=>`<option value="${key}"${key===(data.source || 'custom')?' selected':''}>${label}</option>`).join('')}</select><div><button type="button" data-criterion-action="up" aria-label="Показатель выше">↑</button><button type="button" data-criterion-action="down" aria-label="Показатель ниже">↓</button><button type="button" data-criterion-action="remove" aria-label="Удалить показатель">×</button></div>`;
  $('#comparison-criteria').append(row);
  row.dataset.originalKey=data.key || '';
  const key=document.createElement('input');key.dataset.criterion='key';key.setAttribute('aria-label','Название свойства товара');key.placeholder='Свойство, например Материал';key.setAttribute('list','comparison-property-names');key.value=data.key || '';key.hidden=data.source!=='property';row.append(key);
  row.querySelector('[data-criterion=source]').addEventListener('change',event=>key.hidden=event.target.value!=='property');
}
function openComparisonDialog(table=null){
  if(table?.querySelector('[colspan]:not([colspan="1"]),[rowspan]:not([rowspan="1"])'))return toast('В таблице есть объединённые ячейки. Используйте обычные инструменты таблицы, чтобы сохранить её структуру.',true);
  editingComparison=table;
  const existingRows=[...(table?.tBodies[0]?.rows || [])];
  const available=[...productLibrary,...productsFromArticle()];const seen=new Set();comparisonPool=[];
  existingRows.forEach((row,index)=>{
    const modelCell=row.querySelector(':scope > .om-comparison-model-column') || [...row.cells].find(cell=>!cell.classList.contains('om-comparison-thumb-column'));
    const candidateSku=comparisonProductKey(row,index),link=modelCell?.querySelector('a'),src=modelCell?.querySelector('img')?.getAttribute('src');
    const product=available.find(p=>p.sku===candidateSku) || available.find(p=>p.title===link?.textContent.replace(/\s*→\s*$/,'').trim()) || {sku:candidateSku,title:link?.textContent.replace(/\s*→\s*$/,'').trim() || modelCell?.textContent.trim(),url:link?.getAttribute('href') || '',images:src?[src]:[]};const sku=product.sku;
    const photos=[...new Set([...(src?[src]:[]),...(product.images || [])])];comparisonPool.push({...product,title:link?.textContent.replace(/\s*→\s*$/,'').trim() || product.title,sku,images:photos,originalRow:row});seen.add(sku);
  });
  for(const product of available)if(!seen.has(product.sku)){comparisonPool.push({...product});seen.add(product.sku);}
  if(!comparisonPool.length)return toast('Сначала загрузите товары или добавьте карточки товаров в статью.',true);
  const heading=table?.closest('.om-section')?.querySelector(':scope > h2');$('#comparison-title').value=heading?.textContent || 'Сравнение моделей';
  const first=table?.tHead?.rows[0]?.querySelector('.om-comparison-model-column') || [...(table?.tHead?.rows[0]?.cells || [])].find(cell=>!cell.classList.contains('om-comparison-thumb-column')),thumb=table?.querySelector('tbody .om-comparison-model-column img'),style=first ? getComputedStyle(first) : null;
  $('#comparison-model-header').value=first?.textContent || 'Модель';$('#comparison-heading-size').value=style ? parseFloat(style.fontSize) : 14;
  $('#comparison-heading-background').value=style ? EditorStyling.accentSettings(first).fill : ACTIVE_EDITOR.key==='hasl'?'#111111':'#F7F6F6';
  $('#comparison-heading-color').value=style ? colorToHex(style.color) : ACTIVE_EDITOR.key==='hasl'?'#FFFFFF':'#231815';
  $('#comparison-heading-case').value=style?.textTransform==='uppercase'?'uppercase':'none';
  $('#comparison-photo-width').value=parseInt(thumb?.style.width) || (ACTIVE_EDITOR.key==='hasl'?72:52);
  $('#comparison-photo-fit').value='cover';$('#comparison-photo-radius').value=parseInt(thumb?.style.borderRadius)||0;
  const position=(thumb?.style.objectPosition || '50% 50%').match(/\d+(?:\.\d+)?/g) || [];$('#comparison-photo-x').value=position[0] || 50;$('#comparison-photo-y').value=position[1] || 50;
  $('#comparison-photos').checked=table ? table.style.getPropertyValue('--comparison-thumbnails')!=='0' : true;$('#comparison-skus').checked=table?.style.getPropertyValue('--comparison-skus')==='1';
  $('#comparison-refresh').checked=!table;$('#comparison-sort').value='none';$('#comparison-error').textContent='';
  $('#comparison-products').innerHTML=comparisonPool.map((product,index)=>`<div class="comparison-product"><label><input data-comparison-product="${index}" type="checkbox"${!table||product.originalRow?' checked':''}>${escapeHtml(product.title)}<small>Арт. ${escapeHtml(product.sku)}</small></label><img data-comparison-preview="${index}" src="${escapeHtml(assetUrl(product.images?.[product.originalRow?0:Math.min(1,(product.images?.length || 1)-1)] || ''))}" alt=""><select data-comparison-photo="${index}" aria-label="Фото ${escapeHtml(product.title)}">${product.images?.length ? product.images.map((src,i)=>`<option value="${i}"${i===(product.originalRow?0:Math.min(1,product.images.length-1))?' selected':''}>Фото ${i+1}</option>`).join('') : '<option value="">Нет фото</option>'}</select><div class="comparison-product-order"><button type="button" data-product-move="up" aria-label="Поднять товар ${escapeHtml(product.title)}" title="Товар выше">↑</button><button type="button" data-product-move="down" aria-label="Опустить товар ${escapeHtml(product.title)}" title="Товар ниже">↓</button></div></div>`).join('');
  syncComparisonProductOrder();
  $('#comparison-criteria').replaceChildren();
  if(table){[...(table.tHead?.rows[0]?.cells || [])].filter(cell=>!cell.classList.contains('om-comparison-thumb-column')&&!cell.classList.contains('om-comparison-model-column')).forEach(cell=>{let key='';try{key=JSON.parse(cell.style.getPropertyValue('--comparison-property') || '""');}catch{}comparisonCriterion({name:cell.textContent.trim(),source:cell.style.getPropertyValue('--comparison-source').trim() || 'custom',key,original:cell.cellIndex});});}
  else for(const source of ['price','sizes','inStock','properties'])comparisonCriterion({name:comparisonSources[source],source});
  let propertyNames=$('#comparison-property-names');if(!propertyNames){propertyNames=document.createElement('datalist');propertyNames.id='comparison-property-names';comparisonDialog.append(propertyNames);}propertyNames.replaceChildren();
  for(const name of new Set(comparisonPool.flatMap(p=>[...(p.properties || []),...(p.features || [])]).filter(value=>value.includes(':')).map(value=>value.split(':')[0].trim()))){const option=document.createElement('option');option.value=name;propertyNames.append(option);}
  comparisonDialog.showModal();
}
function syncComparisonProductOrder(){
  const rows=[...$('#comparison-products').children];
  rows.forEach((row,index)=>{
    row.querySelector('[data-product-move="up"]').disabled=index===0;
    row.querySelector('[data-product-move="down"]').disabled=index===rows.length-1;
  });
}
$('#comparison-products').addEventListener('click',event=>{
  const button=event.target.closest('[data-product-move]');if(!button)return;
  const row=button.closest('.comparison-product'),direction=button.dataset.productMove;
  const neighbour=direction==='up'?row.previousElementSibling:row.nextElementSibling;if(!neighbour)return;
  if(direction==='up')neighbour.before(row);else neighbour.after(row);
  $('#comparison-sort').value='none';syncComparisonProductOrder();
  (button.disabled?row.querySelector('[data-product-move]:not(:disabled)'):button)?.focus({preventScroll:true});
  row.scrollIntoView({block:'nearest'});
});
$('#comparison-products').addEventListener('change',event=>{const index=event.target.dataset.comparisonPhoto;if(index===undefined)return;const src=comparisonPool[index].images?.[Number(event.target.value)];const image=$(`[data-comparison-preview="${index}"]`);if(src)image.src=assetUrl(src);});
comparisonDialog.querySelectorAll('[data-comparison-select]').forEach(button=>button.onclick=()=>$('#comparison-products').querySelectorAll('input[type=checkbox]').forEach(input=>input.checked=button.dataset.comparisonSelect==='all'));
$('#comparison-add-criterion').onclick=()=>{if($('#comparison-criteria').children.length>=12)return toast('В одной таблице — до 12 показателей.',true);comparisonCriterion();};
$('#comparison-criteria').addEventListener('click',event=>{const action=event.target.dataset.criterionAction,row=event.target.closest('.comparison-criterion');if(!row)return;if(action==='remove')row.remove();if(action==='up'&&row.previousElementSibling)row.previousElementSibling.before(row);if(action==='down'&&row.nextElementSibling)row.nextElementSibling.after(row);});
comparisonDialog.querySelector('form').onsubmit=event=>{
  event.preventDefault();const error=$('#comparison-error');
  let products=[...$('#comparison-products').querySelectorAll('input:checked')].map(input=>comparisonPool[Number(input.dataset.comparisonProduct)]);
  const criteria=[...$('#comparison-criteria').children].map(row=>({name:row.querySelector('[data-criterion=name]').value.trim(),source:row.querySelector('[data-criterion=source]').value,key:row.querySelector('[data-criterion=key]').value.trim(),originalKey:row.dataset.originalKey,original:Number(row.dataset.original),originalSource:row.dataset.originalSource}));
  for(const criterion of criteria)if(criterion.source==='property' && !criterion.key)criterion.key=criterion.name;
  if(!products.length||!criteria.length||criteria.some(c=>!c.name)){error.textContent='Выберите товары и добавьте хотя бы один показатель с названием.';return;}
  const sort=$('#comparison-sort').value;
  if(sort==='title')products.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
  else if(sort.startsWith('price'))products.sort((a,b)=>{const x=Number(a.price),y=Number(b.price);if(!(x>0))return y>0?1:0;if(!(y>0))return -1;return sort==='price-asc'?x-y:y-x;});
  const table=editingComparison?.cloneNode(true) || document.createElement('table');table.classList.add('om-comparison-table');table.replaceChildren();
  table.style.setProperty('--comparison-thumbnails',$('#comparison-photos').checked?'1':'0');table.style.setProperty('--comparison-skus',$('#comparison-skus').checked?'1':'0');
  const head=table.createTHead().insertRow();
  for(const [index,name] of [$('#comparison-model-header').value.trim()||'Модель',...criteria.map(c=>c.name)].entries()){
    const th=document.createElement('th');th.textContent=name;th.style.setProperty('background',$('#comparison-heading-background').value,'important');th.style.setProperty('color',$('#comparison-heading-color').value,'important');th.style.setProperty('font-size',$('#comparison-heading-size').value+'px','important');th.style.setProperty('text-transform',$('#comparison-heading-case').value,'important');
    if(index){th.style.setProperty('--comparison-source',criteria[index-1].source);th.style.setProperty('--comparison-property',JSON.stringify(criteria[index-1].key));}head.append(th);
  }
  const body=table.createTBody();
  for(const product of products){
    const index=comparisonPool.indexOf(product),photoIndex=Number($(`[data-comparison-photo="${index}"]`).value),src=product.images?.[photoIndex];const row=body.insertRow();row.dataset.sku=product.sku;
    const model=row.insertCell();const wrapper=document.createElement('span');wrapper.className='om-model-cell';
    if(src){const img=document.createElement('img');img.className='om-model-thumb';img.src=assetUrl(src);img.alt=product.title+', фото товара';img.loading='lazy';
      const photoSize=$('#comparison-photo-width').value;
      for(const [key,value] of Object.entries({width:photoSize+'px',height:photoSize+'px','aspect-ratio':'1 / 1','object-fit':'cover','border-radius':$('#comparison-photo-radius').value+'px','object-position':$('#comparison-photo-x').value+'% '+$('#comparison-photo-y').value+'%',display:$('#comparison-photos').checked?'block':'none'}))img.style.setProperty(key,value,'important');wrapper.append(img);
    }
    const description=document.createElement('span');const href=canvas.querySelector(`[id="product-${CSS.escape(product.sku)}"]`) ? '#product-'+product.sku : product.url;
    const link=document.createElement(/^(https?:\/\/|#)/i.test(href)?'a':'strong');link.textContent=product.title;if(link.tagName==='A'){link.setAttribute('href',href);if(!href.startsWith('#')){link.target='_blank';link.rel='noopener noreferrer';}}description.append(link);
    if($('#comparison-skus').checked){const sku=document.createElement('small');sku.textContent='Арт. '+product.sku;sku.style.display='block';description.append(sku);}wrapper.append(description);model.append(wrapper);
    for(const criterion of criteria){const cell=row.insertCell(),old=product.originalRow?.cells[criterion.original];const preserve=old && criterion.source===criterion.originalSource && criterion.key===criterion.originalKey && (!$('#comparison-refresh').checked || criterion.source==='custom');if(preserve){cell.innerHTML=old.innerHTML;cell.style.cssText=old.style.cssText;}else cell.textContent=comparisonValue(product,criterion.source,criterion.key || criterion.name);}
  }
  ensureComparisonThumbnailColumns(table);normalizeComparisonThumbnails(table);syncTableLabels(table);
  let actual=table;
  if(editingComparison){const section=editingComparison.closest('.om-section'),heading=section?.querySelector(':scope > h2'),title=$('#comparison-title').value.trim()||'Сравнение моделей';if(heading && heading.textContent!==title)heading.textContent=title;editingComparison.replaceWith(table);changed();}
  else{const section=document.createElement('section');section.className='om-section';const title=document.createElement('h2');title.textContent=$('#comparison-title').value.trim()||'Сравнение моделей';const wrap=document.createElement('div');wrap.className='om-table-scroll';wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица сравнения товаров');wrap.tabIndex=0;wrap.append(table);section.append(title,wrap);actual=insertBlock(section.outerHTML).querySelector('table');}
  const firstRow=actual.tBodies[0]?.rows[0];if(firstRow && typeof selectNode==='function')selectNode(actual.closest('.om-table-scroll'),firstRow,firstRow.cells[0],true);
  comparisonDialog.close();renderOutline();toast('Таблица сравнения готова. Значения можно редактировать прямо на холсте.');
};

function sections() {return [...canvas.querySelectorAll('.om-section')].filter(section=>section.querySelector(':scope > h2'));}
function uniqueAnchor(base, except) {
  let id=cleanId(base), candidate=id, index=2;
  while([...canvas.querySelectorAll('[id]')].some(node=>node!==except && node.id===candidate)) candidate=`${id}-${index++}`;
  return candidate;
}
function ensureSectionIds() {
  sections().forEach((section,index)=>{if(!section.id) section.id=uniqueAnchor(`section-${index+1}`,section);});
  for(const heading of canvas.querySelectorAll('h2')){
    if(heading.closest('.om-toc') || heading.id)continue;
    const section=heading.parentElement;
    // Первый H2 готового раздела использует существующий якорь контейнера.
    if(section.matches('.om-section[id]') && section.querySelector(':scope > h2')===heading)continue;
    heading.id=uniqueAnchor(heading.textContent.trim() || 'heading',heading);
  }
}
function targets() {
  ensureSectionIds();
  return [...canvas.querySelectorAll('.om-section[id],.om-product[id],h2[id]')]
    .filter(node=>!node.closest('.om-toc'))
    .map(node=>({id:node.id,label:(node.matches('h2') ? node.textContent : node.querySelector(':scope > h2,:scope > h3')?.textContent)?.replace(/\s*→\s*$/,'').trim() || node.id}));
}
function refreshTargetSelects() {
  const available=targets();
  $('#toc-items').querySelectorAll('select[data-field="target"]').forEach(select=>{
    const link=tocLinks()[Number(select.closest('[data-toc]').dataset.toc)];
    const selected=link?.getAttribute('href')?.slice(1)||'';
    select.replaceChildren(...available.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.label} (#${item.id})`;option.selected=item.id===selected;return option;}));
  });
}
function tocNav() {return canvas.querySelector('.om-toc');}
function tocLinks() {return [...(tocNav()?.querySelectorAll(':scope > div > a') || [])];}
function createTocLink(label,id) {
  const a=document.createElement('a');a.href=`#${id}`;a.textContent=label;
  const arrow=document.createElement('span');arrow.textContent='↓';a.append(arrow);return a;
}
function renderOutline() {
  ensureSectionIds();
  $('#sections').innerHTML=sections().map((section,index)=>`<div class="outline-row" data-section="${index}"><label>Раздел ${index+1}<input data-field="title" value="${escapeHtml(section.querySelector(':scope > h2').textContent.trim())}" aria-label="Название раздела ${index+1}"></label><label>Якорь<input data-field="anchor" value="${escapeHtml(section.id)}" aria-label="Якорь раздела ${index+1}" spellcheck="false"></label><div class="outline-actions"><button data-action="focus" title="Перейти к разделу">↗</button><button data-action="up" title="Выше" ${index===0?'disabled':''}>↑</button><button data-action="down" title="Ниже" ${index===sections().length-1?'disabled':''}>↓</button><button data-action="remove" title="Удалить раздел">×</button></div></div>`).join('');
  const nav=tocNav();$('#toc-editor').hidden=!nav;
  const options=targets();
  $('#toc-items').innerHTML=tocLinks().map((link,index)=>{
    const id=decodeURIComponent(link.getAttribute('href')?.slice(1)||'');
    return `<div class="outline-row" data-toc="${index}"><label>Пункт ${index+1}<input data-field="label" value="${escapeHtml(link.childNodes[0]?.textContent?.trim()||'')}" aria-label="Текст пункта ${index+1}"></label><label>Ведёт к<select data-field="target" aria-label="Якорь пункта ${index+1}">${options.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===id?'selected':''}>${escapeHtml(item.label)} (#${escapeHtml(item.id)})</option>`).join('')}${options.some(item=>item.id===id)?'':`<option value="${escapeHtml(id)}" selected>Нет цели (#${escapeHtml(id)})</option>`}</select></label><div class="outline-actions"><button data-action="up" title="Выше" ${index===0?'disabled':''}>↑</button><button data-action="down" title="Ниже" ${index===tocLinks().length-1?'disabled':''}>↓</button><button data-action="remove" title="Удалить пункт">×</button></div></div>`;
  }).join('');
}

$('#add-section').addEventListener('click',()=>{
  const section=insertBlock(`<section class="om-section"><h2>Новый раздел</h2><p>Текст раздела.</p></section>`);
  section.id=uniqueAnchor('novyy-razdel',section);
  if(tocNav()) tocNav().querySelector(':scope > div').append(createTocLink('Новый раздел',section.id));
  renderOutline();
});
$('#add-toc').addEventListener('click',()=>{
  const items=targets().filter(item=>canvas.querySelector(`[id="${CSS.escape(item.id)}"]`)?.matches('.om-section'));
  if(!items.length) return toast('Сначала добавьте раздел',true);
  let nav=tocNav();if(!nav){nav=document.createElement('nav');nav.className='om-toc';nav.setAttribute('aria-label','Содержание статьи');}
  if(insertionLocked) insertBlockAt(nav,insertionBefore);
  else if(!canvas.contains(nav)){const header=canvas.querySelector('header');if(header)header.after(nav);else canvas.prepend(nav);}
  nav.innerHTML='<h2>В этой статье</h2><div></div>';
  items.forEach(item=>nav.querySelector('div').append(createTocLink(item.label,item.id)));
  renderOutline();changed();
});
$('#sections').addEventListener('input',event=>{
  const row=event.target.closest('[data-section]');if(!row)return;
  const section=sections()[Number(row.dataset.section)];if(!section)return;
  if(event.target.dataset.field==='title'){
    const old=section.querySelector(':scope > h2').textContent.trim();
    const value=event.target.value.trim()||'Раздел';section.querySelector(':scope > h2').textContent=value;
    tocLinks().filter(link=>link.getAttribute('href')===`#${section.id}` && link.childNodes[0]?.textContent.trim()===old).forEach(link=>link.childNodes[0].textContent=value);
  }
  if(event.target.dataset.field==='anchor'){
    const old=section.id;section.id=uniqueAnchor(event.target.value||old,section);
    tocLinks().filter(link=>link.getAttribute('href')===`#${old}`).forEach(link=>link.setAttribute('href',`#${section.id}`));
  }
  refreshTargetSelects();changed();
});
$('#sections').addEventListener('change',event=>{if(event.target.dataset.field==='anchor'){const row=event.target.closest('[data-section]');event.target.value=sections()[Number(row.dataset.section)]?.id||event.target.value;}});
$('#sections').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const section=sections()[Number(button.closest('[data-section]').dataset.section)];if(!section)return;
  const items=sections(),index=items.indexOf(section);
  if(button.dataset.action==='focus') {section.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(button.dataset.action==='up' && index>0) items[index-1].before(section);
  if(button.dataset.action==='down' && index<items.length-1) items[index+1].after(section);
  if(button.dataset.action==='remove') {tocLinks().filter(link=>link.getAttribute('href')===`#${section.id}`).forEach(link=>link.remove());section.remove();}
  renderOutline();changed();
});
$('#toc-items').addEventListener('input',event=>{
  const row=event.target.closest('[data-toc]');if(!row)return;
  const link=tocLinks()[Number(row.dataset.toc)];if(!link)return;
  if(event.target.dataset.field==='label') link.childNodes[0].textContent=event.target.value.trim()||'Пункт';
  if(event.target.dataset.field==='target') link.setAttribute('href',`#${event.target.value}`);
  changed();
});
$('#toc-items').addEventListener('focusin',event=>{
  if(event.target.dataset.field!=='target')return;
  const select=event.target,link=tocLinks()[Number(select.closest('[data-toc]').dataset.toc)];
  const selected=link?.getAttribute('href')?.slice(1)||'';
  select.replaceChildren(...targets().map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.label} (#${item.id})`;option.selected=item.id===selected;return option;}));
});
$('#toc-items').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const links=tocLinks(),index=Number(button.closest('[data-toc]').dataset.toc),link=links[index];if(!link)return;
  if(button.dataset.action==='up'&&index>0) links[index-1].before(link);
  if(button.dataset.action==='down'&&index<links.length-1) links[index+1].after(link);
  if(button.dataset.action==='remove') link.remove();
  renderOutline();changed();
});
$('#add-toc-item').addEventListener('click',()=>{
  const target=targets()[0];if(!target)return toast('Сначала добавьте раздел',true);
  tocNav()?.querySelector(':scope > div')?.append(createTocLink(target.label,target.id));renderOutline();changed();
});
let outlineTimer;
canvas.addEventListener('input',()=>{ensureSectionIds();clearTimeout(outlineTimer);outlineTimer=setTimeout(renderOutline,450);});
canvas.addEventListener('editor:body-replaced',()=>{clearTimeout(outlineTimer);renderOutline();});
restoreProducts([]);renderOutline();
