/* Объектные правки поверх единственного JSON-проекта и конечного DOM. */
(() => {
  'use strict';
  const tags=new Set('SECTION DIV ARTICLE ASIDE HEADER FOOTER MAIN NAV H1 H2 H3 H4 H5 H6 P SPAN STRONG EM B I U S SMALL A BUTTON IMG VIDEO AUDIO SOURCE DETAILS SUMMARY HR UL OL LI LABEL INPUT SELECT OPTION TEXTAREA FORM FIGURE FIGCAPTION TABLE THEAD TBODY TR TD TH SVG PATH CIRCLE RECT LINE POLYLINE POLYGON G DEFS STOP LINEARGRADIENT CLIPPATH BR'.split(' '));
  const containers=new Set('SECTION DIV ARTICLE ASIDE HEADER FOOTER MAIN NAV LI FIGURE FIGCAPTION FORM TD TH UL OL TABLE THEAD TBODY TR DETAILS'.split(' '));
  function canContain(parent,child){
    if(!parent||!child||!containers.has(parent.tagName)||parent===child||child.contains(parent))return false;
    const p=parent.tagName,c=child.tagName,only={UL:['LI'],OL:['LI'],TABLE:['THEAD','TBODY'],THEAD:['TR'],TBODY:['TR'],TR:['TD','TH']},owners={LI:['UL','OL'],THEAD:['TABLE'],TBODY:['TABLE'],TR:['THEAD','TBODY'],TD:['TR'],TH:['TR'],SUMMARY:['DETAILS'],FIGCAPTION:['FIGURE']};
    if(only[p]&&!only[p].includes(c)||owners[c]&&!owners[c].includes(p))return false;
    if((child.matches('form')||child.querySelector('form'))&&parent.closest('form'))return false;
    if(parent.closest('a,button')&&(child.matches('a,button,input,select,textarea,form,details')||child.querySelector('a,button,input,select,textarea,form,details')))return false;
    if(parent.closest('label')&&(c==='LABEL'||child.querySelector('label')))return false;
    if(c==='SUMMARY'&&[...parent.children].some(n=>n!==child&&n.tagName==='SUMMARY'))return false;
    if(c==='FIGCAPTION'&&[...parent.children].some(n=>n!==child&&n.tagName==='FIGCAPTION'))return false;
    if(c==='SOURCE'&&!['VIDEO','AUDIO'].includes(p))return false;
    return true;
  }
  function place(parent,node,before=null){if(!canContain(parent,node))return false;if(node.tagName==='SUMMARY')before=[...parent.children].find(n=>n!==node)||null;if(before&&before.parentElement!==parent)return false;parent.insertBefore(node,before);return true;}
  const hash=value=>{let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(36);};
  const safeURL=(value,link=false)=>link?window.SiteElements.href(value):window.SiteElements.url(value);
  const canText=node=>/^(H[1-6]|P|SPAN|STRONG|EM|B|I|SMALL|A|BUTTON|LABEL|SUMMARY)$/.test(node.tagName)&&!node.querySelector('img,video,audio,button,input,select,textarea,div,p,h1,h2,h3,svg,[data-editor-text]');
  const eligible=node=>tags.has(node.tagName.toUpperCase())&&!node.closest('svg *,[data-site-text-style]')&&!node.matches('.site-section-anchor,[data-object-background],[data-object-background] *,[data-design-handle]');
  const key=node=>node.dataset.siteObject;
  const textStyleKeys=['color','background','fontSize','fontWeight'];
  function validTextStyles(record){
    if(!record||typeof record!=='object'||Object.keys(record).some(k=>!['text','runs'].includes(k))||typeof record.text!=='string'||record.text.length>10000||!Array.isArray(record.runs)||record.runs.length>1000)return false;
    let end=0;for(const run of record.runs){if(!run||typeof run!=='object'||Object.keys(run).some(k=>!['start','end',...textStyleKeys].includes(k))||!Number.isInteger(run.start)||!Number.isInteger(run.end)||run.start<end||run.end<=run.start||run.end>record.text.length)return false;
      for(const key of textStyleKeys)if(run[key]!==undefined&&!(key==='fontSize'?Number.isInteger(run[key])&&run[key]>=8&&run[key]<=200:key==='fontWeight'?[400,500,600,700,800,900].includes(run[key]):/^#[0-9a-f]{6}$/i.test(run[key])))return false;end=run.end;
    }return true;
  }
  function readTextStyles(node,phone=false){
    const runs=[],walker=node.ownerDocument.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t,offset=0;
    while(t=walker.nextNode()){const start=offset;offset+=t.textContent.length;const value={};for(let p=t.parentElement;p&&p!==node;p=p.parentElement)if(p.hasAttribute('data-site-text-style'))for(const key of textStyleKeys)if(value[key]===undefined){const raw=phone?p.style.getPropertyValue('--site-word-phone-'+key):p.style.getPropertyValue('--site-word-base-'+key)||p.style.getPropertyValue(({background:'background-color',fontSize:'font-size',fontWeight:'font-weight'})[key]||key);if(raw&&!raw.startsWith('var(')){if(key==='fontSize'||key==='fontWeight')value[key]=parseInt(raw,10);else{const m=raw.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);value[key]=m?'#'+m.slice(1).map(x=>Number(x).toString(16).padStart(2,'0')).join(''):raw;}}}
      if(offset>start&&Object.keys(value).length){const previous=runs.at(-1);if(previous&&previous.end===start&&textStyleKeys.every(k=>previous[k]===value[k]))previous.end=offset;else runs.push({start,end:offset,...value});}
    }return {text:node.textContent,runs};
  }
  function applyTextStyles(node,record,phone){
    const text=node.textContent,empty={text,runs:[]};if(!record&&!phone)return false;
    record=validTextStyles(record)&&record.text===text?record:empty;phone=validTextStyles(phone)&&phone.text===text?phone:empty;
    const points=[...new Set([0,text.length,...record.runs.flatMap(r=>[r.start,r.end]),...phone.runs.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b),runs=[];
    for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1],base=record.runs.find(r=>r.start<=start&&r.end>=end),mobile=phone.runs.find(r=>r.start<=start&&r.end>=end);if(base||mobile)runs.push({...base,start,end,phone:mobile||{}});}
    for(const span of [...node.querySelectorAll('[data-site-text-style]')].reverse())span.replaceWith(...span.childNodes);node.normalize();
    const walker=node.ownerDocument.createTreeWalker(node,NodeFilter.SHOW_TEXT),nodes=[];let t,offset=0;while(t=walker.nextNode()){nodes.push({node:t,start:offset,end:offset+t.textContent.length});offset+=t.textContent.length;}
    for(const entry of nodes){const {node:t,start,end}=entry,fragment=node.ownerDocument.createDocumentFragment();let cursor=start;
      for(const run of runs){const a=Math.max(start,run.start),b=Math.min(end,run.end);if(b<=a)continue;if(a>cursor)fragment.append(node.ownerDocument.createTextNode(t.textContent.slice(cursor-start,a-start)));const span=node.ownerDocument.createElement('span');span.dataset.siteTextStyle='true';span.textContent=t.textContent.slice(a-start,b-start);for(const key of textStyleKeys){const prop=({background:'background-color',fontSize:'font-size',fontWeight:'font-weight'})[key]||key,base=run[key]===undefined?null:String(run[key])+(key==='fontSize'?'px':''),mobile=run.phone[key]===undefined?null:String(run.phone[key])+(key==='fontSize'?'px':'');if(mobile!==null){span.setAttribute('data-site-word-phone-'+key.toLowerCase(),'');span.style.setProperty('--site-word-phone-'+key,mobile);if(base!==null)span.style.setProperty('--site-word-base-'+key,base);span.style.setProperty(prop,'var(--site-word-active-'+key+',var(--site-word-base-'+key+',inherit))','important');}else if(base!==null)span.style.setProperty(prop,base,'important');}fragment.append(span);cursor=b;
      }if(cursor<end)fragment.append(node.ownerDocument.createTextNode(t.textContent.slice(cursor-start)));t.replaceWith(fragment);
    }return true;
  }
  function setButtonIcon(node,choice){
    if(!['none','right','up-right','down-right'].includes(choice)||!node.matches('a,button'))return;
    node.querySelectorAll(':scope > svg,:scope > [data-button-icon]').forEach(n=>n.remove());node.dataset.buttonIcon=choice;
    if(choice==='none')return;
    const svg=node.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg'),path=node.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');
    for(const [name,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','aria-hidden':'true',focusable:'false'}))svg.setAttribute(name,value);
    svg.dataset.buttonIcon=choice;path.setAttribute('d',({right:'M5 12h14m-6-6 6 6-6 6','up-right':'M5 19 19 5M5 5h14v14','down-right':'M5 5 19 19M5 19h14V5'})[choice]);svg.append(path);
    svg.style.cssText='display:inline-block!important;width:20px!important;height:20px!important;flex:0 0 20px;pointer-events:none';node.style.setProperty('gap','12px');node.append(svg);
  }
  const validKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  function register(section){
    const used=new Set();let index=0;
    for(const node of [section,...section.querySelectorAll('*')]){
      if(!eligible(node))continue;
      let id=node===section?'root':node.dataset.siteObject;
      if(!id){
        if(node.dataset.editorText)id='text-'+node.dataset.editorText;
        else if(node.dataset.editorImage)id='image-'+node.dataset.editorImage;
        else if(node.dataset.editorLink)id='link-'+node.dataset.editorLink;
        else if(node.dataset.siteElement)id='element-'+node.dataset.siteElement;
        else if(node.dataset.sourceObject)id=node.dataset.sourceObject;
        else{
          const card=node.closest('[data-object-seed],[data-feed-id]'),path=[];let p=node;
          while(p&&p!==section&&p!==card){path.unshift(p.tagName.toLowerCase()+[...p.parentElement.children].indexOf(p));p=p.parentElement;}
          id=(card?'card-'+hash(card.dataset.objectSeed||card.dataset.feedId):'path')+'-'+path.join('-');
          const owner=node.closest('[data-site-element]');
          if(!card&&owner&&owner!==node){
            node.dataset.objectLegacy=id;const local=[];let child=node;
            while(child&&child!==owner){local.unshift(child.tagName.toLowerCase()+[...child.parentElement.children].indexOf(child));child=child.parentElement;}
            id='child-'+owner.dataset.siteElement+'-'+local.join('-');
          }
        }
      }
      const base=id;while(used.has(id))id=base+'-'+(++index);used.add(id);node.dataset.siteObject=id;
    }
  }
  function cleanHTML(doc,html){
    const template=doc.createElement('template');template.innerHTML=html;
    for(const node of [...template.content.querySelectorAll('*')]){
      if(!tags.has(node.tagName.toUpperCase())||node.matches('[data-design-handle],[data-editor-overlay]')){node.remove();continue;}
      for(const attr of [...node.attributes]){
        const name=attr.name.toLowerCase(),value=attr.value;
        if(name.startsWith('on')||['srcdoc','contenteditable','autofocus','formaction'].includes(name)||(name==='data-site-object'&&!validKey(value))||(/^data-editor-(?:text|image|link)$/.test(name)&&!/^obj-[A-Za-z0-9_-]+$/.test(value))||(name==='style'&&/(?:expression|javascript:|@import|behavior\s*:)/i.test(value)))node.removeAttribute(attr.name);
        else if(['src','poster','href','action','xlink:href'].includes(name)&&value&&!safeURL(value,name.includes('href'))&&!/^#[A-Za-z][\w-]*$/.test(value))node.removeAttribute(attr.name);
      }
    }
    return template.content.firstElementChild;
  }
  const number=(v,def=0)=>typeof v==='number'&&Number.isFinite(v)?v:def;
  function crop(value){const c=value||{};return ['top','right','bottom','left'].map(k=>Math.max(0,Math.min(99,number(c[k])))).join('% ')+'%';}
  // The sale banner has a separate mobile composition: desktop drags are not mobile offsets.
  function values(p,device,node){
    const d=p?.desktop||{},m=p?.phone||{};if(device!=='phone')return d;
    const independent=node?.closest('.hero-sale')&& !node.matches('.hero-sale')&&('x'in d||'y'in d);
    return {...d,...(independent?{x:0,y:0}:{}),...m,style:{...d.style,...m.style},layout:{...d.layout,...m.layout}};
  }
  function css(v){
    const out=[];
    if(['x','y'].some(k=>k in v))out.push(`translate:${number(v.x)}px ${number(v.y)}px`);
    if('rotation'in v)out.push(`rotate:${number(v.rotation)}deg`);
    if('scale'in v||'flipX'in v||'flipY'in v){const s=number(v.scale,100)/100;out.push(`scale:${v.flipX?-s:s} ${v.flipY?-s:s}`);}
    for(const k of ['width','height'])if(typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=1&&v[k]<=10000)out.push(`${k}:${v[k]}px`,`min-${k}:0`,`max-${k}:none`,'box-sizing:border-box');
    if(typeof v.opacity==='number')out.push('opacity:'+Math.max(0,Math.min(1,number(v.opacity,1))));
    if('visible'in v)out.push('visibility:'+(v.visible?'visible':'hidden'));
    if(typeof v.z==='number')out.push('z-index:'+Math.round(number(v.z)));
    if(['static','relative','absolute','fixed','sticky'].includes(v.position))out.push('position:'+(v.position==='static'?'relative':v.position));
    if(v.display==='inline-block')out.push('display:inline-block');
    if(['visible','hidden','clip'].includes(v.overflow))out.push('overflow:'+v.overflow);
    if(['cover','contain','fill'].includes(v.fit))out.push('object-fit:'+v.fit);
    if('positionX'in v||'positionY'in v)out.push(`object-position:${number(v.positionX,50)}% ${number(v.positionY,50)}%`);
    if(v.crop)out.push('clip-path:inset('+crop(v.crop)+')');
    if(v.style){const style=window.SiteElements.css(v.style);if(style)out.push(style.replace(/!important/g,''));}
    return out.map(x=>x+'!important').join(';')+';'+(window.SiteLayout?.css(v)||'');
  }
  function apply(doc,root,state,options){
    if(!options.clean)root.dataset.editorPreview='true';
    const sheets=['@container(max-width:767px){'+textStyleKeys.map(key=>'.hasl-home-embed [data-site-word-phone-'+key.toLowerCase()+']{--site-word-active-'+key+':var(--site-word-phone-'+key+')}').join('')+'}'];
    for(const item of state.layout||[]){
      const section=[...root.querySelectorAll('main > section')].find(n=>n.dataset.siteBlock===item.id);if(!section)continue;
      register(section);const nodes=new Map([section,...section.querySelectorAll('[data-site-object]')].map(n=>[key(n),n]));
      for(const n of section.querySelectorAll('[data-object-legacy]'))nodes.set(n.dataset.objectLegacy,n);
      for(const record of item.addedObjects||[]){
        const parent=nodes.get(record.parent||'root');if(!parent||!containers.has(parent.tagName))continue;
        const node=cleanHTML(doc,record.html);if(!node)continue;
        if(!place(parent,node))continue;registerAdded(node,record.id);for(const n of [node,...node.querySelectorAll('[data-site-object]')])nodes.set(key(n),n);
      }
      for(const [id,p] of Object.entries(item.objects||{})){
        const node=nodes.get(id);if(!node)continue;
        if(p.parent){const parent=nodes.get(p.parent);if(parent)place(parent,node);}
        if(p.deleted){node.remove();continue;}
        if(p.reveal&&id!=='root'){for(const attr of ['hidden','aria-hidden','data-visibility','data-element-visibility'])node.removeAttribute(attr);node.style.removeProperty('display');node.style.removeProperty('visibility');node.style.removeProperty('opacity');}
        if(!options.clean&&p.locked)node.dataset.objectLocked='true';
        if(typeof p.text==='string'&&canText(node))node.textContent=p.text;
        if(p.attrs)for(const [name,value] of Object.entries(p.attrs)){
          if(['href','src','poster','action'].includes(name)){if(!value)node.removeAttribute(name);else{const url=safeURL(value,name==='href');if(url)node.setAttribute(name,url);}}
          else if(['alt','title','placeholder'].includes(name))node.setAttribute(name,value);
          else if(name==='newTab'&&node.tagName==='A'){if(value){node.target='_blank';node.rel='noopener noreferrer';}else{node.removeAttribute('target');node.removeAttribute('rel');}}
        }
        const d=p.desktop||{},m=p.phone||{},scope='.hasl-home-embed [data-site-block="'+CSS.escape(item.id)+'"]'+(id==='root'?'':' [data-site-object="'+CSS.escape(key(node))+'"]');
        const merged=values(p,'phone',node);
        const desktop=css(d),phone=Object.keys(m).length||merged.x!==d.x||merged.y!==d.y?css(merged):'';if(desktop)sheets.push(scope+'{'+desktop+'}');if(phone)sheets.push('@container(max-width:767px){'+scope+'{'+phone+'}}');
        for(const [v,small] of [[d,false],[merged,true]]){const parent=window.SiteLayout?.childCSS(v,scope)||'',childRules=[];for(const child of node.children){const p=item.objects?.[child.dataset.siteObject]||{},l=small?{...p.desktop?.layout,...p.phone?.layout}:p.desktop?.layout||{};if(v.layout?.mode==='row'&&l.widthMode==='fill'||v.layout?.mode==='column'&&l.heightMode==='fill')childRules.push(scope+'>[data-site-object="'+CSS.escape(child.dataset.siteObject)+'"]{flex:1 1 0!important}');else if(['row','column','block'].includes(v.layout?.mode))childRules.push(scope+'>[data-site-object="'+CSS.escape(child.dataset.siteObject)+'"]{flex:0 0 auto!important}');}if(parent||childRules.length)sheets.push((small?'@container(max-width:767px){':'')+parent+childRules.join('')+(small?'}':''));}
        if(d.visible===false||d.opacity===0)node.dataset.objectHideDesktop='true';
        if((m.visible??d.visible)===false||(m.opacity??d.opacity)===0)node.dataset.objectHidePhone='true';
        if(p.background)background(doc,node,p.background,d,m,scope,sheets);
        if(p.buttonIcon!==undefined)setButtonIcon(node,p.buttonIcon);
        if(p.goals&&node.matches('a,button,input[type=button],input[type=submit]')){
          for(const [prop,attr] of [['counterId','counter'],['yandexGoal','yandex'],['googleCategory','category'],['googleAction','action']])if(p.goals[prop])node.setAttribute('data-object-goal-'+attr,p.goals[prop]);
        }
      }
      // Apply ordering after every reparent, independent of JSON property order.
      const placed=new Set(),visiting=new Set();
      const order=id=>{if(placed.has(id)||visiting.has(id))return;visiting.add(id);const n=nodes.get(id),before=item.objects?.[id]?.before,next=nodes.get(before);if(n&&next&&n!==next&&n.parentElement===next.parentElement){order(before);next.before(n);}visiting.delete(id);placed.add(id);};
      for(const id of Object.keys(item.objects||{}))order(id);
      for(const details of section.querySelectorAll('details')){const summary=[...details.children].find(n=>n.tagName==='SUMMARY');if(summary&&summary!==details.firstElementChild)details.prepend(summary);}
      // A child override must not make a hidden parent visible in the canvas.
      const scope='.hasl-home-embed [data-site-block="'+CSS.escape(item.id)+'"]';
      sheets.push('@container(min-width:768px){'+scope+'[data-object-hide-desktop=true] [data-site-object],'+scope+' [data-object-hide-desktop=true] [data-site-object]{visibility:hidden!important}}@container(max-width:767px){'+scope+'[data-object-hide-phone=true] [data-site-object],'+scope+' [data-object-hide-phone=true] [data-site-object]{visibility:hidden!important}}');
      if(!options.clean)for(const group of item.objectGroups||[])if(group.locked)for(const id of group.members||[]){const n=nodes.get(id);if(n)n.dataset.objectLocked='true';}
      // Copied/added fields retain independent IDs and use the existing text maps.
      for(const n of section.querySelectorAll('[data-editor-text]'))if(n.dataset.editorText.startsWith('obj-')&&item.texts?.[n.dataset.editorText]!==undefined)n.textContent=item.texts[n.dataset.editorText];
      for(const [id,p] of Object.entries(item.objects||{})){const node=nodes.get(id);if(node&&(p.textStyles||p.phoneTextStyles))applyTextStyles(node,p.textStyles,p.phoneTextStyles);}
    }
    const style=doc.createElement('style');style.dataset.objectSheet='true';style.textContent=sheets.join('\n');root.append(style);
  }
  function registerAdded(node,id){
    let i=0;for(const n of [node,...node.querySelectorAll('*')])if(eligible(n)){if(!n.dataset.siteObject)n.dataset.siteObject='add-'+id+'-'+i;n.removeAttribute('data-source-object');i++;}
  }
  function background(doc,node,bg,d,m,scope,sheets){
    if(node.matches('img,video,input,hr,br,source,svg'))return;
    const layer=doc.createElement('div');layer.dataset.objectBackground='true';layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;z-index:-1';
    const base=bg.desktop||{},phone={...base,...bg.phone};
    for(const [device,b] of [['desktop',base],['phone',phone]]){
      const src=safeURL(b.src||'');if(!src)continue;const img=doc.createElement('img');img.src=src;img.alt='';img.dataset.objectBackgroundDevice=device;
      img.style.cssText=`position:absolute;left:50%;top:50%;width:100%;height:100%;max-width:none;object-fit:${b.fit||'cover'};transform:translate(-50%,-50%) translate(${number(b.x)}px,${number(b.y)}px) rotate(${number(b.rotation)}deg) scale(${number(b.zoom,100)/100});opacity:${number(b.opacity,1)};clip-path:inset(${crop(b.crop)});pointer-events:none`;
      layer.append(img);
    }
    node.prepend(layer);
    node.style.setProperty('background-image','none','important');
    sheets.push(scope+'{isolation:isolate;background-image:none!important}'+scope+'>[data-object-background]>[data-object-background-device=phone]{display:none}@container(max-width:767px){'+scope+'>[data-object-background]>[data-object-background-device=desktop]{display:none}'+scope+'>[data-object-background]>[data-object-background-device=phone]{display:block}}');
  }
  function snapshot(node,id){
    const copy=node.cloneNode(true),doc=node.ownerDocument;
    copy.querySelectorAll('script,style,[data-design-handle],[data-editor-overlay],[data-object-background]').forEach(n=>n.remove());
    let i=0;const ids=new Map();
    for(const n of [copy,...copy.querySelectorAll('*')]){
      for(const c of ['designer-selected-element','object-selected','object-hover'])n.classList.remove(c);
      n.removeAttribute('contenteditable');n.removeAttribute('data-source-object');n.removeAttribute('tabindex');if(n.getAttribute('role')==='textbox'&&n.hasAttribute('data-editor-text')){n.removeAttribute('role');n.removeAttribute('aria-label');}
      for(const attr of [...n.attributes])if(/^data-object-(?:hide-|goal-|legacy|locked)/.test(attr.name))n.removeAttribute(attr.name);
      if(eligible(n)){n.dataset.siteObject='add-'+id+'-'+i;if(n.hasAttribute('data-editor-text'))n.dataset.editorText='obj-'+id+'-'+i;if(n.hasAttribute('data-editor-link'))n.dataset.editorLink='obj-'+id+'-'+i;if(n.hasAttribute('data-editor-image'))n.dataset.editorImage='obj-'+id+'-'+i;n.removeAttribute('data-site-element');i++;}
      if(n.id){const next='obj-'+id+'-'+hash(n.id);ids.set(n.id,next);n.id=next;}
    }
    for(const n of [copy,...copy.querySelectorAll('[href],[for],[aria-controls]')])for(const attr of ['href','for','aria-controls']){const v=n.getAttribute(attr);if(v&&ids.has(v.replace(/^#/,'')))n.setAttribute(attr,(attr==='href'?'#':'')+ids.get(v.replace(/^#/,'')));}
    const cleaned=cleanHTML(doc,copy.outerHTML);return cleaned?.outerHTML||'';
  }
  window.HaslObjectRuntime=function(){
    const root=document.currentScript.closest('.hasl-home-embed');if(!root||root.dataset.editorPreview==='true'||root.dataset.sitePreview==='true'||root.dataset.objectGoalsBound)return;root.dataset.objectGoalsBound='true';
    let all={};try{all=JSON.parse(root.dataset.shopAnalytics||'{}');}catch{}
    const site=root.dataset.shopSite==='both'?(['haslestore.com','www.haslestore.com'].includes(location.hostname)?'hasle':'hasl'):root.dataset.shopSite||'hasl',settings=all[site]||{};
    if(settings.loadScripts){
      if(settings.yandexCounter&&typeof window.ym!=='function'){
        window.ym=function(){(window.ym.a=window.ym.a||[]).push(arguments);};window.ym.l=Date.now();
        const script=document.createElement('script');script.async=true;script.src='https://mc.yandex.ru/metrika/tag.js';document.head.append(script);window.ym(Number(settings.yandexCounter),'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true});
      }
      if(settings.googleMeasurementId&&typeof window.gtag!=='function'){
        window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',settings.googleMeasurementId);
        const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(settings.googleMeasurementId);document.head.append(script);
      }
    }
    root.addEventListener('click',event=>{
      const node=event.target.closest('[data-object-goal-yandex],[data-object-goal-action]');if(!node||!root.contains(node)||node.disabled)return;
      const counter=settings.yandexCounter||node.getAttribute('data-object-goal-counter'),goal=node.getAttribute('data-object-goal-yandex'),category=node.getAttribute('data-object-goal-category'),action=node.getAttribute('data-object-goal-action');
      try{if(counter&&goal&&typeof window.ym==='function')window.ym(Number(counter),'reachGoal',goal);}catch{}
      try{if(action&&typeof window.gtag==='function')window.gtag('event',action,{event_category:category||'',...(settings.googleMeasurementId?{send_to:settings.googleMeasurementId}:{})});else if(action&&typeof window.ga==='function')window.ga('send','event',category||'',action);}catch{}
    },true);
  };
  function validate(state){
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v),fail=()=>{throw Error('Повреждены объекты шаблона. Откройте корректную JSON-копию проекта.');};
    if(state.analytics!==undefined){if(!object(state.analytics)||Object.keys(state.analytics).some(k=>!['hasl','hasle'].includes(k)))fail();for(const c of Object.values(state.analytics)){if(!object(c)||Object.keys(c).some(k=>!['yandexCounter','googleMeasurementId','loadScripts'].includes(k))||c.yandexCounter!==undefined&&(typeof c.yandexCounter!=='string'||c.yandexCounter&&!/^[1-9]\d{0,14}$/.test(c.yandexCounter))||c.googleMeasurementId!==undefined&&(typeof c.googleMeasurementId!=='string'||c.googleMeasurementId&&!/^G-[A-Z0-9]{4,20}$/.test(c.googleMeasurementId))||c.loadScripts!==undefined&&typeof c.loadScripts!=='boolean')fail();}}
    for(const section of state.layout||[]){
      if(section.objectGroups!==undefined){const seen=new Set(),members=new Set();if(!Array.isArray(section.objectGroups)||section.objectGroups.length>200)fail();for(const g of section.objectGroups){if(!object(g)||!validKey(g.id)||seen.has(g.id)||typeof g.name!=='string'||!g.name||g.name.length>120||g.locked!==undefined&&typeof g.locked!=='boolean'||!Array.isArray(g.members)||g.members.length<2||g.members.length>200)fail();seen.add(g.id);for(const id of g.members){if(!validKey(id)||id==='root'||members.has(id))fail();members.add(id);}}}
      if(section.objects!==undefined){if(!object(section.objects)||Object.keys(section.objects).length>2000)fail();for(const [id,p] of Object.entries(section.objects)){for(const key of ['textStyles','phoneTextStyles'])if(p[key]!==undefined&&!validTextStyles(p[key]))fail();if(p.buttonIcon!==undefined&&!['none','right','up-right','down-right'].includes(p.buttonIcon))fail();if(!validKey(id)||!object(p)||p.name!==undefined&&(typeof p.name!=='string'||p.name.length>120)||p.locked!==undefined&&typeof p.locked!=='boolean'||p.reveal!==undefined&&typeof p.reveal!=='boolean')fail();for(const field of ['parent','before'])if(p[field]!==undefined&&(!validKey(p[field])||p[field]===id||id==='root'))fail();for(const device of ['desktop','phone'])if(p[device]!==undefined){if(!object(p[device]))fail();if(p[device].layout!==undefined&&!window.SiteLayout?.valid(p[device].layout))fail();}}
        for(const relation of ['parent','before']){const done=new Set();for(const start of Object.keys(section.objects)){const path=new Set();let cursor=start;while(section.objects[cursor]&&!done.has(cursor)){if(path.has(cursor))fail();path.add(cursor);cursor=section.objects[cursor][relation];}for(const id of path)done.add(id);}}
      }
      if(section.addedObjects!==undefined){if(!Array.isArray(section.addedObjects)||section.addedObjects.length>200)fail();for(const p of section.addedObjects)if(!object(p)||!validKey(p.id)||!validKey(p.parent)||typeof p.html!=='string'||p.html.length>200000)fail();}
    }return state;
  }
  function normalize(state,doc){
    if(!doc)return;for(const section of state.layout||[]){const root=[...doc.querySelectorAll('[data-site-block]')].find(n=>n.dataset.siteBlock===section.id);if(!root)continue;const aliases=new Map([...root.querySelectorAll('[data-object-legacy]')].map(n=>[n.dataset.objectLegacy,n.dataset.siteObject]));
      for(const [old,id] of aliases)if(Object.hasOwn(section.objects||{},old)){section.objects[id]??=section.objects[old];delete section.objects[old];}
      for(const patch of Object.values(section.objects||{}))for(const field of ['parent','before'])if(aliases.has(patch[field]))patch[field]=aliases.get(patch[field]);
      for(const record of section.addedObjects||[])if(aliases.has(record.parent))record.parent=aliases.get(record.parent);
      for(const group of section.objectGroups||[])group.members=group.members.map(id=>aliases.get(id)||id);
    }
  }
  window.SiteObjects={values,apply,register,hash,safeURL,canText,canContain,place,containers,cleanHTML,snapshot,css,validate,normalize,setButtonIcon,validTextStyles,readTextStyles,applyTextStyles};
})();
