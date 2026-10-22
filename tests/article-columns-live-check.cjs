// Controlled in-memory fixture on the deployed runtime; all server writes are blocked.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const base='https://news.outmax-office.ru',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const login=await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});assert.ok(login.ok());
  await context.route('**/*',route=>new URL(route.request().url()).origin===base&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  await require('./article-columns-check.cjs')(context,base,{readOnly:true});
  console.log('PASS live columns: both brands, real deployed runtime/guide, only browser fixture, no server saves/uploads/sends');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
