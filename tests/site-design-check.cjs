const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false,live=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();
 await page.evaluate(async()=>{const result=await api('products?codes=47596,47465,45470');result.products.forEach(p=>products[p.code]=p);for(const key of ['catalog','promos','collections']){const codes=key==='promos'?['47465','45470']:['47596','47465'];state.blocks[key]={codes:codes.join(','),appliedCodes:codes.join(','),resolved:codes,photos:{},missing:[],loaded:true};}updatePreviews();});
 await page.locator('#site-block-select').selectOption('block-8');
 await page.locator('[data-faq-action="add"]').click();
 await page.locator('[data-faq-index="3"][data-faq-field="question"]').fill('Как выбрать размер?');
 await page.locator('[data-faq-index="3"][data-faq-field="answer"]').fill('Измерьте стопу.\nСверьтесь с размерной сеткой.');
 await page.locator('[data-faq-index="3"][data-faq-field="url"]').fill('https://хасл.рф/krossovki');
 await page.locator('[data-faq-index="3"][data-faq-field="linkText"]').fill('Перейти в каталог');
 await page.locator('[data-faq-action="up"][data-faq-index="3"]').click();
 assert.equal(await page.locator('[data-faq-field="question"][data-faq-index="2"]').inputValue(),'Как выбрать размер?');
 await page.locator('[data-faq-action="down"][data-faq-index="2"]').click();
 await page.locator('[data-faq-action="delete"][data-faq-index="1"]').click();
 assert.equal(await page.locator('[data-faq-field="question"]').count(),3);
 await page.waitForFunction(()=>document.querySelector('#desktop').contentDocument?.querySelector('.faq')?.textContent.includes('Как выбрать размер?'));
 const desktop=page.frameLocator('#desktop');
 const q=desktop.locator('.faq-q [data-editor-text][contenteditable]').last();await q.fill('Как подобрать размер?');
 await page.waitForFunction(()=>state.layout.find(x=>x.source==='s8').faq.at(-1).question==='Как подобрать размер?');
 await page.frameLocator('#phone').locator('.faq-q').filter({hasText:'Как подобрать размер?'}).waitFor();
 if(capture){await page.locator('[data-block-show]').click();await page.screenshot({path:'instructions/screens/site-faq-settings.png'});}
 if(!live){await page.locator('#site-save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Все изменения сохранены');await page.reload();await page.locator('#site-block-select').waitFor();await page.locator('#site-block-select').selectOption('block-8');assert.equal(await page.locator('[data-faq-field="question"]').last().inputValue(),'Как подобрать размер?');}
 const html=await page.evaluate(()=>exported()),out=await context.newPage();out.on('pageerror',e=>errors.push(e.message));
 await out.route('**/*',r=>capture&&['image','font','stylesheet'].includes(r.request().resourceType())?r.continue():r.abort());
 for(const width of [320,390,768,1440]){
  await out.setViewportSize({width,height:1000});await out.setContent(html,{waitUntil:'domcontentloaded'});
  const gender=out.locator('.finder-gender'),sizes=out.locator('.size-choice:not([hidden]) input');
  await gender.selectOption('zhenskie');assert.deepEqual(await sizes.evaluateAll(ns=>ns.map(n=>Number(n.dataset.sizeLabel))),[35,36,37,38,39,40,41]);
  await out.locator('label.size-choice').filter({has:out.locator('input[data-size-label="35"]')}).click();assert.match(await out.locator('[id*="finderBtn"]').getAttribute('href'),/zhenskie.*2207/);
  await gender.selectOption('muzhskie');assert.deepEqual(await sizes.evaluateAll(ns=>ns.map(n=>Number(n.dataset.sizeLabel))),[41,42,43,44,45,46,47,48,49,50,51]);assert.equal(await out.locator('input[data-size-label="35"]').isChecked(),false);
  await out.locator('label.size-choice').filter({has:out.locator('input[data-size-label="51"]')}).click();assert.match(await out.locator('[id*="finderBtn"]').getAttribute('href'),/muzhskie.*2240/);
  await out.locator('.size-choice-any').click();assert.doesNotMatch(await out.locator('[id*="finderBtn"]').getAttribute('href'),/razmer-obuvi/);
  const finder=out.locator('section[id^="hasl-embed-finder"]');assert.equal(await finder.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(206, 255, 0)');assert.ok(Math.abs((await finder.boundingBox()).width-width)<1);
  const question=out.locator('.faq-q').first(),before=await question.locator('span').first().textContent();await question.click();assert.equal(await question.getAttribute('aria-expanded'),'true');assert.equal(await question.locator('span').first().textContent(),before);assert.equal(await question.locator('.faq-sign').textContent(),'−');await question.press('Space');assert.equal(await question.getAttribute('aria-expanded'),'false');
  const buttons=await out.locator('.community-card .btn').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,text:n.textContent,size:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height,whiteSpace:getComputedStyle(n.querySelector('span')).whiteSpace,font:getComputedStyle(n).fontFamily})));assert.ok(Math.abs(buttons[0].height-buttons[1].height)<1,JSON.stringify(buttons));assert.ok(buttons.every(b=>b.height<80&&b.whiteSpace==='normal'&&b.font.includes('Montserrat')));
  const cards=await out.locator('.hero-side .product-media').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,w:r.width,h:r.height};}));assert.equal(cards.length,2);assert.equal(cards[0].top,cards[1].top);assert.ok(cards.every(c=>Math.abs(c.w-c.h)<1));
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow at '+width);
  assert.equal(await out.locator('.product-track .season-badge').first().textContent(),'ЗИМА');assert.equal(await out.locator('.product-track .discount-badge').first().textContent(),'-20%');
  assert.equal(await out.locator('.product-title').first().evaluate(n=>getComputedStyle(n).fontWeight),'400');
  if(capture&&width===1440){await out.locator('.product-track').scrollIntoViewIfNeeded();await out.locator('.product-track img').evaluateAll(async ns=>Promise.all(ns.map(n=>n.decode().catch(()=>{}))));await out.locator('.product-track .product').first().screenshot({path:'instructions/screens/site-product-design.png'});await finder.screenshot({path:'instructions/screens/site-finder-design.png'});await out.locator('.community').screenshot({path:'instructions/screens/site-community-design.png'});await question.click();await out.locator('.faq-section').screenshot({path:'instructions/screens/site-faq-design.png'});}
  if(capture&&width===390){await out.locator('.hero-side').screenshot({path:'instructions/screens/site-promo-alignment.png'});await finder.screenshot({path:'instructions/screens/site-finder-mobile.png'});}
 }
 // Native template questions keep their title too, before custom FAQ settings exist.
 const original=await page.evaluate(()=>{const s=structuredClone(state);delete s.layout.find(x=>x.source==='s8').faq;return R.build(s,products,content,{clean:true});});await out.setContent(original,{waitUntil:'domcontentloaded'});const first=out.locator('.faq-q').first(),text=await first.locator('span').first().textContent();await first.click();assert.equal(await first.locator('span').first().textContent(),text);
 assert.deepEqual(errors,[]);await out.close();await page.close({runBeforeUnload:false});console.log('PASS site design: cards, Montserrat, full-width lime, gender sizes/URLs, FAQ edit/order/delete/live/persistence, buttons and export 320/390/768/1440');
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});}


