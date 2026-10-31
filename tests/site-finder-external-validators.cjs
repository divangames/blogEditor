const {chromium}=require('../release/ui-check/node_modules/playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async()=>{
 const folder=path.resolve('release/finder-validator-final-20261027'),reports=[];const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const service of ['schema','google'])for(const [label,file] of [['html','export.html'],['zip','zip-page.html']]){
  const html=fs.readFileSync(path.join(folder,file),'utf8'),p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(60000);
  if(service==='schema'){
   await p.goto('https://validator.schema.org/');await p.getByText('Фрагмент кода',{exact:true}).click();await p.locator('#new-test-textarea').evaluate((n,html)=>n.parentElement.querySelector('.CodeMirror').CodeMirror.setValue(html),html);await p.locator('#new-test-submit-button').click();await p.getByText('НЕТ ОШИБОК',{exact:true}).first().waitFor();await p.getByText('НЕТ ПРЕДУПРЕЖДЕНИЙ',{exact:true}).first().waitFor();
  }else{
   await p.goto('https://search.google.com/test/rich-results?hl=ru');await p.getByRole('tab').filter({hasText:'КОД'}).click();await p.locator('.CodeMirror').first().evaluate((n,html)=>n.CodeMirror.setValue(html),html);await p.getByRole('button',{name:'Проверить код',exact:true}).click();await p.waitForURL(/\/result\?/);await p.getByText('Результаты проверки',{exact:true}).waitFor();await p.getByText(/Обнаружено \d+.*элемент.*без ошибок/).first().waitFor();
  }
  await p.screenshot({path:path.join(folder,service+'-'+label+'-full.png')});await p.screenshot({path:'instructions/screens/site-finder-'+service+'-'+label+'.png',clip:{x:640,y:service==='schema'?158:64,width:640,height:service==='schema'?380:800}});
  const text=await p.locator('body').innerText();fs.writeFileSync(path.join(folder,service+'-'+label+'.txt'),text);const report={service,file,url:p.url(),inputSha256:crypto.createHash('sha256').update(html).digest('hex'),summary:text.slice(text.indexOf(service==='schema'?'CollectionPage':'Результаты проверки'))};
  if(service==='google'){
   for(const title of ['Описания товара','Данные о товарах продавца','Статьи']){await p.goto(report.url);const tile=p.getByText(title,{exact:true}).first();if(await tile.count()){await tile.click();await p.waitForTimeout(1000);const issues=p.getByText(/\d+ незначительн.*проблем/).first();if(await issues.count()){await issues.click();await p.waitForTimeout(300);}fs.writeFileSync(path.join(folder,service+'-'+label+'-'+(title==='Описания товара'?'product':title==='Статьи'?'article':'merchant')+'.txt'),await p.locator('body').innerText());}}

  }
  reports.push(report);console.log('VALIDATOR_PASS',service,label,service==='google'?p.url():'0 errors, 0 warnings');await p.close();
 }
 fs.writeFileSync(path.join(folder,'external-results.json'),JSON.stringify(reports,null,2));assert.equal(reports.length,4);
 }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exit(1)});
