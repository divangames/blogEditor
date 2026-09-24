// Editing controls for selected blocks, image framing and imported HTML.
let selectedNode = null;
let selectedTableRow = null;
const imageDialog = $('#image-dialog');
const tablePhotoDialog = $('#table-photo-dialog');

function clearSelection() {
  selectedNode?.removeAttribute('data-editor-selected');
  selectedNode = null;
  selectedTableRow = null;
  $('#selection-panel').hidden = true;
}

function movableBlock(node) {
  if (!node || !canvas.contains(node)) return null;
  const block = node.closest('.om-product,.om-table-scroll,.om-toc,.om-cta,figure,section.om-section')
    || (node.parentNode === canvas ? node : null);
  return block?.matches('header') ? null : block;
}

function selectNode(node, tableRow = null) {
  clearSelection();
  if (!node || !canvas.contains(node)) return;
  selectedNode = node;
  selectedTableRow = tableRow || node.closest('tbody tr');
  node.setAttribute('data-editor-selected', '');
  const image = node.tagName === 'IMG';
  const section = node.matches('h2, section.om-section') ? node.closest('section.om-section') : null;
  $('#selection-label').textContent = image ? 'Выбрано изображение' : `Выбрано: ${({P:'абзац',H1:'заголовок H1',H2:'заголовок H2',H3:'заголовок H3',FIGURE:'изображение с подписью',SECTION:'раздел',ARTICLE:'карточка товара',HR:'линия',LI:'пункт списка',TABLE:'таблица'}[node.tagName] || 'блок')}`;
  $('#edit-image').hidden = !image;
  $('#change-table-photo').hidden = !selectedTableRow?.querySelector('td:first-child a[href]');
  $('#drag-selected').hidden = !movableBlock(node);
  $('#toggle-line').hidden = !section;
  if (section) $('#toggle-line').textContent = section.classList.contains('om-no-divider') ? 'Показать линию' : 'Убрать линию';
  $('#delete-selected').disabled = node.matches('h1');
  $('#selection-panel').hidden = false;
}

$('#drag-selected').addEventListener('dragstart', event => {
  draggedBlock = movableBlock(selectedNode);
  if (!draggedBlock) return event.preventDefault();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-outmax-block', 'move');
});
$('#drag-selected').addEventListener('dragend', () => {
  draggedBlock = null;
  if (insertionLocked) showInsertionMarker(insertionBefore, true);
  else $('#insertion-marker').hidden = true;
});

function focusNewParagraph(paragraph) {
  clearSelection();
  canvas.focus();
  const range = document.createRange();
  range.setStart(paragraph, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  lastRange = range.cloneRange();
  paragraph.scrollIntoView({block:'nearest'});
  changed();
}

function insertTextBeside(node, side) {
  if (!node || !canvas.contains(node)) return;
  const headingGroup = node.matches('h1,h2') ? node.closest('header,section.om-section') : null;
  const anchor = node.closest('.om-product,.om-table-scroll,.om-toc,.om-note,.om-cta,figure,ul,ol')
    || (side === 'before' && headingGroup ? headingGroup : node);
  const paragraph = document.createElement('p');
  paragraph.append(document.createElement('br'));
  if (side === 'before') anchor.before(paragraph); else anchor.after(paragraph);
  focusNewParagraph(paragraph);
}

function insertTextInGap(container, y) {
  const paragraph = document.createElement('p');
  paragraph.append(document.createElement('br'));
  const after = [...container.children].find(child => y < child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2);
  if (after) after.before(paragraph); else container.append(paragraph);
  focusNewParagraph(paragraph);
}

$('#insert-text-before').addEventListener('click', () => insertTextBeside(selectedNode, 'before'));
$('#insert-text-after').addEventListener('click', () => insertTextBeside(selectedNode, 'after'));
canvas.addEventListener('click', event => {
  if (event.target === canvas || event.target.matches('section.om-section,header')) {
    insertTextInGap(event.target, event.clientY);
    event.stopImmediatePropagation();
  }
});

canvas.addEventListener('click', event => {
  const target = event.target;
  const node = target.closest('img,hr,h1,h2,h3,p,li,figure,.om-product,.om-table-scroll,.om-note,.om-toc,.om-cta,section');
  selectNode(node && canvas.contains(node) ? node : null, target.closest('tbody tr'));
  if (target.matches('tbody td:first-child img')) openTablePhotoPicker();
});
canvas.addEventListener('editor:body-replaced', clearSelection);

function removeSelected() {
  if (!selectedNode || !canvas.contains(selectedNode)) return;
  if (selectedNode.matches('h1')) return toast('В статье нужен один H1. Измените его текст.', true);
  let node = selectedNode;
  if (node.tagName === 'IMG') {
    const figure = node.closest('figure');
    const galleryLink = node.closest('.om-gallery > a');
    if (figure) node = figure;
    else if (galleryLink) node = galleryLink;
  }
  node.remove();
  clearSelection();
  changed();
  toast('Элемент удалён');
}

$('#delete-selected').addEventListener('click', removeSelected);
$('#toggle-line').addEventListener('click', () => {
  const section = selectedNode?.closest('section.om-section');
  if (!section) return;
  section.classList.toggle('om-no-divider');
  $('#toggle-line').textContent = section.classList.contains('om-no-divider') ? 'Показать линию' : 'Убрать линию';
  changed();
});

function openImageEditor() {
  if (!selectedNode || selectedNode.tagName !== 'IMG') return;
  const img = selectedNode;
  $('#image-preview').src = img.src;
  $('#image-alt').value = img.alt || '';
  $('#image-width').value = parseInt(img.style.width, 10) || 100;
  $('#image-ratio').value = ['1 / 1','4 / 3','16 / 9','3 / 4'].includes(img.style.aspectRatio) ? img.style.aspectRatio : 'auto';
  const [x, y] = (img.style.objectPosition || '50% 50%').split(/\s+/);
  $('#image-x').value = parseInt(x, 10) || 0;
  $('#image-y').value = parseInt(y, 10) || 0;
  if (!img.style.objectPosition) {$('#image-x').value = 50; $('#image-y').value = 50;}
  $('#image-align').value = img.style.marginLeft === 'auto' && img.style.marginRight !== 'auto' ? 'right' : img.style.marginRight === 'auto' && img.style.marginLeft !== 'auto' ? 'left' : 'center';
  $('#image-width-value').value = `${$('#image-width').value}%`;
  $('#image-x-value').value = `${$('#image-x').value}%`;
  $('#image-y-value').value = `${$('#image-y').value}%`;
  imageDialog.showModal();
}

$('#edit-image').addEventListener('click', openImageEditor);
canvas.addEventListener('dblclick', event => {
  if (!event.target.matches('img')) return;
  selectNode(event.target, event.target.closest('tbody tr'));
  if (selectedTableRow) openTablePhotoPicker(); else openImageEditor();
});

function tablePhotoContext(row) {
  const link = row?.querySelector('td:first-child a[href]');
  if (!link) return null;
  const sku = row.dataset.sku || link.getAttribute('href').match(/(?:product-|[-/])(\d{3,12})(?:[/?#]|$)/)?.[1];
  const product = productLibrary.find(item => item.sku === sku);
  const card = sku ? canvas.querySelector(`[id="product-${CSS.escape(sku)}"]`) : null;
  const current = row.querySelector('td:first-child img')?.getAttribute('src') || '';
  const photos = [...new Set([
    ...[...(card?.querySelectorAll('.om-gallery img') || [])].map(img => img.getAttribute('src')),
    ...(product?.images || []), current
  ].filter(src => src && safeAddress(src, true)))];
  return {link, sku, product, photos, current};
}

function renderTablePhotoOptions(photos, current) {
  $('#table-photo-options').innerHTML = photos.length
    ? photos.map((src, index) => `<button type="button" data-photo-src="${escapeHtml(src)}" class="${src === current ? 'active' : ''}" aria-label="Выбрать фото ${index + 1}"><img src="${escapeHtml(src)}" alt="Фото товара ${index + 1}" loading="lazy"><span>Фото ${index + 1}${src === current ? ' · выбрано' : ''}</span></button>`).join('')
    : '<p class="help">Фотографии товара не найдены. Вставьте прямую ссылку на фото ниже.</p>';
}

async function openTablePhotoPicker() {
  const row = selectedTableRow;
  if (!row || !canvas.contains(row)) return;
  const context = tablePhotoContext(row);
  if (!context) return;
  $('#table-photo-name').textContent = context.link.textContent.trim();
  $('#table-photo-url').value = '';
  renderTablePhotoOptions(context.photos, context.current);
  if (!tablePhotoDialog.open) tablePhotoDialog.showModal();
  if (context.photos.length > 1) return;
  const url = context.product?.url || context.link.href;
  if (!/^https:\/\/(?:www\.)?outmaxshop\.(?:ru|com)\//i.test(url)) return;
  try {
    const product = await api('/api/fetch', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:url})});
    if (tablePhotoDialog.open && selectedTableRow === row) {
      renderTablePhotoOptions([...new Set([...context.photos, ...product.images])], context.current);
    }
  } catch { /* The current photo and manual URL remain available. */ }
}

function applyTablePhoto(src) {
  const row = selectedTableRow;
  const context = tablePhotoContext(row);
  if (!context || !/^https:\/\//i.test(src) && !src.startsWith('/articles/')) return toast('Укажите прямую HTTPS-ссылку на фото', true);
  let img = row.querySelector('td:first-child img');
  if (!img) {
    img = document.createElement('img');
    const wrapper = context.link.closest('.om-model-cell');
    if (wrapper) wrapper.prepend(img);
    else {
      const span = document.createElement('span');
      span.className = 'om-model-cell';
      context.link.replaceWith(span);
      span.append(img, context.link);
    }
  }
  img.classList.add('om-model-thumb');
  img.src = src;
  img.alt = `${context.link.textContent.replace(/\s*→\s*$/, '').trim()}, фото товара`;
  img.loading = 'lazy';
  img.decoding = 'async';
  tablePhotoDialog.close();
  changed();
  toast('Фото в таблице обновлено');
}

$('#change-table-photo').addEventListener('click', openTablePhotoPicker);
$('#table-photo-options').addEventListener('click', event => {
  const button = event.target.closest('[data-photo-src]');
  if (button) applyTablePhoto(button.dataset.photoSrc);
});
$('#table-photo-apply').addEventListener('click', () => applyTablePhoto($('#table-photo-url').value.trim()));
$('#table-photo-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') {event.preventDefault();applyTablePhoto(event.target.value.trim());}
});
$('#table-photo-close').addEventListener('click', () => tablePhotoDialog.close());
$('#table-photo-done').addEventListener('click', () => tablePhotoDialog.close());

function updateImage() {
  if (!selectedNode || selectedNode.tagName !== 'IMG' || !canvas.contains(selectedNode)) return;
  const img = selectedNode;
  const width = $('#image-width').value;
  const ratio = $('#image-ratio').value;
  img.alt = $('#image-alt').value;
  img.style.width = `${width}%`;
  img.style.aspectRatio = ratio;
  img.style.objectFit = ratio === 'auto' ? 'contain' : 'cover';
  img.style.objectPosition = `${$('#image-x').value}% ${$('#image-y').value}%`;
  img.style.display = 'block';
  img.style.marginLeft = $('#image-align').value === 'left' ? '0' : 'auto';
  img.style.marginRight = $('#image-align').value === 'right' ? '0' : 'auto';
  $('#image-width-value').value = `${width}%`;
  $('#image-x-value').value = `${$('#image-x').value}%`;
  $('#image-y-value').value = `${$('#image-y').value}%`;
  $('#image-preview').style.width = `${width}%`;
  $('#image-preview').style.aspectRatio = ratio;
  $('#image-preview').style.objectFit = ratio === 'auto' ? 'contain' : 'cover';
  $('#image-preview').style.objectPosition = img.style.objectPosition;
  changed();
}
document.querySelectorAll('#image-dialog input:not([type=file]), #image-dialog select').forEach(control => control.addEventListener('input', updateImage));
$('#image-close').addEventListener('click', () => imageDialog.close());
$('#image-done').addEventListener('click', () => imageDialog.close());
$('#remove-image').addEventListener('click', () => {imageDialog.close(); removeSelected();});
$('#replace-image').addEventListener('click', () => $('#replace-image-file').click());
$('#replace-image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file || !selectedNode || selectedNode.tagName !== 'IMG') return;
  try {
    lockId();
    const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':file.type},body:file});
    selectedNode.src = assetUrl(result.src);
    $('#image-preview').src = selectedNode.src;
    changed();
    toast('Изображение заменено');
  } catch(error) {toast(error.message, true);}
  event.target.value = '';
});

const allowedTags = new Set('article header section nav div span p h1 h2 h3 h4 a img ul ol li strong em b i u s blockquote table thead tbody tfoot tr th td figure figcaption br hr code pre iframe video source'.split(' '));
const dropTags = new Set('script style link meta object embed form input button textarea select noscript svg canvas audio'.split(' '));

function safeVideoEmbed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|rutube\.ru|vkvideo\.ru|vk\.com|vimeo\.com|player\.vimeo\.com)$/.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}

function safeAddress(value, image = false) {
  let url = String(value || '').trim();
  if (!url || /[\u0000-\u001f]/.test(url)) return '';
  if (/^file:/i.test(url) && !image && url.includes('#')) return '#' + url.split('#').pop();
  if (url.startsWith('//')) url = 'https:' + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!image && url.startsWith('#')) return url;
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes(':')) return url;
  if (/^(?:\.\.?\/)?[^/:]+(?:\/[^:]*)?$/i.test(url) && !url.startsWith('//')) return url;
  return '';
}

function cleanImported(node, outputDoc) {
  if (node.nodeType === Node.TEXT_NODE) return outputDoc.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (dropTags.has(tag)) return null;
  const clean = allowedTags.has(tag) ? outputDoc.createElement(tag) : outputDoc.createDocumentFragment();
  if (clean.nodeType === Node.ELEMENT_NODE) {
    const classes = [...node.classList].filter(value => /^om-[a-z0-9-]+$/i.test(value));
    if (classes.length) clean.className = classes.join(' ');
    if (node.id && /^[\w-]{1,100}$/.test(node.id)) clean.id = node.id;
    for (const attr of ['alt','title','role','aria-label','data-label','data-metrics','data-sku','data-product-gallery','colspan','rowspan']) {
      if (node.hasAttribute(attr)) clean.setAttribute(attr, node.getAttribute(attr).slice(0, 300));
    }
    if (tag === 'a') {
      const href = safeAddress(node.getAttribute('href'));
      if (href) clean.setAttribute('href', href);
    }
    if (tag === 'img') {
      const src = safeAddress(node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-original'), true);
      if (!src) return null;
      clean.setAttribute('src', src);
      clean.setAttribute('loading', 'lazy');
      clean.setAttribute('decoding', 'async');
      for (const property of ['width','aspectRatio','objectFit','objectPosition','marginLeft','marginRight']) {
        const value = node.style[property];
        if (value && /^[0-9.% /a-z-]+$/i.test(value)) clean.style[property] = value;
      }
    }
    if (tag === 'iframe') {
      const src = safeVideoEmbed(node.getAttribute('src'));
      if (!src) return null;
      clean.src = src;
      clean.title = node.getAttribute('title') || 'Видео статьи';
      clean.loading = 'lazy';
      clean.setAttribute('allowfullscreen', '');
      clean.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; picture-in-picture');
    }
    if (tag === 'video' || tag === 'source') {
      const src = safeAddress(node.getAttribute('src'));
      if (src && /^https:\/\//i.test(src)) clean.src = src;
      if (tag === 'video') {
        clean.controls = true;
        clean.preload = 'none';
        const poster = safeAddress(node.getAttribute('poster'), true);
        if (poster && /^https:\/\//i.test(poster)) clean.poster = poster;
      }
      if (tag === 'source' && node.getAttribute('type')?.startsWith('video/')) clean.type = node.getAttribute('type');
    }
  }
  for (const child of node.childNodes) {
    const safe = cleanImported(child, outputDoc);
    if (safe) clean.append(safe);
  }
  return clean;
}

function articleFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const sourceArticle = parsed.querySelector('article.om-guide') || parsed.querySelector('article') || parsed.querySelector('.article-content,.entry-content') || parsed.querySelector('main') || parsed.body;
  const temp = document.implementation.createHTMLDocument('import');
  temp.body.append(cleanImported(sourceArticle, temp));
  const chosen = temp.body.querySelector('article,main') || temp.body;
  return {body: chosen.innerHTML, title: parsed.title || sourceArticle.querySelector('h1')?.textContent?.trim() || 'Статья OUTMAX'};
}

/** Превращает отдельные призывы «Смотреть…» и похожие ссылки в CTA-кнопки. */
function promoteCallToActionLinks(root) {
  for (const link of [...root.querySelectorAll('a[href]')]) {
    const text = link.textContent.trim();
    const parent = link.parentElement;
    const excluded = link.closest('nav,h1,h2,h3,h4,.om-actions,.om-cta');
    const paragraph = parent?.tagName === 'P' && parent.textContent.trim() === text && parent.querySelectorAll(':scope > a').length === 1;
    const standalone = parent && link.parentElement === parent && parent.querySelectorAll(':scope > a').length === 1
      && parent.matches('section,article,div') && /^\s*$/.test([...parent.childNodes].filter(node => node !== link && node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''));
    if (excluded || !(paragraph || standalone) || !/^(?:смотреть|перейти|купить|выбрать|открыть)(?:\s|$)/i.test(text)) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'om-cta';
    link.classList.add('om-button');
    if (![...link.classList].some(value => /^om-button--/.test(value))) link.classList.add('om-button--red');
    if (paragraph) parent.replaceWith(wrapper);
    else link.replaceWith(wrapper);
    wrapper.append(link);
  }
}

$('#open-article').addEventListener('click', () => $('#article-file').click());
$('#open-article-folder').addEventListener('click', () => $('#article-folder').click());

async function readArticleText(file) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buffer);
  if (/charset\s*=\s*["']?(?:windows-1251|cp1251)/i.test(text.slice(0, 1500))) text = new TextDecoder('windows-1251').decode(buffer);
  return text;
}

async function attachFolderImages(html, page, files) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const pagePath = (page.webkitRelativePath || page.name).replace(/\\/g, '/');
  const byPath = new Map(files.map(file => [(file.webkitRelativePath || file.name).replace(/\\/g, '/').toLowerCase(), file]));
  const uploaded = new Map();
  let count = 0;
  for (const image of parsed.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src').trim();
    if (!source || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(source)) continue;
    let resolved;
    try {resolved = decodeURIComponent(new URL(source, `https://folder.local/${pagePath}`).pathname.slice(1)).toLowerCase();}
    catch {continue;}
    const file = byPath.get(resolved);
    if (!file || !/\.(?:jpe?g|png|webp|gif)$/i.test(file.name)) continue;
    let stored = uploaded.get(resolved);
    if (!stored) {
      const extension = file.name.split('.').pop().toLowerCase();
      const mime = file.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}[extension]);
      const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':mime},body:file});
      stored = result.src;
      uploaded.set(resolved, stored);
      count += 1;
    }
    image.setAttribute('src', stored);
    image.removeAttribute('srcset');
  }
  return {html: parsed.documentElement.outerHTML, images: count};
}

async function openArticleSelection(fileList, folderMode = false) {
  const files = [...fileList];
  let file = files[0];
  if (folderMode) {
    const pages = files.filter(item => /\.html?$/i.test(item.name));
    file = pages.sort((left, right) => {
      const a = left.webkitRelativePath || left.name;
      const b = right.webkitRelativePath || right.name;
      return a.split('/').length - b.split('/').length || a.length - b.length;
    })[0];
    if (!file) return toast('В выбранной папке нет HTML-статьи', true);
  }
  try {
    if ($('#status').textContent.includes('несохранённые')) {
      const backupId = `${currentId}-backup-${Date.now()}`;
      await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:backupId,title:`Резервная копия: ${$('#page-title').value}`,body:encodedBody(),products:productLibrary})});
      await listDrafts();
    }
    let data;
    let bundle = null;
    let folderImages = 0;
    if (file.name.toLowerCase().endsWith('.zip')) {
      bundle = await api('/api/import-bundle', {method:'POST',headers:{'Content-Type':'application/zip'},body:file});
      data = articleFromHtml(bundle.html);
      data.title = bundle.title || data.title;
      data.products = bundle.products;
    } else {
      let text = await readArticleText(file);
      if (file.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(text);
        if (typeof json.body !== 'string') throw new Error('В JSON нет содержимого статьи');
        data = {body: json.body, title: json.title || 'Статья OUTMAX', products:json.products};
      } else {
        currentId = cleanId(file.name.replace(/\.[^.]+$/, ''));
        if (folderMode) {
          const attached = await attachFolderImages(text, file, files);
          text = attached.html;
          folderImages = attached.images;
        }
        data = articleFromHtml(text);
      }
    }
    currentId = bundle?.id || cleanId(file.name.replace(/\.[^.]+$/, ''));
    lockedId = !!bundle?.images || folderImages > 0;
    $('#filename').disabled = lockedId;
    $('#filename').value = currentId;
    $('#page-title').value = data.title;
    setBody(data.body);
    const needsAdaptation = !canvas.querySelector('.om-section,.om-product,.om-toc');
    if (needsAdaptation) adaptArticle();
    restoreProducts(data.products);
    setTab('editor');
    const relative = [...canvas.querySelectorAll('img[src]')].filter(img => !/^(?:https?:|blob:|\/articles\/)/i.test(img.getAttribute('src')));
    const importedImages = bundle?.images || folderImages;
    toast(relative.length ? `Статья открыта. Не найдено локальных изображений: ${relative.length}.` : `Статья открыта${importedImages ? `, импортировано фото: ${importedImages}` : ''}`);
  } catch(error) {toast(error.message, true);}
}

$('#article-file').addEventListener('change', async event => {
  await openArticleSelection(event.target.files);
  event.target.value = '';
});
$('#article-folder').addEventListener('change', async event => {
  await openArticleSelection(event.target.files, true);
  event.target.value = '';
});

function adaptArticle() {
  const working = document.createElement('div');
  working.innerHTML = encodedBody();
  for (const nav of working.querySelectorAll('nav')) nav.classList.add('om-toc');
  for (const card of working.querySelectorAll('article[id^="product-"]')) {
    card.classList.add('om-product');
    const direct = [...card.children];
    const sku = direct.find(node => /^Арт\.\s*\d{3,12}$/i.test(node.textContent.trim()));
    if (sku) sku.classList.add('om-sku');
    const gallery = card.querySelector('[data-product-gallery],.om-gallery');
    if (gallery) gallery.classList.add('om-gallery');
    const ratings = [...card.querySelectorAll('ul')].find(list => /оцен/i.test(list.getAttribute('aria-label') || ''));
    if (ratings) ratings.classList.add('om-ratings');
    const actions = direct.find(node => node.tagName === 'DIV' && node.querySelector(':scope > a')
      && [...node.querySelectorAll(':scope > a')].every(link => /^смотреть(?:\s|$)/i.test(link.textContent.trim())));
    if (actions) actions.classList.add('om-actions');
  }
  working.querySelectorAll('hr').forEach(line => line.remove());
  working.querySelectorAll('script,style,form').forEach(node => node.remove());
  for (const node of working.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) if (attr.name.startsWith('on')) node.removeAttribute(attr.name);
    if (node.tagName !== 'IMG') node.removeAttribute('style');
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^file:/i.test(href) && href.includes('#')) node.setAttribute('href', '#' + href.split('#').pop());
      if (/^https?:\/\//i.test(href)) {node.target = '_blank';node.rel = 'noopener noreferrer';}
    }
  }
  let wrappers = true;
  while (wrappers) {
    wrappers = false;
    const structuralWrappers = [...working.children].filter(node =>
      node.matches('main,.om-guide') || (node.tagName === 'DIV' && !node.className));
    for (const wrapper of structuralWrappers) {
      if (wrapper.querySelector('h1,h2,section')) {wrapper.replaceWith(...wrapper.childNodes);wrappers = true;}
    }
  }
  const result = document.createElement('div');
  const existingHeader = working.querySelector(':scope > header');
  const header = existingHeader || document.createElement('header');
  const h1 = working.querySelector('h1');
  if (h1 && !header.contains(h1)) header.prepend(h1);
  if (!h1) {const heading=document.createElement('h1');heading.textContent=$('#page-title').value.replace(/\s*[—-]\s*OUTMAX$/,'') || 'Заголовок статьи';header.prepend(heading);}
  if (!existingHeader) {
    const lead = working.querySelector(':scope > p');
    if (lead) header.append(lead);
  }
  result.append(header);
  let currentSection = null;
  for (const node of [...working.childNodes]) {
    if (node === header || node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'H2') {
      currentSection = document.createElement('section');
      currentSection.className = 'om-section';
      currentSection.append(node);
      result.append(currentSection);
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.matches('section,article.om-product,nav.om-toc')) {
      if (node.matches('section')) node.classList.add('om-section');
      result.append(node);
      currentSection = null;
      continue;
    }
    if (!currentSection) {currentSection=document.createElement('section');currentSection.className='om-section';result.append(currentSection);}
    currentSection.append(node);
  }
  for (const extra of [...result.querySelectorAll('h1')].slice(1)) {
    const heading = document.createElement('h2');
    heading.innerHTML = extra.innerHTML;
    extra.replaceWith(heading);
  }
  for (const image of result.querySelectorAll('img')) {
    const source = image.getAttribute('src') || '';
    const productFile = source.match(/(?:^|\/)\b([a-z0-9-]+-(\d{3,12})-\d+\.(?:jpe?g|png|webp))$/i);
    if (source.includes('OUTMAX_files/') && productFile) {
      image.src = `https://${OUTMAX_SITES[$('#product-site').value]}/components/com_jshopping/files/img_products/${productFile[2]}/${productFile[1]}`;
    }
    if (!image.hasAttribute('alt')) image.alt = 'Описание изображения';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (image.parentElement?.tagName === 'P' && !image.parentElement.textContent.trim()) {
      const figure = document.createElement('figure');
      image.parentElement.replaceWith(figure);
      figure.append(image);
    }
  }
  for (const quote of result.querySelectorAll('blockquote')) {
    const note = document.createElement('div');note.className='om-note';note.innerHTML=quote.innerHTML;quote.replaceWith(note);
  }
  for (const table of result.querySelectorAll('table')) {
    const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const count = Math.max(0, headings.length - 1);
    table.setAttribute('data-metrics', count === 4 ? '4' : '3');
    for (const row of table.querySelectorAll('tbody tr')) [...row.children].forEach((cell, index) => cell.setAttribute('data-label', headings[index] || `Показатель ${index}`));
    if (!table.closest('.om-table-scroll')) {
      const wrap = document.createElement('div');wrap.className='om-table-scroll';wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица сравнения');wrap.tabIndex=0;table.replaceWith(wrap);wrap.append(table);
    }
  }
  for (const section of result.querySelectorAll('section.om-section')) {
    const heading = section.querySelector(':scope > h2');
    if (heading && !section.id) section.id = `section-${[...result.querySelectorAll('section.om-section')].indexOf(section)+1}`;
  }
  const sections = [...result.querySelectorAll('section.om-section')].filter(section => section.querySelector(':scope > h2'));
  result.querySelectorAll(':scope > nav.om-toc').forEach(nav => nav.remove());
  if (sections.length) {
    const nav = document.createElement('nav');nav.className='om-toc';nav.setAttribute('aria-label','Содержание статьи');
    nav.innerHTML = `<h2>В этой статье</h2><div>${sections.map(section => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.querySelector(':scope > h2').textContent.trim())}<span>↓</span></a>`).join('')}</div>`;
    header.after(nav);
  }
  promoteCallToActionLinks(result);
  setBody(result.innerHTML);
  setTab('editor');
  toast('Структура и оформление адаптированы под OUTMAX. Проверьте текст, ссылки и изображения.');
}

$('#adapt-article').addEventListener('click', () => {
  try {adaptArticle();} catch(error) {toast(error.message, true);}
});

async function adaptArticleFromUrl() {
  const input = $('#article-url');
  const url = normalizeOutmaxUrl(input.value);
  if (!isOutmaxArticleUrl(url)) {
    return toast('Вставьте ссылку на отдельную статью OUTMAX', true);
  }
  input.value = url;
  const sourceSite = outmaxSiteKey(url);
  $('#product-site').value = sourceSite;
  const exportSite = document.querySelector(`[name="export-site"][value="${sourceSite}"]`);
  if (exportSite) exportSite.checked = true;
  const button = $('#adapt-article-url');
  button.disabled = true;
  button.textContent = 'Загружаем статью…';
  try {
    const data = await api('/api/fetch-article', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const imported = articleFromHtml(data.html);
    if (!imported.body.trim()) throw new Error('На странице не найдено содержимое статьи');
    if ($('#status').textContent.includes('несохранённые')) {
      const backupId = `${currentId}-backup-${Date.now()}`;
      await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:backupId,title:`Резервная копия: ${$('#page-title').value}`,body:encodedBody(),products:productLibrary})});
    }
    currentId = cleanId(`${data.id}-adapted`);
    lockedId = false;
    $('#filename').disabled = false;
    $('#filename').value = currentId;
    $('#page-title').value = data.title;
    setBody(imported.body);
    adaptArticle();
    restoreProducts();
    await listDrafts();
    toast(`Статья адаптирована: ${canvas.querySelectorAll('.om-section').length} разделов, ${canvas.querySelectorAll('img').length} фото. Медиа остаются на источнике.`);
  } catch(error) {toast(error.message, true);}
  finally {button.disabled = false;button.innerHTML = '✦ Адаптировать статью по ссылке <span>↗</span>';}
}

$('#adapt-article-url').addEventListener('click', adaptArticleFromUrl);
$('#article-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') {event.preventDefault();adaptArticleFromUrl();}
});
