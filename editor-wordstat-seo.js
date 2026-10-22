/* Read-only phrase discovery and locations over the existing material. */
(()=>{
 'use strict';
 if(window.WordstatSeo)return;
 const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/gu,' ').trim();
 const excluded='script,style,noscript,template,[data-feedback-ui],[data-wordstat-ui]';
 const stop=new Set('и в во на с со к ко от до из за по под над при о об у а но или это эти этот того для не как что где какой какие когда чем чтобы если мы вы он она они их его ее уже еще все без после перед между также только есть быть'.split(' '));
 function blocks(root){
  const site=root.classList.contains('hasl-home-embed'),selector='h1,h2,h3,h4,p,li,td,figcaption'+(site?',.product-title,.faq-q,.faq-a,.side-copy>strong':'');
  const text=n=>{if(!site)return n.textContent||'';const copy=n.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith(' '));copy.querySelectorAll('.faq-sign').forEach(sign=>sign.remove());return copy.textContent||'';};
  return [...root.querySelectorAll(selector)].filter(n=>!n.closest(excluded)&&!n.querySelector(selector)&&(!site||(!n.closest('[hidden]')&&(!n.closest('section')||root.ownerDocument.defaultView.getComputedStyle(n.closest('section')).display!=='none')))).map(n=>({node:n,tag:n.tagName.toLowerCase(),text:text(n).replace(/\[%[\s\S]*?%\]/g,' ').replace(/\s+/gu,' ').trim()})).filter(b=>b.text);
 }
 function discover(items,limit=12){
  if(items.reduce((n,b)=>n+b.text.length,0)>200000)throw Error('Материал превышает 200 000 знаков. Проверяйте его по частям.');
  const found=new Map();
  for(const b of items){
   const words=norm(b.text).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[];
   for(let i=0;i<words.length;i++)for(let size=2;size<=5&&i+size<=words.length;size++){
    const span=words.slice(i,i+size),phrase=span.join(' '),meaning=span.filter(w=>!stop.has(w)&&w.length>2&&!/^\d+$/.test(w));
    if(meaning.length<2||stop.has(span.at(-1))||(stop.has(span[0])&&!['как','какие','какой','где','когда'].includes(span[0]))||phrase.length>120||!norm(b.text).includes(phrase))continue;
    const score=(b.tag==='h1'?30:b.tag==='h2'?18:b.tag==='h3'?10:1)+meaning.length+(size===3?3:0);
    const old=found.get(phrase)||{phrase,score:0,occurrences:0};old.score+=score;old.occurrences++;found.set(phrase,old);
   }
  }
  const chosen=[];
  for(const item of [...found.values()].sort((a,b)=>b.score-a.score||b.occurrences-a.occurrences||a.phrase.localeCompare(b.phrase,'ru'))){
   // Near-identical nested n-grams should not consume the complete API budget.
   if(chosen.some(c=>c.phrase.includes(item.phrase)||item.phrase.includes(c.phrase)))continue;
   chosen.push(item);if(chosen.length>=limit)break;
  }
  return chosen;
 }
 function textIndex(root){
  const indexed=[];
  const doc=root.ownerDocument;
  for(const block of blocks(root)){
   const walker=doc.createTreeWalker(block.node,root.classList.contains('hasl-home-embed')?5:4),map=[];let value='',node;
   while((node=walker.nextNode())){
    if(node.nodeType===1){if(node.tagName==='BR'&&value&&!value.endsWith(' ')){value+=' ';map.push({node:null,start:0,end:0});}continue;}
    if(node.parentElement.closest(excluded))continue;
    let offset=0;
    for(const char of node.data){
     const text=char.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
     for(const c of text){
      const next=/\s/u.test(c)?' ':c;
      if(next===' '&&(!value||value.endsWith(' ')))continue;
      for(let k=0;k<next.length;k++)map.push({node,start:offset,end:offset+char.length});
      value+=next;
     }
     offset+=char.length;
    }
   }
   value=value.replace(/\[%[\s\S]*?%\]/g,m=>' '.repeat(m.length));
   indexed.push({node:block.node,value,map});
  }
  return indexed;
 }
 function ranges(root,phrase,indexed=textIndex(root)){
  const target=norm(phrase),result=[];if(!target)return result;
  const doc=root.ownerDocument;
  for(const {value,map} of indexed){
   for(let start=0;(start=value.indexOf(target,start))>=0;start+=target.length){
    if(/[\p{L}\p{N}]/u.test(value[start-1]||'')||/[\p{L}\p{N}]/u.test(value[start+target.length]||''))continue;
    const first=map[start],last=map[start+target.length-1];if(!first||!last)continue;
    const range=doc.createRange();range.setStart(first.node,first.start);range.setEnd(last.node,last.end);result.push(range);
   }
  }
  return result;
 }
 function briefPhrases(brief={}){
  let raw=brief.keywords??brief.searchQueries??brief.queries??'';
  if(Array.isArray(raw))raw=raw.filter(v=>typeof v==='string').join('\n');
  if(!raw&&typeof brief.points==='string')raw=brief.points.split('\n').filter(line=>/^\s*(?:поисковые запросы|ключевые слова|основной запрос|вторичные запросы)\s*:/iu.test(line)).map(line=>line.slice(line.indexOf(':')+1)).join('\n');
  return [...new Set((typeof raw==='string'?raw:'').split(/[\n;,]+/u).map(s=>s.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/u,'').trim()).filter(s=>s&&s.length<=400&&!/\[%|https?:\/\//i.test(s)))].slice(0,200);
 }
 const controllers=new WeakMap(),live=new Set();let editorApplied=[],editorScope=null,editorTimer=null,previewRoot=null;
 function control(root){
  if(controllers.has(root))return controllers.get(root);
  const doc=root.ownerDocument,win=doc.defaultView,abort=new win.AbortController();let research=[],brief=[],entries=[],tip=null,frame=0,disposed=false,rowStamp='';
  const style=doc.createElement('style');style.dataset.wordstatUi='style';style.textContent='::highlight(wordstat-phrases){background:#ffe08a;color:inherit}::highlight(brief-keywords){background:#c8efd3;color:inherit}.wordstat-phrase-tip{position:fixed;z-index:2147483646;max-width:min(340px,calc(100vw - 24px));padding:12px 14px;border:1px solid #d9dde3;border-radius:8px;background:#fff;color:#20242b;box-shadow:0 6px 22px #0003;font:13px/1.5 Arial,sans-serif;pointer-events:none;overflow-wrap:break-word}.wordstat-phrase-tip strong{display:block;font-size:14px;margin-bottom:4px}.wordstat-phrase-tip p{margin:3px 0}';doc.head.append(style);
  function hide(){if(tip)tip.hidden=true;}
  function removePaint(){win.CSS?.highlights?.delete('wordstat-phrases');win.CSS?.highlights?.delete('brief-keywords');doc.querySelectorAll('[data-wordstat-ui="highlight"]').forEach(n=>n.remove());}
  function paint(){
   if(disposed)return;removePaint();hide();entries=[];const indexed=textIndex(root);
   for(const [kind,rows] of [['wordstat',research],['brief',brief]]){
    const all=[];
    for(const row of rows){const found=ranges(root,row.phrase,indexed);for(const range of found){all.push(range);const block=indexed.find(b=>b.node.contains(range.startContainer))?.node;entries.push({range,row,kind,block});}}
    if(!all.length)continue;
    if(win.CSS?.highlights&&win.Highlight){const highlight=new win.Highlight(...all);highlight.priority=kind==='brief'?2:1;win.CSS.highlights.set(kind==='brief'?'brief-keywords':'wordstat-phrases',highlight);}
    else{const clip=root.getBoundingClientRect();for(const range of all)for(const r of range.getClientRects()){const left=Math.max(0,clip.left,r.left),top=Math.max(0,clip.top,r.top),right=Math.min(win.innerWidth,clip.right,r.right),bottom=Math.min(win.innerHeight,clip.bottom,r.bottom);if(right<=left||bottom<=top)continue;const node=doc.createElement('div');node.dataset.wordstatUi='highlight';node.style.cssText=`position:absolute;pointer-events:none;z-index:20;background:${kind==='brief'?'#72d59666':'#ffd94d66'};left:${left+win.scrollX}px;top:${top+win.scrollY}px;width:${right-left}px;height:${bottom-top}px`;doc.body.append(node);}}
   }
  }
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(()=>{frame=0;paint();});};
  function show(event){
   if(!entries.length||!root.contains(event.target)||event.target.closest('button,input,textarea,select')){hide();return;}
   const found=entries.filter(item=>item.block?.contains(event.target)&&[...item.range.getClientRects()].some(r=>event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)).sort((a,b)=>Number(b.kind==='brief')-Number(a.kind==='brief'));
   if(!found.length){hide();return;}
   const first=found[0],stats=found.find(e=>e.kind==='wordstat'&&norm(e.row.phrase)===norm(first.row.phrase))||found.find(e=>e.kind==='wordstat');
   if(!tip){tip=doc.createElement('div');tip.className='wordstat-phrase-tip';tip.dataset.wordstatUi='tooltip';tip.setAttribute('role','tooltip');doc.body.append(tip);}
   tip.replaceChildren();const title=doc.createElement('strong');title.textContent=first.row.phrase;tip.append(title);
   function line(text){const p=doc.createElement('p');p.textContent=text;tip.append(p);}
   if(first.kind==='brief')line('Поисковый запрос из ТЗ');
   if(stats){if(norm(stats.row.phrase)!==norm(first.row.phrase))line('Запрос Wordstat: '+stats.row.phrase);line('Wordstat · '+stats.row.label+' · '+BigInt(stats.row.count).toLocaleString('ru-RU')+' запросов / 30 дней');line(stats.row.context||'Все регионы · Все устройства');}
   else line('Частотность не проверялась');
   tip.hidden=false;tip.style.left=Math.max(12,Math.min(event.clientX+12,win.innerWidth-tip.offsetWidth-12))+'px';tip.style.top=Math.max(12,Math.min(event.clientY+16,win.innerHeight-tip.offsetHeight-12))+'px';
  }
  const observer=new win.MutationObserver(records=>{if(records.some(record=>{const element=record.target.nodeType===1?record.target:record.target.parentElement;if(element?.closest('[data-wordstat-ui]'))return false;return record.type!=='childList'||[...record.addedNodes,...record.removedNodes].some(n=>n.nodeType!==1||!n.hasAttribute('data-wordstat-ui'));}))schedule();});observer.observe(root,{subtree:true,childList:true,characterData:true});
  doc.addEventListener('pointermove',show,{signal:abort.signal});doc.addEventListener('pointerdown',show,{signal:abort.signal});doc.addEventListener('keydown',event=>{if(event.key==='Escape')hide();},{signal:abort.signal});win.addEventListener('resize',schedule,{signal:abort.signal});doc.addEventListener('scroll',()=>{hide();if(!win.CSS?.highlights)schedule();},{capture:true,signal:abort.signal});
  const api={set(rows,keywords){const next=JSON.stringify([rows,keywords]);if(next!==rowStamp){rowStamp=next;research=rows;brief=keywords.map(phrase=>({phrase}));paint();}return {phrases:new Set(entries.filter(e=>e.kind==='wordstat').map(e=>norm(e.row.phrase))).size,occurrences:entries.filter(e=>e.kind==='wordstat').length};},clear(){research=[];rowStamp='';paint();},dispose(){disposed=true;observer.disconnect();abort.abort();win.cancelAnimationFrame(frame);removePaint();tip?.remove();style.remove();controllers.delete(root);live.delete(api);}};
  controllers.set(root,api);live.add(api);return api;
 }
 function editorIdentity(){return typeof articleSaveEpoch==='number'?JSON.stringify([articleSaveEpoch,typeof currentId==='string'?currentId:'',typeof ACTIVE_EDITOR==='object'?ACTIVE_EDITOR.key:'']):JSON.stringify(['email',typeof emailDocumentEpoch==='number'?emailDocumentEpoch:0]);}
 function readBrief(){return typeof articleBrief==='object'?articleBrief:window.emailImportState?.editorBrief||{};}
 function refreshEditor(){
  const root=document.getElementById('canvas');if(!root)return;
  const identity=editorIdentity();if(editorScope!==identity){const previous=editorScope;editorScope=identity;editorApplied=[];if(previous!==null)document.dispatchEvent(new CustomEvent('wordstat:scope-changed'));}
  const keywords=briefPhrases(readBrief());control(root).set(editorApplied,keywords);
  const preview=document.getElementById('preview')?.contentDocument?.querySelector('article');
  if(previewRoot&&previewRoot!==preview)controllers.get(previewRoot)?.dispose();previewRoot=preview;
  if(preview)control(preview).set(editorApplied,keywords);
 }
 function clear(){editorApplied=[];for(const item of live)item.clear();}
 function apply(root,rows,{jump=false}={}){
  rows=rows.slice(0,200).map(row=>({...row,phrase:String(row.phrase),count:/^\d+$/.test(String(row.count))?String(row.count):'0',label:row.label||'Частотность'}));
  const canvas=document.getElementById('canvas');let result;
  if(canvas&&(root===canvas||root===document.getElementById('preview')?.contentDocument?.querySelector('article'))){editorScope=editorIdentity();editorApplied=rows;refreshEditor();result=control(root).set(rows,briefPhrases(readBrief()));}
  else result=control(root).set(rows,briefPhrases(window.__WORDSTAT_BRIEF__||{}));
  if(jump){const first=rows.flatMap(row=>ranges(root,row.phrase)).at(0);first?.startContainer.parentElement.scrollIntoView({block:'center',behavior:'auto'});}
  return result;
 }
 function locate(root,phrase){const result=apply(root,[{phrase,count:'0',label:'Частотность не проверялась'}],{jump:true});if(!result.occurrences)throw Error('Фраза не найдена в текущем тексте. Повторите анализ.');return result.occurrences;}
 function installFrame(){
  const root=()=>document.querySelector('article')||document.body;
  control(root()).set([],briefPhrases(window.__WORDSTAT_BRIEF__||{}));
  addEventListener('message',event=>{
   const data=event.data;if(event.source!==parent||data?.channel!=='wordstat-seo'||typeof data.id!=='string')return;
   if(data.type==='clear'){clear();return;}
   const items=blocks(root()).map(({tag,text})=>({tag,text})),signature=JSON.stringify(items);
   if(data.type==='snapshot')parent.postMessage({channel:'wordstat-seo',type:'snapshot',id:data.id,blocks:items,signature},'*');
   if(data.type==='apply'){
    let result={},error='';try{if(signature!==data.signature||!Array.isArray(data.rows)||data.rows.length>200)throw Error('Предпросмотр изменился. Повторите анализ.');result=apply(root(),data.rows,{jump:!!data.jump});}catch(e){error=e.message;}
    parent.postMessage({channel:'wordstat-seo',type:'apply',id:data.id,...result,error},'*');
   }
   if(data.type==='locate'){
    let count=0,error='';try{if(signature!==data.signature)throw Error('Предпросмотр изменился. Повторите анализ.');count=locate(root(),data.phrase);}catch(e){error=e.message;}
    parent.postMessage({channel:'wordstat-seo',type:'locate',id:data.id,count,error},'*');
   }
  });
 }
 function previewAdapter(){
  const frames=()=>[...document.querySelectorAll('#review-frame,#review-phone-frame')],frame=()=>frames().find(f=>f.getBoundingClientRect().width>0)||frames()[0];
  function request(type,payload={},chosen=frame()){return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),target=chosen?.contentWindow;if(!target){reject(Error('Предпросмотр ещё не готов.'));return;}
   const send=()=>target.postMessage({channel:'wordstat-seo',type,id,...payload},'*');
   const repeat=type==='snapshot'?setInterval(send,200):null;
   const timer=setTimeout(()=>{clearInterval(repeat);removeEventListener('message',receive);reject(Error('Предпросмотр не ответил. Обновите страницу.'));},15000);
   function receive(event){if(event.source!==target||event.data?.channel!=='wordstat-seo'||event.data.id!==id||event.data.type!==type)return;clearTimeout(timer);clearInterval(repeat);removeEventListener('message',receive);event.data.error?reject(Error(event.data.error)):resolve(event.data);}
   addEventListener('message',receive);send();
  });}
  return {snapshot:()=>request('snapshot'),apply:async(rows,signature,jump=false)=>{const active=frame(),result=await request('apply',{rows,signature,jump},active);for(const other of frames().filter(f=>f!==active)){request('apply',{rows,signature,jump:false},other).catch(()=>{});}return result;},locate:async(phrase,signature)=>{const result=await request('locate',{phrase,signature});return result.count;},clear:()=>frames().forEach(f=>f.contentWindow?.postMessage({channel:'wordstat-seo',type:'clear',id:crypto.randomUUID()},'*'))};
 }
 window.WordstatSeo={norm,blocks,discover,ranges,locate,apply,clear,briefPhrases,refreshEditor,installFrame,previewAdapter,dispose:root=>controllers.get(root)?.dispose()};
 if(document.getElementById('canvas')){refreshEditor();editorTimer=setInterval(refreshEditor,500);document.getElementById('preview')?.addEventListener('load',refreshEditor);addEventListener('pagehide',event=>{if(event.persisted)return;clearInterval(editorTimer);for(const item of [...live])item.dispose();});}
})();
