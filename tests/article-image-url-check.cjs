const assert = require('node:assert/strict');
const fs = require('node:fs');
module.exports = async function(context, base, {capture=false,readOnly=false}={}) {
 for (const brand of ['outmax','hasl']) {
  const page = await context.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).origin===base&&(!readOnly||['GET','HEAD'].includes(r.request().method()))?r.continue():r.abort());
  await page.goto(base+(brand==='hasl'?'/hasl/':'/'));
  await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(()=>{setBody('<h1>Демонстрационный материал</h1><figure><a href="https://example.com/product"><img id="demo-photo" src="/images/outmax.png" alt="Фото для статьи" style="width:70%;object-fit:cover;aspect-ratio:4 / 3"></a><figcaption>Подпись фотографии</figcaption></figure>');resetArticleEditorHistory();selectNode(canvas.querySelector('img'));openImageEditor();});
  const body=()=>page.evaluate(()=>encodedBody());
  const original=await body(), count=await page.evaluate(()=>articleHistory.length);
  await page.locator('#image-url').fill('javascript:alert(1)');
  await page.locator('#image-url-load').click();
  assert.match(await page.locator('#image-url-status').innerText(),/HTTP/);
  assert.equal(await body(),original);assert.equal(await page.evaluate(()=>articleHistory.length),count);
  await page.locator('#image-url').fill('https://example.com/photo.jpg');
  let calls=0, release;
  await page.route('https://example.com/photo.jpg*',async r=>{
   calls++;
   if(r.request().url().includes('?fail')){await r.fulfill({status:404,body:'missing'});return;}
   if(r.request().url().includes('?slow'))await new Promise(resolve=>release=resolve);
   await r.fulfill({contentType:'image/png',headers:{'Cache-Control':'no-store'},body:fs.readFileSync('images/outmax.png')});
  });
  if(capture){await page.locator('#image-dialog').screenshot({path:`instructions/screens/article-image-url-${brand}.png`});await page.setViewportSize({width:390,height:844});await page.locator('#image-url-load').scrollIntoViewIfNeeded();await page.locator('#image-dialog').screenshot({path:`instructions/screens/article-image-url-${brand}-mobile.png`});await page.setViewportSize({width:1440,height:1000});}
  await page.locator('#image-url').press('Enter');
  await page.locator('#image-url-status').filter({hasText:'Изображение добавлено по ссылке'}).waitFor();
  assert.equal(await page.evaluate(()=>articleHistory.length),count+1);
  assert.equal(await page.locator('#canvas img').getAttribute('alt'),'Фото для статьи');
  assert.equal(await page.locator('#canvas img').evaluate(n=>n.style.width),'70%');
  assert.equal(await page.locator('#canvas figcaption').innerText(),'Подпись фотографии');
  assert.equal(await page.locator('#canvas a').getAttribute('href'),'https://example.com/product');
  const replaced=await body();assert.notEqual(replaced,original);assert.equal(await page.locator('#canvas img').getAttribute('src'),'https://example.com/photo.jpg');
  await page.locator('#image-done').click();await page.evaluate(()=>undoArticleEditor());assert.equal(await body(),original);
  await page.evaluate(()=>redoArticleEditor());assert.equal(await body(),replaced);
  await page.evaluate(()=>{selectNode(canvas.querySelector('img'));openImageEditor();});
  await page.locator('#image-url').fill('https://example.com/photo.jpg?fail');await page.locator('#image-url-load').click();
  await page.locator('#image-url-status').filter({hasText:'Не удалось открыть'}).waitFor();assert.equal(await body(),replaced);
  await page.locator('#image-url').fill('https://example.com/photo.jpg?slow');await page.locator('#image-url-load').click();
  await page.waitForFunction(()=>document.querySelector('#image-url-load').disabled);
  await page.evaluate(()=>{setBody('<h1>Другой документ</h1>');});
  while(!release)await new Promise(r=>setTimeout(r,20));release();
  await page.locator('#image-url-status').filter({hasText:'изменилась'}).waitFor();assert.equal(await page.locator('#canvas img').count(),0);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('#image-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
  await page.close();console.log('PASS image URL '+brand+': validation, input purity, replacement, undo/redo, error, stale, mobile');
 }
 const wiki=await context.newPage();await wiki.goto(base+'/instructions/#article-images');
 await wiki.getByRole('heading',{name:'Добавление и настройка фотографий',exact:true}).waitFor();
 await wiki.locator('#wiki-search').fill('Загрузка изображения по ссылке');assert.ok(await wiki.locator('.wiki-result').count());await wiki.close();
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});}
