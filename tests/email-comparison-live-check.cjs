// Read-only production smoke. Transform only a detached demo DOM, never the mail canvas.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password,origin:base}});
  await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  for(const path of ['/email/','/OUTMAX.html']){
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+path);await page.waitForFunction(()=>typeof renderEmailComparisons==='function');
   const result=await page.evaluate(()=>{
    const before=canvas.innerHTML,host=document.createElement('div');host.innerHTML='<div class="om-table-scroll"><table class="om-comparison-table"><thead><tr><th class="om-comparison-thumb-column">Модель</th><th class="om-comparison-model-column">Наименование</th><th>Цена</th></tr></thead><tbody><tr><td class="om-comparison-thumb-column"><img class="om-model-thumb" src="https://example.com/demo-photo.png" alt="Демонстрационное фото"></td><td class="om-comparison-model-column"><span class="om-model-cell"><a href="https://example.com/demo-model">Демонстрационная модель</a></span></td><td>4990 ₽</td></tr></tbody></table></div>';
    renderEmailComparisons(host);const card=host.querySelector('.email-comparison-card');return {photoCount:card.querySelectorAll('img').length,src:card.querySelector('img')?.getAttribute('src'),alt:card.querySelector('img')?.alt,link:card.querySelector('a').getAttribute('href'),price:card.textContent.includes('4990 ₽'),unchanged:before===canvas.innerHTML};
   });
   assert.equal(result.photoCount,1);assert.equal(result.src,'https://example.com/demo-photo.png');assert.equal(result.alt,'Демонстрационное фото');assert.equal(result.link,'https://example.com/demo-model');assert.equal(result.price,true);assert.equal(result.unchanged,true);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: production email and standalone entry preserve selected comparison photo/data; original canvas unchanged; no saves/sends');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
