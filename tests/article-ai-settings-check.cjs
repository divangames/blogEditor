// Demonstration settings only; provider endpoint is intercepted before submission.
const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:375,height:900}}),base='http://127.0.0.1:8878';
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__EDITOR_PROFILE__?.admin);
  await page.evaluate(()=>{setBody('<p id="settings-source">Демонстрационный текст</p>');resetArticleEditorHistory();const node=document.getElementById('settings-source').firstChild,r=document.createRange();r.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(r);lastRange=r;});
  await page.locator('#article-proposal-open').click();await page.locator('#article-ai-settings').click();
  await page.locator('#article-ai-model').fill('test-model');await page.locator('#article-ai-key').fill('sk-qa-only-not-a-real-key');
  await page.locator('#article-ai-save').click();await page.locator('#article-ai-settings-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#article-ai-key').inputValue(),'');assert.equal(await page.locator('#article-proposal-generate').isEnabled(),true);
  const status=(await context.request.get(base+'/api/article-assist/status'));assert.doesNotMatch(await status.text(),/sk-qa-only/);
  await page.route('**/article-assist/propose*',r=>r.fulfill({json:{text:'Предложенный текст'}}));
  await page.locator('#article-proposal-generate').click();await page.waitForFunction(()=>document.getElementById('article-proposal-text').value==='Предложенный текст');
  assert.equal(await page.locator('#settings-source').textContent(),'Демонстрационный текст');
  await page.locator('#article-ai-settings').click();await page.locator('#article-ai-clear').click();await page.locator('#article-ai-settings-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#article-proposal-generate').isDisabled(),true);
  console.log('PASS: admin settings UI, mobile, encrypted save status, key cleared/not returned, mocked proposal and disconnect; no paid calls');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
