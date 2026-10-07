/* Account chrome and archive views. Article editing stays in editor.js. */
(() => {
  if (!window.__EDITOR_SERVER_FIRST__) {$('#remote-preview').hidden = true;window.finishArticleBackupStartup?.();return;}
  const prefix = window.__EDITOR_API_PREFIX__ || '/api';
  const esc = escapeHtml;
  const paths = {
    chevron:'m6 9 6 6 6-6', close:'m6 6 12 12M6 18 18 6', search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
    edit:'m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    copy:'M9 9h12v12H9ZM15 9V3H3v12h6', plus:'M12 5v14M5 12h14', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8',
    archive:'M3 4h18v4H3ZM5 8v13h14V8M10 12h4', info:'M12 17v-6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', logout:'M9 21H3V3h6M16 17l5-5-5-5M8 12h13',
    grid:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z', list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M18 17a7 7 0 0 1-11 2l-3-3', lock:'M5 11h14v10H5ZM8 11V7a4 4 0 0 1 8 0v4'
  };
  const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.archive}"/></svg>`;
  const roles = {admin:'Администратор', moderator:'Модератор', editor:'Редактор'};
  const number = new Intl.NumberFormat('ru-RU');
  const plural = new Intl.PluralRules('ru-RU');
  const articleCount = count => `${number.format(count)} ${{one:'статья',few:'статьи',many:'статей',other:'статьи'}[plural.select(count)]}`;
  const date = value => {const d=new Date(value);return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});};
  const fullDate = value => {const d=new Date(value);return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleString('ru-RU');};
  const monthKey = value => {const d=new Date(value);return Number.isNaN(d.valueOf()) ? 'unknown' : new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit'}).format(d);};
  let me, directory = [], archiveRequest = 0, usersPresenceTimer = null, presenceTimer = null;
  async function call(route, options = {}) {
    const response = await fetch(prefix + route, options);
    let result;
    try {result = await response.json();} catch {throw new Error('Сервер временно недоступен. Повторите попытку.');}
    if (response.status === 401) location.href = '/login';
    if (!response.ok) throw new Error(result.error || `Ошибка ${response.status}`);
    return result;
  }
  function pingPresence() {
    return fetch(prefix + '/presence',{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{});
  }
  function startPresenceHeartbeat() {
    if (presenceTimer) return;
    pingPresence();
    presenceTimer=setInterval(pingPresence,25000);
    window.addEventListener('focus',pingPresence);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pingPresence();});
  }
  const jsonPost = value => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby','account-heading');
  dialog.innerHTML = `<header class="account-dialog-head"><div><span class="account-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h2 id="account-heading"></h2><p id="account-subtitle"></p></div><button type="button" class="icon-button" aria-label="Закрыть">${icon('close')}</button></header><div id="account-content" class="account-dialog-body"></div>`;
  document.body.append(dialog);
  const content = dialog.querySelector('#account-content');
  dialog.querySelector('header button').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {if(event.target === dialog) dialog.close();});
  dialog.addEventListener('close',()=>{archiveRequest++;clearTimeout(usersPresenceTimer);usersPresenceTimer=null;});
  function show(title, subtitle='', compact=false) {
    archiveRequest++;
    $('#account-menu').open=false;
    dialog.classList.toggle('compact-dialog',compact);
    dialog.querySelector('h2').textContent=title;
    dialog.querySelector('#account-subtitle').textContent=subtitle;
    content.replaceChildren();
    if(!dialog.open) dialog.showModal();
  }
  function pending() {content.innerHTML='<div class="account-loading" role="status"><span class="loading-dot"></span>Загружаем…</div>';content.setAttribute('aria-busy','true');}
  function failed(error,retry) {content.removeAttribute('aria-busy');content.innerHTML=`<div class="account-empty"><h3>Не удалось загрузить</h3><p>${esc(error.message)}</p><button type="button">Повторить</button></div>`;content.querySelector('button').onclick=retry;}
  async function openDraft(draft) {
    await persistArticleBackup(articleNeedsSave);
    currentId=draft.id;lockedId=true;
    $('#filename').value=currentId;$('#filename').disabled=true;$('#page-title').value=draft.title;
    setBody(draft.body);restoreProducts(draft.products || []);setTab('editor');
    setArticleSaveDocument(draft);
    $('#status').textContent=`Открыто: ${draft.title}`;
    await window.markArticleBackupSynced?.({force:true});
    dialog.close();
  }
  async function openArticle(id,brand) {
    if($('#status').textContent.includes('несохранённые') && !await confirmAction('Открыть другую статью?','Несохранённые изменения текущей статьи будут потеряны.','Открыть')) return;
    if(brand!==ACTIVE_EDITOR.key) {location.href=`${brand==='hasl'?'/hasl/':'/'}?article=${encodeURIComponent(id)}`;return;}
    await openDraft(await call(`/draft/${encodeURIComponent(id)}?brand=${brand}`));
  }
  function confirmAction(title,description,yes='Да, удалить',danger=false) {
    return new Promise(resolve=>{
      const box=document.createElement('dialog');box.className='account-confirm';
      box.setAttribute('aria-labelledby','confirm-heading');
      box.innerHTML=`<div class="confirm-icon">${icon(danger?'trash':'archive')}</div><h2 id="confirm-heading">${esc(title)}</h2><p>${esc(description)}</p><div class="dialog-actions"><button type="button" data-answer="no">${danger?'Нет, оставить':'Отмена'}</button><button type="button" data-answer="yes" class="${danger?'danger-fill':'primary'}">${esc(yes)}</button></div>`;
      document.body.append(box);
      box.onclick=event=>{const b=event.target.closest('[data-answer]');if(b){resolve(b.dataset.answer==='yes');box.close();}};
      box.oncancel=()=>resolve(false);box.onclose=()=>box.remove();box.showModal();
    });
  }
  const ownOwner = () => me.id;
  function imageUrl(src,owner=ownOwner()) {
    if(!src || /^(?:javascript:|blob:)/i.test(src)) return '';
    if(/^(?:https?:|data:)/i.test(src)) return src;
    const relative=src.replace(/^\/?articles\//,'');
    if(relative.startsWith('/')) return relative;
    return `${prefix}/archive/${encodeURIComponent(owner)}/assets/${relative.split('/').map(encodeURIComponent).join('/')}`;
  }
  async function archive(initialOwner=ownOwner()) {
    show('Все статьи','Личный архив · статьи и материалы');
    pending();const requestId=archiveRequest;
    try {
      const canInspect=me.admin || me.role==='moderator';
      if(canInspect) directory=await call('/archive-users');
      if(requestId!==archiveRequest) return;
      content.innerHTML=`<div class="archive-toolbar">${canInspect?'<label class="archive-owner"><span>Архив пользователя</span><select id="archive-owner" aria-label="Архив пользователя"></select></label>':''}<label class="archive-search">${icon('search')}<input id="archive-search" type="search" placeholder="Найти статью…" aria-label="Найти статью"></label><select id="archive-brand" aria-label="Бренд"><option value="">Все бренды</option><option value="outmax">OUTMAX</option><option value="hasl">ХАСЛ</option></select><div class="layout-toggle" aria-label="Вид архива"><button type="button" data-layout="grid" aria-label="Карточки">${icon('grid')}</button><button type="button" data-layout="list" aria-label="Список">${icon('list')}</button></div></div><div class="archive-context"><span id="archive-caption"></span><button type="button" class="text-button" id="legacy-articles">Старые черновики</button></div><div id="archive-results"></div>`;
      content.removeAttribute('aria-busy');
      const ownerSelect=content.querySelector('#archive-owner');
      if(ownerSelect) {
        for(const user of directory) {const option=document.createElement('option');option.value=user.id;option.textContent=`${user.name}${user.id===me.id?' · мой архив':''} · ${roles[user.role]} · ${user.articleCount}`;ownerSelect.append(option);}
        ownerSelect.value=initialOwner;
      }
      let owner=ownerSelect?.value || me.id, articles=[], page=0, layout=localStorage.getItem('editor-archive-layout') || 'grid';
      const pageSize=24;
      const results=content.querySelector('#archive-results');
      const search=content.querySelector('#archive-search');const brandSelect=content.querySelector('#archive-brand');
      let loadId=0;
      function render() {
        const own=owner===me.id;
        const query=search.value.trim().toLocaleLowerCase('ru-RU');
        const visible=articles.filter(item=>(!brandSelect.value || item.brand===brandSelect.value) && (!query || `${item.title} ${item.preview}`.toLocaleLowerCase('ru-RU').includes(query)));
        const user=directory.find(item=>item.id===owner) || me;
        content.querySelector('#archive-caption').textContent=own?`${articleCount(articles.length)} в вашем архиве`:`${user.name} · ${articleCount(articles.length)} · только просмотр`;
        dialog.querySelector('#account-subtitle').textContent=own?'Ваши статьи, сгруппированные по месяцу создания':'Можно посмотреть статью и сохранить отдельную копию себе';
        content.querySelector('#legacy-articles').hidden=!own;
        content.querySelectorAll('[data-layout]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.layout===layout));});
        results.replaceChildren();
        if(!visible.length) {results.innerHTML=`<div class="account-empty"><span class="empty-icon">${icon('archive')}</span><h3>${articles.length?'Ничего не найдено':'В архиве пока пусто'}</h3><p>${articles.length?'Попробуйте другое название или бренд.':own?'Сохраните статью в редакторе — она появится здесь.':'Этот пользователь ещё не сохранил статьи.'}</p></div>`;return;}
        const pageCount=Math.ceil(visible.length/pageSize);
        page=Math.max(0,Math.min(page,pageCount-1));
        const monthCounts=new Map();
        visible.forEach(item=>{const month=monthKey(item.createdAt);monthCounts.set(month,(monthCounts.get(month)||0)+1);});
        const groups=new Map();
        for(const item of visible.slice(page*pageSize,(page+1)*pageSize)){const month=monthKey(item.createdAt);if(!groups.has(month))groups.set(month,[]);groups.get(month).push(item);}
        for(const [month,items] of groups) {
          const section=document.createElement('section');section.className='archive-month';
          const label=month==='unknown'?'Без даты':new Date(month+'-01T12:00:00').toLocaleDateString('ru-RU',{year:'numeric',month:'long'});
          section.innerHTML=`<h3 class="archive-month-title">${esc(label)}<span>${articleCount(monthCounts.get(month))}</span></h3><div class="archive-items ${layout==='list'?'as-list':''}"></div>`;
          for(const item of items) {
            const card=document.createElement('article');card.className='archive-card';
            const image=imageUrl(item.image,owner);
            card.innerHTML=`<button type="button" class="archive-open" aria-label="${own?'Редактировать':'Посмотреть'}: ${esc(item.title)}"><span class="archive-thumb">${image?`<img src="${esc(image)}" alt="" loading="lazy">`:icon('archive')}</span><span class="archive-card-copy"><span class="archive-brand ${item.brand==='hasl'?'is-hasl':''}"><img src="${item.brand==='hasl'?'/images/hasle.png':'/images/outmax.png'}" alt="">${item.brand==='hasl'?'ХАСЛ':'OUTMAX'}</span><strong title="${esc(item.title)}">${esc(item.title)}</strong><span class="archive-excerpt">${esc(item.preview || 'Без описания')}</span></span></button><div class="archive-card-bottom"><div class="archive-dates"><span title="${esc(fullDate(item.createdAt))}">Создана <time>${esc(date(item.createdAt))}</time></span><span title="${esc(fullDate(item.savedAt))}">Изменена <time>${esc(date(item.savedAt))}</time></span></div><div class="archive-actions"><button type="button" class="icon-button action-main" aria-label="${own?'Редактировать':'Посмотреть'}" title="${own?'Редактировать':'Посмотреть'}">${icon(own?'edit':'eye')}</button><button type="button" class="icon-button action-secondary ${own?'danger-icon':''}" aria-label="${own?'Удалить статью':'Сохранить копию себе'}" title="${own?'Удалить статью':'Сохранить копию себе'}">${icon(own?'trash':'copy')}</button></div></div>`;
            card.querySelector('img')?.addEventListener('error',event=>{if(event.target.closest('.archive-thumb'))event.target.replaceWith(Object.assign(document.createElement('span'),{textContent:'Нет фото'}));});
            const open=()=> (own?openArticle(item.id,item.brand):inspectArticle(item,owner)).catch(error=>toast(error.message,true));
            card.querySelector('.archive-open').onclick=open;card.querySelector('.action-main').onclick=open;
            card.querySelector('.action-secondary').onclick=async event=>{
              const button=event.currentTarget;
              try {
                if(own) {if(!await confirmAction('Удалить статью?',`«${item.title}» и её материалы будут удалены. Внешняя ссылка перестанет работать.`,'Да, удалить',true))return;button.disabled=true;await call(`/draft/${encodeURIComponent(item.id)}?brand=${item.brand}`,{method:'DELETE'});await listDrafts();await load();toast('Статья удалена');}
                else {button.disabled=true;await copyArticle(item,owner);button.disabled=false;}
              } catch(error){button.disabled=false;toast(error.message,true);}
            };
            section.querySelector('.archive-items').append(card);
          }
          results.append(section);
        }
        if(pageCount>1){const pager=document.createElement('div');pager.className='archive-pagination';pager.innerHTML=`<span>${number.format(page*pageSize+1)}–${number.format(Math.min((page+1)*pageSize,visible.length))} из ${number.format(visible.length)}</span><div><button type="button" class="previous" ${page===0?'disabled':''}>Назад</button><span>${page+1} / ${pageCount}</span><button type="button" class="next" ${page===pageCount-1?'disabled':''}>Далее</button></div>`;pager.querySelector('.previous').onclick=()=>{page--;render();results.scrollIntoView({block:'start'});};pager.querySelector('.next').onclick=()=>{page++;render();results.scrollIntoView({block:'start'});};results.append(pager);}
      }
      async function load() {
        const current=++loadId;
        owner=ownerSelect?.value || me.id;page=0;
        results.innerHTML='<div class="account-loading" role="status"><span class="loading-dot"></span>Загружаем статьи…</div>';
        try {const data=await call(`/archive/${encodeURIComponent(owner)}`);if(current!==loadId || requestId!==archiveRequest)return;articles=data;render();}
        catch(error){if(current===loadId){results.innerHTML=`<div class="account-empty"><p>${esc(error.message)}</p><button type="button">Повторить</button></div>`;results.querySelector('button').onclick=load;}}
      }
      ownerSelect?.addEventListener('change',load);search.oninput=()=>{page=0;render();};brandSelect.onchange=()=>{page=0;render();};
      content.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>{layout=button.dataset.layout;localStorage.setItem('editor-archive-layout',layout);render();});
      content.querySelector('#legacy-articles').onclick=()=>legacy().catch(error=>toast(error.message,true));
      await load();
    } catch(error){if(requestId===archiveRequest)failed(error,()=>archive(initialOwner));}
  }
  async function copyArticle(item,owner) {
    const copied=await call(`/archive/${encodeURIComponent(owner)}/article/${encodeURIComponent(item.id)}/copy?brand=${item.brand}`,{method:'POST'});
    await listDrafts();toast('Копия сохранена в ваш архив. Её можно редактировать.');return copied;
  }
  async function inspectArticle(item,owner) {
    const viewer=document.createElement('dialog');viewer.className='account-viewer';viewer.setAttribute('aria-label','Просмотр статьи');
    viewer.innerHTML=`<header class="viewer-head"><div><span class="readonly-badge">${icon('lock')} Только просмотр</span><h2 title="${esc(item.title)}">${esc(item.title)}</h2></div><button type="button" class="icon-button viewer-close" aria-label="Закрыть">${icon('close')}</button></header><div class="viewer-toolbar"><div class="layout-toggle"><button type="button" data-size="desktop" aria-pressed="true">Десктоп</button><button type="button" data-size="mobile" aria-pressed="false">Телефон</button></div><button type="button" class="primary viewer-copy">${icon('copy')} Сохранить копию себе</button></div><div class="viewer-stage"><iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" src="${prefix}/archive/${encodeURIComponent(owner)}/article/${encodeURIComponent(item.id)}?brand=${item.brand}" title="${esc(item.title)}"></iframe></div>`;
    document.body.append(viewer);viewer.showModal();
    viewer.querySelector('.viewer-close').onclick=()=>viewer.close();viewer.onclose=()=>viewer.remove();
    viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
    viewer.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{viewer.querySelector('iframe').classList.toggle('mobile',button.dataset.size==='mobile');viewer.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
    const copy=viewer.querySelector('.viewer-copy');
    copy.onclick=async()=>{copy.disabled=true;try {const result=await copyArticle(item,owner);copy.innerHTML=icon('edit')+' Открыть мою копию';copy.disabled=false;copy.onclick=async()=>{viewer.close();await openArticle(result.id,result.brand);};}catch(error){copy.disabled=false;toast(error.message,true);}};
  }
  async function migrateLocal(item) {
    const draft=await window.editorLocalDraft(item.id);const brand=ACTIVE_EDITOR.key;
    const id=cleanId(item.id).slice(0,40)+'-copy-'+crypto.randomUUID().slice(0,8);
    const node=document.createElement('div');node.innerHTML=draft.body;const migrated=new Map();
    for(const img of node.querySelectorAll('img[src]')) {
      const src=img.getAttribute('src');const blob=await window.editorLocalAsset(src);if(!blob)continue;
      const uploaded=await call(`/upload?draft=${encodeURIComponent(id)}&brand=${brand}&name=${encodeURIComponent(src.split('/').pop())}`,{method:'POST',headers:{'Content-Type':blob.type},body:blob});
      img.setAttribute('src',uploaded.src);migrated.set(src,uploaded.src);
    }
    const products=JSON.parse(JSON.stringify(draft.products || []),(_key,value)=>typeof value==='string'?(migrated.get(value)||value):value);
    await call('/save',jsonPost({...draft,id,brand,body:node.innerHTML,products}));await listDrafts();await openArticle(id,brand);
  }
  async function legacy() {
    show('Старые черновики','Перенесите нужный материал в свой профиль. Исходник останется на месте.');pending();const requestId=archiveRequest;
    try {
      const [shared,local]=await Promise.all([call('/legacy-drafts'),window.editorLocalDrafts?.() || []]);if(requestId!==archiveRequest)return;content.replaceChildren();content.removeAttribute('aria-busy');
      content.innerHTML='<div class="account-notice">Черновики браузера доступны на том устройстве, где их сохраняли. Сейчас открыт редактор '+esc(ACTIVE_EDITOR.name)+'.</div>';
      for(const [title,items,browser] of [['Общий архив прежней версии',shared,false],['Черновики этого браузера',local,true]]) {
        const section=document.createElement('section');section.innerHTML=`<h3 class="archive-month-title">${esc(title)}<span>${articleCount(items.length)}</span></h3>`;
        if(!items.length)section.innerHTML+='<p class="muted-copy">Нет черновиков</p>';
        for(const item of items) {const row=document.createElement('div');row.className='legacy-row';row.innerHTML=`<div><strong>${esc(item.title)}</strong><span>${esc(date(item.savedAt))}${item.brand?' · '+(item.brand==='hasl'?'ХАСЛ':'OUTMAX'):''}</span></div><button type="button" aria-label="Скопировать ${esc(item.title)}">${icon('copy')}<span>Сохранить себе</span></button>`;const button=row.querySelector('button');button.onclick=async()=>{button.disabled=true;try{if(browser)await migrateLocal(item);else{const copy=await call(`/legacy-drafts/${encodeURIComponent(item.id)}/copy?brand=${item.brand}`,{method:'POST'});await listDrafts();await openArticle(copy.id,copy.brand);}}catch(error){button.disabled=false;toast(error.message,true);}};section.append(row);}
        content.append(section);
      }
    } catch(error){if(requestId===archiveRequest)failed(error,legacy);}
  }
  function accountForm(user=null) {
    const form=document.createElement('form');form.className='user-form';form.autocomplete='off';
    form.innerHTML=`<div class="form-grid"><label>Имя<input name="name" value="${esc(user?.name||'')}" placeholder="Имя и фамилия" required maxlength="100"></label><label>Логин<input name="login" value="${esc(user?.login||'')}" placeholder="editor03" required maxlength="100" autocapitalize="none" spellcheck="false"></label></div><label>Роль<select name="role" ${user?.admin?'disabled':''}>${user?.admin?'<option value="admin">Администратор</option>':'<option value="editor">Редактор</option><option value="moderator">Модератор</option>'}</select><small>Модератор может смотреть чужие архивы и копировать статьи себе.</small></label><label class="email-access-setting"><input name="emailAccess" type="checkbox" ${user?.admin?'disabled':''}><span><strong>Доступ к email-редактору</strong><small>${user?.admin?'Администратору доступен всегда.':'Можно выдать редактору или отозвать у модератора.'}</small></span></label><label>Пароль<span class="password-field"><input name="password" type="password" value="${esc(user?.password||'')}" placeholder="${user?'Новый пароль':'Оставьте пустым для автоматической генерации'}" minlength="8" maxlength="200" autocomplete="new-password"><button type="button" class="icon-button password-visibility" aria-label="Показать пароль" aria-pressed="false">${icon('eye')}</button></span></label><div class="password-tools"><button type="button" class="text-button generate-password">${icon('refresh')} Сгенерировать пароль</button><span>Не менее 8 символов</span></div><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="form-cancel">Отмена</button><button type="submit" class="primary">${user?'Сохранить изменения':'Добавить пользователя'}</button></div>`;
    if(user&&!user.admin)form.elements.role.value=user.role;
    form.elements.emailAccess.checked=Boolean(user?.admin || user?.emailAccess || (!user && form.elements.role.value==='moderator'));
    let accessTouched=false;
    form.elements.emailAccess.onchange=()=>{accessTouched=true;};
    form.elements.role.onchange=()=>{if(!accessTouched)form.elements.emailAccess.checked=form.elements.role.value==='moderator';};
    form.querySelector('.password-visibility').onclick=event=>{const b=event.currentTarget,input=form.elements.password;const visible=input.type==='password';input.type=visible?'text':'password';b.setAttribute('aria-pressed',String(visible));b.setAttribute('aria-label',visible?'Скрыть пароль':'Показать пароль');};
    form.querySelector('.generate-password').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{form.elements.password.value=(await call('/users/password',{method:'POST'})).password;form.elements.password.type='text';form.querySelector('.password-visibility').setAttribute('aria-pressed','true');form.querySelector('.password-visibility').setAttribute('aria-label','Скрыть пароль');toast('Новый пароль сгенерирован');}catch(error){toast(error.message,true);}finally{button.disabled=false;}};
    return form;
  }
  async function editUser(user=null) {
    const box=document.createElement('dialog');box.className='account-user-dialog';box.setAttribute('aria-label',user?'Редактировать пользователя':'Добавить пользователя');
    box.innerHTML=`<header class="account-dialog-head"><div><span class="account-eyebrow">ПОЛЬЗОВАТЕЛИ</span><h2>${user?'Редактировать пользователя':'Новый пользователь'}</h2></div><button type="button" class="icon-button" aria-label="Закрыть">${icon('close')}</button></header>`;
    const form=accountForm(user);box.append(form);document.body.append(box);box.showModal();
    box.querySelector('header button').onclick=()=>box.close();form.querySelector('.form-cancel').onclick=()=>box.close();box.onclose=()=>box.remove();
    form.onsubmit=async event=>{
      event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;const errorBox=form.querySelector('.form-error');errorBox.hidden=true;
      try {
        const data=Object.fromEntries(new FormData(form));
        data.emailAccess = form.elements.emailAccess.checked;
        if(user && data.password===user.password)delete data.password;
        if(user) {await call('/users/'+encodeURIComponent(user.id),{...jsonPost(data),method:'PATCH'});if(user.id===me.id){me={...me,name:data.name,login:data.login,emailAccess:data.emailAccess};updateMenu();}toast('Изменения сохранены');}
        else {const created=await call('/users',jsonPost(data));toast('Пользователь добавлен');if(!data.password){await showCredentials(created);}}
        box.close();await users();
      } catch(error){errorBox.hidden=false;errorBox.textContent=error.message;submit.disabled=false;}
    };
  }
  async function showCredentials(user) {
    const box=document.createElement('dialog');box.className='account-user-dialog';box.setAttribute('aria-label','Данные входа нового пользователя');
    box.innerHTML=`<header class="account-dialog-head"><div><span class="account-eyebrow">ПОЛЬЗОВАТЕЛЬ ДОБАВЛЕН</span><h2>${esc(user.name)}</h2></div></header><div class="user-form"><p class="muted-copy">Передайте пользователю данные для входа. Пароль также доступен в разделе «Пользователи».</p><label>Логин<input readonly value="${esc(user.login)}"></label><label>Пароль<input readonly value="${esc(user.password)}"></label><div class="dialog-actions"><button type="button" class="copy-credentials">${icon('copy')} Скопировать</button><button type="button" class="primary done">Готово</button></div></div>`;
    document.body.append(box);box.showModal();box.querySelector('.copy-credentials').onclick=()=>navigator.clipboard.writeText(`Логин: ${user.login}\nПароль: ${user.password}`).then(()=>toast('Данные скопированы')).catch(()=>toast('Выделите и скопируйте данные из полей'));
    return new Promise(resolve=>{box.querySelector('.done').onclick=()=>box.close();box.onclose=()=>{box.remove();resolve();};});
  }
  function updateUserPresence(all) {
    const byId=new Map(all.map(user=>[user.id,user]));
    content.querySelectorAll('.user-row[data-user-id]').forEach(row=>{
      const user=byId.get(row.dataset.userId);if(!user)return;
      const avatar=row.querySelector('.user-avatar'),dot=row.querySelector('.user-presence');
      const label=user.online?'Сейчас в редакторе':'Сейчас не в редакторе';
      avatar.title=label;
      dot.classList.toggle('is-online',Boolean(user.online));
      dot.classList.toggle('is-offline',!user.online);
      dot.setAttribute('aria-label',label);
    });
  }
  function scheduleUserPresenceRefresh(requestId) {
    clearTimeout(usersPresenceTimer);
    usersPresenceTimer=setTimeout(async()=>{
      if(requestId!==archiveRequest||!dialog.open||!content.querySelector('.users-list'))return;
      try {const all=await call('/users/presence');if(requestId===archiveRequest){updateUserPresence(all);scheduleUserPresenceRefresh(requestId);}}
      catch {if(requestId===archiveRequest)scheduleUserPresenceRefresh(requestId);}
    },15000);
  }
  async function users() {
    show('Пользователи','Управляйте доступом, именами и данными для входа');pending();const requestId=archiveRequest;
    try {
      const all=await call('/users');if(requestId!==archiveRequest)return;content.removeAttribute('aria-busy');
      content.innerHTML=`<div class="users-toolbar"><span>${number.format(all.length)} ${{one:'пользователь',few:'пользователя',many:'пользователей',other:'пользователя'}[plural.select(all.length)]}</span><button type="button" id="add-user" class="primary">${icon('plus')} Добавить пользователя</button></div><div class="users-list"></div>`;
      content.querySelector('#add-user').onclick=()=>editUser().catch(error=>toast(error.message,true));
      for(const user of all) {
        const row=document.createElement('div');row.className='user-row';row.dataset.userId=user.id;
        const presenceLabel=user.online?'Сейчас в редакторе':'Сейчас не в редакторе';
        row.innerHTML=`<span class="user-avatar" title="${presenceLabel}">${icon('users')}<span class="user-presence ${user.online?'is-online':'is-offline'}" role="img" aria-label="${presenceLabel}"></span></span><div class="user-identity"><strong title="${esc(user.name)}">${esc(user.name)}${user.id===me.id?'<span class="you-tag">Вы</span>':''}</strong><span>${esc(user.login)}</span></div><span class="role-badge role-${esc(user.role)}">${roles[user.role]}${user.emailAccess?'<small class="email-access-badge">Email</small>':''}</span><button type="button" class="user-password" aria-label="Показать пароль ${esc(user.name)}" aria-pressed="false"><span>••••••••</span>${icon('eye')}</button><button type="button" class="icon-button user-edit" aria-label="Редактировать ${esc(user.name)}" title="Редактировать">${icon('edit')}</button>`;
        const pass=row.querySelector('.user-password');pass.onclick=()=>{const visible=pass.getAttribute('aria-pressed')!=='true';pass.setAttribute('aria-pressed',String(visible));pass.querySelector('span').textContent=visible?user.password:'••••••••';pass.setAttribute('aria-label',`${visible?'Скрыть':'Показать'} пароль ${user.name}`);};
        row.querySelector('.user-edit').onclick=()=>editUser(user).catch(error=>toast(error.message,true));
        content.querySelector('.users-list').append(row);
      }
      scheduleUserPresenceRefresh(requestId);
    } catch(error){if(requestId===archiveRequest)failed(error,users);}
  }
  function updateMenu() {
    const pieces=me.name.trim().split(/\s+/);const initial=Array.from(pieces[0]||'?')[0];
    $('#account-name').innerHTML=`<span class="account-avatar">${esc(initial)}</span><span class="account-greeting">Привет, <strong>${esc(me.name)}</strong></span><span class="account-switcher-chevron" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg></span>`;
    $('#account-name').title=`Привет, ${me.name}`;
    $('#account-menu-meta').innerHTML=`<strong>${esc(me.name)}</strong><span>${roles[me.role] || 'Редактор'}</span>`;
    document.querySelectorAll('.editor-switcher-menu a[data-email-editor],.editor-switcher-menu a[href="/email/"],.editor-switcher-menu a[href="/OUTMAX.html"]').forEach(link=>{
      if(!me.emailAccess){link.removeAttribute('href');link.removeAttribute('target');link.setAttribute('aria-disabled','true');link.title='Доступ выдаёт администратор';link.querySelector('small').textContent='Доступ выдаёт администратор';}
      else {link.removeAttribute('aria-disabled');if(link.dataset.href)link.href=link.dataset.href;link.querySelector('small').textContent='HTML-письма для OUTMAX и ХАСЛ';}
    });
    $('#account-menu').hidden=false;$('#manage-users').hidden=!me.admin;$('#team-articles').hidden=!(me.admin||me.role==='moderator');
  }
  function aboutEditor() {
    const existing=document.querySelector('.about-editor-dialog');if(existing){existing.showModal();return;}
    const box=document.createElement('dialog');box.className='account-user-dialog about-editor-dialog';box.setAttribute('aria-labelledby','about-editor-title');
    box.innerHTML=`<header class="account-dialog-head"><div><span class="account-eyebrow">СПРАВКА</span><h2 id="about-editor-title">О редакторе ${esc(ACTIVE_EDITOR.name)}</h2></div><button type="button" class="icon-button" aria-label="Закрыть">${icon('close')}</button></header><div class="about-editor-content"><p>Редактор предназначен для подготовки статей, товарных подборок и готового HTML для публикации.</p><section><h3>Основные действия</h3><ul><li>Редактируйте текст прямо в рабочей области.</li><li>Добавляйте разделы, таблицы, товары и изображения из левой панели.</li><li>Перетаскивайте блоки за маркер, чтобы менять их порядок.</li><li>Используйте <kbd>Ctrl/⌘ + Z</kbd> и <kbd>Ctrl/⌘ + Shift + Z</kbd> для отмены и повтора.</li></ul></section><section><h3>Сохранение и публикация</h3><p>Кнопка «Сохранить» создаёт черновик в вашем профиле. Через «Экспорт HTML / ZIP» можно подготовить материал для сайта.</p></section><section><h3>Safari на Mac</h3><p>Редактор всегда должен открываться в обычном режиме сайта. Автоматический режим чтения для рабочего экрана больше не используется.</p></section></div>`;
    document.body.append(box);box.showModal();box.querySelector('header button').onclick=()=>box.close();box.onclick=event=>{if(event.target===box)box.close();};box.onclose=()=>box.remove();
  }
  for(const [id,label,name] of [['all-articles','Все статьи','archive'],['team-articles','Архивы пользователей','users'],['manage-users','Пользователи','users'],['about-editor','О редакторе','info'],['logout','Выйти','logout']])$('#'+id).innerHTML=icon(name)+`<span>${label}</span>`;
  const menus=[...document.querySelectorAll('.topbar-left details')];
  menus.forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)menus.forEach(other=>{if(other!==menu)other.open=false;});}));
  document.addEventListener('click',event=>menus.forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')menus.forEach(menu=>menu.open=false);});
  $('#all-articles').onclick=()=>archive().catch(error=>toast(error.message,true));
  $('#team-articles').onclick=()=>archive().catch(error=>toast(error.message,true));
  $('#manage-users').onclick=()=>users().catch(error=>toast(error.message,true));
  $('#about-editor').onclick=()=>{aboutEditor();$('#account-menu').open=false;};
  $('#logout').onclick=async()=>{if($('#status').textContent.includes('несохранённые')&&!await confirmAction('Выйти из профиля?','Несохранённые изменения будут потеряны.','Выйти'))return;try{await call('/logout',{method:'POST'});location.href='/login';}catch(error){toast(error.message,true);}};
  $('#remote-preview').onclick=async()=>{
    const button=$('#remote-preview');button.disabled=true;
    try {if(!await save())return;const result=await call(`/preview/${encodeURIComponent(currentId)}?brand=${ACTIVE_EDITOR.key}`,{method:'POST'});show('Ссылка на предпросмотр','Для просмотра с компьютера или телефона',true);const url=new URL(result.url,location.origin).href;
      content.innerHTML=`<div class="share-illustration">${icon('eye')}</div><p class="share-description">По ссылке доступна последняя сохранённая версия статьи. Вход в редактор не требуется.</p><label class="share-link-label">Ссылка для просмотра<input class="preview-link" readonly value="${esc(url)}"></label><div class="share-actions"><button type="button" class="primary" id="copy-preview">${icon('copy')} Скопировать ссылку</button><a class="button-link" href="${esc(url)}" target="_blank" rel="noopener">Открыть</a></div>`;
      content.querySelector('#copy-preview').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована');}catch{const input=content.querySelector('input');input.focus();input.select();toast('Скопируйте выделенную ссылку');}};
    } catch(error){toast(error.message,true);}finally{button.disabled=false;}
  };
  call('/me').then(async user=>{me=user;window.__EDITOR_PROFILE__=user;localStorage.setItem('outmax-last-editor-user',user.id);updateMenu();startPresenceHeartbeat();await listDrafts();const id=new URLSearchParams(location.search).get('article');if(id)await openArticle(id,ACTIVE_EDITOR.key);await window.finishArticleBackupStartup?.({openedId:id || ''});const view=new URLSearchParams(location.search).get('view');if(view==='users'&&me.admin)await users();else if(view==='articles')await archive();}).catch(()=>{$('#remote-preview').disabled=true;window.finishArticleBackupStartup?.();});
})();

// Persistent feedback inbox shared by article and email editor chrome.
(()=>{
 const menu=document.querySelector('#account-menu nav,#email-account-menu nav');
 if(!menu || !window.__EDITOR_SERVER_FIRST__ && !document.querySelector('#email-account-menu'))return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const feedbackIcon='<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-2.7V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4Z"/><path d="M7 8h10M7 12h7"/></svg>';
 const button=document.createElement('button');button.type='button';button.id='feedback-inbox-open';button.innerHTML=feedbackIcon+'<span>Обратная связь</span><span class="feedback-badge" hidden></span>';menu.insertBefore(button,menu.querySelector('.menu-divider'));
 const dialog=document.createElement('dialog');dialog.className='feedback-inbox-dialog';dialog.setAttribute('aria-labelledby','feedback-inbox-title');dialog.innerHTML='<header><div><h2 id="feedback-inbox-title">Обратная связь</h2><p>Заметки к вашим статьям и email-проектам</p></div><button type="button" aria-label="Закрыть">×</button></header><div class="feedback-inbox-content"></div>';document.body.append(dialog);
 const body=dialog.querySelector('.feedback-inbox-content');let items=[],previous=null;
 dialog.querySelector('header button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{if(body.querySelector('iframe'))body.replaceChildren();});
 const endpoint=(window.__EDITOR_API_PREFIX__||'/editor-api')+'/feedback/inbox';
 async function refresh(){try{const response=await fetch(endpoint,{credentials:'same-origin'});if(!response.ok)return;const data=await response.json();items=data.items;const badge=button.querySelector('.feedback-badge');badge.hidden=!data.openCount;badge.textContent=data.openCount;button.title=data.openCount+' открытых обсуждений';
  const currentButton=document.querySelector('#article-feedback');if(currentButton && typeof currentId!=='undefined'){const current=items.find(i=>i.kind==='article' && i.name===currentId && i.brand===ACTIVE_EDITOR.key);currentButton.textContent='Заметки'+(current?.openCount?' · '+current.openCount:'');}
  if(previous!==null && data.openCount>previous && typeof toast==='function')toast('Появилась новая обратная связь к вашим материалам');previous=data.openCount;
  if(dialog.open && !body.querySelector('iframe'))render();
 }catch{}}
 function render(){body.innerHTML=items.length?items.map(i=>`<article class="feedback-inbox-card"><div><strong>${esc(i.title||'Без названия')}</strong><small>${i.kind==='email'?'Email-проект':i.brand==='hasl'?'ХАСЛ':'OUTMAX'} · ${i.openCount} открытых · ${i.totalCount} обсуждений</small></div>${i.previewUrl?`<button type="button" data-preview="${esc(i.previewUrl)}">Обсуждения</button>`:'<small>Ссылка отозвана. Создайте новый предпросмотр материала.</small>'}</article>`).join(''):'<p class="feedback-inbox-empty">Заметок пока нет. Коллеги могут оставить обратную связь после входа в удалённый предпросмотр.</p>';}
 function openPreview(url){body.innerHTML=`<iframe class="feedback-current-frame" src="${esc(url)}" title="Предпросмотр и заметки"></iframe>`;if(!dialog.open)dialog.showModal();}
 button.onclick=async()=>{menu.closest('details').open=false;body.innerHTML='<p class="feedback-inbox-empty" role="status">Загружаем обсуждения…</p>';dialog.showModal();await refresh();render();};
 body.onclick=event=>{const target=event.target.closest('[data-preview]');if(target)openPreview(target.dataset.preview);};
 const remote=document.querySelector('#remote-preview');if(remote && window.__EDITOR_SERVER_FIRST__){const current=document.createElement('button');current.id='article-feedback';current.type='button';current.textContent='Заметки';remote.before(current);current.onclick=async()=>{current.disabled=true;try{if(!await save())return;const response=await fetch((window.__EDITOR_API_PREFIX__||'/editor-api')+'/preview/'+encodeURIComponent(currentId)+'?brand='+encodeURIComponent(ACTIVE_EDITOR.key),{method:'POST',credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось открыть заметки');openPreview(result.url);}catch(error){toast(error.message,true);}finally{current.disabled=false;}};}
 refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);
})();
