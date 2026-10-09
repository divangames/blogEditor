// Native block model. Import/export keep HTML wrappers and table groups as
// explicit metadata; editing uses real textblocks, marks, list items and cells.
const path=require('node:path'),{createRequire}=require('node:module');
const deps=createRequire(path.resolve(__dirname,'../../release/tiptap-check/package.json'));
module.exports=makeSchema(deps('@tiptap/core'),deps('@tiptap/extensions'),deps('@tiptap/extension-list'),deps('@tiptap/extension-table'),deps('@tiptap/extension-hard-break'),deps('@tiptap/pm/state'));
function makeSchema({Node,Mark,Extension},{UndoRedo},{BulletList,OrderedList,ListItem,ListKeymap},{Table,TableRow,TableCell,TableHeader},{HardBreak},{Plugin}) {
  const blocks='sectionBlock productBlock tocBlock galleryBlock accentBlock ratingBlock ctaBlock htmlBlock'.split(' ');
  const blockTags=new Set('main article section header footer nav aside figure figcaption div p h1 h2 h3 h4 h5 h6 pre blockquote ul ol li table details summary hr'.split(' '));
  const inlineTags=new Set('span a strong b em i u s del small sup sub code label font picture'.split(' '));
  const voidTags=new Set(['img','br','hr','source','col','wbr']);
  const extraTags=new Set(['thead','tbody','tfoot','tr','th','td','caption','colgroup']);
  const forbidden=new Set('script style iframe object embed form input button textarea select link meta base'.split(' '));
  const allowed=new Set([...blockTags,...inlineTags,...voidTags,...extraTags]);
  const nodeTypes=new Set([...blocks,'doc','text','paragraph','heading','hardBreak','inlineMedia','emptyInline','tocArrow','bulletList','orderedList','listItem','table','tableRow','tableCell','tableHeader','blockMedia']);
  function cleanAttrs(el,warnings){
    const out={};
    for(const {name,value} of el.attributes){
      if(/^on/i.test(name)||['contenteditable','srcdoc'].includes(name)){warnings.push(`Удалён атрибут ${name}`);continue;}
      if(['href','src','srcset','action','xlink:href'].includes(name)&&/(javascript:|vbscript:|data:text\/html)/i.test(value.replace(/[\u0000-\u0020]/g,''))){warnings.push(`Удалён опасный URL ${name}`);continue;}
      if(name==='style'&&/expression\s*\(|url\s*\(|@import|-moz-binding|behavior\s*:/i.test(value)){warnings.push('Удалён небезопасный style');continue;}
      out[name]=value;
    }
    return out;
  }
  function kind(el){
    const c=el.getAttribute('class')||'';
    if(/\bom-product\b/.test(c)||el.localName==='article'&&/^(product-|model-)/.test(el.id))return 'productBlock';
    if(el.localName==='nav'||/\bom-toc\b/.test(c))return 'tocBlock';
    for(const [test,type] of [['om-gallery','galleryBlock'],['om-callout|om-note','accentBlock'],['om-model-rating','ratingBlock'],['om-button','ctaBlock']])if(new RegExp(`\\b(${test})\\b`).test(c))return type;
    if(el.localName==='blockquote')return 'accentBlock';
    if(['article','section'].includes(el.localName))return 'sectionBlock';
    return 'htmlBlock';
  }
  function importHTML(html,document){
    const template=document.createElement('template');template.innerHTML=html;
    const warnings=[],counts={};let serial=0;const namespace='i'+Math.random().toString(36).slice(2)+'-';
    function next(){return namespace+'n'+(++serial);}
    function attributes(el){return {tag:el.localName,htmlAttrs:cleanAttrs(el,warnings),nodeKey:next(),before:'',after:''};}
    function checked(n){
      if(n.nodeType!==1)return true;
      if(forbidden.has(n.localName)){warnings.push(`Удалён запрещённый элемент ${n.localName}`);return false;}
      if(n.localName==='o:p'){warnings.push('Word o:p преобразован в span');const span=document.createElement('span');span.append(...n.childNodes);n.replaceWith(span);return true;}
      if(!allowed.has(n.localName))throw new Error(`Неподдержанный элемент ${n.localName}: импорт отменён`);
      return true;
    }
    // Sanitize once before extracting any metadata, including table captions.
    for(const el of [...template.content.querySelectorAll('*')]){if(!checked(el)){el.remove();continue;}const safe=cleanAttrs(el,warnings);for(const key of [...el.attributes].map(a=>a.name))if(!(key in safe))el.removeAttribute(key);}
    function add(type,attrs,content){counts[type]=(counts[type]||0)+1;return {type,attrs,...(content?{content}: {})};}
    function isBlock(n){return n.nodeType===1&&(blockTags.has(n.localName)||['block','flex','grid','inline-block','inline-flex','inline-grid'].includes(n.style.display));}
    function inline(nodes,stack=[],tocKey=null){
      const result=[];
      for(const n of nodes){
        if(n.nodeType===3){if(n.nodeValue)result.push({type:'text',text:n.nodeValue,...(stack.length?{marks:[{type:'htmlFormatting',attrs:{stack}}]}:{})});continue;}
        if(n.nodeType!==1)continue;
        const a=attributes(n),marks=stack.length?[{type:'htmlFormatting',attrs:{stack}}]:undefined;
        let item;
        if(tocKey&&n.localName==='span'&&/^[\s↓↑→←]+$/.test(n.textContent)&&n.textContent.trim())item=add('tocArrow',{...a,glyph:n.textContent,tocKey});
        else if(n.localName==='br')item=add('hardBreak',a);
        else if(voidTags.has(n.localName))item=add('inlineMedia',a);
        else if(!n.childNodes.length)item=add('emptyInline',a);
        else {result.push(...inline([...n.childNodes],[...stack,{tag:a.tag,htmlAttrs:a.htmlAttrs,key:a.nodeKey}],tocKey));continue;}
        if(marks)item.marks=marks;result.push(item);
      }
      return result;
    }
    function children(parent,tocKey=null,requireParagraph=false){
      const result=[];let run=[],gap='';
      function flush(){
        if(!run.length)return;
        if(run.every(n=>n.nodeType===3&&!n.nodeValue.trim()))gap+=run.map(n=>n.nodeValue).join('');
        else {const a={tag:'p',htmlAttrs:{},nodeKey:next(),transparent:true,before:gap,after:''};gap='';result.push(add('paragraph',a,inline(run,[],tocKey)));}
        run=[];
      }
      for(const n of parent.childNodes){if(isBlock(n)){flush();const item=block(n,tocKey);item.attrs.before=gap;gap='';result.push(item);}else if(n.nodeType===1||n.nodeType===3)run.push(n);}
      flush();
      if(requireParagraph&&(!result.length||result[0].type!=='paragraph'))result.unshift(add('paragraph',{tag:'p',htmlAttrs:{},nodeKey:next(),transparent:true,before:'',after:''},[]));
      return {content:result,after:gap};
    }
    function raw(n){if(n.nodeType===3)return {text:n.nodeValue};if(n.nodeType!==1)return null;return {tag:n.localName,htmlAttrs:cleanAttrs(n,warnings),children:[...n.childNodes].map(raw).filter(Boolean)};}
    function block(el,tocKey){
      const a=attributes(el),tag=el.localName;
      if(tag==='table'){
        const rows=[],attachments=[];let groupCounter=0,gap='';
        for(const child of el.childNodes){
          if(child.nodeType===3){gap+=child.nodeValue;continue;}
          if(child.nodeType!==1)continue;
          if(['caption','colgroup'].includes(child.localName)){attachments.push({before:gap,tree:raw(child)});gap='';continue;}
          const direct=child.localName==='tr',group={tag:direct?null:child.localName,htmlAttrs:direct?{}:cleanAttrs(child,warnings),key:'g'+(++groupCounter),before:gap,after:''};gap='';
          let rowGap='';
          for(const row of direct?[child]:child.childNodes){
            if(row.nodeType===3){rowGap+=row.nodeValue;continue;}
            if(row.nodeType!==1)continue;
            if(row.localName!=='tr')throw new Error('Неподдержанная структура таблицы');
            const cells=[];let cellGap='';
            for(const cell of row.childNodes){
              if(cell.nodeType===3){cellGap+=cell.nodeValue;continue;}
              if(cell.nodeType!==1)continue;
              if(!['td','th'].includes(cell.localName))throw new Error('Неподдержанная ячейка');
              const ca=attributes(cell),inner=children(cell,tocKey,true);
              cells.push(add(cell.localName==='th'?'tableHeader':'tableCell',{...ca,before:cellGap,after:inner.after,colspan:Math.max(1,Number(cell.getAttribute('colspan'))||1),rowspan:Math.max(1,Number(cell.getAttribute('rowspan'))||1),colwidth:null},inner.content));cellGap='';
            }
            rows.push(add('tableRow',{...attributes(row),before:rowGap,after:cellGap,tableGroup:group},cells));rowGap='';
          }
          group.after=rowGap;
        }
        if(!rows.length)throw new Error('Пустая таблица: импорт отменён');
        return add('table',{...a,attachments,after:gap},rows);
      }
      if(tag==='p'||/^h[1-6]$/.test(tag)||tag==='pre')return add(/^h/.test(tag)?'heading':'paragraph',{...a,transparent:false},inline([...el.childNodes],[],tocKey));
      if(voidTags.has(tag))return add('blockMedia',a);
      const type=tag==='ul'?'bulletList':tag==='ol'?'orderedList':tag==='li'?'listItem':kind(el);
      if(type==='tocBlock')tocKey=a.nodeKey;
      if(['bulletList','orderedList'].includes(type)){
        const result=[];let gap='';
        for(const n of el.childNodes){if(n.nodeType===3){if(n.nodeValue.trim())throw new Error('Текст вне элемента списка');gap+=n.nodeValue;}else if(n.nodeType===1){if(n.localName!=='li')throw new Error('Неподдержанная структура списка');const item=block(n,tocKey);item.attrs.before=gap;gap='';result.push(item);}}
        return add(type,{...a,after:gap,...(tag==='ol'?{start:Number(el.getAttribute('start'))||1}:{})},result);
      }
      const inner=children(el,tocKey,type==='listItem');return add(type,{...a,after:inner.after},inner.content);
    }
    const inner=children(template.content);return {json:{type:'doc',attrs:{after:inner.after},content:inner.content.length?inner.content:[add('paragraph',{tag:'p',htmlAttrs:{},transparent:true,nodeKey:next(),before:'',after:''},[])]},warnings,counts};
  }
  const baseAttrs=()=>({tag:{default:'div',rendered:false},htmlAttrs:{default:{},rendered:false},nodeKey:{default:null,rendered:false},before:{default:'',rendered:false,keepOnSplit:false},after:{default:'',rendered:false,keepOnSplit:false},accentBaseline:{default:null,rendered:false}});
  const rawAttrs=n=>({...n.attrs.htmlAttrs});
  function mediaViewAttrs(n){const attrs=rawAttrs(n);if(typeof window==='undefined')return attrs;const base=window.__TIPTAP_APP_BASE__||'',local=window.__TIPTAP_LOCAL_MEDIA__;if(local?.has(attrs.src))attrs.src=local.get(attrs.src);else if(attrs.src?.startsWith('/media/'))attrs.src=base+attrs.src;else if(attrs.src?.startsWith('/components/'))attrs.src=(window.__TIPTAP_BRAND__==='hasl'?'https://хасл.рф':'https://outmaxshop.ru')+attrs.src;if(attrs.srcset&&local)attrs.srcset=attrs.srcset.split(',').map(v=>{const [src,...rest]=v.trim().split(/\s+/);return [local.get(src)||src,...rest].join(' ');}).join(', ');return attrs;}
  const extensions=[Node.create({name:'doc',topNode:true,content:'block+',addAttributes(){return {after:{default:'',rendered:false}};}}),Node.create({name:'text',group:'inline'}),UndoRedo];
  for(const name of blocks)extensions.push(Node.create({name,group:'block',content:'block*',defining:true,addAttributes:baseAttrs,parseHTML(){return [];},renderHTML({node}){return [node.attrs.tag,rawAttrs(node),0];}}));
  extensions.push(Node.create({name:'paragraph',group:'block',content:'inline*',addAttributes(){return {...baseAttrs(),tag:{default:'p',rendered:false},transparent:{default:false,rendered:false}};},parseHTML(){return [{tag:'p'}];},renderHTML({node}){return node.attrs.transparent?['span',{'data-lab-run':'',style:'display:contents'},0]:[node.attrs.tag,rawAttrs(node),0];}}));
  extensions.push(Node.create({name:'heading',group:'block',content:'inline*',defining:true,addAttributes(){return {...baseAttrs(),tag:{default:'h2',rendered:false}};},parseHTML(){return [1,2,3,4,5,6].map(n=>({tag:'h'+n}));},renderHTML({node}){return [node.attrs.tag,rawAttrs(node),0];}}));
  extensions.push(Mark.create({name:'htmlFormatting',inclusive:true,addAttributes(){return {stack:{default:[],rendered:false}};},parseHTML(){return [];},renderHTML({mark}){let hole=0;for(const item of [...mark.attrs.stack].reverse())hole=[item.tag,item.htmlAttrs,hole];return hole;}}));
  for(const [base,tag] of [[BulletList,'ul'],[OrderedList,'ol'],[ListItem,'li']])extensions.push(base.extend({addAttributes(){return {...(this.parent?.()||{}),...baseAttrs(),tag:{default:tag,rendered:false}};},renderHTML({node}){const a=rawAttrs(node);if(tag==='ol'&&node.attrs.start!==1)a.start=node.attrs.start;return [tag,a,0];}}));
  extensions.push(ListKeymap,HardBreak.extend({addAttributes:baseAttrs,renderHTML({node}){return ['br',rawAttrs(node)];}}));
  for(const name of ['inlineMedia','emptyInline','tocArrow','blockMedia'])extensions.push(Node.create({name,inline:name!=='blockMedia',group:name==='blockMedia'?'block':'inline',atom:true,addAttributes(){return {...baseAttrs(),glyph:{default:'',rendered:false},tocKey:{default:null,rendered:false}};},parseHTML(){return [];},renderHTML({node}){return name==='tocArrow'?['span',{...rawAttrs(node),'data-lab-arrow':'',contenteditable:'false'},node.attrs.glyph]:[node.attrs.tag,mediaViewAttrs(node)];}}));
  extensions.push(Table.extend({addAttributes(){return {...baseAttrs(),tag:{default:'table',rendered:false},attachments:{default:[],rendered:false}};},renderHTML({node}){return ['table',rawAttrs(node),['tbody',0]];}}).configure({resizable:false,renderWrapper:false}),TableRow.extend({addAttributes(){return {...baseAttrs(),tag:{default:'tr',rendered:false},tableGroup:{default:null,rendered:false}};},renderHTML({node}){const attrs=rawAttrs(node),group=node.attrs.tableGroup?.htmlAttrs||{};if(group.style)attrs.style=group.style+';'+(attrs.style||'');return ['tr',attrs,0];}}));
  function cellAttrs(node){const a=rawAttrs(node);for(const key of ['colspan','rowspan']){if(node.attrs[key]!==1||key in a)a[key]=String(node.attrs[key]);}if(node.attrs.colwidth)a['data-colwidth']=node.attrs.colwidth.join(',');return a;}
  for(const [base,tag] of [[TableCell,'td'],[TableHeader,'th']])extensions.push(base.extend({addAttributes(){return {...this.parent(),...baseAttrs(),tag:{default:tag,rendered:false}};},renderHTML({node}){return [tag,cellAttrs(node),0];}}));
  extensions.push(Extension.create({name:'stableIdentity',addProseMirrorPlugins(){return [new Plugin({
    filterTransaction(tr,state){if(!tr.docChanged)return true;const tocKeys=new Set(),arrows=new Set();tr.doc.descendants(n=>{if(n.type.name==='tocBlock')tocKeys.add(n.attrs.nodeKey);if(n.type.name==='tocArrow')arrows.add(n.attrs.nodeKey);});let safe=true;state.doc.descendants(n=>{if(n.type.name==='tocArrow'&&tocKeys.has(n.attrs.tocKey)&&!arrows.has(n.attrs.nodeKey))safe=false;});return safe;},
    appendTransaction(transactions,oldState,state){
      if(!transactions.some(t=>t.docChanged))return null;const keys=new Set(),ids=new Set(),markScopes=new Map();let tr=null;
      state.doc.descendants((n,pos,parent)=>{
        if(n.type.name==='table'){
          let previous=null,offset=pos+1;
          n.forEach((row,indexOffset,index)=>{
            let group=row.attrs.tableGroup;
            if(!group){
              let following=null;for(let i=index+1;i<n.childCount;i++){if(n.child(i).attrs.tableGroup){following=n.child(i).attrs.tableGroup;break;}}
              const header=row.childCount&&row.content.content.every(c=>c.type.name==='tableHeader');
              group=previous?.tag==='thead'&&!header?(following?.tag==='tbody'?following:null):previous||following;
              group=group||{key:'body-'+(n.attrs.nodeKey||pos),tag:'tbody',htmlAttrs:{},before:'',after:''};
              tr=tr||state.tr;tr.setNodeMarkup(offset,undefined,{...row.attrs,tableGroup:group});
            }
            previous=group;offset+=row.nodeSize;
          });
        }
        if(n.isInline){
          for(const mark of n.marks){if(mark.type.name!=='htmlFormatting')continue;let changed=false;
            const stack=mark.attrs.stack.map(item=>{
              let scopes=markScopes.get(item.key);if(!scopes){scopes=new Map();markScopes.set(item.key,scopes);}
              let next=scopes.get(parent);
              if(!next){next={...item,htmlAttrs:{...item.htmlAttrs}};if(scopes.size)next.key='mark-'+Math.random().toString(36).slice(2);const id=next.htmlAttrs.id;if(id){if(ids.has(id))delete next.htmlAttrs.id;else ids.add(id);}scopes.set(parent,next);}
              if(next.key!==item.key||JSON.stringify(next.htmlAttrs)!==JSON.stringify(item.htmlAttrs))changed=true;return next;
            });
            if(changed){tr=tr||state.tr;tr.removeMark(pos,pos+n.nodeSize,mark.type);tr.addMark(pos,pos+n.nodeSize,mark.type.create({stack}));}
          }
        }
        if(n.isText)return;let a=(tr?.doc.nodeAt(pos)||n).attrs,changed=false;
        if('nodeKey' in a&&(!a.nodeKey||keys.has(a.nodeKey))){a={...a,nodeKey:'edit-'+Math.random().toString(36).slice(2)};changed=true;if(a.transparent)a={...a,transparent:false,tag:'p'};}
        if(a.nodeKey)keys.add(a.nodeKey);const id=a.htmlAttrs?.id;
        if(id){if(ids.has(id)){a={...a,htmlAttrs:{...a.htmlAttrs}};delete a.htmlAttrs.id;changed=true;}else ids.add(id);}
        if(changed){tr=tr||state.tr;tr.setNodeMarkup(pos,undefined,a);}
      });return tr;
    },
  })];}}));
  function exportHTML(json,document){
    const root=document.createDocumentFragment();
    function element(tag,attributes){const el=document.createElement(tag);for(const [k,v] of Object.entries(attributes||{}))el.setAttribute(k,String(v));return el;}
    function raw(tree){if('text' in tree)return document.createTextNode(tree.text);const el=element(tree.tag,tree.htmlAttrs);for(const c of tree.children||[])el.append(raw(c));return el;}
    function inline(parent,nodes){let active=[],parents=[parent];for(const n of nodes){const stack=n.marks?.find(m=>m.type==='htmlFormatting')?.attrs.stack||[];let common=0;while(common<active.length&&common<stack.length&&active[common].key===stack[common].key)common++;active=active.slice(0,common);parents=parents.slice(0,common+1);for(const mark of stack.slice(common)){const el=element(mark.tag,mark.htmlAttrs);parents.at(-1).append(el);parents.push(el);active.push(mark);}const target=parents.at(-1);if(n.type==='text')target.append(document.createTextNode(n.text));else if(n.type==='tocArrow'){const el=element(n.attrs.tag,n.attrs.htmlAttrs);el.textContent=n.attrs.glyph;target.append(el);}else target.append(element(n.type==='hardBreak'?'br':n.attrs.tag,n.attrs.htmlAttrs));}}
    function append(parent,nodes){for(const n of nodes){if(n.attrs?.before)parent.append(document.createTextNode(n.attrs.before));serialize(parent,n);}}
    function serialize(parent,n){
      const a=n.attrs||{};
      if(n.type==='doc'){append(parent,n.content||[]);if(a.after)parent.append(document.createTextNode(a.after));return;}
      if(n.type==='paragraph'&&a.transparent){inline(parent,n.content||[]);return;}
      const tag=n.type==='tableCell'?'td':n.type==='tableHeader'?'th':n.type==='tableRow'?'tr':n.type==='table'?'table':n.type==='bulletList'?'ul':n.type==='orderedList'?'ol':n.type==='listItem'?'li':a.tag;
      const attrs=['tableCell','tableHeader'].includes(n.type)?cellAttrs({attrs:a}):{...a.htmlAttrs};
      if(n.type==='orderedList'&&a.start!==1)attrs.start=String(a.start);
      const el=element(tag,attrs);parent.append(el);
      if(n.type==='table'){
        for(const item of a.attachments||[]){el.append(document.createTextNode(item.before));el.append(raw(item.tree));}
        let current=null,target=el;
        for(const row of n.content||[]){const group=row.attrs.tableGroup||{key:'new-body',tag:'tbody',htmlAttrs:{},before:'',after:''};if(current?.key!==group.key){if(current?.after)target.append(document.createTextNode(current.after));if(group.before)el.append(document.createTextNode(group.before));target=group.tag?element(group.tag,group.htmlAttrs):el;if(target!==el)el.append(target);current=group;}append(target,[row]);}
        if(current?.after)target.append(document.createTextNode(current.after));
      }else if(['paragraph','heading'].includes(n.type))inline(el,n.content||[]);
      else append(el,n.content||[]);
      if(a.after)el.append(document.createTextNode(a.after));
    }
    serialize(root,json);const holder=document.createElement('div');holder.append(root);return holder.innerHTML;
  }
  function validateJSON(json,document){
    if(json.type!=='doc')throw new Error('Нет корня документа');let count=0;const formatting=new Map();
    const tags={paragraph:new Set(['p','pre']),heading:new Set(['h1','h2','h3','h4','h5','h6']),table:new Set(['table']),tableRow:new Set(['tr']),tableCell:new Set(['td']),tableHeader:new Set(['th']),bulletList:new Set(['ul']),orderedList:new Set(['ol']),listItem:new Set(['li']),hardBreak:new Set(['br']),inlineMedia:voidTags,blockMedia:voidTags,emptyInline:inlineTags,tocArrow:new Set(['span'])};
    function attributes(tag,attrs){if(!allowed.has(tag)||forbidden.has(tag))throw new Error('Запрещённый тег');const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(typeof v!=='string')throw new Error('Некорректный атрибут');el.setAttribute(k,v);}const warnings=[];cleanAttrs(el,warnings);if(warnings.length)throw new Error('Запрещённый атрибут или URL');}
    function raw(tree,depth){if(depth>80||++count>100000)throw new Error('Превышен размер документа');if('text' in tree){if(typeof tree.text!=='string')throw new Error('Некорректный текст');return;}attributes(tree.tag,tree.htmlAttrs);for(const child of tree.children||[])raw(child,depth+1);}
    function visit(n,depth){
      if(depth>80||++count>100000)throw new Error('Превышен размер документа');if(!nodeTypes.has(n.type))throw new Error('Неизвестный тип узла');
      if(n.type==='text'){if(typeof n.text!=='string'||!n.text)throw new Error('Некорректный текст');}
      else if(n.type==='doc'){if(depth)throw new Error('Вложенный корень');}
      else {const a=n.attrs||{};attributes(n.type==='hardBreak'?'br':a.tag,a.htmlAttrs);if(tags[n.type]&&!tags[n.type].has(n.type==='hardBreak'?'br':a.tag))throw new Error('Несовместимый тип и тег');if(blocks.includes(n.type)&&voidTags.has(a.tag))throw new Error('Пустой тег в контейнере');if(['tableCell','tableHeader'].includes(n.type)&&(!Number.isInteger(a.colspan)||!Number.isInteger(a.rowspan)||a.colspan<1||a.rowspan<1||a.colspan>100||a.rowspan>10000))throw new Error('Некорректные размеры ячейки');if(a.tableGroup?.tag){if(!['thead','tbody','tfoot'].includes(a.tableGroup.tag))throw new Error('Некорректная группа таблицы');attributes(a.tableGroup.tag,a.tableGroup.htmlAttrs);}for(const attachment of a.attachments||[]){if(!['caption','colgroup'].includes(attachment.tree.tag))throw new Error('Некорректное дополнение таблицы');raw(attachment.tree,depth+1);}}
      if(n.attrs?.accentBaseline)attributes(n.attrs.tag,n.attrs.accentBaseline);
      for(const mark of n.marks||[]){if(mark.type!=='htmlFormatting')throw new Error('Неизвестное форматирование');if(!Array.isArray(mark.attrs?.stack)||!mark.attrs.stack.length||mark.attrs.stack.length>80)throw new Error('Некорректное форматирование');for(const item of mark.attrs.stack){if(!inlineTags.has(item.tag)||typeof item.key!=='string'||!item.key)throw new Error('Небезопасное форматирование');attributes(item.tag,item.htmlAttrs);const signature=JSON.stringify([item.tag,Object.entries(item.htmlAttrs||{}).sort()]);if(formatting.has(item.key)&&formatting.get(item.key)!==signature)throw new Error('Конфликт идентификатора форматирования');formatting.set(item.key,signature);}}
      for(const child of n.content||[])visit(child,depth+1);
    }
    visit(json,0);
  }
  return {extensions,importHTML,exportHTML,validateJSON};
}
