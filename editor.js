const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const source = $('#source');
const preview = $('#preview');
let currentId = 'novaya-statya';
let lockedId = false;
let lastRange = null;
let updateTimer = null;
let toastTimer = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanId = value => String(value || '').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0,70) || 'statya';

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
    image.removeAttribute('contenteditable');
  });
  return copy.innerHTML;
}

function setBody(body) {
  canvas.innerHTML = body;
  canvas.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (/^[^/:]+_files\//.test(src)) image.setAttribute('src', '/articles/' + src);
  });
  canvas.dispatchEvent(new Event('editor:body-replaced'));
  refreshPreview();
}

function previewDocument() {
  const previewBody = encodedBody().replace(/(src=")([^"/:]+_files\/)/g, '$1/articles/$2');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${location.origin}/outmax.css"><style>body{margin:0;background:#fff}</style></head><body><article class="om-guide">${previewBody}</article><script>document.addEventListener('click',function(event){const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({behavior:'smooth'});}});<\/script></body></html>`;
}

function refreshPreview() {
  preview.srcdoc = previewDocument();
  if ($('#html-view').classList.contains('active') && document.activeElement !== source) source.value = encodedBody();
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

function insertBlock(markup) {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  const block = holder.firstElementChild;
  let target = lastRange?.startContainer;
  while (target && target.parentNode !== canvas) target = target.parentNode;
  if (target?.parentNode === canvas) target.after(block);
  else canvas.append(block);
  block.scrollIntoView({behavior:'smooth', block:'center'});
  changed();
  return block;
}

function setTab(name) {
  if (name === 'html') source.value = encodedBody();
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
    insertBlock(`<figure><img src="/articles/${escapeHtml(result.src)}" alt="Описание изображения" loading="lazy"><figcaption>Подпись к изображению</figcaption></figure>`);
    toast('Изображение добавлено');
  } catch(error) {toast(error.message, true);}
  event.target.value = '';
});

async function save() {
  lockId();
  const title = $('#page-title').value.trim() || 'Статья OUTMAX';
  const result = await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:currentId,title,body:encodedBody(),products:productLibrary})});
  $('#status').textContent = `Сохранено ${new Date(result.savedAt).toLocaleTimeString('ru-RU')}`;
  await listDrafts();
  toast('Статья и ресурсы сохранены');
  return result;
}

$('#save').addEventListener('click', () => save().catch(error => toast(error.message, true)));
$('#download').addEventListener('click', async () => {
  try {await save(); location.href=`/api/zip/${encodeURIComponent(currentId)}`;}
  catch(error) {toast(error.message, true);}
});

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
