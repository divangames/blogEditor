const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage(),out=await context.newPage(),errors=[];
 for(const page of [p,out]){page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 const seed=require('../site-builder/catalog-seed.json').products;
 await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6}}));
 await p.goto(base+'/site-builder/hasl/');
 const ready=()=>p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state&&document.getElementById('phone').__haslDocState===state);
 await ready();
 await p.evaluate(()=>{state=freshState();const b=SiteBuilder.layout().find(b=>b.source==='s8');b.faq=R.faqDefaults(state,b);tab='layout';SiteBuilder.select(b.id);render();updatePreviews();});await ready();
 const select=async(key,value)=>{await require('./studio-test-helpers.cjs').reveal(p,'[data-faq-setting="'+key+'"]');await p.locator('[data-faq-setting="'+key+'"]').selectOption(value);await p.waitForFunction(({key,value})=>['desktop','phone'].every(id=>document.getElementById(id).contentDocument.querySelector('.faq-section')?.dataset['faq'+key[0].toUpperCase()+key.slice(1)]===value),{key,value});await ready();};
 await select('initial','first');await select('mode','single');await select('heading','right');
 assert.deepEqual(await p.evaluate(()=>SiteBuilder.current().faqSettings),{initial:'first',mode:'single',heading:'right'});
 let f=p.frameLocator('#desktop');assert.equal(await f.locator('.faq-q[aria-expanded="true"]').count(),1);
 await f.locator('.faq-q').nth(1).click();assert.equal(await f.locator('.faq-q[aria-expanded="true"]').count(),1);assert.equal(await f.locator('.faq-q').nth(1).getAttribute('aria-expanded'),'true');
 await p.evaluate(()=>updatePreviews());await ready();assert.equal(await f.locator('.faq-q').nth(1).getAttribute('aria-expanded'),'true');
 await f.locator('.faq-q').nth(1).click();await p.evaluate(()=>updatePreviews());await ready();assert.equal(await f.locator('.faq-q[aria-expanded="true"]').count(),0,'explicitly closed first stays closed on rerender');
 await select('initial','closed');await select('initial','first');assert.equal(await f.locator('.faq-q').first().getAttribute('aria-expanded'),'true','setting change reapplies initial state');
 if(capture){await require('./studio-test-helpers.cjs').reveal(p,'[data-faq-setting="heading"]');await p.locator('[data-faq-setting="initial"]').locator('xpath=ancestor::details[@data-faq-behavior]').screenshot({path:'instructions/screens/site-faq-options.png'});}
 const geometry=page=>page.locator('.faq-section').first().evaluate(s=>{const h=s.querySelector('.section-head').getBoundingClientRect(),q=s.querySelector('.faq').getBoundingClientRect();return {delta:Math.abs(h.y+h.height/2-q.y-q.height/2),hy:h.y,hb:h.bottom,hx:h.x,hr:h.right,qy:q.y,qx:q.x,qr:q.right};});
 for(const heading of ['left','right','top'])for(const initial of ['closed','first'])for(const mode of ['multiple','single']){
  const htmls=await p.evaluate(settings=>{SiteBuilder.current().faqSettings=settings;return [false,true].map(fragment=>R.build(state,products,content,{clean:true,fragment,site:fragment?'hasle':'hasl'}));},{heading,initial,mode});
  for(const [index,html] of htmls.entries())for(const width of [390,1440]){
   await out.setViewportSize({width,height:1000});await out.setContent(html);await out.locator('.faq-section').scrollIntoViewIfNeeded();
   assert.equal(await out.locator('.faq-q[aria-expanded="true"]').count(),initial==='first'?1:0);
   assert.equal(await out.locator('script[data-site-schema]').evaluate(n=>JSON.parse(n.textContent)['@graph'].find(item=>item['@type']==='FAQPage').mainEntity.length),3,'closed answers stay in FAQ schema');
   let g=await geometry(out);if(width<768||heading==='top')assert.ok(g.hb<=g.qy+1,JSON.stringify({heading,width,...g}));else{assert.ok(g.delta<2);assert.ok(heading==='left'?g.hr<g.qx:g.qr<g.hx);}
   await out.locator('.faq-q').nth(1).click();await out.waitForTimeout(290);
   assert.equal(await out.locator('.faq-q[aria-expanded="true"]').count(),mode==='multiple'&&initial==='first'?2:1);
   const closed=out.locator('.faq-q[aria-expanded="false"]').first();assert.equal(await closed.evaluate(q=>q.nextElementSibling.inert),true);
   assert.equal(await closed.evaluate(q=>q.nextElementSibling.getBoundingClientRect().height),0);
   await out.locator('.faq-q').nth(1).click();await out.waitForTimeout(290);assert.equal(await out.locator('.faq-q').nth(1).getAttribute('aria-expanded'),'false');
   if(capture&&index===0&&initial==='first'&&mode==='multiple'&&(width===1440||heading==='left'))await out.locator('.faq-section').screenshot({path:'instructions/screens/site-faq-'+heading+'-'+(width===390?'phone':'desktop')+'.png'});
  }
 }
 // Sample real animation frames: answer and side heading must move together.
 await out.setViewportSize({width:1440,height:1000});
 const html=await p.evaluate(()=>{SiteBuilder.current().faqSettings={initial:'closed',mode:'multiple',heading:'left'};return R.build(state,products,content,{clean:true});});await out.setContent(html);
 const sample=await out.locator('.faq-q').first().evaluate(async q=>{q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const frames=[];for(let i=0;i<9;i++){await new Promise(requestAnimationFrame);const s=q.closest('section'),a=q.nextElementSibling.getBoundingClientRect(),h=s.querySelector('.section-head').getBoundingClientRect(),f=s.querySelector('.faq').getBoundingClientRect();frames.push({height:a.height,hy:h.y,delta:Math.abs(h.y+h.height/2-f.y-f.height/2)});}return frames;});
 assert.ok(sample.some((s,i)=>i&&s.height>sample[i-1].height+1),'answer has intermediate animated heights');assert.ok(sample.every(s=>s.delta<2),'heading tracks list center during animation');assert.ok(Math.abs(sample.at(-1).hy-sample[0].hy)>5,'heading moves smoothly');
 await out.locator('.faq-q').first().evaluate(async q=>{const click=()=>q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));click();await new Promise(requestAnimationFrame);click();});await out.waitForTimeout(290);assert.equal(await out.locator('.faq-q').first().getAttribute('aria-expanded'),'true');
 await out.emulateMedia({reducedMotion:'reduce'});await out.locator('.faq-q').first().click();assert.equal(await out.locator('.faq-a').first().evaluate(a=>a.getAnimations().length),0);assert.equal(await out.locator('.faq-a').first().evaluate(a=>a.getBoundingClientRect().height),0);
 await out.emulateMedia({reducedMotion:'no-preference'});await out.locator('.faq-q').first().focus();await out.keyboard.press('Enter');assert.equal(await out.locator('.faq-a').first().evaluate(a=>a.getAnimations().length),0,'keyboard responds immediately');
 // Two independently configured copies, including runtime IDs.
 const copies=await p.evaluate(()=>{const b=SiteBuilder.current(),copy=structuredClone(b);copy.id='faq-copy';delete copy.anchor;copy.faqSettings={initial:'first',mode:'single',heading:'right'};state.layout.push(copy);return R.build(state,products,content,{clean:true});});await out.setContent(copies);
 const sections=out.locator('.faq-section');assert.equal(await sections.count(),2);await sections.first().locator('.faq-q').nth(1).click();assert.equal(await sections.nth(1).locator('.faq-q[aria-expanded="true"]').count(),1);const ids=await out.locator('.faq-a').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);
 // Persist through the actual project API on the isolated demonstration server.
 const saved=await p.evaluate(async()=>{const b=SiteBuilder.current();b.faqSettings={initial:'first',mode:'single',heading:'right'};changed();await SiteBuilder.save();return SiteBuilder.versionContext().id;});assert.ok(saved);await p.goto(base+'/site-builder/hasl/?page='+saved);await ready();assert.deepEqual(await p.evaluate(()=>SiteBuilder.layout().find(b=>b.source==='s8').faqSettings),{initial:'first',mode:'single',heading:'right'});
 assert.deepEqual(errors,[]);await out.close();await p.close();console.log('PASS FAQ options: 48 HTML/CMS desktop/phone combinations, sidebar controls, persistence, preview restore, animation frames/reversal, reduced motion, keyboard, independent copies');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8916';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
