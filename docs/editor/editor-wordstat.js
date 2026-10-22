/* Read-only Wordstat research shared by articles and email. No document/undo writes. */
(() => {
  'use strict';
  if (window.EditorWordstat) return;
  const email = !!document.getElementById('editor-toolbar');
  const previewHost = !!document.getElementById('review-frame');
  const builderHost = location.pathname.startsWith('/site-builder/');
  const toolbar = document.querySelector(previewHost ? '.review-actions' : email ? '#editor-toolbar' : '.toolstrip');
  const registry = previewHost || builderHost ? {register(){}} : email ? window.EmailCommands : window.ArticleCommands;
  if (!toolbar || !registry) return;
  const style = document.createElement('style');
  style.textContent = `
    #wordstat-open img,#wordstat-preview-open img{display:block;width:20px;height:20px;object-fit:contain;pointer-events:none}
    #wordstat-dialog{width:min(920px,calc(100vw - 24px));height:min(900px,90dvh);max-height:90dvh;padding:0;box-sizing:border-box;overflow:hidden;border:1px solid #d9dde3;border-radius:16px;background:#fff;color:#20242b}
    #wordstat-dialog[open]{display:flex;flex-direction:column}
    #wordstat-dialog>header{flex:none;padding:24px 24px 12px}
    #wordstat-dialog .ws-scroll-body{min-height:0;flex:1;overflow:auto;padding:0 24px 24px;overscroll-behavior:contain}
    #wordstat-dialog::backdrop{background:#0006}
    #wordstat-dialog *{box-sizing:border-box}
    #wordstat-dialog [hidden]{display:none!important}
    #wordstat-dialog header,#wordstat-dialog .ws-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    #wordstat-dialog h2{margin:0;font-size:22px}
    #wordstat-dialog p{line-height:1.5}
    #wordstat-dialog .ws-help{font-size:13px;color:#59616d}
    #wordstat-dialog #ws-region-tree{max-height:280px;overflow:auto;border:1px solid #d9dde3;border-radius:7px;padding:10px;margin-top:8px}
    #wordstat-dialog #ws-region-tree input{width:16px;min-height:16px;flex:0 0 16px;margin:4px 0}
    #wordstat-dialog #ws-region-tree label{display:flex;gap:8px;align-items:flex-start;min-width:0;overflow-wrap:break-word}
    #wordstat-dialog .ws-territory-row{display:flex;align-items:center;gap:6px;margin:2px 0}
    #wordstat-dialog .ws-territory-row button{padding:0;min-width:36px;min-height:36px;flex:0 0 36px}
    #wordstat-dialog .ws-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}
    #wordstat-dialog label{display:grid;gap:6px;font-size:13px;min-width:0}
    #wordstat-dialog input,#wordstat-dialog select{width:100%;min-width:0;min-height:42px;padding:9px;border:1px solid #b9c0ca;border-radius:7px;background:white;color:inherit;font:inherit}
    #wordstat-dialog button{min-height:40px;padding:8px 14px;cursor:pointer;border:1px solid #b9c0ca;border-radius:7px;background:#f6f7f9;color:inherit;font:inherit}
    #wordstat-dialog button:disabled{opacity:.55;cursor:default}
    #wordstat-dialog button:active:not(:disabled){transform:scale(.98)}
    #wordstat-dialog :focus-visible{outline:2px solid #245bcc;outline-offset:2px}
    #wordstat-dialog #ws-run{background:#20242b;color:white;border-color:#20242b}
    #wordstat-dialog details{border-top:1px solid #d9dde3;padding-top:12px;margin-top:18px}
    #wordstat-dialog summary{cursor:pointer;padding:8px 0}
    #wordstat-dialog .ws-table{overflow:auto;margin-top:16px;max-height:360px}
    #wordstat-dialog .ws-query-choice{display:flex;align-items:flex-start;gap:9px;font-size:13px;line-height:1.5;cursor:pointer}
    #wordstat-dialog .ws-query-choice input,#wordstat-dialog #ws-select-all{width:18px;min-height:18px;height:18px;flex:none;margin:1px 0;padding:0;accent-color:#20242b}
    #wordstat-dialog .ws-highlight-actions{flex:none;margin:0;padding:16px 24px;background:#fff;border-top:1px solid #d9dde3}
    #wordstat-dialog .ws-highlight-actions>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    #wordstat-dialog .ws-highlight-actions label{display:flex;align-items:center;gap:8px;margin-right:auto}
    #wordstat-dialog #ws-apply{background:#20242b;color:#fff;border-color:#20242b}
    #wordstat-dialog #ws-highlight-status{margin:8px 0 0;font-size:12px;color:#59616d}
    #wordstat-dialog table{border-collapse:collapse;width:100%;font-size:13px}
    #wordstat-dialog caption{text-align:left;font-weight:600;padding:8px 0}
    #wordstat-dialog th,#wordstat-dialog td{padding:10px 8px;border-bottom:1px solid #e3e6eb;text-align:left;vertical-align:top}
    #wordstat-dialog td:first-child{overflow-wrap:anywhere}
    #wordstat-dialog td:not(:first-child),#wordstat-dialog th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    #wordstat-dialog th{background:#f6f7f9;position:sticky;top:0}
    #wordstat-dialog #ws-status{min-height:24px}
    #wordstat-dialog .ws-chart-wrap{overflow:auto;margin-top:16px}
    #wordstat-dialog .ws-chart-wrap{position:relative}
    #wordstat-dialog .ws-chart-tip{position:absolute;background:#fff;color:#10334f;border-radius:4px;padding:10px 12px;box-shadow:0 5px 16px #0005;font-size:12px;line-height:1.6;pointer-events:none;z-index:2;white-space:nowrap}
    #wordstat-dialog .ws-chart-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px}
    #wordstat-dialog svg.ws-chart{display:block;width:100%;min-width:480px;height:200px;color:#245bcc}
    @media(max-width:600px){#wordstat-dialog>header{padding:16px 16px 12px}#wordstat-dialog .ws-scroll-body{padding:0 16px 16px}#wordstat-dialog .ws-fields{grid-template-columns:1fr}#wordstat-dialog button{min-height:44px}#wordstat-dialog .ws-highlight-actions{padding:12px 16px}#wordstat-dialog .ws-highlight-actions label{flex-basis:100%;min-height:44px}}
  `;
  document.head.append(style);
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'wordstat-open';
  button.className = email ? 'email-command-icon' : 'article-tool-icon';
  button.title = 'Яндекс Wordstat: фразы, динамика и регионы';
  button.setAttribute('aria-label', button.title); button.setAttribute('aria-haspopup', 'dialog');
  const icon = document.createElement('img');
  icon.src = previewHost ? new URL('wordstat-icon.png',location.href).href : builderHost ? '/images/Yandex_icon.svg.png' : new URL('images/Yandex_icon.svg.png', document.currentScript?.src || location.origin + '/').href;
  icon.alt = ''; icon.width = icon.height = 20; icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  if(previewHost){button.append(document.createTextNode(' Wordstat'));button.style.cssText='display:inline-flex;align-items:center;gap:6px';}
  toolbar.insertBefore(button, toolbar.querySelector('.editor-canvas-help'));
  const dialog = document.createElement('dialog');
  dialog.id = 'wordstat-dialog'; dialog.setAttribute('aria-labelledby', 'ws-title');
  dialog.innerHTML = `
    <header><h2 id="ws-title">Яндекс Wordstat</h2><button type="button" id="ws-close" aria-label="Закрыть Wordstat">×</button></header>
    <p class="ws-help">Поисковый спрос для вашего материала. Запросы отправляются в Yandex Cloud только по кнопке и расходуют его квоту/бюджет.</p>
    <form id="ws-form">
      <label>Ключевая фраза<input id="ws-phrase" maxlength="400" required placeholder="Например, кроссовки для бега"></label>
      <div class="ws-fields">
        <label>Отчёт<select id="ws-mode"><option value="top">Подбор фраз</option><option value="dynamics">Динамика спроса</option><option value="regions">Регионы</option></select></label>
        <label>Устройства<select id="ws-device"><option value="DEVICE_ALL">Все устройства</option><option value="DEVICE_DESKTOP">Компьютеры</option><option value="DEVICE_PHONE">Телефоны</option><option value="DEVICE_TABLET">Планшеты</option></select></label>
      </div>
      <div id="ws-geography">
        <label>Регион для фраз и динамики<select id="ws-regions"><option value="">Все регионы</option></select></label>
        <div id="ws-region-tree" hidden aria-label="Выбор нескольких регионов"></div>
      </div>
      <button type="button" id="ws-tree">Загрузить справочник регионов</button>
      <div id="ws-dates" class="ws-fields" hidden>
        <label>Начало периода<input type="date" id="ws-from"></label>
        <label>Конец периода<input type="date" id="ws-to"></label>
        <label>Шаг<select id="ws-period"><option value="PERIOD_MONTHLY">Месяц</option><option value="PERIOD_WEEKLY">Неделя</option><option value="PERIOD_DAILY">День</option></select></label>
        <p class="ws-help">Для месяцев и недель выбирайте полные периоды. Доступная глубина истории и операторы зависят от ограничений Яндекса.</p>
      </div>
      <label id="ws-region-kind" hidden>Распределение по всем территориям<select id="ws-region"><option value="REGION_ALL">Все уровни</option><option value="REGION_CITIES">Города</option><option value="REGION_REGIONS">Регионы</option></select></label>
      <p id="ws-status" role="status" aria-live="polite"></p>
      <div class="ws-actions"><button type="submit" id="ws-run" disabled>Получить данные</button><a href="/instructions/#wordstat" target="_blank" rel="noopener">Как подключить и использовать</a></div>
    </form>
    <section id="ws-results" aria-label="Результаты Wordstat"></section>
    <details id="ws-analysis"><summary>SEO-анализ статьи: найти поисковые фразы</summary>
      <p class="ws-help">Фразы подбираются из заголовков и текста автоматически. Проверяются до 12 кандидатов: один запрос Wordstat на фразу. Сильные/средние/низкие — относительная частотность проверенных фраз за 30 дней, а не позиции сайта или гарантия SEO. Используются выбранные выше регион и устройства.</p>
      <button type="button" id="ws-analyze">Исследовать статью</button><button type="button" id="ws-analysis-stop">Остановить проверку</button>
      <p id="ws-analysis-status" role="status"></p><div id="ws-analysis-results" class="ws-table"></div>
    </details>
    <details id="ws-settings" hidden><summary>Подключение Wordstat</summary>
      <p class="ws-help">API-ключ сервисного аккаунта: область yc.search-api.execute, роль search-api.webSearch.user в указанном каталоге. Ключ шифруется на сервере.</p>
      <div class="ws-fields"><label>Идентификатор каталога<input id="ws-folder" maxlength="50" autocomplete="off"></label><label>API-ключ<input id="ws-key" type="password" maxlength="512" autocomplete="new-password" placeholder="Пустое поле сохраняет текущий ключ"></label></div>
      <div class="ws-actions"><button type="button" id="ws-save">Сохранить подключение</button><button type="button" id="ws-clear">Отключить</button></div>
      <p id="ws-settings-status" role="status"></p>
    </details><footer class="ws-highlight-actions"><div><label><input type="checkbox" id="ws-select-all">Выбрать все запросы</label><button type="button" id="ws-apply" disabled>Применить</button><button type="button" id="ws-unhighlight" disabled>Отменить выделенное</button></div><p id="ws-highlight-status" role="status">Выберите запросы из результатов. Зелёным автоматически отмечаются запросы из ТЗ.</p></footer>`;
  const scrollBody=document.createElement('div');scrollBody.className='ws-scroll-body';const header=dialog.querySelector('header'),footer=dialog.querySelector('footer');
  while(header.nextSibling&&header.nextSibling!==footer)scrollBody.append(header.nextSibling);dialog.insertBefore(scrollBody,footer);
  document.body.append(dialog);
  const $ = id => dialog.querySelector('#ws-' + id);
  let generation = 0, connectionGeneration = 0, controller = null, available = false, busy = false;
  let connectionInfo = null, saving = false;
  let regionNames = new Map();
  let selectedRegions=[];
  let regionChoiceEmpty=false;
  const catalog=new Map(),chosen=new Set();let pendingSnapshot=null,applied=false;
  const queryRegions=()=>selectedRegions.length?selectedRegions:($('regions').value?[$('regions').value]:[]);
  const number = value => /^\d+$/.test(String(value)) ? BigInt(value).toLocaleString('ru-RU') : String(value || '—');
  async function api(path, data, signal) {
    const requestController = new AbortController();
    const abort = () => requestController.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, {once:true});
    const timeout = setTimeout(abort, 45000);
    try {
      const response = await fetch((window.__EDITOR_API_PREFIX__ || '/editor-api') + '/wordstat/' + path, {
        method: data ? 'POST' : 'GET', signal:requestController.signal,
        ...(data ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {})
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('Сервер Wordstat недоступен. Проверьте подключение к редактору.'); }
      if (!response.ok) {const error=new Error(result?.error || 'Не удалось выполнить запрос Wordstat');error.loginRequired=response.status===401;throw error;}
      if (!result || typeof result !== 'object') throw new Error('Не удалось прочитать ответ сервера Wordstat. Повторите запрос.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Запрос отменён или время ожидания истекло. Повторите запрос по кнопке.');
      if (error instanceof TypeError) throw new Error('Не удалось связаться с сервером. Проверьте подключение и повторите запрос по кнопке.');
      throw error;
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort);
    }
  }
  function controls() {
    footer.hidden=!catalog.size&&!applied;
    $('tree').disabled = !available || busy || saving;
    $('run').disabled = !available || busy || saving || regionChoiceEmpty || selectedRegions.length>100;
    $('analyze').disabled = !available || busy || saving || regionChoiceEmpty || selectedRegions.length>100 || !window.WordstatSeo;
    $('apply').disabled=busy||saving||!chosen.size||!pendingSnapshot;
    $('unhighlight').disabled=!applied;
    $('select-all').disabled=!catalog.size||busy;
    const locked = saving || !connectionInfo || !!connectionInfo.managed;
    $('save').disabled = $('clear').disabled = locked;
    $('folder').disabled = $('key').disabled = locked;
  }
  function invalidate(preserveHighlight=false) {
    generation++; controller?.abort(); controller = null; busy = false;
    $('results').replaceChildren(); $('analysis-results').replaceChildren();catalog.clear();chosen.clear();pendingSnapshot=null;selectionControls();controls();
  }
  function switchMode() {
    const mode = $('mode').value;
    $('dates').hidden = mode !== 'dynamics';
    $('geography').hidden = mode === 'regions';
    $('region-kind').hidden = mode !== 'regions';
    $('from').required = $('to').required = mode === 'dynamics';
    invalidate(); $('status').textContent = 'Нажмите «Получить данные» для выбранных условий.';
  }
  function applyStatus(info) {
    connectionInfo = info;
    available = !!info.available; controls();
    $('settings').hidden = !info.canConfigure;
    $('folder').value = info.folderId || '';
    $('settings-status').textContent = info.managed ? 'Подключение управляется окружением сервера.' : '';
    $('status').textContent = available ? 'Подключение настроено. Доступ проверится при запросе.' : 'Wordstat не подключён. Нужна настройка администратора.';
  }
  let useLocalPreview=false;
  const previewContext=builderHost?window.SiteWordstat:previewHost&&window.WordstatSeo?WordstatSeo.previewAdapter():null;
  function requireLogin(error){
    $('status').textContent=error.message;
    if(error.loginRequired){const link=document.createElement('a');link.href='/login?next='+encodeURIComponent(location.pathname+location.search);link.textContent=' Войти в учётную запись';$('status').append(link);}
  }
  async function open(options={}) {
    if (dialog.open) return;
    useLocalPreview=!!options.preview;invalidate(); dialog.showModal(); $('phrase').focus();
    $('settings').hidden = true;
    connectionInfo = null; available = false; controls(); $('status').textContent = 'Проверяем подключение…';
    const ticket = ++connectionGeneration;
    try { const info = await api('status'); if (ticket === connectionGeneration && dialog.open) applyStatus(info); }
    catch (error) { if (ticket === connectionGeneration && dialog.open) requireLogin(error); }
  }
  if(builderHost){$('analysis').querySelector('summary').textContent='SEO-анализ страницы: найти поисковые фразы';$('analyze').textContent='Исследовать страницу';$('highlight-status').textContent='Выберите запросы и примените подсветку в предпросмотре страницы.';}
  button.onclick = open;
  registry.register({id:'research.wordstat', label:'Яндекс Wordstat: фразы, динамика и регионы', run:open});
  window.EditorWordstat = {open};
  if(!previewHost&&!email&&document.getElementById('desktop')){
    const previewButton=button.cloneNode(true);previewButton.id='wordstat-preview-open';previewButton.onclick=()=>open({preview:true});if(builderHost)document.querySelector('.preview-modes').append(previewButton);else document.getElementById('desktop').before(previewButton);if(builderHost){previewButton.textContent='Анализ страницы';previewButton.title='Яндекс Wordstat: анализ страницы в предпросмотре';}
  }
  function selectionControls(){
    $('select-all').checked=!!catalog.size&&chosen.size===catalog.size;$('select-all').indeterminate=!!chosen.size&&chosen.size<catalog.size;
    dialog.querySelectorAll('[data-ws-choice]').forEach(input=>input.checked=chosen.has(input.dataset.wsChoice));
    if(catalog.size)$('highlight-status').textContent='Выбрано запросов: '+chosen.size+' из '+catalog.size+'. '+(applied?'Ранее применённое выделение сохраняется.':'Подсветка появится после «Применить».');
    controls();
  }
  function contextLabel(data){return (data.regions?.length?data.regions.slice(0,3).map(id=>regionNames.get(id)||'Регион '+id).join(', ')+(data.regions.length>3?' и ещё '+(data.regions.length-3):''):'Все регионы')+' · '+$('device').selectedOptions[0].textContent;}
  function choice(cell,row){
    const key=WordstatSeo.norm(row.phrase);catalog.set(key,{...row,count:String(row.count)});const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');label.className='ws-query-choice';input.type='checkbox';input.dataset.wsChoice=key;input.setAttribute('aria-label','Выбрать запрос '+row.phrase);input.checked=chosen.has(key);text.textContent=row.phrase;input.onchange=()=>{input.checked?chosen.add(key):chosen.delete(key);selectionControls();};label.append(input,text);cell.replaceChildren(label);
  }
  $('select-all').onchange=()=>{chosen.clear();if($('select-all').checked)for(const key of catalog.keys())chosen.add(key);selectionControls();};
  async function applyRows(rows,jump=true){
    const now=await analysisSnapshot();if(!pendingSnapshot||now.signature!==pendingSnapshot.signature)throw Error('Материал изменился. Получите данные заново перед применением.');
    const result=previewContext?await previewContext.apply(rows,pendingSnapshot.signature,jump):WordstatSeo.apply(now.root,rows,{jump});applied=!!result.occurrences;
    $('highlight-status').textContent=(builderHost?'Запросов на странице: ':'Запросов в статье: ')+result.phrases+' из '+rows.length+'. Вхождений: '+result.occurrences+(builderHost?'. Подсветка показана в предпросмотре.':'. Запросы из ТЗ остаются зелёными.');
    controls();if(result.occurrences)dialog.close();return result;
  }
  $('apply').onclick=()=>applyRows([...chosen].map(key=>catalog.get(key))).catch(error=>$('highlight-status').textContent=error.message);
  $('unhighlight').onclick=()=>{WordstatSeo.clear();previewContext?.clear();applied=false;controls();$('highlight-status').textContent=builderHost?'Выделение Wordstat в предпросмотре отменено.':'Выделение Wordstat отменено. Запросы из ТЗ остаются зелёными.';};
  document.addEventListener('wordstat:scope-changed',()=>{applied=false;invalidate();$('highlight-status').textContent='Открыт другой материал. Выберите запросы для новой проверки.';});
  async function analysisSnapshot(){
    if(previewContext)return previewContext.snapshot();
    const root=useLocalPreview?document.getElementById('preview')?.contentDocument?.querySelector('article'):document.getElementById('canvas');
    if(!root)throw Error('Откройте материал и дождитесь предпросмотра.');
    const items=WordstatSeo.blocks(root),blocks=items.map(({tag,text})=>({tag,text}));
    return {root,blocks,signature:JSON.stringify([window.EditorQuality?.signature(),root.innerHTML])};
  }
  $('analysis-stop').onclick=()=>{invalidate();$('analysis-status').textContent='Проверка остановлена. Применённое выделение сохраняется.';};
  $('analyze').onclick=async()=>{
    if(busy||!available||!window.WordstatSeo)return;
    WordstatSeo.refreshEditor();
    invalidate();busy=true;controls();controller=new AbortController();const ticket=generation;
    const rows=[];let snapshot,researchContext='';
    const current=async()=>{const now=await analysisSnapshot();if(ticket!==generation||!dialog.open||now.signature!==snapshot.signature)throw Error('Материал изменился. Повторите анализ.');};
    const show=()=>{
      const sorted=[...rows].sort((a,b)=>a.count===b.count?a.phrase.localeCompare(b.phrase,'ru'):a.count>b.count?-1:1),max=sorted[0]?.count||0n;
      const table=document.createElement('table'),head=table.createTHead().insertRow();for(const label of ['Фраза','Запросы / 30 дней','Частотность',builderHost?'На странице':'В статье']){const th=document.createElement('th');th.textContent=label;head.append(th);}
      const body=table.createTBody();for(const row of sorted){const level=!row.count?'Нет спроса':row.count*3n>=max*2n?'Сильная':row.count*5n>=max?'Средняя':'Низкая',record={...row,count:String(row.count),label:level,context:researchContext};const tr=body.insertRow();choice(tr.insertCell(),record);tr.insertCell().textContent=number(row.count);tr.insertCell().textContent=level;const locate=document.createElement('button');locate.type='button';locate.textContent='Показать';locate.onclick=async()=>{try{await current();await applyRows([record]);}catch(error){$('analysis-status').textContent=error.message;}};tr.insertCell().append(locate);}
      $('analysis-results').replaceChildren(table);selectionControls();
    };
    try{
      snapshot=await analysisSnapshot();pendingSnapshot=snapshot;const candidates=WordstatSeo.discover(snapshot.blocks,12);researchContext=contextLabel({regions:queryRegions()});
      if(!candidates.length)throw Error('Не удалось выделить поисковые фразы. Добавьте содержательные заголовки и текст.');
      for(const item of candidates){
        await current();$('analysis-status').textContent=`Проверяем ${rows.length+1} из ${candidates.length}: ${item.phrase}`;
        const result=await api('query',{mode:'top',phrase:item.phrase,device:$('device').value,regions:queryRegions()},controller.signal);
        await current();if(!/^\d+$/.test(String(result.totalCount)))throw Error('Wordstat вернул некорректную частотность.');
        rows.push({phrase:item.phrase,count:BigInt(result.totalCount)});show();
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      $('analysis-status').textContent=`Проверено фраз: ${rows.length}. Широкое соответствие Wordstat; непроверенные фразы не оцениваются. Показаны все вхождения выбранной фразы, до 100.`;
    }catch(error){if(ticket===generation){$('analysis-status').textContent=error.message;if(error.message.includes('Материал изменился'))$('analysis-results').replaceChildren();}}
    finally{if(ticket===generation){busy=false;controller=null;controls();}}
  };
  $('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {connectionGeneration++;invalidate();$('key').value='';button.focus({preventScroll:true});});
  $('mode').onchange = switchMode;
  for (const id of ['phrase','device','regions','from','to','period','region']) {
    $(id).addEventListener('input', () => { invalidate(); $('status').textContent = 'Условия изменились. Получите данные заново.'; });
  }
  const now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), 0), start = new Date(end.getFullYear(), end.getMonth()-11, 1);
  const date = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  $('from').value = date(start); $('to').value = date(end); $('to').max = date(now);
  function table(title, headers, rows, records=null) {
    const wrap = document.createElement('div'); wrap.className = 'ws-table';
    const table = document.createElement('table'), caption = table.createCaption();
    caption.textContent = title;
    const head = table.createTHead().insertRow();
    headers.forEach(label => { const th=document.createElement('th'); th.scope='col'; th.textContent=label; head.append(th); });
    const body = table.createTBody();
    rows.forEach((values,index) => { const row=body.insertRow(); values.forEach((value,column) => { const cell=row.insertCell();if(!column&&records)choice(cell,records[index]);else cell.textContent=String(value); }); });
    wrap.append(table); $('results').append(wrap);
  }
  function render(data, query) {
    $('results').replaceChildren();
    const title = document.createElement('p');
    title.textContent = `«${query.phrase}» · ${$('device').selectedOptions[0].textContent} · ` +
      (query.mode === 'regions' ? $('region').selectedOptions[0].textContent + ' · последние 30 дней' :
        (query.regions?.length?query.regions.map(id=>regionNames.get(id)||`Регион ${id}`).join(', '):'Все регионы') + (query.mode === 'top' ? ' · последние 30 дней' : ` · ${query.fromDate} — ${query.toDate}`));
    $('results').append(title);
    if (query.mode === 'top') {
      const records=rows=>rows.map(row=>({...row,label:'Подбор фраз',context:contextLabel(query)}));
      table('Популярные фразы · всего запросов: '+number(data.totalCount), ['Фраза','Запросы'], data.results.map(r=>[r.phrase,number(r.count)]),records(data.results));
      table('Похожие запросы', ['Фраза','Запросы'], data.associations.map(r=>[r.phrase,number(r.count)]),records(data.associations));selectionControls();
    } else if (query.mode === 'dynamics') {
      const values = data.results.map(r=>Number(r.count)), times=data.results.map(r=>Date.parse(r.date));
      const max=Math.max(1,...values), magnitude=10**Math.floor(Math.log10(max/4));
      const tickStep=Math.max(1,Math.ceil(max/4/magnitude)*magnitude), ceiling=(Math.floor(max/tickStep)+1)*tickStep;
      if (values.length > 1 && values.every(v=>Number.isFinite(v)&&v>=0) && times.every((v,i)=>Number.isFinite(v)&&(!i||v>times[i-1]))) {
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.classList.add('ws-chart');
        svg.setAttribute('viewBox','0 0 800 200'); svg.setAttribute('role','img'); svg.setAttribute('aria-label','Динамика числа запросов за выбранный период. Точные значения в таблице ниже.');
        const add = (name, attributes, text) => {
          const node=document.createElementNS(svg.namespaceURI,name);
          Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,String(value)));
          if(text!==undefined)node.textContent=text;
          svg.append(node); return node;
        };
        const left=100,right=700,top=16,bottom=160;
        const x=i=>left+(times[i]-times[0])*(right-left)/(times.at(-1)-times[0]);
        // Integer counts, a zero baseline and dates on a real time scale.
        const tickCount=ceiling/tickStep;
        for(let i=0;i<=tickCount;i++){
          const value=tickStep*i,y=bottom-value/ceiling*(bottom-top);
          add('line',{x1:left,x2:right,y1:y,y2:y,stroke:'#e3e6eb'});
          add('text',{x:left-10,y:y+4,'text-anchor':'end',fill:'#59616d','font-size':12},number(String(value)));
        }
        const step=Math.max(1,Math.ceil((values.length-1)/4));
        for(let i=0;i<values.length;i+=step){
          add('text',{x:x(i),y:186,'text-anchor':i===0?'start':i===values.length-1?'end':'middle',fill:'#59616d','font-size':12},data.results[i].date.slice(0,10));
        }
        const line=document.createElementNS(svg.namespaceURI,'polyline'); line.setAttribute('fill','none'); line.setAttribute('stroke','#1686ee'); line.setAttribute('stroke-width','2');
        line.setAttribute('points',values.map((v,i)=>`${x(i)},${bottom-v/ceiling*(bottom-top)}`).join(' ')); svg.append(line);
        const wrap=document.createElement('div'); wrap.className='ws-chart-wrap'; wrap.append(svg); $('results').append(wrap);
        const shares=data.results.map(r=>Number(r.share)),hasShares=shares.every(v=>Number.isFinite(v)&&v>=0),shareMax=Math.max(...shares,0);
        const percent=value=>Number.isFinite(value)?(value*100).toLocaleString('ru-RU',{maximumFractionDigits:8})+' %':'—';
        if(hasShares){const second=add('polyline',{fill:'none',stroke:'#ff432c','stroke-width':2,points:shares.map((v,i)=>`${x(i)},${bottom-(shareMax?v/shareMax:0)*(bottom-top)}`).join(' ')});second.classList.add('ws-share-line');
          for(let i=0;i<=4;i++)add('text',{x:790,y:bottom-i*(bottom-top)/4+4,'text-anchor':'end',fill:'#e23b28','font-size':11},percent(shareMax*i/4));}
        const legend=document.createElement('p');legend.className='ws-help';legend.textContent='Синий — число запросов (левая шкала). Оранжевый — доля всех запросов Яндекса, % (правая шкала). Наведите, коснитесь графика или используйте стрелки ← →.';wrap.after(legend);
        const tooltip=document.createElement('div');tooltip.className='ws-chart-tip';tooltip.setAttribute('role','status');tooltip.hidden=true;wrap.append(tooltip);
        const blue=add('circle',{r:5,fill:'#1686ee',visibility:'hidden'}),orange=add('circle',{r:5,fill:'#ff432c',visibility:'hidden'});let selected=0;
        function showPoint(index,clientX,clientY){
          selected=Math.max(0,Math.min(index,values.length-1));const row=data.results[selected];tooltip.replaceChildren();
          const date=document.createElement('div');date.textContent=new Date(row.date).toLocaleDateString('ru-RU',query.period==='PERIOD_MONTHLY'?{month:'long',year:'numeric',timeZone:'UTC'}:{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});tooltip.append(date);
          for(const [color,value] of [['#1686ee',number(row.count)],['#ff432c',hasShares?percent(shares[selected]):'Доля недоступна']]){const item=document.createElement('div'),dot=document.createElement('span');dot.className='ws-chart-dot';dot.style.background=color;item.append(dot,document.createTextNode(value));tooltip.append(item);}
          blue.setAttribute('cx',x(selected));blue.setAttribute('cy',bottom-values[selected]/ceiling*(bottom-top));blue.setAttribute('visibility','visible');
          if(hasShares){orange.setAttribute('cx',x(selected));orange.setAttribute('cy',bottom-(shareMax?shares[selected]/shareMax:0)*(bottom-top));orange.setAttribute('visibility','visible');}
          tooltip.hidden=false;const rect=wrap.getBoundingClientRect();tooltip.style.left=Math.max(wrap.scrollLeft+4,Math.min(wrap.scrollLeft+wrap.clientWidth-tooltip.offsetWidth-4,(clientX??rect.left+wrap.clientWidth/2)-rect.left+wrap.scrollLeft+12))+'px';tooltip.style.top=Math.max(4,(clientY??rect.top+80)-rect.top-tooltip.offsetHeight-12)+'px';
        }
        function point(event){const rect=svg.getBoundingClientRect(),value=(event.clientX-rect.left)*800/rect.width;let index=0;for(let i=1;i<values.length;i++)if(Math.abs(x(i)-value)<Math.abs(x(index)-value))index=i;showPoint(index,event.clientX,event.clientY);}
        svg.tabIndex=0;svg.addEventListener('pointermove',point);svg.addEventListener('pointerdown',point);svg.addEventListener('focus',()=>showPoint(selected));svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();showPoint(selected+(event.key==='ArrowRight'?1:-1));}if(event.key==='Escape'){tooltip.hidden=true;blue.setAttribute('visibility','hidden');orange.setAttribute('visibility','hidden');}});
        svg.addEventListener('pointerleave',()=>{if(document.activeElement!==svg){tooltip.hidden=true;blue.setAttribute('visibility','hidden');orange.setAttribute('visibility','hidden');}});
      }
      table('Динамика спроса', ['Дата','Запросы','Доля (ответ API)'], data.results.map(r=>[r.date.slice(0,10),number(r.count),r.share]));
    } else {
      table('Распределение спроса', ['Регион','Запросы','Доля (API)','Индекс интереса (API)'], data.results.map(r=>[regionNames.get(r.region)||`Регион ${r.region}`,number(r.count),r.share,r.affinityIndex]));
      const help=document.createElement('p'); help.className='ws-help'; help.textContent='Доля и индекс показаны как в API. Уровни территорий могут пересекаться; строки нельзя суммировать. Для названий загрузите справочник регионов перед запросом.'; $('results').append(help);
    }
    $('status').textContent = data.results.length ? 'Данные получены. Можно выделить и скопировать строки таблицы.' : 'По этим условиям данных нет. Измените фразу, период или регион.';
  }
  async function query(data, onResult) {
    window.WordstatSeo?.refreshEditor?.();
    invalidate(); busy = true; controls(); $('status').textContent = 'Запрашиваем Wordstat…';
    const ticket = generation; controller = new AbortController();
    try {if(data.mode==='top')pendingSnapshot=await analysisSnapshot();const result=await api('query',data,controller.signal); if (ticket===generation && dialog.open) onResult(result); }
    catch(error) { if (ticket===generation && dialog.open) $('status').textContent=error.message; }
    finally { if(ticket===generation){busy=false;controller=null;controls();} }
  }
  $('form').onsubmit = event => {
    event.preventDefault(); if (busy || !available) return;
    const data={mode:$('mode').value,phrase:$('phrase').value.trim(),device:$('device').value,
      regions:queryRegions(),period:$('period').value,
      fromDate:$('from').value,toDate:$('to').value,region:$('region').value};
    query(data,result=>render(result,data));
  };
  $('tree').onclick = () => query({mode:'tree'}, data => {
    const selectedRegion=$('regions').value;
    regionNames = new Map();
    const flatten = nodes => nodes.forEach(n=>{regionNames.set(n.id,n.name);flatten(n.children||[]);});
    flatten(data.regions);
    $('regions').replaceChildren(new Option('Все регионы',''));
    [...regionNames].sort((a,b)=>a[1].localeCompare(b[1],'ru')).forEach(([id,name])=>$('regions').add(new Option(name,id)));
    if(regionNames.has(selectedRegion))$('regions').value=selectedRegion;
    buildRegionTree(data.regions);
    $('status').textContent = 'Справочник загружен. Выберите регион или оставьте все.';
  });
  function buildRegionTree(nodes){
    const container=$('region-tree'),boxes=new Map(),entries=new Map(),parents=new Map();container.hidden=false;container.replaceChildren();
    const allLabel=document.createElement('label'),all=document.createElement('input');all.type='checkbox';all.checked=!regionChoiceEmpty&&!queryRegions().length;allLabel.append(all,document.createTextNode('Все регионы'));container.append(allLabel);
    function append(items,host,parent=null){for(const node of items){
      entries.set(node.id,node);parents.set(node.id,parent);
      const group=document.createElement('div'),row=document.createElement('div'),children=document.createElement('div');row.className='ws-territory-row';children.style.cssText='padding-left:16px;border-left:1px solid #eee';children.hidden=true;
      if(node.children?.length){const toggle=document.createElement('button');toggle.type='button';toggle.textContent='+';toggle.setAttribute('aria-label','Развернуть '+node.name);toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{children.hidden=!children.hidden;toggle.textContent=children.hidden?'+':'−';toggle.setAttribute('aria-expanded',String(!children.hidden));toggle.setAttribute('aria-label',(children.hidden?'Развернуть ':'Свернуть ')+node.name);};row.append(toggle);}
      const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.dataset.regionId=node.id;boxes.set(node.id,box);label.append(box,document.createTextNode(node.name));row.append(label);group.append(row,children);host.append(group);append(node.children||[],children,node.id);
      box.onchange=()=>{set(node.id,box.checked);updateParents();commit();};
    }}
    function set(id,checked){const box=boxes.get(id);box.checked=checked;box.indeterminate=false;for(const child of entries.get(id).children||[])set(child.id,checked);}
    function updateParents(){for(const [id,node] of [...entries].reverse()){if(!node.children?.length)continue;const children=node.children.map(n=>boxes.get(n.id)),box=boxes.get(id);box.checked=children.every(b=>b.checked);box.indeterminate=!box.checked&&children.some(b=>b.checked||b.indeterminate);}}
    function commit(){
      const allChecked=nodes.every(n=>boxes.get(n.id).checked);all.checked=allChecked;all.indeterminate=!allChecked&&[...boxes.values()].some(b=>b.checked||b.indeterminate);
      const ids=allChecked?[]:[...boxes].filter(([id,box])=>box.checked&&(!parents.get(id)||!boxes.get(parents.get(id)).checked)).map(([id])=>id);
      selectedRegions=ids;$('regions').value=ids.length===1?ids[0]:'';regionChoiceEmpty=![...boxes.values()].some(box=>box.checked);invalidate();
      if(regionChoiceEmpty){$('status').textContent='Выберите хотя бы один регион или «Все регионы».';return;}
      if(ids.length>100){$('status').textContent='Выберите до 100 территорий. Снимите лишние флажки.';$('run').disabled=$('analyze').disabled=true;return;}
      $('regions').value=ids.length===1?ids[0]:'';$('status').textContent=ids.length?'Выбрано территорий: '+ids.length+'. Получите данные заново.':'Все регионы. Получите данные заново.';
    }
    append(nodes,container);for(const node of nodes)set(node.id,all.checked);for(const id of queryRegions())if(boxes.has(id))set(id,true);updateParents();all.indeterminate=!all.checked&&[...boxes.values()].some(b=>b.checked||b.indeterminate);
    all.onchange=()=>{for(const node of nodes)set(node.id,all.checked);commit();};
    $('regions').onchange=()=>{regionChoiceEmpty=false;selectedRegions=$('regions').value?[$('regions').value]:[];for(const node of nodes)set(node.id,!selectedRegions.length);for(const id of selectedRegions)if(boxes.has(id))set(id,true);updateParents();all.checked=!selectedRegions.length;all.indeterminate=!!selectedRegions.length;controls();};
  }
  async function save(clear) {
    if(saving || !connectionInfo || connectionInfo.managed)return;
    saving=true; invalidate(); available=false; controls();
    const ticket = ++connectionGeneration;
    const payload=clear?{clear:true}:{folderId:$('folder').value.trim(),apiKey:$('key').value.trim()};
    $('key').value='';
    try { const info=await api('configure',payload); if(ticket===connectionGeneration && dialog.open){applyStatus(info); $('settings-status').textContent='Настройки сохранены.';} }
    catch(error){
      // A lost response may still have saved the settings. Reconcile status without a paid query.
      if(ticket===connectionGeneration && dialog.open){
        try {
          const info=await api('status');
          if(ticket===connectionGeneration && dialog.open)applyStatus(info);
        } catch {
          if(ticket===connectionGeneration && dialog.open){
            connectionInfo=null; available=false;
            $('status').textContent='Не удалось проверить подключение. Закройте Wordstat и откройте заново.';
          }
        }
        if(ticket===connectionGeneration && dialog.open)$('settings-status').textContent=error.message;
      }
    }
    finally{saving=false;controls();}
  }
  $('save').onclick=()=>save(false); $('clear').onclick=()=>save(true);
})();
