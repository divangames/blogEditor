const assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
async function check(context,base,{capture=false}={}){
 const page=await context.newPage(),created=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 if(process.env.METADATA_BLOCK_ASSET)await page.route(/\/(?:editor|editor-quality)\.js(?:\?|$)/,r=>r.abort());
 const state=()=>page.evaluate(()=>({body:encodedBody(),history:articleHistoryIndex}));
 const schema=()=>page.evaluate(()=>readArticleStructuredData(new DOMParser().parseFromString(encodedBody(),'text/html'))[0]);
 try{
  for(const brand of ['outmax','hasl']){
   const id='metadata-qa-'+brand+'-'+Date.now();created.push({id,brand});
   assert.ok((await context.request.post(base+'/editor-api/save',{data:{id,brand,title:'Метаданные: проверка',body:'<h1>Как выбрать зимние кроссовки</h1><p>Демонстрационная статья.</p>',products:[]}})).ok());
   await page.goto(base+(brand==='hasl'?'/hasl/':'/')+'?article='+id,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);
   await page.locator('.article-description-settings>summary').click();
   const open=()=>page.locator('#article-schema-edit').click(),dialog=page.locator('#article-schema-dialog');
   const before=await state();await open();assert.equal(await state().then(JSON.stringify),JSON.stringify(before));
   await dialog.locator('[name=authorName]').fill('Не принятый автор');await dialog.getByRole('button',{name:'Отмена',exact:true}).click();assert.deepEqual(await state(),before);
   await open();await dialog.locator('[name=authorName]').fill('Демонстрационный автор');await dialog.locator('[name=authorUrl]').fill('javascript:alert(1)');await dialog.getByRole('button',{name:'Применить',exact:true}).click();await dialog.locator('[data-error]').filter({hasText:'HTTP(S)'}).waitFor();assert.deepEqual(await state(),before);
   await dialog.locator('[name=authorUrl]').fill('https://example.com/authors/demo');await dialog.locator('[name=datePublished]').fill('2026-02-30');await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.match(await dialog.locator('[data-error]').textContent(),/Проверьте дату/);assert.deepEqual(await state(),before);
   await dialog.locator('[name=datePublished]').fill('2026-10-19T12:00:00+07:00');await dialog.locator('[name=dateModified]').fill('2026-10-18');await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.match(await dialog.locator('[data-error]').textContent(),/раньше/);
   await dialog.locator('[name=dateModified]').fill('2026-10-19T13:00:00+07:00');await dialog.getByRole('button',{name:'Применить',exact:true}).click();
   const accepted=await state(),article=await schema();assert.equal(accepted.history,before.history+1);assert.equal(article.author.name,'Демонстрационный автор');assert.equal(article.author.url,'https://example.com/authors/demo');assert.equal(article.datePublished,'2026-10-19T12:00:00+07:00');
   await page.keyboard.press('Control+z');assert.equal((await schema()).author,undefined);await page.keyboard.press('Control+Shift+z');assert.deepEqual(await state(),accepted);
   await page.locator('#article-description').fill('Как выбрать зимние кроссовки: посадка, материалы и уход.');
   await page.evaluate(()=>{canvas.insertAdjacentHTML('beforeend','<img src="https://example.com/first.jpg" alt="Первое фото"><img src="https://example.com/cover.jpg" alt="Кроссовки">');changed();});
   await open();await dialog.locator('[name=cover]').selectOption('https://example.com/cover.jpg');await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.equal((await schema()).image,'https://example.com/cover.jpg');
   await page.evaluate(()=>save({automatic:true}));
   for(const site of ['ru','com'])for(const format of ['html','zip']){
    const response=await context.request.get(base+`/editor-api/export/${id}?brand=${brand}&site=${site}&format=${format}`);assert.ok(response.ok());let html;
    if(format==='html')html=await response.text();else{const zip=await require('../vendor/jszip.min.js').loadAsync(await response.body());html=await zip.file(Object.keys(zip.files).find(n=>n.endsWith('.html'))).async('string');}
    const exported=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');return {values:readArticleStructuredData(doc),meta:doc.querySelectorAll('meta[name=description]').length,body:doc.body.querySelectorAll('script[type="application/ld+json"]').length};},html);
    assert.equal(exported.values.length,1);assert.equal(exported.meta,1);assert.equal(exported.body,0);assert.equal(exported.values[0].author.name,article.author.name);assert.equal(exported.values[0].dateModified,article.dateModified);assert.equal(exported.values[0].image,'https://example.com/cover.jpg');
   }
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);assert.equal((await schema()).author.name,article.author.name);
   await page.locator('.article-description-settings>summary').click();
   const clean=await state();await page.locator('#article-quality-open').click();assert.equal(await page.locator('#article-quality-dialog .quality-row').count(),0);await page.keyboard.press('Escape');assert.deepEqual(await state(),clean);
   await open();await page.evaluate(()=>{canvas.querySelector('p').textContent+=' Изменение';});await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.match(await dialog.locator('[data-error]').textContent(),/Статья изменилась/);await page.keyboard.press('Escape');
   const multi=[{'@type':'Person',name:'Первый автор'},{'@type':'Person',name:'Второй автор'}];
   await page.evaluate(multi=>{setBody(serializeArticleStructuredData([{'@context':'https://schema.org','@type':'Article',author:multi,customField:'keep'}])+'<h1>Несколько авторов</h1><p>Текст</p>');resetArticleEditorHistory();},multi);
   await open();assert.equal(await dialog.locator('[name=authorName]').isDisabled(),true);await dialog.locator('[name=datePublished]').fill('2026-10-19');await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.deepEqual((await schema()).author,multi);assert.equal((await schema()).customField,'keep');
   // Removing the optional single author/date does not reintroduce them on reopen.
   await page.evaluate(()=>{setBody('<h1>Проверка рекомендаций</h1><p>Текст без метаданных</p>');resetArticleEditorHistory();});
   const empty=await state();await page.locator('#article-quality-open').click();const quality=page.locator('#article-quality-dialog');assert.equal(await quality.locator('.quality-row').count(),3);assert.match(await quality.textContent(),/рекомендация Google/);
   await quality.locator('.quality-row').filter({hasText:'Description статьи'}).getByRole('button',{name:'Показать место'}).click();assert.equal(await page.locator('#article-description').evaluate(n=>document.activeElement===n),true);assert.deepEqual(await state(),empty);await page.keyboard.press('Escape');
   await open();await dialog.locator('[name=authorName]').fill('Автор для удаления');await dialog.getByRole('button',{name:'Применить',exact:true}).click();await open();await dialog.locator('[name=authorName]').fill('');await dialog.getByRole('button',{name:'Применить',exact:true}).click();assert.equal((await schema()).author,undefined);
   if(capture){
    await page.setViewportSize({width:1440,height:1000});await open();await dialog.locator('[name=authorName]').fill('Демонстрационный автор');await dialog.locator('[name=datePublished]').fill('2026-10-19');await page.evaluate(()=>{clearTimeout(toastTimer);document.querySelector('#toast').className='';});await dialog.screenshot({path:'instructions/screens/article-metadata-'+brand+'.png'});
    for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+2));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===390)await page.screenshot({path:'instructions/screens/article-metadata-'+brand+'-mobile.png'});}
    await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});await page.locator('#article-quality-open').click();if(brand==='outmax')await quality.screenshot({path:'instructions/screens/article-quality.png'});await page.keyboard.press('Escape');
   }
   console.log('PASS metadata '+brand+': cancel/validation, atomic undo/redo, persistence, HTML/ZIP RU+COM, stale guard, imported multiple authors, clearing and readonly SEO checks');
  }
  assert.deepEqual(errors,[]);
 }finally{await page.close();for(const {id,brand} of created)await context.request.delete(base+`/editor-api/draft/${id}?brand=${brand}`);}
}
module.exports=check;
if(require.main===module)(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await check(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
