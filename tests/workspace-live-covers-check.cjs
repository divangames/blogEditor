const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const base='https://news.outmax-office.ru';
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:false});
 try{
 const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password},viewport:{width:1440,height:1000}});
 assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());
 await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.fulfill({status:503,json:{error:'QA: server writes blocked'}}));
 await context.route('**/editor-api/notisend/**',route=>route.fulfill({json:{connected:false,items:[]}}));
 const lists={};
 for(const [type,url] of Object.entries({outmax:'/drafts?brand=outmax',hasl:'/drafts?brand=hasl',email:'/email-projects',site:'/site-builder/projects'})){
  const r=await context.request.get(base+'/editor-api'+url);assert.ok(r.ok(),type+' list '+r.status());const d=await r.json();lists[type]=Array.isArray(d)?d:d.items||[];
 }
 const p=await context.newPage();p.on('dialog',d=>d.accept());
 await p.goto(base+'/');await p.waitForFunction(()=>document.querySelector('#recent .work,#recent .empty'));
 const content=await (await context.request.get(base+'/editor-api/site-builder/content')).json();
 const report={bannerDefaults:{desktop:!!content.bannerDefaults?.desktop,phone:!!content.bannerDefaults?.phone},viewports:[]};
 for(const width of [390,1920,2560,3440]){await p.setViewportSize({width,height:1000});const box=await p.locator('main').boundingBox();const clientWidth=await p.evaluate(()=>document.documentElement.clientWidth);assert.ok(box.x+box.width>=clientWidth-2);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const columns=await p.locator('#recent').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);assert.ok(width===390?columns===1:columns>=4);report.viewports.push({width,columns,overflow:false});}
 await p.setViewportSize({width:1440,height:1000});
 for(const [type,items] of Object.entries(lists)){
  report[type]={total:items.length,withCover:items.filter(x=>x.thumbnail).length,covers:[]};
  for(const item of items.slice(0,12)){
   let source=null;
   const path=type==='email'?'/email-projects/':type==='site'?'/site-builder/projects/':'/draft/';
   {const r=await context.request.get(base+'/editor-api'+path+encodeURIComponent(item.id)+(type==='outmax'||type==='hasl'?'?brand='+type:''));if(r.ok())source=await r.json();}

   const result=await p.evaluate(async({id,thumbnail,type})=>{
    const link=[...document.querySelectorAll('.work')].find(a=>{const u=new URL((a.querySelector(".work-open")||a).href);return [...u.searchParams.values()].includes(id)&&u.pathname.includes(type==='site'?'site-builder':type==='email'?'OUTMAX':type==='hasl'?'hasl':'articles')});
    if(!thumbnail)return {cover:false,card:!!link};
    const img=new Image();img.referrerPolicy='no-referrer';img.src=thumbnail;
    const loaded=await Promise.race([img.decode().then(()=>true).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),15000))]);
    return {cover:true,loaded,width:img.naturalWidth,height:img.naturalHeight,card:!!link,cardMatches:!link||link.querySelector('img')?.getAttribute('src')===thumbnail};
   },{id:item.id,thumbnail:item.thumbnail,type});
   if(source){const str=JSON.stringify(source);result.sourceMatches=!!item.thumbnail&&(str.includes(item.thumbnail)||type==='site'&&Object.values(content.bannerDefaults||{}).includes(item.thumbnail)||type==='email'&&item.thumbnail.includes('/asset/')&&Object.values(source.assets||{}).some(x=>item.thumbnail.endsWith('/'+encodeURIComponent(x))));if(type==='site'){const s=source.state||{};result.stateKeys=Object.keys(s);result.imageOverrides=Object.keys(s.images||{}).length;result.hero=!!s.heroBackgrounds?.desktop;result.layout=(s.layout||[]).map(b=>({type:b.type,source:b.source,enabled:b.enabled,hero:!!b.heroBackgrounds?.desktop,block:!!b.blockBackgrounds?.desktop}));}else if(!item.thumbnail) result.emailImages={canvas:(source.canvasHtml||'').match(/<img\b/gi)?.length||0,rendered:(source.renderedHtml||'').match(/<img\b/gi)?.length||0,assets:Object.keys(source.assets||{}).length};}
   if(source&&item.thumbnail&&!result.sourceMatches&&['outmax','hasl'].includes(type)){result.sourceMatches=await p.evaluate(({body,thumbnail})=>{const doc=new DOMParser().parseFromString(body||'','text/html'),url=new URL(thumbnail,location.origin).href;return [...doc.querySelectorAll('img,meta')].some(n=>{const src=n.getAttribute('content')||n.getAttribute('src');try{return src&&new URL(src,location.origin+'/articles/').href===url}catch{return false}})},{body:source.body,thumbnail:item.thumbnail});}if(item.thumbnail){assert.equal(result.loaded,true,type+' cover loads');assert.equal(result.cardMatches,true,type+' card uses real source');if(source)assert.equal(result.sourceMatches,true,type+' cover belongs to material or its current template');}if(type==='email'&&!item.thumbnail&&source){result.templateImages=await p.evaluate(html=>[...new DOMParser().parseFromString(html,'text/html').images].map(img=>({chrome:/logo|social/i.test(img.className)||['outmax','хасл','telegram','vk','max'].includes(img.alt.trim().toLowerCase()),banner:img.alt==='Баннер рассылки',source:img.getAttribute('src')?new URL(img.getAttribute('src'),location.href).protocol:'',width:img.getAttribute('width')})),source.renderedHtml||'');assert.ok(result.templateImages.every(x=>x.chrome||!x.source),'Only template imagery may have no cover');}report[type].covers.push(result);
  }
 }
 fs.writeFileSync('tmp/live-workspace-cover-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await browser.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
