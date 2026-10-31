const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{const base='https://news.outmax-office.ru',c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),b=await chromium.launch({channel:'msedge',headless:true});try{
const context=await b.newContext({httpCredentials:{username:c.user,password:c.password},viewport:{width:1440,height:1000}});assert.ok((await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}})).ok());
const get=async url=>{const r=await context.request.get(base+url);assert.equal(r.status(),200,url);return r.text();};
const reference=await get('/editor-api/site-builder/reference'),projects=await get('/editor-api/site-builder/projects');
const snap={reference:digest(reference),projects:digest(projects)};
if(process.argv.includes('--before')){fs.writeFileSync('release/hero-copy-live-before.json',JSON.stringify(snap));console.log('PASS live availability; reference/project fingerprints retained locally');return;}
const old=JSON.parse(fs.readFileSync('release/hero-copy-live-before.json','utf8'));assert.deepEqual(snap,old,'saved projects and banner defaults preserved');
const meta=JSON.parse(fs.readFileSync('release/hero-copy-publish-state.json','utf8'));
for(const name of ['renderer.js','template.html'])assert.equal((await get('/site-builder/assets/'+name)).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(meta.full,'site-builder',name),'utf8').replace(/\r\n/g,'\n'),name);
const p=await context.newPage(),writes=[],errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){writes.push(r.request().method());return r.abort();}return new URL(r.request().url()).origin===base?r.continue():r.abort();});
await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>typeof state!=='undefined'&&state&&document.getElementById('desktop').__haslDocState===state);
const exports=await p.evaluate(()=>['hasl','hasle'].map(site=>({site,html:R.build(state,products,content,{clean:true,site})})));
const out=await context.newPage();await out.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
for(const {site,html} of exports)for(const width of [390,1440]){await out.setViewportSize({width,height:1000});await out.setContent(html);assert.equal(await out.locator('.mobile-sale-heading').innerText(),'ЕСЛИ ОДНОЙ\nПАРЫ МАЛО');assert.equal(await out.locator('.finder-hero-title').innerText(),'ВЫБЕРИ СВОЮ ПАРУ');assert.equal(await out.locator('.hero-actions .btn').innerText(),'НАЧАТЬ');assert.equal(await out.locator('.sale-action').getAttribute('href'),'https://'+(site==='hasle'?'haslestore.com':'xn--80awro.xn--p1ai')+'/news/aktsiya-skidka-50-protsentov-na-2-paru');assert.ok(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await p.goto(base+'/instructions/#site-hero-layout');await p.getByRole('heading',{name:'ХАСЛ: главный экран и одинаковые отступы',exact:true}).waitFor();assert.ok((await get('/instructions/screens/site-hero-copy-phone.png')).length>1000);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(digest(await get('/editor-api/site-builder/projects')),old.projects);console.log('LIVE_PASS exact deployed assets, phone/desktop copy and links for both shops, guide, unchanged reference/projects, no project writes');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
