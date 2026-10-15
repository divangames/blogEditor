#!/usr/bin/env node
// MCP stdio 2025-11-25. One private browser session over the real editor registry.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.env.EDITOR_PLAYWRIGHT_MODULE || path.join(root,'release/ui-check/node_modules/playwright'));
const base=new URL(process.env.EDITOR_MCP_URL || 'https://news.outmax-office.ru');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Use an HTTP(S) editor origin without embedded credentials');
const origin=base.origin;
let browser,context,page,initialized=false;
async function installBridge(p){
 await p.evaluate(()=>{
  if(ArticleCommands.list().some(command=>command.id==='text.insert'))return;
  ArticleCommands.register({id:'text.insert',label:'Вставить текст',run:({text})=>{
   if(typeof text!=='string'||text.length>16000)throw Error('Текст должен быть строкой до 16000 символов');
   if(!lastRange||!canvas.contains(lastRange.commonAncestorContainer))throw Error('Сначала выделите текст');
   flushArticleHistorySnapshot();restoreCanvasSelection();rememberArticleSelectionBeforeInput();
   if(!document.execCommand('insertText',false,text))throw Error('Не удалось вставить текст');changed();return {inserted:text.length};
  }});
 });
}
const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'};
const tools=[
 {name:'list_commands',description:'List current editor commands and availability.',inputSchema:object({query:string}),annotations:{readOnlyHint:true}},
 {name:'inspect_document',description:'Read current text, selection, HTML on request, save state and brand.',inputSchema:object({include_html:{type:'boolean'}}),annotations:{readOnlyHint:true}},
 {name:'open_document',description:'Open a saved document in this account. Refuses to discard unsaved changes unless requested.',inputSchema:object({id:string,brand:{enum:['outmax','hasl']},discard_changes:{type:'boolean'}},['id'])},
 {name:'new_document',description:'Start an unsaved plain-text document in a private session.',inputSchema:object({text:string,discard_changes:{type:'boolean'}})},
 {name:'select_text',description:'Select an exact occurrence (1-based) across document text nodes.',inputSchema:object({text:string,occurrence:{type:'integer',minimum:1}},['text']),annotations:{readOnlyHint:true}},
 {name:'type_text',description:'Insert plain text at the current selection through the existing editing history.',inputSchema:object({text:string},['text'])},
 {name:'execute',description:'Run a formatting/style command, undo, redo or focus. Cannot trigger AI or dialogs.',inputSchema:object({command:string,params:{type:'object'}},['command'])},
 {name:'batch',description:'Run up to 40 repeatable formatting commands as one undo step. Failure restores the document.',inputSchema:object({steps:{type:'array',minItems:1,maxItems:40,items:object({id:string,params:{type:'object'}},['id'])}},['steps'])},
 {name:'save_document',description:'Explicitly save the current document using existing revision/conflict checks. No implicit saves in this session.',inputSchema:object({title:string})},
 {name:'export_document',description:'Create a local DOCX, Markdown or PDF copy in output/mcp-export.',inputSchema:object({format:{enum:['docx','markdown','pdf']}},['format']),annotations:{readOnlyHint:true}}
];
async function editor(){
 if(page)return page;
 const user=process.env.EDITOR_MCP_USER,password=process.env.EDITOR_MCP_PASSWORD;
 if(!user||!password)throw Error('Set EDITOR_MCP_USER and EDITOR_MCP_PASSWORD in the MCP client environment');
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 context=await browser.newContext({httpCredentials:{username:user,password,origin},acceptDownloads:true});
 await context.addInitScript(()=>{window.__EDITOR_AGENT_MODE__=true;});
 const login=await context.request.post(origin+'/login',{form:{login:user,password},headers:{Origin:origin}});
 if(!login.ok())throw Error('Editor authentication failed');
 page=await context.newPage();page.setDefaultTimeout(20000);
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ArticleCommands && typeof articleBackupReady!=='undefined' && articleBackupReady);
 await installBridge(page);
 return page;
}
async function protect(a){const p=await editor();if(!a.discard_changes&&await p.evaluate(()=>articleNeedsSave))throw Error('Unsaved changes: save first or explicitly set discard_changes');return p;}
function validate(name,a){
 const spec=tools.find(t=>t.name===name);if(!spec)throw Error('Unknown tool');
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Arguments must be an object');
 for(const key of Object.keys(a))if(!(key in spec.inputSchema.properties))throw Error('Unknown argument: '+key);
 for(const key of spec.inputSchema.required)if(!(key in a))throw Error('Missing argument: '+key);
 for(const [key,value] of Object.entries(a)){const schema=spec.inputSchema.properties[key];if(schema.type==='string'&&(typeof value!=='string'||value.length>100000))throw Error('Invalid string: '+key);if(schema.type==='boolean'&&typeof value!=='boolean')throw Error('Invalid boolean: '+key);if(schema.enum&&!schema.enum.includes(value))throw Error('Invalid value: '+key);}
}
async function call(name,a){
 validate(name,a);const p=await editor();
 if(name==='list_commands')return p.evaluate(query=>ArticleCommands.list(query),a.query||'');
 if(name==='inspect_document')return p.evaluate(include=>({id:currentId,brand:ACTIVE_EDITOR.key,title:document.querySelector('#page-title').value,text:canvas.innerText,selection:getSelection()?.toString()||'',needsSave:articleNeedsSave,revision:articleServerRevision,...(include?{html:adminBody({keepLinks:true})}:{})}),!!a.include_html);
 if(name==='open_document'){
  await protect(a);if(!/^[a-zA-Z0-9_-]{1,180}$/.test(a.id))throw Error('Invalid document id');
  const brand=a.brand||'outmax';await p.goto(origin+(brand==='hasl'?'/hasl/':'/')+'?article='+encodeURIComponent(a.id),{waitUntil:'domcontentloaded'});
  await p.waitForFunction(id=>articleBackupReady&&currentId===id&&articleDocumentId,a.id);
  await installBridge(p);
  return call('inspect_document',{});
 }
 if(name==='new_document'){
  await protect(a);
  await p.evaluate(text=>{currentId='agent-'+crypto.randomUUID().slice(0,12);lockedId=false;document.querySelector('#filename').value=currentId;document.querySelector('#filename').disabled=false;document.querySelector('#page-title').value='Новая статья — '+ACTIVE_EDITOR.name;setArticleSaveDocument();const host=document.createElement('div');for(const line of String(text||'').split('\n')){const paragraph=document.createElement('p');paragraph.textContent=line;host.append(paragraph);}setBody(host.innerHTML);restoreProducts([]);resetArticleEditorHistory();changed();},a.text||'');
  return call('inspect_document',{});
 }
 if(name==='select_text')return p.evaluate(({text,occurrence=1})=>{
  if(!text||!Number.isInteger(occurrence)||occurrence<1)throw Error('Use nonempty text and a positive occurrence');
  const walker=document.createTreeWalker(canvas,NodeFilter.SHOW_TEXT),nodes=[];let node,total='';
  while(node=walker.nextNode()){nodes.push({node,start:total.length});total+=node.textContent;}
  let start=-1,from=0;for(let i=0;i<occurrence;i++){start=total.indexOf(text,from);if(start<0)throw Error('Text occurrence not found');from=start+text.length;}
  const locate=offset=>{for(const item of nodes)if(offset<=item.start+item.node.length)return[item.node,offset-item.start];throw Error('Invalid selection');};
  const [first,x]=locate(start),[last,y]=locate(start+text.length),range=document.createRange();range.setStart(first,x);range.setEnd(last,y);getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();canvas.focus({preventScroll:true});return {selected:getSelection().toString()};
 },a);
 if(name==='type_text')return p.evaluate(text=>ArticleCommands.execute('text.insert',{text}),a.text);
 if(name==='execute')return p.evaluate(({command,params={}})=>{
  if(!(command.startsWith('format.')||command==='style.apply'||['edit.undo','edit.redo','view.focus','edit.find','edit.findNext','edit.findPrevious','edit.replaceFound','link.insert'].includes(command)))throw Error('Command not exposed by this bridge');
  return ArticleCommands.execute(command,params)??{ok:true};
 },a);
 if(name==='batch')return p.evaluate(steps=>ArticleCommands.batch(steps),a.steps);
 if(name==='save_document')return p.evaluate(async({title})=>{
  if(title){document.querySelector('#page-title').value=title;changed();}
  if(articleHasDefaultTitle())throw Error('Provide a non-default title before saving');
  if(articleSaveConflict)throw Error('Resolve the document conflict in the editor before saving');
  const result=await save();if(!result)throw Error('Save not confirmed');return {id:result.id,revision:result.revision,savedAt:result.savedAt};
 },a);
 if(name==='export_document'){
  const output=path.join(root,'output','mcp-export');fs.mkdirSync(output,{recursive:true});
  const filename=path.join(output,Date.now()+'-'+require('node:crypto').randomUUID()+'-'+a.format+'.'+(a.format==='markdown'?'md':a.format));
  if(a.format==='pdf'){
   await p.evaluate(()=>ArticleCommands.execute('export.pdf'));
   const html=await p.locator('#article-print-frame').evaluate(n=>n.contentDocument.documentElement.outerHTML),print=await context.newPage();
   try{await print.goto(origin+'/instructions/',{waitUntil:'domcontentloaded'});await print.setContent(html,{waitUntil:'networkidle'});await print.pdf({path:filename,format:'A4',printBackground:true,preferCSSPageSize:true});}finally{await print.close();}
  }else{
   const downloading=p.waitForEvent('download');await p.evaluate(format=>ArticleCommands.execute('export.'+format),a.format);const download=await downloading;await download.saveAs(filename);
  }
  return {path:filename,bytes:fs.statSync(filename).size};
 }
}
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function handle(message){
 if(message.jsonrpc!=='2.0'||!message.method){send({jsonrpc:'2.0',id:message.id??null,error:{code:-32600,message:'Invalid request'}});return;}
 if(message.id===undefined)return; // notifications never receive a response
 try{
  let result;
  if(message.method==='initialize'){initialized=true;result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'outmax-article-editor',version:'1.0.0'}};}
  else if(message.method==='ping')result={};
  else if(!initialized)throw Error('Initialize first');
  else if(message.method==='tools/list')result={tools};
  else if(message.method==='tools/call'){
   try{const value=await call(message.params.name,message.params.arguments||{});result={content:[{type:'text',text:JSON.stringify(value??{ok:true})}],isError:false};}
   catch(error){let message=String(error.message||'Operation failed').split('\n')[0];for(const secret of [process.env.EDITOR_MCP_USER,process.env.EDITOR_MCP_PASSWORD])if(secret)message=message.replaceAll(secret,'[redacted]');result={content:[{type:'text',text:message}],isError:true};}
  }else{send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}});return;}
  send({jsonrpc:'2.0',id:message.id,result});
 }catch{send({jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Invalid request parameters'}});}
}
let queue=Promise.resolve();
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{if(Buffer.byteLength(line)>256*1024){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request too large'}});return;}let message;try{message=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}if(!message||typeof message!=='object'||Array.isArray(message)){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}});return;}queue=queue.then(()=>handle(message));});
input.on('close',()=>{queue.finally(async()=>{await browser?.close();});});
process.on('SIGTERM',()=>{browser?.close().finally(()=>process.exit(0));});
