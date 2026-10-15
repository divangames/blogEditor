// Read-only browser smoke check of the published UI; no document edits.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://news.outmax-office.ru';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password},headers:{Origin:base}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Loading an editor must not contact an external mailing service in this check.
  await page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:false,api_configured:false,smtp_configured:false}}));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  for(const route of ['/','/hasl/','/email/','/OUTMAX.html','/instructions/','/tiptap/']){
   await page.goto(base+route,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.documentElement.dataset.uiInput==='keyboard');
   await page.locator(route==='/tiptap/'?'#editor .tiptap':route==='/instructions/'?'#wiki-search':'#canvas').waitFor();
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow '+width);
    if(width<=390){
     const input=page.locator(route==='/instructions/'?'#wiki-search':route==='/tiptap/'?'#article-title':'#filename');
     assert.ok(parseFloat(await input.evaluate(e=>getComputedStyle(e).fontSize))>=16,route+' input');
    }
   }
   const menu=page.locator('.editor-switcher>summary');
   if(await menu.count()){
    await menu.click();await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(e=>document.activeElement===e),true,route+' focus');
   }
   console.log('PASS published:',route,'desktop/mobile, common UI, keyboard focus');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
