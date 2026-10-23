const fs=require('fs');
const assert=require('assert');
const server=fs.readFileSync('src/server.js','utf8');
const boot=server.slice(server.indexOf('async function boot(){'));
assert(boot.startsWith('async function boot(){'), 'boot não localizado');
for(const fn of ['applyEmergencyMasterUserReset','applyEmergencyMasterPasswordReset','applyEmergencyMasterReset446','applyEmergencyMasterReset447']) {
  assert(!new RegExp('await\\s+'+fn+'\\s*\\(').test(boot),'Reset legado ainda chamado na inicialização: '+fn);
}
const match=server.match(/app\\.post\\('\/api\/auth\/recover-admin',[^\n]+/);
assert(match,'Rota de recuperação ausente');
assert(match[0].includes('status(403)'),'A rota de recuperação deve negar redefinição não autenticada');
assert(!match[0].includes('password_hash'),'A rota não deve atualizar senha');
assert(server.includes("/api/auth/change-initial-password"),'Troca inicial autenticada não preservada');
console.log('OK: recuperação administrativa insegura bloqueada e resets de inicialização desativados.');
