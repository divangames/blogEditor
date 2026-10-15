/* Shared style UI; adapters keep article/email HTML and their own histories. */
(() => {
 'use strict';
 const email=!!window.EmailCommands,registry=email?window.EmailCommands:window.ArticleCommands;
 if(!registry||!document.getElementById('canvas')||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const prefix=email?'email':'article',id=name=>prefix+'-style-'+name;
 const properties={'font-family':'Шрифт','font-size':'Размер','font-weight':'Жирность','font-style':'Курсив','color':'Цвет'};
 const blocks='p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption';
 const protectedSelector=email?EmailTextTools.protectedSelector:'[data-shared-id],[contenteditable="false"],.om-toc';
 const active=()=>email?EmailTextTools.editorActive():document.getElementById('editor-view').classList.contains('active');
 function signature(){if(email)return EmailTextTools.signature();const {selection,...state}=articleEditorSnapshot();return JSON.stringify([articleSaveEpoch,ACTIVE_EDITOR.key,state]);}
 function select(range){canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);if(email)emailTypographyRange=range.cloneRange();else lastRange=range.cloneRange();}
 function capture(){
  if(!active())throw new Error('Откройте вкладку редактора');
  const selection=getSelection(),live=canvas.contains(document.activeElement)&&selection?.rangeCount&&canvas.contains(selection.getRangeAt(0).commonAncestorContainer);
  let range=(live?selection.getRangeAt(0):email?emailTypographyRange:lastRange)?.cloneRange();
  if(range&&range.startContainer===range.endContainer&&range.startContainer.nodeType===1){const node=range.startContainer;if(!range.collapsed&&node.childNodes.length===1&&node.firstChild.nodeType===3){range.selectNodeContents(node.firstChild);}}
  if(!range||!canvas.contains(range.commonAncestorContainer))throw new Error('Поставьте курсор в текст или выделите фрагмент');
  if(range.startContainer!==range.endContainer||range.startContainer.nodeType!==3)throw new Error('Выберите один текстовый фрагмент с одинаковым оформлением');
  const node=range.startContainer,block=node.parentElement.closest(blocks);if(!block||!canvas.contains(block))throw new Error('Выберите текстовый абзац, заголовок или ячейку');
  return {range,node,block,text:node.data,signature:signature()};
 }
 function valid(target){return target&&active()&&target.signature===signature()&&canvas.contains(target.node)&&target.node.data===target.text;}
 function protectedTarget(target,wholeBlock=false){
  if(target.node.parentElement.closest(protectedSelector)||wholeBlock&&target.block.querySelector(protectedSelector))return true;
  if(!email)return false;
  if(wholeBlock)return EmailTextTools.markers(target.block.textContent).length>0;
  const before=document.createRange();before.selectNodeContents(target.block);before.setEnd(target.node,target.range.startOffset);
  const from=before.toString().length,to=from+(target.range.collapsed?1:target.range.toString().length);
  return EmailTextTools.intersects(target.block.textContent,from,to);
 }
 function values(target){const style=getComputedStyle(target.node.parentElement);return Object.fromEntries(Object.keys(properties).map(key=>[key,style.getPropertyValue(key).trim()]));}
 function declaration(target,key,level){
  if(level==='block')return target.block.style.getPropertyValue(key)?target.block:null;
  let node=target.node.parentElement;
  while(node&&node!==target.block){if(node.style.getPropertyValue(key))return node;node=node.parentElement;}
  return null;
 }
 function checkValues(data){
  if(!data||Object.keys(data).some(key=>!(Object.hasOwn(properties,key)))||Object.keys(data).length!==5)throw new Error('Нужны пять свойств оформления текста');
  for(const [key,value] of Object.entries(data))if(typeof value!=='string'||value.length>256||!CSS.supports(key,value))throw new Error('Недопустимое свойство оформления');
  const size=parseFloat(data['font-size']);if(!Number.isFinite(size)||size<8||size>200)throw new Error('Размер шрифта для копирования: от 8 до 200 px');
 }
 function transaction(run){
  if(email)return EmailTextTools.transaction(run);
  flushArticleHistorySnapshot();const state=articleEditorSnapshot(),history=articleHistory.slice(),index=articleHistoryIndex;
  rememberArticleSelectionBeforeInput();let result;
  try{result=run();}catch(error){articleHistoryRestoring=true;try{setBody(state.body,{normalize:false});restoreArticleSelection(state.selection);}finally{articleHistoryRestoring=false;articleHistory=history;articleHistoryIndex=index;updateArticleHistoryControls();}throw error;}
  changed();return result;
 }
 const open=document.createElement('button');open.id=id('inspector-open');open.type='button';open.className=email?'email-command-icon':'article-tool-icon';open.title='Оформление: инспектор и копирование стиля';open.setAttribute('aria-label',open.title);open.setAttribute('aria-haspopup','dialog');
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/></svg>';
 const toolbar=email?document.getElementById('editor-toolbar'):document.querySelector('.toolstrip');toolbar.insertBefore(open,email?null:toolbar.querySelector('.editor-canvas-help'));open.onmousedown=event=>event.preventDefault();
 const dialog=document.createElement('dialog');dialog.id=id('inspector-dialog');dialog.className='style-inspector-dialog';dialog.setAttribute('aria-labelledby',id('title'));
 dialog.innerHTML='<header><h2 id="'+id('title')+'">Оформление текста</h2><button type="button" data-close aria-label="Закрыть оформление">×</button></header><p id="'+id('target')+'" class="help"></p><dl id="'+id('values')+'" class="style-inspector-values"></dl><div class="style-inspector-actions"><button id="'+id('copy')+'" type="button">Копировать оформление</button><button id="'+id('paste')+'" type="button" disabled>Применить скопированное</button></div><div class="style-inspector-reset"><label>Свойство<select id="'+id('property')+'"></select></label><label>Уровень<select id="'+id('level')+'"><option value="inline">Внутри текстового блока</option><option value="block">Сам текстовый блок</option></select></label></div><p id="'+id('scope')+'" class="help"></p><button id="'+id('reset')+'" type="button">Сбросить ручное свойство</button><p id="'+id('status')+'" role="status" aria-live="polite"></p><p class="help">Переносятся шрифт, размер, жирность, курсив и цвет. Сброс действует на всю указанную оболочку или текстовый блок; остальные свойства и вложенные настройки сохраняются. Ctrl+Z отменяет изменение.</p>';
 document.body.append(dialog);
 const property=dialog.querySelector('#'+id('property')),level=dialog.querySelector('#'+id('level')),status=dialog.querySelector('#'+id('status'));
 for(const [key,label] of Object.entries(properties)){const option=document.createElement('option');option.value=key;option.textContent=label;property.append(option);}
 let target=null,copied=null;
 function current(){if(dialog.open){if(!valid(target))throw new Error('Документ или проект изменились. Закройте инспектор и выберите актуальный текст.');return target;}return capture();}
 function render(message=''){
  const list=dialog.querySelector('#'+id('values'));list.replaceChildren();if(!target)return;
  const computed=values(target);
  for(const [key,label] of Object.entries(properties)){
   const row=document.createElement('div');row.className='style-inspector-row';const name=document.createElement('dt');name.textContent=label;
   const effective=document.createElement('dd');effective.textContent='Сейчас: '+computed[key];
   const manual=document.createElement('dd'),inside=declaration(target,key,'inline'),block=declaration(target,key,'block');
   manual.textContent=[inside?'Внутри ('+inside.tagName.toLowerCase()+'): '+inside.style.getPropertyValue(key):'',block?'Блок ('+block.tagName.toLowerCase()+'): '+block.style.getPropertyValue(key):''].filter(Boolean).join('; ')||'По оформлению документа / наследованию';
   row.append(name,effective,manual);list.append(row);
  }
  dialog.querySelector('#'+id('target')).textContent='Текстовый блок: '+target.block.tagName.toLowerCase()+'. Итоговые значения учитывают стили и наследование; ручные настройки показаны отдельно.';
  const resetNode=declaration(target,property.value,level.value),readonly=protectedTarget(target,level.value==='block');
  dialog.querySelector('#'+id('scope')).textContent=resetNode?'Сброс: '+resetNode.tagName.toLowerCase()+', '+properties[property.value]+'. Изменится вся эта оболочка.':'На выбранном уровне нет ручного значения. Стиль документа и теги сохраняются.';
  dialog.querySelector('#'+id('reset')).disabled=!resetNode||readonly;
  dialog.querySelector('#'+id('paste')).disabled=!copied||target.range.collapsed||protectedTarget(target);
  status.textContent=message||(readonly?'Для защищённого текста доступны просмотр и копирование.':copied?'Оформление скопировано в этой вкладке. Выберите другой фрагмент для переноса.':'');
 }
 function inspect(){target=capture();render();if(!dialog.open)dialog.showModal();return {values:values(target),block:target.block.tagName.toLowerCase()};}
 function copy(){const selected=current(),data=values(selected);checkValues(data);copied=Object.freeze({...data});if(dialog.open)render('Оформление скопировано. Закройте окно и выберите другой фрагмент.');return {properties:{...copied}};}
 function paste(){
  const selected=current();if(!copied)throw new Error('Сначала скопируйте оформление');if(selected.range.collapsed)throw new Error('Выделите текст для применения оформления');if(protectedTarget(selected))throw new Error('Связанные блоки, переменные и защищённый текст сохраняют свои настройки');checkValues(copied);
  select(selected.range);
  transaction(()=>{const span=document.createElement('span');for(const [key,value] of Object.entries(copied))span.style.setProperty(key,value,'important');span.append(selected.range.extractContents());selected.range.insertNode(span);const range=document.createRange();range.selectNodeContents(span.firstChild);select(range);});
  target=capture();if(dialog.open)render('Оформление применено. Ctrl+Z отменяет изменение.');return {changed:true};
 }
 function reset({property:key,level:scope}){
  if(!(Object.hasOwn(properties,key))||!['inline','block'].includes(scope))throw new Error('Выберите свойство и уровень сброса');
  const selected=current();if(protectedTarget(selected,scope==='block'))throw new Error('Защищённые блоки и переменные сохраняют свои настройки');
  const node=declaration(selected,key,scope);if(!node)return {changed:false};
  select(selected.range);transaction(()=>{node.style.removeProperty(key);if(!node.getAttribute('style')?.trim())node.removeAttribute('style');select(selected.range);});
  target=capture();if(dialog.open)render('Ручное свойство сброшено на выбранном уровне.');return {changed:true};
 }
 registry.register({id:'style.inspect',label:'Инспектор оформления текста',run:inspect});
 registry.register({id:'style.copyAppearance',label:'Копировать оформление текста',run:copy});
 registry.register({id:'style.pasteAppearance',label:'Применить скопированное оформление',enabled:()=>copied?null:'Сначала скопируйте оформление',run:paste});
 registry.register({id:'style.resetProperty',label:'Сбросить ручное свойство текста',params:{property:'font-family/font-size/font-weight/font-style/color',level:'inline/block'},run:reset});
 function execute(command,params){try{registry.execute(command,params);}catch(error){status.textContent=error.message;}}
 open.onclick=()=>{try{inspect();}catch(error){toast(error.message,true);}};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('#'+id('copy')).onclick=()=>execute('style.copyAppearance');dialog.querySelector('#'+id('paste')).onclick=()=>execute('style.pasteAppearance');dialog.querySelector('#'+id('reset')).onclick=()=>execute('style.resetProperty',{property:property.value,level:level.value});
 property.onchange=level.onchange=()=>render();
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
 dialog.addEventListener('close',()=>{if(dialog.open)return;target=null;open.focus({preventScroll:true});});
})();
