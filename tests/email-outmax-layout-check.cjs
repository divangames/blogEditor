const {chromium}=require('../release/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

const fixture=`
  <div id="email-root">
    <div class="email-product-source">
      <h3><span style="font-size:29px!important">Очень длинное название</span> зимних кроссовок SuperLongModelNameWithoutNaturalBreaks</h3>
    </div>
    <div class="rating-panel">
      <strong><span>ОЦЕНКА МОДЕЛИ</span></strong>
      <div>
        <div><strong>5/5</strong><span>★★★★★</span><span>Влагозащита</span></div>
        <div><strong>4/5</strong><span>★★★★☆</span><span>Теплоизоляция</span></div>
        <div><strong>4/5</strong><span>★★★★☆</span><span>Сцепление</span></div>
      </div>
    </div>
    <div class="commerce">
      <p><s>12 190 ₽</s> <strong>6 100 ₽</strong></p>
      <div class="sizes">
        <strong>Доступные размеры</strong>
        <div>
          <span><strong>41</strong><span>26 см</span></span>
          <span><strong>42</strong><span>26,5 см</span></span>
          <span><strong>43</strong><span>27,5 см</span></span>
          <span><strong>44</strong><span>28 см</span></span>
          <span><strong>45</strong><span>29 см</span></span>
          <span><strong>46</strong><span>30 см</span></span>
        </div>
      </div>
    </div>
  </div>`;

let browser;
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();
  await page.setContent(fixture);
  await page.addScriptTag({path:path.resolve(__dirname,'../email/email-renderer.js')});
  await page.evaluate(()=>{
    const root=document.querySelector('#email-root');
    markEmailStructures(root);
    applyEmailDesign(root,'outmax_ru');
    normalizeNotiSendMarkup(root);
    const style=document.createElement('style');
    style.textContent=EMAIL_FALLBACK_CSS;
    document.head.append(style);
  });

  const classes=await page.evaluate(()=>({
    panel:document.querySelector('.email-ratings-panel')?.className,
    title:document.querySelector('.email-ratings-title')?.className,
    ratings:document.querySelectorAll('.email-rating-item').length,
    sizes:document.querySelectorAll('.email-size-chip').length
  }));
  assert.match(classes.panel,/email-ratings-panel/);
  assert.match(classes.title,/email-ratings-title/);
  assert.equal(classes.ratings,3);
  assert.equal(classes.sizes,6);
  assert.deepEqual(await page.locator('.email-rating-item').evaluateAll(nodes=>nodes.map(node=>({
    stars:node.children[1].textContent,
    filled:[...node.children[1].children].filter(star=>getComputedStyle(star).color==='rgb(242, 182, 0)').length
  }))),[
    {stars:'★★★★★',filled:5},
    {stars:'★★★★★',filled:4},
    {stars:'★★★★★',filled:4}
  ]);

  async function boxes(width,selector){
    await page.setViewportSize({width,height:900});
    return page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return {x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),display:getComputedStyle(node).display};
    }));
  }
  const desktopRatings=await boxes(900,'.email-rating-item');
  assert.equal(desktopRatings[0].display,'inline-block');
  assert.equal(desktopRatings[0].y,desktopRatings[1].y);
  assert.ok(Math.abs(desktopRatings[0].width-desktopRatings[1].width)<=1);
  assert.ok(desktopRatings[2].y>desktopRatings[0].y);

  const mobileRatings=await boxes(360,'.email-rating-item');
  assert.equal(mobileRatings[0].display,'block');
  assert.ok(mobileRatings[1].y>mobileRatings[0].y);
  assert.ok(mobileRatings[2].y>mobileRatings[1].y);

  for(const width of [900,360]){
    const sizes=await boxes(width,'.email-size-chip');
    assert.equal(sizes[0].display,'inline-block');
    assert.equal(sizes[0].y,sizes[1].y);
    assert.equal(sizes[1].y,sizes[2].y);
    assert.ok(sizes[3].y>sizes[0].y);
    assert.equal(sizes[3].y,sizes[4].y);
    assert.equal(sizes[4].y,sizes[5].y);
    assert.ok(Math.abs(sizes[0].width-sizes[1].width)<=1);
  }
  const polish=await page.evaluate(()=>({
    productRadius:getComputedStyle(document.querySelector('.email-product-source')).borderRadius,
    ratingsRadius:getComputedStyle(document.querySelector('.email-ratings-panel')).borderRadius,
    commerceRadius:getComputedStyle(document.querySelector('.email-commerce-source')).borderRadius,
    sizeRadius:getComputedStyle(document.querySelector('.email-size-chip')).borderRadius,
    headingWrap:getComputedStyle(document.querySelector('.email-product-source h3')).overflowWrap,
    headingBreak:getComputedStyle(document.querySelector('.email-product-source h3')).wordBreak,
    headingSize:getComputedStyle(document.querySelector('.email-product-source h3')).fontSize,
    nestedHeadingSize:getComputedStyle(document.querySelector('.email-product-source h3 span')).fontSize,
    overflow:document.documentElement.scrollWidth>innerWidth
  }));
  assert.equal(polish.productRadius,'10px');
  assert.equal(polish.ratingsRadius,'8px');
  assert.equal(polish.commerceRadius,'10px');
  assert.equal(polish.sizeRadius,'8px');
  assert.equal(polish.headingWrap,'break-word');
  assert.equal(polish.headingBreak,'normal');
  assert.equal(polish.nestedHeadingSize,polish.headingSize);
  assert.equal(polish.overflow,false);
  console.log('OUTMAX email layout: polished cards, ratings 2/1 columns and sizes 3 per row: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
