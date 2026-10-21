import test from 'node:test';
import assert from 'node:assert/strict';
import {pharmacyApi} from '../functions/_lib/pharmacy_api.js';

const storeId='11111111-1111-4111-8111-111111111111';
const otherStore='99999999-9999-4999-8999-999999999999';
const makerId='22222222-2222-4222-8222-222222222222';
const shelfId='33333333-3333-4333-8333-333333333333';
const productId='44444444-4444-4444-8444-444444444444';
const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
const session={id:'55555555-5555-4555-8555-555555555555',role:'staff',storeId};
async function route(path,method='GET',body,allowed=()=>true,audit){
  return pharmacyApi({env,s:session,path,method,request:new Request('https://example.test/api/'+path,{method,body:body?JSON.stringify(body):undefined}),allowed,audit});
}
async function mockDb(handler,run){
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opt={})=>{
    const query=new URL(url).pathname+new URL(url).search,method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
    calls.push({query,method,body});
    if(query.includes('/stores?'))return Response.json([{id:storeId,admin_id:session.id,status:'active',shop_type:'pharmacy'}]);
    if(query.includes('/pharmacy_master_manufacturers?'))return Response.json([]);
    const value=handler(query,method,body);
    if(value===undefined)throw Error(`Unexpected query: ${method} ${query}`);
    return Response.json(value);
  };
  try{await run(calls)}finally{globalThis.fetch=old}
}

test('manufacturer directory creates a scoped selectable name and rejects duplicates',async()=>{
 await mockDb((query,method,body)=>{
   if(query.includes('/pharmacy_manufacturers?'))return [];
   if(query.endsWith('/pharmacy_manufacturers')&&method==='POST')return [{id:makerId,store_id:body.store_id,name:body.name}];
 },async calls=>{
   const audited=[];
   const response=await route('pharmacy/manufacturers','POST',{name:'Acme Pharma'},()=>true,async(...a)=>audited.push(a));
   assert.equal(response.status,201);
   assert.equal((await response.json()).name,'Acme Pharma');
   assert.equal(calls.find(x=>x.method==='POST').body.store_id,storeId);
   assert.equal(audited[0][2],'create pharmacy manufacturer');
 });
 await mockDb(query=>query.includes('/pharmacy_manufacturers?')?[{id:makerId,name:'ACME PHARMA'}]:undefined,async()=>{
   const response=await route('pharmacy/manufacturers','POST',{name:'acme pharma'});
   assert.equal(response.status,409);
 });
});

test('manufacturer cannot be deleted while in use; renaming updates assigned medicine names',async()=>{
 await mockDb((query,method,body)=>{
   if(query.includes('/pharmacy_manufacturers?id=eq.'))return method==='PATCH'?[{id:makerId,name:body.name}]:[{id:makerId,name:'Acme'}];
   if(query.includes('/pharmacy_manufacturers?store_id='))return [{id:makerId,name:'Acme'}];
   if(query.includes('/pharmacy_products?store_id='))return [{id:productId,manufacturer:'Acme'}];
   if(query.includes('/pharmacy_products?id=eq.')&&method==='PATCH')return [{id:productId,manufacturer:body.manufacturer}];
 },async calls=>{
   const blocked=await route('pharmacy/manufacturers/'+makerId,'DELETE');
   assert.equal(blocked.status,409);
   assert.equal(calls.some(x=>x.method==='DELETE'),false);
   const renamed=await route('pharmacy/manufacturers/'+makerId,'PATCH',{name:'Acme Laboratories'});
   assert.equal(renamed.status,200);
   const productUpdate=calls.find(x=>x.query.includes('/pharmacy_products?id=eq.')&&x.method==='PATCH');
   assert.equal(productUpdate.body.manufacturer,'Acme Laboratories');
   assert.match(productUpdate.query,new RegExp(`store_id=eq\\.${storeId}`));
 });
});

test('shelf creation is shop-scoped and assigned shelves cannot be deleted',async()=>{
 await mockDb((query,method,body)=>{
   if(query.includes('/pharmacy_shelves?id=eq.'))return [{id:shelfId,label:'Rack A',notes:null}];
   if(query.includes('/pharmacy_shelves?store_id='))return [];
   if(query.endsWith('/pharmacy_shelves')&&method==='POST')return [{id:shelfId,label:body.label,store_id:body.store_id}];
   if(query.includes('/pharmacy_products?store_id='))return [{id:productId}];
 },async calls=>{
   const created=await route('pharmacy/shelves','POST',{label:'Rack A'});
   assert.equal(created.status,201);
   assert.equal(calls.find(x=>x.method==='POST').body.store_id,storeId);
   const blocked=await route('pharmacy/shelves/'+shelfId,'DELETE');
   assert.equal(blocked.status,409);
   assert.equal(calls.some(x=>x.method==='DELETE'),false);
 });
});

test('medicine save passes pack size, wholesale price and selected rack without touching another shop',async()=>{
 await mockDb((query,method,body)=>{
   if(query.includes('/pharmacy_manufacturers?'))return [{name:'Acme Pharma',store_id:storeId}];
   if(query.includes('/pharmacy_shelves?'))return [{id:shelfId,store_id:storeId,active:true}];
   if(query.includes('/rpc/pharmacy_save_product'))return {id:productId,sku:'PH-TEST'};
   if(query.includes('/pharmacy_products?')||query.includes('/suppliers?')||query.includes('/inventory_items?')||query.includes('/pharmacy_product_units?'))return [];
 },async calls=>{
   const body={name:'Medicine',manufacturer:'Acme Pharma',pack_size:'10 tablets per strip',wholesale_price:8.5,default_location_id:shelfId,base_unit:'tablet',sale_price:10,purchase_price:5,reorder_threshold:2,units:[{unit_label:'tablet',factor_to_base:1,can_purchase:true,can_sell:true}]};
   const response=await route('pharmacy/products','POST',body);
   assert.equal(response.status,201);
   const rpc=calls.find(x=>x.query.includes('/rpc/pharmacy_save_product')).body;
   assert.equal(rpc.p_product.pack_size,'10 tablets per strip');
   assert.equal(rpc.p_product.wholesale_price,8.5);
   assert.equal(rpc.p_product.default_location_id,shelfId);
   assert.equal(rpc.p_product.manufacturer,'Acme Pharma');
   assert.equal(rpc.p_store_id,storeId);
   assert.notEqual(rpc.p_store_id,otherStore);
 });
});

test('product editor keeps requested basic and optional fields in order',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../assets/js/pshop.js',import.meta.url),'utf8');
 const modal=src.slice(src.indexOf('function productModal('),src.indexOf('const pCatOf='));
 const basic=['Medicine Name','Generic<input','id="pshStrengthLabel"','Dosage Form','Manufacturer<select','Supplier<select','${categoryMarkup}','Pack Size'];
 let cursor=0;for(const field of basic){const at=modal.indexOf(field,cursor);assert.ok(at>=cursor,`${field} should follow the preceding basic field`);cursor=at+field.length}
 const optional=['Barcode<input','SKU<input','Base stock unit<select','Purchase price per base unit','MRP / Retail Price per base unit','Wholesale Price per base unit','Low-Stock Alert','Rack / Shelf<select','Pack conversions'];
 cursor=0;for(const field of optional){const at=modal.indexOf(field,cursor);assert.ok(at>=cursor,`${field} should follow the preceding optional field`);cursor=at+field.length}
 assert.doesNotMatch(modal,/<label class="psh-field">Brand<input/);
});

test('foreign shop shelves and unknown manufacturers are rejected before product RPC',async()=>{
 await mockDb((query)=>{
   if(query.includes('/pharmacy_manufacturers?'))return [{name:'Acme Pharma'}];
   if(query.includes('/pharmacy_shelves?'))return [];
   if(query.includes('/pharmacy_products?store_id='))return [];
 },async calls=>{
   const base={name:'Medicine',base_unit:'tablet',sale_price:10,purchase_price:5,reorder_threshold:2,units:[{unit_label:'tablet',factor_to_base:1,can_purchase:true,can_sell:true}]};
   const badMaker=await route('pharmacy/products','POST',{...base,manufacturer:'Other shop manufacturer'});
   assert.equal(badMaker.status,400);
   const badShelf=await route('pharmacy/products','POST',{...base,manufacturer:'Acme Pharma',default_location_id:shelfId});
   assert.equal(badShelf.status,400);
   assert.equal(calls.some(x=>x.query.includes('/rpc/pharmacy_save_product')),false);
 });
});

test('shared Owner and Pharmacy medicine editor offers extended dosage forms and stock units',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../assets/js/pshop.js',import.meta.url),'utf8');
 const editor=source.slice(source.indexOf('function productModal('),source.indexOf('export function openOwnerMedicineModal'));
 for(const form of ['topical solution','injection','gel','oral solution','powder for suspension','granules for suspension','ophthalmic solution','nasal spray','suppository'])assert.ok(editor.includes(`'${form}'`),`Missing dosage form: ${form}`);
 for(const unit of ['drop','dose','actuation','prefilled syringe','patch','test strip','ml','mg','mcg','kg'])assert.ok(editor.includes(`'${unit}'`),`Missing base stock unit: ${unit}`);
 assert.match(editor,/const dosageLabel=v=>/);
 assert.match(editor,/product\?\.dosage_form/,'editing must retain a previously saved custom form');
 assert.match(editor,/product\?\.base_unit/,'editing must retain a previously saved custom unit');
});
