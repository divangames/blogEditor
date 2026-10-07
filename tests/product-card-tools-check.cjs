const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
let browser;

const product=sku=>({
  sku:String(sku),title:'Тестовая модель',url:`https://outmaxshop.ru/snickers/test-${sku}`,
  images:['data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="%23ddd"/></svg>'],
  features:['Цвет: чёрный'],properties:['Материал: текстиль'],details:['Мягкая стелька','Цепкая подошва'],
  descriptionHtml:'<p>Описание с <a href="https://example.com/detail">ссылкой</a></p>',
  price:6490,oldPrice:12990,sizes:[{name:'46',hint:'30 см'}],labels:['В наличии'],inStock:true,
});

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const base=(process.env.EDITOR_BASE||'http://127.0.0.1:8877').replace(/\/$/,'');
  const creds=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});

  for(const [path,brand] of [['/','outmax'],['/hasl/','hasl']]) {
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+path);await page.locator('#canvas').waitFor();
    await page.evaluate(p=>addProduct(p),product(brand==='outmax'?46472:43368));
    const card=page.locator('.om-product').last();
    assert.equal(await card.locator('.om-product-description').count(),1,`${brand}: description missing`);
    assert.equal(await card.locator('.om-product-properties').count(),1,`${brand}: properties missing`);
    assert.equal(await card.locator('.om-product-details li').count(),2,`${brand}: details missing`);
    assert.equal(await card.locator('.om-product-description a').getAttribute('href'),'https://example.com/detail');

    const image=card.locator('.om-gallery img').first();
    const [linkBox,imageBox]=await Promise.all([image.locator('..').boundingBox(),image.boundingBox()]);
    assert.ok(Math.abs(linkBox.width-linkBox.height)<1.5,`${brand}: gallery is not square`);
    assert.ok(Math.abs(imageBox.width-imageBox.height)<1.5,`${brand}: product image is not square`);
    await image.dblclick();
    assert.equal(await page.locator('#image-width').inputValue(),'100');
    assert.equal(await page.locator('#image-ratio').inputValue(),'1 / 1');
    assert.equal(await page.locator('#image-x').inputValue(),'50');
    assert.equal(await page.locator('#image-y').inputValue(),'50');
    assert.equal(await page.locator('#image-align').inputValue(),'center');
    await page.locator('#image-done').click();

    await page.evaluate(()=>selectNode(document.querySelector('.om-product:last-of-type')));
    const initialButtons=await card.locator(':scope > .om-actions > a').count();
    await page.locator('#edit-cta').click();
    await page.locator('#button-add-item').click();
    const last=page.locator('.button-item').last();
    await last.locator('[data-field="text"]').fill('Вторая кнопка');
    await last.locator('[data-field="url"]').fill('https://example.com/colors');
    await last.locator(`input[value="${brand==='hasl'?'outline':'black'}"]`).check({force:true});
    await page.locator('#button-submit').click();
    assert.equal(await card.locator(':scope > .om-actions > a').count(),initialButtons+1,`${brand}: second button not added`);
    assert.equal(await card.locator(':scope > .om-actions > a').last().getAttribute('href'),'https://example.com/colors');

    await page.evaluate(()=>selectNode(document.querySelector('.om-product:last-of-type')));
    for(let index=0;index<5;index++) await page.locator('#product-rating-add').click();
    assert.equal(await card.locator('.om-model-rating-item').count(),5,`${brand}: arbitrary ratings failed`);
    await page.locator('#product-rating-remove').click();
    assert.equal(await card.locator('.om-model-rating-item').count(),4,`${brand}: rating removal failed`);

    const pricePositions=await card.locator('.om-price-amounts').evaluate(node=>{
      const old=node.querySelector('.om-price-old').getBoundingClientRect();
      const current=node.querySelector('.om-price-current').getBoundingClientRect();
      return {oldX:old.x,currentX:current.x,oldY:old.y,currentY:current.y};
    });
    if(brand==='hasl') assert.ok(pricePositions.oldY<pricePositions.currentY,`hasl: old price is not above new price`);
    else assert.ok(pricePositions.oldX<pricePositions.currentX,`outmax: old price is not before new price`);

    await page.locator('#product-description').evaluate(input=>input.checked=false);
    await page.evaluate(p=>addProduct(p),product(brand==='outmax'?46473:43369));
    const compact=page.locator('.om-product').last();
    assert.equal(await compact.locator('.om-product-description,.om-product-properties,.om-product-details').count(),0,`${brand}: optional details were not disabled`);
    assert.deepEqual(errors,[],`${brand}: page errors: ${errors.join('; ')}`);
    await page.close();
  }
  await browser.close();
  console.log('Product cards: descriptions, prices, square images, buttons and editable ratings work in OUTMAX and HASL');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
