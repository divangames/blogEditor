// Run after node experiments/tiptap-editor/build-source.cjs.
const {JSDOM}=require('../release/tiptap-check/node_modules/jsdom');
const render=require('../release/tiptap-prototype/production-admin.cjs');
const assert=require('node:assert/strict');
const dom=new JSDOM('<style>.om-guide p{color:red}</style><article class="om-guide"><h1>Export test</h1><p>Article text</p><p data-editor-caret-paragraph><br></p></article>');
global.document=dom.window.document;global.CSSStyleRule=dom.window.CSSStyleRule;
const html=render({canvas:document.querySelector('article'),brand:'outmax',styleSheets:[...document.styleSheets]});
assert.match(html,/Article text/);assert.doesNotMatch(html,/data-editor-caret-paragraph|application\/ld\+json/);
console.log('PASS shared Tiptap exporter without legacy metadata controls; caret removed');
const columns=document.createElement('div');columns.innerHTML='<div class="om-columns" data-columns-widths="30,70"><div class="om-column"><p>First</p></div><div class="om-column"><p>Second</p></div></div>';document.querySelector('article').append(columns.firstElementChild);
const withColumns=render({canvas:document.querySelector('article'),brand:'outmax',styleSheets:[...document.styleSheets]});
assert.match(withColumns,/data-columns-widths="30,70"/);assert.match(withColumns,/minmax\(0,30fr\)/);assert.match(withColumns,/data-article-columns/);
console.log('PASS shared exporter includes current block normalizers and column proportions');
dom.window.close();
