// Reusable blocks remain ordinary editable HTML; exporting freezes their current version.
(() => {
  const selector = '[data-shared-id]';
  const baselines = new WeakMap();
  let records = [], loading = null, available = false;
  let sourceBlocks = new Map();
  const panel = document.createElement('div');
  panel.className = 'shared-block-controls';
  panel.innerHTML = '<p id="shared-block-status" role="status"></p><button id="shared-block-save" type="button">Сохранить как общий блок</button><button id="shared-block-refresh" type="button" hidden>Получить обновление…</button><button id="shared-block-detach" type="button" hidden>Отвязать блок</button>';
  $('#selection-panel .context-danger').before(panel);
  const libraryButton = document.createElement('button');
  libraryButton.id = 'shared-block-library'; libraryButton.type = 'button'; libraryButton.className = 'wide';
  libraryButton.textContent = 'Общие блоки';
  $('#open-article-folder').after(libraryButton);
  const box = document.createElement('dialog');
  box.id = 'shared-block-dialog'; box.className = 'shared-block-dialog';
  box.setAttribute('aria-labelledby', 'shared-dialog-title');
  box.innerHTML = '<header><h2 id="shared-dialog-title">Общие блоки</h2><button type="button" aria-label="Закрыть">×</button></header><div class="shared-dialog-body"></div>';
  document.body.append(box);
  box.querySelector('header button').onclick = () => box.close();
  box.addEventListener('click', event => { if (event.target === box) box.close(); });
  const body = box.querySelector('.shared-dialog-body');

  function clean(node) {
    const copy = node.cloneNode(true);
    tocExportRestorer(copy)();
    for (const element of [copy, ...copy.querySelectorAll('*')]) {
      for (const attr of [...element.attributes]) {
        if (attr.name.startsWith('data-editor-') || attr.name.startsWith('data-shared-') || attr.name === 'contenteditable') element.removeAttribute(attr.name);
      }
    }
    for (const image of [copy, ...copy.querySelectorAll('img[src]')].filter(n => n.matches('img[src]'))) {
      let source = window.onlineStoredSrc?.(image.getAttribute('src')) || image.getAttribute('src');
      if (source.startsWith('/articles/')) source = source.slice('/articles/'.length);
      image.setAttribute('src', source);
    }
    return copy;
  }
  function dirty(node) {
    return node.dataset.sharedDirty === 'true' || (baselines.has(node) && baselines.get(node) !== clean(node).outerHTML);
  }
  function selected() {
    return selectedNode?.closest(selector) || movableBlock(selectedNode);
  }
  function syncControls() {
    const node = selected();
    panel.hidden = !node;
    if (!node) return;
    const linked = node.matches(selector);
    $('#shared-block-save').textContent = linked ? 'Обновить общий блок…' : 'Сохранить как общий блок…';
    $('#shared-block-detach').hidden = !linked;
    $('#shared-block-refresh').hidden = !linked;
    $('#shared-block-status').textContent = linked
      ? `${node.dataset.sharedName || 'Общий блок'} · ${dirty(node) ? 'есть правки: обновите общий блок или отвяжите' : available && !records.some(r => r.id === node.dataset.sharedId) ? 'оригинал недоступен · отвяжите копию' : 'связан с библиотекой'}`
      : 'Можно использовать и обновлять в нескольких статьях.';
    requestAnimationFrame(positionSelectionPanel);
  }
  window.sharedBlockSelectionChanged = syncControls;
  window.sharedBlocksSourceHTML = () => {
    const html = adminBody({keepLinks:true}), root = document.createElement('div'); root.innerHTML = html;
    sourceBlocks = new Map([...root.querySelectorAll(selector)].map(node => [node.dataset.sharedInstance || node.dataset.sharedId, node.outerHTML]));
    return html;
  };
  window.sharedBlocksSourceChanged = html => {
    const root = document.createElement('div'); root.innerHTML = html;
    for (const node of root.querySelectorAll(selector)) {
      const before = sourceBlocks.get(node.dataset.sharedInstance || node.dataset.sharedId);
      if (before && before !== node.outerHTML) node.dataset.sharedDirty = 'true';
    }
    return root.innerHTML;
  };
  window.sharedBlockPrepareSave = copy => {
    const nodes = [...canvas.querySelectorAll(selector)], clones = [...copy.querySelectorAll(selector)];
    for (let index = 0; index < nodes.length; index++) {
      if (dirty(nodes[index])) clones[index]?.setAttribute('data-shared-dirty', 'true');
      else clones[index]?.removeAttribute('data-shared-dirty');
    }
  };
  window.sharedBlockTransfer = (oldNode, newNode) => {
    if (!oldNode.matches(selector)) return;
    for (const attr of [...oldNode.attributes]) if (attr.name.startsWith('data-shared-')) newNode.setAttribute(attr.name, attr.value);
    if (baselines.has(oldNode)) baselines.set(newNode, baselines.get(oldNode));
  };
  function linkedNode(record, previous = null) {
    const template = document.createElement('template'); template.innerHTML = record.html;
    const node = template.content.firstElementChild;
    const instance = previous?.dataset.sharedInstance || crypto.randomUUID().slice(0, 8);
    const ids = new Map();
    for (const element of [node, ...node.querySelectorAll('[id]')]) {
      if (!element.id) continue;
      const old = element.id, next = element === node && previous?.id ? previous.id : `${old.replace(/--shared-[a-f0-9-]+$/, '')}--shared-${instance}`;
      ids.set(old, next); element.id = next;
    }
    if (previous?.id && !node.id) node.id = previous.id;
    if (!node.id) node.id = `shared-${record.id}-${instance}`;
    for (const link of node.querySelectorAll('a[href^="#"]')) {
      const id = link.getAttribute('href').slice(1);
      if (ids.has(id)) link.setAttribute('href', '#' + ids.get(id));
    }
    Object.assign(node.dataset, {sharedId:record.id, sharedRevision:record.revision, sharedName:record.name, sharedInstance:instance});
    for (const img of node.querySelectorAll('img[src]')) img.setAttribute('src', assetUrl(img.getAttribute('src')));
    baselines.set(node, clean(node).outerHTML);
    return node;
  }
  function applyRecords(forceNode = null, published = null) {
    let updated = 0;
    for (const node of [...canvas.querySelectorAll(selector)]) {
      const record = (published?.id === node.dataset.sharedId ? published : records.find(r => r.id === node.dataset.sharedId));
      if (!record || (node !== forceNode && (dirty(node) || record.revision === node.dataset.sharedRevision))) continue;
      if (node !== forceNode && (node.contains(document.activeElement) || document.activeElement === canvas && node.contains(window.getSelection()?.anchorNode) || document.querySelector('dialog[open]'))) continue;
      flushArticleHistorySnapshot();
      const wasSelected = selectedNode && node.contains(selectedNode);
      const replacement = linkedNode(record, node); node.replaceWith(replacement); updated++;
      if (wasSelected) selectNode(replacement);
    }
    if (updated) { protectTocArrows(); renderOutline(); changed(); }
    syncControls(); return updated;
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      const result = await api('/api/shared-blocks'); records = result.blocks; available = true;
      applyRecords(); return records;
    })();
    try { return await loading; } finally { loading = null; }
  }
  async function ensureExport() {
    if (!canvas.querySelector(selector)) return;
    await load();
    for (const node of canvas.querySelectorAll(selector)) {
      if (dirty(node)) throw new Error('В общем блоке есть правки. Обновите общий блок или отвяжите его перед экспортом.');
      const record = records.find(r => r.id === node.dataset.sharedId);
      if (!record) throw new Error('Оригинал блока недоступен. Отвяжите сохранённую копию.');
      if (record.revision !== node.dataset.sharedRevision) applyRecords(node, record);
    }
    if (canvas.querySelector('img[src*="_shared_assets/"]')) $('#export-local-images').checked = true;
  }
  window.sharedBlocksEnsureExport = ensureExport;
  libraryButton.onclick = async () => {
    $('#shared-dialog-title').textContent = 'Общие блоки';
    body.innerHTML = '<p role="status">Загружаю блоки…</p>'; box.showModal();
    try {
      await load();
      body.innerHTML = '<p>Блоки доступны в ваших статьях ' + escapeHtml(ACTIVE_EDITOR.name) + '. Изменения общего блока получают все связанные вставки.</p><label>Найти блок<input type="search" id="shared-block-search" autocomplete="off"></label><div class="shared-block-list"></div><p class="shared-dialog-error" role="status"></p>';
      const render = () => {
        const query = $('#shared-block-search').value.toLocaleLowerCase('ru');
        const items = records.filter(r => r.name.toLocaleLowerCase('ru').includes(query));
        body.querySelector('.shared-block-list').innerHTML = items.length ? items.map(r => `<div class="shared-block-row"><div><strong>${escapeHtml(r.name)}</strong><small>Обновлён ${escapeHtml(new Date(r.updatedAt).toLocaleString('ru-RU'))}</small></div><button type="button" data-insert-shared="${r.id}">Вставить</button></div>`).join('') : '<p class="help">' + (records.length ? 'Ничего не найдено.' : 'Выберите элемент в статье и нажмите «Сохранить как общий блок».') + '</p>';
      };
      $('#shared-block-search').oninput = render; render(); $('#shared-block-search').focus();
    } catch (error) { body.innerHTML = '<p role="alert">' + escapeHtml(error.message) + '</p><p>Библиотека общих блоков работает в серверном редакторе.</p>'; }
  };
  body.addEventListener('click', async event => {
    const button = event.target.closest('[data-insert-shared]'); if (!button) return;
    button.disabled = true;
    try {
      const epoch = articleSaveEpoch;
      await load(); if (epoch !== articleSaveEpoch) return;
      const record = records.find(r => r.id === button.dataset.insertShared);
      if (!record) throw new Error('Блок больше не доступен');
      const node = linkedNode(record); box.close(); insertBlock(node); selectNode(node);
      toast('Вставлен связанный блок');
    } catch (error) { body.querySelector('.shared-dialog-error').textContent = error.message; button.disabled = false; }
  });
  $('#shared-block-save').onclick = () => {
    const node = selected(); if (!node) return;
    if (node.querySelector(selector)) { toast('Сначала отвяжите вложенные общие блоки.', true); return; }
    const linked = node.matches(selector), epoch = articleSaveEpoch;
    $('#shared-dialog-title').textContent = linked ? 'Обновить общий блок' : 'Сохранить общий блок';
    body.innerHTML = '<form><label>Название блока<input name="name" required maxlength="120" autocomplete="off"></label><p>' + (linked ? 'Текущие текст, изображения и оформление заменят общий блок во всех ваших статьях ' + escapeHtml(ACTIVE_EDITOR.name) + '.' : 'Этот элемент станет связанным блоком. Его можно вставлять из библиотеки в другие статьи.') + '</p><p class="shared-dialog-error" role="alert"></p><footer><button type="button" class="shared-cancel">Отмена</button><button type="submit" class="primary">' + (linked ? 'Обновить во всех статьях' : 'Сохранить и связать') + '</button></footer></form>';
    const input = body.querySelector('input'); input.value = node.dataset.sharedName || node.textContent.trim().slice(0, 60) || 'Изображение';
    body.querySelector('.shared-cancel').onclick = () => box.close(); box.showModal(); input.focus(); input.select();
    body.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const submit = body.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        if (epoch !== articleSaveEpoch || !canvas.contains(node)) throw new Error('Статья изменилась. Выберите блок заново.');
        const root = canvas.cloneNode(false); root.append(clean(node));
        const payload = {name:input.value, html:clean(node).outerHTML, exportHtml:adminBody({root})};
        if (linked) Object.assign(payload, {id:node.dataset.sharedId, expectedRevision:node.dataset.sharedRevision});
        const record = await api('/api/shared-blocks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
        records = records.filter(r => r.id !== record.id); records.unshift(record);
        if (epoch !== articleSaveEpoch || !canvas.contains(node)) { box.close(); toast('Общий блок сохранён в библиотеке'); return; }
        flushArticleHistorySnapshot();
        const replacement = linkedNode(record, node); node.replaceWith(replacement);
        box.close(); applyRecords(); selectNode(replacement); protectTocArrows(); renderOutline(); changed();
        toast(linked ? 'Общий блок обновлён' : 'Блок сохранён и связан с библиотекой');
      } catch (error) { body.querySelector('.shared-dialog-error').textContent = error.message; submit.disabled = false; }
    };
  };
  $('#shared-block-detach').onclick = () => {
    const node = selected(); if (!node?.matches(selector)) return;
    flushArticleHistorySnapshot();
    for (const attr of [...node.attributes]) if (attr.name.startsWith('data-shared-')) node.removeAttribute(attr.name);
    baselines.delete(node); changed(); syncControls(); toast('Блок стал независимой копией');
  };
  $('#shared-block-refresh').onclick = async () => {
    const node = selected(), epoch = articleSaveEpoch; if (!node?.matches(selector)) return;
    try {
      await load();
      if (epoch !== articleSaveEpoch || !canvas.contains(node)) return;
      const record = records.find(r => r.id === node.dataset.sharedId);
      if (!record) throw new Error('Оригинал недоступен. Отвяжите сохранённую копию.');
      if (!dirty(node)) { applyRecords(node, record); toast('Получена актуальная версия блока'); return; }
      $('#shared-dialog-title').textContent = 'Получить серверную версию';
      body.innerHTML = '<p>Локальные правки этого блока заменятся актуальной версией из библиотеки. Их можно вернуть кнопкой «Отменить».</p><footer><button type="button" class="shared-cancel">Отмена</button><button type="button" class="shared-replace primary">Заменить этот блок</button></footer>';
      body.querySelector('.shared-cancel').onclick = () => box.close();
      body.querySelector('.shared-replace').onclick = () => {
        if (epoch !== articleSaveEpoch || !canvas.contains(node)) { box.close(); return; }
        box.close(); applyRecords(node, record); toast('Получена серверная версия блока');
      };
      box.showModal();
    } catch (error) { toast(error.message, true); }
  };
  canvas.addEventListener('editor:body-replaced', () => {
    // Other body-replacement listeners normalize the DOM synchronously first.
    queueMicrotask(() => {
      for (const node of canvas.querySelectorAll(selector)) if (!baselines.has(node)) baselines.set(node, clean(node).outerHTML);
      if (canvas.querySelector(selector)) load().catch(() => {});
    });
  });
  canvas.addEventListener('input', syncControls);
  for (const node of canvas.querySelectorAll(selector)) baselines.set(node, clean(node).outerHTML);
  window.addEventListener('focus', () => { if (available || canvas.querySelector(selector)) load().catch(() => {}); });
  window.addEventListener('online', () => { if (canvas.querySelector(selector)) load().catch(() => {}); });
  setInterval(() => { if (!document.hidden && canvas.querySelector(selector)) load().catch(() => {}); }, 15000);
  syncControls();
})();
