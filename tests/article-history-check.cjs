const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
let browser;

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const base='http://127.0.0.1:8877';
  const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.locator('#canvas').waitFor();

  await page.evaluate(()=>{
    const canvas=document.querySelector('#canvas');
    const rows=Array.from({length:70},(_,index)=>`<p data-history-row="${index}">Строка ${index}: текст для проверки позиции курсора и прокрутки.</p>`).join('');
    canvas.innerHTML=`<header><h1>Проверка истории</h1></header>${rows}`;
    resetArticleEditorHistory();
  });

  const row=page.locator('[data-history-row="35"]');
  const original=await row.textContent();
  await row.evaluate(node=>{
    node.scrollIntoView({block:'center'});
    const text=node.firstChild;
    const selection=getSelection();
    const range=document.createRange();
    range.setStart(text,8);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    node.closest('#canvas').focus({preventScroll:true});
  });
  const initialScroll=await page.locator('#canvas').evaluate(node=>node.scrollTop);
  assert.ok(initialScroll>200,'fixture must scroll the article canvas');

  await page.keyboard.type('XYZ');
  const beforeUndoScroll=await page.locator('#canvas').evaluate(node=>node.scrollTop);
  await page.keyboard.press('Control+z');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('[data-history-row="35"]').textContent(),original);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),8);
  assert.ok(await page.evaluate(()=>document.querySelector('#canvas').contains(getSelection().anchorNode)));
  assert.ok(Math.abs(await page.locator('#canvas').evaluate(node=>node.scrollTop)-beforeUndoScroll)<=2,'undo changed canvas scroll');

  await page.keyboard.press('Control+y');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.match(await page.locator('[data-history-row="35"]').textContent(),/XYZ/);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),11);
  const beforeToolbarUndo=await page.locator('#canvas').evaluate(node=>node.scrollTop);
  await page.keyboard.type('Q');
  await page.locator('#history-undo').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.doesNotMatch(await page.locator('[data-history-row="35"]').textContent(),/XYZQ/);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),11);
  assert.ok(Math.abs(await page.locator('#canvas').evaluate(node=>node.scrollTop)-beforeToolbarUndo)<=2,'toolbar undo changed canvas scroll');
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Article history: undo/redo keep caret and internal canvas scroll for shortcuts and toolbar buttons');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
