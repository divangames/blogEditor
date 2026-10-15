// Isolated demonstration account only; never reads production credentials.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8878';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:false,api_configured:false,smtp_configured:false}}));
  fs.mkdirSync('output/playwright',{recursive:true});
  for(const route of ['/','/hasl/','/email/','/instructions/','/tiptap/','/login']){
   await page.goto(base+route,{waitUntil:'domcontentloaded'});
   if(route==='/tiptap/')await page.locator('#editor .tiptap').waitFor();
   else if(['/', '/hasl/', '/email/'].includes(route))await page.locator('#canvas').waitFor();
   const name=route.replaceAll('/','')||'outmax';
   if(route!=='/login')assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiInput),'keyboard',name+' shared behavior loaded');
   for(const width of [1440,1024,768,390,320]){
    await page.setViewportSize({width,height:900});
    const report=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
     smallInputs:[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,select')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.name),
     clipped:[...document.querySelectorAll('.topbar button,.topbar summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1;}).map(e=>e.id||e.textContent.trim())}));
    console.log(name,width,JSON.stringify(report));
    if(!process.env.UI_AUDIT_ONLY){
     assert.ok(report.overflow<=1,name+' overflow '+width);
     assert.deepEqual(report.clipped,[],name+' clipped actions '+width);
     if(width<=600)assert.deepEqual(report.smallInputs,[],name+' mobile input sizes');
    }
    if(width===390||width===1440)await page.screenshot({path:`output/playwright/${name}-${width}.png`});
    const menu=page.locator('.editor-switcher>summary');
    if(await menu.count()){
     await menu.click();
     const rect=await page.locator('.editor-switcher-menu').boundingBox();
     if(!process.env.UI_AUDIT_ONLY)assert.ok(rect.x>=0&&rect.x+rect.width<=width+1,name+' menu '+width);
     await page.keyboard.press('Escape');
     assert.equal(await menu.evaluate(e=>document.activeElement===e),true,'Escape restores menu trigger focus');
    }
   }
   if(['/', '/hasl/', '/email/'].includes(route)){
    await page.setViewportSize({width:390,height:812});
    for(const mode of ['no-preference','reduce']){
     await page.emulateMedia({reducedMotion:mode});
     // Test native modal geometry without triggering any file or server writes.
     await page.evaluate(()=>document.querySelector('dialog').showModal());
     const dialog=page.locator('dialog[open]').first(),rect=await dialog.boundingBox();
     assert.ok(rect.x>=0&&rect.x+rect.width<=391&&rect.y>=0&&rect.y+rect.height<=813,'Mobile dialog stays in viewport');
     if(mode==='reduce')assert.equal(await dialog.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
     await page.keyboard.press('Escape');
     assert.equal(await page.locator('dialog[open]').count(),0);
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.editor-switcher>summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiInput),'pointer');
    assert.notEqual(await page.locator('.editor-switcher-menu').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.editor-switcher-menu').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
    await page.keyboard.press('Escape');
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: pages, navigation, 5 viewport widths, no JavaScript errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
