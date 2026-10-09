// Переводит импортированный дизайн в устойчивую email-разметку без потери содержания и изображений.
const EMAIL_SITES = {
  outmax_ru:{domain:'outmaxshop.ru',brand:'OUTMAX',file:'outmaxshop-ru'},
  outmax_com:{domain:'outmaxshop.com',brand:'OUTMAX',file:'outmaxshop-com'},
  hasl_ru:{domain:'хасл.рф',brand:'ХАСЛ',file:'hasl-rf'},
  hasle_com:{domain:'haslestore.com',brand:'HASL',file:'haslestore-com'}
};
const EMAIL_WIDTH = 700;
const OUTMAX_EMAIL_LOGO_PUBLIC_NAME = '67b8fd5c53016cb373dbc09457a002a0fc6b79c50539bdc650ad2b5dcce46fe8.png';
const NOTISEND_ALLOWED_TAGS = new Set([
  'a','br','div','h1','h2','h3','img','li','p','span','strong','style','table','tbody','td','th','thead','tr','ul'
]);
const EMAIL_RESPONSIVE_CLASSES = new Set([
  'email-info-block','email-info-block--custom','email-toc-table','email-toc-cell',
  'email-body','email-section-source','email-product-source','email-toc-source','email-promo-source','email-hero',
  'email-ratings-panel','email-ratings-title','email-rating-grid','email-rating-item','email-commerce-source','email-commerce-price',
  'email-size-panel','email-size-list','email-size-chip','email-gallery',
  'email-comparison-list','email-comparison-card','email-comparison-metrics','email-comparison-metric',
  'email-device-desktop','email-device-mobile','email-no-section-line'
]);
const BRAND_HOSTS = new Set(Object.values(EMAIL_SITES).flatMap(site => {
  const host = new URL(`https://${site.domain}`).hostname;
  return [host,`www.${host}`];
}));
const EMAIL_FALLBACK_CSS = `
.hasl-logo-mobile,.hasl-footer-separator{display:none}
@media only screen and (max-width:600px){
.email-content .hasl-logo-desktop{display:none!important}.email-content .hasl-logo-mobile{display:inline-block!important}
.hasl-footer-separator{display:table-row!important}
.hasl-email-menu{display:none!important;max-height:0!important;overflow:hidden!important}
.hasl-footer-phone{padding:0 0 20px!important}.hasl-footer-phone a{font-size:24px!important}
.hasl-email-footer .hasl-social-label{display:inline!important;font-size:16px!important;padding-top:0!important;padding-left:14px!important;vertical-align:middle!important}
.hasl-email-footer .outmax-social-link{border:0!important;max-width:none!important}
.email-content .hasl-email-footer td.hasl-footer-legal{padding:24px 20px!important;text-align:left!important}.email-content .hasl-email-footer td.hasl-footer-phone{padding:0 20px!important}.hasl-email-footer .outmax-social-link{border-bottom:1px solid #26323d!important}
}

.outmax-social-mobile{display:none;max-height:0;overflow:hidden;mso-hide:all}
@media only screen and (max-width:600px){
.outmax-promo-cell,.outmax-social-cell{display:block!important;width:100%!important;box-sizing:border-box!important}
.outmax-social-desktop{display:none!important;max-height:0!important;overflow:hidden!important}
.outmax-social-mobile{display:block!important;max-height:none!important;overflow:visible!important}
.outmax-promo-cell{padding:15px 12px!important}
.outmax-phone-text{font-size:22px!important}
.outmax-footer-phone{padding:28px 20px 12px!important;background:#282828!important}.outmax-footer-socials{padding:8px 20px 16px!important;background:#282828!important}.outmax-footer-legal{padding:24px 20px!important}.outmax-social-link{padding:14px 0!important;border-bottom:1px solid #464646}.outmax-social-mobile{display:inline-block!important;vertical-align:middle!important}.outmax-social-label{display:inline!important;padding-left:16px!important;padding-top:0!important;font-size:16px!important}
.outmax-social-cell a{width:100%!important;max-width:240px!important}
}

html,body{margin:0;padding:0;background:#f1f1f1}
.email-outer,.email-shell{table-layout:fixed}
.email-shell{width:100%;max-width:700px;background:#fff}
.email-content{width:100%;padding:0}
.email-content img{display:block;max-width:100%;height:auto;border:0}
.email-content table{border-collapse:collapse}
.email-content th,.email-content td{word-break:normal;overflow-wrap:normal}
.email-content h1,.email-content h2,.email-content h3,.email-content p,.email-content a{word-break:normal;overflow-wrap:break-word}
.email-product-source{border-radius:10px}
.email-ratings-panel,.email-commerce-source{border-radius:8px}
.email-rating-grid{display:block;width:100%;font-size:0}
.email-rating-item{display:inline-block;width:50%;box-sizing:border-box;vertical-align:top;border-radius:8px}
.email-size-list{display:block;width:100%;font-size:0}
.email-size-chip{display:inline-block;width:33.33%;box-sizing:border-box;vertical-align:top}
.outmax-email-header-mobile{display:none;max-height:0;overflow:hidden;mso-hide:all}
.outmax-email-header-desktop,.outmax-email-header-mobile{width:100%;border-collapse:collapse;background:#fff}
.email-content .outmax-email-header-logo{display:block!important;width:80px!important;min-width:80px!important;max-width:80px!important;height:80px!important;max-height:80px!important;margin:0 auto!important;border:0!important}
.outmax-email-nav{width:100%;max-width:600px;border-collapse:collapse;background:#282828}
.email-device-mobile{display:none!important;max-height:0!important;overflow:hidden!important;mso-hide:all!important}
@media only screen and (max-width:600px){
  .email-shell{width:100%!important;max-width:100%!important}
  .email-content{width:100%!important;max-width:100%!important;overflow:hidden!important}
  .email-body{padding-left:0!important;padding-right:0!important}
  .email-section-source{padding-left:12px!important;padding-right:12px!important}
  .email-product-source{margin-left:-12px!important;margin-right:-12px!important;padding-left:12px!important;padding-right:12px!important}
  .email-toc-source,.email-promo-source,.email-commerce-source,.email-ratings-panel{padding-left:12px!important;padding-right:12px!important}
  .email-hero td{padding-left:12px!important;padding-right:12px!important}
  .email-content th,.email-content td{padding-left:5px!important;padding-right:5px!important}
  .email-content h1{font-size:22px!important;line-height:1.18!important}
  .email-content h2{font-size:19px!important;line-height:1.22!important}
  .email-content h3,.email-product-source h3{font-size:18px!important;line-height:1.24!important;word-break:normal!important;overflow-wrap:break-word!important}
  .email-rating-item{display:block!important;width:100%!important}
  .email-commerce-price,.email-size-panel{display:block!important;width:100%!important;max-width:100%!important}
  .email-size-panel{margin-top:16px!important}
  .email-size-chip{display:inline-block!important;width:33.33%!important;max-width:none!important}
  .email-gallery td{display:block!important;width:100%!important;padding:0 0 10px!important}
  .email-gallery img{width:100%!important;max-width:100%!important}
  .email-comparison-metric{display:inline-block!important;width:50%!important;box-sizing:border-box!important}
  .outmax-email-header-desktop{display:none!important;max-height:0!important;overflow:hidden!important;mso-hide:all!important}
  .outmax-email-header-mobile{display:table!important;width:100%!important;max-height:none!important;overflow:visible!important}
  .outmax-email-header-mobile td{padding:24px 20px!important}
  .email-device-desktop{display:none!important;max-height:0!important;overflow:hidden!important;mso-hide:all!important}
  .email-device-mobile{display:block!important;max-height:none!important;overflow:visible!important}
  table.email-device-mobile{display:table!important}
  tr.email-device-mobile{display:table-row!important}
  td.email-device-mobile,th.email-device-mobile{display:table-cell!important}
.outmax-social-mobile{display:inline-block!important;vertical-align:middle!important}
.email-content td.outmax-footer-phone{padding:28px 20px 12px!important}
.email-content td.outmax-footer-socials{padding:8px 20px 16px!important}
.email-content td.outmax-footer-legal{padding:24px 20px!important}
.email-content .outmax-social-link{max-width:none!important}
.email-content .outmax-phone-text{font-size:24px!important}
}`;

function emailSite(siteKey) {
  return EMAIL_SITES[siteKey] || EMAIL_SITES.outmax_ru;
}

function absoluteBrandUrl(value,siteKey) {
  const raw = String(value || '').trim();
  if (!raw || /^(?:mailto:|tel:|#|data:|blob:)/i.test(raw) || /^\[%[^%\]]+%\]$/.test(raw)) return raw;
  const site = emailSite(siteKey);
  if (/^(?:file:\/{2,}|[a-z]:[\\/])/i.test(raw)) {
    const filename = raw.replace(/\\/g,'/').split('/').pop();
    return filename ? `https://${site.domain}/images/${encodeURIComponent(filename)}` : `https://${site.domain}/`;
  }
  try {
    const relative = !/^(?:https?:)?\/\//i.test(raw);
    const parsed = new URL(raw.startsWith('//') ? `https:${raw}` : raw,`https://${site.domain}/`);
    if (!/^https?:$/i.test(parsed.protocol)) return raw;
    if (relative || BRAND_HOSTS.has(parsed.hostname.toLowerCase())) {
      return `https://${site.domain}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return raw;
  }
}

function exportImageSource(image,siteKey) {
  const stored = image.dataset.emailSrc || image.getAttribute('src') || '';
  if (!stored || /^(?:data:|blob:)/i.test(stored)) return stored;
  // An absolute image URL belongs to the server that actually hosts the file.
  // Rewriting only its hostname (for example, хасл.рф -> outmaxshop.ru)
  // produces a valid-looking URL that returns 404 in both previews and exports.
  if (/^https?:\/\//i.test(stored)) {
    try { return new URL(stored).href; } catch { return stored; }
  }
  return absoluteBrandUrl(stored,siteKey);
}

function cleanImportedCss(value) {
  return String(value || '')
    .replace(/@import[^;]+;/gi,'')
    .replace(/expression\s*\([^)]*\)/gi,'')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]*\)/gi,'none')
    .slice(0,250000);
}

function importedDesignCss() {
  return cleanImportedCss(window.emailImportState?.css || '');
}

function setEmailStyle(node,style) {
  if (node) node.style.cssText = `${node.style.cssText};${style}`;
}

/** Возвращает true для фона, на котором нужен светлый текст. */
function isDarkEmailColor(value) {
  const color = String(value || '').trim().toLowerCase();
  if (!color || color === 'transparent' || color === 'initial' || color === 'inherit') return false;
  let channels = null;
  const rgb = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d*(?:\.\d+)?))?\s*\)$/);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return false;
    channels = rgb.slice(1,4).map(Number);
  }
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const value = hex[1].length === 3 ? [...hex[1]].map(char => char+char).join('') : hex[1];
    channels = [0,2,4].map(index => parseInt(value.slice(index,index+2),16));
  }
  if (!channels) return color === 'black';
  const luminance = (channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722) / 255;
  return luminance < 0.46;
}

/** Восстанавливает контраст, если общие email-стили затемнили текст на цветном фоне. */
function repairDarkBackgroundContrast(root) {
  const candidates = root.querySelectorAll('div,header,section,nav,aside,h1,h2,h3,h4,h5,h6,p,ul,li,span,strong,a,table,th,td');
  for (const node of candidates) {
    let backgroundNode = node;
    while (backgroundNode && backgroundNode !== root.parentElement) {
      const background = backgroundNode.style?.backgroundColor || '';
      if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
        if (isDarkEmailColor(background)) {
          const ownsBackground = node.style?.backgroundColor && node.style.backgroundColor !== 'transparent';
          const color = node.matches('a') ? (ownsBackground ? '#ffffff' : '#c7f500') : node.matches('p,li') ? '#d8dee6' : '#ffffff';
          // NotiSend injects its own h1/p colors with !important in the visual
          // editor. The inline declaration must also be important to retain
          // contrast after the block is pasted and after a send is rendered.
          setEmailStyle(node,`color:${color}!important`);
        }
        break;
      }
      backgroundNode = backgroundNode.parentElement;
    }
  }
}

/** Убирает синий из импортированного макета: палитра ХАСЛ строится на чёрном и неоновом. */
function removeHaslBlue(root) {
  const blue = /(?:#155fef|rgb\(\s*21\s*,\s*95\s*,\s*239\s*\))/gi;
  for (const node of [root,...root.querySelectorAll('*')]) {
    if(node.closest('.om-callout--custom,.email-info-block--custom'))continue;
    for (const property of [...node.style]) {
      const value = node.style.getPropertyValue(property);
      blue.lastIndex = 0;
      if (!blue.test(value)) continue;
      blue.lastIndex = 0;
      node.style.setProperty(property,value.replace(blue,'#090b0d'),node.style.getPropertyPriority(property));
    }
  }
}

/** Находит смысловые блоки даже в HTML без классов и помечает их до преобразования. */
function markEmailStructures(root) {
  root.querySelectorAll('.om-callout,.om-note,blockquote').forEach(node=>{node.classList.add('email-info-block');if(node.classList.contains('om-callout--custom'))node.classList.add('email-info-block--custom');});
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(node => {
    if (!node.children.length && !node.textContent.replace(/\u00a0/g,' ').trim()) node.remove();
  });
  root.querySelectorAll('nav').forEach(node => node.classList.add('email-toc-source'));
  root.querySelectorAll('section').forEach(node => {
    node.classList.add('email-section-source');
    const heading = node.querySelector('h2');
    if (heading && /промокод/i.test(heading.textContent) && /скидк/i.test(node.textContent)) node.classList.add('email-promo-source');
  });
  root.querySelectorAll('h2').forEach(heading => {
    const parent = heading.parentElement;
    if (!parent) return;
    parent.classList.add('email-section-source');
    if (/^В этой статье$/i.test(heading.textContent.trim())) parent.classList.add('email-toc-source');
  });
  root.querySelectorAll('article').forEach(node => {
    if (node.querySelector('h3') && node.querySelectorAll('img').length > 1) node.classList.add('email-product-source');
  });
  root.querySelectorAll('h3').forEach(heading => {
    const parent = heading.parentElement;
    if (parent && parent.querySelectorAll('img').length > 1) parent.classList.add('email-product-source');
  });
  root.querySelectorAll('div').forEach(node => {
    const children = [...node.children];
    const imageLinks = children.filter(child => child.matches('a') && child.querySelector('img'));
    if (imageLinks.length > 1 && imageLinks.length === children.length) node.classList.add('email-gallery-source');
    const actionLinks = children.filter(child => child.matches('a') && /^Смотреть(?:\s|$)/i.test(child.textContent.trim()));
    if (actionLinks.length) node.classList.add('email-actions-source');
    if (/^(?:Арт\.?|Артикул)\s*\d+/i.test(node.textContent.trim()) && !node.children.length) node.classList.add('email-sku-source');
    const ratingsTitle = children.find(child => /^(?:Редакционные оценки|Оценка модели)$/i.test(child.textContent.trim()));
    const ratingsGrid = ratingsTitle && children.find(child => child !== ratingsTitle && child.children.length > 1);
    if (ratingsTitle && ratingsGrid) {
      node.classList.add('email-ratings-panel');
      ratingsTitle.classList.add('email-ratings-title');
      ratingsGrid.classList.add('email-rating-grid');
      [...ratingsGrid.children].forEach(item => item.classList.add('email-rating-item'));
    }
  });
  root.querySelectorAll('strong').forEach(label => {
    if (!/^(?:Размеры в наличии|Доступные размеры)$/i.test(label.textContent.trim())) return;
    const panel = label.parentElement;
    const list = panel && [...panel.children].find(child => child !== label && child.children.length > 1);
    if (!panel || !list) return;
    panel.classList.add('email-size-panel');
    list.classList.add('email-size-list');
    [...list.children].forEach(item => item.classList.add('email-size-chip'));
    const commerce = panel.parentElement;
    const price = commerce && [...commerce.children].find(child => child !== panel && /(?:₽|руб\.)/i.test(child.textContent));
    if (commerce && price) {
      commerce.classList.add('email-commerce-source');
      price.classList.add('email-commerce-price');
    }
  });
  root.querySelectorAll('p').forEach(node => {
    const text = node.textContent.replace(/\u00a0/g,' ').trim();
    if (/^(?:Арт\.?|Артикул)\s*\d+/i.test(text)) node.classList.add('email-sku-source');
    if (/₽/.test(text) && node.querySelector('strong')) node.classList.add('email-price-source');
    if (/^Размеры\s*\{?(?:ХАСЛ|HASL)\}?\s*:/i.test(text)) node.classList.add('email-sizes-source');
    if (!text || /^(?:←\s*)?(?:Таблицу|Галерею).*(?:пальцем|двигать|листать)/i.test(text)) node.remove();
  });
  root.querySelectorAll('s,del').forEach(node => node.parentElement?.classList.add('email-price-source'));
  root.querySelectorAll('ul').forEach(node => {
    const items = [...node.children].filter(child => child.matches('li'));
    if (items.length > 1 && items.every(item => /[●○★☆]/.test(item.textContent))) node.classList.add('email-ratings-source');
  });
}

/** Убирает свойства, которые системно ломают Gmail, Яндекс, Mail.ru и Outlook. */
function removeUnsupportedInlineStyles(root) {
  const unsafeProperties = /^(?:grid(?:-.+)?|flex(?:-.+)?|gap|row-gap|column-gap|position|left|right|top|bottom|z-index|aspect-ratio|scroll-snap(?:-.+)?|transition(?:-.+)?|transform(?:-.+)?|overflow-x|overflow-y)$/i;
  for (const node of [root,...root.querySelectorAll('*')]) {
    const style = node.style;
    for (const property of [...style]) {
      const value = style.getPropertyValue(property);
      if (property.startsWith('--') || unsafeProperties.test(property) || /(?:var|clamp|min|max)\s*\(/i.test(value)) style.removeProperty(property);
    }
    if (/^(?:flex|inline-flex|grid|inline-grid)$/i.test(style.display)) style.display = 'block';
    style.removeProperty('min-width');
  }
}

/** Сохраняет пользовательское правило видимости при замене блока email-safe разметкой. */
function transferEmailDeviceVisibility(source,target) {
  if (source?.classList.contains('email-device-desktop')) target.classList.add('email-device-desktop');
  if (source?.classList.contains('email-device-mobile')) target.classList.add('email-device-mobile');
}

/** Заменяет CSS-карусель на двухколоночную таблицу: фотографии видны во всех почтовиках. */
function renderEmailGalleries(root) {
  for (const gallery of [...root.querySelectorAll('.om-gallery,.email-gallery-source')]) {
    const items = [...gallery.children].filter(node => node.matches('a,figure,img'));
    if (!items.length) continue;
    const table = document.createElement('table');
    table.setAttribute('width','100%');
    table.setAttribute('cellspacing','0');
    table.setAttribute('cellpadding','0');
    table.setAttribute('border','0');
    table.className = 'email-gallery';
    transferEmailDeviceVisibility(gallery,table);
    const body = table.createTBody();
    for (let index=0;index<items.length;index+=2) {
      const row = body.insertRow();
      for (let column=0;column<2;column++) {
        const cell = row.insertCell();
        cell.setAttribute('width','50%');
        const item = items[index+column];
        if (item) cell.append(item.cloneNode(true)); else cell.innerHTML = '&nbsp;';
      }
    }
    gallery.replaceWith(table);
  }
}

/** Превращает hero-шапку в таблицу: bgcolor не пропадает в NotiSend и мобильных почтовиках. */
function renderEmailHeroes(root) {
  for (const header of [...root.querySelectorAll('header')]) {
    if (!header.querySelector('h1')) continue;
    const background = header.style.backgroundColor || '#07111d';
    const rgb = background.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
    const bgcolor = rgb ? `#${rgb.slice(1,4).map(value => Number(value).toString(16).padStart(2,'0')).join('')}` : background;
    const table = document.createElement('table');
    table.className = 'email-hero';
    transferEmailDeviceVisibility(header,table);
    table.setAttribute('width','100%');
    table.setAttribute('cellspacing','0');
    table.setAttribute('cellpadding','0');
    table.setAttribute('border','0');
    table.setAttribute('bgcolor',bgcolor);
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.setAttribute('bgcolor',bgcolor);
    cell.append(...[...header.childNodes]);
    header.replaceWith(table);
  }
}

/** Заменяет flex/grid-оглавление строками таблицы, чтобы пункты не склеивались. */
function renderEmailToc(root) {
  for (const toc of [...root.querySelectorAll('.om-toc,.email-toc-source')]) {
    const container = [...toc.children].find(child => [...child.children].filter(node => node.matches('a')).length > 1);
    const links = container
      ? [...container.children].filter(node => node.matches('a'))
      : [...toc.children].filter(node => node.matches('a'));
    if (!links.length) continue;
    const table = document.createElement('table');
    table.className = 'email-toc-table';
    table.setAttribute('width','100%');
    table.setAttribute('cellspacing','0');
    table.setAttribute('cellpadding','0');
    table.setAttribute('border','0');
    table.setAttribute('bgcolor','#ffffff');
    links.forEach(link => {
      const row = table.insertRow();
      const cell = row.insertCell();
      cell.className = 'email-toc-cell';
      transferEmailDeviceVisibility(link,cell);
      cell.append(...[...link.childNodes].map(node => node.cloneNode(true)));
    });
    if (container) container.replaceWith(table);
    else {
      links.forEach(link => link.remove());
      toc.append(table);
    }
  }
}

/** Раскладывает показатели по три в ряд; на телефоне CSS перестраивает их по два. */
function fillComparisonMetrics(table,metrics) {
  table.innerHTML = '';
  const body = table.createTBody();
  let row = null;
  metrics.forEach((metric,index) => {
    if (index % 3 === 0) row = body.insertRow();
    const cell = row.insertCell();
    cell.setAttribute('width','33.33%');
    cell.setAttribute('valign','top');
    cell.className = 'email-comparison-metric';
    const label = document.createElement('span');
    label.textContent = metric.label;
    cell.append(label,...metric.value);
  });
}

/** Исправляет карточки из старых экспортов — и узкую строку, и прежний вертикальный вариант. */
function upgradeLegacyComparisonCards(root) {
  const knownLabel = /^(?:влага|ходьба|грунт|цена|размеры(?: в наличии)?|купить|сценарий|лучший сценарий|материалы|посадка \/ ограничение)$/i;
  for (const table of [...root.querySelectorAll('table')]) {
    let metrics = null;
    if (table.rows.length === 1 && table.rows[0].cells.length >= 3) {
      metrics = [...table.rows[0].cells].map(cell => {
        const label = cell.firstElementChild;
        if (!label?.matches('span') || !knownLabel.test(label.textContent.trim())) return null;
        return {label:label.textContent.trim(),value:[...cell.childNodes].filter(node => node !== label).map(node => node.cloneNode(true))};
      });
    } else if (table.rows.length >= 3 && [...table.rows].every(row => row.cells.length === 2 && knownLabel.test(row.cells[0].textContent.trim()))) {
      metrics = [...table.rows].map(row => ({label:row.cells[0].textContent.trim(),value:[...row.cells[1].childNodes].map(node => node.cloneNode(true))}));
    }
    if (!metrics || metrics.some(metric => !metric)) continue;
    fillComparisonMetrics(table,metrics);
  }
}

/** Переводит широкую сравнительную таблицу в карточки с подписями показателей. */
function renderEmailComparisons(root) {
  for (const table of [...root.querySelectorAll('table')]) {
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    const headerCells = headerRow ? [...headerRow.children].filter(cell => cell.matches('th,td') && !cell.classList.contains('om-comparison-thumb-column')) : [];
    const headers = headerCells.map(cell => cell.textContent.trim());
    if (headers.length < 2 || !table.classList.contains('om-comparison-table') && (headers.length < 3 || !/^модель$/i.test(headers[0]))) continue;
    const rows = [...table.querySelectorAll('tr')].filter(row => row !== headerRow && row.children.length > 1);
    if (!rows.length) continue;
    const list = document.createElement('div');
    list.className = 'email-comparison-list';
    rows.forEach((row,rowIndex) => {
      const cells = [...row.children].filter(cell => cell.matches('th,td') && !cell.classList.contains('om-comparison-thumb-column'));
      if (!cells.length) return;
      const card = document.createElement('table');
      card.setAttribute('width','100%');
      card.setAttribute('cellspacing','0');
      card.setAttribute('cellpadding','0');
      card.setAttribute('border','0');
      card.className = 'email-comparison-card';
      const body = card.createTBody();
      const titleRow = body.insertRow();
      const title = titleRow.insertCell();
      title.className = 'email-comparison-title';
      title.append(...[...cells[0].childNodes].map(node => node.cloneNode(true)));
      if (cells.length > 1) {
        const metricsRow = body.insertRow();
        const metricsCell = metricsRow.insertCell();
        metricsCell.className = 'email-comparison-metrics-cell';
        const metricsTable = document.createElement('table');
        metricsTable.setAttribute('width','100%');
        metricsTable.setAttribute('cellspacing','0');
        metricsTable.setAttribute('cellpadding','0');
        metricsTable.setAttribute('border','0');
        metricsTable.className = 'email-comparison-metrics';
        fillComparisonMetrics(metricsTable,cells.slice(1).map((cell,index) => ({
          label:headers[index+1] || cell.dataset.label || `Показатель ${index+1}`,
          value:[...cell.childNodes].map(node => node.cloneNode(true))
        })));
        metricsCell.append(metricsTable);
      }
      list.append(card);
    });
    const wrapper = table.parentElement?.tagName === 'DIV' && table.parentElement.children.length === 1 ? table.parentElement : table;
    transferEmailDeviceVisibility(wrapper,list);
    transferEmailDeviceVisibility(table,list);
    wrapper.replaceWith(list);
  }
}

/** Назначает ключевой дизайн inline, поскольку часть клиентов удаляет стили из head. */
function applyEmailDesign(root,siteKey = 'outmax_ru') {
  const hasl = siteKey === 'hasl_ru' || siteKey === 'hasle_com';
  const accent = hasl ? '#090b0d' : '#e31e24';
  const linkColor = hasl ? '#090b0d' : '#c9151b';
  const primaryBackground = hasl ? '#c7f500' : '#e31e24';
  const primaryColor = hasl ? '#090b0d' : '#ffffff';
  const secondaryBackground = hasl ? '#090b0d' : '#ffffff';
  const secondaryColor = hasl ? '#ffffff' : '#231815';
  const secondaryBorder = hasl ? '#090b0d' : '#cccccc';
  const heroBackground = hasl ? '#07111d' : '#ffffff';
  const heroHeading = hasl ? '#ffffff' : '#000000';
  const heroText = hasl ? '#d8dee6' : '#555555';
  setEmailStyle(root,'box-sizing:border-box;width:100%;margin:0 auto;padding:12px 28px;background:#ffffff;color:#231815;font-family:Arial,sans-serif;font-size:15px;line-height:1.55');
  root.querySelectorAll('header').forEach(node => setEmailStyle(node,'display:block;margin:0 0 32px'));
  root.querySelectorAll('h1').forEach(node => setEmailStyle(node,'margin:0 0 16px;color:#000000;font-family:Arial,sans-serif;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.02em'));
  root.querySelectorAll('h2').forEach(node => setEmailStyle(node,'margin:0 0 16px;color:#000000;font-family:Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700'));
  root.querySelectorAll('h3').forEach(node => setEmailStyle(node,'margin:0 0 13px;color:#000000;font-family:Arial,sans-serif;font-size:20px;line-height:1.3;font-weight:700'));
  root.querySelectorAll('h4,h5,h6,.om-h7').forEach(node => setEmailStyle(node,'margin:18px 0 10px;color:#111111;font-family:Arial,sans-serif;font-size:16px;line-height:1.35;font-weight:700'));
  root.querySelectorAll('p').forEach(node => setEmailStyle(node,'margin:0 0 15px;color:#3a3432;font-family:Arial,sans-serif;font-size:15px;line-height:1.55'));
  root.querySelectorAll('header>p').forEach(node => setEmailStyle(node,'margin:0 0 22px;color:#555555;font-family:Arial,sans-serif;font-size:17px;line-height:1.5'));
  root.querySelectorAll('a').forEach(node => setEmailStyle(node,`color:${linkColor};text-decoration:underline;font-weight:700`));
  root.querySelectorAll('img').forEach(node => {
    node.setAttribute('border','0');
    setEmailStyle(node,'display:block;max-width:100%;height:auto;border:0');
  });
  root.querySelectorAll('header>img,figure>img').forEach(node => {
    node.setAttribute('width','644');
    setEmailStyle(node,'display:block;width:100%;max-width:644px;height:auto;margin:0 auto;border:0;background:#f4f4f4');
  });
  root.querySelectorAll('figure').forEach(node => setEmailStyle(node,'display:block;margin:22px 0 30px'));
  root.querySelectorAll('figcaption').forEach(node => setEmailStyle(node,'margin-top:7px;color:#777777;font-size:12px;line-height:1.45'));
  root.querySelectorAll('.om-section,.email-section-source').forEach(node => {
    setEmailStyle(node,'display:block;margin:0 0 42px');
    // В статьях ХАСЛ карточка раздела иногда закрывалась псевдоэлементом.
    // В email псевдоэлементов нет, поэтому закрываем рамку реальной нижней границей.
    const hasSideFrame = node.style.borderLeftWidth !== '0px' || node.style.borderRightWidth !== '0px';
    if (hasSideFrame && node.style.borderBottomWidth === '0px') {
      node.style.setProperty('border-bottom','1px solid #e7e7e7','important');
    }
  });
  root.querySelectorAll('.om-section>h2,.email-section-source>h2').forEach(node => setEmailStyle(node,'margin:0 0 18px;padding:0 0 12px;border-bottom:1px solid #e5e5e5;color:#000000;font-family:Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700'));
  root.querySelectorAll('.om-toc,.email-toc-source').forEach(node => setEmailStyle(node,'display:block;margin:0 0 42px;padding:20px;background:#f5f5f5'));
  root.querySelectorAll('.om-toc>div,.email-toc-source>div').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0;background:#ffffff;border:1px solid #e5e5e5'));
  root.querySelectorAll('.om-toc a,.email-toc-source a,.email-toc-source>div>span').forEach(node => setEmailStyle(node,'display:block;min-height:0;padding:11px 14px;border-bottom:1px solid #e5e5e5;background:#ffffff;color:#231815;text-decoration:none;font-size:14px;line-height:1.4;font-weight:700'));
  root.querySelectorAll('.om-toc a span,.email-toc-source a span,.email-toc-source>div>span>span').forEach(node => setEmailStyle(node,`display:inline;margin-left:6px;padding:0;border:0;background:transparent;color:${accent};font-size:16px`));
  root.querySelectorAll('.email-hero').forEach(node => {
    node.setAttribute('bgcolor',heroBackground);
    setEmailStyle(node,`width:100%;margin:0 0 32px;border-collapse:collapse;table-layout:fixed;background:${heroBackground}`);
  });
  root.querySelectorAll('.email-hero td').forEach(node => {
    node.setAttribute('bgcolor',heroBackground);
    setEmailStyle(node,`padding:32px 24px 36px;background:${heroBackground};color:${heroHeading}!important`);
  });
  root.querySelectorAll('.email-hero h1').forEach(node => setEmailStyle(node,`color:${heroHeading}!important`));
  root.querySelectorAll('.email-hero p').forEach(node => setEmailStyle(node,`color:${heroText}!important`));
  root.querySelectorAll('.email-hero img').forEach(node => {node.setAttribute('width','596');setEmailStyle(node,'display:block;width:100%;max-width:596px;height:auto;margin:18px auto 0;border:0')});
  root.querySelectorAll('.email-toc-table').forEach(node => setEmailStyle(node,'width:100%;border:1px solid #e5e5e5;border-collapse:collapse;table-layout:fixed;background:#ffffff'));
  root.querySelectorAll('.email-toc-cell').forEach(node => setEmailStyle(node,'padding:12px 14px;border-bottom:1px solid #e5e5e5;background:#ffffff;color:#231815;font-size:14px;line-height:1.4;font-weight:700;text-transform:uppercase'));
  root.querySelectorAll('.email-toc-cell span').forEach(node => setEmailStyle(node,`display:inline;margin-left:6px;color:${accent};font-size:16px`));
  root.querySelectorAll('ul,ol').forEach(node => setEmailStyle(node,'margin:0 0 18px;padding-left:22px;color:#3a3432;font-size:14px;line-height:1.5'));
  root.querySelectorAll('li').forEach(node => setEmailStyle(node,'margin:0 0 8px'));
  root.querySelectorAll('.om-shortlist li').forEach(node => setEmailStyle(node,'display:block;margin:0;padding:13px 0;border-bottom:1px solid #e5e5e5'));
  root.querySelectorAll('.om-shortlist li>span:first-child').forEach(node => setEmailStyle(node,'display:block;margin:0 0 4px;color:#777777;font-size:11px;line-height:1.4;font-weight:700;text-transform:uppercase;letter-spacing:.04em'));
  root.querySelectorAll('.om-grid').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0 0 20px'));
  root.querySelectorAll('.om-grid>div').forEach(node => setEmailStyle(node,'display:block;margin:0 0 10px;padding:16px 18px;border:1px solid #e5e5e5;background:#f5f5f5'));
  root.querySelectorAll('.om-product,.email-product-source').forEach(node => setEmailStyle(node,`display:block;margin:24px 0 34px;padding:20px;border:1px solid #dddddd;border-top:3px solid ${accent};background:#ffffff`));
  root.querySelectorAll('.om-product h3,.email-product-source h3').forEach(node => setEmailStyle(node,'margin:0 0 15px;font-size:25px;line-height:1.22;word-break:normal;overflow-wrap:break-word;hyphens:none'));
  root.querySelectorAll('.om-product h3 *,.email-product-source h3 *').forEach(node => setEmailStyle(node,'font-size:inherit!important;line-height:inherit!important;word-break:normal!important;overflow-wrap:break-word!important;hyphens:none!important'));
  root.querySelectorAll('.om-sku,.email-sku-source').forEach(node => setEmailStyle(node,'display:block;margin:0 0 7px;color:#777777;font-size:11px;line-height:1.3;font-weight:700;text-transform:uppercase;letter-spacing:.06em'));
  root.querySelectorAll('.om-note,blockquote').forEach(node => setEmailStyle(node,`display:block;margin:0 0 20px;padding:17px 18px;border-left:4px solid ${accent};background:#f3f3f3`));
  root.querySelectorAll('.om-price,.email-price-source').forEach(node => setEmailStyle(node,`display:block;margin:18px 0;padding:14px 16px;border-left:3px solid ${accent};background:#f3f3f3;font-weight:700`));
  root.querySelectorAll('.email-price-source>span').forEach(node => setEmailStyle(node,'display:block;margin:0 0 7px;padding:0;border:0;background:transparent'));
  root.querySelectorAll('.om-price-amounts,.om-price-meta').forEach(node => setEmailStyle(node,'display:block;margin:0 0 6px;line-height:1.3'));
  root.querySelectorAll('.om-ratings,.email-ratings-source').forEach(node => setEmailStyle(node,'display:block;margin:14px 0 18px;padding:0;list-style:none;border-top:1px solid #e5e5e5'));
  root.querySelectorAll('.om-ratings li,.email-ratings-source li').forEach(node => setEmailStyle(node,'display:block;margin:0;padding:9px 0;border-bottom:1px solid #e5e5e5;font-size:14px;line-height:1.35'));
  root.querySelectorAll('.om-ratings li>span:first-child').forEach(node => setEmailStyle(node,'display:inline-block;width:56%;vertical-align:middle'));
  root.querySelectorAll('.om-stars').forEach(node => setEmailStyle(node,'display:inline-block;margin-left:12px;white-space:nowrap;vertical-align:middle;font-size:17px;line-height:1'));
  root.querySelectorAll('.om-star').forEach(node => setEmailStyle(node,`display:inline;color:${node.classList.contains('om-star--filled')?'#f2b600':'#b8b8b8'};font-size:17px;line-height:1`));
  root.querySelectorAll('.email-ratings-panel').forEach(node => setEmailStyle(node,'display:block;margin:16px 0;padding:14px;border:1px solid #ece9e9;background:#f7f6f6'));
  root.querySelectorAll('.email-ratings-title').forEach(node => {
    setEmailStyle(node,'display:block;margin:0 0 8px;color:#7a7a7a;font-size:12px;line-height:1.35;font-weight:800;letter-spacing:.08em;text-transform:uppercase');
    node.querySelectorAll('*').forEach(child => setEmailStyle(child,'color:#7a7a7a!important;font-size:12px!important;line-height:1.35!important;font-weight:800!important;letter-spacing:.08em!important'));
  });
  root.querySelectorAll('.email-rating-grid').forEach(node => setEmailStyle(node,'display:block;width:100%;font-size:0'));
  root.querySelectorAll('.email-rating-item').forEach(node => {
    setEmailStyle(node,'display:inline-block;width:50%;margin:0;padding:12px 14px;border:4px solid #f7f6f6;background:#ffffff;box-sizing:border-box;box-shadow:inset 0 0 0 1px #e3dfdf;vertical-align:top;color:#231815;font-size:14px;line-height:1.45');
    const children = [...node.children];
    const score = children.find(child => /^\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?$/.test(child.textContent.trim()));
    const stars = children.find(child => child !== score && /[★☆]/.test(child.textContent));
    const label = children.find(child => child !== score && child !== stars);
    if (score) setEmailStyle(score,'display:block;margin:0 0 4px;color:#000000;font-size:15px;line-height:1.25;font-weight:800');
    if (stars) {
      const rating = score?.textContent.trim().match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)$/);
      if (rating) {
        const value = Number(rating[1].replace(',','.'));
        const maximum = Math.min(10,Math.max(1,Number(rating[2])));
        stars.replaceChildren(...Array.from({length:maximum},(_,index) => {
          const star = document.createElement('span');
          star.textContent = '★';
          setEmailStyle(star,`display:inline;color:${index < Math.round(value) ? '#f2b600' : '#7a7a7a'};font-size:14px;line-height:1`);
          return star;
        }));
      }
      setEmailStyle(stars,'display:block;margin:0 0 6px;white-space:nowrap;font-size:14px;line-height:1');
    }
    if (label) setEmailStyle(label,'display:block;margin:0;color:#7a7a7a;font-size:12px;line-height:1.35');
  });
  root.querySelectorAll('.email-commerce-source').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:24px 0 16px;padding:18px;border:1px solid #eeeeee;background:#f7f6f6;box-sizing:border-box;font-size:0'));
  root.querySelectorAll('.email-commerce-price').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0;padding:0;box-sizing:border-box;font-size:15px'));
  root.querySelectorAll('.email-size-panel').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:18px 0 0;padding:0;box-sizing:border-box;font-size:14px'));
  root.querySelectorAll('.email-size-panel>strong').forEach(node => setEmailStyle(node,'display:block;margin:0 0 8px;font-size:13px;line-height:1.35;font-weight:800'));
  root.querySelectorAll('.email-size-list').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0;font-size:0'));
  root.querySelectorAll('.email-size-chip').forEach(node => setEmailStyle(node,'display:inline-block;width:33.33%;min-width:0;min-height:58px;margin:0;padding:10px 6px;border:4px solid #f7f6f6;background:#ffffff;color:#231815;box-sizing:border-box;box-shadow:inset 0 0 0 1px #d5d5d5;text-align:center;vertical-align:top;font-size:13px;line-height:20px;font-weight:700;word-break:normal;overflow-wrap:break-word'));
  root.querySelectorAll('.om-sizes,.email-sizes-source').forEach(node => {
    const textNodes = document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    while (textNodes.nextNode()) textNodes.currentNode.textContent = textNodes.currentNode.textContent.replace(/\{(ХАСЛ|HASL)\}/gi,'$1');
    setEmailStyle(node,`display:block;margin:16px 0 18px;padding:13px 14px;border-left:4px solid ${primaryBackground};background:#f3f3f3;color:#3a3432;font-size:14px;line-height:1.7`);
    const label = node.querySelector(':scope>strong');
    if (label) {
      setEmailStyle(label,`display:inline-block;margin:0 0 8px;padding:4px 8px;background:${primaryBackground};color:${primaryColor};font-size:11px;line-height:1.3;font-weight:800;text-transform:uppercase;letter-spacing:.04em`);
      if (label.nextSibling?.nodeName !== 'BR') label.after(document.createElement('br'));
    }
  });
  root.querySelectorAll('.om-price s,.om-price del,.email-price-source s,.email-price-source del').forEach(node => {
    setEmailStyle(node,'display:inline-block;margin-right:18px;color:#777777;font-size:16px;line-height:1.3;vertical-align:baseline;text-decoration:line-through!important;text-decoration-thickness:1px!important');
  });
  root.querySelectorAll('.om-price,.email-price-source').forEach(node => {
    const currentPrice = [...node.querySelectorAll('strong')].find(candidate => /₽/.test(candidate.textContent || ''));
    if (!currentPrice) return;
    setEmailStyle(currentPrice,'display:inline-block;margin:0;color:#000000;font-size:28px;line-height:1.2;font-weight:800;vertical-align:baseline');
    const amountGroup = currentPrice.parentElement;
    const oldPrice = amountGroup && [...amountGroup.children].find(candidate => candidate !== currentPrice && /₽/.test(candidate.textContent || ''));
    if (oldPrice) setEmailStyle(oldPrice,'display:inline-block;margin:0 18px 0 0;color:#777777;font-size:15px;line-height:1.3;vertical-align:baseline;text-decoration:line-through!important;text-decoration-thickness:1px!important');
  });
  root.querySelectorAll('.om-actions').forEach(node => setEmailStyle(node,'display:block;margin:17px 0 0'));
  root.querySelectorAll('.om-actions a,.om-conclusion>a').forEach(node => setEmailStyle(node,`display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:1px solid ${primaryBackground};background:${primaryBackground};color:${primaryColor};text-decoration:none;font-size:14px;line-height:20px;font-weight:700`));
  root.querySelectorAll('.email-actions-source').forEach(node => {
    setEmailStyle(node,'display:block;margin:18px 0 0');
    [...node.children].filter(child => child.matches('a')).forEach((link,index) => setEmailStyle(link,index === 0
      ? `display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:1px solid ${primaryBackground};background:${primaryBackground};color:${primaryColor};text-decoration:none;font-size:14px;line-height:20px;font-weight:700`
      : `display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:1px solid ${secondaryBorder};background:${secondaryBackground};color:${secondaryColor};text-decoration:none;font-size:14px;line-height:20px;font-weight:700`));
  });
  root.querySelectorAll('.om-actions,.om-cta,.email-actions-source').forEach(node => {
    const primary = [...node.children].find(child => child.matches('a'));
    if (!primary) return;
    primary.style.setProperty('border-color',primaryBackground,'important');
    primary.style.setProperty('border-style','solid','important');
    primary.style.setProperty('border-width','1px','important');
  });
  root.querySelectorAll('.email-gallery').forEach(node => setEmailStyle(node,'width:100%;margin:16px 0 18px;border-collapse:collapse;table-layout:fixed'));
  root.querySelectorAll('.email-gallery td').forEach(node => setEmailStyle(node,'width:50%;padding:0 4px 8px;vertical-align:top'));
  root.querySelectorAll('.email-gallery a').forEach(node => setEmailStyle(node,'display:block;color:#c9151b;text-decoration:none'));
  root.querySelectorAll('.email-gallery img').forEach(node => {node.setAttribute('width','298');setEmailStyle(node,'display:block;width:100%;max-width:298px;height:auto;border:0;background:#f5f5f5')});
  root.querySelectorAll('.email-comparison-list').forEach(node => setEmailStyle(node,'display:block;margin:20px 0 26px'));
  root.querySelectorAll('.email-comparison-card').forEach(node => setEmailStyle(node,'width:100%;margin:0 0 10px;border:1px solid #dddddd;border-collapse:collapse;table-layout:fixed;background:#ffffff'));
  root.querySelectorAll('.email-comparison-title').forEach(node => setEmailStyle(node,'padding:12px 14px;border-bottom:1px solid #dddddd;text-align:left;vertical-align:middle;font-size:14px;line-height:1.4;font-weight:700'));
  root.querySelectorAll('.email-comparison-metrics-cell').forEach(node => setEmailStyle(node,'padding:0;border-bottom:1px solid #dddddd'));
  root.querySelectorAll('.email-comparison-title .om-model-cell').forEach(node => setEmailStyle(node,'display:block;width:100%'));
  root.querySelectorAll('.email-comparison-title img').forEach(node => {node.setAttribute('width','52');setEmailStyle(node,'display:inline-block;width:52px;height:52px;margin:0 10px 0 0;vertical-align:middle;object-fit:contain;border:0')});
  root.querySelectorAll('.email-comparison-metrics').forEach(node => setEmailStyle(node,'width:100%;border-collapse:collapse;table-layout:fixed'));
  root.querySelectorAll('.email-comparison-metric').forEach(node => setEmailStyle(node,'width:33.33%;padding:11px 10px;border-right:1px solid #eeeeee;border-bottom:1px solid #eeeeee;background:#ffffff;color:#231815;box-sizing:border-box;text-align:left;vertical-align:top;font-size:14px;line-height:1.4;font-weight:700;overflow-wrap:anywhere'));
  root.querySelectorAll('.email-comparison-metric>span:first-child').forEach(node => setEmailStyle(node,'display:block;margin:0 0 5px;color:#777777;font-size:10px;line-height:1.3;font-weight:700;text-transform:uppercase'));
  root.querySelectorAll('.email-comparison-metric>a').forEach(node => setEmailStyle(node,`display:block;width:100%;padding:10px 8px;border:1px solid ${primaryBackground};background:${primaryBackground};color:${primaryColor};box-sizing:border-box;text-align:center;text-decoration:none;font-size:13px;line-height:18px;font-weight:800`));
  root.querySelectorAll('.om-cta').forEach(node => setEmailStyle(node,'display:block;margin:20px 0 30px'));
  root.querySelectorAll('.om-cta a,.om-button').forEach(node => setEmailStyle(node,`display:inline-block;padding:14px 22px;border:2px solid ${primaryBackground};background:${primaryBackground};color:${primaryColor};text-decoration:none;text-align:center;font-size:14px;line-height:20px;font-weight:800`));
  root.querySelectorAll('.om-actions a,.om-conclusion>a,.email-actions-source>a,.om-cta a,.om-button').forEach(node => {
    node.style.setProperty('min-height','0','important');
    node.style.setProperty('border-radius',hasl ? '0' : '7px','important');
    node.style.setProperty('padding','14px 20px','important');
    node.style.setProperty('line-height','20px','important');
    node.style.setProperty('vertical-align','middle','important');
  });
  if (hasl) {
    root.querySelectorAll('.email-promo-source').forEach(node => setEmailStyle(node,'display:block;margin:0;padding:28px 24px;background:#090b0d!important;color:#ffffff!important;border:1px solid #090b0d!important'));
    root.querySelectorAll('.email-promo-source h2').forEach(node => setEmailStyle(node,'color:#c7f500!important;border-bottom-color:#394047!important'));
    root.querySelectorAll('.email-promo-source p,.email-promo-source div,.email-promo-source span').forEach(node => setEmailStyle(node,'color:#ffffff!important'));
    root.querySelectorAll('.email-promo-source strong').forEach(node => setEmailStyle(node,'color:#c7f500!important'));
    root.querySelectorAll('.email-promo-source a').forEach(node => setEmailStyle(node,'display:block;width:100%;padding:14px 18px;background:#c7f500!important;color:#090b0d!important;border:1px solid #c7f500!important;box-sizing:border-box;text-align:center;text-decoration:none;font-weight:800'));
  } else {
    root.style.setProperty('color','#231815','important');
    root.querySelectorAll('p,li').forEach(node => node.style.setProperty('color','#3a3432','important'));
    root.querySelectorAll('.email-toc-cell').forEach(node => node.style.setProperty('color','#231815','important'));
    root.querySelectorAll('.email-comparison-card td,.email-comparison-card th,.email-comparison-card strong').forEach(node => node.style.setProperty('color','#231815','important'));
    root.querySelectorAll('.email-comparison-metric>span:first-child').forEach(node => node.style.setProperty('color','#4a4543','important'));
    root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,a,strong').forEach(node => {
      node.style.setProperty('word-break','normal','important');
      node.style.setProperty('overflow-wrap','break-word','important');
    });
    const rounded = [
      ['.om-product,.email-product-source','10px'],
      ['.email-commerce-source,.email-toc-source,.om-toc','10px'],
      ['.email-ratings-panel,.email-info-block,.om-callout,.om-note,blockquote,.om-price,.email-price-source','8px'],
      ['.email-rating-item,.email-size-chip,.email-comparison-card,img','8px'],
      ['.om-actions a,.om-conclusion>a,.email-actions-source>a,.om-cta a,.om-button,.email-comparison-metric>a','7px']
    ];
    rounded.forEach(([selector,radius]) => root.querySelectorAll(selector).forEach(node => node.style.setProperty('border-radius',radius,'important')));
  }
  if (hasl) root.querySelectorAll('*').forEach(node => {
    if (node.style.borderRadius && node.style.borderRadius !== '0px') node.style.setProperty('border-radius','0','important');
  });
  if (root.lastElementChild) setEmailStyle(root.lastElementChild,'margin-bottom:0');
  if (hasl) removeHaslBlue(root);
  repairDarkBackgroundContrast(root);
}

/** Меняет тег, сохраняя содержимое и уже рассчитанные inline-стили. */
function replaceEmailTag(node,tagName) {
  const replacement = document.createElement(tagName);
  for (const attribute of [...node.attributes]) replacement.setAttribute(attribute.name,attribute.value);
  while (node.firstChild) replacement.append(node.firstChild);
  node.replaceWith(replacement);
  return replacement;
}

/** Приводит письмо к фактическому белому списку HTML, который сохраняет NotiSend. */
function normalizeNotiSendMarkup(root) {
  const tagMap = new Map([
    ['article','div'],['aside','div'],['blockquote','div'],['figure','div'],['footer','div'],
    ['header','div'],['main','div'],['nav','div'],['section','div'],['figcaption','p'],
    ['h4','h3'],['h5','h3'],['h6','h3'],['ol','ul'],['b','strong'],['em','span'],['i','span']
  ]);
  for (const node of [...root.querySelectorAll('*')]) {
    if (!root.contains(node)) continue;
    const tag = node.tagName.toLowerCase();
    if (tagMap.has(tag)) replaceEmailTag(node,tagMap.get(tag));
  }
  for (const link of [...root.querySelectorAll('a[href^="#"]')]) replaceEmailTag(link,'span');
  for (const node of [...root.querySelectorAll('*')]) {
    if (!root.contains(node)) continue;
    const tag = node.tagName.toLowerCase();
    if (!NOTISEND_ALLOWED_TAGS.has(tag)) replaceEmailTag(node,getComputedStyle(node).display === 'inline' ? 'span' : 'div');
  }
  for (const node of [root,...root.querySelectorAll('*')]) {
    node.removeAttribute('id');
    node.removeAttribute('role');
    const responsiveClasses = [...node.classList].filter(className => EMAIL_RESPONSIVE_CLASSES.has(className));
    if (responsiveClasses.length) node.className = responsiveClasses.join(' '); else node.removeAttribute('class');
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-') || attribute.name.startsWith('aria-')) node.removeAttribute(attribute.name);
    }
  }
}

function preparedContent(siteKey) {
  const element = document.createElement('div');
  element.className = window.emailImportState?.root?.className || 'om-guide';
  element.classList.add('email-body');
  element.innerHTML = canvas.innerHTML;
  markEmailStructures(element);
  removeUnsupportedInlineStyles(element);
  element.removeAttribute('contenteditable');
  element.querySelectorAll('[data-selected-block]').forEach(node => node.removeAttribute('data-selected-block'));
  for (const node of element.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('on') || ['contenteditable','draggable','loading','decoding','srcset','sizes'].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
  }
  for (const link of element.querySelectorAll('a[href]')) {
    const href = absoluteBrandUrl(link.getAttribute('href'),siteKey);
    link.setAttribute('href',href);
    if (/^https?:/i.test(href)) link.setAttribute('target','_blank');
  }
  for (const image of element.querySelectorAll('img')) {
    const src = exportImageSource(image,siteKey);
    if (src) image.setAttribute('src',src);
    image.removeAttribute('data-email-src');
  }
  upgradeLegacyComparisonCards(element);
  renderEmailGalleries(element);
  renderEmailComparisons(element);
  renderEmailHeroes(element);
  renderEmailToc(element);
  applyEmailDesign(element,siteKey);
  element.querySelectorAll('.email-no-section-line').forEach(node => node.style.setProperty('border-bottom','0','important'));
  normalizeNotiSendMarkup(element);
  // tbody/thead keep nested comparison tables structurally intact. Removing
  // them made some editors reconstruct the final row outside its table.
  return element.outerHTML;
}

function embeddedStyles() {
  return `<style type="text/css">${EMAIL_FALLBACK_CSS}</style>`;
}

function emailSystemFooter(siteKey = 'outmax_ru') {
  const site = emailSite(siteKey);
  const brand = escapeHtml(site.brand);
  const domain = escapeHtml(site.domain);
  return `<table width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7f7f7" style="width:100%;background:#f7f7f7;border-collapse:collapse"><tr><td align="center" style="padding:22px 18px;font-family:Arial,sans-serif;color:#777;font-size:11px;line-height:1.55;text-align:center"><strong style="display:block;color:#333;font-size:11px;margin-bottom:5px">${brand}</strong><span style="display:block">Вы получили это письмо, потому что подписались на рассылку ${domain}.</span><a href="[%unsubscribe_link%]" style="display:inline-block;margin-top:8px;color:#777;text-decoration:underline">Отписаться от рассылки</a></td></tr></table>`;
}

function emailPublicAssetUrl(filename) {
  const localOrigin = typeof location !== 'undefined' && /^https?:$/i.test(location.protocol)
    ? location.origin : 'https://news.outmax-office.ru';
  return `${localOrigin}/editor-api/public-email-images/${filename}`;
}

const EMAIL_CHROME_ASSETS = {"BLOG_mobil.png": "65d97c1b8e58031b63b6a6319f84cdb66cec871975d80dcb6b122585638e4974.png", "blog_white.png": "b98e4345c99d9e2c12e9435375ecfdcc4ceb8adeda074d17f33faebff79cce5d.png", "MAX_mobil.png": "6bc1be22c200c0e8bf81241e0db757f77fc63d8add4d17b3c33bbdcfb5fb0601.png", "max_white.png": "7bb22d20ea6e34c8aa6e6c779d04673d77d3124fd62b2254f61132e28272e672.png", "TG_mobil.png": "a7939cb53bde0f07836d8703315b09433ee1c1fb4309dfe2f762d02c02968795.png", "tg_white.png": "e3c0eb76c28804855965ad551afce7c16dbb72335e4cfae9521c12b62c09bbbd.png", "VK_mobil.png": "8a4df95a1c42269a2bc9758eda94bdc8a9794060306617943becd9fd2e24f65a.png", "vk_white.png": "4b2d0d925465f1163901c68e51bdf7b5867e92075259c808f0a283eedfb0782a.png"};
EMAIL_CHROME_ASSETS['logo_animate_hasle.gif']='cd3df676e2a0e520c655476f18ffb54927f4fd72904bc4a0383080b76837b84d.gif';
function storeEmailChromeSettings(settings) {
 const state=window.emailImportState;state.chromeByBrand ||= {};
 if(state.chrome?.brand)state.chromeByBrand[state.chrome.brand]=state.chrome;
 state.chrome=settings;state.chromeByBrand[settings.brand]=settings;
}
function emailChromeSettings(siteKey=typeof activeSite==='string'?activeSite:'outmax_ru') {
  const brand=String(siteKey).startsWith('hasl')?'hasl':'outmax';
  let saved=window.emailImportState?.chromeByBrand?.[brand] || (window.emailImportState?.chrome?.brand && window.emailImportState.chrome.brand!==brand ? {} : window.emailImportState?.chrome) || {};
  if(brand==='hasl'&&!saved.brand){saved=structuredClone(saved);if(saved.phone==='8 (800) 775-77-43')delete saved.phone;if(saved.mobileLogo==='/snickers/')delete saved.mobileLogo;if(saved.menu?.some(item=>item.url==='/snickers/'))delete saved.menu;if(saved.socials?.vk==='https://vk.com/outmaxshopru')delete saved.socials;}
  if(brand==='hasl')return {brand,logoImage:'',background:'#ffffff',backgroundImage:'',banner:'',bannerUrl:'',phone:'8 (800) 777-97-10',desktopLogo:'/',mobileLogo:'/',menu:[{label:'КРОССОВКИ',url:siteKey==='hasl_ru'?'/krossovki':'/sneakers'},{label:'ОДЕЖДА',url:'/odezhda'},{label:'ОТЗЫВЫ',url:'/testimonials'}],promos:[{image:'',url:'/news/aktsii-i-promokody',label:'ПЕРЕЙТИ К АКЦИИ'},{image:'',url:'/news/aktsii-i-promokody',label:'ПЕРЕЙТИ К АКЦИИ'}],socials:{tg:'https://t.me/haslrf',vk:'https://vk.com/xaslrf',max:'https://max.ru/u/f9LHodD0cOI2Gk4gSwOr-ARhFnttbsxwCfkn3rn5MwhDr3fWBqbsv03xar4',blog:'/news'},...saved,brand};
  return {brand,logoImage:'',bannerUrl:'',background:'#fafafa',backgroundImage:'',banner:'',phone:'8 (800) 775-77-43',desktopLogo:'/',mobileLogo:'/snickers/',
    menu:[{label:'КРОССОВКИ',url:'/snickers/'},{label:'ОДЕЖДА',url:'/clothes/'},{label:'АКСЕССУАРЫ',url:'/accessories/'},{label:'ОТЗЫВЫ',url:'/testimonials/'}],
    promos:[{image:'',url:'/sale/',label:'ПЕРЕЙТИ К АКЦИИ'},{image:'',url:'/sale/',label:'ПЕРЕЙТИ К АКЦИИ'}],
    socials:{vk:'https://vk.com/outmaxshopru',tg:'https://t.me/outmaxshop',max:'https://max.ru/u/f9LHodD0cOIiz-_MMgOoSqFQmXl6GwDT2vyxkHD_Wvz9_F_2V8SaejUnjac',blog:'/blog'},...saved};
}
function emailChromeUrl(value,siteKey,image=false) {
  const raw=String(value||'').trim();
  if(!raw)return '';
  try {const base=new URL(`https://${emailSite(siteKey).domain}/`),url=new URL(raw,base);
    if(!image&&String(siteKey).startsWith('hasl')&&['xn--80awro.xn--p1ai','haslestore.com'].includes(url.hostname.replace(/^www\./,''))){url.hostname=base.hostname;if(/^\/(?:sneakers|krossovki)\/?$/.test(url.pathname))url.pathname=siteKey==='hasl_ru'?'/krossovki':'/sneakers';}
    return /^https?:$/.test(url.protocol)?url.href:'';}catch{return '';}
}
function emailChromeImage(value,siteKey='outmax_ru') {
  const path=/^https?:\/\//i.test(value||'')?new URL(value).href:cleanPath(value || '');
  if(window.emailChromePreview && typeof assetUrls!=='undefined' && assetUrls.has(path))return assetUrls.get(path);
  return emailChromeUrl(value,siteKey,true);
}
function emailBackgroundStyle() {
  const settings=emailChromeSettings(),color=/^#[0-9a-f]{6}$/i.test(settings.background)?settings.background:'#fafafa';
  const image=emailChromeImage(settings.backgroundImage,typeof activeSite==='string'?activeSite:'outmax_ru');
  return `background-color:${color};${image?`background-image:url('${image.replace(/'/g,'%27')}');background-position:center top;background-repeat:repeat;background-size:cover;`:''}`;
}
function emailBannerBlock() {
  const url=emailChromeImage(emailChromeSettings().banner,typeof activeSite==='string'?activeSite:'outmax_ru');
  const link=emailChromeUrl(emailChromeSettings().bannerUrl,typeof activeSite==='string'?activeSite:'outmax_ru');
  const image=url?`<img src="${escapeHtml(url)}" width="644" alt="Баннер рассылки" style="display:block;width:100%;max-width:644px;height:auto;margin:0 auto;border:0">`:null;
  return `<table class="email-top-banner" width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:30px 28px 0;text-align:center">${url?(link?`<a href="${escapeHtml(link)}" target="_blank" style="display:block">${image}</a>`:image):'<div class="email-banner-placeholder" style="padding:54px 20px;background:#e9edf1;color:#747d87;text-align:center;font:14px Arial,sans-serif">Баннер рассылки<br><span style="font-size:12px">Добавьте ссылку на фотографию в настройках</span></div>'}</td></tr></table>`;
}
function outmaxEmailFooter(siteKey) {
  if(String(siteKey).startsWith('hasl'))return haslEmailFooter(siteKey);
  const settings=emailChromeSettings(siteKey);
  const cards=settings.promos.map((promo,index)=>{const image=emailChromeImage(promo.image,siteKey),url=escapeHtml(emailChromeUrl(promo.url,siteKey));return `<td class="outmax-promo-cell" width="50%" valign="top" style="width:50%;padding:15px 20px;vertical-align:top"><a href="${url}" target="_blank" style="display:block;width:100%;max-width:250px;margin:0 auto;text-decoration:none">${image?`<img src="${escapeHtml(image)}" width="250" alt="Акция ${index+1}" style="display:block;width:100%;max-width:250px;height:auto;margin:0 auto;border:0">`:`<div style="height:275px;box-sizing:border-box;padding:100px 12px;background:${index?'#fff4ba':'#e4eef8'};text-align:center;color:#555;font:700 20px Arial,sans-serif">Акция ${index+1}<br><span style="font:12px Arial,sans-serif">Добавьте фотографию</span></div>`}</a><a href="${url}" target="_blank" style="display:block;width:100%;max-width:250px;margin:28px auto 0;padding:20px 8px;box-sizing:border-box;background:#ed161f;color:#fff;text-align:center;text-decoration:none;font:700 14px Arial,sans-serif">${escapeHtml(promo.label)}</a></td>`;}).join('');
  const names={vk:'VK',tg:'Telegram',max:'MAX',blog:'Блог'};
  const socials=Object.entries(settings.socials).map(([key,value])=>`<td class="outmax-social-cell" width="25%" align="center" style="width:25%;padding:16px 8px;text-align:center!important"><a class="outmax-social-link" href="${escapeHtml(emailChromeUrl(value,siteKey))}" target="_blank" style="display:block;color:#fff;text-decoration:none;font:700 12px Arial,sans-serif"><img class="outmax-social-desktop" src="${emailPublicAssetUrl(EMAIL_CHROME_ASSETS[key+'_white.png'])}" width="48" height="48" alt="${names[key]}" style="display:block;width:48px!important;max-width:48px!important;height:48px!important;margin:0 auto"><img class="outmax-social-mobile" src="${emailPublicAssetUrl(EMAIL_CHROME_ASSETS[key+'_white.png'])}" width="40" height="40" alt="${names[key]}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;width:40px!important;max-width:40px!important;height:40px!important;margin:0 auto"><span class="outmax-social-label" style="display:block;padding-top:12px">${names[key]}</span></a></td>`).join('');
  const tel=settings.phone.replace(/[^+0-9]/g,'');
  return `<div class="outmax-email-footer"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:28px;background:#fff"><table class="outmax-promo-table" width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #ddd;border-bottom:1px solid #ddd"><tr>${cards}</tr></table></td></tr><tr><td class="outmax-footer-phone" bgcolor="#282828" style="padding:30px 36px 12px;background:#282828;text-align:left!important"><p style="margin:0 0 12px;color:#aaa;font:12px Arial,sans-serif">ОСТАЁМСЯ НА СВЯЗИ</p><a href="tel:${tel}" class="outmax-phone-text" style="color:#fff;text-decoration:none;overflow-wrap:anywhere;font:700 30px Arial,sans-serif">${escapeHtml(settings.phone)}</a></td></tr><tr><td class="outmax-footer-socials" bgcolor="#282828" style="padding:8px 30px 24px;background:#282828"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#282828"><tr>${socials}</tr></table></td></tr><tr><td class="outmax-footer-legal" bgcolor="#282828" style="padding:24px 36px 30px;background:#282828;text-align:left!important;color:#aaa;font:11px/1.6 Arial,sans-serif">Вы получили это письмо на электронный адрес [%email%],<br>так как являетесь клиентом <strong>OUTMAX SHOP</strong><br><a href="[%unsubscribe_link%]" style="display:inline-block;padding-top:12px;color:#ccc;text-decoration:underline">Отписаться от рассылки</a></td></tr></table></div>`;
}

function outmaxEmailHeader(siteKey = 'outmax_ru') {
  if (String(siteKey).startsWith('hasl')) return haslEmailHeader(siteKey);
  const site = emailSite(siteKey);
  const root = `https://${site.domain}/`;
  const logo = emailChromeImage(emailChromeSettings().logoImage,siteKey) || emailPublicAssetUrl(OUTMAX_EMAIL_LOGO_PUBLIC_NAME);
  const settings=emailChromeSettings(siteKey);
  const menu=settings.menu.map(item=>[item.label,emailChromeUrl(item.url,siteKey)]);
  const mark=`<img class="outmax-email-header-logo" src="${logo}" width="80" height="80" alt="OUTMAX" style="display:block!important;width:80px!important;min-width:80px!important;max-width:80px!important;height:80px!important;max-height:80px!important;margin:0 auto!important;border:0">`;
  const nav=menu.map(([label,path])=>`<td width="${100/menu.length}%" align="center" style="width:${100/menu.length}%;padding:0 8px;text-align:center!important"><a href="${escapeHtml(path)}" target="_blank" style="display:block;padding:18px 0;color:#fff;font:700 12px/14px Arial,sans-serif;text-align:center!important;text-decoration:none;overflow-wrap:break-word">${escapeHtml(label)}</a></td>`).join('');
  const desktop=`<table class="outmax-email-header-desktop" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;background:#fff;border-collapse:collapse"><tr><td align="center" style="padding:28px 20px;font-size:0;line-height:0;text-align:center!important"><a href="${escapeHtml(emailChromeUrl(settings.desktopLogo,siteKey))}" target="_blank" style="display:inline-block!important;width:80px!important;max-width:80px!important;vertical-align:top">${mark}</a></td></tr><tr><td bgcolor="#282828" style="padding:0 12px;background:#282828;border-bottom:2px solid #e31e24;text-align:center!important"><table class="outmax-email-nav" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto!important;background:#282828"><tr>${nav}</tr></table></td></tr></table>`;
  const mobile=`<table class="outmax-email-header-mobile" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="display:none;width:100%;max-height:0;overflow:hidden;background:#fff;mso-hide:all"><tr><td align="center" style="padding:24px 20px;font-size:0;line-height:0;text-align:center!important"><a href="${escapeHtml(emailChromeUrl(settings.mobileLogo,siteKey))}" target="_blank" style="display:inline-block!important;width:80px!important;max-width:80px!important;vertical-align:top">${mark}</a></td></tr></table>`;
  return desktop + mobile;
}

function haslEmailHeader(siteKey) {
 const c=emailChromeSettings(siteKey),logo=emailChromeImage(c.logoImage,siteKey)||emailPublicAssetUrl(EMAIL_CHROME_ASSETS['logo_animate_hasle.gif']);
 const mark=`<img class="hasl-email-logo" src="${escapeHtml(logo)}" width="124" height="55" alt="ХАСЛ" style="display:block!important;width:124px!important;max-width:124px!important;height:55px!important;margin:0 auto!important;border:0">`;
 const nav=c.menu.map((item,index)=>`<td width="${100/c.menu.length}%" style="width:${100/c.menu.length}%;padding:0 8px"><a href="${escapeHtml(emailChromeUrl(item.url,siteKey))}" target="_blank" style="display:block;padding:14px 6px;background:${index===c.menu.length-1?'#c7f500':'#fff'};border:${index===c.menu.length-1?'0':'1px solid #000000'};color:#111;text-align:center!important;text-decoration:none;font:700 13px/18px Arial,sans-serif;overflow-wrap:break-word">${escapeHtml(item.label)}</a></td>`).join('');
 return `<table class="hasl-email-header" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#fff;border-bottom:3px solid #c7f500"><tr><td align="center" style="padding:24px 20px;text-align:center!important;font-size:0;line-height:0"><a href="${escapeHtml(emailChromeUrl(c.desktopLogo,siteKey))}" target="_blank" class="hasl-logo-desktop" style="display:inline-block;margin:0 auto!important;width:124px!important;max-width:124px!important">${mark}</a><a class="hasl-logo-mobile" href="${escapeHtml(emailChromeUrl(c.mobileLogo,siteKey))}" target="_blank" style="display:none;width:124px!important;max-width:124px!important">${mark}</a></td></tr><tr class="hasl-email-menu"><td style="padding:0 24px 14px"> <table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${nav}</tr></table></td></tr></table>`;
}
function haslEmailFooter(siteKey) {
 const c=emailChromeSettings(siteKey),dark='#0b1217';
 const cards=c.promos.map((p,i)=>{const image=emailChromeImage(p.image,siteKey),href=escapeHtml(emailChromeUrl(p.url,siteKey));return `<td class="outmax-promo-cell" width="50%" valign="top" style="width:50%;padding:12px;vertical-align:top"><a href="${href}" target="_blank" style="display:block;width:100%;max-width:265px;margin:0 auto;text-decoration:none;color:#fff">${image?`<img src="${escapeHtml(image)}" width="265" alt="Акция ${i+1}" style="display:block;width:100%;max-width:265px;height:auto;border:0;margin:0 auto">`:`<div style="height:275px;padding:100px 12px;box-sizing:border-box;background:${i?'#1b2938':'#162331'};text-align:center;color:#fff;font:700 20px Arial,sans-serif">Акция ${i+1}<br><span style="font:12px Arial,sans-serif;color:#a6adb5">Добавьте фотографию</span></div>`}</a><a href="${href}" target="_blank" style="display:block;padding:18px 8px;margin:18px auto 0;max-width:265px;background:#c7f500;color:#0b1217;text-decoration:none;text-align:center;font:700 14px Arial,sans-serif">${escapeHtml(p.label)}</a></td>`;}).join('');
 const labels={tg:'МЫ В ТГ',vk:'МЫ В ВК',max:'МЫ В MAX',blog:'НАШ БЛОГ'};
 const socials=Object.entries(c.socials).map(([key,url])=>`<td class="outmax-social-cell" width="25%" align="center" style="width:25%;padding:16px 8px;text-align:center!important"><a class="outmax-social-link" href="${escapeHtml(emailChromeUrl(url,siteKey))}" target="_blank" style="display:block;color:#fff;text-decoration:none;font:700 18px Arial,sans-serif"><img class="outmax-social-desktop" src="${emailPublicAssetUrl(EMAIL_CHROME_ASSETS[key+'_white.png'])}" width="48" height="48" alt="${labels[key]}" style="display:block;width:48px!important;max-width:48px!important;height:48px!important;margin:0 auto"><img class="outmax-social-mobile" src="${emailPublicAssetUrl(EMAIL_CHROME_ASSETS[key+'_white.png'])}" width="40" height="40" alt="${labels[key]}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;width:40px!important;max-width:40px!important;height:40px!important;margin:0 auto"><span class="hasl-social-label" style="display:block;padding-top:12px;color:#e4e9ed;font:700 11px Arial,sans-serif">${labels[key]}</span></a></td>`).join('');
 const logo=emailChromeImage(c.logoImage,siteKey)||emailPublicAssetUrl(EMAIL_CHROME_ASSETS['logo_animate_hasle.gif']);
 return `<div class="hasl-email-footer"><table width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${dark}"><tr><td style="padding:28px 28px 16px;background:${dark}"><table width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${dark}" style="width:100%;background:${dark}"><tr>${cards}</tr></table></td></tr><tr><td class="hasl-footer-phone" style="padding:8px 36px 12px;background:${dark}"><div style="padding:24px 0 12px;background:${dark};text-align:left!important"><p style="margin:0 0 12px;color:#94a0aa;font:11px Arial,sans-serif;letter-spacing:1.5px">НА СВЯЗИ С ХАСЛ</p><a href="tel:${c.phone.replace(/[^+0-9]/g,'')}" style="color:#fff;text-decoration:none;font:700 30px/1.2 Arial,sans-serif;overflow-wrap:anywhere">${escapeHtml(c.phone)}</a></div></td></tr><tr><td bgcolor="${dark}" style="padding:16px 28px;background:${dark}"><table width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${dark}"><tr>${socials}</tr></table></td></tr><tr><td class="hasl-footer-legal" bgcolor="${dark}" style="padding:24px 36px;background:${dark};text-align:left!important;color:#a6b0b8;font:12px/1.6 Arial,sans-serif">Вы получили это письмо на электронный адрес [%email%], являетесь клиентом или подписались на рассылку <strong>ХАСЛ</strong>. Данное письмо не является офертой. Все цены действительны на момент совершения рассылки.<br><br>Если вы не хотите больше получать наши письма, перейдите по <a href="[%unsubscribe_link%]" style="color:#fff;text-decoration:underline">ссылке отписаться от рассылки</a><br><br><a href="${escapeHtml(emailChromeUrl(c.desktopLogo,siteKey))}"><img src="${escapeHtml(logo)}" width="60" height="26" alt="ХАСЛ" style="display:block;width:60px!important;max-width:60px!important;height:26px!important;margin:12px auto 0"></a></td></tr></table></div>`;
}

function emailBlock(siteKey = 'outmax_ru') {
  const preheader = escapeHtml($('#preheader').value.trim());
  const header = outmaxEmailHeader(siteKey);
  const content = preparedContent(siteKey);
  const footer = outmaxEmailFooter(siteKey);
  return `${embeddedStyles()}<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}${'&nbsp;&#847;'.repeat(12)}</div><table class="email-outer" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${emailChromeSettings().background}" style="width:100%;margin:0;${emailBackgroundStyle()}table-layout:fixed"><tr><td align="center" valign="top" style="padding:0"><table class="email-shell" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${emailChromeSettings().background}" style="width:100%;max-width:${EMAIL_WIDTH}px;${emailBackgroundStyle()}table-layout:fixed"><tr><td class="email-content" style="width:100%;padding:0;font-family:Arial,sans-serif;color:#231815">${header}${emailBannerBlock()}${content}${footer}</td></tr></table></td></tr></table>`;
}

function emailDocument(siteKey = 'outmax_ru') {
  const title = escapeHtml($('#subject').value.trim() || 'Рассылка');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title}</title>${embeddedStyles()}</head><body style="margin:0;padding:0;${emailBackgroundStyle()}">${emailBlock(siteKey)}</body></html>`;
}

function previewDocument(siteKey) {
  let markup=emailDocument(siteKey);
  if(typeof assetUrls!=='undefined')for(const [path,url] of assetUrls)markup=markup.split(/^https?:\/\//i.test(path)?new URL(path).href:absoluteBrandUrl(path,siteKey)).join(url);
  const doc = new DOMParser().parseFromString(markup,'text/html');
  doc.querySelectorAll('img[src]').forEach(image => {
    const original = image.getAttribute('src');
    const path = cleanPath(original);
    if (typeof assetUrls !== 'undefined' && assetUrls.has(path)) image.src = assetUrls.get(path);
    else if (window.emailRemoteUrls?.has(original)) image.src = window.emailRemoteUrls.get(original);
    image.loading = 'lazy';
  });
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
