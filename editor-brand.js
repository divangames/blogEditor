(function () {
  const isHasl = /\/hasl(?:\/|$)/i.test(location.pathname);
  const assetBase = new URL('.', document.currentScript?.src || location.href);
  const asset = path => new URL(path, assetBase).href;
  const outmaxEditorUrl = assetBase.href;
  const haslEditorUrl = new URL('hasl/', assetBase).href;
  const config = isHasl ? {
    key: 'hasl',
    name: 'ХАСЛ',
    title: 'Редактор статей ХАСЛ',
    sites: {ru: 'хасл.рф', com: 'haslestore.com'},
    css: asset('hasl.css?v=8'),
    logo: asset('images/hasle.png'),
    articlePath: /^\/(?:news\/[^/?#]+|article\/[^/?#]+|blog\/[^/?#]+|[^/?#]+-\d+)\/?$/i,
  } : {
    key: 'outmax',
    name: 'OUTMAX',
    title: 'Редактор статей OUTMAX',
    sites: {ru: 'outmaxshop.ru', com: 'outmaxshop.com'},
    css: asset('outmax.css'),
    logo: asset('images/outmax.png'),
    articlePath: /^\/(?:article\/[^/?#]+|news\/[^/?#]+|\d+-(?:news|blog)\/\d+-[^/?#]+)\/?$/i,
  };

  window.EDITOR_CONFIG = Object.freeze(config);
  const stylesheet = document.getElementById('article-style');
  if (stylesheet) stylesheet.href = config.css;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.toggle('hasl-editor', isHasl);
    document.title = `${config.title} · ${config.sites.ru} / ${config.sites.com}`;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', config.logo);
    document.querySelector('.mark')?.setAttribute('src', config.logo);
    const switchTitle = document.querySelector('.editor-switcher-title strong');
    if (switchTitle) switchTitle.textContent = config.name;
    const mainTitle = document.querySelector('.main-head h1');
    if (mainTitle) mainTitle.textContent = config.title;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && isHasl) pageTitle.value = 'Новая статья — ХАСЛ';
    const adapt = document.getElementById('adapt-article');
    if (adapt) adapt.textContent = `✦ Адаптировать статью под ${config.name}`;
    const articleUrl = document.getElementById('article-url');
    if (articleUrl) {
      articleUrl.previousSibling.textContent = `Ссылка на статью ${config.name}`;
      articleUrl.placeholder = isHasl ? 'хасл.рф/news/… или haslestore.com/news/…' : articleUrl.placeholder;
    }
    const productSite = document.getElementById('product-site');
    if (productSite) {
      productSite.options[0].textContent = config.sites.ru;
      productSite.options[1].textContent = config.sites.com;
    }
    document.querySelectorAll('[name="export-site"]').forEach(input => {
      const strong = input.parentElement?.querySelector('strong');
      const small = input.parentElement?.querySelector('small');
      if (input.value === 'ru' && strong) strong.textContent = config.sites.ru;
      if (input.value === 'com' && strong) strong.textContent = config.sites.com;
      if (input.value !== 'both' && small) small.textContent = `Все ссылки ${config.name} будут вести на этот домен`;
    });
    const guide = document.querySelector('details.guide');
    if (guide) {
      guide.querySelector('summary').textContent = `Редакционный промпт ${config.name}`;
      const link = guide.querySelector('a');
      if (link && isHasl) {
        link.href = config.css;
        link.textContent = 'стиля ХАСЛ';
      }
    }
    if (isHasl) {
      document.querySelector('.editor-switcher-menu')?.insertAdjacentHTML('afterbegin', `<a href="${outmaxEditorUrl}" target="_blank" rel="noopener"><strong>Редактор OUTMAX</strong><small>Статьи для outmaxshop.ru и outmaxshop.com</small></a>`);
      document.querySelector('.help')?.setAttribute('data-brand', 'hasl');
      for (const root of [document.querySelector('.sidebar'), document.getElementById('export-dialog'), document.getElementById('table-photo-dialog')]) {
        if (!root) continue;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) walker.currentNode.nodeValue = walker.currentNode.nodeValue
          .replaceAll('OUTMAX', 'ХАСЛ').replaceAll('outmaxshop.ru', 'хасл.рф').replaceAll('outmaxshop.com', 'haslestore.com');
      }
    } else {
      document.querySelector('.editor-switcher-menu')?.insertAdjacentHTML('afterbegin', `<a href="${haslEditorUrl}" target="_blank" rel="noopener"><strong>Редактор ХАСЛ</strong><small>Статьи для хасл.рф и haslestore.com</small></a>`);
    }
  });
})();
