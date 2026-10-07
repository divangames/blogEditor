const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('assert/strict'),fs=require('fs');
let browser;

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const base='http://127.0.0.1:8877';
  const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/email/');
  await page.locator('#canvas').waitFor();
  assert.equal(await page.locator('.editor-switcher .mark').getAttribute('src'),'../images/mail.png');
  await page.waitForFunction(()=>document.querySelector('.editor-switcher .mark')?.naturalWidth>0);
  assert.match(await page.locator('link[rel="icon"]').getAttribute('href'),/images\/mail\.png$/);
  await page.locator('.topbar').screenshot({path:'release/ui-check/screens/email-mail-icon.png'});

  const paragraph=page.locator('#canvas p').first();
  const original=await paragraph.textContent();
  await paragraph.evaluate(node=>{
    const text=[...node.childNodes].find(child=>child.nodeType===Node.TEXT_NODE && child.nodeValue.length>8);
    if(!text)throw new Error('Editable text node was not found');
    const selection=getSelection();selection.removeAllRanges();
    const range=document.createRange();range.setStart(text,5);range.collapse(true);selection.addRange(range);
    node.closest('#canvas').focus({preventScroll:true});
  });
  await page.keyboard.type('XYZ');
  assert.notEqual(await paragraph.textContent(),original);
  await page.keyboard.press('Control+z');
  assert.equal(await paragraph.textContent(),original);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),5);
  assert.ok(await page.evaluate(()=>document.querySelector('#canvas').contains(getSelection().anchorNode)));

  await page.keyboard.press('Control+y');
  assert.match(await paragraph.textContent(),/XYZ/);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),8);
  await page.keyboard.type('Q');
  await page.locator('#email-history-undo').click();
  assert.doesNotMatch(await paragraph.textContent(),/XYZQ/);
  assert.equal(await page.evaluate(()=>getSelection().anchorOffset),8);
  assert.ok(await page.evaluate(()=>document.querySelector('#canvas').contains(getSelection().anchorNode)));
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Email history: undo/redo caret, toolbar undo and mail icon OK');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
