/* Независимый от магазина HTML для универсальных шаблонов; холст и экспорт используют один результат. */
window.UniversalSiteRenderer = (state, options={}) => {
  const doc=document.implementation.createHTMLDocument(state.title||'Сайт');
  doc.documentElement.lang='ru';
  const charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');doc.head.prepend(charset);
  const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width, initial-scale=1';doc.head.append(viewport);
  const root=doc.createElement('div');root.className='hasl-home-embed universal-site-page';root.dataset.sitePreview=String(!!options.preview);doc.body.append(root);
  const main=doc.createElement('main');root.append(main);
  if(options.fontStyles){const fonts=doc.createElement('style');fonts.textContent=options.fontStyles;root.append(fonts);}
  const style=doc.createElement('style');style.textContent='body{margin:0}.universal-site-page{container-type:inline-size;font:16px/1.5 Arial,sans-serif;color:#202124;background:#fff;min-height:100vh}.universal-site-page *{box-sizing:border-box}.universal-site-page a{color:inherit}.universal-site-page [data-editor-text]{white-space:pre-line}.universal-site-page [data-visibility=hidden]{display:none!important}.universal-site-page .site-custom-section{position:relative;isolation:isolate}@container(max-width:767px){.universal-site-page [data-visibility=desktop]{display:none!important}}@container(min-width:768px){.universal-site-page [data-visibility=phone]{display:none!important}}';root.append(style);
  for(const item of state.layout||[]){
    if(options.clean&&item.visibility==='hidden')continue;
    // Универсальные проекты состоят из редактируемых пользовательских блоков.
    if(item.source!=='custom')continue;
    const node=SiteElements.section(doc,item);node.dataset.siteBlock=item.id;node.dataset.visibility=item.visibility||'all';node.id=HaslRenderer.anchorFor(item);
    for(const text of node.querySelectorAll('[data-editor-text]'))HaslRenderer.applyTextLinks(text,item.inlineLinks?.[text.dataset.editorText]);
    for(const [key,property] of [['background','backgroundColor'],['color','color']])if(/^#[0-9a-f]{6}$/i.test(item[key]||''))node.style[property]=item[key];
    const spacing=(values)=>['top','bottom'].filter(side=>Number.isInteger(values?.[side])&&values[side]>=0&&values[side]<=400).map(side=>'padding-'+side+':'+values[side]+'px!important').join(';');
    const selector='[data-site-block="'+CSS.escape(item.id)+'"]',desktop=spacing(item.spacing),phone=spacing(item.spacingMobile);
    if(desktop||phone){const css=doc.createElement('style');css.textContent=(desktop?selector+'{'+desktop+'}':'')+(phone?'@container(max-width:767px){'+selector+'{'+phone+'}}':'');node.append(css);}
    main.append(node);
    if(item.blockBackgrounds||item.blockBackgroundPaint)HaslRenderer.sectionBackground(doc,node,item.blockBackgrounds,item.blockBackgroundPosition,item.blockBackgroundPaint);
  }
  SiteElements.decorate(doc,root,state);
  const backgrounds=doc.createElement('style');backgrounds.textContent='.universal-site-page .section-wallpaper{position:absolute;inset:0;overflow:hidden;z-index:-1;pointer-events:none}.universal-site-page .section-wallpaper img{position:absolute;max-width:none}.universal-site-page .section-wallpaper-phone{display:none}@container(max-width:767px){.universal-site-page .section-wallpaper-desktop{display:none}.universal-site-page .section-wallpaper-phone{display:block}}';root.append(backgrounds);
  window.SiteObjects?.apply(doc,root,state,options);
  window.SiteGlobalStyles?.apply(doc,root,state);
  if(window.HaslObjectRuntime){const script=doc.createElement('script');script.textContent='('+HaslObjectRuntime.toString()+')();';root.append(script);}
  // Не подключаем маршрутизацию, статистику и каталог ХАСЛ к другим брендам.
  doc.querySelectorAll('[data-editor-text]').forEach(node=>node.setAttribute('data-site-text',''));
  if(options.clean)doc.querySelectorAll('*').forEach(node=>[...node.attributes].filter(a=>a.name.startsWith('data-editor-')).forEach(a=>node.removeAttribute(a.name)));
  return options.fragment?root.outerHTML:'<!doctype html>\n'+doc.documentElement.outerHTML;
};
