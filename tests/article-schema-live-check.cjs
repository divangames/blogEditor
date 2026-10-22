const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000}});
  const login=await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}});assert.ok(login.ok());
  await require('./article-schema-check.cjs')(context,base);
  await require('./article-metadata-check.cjs')(context,base);
  for(const brand of ['outmax','hasl']){
   const id='schema-repair-live-'+brand+'-'+Date.now();let created=false;
   try{
    const body='<script type="application/ld+json">{"@type":"Article","wordCount":1e999}</script><meta name="article-cover" content="/image/'+id+'/selected.png"><h1>Schema repair demo</h1><p>Disposable QA material.</p><img src="https://"><img src="/image/'+id+'/first.png"><img src="/image/'+id+'/selected.png">';
    const saved=await context.request.post(base+'/editor-api/save',{data:{id,brand,title:'Schema repair demo',body,products:[]}});assert.ok(saved.ok());created=true;
    for(const site of ['ru','com'])for(const format of ['html','zip']){
     const response=await context.request.get(base+`/editor-api/export/${id}?brand=${brand}&site=${site}&format=${format}`);assert.ok(response.ok());
     let html;if(format==='html')html=await response.text();else{const zip=await require('../vendor/jszip.min.js').loadAsync(await response.body());html=await zip.file(Object.keys(zip.files).find(n=>n.endsWith('.html'))).async('string');}
     const page=await context.newPage();const result=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html'),scripts=doc.querySelectorAll('script[type="application/ld+json"]');return {schema:JSON.parse(scripts[0].textContent),count:scripts.length,head:doc.head.contains(scripts[0])};},html);await page.close();
     const domain={outmax:{ru:'outmaxshop.ru',com:'outmaxshop.com'},hasl:{ru:'xn--80awro.xn--p1ai',com:'haslestore.com'}}[brand][site];
     assert.equal(result.count,1);assert.equal(result.head,true);assert.equal(result.schema.headline,'Schema repair demo');assert.equal(result.schema.wordCount,undefined);assert.equal(result.schema.image,'https://'+domain+'/image/'+id+'/selected.png');
    }
    console.log('PASS live backend repair: overflow, bad first URL, selected packaged-image path, HTML/ZIP RU+COM '+brand);
   }finally{if(created)assert.ok((await context.request.delete(base+`/editor-api/draft/${id}?brand=${brand}`)).ok());}
  }
  await require('./tiptap-cms-smoke-check.cjs')(context,base);
  console.log('PASS live Schema.org: deployed exports and metadata, temporary demo records removed, no sends');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
