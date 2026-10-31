// Controlled mobile lab. Run baseline before editing, then candidate with the same fixture.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{
 const phase=process.argv[2]||'baseline',url=process.argv[3]||'http://127.0.0.1:8930/'+phase+'/hasl.html',folder=path.resolve('release/mobile-motion-20261026/'+phase+'/audit');fs.mkdirSync(folder,{recursive:true});
 const context=await chromium.launchPersistentContext(path.join(folder,'browser-profile'),{channel:'msedge',headless:true,args:['--remote-debugging-port=9238']});
 try{
  const lighthouse=(await import('../release/hasl-audit-tools/node_modules/lighthouse/core/index.js')).default,runs=[];
  if(phase==='paired'){
   const paired={baseline:[],candidate:[]};
   for(let i=0;i<3;i++)for(const variant of (i%2?['candidate','baseline']:['baseline','candidate'])){
    const target='http://127.0.0.1:8930/'+variant+'/hasl.html',dest=path.resolve('release/mobile-motion-20261026/paired/'+variant);fs.mkdirSync(dest,{recursive:true});
    const result=await lighthouse(target,{port:9238,output:['json','html'],onlyCategories:['performance'],formFactor:'mobile',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:3,disabled:false},throttlingMethod:'simulate',throttling:{rttMs:150,throughputKbps:1638.4,cpuSlowdownMultiplier:4},maxWaitForLoad:45000,logLevel:'error'});
    fs.writeFileSync(path.join(dest,'lighthouse-'+i+'.json'),result.report[0]);fs.writeFileSync(path.join(dest,'lighthouse-'+i+'.html'),result.report[1]);const a=result.lhr.audits,value={score:Math.round(result.lhr.categories.performance.score*100),lcp:a['largest-contentful-paint'].numericValue,cls:a['cumulative-layout-shift'].numericValue,tbt:a['total-blocking-time'].numericValue,fcp:a['first-contentful-paint'].numericValue,bytes:a['total-byte-weight'].numericValue};paired[variant].push(value);console.log(JSON.stringify({phase:variant,paired:true,run:i,...value}));
   }
   const summary=Object.fromEntries(Object.entries(paired).map(([variant,values])=>[variant,{runs:values,median:Object.fromEntries(Object.keys(values[0]).map(key=>[key,values.map(r=>r[key]).sort((a,b)=>a-b)[1]]))}]));fs.writeFileSync('release/mobile-motion-20261026/paired/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({paired:summary}));return;
  }
  for(let i=0;i<3;i++){
   const result=await lighthouse(url,{port:9238,output:['json','html'],onlyCategories:['performance'],formFactor:'mobile',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:3,disabled:false},throttlingMethod:'simulate',throttling:{rttMs:150,throughputKbps:1638.4,cpuSlowdownMultiplier:4},maxWaitForLoad:45000,logLevel:'error'});
   fs.writeFileSync(path.join(folder,'lighthouse-'+i+'.json'),result.report[0]);fs.writeFileSync(path.join(folder,'lighthouse-'+i+'.html'),result.report[1]);
   const a=result.lhr.audits,value={score:Math.round(result.lhr.categories.performance.score*100),lcp:a['largest-contentful-paint'].numericValue,cls:a['cumulative-layout-shift'].numericValue,tbt:a['total-blocking-time'].numericValue,fcp:a['first-contentful-paint'].numericValue,bytes:a['total-byte-weight'].numericValue};runs.push(value);console.log(JSON.stringify({phase,run:i,...value}));
  }
  const median=key=>runs.map(r=>r[key]).sort((a,b)=>a-b)[1];const summary={url,phase,kind:'LAB, not CrUX/RUM; not real smartphone hardware',conditions:{browser:context.browser()?.version(),viewport:'390x844 DPR 3',cache:'cold per Lighthouse navigation',network:'simulated RTT 150 ms, 1638.4 Kbps',cpu:'simulated 4x slowdown',runs:3},runs,median:Object.fromEntries(Object.keys(runs[0]).map(k=>[k,median(k)]))};fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({phase,median:summary.median}));
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exit(1);});
