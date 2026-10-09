const {Editor}=require('@tiptap/core');
const {extensions,importHTML,exportHTML,validateJSON}=require('prototype-schema');
const legacy=require('preservation-schema');
const {mountBlockPanels}=require('./block-panels.cjs');
const {mountFeatureBlocks}=require('./feature-blocks.cjs');
const {createFileIO}=require('./file-io.cjs');
const {connectServer}=require('./server-sync.cjs');
const APP_BASE=location.pathname.startsWith('/tiptap')?'/tiptap':'';
let editor,original='',brand=new URLSearchParams(location.search).get('brand')==='hasl'?'hasl':'outmax',loadTicket=0;
let blockPanels;
let featureBlocks;
let fileIO;
let serverSync;
const $=id=>document.getElementById(id);
const status=text=>$('status').textContent=text;
const currentHTML=()=>exportHTML(editor.getJSON(),document);
function updateDocumentCount(){if(editor)$('document-count').textContent=new Intl.NumberFormat('ru-RU').format(editor.getText().length)+' символов';}
function setBrand(next){brand=next;window.__TIPTAP_BRAND__=brand;window.__TIPTAP_APP_BASE__=APP_BASE;$('brand').value=brand;$('brand-css').href=`${APP_BASE}/${brand}.css`;$('asset-base').href=`${APP_BASE}/media/${brand}/`;$('production-link').href=APP_BASE?(brand==='hasl'?'/hasl/':'/'):'https://news.outmax-office.ru/';}
function formatText(tag){
  const state=editor.state,{from,to,empty}=state.selection,type=state.schema.marks.htmlFormatting;
  const current=(state.storedMarks||state.selection.$from.marks()).find(m=>m.type===type)?.attrs.stack||[];
  const aliases=tag==='strong'?['strong','b']:['em','i'],remove=current.some(m=>aliases.includes(m.tag));
  function stack(marks){const existing=marks.find(m=>m.type===type)?.attrs.stack||[];return remove?existing.filter(m=>!aliases.includes(m.tag)):existing.some(m=>aliases.includes(m.tag))?existing:[...existing,{tag,htmlAttrs:{},key:'format-'+Math.random().toString(36).slice(2)}];}
  const tr=state.tr;
  if(empty){const next=stack(state.storedMarks||state.selection.$from.marks()),others=(state.storedMarks||state.selection.$from.marks()).filter(m=>m.type!==type);tr.setStoredMarks(next.length?[...others,type.create({stack:next})]:others);}
  else state.doc.nodesBetween(from,to,(n,pos)=>{if(!n.isInline||n.isText&&(!n.text||!n.text.trim()))return;const start=Math.max(from,pos),end=Math.min(to,pos+n.nodeSize),next=stack(n.marks);tr.removeMark(start,end,type);if(next.length)tr.addMark(start,end,type.create({stack:next}));});
  editor.view.dispatch(tr);editor.view.focus();
}
function scopedSelectAll(event){
  const {$from}=editor.state.selection;let toc=false,depth;
  for(let d=$from.depth;d>0;d--){if($from.node(d).type.name==='tocBlock')toc=true;if(!depth&&$from.node(d).isTextblock)depth=d;}
  if(!toc||!depth)return false;
  const start=$from.start(depth),node=$from.node(depth);let from,to;
  node.descendants((n,pos)=>{if(n.isText){from??=start+pos;to=start+pos+n.nodeSize;}});
  if(from===undefined)return false;event.preventDefault();editor.commands.setTextSelection({from,to});return true;
}
function mount(json){
  const previous=editor,container=document.createElement('div');
  const next=new Editor({element:container,extensions,content:json,
    editorProps:{attributes:{'aria-label':'Экспериментальная статья'},
      handlePaste(view,event){
        try{
          const clipboard=event.clipboardData,html=clipboard.getData('text/html'),text=clipboard.getData('text/plain');
          if(!html&&!text)throw new Error('Вставка файлов пока не подключена');
          const source=html||text.split(/\r?\n/).map(line=>{const p=document.createElement('p');p.textContent=line;return p.outerHTML;}).join('');
          const imported=importHTML(source,document);validateJSON(imported.json,document);
          editor.commands.insertContent(imported.json.content);status(imported.warnings.length?'Вставка с преобразованиями: '+imported.warnings.join('; '):'Текст вставлен. Серверные статьи не изменяются.');
        }catch(error){status('Вставка отменена: '+error.message);}
        return true;
      },
      handleDrop(){status('Перетаскивание пока отключено до проверки ресурсов.');return true;},
      handleKeyDown(view,event){
        if(event.ctrlKey||event.metaKey){if(event.key.toLowerCase()==='a'&&scopedSelectAll(event))return true;if(['b','i'].includes(event.key.toLowerCase())){event.preventDefault();formatText(event.key.toLowerCase()==='b'?'strong':'em');return true;}}
        return false;
      },
      handleDOMEvents:{click(view,event){if(event.target.closest('a'))event.preventDefault();return false;}},
    },
    onUpdate(){serverSync?.changed();updateDocumentCount();},
    onTransaction({editor}){
      const $pos=editor.state.selection.$from;let chosen=null;
      for(let d=$pos.depth;d>0;d--){const node=$pos.node(d);if(['paragraph','heading'].includes(node.type.name)){chosen={node,pos:$pos.before(d)};break;}}
      window.headingSelection=chosen;$('heading').disabled=!chosen;if(chosen)$('heading').value=chosen.node.type.name==='heading'?chosen.node.attrs.tag:'p';
      $('table-tools').hidden=!editor.isActive('table');
      const stack=(editor.state.storedMarks||$pos.marks()).find(m=>m.type.name==='htmlFormatting')?.attrs.stack||[];
      $('bold').setAttribute('aria-pressed',String(stack.some(m=>['strong','b'].includes(m.tag))));$('italic').setAttribute('aria-pressed',String(stack.some(m=>['em','i'].includes(m.tag))));
    },
  });
  previous?.destroy();editor=next;$('editor').replaceChildren(container);
  $('heading').disabled=true;$('heading').value='p';$('table-tools').hidden=true;for(const id of ['bold','italic'])$(id).setAttribute('aria-pressed','false');
  window.prototypeEditor=editor;window.prototypeHTML=currentHTML;window.prototypeMountVersion=(window.prototypeMountVersion||0)+1;
  blockPanels?.bind(editor);
  featureBlocks?.bind();
  updateDocumentCount();
}
async function load(next,fixture=next){
  const ticket=++loadTicket;status('Загружаю публикационный пакет…');
  const response=await fetch(`${APP_BASE}/fixtures/${fixture}.html`);if(!response.ok)throw new Error('Публикационный пакет не найден на этом компьютере.');
  const html=await response.text();if(ticket!==loadTicket)return;const imported=importHTML(html,document);
  const previousBrand=brand,previousAliases=window.__TIPTAP_LOCAL_MEDIA__;setBrand(next);window.__TIPTAP_LOCAL_MEDIA__=new Map();try{mount(imported.json);}catch(error){window.__TIPTAP_LOCAL_MEDIA__=previousAliases;setBrand(previousBrand);throw error;}fileIO?.reset(APP_BASE?APP_BASE+'/media/'+next+'/':'');original=html;
  $('inventory').textContent=Object.entries(imported.counts).map(([name,n])=>`${name}: ${n}`).join(' · ');
  $('warnings').textContent=imported.warnings.join('\n')||'Импорт без удалений. Используется блочная модель; полный набор критериев миграции ещё не закрыт.';
  status('Пакет открыт. Результат хранится только в этом стенде.');
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('load').onclick=async()=>{if(!await serverSync.leave())return;try{await load($('brand').value);await serverSync.replaced();}catch(e){status(e.message);}};
$('load-controls').onclick=async()=>{if(!await serverSync.leave())return;try{await load(brand,'controls');await serverSync.replaced();}catch(e){status(e.message);}};
$('undo').onclick=()=>editor?.commands.undo();$('redo').onclick=()=>editor?.commands.redo();
for(const [id,tag] of [['bold','strong'],['italic','em']]){$(id).onmousedown=e=>e.preventDefault();$(id).onclick=()=>formatText(tag);}
for(const [id,command] of [['row-add','addRowAfter'],['column-add','addColumnAfter'],['row-delete','deleteRow'],['column-delete','deleteColumn']]){$(id).onmousedown=e=>e.preventDefault();$(id).onclick=()=>editor.chain().focus()[command]().run();}
$('json').onclick=()=>{if(fileIO.hasAssets())fileIO.saveZIP().catch(e=>status(e.message));else download(`${brand}-tiptap-blocks.json`,JSON.stringify(fileIO.payload(),null,2),'application/json');};
$('html').onclick=()=>download(`${brand}-tiptap-blocks.html`,fileIO.documentHTML(currentHTML()),'text/html');
$('zip').onclick=()=>fileIO.saveZIP().catch(e=>status(e.message));
$('cms-html').onclick=()=>{try{download(`${brand}-cms.html`,fileIO.documentHTML(fileIO.cmsBody()),'text/html');}catch(e){status('Экспорт для CMS отменён: '+e.message);}};
$('reopen').onchange=async event=>{
  try{
    if(!await serverSync.leave())return;
    const file=event.target.files[0],candidate=await fileIO.read(file);if(!candidate)return;
    const payload=candidate.payload;let json=payload.document,converted=false;
    if(payload.format==='html-preservation-prototype-v1'){
      legacy.validateJSON(json,document);const temp=new Editor({extensions:legacy.extensions,content:json});
      try{temp.state.doc.check();const parsed=importHTML(temp.getHTML(),document);if(parsed.warnings.length)throw new Error('JSON v1 содержит запрещённое оформление');json=parsed.json;converted=true;}finally{temp.destroy();}
    }else if(payload.format!=='brand-block-prototype-v2')throw new Error('Нужен JSON стенда v1 или v2.');
    validateJSON(json,document);const node=editor.schema.nodeFromJSON(json);node.check();
    const parsed=importHTML(exportHTML(json,document),document);if(parsed.warnings.length)throw new Error('JSON содержит запрещённое оформление');
    const nextBrand=payload.brand||brand;if(!['outmax','hasl'].includes(nextBrand))throw new Error('Неизвестный бренд JSON');
    candidate.payload.document=json;const prepared=fileIO.prepare(candidate),previousAliases=window.__TIPTAP_LOCAL_MEDIA__,previousBrand=brand;setBrand(nextBrand);window.__TIPTAP_LOCAL_MEDIA__=prepared.aliases;try{mount(json);fileIO.commit(candidate,prepared);}catch(error){window.__TIPTAP_LOCAL_MEDIA__=previousAliases;prepared.rollback();setBrand(previousBrand);throw error;}original=exportHTML(json,document);
    $('inventory').textContent=Object.entries(parsed.counts).map(([name,n])=>`${name}: ${n}`).join(' · ');$('warnings').textContent=candidate.warnings.join(' · ')||'Файл проверен перед отображением.';
    status(converted?'JSON v1 преобразован в блочную модель.':/\.json$/i.test(file.name)?'JSON повторно открыт.':'Открыт файл: '+file.name);
    await serverSync.replaced();
  }catch(error){status('Открытие отменено: '+error.message);}finally{event.target.value='';}
};
$('heading').onchange=()=>{
  const chosen=window.headingSelection;if(!chosen)return;const {node,pos}=chosen,tag=$('heading').value;
  const attrs={...node.attrs,tag,transparent:false,htmlAttrs:{...node.attrs.htmlAttrs}};
  if(tag!=='p'&&!attrs.htmlAttrs.id)attrs.htmlAttrs.id='heading-'+(attrs.nodeKey||Math.random().toString(36).slice(2));
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,editor.schema.nodes[tag==='p'?'paragraph':'heading'],attrs));editor.view.focus();
};
$('compare').onclick=()=>{
  const source=$('source');source.hidden=!source.hidden;
  $('compare').setAttribute('aria-pressed',String(!source.hidden));
  if(!source.hidden){const doc=source.contentDocument;doc.open();doc.write('<!doctype html><html><head><base href="'+APP_BASE+'/media/'+brand+'/"><link rel="stylesheet" href="'+APP_BASE+'/'+brand+'.css"></head><body>'+original+'</body></html>');doc.close();}
};
blockPanels=mountBlockPanels({getEditor:()=>editor,importHTML,exportHTML,validateJSON,status});
featureBlocks=mountFeatureBlocks({getEditor:()=>editor,getBrand:()=>brand,importHTML,exportHTML,validateJSON,status});
featureBlocks.bind();
fileIO=createFileIO({importHTML,exportHTML,getEditor:()=>editor,getBrand:()=>brand,download});
serverSync=connectServer({fileIO,getBrand:()=>brand,getHTML:currentHTML,renderBody:current=>fileIO.cmsBody(current.body,current.brand,current.tiptap.fileMeta.css),status,download,setEditable:value=>editor?.setEditable(value,false),mountRecord:async(payload,assets)=>{
  const json=payload.document||importHTML(payload.body||'<p></p>',document).json;
  validateJSON(json,document);editor?.schema.nodeFromJSON(json).check();
  const parsed=importHTML(exportHTML(json,document),document);if(parsed.warnings.length)throw Error('Версия содержит запрещённое оформление');
  const candidate=await fileIO.read(new File([JSON.stringify({...payload,document:json,serverAssets:undefined})],'server.json',{type:'application/json'}));candidate.assets=assets;
  const prepared=fileIO.prepare(candidate);setBrand(payload.brand||brand);window.__TIPTAP_LOCAL_MEDIA__=prepared.aliases;
  try{mount(json);editor.setEditable(false,false);fileIO.commit(candidate,prepared);}catch(e){prepared.rollback();throw e;}original=exportHTML(json,document);
}});
window.tiptapSync=serverSync;
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$(APP_BASE?'server-save':'json').click();}});
setBrand(brand);
new ResizeObserver(entries=>{document.querySelector('.lab')?.style.setProperty('--toolbar-offset',(entries[0].contentRect.height+24)+'px');}).observe(document.querySelector('.editing-tools'));
serverSync.init().then(restored=>{if(!restored)return load(brand);}).catch(e=>status(e.message));
