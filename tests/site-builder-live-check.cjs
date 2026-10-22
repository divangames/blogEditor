// Read-only production smoke: no project saves, user changes, analytics queries or sends.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const base=process.env.SITE_LIVE_BASE||'https://213.139.209.107';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password},viewport:{width:1600,height:1000}});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().startsWith(base)&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.goto(base+'/site-builder/hasl/',{waitUntil:'domcontentloaded'});await page.locator('#site-block-select').waitFor();
  assert.equal(await page.locator('[data-insert-section]').count(),10);
  await page.locator('[data-tab="products"]').click();await page.locator('#codes').fill('43816, 46713\n47509 43820');await page.locator('#apply-products').click();await page.locator('.product-row').filter({hasText:'43820'}).waitFor();assert.equal(await page.locator('.product-row').count(),4);assert.equal((await page.locator('#products-error').innerText()).trim(),'');await page.locator('[data-tab="layout"]').click();
  const frame=page.frameLocator('#desktop');await frame.locator('[contenteditable]').first().waitFor();
  await frame.locator('[contenteditable]').first().fill('Проверка живого текста');
  await page.waitForFunction(()=>state.layout[0].texts.t0==='Проверка живого текста');
  await page.locator('[data-preview-mode="desktop"]').click();await page.locator('#preview-fullscreen').click();assert.ok((await page.locator('#desktop-wrap').boundingBox()).width>1400);await page.keyboard.press('Escape');
  await page.locator('[data-preview-mode="phone"]').click();assert.ok((await page.locator('#phone-wrap').boundingBox()).height>320);
  await page.locator('#wordstat-open').click();await page.locator('#wordstat-dialog[open]').waitFor();await page.keyboard.press('Escape');
  assert.ok((await context.request.get(base+'/site-builder/outmax/')).ok());
  const guide=await context.newPage();await guide.goto(base+'/instructions/#site-builder');await guide.getByRole('heading',{name:'Конструктор ХАСЛ: страницы, блоки и живой текст',exact:true}).waitFor();
  await guide.locator('[data-site-menu]').waitFor({state:'attached'});
  const image=guide.locator('img[src*="site-builder.png"]').first();await image.scrollIntoViewIfNeeded();await image.evaluate(async n=>{await n.decode();});
  assert.ok(await image.evaluate(n=>n.naturalWidth>0));
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS live constructor, 10 blocks, live text, desktop/fullscreen/iPhone, Wordstat dialog, menu, decoded guide image; no writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
