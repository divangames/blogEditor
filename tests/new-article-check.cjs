const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
const base='http://127.0.0.1:8877';
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),errors=[];await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(brand=>{currentId='new-button-old-'+brand+'-'+Date.now();lockedId=false;document.querySelector('#filename').value=currentId;document.querySelector('#page-title').value='Старая статья';setArticleSaveDocument();restoreProducts([{sku:'12345',url:'https://outmaxshop.ru/product/12345',title:'Товар'}]);setBody('<header><h1>Старая статья</h1></header><section><p>Правки, которые нужно сохранить</p></section>');changed();clearTimeout(articleAutosaveTimer);},brand);
   const oldId=await page.evaluate(()=>currentId);
   await page.locator('#new-article').click();await page.waitForFunction(old=>currentId!==old&&!articleNewBusy,oldId);
   const created=await page.evaluate(()=>({id:currentId,doc:articleDocumentId,revision:articleServerRevision,products:productLibrary.length,title:document.querySelector('#page-title').value,history:articleHistory.length,body:encodedBody()}));
   assert.notEqual(created.id,oldId);assert.ok(created.doc&&created.revision);assert.equal(created.products,0);assert.ok(await page.evaluate(()=>articleHistory.length>0&&articleHistory.every(e=>e.state.currentId===currentId)));assert.ok(!created.body.includes('Правки, которые'));
   const old=await (await context.request.get(`${base}/api/draft/${oldId}?brand=${brand}`)).json();assert.ok(old.body.includes('Правки, которые'));assert.equal(old.products.length,1);
   await page.locator('#account-name').click();await page.locator('#all-articles').click();await page.locator('#archive-new-article').waitFor();
   await page.locator('#archive-new-article').click();await page.waitForFunction(previous=>currentId!==previous&&!articleNewBusy,created.id);assert.ok(!(await page.locator('.account-dialog').evaluate(n=>n.open)));
   const secondId=await page.evaluate(()=>currentId);assert.notEqual(secondId,created.id);
   // Failed save of the current article must prevent switching documents.
   await page.evaluate(()=>{document.querySelector('#canvas p').lastChild.textContent+=' ОФЛАЙН';changed();clearTimeout(articleAutosaveTimer);});
   await page.route('**/editor-api/save*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Проверочный обрыв сети'})}));
   await page.locator('#new-article').click();await page.waitForFunction(()=>!articleNewBusy);assert.equal(await page.evaluate(()=>currentId),secondId);assert.ok(await page.evaluate(()=>encodedBody().includes('ОФЛАЙН')));
   await page.unroute('**/editor-api/save*');await page.evaluate(()=>save({automatic:true}));
   for(const width of [1280,375]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Toolbar overflow');fs.mkdirSync('release/ui-check/screens',{recursive:true});await page.screenshot({path:`release/ui-check/screens/new-article-${brand}-${width}.png`});}
   for(const id of [oldId,created.id,secondId])await context.request.delete(`${base}/api/draft/${id}?brand=${brand}`);
  }
  assert.deepEqual(errors,[]);console.log('PASS: OUTMAX/HASL creation, user archive, old edits preserved, separate identity/history, save failure and 1280/375 toolbar.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
