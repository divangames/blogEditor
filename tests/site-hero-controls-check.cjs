const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const catalog=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(catalog),missing:[],total:Object.keys(catalog).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.locator('[data-ribbon="text"]').waitFor();
 const out=await context.newPage();await out.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 for(const site of ['hasle','hasl','both']){
  const html=await page.evaluate(site=>R.build(state,products,content,{site,clean:true}),site);
  await out.setViewportSize({width:390,height:844});await out.setContent(html);
  const host=site==='hasle'?'sale.haslestore.com':'sale.xn--80awro.xn--p1ai';
  assert.equal(new URL(await out.locator('.sale-action').getAttribute('href')).hostname,host);
  assert.equal(new URL(await out.locator('.sale-details').getAttribute('href')).pathname,'/terms');
  assert.equal(new URL(await out.locator('.sale-details').getAttribute('href')).hostname,host);
  assert.equal(await out.locator('.sale-details').isVisible(),true);
  assert.equal(await out.locator('.reviews-arrow').first().evaluate(n=>getComputedStyle(n).borderRadius),'0px');
 }
 await page.locator('[data-ribbon="text"]').fill('Отзывы наших покупателей');
 await page.locator('[data-ribbon="background"]').fill('#112233');await page.locator('[data-ribbon="color"]').fill('#ffffff');
 await page.locator('[data-instance-kind="link"][data-field-id="hero-ribbon"]').fill('https://example.com/reviews');
 await page.locator('[data-instance-target="hero-ribbon"]').check();
 await page.locator('[data-hero-fixed]').uncheck();
 const key=await page.evaluate(()=>meta.links.find(f=>f.label.includes('Собрать заказ')).id);
 await page.locator(`[data-instance-kind="link"][data-field-id="${key}"]`).fill('https://example.com/order');await page.locator(`[data-instance-target="${key}"]`).check();
 await out.setContent(await page.evaluate(()=>exported()));
 const ribbon=out.locator('.hero-review-ribbon');assert.equal(await ribbon.innerText(),'Отзывы наших покупателей');
 assert.equal(await ribbon.getAttribute('target'),'_blank');assert.equal(await ribbon.getAttribute('rel'),'noopener noreferrer');
 assert.equal(await ribbon.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(17, 34, 51)');
 assert.equal(await out.locator('.sale-action').getAttribute('href'),'https://example.com/order');assert.equal(await out.locator('.sale-action').getAttribute('target'),'_blank');
 assert.equal(await out.locator('.hero-background-fixed').count(),0);
 if(capture){
  const response=await context.request.post(base+'/editor-api/site-builder/banners?name=hero-guide.webp',{data:require('node:fs').readFileSync('images/banners_hasl/Hasle_1000x1100.webp'),headers:{'Content-Type':'image/webp'}});assert.equal(response.status(),201);const uploaded=await response.json();
  await page.evaluate(url=>{state.layout.find(b=>b.source==='s0').heroBackgrounds={phone:url,desktop:url};},uploaded.url);
  await out.setContent(await page.evaluate(()=>exported()));await out.locator('.hero-sale').evaluate(async n=>{const i=new Image();i.src=getComputedStyle(n).backgroundImage.slice(5,-2);await i.decode();});
  await page.locator('.site-ribbon-settings').screenshot({path:'instructions/screens/site-hero-controls.png'});await out.screenshot({path:'instructions/screens/site-hero-controls-mobile.png',clip:{x:0,y:0,width:390,height:430}});
 }
 await page.locator('[data-ribbon="enabled"]').uncheck();await page.evaluate(()=>save());await page.reload();await page.locator('[data-ribbon="text"]').waitFor();
 assert.equal(await page.locator('[data-ribbon="enabled"]').isChecked(),false);assert.equal(await page.locator('[data-hero-fixed]').isChecked(),false);
 await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.hero-review-ribbon').isVisible(),false);
 await page.locator('[data-ribbon="enabled"]').check();await page.locator('[data-hero-fixed]').check();await page.locator('[data-instance-target="hero-ribbon"]').uncheck();
 await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.hero-background-fixed').count(),1);assert.equal(await out.locator('.hero-review-ribbon').getAttribute('target'),null);
 assert.deepEqual(errors,[]);await page.close();await out.close();console.log('PASS hero controls: domains, terms button, ribbon/colors/link/target/visibility, fixed toggle, save/reload, square arrows');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8906';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
