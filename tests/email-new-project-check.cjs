const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878',entry=process.env.EMAIL_NEW_ENTRY||'/email/',ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 if(process.env.EMAIL_NEW_BLOCK_ASSET)await page.route('**/notisend-panel.js*',r=>r.abort());
 for(const brand of ['outmax','hasl'])for(const variant of [...(brand==='hasl'?['a','b','c']:['a','b']),'blank']){
  await page.goto(base+entry);await page.locator('#new-email-project').click();
  const before=await page.locator('#canvas').innerHTML();
  await page.locator('#email-new-brand').selectOption(brand);
  assert.equal(await page.locator('#email-new-template option').count(),brand==='hasl'?4:3);
  await page.locator('#email-new-cancel').click();assert.equal(await page.locator('#canvas').innerHTML(),before);
  await page.locator('#new-email-project').click();await page.locator('#email-new-brand').selectOption(brand);
  await page.locator('#email-new-site').selectOption(brand+'_com');await page.locator('#email-new-template').selectOption(variant);
  await page.locator('.email-new-dialog button[type=submit]').click();await page.locator('.email-new-dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>activeSite),brand+'_com');assert.equal(await page.evaluate(()=>emailImportState.template),brand+'-'+variant);
  assert.match(await page.locator('#subject').inputValue(),new RegExp(brand==='hasl'?'ХАСЛ':'OUTMAX'));
  assert.equal(await page.evaluate(()=>emailEditorHistory.length),1);
  assert.match(await page.evaluate(()=>emailDocument(activeSite)),/\[%unsubscribe_link%\]/);
  console.log('PASS new email',brand,variant);
 }
 await page.goto(base+entry);
 await page.locator('#subject').fill('Несохранённая работа');
 await page.route('**/editor-api/email-projects/**',r=>r.request().method()==='POST'?r.fulfill({status:503,json:{error:'Тестовая ошибка сохранения'}}):r.continue());
 await page.locator('#new-email-project').click();await page.locator('#email-new-template').selectOption('blank');
 await page.locator('.email-new-dialog button[type=submit]').click();await page.locator('#email-new-error').filter({hasText:'Тестовая ошибка'}).waitFor();
 assert.equal(await page.locator('#subject').inputValue(),'Несохранённая работа');
 await page.keyboard.press('Escape');
 await page.goto(base+entry);await page.locator('#new-email-project').click();const before=await page.locator('#canvas').innerHTML();
 await page.route('**/email-templates/**',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.locator('.email-new-dialog button[type=submit]').click();
 await page.locator('#email-new-error').filter({hasText:'Не удалось'}).waitFor();assert.equal(await page.locator('#canvas').innerHTML(),before);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:850});assert.ok(await page.locator('.email-new-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
 await page.keyboard.press('Escape');assert.equal(await page.locator('.email-new-dialog').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS cancel, error preservation, mobile, Escape, single history');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

