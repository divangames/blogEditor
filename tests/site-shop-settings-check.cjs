const assert=require('node:assert/strict');
const {click}=require('./studio-test-helpers.cjs');
module.exports=async(context,base,{capture=false}={})=>{
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Demo only');
 const page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const seed=require('../site-builder/catalog-seed.json').products;
 await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:Object.keys(seed).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.frameLocator('#desktop').locator('[contenteditable]').first().waitFor({state:'attached'});
 await click(page,'[data-tab=pageSettings]');
 for(const [site,y,g] of [['hasl','12345678','G-DEMOHASL'],['hasle','87654321','G-DEMOHASLE']]){
  await page.locator(`[data-analytics-site=${site}][data-analytics-key=yandexCounter]`).fill(y);
  await page.locator(`[data-analytics-site=${site}][data-analytics-key=googleMeasurementId]`).fill(g);
 }
 if(capture){await page.locator('#inspector').screenshot({path:'instructions/screens/site-shop-analytics.png'});}
 assert.equal(await page.evaluate(()=>state.analytics.hasle.googleMeasurementId),'G-DEMOHASLE');
 const cfg=await page.evaluate(()=>structuredClone(state.analytics));
 const html=async(site,preview=false,auto=false)=>page.evaluate(({site,preview,auto,cfg})=>{const s=structuredClone(state);s.analytics=structuredClone(cfg);for(const c of Object.values(s.analytics))c.loadScripts=auto;s.layout=[{id:'demo',source:'custom',mode:'grid',elements:[{id:'one',type:'button',text:'Проверить цель',href:'#demo'}]}];const first=new DOMParser().parseFromString(R.build(s,products,content,{site,clean:true,preview}),'text/html');const key=first.querySelector('a[href="#demo"]').dataset.siteObject;s.layout[0].objects={[key]:{goals:{yandexGoal:'choose_pair',googleAction:'choose_pair'}}};return R.build(s,products,content,{site,clean:true,preview});},{site,preview,auto,cfg});
 const out=await context.newPage();let body='';let tracking=0;
 await out.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/qa-shop')return r.fulfill({contentType:'text/html',body});if(/metrika\/tag|gtag\/js/.test(u.href))tracking++;return r.abort();});
 await out.addInitScript(()=>{window.calls=[];window.ym=(...a)=>calls.push(['ym',...a]);window.gtag=(...a)=>calls.push(['gtag',...a]);});
 for(const [site,host,id,g] of [['hasl','example.com',12345678,'G-DEMOHASL'],['hasle','example.com',87654321,'G-DEMOHASLE'],['both','haslestore.com',87654321,'G-DEMOHASLE'],['both','xn--80awro.xn--p1ai',12345678,'G-DEMOHASL']]){
  body=await html(site);await out.goto('https://'+host+'/qa-shop');await out.locator('a[href="#demo"]').click();assert.deepEqual(await out.evaluate(()=>calls),[['ym',id,'reachGoal','choose_pair'],['gtag','event','choose_pair',{event_category:'',send_to:g}]]);
 }
 body=await html('hasl',true,true);await out.goto('https://example.com/qa-shop');await out.locator('a[href="#demo"]').click();assert.deepEqual(await out.evaluate(()=>calls),[]);assert.equal(tracking,0);
 const raw=await context.newPage();await raw.route('**/*',r=>new URL(r.request().url()).pathname==='/qa-shop'?r.fulfill({contentType:'text/html',body}):r.abort());
 body=await html('hasl',false,true);await raw.goto('https://example.com/qa-shop');assert.equal(await raw.locator('script[src*="metrika/tag.js"]').count(),1);assert.equal(await raw.locator('script[src*="gtag/js"]').count(),1);assert.equal(await raw.evaluate(()=>dataLayer[1][1]),'G-DEMOHASL');
 const counts=await page.evaluate(()=>{const s=structuredClone(state);delete s.layout;const data={...content,statistics:{hasl:{sneakers:{value:1111},reviews:{value:2222}},hasle:{sneakers:{value:3333},reviews:{value:4444}}}};return ['hasl','hasle'].map(site=>{const d=new DOMParser().parseFromString(R.build(s,products,data,{site,clean:true,preview:true}),'text/html');return ['assortment','reviews'].map(k=>d.querySelector('.benefit-'+k+' p strong').textContent.replace(/\s/g,''));});});assert.deepEqual(counts,[['1111','2222'],['3333','4444']]);
 await page.setViewportSize({width:390,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(capture)await page.screenshot({path:'instructions/screens/site-shop-analytics-phone.png'});
 await page.goto(base+'/instructions/#site-button-goals');await page.getByRole('heading',{name:'ХАСЛ: цели кнопок Яндекс и Google',exact:true}).waitFor();await page.goto(base+'/instructions/#site-shop-statistics');await page.getByRole('heading',{name:'ХАСЛ и HASLESTORE: реальные числа каталога и отзывов',exact:true}).waitFor();await page.locator('#wiki-search').fill('реальные числа');assert.ok(await page.locator('a[href="#site-shop-statistics"]').count());await page.close();await out.close();await raw.close();console.log('PASS shop analytics: settings, domain isolation, Google routing, preview silence, optional initialization, separate statistics, mobile');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8900';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
