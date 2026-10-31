const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(new URL(r.url()).origin===base&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.url());});
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/site-builder/hasl/');
 await page.waitForFunction(()=>!!window.StudioShell&&!document.body.classList.contains('site-starting'));
 const before=await page.evaluate(()=>JSON.stringify(state));
 const editor=page.locator('.editor-switcher'),profile=page.locator('.account-menu'),menu=editor.locator('.editor-switcher-menu');
 const arrow=(selector)=>page.locator(selector).evaluate(n=>{const s=getComputedStyle(n);return {a:new DOMMatrix(s.transform).a,duration:s.transitionDuration,property:s.transitionProperty};});
 const turned=async(selector,open)=>page.waitForFunction(({selector,open})=>Math.abs(new DOMMatrix(getComputedStyle(document.querySelector(selector)).transform).a-(open?-1:1))<.001,{selector,open});
 for(const [container,selector] of [[editor,'.editor-switcher-chevron'],[profile,'.account-switcher-chevron']]){
  assert.equal((await arrow(selector)).a,1);
  assert.equal((await arrow(selector)).duration,'0.16s');
  assert.equal((await arrow(selector)).property,'transform');
  await container.locator(':scope>summary').click();await turned(selector,true);
  await page.keyboard.press('Escape');await turned(selector,false);
  assert.equal(await container.locator(':scope>summary').evaluate(n=>n===document.activeElement),true);
 }
 await editor.locator(':scope>summary').focus();await page.keyboard.press('Enter');await turned('.editor-switcher-chevron',true);
 assert.equal(await menu.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(32, 32, 32)');
 const links=await menu.locator('a').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),title:n.querySelector('strong')?.textContent,subtitle:n.querySelector('small')?.textContent,target:n.target,rel:n.rel})));
 assert.deepEqual(links.map(n=>n.href),['/','/hasl/','/email/','/tiptap/?brand=hasl','/instructions/','/site-builder/hasl/','/site-builder/outmax/']);
 assert.ok(links.every(n=>n.title&&n.subtitle&&n.target==='_blank'&&n.rel==='noopener'));
 assert.equal(await menu.locator('[aria-current=page]').getAttribute('href'),'/site-builder/hasl/');
 assert.equal(await menu.locator('[aria-current=page]').evaluate(n=>getComputedStyle(n,'::before').backgroundColor),'rgb(227, 30, 36)');
 assert.equal(await menu.locator('.site-switcher-group').evaluate(n=>n.open),true);
 if(capture){const box=await menu.boundingBox();await page.screenshot({path:'instructions/screens/site-studio-editor-menu.png',clip:{x:0,y:0,width:Math.ceil(box.x+box.width+12),height:Math.ceil(box.y+box.height+12)}});}
 await menu.locator('.site-switcher-group>summary').click();assert.equal(await editor.evaluate(n=>n.open),true);
 await menu.locator('.site-switcher-group>summary').click();
 await profile.locator(':scope>summary').click();await page.waitForFunction(()=>!document.querySelector('.editor-switcher').open);await turned('.editor-switcher-chevron',false);await turned('.account-switcher-chevron',true);
 if(capture){const box=await profile.boundingBox(),drop=await profile.locator('.account-dropdown').boundingBox();await page.screenshot({path:'instructions/screens/site-studio-profile-menu.png',clip:{x:Math.max(0,box.x-12),y:0,width:Math.ceil(Math.max(box.width,drop.width)+32),height:Math.ceil(drop.y+drop.height+12)}});}
 await page.locator('.preview-footer').click();await turned('.account-switcher-chevron',false);
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const selector of ['.editor-switcher-chevron','.account-switcher-chevron'])assert.equal((await arrow(selector)).duration,'0s');
 await profile.locator(':scope>summary').focus();await page.keyboard.press('Space');assert.equal((await arrow('.account-switcher-chevron')).a,-1);await page.keyboard.press('Escape');
 for(const [width,height] of [[390,844],[320,844],[390,360]]){
  await page.setViewportSize({width,height});await editor.locator(':scope>summary').click();
  const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height,'menu fits mobile viewport');
  await menu.locator('a[href="/site-builder/outmax/"]').scrollIntoViewIfNeeded();assert.equal(await menu.locator('a[href="/site-builder/outmax/"]').isVisible(),true);
  if(capture&&width===390&&height===844)await page.screenshot({path:'instructions/screens/site-studio-menu-mobile.png',clip:{x:0,y:0,width,height:Math.ceil(box.y+box.height+12)}});
  await page.keyboard.press('Escape');await profile.locator(':scope>summary').click();const p=await profile.locator('.account-dropdown').boundingBox();assert.ok(p.x>=0&&p.x+p.width<=width,'profile fits mobile viewport');await page.keyboard.press('Escape');
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),before,'view-only menus preserve project and undo');
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});
 console.log('PASS shared dark switcher/7 destinations/active marker; both 160ms arrows, mouse/Enter/Space/Escape/outside/mutual exclusion; reduced motion; 390/320px and short viewport; no writes/state changes');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
