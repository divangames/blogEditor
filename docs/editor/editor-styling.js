// Общие настройки типографики и акцентных блоков для статей и email.
(()=>{
  function copyTextAppearance(span,parent){const computed=getComputedStyle(parent);for(const key of ['font-family','font-size','font-weight','font-style','color'])span.style.setProperty(key,computed.getPropertyValue(key),'important');}
  const textBlockSelector='p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption';
  const visibleTextNodes=block=>{const nodes=[];const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.length&&node.textContent.trim()&&node.parentElement.closest('[contenteditable="false"]')!==node.parentElement)nodes.push(node);return nodes;};
  function normalizeBlockTypography(root){
    for(const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6')){
      const blocks=[...heading.children].filter(node=>node.matches('p,div'));
      for(const block of blocks){
        const before=block.previousSibling,after=block.nextSibling;
        const beforeText=before?.textContent||'',blockText=block.textContent||'',afterText=after?.textContent||'';
        if(beforeText&&blockText&&!/\s$/.test(beforeText)&&!/^\s/.test(blockText))block.before(document.createTextNode(' '));
        if(afterText&&blockText&&!/\s$/.test(blockText)&&!/^\s/.test(afterText))block.append(document.createTextNode(' '));
        block.replaceWith(...block.childNodes);
      }
      const texts=visibleTextNodes(heading),sizes=new Set();
      for(const text of texts){let node=text.parentElement,value='';while(node&&node!==heading){value=node.style.getPropertyValue('font-size').trim()||value;node=node.parentElement;}sizes.add(value);}
      if(texts.length&&sizes.size===1&&!sizes.has('')){
        heading.style.setProperty('font-size',[...sizes][0],'important');
        heading.querySelectorAll('[style]').forEach(node=>{node.style.removeProperty('font-size');if(!node.getAttribute('style')?.trim())node.removeAttribute('style');});
      }
    }
  }
  function applyStyle(root,range,properties){
    if(!range || !root.contains(range.commonAncestorContainer))return null;
    const selected=range.cloneRange(),parts=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    if(selected.collapsed){
      const parent=selected.startContainer.nodeType===Node.ELEMENT_NODE ? selected.startContainer : selected.startContainer.parentElement;
      const block=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption');if(!block || !root.contains(block))return null;
      for(const [key,value] of Object.entries(properties))block.style.setProperty(key,value,'important');
    }else{
      while(node=walker.nextNode()){
        if(!node.length || !selected.intersectsNode(node) || selected.comparePoint(node,node.length)<0 || selected.comparePoint(node,0)>0)continue;
        if(node.parentElement.closest('[contenteditable]')?.getAttribute('contenteditable')==='false')continue;
        const start=node===selected.startContainer ? selected.startOffset : 0,end=node===selected.endContainer ? selected.endOffset : node.length;
        if(end>start)parts.push({node,start,end});
      }
      if(!parts.length)return null;
      const blocks=[...new Set(parts.map(part=>part.node.parentElement.closest(textBlockSelector)).filter(Boolean))];
      const wholeBlocks=blocks.length&&blocks.every(block=>{const texts=visibleTextNodes(block),selectedParts=parts.filter(part=>block.contains(part.node));return texts.length===selectedParts.length&&selectedParts.every(part=>part.start===0&&part.end===part.node.length);});
      if(wholeBlocks){
        for(const block of blocks){for(const [key,value] of Object.entries(properties))block.style.setProperty(key,value,'important');block.querySelectorAll('[style]').forEach(node=>{for(const key of Object.keys(properties))node.style.removeProperty(key);if(!node.getAttribute('style')?.trim())node.removeAttribute('style');});}
      }else{
        const texts=[];
        for(const part of parts){let text=part.node;if(part.end<text.length)text.splitText(part.end);if(part.start)text=text.splitText(part.start);
          const span=document.createElement('span');copyTextAppearance(span,text.parentElement);for(const [key,value] of Object.entries(properties))span.style.setProperty(key,value,'important');text.replaceWith(span);span.append(text);texts.push(text);
        }
        selected.setStart(texts[0],0);selected.setEnd(texts.at(-1),texts.at(-1).length);
      }
    }
    root.focus({preventScroll:true});const selection=getSelection();selection.removeAllRanges();selection.addRange(selected);return selected;
  }
  function mountTypography({toolbar,root,range,onApply,onError}){
    let size=toolbar.querySelector('#font-size');const field=document.createElement('input');field.id='font-size';field.type='number';field.min='8';field.max='200';field.step='0.5';field.placeholder='px';field.setAttribute('aria-label','Размер шрифта');field.setAttribute('list','font-size-options');
    const sizes=document.createElement('datalist');sizes.id='font-size-options';for(const value of [12,14,16,18,20,24,28,32,40,48,64,96]){const option=document.createElement('option');option.value=value;sizes.append(option);}
    field.className='typography-input typography-size';field.setAttribute('aria-label','Размер шрифта в пикселях');
    const group=document.createElement('div');group.className='typography-controls';
    const oldLabel=size?.closest('label');if(oldLabel && toolbar.contains(oldLabel))oldLabel.replaceWith(group);else if(size)size.replaceWith(group);else toolbar.prepend(group);
    const sizeLabel=document.createElement('label');sizeLabel.className='typography-field';sizeLabel.append(field);
    group.append(sizeLabel,sizes);size=field;
    let pinned=null,applying=false;
    const remember=()=>{const saved=range();if(saved && root.contains(saved.commonAncestorContainer))pinned=saved.cloneRange();};
    for(const input of [size]){
      input.addEventListener('pointerdown',remember);input.addEventListener('focus',()=>{if(!pinned)remember();});
      const apply=()=>{if(applying)return;applying=true;try{remember();const saved=pinned || range();let properties;
        const value=Number(input.value);if(!Number.isFinite(value)||value<8||value>200){input.setAttribute('aria-invalid','true');onError('Размер шрифта: от 8 до 200 px');return;}properties={'font-size':value+'px'};
        const selected=applyStyle(root,saved,properties);if(!selected){onError('Выделите текст или поставьте курсор в текстовый блок');return;}input.removeAttribute('aria-invalid');pinned=selected.cloneRange();onApply(selected);
      }finally{applying=false;}};
      input.addEventListener('change',apply);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});
    }
    document.addEventListener('selectionchange',()=>{
      const selection=getSelection();if(!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(document.activeElement))return;
      pinned=selection.getRangeAt(0).cloneRange();const node=selection.anchorNode.nodeType===Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
      const style=getComputedStyle(node);if(document.activeElement!==size)size.value=parseFloat(style.fontSize)||'';
    });
    return {size};
  }
  function hex(value,fallback='#FFFFFF'){
    if(value==='transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(String(value)))return fallback;
    if(/^#[0-9a-f]{6}$/i.test(value))return value.toUpperCase();const match=String(value).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return match ? '#'+match.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('').toUpperCase() : fallback;
  }
  function accentSettings(node){const computed=getComputedStyle(node);return {kind:node.style.getPropertyValue('--accent-kind').trim() || 'default',line:node.style.getPropertyValue('--accent-line').trim() || hex(computed.borderLeftColor,'#E31E24'),fill:node.style.getPropertyValue('--accent-fill').trim() || hex(computed.backgroundColor),opacity:Number(node.style.getPropertyValue('--accent-opacity').trim() || 100)};}
  function applyAccent(node,kind,line,fill,opacity){
    const controlled=['border','border-left','background','background-image','box-shadow','--accent-kind','--accent-line','--accent-fill','--accent-opacity'];
    if(kind==='default'){node.classList.remove('om-callout--custom','email-info-block--custom');controlled.forEach(p=>node.style.removeProperty(p));return;}
    node.classList.add('om-callout--custom');opacity=Math.max(0,Math.min(100,Number(opacity)||0));
    if(node.matches('blockquote,.email-info-block'))node.classList.add('email-info-block','email-info-block--custom');
    const rgb=[1,3,5].map(i=>Math.round(parseInt(fill.slice(i,i+2),16)*opacity/100+255*(1-opacity/100)));
    const border=kind==='frame' ? `2px solid ${line}` : '0';node.style.setProperty('border',border,'important');
    if(kind==='line')node.style.setProperty('border-left',`5px solid ${line}`,'important');
    node.style.setProperty('background',`rgb(${rgb.join(',')})`,'important');node.style.setProperty('box-shadow','none','important');
    for(const [key,value] of Object.entries({'--accent-kind':kind,'--accent-line':line,'--accent-fill':fill,'--accent-opacity':String(opacity)}))node.style.setProperty(key,value);
  }
  function mountAccent({container,getBlock,onApply,prefix='accent'}){
    const panel=document.createElement('div');panel.id=prefix+'-controls';panel.className='accent-controls';panel.hidden=true;
    panel.innerHTML=`<strong>Стиль акцента</strong><label>Оформление<select id="${prefix}-style"><option value="default">Фирменный</option><option value="line">Линия слева</option><option value="frame">Рамка</option><option value="fill">Заливка</option></select></label><label>Цвет линии<input id="${prefix}-line" type="color"></label><label>Цвет заливки<input id="${prefix}-fill" type="color"></label><label>Интенсивность, %<input id="${prefix}-opacity" type="number" min="0" max="100" step="1"></label>`;
    container.append(panel);const fields=Object.fromEntries(['style','line','fill','opacity'].map(name=>[name,panel.querySelector('#'+prefix+'-'+name)]));
    function sync(){const node=getBlock();panel.hidden=!node;if(!node)return;const data=accentSettings(node);fields.style.value=data.kind;fields.line.value=data.line;fields.fill.value=data.fill;fields.opacity.value=data.opacity;}
    for(const [name,field] of Object.entries(fields))field.addEventListener('change',()=>{
      const node=getBlock();if(!node)return;
      if(name!=='style' && fields.style.value==='default')fields.style.value=parseFloat(getComputedStyle(node).borderTopWidth)>0 ? 'frame' : 'line';
      const value=Number(fields.opacity.value);if(!Number.isFinite(value)||value<0||value>100){fields.opacity.setAttribute('aria-invalid','true');return;}
      fields.opacity.removeAttribute('aria-invalid');applyAccent(node,fields.style.value,fields.line.value,fields.fill.value,value);onApply();sync();
    });
    return {panel,sync};
  }


  /** Настраивает несколько кнопок акцента, сохраняя исходный блок до применения. */
  function mountAccentButtons({container,element,brand}){
    const panel=document.createElement('section');panel.className='accent-buttons';
    panel.innerHTML='<strong>Кнопки в акценте</strong><div class="accent-button-list"></div><button type="button" class="accent-button-add">＋ Добавить кнопку</button>';
    container.append(panel);const list=panel.querySelector('.accent-button-list');
    const variants=brand==='hasl'?[['lime','Лаймовая'],['black','Чёрная'],['outline','Белая']]:[['red','Красная'],['black','Чёрная'],['outline','Белая']];
    const groupSelector=':scope > .om-cta,:scope > .om-actions';
    const source=[...element.querySelectorAll(groupSelector)].flatMap(group=>[...group.querySelectorAll(':scope > a[href]')]);
    let rows=[];
    function append(original=null){
      const row=document.createElement('fieldset');row.className='accent-button-item';
      const legend=document.createElement('legend');row.append(legend);const inputs={};
      const read={text:original?.textContent.trim()||'Подробнее',href:original?.getAttribute('href')||'',variant:variants.find(([v])=>original?.classList.contains('om-button--'+v))?.[0]||variants[0][0],newWindow:original?.target==='_blank'};
      for(const [name,label,type] of [['text','Текст кнопки','text'],['href','Ссылка или #якорь','text'],['variant','Стиль','select'],['newWindow','Открывать в новой вкладке','checkbox']]){
        const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(type==='select'?'select':'input');
        if(type==='select')for(const [value,caption] of variants){const option=document.createElement('option');option.value=value;option.textContent=caption;input.append(option);}
        else input.type=type;
        input.name='accent-button-'+name;input.setAttribute('aria-label',label);
        if(type==='checkbox')input.checked=read[name];else input.value=read[name];
        wrap.append(input);row.append(wrap);inputs[name]=input;
      }
      const remove=document.createElement('button');remove.type='button';remove.className='accent-button-remove';remove.textContent='Удалить кнопку';row.append(remove);
      const data={row,inputs,original,read};rows.push(data);list.append(row);
      remove.onclick=()=>{rows=rows.filter(value=>value!==data);row.remove();number();};number();return data;
    }
    function number(){rows.forEach((data,index)=>{data.row.querySelector('legend').textContent='Кнопка '+(index+1);});}
    source.forEach(link=>append(link));
    panel.querySelector('.accent-button-add').onclick=()=>append().inputs.text.focus();
    function applyTo(target){
      const edited=rows.length!==source.length||rows.some((row,index)=>row.original!==source[index]||Object.entries(row.inputs).some(([name,input])=>(name==='newWindow'?input.checked:input.value)!==row.read[name]));
      if(!edited)return false;
      const links=rows.map(({inputs,original,read},index)=>{
        const text=inputs.text.value.trim(),href=inputs.href.value.trim();
        if(!text)throw Error('Кнопка '+(index+1)+': введите текст.');
        const anchor=/^#[^\s#]+$/.test(href);
        if(!anchor){if(!/^https?:\/\//i.test(href))throw Error('Кнопка '+(index+1)+': укажите https://, http:// или #якорь.');try{new URL(href);}catch{throw Error('Кнопка '+(index+1)+': проверьте ссылку.');}}
        const link=original?original.cloneNode(true):document.createElement('a');
        if(!original||text!==read.text)link.textContent=text;
        link.href=href;
        if(!original||inputs.variant.value!==read.variant){
          [...link.classList].filter(value=>/^om-button--/.test(value)).forEach(value=>link.classList.remove(value));
          link.classList.add('om-button','om-button--'+inputs.variant.value);
          for(const property of ['background','background-color','color','border','border-color'])link.style.removeProperty(property);
        }
        if(!anchor&&inputs.newWindow.checked){link.target='_blank';link.rel='noopener noreferrer';}else{link.removeAttribute('target');link.removeAttribute('rel');}
        return link;
      });
      const oldGroups=[...target.querySelectorAll(groupSelector)];
      if(links.length){const group=oldGroups[0]?.cloneNode(false)||document.createElement('div');group.classList.add('om-cta');group.append(...links);if(oldGroups[0])oldGroups[0].replaceWith(group);else target.append(group);}
      else oldGroups[0]?.remove();
      oldGroups.slice(1).forEach(group=>group.remove());return true;
    }
    return {panel,applyTo};
  }

  /** Создаёт редактируемый брендовый блок с безопасным текстом и ссылками. */
  function featureBlock(kind,brand){
    const node=document.createElement('aside');node.className=kind==='promo'?'om-promo':'om-expert';
    if(kind==='promo')node.innerHTML='<p class="om-feature-eyebrow">Дополнительная скидка 15%</p><h3 class="om-feature-title"><span class="om-promo-heading">Промокод</span> <span class="om-promo-code"></span></h3><p class="om-feature-text">Используйте промокод и получите дополнительную скидку 15% на выбранные модели.</p><a class="om-promo-button"><span class="om-promo-button-label">Смотреть кроссовки</span><span aria-hidden="true">→</span></a>';
    else node.innerHTML='<div class="om-expert-header"><span class="om-expert-mark" aria-hidden="true">“</span><p class="om-feature-eyebrow">Мнение эксперта</p></div><div class="om-expert-content"><h3 class="om-feature-title">На что обратить внимание</h3><p class="om-feature-text">Выбирайте обувь под свои задачи. Учитывайте посадку, материалы и условия, в которых будете носить пару.</p><div class="om-expert-signature"><span class="om-expert-author">Эксперт '+(brand==='hasl'?'ХАСЛ':'OUTMAX')+'</span><span class="om-expert-role">Подбор обуви</span></div></div>';
    if(kind==='promo'){
      node.querySelector('.om-promo-code').textContent=brand==='hasl'?'ОКТЯБРЬ26':'ОСЕНЬ26';
      node.querySelector('a').href=brand==='hasl'?'https://haslestore.com/':'https://outmaxshop.ru/';
    }
    return node;
  }
  /** Окно настройки блока: локальный предпросмотр, атомарное сохранение и отмена. */
  function mountFeatureDialog({brand,onSave,getCss}){
    const getBrand=typeof brand==='function'?brand:()=>brand;
    const dialog=document.createElement('dialog');dialog.id='feature-dialog';dialog.className='editor-dialog feature-dialog';dialog.setAttribute('aria-labelledby','feature-dialog-title');
    dialog.innerHTML='<form><div class="dialog-head"><h2 id="feature-dialog-title"></h2><button type="button" class="feature-close" aria-label="Закрыть">×</button></div><p class="feature-hint">Настройте блок. Текст можно также редактировать прямо в статье.</p><div class="feature-fields"></div><details class="feature-colors"><summary>Цвета блока</summary><div></div></details><p class="feature-error" role="alert" hidden></p><strong class="feature-preview-label">Предпросмотр</strong><iframe class="feature-preview" title="Предпросмотр блока"></iframe><div class="dialog-actions"><button type="button" class="feature-cancel">Отмена</button><button class="primary" type="submit">Сохранить</button></div></form>';
    document.body.append(dialog);let original=null,draft=null,kind='',fields=[],baseline=new Map(),timer;
    const form=dialog.querySelector('form'),container=dialog.querySelector('.feature-fields'),colors=dialog.querySelector('.feature-colors'),error=dialog.querySelector('.feature-error'),preview=dialog.querySelector('iframe');
    function field(label,key,selector,value,type='text',color=false){
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;else input.rows=3;
      input.id='feature-'+key;input.name=key;input.value=value;wrap.append(input);(color?colors.querySelector('div'):container).append(wrap);fields.push({key,selector,input,color});baseline.set(key,input.value);
    }
    function patch(node){
      for(const f of fields){
        if(f.input.value===baseline.get(f.key))continue;
        if(f.color){
          const value=f.input.value;
          if(f.key==='background')node.style.setProperty('background',value,'important');
          if(f.key==='text-color'){
            node.style.setProperty('color',value,'important');
            node.querySelectorAll('.om-feature-title,.om-feature-text,.om-expert-author,.om-expert-role').forEach(el=>el.style.setProperty('color',value,'important'));
          }
          if(f.key==='accent'){
            node.style.setProperty(getBrand()==='hasl'?'border-color':'border-top-color',value,'important');
            node.querySelectorAll(getBrand()==='hasl'?'.om-feature-eyebrow,.om-expert-mark':'.om-feature-eyebrow').forEach(el=>{el.style.setProperty('color',value,'important');el.style.setProperty('border-color',value,'important');});
            node.querySelector('.om-expert-signature').style.setProperty('border-color',value,'important');
            if(getBrand()==='hasl'){
              // Цветная шапка сохраняет читаемость при любом выбранном акценте.
              const rgb=[1,3,5].map(index=>parseInt(value.slice(index,index+2),16));
              const ink=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>150?'#111111':'#FFFFFF';
              node.querySelector('.om-expert-header').style.setProperty('background',value,'important');
              node.querySelectorAll('.om-feature-eyebrow,.om-expert-mark').forEach(el=>el.style.setProperty('color',ink,'important'));
            }

          }
        }else{
          const el=node.querySelector(f.selector);if(!el)continue;
          if(f.key==='url')el.setAttribute('href',f.input.value.trim());else el.textContent=f.input.value;
        }
      }
      return node;
    }
    function render(){
      const node=patch(draft.cloneNode(true)),css=getCss().replace(/<\/style/gi,'<\\/style');
      preview.srcdoc='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>body{margin:0}.om-guide{width:100%;padding:0;background:transparent}.om-guide>aside{margin:0}a{pointer-events:none}</style><article class="om-guide">'+node.outerHTML+'</article>';
    }
    preview.addEventListener('load',()=>{preview.style.height=Math.min(460,Math.max(160,preview.contentDocument?.body.scrollHeight||220))+'px';});
    function open(type,node=null){
      kind=type;original=node;draft=node?node.cloneNode(true):featureBlock(type,getBrand());fields=[];baseline=new Map();container.replaceChildren();colors.querySelector('div').replaceChildren();colors.hidden=type!=='expert';error.hidden=true;
      dialog.querySelector('h2').textContent=(node?'Настроить':'Добавить')+' '+(type==='promo'?'блок промокода':'блок эксперт');
      const val=selector=>draft.querySelector(selector)?.textContent||'';
      field('Метка над заголовком','eyebrow','.om-feature-eyebrow',val('.om-feature-eyebrow'));
      field('Заголовок','title',type==='promo'?'.om-promo-heading':'.om-feature-title',val(type==='promo'?'.om-promo-heading':'.om-feature-title'));
      if(type==='promo')field('Промокод','code','.om-promo-code',val('.om-promo-code'));
      field(type==='promo'?'Описание':'Мнение эксперта','text','.om-feature-text',val('.om-feature-text'),'textarea');
      if(type==='promo'){
        field('Текст кнопки','button','.om-promo-button-label',val('.om-promo-button-label'));
        field('Ссылка кнопки','url','.om-promo-button',draft.querySelector('a')?.getAttribute('href')||'','url');
      }else{
        field('Имя эксперта','author','.om-expert-author',val('.om-expert-author'));
        field('Подпись / специализация','role','.om-expert-role',val('.om-expert-role'));
        field('Акцент','accent','',hex(draft.style.borderTopColor||draft.style.borderColor,getBrand()==='hasl'?'#C7F500':'#E31E24'),'color',true);
        field('Фон','background','',hex(draft.style.backgroundColor,getBrand()==='hasl'?'#FFFFFF':'#FFF8F7'),'color',true);
        field('Текст','text-color','',hex(draft.style.color,getBrand()==='hasl'?'#111111':'#231815'),'color',true);
      }
      dialog.showModal();render();fields[0].input.focus();
    }
    form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);error.hidden=true;});
    form.addEventListener('submit',event=>{
      event.preventDefault();const value=key=>fields.find(f=>f.key===key)?.input.value.trim();
      if(!value('title')||!value('text')||(kind==='promo'&&(!value('code')||!value('button')))){
        error.textContent='Заполните заголовок, текст'+(kind==='promo'?', промокод и название кнопки.':'.');error.hidden=false;return;
      }
      if(kind==='promo'&&!/^https?:\/\//i.test(value('url'))){error.textContent='Укажите ссылку, начинающуюся с https:// или http://.';error.hidden=false;fields.find(f=>f.key==='url').input.focus();return;}
      if(kind==='promo'){try{new URL(value('url'));}catch{error.textContent='Проверьте адрес ссылки.';error.hidden=false;return;}}
      try{if(onSave(patch(draft.cloneNode(true)),original)!==false)dialog.close();}
      catch(exception){error.textContent=exception.message;error.hidden=false;}
    });
    for(const selector of ['.feature-close','.feature-cancel'])dialog.querySelector(selector).onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>clearTimeout(timer));
    return {open};
  }

  function modelScore(text){
    const match=String(text).trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*5)?$/);
    return match ? Math.max(0,Math.min(5,Number(match[1].replace(',','.')))) : null;
  }
  function syncModelRatings(root){
    root.querySelectorAll('.om-model-rating-item').forEach(item=>{
      const value=item.querySelector(':scope > b,:scope > strong');if(!value)return;
      const score=modelScore(value.textContent);if(score===null)return;
      value.contentEditable='false';
      let stars=item.querySelector(':scope > .om-rating-stars');
      if(stars?.getAttribute('aria-label')===`${score} из 5`)return;
      if(!stars){stars=document.createElement('span');stars.className='om-rating-stars';value.after(stars);}
      stars.contentEditable='false';stars.setAttribute('role','img');stars.setAttribute('aria-label',`${score} из 5`);
      stars.style.cssText='display:inline-flex;gap:0;white-space:nowrap;font-size:14px;line-height:1;color:#b8b8b8';
      stars.replaceChildren();
      for(let i=0;i<5;i++){
        const star=document.createElement('span');star.setAttribute('aria-hidden','true');star.style.cssText='display:inline-block;position:relative;line-height:1;font-size:14px';star.textContent='★';
        const fill=Math.max(0,Math.min(1,score-i));
        if(fill){const ink=document.createElement('span');ink.textContent='★';ink.style.cssText=`position:absolute;left:0;top:0;overflow:hidden;width:${fill*100}%;color:#f2b600;line-height:1;font-size:inherit`;star.append(ink);}
        stars.append(star);
      }
    });
  }
  window.EditorStyling={mountTypography,mountAccent,mountAccentButtons,mountFeatureDialog,featureBlock,normalizeBlockTypography,applyStyle,applyAccent,accentSettings,copyTextAppearance,modelScore,syncModelRatings};
})();
