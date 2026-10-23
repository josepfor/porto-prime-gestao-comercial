// Integração com PGlite real: transações de restauração não podem deixar dados parciais.
const assert=require('node:assert/strict');
(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE restore_test(id integer PRIMARY KEY, name text NOT NULL);');
  await db.query('INSERT INTO restore_test (id,name) VALUES (1,$1)',['original']);
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('TRUNCATE restore_test;');
   await tx.query('INSERT INTO restore_test(id,name) VALUES (2,$1)',['novo']);
   throw Error('falha simulada durante restauração');
  }),/falha simulada/);
  let rows=(await db.query('SELECT id,name FROM restore_test ORDER BY id')).rows;
  assert.deepEqual(rows,[{id:1,name:'original'}],'Rollback precisa preservar dados anteriores');
  await db.transaction(async tx=>{
   await tx.exec('TRUNCATE restore_test;');
   await tx.query('INSERT INTO restore_test(id,name) VALUES (3,$1)',['restaurado']);
  });
  rows=(await db.query('SELECT id,name FROM restore_test ORDER BY id')).rows;
  assert.deepEqual(rows,[{id:3,name:'restaurado'}],'Commit precisa persistir nova versão');
  console.log('OK: PGlite real preserva dados no rollback e confirma restauração no commit.');
 }finally{await db.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
