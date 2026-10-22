const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async(context,base,{capture=false}={})=>{
 const editor=await context.newPage();await editor.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await editor.goto(base+'/site-builder/hasl/');await editor.locator('#site-block-select').waitFor();await editor.frameLocator('#desktop').locator('[contenteditable]').first().waitFor();
 const generated=await editor.evaluate(()=>exported()),sources=[['export',generated]];
 if(fs.existsSync('output/hasl-homepage-responsive.html'))sources.push(['attached-copy',fs.readFileSync('output/hasl-homepage-responsive.html','utf8')]);
 const page=await context.newPage();await page.route('**/*',r=>r.abort());
 for(const [name,html] of sources)for(const width of [320,360,390,414,768,1440,1920]){
  await page.setViewportSize({width,height:900});await page.setContent(html,{waitUntil:'domcontentloaded'});
  // Reproduce the store's global selectors after the export's own CSS.
  await page.addStyleTag({content:'main{padding:64px 12px 92px} .container{padding:0 10px}'});
  const actual=await page.evaluate(()=>{const root=document.querySelector('.hasl-home-embed'),main=root.querySelector(':scope>main'),finder=root.querySelector('section[id^="hasl-embed-finder"]'),container=finder.querySelector('.container');return {viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,mainPadding:getComputedStyle(main).padding,rootWidth:root.getBoundingClientRect().width,sectionWidth:finder.getBoundingClientRect().width,gutter:container.getBoundingClientRect().x-finder.getBoundingClientRect().x,containerPadding:getComputedStyle(container).padding,heroWidth:root.querySelector('.hero>.container').getBoundingClientRect().width,communityWidth:root.querySelector('.community').getBoundingClientRect().width};});
  assert.equal(actual.mainPadding,'0px',name+width);assert.equal(actual.containerPadding,'0px');assert.equal(actual.scroll,actual.viewport,name+' overflow at '+width);assert.equal(actual.sectionWidth,actual.rootWidth);
  if(width<=700){assert.equal(actual.gutter,16);assert.equal(actual.heroWidth,actual.rootWidth);assert.equal(actual.communityWidth,actual.rootWidth);}
  if(capture&&name==='export'&&width===390){await page.locator('section[id^="hasl-embed-finder"]').screenshot({path:'instructions/screens/site-embed-mobile.png'});}
  if(width===390){await page.locator('.finder-gender').selectOption('zhenskie');assert.equal(await page.locator('.size-choice:not([hidden]) input').count(),7);const q=page.locator('.faq-q').first(),title=await q.locator('span').first().textContent();await q.click();assert.equal(await q.getAttribute('aria-expanded'),'true');assert.equal(await q.locator('span').first().textContent(),title);}
 }
 await page.close();await editor.close();console.log('PASS embedded layout: export and corrected attachment, hostile CMS main/container rules, no overflow at 320/360/390/414/768/1440/1920, full-width backgrounds and 16px text gutters; finder/FAQ preserved');
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:false});try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});}
