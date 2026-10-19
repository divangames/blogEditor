const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict');
const title='ЛУЧШИЕ ЗИМНИЕ КРОССОВКИ ДЛЯ МУЖЧИН 2026-2027: ТОП МОДЕЛЕЙ ДЛЯ ЛЮБОЙ ПОГОДЫ';
const fixture='<meta name="description" content="Как выбрать зимние кроссовки"><header style="padding:24px 16px;background:#fff;color:#231815"><h1 style="font-size:56px!important;line-height:64px!important;color:#231815">'+title+'</h1><p style="color:#231815">Зимняя обувь для повседневной носки: посадка, материалы и защита от непогоды.</p></header><section class="om-section"><h2>Выбираем пару для зимы</h2><p>Проверьте утепление, подошву и удобство модели.</p></section>';

async function checkHaslMobileHeading(context,base,{capture=false}={}){
 const editor=await context.newPage(),render=await context.newPage(),errors=[];
 editor.on('pageerror',e=>errors.push(e.message));render.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 if(process.env.HEADING_BLOCK_ASSET)await editor.route('**/editor.js*',r=>r.abort());
 let id;
 try{
  await editor.goto(base+'/hasl/',{waitUntil:'domcontentloaded'});await editor.waitForFunction(()=>articleBackupReady);
  await editor.evaluate(fixture=>{setBody(fixture,{normalize:false});resetArticleEditorHistory();},fixture);
  const before=await editor.evaluate(()=>JSON.stringify([encodedBody(),articleHistoryIndex,articleNeedsSave]));
  const html=await editor.evaluate(()=>previewDocument());
  const assertRender=async(html,label)=>{
   await render.setContent(html);
   for(const width of [320,360,390,430,680,920]){
    await render.setViewportSize({width,height:1000});
    const metrics=await render.locator('h1').evaluate(n=>({size:parseFloat(getComputedStyle(n).fontSize),line:parseFloat(getComputedStyle(n).lineHeight),text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert.equal(metrics.text,title,label+' title');assert.equal(metrics.overflow,false,label+' overflow '+width);
    if(width<=680){assert.ok(metrics.size>=28&&metrics.size<=32,label+' mobile font '+width+': '+metrics.size);assert.ok(metrics.line<=37,label+' line height '+metrics.line);if(width===360)assert.ok(metrics.height<300,label+' title height '+metrics.height);}
    else {assert.equal(metrics.size,56,label+' desktop size');assert.equal(metrics.line,64,label+' desktop line');}
    if(capture&&label==='preview'&&[360,920].includes(width))await render.screenshot({path:'instructions/screens/hasl-mobile-heading'+(width===920?'-desktop':'')+'.png'});
   }
  };
  await assertRender(html,'preview');assert.equal(await editor.evaluate(()=>JSON.stringify([encodedBody(),articleHistoryIndex,articleNeedsSave])),before);
  const nested=await editor.evaluate(()=>{setBody('<header><h1 style="font-size:56px!important"><span style="font-size:56px!important;color:#a00000"><strong>ЛУЧШИЕ ЗИМНИЕ</strong></span> КРОССОВКИ</h1></header>',{normalize:false});return previewDocument();});
  await render.setViewportSize({width:360,height:1000});await render.setContent(nested);assert.ok(await render.locator('h1 span').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)<=32));assert.equal(await render.locator('span').evaluate(n=>getComputedStyle(n).color),'rgb(160, 0, 0)');
  await editor.evaluate(()=>{setBody('<h1 style="font-size:20px!important">Маленький заголовок</h1>');});await render.setContent(await editor.evaluate(()=>previewDocument()));assert.equal(await render.locator('h1').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)),20);
  await editor.setViewportSize({width:390,height:900});await editor.evaluate(()=>{canvas.querySelector('h1').style.setProperty('font-size','56px','important');changed();});assert.ok(await editor.locator('#canvas h1').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)<=32));await editor.setViewportSize({width:1440,height:1000});
  id='hasl-heading-qa-'+Date.now();
  await editor.evaluate(({fixture,id})=>{currentId=id;lockedId=true;document.querySelector('#filename').value=id;document.querySelector('#page-title').value='Демонстрация заголовка ХАСЛ';setArticleSaveDocument();setBody(fixture,{normalize:false});changed();},{fixture,id});await editor.evaluate(()=>save());
  const response=await context.request.get(base+`/editor-api/export/${id}?brand=hasl&site=ru&format=html`);assert.ok(response.ok());
  const exported=await response.text();await assertRender(exported,'HTML');
  assert.equal(await render.locator('article style[data-hasl-mobile-heading]').count(),1);
  const zipResponse=await context.request.get(base+`/editor-api/export/${id}?brand=hasl&site=ru&format=zip`);assert.ok(zipResponse.ok());const zip=await require('../vendor/jszip.min.js').loadAsync(await zipResponse.body());await assertRender(await zip.file(Object.keys(zip.files).find(n=>n.endsWith('.html'))).async('string'),'ZIP');
  const cms=await render.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+d.querySelector('article.om-guide').outerHTML;},exported);await assertRender(cms,'CMS body');
  const raw=await (await context.request.get(base+`/editor-api/draft/${id}?brand=hasl`)).json();assert.match(raw.body,/name="description"/);assert.match(raw.body,/application\/ld\+json/);
  await editor.evaluate(body=>{setBody(body);setBody(encodedBody());},raw.body);assert.ok((await editor.evaluate(()=>encodedBody())).length<raw.body.length+1000,'normalization must not grow');
  const shorthand=fixture.replace('font-size:56px!important;line-height:64px!important','font:700 56px/64px Arial!important');
  const rawSave=await context.request.post(base+'/editor-api/save',{data:{id,brand:'hasl',title:'Проверка старого font shorthand',body:shorthand,products:[],expectedRevision:raw.revision,documentId:raw.documentId}});assert.ok(rawSave.ok());
  await assertRender(await (await context.request.get(base+`/editor-api/export/${id}?brand=hasl&site=ru&format=html`)).text(),'legacy server shorthand');
  await editor.goto(base+'/',{waitUntil:'domcontentloaded'});await editor.waitForFunction(()=>articleBackupReady);await editor.evaluate(()=>setBody('<h1 style="font-size:56px!important">OUTMAX</h1>'));await render.setContent(await editor.evaluate(()=>previewDocument()));await render.setViewportSize({width:360,height:1000});assert.equal(await render.locator('h1').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)),56);
  assert.deepEqual(errors,[]);console.log('PASS HASL mobile H1: 28–32px at 320–680px, desktop 56/64px, legacy important/nested/small sizes, preview/HTML/ZIP/CMS, metadata, no source/undo mutation; OUTMAX unchanged');
 }finally{await editor.close();await render.close();if(id)await context.request.delete(base+`/editor-api/draft/${id}?brand=hasl`);}
}
module.exports=checkHaslMobileHeading;
if(require.main===module)(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});await checkHaslMobileHeading(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
