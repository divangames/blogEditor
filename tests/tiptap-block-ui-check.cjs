const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release/tiptap-prototype/results-block');
async function main(){
  const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  const results=[];
  async function reload(brand){const version=await page.evaluate(()=>window.prototypeMountVersion||0);await page.locator('#brand').selectOption(brand);await page.locator('#load').click();await page.waitForFunction(v=>window.prototypeMountVersion>v,version);}
  async function select(kind,offset=1,extra={}){
    await page.evaluate(({kind,offset,extra})=>{
      const e=window.prototypeEditor;let pos,node;
      e.state.doc.descendants((n,p)=>{if(pos===undefined&&n.type.name===kind&&(!extra.text||n.textContent.includes(extra.text))&&(!extra.real||!n.attrs.transparent)){pos=p;node=n;}});
      if(pos===undefined)throw Error('Node not found: '+kind);e.commands.setTextSelection(Math.min(pos+offset,pos+node.nodeSize-1));e.view.focus();
    },{kind,offset,extra});
  }
  const html=()=>page.evaluate(()=>window.prototypeHTML());
  const count=kind=>page.evaluate(kind=>{let n=0;window.prototypeEditor.state.doc.descendants(node=>{if(node.type.name===kind)n++;});return n;},kind);
  async function paste(data){await page.evaluate(data=>{const transfer=new DataTransfer();for(const [type,value] of Object.entries(data))transfer.setData(type,value);document.querySelector('#editor .ProseMirror').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},data);}
  try{
    await page.goto('http://127.0.0.1:8878');await page.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
    for(const brand of ['outmax','hasl']){
      await reload(brand);const original=await html();
      assert.equal(await page.locator('.paper .ProseMirror').evaluate(n=>getComputedStyle(n).whiteSpace),'pre-wrap');
      await select('paragraph',5,{real:true});const paragraphs=await count('paragraph');
      await page.keyboard.press('Enter');assert.equal(await count('paragraph'),paragraphs+1);
      assert.equal(await page.evaluate(()=>window.prototypeEditor.state.selection.$from.parent.type.name),'paragraph');
      await page.keyboard.type('Новый абзац   с пробелами');
      assert.ok(await page.evaluate(()=>window.prototypeEditor.getText().includes('Новый абзац   с пробелами')));
      assert.ok(await page.evaluate(()=>window.prototypeEditor.state.selection.empty));
      assert.equal(await page.evaluate(()=>window.prototypeEditor.state.selection.$from.parentOffset),'Новый абзац   с пробелами'.length);
      // Independent Shift+Enter and undo on a fresh editor.
      await reload(brand);await select('paragraph',5,{real:true});const breaks=await count('hardBreak'),pBefore=await count('paragraph');
      await page.keyboard.press('Shift+Enter');assert.equal(await count('hardBreak'),breaks+1);assert.equal(await count('paragraph'),pBefore);
      await page.locator('#undo').click();assert.equal(await html(),original);
      // Apply H2 to an ordinary paragraph and split without cloning its anchor.
      await select('paragraph',5,{real:true});await page.locator('#heading').selectOption('h2');
      const anchor=await page.evaluate(()=>window.prototypeEditor.state.selection.$from.parent.attrs.htmlAttrs.id);assert.ok(anchor);
      await page.keyboard.press('End');await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(id=>{const t=document.createElement('template');t.innerHTML=window.prototypeHTML();return [...t.content.querySelectorAll('[id]')].filter(n=>n.id===id).length;},anchor),1);
      // Table commands operate on native cells, and survive JSON reopening.
      await reload(brand);await select('tableCell',2);const rows=await count('tableRow'),cells=await count('tableCell');
      await page.locator('#row-add').click();assert.equal(await count('tableRow'),rows+1);
      await page.locator('#column-add').click();assert.ok(await count('tableCell')>cells);
      const withColumns=await html();await page.locator('#column-delete').click();await page.locator('#undo').click();assert.equal(await html(),withColumns);
      await page.locator('#row-delete').click();await page.locator('#undo').click();assert.equal(await html(),withColumns);
      await page.evaluate(()=>window.prototypeEditor.state.doc.check());
      const edited=await html(),downloadPromise=page.waitForEvent('download');await page.locator('#json').click();const download=await downloadPromise;
      const jsonFile=path.join(out,brand+'-edited.json');await download.saveAs(jsonFile);await page.locator('#reopen').setInputFiles(jsonFile);await page.waitForFunction(()=>document.getElementById('status').textContent==='JSON повторно открыт.');assert.equal(await html(),edited);
      // Representative Word and Google Docs fragments, not an exhaustive paste corpus.
      await reload(brand);await select('paragraph',5,{real:true});
      await paste({'text/html':'<p class="MsoNormal"><span style="font-family:Georgia;font-size:18px;color:#d00000">Word: <strong>жирный</strong></span></p><ul><li>Word пункт</li></ul>'});
      assert.ok((await html()).includes('font-family:Georgia'));assert.ok((await html()).includes('<strong>жирный</strong>'));assert.ok((await html()).includes('Word пункт'));
      await paste({'text/html':'<p><b id="docs-internal-guid-test" style="font-weight:normal"><span style="font-style:italic">Docs фрагмент</span> <a href="https://example.test/source">источник</a></b></p>'});assert.ok((await html()).includes('https://example.test/source'));assert.ok((await html()).includes('Docs фрагмент'));
      await paste({'text/plain':'Первая строка\nВторая строка'});assert.ok((await html()).includes('Первая строка'));assert.ok((await html()).includes('Вторая строка'));
      const prior=await html();await paste({'text/html':'<unknown-widget>Не потерять</unknown-widget>'});assert.equal(await html(),prior);assert.ok((await page.locator('#status').innerText()).startsWith('Вставка отменена'));
      const invalidFile=path.join(out,brand+'-invalid.json');fs.writeFileSync(invalidFile,JSON.stringify({format:'brand-block-prototype-v2',brand:brand==='hasl'?'outmax':'hasl',document:{type:'doc',content:[{type:'paragraph',attrs:{tag:'script',htmlAttrs:{}}}]}}));
      await page.locator('#reopen').setInputFiles(invalidFile);await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Открытие отменено:'));assert.equal(await html(),prior);assert.equal(await page.locator('#brand').inputValue(),brand);
      // Scoped Ctrl+A keeps the TOC arrow intact while replacing its label.
      await reload(brand);await page.evaluate(()=>{const e=window.prototypeEditor;let p;e.state.doc.descendants((n,pos)=>{if(p===undefined&&n.type.name==='tocArrow')p=pos;});e.commands.setTextSelection(p-2);e.view.focus();});
      const arrows=await count('tocArrow');await page.keyboard.press('Control+a');await page.keyboard.type('Новое название оглавления');assert.equal(await count('tocArrow'),arrows);assert.ok((await html()).includes('Новое название оглавления'));
      // Bold must retain existing inline font and colour rather than replacing them.
      await reload(brand);await select('paragraph',1,{real:true});await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');await page.locator('#bold').click();assert.ok((await html()).includes('<strong>'));await page.locator('#undo').click();assert.equal(await html(),original);
      for(const width of [1280,375]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,brand+'-editor-'+width+'.png')});}
      results.push({brand,enter:true,shiftEnter:true,spacesAndCaret:true,newHeadingAnchor:true,nativeRowsAndColumns:true,deleteRowColumnUndo:true,editedJSONReopen:true,representativeWordDocsPaste:true,plainTextMultilinePaste:true,unknownPasteRejected:true,invalidJSONKeepsCurrentDocument:true,tocArrowProtected:true,boldUndo:true,toolbarWidths:[1280,375]});
    }
    assert.deepEqual(errors,[]);
    await page.locator('#reopen').setInputFiles(path.join(out,'legacy-v1.json'));await page.waitForFunction(()=>document.getElementById('status').textContent==='JSON v1 преобразован в блочную модель.');
    assert.equal(await page.locator('#brand').inputValue(),'outmax');assert.equal(await count('tocArrow'),1);assert.equal(await count('table'),1);await page.evaluate(()=>window.prototypeEditor.state.doc.check());
    const report={checkedAt:new Date().toISOString(),browser:'Microsoft Edge',externalImagesBlocked:true,syntheticClipboardEvents:true,legacyV1Conversion:true,reopenedBrandApplied:true,results,migrationAllowed:false};fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
