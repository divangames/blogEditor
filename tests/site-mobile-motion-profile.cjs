// DevTools Protocol interaction traces; CPU profiles are emulations, not physical phones.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('../release/ui-check/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const results=[];
 for(const round of [0,1,2])for(const profile of [{name:'weak',cpu:8,memory:2,cores:2},{name:'medium',cpu:4,memory:4,cores:4},{name:'modern',cpu:1,memory:8,cores:8}])for(const phase of (round%2?['candidate','baseline']:['baseline','candidate'])){
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();
  await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.route(/\/public-site-motion\.js(?:\?.*)?$/,r=>r.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync('release/mobile-motion-20261026/candidate/mobile-motion.js','utf8')}));
  await p.addInitScript(profile=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>profile.memory});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>profile.cores});window.__lab={events:[],cls:0,frames:[]};new PerformanceObserver(list=>list.getEntries().forEach(entry=>{if(!entry.hadRecentInput)__lab.cls+=entry.value;})).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>list.getEntries().forEach(entry=>{if(entry.interactionId)__lab.events.push({duration:entry.duration,id:entry.interactionId,name:entry.name});})).observe({type:'event',durationThreshold:16,buffered:true});},profile);
  const session=await c.newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});await session.send('Performance.enable');
  await p.goto('http://127.0.0.1:8930/'+phase+'/hasl.html');await p.evaluate(()=>document.fonts.ready);
  const q=p.locator('.faq-q').first();await q.scrollIntoViewIfNeeded();await p.waitForTimeout(150);
  const box=await q.boundingBox(),touch=async()=>{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await session.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,cc,latencyInfo',transferMode:'ReturnAsStream'});
  const before=await session.send('Performance.getMetrics');
  await p.evaluate(()=>{const end=performance.now()+1200;let previous=0;const frame=now=>{if(previous)__lab.frames.push(now-previous);previous=now;if(now<end)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await touch();await p.waitForTimeout(180);await touch();await p.waitForTimeout(180);await touch();await p.waitForTimeout(900);
  const data=await p.evaluate(()=>({...__lab,tier:document.querySelector('.hasl-home-embed').__haslMotion?.tier||'none',adaptive:document.querySelector('.hasl-home-embed').__haslMotion?.stats||null,animations:document.getAnimations().length}));
  const after=await session.send('Performance.getMetrics'),complete=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));await session.send('Tracing.end');const {stream}=await complete;let trace='';for(;;){const chunk=await session.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await session.send('IO.close',{handle:stream});
  const folder='release/mobile-motion-20261026/'+phase+'/profiles';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,profile.name+'-'+round+'-trace.json'),trace);
  const metric=(values,name)=>values.metrics.find(m=>m.name===name)?.value||0,sorted=data.frames.filter(v=>v>0).sort((a,b)=>a-b),period=sorted[Math.floor(sorted.length/4)]||16.7;
  const result={phase,round,profile:profile.name,conditions:{cpuSlowdown:profile.cpu,viewport:'390x844',assets:'external images/fonts blocked to isolate interaction work',display:'headless desktop refresh; not a phone panel'},frameSamples:sorted.length,rafMedianMs:sorted[Math.floor(sorted.length/2)],rafP95Ms:sorted[Math.floor(sorted.length*.95)],missedEstimate:data.frames.filter(gap=>gap>period*1.8).length,eventSamples:data.events.length,eventMaxMs:data.events.length?Math.max(...data.events.map(e=>e.duration)):null,inp:'not field INP; event durations from one lab journey',cls:data.cls,tier:data.tier,adaptive:data.adaptive,layoutCount:metric(after,'LayoutCount')-metric(before,'LayoutCount'),layoutMs:(metric(after,'LayoutDuration')-metric(before,'LayoutDuration'))*1000,scriptMs:(metric(after,'ScriptDuration')-metric(before,'ScriptDuration'))*1000,animationsAfterIdle:data.animations};results.push(result);console.log(JSON.stringify(result));await c.close();
 }
 fs.writeFileSync('release/mobile-motion-20261026/profiles-summary.json',JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
