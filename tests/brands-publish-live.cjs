// Authenticated live smoke check. After login, all browser writes are blocked.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 const before=process.argv.includes('--before'),base='https://news.outmax-office.ru',meta=JSON.parse(fs.readFileSync('release/brands-publish-state.json','utf8'));
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},httpCredentials:{username:credentials.user,password:credentials.password}});
  assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());
  const projectResponse=await context.request.get(base+'/editor-api/site-builder/projects');assert.ok(projectResponse.ok());
  const initialProjects=hash(await projectResponse.text());
  if(before){fs.writeFileSync('release/brands-publish-live-before.json',JSON.stringify({projectsHash:initialProjects,observedAt:new Date().toISOString()}));console.log('PASS pre-deploy authenticated availability; project listing fingerprint retained locally');return;}
  for(const name of ['app.js','builder.js','renderer.js','runtime.js','object-studio.js','layout.js','style.css','template.html']){const response=await context.request.get(base+'/site-builder/assets/'+name);assert.equal(response.status(),200);assert.equal(await response.text(),fs.readFileSync(path.join(meta.full,'site-builder',name),'utf8').replace(/\r\n/g,'\n'),name);}
  const anonymous=await browser.newContext(),motion=await anonymous.request.get(base+'/editor-api/public-site-motion.js?v=20261026-1');assert.equal(motion.status(),200);assert.equal(await motion.text(),fs.readFileSync(path.join(meta.full,'site-builder/mobile-motion.js'),'utf8').replace(/\r\n/g,'\n'));assert.equal(motion.headers()['access-control-allow-origin'],'*');assert.match(motion.headers()['cache-control'],/max-age=3600/);await anonymous.close();
  const p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){writes.push(r.request().method());return r.abort();}return new URL(r.request().url()).origin===base?r.continue():r.abort();});
  await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(require('../site-builder/catalog-seed.json').products),missing:[],total:6}}));
  await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&window.StudioShell&&!document.body.classList.contains('site-starting')&&document.getElementById('desktop').__haslDocState===state);await p.locator('#site-boot-status').waitFor({state:'detached'});
  assert.ok(await p.locator('#phone-device optgroup').count()>=10);assert.ok(await p.locator('#phone-device option[value=iphone-18-pro]').count());
  await p.evaluate(()=>{const b=SiteBuilder.layout().find(b=>b.source==='s8');SiteBuilder.select(b.id);tab='layout';render();});
  assert.equal(await p.locator('[data-faq-setting]').count(),3);
  const htmls=await p.evaluate(()=>{const b=SiteBuilder.current();b.faqSettings={initial:'first',mode:'single',heading:'right'};return [false,true].map(fragment=>R.build(state,products,content,{clean:true,fragment,site:'hasl'}));});
  const out=await context.newPage();out.on('pageerror',e=>errors.push(e.message));await out.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  for(const [i,html] of htmls.entries())for(const width of [1440,390]){await out.setViewportSize({width,height:950});await out.setContent(html);assert.equal(await out.locator('.faq-q[aria-expanded=true]').count(),1);await out.locator('.faq-q').nth(1).click();await out.waitForTimeout(300);assert.equal(await out.locator('.faq-q[aria-expanded=true]').count(),1);assert.equal(await out.locator('.faq-q').nth(1).getAttribute('aria-expanded'),'true');const geometry=await out.locator('.faq-section').evaluate(s=>{const h=s.querySelector('.section-head').getBoundingClientRect(),q=s.querySelector('.faq').getBoundingClientRect();return {bottom:h.bottom,top:q.top,left:h.left,right:q.right};});if(width===390)assert.ok(geometry.bottom<=geometry.top);else assert.ok(geometry.left>geometry.right);}
  for(const html of htmls){await out.setViewportSize({width:390,height:1000});await out.setContent(html);const schema=await out.locator('script[data-site-schema]').textContent();
   const picker=out.locator('.brand-picker');await picker.locator('summary').click();await picker.getByRole('checkbox',{name:'Nike',exact:true}).check();await picker.getByRole('checkbox',{name:'Adidas',exact:true}).check();assert.equal(new URL(await out.locator('[id*="finderBtn"]').getAttribute('href')).searchParams.get('manufacturers'),'1-2');
   await picker.locator('.brand-any').click();assert.equal(new URL(await out.locator('[id*="finderBtn"]').getAttribute('href')).searchParams.has('manufacturers'),false);
   const q=out.locator('.faq-q').last();const heights=await q.evaluate(async q=>{q.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const h=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);h.push(q.nextElementSibling.getBoundingClientRect().height);}return h;});assert.ok(heights.some((h,i)=>i&&h>heights[i-1]+.2),'published mobile FAQ has intermediate heights');await out.waitForTimeout(260);
   for(const section of await out.locator('main > section').all()){if(!await section.locator('.product-tabs').count())continue;const expected=await section.locator('.product-track .product').evaluateAll(cards=>[...new Set(cards.map(c=>c.dataset.brand).filter(Boolean))]);const actual=await section.locator('.product-tabs [data-tab]').evaluateAll(tabs=>tabs.map(t=>t.dataset.tab).filter(t=>!['all','winter','demi','summer'].includes(t)));assert.deepEqual(actual,expected);}
   assert.equal(await out.locator('script[data-site-schema]').textContent(),schema,'published interactions preserve JSON-LD');
  }
  await out.close();
  for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await p.goto(base+'/instructions/#site-mobile-motion');await p.getByRole('heading',{name:'Сайт: быстрые мобильные анимации и режимы производительности',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.goto(base+'/instructions/#changelog/2026-10-26');const change=p.locator('.wiki-change').filter({has:p.getByRole('heading',{name:'Загрузка конструктора и сохранение настроек экрана',exact:true})});await change.waitFor();assert.match(await change.innerText(),/Добавлено:/);assert.match(await change.innerText(),/Изменено:/);assert.match(await change.innerText(),/Исправлено:/);await p.goto(base+'/instructions/#changelog/2026-10-27');await p.getByRole('heading',{name:'Автоматические вкладки брендов, подбор и плавный FAQ',exact:true}).waitFor();}
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);const finalProjects=hash(await(await context.request.get(base+'/editor-api/site-builder/projects')).text());
  const previous=JSON.parse(fs.readFileSync('release/brands-publish-live-before.json','utf8'));
  fs.writeFileSync('release/brands-publish-live-result.json',JSON.stringify({ok:true,writes:0,exactAssets:true,projectsBefore:previous.projectsHash,projectsAtStart:initialProjects,projectsAfter:finalProjects,observedAt:new Date().toISOString()}));
  if(previous.projectsHash!==finalProjects)console.log('Project listing changed during deployment/check; this browser issued zero writes');
  console.log('LIVE_PASS exact frozen assets, automatic brand tabs, multiple finder brands, smooth mobile FAQ, static JSON-LD, HTML/CMS, public module, instructions/changelog, zero browser writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
