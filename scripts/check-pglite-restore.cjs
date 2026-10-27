// Executa a rota de restauração real com o esquema completo e PGlite em memória.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'porto-restore-'));
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../src/schema.sql'), 'utf8'));
    const routes = {};
    const context = vm.createContext({
      crypto, fs, path, console, APP_VERSION: 'test',
      process: { env: { ELECTRON_DATA_DIR: path.join(dir, 'db') }, cwd: () => dir },
      pool: { query: (sql, params) => db.query(sql, params) },
      tx: fn => db.transaction(client => fn(client)),
      auth: () => {}, roles: () => () => {}, audit: async () => {},
      app: {
        get: (url, ...handlers) => { routes[url] = handlers.at(-1); },
        post: (url, ...handlers) => { routes[url] = handlers.at(-1); }
      }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
    const start = source.indexOf('const BACKUP_TABLES=');
    const end = source.indexOf("\napp.use('/api'", start);
    assert(start >= 0 && end > start, 'Bloco real de backup precisa ser encontrado');
    vm.runInContext(source.slice(start, end) +
      '\nglobalThis.backupTest={buildLogicalBackup,backupDigest,BACKUP_TABLES};', context);
    const api = context.backupTest;
    const call = async body => {
      let status = 200, payload;
      await routes['/api/backup/restore']({ body, user: { id: 1 } }, {
        status(code) { status = code; return this; },
        json(value) { payload = value; }
      });
      return { status, payload };
    };
    const clone = x => JSON.parse(JSON.stringify(x));
    const signed = x => { x.integrity_sha256 = api.backupDigest(x); return x; };
    const snapshot = async () => JSON.stringify((await api.buildLogicalBackup()).tables);
    await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','test@example.invalid','test','Administrador')");
    await db.query("INSERT INTO products(id,code,name,stock,retail) VALUES(42,'TEST','Produto teste',7,12.50)");
    await db.query("INSERT INTO customers(id,name) VALUES(1,'Cliente teste')");
    await db.query("INSERT INTO sales(id,customer_id,user_id,total) VALUES(1,1,1,25)");
    await db.query("INSERT INTO sale_items(id,sale_id,product_id,qty,unit_price,cost) VALUES(1,1,42,2,12.50,5)");
    const backup = clone(await api.buildLogicalBackup());
    const original = await snapshot();
    let bad = clone(backup);
    bad.tables.products[0].name = 'Adulterado';
    assert.equal((await call(bad)).status, 400, 'Hash alterado deve ser rejeitado');
    assert.equal(await snapshot(), original);
    bad = clone(backup);
    bad.tables.products[0].unknown_column = true;
    assert.equal((await call(signed(bad))).status, 400, 'Coluna inválida deve ser rejeitada');
    assert.equal(await snapshot(), original);
    bad = clone(backup);
    bad.tables.sale_items[0].qty = null;
    assert.equal((await call(signed(bad))).status, 400, 'Falha de constraint deve reverter a transação');
    assert.equal(await snapshot(), original, 'Rollback deve preservar todas as tabelas');
    vm.runInContext('globalThis.originalSave=saveLogicalBackup; saveLogicalBackup=async()=>{throw Error("disco indisponível")}', context);
    assert.equal((await call(backup)).status, 400, 'Backup preventivo obrigatório');
    assert.equal(await snapshot(), original);
    vm.runInContext('saveLogicalBackup=originalSave', context);
    await db.query("UPDATE products SET name='Alterado',stock=99 WHERE id=42");
    const result = await call(backup);
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.equal(await snapshot(), original, 'Restauração completa deve reproduzir todas as tabelas');
    assert(fs.existsSync(path.join(dir, 'backups', result.payload.safety_backup)));
    const next = await db.query("INSERT INTO products(code,name) VALUES('NEXT','Próximo') RETURNING id");
    assert(Number(next.rows[0].id) > 42, 'Sequência deve continuar após IDs restaurados');
    console.log('OK: rota real, esquema completo, hash, colunas, rollback, backup preventivo, restauração e sequência.');
  } finally {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
