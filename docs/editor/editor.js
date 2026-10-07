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
const ARTICLE_HISTORY_LIMIT = 300;
const ARTICLE_HISTORY_DELAY = 360;
let articleHistory = [];
let articleHistoryIndex = -1;
let articleHistoryTimer = null;
let articleHistoryRestoring = false;
let articleBackupReady = false;
let articleBackupRestoring = false;
let articleBackupTimer = null;
let articleBackupRevision = 0;
let articleBackupDirty = false;
let articleBackupWrite = Promise.resolve();
let articleTitlePromptPromise = null;
let articleServerRevision = null;
let articleDocumentId = null;
let articleSaveEpoch = 0;
let articleSavePromise = null;
let articlePendingSave = null;
let articleAutosaveTimer = null;
let articleSaveConflict = false;
let articleNeedsSave = false;
let articleSavedId = currentId;
const articleBackupTab = (()=>{try{let id=sessionStorage.getItem('article-backup-tab');if(!id){id=crypto.randomUUID();sessionStorage.setItem('article-backup-tab',id);}return id;}catch{return 'default';}})();

const articleBackupDb = new Promise(resolve => {
  try {
    const request = indexedDB.open('outmax-editor-backups',1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('backups')) request.result.createObjectStore('backups',{keyPath:'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  } catch { resolve(null); }
});

function articleBackupBaseKey() {
  const user = window.__EDITOR_PROFILE__?.id || localStorage.getItem('outmax-last-editor-user') || 'local';
  return `article:${ACTIVE_EDITOR.key}:${user}`;
}
function articleBackupKey() {return `${articleBackupBaseKey()}:${currentId}:${articleBackupTab}`;}

async function readArticleBackup(key = articleBackupKey()) {
  try {
    const db = await articleBackupDb;
    if (!db) throw new Error('IndexedDB unavailable');
    return await new Promise((resolve,reject) => {
      const request = db.transaction('backups','readonly').objectStore('backups').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {return JSON.parse(localStorage.getItem(`outmax-backup:${key}`)) || null;}
    catch {return null;}
  }
}

async function writeArticleBackup(record) {
  try {
    const db = await articleBackupDb;
    if (!db) throw new Error('IndexedDB unavailable');
    await new Promise((resolve,reject) => {
      const transaction = db.transaction('backups','readwrite');
      transaction.objectStore('backups').put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    try {localStorage.setItem(`outmax-backup:${record.key}`,JSON.stringify(record));}
    catch {throw error;}
  }
}

function articleBackupTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
}

function setArticleBackupStatus(state, savedAt = '') {
  const node = $('#article-backup-status');
  if (!node) return;
  const time = articleBackupTime(savedAt);
  node.dataset.state = state;
  node.textContent = state === 'saving' ? 'Резервная копия · сохраняю'
    : state === 'saved' ? `Резервная копия${time ? ` · ${time}` : ''}`
    : state === 'restored' ? `Восстановлено${time ? ` · ${time}` : ''}`
    : state === 'error' ? 'Копия не сохранена'
    : 'Резервная копия';
}

function articleBackupSnapshot(dirty = true) {
  let products = [];
  try {products = JSON.parse(JSON.stringify(productLibrary || []));} catch {}
  return {
    key:articleBackupKey(),version:1,editor:'article',brand:ACTIVE_EDITOR.key,
    currentId,lockedId,filename:$('#filename')?.value || '',title:$('#page-title')?.value || '',
    body:encodedBody(),products,dirty,revision:articleBackupRevision,savedAt:new Date().toISOString(),
    serverRevision:articleServerRevision,documentId:articleDocumentId,pendingSave:articlePendingSave,
    needsSave:articleNeedsSave,conflict:articleSaveConflict
  };
}

function persistArticleBackup(dirty = true) {
  if (!articleBackupReady || articleBackupRestoring) return Promise.resolve();
  articleBackupDirty = dirty;
  const record = articleBackupSnapshot(dirty);
  articleBackupWrite = articleBackupWrite.catch(() => {}).then(async () => {
    await writeArticleBackup(record);
    if (record.key === articleBackupKey()) {
      try{sessionStorage.setItem(`outmax-active:${articleBackupBaseKey()}`,record.key);}catch{}
      try{localStorage.setItem(`outmax-active:${articleBackupBaseKey()}`,record.key);}catch{}
    }
  });
  return articleBackupWrite.then(() => {
    if (record.revision === articleBackupRevision) setArticleBackupStatus('saved',record.savedAt);
    return true;
  }).catch(() => {setArticleBackupStatus('error');return false;});
}

function scheduleArticleBackup() {
  if (!articleBackupReady || articleBackupRestoring) return;
  articleBackupRevision += 1;
  articleBackupDirty = true;
  setArticleBackupStatus('saving');
  clearTimeout(articleBackupTimer);
  articleBackupTimer = setTimeout(() => {
    articleBackupTimer = null;
    persistArticleBackup(true);
  },650);
}

window.markArticleBackupSynced = ({revision = articleBackupRevision,force = false} = {}) => {
  if (!articleBackupReady) return Promise.resolve();
  clearTimeout(articleBackupTimer);
  articleBackupTimer = null;
  return persistArticleBackup(!(force || revision === articleBackupRevision));
};

window.finishArticleBackupStartup = async ({openedId = ''} = {}) => {
  if (articleBackupReady) return;
  const activeKey=sessionStorage.getItem(`outmax-active:${articleBackupBaseKey()}`) || localStorage.getItem(`outmax-active:${articleBackupBaseKey()}`);
  const initialKey=`${articleBackupBaseKey()}:${openedId || currentId}:${articleBackupTab}`;
  let record=await readArticleBackup(!openedId && activeKey?.startsWith('article:') ? activeKey : initialKey);
  if(!record && !openedId && activeKey)record=await readArticleBackup(activeKey.startsWith('article:') ? activeKey : `${articleBackupBaseKey()}:${activeKey}`);
  if(!record)record=await readArticleBackup(`${articleBackupBaseKey()}:${openedId || currentId}`) || await readArticleBackup(articleBackupBaseKey());
  if(record && !record.dirty){
    try{const latest=await api(`/api/draft/${encodeURIComponent(record.currentId)}`);record={...record,body:latest.body,title:latest.title,products:latest.products,serverRevision:latest.revision,documentId:latest.documentId,pendingSave:null,needsSave:false};}catch{}
  }
  const matchesOpened = !openedId || record?.currentId === openedId || record?.filename === openedId;
  if (record?.body && record.brand === ACTIVE_EDITOR.key && matchesOpened) {
    articleBackupRestoring = true;
    currentId = record.currentId || cleanId(record.filename);
    lockedId = Boolean(record.lockedId);
    $('#page-title').value = record.title || '';
    $('#filename').value = record.filename || currentId;
    $('#filename').disabled = lockedId;
    try {await window.editorPreloadAssets?.(currentId);} catch {}
    setBody(record.body,{normalize:false});
    restoreProducts(record.products || []);
    articleBackupRevision = Number(record.revision) || 0;
    articleBackupDirty = Boolean(record.dirty);
    articleServerRevision = record.serverRevision ?? null;
    articleDocumentId = record.documentId ?? null;
    articleSavedId = currentId;
    articlePendingSave = record.pendingSave || null;
    articleNeedsSave = Boolean(record.needsSave ?? record.dirty);
    articleSaveConflict = Boolean(record.conflict);
    articleBackupRestoring = false;
    resetArticleEditorHistory();
    $('#status').textContent = record.dirty ? 'Восстановлены несохранённые изменения' : 'Восстановлена последняя рабочая версия';
    setArticleBackupStatus('restored',record.savedAt);
  }
  articleBackupReady = true;
  if (articleNeedsSave && !articleSaveConflict) scheduleArticleAutosave();
};

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
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка ${response.status}`);
    error.status = response.status; error.data = data;
    throw error;
  }
  return data;
}

/** Стрелка оглавления — декорация вне редактируемого названия пункта. */
function protectTocArrows() {
  for (const link of canvas.querySelectorAll('.om-toc a[href^="#"]')) {
    if(link.querySelector(':scope > [data-editor-toc-label]'))continue;
    let arrow=[...link.children].reverse().find(node=>node.matches('span') && /^[↓→↗›»➜➔]+$/.test(node.textContent.trim()));
    if(!arrow){
      const walker=document.createTreeWalker(link,NodeFilter.SHOW_TEXT);let text,last;
      while(text=walker.nextNode())if(text.textContent.trim())last=text;
      const match=last?.textContent.match(/\s*([↓→↗›»➜➔])\s*$/);
      if(!match)continue;
      last.textContent=last.textContent.slice(0,match.index);
      arrow=document.createElement('span');arrow.textContent=match[1];link.append(arrow);
    }
    const glyph=arrow.textContent.trim();
    const label=document.createElement('span');label.dataset.editorTocLabel='';label.contentEditable='true';
    for(const node of [...link.childNodes])if(node!==arrow)label.append(node);
    link.insertBefore(label,arrow);link.contentEditable='false';
    arrow.dataset.editorTocArrow=glyph;arrow.textContent='';arrow.contentEditable='false';arrow.setAttribute('aria-hidden','true');
  }
}

/** Возвращает обычный HTML оглавления без служебных полей редактирования. */
function tocExportRestorer(copy) {
  const arrows=[...copy.querySelectorAll('[data-editor-toc-arrow]')].map(node=>[node,node.dataset.editorTocArrow]);
  const labels=[...copy.querySelectorAll('[data-editor-toc-label]')];
  return ()=>{
    for(const [node,glyph] of arrows){node.textContent=glyph;node.removeAttribute('data-editor-toc-arrow');node.removeAttribute('contenteditable');node.parentElement?.removeAttribute('contenteditable');}
    for(const label of labels)label.replaceWith(...label.childNodes);
  };
}

function encodedBody() {
  const copy = canvas.cloneNode(true);
  tocExportRestorer(copy)();
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
  const restoreToc=tocExportRestorer(copy);
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
  restoreToc();
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
  protectTocArrows();
  refreshPreview();
  if (!articleHistoryRestoring) scheduleArticleHistorySnapshot();
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
  if(articleNeedsSave && !articleSavePromise && !articleSaveConflict)$('#status').textContent = 'Есть несохранённые изменения';
}

/** Запоминает выделение как пути к узлам, чтобы вернуть курсор после замены HTML. */
function articleSelectionBookmark() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !canvas.contains(selection.anchorNode) || !canvas.contains(selection.focusNode)) return null;
  const path = node => {
    const result = [];
    while (node && node !== canvas) {
      const parent = node.parentNode;
      if (!parent) return null;
      result.push([...parent.childNodes].indexOf(node));
      node = parent;
    }
    return node === canvas ? result.reverse() : null;
  };
  const anchorPath = path(selection.anchorNode);
  const focusPath = path(selection.focusNode);
  return anchorPath && focusPath ? {
    anchorPath,
    anchorOffset:selection.anchorOffset,
    focusPath,
    focusOffset:selection.focusOffset
  } : null;
}

/** Восстанавливает курсор без автопрокрутки редактора. */
function restoreArticleSelection(bookmark) {
  if (!bookmark) return false;
  const resolve = path => path.reduce((node,index) => node?.childNodes?.[index] || null,canvas);
  const anchor = resolve(bookmark.anchorPath);
  const focus = resolve(bookmark.focusPath);
  if (!anchor || !focus) return false;
  const clamp = (node,offset) => Math.min(Math.max(0,offset || 0),node.nodeType === Node.TEXT_NODE ? (node.nodeValue || '').length : node.childNodes.length);
  const selection = window.getSelection();
  canvas.focus({preventScroll:true});
  try {
    if (typeof selection.setBaseAndExtent === 'function') {
      selection.setBaseAndExtent(anchor,clamp(anchor,bookmark.anchorOffset),focus,clamp(focus,bookmark.focusOffset));
    } else {
      const range = document.createRange();
      range.setStart(anchor,clamp(anchor,bookmark.anchorOffset));
      range.setEnd(focus,clamp(focus,bookmark.focusOffset));
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (selection.rangeCount) lastRange = selection.getRangeAt(0).cloneRange();
    return true;
  } catch { return false; }
}

/** Возвращает полное состояние редактируемой статьи для собственной истории. */
function articleEditorSnapshot() {
  const body = canvas.cloneNode(true);
  body.querySelectorAll('[data-editor-selected],[data-editor-cell-selected]').forEach(element => {
    element.removeAttribute('data-editor-selected');
    element.removeAttribute('data-editor-cell-selected');
  });
  return {
    body:body.innerHTML,
    title:$('#page-title')?.value || '',
    filename:$('#filename')?.value || '',
    currentId,
    lockedId,
    selection:articleSelectionBookmark()
  };
}

/** Обновляет доступность кнопок и показывает размер доступной истории. */
function updateArticleHistoryControls() {
  const undoButton = $('#history-undo');
  const redoButton = $('#history-redo');
  const undoCount = Math.max(0,articleHistoryIndex);
  const redoCount = Math.max(0,articleHistory.length-articleHistoryIndex-1);
  if (undoButton) {
    undoButton.disabled = !undoCount;
    undoButton.title = undoCount ? `Отменить (Ctrl+Z) · доступно шагов: ${undoCount}` : 'Нет действий для отмены (Ctrl+Z)';
  }
  if (redoButton) {
    redoButton.disabled = !redoCount;
    redoButton.title = redoCount ? `Повторить (Ctrl+Y / Ctrl+Shift+Z) · доступно шагов: ${redoCount}` : 'Нет действий для повтора (Ctrl+Y / Ctrl+Shift+Z)';
  }
}

/** Добавляет состояние в историю, удаляя только недоступную ветку повтора. */
function captureArticleHistorySnapshot() {
  if (articleHistoryRestoring) return;
  const state = articleEditorSnapshot();
  const {selection:keySelection,...keyState} = state;
  const key = JSON.stringify(keyState);
  if (articleHistory[articleHistoryIndex]?.key === key) {
    updateArticleHistoryControls();
    return;
  }
  if (articleHistoryIndex < articleHistory.length-1) articleHistory.splice(articleHistoryIndex+1);
  articleHistory.push({key,state});
  if (articleHistory.length > ARTICLE_HISTORY_LIMIT) articleHistory.splice(0,articleHistory.length-ARTICLE_HISTORY_LIMIT);
  articleHistoryIndex = articleHistory.length-1;
  updateArticleHistoryControls();
}

/** Объединяет непрерывный ввод текста в один понятный шаг истории. */
function scheduleArticleHistorySnapshot() {
  if (articleHistoryRestoring) return;
  clearTimeout(articleHistoryTimer);
  articleHistoryTimer = setTimeout(() => {
    articleHistoryTimer = null;
    captureArticleHistorySnapshot();
  },ARTICLE_HISTORY_DELAY);
}

function flushArticleHistorySnapshot() {
  if (!articleHistoryTimer) return;
  clearTimeout(articleHistoryTimer);
  articleHistoryTimer = null;
  captureArticleHistorySnapshot();
}

/** Начинает отдельную историю для открытого документа. */
function resetArticleEditorHistory() {
  clearTimeout(articleHistoryTimer);
  articleHistoryTimer = null;
  articleHistory = [];
  articleHistoryIndex = -1;
  captureArticleHistorySnapshot();
}

/** Восстанавливает HTML и метаданные без создания лишнего шага истории. */
function restoreArticleHistorySnapshot(entry) {
  if (!entry) return;
  const scrollPosition = {
    windowX:window.scrollX,
    windowY:window.scrollY,
    canvasLeft:canvas.scrollLeft,
    canvasTop:canvas.scrollTop
  };
  articleHistoryRestoring = true;
  clearTimeout(updateTimer);
  lastRange = null;
  currentId = entry.state.currentId || cleanId(entry.state.filename);
  lockedId = !!entry.state.lockedId;
  $('#page-title').value = entry.state.title;
  $('#filename').value = entry.state.filename;
  $('#filename').disabled = lockedId;
  setBody(entry.state.body,{normalize:false});
  restoreArticleSelection(entry.state.selection);
  canvas.scrollLeft = scrollPosition.canvasLeft;
  canvas.scrollTop = scrollPosition.canvasTop;
  requestAnimationFrame(() => {
    canvas.scrollLeft = scrollPosition.canvasLeft;
    canvas.scrollTop = scrollPosition.canvasTop;
    window.scrollTo(scrollPosition.windowX,scrollPosition.windowY);
  });
  articleHistoryRestoring = false;
  $('#status').textContent = 'Есть несохранённые изменения';
  scheduleArticleBackup();
  articleNeedsSave=true;scheduleArticleAutosave();
  updateArticleHistoryControls();
}

/** Сохраняет точку ввода в предыдущем шаге до того, как DOM изменится. */
function rememberArticleSelectionBeforeInput() {
  if (articleHistoryRestoring || articleHistoryTimer || articleHistoryIndex < 0) return;
  articleHistory[articleHistoryIndex].state.selection = articleSelectionBookmark();
}

function undoArticleEditor() {
  flushArticleHistorySnapshot();
  if (articleHistoryIndex <= 0) return updateArticleHistoryControls();
  articleHistoryIndex -= 1;
  restoreArticleHistorySnapshot(articleHistory[articleHistoryIndex]);
}

function redoArticleEditor() {
  flushArticleHistorySnapshot();
  if (articleHistoryIndex >= articleHistory.length-1) return updateArticleHistoryControls();
  articleHistoryIndex += 1;
  restoreArticleHistorySnapshot(articleHistory[articleHistoryIndex]);
}

function changed({coalesce = false} = {}) {
  protectTocArrows();
  if (coalesce) scheduleArticleHistorySnapshot();
  else {
    clearTimeout(articleHistoryTimer);
    articleHistoryTimer = null;
    captureArticleHistorySnapshot();
  }
  clearTimeout(updateTimer);
  updateTimer = setTimeout(refreshPreview, 280);
  scheduleArticleBackup();
  articleNeedsSave = true;
  scheduleArticleAutosave();
}

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (selection.rangeCount && canvas.contains(selection.anchorNode)) {
    lastRange = selection.getRangeAt(0).cloneRange();
    syncTextToolbarState(selection);
  }
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

const textCommands = new Set(['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList','indent','outdent','justifyLeft','justifyCenter','justifyRight','unlink','removeFormat']);

function textBlockStyle(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const block = element?.closest('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,th,td');
  if (!block || !canvas.contains(block)) return '';
  if (block.matches('p.om-h7')) return 'h7';
  return /^H[1-6]$/.test(block.tagName) ? block.tagName.toLowerCase() : 'p';
}

/** Показывает реальный стиль и размер текста под курсором или у выделения. */
function syncTextToolbarState(selection = window.getSelection()) {
  if (!selection?.rangeCount || !canvas.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  const startStyle = textBlockStyle(range.startContainer);
  const endStyle = textBlockStyle(range.endContainer);
  const mixed = !selection.isCollapsed && startStyle !== endStyle;
  const stylePicker = $('#heading-style');
  stylePicker.options[0].textContent = mixed ? 'Смешанный стиль' : 'Стиль текста';
  stylePicker.value = mixed ? '' : startStyle;
  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
  const textElement = anchor && anchor !== canvas ? anchor : anchor?.closest('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,th,td');
  const fontPicker = $('#font-size');
  const fontSize = textElement ? Math.round(parseFloat(getComputedStyle(textElement).fontSize)) : 0;
  const exactSize = [...fontPicker.options].some(option => option.value === String(fontSize));
  fontPicker.options[0].textContent = fontSize ? `${fontSize} px` : 'Размер';
  fontPicker.value = exactSize ? String(fontSize) : '';
  document.querySelectorAll('[data-command]').forEach(button => {
    const command = button.dataset.command;
    if (!['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'].includes(command)) return;
    let active = false;
    try { active = document.queryCommandState(command); } catch (_) {}
    button.setAttribute('aria-pressed', String(active));
  });
}

canvas.addEventListener('pointerup', () => requestAnimationFrame(() => syncTextToolbarState()));
canvas.addEventListener('keyup', () => syncTextToolbarState());
$('.toolstrip').addEventListener('mousedown', event => {
  if (event.target.closest('button')) event.preventDefault();
});
$('#history-undo')?.addEventListener('click', undoArticleEditor);
$('#history-redo')?.addEventListener('click', redoArticleEditor);
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
  syncTextToolbarState(selection);
});

/** Возвращает выделение текста на холст после работы с контролами панели. */
function restoreCanvasSelection() {
  if (!lastRange || !canvas.contains(lastRange.commonAncestorContainer)) return null;
  canvas.focus({preventScroll:true});
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(lastRange);
  return selection;
}

/** Применяет точный размер в пикселях к выделению или текущему текстовому блоку. */
$('#font-size')?.addEventListener('change', event => {
  const picker = event.target;
  const size = Number(picker.value);
  const selection = restoreCanvasSelection();
  if (!selection || !size) return toast('Выделите текст или поставьте курсор в абзац', true);
  if (selection.isCollapsed) {
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const block = anchor?.closest('p,li,h1,h2,h3,h4,h5,h6,figcaption,th,td');
    if (!block || !canvas.contains(block)) return toast('Поставьте курсор в текстовый блок', true);
    block.style.fontSize = `${size}px`;
  } else {
    const existing = new Set(canvas.querySelectorAll('font[size="7"]'));
    document.execCommand('fontSize', false, '7');
    for (const font of canvas.querySelectorAll('font[size="7"]')) {
      if (existing.has(font)) continue;
      const span = document.createElement('span');
      span.style.fontSize = `${size}px`;
      span.append(...font.childNodes);
      font.replaceWith(span);
    }
  }
  changed();
  syncTextToolbarState(selection);
  toast(`Размер текста: ${size} px`);
});

function applyTextColor(command, value) {
  const selection = restoreCanvasSelection();
  if (!selection) return toast('Выделите текст или поставьте курсор в нужное место', true);
  document.execCommand(command, false, value);
  changed();
}

$('#text-color')?.addEventListener('input', event => applyTextColor('foreColor', event.target.value));
$('#highlight-color')?.addEventListener('input', event => applyTextColor('hiliteColor', event.target.value));
$('#toolbar-image')?.addEventListener('click', () => $('#image-file').click());

$('#spellcheck-toggle')?.addEventListener('click', event => {
  const button = event.currentTarget;
  const enabled = canvas.spellcheck !== true;
  canvas.spellcheck = enabled;
  canvas.setAttribute('spellcheck', String(enabled));
  button.setAttribute('aria-pressed', String(enabled));
  button.title = `Проверка орфографии ${enabled ? 'включена' : 'выключена'}`;
  button.querySelector('span').textContent = enabled ? '✓' : '×';
  canvas.focus({preventScroll:true});
  toast(enabled ? 'Проверка орфографии включена. Исправления доступны по правому клику.' : 'Проверка орфографии выключена');
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
try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) {}
canvas.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !canvas.contains(selection.anchorNode)) return;
  event.preventDefault();
  const command = event.shiftKey ? 'insertLineBreak' : 'insertParagraph';
  let applied = false;
  try { applied = document.execCommand(command, false); } catch (_) {}
  if (!applied) document.execCommand('insertHTML', false, event.shiftKey ? '<br>' : '<p><br></p>');
  canvas.dispatchEvent(new Event('input', {bubbles:true}));
  requestAnimationFrame(() => syncTextToolbarState());
});
canvas.addEventListener('beforeinput', rememberArticleSelectionBeforeInput);
canvas.addEventListener('input', () => changed({coalesce:true}));
source.addEventListener('input', () => {setBody(source.value);scheduleArticleBackup();});
document.addEventListener('pointerdown', () => flushArticleHistorySnapshot(), true);
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if(key==='a' && !event.shiftKey && canvas.contains(event.target)){
    const selection=getSelection();const anchor=selection?.anchorNode;
    const label=(anchor?.nodeType===Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest('[data-editor-toc-label]');
    if(label && canvas.contains(label)){
      event.preventDefault();const range=document.createRange();range.selectNodeContents(label);
      selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();return;
    }
  }
  if (key === 's' && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) save().catch(error => toast(error.message,true));
    return;
  }
  const undo = key === 'z' && !event.shiftKey;
  const redo = key === 'y' || (key === 'z' && event.shiftKey);
  if (!undo && !redo) return;
  const target = event.target;
  const nativeField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (nativeField && !canvas.contains(target)) return;
  event.preventDefault();
  if (undo) undoArticleEditor(); else redoArticleEditor();
});

/** Возвращает доступные в текущей статье якоря с понятными подписями. */
function articleAnchors() {
  return [...canvas.querySelectorAll('[id]')].map(element => ({
    id: element.id,
    label: element.querySelector('h1,h2,h3')?.textContent.trim() || element.textContent.trim().slice(0, 60) || element.id,
  }));
}

let editingButtonGroup = null;
let buttonInsertionCell = null;
let buttonItemCounter = 0;
let buttonDialogAnchors = [];

/** Возвращает варианты кнопок в стиле текущего редактора. */
function buttonVariantChoices() {
  return ACTIVE_EDITOR.key === 'hasl'
    ? [{value:'lime', label:'Лаймовая'}, {value:'black', label:'Чёрная'}, {value:'outline', label:'Белая'}]
    : [{value:'red', label:'Красная'}, {value:'black', label:'Чёрная'}, {value:'outline', label:'Белая'}];
}

function buttonAnchorOptions(selected = '') {
  if (!buttonDialogAnchors.length) return '<option value="" disabled selected>Сначала добавьте раздел с якорем</option>';
  return buttonDialogAnchors.map(anchor => `<option value="${escapeHtml(anchor.id)}"${anchor.id === selected ? ' selected' : ''}>${escapeHtml(anchor.label)} (#${escapeHtml(anchor.id)})</option>`).join('');
}

/** Переключает ссылку и якорь только у выбранной карточки кнопки. */
function syncButtonItemLinkFields(item) {
  const isAnchor = item.querySelector('[data-field="link-kind"]:checked')?.value === 'anchor';
  const urlField = item.querySelector('[data-field="url-field"]');
  const anchorField = item.querySelector('[data-field="anchor-field"]');
  const urlInput = item.querySelector('[data-field="url"]');
  const anchorInput = item.querySelector('[data-field="anchor"]');
  const newWindow = item.querySelector('[data-field="new-window"]');
  urlField.hidden = isAnchor;
  anchorField.hidden = !isAnchor;
  urlInput.required = !isAnchor;
  anchorInput.required = isAnchor;
  newWindow.disabled = isAnchor;
  if (isAnchor) newWindow.checked = false;
}

function updateButtonItemNumbers() {
  const items = [...$('#button-items').querySelectorAll('.button-item')];
  items.forEach((item, index) => {
    item.querySelector('[data-button-item-title]').textContent = `Кнопка ${index + 1}`;
    item.querySelector('.button-item-remove').disabled = items.length === 1;
  });
}

/** Добавляет независимую карточку настройки кнопки в диалог. */
function addButtonEditorItem(data = {}) {
  const uid = ++buttonItemCounter;
  const href = data.href || '';
  const isAnchor = href.startsWith('#');
  const variants = buttonVariantChoices();
  const fallbackVariant = ACTIVE_EDITOR.key === 'hasl' ? 'lime' : 'red';
  const variant = variants.some(item => item.value === data.variant) ? data.variant : fallbackVariant;
  const item = document.createElement('section');
  item.className = 'button-item';
  item.innerHTML = `
    <div class="button-item-head"><strong data-button-item-title></strong><button class="button-item-remove" type="button" aria-label="Удалить кнопку">Удалить</button></div>
    <div class="button-controls">
      <label>Текст кнопки<input data-field="text" type="text" value="${escapeHtml(data.text ?? 'Подробнее')}" required></label>
      <fieldset><legend>Стиль</legend><div class="button-variants">${variants.map(option => `<label><input type="radio" name="button-variant-${uid}" value="${option.value}"${option.value === variant ? ' checked' : ''}><span class="variant-preview ${option.value}">${option.label}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Куда ведёт кнопка</legend><div class="link-kind"><label><input data-field="link-kind" type="radio" name="button-link-kind-${uid}" value="url"${isAnchor ? '' : ' checked'}> Ссылка</label><label><input data-field="link-kind" type="radio" name="button-link-kind-${uid}" value="anchor"${isAnchor ? ' checked' : ''}> Якорь в статье</label></div></fieldset>
      <label data-field="url-field">Ссылка<input data-field="url" type="url" value="${escapeHtml(isAnchor ? '' : href)}" placeholder="https://example.com" spellcheck="false"></label>
      <label data-field="anchor-field" hidden>Якорь<select data-field="anchor">${buttonAnchorOptions(isAnchor ? href.slice(1) : '')}</select></label>
      <label class="checkbox-row"><input data-field="new-window" type="checkbox"${data.newWindow === false ? '' : ' checked'}> Открывать ссылку в новом окне</label>
    </div>`;
  $('#button-items').append(item);
  item.querySelectorAll('[data-field="link-kind"]').forEach(input => input.addEventListener('change', () => syncButtonItemLinkFields(item)));
  item.querySelector('.button-item-remove').addEventListener('click', () => {
    item.remove();
    updateButtonItemNumbers();
  });
  syncButtonItemLinkFields(item);
  updateButtonItemNumbers();
  return item;
}

/** Открывает редактор всей группы кнопок, сохраняя отдельные параметры каждой. */
function openButtonDialog(link = null, targetCell = null) {
  buttonDialogAnchors = articleAnchors();
  buttonItemCounter = 0;
  $('#button-items').replaceChildren();
  editingButtonGroup = link && canvas.contains(link) ? link.closest('.om-cta,.om-actions') : null;
  buttonInsertionCell = targetCell?.matches?.('th,td') && canvas.contains(targetCell) ? targetCell : null;
  $('#button-dialog-title').textContent = editingButtonGroup ? 'Настроить кнопки' : buttonInsertionCell ? 'Добавить кнопки в ячейку' : 'Добавить кнопки';
  $('#button-submit').textContent = editingButtonGroup ? 'Сохранить изменения' : 'Добавить кнопки';
  const existingLinks = editingButtonGroup ? [...editingButtonGroup.querySelectorAll(':scope > a[href]')] : [];
  if (existingLinks.length) {
    existingLinks.forEach(existingLink => addButtonEditorItem({
      text: existingLink.textContent.trim(),
      href: existingLink.getAttribute('href') || '',
      variant: [...existingLink.classList].find(value => /^om-button--/.test(value))?.replace('om-button--', ''),
      newWindow: existingLink.target === '_blank',
    }));
  } else addButtonEditorItem({text:'Подробнее'});
  $('#button-dialog').showModal();
  $('#button-items [data-field="text"]').focus();
}

$('#add-button').addEventListener('click', () => openButtonDialog());
$('#button-add-item').addEventListener('click', () => addButtonEditorItem({text:'Подробнее'}).querySelector('[data-field="text"]').focus());
$('#button-close').addEventListener('click', () => $('#button-dialog').close());
$('#button-cancel').addEventListener('click', () => $('#button-dialog').close());
$('#button-dialog').addEventListener('click', event => {if (event.target === $('#button-dialog')) $('#button-dialog').close();});
$('#button-form').addEventListener('submit', event => {
  event.preventDefault();
  const configs = [];
  for (const [index, item] of [...$('#button-items').querySelectorAll('.button-item')].entries()) {
    const text = item.querySelector('[data-field="text"]').value.trim();
    const variant = item.querySelector('[name^="button-variant-"]:checked').value;
    const isAnchor = item.querySelector('[data-field="link-kind"]:checked').value === 'anchor';
    const anchor = item.querySelector('[data-field="anchor"]').value;
    const href = isAnchor ? `#${anchor}` : item.querySelector('[data-field="url"]').value.trim();
    if (!text) return toast(`Кнопка ${index + 1}: введите текст`, true);
    if (isAnchor && !anchor) return toast(`Кнопка ${index + 1}: в статье пока нет доступных якорей`, true);
    if (!isAnchor && !/^https?:\/\//i.test(href)) return toast(`Кнопка ${index + 1}: укажите полную ссылку, начиная с http:// или https://`, true);
    configs.push({text, variant, href, isAnchor, newWindow: item.querySelector('[data-field="new-window"]').checked});
  }
  const linksMarkup = configs.map(config => {
    const newWindow = !config.isAnchor && config.newWindow ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="om-button om-button--${config.variant}" href="${escapeHtml(config.href)}"${newWindow}>${escapeHtml(config.text)}</a>`;
  }).join('');
  const wasEditing = Boolean(editingButtonGroup);
  if (editingButtonGroup) {
    editingButtonGroup.innerHTML = linksMarkup;
    changed();
  } else {
    const markup = `<div class="om-cta${buttonInsertionCell ? ' om-cta--cell' : ''}">${linksMarkup}</div>`;
    if (buttonInsertionCell && canvas.contains(buttonInsertionCell)) {
      buttonInsertionCell.insertAdjacentHTML('beforeend', markup);
      changed();
    } else insertBlock(markup);
  }
  $('#button-dialog').close();
  toast(wasEditing ? 'Кнопки обновлены' : 'Кнопки добавлены');
  editingButtonGroup = null;
  buttonInsertionCell = null;
});

$('#add-paragraph')?.addEventListener('click', () => {
  const markup = '<p><br></p>';
  let paragraph;
  if (insertionLocked || caretRangeInsideCanvas()) {
    paragraph = insertMediaAtCaret(markup);
  } else {
    const section = [...canvas.querySelectorAll(':scope > section.om-section, :scope > section')].at(-1);
    paragraph = section ? insertBlockAt(markup, null, section) : insertBlock(markup);
  }
  if (paragraph && typeof focusNewParagraph === 'function') focusNewParagraph(paragraph);
});

$('#add-note').addEventListener('click', () => insertBlock('<aside class="om-callout"><p class="om-callout-title">ВАЖНО</p><p>Добавьте пояснение, промокод, предупреждение или другой акцентный текст.</p></aside>'));

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

function productSizesMarkup(product) {
  if (!Array.isArray(product.sizes) || !product.sizes.length) return '';
  const items = product.sizes.map(size => {
    const name = typeof size === 'object' ? size.name : size;
    let hint = typeof size === 'object' ? String(size.hint || '').trim() : '';
    hint = hint.replace(/^длина\s+(?:стельки|стопы)\s*[-—:]?\s*/i, '').replace(/\.$/, '');
    if (/^\d+(?:[.,]\d+)?$/i.test(hint)) hint = `${hint.replace('.', ',')} см`;
    return `<span><b>${escapeHtml(name)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>`;
  }).join('');
  return `<div class="om-sizes"><strong>Доступные размеры</strong><div>${items}</div></div>`;
}

function productPriceMarkup(product) {
  if (!Number(product.price || 0)) return '';
  const money = value => Number(value || 0).toLocaleString('ru-RU') + ' ₽';
  const oldPrice = Number(product.oldPrice || 0) > Number(product.price || 0)
    ? `<del class="om-price-old">${money(product.oldPrice)}</del>` : '';
  return `<div class="om-price"><span class="om-price-amounts">${oldPrice}<strong class="om-price-current">${money(product.price)}</strong></span></div>`;
}

function productDetailsMarkup(product) {
  if ($('#product-description')?.checked === false) return '';
  const list = (items, heading, className) => Array.isArray(items) && items.length
    ? `<div class="${className}"><strong>${heading}</strong><ul>${items.map(item => `<li>${escapeHtml(typeof item === 'string' ? item : `${item.name || ''}: ${item.value || ''}`)}</li>`).join('')}</ul></div>` : '';
  const description = String(product.descriptionHtml || '').trim();
  const hasStructuredDetails = (Array.isArray(product.properties) && product.properties.length) || (Array.isArray(product.details) && product.details.length);
  const legacyProperties = hasStructuredDetails ? product.properties : product.features;
  return `${description ? `<div class="om-product-description"><strong>Описание</strong><div>${description}</div></div>` : ''}${list(legacyProperties, 'Свойства', 'om-product-properties')}${list(product.details, 'Детали', 'om-product-details')}`;
}

function productMarkup(product) {
  const title = escapeHtml(product.title);
  const url = escapeHtml(product.url);
  const images = Array.isArray(product.images) ? product.images : [];
  const featuresList = Array.isArray(product.features) ? product.features : [];
  const gallery = images.map((src, index) => `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title}, фото ${index+1}"><img src="${escapeHtml(src)}" alt="${title}, фото ${index+1}" loading="lazy" decoding="async" style="width:100%;aspect-ratio:1 / 1;object-fit:cover;object-position:50% 50%;margin-left:auto;margin-right:auto"></a>`).join('');
  const features = featuresList.length ? `<p><strong>Подтверждённые свойства</strong></p><ul>${featuresList.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>` : '';
  const sizes = productSizesMarkup(product);
  const details = productDetailsMarkup(product);
  const price = productPriceMarkup(product);
  if (ACTIVE_EDITOR.key === 'hasl') {
    let catalogUrl = product.url;
    try {
      const parsed = new URL(product.url);
      parsed.pathname = parsed.pathname.replace(/\/[^/]+\/?$/, '/');
      parsed.search = '';
      parsed.hash = '';
      catalogUrl = parsed.href;
    } catch (_) {}
    const badgeText = Array.isArray(product.labels) && product.labels.length ? product.labels[0] : (product.inStock ? 'В наличии' : 'Выбор ХАСЛ');
    const badge = `<span class="om-product-badge">${escapeHtml(badgeText)}</span>`;
    return `<article class="om-product om-product--hasl" id="product-${escapeHtml(product.sku)}" data-sku="${escapeHtml(product.sku)}" data-full-review="1">${badge}<div class="om-sku">Арт. ${escapeHtml(product.sku)}</div><h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title} →</a></h3>${gallery ? `<div class="om-gallery" data-gallery="1" aria-label="Галерея товара — ${title}">${gallery}</div><p class="om-gallery-hint">← Галерею можно листать пальцем →</p>` : '<p class="om-hint">Фотографии не удалось получить — добавьте их вручную.</p>'}<p class="om-product-summary"><strong>Кратко:</strong> добавьте короткое описание роли этой модели в подборке.</p><p class="om-product-copy"><strong>Кому подойдёт</strong>Допишите рекомендацию для читателя.</p>${details}<p class="om-product-copy"><strong>Что учесть</strong>Допишите ограничения, посадку и особенности модели.</p>${price}${sizes}<div class="om-actions" data-cta-pair="1"><a class="om-button om-button--lime" href="${url}" target="_blank" rel="noopener noreferrer">Смотреть модель →</a><a class="om-button om-button--black" href="${escapeHtml(catalogUrl)}" target="_blank" rel="noopener noreferrer">Смотреть все модели →</a></div></article>`;
  }
  return `<article class="om-product" id="product-${escapeHtml(product.sku)}"><p class="om-sku">Артикул ${escapeHtml(product.sku)}</p><h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title} →</a></h3>${gallery ? `<div class="om-gallery" aria-label="Фотографии товара">${gallery}</div>` : '<p class="om-hint">Фотографии не удалось получить — добавьте их вручную.</p>'}<p><strong>Кому подойдёт</strong>Допишите рекомендацию для читателя.</p>${details || features}<p><strong>Что учесть</strong>Допишите ограничения и особенности модели.</p>${price}${sizes}<div class="om-actions"><a class="om-button om-button--red" href="${url}" target="_blank" rel="noopener noreferrer">Смотреть модель</a></div></article>`;
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

function articleHasDefaultTitle() {
  const title = $('#page-title').value.trim();
  return !title || title === `Новая статья — ${ACTIVE_EDITOR.name}`;
}

function requestArticleTitle() {
  if (!articleHasDefaultTitle()) return Promise.resolve(true);
  if (articleTitlePromptPromise) return articleTitlePromptPromise;
  articleTitlePromptPromise = new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'account-confirm article-title-dialog';
    dialog.setAttribute('aria-labelledby','article-title-dialog-heading');
    dialog.innerHTML = `<form method="dialog"><span class="article-title-dialog-kicker">ПЕРЕД СОХРАНЕНИЕМ</span><h2 id="article-title-dialog-heading">Назовите статью</h2><p>Сейчас используется стандартное название. Впишите понятное название, чтобы потом быстро найти статью, или сохраните как есть.</p><label for="article-title-dialog-input">Название статьи<input id="article-title-dialog-input" type="text" placeholder="Например, Как выбрать кроссовки для осени" autocomplete="off"></label><p class="article-title-dialog-error" hidden>Введите название или выберите «Сохранить как есть».</p><div class="dialog-actions"><button type="button" data-title-action="default">Сохранить как есть</button><button type="submit" class="primary">Сохранить с названием</button></div></form>`;
    document.body.append(dialog);
    const input = dialog.querySelector('input');
    const error = dialog.querySelector('.article-title-dialog-error');
    let completed = false;
    const finish = value => {
      if (completed) return;
      completed = true;
      dialog.close();
      articleTitlePromptPromise = null;
      resolve(value);
    };
    dialog.querySelector('[data-title-action="default"]').onclick = () => finish(true);
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {error.hidden=false;input.focus();return;}
      $('#page-title').value = title;
      changed({coalesce:true});
      finish(true);
    };
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    dialog.addEventListener('click',event=>{if(event.target===dialog)finish(false);});
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.showModal();
    requestAnimationFrame(()=>input.focus());
  });
  return articleTitlePromptPromise;
}

function setArticleSaveDocument(draft = {}) {
  articleSaveEpoch++; clearTimeout(articleAutosaveTimer); articleSavePromise=null;
  articleServerRevision=draft.revision ?? null;articleDocumentId=draft.documentId ?? null;
  articleSavedId=currentId;articlePendingSave=null;articleSaveConflict=false;articleNeedsSave=false;
}
window.setArticleSaveDocument=setArticleSaveDocument;
function scheduleArticleAutosave(delay=1800) {
  clearTimeout(articleAutosaveTimer);
  if (!articleBackupReady || articleBackupRestoring || articleSaveConflict) return;
  articleAutosaveTimer=setTimeout(()=>{if(articleNeedsSave)save({automatic:true}).catch(()=>{});},delay);
}
function showArticleSaveConflict(server) {
  if(document.querySelector('#article-save-conflict'))return;
  const box=document.createElement('dialog');box.id='article-save-conflict';box.className='account-confirm';
  box.setAttribute('aria-labelledby','article-save-conflict-title');
  box.innerHTML='<h2 id="article-save-conflict-title">Статья уже изменена</h2><p>Ваши правки сохранены на этом устройстве. Сохраните их отдельной копией. Перед открытием серверной версии локальный текст будет скачан в JSON.</p><div class="dialog-actions"><button data-action="local">Продолжить локально</button><button data-action="server">Открыть серверную версию</button><button data-action="copy" class="primary">Сохранить копию</button></div>';
  document.body.append(box);box.addEventListener('close',()=>box.remove());
  box.querySelector('[data-action="local"]').onclick=()=>box.close();
  box.querySelector('[data-action="copy"]').onclick=async()=>{
    currentId=cleanId(`${currentId.slice(0,40)}-copy-${crypto.randomUUID().slice(0,8)}`);
    $('#filename').value=currentId;lockedId=false;$('#filename').disabled=false;
    setArticleSaveDocument();articleNeedsSave=true;box.close();await persistArticleBackup(true);
    save().catch(error=>toast(error.message,true));
  };
  const open=box.querySelector('[data-action="server"]');open.disabled=!server;
  open.onclick=async()=>{try{
    const backup=articleBackupSnapshot(true);const copyId=cleanId(`${currentId.slice(0,40)}-conflict-${crypto.randomUUID().slice(0,8)}`);
    await writeArticleBackup({...backup,key:`${articleBackupBaseKey()}:${copyId}`,currentId:copyId,filename:copyId,serverRevision:null,documentId:null,pendingSave:null,conflict:false});
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=copyId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    const latest=await api(`/api/draft/${encodeURIComponent(currentId)}`);
    setArticleSaveDocument(latest);$('#page-title').value=latest.title;setBody(latest.body);restoreProducts(latest.products || []);
    resetArticleEditorHistory();await window.markArticleBackupSynced({force:true});$('#status').textContent='Открыта серверная версия';box.close();
  }catch(error){toast(error.message,true);}};
  box.showModal();
}
async function save({automatic=false} = {}) {
  if(!automatic && articleSaveConflict){showArticleSaveConflict(await api(`/api/draft/${encodeURIComponent(currentId)}`).catch(()=>null));return null;}
  if(automatic && (!articleNeedsSave || articleSaveConflict || (!articleDocumentId && articleHasDefaultTitle())))return null;
  if(!automatic && !await requestArticleTitle())return null;
  if(articleSavePromise){await articleSavePromise;return articleNeedsSave ? save({automatic}) : {id:currentId};}
  lockId();if(articleSavedId!==currentId)setArticleSaveDocument();
  const epoch=articleSaveEpoch;clearTimeout(articleAutosaveTimer);
  const operation=(async()=>{let result;do{
    if(!articlePendingSave)articlePendingSave={payload:{id:currentId,title:$('#page-title').value.trim() || `Статья ${ACTIVE_EDITOR.name}`,body:adminBody(),products:JSON.parse(JSON.stringify(productLibrary)),expectedRevision:articleServerRevision,documentId:articleDocumentId,requestId:crypto.randomUUID(),automatic},localRevision:articleBackupRevision};
    const pending=articlePendingSave;articleNeedsSave=true;
    if(await persistArticleBackup(true)===false){$('#status').textContent='Локальная копия не сохранена · повторите сохранение';throw new Error('Не удалось сохранить локальную копию. Проверьте свободное место и повторите сохранение.');}
    clearTimeout(updateTimer);$('#status').textContent='Сохраняю статью…';
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
    try{result=await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.payload),signal:controller.signal});}
    catch(error){if(epoch!==articleSaveEpoch)throw error;
      if(error.status===409){articleSaveConflict=true;articlePendingSave=null;$('#status').textContent='Конфликт · правки сохранены локально';await persistArticleBackup(true);showArticleSaveConflict(error.data.current);}
      else{ $('#status').textContent=error.status===401 ? 'Войдите снова · правки сохранены локально' : 'Нет подтверждения сервера · правки сохранены локально';await persistArticleBackup(true);if(!error.status || error.status>=500)scheduleArticleAutosave(10000);}
      throw error;
    }finally{clearTimeout(timeout);}
    if(epoch!==articleSaveEpoch)return result;
    articleServerRevision=result.revision;articleDocumentId=result.documentId;articlePendingSave=null;
    articleNeedsSave=pending.localRevision!==articleBackupRevision;
    $('#status').textContent=articleNeedsSave ? 'Есть несохранённые изменения' : `${result.browserStorage ? 'Сохранено в браузере' : 'Сохранено на сервере'} ${new Date(result.savedAt).toLocaleTimeString('ru-RU')}`;
    await window.markArticleBackupSynced({revision:pending.localRevision});
  }while(articleNeedsSave && epoch===articleSaveEpoch);
  listDrafts().catch(()=>{});if(!automatic)toast(result.browserStorage ? 'Статья сохранена в этом браузере.' : 'Статья сохранена на сервере.');return result;})();
  articleSavePromise=operation;try{return await operation;}finally{if(epoch===articleSaveEpoch)articleSavePromise=null;}
}
window.addEventListener('online',()=>{if(articleNeedsSave)scheduleArticleAutosave(100);});

const articleHistoryButton=document.createElement('button');
articleHistoryButton.id='article-version-history';articleHistoryButton.type='button';articleHistoryButton.className='wide';articleHistoryButton.textContent='История версий';
$('#open-article-folder').after(articleHistoryButton);
articleHistoryButton.onclick=async()=>{
  try{
    if(articleNeedsSave && !articleSaveConflict){if(!await save())return;}
    if(!articleDocumentId){toast('Сначала сохраните статью.',true);return;}
    const openedId=currentId,openedEpoch=articleSaveEpoch;
    const compared=await api(`/api/draft/${encodeURIComponent(openedId)}/history/${encodeURIComponent(articleServerRevision)}`);
    const box=document.createElement('dialog');box.className='article-versions-dialog';
    box.setAttribute('aria-labelledby','article-versions-title');
    box.innerHTML='<header><div><h2 id="article-versions-title">История версий</h2><p>Сравнение с текущим текстом редактора</p></div><button type="button" aria-label="Закрыть историю">×</button></header><div class="article-versions-layout"><aside aria-label="Сохранённые версии"><div class="version-list"></div><button class="version-more" hidden>Показать ещё</button></aside><main><p class="version-details" role="status">Загрузка…</p><div class="version-comparison"><section><h3>Выбранная версия</h3><pre class="version-old"></pre></section><section><h3>Текущий текст</h3><pre class="version-current"></pre></section></div><p class="version-products"></p><div class="dialog-actions"><button class="version-restore primary" disabled>Восстановить как новую версию</button></div></main></div>';
    document.body.append(box);box.querySelector('header button').onclick=()=>box.close();box.addEventListener('close',()=>box.remove());box.showModal();
    const list=box.querySelector('.version-list'),details=box.querySelector('.version-details'),restore=box.querySelector('.version-restore');
    let next=null,selection=0,selected=null,restoreRequest=null;
    const lines=html=>{const doc=new DOMParser().parseFromString(String(html).replace(/<\/(p|h[1-6]|li|tr|section|article)>/gi,'</$1>\n'),'text/html');doc.querySelectorAll('script,style').forEach(n=>n.remove());return doc.body.textContent.split('\n').map(s=>s.trim()).filter(Boolean);};
    function comparison(old,current){
      let prefix=0,suffix=0;while(prefix<old.length && prefix<current.length && old[prefix]===current[prefix])prefix++;
      while(suffix<old.length-prefix && suffix<current.length-prefix && old[old.length-1-suffix]===current[current.length-1-suffix])suffix++;
      for(const [name,text,tag] of [['.version-old',old,'del'],['.version-current',current,'ins']]){
        const node=box.querySelector(name);node.replaceChildren();text.forEach((line,index)=>{const row=document.createElement(index>=prefix && index<text.length-suffix ? tag : 'span');row.textContent=line+'\n';node.append(row);});
      }
    }
    async function choose(item,button){
      const seq=++selection;restore.disabled=true;details.textContent='Загрузка версии…';
      try{
        const snapshot=await api(`/api/draft/${encodeURIComponent(openedId)}/history/${encodeURIComponent(item.revision)}`);
        if(seq!==selection || !box.isConnected)return;
        selected=snapshot;restoreRequest=null;
        list.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));
        comparison(lines(snapshot.body),lines(adminBody()));
        const titleChanged=snapshot.title!==$('#page-title').value;
        const images=html=>[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('img')].map(n=>[n.getAttribute('src'),n.getAttribute('alt')]);
        const mediaChanged=JSON.stringify(images(snapshot.body))!==JSON.stringify(images(compared.body));
        const layoutChanged=snapshot.body!==compared.body && lines(snapshot.body).join('\n')===lines(compared.body).join('\n');
        details.textContent=`${snapshot.savedBy?.name || 'Автор не указан'} · ${snapshot.saveKind==='restore' ? 'Восстановление' : snapshot.saveKind==='automatic' ? 'Автосохранение' : 'Сохранение'}${titleChanged ? ' · Название отличается: '+snapshot.title : ''}${mediaChanged ? ' · Изображения отличаются' : ''}${layoutChanged ? ' · HTML/оформление отличаются' : ''}${snapshot.unfrozenImages?.length ? ' · Часть изображений хранится по внешним или недоступным адресам' : ''}`;
        const products=box.querySelector('.version-products');products.textContent='Товарные данные';
        const oldProducts=document.createElement('pre'),newProducts=document.createElement('pre');
        oldProducts.textContent=JSON.stringify(snapshot.products || [],null,2);newProducts.textContent=JSON.stringify(compared.products || [],null,2);
        const group=document.createElement('details'),summary=document.createElement('summary');summary.textContent=oldProducts.textContent===newProducts.textContent ? 'Товары без изменений' : 'Показать различия в товарах';group.append(summary,oldProducts,newProducts);products.append(group);
        restore.disabled=snapshot.revision===articleServerRevision || articleSaveConflict;
      }catch(error){if(seq===selection)details.textContent=error.message;}
    }
    async function load(){
      const page=await api(`/api/draft/${encodeURIComponent(openedId)}/history${next ? '?before='+encodeURIComponent(next) : ''}`);
      if(!box.isConnected)return;
      for(const item of page.items){const button=document.createElement('button');button.type='button';button.dataset.revision=item.revision;button.setAttribute('aria-pressed','false');
        const date=new Date(item.savedAt);const time=Number.isNaN(date.valueOf()) ? 'Дата не указана' : date.toLocaleString('ru-RU');
        button.textContent=(item.title || 'Статья')+' · '+time+' · '+(item.savedBy?.name || 'Автор не указан')+(item.revision===articleServerRevision ? ' · Текущая' : '');button.onclick=()=>choose(item,button);list.append(button);
        if(!selected && list.children.length===1)await choose(item,button);
      }
      next=page.nextBefore;box.querySelector('.version-more').hidden=!next;
    }
    box.querySelector('.version-more').onclick=()=>load().catch(e=>details.textContent=e.message);
    restore.onclick=async()=>{
      if(!selected || openedEpoch!==articleSaveEpoch || openedId!==currentId)return;
      restore.disabled=true;clearTimeout(articleAutosaveTimer);
      restoreRequest ||= {expectedRevision:articleServerRevision,documentId:articleDocumentId,requestId:crypto.randomUUID()};
      try{
        if(await persistArticleBackup(articleNeedsSave)===false)throw new Error('Не удалось сохранить локальную копию');
        await api(`/api/draft/${encodeURIComponent(openedId)}/history/${encodeURIComponent(selected.revision)}/restore`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(restoreRequest)});
        const latest=await api(`/api/draft/${encodeURIComponent(openedId)}`);
        if(openedEpoch!==articleSaveEpoch)return;
        setArticleSaveDocument(latest);$('#page-title').value=latest.title;setBody(latest.body);restoreProducts(latest.products || []);resetArticleEditorHistory();
        await window.markArticleBackupSynced({force:true});$('#status').textContent='Версия восстановлена и сохранена';box.close();toast('Выбранная версия восстановлена. Последующие версии остались в истории.');
      }catch(error){details.textContent=error.message;restore.disabled=false;if(error.status===409){articleSaveConflict=true;restore.disabled=true;toast('Статья уже изменена. Закройте историю и откройте серверную версию.',true);}}
    };
    await load();
  }catch(error){toast(error.message,true);}
};

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
  if (!await save()) return;
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
    await persistArticleBackup(articleNeedsSave);
    currentId = draft.id; lockedId = true;
    $('#filename').value = currentId; $('#filename').disabled = true;
    $('#page-title').value = draft.title;
    setBody(draft.body);
    restoreProducts(draft.products);
    setArticleSaveDocument(draft);
    await window.markArticleBackupSynced({force:true});
    setTab('editor');
    $('#status').textContent = `Открыто: ${draft.title}`;
    toast('Статья открыта');
  } catch(error) {toast(error.message, true);}
});
$('#desktop').addEventListener('click', () => {preview.classList.remove('mobile');$('#desktop').classList.add('active');$('#mobile').classList.remove('active');});
$('#mobile').addEventListener('click', () => {preview.classList.add('mobile');$('#mobile').classList.add('active');$('#desktop').classList.remove('active');});
$('#page-title').addEventListener('input', () => changed({coalesce:true}));
$('#filename').addEventListener('input', () => changed({coalesce:true}));
window.addEventListener('beforeunload', event => {if (articleNeedsSave || articlePendingSave) {event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',() => {
  if (!articleBackupReady || articleBackupRestoring) return;
  clearTimeout(articleBackupTimer);
  articleBackupTimer = null;
  persistArticleBackup(articleBackupDirty);
});
document.addEventListener('visibilitychange',() => {
  if (document.visibilityState !== 'hidden' || !articleBackupTimer) return;
  clearTimeout(articleBackupTimer);
  articleBackupTimer = null;
  persistArticleBackup(articleBackupDirty);
});
listDrafts().catch(error => toast(error.message, true));
refreshPreview();
$('#status').textContent = 'Новая статья';
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',resetArticleEditorHistory,{once:true});
else resetArticleEditorHistory();
