const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage();await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const seed=require('../site-builder/catalog-seed.json').products;await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6}}));
 const shops={};for(const site of ['hasl','hasle'])shops[site]={reviews:{updated:'2026-10-26T09:00:00Z',items:[{id:site==='hasl'?'1':'hasle:1',name:site==='hasl'?'Покупатель ХАСЛ':'Покупатель HASLESTORE',city:'Демо',rating:4,date:'2026-10-25',text:'Демонстрационный отзыв '+site,photos:[]}]},news:{updated:'2026-10-26T09:00:00Z',items:[{id:site==='hasl'?'2':'hasle:2',title:'Новость '+site,text:'Демонстрационная новость',url:'https://'+(site==='hasl'?'xn--80awro.xn--p1ai':'haslestore.com')+'/news/demo'}]}};
 let fail=false;const requested=[];await p.route('**/editor-api/site-builder/content*',r=>{const site=new URL(r.request().url()).searchParams.get('site')||'hasl';requested.push(site);if(fail&&site==='hasle')return r.fulfill({status:503,json:{error:'Источник HASLESTORE недоступен'}});return r.fulfill({json:{...shops[site],shops,site}});});
 await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 await p.evaluate(()=>{SiteBuilder.layout();state.exportSite='both';state.reviews.mode='auto';state.reviews.manual=[];state.reviews.hidden=[];state.reviews.overrides={};state.news.mode='auto';state.news.hidden=[];state.news.overrides={};});
 const snapshot=await p.evaluate(()=>JSON.stringify(state)),html=await p.evaluate(()=>preparedExport());assert.ok(requested.includes('hasle'));assert.equal(await p.evaluate(()=>JSON.stringify(state)),snapshot);
 for(const site of ['hasl','hasle'])for(const fragment of [false,true]){
  const markup=fragment?await p.evaluate(()=>{state.exportFormat='fragment';return preparedExport();}):html;
  const out=await context.newPage({viewport:{width:390,height:900}}),domain=site==='hasle'?'haslestore.com':'xn--80awro.xn--p1ai',url='https://'+domain+'/__codex_export_test';
  await out.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html; charset=utf-8',body:markup}):r.abort());await out.goto(url);await out.evaluate(()=>document.fonts.ready);
  const expected=site==='hasle'?'Покупатель HASLESTORE':'Покупатель ХАСЛ',wrong=site==='hasle'?'Покупатель ХАСЛ':'Покупатель HASLESTORE';
  const reviews=out.locator('.reviews-track');assert.match(await reviews.first().textContent(),new RegExp(expected));assert.ok(!(await reviews.first().textContent()).includes(wrong));assert.equal(await out.locator('.article-link h3').first().textContent(),'Новость '+site);assert.equal(await out.locator('.hasl-home-embed').getAttribute('data-content-shop'),site);
  await out.locator('.review-read').first().click();assert.match(await out.locator('.review-dialog-title').textContent(),new RegExp(expected));await out.locator('.review-dialog [data-close]').click();assert.equal(await out.locator('.reviews-all-card').first().getAttribute('href'),'https://'+domain+'/testimonials');
  if(capture&&!fragment)await out.locator('section').filter({has:out.locator('.reviews-track')}).first().screenshot({path:'instructions/screens/site-export-reviews-'+site+'.png'});
  await out.close();
 }
 if(/^http:\/\/127\.0\.0\.1:/.test(base)){
  const zipped=await p.evaluate(async()=>{await SiteBuilder.save();const id=SiteBuilder.versionContext().id,b=await SiteDesigner.buildSiteBundle([id]),z=await JSZip.loadAsync(b.blob||b);return Object.values(z.files).find(f=>f.name.endsWith('.html')).async('string');});
  const zipPage=await context.newPage(),zipUrl='https://haslestore.com/__codex_zip_test';await zipPage.route('**/*',r=>r.request().url()===zipUrl?r.fulfill({contentType:'text/html; charset=utf-8',body:zipped}):r.abort());await zipPage.goto(zipUrl);assert.match(await zipPage.locator('.reviews-track').first().textContent(),/Покупатель HASLESTORE/);assert.ok(!(await zipPage.locator('.reviews-track').first().textContent()).includes('Покупатель ХАСЛ'));await zipPage.close();
 }
 const explicit=await p.evaluate(()=>R.build(state,products,{...content,shops:undefined,site:'hasl'},{site:'hasle',clean:true}));assert.ok(!explicit.includes('Покупатель ХАСЛ'),'wrong-shop fallback is empty');
 fail=true;await assert.rejects(()=>p.evaluate(()=>preparedExport()),/HASLESTORE/);
 await p.close();console.log('PASS both-domain full HTML/CMS: isolated review/news snapshots, popups and links; explicit mismatched source never falls back; failed source stops export');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8914';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
