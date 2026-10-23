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
