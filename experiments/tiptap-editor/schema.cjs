// Preservation experiment. HTML containers are inline in ProseMirror's model.
// This deliberately does NOT claim native paragraph/table editing semantics.
const path = require('node:path');
const {createRequire} = require('node:module');
const dependencies = createRequire(path.resolve(__dirname, '../../release/tiptap-check/package.json'));
module.exports = makeSchema(dependencies('@tiptap/core'), dependencies('@tiptap/extensions'));
function makeSchema({Node}, {UndoRedo}) {
  const containers = ['element', 'sectionBlock', 'productBlock', 'comparisonBlock', 'tocBlock', 'galleryBlock', 'accentBlock', 'ratingBlock', 'ctaBlock'];
  const allowed = new Set('article section header footer nav aside figure figcaption div p h1 h2 h3 h4 h5 h6 span a strong b em i u s del small sup sub code pre blockquote ul ol li table thead tbody tfoot tr th td caption colgroup picture details summary label'.split(' '));
  const voids = new Set(['img', 'br', 'hr', 'source', 'col', 'wbr']);
  const forbidden = new Set(['script','style','iframe','object','embed','form','input','button','textarea','select','link','meta','base']);
  function attrs(element, warnings) {
    const out = {};
    for (const {name, value} of element.attributes) {
      if (/^on/i.test(name) || name === 'contenteditable' || name === 'srcdoc') {warnings.push(`Удалён атрибут ${name}`); continue;}
      if (['href','src','srcset','action','xlink:href'].includes(name) && /(?:javascript:|vbscript:|data:text\/html)/i.test(value.replace(/[\u0000-\u0020]/g,''))) {warnings.push(`Удалён опасный URL ${name}`); continue;}
      if (name === 'style' && /expression\s*\(|url\s*\(|@import|-moz-binding|behavior\s*:/i.test(value)) {warnings.push('Удалён небезопасный style'); continue;}
      out[name] = value;
    }
    return out;
  }
  function kind(el) {
    const c = el.className || '', id = el.id || '';
    if (/om-product/.test(c) || el.localName === 'article' && /^(product-|model-)/.test(id)) return 'productBlock';
    if (el.localName === 'table') return 'comparisonBlock';
    if (el.localName === 'nav' || /om-toc/.test(c)) return 'tocBlock';
    for (const [test,name] of [['om-gallery','galleryBlock'],['om-callout|om-note','accentBlock'],['om-model-rating','ratingBlock'],['om-button','ctaBlock']]) if (new RegExp(test).test(c)) return name;
    if (el.localName === 'blockquote') return 'accentBlock';
    if (el.localName === 'section' || el.localName === 'article') return 'sectionBlock';
    return 'element';
  }
  function importHTML(html, document) {
    const template = document.createElement('template'); template.innerHTML = html;
    const warnings = [], counts = {};
    function visit(n) {
      if (n.nodeType === 3) return n.nodeValue ? {type:'text',text:n.nodeValue} : null;
      if (n.nodeType !== 1) return null;
      if (forbidden.has(n.localName)) {warnings.push(`Удалён запрещённый элемент ${n.localName}`); return null;}
      const raw = attrs(n,warnings);
      if (!allowed.has(n.localName) && !voids.has(n.localName)) {
        warnings.push(`Неподдержанный элемент ${n.localName}: импорт отменён`);
        throw new Error(warnings.at(-1));
      }
      const type = voids.has(n.localName) ? 'mediaElement' : kind(n);
      counts[type] = (counts[type] || 0) + 1;
      const result = {type,attrs:{tag:n.localName,htmlAttrs:raw}};
      if (!voids.has(n.localName)) result.content = [...n.childNodes].map(visit).filter(Boolean);
      return result;
    }
    return {json:{type:'doc',content:[...template.content.childNodes].map(visit).filter(Boolean)},warnings,counts};
  }
  const extensions = [Node.create({name:'doc',topNode:true,content:'inline*'}),Node.create({name:'text',group:'inline'}),UndoRedo];
  for (const name of [...containers,'mediaElement']) extensions.push(Node.create({
    name,inline:true,group:'inline',content:name === 'mediaElement' ? undefined : 'inline*',
    atom:name === 'mediaElement',selectable:true,
    addAttributes() {return {tag:{default:name === 'mediaElement'?'img':'div'},htmlAttrs:{default:{}}};},
    // Pasting arbitrary HTML needs a dedicated importer; generic parsing is
    // intentionally disabled until Word/Google Docs transformations are tested.
    parseHTML() {return [];},
    renderHTML({node}) {return name === 'mediaElement' ? [node.attrs.tag,node.attrs.htmlAttrs] : [node.attrs.tag,node.attrs.htmlAttrs,0];},
  }));
  function validateJSON(json, document) {
    if(json.type !== 'doc')throw new Error('Нет корня документа');
    let count=0;
    function visit(n,depth) {
      if(++count>100000 || depth>80)throw new Error('Превышен размер документа');
      if(n.type==='text'){if(typeof n.text!=='string'||n.marks?.length)throw new Error('Некорректный текст');return;}
      if(n.type!=='doc'){
        if(!containers.includes(n.type)&&n.type!=='mediaElement')throw new Error('Неизвестный тип узла');
        const tag=n.attrs?.tag;
        if(!allowed.has(tag)&&!voids.has(tag))throw new Error('Запрещённый тег');
        if((n.type==='mediaElement')!==voids.has(tag))throw new Error('Несовместимый тип узла');
        const el=document.createElement(tag),raw=n.attrs.htmlAttrs||{};
        for(const [key,value] of Object.entries(raw)) {if(typeof value!=='string')throw new Error('Некорректный атрибут');el.setAttribute(key,value);}
        const warnings=[];attrs(el,warnings);if(warnings.length)throw new Error('Запрещённый атрибут или URL');
      } else if(depth!==0)throw new Error('Вложенный корень');
      for(const child of n.content||[])visit(child,depth+1);
    }
    visit(json,0);
  }
  return {extensions,importHTML,validateJSON};
}
