const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
async function selectedStyle(page,property){return page.locator('#color-test strong').evaluate((n,property)=>getComputedStyle(document.createTreeWalker(n,NodeFilter.SHOW_TEXT).nextNode().parentElement)[property],property);}
async function select(page,selector,start=0,end=null){await page.evaluate(({selector,start,end})=>{
  const parent=document.querySelector(selector),walker=document.createTreeWalker(parent,NodeFilter.SHOW_TEXT);const node=walker.nextNode();
  const range=document.createRange();range.setStart(node,start);range.setEnd(node,end ?? node.length);document.querySelector('#canvas').focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();
},{selector,start,end});}
async function applyHex(page,id,hex){await page.locator('#'+id+'-open').click();await page.locator('#'+id+'-hex').fill(hex);await page.locator('#'+id+'-panel [data-color-apply]').click();}
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
 for(const brand of ['outmax','hasl']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(()=>{setBody('<header><h1>Заголовок статьи</h1></header><p id="color-test" style="color:#000!important">До <strong>выделенный текст</strong> после</p><p id="other">Не менять</p>');setArticleSaveDocument();resetArticleEditorHistory();localStorage.removeItem(recentColorKey());});
  const otherColor=await page.locator('#other').evaluate(n=>getComputedStyle(n).color);
  await select(page,'#color-test strong');await applyHex(page,'text-color','#12a');
  assert.equal(await page.locator('#color-test strong span').evaluate(n=>getComputedStyle(n).color),'rgb(17, 34, 170)');
  assert.equal(await page.evaluate(()=>getSelection().toString()),'выделенный текст');
  assert.equal(await page.locator('#other').evaluate(n=>getComputedStyle(n).color),otherColor);
  assert.equal(await page.evaluate(()=>recentTextColors()[0]),'#1122AA');
  await page.keyboard.press('Control+z');assert.equal(await page.locator('#color-test strong').evaluate(n=>getComputedStyle(n).color),'rgb(0, 0, 0)');
  await page.keyboard.press('Control+y');assert.equal(await page.locator('#color-test strong span').evaluate(n=>getComputedStyle(n).color),'rgb(17, 34, 170)');
  await page.locator('#text-color-hex').fill('wrong');await page.locator('#text-color-panel [data-color-apply]').click();
  assert.equal(await page.locator('#text-color-hex').getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>recentTextColors()[0]),'#1122AA');
  // Native color events after focus/selection is lost must use the pinned range.
  await page.locator('#text-color-hex').fill('#AABBCC');await page.evaluate(()=>{getSelection().removeAllRanges();const input=document.querySelector('#text-color');input.value='#aabbcc';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await selectedStyle(page,'color'),'rgb(170, 187, 204)');
  assert.equal(await page.evaluate(()=>recentTextColors()[0]),'#AABBCC');
  await page.evaluate(()=>{window.EyeDropper=class {async open(){getSelection().removeAllRanges();return {sRGBHex:'#654321'};}};});
  await page.locator('#text-color-panel [data-eyedropper]').click();
  assert.equal(await page.evaluate(()=>recentTextColors()[0]),'#654321');assert.equal(await page.evaluate(()=>getSelection().toString()),'выделенный текст');
  await page.locator('#text-color-panel').press('Escape');
  await select(page,'#color-test strong');await applyHex(page,'highlight-color','FEDCBA');
  assert.equal(await selectedStyle(page,'backgroundColor'),'rgb(254, 220, 186)');
  const html=await page.evaluate(()=>adminBody());assert.ok(html.includes('rgb(101, 67, 33)') || html.includes('#654321'));assert.ok(html.includes('254, 220, 186') || html.includes('#fedcba'));
  fs.mkdirSync('release/ui-check/screens',{recursive:true});await page.setViewportSize({width:375,height:812});
  await page.locator('#highlight-color-open').click();await page.locator('#text-color-open').click();
  await page.locator('#text-color-panel').waitFor({state:'visible'});
  await page.locator('#text-color-panel [data-color="#AABBCC"]').click();
  assert.equal(await selectedStyle(page,'color'),'rgb(170, 187, 204)');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`release/ui-check/screens/colors-${brand}-mobile.png`});
  const cached=await page.evaluate(()=>recentTextColors());await page.reload();await page.waitForFunction(()=>articleBackupReady);assert.deepEqual(await page.evaluate(()=>recentTextColors()),cached);
  await page.evaluate(()=>{
    setBody('<h1>Заголовок статьи</h1><p id="multi-a">ABCDE</p><p id="multi-b">FGHIJ</p>');
    const range=document.createRange();range.setStart(document.querySelector('#multi-a').firstChild,2);range.setEnd(document.querySelector('#multi-b').firstChild,2);
    document.querySelector('#canvas').focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();rememberColorSelection();
  });
  await applyHex(page,'text-color','#F01234');
  assert.equal(await page.locator('#multi-a span').textContent(),'CDE');assert.equal(await page.locator('#multi-b span').textContent(),'FG');
  assert.equal(await page.locator('#multi-a span').evaluate(n=>getComputedStyle(n).color),'rgb(240, 18, 52)');
  assert.equal(await page.locator('#multi-b span').evaluate(n=>getComputedStyle(n).color),'rgb(240, 18, 52)');
  assert.equal(await page.locator('#multi-a').textContent(),'ABCDE');assert.equal(await page.locator('#multi-b').textContent(),'FGHIJ');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Text colors: HEX validation, pinned selection, native input/change, mocked eyedropper, undo/redo, recent colors after reload, export and mobile in both brands: OK');await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
