const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const credentials=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base=process.env.EMAIL_TEST_BASE || 'http://127.0.0.1:8877';
let browser;

(async()=>{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.goto(base+'/email/',{waitUntil:'commit',timeout:30000});
  await page.locator('#email-outline .email-outline-row').first().waitFor();

  assert.equal(await page.locator('#email-article-url').count(),1);
  const haslImport=await page.evaluate(()=>sanitizeImportedHtml('<div class="om-guide"><header><h1>Вся подборка</h1></header><article class="om-product"><h3>Первый товар</h3><p>Описание первого</p></article><article class="om-product"><h3>Второй товар</h3><p>Описание второго</p></article><p>Заключение</p></div>').html);
  assert.match(haslImport,/Вся подборка/);
  assert.match(haslImport,/Второй товар/);
  assert.match(haslImport,/Заключение/);

  const firstRow=page.locator('#email-outline .email-outline-row').nth(0);
  const secondRow=page.locator('#email-outline .email-outline-row').nth(1);
  assert.equal(await firstRow.getByRole('button',{name:'Показать на всех устройствах'}).getAttribute('aria-pressed'),'true');
  await firstRow.getByRole('button',{name:'Показать только на ПК'}).click();
  await secondRow.getByRole('button',{name:'Показать только на телефонах'}).click();
  assert.equal(await page.locator('#canvas > *').nth(0).evaluate(node=>node.classList.contains('email-device-desktop')),true);
  assert.equal(await page.locator('#canvas > *').nth(1).evaluate(node=>node.classList.contains('email-device-mobile')),true);

  const desktopEdit=page.getByRole('button',{name:'Редактировать ПК версию',exact:true});
  const mobileEdit=page.getByRole('button',{name:'Редактировать Мобильную версию',exact:true});
  assert.equal(await desktopEdit.getAttribute('aria-pressed'),'true');
  const opacityAt=index=>page.locator('#canvas > *').nth(index).evaluate(node=>Number(getComputedStyle(node).opacity));
  assert.equal(await opacityAt(0),1);
  assert.ok(await opacityAt(1)<0.5);
  await mobileEdit.click();
  assert.equal(await mobileEdit.getAttribute('aria-pressed'),'true');
  assert.ok(await opacityAt(0)<0.5);
  assert.equal(await opacityAt(1),1);
  assert.ok((await page.locator('#canvas').boundingBox()).width<=360);
  await page.locator('#canvas > h1').first().click();
  await page.locator('#email-element-toolbar').getByRole('button',{name:'Показать на всех устройствах'}).click();
  assert.equal(await opacityAt(0),1);
  await page.locator('#email-history-undo').click();
  assert.ok(await opacityAt(0)<0.5);
  await desktopEdit.click();
  assert.equal(await opacityAt(0),1);

  const beforeClone=await page.locator('#canvas > *').count();
  await page.locator('#email-outline .email-outline-row').nth(2).getByRole('button',{name:'Клонировать элемент'}).click();
  assert.equal(await page.locator('#canvas > *').count(),beforeClone+1);
  await page.evaluate(()=>insertBlock('<ul><li>Первый пункт</li></ul>'));
  const listRow=page.locator('#email-outline .email-outline-row').filter({hasText:'Первый пункт'}).last();
  await listRow.getByRole('button',{name:'Добавить пункт'}).click();
  assert.equal(await page.locator('#canvas > ul').last().locator(':scope > li').count(),2);
  assert.equal(await page.locator('#canvas > ul').last().locator(':scope > li').last().innerText(),'Новый пункт');
  await page.locator('#add-divider').click();
  const dividerRow=page.locator('#email-outline .email-outline-row').filter({hasText:'Разделитель'}).last();
  await dividerRow.waitFor();
  assert.equal(await page.locator('#canvas > hr').count(),1);
  await dividerRow.getByRole('button',{name:'Удалить элемент'}).click();
  assert.equal(await page.locator('#canvas > hr').count(),0);

  await page.locator('#canvas > h1').first().evaluate(node=>{node.textContent='Изменённый заголовок';node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'к'}));});
  await page.waitForFunction(()=>document.querySelector('#email-outline .email-outline-row strong')?.textContent==='Изменённый заголовок');
  assert.match(await page.locator('#email-outline .email-outline-row').first().innerText(),/Изменённый заголовок/);

  await page.locator('.editor-tabs [data-view="preview"]').click();
  const desktop=page.frameLocator('#desktop-preview');
  const mobile=page.frameLocator('#mobile-preview');
  await page.waitForTimeout(350);
  await desktop.locator('.email-device-desktop').waitFor({state:'attached'});
  await mobile.locator('.email-device-desktop').waitFor({state:'attached'});
  assert.notEqual(await desktop.locator('.email-device-desktop').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await desktop.locator('.email-device-mobile').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await mobile.locator('.email-device-desktop').evaluate(node=>getComputedStyle(node).display),'none');
  assert.notEqual(await mobile.locator('.email-device-mobile').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await page.evaluate(()=>emailBlock(activeSite).includes('email-device-desktop')&&emailBlock(activeSite).includes('email-device-mobile')),true);

  await page.locator('.editor-tabs [data-view="editor"]').click();
  await page.route('**/editor-api/fetch-article',route=>route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({id:'test-news',title:'Тестовая новость OUTMAX',url:'https://outmaxshop.com/article/test-news/',html:'<article class="om-guide"><header><h1>Тестовая новость OUTMAX</h1></header><p>Это лид новости, который автоматически станет прехедером письма для проверки.</p><p><a href="https://outmaxshop.com/snickers/">Смотреть модели</a></p></article>'})
  }));
  await page.locator('#email-article-url').fill('outmaxshop.com/article/test-news/');
  await page.locator('#import-article-url').click();
  await page.locator('#status').filter({hasText:'outmaxshop.com'}).waitFor();
  assert.equal(await page.locator('#subject').inputValue(),'Тестовая новость OUTMAX');
  assert.match(await page.locator('#preheader').inputValue(),/^Это лид новости/);
  assert.equal(await page.evaluate(()=>activeSite),'outmax_com');
  assert.equal(await page.locator('[name="email-site"][value="outmax_com"]').isChecked(),true);
  assert.match(await page.evaluate(()=>emailBlock(activeSite)),/https:\/\/outmaxshop\.com\/snickers\//);

  await page.evaluate(()=>insertBlock('<section class="email-section-source"><h2>Тест линии</h2><p>Текст раздела</p></section>'));
  await page.locator('#canvas > section h2').last().click();
  await page.locator('#email-element-toolbar').getByRole('button',{name:'Убрать линию раздела'}).click();
  assert.equal(await page.locator('#canvas > section h2').last().evaluate(node=>getComputedStyle(node).borderBottomWidth),'0px');
  assert.equal(await page.evaluate(()=>new DOMParser().parseFromString(emailBlock(activeSite),'text/html').querySelector('.email-no-section-line').style.borderBottomWidth),'0px');
  await page.locator('#email-history-undo').click();
  assert.equal(await page.locator('#canvas > section h2').last().evaluate(node=>node.classList.contains('email-no-section-line')),false);
  await page.evaluate(()=>insertBlock('<nav class="email-toc-source"><h2>Содержание</h2><table class="email-toc-table"><tbody><tr><td class="email-toc-cell">Первый раздел</td></tr></tbody></table></nav>'));
  await page.locator('#canvas .email-toc-cell').last().click();
  await page.locator('#email-element-toolbar').getByRole('button',{name:'Добавить пункт',exact:true}).click();
  assert.equal(await page.locator('#canvas .email-toc-cell').count(),2);
  await page.locator('#canvas .email-toc-cell').last().fill('Название нового раздела');
  await page.locator('#canvas .email-toc-cell').last().click();
  await page.locator('#email-element-toolbar').getByRole('button',{name:'Показать только на ПК'}).click();
  await mobileEdit.click();
  assert.ok(await page.locator('#canvas .email-toc-cell').last().evaluate(node=>Number(getComputedStyle(node).opacity))<0.5);
  const exported=await page.evaluate(()=>emailBlock(activeSite));
  assert.match(exported,/Название нового раздела/);
  assert.doesNotMatch(exported,/data-edit-device|email-outline-muted|opacity:\s*0?\.32/);
  // The chosen workspace version survives project restoration without contaminating content.
  await page.evaluate(async()=>{const snapshot=emailProjectBridge.snapshot();await emailProjectBridge.restore(snapshot);});
  assert.equal(await page.locator('#canvas').getAttribute('data-edit-device'),'mobile');
  await page.locator('#canvas .email-toc-cell').last().click();
  await page.locator('#email-element-toolbar').getByRole('button',{name:'Удалить',exact:true}).click();
  assert.equal(await page.locator('#canvas .email-toc-cell').count(),1);
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await desktopEdit.click();
  await mobileEdit.click();

  const screenshotFolder=path.join(root,'output','playwright');fs.mkdirSync(screenshotFolder,{recursive:true});
  await page.locator('#toast').evaluate(node=>node.classList.remove('show'));
  const overflow=await page.locator('#canvas').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,offenders:[...node.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>node.getBoundingClientRect().right).map(el=>({tag:el.tagName,cls:el.className,style:el.getAttribute('style'),width:el.getBoundingClientRect().width}))}));
  assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));
  await page.screenshot({path:path.join(screenshotFolder,'email-element-controls.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1050});
  await desktopEdit.click();
  await page.locator('#canvas h1').first().click();
  await page.screenshot({path:path.join(screenshotFolder,'email-device-editing-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Email element controls: URL import, edit, clone, remove and all/desktop/mobile visibility: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
