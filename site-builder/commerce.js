/* Real, visible product information. Shares the existing project and undo history. */
window.SiteCommerce = (() => {
  'use strict';
  const countries=new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
  const categories={MerchantReturnFiniteReturnWindow:'В течение указанного срока',MerchantReturnUnlimitedWindow:'Без ограничения срока',MerchantReturnNotPermitted:'Возврат не предусмотрен'};
  const methods={ReturnByMail:'По почте',ReturnInStore:'В магазине',ReturnAtKiosk:'В пункте возврата'};
  const fees={FreeReturn:'Бесплатный возврат',ReturnFeesCustomerResponsibility:'Покупатель самостоятельно оплачивает пересылку',ReturnShippingFees:'Магазин удерживает указанную стоимость пересылки'};
  const number=(v,max,integer=false)=>typeof v==='string'&&/^\d+(?:\.\d{1,2})?$/.test(v)&&Number(v)<=max&&(!integer||Number.isInteger(Number(v)));
  const range=(p,a,b)=>number(p[a],365,true)&&number(p[b],365,true)&&+p[a]<=+p[b];
  const validCode=k=>/^[-\w.]{1,100}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
  const plain=v=>String(v||'').replace(/\s+/gu,' ').trim();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&v.slice(0,4)!=='0000'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const score=v=>number(v,5)&&+v>=1;
  const haslURL=value=>{try{const u=new URL(value);return value.length<=2000&&!/[\x00-\x20\\]/.test(value)&&u.protocol==='https:'&&['xn--80awro.xn--p1ai','www.xn--80awro.xn--p1ai','haslestore.com','www.haslestore.com'].includes(u.hostname)&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}};
  const disclosure='На ХАСЛ опубликовано предложение скидки за отзыв; участие конкретного автора в акции не установлено.';
  function aggregate(p={}){
    if(p.enabled!==true||!score(p.value)||p.ratingCount!==undefined&&p.ratingCount!==''&&+p.ratingCount===0||![p.ratingCount,p.reviewCount].some(v=>number(v,10000000,true)&&+v>0)||[p.ratingCount,p.reviewCount].some(v=>v!==undefined&&v!==''&&!number(v,10000000,true)))return null;
    const value={'@type':'AggregateRating',ratingValue:+p.value,bestRating:5,worstRating:1};
    if(p.ratingCount!==undefined&&p.ratingCount!=='')value.ratingCount=+p.ratingCount;
    if(p.reviewCount!==undefined&&p.reviewCount!=='')value.reviewCount=+p.reviewCount;
    return {value,label:`Рейтинг покупателей: ${+p.value} / 5.${value.ratingCount!==undefined?' Оценок: '+value.ratingCount+'.':''}${value.reviewCount!==undefined?' Отзывов: '+value.reviewCount+'.':''}`};
  }
  function review(p={}){
    if(p.enabled!==true||!plain(p.author)||!plain(p.body)||!score(p.rating)||p.date&&!date(p.date))return null;
    const value={'@type':'Review',author:{'@type':'Person',name:plain(p.author)},reviewBody:plain(p.body),reviewRating:{'@type':'Rating',ratingValue:+p.rating,bestRating:5,worstRating:1}};
    if(p.date)value.datePublished=p.date;
    return {value,label:`${plain(p.author)} · Оценка: ${+p.rating} / 5${p.date?' · '+p.date:''}\n${plain(p.body)}`};
  }
  const consistent=(a,count)=>a&&(a.value.ratingCount===undefined||a.value.ratingCount>=count)&&(a.value.reviewCount===undefined||a.value.reviewCount>=count);
  const feedbackAggregate=f=>{const a=aggregate(f.aggregate);return consistent(a,(f.reviews||[]).filter(r=>review(r)).length)?a:null;};
  function validateFeedback(feedback){
    if(!feedback||typeof feedback!=='object'||Array.isArray(feedback)||Object.keys(feedback).length>1000)throw Error('Отзывы: до 1000 артикулов');
    for(const [code,f] of Object.entries(feedback)){
      if(!validCode(code)||!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!['aggregate','reviews','source'].includes(k)))throw Error('Повреждены отзывы товара');
      if(f.source!==undefined){const s=f.source;if(!s||typeof s!=='object'||Array.isArray(s)||s.provider!=='hasl'||Object.keys(s).some(k=>!['provider','url','productId','fetchedAt','total','loaded','skipped','incentive','auto','edited'].includes(k))||['auto','edited','incentive'].some(k=>k in s&&typeof s[k]!=='boolean')||['total','loaded','skipped'].some(k=>k in s&&(!Number.isInteger(s[k])||s[k]<0||s[k]>(k==='loaded'?20:10000000))))throw Error('Повреждён источник отзывов');if('url'in s&&(typeof s.url!=='string'||s.url&&!haslURL(s.url)))throw Error('Повреждён адрес источника отзывов');if('productId'in s&&(typeof s.productId!=='string'||!/^[1-9][0-9]{0,17}$/.test(s.productId)))throw Error('Повреждён ID товара источника');if('fetchedAt'in s&&(typeof s.fetchedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/.test(s.fetchedAt)||(!Number.isFinite(Date.parse(s.fetchedAt))||new Date(s.fetchedAt).toISOString().replace('.000Z','+00:00')!==s.fetchedAt)))throw Error('Повреждена дата загрузки отзывов');}
      const a=f.aggregate===undefined?{}:f.aggregate,rows=f.reviews===undefined?[]:f.reviews;
      if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['enabled','value','ratingCount','reviewCount'].includes(k))||'enabled'in a&&typeof a.enabled!=='boolean')throw Error('Повреждён сводный рейтинг');
      for(const k of ['value','ratingCount','reviewCount'])if(k in a&&(typeof a[k]!=='string'||a[k].length>30||a[k]!==''&&!(k==='value'?score(a[k]):number(a[k],10000000,true))))throw Error('Рейтинг: 1–5; количество — целое число 0–10 000 000');
      if(!Array.isArray(rows)||rows.length>20)throw Error('До 20 отзывов на артикул');
      const ids=new Set();
      for(const r of rows){
        if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['id','enabled','author','body','rating','date'].includes(k))||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,70}$/.test(r.id)||['__proto__','constructor','prototype'].includes(r.id)||ids.has(r.id)||'enabled'in r&&typeof r.enabled!=='boolean')throw Error('Повреждён отзыв товара');
        ids.add(r.id);
        for(const [k,max] of [['author',99],['body',5000],['rating',30],['date',10]])if(k in r&&(typeof r[k]!=='string'||r[k].length>max))throw Error('Автор: до 99 символов; отзыв: до 5000 символов');
        if(r.rating&&!score(r.rating)||r.date&&!date(r.date))throw Error('Оценка: 1–5; дата — реальная дата YYYY-MM-DD');
      }
    }
  }
  function shipping(p={}){
    if(p.enabled!==true||!countries.has(p.country)||!number(p.rate,10000000)||!range(p,'handlingMin','handlingMax')||!range(p,'transitMin','transitMax'))return null;
    const value={'@type':'OfferShippingDetails',shippingDestination:{'@type':'DefinedRegion',addressCountry:p.country},shippingRate:{'@type':'MonetaryAmount',value:+p.rate,currency:'RUB'},deliveryTime:{'@type':'ShippingDeliveryTime',handlingTime:{'@type':'QuantitativeValue',minValue:+p.handlingMin,maxValue:+p.handlingMax,unitCode:'DAY'},transitTime:{'@type':'QuantitativeValue',minValue:+p.transitMin,maxValue:+p.transitMax,unitCode:'DAY'}}};
    return {value,label:`Доставка: ${p.country}. Стоимость: ${+p.rate} RUB. Подготовка: ${+p.handlingMin}–${+p.handlingMax} дн. Перевозка: ${+p.transitMin}–${+p.transitMax} дн.`};
  }
  function returns(p={}){
    if(p.enabled!==true||!countries.has(p.country)||!Object.hasOwn(categories,p.category))return null;
    const value={'@type':'MerchantReturnPolicy',applicableCountry:p.country,returnPolicyCategory:'https://schema.org/'+p.category};
    let label=`Возврат: ${p.country}. ${categories[p.category]}`;
    if(p.category==='MerchantReturnFiniteReturnWindow'){if(!number(p.days,3650,true)||+p.days<1)return null;value.merchantReturnDays=+p.days;label+=`: ${+p.days} дн. со дня получения`;}
    if(p.category!=='MerchantReturnNotPermitted'){
      if(p.method){if(!Object.hasOwn(methods,p.method))return null;value.returnMethod='https://schema.org/'+p.method;label+=`. ${methods[p.method]}`;}
      if(p.fees){if(!Object.hasOwn(fees,p.fees))return null;value.returnFees='https://schema.org/'+p.fees;label+=`. ${fees[p.fees]}`;if(p.fees==='ReturnShippingFees'){if(!number(p.amount,10000000)||+p.amount<=0)return null;value.returnShippingFeesAmount={'@type':'MonetaryAmount',value:+p.amount,currency:'RUB'};label+=`: ${+p.amount} RUB`;}}
    }
    return {value,label:label+'.'};
  }
  function validate(project){
    const c=project.commerce;if(c===undefined)return;
    if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['descriptions','shipping','returns','feedback'].includes(k)))throw Error('Повреждены данные товаров Schema.org');
    if(c.feedback!==undefined)validateFeedback(c.feedback);
    const d=c.descriptions===undefined?{}:c.descriptions;if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).length>1000||Object.entries(d).some(([k,v])=>!/^[-\w.]{1,100}$/.test(k)||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>5000))throw Error('Описание товара: до 5000 символов, до 1000 артикулов');
    for(const kind of ['shipping','returns']){
      const p=c[kind]===undefined?{}:c[kind],keys=kind==='shipping'?['enabled','country','rate','handlingMin','handlingMax','transitMin','transitMax']:['enabled','country','category','days','method','fees','amount'];
      if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!keys.includes(k))||('enabled'in p&&typeof p.enabled!=='boolean'))throw Error('Повреждены условия доставки или возврата');
      for(const [k,v] of Object.entries(p)){
        if(k==='enabled')continue;
        if(typeof v!=='string'||v.length>100)throw Error('Неверное значение условия товара');
        if(!v)continue;
        if(k==='country'?!countries.has(v):k==='category'?!Object.hasOwn(categories,v):k==='method'?!Object.hasOwn(methods,v):k==='fees'?!Object.hasOwn(fees,v):!number(v,k==='days'?3650:['rate','amount'].includes(k)?10000000:365,!['rate','amount'].includes(k)))throw Error('Проверьте страну, сумму и сроки условий товара');
      }
      for(const [a,b] of [['handlingMin','handlingMax'],['transitMin','transitMax']])if(p[a]&&p[b]&&+p[a]>+p[b])throw Error('Минимальный срок больше максимального');
    }
  }
  function decorate(doc,root,project){
    const c=project.commerce;if(!c)return;
    for(const card of root.querySelectorAll('.product[data-feed-id],.collection-card[data-feed-id]')){
      const description=c.descriptions?.[card.dataset.feedId],parent=card.querySelector('.product-info')||card;
      if(description?.trim()){const p=doc.createElement('p');p.className='commerce-description';p.dataset.objectSeed='commerce-'+card.dataset.feedId+'-description';p.textContent=description;parent.append(p);}
      const f=c.feedback?.[card.dataset.feedId]||{},a=feedbackAggregate(f),rows=(f.reviews||[]).map(r=>[r,review(r)]).filter(([,v])=>v);
      if((a||rows.length)&&f.source?.url&&f.source.fetchedAt&&haslURL(f.source.url)){
        const note=doc.createElement('p');note.className='commerce-source-note';note.dataset.objectSeed='commerce-'+card.dataset.feedId+'-source';
        const link=doc.createElement('a');link.href=f.source.url;link.textContent='Отзывы ХАСЛ';note.append(link,doc.createTextNode(' · '+f.source.fetchedAt.replace('T',' ').replace('+00:00',' UTC')+(f.source.edited?' · изменено вручную':'')));
        if(f.source.incentive){const span=doc.createElement('span');span.className='commerce-incentive-disclosure';span.textContent=disclosure;note.append(doc.createElement('br'),span);}parent.append(note);
      }
      const feedbackNode=(kind,p,input,id)=>{const n=doc.createElement('p');n.dataset.commerceFeedback=kind;n.dataset.commerceSku=card.dataset.feedId;n.dataset.commerceInput=JSON.stringify(input);if(f.source?.incentive)n.dataset.commerceIncentive='true';n.dataset.objectSeed='commerce-'+card.dataset.feedId+'-'+id;n.textContent=p.label;return n;};
      if(a)parent.append(feedbackNode('aggregate',a,f.aggregate,'aggregate'));
      if(rows.length){const details=doc.createElement('details');details.className='commerce-feedback';details.dataset.objectSeed='commerce-'+card.dataset.feedId+'-reviews';const summary=doc.createElement('summary');summary.textContent='Отзывы о товаре ('+rows.length+')';details.append(summary);for(const [r,v] of rows)details.append(feedbackNode('review',v,r,'review-'+r.id));parent.append(details);}
      const policies=[['shipping',shipping],['returns',returns]].map(([kind,fn])=>[kind,fn(c[kind])]).filter(([,v])=>v);
      if(!policies.length)continue;
      const details=doc.createElement('details');details.className='commerce-conditions';details.dataset.objectSeed='commerce-'+card.dataset.feedId+'-conditions';
      const summary=doc.createElement('summary');summary.textContent='Доставка и возврат';details.append(summary);
      for(const [kind,v] of policies){const p=doc.createElement('p');p.dataset.commercePolicy=kind;p.dataset.commerceInput=JSON.stringify(c[kind]);p.dataset.objectSeed='commerce-'+card.dataset.feedId+'-'+kind;p.textContent=v.label;details.append(p);}parent.append(details);
    }
  }
  function read(card,text){
    const result={},description=text(card.querySelector('.commerce-description'));if(description)result.description=description;
    const reviews=[];
    for(const node of card.querySelectorAll('[data-commerce-feedback]'))try{
      if(node.dataset.commerceSku!==card.dataset.feedId||node.closest('.product,.collection-card')!==card)continue;
      if(node.dataset.commerceIncentive==='true'&&text(card.querySelector('.commerce-incentive-disclosure'))!==disclosure)continue;
      const container=node.closest('.commerce-feedback');if(container&&!text(container.querySelector(':scope > summary')))continue;
      const kind=node.dataset.commerceFeedback,p=JSON.parse(node.dataset.commerceInput);
      validateFeedback({check:kind==='aggregate'?{aggregate:p}:{reviews:[p]}});
      const record=kind==='aggregate'?aggregate(p):kind==='review'?review(p):null;
      if(!record||text(node)!==plain(record.label))continue;
      if(kind==='aggregate')result.aggregateRating=record.value;else reviews.push(record.value);
    }catch{/* Incomplete, hidden, deleted or edited feedback is not schema evidence. */}
    if(result.aggregateRating&&!consistent({value:result.aggregateRating},reviews.length))delete result.aggregateRating;
    // Multiple reviews need a real, visible aggregate; never calculate one from a selected excerpt.
    if(reviews.length===1||reviews.length>1&&result.aggregateRating)result.review=reviews;
    for(const [kind,fn,prop] of [['shipping',shipping,'shippingDetails'],['returns',returns,'hasMerchantReturnPolicy']]){
      const node=card.querySelector('[data-commerce-policy="'+kind+'"]');if(!node)continue;
      try{const p=JSON.parse(node.dataset.commerceInput),c={[kind]:p};validate({commerce:c});const policy=fn(p);if(policy&&text(node)===policy.label)result[prop]=policy.value;}catch{/* Malformed or edited visible conditions must never produce stale policy markup. */}
    }return result;
  }
  let selected='';
  const jobs=[],pending=new Set(),attempts=new Map(),messages=new Map();let running=0,autoScope=-1;
  const jobKey=(scope,code)=>scope+':'+code;
  const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
  const signature=v=>JSON.stringify(ordered(v));
  function renderImport(f){return `<div class="notice" id="commerce-import"><h3>Загрузка с сайта ХАСЛ</h3><button type="button" data-feedback-load>Загрузить с ХАСЛ по артикулу</button><label class="checkline section-top"><input type="checkbox" data-feedback-auto ${f.source?.auto?'checked':''}>Автозагрузка при открытии страницы</label><p class="muted">Загрузка заменяет отзывы и рейтинг выбранного артикула. Можно отменить штатным «Шаг назад». Ручная правка полей отзыва или рейтинга выключает автозагрузку. Источник публикует число отзывов; число оценок не подставляется.</p><p data-feedback-import-status role="status" aria-live="polite"></p><a data-feedback-source-link target="_blank" rel="noopener" hidden>Открыть источник ХАСЛ</a></div>`;}
  function importStatus(){
    if(!state||!window.SiteBuilder)return;const f=state.commerce?.feedback?.[selected]||{},s=f.source||{},key=jobKey(SiteBuilder.scope(),selected),n=document.querySelector('[data-feedback-import-status]'),button=document.querySelector('[data-feedback-load]');
    if(button)button.disabled=pending.has(key);const auto=document.querySelector('[data-feedback-auto]');if(auto)auto.checked=!!s.auto;
    if(n)n.textContent=pending.has(key)?'Загружаем отзывы и рейтинг выбранного артикула…':messages.get(key)||(s.fetchedAt?`${s.edited?'Данные изменены вручную. Автозагрузка выключена. ':'ХАСЛ: '+s.total+' отзывов, загружено '+s.loaded+'. '}${s.total===0?'Отзывы и рейтинг этого артикула не опубликованы. ':''}${s.skipped?'Пропущено неполных отзывов: '+s.skipped+'. ':''}${s.total>s.loaded?'Показаны первые подходящие отзывы (до 20); число отзывов взято из источника целиком. ':''}${s.total>0&&!aggregate(f.aggregate)?'Средняя оценка не предоставлена источником. ':''}Проверено: ${s.fetchedAt.replace('T',' ').replace('+00:00',' UTC')}`:'Загрузка доступна для артикулов из каталога ХАСЛ. Пока источник не загружен.');
    const link=document.querySelector('[data-feedback-source-link]');if(link){link.hidden=!haslURL(s.url||'');if(!link.hidden)link.href=s.url;}
    if(n&&s.edited&&!pending.has(key)&&!messages.has(key))n.textContent='Данные изменены вручную. Автозагрузка выключена.'+(s.fetchedAt?' Дата прежней загрузки: '+s.fetchedAt.replace('T',' ').replace('+00:00',' UTC'):' Загрузка источника ещё не была завершена.');
  }
  function enqueueImport(code,force=false){
    const scope=SiteBuilder.scope(),key=jobKey(scope,code);if(pending.has(key))return;
    const documentState=state,before=signature(state.commerce?.feedback?.[code]||{});
    pending.add(key);attempts.set(key,Date.now());messages.delete(key);jobs.push({scope,key,code,force,documentState,before});importStatus();drainImports();
  }
  function drainImports(){
    while(running<2&&jobs.length){const job=jobs.shift();running++;runImport(job).finally(()=>{running--;pending.delete(job.key);importStatus();drainImports();});}
  }
  async function runImport(job){
    const current=()=>state===job.documentState&&SiteBuilder.scope()===job.scope;
    const unchanged=()=>current()&&signature(state.commerce?.feedback?.[job.code]||{})===job.before;
    if(!unchanged())return;
    try{
      const response=await api('product-feedback?code='+encodeURIComponent(job.code)+(job.force?'&refresh=1':''));
      if(!current())return;
      if(!unchanged()){messages.set(job.key,'За время загрузки появились правки. Ответ не применён; загрузите повторно.');return;}
      if(response.code!==job.code||!response.feedback?.source||response.feedback.source.provider!=='hasl')throw Error('Источник вернул другой артикул или неполные данные.');
      const feedback=structuredClone(response.feedback);feedback.source.auto=!!state.commerce?.feedback?.[job.code]?.source?.auto;feedback.source.edited=false;validateFeedback({[job.code]:feedback});
      const c=structuredClone(state.commerce||{});(c.feedback||={})[job.code]=feedback;
      if(new Blob([JSON.stringify({...state,commerce:c})]).size>4900000)throw Error('С отзывами страница превысит лимит 5 МБ. Разделите товары по страницам. Прежние данные сохранены.');
      if(signature(feedback)!==job.before){state.commerce=c;SiteDesigner.beginGesture();changed();}
      if(tab==='commerce'&&selected===job.code){
        const inspector=document.getElementById('inspector'),scroll=inspector.scrollTop,active=document.activeElement,desc=active?.dataset.commerceDescription,setting=active?.dataset.commerce,caret=typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
        window.render();inspector.scrollTop=scroll;const restore=desc?document.querySelector('[data-commerce-description="'+CSS.escape(desc)+'"]'):setting?document.querySelector('[data-commerce="'+CSS.escape(setting)+'"]'):null;if(restore){restore.focus({preventScroll:true});if(caret)restore.setSelectionRange(...caret);}
      }
    }catch(error){if(current()){messages.set(job.key,error.message||'ХАСЛ недоступен. Прежние отзывы и рейтинг сохранены.');if(tab==='commerce'&&selected===job.code)notify(messages.get(job.key));}}
  }
  function scheduleAuto(){
    if(!state||!window.SiteBuilder)return;const scope=SiteBuilder.scope();if(autoScope!==scope){autoScope=scope;attempts.clear();messages.clear();}
    const present=new Set([...Object.values(state.blocks||{}).flatMap(b=>b.resolved||[]),...(state.layout||[]).flatMap(b=>b.products?.resolved||[])]);
    for(const [code,f] of Object.entries(state.commerce?.feedback||{}))if(f.source?.auto&&present.has(code)&&Date.now()-(attempts.get(jobKey(scope,code))||0)>300000)enqueueImport(code);
  }
  document.addEventListener('click',ev=>{if(ev.target.closest('[data-feedback-load]')&&selected)enqueueImport(selected,true);});
  document.addEventListener('change',ev=>{
    if(!ev.target.hasAttribute('data-feedback-auto')||!state||!selected)return;
    const c=structuredClone(state.commerce||{}),f=(c.feedback||={})[selected]||={reviews:[]};f.source||={provider:'hasl',edited:false};f.source.auto=ev.target.checked;validate({commerce:c});state.commerce=c;changed();messages.delete(jobKey(SiteBuilder.scope(),selected));
    if(f.source.auto)enqueueImport(selected);importStatus();
  });
  function renderFeedback(){
    if(!selected)return '';
    const f=state.commerce?.feedback?.[selected]||{},a=f.aggregate||{},rows=f.reviews||[];
    const input=(label,key,value,type='text',attrs='')=>field(label,value||'',`data-feedback="aggregate" data-feedback-key="${key}" ${attrs}`,type);
    return `<details class="text-section" id="commerce-feedback-settings" open><summary>Отзывы и рейтинг товара · ${E(selected)}</summary><p class="muted">Только реальные отзывы покупателей об этом артикуле на вашем сайте. Отзывы магазина сюда не переносятся. Оценки — по шкале от 1 до 5.</p>${renderImport(f)}<h3>Сводный рейтинг</h3><label class="checkline"><input type="checkbox" data-feedback="aggregate" data-feedback-key="enabled" ${a.enabled?'checked':''}>Публиковать сводный рейтинг</label>${input('Средняя оценка (1–5)','value',a.value,'number','min="1" max="5" step=".01"')}${input('Всего оценок (если известно)','ratingCount',a.ratingCount,'number','min="0" max="10000000" step="1"')}${input('Всего отзывов (если известно)','reviewCount',a.reviewCount,'number','min="0" max="10000000" step="1"')}<p class="muted">Укажите фактические среднее и количество по данным вашего сайта. Подборка отзывов ниже не используется для расчёта этих значений. Нужно хотя бы одно известное положительное количество: оценок или отзывов.</p><p class="notice" data-feedback-status="aggregate"></p><h3>Отзывы покупателей</h3><button type="button" data-feedback-add ${rows.length>=20?'disabled':''}>Добавить реальный отзыв</button><p class="muted">До 20 отзывов на артикул. Для нескольких отзывов в Schema.org заполните сводный рейтинг. Дата необязательна и не подставляется автоматически.</p>${rows.map((r,i)=>`<details class="edit-card" data-feedback-card="${E(r.id)}" open><summary>Отзыв ${i+1}${r.author?' · '+E(r.author):''}</summary><label class="checkline"><input type="checkbox" data-feedback="${E(r.id)}" data-feedback-key="enabled" ${r.enabled?'checked':''}>Публиковать этот отзыв</label>${[['Имя автора','author','text','maxlength="99"'],['Текст отзыва','body','textarea','maxlength="5000"'],['Оценка автора (1–5)','rating','number','min="1" max="5" step=".01"'],['Дата публикации (необязательно)','date','date','']].map(([label,key,type,attrs])=>field(label,r[key]||'',`data-feedback="${E(r.id)}" data-feedback-key="${key}" ${attrs}`,type)).join('')}<p class="notice" data-feedback-status="${E(r.id)}"></p><button type="button" class="small danger" data-feedback-remove="${E(r.id)}">Удалить отзыв ${i+1}</button></details>`).join('')}<p class="notice" data-feedback-schema-status></p><a href="/instructions/#site-product-reviews" target="_blank" rel="noopener">Инструкция: реальные отзывы и рейтинг</a></details>`;
  }
  function feedbackStatus(){
    const f=state.commerce?.feedback?.[selected]||{},a=feedbackAggregate(f),rows=f.reviews||[];
    for(const [id,p,ready] of [['aggregate',f.aggregate||{},a],...rows.map(r=>[r.id,r,review(r)])]){const n=document.querySelector('[data-feedback-status="'+CSS.escape(id)+'"]');if(n)n.textContent=!p.enabled?'Публикация выключена.':ready?'Готово: данные видны в карточке.':'Черновик: заполните '+(id==='aggregate'?'среднюю оценку и известное количество оценок или отзывов больше нуля.':'автора, текст и оценку; проверьте дату.');}
    if(aggregate(f.aggregate)&&!a){const n=document.querySelector('[data-feedback-status=aggregate]');if(n)n.textContent='Черновик: количество оценок и отзывов не может быть меньше числа опубликованных отзывов ниже.';}
    const ready=rows.filter(r=>review(r)).length,n=document.querySelector('[data-feedback-schema-status]');if(n)n.textContent=ready>1&&!a?'Отзывы видны покупателю. Для разметки нескольких отзывов нужен реальный сводный рейтинг.':'Schema.org включает только полностью заполненные, опубликованные и видимые данные. Скрытые или изменённые на холсте сведения исключаются.';
  }
  function render(){
    const c=state.commerce||{},codes=[...new Set([...Object.values(state.blocks).flatMap(b=>b.resolved||[]),...(state.layout||[]).flatMap(b=>b.products?.resolved||[]),...Object.keys(c.descriptions||{}),...Object.keys(c.feedback||{})])];
    if(!codes.includes(selected))selected=codes[0]||'';
    const select=(label,key,value,options)=>`<label class="field"><span>${E(label)}</span><select data-commerce="${key}"><option value="">Не указано</option>${Object.entries(options).map(([v,n])=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(n)}</option>`).join('')}</select></label>`;
    const input=(label,kind,key,max=365)=>field(label,c[kind]?.[key]||'',`data-commerce="${kind}.${key}" min="0" max="${max}" step="${['rate','amount'].includes(key)?'.01':'1'}"`,'number');
    const country=kind=>field('Страна — код ISO (RU, KZ, BY…)',c[kind]?.country||'',`data-commerce="${kind}.country" maxlength="2" placeholder="RU" autocapitalize="characters"`,'text');
    return `<h2>Данные товаров · Schema.org</h2><p class="intro">Укажите реальные сведения. Описание появится в карточке, условия — в раскрываемом блоке «Доставка и возврат».</p><h3>Описание по артикулу</h3>${codes.length?`<label class="field"><span>Товар</span><select id="commerce-product">${codes.map(code=>`<option value="${E(code)}" ${code===selected?'selected':''}>${E(code+' · '+(products[code]?.name||'Сохранённое описание'))}</option>`).join('')}</select></label>${field('Описание товара',c.descriptions?.[selected]||'',`data-commerce-description="${E(selected)}" maxlength="5000" placeholder="Материал, особенности, комплектация…"`)}`:'<p>Сначала добавьте артикулы в разделе «Товары».</p>'}<p class="muted">Описание общее для этого артикула во всех секциях этой страницы. Данные каталога не перезаписываются.</p>${renderFeedback()}${['shipping','returns'].map(kind=>{const p=c[kind]||{},valid=(kind==='shipping'?shipping:returns)(p);return `<details class="text-section" open><summary>${kind==='shipping'?'Доставка':'Возврат'}</summary><label class="checkline"><input type="checkbox" data-commerce="${kind}.enabled" ${p.enabled?'checked':''}>Одни условия для всех товаров страницы</label><p class="muted">Включайте только если условия действительно одинаковы для всех показанных товаров. Пустые поля не заполняются автоматически.</p>${country(kind)}${kind==='shipping'?input('Стоимость доставки, RUB (0 = бесплатно)',kind,'rate',10000000)+`<div class="commerce-ranges">${input('Подготовка: от, дней',kind,'handlingMin')}${input('Подготовка: до, дней',kind,'handlingMax')}${input('Перевозка: от, дней',kind,'transitMin')}${input('Перевозка: до, дней',kind,'transitMax')}</div>`:select('Правило возврата','returns.category',p.category,categories)+input('Срок со дня получения, дней',kind,'days',3650)+select('Способ возврата','returns.method',p.method,methods)+select('Оплата возврата','returns.fees',p.fees,fees)+input('Стоимость пересылки магазину, RUB',kind,'amount',10000000)}<p class="notice" data-commerce-status="${kind}">${!p.enabled?'Не включено в карточки и Schema.org.':valid?'Готово: условия видны в карточках и включены в Schema.org.':'Черновик: заполните обязательные данные. Неполные условия не публикуются в карточках и Schema.org.'}</p></details>`;}).join('')}<p class="muted">Доставка: нужны страна, стоимость и оба диапазона сроков. Возврат: страна, правило и срок для ограниченного периода; при удержании стоимости пересылки — сумма больше нуля. Для запрета возврата способ и оплата не используются. Валюта каталога — RUB. Разные тарифы, регионы и исключения по товарам здесь пока не задаются.</p><a href="/instructions/#site-commerce" target="_blank" rel="noopener">Инструкция: данные товаров и Schema.org</a>`;
  }
  document.addEventListener('change',ev=>{if(ev.target.id==='commerce-product'){selected=ev.target.value;window.render();}});
  document.addEventListener('click',ev=>{
    const n=ev.target.closest('[data-feedback-add],[data-feedback-remove]');if(!n||!state||!selected)return;
    const c=structuredClone(state.commerce||{}),f=(c.feedback||={})[selected]||={reviews:[]};f.reviews||=[];
    if(n.hasAttribute('data-feedback-add')){if(f.reviews.length>=20)return;f.reviews.push({id:crypto.randomUUID(),enabled:true,author:'',body:'',rating:'',date:''});}
    else f.reviews=f.reviews.filter(r=>r.id!==n.dataset.feedbackRemove);
    if(f.source){f.source.auto=false;f.source.edited=true;}validate({commerce:c});state.commerce=c;SiteDesigner.beginGesture();changed();window.render();
    if(n.hasAttribute('data-feedback-add'))document.querySelector('[data-feedback="'+CSS.escape(f.reviews.at(-1).id)+'"][data-feedback-key="author"]')?.focus();
    else document.querySelector('#commerce-feedback-settings > summary')?.focus();
  });
  document.addEventListener('input',ev=>{
    const n=ev.target;if(!state||!n.dataset.feedback||!selected)return;
    const c=structuredClone(state.commerce||{}),f=(c.feedback||={})[selected]||={reviews:[]},id=n.dataset.feedback,key=n.dataset.feedbackKey;
    const record=id==='aggregate'?(f.aggregate||={}):f.reviews?.find(r=>r.id===id);if(!record)return;
    record[key]=n.type==='checkbox'?n.checked:n.value;if(f.source){f.source.auto=false;f.source.edited=true;}
    try{validate({commerce:c});n.setCustomValidity('');n.removeAttribute('aria-invalid');}catch(e){n.setCustomValidity(e.message);n.setAttribute('aria-invalid','true');feedbackError(n,e.message);return;}
    if(!n.checkValidity()){feedbackError(n,'Проверьте значение и допустимый диапазон.');return;}
    feedbackError(n,'');state.commerce=c;changed();feedbackStatus();importStatus();
  });
  function feedbackError(n,message){
    const id='feedback-error-'+n.dataset.feedback+'-'+n.dataset.feedbackKey;
    let error=document.getElementById(id);if(!message){error?.remove();n.removeAttribute('aria-describedby');return;}
    if(!error){error=document.createElement('small');error.id=id;error.className='notice error';error.setAttribute('role','alert');n.after(error);}
    error.textContent=message+' Последнее корректное значение сохранено.';n.setAttribute('aria-describedby',id);
  }
  document.addEventListener('input',ev=>{
    const n=ev.target;if(!state||(!n.dataset.commerce&&!n.dataset.commerceDescription))return;
    const c=structuredClone(state.commerce||{});let key=n.dataset.commerce;
    if(n.dataset.commerceDescription)(c.descriptions||={})[n.dataset.commerceDescription]=n.value;
    else{const [kind,k]=key.split('.');(c[kind]||={})[k]=n.type==='checkbox'?n.checked:k==='country'?n.value.toUpperCase():n.value;}
    try{validate({commerce:c});n.setCustomValidity('');}catch(e){n.setCustomValidity(e.message);return;}
    if(n.type==='number'&&!n.checkValidity())return;
    state.commerce=c;changed();
    for(const [kind,fn] of [['shipping',shipping],['returns',returns]]){const status=document.querySelector('[data-commerce-status="'+kind+'"]');if(status)status.textContent=!c[kind]?.enabled?'Не включено в карточки и Schema.org.':fn(c[kind])?'Готово: условия видны в карточках и включены в Schema.org.':'Черновик: заполните обязательные данные. Неполные условия не публикуются в карточках и Schema.org.';}
  });
  document.addEventListener('change',ev=>{if(ev.target.dataset.commerce&&!ev.target.checkValidity())ev.target.reportValidity();});
  return {validate,decorate,read,render,shipping,returns,aggregate,review,afterRender:()=>{feedbackStatus();importStatus();scheduleAuto();}};
})();
