// Browser storage and export for the GitHub Pages edition.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const assetUrls = new Map();
  const storedUrls = new Map();
  const slug = value => String(value || '').toLowerCase().trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0,70) || 'statya';
  const dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open('outmax-article-editor', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', {keyPath:'id'});
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function transaction(store, mode, operation) {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  const get = (store, key) => transaction(store, 'readonly', object => object.get(key));
  const put = (store, value, key) => transaction(store, 'readwrite', object => key === undefined ? object.put(value) : object.put(value, key));
  const all = store => transaction(store, 'readonly', object => object.getAll());
  const keys = store => transaction(store, 'readonly', object => object.getAllKeys());
  function cacheAsset(path, blob) {
    const old = assetUrls.get(path);
    if (old) {storedUrls.delete(old);URL.revokeObjectURL(old);}
    const url = URL.createObjectURL(blob);
    assetUrls.set(path, url);
    storedUrls.set(url, path);
  }
  async function preloadAssets(name) {
    for (const key of await keys('assets')) {
      if (key.startsWith(`${name}_files/`) && !assetUrls.has(key)) cacheAsset(key, await get('assets', key));
    }
  }
  window.onlineAssetUrl = path => assetUrls.get(path) || path;
  window.onlineStoredSrc = url => storedUrls.get(url) || url;

  let cssText;
  async function documentHtml(title, body) {
    cssText ||= await (await nativeFetch('./outmax.css')).text();
    const escaped = String(title).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    return `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"><title>${escaped}</title><style>\n${cssText}\n</style></head><body style="margin:0;background:#fff"><article class="om-guide">${body}</article></body></html>\n`;
  }
  const response = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8'}});
  const error = (message, status = 400) => response({error:message}, status);
  const imageType = name => ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'})[name.split('.').pop().toLowerCase()];

  async function importBundle(file) {
    const zip = await JSZip.loadAsync(file);
    const pages = Object.values(zip.files).filter(entry => !entry.dir && /\.html?$/i.test(entry.name));
    if (!pages.length) throw new Error('В ZIP нет HTML-статьи');
    pages.sort((a,b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length);
    const page = pages[0];
    const parsed = new DOMParser().parseFromString(await page.async('string'), 'text/html');
    const name = `${slug(page.name.split('/').pop().replace(/\.html?$/i,''))}-import-${Date.now().toString(36)}`;
    const pageFolder = page.name.includes('/') ? page.name.slice(0,page.name.lastIndexOf('/')+1) : '';
    let count = 0;
    for (const image of parsed.querySelectorAll('img[src]')) {
      const src = image.getAttribute('src');
      if (/^(?:https?:|data:|blob:)/i.test(src)) continue;
      const relative = src.replace(/^\.\//,'').replace(/^\//,'');
      if (relative.includes('..')) continue;
      const entry = zip.file(pageFolder + relative) || zip.file(relative);
      if (!entry || !imageType(entry.name)) continue;
      const bytes = await entry.async('uint8array');
      if (bytes.length > 12 * 1024 * 1024) continue;
      const extension = entry.name.split('.').pop().toLowerCase();
      const path = `${name}_files/${slug(entry.name.split('/').pop().replace(/\.[^.]+$/,''))}-${++count}.${extension}`;
      const blob = new Blob([bytes], {type:imageType(entry.name)});
      await put('assets', blob, path);
      cacheAsset(path, blob);
      image.setAttribute('src', path);
    }
    const jsonName = page.name.replace(/\.html?$/i,'.json');
    let products = null;
    if (zip.file(jsonName)) {
      try {products = JSON.parse(await zip.file(jsonName).async('string')).products || null;} catch { /* HTML remains usable. */ }
    }
    return {id:name, html:'<!doctype html>'+parsed.documentElement.outerHTML, title:parsed.title || page.name, images:count, products};
  }

  async function handle(path, options) {
    const url = new URL(path, location.href);
    const route = url.pathname.slice(url.pathname.indexOf('/api/'));
    if (route === '/api/drafts') {
      const drafts = await all('drafts');
      return response(drafts.sort((a,b) => b.savedAt.localeCompare(a.savedAt)).map(({id,title,savedAt}) => ({id,title,savedAt})));
    }
    if (route.startsWith('/api/draft/')) {
      const id = decodeURIComponent(route.slice('/api/draft/'.length));
      const draft = await get('drafts', id);
      if (!draft) return error('Черновик не найден',404);
      await preloadAssets(id);
      return response(draft);
    }
    if (route === '/api/upload') {
      const file = options.body;
      if (!(file instanceof Blob) || !imageType(file.name || `photo.${(file.type || '').split('/')[1]}`) || file.size > 12 * 1024 * 1024) return error('Поддерживаются изображения JPG, PNG, WebP и GIF до 12 МБ');
      const name = slug(url.searchParams.get('draft'));
      const extension = (file.name || `photo.${file.type.split('/')[1]}`).split('.').pop().toLowerCase();
      let path = `${name}_files/${slug(url.searchParams.get('name') || 'image')}.${extension}`;
      let index = 2;
      while (await get('assets', path)) path = `${name}_files/${slug(url.searchParams.get('name') || 'image')}-${index++}.${extension}`;
      await put('assets', file, path);
      cacheAsset(path, file);
      return response({src:path});
    }
    if (route === '/api/save') {
      const payload = JSON.parse(options.body);
      const id = slug(payload.id);
      const record = {id,title:String(payload.title || 'Статья OUTMAX').slice(0,200),body:String(payload.body || ''),products:Array.isArray(payload.products)?payload.products:[],savedAt:new Date().toISOString()};
      await put('drafts',record);
      return response({id,html:`${id}.html`,savedAt:record.savedAt});
    }
    if (route === '/api/import-bundle') return response(await importBundle(options.body));
    if (route === '/api/fetch' || route === '/api/fetch-article') return error('GitHub Pages не может получить страницу OUTMAX. Откройте локальную версию для автоматической загрузки или добавьте товар вручную.', 501);
    return error('Не найдено',404);
  }

  window.fetch = (path, options = {}) => {
    if (typeof path !== 'string' || !new URL(path, location.href).pathname.includes('/api/')) return nativeFetch(path,options);
    return Promise.resolve().then(() => handle(path,options)).catch(exc => error(exc.message || 'Ошибка браузерного хранилища',500));
  };

  /** Запускает скачивание Blob с заданным именем файла. */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Экспортирует один HTML или ZIP с одной/двумя доменными версиями. */
  window.onlineDownloadExport = async (id, site, format) => {
    const draft = await get('drafts',id);
    if (!draft) throw new Error('Сначала сохраните статью');
    const siteKeys = site === 'both' ? ['ru','com'] : [site];
    if (!siteKeys.every(key => OUTMAX_SITES[key])) throw new Error('Неизвестный вариант сайта');
    if (format === 'html' && siteKeys.length === 1) {
      const key = siteKeys[0];
      const html = await documentHtml(draft.title,rewriteOutmaxLinks(draft.body,key));
      downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`${id}-outmaxshop-${key}.html`);
      return;
    }
    const zip = new JSZip();
    zip.file(`${id}.json`,JSON.stringify(draft,null,2));
    for (const key of siteKeys) {
      zip.file(`${id}-outmaxshop-${key}.html`,await documentHtml(draft.title,rewriteOutmaxLinks(draft.body,key)));
    }
    for (const key of await keys('assets')) if (key.startsWith(`${id}_files/`)) zip.file(key,await get('assets',key));
    const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    downloadBlob(blob,`${id}-outmaxshop-${site === 'both' ? 'both' : site}.zip`);
  };

  window.onlineDownloadZip = id => window.onlineDownloadExport(id,'ru','zip');

  document.addEventListener('DOMContentLoaded', () => {
    const note = document.createElement('p');
    note.className = 'help';
    note.textContent = 'Онлайн-режим: черновики хранятся только в этом браузере. Скачивайте ZIP для передачи или резервной копии.';
    document.querySelector('.panel-heading').after(note);
    for (const id of ('product-site product-input load-products article-url adapt-article-url').split(' ')) {
      document.getElementById(id).disabled = true;
      document.getElementById(id).title = 'Автоматическая загрузка доступна в локальной версии редактора';
    }
    const manual = document.createElement('button');
    manual.className = 'wide';
    manual.textContent = '＋ Добавить товар вручную';
    document.querySelector('#load-products').after(manual);
    manual.addEventListener('click', () => {
      const sku = prompt('Артикул товара (цифры)');
      if (!sku) return;
      if (!/^\d{3,12}$/.test(sku)) return toast('Артикул должен содержать от 3 до 12 цифр',true);
      const title = prompt('Название товара');
      if (!title) return;
      const url = prompt('Полная ссылка на товар OUTMAX');
      if (!/^https:\/\/(?:www\.)?outmaxshop\.(?:ru|com)\//i.test(url || '')) return toast('Нужна ссылка на товар outmaxshop.ru или outmaxshop.com',true);
      const photos = prompt('Прямые ссылки на фото через запятую или с новой строки', '') || '';
      const images = photos.split(/[,\n\r]+/).map(item => item.trim()).filter(item => /^https:\/\//i.test(item));
      const product = {sku,title,url,images,features:[]};
      const at = productLibrary.findIndex(item => item.sku === sku);
      if (at >= 0) productLibrary[at] = product; else productLibrary.push(product);
      renderProducts();changed();toast('Товар добавлен в панель');
    });
  });
})();
