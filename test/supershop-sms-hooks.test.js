import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {supershopApi} from '../functions/_lib/sshop_api.js';

const admin='10000000-0000-4000-8000-000000000001';
const store='10000000-0000-4000-8000-000000000002';
const product='10000000-0000-4000-8000-000000000003';
const customer='10000000-0000-4000-8000-000000000004';
function fixture(){
 const sql=new Database(':memory:');sql.pragma('foreign_keys=ON');sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const now=new Date().toISOString();
 sql.prepare('INSERT INTO administrators(id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(admin,'Admin','123','admin@example.test','x','A1',now,now);
 sql.prepare('INSERT INTO stores(id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(store,admin,'Super','123','S1','active','electronics','supershop',now,now);
 sql.prepare('INSERT INTO inventory_items(id,store_id,item_code,description,unit,sale_price,total_stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(product,store,'SKU1','Test item','piece',100,20,now,now);
 sql.prepare('INSERT INTO supershop_products(inventory_item_id,store_id,average_cost_base) VALUES(?,?,?)').run(product,store,50);
 sql.prepare('INSERT INTO supershop_product_units(id,store_id,inventory_item_id,unit_label,factor_to_base,selling_price,purchase_price) VALUES(?,?,?,?,?,?,?)').run('10000000-0000-4000-8000-000000000005',store,product,'piece',1,100,60);
 sql.prepare('INSERT INTO customers(id,store_id,customer_code,name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(customer,store,'C1','Test buyer','01700123456',now,now);
 const env={DB_DRIVER:'d1',DB:{prepare(query){return{bind(...args){const vals=args.map(x=>typeof x==='boolean'?Number(x):x);const run=()=>{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...vals):(stmt.run(...vals),[])}};return{execute:run,async all(){try{return run()}catch(e){return{success:false,error:e.message}}},async run(){const r=run();return{...r,meta:{changes:1}}}}}}},async batch(stmts){return sql.transaction(()=>stmts.map(x=>x.execute()))()}}};
 const notices=[];
 const post=(path,body)=>supershopApi({env,s:{id:admin,storeId:store,role:'admin'},path,method:'POST',request:new Request('https://ems.test/api/'+path,{method:'POST',body:JSON.stringify(body)}),allowed:()=>true,audit:async()=>{},autoSms:async(_env,_s,event,invoice,options)=>{notices.push({event,invoice,options})}});
 return{sql,post,notices};
}

test('Supershop sale queues only after committed invoice, not purchases; retries use stable SMS idempotency',async()=>{
 const f=fixture();try{
  const payload={lines:[{productId:product,unitLabel:'piece',quantity:1}],partyId:customer,invoiceDate:'2026-10-20',paymentMethod:'cash',paidAmount:50,idempotencyKey:'test-supershop-sale-00001'};
  const response=await f.post('supershop/sales',payload);assert.equal(response.status,201,await response.clone().text());const invoice=await response.json();
  assert.equal(f.notices.length,1);assert.equal(f.notices[0].event,'SALE');assert.equal(f.notices[0].invoice.id,invoice.id);assert.equal(f.notices[0].options.idempotencyKey,'SALE:'+invoice.id);
  assert.equal(f.sql.prepare('SELECT total_due FROM invoices WHERE id=?').get(invoice.id).total_due,50);
  const retry=await f.post('supershop/sales',payload);assert.equal(retry.status,201,await retry.clone().text());assert.equal(f.notices[1].options.idempotencyKey,'SALE:'+invoice.id,'SMS queue deduplicates transaction retries');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM invoices WHERE kind='sale'").get().n,1);
  const purchase=await f.post('supershop/purchases',{...payload,partyId:null,idempotencyKey:'test-supershop-purchase-00001'});assert.equal(purchase.status,201,await purchase.clone().text());assert.equal(f.notices.length,2,'purchases do not send customer SMS');
 }finally{f.sql.close()}
});

test('Supershop return/refund and exchange events derive from committed records',async()=>{
 const f=fixture();try{
  const sale=await f.post('supershop/sales',{lines:[{productId:product,unitLabel:'piece',quantity:1}],partyId:customer,paidAmount:50,idempotencyKey:'test-sms-return-sale-001'});
  assert.equal(sale.status,201,await sale.clone().text());const invoice=await sale.json();
  const line=f.sql.prepare('SELECT id FROM invoice_lines WHERE invoice_id=?').get(invoice.id);
  const ret=await f.post('supershop/returns',{invoiceId:invoice.id,items:[{invoiceLineId:line.id,quantity:1,reason:'Defective',condition:'Damaged'}],refundMethod:'cash',idempotencyKey:'test-sms-return-001'});
  assert.equal(ret.status,201,await ret.clone().text());const returned=await ret.json();assert.equal(returned.refunded_amount,50);
  assert.deepEqual(f.notices.map(x=>x.event),['SALE','RETURN','REFUND']);
  assert.equal(f.notices[1].options.idempotencyKey,'RETURN:'+returned.id);assert.equal(f.notices[2].options.amount,50);
  const retry=await f.post('supershop/returns',{invoiceId:invoice.id,items:[{invoiceLineId:line.id,quantity:1,reason:'Defective',condition:'Damaged'}],refundMethod:'cash',idempotencyKey:'test-sms-return-001'});
  assert.equal(retry.status,201,await retry.clone().text());assert.equal(f.notices[3].options.idempotencyKey,'RETURN:'+returned.id);
  const next=await f.post('supershop/sales',{lines:[{productId:product,unitLabel:'piece',quantity:1}],partyId:customer,paidAmount:100,idempotencyKey:'test-sms-exchange-sale-001'});
  assert.equal(next.status,201,await next.clone().text());const exchangeInvoice=await next.json();
  const nextLine=f.sql.prepare('SELECT id FROM invoice_lines WHERE invoice_id=?').get(exchangeInvoice.id);
  const exc=await f.post('supershop/exchanges',{invoiceId:exchangeInvoice.id,returnedItems:[{invoiceLineId:nextLine.id,quantity:1,reason:'Defective',condition:'Damaged'}],newItems:[{productId:product,unitLabel:'piece',quantity:1}],paymentMethod:'cash',idempotencyKey:'test-sms-exchange-001'});
  assert.equal(exc.status,201,await exc.clone().text());const exchange=await exc.json();assert.equal(f.notices.at(-1).event,'EXCHANGE');assert.equal(f.notices.at(-1).options.idempotencyKey,'EXCHANGE:'+exchange.id);
  assert.equal(f.notices.filter(x=>x.event==='REFUND').length,2,'return retries reuse the same refund key; even exchange does not invent a refund');
 }finally{f.sql.close()}
});
