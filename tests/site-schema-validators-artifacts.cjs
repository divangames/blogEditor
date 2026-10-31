// Actual HTML download + two-page site ZIP, on an isolated demo server.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {click:studioClick}=require('./studio-test-helpers.cjs');
(async()=>{
 const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',folder=path.resolve(process.env.SCHEMA_ARTIFACT_DIR||'release/schema-validators-20261025');assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);fs.mkdirSync(folder,{recursive:true});
 const product=JSON.parse(fs.readFileSync('release/hasl-review-import-audit-20261025/real-product.json','utf8')),feedback=JSON.parse(fs.readFileSync('release/hasl-review-import-audit-20261025/real-import.json','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.route('**/editor-api/site-builder/products?*',r=>{const codes=(new URL(r.request().url()).searchParams.get('codes')||'').split(',');return r.fulfill({json:{products:codes.includes(product.code)?[product]:[],missing:[],total:codes.includes(product.code)?1:0}});});
  await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();await page.waitForFunction(()=>!!window.StudioShell&&!document.body.classList.contains('site-starting'));
  const fixture=await page.evaluate(({product,feedback})=>{
   const c=structuredClone(state);c.autoRefresh=false;c.title='ХАСЛ — проверка экспорта';c.pageSettings={path:'schema-check.html',canonical:'https://xn--80awro.xn--p1ai/schema-check.html'};
   const block=c.layout.find(s=>s.source==='s1')||c.layout[0];
   for(const s of c.layout)if(s.products)s.products={codes:'',resolved:[],photos:{}};
   block.products={codes:product.code,resolved:[product.code],photos:{}};
   c.commerce={descriptions:{[product.code]:product.description||''},feedback:{[product.code]:{aggregate:feedback.aggregate,reviews:feedback.reviews,source:feedback.source}}};
   for(const b of Object.values(c.blocks))Object.assign(b,{codes:'',appliedCodes:'',resolved:[],missing:[],loaded:true});
   return c;
  },{product,feedback});
  const ids=[];for(let i=0;i<2;i++){const c=structuredClone(fixture);if(i){c.title='ХАСЛ — вторая страница ZIP';c.pageSettings={path:'pages/schema-second.html',canonical:'https://xn--80awro.xn--p1ai/pages/schema-second.html'};}const r=await context.request.post(base+'/editor-api/site-builder/projects',{data:c});assert.equal(r.status(),201,await r.text());ids.push((await r.json()).id);}
  await page.goto(base+'/site-builder/hasl/?page='+ids[0]);await page.locator('#site-block-select').waitFor();await studioClick(page,'[data-tab=export]');
  fs.writeFileSync(path.join(folder,'browser-before.json'),JSON.stringify(await page.evaluate(()=>state),null,2));
  const download=page.waitForEvent('download');await page.locator('#download-html').click();await(await download).saveAs(path.join(folder,'export.html'));
  fs.writeFileSync(path.join(folder,'server-before.json'),JSON.stringify(await(await context.request.get(base+'/editor-api/site-builder/projects/'+ids[0])).json(),null,2));
  const bytes=await page.evaluate(async ids=>Array.from(new Uint8Array(await(await SiteDesigner.buildSiteBundle(ids)).arrayBuffer())),ids);fs.writeFileSync(path.join(folder,'site.zip'),Buffer.from(bytes));
  const zip=await require('../vendor/jszip.min.js').loadAsync(Buffer.from(bytes)),names=[];
  for(const entry of Object.values(zip.files)){if(entry.dir||!entry.name.endsWith('.html'))continue;const target=path.join(folder,'zip',entry.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,await entry.async('string'));names.push(entry.name);}
  const html=fs.readFileSync(path.join(folder,'export.html'),'utf8'),zipped=fs.readFileSync(path.join(folder,'zip/schema-check.html'),'utf8');
  const graph=h=>JSON.parse(h.match(/<script[^>]*data-site-schema[^>]*>([\s\S]*?)<\/script>/)[1]);assert.ok(JSON.stringify(graph(html))===JSON.stringify(graph(zipped)),'HTML/ZIP schema parity; compare exported files for details');
  const products=graph(html)['@graph'].filter(n=>n['@type']==='ItemList').flatMap(n=>n.itemListElement).map(n=>n.item).filter(n=>n['@type']==='Product');assert.ok(products.length);for(const p of products){assert.equal(p.sku,product.code);assert.equal(p.aggregateRating.reviewCount,feedback.source.total);assert.equal(p.aggregateRating.ratingCount,undefined);}
  for(const text of [html,zipped])assert.ok(!/wiki-local-demo-only|wiki-demo|127\.0\.0\.1|localhost/.test(text));
  const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const manifest={date:'2026-10-25',sample:'Unchanged template clone; current first-party product 25264 and its real imported reviews; no fabricated shipping/return policy',productCode:product.code,reviewCount:feedback.source.total,loadedReviews:feedback.reviews.length,files:names,htmlSha256:hash(path.join(folder,'export.html')),zipSha256:hash(path.join(folder,'site.zip')),rendererSha256:hash('site-builder/renderer.js'),products:products.length,htmlZipSchemaEqual:true};fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
