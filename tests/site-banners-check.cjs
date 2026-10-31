const {click:studioClick,reveal:studioReveal}=require('./studio-test-helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const catalog=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>{const codes=new URL(r.request().url()).searchParams.get('codes').split(/[,;\s]+/).filter(Boolean);return r.fulfill({json:{products:codes.map(c=>catalog[c]).filter(Boolean),missing:[],total:Object.keys(catalog).length}});});
 await page.goto(base+'/site-builder/hasl/');await page.locator('[data-hero-library="phone"]').waitFor();
 const uploaded={};
 for(const [device,file] of [['phone','Hasle_1000x1100.webp'],['desktop','Hasle_1100x1100.webp']]){
  await page.locator(`[data-hero-library="${device}"]`).click();const dialog=page.locator('#site-banner-dialog');await dialog.locator('[data-banner-status]').filter({hasText:'Выберите фон'}).waitFor();
  const response=page.waitForResponse(r=>r.url().includes('/site-builder/banners?')&&r.request().method()==='POST');
  await dialog.locator('input[type=file]').setInputFiles('images/banners_hasl/'+file);const result=await response;assert.equal(result.status(),201);await dialog.locator('[data-banner-status]').filter({hasText:'Изображение загружено'}).waitFor();uploaded[device]=(await (await context.request.get(base+'/editor-api/site-builder/banners')).json()).items.find(b=>b.name===file);
  const card=dialog.locator('.site-banner-item').filter({has:page.locator('[data-banner-use="'+uploaded[device].filename+'"]')});await card.waitFor();
  assert.equal((await context.request.get(uploaded[device].url)).status(),200);
  if(capture&&device==='desktop'){await page.setViewportSize({width:1440,height:1000});await dialog.screenshot({path:'instructions/screens/site-banner-library.png'});}
  await card.getByRole('button',{name:'Использовать',exact:true}).click();
 }
 await page.waitForFunction(()=>document.querySelector('#phone').contentDocument?.querySelector('.hero-sale')?.style.getPropertyValue('--hero-bg-phone').includes('public-site-banners'));
 const html=await page.evaluate(()=>exported()),out=await context.newPage();await out.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 for(const width of [320,390,700,701,1440]){
  await out.setViewportSize({width,height:900});await out.setContent(html,{waitUntil:'domcontentloaded'});const sale=out.locator('.hero-sale');
  assert.ok((await sale.evaluate(n=>getComputedStyle(n).backgroundImage)).includes(uploaded[width<=700?'phone':'desktop'].filename));
  await sale.evaluate(async n=>{const i=new Image();i.src=getComputedStyle(n).backgroundImage.slice(5,-2);await i.decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  assert.equal(await sale.evaluate(n=>getComputedStyle(n).backgroundAttachment),'fixed');
  assert.notEqual(await sale.evaluate(n=>getComputedStyle(n).backgroundSize),'cover');
  const fixedPosition=await sale.evaluate(n=>getComputedStyle(n).backgroundPosition);
  await out.evaluate(()=>scrollTo(0,100));assert.equal(await sale.evaluate(n=>getComputedStyle(n).backgroundPosition),fixedPosition);await out.evaluate(()=>scrollTo(0,0));
  assert.equal(await out.locator('.mobile-sale-scene').isVisible(),false);
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(capture&&[390,1440].includes(width)){await sale.evaluate(async n=>{const url=getComputedStyle(n).backgroundImage.slice(5,-2),i=new Image();i.src=url;await i.decode();});await sale.screenshot({path:'instructions/screens/site-banner-'+(width===390?'mobile':'desktop')+'.png'});}
 }
 if(capture)await page.locator('.site-hero-settings').screenshot({path:'instructions/screens/site-banner-settings.png'});
 await page.evaluate(()=>save());await page.reload();await page.locator('.site-hero-settings').waitFor();
 const selected=await page.evaluate(()=>state.layout.find(b=>b.source==='s0').heroBackgrounds);assert.deepEqual(selected,{phone:uploaded.phone.url,desktop:uploaded.desktop.url});
 assert.equal((await context.request.delete(base+'/editor-api/site-builder/banners/'+uploaded.phone.filename)).status(),409);
 // Delete an unused upload through the real library UI.
 await page.locator('[data-hero-library="phone"]').click();await page.locator('[data-banner-status]').filter({hasText:'Выберите фон'}).waitFor();
 const response=page.waitForResponse(r=>r.url().includes('/site-builder/banners?')&&r.request().method()==='POST');await page.locator('#site-banner-upload').setInputFiles({name:'unused-demo.webp',mimeType:'image/webp',buffer:fs.readFileSync('images/banners_hasl/Hasle_1000x1100.webp')});assert.equal((await response).status(),201);await page.locator('[data-banner-status]').filter({hasText:'Изображение загружено'}).waitFor();const extra=(await (await context.request.get(base+'/editor-api/site-builder/banners')).json()).items.find(b=>b.name==='unused-demo.webp');
 page.once('dialog',d=>d.accept());const deleted=page.waitForResponse(r=>r.url().endsWith('/banners/'+extra.filename)&&r.request().method()==='DELETE');await page.locator('[data-banner-delete="'+extra.filename+'"]').click();assert.equal((await deleted).status(),200);assert.equal((await context.request.get(extra.url)).status(),404);
 await page.locator('[data-banner-close]').click();
 // Clearing a device is explicit and persists independently.
 await page.locator('[data-hero-clear="phone"]').click();await page.evaluate(()=>save());
 assert.equal(await page.evaluate(()=>state.layout.find(b=>b.source==='s0').heroBackgrounds.phone),'');
 assert.deepEqual(errors,[]);await page.close();await out.close();console.log('PASS banners: upload/select, separate responsive exports, save/reload, used protection, unused delete, clear');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
