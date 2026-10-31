const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('site-builder/runtime.js','utf8'),sandbox);
const runtime='('+sandbox.window.HaslSiteRuntime.toString()+')();';
const css=fs.readFileSync('site-builder/template.html','utf8').split('\n').filter(line=>line.includes('transition-property:transform,opacity')||line.includes('@media(hover:none)')||line.includes('transition-duration:100ms')||line.includes('[data-motion-pending]')).join('\n');
const folder='release/mobile-motion-20261026/candidate';fs.mkdirSync(folder,{recursive:true});
for(const site of ['hasl','hasle']){
 const source=fs.readFileSync('release/mobile-motion-20261026/baseline/'+site+'.html','utf8');let matches=0;
 const html=source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g,(tag,code)=>{if(!code.startsWith('(function')||!code.includes('hasl-home-favorites'))return tag;matches++;const end=code.indexOf('})();');return '<script>'+runtime+code.slice(end+5)+'</script>';}).replace('</head>','<style data-mobile-motion>'+css+'</style></head>').replace('<div class="hasl-home-embed"','<div class="hasl-home-embed" data-motion-src="http://127.0.0.1:8919/editor-api/public-site-motion.js?v=20261026-1"');
 if(matches!==1)throw Error('Expected one baseline runtime; got '+matches);fs.writeFileSync(path.join(folder,site+'.html'),html);
}
fs.copyFileSync('site-builder/runtime.js',path.join(folder,'runtime.js'));fs.copyFileSync('site-builder/mobile-motion.js',path.join(folder,'mobile-motion.js'));fs.copyFileSync('site-builder/template.html',path.join(folder,'template.html'));console.log('Frozen candidate; baseline content retained');
