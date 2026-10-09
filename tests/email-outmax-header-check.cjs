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
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.goto(base+'/email/',{waitUntil:'commit',timeout:30000});
  await page.locator('.editor-tabs').waitFor();
  await page.locator('.editor-tabs [data-view="preview"]').click();
  await page.waitForTimeout(350);
  const desktop=page.frameLocator('#desktop-preview');
  const mobile=page.frameLocator('#mobile-preview');
  await desktop.locator('.outmax-email-header-logo').first().waitFor();

  assert.equal(await desktop.locator('.outmax-email-header-desktop').evaluate(node=>getComputedStyle(node).display),'table');
  assert.equal(await desktop.locator('.outmax-email-header-mobile').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await mobile.locator('.outmax-email-header-desktop').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await mobile.locator('.outmax-email-header-mobile').evaluate(node=>getComputedStyle(node).display),'table');

  assert.equal(await desktop.locator('.outmax-email-header-desktop>a').count(),0);
  assert.equal(await desktop.locator('.outmax-email-header-desktop td>a').first().getAttribute('href'),'https://outmaxshop.ru/');
  assert.deepEqual(await desktop.locator('.outmax-email-nav a').evaluateAll(nodes=>nodes.map(node=>[node.textContent,node.href])),[
    ['КРОССОВКИ','https://outmaxshop.ru/snickers/'],
    ['ОДЕЖДА','https://outmaxshop.ru/clothes/'],
    ['АКСЕССУАРЫ','https://outmaxshop.ru/accessories/'],
    ['ОТЗЫВЫ','https://outmaxshop.ru/testimonials/']
  ]);
  assert.equal(await mobile.locator('.outmax-email-header-mobile a').getAttribute('href'),'https://outmaxshop.ru/snickers/');

  assert.equal(await desktop.locator('.outmax-email-header-desktop').evaluate(node=>Math.round(node.getBoundingClientRect().height)),188);
  assert.equal(await mobile.locator('.outmax-email-header-mobile').evaluate(node=>Math.round(node.getBoundingClientRect().height)),128);
  assert.equal(await desktop.locator('.outmax-email-nav a').first().evaluate(node=>getComputedStyle(node).borderBottomWidth),'0px');
  assert.equal(await desktop.locator('.outmax-email-header-logo').first().evaluate(node=>node.complete&&node.naturalWidth>0),true);
  const images=path.join(root,'output','playwright');fs.mkdirSync(images,{recursive:true});
  await desktop.locator('.outmax-email-header-desktop').screenshot({path:path.join(images,'outmax-header-desktop-reference.png')});
  await mobile.locator('.outmax-email-header-mobile').screenshot({path:path.join(images,'outmax-header-mobile-reference.png')});

  // External email previews may add !important rules after the exported CSS.
  // Check both full-document preview and the exact HTML fragment under host styles.
  for(const [name,width] of [['desktop',700],['mobile',360]]) {
    const body=await page.evaluate(()=>emailBlock('outmax_ru'));
    const host=await context.newPage();await host.setViewportSize({width,height:650});
    await host.setContent('<html><head></head><body><div class="mail-host">'+body+'</div><style>.mail-host td{text-align:left!important}.mail-host a{display:block!important;width:100%!important}.mail-host img{width:100%!important;max-width:100%!important;height:auto!important}</style></body></html>');
    const visible=host.locator(name==='desktop'?'.outmax-email-header-desktop':'.outmax-email-header-mobile');
    const geometry=await visible.evaluate(table=>{const image=table.querySelector('.outmax-email-header-logo');const cell=image.closest('td');const a=image.getBoundingClientRect(),b=cell.getBoundingClientRect();return {width:a.width,height:a.height,offset:Math.abs((a.left+a.right)/2-(b.left+b.right)/2)};});
    assert.equal(geometry.width,80,name+' logo width under host CSS');
    assert.equal(geometry.height,80,name+' logo height under host CSS');
    assert.ok(geometry.offset<=1,name+' logo is not centered under host CSS');
    await visible.screenshot({path:path.join(images,'outmax-header-'+name+'-host-css.png')});
    await host.close();
  }

  const logoUrl=await desktop.locator('.outmax-email-header-logo').first().getAttribute('src');
  const anonymous=await browser.newContext();
  assert.equal((await anonymous.request.get(logoUrl)).status(),200);
  await anonymous.close();

  const detected=await page.evaluate(()=>({
    ru:detectImportedSite(new DOMParser().parseFromString('<a href="https://outmaxshop.ru/snickers/">Модель</a>','text/html')),
    com:detectImportedSite(new DOMParser().parseFromString('<a href="https://outmaxshop.com/clothes/">Одежда</a>','text/html'))
  }));
  assert.deepEqual(detected,{ru:'outmax_ru',com:'outmax_com'});

  await page.evaluate(()=>{activeSite='outmax_com';refresh();});
  await page.waitForTimeout(350);
  await desktop.locator('.outmax-email-nav a').first().waitFor();
  assert.deepEqual(await desktop.locator('.outmax-email-nav a').evaluateAll(nodes=>nodes.map(node=>node.href)),[
    'https://outmaxshop.com/snickers/',
    'https://outmaxshop.com/clothes/',
    'https://outmaxshop.com/accessories/',
    'https://outmaxshop.com/testimonials/'
  ]);
  assert.equal(await mobile.locator('.outmax-email-header-mobile a').getAttribute('href'),'https://outmaxshop.com/snickers/');

  // Import URL is authoritative even when article HTML links to the other domain.
  await page.locator('.editor-tabs [data-view="editor"]').click();
  await page.route('**/editor-api/fetch-article',route=>route.fulfill({json:{title:'Новость для рассылки',html:'<article><h1>Новость</h1><p>Описание новости для email-рассылки.</p><a href="https://outmaxshop.ru/">Магазин</a></article>'}}));
  await page.locator('#email-article-url').fill('https://outmaxshop.com/article/header-test/');
  await page.locator('#import-article-url').click();
  await page.locator('#status').filter({hasText:'Новость загружена'}).waitFor();
  const importedHeader=await page.evaluate(()=>new DOMParser().parseFromString(emailBlock(activeSite),'text/html').querySelector('.outmax-email-header-desktop a').href);
  assert.equal(importedHeader,'https://outmaxshop.com/');
  // The export site's selection updates the header and all category links.
  await page.evaluate(()=>{pendingExportAction='copy';copyText=async html=>{window.headerTestExport=html;};});
  await page.locator('#copy-html').click();
  await page.locator('[name="email-site"][value="outmax_ru"]').check();
  await page.locator('#email-export-form').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>typeof window.headerTestExport==='string');
  assert.deepEqual(await page.evaluate(()=>[...new DOMParser().parseFromString(window.headerTestExport,'text/html').querySelectorAll('.outmax-email-header-desktop a')].map(a=>{const url=new URL(a.href);return url.origin+url.pathname;})),[
    'https://outmaxshop.ru/','https://outmaxshop.ru/snickers/','https://outmaxshop.ru/clothes/','https://outmaxshop.ru/accessories/','https://outmaxshop.ru/testimonials/'
  ]);
  await page.locator('.editor-tabs [data-view="preview"]').click();
  await page.evaluate(()=>{activeSite='outmax_ru';refresh();});
  await page.waitForTimeout(350);
  const screenshotFolder=path.join(root,'output','playwright');fs.mkdirSync(screenshotFolder,{recursive:true});
  await page.screenshot({path:path.join(screenshotFolder,'email-outmax-header.png'),fullPage:true});

  await page.evaluate(()=>{activeSite='hasl_ru';refresh();});
  await page.waitForTimeout(350);
  assert.equal(await desktop.locator('.outmax-email-header-desktop,.outmax-email-header-mobile').count(),0);
  assert.deepEqual(errors,[]);
  console.log('OUTMAX email header: desktop navigation, mobile logo, public asset and automatic .ru/.com links: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
