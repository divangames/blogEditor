const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const entry of ['/','/hasl/']){
  const context=await browser.newContext(),page=await context.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).origin===(process.env.BROWSER_TEST_BASE||'http://127.0.0.1:8881')?r.continue():r.abort());
  await page.route('https://example.com/*.jpg',r=>r.fulfill({contentType:'image/png',body:fs.readFileSync('images/outmax.png')}));
  await page.goto((process.env.BROWSER_TEST_BASE||'http://127.0.0.1:8881')+entry,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(async()=>{setBody('<meta name="editor-brief" content="{&quot;audience&quot;:&quot;SECRET-BRIEF&quot;}"><meta name="description" content="Static description"><meta name="article-cover" content="https://example.com/b.jpg"><h1>Static article</h1><p>Content</p><img src="https://example.com/a.jpg" alt="First"><img src="https://example.com/b.jpg" alt="Cover">');document.getElementById('page-title').value='Static article';currentId='schema-static';document.getElementById('filename').value=currentId;setArticleSaveDocument({documentId:crypto.randomUUID()});changed();const saved=await save({automatic:true});if(!saved)throw new Error(document.getElementById('toast').textContent+' / '+document.getElementById('status').textContent);});
  for(const format of ['html','zip']){
   const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(format=>onlineDownloadExport(currentId,'ru',format),format)]);let html;
   if(format==='html')html=fs.readFileSync(await download.path(),'utf8');else{const zip=await require('../vendor/jszip.min.js').loadAsync(fs.readFileSync(await download.path()));html=await zip.file(Object.keys(zip.files).find(n=>n.endsWith('.html'))).async('string');}
   const result=await page.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');return {schema:JSON.parse(d.head.querySelector('script[type="application/ld+json"]').textContent),description:d.head.querySelector('meta[name=description]').content,cover:d.head.querySelector('meta[name=article-cover]')?.content,meta:d.querySelectorAll('meta[name=description]').length,private:/editor-brief|SECRET-BRIEF/.test(html),bodyScripts:d.body.querySelectorAll('script[type="application/ld+json"]').length};},html);
   assert.equal(result.cover,'https://example.com/b.jpg');assert.equal(result.schema.image,result.cover);assert.equal(result.meta,1);assert.equal(result.private,false);assert.equal(result.schema.headline,'Static article');assert.equal(result.schema.description,'Static description');assert.equal(result.bodyScripts,0);assert.equal(result.description,'Static description');
  }
  const [localDownload]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>onlineDownloadExport(currentId,'both','zip',true))]);
  const localZip=await require('../vendor/jszip.min.js').loadAsync(fs.readFileSync(await localDownload.path()));
  for(const key of ['ru','com']){
   const filename=Object.keys(localZip.files).find(n=>n.endsWith('-'+key+'.html'));
   const html=await localZip.file(filename).async('string');
   const result=await page.evaluate(({html,key})=>{const doc=new DOMParser().parseFromString(html,'text/html');return {image:JSON.parse(doc.head.querySelector('script[type="application/ld+json"]').textContent).image,src:doc.querySelectorAll('img')[1].getAttribute('src'),domain:new URL('https://'+OUTMAX_SITES[key]).hostname,private:/SECRET-BRIEF|editor-brief/.test(html)};},{html,key});
   assert.equal(result.image,'https://example.com/b.jpg');assert.equal(result.src,'https://example.com/b.jpg');assert.equal(Object.keys(localZip.files).filter(n=>/\.(jpg|png|webp|gif)$/i.test(n)).length,0);assert.equal(result.private,false);
  }
  await context.close();console.log('PASS static browser HTML/ZIP Article/description/selected cover, no brief leak '+entry);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
