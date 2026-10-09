// Снимает демонстрационные экраны для базы знаний на изолированном сервере.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const base='http://127.0.0.1:8878';
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage();
  await page.route('**/*', route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.route('**/editor-api/notisend/status',route=>route.fulfill({json:{connected:false,api_configured:false,smtp_configured:false}}));
  fs.mkdirSync('instructions/screens',{recursive:true});
  const shot=async name=>page.screenshot({path:'instructions/screens/'+name+'.png'});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#canvas').waitFor();await shot('article-editor');
  await page.locator('.editor-switcher>summary').click();await page.locator('.editor-switcher-menu').waitFor();await shot('navigation');
  await page.goto(base+'/hasl/',{waitUntil:'domcontentloaded'});await page.locator('body.hasl-editor #canvas').waitFor();await shot('hasl-editor');
  await page.goto(base+'/email/',{waitUntil:'domcontentloaded'});
  await page.locator('#email-editor-footer .outmax-email-footer').waitFor();await shot('email-editor');
  await page.locator('#email-chrome-settings>summary').click();await shot('email-settings');
  await page.locator('.editor-tabs [data-view="preview"]').click();
  await page.frameLocator('#mobile-preview').locator('body').waitFor();await shot('email-preview');
  await page.locator('#notisend-open').click();await shot('notisend');
  await page.locator('[data-notisend-tab="history"]').click();await shot('email-archive');
  await page.goto(base+'/tiptap/',{waitUntil:'domcontentloaded'});await page.locator('#editor .tiptap').waitFor();await page.locator('#editor .tiptap p').first().click();await shot('tiptap');
  console.log('Скриншоты сохранены: 9');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
