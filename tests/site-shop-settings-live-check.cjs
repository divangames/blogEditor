const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('../release/ui-check/node_modules/playwright');
const {click}=require('./studio-test-helpers.cjs');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const base='https://news.outmax-office.ru',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const c=await b.newContext();assert.ok((await c.request.post(base+'/login',{form:{login:creds.user,password:creds.password}})).ok());
 const before=await(await c.request.get(base+'/editor-api/site-builder/projects')).text();
 const page=await c.newPage();await page.route('**/*',r=>r.request().method()==='GET'&&new URL(r.request().url()).origin===base?r.continue():r.abort());
 const seed=require('../site-builder/catalog-seed.json').products;await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:Object.keys(seed).length}}));
 await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();await click(page,'[data-tab=pageSettings]');assert.equal(await page.locator('.site-analytics-settings').count(),2);assert.equal(await page.locator('[data-analytics-key=googleMeasurementId]').count(),2);
 await page.goto(base+'/instructions/#site-button-goals');await page.getByRole('heading',{name:'ХАСЛ: цели кнопок Яндекс и Google',exact:true}).waitFor();
 const anon=await b.newContext(),res=await anon.request.get(base+'/editor-api/public-site-statistics');assert.equal(res.status(),200);const data=await res.json();for(const s of ['hasl','hasle'])for(const key of ['reviews','sneakers'])assert.ok(Number.isInteger(data[s][key].value)&&data[s][key].value>0);
 assert.equal(await(await c.request.get(base+'/editor-api/site-builder/projects')).text(),before);console.log('LIVE_PASS shared settings, published guide, independent real counters, unchanged templates');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
