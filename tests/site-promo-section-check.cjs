const assert=require('node:assert/strict');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage();await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await p.goto(base+'/site-builder/hasl/');await p.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);
 const result=await p.evaluate(()=>{
  const initial=JSON.parse(JSON.stringify(state));SiteBuilder.layout();
  const fresh=JSON.parse(JSON.stringify(state)),promo=fresh.layout.find(b=>b.source==='s11'),hero=fresh.layout.find(b=>b.source==='s0');
  if(!promo)throw Error('No promo section');
  const f=meta.fields.find(f=>f.section==='s11'),image=meta.pictures.find(f=>f.section==='s11');
  const old=JSON.parse(JSON.stringify(fresh));old.layout=old.layout.filter(b=>b.source!=='s11');delete old.promoSectionVersion;
  const h=old.layout.find(b=>b.source==='s0');h.texts={...h.texts,[f.id]:'Акция с сохранённой правкой'};h.objects={...h.objects,['text-'+f.id]:{desktop:{x:12,y:3}}};
  R.upgradeLayout(old);const migrated=old.layout.find(b=>b.source==='s11');
  const again=JSON.stringify(old);R.upgradeLayout(old);if(again!==JSON.stringify(old))throw Error('Migration repeats');
  const doc=new DOMParser().parseFromString(R.build(old,products,content,{site:'hasl'}),'text/html');
  const section=doc.querySelector('[data-site-block="'+migrated.id+'"]');
  const hidden=JSON.parse(JSON.stringify(old));hidden.layout.find(b=>b.source==='s11').visibility='hidden';
  const hiddenDoc=new DOMParser().parseFromString(R.build(hidden,products,content,{site:'hasl',clean:true}),'text/html');
  const removed=JSON.parse(JSON.stringify(old));removed.layout=removed.layout.filter(b=>b.source!=='s11');R.upgradeLayout(removed);
  return {name:promo.name,order:fresh.layout.map(b=>b.source),text:section.textContent,patch:migrated.objects['text-'+f.id],heroCards:doc.querySelector('[data-site-block="'+h.id+'"] .hero-side')!==null,hidden:hiddenDoc.querySelector('[data-site-block="'+migrated.id+'"]')?.dataset.visibility,removed:removed.layout.some(b=>b.source==='s11'),image:image?.id};
 });
 assert.equal(result.name,'Акционный блок');assert.deepEqual(result.order.slice(0,2),['s0','s11']);assert.match(result.text,/Акция с сохранённой правкой/);assert.equal(result.patch.desktop.x,12);assert.equal(result.heroCards,false);assert.ok(result.hidden===undefined||result.hidden==='hidden');assert.equal(result.removed,false);assert.ok(result.image);
 await p.evaluate(()=>{SiteBuilder.layout();updatePreviews();});await p.waitForTimeout(600);
 for(const [device,width] of [['desktop',1440],['phone',390]]){
  const html=await p.evaluate(()=>R.build(state,products,content,{site:'hasl',clean:true}));const out=await context.newPage();await out.setViewportSize({width,height:900});await out.route('**/*',r=>capture&&r.request().resourceType()==='image'?r.continue():r.abort());await out.setContent(html);await out.evaluate(()=>document.fonts.ready);
  assert.equal(await out.locator('.promo-section .side-card').count(),2);assert.equal(await out.locator('.hero .side-card').count(),0);
  await out.locator('.promo-section').scrollIntoViewIfNeeded();await out.locator('.promo-section img').evaluateAll(async imgs=>{for(const img of imgs){img.loading='eager';await img.decode().catch(()=>{});}});await out.waitForTimeout(800);if(capture)await out.locator('.promo-section').screenshot({path:'instructions/screens/site-promo-section-'+device+'.png'});await out.close();
 }
 if(/^http:\/\/127\.0\.0\.1:/.test(base))await p.evaluate(()=>SiteBuilder.save());
 await p.close();console.log('PASS independent promo section, legacy content/object migration, idempotence, deletion, desktop/mobile and save');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8915';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
