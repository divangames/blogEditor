const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');

async function checkArticleCopy(context,base,{capture=false}={}){
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const me=await (await context.request.get(base+'/editor-api/me')).json();
 const created=[];
 try{
  for(const brand of ['outmax','hasl']){
   const id='copy-qa-'+brand+'-'+Date.now(),title='Демонстрационная статья '+(brand==='hasl'?'ХАСЛ':'OUTMAX');
   const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
   const upload=await context.request.post(base+`/editor-api/upload?draft=${id}&brand=${brand}&name=cover`,{data:photo,headers:{'Content-Type':'image/png'}});assert.ok(upload.ok());
   const src=(brand==='hasl'?'hasl--':'')+id+'_files/cover.png';
   const saved=await context.request.post(base+'/editor-api/save',{data:{id,brand,title,body:`<header><h1>${title}</h1></header><section><p><strong>Текст</strong> для копирования 👟 <a href="https://example.com/">Ссылка</a></p><img src="${src}" alt="Демонстрационное фото"></section>`,products:[]}});assert.ok(saved.ok());created.push({id,brand});
   const draftURL=base+`/editor-api/draft/${id}?brand=${brand}`;
   const before=await (await context.request.get(draftURL)).json();
   await page.goto(base+(brand==='hasl'?'/hasl/':'/')+'?view=articles',{waitUntil:'domcontentloaded'});
   await page.locator('#archive-search').fill(title);
   const card=page.locator('.archive-card').filter({has:page.locator('strong',{hasText:title})}).first();
   const copy=card.getByRole('button',{name:'Скопировать статью',exact:true});await copy.waitFor();
   let release,requests=0;
   const gate=new Promise(resolve=>release=resolve);
   await page.route('**/article/*/copy?*',async route=>{requests++;await gate;await route.continue();});
   await copy.click();assert.equal(await copy.isDisabled(),true);
   await copy.evaluate(button=>button.click());assert.equal(requests,1);
   release();await page.locator('.archive-card strong').filter({hasText:'— копия'}).waitFor();
   await page.unroute('**/article/*/copy?*');
   const items=await (await context.request.get(base+'/editor-api/archive/'+me.id)).json();
   const duplicate=items.find(a=>a.title===title+' — копия'&&a.brand===brand);assert.ok(duplicate);created.push({id:duplicate.id,brand});
   assert.notEqual(duplicate.id,id);
   const copyURL=base+`/editor-api/draft/${duplicate.id}?brand=${brand}`;
   const data=await (await context.request.get(copyURL)).json();
   assert.match(data.body,/<strong>Текст<\/strong>/);assert.match(data.body,/https:\/\/example.com\//);
   assert.notEqual(data.documentId,before.documentId);assert.deepEqual(data.products,before.products);
   const image=/src="([^"]+)"/.exec(data.body)[1];
   assert.ok(image.includes(duplicate.id));
   const copiedPhoto=await context.request.get(base+'/articles/'+image);assert.equal(copiedPhoto.status(),200);assert.deepEqual(await copiedPhoto.body(),photo);
   assert.deepEqual(await (await context.request.get(draftURL)).json(),before);
   if(capture&&brand==='outmax')await page.locator('.archive-card').first().screenshot({path:'instructions/screens/article-copy.png'});
   await page.getByRole('button',{name:'Список',exact:true}).click();assert.equal(await page.locator('.as-list .action-copy').count(),2);
   await page.getByRole('button',{name:'Карточки',exact:true}).click();
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok((await copy.boundingBox()).width>=44);
   if(capture&&brand==='hasl')await page.screenshot({path:'instructions/screens/article-copy-mobile.png'});
   await page.route('**/article/*/copy?*',route=>route.fulfill({status:500,json:{error:'Проверка ошибки копирования'}}));
   await copy.click();await page.waitForFunction(()=>!document.querySelector('.action-copy').disabled);
   assert.equal(await page.locator('.archive-card').count(),2);await page.unroute('**/article/*/copy?*');
   const edited=await context.request.post(base+'/editor-api/save',{data:{id:duplicate.id,brand,title:data.title,body:'<p>Правка копии</p>',products:data.products,expectedRevision:data.revision,documentId:data.documentId}});assert.ok(edited.ok());
   assert.deepEqual(await (await context.request.get(draftURL)).json(),before);
   await context.request.delete(draftURL);
   assert.equal((await context.request.get(base+'/articles/'+image)).status(),200);
   await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS article copy: both brands, saved content, independent photos/document/edit, single request, error recovery, grid/list, mobile.');
 }finally{
  await page.close();
  for(const item of created)await context.request.delete(base+`/editor-api/draft/${item.id}?brand=${item.brand}`);
 }
}
module.exports=checkArticleCopy;
if(require.main===module)(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base=process.env.COPY_TEST_BASE||'http://127.0.0.1:8878';
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const login=await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});assert.ok(login.ok());
  await checkArticleCopy(context,base);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
