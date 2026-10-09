const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
async function heading(page,marker){
 await page.evaluate(marker=>{window.__previousH2=[...canvas.querySelectorAll('h2')];const node=document.querySelector('[data-heading-test="'+marker+'"]');const range=document.createRange();range.selectNodeContents(node);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();},marker);
 await page.locator('#heading-style').selectOption('h2');
 await page.waitForFunction(()=>[...canvas.querySelectorAll('h2')].some(n=>!window.__previousH2.includes(n) && n.id));
 return page.evaluate(()=>[...canvas.querySelectorAll('h2')].find(n=>!window.__previousH2.includes(n)).id);
}
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
 for(const route of ['/','/hasl/']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+route);await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(()=>{setBody('<header><h1>Заголовок статьи</h1></header><nav class="om-toc"><h2 id="toc-title">В этой статье</h2><div><a href="#existing">Старый пункт<span>↓</span></a></div></nav><section class="om-section" id="existing"><h2>Готовый раздел</h2><p>Текст</p><p data-heading-test="nested">Внутренний заголовок</p></section><p data-heading-test="first">Новый раздел</p><p data-heading-test="second">Новый раздел</p>');setArticleSaveDocument();resetArticleEditorHistory();document.querySelector('#toc-editor').closest('details').open=true;});
  const first=await heading(page,'first'),second=await heading(page,'second'),nested=await heading(page,'nested');
  assert.notEqual(first,second);assert.notEqual(nested,'existing');
  await page.waitForFunction(id=>[...document.querySelectorAll('#toc-items select option')].some(n=>n.value===id),first);
  const available=await page.evaluate(()=>targets());
  assert.ok(available.some(n=>n.id===first));assert.ok(available.some(n=>n.id===second));assert.ok(available.some(n=>n.id===nested));assert.ok(available.some(n=>n.id==='existing'));assert.ok(!available.some(n=>n.id==='toc-title'));
  await page.locator('#toc-items select[data-field="target"]').first().selectOption(first);
  assert.equal(await page.locator('#canvas .om-toc a').first().getAttribute('href'),'#'+first);
  await page.locator('h2[id="'+first+'"]').fill('Переименованный раздел');
  await page.waitForFunction(id=>targets().find(n=>n.id===id)?.label==='Переименованный раздел',first);
  assert.equal(await page.locator('h2[id="'+first+'"]').getAttribute('id'),first);
  assert.equal(await page.locator('#canvas .om-toc a').first().getAttribute('href'),'#'+first);
  const exported=await page.evaluate(()=>adminBody());
  assert.ok(exported.includes('id="'+first+'"'));assert.ok(exported.includes('href="#'+first+'"'));
  await page.evaluate(id=>{const node=canvas.querySelector('h2[id="'+id+'"]');const range=document.createRange();range.selectNodeContents(node);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();},first);
  await page.locator('#heading-style').selectOption('h3');await page.locator('#heading-style').selectOption('h2');
  assert.equal(await page.locator('#canvas .om-toc a').first().getAttribute('href'),'#'+first);
  assert.equal(await page.locator('h2[id="'+first+'"]').count(),1);
  await page.evaluate(body=>setBody(body,{normalize:false}),exported);
  assert.ok((await page.evaluate(()=>targets())).some(n=>n.id===first && n.label==='Переименованный раздел'));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('H2 anchors: formatBlock, unique duplicate titles, nested H2, existing section, TOC excluded, rename/export/reopen in OUTMAX/HASL: OK');await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
