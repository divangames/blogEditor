// Isolated demo server: python tests/instructions-server.py
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('**/*',r=>{
   const url=new URL(r.request().url());
   if(url.origin!==base || (process.env.CARET_BLOCK_ASSET && /^\/(editor|editor-commands)\.js$/.test(url.pathname)))return r.abort();
   return r.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pending=()=>page.locator('#canvas [data-editor-caret-paragraph]');
  const snapshot=()=>page.evaluate(()=>articleEditorSnapshot().body);
  const fixture=async()=>page.evaluate(()=>{
   setBody('<header><h1>Демонстрационная статья</h1></header><section class="om-section" id="demo-section" style="padding-bottom:56px"><h2>Первый раздел</h2><p id="demo-text">Исходный текст.</p></section>',{normalize:false});
   resetArticleEditorHistory();articleNeedsSave=false;
  });
  const gap=async(section=false)=>{
   const target=page.locator(section?'#demo-section':'#canvas');await target.scrollIntoViewIfNeeded();
   const point=await target.evaluate(n=>{
    const r=n.getBoundingClientRect(),last=n.lastElementChild.getBoundingClientRect();
    return {x:r.left+r.width/2,y:Math.min(r.bottom-8,last.bottom+12)};
   });await page.mouse.click(point.x,point.y);
  };
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});await page.locator('#canvas').waitFor();
   // No new history, dirty state or persisted HTML, even while the caret is active.
   await fixture();const original=await snapshot(),exported=await page.evaluate(()=>adminBody({keepLinks:true})),encoded=await page.evaluate(()=>encodedBody());
   await gap();assert.equal(await pending().count(),1);
   assert.equal(await snapshot(),original);assert.equal(await page.evaluate(()=>adminBody({keepLinks:true})),exported);
   assert.equal(await page.evaluate(()=>encodedBody()),encoded);
   assert.equal(await page.evaluate(()=>previewDocument()),await page.evaluate(html=>previewDocument(html),exported));
   assert.deepEqual(await page.evaluate(()=>[articleHistory.length,articleNeedsSave]),[1,false]);
   await page.locator('#demo-text').click();assert.equal(await pending().count(),0);assert.equal(await snapshot(),original);
   // Moving to another gap leaves one caret; leaving the editor removes it.
   await gap();await gap(true);assert.equal(await pending().count(),1);
   await page.locator('#page-title').click();assert.equal(await pending().count(),0);assert.equal(await snapshot(),original);
   // Clicks do not destroy a redo branch.
   await page.locator('#demo-text').click();await page.keyboard.type(' X');await page.evaluate(()=>undoArticleEditor());
   await gap();await page.locator('#demo-text').click();await page.evaluate(()=>redoArticleEditor());assert.match(await page.locator('#demo-text').textContent(),/X/);
   // The paragraph and entered text are one existing undo step; redo restores a caret.
   await fixture();await gap();await page.keyboard.type('Новый текст');await page.evaluate(()=>flushArticleHistorySnapshot());
   assert.equal(await pending().count(),0);assert.match(await snapshot(),/Новый текст/);
   assert.equal(await page.evaluate(()=>articleHistory.length),2);
   await page.keyboard.press('Control+z');assert.equal(await snapshot(),original);
   await page.keyboard.press('Control+y');assert.match(await snapshot(),/Новый текст/);assert.ok(await page.evaluate(()=>canvas.contains(getSelection().anchorNode)));
   // Native paste uses the same caret and history.
   await fixture();await gap();await page.evaluate(()=>{document.execCommand('insertHTML',false,'<strong>Вставленный текст</strong>');});
   await page.locator('#demo-text').click();assert.match(await snapshot(),/Вставленный текст/);assert.equal(await pending().count(),0);
   await page.evaluate(()=>undoArticleEditor());assert.equal(await snapshot(),original);
   // Toolbar operations retain the temporary caret until text is entered.
   await fixture();await gap();await page.locator('[data-command="bold"]').click();
   assert.equal(await pending().count(),1);await page.keyboard.type('Жирный текст');
   assert.equal(await pending().count(),0);assert.match(await snapshot(),/Жирный текст/);
   await page.evaluate(()=>undoArticleEditor());assert.equal(await snapshot(),original);
   // Enter is intentional: its blank lines remain when focus moves away.
   await fixture();await gap();await page.keyboard.press('Enter');await page.locator('#demo-text').click();
   assert.equal(await pending().count(),0);assert.notEqual(await snapshot(),original);
   await page.evaluate(()=>undoArticleEditor());assert.equal(await snapshot(),original);
   // Existing explicit empty paragraphs and image-only paragraphs survive.
   await fixture();await page.evaluate(()=>{canvas.insertAdjacentHTML('beforeend','<p id="explicit-blank"><br></p><p id="image-only"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="Демо"></p>');resetArticleEditorHistory();});
   const explicit=await snapshot();await gap();await page.locator('#demo-text').click();assert.equal(await snapshot(),explicit);
   await page.evaluate(()=>{selectNode(document.getElementById('demo-section'));insertTextBeside(selectedNode,'after');});
   await page.locator('#demo-text').click();assert.notEqual(await snapshot(),explicit);await page.evaluate(()=>undoArticleEditor());assert.equal(await snapshot(),explicit);
   // Protected sections and root anchors are never treated as disposable blanks.
   await fixture();await page.evaluate(()=>document.getElementById('demo-section').setAttribute('data-shared-id','demo-shared'));
   const protectedBody=await snapshot();await gap(true);assert.equal(await pending().count(),0);assert.equal(await snapshot(),protectedBody);
   await fixture();await gap();await pending().evaluate(n=>n.id='new-anchor');await page.locator('#demo-text').click();
   assert.equal(await page.locator('#new-anchor').count(),1);assert.match(await snapshot(),/new-anchor/);
   // Replacing the article discards only the old temporary node.
   await fixture();await gap();await page.evaluate(()=>setBody('<h1>Другой материал</h1><p>Содержимое другого материала.</p>'));
   await page.locator('#canvas p').click();assert.equal(await pending().count(),0);assert.match(await snapshot(),/Содержимое другого материала/);
   // Same interaction on a narrow touch viewport.
   await page.setViewportSize({width:390,height:844});await fixture();await gap();assert.equal(await pending().count(),1);
   await page.locator('#demo-text').click();assert.equal(await snapshot(),original);assert.equal(await pending().count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);console.log('PASS: temporary blank-space carets, cleanup, clean save/export/preview, no dirty/undo/redo pollution, typing/paste/Enter, explicit blanks/images, both brands, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
