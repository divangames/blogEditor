// Проверяет базу знаний, поиск, навигацию, безопасность запросов и мобильную раскладку.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
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
  assert.equal(await page.locator('.wiki-group').count(),JSON.parse(fs.readFileSync('instructions/articles.json','utf8')).groups.length);
  const data=await page.evaluate(()=>JSON.parse(document.getElementById('wiki-data').textContent));
  const expectedArticles=JSON.parse(fs.readFileSync('instructions/articles.json','utf8')).articles.length;assert.equal(data.articles.length,expectedArticles);assert.ok(data.changes.length>20);
  const ids=new Set(data.articles.map(article=>article.id));assert.equal(ids.size,expectedArticles);
  for(const article of data.articles){
   for(const related of article.related||[]) assert.ok(ids.has(related),'Ссылка '+related);
   if(article.image) assert.equal((await context.request.get(base+'/instructions/screens/'+article.image)).status(),200);
   for(const step of Object.values(article.stepImages||{}))assert.equal((await context.request.get(base+'/instructions/screens/'+step.image)).status(),200);
  }
  await page.keyboard.press('/');assert.equal(await page.locator('#wiki-search').evaluate(node=>document.activeElement===node),true);
  await page.locator('#wiki-search').fill('копию статьи');assert.ok(await page.locator('.wiki-result').filter({hasText:'Как сделать копию статьи'}).count());
  await page.locator('#wiki-search').fill('вордстат');assert.ok(await page.locator('.wiki-result').filter({hasText:'Яндекс Wordstat'}).count());
  await page.locator('#wiki-search').fill('конструктор');assert.ok(await page.locator('.wiki-result').filter({hasText:'Конструктор ХАСЛ'}).count());
  await page.goto(base+'/instructions/#site-builder',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Конструктор ХАСЛ: страницы, блоки и живой текст',exact:true}).waitFor();
  for(const [id,query] of [['wordstat-seo','Исследовать статью'],['seo-requirements','Общие требования для SEO'],['account-blocking','Заблокировать'],['admin-user-view','Войти как пользователь'],['workspace-brief','Поисковые запросы']]){
   await page.locator('#wiki-search').fill(query);assert.ok(await page.locator('.wiki-result').count());
   await page.goto(base+'/instructions/#'+id,{waitUntil:'domcontentloaded'});await page.locator('#wiki-view h1,#wiki-view h2').first().waitFor();assert.ok((await page.locator('#wiki-view').textContent()).includes(query));
  }
  await page.goto(base+'/instructions/#wordstat',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Яндекс Wordstat: фразы, динамика и регионы',exact:true}).waitFor();
  assert.match(await page.locator('#wiki-view').textContent(),/search-api.webSearch.user/);
  for(const query of ['подключить вордстат','Folder ID','секретный ключ','yc.search-api.execute']){
   await page.locator('#wiki-search').fill(query);
   assert.ok(await page.locator('.wiki-result').filter({hasText:'Яндекс Wordstat'}).count(),query);
  }
  await page.locator('#clear-search').click();
  await page.goto(base+'/instructions/#wordstat',{waitUntil:'domcontentloaded'});
  await page.locator('[data-screenshot="wordstat-connection.png"]').click();
  await page.locator('#screenshot-dialog[open]').waitFor();
  assert.match(await page.locator('#screenshot-large').getAttribute('src'),/wordstat-connection.png$/);
  await page.keyboard.press('Escape');
  await page.goto(base+'/instructions/#article-columns',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Колонки: содержимое, отступы и телефон',exact:true}).waitFor();
  assert.match(await page.locator('#wiki-view').textContent(),/30\/70/);
  assert.equal(await page.locator('.wiki-step-figure').count(),5);
  await page.locator('.wiki-step-figure button').first().click();
  await page.locator('#screenshot-dialog[open]').waitFor();
  assert.match(await page.locator('#screenshot-large').getAttribute('src'),/article-columns-tools.png$/);
  await page.keyboard.press('Escape');
  await page.locator('#wiki-search').fill('колонки');
  assert.ok(await page.locator('.wiki-result').filter({hasText:'Колонки: содержимое'}).count());
  await page.locator('#wiki-search').fill('30/70');assert.ok(await page.locator('.wiki-result').filter({hasText:'Колонки: содержимое'}).count());
  await page.goto(base+'/instructions/#article-copy',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Как сделать копию статьи',exact:true}).waitFor();
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
  await page.locator('#wiki-search').fill('команды письма');assert.ok(await page.locator('.wiki-result').filter({hasText:'Команды и режим фокуса письма'}).count());
  await page.locator('#wiki-search').fill('временный курсор');assert.ok(await page.locator('.wiki-result').filter({hasText:'Текст, шрифты, заголовки и ссылки'}).count());
  await page.goto(base+'/instructions/#article-format',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Текст, шрифты, заголовки и ссылки',exact:true}).waitFor();
  assert.match(await page.locator('#wiki-view').textContent(),/пустой абзац исчезнет/);
  await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});
  await page.locator('#wiki-search').fill('нововведения');
  await page.getByRole('link',{name:/Что нового в редакторах/}).first().waitFor();
  await page.locator('#wiki-search').fill('description');
  await page.getByRole('link',{name:/Description статьи/}).first().waitFor();
  await page.locator('#wiki-search').fill('Schema.org');
  await page.getByRole('link',{name:/Schema.org Article/}).first().waitFor();
  await page.goto(base+'/instructions/#article-schema',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.wiki-step-figure').count(),2);assert.match(await page.locator('#wiki-view').textContent(),/папку image/);
  await page.locator('.wiki-step-figure button').last().click();await page.locator('#screenshot-dialog[open]').waitFor();assert.match(await page.locator('#screenshot-large').getAttribute('src'),/article-schema-export.png$/);await page.keyboard.press('Escape');
  await page.locator('#wiki-search').fill('Заголовок ХАСЛ');
  await page.getByRole('link',{name:/Заголовок ХАСЛ на телефоне/}).first().waitFor();
  for(const query of ['Текстовая версия письма','ТЗ и источники','Навигатор всех H2','Клавиатура и названия','Список ссылок и якорей','К тексту на телефоне']){await page.locator('#wiki-search').fill(query);assert.ok(await page.locator('.wiki-result').count(),query);}
  for(const id of ['email-plaintext','workspace-brief','article-outline','email-keyboard','workspace-links','mobile-writing','article-metadata','recent-updates','hasl-mobile-heading','article-schema','article-description','article-quality','email-quality','email-version-history','article-version-compare','email-version-compare','review-anchors','email-import','email-commands','email-find','email-proposals','email-style-inspector','article-style-inspector','article-paste','email-paste','article-products','article-commands','article-proposals','article-focus','article-portable','article-macros','article-ai-settings','article-ai-problem','article-mcp','article-find']){
   await page.goto(base+'/instructions/#'+id,{waitUntil:'domcontentloaded'});
   const title=data.articles.find(article=>article.id===id).title;
   await page.getByRole('heading',{name:title,exact:true}).waitFor();
  }
  await page.goto(base+'/instructions/#missing',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Инструкция не найдена'}).waitFor();
  for(const width of [1440,800,390,320]){
   await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#choose-editor',{waitUntil:'domcontentloaded'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Ширина '+width);
   await page.goto(base+'/instructions/#wordstat',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Яндекс Wordstat: фразы, динамика и регионы',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Wordstat, ширина '+width);
   await page.goto(base+'/instructions/#article-columns',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Колонки: содержимое, отступы и телефон',exact:true}).waitFor();
   assert.equal(await page.locator('.wiki-step-figure').count(),5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Колонки, ширина '+width);
   await page.goto(base+'/instructions/#article-schema',{waitUntil:'domcontentloaded'});assert.equal(await page.locator('.wiki-step-figure').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Schema.org, ширина '+width);
  }
  fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/instructions-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});
  await page.screenshot({path:'output/playwright/instructions-desktop.png',fullPage:true});
  for(const path of ['/','/hasl/','/email/']){
   await page.goto(base+path,{waitUntil:'commit'});await page.locator('.editor-switcher-menu a').filter({hasText:'Инструкции'}).waitFor({state:'attached'});
   const link=page.locator('.editor-switcher-menu a').filter({hasText:'Инструкции'});assert.match(await link.getAttribute('href'),/\/instructions\//);
   await page.locator('[data-site-menu]').waitFor({state:'attached'});assert.equal(await page.locator('[data-site-menu] a').count(),2);
  }
  assert.equal((await context.request.get(base+'/instructions')).url(),base+'/instructions/');
  assert.equal((await context.request.get(base+'/instructions/articles.json')).status(),404);
  assert.deepEqual(errors,[]);console.log('PASS: руководства, поиск, ченжлог, скриншоты, прямые ссылки, меню, 4 ширины экрана.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
