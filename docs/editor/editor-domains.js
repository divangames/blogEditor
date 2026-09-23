// Общие правила доменов OUTMAX и преобразования ссылок при экспорте.
const OUTMAX_SITES = Object.freeze({
  ru: 'outmaxshop.ru',
  com: 'outmaxshop.com',
});

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
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) && Boolean(outmaxSiteKey(url.href)) && url.pathname.startsWith('/article/');
  } catch {
    return false;
  }
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
