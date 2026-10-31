const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async(context,base)=>{
 assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);const p=await context.newPage(),out=await context.newPage(),errors=[];
 for(const page of [p,out]){page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 const seed=require('../site-builder/catalog-seed.json').products;await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6,finderBrands:require('../site-builder/finder-brands-seed.json').brands}}));
 await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const data=await p.evaluate(()=>{
  const original=JSON.stringify(state),s=structuredClone(state),d=new DOMParser().parseFromString(R.build(state,products,content,{clean:true}),'text/html');
  const ids=[...d.querySelectorAll('main > section')].filter(n=>n.querySelector('.product-tabs,.finder-form,.faq-q')).map(n=>n.dataset.siteBlock);
  s.layout=SiteBuilder.layout().filter(b=>ids.includes(b.id)).map(b=>({...structuredClone(b),objects:{},faqSettings:{initial:'closed',mode:'single',heading:'left'}}));
  const goods=Object.values(products),nike=goods.find(p=>p.brand==='Nike'),adidas=goods.find(p=>p.brand==='Adidas');if(!nike||!adidas)throw Error('Missing fixture brands');
  const catalog=s.layout.find(b=>b.source==='s1');catalog.products={codes:nike.code+','+adidas.code,resolved:[nike.code,adidas.code],photos:{}};
  s.title='ХАСЛ — проверка брендов и FAQ';s.pageSettings={path:'schema-brands.html'};s.exportSite='hasl';s.exportFormat='document';s.autoRefresh=false;
  for(const b of Object.values(s.blocks))Object.assign(b,{codes:'',appliedCodes:'',resolved:[],missing:[],loaded:true});
  const htmls=[];for(const site of ['hasl','hasle'])for(const fragment of [false,true])htmls.push({site,fragment,html:R.build(s,products,content,{clean:true,site,fragment})});
  return {fixture:s,htmls,unchanged:original===JSON.stringify(state)};
 });assert.equal(data.unchanged,true);
 const graph=async page=>page.locator('script[data-site-schema="auto"]').evaluateAll(nodes=>{if(nodes.length!==1)throw Error('Expected one JSON-LD graph');return JSON.parse(nodes[0].textContent);});
 for(const {html,site,fragment} of data.htmls){await out.setViewportSize({width:390,height:1000});await out.setContent(html);
  const before=await graph(out),items=before['@graph'].filter(n=>n['@type']==='ItemList').flatMap(n=>n.itemListElement.map(i=>i.item)),goods=items.filter(n=>n['@type']==='Product');
  assert.deepEqual(goods.map(g=>g.brand.name).sort(),['Adidas','Nike']);assert.ok(goods.every(g=>new URL(g.url).hostname===(site==='hasle'?'haslestore.com':'xn--80awro.xn--p1ai')));
  const faq=before['@graph'].find(n=>n['@type']==='FAQPage');assert.equal(faq.mainEntity.length,3);
  await out.locator('.product-tabs [data-tab="Nike"]').click();assert.equal(await out.locator('.product-track .product:not([hidden])').count(),1);
  await out.locator('.brand-picker summary').click();await out.locator('.brand-picker').getByRole('checkbox',{name:'Nike',exact:true}).check();await out.locator('.brand-picker').getByRole('checkbox',{name:'Adidas',exact:true}).check();
  await out.locator('.faq-q').first().click();await out.waitForTimeout(250);await out.locator('.faq-q').nth(1).click();await out.waitForTimeout(250);
  assert.deepEqual(await graph(out),before,'filters and animated FAQ must not rewrite JSON-LD '+site+' '+fragment);
 }
 // Exercise the real download and ZIP builder, with demo project GETs and save disabled.
 await p.route('**/editor-api/site-builder/projects/schema-brands-demo',r=>r.fulfill({json:{id:'schema-brands-demo',revision:1,state:data.fixture}}));
 await p.evaluate(s=>{clearTimeout(saveTimer);state=s;SiteBuilder.save=async()=>{};tab='export';render();updatePreviews();},data.fixture);
 const download=p.waitForEvent('download');await p.locator('#download-html').click();const chunks=[];for await(const chunk of await(await download).createReadStream())chunks.push(chunk);const downloaded=Buffer.concat(chunks).toString('utf8');
 const bytes=await p.evaluate(async()=>Array.from(new Uint8Array(await(await SiteDesigner.buildSiteBundle(['schema-brands-demo'])).arrayBuffer())));
 const zip=await require('../vendor/jszip.min.js').loadAsync(Buffer.from(bytes)),zipped=await zip.file('schema-brands.html').async('string');
 await out.setContent(downloaded);const downloadGraph=await graph(out);await out.setContent(zipped);assert.deepEqual(await graph(out),downloadGraph,'actual HTML/ZIP parity');
 const folder=path.resolve(process.env.SCHEMA_BRANDS_ARTIFACT_DIR||'release/schema-brands-audit-20261027');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'export.html'),downloaded);fs.writeFileSync(path.join(folder,'site.zip'),Buffer.from(bytes));fs.writeFileSync(path.join(folder,'zip-page.html'),zipped);fs.writeFileSync(path.join(folder,'schema.json'),JSON.stringify(downloadGraph,null,2));
 assert.deepEqual(errors,[]);await p.close();await out.close();console.log('PASS schema after brands/FAQ: both shops HTML/CMS, Product brands and domains, complete FAQ, stable JSON-LD after filters/animations, actual HTML download and ZIP graph parity');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
