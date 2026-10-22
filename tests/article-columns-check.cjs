const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function checkColumns(context,base,{capture=false,guide=true,readOnly=false}={}){
 for(const brand of ['outmax','hasl']){
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base&&(!readOnly||['GET','HEAD'].includes(r.request().method()))?r.continue():r.abort());
  if(process.env.COLUMNS_BLOCK_ENGINE){await page.route('**/editor.js*',r=>r.abort());await page.route('**/editor-commands.js*',r=>r.abort());}
  await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#add-columns').waitFor();await page.waitForFunction(()=>articleBackupReady);
  await page.evaluate(()=>{clearSelection();setBody('<header><h1>Материал с колонками</h1><p>Демонстрационный материал.</p></header>');resetArticleEditorHistory();});
  const body=()=>page.evaluate(()=>encodedBody());
  const initial=await body();
  if(capture&&brand==='outmax')await page.locator('.insert-grid').screenshot({path:'instructions/screens/article-columns-tools.png'});
  await page.locator('#add-columns').click();
  assert.equal(await page.locator('#columns-count').inputValue(),'2');assert.equal(await page.locator('#columns-mobile').inputValue(),'1');
  assert.equal(await body(),initial,'settings do not edit canvas');
  await page.locator('#columns-width-1').fill('30');await page.locator('#columns-width-2').fill('70');
  if(capture&&brand==='outmax'){await page.setViewportSize({width:1440,height:1400});await page.locator('#columns-dialog').screenshot({path:'instructions/screens/article-columns-settings.png'});await page.setViewportSize({width:1440,height:1000});}
  await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await body(),initial);
  await page.locator('#add-columns').click();await page.locator('#columns-dialog button[type=submit]').click();
  assert.equal(await page.locator('#add-columns').innerText(),'Колонка');assert.equal(await page.locator('#add-columns svg').count(),1);
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').count(),2);
  assert.equal(await page.evaluate(()=>articleHistory.length),2,'one history step for insertion');
  await page.evaluate(()=>{
   const columns=canvas.querySelectorAll('.om-columns>.om-column');
   columns[0].innerHTML='<h3>Как выбрать кроссовки</h3><p id="columns-text">До <strong>комфорт 👟</strong> после.</p>';
   columns[1].innerHTML='<p id="columns-second">Советы по выбору. <a href="https://example.com/guide">Полное руководство</a></p>';changed();
  });
  const caret=async selector=>page.evaluate(selector=>{clearSelection();const p=canvas.querySelector(selector),range=document.createRange();range.selectNodeContents(p);range.collapse(false);canvas.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();},selector);
  await caret('#columns-text');await page.locator('#add-paragraph').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').first().locator(':scope>p').count(),2);
  await caret('#columns-text');await page.locator('#add-section').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').first().locator(':scope>section.om-section').count(),1);
  await caret('#columns-second');await page.locator('#add-divider').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').nth(1).locator(':scope>hr').count(),1);
  await caret('#columns-second');await page.locator('#add-button').click();
  await page.locator('#button-items [data-field=url]').fill('https://example.com/catalog');
  await page.locator('#button-form button[type=submit]').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').nth(1).locator(':scope>.om-cta a').getAttribute('href'),'https://example.com/catalog');
  await caret('#columns-text');
  const demoImage='data:image/png;base64,'+fs.readFileSync('images/'+(brand==='hasl'?'hasle.png':'outmax.png')).toString('base64');
  await page.evaluate(src=>insertMediaAtCaret('<figure><img src="'+src+'" alt="Логотип бренда" style="width:96px;height:96px;object-fit:contain"><figcaption>Изображение в колонке</figcaption></figure>'),demoImage);
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').first().locator(':scope>figure').count(),1);
  await caret('#columns-text');await page.locator('#add-columns').click();await page.locator('#columns-dialog button[type=submit]').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').first().locator(':scope>.om-columns>.om-column').count(),2,'nested columns');
  const settings=async()=>{await page.evaluate(()=>selectNode(canvas.querySelector('.om-columns')));await page.locator('#columns-settings').click();};
  // Percentages use the existing history and never edit the material before Apply.
  await settings();const beforeWidths=await body(),widthHistory=await page.evaluate(()=>articleHistory.length);
  await page.locator('#columns-width-1').fill('30');await page.locator('#columns-width-2').fill('60');
  await page.locator('#columns-dialog button[type=submit]').click();
  assert.match(await page.locator('#columns-error').textContent(),/100%/);assert.equal(await body(),beforeWidths);assert.equal(await page.evaluate(()=>articleHistory.length),widthHistory);
  await page.locator('#columns-count').selectOption('3');assert.equal(await page.locator('#columns-error').textContent(),'');await page.locator('#columns-count').selectOption('2');
  for(const bad of ['0','-1','100','30.55','']){await page.locator('#columns-width-1').fill(bad);await page.locator('#columns-dialog button[type=submit]').click();assert.equal(await body(),beforeWidths);assert.ok(await page.locator('#columns-dialog').evaluate(n=>n.open));}
  await page.locator('#columns-width-1').fill('30');await page.locator('#columns-width-2').fill('70');await page.locator('#columns-dialog button[type=submit]').click();
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'30,70');
  assert.equal(await page.evaluate(()=>articleHistory.length),widthHistory+1);
  await page.evaluate(()=>undoArticleEditor());assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'50,50');
  await page.evaluate(()=>redoArticleEditor());assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'30,70');
  await settings();assert.equal(await page.locator('#columns-width-2').inputValue(),'70');
  await page.locator('#columns-widths-equal').click();assert.equal(await page.locator('#columns-width-1').inputValue(),'50');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'30,70');
  for(const count of [3,4,5,6]){await settings();await page.locator('#columns-count').selectOption(String(count));assert.equal(await page.locator('#columns-widths input').count(),count);assert.equal(await page.locator('#columns-width-total').textContent(),'Итого: 100% из 100%');await page.keyboard.press('Escape');}
  await settings();await page.locator('#columns-count').selectOption('6');await page.locator('#columns-mobile').selectOption('2');
  for(const [i,value] of [5,10,15,20,25,25].entries())await page.locator('#columns-width-'+(i+1)).fill(String(value));
  await page.locator('#columns-gap').fill('18');await page.locator('#columns-mobile-gap').fill('8');await page.locator('#columns-padding').fill('6');
  await page.locator('#columns-top').fill('12');await page.locator('#columns-bottom').fill('30');
  const history=await page.evaluate(()=>articleHistory.length);
  await page.locator('#columns-dialog button[type=submit]').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').count(),6);
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'5,10,15,20,25,25');
  const sixFractions=await page.locator('#canvas>.om-columns').evaluate(n=>{const widths=[...n.children].map(c=>c.getBoundingClientRect().width),sum=widths.reduce((a,b)=>a+b,0);return widths.map(w=>w/sum);});
  sixFractions.forEach((fraction,i)=>assert.ok(Math.abs(fraction-[.05,.1,.15,.2,.25,.25][i])<.002,'individual width of column '+(i+1)));
  assert.equal(await page.evaluate(()=>articleHistory.length),history+1,'one history step for settings');
  await page.evaluate(()=>undoArticleEditor());assert.equal(await page.locator('#canvas>.om-columns>.om-column').count(),2);
  await page.evaluate(()=>redoArticleEditor());assert.equal(await page.locator('#canvas>.om-columns>.om-column').count(),6);
  await page.evaluate(capture=>{const cells=canvas.querySelectorAll(':scope>.om-columns>.om-column');cells[5].id='keep-column-six';cells[5].style.color='rgb(35, 24, 21)';cells[5].innerHTML='<p id="keep-six"><em>Не терять шестую</em> <a href="https://example.com/six">ссылка</a></p>'+(capture?'':'<div class="om-cta"><a class="om-button" href="https://example.com/kept-button">Сохранённая кнопка</a></div>');changed();},capture);
  await settings();await page.locator('#columns-count').selectOption('2');await page.locator('#columns-width-1').fill('30');await page.locator('#columns-width-2').fill('70');await page.locator('#columns-dialog button[type=submit]').click();
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').count(),2);
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').nth(1).locator('#keep-six em').textContent(),'Не терять шестую');
  assert.equal(await page.locator('#keep-six').count(),1);assert.equal(await page.locator('#columns-text').count(),1);
  assert.equal(await page.locator('#keep-column-six').count(),1,'removed cell anchor survives');assert.equal(await page.locator('#keep-column-six').evaluate(n=>n.style.color),'rgb(35, 24, 21)','inherited cell style survives');
  await page.evaluate(()=>{
   const nested=canvas.querySelectorAll('.om-columns .om-columns .om-column>p');nested[0].textContent='Амортизация';nested[1].textContent='Сцепление';
   canvas.querySelector('.om-column section h2').textContent='Что проверить';canvas.querySelector('.om-column section p').textContent='Сравните посадку и амортизацию.';
   canvas.querySelector('#keep-six em').textContent='Проверьте размер';
   canvas.querySelectorAll('.om-columns>.om-column:nth-child(2) p').forEach(p=>{if(/^Текст колонки/.test(p.textContent))p.textContent='Обратите внимание на посадку.';});changed();
  });
  await page.evaluate(()=>clearSelection());
  const original=await body(),html=await page.evaluate(()=>adminBody());
  assert.equal(await body(),original,'export does not change source');
  assert.match(html,/data-article-columns/);assert.ok(html.includes('https://example.com/six'));
  const preview=await context.newPage();await preview.setContent(await page.evaluate(()=>previewDocument()));
  await preview.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
  assert.ok(await preview.locator('img').first().evaluate(n=>n.naturalWidth>0),'demonstration image is available');
  const layout=()=>preview.locator('.om-columns').first().evaluate(n=>({columns:getComputedStyle(n).gridTemplateColumns.split(' ').length,gap:getComputedStyle(n).gap}));
  assert.equal((await layout()).columns,2);
  const ratio=()=>preview.locator('.om-columns').first().evaluate(n=>{const c=[...n.children].filter(n=>n.classList.contains('om-column'));return c[0].getBoundingClientRect().width/c[1].getBoundingClientRect().width;});
  assert.ok(Math.abs(await ratio()-3/7)<.002,'desktop 30/70 after gap');
  assert.equal(await page.locator('#canvas .om-columns .om-columns').getAttribute('data-columns-widths'),'50,50','nested group has independent widths');
  if(capture&&brand==='outmax')await preview.locator('.om-columns').first().screenshot({path:'instructions/screens/article-columns-content.png'});
  for(const width of [390,320,800,1440]){
   await preview.setViewportSize({width,height:1000});
   assert.equal((await layout()).columns,2);
   assert.equal((await layout()).gap,width<=640?'8px':'18px');
   assert.ok(Math.abs(await ratio()-(width<=640?1:3/7))<.002,'desktop ratio, equal mobile tracks '+width);
   assert.ok(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'export overflow '+width);
  }
  await preview.setViewportSize({width:390,height:1000});
  if(capture&&brand==='outmax')await preview.locator('.om-columns').first().screenshot({path:'instructions/screens/article-columns-phone-row.png'});
  await settings();await page.locator('#columns-mobile').selectOption('1');await page.locator('#columns-dialog button[type=submit]').click();
  await preview.setContent(await page.evaluate(()=>previewDocument()));assert.equal((await layout()).columns,1);
  if(capture&&brand==='outmax')await preview.locator('.om-columns').first().screenshot({path:'instructions/screens/article-columns-phone-stack.png'});
  // A CMS fragment keeps its layout using only its own inline CSS and embedded media rules.
  await preview.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px">'+html+'</body></html>');
  for(const width of [320,390,1440]){await preview.setViewportSize({width,height:1000});assert.equal((await layout()).columns,2);assert.ok(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await preview.close();
  await page.evaluate(html=>setBody(html),html);
  assert.equal(await page.locator('#canvas .om-columns').count(),2);
  assert.equal(await page.locator('#canvas style[data-article-columns]').count(),0,'export-only stylesheet is not editable content');
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-mobile'),'2');
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'30,70','export/source roundtrip');
  assert.equal(await page.locator('#keep-six a').getAttribute('href'),'https://example.com/six');
  await page.evaluate(()=>{const root=canvas.querySelector('.om-columns');const clean=cleanImported(root,document);setBody(clean.outerHTML);});
  assert.equal(await page.locator('#canvas .om-columns').count(),2,'sanitized import preserves nested groups');
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-widths'),'30,70','sanitized import preserves proportions');
  assert.equal(await page.locator('#canvas>.om-columns').getAttribute('data-columns-mobile'),'2');
  // Existing blocks can be moved into a column without lifting the containing grid.
  const moved=await page.evaluate(()=>{
    const p=canvas.querySelector('#columns-text'),root=canvas.querySelector('.om-columns'),column=root.children[1],rect=column.getBoundingClientRect();
    if(movableBlock(p)!==p)throw Error('Text drag selected the entire grid');
    const placement=mediaPlacementAtPoint(rect.left+12,rect.top+12,p,false);
    if(placement.parent!==column)throw Error('Drop did not target the column');
    draggedBlock=p;moveDraggedBlockTo(placement);flushArticleHistorySnapshot();
    return p.parentElement===column;
  });
  assert.ok(moved);assert.equal(await page.locator('#canvas>.om-columns').count(),1);
  await page.evaluate(()=>undoArticleEditor());
  assert.equal(await page.locator('#canvas>.om-columns>.om-column').first().locator('#columns-text').count(),1);
  await page.evaluate(()=>{canvas.querySelector('.om-columns').dataset.sharedId='qa-protected';});
  await page.evaluate(()=>selectNode(canvas.querySelector('.om-columns')));await page.locator('#columns-settings').click();
  assert.equal(await page.locator('#columns-dialog').evaluate(n=>n.open),false,'protected shared layout must be detached first');
  await page.evaluate(()=>{delete canvas.querySelector('.om-columns').dataset.sharedId;});
  await settings();await page.evaluate(()=>setBody('<h1>Другой документ</h1>'));await page.locator('#columns-dialog button[type=submit]').click();
  assert.match(await page.locator('#columns-error').textContent(),/изменилась/);assert.equal(await page.locator('#canvas .om-columns').count(),0);
  await page.keyboard.press('Escape');
  for(const width of [320,390,800,1440]){await page.setViewportSize({width,height:1000});await page.locator('#add-columns').click();await page.locator('#columns-count').selectOption('6');assert.ok(await page.locator('#columns-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.equal(await page.locator('#columns-widths input').count(),6);await page.keyboard.press('Escape');}
  await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('колонки');
  await page.locator('#article-command-results').getByRole('button',{name:'Добавить колонки — от двух до шести',exact:true}).click();await page.locator('#columns-dialog[open]').waitFor();await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>['30,60','0,100','30,70,0','NaN,100','1e300,1','30.55,69.45'].map(s=>articleColumnWidths(s,2))),Array(6).fill([50,50]),'invalid imported widths safely use equal tracks');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS columns '+brand+': 30/70, width validation/cancel/undo, 2–6, content, nesting, merge, mobile, export/import, stale, commands');
 }
 if(guide){const wiki=await context.newPage();await wiki.goto(base+'/instructions/#article-columns');await wiki.getByRole('heading',{name:'Колонки: содержимое, отступы и телефон',exact:true}).waitFor();assert.equal(await wiki.locator('.wiki-step-figure').count(),5);await wiki.close();}
};
if(require.main===module){(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const base=process.env.WORKFLOW_TEST_BASE||'http://127.0.0.1:8878';await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(context,base,{guide:process.env.COLUMNS_SKIP_GUIDE!=='1'});}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});}
