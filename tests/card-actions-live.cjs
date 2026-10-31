// Read-only production verification. No account/material mutation is allowed.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password}});
 assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());
 await context.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.fulfill({status:503,json:{error:'QA: writes blocked'}}));
 await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
 await context.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});
  await page.goto(base+'/');await page.locator('#home-avatar').waitFor();await page.waitForFunction(()=>document.getElementById('profile')?.textContent.startsWith('Привет, '));const me=await (await context.request.get(base+'/editor-api/me')).json();if(me.avatarUrl){await page.waitForFunction(url=>document.querySelector('#home-avatar img')?.getAttribute('src')===url,me.avatarUrl);assert.ok(await page.locator('#home-avatar img').evaluate(n=>n.decode().then(()=>n.naturalWidth>0)));}else await page.waitForFunction(initial=>document.getElementById('home-avatar')?.textContent===initial,Array.from(me.name||'?')[0]);assert.equal(await page.locator('#home-avatar').getAttribute('href'),'/profile/');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const selector of ['.tool','.work']){const card=page.locator(selector).first();await card.waitFor();await card.hover();await page.waitForTimeout(220);assert.equal(await card.evaluate(n=>getComputedStyle(n).borderTopColor),'rgb(224, 225, 230)');assert.notEqual(await card.evaluate(n=>getComputedStyle(n).boxShadow),'none');}
  await page.goto(base+'/articles/?view=users');await page.locator('.user-avatar').first().waitFor();
  for(const avatar of await page.locator('.user-avatar').all()){assert.equal(await avatar.evaluate(n=>n.getBoundingClientRect().width),width===390?48:56);const img=avatar.locator('img');if(await img.count())assert.ok(await img.evaluate(n=>n.decode().then(()=>n.naturalWidth>0).catch(()=>false)));}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const path of ['/articles/?view=articles','/site-builder/hasl/']){await page.goto(base+path);
   if(path.includes('site-builder')){await page.locator('#workspace-start[open] .start-continue').click();await page.locator('.studio-project-menu>summary').click();await page.locator('.studio-project-actions .studio-my-templates').click();}
   const actions=page.locator(path.includes('site-builder')?'.site-template-actions':'.archive-actions').first();await actions.waitFor();await page.mouse.move(0,0);
   const buttons=actions.locator('button');assert.equal(await buttons.count(),3);
   for(const button of await buttons.all()){const style=await button.evaluate(n=>{const s=getComputedStyle(n);return {border:s.borderTopWidth,shadow:s.boxShadow,background:s.backgroundColor,width:n.getBoundingClientRect().width}});assert.equal(style.border,'0px');assert.equal(style.shadow,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.width,width===390?44:28);assert.equal(await button.locator('svg').evaluate(n=>n.getBoundingClientRect().width),16);await page.keyboard.press('Tab');await button.focus();assert.ok(await button.evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));await button.evaluate(n=>n.blur());}
  }
 }
 assert.deepEqual(errors,[]);console.log('LIVE_CARD_ACTIONS_PASS: avatars 56/48px loaded; both archives borderless/centered 16px icons, 28/44px targets and keyboard focus; desktop/phone; no page errors; writes blocked');
}finally{await browser.close();}})().catch(e=>{console.error(String(e.message).split('Call log:')[0]);process.exit(1)});
