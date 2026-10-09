const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('../release/tiptap-check/node_modules/jsdom');
const dom=new JSDOM('',{pretendToBeVisual:true});
for(const k of ['window','document','Node','HTMLElement','Element','MutationObserver','DOMParser'])global[k]=dom.window[k];
global.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const {Editor}=require('../release/tiptap-check/node_modules/@tiptap/core');
const {extensions,importHTML,validateJSON}=require('../experiments/tiptap-editor/schema.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release/tiptap-prototype/results');fs.mkdirSync(out,{recursive:true});
function fingerprint(html) {
  const t=document.createElement('template');t.innerHTML=html;
  function node(n){if(n.nodeType===3)return ['text',n.nodeValue];if(n.nodeType!==1)return null;return [n.localName,[...n.attributes].map(a=>[a.name,a.name==='style'?[...n.style].map(key=>[key,n.style.getPropertyValue(key),n.style.getPropertyPriority(key)]).sort(([a],[b])=>a.localeCompare(b)):a.value]).sort(([a],[b])=>a.localeCompare(b)),[...n.childNodes].map(node).filter(Boolean)];}
  return [...t.content.childNodes].map(node).filter(Boolean);
}
const fixtures=[['outmax','OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1/article-body.html'],['hasl','ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4/article-body.html'],['blocks','experiments/tiptap-editor/fixture.html']];
const drafts=(fs.existsSync(path.join(root,'articles'))?fs.readdirSync(path.join(root,'articles')):[]).filter(n=>n.endsWith('.json')).map(name=>{const record=JSON.parse(fs.readFileSync(path.join(root,'articles',name),'utf8'));return {name,record};});
for(const brand of ['outmax','hasl']){
  const draft=drafts.filter(d=>d.record.body&&(d.record.brand||'outmax')===brand).sort((a,b)=>b.record.body.length-a.record.body.length)[0];
  if(draft)fixtures.push([`${brand}-draft`,path.join('articles',draft.name)]);
}
const results=[];
for(const [brand,file] of fixtures){
  const raw=fs.readFileSync(path.join(root,file),'utf8'),source=file.endsWith('.json')?JSON.parse(raw).body:raw,parsed=importHTML(source,document);
  assert.deepEqual(parsed.warnings,[]);
  const e=new Editor({extensions,content:parsed.json});
  const html=e.getHTML();assert.equal(JSON.stringify(fingerprint(html)),JSON.stringify(fingerprint(source)),`${brand}: DOM changed`);
  validateJSON(e.getJSON(),document);
  const restored=new Editor({extensions,content:JSON.parse(JSON.stringify(e.getJSON()))});
  assert.equal(restored.getHTML(),html);
  let textPos;restored.state.doc.descendants((n,pos)=>{if(textPos===undefined&&n.isText&&n.text.trim())textPos=pos;});
  restored.view.dispatch(restored.state.tr.insertText('Тестовая правка. ',textPos));
  assert.ok(restored.getHTML().includes('Тестовая правка. '));assert.ok(restored.commands.undo());assert.equal(restored.getHTML(),html);
  assert.ok(restored.commands.redo());
  const edited=new Editor({extensions,content:restored.getJSON()});assert.equal(edited.getHTML(),restored.getHTML());
  const reparsed=importHTML(edited.getHTML(),document),reimported=new Editor({extensions,content:reparsed.json});assert.equal(reimported.getHTML(),edited.getHTML());
  fs.writeFileSync(path.join(out,brand+'-export.html'),html);fs.writeFileSync(path.join(out,brand+'-document.json'),JSON.stringify(e.getJSON(),null,2));
  results.push({brand,source:file,normalizedDOM:true,counts:parsed.counts,jsonReopen:true,textEditUndoRedo:true,editedReimport:true,migrationAllowed:false});
  for(const editor of [e,restored,edited,reimported])editor.destroy();
}
const hostile=importHTML('<p onclick="bad()"><a href="javascript:alert(1)">Текст</a><img src="x" onerror="bad()"></p><script>bad()</script>',document);
assert.equal(hostile.warnings.length,4);
assert.throws(()=>importHTML('<custom-box>Нельзя молча удалить</custom-box>',document),/импорт отменён/);
for(const attrs of [{tag:'script',htmlAttrs:{}},{tag:'a',htmlAttrs:{href:'javascript:alert(1)'}},{tag:'p',htmlAttrs:{onclick:'bad()'}}])assert.throws(()=>validateJSON({type:'doc',content:[{type:'element',attrs}]},document));
const report={checkedAt:new Date().toISOString(),scope:'Experimental nested-inline HTML preservation schema, not a production editor schema',results,unsafeInputRejected:true,migrationAllowed:false};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
