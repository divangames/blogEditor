// Проверяет базу знаний, поиск, навигацию, безопасность запросов и мобильную раскладку.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  if(!process.env.WIKI_TEST_BASE) await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Всё, что нужно для работы'}).waitFor();
  await page.locator('#wiki-account-name .account-avatar').waitFor();
  assert.match(await page.locator('#wiki-account-name').innerText(),/Привет,\s+Демонстрационный аккаунт/);
  await page.locator('#wiki-account-name').click();assert.equal(await page.locator('#wiki-account-menu').evaluate(node=>node.open),true);
  await page.locator('.editor-switcher > summary').click();
  await page.waitForFunction(()=>!document.getElementById('wiki-account-menu').open);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.wiki-group').count(),6);
  const data=await page.evaluate(()=>JSON.parse(document.getElementById('wiki-data').textContent));
  assert.equal(data.articles.length,34);assert.ok(data.changes.length>20);
  const ids=new Set(data.articles.map(article=>article.id));assert.equal(ids.size,34);
  for(const article of data.articles){
   for(const related of article.related||[]) assert.ok(ids.has(related),'Ссылка '+related);
   if(article.image) assert.equal((await context.request.get(base+'/instructions/screens/'+article.image)).status(),200);
  }
  await page.keyboard.press('/');assert.equal(await page.locator('#wiki-search').evaluate(node=>document.activeElement===node),true);
  for(const [query,expected] of [['как добавить фото','Добавление и настройка фотографий'],['не сохраняется','Не сохраняется статья или письмо'],['как отправить письмо','NotiSend: тест, черновик и финальная отправка'],['общие блоки','Общие блоки: сохранить, вставить и обновить']]){
   await page.locator('#wiki-search').fill(query);assert.ok(await page.locator('.wiki-result').filter({hasText:expected}).count(),query);
  }
  await page.locator('.wiki-result').filter({hasText:'Общие блоки: сохранить, вставить и обновить'}).first().click();
  await page.getByRole('heading',{name:'Общие блоки: сохранить, вставить и обновить',exact:true}).waitFor();
  assert.equal(await page.locator('#wiki-search').inputValue(),'');
  await page.locator('#wiki-search').fill('zzzzzzzz');await page.locator('.wiki-empty').waitFor();
  await page.locator('#wiki-search').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('#wiki-view img').count(),0);
  await page.locator('#clear-search').click();
  await page.goto(base+'/instructions/#choose-editor',{waitUntil:'domcontentloaded'});
  await page.locator('[data-screenshot]').click();assert.equal(await page.locator('#screenshot-dialog').evaluate(node=>node.open),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#screenshot-dialog').evaluate(node=>node.open),false);
  await page.locator('a.wiki-header-link').click();await page.getByRole('heading',{name:'Ченжлог',exact:true}).waitFor();
  await page.goto(base+'/instructions/#missing',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Инструкция не найдена'}).waitFor();
  for(const width of [1440,800,390,320]){
   await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#choose-editor',{waitUntil:'domcontentloaded'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Ширина '+width);
  }
  fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/instructions-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});
  await page.screenshot({path:'output/playwright/instructions-desktop.png',fullPage:true});
  for(const path of ['/','/hasl/','/email/']){
   await page.goto(base+path,{waitUntil:'commit'});await page.locator('.editor-switcher-menu a').filter({hasText:'Инструкции'}).waitFor({state:'attached'});
   const link=page.locator('.editor-switcher-menu a').filter({hasText:'Инструкции'});assert.match(await link.getAttribute('href'),/\/instructions\//);
  }
  assert.equal((await context.request.get(base+'/instructions')).url(),base+'/instructions/');
  assert.equal((await context.request.get(base+'/instructions/articles.json')).status(),404);
  assert.deepEqual(errors,[]);console.log('PASS: 34 руководства, поиск, ченжлог, скриншоты, прямые ссылки, меню, 4 ширины экрана.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
