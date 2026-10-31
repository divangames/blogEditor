const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
 const catalog=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>{const codes=new URL(r.request().url()).searchParams.get('codes').split(/[,;\s]+/).filter(Boolean);return r.fulfill({json:{products:codes.map(c=>catalog[c]).filter(Boolean),missing:codes.filter(c=>!catalog[c]),total:Object.keys(catalog).length}});});
 await page.goto(base+'/site-builder/hasl/');
 await page.frameLocator('#desktop').locator('[contenteditable]').first().waitFor({state:'attached'});
 const html=await page.evaluate(()=>{const s=structuredClone(state);delete s.layout;s.texts={};s.links={};s.images={};s.heroBackgrounds={desktop:location.origin+'/editor-api/public-site-banners/11111111111111111111111111111111.webp',phone:location.origin+'/editor-api/public-site-banners/22222222222222222222222222222222.webp'};return R.build(s,products,content,{clean:true});});
 const routed=await context.newPage();let routedHtml='';await routed.route('**/*',r=>new URL(r.request().url()).pathname==='/benefit-qa'?r.fulfill({contentType:'text/html',body:routedHtml}):r.abort());
 for(const [site,host] of [['hasl','example.com'],['hasle','example.com'],['both','haslestore.com'],['both','xn--80awro.xn--p1ai']]){
  routedHtml=await page.evaluate(site=>{const s=structuredClone(state);delete s.layout;return R.build(s,products,content,{site,clean:true,preview:true});},site);
  await routed.goto('https://'+host+'/benefit-qa');const hasle=site==='hasle'||site==='both'&&host==='haslestore.com',origin=hasle?'https://haslestore.com':'https://xn--80awro.xn--p1ai',catalog=hasle?'/sneakers':'/krossovki';
  assert.deepEqual(await routed.locator('.benefit-link').evaluateAll(ns=>ns.map(n=>n.href)),[catalog,'/',catalog,'/testimonials','/news/krossovki-dolyami-bez-pereplat'].map(p=>origin+p));
 }await routed.close();
 const out=await context.newPage();await out.emulateMedia({reducedMotion:'reduce'});await out.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
 if(capture)await out.route(/^https:\/\/(fonts.googleapis.com|fonts.gstatic.com)\//,r=>r.continue());
 await out.route('**/editor-api/public-site-banners/*.webp',r=>r.fulfill({contentType:'image/webp',path:'images/banners_hasl/'+(r.request().url().includes('/1111')?'Hasle_1100x1100.webp':'Hasle_1000x1100.webp')}));
 await out.goto(base+'/instructions/');
 for(const width of [390,767,768,1024,1440]){
  await out.setViewportSize({width,height:1000});await out.setContent(html,{waitUntil:'domcontentloaded'});
  assert.ok(await out.locator('.mobile-sale-heading').isVisible());
  assert.equal(await out.locator('.mobile-sale-caption').isVisible(),false);
  assert.equal(await out.locator('.sale-amount').isVisible(),false);
  assert.equal(await out.locator('.sale-description').isVisible(),false);
  assert.equal(await out.locator('.hero-more').count(),0);assert.equal(await out.locator('.sale-description').isVisible(),false);
  for(const control of await out.locator('button,a.btn,a.link,a.sale-details,a.review-read,a.benefit-link').all()){const css=await control.evaluate(n=>{const c=getComputedStyle(n);return [c.fontSize,c.fontWeight,c.borderRadius];});assert.deepEqual(css,['14px','500','0px']);}assert.match(await out.locator('.sale-details').textContent(),/Подробнее об акции/);assert.equal(await out.locator('.sale-details svg').isVisible(),false);
  assert.equal(await out.locator('.trust').count(),5);
  assert.equal(await out.locator('.trust-grid').isVisible(),false);
  assert.equal(await out.locator('.desktop-benefits').isVisible(),true);
  assert.equal(await out.locator('.benefit-link').count(),5);for(const link of await out.locator('.benefit-link').all()){assert.ok(await link.isVisible());assert.ok((await link.boundingBox()).height>=44);}
  const cols=await out.locator('.desktop-benefit').evaluateAll(ns=>ns.map(n=>getComputedStyle(n.querySelector('h3')).gridColumnStart));
  if(width<768){assert.deepEqual(cols,['2','1','2','1','2']);const mobile=await out.locator('.trust-section').evaluate(n=>{const box=n.getBoundingClientRect(),last=n.querySelector('.desktop-benefits').getBoundingClientRect();return {bottomGap:box.bottom-last.bottom,icons:[...n.querySelectorAll('.desktop-benefit>img')].map(i=>i.getBoundingClientRect().width)};});assert.ok(mobile.bottomGap<1,'no bottom black band');assert.ok(mobile.icons.every(w=>w>=150),'large icons');}
  if(width>=768){
   assert.equal(await out.locator('.desktop-benefit').count(),5);
   assert.deepEqual(await out.locator('.desktop-benefit h3').allTextContents(),['БЕЗ\nНАЦЕНОК','ЖИВАЯ\nКОНСУЛЬТАЦИЯ','ОГРОМНЫЙ\nАССОРТИМЕНТ','ПРОВЕРЕНО\nПОКУПАТЕЛЯМИ','ОПЛАТА ЧАСТЯМИ']);
   const icons=await out.locator('.desktop-benefit>img').evaluateAll(async ns=>{await Promise.all(ns.map(n=>n.decode()));return ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,natural:n.naturalWidth,src:n.src}));});
   const fs=require('node:fs');for(const [i,name] of ['direct-price','consultant','assortment','reviews','dolyami'].entries()){assert.equal(icons[i].width,72);assert.equal(icons[i].height,72);assert.ok(icons[i].natural>0);assert.equal(icons[i].src,'data:image/png;base64,'+fs.readFileSync('images/hasl-benefits/'+name+'.png').toString('base64'));}
   if(width===1440){const boxes=await out.locator('.desktop-benefit').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));assert.ok(boxes.every(b=>b.y===boxes[0].y&&Math.abs(b.width-boxes[0].width)<1));assert.equal(boxes[1].x-boxes[0].right,16);}

   const fonts=await out.evaluate(()=>['.mobile-sale-heading','.finder-hero-title','.mobile-sale-caption','.finder-hero-subtitle'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [c.fontFamily,c.fontSize,c.lineHeight,c.fontWeight];}));
   assert.equal(fonts[0][3],'700');assert.equal(fonts[2][3],'600');
   assert.equal(await out.locator('.hero-sale>h1').isVisible(),false);
  }
  assert.ok(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  const question=out.locator('.faq-q').first();assert.equal(await question.locator('.faq-sign').evaluate(n=>getComputedStyle(n,'::before').height),'1px');await question.click();assert.equal(await question.getAttribute('aria-expanded'),'true');assert.equal(await question.locator('.faq-sign').evaluate(n=>getComputedStyle(n,'::after').display),'none');await question.click();
  if(capture&&[390,1440].includes(width)){
   const suffix=width===390?'mobile':'desktop';await out.evaluate(()=>document.fonts.ready);assert.ok(await out.evaluate(()=>document.fonts.check('500 14px Montserrat')),'Montserrat loaded for screenshot');
   await out.locator('.hero-sale').evaluate(async n=>{const src=getComputedStyle(n).backgroundImage.slice(5,-2),i=new Image();i.src=src;await i.decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   await out.locator('.hero-main').screenshot({path:'instructions/screens/site-shared-promo-'+suffix+'.png'});
   await out.locator('.trust-section').scrollIntoViewIfNeeded();await out.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await out.locator('.trust-section').screenshot({path:'instructions/screens/site-figma-benefits-'+suffix+'.png'});
   if(width===390){await out.locator('.faq-section').first().screenshot({path:'instructions/screens/site-faq-thin-mobile.png'});}
  }
 }
 await page.goto(base+'/instructions/#site-hero-layout');await page.getByRole('heading',{name:'ХАСЛ: главный экран и одинаковые отступы',exact:true}).waitFor();
 await page.goto(base+'/instructions/#site-structure-reviews');await page.getByRole('heading',{name:'ХАСЛ: структура секций, карусели и полные отзывы',exact:true}).waitFor();
 await page.locator('#wiki-search').fill('преимущества');assert.ok(await page.locator('.wiki-result').count());
 await page.close();await out.close();console.log('PASS shared desktop/mobile promotion, matching typography, Figma desktop benefits and shared mobile checkerboard cards, disclosure, no overflow: 390/767/768/1024/1440; guide links and search');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

