/* Shared exported behavior. Every control is scoped to its own block instance. */
window.HaslSiteRuntime=function(){
  'use strict';
  const root=document.currentScript.closest('.hasl-home-embed');if(!root)return;
function initializeHero(root){
  const host=root.closest('main[class*="ContentPage_root"]');
  if(host)host.classList.add('hasl-page-host');
  for(const hero of root.querySelectorAll('.hero-main')){
    const sale=hero.querySelector('.hero-sale');if(!sale)continue;
    const button=document.createElement('button');button.type='button';button.className='hero-more';button.textContent='Подробнее об акции';button.setAttribute('aria-expanded','false');
    sale.append(button);
    button.addEventListener('click',()=>{const open=hero.classList.toggle('hero-expanded');button.setAttribute('aria-expanded',String(open));button.textContent=open?'Свернуть подробности':'Подробнее об акции';});
  }
  const size=()=>{
    const top=host?Math.max(0,root.getBoundingClientRect().top+window.scrollY):0;
    const footer=host?document.querySelector('footer[class*="FooterMobile_root"]'):null;
    const bottom=footer&&getComputedStyle(footer).position==='fixed'?footer.getBoundingClientRect().height:0;
    root.style.setProperty('--hero-insets',(top+bottom)+'px');
    root.style.setProperty('--store-bottom',bottom+'px');
    const header=host?document.querySelector('header[class*="HeaderMobile_root"]'):null;
    const headerHeight=header&&getComputedStyle(header).position==='fixed'?header.getBoundingClientRect().height:0;
    root.style.setProperty('--store-top',headerHeight+'px');
  };
  size();window.addEventListener('resize',size,{passive:true});window.visualViewport?.addEventListener('resize',size,{passive:true});
  if(host){const observer=new ResizeObserver(size);observer.observe(host);observer.observe(document.body);const footer=document.querySelector('footer[class*="FooterMobile_root"]');if(footer)observer.observe(footer);window.addEventListener("load",size,{once:true});}
}

  initializeHero(root);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const behavior=()=>reduced.matches?'instant':'smooth';
  let saved=[];try{saved=JSON.parse(localStorage.getItem('hasl-home-favorites')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
  for(const section of root.querySelectorAll('main > section')){
    const $=s=>section.querySelector(s),$$=s=>[...section.querySelectorAll(s)];
    const collection=$('.collection-grid');
    if(collection){
      const controls=document.createElement('div');controls.className='collection-controls';controls.innerHTML='<button type="button" aria-label="Предыдущие пары">←</button><button type="button" aria-label="Следующие пары">→</button>';collection.before(controls);
      const buttons=controls.querySelectorAll('button');const sync=()=>{buttons[0].disabled=collection.scrollLeft<2;buttons[1].disabled=collection.scrollLeft+collection.clientWidth>=collection.scrollWidth-3;};
      buttons.forEach((b,i)=>b.onclick=()=>collection.scrollBy({left:(i?1:-1)*((collection.firstElementChild?.getBoundingClientRect().width||250)+(parseFloat(getComputedStyle(collection).columnGap)||0)),behavior:behavior()}));collection.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(collection);sync();
    }
    const track=$('.product-track');
    if(track){
      const prev=$('[id*="carouselPrev"]'),next=$('[id*="carouselNext"]');
      const sync=()=>{if(prev)prev.disabled=track.scrollLeft<2;if(next)next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-3;};
      const move=d=>{const card=[...track.children].find(c=>!c.hidden);if(card)track.scrollBy({left:d*(card.getBoundingClientRect().width+(parseFloat(getComputedStyle(track).columnGap)||0)),behavior:behavior()});};
      prev?.addEventListener('click',()=>move(-1));next?.addEventListener('click',()=>move(1));
      track.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(track);sync();
      $$('.chip').forEach(button=>button.addEventListener('click',()=>{
        $$('.chip').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
        $$('.product').forEach(p=>p.hidden=button.dataset.tab!=='all'&&!(p.dataset.tags||'').split('|').includes(button.dataset.tab));
        track.scrollLeft=0;sync();const status=$('[id*="productStatus"]');if(status)status.textContent='Показано моделей: '+$$('.product').filter(p=>!p.hidden).length;
      }));
    }
    $$('.heart').forEach(button=>{
      const draw=()=>{const on=saved.includes(button.dataset.id);button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));};draw();
      button.addEventListener('click',()=>{saved=saved.includes(button.dataset.id)?saved.filter(x=>x!==button.dataset.id):[...saved,button.dataset.id];try{localStorage.setItem('hasl-home-favorites',JSON.stringify(saved));}catch{}draw();});
    });
    const fields=['fUse','fBrand'].map(id=>$('[id*="hasl-embed-'+id+'"]'));
    $$('.size-btn').forEach(button=>button.addEventListener('click',()=>{const url=new URL((root.dataset.siteOrigin||'https://xn--80awro.xn--p1ai')+(root.dataset.catalogPath||'/krossovki'));url.searchParams.set('razmer-obuvi',button.dataset.size);const result=$('.size-result');if(result){result.replaceChildren();const link=document.createElement('a');link.href=url.href;link.textContent='Смотреть размер '+button.dataset.size;result.append(link);}$$('.size-btn').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
    const sizes=$$('input[name="hasl-embed-size"]'),any=$('.size-choice-any'),finderButton=$('[id*="finderBtn"]'),gender=$('.finder-gender');
    if(fields.every(Boolean)&&finderButton){
      const finder=()=>{
        sizes.forEach(s=>{const n=Number(s.dataset.sizeLabel),visible=gender?.value==='zhenskie'?n>=35&&n<=41:gender?.value==='muzhskie'?n>=41&&n<=51:true;s.closest('label').hidden=!visible;if(!visible)s.checked=false;});
        const selected=sizes.filter(s=>s.checked),url=new URL((root.dataset.siteOrigin||'https://xn--80awro.xn--p1ai')+(root.dataset.catalogPath||'/krossovki')+(gender?.value?'/'+gender.value:''));
        if(selected.length)url.searchParams.set('razmer-obuvi',selected.map(s=>s.value).join('-'));
        ['sezon','manufacturers'].forEach((key,i)=>{if(fields[i].value)url.searchParams.set(key,fields[i].value);});finderButton.href=url.href;
        const label=$('[id*="finderText"]');if(label)label.textContent=[selected.length?'Размеры: '+selected.map(s=>s.dataset.sizeLabel).join(', '):'Любой размер',...fields.map(s=>s.selectedOptions[0].textContent)].join(' · ');
        any?.setAttribute('aria-pressed',String(!selected.length));
      };
      [...fields,...sizes,...(gender?[gender]:[])].forEach(s=>s.addEventListener('change',finder));any?.addEventListener('click',()=>{sizes.forEach(s=>s.checked=false);finder();});finder();
    }
    $$('.faq-q').forEach((q,i)=>{const answer=q.nextElementSibling;if(!answer)return;answer.id='answer-'+(section.dataset.siteBlock||'reference')+'-'+i;q.setAttribute('aria-controls',answer.id);q.setAttribute('aria-expanded','false');q.addEventListener('click',()=>{const open=q.getAttribute('aria-expanded')!=='true';q.setAttribute('aria-expanded',String(open));q.parentElement.classList.toggle('open',open);const sign=q.querySelector('.faq-sign');if(sign)sign.textContent=open?'−':'+';});});
    const reviews=$('.reviews-track');if(reviews){
      const move=d=>{const max=reviews.scrollWidth-reviews.clientWidth;const target=d>0&&reviews.scrollLeft>=max-2?0:d<0&&reviews.scrollLeft<2?max:reviews.scrollLeft+d*((reviews.firstElementChild?.getBoundingClientRect().width||300)+20);reviews.scrollTo({left:target,behavior:behavior()});};
      $('[id*="reviewsPrev"]')?.addEventListener('click',()=>move(-1));$('[id*="reviewsNext"]')?.addEventListener('click',()=>move(1));
    }
  }
  // One dialog for all reviews in the selected section; no copy is truncated in storage.
  root.querySelector('.review-lightbox')?.remove();
  const modal=document.createElement('dialog');modal.className='review-dialog';modal.setAttribute('aria-label','Отзыв покупателя');
  modal.innerHTML='<header><strong class="review-dialog-title"></strong><button type="button" data-close aria-label="Закрыть отзыв">×</button></header><div class="review-dialog-body"><div class="review-dialog-media"><img class="review-dialog-photo" alt="Фото покупателя"><div class="review-dialog-photos"></div></div><div class="review-dialog-text"></div></div><footer><button type="button" data-prev aria-label="Предыдущий отзыв">←</button><span class="review-dialog-counter" aria-live="polite"></span><button type="button" data-next aria-label="Следующий отзыв">→</button></footer>';
  root.append(modal);let reviewList=[],reviewIndex=0,reviewOpener=null,oldOverflow='';
  const drawReview=()=>{
    const card=reviewList[reviewIndex];if(!card)return;
    modal.querySelector('.review-dialog-title').textContent=card.querySelector('.review-bottom')?.innerText||'Отзыв покупателя';
    modal.querySelector('.review-dialog-text').textContent=card.querySelector('.review-text')?.textContent||'';
    modal.querySelector('.review-dialog-counter').textContent=(reviewIndex+1)+' / '+reviewList.length;
    const photos=[...card.querySelectorAll('.review-thumb img')],image=modal.querySelector('.review-dialog-photo'),thumbs=modal.querySelector('.review-dialog-photos');
    modal.querySelector('.review-dialog-media').hidden=!photos.length;thumbs.replaceChildren();image.removeAttribute('src');
    if(photos.length){image.src=photos[0].src;image.alt=photos[0].alt;photos.forEach((p,i)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Фото '+(i+1));const thumb=p.cloneNode();button.append(thumb);button.onclick=()=>{image.src=p.src;image.alt=p.alt;};thumbs.append(button);});}
    modal.scrollTop=0;
  };
  const stepReview=d=>{if(reviewList.length){reviewIndex=(reviewIndex+d+reviewList.length)%reviewList.length;drawReview();}};
  modal.querySelector('[data-close]').onclick=()=>modal.close();modal.querySelector('[data-prev]').onclick=()=>stepReview(-1);modal.querySelector('[data-next]').onclick=()=>stepReview(1);
  modal.addEventListener('close',()=>{document.body.style.overflow=oldOverflow;reviewOpener?.focus();});
  modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
  modal.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();stepReview(-1);}if(e.key==='ArrowRight'){e.preventDefault();stepReview(1);}});
  let touch=null;modal.addEventListener('touchstart',e=>{touch=[e.touches[0].clientX,e.touches[0].clientY]},{passive:true});modal.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)stepReview(dx<0?1:-1);touch=null;},{passive:true});
  root.querySelectorAll('.review-card').forEach(card=>{
    const button=document.createElement('button');button.type='button';button.className='review-read';button.textContent='Читать полностью';card.querySelector('.review-text')?.after(button);
    const open=opener=>{reviewOpener=opener;reviewList=[...card.closest('.reviews-track').querySelectorAll('.review-card')];reviewIndex=reviewList.indexOf(card);drawReview();oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';modal.showModal();};
    button.onclick=()=>open(button);card.querySelectorAll('.review-thumb').forEach(b=>b.onclick=()=>open(b));
  });
  const videos=[...root.querySelectorAll('.product-video')];
  const playVisible=video=>{if(video.dataset.inView==='true'&&!document.hidden)video.play().catch(()=>{});else if(video.dataset.inView!=='true'||document.hidden)video.pause();};
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.dataset.inView=String(entry.isIntersecting);playVisible(entry.target);}),{threshold:0.35});
  videos.forEach(video=>{video.controls=false;video.muted=true;video.defaultMuted=true;video.loop=true;observer.observe(video);video.addEventListener('error',()=>{if(video.poster){const image=document.createElement('img');image.className='product-image';image.src=video.poster;image.alt=video.getAttribute('aria-label')||'Товар';video.replaceWith(image);observer.unobserve(video);}});});
  document.addEventListener('visibilitychange',()=>videos.forEach(playVisible));
  root.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const target=document.getElementById(a.getAttribute('href').slice(1));if(target){e.preventDefault();target.scrollIntoView({behavior:behavior()});}}));
};
