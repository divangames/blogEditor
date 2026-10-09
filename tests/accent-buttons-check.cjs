// Проверка нескольких кнопок в акценте: сохранение текста, отмена, undo и экспорт.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.route('https://**/*',r=>r.abort());
 await context.route('http://127.0.0.1:8895/**',async route=>{
  let pathname=decodeURIComponent(new URL(route.request().url()).pathname);
  let file=path.join(process.cwd(),pathname.endsWith('/')?pathname+'index.html':pathname);
  if(pathname.startsWith('/fixtures/'))return route.fulfill({contentType:'text/html',body:'<article class="om-guide"><section class="om-section"><h2>Статья</h2><p>Текст для проверки блоков.</p><aside class="om-callout"><p class="om-callout-title">ВАЖНО</p><p>Сохранить <strong>экспертный текст</strong> и обычную <a href="https://example.com/info">ссылку</a>.</p></aside></section></article>'});
  if(pathname==='/app.js')file=path.resolve('release/tiptap-prototype/app.js');
  if(pathname==='/prototype.css')file=path.resolve('experiments/tiptap-editor/prototype.css');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  await route.fulfill({contentType:mime,body:fs.readFileSync(file)});
 });

 fs.mkdirSync('tmp/accent-buttons-check',{recursive:true});
 const fixture='<section class="om-section" id="catalog"><h2>Раздел</h2></section><aside class="om-callout"><p class="om-callout-title">ВАЖНО</p><p>Сохранить <strong>экспертный текст</strong> и обычную <a href="https://example.com/info">ссылку</a>.</p></aside>';
 async function verifyExport(page,brand,body){
  const output=await context.newPage();
  for(const width of [320,375,1280]){
   await output.setViewportSize({width,height:900});await output.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><article style="max-width:800px;margin:auto;padding:16px">'+body+'</article>');
   assert.equal(await output.locator('.om-callout .om-cta a').count(),3);
   assert.ok(await output.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),brand+' export overflow');
   if(width===375){const boxes=await output.locator('.om-callout .om-cta a').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));assert.ok(boxes[1]>boxes[0]&&boxes[2]>boxes[1],brand+' mobile buttons must stack');await output.screenshot({path:`tmp/accent-buttons-check/${brand}-export.png`,fullPage:true});}
  }
  await output.close();
 }
 for(const brand of ['outmax','hasl']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8895/docs/editor/'+(brand==='hasl'?'hasl/':''));await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(body=>{setBody(body,{normalize:false});resetArticleEditorHistory();},fixture);
  const text=await page.locator('#canvas .om-callout>p:last-of-type').innerHTML();
  await page.locator('#canvas .om-callout-title').click();await page.locator('#accent-add-button').click();await page.locator('#button-cancel').click();assert.equal(await page.locator('#canvas .om-cta').count(),0);
  await page.locator('#accent-add-button').click();await page.locator('#button-items [data-field=text]').fill('Первая кнопка');await page.locator('#button-items [data-field=url]').fill('https://example.com/one');await page.locator('#button-submit').click();
  await page.locator('#canvas .om-callout-title').click();await page.locator('#accent-add-button').click();assert.equal(await page.locator('.button-item').count(),2);
  await page.locator('.button-item').nth(1).locator('[data-field=text]').fill('Вторая кнопка');await page.locator('.button-item').nth(1).locator('[data-field=url]').fill('https://example.com/two');
  await page.locator('#button-add-item').click();await page.locator('.button-item').nth(2).locator('[data-field=text]').fill('Третья кнопка');await page.locator('.button-item').nth(2).locator('[data-field=url]').fill('https://example.com/three');await page.locator('#button-submit').click();
  assert.equal(await page.locator('#canvas .om-callout>.om-cta').count(),1);assert.equal(await page.locator('#canvas .om-callout .om-cta a').count(),3);assert.equal(await page.locator('#canvas .om-callout>p:last-of-type').innerHTML(),text);
  await page.evaluate(()=>undoArticleEditor());assert.equal(await page.locator('#canvas .om-callout .om-cta a').count(),1);await page.evaluate(()=>redoArticleEditor());assert.equal(await page.locator('#canvas .om-callout .om-cta a').count(),3);
  await page.locator('#canvas .om-callout-title').click();await page.locator('#edit-cta').click();await page.locator('.button-item').first().locator('[data-field=text]').fill('Обновлённая кнопка');await page.locator('#button-submit').click();assert.equal(await page.locator('#canvas .om-cta a').first().textContent(),'Обновлённая кнопка');
  const saved=await page.evaluate(()=>encodedBody());await page.evaluate(body=>setBody(body,{normalize:false}),saved);await verifyExport(page,brand,await page.evaluate(()=>adminBody()));
  await page.setViewportSize({width:375,height:812});await page.locator('#canvas .om-callout-title').click();await page.locator('#accent-add-button').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#button-cancel').click();
  assert.deepEqual(errors,[]);await page.close();console.log('PASS classic '+brand+': multiple buttons, text/links preserved, cancel, editing, undo/redo, reopen, mobile and inline export');
 }
 for(const brand of ['outmax','hasl']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8895/experiments/tiptap-editor/index.html?brand='+brand);await page.waitForFunction(()=>window.prototypeEditor?.isEditable);
  const key=await page.locator('#block-select optgroup[label="Акценты"] option').first().getAttribute('value');await page.locator('#block-select').selectOption(key);
  const before=await page.locator('.tiptap .om-callout>p:last-of-type').innerHTML();
  for(let i=0;i<3;i++){await page.locator('.accent-button-add').click();const item=page.locator('.accent-button-item').nth(i);await item.locator('[name=accent-button-text]').fill('Кнопка '+(i+1));await item.locator('[name=accent-button-href]').fill('https://example.com/'+(i+1));}
  await page.locator('.block-apply').click();assert.equal(await page.locator('.tiptap .om-callout .om-cta a').count(),3);assert.equal(await page.locator('.tiptap .om-callout>p:last-of-type').innerHTML(),before);
  await page.locator('#undo').click();assert.equal(await page.locator('.tiptap .om-callout .om-cta').count(),0);await page.locator('#redo').click();assert.equal(await page.locator('.tiptap .om-callout .om-cta a').count(),3);
  await page.locator('#block-select').selectOption(key);await page.locator('.accent-button-item').first().locator('[name=accent-button-href]').fill('javascript:alert(1)');await page.locator('.block-apply').click();assert.ok(await page.locator('#block-panel-error').textContent());assert.equal(await page.locator('.tiptap .om-cta a').first().getAttribute('href'),'https://example.com/1');
  await page.locator('.accent-button-item').first().locator('[name=accent-button-href]').fill('https://example.com/1');
  const downloadEvent=page.waitForEvent('download');await page.locator('#cms-html').click();const download=await downloadEvent;const destination='tmp/accent-buttons-check/'+brand+'-tiptap.html';await download.saveAs(destination);await verifyExport(page,brand,fs.readFileSync(destination,'utf8'));
  await page.locator('.accent-button-item').last().locator('.accent-button-remove').click();await page.locator('.block-apply').click();assert.equal(await page.locator('.tiptap .om-cta a').count(),2);assert.equal(await page.locator('.tiptap .om-callout>p:last-of-type').innerHTML(),before);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS Tiptap '+brand+': multiple buttons, preserved rich text, undo/redo, URL validation, removal and CMS export');
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
