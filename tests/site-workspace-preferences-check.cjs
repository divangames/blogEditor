const assert=require('node:assert/strict');
const {reveal}=require('./studio-test-helpers.cjs');
module.exports=async(context,base,{capture=false}={})=>{
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await p.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));
 const ready=async()=>{await p.waitForFunction(()=>window.StudioShell&&window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state&&!document.body.classList.contains('site-starting'));await p.locator('#site-boot-status').waitFor({state:'detached'});};
 await p.goto(base+'/site-builder/hasl/');await ready();
 const before=await p.evaluate(()=>JSON.stringify(state));
 const select=async(id,value)=>{await reveal(p,'#'+id);await p.locator('#'+id).selectOption(value);};
 const fill=async(id,value)=>{await reveal(p,'#'+id);await p.locator('#'+id).fill(String(value));await p.locator('#'+id).blur();};
 const click=async(id)=>{await reveal(p,'#'+id);await p.locator('#'+id).click();};
 assert.ok(await p.locator('#phone-device optgroup').count()>=10);
 const presets=await p.locator('#phone-device option:not([value=custom])').evaluateAll(nodes=>nodes.map(n=>({id:n.value,label:n.textContent})));
 assert.equal(new Set(presets.map(p=>p.id)).size,presets.length);
 for(const id of ['iphone-18-pro-max','iphone-17','iphone-17-pro','iphone-air','iphone-16-pro','iphone-15-pro','430x932','galaxy-s26','galaxy-a55','pixel-10-pro-xl','pixel-9']){
  await select('phone-device',id);const size=await p.evaluate(()=>[phonePreview.width,phonePreview.height]);assert.deepEqual(await p.locator('#phone').evaluate(n=>[n.clientWidth,n.clientHeight]),size);
 }
 await select('desktop-resolution-select','1920x1080');await select('preview-zoom','75');await click('preview-orientation');
 await p.locator('[data-preview-mode=tablet]').click();await fill('preview-width',900);await fill('preview-height',1200);await select('preview-zoom','50');
 await select('phone-device','iphone-17-pro');await select('phone-zoom','125');await click('phone-orientation');
 const expected=await p.evaluate(()=>({desktop:{...desktopPreview},tablet:{...tabletPreview},phone:{...phonePreview},mode:document.querySelector('.preview-area').dataset.mode}));
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before,'viewport preferences do not edit the project');assert.equal(await p.evaluate(()=>SiteBuilder.isDirty()),false);
 await p.reload();await ready();assert.deepEqual(await p.evaluate(()=>({desktop:{...desktopPreview},tablet:{...tabletPreview},phone:{...phonePreview},mode:document.querySelector('.preview-area').dataset.mode})),expected);
 assert.equal(await p.locator('[data-preview-mode=tablet]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#phone-device').inputValue(),'iphone-17-pro');assert.equal(await p.locator('#phone-zoom').inputValue(),'125');assert.equal(await p.locator('#preview-zoom').inputValue(),'50');
 if(capture){await reveal(p,'#phone-device');await p.screenshot({path:'instructions/screens/site-screen-saved-desktop.png'});await p.setViewportSize({width:390,height:844});await reveal(p,'#phone-device');await p.locator('#phone-device').scrollIntoViewIfNeeded();await p.screenshot({path:'instructions/screens/site-screen-saved-phone.png'});await p.setViewportSize({width:1440,height:1000});}
 await select('phone-device','custom');await fill('phone-width',412);await fill('phone-height',915);await p.locator('[data-preview-mode=phone]').click();await p.reload();await ready();assert.deepEqual(await p.evaluate(()=>[phonePreview.device,phonePreview.width,phonePreview.height]),['custom',412,915]);assert.deepEqual(await p.evaluate(()=>[ObjectStudio.bridge.frame.id,ObjectStudio.bridge.device]),['phone','phone'],'restored view edits the matching device');
 // A different account context on the same origin must not read this account's view.
 const account=await p.locator('meta[name=editor-account-context]').getAttribute('content');
 const isolated=await context.newPage();await isolated.route('**/*',r=>{if(new URL(r.request().url()).origin!==base)return r.abort();const headers=r.request().headers();if(headers['x-editor-account']==='qa-another-account')headers['x-editor-account']=account;return r.continue({headers});});await isolated.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:[],missing:[],total:0}}));await isolated.route('**/site-builder/hasl/',async r=>{const response=await r.fetch(),html=(await response.text()).replace(/(<meta name="editor-account-context" content=")[^"]+/, '$1qa-another-account');await r.fulfill({response,body:html});});await isolated.goto(base+'/site-builder/hasl/');await isolated.waitForFunction(()=>window.SiteBuilder&&state);assert.deepEqual(await isolated.evaluate(()=>[desktopPreview.width,desktopPreview.height,phonePreview.device]),[1440,900,'430x932']);await isolated.close();
 await p.evaluate(()=>localStorage.setItem(previewPreferenceKey(),'{broken'));await p.reload();await ready();assert.deepEqual(await p.evaluate(()=>[desktopPreview.width,phonePreview.width]),[1440,430]);
 await p.evaluate(()=>localStorage.setItem(previewPreferenceKey(),JSON.stringify({version:1,mode:'invalid',desktop:{width:-20,height:999999,zoom:'0'},phone:{device:'<script>',width:1,height:2,zoom:'999'}})));await p.reload();await ready();assert.deepEqual(await p.evaluate(()=>[desktopPreview.width,desktopPreview.height,desktopPreview.zoom,phonePreview.device]),[1440,900,'100','430x932']);
 await p.evaluate(()=>localStorage.removeItem(previewPreferenceKey()));await p.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Disabled','SecurityError');};Storage.prototype.getItem=()=>{throw new DOMException('Disabled','SecurityError');};});await p.reload();await ready();await select('phone-device','pixel-10');assert.equal(await p.locator('#phone').evaluate(n=>n.clientWidth),360);
 assert.deepEqual(errors,[]);await p.close();console.log('PASS workspace preferences: grouped modern phones, independent profiles, rotation, zoom, reload, custom sizes, account isolation, corrupt/blocked storage, no document edits');
};
if(require.main===module)(async()=>{const {chromium}=require('../release/ui-check/node_modules/playwright'),b=await chromium.launch({channel:'msedge',headless:true});try{const c=await b.newContext({viewport:{width:1440,height:1000}}),base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8917';await c.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});await module.exports(c,base);}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
