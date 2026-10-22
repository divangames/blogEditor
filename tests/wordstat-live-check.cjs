// Explicit production verification. Never save material, configure credentials or send mail.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base='https://news.outmax-office.ru',output='output/wordstat-live';
const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
fs.mkdirSync(output,{recursive:true});
const report={base,ui:[],requests:[],provider:'not-checked',writesBlocked:0};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const login=await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  assert.ok(login.ok(),'Live login');
  const requestedModes=new Set();
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base)return route.abort();
   if(['GET','HEAD'].includes(request.method()))return route.continue();
   if(url.pathname==='/editor-api/wordstat/query'){
    const data=request.postDataJSON();
    assert.ok(['tree','top','dynamics','regions'].includes(data.mode));
    assert.ok(!requestedModes.has(data.mode),'No automatic retries or duplicate paid queries');
    assert.ok(data.mode==='tree'||data.phrase==='кроссовки для бега');
    requestedModes.add(data.mode);
    return route.continue();
   }
   report.writesBlocked++;
   return route.abort();
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function query(action,mode){
   const pending=page.waitForResponse(r=>r.url()===base+'/editor-api/wordstat/query'&&r.request().method()==='POST');
   await action();
   const response=await pending,data=await response.json();
   report.requests.push({mode,status:response.status(),...(response.ok()?{}:{error:data.error})});
   if(!response.ok())return false;
   await page.locator('#ws-run:not(:disabled)').waitFor();
   return true;
  }
  for(const entry of ['/','/hasl/','/email/','/OUTMAX.html']){
   await page.goto(base+entry,{waitUntil:'domcontentloaded'});
   await page.locator('#wordstat-open').waitFor();
   const email=entry.includes('email')||entry.includes('OUTMAX');
   if(!email)await page.waitForFunction(()=>articleBackupReady);
   const snapshot=()=>page.evaluate(email=>JSON.stringify(email?
    [emailEditorSnapshot(),document.querySelector('#subject').value,document.querySelector('#preheader').value,emailEditorHistoryIndex,emailEditorHistory.length]:
    [articleEditorSnapshot(),document.querySelector('#page-title').value,articleHistoryIndex,articleHistory.length]),email);
   const before=await snapshot(),calls=report.requests.length;
   const statusResponse=page.waitForResponse(r=>r.url()===base+'/editor-api/wordstat/status');
   await page.locator('#wordstat-open').click();
   const status=await (await statusResponse).json();
   await page.locator('#ws-status').filter({hasText:/Подключение настроено|не подключён/}).waitFor();
   assert.equal(report.requests.length,calls,'Opening has no provider query');
   assert.equal(await page.locator('#ws-run').isDisabled(),!status.available);
   assert.equal(await page.locator('#ws-settings').isVisible(),!!status.canConfigure);
   assert.equal(await page.locator('#ws-key').inputValue(),'');
   if(entry==='/'){
    report.available=!!status.available;report.managed=!!status.managed;
    if(status.available){
     await page.locator('#ws-phrase').fill('кроссовки для бега');
     let good=await query(()=>page.locator('#ws-tree').click(),'tree');
     if(good){
      await page.locator('#ws-status').filter({hasText:'Справочник загружен'}).waitFor();
      good=await query(()=>page.locator('#ws-run').click(),'top');
     }
     if(good){
      await page.locator('#ws-results table').first().waitFor();
      await page.locator('#wordstat-dialog').screenshot({path:output+'/top.png'});
      await page.locator('#ws-mode').selectOption('dynamics');
      good=await query(()=>page.locator('#ws-run').click(),'dynamics');
     }
     if(good){
      await page.locator('#ws-results table').waitFor();
      await page.locator('#wordstat-dialog').screenshot({path:output+'/dynamics.png'});
      await page.locator('#ws-mode').selectOption('regions');
      good=await query(()=>page.locator('#ws-run').click(),'regions');
     }
     report.provider=good?'passed':'provider-error';
    }else report.provider='not-configured';
   }
   for(const width of [320,390,800,1440]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.locator('#wordstat-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width===390)await page.locator('#wordstat-dialog').screenshot({path:output+'/'+(email?'email':entry.includes('hasl')?'hasl':'outmax')+'-390.png'});
   }
   assert.equal(await snapshot(),before,'Read-only Wordstat preserves document, fields and history');
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'wordstat-open');
   const prefix=email?'email':'article';
   await page.locator(`#${prefix}-commands-open`).click();
   await page.locator(`#${prefix}-command-search`).fill('Wordstat');
   await page.locator(`#${prefix}-command-results`).getByRole('button',{name:'Яндекс Wordstat: фразы, динамика и регионы',exact:true}).click();
   await page.locator('#wordstat-dialog[open]').waitFor();
   assert.equal(await page.locator('#ws-phrase').evaluate(n=>n===document.activeElement),true);
   await page.keyboard.press('Escape');
   assert.equal(await snapshot(),before);
   report.ui.push(entry);console.log('PASS live Wordstat UI '+entry+': real status, command, focus, 4 widths, unchanged material/history');
  }
  await page.goto(base+'/instructions/#wordstat',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Яндекс Wordstat: фразы, динамика и регионы',exact:true}).waitFor();
  assert.match(await page.locator('#wiki-view').textContent(),/секретное значение ключа/);
  await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});
  await page.locator('#wiki-search').fill('вордстат');
  await page.locator('.wiki-result').filter({hasText:'Яндекс Wordstat'}).first().waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS live Wordstat guide, search and direct link');
  console.log('Live provider result: '+report.provider+'; requests: '+report.requests.length);
 }finally{
  fs.writeFileSync(output+'/result.json',JSON.stringify(report,null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
