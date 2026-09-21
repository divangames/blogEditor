// Product shelf, article outline and editable table of contents.
let productLibrary = [];

function productsFromArticle() {
  return [...canvas.querySelectorAll('.om-product')].map(card => {
    const sku = (card.querySelector('.om-sku')?.textContent || card.id).match(/\d{3,12}/)?.[0];
    const link = card.querySelector('h3 a');
    return sku && link ? {sku, title:link.textContent.replace(/\s*→\s*$/, '').trim(), url:link.href,
      images:[...card.querySelectorAll('.om-gallery img')].map(img => img.src), features:[]} : null;
  }).filter(Boolean);
}

function restoreProducts(value) {
  productLibrary = Array.isArray(value) ? value.filter(item => item && /^\d{3,12}$/.test(item.sku) && /^https?:\/\//.test(item.url))
    .map(item=>({...item,images:Array.isArray(item.images)?item.images.filter(src=>typeof src==='string'):[],features:Array.isArray(item.features)?item.features.filter(feature=>typeof feature==='string'):[]})) : productsFromArticle();
  renderProducts();
}

function renderProducts() {
  $('#products').innerHTML = productLibrary.length ? productLibrary.map(product => `
    <div class="product-shelf-card" draggable="true" data-sku="${escapeHtml(product.sku)}" title="Перетащите в статью">
      ${product.images?.[0] ? `<img src="${escapeHtml(product.images[0])}" alt="" loading="lazy">` : '<span class="product-placeholder">OUTMAX</span>'}
      <div class="product-shelf-info"><strong>${escapeHtml(product.title)}</strong><small>Арт. ${escapeHtml(product.sku)}</small><div class="product-shelf-actions"><button type="button" data-insert="${escapeHtml(product.sku)}">Вставить</button><button type="button" data-remove="${escapeHtml(product.sku)}" aria-label="Убрать товар">×</button></div></div>
    </div>`).join('') : '<p class="help">Загруженные товары появятся здесь.</p>';
}

function insertProduct(product, point) {
  const existing = document.getElementById(`product-${product.sku}`);
  if (existing && canvas.contains(existing)) {existing.scrollIntoView({behavior:'smooth',block:'center'});return toast('Этот товар уже есть в статье');}
  if (!point) {const card=addProduct(product);updateComparisonLinks(product);renderOutline();return card;}
  const holder = document.createElement('div'); holder.innerHTML = productMarkup(product);
  const card = holder.firstElementChild;
  const target = document.elementFromPoint(point.x, point.y);
  const section = target?.closest('.om-section');
  const block = target?.closest('p,figure,article,div.om-note,div.om-table-scroll');
  if (section && canvas.contains(section)) {
    if (block && section.contains(block) && block !== section) block.after(card);
    else section.append(card);
  } else {
    const top = target?.closest('#canvas > *');
    if (top && canvas.contains(top)) top.after(card); else canvas.append(card);
  }
  card.scrollIntoView({behavior:'smooth',block:'center'});
  updateComparisonLinks(product);changed(); renderOutline();
  return card;
}
function updateComparisonLinks(product) {
  canvas.querySelectorAll('.om-table-scroll tbody a[href]').forEach(link=>{
    if(link.getAttribute('href')===product.url){link.setAttribute('href',`#product-${product.sku}`);link.removeAttribute('target');link.removeAttribute('rel');}
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
canvas.addEventListener('dragover', event => {if(Array.from(event.dataTransfer.types).includes('application/x-outmax-product')) {event.preventDefault();event.dataTransfer.dropEffect='copy';}});
canvas.addEventListener('drop', event => {
  const sku=event.dataTransfer.getData('application/x-outmax-product');
  if (!sku) return;
  event.preventDefault();
  const product=productLibrary.find(item => item.sku === sku);
  if(product) insertProduct(product,{x:event.clientX,y:event.clientY});
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
      const product=await api('/api/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})});
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
  return `<tr><td data-label="Модель"><span class="om-model-cell">${image?`<img class="om-model-thumb" src="${escapeHtml(image)}" alt="" loading="lazy">`:''}<a href="${escapeHtml(target)}"${external}>${escapeHtml(product.title)} →</a></span></td>${cells}</tr>`;
}
$('#add-table').addEventListener('click', () => {
  const products=productLibrary.length?productLibrary:productsFromArticle();
  if(!products.length) return toast('Сначала загрузите товары',true);
  const criteria=comparisonCriteria(products);
  const autoCount=criteria.length;
  while(criteria.length<3) criteria.push(`Критерий ${criteria.length+1}`);
  insertBlock(`<section class="om-section"><h2>Сравнение моделей</h2><div class="om-table-scroll" role="region" aria-label="Таблица сравнения моделей" tabindex="0"><table data-metrics="3"><thead><tr><th>Модель</th>${criteria.map(item=>`<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${products.map(product=>comparisonRow(product,criteria,autoCount)).join('')}</tbody></table></div><p class="om-hint">Свойства взяты из карточек OUTMAX. «Не указано» означает, что в карточке нет подтверждения. При необходимости измените критерии и значения вручную.</p></section>`);
  renderOutline();
});

function sections() {return [...canvas.querySelectorAll('.om-section')].filter(section=>section.querySelector(':scope > h2'));}
function uniqueAnchor(base, except) {
  let id=cleanId(base), candidate=id, index=2;
  while([...canvas.querySelectorAll('[id]')].some(node=>node!==except && node.id===candidate)) candidate=`${id}-${index++}`;
  return candidate;
}
function ensureSectionIds() {sections().forEach((section,index)=>{if(!section.id) section.id=uniqueAnchor(`section-${index+1}`,section);});}
function targets() {
  ensureSectionIds();
  return [...canvas.querySelectorAll('.om-section[id],.om-product[id]')].map(node=>({id:node.id,label:node.querySelector(':scope > h2,:scope > h3')?.textContent.replace(/\s*→\s*$/,'').trim() || node.id}));
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
  let nav=tocNav();if(!nav){nav=document.createElement('nav');nav.className='om-toc';nav.setAttribute('aria-label','Содержание статьи');const header=canvas.querySelector('header');if(header)header.after(nav);else canvas.prepend(nav);}
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
canvas.addEventListener('input',()=>{clearTimeout(outlineTimer);outlineTimer=setTimeout(renderOutline,450);});
canvas.addEventListener('editor:body-replaced',()=>{clearTimeout(outlineTimer);renderOutline();});
restoreProducts([]);renderOutline();
