const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('../release/tiptap-check/node_modules/jsdom');
const out=path.resolve(__dirname,process.argv.includes('--block')?'../release/tiptap-prototype/results-block':'../release/tiptap-prototype/results');
function signature(html){
  const d=new JSDOM(html).window.document;
  function visit(n){if(n.nodeType===3)return ['text',n.nodeValue];if(n.nodeType!==1)return null;return [n.localName,[...n.attributes].map(a=>[a.name,a.name==='style'?[...n.style].map(k=>[k,n.style.getPropertyValue(k),n.style.getPropertyPriority(k)]).sort():a.value]).sort(),[...n.childNodes].map(visit).filter(Boolean)];}
  return visit(d.documentElement);
}
const report=JSON.parse(fs.readFileSync(path.join(out,'export-report.json'),'utf8'));
for(const result of report.results){
  for(const domain of ['ru','com']){
    const name=`tiptap-check-${result.case.startsWith('hasl')?'hasl':'outmaxshop'}-${domain}.html`;
    const original=fs.readFileSync(path.join(out,`${result.case}-original-${name}`),'utf8');
    const exported=fs.readFileSync(path.join(out,`${result.case}-prototype-${name}`),'utf8');
    assert.equal(JSON.stringify(signature(exported)),JSON.stringify(signature(original)),`${result.case}: ${domain} export DOM changed`);
  }
  result.exportedDOMParity=true;
}
fs.writeFileSync(path.join(out,'export-report.json'),JSON.stringify(report,null,2));console.log('Python HTML/ZIP RU+COM DOM parity: '+report.results.length+' cases passed.');
