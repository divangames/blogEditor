const assert=require('node:assert/strict');const {chromium}=require('../release/ui-check/node_modules/playwright');
async function check(context,base,{capture=false}={}){
 const page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:false}}));
 try{for(const path of ['/','/hasl/','/email/']){
  await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.EmailCommands||window.ArticleCommands);await page.locator('#mobile-writing-toggle').waitFor({state:'attached'});
  const snapshot=()=>page.evaluate(()=>window.EmailCommands?JSON.stringify([emailProjectBridge.snapshot(),emailEditorHistoryIndex]):JSON.stringify([encodedBody(),articleHistoryIndex]));
  const before=await snapshot();await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('#mobile-writing-toggle').isVisible(),false);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'К тексту',exact:true}).click();assert.equal(await page.locator('#mobile-writing-toggle').getAttribute('aria-pressed'),'true');assert.equal(await snapshot(),before);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(capture&&path==='/'&&width===390)await page.screenshot({path:'instructions/screens/mobile-writing.png'});
   await page.getByRole('button',{name:'К инструментам',exact:true}).click();assert.equal(await snapshot(),before);await page.getByRole('button',{name:'К тексту',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('#mobile-writing-toggle').getAttribute('aria-pressed'),'false');
  }console.log('PASS mobile focus '+path+': two widths, desktop hidden, return/Escape, document unchanged');
 }}finally{await page.close();}
}
module.exports=check;
if(require.main===module)(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',context=await browser.newContext();await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await check(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
