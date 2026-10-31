const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const products=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(products),missing:[],total:6}}));
 const reference=await(await context.request.get(base+'/editor-api/site-builder/reference')).json();
 async function create(path,title,href){const state=structuredClone(reference);state.title=title;state.pageSettings={path,description:title,canonical:'https://example.test/'+path};state.haslSectionVersion=1;state.layout=[{id:'page-'+title,source:'custom',name:'Страница',mode:'grid',elements:[{id:'heading',type:'heading',tag:'h1',text:title},{id:'button',type:'button',text:'Перейти',href}]}];const r=await context.request.post(base+'/editor-api/site-builder/projects',{data:state});assert.equal(r.status(),201,await r.text());return(await r.json()).id;}
 const first=await create('index.html','Start','/info/about.html'),second=await create('info/about.html','About','/index.html');
 await page.goto(base+'/site-builder/hasl/?page='+first);await page.locator('#site-block-select').waitFor();await page.locator('[data-tab="siteExport"]').click();
 await page.locator('[data-bundle-page="'+first+'"]').check();await page.locator('[data-bundle-page="'+second+'"]').check();
 if(capture)await page.screenshot({path:'instructions/screens/site-designer-bundle.png'});
 const download=page.waitForEvent('download');await page.locator('[data-designer-action="export-site"]').click();const file=await download;assert.equal(file.suggestedFilename(),'ХАСЛ-сайт.zip');
 const chunks=[];for await(const part of await file.createReadStream())chunks.push(part);
 const JSZip=require('../vendor/jszip.min.js'),zip=await JSZip.loadAsync(Buffer.concat(chunks));
 assert.ok(zip.file('index.html'));assert.ok(zip.file('info/about.html'));assert.ok(zip.file('README.txt'));
 assert.match(await zip.file('index.html').async('string'),/href="info\/about.html"/);
 assert.match(await zip.file('info/about.html').async('string'),/href="\.\.\/index.html"/);
 for(const [path,name] of [['index.html','Start'],['info/about.html','About']]){
  const markup=await zip.file(path).async('string');
  const schema=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html'),scripts=doc.querySelectorAll('script[data-site-schema="auto"]');if(scripts.length!==1)throw Error('Missing or duplicate static JSON-LD in ZIP');return JSON.parse(scripts[0].textContent);},markup);
  assert.equal(schema['@graph'][0].name,name);assert.equal(schema['@graph'][0].url,'https://example.test/'+path);assert.equal(schema['@graph'][0].headline,name);
 }
 assert.equal(await page.evaluate(()=>state.pageSettings.path),'index.html','bundle does not alter current page');
 const missing=await page.evaluate(async id=>{try{await SiteDesigner.buildSiteBundle([id]);return '';}catch(e){return e.message;}},first);assert.match(missing,/не выбранную/);
 const duplicate=await create('INDEX.html','Duplicate','https://example.test');
 const conflict=await page.evaluate(async ids=>{try{await SiteDesigner.buildSiteBundle(ids);return '';}catch(e){return e.message;}},[first,duplicate]);assert.match(conflict,/Одинаковые/);
 assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});console.log('PASS site ZIP: two saved pages, nested paths, relative links both ways, duplicate/missing targets blocked, current page unchanged');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const context=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
