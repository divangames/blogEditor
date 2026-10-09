const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../release/ui-check/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release/tiptap-prototype/results-block');
async function main(){
  const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();await page.route('https://**/*',r=>r.abort());const results=[];
  try{
    for(const [brand,file] of [['outmax','OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1/article-body.html'],['hasl','ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4/article-body.html']]){
      for(const width of [1280,375]){
        await page.setViewportSize({width,height:900});const values=[];
        for(const [kind,html] of [['source',fs.readFileSync(path.join(root,file),'utf8')],['export',fs.readFileSync(path.join(out,brand+'-export.html'),'utf8')]]){
          await page.goto('http://127.0.0.1:8878');
          await page.setContent(`<!doctype html><html><head><base href="http://127.0.0.1:8878/media/${brand}/"><link rel="stylesheet" href="http://127.0.0.1:8878/${brand}.css"></head><body>${html}</body></html>`);
          await page.evaluate(async()=>{await document.fonts.ready;for(const image of document.images)image.loading='eager';await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,5000))]);});
          values.push(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return [n.localName,...[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10),s.color,s.backgroundColor,s.fontFamily,s.fontSize,s.fontWeight,s.borderRadius,s.display];})));
          await page.screenshot({path:path.join(out,`${brand}-${kind}-${width}.png`),fullPage:true});
        }
        assert.equal(JSON.stringify(values[0]),JSON.stringify(values[1]),`${brand}: export layout changed at ${width}px`);results.push({brand,width,exportLayoutParity:true});
      }
    }
    fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),browser:'Microsoft Edge',externalImagesBlocked:true,contenteditableLayoutCovered:false,results,migrationAllowed:false},null,2));console.log('Export layout: both brands, 1280/375 px passed.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
