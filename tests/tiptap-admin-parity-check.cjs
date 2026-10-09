const fs=require('node:fs'),assert=require('node:assert/strict');const {chromium}=require('../release/ui-check/node_modules/playwright');
const c=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
async function main(){const b=await chromium.launch({channel:'msedge',headless:true}),ctx=await b.newContext();try{await ctx.request.post('http://127.0.0.1:8877/login',{form:{login:c.user,password:c.password}});const old=await ctx.newPage(),next=await ctx.newPage();for(const p of [old,next])await p.route('https://**/*',r=>r.abort());
 for(const brand of ['outmax','hasl']){await old.goto('http://127.0.0.1:8877'+(brand==='hasl'?'/hasl/':'/'));await old.waitForFunction(()=>articleBackupReady);await next.goto('http://127.0.0.1:8878/?brand='+brand);await next.waitForFunction(()=>window.prototypeEditor?.getText().length>1000);
 const body='<section class="om-section" id="section-one"><h2>Проверка экспорта</h2><p style="font-family:Georgia;color:#174466;font-size:19px">Текст статьи</p><aside class="om-callout">Акцент</aside><a class="om-button" href="https://example.test/product">Кнопка</a><figure><img src="assets/photo.png" alt="Фото"></figure></section>';
 const expected=await old.evaluate(body=>{canvas.innerHTML=body;return adminBody();},body);
 await next.locator('#reopen').setInputFiles({name:'article.html',mimeType:'text/html',buffer:Buffer.from(body)});await next.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Открыт файл:'));
 const event=next.waitForEvent('download');await next.locator('#cms-html').click();const d=await event;const file='release/tiptap-prototype/file-io/cms-'+brand+'.html';await d.saveAs(file);
 const exported=await next.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html'),article=doc.querySelector('article.om-guide');return {body:article?.innerHTML||'',headStyle:!!doc.querySelector('head style'),inline:article?.querySelectorAll('[style]').length||0};},fs.readFileSync(file,'utf8'));
 assert.equal(exported.headStyle,true,brand+': standalone CMS HTML must keep its head stylesheet');
 assert.ok(exported.inline>3,brand+': CMS HTML must inline article styles for storefront sanitizers');
 assert.equal(exported.body,expected,brand+': production adminBody output differs');
 }console.log('PASS: CMS HTML matches actual production adminBody for OUTMAX and HASL.');
}finally{await b.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
