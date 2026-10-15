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
