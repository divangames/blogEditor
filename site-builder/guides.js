/* Transient viewport geometry. No document writes, network calls or history. */
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg',round=n=>Math.round(n*10)/10;
  const box=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
  const overlap=(a,b,axis)=>axis==='x'?Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top):Math.min(a.right,b.right)-Math.max(a.left,b.left);
  const start=(r,a)=>a==='x'?r.left:r.top,end=(r,a)=>a==='x'?r.right:r.bottom,size=(r,a)=>a==='x'?r.width:r.height;
  function snapRect(rect,targets,{tolerance=6,gap=0}={}){
    const hits={x:null,y:null};
    for(const axis of ['x','y']){
      const choices=[],offer=(delta,detail)=>{if(Math.abs(delta)<=tolerance)choices.push({delta,...detail});};
      for(const target of targets){
        const r=target.rect;
        if(overlap(rect,r,axis)<-80-tolerance)continue;
        const positions=[start(r,axis),(start(r,axis)+end(r,axis))/2,end(r,axis)];
        const anchors=[start(rect,axis),(start(rect,axis)+end(rect,axis))/2,end(rect,axis)];for(let i=0;i<3;i++)for(let j=0;j<3;j++)if((i===1)===(j===1))offer(positions[i]-anchors[j],{type:'edge',axis,value:positions[i],refs:[r]});
        if(gap>0&&target.peer&&overlap(rect,r,axis)>0){
          offer(end(r,axis)+gap-start(rect,axis),{type:'gap',axis,side:'after',refs:[r],gap});
          offer(start(r,axis)-gap-end(rect,axis),{type:'gap',axis,side:'before',refs:[r],gap});
        }
      }
      if(!gap){
        const peers=targets.filter(t=>t.peer&&overlap(rect,t.rect,axis)>0).map(t=>t.rect).sort((a,b)=>start(a,axis)-start(b,axis));
        for(let i=0;i<peers.length-1;i++){
          const a=peers[i],b=peers[i+1],distance=start(b,axis)-end(a,axis);
          if(distance<=0||overlap(a,b,axis)<=0)continue;
          offer(start(a,axis)-distance-end(rect,axis),{type:'gap',axis,side:'before',refs:[a,b],gap:distance});
          offer(end(b,axis)+distance-start(rect,axis),{type:'gap',axis,side:'after',refs:[a,b],gap:distance});
          const between=(start(b,axis)-end(a,axis)-size(rect,axis))/2;
          if(between>=0)offer(end(a,axis)+between-start(rect,axis),{type:'gap',axis,side:'between',refs:[a,b],gap:between});
        }
      }
      choices.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||Number(a.type==='gap')-Number(b.type==='gap'));hits[axis]=choices[0]||null;
    }
    return {x:hits.x?.delta||0,y:hits.y?.delta||0,hits};
  }
  function distances(a,b){
    const lines=[];
    for(const axis of ['x','y']){
      const lo=start(a,axis),hi=end(a,axis),left=start(b,axis),right=end(b,axis),cross=axis==='x'?(a.top+a.bottom)/2:(a.left+a.right)/2;
      if(lo>=left&&hi<=right){lines.push({axis,from:left,to:lo,cross},{axis,from:hi,to:right,cross});}
      else if(hi<=left)lines.push({axis,from:hi,to:left,cross});
      else if(lo>=right)lines.push({axis,from:right,to:lo,cross});
      else if(Math.abs(lo-left)<=Math.abs(hi-right))lines.push({axis,from:left,to:lo,cross});
      else lines.push({axis,from:hi,to:right,cross});
    }return lines;
  }
  function create(frame,node,excluded=[node],measureRect=()=>node.getBoundingClientRect()){
    const doc=node.ownerDocument,win=doc.defaultView,section=node.closest('[data-site-block]'),parent=node.parentElement.closest('[data-site-object]'),svg=doc.createElementNS(NS,'svg');
    svg.dataset.objectGuides='true';svg.setAttribute('aria-hidden','true');svg.style.cssText='position:fixed;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:2147483100';doc.body.append(svg);
    const origin=measureRect(),seen=new Set();
    const nodes=[...section.querySelectorAll('[data-site-object]'),section].filter(n=>{
      if(excluded.some(x=>n===x||x.contains(n)||n.contains(x)&&n!==parent)||n.closest('[data-object-background]'))return false;
      const r=n.getBoundingClientRect();if(r.width<1||r.height<1)return false;
      for(let p=n;p&&p!==section.parentElement;p=p.parentElement){const c=win.getComputedStyle(p);if(c.display==='none'||c.visibility==='hidden'||Number(c.opacity)===0)return false;}
      const signature=[r.left,r.top,r.right,r.bottom].join(',');if(seen.has(signature))return false;seen.add(signature);return true;
    }).sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return Math.hypot(x.left-origin.left,x.top-origin.top)-Math.hypot(y.left-origin.left,y.top-origin.top);}).slice(0,300);
    let lastHits={x:null,y:null};
    const ratio=()=>Math.max(.05,frame.getBoundingClientRect().width/frame.clientWidth||1);
    const targets=()=>nodes.filter(n=>n.isConnected).map(n=>({node:n,rect:box(n.getBoundingClientRect()),peer:n.parentElement===node.parentElement,parent:n===parent}));
    const element=(tag,attrs)=>{const el=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);svg.append(el);return el;};
    function line(x1,y1,x2,y2,color,dashed=false){element('line',{x1,y1,x2,y2,stroke:color,'stroke-width':1/ratio(),...(dashed?{'stroke-dasharray':4/ratio()}: {})});}
    function measure(value,color='#d7344a'){
      const {axis,from,to,cross}=value,s=ratio(),a=Math.min(from,to),b=Math.max(from,to),distance=round(b-a);
      if(axis==='x'){line(a,cross,b,cross,color);for(const x of [a,b])line(x,cross-3/s,x,cross+3/s,color);}
      else{line(cross,a,cross,b,color);for(const y of [a,b])line(cross-3/s,y,cross+3/s,y,color);}
      const label=(axis==='x'?'X ':'Y ')+distance+' px',w=(label.length*6+10)/s,h=19/s;
      const x=Math.max(2/s,Math.min(win.innerWidth-w-2/s,axis==='x'?(a+b-w)/2:cross+5/s)),y=Math.max(2/s,Math.min(win.innerHeight-h-2/s,axis==='x'?cross-h-4/s:(a+b-h)/2));
      element('rect',{x,y,width:w,height:h,rx:3/s,fill:'white',stroke:color,'stroke-width':.8/s});const text=element('text',{x:x+5/s,y:y+13/s,fill:color,'font-family':'Arial,sans-serif','font-size':11/s,'font-weight':600,'data-guide-distance':axis});text.textContent=label;
    }
    function gapLine(a,b,axis,color){
      const left=start(a,axis)<=start(b,axis)?a:b,right=left===a?b:a;
      measure({axis,from:end(left,axis),to:start(right,axis),cross:axis==='x'?(Math.max(a.top,b.top)+Math.min(a.bottom,b.bottom))/2:(Math.max(a.left,b.left)+Math.min(a.right,b.right))/2},color);
    }
    function draw({alt=false,x=0,y=0,hits=lastHits}={}){
      svg.replaceChildren();if(!node.isConnected)return;const r=box(measureRect()),all=targets();lastHits=hits;
      for(const axis of ['x','y']){
        const hit=hits?.[axis];if(!hit)continue;
        if(hit.type==='edge'){
          const ref=hit.refs[0],value=hit.value,color='#a540c8';
          if(axis==='x')line(value,Math.min(r.top,ref.top)-6/ratio(),value,Math.max(r.bottom,ref.bottom)+6/ratio(),color);
          else line(Math.min(r.left,ref.left)-6/ratio(),value,Math.max(r.right,ref.right)+6/ratio(),value,color);
        }else{
          const color='#a540c8',refs=hit.refs;
          if(hit.side==='between'){gapLine(refs[0],r,axis,color);gapLine(r,refs[1],axis,color);}
          else{gapLine(hit.side==='before'?refs[0]:refs.at(-1),r,axis,color);if(refs.length>1)gapLine(refs[0],refs[1],axis,color);}
        }
      }
      if(alt){
        const under=doc.elementsFromPoint(x,y).find(n=>n!==node&&!node.contains(n)&&n.matches('[data-site-object]')&&nodes.includes(n));
        let target=all.find(t=>t.node===under);
        if(!target){const peers=all.filter(t=>t.peer);target=peers.sort((a,b)=>Math.hypot(Math.max(0,a.rect.left-r.right,r.left-a.rect.right),Math.max(0,a.rect.top-r.bottom,r.top-a.rect.bottom))-Math.hypot(Math.max(0,b.rect.left-r.right,r.left-b.rect.right),Math.max(0,b.rect.top-r.bottom,r.top-b.rect.bottom)))[0]||all.find(t=>t.parent);}
        if(target){const t=target.rect;for(const m of distances(r,t))measure(m);for(const [a,b,c,d] of [[t.left,t.top,t.right,t.top],[t.right,t.top,t.right,t.bottom],[t.right,t.bottom,t.left,t.bottom],[t.left,t.bottom,t.left,t.top]])line(a,b,c,d,'#d7344a',true);}
      }
    }
    return {snap:(rect,options)=>snapRect(rect,targets(),{...options,tolerance:6/ratio()}),draw,clear:()=>{lastHits={x:null,y:null};svg.replaceChildren();},destroy:()=>svg.remove()};
  }
  window.SiteGuides={create,snapRect,distances};
})();
