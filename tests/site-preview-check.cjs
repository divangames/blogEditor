const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{if(new URL(r.request().url()).pathname==='/site-builder/assets/builder.js')await new Promise(resolve=>setTimeout(resolve,500));return new URL(r.request().url()).origin===base?r.continue():r.abort();});
 await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();
 await page.frameLocator('#desktop').locator('[contenteditable]').first().waitFor();
 assert.equal(await page.locator('#product-count').evaluate(n=>getComputedStyle(n).color),'rgb(38, 50, 28)');
 await page.locator('[data-tab="products"]').click();assert.equal(await page.locator('#product-count').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(217, 237, 135)');await page.locator('[data-tab="layout"]').click();
 if(capture)await page.locator('.navigation nav').screenshot({path:'instructions/screens/site-product-count.png'});
 const before=await page.evaluate(()=>JSON.stringify(state));
 await page.locator('[data-preview-mode="desktop"]').click();await page.locator('#preview-fullscreen').click();
 await page.locator('#desktop-preview-controls').waitFor();assert.equal(await page.locator('#desktop-resolution-select option').count(),7);
 const dimensions=()=>page.locator('#desktop').evaluate(f=>({w:f.contentWindow.innerWidth,h:f.contentWindow.innerHeight,scale:new DOMMatrix(getComputedStyle(f).transform).a,stageW:f.parentElement.clientWidth,stageH:f.parentElement.clientHeight}));
 await page.locator('#desktop-zoom').selectOption('100');
 let d=await dimensions();assert.deepEqual([d.w,d.h,d.scale],[1920,1080,1]);
 await page.locator('#desktop-wrap').evaluate(n=>{n.scrollLeft=500;n.scrollTop=250;});assert.ok(await page.locator('#desktop-wrap').evaluate(n=>n.scrollLeft>0&&n.scrollTop>0));
 for(const resolution of ['1366x768','2560x1440','3840x2160']){await page.locator('#desktop-resolution-select').selectOption(resolution);d=await dimensions();assert.deepEqual([d.w,d.h],resolution.split('x').map(Number));}
 await page.locator('#desktop-resolution-select').selectOption('1920x1080');
 for(const zoom of ['50','100','150','200']){await page.locator('#desktop-zoom').selectOption(zoom);d=await dimensions();assert.deepEqual([d.w,d.h],[1920,1080]);assert.equal(d.scale,Number(zoom)/100);assert.equal(d.stageW,1920*Number(zoom)/100);}
 await page.locator('#desktop-zoom').selectOption('fit');
 assert.ok(await page.locator('#desktop-wrap').evaluate(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1),'fit must not overflow');
 await page.setViewportSize({width:1200,height:800});await page.waitForFunction(()=>{const n=document.querySelector('#desktop-wrap');return n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1;});
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),before,'preview settings must not change the project');
 await page.locator('#desktop-zoom').selectOption('100');
 if(capture){await page.setViewportSize({width:1600,height:1000});await page.locator('#desktop-wrap').evaluate(n=>{n.scrollLeft=0;n.scrollTop=0;});await page.screenshot({path:'instructions/screens/site-preview-resolution.png'});}
 await page.keyboard.press('Escape');assert.equal(await page.locator('#desktop-preview-controls').isVisible(),false);assert.equal((await dimensions()).w,1440);
 await page.locator('#preview-fullscreen').click();assert.deepEqual(Object.values(await dimensions()).slice(0,3),[1920,1080,1]);
 await page.locator('[data-preview-mode="phone"]').click();assert.equal(await page.locator('#desktop-preview-controls').isVisible(),false);assert.equal(await page.frameLocator('#phone').locator('body').evaluate(n=>n.ownerDocument.defaultView.innerWidth),390);
 await page.locator('[data-preview-mode="desktop"]').click();
 const editable=page.frameLocator('#desktop').locator('[contenteditable]').first();await editable.fill('Проверка 1920');await page.waitForFunction(()=>state.layout[0].texts.t0==='Проверка 1920');
 assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});console.log('PASS preview: 7 resolutions, exact 1920x1080 viewport, zoom 50/100/150/200, fit/resize, scroll, phone, exit/reopen, live editing, no project mutations');
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1600,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});}
