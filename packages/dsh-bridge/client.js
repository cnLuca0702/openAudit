/* DSH 0.2.2-rc.1 browser module, using its declared slot registrations. */
window.__ModuleLoader__.load({
  id: '@openaudit/dsh-bridge',
  factory: (require) => {
    const React = require('react');
    const Icon = () => React.createElement('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true},
      React.createElement('path',{d:'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5'}));
    const Panel = () => React.createElement('iframe', {
      title:'openAudit 审计工作台',src:'/audit/',
      style:{border:0,width:'100%',height:'100%',display:'block',background:'#f4f7f8'},
    });
    return {
      name:'openaudit-workbench',inject:['slots','layout'],
      apply(ctx) {
        ctx.effect(function* () {
          yield ctx.slots.inject('main', () => ctx.slots.register({name:'main',key:'openaudit'},Panel));
          yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist',id:'openaudit',order:-10,label:'审计工作台'},Icon));
        });
      },
    };
  },
});
