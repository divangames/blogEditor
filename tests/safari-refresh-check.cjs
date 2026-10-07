const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const credentials=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base=process.env.EDITOR_TEST_BASE || 'http://127.0.0.1:8877';

(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));

    await page.goto(base+'/login');
    await page.getByLabel('Логин',{exact:true}).fill(credentials.user);
    await page.getByLabel('Пароль',{exact:true}).fill(credentials.password);
    await page.getByRole('button',{name:'Войти в редактор'}).click();
    await page.locator('#account-name strong').waitFor();

    assert.equal(await page.locator('main').count(),0,'Safari Reader must not see a semantic main article surface');
    assert.equal(await page.locator('article#canvas').count(),0,'The editable canvas must not be an article element');
    assert.equal(await page.locator('[role=main]').count(),1);
    const session=(await context.cookies()).find(cookie=>cookie.name==='session');
    assert.ok(session && session.expires-Date.now()/1000>25*24*60*60,'The login session should remain valid for about 30 days');

    for(let index=0;index<3;index+=1){
      await page.reload();
      await page.locator('#account-name strong').waitFor();
      assert.ok(!page.url().includes('/login'),'Reload must keep the authenticated editor open');
    }

    await page.locator('#account-name').click();
    await page.getByRole('button',{name:'О редакторе',exact:true}).click();
    await page.getByRole('heading',{name:/О редакторе (OUTMAX|ХАСЛ)/}).waitFor();
    assert.match(await page.locator('.about-editor-content').innerText(),/Safari на Mac/);
    await page.locator('.about-editor-dialog header button').click();

    await page.goto(base+'/email/');
    await page.locator('#email-account-name strong').waitFor();
    assert.equal(await page.locator('main').count(),0);
    assert.equal(await page.locator('article#canvas').count(),0);
    await page.locator('#email-account-name').click();
    await page.getByRole('button',{name:'О редакторе',exact:true}).click();
    await page.getByRole('heading',{name:'О редакторе email-рассылок'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Safari refresh, persistent session and About menu: OK');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
