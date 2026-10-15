// End-to-end JSON-RPC stdio against the isolated demonstration server.
const {spawn}=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict'),fs=require('node:fs');
const child=spawn(process.execPath,['tools/article-mcp.cjs'],{env:{...process.env,EDITOR_MCP_URL:'http://127.0.0.1:8878',EDITOR_MCP_USER:'wiki-demo',EDITOR_MCP_PASSWORD:'wiki-local-demo-only'},stdio:['pipe','pipe','pipe']});
let next=1,stderr='';const pending=new Map();child.stderr.on('data',chunk=>stderr+=chunk);
const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{let response;try{response=JSON.parse(line);}catch{throw Error('Non-JSON stdout');}const task=pending.get(response.id);if(task){pending.delete(response.id);task.resolve(response);}});
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>reject(Error('RPC timeout '+method+' '+stderr)),45000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const tool=async(name,args={})=>{const response=await rpc('tools/call',{name,arguments:args});assert.equal(response.result.isError,false,response.result.content[0].text);return JSON.parse(response.result.content[0].text);};
(async()=>{
 try{
  assert.equal((await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'qa',version:'1'}})).result.protocolVersion,'2025-11-25');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const list=await rpc('tools/list');assert.ok(list.result.tools.some(t=>t.name==='batch'));
  await tool('new_document',{text:'Первый фрагмент 👟\nПовторный фрагмент 👟'});
  const initial=await tool('inspect_document',{include_html:true});assert.equal(initial.needsSave,true);
  await tool('select_text',{text:'Первый фрагмент 👟'});
  await tool('batch',{steps:[{id:'format.bold'},{id:'format.italic'}]});
  assert.notEqual((await tool('inspect_document',{include_html:true})).html,initial.html);
  await tool('execute',{command:'edit.undo'});assert.equal((await tool('inspect_document',{include_html:true})).html,initial.html);
  await tool('select_text',{text:'Повторный фрагмент 👟'});await tool('type_text',{text:'Новый текст 👟'});
  assert.match((await tool('inspect_document')).text,/Новый текст 👟/);
  assert.equal((await tool('execute',{command:'edit.find',params:{query:'Новый текст 👟'}})).count,1);
  await tool('execute',{command:'edit.replaceFound',params:{text:'Замена через поиск 👟'}});assert.match((await tool('inspect_document')).text,/Замена через поиск/);
  await tool('execute',{command:'edit.undo'});assert.match((await tool('inspect_document')).text,/Новый текст 👟/);
  await tool('select_text',{text:'Новый текст 👟'});const beforeLink=await tool('inspect_document',{include_html:true});
  assert.equal((await tool('execute',{command:'link.insert',params:{url:'https://example.com/mcp-link'}})).applied,true);
  assert.match((await tool('inspect_document',{include_html:true})).html,/href="https:\/\/example.com\/mcp-link"/);
  await tool('execute',{command:'edit.undo'});assert.equal((await tool('inspect_document',{include_html:true})).html,beforeLink.html);
  assert.equal((await rpc('tools/call',{name:'execute',arguments:{command:'link.open'}})).result.isError,true,'MCP must not open a blocking native prompt');
  assert.equal((await rpc('tools/call',{name:'execute',arguments:{command:'link.insert',params:{url:'javascript:alert(1)'}}})).result.isError,true);
  assert.equal((await tool('inspect_document',{include_html:true})).html,beforeLink.html);
  const bad=await rpc('tools/call',{name:'execute',arguments:{command:'review.propose'}});assert.equal(bad.result.isError,true);
  const guarded=await rpc('tools/call',{name:'open_document',arguments:{id:'anything'}});assert.equal(guarded.result.isError,true);assert.match(guarded.result.content[0].text,/Unsaved/);
  const saved=await tool('save_document',{title:'MCP QA '+Date.now()});assert.ok(saved.revision);
  await tool('new_document',{text:'Другой документ'});await tool('open_document',{id:saved.id,discard_changes:true});
  assert.match((await tool('inspect_document')).text,/Новый текст 👟/);
  await tool('select_text',{text:'Новый текст 👟'});await tool('type_text',{text:'После открытия 👟'});assert.match((await tool('inspect_document')).text,/После открытия/);
  const exported=await tool('export_document',{format:'docx'});assert.ok(fs.statSync(exported.path).size>500);
  assert.equal((await rpc('not-a-method')).error.code,-32601);
  assert.deepEqual((await rpc('ping')).result,{});
  console.log('PASS: MCP lifecycle, schemas, inspection, exact selection, insertion, atomic batch/undo, guarded navigation, explicit save/open, real DOCX download, unsupported method and ping');
 }finally{child.stdin.end();await new Promise(resolve=>{child.on('exit',resolve);setTimeout(()=>{child.kill();resolve();},4000).unref();});}
})().catch(error=>{console.error(error);process.exitCode=1;child.kill();});
