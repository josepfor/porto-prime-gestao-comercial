const fs=require('fs'),assert=require('assert');
const server=fs.readFileSync('src/server.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const boot=server.slice(server.indexOf('async function boot(){'));
for(const fn of ['applyEmergencyMasterUserReset','applyEmergencyMasterPasswordReset','applyEmergencyMasterReset446','applyEmergencyMasterReset447'])assert(!boot.includes('await '+fn+'('),'Reset inseguro em boot: '+fn);
const start=server.indexOf("app.post('/api/auth/recover-admin'"),end=server.indexOf("app.post('/api/auth/change-initial-password'",start);
assert(start>=0&&end>start,'Rota de recuperação ausente');
const recovery=server.slice(start,end);
for(const part of ['recoveryToken','timingSafeEqual','recoveryFailures>=5','Date.now()>recoveryAuthorized.until','recoveryAuthorized.used=true',"saveLogicalBackup('PASSWORD-RECOVERY')",'password.length<12'])assert(recovery.includes(part),'Falta proteção: '+part);
assert(!recovery.includes('machineId!==MACHINE_ID'),'Machine ID não deve autorizar recuperação');
assert(html.includes('id="recoveryToken"')&&app.includes('recoveryToken'),'Interface não usa autorização');
console.log('OK: recuperação 5.1 com autorização temporária e proteção anti-regressão.');

const vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const bcrypt=require('bcryptjs');
(async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(fs.readFileSync(path.join(__dirname,'../src/schema.sql'),'utf8'));
    const originalHash=await bcrypt.hash('Original-password-123',4);
    const token=crypto.randomBytes(32).toString('hex');
    const password='New-password-12345';
    const query=async(client,sql,params=[])=>{
      const result=await client.query(sql,params);
      return {...result,rowCount:result.rows?.length||result.affectedRows||0};
    };
    const current=()=>db.query('SELECT password_hash FROM users WHERE id=1');
    const unchanged=async()=>assert.equal((await current()).rows[0].password_hash,originalHash);
    const start=server.indexOf('const recoveryToken=');
    const end=server.indexOf("app.post('/api/auth/change-initial-password'",start);
    assert(start>=0&&end>start);
    const localGuard=server.split('\n').find(line=>line.startsWith('const isLocalLoginRequest='));
    assert(localGuard,'Verificação de origem local ausente');
    const source=localGuard+'\nconst localRequest=isLocalLoginRequest;\n'+server.slice(start,end);
    async function scenario(options={}){
      await db.exec('TRUNCATE audit_logs,users RESTART IDENTITY CASCADE');
      await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','admin@example.invalid',$1,'Administrador')",[originalHash]);
      const routes={};let backups=0,clock=1000;
      const env={PORTO_PRIME_RECOVERY_TOKEN:options.token??token};
      const context=vm.createContext({
        crypto,bcrypt,process:{env},Date:{now:()=>clock},
        pool:{query:(sql,params)=>query(db,sql,params)},
        tx:fn=>db.transaction(client=>fn({query:(sql,params)=>query(client,sql,params)})),
        saveLogicalBackup:async kind=>{
          assert.equal(kind,'PASSWORD-RECOVERY');backups++;
          if(options.backupFailure)throw Error('backup indisponível');
        },
        audit:async(c,id,action,detail)=>{
          if(options.auditFailure)throw Error('auditoria indisponível');
          await c.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[id,action,detail]);
        },
        app:{post:(url,handler)=>{routes[url]=handler}}
      });
      vm.runInContext(source,context);
      assert(!('PORTO_PRIME_RECOVERY_TOKEN' in env),'Token deve sair do ambiente');
      return {
        advance:ms=>{clock+=ms},
        backups:()=>backups,
        call:async(body={},ip='127.0.0.1')=>{
          let status=200,payload;
          await routes['/api/auth/recover-admin']({ip,body:{email:'admin@example.invalid',password,recoveryToken:token,...body}},{
            status(n){status=n;return this},json(data){payload=data}
          });
          return {status,payload};
        }
      };
    }
    let x=await scenario({token:''});
    assert.equal((await x.call()).status,403);await unchanged();
    x=await scenario();
    assert.equal((await x.call({},'192.168.1.10')).status,403);await unchanged();
    assert.equal(x.backups(),0);
    x=await scenario();x.advance(15*60*1000+1);
    assert.equal((await x.call()).status,403);await unchanged();
    x=await scenario();
    for(let i=0;i<5;i++)assert.equal((await x.call({recoveryToken:'invalid'})).status,403);
    assert.equal((await x.call()).status,403);await unchanged();
    assert.equal(x.backups(),0);
    x=await scenario();
    assert.equal((await x.call({password:'short'})).status,400);
    assert.equal((await x.call()).status,403);await unchanged();
    x=await scenario();
    assert.equal((await x.call({email:'missing@example.invalid'})).status,400);await unchanged();
    x=await scenario({backupFailure:true});
    assert.equal((await x.call()).status,400);await unchanged();
    assert.equal((await x.call()).status,403);
    x=await scenario({auditFailure:true});
    assert.equal((await x.call()).status,400);await unchanged();
    assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,0);
    x=await scenario();
    const results=await Promise.all([x.call(),x.call()]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,403],'Token concorrente deve ser aceito uma única vez');
    assert.equal(x.backups(),1);
    assert(await bcrypt.compare(password,(await current()).rows[0].password_hash));
    const logs=(await db.query('SELECT action,detail FROM audit_logs')).rows;
    assert.equal(logs.length,1);
    assert(!JSON.stringify(logs).includes(token),'Não registrar token na auditoria');
    assert.equal((await x.call()).status,403);
    console.log('OK: recuperação real com PGlite/bcrypt: rede, expiração, limite, uso único concorrente, backup e rollback da auditoria.');
  }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
