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

# Phosphor Regular user-circle, MIT; full notice retained in the delivered script.
PROFILE_ICON = '<svg width="20" height="20" aria-hidden="true" data-phosphor="user-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z"/></svg>'
PROFILE_ACCESS = '/*'+'MIT License\n\nCopyright (c) 2023 Phosphor Icons\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n'+'*/' + r'''
(()=>{
 let user,frame,dialog,opener;
 const paint=data=>{user=data;document.querySelectorAll('.account-avatar').forEach(n=>{if(data.avatarUrl&&n.querySelector('img')?.getAttribute('src')===data.avatarUrl)return;if(!data.avatarUrl&&n.textContent===Array.from(data.name||'?')[0])return;n.replaceChildren();if(data.avatarUrl){const img=document.createElement('img');img.src=data.avatarUrl;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';n.append(img);}else n.textContent=Array.from(data.name||'?')[0];});document.querySelectorAll('.account-greeting strong,#studio-account-name').forEach(n=>{if(n.textContent!==data.name)n.textContent=data.name;});const home=document.getElementById('profile');if(home&&home.textContent!=='Привет, '+data.name)home.textContent='Привет, '+data.name;if(window.__EDITOR_PROFILE__)window.__EDITOR_PROFILE__={...window.__EDITOR_PROFILE__,...data};};
 const open=event=>{event.preventDefault();opener=event.currentTarget;opener.closest('details')?.removeAttribute('open');if(!dialog){dialog=document.createElement('dialog');dialog.id='user-profile-dialog';dialog.setAttribute('aria-label','Мой профиль');dialog.style.cssText='box-sizing:border-box;width:min(840px,calc(100vw - 24px));height:min(900px,calc(100dvh - 24px));padding:0;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden;background:white';const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.style.cssText='position:absolute;right:16px;top:12px;z-index:2;min-height:36px;padding:6px 12px;border:1px solid #dfe3e8;border-radius:6px;background:white;color:#202329';close.onclick=()=>dialog.close();frame=document.createElement('iframe');frame.src='/profile/?embedded=1';frame.title='Настройки профиля';frame.style.cssText='width:100%;height:100%;border:0;display:block';dialog.append(close,frame);dialog.addEventListener('close',()=>opener?.focus());document.body.append(dialog);}dialog.showModal();};
 const attach=()=>{const dropdown=document.querySelector('.account-dropdown');if(!dropdown)return false;if(!dropdown.querySelector('[data-user-profile]')){const a=document.createElement('a');a.href='/profile/';a.dataset.userProfile='';a.className='profile-menu-action';a.style.cssText='display:flex;align-items:center;gap:12px;min-height:44px;padding:10px 12px;color:inherit;text-decoration:none;font-size:13px';a.innerHTML='<span class="profile-menu-icon" aria-hidden="true" style="display:inline-flex;width:20px;height:20px;flex:none">'+PROFILE_ICON+'</span><span>Мой профиль</span>';a.addEventListener('click',open);dropdown.prepend(a);}const menu=dropdown.closest('.account-menu');if(menu&&!menu.dataset.profileObserved){menu.dataset.profileObserved='1';new MutationObserver(()=>{if(user)paint(user);}).observe(menu,{childList:true,subtree:true});}return true;};
 const start=()=>{if(location.pathname==='/profile/')return;fetch('/editor-api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data)paint(data);}).catch(()=>{});if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}};
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.type!=='user-profile-updated')return;paint(event.data.user);window.dispatchEvent(new CustomEvent('account-profile-context',{detail:event.data.context}));});
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
                image=ImageOps.exif_transpose(image).convert('RGBA');image.thumbnail((512,512));image.info.clear()
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
</style></head><body><main><a id="back" href="/">← На главную</a><h1>Мой профиль</h1><p>Личные данные и безопасность аккаунта</p><p id="loading" role="status">Загружаем профиль…</p><div id="settings" hidden>
<section aria-labelledby="avatar-title"><h2 id="avatar-title">Фотография</h2><div class="avatar-row"><div id="avatar-preview" class="avatar-preview" aria-label="Аватар"></div><div><label>Выбрать фотографию<input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><small>PNG, JPEG или WebP · до 5 МБ · до 16 Мп</small><div class="actions"><button id="avatar-upload">Загрузить фото</button><button id="avatar-remove">Удалить фото</button></div></div></div><p id="avatar-status" class="status" role="status"></p></section>
<section aria-labelledby="details-title"><h2 id="details-title">Личные данные</h2><form id="details-form"><div class="fields"><label>Имя<input name="firstName" required maxlength="50" autocomplete="given-name"></label><label>Фамилия<input name="lastName" maxlength="50" autocomplete="family-name"></label></div><label>Telegram<input name="telegram" maxlength="60" placeholder="@username или https://t.me/username" autocomplete="off"><small>Ссылка на ваш профиль. Подключение бота и отправка уведомлений не выполняются.</small></label><button class="primary">Сохранить данные</button><p id="details-status" class="status" role="status"></p></form></section>
<section aria-labelledby="password-title"><h2 id="password-title">Пароль</h2><form id="password-form"><label>Текущий пароль<input type="password" name="currentPassword" required maxlength="200" autocomplete="current-password"></label><div class="fields"><label>Новый пароль<input type="password" name="newPassword" required minlength="8" maxlength="200" autocomplete="new-password"></label><label>Повторите новый пароль<input type="password" name="confirmPassword" required minlength="8" maxlength="200" autocomplete="new-password"></label></div><button class="primary">Сменить пароль</button><p id="password-status" class="status" role="status"></p></form></section>
<section id="cloud" hidden aria-labelledby="cloud-title"><h2 id="cloud-title">Яндекс Клауд</h2><p>Баланс платёжного аккаунта из существующего серверного подключения.</p><p id="cloud-balance" class="balance">—</p><p id="cloud-status" class="status" role="status"></p><label id="cloud-account-label" hidden>Платёжный аккаунт<select id="cloud-account"></select></label><div class="cloud-actions"><button id="cloud-refresh">Обновить баланс</button><a id="cloud-link" href="https://billing.yandex.cloud/" target="_blank" rel="noopener noreferrer">Открыть Яндекс Клауд</a></div></section>
</div></main><script>
(()=>{'use strict';const $=s=>document.querySelector(s);let user;const embedded=new URLSearchParams(location.search).has('embedded');if(embedded)$('#back').hidden=true;
function status(id,text,error=false){const n=$(id);n.textContent=text;n.classList.toggle('error',error);}
async function api(path,options){const r=await fetch('/editor-api'+path,options);const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось выполнить действие.');return data;}
const json=(data,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function paint(data){user=data;$('#avatar-preview').replaceChildren();if(data.avatarUrl){const img=document.createElement('img');img.src=data.avatarUrl;img.alt='';$('#avatar-preview').append(img);}else $('#avatar-preview').textContent=Array.from(data.name||'?')[0];$('#avatar-remove').disabled=!data.avatarUrl;}
function saved(data){paint(data.user);window.dispatchEvent(new CustomEvent('account-profile-context',{detail:data.context}));if(embedded)parent.postMessage({type:'user-profile-updated',user:data.user,context:data.context},location.origin);}
async function action(button,id,fn,message){button.disabled=true;status(id,'Сохраняем…');try{const data=await fn();saved(data);status(id,message);}catch(e){status(id,e.message,true);}finally{button.disabled=false;}}
$('#details-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;action(f.querySelector('button'),'#details-status',()=>api('/profile',json(Object.fromEntries(new FormData(f)),'PATCH')),'Личные данные сохранены.');};
$('#password-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;if(f.elements.newPassword.value!==f.elements.confirmPassword.value){status('#password-status','Новые пароли не совпадают.',true);return;}action(f.querySelector('button'),'#password-status',async()=>{const data=await api('/profile/password',json({currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value}));f.reset();return data;},'Пароль изменён. Старые сеансы на других устройствах завершены.');};
$('#avatar-upload').onclick=e=>action(e.currentTarget,'#avatar-status',async()=>{const file=$('#avatar-file').files[0];if(!file)throw Error('Выберите фотографию.');if(file.size>5*1024*1024)throw Error('Фотография больше 5 МБ.');const data=new FormData();data.append('avatar',file);const result=await api('/profile/avatar',{method:'POST',body:data});$('#avatar-file').value='';return result;},'Фотография обновлена.');
$('#avatar-remove').onclick=e=>action(e.currentTarget,'#avatar-status',()=>api('/profile/avatar',{method:'DELETE'}),'Фотография удалена.');
async function balance(){const button=$('#cloud-refresh');button.disabled=true;$('#cloud-balance').textContent='—';status('#cloud-status','Обновляем баланс…');try{const account=$('#cloud-account').value,data=await api('/profile/cloud-balance'+(account?'?accountId='+encodeURIComponent(account):''));if(data.chooseAccount){$('#cloud-account-label').hidden=false;const select=$('#cloud-account');select.replaceChildren(new Option('Выберите аккаунт',''));for(const a of data.accounts)select.add(new Option(a.name,a.id));status('#cloud-status',data.accounts.length?'Выберите платёжный аккаунт.':'Подключению не доступны платёжные аккаунты. Проверьте права.');return;}$('#cloud-balance').textContent=new Intl.NumberFormat('ru-RU',{style:'currency',currency:data.currency||'RUB'}).format(Number(data.balance));$('#cloud-link').href=data.url;status('#cloud-status',data.name+' · обновлено '+new Date(data.checkedAt*1000).toLocaleTimeString('ru-RU'));}catch(e){status('#cloud-status',e.message,true);}finally{button.disabled=false;}}
$('#cloud-refresh').onclick=balance;$('#cloud-account').onchange=()=>{if($('#cloud-account').value)balance();};
api('/me').then(data=>{paint(data);for(const key of ['firstName','lastName','telegram'])$('#details-form').elements[key].value=data[key]||'';$('#loading').hidden=true;$('#settings').hidden=false;if(data.impersonation){$('#settings').querySelectorAll('button,input').forEach(n=>n.disabled=true);$('#loading').hidden=false;$('#loading').textContent='Для изменения профиля вернитесь в собственный аккаунт.';}if(data.admin&&!data.impersonation){$('#cloud').hidden=false;balance();}}).catch(e=>status('#loading',e.message,true));
})();</script></body></html>'''

PROFILE_ACCESS = PROFILE_ACCESS.replace('PROFILE_ICON', '"<svg width=\\"20\\" height=\\"20\\" aria-hidden=\\"true\\" data-phosphor=\\"user-circle\\" xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 256 256\\" fill=\\"currentColor\\"><path d=\\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z\\"/></svg>"')
