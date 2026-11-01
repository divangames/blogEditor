// Delete only this QA's disposable material. Never delete the user's source.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {request}=require('../release/ui-check/node_modules/playwright');
(async()=>{
 const base='https://news.outmax-office.ru',credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
 const api=await request.newContext({httpCredentials:{username:credentials.user,password:credentials.password},extraHTTPHeaders:{Origin:base,Accept:'application/json'}});
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 const path=id=>base+'/editor-api/email-projects/'+encodeURIComponent(id);
 async function remove(id){
  assert.match(id,/^(qa-delete-\d+|copy-[a-f0-9]{24})$/);
  const before=await api.get(path(id));if(before.status()===404)return;
  assert.equal(before.status(),200);
  const started=Date.now(),response=await api.delete(path(id),{timeout:90000});
  assert.equal(response.status(),200,'Disposable email DELETE status '+response.status());
  assert.match(response.headers()['content-type'],/application\/json/);
  assert.equal((await response.json()).ok,true);
  assert.equal((await api.get(path(id))).status(),404);
  console.log('LIVE_EMAIL_DELETE_PASS: JSON success and confirmed absence, '+(Date.now()-started)+' ms');
 }
 try{
  assert.ok([200,302].includes((await api.post(base+'/login',{maxRedirects:0,form:{login:credentials.user,password:credentials.password}})).status()));
  if(fs.existsSync('tmp/live-delete-demo.json')){
   const previous=JSON.parse(fs.readFileSync('tmp/live-delete-demo.json','utf8'));assert.match(previous.id,/^qa-delete-\d+$/);await remove(previous.id);
  }
  const id='qa-delete-'+Date.now(),saved=await api.post(path(id),{data:{filename:'Техническая проверка удаления',subject:'Техническая проверка удаления',canvasHtml:'<p>QA demo only</p>',renderedHtml:'<p>QA demo only</p>'}});
  assert.equal(saved.status(),200);fs.writeFileSync('tmp/live-delete-demo.json',JSON.stringify({id}));await remove(id);
  const list=await(await api.get(base+'/editor-api/email-projects')).json();
  const source=list.items.find(x=>[x.filename,x.subject].some(value=>String(value||'').trim()==='Зима 27'));
  if(source){
   const before=await(await api.get(path(source.id))).body();
   const copy=await api.post(path(source.id)+'/copy');assert.equal(copy.status(),201);
   const duplicate=await copy.json();assert.notEqual(duplicate.id,source.id);assert.match(duplicate.id,/^copy-[a-f0-9]{24}$/);
   fs.writeFileSync('tmp/live-delete-copy.json',JSON.stringify({id:duplicate.id}));await remove(duplicate.id);
   assert.equal(hash(await(await api.get(path(source.id))).body()),hash(before),'Original email changed');
   console.log('LIVE_EMAIL_SOURCE_PASS: disposable copy deleted, original content/revision unchanged');
  }
 }finally{await api.dispose();}
})().catch(error=>{console.error(String(error.message).split('Call log:')[0]);process.exit(1);});
