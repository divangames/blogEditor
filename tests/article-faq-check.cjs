const assert=require('node:assert/strict');
module.exports=async function(context,base,{capture=false}={}){
 for(const brand of ['outmax','hasl']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.locator('#add-faq').waitFor();
  await page.evaluate(()=>{setBody('<header><h1>Вопросы о доставке</h1><p>Ответы для покупателей.</p></header>');resetArticleEditorHistory();});
  await page.locator('#add-faq').click();await page.locator('#faq-dialog button[type=submit]').click();
  assert.equal(await page.locator('#add-faq').innerText(),'FAQ');assert.equal(await page.locator('#add-faq svg').count(),1);
  assert.equal(await page.locator('#canvas .om-faq-item').count(),3);
  await page.evaluate(()=>{const f=canvas.querySelector('.om-faq');['Как выбрать размер?','Как оформить доставку?','Как ухаживать за обувью?'].forEach((q,i)=>f.querySelectorAll('.om-faq-question')[i].textContent=q);f.querySelector('.om-faq-answer').innerHTML='<p>Сверьтесь с <a href="https://example.com/size"><strong>таблицей размеров</strong></a>.</p>';changed();});
  for(const mode of ['single','multiple','all']){
   if(await page.locator('#selection-panel').isVisible())await page.locator('#selection-close').click();
   await page.locator('#canvas .om-faq-question').first().hover();await page.locator('#block-handle').click();await page.locator('#faq-settings').click();await page.locator('#faq-mode').selectOption(mode);
   if(capture&&mode==='single'){await page.screenshot({path:`instructions/screens/article-faq-${brand}.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`instructions/screens/article-faq-${brand}-mobile.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});}
   await page.locator('#faq-dialog button[type=submit]').click();
   const html=await page.evaluate(()=>adminBody());assert.ok(html.includes('<strong'));assert.ok(html.includes('https://example.com/size'));
   const preview=await context.newPage();await preview.setContent(await page.evaluate(()=>previewDocument()));
   assert.equal(await preview.locator('.om-faq > div.om-faq-item').count(),mode==='all'?3:1);
   if(mode!=='all'){
    const summaries=preview.locator('.om-faq summary');await summaries.nth(0).click();await summaries.nth(1).click();
    assert.equal(await preview.locator('.om-faq details[open]').count(),mode==='single'?1:2);
    await summaries.nth(1).focus();await preview.keyboard.press('Enter');assert.equal(await preview.locator('.om-faq details[open]').count(),mode==='single'?0:1);
   }
   for(const width of [390,320]){await preview.setViewportSize({width,height:844});assert.ok(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
   if(capture&&mode==='single')await preview.screenshot({path:`instructions/screens/article-faq-${brand}-preview.png`});
   await preview.close();await page.evaluate(html=>setBody(html),html);assert.equal(await page.locator('#canvas .om-faq > div.om-faq-item').count(),3);
  }
  await page.evaluate(()=>selectNode(canvas.querySelector('.om-faq')));await page.locator('#faq-settings').click();await page.locator('#faq-first').uncheck();await page.locator('#faq-mode').selectOption('single');await page.locator('#faq-add-item').click();
  await page.locator('#faq-dialog button[type=submit]').click();assert.equal(await page.locator('#canvas .om-faq-item').count(),4);
  await page.evaluate(()=>undoArticleEditor());assert.equal(await page.locator('#canvas .om-faq-item').count(),3);await page.evaluate(()=>redoArticleEditor());assert.equal(await page.locator('#canvas .om-faq-item').count(),4);
  const exported=await page.evaluate(()=>adminBody());assert.equal((exported.match(/<details/g)||[]).length,4);
  await require('./article-faq-cms-check.cjs')(page,context,brand,{capture});
  await page.evaluate(()=>selectNode(canvas.querySelector('.om-faq')));await page.locator('#faq-settings').click();
  await page.locator('.faq-setting-row').first().getByRole('button',{name:/Ниже:/}).click();
  await page.locator('.faq-setting-row').last().getByRole('button',{name:/Удалить:/}).click();await page.locator('#faq-dialog button[type=submit]').click();
  assert.equal(await page.locator('#canvas .om-faq-question').first().textContent(),'Как оформить доставку?');assert.equal(await page.locator('#canvas .om-faq-item').count(),3);
  await page.locator('#faq-settings').click();await page.locator('#faq-add-item').click();await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await page.locator('#canvas .om-faq-item').count(),3);
  const sourceBefore=await page.evaluate(()=>canvas.innerHTML);await page.evaluate(()=>adminBody());assert.equal(await page.evaluate(()=>canvas.innerHTML),sourceBefore,'export never mutates canvas');
  await page.evaluate(()=>{canvas.append(canvas.querySelector('.om-faq').cloneNode(true));changed();});
  const standalone=await context.newPage();await standalone.setContent('<article class="om-guide">'+await page.evaluate(()=>adminBody())+'</article>');
  assert.equal(await standalone.locator('details[open]').count(),2,'independent groups initially open');
  await standalone.locator('.om-faq').first().locator('summary').nth(1).click();assert.equal(await standalone.locator('.om-faq').last().locator('details[open]').count(),1,'groups do not close each other');await standalone.close();
  await page.evaluate(()=>{const imported=new DOMParser().parseFromString(adminBody(),'text/html');const safe=document.createElement('div');for(const child of imported.body.childNodes){const clean=cleanImported(child,document);if(clean)safe.append(clean);}setBody(safe.innerHTML);});
  assert.equal(await page.locator('#canvas .om-faq').count(),2);assert.equal(await page.locator('#canvas .om-faq a strong').count(),2);
  await page.evaluate(()=>selectNode(canvas.querySelector('.om-faq')));await page.locator('#faq-settings').click();await page.evaluate(()=>setBody('<h1>Другой документ</h1>'));await page.locator('#faq-dialog button[type=submit]').click();assert.match(await page.locator('#faq-error').textContent(),/изменилась/);assert.equal(await page.locator('#canvas .om-faq').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 const wiki=await context.newPage();await wiki.goto(base+'/instructions/#article-faq');await wiki.getByRole('heading',{name:'FAQ: вопросы и ответы со спойлерами',exact:true}).waitFor();await wiki.locator('#wiki-search').fill('спойлер');assert.ok(await wiki.locator('.wiki-result').filter({hasText:'FAQ: вопросы и ответы'}).count());await wiki.close();
 console.log('PASS FAQ: both brands, modes, pinned first, keyboard, rich text, roundtrip, undo/redo, stale form, 320/390px');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base='http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
