// Real actions only on accounts/materials created by this run. Never edit a real profile.
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async(admin,base,{capture=false,avatarSize=80}={})=>{
 if(capture)assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
 const suffix=Date.now(),prefix='qa-window-'+suffix,password='WindowActionsDemo1',created=new Map(),errors=[];
 const siteIds=new Set();const origin={Origin:base},api='/editor-api',browser=admin.browser();let personal,owner,friend,adminPage,currentPassword=password,primaryError;
 const make=async(name,role)=>{const login=prefix+'-'+role+'-'+created.size,r=await admin.request.post(base+api+'/users',{headers:origin,data:{name,login,password,role,emailAccess:true}});assert.equal(r.status(),201);const user=await r.json();created.set(user.id,{...user,login});return user;};
 const login=async(context,user)=>assert.ok([200,302].includes((await context.request.post(base+'/login',{maxRedirects:0,headers:origin,form:{login:user.login,password}})).status()));
 const paths=[['home','/'],['articles','/articles/?resume=1'],['hasl','/hasl/?resume=1'],['email','/OUTMAX.html?resume=1'],['site','/site-builder/hasl/?resume=1'],['instructions','/instructions/']].filter(([kind])=>!process.env.ACTION_KIND||kind===process.env.ACTION_KIND);
 async function protect(page,isPersonal){
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.positionEvents=[];for(const type of ['beforetoggle','close','pointerdown'])document.addEventListener(type,e=>{if(e.target.matches?.('dialog')||e.target.closest?.('[data-account-action]')){if(type==='pointerdown'&&e.target.closest?.('[data-account-action]')&&window.windowActionScrolls){window.windowActionScrolls=window.windowActionScrolls.map(([n])=>[n,n.scrollTop,n.scrollLeft]);window.windowActionScroll=[scrollX,scrollY];}window.positionEvents.push({type,id:e.target.id,state:e.newState,y:document.querySelector('.sidebar')?.scrollTop,held:document.documentElement.classList.contains('account-window-position-held')});}},true);});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
   if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();
   if(url.origin!==base)return route.abort();
   if(path===api+'/presence')return route.fulfill({json:{ok:true}});
   if(isPersonal&&path.startsWith(api+'/email-projects/'+prefix+'-letter-')&&['POST','DELETE'].includes(method))return route.continue();
   if(isPersonal&&(path===api+'/site-builder/projects'&&req.postDataJSON()?.fileName?.startsWith('QA шаблон')||path.startsWith(api+'/site-builder/projects/')&&siteIds.has(path.split('/')[4])))return route.continue();
   if(isPersonal&&path.startsWith(api+'/profile'))return route.continue();
   if(isPersonal&&(path.startsWith(api+'/archive/')&&path.endsWith('/copy')||path.startsWith(api+'/draft/')))return route.continue();
   if(!isPersonal&&path===api+'/impersonation/start'&&created.has(req.postDataJSON()?.userId))return route.continue();
   if(!isPersonal&&path===api+'/users'&&method==='POST'&&req.postDataJSON()?.login?.startsWith(prefix))return route.continue();
   if(!isPersonal&&path.startsWith(api+'/users/')&&created.has(path.split('/')[3]))return route.continue();
   return route.fulfill({status:503,json:{error:'QA: unrelated writes blocked'}});
  });
  await page.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
  await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 }
 async function host(page,kind,path,width){
  await page.setViewportSize({width,height:1000});await page.goto(base+path,{waitUntil:'domcontentloaded'});
  await page.locator('.unified-user-menu').waitFor({state:'attached'});
  if(kind==='site')await page.waitForFunction(()=>!document.body.classList.contains('site-starting'));
  if(!['home','instructions'].includes(kind)){await page.waitForFunction(()=>!!window.WorkspaceAdapter);await page.evaluate(()=>WorkspaceAdapter.resume());}
  const marker='Правки '+kind+' '+width;
  if(kind==='site')await page.evaluate(t=>{state.title=t;SiteBuilder.markChanged();},marker);
  else if(kind==='email')await page.locator('#subject').fill(marker);
  else if(['articles','hasl'].includes(kind)){await page.locator('#page-title').fill(marker);await page.locator('#canvas').fill('Текст, который ещё не сохранён: '+marker);}
  await page.evaluate(()=>{window.windowActionsBody=document.body;window.windowActionsStamp={};});
  return {kind,marker,url:page.url(),html:['articles','hasl'].includes(kind)?await page.locator('#canvas').innerHTML():null};
 }
 async function open(page,action){
  await page.locator('.account-menu>summary').click();await page.evaluate(()=>{const panes=[...document.querySelectorAll('main,aside,.sidebar,.studio-sidebar,.workspace,.editor-main')].filter(n=>n.scrollHeight>n.clientHeight+100&&!n.closest('details'));panes.forEach(n=>n.scrollTop=100);window.windowActionScrolls=panes.map(n=>[n,n.scrollTop,n.scrollLeft]);window.windowActionScroll=[scrollX,scrollY];});const target=await page.locator('[data-account-action='+action+']').boundingBox();assert.ok(target&&target.y>=0&&target.y+target.height<=1000);await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
  if(action==='profile'){const f=page.frameLocator('#user-profile-dialog iframe');await f.locator('#settings:not([hidden])').waitFor();return f;}
  const f=await page.locator('#account-window-dialog[open]').count()?page.frameLocator('#account-window-dialog iframe'):page;
  await f.locator('.account-dialog[open]').waitFor();await f.locator('.account-dialog-body[aria-busy=true]').waitFor({state:'hidden'});return f;
 }
 async function close(page,scope,action,snapshot){
  // Simulate a background panel moving while the modal owns focus.
  await page.evaluate(()=>window.windowActionScrolls?.forEach(([n,y])=>n.scrollTop=Math.min(y+20,n.scrollHeight-n.clientHeight)));
  if(action==='profile')await page.locator('#user-profile-dialog>button').click();
  else if(action==='native-email')await page.locator('#email-projects-close').click();
  else if(action==='native-site')await page.locator('#site-template-archive [data-archive-close]').click();
  else await scope.locator('.account-dialog[open]>.account-dialog-head button').click();
  await page.locator('#account-window-dialog[open],#user-profile-dialog[open],.account-dialog[open],#site-template-archive[open],#email-projects-dialog[open]').waitFor({state:'hidden'});
  assert.equal(page.url(),snapshot.url);assert.ok(await page.evaluate(()=>window.windowActionsBody===document.body&&!!window.windowActionsStamp));
  if(!['home','instructions'].includes(snapshot.kind)){
   assert.equal(await page.evaluate(k=>k==='site'?state.title:document.querySelector(k==='email'?'#subject':'#page-title').value,snapshot.kind),snapshot.marker);
   if(['articles','hasl'].includes(snapshot.kind))assert.equal(await page.locator('#canvas').innerHTML(),snapshot.html);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const scroll=await page.evaluate(()=>({panes:window.windowActionScrolls.map(([n,y,x])=>({id:n.id,cls:n.className,y,x,actualY:n.scrollTop,actualX:n.scrollLeft})),before:window.windowActionScroll,after:[scrollX,scrollY],leaving:!!window.__WORKSPACE_LEAVING__,events:window.positionEvents}));assert.ok(scroll.panes.every(n=>n.y===n.actualY&&n.x===n.actualX)&&JSON.stringify(scroll.before)===JSON.stringify(scroll.after),'Closing '+snapshot.kind+'/'+action+' changed host scroll: '+JSON.stringify(scroll));
 }
 const card=(scope,title)=>scope.locator('.archive-card').filter({has:scope.locator('strong[title="'+title+'"]')});
 try{
  owner=await make('Демонстрационный профиль','moderator');friend=await make('Демонстрационный архив','editor');
  personal=await browser.newContext();await login(personal,owner);const other=await browser.newContext();await login(other,friend);
  const seed=async(context,id,title,brand='outmax')=>assert.ok((await context.request.post(base+api+'/save',{headers:origin,data:{id,title,brand,body:'<h1>'+title+'</h1><p>Только тестовый материал</p>',products:[]}})).ok());
  await seed(personal,'actions-original','Проверка собственного архива');await seed(personal,'actions-hasl','Проверка бренда ХАСЛ','hasl');await seed(other,'actions-foreign','Проверка чужого архива');await other.close();
  const page=await personal.newPage();await protect(page,true);adminPage=await admin.newPage();await protect(adminPage,false);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');
  for(const width of (process.env.ACTION_WIDTH?[Number(process.env.ACTION_WIDTH)]:capture?[390,1440]:[1440,390]))for(const [kind,path] of paths){
   console.log('CHECK actions:',kind,width);const snap=await host(page,kind,path,width);
   let scope=await open(page,'profile');
   await scope.locator('[name=firstName]').fill('Демо');await scope.locator('[name=lastName]').fill('Профиль '+width);await scope.locator('[name=telegram]').fill('@window_actions_demo');
   await scope.locator('#details-form button').click();await scope.getByText('Личные данные сохранены.',{exact:true}).waitFor();
   if(kind==='home'){
    await scope.locator('#avatar-file').setInputFiles({name:'demo.png',mimeType:'image/png',buffer:png});await scope.locator('#avatar-crop[open]').waitFor();
    await scope.locator('[data-crop-shape=square]').click();await scope.locator('#avatar-crop-save').click();await scope.getByText('Фотография обновлена.',{exact:true}).waitFor();
    const nextPassword=currentPassword===password?'WindowActionsDemo2':password;await scope.locator('[name=currentPassword]').fill('wrong-password');await scope.locator('[name=newPassword]').fill(nextPassword);await scope.locator('[name=confirmPassword]').fill(nextPassword);await scope.locator('#password-form button').click();await scope.getByText('Текущий пароль указан неверно.',{exact:true}).waitFor();await scope.locator('[name=currentPassword]').fill(currentPassword);await scope.locator('#password-form button').click();await scope.getByText('Пароль изменён. Старые сеансы на других устройствах завершены.',{exact:true}).waitFor();currentPassword=nextPassword;
   }
   await close(page,scope,'profile',snap);
   assert.equal((await(await personal.request.get(base+api+'/me',{maxRetries:2})).json()).telegram,'window_actions_demo');
   scope=await open(page,'articles');await scope.locator('#archive-search').fill('Проверка собственного');await card(scope,'Проверка собственного архива').waitFor();
   assert.equal(await scope.locator('.archive-card').count(),1);await scope.locator('[data-layout=list]').click();await scope.locator('.archive-items.as-list').waitFor();await scope.locator('[data-layout=grid]').click();
   // Cancel removal of the original, then copy it and remove only that disposable copy.
   await card(scope,'Проверка собственного архива').locator('.action-secondary').click();await scope.locator('.account-confirm[open] [data-answer=no]').click();
   const copying=page.waitForResponse(r=>r.url().includes('/copy?brand=outmax')&&r.request().method()==='POST');
   await card(scope,'Проверка собственного архива').locator('.action-copy').click();const copied=await(await copying).json();assert.ok(copied.id);copied.title='Проверка собственного архива — копия';
   await scope.locator('#archive-search').fill('');await card(scope,copied.title).waitFor();await card(scope,copied.title).locator('.action-secondary').click();await scope.locator('.account-confirm[open] [data-answer=yes]').click();await card(scope,copied.title).waitFor({state:'detached'});
   assert.equal((await personal.request.get(base+api+'/draft/'+copied.id+'?brand=outmax',{maxRetries:2})).status(),404);
   assert.equal((await personal.request.get(base+api+'/draft/actions-original?brand=outmax',{maxRetries:2})).status(),200);
   await scope.locator('#archive-brand').selectOption('hasl');assert.equal(await scope.locator('.archive-card').count(),1);await scope.locator('#archive-brand').selectOption('');
   await close(page,scope,'articles',snap);
   scope=await open(page,'archives');await scope.locator('#archive-owner').selectOption(friend.id);await card(scope,'Проверка чужого архива').waitFor();await card(scope,'Проверка чужого архива').locator('.archive-open').click();
   const viewer=scope.locator('.account-viewer[open]');await viewer.waitFor();await viewer.locator('[data-size=mobile]').click();await viewer.locator('iframe.mobile').waitFor();await viewer.locator('[data-size=desktop]').click();
   await viewer.locator('.viewer-close').click();await scope.locator('.account-dialog[open]').waitFor();await close(page,scope,'archives',snap);
   console.log('PASS profile save/avatar and archive filter/layout/copy/delete/cancel/foreign preview:',kind,width);
   if(kind==='email'){
    const id=prefix+'-letter-'+width;assert.ok((await personal.request.post(base+api+'/email-projects/'+id,{headers:origin,data:{filename:'QA письмо',subject:'QA письмо '+width,canvasHtml:'<p>Демонстрационное письмо</p>',renderedHtml:'<p>Демонстрационное письмо</p>',assets:{}}})).ok());
    const openLetters=async()=>{const loaded=page.waitForResponse(r=>r.url()===base+api+'/email-projects'&&r.request().method()==='GET');await page.locator('#open-email-projects').click();await(await loaded).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('#email-projects-dialog[open]').waitFor();};
    await openLetters();
    await page.evaluate(()=>{window.windowActionScrolls=[];window.windowActionScroll=[scrollX,scrollY];});
    await page.locator('#email-project-search').fill('QA письмо '+width);const target=page.locator('[data-project-delete="'+id+'"]');await target.waitFor();assert.equal(await page.locator('.email-project-card').count(),1);
    await target.click();assert.equal((await personal.request.get(base+api+'/email-projects/'+id,{maxRetries:2})).status(),200);await close(page,page,'native-email',snap);
    await openLetters();await page.locator('#email-project-search').fill('QA письмо '+width);await target.click();await target.filter({hasText:'Ещё раз'}).waitFor();await target.click();await target.waitFor({state:'detached'});assert.equal((await personal.request.get(base+api+'/email-projects/'+id,{maxRetries:2})).status(),404);await close(page,page,'native-email',snap);
    console.log('PASS native email archive search, delete confirmation/cancel and unsaved email preserved:',width);
   }
   if(kind==='site'){
    const reference=await(await personal.request.get(base+api+'/site-builder/reference',{maxRetries:2})).json(),state=reference.state||reference;state.fileName='QA шаблон '+width;state.title='QA шаблон '+width;
    const response=await personal.request.post(base+api+'/site-builder/projects',{headers:origin,data:state});assert.equal(response.status(),201);const original=await response.json();siteIds.add(original.id);
    await page.locator('.studio-project-menu>summary').click();await page.locator('.studio-my-templates').click();const archive=page.locator('#site-template-archive[open]');await archive.waitFor();await page.evaluate(()=>{window.windowActionScrolls=[];window.windowActionScroll=[scrollX,scrollY];});
    await archive.locator('input[type=search]').fill('QA шаблон '+width);await archive.locator('[data-archive-open="'+original.id+'"]').waitFor();await archive.locator('[data-archive-view=list]').click();await archive.locator('.site-archive-items.is-list').waitFor();await archive.locator('[data-archive-view=grid]').click();
    await archive.locator('[data-archive-rename="'+original.id+'"]').click();await page.locator('#site-file-name-dialog[open] input').fill('QA шаблон переименован '+width);await page.locator('#site-file-name-dialog [type=submit]').click();await archive.getByText('QA шаблон переименован '+width,{exact:true}).first().waitFor();await archive.locator('input[type=search]').fill('QA шаблон');
    await archive.locator('[data-archive-copy="'+original.id+'"]').click();await page.locator('#site-file-name-dialog[open] input').fill('QA шаблон копия '+width);const copyingSite=page.waitForResponse(r=>r.url()===base+api+'/site-builder/projects'&&r.request().method()==='POST');await page.locator('#site-file-name-dialog [type=submit]').click();const copy=await(await copyingSite).json();siteIds.add(copy.id);await archive.locator('[data-archive-remove="'+copy.id+'"]').click();await archive.locator('[data-archive-undo]').waitFor();await archive.locator('[data-archive-undo]').click();await archive.locator('[data-archive-open="'+copy.id+'"]').waitFor();await archive.locator('[data-archive-remove="'+copy.id+'"]').click();await archive.locator('[data-archive-open="'+copy.id+'"]').waitFor({state:'detached'});await close(page,page,'native-site',snap);
    assert.equal((await personal.request.get(base+api+'/site-builder/projects/'+original.id,{maxRetries:2})).status(),200);console.log('PASS native site archive search/layout/rename/copy/remove/undo and unsaved site preserved:',width);
   }

   // Real administrator actions affect only the editor created through this form.
   const adminSnap=await host(adminPage,kind,path,width);scope=await open(adminPage,'users');await scope.locator('#add-user').click();
   const form=scope.locator('.account-user-dialog[open] .user-form'),loginName=prefix+'-ui-'+kind+'-'+width;
   await form.locator('[name=name]').fill('Демонстрационный редактор');await form.locator('[name=login]').fill(loginName);await form.locator('[name=password]').fill(password);
   const creating=adminPage.waitForResponse(r=>r.url()===base+api+'/users'&&r.request().method()==='POST');await form.locator('[type=submit]').click();const result=await creating;assert.equal(result.status(),201);const added=await result.json();created.set(added.id,{...added,login:loginName});
   const row=()=>scope.locator('.user-row[data-user-id="'+added.id+'"]');await row().waitFor();
   assert.equal(await row().locator('.user-avatar').evaluate(n=>n.getBoundingClientRect().width),width===390?48:avatarSize);
   await row().locator('.user-password').click();assert.equal(await row().locator('.user-password').getAttribute('aria-pressed'),'true');await row().locator('.user-password').click();
   await row().locator('.user-edit').click();const edit=scope.locator('.account-user-dialog[open] .user-form');await edit.locator('[name=name]').fill('Изменённый демонстрационный редактор');await edit.locator('[name=emailAccess]').check();await edit.locator('[type=submit]').click();await row().locator('strong').filter({hasText:'Изменённый'}).waitFor();
   await row().locator('.user-block-toggle').click();await scope.locator('.account-confirm[open] [data-answer=no]').click();assert.equal(await row().getAttribute('data-blocked'),'false');
   await row().locator('.user-block-toggle').click();await scope.locator('.account-confirm[open] [data-answer=yes]').click();await row().filter({has:scope.locator('.user-access-status.is-blocked')}).waitFor();
   await row().locator('.user-block-toggle').click();await row().locator('.user-block-toggle[title="Заблокировать"]').waitFor();
   if(capture&&kind==='home')await adminPage.screenshot({path:'instructions/screens/account-window-actions-'+(width===390?'phone':'desktop')+'.png'});
   if(kind==='email'&&width===1440||kind==='site'&&width===390){
    await row().locator('.user-view-account').click();await adminPage.waitForURL(base+'/',{waitUntil:'domcontentloaded'});
    const viewing=await(await admin.request.get(base+api+'/me',{maxRetries:2})).json();assert.ok(viewing.impersonation);assert.equal(viewing.id,added.id);
    assert.ok((await admin.request.post(base+api+'/impersonation/stop',{headers:origin})).ok());
    await adminPage.goto(adminSnap.url,{waitUntil:'domcontentloaded'});await adminPage.waitForFunction(()=>!!window.WorkspaceAdapter);await adminPage.evaluate(()=>WorkspaceAdapter.resume());
    assert.equal(await adminPage.evaluate(k=>k==='site'?state.title:document.querySelector('#subject').value,kind),adminSnap.marker);
    await adminPage.evaluate(()=>{window.windowActionsBody=document.body;window.windowActionsStamp={};});scope=await open(adminPage,'users');await row().waitFor();
    console.log('PASS intentional user view and return restores unsaved work:',kind,width);
   }
   await row().locator('.user-delete').click();await scope.locator('.account-confirm[open] [data-answer=no]').click();await row().waitFor();
   await row().locator('.user-delete').click();await scope.locator('.account-confirm[open] [data-answer=yes]').click();await row().waitFor({state:'detached'});created.delete(added.id);
   await close(adminPage,scope,'users',adminSnap);console.log('PASS user create/edit/password visibility/block/unblock/delete/cancel and host preserved:',kind,width);
  }
  assert.deepEqual(errors,[]);await page.close();await adminPage.close();adminPage=null;
 }catch(error){primaryError=error;throw error;}finally{
  try{await adminPage?.close();await personal?.close();if((await(await admin.request.get(base+api+'/me',{maxRetries:2})).json()).impersonation)assert.ok((await admin.request.post(base+api+'/impersonation/stop',{headers:origin})).ok());
  const remaining=await(await admin.request.get(base+api+'/users',{maxRetries:2})).json();assert.ok(Array.isArray(remaining));for(const user of remaining)if(user.login.startsWith(prefix))created.set(user.id,user);
  for(const [id,user] of created){assert.ok(user.login.startsWith(prefix));const r=await admin.request.delete(base+api+'/users/'+id,{headers:origin,data:{confirmLogin:user.login}});assert.ok(r.ok()||r.status()===404,'QA cleanup '+r.status());}
  }catch(error){if(!primaryError)throw error;console.error('QA cleanup needs retry for '+prefix+': '+String(error.message).split('Call log:')[0]);}
 }
 console.log('PASS account window actions: real profile/archive/user changes, requested host/viewport matrix, original materials retained, QA accounts removed');
};
if(require.main===module){const {chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8983',live=base.startsWith('https:'),c=live?JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')):{user:'wiki-demo',password:'wiki-local-demo-only'},browser=await chromium.launch({channel:'msedge',headless:false});try{if(live)assert.equal(base,'https://news.outmax-office.ru');const admin=await browser.newContext();assert.ok([200,302].includes((await admin.request.post(base+'/login',{maxRedirects:0,headers:{Origin:base},form:{login:c.user,password:c.password}})).status()));await module.exports(admin,base,{avatarSize:Number(process.env.AVATAR_SIZE||80)});}finally{await browser.close()}})().catch(e=>{console.error(String(e.message).split('Call log:')[0]);console.error(String(e.stack).split('\n').filter(line=>/^\s+at /.test(line)).join('\n'));process.exit(1)});}
