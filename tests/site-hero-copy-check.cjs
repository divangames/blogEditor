const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/site-builder/hasl/');
 await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof R!=='undefined'&&document.getElementById('desktop').__haslDocState===state);
 const fixture=await page.evaluate(()=>{const s=structuredClone(state);delete s.layout;s.texts={};s.links={};s.images={};s.heroBackgrounds={desktop:location.origin+'/editor-api/public-site-banners/11111111111111111111111111111111.webp',phone:location.origin+'/editor-api/public-site-banners/22222222222222222222222222222222.webp'};return s;});
 const out=await context.newPage();await out.emulateMedia({reducedMotion:'reduce'});
 await out.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.includes('/public-site-banners/'))return r.fulfill({contentType:'image/webp',path:'images/banners_hasl/'+(u.pathname.includes('/1111')?'Hasle_1100x1100.webp':'Hasle_1000x1100.webp')});return u.origin===base?r.continue():r.abort();});
 for(const site of ['hasl','hasle','both']){
  const html=await page.evaluate(({s,site})=>R.build(s,products,content,{clean:true,site}),{s:fixture,site});
  const hosts=site==='both'?['haslestore.com','xn--80awro.xn--p1ai']:[site==='hasle'?'haslestore.com':'xn--80awro.xn--p1ai'];
  for(const host of hosts){
   const url='https://'+host+'/hero-copy-check';await out.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await out.goto(url);await out.unroute(url);
   assert.equal(await out.locator('.sale-action').getAttribute('href'),'https://'+host+'/news/aktsiya-skidka-50-protsentov-na-2-paru');
   for(const width of [320,390,767,768,1024,1440]){
    await out.setViewportSize({width,height:1000});
    for(const selector of ['.mobile-sale-label','.mobile-sale-heading','.quick-finder-label','.finder-hero-title','.finder-hero-subtitle','.hero-actions .btn'])assert.ok(await out.locator(selector).isVisible(),selector+' '+width);
    assert.equal(await out.locator('.mobile-sale-heading').innerText(),'ЕСЛИ ОДНОЙ\nПАРЫ МАЛО');assert.equal(await out.locator('.finder-hero-title').innerText(),'ВЫБЕРИ СВОЮ ПАРУ');assert.equal(await out.locator('.hero-actions .btn').innerText(),'НАЧАТЬ');
    assert.equal(await out.locator('.finder-hero-description').isVisible(),false);assert.equal(await out.locator('.sale-details').isVisible(),false);assert.ok(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
    const background=await out.locator('.hero-sale').evaluate(n=>getComputedStyle(n).backgroundImage);assert.ok(background.includes(width<768?'22222222':'11111111'),'original device image');
    if(capture&&site==='hasl'&&[390,1440].includes(width))await out.locator('.hero-main').screenshot({path:'instructions/screens/site-hero-copy-'+(width===390?'phone':'desktop')+'.png'});
   }
  }
 }
 // A previously edited page keeps its own text rather than receiving a migration.
 assert.ok(await page.evaluate(s=>{const f=meta.fields.find(f=>f.value==='ВЫБЕРИ СВОЮ ПАРУ'&&f.label==='h2');s.texts[f.id]='Моя пара';return R.build(s,products,content,{clean:true}).includes('Моя пара');},fixture));
 await page.goto(base+'/instructions/#site-hero-layout');await page.getByRole('heading',{name:'ХАСЛ: главный экран и одинаковые отступы',exact:true}).waitFor();await page.locator('#wiki-search').fill('главный экран');assert.ok(await page.locator('.wiki-result').count());
 await page.close();await out.close();console.log('PASS hero copy, shop-specific links including both-domain export, original desktop/phone backgrounds, custom text preservation, 320/390/767/768/1024/1440, guide search');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8879';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});await module.exports(context,base,{capture:true});}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

