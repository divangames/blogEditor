const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage();await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const seed=require('../site-builder/catalog-seed.json').products;await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6}}));
 await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.ObjectStudio&&document.getElementById('desktop').__haslDocState===state&&!document.body.classList.contains('site-starting'));
 await p.evaluate(()=>{state.autoRefresh=false;const hero=SiteBuilder.layout().find(b=>b.source==='s0');hero.objects={'link-l0':{desktop:{width:307,height:50,x:-4,y:-323,position:'relative'},phone:{x:-7,y:-19,position:'relative'}},'link-l1':{desktop:{x:-7,y:-299,position:'relative'},phone:{x:-2,y:-8,position:'relative'}}};for(const [id,y] of [['text-t100',132],['text-t101',132],['text-t102',142],['text-t103',130]])hero.objects[id]={desktop:{x:0,y,display:'inline-block',position:'relative'},phone:{x:0,y:0}};updatePreviews();});
 await p.waitForFunction(()=>document.getElementById('desktop').__haslDocState===state);
 const selectors=['.sale-action','.sale-details','.mobile-sale-heading','.mobile-sale-label','.mobile-sale-caption'];
 const geometry=frame=>frame.locator('.hero-sale').evaluate((n,selectors)=>selectors.map(sel=>{const r=n.querySelector(sel).getBoundingClientRect();return [r.x,r.y,r.width,r.height];}),selectors);
 const before=await geometry(p.frameLocator('#desktop'));await p.locator('#site-preview').click();const preview=p.frameLocator('#site-preview-dialog iframe');await preview.locator('.sale-action').waitFor();await preview.locator('body').evaluate(()=>document.fonts.ready);
 assert.deepEqual(await geometry(preview),before,'preview matches editing coordinates');
 const dimensions=await p.locator('#site-preview-dialog iframe').evaluate(n=>[n.style.width,n.style.height]);
 for(const size of [{width:1024,height:650},{width:1600,height:1100},{width:800,height:600}]){await p.setViewportSize(size);await p.waitForTimeout(120);assert.deepEqual(await geometry(preview),before,'outer resize scales without reflow');assert.deepEqual(await p.locator('#site-preview-dialog iframe').evaluate(n=>[n.style.width,n.style.height]),dimensions);}
 await p.setViewportSize({width:1440,height:1000});
 if(capture)await p.locator('#site-preview-dialog').screenshot({path:'instructions/screens/site-preview-parity-desktop.png'});
 await p.locator('[data-preview-size=phone]').click();assert.deepEqual(await geometry(preview),await geometry(p.frameLocator('#phone')),'phone uses same device size');
 if(capture)await p.locator('#site-preview-dialog').screenshot({path:'instructions/screens/site-preview-parity-phone.png'});
 // A queued close event must not clear the freshly reopened frame.
 for(let i=0;i<5;i++){await p.evaluate(()=>{document.getElementById('site-preview-dialog').close();document.getElementById('site-preview').click();});await preview.locator('.sale-action').waitFor();assert.ok(await preview.locator('.hero-sale').isVisible());}
 await p.locator('#site-preview-reload').click();await preview.locator('.sale-action').waitFor();await p.waitForFunction(()=>document.querySelector('.site-preview-message').textContent==='');
 const html=await p.evaluate(()=>R.build(state,products,content,{clean:true,preview:true}));const out=await context.newPage();await out.route('**/*',r=>r.abort());
 for(const width of [1440,1024,768,430,390,360]){let reference;for(const height of [900,620,1100]){await out.setViewportSize({width,height});await out.setContent(html);await out.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});const result=await geometry(out);if(reference)assert.deepEqual(result,reference,'export height-independent at '+width);reference=result;} }
 await out.close();await p.close();console.log('PASS editor/preview parity desktop+phone, resize, repeated reopen/reload, exported hero at six widths and three heights');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8914';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
