const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.SCHEMA_BROWSER_TEST_BASE||'http://127.0.0.1:8881';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const entry of ['/','/hasl/']){
  const context=await browser.newContext(),page=await context.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+entry,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(async()=>{setBody('<meta name="description" content="Static description"><h1>Static article</h1><p>Content</p>');document.getElementById('page-title').value='Static article';currentId='schema-static';document.getElementById('filename').value=currentId;setArticleSaveDocument({documentId:crypto.randomUUID()});changed();const saved=await save({automatic:true});if(!saved)throw new Error(document.getElementById('toast').textContent+' / '+document.getElementById('status').textContent);});
  for(const format of ['html','zip']){
   const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(format=>onlineDownloadExport(currentId,'ru',format),format)]);let html;
   if(format==='html')html=fs.readFileSync(await download.path(),'utf8');else{const zip=await require('../vendor/jszip.min.js').loadAsync(fs.readFileSync(await download.path()));html=await zip.file(Object.keys(zip.files).find(n=>n.endsWith('.html'))).async('string');}
   const result=await page.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');return {schema:JSON.parse(d.head.querySelector('script[type="application/ld+json"]').textContent),description:d.head.querySelector('meta[name=description]').content,bodyScripts:d.body.querySelectorAll('script[type="application/ld+json"]').length};},html);
   assert.equal(result.schema.headline,'Static article');assert.equal(result.schema.description,'Static description');assert.equal(result.bodyScripts,0);assert.equal(result.description,'Static description');
  }
  await context.close();console.log('PASS static browser HTML/ZIP Article + description '+entry);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
