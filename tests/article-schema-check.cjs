const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');

async function checkArticleSchema(context,base){
 const page=await context.newPage(),created=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 if(process.env.SCHEMA_BLOCK_ASSET)await page.route(/\/(?:editor|editor-commands|editor-paste)\.js(?:\?|$)/,r=>r.abort());
 const description='Советы 👟 "Осень" & </script><img src=x onerror="alert(1)">';
 const schemaOf=html=>page.evaluate(html=>{
  const doc=new DOMParser().parseFromString(html,'text/html'),scripts=[...doc.querySelectorAll('script[type="application/ld+json"]')];
  const objects=scripts.map(s=>JSON.parse(s.textContent)),articles=[];
  const visit=v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){if(v['@type']==='Article'||v['@type']==='NewsArticle')articles.push(v);if(v['@graph'])visit(v['@graph']);}};objects.forEach(visit);
  return {objects,articles,head:doc.head.querySelectorAll('script[type="application/ld+json"]').length,body:doc.body.querySelectorAll('script[type="application/ld+json"]').length,description:doc.querySelector('meta[name=description]')?.content};
 },html);
 try{
  const me=await (await context.request.get(base+'/editor-api/me')).json();
  for(const brand of ['outmax','hasl']){
   const id='schema-qa-'+brand+'-'+Date.now();created.push({id,brand});
   const response=await context.request.post(base+'/editor-api/save',{data:{id,brand,title:'Schema QA',body:'<h1>Старая статья</h1><p>Текст без разметки.</p>',products:[]}});assert.ok(response.ok());
   await page.goto(base+(brand==='hasl'?'/hasl/':'/')+'?article='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);
   const old=await schemaOf(await page.evaluate(()=>encodedBody()));assert.equal(old.articles.length,1);assert.equal(old.articles[0].headline,'Старая статья');
   assert.ok(!('author' in old.articles[0]));assert.ok(!('datePublished' in old.articles[0]));
   await page.evaluate(description=>{
    const imported={'@context':'https://schema.org','@graph':[{'@type':'Article',headline:'Устарело',author:{'@type':'Person',name:'Автор материала'},datePublished:'2026-10-01T12:00:00+07:00',image:'https://example.com/old.png'},{'@type':'BreadcrumbList',itemListElement:[]},{'@type':'NewsArticle',headline:'Дубликат'}]};
    const meta=document.createElement('meta');meta.name='description';meta.content=description;
    setBody(meta.outerHTML+serializeArticleStructuredData([imported])+'<header><h1>Кроссовки <em>для осени</em></h1><p>Текст статьи.</p><img src="https://example.com/cover.jpg" alt="Обувь"></header><p><a href="https://example.com/">Ссылка</a></p>');resetArticleEditorHistory();
   },description);
   const before=await page.locator('#canvas').innerHTML();assert.equal(await page.locator('#canvas script,#canvas meta').count(),0);
   const stored=await page.evaluate(()=>encodedBody()),schema=await schemaOf(stored),article=schema.articles[0];
   assert.equal(schema.articles.length,1);assert.equal(article.headline,'Кроссовки для осени');assert.equal(article.description,description);assert.equal(article.image,'https://example.com/cover.jpg');assert.equal(article.author.name,'Автор материала');assert.equal(article.datePublished,'2026-10-01T12:00:00+07:00');
   assert.match(stored,/\\u003c\/script>/);assert.equal(schema.objects[1]['@graph'][0]['@type'],'BreadcrumbList');
   for(const snapshot of await page.evaluate(()=>[articleEditorSnapshot().body,articleBackupSnapshot().body]))assert.equal((await schemaOf(snapshot)).articles[0].author.name,'Автор материала');
   assert.deepEqual((await schemaOf(await page.evaluate(()=>previewDocument()))).articles,schema.articles);
   await page.locator('.article-description-settings>summary').click();await page.locator('#article-description').fill('Новое описание');
   assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].description,'Новое описание');
   await page.keyboard.press('Control+z');assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].description,description);
   await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+z');
   assert.equal(await page.locator('#canvas').innerHTML(),before);
   await page.locator('#canvas h1').fill('Обновлённый заголовок');
   assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].headline,'Обновлённый заголовок');
   await page.keyboard.press('Control+z');assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].headline,'Кроссовки для осени');
   await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(canvas.querySelector('header p'));range.collapse(false);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range;ArticleCommands.execute('edit.pastePlain',{text:' Вставка'});});
   assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].author.name,'Автор материала');
   await page.evaluate(()=>ArticleCommands.execute('edit.undo'));
   await page.evaluate(()=>save({automatic:true}));
   const draft=await (await context.request.get(base+`/editor-api/draft/${id}?brand=${brand}`)).json();assert.equal((await schemaOf(draft.body)).articles[0].author.name,'Автор материала');
   const version=await (await context.request.get(base+`/editor-api/draft/${id}/history/${draft.revision}?brand=${brand}`)).json();assert.equal((await schemaOf(version.body)).articles.length,1);
   const copied=await (await context.request.post(base+`/editor-api/archive/${me.id}/article/${id}/copy?brand=${brand}`)).json();created.push({id:copied.id,brand});
   assert.equal((await schemaOf((await (await context.request.get(base+`/editor-api/draft/${copied.id}?brand=${brand}`)).json()).body)).articles[0].description,description);
   for(const site of ['ru','com'])for(const format of ['html','zip']){
    const response=await context.request.get(base+`/editor-api/export/${id}?brand=${brand}&site=${site}&format=${format}`);assert.ok(response.ok());
    let html;
    if(format==='html')html=await response.text();else{const zip=await require('../vendor/jszip.min.js').loadAsync(await response.body());html=await zip.file(Object.keys(zip.files).find(name=>name.endsWith('.html'))).async('string');}
    const exported=await schemaOf(html);assert.equal(exported.articles.length,1);assert.equal(exported.head,2);assert.equal(exported.body,0);assert.equal(exported.description,description);assert.equal(exported.articles[0].description,description);assert.equal(exported.articles[0].author.name,'Автор материала');
    assert.deepEqual(await page.evaluate(html=>{const imported=articleFromHtml(html);setBody(imported.body);return readArticleStructuredData(new DOMParser().parseFromString(encodedBody(),'text/html'))[0];},html),exported.articles[0]);
   }
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);
   assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].description,description);
   await page.evaluate(()=>{adaptArticle();});assert.equal((await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0].author.name,'Автор материала');
   await page.locator('.article-description-settings').evaluate(n=>n.open=true);
   await page.locator('#article-description').fill('');assert.ok(!('description' in (await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0]));
   await page.evaluate(()=>{setBody('<script type="application/ld+json">{invalid}</script><h1>Новая статья</h1><img src="blob:local" alt="Локальное фото"><p>Текст</p>');});
   const clean=(await schemaOf(await page.evaluate(()=>encodedBody()))).articles[0];assert.equal(clean.headline,'Новая статья');assert.ok(!('author' in clean));assert.ok(!('image' in clean));
   console.log('PASS Article '+brand+': automatic/legacy, one JSON-LD, graph/import, author/date, H1/description/image sync, undo, copy/history, HTML/ZIP RU+COM, safe escaping, malformed/private image');
  }
  assert.deepEqual(errors,[]);
 }finally{await page.close();for(const {id,brand} of created)if(id)await context.request.delete(base+`/editor-api/draft/${id}?brand=${brand}`);}
}
module.exports=checkArticleSchema;
if(require.main===module)(async()=>{
 const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',browser=await chromium.launch({channel:'msedge',headless:true});
 try{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});await checkArticleSchema(context,base);}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
