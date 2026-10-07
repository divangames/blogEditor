const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const errors=[];fs.mkdirSync('release/ui-check/screens',{recursive:true});
  for(const brand of ['outmax','hasl']){
    const id='version-check-'+brand+'-'+Date.now();
    const seed={id,brand,title:'Ранняя версия',body:'<header><h1>Ранняя версия</h1></header><section><p>До правки</p></section>',products:[],automatic:true,requestId:'first'};
    const first=await (await context.request.post(base+'/api/save',{data:seed})).json();
    const second=await (await context.request.post(base+'/api/save',{data:{...seed,title:'Поздняя версия',body:'<header><h1>Поздняя версия</h1></header><section><p>После правки</p></section>',expectedRevision:first.revision,requestId:'second'}})).json();
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+(brand==='hasl'?'/hasl/':'/')+'?article='+id);await page.waitForFunction(()=>articleBackupReady);
    await page.locator('#article-version-history').click();
    await page.locator(`.version-list button[data-revision="${first.revision}"]`).click();
    await page.waitForFunction(()=>!document.querySelector('.version-restore').disabled);
    assert.ok((await page.locator('.version-old').textContent()).includes('До правки'));
    assert.ok((await page.locator('.version-current').textContent()).includes('После правки'));
    assert.ok(await page.locator('.version-old del').count()>0);
    if(brand==='outmax'){
      await page.screenshot({path:'release/ui-check/screens/article-versions-desktop.png'});
      await page.setViewportSize({width:375,height:812});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:'release/ui-check/screens/article-versions-mobile.png'});
    }
    await page.locator('.version-restore').click();await page.locator('.article-versions-dialog').waitFor({state:'detached'});
    assert.ok((await page.locator('#canvas').textContent()).includes('До правки'));
    const restored=await (await context.request.get(base+'/api/draft/'+id+'?brand='+brand)).json();
    assert.notEqual(restored.revision,first.revision);assert.notEqual(restored.revision,second.revision);
    const history=await (await context.request.get(base+'/api/draft/'+id+'/history?brand='+brand)).json();assert.equal(history.items.length,3);
    await page.locator('#article-version-history').click();
    await page.locator(`.version-list button[data-revision="${second.revision}"]`).click();
    await page.waitForFunction(()=>!document.querySelector('.version-restore').disabled);
    await context.request.post(base+'/api/save',{data:{...seed,body:'<p>Другой автор уже изменил документ</p>',expectedRevision:restored.revision,requestId:'concurrent'}});
    await page.locator('.version-restore').click();await page.waitForFunction(()=>document.querySelector('.version-details').textContent.includes('другой вкладке'));
    assert.ok((await (await context.request.get(base+'/api/draft/'+id+'?brand='+brand)).json()).body.includes('Другой автор'));
    await page.close();
  }
  const local=await context.newPage();local.on('pageerror',e=>errors.push(e.message));
  await local.route('**/online.js?*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('online.js','utf8').replace('const serverFirst = window.__EDITOR_SERVER_FIRST__ === true;','const serverFirst = false;')}));
  await local.goto(base);await local.waitForFunction(()=>articleBackupReady);
  const first=await local.evaluate(async()=>{
    const id='local-history-'+Date.now(),first=await api('/api/save',{method:'POST',body:JSON.stringify({id,title:'Локальная ранняя',body:'<h1>Локальная ранняя</h1><p>Текст до</p>',requestId:'first'})});
    await api('/api/save',{method:'POST',body:JSON.stringify({id,title:'Локальная поздняя',body:'<h1>Локальная поздняя</h1><p>Текст после</p>',expectedRevision:first.revision,requestId:'second'})});
    const current=await api('/api/draft/'+id);currentId=id;lockedId=true;document.querySelector('#filename').value=id;document.querySelector('#page-title').value=current.title;setBody(current.body);setArticleSaveDocument(current);await window.markArticleBackupSynced({force:true});return first;
  });
  await local.locator('#article-version-history').click();
  await local.locator(`.version-list button[data-revision="${first.revision}"]`).click();await local.waitForFunction(()=>!document.querySelector('.version-restore').disabled);
  await local.locator('.version-restore').click();await local.locator('.article-versions-dialog').waitFor({state:'detached'});
  assert.ok((await local.locator('#canvas').textContent()).includes('Текст до'));
  assert.deepEqual(errors,[]);console.log('Version history: OUTMAX/HASL diff, mobile, restore as new, stale restore rejected, browser history: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
