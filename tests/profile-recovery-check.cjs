/* Проверка восстановления профиля после обрыва: отдельный QA-аккаунт, рабочие материалы не сохраняются. */
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async(admin,base,{capture=false}={})=>{
 if(capture)assert.match(base,/^http:\/\/127\.0\.0\.1:/);
 const origin={Origin:base},login='qa-profile-recovery-'+Date.now(),password='ProfileSyncDemo1',created=await admin.request.post(base+'/editor-api/users',{headers:origin,data:{name:'Демонстрационный профиль',login,password,role:'editor',emailAccess:true}});assert.equal(created.status(),201);const user=await created.json(),context=await admin.browser().newContext(),remote=await admin.browser().newContext();let primaryError;
 const paths=[['home','/'],['articles','/articles/?resume=1'],['hasl','/hasl/?resume=1'],['email','/OUTMAX.html?resume=1'],['site','/site-builder/?resume=1'],['instructions','/instructions/']],errors=[];
 if(capture&&process.env.PROFILE_PUSH_CAPTURE_SEED)paths.pop();
 try{
 assert.ok((await admin.request.post(base+'/editor-api/site-builder/access/'+user.id,{headers:origin,data:{allowed:true}})).ok());
 assert.ok([200,302].includes((await context.request.post(base+'/login',{maxRedirects:0,headers:origin,form:{login,password}})).status()));
 assert.ok([200,302].includes((await remote.request.post(base+'/login',{maxRedirects:0,headers:origin,form:{login,password}})).status()));
 await context.route('**/*',r=>{const req=r.request(),p=new URL(req.url()).pathname;if(['GET','HEAD','OPTIONS'].includes(req.method())||p.startsWith('/editor-api/profile')||p==='/editor-api/users/events/close')return r.continue();return r.fulfill({status:p==='/editor-api/presence'?200:503,json:{ok:true,error:'QA: material writes blocked'}});});
 await context.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));await context.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 for(const width of [1440,390]){
 const hosts=[];
 for(const [kind,path] of paths){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:1000});await page.goto(base+path,{waitUntil:'domcontentloaded'});console.log('OPEN',kind,width,new URL(page.url()).pathname);await page.locator('.unified-user-menu').waitFor({state:'attached'});if(kind==='site')await page.waitForFunction(()=>!document.body.classList.contains('site-starting'));if(!['home','instructions'].includes(kind)){await page.waitForFunction(()=>!!window.WorkspaceAdapter);await page.evaluate(()=>WorkspaceAdapter.resume());}
 if(kind==='site')await page.evaluate(()=>document.querySelector('#site-template-catalog[open]')?.close());
 const marker='Несохранённые правки '+kind+' '+width;
 if(kind==='site')await page.evaluate(t=>{state.title=t;SiteBuilder.markChanged();},marker);else if(kind==='email')await page.locator('#subject').fill(marker);else if(['articles','hasl'].includes(kind)){await page.locator('#page-title').fill(marker);await page.locator('#canvas').fill(marker);}
 await page.evaluate(()=>{window.syncTestBody=document.body;});hosts.push({kind,page,url:page.url(),marker,html:['articles','hasl'].includes(kind)?await page.locator('#canvas').innerHTML():null});}
 const verify=async(name,avatar)=>{for(const h of hosts){const p=h.page;await p.waitForFunction(n=>document.querySelector('.account-menu-meta strong')?.textContent===n,name);assert.equal(await p.locator(h.kind==='home'?'#profile':h.kind==='site'?'#studio-account-name':'.account-greeting strong').innerText(),h.kind==='home'?'Привет, '+name:name);
 if(avatar){await p.waitForFunction(src=>[...document.querySelectorAll('.account-avatar')].every(n=>n.querySelector('img')?.getAttribute('src')===src),avatar);assert.ok(await p.locator('.account-avatar img').first().evaluate(n=>n.decode().then(()=>n.naturalWidth>0)));}else{await p.waitForFunction(()=>!document.querySelector('.account-avatar img'));assert.equal(await p.locator('.account-avatar').first().textContent(),Array.from(name)[0]);}
 assert.equal(p.url(),h.url);assert.ok(await p.evaluate(()=>window.syncTestBody===document.body));if(h.kind==='site')assert.equal(await p.evaluate(()=>state.title),h.marker);else if(h.kind==='email')assert.equal(await p.locator('#subject').inputValue(),h.marker);else if(h.html!==null){assert.equal(await p.locator('#page-title').inputValue(),h.marker);assert.equal(await p.locator('#canvas').innerHTML(),h.html);}assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}};
 const profile=await remote.newPage();await profile.goto(base+'/profile/');await profile.locator('#settings:not([hidden])').waitFor();
 for(let i=0;i<2;i++){
 await profile.bringToFront();await context.setOffline(true);
 const name='Демо После восстановления '+width+' '+i;
 await profile.locator('[name=firstName]').fill('Демо');await profile.locator('[name=lastName]').fill('После восстановления '+width+' '+i);await profile.locator('#details-form button').click();await profile.getByText('Личные данные сохранены.',{exact:true}).waitFor();
 if(i===0){const png=await profile.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillStyle='#438469';c.getContext('2d').fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});await profile.locator('#avatar-file').setInputFiles({name:'demo-recovery.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await profile.locator('#avatar-crop[open]').waitFor();await profile.locator('#avatar-crop-save').click();await profile.getByText('Фотография обновлена.',{exact:true}).waitFor();}
 else{await profile.locator('#avatar-remove').click();await profile.getByText('Фотография удалена.',{exact:true}).waitFor();}
 const me=await(await remote.request.get(base+'/editor-api/me',{maxRetries:2})).json();
 // Keep the client offline past the server's 25s lease; changes must not arrive through an old stream.
 await new Promise(resolve=>setTimeout(resolve,27000));
 for(const h of hosts)assert.notEqual(await h.page.locator('.account-menu-meta strong').textContent(),name,'Offline client unexpectedly received the new identity');
 console.log('PASS offline isolation past stream lease',width,i);
 await context.setOffline(false);for(const h of hosts)await h.page.bringToFront();await verify(name,me.avatarUrl);
 console.log('PASS reconnect and actual tab return:',hosts.length,'tools',width,i,'name/avatar recovered; body, URL and dirty documents unchanged');
 }
 await profile.close();for(const h of hosts)await h.page.close();
 }
 assert.deepEqual(errors,[]);
 }catch(e){primaryError=e;throw e;}finally{try{await context.close();await remote.close();assert.ok((await admin.request.delete(base+'/editor-api/users/'+user.id,{maxRetries:2,headers:origin,data:{confirmLogin:login}})).ok());}catch(e){if(!primaryError)throw e;console.error('QA cleanup failed: '+String(e.message).split('Call log:')[0]);}}
 console.log('PASS profile recovery after offline and tab return on desktop/phone; disposable user removed');
};
if(require.main===module){const {chromium}=require('../release/ui-check/node_modules/playwright');(async()=>{const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:9012';if(base.startsWith('https:'))assert.equal(base,'https://news.outmax-office.ru');const c=base.startsWith('https:')?JSON.parse(fs.readFileSync('release/.outmax-deploy-credentials.json','utf8')):{user:'wiki-demo',password:'wiki-local-demo-only'},b=await chromium.launch({channel:'msedge',headless:false});try{const a=await b.newContext();assert.ok([200,302].includes((await a.request.post(base+'/login',{maxRedirects:0,headers:{Origin:base},form:{login:c.user,password:c.password}})).status()));await module.exports(a,base);}finally{await b.close();}})().catch(e=>{console.error(String(e.message).split('Call log:')[0]);console.error(String(e.stack).split('\n').filter(l=>/^\s+at /.test(l)).join('\n'));process.exit(1)});}
