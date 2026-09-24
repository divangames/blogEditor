// Общие правила доменов OUTMAX и преобразования ссылок при экспорте.
const OUTMAX_SITES = Object.freeze({
  ru: 'outmaxshop.ru',
  com: 'outmaxshop.com',
});

const OUTMAX_ARTICLE_PATH = /^\/(?:article\/[^/?#]+|news\/[^/?#]+|\d+-(?:news|blog)\/\d+-[^/?#]+)\/?$/i;

/** Добавляет протокол к вставленному адресу и возвращает безопасный URL OUTMAX. */
function normalizeOutmaxUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || !outmaxSiteKey(url.href)) return '';
    url.protocol = 'https:';
    url.port = '';
    return url.href;
  } catch {
    return '';
  }
}

/** Возвращает ключ поддерживаемого сайта по домену или URL. */
function outmaxSiteKey(value) {
  try {
    const hostname = new URL(String(value), location.href).hostname.replace(/^www\./i, '').toLowerCase();
    return Object.entries(OUTMAX_SITES).find(([, domain]) => domain === hostname)?.[0] || '';
  } catch {
    return '';
  }
}

/** Проверяет, что URL ведёт на статью одного из двух сайтов OUTMAX. */
function isOutmaxArticleUrl(value) {
  const normalized = normalizeOutmaxUrl(value);
  if (!normalized) return false;
  return OUTMAX_ARTICLE_PATH.test(new URL(normalized).pathname);
}

/** Сравнивает две OUTMAX-ссылки по пути, не учитывая домен .ru или .com. */
function sameOutmaxDestination(left, right) {
  try {
    const first = new URL(String(left), location.href);
    const second = new URL(String(right), location.href);
    if (!outmaxSiteKey(first.href) || !outmaxSiteKey(second.href)) return first.href === second.href;
    return first.pathname.replace(/\/$/, '') === second.pathname.replace(/\/$/, '') && first.search === second.search;
  } catch {
    return String(left) === String(right);
  }
}

/** Заменяет домен только у внешних ссылок OUTMAX, сохраняя путь, параметры и якорь. */
function rewriteOutmaxLinks(body, siteKey) {
  const domain = OUTMAX_SITES[siteKey];
  if (!domain) return String(body || '');
  const template = document.createElement('template');
  template.innerHTML = String(body || '');
  template.content.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    if (!/^https?:\/\//i.test(raw || '') && !String(raw || '').startsWith('//')) return;
    try {
      const url = new URL(raw, location.href);
      if (!outmaxSiteKey(url.href)) return;
      url.protocol = 'https:';
      url.hostname = domain;
      url.port = '';
      link.setAttribute('href', url.href);
    } catch {
      // Некорректную ссылку оставляем без изменений — редактор покажет её как введённую.
    }
  });
  return template.innerHTML;
}
