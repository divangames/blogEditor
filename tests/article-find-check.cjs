const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const body=()=>page.evaluate(()=>articleEditorSnapshot().body);
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});await page.locator('#article-find-open').waitFor();
   await page.evaluate(()=>{setBody('<h1>Поиск и замена</h1><p id="find-one">Товар и товар. ТОВАРНАЯ витрина. 👟</p><p id="find-strong"><strong>товар</strong> рядом с <a id="find-link" href="https://example.com/товар">товар</a></p><p id="find-rich"><strong>Хороший </strong><em>товар</em> — удобно.</p><section data-shared-id="find-protected"><p>товар</p></section><p><span contenteditable="false">товар</span></p><p id="find-special">Цена [1.0] — ₽</p>');resetArticleEditorHistory();});
   const original=await body();await page.locator('#article-find-open').click();await page.locator('#article-find-query').fill('товар');
   assert.equal((await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'товар'}))).count,7);
   assert.equal((await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'товар',wholeWord:true}))).count,6);
   assert.equal((await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'товар',caseSensitive:true}))).count,5);
   await page.locator('#article-find-query').fill('[1.0]');assert.match(await page.locator('#article-find-status').textContent(),/1 из 1/);
   assert.equal(await body(),original);assert.equal(await page.evaluate(()=>articleHistory.length),1,'Search must not add history');
   await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'товар',wholeWord:true}));
   const result=await page.evaluate(()=>ArticleCommands.execute('edit.replaceFound',{text:'модель',all:true}));assert.equal(result.changed,5);
   assert.equal(await page.locator('#find-link').getAttribute('href'),'https://example.com/товар');assert.equal(await page.locator('#find-link').textContent(),'модель');
   assert.equal(await page.locator('[data-shared-id] p').textContent(),'товар');assert.equal(await page.locator('[contenteditable=false]').textContent(),'товар');
   assert.match(await page.locator('#find-one').textContent(),/ТОВАРНАЯ/);assert.equal(await page.locator('#find-strong strong').textContent(),'модель');
   assert.equal(await page.evaluate(()=>articleHistory.length),2);await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await body(),original);
   await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.equal(await page.locator('#find-link').textContent(),'модель');await page.evaluate(()=>ArticleCommands.execute('edit.undo'));
   await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'Хороший товар'}));
   await page.evaluate(()=>ArticleCommands.execute('edit.replaceFound',{text:'Отличная вещь'}));assert.equal(await page.locator('#find-rich').textContent(),'Отличная вещь — удобно.');assert.equal(await page.locator('#find-rich strong').textContent(),'Отличная вещь');
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await body(),original);
   await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'Цена'}));
   await page.evaluate(()=>{document.getElementById('find-special').append(' правка');changed();});
   await assert.rejects(()=>page.evaluate(()=>ArticleCommands.execute('edit.replaceFound',{text:'Стоимость'})),/Статья изменилась/);assert.match(await page.locator('#find-special').textContent(),/Цена/);
   await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'👟'}));await page.evaluate(()=>ArticleCommands.execute('edit.replaceFound',{text:'',all:true}));assert.doesNotMatch(await page.locator('#find-one').textContent(),/👟/);await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.match(await page.locator('#find-one').textContent(),/👟/);
   await page.evaluate(()=>{setBody('<p id="find-empty">Удалить</p>');resetArticleEditorHistory();ArticleCommands.execute('edit.find',{query:'Удалить'});ArticleCommands.execute('edit.replaceFound',{text:''});});
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await page.locator('#find-empty').textContent(),'Удалить');await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.equal(await page.locator('#find-empty').textContent(),'');assert.ok(await page.evaluate(()=>canvas.contains(getSelection().anchorNode)));
   await page.evaluate(()=>{setBody('<p>'+'слово '.repeat(1001)+'</p>');resetArticleEditorHistory();});
   const cap=await page.evaluate(()=>ArticleCommands.execute('edit.find',{query:'слово'}));assert.equal(cap.capped,true);await assert.rejects(()=>page.evaluate(()=>ArticleCommands.execute('edit.replaceFound',{text:'замена',all:true})),/более 1000/);
   await page.evaluate(()=>{setBody('<p id="find-advance">кот кот кот</p>');resetArticleEditorHistory();ArticleCommands.execute('edit.find',{query:'кот'});ArticleCommands.execute('edit.findNext');ArticleCommands.execute('edit.replaceFound',{text:'котик'});ArticleCommands.execute('edit.replaceFound',{text:'пёс'});});assert.equal(await page.locator('#find-advance').textContent(),'кот котик пёс');
   await page.evaluate(()=>{setBody('<p id="find-final">Обычный текст для поиска</p>');resetArticleEditorHistory();});await page.locator('#article-find-query').fill('текст');
   for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#article-find-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   await page.setViewportSize({width:812,height:375});assert.ok(await page.locator('#article-find-dialog').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight),'Landscape dialog must fit vertically');
   await page.setViewportSize({width:375,height:900});fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/find-'+brand+'-375.png'});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#article-find-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>window.CSS?.highlights?.has('article-find') || false),false);
   await page.locator('#find-final').click();await page.keyboard.press('Control+f');await page.locator('#article-find-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement===canvas),true);
  }
  assert.deepEqual(errors,[]);console.log('PASS: literal/Russian/whole-word/rich-text search, single/all replacement, links/styles/protected blocks, one undo/redo, stale guard, emoji, empty replacement/caret, 1000 cap, keyboard, mobile, both brands');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
