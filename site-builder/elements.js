/* Elements render into the existing project and HTML exporter, with no executable HTML input. */
(() => {
  'use strict';
  const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types={heading:'Заголовок',text:'Текст',image:'Изображение',button:'Кнопка',video:'Видео',divider:'Разделитель',spacer:'Отступ',form:'Форма'};
  const fontWeights=[['','По шаблону'],[100,'Thin — 100'],[200,'ExtraLight — 200'],[300,'Light — 300'],[400,'Regular — 400'],[500,'Medium — 500'],[600,'SemiBold — 600'],[700,'Bold — 700'],[800,'ExtraBold — 800'],[900,'Black — 900']];
  const properties={fontSize:'font-size',fontWeight:'font-weight',fontFamily:'font-family',fontStyle:'font-style',textDecoration:'text-decoration',lineHeight:'line-height',letterSpacing:'letter-spacing',color:'color',background:'background-color',align:'text-align',radius:'border-radius',padding:'padding',paddingX:'padding-inline',paddingY:'padding-block',marginTop:'margin-top',marginBottom:'margin-bottom',opacity:'opacity',width:'width'};
  const px=new Set(['fontSize','letterSpacing','radius','padding','paddingX','paddingY','marginTop','marginBottom']);
  const url=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const pageHref=value=>/^\/?(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z][\w-]*)?$/.test(value||'');
  const href=value=>/^#[a-zA-Z][\w-]*$/.test(value||'')||pageHref(value)?value:url(value);
  const limits={fontSize:[8,200],fontWeight:[100,900],lineHeight:[.6,3],letterSpacing:[-5,30],radius:[0,200],padding:[0,200],paddingX:[0,200],paddingY:[0,200],marginTop:[0,400],marginBottom:[0,400],opacity:[0,1],width:[1,100]};
  const choices={align:['left','center','right'],fontFamily:['Arial','Montserrat','Manrope','Georgia','Verdana'],fontStyle:['normal','italic'],textDecoration:['none','underline','line-through']};
  function css(values){return Object.entries(values||{}).filter(([key,value])=>Object.hasOwn(properties,key)&&(limits[key]?typeof value==='number'&&Number.isFinite(value)&&value>=limits[key][0]&&value<=limits[key][1]:choices[key]?choices[key].includes(value):/^#[0-9a-f]{6}$/i.test(value))).map(([key,value])=>properties[key]+':'+String(value)+(px.has(key)?'px':key==='width'?'%':'')+'!important').join(';');}
  function validate(value){
    if(value.layout!==undefined&&(!Array.isArray(value.layout)||value.layout.length>120))throw new Error('В проекте должно быть до 120 секций.');
    for(const section of value.layout||[]){
      if(!section||typeof section!=='object'||typeof section.id!=='string'||!/^[a-zA-Z0-9_-]{1,70}$/.test(section.id))throw new Error('Повреждена секция проекта.');
      if(section.source!=='custom')continue;
      if(!Array.isArray(section.elements)||section.elements.length>100)throw new Error('Допускается до 100 элементов в секции.');
      const ids=new Set();for(const e of section.elements){if(!e||!Object.hasOwn(types,e.type)||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,70}$/.test(e.id)||ids.has(e.id))throw new Error('Повреждены элементы секции.');ids.add(e.id);}
    }
  }
  function section(doc,item){
    const node=doc.createElement('section');node.className='site-custom-section';
    const grid=doc.createElement('div');grid.className='site-element-grid';grid.dataset.layout=item.mode||'grid';
    grid.style.setProperty('--columns',item.columns||1);grid.style.setProperty('--phone-columns',item.mobileColumns||1);
    grid.style.setProperty('--gap',(item.gap??24)+'px');grid.style.setProperty('--section-width',(item.contentWidth||1200)+'px');
    grid.style.setProperty('--free-height',(item.height||600)+'px');grid.style.setProperty('--free-phone-height',(item.mobileHeight||700)+'px');
    for(const element of item.elements||[]){
      const wrap=doc.createElement('div');wrap.className='site-element';wrap.dataset.siteElement=element.id;wrap.dataset.elementType=element.type;
      wrap.dataset.elementVisibility=element.visibility||'all';wrap.style.setProperty('--span',Math.min(element.span||1,item.columns||1));wrap.style.setProperty('--phone-span',Math.min(element.mobileSpan||1,item.mobileColumns||1));
      const key='element-'+element.id,text=item.texts?.[key]??element.text??'';
      let markup='';
      if(['heading','text'].includes(element.type)){const tag=element.type==='heading'?(['h1','h2','h3','h4'].includes(element.tag)?element.tag:'h2'):'p';markup=`<${tag} data-editor-text="${E(key)}">${E(text)}</${tag}>`;}
      if(element.type==='image')markup=element.src&&url(element.src)?`<img src="${E(url(element.src))}" alt="${E(element.alt)}" loading="lazy">`:'<div class="site-image-empty">Добавьте изображение</div>';
      if(element.type==='button')markup=`<a class="site-element-button" ${href(element.href)?`href="${E(href(element.href))}"`:''} ${element.newTab?'target="_blank" rel="noopener noreferrer"':''}><span data-editor-text="${E(key)}">${E(text||'Кнопка')}</span></a>`;
      if(element.type==='video')markup=element.src&&url(element.src)?`<video src="${E(url(element.src))}" controls playsinline preload="metadata" ${url(element.poster)?`poster="${E(url(element.poster))}"`:''}></video>`:'<div class="site-image-empty">Укажите ссылку на MP4 / WebM</div>';
      if(element.type==='divider')markup='<hr>';
      if(element.type==='spacer')markup=`<div aria-hidden="true" style="height:${element.height??40}px"></div>`;
      if(element.type==='form')markup=`<form ${url(element.action)?`action="${E(url(element.action))}" method="post"`:''} class="site-contact-form"><label>Имя<input name="name" autocomplete="name" required maxlength="200"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="320"></label><label>Сообщение<textarea name="message" required maxlength="5000"></textarea></label><button type="submit" ${url(element.action)?'':'disabled'}>${E(text||'Отправить')}</button>${!url(element.action)?'<p>Укажите адрес обработчика формы в настройках.</p>':''}</form>`;
      wrap.innerHTML=markup;
      const rect=element.rect||{x:0,y:0,width:300,height:100},phone=element.mobileRect||{x:0,y:0,width:280,height:100};
      for(const [device,r] of [['',rect],['phone-',phone]])for(const [key,value] of Object.entries(r))wrap.style.setProperty('--'+device+key,value+'px');
      grid.append(wrap);
    }node.append(grid);return node;
  }
  function decorate(doc,root,state){
    const styles=[];
    for(const item of state.layout||[]){
      const node=root.querySelector('[data-site-block="'+CSS.escape(item.id)+'"]');if(!node)continue;
      for(const el of node.querySelectorAll('[data-editor-text],[data-editor-image],[data-editor-link]'))if(!el.closest('[data-site-element]'))el.dataset.siteElement=el.dataset.editorText?'text-'+el.dataset.editorText:el.dataset.editorImage?'image-'+el.dataset.editorImage:'link-'+el.dataset.editorLink;
      const scope='.hasl-home-embed [data-site-block="'+CSS.escape(item.id)+'"]';
      const add=(key,values,mobile)=>{const rules=css(values);if(!rules)return;const selector=scope+' [data-site-element="'+CSS.escape(key)+'"]';styles.push((mobile?'@container(max-width:767px){':'')+selector+'{'+rules+'}'+(mobile?'}':''));};
      for(const element of item.elements||[]){add(element.id,element.style,false);add(element.id,element.mobileStyle,true);}
      for(const [key,value] of Object.entries(item.elementStyles||{})){add(key,value.desktop,false);add(key,value.phone,true);}
    }
    const style=doc.createElement('style');style.textContent=baseCSS+styles.join('\n');root.append(style);
    const page=state.pageSettings||{};
    if(page.description){doc.head.querySelectorAll('meta[name="description"]').forEach(n=>n.remove());const meta=doc.createElement('meta');meta.name='description';meta.content=page.description;doc.head.append(meta);}
    if(Object.hasOwn(page,'noindex'))doc.head.querySelectorAll('meta[name="robots"]').forEach(n=>n.remove());
    if(page.noindex){const meta=doc.createElement('meta');meta.name='robots';meta.content='noindex,nofollow';doc.head.append(meta);}
    if(url(page.canonical)){doc.head.querySelectorAll('link[rel="canonical"]').forEach(n=>n.remove());const link=doc.createElement('link');link.rel='canonical';link.href=url(page.canonical);doc.head.append(link);}
    if(url(page.favicon)){doc.head.querySelectorAll('link[rel="icon"]').forEach(n=>n.remove());const link=doc.createElement('link');link.rel='icon';link.href=url(page.favicon);doc.head.append(link);}
  }
  const baseCSS=`.hasl-home-embed .site-custom-section{padding:48px 24px;min-width:0}.hasl-home-embed .site-element-grid{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:var(--gap);max-width:var(--section-width);margin-inline:auto;position:relative}.hasl-home-embed .site-element{grid-column:span var(--span);align-self:start;min-width:0;position:relative;overflow-wrap:break-word}.hasl-home-embed .site-element :is(h1,h2,h3,h4,p){margin:0;font:inherit;color:inherit}.hasl-home-embed .site-element[data-element-type=heading]{font-size:40px;font-weight:800;line-height:1.15}.hasl-home-embed .site-element[data-element-type=text]{font-size:18px;line-height:1.6}.hasl-home-embed .site-element :is(img,video){display:block;max-width:100%;width:100%;height:auto;border-radius:inherit}.hasl-home-embed .site-element-button,.hasl-home-embed .site-contact-form button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 24px;background:#ceff00;color:#20241f;border-radius:8px;text-decoration:none;border:0;font:inherit}.hasl-home-embed .site-element-button{background:inherit;color:inherit}.hasl-home-embed [data-element-type=button]{background:#ceff00;color:#20241f;border-radius:8px;justify-self:start}.hasl-home-embed .site-image-empty{padding:32px;border:1px dashed #aeb5a7;background:#f0f2eb;color:#4f574a;text-align:center}.hasl-home-embed .site-contact-form{display:grid;gap:16px}.hasl-home-embed .site-contact-form label{display:grid;gap:6px}.hasl-home-embed .site-contact-form :is(input,textarea){font:inherit;padding:12px;border:1px solid #aeb5a7;border-radius:6px;width:100%;box-sizing:border-box;background:white;color:#20241f}.hasl-home-embed .site-contact-form button:disabled{opacity:.5}.hasl-home-embed .site-element hr{border:0;border-top:1px solid currentColor;margin:12px 0}.hasl-home-embed .site-element-grid[data-layout=free]{display:block;height:var(--free-height)}.hasl-home-embed [data-layout=free]>.site-element{position:absolute;left:var(--x);top:var(--y);width:var(--width);min-height:var(--height);max-width:100%}.hasl-home-embed [data-element-visibility=hidden]{display:none!important}@container(max-width:767px){.hasl-home-embed .site-custom-section{padding:32px 16px}.hasl-home-embed .site-element-grid{grid-template-columns:repeat(var(--phone-columns),minmax(0,1fr))}.hasl-home-embed .site-element{grid-column:span var(--phone-span)}.hasl-home-embed .site-element[data-element-type=heading]{font-size:28px}.hasl-home-embed .site-element-grid[data-layout=free]{height:var(--free-phone-height)}.hasl-home-embed [data-layout=free]>.site-element{left:var(--phone-x);top:var(--phone-y);width:var(--phone-width);min-height:var(--phone-height)}.hasl-home-embed [data-element-visibility=desktop]{display:none!important}}@container(min-width:768px){.hasl-home-embed [data-element-visibility=phone]{display:none!important}}`;
  window.SiteElements={types,fontWeights,section,decorate,url,href,pageHref,css,validate};
})();
