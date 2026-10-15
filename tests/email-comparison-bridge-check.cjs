// Isolated demonstration data: split article comparison -> mail-safe cards.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
const picture=i=>`https://example.com/demo-photo-${i}.png`;
const row=(i,legacy=false)=>`<tr><td class="om-comparison-thumb-column"><img class="om-model-thumb" src="${picture(i)}" alt="Фото модели ${i}" style="width:52px;height:52px"></td><td class="om-comparison-model-column"><span class="om-model-cell">${legacy?`<img class="om-model-thumb" src="${picture(i)}" alt="Фото модели ${i}">`:''}<a href="https://example.com/product-${i}">Демонстрационная модель ${i}</a></span></td><td>${i} 990 ₽</td><td>Кожа и текстиль</td></tr>`;
const fixture=legacy=>'<div class="om-table-scroll"><table class="om-comparison-table"><thead><tr><th class="om-comparison-thumb-column">Модель</th><th class="om-comparison-model-column">Наименование</th><th>Цена</th><th>Материалы</th></tr></thead><tbody>'+row(1,legacy)+row(2,legacy)+'</tbody></table></div>';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  const page=await context.newPage();await page.goto(base+(process.env.EMAIL_BRIDGE_PATH||'/email/'));await page.locator('#canvas').waitFor();
  for(const legacy of [false,true]){
   const transformed=await page.evaluate(html=>{const host=document.createElement('div');host.innerHTML=html;renderEmailComparisons(host);return host.innerHTML;},fixture(legacy));
   const values=await page.evaluate(html=>{const host=document.createElement('div');host.innerHTML=html;return [...host.querySelectorAll('.email-comparison-card')].map(card=>({photos:[...card.querySelectorAll('img')].map(i=>({src:i.getAttribute('src'),alt:i.alt})),link:card.querySelector('a').getAttribute('href'),text:card.textContent}));},transformed);
   assert.equal(values.length,2);values.forEach((v,i)=>{assert.deepEqual(v.photos,[{src:picture(i+1),alt:`Фото модели ${i+1}`}]);assert.equal(v.link,`https://example.com/product-${i+1}`);assert.ok(v.text.includes(`${i+1} 990 ₽`)&&v.text.includes('Кожа и текстиль'));});
   assert.equal(await page.evaluate(html=>{const host=document.createElement('div');host.innerHTML=html;renderEmailComparisons(host);return host.innerHTML;},transformed),transformed,'conversion is idempotent');
  }
  for(const site of ['outmax_ru','outmax_com','hasl_ru','hasle_com']){
   const result=await page.evaluate(({html,site})=>{canvas.innerHTML=html;window.emailImportState={css:'',root:{tag:'article',className:'om-guide',id:'',style:''}};const before=canvas.innerHTML,doc=new DOMParser().parseFromString(emailDocument(site),'text/html');return {photos:[...doc.querySelectorAll('img')].map(i=>i.getAttribute('src')).filter(src=>src.startsWith('https://example.com/demo-photo-')),unchanged:before===canvas.innerHTML,scriptCount:doc.querySelectorAll('script').length,unsubscribe:doc.documentElement.outerHTML.includes('[%unsubscribe_link%]')};},{html:fixture(false),site});
   assert.deepEqual(result.photos,[picture(1),picture(2)],site+' export keeps selected photos');assert.equal(result.unchanged,true);assert.equal(result.scriptCount,0);assert.equal(result.unsubscribe,true);
  }
  console.log('PASS: split and legacy comparison preserve one selected photo, alt, name, price, properties and link in email cards; idempotent; no sends');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
