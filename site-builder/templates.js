/* Шаблоны и библиотека блоков работают с существующим документом и историей конструктора. */
(() => {
  'use strict';
  const id=()=> 'b'+crypto.randomUUID().replaceAll('-','');
  const media=name=>location.origin+'/editor-api/public-site-template/'+name;
  const element=(type,text,style={},extra={})=>({id:id(),type,text,style,mobileStyle:{},...extra});
  const heading=(text,size=48)=>element('heading',text,{fontSize:size,fontWeight:700,lineHeight:1.15},{tag:'h2',mobileStyle:{fontSize:30}});
  const text=value=>element('text',value,{fontSize:18,lineHeight:1.6});
  const button=(value,href='#contact',color='#202124')=>element('button',value,{background:color,color:'#ffffff',radius:6,paddingX:24,paddingY:14},{href});
  const image=(name,alt)=>element('image','', {radius:12},{src:media(name),alt});
  function section(name,elements,background='#ffffff',color='#202124') {
    return {id:id(),source:'custom',name,visibility:'all',mode:'grid',columns:1,mobileColumns:1,gap:24,contentWidth:1120,elements,background,color,spacing:{top:72,bottom:72},spacingMobile:{top:40,bottom:40}};
  }
  const blocks=[
    {id:'cover',category:'Обложки',name:'Заголовок и действие',description:'Первый экран с описанием и кнопкой.',build:()=>section('Обложка',[heading('Расскажите о главном',64),text('Коротко объясните, кому вы помогаете и какую задачу решаете.'),button('Связаться с нами')])},
    {id:'about',category:'Текст',name:'О проекте',description:'Заголовок и подробное описание.',build:()=>section('О проекте',[heading('О нашем проекте'),text('Добавьте историю, подход и важные детали. Нажмите на текст в предпросмотре, чтобы изменить его.')],'#f5f5f7')},
    {id:'benefits',category:'Текст',name:'Преимущества',description:'Три причины выбрать ваш продукт.',build:()=>section('Преимущества',[heading('Почему выбирают нас'),heading('Понятный процесс',28),text('Опишите, как проходит работа и что получает клиент.'),heading('Внимание к деталям',28),text('Расскажите о том, что отличает ваш подход.'),heading('Поддержка рядом',28),text('Объясните, как связаться с командой.')])},
    {id:'media',category:'Медиа',name:'Фото с подписью',description:'Изображение, заголовок и пояснение.',build:()=>section('Фото с подписью',[heading('Покажите результат'),element('image','',{}, {src:'',alt:''}),text('Выберите изображение в свойствах элемента или загрузите своё.')])},
    {id:'contact',category:'Контакты',name:'Призыв к действию',description:'Заключительный блок с кнопкой.',build:()=>({...section('Контакты',[heading('Обсудим ваш проект?'),text('Расскажите, как с вами связаться. Укажите адрес кнопки в свойствах.'),button('Написать нам','')],'#f5f5f7'),anchor:'contact'})},
    {id:'form',category:'Контакты',name:'Форма обратной связи',description:'Имя, email и сообщение. Требует обработчик.',build:()=>section('Форма',[heading('Оставьте сообщение'),element('form','Отправить',{}, {action:''})])},
    {id:'empty',category:'Макеты',name:'Пустой блок',description:'Соберите свою композицию из объектов.',build:()=>section('Новый блок',[])},
    {id:'free',category:'Макеты',name:'Свободный блок',description:'Отдельное размещение для ПК и телефона.',build:()=>({...section('Свободный блок',[]),mode:'free',height:600,mobileHeight:700})}
  ];
  function dpd(delivery=false) {
    const blue='#005bff',red='#dc0032';
    return [
      section('OZON × DPD',[element('image','',{width:26},{src:media('dpd-logo.svg'),alt:'OZON × DPD',mobileStyle:{width:70}}),heading(delivery?'Доставка под ваш бизнес.':'Два сервиса. Один поток.',64),text(delivery?'Выберите подходящий способ доставки заказов OZON через DPD.':'Объедините OZON realFBS и DPD: накладные, трек-номера и статусы — в одном процессе.'),button('Подключить бесплатно','https://space.dpd-ozon.ru/registration',blue),image('dpd-cabinet-ozon.webp','Кабинет OZON: заказы и отправления')]),
      section('Как это работает',[heading('Заказ готов. Дальше — мы.'),text('Заказ из OZON → накладная DPD → трек-номер → статус доставки.'),text('Заказы передаются в DPD, а трек-номера и статусы возвращаются в OZON. Контролируйте отправления в личном кабинете.')],'#171719','#ffffff'),
      section('Личный кабинет',[heading('Весь процесс. В одном месте.'),text('Заказы, товары и тарифы собраны в одном кабинете.'),image(delivery?'dpd-cabinet-tariffs.webp':'dpd-cabinet-dpd.webp',delivery?'Выбор тарифа DPD':'Управление заказами DPD')],'#f5f7fa'),
      section('Варианты доставки',[heading('Под ваш способ доставки.'),text('Подбирайте тарифы по условиям договора DPD. Работайте с несколькими посылками и отслеживайте их статусы.'),image('dpd-cabinet-products.webp','Товары и параметры отправления')]),
      section('Подключение',[heading('Готовы соединиться?'),text('Для подключения нужны магазин OZON realFBS, договор с DPD и ключи API обоих сервисов. Ключи вводятся только в защищённом кабинете интеграции.'),button('Открыть кабинет','https://space.dpd-ozon.ru/login',red)],'#f5f7fa'),
      section('Вопросы и ответы',[heading('Что нужно знать'),heading('Сколько стоит сервис?',26),text('Интеграция бесплатна. Доставка оплачивается по вашему договору с DPD.'),heading('Когда появится трек-номер?',26),text('Обработка занимает время. Если номер не появился через 15 минут, проверьте настройки интеграции и обратитесь в поддержку.')])
    ];
  }
  const templates=[
    {id:'blank',name:'С чистого листа',description:'Пустая страница для любого проекта.',kind:'Универсальный',build:()=>[]},
    {id:'business',name:'Сайт компании',description:'Обложка, о проекте, преимущества и контакты.',kind:'Универсальный',build:()=>['cover','about','benefits','contact'].map(key=>blocks.find(b=>b.id===key).build())},
    {id:'hasl',name:'ХАСЛ',description:'Сохранённый шаблон магазина, каталог и два домена.',kind:'Магазин'},
    {id:'dpd',name:'OZON × DPD · интеграция',description:'Готовые тексты и изображения из проекта DPD.',kind:'DPD',image:'dpd-cabinet-ozon.webp',build:()=>dpd()},
    {id:'dpd-delivery',name:'OZON × DPD · доставка',description:'Вариант страницы с акцентом на доставку и тарифы.',kind:'DPD',image:'dpd-cabinet-tariffs.webp',build:()=>dpd(true)}
  ];
  const escape=value=>window.HaslRenderer.esc(value);
  let view='templates',query='',category='Все',catalog;
  function refreshCatalog(){if(catalog?.open)catalog.querySelector('.template-dialog-body').innerHTML=panel();}
  function panel(){
    const list=view==='templates'?templates:blocks;
    const filtered=list.filter(item=>(category==='Все'||item.category===category)&&(!query||(item.name+' '+item.description+' '+(item.kind||'')).toLocaleLowerCase().includes(query)));
    return `<h2>${view==='templates'?'Начните с шаблона':'Добавить блок'}</h2><p class="intro">${view==='templates'?'Выберите основу. Каждый блок, текст и изображение можно изменить. Текущая работа сохраняется перед переключением.':'Готовый блок появится после выбранного. Нажмите на содержимое на холсте для редактирования.'}</p><label class="field"><span>Поиск ${view==='templates'?'шаблона':'блока'}</span><input type="search" data-catalog-search value="${escape(query)}" placeholder="${view==='templates'?'ХАСЛ, DPD, компания…':'Обложка, фото, контакты…'}"></label>${view==='blocks'?'<div class="template-categories" role="group" aria-label="Категории блоков">'+['Все',...new Set(blocks.map(b=>b.category))].map(c=>`<button data-block-category="${c}" aria-pressed="${category===c}">${c}</button>`).join('')+'</div>':''}<div class="template-catalog">${filtered.map(item=>`<button class="template-choice" data-${view==='templates'?'choose-template':'choose-block'}="${item.id}">${item.image?`<img src="${media(item.image)}" alt="" loading="lazy">`:`<span class="template-wireframe" aria-hidden="true"><i></i><i></i><i></i></span>`}<span class="template-info"><strong>${item.name}</strong><small>${item.description}</small><span>${view==='templates'?item.kind:'Добавить блок'}</span></span></button>`).join('')||'<p class="template-empty">Ничего не найдено. Попробуйте другое название.</p>'}</div>`;
  }
  function open(next){
    view=next;query='';category='Все';
    if(!catalog){catalog=document.createElement('dialog');catalog.id='site-template-catalog';catalog.className='template-dialog';catalog.setAttribute('aria-label','Библиотека шаблонов и блоков');catalog.innerHTML='<form method="dialog"><button class="template-dialog-close" aria-label="Закрыть библиотеку">Закрыть</button></form><div class="template-dialog-body"></div>';document.body.append(catalog);}
    catalog.querySelector('.template-dialog-body').innerHTML=panel();if(!catalog.open)catalog.showModal();catalog.querySelector('[data-catalog-search]').focus();
  }
  document.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    try{
      if(target.hasAttribute('data-template-gallery'))open('templates');
      if(target.hasAttribute('data-block-catalog'))open('blocks');
      if(target.dataset.blockCategory){category=target.dataset.blockCategory;refreshCatalog();}
      if(target.dataset.chooseBlock){const preset=blocks.find(b=>b.id===target.dataset.chooseBlock);if(preset){catalog.close();SiteDesigner.insertSection('grid',preset.build(),{preserveAnchor:true});}}
      if(target.dataset.chooseTemplate){target.disabled=true;catalog.close();await SiteBuilder.createTemplate(target.dataset.chooseTemplate);}
    }catch(error){notify(error.message);}finally{target.disabled=false;}
  });
  document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-catalog-search'))return;query=event.target.value.toLocaleLowerCase();refreshCatalog();catalog.querySelector('[data-catalog-search]').focus();});
  function syncChrome(){
    const universal=state?.templateId&&state.templateId!=='hasl';
    document.body.classList.toggle('universal-site',!!universal);
    document.querySelector('#preview-site')?.closest('label')?.toggleAttribute('hidden',!!universal);
    for(const name of ['products','reviews','news'])document.querySelectorAll(`[data-tab="${name}"]`).forEach(node=>node.hidden=!!universal);
    if(universal){document.querySelector('#data-status').textContent='Ваши блоки · без привязки к магазину';document.querySelector('#refresh-all').hidden=true;}
    else document.querySelector('#refresh-all').hidden=false;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const nav=document.querySelector('.studio-primary-tabs');if(!nav)return;
    const shortcuts=document.createElement('div');shortcuts.className='universal-shortcuts';shortcuts.innerHTML='<button data-block-catalog class="primary">Добавить блок</button><button data-template-gallery>Шаблоны сайтов</button><button data-tab="pageSettings">Настройки страницы</button>';
    nav.before(shortcuts);
    const original=render;render=function(){original();syncChrome();};
    const footer=document.querySelector('.preview-footer span:last-child');if(footer)footer.textContent='Блоки → содержимое → предпросмотр → HTML';
    document.querySelectorAll('[data-new-reference]').forEach(button=>{const icon=button.querySelector('.profile-menu-icon')?.outerHTML||'';button.removeAttribute('data-new-reference');button.dataset.templateGallery='';button.innerHTML=icon+'Новый сайт из шаблона';});
  });
  window.SiteTemplates={templates,blocks,open,panel,syncChrome};
})();
