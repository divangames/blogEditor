// Read-only production smoke. Never save drafts or call the paid AI provider.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  const response=await context.request.get(base+'/editor-api/article-assist/status');
  assert.equal(response.status(),200);const status=await response.json();assert.equal(typeof status.available,'boolean');
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  for(const brand of ['/','/hasl/']){
   await page.goto(base+brand,{waitUntil:'domcontentloaded'});await page.locator('#article-commands-open').waitFor();
   for(const id of ['article-proposal-open','article-commands-open','article-focus-toggle','article-macros-open','article-find-open']){const button=page.locator('#'+id);assert.equal(await button.locator('svg').count(),1);assert.equal(await button.textContent(),'');assert.ok(await button.getAttribute('aria-label'));}
   const linkCommands=await page.evaluate(()=>ArticleCommands.list('link.'));assert.deepEqual(linkCommands.map(c=>c.id).sort(),['link.insert','link.open']);assert.ok(linkCommands.every(c=>!c.repeatable));
   await page.evaluate(()=>{const n=canvas.querySelector('header p')?.firstChild;if(!n)return;const r=document.createRange();r.selectNodeContents(n);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(r);lastRange=r.cloneRange();});
   const beforeLink=await page.locator('#canvas').innerHTML();await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('ссылк');
   const linkAction=page.locator('#article-command-results button').filter({hasText:'Вставить или изменить ссылку'});assert.equal(await linkAction.count(),1);assert.equal(await linkAction.isEnabled(),true);page.once('dialog',d=>d.dismiss());await linkAction.click();assert.equal(await page.locator('#canvas').innerHTML(),beforeLink,'production link prompt cancellation is read-only');
   const demoHTML=await page.evaluate(()=>{
    const root=document.createElement('article');root.className='om-guide';root.innerHTML='<h1>Проверка сравнения</h1><div class="om-table-scroll"><table class="om-comparison-table"><thead><tr><th>Модель</th><th>Цена</th><th>Размеры</th><th>Наличие</th><th>Материалы и свойства</th></tr></thead><tbody><tr><td><span class="om-model-cell"><img class="om-model-thumb" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22%3E%3Crect width=%2252%22 height=%2252%22 fill=%22gray%22/%3E%3C/svg%3E"><a href="#demo">Зимние Сапоги Nike Winterproof High цвет Серый</a></span></td><td>4990 ₽</td><td>37, 38, 39, 40, 41, 42</td><td>В наличии</td><td>Материал верха: натуральная кожа и плотный текстиль. Подкладка: мягкий флис. Подошва: резина. Назначение: повседневные прогулки.</td></tr></tbody></table></div>';
    return previewDocument(adminBody({root}));
   });
   const demo=await context.newPage();await demo.setViewportSize({width:390,height:844});await demo.setContent(demoHTML);
   assert.deepEqual(await demo.locator('thead th').allTextContents(),['Модель','Наименование','Цена','Размеры','Наличие','Материалы и свойства']);assert.equal(await demo.locator('tbody img').count(),1);assert.ok((await demo.locator('tbody tr').boundingBox()).height<=125);assert.equal(await demo.locator('tbody td').first().evaluate(n=>getComputedStyle(n).padding),'8px');assert.equal(await demo.locator('tbody td').nth(1).evaluate(n=>getComputedStyle(n).overflowWrap),'normal');
   const photo=demo.locator('tbody td').first(),name=demo.locator('tbody td').nth(1),before=await photo.boundingBox(),nameBefore=await name.boundingBox();const delta=await demo.locator('.om-table-scroll').evaluate(n=>{n.scrollLeft=150;return n.scrollLeft;});assert.ok(delta>0);assert.ok(Math.abs((await photo.boundingBox()).x-before.x)<2);assert.ok(Math.abs((await name.boundingBox()).x-nameBefore.x+delta)<2);await demo.setViewportSize({width:1440,height:900});assert.ok(await demo.locator('.om-table-scroll').evaluate(n=>n.scrollWidth>n.clientWidth));assert.ok((await demo.locator('tbody tr').boundingBox()).height<=125);await demo.close();
   assert.ok((await page.evaluate(()=>ArticleCommands.list())).some(s=>s.id==='review.applyProposal'));
   assert.ok((await page.evaluate(()=>ArticleCommands.list())).some(s=>s.id==='export.docx'));
   await page.locator('#article-find-open').click();await page.locator('#article-find-query').fill('статьи');await page.locator('#article-find-status').waitFor();await page.keyboard.press('Escape');
   await page.locator('#article-macros-open').click();await page.locator('#article-macros-dialog').waitFor({state:'visible'});await page.locator('#article-macros-dialog [data-close]').click();
   await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('фокус');
   await page.locator('#article-command-results button').click();assert.equal(await page.locator('#article-focus-toggle').getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#article-focus-toggle').getAttribute('aria-pressed'),'false');
   await page.setViewportSize({width:375,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.setViewportSize({width:1440,height:1000});
  }
  for(const id of ['article-commands','article-proposals','article-focus','article-portable','article-macros','article-ai-settings','article-mcp','article-find']){
   await page.goto(base+'/instructions/#'+id,{waitUntil:'domcontentloaded'});
   const titles=await page.locator('#wiki-view h1,#wiki-view h2').allTextContents();
   assert.ok(titles.length && !titles.includes('Инструкция не найдена'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: production commands, focus, 2 brands, mobile, 8 guide links, no JavaScript errors; AI configured:',status.available);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
