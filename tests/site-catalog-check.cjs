const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 let loading=2;
 await page.route('**/editor-api/site-builder/products?*',r=>loading-->0?r.fulfill({status:202,contentType:'application/json',body:JSON.stringify({loading:true})}):r.continue());
 await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();
 await page.locator('[data-tab="products"]').click();await page.locator('#codes').fill('43816, 46713\n47509 43820');await page.locator('#apply-products').click();
 await page.locator('.product-row').filter({hasText:'43820'}).waitFor();
 assert.equal(await page.locator('.product-row').count(),4);assert.equal((await page.locator('#products-error').innerText()).trim(),'');
 assert.match(await page.locator('.product-row').filter({hasText:'43820'}).innerText(),/Brunello Cucinelli/);
 const result=await (await context.request.get(base+'/editor-api/site-builder/products?codes=43816,46713,47509,43820')).json();
 assert.equal(result.missing.length,0);assert.ok(result.total>8000);assert.equal(result.products.length,4);
 if(capture)await page.screenshot({path:'instructions/screens/site-catalog.png'});
 assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});console.log('PASS full catalog: loading retry, all four requested codes, 43820, '+result.total+' products');
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}});const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});}
