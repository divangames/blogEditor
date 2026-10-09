const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const JSZip=require('../vendor/jszip.min.js'),{chromium}=require('../release/ui-check/node_modules/playwright');
const out=path.resolve('release/tiptap-prototype/file-io-real');fs.mkdirSync(out,{recursive:true});
async function main(){const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),results=[];await page.route('https://**/*',r=>r.abort());try{
 await page.goto('http://127.0.0.1:8878');await page.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
 for(const [brand,folder] of [['outmax','OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1'],['hasl','ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4']]){
  await page.locator('#brand').selectOption(brand);await page.locator('#load').click();await page.waitForFunction(b=>document.getElementById('brand').value===b&&document.getElementById('status').textContent.startsWith('Пакет открыт'),brand);const expected=await page.evaluate(()=>window.prototypeHTML());
  const zip=new JSZip(),source=fs.readFileSync(path.join(folder,'article-body.html'),'utf8');zip.file('article-body.html',source);const assets=new Map();for(const name of fs.readdirSync(path.join(folder,'assets/images'))){if(!/\.(png|jpe?g|webp|gif)$/i.test(name))continue;const bytes=fs.readFileSync(path.join(folder,'assets/images',name));if(bytes.length>12*1024*1024)continue;zip.file('assets/images/'+name,bytes);assets.set('assets/images/'+name,crypto.createHash('sha256').update(bytes).digest('hex'));}
  const file=path.join(out,brand+'.zip');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));await page.locator('#reopen').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Открыт файл:'));
  assert.equal(await page.evaluate(()=>window.prototypeHTML()),expected);const images=await page.evaluate(()=>[...document.querySelectorAll('#editor img[src]')].filter(n=>n.getAttribute('src').startsWith('blob:')).length);assert.ok(images>=5);
  const dl=page.waitForEvent('download');await page.locator('#zip').click();const saved=await dl,file2=path.join(out,brand+'-export.zip');await saved.saveAs(file2);const result=await JSZip.loadAsync(fs.readFileSync(file2));for(const [name,hash] of assets)assert.equal(crypto.createHash('sha256').update(await result.file(name).async('nodebuffer')).digest('hex'),hash);
  await page.locator('#reopen').setInputFiles(file2);await page.waitForFunction(()=>document.getElementById('status').textContent.includes('-export.zip'));assert.equal(await page.evaluate(()=>window.prototypeHTML()),expected);
  results.push({brand,htmlDOMRetained:true,localImagesVisible:images,assetHashesRetained:assets.size,zipReopen:true});
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),results,migrationAllowed:false},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
