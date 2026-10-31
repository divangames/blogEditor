const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);const page=await context.newPage(),out=await context.newPage(),errors=[];
 for(const p of [page,out]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 const seed=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6}}));
 await page.goto(base+'/site-builder/hasl/');await page.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const snapshot=await page.evaluate(()=>JSON.stringify(state));
 const results=await page.evaluate(()=>{
  const s=structuredClone(state),sample=Object.values(products)[0],catalog={};
  for(const [code,brand] of [['nike-one','Nike'],['nike-two','Nike'],['adidas','Adidas'],['puma','Puma'],['unknown',''],['ecco',' Ecco ']])catalog[code]={...sample,code,brand,name:'Демонстрационная пара '+brand,params:code==='nike-one'?{Сезон:'Зима'}:{},photos:[]};
  const original=SiteBuilder.layout().find(b=>b.source==='s1');
  const block=(id,codes,seasons=[])=>({...structuredClone(original),id,objects:{},seasons,products:{codes:codes.join(','),resolved:codes,photos:{}}});
  s.layout=[block('brands-first',['nike-one','nike-two','adidas','unknown'],['winter']),block('brands-second',['puma'])];
  const build=options=>R.build(s,catalog,content,{clean:true,...options});
  const variants=[];for(const site of ['hasl','hasle'])for(const fragment of [false,true])variants.push(build({site,fragment}));
  s.layout[0].products.resolved=['nike-two','adidas'];const oneNike=build();s.layout[0].products.resolved=['adidas'];const removedNike=build();
  s.layout[0].products.resolved=['adidas','ecco'];const addedEcco=build();
  const d=new DOMParser().parseFromString(addedEcco,'text/html'),card=d.querySelector('[data-site-block="brands-first"] [data-feed-id="adidas"]');
  s.layout[0].objects={[card.dataset.siteObject]:{deleted:true}};const deleted=build();s.layout[0].objects={};
  s.layout[0].products.resolved=[];const empty=build();s.layout[0].products.resolved=['unknown'];s.layout[0].seasons=[];const unknown=build();
  return {variants,oneNike,removedNike,addedEcco,deleted,empty,unknown};
 });assert.equal(await page.evaluate(()=>JSON.stringify(state)),snapshot);
 const names=section=>section.locator('.product-tabs .chip').allTextContents();
 for(const html of results.variants)for(const width of [390,1440]){
  await out.setViewportSize({width,height:900});await out.setContent(html,{waitUntil:'domcontentloaded'});
  const first=out.locator('[data-site-block="brands-first"]'),second=out.locator('[data-site-block="brands-second"]');
  assert.deepEqual(await names(first),['Все пары','Nike','Adidas','Зима']);assert.deepEqual(await names(second),['Все пары','Puma']);
  await first.locator('[data-tab="Adidas"]').click();assert.equal(await first.locator('.product:not([hidden])').count(),1);assert.equal(await second.locator('.product:not([hidden])').count(),1);assert.equal(await first.locator('[id*="productStatus"]').textContent(),'Показано моделей: 1');
  await first.locator('[data-tab="winter"]').click();assert.equal(await first.locator('.product:not([hidden])').getAttribute('data-feed-id'),'nike-one');
  await first.locator('[data-tab="Nike"]').click();assert.equal(await first.locator('.product:not([hidden])').count(),2);
  assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(capture&&html===results.variants[0])await first.locator('.product-tabs').screenshot({path:'instructions/screens/site-product-brand-tabs-'+(width===390?'phone':'desktop')+'.png'});
  await first.locator('[data-tab="all"]').click();assert.equal(await first.locator('.product:not([hidden])').count(),4);
 }
 for(const [key,expected] of [['oneNike',['Все пары','Nike','Adidas','Зима']],['removedNike',['Все пары','Adidas','Зима']],['addedEcco',['Все пары','Adidas','Ecco','Зима']],['deleted',['Все пары','Ecco','Зима']],['empty',['Все пары','Зима']],['unknown',['Все пары']]]){
  await out.setContent(results[key]);assert.deepEqual(await names(out.locator('[data-site-block="brands-first"]')),expected,key);
  if(key==='addedEcco'){await out.locator('[data-tab="Ecco"]').click();assert.equal(await out.locator('[data-site-block="brands-first"] .product:not([hidden])').getAttribute('data-feed-id'),'ecco');}
 }
 await page.goto(base+'/instructions/#site-product-brand-tabs');await page.getByRole('heading',{name:'Товары: автоматические вкладки брендов',exact:true}).waitFor();await page.locator('#wiki-search').fill('вкладки брендов');assert.ok(await page.locator('.wiki-result').count());
 assert.deepEqual(errors,[]);await page.close();await out.close();console.log('PASS automatic brand tabs: per-block product overrides, duplicates/add/remove/empty/unknown, object deletion, trimmed names, preserved seasons, independent filters, both shops HTML/CMS desktop/phone, guide');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
