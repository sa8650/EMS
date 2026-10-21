import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import Database from 'better-sqlite3';
import {onRequest} from '../functions/api/[[path]].js';
import {extraEmailDocuments,extraEmailDocument} from '../functions/_lib/connectx_email_documents.js';

const [admin,shop,other,license,staff,invoice,invoice2,payment,returned,exchanged]=Array.from({length:10},(_,n)=>`${String(n+1).padStart(8,'0')}-1111-4111-8111-${String(n+1).padStart(12,'0')}`);
function fixture(){
 const sql=new Database(':memory:');sql.pragma('foreign_keys=ON');sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 // Build the pre-direct gateway schema and apply the real compatibility migration,
 // so these route tests exercise status normalization and data-preserving rebuild.
 sql.exec(`CREATE TABLE connectx_devices (
   id TEXT PRIMARY KEY, administrator_id TEXT NOT NULL, store_id TEXT NOT NULL,
   device_public_id TEXT NOT NULL UNIQUE, device_name TEXT, android_version TEXT,
   sim_subscription_id TEXT, sim_carrier TEXT, phone_number TEXT,
   status TEXT NOT NULL DEFAULT 'pending_test', is_primary INTEGER NOT NULL DEFAULT 0,
   last_seen TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 )`);
 sql.exec(readFileSync(new URL('../supabase/d1/migration_connectx_direct_sms.sql',import.meta.url),'utf8'));
 const now=new Date().toISOString(),later=new Date(Date.now()+86400000*30).toISOString();
 sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(admin,'Owner','123','owner@example.test','x','OWNER',now,now);
 const createShop=sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
 createShop.run(shop,admin,'Shop A','123','A','active','electronics','electronics',now,now);createShop.run(other,admin,'Shop B','123','B','active','electronics','electronics',now,now);
 sql.prepare('INSERT INTO licenses(id,admin_id,duration_months,max_stores,payment_method,payment_number,transaction_id,status,connectx_enabled,connectx_daily_limit,starts_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(license,admin,1,2,'other','123','TESTCX','active',1,5,now,later,now);
 const perms={connectx:['view','add'],settings:['view','edit']};
 sql.prepare('INSERT INTO staff(id,store_id,full_name,phone,user_id,password_hash,permissions,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(staff,shop,'Clerk','123','clerk','x',JSON.stringify(perms),now,now);
 sql.prepare('INSERT INTO connectx_settings(id,from_name,from_email,global_daily_limit,enabled,updated_at) VALUES(?,?,?,?,?,?)').run(1,'EMS','owner@example.test',50,1,now);
 const inv=sql.prepare('INSERT INTO invoices(id,store_id,kind,invoice_number,invoice_date,subtotal,paid_amount,total_due,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
 inv.run(invoice,shop,'sale','SAL-100',now.slice(0,10),100,60,40,now,now);inv.run(invoice2,other,'sale','SAL-200',now.slice(0,10),100,60,40,now,now);
 sql.prepare('INSERT INTO due_recoveries(id,store_id,source_type,source_id,amount,created_at) VALUES(?,?,?,?,?,?)').run(payment,shop,'sale',invoice,15,now);
 const env={DB_DRIVER:'d1',MOCK_EMAIL:'1',SESSION_SECRET:'local-unit-test-secret',DB:{
  prepare(query){return{bind(...args){const vals=args.map(x=>typeof x==='boolean'?Number(x):x);const execute=()=>{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...vals):(stmt.run(...vals),[])}};return{execute,async all(){try{return execute()}catch(e){return{success:false,error:e.message}}},async run(){const result=execute();return{...result,meta:{changes:result.results?.length||1}}}}}}},
  async batch(stmts){return sql.transaction(()=>stmts.map(x=>x.execute()))()}
 }};
 const signPayload=payload=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${h}.${p}.${createHmac('sha256',env.SESSION_SECRET).update(h+'.'+p).digest('base64url')}`};
 const sign=(storeId=shop,permissions=perms)=>signPayload({role:'staff',id:staff,storeId,permissions,exp:Math.floor(Date.now()/1000)+1000});
 const adminToken=()=>signPayload({role:'admin',id:admin,exp:Math.floor(Date.now()/1000)+1000});
 const reqBearer=(path,method='GET',body={},bearer=sign())=>onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request('https://ems.example/api/'+path,{method,headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body)})});
 const req=(path,method='GET',body={},storeId=shop)=>reqBearer(path,method,body,sign(storeId));
 return {sql,env,req,reqBearer,adminToken};
}

test('ConnectX shop settings isolate stores, enforce roles/license quota, and control email sending without changing SMS',async()=>{
 const f=fixture();try{
  const info=await f.req('connectx/email-settings');assert.equal(info.status,200,await info.clone().text());const defaults=await info.json();assert.equal(defaults.daily_limit,5);assert.equal(defaults.from_email,'owner@example.test');
  const over=await f.req('connectx/email-settings','PATCH',{daily_limit:6});assert.equal(over.status,400);
  assert.equal((await f.req('connectx/email-settings','PATCH',{templates:{sale:'<p>Not an invoice</p>'}})).status,400);
  const patch=await f.req('connectx/email-settings','PATCH',{enabled:true,from_name:'A&B Shop',from_email:'shop@example.test',reply_to:'replies@example.test',daily_limit:2});
  assert.equal(patch.status,200,await patch.clone().text());
  const saved=await (await f.req('connectx/email-settings')).json();assert.equal(saved.effective_limit,2);assert.ok(!('templates' in saved),'legacy document templates are not exposed');
  const sale=await f.req('connectx/send','POST',{to:'customer@example.test',subject:'Your sale',body:'Thanks',documentType:'sale',invoiceId:invoice});assert.equal(sale.status,201,await sale.clone().text());
  const first=f.sql.prepare('SELECT from_email,body_html FROM connectx_messages WHERE store_id=?').get(shop);assert.match(first.body_html,/Shop A.*SALES INVOICE/s);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM connectx_shop_email_settings WHERE store_id=?').get(other).n,0);
  f.sql.prepare('UPDATE staff SET permissions=? WHERE id=?').run(JSON.stringify({connectx:['view','add'],settings:['view']}),staff);
  assert.equal((await f.req('connectx/email-settings','PATCH',{daily_limit:0})).status,403);
  f.sql.prepare('UPDATE staff SET permissions=? WHERE id=?').run(JSON.stringify({connectx:['view','add'],settings:['view','edit']}),staff);
  const missing=await f.req('connectx/send','POST',{to:'customer@example.test',subject:'Oops',documentType:'due_reminder',invoiceId:invoice2});assert.equal(missing.status,404);
  const sent=await f.req('connectx/send','POST',{to:'customer@example.test',subject:'Hello',body:'Test',documentType:'due_reminder',invoiceId:invoice});assert.equal(sent.status,201,await sent.clone().text());
  const message=f.sql.prepare('SELECT from_email,body_html FROM connectx_messages WHERE store_id=? AND subject=?').get(shop,'Hello');assert.equal(message.from_email,'shop@example.test');assert.match(message.body_html,/Due reminder/);
  assert.equal((await f.req('connectx/send','POST',{to:'customer@example.test',subject:'Quota reached'})).status,429);
  assert.equal((await f.req('connectx/email-settings','PATCH',{enabled:false})).status,200);
  assert.equal((await f.req('connectx/send','POST',{to:'customer@example.test',subject:'Blocked'})).status,403);
  const available=await (await f.req('connectx/availability')).json();assert.equal(available.enabled,true,'license still active for SMS');assert.equal(available.emailEnabled,false);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM connectx_shop_sms_settings').get().n,0,'email preferences do not change SMS settings');
  const sms=await f.req('shop/sms-settings','PATCH',{enabled:false,auto_sale:false,templates:{SALE:'Custom {shop}'}});assert.equal(sms.status,200,await sms.clone().text());
  const smsSaved=await (await f.req('shop/sms-settings')).json();assert.equal(smsSaved.auto_sale,false,'shop SMS settings save on D1');assert.equal(smsSaved.enabled,false,'shop controls its own SMS switch');
  assert.equal((await f.req('connectx/sms/send','POST',{toPhone:'01700000000',messageBody:'Hello'})).status,403,'shop-disabled SMS cannot be sent');
  assert.equal((await f.req('shop/sms-settings','PATCH',{enabled:true})).status,200);
  assert.equal((await (await f.req('shop/sms-settings')).json()).enabled,true,'shop can re-enable SMS without administrator console');
 }finally{f.sql.close()}
});

test('payment and reminder choices are actual shop records; unrelated shop documents are excluded',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO returns(id,store_id,invoice_id,return_number,refunded_amount,refund_method) VALUES(?,?,?,?,?,?)').run(returned,shop,invoice,'RET-1',10,'bkash');
  f.sql.prepare('INSERT INTO exchanges(id,store_id,invoice_id,exchange_number,action_type,difference_amount) VALUES(?,?,?,?,?,?)').run(exchanged,shop,invoice,'EX-1','refund',5);
  const refunds=await extraEmailDocuments(f.env,shop,'refund');assert.equal(refunds.length,2);
  assert.match((await extraEmailDocument(f.env,shop,'refund','return:'+returned,'Shop A')).html,/RET-1/);
  assert.match((await extraEmailDocument(f.env,shop,'refund','exchange:'+exchanged,'Shop A')).html,/EX-1/);
  const pay=await extraEmailDocuments(f.env,shop,'payment');assert.equal(pay.length,1);assert.equal(pay[0].id,payment);
  const due=await extraEmailDocuments(f.env,shop,'due_reminder');assert.equal(due.length,1);assert.equal(due[0].id,invoice);
  assert.equal(await extraEmailDocument(f.env,shop,'due_reminder',invoice2,'Shop A'),null);
  const doc=await extraEmailDocument(f.env,shop,'payment',payment,'Shop A');assert.match(doc.html,/SAL-100/);assert.match(doc.html,/15\.00/);assert.equal(doc.invoiceId,invoice);
 }finally{f.sql.close()}
});

test('a later license downgrade caps an existing shop email limit without modifying the saved preference',async()=>{
 const f=fixture();try{
  assert.equal((await f.req('connectx/email-settings','PATCH',{daily_limit:5})).status,200);
  f.sql.prepare('UPDATE licenses SET connectx_daily_limit=2 WHERE id=?').run(license);
  const current=await (await f.req('connectx/email-settings')).json();
  assert.equal(current.license_limit,2);assert.equal(current.daily_limit,5);assert.equal(current.effective_limit,2);
  assert.equal((await f.req('connectx/email-settings','PATCH',{daily_limit:3})).status,400);
 }finally{f.sql.close()}
});

test('configured sender, reply-to and original invoice are passed to Brevo without custom templates',async()=>{
 const f=fixture();const realFetch=globalThis.fetch;try{
  const configured=await f.req('connectx/email-settings','PATCH',{from_name:'Shop Mail',from_email:'verified@example.test',reply_to:'reply@example.test'});
  assert.equal(configured.status,200,await configured.clone().text());
  f.env.MOCK_EMAIL='0';f.env.BREVO_API_KEY='test-key';let captured;
  globalThis.fetch=async(_url,options)=>{captured=JSON.parse(options.body);return new Response(JSON.stringify({messageId:'provider-1'}),{status:201,headers:{'content-type':'application/json'}})};
  const result=await f.req('connectx/send','POST',{to:'buyer@example.test',subject:'Invoice',body:'Here is your invoice',documentType:'sale',invoiceId:invoice});assert.equal(result.status,201,await result.clone().text());
  assert.deepEqual(captured.sender,{name:'Shop Mail',email:'verified@example.test'});assert.deepEqual(captured.replyTo,{email:'reply@example.test'});
  assert.match(captured.htmlContent,/SAL-100/);assert.doesNotMatch(captured.htmlContent,/tracker\.test|<img/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM invoices').get().n,2,'sending did not create an invoice');
 }finally{globalThis.fetch=realFetch;f.sql.close()}
});

test('refund email uses a real return or exchange from this shop only',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO returns(id,store_id,invoice_id,return_number,refunded_amount,refund_method) VALUES(?,?,?,?,?,?)').run(returned,shop,invoice,'RET-2',10,'bkash');
  f.sql.prepare('INSERT INTO exchanges(id,store_id,invoice_id,exchange_number,action_type,difference_amount) VALUES(?,?,?,?,?,?)').run(exchanged,shop,invoice,'EX-2','refund',4);
  for(const id of ['return:'+returned,'exchange:'+exchanged]){
   const response=await f.req('connectx/send','POST',{to:'buyer@example.test',subject:'Refund',documentType:'refund',invoiceId:id});assert.equal(response.status,201,await response.clone().text());
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM connectx_messages WHERE store_id=?').get(shop).n,2);
  assert.equal((await f.req('connectx/send','POST',{to:'buyer@example.test',subject:'Refund',documentType:'refund',invoiceId:'return:'+invoice2})).status,404);
 }finally{f.sql.close()}
});

test('rolling deployment: absent migration 064 does not break existing email delivery or SMS, but blocks editing email settings',async()=>{
 const f=fixture();try{
  f.sql.exec('DROP TABLE connectx_shop_email_settings');
  const available=await f.req('connectx/availability');assert.equal(available.status,200,await available.clone().text());
  assert.equal((await available.json()).emailEnabled,true);
  const current=await f.req('connectx/email-settings');assert.equal(current.status,200,await current.clone().text());
  assert.equal((await current.json()).migration_ready,false);
  const saving=await f.req('connectx/email-settings','PATCH',{enabled:false});assert.equal(saving.status,503);
  assert.match((await saving.json()).error,/migration 064/);
  const mail=await f.req('connectx/send','POST',{to:'buyer@example.test',subject:'Existing email',body:'Hello'});
  assert.equal(mail.status,201,await mail.clone().text());
  assert.equal((await f.req('shop/sms-settings','PATCH',{auto_sale:false})).status,200);
 }finally{f.sql.close()}
});

test('saved SMS templates, partial edits, switches and overdue batch are tenant-safe and duplicate-safe',async()=>{
 const f=fixture();try{
  f.sql.prepare('UPDATE staff SET permissions=? WHERE id=?').run(JSON.stringify({connectx:['view','add'],settings:['view','edit'],sales:['view']}),staff);
  f.sql.prepare('UPDATE invoices SET custom_party_phone=?, invoice_date=? WHERE id=?').run('01700123456','2020-01-01',invoice);
  f.sql.prepare('UPDATE invoices SET custom_party_phone=?, invoice_date=? WHERE id=?').run('01700987654','2020-01-01',invoice2);
  const configure=await f.req('shop/sms-settings','PATCH',{enabled:true,auto_sale:true,auto_due_reminder:true,templates:{SALE:'Saved sale {invoice} from {shop}',DUE_REMINDER:'Saved reminder {invoice} due {due}'}});assert.equal(configure.status,200,await configure.clone().text());
  const partial=await f.req('shop/sms-settings','PATCH',{templates:{PAYMENT:'Thank you {amount}'}});assert.equal(partial.status,200,await partial.clone().text());
  const settings=await (await f.req('shop/sms-settings')).json();assert.equal(settings.templates.SALE,'Saved sale {invoice} from {shop}');assert.equal(settings.templates.DUE_REMINDER,'Saved reminder {invoice} due {due}');
  assert.equal((await f.req('shop/sms-settings','PATCH',{templates:{UNKNOWN:'X'}})).status,400);
  assert.equal((await f.req('shop/sms-settings','PATCH',{auto_sale:'false'})).status,400);
  const {enqueueAutoSms}=await import('../functions/_lib/connectx_sms.js');
  const inv=f.sql.prepare('SELECT * FROM invoices WHERE id=?').get(invoice);
  const sent=await enqueueAutoSms(f.env,{storeId:shop,id:staff},'SALE',inv);
  assert.equal(sent.ok,true,JSON.stringify(sent));
  const row=f.sql.prepare("SELECT message_body,status,to_phone FROM connectx_sms_messages WHERE store_id=? AND event_type='SALE'").get(shop);
  assert.equal(row.message_body,'Saved sale SAL-100 from Shop A');assert.equal(row.to_phone,'01700123456');assert.equal(row.status,'pending','queue remains pending in EMS until an Android device claims it');
  const once=await f.req('shop/sms/due-reminders','POST');assert.equal(once.status,200,await once.clone().text());assert.equal((await once.json()).queued,1);
  const reminder=f.sql.prepare("SELECT message_body FROM connectx_sms_messages WHERE store_id=? AND event_type='DUE_REMINDER'").get(shop);
  assert.equal(reminder.message_body,'Saved reminder SAL-100 due 40.00');
  assert.equal((await (await f.req('shop/sms/due-reminders','POST')).json()).duplicates,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM connectx_sms_messages WHERE event_type='DUE_REMINDER'").get().n,1);
  assert.equal((await f.req('shop/sms-settings','PATCH',{auto_due_reminder:false})).status,200);
  assert.equal((await f.req('shop/sms/due-reminders','POST')).status,403);
  assert.equal((await enqueueAutoSms(f.env,{storeId:shop,id:staff},'DUE_REMINDER',inv)).skipped,'disabled');
  f.sql.prepare('UPDATE licenses SET connectx_daily_limit=2 WHERE id=?').run(license);
  assert.equal((await enqueueAutoSms(f.env,{storeId:shop,id:staff},'PAYMENT',inv,{idempotencyKey:'PAYMENT:extra'})).skipped,'daily_limit','automatic triggers honor the licensed daily limit');
  f.sql.prepare("UPDATE licenses SET status='expired' WHERE id=?").run(license);
  assert.equal((await enqueueAutoSms(f.env,{storeId:shop,id:staff},'PAYMENT',inv,{idempotencyKey:'PAYMENT:new'})).skipped,'no_plan','automatic triggers cannot queue on an inactive plan');
  f.sql.prepare('DROP TABLE connectx_shop_sms_settings').run();
  assert.equal((await enqueueAutoSms(f.env,{storeId:shop,id:staff},'SALE',inv)).skipped,'error','failed settings reads must never substitute default settings');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM connectx_sms_messages').get().n,2);
 }finally{f.sql.close()}
});

test('shop SMS Compose lists complete sale amounts, validates document ownership and never accepts legacy status mutation',async()=>{
 const f=fixture();try{
  f.sql.prepare('UPDATE invoices SET custom_party_phone=?,tax_amount=?,line_tax_amount=?,discount=? WHERE id=?').run('01700123456',10,2,4,invoice);
  const list=await f.req('connectx/invoices?kind=sale');assert.equal(list.status,200,await list.clone().text());
  const sales=await list.json();assert.equal(sales.length,1);assert.equal(sales[0].tax_amount,10);assert.equal(sales[0].custom_party_phone,'01700123456');
  assert.equal((await f.req('connectx/invoices?kind=sale&party_id=wrong%26store_id=eq.other')).status,400);
  const request={toPhone:'01700123456',messageType:'Sales Invoice Confirmation',invoiceId:invoice2,messageBody:'Saved sale text'};
  const wrong=await f.req('connectx/sms/send','POST',request);assert.equal(wrong.status,404,await wrong.clone().text());
  assert.equal(f.sql.prepare('SELECT count(*) n FROM connectx_sms_messages').get().n,0);
  const buyer='10000000-2222-4222-8222-000000000001',another='10000000-2222-4222-8222-000000000002',now=new Date().toISOString();
  const insert=f.sql.prepare('INSERT INTO customers(id,store_id,customer_code,name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  insert.run(buyer,shop,'C-SMS-1','Buyer','01700123456',now,now);insert.run(another,shop,'C-SMS-2','Other buyer','01700999999',now,now);
  f.sql.prepare('UPDATE invoices SET party_id=? WHERE id=?').run(buyer,invoice);
  const mismatched=await f.req('connectx/sms/send','POST',{...request,invoiceId:invoice,recipientType:'customer',recipientId:another});assert.equal(mismatched.status,400,await mismatched.clone().text());
  const good=await f.req('connectx/sms/send','POST',{...request,invoiceId:invoice,recipientType:'customer',recipientId:buyer});assert.equal(good.status,201,await good.clone().text());
  assert.equal(f.sql.prepare('SELECT message_body FROM connectx_sms_messages').get().message_body,'Saved sale text','the reviewed message, including manual edits, is queued unchanged');
  assert.equal((await f.req('connectx/sms/status/'+invoice,'PATCH',{status:'sent'})).status,404,'a shop session cannot forge delivery status');
  assert.equal((await f.req('connectx/sms/queue')).status,404,'obsolete queue endpoint has been removed');
  assert.equal(f.sql.prepare('SELECT status FROM connectx_sms_messages').get().status,'pending');
  f.sql.prepare('UPDATE invoices SET total_due=0 WHERE id=?').run(invoice);
  assert.equal((await (await f.req('connectx/invoices?kind=sale&outstanding=1')).json()).length,0,'paid sales are not offered as due reminders');
  assert.equal((await f.req('connectx/sms/send','POST',{...request,toPhone:'01700999999',invoiceId:invoice,messageType:'Due Invoice Reminder'})).status,400);
 }finally{f.sql.close()}
});

test('shop SMS cancellation preserves EMS history and cannot cancel an in-flight message',async()=>{
 const f=fixture();try{
  const perms={connectx:['view','add','delete'],settings:['view','edit']};f.sql.prepare('UPDATE staff SET permissions=? WHERE id=?').run(JSON.stringify(perms),staff);
  const send=await f.req('connectx/sms/send','POST',{toPhone:'01700123456',messageBody:'Please review',messageType:'Custom Message'});
  assert.equal(send.status,201,await send.clone().text());
  const item=f.sql.prepare('SELECT id FROM connectx_sms_messages').get();
  const cancel=await f.req('connectx/sms/messages/'+item.id,'DELETE');assert.equal(cancel.status,200,await cancel.clone().text());
  assert.equal(f.sql.prepare('SELECT count(*) n FROM connectx_sms_messages').get().n,1,'cancelled rows remain in authoritative history');
  assert.equal(f.sql.prepare('SELECT status FROM connectx_sms_messages').get().status,'cancelled');
 }finally{f.sql.close()}
});

test('D1 direct-SMS migration preserves legacy rows and maps ambiguous relay outcomes safely',async()=>{
 const sql=new Database(':memory:');try{
  sql.pragma('foreign_keys=ON');
  sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
  const now=new Date().toISOString(),adminId='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',storeId='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(adminId,'Admin','123','migration@example.test','x','MIG',now,now);
  sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(storeId,adminId,'Migration shop','123','MIG','active','electronics','electronics',now,now);
  const ids=['cccccccc-3333-4333-8333-cccccccccccc','dddddddd-4444-4444-8444-dddddddddddd','eeeeeeee-5555-4555-8555-eeeeeeeeeeee'];
  const put=sql.prepare('INSERT INTO connectx_sms_messages(id,store_id,recipient_type,to_phone,message_type,message_body,status,attempts,request_id,created_at,claimed_at,result_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  put.run(ids[0],storeId,'manual','01700000001','TEST','accepted','SUCCESS',1,'SMS-SUCCESS',now,now,now,now);
  put.run(ids[1],storeId,'manual','01700000002','TEST','maybe sent','PROCESSING',1,'SMS-PROCESSING',now,now,null,null);
  put.run(ids[2],storeId,'manual','01700000003','TEST','waiting','queued',0,'SMS-QUEUED',now,null,null,null);
  sql.exec(readFileSync(new URL('../supabase/d1/migration_connectx_direct_sms.sql',import.meta.url),'utf8'));
  const rows=sql.prepare('SELECT id,status,error_message,sent_at FROM connectx_sms_messages ORDER BY id').all();
  assert.deepEqual(rows.map(x=>x.status),['sent','unknown','pending']);
  assert.equal(rows[0].sent_at,now,'legacy success becomes sent, not carrier-delivered');
  assert.match(rows[1].error_message,/outcome is unknown/);
  assert.equal(sql.prepare('SELECT count(*) n FROM connectx_sms_messages').get().n,3,'all historical rows survive the table rebuild');
  assert.equal(sql.prepare('PRAGMA table_info(connectx_sms_messages)').all().some(x=>x.name==='claim_token'),true);
  const directDeviceColumns=sql.prepare('PRAGMA table_info(connectx_devices)').all().map(x=>x.name);
  assert.ok(['device_token_hash','app_version','version_code','last_error','revoked_at'].every(x=>directDeviceColumns.includes(x)), 'migration recreates the EMS device table and direct-auth columns when legacy migration 045 dropped it');
 }finally{sql.close()}
});

test('ConnectX authenticates directly to EMS; token scope, atomic claims, SIM, acknowledgements and carrier delivery are isolated',async()=>{
 const f=fixture();try{
  const enroll=async shopId=>{
   const r=await f.reqBearer('connectx/device/register','POST',{shopId,deviceName:'CX phone',androidVersion:'15',appVersion:'2.2.0',versionCode:22,simSubscriptionId:17,simCarrier:'Carrier A',phoneNumber:'01700000000'},f.adminToken());
   assert.equal(r.status,201,await r.clone().text());return r.json();
  };
  const a=await enroll(shop),b=await enroll(other);
  assert.ok(a.deviceToken.startsWith('cxd_'));assert.ok(b.deviceToken.startsWith('cxd_'));
  assert.notEqual(f.sql.prepare('SELECT device_token_hash FROM connectx_devices WHERE id=?').get(a.device.id).device_token_hash,a.deviceToken,'only the SHA-256 token hash is stored');
  const noToken=await f.reqBearer('connectx/device/heartbeat','POST',{},'');assert.equal(noToken.status,401);
  const shops=await f.reqBearer('connectx/device/shops','GET',{},f.adminToken());assert.equal(shops.status,200);
  assert.equal((await shops.json()).shops.length,2,'administrator can see only their EMS shops');
  const preTestClaim=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:8},a.deviceToken);
  assert.deepEqual((await preTestClaim.json()).jobs,[],'pending-test devices do not dispatch SMS');
  assert.equal((await f.reqBearer('connectx/device/test','POST',{ok:true},a.deviceToken)).status,200);
  assert.equal((await f.reqBearer('connectx/device/test','POST',{ok:true},b.deviceToken)).status,200);
  f.sql.prepare("UPDATE connectx_devices SET status='offline' WHERE id=?").run(a.device.id);
  const offline=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:8},a.deviceToken);assert.deepEqual((await offline.json()).jobs,[]);
  const oldFetch=globalThis.fetch;
  try {
   globalThis.fetch=()=>{throw new Error('ConnectX Control website is unavailable')};
   const online=await f.reqBearer('connectx/device/heartbeat','POST',{},a.deviceToken);
   assert.equal((await online.json()).device.status,'active','heartbeat restores polling after network reconnect without contacting Control');
  } finally { globalThis.fetch=oldFetch }

  const {enqueueSmsJob}=await import('../functions/_lib/connectx_sms.js');
  const queuedA=await enqueueSmsJob(f.env,{storeId:shop,userId:staff,phone:'01700123456',name:'Buyer A',recipientType:'customer',messageType:'Custom',eventType:'CUSTOM',messageBody:'A message',idempotencyKey:'direct:A'});
  const queuedB=await enqueueSmsJob(f.env,{storeId:other,userId:staff,phone:'01700987654',name:'Buyer B',recipientType:'customer',messageType:'Custom',eventType:'CUSTOM',messageBody:'B message',idempotencyKey:'direct:B'});
  const repeat=await enqueueSmsJob(f.env,{storeId:shop,userId:staff,phone:'01700123456',name:'Buyer A',recipientType:'customer',messageType:'Custom',eventType:'CUSTOM',messageBody:'A message',idempotencyKey:'direct:A'});
  assert.equal(repeat.skipped,'duplicate','stable idempotency key does not create a second row');
  const claimedA=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:8},a.deviceToken);assert.equal(claimedA.status,200);
  const jobsA=(await claimedA.json()).jobs;assert.equal(jobsA.length,1);assert.equal(jobsA[0].id,queuedA.id);assert.equal(jobsA[0].shop_id,shop);
  const claimedB=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:8},b.deviceToken);const jobsB=(await claimedB.json()).jobs;
  assert.equal(jobsB.length,1);assert.equal(jobsB[0].id,queuedB.id);assert.equal(jobsB[0].shop_id,other,'one shop device cannot claim another shop’s row');
  const wrongShopReport=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:queuedB.id,claimToken:jobsA[0].claim_token,status:'sent'},a.deviceToken);assert.equal(wrongShopReport.status,409);
  const start=await f.reqBearer('connectx/device/jobs/start','POST',{jobId:jobsA[0].id,claimToken:jobsA[0].claim_token},a.deviceToken);assert.equal(start.status,200);
  const started=await start.json();assert.equal(started.attempts,1);assert.equal(started.sim_used,'Carrier A','selected physical SIM is recorded for the attempt');
  const sent=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:jobsA[0].id,claimToken:jobsA[0].claim_token,status:'sent'},a.deviceToken);assert.equal(sent.status,200);
  let row=f.sql.prepare('SELECT status,sent_at,delivered_at,sim_used FROM connectx_sms_messages WHERE id=?').get(queuedA.id);
  assert.equal(row.status,'sent');assert.ok(row.sent_at);assert.equal(row.delivered_at,null,'Android send acceptance is not recipient delivery');assert.equal(row.sim_used,'Carrier A');
  const duplicate=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:jobsA[0].id,claimToken:jobsA[0].claim_token,status:'sent'},a.deviceToken);assert.equal((await duplicate.json()).duplicate,true);
  const delivered=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:jobsA[0].id,claimToken:jobsA[0].claim_token,status:'delivered'},a.deviceToken);assert.equal(delivered.status,200);
  row=f.sql.prepare('SELECT status,delivered_at FROM connectx_sms_messages WHERE id=?').get(queuedA.id);assert.equal(row.status,'delivered');assert.ok(row.delivered_at);
  const emailId='ffffffff-6666-4666-8666-ffffffffffff';
  const putEmail=f.sql.prepare('INSERT INTO connectx_messages(id,store_id,recipient_type,from_email,to_emails,cc_emails,bcc_emails,subject,custom_body,body_html,provider,status,idempotency_key,created_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  putEmail.run(emailId,shop,'customer','shop@example.test','["buyer@example.test"]','[]','[]','Invoice email','Thanks','<p>Thanks</p>','brevo','sent','EMAIL-A',new Date().toISOString(),new Date().toISOString());
  putEmail.run('99999999-7777-4777-8777-999999999999',other,'customer','other@example.test','["other@example.test"]','[]','[]','Other shop','Other','<p>Other</p>','brevo','sent','EMAIL-B',new Date().toISOString(),new Date().toISOString());
  const emailStats=await f.reqBearer('connectx/device/emails/stats','GET',{},a.deviceToken);assert.equal((await emailStats.json()).sent,1);
  const emailPage=await f.reqBearer('connectx/device/emails?page=0','GET',{},a.deviceToken);const emailItems=(await emailPage.json()).items;
  assert.equal(emailItems.length,1);assert.equal(emailItems[0].id,emailId);assert.deepEqual(emailItems[0].to_emails,['buyer@example.test']);
  const emailDetail=await f.reqBearer(`connectx/device/emails/${emailId}`,'GET',{},a.deviceToken);assert.equal((await emailDetail.json()).subject,'Invoice email');
  const stats=await f.reqBearer('connectx/device/stats','GET',{},a.deviceToken);assert.equal((await stats.json()).delivered,1);
  const foreignActivity=await f.reqBearer('connectx/device/activity?range=all','GET',{},a.deviceToken);assert.equal((await foreignActivity.json()).items.some(x=>x.id===queuedB.id),false);
 }finally{f.sql.close()}
});

test('EMS exposes a configurable bounded poll interval to direct Android clients',async()=>{
 const f=fixture();try{
  const registered=await f.reqBearer('connectx/device/register','POST',{shopId:shop,deviceName:'Polling phone',simSubscriptionId:17,simCarrier:'Carrier A'},f.adminToken());
  assert.equal(registered.status,201,await registered.clone().text());const device=await registered.json();
  assert.equal(device.pollIntervalSeconds,30,'default poll interval is 30 seconds');
  f.env.CONNECTX_POLL_INTERVAL_SECONDS='75';
  const tuned=await f.reqBearer('connectx/device/heartbeat','POST',{},device.deviceToken);assert.equal((await tuned.json()).pollIntervalSeconds,75);
  f.env.CONNECTX_POLL_INTERVAL_SECONDS='2';
  const lower=await f.reqBearer('connectx/device/heartbeat','POST',{},device.deviceToken);assert.equal((await lower.json()).pollIntervalSeconds,10,'server clamps aggressive polling');
  f.env.CONNECTX_POLL_INTERVAL_SECONDS='900';
  const upper=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},device.deviceToken);assert.equal((await upper.json()).pollIntervalSeconds,300,'server caps polling interval');
 }finally{f.sql.close()}
});

test('direct claims are atomic and recovery requeues pre-send claims but marks interrupted sends unknown',async()=>{
 const f=fixture();try{
  const enroll=async name=>{const r=await f.reqBearer('connectx/device/register','POST',{shopId:shop,deviceName:name,simSubscriptionId:1,simCarrier:name},f.adminToken());return r.json()};
  const [one,two]=await Promise.all([enroll('Phone 1'),enroll('Phone 2')]);
  await Promise.all([one,two].map(d=>f.reqBearer('connectx/device/test','POST',{ok:true},d.deviceToken)));
  const {enqueueSmsJob}=await import('../functions/_lib/connectx_sms.js');
  const first=await enqueueSmsJob(f.env,{storeId:shop,phone:'01700000001',messageBody:'Atomic',messageType:'TEST'});
  const both=await Promise.all([one,two].map(d=>f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},d.deviceToken)));
  const claimed=await Promise.all(both.map(r=>r.json()));assert.equal(claimed.reduce((n,x)=>n+x.jobs.length,0),1,'conditional status update grants only one claim');
  const owner=claimed.find(x=>x.jobs.length).jobs[0],ownerToken=claimed[0].jobs.length?one.deviceToken:two.deviceToken;
  f.sql.prepare("UPDATE connectx_sms_messages SET claimed_at=? WHERE id=?").run(new Date(Date.now()-10*60*1000).toISOString(),first.id);
  const recovered=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},ownerToken);const recoveredJob=(await recovered.json()).jobs[0];
  assert.equal(recoveredJob.id,first.id);assert.notEqual(recoveredJob.claim_token,owner.claim_token,'stale pre-send claim receives a new idempotent claim token');
  assert.equal(f.sql.prepare('SELECT status,dispatch_phase FROM connectx_sms_messages WHERE id=?').get(first.id).dispatch_phase,'claimed');

  const second=await enqueueSmsJob(f.env,{storeId:shop,phone:'01700000002',messageBody:'Interrupted',messageType:'TEST'});
  const next=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},ownerToken);const nextJob=(await next.json()).jobs.find(x=>x.id===second.id);
  assert.ok(nextJob);await f.reqBearer('connectx/device/jobs/start','POST',{jobId:second.id,claimToken:nextJob.claim_token},ownerToken);
  f.sql.prepare("UPDATE connectx_sms_messages SET claimed_at=? WHERE id=?").run(new Date(Date.now()-10*60*1000).toISOString(),second.id);
  const after=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},ownerToken);assert.equal((await after.json()).jobs.some(x=>x.id===second.id),false);
  const row=f.sql.prepare('SELECT status,error_message FROM connectx_sms_messages WHERE id=?').get(second.id);assert.equal(row.status,'unknown');assert.match(row.error_message,/not automatically resent/);
 }finally{f.sql.close()}
});

test('bounded retries stop after three attempts; sent rows without carrier confirmation become unknown',async()=>{
 const f=fixture();try{
  const enroll=await f.reqBearer('connectx/device/register','POST',{shopId:shop,deviceName:'Retry phone',simSubscriptionId:1,simCarrier:'Carrier'},f.adminToken());const device=await enroll.json();
  await f.reqBearer('connectx/device/test','POST',{ok:true},device.deviceToken);
  const {enqueueSmsJob}=await import('../functions/_lib/connectx_sms.js');
  const job=await enqueueSmsJob(f.env,{storeId:shop,phone:'01700000003',messageBody:'Retry',messageType:'TEST'});
  for(let attempt=1;attempt<=3;attempt++){
   const claim=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},device.deviceToken);const item=(await claim.json()).jobs.find(x=>x.id===job.id);assert.ok(item);
   const start=await f.reqBearer('connectx/device/jobs/start','POST',{jobId:job.id,claimToken:item.claim_token},device.deviceToken);assert.equal((await start.json()).attempts,attempt);
   const failure=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:job.id,claimToken:item.claim_token,status:'failed',retryable:true,error:'No service'},device.deviceToken);assert.equal(failure.status,200);
   if(attempt<3){
    const pending=f.sql.prepare('SELECT status,next_attempt_at FROM connectx_sms_messages WHERE id=?').get(job.id);assert.equal(pending.status,'pending');
    f.sql.prepare('UPDATE connectx_sms_messages SET next_attempt_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),job.id);
   }
  }
  assert.equal(f.sql.prepare('SELECT status,attempts FROM connectx_sms_messages WHERE id=?').get(job.id).status,'failed');
  const preSendJob=await enqueueSmsJob(f.env,{storeId:shop,phone:'01700000005',messageBody:'SIM unavailable',messageType:'TEST'});
  for(let attempt=1;attempt<=3;attempt++){
   const claim=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},device.deviceToken);const item=(await claim.json()).jobs.find(x=>x.id===preSendJob.id);assert.ok(item);
   const failure=await f.reqBearer('connectx/device/jobs/report','POST',{jobId:preSendJob.id,claimToken:item.claim_token,status:'failed',retryable:true,error:'Selected SIM unavailable'},device.deviceToken);assert.equal(failure.status,200);
   const row=f.sql.prepare('SELECT status,attempts FROM connectx_sms_messages WHERE id=?').get(preSendJob.id);
   assert.equal(row.attempts,attempt,'retryable pre-send failures count toward the bounded retry limit');
   if(attempt<3){assert.equal(row.status,'pending');f.sql.prepare('UPDATE connectx_sms_messages SET next_attempt_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),preSendJob.id)}
  }
  assert.deepEqual(f.sql.prepare('SELECT status,attempts FROM connectx_sms_messages WHERE id=?').get(preSendJob.id),{status:'failed',attempts:3});
  const sentJob=await enqueueSmsJob(f.env,{storeId:shop,phone:'01700000004',messageBody:'No receipt',messageType:'TEST'});
  const claimed=await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},device.deviceToken);const item=(await claimed.json()).jobs.find(x=>x.id===sentJob.id);assert.ok(item);
  await f.reqBearer('connectx/device/jobs/start','POST',{jobId:sentJob.id,claimToken:item.claim_token},device.deviceToken);
  await f.reqBearer('connectx/device/jobs/report','POST',{jobId:sentJob.id,claimToken:item.claim_token,status:'sent'},device.deviceToken);
  f.sql.prepare('UPDATE connectx_sms_messages SET sent_at=? WHERE id=?').run(new Date(Date.now()-25*60*60*1000).toISOString(),sentJob.id);
  await f.reqBearer('connectx/device/jobs/claim','POST',{limit:1},device.deviceToken);
  const unknown=f.sql.prepare('SELECT status,error_message FROM connectx_sms_messages WHERE id=?').get(sentJob.id);assert.equal(unknown.status,'unknown');assert.match(unknown.error_message,/No carrier delivery confirmation/);
 }finally{f.sql.close()}
});
