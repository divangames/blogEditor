const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});
  for(const [label,hash] of [['Инструкция',''],['Разработчики','#developers']]){
   await page.goto(base+'/');await page.locator('aside nav a').filter({hasText:label}).click({noWaitAfter:true});
   await page.waitForURL(u=>u.pathname==='/instructions/'&&u.search==='?from=home'&&u.hash===hash,{waitUntil:'domcontentloaded'});
   await page.locator('.wiki-home-back').waitFor();assert.equal(await page.locator('.wiki-home-back svg[data-phosphor=house]').count(),1);assert.equal(await page.locator('.editor-switcher,.account-menu,[data-profile-location]').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(hash)await page.getByRole('heading',{name:'Разработчики и инструменты',exact:true}).waitFor();
   if(capture){assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);await page.screenshot({path:'instructions/screens/'+(hash?'developers-home':'instructions-home')+'-'+(width===390?'phone':'desktop')+'.png'});}
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.wiki-home-back').waitFor();assert.equal(await page.locator('.editor-switcher,.account-menu').count(),0);
   await page.locator('#wiki-search').fill('возврат на главную');const result=page.locator('.wiki-result[href="#workspace-home"]');await result.waitFor();await result.click();assert.equal(new URL(page.url()).search,'?from=home');
   await page.locator('.wiki-home-back').click({noWaitAfter:true});await page.waitForURL(base+'/',{waitUntil:'domcontentloaded'});await page.locator('#tools').waitFor();
  }
 }
 // A separate editor visit keeps its normal menu, without inheriting the home flag.
 await page.goto(base+'/instructions/#developers');await page.locator('.editor-switcher').waitFor();await page.locator('#wiki-account-menu:not([hidden])').waitFor();assert.equal(await page.locator('.wiki-home-back').count(),0);
 assert.deepEqual(errors,[]);await page.close();console.log('PASS home instructions/developers: own return link, no editor menus, search/hash/F5 preserve context, desktop/phone, separate editor context unchanged');
};
if(require.main===module){const {chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8946';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});}
