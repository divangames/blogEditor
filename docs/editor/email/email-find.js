/* Literal email search, outside-DOM highlighting and guarded replacements. */
(() => {
 'use strict';
 const tools=window.EmailTextTools,registry=window.EmailCommands;if(!tools||!registry)return;
 const open=tools.icon('email-find-open','Найти: поиск и замена текста письма (Ctrl+F)','<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>');
 const dialog=tools.dialog('email-find-dialog','Поиск и замена письма','<label>Область<select id="email-find-scope"><option value="body">Тело письма</option><option value="subject">Тема</option><option value="preheader">Прехедер</option></select></label><label>Найти<input id="email-find-query" type="search" maxlength="500" placeholder="Текст или фраза"></label><div class="email-find-options"><label><input id="email-find-case" type="checkbox">Учитывать регистр</label><label><input id="email-find-word" type="checkbox">Целое слово</label></div><div class="email-text-actions"><button id="email-find-prev" type="button">Предыдущее</button><button id="email-find-next" type="button">Следующее</button></div><p id="email-find-status" role="status" aria-live="polite"></p><label>Заменить на<input id="email-find-replacement" type="text" maxlength="5000" placeholder="Пустое поле удалит найденный текст"></label><div class="email-text-actions"><button id="email-find-replace" type="button">Заменить</button><button id="email-find-all" type="button">Заменить все</button></div><p class="help">Поиск не меняет письмо. Переменные, отписка и общие блоки защищены. Адреса ссылок и фото сохраняются. Новая фраза получает оформление первого символа. Закройте поиск и нажмите Ctrl+Z для отмены замены.</p>');
 const scope=dialog.querySelector('#email-find-scope'),query=dialog.querySelector('#email-find-query'),replacement=dialog.querySelector('#email-find-replacement'),status=dialog.querySelector('#email-find-status'),caseBox=dialog.querySelector('#email-find-case'),wordBox=dialog.querySelector('#email-find-word');
 let matches=[],index=-1,signature='',capped=false,timer=null;
 function groups(){
  if(scope.value!=='body'){const field=$('#'+scope.value);return [{field,text:field.value,nodes:[]}];}
  const groups=[];let group=null,previous=null;const walker=document.createTreeWalker(canvas,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   const parent=node.parentElement;
   if(!node.length||parent.closest('script,style,[contenteditable="false"],[hidden],[aria-hidden="true"]')){group=null;previous=null;continue;}
   const block=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote')||parent.closest('div,section,header,article')||canvas;
   let split=!group||group.block!==block;
   if(!split&&previous){const between=document.createRange();between.setStart(previous,previous.length);between.setEnd(node,0);split=!!between.cloneContents().querySelector('br,img,button,[contenteditable="false"]');}
   if(split){group={block,text:'',nodes:[]};groups.push(group);}
   group.nodes.push({node,start:group.text.length});group.text+=node.data;previous=node;
  }
  return groups;
 }
 function summary(){return {count:matches.length,current:index<0?0:index+1,capped,protected:matches.filter(match=>match.readonly).length,scope:scope.value};}
 function render(extra=''){
  const current=matches[index],editable=matches.filter(match=>!match.readonly).length;
  dialog.querySelector('#email-find-prev').disabled=!matches.length;dialog.querySelector('#email-find-next').disabled=!matches.length;
  dialog.querySelector('#email-find-replace').disabled=!current||current.readonly;dialog.querySelector('#email-find-all').disabled=!editable||capped;
  const info=!query.value?'Введите текст для поиска':!matches.length?'Совпадений нет':capped?'Найдено более 1000 совпадений. Сузьте запрос для замены всех.':`${index+1} из ${matches.length}`;
  status.textContent=[extra,info,current?.context?`«${current.context}»`:'',summary().protected?`Защищённых совпадений: ${summary().protected}; замена пропускается.`:''].filter(Boolean).join(' ');
 }
 function clearHighlights(){window.CSS?.highlights?.delete('email-find');window.CSS?.highlights?.delete('email-find-current');}
 function highlight(){
  clearHighlights();if(!dialog.open||!window.CSS?.highlights||typeof Highlight!=='function')return;
  CSS.highlights.set('email-find',new Highlight(...matches.filter(match=>match.range).map(match=>match.range)));
  if(matches[index]?.range)CSS.highlights.set('email-find-current',new Highlight(matches[index].range));
 }
 function scan(){
  clearTimeout(timer);timer=null;matches=[];index=-1;capped=false;signature=tools.signature();
  if(!query.value){render();clearHighlights();return summary();}
  const escaped=query.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),regex=new RegExp(escaped,caseBox.checked?'gu':'giu'),word=/[\p{L}\p{N}\p{M}_]/u;
  outer:for(const group of groups())for(const found of group.text.matchAll(regex)){
   const start=found.index,end=start+found[0].length;
   if(wordBox.checked&&(word.test(group.text.slice(Math.max(0,start-1),start))||word.test(group.text.slice(end,end+1))))continue;
   if(matches.length>=1000){capped=true;break outer;}
   const context=group.text.slice(Math.max(0,start-24),Math.min(group.text.length,start+76));
   if(group.field){matches.push({field:group.field,from:start,to:end,text:found[0],context,readonly:tools.intersects(group.text,start,end)});continue;}
   const parts=group.nodes.filter(item=>item.start<end&&item.start+item.node.length>start).map(item=>({node:item.node,from:Math.max(0,start-item.start),to:Math.min(item.node.length,end-item.start)}));if(!parts.length)continue;
   const range=document.createRange();range.setStart(parts[0].node,parts[0].from);range.setEnd(parts.at(-1).node,parts.at(-1).to);
   const links=new Set(parts.map(part=>part.node.parentElement.closest('a')));
   matches.push({parts,range,text:found[0],context,readonly:tools.intersects(group.text,start,end)||links.size>1||parts.some(part=>part.node.parentElement.closest(tools.protectedSelector))});
  }
  if(matches.length)index=0;highlight();render();return summary();
 }
 function showCurrent(){
  const match=matches[index];if(!match)return;
  if(match.field)match.field.setSelectionRange(match.from,match.to);
  else{getSelection().removeAllRanges();getSelection().addRange(match.range);emailTypographyRange=match.range.cloneRange();match.parts[0].node.parentElement.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}
  highlight();render();
 }
 function navigate(direction){if(signature!==tools.signature()){scan();if(direction<0)index=matches.length-1;}else if(matches.length)index=(index+direction+matches.length)%matches.length;showCurrent();return summary();}
 function apply(all=false){
  if(!tools.editorActive())throw new Error('Откройте вкладку редактора письма');
  if(signature!==tools.signature()||matches.some(match=>match.parts&&(match.parts.some(part=>!canvas.contains(part.node))||match.parts.map(part=>part.node.data.slice(part.from,part.to)).join('')!==match.text))){scan();throw new Error('Письмо изменилось. Совпадения обновлены; повторите замену.');}
  if(capped&&all)throw new Error('Сузьте запрос: найдено более 1000 совпадений');
  const targets=(all?matches:[matches[index]]).filter(match=>match&&!match.readonly),text=replacement.value;
  if(!targets.length)throw new Error('Нет доступных совпадений для замены');
  if(targets.every(match=>match.text===text))return {changed:0};
  if(targets[0].field){
   const field=targets[0].field;let value=field.value;
   for(const match of targets.slice().reverse())value=value.slice(0,match.from)+text+value.slice(match.to);
   if(field.maxLength>=0&&value.length>field.maxLength)throw new Error(`Результат превышает лимит поля: ${field.maxLength} символов`);
  }
  clearHighlights();
  tools.transaction(()=>{
   for(const match of targets.slice().reverse()){
    if(match.field){match.field.value=match.field.value.slice(0,match.from)+text+match.field.value.slice(match.to);continue;}
    for(const part of match.parts.slice(1).reverse())part.node.deleteData(part.from,part.to-part.from);
    const first=match.parts[0];first.node.replaceData(first.from,first.to-first.from,text);
   }
   const first=targets[0];
   if(first.field)first.field.setSelectionRange(first.from,first.from+text.length);
   else{
    const range=document.createRange(),part=first.parts[0];
    if(!part.node.length){range.setStart(part.node.parentNode,[...part.node.parentNode.childNodes].indexOf(part.node));range.collapse(true);}
    else{range.setStart(part.node,part.from);range.setEnd(part.node,part.from+text.length);}
    tools.select(range);
   }
  });
  scan();
  if(!all&&matches.length){const first=targets[0],after=first.field?null:emailTypographyRange.cloneRange();after?.collapse(false);const next=matches.findIndex(match=>first.field?match.from>=first.from+text.length:match.range.compareBoundaryPoints(Range.START_TO_START,after)>=0);index=next<0?0:next;highlight();}
  render(`Заменено: ${targets.length}.`);return {changed:targets.length};
 }
 function openFind(){if(!tools.editorActive())throw new Error('Откройте вкладку редактора письма');document.querySelectorAll('dialog.email-text-dialog[open]').forEach(node=>{if(node!==dialog)node.close();});if(!dialog.open)dialog.show();scan();query.focus();query.select();}
 registry.register({id:'edit.findOpen',label:'Поиск и замена текста письма',shortcut:'Ctrl+F',run:openFind});
 registry.register({id:'edit.find',label:'Найти текст письма',params:{query:'текст',scope:'body/subject/preheader',caseSensitive:'boolean',wholeWord:'boolean'},run:params=>{
  if(typeof params.query!=='string'||params.query.length>500)throw new Error('Введите строку поиска до 500 символов');
  if(params.scope!==undefined&&!['body','subject','preheader'].includes(params.scope))throw new Error('Выберите тело письма, тему или прехедер');
  for(const key of ['caseSensitive','wholeWord'])if(params[key]!==undefined&&typeof params[key]!=='boolean')throw new Error('Параметры поиска должны быть логическими');
  query.value=params.query;scope.value=params.scope||'body';caseBox.checked=!!params.caseSensitive;wordBox.checked=!!params.wholeWord;return scan();
 }});
 registry.register({id:'edit.findNext',label:'Следующее совпадение в письме',run:()=>navigate(1)});
 registry.register({id:'edit.findPrevious',label:'Предыдущее совпадение в письме',run:()=>navigate(-1)});
 registry.register({id:'edit.replaceFound',label:'Заменить найденный текст письма',params:{text:'текст',all:'boolean'},run:({text,all=false})=>{if(typeof text!=='string'||text.length>5000)throw new Error('Введите строку замены до 5000 символов');if(typeof all!=='boolean')throw new Error('Параметр all должен быть логическим');replacement.value=text;return apply(all);}});
 open.onclick=()=>{try{openFind();}catch(error){toast(error.message,true);}};
 dialog.addEventListener('close',()=>{if(dialog.open)return;clearTimeout(timer);clearHighlights();if(!document.querySelector('dialog.email-text-dialog[open]'))open.focus({preventScroll:true});});
 for(const field of [scope,query,caseBox,wordBox])field.oninput=scan;
 dialog.querySelector('#email-find-next').onclick=()=>navigate(1);dialog.querySelector('#email-find-prev').onclick=()=>navigate(-1);
 for(const [id,all] of [['email-find-replace',false],['email-find-all',true]])dialog.querySelector('#'+id).onclick=()=>{try{registry.execute('edit.replaceFound',{text:replacement.value,all});}catch(error){render(error.message);}};
 dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target===query){event.preventDefault();navigate(event.shiftKey?-1:1);}});
 document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.code==='KeyF'&&(canvas.contains(event.target)||dialog.contains(event.target))&&!document.querySelector('dialog[open]:not(#email-find-dialog)')){event.preventDefault();openFind();}});
 document.addEventListener('email-editor-change',()=>{if(dialog.open){clearTimeout(timer);timer=setTimeout(scan,120);}});
})();
