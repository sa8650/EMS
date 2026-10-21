import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {pharmacyApi} from '../functions/_lib/pharmacy_api.js';
const storeId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
const session={id:admin,role:'staff',storeId};
function fixture(){
 const sqlite=new Database(':memory:');sqlite.pragma('foreign_keys = ON');sqlite.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const date=new Date().toISOString();sqlite.prepare('INSERT INTO administrators (id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(admin,'Admin','123','a@test.test','x','ADM-SR',date,date);
 const insert=sqlite.prepare('INSERT INTO stores (id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
 insert.run(storeId,admin,'Pharmacy A','123','PSR-A','active','pharmacy','pharmacy',date,date);
 insert.run(otherId,admin,'Pharmacy B','456','PSR-B','active','pharmacy','pharmacy',date,date);
 const env={DB_DRIVER:'d1',DB:{
  prepare(sql){return {bind(...params){const execute=()=>{
   const statement=sqlite.prepare(sql),values=params.map(x=>typeof x==='boolean'?Number(x):x);
   return {success:true,results:statement.reader?statement.all(...values):(statement.run(...values),[])};
  };return {execute,async all(){try{return execute()}catch(error){return {success:false,error:error.message}}}}}}},
  async batch(statements){return sqlite.transaction(()=>statements.map(x=>x.execute()))()}
 }};
 return {env,sqlite};
}
const route=(env,path,method='GET',body,actor=session,allowed=()=>true)=>pharmacyApi({env,path:path.split('?')[0],method,s:actor,allowed,request:new Request('https://example.test/api/'+path,{method,body:body===undefined?undefined:JSON.stringify(body)})});
const json=async res=>res.json();
const medicine={name:'Cough relief',dosage_form:'syrup',base_unit:'ml',sale_price:5,purchase_price:3,units:[{unit_label:'ml',factor_to_base:1,can_purchase:true,can_sell:true}]};
async function setup(env){
 const product=await json(await route(env,'pharmacy/products','POST',medicine));
 const purchase=await route(env,'pharmacy/purchases','POST',{idempotencyKey:'purchase-for-return-001',paidAmount:10,lines:[{productId:product.id,unitLabel:'ml',quantity:10,unitPrice:3}]});
 assert.equal(purchase.status,201,JSON.stringify(await purchase.clone().json()));
 return {product,invoice:await json(purchase)};
}

test('D1: Supplier Return looks up purchase, posts atomic partial returns, changes stock and due, and retries safely',async()=>{
 const {env,sqlite}=fixture();try{
  const {product,invoice}=await setup(env);
  const looked=await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number));
  assert.equal(looked.status,200,JSON.stringify(await looked.clone().json())+'; invoice='+JSON.stringify(invoice));const detail=await json(looked);assert.equal(detail.items[0].remaining_base,10);assert.equal(detail.items[0].stock_base,10);
  const line=detail.items[0],payload={invoice_id:invoice.id,idempotencyKey:'supplier-return-01',reason:'Damaged',return_date:'2026-10-19',settlement_method:'refund',items:[{invoice_line_id:line.id,quantity_base:4}]};
  const first=await route(env,'pharmacy/supplier-returns','POST',payload);assert.equal(first.status,201,JSON.stringify(await first.clone().json()));const saved=await json(first);
  assert.equal(saved.amount,12);assert.equal(saved.due_reduction,12);assert.equal(sqlite.prepare('SELECT total_due FROM invoices WHERE id=?').get(invoice.id).total_due,8);
  const itemId=sqlite.prepare('SELECT inventory_item_id FROM pharmacy_products WHERE id=?').get(product.id).inventory_item_id;
  assert.equal(sqlite.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,6);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM pharmacy_stock_movements WHERE movement_type='supplier_return'").get().n,1);
  const history=await json(await route(env,'pharmacy/supplier-returns'));assert.equal(history.length,1);assert.equal(history[0].items[0].product.name,medicine.name);
  const retry=await json(await route(env,'pharmacy/supplier-returns','POST',payload));assert.equal(retry.id,saved.id);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_supplier_return_headers').get().n,1);
  const later=await json(await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number)));
  assert.equal(later.items[0].remaining_base,6);assert.equal(later.items[0].returned_base,4);
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'supplier-return-over',items:[{invoice_line_id:line.id,quantity_base:7}]})).status,409);
  const second=await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'supplier-return-02',settlement_method:'credit',items:[{invoice_line_id:line.id,quantity_base:6}]});
  assert.equal(second.status,201,JSON.stringify(await second.clone().json()));assert.equal((await json(second)).due_reduction,8);
  assert.equal(sqlite.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,0);
  assert.equal(sqlite.prepare('SELECT total_due FROM invoices WHERE id=?').get(invoice.id).total_due,0);
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'supplier-return-03'})).status,409);
 }finally{sqlite.close()}
});

test('D1: Supplier Return rejects other shops, insufficient stock, duplicates and unauthorized writes without side effects',async()=>{
 const {env,sqlite}=fixture();try{
  const {product,invoice}=await setup(env),detail=await json(await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number)));
  const payload={invoice_id:invoice.id,idempotencyKey:'supplier-return-04',reason:'Recall',settlement_method:'refund',items:[{invoice_line_id:detail.items[0].id,quantity_base:10}]};
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',payload,{...session,storeId:otherId})).status,400);
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',payload,session,()=>false)).status,403);
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',payload,{...session,readOnly:true})).status,403);
  const sale=await route(env,'pharmacy/checkout','POST',{idempotencyKey:'sale-before-return-01',lines:[{productId:product.id,unitLabel:'ml',quantity:7,unitPrice:5}]});assert.equal(sale.status,201,JSON.stringify(await sale.clone().json()));
  const noStock=await route(env,'pharmacy/supplier-returns','POST',payload);assert.equal(noStock.status,409,JSON.stringify(await noStock.clone().json()));
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_supplier_return_headers').get().n,0);
  assert.equal(sqlite.prepare('SELECT total_due FROM invoices WHERE id=?').get(invoice.id).total_due,20);
  const duplicateLine=await route(env,'pharmacy/supplier-returns','POST',{...payload,items:[payload.items[0],payload.items[0]]});assert.equal(duplicateLine.status,400);
 }finally{sqlite.close()}
});

test('Pharmacy routing shows skeletons for native pages and includes Supplier Return without redirect',async()=>{
 const src=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
 assert.match(src,/if\(loading\)loading\.innerHTML=skelFor\(SHP_SKEL,PSHOP_SKEL_KEY\[p\]\|\|p\)/);
 assert.match(src,/if\(p==='pharmacy-supplier-returns'\)return await pshopSupplierReturns\(pctx\)/);
 assert.doesNotMatch(src,/if\(p==='pharmacy-supplier-returns'\)p='pharmacy-purchases'/);
});

test('D1: Pharmacy purchase history resolves scoped supplier names and batches invoice line counts',async()=>{
 const {env,sqlite}=fixture();try{
  const supplierId='88888888-8888-4888-8888-888888888888',date=new Date().toISOString();
  sqlite.prepare('INSERT INTO suppliers(id,store_id,supplier_code,name,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(supplierId,storeId,'SUP-PSR','Acme Supplier','123',date,date);
  const {product}=await setup(env);
  const second=await route(env,'pharmacy/purchases','POST',{idempotencyKey:'purchase-supplier-002',partyId:supplierId,paidAmount:0,lines:[{productId:product.id,unitLabel:'ml',quantity:2,unitPrice:3}]});
  assert.equal(second.status,201,JSON.stringify(await second.clone().json()));
  const list=await route(env,'pharmacy/purchases');assert.equal(list.status,200,JSON.stringify(await list.clone().json()));
  const purchases=await json(list);assert.equal(purchases.length,2);
  assert.equal(purchases.find(x=>x.party_id===supplierId).party_name,'Acme Supplier');
  assert.deepEqual(purchases.map(x=>x.item_count),[1,1]);
 }finally{sqlite.close()}
});

test('D1: supplier return reverses net discounted purchase value, not undiscounted line price',async()=>{
 const {env,sqlite}=fixture();try{
  const product=await json(await route(env,'pharmacy/products','POST',medicine));
  const invoiceResponse=await route(env,'pharmacy/purchases','POST',{idempotencyKey:'purchase-discount-003',discount:10,paidAmount:10,lines:[{productId:product.id,unitLabel:'ml',quantity:10,unitPrice:3}]});
  assert.equal(invoiceResponse.status,201);const invoice=await json(invoiceResponse);
  assert.equal(invoice.total,20);assert.equal(invoice.total_due,10);
  const detail=await json(await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number)));
  assert.equal(detail.items[0].net_line_amount,20);
  const payload={invoice_id:invoice.id,idempotencyKey:'return-discount-01',reason:'Damaged',settlement_method:'credit',items:[{invoice_line_id:detail.items[0].id,quantity_base:5}]};
  const first=await route(env,'pharmacy/supplier-returns','POST',payload);assert.equal(first.status,201,JSON.stringify(await first.clone().json()));assert.equal((await json(first)).amount,10);
  const second=await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'return-discount-02'});assert.equal(second.status,201);assert.equal((await json(second)).amount,10);
  assert.equal(sqlite.prepare('SELECT total_due FROM invoices WHERE id=?').get(invoice.id).total_due,0);
 }finally{sqlite.close()}
});

test('D1: quarantined customer return can be sent to supplier without reducing saleable stock twice',async()=>{
 const {env,sqlite}=fixture();try{
  const {product,invoice}=await setup(env);
  const sale=await route(env,'pharmacy/checkout','POST',{idempotencyKey:'sale-to-quarantine-01',lines:[{productId:product.id,unitLabel:'ml',quantity:3,unitPrice:5}]});
  assert.equal(sale.status,201);const sold=await json(sale);
  const saleLine=sqlite.prepare('SELECT id FROM invoice_lines WHERE invoice_id=?').get(sold.id);
  const qId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',rId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  sqlite.prepare('INSERT INTO pharmacy_returns(id,store_id,invoice_id,return_number,customer_name,return_type,amount,reason,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?)').run(rId,storeId,sold.id,'PR-QUAR-1','Walk-in','return',0,'Damaged','quarantine-01');
  sqlite.prepare('INSERT INTO pharmacy_return_items(id,return_id,store_id,invoice_line_id,product_id,quantity_base,condition,reason,restocked) VALUES (?,?,?,?,?,?,?,?,0)').run(qId,rId,storeId,saleLine.id,product.id,3,'damaged','Damaged package');
  const detail=await json(await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number)));
  assert.equal(detail.items[0].quarantine[0].available_base,3);assert.equal(detail.items[0].stock_base,7);
  const purchaseLine=detail.items[0].id,payload={invoice_id:invoice.id,idempotencyKey:'return-quar-01',reason:'Supplier damaged goods',settlement_method:'credit',items:[{invoice_line_id:purchaseLine,quantity_base:2,quarantine_item_id:qId}]};
  const result=await route(env,'pharmacy/supplier-returns','POST',payload);assert.equal(result.status,201,JSON.stringify(await result.clone().json()));
  const itemId=sqlite.prepare('SELECT inventory_item_id FROM pharmacy_products WHERE id=?').get(product.id).inventory_item_id;
  assert.equal(sqlite.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,7);
  const after=await json(await route(env,'pharmacy/quarantine'));assert.equal(after[0].available_base,1);
  const report=await json(await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31'));assert.equal(report.metrics.quarantineRecovery,6);assert.equal(report.sections.purchaseReturns[0].quarantine_recovery,6);
  assert.equal((await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'return-quar-too-many',items:[{invoice_line_id:purchaseLine,quantity_base:2,quarantine_item_id:qId}]})).status,409);
  const rest=await route(env,'pharmacy/supplier-returns','POST',{...payload,idempotencyKey:'return-quar-last',items:[{invoice_line_id:purchaseLine,quantity_base:1,quarantine_item_id:qId}]});assert.equal(rest.status,201);
  assert.deepEqual(await json(await route(env,'pharmacy/quarantine')),[]);
  assert.equal(sqlite.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(itemId).total_stock,7);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM pharmacy_stock_movements WHERE movement_type='supplier_return_quarantine'").get().n,2);
 }finally{sqlite.close()}
});

test('D1: Pharmacy analytics report derives purchases, stock, dues and real chart values from shop records',async()=>{
 const {env,sqlite}=fixture();try{
  const {invoice}=await setup(env);
  const response=await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31');
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const report=await json(response);
  assert.equal(report.metrics.purchases,30);assert.equal(report.metrics.purchaseDue,20);
  assert.equal(report.metrics.sales,0);assert.equal(report.metrics.stockValue,30);
  assert.equal(report.sections.purchases.length,1);assert.equal(report.sections.purchases[0].reference,invoice.invoice_number);
  assert.equal(report.charts.find(x=>x.date===invoice.invoice_date).purchases,30);
  assert.equal(report.sections.expiry.length,0);
  assert.equal(report.sections.sales.length,0);
  const denied=await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31','GET',undefined,session,()=>false);assert.equal(denied.status,403);
 }finally{sqlite.close()}
});

test('D1: report profit uses historical sale COGS, discounts and expense; due recovery is not new revenue',async()=>{
 const {env,sqlite}=fixture();try{
  const {product,invoice}=await setup(env);
  const sale=await route(env,'pharmacy/checkout','POST',{idempotencyKey:'sale-for-report-01',lines:[{productId:product.id,unitLabel:'ml',quantity:4,unitPrice:5}]});assert.equal(sale.status,201);const sold=await json(sale);
  const stamp=new Date().toISOString();
  sqlite.prepare('INSERT INTO expenses(id,store_id,expense_code,expense_date,details,total,paid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',storeId,'EXP-REPORT','2026-10-19','Electricity',7,7,stamp,stamp);
  sqlite.prepare('INSERT INTO due_recoveries(id,store_id,source_type,source_id,amount,payment_method,created_at) VALUES (?,?,?,?,?,?,?)').run('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',storeId,'sale',sold.id,2,'cash',stamp);
  sqlite.prepare('UPDATE invoices SET paid_amount=paid_amount+2,total_due=total_due-2 WHERE id=?').run(sold.id);
  const looked=await json(await route(env,'pharmacy/supplier-returns/lookup?invoice_number='+encodeURIComponent(invoice.invoice_number)));
  const supplierReturn=await route(env,'pharmacy/supplier-returns','POST',{invoice_id:invoice.id,idempotencyKey:'return-report-01',reason:'Broken',settlement_method:'credit',items:[{invoice_line_id:looked.items[0].id,quantity_base:2}]});assert.equal(supplierReturn.status,201);
  const report=await json(await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31'));
  assert.equal(report.metrics.sales,20);assert.equal(report.metrics.netRevenue,20);
  assert.equal(report.metrics.cogs,12);assert.equal(report.metrics.grossProfit,8);
  assert.equal(report.metrics.expenses,7);assert.equal(report.metrics.netProfit,1);
  assert.equal(report.metrics.recovered,2);assert.equal(report.metrics.salesDue,18);
  assert.equal(report.metrics.cashReceived,2,'recovered due must not be double-counted as invoice cash');
  assert.equal(report.metrics.purchases,24);assert.equal(report.metrics.purchaseDue,14);
  assert.equal(report.metrics.stockValue,12);
  assert.equal(report.sections.purchaseReturns.length,1);
  assert.equal(report.sections.recovery.length,1);
 }finally{sqlite.close()}
});

test('D1: report filters and error states do not fabricate missing sales or cross-store data',async()=>{
 const {env,sqlite}=fixture();try{
  await setup(env);
  const missing=await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31&category=Unlisted');
  assert.equal(missing.status,200);const filtered=await json(missing);
  assert.equal(filtered.metrics.purchases,0);assert.equal(filtered.sections.purchases.length,0);
  assert.equal(filtered.metrics.purchaseDue,0);assert.equal(filtered.charts.filter(x=>x.purchases!==0).length,0);
  const other=await json(await route(env,'pharmacy/reports?from=2026-10-01&to=2026-10-31','GET',undefined,{...session,storeId:otherId}));
  assert.equal(other.metrics.purchases,0);assert.equal(other.metrics.stockValue,0);
  assert.equal((await route(env,'pharmacy/reports?from=2025-01-01&to=2026-10-31')).status,400);
 }finally{sqlite.close()}
});
