// Read-only production MCP verification. No document writes or provider calls.
const {spawn}=require('node:child_process'),readline=require('node:readline'),fs=require('node:fs'),assert=require('node:assert/strict');
const credentials=JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8'));
const child=spawn(process.execPath,['tools/article-mcp.cjs'],{env:{...process.env,EDITOR_MCP_URL:'https://news.outmax-office.ru',EDITOR_MCP_USER:credentials.user,EDITOR_MCP_PASSWORD:credentials.password},stdio:['pipe','pipe','pipe']});
let next=1;const pending=new Map();child.stderr.resume();readline.createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),callback=pending.get(value.id);if(callback){pending.delete(value.id);callback(value);}});
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>reject(Error('Production MCP timeout')),45000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
(async()=>{try{
 await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'readonly-qa',version:'1'}});
 for(const name of ['list_commands','inspect_document']){const result=await rpc('tools/call',{name,arguments:{}});assert.equal(result.result.isError,false);const data=JSON.parse(result.result.content[0].text);if(name==='list_commands')assert.ok(data.some(command=>command.id==='export.docx'));else assert.equal(data.brand,'outmax');}
 console.log('PASS: production MCP authenticates, reads document and sees real export/formatting registry; no saves or paid calls');
}finally{child.stdin.end();await new Promise(resolve=>{child.on('exit',resolve);setTimeout(()=>{child.kill();resolve();},4000).unref();});}})().catch(error=>{console.error(error.message);process.exitCode=1;child.kill();});
