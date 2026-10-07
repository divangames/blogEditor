// Isolated feasibility check; never writes source articles or production drafts.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const spikeRequire = createRequire(path.join(root, 'release/tiptap-check/package.json'));
const {JSDOM} = spikeRequire('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {pretendToBeVisual:true});
for (const key of ['window','document','Node','HTMLElement','Element','MutationObserver','DOMParser']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(global, 'navigator', {value:dom.window.navigator, configurable:true});
const {Editor} = spikeRequire('@tiptap/core');
const {StarterKit} = spikeRequire('@tiptap/starter-kit');
const {Image} = spikeRequire('@tiptap/extension-image');
const {TableKit} = spikeRequire('@tiptap/extension-table');
const out = path.join(root, 'release/tiptap-check/results');
fs.mkdirSync(out, {recursive:true});
const sources = [
  ['outmax', 'OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1/article-body.html'],
  ['hasl', 'ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4/article-body.html'],
];
function metrics(html) {
  const doc = new JSDOM(html).window.document;
  return {
    text:doc.body.textContent.replace(/\s+/g,'').trim(),
    headings:[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(n=>[n.tagName,n.textContent.trim()]),
    images:[...doc.querySelectorAll('img')].map(n=>[n.getAttribute('src'),n.getAttribute('alt')]),
    links:[...doc.querySelectorAll('a')].map(n=>n.getAttribute('href')),
    ids:[...doc.querySelectorAll('[id]')].map(n=>n.id),
    styled:doc.querySelectorAll('[style]').length,
    classes:doc.querySelectorAll('[class]').length,
    tables:doc.querySelectorAll('table').length,
    cells:doc.querySelectorAll('td,th').length,
    wrappers:doc.querySelectorAll('article,section,header,nav,figure,figcaption').length,
    dataAttributes:[...doc.querySelectorAll('*')].reduce((sum,n)=>sum+[...n.attributes].filter(a=>a.name.startsWith('data-')).length,0),
  };
}
function extensions() {return [StarterKit, Image.configure({allowBase64:true}), TableKit];}
async function main() {
  const results = [];
  for (const [brand,relative] of sources) {
    const source = fs.readFileSync(path.join(root, relative),'utf8');
    const editor = new Editor({element:document.createElement('div'),extensions:extensions(),content:source});
    const exported = editor.getHTML();
    const json = editor.getJSON();
    const restored = new Editor({element:document.createElement('div'),extensions:extensions(),content:JSON.parse(JSON.stringify(json))});
    assert.equal(restored.getHTML(),exported,'JSON restore changed exported HTML');
    restored.commands.insertContentAt(restored.state.doc.content.size,'<p>Проверка Tiptap: тестовая правка.</p>');
    assert.ok(restored.getText().includes('Проверка Tiptap: тестовая правка.'));
    assert.equal(restored.commands.undo(),true);
    assert.equal(restored.getHTML(),exported,'Undo did not restore original parsed content');
    const before = metrics(source), after = metrics(exported);
    const checks = Object.fromEntries(Object.keys(before).map(key=>[key,JSON.stringify(before[key])===JSON.stringify(after[key])]));
    const {text:beforeText,...beforeCounts} = before;
    const {text:afterText,...afterCounts} = after;
    const result = {brand,source:relative,checks,before:{...beforeCounts,textCharacters:beforeText.length},after:{...afterCounts,textCharacters:afterText.length},jsonRestore:true,editUndo:true,migrationAllowed:Object.values(checks).every(Boolean)};
    fs.writeFileSync(path.join(out,brand+'-source.html'),source);
    fs.writeFileSync(path.join(out,brand+'-export.html'),exported);
    fs.writeFileSync(path.join(out,brand+'-document.json'),JSON.stringify(json,null,2));
    results.push(result);
    editor.destroy(); restored.destroy();
  }
  const {chromium} = require('../release/ui-check/node_modules/playwright');
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('https://**/*',r=>r.abort());
    await page.route('http://**/*',r=>r.abort());
    for (const result of results) {
      const {brand} = result;
      const assetRoot = path.dirname(path.join(root,result.source));
      for (const width of [1280,375]) {
        await page.setViewportSize({width,height:900});
        for (const kind of ['source','export']) {
          const renderDoc = new JSDOM(fs.readFileSync(path.join(out,brand+'-'+kind+'.html'),'utf8')).window.document;
          let localImages = 0;
          for (const img of renderDoc.querySelectorAll('img')) {
            const src = img.getAttribute('src') || '';
            if (/^(https?:|data:|\/)/i.test(src)) continue;
            const file = path.resolve(assetRoot,src);
            if (!file.startsWith(assetRoot+path.sep) || !fs.existsSync(file)) continue;
            const mime = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file).toLowerCase()];
            if (mime) {img.src=`data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;localImages++;}
          }
          result.localImagesRendered = localImages;
          const html = renderDoc.body.innerHTML;
          await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>');
          await page.screenshot({path:path.join(out,`${brand}-${kind}-${width}.png`),fullPage:true});
        }
      }
    }
  } finally {await browser.close();}
  const report = {checkedAt:new Date().toISOString(),dependencies:JSON.parse(fs.readFileSync(path.join(root,'release/tiptap-check/package.json'),'utf8')).dependencies,scope:'Stock StarterKit + Image + TableKit; HTML -> JSON -> HTML; isolated edit/undo. No custom brand nodes, no production migration.',limitations:['External media blocked; available relative local images embedded for screenshots.','CMS publication, production importer/exporter, ZIP media copying, collaboration and mobile input are not covered.'],results};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(results.map(r=>({brand:r.brand,checks:r.checks,migrationAllowed:r.migrationAllowed,jsonRestore:r.jsonRestore,editUndo:r.editUndo})),null,2));
  console.log('Report: '+path.join(out,'report.json'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
