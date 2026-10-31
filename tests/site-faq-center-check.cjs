const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage();await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const html=await p.evaluate(()=>R.build(state,products,content,{site:'hasl',clean:true}));
 for(const width of [1440,1024,390]){
  const out=await context.newPage();await out.setViewportSize({width,height:1000});await out.route('**/*',r=>r.abort());await out.setContent(html);await out.evaluate(()=>document.fonts.ready);await out.locator('.faq-section').scrollIntoViewIfNeeded();
  for(let count=0;count<=3;count++){
   if(count)await out.locator('.faq-q').nth(count-1).click();await out.waitForTimeout(350);
   const b=await out.locator('.faq-section').evaluate(s=>{const h=s.querySelector('.section-head').getBoundingClientRect(),q=s.querySelector('.faq').getBoundingClientRect();return {delta:Math.abs(h.y+h.height/2-q.y-q.height/2),bottom:h.bottom,top:q.top};});
   if(width>=768)assert.ok(b.delta<2,JSON.stringify({width,count,...b}));else assert.ok(b.bottom<=b.top);
  }
  if(capture&&width!==1024)await out.locator('.faq-section').screenshot({path:'instructions/screens/site-faq-center-'+(width===390?'phone':'desktop')+'.png'});await out.close();
 }
 await p.close();console.log('PASS FAQ heading centered closed/1/2/3 expanded at 1440/1024; mobile heading above questions');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8915';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
