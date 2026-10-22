const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict');
const mock=require('./wordstat-fixture.cjs'),fs=require('node:fs');
const base=process.env.WORDSTAT_TEST_BASE||'http://127.0.0.1:8878';
const body='<h1>Как выбрать кроссовки для бега</h1><h2>Амортизация и размер обуви</h2><p>Кроссовки для <strong>бега</strong> подходят для тренировок. Кроссовки для бега выбирают по размеру.</p><p>Мягкая подошва и удобная посадка. [%name%]</p>';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});let cleanup=[],context;
 try{
  context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});
  await context.route('https://**',route=>route.abort());
  if(process.env.WORDSTAT_BLOCK_ASSET)await context.route(/\/editor-wordstat(?:-seo)?\.js(?:\?|$)/,route=>route.abort());
  const state=await mock(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/wordstat/query',async route=>{
   const data=route.request().postDataJSON();if(data.mode!=='top')return route.fallback();
   state.calls.push(data);if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
   return route.fulfill({json:{totalCount:data.phrase.includes('бега')?'30000':'100',results:[],associations:[]}});
  });
  for(const path of ['/','/hasl/']){
   await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(body=>{setBody(body);resetArticleEditorHistory();},body);
   const before=await page.evaluate(()=>({html:canvas.innerHTML,index:articleHistoryIndex}));
   await page.locator('#wordstat-open').click();await page.locator('#ws-run:not(:disabled)').waitFor();
   await page.locator('#ws-analysis>summary').click();const callsBefore=state.calls.length;await page.locator('#ws-analyze').click();
   await page.locator('#ws-analysis-status').filter({hasText:'Проверено фраз:'}).waitFor();
   assert.ok(await page.locator('#ws-analysis-results button').count());assert.match(await page.locator('#ws-analysis-results').textContent(),/30\s?000/);
   assert.ok(state.calls.length-callsBefore<=12);
   await page.locator('#ws-analysis-results button').first().click();await page.locator('#wordstat-dialog').waitFor({state:'hidden'});
   assert.ok(await page.evaluate(()=>CSS.highlights.has('wordstat-phrases')));
   assert.deepEqual(await page.evaluate(()=>({html:canvas.innerHTML,index:articleHistoryIndex})),before);
   await page.evaluate(()=>setTab('preview'));await page.locator('#wordstat-preview-open').click();await page.locator('#ws-analyze:not(:disabled)').waitFor();
   await page.locator('#ws-analysis').evaluate(n=>n.open=true);await page.locator('#ws-analyze').click();await page.locator('#ws-analysis-status').filter({hasText:'Проверено фраз:'}).waitFor();
   await page.locator('#ws-analysis-results button').first().click();
   assert.ok(await page.evaluate(()=>document.querySelector('#preview').contentWindow.CSS.highlights.has('wordstat-phrases')));
   await page.evaluate(()=>setTab('editor'));
   await page.locator('#wordstat-open').click();await page.locator('#ws-analyze:not(:disabled)').waitFor();state.delay=300;
   await page.locator('#ws-analyze').click();await page.waitForTimeout(70);await page.evaluate(()=>canvas.querySelector('p').append(' изменено'));
   await page.locator('#ws-analysis-status').filter({hasText:'Материал изменился'}).waitFor();state.delay=0;await page.keyboard.press('Escape');
   console.log('PASS SEO '+path+': discovery, real-frequency sorting, split-style locations, local preview, unchanged HTML/history, stale detection');
  }
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('#wordstat-open').click();await page.locator('#ws-run:not(:disabled)').waitFor();
  await page.locator('#ws-tree').click();await page.locator('#ws-region-tree').waitFor();
  await page.getByRole('checkbox',{name:'Все регионы',exact:true}).uncheck();assert.equal(await page.locator('#ws-run').isDisabled(),true);
  await page.locator('#ws-tree').click();await page.locator('#ws-status').filter({hasText:'Справочник загружен'}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Все регионы',exact:true}).isChecked(),false);assert.equal(await page.locator('#ws-run').isDisabled(),true);
  await page.getByRole('button',{name:'Развернуть Россия',exact:true}).click();await page.getByRole('checkbox',{name:'Москва',exact:true}).check();await page.getByRole('checkbox',{name:'Санкт-Петербург',exact:true}).check();
  assert.equal(await page.getByRole('checkbox',{name:'Россия',exact:true}).isChecked(),true);
  await page.getByRole('checkbox',{name:'Санкт-Петербург',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Европа',exact:true}).check();await page.locator('#ws-phrase').fill('кроссовки');await page.locator('#ws-run').click();await page.locator('#ws-results table').first().waitFor();assert.deepEqual(state.calls.at(-1).regions,['213','111']);assert.match(await page.locator('#ws-results>p').textContent(),/Москва, Европа/);
  await page.locator('#ws-regions').selectOption('213');await page.locator('#ws-device').selectOption('DEVICE_PHONE');
  await page.locator('#ws-mode').selectOption('dynamics');await page.locator('#ws-from').fill('2026-01-01');await page.locator('#ws-to').fill('2026-03-31');await page.locator('#ws-phrase').fill('кроссовки');
  await page.locator('#ws-run').click();await page.locator('.ws-chart').waitFor();await page.locator('.ws-chart').focus();await page.keyboard.press('ArrowRight');
  await page.locator('.ws-chart-tip').waitFor();assert.match(await page.locator('.ws-chart-tip').textContent(),/февраль 2026/);assert.match(await page.locator('.ws-chart-tip').textContent(),/62\s?000/);assert.match(await page.locator('.ws-chart-tip').textContent(),/0,015/);
  assert.equal(await page.locator('.ws-share-line').count(),1);
  for(const width of [320,390,800,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#wordstat-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
  console.log('PASS region hierarchy, parent/child/all selection, devices, dual chart, keyboard tooltip and 4 widths');await page.keyboard.press('Escape');
  const id='wordstat-seo-qa-'+Date.now();const saved=await context.request.post(base+'/editor-api/save',{data:{id,title:'Демонстрация Wordstat',brand:'outmax',body,products:[]}});assert.ok(saved.ok());cleanup.push('/editor-api/draft/'+id+'?brand=outmax');
  const preview=await(await context.request.post(base+'/editor-api/preview/'+id+'?brand=outmax')).json();
  const anonymous=await browser.newContext(),anonPage=await anonymous.newPage();await anonymous.route('https://**',route=>route.abort());await anonPage.goto(base+preview.url,{waitUntil:'domcontentloaded'});await anonPage.locator('#wordstat-open').click();await anonPage.locator('#ws-status a').waitFor();assert.match(await anonPage.locator('#ws-status a').getAttribute('href'),/login\?next=/);assert.equal(await anonPage.locator('#ws-analyze').isDisabled(),true);
  await page.goto(base+preview.url,{waitUntil:'domcontentloaded'});await page.locator('#review-frame').waitFor();await page.locator('#wordstat-open').click();await page.locator('#ws-analysis').evaluate(n=>n.open=true);await page.locator('#ws-analyze:not(:disabled)').waitFor();await page.locator('#ws-analyze').click();await page.locator('#ws-analysis-status').filter({hasText:'Проверено фраз:'}).waitFor();await page.locator('#ws-analysis-results button').first().click();
  await page.waitForFunction(()=>!document.querySelector('#wordstat-dialog').open);
  assert.ok(await page.frameLocator('#review-frame').locator('body').evaluate(()=>CSS.highlights.has('wordstat-phrases')));
  await page.setViewportSize({width:390,height:844});await page.locator('[data-size=mobile]').click();await page.locator('#wordstat-open').click();await page.locator('#ws-analyze:not(:disabled)').waitFor();await page.locator('#ws-analyze').click();await page.locator('#ws-analysis-status').filter({hasText:'Проверено фраз:'}).waitFor();await page.locator('#ws-analysis-results button').first().click();assert.ok(await page.frameLocator('#review-phone-frame').locator('body').evaluate(()=>CSS.highlights.has('wordstat-phrases')));
  console.log('PASS public preview: anonymous login request, authenticated automatic phrases and sandboxed locations');
  assert.deepEqual(errors,[]);
  for(const route of cleanup)await context.request.delete(base+route);cleanup=[];
 }finally{if(context)for(const route of cleanup)await context.request.delete(base+route);await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
