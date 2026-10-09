const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});fs.mkdirSync('release/ui-check/screens',{recursive:true});
 for(const route of ['/','/hasl/','/email/']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+route);await page.locator('#font-size').waitFor();
  await page.evaluate(()=>{const canvas=document.querySelector('#canvas'),node=canvas.querySelector('h1'),range=document.createRange();range.selectNodeContents(node);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);});
  assert.equal(await page.locator('#font-family').count(),0);await page.locator('#font-size').fill('57.5');
  const control=await page.locator('#font-size').evaluate(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return {height:rect.height,radius:style.borderRadius,border:style.borderTopWidth,size:style.fontSize,family:style.fontFamily,padding:style.paddingLeft};});
  assert.equal(control.height,32);assert.equal(control.radius,'6px');assert.equal(control.border,'1px');assert.equal(control.size,'12px');assert.match(control.family,/Open Sans/);assert.ok(parseFloat(control.padding)>0);
  await page.locator('.toolstrip').screenshot({path:'release/ui-check/screens/toolbar-'+(route==='/email/'?'email':route==='/hasl/'?'hasl':'outmax')+'-desktop.png'});
  if(route!='/email/')assert.ok((await page.locator('#add-comparison').textContent()).includes('Таблица сравнения товаров'));
  await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await page.locator('#font-family').count(),0);assert.ok((await page.locator('#font-size').boundingBox()).height>=44);
  await page.locator('.toolstrip').screenshot({path:'release/ui-check/screens/toolbar-'+(route==='/email/'?'email':route==='/hasl/'?'hasl':'outmax')+'-mobile.png'});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Toolbar polish: font picker removed, size control polished, mobile targets and comparison name: OK');await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
