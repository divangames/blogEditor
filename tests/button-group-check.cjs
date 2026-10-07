const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const creds=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const out=path.join(root,'release/ui-check/screens');fs.mkdirSync(out,{recursive:true});
const base=process.env.EDITOR_TEST_BASE||'http://127.0.0.1:8877';let browser;

async function addButtonGroup(page,count=2,screenshot=''){
  await page.locator('#add-button').click();
  const dialog=page.locator('#button-dialog');
  await dialog.waitFor({state:'visible'});
  for(let index=1;index<count;index++) await page.locator('#button-add-item').click();
  const items=dialog.locator('.button-item');
  assert.equal(await items.count(),count,'dialog should contain requested button cards');
  for(let index=0;index<count;index++){
    const item=items.nth(index);
    await item.locator('[data-field="text"]').fill(`Кнопка ${index+1}`);
    await item.locator('[data-field="url"]').fill(`https://example.com/${index+1}`);
    if(index===1) await item.locator('.variant-preview.black').click();
    if(index===2) await item.locator('.variant-preview.outline').click();
  }
  if(screenshot) await dialog.screenshot({path:path.join(out,screenshot)});
  await page.locator('#button-submit').click();
}

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));

  await page.goto(base);await page.locator('#account-name strong').waitFor();
  await page.locator('#canvas').evaluate(canvas=>{canvas.innerHTML='<header><h1>Проверка</h1></header><nav class="om-toc"><h2>В этой статье</h2><div><a href="#one">Один раздел <span>↓</span></a></div></nav><section class="om-section" id="one"><h2>Один раздел</h2><p>Текст</p></section>';});
  const tocWidths=await page.locator('#canvas .om-toc>div').evaluate(element=>({grid:element.getBoundingClientRect().width,item:element.firstElementChild.getBoundingClientRect().width}));
  assert.ok(Math.abs(tocWidths.grid-tocWidths.item)<=3,'single OUTMAX TOC item should fill the full row');

  await addButtonGroup(page,2,'qa-button-group-dialog.png');
  const outmaxGroup=page.locator('#canvas .om-cta').last();
  assert.equal(await outmaxGroup.locator(':scope>a').count(),2,'OUTMAX group should keep two buttons');
  const desktopBoxes=await Promise.all([outmaxGroup.locator('a').nth(0).boundingBox(),outmaxGroup.locator('a').nth(1).boundingBox()]);
  assert.ok(Math.abs(desktopBoxes[0].y-desktopBoxes[1].y)<2&&desktopBoxes[1].x>desktopBoxes[0].x,'OUTMAX desktop buttons should be in one row');
  await page.setViewportSize({width:375,height:812});
  const mobileBoxes=await Promise.all([outmaxGroup.locator('a').nth(0).boundingBox(),outmaxGroup.locator('a').nth(1).boundingBox()]);
  assert.ok(mobileBoxes[1].y>mobileBoxes[0].y+mobileBoxes[0].height-1,'OUTMAX mobile buttons should stack');
  await page.locator('#canvas').screenshot({path:path.join(out,'qa-button-group-mobile.png')});

  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>openButtonDialog(document.querySelector('#canvas .om-cta:last-of-type a')));
  assert.equal(await page.locator('#button-dialog .button-item').count(),2,'editing should reopen every button in the group');
  await page.locator('#button-dialog .button-item').nth(1).locator('[data-field="text"]').fill('Вторая изменена');
  await page.locator('#button-submit').click();
  assert.equal(await outmaxGroup.locator('a').nth(1).textContent(),'Вторая изменена');

  await page.goto(base+'/hasl/');await page.locator('#account-name strong').waitFor();
  await addButtonGroup(page,3);
  const haslGroup=page.locator('#canvas .om-cta').last();
  const haslBoxes=await Promise.all([0,1,2].map(index=>haslGroup.locator('a').nth(index).boundingBox()));
  assert.ok(haslBoxes.every(box=>Math.abs(box.y-haslBoxes[0].y)<2),'HASL desktop buttons should share one row');
  assert.ok(await haslGroup.locator('a').nth(0).evaluate(element=>element.classList.contains('om-button--lime')),'HASL should use its lime primary style');
  await page.setViewportSize({width:375,height:812});
  const haslMobile=await Promise.all([0,1,2].map(index=>haslGroup.locator('a').nth(index).boundingBox()));
  assert.ok(haslMobile[1].y>haslMobile[0].y&&haslMobile[2].y>haslMobile[1].y,'HASL mobile buttons should stack');
  assert.deepEqual(errors,[],'button workflow should not produce page errors');
  console.log('Button groups: full-width odd TOC item, individual settings, desktop rows, mobile stacks: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
