import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,pbkdf2Sync,randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import {onRequest} from '../functions/api/[[path]].js';
import {canonicalRequest} from '../functions/_lib/persora_integration.js';

const id=n=>`${String(n).padStart(8,'0')}-2222-4222-8222-${String(n).padStart(12,'0')}`;
const [adminA,adminB,adminNever,shopA1,shopA2,shopB1,fileA1,fileA2,fileB1,ownerId,licA,addonB,addonPending]=Array.from({length:13},(_,n)=>id(n+1));
const SECRET='persora-test-shared-secret-0123456789-abcdef';
const PASSWORD='correct horse battery';
const pw=(password,iterations=1000)=>{const salt=randomBytes(8).toString('base64url');return `pbkdf2$${iterations}$${salt}$${pbkdf2Sync(password,salt,iterations,32,'sha256').toString('base64url')}`};
const sha=v=>createHash('sha256').update(v).digest('hex');

function fixture(extraEnv={}){
 const sql=new Database(':memory:');sql.pragma('foreign_keys=ON');
 sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const now=new Date().toISOString(),past=new Date(Date.now()-86400000*400).toISOString(),expired=new Date(Date.now()-86400000*30).toISOString();
 sql.prepare('INSERT INTO ems_owners(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(ownerId,'Owner','owner@ems.test','x',now,now);
 const adm=sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
 adm.run(adminA,'Alpha Admin','1','alpha@example.test',pw(PASSWORD),'ADM-A',now,now);
 adm.run(adminB,'Beta Admin','2','beta@example.test',pw(PASSWORD),'ADM-B',now,now);
 adm.run(adminNever,'Never Admin','3','never@example.test',pw(PASSWORD),'ADM-N',now,now);
 const shop=sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
 shop.run(shopA1,adminA,'Alpha Main','1','A1','active','electronics','electronics',past,now);
 shop.run(shopA2,adminA,'Alpha Outlet','1','A2','read_only','electronics','electronics',now,now);
 shop.run(shopB1,adminB,'Beta Store','2','B1','active','electronics','electronics',now,now);
 // Admin A: historical (expired) license that included Vaultium storage.
 sql.prepare('INSERT INTO licenses(id,admin_id,duration_months,max_stores,payment_method,payment_number,transaction_id,status,vaultium_gb,starts_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(licA,adminA,1,2,'other','1','TX-A','expired',5,past,expired,past);
 // Admin B: Vaultium add-on that has since expired. Admin "never": only a PENDING request.
 const addon=sql.prepare('INSERT INTO addon_purchases(id,admin_id,addon_key,validity_days,daily_limit,unit_price,amount,payment_method,payment_number,transaction_id,status,starts_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 addon.run(addonB,adminB,'vaultium',30,1,0,0,'other','2','TX-B','expired',past,expired,past);
 addon.run(addonPending,adminNever,'vaultium',30,1,0,0,'other','3','TX-N','pending',null,null,now);
 const file=sql.prepare('INSERT INTO vaultium_files(id,admin_id,store_id,invoice_number,filename,content_type,size_bytes,r2_key,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
 file.run(fileA1,adminA,shopA1,'SAL-001','receipt-001.pdf','application/pdf',11,'vaultium/a1/receipt.pdf',adminA,now);
 file.run(fileA2,adminA,shopA2,null,'shelf.png','image/png',4,'vaultium/a2/shelf.png',adminA,past);
 file.run(fileB1,adminB,shopB1,null,'beta-secret.txt','text/plain',9,'vaultium/b1/secret.txt',adminB,now);
 const objects=new Map([['vaultium/a1/receipt.pdf','%PDF-1.4 ok'],['vaultium/a2/shelf.png','PNG!'],['vaultium/b1/secret.txt','B-PRIVATE']]);
 const env={DB_DRIVER:'d1',MOCK_EMAIL:'1',SESSION_SECRET:'local-unit-test-secret',...extraEnv,
  VAULTIUM:{async get(key){if(!objects.has(key))return null;const bytes=new TextEncoder().encode(objects.get(key));return{body:new Blob([bytes]).stream(),size:bytes.length}},async put(){throw Error('EMS originals must never be written through Persora')},async delete(){throw Error('EMS originals must never be deleted through Persora')}},
  DB:{
  prepare(query){return{bind(...args){const vals=args.map(x=>typeof x==='boolean'?Number(x):x);const execute=()=>{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...vals):(stmt.run(...vals),[])}};return{execute,async all(){try{return execute()}catch(e){return{success:false,error:e.message}}},async run(){const result=execute();return{...result,meta:{changes:result.results?.length||1}}}}}}},
  async batch(stmts){return sql.transaction(()=>stmts.map(x=>x.execute()))()}
 }};
 const jwt=payload=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${h}.${p}.${createHmac('sha256',env.SESSION_SECRET).update(h+'.'+p).digest('base64url')}`};
 const ownerToken=()=>jwt({role:'owner',id:ownerId,exp:Math.floor(Date.now()/1000)+1000});
 const adminToken=(who=adminA)=>jwt({role:'admin',id:who,exp:Math.floor(Date.now()/1000)+1000});
 const session=(path,method='GET',body,bearer=ownerToken())=>onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request('https://ems.example/api/'+path,{method,headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})});
 /** A request signed exactly the way Persora's backend signs it. */
 const signed=(path,{method='GET',body,grant='',secret=SECRET,ts=Math.floor(Date.now()/1000),tamperPath,headers={}}={})=>{
  const raw=body===undefined?'':JSON.stringify(body);const nonce=randomBytes(18).toString('base64url');
  const url=new URL('https://ems.example/api/'+path);
  const sig=createHmac('sha256',secret).update(canonicalRequest({timestamp:String(ts),nonce,method,pathWithQuery:(tamperPath||url.pathname+url.search),bodyHash:sha(raw),grantHash:sha(grant)})).digest('hex');
  const h={'x-persora-timestamp':String(ts),'x-persora-nonce':nonce,'x-persora-signature':sig,'content-type':'application/json',...headers};if(grant)h['x-ems-grant']=grant;
  return onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request(url,{method,headers:h,body:raw||undefined})});
 };
 const enable=async()=>{const r=await session('platform/persora-integration','PATCH',{enabled:true,secret:SECRET});assert.equal(r.status,200,await r.clone().text());return r.json()};
 const connect=async(email='alpha@example.test',ref='persora-user-1')=>{const r=await signed('persora/authorize',{method:'POST',body:{email,password:PASSWORD,persora_user_ref:ref,label:'Persora test'}});return{r,data:await r.json()}};
 return{sql,env,session,signed,enable,connect,adminToken,objects};
}

test('Persora API is closed until the owner enables it with a shared secret', async()=>{
 const f=fixture();
 let r=await f.signed('persora/ping',{method:'POST',body:{}});
 assert.equal(r.status,403);assert.equal((await r.json()).code,'integration_disabled');
 // Owner-only configuration; administrators cannot read or change it.
 assert.equal((await f.session('platform/persora-integration','GET',undefined,f.adminToken())).status,403);
 r=await f.session('platform/persora-integration','PATCH',{enabled:true});
 assert.equal(r.status,400,'cannot enable without a secret');
 r=await f.session('platform/persora-integration','PATCH',{secret:'too-short'});
 assert.equal(r.status,400);
 const status=await f.enable();
 assert.equal(status.enabled,true);assert.equal(status.ready,true);assert.equal(status.secretHint,'••••'+SECRET.slice(-4));
 const text=JSON.stringify(status);assert.ok(!text.includes(SECRET)&&!text.includes('ciphertext'),'secret never returned');
 const stored=f.sql.prepare("SELECT setting_value FROM platform_settings WHERE setting_key='persora_integration'").get().setting_value;
 assert.ok(!stored.includes(SECRET),'secret is encrypted at rest');assert.match(JSON.parse(stored).secret_ciphertext,/^v1\./);
 r=await f.signed('persora/ping',{method:'POST',body:{}});
 assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
 // Disabling blocks access again (while keeping the secret).
 await f.session('platform/persora-integration','PATCH',{enabled:false});
 r=await f.signed('persora/ping',{method:'POST',body:{}});
 assert.equal(r.status,403);
});

test('signature gate rejects unsigned, wrong-secret, stale and tampered requests', async()=>{
 const f=fixture();await f.enable();
 let r=await onRequest({env:f.env,params:{path:['persora','ping']},request:new Request('https://ems.example/api/persora/ping',{method:'POST',body:'{}'})});
 assert.equal(r.status,401);assert.equal((await r.json()).code,'signature_invalid');
 r=await f.signed('persora/ping',{method:'POST',body:{},secret:'another-secret-that-is-long-enough-000000'});
 assert.equal(r.status,401);assert.equal((await r.json()).code,'signature_invalid');
 r=await f.signed('persora/ping',{method:'POST',body:{},ts:Math.floor(Date.now()/1000)-3600});
 assert.equal(r.status,401);assert.equal((await r.json()).code,'request_expired');
 r=await f.signed('persora/files?store_id='+shopB1,{tamperPath:'/api/persora/files?store_id='+shopA1});
 assert.equal(r.status,401,'query string is covered by the signature');
 // An EMS browser session is never accepted on the Persora surface.
 r=await f.session('persora/account','GET',undefined,f.adminToken());
 assert.equal(r.status,401);
 // Environment-managed secrets cannot be replaced from the console.
 const g=fixture({PERSORA_INTEGRATION_SECRET:SECRET});
 r=await g.session('platform/persora-integration','PATCH',{secret:'x'.repeat(40)});assert.equal(r.status,409);
 r=await g.session('platform/persora-integration','PATCH',{enabled:true});assert.equal(r.status,200);
 assert.equal((await r.json()).secretSource,'environment');
 assert.equal((await g.signed('persora/ping',{method:'POST',body:{}})).status,200);
});

test('authorize validates EMS admin credentials and historical Vaultium purchase', async()=>{
 const f=fixture();await f.enable();
 let r=await f.signed('persora/authorize',{method:'POST',body:{email:'alpha@example.test',password:'wrong password',persora_user_ref:'u1'}});
 assert.equal(r.status,401);assert.equal((await r.json()).code,'invalid_credentials');
 r=await f.signed('persora/authorize',{method:'POST',body:{email:'nobody@example.test',password:PASSWORD,persora_user_ref:'u1'}});
 assert.equal(r.status,401);
 // Pending (unapproved) purchase does not count.
 let {r:never,data:nd}=await f.connect('never@example.test','u2');
 assert.equal(never.status,403);assert.equal(nd.code,'vaultium_not_eligible');
 // Expired license / expired add-on DO count (purchased at least once).
 let {r:ok,data}=await f.connect('alpha@example.test','u1');
 assert.equal(ok.status,201);assert.match(data.grant,/^pg1_/);assert.equal(data.admin.email,'alpha@example.test');
 assert.equal(data.eligibility.eligible,true);assert.deepEqual(data.eligibility.sources,['license']);assert.equal(data.eligibility.vaultium_active,false);
 assert.ok(!('password_hash' in data.admin));
 const row=f.sql.prepare('SELECT * FROM persora_grants WHERE admin_id=?').get(adminA);
 assert.equal(row.token_hash,'sha256:'+sha(data.grant),'only the token hash is stored');
 assert.ok(!JSON.stringify(row).includes(data.grant));
 assert.ok(f.sql.prepare("SELECT 1 FROM activity_logs WHERE action='persora.connected' AND actor_id=?").get(adminA),'connection is audited');
 const beta=await f.connect('beta@example.test','u3');assert.equal(beta.r.status,201);assert.deepEqual(beta.data.eligibility.sources,['addon']);
 // Deactivated administrators cannot connect.
 f.sql.prepare('UPDATE administrators SET active=0 WHERE id=?').run(adminB);
 const off=await f.connect('beta@example.test','u3');assert.equal(off.r.status,403);assert.equal(off.data.code,'account_inactive');
});

test('grant scopes every read to its own administrator (no IDOR)', async()=>{
 const f=fixture();await f.enable();
 const {data}=await f.connect();const grant=data.grant;
 let r=await f.signed('persora/account',{grant});
 assert.equal(r.status,200);let acct=await r.json();
 assert.deepEqual(acct.stores.map(s=>s.id).sort(),[shopA1,shopA2].sort());
 assert.equal(acct.total_files,2);assert.equal(acct.stores.find(s=>s.id===shopA1).file_count,1);
 r=await f.signed('persora/files',{grant});let list=await r.json();
 assert.deepEqual(list.files.map(x=>x.id).sort(),[fileA1,fileA2].sort());
 assert.ok(list.files.every(x=>!('r2_key' in x)&&!('uploaded_by' in x)&&!('admin_id' in x)),'storage keys stay private');
 r=await f.signed('persora/files?store_id='+shopA1+'&q=sal-001',{grant});list=await r.json();
 assert.deepEqual(list.files.map(x=>x.id),[fileA1]);assert.equal(list.files[0].category,'invoice');
 // Another administrator's shop and file are indistinguishable from missing ones.
 assert.equal((await f.signed('persora/files?store_id='+shopB1,{grant})).status,404);
 assert.equal((await f.signed(`persora/files/${fileB1}/content`,{grant})).status,404);
 assert.equal((await f.signed(`persora/files/${encodeURIComponent("x' or 1=1")}/content`,{grant})).status,404);
 assert.equal((await f.signed('persora/files?store_id=eq.'+shopB1,{grant})).status,404);
 r=await f.signed(`persora/files/${fileA1}/content`,{grant});
 assert.equal(r.status,200);assert.equal(await r.text(),'%PDF-1.4 ok');
 assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/^attachment/);
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 // No grant / forged grant.
 assert.equal((await f.signed('persora/account')).status,401);
 r=await f.signed('persora/account',{grant:'pg1_'+'A'.repeat(43)});assert.equal((await r.json()).code,'grant_invalid');
});

test('EMS Vaultium is read-only through Persora: write verbs are refused by the API', async()=>{
 const f=fixture();await f.enable();
 const {data}=await f.connect();const grant=data.grant;
 const before=f.sql.prepare('SELECT id,filename,r2_key FROM vaultium_files ORDER BY id').all();
 for(const [path,method] of [[`persora/files/${fileA1}/content`,'DELETE'],[`persora/files/${fileA1}/content`,'PUT'],[`persora/files/${fileA1}`,'PATCH'],['persora/files','POST'],[`persora/files/${fileA1}`,'DELETE'],['persora/account','POST']]){
  const r=await f.signed(path,{method,grant,body:method==='DELETE'?undefined:{filename:'renamed.pdf'}});
  assert.equal(r.status,405,`${method} ${path}`);
 }
 assert.deepEqual(f.sql.prepare('SELECT id,filename,r2_key FROM vaultium_files ORDER BY id').all(),before);
 assert.ok(f.objects.has('vaultium/a1/receipt.pdf'));
});

test('grants end on password change, deactivation, revoke, reconnect and owner revoke-all', async()=>{
 const f=fixture();await f.enable();
 let {data}=await f.connect();
 assert.equal((await f.signed('persora/account',{grant:data.grant})).status,200);
 // Password change invalidates.
 f.sql.prepare('UPDATE administrators SET password_hash=? WHERE id=?').run(pw('a brand new password'),adminA);
 let r=await f.signed('persora/account',{grant:data.grant});assert.equal(r.status,401);assert.equal((await r.json()).code,'grant_invalid');
 f.sql.prepare('UPDATE administrators SET password_hash=? WHERE id=?').run(pw(PASSWORD),adminA);
 r=await f.signed('persora/account',{grant:data.grant});assert.equal(r.status,401,'stays revoked after reverting the password');
 // Deactivation reports account_inactive (Persora shows Reconnect).
 ({data}=await f.connect());
 f.sql.prepare('UPDATE administrators SET active=0 WHERE id=?').run(adminA);
 r=await f.signed('persora/account',{grant:data.grant});assert.equal(r.status,403);assert.equal((await r.json()).code,'account_inactive');
 f.sql.prepare('UPDATE administrators SET active=1 WHERE id=?').run(adminA);
 // Reconnecting the same Persora user retires the previous grant.
 const first=data.grant;({data}=await f.connect());
 assert.equal((await f.signed('persora/account',{grant:first})).status,401);
 assert.equal((await f.signed('persora/account',{grant:data.grant})).status,200);
 // Explicit revoke (Persora "Disconnect").
 assert.equal((await f.signed('persora/revoke',{method:'POST',grant:data.grant,body:{}})).status,200);
 assert.equal((await f.signed('persora/account',{grant:data.grant})).status,401);
 // Owner revoke-all.
 ({data}=await f.connect());const b=await f.connect('beta@example.test','persora-user-2');
 let st=await (await f.session('platform/persora-integration')).json();assert.equal(st.activeGrants,2);
 r=await f.session('platform/persora-integration/revoke-all','POST',{});assert.equal((await r.json()).revoked,2);
 assert.equal((await f.signed('persora/account',{grant:data.grant})).status,401);
 assert.equal((await f.signed('persora/account',{grant:b.data.grant})).status,401);
 // Expired grants are refused.
 ({data}=await f.connect());
 f.sql.prepare("UPDATE persora_grants SET expires_at=? WHERE revoked_at IS NULL").run(new Date(Date.now()-1000).toISOString());
 assert.equal((await f.signed('persora/account',{grant:data.grant})).status,401);
 // Owner audit trail exists and never contains the secret.
 const logs=f.sql.prepare("SELECT action,metadata FROM platform_activity_logs WHERE entity_type='persora_integration'").all();
 assert.ok(logs.some(l=>l.action==='persora_integration.revoked_all'));assert.ok(logs.every(l=>!l.metadata.includes(SECRET)));
});
