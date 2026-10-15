// Isolated demo only: compare the legacy toolbar result with the command adapter.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
const fixture='<header><h1>Ссылки в статье</h1></header><p id="link-first">До <strong>Выбранный текст 👟</strong> после.</p><p id="link-second">Выбранный текст 👟</p><h2 id="destination">Раздел назначения</h2>';
const directory='output/wordcraft-qa/links';fs.mkdirSync(directory,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function reset(){await page.evaluate(body=>{setBody(body);resetArticleEditorHistory();},fixture);}
  async function select(){await page.evaluate(()=>{const n=document.querySelector('#link-first strong').firstChild,r=document.createRange();r.selectNodeContents(n);canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);lastRange=r.cloneRange();});}
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.waitForFunction(()=>articleBackupReady);await reset();await select();
   page.once('dialog',d=>d.accept('https://example.com/article?lang=ru#part'));await page.locator('#make-link').click();
   const toolbar=await page.locator('#canvas').innerHTML();assert.equal(await page.locator('#link-first a').getAttribute('href'),'https://example.com/article?lang=ru#part');assert.equal(await page.locator('#link-second a').count(),0);assert.equal(await page.evaluate(()=>articleHistory.length),2);
   const filename=directory+'/'+brand+'-legacy.json';
   if(process.argv.includes('--baseline')){fs.writeFileSync(filename,JSON.stringify({fixture,html:toolbar},null,2));continue;}
   assert.equal(toolbar,fs.readFileSync('tests/fixtures/article-link-'+brand+'-legacy.html','utf8'),'toolbar preserves the pre-adapter result');
   const original=await page.evaluate(()=>{ArticleCommands.execute('edit.undo');return canvas.innerHTML;});await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.equal(await page.locator('#canvas').innerHTML(),toolbar);
   await reset();await select();await page.evaluate(()=>ArticleCommands.execute('link.insert',{url:'https://example.com/article?lang=ru#part'}));assert.equal(await page.locator('#canvas').innerHTML(),toolbar,'direct command equals toolbar');
   assert.equal(await page.locator('#link-first strong').textContent(),'Выбранный текст 👟');assert.equal(await page.evaluate(()=>articleHistory.length),2);
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await page.locator('#canvas').innerHTML(),original);await page.evaluate(()=>ArticleCommands.execute('edit.redo'));assert.equal(await page.locator('#canvas').innerHTML(),toolbar);
   await select();await page.evaluate(()=>ArticleCommands.execute('link.insert',{url:'#destination'}));assert.equal(await page.locator('#link-first a').getAttribute('href'),'#destination');assert.equal(await page.locator('#link-first a').count(),1);
   const before=await page.locator('#canvas').innerHTML(),history=await page.evaluate(()=>articleHistory.length);
   for(const url of ['javascript:alert(1)','data:text/html,test','/relative',7,''])await assert.rejects(()=>page.evaluate(url=>ArticleCommands.execute('link.insert',{url}),url));
   await assert.rejects(()=>page.evaluate(()=>ArticleCommands.batch([{id:'link.insert',params:{url:'https://example.com'}}])),/недоступна в макросе/);
   assert.equal(await page.locator('#canvas').innerHTML(),before);assert.equal(await page.evaluate(()=>articleHistory.length),history);
   page.once('dialog',d=>d.dismiss());await page.locator('#make-link').click();assert.equal(await page.locator('#canvas').innerHTML(),before);assert.equal(await page.evaluate(()=>articleHistory.length),history);
   for(const width of [375,1440]){
    await page.setViewportSize({width,height:900});await select();await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('ссылк');
    const item=page.locator('#article-command-results button').filter({hasText:'Вставить или изменить ссылку'});assert.equal(await item.count(),1);assert.equal(await item.isEnabled(),true);
    page.once('dialog',d=>d.accept('https://example.com/from-palette'));await item.click();assert.equal(await page.locator('#link-first a').getAttribute('href'),'https://example.com/from-palette');assert.equal(await page.locator('#link-second a').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));assert.equal(await page.evaluate(()=>document.activeElement===canvas),true,'palette action returns focus to the article');
   }
   const saved=await page.evaluate(()=>adminBody());await page.evaluate(body=>setBody(body),saved);assert.equal(await page.locator('#link-first a').getAttribute('href'),'https://example.com/from-palette');
   await page.evaluate(()=>{setBody('<h1>Ссылка с оформлением</h1><p id="mixed-link"><strong>Жирный</strong> и <em>курсив 👟</em> после</p>');resetArticleEditorHistory();const p=document.getElementById('mixed-link'),r=document.createRange();r.setStart(p.firstChild.firstChild,0);r.setEnd(p.querySelector('em').firstChild,p.querySelector('em').firstChild.length);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(r);lastRange=r.cloneRange();});
   const mixed=await page.locator('#canvas').innerHTML();await page.evaluate(()=>ArticleCommands.execute('link.insert',{url:'https://example.com/mixed'}));assert.equal(await page.locator('#mixed-link strong').textContent(),'Жирный');assert.equal(await page.locator('#mixed-link em').textContent(),'курсив 👟');assert.equal(await page.locator('#mixed-link').textContent(),'Жирный и курсив 👟 после');assert.equal(await page.evaluate(()=>articleHistory.length),2);await page.evaluate(()=>ArticleCommands.execute('edit.undo'));assert.equal(await page.locator('#canvas').innerHTML(),mixed);
   await page.evaluate(()=>{const p=document.getElementById('mixed-link'),r=document.createRange();r.selectNodeContents(p);r.collapse(false);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(r);lastRange=r.cloneRange();resetArticleEditorHistory();ArticleCommands.execute('link.insert',{url:'https://example.com/caret'});});assert.equal(await page.locator('#mixed-link a').getAttribute('href'),'https://example.com/caret');assert.equal(await page.locator('#mixed-link a').textContent(),'https://example.com/caret');assert.equal(await page.evaluate(()=>articleHistory.length),2);
   await page.evaluate(()=>{lastRange=null;getSelection().removeAllRanges();});await assert.rejects(()=>page.evaluate(()=>ArticleCommands.execute('link.insert',{url:'https://example.com'})),/курсор|выделите/i);
  }
  assert.deepEqual(errors,[]);console.log(process.argv.includes('--baseline')?'PASS: legacy toolbar link baseline, selected fragment, formatting, duplicate text and one history step, both brands':'PASS: identical toolbar/registry links, palette mobile/desktop, anchors, rich text, one undo/redo, cancel, invalid URLs, no macros and reopen, both brands');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
