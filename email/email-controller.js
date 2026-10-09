// Управляет импортом, редактированием, предпросмотром и сохранением email-рассылок OUTMAX и ХАСЛ.
const $ = selector => document.querySelector(selector);
const emailControllerSource = document.currentScript?.src;
const editorRootUrl = emailControllerSource
  ? new URL('../', emailControllerSource)
  : new URL(location.pathname.startsWith('/articles/') ? '/' : '../', location.href);
const outmaxEditorUrl = editorRootUrl.href;
const haslEditorUrl = new URL('hasl/', editorRootUrl).href;
const emailEditorUrl = location.hostname === '213.139.209.107'
  ? new URL('OUTMAX.html', editorRootUrl).href
  : new URL('email/', editorRootUrl).href;
const emailSwitcherMenu = document.querySelector('.editor-switcher-menu');
if (emailSwitcherMenu) emailSwitcherMenu.innerHTML = `
  <a href="${outmaxEditorUrl}"><strong>Редактор OUTMAX</strong><small>Статьи для outmaxshop.ru и outmaxshop.com</small></a>
  <a href="${haslEditorUrl}"><strong>Редактор ХАСЛ</strong><small>Статьи для хасл.рф и haslestore.com</small></a>
  <a href="${emailEditorUrl}" aria-current="page"><strong>Редактор email-рассылок</strong><small>HTML-письма для OUTMAX и ХАСЛ</small></a>
  <a href="${new URL('instructions/', editorRootUrl).href}" target="_blank" rel="noopener"><strong>Инструкции</strong><small>База знаний · поиск · ченжлог</small></a>`;
const canvas = $('#canvas');
const source = $('#source');
const desktopPreview = $('#desktop-preview');
const mobilePreview = $('#mobile-preview');
const assets = new Map();
const assetUrls = new Map();
const remoteAssetUrls = new Map();
window.emailRemoteUrls = remoteAssetUrls;
window.emailImportState = {css:'',root:{tag:'article',className:'om-guide',id:'',style:''}};
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const IMAGE_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"%3E%3Crect width="100%25" height="100%25" fill="%23f3f3f3"/%3E%3C/svg%3E';
let selectedBlock = null;
let selectedCell = null;
let refreshTimer = null;
let toastTimer = null;
let activeSite = 'outmax_ru';
let pendingExportAction = 'html';
let htmlDirty = false;
let draggedEmailBlock = null;
let emailOutlineLookup = [];
let emailOutlineTimer = null;
const EMAIL_HISTORY_LIMIT = 300;
const EMAIL_HISTORY_DELAY = 360;
let emailEditorHistory = [];
let emailEditorHistoryIndex = -1;
let emailEditorHistoryTimer = null;
let emailEditorHistoryRestoring = false;
let emailTypographyRange=null;

/** Показывает краткое состояние операции. */
function toast(message,error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = error ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = '',3200);
}

/** Создаёт безопасное имя экспортируемого файла. */
function slug(value) {
  return String(value || '').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70) || 'rassylka';
}

/** Экранирует текст для HTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

/** Нормализует путь из архива без выхода в родительские каталоги. */
function cleanPath(value) {
  let decoded = String(value || '').split(/[?#]/)[0];
  try { decoded = decodeURIComponent(decoded); } catch { /* Некорректный percent-код остаётся как есть. */ }
  const safe = [];
  for (const part of decoded.replace(/\\/g,'/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') safe.pop(); else safe.push(part);
  }
  return safe.join('/');
}

/** Возвращает MIME-тип поддерживаемого изображения. */
function imageType(name) {
  return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'})[String(name).split('.').pop().toLowerCase()] || '';
}

/** Освобождает временные адреса предыдущего импорта. */
function clearAssets() {
  assetUrls.forEach(url => URL.revokeObjectURL(url));
  remoteAssetUrls.forEach(url => {if (url.startsWith('blob:')) URL.revokeObjectURL(url);});
  assetUrls.clear();
  remoteAssetUrls.clear();
  assets.clear();
}

/** Регистрирует локальное изображение и создаёт URL только для предпросмотра. */
function registerAsset(path,blob) {
  const normalized = /^https?:\/\//i.test(path) ? new URL(path).href : cleanPath(path);
  const oldUrl = assetUrls.get(normalized);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  assets.set(normalized,blob);
  assetUrls.set(normalized,URL.createObjectURL(blob));
  return normalized;
}

/** Находит файл изображения из архива относительно HTML-документа. */
function resolveArchiveAsset(src,pagePath) {
  const pageFolder = pagePath.includes('/') ? pagePath.slice(0,pagePath.lastIndexOf('/')+1) : '';
  const candidates = [cleanPath(`${pageFolder}${src}`),cleanPath(src),cleanPath(String(src).replace(/^\.\//,''))];
  for (const candidate of candidates) if (assets.has(candidate)) return candidate;
  const basename = cleanPath(src).split('/').pop()?.toLowerCase();
  const matches = [...assets.keys()].filter(path => path.split('/').pop().toLowerCase() === basename);
  return matches.length === 1 ? matches[0] : '';
}

/** Возвращает реальный адрес лениво загружаемого изображения. */
function importedImageSource(image) {
  const direct = image.getAttribute('src');
  if (direct && !/^data:image\/gif;base64,R0lGOD/i.test(direct)) return direct;
  const lazy = image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('data-lazy-src');
  if (lazy) return lazy;
  const srcset = image.getAttribute('srcset') || image.getAttribute('data-srcset') || '';
  return srcset.split(',')[0]?.trim().split(/\s+/)[0] || direct || '';
}

/** Определяет сайт по абсолютным ссылкам и картинкам импортируемого HTML. */
function detectImportedSite(doc) {
  const counts = new Map(Object.keys(EMAIL_SITES).map(key => [key,0]));
  const siteHosts = new Map(Object.entries(EMAIL_SITES).map(([key,site]) => [new URL(`https://${site.domain}`).hostname.toLowerCase(),key]));
  for (const node of doc.querySelectorAll('a[href],img[src],img[data-src],source[srcset]')) {
    const values = [node.getAttribute('href'),node.getAttribute('src'),node.getAttribute('data-src'),node.getAttribute('srcset')];
    for (const value of values) {
      if (!value || !/^(?:https?:)?\/\//i.test(value.trim())) continue;
      try {
        const url = new URL(value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim());
        const key = siteHosts.get(url.hostname.toLowerCase().replace(/^www\./,''));
        if (key) counts.set(key,counts.get(key)+1);
      } catch { /* Некорректная ссылка не мешает импорту. */ }
    }
  }
  const [key,count] = [...counts].sort((a,b) => b[1]-a[1])[0] || [];
  return count > 0 ? key : '';
}

/** Нормализует ссылку на новость и определяет бренд/домен для будущего письма. */
function emailArticleSource(value) {
  let raw = String(value || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Вставьте полную ссылку на опубликованную новость'); }
  const host = url.hostname.toLowerCase().replace(/^www\./,'');
  const entry = Object.entries(EMAIL_SITES).find(([,site]) => new URL(`https://${site.domain}`).hostname.toLowerCase() === host);
  if (!entry) throw new Error('Поддерживаются новости OUTMAXSHOP.ru/.com, хасл.рф и HASLESTORE.com');
  url.protocol = 'https:';
  url.hash = '';
  return {url:url.href,siteKey:entry[0],brand:entry[0].startsWith('hasl') ? 'hasl' : 'outmax'};
}

/** Сохраняет структуру дизайна и удаляет только опасные элементы и атрибуты. */
function sanitizeImportedHtml(html,pagePath = '') {
  const doc = new DOMParser().parseFromString(html,'text/html');
  const siteKey = detectImportedSite(doc);
  const css = [...doc.querySelectorAll('style')].map(node => node.textContent || '').join('\n');
  const emailContent = doc.querySelector('.email-outer .email-shell .email-content,.email-content');
  // Системная OUTMAX-шапка будет собрана заново под выбранный домен.
  // Не переносим её в редактируемую статью при повторном импорте готового письма.
  emailContent?.querySelectorAll('.outmax-email-header-desktop,.outmax-email-header-mobile,.outmax-email-footer,.hasl-email-header,.hasl-email-footer,.email-top-banner').forEach(node => node.remove());
  const emailChildren = emailContent
    ? [...emailContent.children].filter(node => node.style.display !== 'none')
    : [];
  // A previously exported newsletter already has its own outer/shell tables.
  // Import only the editable payload so the 700 px shell is not nested again.
  const root = emailContent
    ? (emailChildren.length === 1 ? emailChildren[0] : emailContent)
    : doc.querySelector('.om-guide') || doc.querySelector('main,[role="main"]') || doc.querySelector('article') || doc.body;
  const preheaderNode = emailContent
    ? [...doc.body.children].find(node => node.style.display === 'none' || /display\s*:\s*none/i.test(node.getAttribute('style') || ''))
    : null;
  const importedPreheader = preheaderNode
    ? preheaderNode.textContent.replace(/[\u00a0\u034f]+/g,' ').trim()
    : null;
  const rootInfo = {
    tag:root.tagName.toLowerCase(),
    className:root.className || (root === doc.body ? 'om-guide' : ''),
    id:root.id || '',
    style:/expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(root.getAttribute('style') || '') ? '' : (root.getAttribute('style') || '')
  };
  doc.querySelectorAll('script,style,link,meta,object,embed,form,input,button,textarea,select,svg,canvas,video,audio,iframe,noscript').forEach(node => node.remove());
  doc.querySelectorAll('picture').forEach(picture => {
    const image = picture.querySelector('img');
    if (image) picture.replaceWith(image);
  });
  for (const image of root.querySelectorAll('img')) {
    const raw = importedImageSource(image).trim();
    if (!raw) { image.remove(); continue; }
    if (/^https?:/i.test(raw)) {
      image.dataset.emailSrc = raw;
      image.setAttribute('src',IMAGE_PLACEHOLDER);
    } else if (/^(?:data:|blob:)/i.test(raw)) image.setAttribute('src',raw);
    else {
      const path = resolveArchiveAsset(raw,pagePath);
      image.dataset.emailSrc = path || raw;
      image.setAttribute('src',path ? assetUrls.get(path) : absoluteBrandUrl(raw,activeSite));
    }
    image.removeAttribute('srcset');
    image.removeAttribute('data-srcset');
  }
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on') || ['contenteditable','draggable','loading','decoding','sizes'].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    const style = element.getAttribute('style') || '';
    if (/expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(style)) element.removeAttribute('style');
    if (element.matches('a[href]') && /^\s*javascript:/i.test(element.getAttribute('href'))) element.removeAttribute('href');
  }
  return {title:doc.title || root.querySelector('h1')?.textContent.trim() || 'Рассылка',html:root.innerHTML,css,root:rootInfo,siteKey,preheader:importedPreheader};
}

/** Подключает внешние изображения по их исходным адресам. */
async function cacheRemoteImages() {
  const sources = [...new Set([...canvas.querySelectorAll('img[data-email-src]')]
    .map(image => image.dataset.emailSrc)
    .filter(value => /^https?:\/\//i.test(value)))];
  // <img> может загружать картинку с другого домена без CORS. Не подменяем URL
  // на /api/email/fetch-image: статическая VPS-версия редактора не имеет этого маршрута.
  sources.forEach(sourceUrl => remoteAssetUrls.set(sourceUrl,sourceUrl));
  canvas.querySelectorAll('img[data-email-src]').forEach(image => {
    const original = image.dataset.emailSrc;
    image.src = remoteAssetUrls.get(original) || original;
    image.loading = 'lazy';
  });
  return {loaded:remoteAssetUrls.size,failed:0};
}

/** Импортирует HTML из ZIP и подготавливает все изображения. */
async function importZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(entry => !entry.dir && !entry.name.startsWith('__MACOSX/'));
  const pages = entries.filter(entry => /\.html?$/i.test(entry.name)).sort((a,b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length);
  if (!pages.length) throw new Error('В архиве нет HTML-файла');
  clearAssets();
  for (const entry of entries) {
    const mime = imageType(entry.name);
    if (!mime || entry._data?.uncompressedSize > MAX_IMAGE_SIZE) continue;
    const bytes = await entry.async('uint8array');
    if (bytes.length <= MAX_IMAGE_SIZE) registerAsset(entry.name,new Blob([bytes],{type:mime}));
  }
  const page = pages[0];
  return sanitizeImportedHtml(await page.async('string'),page.name);
}

/** Передаёт RAR серверу для безопасного преобразования в ZIP. */
async function convertRar(file) {
  const response = await fetch('/api/email/import-rar',{method:'POST',headers:{'Content-Type':'application/vnd.rar'},body:file});
  if (!response.ok) {
    let message = 'Не удалось открыть RAR';
    try { message = (await response.json()).error || message; } catch { /* Сервер вернул не JSON. */ }
    throw new Error(message);
  }
  return response.blob();
}

/** Загружает выбранный HTML или архив в редактор. */
async function importFile(file) {
  if (!file) return;
  const extension = file.name.split('.').pop().toLowerCase();
  let imported;
  if (extension === 'html' || extension === 'htm') {
    clearAssets();
    imported = sanitizeImportedHtml(await file.text());
  } else if (extension === 'zip') imported = await importZip(file);
  else if (extension === 'rar') imported = await importZip(await convertRar(file));
  else throw new Error('Поддерживаются HTML, ZIP и RAR');
  if (imported.siteKey) activeSite = imported.siteKey;
  window.emailImportState = {css:imported.css || '',root:imported.root || {tag:'article',className:'om-guide',id:'',style:''}};
  canvas.innerHTML = imported.html || '<p>В импортированном файле нет содержимого.</p>';
  $('#subject').value = imported.title;
  if (typeof imported.preheader === 'string') $('#preheader').value = imported.preheader;
  $('#filename').value = slug(file.name.replace(/\.(?:html?|zip|rar)$/i,''));
  $('#status').textContent = `Импортирован ${file.name}`;
  selectBlock(null);
  $('#status').textContent = `Загружаю изображения · ${file.name}`;
  const remote = await cacheRemoteImages();
  adoptPreviewLayout();
  $('#status').textContent = `Импортирован ${file.name}`;
  refresh();
  resetEmailEditorHistory();
  const count = assets.size + remote.loaded;
  toast(`Импорт завершён${count ? ` · изображений: ${count}` : ''}${remote.failed ? ` · не загрузилось: ${remote.failed}` : ''}`,remote.failed > 0);
  document.dispatchEvent(new CustomEvent('email-editor-change'));
}

/** Загружает опубликованную статью и сразу переводит её в редактируемый email-макет. */
async function importArticleFromUrl() {
  const input = $('#email-article-url');
  const button = $('#import-article-url');
  let sourceInfo;
  try { sourceInfo = emailArticleSource(input.value); }
  catch (error) { toast(error.message,true); input.focus(); return; }
  input.value = sourceInfo.url;
  button.disabled = true;
  button.textContent = 'Загружаю новость…';
  $('#status').textContent = 'Загружаю новость по ссылке';
  try {
    const response = await fetch(`${window.__EDITOR_API_PREFIX__ || '/editor-api'}/fetch-article`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:sourceInfo.url,brand:sourceInfo.brand})
    });
    let data = null;
    try { data = await response.json(); } catch { /* Сообщение ниже подходит и для не-JSON ответа. */ }
    if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить новость');
    const imported = sanitizeImportedHtml(data?.html || '');
    if (!imported.html?.trim()) throw new Error('На странице не найдено содержимое новости');
    clearAssets();
    activeSite = sourceInfo.siteKey;
    window.emailImportState = {css:imported.css || '',root:imported.root || {tag:'article',className:'om-guide',id:'',style:''}};
    canvas.innerHTML = imported.html;
    $('#subject').value = data.title || imported.title || 'Новая рассылка';
    const lead = [...canvas.querySelectorAll('p')].map(node => node.textContent.replace(/\s+/g,' ').trim()).find(text => text.length > 20) || '';
    if (lead) $('#preheader').value = lead.slice(0,160);
    $('#filename').value = `${slug(data.id || data.title || 'novost')}-email`;
    const siteRadio = document.querySelector(`[name="email-site"][value="${activeSite}"]`);
    if (siteRadio) siteRadio.checked = true;
    selectBlock(null);
    const remote = await cacheRemoteImages();
    adoptPreviewLayout();
    refresh();
    resetEmailEditorHistory();
    $('#status').textContent = `Новость загружена · ${emailSite(activeSite).domain}`;
    toast(`Новость адаптирована под email · изображений: ${remote.loaded}`);
    document.dispatchEvent(new CustomEvent('email-editor-change'));
  } catch (error) {
    $('#status').textContent = 'Не удалось загрузить новость';
    toast(error.message,true);
  } finally {
    button.disabled = false;
    button.textContent = '↓ Загрузить и адаптировать под email';
  }
}

/** Обновляет оба предпросмотра и готовый исходный код. */
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    syncEmailChrome();
    const html = previewDocument(activeSite);
    const block = emailBlock(activeSite);
    desktopPreview.srcdoc = html;
    mobilePreview.srcdoc = html;
    if (!($('.main').dataset.view === 'html' && htmlDirty)) source.value = block;
    const textLength = (canvas.innerText || '').replace(/\r\n/g,'\n').length;
    $('#character-count').textContent = `Текст: ${textLength.toLocaleString('ru-RU')} · HTML: ${block.length.toLocaleString('ru-RU')}`;
  },120);
}

/** Помечает изменённое письмо и обновляет результат. */
function changed({coalesce = false} = {}) {
  $('#status').textContent = 'Есть несохранённые изменения';
  if (coalesce) scheduleEmailHistorySnapshot();
  else {
    clearTimeout(emailEditorHistoryTimer);
    emailEditorHistoryTimer = null;
    captureEmailHistorySnapshot();
  }
  scheduleEmailOutline();
  refresh();
  document.dispatchEvent(new CustomEvent('email-editor-change'));
}

/** Возвращает письмо вместе с метаданными, влияющими на результат экспорта. */
function emailSelectionBookmark() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !canvas.contains(selection.anchorNode) || !canvas.contains(selection.focusNode)) return null;
  const path = node => {
    const result=[];
    while (node && node!==canvas) {
      const parent=node.parentNode;
      if (!parent) return null;
      result.push([...parent.childNodes].indexOf(node));
      node=parent;
    }
    return node===canvas ? result.reverse() : null;
  };
  const anchorPath=path(selection.anchorNode),focusPath=path(selection.focusNode);
  return anchorPath && focusPath ? {anchorPath,anchorOffset:selection.anchorOffset,focusPath,focusOffset:selection.focusOffset} : null;
}

function restoreEmailSelection(bookmark) {
  if (!bookmark) return false;
  const resolve = path => path.reduce((node,index)=>node?.childNodes?.[index] || null,canvas);
  const anchor=resolve(bookmark.anchorPath),focus=resolve(bookmark.focusPath);
  if (!anchor || !focus) return false;
  const clamp=(node,offset)=>Math.min(Math.max(0,offset||0),node.nodeType===Node.TEXT_NODE?(node.nodeValue||'').length:node.childNodes.length);
  const selection=window.getSelection();
  canvas.focus({preventScroll:true});
  try {
    if (typeof selection.setBaseAndExtent==='function') selection.setBaseAndExtent(anchor,clamp(anchor,bookmark.anchorOffset),focus,clamp(focus,bookmark.focusOffset));
    else {
      const range=document.createRange();
      range.setStart(anchor,clamp(anchor,bookmark.anchorOffset));
      range.setEnd(focus,clamp(focus,bookmark.focusOffset));
      selection.removeAllRanges();selection.addRange(range);
    }
    return true;
  } catch { return false; }
}

function emailEditorSnapshot() {
  const body = canvas.cloneNode(true);
  body.querySelectorAll('[data-selected-block],[data-email-drop-before],[data-email-drop-after]').forEach(element => {
    element.removeAttribute('data-selected-block');
    element.removeAttribute('data-email-drop-before');
    element.removeAttribute('data-email-drop-after');
  });
  return {
    body:body.innerHTML,
    subject:$('#subject')?.value || '',
    preheader:$('#preheader')?.value || '',
    filename:$('#filename')?.value || '',
    activeSite,
    importState:JSON.stringify(window.emailImportState || {}),
    selection:emailSelectionBookmark()
  };
}

/** Обновляет доступность кнопок и размер веток отмены/повтора. */
function updateEmailHistoryControls() {
  const undoButton = $('#email-history-undo');
  const redoButton = $('#email-history-redo');
  const undoCount = Math.max(0,emailEditorHistoryIndex);
  const redoCount = Math.max(0,emailEditorHistory.length-emailEditorHistoryIndex-1);
  if (undoButton) {
    undoButton.disabled = !undoCount;
    undoButton.title = undoCount ? `Отменить (Ctrl+Z) · доступно шагов: ${undoCount}` : 'Нет действий для отмены (Ctrl+Z)';
  }
  if (redoButton) {
    redoButton.disabled = !redoCount;
    redoButton.title = redoCount ? `Повторить (Ctrl+Y / Ctrl+Shift+Z) · доступно шагов: ${redoCount}` : 'Нет действий для повтора (Ctrl+Y / Ctrl+Shift+Z)';
  }
}

function captureEmailHistorySnapshot() {
  if (emailEditorHistoryRestoring) return;
  const state = emailEditorSnapshot();
  const {selection:keySelection,...keyState}=state;
  const key = JSON.stringify(keyState);
  if (emailEditorHistory[emailEditorHistoryIndex]?.key === key) {
    updateEmailHistoryControls();
    return;
  }
  if (emailEditorHistoryIndex < emailEditorHistory.length-1) emailEditorHistory.splice(emailEditorHistoryIndex+1);
  emailEditorHistory.push({key,state});
  if (emailEditorHistory.length > EMAIL_HISTORY_LIMIT) emailEditorHistory.splice(0,emailEditorHistory.length-EMAIL_HISTORY_LIMIT);
  emailEditorHistoryIndex = emailEditorHistory.length-1;
  updateEmailHistoryControls();
}

/** Объединяет непрерывный набор текста, но сохраняет каждую отдельную операцию. */
function scheduleEmailHistorySnapshot() {
  if (emailEditorHistoryRestoring) return;
  clearTimeout(emailEditorHistoryTimer);
  emailEditorHistoryTimer = setTimeout(() => {
    emailEditorHistoryTimer = null;
    captureEmailHistorySnapshot();
  },EMAIL_HISTORY_DELAY);
}

function flushEmailHistorySnapshot() {
  if (!emailEditorHistoryTimer) return;
  clearTimeout(emailEditorHistoryTimer);
  emailEditorHistoryTimer = null;
  captureEmailHistorySnapshot();
}

/** Очищает историю при открытии другого email-проекта или импортированного файла. */
function resetEmailEditorHistory() {
  clearTimeout(emailEditorHistoryTimer);
  emailEditorHistoryTimer = null;
  emailEditorHistory = [];
  emailEditorHistoryIndex = -1;
  captureEmailHistorySnapshot();
}

function restoreEmailHistorySnapshot(entry) {
  if (!entry) return;
  const scrollPosition={x:window.scrollX,y:window.scrollY};
  emailEditorHistoryRestoring = true;
  clearTimeout(refreshTimer);
  selectBlock(null);
  canvas.innerHTML = entry.state.body;
  $('#subject').value = entry.state.subject;
  $('#preheader').value = entry.state.preheader;
  $('#filename').value = entry.state.filename;
  activeSite = entry.state.activeSite || 'outmax_ru';
  try {window.emailImportState = JSON.parse(entry.state.importState || '{}');}
  catch {window.emailImportState = {css:'',root:{tag:'article',className:'om-guide',id:'',style:''}};}
  htmlDirty = false;
  renderEmailOutline();
  restoreEmailSelection(entry.state.selection);
  requestAnimationFrame(()=>window.scrollTo(scrollPosition.x,scrollPosition.y));
  refresh();
  emailEditorHistoryRestoring = false;
  $('#status').textContent = 'Есть несохранённые изменения';
  document.dispatchEvent(new CustomEvent('email-editor-change'));
  updateEmailHistoryControls();
}

function rememberEmailSelectionBeforeInput() {
  if (emailEditorHistoryRestoring || emailEditorHistoryTimer || emailEditorHistoryIndex<0) return;
  emailEditorHistory[emailEditorHistoryIndex].state.selection=emailSelectionBookmark();
}

function undoEmailEditor() {
  flushEmailHistorySnapshot();
  if (emailEditorHistoryIndex <= 0) return updateEmailHistoryControls();
  emailEditorHistoryIndex -= 1;
  restoreEmailHistorySnapshot(emailEditorHistory[emailEditorHistoryIndex]);
}

function redoEmailEditor() {
  flushEmailHistorySnapshot();
  if (emailEditorHistoryIndex >= emailEditorHistory.length-1) return updateEmailHistoryControls();
  emailEditorHistoryIndex += 1;
  restoreEmailHistorySnapshot(emailEditorHistory[emailEditorHistoryIndex]);
}

window.emailProjectBridge = {
  snapshot() {
    return {
      canvasHtml:canvas.innerHTML,
      importState:JSON.parse(JSON.stringify(window.emailImportState || {})),
      site:activeSite,
      assets:[...assets.entries()]
    };
  },
  async restore(project,assetEntries = []) {
    clearAssets();
    for (const [path,blob] of assetEntries) registerAsset(path,blob);
    activeSite = project.site || 'outmax_ru';
    window.emailImportState = project.importState || {css:'',root:{tag:'article',className:'om-guide',id:'',style:''}};
    canvas.innerHTML = project.canvasHtml || '<p>Пустой email-проект.</p>';
    $('#filename').value = project.filename || project.id || 'rassylka';
    $('#subject').value = project.subject || 'Без темы';
    $('#preheader').value = project.preheader || '';
    canvas.querySelectorAll('img[data-email-src]').forEach(image => {
      const sourcePath = cleanPath(image.dataset.emailSrc || '');
      if (assetUrls.has(sourcePath)) image.src = assetUrls.get(sourcePath);
    });
    await cacheRemoteImages();
    adoptPreviewLayout();
    selectBlock(null);
    scheduleEmailOutline();
    refresh();
    $('#status').textContent = 'Email-проект открыт';
    resetEmailEditorHistory();
  },
  async cacheImages() {
    const sources=new Set([...canvas.querySelectorAll('img')].map(img=>img.dataset.emailSrc||img.getAttribute('src')||''));
    const c=emailChromeSettings();[c.banner,c.logoImage,c.backgroundImage,...c.promos.map(p=>p.image)].forEach(url=>sources.add(url));
    const pending=[...sources].filter(url=>/^https?:\/\//i.test(url)&&!url.includes('/public-email-images/')&&!assets.has(url));
    let index=0;
    await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
      while(index<pending.length){const url=pending[index++];const response=await fetch(`${window.__EDITOR_API_PREFIX__||'/editor-api'}/email/fetch-image?url=${encodeURIComponent(url)}`);if(!response.ok)throw new Error('Не удалось сохранить изображение на сервер: '+url);registerAsset(url,await response.blob());}
    }));
  },
  assetEntries() {
    return [...assets.entries()];
  },
  site() {
    return activeSite;
  }
};

/** Возвращает целый смысловой блок, который можно безопасно перемещать. */
function movableEmailBlock(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!element || element === canvas || !canvas.contains(element)) return null;
  const nested = element.closest('.email-product-source,.email-comparison-card');
  if (nested && canvas.contains(nested)) return nested;
  let block = element;
  while (block.parentElement && block.parentElement !== canvas) block = block.parentElement;
  return block.parentElement === canvas ? block : null;
}

/** Возвращает соседей одного уровня, не смешивая товары с оболочкой раздела. */
function emailMoveSiblings(block) {
  const parent = block?.parentElement;
  if (!parent) return [];
  if (parent === canvas) return [...canvas.children];
  if (block.matches('.email-product-source')) return [...parent.children].filter(node => node.matches('.email-product-source'));
  if (block.matches('.email-comparison-card')) return [...parent.children].filter(node => node.matches('.email-comparison-card'));
  if (block.matches('.email-comparison-list')) return [...parent.children].filter(node => node.matches('.email-comparison-list'));
  return [...parent.children];
}

/** Вложенные ветки, которые полезно показывать отдельно в структуре письма. */
function emailOutlineChildren(block) {
  return [...block.children].filter(node => node.matches('.email-product-source,.email-comparison-list,.email-comparison-card,h1,h2,h3,p,ul,ol,li,hr,img,figure,table,tbody,tr,.email-toc-cell,a'));
}

function emailBlockType(block) {
  if (block.matches('.email-product-source')) return 'Товар';
  if (block.matches('.email-comparison-list')) return 'Список сравнения';
  if (block.matches('.email-comparison-card')) return 'Карточка сравнения';
  if (block.matches('.email-hero')) return 'Шапка';
  if (block.matches('.email-toc-source')) return 'Содержание';
  if (block.matches('.email-promo-source')) return 'Промоблок';
  if (block.matches('.email-section-source')) return 'Раздел';
  if (block.matches('h1,h2,h3,h4,h5,h6')) return 'Заголовок';
  if (block.matches('p,ul,ol')) return 'Текст';
  if (block.matches('img,figure')) return 'Изображение';
  if (block.matches('hr')) return 'Разделитель';
  if (block.matches('table')) return block.classList.contains('email-gallery') ? 'Галерея' : 'Таблица';
  return 'Блок';
}

function emailBlockTitle(block,index = 0) {
  const heading = block.matches('h1,h2,h3,h4,h5,h6')
    ? block
    : block.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6') || block.querySelector('h1,h2,h3');
  const image = block.matches('img') ? block : block.querySelector(':scope > img');
  const raw = heading?.textContent || image?.getAttribute('alt') || block.textContent || '';
  const text = raw.replace(/\s+/g,' ').trim();
  return text ? (text.length > 64 ? `${text.slice(0,61)}…` : text) : `${emailBlockType(block)} ${index+1}`;
}

const EMAIL_OUTLINE_ICONS = {
  all:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>',
  desktop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>',
  mobile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/></svg>',
  add:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  clone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8"/></svg>',
  remove:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'
};

function emailBlockVisibility(block) {
  if (block?.classList.contains('email-device-desktop')) return 'desktop';
  if (block?.classList.contains('email-device-mobile')) return 'mobile';
  return 'all';
}

function emailHiddenInEditMode(block) {
  const hiddenClass = canvas.dataset.editDevice === 'mobile' ? 'email-device-desktop' : 'email-device-mobile';
  return !!block.closest('.'+hiddenClass);
}

function emailLineTarget(block) {
  return block?.matches('h1,h2,h3') ? block : block?.querySelector(':scope > h2,:scope > h3');
}

function toggleEmailSectionLine(block) {
  const heading = emailLineTarget(block);
  if (!heading) return;
  heading.classList.toggle('email-no-section-line');
  changed();
  renderEmailOutline();
  syncEmailElementControls();
}

function removeEmailElement(block) {
  if (!block) return;
  const target = block.matches('.email-toc-cell') && block.parentElement.cells?.length === 1 ? block.parentElement : block;
  if (target.contains(selectedBlock)) selectBlock(null);
  target.remove();
  changed();
  renderEmailOutline();
}

function syncEmailElementControls() {
  const toolbar = $('#email-element-toolbar');
  toolbar.hidden = !selectedBlock;
  if (!selectedBlock) return;
  const visibility = emailBlockVisibility(selectedBlock);
  toolbar.innerHTML = ['all','desktop','mobile'].map(mode => {
    const label = mode === 'all' ? 'Показать на всех устройствах' : mode === 'desktop' ? 'Показать только на ПК' : 'Показать только на телефонах';
    return `<button type="button" data-element-action="visibility" data-visibility="${mode}" title="${label}" aria-label="${label}" aria-pressed="${visibility===mode}">${EMAIL_OUTLINE_ICONS[mode]}</button>`;
  }).join('') + '<button type="button" data-element-action="add">Добавить пункт</button><button type="button" data-element-action="clone">Клонировать</button><button type="button" data-element-action="remove">Удалить</button>' + (emailLineTarget(selectedBlock) ? `<button type="button" data-element-action="line">${emailLineTarget(selectedBlock).classList.contains('email-no-section-line') ? 'Показать' : 'Убрать'} линию раздела</button>` : '');
}

function setEmailBlockVisibility(block,mode) {
  if (!block) return;
  block.classList.remove('email-device-desktop','email-device-mobile');
  if (mode === 'desktop') block.classList.add('email-device-desktop');
  if (mode === 'mobile') block.classList.add('email-device-mobile');
  selectBlock(block);
  renderEmailOutline();
  changed();
  const label = mode === 'desktop' ? 'только на ПК' : mode === 'mobile' ? 'только на телефонах' : 'на всех устройствах';
  toast(`Блок показывается ${label}`);
}

function cloneEmailBlock(block) {
  if (!block) return;
  const source = block.matches('.email-toc-cell') && block.parentElement.cells?.length === 1 ? block.parentElement : block;
  const clone = source.cloneNode(true);
  for (const node of [clone,...clone.querySelectorAll('*')]) {
    node.removeAttribute('id');
    node.removeAttribute('data-selected-block');
    node.removeAttribute('data-email-move-selected');
    node.removeAttribute('data-email-drop-before');
    node.removeAttribute('data-email-drop-after');
  }
  source.after(clone);
  selectBlock(clone.matches('tr') ? clone.querySelector('td,th') : clone);
  renderEmailOutline();
  changed();
  clone.scrollIntoView({block:'nearest',behavior:'smooth'});
  toast('Элемент клонирован');
}

/** Добавляет редактируемый пункт внутрь списка, либо обычный текст после блока. */
function addEmailItem(block) {
  if (!block) return;
  const toc = block.closest('.email-toc-source');
  if (toc) {
    const sample = block.closest('.email-toc-cell') || toc.querySelector('.email-toc-cell');
    if (sample) {
      const row = sample.parentElement.cloneNode(true);
      row.querySelectorAll('td,th').forEach(cell => {cell.textContent='Новый пункт';cell.classList.remove('email-device-desktop','email-device-mobile');});
      sample.parentElement.after(row);
      selectBlock(row.querySelector('td,th'));changed();return;
    }
  }
  const list = block.matches('li') && block.parentElement.matches('ul,ol') ? block.parentElement : block.matches('ul,ol,.email-rating-grid,.email-size-list')
    ? block
    : block.querySelector(':scope > ul,:scope > ol,.email-rating-grid,.email-size-list');
  let item;
  if (list) {
    const sample = list.lastElementChild;
    item = sample ? sample.cloneNode(true) : document.createElement(list.matches('ul,ol') ? 'li' : 'div');
    if (list.matches('ul,ol')) item.innerHTML = 'Новый пункт';
    else if (list.matches('.email-size-list')) item.innerHTML = 'Новый размер';
    else item.innerHTML = '<strong>Новый пункт</strong><span>Добавьте значение</span>';
    list.append(item);
  } else {
    item = document.createElement('p');
    item.textContent = 'Новый пункт';
    block.after(item);
  }
  selectBlock(item);
  renderEmailOutline();
  changed();
  item.scrollIntoView({block:'nearest',behavior:'smooth'});
  toast('Новый пункт добавлен');
}

/** Рисует веточную структуру письма в левой панели. */
function renderEmailOutline() {
  const outline = $('#email-outline');
  if (!outline) return;
  emailOutlineLookup = [];
  const renderNodes = (nodes,depth = 0) => nodes.map((block,index) => {
    const id = emailOutlineLookup.push(block)-1;
    const siblings = emailMoveSiblings(block);
    const siblingIndex = siblings.indexOf(block);
    const children = emailOutlineChildren(block);
    const visibility = emailBlockVisibility(block);
    return `<div class="email-outline-node${emailHiddenInEditMode(block)?' email-outline-muted':''}" data-outline-node="${id}" data-depth="${depth}">
      <div class="email-outline-row" data-outline-id="${id}" draggable="true">
        <span class="email-outline-drag" aria-hidden="true" title="Перетащить">⠿</span>
        <button class="email-outline-focus" type="button" data-outline-action="focus" title="Показать блок"><small>${escapeHtml(emailBlockType(block))}</small><strong>${escapeHtml(emailBlockTitle(block,index))}</strong></button>
        <span class="email-outline-actions"><button type="button" data-outline-action="up" title="Выше" aria-label="Переместить выше" ${siblingIndex<=0?'disabled':''}>↑</button><button type="button" data-outline-action="down" title="Ниже" aria-label="Переместить ниже" ${siblingIndex<0||siblingIndex>=siblings.length-1?'disabled':''}>↓</button><button class="outline-add" type="button" data-outline-action="add" title="Добавить пункт" aria-label="Добавить пункт">${EMAIL_OUTLINE_ICONS.add}</button><button class="outline-clone" type="button" data-outline-action="clone" title="Клонировать элемент" aria-label="Клонировать элемент">${EMAIL_OUTLINE_ICONS.clone}</button><button class="outline-remove" type="button" data-outline-action="remove" title="Удалить элемент" aria-label="Удалить элемент">${EMAIL_OUTLINE_ICONS.remove}</button></span>${emailLineTarget(block) ? `<button class="email-outline-line" type="button" data-outline-action="line">${emailLineTarget(block).classList.contains('email-no-section-line') ? 'Показать' : 'Убрать'} линию раздела</button>` : ''}
        <span class="email-outline-device-actions" role="group" aria-label="Где показывать элемент"><button type="button" data-outline-action="visibility" data-visibility="all" title="Показать на всех устройствах" aria-label="Показать на всех устройствах" aria-pressed="${visibility==='all'}">${EMAIL_OUTLINE_ICONS.all}<span class="email-outline-visibility-label">Все</span></button><button type="button" data-outline-action="visibility" data-visibility="desktop" title="Показать только на ПК" aria-label="Показать только на ПК" aria-pressed="${visibility==='desktop'}">${EMAIL_OUTLINE_ICONS.desktop}<span class="email-outline-visibility-label">ПК</span></button><button type="button" data-outline-action="visibility" data-visibility="mobile" title="Показать только на телефонах" aria-label="Показать только на телефонах" aria-pressed="${visibility==='mobile'}">${EMAIL_OUTLINE_ICONS.mobile}<span class="email-outline-visibility-label">Телефон</span></button></span>
      </div>${children.length ? `<div class="email-outline-children">${renderNodes(children,depth+1)}</div>` : ''}
    </div>`;
  }).join('');
  const blocks = [...canvas.children];
  outline.innerHTML = blocks.length ? renderNodes(blocks) : '<div class="email-outline-empty">В письме пока нет блоков.</div>';
  syncEmailOutlineSelection();
}

function scheduleEmailOutline() {
  clearTimeout(emailOutlineTimer);
  emailOutlineTimer = setTimeout(renderEmailOutline,140);
}

function syncEmailOutlineSelection() {
  syncEmailElementControls();
  const active = emailOutlineLookup.includes(selectedBlock) ? selectedBlock : movableEmailBlock(selectedBlock);
  $('#email-outline')?.querySelectorAll('.email-outline-node').forEach(node => {
    node.classList.toggle('active',emailOutlineLookup[Number(node.dataset.outlineNode)] === active);
  });
  canvas.querySelector('[data-email-move-selected]')?.removeAttribute('data-email-move-selected');
  if (active) active.setAttribute('data-email-move-selected','');
  positionEmailBlockHandle();
}

/** Ставит ручку перемещения рядом с выбранным блоком. */
function positionEmailBlockHandle() {
  const handle = $('#email-block-handle');
  const block = movableEmailBlock(selectedBlock);
  if (!handle || !block || $('.main').dataset.view !== 'editor' || !matchMedia('(min-width:901px)').matches) {
    if (handle) handle.hidden = true;
    return;
  }
  const rect = block.getBoundingClientRect();
  if (rect.bottom < 72 || rect.top > innerHeight) { handle.hidden = true; return; }
  const toolbarBottom = $('#editor-toolbar')?.getBoundingClientRect().bottom || 72;
  handle.hidden = false;
  handle.style.left = `${Math.max(6,rect.left-36)}px`;
  handle.style.top = `${Math.max(toolbarBottom+8,Math.min(innerHeight-40,rect.top+5))}px`;
}

function clearEmailDropState() {
  canvas.querySelectorAll('[data-email-drop-before],[data-email-drop-after]').forEach(node => {
    node.removeAttribute('data-email-drop-before');
    node.removeAttribute('data-email-drop-after');
  });
  canvas.classList.remove('email-drop-end');
  $('#email-outline')?.querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before','drop-after'));
}

function emailDropPlacement(block,clientY) {
  const siblings = emailMoveSiblings(block).filter(node => node !== block);
  for (const sibling of siblings) {
    const rect = sibling.getBoundingClientRect();
    if (clientY < rect.top + rect.height/2) return {parent:block.parentElement,before:sibling,edge:'before'};
  }
  return {parent:block.parentElement,before:null,edge:'after'};
}

function showEmailCanvasDrop(placement) {
  clearEmailDropState();
  if (placement.before) placement.before.setAttribute('data-email-drop-before','');
  else canvas.classList.add('email-drop-end');
}

function moveEmailBlock(block,parent,before = null) {
  if (!block || !parent || block === before || block.contains(parent)) return;
  parent.insertBefore(block,before);
  draggedEmailBlock = null;
  clearEmailDropState();
  document.body.classList.remove('email-dragging');
  selectBlock(block);
  renderEmailOutline();
  changed();
  toast('Блок перемещён');
}

/** Заменяет импортированный широкий макет его email-версией из превью. */
function adoptPreviewLayout() {
  const imageSources = [...canvas.querySelectorAll('img')].map(image => image.dataset.emailSrc || image.getAttribute('src') || '');
  const template = document.createElement('template');
  template.innerHTML = preparedContent(activeSite).trim();
  const renderedRoot = template.content.firstElementChild;
  if (!renderedRoot) return;
  canvas.innerHTML = renderedRoot.innerHTML;
  [...canvas.querySelectorAll('img')].forEach((image,index) => {
    const original = imageSources[index];
    if (!original) return;
    image.dataset.emailSrc = original;
    const localPath = cleanPath(original);
    image.src = assetUrls.get(localPath) || remoteAssetUrls.get(original) || image.src;
  });
  renderEmailOutline();
}

/** Возвращает понятное название выбранного элемента. */
function selectedElementName(node) {
  if (!node) return 'Выберите текст, заголовок, линию, изображение или таблицу';
  if (node.matches('h1,h2,h3')) return 'Выбран заголовок';
  if (node.matches('p,li')) return 'Выбран текст';
  if (node.matches('img')) return 'Выбрано изображение';
  if (node.matches('hr')) return 'Выбрана линия-разделитель';
  if (node.matches('td,th')) return 'Выбрана ячейка таблицы';
  if (node.matches('table')) return 'Выбрана таблица';
  return 'Выбран блок';
}

/** Выбирает отдельный смысловой элемент, а не весь внешний контейнер. */
function selectBlock(node) {
  selectedBlock?.removeAttribute('data-selected-block');
  selectedCell = node?.closest?.('td,th') || null;
  const precise = node?.closest?.('img,hr,h1,h2,h3,p,li,td,th,table');
  const structural = node?.closest?.('.email-product-source,.email-comparison-card');
  selectedBlock = precise && canvas.contains(precise) ? precise : structural && canvas.contains(structural) ? structural : node?.closest?.('#canvas > *') || null;
  if (selectedBlock) selectedBlock.setAttribute('data-selected-block','');
  emailAccentControls.sync();
  $('#selection-label').textContent = selectedElementName(selectedBlock);
  $('#table-toolbar').hidden = !selectedBlock?.closest?.('table');
  syncEmailOutlineSelection();
}

/** Находит безопасное место для вставки нового обычного блока. */
function insertionAnchor() {
  if (!selectedBlock) return null;
  return selectedBlock.closest('table,ul,ol') || selectedBlock;
}

/** Вставляет новый блок после выбранного или в конец письма. */
function insertBlock(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  const anchor = insertionAnchor();
  if (anchor) anchor.after(node); else canvas.append(node);
  selectBlock(node);
  changed();
  node.scrollIntoView({block:'nearest',behavior:'smooth'});
}

/** Копирует HTML в буфер обмена. */
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const field = document.createElement('textarea');
    field.value=value; document.body.append(field); field.select(); document.execCommand('copy'); field.remove();
  }
  toast('HTML скопирован');
}

/** Скачивает Blob с заданным именем. */
function downloadBlob(blob,filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href=url; link.download=filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url),60_000);
}

/** Сохраняет HTML или ZIP для одного выбранного сайта. */
async function exportEmail(format,siteKey) {
  const name = slug($('#filename').value);
  const site = emailSite(siteKey);
  const htmlName = `${name}-${site.file}.html`;
  const serverHtml=window.emailPublicationBridge ? (await window.emailPublicationBridge.prepare(siteKey)).html : null;
  if (format === 'html') {
    downloadBlob(new Blob([serverHtml || emailDocument(siteKey)],{type:'text/html;charset=utf-8'}),htmlName);
    return toast(`HTML для ${site.domain} готов`);
  }
  const zip = new JSZip();
  zip.file(htmlName,serverHtml || emailDocument(siteKey));
  for (const [path,blob] of assets) zip.file(path,blob);
  downloadBlob(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),`${name}-${site.file}.zip`);
  toast(`ZIP для ${site.domain} готов`);
}

/** Открывает обязательный выбор сайта перед копированием или сохранением. */
function openExportDialog(action) {
  pendingExportAction = action;
  const selected = document.querySelector(`[name="email-site"][value="${activeSite}"]`);
  if (selected) selected.checked = true;
  $('#export-submit').textContent = action === 'copy' ? 'Копировать HTML' : action === 'zip' ? 'Скачать ZIP' : 'Скачать HTML';
  $('#email-export-dialog').showModal();
}

function activeTable() {
  return selectedBlock?.closest?.('table') || null;
}

/** Добавляет строку после выбранной строки таблицы. */
function addTableRow() {
  const table = activeTable();
  if (!table) return toast('Сначала выберите ячейку таблицы',true);
  const reference = selectedCell?.closest('tr') || table.rows[table.rows.length-1];
  const row = table.insertRow(reference ? reference.rowIndex + 1 : -1);
  const cells = reference ? [...reference.cells] : [];
  const count = Math.max(1,cells.length);
  for (let index=0;index<count;index++) {
    const cell = row.insertCell();
    if (cells[index]) cell.style.cssText = cells[index].style.cssText;
    cell.textContent = 'Новая ячейка';
  }
  selectBlock(row.cells[0]);
  changed();
}

/** Удаляет выбранную строку, не позволяя оставить пустую таблицу. */
function removeTableRow() {
  const table = activeTable();
  const row = selectedCell?.closest('tr');
  if (!table || !row) return toast('Сначала выберите ячейку строки',true);
  if (table.rows.length <= 1) return toast('В таблице должна остаться хотя бы одна строка',true);
  row.remove();
  selectBlock(table);
  changed();
}

/** Добавляет столбец справа от выбранной ячейки. */
function addTableColumn() {
  const table = activeTable();
  if (!table) return toast('Сначала выберите ячейку таблицы',true);
  const columnIndex = selectedCell ? selectedCell.cellIndex + 1 : Math.max(...[...table.rows].map(row => row.cells.length),0);
  for (const row of table.rows) {
    const reference = row.cells[Math.min(columnIndex,row.cells.length)-1];
    const tag = row.closest('thead') ? 'th' : 'td';
    const cell = document.createElement(tag);
    if (reference) cell.style.cssText = reference.style.cssText;
    cell.textContent = 'Новая ячейка';
    row.insertBefore(cell,row.cells[columnIndex] || null);
  }
  selectBlock(table.rows[0]?.cells[Math.min(columnIndex,table.rows[0].cells.length-1)] || table);
  changed();
}

/** Удаляет выбранный столбец из каждой строки таблицы. */
function removeTableColumn() {
  const table = activeTable();
  if (!table || !selectedCell) return toast('Сначала выберите ячейку столбца',true);
  const columnIndex = selectedCell.cellIndex;
  const widest = Math.max(...[...table.rows].map(row => row.cells.length),0);
  if (widest <= 1) return toast('В таблице должен остаться хотя бы один столбец',true);
  for (const row of table.rows) if (row.cells[columnIndex]) row.deleteCell(columnIndex);
  selectBlock(table);
  changed();
}

/** Применяет отредактированный HTML-блок обратно к визуальному письму. */
function applySourceHtml() {
  const doc = new DOMParser().parseFromString(source.value,'text/html');
  const emailContent = doc.querySelector('.email-content');
  let root = null;
  if (emailContent) root = [...emailContent.children].find(node => node.tagName === 'DIV' && node.style.display !== 'none') || emailContent;
  else root = doc.body;
  const html = root?.innerHTML?.trim() || '';
  if (!html) return toast('В HTML нет содержимого письма',true);
  canvas.innerHTML = html;
  window.emailImportState = {chrome:window.emailImportState?.chrome,css:[...doc.querySelectorAll('style')].map(node => node.textContent || '').join('\n'),root:{tag:'div',className:'',id:'',style:''}};
  htmlDirty = false;
  selectBlock(null);
  changed();
  toast('Изменения HTML применены');
}

/** Фиксирует панель инструментов ровно в её исходном положении, без скачка при скролле. */
function syncStickyToolbarOffset() {
  const main = $('.main');
  const heading = $('.main-head');
  const panel = $('.editor-panel');
  if (!main || !heading || !panel || !matchMedia('(min-width:901px)').matches) {
    main?.style.removeProperty('--email-workspace-head-height');
    return;
  }
  const headingTop = heading.offsetTop;
  const panelTop = panel.offsetTop;
  const panelBorder = Number.parseFloat(getComputedStyle(panel).borderTopWidth) || 0;
  main.style.setProperty('--email-workspace-head-height',`${Math.max(0,panelTop-headingTop+panelBorder)}px`);
}

$('#email-history-undo')?.addEventListener('click',undoEmailEditor);
$('#email-history-redo')?.addEventListener('click',redoEmailEditor);

document.addEventListener('selectionchange',()=>{const selection=getSelection();if(selection?.rangeCount && canvas.contains(selection.anchorNode) && canvas.contains(document.activeElement))emailTypographyRange=selection.getRangeAt(0).cloneRange();});
EditorStyling.mountTypography({toolbar:$('#editor-toolbar'),root:canvas,range:()=>emailTypographyRange,
  onApply:range=>{emailTypographyRange=range.cloneRange();changed();},onError:message=>toast(message,true)});
const emailAccentControls=EditorStyling.mountAccent({container:$('#table-toolbar').parentElement,
  getBlock:()=>selectedBlock?.closest('.om-callout,.om-note,blockquote,.email-info-block') || null,onApply:()=>changed(),prefix:'email-accent'});
$('#table-toolbar').after(emailAccentControls.panel);
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click',() => {document.execCommand(button.dataset.command,false);changed();canvas.focus();}));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click',() => {
  const previousView = $('.main').dataset.view || 'editor';
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active',item === tab));
  document.querySelectorAll('.tab').forEach(item => item.setAttribute('aria-selected',String(item === tab)));
  const view = tab.dataset.view || 'editor';
  $('.main').dataset.view = view;
  $('.preview-section').hidden = view !== 'preview';
  const htmlMode = view === 'html';
  $('.editor-panel').classList.toggle('html-mode',htmlMode);
  if (htmlMode && previousView !== 'html' && !htmlDirty) source.value = emailBlock(activeSite);
  if (view === 'preview') refresh();
  requestAnimationFrame(positionEmailBlockHandle);
}));
canvas.addEventListener('click',event => {if(event.target.closest('a'))event.preventDefault();selectBlock(event.target);});
canvas.addEventListener('beforeinput',rememberEmailSelectionBeforeInput);
canvas.addEventListener('input',() => changed({coalesce:true}));
document.addEventListener('pointerdown',() => flushEmailHistorySnapshot(),true);
document.addEventListener('keydown',event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  const undo = key === 'z' && !event.shiftKey;
  const redo = key === 'y' || (key === 'z' && event.shiftKey);
  if (!undo && !redo) return;
  const target = event.target;
  const nativeField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (nativeField && !canvas.contains(target)) return;
  event.preventDefault();
  if (undo) undoEmailEditor(); else redoEmailEditor();
});

document.querySelectorAll('[data-email-edit-device]').forEach(button => button.addEventListener('click',() => {
  canvas.dataset.editDevice = button.dataset.emailEditDevice;
  syncEmailChrome();
  document.querySelectorAll('[data-email-edit-device]').forEach(option => option.setAttribute('aria-pressed',String(option===button)));
  renderEmailOutline();
  positionEmailBlockHandle();
}));
$('#email-element-toolbar').addEventListener('click',event => {
  const button = event.target.closest('[data-element-action]');
  if (!button || !selectedBlock) return;
  const action = button.dataset.elementAction;
  if (action === 'visibility') setEmailBlockVisibility(selectedBlock,button.dataset.visibility);
  if (action === 'line') toggleEmailSectionLine(selectedBlock);
  if (action === 'clone') cloneEmailBlock(selectedBlock);
  if (action === 'add') addEmailItem(selectedBlock);
  if (action === 'remove') removeEmailElement(selectedBlock);
});
const emailOutline = $('#email-outline');
emailOutline.addEventListener('click',event => {
  const action = event.target.closest('[data-outline-action]');
  const row = event.target.closest('[data-outline-id]');
  const block = row && emailOutlineLookup[Number(row.dataset.outlineId)];
  if (!action || !block) return;
  const siblings = emailMoveSiblings(block);
  const index = siblings.indexOf(block);
  if (action.dataset.outlineAction === 'focus') {
    selectBlock(block);
    block.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  if (action.dataset.outlineAction === 'up' && index > 0) moveEmailBlock(block,block.parentElement,siblings[index-1]);
  if (action.dataset.outlineAction === 'down' && index >= 0 && index < siblings.length-1) moveEmailBlock(block,block.parentElement,siblings[index+1].nextElementSibling);
  if (action.dataset.outlineAction === 'add') addEmailItem(block);
  if (action.dataset.outlineAction === 'line') toggleEmailSectionLine(block);
  if (action.dataset.outlineAction === 'clone') cloneEmailBlock(block);
  if (action.dataset.outlineAction === 'visibility') setEmailBlockVisibility(block,action.dataset.visibility || 'all');
  if (action.dataset.outlineAction === 'remove') {
    removeEmailElement(block);
  }
});
emailOutline.addEventListener('dragstart',event => {
  const row = event.target.closest('[data-outline-id]');
  draggedEmailBlock = row && emailOutlineLookup[Number(row.dataset.outlineId)];
  if (!draggedEmailBlock) return event.preventDefault();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-outmax-email-block','move');
  event.dataTransfer.setData('text/plain',emailBlockTitle(draggedEmailBlock));
  document.body.classList.add('email-dragging');
});
emailOutline.addEventListener('dragover',event => {
  if (!draggedEmailBlock) return;
  const row = event.target.closest('[data-outline-id]');
  const target = row && emailOutlineLookup[Number(row.dataset.outlineId)];
  if (!target || target === draggedEmailBlock || target.parentElement !== draggedEmailBlock.parentElement) return;
  event.preventDefault();
  clearEmailDropState();
  const after = event.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height/2;
  row.classList.add(after ? 'drop-after' : 'drop-before');
  event.dataTransfer.dropEffect = 'move';
});
emailOutline.addEventListener('drop',event => {
  if (!draggedEmailBlock) return;
  const row = event.target.closest('[data-outline-id]');
  const target = row && emailOutlineLookup[Number(row.dataset.outlineId)];
  if (!target || target === draggedEmailBlock || target.parentElement !== draggedEmailBlock.parentElement) return;
  event.preventDefault();
  const after = row.classList.contains('drop-after');
  moveEmailBlock(draggedEmailBlock,target.parentElement,after ? target.nextElementSibling : target);
});

const emailBlockHandle = $('#email-block-handle');
emailBlockHandle.addEventListener('dragstart',event => {
  draggedEmailBlock = movableEmailBlock(selectedBlock);
  if (!draggedEmailBlock) return event.preventDefault();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-outmax-email-block','move');
  event.dataTransfer.setData('text/plain',emailBlockTitle(draggedEmailBlock));
  document.body.classList.add('email-dragging');
});
canvas.addEventListener('dragover',event => {
  if (!draggedEmailBlock || !Array.from(event.dataTransfer.types).includes('application/x-outmax-email-block')) return;
  event.preventDefault();
  const placement = emailDropPlacement(draggedEmailBlock,event.clientY);
  showEmailCanvasDrop(placement);
  event.dataTransfer.dropEffect = 'move';
});
canvas.addEventListener('drop',event => {
  if (!draggedEmailBlock || !event.dataTransfer.getData('application/x-outmax-email-block')) return;
  event.preventDefault();
  event.stopPropagation();
  const placement = emailDropPlacement(draggedEmailBlock,event.clientY);
  moveEmailBlock(draggedEmailBlock,placement.parent,placement.before);
});
function finishEmailDrag() {
  draggedEmailBlock = null;
  clearEmailDropState();
  document.body.classList.remove('email-dragging');
  positionEmailBlockHandle();
}
emailOutline.addEventListener('dragend',finishEmailDrag);
emailBlockHandle.addEventListener('dragend',finishEmailDrag);
document.addEventListener('scroll',positionEmailBlockHandle,true);
$('#make-link').addEventListener('click',() => {const value=prompt('Ссылка','/');if(value)document.execCommand('createLink',false,value);changed();});
$('#remove-block').addEventListener('click',() => {if(!selectedBlock)return toast('Сначала выберите блок',true);removeEmailElement(selectedBlock);});
$('#table-add-row').addEventListener('click',addTableRow);
$('#table-remove-row').addEventListener('click',removeTableRow);
$('#table-add-column').addEventListener('click',addTableColumn);
$('#table-remove-column').addEventListener('click',removeTableColumn);
$('#add-heading').addEventListener('click',() => insertBlock('<h2>Новый раздел</h2>'));
$('#add-text').addEventListener('click',() => insertBlock('<p>Добавьте текст рассылки.</p>'));
$('#add-button').addEventListener('click',() => insertBlock('<p><a href="/">Смотреть на сайте</a></p>'));
$('#add-preset-hero').addEventListener('click',() => insertBlock('<div class="email-section-source"><h1>Главное предложение</h1><p>Коротко объясните ценность предложения и почему стоит перейти на сайт.</p><p><a href="/">Смотреть предложение</a></p></div>'));
$('#add-preset-promo').addEventListener('click',() => insertBlock('<div class="email-promo-source"><h2>Специальное предложение</h2><p><strong>ПРОМОКОД</strong></p><p>Добавьте условия акции и срок действия предложения.</p><p><a href="/">Использовать промокод</a></p></div>'));
$('#add-preset-note').addEventListener('click',() => insertBlock('<blockquote class="email-info-block"><strong>Важно</strong><br>Добавьте короткую дополнительную информацию, условия или примечание.</blockquote>'));
$('#add-divider').addEventListener('click',() => insertBlock('<hr>'));
$('#add-image').addEventListener('click',() => $('#image-file').click());
$('#image-file').addEventListener('change',event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!imageType(file.name) || file.size > MAX_IMAGE_SIZE) return toast('Нужны JPG, PNG, WebP или GIF до 12 МБ',true);
  const path = `images/${slug(file.name.replace(/\.[^.]+$/,''))}-${Date.now().toString(36)}.${file.name.split('.').pop().toLowerCase()}`;
  registerAsset(path,file);
  insertBlock(`<img src="${assetUrls.get(path)}" data-email-src="${path}" alt="">`);
  event.target.value='';
});
$('#open-email').addEventListener('click',() => $('#email-file').click());
$('#email-file').addEventListener('change',event => {importFile(event.target.files[0]).catch(error => toast(error.message,true));event.target.value='';});
$('#import-article-url').addEventListener('click',importArticleFromUrl);
$('#email-article-url').addEventListener('keydown',event => {if(event.key === 'Enter'){event.preventDefault();importArticleFromUrl();}});
$('#subject').addEventListener('input',() => changed({coalesce:true}));
$('#preheader').addEventListener('input',() => changed({coalesce:true}));
$('#filename').addEventListener('input',() => changed({coalesce:true}));
$('#copy-html').addEventListener('click',() => openExportDialog('copy'));
$('#copy-source').addEventListener('click',() => openExportDialog('copy'));
$('#apply-source').addEventListener('click',applySourceHtml);
source.addEventListener('input',() => {htmlDirty=true;$('#status').textContent='HTML изменён — нажмите «Применить HTML»';});
$('#download-html').addEventListener('click',() => openExportDialog('html'));
$('#download-zip').addEventListener('click',() => openExportDialog('zip'));
$('#export-close').addEventListener('click',() => $('#email-export-dialog').close());
$('#export-cancel').addEventListener('click',() => $('#email-export-dialog').close());
$('#email-export-dialog').addEventListener('click',event => {if(event.target === $('#email-export-dialog'))event.target.close();});
$('#email-export-form').addEventListener('submit',async event => {
  event.preventDefault();
  activeSite = new FormData(event.currentTarget).get('email-site') || 'outmax_ru';
  $('#email-export-dialog').close();
  refresh();
  if (pendingExportAction === 'copy') {try {await copyText(window.emailPublicationBridge ? (await window.emailPublicationBridge.prepare(activeSite)).html : emailBlock(activeSite));}catch(error){toast(error.message,true);}}
  else exportEmail(pendingExportAction,activeSite).catch(error => toast(error.message,true));
});
window.addEventListener('beforeunload',event => {if($('#status').textContent.includes('несохранённые')){event.preventDefault();event.returnValue='';}});
window.addEventListener('resize',() => {syncStickyToolbarOffset();positionEmailBlockHandle();});
new ResizeObserver(syncStickyToolbarOffset).observe($('.main-head'));
requestAnimationFrame(syncStickyToolbarOffset);
function renderEmailChromeSettings(force=false) {
 const panel=$('#email-chrome-settings');if(!panel)return;
 if(!force&&panel.contains(document.activeElement))return;
 const openSections=[...panel.querySelectorAll('.email-chrome-fields details')].map(node=>node.open);
 const c=emailChromeSettings();
 const field=(label,key,value,type='text')=>`<label>${label}<input data-chrome-field="${key}" type="${type}" value="${escapeHtml(value)}" ${type==='url'?'placeholder="https://…"':''}>${['banner','backgroundImage','logoImage'].includes(key)||key.endsWith('.image')?`<button type="button" data-chrome-upload="${key}">Загрузить изображение с ПК</button>`:''}</label>`;
 panel.querySelector('.email-chrome-fields').innerHTML=`<details open><summary>Фон и верхний баннер</summary>${field('Цвет фона','background',c.background,'color')}${field('Изображение фона — ссылка','backgroundImage',c.backgroundImage,'url')}${field('Верхний баннер — ссылка','banner',c.banner,'url')}${field('Переход по верхнему баннеру','bannerUrl',c.bannerUrl)}<p class="help">Пустая ссылка возвращает заглушку. Изображение фона дополняет выбранный цвет.</p></details><details><summary>Шапка ${c.brand==='hasl'?'ХАСЛ':'OUTMAX'}</summary>${field('Изображение логотипа — ссылка','logoImage',c.logoImage)}${field('Ссылка логотипа на ПК','desktopLogo',c.desktopLogo)}${field('Ссылка логотипа на телефоне','mobileLogo',c.mobileLogo)}${c.menu.map((item,i)=>`<div class="email-chrome-menu-row">${field('Название пункта',`menu.${i}.label`,item.label)}${field('Ссылка',`menu.${i}.url`,item.url)}<button type="button" data-chrome-remove="${i}" aria-label="Удалить пункт меню">Удалить пункт</button></div>`).join('')}<button type="button" data-chrome-add>Добавить пункт меню</button><p class="help">Ссылки вида /snickers/ автоматически используют выбранный домен.</p></details><details><summary>Подвал ${c.brand==='hasl'?'ХАСЛ':'OUTMAX'}</summary>${field('Номер телефона','phone',c.phone)}${c.promos.map((item,i)=>`<div class="email-chrome-menu-row"><strong>Акция ${i+1}</strong>${field('Фотография — ссылка',`promos.${i}.image`,item.image,'url')}${field('Переход по картинке и кнопке',`promos.${i}.url`,item.url)}${field('Текст кнопки',`promos.${i}.label`,item.label)}</div>`).join('')}${Object.entries(c.socials).map(([key,url])=>field({vk:'ВКонтакте',tg:'Телеграм',max:'MAX',blog:'Блог'}[key],`socials.${key}`,url)).join('')}</details>`;
 panel.querySelectorAll('.email-chrome-fields details').forEach((node,index)=>{if(openSections.length)node.open=openSections[index];});
}
function applyEmailChromeFields() {
 const c=JSON.parse(JSON.stringify(emailChromeSettings()));
 for(const field of $('#email-chrome-settings').querySelectorAll('[data-chrome-field]')) {
  const path=field.dataset.chromeField.split('.');let owner=c;for(const key of path.slice(0,-1))owner=owner[key];
  const value=field.value.trim();const isLink=path.at(-1)==='url'||['banner','backgroundImage','logoImage','image','desktopLogo','mobileLogo','bannerUrl'].includes(path.at(-1))||path[0]==='socials';
  if(isLink&&value&&!emailChromeUrl(value,activeSite)){field.setCustomValidity('Укажите ссылку https:// или путь /…');field.reportValidity();return false;}
  field.setCustomValidity('');owner[path.at(-1)]=value;
 }
 storeEmailChromeSettings(c);changed();return true;
}
function syncEmailChrome() {
 const stage=$('#email-canvas-stage');if(!stage)return;
 stage.dataset.editDevice=canvas.dataset.editDevice||'desktop';
 window.emailChromePreview=true;
 const css=emailBackgroundStyle();stage.style.cssText=css;$('.editor-panel').style.cssText=css;
 $('#email-editor-header').innerHTML=outmaxEmailHeader(activeSite);
 $('#email-editor-banner').innerHTML=emailBannerBlock();
 $('#email-editor-footer').innerHTML=outmaxEmailFooter(activeSite);
 window.emailChromePreview=false;
 renderEmailChromeSettings();
}
$('#email-chrome-settings').addEventListener('change',applyEmailChromeFields);
let emailChromeUploadTarget='';
$('#email-chrome-file').addEventListener('change',event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 if(!imageType(file.name)||file.size>MAX_IMAGE_SIZE)return toast('Нужны JPG, PNG, WebP или GIF до 12 МБ',true);
 const path=registerAsset(`images/chrome-${Date.now().toString(36)}-${crypto.randomUUID()}.${file.name.split('.').pop().toLowerCase()}`,file);
 const c=JSON.parse(JSON.stringify(emailChromeSettings())),keys=emailChromeUploadTarget.split('.');let owner=c;for(const key of keys.slice(0,-1))owner=owner[key];owner[keys.at(-1)]=path;storeEmailChromeSettings(c);renderEmailChromeSettings(true);changed();
});
$('#email-chrome-settings').addEventListener('click',event=>{
 const upload=event.target.closest('[data-chrome-upload]');if(upload){emailChromeUploadTarget=upload.dataset.chromeUpload;$('#email-chrome-file').click();return;}
 const add=event.target.closest('[data-chrome-add]'),remove=event.target.closest('[data-chrome-remove]');if(!add&&!remove)return;
 if(!applyEmailChromeFields())return;
 const c=window.emailImportState.chrome;
 if(add&&c.menu.length<8)c.menu.push({label:'НОВЫЙ ПУНКТ',url:'/'});
 if(remove&&c.menu.length>1)c.menu.splice(Number(remove.dataset.chromeRemove),1);
 renderEmailChromeSettings(true);changed();
});
for(const id of ['email-editor-header','email-editor-banner','email-editor-footer'])$('#'+id).addEventListener('click',event=>{event.preventDefault();$('#email-chrome-settings').open=true;$('#email-chrome-settings').scrollIntoView({block:'nearest'});});

renderEmailChromeSettings(true);
renderEmailOutline();
refresh();
resetEmailEditorHistory();
