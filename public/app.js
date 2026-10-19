const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(+n||0),num=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(+n||0),esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let token=localStorage.cg42token||localStorage.cg41token||'',me=null,cart=[],payments=[{method:'Dinheiro',amount:0,touched:false}],purchaseCart=[],quoteCart=[],cashReceived=0;
let activeQuoteEditId=null,pdvQuoteId=null,pdvQuoteCustomerId=null,pdvQuoteDiscountPct=0;
let pdvLookupTimer=null,pdvLookupSeq=0,pdvNetworkTimer=null,pdvNetworkOnline=true,pdvResultCursor=0,pdvDiscountMode='PERCENT',pdvDiscountValue=0;
let pdvPendingRequestId=null;
const hasPerm=k=>me?.role==='Administrador'||!!me?.permissions?.[k];
async function api(url,opt={}){let r=await fetch('/api'+url,{...opt,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...opt.headers}}),j=await r.json().catch(()=>({}));if(r.status===401){if(url!=='/auth/login'&&token){logout();throw Error(j.error||'Sessão expirada')}throw Error(j.error||'E-mail ou senha incorretos.')}if(r.status===402){showActivation(j);throw Error(j.error||'Licença necessária')}if(!r.ok){let e=Error(j.error||'Erro na operação');e.status=r.status;throw e}return j}
function toast(x){let t=document.getElementById('toast');t.textContent=x;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2300)}
async function licenseStatus(){let r=await fetch('/api/license/status',{cache:'no-store'}),j=await r.json();if(!j.active){showActivation(j);return false}window._ppLicense=j;activation?.classList.add('hidden');login?.classList.remove('hidden');let b=document.getElementById('trialBanner');if(b){if(j.accessMode==='trial'){b.classList.remove('hidden');b.innerHTML=`<b>DEMONSTRAÇÃO GRATUITA</b><span>${j.daysRemaining} ${j.daysRemaining===1?'dia restante':'dias restantes'} • Seus dados serão preservados</span><a href="mailto:portoprime.gc@proton.me?subject=Ativar%20Plano%20Comercial">Ativar Plano Comercial</a>`}else b.classList.add('hidden')}return true}
function showActivation(j={}){try{shell?.classList.add('hidden');login?.classList.add('hidden');activation?.classList.remove('hidden');licenseMachineId.textContent=j.machineId||'—';licenseMsg.textContent=j.error||'';let btn=document.getElementById('trialStartButton'),st=document.getElementById('trialStatus');if(btn&&st){if(j.used||j.expired||j.available===false){btn.disabled=true;btn.textContent=j.expired?'DEMONSTRAÇÃO ENCERRADA':'DEMONSTRAÇÃO JÁ UTILIZADA';st.textContent=j.error||'Ative o Plano Comercial para continuar.'}else{btn.disabled=false;btn.innerHTML='INICIAR DEMONSTRAÇÃO GRATUITA <span>→</span>';st.textContent=''}}}catch{}}
function copyMachineId(){let id=document.getElementById('licenseMachineId')?.textContent||'';navigator.clipboard?.writeText(id);let m=document.getElementById('licenseMsg');if(m){m.className='ok';m.textContent='ID copiado. Envie este código para emissão da licença.'}}
async function activateLicense(){let key=document.getElementById('licenseKeyInput')?.value.trim();if(!key)return licenseMsg.textContent='Cole a chave de licença.';try{let r=await fetch('/api/license/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({licenseKey:key})}),j=await r.json();if(!r.ok)throw Error(j.error||'Licença inválida.');licenseMsg.className='ok';licenseMsg.textContent='Licença ativada com sucesso. Abrindo Porto Prime...';setTimeout(()=>location.reload(),700)}catch(e){licenseMsg.className='danger';licenseMsg.textContent=e.message}}
async function startTrial(){let btn=document.getElementById('trialStartButton'),st=document.getElementById('trialStatus');try{btn.disabled=true;btn.textContent='INICIANDO...';let r=await fetch('/api/license/trial/start',{method:'POST',headers:{'Content-Type':'application/json'}}),j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'Não foi possível iniciar a demonstração.'),{data:j});st.className='ok';st.textContent='Demonstração ativada. Abrindo Porto Prime...';setTimeout(()=>location.reload(),700)}catch(e){st.className='danger';st.textContent=e.message;showActivation(e.data||{available:true,error:e.message,machineId:licenseMachineId?.textContent})}}
async function doLogin(e){e.preventDefault();const btn=e.submitter||document.querySelector('.login-btn');try{loginMsg.className='muted';loginMsg.textContent='Verificando acesso...';if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.textContent='ENTRANDO...'}let j=await api('/auth/login',{method:'POST',body:JSON.stringify({email:loginEmail.value.trim(),password:loginPass.value})});token=j.token;me=j.user;localStorage.cg42token=token;loginMsg.className='ok';loginMsg.textContent='Acesso confirmado.';if(me.must_change_password)return initialPasswordSetup();await start()}catch(x){loginMsg.className='danger';loginMsg.textContent=x.message||'Não foi possível entrar.'}finally{if(btn){btn.disabled=false;if(btn.dataset.originalText)btn.innerHTML=btn.dataset.originalText}}}
async function togglePasswordRecovery(){
  const box=document.getElementById('passwordRecoveryBox');
  if(!box)return;
  const opening=box.classList.contains('hidden');
  box.classList.toggle('hidden');
  if(!opening)return;
  const msg=document.getElementById('recoveryMsg');if(msg)msg.textContent='Carregando dados deste computador...';
  try{
    const r=await fetch('/api/auth/recovery-info',{cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.error||'Não foi possível preparar a recuperação.');
    const email=document.getElementById('recoveryEmail'),machine=document.getElementById('recoveryMachine');
    if(email)email.value=j.email||'admin@construgest.local';
    if(machine)machine.value=j.machineId||'';
    if(msg){msg.className='ok';msg.textContent='Pronto. Defina uma nova senha abaixo.'}
    document.getElementById('recoveryPassword')?.focus();
  }catch(e){
    if(msg){msg.className='danger';msg.textContent=e.message}
  }
}
async function savePasswordRecovery(){
  const email=document.getElementById('recoveryEmail')?.value||'',machineId=document.getElementById('recoveryMachine')?.value||'',p=document.getElementById('recoveryPassword')?.value||'',p2=document.getElementById('recoveryPassword2')?.value||'',msg=document.getElementById('recoveryMsg');
  if(p.length<6){if(msg){msg.className='danger';msg.textContent='Use pelo menos 6 caracteres.'}return}
  if(p!==p2){if(msg){msg.className='danger';msg.textContent='As senhas não conferem.'}return}
  try{
    if(msg){msg.className='muted';msg.textContent='Redefinindo senha...'}
    const r=await fetch('/api/auth/recover-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,machineId,password:p})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.error||'Não foi possível redefinir a senha.');
    if(msg){msg.className='ok';msg.textContent='Senha redefinida com sucesso. Use a nova senha para entrar.'}
    loginEmail.value=email;loginPass.value='';loginPass.focus();
  }catch(e){
    if(msg){msg.className='danger';msg.textContent=e.message}
  }
}
function initialPasswordSetup(){
  if(document.getElementById('modal'))return;
  modal(`<h3>Crie sua senha administrativa</h3><div class="alert orange">Por segurança, a senha padrão deve ser substituída antes de usar o Porto Prime.</div><label>Nova senha</label><input id=initialPassword type=password autocomplete=new-password placeholder="Mínimo de 8 caracteres"><label>Confirmar senha</label><input id=initialPassword2 type=password autocomplete=new-password placeholder="Digite novamente"><div style="margin-top:18px"><button class=primary onclick=saveInitialPassword()>SALVAR NOVA SENHA</button></div>`);
}
async function saveInitialPassword(){let p=document.getElementById('initialPassword')?.value||'',p2=document.getElementById('initialPassword2')?.value||'';if(p.length<8)return toast('Use pelo menos 8 caracteres.');if(p!==p2)return toast('As senhas não conferem.');try{await api('/auth/change-initial-password',{method:'POST',body:JSON.stringify({password:p})});me.must_change_password=false;closeModal();toast('Senha alterada com sucesso.');start()}catch(e){toast(e.message)}}
function logout(){localStorage.removeItem('cg42token');localStorage.removeItem('cg41token');location.reload()}
const menus=[['dashboard','⌂','Visão Geral','Principal'],['caixa','▰','Caixa','Principal'],['pdv','▣','PDV','Vendas'],['vendas','◫','Histórico de vendas','Vendas'],['novo-orcamento','▤','Novo orçamento','Orçamentos'],['orcamentos-salvos','▥','Orçamentos salvos','Orçamentos'],['produtos','▦','Produtos','Estoque'],['tabela-precos','↳','Tabela de preços','Estoque'],['reposicao','↻','Sugestão de compra','Estoque'],['inteligencia-estoque','◈','Inteligência de Estoque','Estoque'],['estoque','⇅','Movimentações','Estoque'],['inventario','✓','Inventário','Estoque'],['compras','◆','Compras','Compras'],['fornecedores','◇','Fornecedores','Compras'],['clientes','♙','Clientes','Cadastros'],['financeiro','R$','Financeiro','Financeiro'],['metas-comissoes','♧','Metas e comissões','Vendas'],['relatorios','▤','Relatórios','Gestão'],['usuarios','♟','Usuários','Administração'],['auditoria','▥','Auditoria','Administração'],['configuracoes','⚙','Configurações','Administração']];
const ROLE_VIEWS={
  Administrador:['dashboard','caixa','pdv','vendas','novo-orcamento','orcamentos-salvos','produtos','reposicao','inteligencia-estoque','estoque','inventario','compras','fornecedores','clientes','financeiro','metas-comissoes','relatorios','usuarios','auditoria','configuracoes'],
  Gerente:['dashboard','caixa','pdv','vendas','novo-orcamento','orcamentos-salvos','produtos','reposicao','inteligencia-estoque','estoque','inventario','compras','fornecedores','clientes','financeiro','metas-comissoes','relatorios','auditoria'],
  Vendedor:['pdv','vendas','novo-orcamento','orcamentos-salvos','produtos','clientes','metas-comissoes'],
  Caixa:['caixa','pdv','vendas','novo-orcamento','orcamentos-salvos','produtos','clientes'],
  Estoquista:['produtos','reposicao','inteligencia-estoque','estoque','inventario','compras','fornecedores']
};
function canView(v){if(v==='tabela-precos')return canView('produtos');if(me?.role==='Administrador')return true;let base=ROLE_VIEWS[me?.role]||[];if(v==='financeiro'&&hasPerm('financial'))return true;if(['reposicao','inteligencia-estoque','estoque','inventario','compras','fornecedores'].includes(v)&&hasPerm('stock'))return true;return base.includes(v)}

const subtitles={'tabela-precos':'Preços de varejo e atacado com promoção ao lado',dashboard:'Resumo da operação e indicadores do negócio',caixa:'Abertura, movimentos, conferência e fechamento profissional',pdv:'Venda rápida, preços automáticos e múltiplos pagamentos',vendas:'Consulte, imprima e estorne vendas','novo-orcamento':'Monte propostas profissionais para seus clientes','orcamentos-salvos':'Consulte, imprima e converta propostas em vendas',produtos:'Preços, margens e cadastro do catálogo','inteligencia-estoque':'Curva ABC, giro, cobertura, capital parado e reposição inteligente',estoque:'Kardex e histórico de entradas e saídas',inventario:'Contagem e acerto físico de estoque',compras:'Pedidos, recebimento e custo médio',fornecedores:'Cadastro e histórico de fornecedores',clientes:'Cadastro e histórico de clientes',financeiro:'Contas a pagar, receber e resultado','metas-comissoes':'Metas mensais, desempenho e comissão prevista dos vendedores',relatorios:'Vendas, produtos, estoque, clientes, vendedores, compras e financeiro',usuarios:'Acessos e níveis de permissão',auditoria:'Rastreabilidade das operações',configuracoes:'Empresa, vendas, estoque, segurança e preferências do sistema'};
// ConstruGest 3.2.0 - PDV PRO
function getViewHandler(v){
  switch(v){
    case 'dashboard': return dashboard; case 'caixa': return caixa; case 'pdv': return pdv; case 'vendas': return vendas;
    case 'tabela-precos': return tabelaPrecos; case 'produtos': return produtos; case 'reposicao': return reposicao; case 'inteligencia-estoque': return inteligenciaEstoque; case 'estoque': return estoque;
    case 'inventario': return inventario; case 'compras': return compras; case 'novo-orcamento': return novoOrcamento; case 'orcamentos-salvos': return orcamentosSalvos;
    case 'clientes': return clientes; case 'fornecedores': return fornecedores; case 'financeiro': return financeiro; case 'metas-comissoes': return metasComissoes;
    case 'usuarios': return usuarios; case 'relatorios': return relatorios; case 'auditoria': return auditoria;
    case 'configuracoes': return configuracoes; default: return null;
  }
}
async function start(){if(!me)me=await api('/me');if(me.must_change_password){login.classList.remove('hidden');shell.classList.add('hidden');initialPasswordSetup();return}try{let cfg=await api('/settings');window._cgAutoPrint=!!cfg.sales?.auto_print;document.body.classList.toggle('dark-ui',cfg.system?.theme==='dark')}catch{}login.classList.add('hidden');shell.classList.remove('hidden');who.textContent=`${me.name} • ${me.role}`;let group='';let visibleMenus=menus.filter(m=>canView(m[0]));nav.innerHTML=visibleMenus.map(m=>{let h=m[3]!==group?`<div class=nav-group>${group=m[3]}</div>`:'';return h+`<button ${m[0]==='tabela-precos'?'style="padding-left:32px;font-size:13px"':''} data-view="${m[0]}"><span class=nav-icon>${m[1]}</span><span>${m[2]}</span></button>`}).join('');nav.querySelectorAll('button').forEach(b=>b.onclick=()=>render(b.dataset.view));render(canView('dashboard')?'dashboard':(visibleMenus[0]?.[0]||'pdv'))}
async function render(v){if(!canView(v)){app.innerHTML='<div class="alert red">Acesso não autorizado para este usuário.</div>';return}let m=menus.find(x=>x[0]===v);title.textContent=m?m[2]:v;subtitle.textContent=subtitles[v]||'Operação integrada em tempo real';document.body.classList.remove('navopen');nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));app.innerHTML='<div class="panel loading">Carregando informações...</div>';try{let handler=getViewHandler(v);if(!handler)throw Error('Tela não encontrada: '+v);app.innerHTML=await handler()}catch(e){app.innerHTML=`<div class="alert red">${esc(e.message)}</div>`}}
// ConstruGest 3.0 - Caixa e Fechamento Profissional
async function caixa(){let [r,h]=await Promise.all([api('/cash/professional/current'),api('/cash/history')]);if(!r)return `<div class="v23-hero"><div><span class=eyebrow>CAIXA PROFISSIONAL</span><h2>Caixa fechado</h2><p>Abra o caixa para iniciar as vendas e controlar o movimento do dia.</p></div><button class=primary onclick=openCashProForm()>ABRIR CAIXA</button></div>${cashHistoryHtml(h)}`;let c=r.cash,ss=r.sales||{};return `<div class="v23-hero"><div><span class=eyebrow>CAIXA #${r.session.id} • ABERTO</span><h2>${esc(r.session.operator)}</h2><p>Aberto em ${new Date(r.session.opened_at).toLocaleString('pt-BR')}</p></div><button class=danger-btn onclick=closeCashProForm()>FECHAR CAIXA</button></div><div class="cards cards6"><div class=card><small>Fundo de abertura</small><strong>${money(c.opening)}</strong></div><div class=card><small>Vendas totais</small><strong>${money(ss.total)}</strong><span class=kpi>${ss.sales||0} venda(s)</span></div><div class=card><small>Dinheiro em vendas</small><strong>${money(c.cash_sales)}</strong></div><div class=card><small>Suprimentos</small><strong class=ok>${money(c.supplies)}</strong></div><div class=card><small>Sangrias + estornos</small><strong class=danger>${money(c.withdrawals+c.refunds)}</strong></div><div class=card><small>Dinheiro esperado</small><strong>${money(c.expected)}</strong></div></div><div class=grid2><div class=panel><div class=toolbar><h3>Formas de pagamento</h3><div><button class=success-btn onclick="cashMoveProForm('SUPRIMENTO')">+ Suprimento</button> <button class=danger-btn onclick="cashMoveProForm('SANGRIA')">− Sangria</button></div></div>${r.payments.length?r.payments.map(x=>`<div class=sale-item><span>${esc(x.method)} <small class=muted>• ${x.sales} venda(s)</small></span><b>${money(x.total)}</b></div>`).join(''):'<div class=empty>Nenhuma venda neste caixa.</div>'}</div><div class=panel><h3>Movimentações do caixa</h3><div class=scroll><table><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr>${r.movements.length?r.movements.slice().reverse().map(x=>`<tr><td>${new Date(x.created_at).toLocaleTimeString('pt-BR')}</td><td>${esc(x.kind)}</td><td>${esc(x.description||'')}</td><td class="${+x.amount<0?'danger':'ok'}">${money(x.amount)}</td></tr>`).join(''):'<tr><td colspan=4>Nenhuma movimentação.</td></tr>'}</table></div></div></div>${cashHistoryHtml(h)}`}
function cashHistoryHtml(h){return `<div class=panel><div class=toolbar><h3>Histórico de caixas</h3><span class=pill>Últimos ${h.length}</span></div><div class=scroll><table><tr><th>#</th><th>Abertura</th><th>Operador</th><th>Fechamento</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th></th></tr>${h.map(x=>`<tr><td>${x.id}</td><td>${new Date(x.opened_at).toLocaleString('pt-BR')}</td><td>${esc(x.operator)}</td><td>${x.closed_at?new Date(x.closed_at).toLocaleString('pt-BR'):'<span class="pill">ABERTO</span>'}</td><td>${x.expected_amount==null?'—':money(x.expected_amount)}</td><td>${x.counted_amount==null?'—':money(x.counted_amount)}</td><td class="${+x.difference?'danger':'ok'}">${x.difference==null?'—':money(x.difference)}</td><td><button class="secondary mini" onclick="showCashReport(${x.id})">Relatório</button></td></tr>`).join('')}</table></div></div>`}
function openCashProForm(){modal(`<h3>Abrir caixa</h3><p class=muted>Informe o dinheiro disponível no caixa no início do turno.</p><label>Fundo de abertura</label><input id=cashOpening type=number min=0 step=.01 value=0><div style="margin-top:18px"><button class=primary onclick=confirmOpenCashPro()>ABRIR CAIXA</button> <button onclick=closeModal()>Cancelar</button></div>`)}
async function confirmOpenCashPro(){try{await api('/cash/open',{method:'POST',body:JSON.stringify({opening_amount:+cashOpening.value||0})});closeModal();toast('Caixa aberto com sucesso.');render('caixa')}catch(e){alert(e.message)}}
function cashMoveProForm(kind){modal(`<h3>${kind==='SUPRIMENTO'?'Suprimento':'Sangria'}</h3><label>Valor</label><input id=cashMoveAmount type=number min=.01 step=.01><label>Motivo / descrição</label><input id=cashMoveDesc maxlength=160 placeholder="Informe o motivo"><div style="margin-top:18px"><button class=${kind==='SUPRIMENTO'?'success-btn':'danger-btn'} onclick="confirmCashMovePro('${kind}')">CONFIRMAR</button> <button onclick=closeModal()>Cancelar</button></div>`)}
async function confirmCashMovePro(kind){let amount=+cashMoveAmount.value,description=cashMoveDesc.value.trim();if(!amount||amount<=0)return toast('Informe um valor válido.');if(!description)return toast('Informe o motivo.');try{await api('/cash/movement',{method:'POST',body:JSON.stringify({kind,amount,description})});closeModal();toast('Movimentação registrada.');render('caixa')}catch(e){alert(e.message)}}
async function closeCashProForm(){let r=await api('/cash/professional/current');if(!r)return toast('Não há caixa aberto.');modal(`<h3>Fechamento do caixa #${r.session.id}</h3><div class=alert yellow>Conte somente o dinheiro físico existente na gaveta.</div><div class=cards><div class=card><small>Dinheiro esperado</small><strong>${money(r.cash.expected)}</strong></div><div class=card><small>Vendas totais</small><strong>${money(r.sales.total)}</strong></div></div><label>Dinheiro contado na gaveta</label><input id=cashCounted type=number min=0 step=.01 placeholder="0,00" oninput=previewCashProDifference(${r.cash.expected})><div id=cashDiffPreview class=alert>Informe o valor contado.</div><label>Observação do fechamento</label><textarea id=cashCloseNote rows=3 placeholder="Opcional"></textarea><div style="margin-top:18px"><button class=danger-btn onclick=confirmCloseCashPro()>CONFIRMAR FECHAMENTO</button> <button onclick=closeModal()>Cancelar</button></div>`)}
function previewCashProDifference(expected){let v=+document.getElementById('cashCounted')?.value,d=document.getElementById('cashDiffPreview');if(!d)return;let diff=v-expected;d.className='alert '+(Math.abs(diff)<.01?'green':'red');d.innerHTML=`Diferença: <b>${money(diff)}</b> ${Math.abs(diff)<.01?'• Caixa conferido':'• Verifique antes de fechar'}`}
async function confirmCloseCashPro(){let counted=+cashCounted.value;if(!Number.isFinite(counted)||counted<0)return toast('Informe o dinheiro contado.');try{let x=await api('/cash/close',{method:'POST',body:JSON.stringify({counted_amount:counted,close_note:cashCloseNote.value})});closeModal();alert(`Caixa fechado.\nEsperado: ${money(x.expected_amount)}\nContado: ${money(x.counted_amount)}\nDiferença: ${money(x.difference)}`);render('caixa')}catch(e){alert(e.message)}}
async function showCashReport(id){try{let r=await api('/cash/report/'+id),c=r.cash,ss=r.sales;modal(`<div class=toolbar><div><span class=eyebrow>RELATÓRIO DE FECHAMENTO</span><h3>Caixa #${id}</h3></div><button onclick=window.print()>Imprimir</button></div><p><b>Operador:</b> ${esc(r.session.operator)}<br><b>Abertura:</b> ${new Date(r.session.opened_at).toLocaleString('pt-BR')}<br><b>Fechamento:</b> ${r.session.closed_at?new Date(r.session.closed_at).toLocaleString('pt-BR'):'Caixa ainda aberto'}</p><div class=cards><div class=card><small>Vendas</small><strong>${money(ss.total)}</strong></div><div class=card><small>Esperado em dinheiro</small><strong>${money(c.expected)}</strong></div><div class=card><small>Contado</small><strong>${c.counted==null?'—':money(c.counted)}</strong></div><div class=card><small>Diferença</small><strong>${c.difference==null?'—':money(c.difference)}</strong></div></div><h4>Formas de pagamento</h4>${r.payments.map(x=>`<div class=sale-item><span>${esc(x.method)}</span><b>${money(x.total)}</b></div>`).join('')||'<div class=empty>Sem vendas.</div>'}<p><b>Suprimentos:</b> ${money(c.supplies)} • <b>Sangrias:</b> ${money(c.withdrawals)} • <b>Estornos em dinheiro:</b> ${money(c.refunds)}</p>${r.session.close_note?`<div class=alert>Observação: ${esc(r.session.close_note)}</div>`:''}<button onclick=closeModal()>Fechar</button>`)}catch(e){alert(e.message)}}

async function dashboard(){let [d,c,ch]=await Promise.all([api('/dashboard-v23'),api('/cash/summary'),api('/dashboard/charts')]),f=Object.fromEntries(d.financial.map(x=>[x.kind,+x.total])),max=Math.max(1,...ch.days.map(x=>+x.total));return `<div class="v23-hero"><div><span class=eyebrow>PAINEL GERENCIAL</span><h2>Seu negócio em um só olhar</h2><p>Acompanhe vendas, lucro, caixa, financeiro e estoque sem perder tempo.</p></div><button class=primary onclick="render('pdv')">▣ Nova venda</button></div><div class="cards cards6"><div class=card><small>Vendas hoje</small><strong>${money(d.today.revenue)}</strong><span class=kpi>${d.today.sales} venda(s)</span></div><div class=card><small>Lucro bruto hoje</small><strong class=ok>${money(d.today.gross)}</strong></div><div class=card><small>Vendas no mês</small><strong>${money(d.month.revenue)}</strong><span class=kpi>${d.month.sales} venda(s)</span></div><div class=card><small>Caixa físico</small><strong>${c?money(c.expected):'Fechado'}</strong></div><div class=card><small>Contas a receber</small><strong>${money(f.RECEBER||0)}</strong></div><div class=card><small>Contas a pagar</small><strong class=danger>${money((f.PAGAR||0)+(f.DESPESA||0))}</strong></div></div><div class=grid2><div class=panel><div class=toolbar><h3>Vendas — últimos 7 dias</h3><span class=pill>Atualizado agora</span></div>${ch.days.map(x=>`<div style="display:grid;grid-template-columns:48px 1fr 100px;gap:8px;align-items:center;margin:11px 0"><small>${x.label}</small><div class=bar><i style="width:${(+x.total/max*100).toFixed(1)}%"></i></div><b>${money(x.total)}</b></div>`).join('')}</div><div class=panel><div class=toolbar><h3>Central de alertas</h3><button class=mini onclick="render('reposicao')">Ver reposição</button></div><div class="alert ${d.low.length?'red':'green'}">${d.low.length?'⚠ '+d.low.length+' produto(s) precisam de reposição':'✓ Estoque sem alerta crítico'}</div><div class="alert ${f.PAGAR||f.DESPESA?'yellow':'green'}">Contas pendentes a pagar: <b>${money((f.PAGAR||0)+(f.DESPESA||0))}</b></div><div class="alert ${f.RECEBER?'yellow':'green'}">Contas pendentes a receber: <b>${money(f.RECEBER||0)}</b></div>${c?`<div class="alert green">Caixa aberto • esperado ${money(c.expected)}</div>`:'<div class="alert red">Caixa fechado</div>'}</div></div><div class=grid2><div class=panel><h3>Produtos mais vendidos no mês</h3>${d.top.length?d.top.map((x,i)=>`<div class=sale-item><span><b>#${i+1}</b> ${esc(x.description)}</span><b>${num(x.qty)} un. • ${money(x.revenue)}</b></div>`).join(''):'<div class=empty>Sem vendas no mês.</div>'}</div><div class=panel><h3>Formas de pagamento no mês</h3>${ch.payments.length?ch.payments.map(x=>`<div class=sale-item><span>${esc(x.method)}</span><b>${money(x.total)}</b></div>`).join(''):'<div class=empty>Sem vendas.</div>'}</div></div>${d.dead.length?`<div class=panel><div class=toolbar><h3>Produtos sem venda há 60 dias</h3><span class="pill amber">Capital parado</span></div>${d.dead.map(x=>`<div class=sale-item><span>${esc(x.name)} <small class=muted>• estoque ${num(x.stock)}</small></span><b>${money(+x.stock*+x.cost)}</b></div>`).join('')}</div>`:''}`}

async function globalFind(){let q=globalSearch.value.trim();if(!q)return;let p=await api('/products/search?q='+encodeURIComponent(q));if(!p.length)return toast('Nenhum produto encontrado.');showProductHistory(p[0].id)}
async function produtos(){let p=await api('/products');return `<div class=panel><div class=toolbar><h3>Cadastro de produtos</h3><button class=secondary onclick="render('tabela-precos')">Tabela de preços</button><input id=productFilter placeholder="Filtrar produtos..." oninput="filterRows(this.value,'prodTable')" style="max-width:260px">${canStock()?'<button class=secondary onclick="chooseProductImport()">↑ Importar backup</button><button class=secondary onclick="exportProductBackup()">↓ Exportar backup</button><input id=productImportFile type=file accept=".xlsx,.xls" class=hidden onchange="previewProductImport(this.files[0])"><button class=primary onclick="productForm()">+ Novo produto</button>':''}</div><div class=scroll><table id=prodTable><tr><th>Código</th><th>Produto</th><th>Estoque</th>${hasPerm('view_cost')?'<th>Custo</th>':''}<th>Varejo</th>${hasPerm('view_cost')?'<th>Margem</th>':''}<th>Atacado</th><th>Promo</th><th>Ações</th></tr>${p.map(x=>`<tr><td>${esc(x.code)}<br><small>${esc(x.ean||'')}</small></td><td><b>${esc(x.name)}</b><br><small>${esc(x.brand||'')} • ${esc(x.category||'')}</small></td><td class="${+x.stock<=+x.min_stock?'danger':''}">${num(x.stock)} ${esc(x.unit)}</td>${hasPerm('view_cost')?`<td>${money(x.cost)}</td>`:''}<td>${money(x.retail)}</td>${hasPerm('view_cost')?`<td>${margin(x.cost,x.retail)}%</td>`:''}<td>${money(x.wholesale)}</td><td>${money(x.promo)}</td><td><button class="secondary mini" onclick="showProductHistory(${x.id})">Histórico</button> ${canStock()?`<button class="secondary mini" onclick="productForm(${x.id})">Editar</button> <button class="secondary mini" onclick="printLabel(${x.id})">Etiqueta</button>`:''}</td></tr>`).join('')}</table></div></div>`}
let productImportBase64='';
function chooseProductImport(){document.getElementById('productImportFile')?.click()}
function fileBase64(file){return new Promise((ok,no)=>{let r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>no(Error('Não foi possível ler o arquivo.'));r.readAsDataURL(file)})}
async function previewProductImport(file){if(!file)return;try{productImportBase64=await fileBase64(file);let x=await api('/products/import-preview',{method:'POST',body:JSON.stringify({base64:productImportBase64})}),sample=x.rows.slice(0,20);modal(`<h3>Importar backup de produtos</h3><p><b>${x.total}</b> produto(s) encontrados • <b>${x.new_count}</b> novos • <b>${x.existing}</b> códigos já cadastrados.</p><div class=alert yellow>Escolha como tratar códigos que já existem. O estoque de produtos existentes não será alterado pela opção Atualizar.</div><div class=scroll style="max-height:340px"><table><tr><th>Código</th><th>Descrição</th><th>Marca</th><th>Un.</th><th>Venda</th><th>Situação</th></tr>${sample.map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.unit)}</td><td>${money(r.retail)}</td><td>${r.exists?'<span class="pill amber">Já existe</span>':'<span class="pill">Novo</span>'}</td></tr>`).join('')}</table></div>${x.total>20?`<p class=muted>Prévia dos primeiros 20 de ${x.total} produtos.</p>`:''}<div class=modal-actions><button onclick=closeModal()>Cancelar</button><button class=secondary onclick="runProductImport('skip')">Importar e ignorar existentes</button><button class=primary onclick="runProductImport('update')">Importar e atualizar existentes</button></div>`)}catch(e){toast(e.message);productImportBase64=''}}
async function runProductImport(mode){if(!productImportBase64)return toast('Selecione a planilha novamente.');try{let r=await api('/products/import',{method:'POST',body:JSON.stringify({base64:productImportBase64,mode})});closeModal();productImportBase64='';toast(`Importação concluída: ${r.created} novo(s), ${r.updated} atualizado(s), ${r.skipped} ignorado(s)${r.errors?.length?' • '+r.errors.length+' erro(s)':''}.`);render('produtos')}catch(e){toast(e.message)}}
async function exportProductBackup(){try{let r=await api('/products/export'),bin=atob(r.base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast(`Backup gerado com ${r.count} produto(s).`)}catch(e){toast(e.message)}}
const canStock=()=>hasPerm('stock'),canDiscount=()=>hasPerm('discount'),margin=(c,p)=>+p?(((+p-+c)/+p)*100).toFixed(1):'0.0';function filterRows(q,id){q=q.toLowerCase();document.querySelectorAll('#'+id+' tr').forEach((r,i)=>{if(i)r.style.display=r.innerText.toLowerCase().includes(q)?'':'none'})}
async function productForm(id){let [products,categories,next]=await Promise.all([id?api('/products'):Promise.resolve([]),api('/products/categories'),id?Promise.resolve(null):api('/products/next-code')]);let p=id?products.find(x=>x.id===id):{};if(!p)return toast('Produto não encontrado.');modal(`<h3>${id?'Editar':'Novo'} produto</h3><div class=formgrid><div><label>${id?'Código *':'Código automático'}</label><input id=fcode value="${esc(id?p.code:next.code)}" ${id?'':'readonly'}>${id?'':'<small class=muted>Confirmado automaticamente ao salvar.</small>'}</div><div><label>EAN / código de barras</label><input id=fean value="${esc(p.ean||'')}"></div><div class=span2><label>Nome *</label><input id=fname value="${esc(p.name||'')}"></div><div><label>Marca</label><input id=fbrand value="${esc(p.brand||'')}"></div><div><label>Categoria</label><select id=fcat onchange="document.getElementById('fcatNewWrap').hidden=this.value!=='__new__'"><option value="">Selecione a categoria</option>${categories.map(c=>`<option value="${esc(c)}" ${c===String(p.category||'').trim()?'selected':''}>${esc(c)}</option>`).join('')}<option value="__new__">+ Nova categoria</option></select><div id=fcatNewWrap hidden><label>Nova categoria</label><input id=fcatNew maxlength=120 placeholder="Digite a nova categoria"></div></div><div><label>Unidade</label><select id=funit>${['UN','SC','CX','PCT','KG','L','M','M²','M³','ROLO','BARRA'].map(u=>`<option ${p.unit===u?'selected':''}>${u}</option>`)}</select></div><div><label>Localização</label><input id=floc value="${esc(p.location||'')}"></div><div class="product-image-area"><label>Imagem do produto</label><div class="product-image-controls"><div id="productImagePreview" class="product-image-preview">${p.image_data?`<img src="${p.image_data}" alt="Imagem do produto">`:`<span>Sem imagem</span>`}</div><div class="product-image-actions"><input id="fimage" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange="previewProductImage(this)" hidden><button type="button" class="secondary" onclick="document.getElementById(\'fimage\').click()">Selecionar imagem</button><button type="button" class="secondary" onclick="clearProductImage()">Remover imagem</button><small class="muted">JPG, PNG, WEBP ou GIF • até 3 MB.</small></div></div></div>${!id?'<div><label>Estoque inicial</label><input id=fstock type=number step=.001 value="0"></div>':''}<div><label>Estoque mínimo</label><input id=fmin type=number step=.001 value="${p.min_stock||0}"></div><div><label>Estoque máximo</label><input id=fmax type=number step=.001 value="${p.max_stock||0}"></div><div><label>Custo</label><input id=fcost type=number step=.01 value="${p.cost||0}" oninput=pricePreview()></div><div><label>Preço varejo</label><input id=fretail type=number step=.01 value="${p.retail||0}" oninput=pricePreview()></div><div><label>Preço atacado</label><input id=fwhole type=number step=.01 value="${p.wholesale||0}"></div><div><label>Qtd. mínima atacado</label><input id=fwmin type=number step=.001 value="${p.wholesale_min||0}"></div><div><label>Preço promoção</label><input id=fpromo type=number step=.01 value="${p.promo||0}"></div><div><label>Início promoção</label><input id=fpstart type=date value="${String(p.promo_start||'').slice(0,10)}"></div><div><label>Fim promoção</label><input id=fpend type=date value="${String(p.promo_end||'').slice(0,10)}"></div></div><div id=priceInfo class=alert>Margem varejo: ${margin(p.cost,p.retail)}%</div><button class=primary onclick="saveProduct(${id||'null'})">Salvar produto</button> <button onclick="closeModal()">Cancelar</button>`)}
function pricePreview(){priceInfo.innerHTML=`Margem varejo: <b>${margin(fcost.value,fretail.value)}%</b> • Lucro unitário: <b>${money(+fretail.value-+fcost.value)}</b>`}
let productSaving=false;
async function saveProduct(id){if(productSaving)return;let x={code:id?fcode.value:undefined,ean:fean.value,name:fname.value,brand:fbrand.value,category:fcat.value==='__new__'?document.getElementById('fcatNew').value.trim():fcat.value,unit:funit.value,location:floc.value,stock:window.fstock?.value||0,min_stock:fmin.value,max_stock:fmax.value,cost:fcost.value,retail:fretail.value,wholesale:fwhole.value,wholesale_min:fwmin.value,promo:fpromo.value,promo_start:fpstart.value||null,promo_end:fpend.value||null};if((id&&!x.code)||!x.name.trim())return alert('Informe os campos obrigatórios.');if(fcat.value==='__new__'&&!x.category)return alert('Informe a nova categoria.');productSaving=true;try{let saved=await api('/products'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(x)});closeModal();toast('Produto '+saved.code+' salvo.');render('produtos')}catch(e){alert(e.message)}finally{productSaving=false}}
async function showProductHistory(id){let h=await api('/products/'+id+'/history'),p=h.product;modal(`<h3>${esc(p.code)} — ${esc(p.name)}</h3><div class=cards style="grid-template-columns:repeat(4,1fr)"><div class=card><small>Estoque</small><strong>${num(p.stock)} ${esc(p.unit)}</strong></div>${hasPerm('view_cost')?`<div class=card><small>Custo</small><strong>${money(p.cost)}</strong></div>`:''}<div class=card><small>Varejo</small><strong>${money(p.retail)}</strong></div><div class=card><small>Margem</small><strong>${margin(p.cost,p.retail)}%</strong></div></div><h4>Kardex / movimentações</h4><div class=scroll><table><tr><th>Data</th><th>Tipo</th><th>Qtd.</th><th>Antes</th><th>Depois</th><th>Usuário</th></tr>${h.movements.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(x.kind)}</td><td>${num(x.qty)}</td><td>${num(x.balance_before)}</td><td>${num(x.balance_after)}</td><td>${esc(x.user_name||'')}</td></tr>`).join('')}</table></div><button onclick=closeModal()>Fechar</button>`)}
function openCash(){modal(`<h3>Abertura de caixa</h3><p class=muted>Operador: <b>${esc(me?.name||'')}</b></p><label>Valor inicial em dinheiro</label><input id=cashOpening type=number min=0 step=.01 value=0 autofocus><div style="margin-top:18px"><button class=primary onclick=confirmOpenCash()>ABRIR CAIXA</button> <button onclick=closeModal()>Cancelar</button></div>`);setTimeout(()=>cashOpening?.focus(),50)}async function confirmOpenCash(){let v=+cashOpening.value;if(v<0)return toast('Informe um valor válido.');try{await api('/cash/open',{method:'POST',body:JSON.stringify({opening_amount:v})});closeModal();toast('Caixa aberto.');render('pdv')}catch(e){toast(e.message)}}function cashMove(){modal(`<h3>Movimentação de caixa</h3><label>Tipo</label><select id=cashKind><option value=SUPRIMENTO>Suprimento</option><option value=SANGRIA>Sangria</option></select><label>Valor</label><input id=cashAmount type=number min=.01 step=.01 value=0><label>Descrição</label><input id=cashDesc placeholder="Motivo / observação"><div style="margin-top:18px"><button class=primary onclick=confirmCashMove()>Confirmar</button> <button onclick=closeModal()>Cancelar</button></div>`)}async function confirmCashMove(){let kind=cashKind.value,v=+cashAmount.value;if(v<=0)return toast('Informe um valor maior que zero.');try{await api('/cash/movement',{method:'POST',body:JSON.stringify({kind,description:cashDesc.value||kind,amount:Math.abs(v)})});closeModal();toast('Movimentação registrada.');render('dashboard')}catch(e){toast(e.message)}}async function closeCash(){let s=await api('/cash/summary');if(!s)return toast('Não há caixa aberto.');modal(`<h3>Fechamento de caixa</h3><div class=alert>Saldo esperado: <b>${money(s.expected)}</b></div><label>Valor contado</label><input id=cashCounted type=number min=0 step=.01 value="${+s.expected||0}"><div style="margin-top:18px"><button class=danger-btn onclick=confirmCloseCash()>FECHAR CAIXA</button> <button onclick=closeModal()>Cancelar</button></div>`)}async function confirmCloseCash(){let v=+cashCounted.value;try{let r=await api('/cash/close',{method:'POST',body:JSON.stringify({counted_amount:v})});closeModal();modal(`<h3>Caixa fechado</h3><div class=alert green>Fechamento concluído com sucesso.</div><p>Esperado: <b>${money(r.expected_amount)}</b><br>Contado: <b>${money(r.counted_amount)}</b><br>Diferença: <b>${money(r.difference)}</b></p><button class=primary onclick="closeModal();render('dashboard')">OK</button>`)}catch(e){toast(e.message)}}
function cancelSale(id){modal(`<h3>Estornar venda #${id}</h3><div class=alert red>Esta operação devolverá os itens ao estoque.</div><label>Motivo do estorno</label><textarea id=cancelReason rows=3 placeholder="Informe o motivo"></textarea><div style="margin-top:18px"><button class=danger-btn onclick="confirmCancelSale(${id})">CONFIRMAR ESTORNO</button> <button onclick=closeModal()>Cancelar</button></div>`)}async function confirmCancelSale(id){let reason=cancelReason.value.trim();if(!reason)return toast('Informe o motivo do estorno.');try{await api('/sales/'+id+'/cancel',{method:'POST',body:JSON.stringify({reason})});closeModal();toast('Venda estornada.');render('vendas')}catch(e){toast(e.message)}}
function printBaseStyles(){return `<style>@page{margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:18px;font-size:13px}.doc{max-width:800px;margin:auto}.company{text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}.company.has-logo{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center;text-align:left}.company-logo{max-width:110px;max-height:72px;object-fit:contain}.company-text h1{margin-top:0}.company h1{margin:0 0 5px;font-size:24px}.company div{line-height:1.45}.doc-title{display:flex;justify-content:space-between;gap:15px;align-items:flex-end;margin:14px 0}.doc-title h2{margin:0}.muted{color:#555}.info{padding:10px 0;line-height:1.55}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f1f3f5}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.total{font-size:21px;font-weight:bold;text-align:right;border-top:2px solid #111;padding-top:10px}.footer{text-align:center;border-top:1px dashed #777;margin-top:20px;padding-top:12px;white-space:pre-line}.thermal{max-width:360px;font-family:monospace}.thermal .company h1{font-size:19px}.thermal th,.thermal td{padding:5px 0;background:none}.thermal .doc-title{display:block}.thermal .total{font-size:18px}@media print{body{padding:0}.no-print{display:none}}</style>`}
function companyBlock(c){let name=esc(c.trade_name||c.legal_name||'Porto Prime'),lines=[];if(c.legal_name&&c.legal_name!==c.trade_name)lines.push(esc(c.legal_name));if(c.doc)lines.push('CNPJ/CPF: '+esc(c.doc)+(c.ie?' • IE: '+esc(c.ie):''));if(c.address)lines.push(esc(c.address)+(c.city?' • '+esc(c.city):'')+(c.uf?' - '+esc(c.uf):''));let contact=[c.phone,c.whatsapp?('WhatsApp '+c.whatsapp):'',c.email].filter(Boolean).map(esc).join(' • ');if(contact)lines.push(contact);let logo=c.logo_data?`<img class=company-logo src="${c.logo_data}" alt="Logomarca">`:'';return `<div class="company ${logo?'has-logo':''}">${logo}<div class=company-text><h1>${name}</h1>${lines.map(x=>`<div>${x}</div>`).join('')}</div></div>`}
async function printReceipt(id){let [slist,items,pays,cfg]=await Promise.all([api('/sales'),api('/sales/'+id+'/items'),api('/sales/'+id+'/payments'),api('/settings')]),s=slist.find(x=>x.id===id);if(!s)return;let c=cfg.company||{},msg=cfg.sales?.receipt_message||'Obrigado pela preferência!';let w=window.open('','_blank','width=480,height=760');w.document.write(`<!doctype html><html><head><meta charset=utf-8><title>Comprovante #${s.id}</title>${printBaseStyles()}</head><body><div class="doc thermal">${companyBlock(c)}<div class=doc-title><h2>COMPROVANTE #${s.id}</h2><span>${new Date(s.created_at).toLocaleString('pt-BR')}</span></div><div class=info>Cliente: <b>${esc(s.customer||'Consumidor Final')}</b><br>Vendedor: ${esc(s.seller||'')}</div><table>${items.map(i=>`<tr><td>${esc(i.description)}<br><span class=muted>${num(i.qty)} x ${money(i.unit_price)}</span></td><td class=r>${money(+i.qty*+i.unit_price)}</td></tr>`).join('')}</table><div class=total>Total: ${money(s.total)}</div><div class=info>${pays.length?pays.map(p=>`${esc(p.method)}: ${money(p.amount)}`).join('<br>'):esc(s.payment_method)}</div><div class=footer>${esc(msg)}</div></div><script>print()<\/script></body></html>`);w.document.close()}
async function printLabel(id){let p=(await api('/products')).find(x=>x.id===id),cfg=await api('/settings'),name=esc(cfg.company?.trade_name||'Porto Prime'),w=window.open('','_blank','width=500,height=500');w.document.write(`<style>@page{margin:5mm}body{font-family:Arial;padding:15px}.label{width:330px;border:2px solid #111;padding:16px;text-align:center}.store{font-size:12px;font-weight:bold;margin-bottom:8px}.name{font-size:20px;font-weight:bold}.price{font-size:34px;font-weight:bold;margin:12px}.code{font-family:monospace;letter-spacing:3px;font-size:18px}</style><div class=label><div class=store>${name}</div><div class=name>${esc(p.name)}</div><div>${esc(p.brand||'')} • ${esc(p.unit)}</div><div class=price>${money(p.retail)}</div><div class=code>${esc(p.ean||p.code)}</div><small>Cód. ${esc(p.code)}</small></div><script>print()<\/script>`);w.document.close()}
async function printQuote(id){let [qlist,items,cfg]=await Promise.all([api('/quotes'),api('/quotes/'+id+'/items'),api('/settings')]),q=qlist.find(x=>x.id===id),c=cfg.company||{};if(!q)return;let w=window.open('','_blank','width=900,height=800');w.document.write(`<!doctype html><html><head><meta charset=utf-8><title>Orçamento #${q.id}</title>${printBaseStyles()}</head><body><div class=doc>${companyBlock(c)}<div class=doc-title><div><h2>ORÇAMENTO #${q.id}</h2><span class=muted>Emitido em ${new Date(q.created_at||Date.now()).toLocaleDateString('pt-BR')}</span></div><div>Validade: <b>${q.valid_until?new Date(q.valid_until).toLocaleDateString('pt-BR'):'—'}</b></div></div><div class=info>Cliente: <b>${esc(q.customer||'Consumidor Final')}</b></div><table><tr><th>Produto</th><th>Qtd.</th><th class=r>Unitário</th><th class=r>Total</th></tr>${items.map(i=>`<tr><td>${esc(i.description)}</td><td>${num(i.qty)}</td><td class=r>${money(i.unit_price)}</td><td class=r>${money(+i.qty*+i.unit_price)}</td></tr>`).join('')}</table><div class=total>Total do orçamento: ${money(q.total)}</div><div class=footer>${esc(cfg.sales?.quote_message||'Orçamento sujeito à disponibilidade de estoque e validade informada.')}</div></div><script>print()<\/script></body></html>`);w.document.close()}
async function convertQuote(id){try{let q=await api('/quotes/'+id);if(q.status!=='ABERTO')return toast('Orçamento indisponível para conversão.');modal(`<h3>Enviar orçamento #${id} para o PDV?</h3><div class="alert green">Os produtos serão carregados no carrinho. <b>Nenhum estoque será baixado agora.</b></div><p>A venda só será criada quando o operador conferir os itens, escolher o pagamento e clicar em <b>FINALIZAR VENDA</b> no PDV.</p><button class=primary onclick="confirmConvertQuote(${id})">ABRIR NO PDV</button> <button onclick=closeModal()>Cancelar</button>`)}catch(e){toast(e.message)}}
async function confirmConvertQuote(id){try{let [q,products]=await Promise.all([api('/quotes/'+id),api('/products')]);cart=q.items.map(i=>{let p=products.find(x=>x.id===+i.product_id);if(!p)return null;let eff=+i.unit_price*(1-(+i.discount_percent||0)/100);return {product_id:p.id,name:p.name,code:p.code,qty:+i.qty,stock:+p.stock,product:p,manual_price:eff}}).filter(Boolean);if(!cart.length)throw Error('O orçamento não possui produtos disponíveis.');pdvQuoteId=q.id;pdvQuoteCustomerId=q.customer_id||null;pdvQuoteDiscountPct=0;payments=[{method:'Dinheiro',amount:0,touched:false}];cashReceived=0;pdvSelected=cart.length-1;pdvApprovalToken=null;pdvApprovalBy='';closeModal();await render('pdv');setTimeout(()=>{if(document.getElementById('pdvCustomer')&&pdvQuoteCustomerId)pdvCustomer.value=pdvQuoteCustomerId;let top=document.querySelector('.legacy-top');if(top)top.insertAdjacentHTML('beforeend',`<div class="pdv-quote-origin">ORÇAMENTO #${id}<small>Conferir e finalizar no PDV</small></div>`);updateLegacyPdvUI()},80);toast('Orçamento #'+id+' carregado no PDV.')}catch(e){toast(e.message)}}
let pdvSelected=-1;
let pdvApprovalToken=null,pdvApprovalBy='',pdvPendingAction=null,pdvFinishing=false;
function pdvUnitPrice(i){return i&&i.manual_price!=null&&Number.isFinite(+i.manual_price)?+i.manual_price:bestPrice(i.product,i.qty)}
function pdvDiscountAmount(){
  const base=cartSubtotal();
  return Math.min(base,pdvDiscountMode==='AMOUNT'?pdvDiscountValue:base*pdvDiscountValue/100);
}
function pdvDiscountPct(){const base=cartSubtotal();return base>0?Math.round(pdvDiscountAmount()/base*100000000)/1000000:0}
function pdvResetDiscount(){pdvDiscountMode='PERCENT';pdvDiscountValue=0}
function pdvDiscountModeChanged(){
  pdvDiscountMode=document.getElementById('pdvDiscountMode')?.value==='AMOUNT'?'AMOUNT':'PERCENT';
  pdvDiscountValue=0;let input=document.getElementById('pdvDiscount');if(input){input.value='0';input.max=pdvDiscountMode==='PERCENT'?'100':''}
  updatePdvTotals();
}
function pdvDiscountPreview(){
  const v=Number(document.getElementById('pdvDiscount')?.value);
  if(Number.isFinite(v)&&v>=0&&v<=(pdvDiscountMode==='PERCENT'?100:cartSubtotal())){pdvDiscountValue=v;updatePdvTotals()}
}
function pdvFocusNext(id){const field=document.getElementById(id);field?.focus();if(field?.tagName==='INPUT')field.select()}
async function pdvFieldEnter(event,stage){
  if(event.key!=='Enter')return;
  event.preventDefault();
  if(stage==='qty'){
    const qty=Number(event.currentTarget.value);
    if(!Number.isFinite(qty)||qty<=0)return toast('Informe uma quantidade maior que zero.');
    setSelectedPdvQty(qty);pdvFocusNext('pdvSelectedUnit');return;
  }
  if(stage==='unit'){
    if(await requestPdvPriceChange(event.currentTarget.value))pdvFocusNext('pdvDiscountMode');return;
  }
  if(stage==='customer')return pdvFocusNext('pdvSearch');
  if(stage==='mode')return pdvFocusNext('pdvDiscount');
  if(stage==='discount'){
    if(await requestPdvDiscount(event.currentTarget.value))pdvFocusNext('pdvPaymentMethod');return;
  }
  if(stage==='payment')return pdvFocusNext('pdvPaymentAmount');
  if(stage==='paymentAmount'){
    const amount=Number(event.currentTarget.value),total=currentPdvTotal();
    if(!Number.isFinite(amount)||amount<0)return toast('Informe um valor de pagamento válido.');
    payments[0].amount=amount;payments[0].touched=true;updateCashChange();
    if(payments[0].method==='Dinheiro')pdvFocusNext('cashReceivedInput');else pdvFocusNext('pdvFinish');return;
  }
  if(stage==='cashReceived'){cashReceived=Number(event.currentTarget.value)||0;updateCashChange();pdvFocusNext('pdvFinish')}
}


function pdvPriceKind(i){
  let pr=bestPrice(i.product,i.qty),p=i.product,today=new Date().toISOString().slice(0,10);
  let promo=+p.promo>0&&(!p.promo_start||today>=String(p.promo_start).slice(0,10))&&(!p.promo_end||today<=String(p.promo_end).slice(0,10));
  return promo&&pr===+p.promo?'PROMO':(i.qty>=+p.wholesale_min&&+p.wholesale>0?'ATACADO':'VAREJO')
}
function pdvSelectedItem(){
  if(!cart.length)return null;
  if(pdvSelected<0||pdvSelected>=cart.length)pdvSelected=cart.length-1;
  return cart[pdvSelected]
}
function legacyItemsHtml(){
  if(!cart.length)return '<tr><td colspan="7" class="legacy-empty">Aguardando produtos...</td></tr>';
  return cart.map((x,i)=>{
    let pr=pdvUnitPrice(x);
    return `<tr class="pdv-cart-row ${pdvSelected===i?'selected':''}" onclick="selectPdvItem(${i})">
      <td>${i+1}</td><td>${esc(x.code||'')}</td>
      <td><b>${esc(x.name)}</b><small>${pdvPriceKind(x)}</small></td>
      <td>${num(x.qty)}</td><td>${money(pr)}</td><td><b>${money(pr*x.qty)}</b></td>
      <td><button class="legacy-del" onclick="event.stopPropagation();removeCartItem(${i})" title="Remover item">×</button></td>
    </tr>`
  }).join('')
}
function updateLegacySelectedPanel(){
  let i=pdvSelectedItem(),code=document.getElementById('pdvSelectedCode'),qty=document.getElementById('pdvQty'),
      unit=document.getElementById('pdvSelectedUnit'),line=document.getElementById('pdvSelectedTotal'),
      name=document.getElementById('pdvSelectedName'),sub=document.getElementById('pdvSelectedSub');
  if(!i){
    if(code)code.value=''; if(qty){qty.value=0;qty.disabled=true} if(unit)unit.value='0,00'; if(line)line.value='0,00';
    if(name)name.textContent='SEM PRODUTO'; if(sub)sub.textContent='Aguardando leitura'; return
  }
  let pr=pdvUnitPrice(i);
  if(code)code.value=i.code||'';
  if(qty){qty.disabled=false;qty.value=i.qty}
  if(unit)unit.value=pr.toFixed(2);
  if(line)line.value=(pr*i.qty).toFixed(2);
  if(name)name.textContent=i.name;
  if(sub)sub.textContent=(i.code||'')+' • '+pdvPriceKind(i)+' • Estoque: '+num(i.stock)+' '+esc(i.product?.unit||'UN')
}
function updateLegacyPdvUI(){
  let body=document.getElementById('legacyItemsBody');
  if(body)body.innerHTML=legacyItemsHtml();
  updateLegacySelectedPanel();
  updatePdvTotals()
}
async function pdv(){
  let [cash,customers,cfg]=await Promise.all([api('/cash/current'),api('/customers'),api('/settings')]);
  if(!cash)return `<div class="alert red">O caixa está fechado. Abra o caixa antes de iniciar vendas.</div><button class=primary onclick=openCash()>Abrir caixa</button>`;
  window._pdvCustomers=customers;installPdvShortcuts();
  if(!cart.length){pdvSelected=-1;payments=[{method:'Dinheiro',amount:0,touched:false}];pdvResetDiscount()}
  else if(pdvSelected<0||pdvSelected>=cart.length)pdvSelected=cart.length-1;
  let selected=pdvSelectedItem(),total=currentPdvTotal(),customerOptions=customers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  setTimeout(()=>{document.body.classList.toggle('pdv-counter-mode',localStorage.cgPdvCounterMode==='1');document.getElementById('pdvSearch')?.focus();startPdvNetworkMonitor()},40);
  return `<div class="legacy-pdv">
    <div class="legacy-top">
      <div class="pdv-brand">${cfg.company?.logo_data&&cfg.company?.show_logo_pdv!==false?`<img class=pdv-company-logo src="${cfg.company.logo_data}" alt="Logo">`:''}<div><b>Porto Prime</b><small>PDV • PONTO DE VENDA</small></div></div>
      <div class="legacy-operator">Operador: <b>${esc(me.name)}</b><br><small>${new Date().toLocaleString('pt-BR')}</small><br><button class="pdv-counter-toggle" onclick="toggleCounterMode()">▣ Modo Balcão</button></div>
    </div>
    <div class="legacy-shortcuts-top" role="toolbar" aria-label="Atalhos do PDV">
      <button type="button" title="F2 • Buscar produto" aria-label="F2 Buscar produto" onclick="pdvFocusNext('pdvSearch')"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></span><b>F2</b><small>Buscar</small></button>
      <button type="button" title="F3 • Cliente" aria-label="F3 Selecionar cliente" onclick="pdvFocusNext('pdvCustomer')"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="8" r="3.5"/><path d="M4 21c.5-4 3.1-6 8-6s7.5 2 8 6"/></svg></span><b>F3</b><small>Cliente</small></button>
      <button type="button" title="F4 • Remover item" aria-label="F4 Remover item" onclick="removePdvSelected()"><span aria-hidden="true">×</span><b>F4</b><small>Remover</small></button>
      <button type="button" title="F5 • Desconto" aria-label="F5 Informar desconto" onclick="pdvFocusNext('pdvDiscount')"><span aria-hidden="true">%</span><b>F5</b><small>Desconto</small></button>
      <button type="button" title="F6 • Quantidade" aria-label="F6 Alterar quantidade" onclick="focusPdvQty()"><span aria-hidden="true">±</span><b>F6</b><small>Quantidade</small></button>
      <button type="button" title="F7 • Recuperar venda" aria-label="F7 Recuperar venda" onclick="showSuspendedSales()"><span aria-hidden="true">↶</span><b>F7</b><small>Recuperar</small></button>
      <button type="button" title="F8 • Pagamento" aria-label="F8 Pagamento" onclick="openPdvPaymentModal()"><span aria-hidden="true">▣</span><b>F8</b><small>Pagamento</small></button>
      <button type="button" title="F9 • Suspender venda" aria-label="F9 Suspender venda" onclick="suspendCurrentSale()"><span aria-hidden="true">Ⅱ</span><b>F9</b><small>Suspender</small></button>
      <button type="button" title="F10 • Calculadora" aria-label="F10 Calculadora" onclick="openMaterialCalculator()"><span aria-hidden="true">▦</span><b>F10</b><small>Calculadora</small></button>
      <button type="button" title="F12 • Finalizar venda" aria-label="F12 Finalizar venda" onclick="finishSale()"><span aria-hidden="true">✓</span><b>F12</b><small>Finalizar</small></button>
    </div>
    <div class="pdv-customer-top"><label for="pdvCustomer">Cliente</label><select id="pdvCustomer" onkeydown="pdvFieldEnter(event,'customer')"><option value="">Consumidor Final</option>${customerOptions}</select><small>Enter avança para a busca de produtos.</small></div>
    <div class="legacy-searchbar">
      <label>Digite o código, EAN ou nome do produto</label>
      <input id="pdvSearch" autocomplete="off" placeholder="Código do produto..." oninput="pdvLookup(this.value)" onkeydown="pdvSearchKey(event)" role=combobox aria-controls=pdvResults aria-expanded=false>
      <div id="pdvResults" class="pdv-results"></div>
    </div>
    <div class="legacy-main">
      <div class="legacy-left">
        <div class="legacy-product-image"><div class="cart-symbol">🛒</div><b id="pdvSelectedName">${selected?esc(selected.name):'SEM PRODUTO'}</b><small id="pdvSelectedSub">${selected?esc(selected.code||'')+' • '+pdvPriceKind(selected):'Aguardando leitura'}</small></div>
        <div class="legacy-fields">
          <label>Código<input id="pdvSelectedCode" readonly value="${selected?esc(selected.code||''):''}"></label>
          <label>Quantidade<input id="pdvQty" type="number" step=".001" min=".001" value="${selected?selected.qty:0}" ${selected?'':'disabled'} onchange="setSelectedPdvQty(this.value)" onkeydown="pdvFieldEnter(event,'qty')"></label>
          <label>Preço Unitário<input id="pdvSelectedUnit" type="number" min="0" step=".01" value="${selected?pdvUnitPrice(selected).toFixed(2):'0.00'}" ${selected?'':'disabled'} onchange="requestPdvPriceChange(this.value)" onkeydown="pdvFieldEnter(event,'unit')" title="Qualquer funcionário pode aumentar. Redução exige senha de Administrador/Gerente."></label>
          <label>Preço Total<input id="pdvSelectedTotal" readonly value="${selected?(selected.qty*pdvUnitPrice(selected)).toFixed(2):'0,00'}"></label>
        </div>
      </div>
    <div class="legacy-client-row">
      <label>Tipo de desconto <select id="pdvDiscountMode" onchange="pdvDiscountModeChanged()" onkeydown="pdvFieldEnter(event,'mode')"><option value="PERCENT" ${pdvDiscountMode==='PERCENT'?'selected':''}>% Porcentagem</option><option value="AMOUNT" ${pdvDiscountMode==='AMOUNT'?'selected':''}>R$ Dinheiro</option></select></label>
      <label>Valor do desconto <input id="pdvDiscount" type="number" min="0" ${pdvDiscountMode==='PERCENT'?'max="100"':''} step=".01" value="${pdvDiscountValue}" oninput="pdvDiscountPreview()" onchange="requestPdvDiscount(this.value)" onkeydown="pdvFieldEnter(event,'discount')" title="Desconto exige autorização de Administrador/Gerente."></label>
      <div class="pdv-discount-info"><small>Desconto</small><b id="pdvDiscountAmount">${money(0)}</b></div>
      <button onclick="openMaterialCalculator()">▦ Calculadora</button>
      <button onclick="showSuspendedSales()">▣ Vendas suspensas</button>
    </div>
      <div class="legacy-items">
        <table><thead><tr><th>Item</th><th>Código</th><th>Descrição do Produto</th><th>Qtd.</th><th>Vlr. Unit.</th><th>Vlr. Total</th><th></th></tr></thead>
        <tbody id="legacyItemsBody">${legacyItemsHtml()}</tbody></table>
      </div>
    <div class="legacy-actions">
      <button onclick="removePdvSelected()">F4<br><b>Cancelar item</b></button>
      <button onclick="pdvDiscount.focus();pdvDiscount.select()">F5<br><b>Desconto R$ / %</b></button>
      <button onclick="pdvCustomer.focus()">F3<br><b>Cliente</b></button>
      <button onclick="focusPdvQty()">F6<br><b>Quantidade</b></button>
      <button onclick="openPdvPaymentModal()">F8<br><b>Pagamento</b></button>
      <button onclick="suspendCurrentSale()">F9<br><b>Suspender</b></button>
      <div class="legacy-subtotal"><span>Total</span><strong id="pdvTotal">${money(total)}</strong></div>
    </div>
    <div class="legacy-paybox">
      <div><b>FORMA DE PAGAMENTO</b><div id="payBox">${paymentHtml()}</div><button class="secondary mini" onclick="addPayment()">+ Pagamento misto</button></div>
      <div id="cashChangeBox">${cashChangeHtml()}</div>
      <button id="pdvFinish" class="legacy-finish" onclick="finishSale()">F12 • FINALIZAR VENDA</button>
    </div>
    </div>
    <div class="legacy-cash open"><span>▣</span><b>CAIXA ABERTO</b><strong>${esc(cash.operator||me.name)}</strong></div>
    <div class="legacy-status"><span>Operador: ${esc(me.name)}</span><span>Caixa: ABERTO</span><span id="pdvNetworkStatus">● Servidor conectado</span><span>Porto Prime 4.1.12</span></div>
  </div>`
}
function installPdvShortcuts(){
  if(window._pdvKeysInstalled)return;window._pdvKeysInstalled=true;
  document.addEventListener('keydown',e=>{
    if(!document.getElementById('pdvSearch'))return;
    let tag=(e.target?.tagName||'').toLowerCase(),typing=['input','select','textarea'].includes(tag);
    if(e.key==='F2'){e.preventDefault();pdvSearch.focus();pdvSearch.select()}
    else if(e.key==='F3'){e.preventDefault();pdvCustomer.focus()}
    else if(e.key==='F4'){e.preventDefault();removePdvSelected()}
    else if(e.key==='F5'){e.preventDefault();pdvDiscount.focus();pdvDiscount.select()}
    else if(e.key==='F6'){e.preventDefault();focusPdvQty()}
    else if(e.key==='F7'){e.preventDefault();showSuspendedSales()}
    else if(e.key==='F8'){e.preventDefault();openPdvPaymentModal()}
    else if(e.key==='F9'){e.preventDefault();suspendCurrentSale()}
    else if(e.key==='F10'){e.preventDefault();openMaterialCalculator()}
    else if(e.key==='F12'){e.preventDefault();finishSale()}
    else if(e.key==='Delete'&&!typing){e.preventDefault();removePdvSelected()}
    else if((e.key==='+'||e.key==='-')&&!typing){e.preventDefault();changePdvQty(e.key==='+'?1:-1)}
  })
}
function selectPdvItem(n){pdvSelected=n;document.querySelectorAll('.pdv-cart-row').forEach((x,i)=>x.classList.toggle('selected',i===n));updateLegacySelectedPanel()}
function focusPdvQty(){if(!pdvSelectedItem())return toast('Carrinho vazio.');pdvQty.focus();pdvQty.select()}
function setSelectedPdvQty(v){let i=pdvSelectedItem();if(!i)return;i.qty=Math.max(.001,+v||1);updateLegacyPdvUI()}
function removeCartItem(n){if(n<0||n>=cart.length)return;cart.splice(n,1);pdvSelected=cart.length?Math.min(n,cart.length-1):-1;updateLegacyPdvUI();pdvSearch?.focus()}
function removePdvSelected(){if(!cart.length)return toast('Carrinho vazio.');if(pdvSelected<0||pdvSelected>=cart.length)pdvSelected=cart.length-1;removeCartItem(pdvSelected)}
function changePdvQty(d){let i=pdvSelectedItem();if(!i)return toast('Carrinho vazio.');i.qty=Math.max(.001,(+i.qty||0)+d);updateLegacyPdvUI()}
function pdvShowResults(rows){
  const box=document.getElementById('pdvResults'),search=document.getElementById('pdvSearch');if(!box||!search)return;
  window._pdvResults=rows;pdvResultCursor=0;search.dataset.lastQuery=search.value.trim();
  box.style.display='block';search.setAttribute('aria-expanded','true');
  box.innerHTML=rows.slice(0,20).map((p,n)=>`<button type="button" class="result ${n===0?'active':''}" role="option" aria-selected="${n===0}" onmousedown="event.preventDefault()" onclick="addCart(${p.id})"><span><b>${esc(p.code)} — ${esc(p.name)}</b><br><small>Estoque: ${num(p.stock)} ${esc(p.unit)}${p.brand?' • '+esc(p.brand):''}</small><br><small>Varejo ${money(p.retail)}${+p.wholesale>0?' • Atacado '+money(p.wholesale)+' a partir de '+num(p.wholesale_min):''}${+p.promo>0?' • Promo '+money(p.promo):''}</small></span><strong class=price>${money(bestPrice(p,1))}</strong></button>`).join('')||'<div class=empty>Nenhum resultado.</div>';
}
function pdvLookup(q){
  clearTimeout(pdvLookupTimer);const term=String(q||'').trim(),box=document.getElementById('pdvResults');
  const seq=++pdvLookupSeq;if(!box)return;
  if(!term){box.style.display='none';window._pdvResults=[];document.getElementById('pdvSearch')?.setAttribute('aria-expanded','false');return}
  window._pdvResults=[];box.style.display='none';
  pdvLookupTimer=setTimeout(async()=>{try{
    const r=await api('/products/search?q='+encodeURIComponent(term));
    if(seq!==pdvLookupSeq||document.getElementById('pdvSearch')?.value.trim()!==term)return;
    pdvShowResults(r);
  }catch(e){if(seq===pdvLookupSeq)toast('Falha ao consultar produto. Verifique a conexão.')}},term.length>=5?70:180)
}
function pdvSearchKey(event){
  if(event.key==='Escape'){const box=document.getElementById('pdvResults');if(box)box.style.display='none';return}
  if(!['ArrowUp','ArrowDown','Enter'].includes(event.key))return;
  event.preventDefault();const search=document.getElementById('pdvSearch'),term=search?.value.trim();if(!term)return;
  const rows=window._pdvResults||[],visible=rows.slice(0,20);
  if(event.key!=='Enter'){
    if(!visible.length)return;
    pdvResultCursor=(pdvResultCursor+(event.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
    const buttons=document.querySelectorAll('#pdvResults .result');buttons.forEach((button,i)=>{button.classList.toggle('active',i===pdvResultCursor);button.setAttribute('aria-selected',i===pdvResultCursor?'true':'false')});buttons[pdvResultCursor]?.scrollIntoView({block:'nearest'});return;
  }
  pdvEnter();
}
async function checkPdvNetwork(){if(!document.getElementById('pdvNetworkStatus'))return;let el=document.getElementById('pdvNetworkStatus');try{await api('/me');pdvNetworkOnline=true;el.textContent='● Servidor conectado';el.style.fontWeight='700';el.style.opacity='1'}catch(e){pdvNetworkOnline=false;if(el){el.textContent='● SERVIDOR DESCONECTADO';el.style.fontWeight='900';el.style.opacity='1'}}}
function startPdvNetworkMonitor(){clearInterval(pdvNetworkTimer);checkPdvNetwork();pdvNetworkTimer=setInterval(()=>{if(document.getElementById('pdvNetworkStatus'))checkPdvNetwork();else clearInterval(pdvNetworkTimer)},10000)}
async function pdvEnter(){
  const search=document.getElementById('pdvSearch'),term=search?.value.trim();if(!term)return;
  clearTimeout(pdvLookupTimer);const seq=++pdvLookupSeq;
  let rows=window._pdvResults||[];
  if(!rows.length||search.dataset.lastQuery!==term){
    try{rows=await api('/products/search?q='+encodeURIComponent(term))}catch{return toast('Falha ao consultar produto.')}
    if(seq!==pdvLookupSeq||search.value.trim()!==term)return;
    pdvShowResults(rows);
  }
  const exact=rows.find(p=>String(p.code||'')===term||String(p.ean||'')===term);
  const chosen=exact||rows.slice(0,20)[pdvResultCursor];
  if(chosen)await addCart(chosen.id);else toast('Produto não encontrado.');
}
function bestPrice(p,q){let today=new Date().toISOString().slice(0,10),promo=+p.promo>0&&(!p.promo_start||today>=String(p.promo_start).slice(0,10))&&(!p.promo_end||today<=String(p.promo_end).slice(0,10));return promo?+p.promo:(q>=+p.wholesale_min&&+p.wholesale>0?+p.wholesale:+p.retail)}
async function addCart(id){let p=(window._pdvResults||[]).find(x=>x.id===id);if(!p)p=(await api('/products')).find(x=>x.id===id);if(!p)return toast('Produto não encontrado.');let i=cart.find(x=>x.product_id===id);if(i){i.qty++;pdvSelected=cart.indexOf(i)}else{cart.push({product_id:id,name:p.name,code:p.code,qty:1,stock:+p.stock,product:p});pdvSelected=cart.length-1}pdvSearch.value='';pdvSearch.dataset.lastQuery='';pdvResults.style.display='none';pdvSearch.setAttribute('aria-expanded','false');window._pdvResults=[];updateLegacyPdvUI();pdvFocusNext('pdvQty')}
function cartSubtotal(){return cart.reduce((a,i)=>a+pdvUnitPrice(i)*i.qty,0)}
function currentPdvTotal(){return Math.max(0,cartSubtotal()-pdvDiscountAmount())}
function updatePdvTotals(opts={}){
  let total=currentPdvTotal(),disc=pdvDiscountAmount();
  let totalEl=document.getElementById('pdvTotal'),discEl=document.getElementById('pdvDiscountAmount');
  if(totalEl)totalEl.textContent=money(total);
  if(discEl)discEl.textContent=money(disc);
  if(payments.length===1&&!payments[0].touched)payments[0].amount=total;
  if(opts.renderPayments!==false&&document.getElementById('payBox'))payBox.innerHTML=paymentHtml();
  if(document.getElementById('cashChangeBox'))cashChangeBox.innerHTML=cashChangeHtml()
}
async function ensureManagerApproval(actionText){
  if(pdvApprovalToken)return true;
  if(window._pdvApprovalPromise)return window._pdvApprovalPromise;
  pdvPendingAction=actionText;
  window._pdvApprovalPromise=new Promise(resolve=>{
    window._pdvApprovalResolve=resolve;
    modal(`<h3>Autorização necessária</h3>
      <p class=muted>${esc(actionText)}</p>
      <div class=formgrid>
        <div><label>E-mail do Administrador/Gerente</label><input id=approvalEmail type=email autocomplete=username placeholder="gerente@empresa.com"></div>
        <div><label>Senha</label><input id=approvalPassword type=password autocomplete=current-password placeholder="Senha"></div>
      </div>
      <div id=approvalError class="alert red" style="display:none;margin-top:12px"></div>
      <div style="margin-top:18px"><button class=primary onclick=confirmManagerApproval()>AUTORIZAR</button> <button onclick=cancelManagerApproval()>Cancelar</button></div>`);
    setTimeout(()=>document.getElementById('approvalEmail')?.focus(),30)
  });return window._pdvApprovalPromise
}
async function confirmManagerApproval(){
  let email=document.getElementById('approvalEmail')?.value||'',password=document.getElementById('approvalPassword')?.value||'',err=document.getElementById('approvalError');
  try{
    let r=await api('/manager-approval',{method:'POST',body:JSON.stringify({email,password})});
    pdvApprovalToken=r.approval_token;pdvApprovalBy=r.approved_by||'Gerência';
    let resolve=window._pdvApprovalResolve;window._pdvApprovalResolve=null;window._pdvApprovalPromise=null;closeModal();if(resolve)resolve(true);toast('Autorizado por '+pdvApprovalBy)
  }catch(e){if(err){err.style.display='block';err.textContent=e.message}else alert(e.message)}
}
function cancelManagerApproval(){let resolve=window._pdvApprovalResolve;window._pdvApprovalResolve=null;window._pdvApprovalPromise=null;closeModal();if(resolve)resolve(false)}
async function requestPdvPriceChange(v){
  let i=pdvSelectedItem();if(!i)return;
  let requested=+v,base=bestPrice(i.product,i.qty),input=document.getElementById('pdvSelectedUnit');
  if(!Number.isFinite(requested)||requested<=0){if(input)input.value=pdvUnitPrice(i).toFixed(2);toast('Preço inválido.');return false}
  if(requested<base-0.001){
    let ok=await ensureManagerApproval(`Reduzir ${i.name} de ${money(base)} para ${money(requested)}.`);
    if(!ok){if(input)input.value=pdvUnitPrice(i).toFixed(2);return false}
  }
  i.manual_price=requested;i.price_authorized=requested<base-0.001;
  updateLegacyPdvUI();return true
}
async function requestPdvDiscount(v){
  const input=document.getElementById('pdvDiscount'),amount=Number(v),limit=pdvDiscountMode==='PERCENT'?100:cartSubtotal();
  if(!Number.isFinite(amount)||amount<0||amount>limit){
    if(input)input.value=String(pdvDiscountValue);toast(pdvDiscountMode==='PERCENT'?'Informe um percentual entre 0 e 100.':'O desconto não pode superar o subtotal.');return false;
  }
  if(amount>0){
    const label=pdvDiscountMode==='AMOUNT'?money(amount):`${amount.toFixed(2).replace('.',',')}%`;
    const ok=await ensureManagerApproval(`Aplicar desconto de ${label} nesta venda.`);
    if(!ok){pdvDiscountValue=0;if(input)input.value='0';updatePdvTotals();return false}
  }
  pdvDiscountValue=amount;if(input)input.value=String(amount);updatePdvTotals();return true;
}
function refreshCart(){updateLegacyPdvUI()}
function toggleCounterMode(){document.body.classList.toggle('pdv-counter-mode');localStorage.cgPdvCounterMode=document.body.classList.contains('pdv-counter-mode')?'1':'0';toast(document.body.classList.contains('pdv-counter-mode')?'Modo Balcão ativado.':'Modo Balcão desativado.')}
function pdvPaymentRemaining(){return Math.max(0,currentPdvTotal()-payments.reduce((a,p)=>a+(+p.amount||0),0))}
function openPdvPaymentModal(){
  if(!cart.length)return toast('Carrinho vazio.');
  let total=currentPdvTotal(),sum=payments.reduce((a,p)=>a+(+p.amount||0),0),remaining=Math.max(0,total-sum);
  modal(`<div class="pdv-pay-modal"><span class=eyebrow>F8 • PAGAMENTO</span><h3>Receber ${money(total)}</h3><div class="pdv-pay-quick">${['Dinheiro','PIX','Cartão Débito','Cartão Crédito','Crediário'].map((m,i)=>`<button onclick="setQuickPdvPayment('${m}')">${['💵','◆','▣','▤','♙'][i]}<b>${m}</b></button>`).join('')}</div><div class="pdv-pay-summary"><span>Total <b>${money(total)}</b></span><span>Informado <b>${money(sum)}</b></span><span class="${remaining>.01?'danger':'ok'}">Falta <b>${money(remaining)}</b></span></div><div class=alert>Para pagamento misto, use <b>Adicionar pagamento</b> e informe cada parte.</div><div class=row><button class=primary onclick="closeModal();addPayment()">+ Adicionar pagamento misto</button><button onclick=closeModal()>Voltar ao PDV</button></div></div>`)}
function setQuickPdvPayment(method){let total=currentPdvTotal();payments=[{method,amount:total,touched:true}];cashReceived=0;closeModal();updatePdvTotals();if(method==='Dinheiro'){setTimeout(()=>document.getElementById('cashReceivedInput')?.focus(),40)}else toast(method+' selecionado.')}
function paymentHtml(){let total=currentPdvTotal();return payments.map((p,n)=>`<div class="payrow pdv-payrow"><select ${n===0?'id=\"pdvPaymentMethod\" onkeydown=\"pdvFieldEnter(event,\'payment\')\"':''} aria-label="Forma de pagamento" onchange="payments[${n}].method=this.value;if(this.value!=='Dinheiro')cashReceived=0;updatePdvTotals()">${['Dinheiro','PIX','Cartão Débito','Cartão Crédito','Crediário'].map(x=>`<option ${p.method===x?'selected':''}>${x}</option>`).join('')}</select><input ${n===0?'id=\"pdvPaymentAmount\" onkeydown=\"pdvFieldEnter(event,\'paymentAmount\')\"':''} aria-label="Valor" type=number step=.01 value="${(+p.amount||0).toFixed(2)}" oninput="payments[${n}].amount=+this.value;payments[${n}].touched=true;updateCashChange()"><button class=danger-btn onclick="payments.splice(${n},1);if(!payments.length)payments=[{method:'Dinheiro',amount:total,touched:false}];updatePdvTotals()">×</button></div>`).join('')}
function addPayment(){let total=currentPdvTotal(),used=payments.reduce((a,p)=>a+(+p.amount||0),0),remaining=Math.max(0,total-used);payments.push({method:'PIX',amount:remaining,touched:false});payments.forEach(p=>p.touched=true);updatePdvTotals();setTimeout(()=>document.querySelectorAll('#payBox select')[payments.length-1]?.focus(),20)}
function cashChangeHtml(){let cash=payments.reduce((a,p)=>a+(p.method==='Dinheiro'?(+p.amount||0):0),0);if(!cash)return '';let received=Math.max(cash,+cashReceived||0),change=Math.max(0,received-cash);return `<div class=pdv-change><label>Dinheiro recebido</label><input id=cashReceivedInput type=number step=.01 min=0 value="${cashReceived?cashReceived.toFixed(2):''}" placeholder="Ex.: 100,00" oninput="cashReceived=+this.value||0;updateCashChange()" onkeydown="pdvFieldEnter(event,'cashReceived')"><div><span>Troco</span><strong id=cashChangeValue>${money(change)}</strong></div></div>`}
function updateCashChange(){let cash=payments.reduce((a,p)=>a+(p.method==='Dinheiro'?(+p.amount||0):0),0),received=Math.max(cash,+cashReceived||0),change=Math.max(0,received-cash),el=document.getElementById('cashChangeValue');if(el)el.textContent=money(change)}
function suspendCurrentSale(){if(!cart.length)return toast('Carrinho vazio.');modal(`<h3>Suspender venda</h3><p class=muted>A venda ficará disponível para ser retomada em qualquer computador da rede.</p><label>Identificação</label><input id=suspendLabel maxlength=80 value="Venda ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}" placeholder="Ex.: Cliente João - Obra Aldeota"><div style="margin-top:18px"><button class=primary onclick=confirmSuspendSale()>SUSPENDER VENDA</button> <button onclick=closeModal()>Cancelar</button></div>`);setTimeout(()=>suspendLabel?.select(),30)}
async function confirmSuspendSale(){try{await api('/suspended-sales',{method:'POST',body:JSON.stringify({label:document.getElementById('suspendLabel')?.value||'Venda suspensa',customer_id:+document.getElementById('pdvCustomer')?.value||null,payload:{items:cart.map(i=>({product_id:i.product_id,qty:i.qty,manual_price:Number.isFinite(+i.manual_price)?+i.manual_price:null})),discount:pdvDiscountPct(),discount_mode:pdvDiscountMode,discount_value:pdvDiscountValue,payments}})});cart=[];payments=[{method:'Dinheiro',amount:0,touched:false}];cashReceived=0;pdvSelected=-1;pdvApprovalToken=null;pdvApprovalBy='';closeModal();toast('Venda suspensa com sucesso.');render('pdv')}catch(e){alert(e.message)}}
async function showSuspendedSales(){try{let rows=await api('/suspended-sales');modal(`<div class=toolbar><h3>Vendas suspensas</h3><button onclick=closeModal()>Fechar</button></div>${rows.length?rows.map(x=>`<div class=suspended-row><div><b>${esc(x.label||'Venda suspensa')}</b><small>${esc(x.customer||'Consumidor Final')} • ${esc(x.operator||'')} • ${new Date(x.updated_at).toLocaleString('pt-BR')}</small></div><button class=primary onclick="resumeSuspendedSale(${x.id})">Retomar</button><button class=danger-btn onclick="deleteSuspendedSale(${x.id})">Excluir</button></div>`).join(''):'<div class=empty>Nenhuma venda suspensa.</div>'}`)}catch(e){alert(e.message)}}
async function resumeSuspendedSale(id){try{let rows=await api('/suspended-sales'),x=rows.find(r=>r.id===id);if(!x)return;let all=await api('/products'),items=x.payload?.items||[];cart=items.map(i=>{let p=all.find(z=>z.id===+i.product_id);return p?{product_id:p.id,name:p.name,code:p.code,qty:+i.qty,stock:+p.stock,product:p,manual_price:Number.isFinite(+i.manual_price)?+i.manual_price:null}:null}).filter(Boolean);payments=(x.payload?.payments||[{method:'Dinheiro',amount:0}]).map(p=>({...p,touched:true}));cashReceived=0;pdvSelected=cart.length-1;pdvApprovalToken=null;pdvApprovalBy='';closeModal();await render('pdv');if(document.getElementById('pdvCustomer')&&x.customer_id)pdvCustomer.value=x.customer_id;pdvDiscountMode=x.payload?.discount_mode==='AMOUNT'?'AMOUNT':'PERCENT';pdvDiscountValue=Number(x.payload?.discount_value??x.payload?.discount)||0;if(document.getElementById('pdvDiscountMode'))pdvDiscountMode=document.getElementById('pdvDiscountMode').value=pdvDiscountMode;if(document.getElementById('pdvDiscount'))pdvDiscount.value=pdvDiscountValue;updateLegacyPdvUI();await api('/suspended-sales/'+id,{method:'DELETE'});toast('Venda retomada.')}catch(e){alert(e.message)}}
function deleteSuspendedSale(id){closeModal();modal(`<h3>Excluir venda suspensa?</h3><p>Esta ação não altera estoque nem caixa, apenas remove a venda da lista de suspensas.</p><button class=danger-btn onclick="confirmDeleteSuspendedSale(${id})">EXCLUIR</button> <button onclick=closeModal()>Cancelar</button>`)}
async function confirmDeleteSuspendedSale(id){try{await api('/suspended-sales/'+id,{method:'DELETE'});closeModal();showSuspendedSales()}catch(e){alert(e.message)}}
function openMaterialCalculator(){modal(`<h3>Calculadora de pisos e cerâmicas</h3><p class=muted>Calcule rapidamente a quantidade necessária para uma obra.</p><div class=formgrid><div><label>Largura do ambiente (m)</label><input id=calcW type=number step=.01 min=0 oninput=calcMaterial()></div><div><label>Comprimento (m)</label><input id=calcL type=number step=.01 min=0 oninput=calcMaterial()></div><div><label>Rendimento por caixa (m²)</label><input id=calcBox type=number step=.01 min=.01 oninput=calcMaterial()></div><div><label>Margem de perda</label><select id=calcLoss onchange=calcMaterial()><option value=5>5%</option><option value=10 selected>10%</option><option value=15>15%</option></select></div></div><div id=calcResult class=calc-result><span>Informe as medidas acima.</span></div><div class=row><button class=primary onclick=closeModal()>Concluir</button></div>`)}
function calcMaterial(){let w=+document.getElementById('calcW')?.value||0,l=+document.getElementById('calcL')?.value||0,b=+document.getElementById('calcBox')?.value||0,loss=+document.getElementById('calcLoss')?.value||0,area=w*l,need=area*(1+loss/100),boxes=b>0?Math.ceil(need/b):0;let el=document.getElementById('calcResult');if(el)el.innerHTML=area>0?`<div><small>Área</small><strong>${num(area)} m²</strong></div><div><small>Com ${loss}% de perda</small><strong>${num(need)} m²</strong></div><div class=highlight><small>Quantidade a vender</small><strong>${boxes||'—'} caixa(s)</strong></div>`:'<span>Informe as medidas acima.</span>'}
async function finishSale(){
  if(pdvFinishing)return;
  if(!pdvNetworkOnline)return alert('Servidor desconectado. Aguarde a conexão voltar antes de finalizar a venda.');
  if(!cart.length)return alert('Carrinho vazio.');
  if(pdvDiscountMode==='AMOUNT'&&pdvDiscountValue>cartSubtotal()+0.001)return toast('O desconto em reais não pode superar o subtotal.');
  let discount_percent=pdvDiscountPct(),total=currentPdvTotal(),sum=payments.reduce((a,p)=>a+(+p.amount||0),0);
  let needsApproval=discount_percent>0||cart.some(i=>pdvUnitPrice(i)<bestPrice(i.product,i.qty)-0.001);
  if(needsApproval&&!pdvApprovalToken){let ok=await ensureManagerApproval('Esta venda possui desconto ou preço abaixo da tabela.');if(!ok)return}
  if(Math.abs(total-sum)>.01)return alert(`Pagamentos somam ${money(sum)}, mas o total é ${money(total)}.`);
  let cashDue=payments.reduce((a,p)=>a+(p.method==='Dinheiro'?(+p.amount||0):0),0);
  if(cashDue&&cashReceived>0&&cashReceived+0.001<cashDue)return alert('Dinheiro recebido é menor que o valor em dinheiro da venda.');
  const requestId=pdvPendingRequestId||(window.crypto?.randomUUID?window.crypto.randomUUID():('pdv-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
  pdvPendingRequestId=requestId;
  pdvFinishing=true;let btn=document.querySelector('.legacy-finish');if(btn){btn.disabled=true;btn.textContent='FINALIZANDO...'}
  try{
    let s=await api('/sales-v42',{method:'POST',signal:AbortSignal.timeout(30000),body:JSON.stringify({
      request_id:requestId,
      customer_id:+document.getElementById('pdvCustomer')?.value||null,
      quote_id:pdvQuoteId||null,
      discount_percent,
      approval_token:pdvApprovalToken,
      items:cart.map(i=>({product_id:i.product_id,qty:i.qty,unit_price:pdvUnitPrice(i)})),
      payments
    })});
    pdvPendingRequestId=null;
    let received=cashReceived||cashDue,change=Math.max(0,received-cashDue);
    cart=[];pdvSelected=-1;payments=[{method:'Dinheiro',amount:0,touched:false}];cashReceived=0;pdvResetDiscount();
    pdvApprovalToken=null;pdvApprovalBy='';pdvQuoteId=null;pdvQuoteCustomerId=null;pdvQuoteDiscountPct=0;toast('Venda #'+s.id+' finalizada.');render('pdv');
    setTimeout(()=>askPrintReceipt(s.id,total,received,change),250)
  }catch(e){
    if(e.status===400)pdvPendingRequestId=null;
    if(!e.status||e.status>=500||e.status===409)alert('Não foi possível confirmar com segurança o resultado desta venda. A tentativa foi preservada para evitar duplicidade. Verifique a lista de vendas antes de iniciar outra venda. Se repetir com o mesmo carrinho, o sistema reutilizará o identificador da tentativa.\n\nDetalhe: '+(e.message||'tempo limite ou falha de comunicação.'));
    else alert(e.message)
  }
  finally{pdvFinishing=false}
}

function askPrintReceipt(id,total,received,change){
  modal(`<h3>VENDA #${id} CONCLUÍDA</h3><div class="alert green"><b>Total: ${money(total)}</b>${received>0?`<br>Recebido em dinheiro: ${money(received)}<br><b>Troco: ${money(change)}</b>`:''}</div><p>Deseja imprimir o comprovante desta venda?</p><div style="margin-top:18px"><button class=primary onclick="confirmPrintReceipt(${id})">🖨 IMPRIMIR</button> <button onclick=closeModal()>NOVA VENDA</button></div>`);
}
function confirmPrintReceipt(id){closeModal();printReceipt(id)}

async function vendas(){let s=await api('/sales');return `<div class=panel><div class=toolbar><h3>Vendas</h3><input placeholder="Filtrar..." oninput="filterRows(this.value,'salesTable')" style="max-width:250px"></div><div class=scroll><table id=salesTable><tr><th>#</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Pagamento</th><th>Total</th><th>Status</th><th></th></tr>${s.map(x=>`<tr><td>${x.id}</td><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(x.customer||'Consumidor Final')}</td><td>${esc(x.seller)}</td><td>${esc(x.payment_method)}</td><td>${money(x.total)}</td><td>${esc(x.status)}</td><td><button class="secondary mini" onclick=printReceipt(${x.id})>Comprovante</button> ${x.status==='FINALIZADA'&&['Administrador','Gerente'].includes(me.role)?`<button class="danger-btn mini" onclick=cancelSale(${x.id})>Estornar</button>`:''}</td></tr>`).join('')}</table></div></div>`}
async function reposicao(){let r=await api('/stock/replenishment'),total=r.reduce((s,x)=>s+(+x.suggested*+x.cost),0);return `<div class=panel><div class=toolbar><div><span class=eyebrow>ESTOQUE</span><h3 style="margin:5px 0">Sugestão de compra</h3><small class=muted>Reposição calculada pelo estoque mínimo e máximo cadastrado.</small></div><span class=pill>Investimento estimado: ${money(total)}</span></div>${r.length?`<div class=scroll><table><tr><th>Código</th><th>Produto</th><th>Estoque</th><th>Mínimo</th><th>Máximo</th><th>Sugestão</th><th>Custo estimado</th><th>Status</th></tr>${r.map(x=>`<tr><td>${esc(x.code||'')}</td><td><b>${esc(x.name)}</b><br><small class=muted>${esc(x.brand||'')}</small></td><td class=${+x.stock<=0?'danger':''}>${num(x.stock)} ${esc(x.unit||'')}</td><td>${num(x.min_stock)}</td><td>${num(x.max_stock)}</td><td><b>${num(x.suggested)} ${esc(x.unit||'')}</b></td><td>${money(+x.suggested*+x.cost)}</td><td><span class="pill ${+x.stock<=0?'danger':'amber'}">${esc(x.status)}</span></td></tr>`).join('')}</table></div>`:'<div class="alert green">✓ Nenhum produto precisa de reposição neste momento.</div>'}</div>`}
let stockIntelDays=90,stockIntelClass='TODOS';
function stockIntelSetDays(v){stockIntelDays=+v||90;render('inteligencia-estoque')}
function stockIntelSetClass(v){stockIntelClass=v;renderStockIntelTable()}
function stockCoverageLabel(v){if(v==null)return 'Sem giro';if(v<7)return 'Crítico';if(v<15)return 'Baixo';if(v<=45)return 'Saudável';return 'Alto'}
function stockIntelRows(){
  let r=window._stockIntel?.products||[];
  return stockIntelClass==='TODOS'?r:r.filter(x=>x.abc===stockIntelClass);
}
function renderStockIntelTable(){
  let el=document.getElementById('stockIntelTableBody');if(!el)return;
  let rows=stockIntelRows();
  el.innerHTML=rows.length?rows.map(x=>`<tr><td><span class="abc-badge abc-${x.abc}">${x.abc}</span></td><td>${esc(x.code||'')}</td><td><b>${esc(x.name)}</b><br><small class=muted>${esc(x.category||x.brand||'')}</small></td><td>${num(x.stock)} ${esc(x.unit||'')}</td><td>${num(x.qty_sold)}</td><td>${money(x.revenue)}</td><td>${x.margin==null?'—':num(x.margin)+'%'}</td><td>${x.coverage_days==null?'—':num(x.coverage_days)+' dias'}<br><small class=muted>${stockCoverageLabel(x.coverage_days)}</small></td><td>${x.days_without_sale==null?'Nunca':x.days_without_sale+' dia(s)'}</td><td>${num(x.suggested_qty)} ${esc(x.unit||'')}</td></tr>`).join(''):'<tr><td colspan=10 class=empty>Nenhum produto nesta classificação.</td></tr>';
}
async function inteligenciaEstoque(){
  let r=await api('/stock/intelligence?days='+stockIntelDays);window._stockIntel=r;
  let s=r.summary||{},abc=r.abc||{},dead=r.dead_stock||[],rep=r.replenishment||[];
  setTimeout(renderStockIntelTable,0);
  return `<div class="stock-intel-hero"><div><span class=eyebrow>PORTO PRIME • INTELIGÊNCIA DE ESTOQUE</span><h2>Curva ABC e Giro de Estoque</h2><p>Entenda quais produtos geram resultado, quais estão parados e onde repor antes de faltar.</p></div><div class=stock-intel-period><label>Período analisado</label><select onchange="stockIntelSetDays(this.value)"><option value=30 ${stockIntelDays===30?'selected':''}>30 dias</option><option value=60 ${stockIntelDays===60?'selected':''}>60 dias</option><option value=90 ${stockIntelDays===90?'selected':''}>90 dias</option><option value=180 ${stockIntelDays===180?'selected':''}>180 dias</option><option value=365 ${stockIntelDays===365?'selected':''}>365 dias</option></select></div></div>
  <div class="cards cards6 stock-intel-kpis">
    <div class=card><small>Produtos ativos</small><strong>${s.products||0}</strong></div>
    <div class=card><small>Valor do estoque a custo</small><strong>${money(s.stock_cost_value)}</strong></div>
    <div class=card><small>Faturamento no período</small><strong>${money(s.revenue)}</strong></div>
    <div class=card><small>Lucro bruto estimado</small><strong>${money(s.gross_profit)}</strong></div>
    <div class=card><small>Capital parado</small><strong class=${s.dead_value>0?'danger':''}>${money(s.dead_value)}</strong></div>
    <div class=card><small>Zerados / baixos</small><strong>${s.zero||0} / ${s.low||0}</strong></div>
  </div>
  <div class=grid3>
    ${['A','B','C'].map(k=>`<div class="panel abc-card abc-panel-${k}"><div class=toolbar><div><span class="abc-badge abc-${k}">CLASSE ${k}</span><h3>${k==='A'?'Produtos essenciais':k==='B'?'Produtos importantes':'Cauda do mix'}</h3></div><strong>${abc[k]?.count||0}</strong></div><div class=abc-revenue>${money(abc[k]?.revenue||0)}</div><small class=muted>Faturamento do período</small></div>`).join('')}
  </div>
  <div class=grid2>
    <div class=panel><div class=toolbar><div><h3 style="margin:0">⚠ Capital parado</h3><small class=muted>Produtos com estoque e sem venda recente.</small></div><span class="pill danger">${dead.length} item(ns)</span></div>${dead.length?dead.slice(0,10).map(x=>`<div class=sale-item><span><b>${esc(x.name)}</b><small class=muted> • estoque ${num(x.stock)} • ${x.days_without_sale==null?'sem histórico':x.days_without_sale+' dias sem venda'}</small></span><b>${x.stock_value==null?'—':money(x.stock_value)}</b></div>`).join(''):'<div class="alert green">✓ Nenhum capital parado relevante no período.</div>'}</div>
    <div class=panel><div class=toolbar><div><h3 style="margin:0">↻ Reposição inteligente</h3><small class=muted>Prioridade combinando giro, cobertura e estoque alvo.</small></div><span class=pill>${rep.length} sugestão(ões)</span></div>${rep.length?rep.slice(0,10).map(x=>`<div class=sale-item><span><b>${esc(x.name)}</b><small class=muted> • cobertura ${x.coverage_days==null?'—':num(x.coverage_days)+' dias'}</small></span><b>Comprar ${num(x.suggested_qty)} ${esc(x.unit||'')}</b></div>`).join(''):'<div class="alert green">✓ Estoque equilibrado para os produtos com giro.</div>'}</div>
  </div>
  <div class=panel><div class=toolbar><div><h3 style="margin:0">Análise completa por produto</h3><small class=muted>Curva ABC calculada pelo faturamento acumulado: A até 80%, B até 95%, C restante.</small></div><div class=stock-intel-tabs>${['TODOS','A','B','C'].map(k=>`<button class="${stockIntelClass===k?'primary':'secondary'} mini" onclick="stockIntelSetClass('${k}')">${k}</button>`).join('')}</div></div><div class=scroll><table><thead><tr><th>ABC</th><th>Código</th><th>Produto</th><th>Estoque</th><th>Vendido</th><th>Faturamento</th><th>Margem</th><th>Cobertura</th><th>Sem venda</th><th>Sugestão</th></tr></thead><tbody id=stockIntelTableBody></tbody></table></div></div>`;
}
async function estoque(){let m=await api('/stock/movements');return `<div class=panel><div class=toolbar><h3>Kardex geral</h3><input placeholder="Filtrar movimentações..." oninput="filterRows(this.value,'stockTable')" style="max-width:280px"></div><div class=scroll><table id=stockTable><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd.</th><th>Antes</th><th>Depois</th><th>Usuário</th></tr>${m.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(x.product)}</td><td>${esc(x.kind)}</td><td>${num(x.qty)}</td><td>${num(x.balance_before)}</td><td>${num(x.balance_after)}</td><td>${esc(x.user_name||'')}</td></tr>`).join('')}</table></div></div>`}
async function inventario(){let i=await api('/inventory/current');if(!i)return `<div class=panel><h3>Inventário físico</h3><p>Faça uma contagem física do estoque. Ao finalizar, diferenças serão registradas no Kardex como ajuste de inventário.</p>${canStock()?'<button class=primary onclick=startInventory()>Iniciar inventário</button>':'<p class=muted>Sem permissão para iniciar inventário.</p>'}</div>`;let counted=i.items.filter(x=>x.counted_qty!==null).length;return `<div class=panel><div class=toolbar><h3>Inventário #${i.id}</h3><span class=pill>${counted}/${i.items.length} contados</span><input placeholder="Buscar..." oninput="filterRows(this.value,'invTable')" style="max-width:230px">${canStock()?'<button class=success-btn onclick="finishInventory('+i.id+')">Finalizar inventário</button>':''}</div><div class=scroll><table id=invTable><tr><th>Código</th><th>Produto</th><th>Sistema</th><th>Contagem física</th><th>Diferença</th></tr>${i.items.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${num(x.system_qty)} ${esc(x.unit)}</td><td><input type=number step=.001 value="${x.counted_qty??''}" style="width:110px" onchange="countInventory(${i.id},${x.id},this.value)"></td><td class="${+x.difference?'danger':''}">${x.difference===null?'—':num(x.difference)}</td></tr>`).join('')}</table></div></div>`}
function startInventory(){modal(`<h3>Iniciar inventário</h3><p>Deseja iniciar o inventário usando o saldo atual do sistema como referência?</p><button class=primary onclick=confirmStartInventory()>INICIAR INVENTÁRIO</button> <button onclick=closeModal()>Cancelar</button>`)}async function confirmStartInventory(){try{await api('/inventory/start',{method:'POST',body:'{}'});closeModal();render('inventario')}catch(e){toast(e.message)}}async function countInventory(id,itemId,v){await api(`/inventory/${id}/item/${itemId}`,{method:'PUT',body:JSON.stringify({counted_qty:+v})})}function finishInventory(id){modal(`<h3>Finalizar inventário</h3><div class=alert red>O estoque será ajustado conforme a contagem física informada.</div><button class=danger-btn onclick="confirmFinishInventory(${id})">FINALIZAR E AJUSTAR</button> <button onclick=closeModal()>Cancelar</button>`)}async function confirmFinishInventory(id){try{await api('/inventory/'+id+'/finish',{method:'POST',body:'{}'});closeModal();toast('Inventário finalizado e estoque ajustado.');render('inventario')}catch(e){toast(e.message)}}
async function clientes(){return cad('customers')}async function fornecedores(){return cad('suppliers')}async function cad(type){let a=await api('/'+type),isC=type==='customers';return `<div class=panel><div class=toolbar><h3>${isC?'Clientes':'Fornecedores'}</h3><input placeholder="Filtrar..." oninput="filterRows(this.value,'cadTable')" style="max-width:240px"><button class=primary onclick="cadForm('${type}')">+ Novo</button></div><div class=scroll><table id=cadTable><tr><th>Nome</th><th>Documento</th><th>Telefone</th><th>E-mail</th><th></th></tr>${a.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.doc||'')}</td><td>${esc(x.phone||'')}</td><td>${esc(x.email||'')}</td><td><button class="secondary mini" onclick="cadHistory('${type}',${x.id})">Histórico</button> <button class="secondary mini" onclick="cadForm('${type}',${x.id})">Editar</button></td></tr>`).join('')}</table></div></div>`}
async function cadForm(type,id){let a=id?(await api('/'+type)).find(x=>x.id===id):{},isC=type==='customers';modal(`<h3>${id?'Editar':'Novo'} ${isC?'cliente':'fornecedor'}</h3><div class=formgrid><div class=span2><label>Nome *</label><input id=cname value="${esc(a.name||'')}"></div><div><label>CPF/CNPJ</label><input id=cdoc value="${esc(a.doc||'')}"></div><div><label>Telefone/WhatsApp</label><input id=cphone value="${esc(a.phone||'')}"></div><div><label>E-mail</label><input id=cemail value="${esc(a.email||'')}"></div><div class=span2><label>Endereço</label><input id=caddress value="${esc(a.address||'')}"></div>${isC?`<div><label>Tipo</label><select id=ctype>${['Consumidor','Profissional','Pedreiro','Construtor','Empresa','Revendedor'].map(x=>`<option ${a.type===x?'selected':''}>${x}</option>`)}</select></div><div><label>Limite de crédito</label><input id=climit type=number step=.01 value="${a.credit_limit||0}"></div>`:`<div><label>Contato</label><input id=ccontact value="${esc(a.contact||'')}"></div>`}</div><label>Observações</label><textarea id=cnotes>${esc(a.notes||'')}</textarea><button class=primary onclick="saveCad('${type}',${id||'null'})">Salvar</button> <button onclick=closeModal()>Cancelar</button>`)}
async function saveCad(type,id){let isC=type==='customers',x={name:cname.value,doc:cdoc.value,phone:cphone.value,email:cemail.value,address:caddress.value,notes:cnotes.value};if(isC){x.type=ctype.value;x.credit_limit=climit.value}else x.contact=ccontact.value;try{await api('/'+type+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(x)});closeModal();toast('Cadastro salvo.');render(isC?'clientes':'fornecedores')}catch(e){alert(e.message)}}
async function cadHistory(type,id){let h=await api(`/${type}/${id}/history`),isC=type==='customers',a=isC?h.customer:h.supplier,rows=isC?h.sales:h.purchases;modal(`<h3>${esc(a.name)}</h3><p>${esc(a.doc||'')} • ${esc(a.phone||'')} • ${esc(a.email||'')}</p><h4>${isC?'Compras do cliente':'Compras ao fornecedor'}</h4><div class=scroll><table><tr><th>#</th><th>Data</th><th>Total</th><th>Status</th></tr>${rows.map(x=>`<tr><td>${x.id}</td><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>${money(x.total)}</td><td>${esc(x.status)}</td></tr>`).join('')}</table></div><button onclick=closeModal()>Fechar</button>`)}
async function compras(){let [a,sup,p]=await Promise.all([api('/purchases'),api('/suppliers'),api('/products')]);window._purchaseProducts=p;return `<div class=grid2><div class=panel><h3>Nova compra</h3><label>Fornecedor</label><select id=buySupplier><option value="">Selecione</option>${sup.map(x=>`<option value=${x.id}>${esc(x.name)}</option>`)}</select><div class=row><div class=field><label>Produto</label><select id=buyProduct>${p.map(x=>`<option value=${x.id}>${esc(x.code)} — ${esc(x.name)}</option>`)}</select></div><div class=field><label>Qtd.</label><input id=buyQty type=number step=.001 value=1></div><div class=field><label>Custo</label><input id=buyCost type=number step=.01></div><button class=primary onclick=addPurchaseItem()>+</button></div><div id=buyCart>${purchaseCartHtml()}</div><label>Nº nota/pedido</label><input id=buyInvoice><button class=primary onclick=savePurchase()>Salvar pedido</button></div><div class="panel scroll"><h3>Compras</h3><table><tr><th>#</th><th>Fornecedor</th><th>Total</th><th>Status</th><th>Data</th><th></th></tr>${a.map(x=>`<tr><td>${x.id}</td><td>${esc(x.supplier||'')}</td><td>${money(x.total)}</td><td>${esc(x.status)}</td><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>${x.status!=='RECEBIDA'?`<button class="success-btn mini" onclick=receivePurchase(${x.id})>Receber</button>`:''}</td></tr>`).join('')}</table></div></div>`}
function addPurchaseItem(){let p=_purchaseProducts.find(x=>x.id===+buyProduct.value),qty=+buyQty.value,cost=+buyCost.value;if(!p||qty<=0||cost<0)return alert('Informe quantidade e custo.');purchaseCart.push({product_id:p.id,name:p.name,qty,unit_cost:cost});buyCart.innerHTML=purchaseCartHtml()}function purchaseCartHtml(){return purchaseCart.length?purchaseCart.map((i,n)=>`<div class=sale-item><span>${esc(i.name)} — ${num(i.qty)} x ${money(i.unit_cost)}</span><b>${money(i.qty*i.unit_cost)} <button class="danger-btn mini" onclick="purchaseCart.splice(${n},1);buyCart.innerHTML=purchaseCartHtml()">×</button></b></div>`).join(''):'<div class=empty>Nenhum item.</div>'}async function savePurchase(){if(!purchaseCart.length)return alert('Adicione itens.');await api('/purchases',{method:'POST',body:JSON.stringify({supplier_id:+buySupplier.value||null,invoice_number:buyInvoice.value,items:purchaseCart})});purchaseCart=[];toast('Pedido salvo.');render('compras')}function receivePurchase(id){modal(`<h3>Receber compra #${id}</h3><label>Quantidade de parcelas</label><input id=buyInstallments type=number min=1 step=1 value=1><label>Primeiro vencimento</label><input id=buyFirstDue type=date value="${new Date().toISOString().slice(0,10)}"><div style="margin-top:18px"><button class=primary onclick="confirmReceivePurchase(${id})">Receber compra</button> <button onclick=closeModal()>Cancelar</button></div>`)}async function confirmReceivePurchase(id){let installments=Math.max(1,+buyInstallments.value||1),first=buyFirstDue.value;if(!first)return toast('Informe o primeiro vencimento.');try{await api('/purchases/'+id+'/receive',{method:'POST',body:JSON.stringify({installments,first_due:first})});closeModal();toast('Compra recebida e custo médio atualizado.');render('compras')}catch(e){toast(e.message)}}

async function novoOrcamento(){
  let [c,p,cfg]=await Promise.all([api('/customers'),api('/products'),api('/settings')]); window._quoteProducts=p; window._quoteCustomers=c;
  let today=new Date(),valid=new Date(today);valid.setDate(valid.getDate()+7),iso=d=>d.toISOString().slice(0,10);
  setTimeout(()=>{let v=document.getElementById('qValid');if(v&&!v.value)v.value=iso(valid);fillQuoteProductPrice();updateQuoteTotals()},0);
  return `<div class="quote-page"><div class="quote-heading"><div class=quote-brand>${cfg.company?.logo_data?`<img class=quote-company-logo src="${cfg.company.logo_data}" alt="Logo">`:''}<div><span class=eyebrow>ORÇAMENTOS</span><h2>▤ Novo Orçamento</h2><p>Cadastre os produtos e gere um orçamento para seu cliente.</p></div></div><button class=secondary onclick="render('orcamentos-salvos')">▥ Orçamentos Salvos</button></div>
  <div class="quote-panel"><div class="quote-customer-grid"><div class="field span2"><label>Cliente</label><select id=qCustomer onchange=fillQuoteCustomer()><option value="">Consumidor Final</option>${c.map(x=>`<option value=${x.id}>${esc(x.name)}</option>`).join('')}</select></div><div class=field><label>CPF/CNPJ</label><input id=qDoc readonly placeholder="000.000.000-00"></div><div class=field><label>Telefone</label><input id=qPhone readonly placeholder="(00) 00000-0000"></div><div class=field><label>Data do Orçamento</label><input type=date value="${iso(today)}" readonly></div><div class=field><label>Validade</label><input id=qValid type=date></div><div class=field><label>Vendedor</label><input value="${esc(me.name)}" readonly></div></div>
  <div class=quote-add><div class="field quote-product"><label for=qProductSearch>Buscar produto</label><div class="quote-product-picker"><input id=qProductSearch type=search autocomplete=off placeholder="Digite nome, código ou EAN..." oninput="filterQuoteProducts()" onkeydown="quoteSearchKey(event)" onfocus="filterQuoteProducts(true)" onblur="setTimeout(hideQuoteProductSuggestions,150)" role=combobox aria-autocomplete=list aria-expanded=false aria-controls=qProductSuggestions aria-describedby=qProductSearchHint><input id=qProduct type=hidden aria-hidden=true><div id=qProductSuggestions class="quote-product-suggestions"></div></div><small id=qProductSearchHint class=muted role=status aria-live=polite>Digite nome, código ou EAN. Enter seleciona o produto.</small></div><div class=field><label>Quantidade</label><input id=qQty type=number min=.001 step=.001 value=1 onkeydown="quoteFieldKey(event,'qPrice')"></div><div class=field><label>Preço Unit. (R$)</label><input id=qPrice type=number min=0 step=.01 placeholder="Automático" onkeydown="quoteFieldKey(event,'qItemDiscount')"></div><div class=field><label>Desconto (%)</label><input id=qItemDiscount type=number min=0 max=100 step=.01 value=0 onkeydown="quoteFieldKey(event)"></div><button class=primary onclick=addQuoteItemPro()>▣ Adicionar</button></div>
  <div id=qCart>${quoteCartProHtml()}</div>
  <div class=quote-bottom><div class=field><label>Observações</label><textarea id=qNotes rows=6 placeholder="Digite observações sobre este orçamento..."></textarea></div><div class=quote-totals><h3>Totais do Orçamento</h3><div><span>Total de Itens:</span><b id=qTotalItems>0</b></div><div><span>Total Bruto:</span><b id=qGross>${money(0)}</b></div><div><span>Desconto Total:</span><b id=qDiscountTotal>${money(0)}</b></div><div class=quote-grand><span>TOTAL:</span><strong id=qGrand>${money(0)}</strong></div></div></div>
  <div class=quote-footer><button onclick=clearQuote()>↻ Limpar</button><div><button class=primary onclick="saveQuotePro(false)">▣ Salvar Orçamento</button> <button class=secondary onclick="saveQuotePro(true)">▣ Salvar e Imprimir</button></div></div></div></div>`
}
function fillQuoteCustomer(){let c=_quoteCustomers?.find(x=>x.id===+qCustomer.value);qDoc.value=c?.doc||'';qPhone.value=c?.phone||''}

function quoteSearchText(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()}
function findQuoteProducts(products,query){
  const term=quoteSearchText(query),words=term.split(/\s+/).filter(Boolean);
  const matches=products.filter(p=>words.every(word=>quoteSearchText([p.code,p.ean,p.name].join(' ')).includes(word)));
  const exact=matches.filter(p=>term&&[p.code,p.ean].some(v=>quoteSearchText(v)===term));
  return {matches:exact.concat(matches.filter(p=>!exact.includes(p))),selected:exact.length===1?exact[0]:(matches.length===1?matches[0]:null)};
}
let quoteProductCursor=0;
function filterQuoteProducts(forceOpen=false){
  const input=document.getElementById('qProductSearch'),hidden=document.getElementById('qProduct'),box=document.getElementById('qProductSuggestions');
  if(!input||!hidden||!box)return;
  const term=input.value.trim(),products=window._quoteProducts||[];
  const chosen=products.find(p=>String(p.id)===hidden.value);
  const selectionKept=chosen&&term===`${chosen.code} — ${chosen.name}`;
  const result=term?findQuoteProducts(products,selectionKept?chosen.code:term):{matches:[],selected:null};
  quoteProductCursor=0;
  hidden.value=selectionKept?String(chosen.id):(result.selected?String(result.selected.id):'');
  const visible=result.matches.slice(0,12);
  box.innerHTML=visible.map((p,n)=>`<button type="button" role="option" aria-selected="${n===quoteProductCursor}" class="quote-product-option ${n===quoteProductCursor?'is-active':''}" onmousedown="event.preventDefault()" onclick="selectQuoteProduct(${p.id})"><span><b>${esc(p.code)} — ${esc(p.name)}</b><small>${esc(p.category||'Produto')}${p.brand?' • '+esc(p.brand):''} • Estoque: ${num(p.stock)} ${esc(p.unit||'UN')}</small></span><strong>${money(p.retail||0)}</strong></button>`).join('')||`<div class="quote-product-empty">${term?'Nenhum produto encontrado.':'Digite nome, código ou EAN.'}</div>`;
  box.style.display=(forceOpen||document.activeElement===input)&&visible.length?'block':'none';
  input.setAttribute('aria-expanded',box.style.display==='block'?'true':'false');
  document.getElementById('qProductSearchHint').textContent=term?(result.matches.length?`${result.matches.length} resultado(s). Enter seleciona o destacado; setas mudam a escolha.`:'Nenhum produto encontrado. Tente outro nome ou código.'):'Digite nome, código ou EAN. Enter seleciona o produto.';
  fillQuoteProductPrice();
}
function selectQuoteProduct(id){
  const p=(window._quoteProducts||[]).find(x=>x.id===+id),input=document.getElementById('qProductSearch'),hidden=document.getElementById('qProduct');
  if(!p||!input||!hidden)return;
  hidden.value=String(p.id);input.value=`${p.code} — ${p.name}`;hideQuoteProductSuggestions();fillQuoteProductPrice();
  const qty=document.getElementById('qQty');qty?.focus();qty?.select();
}
function hideQuoteProductSuggestions(){const box=document.getElementById('qProductSuggestions'),input=document.getElementById('qProductSearch');if(box)box.style.display='none';input?.setAttribute('aria-expanded','false')}
function quoteFieldKey(event,nextId){
  if(event.key!=='Enter')return;
  event.preventDefault();
  if(!nextId)return addQuoteItemPro();
  const next=document.getElementById(nextId);next?.focus();next?.select();
}
function quoteSearchKey(event){
  const input=document.getElementById('qProductSearch'),hidden=document.getElementById('qProduct');
  if(event.key==='Escape'){hideQuoteProductSuggestions();return}
  if(!['Enter','ArrowDown','ArrowUp'].includes(event.key))return;
  event.preventDefault();
  if(!input?.value.trim())return;
  const chosen=(window._quoteProducts||[]).find(p=>String(p.id)===hidden?.value),selectionKept=chosen&&input.value===`${chosen.code} — ${chosen.name}`;
  const matches=findQuoteProducts(window._quoteProducts||[],selectionKept?chosen.code:input.value).matches.slice(0,12);
  if(!matches.length){if(event.key==='Enter')toast('Produto não encontrado.');return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    quoteProductCursor=(quoteProductCursor+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
    const box=document.getElementById('qProductSuggestions');
    if(box){box.style.display='block';for(const [i,item] of Array.from(box.querySelectorAll('.quote-product-option')).entries()){item.classList.toggle('is-active',i===quoteProductCursor);item.setAttribute('aria-selected',String(i===quoteProductCursor))}box.querySelector('.is-active')?.scrollIntoView({block:'nearest'})}
    input.setAttribute('aria-expanded','true');hidden.value=String(matches[quoteProductCursor].id);fillQuoteProductPrice();return;
  }
  const p=selectionKept?chosen:matches[quoteProductCursor]||matches[0];
  selectQuoteProduct(p.id);
}

function fillQuoteProductPrice(){let p=_quoteProducts?.find(x=>x.id===+document.getElementById('qProduct')?.value),e=document.getElementById('qPrice');if(e)e.value=p?Number(p.retail||0).toFixed(2):''}
function quoteEffective(i){return Math.max(0,(+i.unit_price||0)*(1-(+i.discount_percent||0)/100))}
function addQuoteItemPro(){
  let p=_quoteProducts.find(x=>x.id===+document.getElementById('qProduct')?.value),qty=+qQty.value;
  if(!p||!Number.isFinite(qty)||qty<=0)return toast('Selecione um produto e informe uma quantidade válida.');
  let price=qPrice.value===''?+p.retail:+qPrice.value,disc=qItemDiscount.value===''?0:+qItemDiscount.value;
  if(!Number.isFinite(price)||price<0||!Number.isFinite(disc)||disc<0||disc>100)return toast('Confira o preço e o desconto.');
  let old=quoteCart.find(x=>x.product_id===p.id);
  if(old){old.qty+=qty;old.unit_price=price;old.discount_percent=disc}
  else quoteCart.push({product_id:p.id,code:p.code,name:p.name,unit:p.unit||'UN',qty,unit_price:price,discount_percent:disc});
  qQty.value=1;qItemDiscount.value=0;
  const input=document.getElementById('qProductSearch'),hidden=document.getElementById('qProduct');
  if(input)input.value='';if(hidden)hidden.value='';hideQuoteProductSuggestions();fillQuoteProductPrice();
  const hint=document.getElementById('qProductSearchHint');if(hint)hint.textContent='Digite nome, código ou EAN. Enter seleciona o produto.';
  refreshQuoteCart();input?.focus();
}

function quoteCartProHtml(){return `<div class="quote-table-wrap"><table class=quote-table><tr><th>Código</th><th>Produto</th><th>Qtd</th><th>Un</th><th>Preço Unit. (R$)</th><th>Desconto (%)</th><th>Subtotal (R$)</th><th>Ações</th></tr>${quoteCart.length?quoteCart.map((i,n)=>`<tr><td>${esc(i.code||'')}</td><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${esc(i.unit||'UN')}</td><td>${money(i.unit_price)}</td><td>${num(i.discount_percent||0)}%</td><td><b>${money(i.qty*quoteEffective(i))}</b></td><td><button class="secondary mini" onclick=editQuoteItem(${n})>✎</button> <button class="danger-btn mini" onclick="quoteCart.splice(${n},1);refreshQuoteCart()">×</button></td></tr>`).join(''):`<tr><td colspan=8 class=empty>Nenhum produto adicionado ao orçamento.</td></tr>`}</table></div>`}
function refreshQuoteCart(){let e=document.getElementById('qCart');if(e)e.innerHTML=quoteCartProHtml();updateQuoteTotals()}
function updateQuoteTotals(){let gross=quoteCart.reduce((a,i)=>a+i.qty*i.unit_price,0),total=quoteCart.reduce((a,i)=>a+i.qty*quoteEffective(i),0),disc=gross-total;for(let [id,v] of [['qTotalItems',quoteCart.length],['qGross',money(gross)],['qDiscountTotal',money(disc)],['qGrand',money(total)]]){let e=document.getElementById(id);if(e)e.textContent=v}}
function editQuoteItem(n){let i=quoteCart[n];modal(`<h3>Editar item</h3><p><b>${esc(i.name)}</b></p><label>Quantidade</label><input id=eqQty type=number min=.001 step=.001 value="${i.qty}"><label>Preço unitário</label><input id=eqPrice type=number min=0 step=.01 value="${i.unit_price}"><label>Desconto (%)</label><input id=eqDisc type=number min=0 max=100 step=.01 value="${i.discount_percent||0}"><div style="margin-top:18px"><button class=primary onclick="confirmEditQuoteItem(${n})">SALVAR</button> <button onclick=closeModal()>Cancelar</button></div>`)}
function confirmEditQuoteItem(n){let q=+eqQty.value,p=+eqPrice.value,d=Math.min(100,Math.max(0,+eqDisc.value||0));if(q<=0||p<0)return toast('Valores inválidos.');Object.assign(quoteCart[n],{qty:q,unit_price:p,discount_percent:d});closeModal();refreshQuoteCart()}
function clearQuote(){if(quoteCart.length&&!confirm('Limpar todos os itens deste orçamento?'))return;quoteCart=[];render('novo-orcamento')}
async function saveQuotePro(doPrint){if(!quoteCart.length)return toast('Adicione pelo menos um produto.');let body={customer_id:+qCustomer.value||null,valid_until:qValid.value||null,notes:qNotes.value||'',items:quoteCart.map(i=>({product_id:i.product_id,qty:i.qty,unit_price:i.unit_price,discount_percent:i.discount_percent||0}))};try{let q=await api('/quotes'+(activeQuoteEditId?'/'+activeQuoteEditId:''),{method:activeQuoteEditId?'PUT':'POST',body:JSON.stringify(body)}),id=q.id||activeQuoteEditId;quoteCart=[];activeQuoteEditId=null;toast('Orçamento #'+id+' salvo com sucesso.');if(doPrint)await printQuote(id);render('orcamentos-salvos')}catch(e){toast(e.message)}}
async function orcamentosSalvos(){let q=await api('/quotes');window._savedQuotes=q;return `<div class="quote-page"><div class=quote-heading><div><span class=eyebrow>ORÇAMENTOS • 3.2.7</span><h2>▥ Orçamentos Salvos</h2><p>Gerencie propostas, acompanhe a situação e envie orçamentos aprovados para o PDV.</p></div><button class=primary onclick="activeQuoteEditId=null;quoteCart=[];render('novo-orcamento')">+ Novo Orçamento</button></div><div class=quote-panel><div class=quote-saved-tools><input id=quoteSearch placeholder="Buscar por nº, cliente ou vendedor..." oninput=filterSavedQuotes()><select id=quoteStatus onchange=filterSavedQuotes()><option value="">Todas as situações</option><option>ABERTO</option><option>APROVADO</option><option>VENCIDO</option><option>CONVERTIDO</option><option>CANCELADO</option></select><input id=quoteDateFrom type=date onchange=filterSavedQuotes() title="Data inicial"><input id=quoteDateTo type=date onchange=filterSavedQuotes() title="Data final"></div><div id=savedQuoteTable>${savedQuoteTableHtml(q)}</div></div></div>`}
function quoteDisplayStatus(x){return x.display_status||(x.status==='ABERTO'&&x.valid_until&&String(x.valid_until).slice(0,10)<new Date().toISOString().slice(0,10)?'VENCIDO':x.status)}
function savedQuoteTableHtml(q){return `<div class=quote-table-wrap><table class=quote-table><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Valor</th><th>Validade</th><th>Situação</th><th>Ações</th></tr>${q.length?q.map(x=>{let status=quoteDisplayStatus(x),open=x.status==='ABERTO';return `<tr><td><b>#${x.id}</b></td><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>${esc(x.customer||'Consumidor Final')}</td><td>${esc(x.seller||'')}</td><td><b>${money(x.total)}</b></td><td>${x.valid_until?new Date(x.valid_until).toLocaleDateString('pt-BR'):'—'}</td><td><span class="quote-status ${status.toLowerCase()}">${status}</span></td><td class=quote-actions><button class="quote-icon-btn view" title="Visualizar" aria-label="Visualizar orçamento" onclick=viewQuote(${x.id})><span>◉</span></button> ${open?`<button class="quote-icon-btn edit" title="Editar" aria-label="Editar orçamento" onclick=editSavedQuote(${x.id})><span>✎</span></button>`:''}<button class="quote-icon-btn print" title="Imprimir" aria-label="Imprimir orçamento" onclick=printQuote(${x.id})><span>▣</span></button><button class="quote-icon-btn duplicate" title="Duplicar" aria-label="Duplicar orçamento" onclick=duplicateQuote(${x.id})><span>▢</span></button>${open?`<button class="quote-icon-btn cancel" title="Cancelar" aria-label="Cancelar orçamento" onclick=cancelQuote(${x.id})><span>✕</span></button><button class="quote-convert-btn" title="Converter em Venda" onclick=convertQuote(${x.id})><span>🛒</span> Converter em Venda <b>›</b></button>`:''}</td></tr>`}).join(''):`<tr><td colspan=8 class=empty>Nenhum orçamento encontrado.</td></tr>`}</table></div>`}
function filterSavedQuotes(){let term=(quoteSearch.value||'').toLowerCase(),st=quoteStatus.value,df=quoteDateFrom?.value||'',dt=quoteDateTo?.value||'',q=(_savedQuotes||[]).filter(x=>{let ds=String(x.created_at||'').slice(0,10),status=quoteDisplayStatus(x);return(!st||status===st)&&(!df||ds>=df)&&(!dt||ds<=dt)&&(!term||String(x.id).includes(term)||(x.customer||'').toLowerCase().includes(term)||(x.seller||'').toLowerCase().includes(term))});savedQuoteTable.innerHTML=savedQuoteTableHtml(q)}
async function viewQuote(id){try{let q=await api('/quotes/'+id),gross=q.items.reduce((a,i)=>a+(+i.qty*+i.unit_price),0);modal(`<div class=quote-view><div class=toolbar><div><span class=eyebrow>ORÇAMENTO #${q.id}</span><h3>${esc(q.customer||'Consumidor Final')}</h3></div><span class="quote-status ${quoteDisplayStatus(q).toLowerCase()}">${quoteDisplayStatus(q)}</span></div><p><b>Vendedor:</b> ${esc(q.seller||'')} • <b>Validade:</b> ${q.valid_until?new Date(q.valid_until).toLocaleDateString('pt-BR'):'—'}</p><div class=scroll><table><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Desc.</th><th>Total</th></tr>${q.items.map(i=>`<tr><td>${esc(i.description)}</td><td>${num(i.qty)}</td><td>${money(i.unit_price)}</td><td>${num(i.discount_percent||0)}%</td><td><b>${money(+i.qty*+i.unit_price*(1-(+i.discount_percent||0)/100))}</b></td></tr>`).join('')}</table></div><div class=quote-view-total><span>Bruto ${money(gross)} • Desconto ${money(q.discount)}</span><strong>TOTAL ${money(q.total)}</strong></div>${q.notes?`<p><b>Observações:</b><br>${esc(q.notes)}</p>`:''}<div class=quote-modal-actions><button class=secondary onclick="printQuote(${q.id})">Imprimir</button> ${q.status==='ABERTO'?`<button class=primary onclick="closeModal();convertQuote(${q.id})">Converter em Venda</button>`:''} <button onclick=closeModal()>Fechar</button></div></div>`)}catch(e){toast(e.message)}}
async function editSavedQuote(id){try{let [q,c,p]=await Promise.all([api('/quotes/'+id),api('/customers'),api('/products')]);if(q.status!=='ABERTO')return toast('Somente orçamento aberto pode ser editado.');activeQuoteEditId=id;window._quoteProducts=p;window._quoteCustomers=c;quoteCart=q.items.map(i=>({product_id:i.product_id,code:i.code||'',name:i.description,unit:i.unit||'UN',qty:+i.qty,unit_price:+i.unit_price,discount_percent:+i.discount_percent||0}));await render('novo-orcamento');setTimeout(()=>{let qc=document.getElementById('qCustomer'),qv=document.getElementById('qValid'),qn=document.getElementById('qNotes');if(qc){qc.value=q.customer_id||'';fillQuoteCustomer()}if(qv)qv.value=q.valid_until?String(q.valid_until).slice(0,10):'';if(qn)qn.value=q.notes||'';let h=document.querySelector('.quote-heading h2');if(h)h.textContent='▤ Editar Orçamento #'+id;refreshQuoteCart()},50)}catch(e){toast(e.message)}}
async function duplicateQuote(id){if(!confirm('Criar uma cópia do orçamento #'+id+'?'))return;try{let q=await api('/quotes/'+id+'/duplicate',{method:'POST',body:'{}'});toast('Orçamento duplicado como #'+q.id);render('orcamentos-salvos')}catch(e){toast(e.message)}}
function cancelQuote(id){modal(`<h3>Cancelar orçamento #${id}</h3><div class="alert red">O orçamento continuará no histórico com situação CANCELADO.</div><label>Motivo</label><textarea id=quoteCancelReason rows=3 placeholder="Informe o motivo"></textarea><div style="margin-top:18px"><button class=danger-btn onclick="confirmCancelQuote(${id})">CANCELAR ORÇAMENTO</button> <button onclick=closeModal()>Voltar</button></div>`)}
async function confirmCancelQuote(id){try{await api('/quotes/'+id+'/cancel',{method:'POST',body:JSON.stringify({reason:quoteCancelReason.value||''})});closeModal();toast('Orçamento #'+id+' cancelado.');render('orcamentos-salvos')}catch(e){toast(e.message)}}

let finData=[],finFilter={text:'',kind:'',status:'',from:'',to:''};
const finDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const finStatus=x=>x.status==='PENDENTE'&&x.due_date&&String(x.due_date).slice(0,10)<new Date().toISOString().slice(0,10)?'VENCIDO':(x.status==='PAGO'&&x.kind==='RECEBER'?'RECEBIDO':x.status);
const finKindLabel=k=>k==='RECEBER'?'A RECEBER':k==='PAGAR'?'A PAGAR':'DESPESA';
async function financeiro(){
  let [f,sum]=await Promise.all([api('/financial'),api('/financial/summary')]);finData=f;window._finSummary=sum;
  setTimeout(()=>filterFinance(),0);
  return `<div class="fin-pro">
    <div class="fin-hero"><div><span class=eyebrow>FINANCEIRO • 3.5.0</span><h2>Financeiro Profissional</h2><p>Contas a pagar e receber, vencimentos, baixas e resultado em uma única visão.</p></div>${['Administrador','Gerente'].includes(me.role)?'<button class=primary onclick=finForm()>+ Novo lançamento</button>':''}</div>
    <div class="fin-kpis">
      <div class="fin-kpi receive"><small>A RECEBER</small><strong>${money(sum.receivable)}</strong><span>Pendente</span></div>
      <div class="fin-kpi pay"><small>A PAGAR</small><strong>${money(sum.payable)}</strong><span>Pendente</span></div>
      <div class="fin-kpi overdue"><small>VENCIDO</small><strong>${money(sum.overdue_receivable+sum.overdue_payable)}</strong><span>${money(sum.overdue_receivable)} receber • ${money(sum.overdue_payable)} pagar</span></div>
      <div class="fin-kpi"><small>RECEBIDO NO MÊS</small><strong>${money(sum.received_month)}</strong><span>Entradas baixadas</span></div>
      <div class="fin-kpi"><small>PAGO NO MÊS</small><strong>${money(sum.paid_month)}</strong><span>Saídas baixadas</span></div>
      <div class="fin-kpi result"><small>RESULTADO DO MÊS</small><strong>${money(sum.received_month-sum.paid_month)}</strong><span>Recebido − pago</span></div>
    </div>
    <div class="fin-agenda"><div><small>VENCE HOJE</small><b>${sum.due_today_count||0} conta(s)</b><span>${money(sum.due_today_amount)}</span></div><div><small>PRÓXIMOS 7 DIAS • RECEBER</small><b>${money(sum.receivable_7)}</b><span>Previsão de entrada</span></div><div><small>PRÓXIMOS 7 DIAS • PAGAR</small><b>${money(sum.payable_7)}</b><span>Compromissos previstos</span></div><div><small>CONTAS VENCIDAS</small><b class=danger>${sum.overdue_count||0}</b><span>${money(sum.overdue_receivable+sum.overdue_payable)}</span></div></div>
    <div class="fin-panel">
      <div class="fin-tabs">
        <button class=active data-fin-kind="" onclick="setFinKind(this,'')">Todos</button>
        <button data-fin-kind=RECEBER onclick="setFinKind(this,'RECEBER')">A receber</button>
        <button data-fin-kind=PAGAR onclick="setFinKind(this,'PAGAR')">A pagar</button>
        <button data-fin-kind=DESPESA onclick="setFinKind(this,'DESPESA')">Despesas</button>
      </div>
      <div class="fin-filters">
        <input id=finSearch placeholder="Buscar descrição, cliente, fornecedor, categoria ou documento..." oninput=filterFinance()>
        <select id=finStatus onchange=filterFinance()><option value="">Todas as situações</option><option>PENDENTE</option><option>VENCIDO</option><option>RECEBIDO</option><option>PAGO</option><option>CANCELADO</option></select>
        <input id=finFrom type=date onchange=filterFinance() title="Vencimento inicial">
        <input id=finTo type=date onchange=filterFinance() title="Vencimento final">
        <button class=secondary onclick=clearFinFilters()>Limpar</button>
      </div>
      <div id=finTable></div>
    </div>
  </div>`
}
function setFinKind(btn,kind){finFilter.kind=kind;document.querySelectorAll('.fin-tabs button').forEach(b=>b.classList.toggle('active',b===btn));filterFinance()}
function clearFinFilters(){finFilter.kind='';let a=document.getElementById('finSearch'),b=document.getElementById('finStatus'),c=document.getElementById('finFrom'),d=document.getElementById('finTo');if(a)a.value='';if(b)b.value='';if(c)c.value='';if(d)d.value='';document.querySelectorAll('.fin-tabs button').forEach((x,i)=>x.classList.toggle('active',i===0));filterFinance()}
function filterFinance(){
  let text=(document.getElementById('finSearch')?.value||'').toLowerCase().trim(),status=document.getElementById('finStatus')?.value||'',from=document.getElementById('finFrom')?.value||'',to=document.getElementById('finTo')?.value||'';
  let rows=finData.filter(x=>{
    let st=finStatus(x),hay=[x.description,x.category,x.counterparty,x.party_name,x.document_no,x.payment_method,x.reference_type].join(' ').toLowerCase(),due=String(x.due_date||'').slice(0,10);
    return (!finFilter.kind||x.kind===finFilter.kind)&&(!status||st===status)&&(!text||hay.includes(text))&&(!from||due>=from)&&(!to||due<=to)
  });let box=document.getElementById('finTable');if(box)box.innerHTML=finTableHtml(rows)
}
function finTableHtml(rows){
  return `<div class=fin-table-wrap><table class=fin-table><tr><th>#</th><th>TIPO</th><th>DESCRIÇÃO / PARTE</th><th>CATEGORIA</th><th>VENCIMENTO</th><th>VALOR</th><th>SITUAÇÃO</th><th>BAIXA</th><th>AÇÕES</th></tr>${rows.length?rows.map(x=>{let st=finStatus(x),canEdit=x.status==='PENDENTE'&&['Administrador','Gerente'].includes(me.role);return `<tr class="${st==='VENCIDO'?'fin-row-overdue':''}"><td>#${x.id}</td><td><span class="fin-kind ${x.kind.toLowerCase()}">${finKindLabel(x.kind)}</span></td><td><b>${esc(x.description)}</b><small>${esc(x.counterparty||x.party_name||'')}${x.document_no?' • Doc. '+esc(x.document_no):''}</small></td><td>${esc(x.category||'—')}</td><td>${finDate(x.due_date)}</td><td><b>${money(x.amount)}</b></td><td><span class="fin-status ${st.toLowerCase()}">${st}</span></td><td>${x.paid_at?finDate(x.paid_at)+'<small>'+esc(x.payment_method||'')+'</small>':'—'}</td><td><div class=fin-actions>${x.status==='PENDENTE'?`<button class="success-btn mini" onclick=payFin(${x.id})>${x.kind==='RECEBER'?'Receber':'Pagar'}</button>`:''}${canEdit?`<button class="secondary mini" onclick=editFin(${x.id})>Editar</button><button class="danger-btn mini" onclick=cancelFin(${x.id})>Cancelar</button>`:''}</div></td></tr>`}).join(''):`<tr><td colspan=9><div class=empty>Nenhum lançamento encontrado para os filtros informados.</div></td></tr>`}</table></div>`
}
function finForm(item=null){
  let x=item||{},edit=!!item;
  modal(`<h3>${edit?'Editar lançamento #'+x.id:'Novo lançamento financeiro'}</h3><p class=muted>${edit?'Altere somente informações de um lançamento ainda pendente.':'Cadastre uma conta a pagar, a receber ou uma despesa.'}</p><div class=formgrid>
    <div><label>Tipo *</label><select id=fkind><option ${x.kind==='PAGAR'?'selected':''}>PAGAR</option><option ${x.kind==='RECEBER'?'selected':''}>RECEBER</option><option ${x.kind==='DESPESA'?'selected':''}>DESPESA</option></select></div>
    <div><label>Vencimento</label><input id=fdue type=date value="${String(x.due_date||'').slice(0,10)}"></div>
    <div class=span2><label>Descrição *</label><input id=fdesc maxlength=160 value="${esc(x.description||'')}" placeholder="Ex.: Energia elétrica, parcela fornecedor..."></div>
    <div><label>Cliente / Fornecedor / Favorecido</label><input id=fparty maxlength=120 value="${esc(x.party_name||x.counterparty||'')}"></div>
    <div><label>Categoria</label><input id=fcategory maxlength=80 value="${esc(x.category||'')}" placeholder="Ex.: Fornecedor, Energia, Aluguel"></div>
    <div><label>Documento</label><input id=fdoc maxlength=60 value="${esc(x.document_no||'')}" placeholder="NF, boleto, referência..."></div>
    <div><label>Valor ${edit?'*':'total *'}</label><input id=famount type=number min=.01 step=.01 value="${x.amount||''}"></div>
    ${edit?'':`<div><label>Parcelas</label><input id=finstallments type=number min=1 max=60 step=1 value=1><small class=muted>O valor total será dividido automaticamente.</small></div>`}
    <div class=span2><label>Observações</label><textarea id=fnotes rows=3>${esc(x.notes||'')}</textarea></div>
  </div><div style="margin-top:18px"><button class=primary onclick="saveFin(${edit?x.id:'null'})">${edit?'SALVAR ALTERAÇÕES':'SALVAR LANÇAMENTO'}</button> <button onclick=closeModal()>Cancelar</button></div>`)
}
async function saveFin(id=null){
  let body={kind:fkind.value,description:fdesc.value.trim(),party_name:fparty.value.trim(),category:fcategory.value.trim(),document_no:fdoc.value.trim(),amount:+famount.value,due_date:fdue.value||null,notes:fnotes.value.trim(),installments:id?1:Math.max(1,Math.min(60,+document.getElementById('finstallments')?.value||1))};
  if(!body.description)return toast('Informe a descrição.');if(!body.amount||body.amount<=0)return toast('Informe um valor maior que zero.');
  try{await api('/financial'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(body)});closeModal();toast(id?'Lançamento atualizado.':'Lançamento criado.');render('financeiro')}catch(e){toast(e.message)}
}
function editFin(id){let x=finData.find(i=>i.id===id);if(x)finForm(x)}
function payFin(id){let x=finData.find(i=>i.id===id);modal(`<h3>${x?.kind==='RECEBER'?'Receber':'Pagar'} lançamento #${id}</h3><div class="alert green"><b>${esc(x?.description||'')}</b><br>${money(x?.amount||0)}</div><label>Forma de pagamento / recebimento</label><select id=finMethod><option>Dinheiro</option><option selected>PIX</option><option>Cartão Débito</option><option>Cartão Crédito</option><option>Transferência</option><option>Boleto</option></select><div style="margin-top:18px"><button class=primary onclick="confirmPayFin(${id})">CONFIRMAR BAIXA</button> <button onclick=closeModal()>Cancelar</button></div>`)}
async function confirmPayFin(id){try{await api('/financial/'+id+'/pay',{method:'POST',body:JSON.stringify({payment_method:finMethod.value})});closeModal();toast('Baixa financeira registrada.');render('financeiro')}catch(e){toast(e.message)}}
function cancelFin(id){let x=finData.find(i=>i.id===id);modal(`<h3>Cancelar lançamento #${id}</h3><div class="alert red">O lançamento será mantido no histórico como CANCELADO.</div><p><b>${esc(x?.description||'')}</b> • ${money(x?.amount||0)}</p><label>Motivo *</label><textarea id=finCancelReason rows=3 placeholder="Informe o motivo do cancelamento"></textarea><div style="margin-top:18px"><button class=danger-btn onclick="confirmCancelFin(${id})">CANCELAR LANÇAMENTO</button> <button onclick=closeModal()>Voltar</button></div>`)}
async function confirmCancelFin(id){let reason=finCancelReason.value.trim();if(!reason)return toast('Informe o motivo.');try{await api('/financial/'+id+'/cancel',{method:'POST',body:JSON.stringify({reason})});closeModal();toast('Lançamento cancelado.');render('financeiro')}catch(e){toast(e.message)}}

let gerReportData=null;
const gerDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const gerIsoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function gerDefaultDates(){let d=new Date(),to=gerIsoLocal(d),from=gerIsoLocal(new Date(d.getFullYear(),d.getMonth(),1));return {from,to}}
async function relatorios(){
  let bs=null,dt=gerDefaultDates();
  if(me.role==='Administrador')try{bs=await api('/backup/status')}catch{}
  setTimeout(()=>loadGerencialReport(),0);
  return `<div class="ger-pro ger-prime"><div class="ger-prime-head"><div><span class=eyebrow>PORTO PRIME • INTELIGÊNCIA GERENCIAL</span><h2>Relatórios Gerenciais</h2><p>Acompanhe vendas, lucro, financeiro, estoque e clientes com dados reais da operação.</p></div><div class=ger-head-actions><button onclick=loadGerencialReport() title="Atualizar">↻ <span>Atualizar</span></button><button onclick=printGerencialReport() title="Imprimir">▣ <span>Imprimir</span></button><button onclick=exportGerencialCsv() title="Exportar Excel/CSV">⇩ <span>Excel</span></button></div></div>
  <div class=ger-tabs><button class="active" data-ger-tab=dashboard onclick="gerTab('dashboard',this)">▥ Dashboard</button><button data-ger-tab=vendas onclick="gerTab('vendas',this)">▣ Vendas</button><button data-ger-tab=financeiro onclick="gerTab('financeiro',this)">$ Financeiro</button><button data-ger-tab=estoque onclick="gerTab('estoque',this)">◇ Estoque</button><button data-ger-tab=clientes onclick="gerTab('clientes',this)">♙ Clientes</button></div>
  <div class="panel ger-filters ger-prime-filters"><div><label>Período</label><div class=ger-date-pair><input id=gerFrom type=date value="${dt.from}"><span>até</span><input id=gerTo type=date value="${dt.to}"></div></div><div class=ger-presets><button onclick="gerPreset(0)">Hoje</button><button onclick="gerPreset(7)">7 dias</button><button class=active onclick="gerPreset('month')">Este mês</button><button onclick="gerPreset('prevmonth')">Mês anterior</button><button onclick="gerFrom.focus()">Personalizado</button></div><button class=primary onclick=loadGerencialReport()>Aplicar</button></div>
  <div id=gerReportBody><div class="panel loading">Carregando indicadores...</div></div>
  ${me.role==='Administrador'?`<div class="panel backup-pro ger-backup"><div class=toolbar><div><span class=eyebrow>SEGURANÇA DOS DADOS</span><h3 style="margin:5px 0">Backup e restauração</h3><small class=muted>O Porto Prime cria uma cópia automática diária e mantém as 30 cópias mais recentes.</small></div><span class="badge green">● Backup automático ativo</span></div><div id=backupStatus class=backup-status>${backupStatusHtml(bs)}</div><div class=backup-actions><button class=primary onclick="backupNow()">↓ Fazer Backup Agora</button><button class=secondary onclick="downloadBackup()">⇩ Baixar uma cópia</button><button class=secondary onclick="chooseRestoreBackup()">↥ Restaurar Backup</button></div><input id=restoreBackupFile type=file accept="application/json,.json" style="display:none" onchange="restoreBackupFile(this)"></div>`:''}</div>`;
}
let gerActiveTab='dashboard';
function gerTab(tab,btn){gerActiveTab=tab;document.querySelectorAll('.ger-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.gerTab===tab));document.querySelectorAll('[data-ger-panel]').forEach(x=>x.classList.toggle('hidden',x.dataset.gerPanel!==tab))}
function gerPreset(days){let d=new Date(),f=new Date(d),t=new Date(d);if(days==='month'){f=new Date(d.getFullYear(),d.getMonth(),1)}else if(days==='prevmonth'){f=new Date(d.getFullYear(),d.getMonth()-1,1);t=new Date(d.getFullYear(),d.getMonth(),0)}else if(+days>0)f.setDate(f.getDate()-(+days-1));let from=document.getElementById('gerFrom'),to=document.getElementById('gerTo');if(!from||!to)return;from.value=gerIsoLocal(f);to.value=gerIsoLocal(t);loadGerencialReport()}
async function loadGerencialReport(){let body=document.getElementById('gerReportBody'),fromEl=document.getElementById('gerFrom'),toEl=document.getElementById('gerTo');if(!body||!fromEl||!toEl)return;let from=fromEl.value,to=toEl.value;if(!from||!to)return toast('Informe o período.');if(from>to)return toast('A data inicial não pode ser maior que a final.');body.innerHTML='<div class="panel loading">Atualizando relatório...</div>';try{let r=await api(`/reports/management?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);gerReportData=r;body.innerHTML=gerReportHtml(r);gerTab(gerActiveTab,document.querySelector(`[data-ger-tab="${gerActiveTab}"]`))}catch(e){body.innerHTML=`<div class="alert red">${esc(e.message)}</div>`}}
function gerDonut(items,total){let vals=(items||[]).slice(0,6),sum=total||vals.reduce((a,x)=>a+(+x.total||+x.revenue||0),0);if(!sum)return '<div class=empty>Sem dados no período.</div>';let colors=['#1688f8','#19b86a','#ff941f','#8557e8','#ee4d61','#718397'],acc=0,stops=vals.map((x,i)=>{let v=(+x.total||+x.revenue||0)/sum*100,s=`${colors[i]} ${acc}% ${acc+v}%`;acc+=v;return s}).join(',');return `<div class=ger-donut-wrap><div class=ger-donut style="background:conic-gradient(${stops})"><div><b>${money(sum)}</b><small>Total</small></div></div><div class=ger-legend>${vals.map((x,i)=>`<span><i style="background:${colors[i]}"></i><em>${esc(x.method||x.name||x.description||'Outros')}</em><b>${((+x.total||+x.revenue||0)/sum*100).toFixed(1)}%</b></span>`).join('')}</div></div>`}
function gerReportHtml(r){let m=r.metrics||{},fin=r.financial||{},inv=r.inventory||{},pur=r.purchases||{},max=Math.max(1,...(r.monthly||[]).map(x=>+x.total),...(r.daily||[]).map(x=>+x.total));return `<div class=ger-period><b>Período:</b> ${gerDate(r.from)} a ${gerDate(r.to)}</div>
<div data-ger-panel=dashboard><div class="cards ger-kpis-prime"><div class="card blue"><small>Faturamento</small><strong>${money(m.revenue)}</strong><span>${m.sales||0} vendas</span></div><div class="card green"><small>Lucro bruto</small><strong>${money(m.gross)}</strong><span>Margem ${num(m.margin)}%</span></div><div class="card orange"><small>Total de vendas</small><strong>${m.sales||0}</strong><span>no período</span></div><div class="card purple"><small>Ticket médio</small><strong>${money(m.ticket)}</strong><span>por venda</span></div><div class="card red"><small>A receber</small><strong>${money(fin.receivable)}</strong><span>${fin.receivable_count||0} títulos</span></div><div class="card slate"><small>A pagar</small><strong>${money(fin.payable)}</strong><span>${fin.payable_count||0} títulos</span></div><div class="card teal"><small>Resultado financeiro</small><strong>${money(fin.result)}</strong><span>entradas − saídas</span></div></div>
<div class=grid2><div class=panel><div class=toolbar><h3>Faturamento dos últimos 12 meses</h3><span class=pill>12 meses</span></div><div class=ger-month-bars>${(r.monthly||[]).map(x=>`<div><b>${money(x.total)}</b><i style="height:${Math.max(5,+x.total/max*150)}px"></i><small>${esc(x.label)}</small></div>`).join('')}</div></div><div class=panel><h3>Vendas por forma de pagamento</h3>${gerDonut(r.payments,m.revenue)}</div></div>
<div class=ger-grid3><div class=panel><h3>Top 5 produtos mais vendidos</h3>${(r.products||[]).slice(0,5).map((x,i)=>`<div class=ger-rank><span>${i+1}. ${esc(x.description)}</span><b>${num(x.qty)} un.</b></div>`).join('')||'<div class=empty>Sem vendas.</div>'}</div><div class=panel><h3>Vendas por categoria</h3>${gerDonut(r.categories,m.revenue)}</div><div class=panel><h3>Clientes que mais compraram</h3>${(r.customers||[]).slice(0,5).map((x,i)=>`<div class=ger-rank><span>${i+1}. ${esc(x.name)}</span><b>${money(x.revenue)}</b></div>`).join('')||'<div class=empty>Sem clientes.</div>'}</div></div>
<div class=panel><div class=toolbar><h3>Últimas vendas do período</h3><span class=pill>${m.sales||0} venda(s)</span></div><div class=scroll><table><tr><th>Data</th><th>Nº Venda</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Vendedor</th><th>Lucro</th><th>Margem</th></tr>${(r.recent_sales||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>#${x.id}</td><td>${esc(x.customer||'Consumidor Final')}</td><td>${x.items}</td><td>${money(x.total)}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(x.seller||'—')}</td><td>${money(x.gross)}</td><td>${num(x.margin)}%</td></tr>`).join('')||'<tr><td colspan=9>Sem vendas no período.</td></tr>'}</table></div></div></div>
<div data-ger-panel=vendas class=hidden><div class=grid2><div class=panel><h3>Vendas por dia</h3>${(r.daily||[]).map(x=>`<div class=ger-bar-row><small>${gerDate(String(x.sale_date).slice(0,10))}</small><div class=bar><i style="width:${(+x.total/max*100).toFixed(1)}%"></i></div><b>${money(x.total)}</b></div>`).join('')||'<div class=empty>Sem vendas.</div>'}</div><div class=panel><h3>Vendas por vendedor</h3>${(r.sellers||[]).map(x=>`<div class=sale-item><span>${esc(x.name)} <small>• ${x.sales} venda(s)</small></span><b>${money(x.revenue)}</b></div>`).join('')}</div></div></div>
<div data-ger-panel=financeiro class=hidden><div class="cards cards6"><div class=card><small>Entradas</small><strong class=ok>${money(fin.income)}</strong></div><div class=card><small>Saídas</small><strong class=danger>${money(fin.outflow)}</strong></div><div class=card><small>Resultado</small><strong>${money(fin.result)}</strong></div><div class=card><small>A receber</small><strong>${money(fin.receivable)}</strong></div><div class=card><small>A pagar</small><strong>${money(fin.payable)}</strong></div><div class=card><small>Compras no período</small><strong>${money(pur.total)}</strong><span>${pur.count||0} compra(s)</span></div></div><div class=panel><h3>Compras por fornecedor</h3>${(r.suppliers||[]).map(x=>`<div class=sale-item><span>${esc(x.name)} <small>• ${x.purchases||0} compra(s)</small></span><b>${money(x.total)}</b></div>`).join('')||'<div class=empty>Sem compras no período.</div>'}</div></div>
<div data-ger-panel=estoque class=hidden><div class="cards cards6"><div class=card><small>Valor a custo</small><strong>${money(inv.cost_value)}</strong></div><div class=card><small>Produtos ativos</small><strong>${inv.products||0}</strong></div><div class=card><small>Estoque baixo</small><strong class=danger>${inv.low||0}</strong></div><div class=card><small>Zerados</small><strong class=danger>${inv.zero||0}</strong></div></div><div class=panel><h3>Produtos sem venda no período</h3>${(r.no_sales||[]).map(x=>`<div class=sale-item><span>${esc(x.name)} <small>• estoque ${num(x.stock)}</small></span><b>${money((+x.stock||0)*(+x.cost||0))}</b></div>`).join('')||'<div class=empty>Todos os produtos analisados tiveram venda.</div>'}</div></div>
<div data-ger-panel=clientes class=hidden><div class=panel><h3>Ranking de clientes</h3><div class=scroll><table><tr><th>Cliente</th><th>Compras</th><th>Faturamento</th><th>Ticket médio</th><th>Última compra</th></tr>${(r.customers||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${x.sales}</td><td>${money(x.revenue)}</td><td>${money(x.ticket)}</td><td>${x.last_sale?new Date(x.last_sale).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')}</table></div></div></div>`}
async function printGerencialReport(){if(!gerReportData)return toast('Atualize o relatório antes de imprimir.');let r=gerReportData,m=r.metrics||{},w=window.open('','_blank','width=1000,height=850');w.document.write(`<!doctype html><html><head><meta charset=utf-8><title>Relatório Gerencial Porto Prime</title>${printBaseStyles()}</head><body><div class=doc><div class=doc-title><div><h2>PORTO PRIME — RELATÓRIO GERENCIAL</h2><span>Período ${gerDate(r.from)} a ${gerDate(r.to)}</span></div></div><table><tr><th>Indicador</th><th class=r>Valor</th></tr><tr><td>Faturamento</td><td class=r>${money(m.revenue)}</td></tr><tr><td>Vendas</td><td class=r>${m.sales||0}</td></tr><tr><td>Ticket médio</td><td class=r>${money(m.ticket)}</td></tr><tr><td>Lucro bruto</td><td class=r>${money(m.gross)}</td></tr><tr><td>Margem</td><td class=r>${num(m.margin)}%</td></tr></table><h3>Produtos mais vendidos</h3><table><tr><th>Produto</th><th>Qtd.</th><th class=r>Faturamento</th></tr>${(r.products||[]).map(x=>`<tr><td>${esc(x.description)}</td><td>${num(x.qty)}</td><td class=r>${money(x.revenue)}</td></tr>`).join('')}</table></div><script>print()<\/script></body></html>`);w.document.close()}
async function exportGerencialCsv(){if(!gerReportData)return toast('Atualize o relatório antes de exportar.');let r=gerReportData;try{let resp=await fetch(`/api/reports/management/export?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`,{headers:{Authorization:'Bearer '+token}});if(!resp.ok){let j=await resp.json().catch(()=>({}));throw Error(j.error||'Erro ao exportar relatório.')}let blob=await resp.blob(),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=`PortoPrime-Relatorio-${r.from}-a-${r.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);toast('Relatório Excel gerado.')}catch(e){toast(e.message)}}
function backupStatusHtml(s){let last=s?.last;return `<div><small>Último backup protegido</small><b>${last?new Date(last.created_at).toLocaleString('pt-BR'):'Ainda não criado'}</b></div><div><small>Cópias protegidas</small><b>${s?.total||0} / ${s?.retention||30}</b></div><div><small>Frequência automática</small><b>A cada 24 horas</b></div>${last?`<div><small>Último arquivo</small><b>${esc(last.name)} • ${fmtBytes(last.size)}</b></div>`:''}`;}
function fmtBytes(n){n=+n||0;return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB'}
async function loadBackupStatus(){let el=document.getElementById('backupStatus');if(!el)return;try{let s=await api('/backup/status'),last=s.last;el.innerHTML=`<div><small>Último backup protegido</small><b>${last?new Date(last.created_at).toLocaleString('pt-BR'):'Ainda não criado'}</b></div><div><small>Cópias protegidas</small><b>${s.total||0} / ${s.retention}</b></div><div><small>Frequência automática</small><b>A cada 24 horas</b></div>${last?`<div><small>Último arquivo</small><b>${esc(last.name)} • ${fmtBytes(last.size)}</b></div>`:''}`;}catch(e){el.innerHTML=`<div class="alert red">${esc(e.message)}</div>`}}
async function backupNow(){try{let r=await api('/backup/create',{method:'POST',body:'{}'});toast('Backup protegido criado com sucesso.');await loadBackupStatus();return r}catch(e){alert(e.message)}}
async function downloadBackup(){try{let b=await api('/backup/export'),blob=new Blob([JSON.stringify(b,null,2)],{type:'application/json'}),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=`PortoPrime-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('Cópia do backup baixada.')}catch(e){alert(e.message)}}
function chooseRestoreBackup(){document.getElementById('restoreBackupFile')?.click()}
async function restoreBackupFile(input){let f=input.files?.[0];if(!f)return;try{let text=await f.text(),b=JSON.parse(text);if(b?.format!=='ConstruGest Backup'||!b?.tables)throw Error('Arquivo de backup inválido.');modal(`<h3>Restaurar backup?</h3><div class="alert red"><b>Atenção:</b> esta operação substituirá os dados atuais pelos dados do arquivo selecionado.</div><p><b>Arquivo:</b> ${esc(f.name)}</p><p>Antes da restauração, o Porto Prime criará automaticamente uma cópia de segurança do banco atual.</p><button class=danger onclick="confirmRestoreBackup()">Sim, criar segurança e restaurar</button> <button onclick="closeModal()">Cancelar</button>`);window._restoreBackup=b}catch(e){input.value='';alert(e.message)}}
async function confirmRestoreBackup(){try{if(!window._restoreBackup)throw Error('Backup não carregado.');let r=await api('/backup/restore',{method:'POST',body:JSON.stringify(window._restoreBackup)});window._restoreBackup=null;closeModal();alert(`Backup restaurado com sucesso.\n\nCópia de segurança anterior: ${r.safety_backup||'criada'}\n\nO Porto Prime será recarregado.`);location.reload()}catch(e){alert(e.message)}}

async function usuarios(){if(me.role!=='Administrador')return '<div class="alert red">Somente Administrador.</div>';let u=await api('/users');return `<div class=panel><div class=toolbar><div><h3 style="margin:0">Usuários e permissões</h3><small class=muted>Controle individual das operações sensíveis.</small></div><button class=primary onclick="userForm()">+ Usuário</button></div><table><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Permissões</th><th>Status</th><th></th></tr>${u.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.role)}</td><td><small>${Object.entries(x.permissions||{}).filter(([k,v])=>v).map(([k])=>({discount:'Desconto',cancel_sale:'Cancelar venda',view_cost:'Ver custos',cash_move:'Mov. caixa',financial:'Financeiro',stock:'Estoque'}[k]||k)).join(' • ')||'Padrão do perfil'}</small></td><td>${x.active?'Ativo':'Inativo'}</td><td><button class="secondary mini" onclick='userForm(${JSON.stringify(x)})'>Editar</button></td></tr>`).join('')}</table></div>`}
const PERM_LABELS={discount:'Conceder desconto',cancel_sale:'Cancelar/estornar venda',view_cost:'Visualizar custos e lucro',cash_move:'Fazer sangria e suprimento',financial:'Baixar movimentações financeiras',stock:'Alterar estoque e produtos'};
function userForm(u=null){let role=u?.role||'Vendedor',defaults={Administrador:{discount:1,cancel_sale:1,view_cost:1,cash_move:1,financial:1,stock:1},Gerente:{discount:1,cancel_sale:1,view_cost:1,cash_move:1,financial:1,stock:1},Vendedor:{},Caixa:{cash_move:1},Estoquista:{view_cost:1,stock:1}},perms={...defaults[role],...(u?.permissions||{})};modal(`<h3>${u?'Editar':'Novo'} usuário</h3><label>Nome</label><input id=uname value="${esc(u?.name||'')}"><label>E-mail</label><input id=uemail value="${esc(u?.email||'')}">${u?'':'<label>Senha</label><input id=upass type=password>'}<label>Perfil</label><select id=urole>${['Administrador','Gerente','Vendedor','Caixa','Estoquista'].map(x=>`<option ${x===role?'selected':''}>${x}</option>`)}</select><div class=panel style="margin-top:12px"><b>Permissões individuais</b>${Object.entries(PERM_LABELS).map(([k,l])=>`<label class=checkline><input type=checkbox id="perm_${k}" ${perms[k]?'checked':''}> ${l}</label>`).join('')}</div>${u?`<label class=checkline><input id=uactive type=checkbox ${u.active?'checked':''}> Usuário ativo</label>`:''}<button class=primary onclick="saveUser(${u?.id||'null'})">Salvar</button>`)}
async function saveUser(id=null){let permissions={};Object.keys(PERM_LABELS).forEach(k=>permissions[k]=document.getElementById('perm_'+k).checked);let body={name:uname.value,email:uemail.value,role:urole.value,permissions,active:id?uactive.checked:true};if(id)await api('/users/'+id,{method:'PUT',body:JSON.stringify(body)});else{body.password=upass.value;await api('/users',{method:'POST',body:JSON.stringify(body)})}closeModal();render('usuarios')}
let sellerPerfMonth='';
function sellerMonthNow(){let d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function sellerMonthLabel(v){let [y,m]=String(v).split('-');return new Date(+y,+m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
function sellerPerfChangeMonth(v){sellerPerfMonth=v;render('metas-comissoes')}
function sellerProgressClass(v){return v>=100?'goal-done':v>=75?'goal-near':v>=40?'goal-mid':'goal-low'}
function sellerTargetForm(x){
  if(!['Administrador','Gerente'].includes(me.role))return;
  modal(`<h3>Meta e comissão</h3><p><b>${esc(x.name)}</b><br><small class=muted>${sellerMonthLabel(sellerPerfMonth)}</small></p><label>Meta mensal (R$)</label><input id=sellerTargetAmount type=number min=0 step=.01 value="${+x.target_amount||0}"><label>Comissão sobre vendas (%)</label><input id=sellerCommissionPct type=number min=0 max=100 step=.001 value="${+x.commission_percent||0}"><div class=alert>Comissão prevista = vendas finalizadas do mês × percentual configurado.</div><div style="margin-top:18px"><button class=primary onclick="saveSellerTarget(${x.user_id})">SALVAR META E COMISSÃO</button> <button onclick=closeModal()>Cancelar</button></div>`);
}
async function saveSellerTarget(userId){
  let target=+document.getElementById('sellerTargetAmount')?.value,pct=+document.getElementById('sellerCommissionPct')?.value;
  if(!Number.isFinite(target)||target<0)return toast('Informe uma meta válida.');
  if(!Number.isFinite(pct)||pct<0||pct>100)return toast('Informe uma comissão entre 0% e 100%.');
  try{await api('/seller-performance/'+userId+'/target',{method:'PUT',body:JSON.stringify({month:sellerPerfMonth,target_amount:target,commission_percent:pct})});closeModal();toast('Meta e comissão salvas.');render('metas-comissoes')}catch(e){toast(e.message)}
}
async function metasComissoes(){
  if(!sellerPerfMonth)sellerPerfMonth=sellerMonthNow();
  let r=await api('/seller-performance?month='+encodeURIComponent(sellerPerfMonth)),s=r.summary||{},rows=r.sellers||[],canEdit=['Administrador','Gerente'].includes(me.role);
  let progress=s.target_amount>0?s.sales_total/s.target_amount*100:0;
  return `<div class="seller-goal-hero"><div><span class=eyebrow>PORTO PRIME • EQUIPE COMERCIAL</span><h2>Metas e Comissões</h2><p>Acompanhe o desempenho mensal da equipe com base nas vendas finalizadas do PDV.</p></div><div class=seller-month-box><label>Mês de referência</label><input type=month value="${sellerPerfMonth}" onchange="sellerPerfChangeMonth(this.value)"></div></div>
  <div class="cards cards6 seller-goal-kpis">
    <div class=card><small>Vendas do mês</small><strong>${s.sales||0}</strong></div>
    <div class=card><small>Faturamento da equipe</small><strong>${money(s.sales_total)}</strong></div>
    <div class=card><small>Meta total</small><strong>${money(s.target_amount)}</strong></div>
    <div class=card><small>Atingimento</small><strong>${num(progress)}%</strong></div>
    <div class=card><small>Comissão prevista</small><strong>${money(s.commission_estimated)}</strong></div>
    <div class=card><small>Metas atingidas</small><strong>${s.achieved_count||0}</strong></div>
  </div>
  <div class=panel><div class=toolbar><div><h3 style="margin:0">Desempenho por vendedor</h3><small class=muted>${sellerMonthLabel(sellerPerfMonth)} • somente vendas FINALIZADAS entram no cálculo.</small></div>${canEdit?'<span class=pill>Administrador/Gerente pode alterar metas</span>':''}</div>
  <div class=scroll><table class=seller-goal-table><thead><tr><th>Vendedor</th><th>Vendas</th><th>Faturamento</th><th>Ticket médio</th><th>Meta</th><th>Atingimento</th><th>Falta</th><th>Comissão %</th><th>Comissão prevista</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
  ${rows.length?rows.map(x=>`<tr><td><b>${esc(x.name)}</b><br><small class=muted>${esc(x.role)}</small></td><td>${x.sales}</td><td><b>${money(x.sales_total)}</b></td><td>${money(x.average_ticket)}</td><td>${money(x.target_amount)}</td><td><div class=goal-progress><span style="width:${Math.min(100,+x.progress_percent||0)}%" class="${sellerProgressClass(+x.progress_percent||0)}"></span></div><small class="${x.achieved?'ok':'muted'}">${num(x.progress_percent)}%${x.achieved?' • META ATINGIDA':''}</small></td><td>${x.achieved?'—':money(x.remaining_amount)}</td><td>${num(x.commission_percent)}%</td><td><b>${money(x.commission_estimated)}</b></td>${canEdit?`<td><button class="secondary mini" onclick='sellerTargetForm(${JSON.stringify(x)})'>Editar</button></td>`:''}</tr>`).join(''):`<tr><td colspan="${canEdit?10:9}" class=empty>Nenhum vendedor disponível.</td></tr>`}
  </tbody></table></div></div>
  <div class=grid2><div class=panel><h3>Como funciona a meta</h3><p class=muted>A meta é definida para cada vendedor em cada mês. O percentual de atingimento compara o faturamento das vendas finalizadas com a meta cadastrada.</p></div><div class=panel><h3>Como funciona a comissão</h3><p class=muted>A comissão exibida é uma previsão: faturamento finalizado do vendedor × percentual de comissão. Vendas estornadas não entram no cálculo.</p></div></div>`;
}
async function auditoria(){if(!['Administrador','Gerente'].includes(me.role))return '<div class="alert red">Sem permissão.</div>';let a=await api('/audit');return `<div class=panel><div class=toolbar><div><h3 style="margin:0">Auditoria de ações</h3><small class=muted>Rastreabilidade de operações importantes do sistema.</small></div><input placeholder="Filtrar usuário, ação ou detalhe..." oninput="filterRows(this.value,'auditTable')" style="max-width:320px"></div><div class=scroll><table id=auditTable><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr>${a.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td><b>${esc(x.user_name||'Sistema')}</b></td><td>${esc(x.action)}</td><td>${esc(x.detail||'')}</td></tr>`).join('')}</table></div></div>`}

async function configuracoes(){
 if(me.role!=='Administrador')return '<div class="alert red">Somente o Administrador pode alterar as configurações do sistema.</div>';
 let x=await api('/settings'),c=x.company||{},v=x.sales||{},st=x.stock||{},sy=x.system||{};
 setTimeout(()=>{if(sy.theme==='dark')document.body.classList.add('dark-ui')},20);
 return `<div class=panel><div class=toolbar><div><span class=eyebrow>ADMINISTRAÇÃO</span><h3 style="margin:5px 0">Configurações do Porto Prime</h3><small class=muted>Personalize sua empresa e as regras gerais do sistema.</small></div><button class=primary onclick=saveSettings()>Salvar configurações</button></div></div>
 <div class=grid2>
 <div class=panel><h3>🏢 Dados da empresa</h3><div class=formgrid><div class=span2><label>Nome fantasia</label><input id=cfgTrade value="${esc(c.trade_name||'')}"></div><div class=span2><label>Razão social</label><input id=cfgLegal value="${esc(c.legal_name||'')}"></div><div><label>CNPJ / CPF</label><input id=cfgDoc value="${esc(c.doc||'')}"></div><div><label>Inscrição Estadual</label><input id=cfgIe value="${esc(c.ie||'')}"></div><div><label>Telefone</label><input id=cfgPhone value="${esc(c.phone||'')}"></div><div><label>WhatsApp</label><input id=cfgWhatsapp value="${esc(c.whatsapp||'')}"></div><div class=span2><label>E-mail</label><input id=cfgEmail value="${esc(c.email||'')}"></div><div class=span2><label>Endereço</label><input id=cfgAddress value="${esc(c.address||'')}"></div><div><label>Cidade</label><input id=cfgCity value="${esc(c.city||'')}"></div><div><label>UF</label><input id=cfgUf maxlength=2 value="${esc(c.uf||'')}"></div></div><div class=company-logo-config><div class=company-logo-preview id=cfgLogoPreview>${c.logo_data?`<img src="${c.logo_data}" alt="Logomarca">`:'<span>Sem logomarca</span>'}</div><div><b>Logomarca da empresa</b><small>PNG ou JPG • recomendado até 500 KB</small><input id=cfgLogoFile type=file accept="image/png,image/jpeg" style="display:none" onchange=chooseCompanyLogo(this)><button class=secondary onclick="cfgLogoFile.click()">Selecionar imagem</button> <button onclick=removeCompanyLogo()>Remover logo</button><label class=checkline><input id=cfgShowLogoPdv type=checkbox ${c.show_logo_pdv!==false?'checked':''}> Exibir logomarca no PDV</label></div></div></div>
 <div class=panel><h3>🧾 Vendas e PDV</h3><label>Desconto máximo para gerente (%)</label><input id=cfgDiscount type=number min=0 max=100 step=.1 value="${v.max_discount??10}"><label>Mensagem no comprovante</label><textarea id=cfgReceipt rows=3>${esc(v.receipt_message||'Obrigado pela preferência!')}</textarea><label>Mensagem no rodapé do orçamento</label><textarea id=cfgQuoteMsg rows=3>${esc(v.quote_message||'Orçamento sujeito à disponibilidade de estoque e validade informada.')}</textarea><label class=checkline><input id=cfgRequireCash type=checkbox ${v.require_open_cash!==false?'checked':''}> Exigir caixa aberto para realizar vendas</label><label class=checkline><input id=cfgPrint type=checkbox ${v.auto_print?'checked':''}> Imprimir comprovante automaticamente</label></div>
 <div class=panel><h3>📦 Estoque</h3><label>Estoque mínimo padrão</label><input id=cfgMinStock type=number min=0 step=.001 value="${st.default_min??0}"><label class=checkline><input id=cfgNegative type=checkbox ${st.allow_negative?'checked':''}> Permitir estoque negativo</label><label class=checkline><input id=cfgLowAlert type=checkbox ${st.low_stock_alert!==false?'checked':''}> Exibir alertas de estoque baixo</label><div class="alert yellow">Na 2.5 esta regra é aplicada diretamente pelo PDV.</div></div>
 <div class=panel><h3>🖥️ Sistema e segurança</h3><label>Tema</label><select id=cfgTheme><option value=light ${sy.theme!=='dark'?'selected':''}>Claro</option><option value=dark ${sy.theme==='dark'?'selected':''}>Escuro</option></select><label>Nome exibido do sistema</label><input id=cfgSystemName value="${esc(sy.name||'Porto Prime')}"><div class=alert green><b>Porto Prime 4.1.12</b><br>Banco central local, funcionamento offline e acesso em rede local.</div><button class=secondary onclick="showNetworkInfo()">🌐 Ver acesso em rede</button> <button onclick="showLicenseInfo()">🔐 Ver licença</button> <button onclick="render('relatorios')">Abrir Backup e Restauração</button></div>
 <div class="panel porto-support-settings"><h3>✉ Contato e suporte</h3><p class=muted>Fale com a equipe Porto Prime para suporte, dúvidas ou informações comerciais.</p><div class=porto-support-links><a href="mailto:portoprime.gc@proton.me"><span>Contato principal</span><b>portoprime.gc@proton.me</b></a><a href="mailto:portoprime.ce@gmail.com"><span>Contato alternativo</span><b>portoprime.ce@gmail.com</b></a></div></div>
 </div>`
}

async function showLicenseInfo(){try{let r=await fetch('/api/license/status',{cache:'no-store'}),x=await r.json(),l=x.license||{},demo=x.accessMode==='trial',validade=l.expiresAt?(demo?new Date(l.expiresAt).toLocaleString('pt-BR'):new Date(l.expiresAt+'T12:00:00').toLocaleDateString('pt-BR')):'Sem vencimento';modal(`<h3>🔐 Licença Porto Prime</h3><div class="alert ${demo?'yellow':'green'}"><b>${demo?'DEMONSTRAÇÃO GRATUITA':'LICENÇA ATIVA'}</b>${demo?`<br>${x.daysRemaining} ${x.daysRemaining===1?'dia restante':'dias restantes'}`:''}</div><p><b>Cliente:</b> ${esc(l.customer||'—')}</p><p><b>Documento:</b> ${esc(l.document||'—')}</p><p><b>Plano:</b> ${esc(l.plan||'Comercial')}</p><p><b>Validade:</b> ${validade}</p><p><b>ID da máquina:</b> <code>${esc(x.machineId||'')}</code></p>${demo?'<a class="primary" href="mailto:portoprime.gc@proton.me?subject=Ativar%20Plano%20Comercial">Ativar Plano Comercial</a> ':''}<button onclick=closeModal()>Fechar</button>`)}catch(e){toast(e.message)}}

async function showNetworkInfo(){try{let n=await api('/system/network'),links=(n.urls||[]).map(u=>`<div class=sale-item><span>${esc(u)}</span><button class=secondary onclick="navigator.clipboard?.writeText('${u}');toast('Endereço copiado')">Copiar</button></div>`).join('');modal(`<h3>🌐 Porto Prime em Rede</h3><p>Este computador é o <b>servidor principal</b>. Nos outros computadores conectados à mesma rede, abra um dos endereços abaixo no navegador.</p>${links||'<div class=alert yellow>Nenhum endereço de rede foi encontrado. Verifique a conexão Wi-Fi/cabo.</div>'}<div class=alert yellow><b>Importante:</b> o Porto Prime precisa permanecer aberto neste computador. O Firewall do Windows pode pedir autorização; permita somente em redes privadas.</div><button onclick=closeModal()>Fechar</button>`)}catch(e){toast(e.message)}}

function chooseCompanyLogo(input){let f=input.files?.[0];if(!f)return;if(!['image/png','image/jpeg'].includes(f.type))return toast('Use uma imagem PNG ou JPG.');if(f.size>1024*1024)return toast('A imagem deve ter no máximo 1 MB.');let r=new FileReader();r.onload=()=>{let img=new Image();img.onload=()=>{let maxW=600,maxH=240,scale=Math.min(1,maxW/img.width,maxH/img.height),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*scale));cv.height=Math.max(1,Math.round(img.height*scale));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);window._cgCompanyLogo=cv.toDataURL('image/png',.92);cfgLogoPreview.innerHTML=`<img src="${window._cgCompanyLogo}" alt="Logomarca">`;toast('Logomarca pronta. Clique em Salvar configurações.')};img.src=r.result};r.readAsDataURL(f)}
function removeCompanyLogo(){window._cgCompanyLogo='';let e=document.getElementById('cfgLogoPreview');if(e)e.innerHTML='<span>Sem logomarca</span>';let f=document.getElementById('cfgLogoFile');if(f)f.value='';toast('Logomarca removida. Clique em Salvar configurações.')}
async function saveSettings(){
 let current=await api('/settings'),data={company:{trade_name:cfgTrade.value,legal_name:cfgLegal.value,doc:cfgDoc.value,ie:cfgIe.value,phone:cfgPhone.value,whatsapp:cfgWhatsapp.value,email:cfgEmail.value,address:cfgAddress.value,city:cfgCity.value,uf:cfgUf.value.toUpperCase(),logo_data:window._cgCompanyLogo!==undefined?window._cgCompanyLogo:(current.company?.logo_data||''),show_logo_pdv:cfgShowLogoPdv.checked},sales:{max_discount:+cfgDiscount.value||0,receipt_message:cfgReceipt.value,quote_message:cfgQuoteMsg.value,require_open_cash:cfgRequireCash.checked,auto_print:cfgPrint.checked},stock:{default_min:+cfgMinStock.value||0,allow_negative:cfgNegative.checked,low_stock_alert:cfgLowAlert.checked},system:{theme:cfgTheme.value,name:cfgSystemName.value||'Porto Prime'}};
 try{await api('/settings',{method:'PUT',body:JSON.stringify(data)});document.body.classList.toggle('dark-ui',data.system.theme==='dark');window._cgAutoPrint=!!data.sales.auto_print;toast('Configurações salvas com sucesso.')}catch(e){toast(e.message)}
}

function modal(html){document.body.insertAdjacentHTML('beforeend',`<div class=modalbox id=modal><div class=modalinner>${html}</div></div>`)}function closeModal(){document.getElementById('modal')?.remove()}
licenseStatus().then(async ok=>{
  if(!ok)return;
  try{
    const r=await fetch('/api/auth/recovery-info',{cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(r.ok){
      if(loginEmail)loginEmail.value=j.email||'master';
      const email=document.getElementById('recoveryEmail'),machine=document.getElementById('recoveryMachine'),msg=document.getElementById('recoveryMsg');
      if(email)email.value=j.email||'master';
      if(machine)machine.value=j.machineId||'';
      if(msg){msg.className='ok';msg.textContent='Defina abaixo a nova senha de acesso.'}
    }
  }catch{}
  if(token)start().catch(()=>logout());
}).catch(e=>showActivation({error:'Não foi possível verificar a licença: '+e.message}));

// Porto Prime 4.1.12 — tabela de preços do catálogo.
let priceTableProducts=[],priceTableMode='retail';
function pricePromotion(p,today=new Date().toISOString().slice(0,10)){
  if(!(+p.promo>0))return {label:'Sem promoção',active:false};
  const start=String(p.promo_start||'').slice(0,10),end=String(p.promo_end||'').slice(0,10);
  if(start&&end&&start>end)return {label:'Período inválido',active:false};
  if(start&&today<start)return {label:'Agendada',active:false};
  if(end&&today>end)return {label:'Encerrada',active:false};
  return {label:'Ativa',active:true};
}
function priceTableMarkup(rows,mode){
  const wholesale=mode==='wholesale';
  return `<table><thead><tr><th>Código</th><th>Produto</th><th>Unidade</th><th>${wholesale?'Atacado':'Varejo'}</th><th>Promoção</th>${wholesale?'<th>Qtd. mínima</th>':''}<th>Validade / situação</th></tr></thead><tbody>${rows.length?rows.map(p=>{
    const promo=pricePromotion(p),dates=[p.promo_start,p.promo_end].map(d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Sem limite');
    return `<tr><td>${esc(p.code)}</td><td><b>${esc(p.name)}</b><br><small class=muted>${esc(p.category||'')}</small></td><td>${esc(p.unit||'UN')}</td><td>${wholesale&&!(+p.wholesale>0)?'Não cadastrado':money(p[mode])}</td><td>${+p.promo>0?`<b class="${promo.active?'ok':'muted'}">${money(p.promo)}</b>`:'—'}</td>${wholesale?`<td>${+p.wholesale>0?num(p.wholesale_min):'—'}</td>`:''}<td>${esc(promo.label)}${+p.promo>0?`<br><small class=muted>${dates.join(' até ')}</small>`:''}</td></tr>`;
  }).join(''):`<tr><td colspan=${wholesale?7:6}>Nenhum produto encontrado.</td></tr>`}</tbody></table>`;
}
function filteredPriceProducts(){
  const q=(document.getElementById('priceTableSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
  return priceTableProducts.filter(p=>[p.code,p.name,p.category,p.ean].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
}
function refreshPriceTable(){
  priceTableMode=document.getElementById('priceTableMode')?.value==='wholesale'?'wholesale':'retail';
  const rows=filteredPriceProducts();
  document.getElementById('priceTableContent').innerHTML=priceTableMarkup(rows,priceTableMode);
  document.getElementById('priceTableCount').textContent=rows.length+' produto(s)';
}
async function tabelaPrecos(){
  priceTableProducts=await api('/products');
  return `<div class=panel><div class=toolbar><div><span class=eyebrow>PRODUTOS</span><h3>Tabela de preços</h3></div><button class=secondary onclick="render('produtos')">Voltar aos produtos</button><button class=primary onclick="printPriceTable()">Imprimir / Salvar PDF</button></div><div class=row><div class=field><label for=priceTableMode>Escolha a tabela</label><select id=priceTableMode onchange="refreshPriceTable()"><option value=retail ${priceTableMode==='retail'?'selected':''}>Varejo</option><option value=wholesale ${priceTableMode==='wholesale'?'selected':''}>Atacado</option></select></div><div class=field><label for=priceTableSearch>Buscar produto</label><input id=priceTableSearch placeholder="Nome, código, EAN ou categoria" oninput="refreshPriceTable()"></div><span class=pill id=priceTableCount>${priceTableProducts.length} produto(s)</span></div><p class=muted>A promoção aparece ao lado do preço selecionado. Confira a situação e a validade antes de vender.</p><div class=scroll id=priceTableContent>${priceTableMarkup(priceTableProducts,priceTableMode)}</div></div>`;
}
async function printPriceTable(){
  const rows=filteredPriceProducts(),mode=priceTableMode,w=window.open('','_blank','width=1000,height=850');
  if(!w)return toast('Permita a abertura da janela de impressão.');
  try{
    const cfg=await api('/settings');
    w.document.write(`<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>Tabela de preços — ${mode==='wholesale'?'Atacado':'Varejo'}</title>${printBaseStyles()}</head><body><div class=doc>${companyBlock(cfg.company||{})}<h2>Tabela de preços — ${mode==='wholesale'?'Atacado':'Varejo'}</h2><p>Emitida em ${new Date().toLocaleString('pt-BR')} • ${rows.length} produto(s)</p>${priceTableMarkup(rows,mode)}<p>Preços promocionais sujeitos à validade indicada. Valores em reais.</p><button class=no-print onclick="window.print()">Imprimir / Salvar PDF</button></div></body></html>`);
    w.document.close();w.focus();
  }catch(e){w.close();toast(e.message)}
}