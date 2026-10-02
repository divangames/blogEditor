// Переводит импортированный дизайн в устойчивую email-разметку без потери содержания и изображений.
const EMAIL_SITES = {
  outmax_ru:{domain:'outmaxshop.ru',brand:'OUTMAX',file:'outmaxshop-ru'},
  outmax_com:{domain:'outmaxshop.com',brand:'OUTMAX',file:'outmaxshop-com'},
  hasl_ru:{domain:'хасл.рф',brand:'ХАСЛ',file:'hasl-rf'},
  hasle_com:{domain:'haslestore.com',brand:'HASL',file:'haslestore-com'}
};
const EMAIL_WIDTH = 700;
const NOTISEND_ALLOWED_TAGS = new Set([
  'a','br','div','h1','h2','h3','img','li','p','span','strong','style','table','tbody','td','th','thead','tr','ul'
]);
const EMAIL_RESPONSIVE_CLASSES = new Set([
  'email-body','email-section-source','email-product-source','email-toc-source','email-promo-source','email-hero',
  'email-rating-grid','email-rating-item','email-commerce-source','email-commerce-price',
  'email-size-panel','email-size-list','email-size-chip','email-gallery',
  'email-comparison-list','email-comparison-card','email-comparison-metrics','email-comparison-metric'
]);
const BRAND_HOSTS = new Set(Object.values(EMAIL_SITES).flatMap(site => {
  const host = new URL(`https://${site.domain}`).hostname;
  return [host,`www.${host}`];
}));
const EMAIL_FALLBACK_CSS = `
html,body{margin:0;padding:0;background:#f1f1f1}
.email-outer,.email-shell{table-layout:fixed}
.email-shell{width:100%;max-width:700px;background:#fff}
.email-content{width:100%;padding:0}
.email-content img{display:block;max-width:100%;height:auto;border:0}
.email-content table{border-collapse:collapse}
.email-content th,.email-content td{word-break:normal;overflow-wrap:normal}
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
  .email-content h3,.email-product-source h3{font-size:18px!important;line-height:1.24!important;overflow-wrap:anywhere!important}
  .email-rating-item{width:50%!important}
  .email-commerce-price,.email-size-panel{display:block!important;width:100%!important;max-width:100%!important}
  .email-size-panel{margin-top:16px!important}
  .email-size-chip{width:50%!important;max-width:none!important}
  .email-gallery td{display:block!important;width:100%!important;padding:0 0 10px!important}
  .email-gallery img{width:100%!important;max-width:100%!important}
  .email-comparison-metric{display:inline-block!important;width:50%!important;box-sizing:border-box!important}
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
    if (/^Арт\.?\s*\d+/i.test(node.textContent.trim()) && !node.children.length) node.classList.add('email-sku-source');
    const ratingsTitle = children.find(child => /^Редакционные оценки$/i.test(child.textContent.trim()));
    const ratingsGrid = ratingsTitle && children.find(child => child !== ratingsTitle && child.children.length > 1);
    if (ratingsTitle && ratingsGrid) {
      node.classList.add('email-ratings-panel');
      ratingsTitle.classList.add('email-ratings-title');
      ratingsGrid.classList.add('email-rating-grid');
      [...ratingsGrid.children].forEach(item => item.classList.add('email-rating-item'));
    }
  });
  root.querySelectorAll('strong').forEach(label => {
    if (!/^Размеры в наличии$/i.test(label.textContent.trim())) return;
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
    const headerCells = headerRow ? [...headerRow.children].filter(cell => cell.matches('th,td')) : [];
    const headers = headerCells.map(cell => cell.textContent.trim());
    if (headers.length < 3 || !/^модель$/i.test(headers[0])) continue;
    const rows = [...table.querySelectorAll('tr')].filter(row => row !== headerRow && row.children.length > 1);
    if (!rows.length) continue;
    const list = document.createElement('div');
    list.className = 'email-comparison-list';
    rows.forEach((row,rowIndex) => {
      const cells = [...row.children].filter(cell => cell.matches('th,td'));
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
  root.querySelectorAll('.om-product h3,.email-product-source h3').forEach(node => setEmailStyle(node,'margin:0 0 15px;font-size:25px;line-height:1.22'));
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
  root.querySelectorAll('.email-ratings-panel').forEach(node => setEmailStyle(node,'display:block;margin:16px 0;padding:14px 18px;background:#f7f6f6'));
  root.querySelectorAll('.email-ratings-title').forEach(node => setEmailStyle(node,'display:block;margin:0 0 8px;color:#7a7a7a;font-size:12px;line-height:1.35;font-weight:700;letter-spacing:.08em;text-transform:uppercase'));
  root.querySelectorAll('.email-rating-grid').forEach(node => setEmailStyle(node,'display:block;width:100%;font-size:0'));
  root.querySelectorAll('.email-rating-item').forEach(node => setEmailStyle(node,'display:inline-block;width:33.33%;margin:0;padding:9px 8px 9px 0;box-sizing:border-box;vertical-align:top;color:#231815;font-size:14px;line-height:1.45'));
  root.querySelectorAll('.email-commerce-source').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:24px 0 16px;padding:18px;background:#f7f6f6;box-sizing:border-box;font-size:0'));
  root.querySelectorAll('.email-commerce-price').forEach(node => setEmailStyle(node,'display:inline-block;width:30%;margin:0;padding:0 16px 0 0;box-sizing:border-box;vertical-align:top;font-size:15px'));
  root.querySelectorAll('.email-size-panel').forEach(node => setEmailStyle(node,'display:inline-block;width:70%;margin:0;padding:0;box-sizing:border-box;vertical-align:top;font-size:14px'));
  root.querySelectorAll('.email-size-list').forEach(node => setEmailStyle(node,'display:block;width:100%;font-size:0'));
  root.querySelectorAll('.email-size-chip').forEach(node => setEmailStyle(node,'display:inline-block;width:16.66%;min-width:0;min-height:0;margin:0;padding:9px 5px;border:1px solid #cfcfcf;background:#ffffff;color:#231815;box-sizing:border-box;text-align:center;vertical-align:top;font-size:13px;line-height:20px;font-weight:700'));
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
    node.style.setProperty('border-radius','0','important');
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
  }
  root.querySelectorAll('*').forEach(node => {
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

function emailBlock(siteKey = 'outmax_ru') {
  const preheader = escapeHtml($('#preheader').value.trim());
  const content = preparedContent(siteKey);
  const footer = content.includes('[%unsubscribe_link%]') ? '' : emailSystemFooter(siteKey);
  return `${embeddedStyles()}<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}${'&nbsp;&#847;'.repeat(12)}</div><table class="email-outer" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f1f1" style="width:100%;margin:0;background:#f1f1f1;table-layout:fixed"><tr><td align="center" valign="top" style="padding:0"><table class="email-shell" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:${EMAIL_WIDTH}px;background:#ffffff;table-layout:fixed"><tr><td class="email-content" style="width:100%;padding:0;font-family:Arial,sans-serif;color:#231815">${content}${footer}</td></tr></table></td></tr></table>`;
}

function emailDocument(siteKey = 'outmax_ru') {
  const title = escapeHtml($('#subject').value.trim() || 'Рассылка');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title}</title>${embeddedStyles()}</head><body style="margin:0;padding:0;background:#f1f1f1">${emailBlock(siteKey)}</body></html>`;
}

function previewDocument(siteKey) {
  const doc = new DOMParser().parseFromString(emailDocument(siteKey),'text/html');
  doc.querySelectorAll('img[src]').forEach(image => {
    const original = image.getAttribute('src');
    const path = cleanPath(original);
    if (typeof assetUrls !== 'undefined' && assetUrls.has(path)) image.src = assetUrls.get(path);
    else if (window.emailRemoteUrls?.has(original)) image.src = window.emailRemoteUrls.get(original);
    image.loading = 'lazy';
  });
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
