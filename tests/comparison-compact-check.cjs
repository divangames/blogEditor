const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';
const names=['Зимние Сапоги Nike Winterproof High цвет Серый','Зимние кеды Vans UltraRange EXO MTE-3 Hi цвет Черный','Зимние Кроссовки Adidas Terrex AX4 Mid цвет Коричневый','Зимние Кроссовки The North Face Glenclyffe high цвет Черный'];
const photo='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22%3E%3Crect width=%2252%22 height=%2252%22 fill=%22%23e9eaec%22/%3E%3Cpath d=%22M9 26h18l7 8 10 2v7H9Z%22 fill=%22%233f4952%22/%3E%3C/svg%3E';
const properties='Материал верха: натуральная кожа и плотный текстиль. Подкладка: мягкий флис. Подошва: резина. Назначение: повседневные прогулки.';
const fixture='<header><h1>Компактное сравнение</h1><p>Демонстрационные товары</p></header><div class="om-table-scroll" tabindex="0"><table class="om-comparison-table"><thead><tr><th class="om-comparison-thumb-column">Модель</th><th class="om-comparison-model-column">Наименование</th><th>Цена</th><th>Размеры</th><th>Наличие</th><th>Материалы и свойства</th></tr></thead><tbody>'+names.map((name,i)=>`<tr><td class="om-comparison-thumb-column"><img class="om-model-thumb" src="${photo}" alt="Демонстрационное фото" style="width:52px!important;height:52px!important"></td><td class="om-comparison-model-column"><span class="om-model-cell"><a href="https://example.com/model-${i}">${name}</a></span></td><td data-price-cell="1">${[7790,8310,7140,7400][i]} ₽</td><td>37, 38, 39, 40, 41, 42</td><td>В наличии</td><td>${properties}</td></tr>`).join('')+'</tbody></table></div>';
fs.mkdirSync('output/wordcraft-qa/compact-comparison',{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const brand of ['outmax','hasl']){
   await page.goto(base+(brand==='hasl'?'/hasl/':'/'));await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(body=>setBody(body),fixture);const html=await page.evaluate(()=>previewDocument());
   for(const width of [320,390,900,1440]){
    const preview=await context.newPage();await preview.setViewportSize({width,height:900});await preview.setContent(html);
    const table=preview.locator('.om-comparison-table'),scroll=preview.locator('.om-table-scroll');
    const sizes=await table.locator('tbody tr').evaluateAll(rows=>rows.map(r=>Math.round(r.getBoundingClientRect().height)));
    assert.ok(sizes.every(h=>h<=125),`${brand} ${width}: oversized rows ${sizes}`);
    const compact=await table.locator('tbody td').first().evaluate(n=>({padding:getComputedStyle(n).padding,wrap:getComputedStyle(n).overflowWrap}));assert.equal(compact.padding,'8px');assert.equal(compact.wrap,'normal');
    assert.ok(await scroll.evaluate(n=>n.scrollWidth>n.clientWidth),`${brand} ${width}: horizontal scrolling must remain available`);
    const photoCell=table.locator('tbody .om-comparison-thumb-column').first(),name=table.locator('tbody .om-comparison-model-column').first(),before=await photoCell.boundingBox(),nameBefore=await name.boundingBox();const delta=await scroll.evaluate(n=>{n.scrollLeft=180;return n.scrollLeft;});assert.ok(delta>0);assert.ok(Math.abs((await photoCell.boundingBox()).x-before.x)<2);assert.ok(Math.abs((await name.boundingBox()).x-nameBefore.x+delta)<2);await scroll.evaluate(n=>n.scrollLeft=0);
    const brokenWords=await table.evaluate(table=>{const failures=[];const walker=document.createTreeWalker(table,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){for(const m of n.textContent.matchAll(/[\p{L}\p{N}]+/gu)){const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);const rects=[...r.getClientRects()].filter(r=>r.width>0);if(new Set(rects.map(r=>Math.round(r.y))).size>1)failures.push(m[0]);}}return failures;});assert.deepEqual(brokenWords,[],`${brand} ${width}: words must not split into letters`);
    assert.ok(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width<680)assert.ok((await table.locator('tbody img').first().boundingBox()).width<=44);
    if(width===390||width===1440)await preview.screenshot({path:`output/wordcraft-qa/compact-comparison/${brand}-${width}.png`});
    console.log(JSON.stringify({brand,width,rowHeights:sizes}));await preview.close();
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{const t=canvas.querySelector('.om-comparison-table'),r=t.tBodies[0].rows[0];selectNode(t.closest('.om-table-scroll'),r,r.cells[3],true);});
   await page.locator('#table-column-width').fill('144');await page.locator('#table-column-width').dispatchEvent('change');assert.equal(await page.locator('#canvas tbody tr').first().locator('td').nth(3).evaluate(n=>getComputedStyle(n).minWidth),'144px','manual desktop width still works');
   await page.locator('#table-row-height').fill('160');await page.locator('#table-row-height').dispatchEvent('change');assert.ok((await page.locator('#canvas tbody tr').first().boundingBox()).height>=160,'manual desktop row height still works');
  }
  assert.deepEqual(errors,[]);console.log('PASS: compact real-length product rows, word-boundary wrapping, mobile/desktop scroll, sticky photo, no page overflow, both brands');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
