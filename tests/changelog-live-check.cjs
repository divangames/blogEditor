// Read-only production UI check. Every request after login is GET/HEAD only.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')),base='https://news.outmax-office.ru';
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:c.user,password:c.password}});
  await context.request.post(base+'/login',{form:{login:c.user,password:c.password},headers:{Origin:base}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin!==base||!['GET','HEAD','OPTIONS'].includes(r.request().method())?r.abort():r.continue());
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#changelog');
   await page.getByRole('heading',{name:'Ченжлог',exact:true,level:1}).waitFor();
   const dates=await page.locator('[data-change-date]').evaluateAll(ns=>ns.map(n=>n.dataset.changeDate));assert.equal(new Set(dates).size,dates.length);
   assert.equal(await page.locator('[data-change-date="2026-10-24"]').count(),1);
   const expected=await page.evaluate(()=>JSON.parse(document.getElementById('wiki-data').textContent).changes.reduce((n,c)=>n+(c.images||[]).length,0));assert.equal(await page.locator('.wiki-log [data-screenshot]').count(),expected);
   assert.equal(await page.locator('[data-change-date][open]').count(),1);assert.equal(await page.locator('[data-change-date][open]').getAttribute('data-change-date'),[...dates].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1));
   const older=page.locator('[data-change-date]').nth(1);assert.equal(await older.evaluate(n=>n.open),false);await older.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await older.evaluate(n=>n.open),true);assert.equal(await page.locator('[data-change-date][open]').count(),2);await page.keyboard.press('Space');assert.equal(await older.evaluate(n=>n.open),false);
   const image=page.locator('.wiki-log [data-screenshot="site-google-html-final.png"]');const day=image.locator('xpath=ancestor::details[1]');if(!await day.evaluate(n=>n.open))await day.locator('summary').click();await image.focus();await page.keyboard.press('Enter');await page.locator('#screenshot-dialog[open]').waitFor();await page.locator('#screenshot-large').evaluate(n=>n.decode());await page.keyboard.press('Escape');assert.equal(await image.evaluate(n=>n===document.activeElement),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.locator('#wiki-search').fill('скриншоты');assert.ok(await page.locator('.wiki-result').count());await page.locator('#clear-search').click();
  await page.goto(base+'/instructions/#changelog/2026-10-23');assert.equal(await page.locator('[data-change-date][open]').count(),1);assert.equal(await page.locator('[data-change-date][open]').getAttribute('data-change-date'),'2026-10-23');
  await page.goto(base+'/instructions/#recent-updates');await page.getByRole('heading',{name:'Что нового в редакторах',exact:true}).waitFor();assert.equal(await page.locator('.wiki-step-figure').count(),2);
  assert.deepEqual(errors,[]);console.log('LIVE_PASS collapsible dates, latest day open by default, independent keyboard toggle, retained screenshots/zoom, search/deep link, 1440/390/320; no writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
