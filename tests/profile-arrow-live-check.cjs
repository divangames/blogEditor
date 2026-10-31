const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password}});
  await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}});
  for(const path of ['/','/hasl/','/OUTMAX.html']){const r=await context.request.get(base+path);assert.equal(r.status(),200);assert.ok((await r.text()).includes('id="shared-header-state-arrows"'),path);}
  await require('./profile-arrow-check.cjs')(context,base,{live:true});
  console.log('LIVE_PASS shared profile arrows and exact legacy header patch; production mutations blocked, NotiSend mocked');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
