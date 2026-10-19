/* Explicit clipboard modes over the existing article/email document and history. */
(() => {
 'use strict';
 const email=!!window.EmailCommands,registry=email?EmailCommands:window.ArticleCommands;
 if(!registry||!document.getElementById('canvas')||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const prefix=email?'email':'article',id=name=>prefix+'-paste-'+name,blockSelector='p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption';
 const protectedSelector=email?EmailTextTools.protectedSelector:'[data-shared-id],[contenteditable="false"],.om-toc';
 let target=null,payload={text:'',html:'',images:[]},ticket=0,committing=false,plainUntil=0;
 function signature(){if(email)return EmailTextTools.signature();const {selection,...state}=articleEditorSnapshot();return JSON.stringify([articleSaveEpoch,ACTIVE_EDITOR.key,state]);}
 const active=()=>email?EmailTextTools.editorActive():document.getElementById('editor-view').classList.contains('active');
 function capture(){
  if(!active())throw new Error('Откройте вкладку редактора');
  const selection=getSelection(),live=selection?.rangeCount&&canvas.contains(selection.getRangeAt(0).commonAncestorContainer);
  const range=(live?selection.getRangeAt(0):email?emailTypographyRange:lastRange)?.cloneRange();
  if(!range||!canvas.contains(range.startContainer)||!canvas.contains(range.endContainer))throw new Error('Поставьте курсор в материал или выделите текст');
  const parent=node=>node.nodeType===1?node:node.parentElement,start=parent(range.startContainer),end=parent(range.endContainer);
  const block=start.closest(blockSelector),endBlock=end.closest(blockSelector);
  if(!range.collapsed&&(!block||block!==endBlock))throw new Error('Выберите фрагмент внутри одного текстового блока. Для целого документа используйте импорт или обычную вставку.');
  if(start.closest(protectedSelector)||end.closest(protectedSelector)||range.cloneContents().querySelector(protectedSelector))throw new Error('Общие и защищённые блоки сохраняют своё содержимое');
  if(email&&block){
   const before=document.createRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);
   const from=before.toString().length,to=from+range.toString().length;
   if(EmailTextTools.markers(block.textContent).some(m=>range.collapsed?m.from<from&&from<m.to:m.from<to&&m.to>from))throw new Error('Поставьте курсор за пределами служебной переменной');
  }
  return {range,signature:signature(),start:range.startContainer,end:range.endContainer,boundary:range.startContainer===canvas?(canvas.childNodes[range.startOffset]||canvas.lastChild):null,anchor:start.closest('a')};
 }
 function valid(saved){return saved&&active()&&saved.signature===signature()&&canvas.contains(saved.start)&&canvas.contains(saved.end)&&(!saved.boundary||canvas.contains(saved.boundary));}
 function select(range){canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);if(email)emailTypographyRange=range.cloneRange();else lastRange=range.cloneRange();}
 const drop='script,style,link,meta,base,object,embed,iframe,svg,canvas,video,audio,noscript,form,input,button,textarea,select,nav,aside,header,footer,[role="banner"],[role="navigation"],[data-email-system],.outmax-email-header,.hasl-email-header,.outmax-email-footer,.hasl-email-footer,.sr-only,.visually-hidden';
 function cleanSource(raw){
  const template=document.createElement('template');template.innerHTML=raw;
  // Read hidden declarations in the inert clipboard tree without applying CSS.
  for(const sheet of template.content.querySelectorAll('style')){
   let count=0;for(const rule of sheet.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(++count>100)break;if(!/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(rule[2]))continue;
    for(const selector of rule[1].split(',')){if(selector.trim().length>500)continue;try{template.content.querySelectorAll(selector.trim()).forEach(node=>node.remove());}catch{}}
   }
  }
  template.content.querySelectorAll(drop).forEach(node=>node.remove());
  for(const node of template.content.querySelectorAll('*'))if(node.hidden||node.getAttribute('aria-hidden')==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)/i.test(node.getAttribute('style')||''))node.remove();
  return template;
 }
 function sourceText(root){
  let text='';function visit(node){if(node.nodeType===3){text+=node.data;return;}if(node.nodeType!==1&&node.nodeType!==11)return;const tag=node.tagName?.toLowerCase();if(tag==='br')text+='\n';else{for(const child of node.childNodes)visit(child);if(['p','div','li','tr','h1','h2','h3','h4','h5','h6','blockquote'].includes(tag))text+='\n';if(['td','th'].includes(tag))text+='\t';}}
  visit(root);return text.replace(/\n{3,}/g,'\n\n').trim();
 }
 function safeUrl(value,image=false){
  let url=String(value||'').trim();if(!url||/[\u0000-\u001f]/.test(url))return '';
  if(image&&/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url))return url;
  if(url.startsWith('//'))url='https:'+url;
  if(/^https?:\/\//i.test(url))return url;
  if(!image&&(/^(?:mailto:|tel:|#)/i.test(url)||/^\[%[^%\]]+%\]$/.test(url)))return url;
  if(/^(?:\/|\.\/|\.\.\/)?[^:]*$/u.test(url)&&!url.startsWith('//'))return url;
  return '';
 }
 function mailHtml(template,images){
  const allowed=new Set('div p h1 h2 h3 h4 h5 h6 span b strong em i u s strike sub sup small code br hr ul ol li blockquote table caption colgroup col thead tbody tfoot tr th td a img figure figcaption'.split(' '));
  const styles=new Set('font-family font-size font-weight font-style color line-height text-decoration text-align'.split(' '));
  let imageIndex=0,hadImages=!!template.content.querySelector('img');const out=document.createElement('template');
  function clean(node){
   if(node.nodeType===3)return document.createTextNode(node.data);if(node.nodeType!==1)return null;
   const original=node.tagName.toLowerCase(),heading=(node.className||'').match(/(?:msoheading|heading|заголовок)[-_ ]*([1-6])/i);
   const tag=original==='p'&&heading?'h'+heading[1]:original==='p'&&/msotitle/i.test(node.className||'')?'h1':original;
   const result=allowed.has(tag)?document.createElement(tag):document.createDocumentFragment();
   if(tag==='img'){
    const url=safeUrl(node.getAttribute('src')||node.getAttribute('data-src'),true)||images[imageIndex++];if(!url)return null;
    result.setAttribute('src',url);result.setAttribute('alt',node.getAttribute('alt')||'Изображение из буфера');result.style.maxWidth='100%';result.style.height='auto';return result;
   }
   if(tag==='a'){const href=safeUrl(node.getAttribute('href'));if(href)result.setAttribute('href',href);}
   if(tag==='td'||tag==='th'){for(const key of ['colspan','rowspan']){const value=Number(node.getAttribute(key));if(Number.isInteger(value)&&value>1&&value<=64)result.setAttribute(key,String(value));}result.style.padding='6px';result.style.border='1px solid #dddddd';}
   if(tag==='table'){result.style.width='100%';result.style.borderCollapse='collapse';result.setAttribute('cellpadding','0');result.setAttribute('cellspacing','0');}
   if(result.nodeType===1)for(const key of styles){const value=node.style.getPropertyValue(key);if(value&&value.length<=256&&!/url\s*\(|expression\s*\(|javascript:|var\s*\(|@import/i.test(value)&&CSS.supports(key,value)){if(key==='font-size'&&(parseFloat(value)<8||parseFloat(value)>200))continue;result.style.setProperty(key,value);}}
   for(const child of node.childNodes){const safe=clean(child);if(safe)result.append(safe);}return result;
  }
  for(const child of template.content.childNodes){const node=clean(child);if(node)out.content.append(node);}
  if(!hadImages)for(const url of images){const image=document.createElement('img');image.src=url;image.alt='Изображение из буфера';image.style.maxWidth='100%';out.content.append(image);}
  const allMarkers=EmailTextTools.markers(out.content.textContent).length;let nodeMarkers=0;
  const walker=document.createTreeWalker(out.content,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())nodeMarkers+=EmailTextTools.markers(node.data).length;
  if(allMarkers>nodeMarkers)throw new Error('Переменная разделена оформлением. Выберите «Только текст».');
  return out.innerHTML;
 }
 function prepare(data,mode){
  if(!['plain','formatted'].includes(mode))throw new Error('Выберите режим вставки');
  if(typeof data.text!=='string'||typeof data.html!=='string'||data.text.length>100000||data.html.length>500000)throw new Error('Лимит: 100 000 символов текста или 500 000 символов HTML');
  const source=cleanSource(data.html),text=data.text||sourceText(source.content);
  if(mode==='plain'){if(!text)throw new Error('В буфере нет текста. Для изображения выберите оформление.');return {text};}
  if(email&&!data.html&&text)text.replace(/\r\n?/g,'\n').split('\n').forEach((line,index)=>{if(index)source.content.append(document.createElement('br'));source.content.append(document.createTextNode(line));});
  if(email)return {html:mailHtml(source,data.images||[])};
  const trusted=clipboardHtmlMatchesText(data.html,data.text)||clipboardHtmlMatchesText(source.innerHTML,data.text);
  const wordHeading=[...source.content.querySelectorAll('p[class]')].some(node=>/msoheading[-_ ]*[1-6]|msotitle/i.test(node.className));
  if(!data.images?.length&&!/[\r\n]/.test(text)&&(!trusted||!wordHeading&&clipboardHtmlIsInline(source.innerHTML,text)))return {html:trusted?pasteInlineFromHtml(source.innerHTML):escapeHtml(text)};
  let blocks=trusted?pasteBlocksFromHtml(source.innerHTML,data.images||[]):pasteBlocksFromText(text);
  if(!blocks.length&&text)blocks=pasteBlocksFromText(text);
  if(!trusted&&data.images?.length)blocks.push(...pasteBlocksFromHtml('',data.images));
  return {html:blocks.map(node=>node.outerHTML).join('')};
 }
 function transaction(run){
  if(email)return EmailTextTools.transaction(run);
  flushArticleHistorySnapshot();const state=articleEditorSnapshot(),history=articleHistory.slice(),index=articleHistoryIndex;rememberArticleSelectionBeforeInput();
  try{run();}catch(error){articleHistoryRestoring=true;try{setBody(state.body,{normalize:false});restoreArticleSelection(state.selection);}finally{articleHistoryRestoring=false;articleHistory=history;articleHistoryIndex=index;updateArticleHistoryControls();}throw error;}
  changed();
 }
 canvas.addEventListener('input',event=>{if(committing)event.stopImmediatePropagation();},true);
 function insertRich(saved,html){
  const template=document.createElement('template');template.innerHTML=html;const fragment=template.content,last=fragment.lastChild;
  const start=saved.range.startContainer.nodeType===1?saved.range.startContainer:saved.range.startContainer.parentElement;
  const block=start.closest('p,h1,h2,h3,h4,h5,h6');
  const hasBlocks=!!fragment.querySelector('table,p,h1,h2,h3,h4,h5,h6,ul,ol,div,figure,blockquote');
  if(hasBlocks&&block&&canvas.contains(block)&&block.contains(saved.range.endContainer)){
   const tail=document.createRange();tail.selectNodeContents(block);tail.setStart(saved.range.endContainer,saved.range.endOffset);
   const suffix=tail.extractContents();saved.range.deleteContents();
   const trailing=block.cloneNode(false);trailing.removeAttribute('id');trailing.append(suffix);
   block.after(fragment);if(trailing.textContent||trailing.querySelector('img,br,table'))last.after(trailing);
  }else{saved.range.deleteContents();saved.range.insertNode(fragment);}
  const caret=document.createRange();caret.setStartAfter(last);caret.collapse(true);select(caret);
 }
 function apply(data,mode,saved){
  if(!valid(saved))throw new Error('Документ или проект изменились. Выберите актуальное место вставки.');
  const content=prepare(data,mode);if(content.html!==undefined&&!content.html.trim())throw new Error('Нет допустимого содержимого для вставки');
  if(saved.anchor&&content.html&&/<(?:a|table|p|h[1-6]|ul|ol)\b/i.test(content.html))throw new Error('Для этого фрагмента поставьте курсор вне существующей ссылки');
  select(saved.range);
  const knownIds=new Map([...canvas.querySelectorAll('[id]')].map(node=>[node.id,node]));
  const knownImages=new Set(canvas.querySelectorAll('img'));
  const addedAssets=[];
  try{transaction(()=>{
   committing=true;
   try{
    if(mode==='plain'){
     const fragment=document.createDocumentFragment(),lines=content.text.replace(/\r\n?/g,'\n').split('\n');
     lines.forEach((line,index)=>{if(index)fragment.append(document.createElement('br'));if(line)fragment.append(document.createTextNode(line));});const last=fragment.lastChild;
     saved.range.deleteContents();saved.range.insertNode(fragment);const caret=document.createRange();caret.setStartAfter(last);caret.collapse(true);select(caret);
    }else insertRich(saved,content.html);
    // Browser paragraph splitting must not create duplicate existing anchors.
    for(const [key,original] of knownIds){const same=[...canvas.querySelectorAll('[id]')].filter(node=>node.id===key),keep=canvas.contains(original)?original:same[0];for(const node of same)if(node!==keep)node.removeAttribute('id');}
    if(email)for(const image of canvas.querySelectorAll('img[src^="data:image/"]')){
     if(knownImages.has(image))continue;
     const match=image.getAttribute('src').match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.*)$/is);if(!match)continue;
     const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),type=match[1].toLowerCase(),extension=type.includes('jpeg')||type.includes('jpg')?'jpg':type.split('/')[1];
     const path='images/paste-'+crypto.randomUUID()+'.'+extension;registerAsset(path,new Blob([bytes],{type}));addedAssets.push(path);image.dataset.emailSrc=path;image.src=assetUrls.get(path);
    }
    if(!email){const bookmark=articleSelectionBookmark();setBody(canvas.innerHTML,{normalize:false,preserveDescription:true});restoreArticleSelection(bookmark);if(getSelection().rangeCount)lastRange=getSelection().getRangeAt(0).cloneRange();}
   }finally{committing=false;}
  });}catch(error){for(const path of addedAssets){const url=assetUrls.get(path);if(url)URL.revokeObjectURL(url);assetUrls.delete(path);assets.delete(path);}throw error;}
  return {changed:true};
 }
 const open=document.createElement('button');open.id=id('open');open.type='button';open.className=email?'email-command-icon':'article-tool-icon';open.title='Вставка: текст или допустимое оформление';open.setAttribute('aria-label',open.title);open.setAttribute('aria-haspopup','dialog');open.onmousedown=event=>event.preventDefault();
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="7" y="3" width="10" height="4" rx="1"/><path d="M7 5H5v16h14V5h-2M8 12h8M8 16h5"/></svg>';
 const toolbar=email?$('#editor-toolbar'):$('.toolstrip');toolbar.insertBefore(open,email?null:toolbar.querySelector('.editor-canvas-help'));
 const dialog=document.createElement('dialog');dialog.id=id('dialog');dialog.className='paste-special-dialog';dialog.setAttribute('aria-labelledby',id('title'));
 dialog.innerHTML='<header><h2 id="'+id('title')+'">Вставка из буфера</h2><button type="button" data-close aria-label="Закрыть вставку">×</button></header><label>Режим<select id="'+id('mode')+'"><option value="plain">Только текст</option><option value="formatted">С допустимым оформлением</option></select></label><label>Вставьте сюда фрагмент из буфера<textarea id="'+id('content')+'" maxlength="100000" placeholder="Нажмите Ctrl+V / Cmd+V или введите текст"></textarea></label><p class="help">Материал изменится после кнопки «Вставить». Только текст сохраняет буквальные строки. Оформление переносит поддерживаемые заголовки, списки, таблицы, ссылки и изображения. Для полного документа используйте импорт.</p><p id="'+id('status')+'" role="status" aria-live="polite"></p><div class="paste-special-actions"><button id="'+id('insert')+'" type="button">Вставить</button><button type="button" data-cancel>Отмена</button></div>';
 document.body.append(dialog);const mode=dialog.querySelector('select'),field=dialog.querySelector('textarea'),status=dialog.querySelector('[role=status]'),insert=dialog.querySelector('#'+id('insert'));
 function show(){target=capture();ticket++;payload={text:'',html:'',images:[]};field.value='';status.textContent='Вставьте фрагмент в поле. Обычный Ctrl+V в материале сохраняет прежнее поведение.';if(!dialog.open)dialog.showModal();field.focus();}
 async function receive(event){
  if(!event.clipboardData)return;event.preventDefault();const data=event.clipboardData,text=data.getData('text/plain'),html=data.getData('text/html'),files=[...data.files].filter(file=>/^image\/(?:png|jpeg|webp|gif)$/.test(file.type));
  payload={text:'',html:'',images:[]};field.value='';ticket++;insert.disabled=true;
  if(text.length>100000||html.length>500000){status.textContent='Лимит: 100 000 символов текста или 500 000 символов HTML';return;}
  if(files.length>10||files.some(file=>file.size>12*1024*1024)){status.textContent='До 10 изображений по 12 МБ';return;}
  const current=++ticket;insert.disabled=true;
  try{
   const images=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать изображение'));reader.readAsDataURL(file);})));
   if(current!==ticket||!dialog.open)return;
   payload={text,html,images};field.value=text||sourceText(cleanSource(html).content);status.textContent=html||images.length?'Фрагмент получен. Выберите режим и проверьте текст; оформление очищается при вставке.':'Получен текст.';
  }catch(error){if(current===ticket)status.textContent=error.message;}
  finally{if(current===ticket)insert.disabled=false;}
 }
 field.addEventListener('paste',receive);field.oninput=()=>{payload={text:field.value,html:'',images:[]};ticket++;status.textContent='Введённый текст будет вставлен буквально.';insert.disabled=false;};
 registry.register({id:'edit.pasteSpecialOpen',label:'Вставка из буфера: выбрать режим',run:show});
 registry.register({id:'edit.applyPaste',label:'Принять фрагмент буфера',params:{mode:'plain/formatted'},run:({mode})=>apply(payload,mode,target)});
 registry.register({id:'edit.pastePlain',label:'Вставить только текст',params:{text:'текст'},run:({text})=>apply({text,html:'',images:[]},'plain',capture())});
 registry.register({id:'edit.pasteFormatted',label:'Вставить допустимое оформление',params:{text:'текст',html:'HTML'},run:({text='',html=''})=>apply({text,html,images:[]},'formatted',capture())});
 open.onclick=()=>{try{show();}catch(error){toast(error.message,true);}};
 insert.onclick=()=>{try{registry.execute('edit.applyPaste',{mode:mode.value});dialog.close();}catch(error){status.textContent=error.message;}};
 for(const button of dialog.querySelectorAll('[data-close],[data-cancel]'))button.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;ticket++;target=null;payload={text:'',html:'',images:[]};field.value='';open.focus({preventScroll:true});});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
 document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.code==='KeyV'&&canvas.contains(event.target))plainUntil=Date.now()+1500;else if(!event.ctrlKey&&!event.metaKey)plainUntil=0;});
 canvas.addEventListener('paste',event=>{if(Date.now()>plainUntil)return;plainUntil=0;if(!event.clipboardData)return;event.preventDefault();event.stopImmediatePropagation();try{registry.execute('edit.pastePlain',{text:event.clipboardData.getData('text/plain')});}catch(error){toast(error.message,true);}},true);
})();
