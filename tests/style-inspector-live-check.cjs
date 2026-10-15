// Production inspection/copy only. Never apply, reset, save or send.
const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const entry of ['/','/hasl/','/email/','/OUTMAX.html']){
   const isolated=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   await isolated.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
   await isolated.route('https://fonts.googleapis.com/**',r=>r.abort());await isolated.route('https://fonts.gstatic.com/**',r=>r.abort());await isolated.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
   const page=await isolated.newPage();page.on('pageerror',e=>errors.push(e.message));
   const email=entry.includes('email')||entry.includes('OUTMAX'),prefix=email?'email':'article';await page.goto(base+entry,{waitUntil:'domcontentloaded'});await page.locator('#'+prefix+'-style-inspector-open').waitFor();
   const before=await page.evaluate(email=>email?[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]:[articleEditorSnapshot().body,$('#page-title').value,$('#filename').value,articleHistory.length],email);
   await page.evaluate(email=>{const text=[...canvas.querySelectorAll('p')].flatMap(p=>[...p.childNodes]).find(n=>n.nodeType===3&&n.textContent.trim());if(!text)throw new Error('Expected plain text');const range=document.createRange();range.selectNodeContents(text);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);if(email)emailTypographyRange=range;else lastRange=range;},email);
   await page.locator('#'+prefix+'-style-inspector-open').click();assert.equal(await page.locator('#'+prefix+'-style-values dt').count(),5);await page.locator('#'+prefix+'-style-copy').click();await page.keyboard.press('Escape');
   for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});await page.locator('#'+prefix+'-style-inspector-open').click();assert.ok(await page.locator('#'+prefix+'-style-inspector-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.keyboard.press('Escape');}
   assert.deepEqual(await page.evaluate(email=>email?[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]:[articleEditorSnapshot().body,$('#page-title').value,$('#filename').value,articleHistory.length],email),before);
   await isolated.close();
  }
  for(const [id,title] of [['article-style-inspector','Инспектор и копирование оформления статьи'],['email-style-inspector','Инспектор и копирование оформления письма']]){await page.goto(base+'/instructions/#'+id);await page.getByRole('heading',{name:title,exact:true}).waitFor();}
  assert.deepEqual(errors,[]);console.log('PASS: deployed article/email/standalone inspector and copy, 4 entries, 3 widths, 2 guide links; unchanged content/fields/history, no apply/reset/saves/sends');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
