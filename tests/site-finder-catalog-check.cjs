const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage(),out=await context.newPage(),errors=[];assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const brands=require('../site-builder/finder-brands-seed.json').brands,seed=require('../site-builder/catalog-seed.json').products;
 for(const page of [p,out]){page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());}
 await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:9000,finderBrands:brands}}));
 await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const htmls=await p.evaluate(()=>{const s=structuredClone(state),d=new DOMParser().parseFromString(R.build(state,products,content,{clean:true}),'text/html'),id=d.querySelector('.finder-form').closest('[data-site-block]').dataset.siteBlock;s.layout=SiteBuilder.layout().filter(b=>b.id===id);return [false,true].flatMap(fragment=>['hasl','hasle'].map(site=>R.build(s,products,content,{site,fragment,clean:true})));});
 for(const [i,html] of htmls.entries())for(const width of [320,390,430,1440]){
  await out.setViewportSize({width,height:1000});await out.setContent(html);
  const picker=out.locator('.brand-picker'),summary=picker.locator('summary'),season=out.locator('[id*="fUse"]');
  const a=await summary.boundingBox(),b=await season.boundingBox();assert.ok(Math.abs(a.y-b.y)<1&&Math.abs(a.height-b.height)<1,'aligned controls '+width);
  const typography=await out.locator('[id*="fUse"],.brand-picker summary').evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return [s.fontSize,s.lineHeight,s.paddingTop,s.borderBottomWidth]}));assert.deepEqual(typography[0],typography[1]);
  if(capture&&i===0&&[390,1440].includes(width))await out.locator('.finder-form').screenshot({path:'instructions/screens/site-finder-aligned-'+(width===390?'phone':'desktop')+'.png'});
  await summary.click();assert.equal(await picker.locator('.brand-grid input').count(),brands.length);
  const scroll=picker.locator('.brand-scroll');assert.equal(await scroll.evaluate(n=>n.scrollHeight>n.clientHeight&&n.clientHeight<=241),true);
  const search=picker.getByRole('searchbox',{name:'Поиск бренда'});await search.fill('eCcO');assert.equal(await picker.locator('.brand-grid label:not([hidden])').count(),1);await picker.getByRole('checkbox',{name:'Ecco',exact:true}).check();
  await search.fill('saucony');await picker.getByRole('checkbox',{name:'Saucony',exact:true}).check();assert.equal(new URL(await out.locator('[id*="finderBtn"]').getAttribute('href')).searchParams.get('manufacturers').split('-').length,2);
  await search.fill('нет-такого-бренда');assert.equal(await picker.locator('.brand-empty').isVisible(),true);assert.equal(await picker.locator('input[type=checkbox]:checked').count(),2);
  await search.fill('');assert.equal(await picker.locator('.brand-empty').isVisible(),false);assert.equal(await picker.locator('.brand-grid label:not([hidden])').count(),brands.length);
  if(capture&&i===0&&[390,1440].includes(width)){await search.fill('Sau');await out.screenshot({path:'instructions/screens/site-finder-search-'+(width===390?'phone':'desktop')+'.png',fullPage:true});}
  await search.fill('');await scroll.evaluate(n=>n.scrollTop=n.scrollHeight);assert.ok(await scroll.evaluate(n=>n.scrollTop)>0);
  if(capture&&i===0&&width===390){await scroll.evaluate(n=>n.scrollTop=0);await out.screenshot({path:'instructions/screens/site-finder-scroll-phone.png',fullPage:true});}
  await out.keyboard.press('Escape');assert.equal(await picker.evaluate(n=>n.open),false);await summary.click();assert.equal(await search.inputValue(),'');assert.equal(await out.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 const f=p.frameLocator('#desktop');await f.locator('.brand-picker summary').click();const query=f.getByRole('searchbox',{name:'Поиск бренда'});await query.fill('Ecco');await f.getByRole('checkbox',{name:'Ecco',exact:true}).check();await query.press('Backspace');assert.equal(await f.locator('.brand-picker').count(),1,'search does not delete an editor object');
 assert.deepEqual(errors,[]);await p.close();await out.close();console.log('PASS full-feed shoe brands, search/empty/reset/selection, bounded scrolling, matched mobile geometry and typography, both shops HTML/CMS, editor input');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8880';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
