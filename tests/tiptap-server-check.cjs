const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const base=process.env.TIPTAP_SERVER_BASE||'http://127.0.0.1:8877';
const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  const login=await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});assert.equal(login.status(),200);
  const manifest=await (await context.request.get(base+'/tiptap/media-manifest.json')).json();const known=Object.values(manifest)[0].sha256;
  assert.equal((await context.request.post(base+'/editor-api/tiptap-media/'+known+'/0',{data:Buffer.from('invalid')})).status(),400);
  assert.equal((await context.request.post(base+'/editor-api/tiptap-media/'+'a'.repeat(64)+'/0',{data:Buffer.from('invalid')})).status(),404);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(base).origin?route.continue():route.abort();});
  for(const brand of ['outmax','hasl']){
   await page.goto(base+'/tiptap/?brand='+brand,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
   assert.equal(await page.locator('#brand').inputValue(),brand);assert.ok(await page.locator('#block-select optgroup[label="Товары"] option').count()>0);
   const img=await page.locator('#editor img[src]').first().getAttribute('src');assert.ok(!img.startsWith('/media/'));assert.ok(await (await context.request.get(base+'/tiptap/media/'+brand+'/'+(brand==='outmax'?'assets/images/zimnie-krossovki-gorod.webp':'assets/images/hasl-osen-2026-hero-desktop-3456x1700.png'))).body().then(x=>x.length>1000));
   const before=await page.evaluate(()=>window.prototypeHTML());const product=await page.locator('#block-select optgroup[label="Товары"] option').first().getAttribute('value');await page.locator('#block-select').selectOption(product);await page.locator('#block-product-padding').fill('22');await page.locator('.block-apply').click();assert.notEqual(await page.evaluate(()=>window.prototypeHTML()),before);await page.locator('#undo').click();assert.equal(await page.evaluate(()=>window.prototypeHTML()),before);
   const downloadPromise=page.waitForEvent('download');await page.locator('#json').click();const download=await downloadPromise;const file=path.resolve('release/tiptap-prototype/server-'+brand+'.json');await download.saveAs(file);await page.locator('#reopen').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('status').textContent==='JSON повторно открыт.');assert.equal(await page.evaluate(()=>window.prototypeHTML()),before);
   assert.equal((await context.request.get(base+'/tiptap/../../users-access.txt')).status(),404);
  }
  assert.deepEqual(errors,[]);await context.close();
  const anonymous=await browser.newContext({ignoreHTTPSErrors:true});const protectedPage=await anonymous.request.get(base+'/tiptap/');assert.ok(!((await protectedPage.text()).includes('id="block-inspector"')));assert.equal((await anonymous.request.post(base+'/editor-api/tiptap-media/'+known+'/0',{data:Buffer.from('invalid')})).status(),401);await anonymous.close();
  console.log('PASS: authenticated Tiptap server, both brands, bundled media, panels/undo, JSON roundtrip and private-file isolation.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
