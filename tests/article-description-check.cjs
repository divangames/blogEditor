const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');

async function checkArticleDescription(context,base,{capture=false}={}){
 const page=await context.newPage(),errors=[],created=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 if(process.env.DESCRIPTION_BLOCK_ASSET)await page.route(/\/(?:editor|editor-commands|editor-paste)\.js(?:\?|$)/,route=>route.abort());
 const description='Как выбрать кроссовки «Осень» 👟: "фото" & <советы> > детали';
 try{
  for(const brand of ['outmax','hasl']){
   const path=brand==='hasl'?'/hasl/':'/',id='description-qa-'+brand+'-'+Date.now();
   const response=await context.request.post(base+'/editor-api/save',{data:{id,brand,title:'Демонстрационная статья '+brand,body:'<header><h1>Кроссовки для осени</h1><p>Как выбрать удобную пару на каждый день.</p></header><section class="om-section"><h2>Материалы и уход</h2><p><strong>Текст</strong> и <a href="https://example.com/">ссылка</a>.</p></section>',products:[]}});
   assert.ok(response.ok());created.push({id,brand});
   await page.goto(base+path+'?article='+id,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);
   assert.equal(await page.locator('#article-description').inputValue(),'');
   assert.equal(await page.locator('.article-description-settings').evaluate(n=>n.open),false);
   const before=await page.locator('#canvas').innerHTML();
   await page.locator('.article-description-settings > summary').click();
   await page.getByLabel('Описание для поисковых систем',{exact:true}).fill(description);
   assert.equal(await page.locator('#article-description-count').innerText(),Array.from(description).length+' символов');
   await page.keyboard.press('Control+z');
   assert.equal(await page.locator('#article-description').inputValue(),'');
   await page.keyboard.press('Control+Shift+z');
   assert.equal(await page.locator('#article-description').inputValue(),description);
   assert.equal(await page.locator('#canvas').innerHTML(),before);
   const local=await page.evaluate(()=>({body:encodedBody(),backup:articleBackupSnapshot(),preview:previewDocument(),snapshot:articleEditorSnapshot()}));
   assert.match(local.body,/meta name="description"/);assert.equal(local.backup.body,local.body);assert.match(local.snapshot.body,/meta name="description"/);
   const checkHTML=async html=>page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');return {description:doc.head.querySelector('meta[name=description]')?.content,count:doc.querySelectorAll('meta[name=description]').length,bodyMeta:doc.body.querySelectorAll('meta[name=description]').length};},html);
   assert.deepEqual(await checkHTML(local.preview),{description,count:1,bodyMeta:0});
   const saved=await page.evaluate(()=>save({automatic:true}));assert.ok(saved);
   const url=base+`/editor-api/draft/${id}?brand=${brand}`;
   const draft=await (await context.request.get(url)).json();assert.match(draft.body,/meta name="description"/);
   const version=await (await context.request.get(base+`/editor-api/draft/${id}/history/${draft.revision}?brand=${brand}`)).json();
   assert.equal(await page.evaluate(body=>new DOMParser().parseFromString(body,'text/html').querySelector('meta[name=description]')?.content,version.body),description);
   const me=await (await context.request.get(base+'/editor-api/me')).json();
   const copied=await context.request.post(base+`/editor-api/archive/${me.id}/article/${id}/copy?brand=${brand}`);assert.ok(copied.ok());
   const copy=await copied.json();created.push({id:copy.id,brand});
   const copyDraft=await (await context.request.get(base+`/editor-api/draft/${copy.id}?brand=${brand}`)).json();assert.equal(await page.evaluate(body=>new DOMParser().parseFromString(body,'text/html').querySelector('meta[name=description]')?.content,copyDraft.body),description);
   for(const format of ['html','zip']){
    const exported=await context.request.get(base+`/editor-api/export/${id}?brand=${brand}&site=ru&format=${format}`);assert.ok(exported.ok());
    let html;
    if(format==='html')html=await exported.text();
    else{
     const JSZip=require('../vendor/jszip.min.js'),zip=await JSZip.loadAsync(await exported.body());
     const name=Object.keys(zip.files).find(name=>name.endsWith('.html'));assert.ok(name);html=await zip.file(name).async('string');
    }
    assert.deepEqual(await checkHTML(html),{description,count:1,bodyMeta:0});
    const imported=await page.evaluate(html=>{const data=articleFromHtml(html);setBody(data.body);return document.querySelector('#article-description').value;},html);assert.equal(imported,description);
   }
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);
   assert.equal(await page.locator('#article-description').inputValue(),description);
   await page.evaluate(()=>{adaptArticle();});assert.equal(await page.locator('#article-description').inputValue(),description);
   await page.evaluate(()=>{setTab('html');});
   assert.match(await page.locator('#source').inputValue(),/meta name="description"/);
   await page.locator('#source').fill('<meta name="description" content="Из HTML"><p>Правка исходника</p>');
   assert.equal(await page.locator('#article-description').inputValue(),'Из HTML');
   await page.evaluate(()=>setTab('editor'));
   await page.evaluate(()=>{setBody('<meta name="DESCRIPTION" content="Первое"><meta name="description" content="Второе"><p>Текст</p>');});
   assert.equal(await page.locator('#article-description').inputValue(),'Первое');
   assert.equal(await page.locator('#canvas meta').count(),0);
   await page.evaluate(()=>{setBody('<p>Старая статья без метаданных</p>');});assert.equal(await page.locator('#article-description').inputValue(),'');
   await page.evaluate(value=>{setBody('<header><h1>Кроссовки для осени</h1><p>Как выбрать удобную пару на каждый день.</p></header><section class="om-section"><h2>Материалы и уход</h2><p>Выбираем пару для прохладной погоды.</p></section>');document.querySelector('#article-description').value=value;updateArticleDescription();changed();},description);
   await page.locator('.article-description-settings').evaluate(n=>n.open=true);
   if(capture){
    await page.evaluate(()=>{document.querySelector('#article-description').value='Как выбрать кроссовки для осени: материалы, посадка и уход за обувью на каждый день.';updateArticleDescription();clearTimeout(toastTimer);document.querySelector('#toast').className='';document.activeElement?.blur();});
    for(const width of [1440,390]){
     await page.setViewportSize({width,height:width===390?844:1000});
     await page.locator('#article-description').scrollIntoViewIfNeeded();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     await page.screenshot({path:'instructions/screens/article-description-'+brand+(width===390?'-mobile':'')+'.png'});
    }
   }
   await page.locator('#article-description').fill('');await page.evaluate(()=>save({automatic:true}));
   assert.doesNotMatch((await (await context.request.get(url)).json()).body,/meta name="description"/);
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>currentId===id&&articleBackupReady,id);assert.equal(await page.locator('#article-description').inputValue(),'');
   console.log('PASS description '+brand+': undo/redo, save/reopen/clear, copy/history, HTML/ZIP/import/source, escaping, adaptation, legacy documents'+(capture?', desktop/mobile screenshots':''));
  }
  assert.deepEqual(errors,[]);
 }finally{
  await page.close();
  for(const {id,brand} of created)await context.request.delete(base+`/editor-api/draft/${id}?brand=${brand}`);
 }
}
module.exports=checkArticleDescription;
if(require.main===module)(async()=>{
 const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',browser=await chromium.launch({channel:'msedge',headless:true});
 try{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});await checkArticleDescription(context,base);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
