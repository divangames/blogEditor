const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const creds=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base=process.env.EDITOR_TEST_BASE||'http://127.0.0.1:8877';
const screenshot=path.join(root,'release/ui-check/screens/qa-user-presence.png');
let browser;

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const admin=await browser.newContext({viewport:{width:1200,height:820},reducedMotion:'reduce'});
  await admin.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const users=await (await admin.request.get(base+'/editor-api/users')).json();
  const colleague=users.find(user=>!user.admin);
  assert.ok(colleague,'test needs a non-admin user');

  if(process.env.PRESENCE_ADMIN_ONLY==='1'){
    const page=await admin.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.locator('#account-name strong').waitFor();
    await page.locator('#account-name').click();await page.locator('#manage-users').click();
    const rows=page.locator('.user-row'),selfRow=page.locator(`.user-row[data-user-id="${users.find(user=>user.admin).id}"]`);
    assert.equal(await rows.locator('.user-presence').count(),await rows.count(),'every user avatar should have a presence dot');
    assert.ok(await selfRow.locator('.user-presence').evaluate(node=>node.classList.contains('is-online')),'current editor should be online');
    assert.deepEqual(errors,[]);
    console.log('Production presence UI: dots rendered and current editor is online: OK');
    await browser.close();return;
  }

  const offlineContext=await browser.newContext();
  await offlineContext.request.post(base+'/login',{form:{login:colleague.login,password:colleague.password}});
  await offlineContext.request.post(base+'/editor-api/logout');
  await offlineContext.close();

  const page=await admin.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#account-name strong').waitFor();
  await page.locator('#account-name').click();await page.locator('#manage-users').click();
  const selfRow=page.locator(`.user-row[data-user-id="${users.find(user=>user.admin).id}"]`);
  const colleagueRow=page.locator(`.user-row[data-user-id="${colleague.id}"]`);
  assert.ok(await selfRow.locator('.user-presence').evaluate(node=>node.classList.contains('is-online')),'current editor should be online');
  assert.ok(await colleagueRow.locator('.user-presence').evaluate(node=>node.classList.contains('is-offline')),'logged-out user should be offline');
  assert.match(await colleagueRow.locator('.user-presence').getAttribute('aria-label'),/не в редакторе/);

  const colleagueContext=await browser.newContext();
  await colleagueContext.request.post(base+'/login',{form:{login:colleague.login,password:colleague.password}});
  const colleaguePage=await colleagueContext.newPage();await colleaguePage.goto(base);await colleaguePage.locator('#account-name strong').waitFor();
  await page.waitForTimeout(16000);
  assert.ok(await colleagueRow.locator('.user-presence').evaluate(node=>node.classList.contains('is-online')),'presence should refresh while the list stays open');
  assert.match(await colleagueRow.locator('.user-presence').getAttribute('aria-label'),/Сейчас в редакторе/);
  await page.locator('.account-dialog').screenshot({path:screenshot});

  await colleagueContext.request.post(base+'/editor-api/logout');
  await page.waitForTimeout(16000);
  assert.ok(await colleagueRow.locator('.user-presence').evaluate(node=>node.classList.contains('is-offline')),'logout should turn the status gray without reopening the list');
  assert.deepEqual(errors,[]);
  console.log('User presence: green online, gray offline, live refresh and accessible labels: OK');
  await colleagueContext.close();await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
