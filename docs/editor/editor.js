const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const source = $('#source');
const preview = $('#preview');
let currentId = 'novaya-statya';
let lockedId = false;
let lastRange = null;
let updateTimer = null;
let toastTimer = null;
let insertionLocked = false;
let insertionBefore = null;
let hoverBefore = null;
let displayedBefore = null;
let draggedBlock = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanId = value => String(value || '').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0,70) || 'statya';
const assetUrl = src => window.onlineAssetUrl ? window.onlineAssetUrl(src) : `/articles/${src}`;

function toast(message, error = false) {
  const box = $('#toast');
  box.textContent = message;
  box.className = (error ? 'error ' : '') + 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.className = '', 4200);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

function encodedBody() {
  const copy = canvas.cloneNode(true);
  copy.querySelectorAll('[data-editor-selected]').forEach(element => element.removeAttribute('data-editor-selected'));
  copy.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (src.startsWith('/articles/')) image.setAttribute('src', src.slice('/articles/'.length));
    else if (window.onlineStoredSrc) image.setAttribute('src', window.onlineStoredSrc(src));
    image.removeAttribute('contenteditable');
  });
  return copy.innerHTML;
}

const adminCssVariables = {
  '--om-ink':'#231815', '--om-muted':'#7a7a7a', '--om-line':'#e5e5e5',
  '--om-pale':'#f7f6f6', '--om-red':'#e31e24',
};

function resolvedAdminStyle(value) {
  return String(value).replace(/var\((--om-[a-z-]+)\)/g, (_, name) => adminCssVariables[name] || 'inherit');
}

/** Создаёт код для админки OUTMAX, не зависящий от классов и внешнего CSS. */
function adminBody() {
  const copy = canvas.cloneNode(true);
  const originals = [...canvas.querySelectorAll('*')];
  const clones = [...copy.querySelectorAll('*')];
  const originalStyles = originals.map(element => element.getAttribute('style') || '');
  const wrapper = document.createElement('div');
  wrapper.append(copy);
  for (const sheet of [...document.styleSheets]) {
    if (!sheet.href?.endsWith('/outmax.css')) continue;
    for (const rule of [...sheet.cssRules]) {
      if (!(rule instanceof CSSStyleRule) || /:(?:hover|focus|focus-visible|active)|::/.test(rule.selectorText)) continue;
      const inlineRule = document.createElement('span').style;
      inlineRule.cssText = resolvedAdminStyle(rule.style.cssText);
      for (const selector of rule.selectorText.split(',')) {
        let matches;
        try {matches = wrapper.querySelectorAll(selector.trim());} catch {continue;}
        for (const element of matches) {
          for (const property of inlineRule) element.style.setProperty(property, inlineRule.getPropertyValue(property), inlineRule.getPropertyPriority(property));
        }
      }
    }
  }
  for (let index = 0; index < clones.length; index += 1) {
    const clone = clones[index];
    if (originalStyles[index]) {
      const originalStyle = document.createElement('span').style;
      originalStyle.cssText = originalStyles[index];
      for (const property of originalStyle) clone.style.setProperty(property, originalStyle.getPropertyValue(property), originalStyle.getPropertyPriority(property));
    }
    if (!clone.style.boxSizing) clone.style.boxSizing = 'border-box';
    for (const attribute of [...clone.attributes]) {
      if (attribute.name === 'loading' || attribute.name === 'decoding' || attribute.name === 'role' || attribute.name === 'tabindex' || attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) clone.removeAttribute(attribute.name);
    }
    clone.removeAttribute('contenteditable');
  }
  copy.querySelectorAll('[data-editor-selected]').forEach(element => element.removeAttribute('data-editor-selected'));
  copy.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (src.startsWith('/articles/')) image.setAttribute('src', src.slice('/articles/'.length));
    else if (window.onlineStoredSrc) image.setAttribute('src', window.onlineStoredSrc(src));
  });
  return copy.innerHTML;
}

function setBody(body) {
  canvas.innerHTML = body;
  clearInsertionPoint();
  canvas.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (/^[^/:]+_files\//.test(src)) image.setAttribute('src', assetUrl(src));
  });
  canvas.dispatchEvent(new Event('editor:body-replaced'));
  refreshPreview();
}

function previewDocument() {
  const previewBody = encodedBody().replace(/(src=")([^"/:]+_files\/[^" ]+)/g, (_, prefix, path) => prefix + assetUrl(path));
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${new URL('outmax.css', location.href).href}"><style>body{margin:0;background:#fff}</style></head><body><article class="om-guide">${previewBody}</article><script>document.addEventListener('click',function(event){const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({behavior:'smooth'});}});<\/script></body></html>`;
}

function refreshPreview() {
  preview.srcdoc = previewDocument();
  if ($('#html-view').classList.contains('active') && document.activeElement !== source) source.value = adminBody();
  $('#status').textContent = 'Есть несохранённые изменения';
}

function changed() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(refreshPreview, 280);
}

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (selection.rangeCount && canvas.contains(selection.anchorNode)) lastRange = selection.getRangeAt(0).cloneRange();
});

function rootBeforeAtY(y, excluded = null) {
  return [...canvas.children].filter(child => child !== excluded && child.tagName !== 'HEADER')
    .find(child => y < child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2) || null;
}

function showInsertionMarker(before, locked = false) {
  const marker = $('#insertion-marker');
  const shell = $('.canvas-shell');
  displayedBefore = before;
  const last = canvas.lastElementChild;
  const y = before?.getBoundingClientRect().top ?? (last?.getBoundingClientRect().bottom ?? canvas.getBoundingClientRect().top + 24) + 12;
  marker.style.top = `${y - shell.getBoundingClientRect().top}px`;
  marker.classList.toggle('locked', locked);
  marker.hidden = false;
}

function clearInsertionPoint() {
  insertionLocked = false;
  insertionBefore = null;
  hoverBefore = null;
  displayedBefore = null;
  $('#insertion-marker').hidden = true;
}

function insertBlockAt(markup, before) {
  const holder = document.createElement('div');
  if (typeof markup === 'string') holder.innerHTML = markup;
  const block = typeof markup === 'string' ? holder.firstElementChild : markup;
  if (before?.parentNode === canvas) before.before(block); else canvas.append(block);
  insertionBefore = block.nextElementSibling;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true);
  block.scrollIntoView({behavior:'smooth', block:'center'});
  changed();
  return block;
}

function insertBlock(markup) {
  if (insertionLocked && (!insertionBefore || insertionBefore.parentNode === canvas)) {
    return insertBlockAt(markup, insertionBefore);
  }
  let target = lastRange?.startContainer;
  while (target && target.parentNode !== canvas) target = target.parentNode;
  return insertBlockAt(markup, target?.parentNode === canvas ? target.nextElementSibling : null);
}

canvas.addEventListener('mousemove', event => {
  if (draggedBlock) return;
  hoverBefore = rootBeforeAtY(event.clientY);
  showInsertionMarker(hoverBefore);
});
canvas.addEventListener('mouseleave', event => {
  if ($('#insertion-marker').contains(event.relatedTarget)) return;
  if (insertionLocked) showInsertionMarker(insertionBefore, true);
  else $('#insertion-marker').hidden = true;
});
canvas.addEventListener('scroll', () => {
  if (insertionLocked) showInsertionMarker(insertionBefore, true);
  else $('#insertion-marker').hidden = true;
});
canvas.addEventListener('pointerdown', () => {
  if (insertionLocked) clearInsertionPoint();
});
$('#choose-insertion').addEventListener('click', () => {
  insertionBefore = displayedBefore;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true);
  toast('Место вставки выбрано. Добавьте блок слева.');
});
const draggableTools = new Set(['add-section', 'add-toc', 'add-button', 'add-note', 'add-table']);
draggableTools.forEach(id => $('#'+id).addEventListener('dragstart', event => {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-outmax-tool', id);
}));
draggableTools.forEach(id => $('#'+id).addEventListener('dragend', () => {
  if (!insertionLocked) $('#insertion-marker').hidden = true;
}));
function activateToolAt(id, before) {
  if (!draggableTools.has(id)) return;
  insertionBefore = before;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true);
  $('#'+id).click();
}
canvas.addEventListener('dragover', event => {
  const types = Array.from(event.dataTransfer.types);
  if (!types.includes('application/x-outmax-block') && !types.includes('application/x-outmax-product') && !types.includes('application/x-outmax-tool')) return;
  event.preventDefault();
  hoverBefore = rootBeforeAtY(event.clientY, draggedBlock);
  showInsertionMarker(hoverBefore);
  event.dataTransfer.dropEffect = draggedBlock ? 'move' : 'copy';
});
function moveDraggedBlockTo(before) {
  if (before) before.before(draggedBlock); else canvas.append(draggedBlock);
  insertionBefore = draggedBlock.nextElementSibling;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true);
  draggedBlock = null;
  canvas.dispatchEvent(new Event('input', {bubbles:true}));
  toast('Блок перемещён');
}
canvas.addEventListener('drop', event => {
  if (event.dataTransfer.getData('application/x-outmax-block') && draggedBlock) {
    event.preventDefault();
    event.stopImmediatePropagation();
    moveDraggedBlockTo(rootBeforeAtY(event.clientY, draggedBlock));
    return;
  }
  const tool = event.dataTransfer.getData('application/x-outmax-tool');
  if (draggableTools.has(tool)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    activateToolAt(tool, rootBeforeAtY(event.clientY));
  }
});
$('#choose-insertion').addEventListener('dragover', event => {
  const types = Array.from(event.dataTransfer.types);
  if (!types.includes('application/x-outmax-block') && !types.includes('application/x-outmax-product') && !types.includes('application/x-outmax-tool')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = draggedBlock ? 'move' : 'copy';
});
$('#choose-insertion').addEventListener('drop', event => {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer.getData('application/x-outmax-block') && draggedBlock) {
    moveDraggedBlockTo(displayedBefore);
    return;
  }
  const sku = event.dataTransfer.getData('application/x-outmax-product');
  const product = sku && productLibrary.find(item => item.sku === sku);
  if (product) insertProduct(product, {before:displayedBefore});
  const tool = event.dataTransfer.getData('application/x-outmax-tool');
  if (draggableTools.has(tool)) activateToolAt(tool, displayedBefore);
});

function setTab(name) {
  if (name === 'html') source.value = adminBody();
  if (name === 'preview') refreshPreview();
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `${name}-view`));
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  canvas.focus();
  if (lastRange) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(lastRange); }
  document.execCommand(button.dataset.command, false);
  changed();
}));
$('#heading-style').addEventListener('change', event => {
  const picker = event.target;
  const style = picker.value;
  picker.value = '';
  if (!style) return;
  if (!lastRange || !canvas.contains(lastRange.commonAncestorContainer)) {
    return toast('Поставьте курсор в текст статьи или выделите текст', true);
  }
  canvas.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(lastRange);
  if (!document.execCommand('formatBlock', false, style === 'h7' ? 'p' : style)) {
    return toast('Не удалось применить стиль к этому блоку', true);
  }
  const anchor = selection.anchorNode;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
  const paragraph = element?.closest('p');
  if (style === 'h7' && paragraph && canvas.contains(paragraph)) paragraph.classList.add('om-h7');
  if (style === 'p' && paragraph) {
    paragraph.classList.remove('om-h7');
    if (!paragraph.classList.length) paragraph.removeAttribute('class');
  }
  canvas.dispatchEvent(new Event('input', {bubbles:true}));
});
$('#make-link').addEventListener('click', () => {
  const url = prompt('Ссылка (https://...)');
  if (!url) return;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('#')) return toast('Укажите полную ссылку или якорь #...', true);
  canvas.focus();
  if (lastRange) {const selection=window.getSelection();selection.removeAllRanges();selection.addRange(lastRange);}
  document.execCommand('createLink', false, url);
  changed();
});
canvas.addEventListener('click', event => {if (event.target.closest('a')) event.preventDefault();});
canvas.addEventListener('input', changed);
source.addEventListener('input', () => setBody(source.value));

/** Возвращает доступные в текущей статье якоря с понятными подписями. */
function articleAnchors() {
  return [...canvas.querySelectorAll('[id]')].map(element => ({
    id: element.id,
    label: element.querySelector('h1,h2,h3')?.textContent.trim() || element.textContent.trim().slice(0, 60) || element.id,
  }));
}

/** Переключает поля внешней ссылки и якоря, а также доступность нового окна. */
function syncButtonLinkFields() {
  const isAnchor = document.querySelector('[name="button-link-kind"]:checked').value === 'anchor';
  $('#button-url-field').hidden = isAnchor;
  $('#button-anchor-field').hidden = !isAnchor;
  $('#button-url').required = !isAnchor;
  $('#button-anchor').required = isAnchor;
  $('#button-new-window').disabled = isAnchor;
  $('#button-new-window').checked = !isAnchor;
}

/** Открывает настройку кнопки и обновляет список якорей из статьи. */
function openButtonDialog() {
  const anchors = articleAnchors();
  $('#button-anchor').innerHTML = anchors.length
    ? anchors.map(anchor => `<option value="${escapeHtml(anchor.id)}">${escapeHtml(anchor.label)} (#${escapeHtml(anchor.id)})</option>`).join('')
    : '<option value="" disabled selected>Сначала добавьте раздел с якорем</option>';
  $('#button-form').reset();
  syncButtonLinkFields();
  $('#button-dialog').showModal();
  $('#button-text').focus();
}

$('#add-button').addEventListener('click', openButtonDialog);
document.querySelectorAll('[name="button-link-kind"]').forEach(input => input.addEventListener('change', syncButtonLinkFields));
$('#button-close').addEventListener('click', () => $('#button-dialog').close());
$('#button-cancel').addEventListener('click', () => $('#button-dialog').close());
$('#button-dialog').addEventListener('click', event => {if (event.target === $('#button-dialog')) $('#button-dialog').close();});
$('#button-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('#button-text').value.trim();
  const variant = document.querySelector('[name="button-variant"]:checked').value;
  const isAnchor = document.querySelector('[name="button-link-kind"]:checked').value === 'anchor';
  const href = isAnchor ? `#${$('#button-anchor').value}` : $('#button-url').value.trim();
  if (!text) return toast('Введите текст кнопки', true);
  if (isAnchor && !$('#button-anchor').value) return toast('В статье пока нет доступных якорей', true);
  if (!isAnchor && !/^https?:\/\//i.test(href)) return toast('Укажите полную ссылку, начиная с http:// или https://', true);
  const newWindow = !isAnchor && $('#button-new-window').checked ? ' target="_blank" rel="noopener noreferrer"' : '';
  insertBlock(`<div class="om-cta"><a class="om-button om-button--${variant}" href="${escapeHtml(href)}"${newWindow}>${escapeHtml(text)}</a></div>`);
  $('#button-dialog').close();
  toast('Кнопка добавлена');
});

$('#add-note').addEventListener('click', () => insertBlock('<section class="om-section"><h2>На что обратить внимание</h2><div class="om-note"><p>Важная информация для читателя.</p></div></section>'));

function productMarkup(product) {
  const title = escapeHtml(product.title);
  const url = escapeHtml(product.url);
  const gallery = product.images.map((src, index) => `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title}, фото ${index+1}"><img src="${escapeHtml(src)}" alt="${title}, фото ${index+1}" loading="lazy" decoding="async"></a>`).join('');
  const features = product.features.length ? `<p><strong>Подтверждённые свойства</strong></p><ul>${product.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>` : '';
  return `<article class="om-product" id="product-${escapeHtml(product.sku)}"><p class="om-sku">Артикул ${escapeHtml(product.sku)}</p><h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title} →</a></h3>${gallery ? `<div class="om-gallery" aria-label="Фотографии товара">${gallery}</div>` : '<p class="om-hint">Фотографии не удалось получить — добавьте их вручную.</p>'}<p><strong>Кому подойдёт</strong>Допишите рекомендацию для читателя.</p>${features}<p><strong>Что учесть</strong>Допишите ограничения и особенности модели.</p><div class="om-actions"><a href="${url}" target="_blank" rel="noopener noreferrer">Смотреть модель</a></div></article>`;
}

function addProduct(product) { return insertBlock(productMarkup(product)); }

function lockId() {
  if (lockedId) return;
  currentId = cleanId($('#filename').value);
  $('#filename').value = currentId;
  $('#filename').disabled = true;
  lockedId = true;
}

$('#upload').addEventListener('click', () => $('#image-file').click());
$('#image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    lockId();
    const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':file.type},body:file});
    insertBlock(`<figure><img src="${escapeHtml(assetUrl(result.src))}" alt="Описание изображения" loading="lazy"><figcaption>Подпись к изображению</figcaption></figure>`);
    toast('Изображение добавлено');
  } catch(error) {toast(error.message, true);}
  event.target.value = '';
});

async function save() {
  lockId();
  clearTimeout(updateTimer);
  refreshPreview();
  const title = $('#page-title').value.trim() || 'Статья OUTMAX';
  const result = await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:currentId,title,body:adminBody(),products:productLibrary})});
  $('#status').textContent = `Сохранено ${new Date(result.savedAt).toLocaleTimeString('ru-RU')}`;
  await listDrafts();
  const localized = result.localizedImages ? ` В архив добавлено внешних фото: ${result.localizedImages}.` : '';
  const failed = result.failedImages ? ` Не удалось скачать фото: ${result.failedImages}.` : '';
  toast(`Статья и ресурсы сохранены.${localized}${failed}`, !!result.failedImages);
  return result;
}

$('#save').addEventListener('click', () => save().catch(error => toast(error.message, true)));

/** Обновляет подпись HTML-кнопки для режима экспорта на оба сайта. */
function syncExportControls() {
  const both = document.querySelector('[name="export-site"]:checked').value === 'both';
  $('#export-html').textContent = both ? 'Скачать 2 HTML (ZIP)' : 'Скачать HTML';
}

/** Сохраняет черновик и запускает доменно-зависимый экспорт. */
async function exportArticle(format) {
  const site = document.querySelector('[name="export-site"]:checked').value;
  const actualFormat = site === 'both' ? 'zip' : format;
  await save();
  if (window.onlineDownloadExport) {
    await window.onlineDownloadExport(currentId, site, actualFormat);
  } else {
    location.href = `/api/export/${encodeURIComponent(currentId)}?site=${encodeURIComponent(site)}&format=${encodeURIComponent(actualFormat)}`;
  }
  $('#export-dialog').close();
  toast(site === 'both' ? 'Подготовлены два HTML-варианта' : `Экспорт подготовлен для ${OUTMAX_SITES[site]}`);
}

$('#download').addEventListener('click', () => {syncExportControls();$('#export-dialog').showModal();});
document.querySelectorAll('[name="export-site"]').forEach(input => input.addEventListener('change', syncExportControls));
$('#export-close').addEventListener('click', () => $('#export-dialog').close());
$('#export-cancel').addEventListener('click', () => $('#export-dialog').close());
$('#export-dialog').addEventListener('click', event => {if (event.target === $('#export-dialog')) $('#export-dialog').close();});
$('#export-html').addEventListener('click', () => exportArticle('html').catch(error => toast(error.message, true)));
$('#export-zip').addEventListener('click', () => exportArticle('zip').catch(error => toast(error.message, true)));

async function listDrafts() {
  const drafts = await api('/api/drafts');
  $('#drafts').innerHTML = drafts.length ? drafts.map(item => `<button data-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}<small>${escapeHtml(item.id)}</small></button>`).join('') : '<p class="help">Пока нет сохранённых статей.</p>';
}
$('#drafts').addEventListener('click', async event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  try {
    const draft = await api(`/api/draft/${encodeURIComponent(button.dataset.id)}`);
    currentId = draft.id; lockedId = true;
    $('#filename').value = currentId; $('#filename').disabled = true;
    $('#page-title').value = draft.title;
    setBody(draft.body);
    restoreProducts(draft.products);
    setTab('editor');
    $('#status').textContent = `Открыто: ${draft.title}`;
    toast('Статья открыта');
  } catch(error) {toast(error.message, true);}
});
$('#desktop').addEventListener('click', () => {preview.classList.remove('mobile');$('#desktop').classList.add('active');$('#mobile').classList.remove('active');});
$('#mobile').addEventListener('click', () => {preview.classList.add('mobile');$('#mobile').classList.add('active');$('#desktop').classList.remove('active');});
$('#page-title').addEventListener('input', () => $('#status').textContent = 'Есть несохранённые изменения');
$('#filename').addEventListener('input', () => $('#status').textContent = 'Есть несохранённые изменения');
window.addEventListener('beforeunload', event => {if ($('#status').textContent.includes('несохранённые')) {event.preventDefault();event.returnValue='';}});
listDrafts().catch(error => toast(error.message, true));
refreshPreview();
$('#status').textContent = 'Новая статья';
