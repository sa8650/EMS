import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {truebillCode,truebillSummary} from '../scanner/truebill.js';
import {truebillDetails} from '../scanner/truebill_view.js';
import {verifyPrintedInvoice} from '../functions/_lib/truebill_lookup.js';
import Database from 'better-sqlite3';
const token='12345678-1234-4234-8234-123456789012';
test('TrueBill reads URL QR and typed invoice UUID/code locally, never follows unrelated QR URLs',()=>{
 assert.equal(truebillCode('https://ems.example/?verify='+token),token);
 assert.equal(truebillCode('/?verify='+token),token);
 assert.equal(truebillCode(token),token);
 assert.equal(truebillCode('https://unrelated.example/pay?ref='+token),null);
 assert.equal(truebillCode('javascript:alert(1)'),null);
 assert.equal(truebillCode('https://ems.example/?verify=%3Cscript%3E'),null);
 assert.equal(truebillCode(''),null);
});
test('TrueBill summary covers sale, purchase, return and exchange via existing public verification payload',()=>{
 assert.equal(truebillSummary({verified:false,invoice:{id:token}}),null);
 for(const kind of ['sale','purchase']){
  const s=truebillSummary({verified:true,record_type:'invoice',invoice:{id:token,kind,invoice_number:'SAL-01',stores:{name:'Shop One'},subtotal:50,discount:5}});
  assert.equal(s.amount,45);assert.equal(s.shop,'Shop One');assert.equal(s.kind,kind==='purchase'?'Purchase invoice':'Sale invoice');
 }
 assert.equal(truebillSummary({verified:true,record_type:'return',return:{id:token,return_number:'RET-01',total_return_amount:25}}).kind,'Return slip');
 assert.equal(truebillSummary({verified:true,record_type:'exchange',exchange:{id:token,exchange_number:'EX-01'}}).kind,'Exchange invoice');
 const code=readFileSync(new URL('../scanner/scanner.js',import.meta.url),'utf8');assert.match(code,/api\('public\/invoice\/'/);assert.match(code,/verifyInvoice/);
});


test('full TrueBill view shows item lines, shop, party, totals and escapes untrusted fields',()=>{
 const html=truebillDetails({verified:true,record_type:'invoice',invoice:{id:token,kind:'purchase',invoice_number:'PUR-12034',subtotal:50,paid_amount:10,total_due:40,stores:{name:'Shop <test>'},invoice_lines:[{quantity:2,unit_price:25,line_total:50,inventory_items:{description:'Paracetamol',item_code:'MED-04'}}]},party:{name:'A&B Supplier'}});
 for(const value of ['PUR-12034','Paracetamol','MED-04','40.00','A&amp;B Supplier','Shop &lt;test&gt;'])assert.ok(html.includes(value),value);
 assert.ok(!html.includes('<test>'));assert.equal(truebillDetails({verified:false,invoice:{id:token}}),'');
});

test('D1 public printed-number checks return only a minimal result and never expose private invoice data',async()=>{
 const sql=new Database(':memory:');try{
  sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
  const shop='aaaa1111-1111-4111-8111-111111111111',admin='aaaa2222-2222-4222-8222-222222222222',date=new Date().toISOString();
  sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(admin,'Admin','123','a@test.com','x','ADM',date,date);
  sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(shop,admin,'Private shop','123','TEST','active','pharmacy','pharmacy',date,date);
  sql.prepare('INSERT INTO invoices(id,store_id,kind,invoice_number,invoice_date,subtotal,paid_amount,total_due,verification_token,custom_party_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('bbbb1111-1111-4111-8111-111111111111',shop,'purchase','PUR-12034',date,50,10,40,token,'Private customer',date,date);
  const env={DB_DRIVER:'d1',DB:{prepare(query){return{bind(...values){return{async all(){try{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...values):(stmt.run(...values),[])}}catch(e){return{success:false,error:e.message}}},async run(){return{meta:{changes:sql.prepare(query).run(...values).changes}}}}}}}}};
  assert.equal((await verifyPrintedInvoice(env,{invoice_number:'BAD-12034'})).status,400);
  assert.equal((await verifyPrintedInvoice(env,{invoice_number:'SAL-12034'})).status,404);
  const response=await verifyPrintedInvoice(env,{invoice_number:'pur-12034'});assert.equal(response.status,200,await response.clone().text());const found=await response.json();
  assert.deepEqual(found,{verified:true,record_type:'invoice',invoice_number:'PUR-12034',kind:'purchase',details_available:false});
  const serialized=JSON.stringify(found);for(const secret of ['Private customer','Private shop',token,'bbbb1111','50','40'])assert.equal(serialized.includes(secret),false,secret);
 }finally{sql.close()}
});
