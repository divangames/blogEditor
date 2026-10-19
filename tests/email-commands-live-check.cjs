// Production inspection only: do not change or save email content, or send messages.
const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const entry of ['/email/','/OUTMAX.html']){
   await page.goto(base+entry,{waitUntil:'domcontentloaded'});await page.locator('#email-commands-open').waitFor();
   assert.equal(await page.evaluate(()=>typeof ArticleCommands),'undefined');assert.equal(await page.locator('#email-commands-open svg').count(),1);assert.equal(await page.locator('#email-commands-open').textContent(),'');
   const before=await page.locator('#canvas').innerHTML(),metadata=await page.evaluate(()=>[$('#subject').value,$('#preheader').value,emailEditorHistory.length]);
   await page.evaluate(()=>{const text=[...canvas.querySelectorAll('p,h1')].flatMap(n=>[...n.childNodes]).find(n=>n.nodeType===3&&n.textContent.trim());if(!text)throw new Error('No demo text');const range=document.createRange();range.selectNodeContents(text);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);emailTypographyRange=range.cloneRange();});
   await page.keyboard.press('Control+Shift+k');await page.locator('#email-command-dialog[open]').waitFor();await page.locator('#email-command-search').fill('ссылк');page.once('dialog',d=>d.dismiss());await page.locator('#email-command-results').getByRole('button',{name:'Вставить или изменить ссылку',exact:true}).click();
   for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await page.locator('#email-commands-open').click();await page.locator('#email-command-search').fill('курсив');assert.equal(await page.locator('#email-command-results button').count(),1);await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   await page.locator('#email-commands-open').click();await page.locator('#email-command-search').fill('фокус');await page.keyboard.press('Enter');assert.equal(await page.locator('.sidebar').isVisible(),false);await page.keyboard.press('Escape');assert.equal(await page.locator('.sidebar').isVisible(),true);
   assert.equal(await page.locator('#canvas').innerHTML(),before);assert.deepEqual(await page.evaluate(()=>[$('#subject').value,$('#preheader').value,emailEditorHistory.length]),metadata);
  }
  await page.goto(base+'/instructions/#email-commands');await page.getByRole('heading',{name:'Команды и режим фокуса письма',exact:true}).waitFor();assert.deepEqual(errors,[]);
  console.log('PASS: production email and standalone commands, canceled link, focus, 3 widths and guide; unchanged content/history/fields, no saves or sends');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
