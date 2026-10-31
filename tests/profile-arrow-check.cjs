const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false,live=false}={})=>{
 if(!live)assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
 await page.route('**/api/notisend/**',r=>r.fulfill({json:{connected:false}}));
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 const turned=async(selector,open)=>page.waitForFunction(({selector,open})=>Math.abs(new DOMMatrix(getComputedStyle(document.querySelector(selector)).transform).a-(open?-1:1))<.001,{selector,open});
 for(const path of ['/','/hasl/','/email/','/instructions/']){
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(base+path,{waitUntil:'domcontentloaded'});const profile=page.locator('.account-menu');await profile.locator('.account-switcher-chevron').waitFor();
  const arrow='.account-menu .account-switcher-chevron',summary=profile.locator(':scope>summary');
  assert.equal(await page.locator(arrow).evaluate(n=>getComputedStyle(n).transitionDuration),'0.16s',path+' '+page.url()+' inline: '+await page.locator('#shared-header-state-arrows').count());
  await summary.click();await turned(arrow,true);
  if(capture&&path==='/'){const b=await profile.boundingBox(),d=await profile.locator('.account-dropdown').boundingBox();await page.screenshot({path:'instructions/screens/article-profile-arrow.png',clip:{x:Math.floor(Math.min(b.x,d.x)-12),y:0,width:Math.ceil(Math.max(b.x+b.width,d.x+d.width)-Math.min(b.x,d.x)+24),height:Math.ceil(d.y+d.height+12)}});}
  await page.keyboard.press('Escape');await turned(arrow,false);assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
  await summary.focus();await page.keyboard.press('Enter');await turned(arrow,true);await page.locator('.editor-switcher>summary').click();await turned(arrow,false);await turned('.editor-switcher-chevron',true);await page.keyboard.press('Escape');await turned('.editor-switcher-chevron',false);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator(arrow).evaluate(n=>getComputedStyle(n).transitionDuration),'0s');await summary.click();await turned(arrow,true);await page.keyboard.press('Escape');await turned(arrow,false);
  if(path!=='/instructions/'){
   await page.setViewportSize({width:390,height:844});await summary.click();await turned(arrow,true);const b=await profile.locator('.account-dropdown').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390);
   if(capture&&path==='/'){const p=await profile.boundingBox(),x=Math.max(0,Math.floor(Math.min(p.x,b.x)-12)),right=Math.min(390,Math.ceil(Math.max(p.x+p.width,b.x+b.width)+12));await page.screenshot({path:'instructions/screens/article-profile-arrow-mobile.png',clip:{x,y:0,width:right-x,height:Math.ceil(b.y+b.height+12)}});}
   await page.keyboard.press('Escape');
  }
 }
 assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});
 console.log('PASS profile arrows: OUTMAX/HASL/email/instructions; 160ms rotation both directions; mouse/Enter/Escape/mutual exclusion, reduced motion, mobile bounds; browser mutations blocked');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
