// Real HTML download and site ZIP on the isolated demonstration server only.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878',folder=path.resolve(process.argv[2]||'output/playwright/schema-external-20261024/before');
 assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);await fs.mkdir(folder,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});
  const page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/site-builder/hasl/');await page.locator('#site-block-select').waitFor();
  await page.locator('[data-tab=pages]').click();await page.locator('[data-new-reference]').click();await page.waitForURL(/\?page=/);
  await page.evaluate(()=>SiteBuilder.save());const id=new URL(page.url()).searchParams.get('page');
  await page.locator('[data-tab=export]').click();const waiting=page.waitForEvent('download');await page.locator('#download-html').click();await(await waiting).saveAs(path.join(folder,'export.html'));
  const data=await page.evaluate(async id=>{const blob=await SiteDesigner.buildSiteBundle([id]);return Array.from(new Uint8Array(await blob.arrayBuffer()));},id);await fs.writeFile(path.join(folder,'site.zip'),Buffer.from(data));
  const JSZip=require('../vendor/jszip.min.js'),zip=await JSZip.loadAsync(Buffer.from(data)),files=[];
  for(const entry of Object.values(zip.files)){if(entry.dir||!entry.name.endsWith('.html'))continue;const target=path.join(folder,'zip',entry.name);await fs.mkdir(path.dirname(target),{recursive:true});const html=await entry.async('string');await fs.writeFile(target,html);files.push(entry.name);}
  const html=await fs.readFile(path.join(folder,'export.html'),'utf8');assert.ok(html.includes('application/ld+json'));assert.ok(!html.includes('wiki-local-demo-only'));
  const edge=await page.evaluate(()=>{const doc=document.getElementById('desktop').contentDocument,price=doc.querySelector('.product .feed-price'),section=state.layout.find(s=>s.id===price.closest('[data-site-block]').dataset.siteBlock);((section.objects||={})[price.dataset.siteObject]||={}).deleted=true;return exported();});await fs.writeFile(path.join(folder,'removed-price.html'),edge);
  await page.screenshot({path:path.join(folder,'export-ui.png')});console.log(JSON.stringify({folder,files,bytes:html.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
