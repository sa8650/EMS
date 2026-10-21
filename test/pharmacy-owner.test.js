import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {ownerPharmacyApi} from '../functions/_lib/pharmacy_master_api.js';
import {pharmacyApi} from '../functions/_lib/pharmacy_api.js';
import {parseMasterCsv} from '../assets/js/owner_pharmacy.js';

const owner={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'owner'};
const storeId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const adminId='33333333-3333-4333-8333-333333333333';
const shop={id:adminId,role:'staff',storeId};
const base={name:'Paracetamol',generic_name:'Acetaminophen',dosage_form:'tablet',manufacturer:'Acme Pharma',category:'OTC',pack_size:'10 tablets per strip',base_unit:'tablet',purchase_price:2,sale_price:3,wholesale_price:2.5,reorder_threshold:5,sku:'CAT-001',units:[{unit_label:'tablet',factor_to_base:1,can_purchase:true,can_sell:true,selling_price:3,purchase_price:2},{unit_label:'strip',factor_to_base:10,can_purchase:true,can_sell:true,selling_price:28}]};
const request=(path,method='GET',value)=>new Request('https://example.test/api/'+path,{method,body:value===undefined?undefined:JSON.stringify(value)});
const ownerRoute=(env,path,method='GET',value,s=owner)=>ownerPharmacyApi({env,path,method,s,request:request(path,method,value)});
const shopRoute=(env,path,method='GET',value,s=shop,allow=()=>true)=>pharmacyApi({env,path,method,s,request:request(path,method,value),allowed:allow});
const data=async response=>{assert.ok(response,'Expected API response');return response.json()};
function d1Fixture(){
 const sqlite=new Database(':memory:');sqlite.pragma('foreign_keys = ON');sqlite.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const now=new Date().toISOString();
 sqlite.prepare('INSERT INTO administrators (id,name,phone,email,password_hash,admin_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(adminId,'Admin','123','admin@example.test','x','ADM-1',now,now);
 const store=sqlite.prepare('INSERT INTO stores (id,admin_id,name,phone,shop_code,status,shop_type,business_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
 store.run(storeId,adminId,'Pharmacy A','123','PHA','active','pharmacy','pharmacy',now,now);store.run(otherId,adminId,'Pharmacy B','456','PHB','active','pharmacy','pharmacy',now,now);
 const env={DB_DRIVER:'d1',DB:{
   prepare(sql){return {bind(...params){const execute=()=>{const statement=sqlite.prepare(sql),values=params.map(p=>typeof p==='boolean'?Number(p):p);return {success:true,results:statement.reader?statement.all(...values):(statement.run(...values),[])}};return {execute,async all(){try{return execute()}catch(error){return {success:false,error:error.message}}}}}}},
   async batch(statements){return sqlite.transaction(()=>statements.map(x=>x.execute()))()}
  }};
 return {env,sqlite};
}

test('D1: global makers and master templates are owner-scoped and imported shop copies remain independent',async()=>{
 const {env,sqlite}=d1Fixture();try{
  assert.equal((await ownerRoute(env,'platform/pharmacy/catalog','GET',undefined,shop)).status,403);
  const maker=await data(await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'}));
  assert.equal(maker.name,'Acme Pharma');
  assert.equal((await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'ACME PHARMA'})).status,409);
  const master=await data(await ownerRoute(env,'platform/pharmacy/catalog','POST',base));
  assert.equal(master.name,base.name);assert.equal(master.units.length,2);
  assert.equal(master.active,true);
  const available=await data(await shopRoute(env,'pharmacy/master-products'));
  assert.equal(available.length,1);assert.equal(available[0].id,master.id);
  const combined=await data(await shopRoute(env,'pharmacy/manufacturers'));
  assert.equal(combined[0].source,'owner');assert.equal(combined[0].locked,true);
  assert.equal((await shopRoute(env,'pharmacy/manufacturers/'+maker.id,'DELETE')).status,403);
  assert.equal((await shopRoute(env,'pharmacy/manufacturers','POST',{name:'Acme Pharma'})).status,409);
  const privateMaker=await data(await shopRoute(env,'pharmacy/manufacturers','POST',{name:'Local Labs'}));
  assert.equal(privateMaker.store_id,storeId);
  assert.equal((await data(await ownerRoute(env,'platform/pharmacy/manufacturers'))).length,1);
  assert.equal((await data(await shopRoute(env,'pharmacy/manufacturers','GET',undefined,{...shop,storeId:otherId}))).length,1);
  // The import UI opens the shop medicine editor with the template values; its save
  // goes through the ordinary pharmacy/products endpoint, creating an independent copy.
  const saved=await shopRoute(env,'pharmacy/products','POST',{...base,sku:'',supplier_id:null,default_location_id:null});
  assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
  const shopProduct=await data(saved);
  assert.equal(shopProduct.name,base.name);assert.equal(shopProduct.manufacturer,maker.name);
  const toggled=await data(await ownerRoute(env,'platform/pharmacy/catalog/'+master.id,'PATCH',{active:false}));
  assert.equal(toggled.active,false);assert.deepEqual(await data(await shopRoute(env,'pharmacy/master-products')),[]);
  assert.equal((await ownerRoute(env,'platform/pharmacy/catalog/bulk-delete','POST',{ids:[shopProduct.id]})).status,200);
  assert.ok(sqlite.prepare('SELECT id FROM pharmacy_products WHERE id=?').get(shopProduct.id));
  const deletion=await data(await ownerRoute(env,'platform/pharmacy/catalog/bulk-delete','POST',{ids:[master.id]}));
  assert.equal(deletion.deleted,1);
  assert.ok(sqlite.prepare('SELECT id FROM pharmacy_products WHERE id=?').get(shopProduct.id));
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,0);
 }finally{sqlite.close()}
});

test('D1: category rename and deletion updates only linked medicines, and preserves stock and other shops',async()=>{
 const {env,sqlite}=d1Fixture();try{
  const now=new Date().toISOString();const item=sqlite.prepare('INSERT INTO inventory_items (id,store_id,item_code,description,unit,category,total_stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const prod=sqlite.prepare('INSERT INTO pharmacy_products (id,store_id,inventory_item_id,name,category) VALUES (?,?,?,?,?)');
  const a='44444444-4444-4444-8444-444444444444',b='55555555-5555-4555-8555-555555555555',c='88888888-8888-4888-8888-888888888888',ia='66666666-6666-4666-8666-666666666666',ib='77777777-7777-4777-8777-777777777777',ic='99999999-9999-4999-8999-999999999999';
  item.run(ia,storeId,'P-A','Medicine','tablet','OTC',17,now,now);item.run(ib,otherId,'P-B','Medicine','tablet','OTC',29,now,now);
  prod.run(a,storeId,ia,'Tablet','OTC');prod.run(b,otherId,ib,'Tablet B','OTC');item.run(ic,storeId,'P-C','Medicine','tablet','otc',11,now,now);prod.run(c,storeId,ic,'Tablet C','otc');
  assert.ok((await data(await shopRoute(env,'pharmacy/categories'))).includes('OTC'));
  const renamed=await data(await shopRoute(env,'pharmacy/categories/update','POST',{category:'OTC',name:'Over the counter'}));
  assert.equal(renamed.affected,2);
  assert.equal(sqlite.prepare('SELECT category FROM pharmacy_products WHERE id=?').get(a).category,'Over the counter');
  assert.equal(sqlite.prepare('SELECT category FROM inventory_items WHERE id=?').get(ia).category,'Over the counter');
  assert.equal(sqlite.prepare('SELECT category FROM pharmacy_products WHERE id=?').get(c).category,'Over the counter');
  assert.equal(sqlite.prepare('SELECT category FROM pharmacy_products WHERE id=?').get(b).category,'OTC');
  const deleted=await data(await shopRoute(env,'pharmacy/categories/delete','POST',{category:'Over the counter'}));
  assert.equal(deleted.affected,2);
  assert.equal(sqlite.prepare('SELECT category FROM pharmacy_products WHERE id=?').get(a).category,'Uncategorized');
  assert.equal(sqlite.prepare('SELECT category,total_stock FROM inventory_items WHERE id=?').get(ia).category,null);
  assert.equal(sqlite.prepare('SELECT total_stock FROM inventory_items WHERE id=?').get(ia).total_stock,17);
  assert.equal(sqlite.prepare('SELECT category FROM inventory_items WHERE id=?').get(ib).category,'OTC');
  assert.ok(!(await data(await shopRoute(env,'pharmacy/categories'))).includes('Over the counter'));
  assert.equal((await shopRoute(env,'pharmacy/categories/delete','POST',{category:'Not available'})).status,404);
  assert.equal((await shopRoute(env,'pharmacy/categories/delete','POST',{category:'OTC'},shop,()=>false)).status,403);
  assert.ok(Array.isArray(await data(await shopRoute(env,'pharmacy/categories','GET',undefined,shop,(_user,section,verb)=>section==='settings'&&verb==='view'))));
 }finally{sqlite.close()}
});

test('D1: CSV parser supports quotes and reports duplicate SKU rows without deleting existing templates',async()=>{
 const {env,sqlite}=d1Fixture();try{
  const rows=parseMasterCsv('name,generic_name,base_unit,sale_price,sku,active,pack_unit,units_per_pack\r\n"A, B","Say ""hello""",tablet,3,ONE,true,strip,10\r\nOther,,tablet,4,ONE,false,,\r\n');
  assert.equal(rows[0].name,'A, B');assert.equal(rows[0].generic_name,'Say "hello"');assert.equal(rows[0].units[1].factor_to_base,10);
  const response=await data(await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows}));
  assert.equal(response.created,1);assert.equal(response.errors.length,1);assert.equal(response.errors[0].row,3);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,1);
  assert.throws(()=>parseMasterCsv('name,sku\n"Bad,SKU'),/Unclosed/);
 }finally{sqlite.close()}
});

test('PostgREST: owner route rejects shop identity; deletion queries master table only',async()=>{
 const pgEnv={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
 const before=globalThis.fetch,calls=[];const id='88888888-8888-4888-8888-888888888888';
 globalThis.fetch=async(url,opt={})=>{const path=new URL(url).pathname+new URL(url).search,method=opt.method||'GET';calls.push({path,method});if(method==='GET'&&path.includes('/pharmacy_master_products?id='))return Response.json([{id,name:'Medicine'}]);if(method==='DELETE')return Response.json([{id}]);throw Error('Unexpected '+method+' '+path)};
 try{
  assert.equal((await ownerRoute(pgEnv,'platform/pharmacy/catalog/'+id,'DELETE',undefined,shop)).status,403);
  assert.equal((await ownerRoute(pgEnv,'platform/pharmacy/catalog/'+id,'DELETE')).status,200);
  assert.ok(calls.length===2&&calls.every(x=>x.path.includes('/pharmacy_master_products?')));
  assert.equal(calls.filter(x=>x.method==='DELETE').length,1);
 }finally{globalThis.fetch=before}
});

test('PostgREST: global manufacturers and category reassignment use scoped tables and no shop overwrite',async()=>{
 const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
 const old=globalThis.fetch,calls=[],makerId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',itemId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',prodId='ffffffff-ffff-4fff-8fff-ffffffffffff';
 globalThis.fetch=async(url,opt={})=>{
  const path=new URL(url).pathname+new URL(url).search,method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;calls.push({path,method,body});
  let result;
  if(path.includes('/stores?'))result=[{id:storeId,admin_id:adminId,shop_type:'pharmacy',status:'active'}];
  else if(path.includes('/pharmacy_master_manufacturers?'))result=method==='POST'?[{id:makerId,name:body.name}]:path.includes('id=eq.')?[{id:makerId,name:'Acme Pharma'}]:path.includes('select=name')?[]:[{id:makerId,name:'Acme Pharma'}];
  else if(path.endsWith('/pharmacy_master_manufacturers')&&method==='POST')result=[{id:makerId,name:body.name}];
  else if(path.includes('/pharmacy_manufacturers?'))result=[];
  else if(path.includes('/pharmacy_settings?'))result=method==='POST'?[{categories:body.categories}]:[{categories:['OTC'],low_stock_default:5,expiry_warning_days:90}];
  else if(path.includes('/pharmacy_products?'))result=method==='PATCH'?[{id:prodId,category:body.category}]:[{id:prodId,inventory_item_id:itemId,category:'OTC'}];
  else if(path.includes('/inventory_items?')&&method==='PATCH')result=[{id:itemId}];
  else throw Error('Unexpected '+method+' '+path);
  return Response.json(result);
 };
 try{
  const maker=await data(await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'}));
  assert.equal(maker.id,makerId);
  const visible=await data(await shopRoute(env,'pharmacy/manufacturers'));
  assert.equal(visible[0].locked,true);assert.equal(visible[0].source,'owner');
  assert.equal((await shopRoute(env,'pharmacy/manufacturers/'+makerId,'DELETE')).status,403);
  const change=await data(await shopRoute(env,'pharmacy/categories/delete','POST',{category:'OTC'}));
  assert.equal(change.affected,1);
  assert.ok(calls.filter(x=>x.method==='PATCH'&&(x.path.includes('pharmacy_products?')||x.path.includes('inventory_items?'))).every(x=>x.path.includes('store_id=eq.'+storeId)));
  assert.equal(calls.find(x=>x.method==='PATCH'&&x.path.includes('pharmacy_products?')).body.category,'Uncategorized');
  assert.equal(calls.find(x=>x.method==='PATCH'&&x.path.includes('inventory_items?')).body.category,null);
  assert.equal(calls.some(x=>x.method==='DELETE'),false);
 }finally{globalThis.fetch=old}
});

test('D1 factory reset clears standalone Owner Pharmacy tables',async()=>{
 const {env,sqlite}=d1Fixture();try{
  await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'});
  await ownerRoute(env,'platform/pharmacy/catalog','POST',base);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,1);
  const {db}=await import('../functions/_lib/db.js');
  await db(env,'rpc/factory_reset_ems',{method:'POST',body:'{}'});
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_manufacturers').get().n,0);
 }finally{sqlite.close()}
});

test('D1 CSV batches stay below the Worker subrequest budget and retry safely',async()=>{
 const {env,sqlite}=d1Fixture();try{
  let calls=0;const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=(sql)=>{calls++;return prepare(sql)};
  await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'});
  const rows=Array.from({length:30},(_,i)=>({...base,name:'Catalog item '+i,sku:'BULK-'+i,barcode:'',import_row_id:crypto.randomUUID()}));
  assert.equal((await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows:rows.slice(0,16)})).status,400);
  for(let offset=0;offset<30;offset+=15){
   calls=0;const result=await data(await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows:rows.slice(offset,offset+15)}));
   assert.equal(result.created,15);assert.deepEqual(result.errors,[]);
   assert.ok(calls<=35,`Batch used ${calls} D1 queries, exceeding the target budget`);
  }
  calls=0;
  const recovered=await data(await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows:rows.slice(0,15)}));
  assert.equal(recovered.created,15);assert.deepEqual(recovered.errors,[]);
  assert.ok(calls<=35,`Retry used ${calls} D1 queries`);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,30);
 }finally{sqlite.close()}
});

test('PostgREST CSV batch checks medicine identities before its 15 template writes',async()=>{
 const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'},old=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opt={})=>{
  const path=new URL(url).pathname+new URL(url).search,method=opt.method||'GET';calls.push({path,method});
  if(path.includes('/pharmacy_master_manufacturers?')&&method==='GET')return Response.json([{name:'Acme Pharma'}]);
  if(path.includes('/pharmacy_master_products?name=ilike.')&&method==='GET')return Response.json([]);
  if(path.endsWith('/pharmacy_master_products')&&method==='POST')return Response.json([{id:JSON.parse(opt.body).id}]);
  throw Error(`Unexpected ${method} ${path}`);
 };
 try{
  const rows=Array.from({length:15},(_,i)=>({...base,name:'Bulk PG '+i,sku:'PG-'+i,import_row_id:crypto.randomUUID()}));
  const response=await data(await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows}));
  assert.equal(response.created,15);assert.deepEqual(response.errors,[]);
  assert.equal(calls.filter(x=>x.path.includes('/pharmacy_master_manufacturers?')).length,1);
  assert.equal(calls.filter(x=>x.method==='POST').length,15);
  assert.equal(calls.filter(x=>x.path.includes('/pharmacy_master_products?name=ilike.')).length,15);
  assert.equal(calls.length,31);
 }finally{globalThis.fetch=old}
});

test('D1 import checks the whole batch for duplicate medicine details before inserting any row',async()=>{
 const {env,sqlite}=d1Fixture();try{
  await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'});
  await ownerRoute(env,'platform/pharmacy/catalog','POST',base);
  const calls=[],prepare=env.DB.prepare.bind(env.DB);env.DB.prepare=sql=>{calls.push(sql);return prepare(sql)};
  const rows=[
   {...base,sku:'DIFFERENT-SKU',import_row_id:crypto.randomUUID()},
   {...base,name:'New topical product',strength:'1%',dosage_form:'topical solution',base_unit:'drop',sku:'DROP-1',units:[{unit_label:'drop',factor_to_base:1,can_purchase:true,can_sell:true}],import_row_id:crypto.randomUUID()},
   {...base,name:'New topical product',strength:'1%',dosage_form:'topical solution',base_unit:'drop',sku:'DROP-2',units:[{unit_label:'drop',factor_to_base:1,can_purchase:true,can_sell:true}],import_row_id:crypto.randomUUID()},
  ];
  const result=await data(await ownerRoute(env,'platform/pharmacy/catalog/import','POST',{rows}));
  assert.equal(result.created,1);
  assert.deepEqual(result.errors.map(x=>x.row),[2,4]);
  assert.match(result.errors[0].error,/already exists/);
  assert.match(result.errors[1].error,/Duplicate medicine/);
  const inserts=calls.map((sql,i)=>/INSERT INTO pharmacy_master_products/i.test(sql)?i:-1).filter(i=>i>=0);
  const nameChecks=calls.map((sql,i)=>/SELECT \* FROM pharmacy_master_products.*name.*LIKE/i.test(sql)?i:-1).filter(i=>i>=0);
  assert.equal(inserts.length,1);
  assert.equal(nameChecks.length,2);
  assert.ok(nameChecks.every(i=>i<inserts[0]),'all duplicate checks must finish before the first insert');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_master_products').get().n,2);
  assert.equal(sqlite.prepare("SELECT dosage_form,base_unit FROM pharmacy_master_products WHERE sku='DROP-1'").get().dosage_form,'topical solution');
  assert.equal(sqlite.prepare("SELECT dosage_form,base_unit FROM pharmacy_master_products WHERE sku='DROP-1'").get().base_unit,'drop');
  const shopMedicine=await shopRoute(env,'pharmacy/products','POST',{...rows[1],sku:'',import_row_id:undefined});
  assert.equal(shopMedicine.status,201,JSON.stringify(await shopMedicine.clone().json()));
  assert.equal((await data(shopMedicine)).base_unit,'drop');
 }finally{sqlite.close()}
});

test('D1: Marketplace bulk endpoint copies only active Owner templates, generates shop SKUs, blocks duplicates, and keeps copies independent',async()=>{
 const {env,sqlite}=d1Fixture();try{
  await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'});
  const master=await data(await ownerRoute(env,'platform/pharmacy/catalog','POST',base));
  const id=master.id,path=`pharmacy/master-products/${id}/import`;
  assert.equal((await shopRoute(env,path,'POST',{},shop,()=>false)).status,403);
  const createdResponse=await shopRoute(env,path,'POST',{});
  assert.equal(createdResponse.status,201,JSON.stringify(await createdResponse.clone().json()));
  const created=await data(createdResponse);
  assert.match(created.sku,/^PH-/);assert.notEqual(created.sku,master.sku);
  const copy=sqlite.prepare('SELECT * FROM pharmacy_products WHERE id=?').get(created.id);
  assert.equal(copy.store_id,storeId);assert.equal(copy.name,master.name);
  assert.equal((await shopRoute(env,path,'POST',{})).status,409);
  assert.equal((await shopRoute(env,'pharmacy/products','POST',{...base,sku:''})).status,409);
  const otherShopResponse=await shopRoute(env,path,'POST',{}, {...shop,storeId:otherId});
  assert.equal(otherShopResponse.status,201);
  assert.notEqual((await data(otherShopResponse)).id,created.id);
  await ownerRoute(env,'platform/pharmacy/catalog/'+id,'PATCH',{name:'Owner renamed',sale_price:99});
  assert.equal(sqlite.prepare('SELECT name,sale_price FROM pharmacy_products WHERE id=?').get(created.id).name,master.name);
  await ownerRoute(env,'platform/pharmacy/catalog/'+id,'DELETE');
  assert.equal((await shopRoute(env,path,'POST',{})).status,404);
  assert.ok(sqlite.prepare('SELECT id FROM pharmacy_products WHERE id=?').get(created.id));
 }finally{sqlite.close()}
});

test('D1: custom pharmacy additions check normalized identity and barcode before inserting',async()=>{
 const {env,sqlite}=d1Fixture();try{
  await ownerRoute(env,'platform/pharmacy/manufacturers','POST',{name:'Acme Pharma'});
  const first=await shopRoute(env,'pharmacy/products','POST',{...base,sku:'',strength:'5 mg',barcode:'RX-123'});
  assert.equal(first.status,201,JSON.stringify(await first.clone().json()));
  const renamed=await shopRoute(env,'pharmacy/products','POST',{...base,name:'  PARACETAMOL  ',sku:'',strength:'5 MG',barcode:''});
  assert.equal(renamed.status,409);
  const barcode=await shopRoute(env,'pharmacy/products','POST',{...base,name:'Other remedy',sku:'',strength:'10 mg',barcode:'RX-123'});
  assert.equal(barcode.status,409);
  const strength=await shopRoute(env,'pharmacy/products','POST',{...base,sku:'',strength:'10 mg',barcode:''});
  assert.equal(strength.status,201,JSON.stringify(await strength.clone().json()));
  assert.equal(sqlite.prepare('SELECT count(*) n FROM pharmacy_products').get().n,2);
 }finally{sqlite.close()}
});
