const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function(editor,context,brand,{capture=false}={}){
 const html=await editor.evaluate(()=>{const template=document.createElement('template');template.innerHTML=adminBody();const faq=template.content.querySelector('.om-faq');faq.querySelectorAll('*').forEach(n=>{n.removeAttribute('class');for(const a of [...n.attributes])if(a.name.startsWith('data-'))n.removeAttribute(a.name);});faq.removeAttribute('class');return faq.outerHTML;});
 const page=await context.newPage();
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px Arial;color:#231815}summary{display:block!important;list-style:none!important}summary::-webkit-details-marker{display:none}</style>'+html);
 const summary=page.locator('summary').first();
 const metrics=()=>summary.evaluate(n=>({display:getComputedStyle(n).display,type:getComputedStyle(n).listStyleType,marker:getComputedStyle(n,'::marker').color,text:getComputedStyle(n.querySelector('span')).color,open:n.parentElement.open}));
 let m=await metrics();assert.equal(m.display,'list-item');assert.equal(m.type,'disclosure-open');assert.equal(m.marker,brand==='hasl'?'rgb(199, 245, 0)':'rgb(227, 30, 36)');assert.equal(m.text,brand==='hasl'?'rgb(255, 255, 255)':'rgb(35, 24, 21)');
 await summary.click();m=await metrics();assert.equal(m.open,false);assert.equal(m.type,'disclosure-closed');
 await summary.focus();await page.keyboard.press('Enter');assert.equal((await metrics()).type,'disclosure-open');
 for(const width of [1000,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(capture&&width!==320){await summary.blur();await page.screenshot({path:`instructions/screens/article-faq-${brand}-cms${width===390?'-mobile':''}.png`});}}
 await page.close();
 // A round trip must not accumulate wrappers or recolor the editable question.
 await editor.evaluate(()=>setBody(adminBody()));assert.equal(await editor.locator('#canvas .om-faq-label').count(),0);
 assert.equal(await editor.locator('#canvas .om-faq-question').first().evaluate(n=>getComputedStyle(n).color),brand==='hasl'?'rgb(255, 255, 255)':'rgb(35, 24, 21)');
 if(capture){await editor.evaluate(()=>clearSelection());await editor.setViewportSize({width:1440,height:1000});await editor.locator('#add-faq').scrollIntoViewIfNeeded();await editor.locator('#add-faq').screenshot({path:`instructions/screens/article-faq-${brand}-tool.png`});}
 if(brand==='outmax'){
  const supplied=fs.readFileSync('tests/fixtures/article-faq-cms.html','utf8');
  const repaired=await editor.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('summary').forEach(styleArticleFaqDisclosure);return doc.body.innerHTML;},supplied);
  const fixture=await context.newPage();await fixture.setContent('<style>summary{display:block;list-style:none}</style>'+repaired);
  const first=fixture.locator('summary').first();assert.equal(await first.evaluate(n=>getComputedStyle(n).listStyleType),'disclosure-open');await first.click();assert.equal(await first.evaluate(n=>getComputedStyle(n).listStyleType),'disclosure-closed');assert.equal(await fixture.locator('summary').count(),3);await fixture.close();
  fs.mkdirSync('output/faq-fix',{recursive:true});fs.writeFileSync('output/faq-fix/faq-fixed.html',repaired);
 }
 console.log('PASS CMS FAQ '+brand+': no classes/editor CSS, hostile reset, colored native arrows both states, keyboard, roundtrip, 1000/390/320px');
};
