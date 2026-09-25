// Переводит импортированный дизайн в устойчивую email-разметку без потери содержания и изображений.
const EMAIL_SITES = {
  outmax_ru:{domain:'outmaxshop.ru',brand:'OUTMAX',file:'outmaxshop-ru'},
  outmax_com:{domain:'outmaxshop.com',brand:'OUTMAX',file:'outmaxshop-com'},
  hasl_ru:{domain:'хасл.рф',brand:'ХАСЛ',file:'hasl-rf'},
  hasle_com:{domain:'haslestore.com',brand:'HASL',file:'haslestore-com'}
};
const EMAIL_WIDTH = 700;
const NOTISEND_ALLOWED_TAGS = new Set([
  'a','br','div','h1','h2','h3','img','li','p','span','strong','style','table','td','th','tr','ul'
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
  .email-content h1{font-size:28px!important}
  .email-content h2{font-size:23px!important}
}`;

function emailSite(siteKey) {
  return EMAIL_SITES[siteKey] || EMAIL_SITES.outmax_ru;
}

function absoluteBrandUrl(value,siteKey) {
  const raw = String(value || '').trim();
  if (!raw || /^(?:mailto:|tel:|#|data:|blob:)/i.test(raw)) return raw;
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

/** Находит смысловые блоки даже в HTML без классов и помечает их до преобразования. */
function markEmailStructures(root) {
  root.querySelectorAll('nav').forEach(node => node.classList.add('email-toc-source'));
  root.querySelectorAll('section').forEach(node => node.classList.add('email-section-source'));
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
  });
  root.querySelectorAll('p').forEach(node => {
    const text = node.textContent.replace(/\u00a0/g,' ').trim();
    if (/₽/.test(text) && node.querySelector('strong')) node.classList.add('email-price-source');
    if (!text || /^(?:←\s*)?(?:Таблицу|Галерею).*(?:пальцем|двигать|листать)/i.test(text)) node.remove();
  });
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
        const metricsTable = document.createElement('table');
        metricsTable.setAttribute('width','100%');
        metricsTable.setAttribute('cellspacing','0');
        metricsTable.setAttribute('cellpadding','0');
        metricsTable.setAttribute('border','0');
        metricsTable.className = 'email-comparison-metrics';
        const metrics = metricsTable.insertRow();
        cells.slice(1).forEach((cell,index) => {
          const metric = metrics.insertCell();
          metric.setAttribute('width',`${Math.floor(100/(cells.length-1))}%`);
          metric.className = 'email-comparison-metric';
          const label = document.createElement('span');
          label.textContent = headers[index+1] || cell.dataset.label || `Показатель ${index+1}`;
          metric.append(label,...[...cell.childNodes].map(node => node.cloneNode(true)));
        });
        metricsCell.append(metricsTable);
      }
      list.append(card);
    });
    const wrapper = table.parentElement?.tagName === 'DIV' && table.parentElement.children.length === 1 ? table.parentElement : table;
    wrapper.replaceWith(list);
  }
}

/** Назначает ключевой дизайн inline, поскольку часть клиентов удаляет стили из head. */
function applyEmailDesign(root) {
  setEmailStyle(root,'box-sizing:border-box;width:100%;margin:0 auto;padding:24px 28px 56px;background:#ffffff;color:#231815;font-family:Arial,sans-serif;font-size:15px;line-height:1.55');
  root.querySelectorAll('header').forEach(node => setEmailStyle(node,'display:block;margin:0 0 32px'));
  root.querySelectorAll('h1').forEach(node => setEmailStyle(node,'margin:0 0 16px;color:#000000;font-family:Arial,sans-serif;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.02em'));
  root.querySelectorAll('h2').forEach(node => setEmailStyle(node,'margin:0 0 16px;color:#000000;font-family:Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700'));
  root.querySelectorAll('h3').forEach(node => setEmailStyle(node,'margin:0 0 13px;color:#000000;font-family:Arial,sans-serif;font-size:20px;line-height:1.3;font-weight:700'));
  root.querySelectorAll('h4,h5,h6,.om-h7').forEach(node => setEmailStyle(node,'margin:18px 0 10px;color:#111111;font-family:Arial,sans-serif;font-size:16px;line-height:1.35;font-weight:700'));
  root.querySelectorAll('p').forEach(node => setEmailStyle(node,'margin:0 0 15px;color:#3a3432;font-family:Arial,sans-serif;font-size:15px;line-height:1.55'));
  root.querySelectorAll('header>p').forEach(node => setEmailStyle(node,'margin:0 0 22px;color:#555555;font-family:Arial,sans-serif;font-size:17px;line-height:1.5'));
  root.querySelectorAll('a').forEach(node => setEmailStyle(node,'color:#c9151b;text-decoration:underline;font-weight:700'));
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
  root.querySelectorAll('.om-section,.email-section-source').forEach(node => setEmailStyle(node,'display:block;margin:0 0 42px'));
  root.querySelectorAll('.om-section>h2,.email-section-source>h2').forEach(node => setEmailStyle(node,'margin:0 0 18px;padding:0 0 12px;border-bottom:1px solid #e5e5e5;color:#000000;font-family:Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700'));
  root.querySelectorAll('.om-toc,.email-toc-source').forEach(node => setEmailStyle(node,'display:block;margin:0 0 42px;padding:20px;background:#f5f5f5'));
  root.querySelectorAll('.om-toc>div,.email-toc-source>div').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0;background:#ffffff;border:1px solid #e5e5e5'));
  root.querySelectorAll('.om-toc a,.email-toc-source a,.email-toc-source>div>span').forEach(node => setEmailStyle(node,'display:block;min-height:0;padding:11px 14px;border-bottom:1px solid #e5e5e5;background:#ffffff;color:#231815;text-decoration:none;font-size:14px;line-height:1.4;font-weight:700'));
  root.querySelectorAll('.om-toc a span,.email-toc-source a span,.email-toc-source>div>span>span').forEach(node => setEmailStyle(node,'display:inline;margin-left:6px;padding:0;border:0;background:transparent;color:#e31e24;font-size:16px'));
  root.querySelectorAll('ul,ol').forEach(node => setEmailStyle(node,'margin:0 0 18px;padding-left:22px;color:#3a3432;font-size:14px;line-height:1.5'));
  root.querySelectorAll('li').forEach(node => setEmailStyle(node,'margin:0 0 8px'));
  root.querySelectorAll('.om-shortlist li').forEach(node => setEmailStyle(node,'display:block;margin:0;padding:13px 0;border-bottom:1px solid #e5e5e5'));
  root.querySelectorAll('.om-shortlist li>span:first-child').forEach(node => setEmailStyle(node,'display:block;margin:0 0 4px;color:#777777;font-size:11px;line-height:1.4;font-weight:700;text-transform:uppercase;letter-spacing:.04em'));
  root.querySelectorAll('.om-grid').forEach(node => setEmailStyle(node,'display:block;width:100%;margin:0 0 20px'));
  root.querySelectorAll('.om-grid>div').forEach(node => setEmailStyle(node,'display:block;margin:0 0 10px;padding:16px 18px;border:1px solid #e5e5e5;background:#f5f5f5'));
  root.querySelectorAll('.om-product,.email-product-source').forEach(node => setEmailStyle(node,'display:block;margin:24px 0 34px;padding:20px;border:1px solid #dddddd;border-top:3px solid #e31e24;background:#ffffff'));
  root.querySelectorAll('.om-product h3,.email-product-source h3').forEach(node => setEmailStyle(node,'margin:0 0 15px;font-size:25px;line-height:1.22'));
  root.querySelectorAll('.om-sku,.email-sku-source').forEach(node => setEmailStyle(node,'display:block;margin:0 0 7px;color:#777777;font-size:11px;line-height:1.3;font-weight:700;text-transform:uppercase;letter-spacing:.06em'));
  root.querySelectorAll('.om-note,blockquote').forEach(node => setEmailStyle(node,'display:block;margin:0 0 20px;padding:17px 18px;border-left:4px solid #e31e24;background:#f3f3f3'));
  root.querySelectorAll('.om-price,.email-price-source').forEach(node => setEmailStyle(node,'display:block;margin:18px 0;padding:14px 16px;border-left:3px solid #e31e24;background:#f3f3f3;font-weight:700'));
  root.querySelectorAll('.email-price-source>span').forEach(node => setEmailStyle(node,'display:block;margin:0 0 7px;padding:0;border:0;background:transparent'));
  root.querySelectorAll('.om-price-amounts,.om-price-meta').forEach(node => setEmailStyle(node,'display:block;margin:0 0 6px;line-height:1.3'));
  root.querySelectorAll('.om-ratings,.email-ratings-source').forEach(node => setEmailStyle(node,'display:block;margin:14px 0 18px;padding:0;list-style:none;border-top:1px solid #e5e5e5'));
  root.querySelectorAll('.om-ratings li,.email-ratings-source li').forEach(node => setEmailStyle(node,'display:block;margin:0;padding:9px 0;border-bottom:1px solid #e5e5e5;font-size:14px;line-height:1.35'));
  root.querySelectorAll('.om-ratings li>span:first-child').forEach(node => setEmailStyle(node,'display:inline-block;width:56%;vertical-align:middle'));
  root.querySelectorAll('.om-stars').forEach(node => setEmailStyle(node,'display:inline-block;white-space:nowrap;vertical-align:middle;font-size:17px;line-height:1'));
  root.querySelectorAll('.om-star').forEach(node => setEmailStyle(node,`display:inline;color:${node.classList.contains('om-star--filled')?'#f2b600':'#b8b8b8'};font-size:17px;line-height:1`));
  root.querySelectorAll('.om-actions').forEach(node => setEmailStyle(node,'display:block;margin:17px 0 0'));
  root.querySelectorAll('.om-actions a,.om-conclusion>a').forEach(node => setEmailStyle(node,'display:inline-block;margin:0 8px 8px 0;padding:12px 18px;background:#e31e24;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700'));
  root.querySelectorAll('.email-actions-source').forEach(node => {
    setEmailStyle(node,'display:block;margin:18px 0 0');
    [...node.children].filter(child => child.matches('a')).forEach((link,index) => setEmailStyle(link,index === 0
      ? 'display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:1px solid #e31e24;background:#e31e24;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700'
      : 'display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:1px solid #cccccc;background:#ffffff;color:#231815;text-decoration:none;font-size:14px;line-height:20px;font-weight:700'));
  });
  root.querySelectorAll('.email-gallery').forEach(node => setEmailStyle(node,'width:100%;margin:16px 0 18px;border-collapse:collapse;table-layout:fixed'));
  root.querySelectorAll('.email-gallery td').forEach(node => setEmailStyle(node,'width:50%;padding:0 4px 8px;vertical-align:top'));
  root.querySelectorAll('.email-gallery a').forEach(node => setEmailStyle(node,'display:block;color:#c9151b;text-decoration:none'));
  root.querySelectorAll('.email-gallery img').forEach(node => {node.setAttribute('width','298');setEmailStyle(node,'display:block;width:100%;max-width:298px;height:auto;border:0;background:#f5f5f5')});
  root.querySelectorAll('.email-comparison-list').forEach(node => setEmailStyle(node,'display:block;margin:20px 0 26px'));
  root.querySelectorAll('.email-comparison-card').forEach(node => setEmailStyle(node,'width:100%;margin:0 0 10px;border:1px solid #dddddd;border-collapse:collapse;table-layout:fixed;background:#ffffff'));
  root.querySelectorAll('.email-comparison-title').forEach(node => setEmailStyle(node,'padding:12px 14px;border-bottom:1px solid #dddddd;text-align:left;vertical-align:middle;font-size:14px;line-height:1.4;font-weight:700'));
  root.querySelectorAll('.email-comparison-title .om-model-cell').forEach(node => setEmailStyle(node,'display:block;width:100%'));
  root.querySelectorAll('.email-comparison-title img').forEach(node => {node.setAttribute('width','52');setEmailStyle(node,'display:inline-block;width:52px;height:52px;margin:0 10px 0 0;vertical-align:middle;object-fit:contain;border:0')});
  root.querySelectorAll('.email-comparison-metric').forEach(node => setEmailStyle(node,'padding:10px 8px;text-align:left;vertical-align:top;font-size:14px;line-height:1.35;font-weight:700'));
  root.querySelectorAll('.email-comparison-metrics').forEach(node => setEmailStyle(node,'width:100%;border-collapse:collapse;table-layout:fixed'));
  root.querySelectorAll('.email-comparison-metric>span').forEach(node => setEmailStyle(node,'display:block;margin:0 0 4px;color:#777777;font-size:10px;line-height:1.3;font-weight:700;text-transform:uppercase'));
  root.querySelectorAll('.om-cta').forEach(node => setEmailStyle(node,'display:block;margin:20px 0 30px'));
  root.querySelectorAll('.om-cta a,.om-button').forEach(node => setEmailStyle(node,'display:inline-block;padding:14px 22px;border:2px solid #ff3945;background:#ff3945;color:#ffffff;text-decoration:none;text-align:center;font-size:14px;line-height:20px;font-weight:800'));
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
    node.removeAttribute('class');
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-') || attribute.name.startsWith('aria-')) node.removeAttribute(attribute.name);
    }
  }
}

function preparedContent(siteKey) {
  const element = document.createElement('div');
  element.className = window.emailImportState?.root?.className || 'om-guide';
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
  renderEmailGalleries(element);
  renderEmailComparisons(element);
  applyEmailDesign(element);
  normalizeNotiSendMarkup(element);
  return element.outerHTML.replace(/<\/?(?:tbody|thead)\b[^>]*>/gi,'');
}

function embeddedStyles() {
  return `<style type="text/css">${EMAIL_FALLBACK_CSS}</style>`;
}

function emailBlock(siteKey = 'outmax_ru') {
  const preheader = escapeHtml($('#preheader').value.trim());
  const content = preparedContent(siteKey);
  return `${embeddedStyles()}<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}${'&nbsp;&#847;'.repeat(12)}</div><table class="email-outer" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f1f1" style="width:100%;margin:0;background:#f1f1f1;table-layout:fixed"><tr><td align="center" valign="top" style="padding:0"><table class="email-shell" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:${EMAIL_WIDTH}px;background:#ffffff;table-layout:fixed"><tr><td class="email-content" style="width:100%;padding:0;font-family:Arial,sans-serif;color:#231815">${content}</td></tr></table></td></tr></table>`;
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
