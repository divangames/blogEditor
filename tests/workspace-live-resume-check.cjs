const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const base='https://news.outmax-office.ru';
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:false});
 try{
 const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password},viewport:{width:1440,height:1000}});
 assert.ok((await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}})).ok());
 let blocked=0;
 await context.route('**/*',r=>{if(['GET','HEAD','OPTIONS'].includes(r.request().method()))return r.continue();blocked++;return r.fulfill({status:503,json:{error:'QA: server writes blocked'}})});
 await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 const get=async path=>{const r=await context.request.get(base+'/editor-api'+path);assert.ok(r.ok());return r.json()};
 const articles={outmax:await get('/drafts?brand=outmax'),hasl:await get('/drafts?brand=hasl')},emails=(await get('/email-projects')).items,sites=await get('/site-builder/projects');
 const page=await context.newPage();let dialogs=0;page.on('dialog',async d=>{dialogs++;await d.accept()});page.on('pageerror',e=>console.log('PAGE_ERROR',e.stack));
 const home=async()=>{const before=dialogs;await page.locator('.workspace-home').click();await page.waitForURL(base+'/');assert.equal(dialogs,before);console.log('HOME_OK')};
 const resume=async label=>{await page.locator('.tool').filter({hasText:label}).click();await page.locator('#workspace-start[open]').waitFor();await page.locator('.start-continue').click();try{await page.waitForFunction(()=>!document.querySelector('#workspace-start[open]'))}catch(e){console.log('RESUME_DIAGNOSTIC',await page.evaluate(()=>({path:location.pathname,error:document.querySelector('.start-error')?.textContent,button:document.querySelector('.start-continue')?.textContent,adapter:typeof WorkspaceAdapter,ready:typeof articleBackupReady!=='undefined'?articleBackupReady:null})));throw e}};
 const marker='QA-local-'+Date.now(),report={};
 for(const brand of ['outmax','hasl']){
  console.log('CHECK',brand);const list=Array.isArray(articles[brand])?articles[brand]:articles[brand].items;assert.ok(list.length);
  const item=list[0],path=brand==='hasl'?'/hasl/':'/articles/';await page.goto(base+path+'?article='+encodeURIComponent(item.id));await page.waitForFunction(()=>typeof articleBackupReady!=='undefined'&&articleBackupReady);
  const existingHtml=await page.locator('#canvas').innerHTML();const title=marker+'-'+brand;
  await page.locator('#page-title').fill(title);await page.locator('#canvas').evaluate((n,t)=>{const p=document.createElement('p');p.textContent=t;n.append(p);n.dispatchEvent(new Event('input',{bubbles:true}))},title);
  await home();await resume('Статьи');await page.waitForFunction(t=>document.getElementById('page-title')?.value===t,title);assert.equal(new URL(page.url()).pathname,path);assert.ok((await page.locator('#canvas').innerHTML()).includes(existingHtml));assert.ok((await page.locator('#canvas').innerText()).includes(title));
  await page.reload();await page.waitForFunction(t=>document.getElementById('page-title')?.value===t,title);report[brand]={unsaved:true,reload:true,brand:true,originalBodyPreserved:true};
 }
 console.log('CHECK email');assert.ok(emails.length);const mail=emails.find(x=>x.thumbnail)||emails[0];await page.goto(base+'/OUTMAX.html?project='+encodeURIComponent(mail.id));await page.waitForFunction(()=>window.emailProjectBridge&&window.WorkspaceAdapter);await page.evaluate(()=>WorkspaceAdapter.resume());
 const original=await page.evaluate(()=>emailProjectBridge.snapshot()),assets=await page.evaluate(()=>emailProjectBridge.assetEntries().map(([path,blob])=>[path,blob.size]));
 await page.locator('#subject').fill(marker+'-email');await page.locator('#preheader').fill(marker+'-preheader');await page.locator('#canvas').evaluate((n,t)=>{const p=document.createElement('p');p.textContent=t;n.append(p);n.dispatchEvent(new Event('input',{bubbles:true}))},marker+'-email-body');
 await home();await resume('Email-редактор');assert.equal(await page.locator('#subject').inputValue(),marker+'-email');assert.equal(await page.locator('#preheader').inputValue(),marker+'-preheader');assert.ok((await page.locator('#canvas').innerText()).includes(marker+'-email-body'));assert.deepEqual(await page.evaluate(()=>emailProjectBridge.assetEntries().map(([path,blob])=>[path,blob.size])),assets);
 await page.reload();await page.evaluate(()=>WorkspaceAdapter.resume());assert.equal(await page.locator('#subject').inputValue(),marker+'-email');report.email={unsaved:true,reload:true,assetsPreserved:true};
 console.log('CHECK site');assert.ok(sites.length);const site=sites[0];await page.goto(base+'/site-builder/hasl/?page='+encodeURIComponent(site.id));await page.waitForFunction(()=>window.WorkspaceAdapter);await page.evaluate(()=>WorkspaceAdapter.resume());
 const layout=await page.evaluate(()=>JSON.stringify(state.layout));await page.evaluate(t=>{state.title=t;SiteBuilder.markChanged()},marker+'-site');await home();await resume('Конструктор сайта');assert.equal(await page.evaluate(()=>state.title),marker+'-site');assert.equal(await page.evaluate(()=>JSON.stringify(state.layout)),layout);await page.reload();await page.evaluate(()=>WorkspaceAdapter.resume());assert.equal(await page.evaluate(()=>state.title),marker+'-site');report.site={unsaved:true,reload:true,layoutPreserved:true};
 assert.deepEqual(await get('/drafts?brand=outmax'),articles.outmax);assert.deepEqual(await get('/drafts?brand=hasl'),articles.hasl);assert.deepEqual((await get('/email-projects')).items,emails);assert.deepEqual(await get('/site-builder/projects'),sites);report.blockedWrites=blocked;report.serverDocumentsUnchanged=true;console.log('LIVE_ROUNDTRIP_PASS '+JSON.stringify(report));fs.writeFileSync('tmp/live-workspace-roundtrip-report.json',JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
