const fs = require('fs');
const assert = require('assert');
const server = fs.readFileSync('src/server.js', 'utf8');
const boot = server.slice(server.indexOf('async function boot(){'));
assert(boot.startsWith('async function boot(){'), 'boot não localizado');
for (const fn of ['applyEmergencyMasterUserReset','applyEmergencyMasterPasswordReset','applyEmergencyMasterReset446','applyEmergencyMasterReset447']) {
  assert(!boot.includes('await ' + fn + '('), 'Reset legado chamado na inicialização: ' + fn);
}
const start = server.indexOf("app.post('/api/auth/recover-admin'");
const end = server.indexOf("app.post('/api/auth/change-initial-password'", start);
assert(start !== -1 && end > start, 'Rota de recuperação não localizada');
const recovery = server.slice(start, end);
assert(recovery.includes('status(403)'), 'Recuperação insegura não foi bloqueada');
assert(!recovery.includes('password_hash'), 'Rota de recuperação ainda altera a senha');
assert(server.includes("/api/auth/change-initial-password"), 'Troca inicial autenticada ausente');
console.log('OK: recuperação insegura bloqueada e resets de inicialização desativados.');
