// Email Studio: NotiSend, preflight, UTM и личные email-проекты.
(() => {
  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];
  const dialog = q('#notisend-dialog');
  const projectsDialog = q('#email-projects-dialog');
  if (!dialog || !projectsDialog) return;

  const apiPrefix = window.__EDITOR_API_PREFIX__ || '/editor-api';
  const numberFormat = new Intl.NumberFormat('ru-RU');
  const state = {
    status:null,lists:[],campaigns:[],projects:[],loaded:false,
    senderProfiles:{},siteDrafts:{},profileSite:null,profilesPromise:null,profilesLoaded:false,
    currentProjectId:null,projectListIds:[],notisendCampaignId:null,
    campaignFingerprint:'',autosaveTimer:null,savingProject:false,
    archive:[],archiveComplete:false,archiveLoading:false,archiveLimit:30,archiveFailures:[],currentUser:null,reviewQueue:[],workflowStatus:'draft',reviewComment:'',reviewerName:'',previewUrl:null,sharedProjectId:null
  };
  let emailBackupReady = false;
  let emailBackupRestoring = false;
  let emailBackupTimer = null;
  let emailBackupRevision = 0;
  let emailBackupDirty = false;
  let emailBackupWrite = Promise.resolve();
  const emailBackupDb = new Promise(resolve => {
    try {
      const request = indexedDB.open('outmax-editor-backups',1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('backups')) request.result.createObjectStore('backups',{keyPath:'key'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  const openButton = q('#notisend-open');
  const createButton = q('#notisend-create-draft');
  const resultBox = q('#notisend-result');
  const errorBox = q('#notisend-error');
  const listsBox = q('#notisend-lists');
  const historyBox = q('#notisend-history');
  const projectsBox = q('#email-projects-list');
  const reviewBox = q('#email-review-list');
  const shareDialog = q('#email-share-dialog');
  const campaignStatisticsDialog = q('#campaign-statistics-dialog');
  const templateProfiles = {
    outmax_ru:{name:'OUTMAX HTML',brand:'outmax'},
    outmax_com:{name:'OUTMAX HTML',brand:'outmax'},
    hasl_ru:{name:'ХАСЛ HTML',brand:'hasl'},
    hasle_com:{name:'HASLESTORE HTML',brand:'haslestore'}
  };

  function templateProfile(site = activeSite) {
    return templateProfiles[site] || templateProfiles.outmax_ru;
  }

  function syncTemplateProfile(publishedCount = null) {
    const profile = templateProfile();
    const card = q('#notisend-template-card');
    if (!card) return;
    card.dataset.brand = profile.brand;
    q('#notisend-template-name').textContent = profile.name;
    q('#notisend-template-note').textContent = 'Готовый код письма будет передан в новый черновик целиком.';
    const localCount = window.emailProjectBridge?.assetEntries?.().length || 0;
    q('#notisend-template-assets').textContent = publishedCount == null
      ? localCount
        ? `Локальных изображений: ${localCount} · опубликуем автоматически перед передачей.`
        : 'Все изображения уже используют публичные адреса.'
      : publishedCount
        ? `Опубликовано изображений: ${publishedCount} · адреса постоянные и доступны NotiSend.`
        : 'Изображения уже готовы для NotiSend.';
  }

  function emailBackupKey() {
    return `email:${state.currentUser?.id || localStorage.getItem('outmax-last-editor-user') || 'local'}`;
  }
  async function readEmailBackup() {
    try {
      const db = await emailBackupDb;
      if (!db) throw new Error('IndexedDB unavailable');
      return await new Promise((resolve,reject) => {
        const request = db.transaction('backups','readonly').objectStore('backups').get(emailBackupKey());
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      try {return JSON.parse(localStorage.getItem(`outmax-backup:${emailBackupKey()}`)) || null;}
      catch {return null;}
    }
  }
  async function writeEmailBackup(record) {
    try {
      const db = await emailBackupDb;
      if (!db) throw new Error('IndexedDB unavailable');
      await new Promise((resolve,reject) => {
        const transaction = db.transaction('backups','readwrite');
        transaction.objectStore('backups').put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) {
      try {localStorage.setItem(`outmax-backup:${record.key}`,JSON.stringify({...record,assetEntries:[]}));}
      catch {throw error;}
    }
  }
  function emailBackupTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  function setEmailBackupStatus(value,savedAt='') {
    const node=q('#email-backup-status');
    if(!node)return;
    const time=emailBackupTime(savedAt);
    node.dataset.state=value;
    node.textContent=value==='saving'?'Резервная копия · сохраняю'
      :value==='saved'?`Резервная копия${time?` · ${time}`:''}`
      :value==='restored'?`Восстановлено${time?` · ${time}`:''}`
      :value==='error'?'Копия не сохранена':'Резервная копия';
  }
  function emailBackupSnapshot(dirty=true) {
    const bridge=window.emailProjectBridge;
    const snapshot=bridge.snapshot();
    return {
      key:emailBackupKey(),version:1,editor:'email',dirty,revision:emailBackupRevision,savedAt:new Date().toISOString(),
      currentProjectId:state.currentProjectId,
      project:{
        filename:q('#filename').value.trim(),subject:q('#subject').value.trim(),preheader:q('#preheader').value.trim(),
        site:snapshot.site,canvasHtml:snapshot.canvasHtml,importState:snapshot.importState,
        fromEmail:q('#notisend-from-email').value.trim(),fromName:q('#notisend-from-name').value.trim(),testEmail:q('#notisend-test-email').value.trim(),
        listIds:selectedListIds().length?selectedListIds():state.projectListIds,utm:currentUtm(),
        notisendCampaignId:state.notisendCampaignId,campaignFingerprint:state.campaignFingerprint,
        workflowStatus:state.workflowStatus,reviewComment:state.reviewComment,reviewerName:state.reviewerName
      },
      assetEntries:bridge.assetEntries()
    };
  }
  function persistEmailBackup(dirty=true) {
    if(!emailBackupReady||emailBackupRestoring||!window.emailProjectBridge)return Promise.resolve();
    emailBackupDirty=dirty;
    const record=emailBackupSnapshot(dirty);
    emailBackupWrite=emailBackupWrite.catch(()=>{}).then(()=>writeEmailBackup(record));
    return emailBackupWrite.then(()=>{if(record.revision===emailBackupRevision)setEmailBackupStatus('saved',record.savedAt);})
      .catch(()=>setEmailBackupStatus('error'));
  }
  function scheduleEmailBackup() {
    if(!emailBackupReady||emailBackupRestoring)return;
    emailBackupRevision+=1;emailBackupDirty=true;setEmailBackupStatus('saving');
    clearTimeout(emailBackupTimer);
    emailBackupTimer=setTimeout(()=>{emailBackupTimer=null;persistEmailBackup(true);},650);
  }
  function markEmailBackupSynced({revision=emailBackupRevision,force=false}={}) {
    if(!emailBackupReady)return Promise.resolve();
    clearTimeout(emailBackupTimer);emailBackupTimer=null;
    return persistEmailBackup(!(force||revision===emailBackupRevision));
  }
  async function restoreEmailBackup() {
    if(emailBackupReady)return;
    const record=await readEmailBackup();
    if(record?.project?.canvasHtml&&window.emailProjectBridge) {
      emailBackupRestoring=true;state.restoringProject=true;
      try {
        const assets=Array.isArray(record.assetEntries)?record.assetEntries.filter(entry=>Array.isArray(entry)&&entry[1] instanceof Blob):[];
        await window.emailProjectBridge.restore(record.project,assets);
        state.currentProjectId=record.currentProjectId||null;
        state.editorDirty=Boolean(record.dirty);
        state.projectListIds=(record.project.listIds||[]).map(String);
        state.notisendCampaignId=record.project.notisendCampaignId||null;
        state.campaignFingerprint=record.project.campaignFingerprint||'';
        state.workflowStatus=record.project.workflowStatus||'draft';
        state.reviewComment=record.project.reviewComment||'';
        state.reviewerName=record.project.reviewerName||'';
        state.profileSite=record.project.site||'outmax_ru';
        q('#notisend-from-email').value=record.project.fromEmail||'';
        q('#notisend-from-name').value=record.project.fromName||'';
        q('#notisend-test-email').value=record.project.testEmail||'';
        q('#notisend-utm-enabled').checked=Boolean(record.project.utm?.enabled);
        q('#notisend-utm-source').value=record.project.utm?.source||'notisend';
        q('#notisend-utm-medium').value=record.project.utm?.medium||'email';
        q('#notisend-utm-campaign').value=record.project.utm?.campaign||projectSlug(record.project.filename);
        emailBackupRevision=Number(record.revision)||0;emailBackupDirty=Boolean(record.dirty);
        q('#email-project-status').textContent=record.dirty?'Восстановлены несохранённые изменения':'Восстановлена последняя рабочая версия';
        renderWorkflowState();updateLinkedCampaign();setEmailBackupStatus('restored',record.savedAt);
      } finally {state.restoringProject=false;emailBackupRestoring=false;}
    }
    emailBackupReady=true;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g,char => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]
    ));
  }
  function russianForm(value,forms) {
    const count=Math.abs(Number(value)||0),lastTwo=count%100,last=count%10;
    return lastTwo>=11&&lastTwo<=14?forms[2]:last===1?forms[0]:last>=2&&last<=4?forms[1]:forms[2];
  }
  const russianCount=(value,forms)=>`${numberFormat.format(Math.abs(Number(value)||0))} ${russianForm(value,forms)}`;
  const campaignCount=value=>russianCount(value,['отправка','отправки','отправок']);
  const recipientForms=['получатель письма','получателя писем','получателей писем'];
  const recipientCount=value=>russianCount(value,recipientForms);
  const accountIconPaths = {
    campaigns:'M3 4h18v4H3ZM5 8v13h14V8M9 12h6M9 16h6',
    articles:'M5 3h10l4 4v14H5ZM15 3v5h5M8 12h8M8 16h8',
    review:'M4 4h16v13H8l-4 3ZM8 8h8M8 12h5',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8',
    info:'M12 17v-6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    logout:'M9 21H3V3h6M16 17l5-5-5-5M8 12h13'
  };
  const accountIcon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${accountIconPaths[name]}"/></svg>`;
  for (const [selector,label,name] of [
    ['#email-account-projects','Мои рассылки','campaigns'],
    ['#email-account-menu a[href="/?view=articles"]','Все статьи','articles'],
    ['#email-account-review','Согласование','review'],
    ['#email-account-users','Пользователи','users'],
    ['#email-account-about','О редакторе','info'],
    ['#email-account-logout','Выйти','logout']
  ]) {
    const item=q(selector);
    if(item)item.innerHTML=accountIcon(name)+`<span>${label}</span>`;
  }
  function projectSlug(value) {
    return String(value || '').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,70) || 'rassylka';
  }

  async function request(path,options = {}) {
    const response = await fetch(`${apiPrefix}${path}`,{
      credentials:'same-origin',
      headers:{'Content-Type':'application/json',...(options.headers || {})},
      ...options
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* Пустой ответ. */ }
    if (!response.ok) throw new Error(payload.error || 'Ошибка сервера');
    return payload;
  }
  let presenceTimer=null;
  function pingPresence() {
    return fetch(`${apiPrefix}/presence`,{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{});
  }
  function startPresenceHeartbeat() {
    if(presenceTimer)return;
    pingPresence();
    presenceTimer=setInterval(pingPresence,25000);
    window.addEventListener('focus',pingPresence);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pingPresence();});
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(typeof value === 'number' ? value * 1000 : value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('ru-RU',{
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    }).format(parsed);
  }

  function stateLabel(value) {
    return ({
      draft:'Черновик',pending:'В очереди',delayed:'Запланирована',
      sending:'Отправляется',completed:'Завершена',canceled:'Отменена',
      stopped:'Остановлена',archived:'Архив'
    })[value] || value || '—';
  }

  function workflowLabel(value) {
    return ({draft:'Черновик',review:'На проверке',approved:'Одобрено',changes:'Нужны правки',notisend:'В NotiSend'})[value] || 'Черновик';
  }

  function setError(message = '') {
    errorBox.hidden = !message;
    errorBox.textContent = message;
  }

  function renderWorkflowState() {
    const node = q('#email-workflow-state');
    const status = state.workflowStatus || 'draft';
    node.dataset.status = status;
    const details = {
      draft:'Сохраните проект, чтобы поделиться ссылкой или отправить на согласование.',
      review:'Проект ожидает решения модератора или администратора.',
      approved:'Проект согласован и готов к передаче в NotiSend.',
      changes:state.reviewComment || 'Согласующий запросил доработку.',
      notisend:state.notisendCampaignId ? `Привязан Campaign #${state.notisendCampaignId}.` : 'Проект передан в NotiSend.'
    };
    node.innerHTML = `<strong>${escapeHtml(workflowLabel(status))}</strong><span>${escapeHtml(details[status] || details.draft)}</span>`;
    const submit = q('#submit-email-review');
    submit.disabled = !state.currentProjectId || status === 'notisend';
    submit.textContent = status === 'review' ? 'Снять с проверки' : status === 'approved' ? 'На проверку снова' : 'На проверку';
  }

  function renderAccountMenu() {
    const user=state.currentUser;if(!user)return;
    const roles={admin:'Администратор',moderator:'Модератор',editor:'Редактор'};
    const trigger=q('#email-account-name');
    trigger.innerHTML=`<span class="account-avatar">${escapeHtml((user.name || '?').trim()[0])}</span><span class="account-greeting">Привет, <strong>${escapeHtml(user.name)}</strong></span><span class="account-switcher-chevron" aria-hidden="true"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg></span>`;
    trigger.title=`Привет, ${user.name}`;
    q('#email-account-meta').innerHTML=`<strong>${escapeHtml(user.name)}</strong><span>${roles[user.role] || 'Редактор'}</span>`;
    q('#email-account-users').hidden=!user.admin;
    q('#email-account-review').hidden=!(user.admin || user.role==='moderator');
    q('#email-account-menu').hidden=false;
  }
  function closeAccountMenu() {q('#email-account-menu').open=false;}
  function openEmailAbout() {
    let about=q('#email-about-dialog');
    if(!about){
      about=document.createElement('dialog');about.id='email-about-dialog';about.className='notisend-dialog email-about-dialog';about.setAttribute('aria-labelledby','email-about-title');
      about.innerHTML=`<div class="notisend-shell"><header class="notisend-head"><div class="notisend-head-copy"><span class="eyebrow">СПРАВКА</span><h2 id="email-about-title">О редакторе email-рассылок</h2><p>Рабочая область OUTMAX и ХАСЛ для подготовки, проверки и отправки писем.</p></div><button type="button" class="notisend-close" aria-label="Закрыть">×</button></header><div class="notisend-body"><div class="notisend-section"><h3>Как работать</h3><p>Редактируйте письмо прямо на холсте, добавляйте блоки слева и меняйте их порядок в структуре письма.</p></div><div class="notisend-section"><h3>Отмена действий</h3><p>Используйте Ctrl/⌘ + Z для шага назад и Ctrl/⌘ + Shift + Z для шага вперёд.</p></div><div class="notisend-section"><h3>Safari на Mac</h3><p>Редактор открывается как приложение в обычном режиме сайта — автоматический режим чтения для него больше не используется.</p></div></div></div>`;
      document.body.append(about);about.querySelector('.notisend-close').onclick=()=>about.close();about.onclick=event=>{if(event.target===about)about.close();};
    }
    closeAccountMenu();about.showModal();
  }
  const headerMenus=qa('.topbar-left details');
  headerMenus.forEach(menu=>menu.addEventListener('toggle',()=>{
    if(menu.open)headerMenus.forEach(other=>{if(other!==menu)other.open=false;});
  }));
  document.addEventListener('click',event=>headerMenus.forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')headerMenus.forEach(menu=>menu.open=false);});
  q('#email-account-projects').addEventListener('click',()=>{closeAccountMenu();projectsDialog.showModal();activateProjectsTab('archive');});
  q('#email-account-about').addEventListener('click',openEmailAbout);
  q('#email-account-review').addEventListener('click',async()=>{
    closeAccountMenu();projectsDialog.showModal();activateProjectsTab('review');
  });
  q('#email-account-logout').addEventListener('click',async()=>{
    const button=q('#email-account-logout');button.disabled=true;
    try {
      if(!state.currentProjectId && state.editorDirty && !window.confirm('Сохранить новую рассылку и выйти из профиля?'))return;
      clearTimeout(state.autosaveTimer);
      if(state.projectSavePromise)await state.projectSavePromise;
      if(state.editorDirty)await saveProject({silent:true});
      await request('/logout',{method:'POST'});location.href='/login';
    } catch(error){toast(error.message,true);}
    finally{button.disabled=false;}
  });

  async function loadCurrentUser() {
    try {
      state.currentUser = await request('/me');
      localStorage.setItem('outmax-last-editor-user',state.currentUser.id);
      renderAccountMenu();
      startPresenceHeartbeat();
      const reviewer = Boolean(state.currentUser?.admin || state.currentUser?.role === 'moderator');
      q('#email-review-tab').hidden = !reviewer;
      if (reviewer) await loadReviewQueue();
    } catch {
      state.currentUser = null;
      q('#email-review-tab').hidden = true;
    }
  }

  function senderSnapshot() {
    return {fromEmail:q('#notisend-from-email').value.trim(),
      fromName:q('#notisend-from-name').value.trim(),
      testEmail:q('#notisend-test-email').value.trim(),
      listIds:[...state.projectListIds]};
  }
  function renderSenderProfile() {
    const site = state.profileSite || activeSite;
    const name = emailSite(site).domain;
    const saved = state.senderProfiles[site];
    const current = senderSnapshot();
    const matches = saved && ['fromEmail','fromName','testEmail'].every(key => (saved[key] || '') === current[key])
      && JSON.stringify([...(saved.listIds || [])].sort()) === JSON.stringify([...current.listIds].sort());
    q('#sender-profile-status').textContent = saved
      ? `${matches ? 'Личный профиль' : 'Настройки отличаются от профиля'} · ${name}` : `Профиль ${name} ещё не сохранён`;
  }
  function applySenderProfile(site,{savedOnly=false} = {}) {
    if (!savedOnly && state.profileSite && state.profileSite !== site) {
      state.siteDrafts[state.profileSite] = senderSnapshot();
    }
    const profile = (!savedOnly && state.siteDrafts[site]) || state.senderProfiles[site] || {};
    state.profileSite = site;
    q('#notisend-from-email').value = profile.fromEmail || '';
    q('#notisend-from-name').value = profile.fromName || emailSite(site).brand;
    q('#notisend-test-email').value = profile.testEmail || '';
    state.projectListIds = (profile.listIds || []).map(String);
    renderLists();renderSenderProfile();updateCreateState();
  }
  function loadSenderProfiles() {
    if (state.profilesPromise) return state.profilesPromise;
    state.profilesPromise = request('/email-sender-profiles').then(payload => {
      state.senderProfiles = payload.profiles || {};
      state.profilesLoaded = true;
      // A project or user input loaded while this request ran has precedence.
      if (!state.currentProjectId && !state.profileSite) applySenderProfile(activeSite);
      renderSenderProfile();
    }).catch(error => {
      q('#sender-profile-status').textContent = 'Не удалось загрузить профили';
      throw error;
    }).finally(() => {state.profilesPromise=null;});
    return state.profilesPromise;
  }
  async function saveSenderProfile() {
    setError('');
    const button=q('#save-sender-profile');button.disabled=true;
    const site=state.profileSite || activeSite;
    const snapshot=senderSnapshot();
    try {
      const result=await request(`/email-sender-profiles/${encodeURIComponent(site)}`,{method:'PUT',body:JSON.stringify(snapshot)});
      state.senderProfiles[site]=result.profile;
      state.siteDrafts[site]=result.profile;
      renderSenderProfile();toast(`Профиль ${emailSite(site).domain} сохранён`);
    } catch(error) {setError(error.message);}
    finally {button.disabled=false;}
  }

  function currentUtm() {
    return {
      enabled:q('#notisend-utm-enabled').checked,
      source:q('#notisend-utm-source').value.trim(),
      medium:q('#notisend-utm-medium').value.trim(),
      campaign:q('#notisend-utm-campaign').value.trim() || projectSlug(q('#filename')?.value)
    };
  }

  function applyUtm(html) {
    const utm = currentUtm();
    if (!utm.enabled) return html;
    const doc = new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      try {
        const url = new URL(href);
        if (utm.source) url.searchParams.set('utm_source',utm.source);
        if (utm.medium) url.searchParams.set('utm_medium',utm.medium);
        if (utm.campaign) url.searchParams.set('utm_campaign',utm.campaign);
        link.setAttribute('href',url.href);
      } catch { /* Некорректная ссылка попадёт в preflight. */ }
    });
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }

  function finalHtml() {
    return applyUtm(emailDocument(activeSite));
  }

  function testHtml(html = finalHtml()) {
    return html
      .replaceAll('href="[%unsubscribe_link%]"','href="#"')
      .replaceAll("href='[%unsubscribe_link%]'","href='#'");
  }

  function projectRenderedHtml(assetManifest = {}) {
    let html = finalHtml();
    const site = window.emailProjectBridge?.site?.() || activeSite;
    for (const [assetPath,filename] of Object.entries(assetManifest)) {
      const exported = /^https?:\/\//i.test(assetPath) ? new URL(assetPath).href : absoluteBrandUrl(assetPath,site);
      html = html.split(exported).join(`__EMAIL_PROJECT_ASSET__/${encodeURIComponent(filename)}`);
    }
    return html;
  }

  async function fingerprint(value) {
    if (!crypto?.subtle) return String(value.length);
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  }

  function renderStatus() {
    const node = q('#notisend-status');
    const connected = Boolean(state.status?.connected);
    node.dataset.state = connected ? 'ok' : 'error';
    openButton.dataset.connected = connected ? 'true' : 'false';
    if (!state.status) {
      q('#notisend-status-text').textContent = 'Проверяем подключение…';
      return;
    }
    if (!connected) {
      q('#notisend-status-text').textContent = 'NotiSend не подключён';
      return;
    }
    const available = state.status.subscriberAvailable;
    const suffix = available == null ? '' : ` · доступно ${numberFormat.format(available)} подписчиков`;
    q('#notisend-status-text').textContent = `Подключено${suffix}`;
  }

  function selectedListIds() {
    return qa('input[name="notisend-list"]:checked').map(input => input.value);
  }

  function renderLists() {
    if (!state.lists.length) {
      listsBox.innerHTML = '<div class="notisend-empty">Группы получателей не найдены.</div>';
      updateCreateState();
      return;
    }
    listsBox.innerHTML = state.lists.map(item => `
      <label class="notisend-list-row">
        <input type="checkbox" name="notisend-list" value="${escapeHtml(item.id)}"
          ${state.projectListIds.includes(String(item.id)) ? 'checked' : ''}>
        <span>${escapeHtml(item.title)}</span>
      </label>`).join('');
    listsBox.querySelectorAll('input').forEach(input => {
      input.addEventListener('change',() => {
        state.projectListIds = selectedListIds();
        renderSenderProfile();
        updateCreateState();
        scheduleProjectAutosave();
      });
    });
    updateCreateState();
  }

  function campaignCard(item) {
    const stats = item.statistics || {};
    const date = item.sentAt || item.startAt;
    return `<article class="notisend-campaign">
      <div class="notisend-campaign-head">
        <div class="notisend-campaign-title">
          <strong>${escapeHtml(item.subject)}</strong>
          <small>#${escapeHtml(item.id)} · ${numberFormat.format(item.recipientsCount || 0)} получателей · ${escapeHtml(formatDate(date))}</small>
        </div>
        <span class="notisend-state" data-state="${escapeHtml(item.state)}">${escapeHtml(stateLabel(item.state))}</span>
      </div>
      <div class="notisend-stats">
        <div class="notisend-stat"><small>Доставлено</small><strong>${numberFormat.format(stats.delivered || 0)}</strong></div>
        <div class="notisend-stat"><small>Открыли</small><strong>${numberFormat.format(stats.uniqOpen || 0)}</strong></div>
        <div class="notisend-stat"><small>Кликнули</small><strong>${numberFormat.format(stats.uniqClick || 0)}</strong></div>
        <div class="notisend-stat"><small>Отписки</small><strong>${numberFormat.format(stats.unsubscription || 0)}</strong></div>
      </div>
    </article>`;
  }
  function renderHistory() {
    q('#notisend-history-count').textContent = state.campaigns.length
      ? numberFormat.format(state.campaigns.length) : '';
    historyBox.innerHTML = state.campaigns.length
      ? state.campaigns.map(campaignCard).join('')
      : '<div class="notisend-empty">Рассылок пока нет.</div>';
  }

  function updateLinkedCampaign() {
    const node = q('#notisend-linked-campaign');
    if (!state.notisendCampaignId) {
      node.hidden = true;
      createButton.textContent = 'Создать черновик в NotiSend';
      return;
    }
    node.hidden = false;
    node.innerHTML = `<strong>Связан с Campaign #${escapeHtml(state.notisendCampaignId)}</strong>
      <span>Изменения в редакторе не перезаписывают уже созданный черновик NotiSend.</span>`;
    createButton.textContent = 'Создать новый черновик';
  }

  function syncComposer() {
    q('#notisend-site').value = typeof activeSite === 'string' ? activeSite : 'outmax_ru';
    q('#notisend-subject').textContent = q('#subject')?.value.trim() || 'Без темы';
    q('#notisend-preheader').textContent = q('#preheader')?.value.trim() || 'Не заполнен';
    syncTemplateProfile();
    if (state.profilesLoaded && state.profileSite !== activeSite) applySenderProfile(activeSite);
    renderSenderProfile();
    if (!q('#notisend-utm-campaign').value) q('#notisend-utm-campaign').value = projectSlug(q('#filename')?.value);
    updateLinkedCampaign();
    updateCreateState();
  }
  function updateCreateState() {
    const ready = Boolean(
      state.status?.connected &&
      selectedListIds().length &&
      q('#notisend-from-email').value.trim() &&
      q('#subject')?.value.trim()
    );
    createButton.disabled = !ready;
    q('#notisend-send-test').disabled = !Boolean(
      state.status?.smtpConfigured &&
      q('#notisend-test-email').value.trim() &&
      q('#notisend-from-email').value.trim() &&
      q('#subject')?.value.trim()
    );
  }

  async function loadStatus() {
    try {
      state.status = await request('/notisend/status');
    } catch (error) {
      state.status = {connected:false,smtpConfigured:false};
      if (dialog.open) setError(error.message);
    }
    renderStatus();
    updateCreateState();
  }

  async function loadData(force = false) {
    if (state.loaded && !force) {
      syncComposer();
      return;
    }
    setError('');
    q('#notisend-loading').hidden = false;
    try {
      const [listsPayload,campaignPayload] = await Promise.all([
        request('/notisend/lists'),
        request('/notisend/campaigns?pageSize=25'),
        state.profilesLoaded && !force ? Promise.resolve() : loadSenderProfiles()
      ]);
      state.lists = listsPayload.items || [];
      state.campaigns = campaignPayload.items || [];
      state.loaded = true;
      renderLists();
      renderHistory();
      syncComposer();
    } catch (error) {
      setError(error.message);
      listsBox.innerHTML = '<div class="notisend-empty">Не удалось загрузить группы.</div>';
      historyBox.innerHTML = '<div class="notisend-empty">Не удалось загрузить историю.</div>';
    } finally {
      q('#notisend-loading').hidden = true;
    }
  }

  function preflightChecks({ignoreRecipients=false} = {}) {
    const checks = [];
    const subject = q('#subject').value.trim();
    const preheader = q('#preheader').value.trim();
    const html = finalHtml();
    const doc = new DOMParser().parseFromString(html,'text/html');
    const links = [...doc.querySelectorAll('a[href]')];
    const images = [...doc.querySelectorAll('img')];
    const assets = window.emailProjectBridge?.assetEntries?.() || [];
    const utm = currentUtm();

    checks.push(subject
      ? {level:subject.length > 60 ? 'warn' : 'pass',title:'Тема письма',detail:`${subject.length} символов${subject.length > 60 ? ' · длинная тема может обрезаться' : ''}`}
      : {level:'error',title:'Тема письма',detail:'Тема не заполнена'});
    checks.push(preheader
      ? {level:preheader.length > 160 ? 'warn' : 'pass',title:'Прехедер',detail:`${preheader.length} символов`}
      : {level:'warn',title:'Прехедер',detail:'Прехедер не заполнен'});
    checks.push({
      level:'pass',
      title:'Профиль NotiSend',
      detail:`${templateProfile().name} · готовый HTML попадёт в новый черновик целиком`
    });

    const htmlBytes = new TextEncoder().encode(html).length;
    checks.push({
      level:htmlBytes > 100 * 1024 ? 'warn' : 'pass',
      title:'Размер HTML',
      detail:`${numberFormat.format(Math.round(htmlBytes / 1024))} КБ${htmlBytes > 100 * 1024 ? ' · письмо близко к порогу обрезки некоторых клиентов' : ''}`
    });
    const badLinks = links.filter(link => !/^(?:https?:|mailto:|tel:|#|\[%[^%\]]+%\]$)/i.test(link.getAttribute('href') || ''));
    const insecureLinks = links.filter(link => /^http:\/\//i.test(link.getAttribute('href') || ''));
    checks.push({
      level:badLinks.length ? 'error' : insecureLinks.length ? 'warn' : 'pass',
      title:'Ссылки',
      detail:`${links.length} шт. · некорректных: ${badLinks.length} · HTTP: ${insecureLinks.length}`
    });

    if (utm.enabled) {
      const tracked = links.filter(link => /^https?:\/\//i.test(link.getAttribute('href') || ''));
      const missing = tracked.filter(link => {
        try {
          const url = new URL(link.getAttribute('href'));
          return !url.searchParams.get('utm_source') || !url.searchParams.get('utm_medium') || !url.searchParams.get('utm_campaign');
        } catch { return true; }
      });
      const utmReady = utm.source && utm.medium && utm.campaign && !missing.length;
      checks.push({
        level:utmReady ? 'pass' : 'error',
        title:'UTM-разметка',
        detail:utmReady ? `Размечено ссылок: ${tracked.length}` : 'Заполните source, medium и campaign'
      });
    } else checks.push({level:'warn',title:'UTM-разметка',detail:'Автоматическая UTM-разметка выключена'});

    checks.push({
      level:html.includes('[%unsubscribe_link%]') ? 'pass' : 'error',
      title:'Ссылка отписки',
      detail:html.includes('[%unsubscribe_link%]') ? 'Системный footer NotiSend добавлен' : 'Не найден обязательный маркер [%unsubscribe_link%]'
    });

    const missingAlt = images.filter(image => !image.getAttribute('alt')?.trim()).length;
    checks.push({
      level:missingAlt ? 'warn' : 'pass',
      title:'Alt изображений',
      detail:`Изображений: ${images.length} · без alt: ${missingAlt}`
    });
    const localSources = [...q('#canvas').querySelectorAll('img[data-email-src]')]
      .filter(image => !/^https?:\/\//i.test(image.dataset.emailSrc || ''));
    const localImages = localSources.length;
    const assetPaths = new Set(assets.map(([path]) => path));
    const missingLocal = localSources.filter(image => !assetPaths.has(image.dataset.emailSrc)).length;
    checks.push({
      level:missingLocal ? 'error' : 'pass',
      title:'Публичные изображения',
      detail:missingLocal ? `Не найдены локальные файлы: ${missingLocal}. Загрузите изображения заново.` : localImages
        ? `Локальных изображений: ${localImages}. Автоматически опубликуем перед тестом или передачей в NotiSend.`
        : 'Все изображения используют публичные адреса'
    });

    const heavyAssets = assets.filter(([,blob]) => blob.size > 1.5 * 1024 * 1024).length;
    if (assets.length) checks.push({
      level:heavyAssets ? 'warn' : 'pass',
      title:'Локальные файлы',
      detail:`${assets.length} шт. · тяжелее 1,5 МБ: ${heavyAssets}`
    });

    checks.push({
      level:q('#notisend-from-email').value.trim() ? 'pass' : 'error',
      title:'Отправитель',
      detail:q('#notisend-from-email').value.trim() || 'Email отправителя не указан'
    });
    if (!ignoreRecipients) checks.push({
      level:selectedListIds().length ? 'pass' : 'error',
      title:'Получатели',
      detail:selectedListIds().length ? `Выбрано групп: ${selectedListIds().length}` : 'Не выбрана группа получателей'
    });
    return checks;
  }

  function renderPreflight(options = {}) {
    const checks = preflightChecks(options);
    const errors = checks.filter(item => item.level === 'error').length;
    const warnings = checks.filter(item => item.level === 'warn').length;
    q('#notisend-preflight-caption').textContent = errors
      ? `Нужно исправить: ${errors} · предупреждений: ${warnings}`
      : warnings ? `Критических ошибок нет · предупреждений: ${warnings}` : 'Письмо готово';
    q('#notisend-preflight').innerHTML = checks.map(item => `
      <div class="preflight-row" data-level="${item.level}">
        <span class="preflight-icon" aria-hidden="true">${item.level === 'pass' ? '✓' : item.level === 'warn' ? '!' : '×'}</span>
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>
      </div>`).join('');
    return {checks,errors,warnings};
  }

  function projectPayload(assetManifest = {}) {
    const snapshot = window.emailProjectBridge.snapshot();
    return {
      filename:q('#filename').value.trim(),
      subject:q('#subject').value.trim(),
      preheader:q('#preheader').value.trim(),
      site:snapshot.site,
      canvasHtml:snapshot.canvasHtml,
      renderedHtml:projectRenderedHtml(assetManifest),
      importState:snapshot.importState,
      fromEmail:q('#notisend-from-email').value.trim(),
      fromName:q('#notisend-from-name').value.trim(),
      testEmail:q('#notisend-test-email').value.trim(),
      listIds:selectedListIds().length ? selectedListIds() : state.projectListIds,
      utm:currentUtm(),
      notisendCampaignId:state.notisendCampaignId,
      campaignFingerprint:state.campaignFingerprint,
      assets:assetManifest
    };
  }

  async function chooseProjectId() {
    if (state.currentProjectId) return state.currentProjectId;
    let id = projectSlug(q('#filename').value);
    if (!state.projects.length) await loadProjects();
    if (state.projects.some(item => item.id === id)) id += '-' + Date.now().toString(36).slice(-5);
    return id;
  }
  function saveProject(options = {}) {
    if (state.projectSavePromise) return state.projectSavePromise;
    state.projectSavePromise = saveProjectNow(options).finally(() => {state.projectSavePromise = null;});
    return state.projectSavePromise;
  }
  async function saveProjectNow({silent=false} = {}) {
    if (!window.emailProjectBridge) return state.currentProjectId;
    const saveRevision = state.editRevision || 0;
    const backupRevision = emailBackupRevision;
    state.savingProject = true;
    const statusNode = q('#email-project-status');
    const button = q('#save-email-project');
    const original = button.textContent;
    if (!silent) button.textContent = 'Сохраняем…';
    statusNode.textContent = 'Сохранение проекта…';
    try {
      const id = await chooseProjectId();
      await window.emailProjectBridge.cacheImages();
      const manifest = {};
      for (const [assetPath,blob] of window.emailProjectBridge.assetEntries()) {
        const uploaded = await request(`/email-projects/${encodeURIComponent(id)}/asset?path=${encodeURIComponent(assetPath)}`,{
          method:'POST',
          headers:{'Content-Type':blob.type || 'application/octet-stream'},
          body:blob
        });
        manifest[assetPath] = uploaded.filename;
      }
      const saved = await request(`/email-projects/${encodeURIComponent(id)}`,{
        method:'POST',
        body:JSON.stringify(projectPayload(manifest))
      });
      state.currentProjectId = saved.id;
      state.editorDirty = (state.editRevision || 0) !== saveRevision;
      await markEmailBackupSynced({revision:backupRevision});
      state.workflowStatus = saved.workflowStatus || state.workflowStatus || 'draft';
      state.reviewComment = saved.reviewComment || state.reviewComment || '';
      state.reviewerName = saved.reviewerName || state.reviewerName || '';
      statusNode.textContent = `Сохранено · ${formatDate(saved.savedAt)}`;
      renderWorkflowState();
      await loadProjects(true);
      return saved.id;
    } catch (error) {
      statusNode.textContent = 'Не удалось сохранить проект';
      if (!silent) toast(error.message,true);
      throw error;
    } finally {
      state.savingProject = false;
      button.textContent = original;
    }
  }
  function scheduleProjectAutosave() {
    state.editRevision = (state.editRevision || 0) + 1;
    state.editorDirty = true;
    scheduleEmailBackup();
    if (!state.currentProjectId) return;
    clearTimeout(state.autosaveTimer);
    q('#email-project-status').textContent = 'Есть несохранённые изменения';
    state.autosaveTimer = setTimeout(() => saveProject({silent:true}).catch(() => {}),1800);
  }

  async function loadProjects(force=false) {
    if (state.projects.length && !force) return state.projects;
    const payload = await request('/email-projects');
    state.projects = payload.items || [];
    renderProjects();
    return state.projects;
  }

  function renderProjects() {
    const search = q('#email-project-search').value.trim().toLowerCase();
    const items = state.projects.filter(item =>
      !search || String(item.subject || '').toLowerCase().includes(search) ||
      String(item.filename || '').toLowerCase().includes(search));
    projectsBox.innerHTML = items.length ? items.map(item => `
      <article class="email-project-card" data-project-id="${escapeHtml(item.id)}">
        <div class="email-project-card-copy">
          <strong>${escapeHtml(item.subject || 'Без темы')}</strong>
          <span>${escapeHtml(item.filename || item.id)} · ${escapeHtml(formatDate(item.savedAt))}</span>
          ${item.campaignId ? `<small>NotiSend #${escapeHtml(item.campaignId)}</small>` : ''}
          <span class="email-project-card-status" data-status="${escapeHtml(item.workflowStatus || 'draft')}">${escapeHtml(workflowLabel(item.workflowStatus || 'draft'))}</span>
        </div>
        <div class="email-project-card-actions">
          <button type="button" data-project-open="${escapeHtml(item.id)}">Открыть</button>
          <button type="button" data-project-preview="${escapeHtml(item.id)}">Ссылка</button>
          <button type="button" class="project-delete" data-project-delete="${escapeHtml(item.id)}">Удалить</button>
        </div>
      </article>`).join('') : '<div class="notisend-empty">Email-проекты не найдены.</div>';
  }
  async function openProject(id) {
    const project = await request(`/email-projects/${encodeURIComponent(id)}`);
    const assetEntries = [];
    for (const [assetPath,filename] of Object.entries(project.assets || {})) {
      const response = await fetch(`${apiPrefix}/email-projects/${encodeURIComponent(id)}/asset/${encodeURIComponent(filename)}`,{
        credentials:'same-origin'
      });
      if (response.ok) assetEntries.push([assetPath,await response.blob()]);
    }
    state.restoringProject = true;
    try {await window.emailProjectBridge.restore(project,assetEntries);}
    finally {state.restoringProject = false;}
    state.currentProjectId = project.id;
    state.editorDirty = false;
    state.projectListIds = (project.listIds || []).map(String);
    state.notisendCampaignId = project.notisendCampaignId || null;
    state.campaignFingerprint = project.campaignFingerprint || '';
    state.workflowStatus = project.workflowStatus || 'draft';
    state.reviewComment = project.reviewComment || '';
    state.reviewerName = project.reviewerName || '';
    state.previewUrl = null;
    q('#notisend-from-email').value = project.fromEmail || '';
    q('#notisend-from-name').value = project.fromName || '';
    q('#notisend-test-email').value = project.testEmail || '';
    state.profileSite = project.site || 'outmax_ru';
    state.siteDrafts[state.profileSite] = senderSnapshot();
    renderSenderProfile();
    q('#notisend-utm-enabled').checked = Boolean(project.utm?.enabled);
    q('#notisend-utm-source').value = project.utm?.source || 'notisend';
    q('#notisend-utm-medium').value = project.utm?.medium || 'email';
    q('#notisend-utm-campaign').value = project.utm?.campaign || projectSlug(project.filename);
    q('#email-project-status').textContent = `Открыт · ${formatDate(project.savedAt)}`;
    state.loaded = false;
    updateLinkedCampaign();
    renderWorkflowState();
    await markEmailBackupSynced({force:true});
    projectsDialog.close();
    if (dialog.open) await loadData(true);
  }

  async function deleteProject(button,id) {
    if (button.dataset.confirm !== '1') {
      button.dataset.confirm = '1';
      button.textContent = 'Ещё раз — удалить';
      setTimeout(() => {
        if (button.isConnected) { button.dataset.confirm=''; button.textContent='Удалить'; }
      },4000);
      return;
    }
    await request(`/email-projects/${encodeURIComponent(id)}`,{method:'DELETE'});
    if (state.currentProjectId === id) {
      state.currentProjectId = null;
      state.notisendCampaignId = null;
      state.campaignFingerprint = '';
      state.workflowStatus = 'draft';
      state.reviewComment = '';
      state.reviewerName = '';
      state.previewUrl = null;
      q('#email-project-status').textContent = 'Новый email-проект';
      renderWorkflowState();
    }
    await loadProjects(true);
  }

  function publicUrl(value) {
    return new URL(value,location.origin).href;
  }

  async function shareProject(id,{saveCurrent=false} = {}) {
    let projectId = id;
    if (saveCurrent || !projectId) projectId = await saveProject({silent:true});
    if (!projectId) throw new Error('Сначала сохраните email-проект');
    const preview = await request(`/email-projects/${encodeURIComponent(projectId)}/preview`,{method:'POST'});
    state.previewUrl = publicUrl(preview.url);
    state.sharedProjectId = projectId;
    q('#email-preview-link').value = state.previewUrl;
    if (projectsDialog.open) projectsDialog.close();
    shareDialog.showModal();
    return state.previewUrl;
  }

  async function changeOwnWorkflow() {
    const id = await saveProject({silent:true});
    if (!id) return;
    const action = state.workflowStatus === 'review' ? 'withdraw' : 'submit';
    const result = await request(`/email-projects/${encodeURIComponent(id)}/workflow`,{
      method:'POST',body:JSON.stringify({action})
    });
    state.workflowStatus = result.status || (action === 'submit' ? 'review' : 'draft');
    state.previewUrl = result.previewUrl ? publicUrl(result.previewUrl) : state.previewUrl;
    renderWorkflowState();
    await loadProjects(true);
    if (state.currentUser?.admin || state.currentUser?.role === 'moderator') await loadReviewQueue(true);
    if (action === 'submit') toast('Проект отправлен на согласование');
    else toast('Проект снят с проверки');
  }

  async function loadReviewQueue(force=false) {
    if (state.reviewQueue.length && !force) return state.reviewQueue;
    try {
      const payload = await request('/email-review-queue');
      state.reviewQueue = payload.items || [];
      renderReviewQueue();
      q('#email-review-count').textContent = state.reviewQueue.filter(item => item.status === 'review').length || '';
      return state.reviewQueue;
    } catch (error) {
      state.reviewQueue = [];
      reviewBox.innerHTML = `<div class="notisend-empty">${escapeHtml(error.message)}</div>`;
      return [];
    }
  }

  function renderReviewQueue() {
    reviewBox.innerHTML = state.reviewQueue.length ? state.reviewQueue.map(item => `
      <article class="email-review-card" data-review-owner="${escapeHtml(item.ownerId)}" data-review-id="${escapeHtml(item.id)}">
        <div class="email-review-card-head">
          <div class="email-review-card-copy">
            <strong>${escapeHtml(item.subject)}</strong>
            <span>${escapeHtml(item.ownerName)} · ${escapeHtml(formatDate(item.submittedAt || item.savedAt))}</span>
            ${item.reviewComment ? `<small>Комментарий: ${escapeHtml(item.reviewComment)}</small>` : ''}
          </div>
          <span class="email-project-card-status" data-status="${escapeHtml(item.status)}">${escapeHtml(workflowLabel(item.status))}</span>
        </div>
        <textarea class="email-review-comment" placeholder="Комментарий редактору">${escapeHtml(item.reviewComment || '')}</textarea>
        <div class="email-review-actions">
          ${item.previewUrl ? `<a href="${escapeHtml(publicUrl(item.previewUrl))}" target="_blank" rel="noopener">Просмотр</a>` : ''}
          <button type="button" class="approve" data-review-action="approve">Одобрить</button>
          <button type="button" class="changes" data-review-action="changes">На доработку</button>
        </div>
      </article>`).join('') : '<div class="notisend-empty">В очереди согласования пока пусто.</div>';
  }

  async function reviewProject(card,action) {
    const owner = card.dataset.reviewOwner;
    const id = card.dataset.reviewId;
    const comment = card.querySelector('.email-review-comment')?.value.trim() || '';
    const result = await request(`/email-review-queue/${encodeURIComponent(owner)}/${encodeURIComponent(id)}/workflow`,{
      method:'POST',body:JSON.stringify({action,comment})
    });
    toast(action === 'approve' ? 'Рассылка одобрена' : 'Отправлено на доработку');
    await loadReviewQueue(true);
    return result;
  }

  function activateProjectsTab(name) {
    qa('[data-projects-tab]').forEach(button => {
      button.setAttribute('aria-selected',String(button.dataset.projectsTab === name));
    });
    qa('[data-projects-panel]').forEach(panel => {
      panel.hidden = panel.dataset.projectsPanel !== name;
    });
    if (name === 'review') loadReviewQueue(true);
    if (name === 'archive') loadCampaignArchive();
  }

  const brandNames={outmax:'OUTMAX',hasl:'ХАСЛ',haslestore:'HASLESTORE',unassigned:'Уточнить бренд',other:'Другие'};
  function campaignTime(item) {
    const value=item.sentAt || item.startAt;
    if(typeof value==='number')return value*1000;
    const match=String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) UTC$/);
    if(match)return Date.UTC(+match[3],+match[2]-1,+match[1],+match[4],+match[5]);
    return Date.parse(value)||0;
  }
  function campaignRecipients(item) {
    const stats=item.statistics || {};
    return Math.max(Number(item.recipientsCount)||0,(Number(stats.delivered)||0)+(Number(stats.bounced)||0)+(Number(stats.delivering)||0));
  }
  function metric(count,base,label,kind='open',delta=null) {
    const percent=base ? count/base*100 : null;
    const text=percent===null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(percent)+'%';
    const difference=Number.isFinite(delta)?`<small class="campaign-delta ${delta>0?'up':delta<0?'down':'same'}">${delta>0?'+':''}${numberFormat.format(delta)} к прошлой</small>`:'';
    return `<div class="campaign-metric ${kind}"><span class="campaign-ring" style="--rate:${Math.min(100,percent||0)}%"><span>${text}</span></span><span><strong>${numberFormat.format(count)}</strong><small>${label}</small>${difference}</span></div>`;
  }
  function campaignGroups(items) {
    const sorted=[...items].sort((a,b)=>campaignTime(b)-campaignTime(a)||Number(b.id)-Number(a.id));
    const groups=[];
    for(const item of sorted){
      const subject=String(item.subject).toLocaleLowerCase('ru').replace(/\[[^\]]*\]/g,'').replace(/повтор(?:ная)?(?: рассылка)?[ :—-]*/g,'').replace(/[^\p{L}\p{N}]/gu,'');
      const brand=item.brand || 'other', time=campaignTime(item);
      let group=brand==='unassigned'?null:groups.find(g=>g.brand===brand && g.key===subject && time && g.time-time<=7*86400000);
      if(!group){group={brand,key:subject,time,items:[]};groups.push(group);}
      group.items.push(item);
    }
    return groups;
  }
  function campaignTotals(items) {
    return items.filter(i=>Number(i.statistics?.delivered)>0 || Number(i.sentAt)>0).reduce((total,item)=>{
      const recipients=campaignRecipients(item),stats=item.statistics||{};
      const opens=Number(stats.uniqOpen)||0,clicks=Number(stats.uniqClick)||0,complaints=(Number(stats.spam)||0)+(Number(stats.unsubscription)||0);
      total.recipients+=recipients;total.opens+=opens;total.clicks+=clicks;total.complaints+=complaints;
      total.openPercentSum+=recipients?opens/recipients*100:0;
      total.clickPercentSum+=recipients?clicks/recipients*100:0;
      total.complaintPercentSum+=recipients?complaints/recipients*100:0;
      total.count++;
      return total;
    },{recipients:0,opens:0,clicks:0,complaints:0,openPercentSum:0,clickPercentSum:0,complaintPercentSum:0,count:0});
  }
  function isSentCampaign(item) {
    const stats=item.statistics || {};
    return Boolean(item.sentAt || Number(stats.delivered) || Number(stats.bounced) || Number(stats.delivering));
  }
  function campaignStatistics(items) {
    const sentItems=items.filter(isSentCampaign);
    const result={recipients:0,delivered:0,bounced:0,delivering:0,uniqOpen:0,totalOpen:0,uniqClick:0,totalClick:0,unsubscription:0,spam:0,lastOpenAt:null,lastClickAt:null,count:sentItems.length};
    const latest=(current,value)=>{
      if(!value)return current;
      const numeric=typeof value==='number'?value:Date.parse(value)/1000;
      return Number.isFinite(numeric) && (!current || numeric>current) ? numeric : current;
    };
    sentItems.forEach(item=>{
      const stats=item.statistics || {};
      result.recipients+=campaignRecipients(item);
      ['delivered','bounced','delivering','uniqOpen','totalOpen','uniqClick','totalClick','unsubscription','spam'].forEach(key=>result[key]+=Number(stats[key])||0);
      result.lastOpenAt=latest(result.lastOpenAt,stats.lastOpenAt);
      result.lastClickAt=latest(result.lastClickAt,stats.lastClickAt);
    });
    return result;
  }
  function rateText(count,base) {
    return base ? new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(count/base*100)+'%' : '—';
  }
  function campaignDetailMetric(count,base,label,kind='open') {
    const rate=base ? count/base*100 : 0;
    return `<div class="campaign-detail-metric ${kind}"><span class="campaign-ring" style="--rate:${Math.min(100,rate)}%"><span>${escapeHtml(rateText(count,base))}</span></span><span><strong>${numberFormat.format(count)}</strong><small>${escapeHtml(label)}</small></span></div>`;
  }
  function campaignActivity(value,label,date=null) {
    return `<div class="campaign-activity"><strong>${date?escapeHtml(formatDate(value)):numberFormat.format(value||0)}</strong><small>${escapeHtml(label)}</small></div>`;
  }
  function openCampaignStatistics(items) {
    if(!campaignStatisticsDialog)return;
    const sentItems=items.filter(isSentCampaign).sort((a,b)=>campaignTime(a)-campaignTime(b)||Number(a.id)-Number(b.id));
    if(!sentItems.length)return;
    const grouped=sentItems.length>1,stats=campaignStatistics(sentItems),base=stats.delivered || stats.recipients;
    const subject=sentItems[0].subject || 'Без темы';
    const deliveryRate=stats.recipients ? stats.delivered/stats.recipients*100 : 0;
    q('#campaign-statistics-eyebrow').textContent=grouped?'СУММАРНАЯ СТАТИСТИКА':'СТАТИСТИКА ОТПРАВКИ';
    q('#campaign-statistics-title').textContent=subject;
    q('#campaign-statistics-caption').textContent=grouped
      ? `${campaignCount(sentItems.length)} · ${formatDate(campaignTime(sentItems[0])/1000)} — ${formatDate(campaignTime(sentItems.at(-1))/1000)}`
      : `Campaign #${sentItems[0].id} · ${formatDate(campaignTime(sentItems[0])/1000)}`;
    const deliveryGap=Math.max(0,stats.recipients-stats.delivered-stats.bounced-stats.delivering);
    const reportLink=grouped?'':`<a class="campaign-notisend-link" href="https://app.notisend.ru/mailer/campaigns/${encodeURIComponent(sentItems[0].id)}" target="_blank" rel="noopener">Полный отчёт в NotiSend ↗</a>`;
    const breakdown=grouped?`<section class="campaign-breakdown"><div class="campaign-stat-section-head"><div><span class="eyebrow">ОТПРАВКИ</span><h3>Вклад каждого письма</h3></div><small>Кликните номер, чтобы открыть полный отчёт NotiSend</small></div><div class="campaign-breakdown-table" role="table"><div class="campaign-breakdown-row campaign-breakdown-labels" role="row"><span>Письмо</span><span>Доставлено</span><span>Открыли</span><span>Перешли</span></div>${sentItems.map((item,index)=>{const itemStats=item.statistics||{},itemBase=Number(itemStats.delivered)||campaignRecipients(item);return `<div class="campaign-breakdown-row" role="row"><span><a href="https://app.notisend.ru/mailer/campaigns/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">#${escapeHtml(item.id)}</a><small>${index?'Повтор':'Первая отправка'} · ${escapeHtml(formatDate(campaignTime(item)/1000))}</small></span><strong>${numberFormat.format(itemStats.delivered||0)}</strong><strong>${numberFormat.format(itemStats.uniqOpen||0)} <small>${escapeHtml(rateText(Number(itemStats.uniqOpen)||0,itemBase))}</small></strong><strong>${numberFormat.format(itemStats.uniqClick||0)} <small>${escapeHtml(rateText(Number(itemStats.uniqClick)||0,itemBase))}</small></strong></div>`;}).join('')}</div></section>`:'';
    q('#campaign-statistics-body').innerHTML=`
      <section class="campaign-stat-overview">
        <div class="campaign-delivery-ring" style="--rate:${Math.min(100,deliveryRate)}%"><span><strong>${numberFormat.format(stats.recipients)}</strong><small>Отправлено</small></span></div>
        <div class="campaign-delivery-list">
          <div class="delivered"><strong>${numberFormat.format(stats.delivered)}</strong><small>Доставлено · ${escapeHtml(rateText(stats.delivered,stats.recipients))}</small></div>
          <div class="bounced"><strong>${numberFormat.format(stats.bounced)}</strong><small>Не доставлено · ${escapeHtml(rateText(stats.bounced,stats.recipients))}</small></div>
          ${stats.delivering?`<div><strong>${numberFormat.format(stats.delivering)}</strong><small>Доставляется</small></div>`:''}
          ${deliveryGap?`<div><strong>${numberFormat.format(deliveryGap)}</strong><small>Без финального статуса</small></div>`:''}
        </div>
        <div class="campaign-detail-grid">
          ${campaignDetailMetric(stats.uniqOpen,base,'Уникальных просмотров')}
          ${campaignDetailMetric(stats.uniqClick,base,'Уникальных переходов','click')}
          ${campaignDetailMetric(stats.unsubscription,base,'Отписались','unsubscribe')}
          ${campaignDetailMetric(stats.spam,base,'Нажали спам','spam')}
        </div>
      </section>
      <section class="campaign-activity-section">
        <div class="campaign-stat-section-head"><div><span class="eyebrow">АКТИВНОСТЬ</span><h3>Открытия и переходы</h3></div>${reportLink}</div>
        <div class="campaign-activity-grid">
          ${campaignActivity(stats.totalOpen,'Всего просмотров')}
          ${campaignActivity(stats.lastOpenAt,'Последний просмотр',true)}
          ${campaignActivity(stats.totalClick,'Всего переходов')}
          ${campaignActivity(stats.lastClickAt,'Последний переход',true)}
        </div>
      </section>
      ${breakdown}
      <p class="campaign-stat-footnote">${grouped?'Показатели сложены по отправкам. Получатель, попавший в первое и повторное письмо, учитывается в каждой отправке. ':''}Проценты открытий, переходов, отписок и спама рассчитаны от доставленных писем. Детальные разрезы по почтовым службам, ссылкам и географии доступны в полном отчёте NotiSend.</p>`;
    campaignStatisticsDialog.showModal();
  }
  function summedPercent(total,key,label) {
    const value=total.count?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(total[key])+'%':'—';
    return `<span class="campaign-percent-sum" title="Сумма процентов ${escapeHtml(label)} отдельных отправок"><strong>${value}</strong><small>Суммарный</small></span>`;
  }
  function archiveRow(item,index,total,previous=null) {
    const stats=item.statistics||{},base=campaignRecipients(item),sent=!!item.sentAt;
    const mayLabel=state.currentUser?.admin || state.currentUser?.role==='moderator';
    const brand=item.brand || 'other';
    const previousStats=previous?.statistics||null;
    const delta=key=>previousStats ? (Number(stats[key])||0)-(Number(previousStats[key])||0) : null;
    const complaintDelta=previousStats ? (Number(stats.spam)||0)+(Number(stats.unsubscription)||0)-(Number(previousStats.spam)||0)-(Number(previousStats.unsubscription)||0) : null;
    return `<article class="campaign-archive-row${sent?' is-clickable':''}" data-campaign-id="${escapeHtml(item.id)}" ${sent?'role="button" tabindex="0" aria-haspopup="dialog" aria-label="Открыть статистику отправки"':''}>
      <div class="campaign-thumb">${item.previewImage?`<img src="${escapeHtml(item.previewImage)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:escapeHtml(brandNames[brand]?.slice(0,1))}</div>
      <div class="campaign-archive-copy"><strong>${escapeHtml(item.subject)}</strong><small>#${escapeHtml(item.id)} · ${escapeHtml(total>1 ? index===0?'Первая отправка':'Повтор / та же тема':'')}${total>1?' · ':''}${escapeHtml(stateLabel(item.state))}</small><small>${sent?'Отправлена':item.startAt?'Запланирована':'Дата'}: ${escapeHtml(formatDate(campaignTime(item)/1000 || null))}</small>
        ${mayLabel?`<label class="campaign-brand-label"><span>Бренд</span><select data-campaign-brand="${escapeHtml(item.id)}" aria-label="Бренд рассылки ${escapeHtml(item.id)}">${Object.entries(brandNames).map(([key,name])=>`<option value="${key}" ${key===brand?'selected':''}>${name}</option>`).join('')}</select></label>`:`<small>${escapeHtml(brandNames[brand])}</small>`}
      </div>
      <div class="campaign-recipients"><strong>${numberFormat.format(base)}</strong><small>Получателей</small></div>
      <div class="campaign-row-stats">${metric(Number(stats.uniqOpen)||0,sent?base:0,'Просмотров','open',delta('uniqOpen'))}${metric(Number(stats.uniqClick)||0,sent?base:0,'Переходов','click',delta('uniqClick'))}${metric((Number(stats.spam)||0)+(Number(stats.unsubscription)||0),sent?base:0,'Жалобы / отписки','spam',complaintDelta)}</div>
      <details class="campaign-extra"><summary aria-label="Дополнительная статистика"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="m48 96 80 80 80-80" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div>Доставлено: ${numberFormat.format(stats.delivered||0)} · Не доставлено: ${numberFormat.format(stats.bounced||0)} · Отписки: ${numberFormat.format(stats.unsubscription||0)} · Все открытия: ${numberFormat.format(stats.totalOpen||0)}</div></details>
    </article>`;
  }
  function comparisonRange(prefix) {
    const fromValue=q(`#campaign-compare-${prefix}-from`).value,toValue=q(`#campaign-compare-${prefix}-to`).value;
    const from=fromValue?new Date(`${fromValue}T00:00:00`).getTime():null;
    const to=toValue?new Date(`${toValue}T23:59:59.999`).getTime():null;
    const complete=Boolean(fromValue && toValue),valid=complete && from<=to;
    const label=complete?`${fromValue.split('-').reverse().join('.')} — ${toValue.split('-').reverse().join('.')}`:'Укажите обе даты';
    return {from,to,fromValue,toValue,complete,valid,label};
  }
  function campaignComparison() {
    const a=comparisonRange('a'),b=comparisonRange('b');
    return {a,b,active:a.complete || b.complete,valid:a.valid && b.valid};
  }
  function campaignInInterval(item,interval) {
    const time=campaignTime(item);
    return interval.valid && time>=interval.from && time<=interval.to;
  }
  function inputDate(date) {
    const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }
  function calendarMonth(offset) {
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth()+offset,1),last=new Date(now.getFullYear(),now.getMonth()+offset+1,0);
    return {from:inputDate(first),to:inputDate(last)};
  }
  function setComparisonRange(prefix,range) {
    q(`#campaign-compare-${prefix}-from`).value=range.from;
    q(`#campaign-compare-${prefix}-to`).value=range.to;
  }
  function applyComparisonPreset(name) {
    if(name==='months'){
      setComparisonRange('a',calendarMonth(-2));setComparisonRange('b',calendarMonth(-1));
    }else if(name==='year'){
      const recent=calendarMonth(-1),fromDate=new Date(`${recent.from}T00:00:00`),toDate=new Date(`${recent.to}T00:00:00`);
      fromDate.setFullYear(fromDate.getFullYear()-1);toDate.setFullYear(toDate.getFullYear()-1);
      setComparisonRange('a',{from:inputDate(fromDate),to:inputDate(toDate)});setComparisonRange('b',recent);
    }
    renderCampaignArchive();
  }
  function comparisonDifference(current,previous,currentBase,previousBase,label,kind='positive') {
    const count=current-previous,currentRate=currentBase?current/currentBase*100:0,previousRate=previousBase?previous/previousBase*100:0,rate=currentRate-previousRate;
    const countText=`${count>0?'+':''}${numberFormat.format(count)}`,rateTextValue=`${rate>0?'+':''}${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(rate)} п.п.`;
    return `<div class="campaign-comparison-difference ${kind} ${count>0?'up':count<0?'down':'same'}"><small>${escapeHtml(label)} · B к A</small><strong>${countText}</strong><span>${rateTextValue}</span></div>`;
  }
  function selectedComparisonBrands() {
    return qa('[data-compare-brand]:checked').map(input=>input.value);
  }
  function comparisonBrandMetric(total,key,label) {
    return `<span class="campaign-period-value" data-label="${escapeHtml(label)}" role="cell"><strong>${numberFormat.format(total[key])}</strong><small>Среднее · ${escapeHtml(rateText(total[key],total.recipients))}</small></span>`;
  }
  function comparisonBrandRow(label,total,brand='',summary=false) {
    return `<div class="campaign-period-table-row${summary?' is-summary':''}" role="row" ${brand?`data-brand="${escapeHtml(brand)}"`:''}><span class="campaign-period-brand" role="cell">${brand?`<span class="campaign-brand-tag">${escapeHtml(label)}</span>`:`<strong>${escapeHtml(label)}</strong>`}</span><span class="campaign-period-value" data-label="Получатели" role="cell"><strong>${numberFormat.format(total.recipients)}</strong><small>${campaignCount(total.count)}</small></span>${comparisonBrandMetric(total,'opens','Просмотры')}${comparisonBrandMetric(total,'clicks','Переходы')}${comparisonBrandMetric(total,'complaints','Жалобы')}</div>`;
  }
  function periodReport(label,range,items,brands) {
    const total=campaignTotals(items);
    const rows=brands.map(brand=>comparisonBrandRow(brandNames[brand],campaignTotals(items.filter(item=>item.brand===brand)),brand)).join('');
    return `<article class="campaign-period-report"><header><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(range.label)}</strong></div><small>${campaignCount(total.count)}</small></header><div class="campaign-period-table" role="table"><div class="campaign-period-table-row campaign-period-table-head" role="row"><span>Бренд</span><span>Получатели</span><span>Просмотры</span><span>Переходы</span><span>Жалобы</span></div>${rows}${comparisonBrandRow('Всего / среднее',total,'',true)}</div></article>`;
  }
  function renderCampaignArchive() {
    const search=q('#campaign-archive-search').value.trim().toLocaleLowerCase('ru'),brand=q('#campaign-archive-brand').value,comparison=campaignComparison(),comparisonBrands=selectedComparisonBrands();
    const baseFiltered=state.archive.filter(item=>(comparison.valid?comparisonBrands.includes(item.brand):(!brand || item.brand===brand)) && (!search || `${item.subject} ${item.id}`.toLocaleLowerCase('ru').includes(search)));
    const filtered=comparison.valid?baseFiltered.filter(item=>campaignInInterval(item,comparison.a)||campaignInInterval(item,comparison.b)):baseFiltered;
    const trigger=q('#campaign-compare-toggle');
    trigger.dataset.active=String(comparison.valid);trigger.textContent=comparison.valid?`Сравнение · ${comparisonBrands.length} бренд${comparisonBrands.length===1?'':comparisonBrands.length<5?'а':'ов'}`:'Сравнить интервалы';
    const intervalTotal=q('#campaign-archive-interval-total'),brandTotals=q('#campaign-archive-totals');
    if(comparison.valid){
      const itemsA=baseFiltered.filter(item=>campaignInInterval(item,comparison.a)),itemsB=baseFiltered.filter(item=>campaignInInterval(item,comparison.b));
      const totalA=campaignTotals(itemsA),totalB=campaignTotals(itemsB);
      intervalTotal.innerHTML=`<div class="campaign-interval-head"><div><span class="eyebrow">СРАВНЕНИЕ ИНТЕРВАЛОВ</span><strong>A и B по брендам</strong></div><small>${campaignCount(totalA.count+totalB.count)} в выборке</small></div><div class="campaign-period-reports">${periodReport('Интервал A',comparison.a,itemsA,comparisonBrands)}${periodReport('Интервал B',comparison.b,itemsB,comparisonBrands)}</div><div class="campaign-comparison-differences">${comparisonDifference(totalB.opens,totalA.opens,totalB.recipients,totalA.recipients,'Просмотры')}${comparisonDifference(totalB.clicks,totalA.clicks,totalB.recipients,totalA.recipients,'Переходы')}${comparisonDifference(totalB.complaints,totalA.complaints,totalB.recipients,totalA.recipients,'Жалобы','negative')}</div>`;
      brandTotals.hidden=true;brandTotals.innerHTML='';
      q('#campaign-compare-status').textContent=`Сравниваются ${comparison.a.label} и ${comparison.b.label}: ${comparisonBrands.map(key=>brandNames[key]).join(', ')}. Изменения показаны для интервала B относительно A.`;
    }else{
      const total=campaignTotals(filtered);
      intervalTotal.innerHTML=`<div class="campaign-interval-head"><div><span class="eyebrow">ИТОГО</span><strong>За всё время</strong></div><small>${campaignCount(total.count)}</small></div><div class="campaign-interval-kpis"><div><strong>${numberFormat.format(total.recipients)}</strong><small>${russianForm(total.recipients,recipientForms)}</small></div>${metric(total.opens,total.recipients,'Просмотров')}${metric(total.clicks,total.recipients,'Переходов','click')}${metric(total.complaints,total.recipients,'Жалобы / отписки','spam')}</div>`;
      brandTotals.hidden=false;
      brandTotals.innerHTML=['outmax','hasl','haslestore'].map(key=>{
        const total=campaignTotals(filtered.filter(i=>i.brand===key));
      return `<div class="campaign-brand-total"><strong>${brandNames[key]}</strong><div class="campaign-total-pair">${metric(total.opens,total.recipients,'Средний · просмотры')}${summedPercent(total,'openPercentSum','просмотров')}</div><div class="campaign-total-pair">${metric(total.clicks,total.recipients,'Средний · переходы','click')}${summedPercent(total,'clickPercentSum','переходов')}</div><small>${campaignCount(total.count)} · ${recipientCount(total.recipients)}</small></div>`;
      }).join('');
      q('#campaign-compare-status').textContent=comparison.active?'Заполните корректно обе даты каждого интервала. Пока показана статистика за всё время.':'';
    }
    const groups=campaignGroups(filtered);
    q('#campaign-archive-list').innerHTML=groups.slice(0,state.archiveLimit).map(group=>{
      const items=[...group.items].sort((a,b)=>campaignTime(a)-campaignTime(b)||Number(a.id)-Number(b.id));
      const total=campaignTotals(items);
      const sentItems=items.filter(isSentCampaign),canOpenTotal=sentItems.length>1;
      let previousSent=null;
      const rows=items.map((item,index)=>{const row=archiveRow(item,index,items.length,isSentCampaign(item)?previousSent:null);if(isSentCampaign(item))previousSent=item;return row;}).join('');
      const groupTotals=items.length>1?`<span class="campaign-group-totals"><span class="campaign-group-total"><span class="campaign-average"><small>Средний</small>${metric(total.opens,total.recipients,'Просмотров')}</span>${summedPercent(total,'openPercentSum','просмотров')}</span><span class="campaign-group-total"><span class="campaign-average"><small>Средний</small>${metric(total.clicks,total.recipients,'Переходов','click')}</span>${summedPercent(total,'clickPercentSum','переходов')}</span></span>`:'';
      return `<section class="campaign-group" data-brand="${group.brand}"><header ${canOpenTotal?`class="is-clickable" data-campaign-group="${sentItems.map(item=>escapeHtml(item.id)).join(',')}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Открыть суммарную статистику группы"`:''}><span class="campaign-brand-tag">${brandNames[group.brand]}</span><span>${escapeHtml(group.time?formatDate(group.time/1000):'Дата не передана NotiSend')}</span>${groupTotals}${canOpenTotal?'<span class="campaign-open-hint">Суммарная статистика ↗</span>':''}</header>${rows}</section>`;
    }).join('') || '<div class="notisend-empty">Рассылок по этим условиям нет.</div>';
    q('#campaign-archive-more').hidden=groups.length<=state.archiveLimit;
    const rangeLabel=comparison.valid?`Сравнение: ${comparison.a.label} / ${comparison.b.label}`:'За всё время';
    q('#campaign-archive-progress').textContent=`Загружено ${numberFormat.format(state.archive.length)} из ${numberFormat.format(state.archiveTotal||0)} · ${rangeLabel}${state.archiveLoading?' · Синхронизация…':state.archiveFailures.length?' · Не все страницы загружены. Нажмите «Обновить», чтобы повторить.':state.archiveComplete?' · Архив обновлён':''}${filtered.some(i=>i.brand==='unassigned')?' · У части писем нужно уточнить бренд: NotiSend использует общего отправителя.':''}`;
  }
  async function loadCampaignArchive(force=false) {
    if(state.archiveLoading || (state.archiveComplete && !force))return;
    state.archiveLoading=true;state.archiveComplete=false;state.archiveFailures=[];
    q('#campaign-archive-refresh').disabled=true;
    let gathered=new Map(state.archive.map(item=>[String(item.id),item]));
    try {
      const first=await request('/notisend/archive?page=1');state.archiveTotal=first.totalCount;
      const pages=Number(first.totalPages)||1;
      gathered=new Map();first.items.forEach(item=>gathered.set(String(item.id),item));
      state.archive=[...gathered.values()];renderCampaignArchive();
      let next=pages;
      const worker=async()=>{while(next>=2){const page=next--;let result;
        for(let attempt=0;attempt<2;attempt++){try{result=await request(`/notisend/archive?page=${page}`);break;}catch(error){if(attempt===1)state.archiveFailures.push(page);}}
        if(result)result.items.forEach(item=>gathered.set(String(item.id),item));
        state.archive=[...gathered.values()];renderCampaignArchive();
      }};
      await Promise.all([worker(),worker()]);
      if(gathered.size!==Number(state.archiveTotal))state.archiveFailures.push(0);
      state.archiveComplete=!state.archiveFailures.length;
    }catch(error){state.archiveFailures.push(1);toast(error.message,true);}
    finally{state.archiveLoading=false;q('#campaign-archive-refresh').disabled=false;renderCampaignArchive();}
  }
  ['#campaign-archive-search','#campaign-archive-brand','#campaign-compare-a-from','#campaign-compare-a-to','#campaign-compare-b-from','#campaign-compare-b-to'].forEach(selector=>q(selector).addEventListener('input',()=>{state.archiveLimit=30;renderCampaignArchive();}));
  qa('[data-compare-brand]').forEach(input=>input.addEventListener('change',event=>{
    if(!selectedComparisonBrands().length){event.currentTarget.checked=true;toast('Оставьте хотя бы один бренд в сравнении',true);return;}
    state.archiveLimit=30;renderCampaignArchive();
  }));
  q('#campaign-compare-toggle').addEventListener('click',()=>{
    const panel=q('#campaign-compare-panel'),opening=panel.hidden;
    panel.hidden=!opening;q('#campaign-compare-toggle').setAttribute('aria-expanded',String(opening));
    if(opening && !campaignComparison().active)applyComparisonPreset('months');
  });
  q('#campaign-compare-close').addEventListener('click',()=>{q('#campaign-compare-panel').hidden=true;q('#campaign-compare-toggle').setAttribute('aria-expanded','false');});
  qa('[data-compare-preset]').forEach(button=>button.addEventListener('click',()=>applyComparisonPreset(button.dataset.comparePreset)));
  q('#campaign-compare-reset').addEventListener('click',()=>{
    ['a-from','a-to','b-from','b-to'].forEach(key=>q(`#campaign-compare-${key}`).value='');
    q('#campaign-compare-panel').hidden=true;q('#campaign-compare-toggle').setAttribute('aria-expanded','false');renderCampaignArchive();
  });
  q('#campaign-archive-refresh').addEventListener('click',()=>loadCampaignArchive(true));
  q('#campaign-archive-more').addEventListener('click',()=>{state.archiveLimit+=30;renderCampaignArchive();});
  function archiveStatisticsTarget(target) {
    const group=target.closest('[data-campaign-group]');
    if(group){
      const ids=group.dataset.campaignGroup.split(',');
      openCampaignStatistics(ids.map(id=>state.archive.find(item=>String(item.id)===id)).filter(Boolean));
      return true;
    }
    if(target.closest('a,button,select,input,summary,details,label'))return false;
    const row=target.closest('.campaign-archive-row.is-clickable');
    const item=row && state.archive.find(candidate=>String(candidate.id)===row.dataset.campaignId);
    if(item)openCampaignStatistics([item]);
    return Boolean(item);
  }
  q('#campaign-archive-list').addEventListener('click',event=>archiveStatisticsTarget(event.target));
  q('#campaign-archive-list').addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ')return;
    if(event.target.matches('[data-campaign-group],.campaign-archive-row.is-clickable')){
      event.preventDefault();archiveStatisticsTarget(event.target);
    }
  });
  q('#campaign-archive-list').addEventListener('change',async event=>{
    const select=event.target.closest('[data-campaign-brand]');if(!select)return;
    const item=state.archive.find(i=>String(i.id)===select.dataset.campaignBrand),previous=item.brand;select.disabled=true;
    try{await request(`/notisend/archive/${encodeURIComponent(item.id)}/brand`,{method:'PUT',body:JSON.stringify({brand:select.value})});item.brand=select.value;renderCampaignArchive();}
    catch(error){select.value=previous;toast(error.message,true);}finally{select.disabled=false;}
  });
  q('#campaign-statistics-close')?.addEventListener('click',()=>campaignStatisticsDialog.close());
  campaignStatisticsDialog?.addEventListener('click',event=>{if(event.target===campaignStatisticsDialog)campaignStatisticsDialog.close();});

  window.emailPublicationBridge={prepare:async site=>{activeSite=site;q('#notisend-site').value=site;return publishedEmail();}};
  async function publishedEmail() {
    if (state.projectSavePromise) await state.projectSavePromise;
    const id = await saveProject({silent:true});
    const publication = await request(`/email-projects/${encodeURIComponent(id)}/publish-images`,{method:'POST'});
    syncTemplateProfile(Number(publication.imageCount) || 0);
    return publication;
  }
  async function sendTest() {
    setError('');
    const result = renderPreflight({ignoreRecipients:true});
    if (result.errors) {
      activateTab('preflight');
      return setError('Исправьте критические ошибки перед тестовой отправкой.');
    }
    const button = q('#notisend-send-test');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Отправляем…';
    try {
      const payload = {
        to:q('#notisend-test-email').value.trim(),
        fromEmail:q('#notisend-from-email').value.trim(),
        fromName:q('#notisend-from-name').value.trim(),
        subject:q('#subject').value.trim(),
        html:testHtml((await publishedEmail()).html),
        text:(q('#canvas')?.innerText || '').trim()
      };
      await request('/notisend/test',{method:'POST',body:JSON.stringify(payload)});
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>Тест отправлен</strong><span>${escapeHtml(payload.to)} · через SMTP NotiSend</span>`;
    } catch (error) {
      setError(error.message);
    } finally {
      button.textContent = original;
      updateCreateState();
    }
  }
  async function createDraft() {
    setError('');
    resultBox.hidden = true;
    const preflight = renderPreflight();
    if (preflight.errors) {
      activateTab('preflight');
      return setError('Исправьте критические ошибки перед созданием Campaign.');
    }
    if (state.notisendCampaignId && createButton.dataset.confirmNew !== '1') {
      createButton.dataset.confirmNew = '1';
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>У проекта уже есть Campaign #${escapeHtml(state.notisendCampaignId)}</strong>
        <span>Нажмите «Создать новый черновик» ещё раз, если действительно нужна новая копия.</span>`;
      setTimeout(() => { createButton.dataset.confirmNew=''; },5000);
      return;
    }
    const originalText = createButton.textContent;
    createButton.disabled = true;
    createButton.textContent = 'Создаём черновик…';
    try {
      const publication = await publishedEmail();
      const html = publication.html;
      const profile = templateProfile();
      const payload = {
        fromEmail:q('#notisend-from-email').value.trim(),
        fromName:q('#notisend-from-name').value.trim(),
        subject:q('#subject').value.trim(),
        templateName:profile.name,
        html,
        text:(q('#canvas')?.innerText || '').trim(),
        listIds:selectedListIds()
      };
      const draft = await request('/notisend/campaigns',{method:'POST',body:JSON.stringify(payload)});
      state.notisendCampaignId = draft.id;
      state.campaignFingerprint = await fingerprint(html + JSON.stringify(payload.listIds));
      createButton.dataset.confirmNew = '';
      await saveProject({silent:true});
      if (state.currentProjectId) {
        const workflow = await request(`/email-projects/${encodeURIComponent(state.currentProjectId)}/workflow`,{
          method:'POST',body:JSON.stringify({action:'notisend'})
        });
        state.workflowStatus = workflow.status || 'notisend';
        renderWorkflowState();
      }
      updateLinkedCampaign();
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>Черновик #${escapeHtml(draft.id)} создан и привязан к проекту</strong>
        <span>${escapeHtml(profile.name)} · NotiSend рассчитал ${numberFormat.format(draft.recipientsCount || 0)} получателей. Финальная отправка остаётся в NotiSend.</span>
        <a class="notisend-result-link" href="https://app.notisend.ru/mailer/campaigns/${encodeURIComponent(draft.id)}" target="_blank" rel="noopener">Открыть предпросмотр в NotiSend ↗</a>`;
      state.loaded = false;
      await loadData(true);
      resultBox.scrollIntoView({block:'nearest'});
    } catch (error) {
      setError(error.message);
    } finally {
      createButton.textContent = originalText;
      updateLinkedCampaign();
      updateCreateState();
    }
  }

  function activateTab(name) {
    qa('[data-notisend-tab]').forEach(button => {
      const active = button.dataset.notisendTab === name;
      button.setAttribute('aria-selected',active ? 'true' : 'false');
    });
    qa('[data-notisend-panel]').forEach(panel => {
      panel.hidden = panel.dataset.notisendPanel !== name;
    });
    if (name === 'preflight') renderPreflight();
  }

  openButton.addEventListener('click',async () => {
    resultBox.hidden = true;
    setError('');
    dialog.showModal();
    activateTab('prepare');
    await loadStatus();
    await loadData();
  });

  q('#notisend-close').addEventListener('click',() => dialog.close());
  q('#notisend-refresh').addEventListener('click',async () => {
    state.loaded = false;
    await loadStatus();
    await loadData(true);
  });
  q('#notisend-run-preflight').addEventListener('click',renderPreflight);
  q('#notisend-send-test').addEventListener('click',sendTest);
  createButton.addEventListener('click',createDraft);
  dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); });
  qa('[data-notisend-tab]').forEach(button => {
    button.addEventListener('click',() => activateTab(button.dataset.notisendTab));
  });

  q('#save-sender-profile').addEventListener('click',saveSenderProfile);
  q('#apply-sender-profile').addEventListener('click',() => {
    applySenderProfile(activeSite,{savedOnly:true});scheduleProjectAutosave();
  });
  q('#notisend-site').addEventListener('change',event => {
    activeSite = event.target.value;
    applySenderProfile(activeSite);
    syncTemplateProfile();
    if (typeof refresh === 'function') refresh();
    scheduleProjectAutosave();
  });
  [
    '#notisend-from-email','#notisend-from-name','#notisend-test-email',
    '#notisend-utm-source','#notisend-utm-medium','#notisend-utm-campaign'
  ].forEach(selector => q(selector).addEventListener('input',() => {
    if (!state.profileSite) state.profileSite = activeSite;
    state.siteDrafts[state.profileSite] = senderSnapshot();
    renderSenderProfile();
    updateCreateState();
    scheduleProjectAutosave();
  }));
  q('#notisend-utm-enabled').addEventListener('change',() => {
    q('#notisend-utm-fields').classList.toggle('is-disabled',!q('#notisend-utm-enabled').checked);
    scheduleProjectAutosave();
  });

  q('#subject')?.addEventListener('input',syncComposer);
  q('#preheader')?.addEventListener('input',syncComposer);
  q('#filename')?.addEventListener('input',() => {
    if (!state.currentProjectId) q('#notisend-utm-campaign').value = projectSlug(q('#filename').value);
  });

  q('#new-email-project').addEventListener('click',async()=>{try{
    if(state.editorDirty)await saveProject({silent:true});
    state.currentProjectId=null;state.notisendCampaignId=null;state.campaignFingerprint='';state.workflowStatus='draft';state.reviewComment='';state.reviewerName='';state.previewUrl=null;
    await window.emailProjectBridge.restore({filename:'novaya-rassylka',subject:'Новая рассылка OUTMAX',preheader:'',site:activeSite,canvasHtml:'<h1>Новая рассылка</h1><p>Добавьте текст или загрузите новость по ссылке.</p>',importState:{css:'',root:{tag:'article',className:'om-guide'}}});
    q('#email-project-status').textContent='Новая рассылка — сохраните под своим названием';renderWorkflowState();
  }catch(error){toast(error.message,true);}});
  q('#save-email-project').addEventListener('click',() => saveProject().catch(() => {}));
  window.emailReviewBridge={currentId:()=>state.currentProjectId};
  q('#email-public-preview').addEventListener('click',()=>shareProject(state.currentProjectId,{saveCurrent:true}).catch(error=>toast(error.message,true)));
  q('#email-current-feedback').addEventListener('click',async()=>{try{const url=await shareProject(state.currentProjectId,{saveCurrent:true});shareDialog.close();document.dispatchEvent(new CustomEvent('email-review-open',{detail:url}));}catch(error){toast(error.message,true);}});
  q('#share-email-preview').addEventListener('click',() => shareProject(state.currentProjectId,{saveCurrent:true}).catch(error => toast(error.message,true)));
  q('#submit-email-review').addEventListener('click',() => changeOwnWorkflow().catch(error => toast(error.message,true)));
  q('#open-email-projects').addEventListener('click',async () => {
    projectsDialog.showModal();
    activateProjectsTab('mine');
    try {
      await loadProjects(true);
      if (state.currentUser?.admin || state.currentUser?.role === 'moderator') await loadReviewQueue(true);
    } catch (error) {
      projectsBox.innerHTML = `<div class="notisend-empty">${escapeHtml(error.message)}</div>`;
    }
  });
  q('#email-projects-close').addEventListener('click',() => projectsDialog.close());
  projectsDialog.addEventListener('click',event => { if (event.target === projectsDialog) projectsDialog.close(); });
  q('#email-project-search').addEventListener('input',renderProjects);
  qa('[data-projects-tab]').forEach(button => button.addEventListener('click',() => activateProjectsTab(button.dataset.projectsTab)));
  q('#email-project-new').addEventListener('click',() => {
    state.currentProjectId = null;
    state.notisendCampaignId = null;
    state.campaignFingerprint = '';
    state.workflowStatus = 'draft';
    state.reviewComment = '';
    state.reviewerName = '';
    state.previewUrl = null;
    state.sharedProjectId = null;
    q('#email-project-status').textContent = 'Новая копия · нажмите «Сохранить»';
    scheduleEmailBackup();
    updateLinkedCampaign();
    renderWorkflowState();
    projectsDialog.close();
  });

  projectsBox.addEventListener('click',event => {
    const open = event.target.closest('[data-project-open]');
    const preview = event.target.closest('[data-project-preview]');
    const remove = event.target.closest('[data-project-delete]');
    if (open) openProject(open.dataset.projectOpen).catch(error => toast(error.message,true));
    if (preview) shareProject(preview.dataset.projectPreview).catch(error => toast(error.message,true));
    if (remove) deleteProject(remove,remove.dataset.projectDelete).catch(error => toast(error.message,true));
  });

  reviewBox.addEventListener('click',event => {
    const action = event.target.closest('[data-review-action]');
    const card = action?.closest('.email-review-card');
    if (action && card) reviewProject(card,action.dataset.reviewAction).catch(error => toast(error.message,true));
  });

  q('#email-share-close').addEventListener('click',() => shareDialog.close());
  shareDialog.addEventListener('click',event => { if (event.target === shareDialog) shareDialog.close(); });
  q('#email-preview-copy').addEventListener('click',async () => {
    const input = q('#email-preview-link');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    toast('Ссылка скопирована');
  });
  q('#email-preview-open').addEventListener('click',() => {
    const url = q('#email-preview-link').value;
    if (url) window.open(url,'_blank','noopener');
  });
  q('#email-preview-revoke').addEventListener('click',async () => {
    if (!state.sharedProjectId) return;
    try {
      await request(`/email-projects/${encodeURIComponent(state.sharedProjectId)}/preview`,{method:'DELETE'});
      state.previewUrl = null;
      q('#email-preview-link').value = '';
      shareDialog.close();
      toast('Публичная ссылка отозвана');
    } catch (error) {
      toast(error.message,true);
    }
  });

  document.addEventListener('email-editor-change',() => {
    if (state.restoringProject) return;
    if (state.profilesLoaded && state.profileSite !== activeSite) applySenderProfile(activeSite);
    scheduleProjectAutosave();
  });
  renderWorkflowState();
  loadStatus();
  loadProjects().catch(() => {});
  const currentUserReady=loadCurrentUser();
  loadSenderProfiles().catch(() => {});
  Promise.resolve(currentUserReady).finally(()=>restoreEmailBackup().catch(()=>{emailBackupReady=true;setEmailBackupStatus('error');}));
  window.addEventListener('pagehide',()=>{
    if(!emailBackupReady||emailBackupRestoring)return;
    clearTimeout(emailBackupTimer);emailBackupTimer=null;persistEmailBackup(emailBackupDirty);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='hidden'||!emailBackupTimer)return;
    clearTimeout(emailBackupTimer);emailBackupTimer=null;persistEmailBackup(emailBackupDirty);
  });
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
  const currentButton=document.querySelector('#article-feedback');if(currentButton && typeof currentId!=='undefined'){const current=items.find(i=>i.kind==='article' && i.name===currentId && i.brand===ACTIVE_EDITOR.key);currentButton.textContent='Аннотирование'+(current?.openCount?' · '+current.openCount:'');}
  const emailButton=document.querySelector('#email-current-feedback');if(emailButton){const id=window.emailReviewBridge?.currentId();const current=items.find(i=>i.kind==='email'&&i.name==='email::'+id);emailButton.textContent='Аннотирование'+(current?.openCount?' · '+current.openCount:'');}
  if(previous!==null && data.openCount>previous && typeof toast==='function')toast('Появилась новая обратная связь к вашим материалам');previous=data.openCount;
  if(dialog.open && !body.querySelector('iframe'))render();
 }catch{}}
 function render(){body.innerHTML=items.length?items.map(i=>`<article class="feedback-inbox-card"><div><strong>${esc(i.title||'Без названия')}</strong><small>${i.kind==='email'?'Email-проект':i.brand==='hasl'?'ХАСЛ':'OUTMAX'} · ${i.openCount} открытых · ${i.totalCount} обсуждений</small></div>${i.previewUrl?`<button type="button" data-preview="${esc(i.previewUrl)}">Обсуждения</button>`:'<small>Ссылка отозвана. Создайте новый предпросмотр материала.</small>'}</article>`).join(''):'<p class="feedback-inbox-empty">Заметок пока нет. Коллеги могут оставить обратную связь после входа в удалённый предпросмотр.</p>';}
 document.addEventListener('email-review-open',event=>openPreview(event.detail));
 function openPreview(url){body.innerHTML=`<iframe class="feedback-current-frame" src="${esc(url+(url.includes('?')?'&':'?')+'comments=1')}" title="Предпросмотр и заметки"></iframe>`;if(!dialog.open)dialog.showModal();}
 button.onclick=async()=>{menu.closest('details').open=false;body.innerHTML='<p class="feedback-inbox-empty" role="status">Загружаем обсуждения…</p>';dialog.showModal();await refresh();render();};
 body.onclick=event=>{const target=event.target.closest('[data-preview]');if(target)openPreview(target.dataset.preview);};
 const remote=document.querySelector('#remote-preview');if(remote && window.__EDITOR_SERVER_FIRST__){const current=document.createElement('button');current.id='article-feedback';current.type='button';current.textContent='Аннотирование';remote.before(current);current.onclick=async()=>{current.disabled=true;try{await save();const response=await fetch((window.__EDITOR_API_PREFIX__||'/editor-api')+'/preview/'+encodeURIComponent(currentId)+'?brand='+encodeURIComponent(ACTIVE_EDITOR.key),{method:'POST',credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось открыть заметки');openPreview(result.url);}catch(error){toast(error.message,true);}finally{current.disabled=false;}};}
 refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);
})();
