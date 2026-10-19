const {chromium}=require('../release/ui-check/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base='http://127.0.0.1:8878',context=await browser.newContext();
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  const page=await context.newPage();await page.goto(base+'/');await page.locator('#canvas').waitFor();
  const output=[];
  for(const item of [{text:'Текст 👟',html:'<b>Текст</b> <a href="https://example.com/qa">👟</a>'},{text:'Цена 7990',html:'<table><tr><th>Цена</th><td>7990</td></tr></table>'}]){
   output.push(await page.evaluate(item=>{setBody('<header><h1>QA</h1></header><p id="legacy-paste">До после</p>',{normalize:false});resetArticleEditorHistory();const text=document.querySelector('#legacy-paste').firstChild,range=document.createRange();range.setStart(text,3);range.collapse(true);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range;const data=new DataTransfer();data.setData('text/plain',item.text);data.setData('text/html',item.html);canvas.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));flushArticleHistorySnapshot();return {body:articleEditorSnapshot().body.replace(/^<script type="application\/ld\+json">[\s\S]*?<\/script>/,''),index:articleHistoryIndex};},item));
  }
  assert.ok(output.every(item=>item.index===1));
  if(process.argv.includes('--baseline')){fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/paste-legacy.json',JSON.stringify(output));console.log('PASS: legacy article paste baseline saved');}
  else{assert.deepEqual(output,JSON.parse(fs.readFileSync('tests/fixtures/paste-legacy.json','utf8')));console.log('PASS: ordinary article paste matches pre-change inline/table baseline and one undo');}
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
