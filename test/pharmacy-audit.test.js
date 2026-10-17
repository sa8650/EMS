import test from 'node:test';
import assert from 'node:assert/strict';
import {auditActorType,isAdministratorAuditEntry} from '../functions/_lib/audit_actor.js';
import {pharmacyApi} from '../functions/_lib/pharmacy_api.js';

const storeId='11111111-1111-4111-8111-111111111111';
const adminId='22222222-2222-4222-8222-222222222222';
const staffId='33333333-3333-4333-8333-333333333333';
const alertId='44444444-4444-4444-8444-444444444444';

test('audit actor identifies administrator shop login, console switch, Zudo requests, and ordinary staff',()=>{
  assert.equal(auditActorType({role:'staff',adminAccess:true,id:adminId}),'admin');
  assert.equal(auditActorType({role:'admin',id:adminId}),'admin');
  assert.equal(auditActorType({role:'staff',id:staffId}),'staff');
  assert.equal(isAdministratorAuditEntry({actor_type:'staff',actor_id:adminId},{id:adminId},{}),true);
  assert.equal(isAdministratorAuditEntry({actor_type:'staff',actor_id:staffId},{id:adminId},{}),false);
  assert.equal(isAdministratorAuditEntry({actor_type:'staff',actor_id:adminId},{id:adminId},{[adminId]:{id:adminId}}),false);
});

async function withMockDb(run){
  const prior=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{
    const path=new URL(url).pathname+new URL(url).search;
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(path.includes('/stores?'))return Response.json([{id:storeId,admin_id:adminId,status:'active',shop_type:'pharmacy'}]);
    if(path.includes('/pharmacy_alerts?')&&options.method==='PATCH')return Response.json([{id:alertId}]);
    throw new Error('Unexpected DB call: '+path);
  };
  try{return await run(calls)}finally{globalThis.fetch=prior}
}
const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
const request=new Request('https://example.test/api/pharmacy/alerts/read-all',{method:'POST'});
const args={env,s:{id:adminId,role:'staff',adminAccess:true,storeId},method:'POST',request,allowed:()=>true};

test('mark-all reads only unread alerts in the current pharmacy store',async()=>withMockDb(async calls=>{
  const response=await pharmacyApi({...args,path:'pharmacy/alerts/read-all'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{count:1});
  const update=calls.find(x=>x.method==='PATCH');
  assert.match(update.path,new RegExp(`store_id=eq\\.${storeId}`));
  assert.match(update.path,/status=eq\.unread/);
  assert.equal(update.body.status,'read');
}));

test('read-only stores cannot acknowledge alerts',async()=>withMockDb(async calls=>{
  const response=await pharmacyApi({...args,s:{...args.s,readOnly:true},path:'pharmacy/alerts/read-all'});
  assert.equal(response.status,403);
  assert.equal(calls.some(x=>x.method==='PATCH'),false);
}));

test('single alert acknowledgement is scoped to store and unread state',async()=>withMockDb(async calls=>{
  const response=await pharmacyApi({...args,path:`pharmacy/alerts/${alertId}/read`});
  assert.equal(response.status,200);
  const update=calls.find(x=>x.method==='PATCH');
  assert.match(update.path,new RegExp(`id=eq\\.${alertId}`));
  assert.match(update.path,/status=eq\.unread/);
  assert.match(update.path,new RegExp(`store_id=eq\\.${storeId}`));
}));

test('alert refresh keeps acknowledged alerts acknowledged and does not rewrite unchanged alerts',async()=>{
  const prior=globalThis.fetch,calls=[];
  const productId='55555555-5555-4555-8555-555555555555';
  const itemId='66666666-6666-4666-8666-666666666666';
  let stock=2;
  const existing={id:alertId,store_id:storeId,alert_key:`low-stock:${productId}`,status:'read',read_at:'2026-01-01T00:00:00Z',severity:'warning',title:'Medicine low on stock',detail:'A: 2 tablet on hand; reorder threshold 5.',href:'pharmacy-products'};
  globalThis.fetch=async(url,options={})=>{
    const path=new URL(url).pathname+new URL(url).search;
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(path.includes('/stores?'))return Response.json([{id:storeId,admin_id:adminId,status:'active',shop_type:'pharmacy'}]);
    if(path.includes('/pharmacy_products?'))return Response.json([{id:productId,inventory_item_id:itemId,name:'A',base_unit:'tablet',active:true,reorder_threshold:5}]);
    if(path.includes('/inventory_items?'))return Response.json([{id:itemId,total_stock:stock,active:true}]);
    if(path.includes('/suppliers?')||path.includes('/pharmacy_product_units?')||path.includes('/pharmacy_settings?'))return Response.json([]);
    if(path.includes('/pharmacy_alerts?'))return Response.json(options.method==='PATCH'?[{...existing,...JSON.parse(options.body)}]:[existing]);
    throw new Error('Unexpected DB call: '+path);
  };
  try{
    const req=new Request('https://example.test/api/pharmacy/alerts');
    await pharmacyApi({...args,path:'pharmacy/alerts',method:'GET',request:req});
    assert.equal(calls.some(x=>x.method==='PATCH'),false);
    stock=0;calls.length=0;
    await pharmacyApi({...args,path:'pharmacy/alerts',method:'GET',request:req});
    const update=calls.find(x=>x.method==='PATCH');
    assert.equal(update.body.status,'read');
    assert.equal(update.body.read_at,existing.read_at);
    assert.equal(update.body.severity,'critical');
  }finally{globalThis.fetch=prior}
});

test('pharmacy dashboard aggregates the full pharmacy ledger and scopes recent activity',async()=>{
  const oldFetch=globalThis.fetch,today=new Date().toISOString().slice(0,10),calls=[];
  const productId='55555555-5555-4555-8555-555555555555',itemId='66666666-6666-4666-8666-666666666666';
  const sales=Array.from({length:61},(_,i)=>({id:`sale-${i}`,kind:'sale',invoice_number:`S-${i}`,invoice_date:today,created_at:`${today}T10:00:00Z`,subtotal:10,total_due:2,paid_amount:8}));
  const purchases=[{id:'purchase-1',kind:'purchase',invoice_number:'P-1',invoice_date:today,created_at:`${today}T09:00:00Z`,subtotal:5,total_due:1,paid_amount:4}];
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url),path=u.pathname+u.search;
    calls.push(path);
    if(path.includes('/stores?'))return Response.json([{id:storeId,admin_id:adminId,status:'read_only',shop_type:'pharmacy'}]);
    if(path.includes('/pharmacy_products?'))return Response.json([{id:productId,inventory_item_id:itemId,name:'A',active:true,base_unit:'tablet',reorder_threshold:5,average_cost_base:2}]);
    if(path.includes('/inventory_items?'))return Response.json([{id:itemId,total_stock:4,active:true}]);
    if(path.includes('/pharmacy_operations?'))return Response.json((path.includes('operation_type=eq.sale')?sales:purchases).map(x=>({invoice_id:x.id})));
    if(path.includes('/invoices?')){
      const ids=(decodeURIComponent(u.searchParams.get('id')||'').match(/^in\.\((.*)\)$/)||[])[1]?.split(',')||[];
      return Response.json([...sales,...purchases].filter(x=>ids.includes(x.id)));
    }
    if(path.includes('/activity_logs?'))return Response.json([{id:1,action:'post pharmacy sale',entity_type:'sale invoice',actor_type:'staff',actor_id:adminId,created_at:`${today}T10:00:00Z`}]);
    if(path.includes('/suppliers?')||path.includes('/pharmacy_product_units?')||path.includes('/pharmacy_settings?')||path.includes('/customers?')||path.includes('/staff?'))return Response.json([]);
    throw Error(`Unexpected query ${path} ${options.method||'GET'}`);
  };
  try{
    const response=await pharmacyApi({...args,s:{...args.s,readOnly:true},path:'pharmacy/overview',method:'GET',request:new Request('https://example.test/api/pharmacy/overview')});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.metrics.sales,610);
    assert.equal(data.metrics.salesToday,610);
    assert.equal(data.metrics.purchases,5);
    assert.equal(data.metrics.customerDue,122);
    assert.equal(data.metrics.stockValue,8);
    assert.equal(data.weekly.at(-1).sales,610);
    assert.equal(data.recent.length,8);
    assert.equal(data.activity[0].actor_name,'Administrator');
    assert.equal(calls.filter(x=>x.includes('/invoices?')).length,2,'large ledgers are queried in chunks');
  }finally{globalThis.fetch=oldFetch}
});

test('fresh Pharmacy dashboard renders KPIs, two bar charts, activity, and recent transactions',async()=>{
  const {pshopDashboard}=await import('../assets/js/pshop.js');
  const previous=globalThis.document,page={innerHTML:''},refresh={};
  globalThis.document={querySelector:selector=>selector==='#page'?page:selector==='#pshDashboardRefresh'?refresh:null,querySelectorAll:()=>[]};
  try{
    await pshopDashboard({api:async()=>({metrics:{sales:100,salesToday:25,purchases:30,purchasesToday:10,customerDue:5,supplierDue:2,customerDueToday:1,supplierDueToday:0,stockValue:70,medicines:4,lowStock:1,outOfStock:0},weekly:[{date:'2026-10-17',sales:25,purchases:10}],activity:[{id:1,action:'post pharmacy sale',entity_type:'sale invoice',actor_name:'Administrator',created_at:'2026-10-17T10:00:00Z'}],recent:[{id:'s1',kind:'sale',invoice_number:'S-1',invoice_date:'2026-10-17',created_at:'2026-10-17T10:00:00Z',party_name:'Walk-in',total:25,paid_amount:24,total_due:1}]}),isCurrent:()=>true,canAccess:()=>true,lucide:()=>'',esc:x=>String(x).replaceAll('<','&lt;'),money:x=>Number(x).toFixed(2),navigate:()=>{}});
    assert.match(page.innerHTML,/Today’s financial chart/);
    assert.match(page.innerHTML,/Last 7 days/);
    assert.match(page.innerHTML,/Recent activity/);
    assert.match(page.innerHTML,/Recent transactions/);
    assert.match(page.innerHTML,/S-1/);
    assert.doesNotMatch(page.innerHTML,/Token Monitor|Tool Inspector|psh-dashboard-banner|psh-agent-grid/);
    assert.equal(typeof refresh.onclick,'function');
  }finally{globalThis.document=previous}
});
