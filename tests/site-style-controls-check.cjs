const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),out=await context.newPage(),errors=[];
 for(const p of [page,out]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 const seed=require('../site-builder/catalog-seed.json').products;await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:Object.keys(seed).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.waitForFunction(()=>window.SiteGlobalStyles&&typeof state!=='undefined'&&state?.layout?.length);
 await page.waitForFunction(()=>!document.body.classList.contains('site-starting'));
 await page.evaluate(()=>{state=structuredClone(state);state.globalStyles={};state.layout.forEach(b=>{delete b.objects;delete b.buttonStyles;});tab='layout';render();});
 const html=await page.evaluate(()=>R.build(state,products,content,{clean:true}));
 for(const width of [390,768,1262,1440]){
  await out.setViewportSize({width,height:950});await out.setContent(html,{waitUntil:'domcontentloaded'});
  assert.equal(await out.locator('.gender-field').count(),0);
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
  assert.equal(await out.locator('.section-subtitle').first().evaluate(n=>getComputedStyle(n).fontWeight),'500');
  if(width>=768){assert.equal(await out.locator('.size-choice-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),6);assert.ok(await out.locator('.finder-form').evaluate(n=>n.getBoundingClientRect().left>innerWidth*.45));}
  await out.locator('input[data-size-label="39"]').check({force:true});assert.match(await out.locator('[id*="finderBtn"]').getAttribute('href'),/razmer-obuvi=2200/);
  await out.locator('.size-choice-any').click();if(capture&&[390,1262].includes(width))await out.locator('section[id*="hasl-embed-finder"]').screenshot({path:'instructions/screens/site-finder-layout-'+(width===390?'phone':'desktop')+'.png'});
 }
 const key=await page.evaluate(()=>meta.links.find(f=>f.section==='s0'&&f.button&&f.label.includes('Собрать')).id);
 await page.getByText('Кнопки: видимость и стиль',{exact:true}).click();
 for(const [name,value] of Object.entries({width:280,paddingX:12,paddingY:9,phoneWidth:250,phonePaddingX:8,phonePaddingY:14}))await page.locator(`[data-button-id="${key}"][data-button-option="${name}"]`).fill(String(value));
 if(capture)await page.locator(`[data-button-reset="${key}"]`).locator('xpath=ancestor::fieldset').screenshot({path:'instructions/screens/site-button-dimensions.png'});
 for(const width of [390,1440]){await out.setViewportSize({width,height:950});await out.setContent(await page.evaluate(()=>exported()));const v=await out.locator('.sale-action').evaluate(n=>{const c=getComputedStyle(n);return[c.width,c.paddingLeft,c.paddingTop]});assert.deepEqual(v,width===390?['250px','8px','14px']:['280px','12px','9px']);}
 const bg='[data-background-settings="hero"]';await page.locator(bg+' > summary').click();
 await page.locator('[data-bg-kind="hero"][data-bg-device="desktop"][data-bg-axis="rotation"]').fill('25');
 await page.locator('[data-bg-kind="hero"][data-bg-device="desktop"][data-bg-axis="opacity"]').fill('65');
 await page.locator('[data-bg-kind="hero"][data-bg-device="desktop"][data-bg-axis="flipX"]').check();
 await page.locator('[data-bg-kind="hero"][data-bg-device="desktop"][data-bg-paint="mode"]').selectOption('gradient');
 await page.locator('[data-bg-kind="hero"][data-bg-device="desktop"][data-bg-paint="color"]').fill('#123456');
 if(capture)await page.locator(bg).screenshot({path:'instructions/screens/site-background-controls.png'});
 await page.evaluate(()=>{state.globalStyles={reviewCard:{desktop:{backgroundColor:'#123456'},phone:{backgroundColor:'#abcdef'}}};changed();});
 for(const width of [390,1440]){await out.setViewportSize({width,height:950});await out.setContent(await page.evaluate(()=>exported()));assert.equal(await out.locator('.review-card').first().evaluate(n=>getComputedStyle(n).backgroundColor),width===390?'rgb(171, 205, 239)':'rgb(18, 52, 86)');if(width===1440){const wallpaper=out.locator('.hero-sale .section-wallpaper-desktop');assert.equal(await wallpaper.evaluate(n=>getComputedStyle(n).opacity),'0.65');assert.match(await wallpaper.getAttribute('style'),/linear-gradient/);}}
 await page.evaluate(()=>{tab='globalStyles';render();});await page.locator('#global-style-type').selectOption('reviewText');await page.locator('[data-global-style="fontSize"]').fill('15');
 if(capture)await page.locator('#global-style-type').locator('xpath=ancestor::aside').screenshot({path:'instructions/screens/site-global-styles.png'});
 const project=await page.evaluate(()=>structuredClone(state));
 const saved=await context.request.post(base+'/editor-api/site-builder/projects',{data:{...project,title:'Проверка оформления',id:undefined,revision:undefined,requestId:'style-qa-'+Date.now()}});assert.ok(saved.ok(),await saved.text());
 await page.locator('.account-menu').evaluate(n=>n.open=true);await page.locator('.profile-site-templates').waitFor();await page.locator('.profile-site-templates .studio-my-templates svg[data-phosphor]').waitFor();assert.equal(await page.locator('.profile-site-template-list').count(),0);
 if(capture)await page.locator('.account-dropdown').screenshot({path:'instructions/screens/site-template-profile.png'});
 const response=await saved.json(),restored=await(await context.request.get(base+'/editor-api/site-builder/projects/'+response.id)).json();assert.deepEqual(restored.state.globalStyles,project.globalStyles);assert.deepEqual(restored.state.layout[0].buttonStyles,project.layout[0].buttonStyles);
 await page.locator('.account-menu').evaluate(n=>n.open=false);
 await page.evaluate(()=>{const frame=document.getElementById('desktop'),node=frame.contentDocument.querySelector('.review-card');ObjectStudio.bridge.select(node.dataset.siteObject,'desktop',node.closest('[data-site-block]').dataset.siteBlock);});
 await page.locator('[data-global-from-object]').click();await page.locator('#global-style-type').waitFor();assert.equal(await page.locator('#global-style-type').inputValue(),'reviewCard');
 await page.locator('.account-menu').evaluate(n=>n.open=true);await page.locator('.profile-site-templates [data-new-blank]').click();await page.waitForFunction(()=>state.layout.length===0);assert.equal(await page.evaluate(()=>state.title),'Новый сайт');
 assert.deepEqual(errors,[]);await page.close();await out.close();console.log('PASS finder, no gender, lighter subtitles, responsive button dimensions, background rotation/opacity/gradient, global styles, server persistence, profile menu');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8914';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base,{capture:!!process.env.CAPTURE_STYLE_CONTROLS});}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
