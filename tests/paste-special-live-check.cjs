// Production UI/cancel only; no OS clipboard, insertion, save or sending.
const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const errors=[];
  for(const entry of ['/','/hasl/','/email/','/OUTMAX.html']){
   const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
   await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const email=entry.includes('email')||entry.includes('OUTMAX'),prefix=email?'email':'article';await page.goto(base+entry);await page.locator('#'+prefix+'-paste-open').waitFor();
   const before=await page.evaluate(email=>email?[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]:[articleEditorSnapshot().body,$('#page-title').value,$('#filename').value,articleHistory.length],email);
   await page.evaluate(email=>{const node=[...canvas.querySelectorAll('p')].flatMap(p=>[...p.childNodes]).find(n=>n.nodeType===3&&n.length);if(!node)throw new Error('Expected plain text');const range=document.createRange();range.setStart(node,0);range.collapse(true);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);if(email)emailTypographyRange=range;else lastRange=range;},email);
   for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await page.locator('#'+prefix+'-paste-open').click();await page.locator('#'+prefix+'-paste-mode').selectOption('formatted');await page.locator('#'+prefix+'-paste-content').fill('Демонстрационный текст без вставки');
    assert.ok(await page.locator('#'+prefix+'-paste-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.keyboard.press('Escape');
   }
   assert.deepEqual(await page.evaluate(email=>email?[emailEditorSnapshot().body,$('#subject').value,$('#preheader').value,emailEditorHistory.length]:[articleEditorSnapshot().body,$('#page-title').value,$('#filename').value,articleHistory.length],email),before);
   for(const [id,title] of [['article-paste','Вставка текста и оформления в статью'],['email-paste','Вставка текста и оформления в письмо']]){await page.goto(base+'/instructions/#'+id);await page.getByRole('heading',{name:title,exact:true}).waitFor();}
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: deployed paste window, 4 entries, 3 widths, two modes/cancel and 2 guides; unchanged documents/fields/history, no OS clipboard/insertion/saves/sends');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
