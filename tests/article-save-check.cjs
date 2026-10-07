const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877';
const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<80;i++){if(await check())return;await pause(150);}throw Error('Timed out: '+label);}
async function open(page,id){await page.evaluate(async id=>{
  await persistArticleBackup(articleNeedsSave);
  const draft=await api('/api/draft/'+id);currentId=draft.id;lockedId=true;
  document.querySelector('#filename').value=currentId;document.querySelector('#filename').disabled=true;
  document.querySelector('#page-title').value=draft.title;setBody(draft.body);restoreProducts(draft.products);
  setArticleSaveDocument(draft);await window.markArticleBackupSynced({force:true});
},id);}
async function type(page,text){await page.locator('#canvas p').last().click();await page.keyboard.press('End');await page.keyboard.insertText(text);}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const first=await context.newPage(),second=await context.newPage(),errors=[];
  for(const page of [first,second]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());}
  await first.goto(base);await first.waitForFunction(()=>articleBackupReady);
  const id='save-check-'+Date.now();
  await first.evaluate(id=>{currentId=id;lockedId=true;document.querySelector('#filename').value=id;document.querySelector('#page-title').value='Проверка сохранения';setArticleSaveDocument();setBody('<header><h1>Проверка сохранения</h1></header><section><p>Начало</p></section>');changed();},id);
  await until(()=>first.evaluate(()=>!!articleDocumentId && !articleNeedsSave),'first autosave');
  await second.goto(base);await second.waitForFunction(()=>articleBackupReady);await open(second,id);
  await type(first,' ПЕРВАЯ');
  await until(()=>first.evaluate(()=>!articleNeedsSave),'first edit');
  await type(second,' ВТОРАЯ');await second.locator('#article-save-conflict').waitFor();
  fs.mkdirSync('release/ui-check/screens',{recursive:true});
  await second.screenshot({path:'release/ui-check/screens/article-save-conflict.png'});
  await second.setViewportSize({width:375,height:812});
  assert.ok(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'conflict causes mobile overflow');
  await second.screenshot({path:'release/ui-check/screens/article-save-conflict-mobile.png'});
  await second.setViewportSize({width:1280,height:900});
  let stored=await (await context.request.get(base+'/api/draft/'+id)).json();
  assert.ok(stored.body.includes('ПЕРВАЯ'));assert.ok(!stored.body.includes('ВТОРАЯ'));
  await second.locator('#article-save-conflict [data-action="copy"]').click();
  await until(()=>second.evaluate(()=>!!articleDocumentId && !articleNeedsSave),'conflict copy');
  const copyId=await second.evaluate(()=>currentId);
  assert.notEqual(copyId,id);
  const copied=await (await context.request.get(base+'/api/draft/'+copyId)).json();assert.ok(copied.body.includes('ВТОРАЯ'));

  // A new keystroke while the previous save is in flight must be sent next.
  let started;const observed=new Promise(resolve=>started=resolve);let delayed=false;
  await first.route('**/editor-api/save*',async route=>{
    const response=await route.fetch();
    if(!delayed){delayed=true;started();await pause(700);}
    await route.fulfill({response});
  });
  await type(first,' МЕДЛЕННО');await observed;await type(first,' НОВОЕ');
  await until(()=>first.evaluate(()=>!articleNeedsSave && !articleSavePromise),'latest edit acknowledged');
  stored=await (await context.request.get(base+'/api/draft/'+id)).json();assert.ok(stored.body.includes('НОВОЕ'));
  await first.unroute('**/editor-api/save*');

  // Commit on the server, lose the acknowledgement, reload and replay requestId.
  let lose=true,lost;const lostResponse=new Promise(resolve=>lost=resolve);
  await first.route('**/editor-api/save*',async route=>{
    const response=await route.fetch();
    if(lose){lose=false;await route.fulfill({status:503,json:{error:'Simulated lost response'}});lost();}
    else await route.fulfill({response});
  });
  await type(first,' ПОТЕРЯННЫЙ ОТВЕТ');await lostResponse;
  await until(()=>first.evaluate(()=>!!articlePendingSave && !articleSavePromise),'queued retry');
  const committed=await (await context.request.get(base+'/api/draft/'+id)).json();
  await first.reload();await first.waitForFunction(()=>articleBackupReady);
  await until(()=>first.evaluate(()=>!articleNeedsSave && !!articleDocumentId),'recovered replay');
  stored=await (await context.request.get(base+'/api/draft/'+id)).json();
  assert.equal(stored.revision,committed.revision,'replay created another server revision');
  assert.ok(stored.body.includes('ПОТЕРЯННЫЙ ОТВЕТ'));
  await first.unroute('**/editor-api/save*');
  await context.setOffline(true);await type(first,' ОФЛАЙН');
  await until(()=>first.evaluate(()=>!!articlePendingSave && !articleSavePromise),'offline retained');
  await context.setOffline(false);
  await until(()=>first.evaluate(()=>!articleNeedsSave && !articleSavePromise),'online recovery');
  stored=await (await context.request.get(base+'/api/draft/'+id)).json();assert.ok(stored.body.includes('ОФЛАЙН'));
  const hasl=await context.newPage();hasl.on('pageerror',e=>errors.push(e.message));
  await hasl.goto(base+'/hasl/');await hasl.waitForFunction(()=>articleBackupReady);
  await hasl.evaluate(id=>{currentId=id;lockedId=true;document.querySelector('#filename').value=id;document.querySelector('#page-title').value='Проверка ХАСЛ';setArticleSaveDocument();setBody('<header><h1>Проверка ХАСЛ</h1></header><section><p>Отдельный бренд</p></section>');changed();},id);
  await until(()=>hasl.evaluate(()=>!!articleDocumentId && !articleNeedsSave),'HASL autosave');
  const haslRecord=await (await context.request.get(base+'/api/draft/'+id+'?brand=hasl')).json();
  assert.equal(haslRecord.brand,'hasl');assert.notEqual(haslRecord.documentId,stored.documentId);
  assert.ok((await (await context.request.get(base+'/api/draft/'+id)).json()).body.includes('ОФЛАЙН'));
  // Force only the browser-storage adapter for two local tabs; production stays untouched.
  const localPages=await Promise.all([context.newPage(),context.newPage()]);
  for(const page of localPages){
    await page.route('**/online.js?*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('online.js','utf8').replace('const serverFirst = window.__EDITOR_SERVER_FIRST__ === true;','const serverFirst = false;')}));
    await page.goto(base);await page.waitForFunction(()=>articleBackupReady);
  }
  const localId=id+'-browser';
  const localSave=(page,payload)=>page.evaluate(async payload=>{const response=await fetch('/api/save',{method:'POST',body:JSON.stringify(payload)});return {status:response.status,...await response.json()};},payload);
  const seed={id:localId,title:'Local',body:'<p>local</p>',expectedRevision:null,requestId:'seed'};
  const initial=await localSave(localPages[0],seed);assert.equal(initial.browserStorage,true);
  const competing=await Promise.all(localPages.map((page,i)=>localSave(page,{...seed,body:'<p>'+i+'</p>',expectedRevision:initial.revision,documentId:initial.documentId,requestId:'writer-'+i})));
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  const replay=await localSave(localPages[0],seed);assert.equal(replay.revision,initial.revision);
  assert.deepEqual(errors,[]);
  console.log('Article saves: OUTMAX/HASL autosave, conflict/copy + mobile, delayed response, reload/replay, offline recovery, browser-storage CAS/replay: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
