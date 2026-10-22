const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).origin===base||r.request().resourceType()==='image'?r.continue():r.abort());
 await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();
 await page.evaluate(async()=>{const data=await api('products?codes=47465,45470');data.products.forEach(p=>products[p.code]=p);products['45470'].oldprice=0;products['47465'].oldprice=8570;state.blocks.promos={codes:'47465,45470',appliedCodes:'47465,45470',resolved:['47465','45470'],photos:{},missing:[],loaded:true};updatePreviews();});
 const frame=page.frameLocator('#phone');await frame.locator('.hero-side .product').first().waitFor();
 const check=async scope=>{const boxes=await scope.locator('.hero-side .product').evaluateAll(cards=>cards.map(c=>{const img=c.querySelector('img'),r=img.getBoundingClientRect(),card=c.getBoundingClientRect();return {top:r.top-card.top,height:r.height,width:r.width};}));assert.equal(boxes.length,2);for(const b of boxes){assert.ok(Math.abs(b.top)<1);assert.ok(Math.abs(b.height-b.width)<1);assert.ok(b.width>100);}assert.ok(Math.abs(boxes[0].top-boxes[1].top)<1);};
 await check(frame);
 const output=await page.evaluate(()=>exported()),exportPage=await context.newPage();
 await exportPage.route('**/*',r=>r.request().resourceType()==='image'?r.continue():r.abort());
 for(const width of [320,390,600]){await exportPage.setViewportSize({width,height:900});await exportPage.setContent(output);await check(exportPage);}
 if(capture){await exportPage.setViewportSize({width:390,height:900});await exportPage.locator('.hero-side').scrollIntoViewIfNeeded();await exportPage.locator('.hero-side img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode().catch(()=>{})));});await exportPage.locator('.hero-side').screenshot({path:'instructions/screens/site-promo-alignment.png'});}
 await exportPage.close();await page.close({runBeforeUnload:false});console.log('PASS promo images: equal top/square images in preview and exported HTML at 320/390/600px, one old price');
};
