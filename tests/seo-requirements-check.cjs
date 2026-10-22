const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});let initial,context,last;
 try{
  context=await browser.newContext({viewport:{width:1440,height:1000}});await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});
  initial=await(await context.request.get(base+'/editor-api/seo-requirements')).json();assert.ok(initial.canEdit);assert.match(initial.text,/Research/);
  const page=await context.newPage();await page.route('https://**',r=>r.abort());
  for(const path of ['/','/hasl/','/email/']){
   await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator('#workspace-general-brief').click();
   const text=page.locator('[data-policy-text]');await text.filter({hasText:'Research'}).waitFor();
   const before=await page.evaluate(()=>({html:canvas.innerHTML,index:window.EmailCommands?emailEditorHistoryIndex:articleHistoryIndex}));
   await page.locator('[data-policy-edit]').click();const dialog=page.locator('#seo-requirements-dialog');await dialog.locator('textarea').fill('Общие требования QA <img src=x onerror=alert(1)>');await dialog.getByRole('button',{name:'Сохранить требования'}).click();await dialog.waitFor({state:'hidden'});
   last=await(await context.request.get(base+'/editor-api/seo-requirements')).json();assert.match(last.text,/QA/);assert.equal(await text.locator('img').count(),0);
   assert.deepEqual(await page.evaluate(()=>({html:canvas.innerHTML,index:window.EmailCommands?emailEditorHistoryIndex:articleHistoryIndex})),before);
   assert.doesNotMatch(await page.evaluate(()=>window.EmailCommands?emailDocument(activeSite):previewDocument()),/Общие требования QA/);
   await page.locator('[data-policy-edit]').click();await dialog.locator('textarea').fill('Не терять набранное');const conflict=await context.request.post(base+'/editor-api/seo-requirements',{data:{text:'Изменено другим администратором',expectedRevision:last.revision}});assert.ok(conflict.ok());last=await conflict.json();
   await dialog.getByRole('button',{name:'Сохранить требования'}).click();await dialog.locator('[data-status]').filter({hasText:/измен/}).waitFor();assert.equal(await dialog.locator('textarea').inputValue(),'Не терять набранное');await page.keyboard.press('Escape');
   const restored=await context.request.post(base+'/editor-api/seo-requirements',{data:{text:initial.text,expectedRevision:last.revision}});assert.ok(restored.ok());last=await restored.json();
   await page.setViewportSize({width:320,height:844});await page.locator('[data-policy-edit]').click();assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
   console.log('PASS shared SEO requirements '+path+': real save, CAS, typed text retained, no HTML/history/export changes, mobile');
  }
  await page.route('**/editor-api/seo-requirements',r=>r.fulfill({json:{text:initial.text,revision:initial.revision,canEdit:false}}));await page.reload();await page.locator('#workspace-general-brief').click();await page.locator('[data-policy-text]').filter({hasText:'Research'}).waitFor();assert.equal(await page.locator('[data-policy-edit]').isVisible(),false);console.log('PASS reader UI hides policy editing');
 }finally{if(initial&&context){const now=await(await context.request.get(base+'/editor-api/seo-requirements')).json();if(now.text!==initial.text)await context.request.post(base+'/editor-api/seo-requirements',{data:{text:initial.text,expectedRevision:now.revision}});}await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
