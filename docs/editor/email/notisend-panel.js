// Интеграция email-редактора с NotiSend: группы, черновики и статистика.
(() => {
  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];
  const dialog = q('#notisend-dialog');
  if (!dialog) return;

  const apiPrefix = window.__EDITOR_API_PREFIX__ || '/api';
  const numberFormat = new Intl.NumberFormat('ru-RU');
  const state = {status:null,lists:[],campaigns:[],loaded:false};
  const openButton = q('#notisend-open');
  const createButton = q('#notisend-create-draft');
  const resultBox = q('#notisend-result');
  const errorBox = q('#notisend-error');
  const listsBox = q('#notisend-lists');
  const historyBox = q('#notisend-history');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g,char => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]
    ));
  }

  async function request(path,options = {}) {
    const response = await fetch(`${apiPrefix}${path}`,{
      credentials:'same-origin',
      headers:{'Content-Type':'application/json',...(options.headers || {})},
      ...options
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* Пустой ответ. */ }
    if (!response.ok) throw new Error(payload.error || 'Ошибка NotiSend');
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

  function renderLists() {
    if (!state.lists.length) {
      listsBox.innerHTML = '<div class="notisend-empty">Группы получателей не найдены.</div>';
      updateCreateState();
      return;
    }
    listsBox.innerHTML = state.lists.map(item => `
      <label class="notisend-list-row">
        <input type="checkbox" name="notisend-list" value="${escapeHtml(item.id)}">
        <span>${escapeHtml(item.title)}</span>
      </label>`).join('');
    listsBox.querySelectorAll('input').forEach(input => {
      input.addEventListener('change',updateCreateState);
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
      ? numberFormat.format(state.campaigns.length)
      : '';
    historyBox.innerHTML = state.campaigns.length
      ? state.campaigns.map(campaignCard).join('')
      : '<div class="notisend-empty">Рассылок пока нет.</div>';
  }
  function syncComposer() {
    q('#notisend-site').value = typeof activeSite === 'string' ? activeSite : 'outmax_ru';
    q('#notisend-subject').textContent = q('#subject')?.value.trim() || 'Без темы';
    q('#notisend-preheader').textContent = q('#preheader')?.value.trim() || 'Не заполнен';
    const latest = state.campaigns.find(item => item.fromEmail);
    const fromEmail = q('#notisend-from-email');
    const fromName = q('#notisend-from-name');
    if (latest && !fromEmail.value) fromEmail.value = latest.fromEmail || '';
    if (latest && !fromName.value) fromName.value = latest.fromName || '';
    updateCreateState();
  }

  function selectedListIds() {
    return qa('input[name="notisend-list"]:checked').map(input => input.value);
  }

  function updateCreateState() {
    if (!createButton) return;
    const ready = Boolean(
      state.status?.connected &&
      selectedListIds().length &&
      q('#notisend-from-email').value.trim() &&
      q('#subject')?.value.trim()
    );
    createButton.disabled = !ready;
  }

  async function loadStatus() {
    try {
      state.status = await request('/notisend/status');
    } catch (error) {
      state.status = {connected:false};
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

  async function createDraft() {
    setError('');
    resultBox.hidden = true;
    const originalText = createButton.textContent;
    createButton.disabled = true;
    createButton.textContent = 'Создаём черновик…';
    try {
      const payload = {
        fromEmail:q('#notisend-from-email').value.trim(),
        fromName:q('#notisend-from-name').value.trim(),
        subject:q('#subject').value.trim(),
        html:emailDocument(activeSite),
        text:(q('#canvas')?.innerText || '').trim(),
        listIds:selectedListIds()
      };
      const draft = await request('/notisend/campaigns',{
        method:'POST',
        body:JSON.stringify(payload)
      });
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>Черновик #${escapeHtml(draft.id)} создан</strong>
        <span>NotiSend рассчитал ${numberFormat.format(draft.recipientsCount || 0)} получателей. Проверьте кампанию в NotiSend и выполните финальную отправку там.</span>`;
      state.loaded = false;
      await loadData(true);
      q('#notisend-result')?.scrollIntoView({block:'nearest'});
    } catch (error) {
      setError(error.message);
    } finally {
      createButton.textContent = originalText;
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
  dialog.addEventListener('click',event => {
    if (event.target === dialog) dialog.close();
  });
  qa('[data-notisend-tab]').forEach(button => {
    button.addEventListener('click',() => activateTab(button.dataset.notisendTab));
  });

  q('#notisend-site').addEventListener('change',event => {
    activeSite = event.target.value;
    if (typeof refresh === 'function') refresh();
  });
  q('#notisend-from-email').addEventListener('input',updateCreateState);
  q('#notisend-from-name').addEventListener('input',updateCreateState);
  q('#subject')?.addEventListener('input',() => {syncComposer();});
  q('#preheader')?.addEventListener('input',() => {syncComposer();});
  createButton.addEventListener('click',createDraft);
  loadStatus();
})();
