// Проверка новых блоков: ввод, отмена, undo, экспорт и адаптив обоих редакторов.
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
  if(pathname.startsWith('/fixtures/'))return route.fulfill({contentType:'text/html',body:'<article class="om-guide"><section class="om-section"><h2>Статья</h2><p>Текст для проверки блоков.</p></section></article>'});
  if(pathname==='/app.js')file=path.resolve('release/tiptap-prototype/app.js');
  if(pathname==='/prototype.css')file=path.resolve('experiments/tiptap-editor/prototype.css');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  await route.fulfill({contentType:mime,body:fs.readFileSync(file)});
 });
 fs.mkdirSync('tmp/feature-check',{recursive:true});
 const fixture='<article class="om-product"><h3>Название модели</h3><h4 style="margin:30px 0">Почему рекомендуем</h4><p style="margin-top:30px">Это специальная утеплённая версия популярного силуэта.</p><p style="margin-bottom:30px"><strong>Материалы</strong></p><p style="margin-top:30px">Натуральная замша и прочный текстиль.</p></article>';
 for(const brand of (process.env.FEATURE_TIPTAP_ONLY?[]:['outmax','hasl'])){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8895/docs/editor/'+(brand==='hasl'?'hasl/':''));
 await page.waitForFunction(()=>typeof articleBackupReady!=='undefined'&&articleBackupReady);
 await page.evaluate(body=>{setBody(body,{normalize:false});resetArticleEditorHistory();},fixture);
 const original=await page.evaluate(()=>encodedBody());
 await page.locator('#add-promo').click();await page.locator('#feature-title').fill('Отменённый блок');await page.locator('.feature-cancel').click();
 assert.equal(await page.evaluate(()=>encodedBody()),original,'cancel mutated body');
 await page.locator('#add-promo').click();await page.locator('#feature-code').fill('СКИДКА26');await page.locator('#feature-url').fill('https://example.com/catalog');await page.locator('#feature-button').fill('Выбрать пару');await page.locator('#feature-text').fill('Дополнительная скидка на выбранные модели.');
 await page.locator('#feature-dialog button[type=submit]').click();
 assert.equal(await page.locator('#canvas .om-promo-code').textContent(),'СКИДКА26');
 assert.equal(await page.locator('#canvas .om-promo-button').getAttribute('href'),'https://example.com/catalog');
 await page.locator('#add-expert').click();await page.locator('#feature-title').fill('Совет по посадке');await page.locator('#feature-text').fill('Проверьте длину стельки и оставьте запас для движения.');await page.locator('#feature-author').fill('Алексей');await page.locator('#feature-role').fill('Эксперт по обуви');
 for(const [id,value] of [['accent','#265ba2'],['background','#eaf1fa'],['text-color','#17253a']])await page.locator('#feature-'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.locator('#feature-dialog button[type=submit]').click();
 const expert=await page.locator('#canvas .om-expert').evaluate(n=>({text:n.textContent,bg:getComputedStyle(n).backgroundColor,ink:getComputedStyle(n.querySelector('.om-feature-title')).color}));
 assert.ok(expert.text.includes('Алексей'));assert.equal(expert.bg,'rgb(234, 241, 250)');assert.equal(expert.ink,'rgb(23, 37, 58)');
 await page.evaluate(()=>{flushArticleHistorySnapshot();undoArticleEditor();});
 assert.equal(await page.locator('#canvas .om-expert').count(),0,'expert undo');
 await page.evaluate(()=>redoArticleEditor());assert.equal(await page.locator('#canvas .om-expert').count(),1,'expert redo');
 await page.locator('#canvas .om-expert .om-feature-text').click();await page.locator('#feature-settings').click();assert.equal(await page.locator('#feature-accent').inputValue(),'#265ba2');await page.locator('#feature-author').fill('Мария');await page.locator('#feature-dialog button[type=submit]').click();
 const saved=await page.evaluate(()=>encodedBody());await page.evaluate(body=>setBody(body,{normalize:false}),saved);assert.equal(await page.locator('#canvas .om-expert-author').textContent(),'Мария');
 const preview=await page.evaluate(()=>previewDocument()),exported=await page.evaluate(()=>adminBody());
 for(const [kind,html] of [['preview',preview],['export','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><article style="max-width:800px;margin:auto;padding:16px">'+exported+'</article>']]){
  const output=await context.newPage();
  for(const width of [320,375,768,1280]){
   await output.setViewportSize({width,height:1000});await output.setContent(html);
   const data=await output.evaluate(()=>{const heading=document.querySelector('h4'),paragraph=heading.nextElementSibling;return {gap:paragraph.getBoundingClientRect().top-heading.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,bg:getComputedStyle(document.querySelector('.om-expert')).backgroundColor};});
   assert.ok(data.gap<=7,`${brand} ${kind}: product gap ${data.gap}`);assert.equal(data.overflow,false,`${brand} ${kind} ${width}: overflow`);assert.equal(data.bg,'rgb(234, 241, 250)');
   if(width===375||width===1280)await output.screenshot({path:`tmp/feature-check/${brand}-${kind}-${width}.png`,fullPage:true});
  }
  await output.close();
 }
 await page.setViewportSize({width:375,height:812});await page.locator('#add-expert').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`tmp/feature-check/${brand}-mobile-dialog.png`,fullPage:true});await page.locator('.feature-cancel').click();
 assert.deepEqual(errors,[]);await page.close();console.log('PASS classic '+brand+': insertion, cancel, editing, colors, undo/redo, reopen, inline export, spacing, 320–1280px');
 }
 for(const brand of ['outmax','hasl']){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8895/experiments/tiptap-editor/index.html?brand='+brand);
 await page.waitForFunction(()=>window.prototypeEditor?.isEditable,{},{timeout:8000}).catch(async error=>{console.error(await page.locator('#status').textContent(),errors);throw error;});
 for(const type of ['promo','expert']){await page.locator('#add-'+type).click();await page.locator('#feature-dialog button[type=submit]').click();assert.equal(await page.locator('.tiptap .om-'+type).count(),1);}
 await page.locator('.tiptap .om-expert .om-feature-text').click();await page.locator('#feature-settings').click();await page.locator('#feature-author').fill('Эксперт Tiptap');await page.locator('#feature-dialog button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.tiptap .om-expert-author')?.textContent==='Эксперт Tiptap',{},{timeout:2000}).catch(async error=>{console.error(await page.locator('.feature-error').textContent(),await page.locator('#feature-dialog').evaluate(n=>n.open));throw error;});
 await page.locator('#undo').click();assert.notEqual(await page.locator('.tiptap .om-expert-author').textContent(),'Эксперт Tiptap');await page.locator('#redo').click();await page.waitForFunction(()=>document.querySelector('.tiptap .om-expert-author')?.textContent==='Эксперт Tiptap',{},{timeout:2000}).catch(async error=>{console.error(await page.locator('.feature-error').textContent(),await page.locator('#feature-dialog').evaluate(n=>n.open));throw error;});
 await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#add-expert').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.feature-cancel').click();
 const downloadEvent=page.waitForEvent('download');await page.locator('#cms-html').click();const download=await downloadEvent;const destination='tmp/feature-check/'+brand+'-tiptap-cms.html';await download.saveAs(destination);const html=fs.readFileSync(destination,'utf8');assert.ok(html.includes('Эксперт Tiptap'));assert.ok(html.includes('om-promo'));
 const output=await context.newPage();await output.setViewportSize({width:375,height:812});await output.setContent(html);assert.ok(await output.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await output.locator('.om-promo-code').count(),1);await output.close();
 assert.deepEqual(errors,[]);await page.close();console.log('PASS Tiptap '+brand+': insertion, settings, undo/redo, mobile and CMS export');
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
