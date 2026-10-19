// Production smoke: demo archive responses; all server mutations blocked after login.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base='https://news.outmax-office.ru';
 const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:credentials.user,password:credentials.password,origin:base},viewport:{width:1440,height:1000}});
  assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());
  const me=await (await context.request.get(base+'/editor-api/me')).json();
  let items=[],copies=0;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base)return route.abort();
   if(url.pathname.endsWith('/archive-users'))return route.fulfill({json:[{...me,name:'Демонстрационный аккаунт',articleCount:1}]});
   if(url.pathname.endsWith('/archive/'+me.id))return route.fulfill({json:items});
   if(url.pathname.includes('/article/')&&url.pathname.endsWith('/copy')){
    copies++;const copy={...items[0],id:'live-demo-copy',title:'Демонстрационная статья — копия'};items=[copy,...items];
    return route.fulfill({json:{id:copy.id,brand:copy.brand}});
   }
   if(!['GET','HEAD'].includes(request.method()))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();
  for(const brand of ['outmax','hasl']){
   items=[{id:'live-demo',brand,title:'Демонстрационная статья',preview:'Проверка кнопки копирования',createdAt:'2026-10-19T12:00:00+07:00',savedAt:'2026-10-19T12:00:00+07:00'}];
   await page.goto(base+(brand==='hasl'?'/hasl/':'/')+'?view=articles',{waitUntil:'domcontentloaded'});
   const copy=page.getByRole('button',{name:'Скопировать статью',exact:true});await copy.waitFor();
   await copy.click();await page.locator('.archive-card strong').filter({hasText:'— копия'}).waitFor();
   assert.equal(await page.locator('.action-copy').count(),2);
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok((await page.locator('.action-copy').first().boundingBox()).width>=44);
   await page.setViewportSize({width:1440,height:1000});
  }
  assert.equal(copies,2);
  await page.goto(base+'/instructions/#article-copy');await page.getByRole('heading',{name:'Как сделать копию статьи',exact:true}).waitFor();
  console.log('PASS live: both brands, duplicate icon/action with demo responses, mobile 390 px, guide. Production writes blocked.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
