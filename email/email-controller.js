// Управляет импортом, редактированием, предпросмотром и сохранением email-рассылок OUTMAX и ХАСЛ.
const $ = selector => document.querySelector(selector);
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
let refreshTimer = null;
let toastTimer = null;
let activeSite = 'outmax_ru';
let pendingExportAction = 'html';

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

/** Сохраняет структуру дизайна и удаляет только опасные элементы и атрибуты. */
function sanitizeImportedHtml(html,pagePath = '') {
  const doc = new DOMParser().parseFromString(html,'text/html');
  const css = [...doc.querySelectorAll('style')].map(node => node.textContent || '').join('\n');
  const root = doc.querySelector('article.om-guide,article,main,[role="main"]') || doc.body;
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
  return {title:doc.title || root.querySelector('h1')?.textContent.trim() || 'Рассылка',html:root.innerHTML,css,root:rootInfo};
}

/** Подключает каждое уникальное изображение через кешируемый локальный адрес без лавины внешних запросов. */
async function cacheRemoteImages() {
  const sources = [...new Set([...canvas.querySelectorAll('img[data-email-src]')]
    .map(image => image.dataset.emailSrc)
    .filter(value => /^https?:\/\//i.test(value)))];
  sources.forEach(sourceUrl => {
    let previewUrl = sourceUrl;
    try {
      if (BRAND_HOSTS.has(new URL(sourceUrl).hostname.toLowerCase())) previewUrl = `/api/email/fetch-image?url=${encodeURIComponent(sourceUrl)}`;
    } catch { /* Некорректный адрес останется без прокси. */ }
    remoteAssetUrls.set(sourceUrl,previewUrl);
  });
  canvas.querySelectorAll('img[data-email-src]').forEach(image => {
    const original = image.dataset.emailSrc;
    image.src = remoteAssetUrls.get(original) || original;
    image.loading = 'lazy';
    if (image.src !== original) image.addEventListener('error',() => {
      remoteAssetUrls.set(original,original);
      image.src = original;
      refresh();
    },{once:true});
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
  window.emailImportState = {css:imported.css || '',root:imported.root || {tag:'article',className:'om-guide',id:'',style:''}};
  canvas.innerHTML = imported.html || '<p>В импортированном файле нет содержимого.</p>';
  $('#subject').value = imported.title;
  $('#filename').value = slug(file.name.replace(/\.(?:html?|zip|rar)$/i,''));
  $('#status').textContent = `Импортирован ${file.name}`;
  selectBlock(null);
  $('#status').textContent = `Загружаю изображения · ${file.name}`;
  const remote = await cacheRemoteImages();
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
    desktopPreview.srcdoc = html;
    mobilePreview.srcdoc = html;
    source.value = emailBlock(activeSite);
  },120);
}

/** Помечает изменённое письмо и обновляет результат. */
function changed() {
  $('#status').textContent = 'Есть несохранённые изменения';
  refresh();
}

/** Выбирает верхнеуровневый блок для удаления или вставки рядом. */
function selectBlock(node) {
  selectedBlock?.removeAttribute('data-selected-block');
  selectedBlock = node?.closest?.('#canvas > *') || null;
  if (selectedBlock) selectedBlock.setAttribute('data-selected-block','');
}

/** Вставляет новый блок после выбранного или в конец письма. */
function insertBlock(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  if (selectedBlock) selectedBlock.after(node); else canvas.append(node);
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

document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click',() => {document.execCommand(button.dataset.command,false);changed();canvas.focus();}));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click',() => {
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active',item === tab));
  document.querySelectorAll('.tab').forEach(item => item.setAttribute('aria-selected',String(item === tab)));
  const view = tab.dataset.view || 'editor';
  $('.main').dataset.view = view;
  $('.preview-section').hidden = view !== 'preview';
  const htmlMode = view === 'html';
  $('.editor-panel').classList.toggle('html-mode',htmlMode);
  if (htmlMode) source.value = emailBlock(activeSite);
  if (view === 'preview') refresh();
}));
canvas.addEventListener('click',event => {if(event.target.closest('a'))event.preventDefault();selectBlock(event.target);});
canvas.addEventListener('input',changed);
$('#make-link').addEventListener('click',() => {const value=prompt('Ссылка','/');if(value)document.execCommand('createLink',false,value);changed();});
$('#remove-block').addEventListener('click',() => {if(!selectedBlock)return toast('Сначала выберите блок',true);selectedBlock.remove();selectBlock(null);changed();});
$('#add-heading').addEventListener('click',() => insertBlock('<h2>Новый раздел</h2>'));
$('#add-text').addEventListener('click',() => insertBlock('<p>Добавьте текст рассылки.</p>'));
$('#add-button').addEventListener('click',() => insertBlock('<p><a href="/">Смотреть на сайте</a></p>'));
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
refresh();
