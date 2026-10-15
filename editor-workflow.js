/* Additive writing tools. Editorial proposals never enter export as markup. */
(() => {
  'use strict';
  const registry = window.ArticleCommands;
  if (!registry || !document.getElementById('canvas') || window.__ARTICLE_WORKFLOW_DISABLED__ === true) return;
  const toolbar = document.querySelector('.toolstrip');
  const icons = {
    proposal:'<path d="m16 3 5 5-12 12H4v-5L16 3Zm-3 3 5 5M3 4h6M3 8h3"/>',
    commands:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 9 3 3-3 3m5 0h3"/>',
    focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    macros:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M12 5h8m-8 7h8m-8 7h8"/>',
    find:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'
  };
  window.articleToolbarIcon = (node, name, label) => {
    node.classList.add('article-tool-icon');
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
    node.title = label; node.setAttribute('aria-label', label);
  };
  function button(id, text, title) {
    const node = document.createElement('button');
    node.id = id; node.type = 'button';
    articleToolbarIcon(node, text, title);
    toolbar.insertBefore(node, toolbar.querySelector('.editor-canvas-help'));
    return node;
  }
  const openButton = button('article-proposal-open', 'proposal', 'Правка: предложить правку выделенного текста');
  const commandsButton = button('article-commands-open', 'commands', 'Команды: поиск команд (Ctrl+Shift+K)');
  const focusButton = button('article-focus-toggle', 'focus', 'Фокус: скрыть боковые панели');
  focusButton.setAttribute('aria-pressed', 'false');
  const focus = value => {
    const active = typeof value === 'boolean' ? value : !document.body.classList.contains('article-focus');
    document.body.classList.toggle('article-focus', active);
    focusButton.setAttribute('aria-pressed', String(active));
    focusButton.title = active ? 'Выйти из фокуса' : 'Фокус: скрыть боковые панели';
    focusButton.setAttribute('aria-label', focusButton.title);
    return {active};
  };
  registry.register({id:'view.focus', label:'Режим фокуса', run:params => focus(params.value)});
  focusButton.onclick = () => registry.execute('view.focus');

  const proposal = document.createElement('dialog');
  proposal.id = 'article-proposal-dialog'; proposal.className = 'editor-dialog article-workflow-dialog';
  proposal.setAttribute('aria-labelledby', 'article-proposal-title');
  proposal.innerHTML = '<div class="dialog-head"><h2 id="article-proposal-title">Предложение правки</h2><button type="button" data-close aria-label="Закрыть предложение">×</button></div><p class="help">Выделите один текстовый фрагмент. Исходник изменится только после принятия. Для сложного форматирования правьте фрагменты по отдельности.</p><label>Задача<select id="article-proposal-task"><option value="shorten">Сократить</option><option value="clarify">Сделать понятнее</option><option value="correct">Исправить ошибки</option></select></label><div class="article-proposal-columns"><label>Исходный текст<textarea id="article-proposal-original" readonly></textarea></label><label>Предлагаемый текст<textarea id="article-proposal-text" maxlength="16000" placeholder="Вставьте или отредактируйте предложенный вариант"></textarea></label></div><p id="article-proposal-status" role="status" aria-live="polite"></p><div class="dialog-actions"><button id="article-proposal-generate" type="button" disabled>Предложить с ИИ</button><button id="article-proposal-reject" type="button">Отклонить</button><button id="article-proposal-accept" type="button" class="primary" disabled>Принять правку</button></div>';
  document.body.append(proposal);
  const original = proposal.querySelector('#article-proposal-original');
  const suggested = proposal.querySelector('#article-proposal-text');
  const status = proposal.querySelector('#article-proposal-status');
  const generate = proposal.querySelector('#article-proposal-generate');
  const accept = proposal.querySelector('#article-proposal-accept');
  const configure = document.createElement('button');configure.id='article-ai-settings';configure.type='button';configure.textContent='Настроить ИИ';configure.hidden=true;proposal.querySelector('.dialog-actions').append(configure);
  const settings=document.createElement('dialog');settings.id='article-ai-settings-dialog';settings.className='editor-dialog article-workflow-dialog';settings.setAttribute('aria-labelledby','article-ai-settings-title');
  settings.innerHTML='<div class="dialog-head"><h2 id="article-ai-settings-title">Настройка ИИ</h2><button data-close type="button" aria-label="Закрыть настройки ИИ">×</button></div><p class="help">OpenAI API. После подключения выделенный текст отправляется провайдеру по кнопке «Предложить с ИИ». Используется оплачиваемый API вашего аккаунта.</p><label>Идентификатор модели<input id="article-ai-model" maxlength="160" placeholder="Точный идентификатор из вашего API-аккаунта"></label><label>API-ключ<input id="article-ai-key" type="password" maxlength="512" autocomplete="new-password" placeholder="Оставьте пустым, чтобы сохранить текущий ключ"></label><p id="article-ai-settings-status" role="status"></p><div class="dialog-actions"><button id="article-ai-save" type="button" class="primary">Сохранить настройки</button><button id="article-ai-clear" type="button">Отключить ИИ</button></div>';
  document.body.append(settings);
  settings.querySelector('[data-close]').onclick=()=>settings.close();
  settings.addEventListener('close',()=>{settings.querySelector('#article-ai-key').value='';});
  settings.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();settings.close();}});
  configure.onclick=async()=>{settings.showModal();try{const info=await api('/api/article-assist/status');settings.querySelector('#article-ai-model').value=info.model||'';settings.querySelector('#article-ai-settings-status').textContent=info.managed?'Настройки управляются окружением сервера.':'Ключ хранится на сервере в зашифрованном виде и не возвращается в браузер.';settings.querySelector('#article-ai-save').disabled=!!info.managed;settings.querySelector('#article-ai-clear').disabled=!!info.managed;}catch(error){settings.querySelector('[role=status]').textContent=error.message;}};
  async function saveSettings(clear=false){
    const button=settings.querySelector(clear?'#article-ai-clear':'#article-ai-save');button.disabled=true;
    try{const result=await api('/api/article-assist/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clear?{clear:true}:{model:settings.querySelector('#article-ai-model').value.trim(),apiKey:settings.querySelector('#article-ai-key').value.trim()})});generate.disabled=!result.available;status.textContent=result.available?'Настройки ИИ сохранены. Доступ проверится при запросе предложения.':'ИИ отключён. Доступна ручная вставка предложения.';settings.close();}
    catch(error){settings.querySelector('[role=status]').textContent=error.message;}
    finally{button.disabled=false;settings.querySelector('#article-ai-key').value='';}
  }
  settings.querySelector('#article-ai-save').onclick=()=>saveSettings();settings.querySelector('#article-ai-clear').onclick=()=>saveSettings(true);
  let target = null, requestController = null, generation = 0;
  const validTarget = () => target && target.document === currentId && target.body === articleEditorSnapshot().body && target.range.startContainer.isConnected;
  function captureTarget() {
    const selection = getSelection();
    const range = selection?.rangeCount && canvas.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange() : lastRange?.cloneRange();
    if (!range || range.collapsed || !canvas.contains(range.commonAncestorContainer)) throw new Error('Сначала выделите текст в статье');
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) throw new Error('Выделите фрагмент внутри одного абзаца с одинаковым оформлением');
    const parent = range.startContainer.parentElement;
    if (!parent.closest('p,h1,h2,h3,h4,h5,h6,li,figcaption') || parent.closest('a,.om-toc,[contenteditable="false"],[data-shared-id]')) throw new Error('Для этого элемента используйте его настройки или независимый текстовый блок');
    if (range.toString().length > 8000) throw new Error('Выделите не более 8000 символов');
    const bookmark = articleSelectionBookmark();
    target = {range, text:range.toString(), document:currentId, body:articleEditorSnapshot().body, bookmark};
  }
  async function openProposal() {
    try { captureTarget(); } catch (error) { toast(error.message, true); return; }
    original.value = target.text; suggested.value = ''; suggested.disabled = false; accept.disabled = true; generate.disabled = true;
    configure.hidden=!window.__EDITOR_PROFILE__?.admin;
    status.textContent = 'Можно вставить предложенный текст вручную. Проверяем доступность ИИ…';
    // Non-modal: users can keep editing while the provider responds. Version
    // checks reject any proposal whose source document has since changed.
    proposal.show();
    const ticket = ++generation;
    try {
      const info = await api('/api/article-assist/status');
      if (ticket !== generation || !proposal.open) return;
      generate.disabled = !info.available;
      status.textContent = info.available ? 'ИИ получит только выделенный текст после нажатия кнопки. Проверьте факты перед принятием.' : 'ИИ не настроен на сервере. Вставьте предложенный текст вручную; принятие и отмена доступны.';
    } catch {
      if (ticket === generation && proposal.open) status.textContent = 'Сервер ИИ недоступен. Можно вставить предложенный текст вручную.';
    }
  }
  registry.register({id:'review.propose', label:'Предложить правку выделенного текста', run:openProposal});
  registry.register({id:'review.applyProposal', label:'Принять текущую правку', params:{text:'текст'}, run:({text}) => {
    if (!validTarget()) throw new Error('Статья изменилась. Закройте предложение, выделите актуальный фрагмент и повторите запрос.');
    if (typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Введите текст правки от 1 до 16000 символов');
    if (text === target.text) return {changed:false};
    flushArticleHistorySnapshot();
    restoreArticleSelection(target.bookmark);
    rememberArticleSelectionBeforeInput();
    // Same text node retains inherited font, links outside selection and block structure.
    const range = target.range, node = range.startContainer;
    const start = range.startOffset;
    node.replaceData(start, range.endOffset-start, text);
    range.setStart(node, start); range.setEnd(node, start+text.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    lastRange = range.cloneRange();
    changed(); syncTextToolbarState();
    return {changed:true};
  }});
  openButton.onclick = openProposal;
  suggested.oninput = () => { accept.disabled = !suggested.value.trim() || suggested.value.length > 16000; };
  function closeProposal() { proposal.close(); }
  proposal.querySelector('[data-close]').onclick = closeProposal;
  proposal.querySelector('#article-proposal-reject').onclick = closeProposal;
  proposal.addEventListener('close', () => {
    generation++; requestController?.abort(); requestController = null;
    if (validTarget()) restoreArticleSelection(target.bookmark);
    target = null; openButton.focus({preventScroll:true});
  });
  accept.onclick = () => {
    try { registry.execute('review.applyProposal', {text:suggested.value}); closeProposal(); }
    catch (error) { status.textContent = error.message; }
  };
  generate.onclick = async () => {
    if (!validTarget()) { status.textContent = 'Статья изменилась. Выделите актуальный текст заново.'; return; }
    const ticket = ++generation;
    requestController = new AbortController();
    generate.disabled = true; accept.disabled = true; suggested.disabled = true;
    status.textContent = 'Получаем предложение. Исходный текст сохраняется.';
    try {
      const result = await api('/api/article-assist/propose', {method:'POST', signal:requestController.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:target.text,task:proposal.querySelector('#article-proposal-task').value})});
      if (ticket !== generation || !proposal.open) return;
      if (!validTarget()) { status.textContent = 'Статья изменилась во время запроса. Запросите правку заново.'; return; }
      suggested.value = result.text;
      status.textContent = 'Предложение готово. Проверьте факты и формулировки; можно изменить текст перед принятием.';
    } catch (error) { if (ticket === generation && error.name !== 'AbortError') status.textContent = error.message; }
    finally { if (ticket === generation && proposal.open) { generate.disabled = false; suggested.disabled = false; suggested.oninput(); } }
  };

  const palette = document.createElement('dialog');
  palette.id = 'article-command-dialog'; palette.className = 'editor-dialog article-workflow-dialog';
  palette.setAttribute('aria-labelledby', 'article-command-title');
  palette.innerHTML = '<div class="dialog-head"><h2 id="article-command-title">Команды редактора</h2><button type="button" data-close aria-label="Закрыть команды">×</button></div><label>Найти действие<input id="article-command-search" type="search" placeholder="Например, жирный или фокус"></label><div id="article-command-results" class="article-command-results"></div><p id="article-command-status" role="status"></p>';
  document.body.append(palette);
  const query = palette.querySelector('input'), results = palette.querySelector('#article-command-results');
  let paletteBookmark = null, paletteAction = false;
  function renderCommands() {
    results.replaceChildren();
    for (const spec of registry.list(query.value).filter(spec => spec.id !== 'review.applyProposal')) {
      const item = document.createElement('button'); item.type = 'button'; item.textContent = spec.label;
      item.disabled = !!spec.disabled; item.title = spec.disabled || spec.shortcut;
      item.onclick = () => {
        paletteAction = true;
        palette.close(); restoreArticleSelection(paletteBookmark);
        try { registry.execute(spec.id); } catch (error) { toast(error.message, true); }
      };
      // Parameterized styles are available to integrations, not incomplete palette actions.
      if (Object.keys(spec.params).length) continue;
      results.append(item);
    }
    palette.querySelector('#article-command-status').textContent = results.childElementCount ? '' : 'Команды не найдены';
  }
  const openCommands = () => { paletteAction = false; paletteBookmark = articleSelectionBookmark(); query.value = ''; renderCommands(); palette.showModal(); query.focus(); };
  commandsButton.onclick = openCommands; query.oninput = renderCommands;
  palette.querySelector('[data-close]').onclick = () => palette.close();
  palette.addEventListener('close', () => {if (!paletteAction) commandsButton.focus({preventScroll:true});paletteAction=false;});
  for (const dialog of [proposal, palette]) dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyK' && !document.querySelector('dialog[open]')) { event.preventDefault(); openCommands(); }
    if (event.key === 'Escape' && document.body.classList.contains('article-focus') && !document.querySelector('dialog[open]')) { focus(false); }
  });

  function downloadText(text, extension, mime) {
    const url = URL.createObjectURL(new Blob([text], {type:mime+';charset=utf-8'}));
    const link = document.createElement('a'); link.href = url;
    link.download = cleanId(document.getElementById('filename').value || 'article')+'.'+extension;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function markdownText() {
    const root = document.createElement('div'); root.innerHTML = adminBody();
    root.querySelectorAll('script,style').forEach(node => node.remove());
    const escape = text => text.replace(/([\\`*_\[\]<>])/g, '\\$1');
    function render(node) {
      if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const content = () => [...node.childNodes].map(render).join('');
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return '\n\n'+'#'.repeat(Number(tag[1]))+' '+content().trim()+'\n\n';
      if (tag === 'br') return '  \n';
      if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'strong' || tag === 'b') return '**'+content()+'**';
      if (tag === 'em' || tag === 'i') return '*'+content()+'*';
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        return /^(https?:|mailto:|tel:|\/|#)/i.test(href) ? '['+content()+']('+href.replace(/[()\s]/g,encodeURIComponent)+')' : content();
      }
      if (tag === 'img') {
        const src = node.getAttribute('src') || '';
        return /^(https?:|\/)/i.test(src) ? '!['+escape(node.alt || '')+']('+src.replace(/[()\s]/g,encodeURIComponent)+')' : '';
      }
      if (tag === 'ul' || tag === 'ol') return '\n\n'+[...node.children].map((li,i)=>(tag==='ol'?(i+1)+'. ':'- ')+[...li.childNodes].map(render).join('').trim().replace(/\n/g,'\n  ')).join('\n')+'\n\n';
      if (tag === 'tr') return [...node.cells].map(cell=>[...cell.childNodes].map(render).join('').trim()).join(' | ')+'\n';
      if (tag === 'blockquote') return '\n\n'+content().trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
      if (['p','div','section','article','header','nav','figure','figcaption','table'].includes(tag)) return '\n\n'+content()+'\n\n';
      return content();
    }
    return [...root.childNodes].map(render).join('').replace(/\n{3,}/g,'\n\n').trim()+'\n';
  }
  registry.register({id:'export.markdown', label:'Скачать текст статьи в Markdown', run:() => {
    const text = markdownText(); downloadText(text,'md','text/markdown'); return {text};
  }});
  const exportDialog = document.getElementById('export-dialog');
  const md = document.createElement('button'); md.id = 'export-markdown'; md.type = 'button'; md.textContent = 'Скачать текст Markdown';
  md.onclick = () => { registry.execute('export.markdown'); exportDialog.close(); };
  const note = document.createElement('p'); note.className = 'help';
  note.textContent = 'Markdown — текстовая копия с заголовками, списками, ссылками и адресами фото. Оформление карточек, таблиц и локальные файлы не переносится. Для публикации и переноса изображений используйте HTML / ZIP.';
  exportDialog.querySelector('.dialog-actions').before(note);
  exportDialog.querySelector('.dialog-actions').append(md);
})();
