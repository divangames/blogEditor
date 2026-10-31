const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const page=await context.newPage(),out=await context.newPage(),errors=[];
 for(const p of [page,out]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 const seed=require('../site-builder/catalog-seed.json').products,finderBrands=require('../site-builder/finder-brands-seed.json').brands;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6,finderBrands}}));
 await page.goto(base+'/site-builder/hasl/');
 await page.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const preview=page.frameLocator('#desktop');await preview.locator('.brand-picker summary').click();await preview.getByRole('checkbox',{name:'Nike',exact:true}).check();await preview.getByRole('checkbox',{name:'Adidas',exact:true}).check();assert.equal(new URL(await preview.locator('[id*="finderBtn"]').getAttribute('href')).searchParams.get('manufacturers'),'1-2');
 const snapshot=await page.evaluate(()=>JSON.stringify(state));
 const outputs=await page.evaluate(()=>{
  const s=structuredClone(state);s.layout=SiteBuilder.layout().filter(b=>['s3','s8'].includes(b.source));
  // Find sources by their rendered contents rather than relying on section numbering.
  const d=new DOMParser().parseFromString(R.build(state,products,content,{clean:true}),'text/html');
  const ids=[...d.querySelectorAll('main > section')].filter(n=>n.querySelector('.finder-form,.faq-q')).map(n=>n.dataset.siteBlock);
  s.layout=SiteBuilder.layout().filter(b=>ids.includes(b.id)).map(b=>({...structuredClone(b),faqSettings:{initial:'closed',mode:'multiple',heading:'left'}}));
  const variants={};for(const site of ['hasl','hasle'])for(const fragment of [false,true])variants[site+'-'+fragment]=R.build(s,products,{...content,site,shops:undefined},{clean:true,site,fragment});
  const finder=s.layout.find(b=>d.querySelector('[data-site-block="'+CSS.escape(b.id)+'"] .finder-form'));
  s.layout.push({...structuredClone(finder),id:'finder-independent-copy'});
  const cloned=R.build(s,products,content,{clean:true});s.layout=[finder];return {variants,cloned,onlyFinder:R.build(s,products,content,{clean:true})};
 });
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),snapshot,'export never changes the project');
 for(const [name,html] of Object.entries(outputs.variants))for(const width of [320,390,1440]){
  await out.setViewportSize({width,height:1000});await out.setContent(html,{waitUntil:'domcontentloaded'});
  const picker=out.locator('.brand-picker'),summary=picker.locator('summary'),size=out.locator('input[name="hasl-embed-size"]').first(),season=out.locator('[id*="fUse"]');
  const url=async()=>new URL(await out.locator('[id*="finderBtn"]').getAttribute('href'));
  assert.equal((await url()).search,'');
  await size.locator('..').click();await season.selectOption('1872');await summary.click();
  await picker.getByRole('checkbox',{name:'Nike',exact:true}).check();await picker.getByRole('checkbox',{name:'Adidas',exact:true}).check();
  assert.equal((await url()).searchParams.get('manufacturers'),'1-2');assert.equal((await url()).searchParams.get('sezon'),'1872');assert.equal((await url()).searchParams.get('razmer-obuvi'),await size.getAttribute('value'));
  assert.equal((await url()).pathname,name.startsWith('hasle-')?'/sneakers':'/krossovki');
  assert.equal((await url()).hostname,name.startsWith('hasle-')?'haslestore.com':'xn--80awro.xn--p1ai');
  assert.equal(await picker.locator('.brand-value').textContent(),'Nike, Adidas');assert.match(await out.locator('[id*="finderText"]').textContent(),/Nike, Adidas/);
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no overflow '+name+' '+width);
  if(capture&&name==='hasl-false'&&width!==320)await out.screenshot({fullPage:true,path:'instructions/screens/site-finder-brands-'+(width===390?'phone':'desktop')+'.png'});
  await picker.getByRole('checkbox',{name:'Nike',exact:true}).uncheck();assert.equal((await url()).searchParams.get('manufacturers'),'2');
  await picker.locator('.brand-any').click();assert.equal((await url()).searchParams.has('manufacturers'),false);assert.equal((await url()).searchParams.get('sezon'),'1872');assert.equal(await size.isChecked(),true);
  await picker.getByRole('checkbox',{name:'Puma',exact:true}).focus();await out.keyboard.press('Space');assert.equal((await url()).searchParams.get('manufacturers'),'9');
  await out.keyboard.press('Escape');assert.equal(await picker.evaluate(n=>n.open),false);assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
  await out.keyboard.press('Enter');assert.equal(await picker.evaluate(n=>n.open),true);await season.click();assert.equal(await picker.evaluate(n=>n.open),false);await out.keyboard.press('Escape');
  const q=out.locator('.faq-q').first();await q.scrollIntoViewIfNeeded();
  // Sample the actual answer height on animation frames, including the phone path.
  const frames=await q.evaluate(async q=>{q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const a=q.nextElementSibling,frames=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);frames.push(a.getBoundingClientRect().height);}return frames;});
  assert.ok(frames.some((h,i)=>i&&h>frames[i-1]+.2),'smooth expanding height '+name+' '+width);await out.waitForTimeout(280);
  assert.equal(await q.getAttribute('aria-expanded'),'true');assert.equal(await q.evaluate(q=>q.nextElementSibling.inert),false);
  if(capture&&name==='hasl-false'&&width===390)await out.locator('.faq-section').screenshot({path:'instructions/screens/site-faq-smooth-phone.png'});
  const closing=await q.evaluate(async q=>{q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const frames=[];for(let i=0;i<6;i++){await new Promise(requestAnimationFrame);frames.push(q.nextElementSibling.getBoundingClientRect().height);}return frames;});assert.ok(closing.some((h,i)=>i&&h<closing[i-1]-.2),'smooth collapsing height');
  await q.evaluate(async q=>{const click=()=>q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));click();await new Promise(requestAnimationFrame);click();await new Promise(requestAnimationFrame);click();});await out.waitForTimeout(300);
  assert.equal(await q.getAttribute('aria-expanded'),'true','rapid reversal settles open');assert.equal(await q.evaluate(q=>q.nextElementSibling.style.visibility),'');
  await out.emulateMedia({reducedMotion:'reduce'});await q.click();assert.equal(await q.evaluate(q=>q.nextElementSibling.getAnimations().length),0);assert.equal(await q.evaluate(q=>q.nextElementSibling.getBoundingClientRect().height),0);
  await out.emulateMedia({reducedMotion:'no-preference'});await q.focus();await out.keyboard.press('Enter');assert.equal(await q.evaluate(q=>q.nextElementSibling.getAnimations().length),0,'keyboard responds immediately');
 }
 await out.setContent(outputs.cloned);const pickers=out.locator('.brand-picker');assert.equal(await pickers.count(),2);await pickers.first().locator('summary').click();await pickers.first().getByRole('checkbox',{name:'Nike',exact:true}).check();assert.equal(await pickers.nth(1).locator('input[value="1"]').isChecked(),false);assert.equal(new URL(await out.locator('[id*="finderBtn"]').nth(1).getAttribute('href')).searchParams.has('manufacturers'),false);
 await out.setViewportSize({width:320,height:844});await out.setContent(outputs.onlyFinder);await out.locator('.brand-picker summary').click();await out.locator('.brand-grid input').evaluateAll(ns=>{ns.forEach(n=>n.checked=true);ns[0].dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(new URL(await out.locator('[id*="finderBtn"]').getAttribute('href')).searchParams.get('manufacturers').split('-').length,await out.locator('.brand-grid input').count());assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'all brands fit in the final section');
 await out.setContent(outputs.variants['hasl-false']);const long=out.locator('.faq-q').first();await long.evaluate(q=>q.nextElementSibling.querySelector('.faq-a-content').append(document.createTextNode(' Длинный демонстрационный ответ.'.repeat(150))));await long.click();await out.waitForTimeout(280);assert.equal(await long.evaluate(q=>q.nextElementSibling.getBoundingClientRect().height>=q.nextElementSibling.scrollHeight-1),true,'long answer is not cut off');await long.click();await out.waitForTimeout(280);assert.equal(await long.evaluate(q=>q.nextElementSibling.getBoundingClientRect().height),0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/?finder-check='+width+'#site-finder-brands');await page.getByRole('heading',{name:'Подбор: несколько брендов и плавные ответы FAQ',exact:true}).waitFor();await page.locator('#wiki-search').fill('несколько брендов');assert.ok(await page.locator('.wiki-result').count());}
 assert.deepEqual(errors,[]);await out.close();await page.close();console.log('PASS finder brands and smooth FAQ: both shops, full HTML/CMS, desktop/phone, URL combination/reset, keyboard, independent copies, animation frames/reversal/reduced motion, guide search/deep link');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});

