const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  for(const brand of ['outmax','hasl']){
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.waitForFunction(()=>articleBackupReady);
    await page.evaluate(brand=>{
      currentId='toc-check-'+brand+'-'+Date.now();lockedId=true;document.querySelector('#filename').value=currentId;document.querySelector('#page-title').value='Проверка содержания';setArticleSaveDocument();
      setBody('<header><h1>Проверка содержания</h1></header><nav class="om-toc"><h2>В этой статье</h2><div><a href="#one">Первый пункт<span style="margin-left:8px">↓</span></a><a href="#two">Второй пункт<span>→</span></a></div></nav><section id="one"><h2>Один</h2><p>Текст</p></section><section id="two"><h2>Два</h2></section>');changed();
    },brand);
    const link=page.locator('#canvas .om-toc a').first(),label=link.locator('[data-editor-toc-label]'),arrow=link.locator('[data-editor-toc-arrow]');
    const before=await arrow.boundingBox();
    await label.click();await page.keyboard.press('Control+a');
    assert.equal((await page.evaluate(()=>getSelection().toString())).toLocaleLowerCase('ru-RU'),'первый пункт');
    await page.keyboard.insertText('Новый пункт');
    assert.equal(await label.textContent(),'Новый пункт');assert.equal(await arrow.getAttribute('data-editor-toc-arrow'),'↓');
    const after=await arrow.boundingBox();assert.ok(Math.abs(before.x-after.x)<1,'arrow moved horizontally');
    assert.equal(await arrow.textContent(),'');assert.equal(await arrow.evaluate(n=>getComputedStyle(n,'::before').content),'"↓"');
    await page.waitForTimeout(450); // Separate replacement and deletion into two user actions.
    await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
    assert.equal(await arrow.count(),1);assert.equal(await arrow.getAttribute('data-editor-toc-arrow'),'↓');
    await page.keyboard.press('Control+z');assert.equal(await label.textContent(),'Новый пункт');
    const encoded=await page.evaluate(()=>encodedBody());assert.ok(encoded.includes('↓'));assert.ok(!encoded.includes('data-editor-toc-'));
    const exported=await page.evaluate(()=>adminBody());assert.ok(exported.includes('↓'));assert.ok(!exported.includes('data-editor-toc-'));assert.ok(!exported.includes('contenteditable'));
    await page.evaluate(()=>save());
    const id=await page.evaluate(()=>currentId),saved=await (await context.request.get(base+'/api/draft/'+id+'?brand='+brand)).json();
    assert.ok(saved.body.includes('Новый пункт'));assert.ok(saved.body.includes('↓'));
    await page.evaluate(body=>setBody(body),saved.body);
    assert.equal(await page.locator('#canvas .om-toc a [data-editor-toc-arrow]').count(),2);
    const html=await context.request.get(base+'/api/export/'+id+'?brand='+brand+'&format=html&site=ru');assert.ok((await html.text()).includes('↓'));
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('TOC: Ctrl+A selects label only; replace/delete/undo preserve arrows and position; save/reopen/HTML export retain arrows in both brands: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
