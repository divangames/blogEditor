const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.ARTICLE_TEST_BASE||'http://127.0.0.1:8877';
const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
const fixture='<header id="parity-header"><h1>Проверка экспорта</h1><p>Одинаковый вид на всех экранах</p></header><nav class="om-toc"><h2>Содержание</h2><div><a href="#one">Первый раздел <span>↓</span></a><a href="#two">Второй раздел <span>↓</span></a></div></nav><section class="om-section" id="one"><h2>Первый раздел</h2><p>Текст статьи для проверки строк и отступов.</p><div class="om-table-scroll"><table><thead><tr><th>Модель</th><th>Цена</th></tr></thead><tbody><tr><td>Модель А</td><td>7 990 ₽</td></tr></tbody></table></div></section><section class="om-section" id="two"><h2>Второй раздел</h2><p>Завершающий текст.</p></section>';
const selectors=['.om-guide','#parity-header','h1','#parity-header>p','nav','nav>div','nav a','section#one','table'];
async function metrics(page){return page.evaluate(selectors=>Object.fromEntries(selectors.map(selector=>{const node=document.querySelector(selector),style=getComputedStyle(node),box=node.getBoundingClientRect();return[selector,{display:style.display,fontFamily:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,gridTemplateColumns:style.gridTemplateColumns,padding:style.padding,margin:style.margin,width:Math.round(box.width*10)/10,height:Math.round(box.height*10)/10}]}).concat([['overflow',document.documentElement.scrollWidth>innerWidth]])),selectors)}
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext();
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
 const ids=[];
 try{
  for(const brand of ['outmax','hasl']){
   const editor=await context.newPage();
   await editor.goto(base+(brand==='hasl'?'/hasl/':'/'));
   await editor.waitForFunction(()=>articleBackupReady);
   const id='export-parity-'+brand+'-'+Date.now();ids.push([id,brand]);
   await editor.evaluate(({id,fixture})=>{currentId=id;lockedId=true;document.querySelector('#filename').value=id;document.querySelector('#page-title').value='Проверка экспорта';setArticleSaveDocument();setBody(fixture,{normalize:false});changed();},{id,fixture});
   const previewHTML=await editor.evaluate(()=>previewDocument());
   await editor.evaluate(()=>save());
   await editor.locator('#status').filter({hasText:'Сохранено'}).waitFor();
   const response=await context.request.get(`${base}/api/export/${id}?brand=${brand}&site=ru&format=html`);
   assert.equal(response.status(),200);
   const exportHTML=await response.text();
   assert.doesNotMatch(exportHTML,/class="om-toc"/);
   assert.match(exportHTML,/<head>[\s\S]*<style>/);
   assert.ok((exportHTML.match(/style="/g)||[]).length>10,'CMS export must inline article styles');
   const cmsHTML=await editor.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'+doc.querySelector('article.om-guide').outerHTML+'</body></html>';
   },exportHTML);
   for(const width of [320,375,900]){
    const values={};
    for(const [kind,html] of [['preview',previewHTML],['export',exportHTML],['cms',cmsHTML]]){
     const output=await context.newPage();
     await output.setViewportSize({width,height:900});
     await output.route('https://fonts.googleapis.com/**',route=>route.abort());
     await output.setContent(html,{waitUntil:'domcontentloaded'});
     values[kind]=await metrics(output);await output.close();
    }
    if(brand==='outmax'){
     assert.deepEqual(values.export,values.preview,`${brand} ${width}px export differs from preview`);
     assert.deepEqual(values.cms,values.preview,`${brand} ${width}px CMS body differs from preview`);
    }else{
     const stable=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='table').map(([key,item])=>[key,typeof item==='object'?Object.fromEntries(Object.entries(item).filter(([name])=>name!=='height')):item]));
     assert.deepEqual(stable(values.export),stable(values.preview),`${brand} ${width}px stable export metrics differ from preview`);
     assert.deepEqual(stable(values.cms),stable(values.preview),`${brand} ${width}px stable CMS metrics differ from preview`);
    }
    assert.equal(values.export.overflow,false,`${brand} ${width}px overflows`);
   }
   await editor.close();
  }
  console.log('Article export matches preview at 320, 375 and 900 px for OUTMAX and HASL: OK');
 }finally{
  for(const [id,brand] of ids)await context.request.delete(`${base}/api/draft/${id}?brand=${brand}`).catch(()=>{});
  await browser.close();
 }
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1});
