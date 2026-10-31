const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const profile of [{name:'lite',memory:2,cores:2},{name:'balanced',memory:4,cores:4},{name:'high',memory:8,cores:8}]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();await p.route('**/*',r=>r.abort());let moduleRequests=0;await p.route(/\/public-site-motion\.js(?:\?.*)?$/,r=>{moduleRequests++;return r.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync('site-builder/mobile-motion.js','utf8')});});
  await p.evaluate(profile=>{Object.defineProperty(navigator,'deviceMemory',{configurable:true,get:()=>profile.memory});Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,get:()=>profile.cores});Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false}});if(profile.name==='high'){let time=performance.now();window.requestAnimationFrame=cb=>setTimeout(()=>cb(time+=1000/120),4);window.cancelAnimationFrame=clearTimeout;}},profile);
  await p.setContent(fs.readFileSync('release/mobile-motion-20261026/candidate/hasl.html','utf8'));
  assert.equal(await p.locator('[data-motion-tier]').count(),0,'no decorative effects during loading');
  assert.equal(moduleRequests,0,'optional module is not fetched on page load');
  const root=p.locator('.hasl-home-embed'),q=p.locator('.faq-q').first();await q.scrollIntoViewIfNeeded();await q.click();
  assert.equal(await q.getAttribute('aria-expanded'),'true');assert.equal(await q.evaluate(q=>q.nextElementSibling.inert),false);
  const properties=await p.evaluate(()=>document.getAnimations().flatMap(animation=>animation.effect.getKeyframes().flatMap(frame=>Object.keys(frame).filter(key=>!['offset','computedOffset','easing','composite'].includes(key)))));
  assert.ok(properties.every(property=>['transform','opacity'].includes(property)),JSON.stringify(properties));
  await p.waitForTimeout(330);if(profile.name==='high'){await q.click();await q.click();await p.waitForTimeout(330);}assert.equal(await root.evaluate(n=>n.__haslMotion.tier),profile.name);assert.equal(moduleRequests,profile.name==='lite'?0:1,'only eligible interaction fetches the optional module');
  if(profile.name==='lite'){assert.equal(await root.evaluate(n=>n.__haslMotion.stats.samples),0);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);}
  if(profile.name==='high'){
   assert.ok((await root.evaluate(n=>n.__haslMotion.stats.refreshPeriod))<10,'120 Hz sample is supported without hard-coded 60 Hz cap');
   await q.click();await p.evaluate(()=>new Promise(resolve=>setTimeout(()=>{const end=performance.now()+100;while(performance.now()<end){}resolve();},0)));await p.waitForFunction(()=>document.querySelector('.hasl-home-embed').__haslMotion.tier!=='high');
   await q.click();await p.evaluate(()=>new Promise(resolve=>setTimeout(()=>{const end=performance.now()+100;while(performance.now()<end){}resolve();},0)));await p.waitForFunction(()=>document.querySelector('.hasl-home-embed').__haslMotion.tier==='lite');
   assert.equal(await q.getAttribute('aria-expanded'),'true','degradation preserves FAQ functionality');
  }
  await p.emulateMedia({reducedMotion:'reduce'});await q.click();assert.equal(await root.evaluate(n=>n.__haslMotion.tier),'lite');assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
  await p.emulateMedia({reducedMotion:'no-preference'});await q.focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.getAnimations().length),0,'keyboard has no decorative delay');
  const htmlBefore=await p.locator('script[data-site-schema]').textContent();await q.click();assert.equal(await p.locator('script[data-site-schema]').textContent(),htmlBefore,'FAQ schema stays unchanged');
  await context.close();console.log('PASS mobile mode '+profile.name);
 }
 for(const width of [820,1440]){const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();await p.route('**/*',r=>r.abort());await p.setContent(fs.readFileSync('release/mobile-motion-20261026/candidate/hasl.html','utf8'));assert.equal(await p.locator('.hasl-home-embed').evaluate(n=>!!n.__haslMotion),false);assert.equal(await p.locator('[data-motion-tier]').count(),0);await p.locator('.faq-q').first().click();assert.equal(await p.locator('.faq-q').first().getAttribute('aria-expanded'),'true');await c.close();}
 for(const reduced of [false,true]){const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'}),p=await c.newPage();await p.route('**/*',r=>r.abort());let requests=0;await p.route(/\/public-site-motion\.js(?:\?.*)?$/,r=>{requests++;return r.abort();});await p.evaluate(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});});await p.setContent(fs.readFileSync('release/mobile-motion-20261026/candidate/hasl.html','utf8'));await p.locator('.faq-q').first().click();await p.waitForTimeout(80);assert.equal(requests,reduced?0:1);await p.locator('.faq-q').first().click();assert.equal(await p.locator('.faq-q').first().getAttribute('aria-expanded'),'false');assert.equal(requests,reduced?0:1,'failed optional request does not repeat');await c.close();}
 console.log('PASS mobile-only scope, transform/opacity, reduced motion, keyboard, live degradation, 120 Hz synthetic sampling, unchanged tablet/desktop');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
