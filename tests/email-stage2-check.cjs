const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const credentials=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base='http://127.0.0.1:8877';let browser,campaignBody,testBody;
function mockNotiSend(page){
  page.route('**/editor-api/notisend/status',r=>r.fulfill({json:{connected:true,smtpConfigured:true,subscriberAvailable:123456}}));
  page.route('**/editor-api/notisend/lists',r=>r.fulfill({json:{items:[{id:1,title:'Основная база OUTMAX'},{id:2,title:'Длинное название группы ХАСЛ для проверки адаптива'}]}}));
  page.route('**/editor-api/notisend/campaigns?*',r=>r.fulfill({json:{totalCount:0,items:[]}}));
  page.route('**/editor-api/notisend/test',async r=>{testBody=JSON.parse(r.request().postData());await r.fulfill({json:{status:'sent',transport:'smtp'}});});
  page.route('**/editor-api/notisend/campaigns',async r=>{
    if(r.request().method()==='POST'){campaignBody=JSON.parse(r.request().postData());return r.fulfill({json:{id:777,subject:campaignBody.subject,state:'draft',recipientsCount:12345,statistics:{}}});}
    return r.fulfill({json:{totalCount:0,items:[]}});
  });
}
(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));mockNotiSend(page);
  const id='stage2-'+Date.now();await page.goto(base+'/email/');
  await page.locator('#filename').fill(id);await page.locator('#subject').fill('Stage 2 проверка');
  await page.getByRole('button',{name:'NotiSend'}).click();await page.locator('.notisend-list-row').first().waitFor();
  await page.locator('#notisend-from-email').fill('news@outmaxshop.ru');await page.locator('#notisend-from-name').fill('OUTMAX');
  await page.locator('.notisend-list-row input').first().check();await page.locator('#notisend-test-email').fill('test@example.com');
  await page.getByRole('button',{name:'Проверка'}).click();await page.locator('.preflight-row').first().waitFor();
  assert.equal(await page.locator('.preflight-row[data-level="error"]').count(),0);
  await page.getByRole('button',{name:'Подготовка'}).click();await page.getByRole('button',{name:'Отправить тест'}).click();
  await page.locator('#notisend-result').filter({hasText:'Тест отправлен'}).waitFor();
  assert.ok(testBody.html.includes('utm_source=notisend'));assert.ok(testBody.html.includes('utm_campaign='+id));
  await page.getByRole('button',{name:'Создать черновик в NotiSend'}).click();await page.locator('#notisend-result').filter({hasText:'#777'}).waitFor();
  assert.ok(campaignBody.html.includes('utm_campaign='+id));assert.ok(campaignBody.html.includes('[%unsubscribe_link%]'));assert.equal(campaignBody.listIds[0],'1');
  await page.locator('#notisend-close').click();await page.getByRole('button',{name:'Проекты',exact:true}).click();
  const card=page.locator('.email-project-card').filter({hasText:'Stage 2 проверка'});await card.waitFor();assert.ok((await card.textContent()).includes('NotiSend #777'));
  const saved=await (await context.request.get(base+'/editor-api/email-projects/'+id)).json();assert.equal(saved.notisendCampaignId,777);assert.equal(saved.utm.enabled,true);
  await page.locator('#email-projects-close').click();await page.setViewportSize({width:320,height:700});
  await page.getByRole('button',{name:'NotiSend'}).click();await page.locator('.notisend-list-row').first().waitFor();
  assert.equal(await page.locator('#notisend-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.locator('#notisend-close').click();await page.getByRole('button',{name:'Проекты',exact:true}).click();await card.waitFor();
  assert.equal(await page.locator('#email-projects-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await context.request.delete(base+'/editor-api/email-projects/'+id);
  assert.deepEqual(errors,[]);
  console.log('Email Stage 2 browser regression: projects, UTM, preflight, mocked SMTP/Campaign, 320px: OK');
  await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
