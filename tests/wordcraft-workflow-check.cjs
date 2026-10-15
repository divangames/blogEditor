const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  if(base.startsWith('http://127.0.0.1:')) await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  const select=()=>page.evaluate(()=>{const n=document.querySelector('#qa-text strong').firstChild,r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);canvas.focus({preventScroll:true});lastRange=r.cloneRange();});
  for(const brand of ['/','/hasl/']){
   await page.goto(base+brand,{waitUntil:'domcontentloaded'});await page.locator('#article-proposal-open').waitFor();
   await page.evaluate(()=>{setBody('<header><h1>Проверка рабочего текста</h1></header><p id="qa-text">До <strong>Слова и emoji 👟</strong> после.</p><p id="qa-other">Слова и emoji 👟</p>');resetArticleEditorHistory();});
   const initial=await page.locator('#canvas').innerHTML();
   assert.ok((await page.evaluate(()=>ArticleCommands.list())).some(s=>s.id==='format.bold'));
   await assert.rejects(()=>page.evaluate(()=>ArticleCommands.execute('unknown')),/Неизвестная команда/);
   await select();await page.locator('#article-proposal-open').click();
   await page.locator('#article-proposal-text').fill('Коротко 👟');await page.locator('#article-proposal-accept').click();
   assert.equal(await page.locator('#qa-text strong').textContent(),'Коротко 👟');
   assert.equal(await page.locator('#qa-other').textContent(),'Слова и emoji 👟');
   await page.keyboard.press('Escape');await page.evaluate(()=>ArticleCommands.execute('edit.undo'));
   assert.equal(await page.locator('#canvas').innerHTML(),initial,'Undo preserves all markup');
   await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.equal(await page.locator('#qa-text strong').textContent(),'Коротко 👟');
   await select();await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-text').fill('Не принимать');await page.locator('#article-proposal-reject').click();
   assert.equal(await page.locator('#qa-text strong').textContent(),'Коротко 👟');
   await select();await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-text').fill('Устаревшая правка');
   await page.evaluate(()=>{document.getElementById('qa-other').append(' Изменено');changed();});
   await page.locator('#article-proposal-accept').click();await page.getByText('Статья изменилась.',{exact:false}).waitFor();
   assert.equal(await page.locator('#qa-text strong').textContent(),'Коротко 👟');await page.keyboard.press('Escape');
   // Provider response is inert plain text, never executable HTML.
   await page.route('**/article-assist/status*',r=>r.fulfill({json:{available:true}}));
   await page.route('**/article-assist/propose*',r=>r.fulfill({json:{text:'<img src=x onerror=alert(1)> 👟'}}));
   await select();await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-generate').click();
   await page.waitForFunction(()=>document.getElementById('article-proposal-text').value.includes('<img'));
   await page.locator('#article-proposal-accept').click();assert.equal(await page.locator('#qa-text img').count(),0);
   assert.match(await page.locator('#qa-text strong').textContent(),/<img/);
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));
   const beforeExport=await page.locator('#canvas').innerHTML();
   const downloadPromise=page.waitForEvent('download');
   const markdown=await page.evaluate(()=>ArticleCommands.execute('export.markdown').text);
   const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.md$/);
   assert.match(markdown,/# Проверка рабочего текста/);assert.match(markdown,/\*\*Коротко 👟\*\*/);
   assert.equal(await page.locator('#canvas').innerHTML(),beforeExport);
   // Editing is available during an in-flight request; late replies are rejected.
   await page.unroute('**/article-assist/propose*');let reply;
   await page.route('**/article-assist/propose*',r=>new Promise(resolve=>{reply=async()=>{await r.fulfill({json:{text:'Поздний ответ'}});resolve();};}));
   await select();await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-generate').click();
   await page.waitForFunction(()=>document.getElementById('article-proposal-status').textContent.startsWith('Получаем'));
   await page.locator('#qa-other').click({position:{x:8,y:8}});await page.keyboard.press('End');await page.keyboard.type(' Дополнение');
   assert.match(await page.locator('#qa-other').textContent(),/Дополнение/);
   await reply();await page.getByText('Статья изменилась во время запроса.',{exact:false}).waitFor();
   assert.equal(await page.locator('#article-proposal-text').inputValue(),'');
   await page.locator('#article-proposal-dialog [data-close]').click();
   await page.unroute('**/article-assist/propose*');
   await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('фокус');
   await page.locator('#article-command-results button').click();assert.equal(await page.locator('#article-focus-toggle').getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#article-focus-toggle').getAttribute('aria-pressed'),'false');
   await page.keyboard.press('Control+Shift+k');await page.locator('#article-command-dialog[open]').waitFor();
   await page.locator('#article-command-search').fill('zzzzzz');await page.getByText('Команды не найдены',{exact:true}).waitFor();await page.keyboard.press('Escape');
   // All existing exports stay free of dialog/proposal metadata.
   assert.doesNotMatch(await page.evaluate(()=>adminBody()),/article-proposal|article-command/);
   for(const width of [375,768,1024,1440]){
    await page.setViewportSize({width,height:900});await select();await page.locator('#article-proposal-open').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
    assert.ok(await page.locator('#article-proposal-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
    if(width===375||width===1440){fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:`output/playwright/workflow-${brand==='/'?'outmax':'hasl'}-${width}.png`});}
    await page.keyboard.press('Escape');
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS: commands, proposals, exact range, emoji, formatting, undo/redo, reject, stale document, inert provider text, keyboard, focus, export, 4 widths, both brands');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
