// Production UI verification: all browser mutations are blocked after login.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base='https://news.outmax-office.ru';
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const login=await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});
  assert.ok(login.ok(),'Production login failed');
  let blockedWrites=0;
  await context.route('**/*',r=>{
   const url=new URL(r.request().url());
   if(url.origin!==base)return r.abort();
   if(!['GET','HEAD'].includes(r.request().method())){blockedWrites++;return r.abort();}
   return r.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});await page.locator('#canvas').waitFor();
   assert.equal(await page.evaluate(()=>typeof cleanArticleCaretParagraphs),'function');
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.evaluate(()=>{setBody('<header><h1>Проверка места ввода</h1></header><section class="om-section"><h2>Демонстрационный раздел</h2><p id="live-caret-text">Текст для проверки перехода.</p></section>',{normalize:false});resetArticleEditorHistory();articleNeedsSave=false;});
    const initial=await page.evaluate(()=>({body:articleEditorSnapshot().body,encoded:encodedBody(),exported:adminBody({keepLinks:true})}));
    const blankClick=async()=>{
     await page.locator('#canvas').scrollIntoViewIfNeeded();
     const p=await page.locator('#canvas').evaluate(n=>{const r=n.getBoundingClientRect(),last=n.lastElementChild.getBoundingClientRect();return{x:r.left+r.width/2,y:Math.min(r.bottom-10,last.bottom+16)};});
     await page.mouse.click(p.x,p.y);await page.locator('#canvas [data-editor-caret-paragraph]').waitFor();
    };
    await blankClick();
    assert.deepEqual(await page.evaluate(()=>({body:articleEditorSnapshot().body,encoded:encodedBody(),exported:adminBody({keepLinks:true})})),initial);
    assert.deepEqual(await page.evaluate(()=>[articleNeedsSave,articleHistory.length]),[false,1]);
    await page.locator('#live-caret-text').click();assert.equal(await page.locator('[data-editor-caret-paragraph]').count(),0);
    await blankClick();await page.keyboard.type('Новый текст');await page.evaluate(()=>flushArticleHistorySnapshot());
    assert.equal(await page.locator('[data-editor-caret-paragraph]').count(),0);assert.match(await page.evaluate(()=>articleEditorSnapshot().body),/Новый текст/);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>articleEditorSnapshot().body),initial.body);
    await page.keyboard.press('Control+y');assert.match(await page.evaluate(()=>articleEditorSnapshot().body),/Новый текст/);
    assert.ok(await page.evaluate(()=>canvas.contains(getSelection().anchorNode)));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    fs.mkdirSync('output/wordcraft-qa/article-caret-2026-10-16',{recursive:true});
    await page.screenshot({path:'output/wordcraft-qa/article-caret-2026-10-16/live-'+brand+'-'+width+'.png'});
   }
  }
  await page.goto(base+'/instructions/#article-format',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Текст, шрифты, заголовки и ссылки',exact:true}).waitFor();
  assert.match(await page.locator('#wiki-view').textContent(),/пустой абзац исчезнет/);
  assert.deepEqual(errors,[]);
  console.log('PASS live: OUTMAX/HASL, desktop/mobile, click cleanup, clean save/backup/export/history, typing, undo/redo/caret, guide; all browser writes blocked after login ('+blockedWrites+' intercepted)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
