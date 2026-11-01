/* Универсальные шаблоны: существующее сохранение, история, экспорт и адаптивный интерфейс. */
const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false,live=false}={})=>{
 const fs=require('node:fs'),run=require('node:crypto').randomUUID(),journal='tmp/universal-run-'+run+'.json';
 const page=await context.newPage(),errors=[],created=[];page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(20000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const seed=require('../site-builder/catalog-seed.json').products;await page.route('**/editor-api/site-builder/products?*',route=>route.fulfill({json:{products:Object.values(seed),missing:[],total:Object.keys(seed).length}}));
 await page.goto(base+'/site-builder/');
 await page.waitForFunction(()=>window.SiteTemplates&&window.SiteBuilder&&!document.body.classList.contains('site-starting'));
 await page.locator('#workspace-start[open]').waitFor();assert.equal(await page.locator('#site-template-catalog[open]').count(),0);await page.locator('.start-new').click();await page.locator('#site-template-catalog[open]').waitFor();assert.equal(await page.locator('#workspace-start[open]').count(),0);
 const saveName=async name=>{await page.locator('#site-file-name-dialog[open]').waitFor();await page.locator('#site-file-name-dialog input').fill(live?'QA '+run+' '+name:name);await page.locator('#site-file-name-dialog button[type=submit]').click();await page.waitForFunction(()=>!SiteBuilder.isDirty());const current=await page.evaluate(()=>SiteBuilder.versionContext());created.push(current.id);fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync(journal,JSON.stringify({base,created}));};
 let primaryError;
 try{
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>SiteTemplates.open('templates'));
   await page.locator('#site-template-catalog[open]').waitFor();
   assert.equal(await page.locator('[data-choose-template]').count(),5);
   if(capture)await page.screenshot({path:'instructions/screens/site-universal-templates-'+(width===390?'phone':'desktop')+'.png'});
   await page.locator('[data-choose-template=dpd]').click();await saveName('Демонстрация DPD '+width);
   await page.waitForFunction(()=>document.querySelector('#desktop').contentDocument?.body.textContent.includes('Два сервиса. Один поток.'));
   const saved=await page.evaluate(()=>structuredClone(state));assert.equal(saved.layout.length,6);assert.equal(saved.templateId,'dpd');
   const archive=await (await context.request.get(base+'/editor-api/site-builder/projects')).json();const card=archive.find(item=>item.id===created.at(-1));assert.equal(card.site,'dpd');assert.ok(card.thumbnail.includes('dpd-cabinet-ozon.webp'));
   const anonymous=await context.browser().newContext();try{assert.equal((await anonymous.request.get(card.thumbnail)).status(),200);}finally{await anonymous.close();}
   const checked=await context.request.get(base+'/editor-api/site-builder/projects/'+created.at(-1));assert.equal(checked.status(),200);assert.equal((await checked.json()).state.templateId,'dpd');
   await page.evaluate(async()=>{const doc=document.querySelector('#desktop').contentDocument;await Promise.all([...doc.images].map(img=>img.decode()));});
   const exported=await page.evaluate(()=>exported());assert.ok(!exported.includes('public-site-statistics'));assert.ok(!exported.includes('хасл.рф'));assert.ok(exported.includes('OZON'));assert.ok(exported.includes('https://space.dpd-ozon.ru/registration'));assert.ok(exported.includes('https://space.dpd-ozon.ru/login'));
   assert.ok(await page.evaluate(()=>{const copy=structuredClone(state),block=copy.layout[0],heading=block.elements.find(e=>e.type==='heading');heading.style.fontFamily='Montserrat';block.inlineLinks={['element-'+heading.id]:{text:heading.text,links:[{start:0,end:3,href:'https://space.dpd-ozon.ru'}]}};block.blockBackgroundPaint={desktop:{mode:'color',color:'#eeeeee'}};const html=HaslRenderer.build(copy,products,content,{clean:true});return html.includes('@font-face')&&html.includes('site-inline-link')&&html.includes('section-wallpaper-desktop');}));
   const output=await context.newPage();await output.setViewportSize({width,height:1000});await output.setContent(exported);await output.evaluate(()=>document.fonts.ready);assert.ok(await output.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await output.close();
   if(capture){await page.evaluate(()=>{tab='layout';render();});if(width===390)await page.evaluate(()=>StudioShell.showPanels());await page.screenshot({path:'instructions/screens/site-universal-editor-'+(width===390?'phone':'desktop')+'.png'});}
   await page.evaluate(()=>SiteTemplates.open('blocks'));await page.locator('[data-block-category=Контакты]').click();assert.equal(await page.locator('[data-choose-block]').count(),2);await page.locator('[data-choose-block=form]').click();
   assert.equal(await page.evaluate(()=>state.layout.length),7);await page.evaluate(()=>document.querySelector('#site-undo').click());assert.equal(await page.evaluate(()=>state.layout.length),6);await page.evaluate(()=>document.querySelector('#site-redo').click());assert.equal(await page.evaluate(()=>state.layout.length),7);
   await page.evaluate(()=>{state.layout[0].elements.find(e=>e.type==='heading').text='Правки без перезагрузки';changed();});
   await page.reload();await page.waitForFunction(()=>!document.body.classList.contains('site-starting')&&state?.templateId==='dpd');assert.equal(await page.evaluate(()=>state.layout[0].elements.find(e=>e.type==='heading').text),'Правки без перезагрузки');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   console.log('PASS universal DPD: assets, server CAS, editable blocks, undo/redo, HTML, reload, width '+width);
  }
  // Вариант доставки и универсальная компания проходят ту же серверную валидацию.
  for(const key of ['dpd-delivery','business','blank']){await page.evaluate(()=>SiteTemplates.open('templates'));await page.locator('[data-choose-template='+key+']').click();await saveName('Демонстрация '+key);assert.equal(await page.evaluate(()=>state.templateId),key);}
  await page.evaluate(()=>SiteTemplates.open('blocks'));await page.locator('[data-choose-block=contact]').click();assert.equal(await page.evaluate(()=>state.layout[0].anchor),'contact');await page.evaluate(()=>document.querySelector('#site-undo').click());assert.equal(await page.evaluate(()=>state.layout.length),0);await page.evaluate(()=>document.querySelector('#site-redo').click());assert.equal(await page.evaluate(()=>state.layout[0].anchor),'contact');
  await page.evaluate(()=>SiteTemplates.open('blocks'));await page.locator('[data-choose-block=contact]').click();assert.equal(await page.evaluate(()=>state.layout.filter(block=>block.anchor==='contact').length),1);
  await page.evaluate(()=>{tab='export';render();});const downloadPromise=page.waitForEvent('download');await page.locator('#download-html').click();const download=await downloadPromise;assert.ok(!download.suggestedFilename().includes('оба-сайта'));assert.ok(download.suggestedFilename().endsWith('.html'));await download.delete();await page.waitForFunction(()=>!SiteBuilder.isDirty());
  const referenceBefore=await (await context.request.get(base+'/editor-api/site-builder/reference')).json();
  await page.evaluate(()=>SiteTemplates.open('templates'));await page.locator('[data-choose-template=hasl]').click();await saveName('Демонстрация ХАСЛ');
  assert.ok(await page.evaluate(()=>state.layout.some(b=>b.source==='s0')));assert.ok((await page.evaluate(()=>exported())).includes('hasl-home-embed'));
  assert.deepEqual(await (await context.request.get(base+'/editor-api/site-builder/reference')).json(),referenceBefore);
  await page.goto(base+'/instructions/#site-universal');await page.getByRole('heading',{name:'Универсальный конструктор: шаблоны ХАСЛ и OZON × DPD',exact:true}).waitFor();await page.locator('#wiki-search').fill('DPD');await page.locator('.wiki-result[href="#site-universal"]').waitFor();
  for(const device of ['desktop','phone'])for(const kind of ['templates','editor'])assert.equal((await context.request.get(base+'/instructions/screens/site-universal-'+kind+'-'+device+'.png')).status(),200);
  assert.deepEqual(errors,[]);
 }catch(error){primaryError=error;throw error;}finally{
  await page.evaluate(()=>{window.__WORKSPACE_LEAVING__=true;sessionStorage.clear();}).catch(()=>{});await page.close();
  const failures=[];
  for(const id of created.reverse()){try{const result=await context.request.get(base+'/editor-api/site-builder/projects/'+id);if(result.ok()){const data=await result.json();const deleted=await context.request.delete(base+'/editor-api/site-builder/projects/'+id,{data:{revision:data.revision},headers:{Origin:base},timeout:120000});assert.ok(deleted.ok(),'QA cleanup HTTP '+deleted.status());}else assert.equal(result.status(),404);}catch(error){failures.push(id+': '+error.message.split('Call log:')[0]);}}
  if(failures.length){console.error('QA cleanup incomplete: '+failures.join('; '));if(!primaryError)throw new Error('QA cleanup incomplete; see '+journal);}
  else fs.unlinkSync(journal);
 }
 console.log('PASS universal templates and cleanup');
};
if(require.main===module){const fs=require('node:fs'),{chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8897',live=!base.startsWith('http://127.0.0.1:'),credentials=live?JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')):{user:'wiki-demo',password:'wiki-local-demo-only'},browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());await module.exports(context,base,{live});}finally{await browser.close();}})().catch(error=>{console.error(error.message.split('Call log:')[0]);process.exit(1)});}
