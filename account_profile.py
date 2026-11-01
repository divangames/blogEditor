"""Self-service profile over the existing account database and account context."""
import base64
import hashlib
import io
import json
import os
import re
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path

import requests
from flask import Response, g, jsonify, request, send_file, session
from werkzeug.security import check_password_hash
from PIL import Image, ImageOps, UnidentifiedImageError

# Embedded by the deployment builder; the source server reads the same resources.
ACCOUNT_WINDOW_ASSETS = {}
ACCOUNT_WINDOW_BOOTSTRAP = r'''
window.__ACCOUNT_WINDOW__=true;window.__EDITOR_SERVER_FIRST__=true;window.__EDITOR_API_PREFIX__='/editor-api';
window.$=selector=>document.querySelector(selector);
window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.ACTIVE_EDITOR={key:new URLSearchParams(location.search).get('brand')==='hasl'?'hasl':'outmax',name:'OUTMAX / ХАСЛ'};
(()=>{
 let sequence=0;const pending=new Map();
 const send=(type,data={})=>parent.postMessage({type:'account-window-'+type,...data},location.origin);
 const ask=(action,data={})=>new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('Не удалось связаться с рабочей областью. Закройте окно и повторите.'));},15000);pending.set(id,{resolve,reject,timer});send('request',{id,action,...data});});
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='account-window-result')return;const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);clearTimeout(p.timer);event.data.error?p.reject(Error(event.data.error)):p.resolve();});
 window.AccountWindow={prepare:()=>ask('prepare'),navigate:async(url,prepared=false)=>{if(!prepared)await ask('prepare');send('navigate',{url});},changed:()=>send('changed')};
 window.WorkspaceDeletion={forget:(owner,tool,id)=>ask('forget',{owner,tool,documentId:id})};
 window.listDrafts=async()=>AccountWindow.changed();
 window.createNewArticle=()=>AccountWindow.navigate((ACTIVE_EDITOR.key==='hasl'?'/hasl/':'/articles/')+'?resume=1&accountCreate=1').then(()=>false);
 window.toast=(text,error=false)=>{let status=document.getElementById('account-window-status');if(!status){status=document.createElement('p');status.id='account-window-status';status.setAttribute('role','status');document.body.append(status);}status.textContent=text;status.dataset.error=String(error);};
 new MutationObserver(()=>{if(document.querySelector('dialog[open]'))send('opened');}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('close',()=>queueMicrotask(()=>{if(!document.querySelector('dialog[open]'))send('close');}),true);
 addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))send('close');});
 send('ready');
})();
'''


def account_window_html(core):
    def asset(name):
        return ACCOUNT_WINDOW_ASSETS.get(name) or (core.ROOT/name).read_text(encoding='utf-8')
    css='\n'.join(asset(name) for name in ('editor.css','ui-chrome.css'))
    css+='''html,body{background:transparent!important;overflow:hidden;height:100%;font:14px/1.5 "Open Sans",Arial,sans-serif}body>aside,body>main{display:none}#account-window-native{display:none!important}.account-dialog,.about-editor-dialog,#impersonation-dialog,.feedback-inbox-dialog{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:100%;max-height:100%;border:0;border-radius:0;box-shadow:none}.account-dialog::backdrop,.about-editor-dialog::backdrop,#impersonation-dialog::backdrop,.feedback-inbox-dialog::backdrop{background:transparent}.account-dialog-body{max-height:calc(100dvh - 130px)}#account-window-status{position:fixed;z-index:2147483647;bottom:14px;left:14px;right:14px;padding:12px 16px;border:1px solid #dfe3e8;border-radius:8px;background:white;color:#303949;box-shadow:0 4px 20px #17202b22}#account-window-status[data-error=true]{color:#a72428}.feedback-inbox-content{max-height:calc(100dvh - 130px);overflow:auto}.about-editor-content{overflow:auto;max-height:calc(100dvh - 120px)}'''
    buttons=''.join('<button id="'+name+'"></button>' for name in ('all-articles','team-articles','manage-users','about-editor','logout','remote-preview'))
    html='''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Окно пользователя</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap"><style>'''+css+'''</style></head><body><div id="account-window-native"><details id="account-menu"><summary id="account-name"></summary><nav class="account-dropdown"><div id="account-menu-meta"></div>'''+buttons+'''</nav></details><span id="status"></span></div><script>'''+ACCOUNT_WINDOW_BOOTSTRAP+'''</script><script>'''+asset('editor-account.js').replace('</script','<\\/script')+'''</script></body></html>'''
    return html

# Phosphor Regular user-circle, MIT; full notice retained in the delivered script.
PROFILE_ICON = '<svg width="20" height="20" aria-hidden="true" data-phosphor="user-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z"/></svg>'
PROFILE_ACCESS = '/*'+'MIT License\n\nCopyright (c) 2023 Phosphor Icons\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n'+'*/' + r'''
(()=>{
 if(window.__ACCOUNT_WINDOW__)return;
 let user,frame,dialog,opener,profileRequest=0;
 const profileSignal='outmax-profile-changed';
 const windowPositions=new WeakMap();let pendingPosition;
 const positionStyle=document.createElement('style');positionStyle.textContent='html.account-window-position-held{overflow-anchor:none!important}';document.head.append(positionStyle);
 const capturePosition=()=>({x:scrollX,y:scrollY,panes:[...document.body.querySelectorAll('*')].filter(n=>!n.closest('dialog,details')&&n.clientHeight&&(n.scrollHeight>n.clientHeight||n.scrollWidth>n.clientWidth)).map(n=>[n,n.scrollLeft,n.scrollTop])});
 const rememberPosition=event=>{if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;const action=event.target.closest?.('[data-account-action]');if(action&&action.dataset.accountAction!=='logout')pendingPosition={time:performance.now(),position:capturePosition()};};
 document.addEventListener('pointerdown',rememberPosition,true);document.addEventListener('keydown',rememberPosition,true);
 document.addEventListener('beforetoggle',event=>{
  const box=event.target;if(event.newState!=='open'||!box.matches?.('#site-template-archive,#email-projects-dialog,#email-share-dialog,#user-profile-dialog,#account-window-dialog,.account-dialog,.about-editor-dialog,#impersonation-dialog,.feedback-inbox-dialog')||document.querySelector('dialog[open]'))return;
  const position=pendingPosition&&performance.now()-pendingPosition.time<5000?pendingPosition.position:capturePosition();pendingPosition=null;windowPositions.set(box,position);
  document.documentElement.classList.add('account-window-position-held');
 },true);
 document.addEventListener('close',event=>{
  const position=windowPositions.get(event.target);if(!position)return;windowPositions.delete(event.target);
  const restore=()=>{if(window.__WORKSPACE_LEAVING__)return;position.panes.forEach(([n,x,y])=>{if(n.isConnected)n.scrollTo(x,y);});scrollTo(position.x,position.y);};
  restore();queueMicrotask(restore);requestAnimationFrame(()=>{restore();document.documentElement.classList.remove('account-window-position-held');});
 },true);
 let presenceTimer,lastPing=0,presencePending;
 const pingPresence=()=>{if(!user||user.impersonation||document.visibilityState==='hidden'||presencePending||Date.now()-lastPing<20000)return Promise.resolve();lastPing=Date.now();presencePending=fetch('/editor-api/presence',{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{}).finally(()=>{presencePending=null;});return presencePending;};
 window.AccountPresence={ping:pingPresence};
 const startPresence=()=>{if(presenceTimer)return;pingPresence();presenceTimer=setInterval(pingPresence,25000);addEventListener('focus',pingPresence);document.addEventListener('visibilitychange',pingPresence);};
 const applyMenuAccess=data=>{const allowed=Boolean(data.admin||data.role==='admin'||data.emailAccess);document.querySelectorAll('.editor-switcher-menu a').forEach(link=>{const target=link.dataset.href||link.getAttribute('href');if(!link.hasAttribute('data-email-editor')&&(!target||!['/email/','/OUTMAX.html'].includes(new URL(target,location.origin).pathname)))return;if(!link.dataset.href&&target)link.dataset.href=target;const hint=link.querySelector('small'),text=allowed?'HTML-письма для OUTMAX и ХАСЛ':'Доступ выдаёт администратор';if(hint&&hint.textContent!==text)hint.textContent=text;if(allowed){link.removeAttribute('aria-disabled');if(link.dataset.href&&link.getAttribute('href')!==link.dataset.href)link.setAttribute('href',link.dataset.href);if(link.title==='Доступ выдаёт администратор')link.removeAttribute('title');}else{link.removeAttribute('href');link.removeAttribute('target');if(link.getAttribute('aria-disabled')!=='true')link.setAttribute('aria-disabled','true');if(link.title!=='Доступ выдаёт администратор')link.title='Доступ выдаёт администратор';}});};
 document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.editor-switcher-menu').forEach(menu=>new MutationObserver(()=>{if(user)applyMenuAccess(user);}).observe(menu,{childList:true,subtree:true}));if(user)applyMenuAccess(user);},{once:true});
 const accountMenuIcons={"user-circle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z\"/></svg>", "folder-simple": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,72H130.67L102.93,51.2a16.12,16.12,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm0,128H40V64H93.33L123.2,86.4A8,8,0,0,0,128,88h88Z\"/></svg>", "users": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z\"/></svg>", "eye": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z\"/></svg>", "info": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z\"/></svg>", "chat-circle-text": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M168,112a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,112Zm-8,24H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm72-8A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.81,172.06a8,8,0,0,1,.66,6.54L40,216,77.4,203.53a7.85,7.85,0,0,1,2.53-.42,8,8,0,0,1,4,1.08A88,88,0,0,0,216,128Z\"/></svg>", "sign-out": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z\"/></svg>", "pencil-simple": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z\"/></svg>"};
 const menuStates=new WeakMap();
 function syncMenus(data){
  const canManage=Boolean(data.admin||data.role==='admin'||data.role==='moderator'),canView=Boolean(data.admin||data.role==='admin')&&!data.impersonation;
  document.querySelectorAll('.account-menu>.account-dropdown').forEach(dropdown=>{
   let state=menuStates.get(dropdown);if(!state){state={fallback:new Map(),holder:document.createElement('div'),first:document.createElement('div'),last:document.createElement('div')};state.holder.hidden=true;state.holder.dataset.nativeAccountActions='';state.first.className=state.last.className='menu-divider';menuStates.set(dropdown,state);const parent=dropdown.closest('details');parent.addEventListener('toggle',()=>{if(parent.open)dropdown.style.setProperty('--account-menu-top',Math.max(8,parent.querySelector('summary').getBoundingClientRect().bottom+5)+'px');});}
   const pick=(key,selector,label,icon,href,allowed=true)=>{let n=dropdown.querySelector(selector)||state.fallback.get(key);if(!n){n=document.createElement('a');n.href=href;}if(n.tagName==='A'&&!['profile','logout'].includes(key)){const button=document.createElement('button');button.type='button';if(n.id)button.id=n.id;n.replaceWith(button);n=button;}state.fallback.set(key,n);n.hidden=!allowed;n.dataset.accountAction=key;if(n.tagName==='A'){n.removeAttribute('target');n.removeAttribute('rel');}if(n.dataset.unifiedLabel!==label||!n.querySelector('[data-unified-icon]')){const badge=n.querySelector('.feedback-badge'),labelNode=n.querySelector('[data-feedback-label]')||document.createElement('span'),mark=document.createElement('span');mark.className='profile-menu-icon';mark.setAttribute('aria-hidden','true');mark.innerHTML=accountMenuIcons[icon];mark.firstElementChild.dataset.unifiedIcon=icon;labelNode.textContent=label;n.replaceChildren(mark,labelNode,...(badge?[badge]:[]));n.dataset.unifiedLabel=label;n.style.cssText='';}n.classList.add('unified-menu-action');return n;};
   const profile=pick('profile','[data-user-profile]','Редактировать профиль','pencil-simple','/profile/');state.fallback.set('profile',profile);profile.classList.remove('unified-menu-action');profile.classList.add('account-profile-edit');profile.setAttribute('aria-label','Редактировать профиль');profile.title='Редактировать профиль';profile.querySelector('span:last-child').hidden=true;
   let meta=dropdown.querySelector('.account-menu-meta');if(!meta){meta=document.createElement('div');meta.className='account-menu-meta';}let identity=meta.querySelector('[data-account-identity]');if(!identity){identity=document.createElement('div');identity.dataset.accountIdentity='';identity.innerHTML='<strong></strong><span></span>';}const role={admin:'Администратор',moderator:'Модератор',editor:'Редактор'}[data.role]||'Редактор';if(identity.children[0].textContent!==(data.name||data.login))identity.children[0].textContent=data.name||data.login;if(identity.children[1].textContent!==role)identity.children[1].textContent=role;if(meta.children.length!==2||meta.children[0]!==identity||meta.children[1]!==profile)meta.replaceChildren(identity,profile);
   const desired=[meta,state.first,pick('articles','#all-articles,a[href="/articles/?view=articles"],[data-profile-location="/articles/?view=articles"]','Все статьи','folder-simple','/articles/?view=articles'),pick('archives','#team-articles','Архивы пользователей','users','/articles/?view=archives',canManage),pick('impersonation','#view-user-account','Войти как пользователь','eye','/articles/?view=impersonation',canView),pick('users','#manage-users,#email-account-users,#wiki-users','Пользователи','users','/articles/?view=users',canManage),pick('about','#about-editor,#email-account-about','О редакторе','info',location.pathname==='/'?'/instructions/?from=home#developers':'/instructions/#developers'),pick('feedback','#feedback-inbox-open,#site-feedback','Обратная связь','chat-circle-text','/articles/?view=feedback'),state.last,pick('logout','#logout,#email-account-logout,#studio-logout,#wiki-logout,#home-account-logout','Выйти','sign-out','/login'),state.holder];
   for(const n of [...dropdown.children])if(!desired.includes(n))state.holder.append(n);
   if(desired.some((n,i)=>dropdown.children[i]!==n)||dropdown.children.length!==desired.length)dropdown.replaceChildren(...desired);
   dropdown.classList.add('unified-user-menu');
  });
 }
 const menuStyle=document.createElement('style');menuStyle.textContent='.account-menu>.unified-user-menu{width:250px!important;min-width:250px!important;max-width:calc(100vw - 24px)!important;padding:6px!important;border:1px solid #e0e3e8!important;border-radius:10px!important;background:#fff!important;color:#333b49!important;box-shadow:0 12px 34px #17202b24!important}.account-menu>.unified-user-menu>.unified-menu-action{box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:9px 10px!important;border:0!important;border-radius:5px;background:transparent!important;color:inherit!important;font:12px/1.5 "Open Sans",Arial,sans-serif!important;text-align:left;text-decoration:none;cursor:pointer}.account-menu>.unified-user-menu>.unified-menu-action .profile-menu-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;color:#7b8393}.account-menu>.unified-user-menu>.unified-menu-action .profile-menu-icon svg{display:block;width:16px;height:16px;fill:currentColor}.account-menu>.unified-user-menu>.account-menu-meta{border:0!important;display:grid;gap:3px;padding:10px}.account-menu>.unified-user-menu>.account-menu-meta strong{font-size:12px;font-weight:600}.account-menu>.unified-user-menu>.account-menu-meta span{font-size:11px;color:#737e90}.account-menu>.unified-user-menu>.menu-divider{height:1px;margin:5px 2px;background:#e0e3e8}.account-menu>.unified-user-menu>[hidden]{display:none!important}@media(hover:hover){.account-menu>.unified-user-menu>.unified-menu-action:hover{background:#f1f3f6!important}}@media(max-width:600px),(pointer:coarse){.account-menu>.unified-user-menu>.unified-menu-action{min-height:44px}}@media(max-width:600px){.account-menu>.unified-user-menu{position:fixed!important;left:auto!important;right:12px!important;top:var(--account-menu-top,68px)!important;max-height:calc(100dvh - var(--account-menu-top,68px) - 12px);overflow-y:auto}}';document.head.append(menuStyle);

 const profileEditStyle=document.createElement('style');profileEditStyle.textContent='.account-menu>.unified-user-menu>.account-menu-meta{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.account-menu-meta>[data-account-identity]{display:grid;gap:3px;min-width:0}.account-menu-meta>[data-account-identity] strong{overflow-wrap:break-word}.account-menu-meta>.account-profile-edit{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;min-height:32px!important;padding:0!important;border:0;border-radius:6px;color:#7b8393;background:transparent;text-decoration:none}.account-profile-edit .profile-menu-icon,.account-profile-edit svg{display:block;width:16px;height:16px}.account-profile-edit [hidden]{display:none!important}.account-profile-edit:hover{background:#f1f3f6;color:#333b49}.account-profile-edit:focus-visible{outline:2px solid #616c80;outline-offset:2px}@media(max-width:600px),(pointer:coarse){.account-menu-meta>.account-profile-edit{width:44px;height:44px;min-height:44px!important}}';document.head.append(profileEditStyle);
 let accountDialog,accountFrame,accountOpener,accountLoadTimer;
 const accountTitles={articles:'Все статьи',archives:'Архивы пользователей',impersonation:'Войти как пользователь',users:'Пользователи',about:'О редакторе',feedback:'Обратная связь'};
 const accountSurfaceStyle=document.createElement('style');accountSurfaceStyle.textContent='#account-window-dialog{box-sizing:border-box;width:min(980px,calc(100vw - 24px));height:min(960px,calc(100dvh - 24px));max-width:none;max-height:none;margin:auto;padding:0;border:1px solid #e0e3e8;border-radius:14px;overflow:hidden;background:white;color:#303949;box-shadow:0 24px 80px #10152233}#account-window-dialog::backdrop{background:#10152266}#account-window-dialog>iframe{display:block;width:100%;height:100%;border:0}#account-window-dialog>[data-window-status]{position:absolute;left:24px;right:80px;top:24px;z-index:2;background:white;font:14px/1.5 "Open Sans",Arial,sans-serif}#account-window-dialog>[data-window-close]{position:absolute;right:14px;top:14px;z-index:3;width:44px;height:44px;border:1px solid #dfe3e8;border-radius:8px;background:white;color:#647084;font-size:24px;cursor:pointer}#account-window-dialog>[hidden]{display:none!important}';document.head.append(accountSurfaceStyle);
 async function prepareAccountNavigation(){if(window.WorkspaceAdapter?.leave)await window.WorkspaceAdapter.leave();}
 function accountNavigate(value){const url=new URL(value,location.origin);if(url.origin!==location.origin||!['/','/articles/','/hasl/','/tiptap/','/instructions/'].includes(url.pathname))throw Error('Недопустимый переход');window.__WORKSPACE_LEAVING__=true;location.assign(url.href);}
 function showAccountWindow(action,button){
  if(accountDialog?.open)return;
  accountOpener=button.closest('details')?.querySelector('summary')||button;
  button.closest('details')?.removeAttribute('open');
  const scroll=[scrollX,scrollY],box=document.createElement('dialog');accountDialog=box;box.id='account-window-dialog';box.dataset.action=action;box.setAttribute('aria-label',accountTitles[action]);
  const status=document.createElement('p');status.dataset.windowStatus='';status.setAttribute('role','status');status.textContent='Загружаем…';
  const close=document.createElement('button');close.dataset.windowClose='';close.type='button';close.setAttribute('aria-label','Закрыть');close.textContent='×';close.onclick=()=>box.close();
  const child=document.createElement('iframe');accountFrame=child;child.title=accountTitles[action];child.src='/account-window/?view='+action+'&brand='+(location.pathname.startsWith('/hasl')?'hasl':'outmax');
  child.onload=()=>{try{if(child.contentWindow.location.pathname!=='/account-window/'){child.hidden=true;status.hidden=false;status.textContent='Сеанс завершён или окно недоступно. Закройте окно и войдите снова.';close.hidden=false;}}catch{status.textContent='Не удалось загрузить окно. Закройте его и повторите.';}};
  box.append(status,close,child);box.addEventListener('close',()=>{clearTimeout(accountLoadTimer);child.remove();box.remove();if(accountDialog===box){accountDialog=accountFrame=null;}scrollTo(...scroll);accountOpener?.focus({preventScroll:true});});document.body.append(box);box.showModal();
  accountLoadTimer=setTimeout(()=>{if(box.isConnected&&!status.hidden)status.textContent='Окно загружается дольше обычного. Можно закрыть его и повторить.';},15000);
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-account-action]');if(!button||!button.closest('.unified-user-menu'))return;
  const action=button.dataset.accountAction;if(!Object.hasOwn(accountTitles,action))return;
  const articleHost=['/articles/','/hasl/'].includes(location.pathname),nativeLocal=articleHost&&['all-articles','team-articles','manage-users','view-user-account','about-editor','feedback-inbox-open'].includes(button.id)||['/email/','/OUTMAX.html'].includes(location.pathname)&&['about','feedback'].includes(action)||location.pathname.startsWith('/site-builder/')&&action==='feedback';
  if(nativeLocal)return;event.preventDefault();event.stopImmediatePropagation();
  if(!user||button.hidden||['archives','users'].includes(action)&&!(user.admin||user.role==='moderator')||action==='impersonation'&&(!user.admin||user.impersonation))return;
  showAccountWindow(action,button);
 },true);
 addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==accountFrame?.contentWindow||!accountDialog?.open)return;
  const data=event.data;if(!data||typeof data.type!=='string')return;
  if(data.type==='account-window-opened'){clearTimeout(accountLoadTimer);accountDialog.querySelector('[data-window-status]').hidden=true;accountDialog.querySelector('[data-window-close]').hidden=true;}
  else if(data.type==='account-window-close')accountDialog.close();
  else if(data.type==='account-window-changed')window.dispatchEvent(new Event('account-materials-changed'));
  else if(data.type==='account-window-navigate'){try{accountNavigate(data.url);}catch(error){accountDialog.querySelector('[data-window-status]').textContent=error.message;accountDialog.querySelector('[data-window-status]').hidden=false;}}
  else if(data.type==='account-window-request'){
   const source=event.source;let error;
   try{if(data.action==='prepare')await prepareAccountNavigation();else if(data.action==='forget'){if(!/^[A-Za-z0-9_-]{1,100}$/.test(data.owner)||data.tool&&!['outmax','hasl','email','site'].includes(data.tool))throw Error('Некорректный материал');await window.WorkspaceDeletion?.forget(data.owner,data.tool,data.documentId);window.dispatchEvent(new Event('account-materials-changed'));}else throw Error('Неизвестное действие');}catch(reason){error=reason.message;}
   source.postMessage({type:'account-window-result',id:data.id,error},location.origin);
  }
 });
 const paint=data=>{user=data;applyMenuAccess(data);syncMenus(data);document.querySelectorAll('.account-avatar').forEach(n=>{if(data.avatarUrl&&n.querySelector('img')?.getAttribute('src')===data.avatarUrl)return;if(!data.avatarUrl&&n.textContent===Array.from(data.name||'?')[0])return;n.replaceChildren();if(data.avatarUrl){const img=document.createElement('img');img.src=data.avatarUrl;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';n.append(img);}else n.textContent=Array.from(data.name||'?')[0];});document.querySelectorAll('.account-greeting strong,#studio-account-name').forEach(n=>{if(n.textContent!==data.name)n.textContent=data.name;});document.querySelectorAll('#account-name,#email-account-name').forEach(n=>n.title='Привет, '+data.name);const home=document.getElementById('profile');if(home&&home.textContent!=='Привет, '+data.name)home.textContent='Привет, '+data.name;if(window.__EDITOR_PROFILE__)window.__EDITOR_PROFILE__={...window.__EDITOR_PROFILE__,...data};};
 const open=event=>{event.preventDefault();opener=event.currentTarget;opener.closest('details')?.removeAttribute('open');if(!dialog){dialog=document.createElement('dialog');dialog.id='user-profile-dialog';dialog.setAttribute('aria-label','Мой профиль');dialog.style.cssText='box-sizing:border-box;width:min(840px,calc(100vw - 24px));height:min(900px,calc(100dvh - 24px));padding:0;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden;background:white';const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.style.cssText='position:absolute;right:16px;top:12px;z-index:2;min-height:36px;padding:6px 12px;border:1px solid #dfe3e8;border-radius:6px;background:white;color:#202329';close.onclick=()=>dialog.close();frame=document.createElement('iframe');frame.src='/profile/?embedded=1';frame.title='Настройки профиля';frame.style.cssText='width:100%;height:100%;border:0;display:block';dialog.append(close,frame);dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));document.body.append(dialog);}dialog.showModal();};
 const attach=()=>{const dropdown=document.querySelector('.account-dropdown');if(!dropdown)return false;if(!dropdown.querySelector('[data-user-profile]')){const a=document.createElement('a');a.href='/profile/';a.dataset.userProfile='';a.className='profile-menu-action';a.style.cssText='display:flex;align-items:center;gap:12px;min-height:44px;padding:10px 12px;color:inherit;text-decoration:none;font-size:13px';a.innerHTML='<span class="profile-menu-icon" aria-hidden="true" style="display:inline-flex;width:20px;height:20px;flex:none">'+PROFILE_ICON+'</span><span>Мой профиль</span>';a.addEventListener('click',open);dropdown.prepend(a);}const menu=dropdown.closest('.account-menu');if(menu&&!menu.dataset.profileObserved){menu.dataset.profileObserved='1';new MutationObserver(()=>{if(user)paint(user);}).observe(menu,{childList:true,subtree:true});}return true;};
 let profileEvents,profileEventsOwner;
 const stopProfileEvents=()=>{profileEvents?.abort();profileEvents=null;profileEventsOwner=null;};
 const startProfileEvents=()=>{
  if(!user?.id||profileEventsOwner===user.id)return;stopProfileEvents();
  const owner=user.id,controller=new AbortController();profileEvents=controller;profileEventsOwner=owner;
  const run=async()=>{while(!controller.signal.aborted){const subscription=crypto.randomUUID().replace(/-/g,'');let reader;
   const close=()=>fetch('/editor-api/users/events/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription}),keepalive:true}).catch(()=>{});
   controller.signal.addEventListener('abort',close,{once:true});
   try{const response=await fetch('/editor-api/profile/events',{signal:controller.signal,cache:'no-store',headers:{'X-Directory-Subscription':subscription}});
    if(!response.ok){if([401,403,409].includes(response.status))return;throw Error('Profile events unavailable');}
    reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',ended=false;
    while(!ended&&!controller.signal.aborted){const {value,done}=await reader.read();if(done||controller.signal.aborted)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let boundary;
     while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const type=/^event: ([a-z]+)$/m.exec(event)?.[1];
      if(type==='ready'||type==='profile'){refreshProfile();try{localStorage.setItem(profileSignal,crypto.randomUUID());}catch{}}
      if(type==='access'){stopProfileEvents();return;}if(type==='busy')ended=true;
     }
    }
   }catch{}finally{controller.signal.removeEventListener('abort',close);try{await reader?.cancel();}catch{}await close();}
   if(!controller.signal.aborted)await new Promise(resolve=>{const timer=setTimeout(done,350+Math.random()*250);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
  }};
  // One authenticated connection serves this user's tabs; only a refresh signal crosses tabs.
  if(navigator.locks)navigator.locks.request('outmax-profile-events:'+owner,{signal:controller.signal},run).catch(()=>{});else run();
 };
 let profileController;
 const refreshProfile=async()=>{const ticket=++profileRequest;profileController?.abort();const controller=new AbortController();profileController=controller;const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('/editor-api/me',{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!response.ok)return;const data=await response.json();if(ticket!==profileRequest)return;paint(data);startPresence();startProfileEvents();}catch{}finally{clearTimeout(timer);if(profileController===controller)profileController=null;}};
 addEventListener('workspace-home-profile',event=>{if(location.pathname!=='/'||!event.detail?.id)return;++profileRequest;profileController?.abort();paint(event.detail);startPresence();startProfileEvents();});
 addEventListener('online',refreshProfile);
 let profileEventsContext=document.querySelector('meta[name="editor-account-context"]')?.content;
 addEventListener('account-profile-context',event=>{if(typeof event.detail==='string'&&event.detail!==profileEventsContext){profileEventsContext=event.detail;stopProfileEvents();if(user)startProfileEvents();}});
 addEventListener('pagehide',stopProfileEvents);
 addEventListener('storage',event=>{if(event.key===profileSignal&&event.newValue)refreshProfile();});
 addEventListener('pageshow',event=>{if(event.persisted)refreshProfile();});
 addEventListener('focus',()=>{if(user)refreshProfile();});
 const start=()=>{refreshProfile();if(location.pathname==='/profile/')return;if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}};
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.type!=='user-profile-updated')return;++profileRequest;paint(event.data.user);window.dispatchEvent(new CustomEvent('account-profile-context',{detail:event.data.context}));});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();'''


def billing_authorization(core):
    """Use existing server credentials; none are returned to the browser."""
    token = os.getenv('YANDEX_CLOUD_IAM_TOKEN') or os.getenv('YC_IAM_TOKEN')
    if token:
        return 'Bearer ' + token
    oauth = os.getenv('YANDEX_CLOUD_OAUTH_TOKEN') or os.getenv('YC_OAUTH_TOKEN')
    key_path = os.getenv('YANDEX_CLOUD_KEY_FILE') or os.getenv('YC_SERVICE_ACCOUNT_KEY_FILE')
    key_file = Path(key_path) if key_path else core.ARTICLES / '_accounts' / 'yandex-cloud-key.json'
    if oauth or key_file.is_file():
        if oauth:
            payload = {'yandexPassportOauthToken': oauth}
        else:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            key = json.loads(key_file.read_text(encoding='utf-8'))
            enc = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=')
            now = int(time.time())
            header = enc(json.dumps({'alg':'PS256','kid':key['id']}).encode())
            claims = enc(json.dumps({'iss':key['service_account_id'],'aud':'https://iam.api.cloud.yandex.net/iam/v1/tokens','iat':now,'exp':now+600}).encode())
            message = header + b'.' + claims
            private_key = serialization.load_pem_private_key(key['private_key'].encode(),password=None)
            signature = private_key.sign(message,padding.PSS(mgf=padding.MGF1(hashes.SHA256()),salt_length=32),hashes.SHA256())
            payload = {'jwt':(message+b'.'+enc(signature)).decode()}
        response = requests.post('https://iam.api.cloud.yandex.net/iam/v1/tokens',json=payload,timeout=(5,15))
        if not response.ok:
            raise ValueError('Серверное подключение Яндекс Клауда не получило IAM-токен. Проверьте срок и права доступа.')
        token = response.json().get('iamToken')
        if not isinstance(token,str) or not token:
            raise ValueError('Яндекс Клауд не вернул IAM-токен.')
        return 'Bearer ' + token
    api_key = os.getenv('YANDEX_CLOUD_API_KEY') or os.getenv('YC_API_KEY') or os.getenv('WORDSTAT_API_KEY')
    if not api_key:
        # Existing Wordstat connection uses the account encryption key too.
        try:
            from cryptography.fernet import Fernet
            folder = core.ARTICLES / '_accounts'
            saved = json.loads((folder/'wordstat.json').read_text(encoding='utf-8'))
            api_key = Fernet((folder/'key').read_bytes()).decrypt(saved['key'].encode()).decode()
        except Exception:
            api_key = ''
    if api_key:
        return 'Api-Key ' + api_key
    raise ValueError('Серверное подключение Яндекс Клауда не найдено. Настройте IAM-доступ для чтения платёжного аккаунта.')


def billing_balance(core, account_id=''):
    headers = {'Authorization':billing_authorization(core)}
    root = 'https://billing.api.cloud.yandex.net/billing/v1/billingAccounts'
    response = requests.get(root+('/'+account_id if account_id else ''),headers=headers,timeout=(5,15))
    if response.status_code in (401,403):
        raise ValueError('Существующее подключение не имеет доступа к Billing API или токен истёк. Проверьте IAM-токен и роль billing.accounts.viewer для платёжного аккаунта.')
    if not response.ok:
        raise ValueError('Баланс Яндекс Клауда временно недоступен. Повторите обновление позже.')
    data = response.json()
    if not account_id:
        accounts = data.get('billingAccounts',[])
        if len(accounts)!=1 or data.get('nextPageToken'):
            return {'chooseAccount':True,'accounts':[{'id':x['id'],'name':x.get('name',x['id'])} for x in accounts]}
        data = accounts[0]
    balance = Decimal(str(data.get('balance','')))
    if not balance.is_finite():
        raise ValueError('Яндекс Клауд вернул некорректный баланс.')
    uid = str(data['id'])
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',uid):
        raise ValueError('Яндекс Клауд вернул некорректный аккаунт.')
    return {'balance':str(balance),'currency':data.get('currency',''),'accountId':uid,
            'name':data.get('name',''),'url':'https://billing.yandex.cloud/',
            'checkedAt':int(time.time())}


def install_profile(application, core, db, cipher, public_user, password_values, account_context):
    @application.get('/account-window/')
    def account_window():
        view=request.args.get('view')
        if view not in ('articles','archives','impersonation','users','about','feedback'):
            return jsonify(error='Неизвестное окно'),400
        user=g.editor_user
        if ((view in ('archives','users') and not (user['admin'] or user['role']=='moderator')) or
                (view=='impersonation' and (not user['admin'] or getattr(g,'impersonator',None) is not None))):
            return Response('<!doctype html><html lang="ru"><meta charset="utf-8"><p role="alert">Доступ к этому окну закрыт.</p></html>',status=403,mimetype='text/html')
        response=Response(account_window_html(core),mimetype='text/html')
        response.headers['Content-Security-Policy']="frame-ancestors 'self'; base-uri 'none'"
        response.headers['X-Frame-Options']='SAMEORIGIN'
        response.headers['Cache-Control']='no-store'
        return response

    folder = core.ARTICLES / '_accounts'

    def own_write():
        return getattr(g,'impersonator',None) is None

    @application.get('/profile/')
    def profile_page():
        response=Response(PROFILE_HTML,mimetype='text/html')
        response.headers['Content-Security-Policy']="frame-ancestors 'self'; base-uri 'none'"
        response.headers['X-Frame-Options']='SAMEORIGIN'
        return response

    @application.patch('/api/profile')
    def profile_update():
        if not own_write():return jsonify(error='Изменяйте профиль из собственного аккаунта.'),403
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or set(data)!={'firstName','lastName','telegram'} or not all(isinstance(x,str) for x in data.values()):return jsonify(error='Укажите имя, фамилию и Telegram.'),400
        first,last,tg=(data[k].strip() for k in ('firstName','lastName','telegram'))
        if not first or len(first)>50 or len(last)>50 or len(first+' '+last)>100 or any(ord(c)<32 for c in first+last):return jsonify(error='Укажите имя и фамилию длиной до 50 символов каждое.'),400
        tg=re.sub(r'^https://t\.me/','',tg).lstrip('@').rstrip('/')
        if tg and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{4,31}',tg):return jsonify(error='Telegram: укажите @username или https://t.me/username (5–32 символа).'),400
        with db() as connection:
            connection.execute('UPDATE users SET name=?,first_name=?,last_name=?,telegram=? WHERE id=?',(' '.join(x for x in (first,last) if x),first,last,tg,g.editor_user['id']))
            row=connection.execute('SELECT * FROM users WHERE id=?',(g.editor_user['id'],)).fetchone()
        return jsonify(user=public_user(row),context=account_context(row))

    @application.post('/api/profile/password')
    def profile_password():
        if not own_write():return jsonify(error='Смена пароля доступна только из собственного аккаунта.'),403
        data=request.get_json(silent=True) or {}
        current,new=data.get('currentPassword'),data.get('newPassword')
        if not isinstance(current,str) or not isinstance(new,str) or not 8<=len(new)<=200 or len(current)>200:return jsonify(error='Новый пароль должен содержать от 8 до 200 символов.'),400
        with db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            row=connection.execute('SELECT * FROM users WHERE id=?',(g.editor_user['id'],)).fetchone()
            if not row or row['version']!=g.editor_user['version']:return jsonify(error='Аккаунт изменился. Войдите заново.'),409
            if not check_password_hash(row['hash'],current):return jsonify(error='Текущий пароль указан неверно.'),400
            hashed,encrypted=password_values(new)
            connection.execute('UPDATE users SET hash=?,password=?,version=version+1 WHERE id=?',(hashed,encrypted,row['id']))
            row=connection.execute('SELECT * FROM users WHERE id=?',(row['id'],)).fetchone()
        session.update(uid=row['id'],version=row['version'])
        return jsonify(user=public_user(row),context=account_context(row))

    @application.route('/api/profile/avatar',methods=['POST','DELETE'])
    def profile_avatar():
        if not own_write():return jsonify(error='Изменяйте аватар из собственного аккаунта.'),403
        uid=g.editor_user['id'];digest=''
        if request.method=='POST':
            if not request.content_length or request.content_length>5*1024*1024+16384:return jsonify(error='Загрузите PNG, JPEG или WebP размером до 5 МБ.'),413
            photo=request.files.get('avatar')
            if not photo:return jsonify(error='Выберите фотографию.'),400
            raw=photo.read(5*1024*1024+1)
            if len(raw)>5*1024*1024:return jsonify(error='Фотография больше 5 МБ.'),413
            try:
                image=Image.open(io.BytesIO(raw))
                if image.format not in ('PNG','JPEG','WEBP') or image.width*image.height>16_000_000:raise ValueError()
                image=ImageOps.exif_transpose(image).convert('RGBA')
                size=min(512,image.width,image.height);image=ImageOps.fit(image,(size,size),method=Image.Resampling.LANCZOS);image.info.clear()
                output=io.BytesIO();image.save(output,format='PNG');encoded=output.getvalue()
            except (UnidentifiedImageError,ValueError,OSError,Image.DecompressionBombError):return jsonify(error='Не удалось прочитать фото. Используйте PNG, JPEG или WebP до 16 мегапикселей.'),400
            digest=hashlib.sha256(encoded).hexdigest();avatars=folder/'avatars';avatars.mkdir(exist_ok=True)
            target=avatars/(uid+'-'+digest+'.png')
            if not target.exists():target.write_bytes(encoded)
        with db() as connection:
            connection.execute('UPDATE users SET avatar=? WHERE id=?',(digest,uid))
            row=connection.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        return jsonify(user=public_user(row),context=account_context(row))

    @application.get('/api/profile/avatar/<uid>/<digest>.png')
    def profile_avatar_image(uid,digest):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',uid) or not re.fullmatch(r'[a-f0-9]{64}',digest):return '',404
        target=folder/'avatars'/(uid+'-'+digest+'.png')
        if not target.is_file():return '',404
        response=send_file(target,mimetype='image/png');response.headers['X-Content-Type-Options']='nosniff';return response

    @application.get('/api/profile/cloud-balance')
    def profile_cloud_balance():
        if not g.editor_user['admin'] or not own_write():return jsonify(error='Баланс доступен только администратору.'),403
        account_id=request.args.get('accountId') or os.getenv('YANDEX_CLOUD_BILLING_ACCOUNT_ID') or os.getenv('YC_BILLING_ACCOUNT_ID') or ''
        if account_id and not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',account_id):return jsonify(error='Некорректный ID платёжного аккаунта.'),400
        try:return jsonify(billing_balance(core,account_id))
        except ValueError as error:return jsonify(error=str(error),url='https://billing.yandex.cloud/'),503
        except (requests.RequestException,KeyError,TypeError,InvalidOperation,OSError):return jsonify(error='Не удалось получить баланс Яндекс Клауда. Проверьте подключение и повторите.',url='https://billing.yandex.cloud/'),503


PROFILE_HTML = r'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Мой профиль — OUTMAX / ХАСЛ</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f6f8;color:#242428;font:14px/1.5 "Open Sans",Arial,sans-serif}main{max-width:780px;margin:auto;padding:32px 24px}h1{font-size:28px;margin:12px 0 6px}h2{font-size:18px;margin:0 0 18px}p{color:#62626a}a{color:#2457ad}section{padding:24px;margin-top:20px;border:1px solid #e0e1e6;border-radius:12px;background:white}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:grid;gap:6px;margin-bottom:16px}input,select,button{font:inherit}input,select{width:100%;min-height:44px;padding:10px 12px;border:1px solid #cfd3da;border-radius:6px;background:white;color:inherit}button{min-height:44px;padding:10px 16px;border:1px solid #cfd3da;border-radius:6px;background:white;color:inherit;cursor:pointer}button.primary{background:#26262c;color:white;border-color:#26262c}button:disabled{opacity:.6;cursor:wait}:focus-visible{outline:3px solid #336be0;outline-offset:3px}.avatar-row{display:flex;align-items:center;gap:20px}.avatar-preview{width:88px;height:88px;flex:none;border-radius:50%;background:#eceef2;display:grid;place-items:center;font-size:30px;overflow:hidden}.avatar-preview img{width:100%;height:100%;object-fit:cover}.actions{display:flex;gap:10px;flex-wrap:wrap}.status{min-height:24px;margin:12px 0 0;white-space:pre-wrap}.status.error{color:#b02029}small{font-size:12px;color:#62626a}.balance{font-size:28px;font-weight:600;margin:12px 0}.cloud-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}[hidden]{display:none!important}.avatar-row input{max-width:100%}@media(max-width:600px){main{padding:24px 16px}.fields{grid-template-columns:1fr;gap:0}section{padding:20px}.avatar-row{align-items:flex-start;flex-direction:column}input{font-size:16px}h1{font-size:25px}}
#avatar-crop{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:24px;border:1px solid #dfe3e8;border-radius:12px;color:inherit;overflow:auto}#avatar-crop::backdrop{background:#20252e70}#avatar-crop header{display:flex;justify-content:space-between;align-items:center;gap:16px}#avatar-crop h2{margin:0}#avatar-crop header button{width:40px;min-height:40px;padding:8px}#avatar-crop .crop-stage{display:grid;place-items:center;padding:12px;background:#f0f1f4;border-radius:10px;margin:16px 0}#avatar-crop canvas{display:block;width:min(100%,320px);height:auto;touch-action:none;cursor:grab;background:repeating-conic-gradient(#dfe2e7 0% 25%,#f5f6f8 0% 50%) 0/16px 16px}#avatar-crop canvas:active{cursor:grabbing}#avatar-crop fieldset{border:0;padding:0;margin:0 0 16px}#avatar-crop legend{font-size:12px;color:#62626a;margin-bottom:8px}#avatar-crop .crop-shapes{display:flex;gap:8px}#avatar-crop [aria-pressed=true]{background:#eef2fa;border-color:#9baed1;color:#224d99}#avatar-crop input[type=range]{padding:0;min-height:32px}#avatar-crop .actions{justify-content:flex-end}#avatar-crop .crop-help{font-size:12px}#avatar-crop-status:empty{display:none}@media(max-width:600px){#avatar-crop{padding:18px}#avatar-crop .crop-stage{padding:8px}#avatar-crop .actions{gap:8px}#avatar-crop button{padding:8px 12px}}
</style></head><body><main><a id="back" href="/">← На главную</a><h1>Мой профиль</h1><p>Личные данные и безопасность аккаунта</p><p id="loading" role="status">Загружаем профиль…</p><div id="settings" hidden>
<section aria-labelledby="avatar-title"><h2 id="avatar-title">Фотография</h2><div class="avatar-row"><div id="avatar-preview" class="avatar-preview" aria-label="Аватар"></div><div><label>Выбрать фотографию<input id="avatar-file" type="file" accept="image/*"></label><small>Фото до 5 МБ и 16 Мп · квадрат или круг перед сохранением</small><div class="actions"><button id="avatar-upload">Выбрать фото</button><button id="avatar-remove">Удалить фото</button></div></div></div><p id="avatar-status" class="status" role="status"></p></section>
<section aria-labelledby="details-title"><h2 id="details-title">Личные данные</h2><form id="details-form"><div class="fields"><label>Имя<input name="firstName" required maxlength="50" autocomplete="given-name"></label><label>Фамилия<input name="lastName" maxlength="50" autocomplete="family-name"></label></div><label>Telegram<input name="telegram" maxlength="60" placeholder="@username или https://t.me/username" autocomplete="off"><small>Ссылка на ваш профиль. Подключение бота и отправка уведомлений не выполняются.</small></label><button class="primary">Сохранить данные</button><p id="details-status" class="status" role="status"></p></form></section>
<section aria-labelledby="password-title"><h2 id="password-title">Пароль</h2><form id="password-form"><label>Текущий пароль<input type="password" name="currentPassword" required maxlength="200" autocomplete="current-password"></label><div class="fields"><label>Новый пароль<input type="password" name="newPassword" required minlength="8" maxlength="200" autocomplete="new-password"></label><label>Повторите новый пароль<input type="password" name="confirmPassword" required minlength="8" maxlength="200" autocomplete="new-password"></label></div><button class="primary">Сменить пароль</button><p id="password-status" class="status" role="status"></p></form></section>
<section id="cloud" hidden aria-labelledby="cloud-title"><h2 id="cloud-title">Яндекс Клауд</h2><p>Баланс платёжного аккаунта из существующего серверного подключения.</p><p id="cloud-balance" class="balance">—</p><p id="cloud-status" class="status" role="status"></p><label id="cloud-account-label" hidden>Платёжный аккаунт<select id="cloud-account"></select></label><div class="cloud-actions"><button id="cloud-refresh">Обновить баланс</button><a id="cloud-link" href="https://billing.yandex.cloud/" target="_blank" rel="noopener noreferrer">Открыть Яндекс Клауд</a></div></section>
</div></main><dialog id="avatar-crop" aria-labelledby="avatar-crop-title"><header><h2 id="avatar-crop-title">Кадрировать фотографию</h2><button type="button" data-crop-close aria-label="Закрыть кадрирование">×</button></header><p class="crop-help">Перетащите фото, настройте масштаб. Стрелки на клавиатуре перемещают изображение.</p><div class="crop-stage"><canvas id="avatar-crop-canvas" width="512" height="512" tabindex="0" role="img" aria-label="Кадрирование фотографии. Стрелки перемещают изображение."></canvas></div><fieldset><legend>Форма аватара</legend><div class="crop-shapes"><button type="button" data-crop-shape="square" aria-pressed="false">Квадрат</button><button type="button" data-crop-shape="circle" aria-pressed="true">Круг</button></div></fieldset><label>Масштаб<input id="avatar-crop-zoom" type="range" min="1" max="4" step="0.01" value="1"></label><div class="actions"><button type="button" data-crop-reset>По центру</button><button type="button" data-crop-close>Отмена</button><button type="button" id="avatar-crop-save" class="primary">Сохранить фото</button></div><p id="avatar-crop-status" class="status" role="status"></p></dialog><script>
(()=>{'use strict';const $=s=>document.querySelector(s);let user;const embedded=new URLSearchParams(location.search).has('embedded');if(embedded)$('#back').hidden=true;
function status(id,text,error=false){const n=$(id);n.textContent=text;n.classList.toggle('error',error);}
async function api(path,options){const r=await fetch('/editor-api'+path,options);const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось выполнить действие.');return data;}
const json=(data,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function paint(data){user=data;$('#avatar-preview').replaceChildren();if(data.avatarUrl){const img=document.createElement('img');img.src=data.avatarUrl;img.alt='';$('#avatar-preview').append(img);}else $('#avatar-preview').textContent=Array.from(data.name||'?')[0];$('#avatar-remove').disabled=!data.avatarUrl;}
function saved(data){paint(data.user);window.dispatchEvent(new CustomEvent('account-profile-context',{detail:data.context}));if(embedded){try{if(parent.location.origin===location.origin)parent.dispatchEvent(new parent.CustomEvent('account-profile-context',{detail:data.context}));}catch{}}try{localStorage.setItem('outmax-profile-changed',crypto.randomUUID());}catch{}if(embedded)parent.postMessage({type:'user-profile-updated',user:data.user,context:data.context},location.origin);}
async function action(button,id,fn,message){button.disabled=true;status(id,'Сохраняем…');try{const data=await fn();saved(data);status(id,message);}catch(e){status(id,e.message,true);}finally{button.disabled=false;}}
$('#details-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;action(f.querySelector('button'),'#details-status',()=>api('/profile',json(Object.fromEntries(new FormData(f)),'PATCH')),'Личные данные сохранены.');};
$('#password-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;if(f.elements.newPassword.value!==f.elements.confirmPassword.value){status('#password-status','Новые пароли не совпадают.',true);return;}action(f.querySelector('button'),'#password-status',async()=>{const data=await api('/profile/password',json({currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value}));f.reset();return data;},'Пароль изменён. Старые сеансы на других устройствах завершены.');};
const crop=$('#avatar-crop'),cropCanvas=$('#avatar-crop-canvas'),cropContext=cropCanvas.getContext('2d'),zoom=$('#avatar-crop-zoom');
let cropImage,cropURL,cropTicket=0,cropSaving=false,panX=0,panY=0,shape='circle',drag;
function drawCrop(){if(!cropImage)return;const scale=Math.max(512/cropImage.naturalWidth,512/cropImage.naturalHeight)*Number(zoom.value),w=cropImage.naturalWidth*scale,h=cropImage.naturalHeight*scale;panX=Math.max(-(w-512)/2,Math.min((w-512)/2,panX));panY=Math.max(-(h-512)/2,Math.min((h-512)/2,panY));cropContext.clearRect(0,0,512,512);cropContext.save();if(shape==='circle'){cropContext.beginPath();cropContext.arc(256,256,256,0,Math.PI*2);cropContext.clip();}cropContext.drawImage(cropImage,(512-w)/2+panX,(512-h)/2+panY,w,h);cropContext.restore();cropCanvas.style.borderRadius=shape==='circle'?'50%':'8px';crop.querySelectorAll('[data-crop-shape]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cropShape===shape)));}
function clearCrop(){cropTicket++;cropImage=null;drag=null;if(cropURL)URL.revokeObjectURL(cropURL);cropURL=null;$('#avatar-file').value='';}
async function openCrop(file){if(!file||cropSaving)return;clearCrop();const ticket=cropTicket;status('#avatar-status','');try{if(file.size>5*1024*1024)throw Error('Фотография больше 5 МБ.');if(file.type==='image/svg+xml')throw Error('Выберите растровую фотографию: PNG, JPEG, WebP или другой поддерживаемый браузером формат.');const url=URL.createObjectURL(file);cropURL=url;const image=new Image();image.src=url;await image.decode();if(ticket!==cropTicket)return;if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>16000000)throw Error('Используйте фотографию до 16 мегапикселей.');cropImage=image;panX=panY=0;zoom.value='1';shape='circle';status('#avatar-crop-status','');drawCrop();crop.showModal();cropCanvas.focus();}catch(error){if(ticket!==cropTicket)return;clearCrop();status('#avatar-status',error.message||'Не удалось открыть фотографию. Используйте PNG, JPEG или WebP.',true);}}
$('#avatar-file').onchange=e=>openCrop(e.target.files[0]);$('#avatar-upload').onclick=()=>$('#avatar-file').click();
crop.querySelectorAll('[data-crop-close]').forEach(b=>b.onclick=()=>{if(!cropSaving)crop.close();});crop.addEventListener('cancel',e=>{if(cropSaving)e.preventDefault();});crop.addEventListener('close',()=>{clearCrop();$('#avatar-upload').focus();});
crop.querySelectorAll('[data-crop-shape]').forEach(b=>b.onclick=()=>{shape=b.dataset.cropShape;drawCrop();});zoom.oninput=drawCrop;crop.querySelector('[data-crop-reset]').onclick=()=>{panX=panY=0;zoom.value='1';drawCrop();};
cropCanvas.onpointerdown=e=>{if(cropSaving)return;drag={x:e.clientX,y:e.clientY};cropCanvas.setPointerCapture(e.pointerId);};cropCanvas.onpointermove=e=>{if(!drag||cropSaving)return;const ratio=512/cropCanvas.getBoundingClientRect().width;panX+=(e.clientX-drag.x)*ratio;panY+=(e.clientY-drag.y)*ratio;drag={x:e.clientX,y:e.clientY};drawCrop();};cropCanvas.onpointerup=cropCanvas.onpointercancel=()=>{drag=null;};
cropCanvas.onkeydown=e=>{if(cropSaving)return;const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},d=directions[e.key];if(!d)return;e.preventDefault();panX+=d[0]*(e.shiftKey?32:8);panY+=d[1]*(e.shiftKey?32:8);drawCrop();};
$('#avatar-crop-save').onclick=async()=>{if(cropSaving||!cropImage)return;cropSaving=true;crop.querySelectorAll('button,input').forEach(n=>n.disabled=true);status('#avatar-crop-status','Сохраняем…');try{const blob=await new Promise(resolve=>cropCanvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Не удалось подготовить фотографию. Повторите кадрирование.');const data=new FormData();data.append('avatar',blob,'avatar.png');const result=await api('/profile/avatar',{method:'POST',body:data});saved(result);status('#avatar-status','Фотография обновлена.');crop.close();}catch(error){status('#avatar-crop-status',error.message,true);}finally{cropSaving=false;crop.querySelectorAll('button,input').forEach(n=>n.disabled=false);}};
$('#avatar-remove').onclick=e=>action(e.currentTarget,'#avatar-status',()=>api('/profile/avatar',{method:'DELETE'}),'Фотография удалена.');
async function balance(){const button=$('#cloud-refresh');button.disabled=true;$('#cloud-balance').textContent='—';status('#cloud-status','Обновляем баланс…');try{const account=$('#cloud-account').value,data=await api('/profile/cloud-balance'+(account?'?accountId='+encodeURIComponent(account):''));if(data.chooseAccount){$('#cloud-account-label').hidden=false;const select=$('#cloud-account');select.replaceChildren(new Option('Выберите аккаунт',''));for(const a of data.accounts)select.add(new Option(a.name,a.id));status('#cloud-status',data.accounts.length?'Выберите платёжный аккаунт.':'Подключению не доступны платёжные аккаунты. Проверьте права.');return;}$('#cloud-balance').textContent=new Intl.NumberFormat('ru-RU',{style:'currency',currency:data.currency||'RUB'}).format(Number(data.balance));$('#cloud-link').href=data.url;status('#cloud-status',data.name+' · обновлено '+new Date(data.checkedAt*1000).toLocaleTimeString('ru-RU'));}catch(e){status('#cloud-status',e.message,true);}finally{button.disabled=false;}}
$('#cloud-refresh').onclick=balance;$('#cloud-account').onchange=()=>{if($('#cloud-account').value)balance();};
api('/me').then(data=>{paint(data);for(const key of ['firstName','lastName','telegram'])$('#details-form').elements[key].value=data[key]||'';$('#loading').hidden=true;$('#settings').hidden=false;if(data.impersonation){$('#settings').querySelectorAll('button,input').forEach(n=>n.disabled=true);$('#loading').hidden=false;$('#loading').textContent='Для изменения профиля вернитесь в собственный аккаунт.';}if(data.admin&&!data.impersonation){$('#cloud').hidden=false;balance();}}).catch(e=>status('#loading',e.message,true));
})();</script></body></html>'''

PROFILE_ACCESS = PROFILE_ACCESS.replace('PROFILE_ICON', '"<svg width=\\"20\\" height=\\"20\\" aria-hidden=\\"true\\" data-phosphor=\\"user-circle\\" xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 256 256\\" fill=\\"currentColor\\"><path d=\\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z\\"/></svg>"')
