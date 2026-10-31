// Read-only production verification: no project saves or external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password}});
  assert.ok((await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}})).ok());
  const get=async path=>{const r=await context.request.get(base+path);assert.equal(r.status(),200,path);return r.text();};
  const before=await get('/editor-api/site-builder/reference'),projects=await get('/editor-api/site-builder/projects');
  assert.equal((await get('/site-builder/assets/template.html')).replace(/\r\n/g,'\n'),fs.readFileSync('site-builder/template.html','utf8').replace(/\r\n/g,'\n'));
  assert.equal((await get('/site-builder/assets/renderer.js')).replace(/\r\n/g,'\n'),fs.readFileSync('site-builder/renderer.js','utf8').replace(/\r\n/g,'\n'));
  for(const path of ['/','/hasl/','/OUTMAX.html','/instructions/','/site-builder/hasl/'])await get(path);
  await require('./site-shared-promo-check.cjs')(context,base);
  for(const name of ['site-shared-promo-desktop','site-shared-promo-mobile','site-figma-benefits-desktop','site-figma-benefits-mobile'])assert.ok((await context.request.get(base+'/instructions/screens/'+name+'.png')).ok());
  assert.equal(await get('/editor-api/site-builder/reference'),before);assert.equal(await get('/editor-api/site-builder/projects'),projects);
  console.log('LIVE_PASS exact template, editor routes, responsive promotion/benefits, guides/screens; reference and projects unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
