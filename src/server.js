import {nextProductCode} from './product-codes.js';
import express from 'express'; import os from 'os'; import fs from 'fs'; import crypto from 'crypto'; import * as XLSX from 'xlsx'; import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import path from 'path'; import { fileURLToPath } from 'url'; import {pool,initDb,tx} from './db.js'; import {createTrialManager} from './trial-license.js'; import {getManagementReport,validateManagementPeriod} from './management-report.js'; import {getSellerPerformance,validateMonthKey} from './seller-performance.js'; import {getStockIntelligence} from './stock-intelligence.js';
const app=express(), PORT=process.env.PORT||3000, HOST=process.env.HOST||'127.0.0.1', SECRET=process.env.JWT_SECRET||crypto.randomBytes(32).toString('hex'); const __dirname=path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).version; const publicDir=path.join(__dirname,'..','public'); app.disable('x-powered-by'); app.use(express.json({limit:'50mb'})); app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next()}); app.use((req,res,next)=>{if(req.path==='/'||req.path.endsWith('.html'))res.set('Cache-Control','no-store, no-cache, must-revalidate');next()}); app.use(express.static(publicDir,{etag:true,lastModified:true,maxAge:'1h',setHeaders:(res,file)=>{if(file.includes(path.sep+'assets'+path.sep))res.setHeader('Cache-Control','public, max-age=604800')}}));
// Porto Prime 4.1.4 - Licenciamento offline assinado (Ed25519) e demonstração de 7 dias
const LICENSE_PUBLIC_KEY=`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAbZbg2eDV1nH2KTVbO6pcNt920IbcQHDo4uLD6tx6O78=
-----END PUBLIC KEY-----`;
const LICENSE_DIR=process.env.PORTO_PRIME_LICENSE_DIR||process.env.ELECTRON_DATA_DIR||path.join(process.cwd(),'.porto-prime');
const LICENSE_FILE=path.join(LICENSE_DIR,'porto-prime.license');
const MACHINE_ID=String(process.env.PORTO_PRIME_MACHINE_ID||crypto.createHash('sha256').update('PORTO-PRIME|'+os.hostname()+'|'+process.platform+'|'+process.arch).digest('hex').slice(0,24)).toUpperCase();
const trialManager=createTrialManager({directory:LICENSE_DIR,machineId:MACHINE_ID});
const b64urlDecode=x=>Buffer.from(String(x||'').replace(/-/g,'+').replace(/_/g,'/'),'base64');
function verifyLicenseKey(key){
  try{
    let parts=String(key||'').trim().split('.'); if(parts.length!==2)throw Error('Formato de licença inválido.');
    let payloadBytes=b64urlDecode(parts[0]),sig=b64urlDecode(parts[1]);
    if(!crypto.verify(null,payloadBytes,LICENSE_PUBLIC_KEY,sig))throw Error('Assinatura da licença inválida.');
    let data=JSON.parse(payloadBytes.toString('utf8'));
    if(data.product!=='PORTO_PRIME'||data.v!==1)throw Error('Licença não pertence ao Porto Prime.');
    if(String(data.machineId||'').toUpperCase()!==MACHINE_ID)throw Error('Esta licença pertence a outro computador.');
    if(data.expiresAt&&Date.now()>new Date(data.expiresAt+'T23:59:59').getTime())throw Error('Licença expirada.');
    return {valid:true,data};
  }catch(e){return {valid:false,error:e.message||'Licença inválida.'}}
}
let licenseCache={stamp:'',result:null};
function currentLicense(){
  try{
    const st=fs.statSync(LICENSE_FILE),stamp=`${st.mtimeMs}:${st.size}`;
    if(licenseCache.stamp===stamp&&licenseCache.result)return licenseCache.result;
    const result=verifyLicenseKey(fs.readFileSync(LICENSE_FILE,'utf8'));
    licenseCache={stamp,result}; return result;
  }catch{
    const result={valid:false,error:'Porto Prime ainda não foi ativado neste computador.'};
    licenseCache={stamp:'missing',result}; return result;
  }
}
function currentAccess(){let x=currentLicense();if(x.valid)return {active:true,accessMode:'license',license:{licenseId:x.data.licenseId,customer:x.data.customer,document:x.data.document||'',plan:x.data.plan||'Comercial',issuedAt:x.data.issuedAt,expiresAt:x.data.expiresAt||null}};let trial=trialManager.status();return trial.active?{...trial,license:{licenseId:'DEMO-'+MACHINE_ID,customer:'Demonstração gratuita',document:'',plan:'Demonstração 7 dias',issuedAt:trial.startedAt,expiresAt:trial.expiresAt}}:{...trial,error:trial.error||x.error}}
function publicLicenseStatus(){return {...currentAccess(),machineId:MACHINE_ID}}
app.get('/api/license/status',(req,res)=>res.json(publicLicenseStatus()));
app.post('/api/license/activate',(req,res)=>{try{let key=String(req.body?.licenseKey||'').trim(),x=verifyLicenseKey(key);if(!x.valid)return res.status(400).json({error:x.error});fs.mkdirSync(LICENSE_DIR,{recursive:true});let tmp=LICENSE_FILE+'.tmp';fs.writeFileSync(tmp,key,'utf8');fs.renameSync(tmp,LICENSE_FILE);licenseCache={stamp:'',result:null};res.json(publicLicenseStatus())}catch(e){res.status(500).json({error:'Não foi possível salvar a licença: '+e.message})}});
app.post('/api/license/trial/start',(req,res)=>{try{let paid=currentLicense();if(paid.valid)return res.json(publicLicenseStatus());let trial=trialManager.start();if(!trial.active)return res.status(409).json({...trial,machineId:MACHINE_ID});res.json(publicLicenseStatus())}catch(e){res.status(500).json({error:'Não foi possível iniciar a demonstração: '+e.message})}});
app.use('/api',(req,res,next)=>{let x=currentAccess();if(x.active)return next();return res.status(402).json({...x,error:x.error||'Licença necessária.',code:x.expired?'TRIAL_EXPIRED':'LICENSE_REQUIRED',machineId:MACHINE_ID})});

const sign=u=>jwt.sign({id:u.id,name:u.name,role:u.role},SECRET,{expiresIn:'12h'});
const auth=async(req,res,next)=>{try{let tokenUser=jwt.verify((req.headers.authorization||'').replace('Bearer ',''),SECRET),q=await pool.query('SELECT id,name,role,active FROM users WHERE id=$1',[tokenUser.id]);if(!q.rowCount||q.rows[0].active!==true)return res.status(401).json({error:'Usuário inativo ou sessão inválida.'});req.user={...tokenUser,id:q.rows[0].id,name:q.rows[0].name,role:q.rows[0].role};next()}catch{return res.status(401).json({error:'Sessão inválida ou expirada.'})}};
const roles=(...ok)=>(req,res,next)=>ok.includes(req.user.role)?next():res.status(403).json({error:'Sem permissão para esta operação.'});
const DEFAULT_PERMS={Administrador:{discount:true,cancel_sale:true,view_cost:true,cash_move:true,financial:true,stock:true},Gerente:{discount:true,cancel_sale:true,view_cost:true,cash_move:true,financial:true,stock:true},Vendedor:{discount:false,cancel_sale:false,view_cost:false,cash_move:false,financial:false,stock:false},Caixa:{discount:false,cancel_sale:false,view_cost:false,cash_move:true,financial:false,stock:false},Estoquista:{discount:false,cancel_sale:false,view_cost:true,cash_move:false,financial:false,stock:true}};
const mergedPerms=u=>({...DEFAULT_PERMS[u.role]||{},...(u.permissions||{})});
async function userPerm(userId,key){let q=await pool.query('SELECT role,permissions FROM users WHERE id=$1 AND active=true',[userId]);if(!q.rowCount)return false;return !!mergedPerms(q.rows[0])[key]}
const permit=key=>async(req,res,next)=>req.user.role==='Administrador'||await userPerm(req.user.id,key)?next():res.status(403).json({error:'Seu usuário não possui permissão para esta operação.'});
async function audit(c,u,a,d=''){await c.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[u,a,d])}
const loginAttempts=new Map();
const isLocalLoginRequest=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(String(req.ip||req.socket?.remoteAddress||''));
const loginKey=req=>String(req.ip||req.socket?.remoteAddress||'local')+'|'+String(req.body?.email||'').trim().toLowerCase();
function loginGuard(req,res,next){if(isLocalLoginRequest(req))return next();let k=loginKey(req),x=loginAttempts.get(k);if(x?.blockedUntil>Date.now())return res.status(429).json({error:'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.'});next()}
function loginFail(req){if(isLocalLoginRequest(req))return;let k=loginKey(req),x=loginAttempts.get(k)||{count:0,blockedUntil:0};x.count++;if(x.count>=5){x.blockedUntil=Date.now()+5*60*1000;x.count=0}loginAttempts.set(k,x);if(loginAttempts.size>1000){for(const [key,v] of loginAttempts){if(!v.blockedUntil||v.blockedUntil<Date.now())loginAttempts.delete(key);if(loginAttempts.size<=500)break}}}
function loginSuccess(req){loginAttempts.delete(loginKey(req))}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,permissions:mergedPerms(u),must_change_password:!!u.force_change_password}}
app.post('/api/auth/login',loginGuard,async(req,res)=>{try{const email=String(req.body?.email||'').trim(),password=String(req.body?.password||'');if(!email||!password){loginFail(req);return res.status(401).json({error:'E-mail ou senha incorretos.'})}const q=await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',[email]);if(!q.rowCount||!await bcrypt.compare(password,q.rows[0].password_hash)){loginFail(req);return res.status(401).json({error:'E-mail ou senha incorretos.'})}let u=q.rows[0];loginSuccess(req);await audit(pool,u.id,'Login realizado',req.ip||'local');res.json({token:sign(u),user:publicUser(u)})}catch(e){res.status(500).json({error:'Não foi possível concluir o login.'})}});
const localRequest=isLocalLoginRequest;
app.get('/api/auth/recovery-info',async(req,res)=>{if(!localRequest(req))return res.status(403).json({error:'Recuperação disponível somente neste computador.'});try{
  const q=await pool.query("SELECT email FROM users WHERE role='Administrador' AND active=true ORDER BY id LIMIT 1");
  res.json({machineId:MACHINE_ID,email:q.rows[0]?.email||''});
}catch(e){res.status(500).json({error:'Não foi possível preparar a recuperação.'})}});
// 5.1: recuperação por autorização externa, sem senha padrão nem prova por Machine ID.
// O operador deve iniciar o processo com PORTO_PRIME_RECOVERY_TOKEN (segredo aleatório >= 32 caracteres).
// O token é de uso único, só é aceito no próprio computador e expira em 15 minutos.
const recoveryToken=String(process.env.PORTO_PRIME_RECOVERY_TOKEN||'');
delete process.env.PORTO_PRIME_RECOVERY_TOKEN;
let recoveryAuthorized=recoveryToken.length>=32 ? {digest:crypto.createHash('sha256').update(recoveryToken).digest(),until:Date.now()+15*60*1000,used:false} : null;
let recoveryFailures=0;
app.post('/api/auth/recover-admin',async(req,res)=>{
  if(!localRequest(req))return res.status(403).json({error:'Recuperação disponível somente neste computador.'});
  if(!recoveryAuthorized||recoveryAuthorized.used||Date.now()>recoveryAuthorized.until||recoveryFailures>=5)return res.status(403).json({error:'Recuperação indisponível. Solicite nova autorização ao suporte.'});
  const supplied=String(req.body?.recoveryToken||'');
  const got=crypto.createHash('sha256').update(supplied).digest();
  if(!crypto.timingSafeEqual(got,recoveryAuthorized.digest)){
    recoveryFailures++;
    return res.status(403).json({error:'Autorização de recuperação inválida.'});
  }
  // Consumir a autorização antes da operação; falhas não permitem repetição automática.
  recoveryAuthorized.used=true;
  try{
    const email=String(req.body?.email||'').trim();
    const password=String(req.body?.password||'');
    if(password.length<12)throw Error('A senha deve conter pelo menos 12 caracteres.');
    const q=await pool.query("SELECT id FROM users WHERE role='Administrador' AND active=true AND lower(email)=lower($1) LIMIT 1",[email]);
    if(!q.rowCount)throw Error('Administrador não encontrado.');
    // Interromper se o backup preventivo falhar.
    await saveLogicalBackup('PASSWORD-RECOVERY');
    const hash=await bcrypt.hash(password,12);
    await pool.query('UPDATE users SET password_hash=$1,force_change_password=false WHERE id=$2',[hash,q.rows[0].id]);
    await audit(pool,q.rows[0].id,'Recuperação administrativa autorizada','Token externo de uso único');
    res.json({ok:true});
  }catch(e){res.status(400).json({error:'Recuperação não concluída: '+e.message});}
});

app.post('/api/auth/change-initial-password',auth,async(req,res)=>{try{let password=String(req.body?.password||'');if(password.length<8)throw Error('A nova senha deve ter pelo menos 8 caracteres.');let q=await pool.query('SELECT * FROM users WHERE id=$1 AND active=true',[req.user.id]);if(!q.rowCount)throw Error('Usuário não encontrado.');if(!q.rows[0].force_change_password)return res.json({ok:true});let h=await bcrypt.hash(password,12);await pool.query('UPDATE users SET password_hash=$1,force_change_password=false WHERE id=$2',[h,req.user.id]);await audit(pool,req.user.id,'Senha inicial alterada','Primeiro acesso concluído');res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/me',auth,async(req,res)=>{let q=await pool.query('SELECT id,name,email,role,permissions,force_change_password FROM users WHERE id=$1 AND active=true',[req.user.id]);if(!q.rowCount)return res.status(401).json({error:'Usuário inativo.'});res.json(publicUser(q.rows[0]))});

// ConstruGest 2.6 - Rede Local (Fase 1)
app.get('/api/system/network',auth,roles('Administrador'),async(req,res)=>{const nets=os.networkInterfaces(),addresses=[];for(const list of Object.values(nets))for(const n of (list||[]))if(n.family==='IPv4'&&!n.internal)addresses.push(n.address);res.json({host:HOST,port:+PORT,hostname:os.hostname(),lan_enabled:HOST==='0.0.0.0'||HOST==='::',addresses,urls:addresses.map(ip=>`http://${ip}:${PORT}`)})});
app.get('/api/system/diagnostics',auth,roles('Administrador'),async(req,res)=>{try{let [users,products,customers,sales,backups,mig]=await Promise.all([pool.query('SELECT count(*) n FROM users WHERE active=true'),pool.query('SELECT count(*) n FROM products WHERE active=true'),pool.query('SELECT count(*) n FROM customers'),pool.query('SELECT count(*) n FROM sales'),Promise.resolve(backupFiles?.()||[]).catch?.(()=>[])||[],pool.query('SELECT max(version) version FROM schema_migrations')]);let disk=null;try{disk={data_dir:process.env.ELECTRON_DATA_DIR||'',writable:fs.existsSync(process.env.ELECTRON_DATA_DIR||process.cwd())}}catch{}res.json({version:APP_VERSION,database:'OK',schema_version:+(mig.rows[0]?.version||0),host:HOST,port:+PORT,lan_enabled:HOST==='0.0.0.0'||HOST==='::',counts:{users:+users.rows[0].n,products:+products.rows[0].n,customers:+customers.rows[0].n,sales:+sales.rows[0].n},backup:{total:Array.isArray(backups)?backups.length:0,last:Array.isArray(backups)?backups[0]||null:null},disk})}catch(e){res.status(500).json({error:'Falha no diagnóstico: '+e.message})}});

app.get('/api/dashboard',auth,async(req,res)=>{const [sales,prod,low,fin]=await Promise.all([pool.query("SELECT COALESCE(sum(total),0) revenue,COALESCE(sum(total-cmv),0) gross,count(*) sales FROM sales WHERE status='FINALIZADA' AND created_at>=date_trunc('month',now())"),pool.query('SELECT COALESCE(sum(stock*cost),0) stock_cost,count(*) products FROM products WHERE active=true'),pool.query('SELECT count(*) low FROM products WHERE active=true AND stock<=min_stock'),pool.query("SELECT kind,COALESCE(sum(amount),0) total FROM financial_entries WHERE status='PENDENTE' GROUP BY kind")]);let canCost=await userPerm(req.user.id,'view_cost'),canFin=await userPerm(req.user.id,'financial'),month={...sales.rows[0]};if(!canCost)delete month.gross;let inventory={...prod.rows[0]};if(!canCost)delete inventory.stock_cost;res.json({month,inventory,low:+low.rows[0].low,financial:canFin?fin.rows:[]})});
app.get('/api/products/next-code',auth,async(req,res)=>{try{res.json({code:await nextProductCode(pool)})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/products/categories',auth,async(req,res)=>{try{res.json((await pool.query("SELECT DISTINCT trim(category) AS category FROM products WHERE category IS NOT NULL AND trim(category)<>'' ORDER BY category")).rows.map(x=>x.category))}catch(e){res.status(400).json({error:e.message})}});
const productForUser=(p,canCost)=>{let x={...p};if(!canCost){delete x.cost}return x};
app.get('/api/products',auth,async(req,res)=>{let canCost=await userPerm(req.user.id,'view_cost'),rows=(await pool.query("SELECT * FROM products WHERE active=true ORDER BY name")).rows;res.json(rows.map(x=>productForUser(x,canCost)))});

// ConstruGest 3.5.0 - Importação e exportação de backup de produtos
const productHeaderKey=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const productAliases={code:['codigo','cod','sku'],name:['descricao','produto','nome','name'],brand:['marca'],category:['categoria'],unit:['unidade','und','un'],cost:['precodecusto','custo'],retail:['precodevenda','precoavista','varejo','venda'],stock:['estoque','saldo'],ean:['codigodebarras','ean','barcode']};
function productCell(row,key){for(const a of productAliases[key])for(const [k,v] of Object.entries(row))if(productHeaderKey(k)===a)return v;return ''}
function productNumber(v){if(typeof v==='number')return v;let x=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');if(!x)return 0;if(x.includes(',')&&x.includes('.'))x=x.lastIndexOf(',')>x.lastIndexOf('.')?x.replace(/\./g,'').replace(',','.'):x.replace(/,/g,'');else if(x.includes(','))x=x.replace(',','.');let n=+x;return Number.isFinite(n)?n:0}
function normalizeProductRow(row){let code=String(productCell(row,'code')??'').trim(),name=String(productCell(row,'name')??'').trim();return {code,name,brand:String(productCell(row,'brand')??'').trim(),category:String(productCell(row,'category')??'').trim(),unit:String(productCell(row,'unit')??'UN').trim()||'UN',cost:productNumber(productCell(row,'cost')),retail:productNumber(productCell(row,'retail')),stock:productNumber(productCell(row,'stock')),ean:String(productCell(row,'ean')??'').trim()}}
function readProductWorkbook(base64){let wb=XLSX.read(Buffer.from(String(base64||''),'base64'),{type:'buffer',cellText:true,cellDates:false}),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});return raw.map(normalizeProductRow).filter(x=>x.code||x.name)}
app.post('/api/products/import-preview',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let rows=readProductWorkbook(req.body.base64);if(!rows.length)throw Error('Nenhum produto válido encontrado na planilha.');if(rows.length>5000)throw Error('A planilha excede o limite de 5.000 produtos.');let codes=rows.map(x=>x.code).filter(Boolean),existing=[];if(codes.length){let q=await pool.query('SELECT code FROM products');let wanted=new Set(codes);existing=q.rows.map(x=>x.code).filter(x=>wanted.has(x))}let set=new Set(existing);res.json({rows:rows.map(x=>({...x,exists:set.has(x.code)})),total:rows.length,existing:rows.filter(x=>set.has(x.code)).length,new_count:rows.filter(x=>!set.has(x.code)).length})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/products/import',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let rows=readProductWorkbook(req.body.base64),mode=String(req.body.mode||'skip');if(!['skip','update'].includes(mode))throw Error('Modo de importação inválido.');if(!rows.length)throw Error('Nenhum produto válido encontrado.');let result=await tx(async c=>{let created=0,updated=0,skipped=0,errors=[];for(let [i,x] of rows.entries()){try{if(!x.code||!x.name){errors.push('Linha '+(i+2)+': código ou descrição ausente.');continue}let old=await c.query('SELECT * FROM products WHERE code=$1',[x.code]);if(old.rowCount){if(mode==='skip'){skipped++;continue}await c.query(`UPDATE products SET name=$1,brand=$2,category=$3,unit=$4,cost=$5,retail=$6,ean=$7,active=true,updated_at=now() WHERE code=$8`,[x.name,x.brand,x.category,x.unit,x.cost,x.retail,x.ean||null,x.code]);updated++}else{let q=await c.query(`INSERT INTO products(code,ean,name,brand,category,unit,stock,cost,retail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[x.code,x.ean||null,x.name,x.brand,x.category,x.unit,x.stock,x.cost,x.retail]);if(x.stock>0)await c.query("INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id,note) VALUES($1,$2,'ESTOQUE INICIAL',$3,0,$3,'IMPORT',$1,'Importação de backup de produtos')",[q.rows[0].id,req.user.id,x.stock]);created++}}catch(e){errors.push('Linha '+(i+2)+': '+e.message)}}await audit(c,req.user.id,'Backup de produtos importado',`Novos ${created} • atualizados ${updated} • ignorados ${skipped} • erros ${errors.length}`);return {created,updated,skipped,errors}});res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/products/export',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let rows=(await pool.query("SELECT code,name,brand,category,unit,cost,retail,stock,COALESCE(ean,'') ean FROM products WHERE active=true ORDER BY name")).rows,data=rows.map(x=>({'Código':x.code,'Descrição':x.name,'Marca':x.brand||'','Categoria':x.category||'','Unidade':x.unit||'UN','Preço de Custo':+x.cost||0,'Preço de Venda':+x.retail||0,'Estoque':+x.stock||0,'Código de Barras':x.ean||''})),wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(data);XLSX.utils.book_append_sheet(wb,ws,'Produtos');let buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});await audit(pool,req.user.id,'Backup de produtos exportado',rows.length+' produto(s)');res.json({filename:'Backup_Produtos_PortoPrime_'+new Date().toISOString().slice(0,10)+'.xlsx',base64:buf.toString('base64'),count:rows.length})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/products',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let x={...req.body};if(x.image_data&&(!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x.image_data)||x.image_data.length>4*1024*1024))throw Error('Imagem inválida ou maior que 3 MB. Use JPG, PNG, WEBP ou GIF.');x.name=String(x.name||'').trim();x.category=String(x.category||'').trim();if(!x.name)throw Error('Informe o nome do produto.');let nums=['stock','min_stock','max_stock','cost','retail','wholesale','wholesale_min','promo'];for(const k of nums)if(!Number.isFinite(+(x[k]||0))||+(x[k]||0)<0)throw Error('Valores de estoque, custo e preços não podem ser negativos.');let prod=await tx(async c=>{x.code=await nextProductCode(c,true);let q=await c.query(`INSERT INTO products(code,ean,name,brand,category,unit,location,image_data,stock,min_stock,max_stock,cost,retail,wholesale,wholesale_min,promo,promo_start,promo_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,[x.code,x.ean||null,x.name,x.brand,x.category,x.unit,x.location,x.image_data||null,+x.stock||0,+x.min_stock||0,+x.max_stock||0,+x.cost||0,+x.retail||0,+x.wholesale||0,+x.wholesale_min||0,+x.promo||0,x.promo_start||null,x.promo_end||null]);let prod=q.rows[0];if(+prod.stock>0)await c.query("INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id,note) VALUES($1,$2,'ESTOQUE INICIAL',$3,0,$3,'PRODUCT',$1,'Saldo informado no cadastro')",[prod.id,req.user.id,+prod.stock]);await c.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[req.user.id,'Produto cadastrado',x.name]);return prod});res.status(201).json(prod)}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/products/:id',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{let x=req.body;if(x.image_data&&(!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x.image_data)||x.image_data.length>4*1024*1024))return res.status(400).json({error:'Imagem inválida ou maior que 3 MB. Use JPG, PNG, WEBP ou GIF.'});let q=await pool.query(`UPDATE products SET code=$1,ean=$2,name=$3,brand=$4,category=$5,unit=$6,location=$7,image_data=$8,min_stock=$9,max_stock=$10,cost=$11,retail=$12,wholesale=$13,wholesale_min=$14,promo=$15,promo_start=$16,promo_end=$17,updated_at=now() WHERE id=$18 RETURNING *`,[x.code,x.ean||null,x.name,x.brand,x.category,x.unit,x.location,x.image_data||null,+x.min_stock||0,+x.max_stock||0,+x.cost||0,+x.retail||0,+x.wholesale||0,+x.wholesale_min||0,+x.promo||0,x.promo_start||null,x.promo_end||null,req.params.id]);res.json(q.rows[0])});
for(const [route,table] of [['customers','customers'],['suppliers','suppliers']]){app.get('/api/'+route,auth,async(req,res)=>res.json((await pool.query(`SELECT * FROM ${table} ORDER BY name`)).rows));app.post('/api/'+route,auth,async(req,res)=>{let x=req.body,q=await pool.query(`INSERT INTO ${table}(name,doc,phone,email,address) VALUES($1,$2,$3,$4,$5) RETURNING *`,[x.name,x.doc||'',x.phone||'',x.email||'',x.address||'']);res.status(201).json(q.rows[0])})}
app.post('/api/cash/open',auth,roles('Administrador','Gerente','Caixa'),async(req,res)=>{let exists=await pool.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1");if(exists.rowCount)return res.status(409).json({error:'Já existe um caixa aberto.'});let opening=+req.body.opening_amount;if(!Number.isFinite(opening)||opening<0)return res.status(400).json({error:'Valor de abertura inválido.'});let q=await pool.query('INSERT INTO cash_sessions(user_id,opening_amount) VALUES($1,$2) RETURNING *',[req.user.id,opening]);await audit(pool,req.user.id,'Caixa aberto','Caixa #'+q.rows[0].id+' • abertura '+opening.toFixed(2));res.status(201).json(q.rows[0])});
app.get('/api/cash/current',auth,async(req,res)=>{let q=await pool.query("SELECT c.*,u.name operator FROM cash_sessions c JOIN users u ON u.id=c.user_id WHERE c.status='OPEN' ORDER BY c.id DESC LIMIT 1");res.json(q.rows[0]||null)});
app.post('/api/cash/movement',auth,permit('cash_move'),async(req,res)=>{let c=await pool.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1");if(!c.rowCount)return res.status(409).json({error:'Abra o caixa primeiro.'});let kind=req.body.kind,amount=+req.body.amount;if(!['SUPRIMENTO','SANGRIA'].includes(kind)||!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Movimento de caixa inválido.'});if(kind==='SANGRIA')amount=-amount;let q=await pool.query('INSERT INTO cash_movements(session_id,user_id,kind,description,amount) VALUES($1,$2,$3,$4,$5) RETURNING *',[c.rows[0].id,req.user.id,kind,req.body.description||'',amount]);await audit(pool,req.user.id,'Movimento de caixa',kind+' • '+Math.abs(amount).toFixed(2)+' • '+(req.body.description||''));res.status(201).json(q.rows[0])});
app.post('/api/cash/close',auth,roles('Administrador','Gerente','Caixa'),async(req,res)=>{try{let out=await tx(async c=>{let cs=await c.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1 FOR UPDATE");if(!cs.rowCount)throw Error('Não há caixa aberto.');let id=cs.rows[0].id,m=await c.query('SELECT COALESCE(sum(amount),0) v FROM cash_movements WHERE session_id=$1',[id]),expected=+cs.rows[0].opening_amount + +m.rows[0].v,counted=+req.body.counted_amount;if(!Number.isFinite(counted)||counted<0)throw Error('Valor contado inválido.');let difference=counted-expected,note=String(req.body.close_note||'').trim();let q=await c.query("UPDATE cash_sessions SET status='CLOSED',closed_at=now(),expected_amount=$1,counted_amount=$2,difference=$3,close_note=$4,closed_by=$5 WHERE id=$6 RETURNING *",[expected,counted,difference,note,req.user.id,id]);await audit(c,req.user.id,'Caixa fechado','Caixa #'+id+' • esperado '+expected.toFixed(2)+' • contado '+counted.toFixed(2)+' • diferença '+difference.toFixed(2));return {...q.rows[0],difference}});res.json(out)}catch(e){res.status(400).json({error:e.message})}});

// ConstruGest 3.0 - Caixa e Fechamento Profissional
async function cashReport(sessionId){
  let sq=await pool.query(`SELECT c.*,u.name operator,cu.name closed_by_name FROM cash_sessions c JOIN users u ON u.id=c.user_id LEFT JOIN users cu ON cu.id=c.closed_by WHERE c.id=$1`,[sessionId]);
  if(!sq.rowCount)return null; let session=sq.rows[0];
  let [payments,movements,sales]=await Promise.all([pool.query(`SELECT sp.method,COALESCE(sum(sp.amount),0) total,count(DISTINCT sp.sale_id) sales FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id WHERE s.cash_session_id=$1 AND s.status='FINALIZADA' GROUP BY sp.method ORDER BY sp.method`,[sessionId]),pool.query(`SELECT cm.*,u.name user_name FROM cash_movements cm LEFT JOIN users u ON u.id=cm.user_id WHERE cm.session_id=$1 ORDER BY cm.id`,[sessionId]),pool.query(`SELECT count(*) sales,COALESCE(sum(total),0) total,COALESCE(sum(discount),0) discounts FROM sales WHERE cash_session_id=$1 AND status='FINALIZADA'`,[sessionId])]);
  let mv=movements.rows,cashSales=mv.filter(x=>x.kind==='VENDA').reduce((a,x)=>a+(+x.amount||0),0),supplies=mv.filter(x=>x.kind==='SUPRIMENTO').reduce((a,x)=>a+(+x.amount||0),0),withdrawals=Math.abs(mv.filter(x=>x.kind==='SANGRIA').reduce((a,x)=>a+(+x.amount||0),0)),refunds=Math.abs(mv.filter(x=>x.kind==='ESTORNO').reduce((a,x)=>a+(+x.amount||0),0)),expected=+session.opening_amount+cashSales+supplies-withdrawals-refunds;
  return {session,payments:payments.rows,movements:mv,sales:sales.rows[0],cash:{opening:+session.opening_amount,cash_sales:cashSales,supplies,withdrawals,refunds,expected,counted:session.counted_amount==null?null:+session.counted_amount,difference:session.difference==null?null:+session.difference}}
}
app.get('/api/cash/professional/current',auth,roles('Administrador','Gerente','Caixa'),async(req,res)=>{let q=await pool.query("SELECT id FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1");if(!q.rowCount)return res.json(null);res.json(await cashReport(q.rows[0].id))});
app.get('/api/cash/history',auth,roles('Administrador','Gerente','Caixa'),async(req,res)=>{let q=await pool.query(`SELECT c.*,u.name operator,cu.name closed_by_name FROM cash_sessions c JOIN users u ON u.id=c.user_id LEFT JOIN users cu ON cu.id=c.closed_by ORDER BY c.id DESC LIMIT 100`);res.json(q.rows)});
app.get('/api/cash/report/:id',auth,roles('Administrador','Gerente','Caixa'),async(req,res)=>{let r=await cashReport(+req.params.id);if(!r)return res.status(404).json({error:'Caixa não encontrado.'});res.json(r)});

async function currentSettings(c=pool){let q=await c.query('SELECT data FROM app_settings WHERE id=1');return q.rows[0]?.data||{}}
function saleRequestFingerprint(req){
 const body=req.body||{};
 const items=Array.isArray(body.items)?body.items.map(i=>({product_id:String(i?.product_id??''),qty:Number(i?.qty),unit_price:i?.unit_price===undefined||i?.unit_price===null||i?.unit_price===''?null:Number(i.unit_price)})):[];
 const payments=Array.isArray(body.payments)?body.payments.map(p=>({method:String(p?.method||''),amount:Number(p?.amount)})):[];
 return crypto.createHash('sha256').update(JSON.stringify({user_id:req.user?.id??null,customer_id:body.customer_id??null,quote_id:body.quote_id??null,discount_percent:body.discount_percent??null,discount:body.discount??null,payment_method:body.payment_method??null,items,payments})).digest('hex');
}
function safeSaleResponse(sale){const {idempotency_key,request_hash,...safe}=sale;return safe;}
async function finalizeSaleCore(req){
 const idempotencyKey=String(req.body?.request_id||'').trim();
 if(idempotencyKey&&!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey))throw Object.assign(Error('Identificador da tentativa de venda inválido.'),{statusCode:400});
 const requestHash=idempotencyKey?saleRequestFingerprint(req):null;
 return tx(async c=>{
  if(idempotencyKey){
   // Serialize concurrent submissions with the same request key before lookup.
   // The lock is transaction-scoped and released automatically on commit/rollback.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[idempotencyKey]);
   const existing=(await c.query('SELECT * FROM sales WHERE idempotency_key=$1',[idempotencyKey])).rows[0];
   if(existing){
    if(existing.request_hash!==requestHash)throw Object.assign(Error('Esta tentativa já foi registrada com dados diferentes. Confira a lista de vendas antes de iniciar outra tentativa.'),{statusCode:409});
    return {...existing,idempotent_replay:true};
   }
  }
  let cfg=await currentSettings(c),cs=(await c.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1 FOR UPDATE")).rows[0];
  if(!cs&&cfg.sales?.require_open_cash!==false)throw Error('Abra o caixa antes de vender.');if(!cs)cs={id:null};
  let items=req.body.items||[];if(!items.length)throw Error('Carrinho vazio.');
  let approval=verifyPdvApproval(req.body.approval_token),subtotal=0,cmv=0,checked=[],needsApproval=false;
  for(let i of items){
    if(!Number.isFinite(+i.qty)||+i.qty<=0)throw Error('Quantidade inválida na venda.');
    let p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[i.product_id])).rows[0];
    if(!p)throw Error('Produto não encontrado.');
    if(+p.stock<+i.qty&&cfg.stock?.allow_negative!==true)throw Error('Estoque insuficiente: '+p.name);
    let today=new Date().toISOString().slice(0,10),promo=+p.promo>0&&(!p.promo_start||today>=String(p.promo_start).slice(0,10))&&(!p.promo_end||today<=String(p.promo_end).slice(0,10));
    let base=promo?+p.promo:(+i.qty>=+p.wholesale_min&&+p.wholesale>0?+p.wholesale:+p.retail);
    let requested=(i.unit_price===undefined||i.unit_price===null||i.unit_price==='')?base:+i.unit_price;
    if(!Number.isFinite(requested)||requested<=0)throw Error('Preço de venda inválido: '+p.name);
    if(requested<base-0.001)needsApproval=true;
    let type=requested<base-0.001?'Preço autorizado':(requested>base+0.001?'Preço ajustado acima':(promo?'Promoção':(+i.qty>=+p.wholesale_min&&+p.wholesale>0?'Atacado':'Varejo')));
    subtotal+=requested*+i.qty;cmv+=+p.cost*+i.qty;checked.push({p,qty:+i.qty,price:requested,base,type});
  }
  const legacyDiscount=req.body.discount_percent===undefined&&req.body.discount!==undefined;
  let discountPct=legacyDiscount?(subtotal>0?Math.max(0,+req.body.discount||0)/subtotal*100:0):Math.max(0,+req.body.discount_percent||0);
  if(!Number.isFinite(discountPct)||discountPct<0||discountPct>100)throw Error('Percentual de desconto inválido.');
  if(discountPct>0){
    if(legacyDiscount){
      if(!await userPerm(req.user.id,'discount'))throw Error('Seu usuário não possui permissão para conceder desconto.');
      let maxPct=+(cfg.sales?.max_discount??10);
      if(discountPct>maxPct&&req.user.role!=='Administrador'&&req.user.role!=='Gerente')throw Error('Desconto acima do limite permitido de '+maxPct+'%.');
    }else needsApproval=true;
  }
  if(needsApproval&&!approval)throw Error('Desconto ou preço abaixo da tabela exige autorização válida de Administrador/Gerente.');
  let discount=subtotal*discountPct/100,total=Math.max(0,subtotal-discount),pays=req.body.payments||[];
  if(!pays.length)pays=[{method:req.body.payment_method||'Dinheiro',amount:total}];
  let paid=pays.reduce((a,x)=>a+(+x.amount||0),0);if(Math.abs(paid-total)>.01)throw Error('A soma dos pagamentos deve ser igual ao total da venda.');
  let sale=(await c.query('INSERT INTO sales(customer_id,user_id,seller_id,cash_session_id,payment_method,subtotal,total,discount,discount_percent,cmv,idempotency_key,request_hash) VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.body.customer_id||null,req.user.id,cs.id,pays.length>1?'Misto':pays[0].method,subtotal,total,discount,discountPct,cmv,idempotencyKey||null,requestHash])).rows[0];
  for(let i of checked){let before=+i.p.stock,after=before-i.qty;await c.query('INSERT INTO sale_items(sale_id,product_id,description,qty,unit_price,cost,price_type) VALUES($1,$2,$3,$4,$5,$6,$7)',[sale.id,i.p.id,i.p.name,i.qty,i.price,i.p.cost,i.type]);await c.query('UPDATE products SET stock=$1 WHERE id=$2',[after,i.p.id]);await c.query("INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id) VALUES($1,$2,'VENDA',$3,$4,$5,'SALE',$6)",[i.p.id,req.user.id,-i.qty,before,after,sale.id])}
  for(let p of pays){let method=p.method,amount=+p.amount;if(!Number.isFinite(amount)||amount<0)throw Error('Valor de pagamento inválido.');await c.query('INSERT INTO sale_payments(sale_id,method,amount) VALUES($1,$2,$3)',[sale.id,method,amount]);if(method==='Crediário')await c.query("INSERT INTO financial_entries(kind,description,amount,status,reference_type,reference_id) VALUES('RECEBER',$1,$2,'PENDENTE','SALE',$3)",['Crediário venda #'+sale.id,amount,sale.id]);else if(method==='Dinheiro'&&cs.id)await c.query("INSERT INTO cash_movements(session_id,user_id,kind,description,amount) VALUES($1,$2,'VENDA',$3,$4)",[cs.id,req.user.id,'Venda #'+sale.id+' • Dinheiro',amount])}
  if(req.body.quote_id){let q=(await c.query('SELECT * FROM quotes WHERE id=$1 FOR UPDATE',[req.body.quote_id])).rows[0];if(!q||q.status!=='ABERTO')throw Error('Orçamento não está mais disponível para conversão.');await c.query("UPDATE quotes SET status='CONVERTIDO',converted_sale_id=$1 WHERE id=$2",[sale.id,q.id]);await audit(c,req.user.id,'Orçamento convertido no PDV','#'+q.id+' -> venda #'+sale.id)}
  let detail='#'+sale.id+' • '+(pays.length>1?'pagamento misto':pays[0].method);if(approval)detail+=' • autorizado por '+approval.approver_name+' ('+approval.approver_role+')';
  await audit(c,req.user.id,'Venda finalizada',detail);return sale;
 });
}
async function saleRoute(req,res){
 try{const sale=await finalizeSaleCore(req),replay=!!sale.idempotent_replay;res.status(replay?200:201).json({...safeSaleResponse(sale),...(replay?{idempotent_replay:true}:{})})}
 catch(e){
  const key=String(req.body?.request_id||'').trim();
  if(key&&/^[A-Za-z0-9_-]{16,100}$/.test(key)){
   try{const existing=(await pool.query('SELECT * FROM sales WHERE idempotency_key=$1',[key])).rows[0];if(existing){if(existing.request_hash!==saleRequestFingerprint(req))return res.status(409).json({error:'Esta tentativa já foi registrada com dados diferentes. Confira a lista de vendas antes de iniciar outra tentativa.'});return res.status(200).json({...safeSaleResponse(existing),idempotent_replay:true})}}catch(recoveryError){console.error('Falha ao recuperar resultado de venda idempotente:',recoveryError)}
  }
  res.status(e.statusCode||400).json({error:e.message||'Não foi possível finalizar a venda.'})
 }
}
app.post('/api/sales',auth,roles('Administrador','Gerente','Vendedor','Caixa'),saleRoute);
app.get('/api/sales',auth,async(req,res)=>res.json((await pool.query('SELECT s.id,s.customer_id,s.user_id,s.seller_id,s.cash_session_id,s.status,s.payment_method,s.subtotal,s.total,s.discount,s.discount_percent,s.cmv,s.created_at,s.cancelled_at,s.cancelled_by,s.cancel_reason,u.name seller,c.name customer FROM sales s JOIN users u ON u.id=s.user_id LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC LIMIT 200')).rows));
app.get('/api/stock/movements',auth,async(req,res)=>res.json((await pool.query('SELECT m.*,p.name product,u.name user_name FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 300')).rows));
app.get('/api/audit',auth,roles('Administrador','Gerente'),async(req,res)=>res.json((await pool.query('SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300')).rows));
// ConstruGest 3.2.9 - Financeiro Profissional
app.get('/api/financial',auth,permit('financial'),async(req,res)=>{
  let q=await pool.query(`SELECT f.*,
    CASE
      WHEN COALESCE(f.party_name,'')<>'' THEN f.party_name
      WHEN f.reference_type='SALE' THEN COALESCE((SELECT c.name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=f.reference_id),'Consumidor Final')
      WHEN f.reference_type='PURCHASE' THEN COALESCE((SELECT sp.name FROM purchases p LEFT JOIN suppliers sp ON sp.id=p.supplier_id WHERE p.id=f.reference_id),'Fornecedor')
      ELSE ''
    END AS counterparty
    FROM financial_entries f ORDER BY COALESCE(f.due_date,f.created_at::date) DESC,f.id DESC`);
  res.json(q.rows)
});
app.get('/api/financial/summary',auth,permit('financial'),async(req,res)=>{
  let q=await pool.query(`SELECT
    COALESCE(sum(amount) FILTER(WHERE kind='RECEBER' AND status='PENDENTE'),0) receivable,
    COALESCE(sum(amount) FILTER(WHERE kind IN('PAGAR','DESPESA') AND status='PENDENTE'),0) payable,
    COALESCE(sum(amount) FILTER(WHERE kind='RECEBER' AND status='PENDENTE' AND due_date<current_date),0) overdue_receivable,
    COALESCE(sum(amount) FILTER(WHERE kind IN('PAGAR','DESPESA') AND status='PENDENTE' AND due_date<current_date),0) overdue_payable,
    COALESCE(sum(amount) FILTER(WHERE kind='RECEBER' AND status='PAGO' AND paid_at>=date_trunc('month',now())),0) received_month,
    COALESCE(sum(amount) FILTER(WHERE kind IN('PAGAR','DESPESA') AND status='PAGO' AND paid_at>=date_trunc('month',now())),0) paid_month,
    count(*) FILTER(WHERE status='PENDENTE') pending_count,
    count(*) FILTER(WHERE status='PENDENTE' AND due_date=current_date) due_today_count,
    COALESCE(sum(amount) FILTER(WHERE status='PENDENTE' AND due_date=current_date),0) due_today_amount,
    count(*) FILTER(WHERE status='PENDENTE' AND due_date<current_date) overdue_count,
    COALESCE(sum(amount) FILTER(WHERE kind='RECEBER' AND status='PENDENTE' AND due_date BETWEEN current_date AND current_date+7),0) receivable_7,
    COALESCE(sum(amount) FILTER(WHERE kind IN('PAGAR','DESPESA') AND status='PENDENTE' AND due_date BETWEEN current_date AND current_date+7),0) payable_7
    FROM financial_entries`);
  let x=q.rows[0];res.json(Object.fromEntries(Object.entries(x).map(([k,v])=>[k,+v||0])))
});
app.post('/api/financial',auth,roles('Administrador','Gerente'),async(req,res)=>{
  try{
    let x=req.body,kind=String(x.kind||'').toUpperCase(),amount=+x.amount,desc=String(x.description||'').trim(),installments=Math.max(1,Math.min(60,Math.trunc(+x.installments||1)));
    if(!['PAGAR','RECEBER','DESPESA'].includes(kind))throw Error('Tipo financeiro inválido.');
    if(!desc)throw Error('Informe a descrição.');
    if(!Number.isFinite(amount)||amount<=0)throw Error('Informe um valor maior que zero.');
    if(installments>1&&!x.due_date)throw Error('Informe o primeiro vencimento para parcelar.');
    let created=await tx(async c=>{
      let rows=[],base=Math.floor((amount/installments)*100)/100,remaining=Math.round(amount*100)/100;
      for(let k=1;k<=installments;k++){
        let value=k===installments?remaining:base;remaining=Math.round((remaining-value)*100)/100;
        let due=x.due_date||null;if(due&&k>1){let d=new Date(due+'T12:00:00');d.setMonth(d.getMonth()+k-1);due=d.toISOString().slice(0,10)}
        let label=installments>1?desc+' • parcela '+k+'/'+installments:desc;
        let q=await c.query(`INSERT INTO financial_entries(kind,description,category,amount,due_date,status,party_name,document_no,notes,installment_no,installment_count,updated_at) VALUES($1,$2,$3,$4,$5,'PENDENTE',$6,$7,$8,$9,$10,now()) RETURNING *`,[kind,label,String(x.category||'').trim(),value,due,String(x.party_name||'').trim(),String(x.document_no||'').trim(),String(x.notes||'').trim(),k,installments]);rows.push(q.rows[0]);
      }
      await audit(c,req.user.id,'Lançamento financeiro criado',desc+' • '+amount.toFixed(2)+' • '+installments+' parcela(s)');return rows;
    });
    res.status(201).json(installments===1?created[0]:created)
  }catch(e){res.status(400).json({error:e.message})}
});
app.put('/api/financial/:id',auth,roles('Administrador','Gerente'),async(req,res)=>{
  try{
    let current=(await pool.query('SELECT * FROM financial_entries WHERE id=$1',[req.params.id])).rows[0];
    if(!current)throw Error('Lançamento não encontrado.');
    if(current.status!=='PENDENTE')throw Error('Somente lançamentos pendentes podem ser editados.');
    let x=req.body,kind=String(x.kind||'').toUpperCase(),amount=+x.amount,desc=String(x.description||'').trim();
    if(!['PAGAR','RECEBER','DESPESA'].includes(kind)||!desc||!Number.isFinite(amount)||amount<=0)throw Error('Revise os dados do lançamento.');
    let q=await pool.query(`UPDATE financial_entries SET kind=$1,description=$2,category=$3,amount=$4,due_date=$5,party_name=$6,document_no=$7,notes=$8,updated_at=now()
      WHERE id=$9 RETURNING *`,[kind,desc,String(x.category||'').trim(),amount,x.due_date||null,String(x.party_name||'').trim(),String(x.document_no||'').trim(),String(x.notes||'').trim(),req.params.id]);
    await audit(pool,req.user.id,'Lançamento financeiro editado','#'+req.params.id+' • '+desc);
    res.json(q.rows[0])
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/financial/:id/cancel',auth,roles('Administrador','Gerente'),async(req,res)=>{
  try{
    let f=(await pool.query('SELECT * FROM financial_entries WHERE id=$1',[req.params.id])).rows[0];
    if(!f)throw Error('Lançamento não encontrado.');
    if(f.status!=='PENDENTE')throw Error('Somente lançamentos pendentes podem ser cancelados.');
    let reason=String(req.body.reason||'').trim();if(!reason)throw Error('Informe o motivo do cancelamento.');
    let q=await pool.query(`UPDATE financial_entries SET status='CANCELADO',notes=trim(concat(COALESCE(notes,''),E'\nCancelamento: ',$1)),updated_at=now() WHERE id=$2 RETURNING *`,[reason,f.id]);
    await audit(pool,req.user.id,'Lançamento financeiro cancelado','#'+f.id+' • '+reason);res.json(q.rows[0])
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/users',auth,roles('Administrador'),async(req,res)=>{let x=req.body,h=await bcrypt.hash(x.password,12);try{let q=await pool.query('INSERT INTO users(name,email,password_hash,role,permissions) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,name,email,role,permissions,active',[x.name,x.email,h,x.role,JSON.stringify(x.permissions||{})]);res.status(201).json(q.rows[0])}catch(e){res.status(400).json({error:'Não foi possível criar usuário. E-mail pode já existir.'})}});
app.get('/api/users',auth,roles('Administrador'),async(req,res)=>res.json((await pool.query('SELECT id,name,email,role,permissions,active,created_at FROM users ORDER BY name')).rows));
app.put('/api/users/:id',auth,roles('Administrador'),async(req,res)=>{try{let x=req.body||{};if(+req.params.id===+req.user.id&&x.active===false)throw Error('Você não pode desativar o próprio usuário.');let q=await pool.query('UPDATE users SET name=$1,email=$2,role=$3,permissions=$4::jsonb,active=$5 WHERE id=$6 RETURNING id,name,email,role,permissions,active',[x.name,x.email,x.role,JSON.stringify(x.permissions||{}),x.active!==false,req.params.id]);if(!q.rowCount)throw Error('Usuário não encontrado.');await pool.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[req.user.id,'Permissões de usuário alteradas',x.name||('#'+req.params.id)]);res.json(q.rows[0])}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/seller-performance',auth,roles('Administrador','Gerente','Vendedor'),async(req,res)=>{try{
  const month=validateMonthKey(req.query.month);
  const data=await getSellerPerformance(pool,month);
  if(req.user.role==='Vendedor')data.sellers=data.sellers.filter(x=>x.user_id===+req.user.id);
  if(req.user.role==='Vendedor'){
    data.summary={
      sales:data.sellers.reduce((a,x)=>a+x.sales,0),
      sales_total:data.sellers.reduce((a,x)=>a+x.sales_total,0),
      target_amount:data.sellers.reduce((a,x)=>a+x.target_amount,0),
      commission_estimated:data.sellers.reduce((a,x)=>a+x.commission_estimated,0),
      achieved_count:data.sellers.filter(x=>x.achieved).length
    };
  }
  res.json(data);
}catch(e){res.status(e.code==='INVALID_MONTH'?400:500).json({error:e.code==='INVALID_MONTH'?e.message:'Não foi possível gerar o painel de vendedores: '+e.message})}});

app.put('/api/seller-performance/:userId/target',auth,roles('Administrador','Gerente'),async(req,res)=>{try{
  const userId=+req.params.userId,month=validateMonthKey(req.body?.month);
  const target=+req.body?.target_amount,pct=+req.body?.commission_percent;
  if(!Number.isInteger(userId)||userId<=0)throw Error('Vendedor inválido.');
  if(!Number.isFinite(target)||target<0)throw Error('Meta inválida.');
  if(!Number.isFinite(pct)||pct<0||pct>100)throw Error('Percentual de comissão inválido.');
  const uq=await pool.query("SELECT id,name,role FROM users WHERE id=$1 AND active=true",[userId]);
  if(!uq.rowCount)throw Error('Usuário não encontrado ou inativo.');
  const q=await pool.query(`INSERT INTO seller_targets(user_id,month_key,target_amount,commission_percent,updated_at)
    VALUES($1,$2,$3,$4,now())
    ON CONFLICT(user_id,month_key) DO UPDATE
      SET target_amount=EXCLUDED.target_amount,commission_percent=EXCLUDED.commission_percent,updated_at=now()
    RETURNING *`,[userId,month,target,pct]);
  await audit(pool,req.user.id,'Meta/comissão de vendedor alterada',uq.rows[0].name+' • '+month+' • meta '+target.toFixed(2)+' • comissão '+pct.toFixed(3)+'%');
  res.json(q.rows[0]);
}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/purchases',auth,async(req,res)=>res.json((await pool.query(`SELECT p.*,s.name supplier,u.name buyer FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 200`)).rows));
app.post('/api/purchases',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let out=await tx(async c=>{let x=req.body,items=x.items||[];if(!items.length)throw Error('Informe ao menos um item.');for(const i of items)if(!Number.isFinite(+i.qty)||+i.qty<=0||!Number.isFinite(+i.unit_cost)||+i.unit_cost<0)throw Error('Quantidade ou custo inválido na compra.');let total=items.reduce((a,i)=>a+(+i.qty)*(+i.unit_cost),0);let pur=(await c.query(`INSERT INTO purchases(supplier_id,user_id,status,total,invoice_number,notes) VALUES($1,$2,'PEDIDO',$3,$4,$5) RETURNING *`,[x.supplier_id||null,req.user.id,total,x.invoice_number||'',x.notes||''])).rows[0];for(let i of items)await c.query('INSERT INTO purchase_items(purchase_id,product_id,qty,unit_cost) VALUES($1,$2,$3,$4)',[pur.id,i.product_id,+i.qty,+i.unit_cost]);await audit(c,req.user.id,'Compra criada','#'+pur.id);return pur});res.status(201).json(out)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/purchases/:id/receive',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let out=await tx(async c=>{let pur=(await c.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!pur)throw Error('Compra não encontrada.');if(pur.status==='RECEBIDA')throw Error('Esta compra já foi recebida.');let items=(await c.query('SELECT * FROM purchase_items WHERE purchase_id=$1',[pur.id])).rows;for(let i of items){let p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[i.product_id])).rows[0];let before=+p.stock,qty=+i.qty,oldCost=+p.cost,newCost=(before+qty)>0?((before*oldCost)+(qty*+i.unit_cost))/(before+qty):+i.unit_cost,after=before+qty;await c.query('UPDATE products SET stock=$1,cost=$2,updated_at=now() WHERE id=$3',[after,newCost,p.id]);await c.query(`INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id,note) VALUES($1,$2,'COMPRA',$3,$4,$5,'PURCHASE',$6,$7)`,[p.id,req.user.id,qty,before,after,pur.id,'Custo médio: '+newCost.toFixed(2)])}let n=Math.max(1,+req.body.installments||1),first=req.body.first_due||new Date().toISOString().slice(0,10),base=Math.floor((+pur.total/n)*100)/100,remaining=+pur.total;for(let k=1;k<=n;k++){let d=new Date(first+'T12:00:00');d.setMonth(d.getMonth()+k-1);let amount=k===n?remaining:base;remaining-=amount;await c.query(`INSERT INTO financial_entries(kind,description,category,amount,due_date,status,reference_type,reference_id,installment_no,installment_count) VALUES('PAGAR',$1,'Compra',$2,$3,'PENDENTE','PURCHASE',$4,$5,$6)`,[`Compra #${pur.id} parcela ${k}/${n}`,amount,d.toISOString().slice(0,10),pur.id,k,n])}let q=(await c.query("UPDATE purchases SET status='RECEBIDA',received_at=now() WHERE id=$1 RETURNING *",[pur.id])).rows[0];await audit(c,req.user.id,'Compra recebida','#'+pur.id);return q});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/purchases/:id/items',auth,async(req,res)=>res.json((await pool.query('SELECT i.*,p.name,p.code FROM purchase_items i JOIN products p ON p.id=i.product_id WHERE purchase_id=$1',[req.params.id])).rows));
app.post('/api/financial/:id/pay',auth,permit('financial'),async(req,res)=>{try{let out=await tx(async c=>{let f=(await c.query('SELECT * FROM financial_entries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!f)throw Error('Lançamento não encontrado.');if(f.status==='PAGO')throw Error('Lançamento já baixado.');let method=req.body.payment_method||'Dinheiro';let q=(await c.query("UPDATE financial_entries SET status='PAGO',paid_at=now(),payment_method=$1 WHERE id=$2 RETURNING *",[method,f.id])).rows[0];let cs=(await c.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1")).rows[0];if(cs&&method==='Dinheiro'){let sign=f.kind==='RECEBER'?1:-1;await c.query('INSERT INTO cash_movements(session_id,user_id,kind,description,amount) VALUES($1,$2,$3,$4,$5)',[cs.id,req.user.id,f.kind==='RECEBER'?'RECEBIMENTO':'PAGAMENTO',f.description,sign*+f.amount])}await audit(c,req.user.id,'Baixa financeira','#'+f.id+' '+f.description);return q});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/sales/:id/cancel',auth,permit('cancel_sale'),async(req,res)=>{try{let out=await tx(async c=>{let s=(await c.query('SELECT * FROM sales WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!s)throw Error('Venda não encontrada.');if(s.status!=='FINALIZADA')throw Error('Venda já está cancelada/estornada.');let items=(await c.query('SELECT * FROM sale_items WHERE sale_id=$1',[s.id])).rows;for(let i of items){let p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[i.product_id])).rows[0],before=+p.stock,after=before+ +i.qty;await c.query('UPDATE products SET stock=$1 WHERE id=$2',[after,p.id]);await c.query(`INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id,note) VALUES($1,$2,'ESTORNO VENDA',$3,$4,$5,'SALE',$6,$7)`,[p.id,req.user.id,+i.qty,before,after,s.id,req.body.reason||''])}await c.query("UPDATE sales SET status='CANCELADA',cancelled_at=now(),cancelled_by=$1,cancel_reason=$2 WHERE id=$3",[req.user.id,req.body.reason||'Sem motivo informado',s.id]);await c.query("UPDATE financial_entries SET status='CANCELADO' WHERE reference_type='SALE' AND reference_id=$1 AND status='PENDENTE'",[s.id]);let cs=(await c.query("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1")).rows[0];if(cs){let dp=await c.query("SELECT COALESCE(sum(amount),0) total FROM sale_payments WHERE sale_id=$1 AND method='Dinheiro'",[s.id]);let cashAmount=+(dp.rows[0]?.total||0);if(!cashAmount&&s.payment_method==='Dinheiro')cashAmount=+s.total;if(cashAmount>0)await c.query("INSERT INTO cash_movements(session_id,user_id,kind,description,amount) VALUES($1,$2,'ESTORNO',$3,$4)",[cs.id,req.user.id,'Estorno venda #'+s.id,-cashAmount]);}await audit(c,req.user.id,'Venda estornada','#'+s.id+' '+(req.body.reason||''));return {ok:true,id:s.id}});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/sales/:id/items',auth,async(req,res)=>res.json((await pool.query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id',[req.params.id])).rows));
app.get('/api/quotes',auth,async(req,res)=>res.json((await pool.query(`SELECT q.*,c.name customer,c.doc customer_doc,c.phone customer_phone,u.name seller,CASE WHEN q.status='ABERTO' AND q.valid_until IS NOT NULL AND q.valid_until<current_date THEN 'VENCIDO' ELSE q.status END display_status FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN users u ON u.id=q.user_id ORDER BY q.id DESC LIMIT 500`)).rows));
app.get('/api/quotes/:id',auth,async(req,res)=>{let q=(await pool.query(`SELECT q.*,c.name customer,c.doc customer_doc,c.phone customer_phone,u.name seller,CASE WHEN q.status='ABERTO' AND q.valid_until IS NOT NULL AND q.valid_until<current_date THEN 'VENCIDO' ELSE q.status END display_status FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN users u ON u.id=q.user_id WHERE q.id=$1`,[req.params.id])).rows[0];if(!q)return res.status(404).json({error:'Orçamento não encontrado.'});q.items=(await pool.query('SELECT qi.*,p.code,p.unit,p.retail,p.stock FROM quote_items qi LEFT JOIN products p ON p.id=qi.product_id WHERE qi.quote_id=$1 ORDER BY qi.id',[q.id])).rows;res.json(q)});
app.post('/api/quotes',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let out=await tx(async c=>{let x=req.body,items=x.items||[];if(!items.length)throw Error('Informe itens no orçamento.');let gross=0,total=0,checked=[];for(let i of items){let qty=+i.qty,disc=Math.max(0,Math.min(100,+i.discount_percent||0));if(!Number.isFinite(qty)||qty<=0)throw Error('Quantidade inválida no orçamento.');let p=(await c.query('SELECT * FROM products WHERE id=$1',[i.product_id])).rows[0];if(!p)throw Error('Produto inválido.');let price=(i.unit_price===undefined||i.unit_price===null||i.unit_price==='')?+p.retail:+i.unit_price;if(!Number.isFinite(price)||price<0)throw Error('Preço inválido: '+p.name);gross+=price*qty;total+=price*qty*(1-disc/100);checked.push({p,qty,price,disc})}let discount=Math.max(0,gross-total);let q=(await c.query('INSERT INTO quotes(customer_id,user_id,valid_until,discount,total,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[x.customer_id||null,req.user.id,x.valid_until||null,discount,total,x.notes||'','ABERTO'])).rows[0];for(let i of checked)await c.query('INSERT INTO quote_items(quote_id,product_id,description,qty,unit_price,discount_percent) VALUES($1,$2,$3,$4,$5,$6)',[q.id,i.p.id,i.p.name,i.qty,i.price,i.disc]);await audit(c,req.user.id,'Orçamento criado','#'+q.id);return q});res.status(201).json(out)}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/quotes/:id',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let out=await tx(async c=>{let old=(await c.query('SELECT * FROM quotes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old)throw Error('Orçamento não encontrado.');if(old.status!=='ABERTO')throw Error('Somente orçamento aberto pode ser editado.');let x=req.body,items=x.items||[];if(!items.length)throw Error('Informe itens no orçamento.');let gross=0,total=0,checked=[];for(let i of items){let qty=+i.qty,disc=Math.max(0,Math.min(100,+i.discount_percent||0));if(!Number.isFinite(qty)||qty<=0)throw Error('Quantidade inválida.');let p=(await c.query('SELECT * FROM products WHERE id=$1',[i.product_id])).rows[0];if(!p)throw Error('Produto inválido.');let price=+i.unit_price;if(!Number.isFinite(price)||price<0)throw Error('Preço inválido.');gross+=price*qty;total+=price*qty*(1-disc/100);checked.push({p,qty,price,disc})}let discount=Math.max(0,gross-total);let q=(await c.query('UPDATE quotes SET customer_id=$1,valid_until=$2,discount=$3,total=$4,notes=$5 WHERE id=$6 RETURNING *',[x.customer_id||null,x.valid_until||null,discount,total,x.notes||'',old.id])).rows[0];await c.query('DELETE FROM quote_items WHERE quote_id=$1',[old.id]);for(let i of checked)await c.query('INSERT INTO quote_items(quote_id,product_id,description,qty,unit_price,discount_percent) VALUES($1,$2,$3,$4,$5,$6)',[old.id,i.p.id,i.p.name,i.qty,i.price,i.disc]);await audit(c,req.user.id,'Orçamento editado','#'+old.id);return q});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/quotes/:id/duplicate',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let out=await tx(async c=>{let q=(await c.query('SELECT * FROM quotes WHERE id=$1',[req.params.id])).rows[0];if(!q)throw Error('Orçamento não encontrado.');let n=(await c.query("INSERT INTO quotes(customer_id,user_id,status,valid_until,discount,total,notes) VALUES($1,$2,'ABERTO',current_date+7,$3,$4,$5) RETURNING *",[q.customer_id,req.user.id,q.discount,q.total,q.notes])).rows[0];await c.query('INSERT INTO quote_items(quote_id,product_id,description,qty,unit_price,discount_percent) SELECT $1,product_id,description,qty,unit_price,discount_percent FROM quote_items WHERE quote_id=$2',[n.id,q.id]);await audit(c,req.user.id,'Orçamento duplicado','#'+q.id+' -> #'+n.id);return n});res.status(201).json(out)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/quotes/:id/cancel',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let out=await tx(async c=>{let q=(await c.query('SELECT * FROM quotes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!q)throw Error('Orçamento não encontrado.');if(q.status==='CONVERTIDO')throw Error('Orçamento convertido não pode ser cancelado.');if(q.status==='CANCELADO')throw Error('Orçamento já cancelado.');await c.query("UPDATE quotes SET status='CANCELADO' WHERE id=$1",[q.id]);await audit(c,req.user.id,'Orçamento cancelado','#'+q.id+' • '+String(req.body.reason||'Sem motivo'));return {ok:true}});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/quotes/:id/items',auth,async(req,res)=>res.json((await pool.query('SELECT qi.*,p.code,p.unit,p.retail,p.stock FROM quote_items qi LEFT JOIN products p ON p.id=qi.product_id WHERE quote_id=$1 ORDER BY qi.id',[req.params.id])).rows));
// A conversão profissional é concluída dentro de /api/sales-v42; esta rota antiga não cria mais venda diretamente.
app.post('/api/quotes/:id/convert',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{let q=(await pool.query("SELECT id,status FROM quotes WHERE id=$1",[req.params.id])).rows[0];if(!q)return res.status(404).json({error:'Orçamento não encontrado.'});if(q.status!=='ABERTO')return res.status(400).json({error:'Orçamento indisponível para conversão.'});res.json({ok:true,mode:'PDV'})});
app.get('/api/reports/summary',auth,roles('Administrador','Gerente'),async(req,res)=>{let [pay,rec,top,dead]=await Promise.all([pool.query("SELECT COALESCE(sum(amount),0) total FROM financial_entries WHERE kind IN ('PAGAR','DESPESA') AND status='PENDENTE'"),pool.query("SELECT COALESCE(sum(amount),0) total FROM financial_entries WHERE kind='RECEBER' AND status='PENDENTE'"),pool.query("SELECT si.description,sum(si.qty) qty,sum(si.qty*si.unit_price) revenue,sum(si.qty*(si.unit_price-si.cost)) profit FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='FINALIZADA' GROUP BY si.description ORDER BY revenue DESC LIMIT 10"),pool.query("SELECT p.id,p.code,p.name,p.stock,p.cost,p.retail FROM products p WHERE p.active=true AND NOT EXISTS(SELECT 1 FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.status='FINALIZADA' AND s.created_at>now()-interval '60 days') ORDER BY p.stock*p.cost DESC LIMIT 30")]);res.json({payable:+pay.rows[0].total,receivable:+rec.rows[0].total,top:top.rows,dead:dead.rows})});
// ConstruGest 3.3.1 - Relatórios Gerenciais por período
app.get('/api/reports/management',auth,roles('Administrador','Gerente'),async(req,res)=>{try{
  const data=await getManagementReport(pool,req.query.from,req.query.to);
  res.json(data);
}catch(e){
  res.status(e.code==='INVALID_PERIOD'?400:500).json({error:e.code==='INVALID_PERIOD'?e.message:'Não foi possível gerar o relatório: '+e.message});
}});

app.get('/api/reports/management/export',auth,roles('Administrador','Gerente'),async(req,res)=>{try{
  const {from,to}=validateManagementPeriod(req.query.from,req.query.to);
  const r=await getManagementReport(pool,from,to);
  const wb=XLSX.utils.book_new();
  const add=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  add('Resumo',[
    ['PORTO PRIME - RELATÓRIO GERENCIAL'],['Período',from,to],[],
    ['Indicador','Valor'],
    ['Faturamento',r.metrics.revenue],['Lucro bruto',r.metrics.gross],['Margem %',r.metrics.margin],['Vendas',r.metrics.sales],['Ticket médio',r.metrics.ticket],
    ['Entradas financeiras',r.financial.income],['Saídas financeiras',r.financial.outflow],['Resultado financeiro',r.financial.result],
    ['A receber',r.financial.receivable],['A pagar',r.financial.payable],['Compras no período',r.purchases.total]
  ]);
  add('Produtos',[['Produto','Quantidade','Faturamento'],...r.products.map(x=>[x.description,x.qty,x.revenue])]);
  add('Clientes',[['Cliente','Compras','Faturamento','Ticket médio','Última compra'],...r.customers.map(x=>[x.name,x.sales,x.revenue,x.ticket,x.last_sale||''])]);
  add('Vendedores',[['Vendedor','Vendas','Faturamento'],...r.sellers.map(x=>[x.name,x.sales,x.revenue])]);
  add('Fornecedores',[['Fornecedor','Compras','Total'],...r.suppliers.map(x=>[x.name,x.purchases,x.total])]);
  add('Estoque',[['Indicador','Valor'],['Produtos ativos',r.inventory.products],['Valor a custo',r.inventory.cost_value],['Estoque baixo',r.inventory.low],['Estoque zerado',r.inventory.zero],[],['Sem venda no período','Estoque','Custo'],...r.no_sales.map(x=>[x.name,+x.stock||0,+x.cost||0])]);
  const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="PortoPrime-Relatorio-${from}-a-${to}.xlsx"`);
  res.send(buf);
}catch(e){
  res.status(e.code==='INVALID_PERIOD'?400:500).json({error:e.code==='INVALID_PERIOD'?e.message:'Não foi possível exportar o relatório: '+e.message});
}});


// --- ConstruGest PRO v4.2 ---
app.get('/api/products/search',auth,async(req,res)=>{let q=String(req.query.q||'').trim();if(!q)return res.json([]);let r=await pool.query("SELECT * FROM products WHERE active=true AND (code ILIKE $1 OR COALESCE(ean,'') ILIKE $1 OR name ILIKE $1 OR COALESCE(brand,'') ILIKE $1) ORDER BY CASE WHEN code=$2 OR ean=$2 THEN 0 ELSE 1 END,name LIMIT 20",['%'+q+'%',q]),canCost=await userPerm(req.user.id,'view_cost');res.json(r.rows.map(x=>productForUser(x,canCost)))});
app.get('/api/products/:id/history',auth,async(req,res)=>{let [p,m,sales,purchases]=await Promise.all([pool.query('SELECT * FROM products WHERE id=$1',[req.params.id]),pool.query('SELECT m.*,u.name user_name FROM stock_movements m LEFT JOIN users u ON u.id=m.user_id WHERE product_id=$1 ORDER BY m.id DESC LIMIT 200',[req.params.id]),pool.query("SELECT s.id,s.created_at,s.status,si.qty,si.unit_price,si.price_type FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=$1 ORDER BY s.id DESC LIMIT 100",[req.params.id]),pool.query('SELECT pu.id,pu.created_at,pi.qty,pi.unit_cost,su.name supplier FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id LEFT JOIN suppliers su ON su.id=pu.supplier_id WHERE pi.product_id=$1 ORDER BY pu.id DESC LIMIT 100',[req.params.id])]);if(!p.rowCount)return res.status(404).json({error:'Produto não encontrado.'});let canCost=await userPerm(req.user.id,'view_cost'),purchaseRows=purchases.rows.map(x=>{let y={...x};if(!canCost)delete y.unit_cost;return y});res.json({product:productForUser(p.rows[0],canCost),movements:m.rows,sales:sales.rows,purchases:purchaseRows})});
app.put('/api/customers/:id',auth,async(req,res)=>{let x=req.body,q=await pool.query('UPDATE customers SET name=$1,doc=$2,phone=$3,email=$4,address=$5,type=$6,credit_limit=$7,notes=$8 WHERE id=$9 RETURNING *',[x.name,x.doc||'',x.phone||'',x.email||'',x.address||'',x.type||'Consumidor',+x.credit_limit||0,x.notes||'',req.params.id]);res.json(q.rows[0])});
app.put('/api/suppliers/:id',auth,async(req,res)=>{let x=req.body,q=await pool.query('UPDATE suppliers SET name=$1,doc=$2,contact=$3,phone=$4,email=$5,address=$6,notes=$7 WHERE id=$8 RETURNING *',[x.name,x.doc||'',x.contact||'',x.phone||'',x.email||'',x.address||'',x.notes||'',req.params.id]);res.json(q.rows[0])});
app.get('/api/customers/:id/history',auth,async(req,res)=>{let [c,sales]=await Promise.all([pool.query('SELECT * FROM customers WHERE id=$1',[req.params.id]),pool.query('SELECT * FROM sales WHERE customer_id=$1 ORDER BY id DESC LIMIT 100',[req.params.id])]),canFin=await userPerm(req.user.id,'financial'),financial=[];if(canFin)financial=(await pool.query("SELECT * FROM financial_entries WHERE reference_type='SALE' AND reference_id IN (SELECT id FROM sales WHERE customer_id=$1) ORDER BY id DESC",[req.params.id])).rows;res.json({customer:c.rows[0],sales:sales.rows,financial})});
app.get('/api/suppliers/:id/history',auth,async(req,res)=>{let [su,p]=await Promise.all([pool.query('SELECT * FROM suppliers WHERE id=$1',[req.params.id]),pool.query('SELECT * FROM purchases WHERE supplier_id=$1 ORDER BY id DESC LIMIT 100',[req.params.id])]);res.json({supplier:su.rows[0],purchases:p.rows})});
app.get('/api/cash/summary',auth,async(req,res)=>{let c=(await pool.query("SELECT c.*,u.name operator FROM cash_sessions c JOIN users u ON u.id=c.user_id WHERE c.status='OPEN' ORDER BY c.id DESC LIMIT 1")).rows[0];if(!c)return res.json(null);let m=(await pool.query('SELECT kind,COALESCE(sum(amount),0) total,count(*) qty FROM cash_movements WHERE session_id=$1 GROUP BY kind ORDER BY kind',[c.id])).rows;let expected=+c.opening_amount+m.reduce((a,x)=>a+(+x.total),0);res.json({...c,movements:m,expected})});

// ConstruGest 2.9.1 - autorização gerencial para desconto/preço abaixo da tabela
app.post('/api/manager-approval',auth,async(req,res)=>{
  try{
    const email=String(req.body?.email||'').trim(),password=String(req.body?.password||'');
    const q=await pool.query("SELECT id,name,email,role,password_hash FROM users WHERE lower(email)=lower($1) AND active=true",[email]);
    const u=q.rows[0];
    if(!u||!['Administrador','Gerente'].includes(u.role)||!await bcrypt.compare(password,u.password_hash))
      return res.status(401).json({error:'Senha ou usuário de Administrador/Gerente inválido.'});
    const approval_token=jwt.sign({kind:'pdv_approval',approver_id:u.id,approver_name:u.name,approver_role:u.role},SECRET,{expiresIn:'10m'});
    await pool.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[req.user.id,'Autorização gerencial no PDV',u.name+' ('+u.role+')']);
    res.json({approval_token,approved_by:u.name,role:u.role,expires_in:600})
  }catch(e){res.status(400).json({error:e.message})}
});
function verifyPdvApproval(token){
  try{let a=jwt.verify(String(token||''),SECRET);return a?.kind==='pdv_approval'&&['Administrador','Gerente'].includes(a.approver_role)?a:null}catch{return null}
}

app.post('/api/sales-v42',auth,roles('Administrador','Gerente','Vendedor','Caixa'),saleRoute);
app.get('/api/sales/:id/payments',auth,async(req,res)=>res.json((await pool.query('SELECT * FROM sale_payments WHERE sale_id=$1 ORDER BY id',[req.params.id])).rows));
app.post('/api/inventory/start',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let out=await tx(async c=>{let open=(await c.query("SELECT id FROM inventory_counts WHERE status='ABERTO' LIMIT 1")).rows[0];if(open)throw Error('Já existe um inventário aberto.');let count=(await c.query('INSERT INTO inventory_counts(user_id,notes) VALUES($1,$2) RETURNING *',[req.user.id,req.body.notes||''])).rows[0];await c.query('INSERT INTO inventory_count_items(count_id,product_id,system_qty) SELECT $1,id,stock FROM products WHERE active=true',[count.id]);await audit(c,req.user.id,'Inventário iniciado','#'+count.id);return count});res.status(201).json(out)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/inventory/current',auth,async(req,res)=>{let c=(await pool.query("SELECT * FROM inventory_counts WHERE status='ABERTO' ORDER BY id DESC LIMIT 1")).rows[0];if(!c)return res.json(null);c.items=(await pool.query('SELECT i.*,p.code,p.ean,p.name,p.unit FROM inventory_count_items i JOIN products p ON p.id=i.product_id WHERE count_id=$1 ORDER BY p.name',[c.id])).rows;res.json(c)});
app.put('/api/inventory/:id/item/:itemId',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{let counted=+req.body.counted_qty;if(!Number.isFinite(counted)||counted<0)return res.status(400).json({error:'Quantidade contada inválida.'});let q=await pool.query('UPDATE inventory_count_items SET counted_qty=$1,difference=$1-system_qty WHERE id=$2 AND count_id=$3 RETURNING *',[counted,req.params.itemId,req.params.id]);res.json(q.rows[0])});
app.post('/api/inventory/:id/finish',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{let out=await tx(async c=>{let cnt=(await c.query("SELECT * FROM inventory_counts WHERE id=$1 AND status='ABERTO' FOR UPDATE",[req.params.id])).rows[0];if(!cnt)throw Error('Inventário não encontrado.');let items=(await c.query('SELECT * FROM inventory_count_items WHERE count_id=$1',[cnt.id])).rows;if(items.some(i=>i.counted_qty===null))throw Error('Conte todos os produtos antes de finalizar.');for(let i of items){if(+i.difference===0)continue;let p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[i.product_id])).rows[0];let before=+p.stock,after=+i.counted_qty;await c.query('UPDATE products SET stock=$1 WHERE id=$2',[after,p.id]);await c.query("INSERT INTO stock_movements(product_id,user_id,kind,qty,balance_before,balance_after,reference_type,reference_id,note) VALUES($1,$2,'AJUSTE INVENTÁRIO',$3,$4,$5,'INVENTORY',$6,$7)",[p.id,req.user.id,after-before,before,after,cnt.id,'Contagem física'])}await c.query("UPDATE inventory_counts SET status='FINALIZADO',finished_at=now() WHERE id=$1",[cnt.id]);await audit(c,req.user.id,'Inventário finalizado','#'+cnt.id);return {ok:true}});res.json(out)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/dashboard/charts',auth,roles('Administrador','Gerente'),async(req,res)=>{let [days,pay]=await Promise.all([pool.query("SELECT to_char(d,'DD/MM') label,COALESCE(sum(s.total),0) total FROM generate_series(current_date-6,current_date,'1 day') d LEFT JOIN sales s ON s.status='FINALIZADA' AND s.created_at>=d AND s.created_at<d+interval '1 day' GROUP BY d ORDER BY d"),pool.query("SELECT COALESCE(sp.method,s.payment_method) method,COALESCE(sum(sp.amount),sum(s.total)) total FROM sales s LEFT JOIN sale_payments sp ON sp.sale_id=s.id WHERE s.status='FINALIZADA' AND s.created_at>=date_trunc('month',now()) GROUP BY COALESCE(sp.method,s.payment_method) ORDER BY total DESC")]);res.json({days:days.rows,payments:pay.rows})});



// ConstruGest 2.4.4 - painel gerencial e reposição inteligente
app.get('/api/dashboard-v23',auth,roles('Administrador','Gerente'),async(req,res)=>{try{let [today,month,fin,low,top,dead]=await Promise.all([
 pool.query("SELECT COALESCE(sum(total),0) revenue,COALESCE(sum(total-cmv),0) gross,count(*) sales FROM sales WHERE status='FINALIZADA' AND created_at>=current_date AND created_at<current_date+interval '1 day'"),
 pool.query("SELECT COALESCE(sum(total),0) revenue,COALESCE(sum(total-cmv),0) gross,count(*) sales FROM sales WHERE status='FINALIZADA' AND created_at>=date_trunc('month',now())"),
 pool.query("SELECT kind,COALESCE(sum(amount),0) total,count(*) qty FROM financial_entries WHERE status='PENDENTE' GROUP BY kind"),
 pool.query("SELECT id,code,name,stock,min_stock,max_stock,cost,retail,GREATEST(COALESCE(max_stock,0)-stock,COALESCE(min_stock,0)-stock,0) suggested FROM products WHERE active=true AND stock<=min_stock ORDER BY (min_stock-stock) DESC,name LIMIT 12"),
 pool.query("SELECT si.description,sum(si.qty) qty,sum(si.qty*si.unit_price) revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='FINALIZADA' AND s.created_at>=date_trunc('month',now()) GROUP BY si.description ORDER BY revenue DESC LIMIT 5"),
 pool.query("SELECT p.id,p.name,p.stock,p.cost FROM products p WHERE p.active=true AND p.stock>0 AND NOT EXISTS(SELECT 1 FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.status='FINALIZADA' AND s.created_at>now()-interval '60 days') ORDER BY p.stock*p.cost DESC LIMIT 5")
]);res.json({today:today.rows[0],month:month.rows[0],financial:fin.rows,low:low.rows,top:top.rows,dead:dead.rows})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/stock/replenishment',auth,async(req,res)=>{let q=await pool.query("SELECT id,code,name,brand,unit,stock,min_stock,max_stock,cost,retail,GREATEST(COALESCE(max_stock,0)-stock,COALESCE(min_stock,0)-stock,0) suggested,CASE WHEN stock<=0 THEN 'SEM ESTOQUE' WHEN stock<=min_stock THEN 'REPOR' ELSE 'OK' END status FROM products WHERE active=true AND stock<=min_stock ORDER BY CASE WHEN stock<=0 THEN 0 ELSE 1 END,(min_stock-stock) DESC,name");res.json(q.rows)});
app.get('/api/stock/intelligence',auth,roles('Administrador','Gerente','Estoquista'),async(req,res)=>{try{
  const data=await getStockIntelligence(pool,{days:req.query.days});
  const canCost=await userPerm(req.user.id,'view_cost');
  if(!canCost){
    data.summary.stock_cost_value=0;data.summary.dead_value=0;data.summary.gross_profit=0;
    for(const x of data.products){delete x.cost;delete x.stock_value;delete x.gross_profit;delete x.margin}
    for(const x of data.dead_stock){delete x.cost;delete x.stock_value;delete x.gross_profit;delete x.margin}
    for(const x of data.replenishment){delete x.cost;delete x.stock_value;delete x.gross_profit;delete x.margin}
  }
  res.json(data);
}catch(e){res.status(500).json({error:'Não foi possível gerar a inteligência de estoque: '+e.message})}});


// ConstruGest 2.7.1 - vendas suspensas compartilhadas na rede local
app.get('/api/suspended-sales',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let q=await pool.query("SELECT ss.id,ss.label,ss.customer_id,ss.payload,ss.created_at,ss.updated_at,u.name operator,c.name customer FROM suspended_sales ss LEFT JOIN users u ON u.id=ss.user_id LEFT JOIN customers c ON c.id=ss.customer_id ORDER BY ss.updated_at DESC");res.json(q.rows)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/suspended-sales',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let x=req.body||{},payload=x.payload||{};if(!Array.isArray(payload.items)||!payload.items.length)throw Error('Não há itens para suspender.');let q=await pool.query('INSERT INTO suspended_sales(user_id,customer_id,label,payload) VALUES($1,$2,$3,$4::jsonb) RETURNING *',[req.user.id,x.customer_id||null,String(x.label||'Venda suspensa').slice(0,80),JSON.stringify(payload)]);res.status(201).json(q.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/suspended-sales/:id',auth,roles('Administrador','Gerente','Vendedor','Caixa'),async(req,res)=>{try{let q=await pool.query('DELETE FROM suspended_sales WHERE id=$1 RETURNING id',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Venda suspensa não encontrada.'});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});

// Backup lógico completo do banco local. Somente Administrador.

// ConstruGest 2.1 - Configuracoes gerais
app.get('/api/settings',auth,async(req,res)=>{let q=await pool.query("SELECT data FROM app_settings WHERE id=1");res.json(q.rows[0]?.data||{})});
app.put('/api/settings',auth,roles('Administrador'),async(req,res)=>{try{let data=req.body||{};await pool.query("INSERT INTO app_settings(id,data,updated_at) VALUES(1,$1::jsonb,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",[JSON.stringify(data)]);await pool.query('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[req.user.id,'Configurações alteradas','Configurações gerais do sistema']);res.json({ok:true,data})}catch(e){res.status(400).json({error:'Não foi possível salvar as configurações: '+e.message})}});

const BACKUP_TABLES=['users','products','customers','suppliers','cash_sessions','cash_movements','sales','sale_items','stock_movements','purchases','purchase_items','financial_entries','audit_logs','quotes','quote_items','sale_payments','inventory_counts','inventory_count_items','app_settings','suspended_sales','product_code_counter','seller_targets'];
const BACKUP_FORMAT='ConstruGest Backup', BACKUP_SCHEMA=5, BACKUP_VERSION=APP_VERSION;
const backupDigest=b=>crypto.createHash('sha256').update(JSON.stringify({format:b.format,version:b.version,schema_version:b.schema_version,kind:b.kind,created_at:b.created_at,tables:b.tables})).digest('hex');
const backupDir=()=>path.join(process.env.ELECTRON_DATA_DIR?path.dirname(process.env.ELECTRON_DATA_DIR):path.join(process.cwd(),'data'),'backups');
const safeStamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
async function buildLogicalBackup(kind='MANUAL'){
  let data={format:BACKUP_FORMAT,version:BACKUP_VERSION,schema_version:BACKUP_SCHEMA,kind,created_at:new Date().toISOString(),tables:{}};
  for(const t of BACKUP_TABLES)data.tables[t]=(await pool.query(`SELECT * FROM ${t} ORDER BY id`)).rows;
  data.summary={}; for(const t of BACKUP_TABLES)data.summary[t]=data.tables[t].length;
  data.integrity_sha256=backupDigest(data);
  return data;
}
function backupFiles(){let dir=backupDir();fs.mkdirSync(dir,{recursive:true});return fs.readdirSync(dir).filter(n=>/^(ConstruGest|PortoPrime)-Backup-.*\.json$/i.test(n)).map(name=>{let st=fs.statSync(path.join(dir,name));return {name,size:st.size,created_at:st.mtime.toISOString()}}).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
function pruneBackups(limit=30){for(const x of backupFiles().slice(limit))try{fs.unlinkSync(path.join(backupDir(),x.name))}catch{}}
async function saveLogicalBackup(kind='MANUAL'){
  let data=await buildLogicalBackup(kind),name=`PortoPrime-Backup-${kind}-${safeStamp()}.json`,dir=backupDir();fs.mkdirSync(dir,{recursive:true});
  let tmp=path.join(dir,name+'.tmp'),final=path.join(dir,name);fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,final);pruneBackups();
  return {name,size:fs.statSync(final).size,created_at:data.created_at,kind,summary:data.summary,data};
}
async function autoBackupIfDue(){try{let files=backupFiles().filter(x=>x.name.includes('-AUTO-')),last=files[0];if(last&&Date.now()-new Date(last.created_at).getTime()<23*60*60*1000)return;await saveLogicalBackup('AUTO');console.log('Backup automático criado.')}catch(e){console.error('Falha no backup automático:',e)}}
app.get('/api/backup/export',auth,roles('Administrador'),async(req,res)=>{try{res.json(await buildLogicalBackup('DOWNLOAD'))}catch(e){res.status(500).json({error:'Falha ao gerar backup: '+e.message})}});
app.get('/api/backup/status',auth,roles('Administrador'),async(req,res)=>{try{let files=backupFiles();res.json({automatic:true,interval_hours:24,retention:30,total:files.length,last:files[0]||null,files:files.slice(0,10)})}catch(e){res.status(500).json({error:'Falha ao consultar backups: '+e.message})}});
app.post('/api/backup/create',auth,roles('Administrador'),async(req,res)=>{try{let out=await saveLogicalBackup('MANUAL');await audit(pool,req.user.id,'Backup manual criado',out.name);res.json({ok:true,name:out.name,size:out.size,created_at:out.created_at,summary:out.summary})}catch(e){res.status(500).json({error:'Falha ao salvar backup: '+e.message})}});
app.post('/api/backup/restore',auth,roles('Administrador'),async(req,res)=>{try{
  let b=req.body;
  if(!b||b.format!==BACKUP_FORMAT||!b.tables)throw Error('Arquivo de backup inválido.');
  if(typeof b.integrity_sha256!=='string'||!/^[a-f0-9]{64}$/i.test(b.integrity_sha256)||b.integrity_sha256!==backupDigest(b))throw Error('Backup sem hash SHA-256 válido ou com conteúdo alterado. Backups antigos precisam de conversão segura antes da restauração.');
  for(const table of BACKUP_TABLES)if(!Array.isArray(b.tables[table]))throw Error('Backup incompleto: tabela obrigatória ausente: '+table);
  for(const key of Object.keys(b.tables))if(!BACKUP_TABLES.includes(key))throw Error('Backup contém tabela não autorizada: '+key);
  // Exigir backup preventivo antes de iniciar a transação destrutiva.
  let safety=await saveLogicalBackup('PRE-RESTORE');
  let result=await tx(async c=>{
    let allowed={};
    for(const t of BACKUP_TABLES){
      let q=await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[t]);
      allowed[t]=new Set(q.rows.map(x=>x.column_name));
      // Verificar todas as linhas e colunas ANTES de truncar qualquer tabela.
      for(const row of b.tables[t]){
        if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Linha inválida no backup: '+t);
        const cols=Object.keys(row);
        if(!cols.length||cols.some(k=>!allowed[t].has(k)))throw Error('Coluna inválida no backup: '+t);
      }
    }
    await c.query(`TRUNCATE TABLE ${[...BACKUP_TABLES].reverse().join(',')} RESTART IDENTITY CASCADE`);
    for(const t of BACKUP_TABLES){
      let rows=Array.isArray(b.tables[t])?b.tables[t]:[];
      for(const row of rows){
        let cols=Object.keys(row);
        if(cols.some(k=>!allowed[t].has(k)))throw Error('Backup contém coluna não autorizada em '+t);
        if(!cols.length)continue;
        let vals=cols.map(k=>row[k]);
        let ps=cols.map((_,i)=>'$'+(i+1)).join(',');
        await c.query(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${ps})`,vals);
      }
      if(rows.length){
        try{await c.query(`SELECT setval(pg_get_serial_sequence('${t}','id'),COALESCE((SELECT max(id) FROM ${t}),1),true)`)}catch{}
      }
    }
    return {ok:true};
  });
  await audit(pool,req.user.id,'Backup restaurado',safety.name);
  res.json({...result,safety_backup:safety.name});
}catch(e){
  res.status(400).json({error:'Não foi possível restaurar: '+e.message});
}});

app.use('/api',(req,res)=>res.status(404).json({error:'Rota não encontrada.'}));

async function applyEmergencyMasterUserReset(){
  const done=await pool.query("SELECT 1 FROM schema_migrations WHERE version=444 LIMIT 1");
  if(done.rowCount)return;
  const admin=(await pool.query("SELECT id FROM users WHERE role='Administrador' ORDER BY id LIMIT 1")).rows[0];
  if(admin){
    await pool.query("UPDATE users SET name='Master',email='master',active=true,force_change_password=true WHERE id=$1",[admin.id]);
    await pool.query("INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)",[admin.id,'Usuário administrativo redefinido','Login temporário alterado para master']);
  }
  await pool.query("INSERT INTO schema_migrations(version,description) VALUES(444,'Porto Prime 4.4.4 - reset do usuário administrativo') ON CONFLICT(version) DO NOTHING");
}
async function applyEmergencyMasterPasswordReset(){
  const done=await pool.query("SELECT 1 FROM schema_migrations WHERE version=445 LIMIT 1");
  if(done.rowCount)return;
  const admin=(await pool.query("SELECT id FROM users WHERE role='Administrador' ORDER BY id LIMIT 1")).rows[0];
  if(admin){
    const hash=await bcrypt.hash('master',12);
    await pool.query("UPDATE users SET name='Master',email='master',password_hash=$1,active=true,force_change_password=true WHERE id=$2",[hash,admin.id]);
    await pool.query("INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)",[admin.id,'Senha administrativa temporária redefinida','Login temporário: master']);
  }
  await pool.query("INSERT INTO schema_migrations(version,description) VALUES(445,'Porto Prime 4.4.7 - senha temporária master') ON CONFLICT(version) DO NOTHING");
}
async function applyEmergencyMasterReset446(){
  const done=await pool.query("SELECT 1 FROM schema_migrations WHERE version=446 LIMIT 1");
  if(done.rowCount)return;
  const admin=(await pool.query("SELECT id FROM users WHERE role='Administrador' ORDER BY id LIMIT 1")).rows[0];
  const hash=await bcrypt.hash('master',12);
  if(admin){
    await pool.query("UPDATE users SET name='Master',email='master',password_hash=$1,active=true,force_change_password=true WHERE id=$2",[hash,admin.id]);
    await pool.query("INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)",[admin.id,'Acesso administrativo recuperado','Porto Prime 4.4.7 redefiniu usuário e senha temporários']);
  }else{
    const q=await pool.query("INSERT INTO users(name,email,password_hash,role,active,force_change_password) VALUES('Master','master',$1,'Administrador',true,true) RETURNING id",[hash]);
    await pool.query("INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)",[q.rows[0].id,'Acesso administrativo criado','Porto Prime 4.4.7 criou acesso temporário master']);
  }
  loginAttempts.clear();
  await pool.query("INSERT INTO schema_migrations(version,description) VALUES(446,'Porto Prime 4.4.7 - recuperação definitiva do acesso master') ON CONFLICT(version) DO NOTHING");
}
async function applyEmergencyMasterReset447(){
  const done=await pool.query("SELECT 1 FROM schema_migrations WHERE version=447 LIMIT 1");
  if(done.rowCount)return;
  const hash=await bcrypt.hash('master',12);
  const admin=(await pool.query("SELECT id FROM users WHERE role='Administrador' ORDER BY id LIMIT 1")).rows[0];
  let adminId;
  if(admin){
    adminId=admin.id;
    await pool.query("UPDATE users SET name='Master',email='master',password_hash=$1,active=true,force_change_password=true WHERE id=$2",[hash,adminId]);
  }else{
    const q=await pool.query("INSERT INTO users(name,email,password_hash,role,active,force_change_password) VALUES('Master','master',$1,'Administrador',true,true) RETURNING id",[hash]);
    adminId=q.rows[0].id;
  }
  const verify=(await pool.query("SELECT id,email,active,password_hash FROM users WHERE id=$1",[adminId])).rows[0];
  if(!verify||String(verify.email).toLowerCase()!=='master'||verify.active!==true||!await bcrypt.compare('master',verify.password_hash)){
    throw Error('Falha ao preparar o acesso temporário master.');
  }
  await pool.query("INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)",[adminId,'Acesso administrativo validado','Porto Prime 4.4.7 confirmou usuário e senha temporários']);
  await pool.query("INSERT INTO schema_migrations(version,description) VALUES(447,'Porto Prime 4.4.7 - validação definitiva do acesso master') ON CONFLICT(version) DO NOTHING");
  loginAttempts.clear();
}
async function boot(){
  await initDb();
  // 5.1: Never reset existing administrative credentials on startup.
  // Legacy migration functions remain for historical review only.
  let n=+(await pool.query('SELECT count(*) n FROM users')).rows[0].n;
  if(!n){
    let h=await bcrypt.hash('Admin@123',12);
    await pool.query("INSERT INTO users(name,email,password_hash,role,force_change_password) VALUES('Administrador','admin@construgest.local',$1,'Administrador',true)",[h]);
    await pool.query("INSERT INTO customers(name,type) VALUES('Consumidor Final','Consumidor')");
    await pool.query("INSERT INTO products(code,name,brand,category,unit,stock,min_stock,max_stock,cost,retail,wholesale,wholesale_min,promo) VALUES ('001','Cimento 50kg','Exemplo','Cimento','SC',35,10,80,28,39.90,36,10,34.90),('002','Torneira Jardim','Krona','Hidráulica','UN',8,10,50,2.10,4.99,4.20,10,3.99),('003','Lâmpada LED 9W','Exemplo','Elétrica','UN',80,20,120,2.20,3.50,3.10,20,2.99)");
  }
  app.listen(PORT,HOST,()=>{console.log(`Porto Prime 4.4.7 em http://${HOST}:${PORT}`);setImmediate(()=>autoBackupIfDue())});
  setInterval(autoBackupIfDue,60*60*1000).unref?.();
}
boot().catch(e=>{console.error(e);process.exit(1)});
