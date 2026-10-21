import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {mobileScannerApi,scannerActiveDrafts,consumeScannerLogin} from '../functions/_lib/mobile_scanner.js';
import {SCANNER_PWA} from '../functions/_lib/app_store.js';
import {pharmacyApi} from '../functions/_lib/pharmacy_api.js';
import {db} from '../functions/_lib/db.js';
const ids=Array.from({length:10},(_,n)=>String(n+1).repeat(8)+'-'+String(n+1).repeat(4)+'-4'+String(n+1).repeat(3)+'-8'+String(n+1).repeat(3)+'-'+String(n+1).repeat(12));
const [store,otherStore,admin,user,otherUser,terminal,secondTerminal,draft,secondDraft]=ids;
const s={role:'staff',id:user,storeId:store};
function fixture(){
 const sql=new Database(':memory:');sql.pragma('foreign_keys=ON');sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const date=new Date().toISOString();
 sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(admin,'Admin','123','admin@test.com','x','ADM-T',date,date);
 const shop=sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
 shop.run(store,admin,'One','123','S1','active','pharmacy','pharmacy',date,date);shop.run(otherStore,admin,'Two','123','S2','active','pharmacy','pharmacy',date,date);
 const env={DB_DRIVER:'d1',DB:{
  prepare(query){return{bind(...v){const values=v.map(x=>typeof x==='boolean'?Number(x):x);const execute=()=>{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...values):(stmt.run(...values),[])}};return{
   execute,async all(){try{return execute()}catch(e){return{success:false,error:e.message}}},
   async run(){const result=sql.prepare(query).run(...values);return{meta:{changes:result.changes}}}
  }}}},
  async batch(statements){return sql.transaction(()=>statements.map(x=>x.execute()))()}
 }};
 const route=(path,method='GET',body={},actor=s,allowed=()=>true)=>mobileScannerApi({env,s:actor,allowed,path:path.split('?')[0],method,request:new Request('https://example.test/api/'+path+(method==='GET'&&!path.includes('?')?'?terminal_id='+terminal:''),{method,body:method==='POST'?JSON.stringify(body):undefined})});
 const get=(path,actor=s,allowed=()=>true)=>route(path.split('?')[0],'GET',{},actor,allowed);
 return {sql,env,route,get};
}
const data=async r=>r.json();
const open=async(f,id=draft,t=terminal,actor=s,allowed=()=>true)=>f.route('scanner/drafts','POST',{draft_id:id,terminal_id:t},actor,allowed);
const bind=async(f,id=draft,actor=s,t=terminal)=>data(await f.route(`scanner/drafts/${id}/bind`,'POST',{terminal_id:t},actor));
const ev=(id,actor,binding,product)=>({event_id:id,binding_id:binding,product_id:product});
async function product(f){const response=await pharmacyApi({env:f.env,s,allowed:()=>true,path:'pharmacy/products',method:'POST',request:new Request('https://example.test/api/pharmacy/products',{method:'POST',body:JSON.stringify({name:'Tablet',dosage_form:'tablet',base_unit:'tablet',sale_price:5,units:[{unit_label:'tablet',factor_to_base:1,can_sell:true,can_purchase:true}]})})});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return data(response)}

test('Scanner PWA is a virtual installable listing, never an APK',()=>{assert.equal(SCANNER_PWA.kind,'pwa');assert.equal(SCANNER_PWA.install_url,'/scanner/');assert.equal(SCANNER_PWA.apk_filename,undefined)});

test('D1: distinct counters/drafts, shop isolation, permissions, no invoice/stock changes; idempotent retries and save barrier',async()=>{
 const f=fixture();try{
  const p=await product(f);assert.equal((await open(f)).status,201);assert.equal((await open(f,secondDraft,secondTerminal,{...s,id:otherUser})).status,201);
  assert.equal((await open(f,crypto.randomUUID(),crypto.randomUUID(),{...s,storeId:otherStore},()=>false)).status,403);
  const b=await bind(f);assert.ok(b.binding_id);const b2=await bind(f,secondDraft,{...s,id:otherUser},secondTerminal);
  const event=crypto.randomUUID(),a=await f.route(`scanner/drafts/${draft}/events`,'POST',ev(event,s,b.binding_id,p.id));assert.equal(a.status,202,JSON.stringify(await a.clone().json()));
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(event,s,b.binding_id,p.id))).status,200);
  assert.equal((await f.route(`scanner/drafts/${secondDraft}/events`,'POST',ev(event,null,b2.binding_id,p.id),{...s,id:otherUser})).status,409);
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),null,b.binding_id,p.id),{...s,storeId:otherStore})).status,404);
  assert.equal((await f.route(`scanner/drafts/${draft}/prepare`,'POST',{terminal_id:terminal,save_key:crypto.randomUUID()})).status,409);
  assert.equal((await f.route(`scanner/drafts/${draft}/ack`,'POST',{terminal_id:secondTerminal,event_id:event,status:'applied'})).status,403);
  assert.equal((await f.route(`scanner/drafts/${draft}/ack`,'POST',{terminal_id:terminal,event_id:event,status:'applied'})).status,200);
  const key=crypto.randomUUID();assert.equal((await f.route(`scanner/drafts/${draft}/prepare`,'POST',{terminal_id:terminal,save_key:key})).status,200);
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),s,b.binding_id,p.id))).status,409);
  assert.equal((await f.route(`scanner/drafts/${draft}/finish`,'POST',{terminal_id:terminal})).status,409);
  assert.equal((await f.route(`scanner/drafts/${draft}/resume`,'POST',{terminal_id:terminal,confirmed_failed:true})).status,200);
  assert.equal((await f.route(`scanner/drafts/${draft}/cancel`,'POST',{terminal_id:terminal})).status,200);
  assert.equal(f.sql.prepare('SELECT status FROM scanner_events WHERE id=?').get(event).status,'rejected');
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),s,b.binding_id,p.id))).status,409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invoices').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM pharmacy_stock_movements').get().n,0);
 }finally{f.sql.close()}
});

test('D1: permanent header QR signs in once, never auto-selects a draft, and preserves permissions',async()=>{
 const f=fixture();try{
  const p=await product(f);await open(f);await open(f,secondDraft,secondTerminal,{...s,id:otherUser});
  const sign=await f.route('scanner/login-code','POST');assert.equal(sign.status,200);const secret=new URLSearchParams(new URL((await data(sign)).login_url).hash.slice(1)).get('login');
  const args={env:f.env,request:new Request('https://example.test/api/scanner/login/consume'),token:secret,issueToken:async payload=>JSON.stringify(payload),authorize:async()=>({...s})};
  const claimed=await consumeScannerLogin(args);assert.equal(claimed.status,200,JSON.stringify(await claimed.clone().json()));const phone=await claimed.json();assert.equal(phone.binding_id,undefined);assert.equal(phone.draft_id,undefined);
  assert.equal((await consumeScannerLogin(args)).status,410);
  const qrPhone={...s,scannerOnly:true,scannerLogin:true};
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:crypto.randomUUID(),terminal_id:crypto.randomUUID()},qrPhone)).status,403);
  const listed=await data(await scannerActiveDrafts({env:f.env,s:qrPhone,allowed:()=>true}));assert.equal(listed.length,2);
  const binding=await data(await f.route(`scanner/drafts/${draft}/bind`,'POST',{},qrPhone));assert.ok(binding.binding_id);
  assert.equal((await f.route(`scanner/drafts/${secondDraft}/events`,'POST',ev(crypto.randomUUID(),null,binding.binding_id,p.id),qrPhone)).status,403);
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),null,binding.binding_id,p.id),qrPhone)).status,202);
  f.sql.prepare('UPDATE scanner_drafts SET last_seen=? WHERE id=?').run('2020-01-01T00:00:00Z',draft);
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),null,binding.binding_id,p.id),qrPhone)).status,409);
  assert.equal((await consumeScannerLogin({...args,token:'invalid'})).status,400);
  assert.equal((await f.route('scanner/login-code','POST',{},qrPhone)).status,403);
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:crypto.randomUUID(),terminal_id:crypto.randomUUID()},s,()=>false)).status,403);
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:crypto.randomUUID(),terminal_id:crypto.randomUUID()},{...s,readOnly:true})).status,403);
  f.sql.prepare("UPDATE stores SET shop_type='supershop',business_type='supershop' WHERE id=?").run(store);
  assert.equal((await scannerActiveDrafts({env:f.env,s,allowed:()=>true})).status,403);
 }finally{f.sql.close()}
});

test('D1: catalog search, internal code assignment and print value require bound draft and inventory edit permission',async()=>{
 const f=fixture();try{
  const p=await product(f);await open(f);const b=await bind(f);
  const catalog=await data(await f.route(`scanner/drafts/${draft}/catalog?binding_id=${b.binding_id}&q=Tablet`));
  assert.equal(catalog.length,1);assert.equal(catalog[0].id,p.id);
  assert.equal((await f.route(`scanner/drafts/${draft}/code`,'POST',{product_id:p.id,binding_id:b.binding_id},s,(_s,_section,verb)=>verb!=='edit')).status,403);
  const response=await f.route(`scanner/drafts/${draft}/code`,'POST',{product_id:p.id,binding_id:b.binding_id});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const first=await data(response);assert.match(first.barcode,/^EMS[A-F0-9]{16}$/);
  const again=await data(await f.route(`scanner/drafts/${draft}/code`,'POST',{product_id:p.id,binding_id:b.binding_id}));assert.equal(again.barcode,first.barcode);assert.equal(again.existing,true);
  const lookup=await data(await f.route(`scanner/drafts/${draft}/catalog?binding_id=${b.binding_id}&q=${first.barcode}`));assert.equal(lookup[0].barcode,first.barcode);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM activity_logs WHERE action=?').get('assign pharmacy scanner barcode').n,1);
  assert.equal((await f.route(`scanner/drafts/${draft}/code`,'POST',{product_id:p.id,binding_id:crypto.randomUUID()})).status,403);
 }finally{f.sql.close()}
});

test('Shared PC Scanner preserves Pharmacy checkout and bundled phone assets with scoped service worker',()=>{
 const pc=readFileSync(new URL('../assets/js/pshop.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../functions/_lib/mobile_scanner.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../scanner/sw.js',import.meta.url),'utf8');
 assert.match(pc,/scanner\.prepare\(body\.idempotencyKey\)/);
 assert.match(pc,/ctx\.api\('pharmacy\/checkout'/);
 assert.match(pc,/scanner\.finish\(\)/);
 assert.doesNotMatch(api,/rpc\/pharmacy_post_invoice|POST.*pharmacy\/checkout/);
 assert.match(sw,/!=='GET'/);assert.match(sw,/\/api\//);
 assert.match(readFileSync(new URL('../scanner/scanner.js',import.meta.url),'utf8'),/import\('\/scanner\/zxing-fallback\.js'\)/);
});

test('D1: scanner does not post stock; existing Pharmacy checkout alone posts invoice, finish verifies operation',async()=>{
 const f=fixture();try{
  const p=await product(f);
  const purchase=await pharmacyApi({env:f.env,s,allowed:()=>true,path:'pharmacy/purchases',method:'POST',request:new Request('https://example.test/api/pharmacy/purchases',{method:'POST',body:JSON.stringify({idempotencyKey:'scanner-test-purchase-1',lines:[{productId:p.id,unitLabel:'tablet',quantity:4,unitPrice:2}],paidAmount:8})})});assert.equal(purchase.status,201,JSON.stringify(await purchase.clone().json()));
  await open(f);const b=await bind(f),id=crypto.randomUUID(),key=crypto.randomUUID();
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(id,null,b.binding_id,p.id))).status,202);
  const pending=await data(await f.route(`scanner/drafts/${draft}/events?terminal_id=${terminal}`));assert.equal(pending.length,1);assert.equal(pending[0].id,id);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM invoices WHERE kind=?').get('sale').n,0);
  const inventoryId=f.sql.prepare('SELECT inventory_item_id FROM pharmacy_products WHERE id=?').get(p.id).inventory_item_id;
  assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(inventoryId).total_stock,4);
  assert.equal((await f.route(`scanner/drafts/${draft}/ack`,'POST',{terminal_id:terminal,event_id:id,status:'applied'})).status,200);
  assert.equal((await f.route(`scanner/drafts/${draft}/prepare`,'POST',{terminal_id:terminal,save_key:key})).status,200);
  assert.equal((await f.route(`scanner/drafts/${draft}/finish`,'POST',{terminal_id:terminal})).status,409);
  assert.deepEqual(await data(await f.route(`scanner/drafts/${draft}/pc-state?terminal_id=${terminal}`)),{status:'saving',save_key:key});
  const sale=await pharmacyApi({env:f.env,s,allowed:()=>true,path:'pharmacy/checkout',method:'POST',request:new Request('https://example.test/api/pharmacy/checkout',{method:'POST',body:JSON.stringify({idempotencyKey:key,kind:'sale',lines:[{productId:p.id,unitLabel:'tablet',quantity:1,unitPrice:5}],paidAmount:5})})});
  assert.equal(sale.status,201,JSON.stringify(await sale.clone().json()));
  const finished=await data(await f.route(`scanner/drafts/${draft}/finish`,'POST',{terminal_id:terminal}));assert.equal(finished.status,'closed');assert.equal((await f.route(`scanner/drafts/${draft}/finish`,'POST',{terminal_id:terminal})).status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM invoices WHERE kind=?').get('sale').n,1);
  assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(inventoryId).total_stock,3);
  assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),null,b.binding_id,p.id))).status,409);
 }finally{f.sql.close()}
});

test('D1: legacy Pharmacy business_type takes priority over electronics shop_type for PC, phone, pairing, profile, and browse',async()=>{
 const f=fixture();try{
  f.sql.prepare('UPDATE stores SET shop_type=?,business_type=? WHERE id=?').run('electronics','pharmacy',store);
  f.sql.prepare('INSERT INTO staff(id,store_id,full_name,phone,email,user_id,password_hash,permissions,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(user,store,'Pharmacist','01700000000','staff@test.test','PHARM-01','x','{}',new Date().toISOString(),new Date().toISOString());
  const p=await product(f);
  const profile=await f.route('scanner/profile','GET');assert.equal(profile.status,200,JSON.stringify(await profile.clone().json()));
  const details=await data(profile);assert.equal(details.shop.code,'S1');assert.equal(details.user.user_id,'PHARM-01');assert.equal(details.user.name,'Pharmacist');
  const browse=await data(await f.route('scanner/catalog?q=Tablet','GET'));assert.equal(browse[0].id,p.id);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM scanner_bindings').get().n,0); // browsing alone creates no routing
  assert.equal((await open(f)).status,201);
  const listing=await data(await scannerActiveDrafts({env:f.env,s,allowed:()=>true}));assert.equal(listing[0].draft_id,draft);
  const signIn=await f.route('scanner/login-code','POST');assert.equal(signIn.status,200);
  const b=await bind(f);assert.equal((await f.route(`scanner/drafts/${draft}/events`,'POST',ev(crypto.randomUUID(),null,b.binding_id,p.id))).status,202);
  f.sql.prepare('UPDATE stores SET business_type=? WHERE id=?').run('electronics',store);
  const electronicsProfile=await data(await f.route('scanner/profile','GET'));assert.equal(electronicsProfile.shop.type,'electronics');
  const electronicsItems=await data(await f.route('scanner/catalog?q=Tablet','GET'));assert.match(electronicsItems[0].name,/Tablet/);assert.notEqual(electronicsItems[0].id,p.id);
  assert.equal((await scannerActiveDrafts({env:f.env,s,allowed:()=>true})).status,200);
 }finally{f.sql.close()}
});

test('D1: purchase-only staff can scan a Pharmacy purchase draft; only existing purchase save changes stock',async()=>{
 const f=fixture();try{
  const p=await product(f),purchaseId=crypto.randomUUID(),purchaseTerminal=crypto.randomUUID();
  const purchaseOnly=(_actor,section,verb)=>section==='inventory'&&verb==='view'||section==='purchase'&&verb==='add';
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:crypto.randomUUID(),terminal_id:crypto.randomUUID(),kind:'sale'},s,purchaseOnly)).status,403);
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:purchaseId,terminal_id:purchaseTerminal,kind:'purchase'},s,purchaseOnly)).status,201);
  const listing=await data(await scannerActiveDrafts({env:f.env,s,allowed:purchaseOnly}));assert.equal(listing.length,1);assert.equal(listing[0].kind,'purchase');
  const bound=await data(await f.route(`scanner/drafts/${purchaseId}/bind`,'POST',{},s,purchaseOnly));
  const event=crypto.randomUUID(),saveKey=crypto.randomUUID();
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/events`,'POST',ev(event,null,bound.binding_id,p.id),s,purchaseOnly)).status,202);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM invoices WHERE kind='purchase'").get().n,0);
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/ack`,'POST',{terminal_id:purchaseTerminal,event_id:event,status:'applied'},s,purchaseOnly)).status,200);
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/prepare`,'POST',{terminal_id:purchaseTerminal,save_key:saveKey},s,purchaseOnly)).status,200);
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/finish`,'POST',{terminal_id:purchaseTerminal},s,purchaseOnly)).status,409);
  const invoice=await pharmacyApi({env:f.env,s,allowed:()=>true,path:'pharmacy/purchases',method:'POST',request:new Request('https://example.test/api/pharmacy/purchases',{method:'POST',body:JSON.stringify({idempotencyKey:saveKey,lines:[{productId:p.id,unitLabel:'tablet',quantity:1,unitPrice:2}],paidAmount:2})})});
  assert.equal(invoice.status,201,JSON.stringify(await invoice.clone().json()));
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/finish`,'POST',{terminal_id:purchaseTerminal},s,purchaseOnly)).status,200);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM invoices WHERE kind='purchase'").get().n,1);
  const invId=f.sql.prepare('SELECT inventory_item_id FROM pharmacy_products WHERE id=?').get(p.id).inventory_item_id;
  assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(invId).total_stock,1);
 }finally{f.sql.close()}
});

test('Pharmacy PC save handlers retain posted outcome and never resume a draft after confirmed posting',()=>{
 const source=readFileSync(new URL('../assets/js/pshop.js',import.meta.url),'utf8');
 assert.match(source,/const result=await ctx\.api\('pharmacy\/checkout',[\s\S]{0,100}posted=true/);
 assert.match(source,/if\(!posted&&e\.status>=400&&e\.status<500\)/);
 assert.match(source,/async function purchaseModal[\s\S]{0,1600}pendingSaveKey=null,posted=false/);
 assert.match(source,/if\(!posted&&error\.status>=400&&error\.status<500\)/);
});

test('D1: Electronics sale/purchase scan queues are shop-isolated, retry-safe and post stock only through existing invoice RPC',async()=>{
 const f=fixture();try{
  const p=await product(f),itemId=f.sql.prepare('SELECT inventory_item_id FROM pharmacy_products WHERE id=?').get(p.id).inventory_item_id;
  f.sql.prepare('UPDATE stores SET business_type=?,shop_type=? WHERE id=?').run('electronics','electronics',store);
  f.sql.prepare('UPDATE inventory_items SET total_stock=3 WHERE id=?').run(itemId);
  const saleId=crypto.randomUUID(),pc=crypto.randomUUID(),key=crypto.randomUUID();
  const sale=await f.route('scanner/drafts','POST',{draft_id:saleId,terminal_id:pc,kind:'sale'});assert.equal(sale.status,201,JSON.stringify(await sale.clone().json()));
  const bound=await data(await f.route(`scanner/drafts/${saleId}/bind`,'POST',{}));
  const event=crypto.randomUUID();assert.equal((await f.route(`scanner/drafts/${saleId}/events`,'POST',ev(event,null,bound.binding_id,itemId))).status,202);
  const sync=await data(await f.route(`scanner/drafts/${saleId}/sync?binding_id=${bound.binding_id}`,'GET'));assert.equal(sync.kind,'sale');assert.equal(sync.events[0].status,'pending');
  assert.equal((await f.route(`scanner/drafts/${saleId}/sync?binding_id=${crypto.randomUUID()}`,'GET')).status,403);
  assert.equal((await f.route(`scanner/drafts/${saleId}/events`,'POST',ev(crypto.randomUUID(),null,bound.binding_id,itemId),{...s,storeId:otherStore})).status,404);
  assert.equal((await f.route(`scanner/drafts/${saleId}/events`,'POST',ev(event,null,bound.binding_id,itemId))).status,200);
  assert.equal((await f.route(`scanner/drafts/${saleId}/events`,'POST',ev(crypto.randomUUID(),null,bound.binding_id,p.id))).status,409,'Pharmacy product IDs cannot be queued as Electronics inventory');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invoices').get().n,0);assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,3);
  assert.equal((await f.route(`scanner/drafts/${saleId}/prepare`,'POST',{terminal_id:pc,save_key:key})).status,409);
  assert.equal((await f.route(`scanner/drafts/${saleId}/ack`,'POST',{terminal_id:pc,event_id:event,status:'applied'})).status,200);
  assert.equal((await f.route(`scanner/drafts/${saleId}/prepare`,'POST',{terminal_id:pc,save_key:key})).status,200);
  const payload={p_store_id:store,p_kind:'sale',p_invoice_number:'SAL-900001',p_party_id:null,p_invoice_date:new Date().toISOString().slice(0,10),p_payment_method:'cash',p_transaction_id:null,p_notes:null,p_tax_percent:0,p_discount:0,p_paid_amount:5,p_created_by:user,p_lines:[{itemId,quantity:1,unitPrice:5,taxPercent:0,discount:0}],p_operation_key:key};
  assert.equal((await f.route(`scanner/drafts/${saleId}/finish`,'POST',{terminal_id:pc})).status,409);
  const saved=await db(f.env,'rpc/scanner_post_invoice',{method:'POST',body:JSON.stringify(payload)});assert.equal(saved.kind,'sale');
  const retried=await db(f.env,'rpc/scanner_post_invoice',{method:'POST',body:JSON.stringify({...payload,p_invoice_number:'SAL-900002'})});assert.equal(retried.id,saved.id);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invoices').get().n,1);assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,2);
  assert.equal((await f.route(`scanner/drafts/${saleId}/resume`,'POST',{terminal_id:pc,confirmed_failed:true})).status,409);
  assert.equal((await f.route(`scanner/drafts/${saleId}/finish`,'POST',{terminal_id:pc})).status,200);
  const purchaseId=crypto.randomUUID(),pc2=crypto.randomUUID(),key2=crypto.randomUUID();
  const purchaseOnly=(_actor,section,verb)=>section==='inventory'&&verb==='view'||section==='purchase'&&verb==='add';
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:crypto.randomUUID(),terminal_id:crypto.randomUUID(),kind:'sale'},s,purchaseOnly)).status,403);
  assert.equal((await f.route('scanner/drafts','POST',{draft_id:purchaseId,terminal_id:pc2,kind:'purchase'},s,purchaseOnly)).status,201);
  const bound2=await data(await f.route(`scanner/drafts/${purchaseId}/bind`,'POST',{},s,purchaseOnly));
  const event2=crypto.randomUUID();assert.equal((await f.route(`scanner/drafts/${purchaseId}/events`,'POST',ev(event2,null,bound2.binding_id,itemId),s,purchaseOnly)).status,202);
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/ack`,'POST',{terminal_id:pc2,event_id:event2,status:'applied'},s,purchaseOnly)).status,200);
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/prepare`,'POST',{terminal_id:pc2,save_key:key2},s,purchaseOnly)).status,200);
  const bought=await db(f.env,'rpc/scanner_post_invoice',{method:'POST',body:JSON.stringify({...payload,p_kind:'purchase',p_invoice_number:'PUR-900001',p_operation_key:key2})});assert.equal(bought.kind,'purchase');
  assert.equal((await f.route(`scanner/drafts/${purchaseId}/finish`,'POST',{terminal_id:pc2},s,purchaseOnly)).status,200);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invoices').get().n,2);assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,3);
  await assert.rejects(db(f.env,'rpc/scanner_post_invoice',{method:'POST',body:JSON.stringify({...payload,p_invoice_number:'SAL-900003',p_operation_key:crypto.randomUUID(),p_lines:[{itemId,quantity:2,unitPrice:5},{itemId,quantity:2,unitPrice:5}]})}),/Insufficient stock/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invoices').get().n,2);assert.equal(f.sql.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,3);
  const listed=await data(await scannerActiveDrafts({env:f.env,s,allowed:purchaseOnly}));assert.equal(listed.filter(x=>x.kind==='sale').length,0);
 }finally{f.sql.close()}
});
