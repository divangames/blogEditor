/* Adapter over the rendered site and the shared, read-only Wordstat engine. */
(()=>{
 'use strict';
 let rows=[],scope=null;const roots=new Map();
 const frames=()=>['desktop','phone'].map(id=>document.getElementById(id));
 const active=()=>document.querySelector('.preview-area').dataset.mode==='phone'?frames()[1]:frames()[0];
 function syncScope(){const next=window.SiteBuilder?.scope();if(scope!==next){const previous=scope;scope=next;clear();if(previous!==null)document.dispatchEvent(new Event('wordstat:scope-changed'));}}
 function clear(){rows=[];for(const root of roots.values())WordstatSeo.dispose(root);roots.clear();}
 function attach(frame){
  syncScope();const root=frame.contentDocument?.querySelector('.hasl-home-embed'),old=roots.get(frame.id);
  if(old&&old!==root)WordstatSeo.dispose(old);
  if(root){roots.set(frame.id,root);if(rows.length)WordstatSeo.apply(root,rows);}
 }
 function snapshot(){
  syncScope();const frame=active(),root=frame?.contentDocument?.querySelector('.hasl-home-embed');
  if(!root)throw Error('Дождитесь загрузки страницы в предпросмотре.');
  const blocks=WordstatSeo.blocks(root).map(({tag,text})=>({tag,text}));
  return {root,blocks,signature:JSON.stringify([scope,state,frame.id,frame.contentWindow.innerWidth,blocks])};
 }
 function apply(next,signature,jump=false){
  const current=snapshot();if(current.signature!==signature)throw Error('Страница изменилась. Повторите анализ.');
  rows=next;for(const frame of frames())attach(frame);
  if(jump){const range=rows.flatMap(row=>WordstatSeo.ranges(current.root,row.phrase))[0],answer=range?.startContainer.parentElement.closest('.faq-a');if(answer&&!answer.parentElement.classList.contains('open'))answer.previousElementSibling.click();}
  return WordstatSeo.apply(current.root,rows,{jump});
 }
 window.SiteWordstat={snapshot,apply,clear,attach};
 addEventListener('pagehide',event=>{if(!event.persisted)clear();});
})();
