// Production read-only smoke: local state only; project GET fixtures and save mocked.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password},viewport:{width:1920,height:1080}});await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}});
  const get=async path=>{const r=await context.request.get(base+path);assert.equal(r.status(),200,path);return r.text();};
  const before=await get('/editor-api/site-builder/reference'),pages=await get('/editor-api/site-builder/projects');
  for(const name of ['app.js','builder.js','object-studio.js','objects.js','renderer.js','style.css'])assert.equal((await get('/site-builder/assets/'+name)).replace(/\r\n/g,'\n'),fs.readFileSync('site-builder/'+name,'utf8').replace(/\r\n/g,'\n'),name);
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith(base)&&!['GET','HEAD','OPTIONS'].includes(r.method())&&new URL(r.url()).pathname!=='/editor-api/presence')writes.push(new URL(r.url()).pathname);});
  await page.route('**/*',r=>new URL(r.request().url()).origin!==base||!['GET','HEAD','OPTIONS'].includes(r.request().method())?r.abort():r.continue());
  await page.goto(base+'/site-builder/hasl/',{waitUntil:'domcontentloaded'});await page.locator('#site-block-select').waitFor();
  assert.equal(await page.locator('.site-toolbox [data-object-add]').count(),22);
  await page.evaluate(()=>{clearTimeout(saveTimer);SiteBuilder.save=async()=>{};SiteBuilder.markChanged=()=>SiteDesigner.record();state.layout.unshift({id:'toolbar-live',source:'custom',name:'Demo tools',mode:'grid',elements:[]});SiteBuilder.select('toolbar-live');changed();render();updatePreviews();});await page.locator('[data-tab=objects]').click();
  for(const type of ['rectangle','table','faq','audio']){await page.locator('#object-node').selectOption('root');await page.locator('.site-toolbox [data-object-add='+type+']').click();}
  await page.waitForFunction(()=>document.getElementById('desktop').contentDocument?.querySelector('[data-tool-kind=rectangle]'));
  const key=await page.frameLocator('#desktop').locator('[data-tool-kind=rectangle]').getAttribute('data-site-object');await page.locator('#object-node').selectOption(key);await page.locator('.site-toolbox [data-object-quick=rotate-right]').click();assert.equal(await page.evaluate(k=>SiteBuilder.current().objects[k].desktop.rotation,key),90);await page.locator('#site-undo').click();assert.equal(await page.evaluate(k=>SiteBuilder.current().objects?.[k]?.desktop?.rotation||0,key),0);await page.locator('#site-redo').click();
  const fixture=await page.evaluate(()=>{const c=structuredClone(state);c.pageSettings={path:'toolbar-live.html'};return c;});await page.route(base+'/editor-api/site-builder/projects/toolbar-live-qa',r=>r.fulfill({json:{id:'toolbar-live-qa',revision:1,state:fixture}}));
  const html=await page.evaluate(async()=>{const blob=await SiteDesigner.buildSiteBundle(['toolbar-live-qa']),zip=await JSZip.loadAsync(blob);return zip.file('toolbar-live.html').async('string');});assert.ok(html.includes('data-tool-kind="audio"'));assert.ok(html.includes('site-object-faq-answer'));assert.ok(html.includes('Ваш вопрос'));assert.ok(html.includes('rotate:90deg'));assert.ok(!html.includes('site-toolbox'));
  for(const width of [3440,1920,390]){await page.setViewportSize({width,height:1080});await page.locator('[data-preview-mode=both]').click();await page.waitForTimeout(100);const v=await page.evaluate(()=>{const p=document.getElementById('phone'),a=p.getBoundingClientRect(),b=document.getElementById('desktop').getBoundingClientRect();return {w:p.clientWidth,h:p.clientHeight,pw:a.width,ph:a.height,dw:b.width,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(v.w,390);assert.equal(v.h,844);assert.ok(v.pw<=390.1);assert.ok(Math.abs(v.pw/v.ph-390/844)<.001);assert.equal(v.overflow,false);if(width>=1920)assert.ok(v.dw>v.pw*2);}
  await page.goto(base+'/instructions/#site-toolbar');await page.getByRole('heading',{name:'ХАСЛ: верхняя панель инструментов и узкий телефон',exact:true}).waitFor();await page.locator('#wiki-view img').first().evaluate(n=>n.decode());
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(await get('/editor-api/site-builder/reference'),before);assert.equal(await get('/editor-api/site-builder/projects'),pages);
  console.log('LIVE_PASS published assets, 22 tools, native objects/undo/redo, actual ZIP with FAQ/audio/schema/rotation, proportional phone/wide desktop/mobile/guide; no writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
