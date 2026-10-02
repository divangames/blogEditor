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
    currentProjectId:null,projectListIds:[],notisendCampaignId:null,
    campaignFingerprint:'',autosaveTimer:null,savingProject:false
  };
  const openButton = q('#notisend-open');
  const createButton = q('#notisend-create-draft');
  const resultBox = q('#notisend-result');
  const errorBox = q('#notisend-error');
  const listsBox = q('#notisend-lists');
  const historyBox = q('#notisend-history');
  const projectsBox = q('#email-projects-list');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g,char => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]
    ));
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

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
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
  function setError(message = '') {
    errorBox.hidden = !message;
    errorBox.textContent = message;
  }

  function currentUtm() {
    return {
      enabled:q('#notisend-utm-enabled').checked,
      source:q('#notisend-utm-source').value.trim(),
      medium:q('#notisend-utm-medium').value.trim(),
      campaign:q('#notisend-utm-campaign').value.trim()
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
    const latest = state.campaigns.find(item => item.fromEmail);
    if (latest && !q('#notisend-from-email').value) q('#notisend-from-email').value = latest.fromEmail || '';
    if (latest && !q('#notisend-from-name').value) q('#notisend-from-name').value = latest.fromName || '';
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
        request('/notisend/campaigns?pageSize=25')
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

    const htmlBytes = new TextEncoder().encode(html).length;
    checks.push({
      level:htmlBytes > 100 * 1024 ? 'warn' : 'pass',
      title:'Размер HTML',
      detail:`${numberFormat.format(Math.round(htmlBytes / 1024))} КБ${htmlBytes > 100 * 1024 ? ' · письмо близко к порогу обрезки некоторых клиентов' : ''}`
    });
    const badLinks = links.filter(link => !/^(?:https?:|mailto:|tel:|#)/i.test(link.getAttribute('href') || ''));
    const insecureLinks = links.filter(link => /^http:\/\//i.test(link.getAttribute('href') || ''));
    checks.push({
      level:badLinks.length ? 'error' : insecureLinks.length ? 'warn' : 'pass',
      title:'Ссылки',
      detail:`${links.length} шт. · некорректных: ${badLinks.length} · HTTP: ${insecureLinks.length}`
    });

    if (utm.enabled) {
      const tracked = links.filter(link => /^https?:\/\//i.test(link.href));
      const missing = tracked.filter(link => {
        try {
          const url = new URL(link.href);
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

    const missingAlt = images.filter(image => !image.getAttribute('alt')?.trim()).length;
    checks.push({
      level:missingAlt ? 'warn' : 'pass',
      title:'Alt изображений',
      detail:`Изображений: ${images.length} · без alt: ${missingAlt}`
    });
    const localImages = [...q('#canvas').querySelectorAll('img[data-email-src]')]
      .filter(image => !/^https?:\/\//i.test(image.dataset.emailSrc || '')).length;
    checks.push({
      level:localImages ? 'error' : 'pass',
      title:'Публичные изображения',
      detail:localImages
        ? `Локальных изображений: ${localImages}. Проект их сохранит, но для массового письма нужен публичный URL.`
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
      importState:snapshot.importState,
      fromEmail:q('#notisend-from-email').value.trim(),
      fromName:q('#notisend-from-name').value.trim(),
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
  async function saveProject({silent=false} = {}) {
    if (state.savingProject || !window.emailProjectBridge) return state.currentProjectId;
    state.savingProject = true;
    const statusNode = q('#email-project-status');
    const button = q('#save-email-project');
    const original = button.textContent;
    if (!silent) button.textContent = 'Сохраняем…';
    statusNode.textContent = 'Сохранение проекта…';
    try {
      const id = await chooseProjectId();
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
      statusNode.textContent = `Сохранено · ${formatDate(saved.savedAt)}`;
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
        </div>
        <div class="email-project-card-actions">
          <button type="button" data-project-open="${escapeHtml(item.id)}">Открыть</button>
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
    await window.emailProjectBridge.restore(project,assetEntries);
    state.currentProjectId = project.id;
    state.projectListIds = (project.listIds || []).map(String);
    state.notisendCampaignId = project.notisendCampaignId || null;
    state.campaignFingerprint = project.campaignFingerprint || '';
    q('#notisend-from-email').value = project.fromEmail || '';
    q('#notisend-from-name').value = project.fromName || '';
    q('#notisend-utm-enabled').checked = Boolean(project.utm?.enabled);
    q('#notisend-utm-source').value = project.utm?.source || 'notisend';
    q('#notisend-utm-medium').value = project.utm?.medium || 'email';
    q('#notisend-utm-campaign').value = project.utm?.campaign || projectSlug(project.filename);
    q('#email-project-status').textContent = `Открыт · ${formatDate(project.savedAt)}`;
    state.loaded = false;
    updateLinkedCampaign();
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
      q('#email-project-status').textContent = 'Новый email-проект';
    }
    await loadProjects(true);
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
        html:finalHtml(),
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
      if (!state.currentProjectId) await saveProject({silent:true});
      const html = finalHtml();
      const payload = {
        fromEmail:q('#notisend-from-email').value.trim(),
        fromName:q('#notisend-from-name').value.trim(),
        subject:q('#subject').value.trim(),
        html,
        text:(q('#canvas')?.innerText || '').trim(),
        listIds:selectedListIds()
      };
      const draft = await request('/notisend/campaigns',{method:'POST',body:JSON.stringify(payload)});
      state.notisendCampaignId = draft.id;
      state.campaignFingerprint = await fingerprint(html + JSON.stringify(payload.listIds));
      createButton.dataset.confirmNew = '';
      await saveProject({silent:true});
      updateLinkedCampaign();
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>Черновик #${escapeHtml(draft.id)} создан и привязан к проекту</strong>
        <span>NotiSend рассчитал ${numberFormat.format(draft.recipientsCount || 0)} получателей. Финальная отправка остаётся в NotiSend.</span>`;
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

  q('#notisend-site').addEventListener('change',event => {
    activeSite = event.target.value;
    if (typeof refresh === 'function') refresh();
    scheduleProjectAutosave();
  });
  [
    '#notisend-from-email','#notisend-from-name','#notisend-test-email',
    '#notisend-utm-source','#notisend-utm-medium','#notisend-utm-campaign'
  ].forEach(selector => q(selector).addEventListener('input',() => {
    updateCreateState();
    if (selector !== '#notisend-test-email') scheduleProjectAutosave();
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

  q('#save-email-project').addEventListener('click',() => saveProject().catch(() => {}));
  q('#open-email-projects').addEventListener('click',async () => {
    projectsDialog.showModal();
    try { await loadProjects(true); } catch (error) {
      projectsBox.innerHTML = `<div class="notisend-empty">${escapeHtml(error.message)}</div>`;
    }
  });
  q('#email-projects-close').addEventListener('click',() => projectsDialog.close());
  projectsDialog.addEventListener('click',event => { if (event.target === projectsDialog) projectsDialog.close(); });
  q('#email-project-search').addEventListener('input',renderProjects);
  q('#email-project-new').addEventListener('click',() => {
    state.currentProjectId = null;
    state.notisendCampaignId = null;
    state.campaignFingerprint = '';
    q('#email-project-status').textContent = 'Новая копия · нажмите «Сохранить проект»';
    updateLinkedCampaign();
    projectsDialog.close();
  });

  projectsBox.addEventListener('click',event => {
    const open = event.target.closest('[data-project-open]');
    const remove = event.target.closest('[data-project-delete]');
    if (open) openProject(open.dataset.projectOpen).catch(error => toast(error.message,true));
    if (remove) deleteProject(remove,remove.dataset.projectDelete).catch(error => toast(error.message,true));
  });

  document.addEventListener('email-editor-change',scheduleProjectAutosave);
  loadStatus();
  loadProjects().catch(() => {});
})();
