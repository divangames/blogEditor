// Demonstration data only; every Wordstat endpoint is intercepted.
module.exports = async function mockWordstat(context) {
  const state={calls:[],configurations:[],statuses:0,delay:0,statusDelay:0,error:false,available:true,canConfigure:true,managed:false,configureDelay:0,configureError:false};
  await context.route('**/editor-api/wordstat/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    if(name==='status'){
      state.statuses++;
      if(state.statusDelay)await new Promise(resolve=>setTimeout(resolve,state.statusDelay));
      return route.fulfill({json:{available:state.available,folderId:'demo-folder',managed:state.managed,canConfigure:state.canConfigure}});
    }
    if(name==='configure'){
      state.configurations.push(route.request().postDataJSON());
      state.configureFinished=(async()=>{
        if(state.configureDelay)await new Promise(resolve=>setTimeout(resolve,state.configureDelay));
        if(state.configureError==='network')return route.abort('failed');
        if(state.configureError)return route.fulfill({status:400,json:{error:'Проверьте API-ключ и идентификатор каталога.'}});
        state.available=!route.request().postDataJSON().clear;
        return route.fulfill({json:{available:state.available,folderId:'demo-folder',managed:false,canConfigure:true}});
      })();
      return state.configureFinished;
    }
    const data=route.request().postDataJSON();state.calls.push(data);
    if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
    if(state.error)return route.fulfill({status:502,json:{error:'Лимит Wordstat исчерпан. Повторите запрос позже.'}});
    const responses={
      top:{totalCount:'125600',results:[{phrase:'кроссовки для бега',count:'125600'},{phrase:'кроссовки для бега по асфальту',count:'34800'},{phrase:'как выбрать кроссовки для бега',count:'18200'}],associations:[{phrase:'беговая обувь',count:'24600'}]},
      dynamics:{results:[{date:'2026-01-01T00:00:00Z',count:'48000',share:'0.00012'},{date:'2026-02-01T00:00:00Z',count:'62000',share:'0.00015'},{date:'2026-03-01T00:00:00Z',count:'110000',share:'0.00027'}]},
      regions:{results:[{region:'213',count:'22400',share:'0.00022',affinityIndex:'1.3'},{region:'2',count:'12800',share:'0.00019',affinityIndex:'1.1'}]},
      tree:{regions:[{id:'225',name:'Россия',children:[{id:'213',name:'Москва',children:[]},{id:'2',name:'Санкт-Петербург',children:[]}]},{id:'111',name:'Европа',children:[]}]}
    };
    await route.fulfill({json:responses[data.mode]});
  });
  return state;
};
