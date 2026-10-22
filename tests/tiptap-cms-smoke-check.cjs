const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function check(context,base){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 try{for(const brand of ['outmax','hasl']){
  await page.goto(base+'/tiptap/?brand='+brand,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
  const before=await page.evaluate(()=>window.prototypeHTML());
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#cms-html').click()]);
  const html=fs.readFileSync(await download.path(),'utf8');
  const proof=await page.evaluate(({html,before})=>{const parse=value=>{const doc=new DOMParser().parseFromString(value,'text/html');doc.querySelectorAll('style,script').forEach(n=>n.remove());return doc.body;},normalize=text=>text.replace(/\s+/gu,' ').trim(),original=parse(before),exported=parse(html);return {text:normalize(exported.textContent),sample:normalize(original.querySelector('p')?.textContent||'')};},{html,before});
  assert.ok(proof.text.length>1000,'export contains article text');assert.ok(proof.sample.length>0&&proof.text.includes(proof.sample),'representative source paragraph survives');
  assert.equal(await page.evaluate(()=>window.prototypeHTML()),before);console.log('PASS Tiptap CMS real download, source unchanged '+brand);
 }assert.deepEqual(errors,[]);}finally{await page.close();}
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext(),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
