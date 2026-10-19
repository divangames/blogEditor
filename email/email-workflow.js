/* Writing controls over the existing email operations and history. */
(() => {
 'use strict';
 const registry=window.EmailCommands,toolbar=document.getElementById('editor-toolbar');
 if(!registry||!toolbar)return;
 const open=document.createElement('button');open.id='email-commands-open';open.type='button';open.className='email-command-icon';open.title='Команды письма (Ctrl+Shift+K)';open.setAttribute('aria-label',open.title);open.setAttribute('aria-haspopup','dialog');
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 9 3 3-3 3m5 0h3"/></svg>';
 toolbar.append(open);open.addEventListener('mousedown',e=>e.preventDefault());
 const dialog=document.createElement('dialog');dialog.id='email-command-dialog';dialog.className='email-command-dialog';dialog.setAttribute('aria-labelledby','email-command-title');
 dialog.innerHTML='<header><h2 id="email-command-title">Команды письма</h2><button type="button" data-close aria-label="Закрыть команды">×</button></header><label for="email-command-search">Найти действие</label><input id="email-command-search" type="search" placeholder="Например: курсив, ссылка, фокус" autocomplete="off"><div id="email-command-results"></div><p id="email-command-status" role="status" aria-live="polite"></p>';
 document.body.append(dialog);
 const query=dialog.querySelector('input'),results=dialog.querySelector('#email-command-results');let bookmark=null,executed=false;
 function render(){results.replaceChildren();for(const spec of registry.list(query.value)){if(Object.keys(spec.params).length)continue;const item=document.createElement('button');item.type='button';item.textContent=spec.label;item.disabled=!!spec.disabled;item.title=spec.disabled||spec.shortcut;item.onclick=()=>{executed=true;dialog.close();restoreEmailSelection(bookmark);try{registry.execute(spec.id)?.catch?.(error=>toast(error.message,true));}catch(error){toast(error.message,true);}};results.append(item);}dialog.querySelector('[role=status]').textContent=results.children.length?'':'Команды не найдены';}
 function show(){bookmark=emailSelectionBookmark();executed=false;query.value='';render();dialog.showModal();query.focus();}
 open.onclick=show;query.oninput=render;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(!executed)open.focus({preventScroll:true});executed=false;});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}else if(event.key==='Enter'&&event.target===query){event.preventDefault();results.querySelector('button:not(:disabled)')?.click();}else if(event.key==='ArrowDown'&&event.target===query){event.preventDefault();results.querySelector('button:not(:disabled)')?.focus();}});
 const focusActions=document.createElement('div');focusActions.className='email-focus-actions';focusActions.hidden=true;
 const leaveFocus=document.createElement('button');leaveFocus.type='button';leaveFocus.textContent='Выйти из фокуса';focusActions.append(leaveFocus);toolbar.after(focusActions);
 const save=document.getElementById('save-email-project'),saveHome=document.createComment('email-save-home');save?.before(saveHome);
 const saveStatus=document.getElementById('email-project-status'),statusHome=document.createComment('email-status-home');saveStatus?.before(statusHome);
 let conflictHome=null;
 function setFocus(active){
  document.body.classList.toggle('email-focus',active);focusActions.hidden=!active;
  if(save){if(active)focusActions.prepend(save);else saveHome.after(save);}
  if(saveStatus){if(active)focusActions.append(saveStatus);else statusHome.after(saveStatus);}
  const conflict=document.getElementById('email-save-conflict');if(conflict){if(!conflictHome){conflictHome=document.createComment('email-conflict-home');conflict.before(conflictHome);}if(active)focusActions.append(conflict);else conflictHome.after(conflict);}
  canvas.focus({preventScroll:true});return {active};
 }
 leaveFocus.onclick=()=>setFocus(false);
 registry.register({id:'view.focus',label:'Режим фокуса письма',run:()=>setFocus(!document.body.classList.contains('email-focus'))});
 document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.code==='KeyK'&&(canvas.contains(event.target)||toolbar.contains(event.target))&&!document.querySelector('dialog[open]')&&(!document.querySelector('.main').dataset.view||document.querySelector('.main').dataset.view==='editor')){event.preventDefault();show();}
  if(event.key==='Escape'&&document.body.classList.contains('email-focus')&&!document.querySelector('dialog[open]'))setFocus(false);
 });
})();
/* Alt+F10 enters the toolbar; Escape returns the original selection if current. */
(()=>{
 const toolbar=document.getElementById('editor-toolbar');if(!toolbar||!window.EmailCommands)return;
 let bookmark=null,stamp=null;
 const signature=()=>JSON.stringify([emailDocumentEpoch,canvas.innerHTML]);
 canvas.addEventListener('keydown',event=>{
  if(!event.altKey||event.ctrlKey||event.metaKey||event.key!=='F10'||document.querySelector('dialog[open]'))return;
  event.preventDefault();bookmark=emailSelectionBookmark();stamp=signature();toolbar.querySelector('button:not(:disabled),select:not(:disabled),input:not(:disabled)')?.focus();
 });
 toolbar.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
  event.preventDefault();event.stopPropagation();if(stamp===signature())restoreEmailSelection(bookmark);canvas.focus({preventScroll:true});bookmark=null;stamp=null;
 },true);
})();
