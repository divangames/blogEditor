const {click:studioClick}=require('./studio-test-helpers.cjs');
// Production smoke: project writes blocked; ZIP page GETs mocked and save disabled.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password},viewport:{width:1440,height:1000}});
  await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}});
  const before=await(await context.request.get(base+'/editor-api/site-builder/reference')).text(),pages=await(await context.request.get(base+'/editor-api/site-builder/projects')).text();
  const library=await context.request.get(base+'/vendor/jszip.min.js');assert.equal(library.status(),200);assert.ok((await library.text()).includes('JSZip'));
  const page=await context.newPage(),errors=[],writes=[];page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith(base)&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(new URL(r.url()).pathname);});
  await page.route('**/*',r=>new URL(r.request().url()).origin!==base||!['GET','HEAD','OPTIONS'].includes(r.request().method())?r.abort():r.continue());
  await page.goto(base+'/site-builder/hasl/',{waitUntil:'domcontentloaded'});await page.locator('#site-block-select').waitFor();await studioClick(page,'[data-tab="pageSettings"]');await page.locator('#site-schema-note').waitFor();
  const fixture=await page.evaluate(()=>{
   const original=JSON.stringify(state),html=exported(),doc=new DOMParser().parseFromString(html,'text/html'),scripts=doc.querySelectorAll('script[type="application/ld+json"][data-site-schema]');
   if(scripts.length!==1)throw Error('Static schema missing');const graph=JSON.parse(scripts[0].textContent)['@graph'];if(!graph.some(x=>x['@type']==='CollectionPage'))throw Error('Expected collection content');if(original!==JSON.stringify(state))throw Error('Export changed state');
   const a=structuredClone(state);a.title='Schema live QA one';a.pageSettings={path:'qa-one.html',canonical:'https://example.test/qa-one.html'};a.haslSectionVersion=1;a.layout=[{id:'qa-main',source:'custom',name:'Demo',mode:'grid',elements:[{id:'title',type:'heading',tag:'h1',text:'QA one'}]}];for(const b of Object.values(a.blocks))Object.assign(b,{codes:'',appliedCodes:'',resolved:[],missing:[],loaded:true});
   const b=structuredClone(a);b.title='Schema live QA two';b.pageSettings={path:'folder/qa-two.html',canonical:'https://example.test/folder/qa-two.html'};b.layout[0].elements[0].text='QA two';return [a,b];
  });
  const fixed=await page.evaluate(()=>{
   const c=structuredClone(state);c.haslSectionVersion=1;c.layout=[{id:'schema-live-edge',source:'s1',visibility:'all',products:{codes:'edge',resolved:['edge'],photos:{}}}];
   const product={code:'edge',name:'Schema QA',url:'https://example.test/product',price:1234.5,available:true,brand:'Demo',photos:['https://example.test/photo.jpg'],videos:[],params:{}};
   const run=patch=>{const d=new DOMParser().parseFromString(R.build(c,{edge:{...product,...patch}},{reviews:{items:[]},news:{items:[]}},{clean:true}),'text/html');return {item:JSON.parse(d.querySelector('script[data-site-schema]').textContent)['@graph'].find(x=>x['@type']==='ItemList').itemListElement[0].item,text:d.querySelector('.product').textContent};};
   return {valid:run({}),unknown:run({available:undefined}),zero:run({price:0}),noPhoto:run({photos:[]}),noUrl:run({url:''})};
  });
  assert.equal(fixed.valid.item.offers.availability,'https://schema.org/InStock');assert.equal(fixed.valid.item.brand.name,'Demo');assert.ok(fixed.valid.text.includes('В наличии'));assert.equal(fixed.unknown.item.offers.availability,undefined);assert.ok(!fixed.unknown.text.includes('Нет в наличии'));for(const name of ['zero','noPhoto','noUrl']){assert.equal(fixed[name].item['@type'],'Thing');assert.equal(fixed[name].item.offers,undefined);}assert.ok(fixed.zero.text.includes('Цена уточняется'));
  for(let i=0;i<2;i++)await page.route(base+'/editor-api/site-builder/projects/schema-live-qa-'+i,r=>r.fulfill({json:{id:'schema-live-qa-'+i,revision:1,state:fixture[i]}}));
  const names=await page.evaluate(async()=>{
   const save=SiteBuilder.save;SiteBuilder.save=async()=>{};
   try{const blob=await SiteDesigner.buildSiteBundle(['schema-live-qa-0','schema-live-qa-1']),zip=await JSZip.loadAsync(blob),result=[];
    for(const path of ['qa-one.html','folder/qa-two.html']){const html=await zip.file(path).async('string'),doc=new DOMParser().parseFromString(html,'text/html'),scripts=doc.querySelectorAll('script[data-site-schema]');if(scripts.length!==1)throw Error('ZIP schema missing');result.push(JSON.parse(scripts[0].textContent)['@graph'][0]);}return result;
   }finally{SiteBuilder.save=save;}
  });
  assert.equal(names[0].url,'https://example.test/qa-one.html');assert.equal(names[1].url,'https://example.test/folder/qa-two.html');assert.equal(names[0].headline,'QA one');assert.equal(names[1].headline,'QA two');
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.goto(base+'/instructions/#site-schema',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'ХАСЛ: автоматическая разметка Schema.org',exact:true}).waitFor();
  await page.goto(base+'/OUTMAX.html',{waitUntil:'domcontentloaded'});await page.locator('#canvas[contenteditable]').waitFor({state:'attached'});await page.locator('#editor-toolbar').waitFor({state:'attached'});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(await(await context.request.get(base+'/editor-api/site-builder/reference')).text(),before);assert.equal(await(await context.request.get(base+'/editor-api/site-builder/projects')).text(),pages);
  console.log('LIVE_PASS corrected incomplete-card fallback, honest stock/brand/price; static schema in HTML and actual site ZIP builder, embedded ZIP library, separate canonical/headline, mobile/guide/email; no production project writes or reference changes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
