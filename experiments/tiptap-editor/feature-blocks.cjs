// Добавление и настройка брендовых промокодов и экспертных мнений в Tiptap.
const {closeHistory}=require('@tiptap/pm/history');

/** Подключает общие окна и сохраняет изменения одной операцией undo. */
function mountFeatureBlocks({getEditor,getBrand,importHTML,exportHTML,validateJSON,status}){
  const toolbar=document.querySelector('.editing-tools');
  let captured=null;
  const dialog=window.EditorStyling.mountFeatureDialog({brand:getBrand,getCss:()=>{
    const sheet=document.getElementById('brand-css').sheet;
    return sheet?[...sheet.cssRules].map(rule=>rule.cssText).join('\n'):'';
  },onSave:draft=>{
    const editor=getEditor();
    if(!editor||editor!==captured.editor||editor.state.doc!==captured.doc)throw Error('Статья изменилась. Закройте окно и откройте настройки заново.');
    const imported=importHTML(draft.outerHTML,document);
    if(imported.warnings.length)throw Error('Проверьте текст и оформление блока.');
    validateJSON(imported.json,document);
    const json=imported.json.content[0];
    if(captured.key)json.attrs.nodeKey=captured.key;
    const node=editor.schema.nodeFromJSON(json);node.check();
    const transaction=closeHistory(editor.state.tr).replaceWith(captured.from,captured.to,node);
    editor.view.dispatch(transaction);editor.view.focus();status('Блок сохранён.');
  }});
  /** Находит новый блок среди родителей текущего выделения. */
  function current(){
    const editor=getEditor();if(!editor)return null;
    const position=editor.state.selection.$from;
    for(let depth=position.depth;depth>0;depth--){
      const node=position.node(depth),classes=node.attrs.htmlAttrs?.class||'';
      if(/(?:^|\s)om-(promo|expert)(?=\s|$)/.test(classes))return {node,from:position.before(depth),to:position.after(depth),kind:/(?:^|\s)om-promo(?=\s|$)/.test(classes)?'promo':'expert'};
    }
    return null;
  }
  /** Открывает настройки с зафиксированной позицией, не изменяя документ до сохранения. */
  function open(kind,existing=null){
    const editor=getEditor();if(!editor?.isEditable)return;
    captured={editor,doc:editor.state.doc,from:existing?.from??editor.state.selection.to,to:existing?.to??editor.state.selection.to,key:existing?.node.attrs.nodeKey};
    let element=null;
    if(existing){const holder=document.createElement('div');holder.innerHTML=exportHTML({type:'doc',content:[existing.node.toJSON()]},document);element=holder.firstElementChild;}
    dialog.open(kind,element);
  }
  for(const [kind,label] of [['promo','Блок промокода'],['expert','Блок эксперт']]){
    const button=document.createElement('button');button.id='add-'+kind;button.type='button';button.textContent=label;button.onclick=()=>open(kind);toolbar.append(button);
  }
  const edit=document.createElement('button');edit.id='feature-settings';edit.type='button';edit.textContent='Настроить блок';edit.disabled=true;edit.onclick=()=>{const block=current();if(block)open(block.kind,block);};toolbar.append(edit);
  let bound=null;
  function bind(){const editor=getEditor();if(editor!==bound){bound=editor;editor?.on('selectionUpdate',()=>edit.disabled=!current());editor?.on('transaction',()=>edit.disabled=!current());}edit.disabled=!current();}
  return {bind};
}
module.exports={mountFeatureBlocks};
