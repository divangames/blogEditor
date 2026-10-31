const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 let release;const gate=new Promise(resolve=>release=resolve);await p.route('**/editor-api/site-builder/reference',async r=>{await gate;await r.continue();});
 await p.goto(base+'/site-builder/hasl/',{waitUntil:'domcontentloaded'});await p.locator('#site-boot-status').waitFor();
 assert.match(await p.locator('#site-boot-message').innerText(),/Загружаем шаблон/);assert.equal(await p.locator('.workspace').evaluate(n=>getComputedStyle(n).visibility),'hidden');
 const mark=p.locator('.site-boot-mark span').first(),start=await mark.evaluate(n=>getComputedStyle(n).transform);await p.waitForTimeout(160);assert.notEqual(await mark.evaluate(n=>getComputedStyle(n).transform),start,'preloader actually animates');
 for(const width of [1440,390]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(capture)await p.screenshot({path:'instructions/screens/site-preloader-'+(width===390?'phone':'desktop')+'.png'});}
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await mark.evaluate(n=>getComputedStyle(n).animationName),'none');release();await p.locator('#site-boot-status').waitFor({state:'detached'});assert.equal(await p.locator('body').evaluate(n=>n.classList.contains('site-starting')),false);await p.locator('#site-block-select').waitFor({state:'attached'});
 await p.unroute('**/editor-api/site-builder/reference');let failed=false;await p.route('**/editor-api/site-builder/reference',r=>{if(!failed){failed=true;return r.fulfill({status:503,json:{error:'Demo failure'}});}return r.continue();});
 await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width:1440,height:900});await p.reload();await p.locator('.site-boot-failed').waitFor();assert.ok(await p.locator('#site-boot-retry').isVisible());assert.equal(await mark.evaluate(n=>getComputedStyle(n).animationName),'none');if(capture)await p.screenshot({path:'instructions/screens/site-preloader-error.png'});
 await p.locator('#site-boot-retry').click();await p.locator('#site-boot-status').waitFor({state:'detached'});await p.locator('#site-block-select').waitFor();
 assert.deepEqual(errors,[]);await p.close();console.log('PASS animated preloader: delayed data, desktop/phone, reduced motion, successful removal, API failure and real retry');
 // A missing startup script leaves a recoverable error instead of endless animation.
 const broken=await context.newPage();await broken.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await broken.route('**/site-builder/assets/builder.js',r=>r.abort());await broken.goto(base+'/site-builder/hasl/');await broken.locator('.site-boot-failed').waitFor();assert.ok(await broken.locator('#site-boot-retry').isVisible());await broken.close();
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8917';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
