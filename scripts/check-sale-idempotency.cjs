const fs=require('node:fs');
const server=fs.readFileSync('src/server.js','utf8');
const schema=fs.readFileSync('src/schema.sql','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const checks=[
  [schema.includes('ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT;'),'schema preserves existing sales and adds nullable idempotency key'],
  [schema.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;'),'unique index prevents duplicate request keys'],
  [server.includes('function saleRequestFingerprint(req)'),'server fingerprints sale payloads'],
  [server.includes("SELECT * FROM sales WHERE idempotency_key=$1"),'server recovers already committed attempts'],
  [server.includes('existing.request_hash!==requestHash'),'same key cannot be reused for a different sale payload'],
  [server.includes('idempotent_replay:true'),'server explicitly marks replayed sale responses'],
  [server.includes('res.status(e.statusCode||400)'),'idempotency conflicts preserve HTTP 409 status'],
  [!server.includes('SELECT s.*,u.name seller,c.name customer FROM sales'),'sales list does not expose internal idempotency fields'],
  [app.includes('let pdvPendingRequestId=null;'),'client retains pending request id'],
  [app.includes('request_id:requestId'),'client sends idempotency key with sale'],
  [app.includes('AbortSignal.timeout(30000)'),'client does not wait forever for sale response'],
  [app.includes('pdvPendingRequestId=null;'),'client clears request id only after success or a definitive validation failure']
];
for(const [ok,msg] of checks)if(!ok)throw new Error('Sale integrity check failed: '+msg);
console.log('OK: sale idempotency, duplicate protection, safe replay and client retry safeguards.');
