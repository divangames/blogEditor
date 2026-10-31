const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 if(capture)assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const fs=require('node:fs');const banner=fs.readFileSync(require.resolve('./workspace-resume-check.cjs'),'utf8').match(/const banner='([^']+)';/)[1];
 const lists={outmax:['Новая статья — OUTMAX','Без названия','Новая статья о кроссовках','Осенний гардероб'],hasl:['Новая статья – ХАСЛ','Новая статья','Зимняя коллекция'],email:['Новая рассылка OUTMAX','Новая рассылка ХАСЛ','Новая рассылка','Без темы','Новая рассылка к 8 Марта','Письмо о новой коллекции'],site:['Новый сайт','Новый проект — ХАСЛ','Новая страница','Страница осенней коллекции']};
 const expected=['Новая статья о кроссовках','Осенний гардероб','Зимняя коллекция','Новая рассылка к 8 Марта','Письмо о новой коллекции','Страница осенней коллекции'];
 await context.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.fulfill({status:503,json:{error:'QA: writes blocked'}}));
 await context.route('https://workspace-demo.invalid/**',r=>r.fulfill({contentType:'image/svg+xml',body:banner}));
 await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 for(const key of Object.keys(lists)){
  const items=lists[key].map((title,i)=>({id:key+'-'+i,title,fileName:title,subject:title,updated:'2026-10-31T10:00:00Z',thumbnail:i%2?'https://workspace-demo.invalid/'+key+'.svg':''}));
  const url=key==='site'?'**/editor-api/site-builder/projects':key==='email'?'**/editor-api/email-projects':'**/editor-api/drafts?brand='+key;
  await context.route(url,r=>r.fulfill({json:key==='email'?{items}:items}));
 }
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/');await page.waitForFunction(()=>document.querySelectorAll('#recent .work').length===6);
 assert.deepEqual((await page.locator('#recent .work-info strong').allTextContents()).sort(),expected.sort());
 await page.locator('#search').fill('Новая');assert.equal(await page.locator('#recent .work').count(),2);await page.locator('#search').fill('');
 if(capture){await page.locator('#search').blur();await page.locator('.work-banner img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));await page.screenshot({path:'instructions/screens/workspace-recent-named.png',fullPage:true});}
 for(const [url,titles] of [['/articles/',expected.filter(x=>/статья|гардероб|Зимняя/.test(x))],['/OUTMAX.html',expected.filter(x=>/рассылка|Письмо/.test(x))],['/site-builder/hasl/',expected.filter(x=>/^Страница/.test(x))]]){
  await page.goto(base+url);await page.locator('#workspace-start[open]').waitFor();await page.waitForFunction(()=>!document.querySelector('.start-list [role=status]')&&document.querySelector('.start-list .work'));
  assert.deepEqual((await page.locator('.start-list .work-info strong').allTextContents()).sort(),titles.sort());assert.ok(await page.locator('.start-continue').isEnabled());
 }
 assert.deepEqual(errors,[]);await page.close();console.log('PASS recent: placeholder titles hidden on home and all starters; descriptive names/search and Continue retained; no document writes');
};
if(require.main===module){const {chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8911';const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});assert.ok((await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}})).ok());await module.exports(context,base);}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});}
