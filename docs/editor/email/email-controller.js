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
  <a href="${emailEditorUrl}" aria-current="page"><strong>Редактор email-рассылок</strong><small>HTML-письма для OUTMAX и ХАСЛ</small></a>`;
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
  const normalized = cleanPath(path);
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

/** Сохраняет структуру дизайна и удаляет только опасные элементы и атрибуты. */
function sanitizeImportedHtml(html,pagePath = '') {
  const doc = new DOMParser().parseFromString(html,'text/html');
  const siteKey = detectImportedSite(doc);
  const css = [...doc.querySelectorAll('style')].map(node => node.textContent || '').join('\n');
  const emailContent = doc.querySelector('.email-outer .email-shell .email-content,.email-content');
  const emailChildren = emailContent
    ? [...emailContent.children].filter(node => node.style.display !== 'none')
    : [];
  // A previously exported newsletter already has its own outer/shell tables.
  // Import only the editable payload so the 700 px shell is not nested again.
  const root = emailContent
    ? (emailChildren.length === 1 ? emailChildren[0] : emailContent)
    : doc.querySelector('article.om-guide,article,main,[role="main"]') || doc.body;
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
  const count = assets.size + remote.loaded;
  toast(`Импорт завершён${count ? ` · изображений: ${count}` : ''}${remote.failed ? ` · не загрузилось: ${remote.failed}` : ''}`,remote.failed > 0);
}

/** Обновляет оба предпросмотра и готовый исходный код. */
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
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
function changed() {
  $('#status').textContent = 'Есть несохранённые изменения';
  scheduleEmailOutline();
  refresh();
  document.dispatchEvent(new CustomEvent('email-editor-change'));
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
  return [block];
}

/** Вложенные ветки, которые полезно показывать отдельно в структуре письма. */
function emailOutlineChildren(block) {
  return [...block.children].filter(node => node.matches('.email-product-source,.email-comparison-list,.email-comparison-card'));
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
    return `<div class="email-outline-node" data-outline-node="${id}" data-depth="${depth}">
      <div class="email-outline-row" data-outline-id="${id}" draggable="true">
        <span class="email-outline-drag" aria-hidden="true" title="Перетащить">⠿</span>
        <button class="email-outline-focus" type="button" data-outline-action="focus" title="Показать блок"><small>${escapeHtml(emailBlockType(block))}</small><strong>${escapeHtml(emailBlockTitle(block,index))}</strong></button>
        <span class="email-outline-actions"><button type="button" data-outline-action="up" title="Выше" ${siblingIndex<=0?'disabled':''}>↑</button><button type="button" data-outline-action="down" title="Ниже" ${siblingIndex<0||siblingIndex>=siblings.length-1?'disabled':''}>↓</button><button class="outline-remove" type="button" data-outline-action="remove" title="Удалить">×</button></span>
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
  const active = movableEmailBlock(selectedBlock);
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
  if (format === 'html') {
    downloadBlob(new Blob([emailDocument(siteKey)],{type:'text/html;charset=utf-8'}),htmlName);
    return toast(`HTML для ${site.domain} готов`);
  }
  const zip = new JSZip();
  zip.file(htmlName,emailDocument(siteKey));
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
  window.emailImportState = {css:[...doc.querySelectorAll('style')].map(node => node.textContent || '').join('\n'),root:{tag:'div',className:'',id:'',style:''}};
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
canvas.addEventListener('input',changed);

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
  if (action.dataset.outlineAction === 'remove') {
    if (block.contains(selectedBlock)) selectBlock(null);
    block.remove();
    renderEmailOutline();
    changed();
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
$('#remove-block').addEventListener('click',() => {if(!selectedBlock)return toast('Сначала выберите блок',true);selectedBlock.remove();selectBlock(null);changed();});
$('#table-add-row').addEventListener('click',addTableRow);
$('#table-remove-row').addEventListener('click',removeTableRow);
$('#table-add-column').addEventListener('click',addTableColumn);
$('#table-remove-column').addEventListener('click',removeTableColumn);
$('#add-heading').addEventListener('click',() => insertBlock('<h2>Новый раздел</h2>'));
$('#add-text').addEventListener('click',() => insertBlock('<p>Добавьте текст рассылки.</p>'));
$('#add-button').addEventListener('click',() => insertBlock('<p><a href="/">Смотреть на сайте</a></p>'));
$('#add-preset-hero').addEventListener('click',() => insertBlock('<div class="email-section-source"><h1>Главное предложение</h1><p>Коротко объясните ценность предложения и почему стоит перейти на сайт.</p><p><a href="/">Смотреть предложение</a></p></div>'));
$('#add-preset-promo').addEventListener('click',() => insertBlock('<div class="email-promo-source"><h2>Специальное предложение</h2><p><strong>ПРОМОКОД</strong></p><p>Добавьте условия акции и срок действия предложения.</p><p><a href="/">Использовать промокод</a></p></div>'));
$('#add-preset-note').addEventListener('click',() => insertBlock('<blockquote><strong>Важно</strong><br>Добавьте короткую дополнительную информацию, условия или примечание.</blockquote>'));
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
$('#subject').addEventListener('input',changed);
$('#preheader').addEventListener('input',changed);
$('#filename').addEventListener('input',changed);
$('#copy-html').addEventListener('click',() => openExportDialog('copy'));
$('#copy-source').addEventListener('click',() => openExportDialog('copy'));
$('#apply-source').addEventListener('click',applySourceHtml);
source.addEventListener('input',() => {htmlDirty=true;$('#status').textContent='HTML изменён — нажмите «Применить HTML»';});
$('#download-html').addEventListener('click',() => openExportDialog('html'));
$('#download-zip').addEventListener('click',() => openExportDialog('zip'));
$('#export-close').addEventListener('click',() => $('#email-export-dialog').close());
$('#export-cancel').addEventListener('click',() => $('#email-export-dialog').close());
$('#email-export-dialog').addEventListener('click',event => {if(event.target === $('#email-export-dialog'))event.target.close();});
$('#email-export-form').addEventListener('submit',event => {
  event.preventDefault();
  activeSite = new FormData(event.currentTarget).get('email-site') || 'outmax_ru';
  $('#email-export-dialog').close();
  refresh();
  if (pendingExportAction === 'copy') copyText(emailBlock(activeSite));
  else exportEmail(pendingExportAction,activeSite).catch(error => toast(error.message,true));
});
window.addEventListener('beforeunload',event => {if($('#status').textContent.includes('несохранённые')){event.preventDefault();event.returnValue='';}});
window.addEventListener('resize',() => {syncStickyToolbarOffset();positionEmailBlockHandle();});
new ResizeObserver(syncStickyToolbarOffset).observe($('.main-head'));
requestAnimationFrame(syncStickyToolbarOffset);
renderEmailOutline();
refresh();
