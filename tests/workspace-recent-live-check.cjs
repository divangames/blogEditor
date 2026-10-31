// Audit actual recent summaries and image URLs without saving user documents or logging their contents.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{const base='https://news.outmax-office.ru',c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),browser=await chromium.launch({channel:'msedge',headless:false});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},httpCredentials:{username:c.user,password:c.password}});
 assert.ok((await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}})).ok());
 await context.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.fulfill({status:503,json:{error:'QA: writes blocked'}}));
 await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 const paths=['/drafts?brand=outmax','/drafts?brand=hasl','/email-projects','/site-builder/projects'],groups=[];
 for(const path of paths){const r=await context.request.get(base+'/editor-api'+path);assert.ok(r.ok());const data=await r.json();groups.push(Array.isArray(data)?data:data.items);}
 const placeholder=value=>!String(value||'').trim()||/^(?:новая (?:статья|рассылка|страница)|новый (?:сайт|проект|шаблон)|без (?:названия|темы))(?:\s*(?:[—–-]\s*)?(?:outmax|хасл|hasl))?$/iu.test(String(value).normalize('NFKC').replace(/\s+/g,' ').trim());
 const title=x=>x.fileName||x.subject||x.title||'',valid=x=>x.id!=='email-editor'&&!placeholder(title(x));
 const expected=groups.flat().filter(valid).sort((a,b)=>(b.updated||b.savedAt||'').localeCompare(a.updated||a.savedAt||'')).slice(0,60);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#recent .work,#recent .empty'));
 assert.ok(JSON.stringify(await page.locator('#recent .work-info strong').allTextContents())===JSON.stringify(expected.map(title)),'Actual home matches named server materials');
 const expectedCovers=expected.filter(x=>/^(?:https?:\/\/|\/(?!\/))/i.test(x.thumbnail||'')).map(x=>x.thumbnail);assert.ok(JSON.stringify(await page.locator('#recent .work-banner img').evaluateAll(ns=>ns.map(n=>n.getAttribute('src'))))===JSON.stringify(expectedCovers),'Actual covers come from server summaries');
 const covers=await page.locator('#recent .work-banner img').evaluateAll(async ns=>Promise.all(ns.map(async n=>{try{await n.decode();return n.naturalWidth>0;}catch{return false}})));assert.ok(covers.every(Boolean),'All actual recent banner URLs load');
 for(const [url,indexes] of [['/articles/',[0,1]],['/OUTMAX.html',[2]],['/site-builder/hasl/',[3]]]){await page.goto(base+url);await page.locator('#workspace-start[open]').waitFor();await page.waitForFunction(()=>!document.querySelector('.start-list').textContent.includes('Загружаем…'));const items=indexes.flatMap(i=>groups[i]).filter(valid).sort((a,b)=>(b.updated||b.savedAt||'').localeCompare(a.updated||a.savedAt||'')).slice(0,8);assert.ok(JSON.stringify(await page.locator('.start-list .work-info strong').allTextContents())===JSON.stringify(items.map(title)),'Starter matches named server materials');}
 assert.deepEqual(errors,[]);console.log('LIVE_RECENT_PASS',JSON.stringify({serverItems:groups.flat().length,hiddenPlaceholders:groups.flat().filter(x=>placeholder(title(x))).length,homeCards:expected.length,loadedActualBanners:covers.length,allStarters:true,pageErrors:0,serverWritesBlocked:true}));
}finally{await browser.close()}})().catch(e=>{console.error(String(e.message).split('Call log:')[0]);process.exit(1)});
