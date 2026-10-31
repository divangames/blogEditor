/* Site adapter for the existing article/email feedback inbox. */
(()=>{
 if(!document.body.classList.contains('studio-shell'))return;
 const button=document.createElement('button');button.type='button';button.className='full studio-feedback';button.id='site-feedback';button.textContent='Комментарии';
 const menuButton=button.cloneNode(true);menuButton.removeAttribute('id');document.querySelector('.account-dropdown')?.prepend(menuButton);const attach=()=>document.querySelector('.studio-my-templates')?.after(button);attach();document.addEventListener('hasl:studio-ready',attach,{once:true});
 const dialog=document.createElement('dialog');dialog.id='site-feedback-dialog';dialog.innerHTML='<header class="dialog-head"><h2>Комментарии к вашим сайтам</h2><button type="button" data-close>Закрыть</button></header><p data-status role="status"></p><div data-items></div>';document.body.append(dialog);
 const body=dialog.querySelector('[data-items]'),status=dialog.querySelector('[data-status]');let items=[],previous=null;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 function render(){body.replaceChildren();if(!items.length){body.textContent='Комментариев пока нет. Отправьте ссылку публичного просмотра: после входа коллеги смогут оставить замечания.';return;}for(const item of items){const card=document.createElement('article');card.className='notice';const title=document.createElement('strong'),counts=document.createElement('p');title.textContent=item.title||'Страница сайта';counts.textContent=item.openCount+' открытых · '+item.totalCount+' комментариев';card.append(title,counts);if(item.previewUrl){const link=document.createElement('a');link.href=item.previewUrl+'?comments=1';link.target='_blank';link.rel='noopener';link.textContent='Открыть обсуждение';card.append(link);}else{const text=document.createElement('p');text.textContent='Ссылка отключена. Создайте публичный предпросмотр этого шаблона заново — комментарии сохранены.';card.append(text);}body.append(card);}}
 async function refresh(){try{const r=await fetch('/editor-api/feedback/inbox',{credentials:'same-origin'});if(!r.ok)throw Error('Не удалось загрузить комментарии. Откройте окно повторно.');const data=await r.json();items=data.items.filter(x=>x.kind==='site');const count=items.reduce((n,x)=>n+x.openCount,0);for(const b of [button,menuButton])b.textContent='Комментарии'+(count?' · '+count:'');if(previous!==null&&count>previous&&typeof notify==='function')notify('Появились новые комментарии к вашим сайтам.');previous=count;if(dialog.open){status.textContent='';render();}}catch(e){if(dialog.open)status.textContent=e.message;}}
 for(const b of [button,menuButton])b.onclick=()=>{b.closest('details')?.removeAttribute('open');dialog.showModal();status.textContent='Загружаем комментарии…';refresh();};
 refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('focus',refresh);
})();
/* PUBLIC_VIEWER */
(()=>{
 const stage=document.querySelector('.review-stage');if(!stage)return;
 const style=document.createElement('style');style.textContent=`.review-stage{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,390px);width:100%!important;min-width:0;gap:20px;align-items:start}.review-stage .review-device{width:100%!important;min-width:0}.review-stage[data-device=desktop]{grid-template-columns:minmax(0,1fr)}.review-stage[data-device=mobile]{grid-template-columns:minmax(0,390px)}.review-viewport{position:relative;width:100%;height:calc(100dvh - 210px);min-height:360px;overflow:hidden;background:white}.preview-pane .review-viewport iframe{position:absolute;top:0;left:0;max-width:none;min-height:0;transform-origin:top left;margin:0}.review-actions button,.annotation-bar button{min-height:44px}@media(max-width:800px){.review-stage[data-device=both]{grid-template-columns:minmax(0,1fr);gap:24px}.preview-title strong{max-width:100%}.review-header{flex-wrap:wrap}.review-actions{max-width:100%}}`;
 document.head.append(style);
 for(const [id,width] of [['review-frame',1440],['review-phone-frame',390]]){
  const frame=document.getElementById(id),wrap=document.createElement('div');wrap.className='review-viewport';frame.before(wrap);wrap.append(frame);
  const resize=()=>{if(!wrap.clientWidth)return;const scale=wrap.clientWidth/width;frame.style.width=width+'px';frame.style.height=wrap.clientHeight/scale+'px';frame.style.transform='scale('+scale+')';requestAnimationFrame(()=>frame.contentWindow?.postMessage({channel:'editor-feedback',type:'repaint'},'*'));};new ResizeObserver(resize).observe(wrap);resize();
 }
})();
