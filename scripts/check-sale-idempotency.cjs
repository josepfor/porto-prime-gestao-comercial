const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const server = fs.readFileSync('src/server.js', 'utf8');
  const schema = fs.readFileSync('src/schema.sql', 'utf8');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const staticChecks = [
    [schema.includes('ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT;'), 'nullable idempotency key migration exists'],
    [schema.includes('ALTER TABLE sales ADD COLUMN IF NOT EXISTS request_hash TEXT;'), 'request fingerprint migration exists'],
    [schema.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;'), 'partial unique index protects keyed requests'],
    [server.includes('function saleRequestFingerprint(req)'), 'server fingerprints sale payloads'],
    [server.includes("SELECT * FROM sales WHERE idempotency_key=$1"), 'server checks for an existing request'],
    [server.includes('existing.request_hash!==requestHash'), 'same key cannot be reused for a different payload'],
    [server.includes('idempotent_replay:true'), 'server marks replayed results'],
    [server.includes('res.status(e.statusCode||400)'), 'server preserves HTTP conflict status'],
    [!server.includes('SELECT s.*,u.name seller,c.name customer FROM sales'), 'sales list does not expose internal request hashes'],
    [app.includes('let pdvPendingRequestId=null;'), 'client retains request id while the app remains open'],
    [app.includes('request_id:requestId'), 'client sends request id'],
    [app.includes('AbortSignal.timeout(30000)'), 'client bounds response wait without claiming server cancellation'],
    [app.includes('e.status=r.status'), 'client preserves HTTP status for safe retry handling'],
  ];
  for (const [ok, message] of staticChecks) assert.ok(ok, message);

  // Exercise the real PGlite schema/migration and unique constraint in an isolated in-memory database.
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    const migrationMarker = '-- Porto Prime 4.4.8 - idempotência de finalização de vendas (não altera registros existentes)';
    const migrationAt = schema.indexOf(migrationMarker);
    assert.notEqual(migrationAt, -1, 'versioned migration marker exists');
    const baseSchema = schema.slice(0, migrationAt);
    const migration = schema.slice(migrationAt);
    await db.exec(baseSchema);

    const user = await db.query("INSERT INTO users(name,email,password_hash,role) VALUES('Teste Integridade','integridade@example.invalid','hash','Administrador') RETURNING id");
    const userId = user.rows[0].id;
    const historical = await db.query('INSERT INTO sales(user_id,total,payment_method) VALUES($1,125.50,\'Dinheiro\') RETURNING id', [userId]);
    const historicalId = historical.rows[0].id;

    await db.exec(migration);
    await db.exec(migration); // repeat migration to verify IF NOT EXISTS / ON CONFLICT behavior
    const oldSale = await db.query('SELECT id,total,idempotency_key,request_hash FROM sales WHERE id=$1', [historicalId]);
    assert.equal(Number(oldSale.rows[0].total), 125.5, 'historical sale amount is preserved');
    assert.equal(oldSale.rows[0].idempotency_key, null, 'historical sale receives no synthetic request key');
    assert.equal(oldSale.rows[0].request_hash, null, 'historical sale receives no synthetic request hash');

    await db.query("INSERT INTO sales(user_id,total,payment_method,idempotency_key,request_hash) VALUES($1,49.90,'Dinheiro','test-request-key-0001','hash-a')", [userId]);
    await assert.rejects(
      db.query("INSERT INTO sales(user_id,total,payment_method,idempotency_key,request_hash) VALUES($1,49.90,'Dinheiro','test-request-key-0001','hash-a')", [userId]),
      /unique|duplicate/i,
      'database rejects a duplicate idempotency key'
    );
    const count = await db.query("SELECT count(*)::int AS count FROM sales WHERE idempotency_key='test-request-key-0001'");
    assert.equal(count.rows[0].count, 1, 'only one sale exists for the request key');

    let rolledBackId;
    await assert.rejects(db.transaction(async tx => {
      const sale = await tx.query("INSERT INTO sales(user_id,total,payment_method,idempotency_key,request_hash) VALUES($1,10,'Dinheiro','test-rollback-key-0001','hash-r') RETURNING id", [userId]);
      rolledBackId = sale.rows[0].id;
      throw new Error('simulated failure after sale insert');
    }), /simulated failure/);
    const rolledBack = await db.query('SELECT count(*)::int AS count FROM sales WHERE id=$1', [rolledBackId]);
    assert.equal(rolledBack.rows[0].count, 0, 'transaction rollback leaves no partial sale row');

    console.log('OK: static safeguards + PGlite migration, historical-data preservation, unique-key and rollback tests.');
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
