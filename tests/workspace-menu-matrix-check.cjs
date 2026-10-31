const fs=require('fs'),assert=require('node:assert/strict');
const ROOT=require('node:path').resolve(__dirname,'..');
const {chromium}=require(ROOT+'/release/ui-check/node_modules/playwright');
const live=process.env.WORKSPACE_LIVE==='1',base=live?'https://news.outmax-office.ru':process.env.WIKI_TEST_BASE||'http://127.0.0.1:8911',keys=['outmax','hasl','email','site'];
const paths={outmax:'/articles/',hasl:'/hasl/',email:'/OUTMAX.html',site:'/site-builder/hasl/'};
const credentials=live?JSON.parse(fs.readFileSync(ROOT+'/release/.outmax-deploy-credentials.json','utf8')):{user:'wiki-demo',password:'wiki-local-demo-only'};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:!live});const report=[];
 const devices=[['desktop',1440,1000],['phone',390,844]].filter(([name])=>!process.env.WORKSPACE_TEST_DEVICE||name===process.env.WORKSPACE_TEST_DEVICE);assert.ok(devices.length,'Unknown WORKSPACE_TEST_DEVICE');
 try{for(const [device,width,height] of devices){
  const context=await browser.newContext({viewport:{width,height},isMobile:device==='phone',hasTouch:device==='phone',httpCredentials:{username:credentials.user,password:credentials.password}});
  assert.ok((await context.request.post(base+'/login',{form:{login:credentials.user,password:credentials.password},headers:{Origin:base}})).ok());
  let blocked=0,allowDialogs=true;const errors=[],unexpectedDialogs=[];
  await context.route('**/*',r=>{if(['GET','HEAD','OPTIONS'].includes(r.request().method()))return r.continue();blocked++;return r.fulfill({status:503,json:{error:'QA: writes blocked'}})});
  await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  const get=async path=>{const r=await context.request.get(base+'/editor-api'+path);assert.ok(r.ok());return r.json()};
  const lists={outmax:await get('/drafts?brand=outmax'),hasl:await get('/drafts?brand=hasl'),email:await get('/email-projects'),site:await get('/site-builder/projects')};
  const first=k=>(Array.isArray(lists[k])?lists[k]:lists[k].items)[0];keys.forEach(k=>assert.ok(first(k)));
  let page=await context.newPage(),current=null,sequence=0;const expected={},menus={},transitions=[];
  const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{if(!allowDialogs){const detail={type:d.type(),path:new URL(p.url()).pathname,current,sequence};unexpectedDialogs.push(detail);console.log('UNEXPECTED_DIALOG',JSON.stringify(detail));}await d.accept()})};observe(page);
  const ready=async(k,explicit=false)=>{if(!explicit){await page.locator('#workspace-start[open]').waitFor();await page.locator('.start-continue').click();await page.waitForFunction(()=>!document.querySelector('#workspace-start[open]'),null,{timeout:60000});}if(k===null)k=Object.keys(paths).find(key=>paths[key]===new URL(page.url()).pathname);if(k==='outmax'||k==='hasl')await page.waitForFunction(()=>typeof articleBackupReady!=='undefined'&&articleBackupReady);else{await page.waitForFunction(()=>typeof window.WorkspaceAdapter?.resume==='function');await page.evaluate(()=>WorkspaceAdapter.resume())}assert.equal(new URL(page.url()).pathname,paths[k]);current=k;};
  const snapshot=async(k,p=page)=>p.evaluate(k=>{
   const canvas=document.getElementById('canvas');
   if(k==='site')return {title:state.title,texts:state.texts,layout:state.layout,images:state.images};
   const common={text:canvas.textContent.replace(/\s+/g,' ').trim(),images:canvas.querySelectorAll('img').length};
   return k==='email'?{...common,subject:document.getElementById('subject').value,preheader:document.getElementById('preheader').value,assets:emailProjectBridge.assetEntries().map(([p,b])=>[p,b.size]).sort()}:{...common,title:document.getElementById('page-title').value};
  },k);
  const edit=async k=>{const marker='QA-'+device+'-'+(++sequence)+'-'+Date.now();if(k==='site')await page.evaluate(t=>{state.title=t;SiteBuilder.markChanged()},marker);else{await page.locator(k==='email'?'#subject':'#page-title').fill(marker);if(k==='email')await page.locator('#preheader').fill(marker+'-preheader');await page.locator('#canvas').evaluate((n,t)=>{const p=document.createElement('p');p.textContent=t;n.append(p);n.dispatchEvent(new Event('input',{bubbles:true}))},marker);}expected[k]=await snapshot(k);};
  const verify=async(k,p=page)=>{const actual=await snapshot(k,p);const changed=Object.keys(expected[k]).filter(key=>JSON.stringify(actual[key])!==JSON.stringify(expected[k][key]));assert.equal(changed.join(','),'',device+' '+k+' unsaved fields');};
  const openMenu=async()=>{const menu=page.locator('.editor-switcher');if(!await menu.evaluate(n=>n.open))await menu.locator(':scope>summary').click();await page.waitForFunction(()=>document.querySelector('.editor-switcher[open]'));return menu.locator('.editor-switcher-menu');};
  const checkMenu=async k=>{const menu=await openMenu();const image=page.locator('.editor-switcher .mark');await image.evaluate(n=>n.decode());assert.ok(await image.evaluate(n=>n.complete&&n.naturalWidth>0));await page.waitForFunction(()=>[...document.querySelectorAll('.editor-switcher-menu a')].every(n=>n.querySelector('svg[data-phosphor]')));const b=await menu.boundingBox(),client=await page.evaluate(()=>document.documentElement.clientWidth);assert.ok(b.x>=0&&b.x+b.width<=client+1,k+' menu fits');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),k+' viewport fits');const icons=await menu.locator('svg[data-phosphor]').count();assert.ok(icons>=5);menus[k]={logo:true,icons,withinViewport:true};await page.locator('.editor-switcher>summary').click();};
  for(const k of keys){const id=first(k).id;await page.goto(base+paths[k]+'?'+(k==='site'?'page':k==='email'?'project':'article')+'='+encodeURIComponent(id),{waitUntil:'domcontentloaded'});await ready(k,true);await edit(k);await checkMenu(k);allowDialogs=false;await page.locator('.workspace-home').click();await page.waitForURL(base+'/');current=null;allowDialogs=true;}
  const go=async target=>{
   allowDialogs=false;
   if(current===target)return;
   if(!current){await page.locator('.tool').filter({hasText:target==='email'?'Email-редактор':target==='site'?'Конструктор сайта':'Статьи'}).click();const chosen=target==='outmax'||target==='hasl'?null:target;await ready(chosen);if(current===target){await verify(target);return;}}
   const source=current,old=page,menu=await openMenu();let link;
   if(target==='site'){const group=menu.locator('.site-switcher-group');if(!await group.evaluate(n=>n.open))await group.locator(':scope>summary').click();link=group.locator('a[href*="/site-builder/hasl/"]');}
   else link=menu.getByRole('link',{name:target==='email'?/Редактор email-рассылок/:target==='hasl'?/Редактор ХАСЛ/:/Редактор OUTMAX/});
   assert.equal(await link.getAttribute('aria-disabled'),null);
   if(await link.getAttribute('target')==='_blank'){const [next]=await Promise.all([page.waitForEvent('popup'),link.click()]);observe(next);await next.waitForLoadState('domcontentloaded');await verify(source,old);page=next;await ready(target);await old.close();}
   else{await link.click();await ready(target);}
   await verify(target);transitions.push(source+'>'+target);
  };
  await go('outmax');
  for(const source of keys){await go(source);for(const target of keys.filter(k=>k!==source)){await edit(source);await go(target);await edit(target);await go(source);await verify(source);}console.log('LIVE_MATRIX',device,source,'passed');}
  // Same-tool clicks close the menu without navigating or changing a dirty document.
  for(const k of keys){await go(k);await edit(k);const menu=await openMenu();const link=menu.locator('a[aria-current="page"]').first();if(await link.getAttribute('target')!=='_blank'){await link.click();await verify(k);}else await page.locator('.editor-switcher>summary').click();allowDialogs=true;await page.reload({waitUntil:'domcontentloaded'});allowDialogs=false;await ready(k,true);await verify(k);}
  const canonical=value=>JSON.stringify((Array.isArray(value)?value:value.items).map(x=>Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>a.id.localeCompare(b.id)));
  const endpoints={outmax:'/drafts?brand=outmax',hasl:'/drafts?brand=hasl',email:'/email-projects',site:'/site-builder/projects'};
  for(const k of keys){const after=await get(endpoints[k]);if(canonical(after)!==canonical(lists[k])){const rows=x=>Array.isArray(x)?x:x.items,old=new Map(rows(lists[k]).map(x=>[x.id,x])),now=new Map(rows(after).map(x=>[x.id,x]));const fields=[...new Set(rows(after).flatMap(x=>Object.keys(x).filter(key=>old.has(x.id)&&JSON.stringify(x[key])!==JSON.stringify(old.get(x.id)[key]))))];console.log('SERVER_CHANGE',JSON.stringify({tool:k,before:old.size,after:now.size,fields}));}assert.ok(canonical(after)===canonical(lists[k]),'Server snapshot unchanged: '+k);}
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedDialogs,[]);
  const result={device,viewport:[width,height],menus,directedTransitions:[...new Set(transitions)].sort(),transitionCount:transitions.length,unsavedRestore:true,reload:true,pageErrors:errors.length,unexpectedDialogs:unexpectedDialogs.length,blockedWrites:blocked,serverDocumentsUnchanged:true};report.push(result);fs.writeFileSync(ROOT+'/tmp/'+(live?'live':'local')+'-menu-matrix-report.json',JSON.stringify(report,null,2));console.log('LIVE_MATRIX_PASS',JSON.stringify(result));await context.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(String(e.message).split('Call log:')[0]);process.exit(1)});
