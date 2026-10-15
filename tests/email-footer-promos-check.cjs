const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878',entry=process.env.EMAIL_PROMOS_ENTRY||'/email/';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const brand of ['outmax','hasl']){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  if(process.env.EMAIL_PROMOS_BLOCK_ASSET)await page.route('**/email-renderer.js*',r=>r.abort());
  await page.goto(base+entry);await page.locator('#new-email-project').waitFor();
  await page.evaluate(brand=>{activeSite=brand+'_ru';const c=emailChromeSettings();c.promos[0].url='/promo-retained';c.promos[0].image='https://example.invalid/promo-hidden.png';storeEmailChromeSettings(c);renderEmailChromeSettings(true);refresh();resetEmailEditorHistory();},brand);
  await page.locator('#email-chrome-settings > summary').click();await page.locator('#email-chrome-settings details > summary').filter({hasText:'Подвал'}).click();
  const toggle=page.locator('[data-chrome-field=showPromos]');assert.equal(await toggle.isChecked(),true);
  await page.waitForFunction(()=>document.querySelectorAll('#email-editor-footer .outmax-promo-cell').length===2);assert.equal(await page.locator('#email-editor-footer .outmax-promo-cell').count(),2);
  await toggle.uncheck();await page.waitForFunction(()=>!document.querySelector('#email-editor-footer .outmax-promo-cell'));assert.equal(await page.locator('#email-editor-footer .outmax-promo-cell').count(),0);
  assert.equal(await page.locator('[data-chrome-promos]').isVisible(),false);
  assert.equal(await page.evaluate(()=>emailEditorHistory.length),2);
  await page.evaluate(()=>undoEmailEditor());await page.waitForFunction(()=>document.querySelector('[data-chrome-field="showPromos"]').checked);assert.equal(await toggle.isChecked(),true);assert.equal(await page.locator('#email-editor-footer .outmax-promo-cell').count(),2);
  await page.evaluate(()=>redoEmailEditor());await page.waitForFunction(()=>!document.querySelector('[data-chrome-field="showPromos"]').checked);assert.equal(await toggle.isChecked(),false);
  for(const suffix of ['ru','com']){
   const html=await page.evaluate(site=>emailDocument(site),brand+'_'+suffix);
   assert.doesNotMatch(html,/<td class="outmax-promo-cell"/);assert.doesNotMatch(html,/promo-retained|promo-hidden\.png/);
   assert.match(html,/\[%unsubscribe_link%\]/);assert.match(html,/href="tel:/);assert.match(html,/class="outmax-social-link"/);
  }
  for(const frame of ['desktop-preview','mobile-preview'])await page.frameLocator('#'+frame).locator('a[href="[%unsubscribe_link%]"]').waitFor();
  assert.equal(await page.frameLocator('#mobile-preview').locator('.outmax-promo-cell').count(),0);
  const name='promo-toggle-'+brand+'-'+Date.now();await page.locator('#filename').fill(name);await page.locator('#save-email-project').click();
  await page.locator('#email-project-status').filter({hasText:'Сохранено'}).waitFor();
  const id=await page.evaluate(()=>emailReviewBridge.currentId());const saved=await(await ctx.request.get(base+'/editor-api/email-projects/'+id)).json();
  assert.equal(saved.importState.chrome.showPromos,false);assert.equal(saved.importState.chrome.promos[0].url,'/promo-retained');
  await page.reload();await page.waitForFunction(id=>window.emailReviewBridge?.currentId()===id,id);
  await page.waitForFunction(()=>emailChromeSettings().showPromos===false&&!document.querySelector('#email-editor-footer .outmax-promo-cell'));
  assert.equal(await page.locator('#email-editor-footer .outmax-promo-cell').count(),0);
  await page.evaluate(()=>{document.querySelector('#email-chrome-settings').open=true;document.querySelectorAll('#email-chrome-settings details').forEach(n=>n.open=true);});
  await toggle.check();await page.waitForFunction(()=>document.querySelectorAll('#email-editor-footer .outmax-promo-cell').length===2);assert.equal(await page.locator('#email-editor-footer .outmax-promo-cell').count(),2);
  assert.equal(await page.locator('[data-chrome-field="promos.0.url"]').inputValue(),'/promo-retained');
  await page.evaluate(()=>{const other=activeSite.startsWith('hasl')?'outmax_ru':'hasl_ru';activeSite=other;refresh();});
  assert.equal(await toggle.isChecked(),true);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);await page.close();await ctx.request.delete(base+'/editor-api/email-projects/'+id);await ctx.close();
  console.log('PASS footer promos '+entry+' '+brand+': default, toggle, undo/redo, export, previews, save/reopen, retained data, mobile');
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
