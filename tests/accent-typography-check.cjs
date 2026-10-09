const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8877',creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
let browser;
async function select(page,selector){await page.evaluate(selector=>{const node=document.querySelector(selector);const range=document.createRange();range.selectNodeContents(node);document.querySelector('#canvas').focus();getSelection().removeAllRanges();getSelection().addRange(range);},selector);}
async function fontFields(page){
 await select(page,'#styled-text');assert.equal(await page.locator('#font-family').count(),0);
 await page.locator('#font-size').fill('19.5');await page.locator('#font-size').press('Enter');
 const size=await page.locator('#styled-text').evaluate(n=>{const text=document.createTreeWalker(n,NodeFilter.SHOW_TEXT).nextNode();return getComputedStyle(text.parentElement).fontSize;});
 assert.equal(size,'19.5px');assert.equal(await page.evaluate(()=>getSelection().toString()),'Текст акцента');
}
async function accentFields(page,prefix){
 await page.locator('#'+prefix+'-style').selectOption('frame');
 await page.locator('#'+prefix+'-line').evaluate(node=>{node.value='#155fef';node.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#'+prefix+'-fill').evaluate(node=>{node.value='#ff0000';node.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#'+prefix+'-opacity').fill('25');await page.locator('#'+prefix+'-opacity').press('Tab');
 const style=await page.locator('#styled-accent').evaluate(n=>{const css=getComputedStyle(n);return {line:css.borderTopColor,bg:css.backgroundColor,width:css.borderTopWidth};});
 assert.equal(style.line,'rgb(21, 95, 239)');assert.equal(style.bg,'rgb(255, 191, 191)');assert.equal(style.width,'2px');
}
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:1000}});
 await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});fs.mkdirSync('release/ui-check/screens',{recursive:true});
 for(const route of ['/','/hasl/','/email/']){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+route);await page.locator('#font-size').waitFor();
  const email=route==='/email/';
  if(email)await page.evaluate(()=>{canvas.innerHTML='<blockquote id="styled-accent" class="email-info-block"><p id="styled-text">Текст акцента</p></blockquote><p id="other-text">Не менять</p>';selectBlock(null);resetEmailEditorHistory();});
  else{await page.waitForFunction(()=>articleBackupReady);await page.evaluate(()=>{setBody('<header><h1>Заголовок статьи</h1></header><aside id="styled-accent" class="om-callout"><p class="om-callout-title">Акцент</p><p id="styled-text">Текст акцента</p></aside><p id="other-text">Не менять</p>');setArticleSaveDocument();resetArticleEditorHistory();});}
  const originalOther=await page.locator('#other-text').evaluate(n=>({font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize}));
  await fontFields(page);
  assert.deepEqual(await page.locator('#other-text').evaluate(n=>({font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize})),originalOther);
  await page.locator('#styled-text').click();
  if(!email)await page.evaluate(()=>selectNode(document.querySelector('#styled-accent')));
  await page.locator(email?'#email-accent-controls':'#accent-controls').waitFor({state:'visible'});
  await accentFields(page,email?'email-accent':'accent');
  const exported=await page.evaluate(email=>email ? emailBlock('hasl_ru') : adminBody(),email);
  assert.ok(exported.includes('19.5px'));assert.ok(exported.includes('rgb(255, 191, 191)'));assert.ok(exported.includes('rgb(21, 95, 239)'));
  if(email)assert.ok(exported.includes('email-info-block--custom'));
  if(!email){const saved=await page.evaluate(()=>encodedBody());await page.evaluate(body=>setBody(body,{normalize:false}),saved);await page.evaluate(()=>selectNode(document.querySelector('#styled-accent')));assert.equal(await page.locator('#accent-opacity').inputValue(),'25');}
  await page.screenshot({path:'release/ui-check/screens/styling-'+(email?'email':route==='/hasl/'?'hasl':'outmax')+'.png'});
  await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow: '+route);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('All editors: font picker removed, custom size, selection retained, accent border/fill/opacity, export, reopen and mobile: OK');await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
