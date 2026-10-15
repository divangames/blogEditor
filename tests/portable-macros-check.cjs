const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/absent-photo.png',r=>r.fulfill({status:404,body:''}));
  fs.mkdirSync('output/wordcraft-qa/portable',{recursive:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function select(id){await page.evaluate(id=>{const node=document.getElementById(id).firstChild,range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();canvas.focus({preventScroll:true});},id);}
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});await page.locator('#article-macros-open').waitFor();await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(()=>{
    const image=document.createElement('canvas');image.width=240;image.height=100;const ctx=image.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,240,100);ctx.fillStyle='#111';ctx.font='24px Arial';ctx.fillText('OUTMAX QA',20,60);
    setBody('<header><h1>Проверка копии статьи</h1></header><p id="macro-first">Первый текст 👟</p><p id="macro-second">Другой текст 👟</p><h2>Раздел статьи</h2><p><strong>Жирный</strong> и <em>курсив</em>, <u>подчёркнутый</u>, <a href="https://example.com/sale">ссылка</a>.</p><ul><li>Первый пункт<ul><li>Вложенный пункт</li></ul></li><li>Второй пункт</li></ul><ol start="3"><li>Третий пункт</li><li>Четвёртый пункт</li></ol><div class="om-table-scroll"><table><thead><tr><th>Модель</th><th>Цена</th></tr></thead><tbody><tr><td>Кроссовки</td><td>7990 ₽</td></tr></tbody></table></div><figure><img src="'+image.toDataURL()+'" alt="Демонстрационный рисунок"><figcaption>Подпись к фото</figcaption></figure><img src="/absent-photo.png" alt="Недоступная фотография"><p>Заключение — ссылки и фотографии проверены.</p>');resetArticleEditorHistory();
   });
   const before=await page.locator('#canvas').innerHTML();await select('macro-first');
   await page.evaluate(()=>{window.qaEvents=[];ArticleCommands.subscribe(step=>qaEvents.push(step));ArticleCommands.batch([{id:'format.bold'},{id:'format.italic'}]);});
   assert.equal(await page.evaluate(()=>articleHistory.length),2);
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await page.locator('#canvas').innerHTML(),before);
   await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.match(await page.locator('#macro-first').innerHTML(),/<(?:b|strong)>/);
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));await select('macro-first');
   const events=await page.evaluate(()=>qaEvents.length);
   await assert.rejects(()=>page.evaluate(()=>ArticleCommands.batch([{id:'format.bold'},{id:'style.apply',params:{style:'bad'}}])),/Неизвестный стиль/);
   assert.equal(await page.locator('#canvas').innerHTML(),before);assert.equal(await page.evaluate(()=>qaEvents.length),events);
   await assert.rejects(()=>page.evaluate(()=>ArticleCommands.batch([{id:'export.docx'}])),/недоступна в макросе/);
   await page.locator('#article-macros-open').click();await page.locator('#article-macro-name').fill('Выделить главное');await page.locator('#article-macro-record').click();await page.keyboard.press('Escape');
   await select('macro-first');await page.locator('[data-command=bold]').click();await page.locator('[data-command=italic]').click();
   await page.locator('#article-macros-open').click();await page.locator('#article-macro-stop').click();await page.keyboard.press('Escape');
   const prior=await page.locator('#canvas').innerHTML();await select('macro-second');
   await page.locator('#article-macros-open').click();await page.locator('#article-macro-list button').first().click();
   assert.match(await page.locator('#macro-second').innerHTML(),/<(?:b|strong)>/);
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await page.locator('#canvas').innerHTML(),prior);
   const exportedBefore=await page.locator('#canvas').innerHTML(),downloadPromise=page.waitForEvent('download');
   const result=await page.evaluate(()=>ArticleCommands.execute('export.docx'));
   assert.ok(result.warnings.some(w=>w.includes('Недоступная фотография')));const download=await downloadPromise;
   await download.saveAs('output/wordcraft-qa/portable/'+brand+'.docx');
   assert.equal(await page.locator('#canvas').innerHTML(),exportedBefore);
   await page.evaluate(()=>ArticleCommands.execute('export.pdf'));assert.equal(await page.locator('#canvas').innerHTML(),exportedBefore);
   const print=await context.newPage();try{await print.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});await print.setContent(await page.locator('#article-print-frame').evaluate(n=>n.contentDocument.documentElement.outerHTML),{waitUntil:'networkidle'});await print.pdf({path:'output/wordcraft-qa/portable/'+brand+'.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});}finally{await print.close();}
   for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:900});await page.locator('#download').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');
    await page.locator('#article-macros-open').click();assert.ok(await page.locator('#article-macros-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));await page.keyboard.press('Escape');
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS: DOCX/PDF artifacts, fallback image, unchanged HTML, atomic batch/rollback, one undo, recording/replay, prohibited commands, both brands and mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
