/* Proposals are temporary, explicit and bound to this email and its source. */
(() => {
 'use strict';
 const tools=window.EmailTextTools,registry=window.EmailCommands;if(!tools||!registry)return;
 const open=tools.icon('email-proposal-open','Правка: предложить правку выделенного текста письма','<path d="m4 16 11-11 4 4-11 11H4v-4Zm9-9 4 4M13 20h7"/>');
 const dialog=tools.dialog('email-proposal-dialog','Предложение правки письма','<p class="help">Выделите один фрагмент с одинаковым оформлением. Письмо изменится только после принятия.</p><label>Задача<select id="email-proposal-task"><option value="shorten">Сократить</option><option value="clarify">Сделать понятнее</option><option value="correct">Исправить ошибки</option></select></label><div class="email-proposal-columns"><label>Исходный текст<textarea id="email-proposal-original" readonly></textarea></label><label>Предлагаемый текст<textarea id="email-proposal-text" maxlength="16000" placeholder="Вставьте или отредактируйте предложенный вариант"></textarea></label></div><p id="email-proposal-status" role="status" aria-live="polite"></p><div class="email-text-actions"><button id="email-proposal-generate" type="button" disabled>Предложить с ИИ</button><button id="email-proposal-reject" type="button">Отклонить</button><button id="email-proposal-accept" type="button" class="primary" disabled>Принять правку</button></div>');
 const original=dialog.querySelector('#email-proposal-original'),suggested=dialog.querySelector('#email-proposal-text'),status=dialog.querySelector('#email-proposal-status'),generate=dialog.querySelector('#email-proposal-generate'),accept=dialog.querySelector('#email-proposal-accept');
 let target=null,controller=null,generation=0,available=false;
 const valid=()=>target&&tools.editorActive()&&target.signature===tools.signature()&&canvas.contains(target.node)&&target.node.data===target.nodeText&&target.range.toString()===target.text;
 function capture(){
  if(!tools.editorActive())throw new Error('Откройте вкладку редактора письма');
  const selection=getSelection(),range=selection?.rangeCount&&canvas.contains(selection.getRangeAt(0).commonAncestorContainer)?selection.getRangeAt(0).cloneRange():emailTypographyRange?.cloneRange();
  if(!range||range.collapsed||!canvas.contains(range.commonAncestorContainer))throw new Error('Сначала выделите текст в письме');
  if(range.startContainer!==range.endContainer||range.startContainer.nodeType!==Node.TEXT_NODE)throw new Error('Выделите один фрагмент с одинаковым оформлением');
  const node=range.startContainer,parent=node.parentElement;
  const block=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption'),prefix=document.createRange();
  if(block){prefix.selectNodeContents(block);prefix.setEnd(node,range.startOffset);}
  const offset=block?prefix.toString().length:0;
  if(!block||parent.closest('a,'+tools.protectedSelector)||tools.intersects(block.textContent,offset,offset+range.toString().length))throw new Error('Ссылки, переменные и общие блоки правьте через их настройки');
  const text=range.toString();if(text.length>8000)throw new Error('Выделите не более 8000 символов');
  tools.select(range);target={node,nodeText:node.data,range,text,signature:tools.signature(),bookmark:emailSelectionBookmark()};
 }
 async function show(){
  if(dialog.open){suggested.focus();return;}
  controller?.abort();controller=null;generation++;capture();document.querySelectorAll('dialog.email-text-dialog[open]').forEach(node=>node.close());
  original.value=target.text;suggested.value='';suggested.disabled=false;accept.disabled=true;generate.disabled=true;available=false;
  status.textContent='Можно вставить вариант вручную. Проверяем доступность ИИ…';dialog.show();suggested.focus();
  const ticket=++generation;
  try{const info=await tools.request('/article-assist/status');if(ticket!==generation||!dialog.open)return;available=!!info.available;generate.disabled=!available;status.textContent=available?'ИИ получит только выделенный текст после нажатия. Проверьте факты перед принятием.':'ИИ не настроен. Администратор подключает его в настройках ИИ редактора статей. Можно вставить вариант вручную.';}
  catch{if(ticket===generation&&dialog.open)status.textContent='Сервер ИИ недоступен. Вставьте вариант вручную.';}
 }
 registry.register({id:'review.propose',label:'Предложить правку текста письма',run:show});
 registry.register({id:'review.applyProposal',label:'Принять правку письма',params:{text:'текст'},run:({text})=>{
  if(!valid())throw new Error('Письмо или проект изменились. Закройте предложение и выделите актуальный текст заново.');
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw new Error('Введите текст правки от 1 до 16000 символов');
  if(text===target.text)return {changed:false};
  restoreEmailSelection(target.bookmark);
  tools.transaction(()=>{const start=target.range.startOffset;target.node.replaceData(start,target.range.endOffset-start,text);target.range.setStart(target.node,start);target.range.setEnd(target.node,start+text.length);tools.select(target.range);});
  return {changed:true};
 }});
 open.onclick=()=>show().catch(error=>toast(error.message,true));
 suggested.oninput=()=>{accept.disabled=!suggested.value.trim()||suggested.value.length>16000;};
 dialog.querySelector('#email-proposal-reject').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;controller?.abort();controller=null;const other=document.querySelector('dialog.email-text-dialog[open]');if(!other&&valid())restoreEmailSelection(target.bookmark);target=null;original.value='';suggested.value='';if(!other)open.focus({preventScroll:true});});
 accept.onclick=()=>{try{registry.execute('review.applyProposal',{text:suggested.value});dialog.close();}catch(error){status.textContent=error.message;}};
 generate.onclick=async()=>{
  if(!valid()){status.textContent='Письмо или проект изменились. Выделите актуальный текст заново.';return;}
  const ticket=++generation;controller=new AbortController();generate.disabled=true;accept.disabled=true;suggested.disabled=true;status.textContent='Получаем предложение. Исходный текст сохраняется.';
  try{
   const result=await tools.request('/article-assist/propose',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text:target.text,task:dialog.querySelector('#email-proposal-task').value})});
   if(ticket!==generation||!dialog.open)return;
   if(!valid()){status.textContent='Письмо или проект изменились во время запроса. Запросите правку заново.';return;}
   if(typeof result.text!=='string'||!result.text.trim()||result.text.length>16000)throw new Error('ИИ вернул пустой или слишком длинный ответ');
   suggested.value=result.text;status.textContent='Предложение готово. Проверьте факты и формулировки; можно изменить текст перед принятием.';
  }catch(error){if(ticket===generation&&error.name!=='AbortError')status.textContent=error.message;}
  finally{if(ticket===generation&&dialog.open){generate.disabled=!available;suggested.disabled=false;suggested.oninput();}}
 };
})();
