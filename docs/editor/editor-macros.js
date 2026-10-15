/* Formatting recipes are private to the current account, browser and brand. */
(() => {
  'use strict';
  if(!window.ArticleCommands || !document.getElementById('canvas') || window.__ARTICLE_WORKFLOW_DISABLED__ === true)return;
  const key=()=>window.__EDITOR_SERVER_FIRST__&&!window.__EDITOR_PROFILE__?null:'article-macros-v1:'+encodeURIComponent(window.__EDITOR_PROFILE__?.id || 'browser')+':'+ACTIVE_EDITOR.key;
  const read=()=>{try{if(!key())return [];const items=JSON.parse(localStorage.getItem(key()) || '[]');return Array.isArray(items)?items.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&Array.isArray(item.steps)&&item.steps.length>0&&item.steps.length<=40&&item.steps.every(step=>step&&typeof step.id==='string')):[];}catch{return [];}};
  let recording=null,replaying=false;
  const button=document.createElement('button');button.id='article-macros-open';button.type='button';
  articleToolbarIcon(button,'macros','Макросы: записать и повторить форматирование');document.querySelector('.toolstrip .editor-canvas-help').before(button);
  const dialog=document.createElement('dialog');dialog.id='article-macros-dialog';dialog.className='editor-dialog article-workflow-dialog';dialog.setAttribute('aria-labelledby','article-macros-title');
  dialog.innerHTML='<div class="dialog-head"><h2 id="article-macros-title">Макросы форматирования</h2><button type="button" data-close aria-label="Закрыть макросы">×</button></div><p class="help">Запишите действия панели форматирования и повторите их на другом выделении. Текст статьи, сохранение, экспорт и ИИ в запись не включаются.</p><label>Название макроса<input id="article-macro-name" maxlength="80" placeholder="Например, выделить главное"></label><div class="dialog-actions"><button id="article-macro-record" type="button">Начать запись</button><button id="article-macro-stop" type="button" disabled>Сохранить запись</button><button id="article-macro-cancel" type="button" disabled>Отменить запись</button></div><p id="article-macro-status" role="status" aria-live="polite"></p><div id="article-macro-list" class="article-command-results"></div>';
  document.body.append(dialog);
  const status=dialog.querySelector('[role=status]'),name=dialog.querySelector('input');
  function controls(){dialog.querySelector('#article-macro-record').disabled=!!recording||!key();dialog.querySelector('#article-macro-stop').disabled=!recording;dialog.querySelector('#article-macro-cancel').disabled=!recording;button.classList.toggle('is-recording',!!recording);button.title=recording?'Макросы: идёт запись форматирования':'Макросы: записать и повторить форматирование';button.setAttribute('aria-label',button.title);}
  function render(){
    const list=dialog.querySelector('#article-macro-list');list.replaceChildren();
    for(const item of read()){
      const row=document.createElement('div');row.className='article-macro-row';
      const apply=document.createElement('button');apply.type='button';apply.textContent=item.name+' · '+item.steps.length+' действий';
      apply.onclick=()=>{dialog.close();try{replaying=true;ArticleCommands.batch(item.steps);toast('Макрос применён. Ctrl+Z отменяет весь пакет.');}catch(error){toast(error.message,true);}finally{replaying=false;}};
      const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить';remove.setAttribute('aria-label','Удалить макрос '+item.name);
      remove.onclick=()=>{try{localStorage.setItem(key(),JSON.stringify(read().filter(m=>m.id!==item.id)));render();}catch{status.textContent='Не удалось сохранить список на устройстве.';}};
      row.append(apply,remove);list.append(row);
    }
    if(!list.children.length)list.textContent='Сохранённых макросов пока нет';
    controls();
  }
  button.onclick=()=>{render();status.textContent=recording?'Запись идёт: '+recording.steps.length+' действий.':'';dialog.show();};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && dialog.open){event.preventDefault();dialog.close();button.focus({preventScroll:true});}});
  dialog.querySelector('#article-macro-record').onclick=()=>{
    if(!name.value.trim()){status.textContent='Введите название макроса';name.focus();return;}
    recording={name:name.value.trim(),steps:[],account:key()};status.textContent='Запись началась. Закройте окно, выделите текст и используйте панель форматирования.';controls();
  };
  dialog.querySelector('#article-macro-stop').onclick=()=>{
    if(recording.account!==key()){recording=null;controls();status.textContent='Аккаунт изменился; запись отменена.';return;}
    if(!recording.steps.length){status.textContent='Нет записанных действий. Используйте кнопки форматирования.';return;}
    try{const items=read();if(items.length>=30)throw new Error('Сохранено 30 макросов. Удалите ненужный.');localStorage.setItem(key(),JSON.stringify([...items,{id:crypto.randomUUID(),name:recording.name,steps:recording.steps}]));recording=null;status.textContent='Макрос сохранён на этом устройстве';render();}catch(error){status.textContent=error.message;}
  };
  dialog.querySelector('#article-macro-cancel').onclick=()=>{recording=null;status.textContent='Запись отменена';controls();};
  ArticleCommands.subscribe(step=>{
    if(!recording || replaying || !step.repeatable || step.id==='text.insert')return;
    if(recording.account!==key()){recording=null;controls();return;}
    if(recording.steps.length>=40){status.textContent='Достигнут предел 40 действий. Сохраните запись.';return;}
    recording.steps.push({id:step.id,params:step.params});status.textContent='Записано действий: '+recording.steps.length;
  });
})();
