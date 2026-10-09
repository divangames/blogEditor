const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ccc"/></svg>');
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});fs.mkdirSync('release/ui-check/screens',{recursive:true});
 for(const route of ['/','/hasl/']){
  const page=await context.newPage();await page.goto(base+route);await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(image=>{setBody(`<header><h1>Заголовок статьи</h1><img id="hero" src="${image}" style="border-radius:18px"></header><section class="om-section"><h2>Раздел</h2><aside id="accent" class="om-callout" style="border-radius:16px"><p>Акцент</p></aside><div id="method" class="om-method-card" style="border-radius:12px"><p>Методика</p></div><div id="note" class="om-note"><p>Заметка</p></div><article id="product" class="om-product"><h3>Товар</h3></article><div id="table" class="om-table-scroll"><table><thead><tr><th>Модель</th><th>Цена</th></tr></thead><tbody><tr><td><img id="thumb" class="om-model-thumb" src="${image}" style="border-radius:12px"></td><td>100 ₽</td></tr></tbody></table></div><div class="om-cta"><a id="button" class="om-button om-button--red" href="https://example.com" style="border-radius:9px">Кнопка</a></div></section>`,{normalize:false});setArticleSaveDocument();},image);
  const style=await page.evaluate(()=>Object.fromEntries(['hero','accent','method','note','product','table','thumb','button'].map(id=>[id,getComputedStyle(document.getElementById(id)).borderRadius])));
  assert.equal(style.button,route==='/' ? '9px' : '0px');assert.equal(style.thumb,'12px');
  if(route==='/')for(const id of ['hero','accent','method','note','product','table'])assert.equal(style[id],'6px',id);
  else{assert.equal(style.accent,'16px');assert.equal(style.hero,'18px');assert.equal(style.method,'12px');}
  const exported=await page.evaluate(()=>{const doc=new DOMParser().parseFromString(adminBody(),'text/html');return Object.fromEntries(['hero','accent','method','note','product','table','thumb','button'].map(id=>[id,doc.getElementById(id).style.borderRadius]));});
  assert.equal(exported.button,'9px');assert.equal(exported.thumb,'12px');if(route==='/')for(const id of ['hero','accent','method','note','product','table'])assert.equal(exported[id],'6px');
  await page.setViewportSize({width:375,height:812});if(route==='/')assert.equal(await page.locator('#table tbody tr').evaluate(n=>getComputedStyle(n).borderRadius),'6px');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'release/ui-check/screens/radius-'+(route==='/hasl/'?'hasl':'outmax')+'.png'});await page.close();
 }
 console.log('OUTMAX: consistent 6px blocks including legacy inline styles and export; buttons, thumbnails and HASL unchanged; mobile OK');await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
