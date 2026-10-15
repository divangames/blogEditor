// Read-only production smoke: no replace, accept, save, campaign or AI POST.
const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  let providerCalls=0;await context.route('**/article-assist/propose',r=>{providerCalls++;return r.fulfill({status:503,json:{error:'QA forbids provider calls'}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const entry of ['/email/','/OUTMAX.html']){
   await page.goto(base+entry,{waitUntil:'domcontentloaded'});await page.locator('#email-proposal-open').waitFor();await page.locator('#email-editor-footer a').first().waitFor();
   const before=await page.evaluate(()=>[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]);
   for(const id of ['email-find-open','email-proposal-open']){assert.equal(await page.locator('#'+id+' svg').count(),1);assert.equal(await page.locator('#'+id).textContent(),'');assert.ok(await page.locator('#'+id).getAttribute('aria-label'));}
   for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await page.locator('#email-find-open').click();await page.locator('#email-find-query').fill('zzzzz-qa-no-match');assert.match(await page.locator('#email-find-status').textContent(),/Совпадений нет/);
    await page.locator('#email-find-scope').selectOption('subject');assert.equal(await page.locator('#email-find-all').isEnabled(),false);assert.ok(await page.locator('#email-find-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.keyboard.press('Escape');await page.waitForFunction(()=>!CSS.highlights.has('email-find'));
   }
   await page.evaluate(()=>{const paragraph=[...canvas.querySelectorAll('p')].find(p=>[...p.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())),text=[...paragraph.childNodes].find(n=>n.nodeType===3&&n.textContent.trim()),range=document.createRange();range.selectNodeContents(text);EmailTextTools.select(range);});
   await page.locator('#email-proposal-open').click();await page.locator('#email-proposal-text').fill('Демонстрационный вариант, который будет отклонён.');await page.locator('#email-proposal-reject').click();
   assert.deepEqual(await page.evaluate(()=>[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]),before);
   assert.doesNotMatch(await page.evaluate(()=>emailDocument(activeSite)),/email-find-dialog|email-proposal-dialog/);
  }
  for(const [id,title] of [['email-find','Поиск и замена в письме'],['email-proposals','Предложение правки текста письма']]){await page.goto(base+'/instructions/#'+id);await page.getByRole('heading',{name:title,exact:true}).waitFor();}
  assert.equal(providerCalls,0);assert.deepEqual(errors,[]);console.log('PASS: production and standalone email find/proposals, 3 widths, protected no-match/explicit field, reject, 2 guide links; unchanged document/history/fields, no AI POST/saves/sends');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
