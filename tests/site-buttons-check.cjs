const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),out=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));out.on('pageerror',e=>errors.push(e.message));
 for(const p of [page,out])await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const products=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(products),missing:[],total:Object.keys(products).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.locator('[data-button-option]').first().waitFor({state:'attached'});
 await page.locator('.site-finder-background > summary').click();await page.locator('[data-hero-library="finderDesktop"]').click();
 await page.locator('[data-banner-status]').filter({hasText:'Выберите фон'}).waitFor();
 const upload=page.waitForResponse(r=>r.url().includes('/banners?')&&r.request().method()==='POST');await page.locator('#site-banner-upload').setInputFiles('images/sneakers.png');assert.equal((await upload).status(),201);
 await page.locator('[data-banner-status]').filter({hasText:'Изображение загружено'}).waitFor();
 const banner=(await (await context.request.get(base+'/editor-api/site-builder/banners')).json()).items.find(i=>i.name==='sneakers.png');
 await page.locator('[data-banner-use="'+banner.filename+'"]').click();
 await page.locator('.site-finder-background > summary').click();await page.locator('[data-hero-library="finderPhone"]').click();await page.locator('[data-banner-use="'+banner.filename+'"]').click();
 await page.locator('.site-finder-background > summary').click();const pad=page.locator('[data-finder-drag="desktop"]');await pad.scrollIntoViewIfNeeded();const rect=await pad.boundingBox();
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.6);await page.mouse.up();
 assert.ok(Number(await page.locator('[data-finder-device="desktop"][data-finder-axis="x"]').inputValue())>50);
 assert.equal(await page.locator('[data-finder-device="phone"][data-finder-axis="x"]').inputValue(),'50');
 await page.locator('[data-finder-device="desktop"][data-finder-axis="x"]').fill('50');await page.locator('[data-finder-device="desktop"][data-finder-axis="y"]').fill('60');
 await page.locator('[data-finder-device="phone"][data-finder-axis="scale"]').fill('135');
 if(capture)await page.locator('.site-finder-background').screenshot({path:'instructions/screens/site-finder-background.png'});
 const key=await page.evaluate(()=>meta.links.find(f=>f.value==='#hasl-embed-finder'&&f.button&&!f.defaultHidden).id);
 for(const width of [320,390,700,701,1440]){
  await out.setViewportSize({width,height:900});await out.setContent(await page.evaluate(()=>exported()));
  assert.equal(await out.locator('.finder-hero-title').innerText(),'ПОДБОР ЗА 15 СЕКУНД');assert.equal(await out.locator('.finder-hero-title').evaluate(n=>n.tagName),'H2');
  assert.equal(await out.locator('.finder-hero-subtitle').evaluate(n=>n.tagName),'H3');assert.equal(await out.locator('.finder-hero-description').isVisible(),true);
  assert.equal(await out.locator('.hero-actions a:visible').count(),1);const wallpaper=out.locator(width<=700?'.finder-wallpaper-phone':'.finder-wallpaper-desktop');assert.equal(await wallpaper.isVisible(),true);await wallpaper.evaluate(i=>i.decode());assert.equal(await wallpaper.evaluate(i=>i.style.getPropertyValue('--wall-scale')),width<=700?'135%':'120%');
  const href=await out.locator('.hero-actions a:visible').getAttribute('href');assert.equal(await out.locator(href).count(),1);
  await out.locator('.hero-actions a:visible').click();await out.waitForFunction(id=>document.getElementById(id).getBoundingClientRect().top<200,href.slice(1));
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(capture&&[390,1440].includes(width)){await out.evaluate(()=>scrollTo(0,0));await out.locator('.hero-copy').screenshot({path:'instructions/screens/site-finder-copy-'+(width===390?'mobile':'desktop')+'.png'});}
 }
 const option=name=>page.locator(`[data-button-id="${key}"][data-button-option="${name}"]`);
 await page.getByText('Кнопки: видимость и стиль',{exact:true}).click();
 await option('visibility').selectOption('hidden');await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.hero-actions .btn').isVisible(),false);
 await option('visibility').selectOption('deleted');await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.hero-actions .btn').count(),0);
 await option('visibility').selectOption('visible');await option('variant').selectOption('outline');await option('color').fill('#ffffff');await option('background').fill('#123456');await option('radius').fill('8');await option('fontSize').fill('17');
 await page.evaluate(()=>save());await page.reload();await page.locator('[data-button-option]').first().waitFor({state:'attached'});
 assert.equal(await page.evaluate(()=>state.layout.find(b=>b.source==='s0').finderBackgroundPosition.phone.scale),135);
 await out.setContent(await page.evaluate(()=>exported()));const button=out.locator('.hero-actions .btn');assert.equal(await button.evaluate(n=>getComputedStyle(n).borderRadius),'8px');assert.equal(await button.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(18, 52, 86)');assert.equal(await button.evaluate(n=>getComputedStyle(n).fontSize),'17px');
 await page.getByText('Кнопки: видимость и стиль',{exact:true}).click();if(capture)await option('visibility').locator('xpath=ancestor::fieldset').screenshot({path:'instructions/screens/site-button-settings.png'});
 await page.locator(`[data-button-reset="${key}"]`).click();await out.setContent(await page.evaluate(()=>exported()));assert.equal(await button.evaluate(n=>getComputedStyle(n).borderRadius),'0px');
 await page.getByText('Кнопки: видимость и стиль',{exact:true}).click();await page.locator('[data-button-id="hero-more"][data-button-option="visibility"]').selectOption('deleted');await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.hero-more').count(),0);
 assert.deepEqual(errors,[]);await page.close();await out.close();console.log('PASS buttons and typography: 5 widths, H2/H3, one CTA and working anchor, hide/delete/style/reset/save, details removal');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8908';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
