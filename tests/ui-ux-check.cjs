const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const creds=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const out=path.join(root,'release/ui-check/screens');fs.mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:8877';let browser;
async function assertNoPageOverflow(page,label){
  const value=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  assert.equal(value,true,label+' has horizontal page overflow');
}
async function assertOpenSans(page,label){
  await page.evaluate(()=>document.fonts.ready);
  const family=await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily);
  assert.match(family,/Open Sans/i,label+' does not use Open Sans in UI');
  const loaded=await page.evaluate(()=>document.fonts.check('16px "Open Sans"'));
  assert.equal(loaded,true,label+' Open Sans webfont did not load');
}
(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#account-name strong').waitFor();await assertOpenSans(page,'Article editor');
  assert.doesNotMatch(await page.locator('#canvas').evaluate(el=>getComputedStyle(el).fontFamily),/^Bender/i);
  await assertNoPageOverflow(page,'Article editor desktop');
  await page.screenshot({path:path.join(out,'qa-article-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Превью',exact:true}).click();
  assert.equal(await page.locator('.sidebar').isVisible(),false,'Article preview should use focused full-width mode');
  await page.screenshot({path:path.join(out,'qa-article-preview.png')});
  await page.getByRole('button',{name:'Редактор',exact:true}).click();
  await page.setViewportSize({width:375,height:812});await assertNoPageOverflow(page,'Article editor mobile');
  assert.ok(parseFloat(await page.locator('#filename').evaluate(el=>getComputedStyle(el).fontSize))>=16);
  await page.screenshot({path:path.join(out,'qa-article-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:true,smtpConfigured:true,subscriberAvailable:10}}));
  await page.route('**/editor-api/notisend/lists',r=>r.fulfill({json:{items:[]}}));
  await page.route('**/editor-api/notisend/campaigns?*',r=>r.fulfill({json:{totalCount:0,items:[]}}));
  await page.goto(base+'/email/');await page.locator('#canvas').waitFor();await assertOpenSans(page,'Email editor');
  assert.match(await page.locator('#canvas').evaluate(el=>getComputedStyle(el).fontFamily),/Arial/i,'Email content canvas typography changed');
  await assertNoPageOverflow(page,'Email editor desktop');
  await page.screenshot({path:path.join(out,'qa-email-desktop.png'),fullPage:true});
  await page.locator('.tab[data-view="preview"]').click();
  assert.equal(await page.locator('.sidebar').isVisible(),false,'Email preview should use focused full-width mode');
  const desktop=await page.locator('.desktop-device').boundingBox(),phone=await page.locator('.phone-device').boundingBox();
  assert.ok(desktop.width<=700.5&&phone.width<=360.5,'Preview device widths exceed targets');
  await page.screenshot({path:path.join(out,'qa-email-preview.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});await assertNoPageOverflow(page,'Email preview mobile');
  const boxes=await Promise.all([page.locator('.desktop-device').boundingBox(),page.locator('.phone-device').boundingBox()]);
  assert.ok(boxes[1].y>boxes[0].y,'Mobile email previews should stack instead of overflowing horizontally');
  await page.locator('.tab[data-view="editor"]').click();
  assert.ok(parseFloat(await page.locator('#filename').evaluate(el=>getComputedStyle(el).fontSize))>=16);
  await assertNoPageOverflow(page,'Email editor mobile');
  await page.screenshot({path:path.join(out,'qa-email-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('UI/UX QA: Open Sans loaded, content typography preserved, focused previews, mobile inputs and overflow: OK');
  console.log('Screenshots:',out);
  await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
