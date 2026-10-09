const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
async function main(){const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.route('https://**/*',r=>r.abort());await page.goto('http://127.0.0.1:8878');await page.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
 fs.mkdirSync('release/tiptap-prototype/ui-polish',{recursive:true});
 for(const width of [1440,1280,768,375]){await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const ui=await page.locator('#json').evaluate(n=>({font:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height}));assert.ok(ui.height>=(width===375?44:38));assert.equal(ui.font,width===375?'16px':'13px');await page.screenshot({path:`release/tiptap-prototype/ui-polish/main-${width}.png`});}
 const key=await page.locator('#block-select optgroup[label="Товары"] option').first().getAttribute('value');await page.locator('#block-select').selectOption(key);await page.locator('#block-product-padding').focus();assert.ok(await page.locator('#block-product-padding').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));assert.ok(await page.locator('#block-inspector').evaluate(n=>n.getBoundingClientRect().top>=0));await page.screenshot({path:'release/tiptap-prototype/ui-polish/panel-mobile.png'});
 await page.locator('#compare').click();assert.equal(await page.locator('#compare').getAttribute('aria-pressed'),'true');await page.locator('#compare').click();assert.equal(await page.locator('#compare').getAttribute('aria-pressed'),'false');
 assert.deepEqual(errors,[]);console.log('PASS: UI 1440/1280/768/375, controls, focus, inspector and original-view state.');
}finally{await browser.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
