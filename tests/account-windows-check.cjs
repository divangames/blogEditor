const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 if(capture)assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 await page.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 const paths=[['home','/'],['articles','/articles/?resume=1'],['hasl','/hasl/?resume=1'],['email','/OUTMAX.html?resume=1'],['site','/site-builder/hasl/?resume=1'],['instructions','/instructions/']];
 for(const width of [1440,390])for(const [kind,path] of paths){
  await page.setViewportSize({width,height:1000});await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator('.unified-user-menu').waitFor({state:'attached'});
  if(kind==='site')await page.waitForFunction(()=>!document.body.classList.contains('site-starting'));
  if(!['home','instructions'].includes(kind)){await page.waitForFunction(()=>typeof window.WorkspaceAdapter?.resume==='function');await page.evaluate(()=>window.WorkspaceAdapter.resume());}
  const marker='Локальные правки '+kind+' '+width;
  if(kind==='site')await page.evaluate(value=>{state.title=value;SiteBuilder.markChanged();},marker);
  else if(kind==='email')await page.locator('#subject').fill(marker);
  else if(['articles','hasl'].includes(kind))await page.locator('#page-title').fill(marker);
  await page.evaluate(()=>{window.accountWindowDocumentQA={};window.accountWindowBodyQA=document.body;});const originalURL=page.url();
  for(const action of ['profile','articles','archives','impersonation','users','about','feedback']){
   await page.locator('.account-menu>summary').click();const button=page.locator('[data-account-action='+action+']');if(!await button.isVisible()){await page.keyboard.press('Escape');continue;}await button.click();
   let scope=page;const surface=page.locator('#account-window-dialog[open]');
   if(await surface.count()){
    scope=page.frameLocator('#account-window-dialog iframe');await scope.locator('dialog[open]').waitFor();
    assert.equal(await scope.locator('#content,#page-title,#canvas,.topbar').count(),0,'Account surface must not load an editor');
    assert.equal(await page.locator('#account-window-dialog iframe').getAttribute('src'),'/account-window/?view='+action+'&brand='+(kind==='hasl'?'hasl':'outmax'));
    await page.waitForFunction(()=>document.querySelector('#account-window-dialog [data-window-status]')?.hidden);
   }
   if(action==='profile')await page.frameLocator('#user-profile-dialog iframe').locator('form').first().waitFor();
   else if(['articles','archives','users'].includes(action)){await scope.locator('.account-dialog[open]').waitFor();assert.match(await scope.locator('#account-heading').innerText(),action==='users'?/Пользователи/:/статьи|архив/i);}
   else if(action==='impersonation')await scope.locator('#impersonation-dialog[open] select:not([disabled])').waitFor();
   else if(action==='feedback')await scope.locator('dialog[open]').last().waitFor();
   else await scope.locator('dialog[open]').last().waitFor();
   assert.equal(page.url(),originalURL,kind+'/'+action+' must not navigate');
   assert.ok(await page.evaluate(()=>window.accountWindowBodyQA===document.body&&!!window.accountWindowDocumentQA),kind+'/'+action+' replaced the host document');
   if(capture&&['home','email','site'].includes(kind)&&action==='users')await page.screenshot({path:'instructions/screens/account-window-'+kind+'-'+(width===390?'phone':'desktop')+'.png'});
   if(action==='about'){await scope.locator('dialog[open]').last().click({position:{x:20,y:20}});await page.keyboard.press('Escape');}
   else if(action==='profile')await page.locator('#user-profile-dialog>button').click();
   else await scope.locator('dialog[open]').last().locator('header button[aria-label="Закрыть"],header button[data-close],header button.notisend-close').first().click();
   if(await surface.count())await surface.waitFor({state:'hidden'});
   assert.equal(page.url(),originalURL);
   if(!['home','instructions'].includes(kind)){const value=await page.evaluate(kind=>kind==='site'?state.title:document.querySelector(kind==='email'?'#subject':'#page-title').value,kind);assert.equal(value,marker,kind+'/'+action+' changed unsaved work');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  console.log('PASS account windows stay in place:',kind,width);
 }
 assert.deepEqual(errors,[]);await page.close();
};
if(require.main===module){const {chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8979';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await context.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.fulfill({status:503,json:{error:'QA writes blocked'}}));await module.exports(context,base);}finally{await browser.close()}})().catch(error=>{console.error(String(error.message).split('Call log:')[0]);process.exit(1)});}
