// Shared menu and keyboard behavior; no dependencies or document-content writes.
(()=>{
 const root=document.documentElement;
 root.dataset.uiInput='keyboard';
 document.addEventListener('pointerdown',()=>{root.dataset.uiInput='pointer';},true);
 document.addEventListener('keydown',event=>{
  root.dataset.uiInput='keyboard';
  if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
  const open=[...document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]')];
  if(!open.length)return;
  open.forEach(menu=>{menu.open=false;});
  open.at(-1).querySelector('summary')?.focus({preventScroll:true});
 },true);
 document.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]').forEach(menu=>{
   if(!menu.contains(event.target))menu.open=false;
  });
 });
 document.addEventListener('toggle',event=>{
  const menu=event.target;
  if(!(menu instanceof Element)||!menu.matches('.editor-switcher,.account-menu,.document-info')||!menu.open)return;
  document.querySelectorAll('.editor-switcher[open],.account-menu[open],.document-info[open]').forEach(other=>{if(other!==menu)other.open=false;});
 },true);
})();
/* Mobile entry into the existing focus command; never changes document/history. */
(()=>{
 const email=!!window.EmailCommands,commands=email?window.EmailCommands:window.ArticleCommands;
 const canvas=document.getElementById('canvas');
 if(!commands||!canvas||(!email&&window.__ARTICLE_WORKFLOW_DISABLED__))return;
 const button=document.createElement('button');button.id='mobile-writing-toggle';button.type='button';button.className='mobile-writing-toggle';
 const active=()=>document.body.classList.contains(email?'email-focus':'article-focus');
 function update(){button.textContent=active()?'К инструментам':'К тексту';button.setAttribute('aria-pressed',String(active()));}
 button.addEventListener('mousedown',event=>event.preventDefault());
 button.onclick=()=>{
  const bookmark=email?emailSelectionBookmark():articleSelectionBookmark(),enter=!active();
  if(enter){if(email)document.querySelector('.tab[data-view="editor"]')?.click();else setTab('editor');}
  commands.execute('view.focus',email?{}:{value:enter});
  if(enter){if(email)restoreEmailSelection(bookmark);else restoreArticleSelection(bookmark);canvas.focus({preventScroll:true});canvas.scrollIntoView({block:'start',behavior:'auto'});}
  else {const sidebar=document.querySelector('.sidebar');sidebar?.scrollIntoView({block:'start',behavior:'auto'});sidebar?.querySelector('input,button,summary')?.focus({preventScroll:true});}
  update();
 };
 new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class']});update();document.body.append(button);
})();
