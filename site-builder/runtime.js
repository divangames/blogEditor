/* Shared exported behavior. Every control is scoped to its own block instance. */
window.HaslSiteRuntime=function(){
  'use strict';
  const root=document.currentScript.closest('.hasl-home-embed');if(!root)return;
function initializeHero(root){
  const host=root.closest('main[class*="ContentPage_root"]');
  if(host)host.classList.add('hasl-page-host');
  for(const hero of root.querySelectorAll('.hero-main')){
    const sale=hero.querySelector('.hero-sale');if(!sale)continue;
    const button=sale.querySelector('.hero-more');
    if(button){button.setAttribute('aria-expanded','false');button.addEventListener('click',()=>{const open=hero.classList.toggle('hero-expanded');button.setAttribute('aria-expanded',String(open));button.textContent=open?'Свернуть подробности':'Подробнее об акции';});}

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
  // Optional mobile feedback: no dependency, startup benchmark or permanent frame loop.

  let motion=null;
  const simpleMotion=()=>{motion={tier:'lite',get mobile(){return root.clientWidth<=767;},enter(){},cancel(){}};root.__haslMotion={tier:'lite',stats:{samples:0,missed:0,changes:0}};};
  const mobileTemplate=root.clientWidth<=767&&root.dataset.editorPreview!=='true';
  const loadMotion=event=>{
    if(reduced.matches||!event.isPrimary||event.button>0||!event.target.closest('button,.btn,.size-choice'))return;
    root.removeEventListener('pointerdown',loadMotion);
    const lite=navigator.connection?.saveData||navigator.deviceMemory<=2||navigator.hardwareConcurrency<=2;
    if(lite){simpleMotion();return;}
    if(window.HaslMobileMotion){motion=window.HaslMobileMotion(root,reduced);motion.start?.(event);return;}
    if(!root.dataset.motionSrc)return;
    const script=document.createElement('script');script.src=root.dataset.motionSrc;script.async=true;script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';
    script.onload=()=>{if(root.isConnected&&window.HaslMobileMotion)motion=window.HaslMobileMotion(root,reduced);script.remove();};
    script.onerror=()=>{simpleMotion();script.remove();};root.append(script);
  };
  if(mobileTemplate)root.addEventListener('pointerdown',loadMotion,{passive:true});

  const behavior=()=>reduced.matches||motion?.tier==='lite'?'instant':'smooth';
  let saved=[];try{saved=JSON.parse(localStorage.getItem('hasl-home-favorites')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
  for(const section of root.querySelectorAll('main > section')){
    const $=s=>section.querySelector(s),$$=s=>[...section.querySelectorAll(s)];
    const collection=$('.collection-grid');
    if(collection){
      const controls=document.createElement('div');controls.className='collection-controls';controls.innerHTML='<button type="button" aria-label="Предыдущие пары">←</button><button type="button" aria-label="Следующие пары">→</button>';const head=collection.parentElement.querySelector(':scope > .section-head');if(head){head.classList.add('collection-head');head.append(controls);}else collection.before(controls);
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
    const season=$('[id*="hasl-embed-fUse"]'),brandPicker=$('.brand-picker'),brands=$$('input[name="hasl-embed-brand"]');
    $$('.size-btn').forEach(button=>button.addEventListener('click',()=>{const url=new URL((root.dataset.siteOrigin||'https://xn--80awro.xn--p1ai')+(root.dataset.catalogPath||'/krossovki'));url.searchParams.set('razmer-obuvi',button.dataset.size);const result=$('.size-result');if(result){result.replaceChildren();const link=document.createElement('a');link.href=url.href;link.textContent='Смотреть размер '+button.dataset.size;result.append(link);}$$('.size-btn').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
    const sizes=$$('input[name="hasl-embed-size"]'),any=$('.size-choice-any'),finderButton=$('[id*="finderBtn"]'),gender=$('.finder-gender');
    if(season&&brandPicker&&finderButton){
      const search=brandPicker.querySelector('input[type="search"]'),scroll=brandPicker.querySelector('.brand-scroll');
      const filterBrands=()=>{const query=(search?.value||'').trim().toLocaleLowerCase('ru');let visible=0;brands.forEach(b=>{const show=b.dataset.brandLabel.toLocaleLowerCase('ru').includes(query);b.closest('label').hidden=!show;if(show)visible++;});brandPicker.querySelector('.brand-empty').hidden=visible>0;if(scroll)scroll.scrollTop=0;};
      search?.addEventListener('input',filterBrands);
      brandPicker.addEventListener('toggle',()=>{if(!brandPicker.open&&search){search.value='';filterBrands();}});
      const finder=()=>{
        sizes.forEach(s=>{const n=Number(s.dataset.sizeLabel),visible=gender?.value==='zhenskie'?n>=35&&n<=41:gender?.value==='muzhskie'?n>=41&&n<=51:true;s.closest('label').hidden=!visible;if(!visible)s.checked=false;});
        const selected=sizes.filter(s=>s.checked),url=new URL((root.dataset.siteOrigin||'https://xn--80awro.xn--p1ai')+(root.dataset.catalogPath||'/krossovki')+(gender?.value?'/'+gender.value:''));
        if(selected.length)url.searchParams.set('razmer-obuvi',selected.map(s=>s.value).join('-'));
        const chosen=brands.filter(b=>b.checked),brandText=chosen.length?chosen.map(b=>b.dataset.brandLabel).join(', '):'Любой бренд';
        if(season.value)url.searchParams.set('sezon',season.value);
        if(chosen.length)url.searchParams.set('manufacturers',chosen.map(b=>b.value).join('-'));
        finderButton.href=url.href;brandPicker.querySelector('.brand-value').textContent=brandText;
        brandPicker.querySelector('summary').setAttribute('aria-label','Бренд: '+brandText+'. Можно выбрать несколько');
        brandPicker.querySelector('.brand-any').setAttribute('aria-pressed',String(!chosen.length));
        const label=$('[id*="finderText"]');if(label)label.textContent=[selected.length?'Размеры: '+selected.map(s=>s.dataset.sizeLabel).join(', '):'Любой размер',season.selectedOptions[0].textContent,brandText].join(' · ');
        any?.setAttribute('aria-pressed',String(!selected.length));
      };
      [season,...brands,...sizes,...(gender?[gender]:[])].forEach(s=>s.addEventListener('change',finder));any?.addEventListener('click',()=>{sizes.forEach(s=>s.checked=false);finder();});
      const resetBrands=()=>{brands.forEach(b=>b.checked=false);finder();};
      section.__haslFinder={resetBrands};brandPicker.querySelector('.brand-any').addEventListener('click',resetBrands);
      brandPicker.addEventListener('keydown',event=>{if(event.key==='Escape'&&brandPicker.open){event.preventDefault();brandPicker.open=false;brandPicker.querySelector('summary').focus();}});
      document.addEventListener('click',event=>{if(!brandPicker.contains(event.target))brandPicker.open=false;});finder();
    }
    const questions=$$('.faq-q');
    if(questions.length){
      const animations=new Map();
      const setOpen=(q,open,animate=false)=>{
        const answer=q.nextElementSibling;if(!answer)return;
        const mobile=root.clientWidth<=767,from=animate&&!reduced.matches?answer.getBoundingClientRect().height:0;
        animations.get(answer)?.cancel();animations.delete(answer);answer.style.removeProperty('visibility');
        q.setAttribute('aria-expanded',String(open));q.parentElement.classList.toggle('open',open);
        answer.inert=!open;answer.setAttribute('aria-hidden',String(!open));
        const sign=q.querySelector('.faq-sign');if(sign)sign.textContent=open?'−':'+';
        if(!animate||reduced.matches||!answer.animate)return;
        const to=open?answer.scrollHeight:0;if(Math.abs(from-to)<.5)return;
        answer.style.visibility='visible';
        const animation=answer.animate([{height:from+'px'},{height:to+'px'}],{duration:mobile?220:260,easing:'cubic-bezier(.22,1,.36,1)'});
        animations.set(answer,animation);
        animation.onfinish=()=>{if(animations.get(answer)!==animation)return;animations.delete(answer);answer.style.removeProperty('visibility');};
      };
      const toggle=(q,event)=>{
        const open=q.getAttribute('aria-expanded')!=='true',animate=event?.detail!==0;
        if(open&&section.dataset.faqMode==='single')questions.forEach(other=>{if(other!==q&&other.getAttribute('aria-expanded')==='true')setOpen(other,false,animate);});
        setOpen(q,open,animate);
      };
      section.__haslFaq={toggle,restore:ids=>{let opened=false;questions.forEach(q=>{const open=ids.includes(q.getAttribute('aria-controls'))&&(!opened||section.dataset.faqMode!=='single');setOpen(q,open);opened||=open;});}};
      questions.forEach((q,i)=>{const answer=q.nextElementSibling;if(!answer)return;answer.id='answer-'+(section.dataset.siteBlock||'reference')+'-'+i;q.setAttribute('aria-controls',answer.id);setOpen(q,i===0&&section.dataset.faqInitial==='first');q.addEventListener('click',event=>toggle(q,event));});
      reduced.addEventListener('change',()=>{if(reduced.matches)questions.forEach(q=>setOpen(q,q.getAttribute('aria-expanded')==='true'));});
    }
    const reviews=$('.reviews-track');if(reviews){
      const move=d=>{const max=reviews.scrollWidth-reviews.clientWidth;const target=d>0&&reviews.scrollLeft>=max-2?0:d<0&&reviews.scrollLeft<2?max:reviews.scrollLeft+d*((reviews.firstElementChild?.getBoundingClientRect().width||300)+(parseFloat(getComputedStyle(reviews).columnGap)||0));reviews.scrollTo({left:target,behavior:behavior()});};
      $('[id*="reviewsPrev"]')?.addEventListener('click',()=>move(-1));$('[id*="reviewsNext"]')?.addEventListener('click',()=>move(1));
    }
  }
  // One dialog for all reviews in the selected section; no copy is truncated in storage.
  root.querySelector('.review-lightbox')?.remove();
  const modal=document.createElement('dialog');modal.className='review-dialog';modal.setAttribute('aria-label','Отзыв покупателя');
  modal.innerHTML='<header><button type="button" data-close aria-label="Закрыть отзыв">×</button></header><div class="review-dialog-body"><div class="review-dialog-media"><img class="review-dialog-photo" alt="Фото покупателя"><div class="review-dialog-photos"></div></div><div class="review-dialog-copy"><div class="review-dialog-info"><strong class="review-dialog-title"></strong><div class="review-dialog-city"></div><div class="review-dialog-stars"></div></div><div class="review-dialog-text"></div></div></div><footer><button type="button" data-prev aria-label="Предыдущий отзыв">←</button><span class="review-dialog-counter" aria-live="polite"></span><button type="button" data-next aria-label="Следующий отзыв">→</button></footer>';
  root.append(modal);let reviewList=[],reviewIndex=0,reviewOpener=null,oldOverflow='';
  const drawReview=()=>{
    const card=reviewList[reviewIndex];if(!card)return;
    modal.querySelector('.review-dialog-title').textContent=[card.querySelector('.review-bottom strong')?.textContent,card.querySelector('.review-date')?.textContent].filter(Boolean).join(' — ')||'Отзыв покупателя';
    const city=modal.querySelector('.review-dialog-city');city.textContent=card.querySelector('.review-bottom > div > span')?.textContent?.trim()||'';city.hidden=!city.textContent;
    const stars=modal.querySelector('.review-dialog-stars'),sourceStars=card.querySelector('.review-stars');
    stars.replaceChildren(...(sourceStars?[...sourceStars.childNodes].map(n=>n.cloneNode(true)):[]));
    stars.hidden=!sourceStars||sourceStars.hidden;stars.setAttribute('role','img');stars.setAttribute('aria-label',sourceStars?.getAttribute('aria-label')||'');
    modal.querySelector('.review-dialog-text').textContent=card.querySelector('.review-text')?.textContent||'';
    modal.querySelector('.review-dialog-counter').textContent=(reviewIndex+1)+' / '+reviewList.length;
    const photos=[...card.querySelectorAll('.review-thumb img')],image=modal.querySelector('.review-dialog-photo'),thumbs=modal.querySelector('.review-dialog-photos');
    modal.querySelector('.review-dialog-body').classList.toggle('no-media',!photos.length);modal.querySelector('.review-dialog-media').hidden=!photos.length;thumbs.replaceChildren();image.removeAttribute('src');
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
    const open=opener=>{reviewOpener=opener;reviewList=[...card.closest('.reviews-track').querySelectorAll('.review-card')];reviewIndex=reviewList.indexOf(card);drawReview();oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';modal.showModal();motion?.enter(modal.querySelector('.review-dialog-body'));};
    button.onclick=()=>open(button);card.querySelectorAll('.review-thumb').forEach(b=>b.onclick=()=>open(b));
  });
  const videos=[...root.querySelectorAll('.product-video')];
  const playVisible=video=>{if(video.dataset.inView==='true'&&!document.hidden)video.play().catch(()=>{});else if(video.dataset.inView!=='true'||document.hidden)video.pause();};
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.dataset.inView=String(entry.isIntersecting);playVisible(entry.target);}),{threshold:0.35});
  videos.forEach(video=>{video.controls=false;video.muted=true;video.defaultMuted=true;video.loop=true;observer.observe(video);video.addEventListener('error',()=>{if(video.poster){const image=document.createElement('img');image.className='product-image';image.src=video.poster;image.alt=video.getAttribute('aria-label')||'Товар';video.replaceWith(image);observer.unobserve(video);}});});
  document.addEventListener('visibilitychange',()=>videos.forEach(playVisible));
  root.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{if(a.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const target=document.getElementById(a.getAttribute('href').slice(1));if(target){e.preventDefault();target.scrollIntoView({behavior:behavior()});}}));
};
