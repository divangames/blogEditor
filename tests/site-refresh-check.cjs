const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Demo only');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const seed=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:Object.keys(seed).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.frameLocator('#desktop').locator('[contenteditable]').first().waitFor({state:'attached'});
 await page.evaluate(()=>{state.autoRefresh=false;clearInterval(syncTimer);state.texts['refresh-demo']='Свой текст';state.analytics={hasl:{yandexCounter:'12345678'}};});
 const original=await page.evaluate(()=>JSON.stringify({texts:state.texts,analytics:state.analytics,reviews:state.reviews,layout:state.layout}));
 const contentData=await page.evaluate(()=>structuredClone(content));let calls=0,fail=false;
 await page.route('**/editor-api/site-builder/sync',async r=>{calls++;assert.deepEqual(r.request().postDataJSON().kinds,['products','reviews','news']);await new Promise(resolve=>setTimeout(resolve,400));await r.fulfill(fail?{status:503,json:{error:'Источник временно недоступен'}}:{json:{content:contentData,results:{products:{count:20},reviews:{count:10},news:{count:3},statistics:{errors:[]}}}});});
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  const button=page.locator('.toolbar-actions > #refresh-all');assert.ok(await button.isVisible());assert.ok(await button.locator('.studio-button-label').isVisible());assert.equal(await page.locator('.studio-project-menu[open]').count(),0);
  await button.click();assert.ok(await button.isDisabled());assert.equal(await button.getAttribute('aria-busy'),'true');await page.waitForFunction(()=>!syncing);
  assert.equal(await button.locator('svg').count(),1);assert.equal(await button.innerText(),'Обновить данные');assert.match(await page.locator('#data-status').innerText(),/Данные обновлены/);
  assert.equal(await page.evaluate(()=>JSON.stringify({texts:state.texts,analytics:state.analytics,reviews:state.reviews,layout:state.layout})),original);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(capture&&[1440,390].includes(width))await page.screenshot({path:'instructions/screens/site-refresh-'+(width===390?'phone':'desktop')+'.png'});
 }
 fail=true;await page.locator('#refresh-all').click();await page.waitForFunction(()=>!syncing);assert.match(await page.locator('#data-status').innerText(),/Не удалось обновить/);assert.ok(await page.locator('#refresh-all').isEnabled());fail=false;await page.locator('#refresh-all').click();await page.waitForFunction(()=>!syncing);assert.equal(calls,7);assert.equal(await page.locator('#refresh-all svg').count(),1);
 await page.goto(base+'/instructions/#site-refresh');await page.getByRole('heading',{name:'Конструктор: обновить данные магазина',exact:true}).waitFor();await page.locator('#wiki-search').fill('обновить данные');assert.ok(await page.locator('a[href="#site-refresh"]').count());assert.deepEqual(errors,[]);await page.close();console.log('PASS refresh: visible desktop/mobile, one request per click, busy state, preserved edits, error/retry, persistent icon');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8900';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
