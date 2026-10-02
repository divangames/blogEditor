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
let insertionParent = null;
let insertionRange = null;
let hoverPlacement = null;
let displayedBefore = null;
let displayedParent = null;
let displayedRange = null;
let draggedBlock = null;
let draggedToolId = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanId = value => String(value || '').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0,70) || 'statya';
const assetUrl = src => {
  const value = String(src || '').trim();
  if (!value) return value;
  const browserUrl = window.onlineAssetUrl?.(value);
  if (browserUrl && browserUrl !== value) return browserUrl;
  if (/^(?:https?:|blob:|data:|\/)/i.test(value)) return value;
  return `/articles/${value.replace(/^articles\//i, '')}`;
};

function toast(message, error = false) {
  const box = $('#toast');
  box.textContent = message;
  box.className = (error ? 'error ' : '') + 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.className = '', 4200);
}

async function api(path, options = {}) {
  const request = {...options};
  if (ACTIVE_EDITOR.key !== 'outmax') {
    const separator = path.includes('?') ? '&' : '?';
    path += `${separator}brand=${encodeURIComponent(ACTIVE_EDITOR.key)}`;
    if (request.headers?.['Content-Type'] === 'application/json' && typeof request.body === 'string') {
      request.body = JSON.stringify({...JSON.parse(request.body), brand:ACTIVE_EDITOR.key});
    }
  }
  const response = await fetch(path, request);
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const temporary = [502, 503, 504].includes(response.status);
    const oversized = response.status === 413;
    const message = oversized
      ? 'Статья слишком большая для отправки на сервер. Уменьшите размер встроенных изображений и повторите сохранение.'
      : temporary
        ? 'Сервер временно не смог сохранить статью. Повторите попытку через минуту.'
        : 'Сервер вернул некорректный ответ. Обновите страницу и повторите действие.';
    throw new Error(message);
  }
  if (!response.ok && response.status === 404 && /(?:маршрут не найден|не найдено)/i.test(String(data.error || ''))) {
    const route = new URL(path, location.href).pathname;
    if (route === '/api/drafts') return [];
    if (route === '/api/fetch-article' && typeof request.body === 'string') {
      const url = JSON.parse(request.body).url;
      const key = new URL(url).href.replace(/\/$/, '');
      const cache = window.__ARTICLE_IMPORT_CACHE__ || {};
      const cached = cache[key] || Object.entries(cache).find(([source]) => new URL(source).href.replace(/\/$/, '') === key)?.[1];
      if (cached) return cached;
    }
  }
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

function encodedBody() {
  const copy = canvas.cloneNode(true);
  copy.querySelectorAll('[data-editor-selected],[data-editor-cell-selected]').forEach(element => {
    element.removeAttribute('data-editor-selected');
    element.removeAttribute('data-editor-cell-selected');
  });
  copy.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (src.startsWith('/articles/')) image.setAttribute('src', src.slice('/articles/'.length));
    else if (window.onlineStoredSrc) image.setAttribute('src', window.onlineStoredSrc(src));
    image.removeAttribute('contenteditable');
  });
  return copy.innerHTML;
}

const adminCssVariables = ACTIVE_EDITOR.key === 'hasl'
  ? {'--om-ink':'#090b0d','--om-muted':'#707070','--om-line':'#d8d8d8','--om-pale':'#f1f1f1','--om-red':'#155fef','--om-lime':'#c7f500','--om-night':'#111'}
  : {'--om-ink':'#231815','--om-muted':'#7a7a7a','--om-line':'#e5e5e5','--om-pale':'#f7f6f6','--om-red':'#e31e24'};

function resolvedAdminStyle(value) {
  return String(value).replace(/var\((--om-[a-z-]+)\)/g, (_, name) => adminCssVariables[name] || 'inherit');
}

function activeArticleStyleSheets() {
  return [...document.styleSheets].filter(sheet => {
    if (ACTIVE_EDITOR.key === 'hasl' && sheet.ownerNode?.id === 'hasl-inline-style') return true;
    return !!sheet.href && sheet.href.endsWith(ACTIVE_EDITOR.css);
  });
}

function activeArticleCssText() {
  const chunks = [];
  for (const sheet of activeArticleStyleSheets()) {
    try {
      chunks.push([...sheet.cssRules].map(rule => rule.cssText).join('\n'));
    } catch (_) {}
  }
  return chunks.filter(Boolean).join('\n');
}

/** Создаёт код для админки OUTMAX, не зависящий от классов и внешнего CSS. */
function adminBody() {
  const copy = canvas.cloneNode(true);
  const originals = [...canvas.querySelectorAll('*')];
  const clones = [...copy.querySelectorAll('*')];
  const originalStyles = originals.map(element => element.getAttribute('style') || '');
  const wrapper = document.createElement('div');
  wrapper.append(copy);
  for (const sheet of activeArticleStyleSheets()) {
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
  copy.querySelectorAll('[data-editor-selected],[data-editor-cell-selected]').forEach(element => {
    element.removeAttribute('data-editor-selected');
    element.removeAttribute('data-editor-cell-selected');
  });
  copy.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (src.startsWith('/articles/')) image.setAttribute('src', src.slice('/articles/'.length));
    else if (window.onlineStoredSrc) image.setAttribute('src', window.onlineStoredSrc(src));
  });
  if (ACTIVE_EDITOR.key === 'hasl') {
    copy.querySelectorAll(':scope > section.om-section:not([data-module="final-expert-choice"]):not([data-module="final-promo"])')
      .forEach(section => section.style.setProperty('background', '#fff', 'important'));
    copy.querySelectorAll('.om-button,.om-actions a,.om-cta a')
      .forEach(button => button.style.setProperty('border', '0', 'important'));
  }
  return copy.innerHTML;
}

function setBody(body, {normalize = true} = {}) {
  canvas.innerHTML = body;
  clearInsertionPoint();
  canvas.querySelectorAll('img[src]').forEach(image => {
    const src = image.getAttribute('src');
    if (/^[^/:]+_files\//.test(src)) image.setAttribute('src', assetUrl(src));
  });
  canvas.dispatchEvent(new CustomEvent('editor:body-replaced', {detail:{normalize}}));
  refreshPreview();
}

function previewDocument() {
  const previewBody = encodedBody().replace(/(src=")([^"/:]+_files\/[^" ]+)/g, (_, prefix, path) => prefix + assetUrl(path));
  const css = activeArticleCssText();
  const articleStyle = css
    ? `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`
    : `<link rel="stylesheet" href="${new URL(ACTIVE_EDITOR.css, location.href).href}">`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${articleStyle}<style>body{margin:0;background:#fff}</style></head><body><article class="om-guide">${previewBody}</article><script>document.addEventListener('click',function(event){const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({behavior:'smooth'});}});<\/script></body></html>`;
}

function updateCharacterCount(html = adminBody()) {
  const textLength = (canvas.innerText || '').replace(/\r\n/g, '\n').length;
  $('#character-count').textContent = `Текст: ${textLength.toLocaleString('ru-RU')} · HTML: ${html.length.toLocaleString('ru-RU')}`;
}

function refreshPreview() {
  preview.srcdoc = previewDocument();
  const html = adminBody();
  updateCharacterCount(html);
  if ($('#html-view').classList.contains('active') && document.activeElement !== source) source.value = html;
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

function pointRange(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = document.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function mediaPlacementAtPoint(x, y, excluded = null, allowNested = false) {
  if (!allowNested) return {parent:canvas, before:rootBeforeAtY(y, excluded), range:null};
  const hit = document.elementFromPoint(x, y);
  const parent = hit?.closest('section,header,article.om-product,.om-callout,.om-note');
  const validParent = parent && canvas.contains(parent) && parent !== excluded && !excluded?.contains(parent)
    ? parent
    : canvas;
  const range = pointRange(x, y);
  const rangeElement = range?.startContainer?.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range?.startContainer?.parentElement;
  const paragraph = rangeElement?.closest('p,blockquote');
  if (range && paragraph && validParent.contains(paragraph) && !excluded?.contains(paragraph) && !paragraph.closest('figcaption')) {
    return {parent:paragraph.parentElement, before:null, range:range.cloneRange()};
  }
  const children = [...validParent.children].filter(child => child !== excluded && (validParent !== canvas || child.tagName !== 'HEADER'));
  const before = children.find(child => y < child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2) || null;
  return {parent:validParent, before, range:null};
}

function showInsertionMarker(before, locked = false, parent = canvas, range = null) {
  const marker = $('#insertion-marker');
  const shell = $('.canvas-shell');
  displayedBefore = before;
  displayedParent = parent || canvas;
  displayedRange = range?.cloneRange() || null;
  const shellRect = shell.getBoundingClientRect();
  const parentRect = displayedParent.getBoundingClientRect();
  const children = [...displayedParent.children].filter(child => child !== draggedBlock && (displayedParent !== canvas || child.tagName !== 'HEADER'));
  const last = children.at(-1);
  const rangeRects = displayedRange ? [...displayedRange.getClientRects()] : [];
  const rangeRect = rangeRects.at(-1);
  const y = rangeRect?.bottom ?? before?.getBoundingClientRect().top ?? (last?.getBoundingClientRect().bottom ?? parentRect.top + 24) + 12;
  marker.style.top = `${y - shellRect.top}px`;
  marker.style.left = `${Math.max(20, parentRect.left - shellRect.left)}px`;
  marker.style.right = `${Math.max(20, shellRect.right - parentRect.right)}px`;
  marker.classList.toggle('locked', locked);
  marker.hidden = false;
}

function clearInsertionPoint() {
  insertionLocked = false;
  insertionBefore = null;
  insertionParent = null;
  insertionRange = null;
  hoverPlacement = null;
  displayedBefore = null;
  displayedParent = null;
  displayedRange = null;
  $('#insertion-marker').hidden = true;
}

function insertBlockAt(markup, before, parent = canvas) {
  const holder = document.createElement('div');
  if (typeof markup === 'string') holder.innerHTML = markup;
  const block = typeof markup === 'string' ? holder.firstElementChild : markup;
  if (!parent || (!canvas.contains(parent) && parent !== canvas)) parent = canvas;
  if (before?.parentNode === parent) parent.insertBefore(block, before); else parent.append(block);
  insertionBefore = null;
  insertionParent = null;
  insertionRange = null;
  insertionLocked = false;
  $('#insertion-marker').hidden = true;
  block.scrollIntoView({behavior:'smooth', block:'center'});
  changed();
  return block;
}

function insertBlock(markup) {
  if (insertionLocked && !insertionRange && insertionParent && (!insertionBefore || insertionBefore.parentNode === insertionParent)) {
    return insertBlockAt(markup, insertionBefore, insertionParent);
  }
  let target = lastRange?.startContainer;
  while (target && target.parentNode !== canvas) target = target.parentNode;
  return insertBlockAt(markup, target?.parentNode === canvas ? target.nextElementSibling : null);
}

function caretRangeInsideCanvas(preferredRange = null) {
  const range = preferredRange || lastRange;
  return range && canvas.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}

function parsedBlock(markup) {
  if (typeof markup !== 'string') return markup;
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  return holder.firstElementChild;
}

function keepCaretAfterInsertion(block, nextTextBlock = null) {
  canvas.focus({preventScroll:true});
  const range = document.createRange();
  if (nextTextBlock && canvas.contains(nextTextBlock)) {
    range.selectNodeContents(nextTextBlock);
    range.collapse(true);
  } else {
    range.setStartAfter(block);
    range.collapse(true);
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  lastRange = range.cloneRange();
  block.scrollIntoView({behavior:'smooth', block:'center'});
  changed();
  return block;
}

/** Вставляет медиа-блок точно в позицию текстового курсора, в том числе внутри раздела. */
function insertMediaAtCaret(markup, preferredRange = null) {
  if (insertionLocked && insertionRange) {
    preferredRange = insertionRange.cloneRange();
    insertionLocked = false;
    insertionBefore = null;
    insertionParent = null;
    insertionRange = null;
    $('#insertion-marker').hidden = true;
  }
  else if (insertionLocked && insertionParent && (!insertionBefore || insertionBefore.parentNode === insertionParent)) {
    return insertBlockAt(markup, insertionBefore, insertionParent);
  }
  const range = caretRangeInsideCanvas(preferredRange);
  if (!range) return insertBlock(markup);
  range.collapse(true);
  const block = parsedBlock(markup);
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  if (!startElement || !canvas.contains(startElement)) return insertBlockAt(block, null);

  const paragraph = startElement.closest('p,blockquote');
  if (paragraph && canvas.contains(paragraph) && !paragraph.closest('figcaption')) {
    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(paragraph);
    after.setStart(range.startContainer, range.startOffset);
    const hasBefore = before.toString().trim().length > 0;
    const hasAfter = after.toString().trim().length > 0;
    if (!hasBefore) paragraph.before(block);
    else if (!hasAfter) paragraph.after(block);
    else {
      const tail = paragraph.cloneNode(false);
      tail.append(after.extractContents());
      paragraph.after(block, tail);
      return keepCaretAfterInsertion(block, tail);
    }
    return keepCaretAfterInsertion(block, !hasBefore ? paragraph : block.nextElementSibling);
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const container = range.startContainer;
    if (container === canvas || container.matches('section,header,article,aside,div,td,th')) {
      const before = container.childNodes[range.startOffset] || null;
      container.insertBefore(block, before);
      return keepCaretAfterInsertion(block, block.nextElementSibling);
    }
  }

  let anchor = startElement.closest('h1,h2,h3,h4,h5,h6,li,figure,.om-product,.om-table-scroll,.om-toc,.om-cta,.om-callout,.om-note');
  if (anchor?.matches('li')) anchor = anchor.closest('ul,ol') || anchor;
  if (anchor && canvas.contains(anchor)) {
    anchor.after(block);
    return keepCaretAfterInsertion(block, block.nextElementSibling);
  }
  return insertBlock(markup);
}

canvas.addEventListener('scroll', () => {
  if (insertionLocked) showInsertionMarker(insertionBefore, true, insertionParent || canvas, insertionRange);
  else $('#insertion-marker').hidden = true;
});
canvas.addEventListener('pointerdown', () => {
  if (insertionLocked) clearInsertionPoint();
});
$('#choose-insertion').addEventListener('click', () => {
  insertionBefore = displayedBefore;
  insertionParent = displayedParent || canvas;
  insertionRange = displayedRange?.cloneRange() || null;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true, insertionParent, insertionRange);
  toast('Место вставки выбрано. Добавьте блок слева.');
});
const draggableTools = new Set(['add-section', 'add-toc', 'add-button', 'add-note', 'add-table', 'add-divider']);
draggableTools.forEach(id => $('#'+id).addEventListener('dragstart', event => {
  draggedToolId = id;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-outmax-tool', id);
}));
draggableTools.forEach(id => $('#'+id).addEventListener('dragend', () => {
  draggedToolId = null;
  if (!insertionLocked) $('#insertion-marker').hidden = true;
}));
function activateToolAt(id, placement) {
  if (!draggableTools.has(id)) return;
  insertionBefore = placement?.before || null;
  insertionParent = placement?.parent || canvas;
  insertionRange = placement?.range?.cloneRange() || null;
  insertionLocked = true;
  showInsertionMarker(insertionBefore, true, insertionParent, insertionRange);
  $('#'+id).click();
}
canvas.addEventListener('dragover', event => {
  const types = Array.from(event.dataTransfer.types);
  if (!types.includes('application/x-outmax-block') && !types.includes('application/x-outmax-product') && !types.includes('application/x-outmax-tool')) return;
  event.preventDefault();
  const allowNested = draggedBlock?.matches('figure,hr.om-divider') || draggedToolId === 'add-divider';
  hoverPlacement = mediaPlacementAtPoint(event.clientX, event.clientY, draggedBlock, allowNested);
  showInsertionMarker(hoverPlacement.before, false, hoverPlacement.parent, hoverPlacement.range);
  event.dataTransfer.dropEffect = draggedBlock ? 'move' : 'copy';
});
function moveDraggedBlockTo(placement) {
  const block = draggedBlock;
  if (!block) return;
  if (placement?.range && block.matches('figure,hr.om-divider')) {
    clearInsertionPoint();
    insertMediaAtCaret(block, placement.range);
  } else {
    const parent = placement?.parent || canvas;
    const before = placement?.before || null;
    if (before?.parentNode === parent) parent.insertBefore(block, before); else parent.append(block);
  }
  draggedBlock = null;
  clearInsertionPoint();
  canvas.dispatchEvent(new Event('input', {bubbles:true}));
  toast('Блок перемещён');
}
canvas.addEventListener('drop', event => {
  if (event.dataTransfer.getData('application/x-outmax-block') && draggedBlock) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const allowNested = draggedBlock.matches('figure,hr.om-divider');
    moveDraggedBlockTo(mediaPlacementAtPoint(event.clientX, event.clientY, draggedBlock, allowNested));
    return;
  }
  const tool = event.dataTransfer.getData('application/x-outmax-tool');
  if (draggableTools.has(tool)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    activateToolAt(tool, mediaPlacementAtPoint(event.clientX, event.clientY, null, tool === 'add-divider'));
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
    moveDraggedBlockTo({before:displayedBefore, parent:displayedParent || canvas, range:displayedRange});
    return;
  }
  const sku = event.dataTransfer.getData('application/x-outmax-product');
  const product = sku && productLibrary.find(item => item.sku === sku);
  if (product) insertProduct(product, {before:displayedBefore});
  const tool = event.dataTransfer.getData('application/x-outmax-tool');
  if (draggableTools.has(tool)) activateToolAt(tool, {before:displayedBefore, parent:displayedParent || canvas, range:displayedRange});
});

function setTab(name) {
  if (name === 'html') source.value = adminBody();
  if (name === 'preview') refreshPreview();
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `${name}-view`));
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

// Одинаковые кнопки форматирования в редакторах статей OUTMAX и ХАСЛ.
const listCommandButton = document.querySelector('[data-command="insertUnorderedList"]');
if (listCommandButton) {
  [
    {command:'underline',title:'Подчеркнуть',html:'<u>П</u>'},
    {command:'strikeThrough',title:'Зачеркнуть',html:'<s>З</s>'}
  ].forEach(item => {
    if (document.querySelector(`[data-command="${item.command}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.command = item.command;
    button.title = item.title;
    button.innerHTML = item.html;
    listCommandButton.before(button);
  });
}

const textCommands = new Set(['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight','removeFormat']);
$('.toolstrip').addEventListener('mousedown', event => {
  if (event.target.closest('button')) event.preventDefault();
});
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  const command = button.dataset.command;
  if (textCommands.has(command) && (!lastRange || !canvas.contains(lastRange.commonAncestorContainer))) {
    return toast('Поставьте курсор в текст или выделите нужный фрагмент', true);
  }
  canvas.focus({preventScroll:true});
  if (lastRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(lastRange);
  }
  document.execCommand(command, false);
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
  if (isAnchor) $('#button-new-window').checked = false;
}

/** Открывает настройку кнопки и обновляет список якорей из статьи. */
let editingButtonLink = null;
let buttonInsertionCell = null;

function openButtonDialog(link = null, targetCell = null) {
  const anchors = articleAnchors();
  $('#button-anchor').innerHTML = anchors.length
    ? anchors.map(anchor => `<option value="${escapeHtml(anchor.id)}">${escapeHtml(anchor.label)} (#${escapeHtml(anchor.id)})</option>`).join('')
    : '<option value="" disabled selected>Сначала добавьте раздел с якорем</option>';
  $('#button-form').reset();
  editingButtonLink = link && canvas.contains(link) ? link : null;
  buttonInsertionCell = targetCell?.matches?.('th,td') && canvas.contains(targetCell) ? targetCell : null;
  $('#button-dialog-title').textContent = editingButtonLink ? 'Настроить кнопку' : buttonInsertionCell ? 'Добавить кнопку в ячейку' : 'Добавить кнопку';
  $('#button-submit').textContent = editingButtonLink ? 'Сохранить изменения' : 'Добавить кнопку';
  if (editingButtonLink) {
    const href = editingButtonLink.getAttribute('href') || '';
    $('#button-text').value = editingButtonLink.textContent.trim();
    const variant = [...editingButtonLink.classList].find(value => /^om-button--/.test(value))?.replace('om-button--','') || 'red';
    const variantInput = document.querySelector(`[name="button-variant"][value="${CSS.escape(variant)}"]`);
    if (variantInput) variantInput.checked = true;
    const anchor = href.startsWith('#');
    document.querySelector(`[name="button-link-kind"][value="${anchor ? 'anchor' : 'url'}"]`).checked = true;
    if (anchor) $('#button-anchor').value = href.slice(1);
    else $('#button-url').value = href;
  }
  syncButtonLinkFields();
  if (editingButtonLink && !($('#button-url-field').hidden)) $('#button-new-window').checked = editingButtonLink.target === '_blank';
  $('#button-dialog').showModal();
  $('#button-text').focus();
}

$('#add-button').addEventListener('click', () => openButtonDialog());
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
  if (editingButtonLink) {
    editingButtonLink.textContent = text;
    editingButtonLink.href = href;
    [...editingButtonLink.classList].filter(value => /^om-button--/.test(value)).forEach(value => editingButtonLink.classList.remove(value));
    editingButtonLink.classList.add('om-button', `om-button--${variant}`);
    if (!isAnchor && $('#button-new-window').checked) {
      editingButtonLink.target = '_blank';
      editingButtonLink.rel = 'noopener noreferrer';
    } else {
      editingButtonLink.removeAttribute('target');
      editingButtonLink.removeAttribute('rel');
    }
    changed();
  } else {
    const newWindow = !isAnchor && $('#button-new-window').checked ? ' target="_blank" rel="noopener noreferrer"' : '';
    const markup = `<div class="om-cta${buttonInsertionCell ? ' om-cta--cell' : ''}"><a class="om-button om-button--${variant}" href="${escapeHtml(href)}"${newWindow}>${escapeHtml(text)}</a></div>`;
    if (buttonInsertionCell && canvas.contains(buttonInsertionCell)) {
      buttonInsertionCell.insertAdjacentHTML('beforeend', markup);
      changed();
    } else insertBlock(markup);
  }
  $('#button-dialog').close();
  toast(editingButtonLink ? 'Кнопка обновлена' : 'Кнопка добавлена');
  editingButtonLink = null;
  buttonInsertionCell = null;
});

$('#add-note').addEventListener('click', () => insertBlock('<aside class="om-callout"><p class="om-callout-title">ВАЖНАЯ ИНФОРМАЦИЯ</p><p>Добавьте пояснение, промокод, предупреждение или другой акцентный текст.</p></aside>'));

$('#add-table').addEventListener('click', () => {
  const table = insertBlock('<div class="om-table-scroll" role="region" aria-label="Редактируемая таблица" tabindex="0"><table data-editor-table="1" data-metrics="2"><thead><tr><th>Заголовок 1</th><th>Заголовок 2</th><th>Заголовок 3</th></tr></thead><tbody><tr><td>Текст</td><td>Текст</td><td>Текст</td></tr><tr><td>Текст</td><td>Текст</td><td>Текст</td></tr></tbody></table></div>');
  const firstCell = table.querySelector('tbody td');
  if (firstCell && typeof selectNode === 'function') selectNode(table, firstCell.closest('tbody tr'), firstCell, true);
  toast('Таблица добавлена. Нажмите на ячейку, чтобы открыть инструменты.');
});

$('#add-divider').addEventListener('click', () => {
  insertMediaAtCaret('<hr class="om-divider" aria-label="Разделитель">');
  toast('Разделитель добавлен');
});

function productMarkup(product) {
  const title = escapeHtml(product.title);
  const url = escapeHtml(product.url);
  const gallery = product.images.map((src, index) => `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title}, фото ${index+1}"><img src="${escapeHtml(src)}" alt="${title}, фото ${index+1}" loading="lazy" decoding="async"></a>`).join('');
  const features = product.features.length ? `<p><strong>Подтверждённые свойства</strong></p><ul>${product.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>` : '';
  if (ACTIVE_EDITOR.key === 'hasl') {
    let catalogUrl = product.url;
    try {
      const parsed = new URL(product.url);
      parsed.pathname = parsed.pathname.replace(/\/[^/]+\/?$/, '/');
      parsed.search = '';
      parsed.hash = '';
      catalogUrl = parsed.href;
    } catch (_) {}
    const haslFeatures = product.features.length ? `<div class="om-product-features"><strong>Характеристики</strong><ul>${product.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></div>` : '';
    const money = value => Number(value || 0).toLocaleString('ru-RU') + ' ₽';
    const badgeText = Array.isArray(product.labels) && product.labels.length ? product.labels[0] : (product.inStock ? 'В наличии' : 'Выбор ХАСЛ');
    const badge = `<span class="om-product-badge">${escapeHtml(badgeText)}</span>`;
    const price = product.price ? `<div class="om-price"><strong>${money(product.price)}</strong>${product.oldPrice > product.price ? `<del>${money(product.oldPrice)}</del>` : ''}</div>` : '';
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? `<div class="om-sizes"><strong>Доступные размеры</strong><div>${product.sizes.map(size => `<span title="${escapeHtml(size.hint || '')}">${escapeHtml(size.name)}</span>`).join('')}</div></div>` : '';
    return `<article class="om-product om-product--hasl" id="product-${escapeHtml(product.sku)}" data-sku="${escapeHtml(product.sku)}" data-full-review="1">${badge}<div class="om-sku">Арт. ${escapeHtml(product.sku)}</div><h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title} →</a></h3>${gallery ? `<div class="om-gallery" data-gallery="1" aria-label="Галерея товара — ${title}">${gallery}</div><p class="om-gallery-hint">← Галерею можно листать пальцем →</p>` : '<p class="om-hint">Фотографии не удалось получить — добавьте их вручную.</p>'}<p class="om-product-summary"><strong>Кратко:</strong> добавьте короткое описание роли этой модели в подборке.</p><p class="om-product-copy"><strong>Кому подойдёт</strong>Допишите рекомендацию для читателя.</p>${haslFeatures}<p class="om-product-copy"><strong>Что учесть</strong>Допишите ограничения, посадку и особенности модели.</p>${price}${sizes}<div class="om-actions" data-cta-pair="1"><a class="om-button om-button--lime" href="${url}" target="_blank" rel="noopener noreferrer">Смотреть модель →</a><a class="om-button om-button--black" href="${escapeHtml(catalogUrl)}" target="_blank" rel="noopener noreferrer">Смотреть все модели →</a></div></article>`;
  }
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

let imageInsertionCell = null;
let imageInsertionRange = null;
function requestImageUpload(targetCell = null) {
  imageInsertionCell = targetCell?.matches?.('th,td') && canvas.contains(targetCell) ? targetCell : null;
  imageInsertionRange = imageInsertionCell ? null : caretRangeInsideCanvas();
  $('#image-file').click();
}

$('#upload').addEventListener('click', () => requestImageUpload());
$('#image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) {imageInsertionCell = null;imageInsertionRange = null;return;}
  try {
    lockId();
    const result = await api(`/api/upload?draft=${encodeURIComponent(currentId)}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {method:'POST',headers:{'Content-Type':file.type},body:file});
    const markup = `<figure${imageInsertionCell ? ' class="om-table-cell-media"' : ''}><img src="${escapeHtml(assetUrl(result.src))}" alt="Описание изображения" loading="lazy"><figcaption>Подпись к изображению</figcaption></figure>`;
    if (imageInsertionCell && canvas.contains(imageInsertionCell)) {
      imageInsertionCell.insertAdjacentHTML('beforeend', markup);
      changed();
      toast('Изображение добавлено в ячейку');
    } else {
      insertMediaAtCaret(markup, imageInsertionRange);
      toast('Изображение добавлено');
    }
  } catch(error) {toast(error.message, true);}
  imageInsertionCell = null;
  imageInsertionRange = null;
  event.target.value = '';
});

async function save() {
  lockId();
  clearTimeout(updateTimer);
  refreshPreview();
  const title = $('#page-title').value.trim() || `Статья ${ACTIVE_EDITOR.name}`;
  const result = await api('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:currentId,title,body:adminBody(),products:productLibrary})});
  $('#status').textContent = `${result.browserStorage ? 'Сохранено в браузере' : 'Сохранено'} ${new Date(result.savedAt).toLocaleTimeString('ru-RU')}`;
  await listDrafts();
  const localized = result.localizedImages ? ` В архив добавлено внешних фото: ${result.localizedImages}.` : '';
  const failed = result.failedImages ? ` Не удалось скачать фото: ${result.failedImages}.` : '';
  const storage = result.browserStorage ? ' Черновик доступен в этом браузере.' : '';
  toast(`Статья и ресурсы сохранены.${storage}${localized}${failed}`, !!result.failedImages);
  return result;
}

$('#save').addEventListener('click', () => save().catch(error => toast(error.message, true)));

/** Обновляет подпись HTML-кнопки для режима экспорта на оба сайта. */
function syncExportControls() {
  const both = document.querySelector('[name="export-site"]:checked').value === 'both';
  const localImages = $('#export-local-images').checked;
  $('#export-local-images').nextElementSibling.querySelector('small').textContent = `ZIP будет содержать image/название-статьи с редакционными изображениями. Фото товаров останутся прямыми ссылками ${ACTIVE_EDITOR.name}.`;
  $('#export-html').textContent = localImages ? 'Скачать HTML + image (ZIP)' : both ? 'Скачать 2 HTML (ZIP)' : 'Скачать HTML';
}

/** Сохраняет черновик и запускает доменно-зависимый экспорт. */
async function exportArticle(format) {
  const site = document.querySelector('[name="export-site"]:checked').value;
  const localImages = $('#export-local-images').checked;
  const actualFormat = site === 'both' || localImages ? 'zip' : format;
  await save();
  if (window.onlineDownloadExport) {
    await window.onlineDownloadExport(currentId, site, actualFormat, localImages);
  } else {
    location.href = `/api/export/${encodeURIComponent(currentId)}?site=${encodeURIComponent(site)}&format=${encodeURIComponent(actualFormat)}&localImages=${localImages ? '1' : '0'}&brand=${encodeURIComponent(ACTIVE_EDITOR.key)}`;
  }
  $('#export-dialog').close();
  toast(site === 'both' ? 'Подготовлены два HTML-варианта' : `Экспорт подготовлен для ${OUTMAX_SITES[site]}`);
}

$('#download').addEventListener('click', () => {syncExportControls();$('#export-dialog').showModal();});
document.querySelectorAll('[name="export-site"]').forEach(input => input.addEventListener('change', syncExportControls));
$('#export-local-images').addEventListener('change', syncExportControls);
$('#export-close').addEventListener('click', () => $('#export-dialog').close());
$('#export-cancel').addEventListener('click', () => $('#export-dialog').close());
$('#export-dialog').addEventListener('click', event => {if (event.target === $('#export-dialog')) $('#export-dialog').close();});
$('#export-html').addEventListener('click', () => exportArticle('html').catch(error => toast(error.message, true)));
$('#export-zip').addEventListener('click', () => exportArticle('zip').catch(error => toast(error.message, true)));

async function listDrafts() {
  const drafts = (await api('/api/drafts')).filter(item => item.id !== 'email-editor');
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
