// Поиск по задачам и проблемам, навигация по ссылкам и просмотр скриншотов базы знаний.
(() => {
  const data = JSON.parse(document.getElementById('wiki-data').textContent);
  const view = document.getElementById('wiki-view');
  const search = document.getElementById('wiki-search');
  const clear = document.getElementById('clear-search');
  const nav = document.getElementById('wiki-nav');
  const dialog = document.getElementById('screenshot-dialog');
  const HOME = 'start';
  const synonyms = {фото:'изображ',картин:'изображ',фотограф:'изображ',письм:'email',рассыл:'email',публиков:'публика',опубликов:'публика',сохран:'сохран',чендж:'ченжлог',changelog:'ченжлог',емел:'email',емейл:'email'};
  /** Экранирует текст, чтобы поисковые запросы и материалы не становились HTML. */
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  /** Нормализует русские слова и частые варианты названий для поиска. */
  function tokens(value) {
    return value.toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)?.filter(word => !['как','что','с','в','на','и','не','у','для','сделать','мне','почему'].includes(word)).map(word => {
      const key = Object.keys(synonyms).find(prefix => word.startsWith(prefix));
      return key ? synonyms[key] : word.length > 5 ? word.slice(0,5) : word;
    }) || [];
  }
  /** Возвращает группу руководства по постоянному идентификатору. */
  const groupFor = article => data.groups.find(group => group.id === article.group);
  /** Формирует безопасную ссылку на руководство. */
  const articleLink = article => `<a href="#${escape(article.id)}">${escape(article.title)} →</a>`;
  /** Показывает заголовок выбранного раздела. */
  const heading = (title, description) => `<div class="wiki-heading"><span class="eyebrow">ИНСТРУКЦИИ</span><h1>${escape(title)}</h1><p>${escape(description)}</p></div>`;
  nav.innerHTML = `<a href="#start">С чего начать</a>` + data.groups.map(group => `<a href="#${group.id}">${escape(group.title)}<span>${data.articles.filter(article => article.group === group.id).length}</span></a>`).join('') + `<a href="#changelog">Ченжлог<span>${data.changes.length}</span></a>`;
  if (location.hostname === '213.139.209.107') document.getElementById('email-link').href = '/OUTMAX.html';
  /** Отрисовывает раздел или руководство; ссылки сохраняются в адресной строке. */
  function render() {
    let id = location.hash.slice(1) || HOME;
    try { id = decodeURIComponent(id); } catch { id = 'missing'; }
    const article = data.articles.find(item => item.id === id);
    const group = data.groups.find(item => item.id === id);
    const active = article?.group || (group ? group.id : id);
    nav.querySelectorAll('a').forEach(link => {
      if (link.hash === '#' + active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    if (search.value.trim()) return renderSearch();
    document.title = `${article?.title || group?.title || (id === 'changelog' ? 'Ченжлог' : 'Инструкции')} · OUTMAX / ХАСЛ`;
    if (article) {
      const parent = groupFor(article);
      view.innerHTML = `<a class="wiki-back" href="#${parent.id}">← ${escape(parent.title)}</a><article class="wiki-article"><span class="eyebrow">${escape(parent.title)}</span><h1>${escape(article.title)}</h1><p class="wiki-lead">${escape(article.description)}</p><h2>Пошагово</h2><ol class="wiki-steps">${article.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>${article.note ? `<aside class="wiki-note">${escape(article.note)}</aside>` : ''}${article.image ? `<figure class="wiki-figure"><button type="button" data-screenshot="${article.image}" data-caption="${escape(article.caption)}" aria-label="Увеличить скриншот: ${escape(article.caption)}"><img src="screens/${article.image}" alt="${escape(article.caption)}" loading="lazy" width="1440" height="1000"></button><figcaption>${escape(article.caption)} · Нажмите, чтобы увеличить</figcaption></figure>` : ''}<h2>Читайте также</h2><div class="wiki-related">${(article.related || []).map(id => data.articles.find(item => item.id === id)).filter(Boolean).map(articleLink).join('')}<a href="#${parent.id}">Все инструкции раздела</a></div><p class="wiki-meta">Обновлено ${escape(data.updated)} · Инструкция для текущей версии редактора</p></article>`;
    } else if (id === 'changelog') {
      view.innerHTML = heading('Ченжлог','Все изменения редакторов в одном месте. Самые свежие — сверху. Поиск также находит записи из истории изменений.') + `<article class="wiki-article">${data.changes.map(change => `<section class="wiki-log"><h2>${escape(change.title)}</h2><ul>${change.items.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>`).join('')}</article>`;
    } else if (group) {
      view.innerHTML = heading(group.title,group.description) + data.articles.filter(article => article.group === group.id).map(result).join('');
    } else if (id === HOME) {
      view.innerHTML = heading('Всё, что нужно для работы','Выберите свой редактор или задачу. Если что-то не получается, опишите проблему в поиске — он найдёт инструкцию и связанные изменения.') + `<div class="wiki-groups">${data.groups.map(group => `<section class="wiki-group"><h2>${escape(group.title)}</h2><p>${escape(group.description)}</p><ul>${data.articles.filter(article => article.group === group.id).slice(0,3).map(article => `<li>${articleLink(article)}</li>`).join('')}</ul><a class="wiki-all" href="#${group.id}">Все инструкции →</a></section>`).join('')}</div>`;
    } else view.innerHTML = heading('Инструкция не найдена','Возможно, ссылка устарела. Найдите нужную задачу через поиск.') + '<a class="wiki-back" href="#start">← Все инструкции</a>';
  }
  /** Формирует результат поиска с контекстом, а не только названием. */
  function result(article) { return `<a class="wiki-result" href="#${article.id}"><span class="eyebrow">${escape(groupFor(article).title)}</span><strong>${escape(article.title)} →</strong><p>${escape(article.description)}</p></a>`; }
  /** Ищет по названиям, шагам, подсказкам, проблемам и всему ченжлогу. */
  function renderSearch() {
    const query = tokens(search.value);
    const score = text => {const words = tokens(text);return query.filter(token => words.some(word => word.includes(token) || token.includes(word))).length;};
    const found = data.articles.map(article => ({article,score:score(JSON.stringify(article))})).filter(item => query.length && item.score === query.length).sort((a,b) => score(b.article.title)-score(a.article.title));
    const changes = data.changes.filter(change => query.length && score(JSON.stringify(change)) === query.length);
    view.innerHTML = heading(`Результаты поиска: ${found.length + changes.length}`,search.value) + `<div role="status" class="wiki-meta">Найдено инструкций: ${found.length}. Записей ченжлога: ${changes.length}.</div>` + found.map(item => result(item.article)).join('') + changes.map(change => `<a class="wiki-result" href="#changelog"><span class="eyebrow">ЧЕНЖЛОГ</span><strong>${escape(change.title)}</strong><p>${escape(change.items.join(' ').slice(0,260))}</p></a>`).join('') + (!found.length && !changes.length ? `<div class="wiki-empty">Пока ничего не найдено. Попробуйте короткий запрос: «изображение», «сохранение», «NotiSend».<br><button type="button" data-reset>Показать все инструкции</button></div>` : '');
  }
  /** Сбрасывает запрос и возвращает выбранный раздел. */
  function reset() {search.value='';clear.hidden=true;render();}
  search.addEventListener('input',() => {clear.hidden=!search.value;render();});
  clear.addEventListener('click',() => {reset();search.focus();});
  view.addEventListener('click',event => {
    const button = event.target.closest('[data-screenshot]');
    if (button) {const image=document.getElementById('screenshot-large');image.src='screens/'+button.dataset.screenshot;image.alt=button.dataset.caption;document.getElementById('screenshot-title').textContent=button.dataset.caption;dialog.showModal();}
    if (event.target.closest('[data-reset]')) reset();
    if (event.target.closest('a')) reset();
  });
  nav.addEventListener('click',reset);
  document.querySelector('.wiki-header-link').addEventListener('click',reset);
  document.getElementById('close-screenshot').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',event => {if(event.target === dialog) dialog.close();});
  document.addEventListener('keydown',event => {
    if(event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input,textarea,[contenteditable]') && !dialog.open){event.preventDefault();search.focus();}
    if(event.key === 'Escape' && document.activeElement === search){reset();search.focus();}
  });
  window.addEventListener('hashchange',() => {reset();document.getElementById('wiki-content').focus({preventScroll:true});window.scrollTo(0,0);});
  /** Подключает тот же профиль, приветствие и оформление меню, что у рабочих редакторов. */
  async function loadProfile() {
    if (document.body.dataset.serverProfile !== 'true') return;
    const response = await fetch('/editor-api/me', {credentials:'same-origin'});
    if (!response.ok) return;
    const user = await response.json();
    const menu = document.getElementById('wiki-account-menu');
    const trigger = document.getElementById('wiki-account-name');
    const name = String(user.name || 'Пользователь');
    const chevron = document.querySelector('.editor-switcher-chevron').innerHTML;
    trigger.innerHTML = `<span class="account-avatar">${escape(Array.from(name.trim())[0] || '?')}</span><span class="account-greeting">Привет, <strong>${escape(name)}</strong></span><span class="account-switcher-chevron" aria-hidden="true">${chevron}</span>`;
    trigger.title = `Привет, ${name}`;
    document.getElementById('wiki-account-meta').innerHTML = `<strong>${escape(name)}</strong><span>${{admin:'Администратор',moderator:'Модератор',editor:'Редактор'}[user.role] || 'Редактор'}</span>`;
    document.getElementById('wiki-users').hidden = !user.admin;
    document.getElementById('wiki-my-emails').hidden = !user.emailAccess;
    document.getElementById('wiki-my-emails').textContent = 'Редактор email-рассылок';
    document.getElementById('wiki-my-emails').dataset.profileLocation = document.getElementById('email-link').getAttribute('href');
    if (!user.emailAccess) {const link=document.getElementById('email-link');link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.querySelector('small').textContent='Доступ выдаёт администратор';}
    menu.hidden = false;
  }
  const menus = [...document.querySelectorAll('.topbar-left > details')];
  menus.forEach(menu => menu.addEventListener('toggle', () => {if(menu.open) menus.forEach(other => {if(other !== menu) other.open=false;});}));
  document.addEventListener('click', event => {if(!event.target.closest('.topbar-left > details')) menus.forEach(menu => {menu.open=false;});});
  document.addEventListener('keydown', event => {if(event.key === 'Escape') menus.forEach(menu => {menu.open=false;});});
  document.querySelectorAll('[data-profile-location]').forEach(button => button.addEventListener('click', () => {location.href=button.dataset.profileLocation;}));
  document.getElementById('wiki-logout').addEventListener('click', async event => {
    const button=event.currentTarget;button.disabled=true;
    const error=document.getElementById('wiki-profile-error');error.hidden=true;
    try {const response=await fetch('/editor-api/logout',{method:'POST',credentials:'same-origin'});if(!response.ok) throw Error();location.href='/login';}
    catch {error.textContent='Не удалось выйти. Повторите попытку.';error.hidden=false;button.disabled=false;}
  });
  loadProfile().catch(() => {});
  render();
})();
