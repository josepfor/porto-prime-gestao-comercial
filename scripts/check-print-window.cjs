const fs=require('fs'),assert=require('assert');
const code=fs.readFileSync('public/app.js','utf8');
const functions=[['printReceipt','width=480,height=760'],['printLabel','width=500,height=500'],['printQuote','width=900,height=800']];
for(const [name,size] of functions){
  const start=code.indexOf('async function '+name+'(');
  const end=code.indexOf('\nasync function ',start+1);
  assert(start>=0&&end>start,'Função não encontrada: '+name);
  const fn=code.slice(start,end);
  assert(fn.includes("window.open('','_blank','"+size+"')"),'Janela não aberta: '+name);
  assert(fn.indexOf('window.open(')<fn.indexOf('await '),'Janela deve abrir antes do await: '+name);
  assert(fn.includes('if(!w)'),'Bloqueio de popup não tratado: '+name);
  assert(fn.includes('catch(e)'),'Erros não tratados: '+name);
  assert(fn.includes('w.document.close()'),'Documento de impressão incompleto: '+name);
}
console.log('OK: impressão abre antes das consultas e trata bloqueios e erros.');

const vm=require('node:vm');
(async()=>{
  for(const [name] of functions){
    const start=code.indexOf('async function '+name+'(');
    const end=code.indexOf('\nasync function ',start+1);
    const fn=code.slice(start,end);
    for(const mode of ['success','blocked','api-error']){
      const events=[],messages=[];
      let html='';
      const popup={document:{write:s=>{html+=s;events.push('write')},close:()=>events.push('document-close')},close:()=>events.push('window-close')};
      const row={id:1,name:'Produto',code:'TEST',unit:'UN',retail:10,total:10,created_at:'2026-01-01',customer:'Cliente'};
      const context=vm.createContext({
        window:{open:()=>{events.push('open');return mode==='blocked'?null:popup}},
        toast:s=>messages.push(s),
        api:async url=>{
          events.push('api');
          if(mode==='api-error')throw Error('falha simulada');
          if(url==='/settings')return {company:{},sales:{}};
          if(url.endsWith('/items'))return [{description:'Item',qty:1,unit_price:10}];
          if(url.endsWith('/payments'))return [{method:'DINHEIRO',amount:10}];
          return [row];
        },
        esc:s=>String(s??''),num:String,money:String,
        printBaseStyles:()=>'',companyBlock:()=>'',console
      });
      vm.runInContext(fn,context);
      await context[name](1);
      assert.equal(events[0],'open',name+': abrir antes de consultar dados');
      if(mode==='success'){
        assert(html.includes('print()'),name+': comando de impressão');
        assert(events.includes('document-close'),name+': finalizar documento');
        assert(!events.includes('window-close'),name+': manter janela pronta');
      }else if(mode==='blocked'){
        assert(!events.includes('api'),name+': popup bloqueado não consulta dados');
        assert.equal(messages.length,1);
      }else{
        assert(events.includes('window-close'),name+': fechar janela em falha');
        assert.equal(messages.length,1);
      }
    }
  }
  console.log('OK: comprovante, etiqueta e orçamento executados com sucesso, popup bloqueado e falha de API.');
})().catch(e=>{console.error(e);process.exitCode=1});
