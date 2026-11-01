const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 if(capture)assert.match(base,/^http:\/\/127\.0\.0\.1:/);
 const me=await(await context.request.get(base+'/editor-api/me',{timeout:60000})).json();
 for(const width of [1440,390]){
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  try{
   // A real editor checkpoint remains in this tab while home initialization fails.
   await page.goto(base+'/site-builder/?resume=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.SiteBuilder&&!document.body.classList.contains('site-starting'));await page.evaluate(()=>document.querySelector('#site-template-catalog[open]')?.close());
   const marker='Локальный черновик '+width;await page.evaluate(t=>{state.title=t;SiteDesigner.insertSection('grid',{id:'qa',name:'Проверка возврата',source:'custom',mode:'grid',elements:[{id:'qa-heading',type:'heading',text:t}],columns:1,mobileColumns:1});SiteBuilder.markChanged();},marker);
   const original=await page.evaluate(()=>({id:SiteBuilder.versionContext().id,title:state.title,layout:JSON.stringify(state.layout)}));
   let hold=true;const pending=[];const profileRoute=async route=>{if(hold)await new Promise(resolve=>pending.push({route,resolve}));else await route.fulfill({json:me});};await page.route('**/editor-api/me',profileRoute);
   await page.locator('.workspace-home').click();await page.waitForURL(base+'/');const retry=page.locator('#home-load-retry');await retry.waitFor({state:'visible',timeout:11000});assert.match(await page.locator('#load-state').innerText(),/Повторите загрузку/);
   hold=false;await retry.click();await page.locator('.tool').filter({hasText:'Конструктор сайта'}).waitFor();await page.waitForFunction(name=>document.querySelector('.account-menu-meta strong')?.textContent===name,me.name);
   // Aborted, late responses must not replace the identity confirmed by the retry.
   for(const item of pending){await item.route.fulfill({json:{...me,name:'Устаревшее имя'}}).catch(()=>{});item.resolve();}
   await page.locator('.tool').filter({hasText:'Конструктор сайта'}).click();await page.locator('#workspace-start[open]').waitFor();await page.locator('.start-continue').click();await page.waitForFunction(t=>!document.querySelector('#workspace-start[open]')&&state.title===t,marker);assert.deepEqual(await page.evaluate(()=>({id:SiteBuilder.versionContext().id,title:state.title,layout:JSON.stringify(state.layout)})),original);assert.ok(await page.evaluate(()=>SiteBuilder.isDirty()));
   await page.unroute('**/editor-api/me',profileRoute);console.log('PASS stalled /me bounded; retry restores menu and same dirty site',width);
   // A slow archive must not hold back other archives or tool navigation.
   let listHold=true;const delayed=[];await page.route('**/editor-api/me',r=>r.fulfill({json:me}));
   const article=(title,id)=>({id,title,savedAt:'2026-11-01T00:00:00Z'});
   await page.route('**/editor-api/drafts?brand=hasl',r=>r.fulfill({json:[article('Доступная работа','qa-available')]}));
   await page.route('**/editor-api/email-projects',r=>r.fulfill({json:[]}));await page.route('**/editor-api/site-builder/projects',r=>r.fulfill({json:[]}));
   await page.route('**/editor-api/drafts?brand=outmax',async r=>{if(listHold)await new Promise(resolve=>delayed.push({route:r,resolve}));else await r.fulfill({json:[article('Работа после повтора','qa-fresh')]});});
   await page.locator('.workspace-home').click();await page.waitForURL(base+'/');await page.locator('#recent').getByText('Доступная работа',{exact:true}).waitFor({timeout:3000});await page.locator('.tool').filter({hasText:'Конструктор сайта'}).waitFor();await page.locator('#home-load-retry').waitFor({state:'visible',timeout:11000});
   listHold=false;await page.locator('#home-load-retry').click();await page.locator('#recent').getByText('Работа после повтора',{exact:true}).waitFor();
   for(const item of delayed){await item.route.fulfill({json:[article('Устаревшая работа','qa-stale')]}).catch(()=>{});item.resolve();}
   assert.equal(await page.getByText('Устаревшая работа',{exact:true}).count(),0);await page.locator('#search').fill('Доступная');assert.equal(await page.locator('#recent .work').count(),1);await page.locator('#search').fill('');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS independent archives, bounded wait, retry/search and late response guard',width);
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
 // Terminal failures expose a stable, accessible retry action, without a full page reload.
 if(capture)for(const width of [1440,390]){const p=await context.newPage();await p.setViewportSize({width,height:width===390?844:1000});await p.emulateMedia({reducedMotion:'reduce'});let reads=0;await p.route('**/editor-api/me',r=>{reads++;return r.fulfill({status:503,json:{error:'QA unavailable'}});});await p.goto(base+'/');await p.waitForFunction(()=>document.querySelector('#home-load-retry:not([hidden])'));await p.waitForTimeout(700);await p.locator('#home-load-retry').waitFor({state:'visible'});await p.screenshot({path:'instructions/screens/home-load-retry-'+(width===390?'phone':'desktop')+'.png'});assert.ok(reads>=2);await p.close();}
 const guest=await context.newPage();await guest.route('**/editor-api/me',r=>r.fulfill({status:401,json:{error:'QA guest'}}));await guest.goto(base+'/');await guest.locator('#profile').getByText('Привет, Гость',{exact:true}).waitFor();assert.equal(await guest.locator('#home-load-retry').isVisible(),false);await guest.locator('.tool').last().click();await guest.locator('#guest-login[open]').waitFor();await guest.close();console.log('PASS guest login is not retried as a network error');
};
if(require.main===module){const fs=require('node:fs'),{chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8957',c=base.startsWith('https:')?JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')):{user:'wiki-demo',password:'wiki-local-demo-only'},browser=await chromium.launch({channel:'msedge',headless:false});try{const ctx=await browser.newContext();assert.ok((await ctx.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base},timeout:90000})).ok());await module.exports(ctx,base);}finally{await browser.close();}})().catch(e=>{console.error(e.message.split('Call log:')[0]);process.exit(1)});}
