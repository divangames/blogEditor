/* One registry over the existing editor. No second document or undo stack. */
(() => {
  'use strict';
  function createRegistry() {
  const commands = new Map(), listeners = new Set();
  let batchRunner = null,batching=false,pending=[];
  const emit=step=>{for(const listener of listeners){try{listener(step);}catch{}}};
  return Object.freeze({
    register(spec) {
      if (!spec.id || commands.has(spec.id) || typeof spec.run !== 'function') throw new Error('Некорректная или повторная команда');
      commands.set(spec.id, Object.freeze({...spec}));
    },
    list(query = '') {
      const needle = String(query).toLocaleLowerCase('ru');
      return [...commands.values()].filter(spec => `${spec.id} ${spec.label}`.toLocaleLowerCase('ru').includes(needle)).map(spec => ({
        id:spec.id, label:spec.label, shortcut:spec.shortcut || '', params:spec.params || {},
        disabled:spec.enabled?.() || null, repeatable:spec.repeatable === true
      }));
    },
    execute(id, params = {}) {
      const spec = commands.get(id);
      if (!spec) throw new Error('Неизвестная команда: ' + id);
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Параметры команды должны быть объектом');
      const reason = spec.enabled?.();
      if (reason) throw new Error(reason);
      const notify=value=>{const copied=typeof structuredClone==='function'?structuredClone(params):JSON.parse(JSON.stringify(params));const step={id,params:copied,repeatable:spec.repeatable===true};if(batching)pending.push(step);else emit(step);return value;};
      const value=spec.run(params);
      return value?.then ? value.then(notify) : notify(value);
    },
    subscribe(listener) {listeners.add(listener);return ()=>listeners.delete(listener);},
    setBatchRunner(run) {if(batchRunner)throw new Error('Пакетный обработчик уже подключён');batchRunner=run;},
    batch(steps) {
      if(!Array.isArray(steps)||!steps.length||steps.length>40)throw new Error('Пакет должен содержать от 1 до 40 действий');
      for(const step of steps){if(!step || !commands.get(step.id)?.repeatable)throw new Error('Команда недоступна в макросе: '+(step?.id || ''));}
      if(!batchRunner)throw new Error('Пакетный обработчик не готов');
      if(batching)throw new Error('Вложенные пакеты не поддерживаются');
      batching=true;pending=[];
      try{const value=batchRunner(steps);batching=false;for(const step of pending)emit(step);return value;}
      finally{batching=false;pending=[];}
    }
  });
  }
  window.createEditorCommandRegistry = createRegistry;
  window[document.getElementById('email-history-undo') ? 'EmailCommands' : 'ArticleCommands'] = createRegistry();
})();
