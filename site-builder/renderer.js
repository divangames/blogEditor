/* Shared page renderer: previews and export always use the same code. */
window.HaslRenderer = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = value => { try { const u = new URL(value, 'https://xn--80awro.xn--p1ai'); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const money = x => new Intl.NumberFormat('ru-RU').format(x) + ' РУБ.';
  const price = p => `<div class="feed-price"><b>${esc(money(p.price))}</b>${p.oldprice > p.price ? `<del>${esc(money(p.oldprice))}</del>` : ''}</div>`;
  const photo = (p, choice) => safe(p.photos.includes(choice) ? choice : p.photos[0]);
  const optimized = (url, width = 640) => url ? `https://xn--80awro.xn--p1ai/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=85` : '';
  const image = (url, alt, cls = '', width = 640) => `<img class="${cls}" src="${esc(optimized(safe(url), width))}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  function product(p, chosen) {
    const url = esc(safe(p.url));
    const description=p.name+JSON.stringify(p.params),winter=/зим/i.test(description)?'|winter':'';
    const seasons=winter+(/демисезон|весн|осен/i.test(description)?'|demi':'')+(/летн|лето/i.test(description)?'|summer':'');
    const discount=p.oldprice>p.price?Math.round((1-p.price/p.oldprice)*100):0;
    const video=(p.videos||[]).includes(chosen)?safe(chosen):'';
    const media=video?`<a href="${url}"><video class="product-video" src="${esc(video)}" poster="${esc(optimized(photo(p,'')))}" muted loop playsinline disablepictureinpicture preload="none" aria-label="Видео: ${esc(p.name)}"></video></a>`:`<a href="${url}">${image(photo(p, chosen), p.name, 'product-image')}</a>`;
    return `<article class="product" data-feed-id="${esc(p.code)}" data-tags="${esc(p.brand + seasons)}"><div class="product-media">${media}<div class="product-badges">${winter?'<span class="season-badge">ЗИМА</span>':''}${discount?`<span class="discount-badge">-${discount}%</span>`:''}</div></div><div class="product-info"><a class="product-title" href="${url}">${esc(p.name)}</a>${price(p)}<p class="product-code">арт. ${esc(p.code)}${p.available ? '' : ' · Нет в наличии'}</p></div></article>`;
  }
  function collection(p, chosen) {return product(p, chosen).replace('class="product"','class="product collection-product-card"');}
  function review(r) {
    return `<article class="review-card"><div class="review-top"><div class="review-date">${esc(r.date ? r.date.slice(0,10).split('-').reverse().join('.') : '')}</div></div><p class="review-text">${esc(r.text)}</p><div class="review-thumbs">${(r.photos || []).map((url, i) => `<button type="button" class="review-thumb" aria-label="Фото покупателя ${esc(r.name)}, ${i+1}"><img src="${esc(safe(url))}" alt="Фото покупателя ${esc(r.name)}" loading="lazy"><span class="review-thumb-zoom"></span></button>`).join('')}</div><a class="review-product" href="${esc(safe(r.product?.url || '/testimonials'))}">${esc(r.product?.name || '')}</a><div class="review-bottom"><div><strong>${esc(r.name)}</strong><span>${esc(r.city)}</span></div><span class="review-source">${r.manual ? 'Отзыв покупателя' : 'Отзыв с сайта'}</span></div></article>`;
  }
  function article(n) {
    return `<a class="article article-link" href="${esc(safe(n.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(n.title)}"><div class="article-media">${image(n.image, n.title)}</div><div class="article-copy"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div></a>`;
  }
  let template = '', fields = [], links = [], pictures = [], sections = [];
  function init(raw) {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const optional=doc.querySelector('template')?.content.querySelector('section')?.cloneNode(true);
    doc.querySelectorAll('template').forEach(x => x.remove());
    if(optional){optional.dataset.optional='true';optional.querySelector('.carousel-side-btn')?.remove();doc.querySelector('main').append(optional);}
    const dynamic = '.product-track,.collection-grid,.reviews-track,.editorial';
    sections = [...doc.querySelectorAll('main section')].map((s,i) => { s.dataset.editorSection = 's'+i; return {id:'s'+i, optional:!!s.dataset.optional, name:s.querySelector('h1,h2,h3')?.textContent.trim() || 'Первый экран'}; });
    const walker = doc.createTreeWalker(doc.querySelector('main'), NodeFilter.SHOW_TEXT);
    const nodes = []; while(walker.nextNode()) nodes.push(walker.currentNode);
    fields = [];
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || parent.closest(dynamic + ',script,style,svg,select,.size-choice-grid,.product-tabs,.carousel-side-btn,.reviews-arrow')) continue;
      if (node.textContent.trim() === '+') continue;
      const id = 't'+fields.length, section = parent.closest('section')?.dataset.editorSection;
      const span = doc.createElement('span'); span.dataset.editorText = id; span.textContent = parent.closest('.btn') ? node.textContent.trim() : node.textContent;
      fields.push({id, section, value:node.textContent.trim(), label:parent.tagName.toLowerCase()});
      node.replaceWith(span);
    }
    links = [...doc.querySelectorAll('main a[href]')].filter(x => !x.closest(dynamic)).map((x,i) => {
      x.dataset.editorLink = 'l'+i;
      return {id:'l'+i, section:x.closest('section')?.dataset.editorSection, label:x.textContent.trim(), value:x.getAttribute('href')};
    });
    pictures = [...doc.querySelectorAll('main img')].filter(x => !x.closest(dynamic)).map((x,i) => {
      x.dataset.editorImage = 'i'+i;
      return {id:'i'+i, section:x.closest('section')?.dataset.editorSection, label:x.alt || 'Изображение', value:x.getAttribute('src')};
    });
    doc.querySelectorAll('.faq-q > span:not([data-editor-text])').forEach(s=>{s.classList.add('faq-sign');s.setAttribute('aria-hidden','true');});
    doc.querySelector('.finder-form')?.insertAdjacentHTML('afterbegin','<div class="field gender-field"><label for="hasl-embed-fGender">Пол</label><select class="finder-gender" id="hasl-embed-fGender"><option value="">Любой</option><option value="zhenskie">Женский</option><option value="muzhskie">Мужской</option></select></div>');
    doc.querySelectorAll('script').forEach(s=>s.remove());
    template = '<!doctype html>\n'+doc.documentElement.outerHTML;
    return {fields, links, pictures, sections, blocks: {
      catalog: [...doc.querySelectorAll('.product-track .product')].map(x => x.dataset.feedId).join(', '),
      collections: [...doc.querySelectorAll('.collection-card')].map(x => x.dataset.feedId).join(', '),
      promos: ''
    }};
  }
  function routeLinks(root, target) {
    const hosts = ['xn--80awro.xn--p1ai', 'хасл.рф', 'haslestore.com', 'www.haslestore.com'];
    const rewrite = value => {
      try {
        const u = new URL(value, target);
        if (hosts.includes(u.hostname)) {
          u.host = new URL(target).host;
          u.pathname = u.pathname.replace(/^\/(?:krossovki|sneakers)(?=\/|$)/, u.host.includes('haslestore.com') ? '/sneakers' : '/krossovki');
          if (u.searchParams.has('url')) u.searchParams.set('url', rewrite(u.searchParams.get('url')));
          return u.href;
        }
      } catch {}
      return value;
    };
    // Store video files are mirrored under /storage; use the selected storefront's CSP-allowed origin.
    root.querySelectorAll('video[src],video source[src]').forEach(el=>{
      try{const u=new URL(el.getAttribute('src'),target);if(hosts.includes(u.hostname)&&u.pathname.startsWith('/storage/import_files/')){u.host=new URL(target).host;el.setAttribute('src',u.href);}}catch{}
    });
    root.dataset.siteOrigin = target;
    root.dataset.catalogPath = new URL(target).host.includes('haslestore.com') ? '/sneakers' : '/krossovki';
    root.querySelectorAll('a[href],area[href],form[action]').forEach(el => ['href','action'].forEach(attr => {
      const value = el.getAttribute(attr);
      if(value && !value.startsWith('#')) el.setAttribute(attr, rewrite(value));
    }));
  }
  function build(state, products, content, options = {}) {
    const doc = new DOMParser().parseFromString(template, 'text/html'), root = doc.querySelector('.hasl-home-embed');
    for(const [id,value] of Object.entries(state.texts || {})) { const el = doc.querySelector(`[data-editor-text="${id}"]`); if(el) el.textContent=value; }
    for(const [id,value] of Object.entries(state.links || {})) { const el = doc.querySelector(`[data-editor-link="${id}"]`); if(el) el.setAttribute('href',value.startsWith('#') ? value : safe(value)); }
    for(const [id,value] of Object.entries(state.images || {})) { const el = doc.querySelector(`[data-editor-image="${id}"]`); if(el) el.setAttribute('src',safe(value)); }
    const get = key => (state.blocks[key].resolved || []).map(code => products[code]).filter(Boolean);
    for(const key of ['catalog','collections']) {
      if (!state.blocks[key].loaded) continue;
      const list = get(key), container = doc.querySelector(key === 'catalog' ? '.product-track' : '.collection-grid');
      container.innerHTML = list.map(p => (key === 'catalog' ? product : collection)(p,state.blocks[key].photos[p.code])).join('');
      if(key === 'catalog') {
        const brands = [...new Set(list.map(p => p.brand).filter(Boolean))];
        doc.querySelector('.product-tabs').innerHTML = ['all',...brands].map(b => `<button type="button" class="chip${b==='all'?' active':''}" data-tab="${esc(b)}" aria-pressed="${b==='all'}">${esc(b==='all'?'Все пары':b==='winter'?'Зима':b)}</button>`).join('');
        doc.querySelector('#hasl-embed-productStatus').textContent = 'Показано моделей: '+list.length;
      }
    }
    const promos = get('promos');
    if(state.blocks.promos.loaded && promos.length) doc.querySelector('.hero-side').innerHTML = promos.map(p => product(p,state.blocks.promos.photos[p.code])).join('');
    const reviews = selectItems('reviews',state,content);
    if(content.reviews.items.length || state.reviews.manual.length || state.reviews.mode === 'selected') doc.querySelector('.reviews-track').innerHTML = reviews.map(review).join('');
    const news = selectItems('news',state,content);
    if(content.news.items.length || state.news.mode === 'selected') doc.querySelector('.editorial').innerHTML = news.map(article).join('');
    if (Array.isArray(state.layout)) {
      const main=doc.querySelector('main'), originals=new Map([...main.querySelectorAll(':scope > section')].map(s=>[s.dataset.editorSection,s]));
      const output=[];
      for(const item of state.layout) {
        const source=originals.get(item.source);if(!source||(options.clean&&item.visibility==='hidden'))continue;
        const node=source.cloneNode(true);node.dataset.siteBlock=item.id;
        node.dataset.visibility=item.visibility||'all';
        for(const kind of ['text','link','image']) for(const el of node.querySelectorAll('[data-editor-'+kind+']')) {
          const value=item[kind+'s']?.[el.getAttribute('data-editor-'+kind)];if(value===undefined)continue;
          if(kind==='text')el.textContent=value;else el.setAttribute(kind==='link'?'href':'src',kind==='link'&&value.startsWith('#')?value:safe(value));
        }
        if(Array.isArray(item.faq)&&node.querySelector('.faq'))node.querySelector('.faq').innerHTML=item.faq.map(f=>`<div class="faq-item"><button class="faq-q" type="button"><span data-editor-text="faq-${esc(f.id)}-question">${esc(f.question)}</span><span class="faq-sign" aria-hidden="true">+</span></button><div class="faq-a"><span data-editor-text="faq-${esc(f.id)}-answer">${esc(f.answer)}</span>${f.url?` <a href="${esc(safe(f.url))}">${esc(f.linkText||'Подробнее')}</a>`:''}</div></div>`).join('');
        if(item.products) {
          const list=(item.products.resolved||[]).map(c=>products[c]).filter(Boolean);
          const track=node.querySelector('.product-track,.collection-grid,.hero-side');
          if(track)track.innerHTML=list.map(p=>(track.matches('.collection-grid')?collection:product)(p,item.products.photos?.[p.code])).join('');
          const status=node.querySelector('[id$="productStatus"]');if(status)status.textContent='Показано моделей: '+list.length;
        }
        const tabs=node.querySelector('.product-tabs');
        if(tabs){const names={winter:'Зима',demi:'Демисезон',summer:'Лето'},chosen=Array.isArray(item.seasons)?item.seasons.filter(x=>Object.hasOwn(names,x)):[];
          tabs.querySelectorAll('[data-tab="winter"],[data-tab="demi"],[data-tab="summer"]').forEach(n=>n.remove());
          for(const key of [...new Set(chosen)]){const b=doc.createElement('button');b.type='button';b.className='chip';b.dataset.tab=key;b.setAttribute('aria-pressed','false');b.textContent=names[key];tabs.append(b);}
        }
        for(const kind of ['reviews','news']) {
          const track=node.querySelector(kind==='reviews'?'.reviews-track':'.editorial');
          if(track&&item.limit)track.innerHTML=selectItems(kind,state,content).slice(0,item.limit).map(kind==='reviews'?review:article).join('');
        }
        const ids=new Map();for(const el of [node,...node.querySelectorAll('[id]')])if(el.id){ids.set(el.id,el.id+'-'+item.id);el.id+='-'+item.id;}
        node.querySelectorAll('[href^="#"],[for],[aria-controls]').forEach(el=>{for(const attr of ['href','for','aria-controls']){const value=el.getAttribute(attr);if(!value)continue;const key=value.replace(/^#/,'');if(ids.has(key))el.setAttribute(attr,(attr==='href'?'#':'')+ids.get(key));}});
        if(/^#[0-9a-f]{6}$/i.test(item.background||''))node.style.backgroundColor=item.background;
        if(/^#[0-9a-f]{6}$/i.test(item.color||''))node.style.color=item.color;
        if(Number.isFinite(item.spacing))node.style.paddingBlock=Math.max(0,Math.min(160,item.spacing))+'px';
        output.push(node);
      }
      main.replaceChildren(...output);
      // Links to a retained source section follow its first instance; deleted targets lose their link.
      root.querySelectorAll('a[href^="#hasl-embed-"]').forEach(a=>{const id=a.getAttribute('href').slice(1);if(doc.getElementById(id))return;const target=[...main.querySelectorAll('[id]')].find(n=>n.id.startsWith(id+'-'));if(target)a.setAttribute('href','#'+target.id);else a.removeAttribute('href');});
    }
    const interactions=doc.createElement('script');interactions.textContent='('+window.HaslSiteRuntime.toString()+')();';root.append(interactions);
    doc.title = state.title || 'ХАСЛ — главная';
    const target = options.site === 'hasle' ? 'https://haslestore.com' : 'https://xn--80awro.xn--p1ai';
    routeLinks(root,target);
    // Relative storage URLs avoid a cross-origin media request before the universal bootstrap runs.
    if(options.clean && options.site === 'both') root.querySelectorAll('video[src]').forEach(v=>{const u=new URL(v.getAttribute('src'));if(u.pathname.startsWith('/storage/import_files/') && ['haslestore.com','xn--80awro.xn--p1ai'].includes(u.hostname))v.setAttribute('src',u.pathname+u.search);});
    const bootstrap = doc.createElement('script');
    bootstrap.textContent = `(()=>{const root=document.currentScript.closest('.hasl-home-embed');const target=${options.site === 'both' ? "['haslestore.com','www.haslestore.com'].includes(location.hostname)?'https://haslestore.com':['xn--80awro.xn--p1ai','www.xn--80awro.xn--p1ai'].includes(location.hostname)?'https://xn--80awro.xn--p1ai':'https://xn--80awro.xn--p1ai'" : JSON.stringify(target)};(${routeLinks.toString()})(root,target)})();`;
    root.insertBefore(bootstrap,root.querySelector('script'));
    const style = doc.createElement('style');
    style.textContent = '.hasl-home-embed .article h3{font-size:clamp(18px,2cqw,26px);line-height:1.22;overflow-wrap:anywhere}.hasl-home-embed .review-text{white-space:pre-line}.hasl-home-embed [data-editor-text]{white-space:pre-line}';
    style.textContent += '.hasl-home-embed [data-visibility=hidden]{display:none!important}@media(max-width:767px){.hasl-home-embed [data-visibility=desktop]{display:none!important}}@media(min-width:768px){.hasl-home-embed [data-visibility=phone]{display:none!important}}';
    root.append(style);
    if(options.clean) doc.querySelectorAll('*').forEach(el=> [...el.attributes].filter(a=>a.name.startsWith('data-editor-')).forEach(a=>el.removeAttribute(a.name)));
    return options.fragment ? root.outerHTML : '<!doctype html>\n'+doc.documentElement.outerHTML;
  }
  function selectItems(kind,state,content) {
    const settings=state[kind];
    let items=content[kind].items;
    if(settings.mode==='selected') items=settings.selected.map(id=>items.find(x=>x.id===id)||settings.pinned?.[id]).filter(Boolean);
    else items=items.slice(0,settings.limit);
    items=items.filter(x=>!settings.hidden.includes(x.id)).map(x=>({...x,...settings.overrides[x.id]}));
    if(kind==='reviews') items=[...settings.manual.filter(x=>!settings.hidden.includes(x.id)),...items];
    return items;
  }
  function faqDefaults(state,item){
    const doc=new DOMParser().parseFromString(template,'text/html'),section=doc.querySelector('[data-editor-section="s8"]');
    for(const el of section.querySelectorAll('[data-editor-text]')){const key=el.dataset.editorText;el.textContent=item.texts?.[key]??state.texts?.[key]??el.textContent;}
    for(const el of section.querySelectorAll('[data-editor-link]')){const key=el.dataset.editorLink;el.setAttribute('href',item.links?.[key]??state.links?.[key]??el.getAttribute('href'));}
    return [...section.querySelectorAll('.faq-item')].map((n,i)=>{const q=n.querySelector('.faq-q').cloneNode(true),a=n.querySelector('.faq-a').cloneNode(true),link=a.querySelector('a');q.querySelector('.faq-sign')?.remove();const url=link?.getAttribute('href')||'',linkText=link?.textContent||'';link?.remove();return {id:'default'+i,question:q.textContent.trim(),answer:a.textContent.trim().replace(/\s+\.$/,''),url,linkText};});
  }
  return {init,build,selectItems,esc,safe,optimized,faqDefaults};
})();
