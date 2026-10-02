const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const creds=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base='http://127.0.0.1:8877';let browser;
function mockNotiSend(page){
  page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:true,smtpConfigured:true,subscriberAvailable:123456}}));
  page.route('**/editor-api/notisend/lists',r=>r.fulfill({json:{items:[{id:1,title:'Основная база OUTMAX'}]}}));
  page.route('**/editor-api/notisend/campaigns?*',r=>r.fulfill({json:{totalCount:0,items:[]}}));
}
(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await adminContext.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const users=await (await adminContext.request.get(base+'/editor-api/users')).json();
  const editor=users.find(u=>u.role==='editor');assert.ok(editor);
  const editorContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await editorContext.request.post(base+'/login',{form:{login:editor.login,password:editor.password}});
  const editorPage=await editorContext.newPage();const errors=[];editorPage.on('pageerror',e=>errors.push(e.message));mockNotiSend(editorPage);
  const id='stage3-'+Date.now();await editorPage.goto(base+'/email/');
  await editorPage.locator('#filename').fill(id);await editorPage.locator('#subject').fill('Согласование Stage 3');
  await editorPage.getByRole('button',{name:'Сохранить',exact:true}).click();
  await editorPage.locator('#email-project-status').filter({hasText:'Сохранено'}).waitFor();
  await editorPage.getByRole('button',{name:'Ссылка',exact:true}).click();
  await editorPage.locator('#email-share-dialog[open]').waitFor();const preview=await editorPage.locator('#email-preview-link').inputValue();
  assert.ok(preview.includes('/preview/'));await editorPage.screenshot({path:path.join(root,'release/ui-check/screens/email-stage3-share.png')});
  const anonymous=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const publicPage=await anonymous.newPage();publicPage.on('pageerror',e=>errors.push(e.message));await publicPage.goto(preview);
  await publicPage.getByRole('button',{name:'Телефон'}).click();await publicPage.waitForTimeout(250);assert.ok((await publicPage.locator('iframe').boundingBox()).width<=390);
  const frame=publicPage.frameLocator('iframe');await frame.getByText('Главная новость OUTMAX').waitFor();await frame.getByText('Отписаться от рассылки').waitFor();
  await publicPage.screenshot({path:path.join(root,'release/ui-check/screens/email-stage3-public-mobile.png')});
  await editorPage.locator('#email-share-close').click();await editorPage.getByRole('button',{name:'На проверку',exact:true}).click();
  await editorPage.locator('#email-workflow-state').filter({hasText:'На проверке'}).waitFor();

  const adminPage=await adminContext.newPage();adminPage.on('pageerror',e=>errors.push(e.message));mockNotiSend(adminPage);await adminPage.goto(base+'/email/');
  await adminPage.getByRole('button',{name:'Проекты',exact:true}).click();await adminPage.locator('#email-review-tab').waitFor();
  await adminPage.locator('#email-review-tab').click();const card=adminPage.locator('.email-review-card').filter({hasText:'Согласование Stage 3'});await card.waitFor();
  assert.ok((await card.textContent()).includes(editor.name));await card.locator('.email-review-comment').fill('Макет согласован');
  await card.getByRole('button',{name:'Одобрить'}).click();await adminPage.getByText('Рассылка одобрена').waitFor();
  await adminPage.screenshot({path:path.join(root,'release/ui-check/screens/email-stage3-review.png')});
  const saved=await (await editorContext.request.get(base+'/editor-api/email-projects/'+id)).json();assert.equal(saved.workflowStatus,'approved');assert.equal(saved.reviewComment,'Макет согласован');
  const previewResponse=await anonymous.request.get(preview);assert.equal(previewResponse.status(),200);
  await editorContext.request.delete(base+'/editor-api/email-projects/'+id);
  assert.equal((await anonymous.request.get(preview)).status(),404);
  assert.deepEqual(errors,[]);
  console.log('Email Stage 3: public desktop/mobile preview, workflow roles, approval and system footer: OK');
  await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
