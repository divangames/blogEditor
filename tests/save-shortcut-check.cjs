const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
let browser;

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const base='http://127.0.0.1:8877';
  const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});

  for(const [path,brand] of [['/','OUTMAX'],['/hasl/','ХАСЛ']]) {
    const page=await context.newPage();
    const errors=[];let saves=0,resolveNextSave=null;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/editor-api/save*',route=>{
      saves+=1;
      resolveNextSave?.();resolveNextSave=null;
      route.fulfill({json:{savedAt:new Date().toISOString(),localizedImages:0,failedImages:0}});
    });
    await page.goto(base+path);
    await page.locator('#canvas').waitFor();
    await page.locator('#page-title').fill(`Новая статья — ${brand}`);
    await page.locator('#page-title').press('Control+s');
    await page.locator('.article-title-dialog').waitFor();
    assert.equal(saves,0,`${brand}: default title saved before confirmation`);
    let saved=new Promise(resolve=>{resolveNextSave=resolve;});
    await page.getByRole('button',{name:'Сохранить как есть'}).click();
    await saved;
    assert.equal(saves,1,`${brand}: save-as-is did not save`);

    const custom=`Проверка Ctrl+S — ${brand}`;
    await page.locator('#page-title').fill(custom);
    saved=new Promise(resolve=>{resolveNextSave=resolve;});
    await page.locator('#canvas').press('Control+s');
    await saved;
    assert.equal(await page.locator('.article-title-dialog').count(),0,`${brand}: custom title opened prompt`);
    assert.equal(saves,2,`${brand}: Ctrl+S with custom title did not save`);

    await page.locator('#page-title').fill(`Новая статья — ${brand}`);
    await page.keyboard.press('Control+s');
    const dialog=page.locator('.article-title-dialog');
    await dialog.locator('input').fill(`${custom} · новое название`);
    saved=new Promise(resolve=>{resolveNextSave=resolve;});
    await dialog.locator('input').press('Enter');
    await saved;
    assert.equal(await page.locator('#page-title').inputValue(),`${custom} · новое название`);
    assert.equal(saves,3,`${brand}: named save did not save`);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  await browser.close();
  console.log('Save shortcut: Ctrl/Cmd+S and default-title choice work in OUTMAX and HASL');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
