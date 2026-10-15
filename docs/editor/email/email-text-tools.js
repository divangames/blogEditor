/* Adapters to the current email HTML, selection and single history. */
(() => {
 'use strict';
 if(!window.EmailCommands)return;
 const protectedSelector='[data-shared-id],[contenteditable="false"],.om-toc,[data-email-system],a[href*="unsubscribe_link"]';
 function signature(){const {selection,...state}=emailEditorSnapshot();return JSON.stringify([emailDocumentEpoch,state]);}
 const editorActive=()=>!$('.main').dataset.view||$('.main').dataset.view==='editor';
 function markers(text){return [...text.matchAll(/\[%[^%\]]+%\]/g)].map(match=>({from:match.index,to:match.index+match[0].length}));}
 const intersects=(text,from,to)=>markers(text).some(marker=>marker.from<to&&marker.to>from);
 function icon(id,title,path){
  const button=document.createElement('button');button.id=id;button.type='button';button.className='email-command-icon';button.title=title;button.setAttribute('aria-label',title);button.setAttribute('aria-haspopup','dialog');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+path+'</svg>';
  button.onmousedown=event=>event.preventDefault();$('#editor-toolbar').append(button);return button;
 }
 function dialog(id,title,body){
  const node=document.createElement('dialog');node.id=id;node.className='email-command-dialog email-text-dialog';node.setAttribute('aria-labelledby',id+'-title');
  node.innerHTML='<header><h2 id="'+id+'-title">'+title+'</h2><button type="button" data-close aria-label="Закрыть">×</button></header>'+body;
  node.querySelector('[data-close]').onclick=()=>node.close();
  node.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();node.close();}});
  document.body.append(node);return node;
 }
 function select(range){canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);emailTypographyRange=range.cloneRange();}
 function transaction(run){
  flushEmailHistorySnapshot();const state=emailEditorSnapshot(),history=emailEditorHistory.slice(),index=emailEditorHistoryIndex;
  rememberEmailSelectionBeforeInput();let result;
  try{result=run();}
  catch(error){
   // Mutations do not emit input/change until committed, so rollback cannot
   // schedule an intermediate autosave or create another history step.
   canvas.innerHTML=state.body;$('#subject').value=state.subject;$('#preheader').value=state.preheader;
   emailTypographyRange=null;restoreEmailSelection(state.selection);emailEditorHistory=history;emailEditorHistoryIndex=index;updateEmailHistoryControls();
   throw error;
  }
  changed();return result;
 }
 async function request(path,options={}){
  const response=await fetch((window.__EDITOR_API_PREFIX__||'/editor-api')+path,options);const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Сервер ИИ недоступен');return result;
 }
 window.EmailTextTools=Object.freeze({signature,editorActive,protectedSelector,markers,intersects,icon,dialog,select,transaction,request});
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||document.querySelector('dialog[open]:not(.email-text-dialog)'))return;
  const active=document.querySelector('dialog.email-text-dialog[open]');if(active){event.preventDefault();event.stopPropagation();active.close();}
 });
})();
