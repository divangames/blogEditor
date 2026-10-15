/* Literal text search. Highlights stay outside the document and its history. */
(() => {
  'use strict';
  if(!window.ArticleCommands || !document.getElementById('canvas') || window.__ARTICLE_WORKFLOW_DISABLED__)return;
  const limit=1000;
  const open=document.createElement('button');open.id='article-find-open';open.type='button';articleToolbarIcon(open,'find','Найти: поиск и замена текста статьи (Ctrl+F)');
  document.querySelector('.toolstrip .editor-canvas-help').before(open);
  const dialog=document.createElement('dialog');dialog.id='article-find-dialog';dialog.className='editor-dialog article-workflow-dialog';dialog.setAttribute('aria-labelledby','article-find-title');
  dialog.innerHTML='<div class="dialog-head"><h2 id="article-find-title">Поиск и замена</h2><button type="button" data-close aria-label="Закрыть поиск">×</button></div><label>Найти<input id="article-find-query" type="search" maxlength="500" placeholder="Текст или фраза"></label><div class="article-find-options"><label><input id="article-find-case" type="checkbox">Учитывать регистр</label><label><input id="article-find-word" type="checkbox">Целое слово</label></div><div class="dialog-actions"><button id="article-find-prev" type="button">Предыдущее</button><button id="article-find-next" type="button">Следующее</button></div><p id="article-find-status" role="status" aria-live="polite"></p><label>Заменить на<input id="article-find-replacement" type="text" maxlength="5000" placeholder="Пустое поле удалит найденный текст"></label><div class="dialog-actions"><button id="article-find-replace" type="button">Заменить</button><button id="article-find-all" type="button">Заменить все</button></div><p class="help">Ищем текст внутри абзацев, заголовков, списков и ячеек. Адреса ссылок и фото не меняются. Общие блоки пропускаются. Новая фраза получает оформление первого символа; окружающее оформление сохраняется. Ctrl+Z отменяет замену целиком.</p>';
  document.body.append(dialog);
  const query=dialog.querySelector('#article-find-query'),replacement=dialog.querySelector('#article-find-replacement'),status=dialog.querySelector('#article-find-status');
  const caseBox=dialog.querySelector('#article-find-case'),wordBox=dialog.querySelector('#article-find-word');
  let matches=[],index=-1,signature='',epoch=null,capped=false,timer=null,returnToCanvas=false;
  const editorActive=()=>document.getElementById('editor-view').classList.contains('active');
  const signatureNow=()=>articleEditorSnapshot().body;
  function groups(){
    const groups=[];let group=null,previous=null;
    const walker=document.createTreeWalker(canvas,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      const parent=node.parentElement;
      if(!node.length || parent.closest('script,style,[contenteditable="false"],[hidden],[aria-hidden="true"]')){group=null;previous=null;continue;}
      const block=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote') || parent.closest('div,section,header,article') || canvas;
      let split=!group || group.block!==block;
      if(!split&&previous){const between=document.createRange();between.setStart(previous,previous.length);between.setEnd(node,0);split=!!between.cloneContents().querySelector('br,img,button,[contenteditable="false"]');}
      if(split){group={block,text:'',nodes:[]};groups.push(group);}
      group.nodes.push({node,start:group.text.length});group.text+=node.data;previous=node;
    }
    return groups;
  }
  function summary(){return {count:matches.length,current:index<0?0:index+1,capped,protected:matches.filter(match=>match.readonly).length};}
  function render(extra=''){
    const current=matches[index],editable=matches.filter(match=>!match.readonly).length;
    dialog.querySelector('#article-find-prev').disabled=!matches.length;dialog.querySelector('#article-find-next').disabled=!matches.length;
    dialog.querySelector('#article-find-replace').disabled=!current || current.readonly;
    dialog.querySelector('#article-find-all').disabled=!editable || capped;
    const info=!query.value?'Введите текст для поиска':!matches.length?'Совпадений нет':capped?'Найдено более 1000 совпадений. Сузьте запрос для замены всех.':`${index+1} из ${matches.length}`;
    const protectedCount=matches.filter(match=>match.readonly).length;
    status.textContent=[extra,info,protectedCount?`В общих блоках: ${protectedCount}; замена пропускается.`:''].filter(Boolean).join(' ');
  }
  function clearHighlights(){window.CSS?.highlights?.delete('article-find');window.CSS?.highlights?.delete('article-find-current');}
  function highlight(){
    clearHighlights();
    if(!dialog.open || !window.CSS?.highlights || typeof Highlight!=='function')return;
    CSS.highlights.set('article-find',new Highlight(...matches.map(match=>match.range)));
    if(matches[index])CSS.highlights.set('article-find-current',new Highlight(matches[index].range));
  }
  function scan(){
    clearTimeout(timer);timer=null;matches=[];index=-1;capped=false;signature=signatureNow();epoch=articleSaveEpoch;
    if(!query.value){render();clearHighlights();return summary();}
    const escaped=query.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const regex=new RegExp(escaped,caseBox.checked?'gu':'giu'),word=/[\p{L}\p{N}\p{M}_]/u;
    outer:for(const group of groups()){
      for(const found of group.text.matchAll(regex)){
        const start=found.index,end=start+found[0].length;
        if(wordBox.checked && (word.test(group.text.slice(Math.max(0,start-1),start)) || word.test(group.text.slice(end,end+1))))continue;
        if(matches.length>=limit){capped=true;break outer;}
        const parts=group.nodes.filter(item=>item.start<end&&item.start+item.node.length>start).map(item=>({node:item.node,from:Math.max(0,start-item.start),to:Math.min(item.node.length,end-item.start)}));
        if(!parts.length)continue;
        const range=document.createRange();range.setStart(parts[0].node,parts[0].from);range.setEnd(parts.at(-1).node,parts.at(-1).to);
        matches.push({parts,range,text:found[0],readonly:parts.some(part=>part.node.parentElement.closest('[data-shared-id]'))});
      }
    }
    if(matches.length)index=0;highlight();render();return summary();
  }
  function showCurrent(){
    const match=matches[index];if(!match)return;
    const selection=getSelection();selection.removeAllRanges();selection.addRange(match.range);lastRange=match.range.cloneRange();
    match.parts[0].node.parentElement.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});highlight();render();
  }
  function navigate(direction){
    if(epoch!==articleSaveEpoch||signature!==signatureNow()){scan();if(direction<0)index=matches.length-1;}
    else if(matches.length)index=(index+direction+matches.length)%matches.length;
    showCurrent();return summary();
  }
  function apply(all=false){
    if(!editorActive())throw new Error('Откройте вкладку редактора');
    if(epoch!==articleSaveEpoch||signature!==signatureNow()){scan();throw new Error('Статья изменилась. Совпадения обновлены; повторите замену.');}
    if(capped&&all)throw new Error('Сузьте запрос: найдено более 1000 совпадений');
    const targets=(all?matches:[matches[index]]).filter(match=>match&&!match.readonly);
    if(!targets.length)throw new Error('Нет доступных совпадений для замены');
    const text=replacement.value;if(text===targets[0].text&&targets.every(match=>match.text===text))return {changed:0};
    if(text.length>5000)throw new Error('Замена должна содержать не более 5000 символов');
    flushArticleHistorySnapshot();
    const before=articleEditorSnapshot(),history=articleHistory.slice(),previousIndex=articleHistoryIndex,previousSelection=articleSelectionBookmark();
    rememberArticleSelectionBeforeInput();clearHighlights();
    try{
      for(const match of targets.slice().reverse()){
        for(const part of match.parts.slice(1).reverse())part.node.deleteData(part.from,part.to-part.from);
        const first=match.parts[0];first.node.replaceData(first.from,first.to-first.from,text);
      }
      const first=targets[0].parts[0],range=document.createRange();
      if(!first.node.length){range.setStart(first.node.parentNode,[...first.node.parentNode.childNodes].indexOf(first.node));range.collapse(true);}
      else{range.setStart(first.node,first.from);range.setEnd(first.node,first.from+text.length);}
      getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();changed();
      scan();
      if(!all&&matches.length){const after=range.cloneRange();after.collapse(false);const next=matches.findIndex(match=>match.range.compareBoundaryPoints(Range.START_TO_START,after)>=0);index=next<0?0:next;highlight();}
      render(`Заменено: ${targets.length}.`);return {changed:targets.length};
    }catch(error){
      articleHistoryRestoring=true;
      try{setBody(before.body,{normalize:false});restoreArticleSelection(previousSelection);}
      finally{articleHistoryRestoring=false;articleHistory=history;articleHistoryIndex=previousIndex;updateArticleHistoryControls();scan();}
      throw error;
    }
  }
  function openFind(){
    if(!editorActive()){toast('Откройте вкладку редактора',true);return;}
    if(!dialog.open){returnToCanvas=canvas.contains(document.activeElement);dialog.show();}scan();query.focus();query.select();
  }
  ArticleCommands.register({id:'edit.findOpen',label:'Поиск и замена текста статьи',shortcut:'Ctrl+F',run:openFind});
  ArticleCommands.register({id:'edit.find',label:'Найти текст статьи',params:{query:'текст',caseSensitive:'boolean',wholeWord:'boolean'},run:params=>{
    if(typeof params.query!=='string'||params.query.length>500)throw new Error('Введите строку поиска до 500 символов');
    for(const key of ['caseSensitive','wholeWord'])if(params[key]!==undefined&&typeof params[key]!=='boolean')throw new Error('Параметры поиска должны быть логическими');
    query.value=params.query;caseBox.checked=!!params.caseSensitive;wordBox.checked=!!params.wholeWord;return scan();
  }});
  ArticleCommands.register({id:'edit.findNext',label:'Следующее совпадение текста',run:()=>navigate(1)});
  ArticleCommands.register({id:'edit.findPrevious',label:'Предыдущее совпадение текста',run:()=>navigate(-1)});
  ArticleCommands.register({id:'edit.replaceFound',label:'Заменить найденный текст',params:{text:'текст',all:'boolean'},run:({text,all=false})=>{
    if(typeof text!=='string'||text.length>5000)throw new Error('Введите строку замены до 5000 символов');if(typeof all!=='boolean')throw new Error('Параметр all должен быть логическим');replacement.value=text;return apply(all);
  }});
  open.onclick=openFind;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{clearTimeout(timer);clearHighlights();if(returnToCanvas&&lastRange&&canvas.contains(lastRange.commonAncestorContainer)){canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(lastRange);}else open.focus({preventScroll:true});});
  for(const field of [query,caseBox,wordBox])field.addEventListener('input',scan);
  dialog.querySelector('#article-find-next').onclick=()=>navigate(1);dialog.querySelector('#article-find-prev').onclick=()=>navigate(-1);
  for(const [id,all] of [['article-find-replace',false],['article-find-all',true]])dialog.querySelector('#'+id).onclick=()=>{try{ArticleCommands.execute('edit.replaceFound',{text:replacement.value,all});}catch(error){render(error.message);}};
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}else if(event.key==='Enter'&&event.target===query){event.preventDefault();navigate(event.shiftKey?-1:1);}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.code==='KeyF'&&(canvas.contains(event.target)||dialog.contains(event.target))&&!document.querySelector('dialog[open]:not(#article-find-dialog)')){event.preventDefault();openFind();}});
  const refresh=()=>{if(dialog.open){clearTimeout(timer);timer=setTimeout(scan,120);}};
  canvas.addEventListener('input',refresh);canvas.addEventListener('editor:body-replaced',refresh);
  ArticleCommands.subscribe(step=>{if(!step.id.startsWith('edit.find')&&step.id!=='edit.replaceFound')refresh();});
})();
