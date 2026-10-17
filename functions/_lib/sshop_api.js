import {db} from './db.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const bad=(message,status=400)=>json({error:message},status);
const now=()=>new Date().toISOString();
const today=()=>new Date().toISOString().slice(0,10);
const n=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
const r2=x=>Math.round((n(x)+Number.EPSILON)*100)/100;
const r3=x=>Math.round((n(x)+Number.EPSILON)*1000)/1000;
const text=(x,max=240)=>String(x??'').trim().slice(0,max);
const isDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&Number.isFinite(Date.parse(String(x)+'T00:00:00Z'))&&new Date(String(x)+'T00:00:00Z').toISOString().slice(0,10)===String(x);
const idList=ids=>ids.length?`in.(${[...new Set(ids)].join(',')})`:'in.(00000000-0000-0000-0000-000000000000)';
const asArray=x=>Array.isArray(x)?x:[];
const uuid=()=>crypto.randomUUID();
const methods=new Set(['cash','bank','bkash','nagad','other']);
const canonicalType=x=>String(x?.business_type||x?.shop_type||'electronics').toLowerCase();
const invTotal=x=>r2(n(x.subtotal)+n(x.tax_amount)+n(x.line_tax_amount)-n(x.line_discount_amount)-n(x.discount));
const permission=(s,allowed,section,verb)=>allowed(s,section,verb)?null:bad('Permission denied.',403);
function writeGuard(s,store,allowed,section,verb){
  if(store.status==='read_only'||s.readOnly||s.licenseExpired)return bad('This shop is read-only. An active license is required to change Supershop data.',403);
  return permission(s,allowed,section,verb);
}
async function shopContext(env,s){
  if(!s?.storeId)return {error:bad('Shop access required.',403)};
  const [store]=await db(env,`stores?id=eq.${encodeURIComponent(s.storeId)}&select=id,admin_id,name,status,shop_type,business_type,low_stock_threshold`);
  if(!store)return {error:bad('Shop not found.',404)};
  if(canonicalType(store)!=='supershop')return {error:bad('Supershop Console is available only for Supershop stores.',403)};
  if(store.status==='inactive')return {error:bad('This shop is deactivated.',403)};
  return {store,storeId:store.id};
}
function permissionPriceOverride(s,allowed){return s.role==='admin'||s.adminAccess||allowed(s,'sales','edit')}
function routeError(error){
  const message=String(error?.message||'Supershop request failed.');
  const status=/not found|does not belong|not in this shop|unavailable/i.test(message)?404:/already|duplicate|underflow|exceeds|insufficient|changed while|conflict/i.test(message)?409:400;
  return bad(message,status);
}
async function listProducts(env,storeId,includeSupplierDetails=false){
  const [meta,suppliers]=await Promise.all([
    db(env,`supershop_products?store_id=eq.${storeId}&select=*&order=created_at.desc`),
    includeSupplierDetails?db(env,`suppliers?store_id=eq.${storeId}&select=id,name,supplier_code&order=name.asc`):Promise.resolve([]),
  ]);
  const ids=meta.map(x=>x.inventory_item_id).filter(Boolean);
  const [items,units]=await Promise.all([
    ids.length?db(env,`inventory_items?store_id=eq.${storeId}&id=${idList(ids)}&select=id,item_code,description,unit,sale_price,total_stock,active,category,created_at,updated_at`):[],
    ids.length?db(env,`supershop_product_units?store_id=eq.${storeId}&inventory_item_id=${idList(ids)}&select=*&order=factor_to_base.asc`):[],
  ]);
  const itemMap=Object.fromEntries(items.map(x=>[x.id,x])),unitMap={};
  for(const u of units)(unitMap[u.inventory_item_id]||(unitMap[u.inventory_item_id]=[])).push(u);
  const products=meta.map(x=>{
    const item=itemMap[x.inventory_item_id]||{};
    return {id:x.inventory_item_id,inventory_item_id:x.inventory_item_id,sku:item.item_code||'',name:item.description||'Unnamed product',description:x.description||'',
      unit:item.unit||'piece',base_unit:item.unit||'piece',sale_price:n(item.sale_price),purchase_price:n(x.average_cost_base),average_cost_base:n(x.average_cost_base),
      total_stock:r3(item.total_stock),available_stock:r3(item.total_stock),active:x.active!==false&&item.active!==false,
      category:item.category||'',subcategory:x.subcategory||'',brand:x.brand||'',barcode:x.barcode||'',default_supplier_id:x.default_supplier_id||null,
      mrp_per_base:n(x.mrp_per_base,item.sale_price||0),tax_percent:n(x.tax_percent),reorder_threshold:n(x.reorder_threshold),
      units:unitMap[x.inventory_item_id]||[],created_at:item.created_at||x.created_at,updated_at:item.updated_at||x.updated_at};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const subcategories=[...new Set(products.map(p=>p.subcategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  return {products,suppliers,categories,subcategories};
}
async function refreshAlerts(env,storeId){
  const {products}=await listProducts(env,storeId),existing=await db(env,`supershop_alerts?store_id=eq.${storeId}&select=*`),byKey=Object.fromEntries(existing.map(x=>[x.alert_key,x])),desired=new Set(),stamp=now();
  for(const p of products){
    if(!p.active||p.total_stock>p.reorder_threshold)continue;
    const key=`low-stock:${p.id}`;desired.add(key);const old=byKey[key];
    await db(env,'supershop_alerts?on_conflict=store_id,alert_key',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({store_id:storeId,alert_key:key,inventory_item_id:p.id,
      severity:p.total_stock<=0?'critical':'warning',title:p.total_stock<=0?'Product out of stock':'Product low on stock',
      detail:`${p.name}: ${p.total_stock} ${p.base_unit} on hand; reorder at ${p.reorder_threshold}.`,status:old&&old.status!=='resolved'?old.status:'unread',href:'supershop-products',created_at:old?.created_at||stamp,updated_at:stamp})});
  }
  for(const old of existing)if(old.status!=='resolved'&&!desired.has(old.alert_key))await db(env,`supershop_alerts?id=eq.${old.id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'resolved',updated_at:stamp})});
}
async function listInvoices(env,storeId,kind,query={}){
  let filter=`store_id=eq.${encodeURIComponent(storeId)}&kind=eq.${kind}&select=*&order=invoice_date.desc,created_at.desc&limit=250`;
  if(isDate(query.from))filter+=`&invoice_date=gte.${query.from}`;if(isDate(query.to))filter+=`&invoice_date=lte.${query.to}`;
  const invoices=await db(env,`invoices?${filter}`),ids=[...new Set(invoices.map(x=>x.party_id).filter(Boolean))];
  const table=kind==='sale'?'customers':'suppliers';
  const parties=ids.length?await db(env,`${table}?store_id=eq.${storeId}&id=${idList(ids)}&select=id,name`):[];
  const partyMap=Object.fromEntries(parties.map(x=>[x.id,x.name]));
  return invoices.map(x=>({...x,total:invTotal(x),party_name:partyMap[x.party_id]||x.custom_party_name||(kind==='sale'?'Walk-in customer':'Supplier not selected'),kind}));
}
async function invoiceDetails(env,storeId,invoiceId){
  const [invoice]=await db(env,`invoices?id=eq.${encodeURIComponent(invoiceId)}&store_id=eq.${storeId}&select=*`);
  if(!invoice)return null;
  const partyTable=invoice.kind==='sale'?'customers':'suppliers',partyRows=invoice.party_id?await db(env,`${partyTable}?id=eq.${encodeURIComponent(invoice.party_id)}&store_id=eq.${storeId}&select=name`):[];
  invoice.party_name=partyRows[0]?.name||invoice.custom_party_name||(invoice.kind==='sale'?'Walk-in customer':'Supplier not selected');
  const lines=await db(env,`invoice_lines?invoice_id=eq.${encodeURIComponent(invoiceId)}&select=id,invoice_id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price`);
  const lineIds=lines.map(x=>x.id),productIds=[...new Set(lines.map(x=>x.item_id))];
  const [extensions,items]=await Promise.all([
    lineIds.length?db(env,`supershop_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idList(lineIds)}&select=*`):[],
    productIds.length?db(env,`inventory_items?store_id=eq.${storeId}&id=${idList(productIds)}&select=id,item_code,description,unit,total_stock`):[],
  ]);
  const extMap=Object.fromEntries(extensions.map(x=>[x.invoice_line_id,x])),itemMap=Object.fromEntries(items.map(x=>[x.id,x]));
  let returnedMap={},supplierReturnedMap={};
  if(kindOf(invoice)==='sale'&&lineIds.length){
    const [returns,exchanges]=await Promise.all([
      db(env,`return_items?invoice_line_id=${idList(lineIds)}&select=invoice_line_id,quantity`).catch(()=>[]),
      db(env,`exchange_items?invoice_line_id=${idList(lineIds)}&item_type=eq.returned&select=invoice_line_id,quantity`).catch(()=>[]),
    ]);
    for(const x of [...returns,...exchanges])returnedMap[x.invoice_line_id]=(returnedMap[x.invoice_line_id]||0)+n(x.quantity);
  }else if(lineIds.length){
    const returns=await db(env,`supershop_supplier_return_items?store_id=eq.${storeId}&invoice_line_id=${idList(lineIds)}&select=invoice_line_id,quantity_base`).catch(()=>[]);
    for(const x of returns)supplierReturnedMap[x.invoice_line_id]=(supplierReturnedMap[x.invoice_line_id]||0)+n(x.quantity_base);
  }
  const sale=kindOf(invoice)==='sale';
  return {...invoice,total:invTotal(invoice),lines:lines.map(line=>{
    const ext=extMap[line.id]||{},item=itemMap[line.item_id]||{},factor=n(ext.unit_factor,1),used=sale?returnedMap[line.id]||0:supplierReturnedMap[line.id]||0;
    const returnable=sale?Math.max(0,r3(n(line.quantity)-used)):Math.max(0,r3((n(ext.quantity_base)-used)/factor));
    return {...line,unit_label:ext.unit_label||item.unit||'piece',unit_factor:factor,quantity_base:n(ext.quantity_base,r3(n(line.quantity)*factor)),free_quantity_base:n(ext.free_quantity_base),unit_cost_base:n(ext.unit_cost_base),
      mrp_per_base:n(ext.mrp_per_base),product_name:item.description||'Product',sku:item.item_code||'',returnable_quantity:returnable,returnable_base:sale?r3(returnable*factor):Math.max(0,r3(n(ext.quantity_base)-used))};
  })};
}
function kindOf(invoice){return String(invoice?.kind||'')}
function rpc(env,name,p){return db(env,`rpc/${name}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});}
async function postInvoice(env,s,store,kind,b,allowed,audit){
  if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>200)throw Error('Add between 1 and 200 products to the invoice');
  const invoiceDate=isDate(b.invoiceDate)?b.invoiceDate:today(),payment=String(b.paymentMethod||'cash').toLowerCase();if(!methods.has(payment))throw Error('Select a valid payment method');
  const operationKey=text(b.idempotencyKey||uuid(),160);if(operationKey.length<12)throw Error('A valid transaction key is required');
  const products=b.lines.map(x=>({productId:String(x.productId||''),unitLabel:text(x.unitLabel,60).toLowerCase(),quantity:Number(x.quantity),freeQuantity:Number(x.freeQuantity||0),unitPrice:x.unitPrice==null||x.unitPrice===''?null:Number(x.unitPrice),taxPercent:x.taxPercent==null||x.taxPercent===''?null:Number(x.taxPercent),discount:Number(x.discount||0)}));
  if(products.some(x=>!x.productId||!x.unitLabel||!Number.isFinite(x.quantity)||x.quantity<=0))throw Error('Each invoice line needs a product, unit and positive quantity');
  const result=await rpc(env,'supershop_post_invoice',{p_store_id:store.id,p_kind:kind,p_invoice_number:await db(env,'rpc/next_ems_invoice_number',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_kind:kind})}),
    p_party_id:b.partyId||null,p_invoice_date:invoiceDate,p_payment_method:payment,p_transaction_id:text(b.transactionId,120)||null,p_notes:text(b.notes,2000)||null,
    p_tax_percent:Number(b.taxPercent||0),p_discount:Number(b.discount||0),p_paid_amount:Number(b.paidAmount||0),p_created_by:s.id,p_lines:products,p_idempotency_key:operationKey,
    p_custom_party_name:text(b.customParty?.name||'',180)||null,p_custom_party_address:text(b.customParty?.address||'',240)||null,p_custom_party_phone:text(b.customParty?.phone||'',60)||null,
    p_allow_price_override:kind==='sale'?permissionPriceOverride(s,allowed):true});
  await refreshAlerts(env,store.id).catch(()=>{});
  await auditIf(audit,env,s,kind==='sale'?'Supershop sale':'Supershop purchase', 'invoice',result?.id||result?.invoice_id||null,{invoice_number:result?.invoice_number,kind,total:invTotal(result||{}),idempotent:!!result?.idempotent});
  return result;
}
async function auditIf(audit,env,s,action,entity,id,meta){if(typeof audit==='function')return audit(env,s,action,entity,id,meta)}
async function allReports(env,storeId,query){
  let salesQuery=`invoices?store_id=eq.${storeId}&kind=eq.sale&select=*&order=invoice_date.desc&limit=500`,purchaseQuery=`invoices?store_id=eq.${storeId}&kind=eq.purchase&select=*&order=invoice_date.desc&limit=500`;
  if(isDate(query.from)){salesQuery+=`&invoice_date=gte.${query.from}`;purchaseQuery+=`&invoice_date=gte.${query.from}`;}if(isDate(query.to)){salesQuery+=`&invoice_date=lte.${query.to}`;purchaseQuery+=`&invoice_date=lte.${query.to}`;}
  const [sales,purchases,products,allReturns,allExchanges,allSupplierReturns]=await Promise.all([
    db(env,salesQuery),db(env,purchaseQuery),listProducts(env,storeId),db(env,`returns?store_id=eq.${storeId}&select=*`).catch(()=>[]),
    db(env,`exchanges?store_id=eq.${storeId}&select=*`).catch(()=>[]),db(env,`supershop_supplier_returns?store_id=eq.${storeId}&select=*`).catch(()=>[]),
  ]);
  /* Returns, exchanges and supplier credits must honour the selected range as
     well: they used to be summed across all time while sales and purchases were
     filtered, so one report mixed two different periods. */
  const inRange=value=>(!isDate(query.from)||String(value)>=query.from)&&(!isDate(query.to)||String(value)<=query.to);
  const returns=asArray(allReturns).filter(x=>inRange(String(x.return_date||'').slice(0,10)));
  const exchanges=asArray(allExchanges).filter(x=>inRange(String(x.exchange_date||'').slice(0,10)));
  const supplierReturns=asArray(allSupplierReturns).filter(x=>inRange(String(x.return_date||'').slice(0,10)));
  const allInvoices=[...sales,...purchases],invoiceIds=allInvoices.map(x=>x.id),lineIds=invoiceIds.length?await db(env,`invoice_lines?invoice_id=${idList(invoiceIds)}&select=id,invoice_id,item_id,quantity,unit_price,line_total,discount`):[];
  const sLineIds=new Set(lineIds.filter(x=>sales.some(s=>s.id===x.invoice_id)).map(x=>x.id));
  const ext=sLineIds.size?await db(env,`supershop_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idList([...sLineIds])}&select=invoice_line_id,unit_cost_base,quantity_base`):[];
  const costMap=Object.fromEntries(ext.map(x=>[x.invoice_line_id,n(x.unit_cost_base)*n(x.quantity_base)]));
  const cogs=lineIds.filter(x=>sLineIds.has(x.id)).reduce((sum,x)=>sum+(costMap[x.id]||0),0);
  const salesTotal=sales.reduce((sum,x)=>sum+invTotal(x),0),purchaseTotal=purchases.reduce((sum,x)=>sum+invTotal(x),0);
  const categories={};for(const item of products.products){const key=item.category||'Uncategorized';categories[key]??={category:key,items:0,stock:0,stock_value:0,low_stock:0};categories[key].items++;categories[key].stock+=item.total_stock;categories[key].stock_value+=item.total_stock*item.average_cost_base;if(item.total_stock<=item.reorder_threshold)categories[key].low_stock++;}
  const days={};for(const x of sales){const date=String(x.invoice_date||'');if(date){days[date]??={date,sales:0,transactions:0};days[date].sales+=invTotal(x);days[date].transactions++;}}
  return {from:query.from||null,to:query.to||null,sales:salesTotal,purchases:purchaseTotal,sales_due:sales.reduce((a,x)=>a+n(x.total_due),0),supplier_due:purchases.reduce((a,x)=>a+n(x.total_due),0),
    gross_profit:r2(salesTotal-cogs),cogs:r2(cogs),sale_count:sales.length,purchase_count:purchases.length,return_total:returns.reduce((a,x)=>a+n(x.total_return_amount),0),
    exchange_count:exchanges.length,supplier_returns:supplierReturns.reduce((a,x)=>a+n(x.total_return_amount),0),supplier_credit:supplierReturns.reduce((a,x)=>a+n(x.supplier_credit),0),
    inventory_value:r2(products.products.reduce((a,x)=>a+x.total_stock*x.average_cost_base,0)),low_stock_count:products.products.filter(x=>x.active&&x.total_stock<=x.reorder_threshold).length,
    categories:Object.values(categories).map(x=>({...x,stock_value:r2(x.stock_value)})).sort((a,b)=>b.stock_value-a.stock_value),daily:Object.values(days).sort((a,b)=>a.date.localeCompare(b.date)),
    top_products:Object.values(lineIds.filter(x=>sLineIds.has(x.id)).reduce((out,line)=>{const p=products.products.find(x=>x.id===line.item_id);if(!p)return out;out[p.id]??={id:p.id,name:p.name,sku:p.sku,quantity:0,sales:0};out[p.id].quantity+=n(line.quantity);out[p.id].sales+=n(line.line_total);return out;},{})).sort((a,b)=>b.sales-a.sales).slice(0,8)};
}
async function loadMovements(env,storeId){
  const rows=await db(env,`supershop_stock_movements?store_id=eq.${storeId}&select=*&order=created_at.desc&limit=400`),ids=[...new Set(rows.map(x=>x.inventory_item_id))],items=ids.length?await db(env,`inventory_items?store_id=eq.${storeId}&id=${idList(ids)}&select=id,item_code,description,unit`):[],map=Object.fromEntries(items.map(x=>[x.id,x]));
  return rows.map(x=>({...x,product_name:map[x.inventory_item_id]?.description||'Product',sku:map[x.inventory_item_id]?.item_code||'',base_unit:map[x.inventory_item_id]?.unit||''}));
}
async function overview(env,storeId,store,query={}){
  const [products,sales,purchases,alerts]=await Promise.all([
    listProducts(env,storeId),listInvoices(env,storeId,'sale'),listInvoices(env,storeId,'purchase'),db(env,`supershop_alerts?store_id=eq.${storeId}&select=*`).catch(()=>[]),
  ]);
  /* Invoice dates are shop-local calendar dates, so "today" must come from the
     console too: the server clock is UTC and would report zero sales for the
     first hours of every day in UTC+ timezones (e.g. Bangladesh). */
  const shopToday=isDate(query.today)?query.today:today();
  const todayRows=rows=>rows.filter(x=>String(x.invoice_date||'').slice(0,10)===shopToday);
  const sum=rows=>r2(rows.reduce((a,x)=>a+invTotal(x),0));
  const low=products.products.filter(x=>x.active&&x.total_stock<=x.reorder_threshold).sort((a,b)=>a.total_stock-b.total_stock);
  const recent=[...sales.slice(0,5),...purchases.slice(0,5)].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8);
  const supplierReturnRows=await db(env,`supershop_supplier_returns?store_id=eq.${storeId}&select=supplier_credit,total_return_amount`).catch(()=>[]);
  return {shop_name:store.name,today_sales:sum(todayRows(sales)),today_purchases:sum(todayRows(purchases)),stock_value:r2(products.products.reduce((a,x)=>a+x.total_stock*x.average_cost_base,0)),
    product_count:products.products.filter(x=>x.active).length,low_stock_count:low.length,low_stock_products:low.slice(0,8),customer_due:r2(sales.reduce((a,x)=>a+n(x.total_due),0)),supplier_due:r2(purchases.reduce((a,x)=>a+n(x.total_due),0)),
    supplier_credit:r2(supplierReturnRows.reduce((a,x)=>a+n(x.supplier_credit),0)),active_alert_count:alerts.filter(x=>x.status!=='resolved').length,recent:recent.map(x=>({...x,total:invTotal(x)}))};
}
async function returnHistory(env,storeId){
  const [returns,exchanges,supplierReturns]=await Promise.all([
    db(env,`returns?store_id=eq.${storeId}&select=*&order=return_date.desc,created_at.desc&limit=200`),
    db(env,`exchanges?store_id=eq.${storeId}&select=*&order=exchange_date.desc,created_at.desc&limit=200`),
    db(env,`supershop_supplier_returns?store_id=eq.${storeId}&select=*&order=return_date.desc,created_at.desc&limit=200`),
  ]);
  const invoiceIds=[...new Set([...returns,...exchanges].map(x=>x.invoice_id).filter(Boolean))];
  const invoiceRows=invoiceIds.length?await db(env,`invoices?store_id=eq.${storeId}&id=${idList(invoiceIds)}&select=id,invoice_number`):[];
  const invoiceMap=Object.fromEntries(invoiceRows.map(x=>[x.id,x.invoice_number]));
  return {returns:returns.map(x=>({...x,invoice_number:invoiceMap[x.invoice_id]||null})),exchanges:exchanges.map(x=>({...x,invoice_number:invoiceMap[x.invoice_id]||null})),supplier_returns:supplierReturns};
}

export async function supershopApi({env,s,path,method,request,allowed,audit}){
  if(!path.startsWith('supershop/'))return null;
  const ctx=await shopContext(env,s);if(ctx.error)return ctx.error;const {store,storeId}=ctx;
  const url=new URL(request.url),query={from:url.searchParams.get('from'),to:url.searchParams.get('to'),today:url.searchParams.get('today')};
  try{
    if(path==='supershop/overview'&&method==='GET'){
      const denied=permission(s,allowed,'dashboard','view');if(denied)return denied;const data=await overview(env,storeId,store,query),canInventory=allowed(s,'inventory','view'),canSales=allowed(s,'sales','view'),canPurchases=allowed(s,'purchase','view'),canSupplierDetails=allowed(s,'supplier','view');
      if(!canInventory){data.stock_value=0;data.low_stock_count=0;data.low_stock_products=[];data.active_alert_count=0;}
      if(!canSales){data.today_sales=0;data.customer_due=0;}
      if(!canPurchases){data.today_purchases=0;data.supplier_due=0;data.supplier_credit=0;}
      data.recent=(data.recent||[]).filter(x=>x.kind==='sale'?canSales:canPurchases).map(x=>x.kind==='purchase'&&!canSupplierDetails?{...x,party_name:'Supplier details hidden'}:x);return json(data);
    }
    if(path==='supershop/products'&&method==='GET'){
      const denied=permission(s,allowed,'inventory','view');if(denied)return denied;return json(await listProducts(env,storeId,allowed(s,'supplier','view')));
    }
    if(path==='supershop/products'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'inventory','add');if(denied)return denied;const viewDenied=permission(s,allowed,'inventory','view');if(viewDenied)return viewDenied;const b=await request.json().catch(()=>({}));
      const productId=await rpc(env,'supershop_save_product',{p_store_id:storeId,p_product_id:null,p_product:productPayload(b),p_units:unitPayload(b.units,b.base_unit),p_created_by:s.id});
      const id=typeof productId==='string'?productId:productId?.id||productId?.inventory_item_id;await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'create Supershop product','inventory',id,{name:text(b.name),sku:text(b.sku),barcode:text(b.barcode)});
      return json((await listProducts(env,storeId,allowed(s,'supplier','view'))).products.find(x=>x.id===id)||{id},201);
    }
    if(path==='supershop/products/import'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'inventory','add');if(denied)return denied;const b=await request.json().catch(()=>({})),rows=asArray(b.items);
      if(!rows.length||rows.length>100)return bad('Import between 1 and 100 product rows at a time.',400);
      const results=[];for(let i=0;i<rows.length;i++){const row=rows[i]||{};try{const base=text(row.base_unit||'piece',60).toLowerCase(),product={...row,name:text(row.name,180),base_unit:base};if(!product.name)throw Error('Product name is required');
        const r=await rpc(env,'supershop_save_product',{p_store_id:storeId,p_product_id:null,p_product:productPayload(product),p_units:unitPayload([{unit_label:base,factor_to_base:1,allow_fractional:!!row.allow_fractional,can_purchase:true,can_sell:true,purchase_price:n(row.purchase_price),selling_price:n(row.sale_price)}],base),p_created_by:s.id});
        results.push({row:i+1,ok:true,id:typeof r==='string'?r:r?.id||r?.inventory_item_id,name:product.name});
      }catch(error){results.push({row:i+1,ok:false,name:text(row.name,120),error:String(error.message||error)})}}
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'import Supershop products','inventory',null,{count:rows.length,success:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length});return json({results,success:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length},201);
    }
    if(path==='supershop/categories'&&method==='GET'){
      const denied=permission(s,allowed,'inventory','view');if(denied)return denied;const data=await listProducts(env,storeId);const grouped={};for(const p of data.products){const c=p.category||'Uncategorized';grouped[c]??=[];if(p.subcategory&&!grouped[c].includes(p.subcategory))grouped[c].push(p.subcategory)}return json({categories:data.categories,subcategories:data.subcategories,grouped});
    }
    if(path==='supershop/categories/rename'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;const b=await request.json().catch(()=>({})),oldCategory=text(b.oldCategory,100),newCategory=text(b.newCategory,100);
      if(!oldCategory||!newCategory||oldCategory===newCategory)return bad('Enter a different non-empty category name.',400);
      const filter=encodeURIComponent(oldCategory);const changed=await db(env,`inventory_items?store_id=eq.${storeId}&category=eq.${filter}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({category:newCategory})});
      if(b.oldSubcategory&&b.newSubcategory){await db(env,`supershop_products?store_id=eq.${storeId}&subcategory=eq.${encodeURIComponent(text(b.oldSubcategory,100))}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({subcategory:text(b.newSubcategory,100)})});}
      await auditIf(audit,env,s,'rename Supershop category','inventory',null,{from:oldCategory,to:newCategory,count:changed?.length||0});return json({ok:true,updated:changed?.length||0});
    }
    const productMatch=path.match(/^supershop\/products\/([^/]+)$/);
    if(productMatch&&method==='GET'){
      const denied=permission(s,allowed,'inventory','view');if(denied)return denied;const products=await listProducts(env,storeId);const row=products.products.find(x=>x.id===decodeURIComponent(productMatch[1]));return row?json(row):bad('Product not found.',404);
    }
    if(productMatch&&method==='PATCH'){
      const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;const viewDenied=permission(s,allowed,'inventory','view');if(viewDenied)return viewDenied;const b=await request.json().catch(()=>({}));
      const existing=(await listProducts(env,storeId)).products.find(x=>x.id===decodeURIComponent(productMatch[1]));if(!existing)return bad('Product not found.',404);
      const merged={...existing,...b};const result=await rpc(env,'supershop_save_product',{p_store_id:storeId,p_product_id:existing.id,p_product:productPayload(merged),p_units:unitPayload(b.units||existing.units,merged.base_unit),p_created_by:s.id});
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'update Supershop product','inventory',existing.id,{fields:Object.keys(b)});return json((await listProducts(env,storeId)).products.find(x=>x.id===existing.id)||{id:existing.id});
    }
    if(productMatch&&method==='DELETE'){
      const denied=writeGuard(s,store,allowed,'inventory','delete');if(denied)return denied;const id=decodeURIComponent(productMatch[1]);const [meta]=await db(env,`supershop_products?inventory_item_id=eq.${id}&store_id=eq.${storeId}&select=*`);if(!meta)return bad('Product not found.',404);
      await db(env,`inventory_items?id=eq.${id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:false})});await db(env,`supershop_products?inventory_item_id=eq.${id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:false})});
      await auditIf(audit,env,s,'archive Supershop product','inventory',id,{name:meta.description||null});return json({ok:true});
    }
    if(path==='supershop/sales'&&method==='GET'){
      const denied=permission(s,allowed,'sales','view');if(denied)return denied;return json(await listInvoices(env,storeId,'sale',query));
    }
    if(path==='supershop/sales'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'sales','add');if(denied)return denied;const inventoryDenied=permission(s,allowed,'inventory','view');if(inventoryDenied)return inventoryDenied;const b=await request.json().catch(()=>({}));return json(await postInvoice(env,s,store,'sale',b,allowed,audit),201);
    }
    if(path==='supershop/purchases'&&method==='GET'){
      const denied=permission(s,allowed,'purchase','view');if(denied)return denied;const rows=await listInvoices(env,storeId,'purchase',query);return json(allowed(s,'supplier','view')?rows:rows.map(x=>({...x,party_name:'Supplier details hidden'})));
    }
    if(path==='supershop/purchases'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'purchase','add');if(denied)return denied;const inventoryDenied=permission(s,allowed,'inventory','view');if(inventoryDenied)return inventoryDenied;const b=await request.json().catch(()=>({}));return json(await postInvoice(env,s,store,'purchase',b,allowed,audit),201);
    }
    const invoiceRoute=path.match(/^supershop\/(sales|purchases)\/([^/]+)(?:\/(returnable))?$/);
    if(invoiceRoute&&method==='GET'){
      const group=invoiceRoute[1],id=decodeURIComponent(invoiceRoute[2]),kind=group==='sales'?'sale':'purchase';const denied=permission(s,allowed,kind==='sale'?'sales':'purchase','view');if(denied)return denied;
      const details=await invoiceDetails(env,storeId,id);if(!details||details.kind!==kind)return bad('Invoice not found.',404);if(kind==='purchase'&&!allowed(s,'supplier','view'))details.party_name='Supplier details hidden';return json(details);
    }
    if(path==='supershop/stock-adjustments'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;const b=await request.json().catch(()=>({}));
      const result=await rpc(env,'supershop_adjust_stock',{p_store_id:storeId,p_inventory_item_id:b.productId,p_delta:b.delta==null?null:Number(b.delta),p_target_quantity:b.targetQuantity==null?null:Number(b.targetQuantity),p_movement_type:text(b.movementType||'adjustment',40),p_reason:text(b.reason,240),p_idempotency_key:text(b.idempotencyKey||uuid(),160),p_created_by:s.id});
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'adjust Supershop stock','inventory',b.productId,{delta:result?.delta,movement_type:b.movementType,reason:text(b.reason)});return json(result,201);
    }
    if(path==='supershop/stock-movements'&&method==='GET'){
      const denied=permission(s,allowed,'inventory','view');if(denied)return denied;return json(await loadMovements(env,storeId));
    }
    if(path==='supershop/alerts'&&method==='GET'){
      const denied=permission(s,allowed,'inventory','view');if(denied)return denied;const [{products},stored]=await Promise.all([listProducts(env,storeId),db(env,`supershop_alerts?store_id=eq.${storeId}&select=*&order=updated_at.desc`)]);
      const storedMap=Object.fromEntries(stored.map(x=>[x.alert_key,x]));const current=products.filter(x=>x.active&&x.total_stock<=x.reorder_threshold).map(p=>storedMap[`low-stock:${p.id}`]||{id:`low-stock:${p.id}`,alert_key:`low-stock:${p.id}`,inventory_item_id:p.id,severity:p.total_stock<=0?'critical':'warning',title:p.total_stock<=0?'Product out of stock':'Product low on stock',detail:`${p.name}: ${p.total_stock} ${p.base_unit} on hand; reorder at ${p.reorder_threshold}.`,status:'unread',href:'supershop-products',updated_at:p.updated_at});
      return json([...current,...stored.filter(x=>x.status==='resolved')]);
    }
    const alertMatch=path.match(/^supershop\/alerts\/([^/]+)\/read$/);
    if(alertMatch&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;const id=decodeURIComponent(alertMatch[1]),[row]=await db(env,`supershop_alerts?id=eq.${id}&store_id=eq.${storeId}&select=*`);if(!row)return bad('Alert not found.',404);
      const [updated]=await db(env,`supershop_alerts?id=eq.${id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'read',updated_at:now()})});return json(updated||{ok:true});
    }
    if(path==='supershop/returns'&&method==='GET'){
      const denied=permission(s,allowed,'returns_refunds','view');if(denied)return denied;return json(await returnHistory(env,storeId));
    }
    if(path==='supershop/returns'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'returns_refunds','add');if(denied)return denied;const salesDenied=permission(s,allowed,'sales','view');if(salesDenied)return salesDenied;const b=await request.json().catch(()=>({}));
      const items=asArray(b.items).map(x=>({invoiceLineId:String(x.invoiceLineId||x.invoice_line_id||''),quantity:Number(x.quantity),reason:text(x.reason,80),reasonNote:text(x.reasonNote||x.reason_note,240),condition:String(x.condition||'Sellable'),penalty:Number(x.penalty||0)}));
      const result=await rpc(env,'supershop_post_return',{p_store_id:storeId,p_invoice_id:b.invoiceId||b.invoice_id,p_return_number:`RET-${new Date().getFullYear()}-${uuid().slice(0,8).toUpperCase()}`,p_return_date:isDate(b.returnDate)?b.returnDate:today(),p_reason:text(b.reason,240)||'Customer return',p_notes:text(b.notes,2000),p_refund_method:String(b.refundMethod||b.refund_method||'none').toLowerCase(),p_transaction_id:text(b.transactionId||b.transaction_id,120),p_idempotency_key:text(b.idempotencyKey||uuid(),160),p_created_by:s.id,p_items:items});
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'post Supershop customer return','return',result?.id,{return_number:result?.return_number,total:result?.total_return_amount,refunded:result?.refunded_amount});return json(result,201);
    }
    if(path==='supershop/exchanges'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'returns_refunds','add');if(denied)return denied;const salesDenied=permission(s,allowed,'sales','view');if(salesDenied)return salesDenied;const b=await request.json().catch(()=>({}));
      const returned=asArray(b.returnedItems||b.returned_items).map(x=>({invoiceLineId:String(x.invoiceLineId||x.invoice_line_id||''),quantity:Number(x.quantity),reason:text(x.reason,80),reasonNote:text(x.reasonNote||x.reason_note,240),condition:String(x.condition||'Sellable')}));
      const newItems=asArray(b.newItems||b.new_items).map(x=>({productId:String(x.productId||x.item_id||''),unitLabel:text(x.unitLabel||x.unit_label,60).toLowerCase(),quantity:Number(x.quantity),unitPrice:x.unitPrice==null?null:Number(x.unitPrice),taxPercent:x.taxPercent==null?null:Number(x.taxPercent),discount:Number(x.discount||0)}));
      const result=await rpc(env,'supershop_post_exchange',{p_store_id:storeId,p_invoice_id:b.invoiceId||b.invoice_id,p_exchange_number:`EXC-${new Date().getFullYear()}-${uuid().slice(0,8).toUpperCase()}`,p_exchange_date:isDate(b.exchangeDate)?b.exchangeDate:today(),p_payment_method:String(b.paymentMethod||b.payment_method||'cash').toLowerCase(),p_transaction_id:text(b.transactionId||b.transaction_id,120),p_notes:text(b.notes,2000),p_idempotency_key:text(b.idempotencyKey||uuid(),160),p_created_by:s.id,p_returned_items:returned,p_new_items:newItems,p_allow_price_override:permissionPriceOverride(s,allowed)});
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'post Supershop exchange','exchange',result?.id,{exchange_number:result?.exchange_number,difference:result?.difference_amount,action:result?.action_type});return json(result,201);
    }
    if(path==='supershop/supplier-returns'&&method==='GET'){
      const denied=permission(s,allowed,'purchase','view');if(denied)return denied;const canSupplierDetails=allowed(s,'supplier','view'),rows=await db(env,`supershop_supplier_returns?store_id=eq.${storeId}&select=*&order=return_date.desc,created_at.desc&limit=200`),ids=[...new Set(rows.map(x=>x.purchase_invoice_id).filter(Boolean))],invoices=ids.length?await db(env,`invoices?store_id=eq.${storeId}&id=${idList(ids)}&select=id,invoice_number,party_id`):[],parties=[...new Set(invoices.map(x=>x.party_id).filter(Boolean))],suppliers=canSupplierDetails&&parties.length?await db(env,`suppliers?store_id=eq.${storeId}&id=${idList(parties)}&select=id,name`):[],im=Object.fromEntries(invoices.map(x=>[x.id,x])),sm=Object.fromEntries(suppliers.map(x=>[x.id,x.name]));return json(rows.map(x=>({...x,purchase_invoice_number:im[x.purchase_invoice_id]?.invoice_number||null,supplier_name:canSupplierDetails?(sm[im[x.purchase_invoice_id]?.party_id]||null):null})));
    }
    if(path==='supershop/supplier-returns'&&method==='POST'){
      const denied=writeGuard(s,store,allowed,'purchase','add');if(denied)return denied;const purchaseViewDenied=permission(s,allowed,'purchase','view');if(purchaseViewDenied)return purchaseViewDenied;const b=await request.json().catch(()=>({}));
      const items=asArray(b.items).map(x=>({invoiceLineId:String(x.invoiceLineId||x.invoice_line_id||''),quantity:Number(x.quantity)}));
      const result=await rpc(env,'supershop_post_supplier_return',{p_store_id:storeId,p_invoice_id:b.invoiceId||b.invoice_id,p_return_number:`SUPRET-${new Date().getFullYear()}-${uuid().slice(0,8).toUpperCase()}`,p_return_date:isDate(b.returnDate)?b.returnDate:today(),p_reason:text(b.reason,240),p_notes:text(b.notes,2000),p_idempotency_key:text(b.idempotencyKey||uuid(),160),p_created_by:s.id,p_items:items});
      await refreshAlerts(env,storeId).catch(()=>{});await auditIf(audit,env,s,'post Supershop supplier return','supplier_return',result?.id,{return_number:result?.return_number,total:result?.total_return_amount,supplier_credit:result?.supplier_credit});return json(result,201);
    }
    if(path==='supershop/reports'&&method==='GET'){
      const denied=permission(s,allowed,'report','view');if(denied)return denied;return json(await allReports(env,storeId,query));
    }
    return bad('Supershop endpoint not found.',404);
  }catch(error){console.error('Supershop API:',error);return routeError(error)}
}

function flag(value,fallback=true){if(value==null)return fallback;return value===true||value===1||String(value).toLowerCase()==='true'}
function productPayload(b){return {name:text(b.name,180),sku:text(b.sku,80),barcode:text(b.barcode,80),brand:text(b.brand,120),category:text(b.category,100),subcategory:text(b.subcategory,100),
  description:text(b.description,2000),base_unit:text(b.base_unit||b.baseUnit||'piece',60).toLowerCase(),purchase_price:n(b.purchase_price??b.purchasePrice),sale_price:n(b.sale_price??b.salePrice),mrp_per_base:n(b.mrp_per_base??b.mrp??b.sale_price??0),
  tax_percent:n(b.tax_percent??b.taxPercent),reorder_threshold:n(b.reorder_threshold??b.reorderThreshold,5),initial_stock:0,default_supplier_id:b.default_supplier_id||b.supplier_id||null,active:b.active!==false};}
function unitPayload(raw,baseUnit){
  const base=text(baseUnit||'piece',60).toLowerCase();const units=asArray(raw).map(u=>({unit_label:text(u.unit_label||u.unitLabel,60).toLowerCase(),factor_to_base:Number(u.factor_to_base??u.factorToBase),allow_fractional:!!(u.allow_fractional??u.allowFractional),can_purchase:flag(u.can_purchase??u.canPurchase,true),can_sell:flag(u.can_sell??u.canSell,true),
    purchase_price:u.purchase_price==null&&u.purchasePrice==null?null:Number(u.purchase_price??u.purchasePrice),selling_price:u.selling_price==null&&u.sellingPrice==null?null:Number(u.selling_price??u.sellingPrice)})).filter(x=>x.unit_label);
  if(!units.some(x=>x.unit_label===base&&Number(x.factor_to_base)===1))units.unshift({unit_label:base,factor_to_base:1,allow_fractional:false,can_purchase:true,can_sell:true,purchase_price:null,selling_price:null});return units;
}
