/* Optional mobile spring feedback, loaded only after interaction. */
window.HaslMobileMotion=function(root,reduced){
    const memory=navigator.deviceMemory,cores=navigator.hardwareConcurrency,connection=navigator.connection;
    const constrained=connection?.saveData||memory!==undefined&&memory<=2||cores!==undefined&&cores<=2;
    let ceiling=constrained?'lite':cores!==undefined&&cores<=4?'balanced':'high',tier=constrained?'lite':'balanced',raf=0,lastSample=-Infinity,lastInteraction=0,pointer=null,observer=null,longTasks=null,mobileLayout=true;
    const active=new Map(),stats={samples:0,missed:0,maxGap:0,refreshPeriod:null,changes:0};
    if(constrained){
      root.__haslMotion={tier:'lite',stats};
      return {enter(){},cancel(){},get mobile(){return root.clientWidth<=767;},tier:'lite'};
    }
    const mobile=()=>mobileLayout,allowed=()=>mobileLayout&&!reduced.matches&&!document.hidden&&root.isConnected;
    const curves={high:'linear(0,.23,.57,.84,1.01,1.055,1.04,1.015,.998,.994,1)',balanced:'linear(0,.4,.72,.9,.98,1.008,1)',lite:'cubic-bezier(.22,1,.36,1)'};
    const easing=()=>CSS.supports('animation-timing-function',curves[tier])?curves[tier]:'cubic-bezier(.22,1,.36,1)';
    const cancel=node=>{const animation=active.get(node);if(animation){active.delete(node);animation.cancel();observer?.unobserve(node);}};
    const clear=()=>{for(const node of [...active.keys()])cancel(node);cancelAnimationFrame(raf);raf=0;};
    const change=next=>{if(tier===next)return;tier=next;stats.changes++;if(next!=='high')clear();if(mobile())root.dataset.motionTier=tier;};
    const simplify=()=>{ceiling=tier==='high'?'balanced':'lite';change(ceiling);};
    const sample=()=>{
      if(raf||tier==='lite'||performance.now()-lastSample<1200)return;
      lastSample=performance.now();let previous=0;const gaps=[];
      const frame=now=>{raf=0;if(!allowed())return;if(previous)gaps.push(now-previous);previous=now;
        if(gaps.length>=12||!active.size||now-lastSample>800){
          if(gaps.length<6)return;
          const sorted=[...gaps].sort((a,b)=>a-b),period=Math.max(8,Math.min(16.7,sorted[Math.floor(sorted.length/4)]||16.7));
          const missed=gaps.filter(gap=>gap>period*1.8).length;stats.samples++;stats.missed+=missed;stats.maxGap=Math.max(stats.maxGap,...gaps);stats.refreshPeriod=period;
          if(missed>=3||Math.max(...gaps)>50)simplify();else if(ceiling==='high'&&gaps.length>=8&&missed===0)change('high');return;
        }
        raf=requestAnimationFrame(frame);
      };raf=requestAnimationFrame(frame);
    };
    const animate=(node,frames,duration)=>{
      if(!node||!allowed()||tier==='lite'||!node.animate)return;
      cancel(node);while(active.size>=(tier==='high'?2:1))cancel(active.keys().next().value);
      observer||=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)cancel(entry.target);}));
      const animation=node.animate(frames,{duration:duration??(tier==='high'?280:tier==='balanced'?190:100),easing:easing()});active.set(node,animation);observer.observe(node);
      animation.onfinish=()=>{if(active.get(node)===animation){active.delete(node);observer.unobserve(node);}};sample();
    };
    const enter=node=>{if(!node||!allowed()||tier==='lite')return;
      animate(node,[{opacity:0,transform:'translateY('+(tier==='high'?5:3)+'px)'},{opacity:1,transform:'none'}],tier==='high'?260:170);
    };
    const init=()=>{
      if(!mobile())return;root.dataset.motionTier=reduced.matches?'lite':tier;
      if(tier!=='lite'&&!longTasks&&typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
        longTasks=new PerformanceObserver(list=>{if(allowed()&&tier!=='lite'&&list.getEntries().some(entry=>entry.startTime+entry.duration>=lastInteraction&&entry.startTime<lastInteraction+600&&entry.duration>=64))simplify();});longTasks.observe({type:'longtask'});
      }
    };
    const pointerDown=event=>{if(!allowed()||!event.isPrimary||event.button>0)return;lastInteraction=performance.now();init();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,node:event.target.closest('button,.btn,.size-choice')};};
    root.addEventListener('pointerdown',pointerDown,{passive:true});
    root.addEventListener('pointerup',event=>{
      const press=pointer;pointer=null;if(!press?.node||press.node.closest('.faq-q')||press.id!==event.pointerId||Math.hypot(event.clientX-press.x,event.clientY-press.y)>10||!allowed()||tier==='lite')return;
      // Native activation is never delayed. The browser composites the optional release.
      requestAnimationFrame(()=>{if(!allowed()||!press.node.isConnected)return;const node=press.node.querySelector('svg,.faq-sign')||press.node,base=getComputedStyle(node).transform,transform=base==='none'?'':base;
        animate(node,[{transform:transform+(tier==='high'?' scale(.975,1.01)':tier==='balanced'?' scale(.985)':' scale(.995)')},{transform:base}]);
      });
    },{passive:true});
    root.addEventListener('pointercancel',()=>{pointer=null;},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
    new ResizeObserver(entries=>{mobileLayout=entries[0].contentRect.width<=767;if(!mobileLayout){clear();delete root.dataset.motionTier;}}).observe(root);
    reduced.addEventListener('change',()=>{if(reduced.matches){clear();root.dataset.motionTier='lite';}});
    root.__haslMotion={get tier(){return reduced.matches?'lite':tier;},stats};
    return {enter,cancel,start:pointerDown,get mobile(){return mobileLayout;},get tier(){return reduced.matches?'lite':tier;}};
  };
