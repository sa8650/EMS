import {db} from './db.js';

const ok=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const bad=(message,status=400)=>ok({error:message},status);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const now=()=>new Date().toISOString();
const dateToday=()=>new Date().toISOString().slice(0,10);
const n=(x,d=0)=>{const y=Number(x);return Number.isFinite(y)?y:d};
const r2=x=>Math.round((n(x)+Number.EPSILON)*100)/100;
const r3=x=>Math.round((n(x)+Number.EPSILON)*1000)/1000;
const text=(x,max=240)=>String(x??'').trim().slice(0,max);
const listIn=ids=>`in.(${[...new Set(ids)].join(',')})`;
const jsonBody=async request=>{try{return await request.json()}catch{return {}}};
const write=(env,table,data,method='POST')=>db(env,table,{method,headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const canonicalShopType=store=>String(store?.business_type||store?.shop_type||'electronics').toLowerCase();
const isDate=x=>{const value=String(x||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value};
const invoiceTotal=x=>r2(n(x.subtotal)+n(x.line_tax_amount)+n(x.tax_amount)-n(x.discount)-n(x.line_discount_amount));
const sameId=(a,b)=>String(a||'')===String(b||'');

async function shopContext(env,s){
  if(!s?.storeId)return {error:bad('Shop access required.',403)};
  const [store]=await db(env,`stores?id=eq.${encodeURIComponent(s.storeId)}&select=id,admin_id,name,status,shop_type,business_type,low_stock_threshold`);
  if(!store)return {error:bad('Shop not found.',404)};
  if(canonicalShopType(store)!=='pharmacy')return {error:bad('Pharmacy Console is available only for Pharmacy stores.',403)};
  if(store.status==='inactive')return {error:bad('This shop is deactivated.',403)};
  return {store,storeId:store.id};
}
function permission(s,allowed,section,verb){return allowed(s,section,verb)?null:bad('Permission denied.',403)}
function writeGuard(s,store,allowed,section,verb){
  if(store.status==='read_only'||s.readOnly||s.licenseExpired)return bad('This shop is read-only. An active license is required to change Pharmacy data.',403);
  return permission(s,allowed,section,verb);
}
function idFilter(ids){return ids.length?listIn(ids):'in.(00000000-0000-0000-0000-000000000000)'}

async function loadPharmacyData(env,storeId){
  const [products,suppliers]=await Promise.all([
    db(env,`pharmacy_products?store_id=eq.${storeId}&select=*&order=name.asc`),
    db(env,`suppliers?store_id=eq.${storeId}&select=id,name,supplier_code`),
  ]);
  const pids=products.map(x=>x.id),itemIds=products.map(x=>x.inventory_item_id);
  const [items,units]=await Promise.all([
    itemIds.length?db(env,`inventory_items?store_id=eq.${storeId}&id=${idFilter(itemIds)}&select=id,item_code,description,unit,sale_price,total_stock,active,category`):[],
    pids.length?db(env,`pharmacy_product_units?store_id=eq.${storeId}&product_id=${idFilter(pids)}&select=*&order=factor_to_base.asc`):[],
  ]);
  const supplierMap=Object.fromEntries(suppliers.map(x=>[x.id,x])),itemMap=Object.fromEntries(items.map(x=>[x.id,x])),productMap=Object.fromEntries(products.map(x=>[x.id,x]));
  const unitMap={};for(const u of units)(unitMap[u.product_id]||(unitMap[u.product_id]=[])).push(u);
  const decoratedProducts=products.map(p=>{
    const {tracks_batch,tracks_expiry,batches,location,default_location_id,...product}=p;
    const item=itemMap[p.inventory_item_id]||{},stock=n(item.total_stock);
    return {...product,sku:item.item_code||'',barcode:p.barcode||'',inventory_item_id:p.inventory_item_id,
      description:item.description||p.description||'',average_cost_base:n(p.average_cost_base,p.purchase_price),total_stock:stock,available_stock:stock,
      units:unitMap[p.id]||[],active:p.active!==false&&item.active!==false};
  });
  return {products:decoratedProducts,suppliers,productMap:Object.fromEntries(decoratedProducts.map(x=>[x.id,x])),itemMap,supplierMap};
}

async function syncAlerts(env,storeId,context,settings,writeAllowed=true){
  if(!writeAllowed)return;
  const desired=new Map();
  for(const p of context.products){
    if(!p.active)continue;
    if(n(p.available_stock)<=n(p.reorder_threshold)){
      const key=`low-stock:${p.id}`;
      desired.set(key,{alert_key:key,severity:n(p.available_stock)<=0?'critical':'warning',title:n(p.available_stock)<=0?'Medicine out of stock':'Medicine low on stock',detail:`${p.name}${p.strength?' · '+p.strength:''}: ${r3(p.available_stock)} ${p.base_unit} on hand; reorder threshold ${n(p.reorder_threshold)}.`,href:'pharmacy-products'});
    }
  }
  const existing=await db(env,`pharmacy_alerts?store_id=eq.${storeId}&select=*`),byKey=Object.fromEntries(existing.map(x=>[x.alert_key,x]));
  for(const [key,a] of desired){
    const old=byKey[key],status=old?(old.status==='resolved'?'unread':old.status):'unread',row={store_id:storeId,...a,status,updated_at:now()};
    if(!old)await write(env,'pharmacy_alerts',row);
    else if(old.status==='resolved'||old.severity!==a.severity||old.title!==a.title||old.detail!==a.detail||old.href!==a.href){
      await write(env,`pharmacy_alerts?id=eq.${old.id}&store_id=eq.${storeId}`,{
        ...row,read_at:old.status==='resolved'?null:old.read_at,
      },'PATCH');
    }
  }
  for(const old of existing){if(!desired.has(old.alert_key)&&old.status!=='resolved')await write(env,`pharmacy_alerts?id=eq.${old.id}&store_id=eq.${storeId}`,{status:'resolved',updated_at:now()},'PATCH');}
}

async function getSettings(env,storeId){
  const [row]=await db(env,`pharmacy_settings?store_id=eq.${storeId}&select=*`);
  return row||{store_id:storeId,expiry_warning_days:90,low_stock_default:5,categories:['Prescription','OTC','Medical devices','Hygiene','Healthcare supplies']};
}

async function pharmacyInvoiceIds(env,storeId,kind){
  const ops=await db(env,`pharmacy_operations?store_id=eq.${storeId}&operation_type=eq.${kind}&select=invoice_id`);
  return [...new Set(ops.map(x=>x.invoice_id).filter(Boolean))];
}
async function partyNames(env,kind,ids){
  const table=kind==='sale'?'customers':'suppliers';
  if(!ids.length)return {};
  const rows=await db(env,`${table}?id=${idFilter(ids)}&store_id=eq.${storeId}&select=id,name`);
  return Object.fromEntries(rows.map(x=>[x.id,x.name]));
}
async function getInvoiceSummaries(env,storeId,kind){
  const ids=await pharmacyInvoiceIds(env,storeId,kind);if(!ids.length)return [];
  const invoices=await db(env,`invoices?store_id=eq.${storeId}&kind=eq.${kind}&id=${idFilter(ids)}&select=*&order=invoice_date.desc,created_at.desc`);
  const parties=await partyNames(env,kind,[...new Set(invoices.map(x=>x.party_id).filter(Boolean))]);
  const out=[];
  for(const x of invoices){
    const lines=await db(env,`invoice_lines?invoice_id=eq.${x.id}&select=id`);
    const supplierRef=(String(x.notes||'').match(/(?:^|\n)Supplier reference:\s*([^\n]+)/i)||[])[1]||null;
    out.push({...x,total:invoiceTotal(x),party_name:parties[x.party_id]||x.custom_party_name||'Walk-in',item_count:lines.length,supplier_reference:supplierRef});
  }
  return out;
}

async function getPurchaseDetail(env,storeId,invoiceId){
  const [invoice]=await db(env,`invoices?id=eq.${invoiceId}&store_id=eq.${storeId}&kind=eq.purchase&select=*`);if(!invoice)return null;
  const [operation]=await db(env,`pharmacy_operations?store_id=eq.${storeId}&invoice_id=eq.${invoiceId}&operation_type=eq.purchase&select=id`);if(!operation)return null;
  const lines=await db(env,`invoice_lines?invoice_id=eq.${invoiceId}&select=id,item_id,quantity,unit_price,line_total,tax_percent,discount`);
  const lineIds=lines.map(x=>x.id),extensions=lineIds.length?await db(env,`pharmacy_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=*`):[];
  const productIds=[...new Set(extensions.map(x=>x.product_id))],products=productIds.length?await db(env,`pharmacy_products?id=${idFilter(productIds)}&store_id=eq.${storeId}&select=id,name,generic_name,strength,dosage_form,base_unit`):[];
  const extMap=Object.fromEntries(extensions.map(x=>[x.invoice_line_id,x])),productMap=Object.fromEntries(products.map(x=>[x.id,x]));
  const [supplier]=invoice.party_id?await db(env,`suppliers?id=eq.${invoice.party_id}&store_id=eq.${storeId}&select=id,name`):[];
  const supplierReference=(String(invoice.notes||'').match(/(?:^|\n)Supplier reference:\s*([^\n]+)/i)||[])[1]||null;
  return {...invoice,total:invoiceTotal(invoice),party_name:supplier?.name||invoice.custom_party_name||'Walk-in',supplier_reference:supplierReference,items:lines.map(line=>{const ext=extMap[line.id]||{},p=productMap[ext.product_id]||{},factor=n(ext.unit_factor,1);return {...line,product_name:p.name||'Medicine',strength:p.strength||'',unit_label:ext.unit_label||p.base_unit||'unit',quantity_base:n(ext.quantity_base),free_quantity:r3(n(ext.free_quantity_base)/factor),free_quantity_base:n(ext.free_quantity_base)}})};
}

async function setProductStatus(env,storeId,product,active){
  const headers={'content-type':'application/json'};
  await db(env,`pharmacy_products?id=eq.${product.id}&store_id=eq.${storeId}`,{method:'PATCH',headers,body:JSON.stringify({active})});
  if(product.inventory_item_id)await db(env,`inventory_items?id=eq.${product.inventory_item_id}&store_id=eq.${storeId}`,{method:'PATCH',headers,body:JSON.stringify({active})});
}
async function saveProduct(env,storeId,body,productId,actor){
  const name=text(body.name,180),base=text(body.base_unit||'tablet',40).toLowerCase();
  if(!name||!base)return {error:bad('Medicine name and base stock unit are required.',400)};
  const values=['sale_price','purchase_price','reorder_threshold'].map(k=>Number(body[k]??(k==='reorder_threshold'?5:0)));
  if(values.some(x=>!Number.isFinite(x)||x<0))return {error:bad('Prices and reorder threshold must be non-negative numbers.',400)};
  if(!Array.isArray(body.units)||!body.units.length||body.units.length>50)return {error:bad('Add at least one purchase or sale unit.',400)};
  const units=body.units.map(u=>({unit_label:text(u.unit_label,60).toLowerCase(),factor_to_base:Number(u.factor_to_base),allow_fractional:!!u.allow_fractional,can_purchase:!!u.can_purchase,can_sell:!!u.can_sell,purchase_price:u.purchase_price===''?null:u.purchase_price,selling_price:u.selling_price===''?null:u.selling_price})).filter(u=>u.unit_label);
  if(!units.some(u=>u.unit_label===base&&Number(u.factor_to_base)===1))return {error:bad('The base stock unit must have a conversion factor of exactly 1.',400)};
  if(new Set(units.map(x=>x.unit_label)).size!==units.length)return {error:bad('Unit labels must be unique.',400)};
  if(!units.some(x=>x.can_sell)||!units.some(x=>x.can_purchase))return {error:bad('Enable at least one purchase unit and one sale unit.',400)};
  if(units.some(u=>!Number.isFinite(u.factor_to_base)||u.factor_to_base<=0||u.factor_to_base>1e9))return {error:bad('Every pack conversion must be greater than zero.',400)};
  const sku=text(body.sku,80).toUpperCase();if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sku))return {error:bad('SKU may contain letters, numbers, dot, dash, or underscore.',400)};
  if(body.supplier_id){if(!uuid.test(String(body.supplier_id)))return {error:bad('Supplier ID is invalid.',400)};const [supplier]=await db(env,`suppliers?id=eq.${body.supplier_id}&store_id=eq.${storeId}&select=id`);if(!supplier)return {error:bad('Supplier must belong to this shop.',400)}}
  const productInput={...body};delete productInput.tracks_batch;delete productInput.tracks_expiry;
  const wholesale=Number(body.wholesale_price??0),packSize=text(body.pack_size,120),manufacturer=text(body.manufacturer,160),shelfId=body.default_location_id||null;
  if(!Number.isFinite(wholesale)||wholesale<0)return {error:bad('Wholesale price must be a non-negative amount.',400)};
  if(String(body.pack_size||'').trim().length>120)return {error:bad('Pack size must be 120 characters or fewer.',400)};
  if(String(body.manufacturer||'').trim().length>160)return {error:bad('Manufacturer name is too long.',400)};
  if(manufacturer){const makers=await db(env,`pharmacy_manufacturers?store_id=eq.${storeId}&select=name`);const match=makers.find(x=>x.name.toLowerCase()===manufacturer.toLowerCase());if(!match)return {error:bad('Choose a manufacturer from this shop’s Manufacturer list.',400)};productInput.manufacturer=match.name;}
  if(shelfId){if(!uuid.test(String(shelfId)))return {error:bad('Rack / Shelf is invalid.',400)};const [shelf]=await db(env,`pharmacy_shelves?id=eq.${shelfId}&store_id=eq.${storeId}&active=is.true&select=id`);if(!shelf)return {error:bad('Choose an active Rack / Shelf in this shop.',400)}}
  productInput.wholesale_price=wholesale;productInput.pack_size=packSize||null;productInput.default_location_id=shelfId;
  try{
    const result=await db(env,'rpc/pharmacy_save_product',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_store_id:storeId,p_product_id:productId||null,p_product:{...productInput,name,base_unit:base,sku,purchase_price:values[1],sale_price:values[0],reorder_threshold:values[2],tracks_batch:false,tracks_expiry:false},p_units:units,p_actor:actor||null})});
    return {result};
  }catch(e){return {error:bad(e.message||'Medicine could not be saved.',/already exists|unique|barcode|SKU/i.test(e.message||'')?409:400)}}
}
function operationKey(value){const k=text(value,120);return /^[A-Za-z0-9:_-]{8,120}$/.test(k)?k:null}
async function postPharmacyInvoice(env,s,store,body,kind,allowed,audit,autoSms){
  const storeId=store.id,deny=writeGuard(s,store,allowed,kind==='sale'?'sales':'purchase','add');if(deny)return deny;
  if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100)return bad('Add between 1 and 100 pharmacy invoice lines.',400);
  const key=operationKey(body.idempotencyKey);if(!key)return bad('A valid retry-safe operation key is required.',400);
  const pDate=isDate(body.invoiceDate)?body.invoiceDate:dateToday();
  const method=String(body.paymentMethod||'cash').toLowerCase();if(!['cash','bank','bkash','nagad','other'].includes(method))return bad('Select a valid payment method.',400);
  const partyId=body.partyId||body.supplierId||null;if(partyId&&!uuid.test(String(partyId)))return bad('Customer or supplier ID is invalid.',400);
  const lines=[];
  for(const raw of body.lines){
    if(!uuid.test(String(raw.productId||'')))return bad('Every line must contain a valid Pharmacy product.',400);
    const q=Number(raw.quantity),price=Number(raw.unitPrice),tax=Number(raw.taxPercent||0),discount=Number(raw.discount||0);
    if(!(q>0)||!Number.isFinite(q)||price<0||!Number.isFinite(price)||tax<0||!Number.isFinite(tax)||discount<0||!Number.isFinite(discount))return bad('Line quantity, price, tax, or discount is invalid.',400);
    const line={productId:String(raw.productId),unitLabel:text(raw.unitLabel,60).toLowerCase(),quantity:q,unitPrice:price,taxPercent:tax,discount};
    if(kind==='purchase'){
      line.freeQuantity=Number(raw.freeQuantity||0);line.salePrice=Number(raw.salePrice||0);
      if(line.freeQuantity<0||!Number.isFinite(line.freeQuantity)||line.salePrice<0||!Number.isFinite(line.salePrice))return bad('Bonus quantity and MRP must be valid non-negative numbers.',400);
    }
    lines.push(line);
  }
  const taxPercent=Number(body.taxPercent||0),discount=Number(body.discount||0),paidAmount=Number(body.paidAmount||0);
  if([taxPercent,discount,paidAmount].some(v=>!Number.isFinite(v)||v<0))return bad('Invoice tax, discount, or paid amount is invalid.',400);
  if(kind==='sale'&&partyId){const [customer]=await db(env,`customers?id=eq.${partyId}&store_id=eq.${storeId}&select=id`);if(!customer)return bad('Customer must belong to this shop.',400)}
  if(kind==='purchase'&&partyId){const [supplier]=await db(env,`suppliers?id=eq.${partyId}&store_id=eq.${storeId}&select=id`);if(!supplier)return bad('Supplier must belong to this shop.',400)}
  const [prior]=await db(env,`pharmacy_operations?store_id=eq.${storeId}&operation_key=eq.${encodeURIComponent(key)}&select=invoice_id,operation_type`);
  if(prior?.invoice_id){if(prior.operation_type!==kind)return bad('This operation key is already used for another Pharmacy workflow.',409);const [existing]=await db(env,`invoices?id=eq.${prior.invoice_id}&store_id=eq.${storeId}&select=*`);if(existing)return ok({...existing,total:invoiceTotal(existing),idempotent:true})}
  const reference=text(body.supplierReference,160),notes=text(body.notes,2000);
  const allNotes=kind==='purchase'?(reference?`Supplier reference: ${reference}${notes?`\n${notes}`:''}`:notes||null):notes||null;
  let lastError=null;
  for(let attempt=0;attempt<4;attempt++){
    let invoiceNumber;
    try{invoiceNumber=await db(env,'rpc/next_ems_invoice_number',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_kind:kind})})}
    catch(e){return bad(e.message||'Invoice number could not be reserved.',500)}
    try{
      const invoice=await db(env,'rpc/pharmacy_post_invoice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        p_store_id:storeId,p_kind:kind,p_invoice_number:invoiceNumber,p_party_id:partyId,p_invoice_date:pDate,p_payment_method:method,
        p_transaction_id:text(body.transactionId,160)||null,p_notes:allNotes,p_tax_percent:taxPercent,p_discount:discount,p_paid_amount:paidAmount,
        p_created_by:s.id||null,p_lines:lines,p_operation_key:key,p_allow_price_override:allowed(s,'inventory','edit'),
      })});
      await audit?.(env,s,`post pharmacy ${kind}`,kind==='sale'?'sale invoice':'purchase invoice',invoice.id,{storeId,invoice_number:invoice.invoice_number,kind,total:invoiceTotal(invoice),paid:invoice.paid_amount,due:invoice.total_due,payment_method:method});
      if(kind==='sale'&&autoSms){try{await autoSms(env,s,'SALE',invoice,{phone:null,name:null,partyId,invoiceNumber:invoice.invoice_number,invoiceId:invoice.id,idempotencyKey:'SALE:'+invoice.id})}catch(e){console.error('Pharmacy ConnectX SMS queue',e)}}
      return ok({...invoice,total:invoiceTotal(invoice)},201);
    }catch(e){lastError=e.message||'Pharmacy invoice could not be posted';if(/duplicate|already exists|UNIQUE/i.test(lastError))continue;break;}
  }
  return bad(lastError||'Pharmacy invoice could not be posted.',/insufficient|expired|blocked|quarantined|recall|stock changed/i.test(lastError||'')?409:400);
}

async function getOverview(env,storeId,context,adminId){
  const today=dateToday(),since=new Date(Date.now()-86400000).toISOString();
  const [saleIds,purchaseIds,logs,staff]=await Promise.all([
    pharmacyInvoiceIds(env,storeId,'sale'),pharmacyInvoiceIds(env,storeId,'purchase'),
    db(env,`activity_logs?store_id=eq.${storeId}&created_at=gte.${since}&select=id,action,entity_type,actor_type,actor_id,created_at&order=created_at.desc&limit=12`).catch(()=>[]),
    db(env,`staff?store_id=eq.${storeId}&select=id,full_name`).catch(()=>[]),
  ]);
  // Only Pharmacy transactions belong in these totals. Chunk IDs to avoid
  // oversized query URLs, and do not limit the ledger before aggregating.
  const ids=[...new Set([...saleIds,...purchaseIds])],chunks=[];
  for(let i=0;i<ids.length;i+=60)chunks.push(ids.slice(i,i+60));
  const invoices=(await Promise.all(chunks.map(part=>db(env,`invoices?store_id=eq.${storeId}&id=${idFilter(part)}&select=id,kind,invoice_number,invoice_date,created_at,party_id,custom_party_name,subtotal,line_tax_amount,tax_amount,discount,line_discount_amount,paid_amount,total_due`)))).flat()
    .sort((a,b)=>new Date(b.created_at||b.invoice_date)-new Date(a.created_at||a.invoice_date));
  const recent=invoices.slice(0,8),partyIds=[...new Set(recent.map(x=>x.party_id).filter(Boolean))];
  const [customers,suppliers]=await Promise.all([
    partyIds.length?db(env,`customers?id=${idFilter(partyIds)}&store_id=eq.${storeId}&select=id,name`):[],
    partyIds.length?db(env,`suppliers?id=${idFilter(partyIds)}&store_id=eq.${storeId}&select=id,name`):[],
  ]);
  const names=Object.fromEntries([...customers,...suppliers].map(x=>[x.id,x.name]));
  const sum=(rows,field)=>r2(rows.reduce((total,x)=>total+n(field==='total'?invoiceTotal(x):x[field]),0));
  const sales=invoices.filter(x=>x.kind==='sale'),purchases=invoices.filter(x=>x.kind==='purchase');
  const todaySales=sales.filter(x=>x.invoice_date===today),todayPurchases=purchases.filter(x=>x.invoice_date===today);
  const low=context.products.filter(p=>p.active&&n(p.available_stock)<=n(p.reorder_threshold));
  const days=Array.from({length:7},(_,i)=>new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10));
  const weekly=days.map(date=>({date,sales:sum(sales.filter(x=>x.invoice_date===date),'total'),purchases:sum(purchases.filter(x=>x.invoice_date===date),'total')}));
  const staffNames=Object.fromEntries(staff.map(x=>[x.id,x.full_name]));
  return {
    metrics:{sales:sum(sales,'total'),salesToday:sum(todaySales,'total'),purchases:sum(purchases,'total'),purchasesToday:sum(todayPurchases,'total'),
      customerDue:sum(sales,'total_due'),supplierDue:sum(purchases,'total_due'),customerDueToday:sum(todaySales,'total_due'),supplierDueToday:sum(todayPurchases,'total_due'),
      stockValue:r2(context.products.filter(p=>p.active).reduce((total,p)=>total+n(p.available_stock)*n(p.average_cost_base),0)),
      medicines:context.products.filter(p=>p.active).length,lowStock:low.length,outOfStock:low.filter(p=>n(p.available_stock)<=0).length},
    weekly,recent:recent.map(x=>({id:x.id,kind:x.kind,invoice_number:x.invoice_number,invoice_date:x.invoice_date,created_at:x.created_at,total:invoiceTotal(x),paid_amount:n(x.paid_amount),total_due:n(x.total_due),party_name:names[x.party_id]||x.custom_party_name||'Walk-in'})),
    activity:logs.map(x=>({id:x.id,action:x.action,entity_type:x.entity_type,created_at:x.created_at,
      actor_name:x.actor_type==='admin'||x.actor_id===adminId?'Administrator':x.actor_type==='staff'?(staffNames[x.actor_id]||'Staff member'):'System'})),
  };
}

async function getReports(env,storeId,from,to,context){
  const saleIds=await pharmacyInvoiceIds(env,storeId,'sale'),purchaseIds=await pharmacyInvoiceIds(env,storeId,'purchase');
  const allIds=[...new Set([...saleIds,...purchaseIds])];
  const invoices=allIds.length?await db(env,`invoices?store_id=eq.${storeId}&id=${idFilter(allIds)}&invoice_date=gte.${from}&invoice_date=lte.${to}&select=*&order=invoice_date.desc`):[];
  const sales=invoices.filter(x=>x.kind==='sale'),purchases=invoices.filter(x=>x.kind==='purchase');
  const saleInvIds=sales.map(x=>x.id);
  const invoiceLines=saleInvIds.length?await db(env,`invoice_lines?invoice_id=${idFilter(saleInvIds)}&select=id,invoice_id,item_id,quantity,unit_price,line_total,cost_price`):[];
  const lineIds=invoiceLines.map(x=>x.id),phLines=lineIds.length?await db(env,`pharmacy_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=*`):[];
  const ext=Object.fromEntries(phLines.map(x=>[x.invoice_line_id,x])),grouped={};
  for(const line of invoiceLines){const p=context.productMap[ext[line.id]?.product_id];if(!p)continue;const g=grouped[p.id]||(grouped[p.id]={...p,units_sold:0,sales_value:0,cogs:0,gross_profit:0,last_movement:null});g.units_sold+=n(ext[line.id]?.quantity_base);g.sales_value+=n(line.line_total);g.cogs+=n(line.cost_price)*n(line.quantity);}
  for(const p of Object.values(grouped)){p.sales_value=r2(p.sales_value);p.cogs=r2(p.cogs);p.gross_profit=r2(p.sales_value-p.cogs);p.units_sold=r3(p.units_sold)}
  const saleTotal=sales.reduce((sum,x)=>sum+invoiceTotal(x),0),purchaseTotal=purchases.reduce((sum,x)=>sum+invoiceTotal(x),0);
  const returnRows=await db(env,`pharmacy_returns?store_id=eq.${storeId}&return_date=gte.${from}&return_date=lte.${to}&select=amount`);
  const risks=context.products.filter(p=>p.active&&n(p.total_stock)<=n(p.reorder_threshold)).map(p=>({kind:n(p.total_stock)<=0?'out of stock':'low stock',product_name:p.name,quantity:p.total_stock,unit:p.base_unit}));
  return {sales_total:r2(saleTotal),gross_profit:r2(Object.values(grouped).reduce((sum,x)=>sum+n(x.gross_profit),0)),purchase_total:r2(purchaseTotal),return_total:r2(returnRows.reduce((sum,x)=>sum+n(x.amount),0)),products:Object.values(grouped).sort((a,b)=>b.sales_value-a.sales_value),risks};
}

async function lookupReturn(env,storeId,invoiceNumber){
  const [invoice]=await db(env,`invoices?store_id=eq.${storeId}&invoice_number=eq.${encodeURIComponent(invoiceNumber)}&kind=eq.sale&select=*`);
  if(!invoice)return {error:bad('Pharmacy sales invoice was not found in this shop.',404)};
  const [operation]=await db(env,`pharmacy_operations?store_id=eq.${storeId}&invoice_id=eq.${invoice.id}&operation_type=eq.sale&select=id`);
  if(!operation)return {error:bad('This invoice is not a Pharmacy sale.',409)};
  const lines=await db(env,`invoice_lines?invoice_id=eq.${invoice.id}&select=id,quantity,line_total`);
  const header=lookupHeader(invoice);
  if(!lines.length)return {data:{...header,invoice_id:invoice.id,invoice_number:invoice.invoice_number,customer_name:'Walk-in customer',customer:null,lines:[]}};
  const lineIds=lines.map(x=>x.id);
  const [extensions,returns]=await Promise.all([
    db(env,`pharmacy_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=*`),
    db(env,`pharmacy_return_items?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=invoice_line_id,quantity_base`),
  ]);
  const extensionMap=Object.fromEntries(extensions.map(x=>[x.invoice_line_id,x])),returned={};
  for(const r of returns)returned[r.invoice_line_id]=(returned[r.invoice_line_id]||0)+n(r.quantity_base);
  const productIds=[...new Set(extensions.map(x=>x.product_id))],products=productIds.length?await db(env,`pharmacy_products?id=${idFilter(productIds)}&store_id=eq.${storeId}&select=*`):[];
  const productMap=Object.fromEntries(products.map(x=>[x.id,x]));let customerName='Walk-in customer',customer=null;
  if(invoice.party_id){const [c]=await db(env,`customers?id=eq.${invoice.party_id}&store_id=eq.${storeId}&select=id,name,phone,address,customer_code`);if(c){customer=c;customerName=c.name}}
  if(!customer&&invoice.custom_party_name)customerName=invoice.custom_party_name;
  const result=[];
  for(const line of lines){
    const ext=extensionMap[line.id],product=productMap[ext?.product_id];if(!ext||!product)continue;
    const already=returned[line.id]||0,remainingBase=Math.max(0,r3(n(ext.quantity_base)-already));if(remainingBase<=0)continue;
    const factor=n(ext.unit_factor,1);
    const soldQty=r3(n(ext.quantity_base)/factor),soldBase=n(ext.quantity_base),lineTotal=r2(line.line_total);
    result.push({invoice_line_id:line.id,product_id:product.id,product_name:product.name,generic_name:product.generic_name,strength:product.strength,
      base_unit:product.base_unit||'base units',unit_label:ext.unit_label,unit_factor:factor,sold_quantity:soldQty,sold_base:soldBase,line_total:lineTotal,
      unit_price:soldQty>0?r2(lineTotal/soldQty):0,tax_percent:0,discount:0,
      already_returned_quantity:r3(Math.max(0,soldQty-r3(remainingBase/factor))),is_fully_returned:false,
      returnable_quantity:r3(remainingBase/factor),returnable_base:remainingBase});
  }
  return {data:{...header,invoice_id:invoice.id,invoice_number:invoice.invoice_number,customer_name:customerName,customer,lines:result}};
}
function lookupHeader(inv){return {invoice_date:inv.invoice_date||String(inv.created_at||'').slice(0,10),subtotal:r2(inv.subtotal),tax_amount:r2(inv.tax_amount),discount:r2(inv.discount),paid_amount:r2(inv.paid_amount),total_due:r2(inv.total_due)}}

async function buildReturnItems(env,storeId,raw){
  if(!Array.isArray(raw)||!raw.length||raw.length>100)return {error:bad('Add 1 to 100 returned Pharmacy lines.',400)};
  const parsed=[];
  for(const item of raw){
    const lineId=String(item?.invoice_line_id||''),quantity=n(item?.quantity);
    const cond=String(item?.condition||'sellable').trim().toLowerCase();
    const condition=cond==='sellable'||cond==='good'?'good':cond;
    if(!uuid.test(lineId)||!(quantity>0))return {error:bad('Every return line needs a sold invoice line and a positive quantity.',400)};
    if(!['good','damaged','defective'].includes(condition))return {error:bad('Condition must be Sellable, Damaged or Defective.',400)};
    const penalty=Math.max(0,n(item?.penalty));
    if(!Number.isFinite(penalty))return {error:bad('Penalty must be a valid amount.',400)};
    const reason=text(item?.reason,80),reasonNote=text(item?.reason_note,400)||null;
    parsed.push({lineId,quantity,condition,penalty:r2(penalty),reason:reason||null,reasonNote});
  }
  const lineIds=[...new Set(parsed.map(x=>x.lineId))];
  const extensions=await db(env,`pharmacy_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=invoice_line_id,unit_factor`);
  const factor=Object.fromEntries(extensions.map(x=>[x.invoice_line_id,n(x.unit_factor,1)]));
  const rows=[];
  for(const p of parsed){
    if(!factor[p.lineId])return {error:bad('Return line is not linked to Pharmacy sale stock.',400)};
    rows.push({invoice_line_id:p.lineId,quantity_base:r3(p.quantity*factor[p.lineId]),condition:p.condition,reason:p.reason,reason_note:p.reasonNote,penalty:p.penalty});
  }
  return {rows};
}
async function listReturnRecords(env,storeId,type){
  const filter=type?`&return_type=eq.${type}`:'';
  const rows=await db(env,`pharmacy_returns?store_id=eq.${storeId}${filter}&select=*&order=created_at.desc`);
  if(!rows.length)return [];
  const ids=rows.map(x=>x.id),invoiceIds=[...new Set(rows.map(x=>x.invoice_id))];
  const [invoices,items,newItems]=await Promise.all([
    db(env,`invoices?id=${idFilter(invoiceIds)}&store_id=eq.${storeId}&select=id,invoice_number,party_id,custom_party_name`),
    db(env,`pharmacy_return_items?store_id=eq.${storeId}&return_id=${idFilter(ids)}&select=id,return_id,invoice_line_id,product_id,quantity_base,condition,reason,reason_note,penalty,amount,restocked,created_at`),
    db(env,`pharmacy_exchange_items?store_id=eq.${storeId}&exchange_id=${idFilter(ids)}&select=*`),
  ]);
  const im=Object.fromEntries(invoices.map(x=>[x.id,x]));
  const productIds=[...new Set([...items,...newItems].map(x=>x.product_id))];
  const products=productIds.length?await db(env,`pharmacy_products?id=${idFilter(productIds)}&store_id=eq.${storeId}&select=id,name,strength,base_unit`):[];
  const pm=Object.fromEntries(products.map(x=>[x.id,{id:x.id,name:x.name,strength:x.strength,base_unit:x.base_unit}]));
  const group={},ngroup={};
  for(const x of items)(group[x.return_id]||(group[x.return_id]=[])).push({...x,product:pm[x.product_id]||null});
  for(const x of newItems)(ngroup[x.exchange_id]||(ngroup[x.exchange_id]=[])).push({...x,product:pm[x.product_id]||null});
  return rows.map(r=>{
    const retItems=group[r.id]||[],nItems=ngroup[r.id]||[];
    return {...r,invoice_number:im[r.invoice_id]?.invoice_number||'—',items:retItems,new_items:nItems,
      item_summary:retItems.map(x=>`${x.product?.name||'Medicine'} ${x.quantity_base} ${x.product?.base_unit||'base units'}`).join(', ')};
  });
}
async function listQuarantine(env,storeId){
  const items=await db(env,`pharmacy_return_items?store_id=eq.${storeId}&restocked=eq.false&condition=in.(damaged,defective,expired,quarantined)&select=id,return_id,product_id,quantity_base,condition,reason,reason_note,created_at&order=created_at.desc`);
  if(!items.length)return [];
  const returnIds=[...new Set(items.map(x=>x.return_id))];
  const returns=await db(env,`pharmacy_returns?id=${idFilter(returnIds)}&store_id=eq.${storeId}&select=id,return_number,invoice_id,customer_name,return_date,return_type`);
  const rm=Object.fromEntries(returns.map(x=>[x.id,x]));
  const invoiceIds=[...new Set(returns.map(x=>x.invoice_id))];
  const invoices=invoiceIds.length?await db(env,`invoices?id=${idFilter(invoiceIds)}&store_id=eq.${storeId}&select=id,invoice_number`):[];
  const im=Object.fromEntries(invoices.map(x=>[x.id,x]));
  const productIds=[...new Set(items.map(x=>x.product_id))];
  const products=await db(env,`pharmacy_products?id=${idFilter(productIds)}&store_id=eq.${storeId}&select=id,name,strength,base_unit`);
  const pm=Object.fromEntries(products.map(x=>[x.id,x]));
  return items.map(x=>{const r=rm[x.return_id]||{},p=pm[x.product_id]||{};return {
    id:x.id,return_id:x.return_id,return_number:r.return_number||'—',return_type:r.return_type||'return',
    invoice_number:im[r.invoice_id]?.invoice_number||'—',customer_name:r.customer_name||'Walk-in customer',
    return_date:r.return_date||String(x.created_at||'').slice(0,10),condition:x.condition,quantity_base:x.quantity_base,
    product_name:p.name||'Medicine',strength:p.strength||null,base_unit:p.base_unit||'base units',reason:x.reason,reason_note:x.reason_note||null}});
}

export async function pharmacyApi({env,s,path,method,request,allowed,audit,autoSms}){
  if(!path.startsWith('pharmacy/'))return null;
  const context=await shopContext(env,s);if(context.error)return context.error;
  const {store,storeId}=context;
  const systemWriteAllowed=store.status!=='read_only'&&!s.readOnly&&!s.licenseExpired;
  const query=new URL(request.url).searchParams;
  if(path==='pharmacy/overview'&&method==='GET'){
    const denied=permission(s,allowed,'dashboard','view');if(denied)return denied;
    const [data,settings]=await Promise.all([loadPharmacyData(env,storeId),getSettings(env,storeId)]);
    await syncAlerts(env,storeId,data,settings,systemWriteAllowed);
    return ok(await getOverview(env,storeId,data,store.admin_id));
  }
  if(path==='pharmacy/products'&&method==='GET'){
    const denied=permission(s,allowed,'inventory','view');if(denied)return denied;
    const data=await loadPharmacyData(env,storeId);
    const [settings]=await Promise.all([getSettings(env,storeId)]);await syncAlerts(env,storeId,data,settings,systemWriteAllowed);
    return ok(data.products);
  }
  if(path==='pharmacy/products'&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'inventory','add');if(denied)return denied;
    const body=await jsonBody(request),saved=await saveProduct(env,storeId,body,null,s.id);if(saved.error)return saved.error;
    await audit?.(env,s,'create pharmacy product','pharmacy product',saved.result.id,{storeId,sku:saved.result.sku,name:text(body.name,180)});
    const data=await loadPharmacyData(env,storeId);return ok(data.products.find(x=>x.id===saved.result.id)||saved.result,201);
  }
  const productMatch=path.match(/^pharmacy\/products\/([^/]+)$/);
  if(productMatch&&method==='PATCH'){
    const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;
    const id=decodeURIComponent(productMatch[1]);if(!uuid.test(id))return bad('Medicine ID is invalid.',400);
    const [before]=await db(env,`pharmacy_products?id=eq.${id}&store_id=eq.${storeId}&select=id,name,active,inventory_item_id`);
    if(!before)return bad('Medicine was not found in this shop.',404);
    const body=await jsonBody(request),saved=await saveProduct(env,storeId,body,id,s.id);if(saved.error)return saved.error;
    if(before.active===false)await setProductStatus(env,storeId,before,false);
    await audit?.(env,s,'update pharmacy product','pharmacy product',id,{storeId,sku:saved.result.sku,name:text(body.name,180)});
    const data=await loadPharmacyData(env,storeId);return ok(data.products.find(x=>x.id===id)||saved.result);
  }
  if(productMatch&&method==='DELETE'){
    const denied=writeGuard(s,store,allowed,'inventory','delete');if(denied)return denied;
    const id=decodeURIComponent(productMatch[1]);if(!uuid.test(id))return bad('Medicine ID is invalid.',400);
    const [before]=await db(env,`pharmacy_products?id=eq.${id}&store_id=eq.${storeId}&select=id,name,inventory_item_id`);
    if(!before)return bad('Medicine was not found in this shop.',404);
    try{
      const deleted=await db(env,'rpc/pharmacy_delete_product',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_store_id:storeId,p_product_id:id})});
      await audit?.(env,s,'delete pharmacy product','pharmacy product',id,{storeId,sku:deleted?.sku||null,name:deleted?.name||before.name});
      return ok({ok:true,id,name:deleted?.name||before.name});
    }catch(e){const message=e.message||'Medicine could not be deleted.';return bad(message,/stock|history|referenced|foreign key|constraint/i.test(message)?409:400)}
  }
  const productStatus=path.match(/^pharmacy\/products\/([^/]+)\/status$/);
  if(productStatus&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;
    const id=decodeURIComponent(productStatus[1]);if(!uuid.test(id))return bad('Medicine ID is invalid.',400);
    const body=await jsonBody(request);if(typeof body.active!=='boolean')return bad('Status must be active or inactive.',400);
    const [product]=await db(env,`pharmacy_products?id=eq.${id}&store_id=eq.${storeId}&select=id,name,active,inventory_item_id`);
    if(!product)return bad('Medicine was not found in this shop.',404);
    await setProductStatus(env,storeId,product,body.active);
    await audit?.(env,s,body.active?'activate pharmacy product':'deactivate pharmacy product','pharmacy product',id,{storeId,name:product.name});
    const data=await loadPharmacyData(env,storeId);return ok(data.products.find(x=>x.id===id));
  }
  if(path==='pharmacy/manufacturers'&&method==='GET'){
    if(!allowed(s,'supplier','view')&&!allowed(s,'inventory','view'))return bad('Permission denied.',403);
    return ok(await db(env,`pharmacy_manufacturers?store_id=eq.${storeId}&select=*&order=name.asc`));
  }
  if(path==='pharmacy/manufacturers'&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'supplier','add');if(denied)return denied;
    const name=text((await jsonBody(request)).name,160);if(!name)return bad('Enter a manufacturer name.',400);
    const existing=await db(env,`pharmacy_manufacturers?store_id=eq.${storeId}&select=id,name`);
    if(existing.some(x=>x.name.toLowerCase()===name.toLowerCase()))return bad('This manufacturer already exists.',409);
    try{const [saved]=await db(env,'pharmacy_manufacturers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:storeId,name,created_by:s.id})});await audit?.(env,s,'create pharmacy manufacturer','pharmacy manufacturer',saved.id,{storeId,name});return ok(saved,201)}catch(e){return bad(e.message||'Could not add manufacturer.',409)}
  }
  const makerMatch=path.match(/^pharmacy\/manufacturers\/([^/]+)$/);
  if(makerMatch&&['PATCH','DELETE'].includes(method)){
    const denied=writeGuard(s,store,allowed,'supplier',method==='PATCH'?'edit':'delete');if(denied)return denied;
    const id=decodeURIComponent(makerMatch[1]);if(!uuid.test(id))return bad('Manufacturer ID is invalid.',400);
    const [maker]=await db(env,`pharmacy_manufacturers?id=eq.${id}&store_id=eq.${storeId}&select=*`);if(!maker)return bad('Manufacturer not found.',404);
    const products=await db(env,`pharmacy_products?store_id=eq.${storeId}&select=id,manufacturer`);
    const used=products.filter(p=>String(p.manufacturer||'').toLowerCase()===maker.name.toLowerCase());
    if(method==='DELETE'){
      if(used.length)return bad('This manufacturer is assigned to medicines. Reassign those medicines before deleting it.',409);
      await db(env,`pharmacy_manufacturers?id=eq.${id}&store_id=eq.${storeId}`,{method:'DELETE'});
      await audit?.(env,s,'delete pharmacy manufacturer','pharmacy manufacturer',id,{storeId,name:maker.name});return ok({ok:true});
    }
    const name=text((await jsonBody(request)).name,160);if(!name)return bad('Enter a manufacturer name.',400);
    const makers=await db(env,`pharmacy_manufacturers?store_id=eq.${storeId}&select=id,name`);
    if(makers.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase()))return bad('This manufacturer already exists.',409);
    // Updating the name also updates the text snapshot on existing medicines.
    try{const [saved]=await db(env,`pharmacy_manufacturers?id=eq.${id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name,updated_at:now()})});
      for(const product of used)await db(env,`pharmacy_products?id=eq.${product.id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({manufacturer:name})});
      await audit?.(env,s,'update pharmacy manufacturer','pharmacy manufacturer',id,{storeId,name,previousName:maker.name});return ok(saved);
    }catch(e){return bad(e.message||'Could not update manufacturer.',409)}
  }
  if(path==='pharmacy/shelves'&&method==='GET'){
    if(!allowed(s,'settings','view')&&!allowed(s,'inventory','view'))return bad('Permission denied.',403);
    return ok(await db(env,`pharmacy_shelves?store_id=eq.${storeId}&select=id,label,notes,active&order=label.asc`));
  }
  if(path==='pharmacy/shelves'&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'settings','edit');if(denied)return denied;
    const input=await jsonBody(request),label=text(input.label,100),notes=text(input.notes,500)||null;
    if(!label)return bad('Enter a Rack / Shelf label.',400);
    const shelves=await db(env,`pharmacy_shelves?store_id=eq.${storeId}&select=id,label`);
    if(shelves.some(x=>x.label.toLowerCase()===label.toLowerCase()))return bad('This Rack / Shelf already exists.',409);
    try{const [saved]=await db(env,'pharmacy_shelves',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:storeId,label,notes,active:true,created_by:s.id})});await audit?.(env,s,'create pharmacy shelf','pharmacy shelf',saved.id,{storeId,label});return ok(saved,201)}catch(e){return bad(e.message||'Could not add Rack / Shelf.',409)}
  }
  const shelfMatch=path.match(/^pharmacy\/shelves\/([^/]+)$/);
  if(shelfMatch&&['PATCH','DELETE'].includes(method)){
    const denied=writeGuard(s,store,allowed,'settings','edit');if(denied)return denied;
    const id=decodeURIComponent(shelfMatch[1]);if(!uuid.test(id))return bad('Rack / Shelf ID is invalid.',400);
    const [shelf]=await db(env,`pharmacy_shelves?id=eq.${id}&store_id=eq.${storeId}&select=id,label,notes`);if(!shelf)return bad('Rack / Shelf not found.',404);
    if(method==='DELETE'){
      const [used]=await db(env,`pharmacy_products?store_id=eq.${storeId}&default_location_id=eq.${id}&select=id&limit=1`);
      if(used)return bad('This Rack / Shelf is assigned to a medicine. Change that medicine’s shelf before deleting it.',409);
      try{await db(env,`pharmacy_shelves?id=eq.${id}&store_id=eq.${storeId}`,{method:'DELETE'});await audit?.(env,s,'delete pharmacy shelf','pharmacy shelf',id,{storeId,label:shelf.label});return ok({ok:true})}catch(e){return bad('This Rack / Shelf has historical stock references and cannot be deleted.',409)}
    }
    const input=await jsonBody(request),label=text(input.label,100),notes=text(input.notes,500)||null;
    if(!label)return bad('Enter a Rack / Shelf label.',400);
    const shelves=await db(env,`pharmacy_shelves?store_id=eq.${storeId}&select=id,label`);
    if(shelves.some(x=>x.id!==id&&x.label.toLowerCase()===label.toLowerCase()))return bad('This Rack / Shelf already exists.',409);
    try{const [saved]=await db(env,`pharmacy_shelves?id=eq.${id}&store_id=eq.${storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({label,notes,updated_at:now()})});await audit?.(env,s,'update pharmacy shelf','pharmacy shelf',id,{storeId,label});return ok(saved)}catch(e){return bad(e.message||'Could not update Rack / Shelf.',409)}
  }
  if(path==='pharmacy/batches'||path.startsWith('pharmacy/batches/')){
    const denied=method==='GET'?permission(s,allowed,'inventory','view'):writeGuard(s,store,allowed,'inventory','edit');if(denied)return denied;
    return bad('Batch and expiry workflows have been retired. Pharmacy stock is managed as one aggregate quantity per medicine.',410);
  }
  if(path==='pharmacy/movements'&&method==='GET'){
    const denied=permission(s,allowed,'inventory','view');if(denied)return denied;
    const rows=await db(env,`pharmacy_stock_movements?store_id=eq.${storeId}&select=*&order=created_at.desc&limit=250`);if(!rows.length)return ok([]);
    const productIds=[...new Set(rows.map(x=>x.product_id).filter(Boolean))],invoiceIds=[...new Set(rows.filter(x=>x.reference_type==='invoice').map(x=>x.reference_id).filter(Boolean))],returnIds=[...new Set(rows.filter(x=>x.reference_type==='pharmacy_return').map(x=>x.reference_id).filter(Boolean))];
    const [products,invoices,returns]=await Promise.all([
      productIds.length?db(env,`pharmacy_products?id=${idFilter(productIds)}&store_id=eq.${storeId}&select=id,name,strength,base_unit`):[],
      invoiceIds.length?db(env,`invoices?id=${idFilter(invoiceIds)}&store_id=eq.${storeId}&select=id,invoice_number,kind`):[],
      returnIds.length?db(env,`pharmacy_returns?id=${idFilter(returnIds)}&store_id=eq.${storeId}&select=id,return_number`):[],
    ]);
    const productMap=Object.fromEntries(products.map(x=>[x.id,x])),invoiceMap=Object.fromEntries(invoices.map(x=>[x.id,x])),returnMap=Object.fromEntries(returns.map(x=>[x.id,x]));
    return ok(rows.map(x=>{
      const {batch_id,from_location_id,to_location_id,...movement}=x;
      const legacyBatchRef=x.reference_type==='batch';
      const product=productMap[x.product_id],invoice=invoiceMap[x.reference_id],returnRow=returnMap[x.reference_id];
      return {...movement,reference_type:legacyBatchRef?'legacy_stock_event':x.reference_type,reference_id:legacyBatchRef?null:x.reference_id,
        product:product?{id:product.id,name:product.name,strength:product.strength,base_unit:product.base_unit}:null,
        invoice:invoice?{id:invoice.id,invoice_number:invoice.invoice_number,kind:invoice.kind}:null,
        pharmacy_return:returnRow?{id:returnRow.id,return_number:returnRow.return_number}:null};
    }));
  }
  if(path==='pharmacy/settings'&&method==='GET'){
    const denied=permission(s,allowed,'settings','view');if(denied)return denied;return ok(await getSettings(env,storeId));
  }
  if(path==='pharmacy/settings'&&method==='PATCH'){
    const denied=writeGuard(s,store,allowed,'settings','edit');if(denied)return denied;
    const body=await jsonBody(request),current=await getSettings(env,storeId),days=body.expiry_warning_days==null?Math.trunc(n(current.expiry_warning_days,90)):Math.trunc(Number(body.expiry_warning_days)),threshold=Number(body.low_stock_default),categories=Array.isArray(body.categories)?[...new Set(body.categories.map(x=>text(x,80)).filter(Boolean))]:null;
    if(!Number.isInteger(days)||days<1||days>730||!Number.isFinite(threshold)||threshold<0||threshold>1e9)return bad('The stock threshold cannot be negative.',400);
    if(categories&&(!categories.length||categories.length>50))return bad('Provide between 1 and 50 medicine categories.',400);
    const row={store_id:storeId,expiry_warning_days:days,low_stock_default:r3(threshold),...(categories?{categories}:{}),updated_by:s.id||null,updated_at:now()};
    const [saved]=await db(env,'pharmacy_settings?on_conflict=store_id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
    await audit?.(env,s,'update pharmacy settings','pharmacy settings',storeId,{expiry_warning_days:days,low_stock_default:threshold,categories:categories?.length});return ok(saved);
  }
  if(path==='pharmacy/categories'&&method==='GET'){
    const denied=permission(s,allowed,'inventory','view');if(denied)return denied;const settings=await getSettings(env,storeId);return ok(Array.isArray(settings.categories)?settings.categories:[]);
  }
  if(path==='pharmacy/categories'&&method==='POST'){
    const verb=allowed(s,'inventory','add')?'add':'edit',denied=writeGuard(s,store,allowed,'inventory',verb);if(denied)return denied;
    const body=await jsonBody(request),name=text(body.category,80);if(!name)return bad('Category name is required.',400);
    const current=await getSettings(env,storeId),categories=Array.isArray(current.categories)?[...current.categories]:[];
    const existing=categories.find(x=>String(x).trim().toLowerCase()===name.toLowerCase());if(existing)return ok({category:existing,categories,added:false});
    if(categories.length>=50)return bad('This shop already has the maximum of 50 medicine categories.',400);
    categories.push(name);
    const row={store_id:storeId,expiry_warning_days:Math.trunc(n(current.expiry_warning_days,90)),low_stock_default:r3(n(current.low_stock_default,5)),categories,updated_by:s.id||null,updated_at:now()};
    const [saved]=await db(env,'pharmacy_settings?on_conflict=store_id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
    await audit?.(env,s,'add pharmacy category','pharmacy category',storeId,{category:name});
    return ok({category:name,categories:Array.isArray(saved?.categories)?saved.categories:categories,added:true},201);
  }
  if(path==='pharmacy/alerts'&&method==='GET'){
    const denied=permission(s,allowed,'dashboard','view');if(denied)return denied;const data=await loadPharmacyData(env,storeId),settings=await getSettings(env,storeId);await syncAlerts(env,storeId,data,settings,systemWriteAllowed);
    return ok(await db(env,`pharmacy_alerts?store_id=eq.${storeId}&select=*&order=updated_at.desc`));
  }
  if(path==='pharmacy/alerts/read-all'&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'dashboard','view');if(denied)return denied;
    const changed=await db(env,`pharmacy_alerts?store_id=eq.${storeId}&status=eq.unread`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'read',read_at:now(),updated_at:now()})});
    return ok({count:changed.length});
  }
  const alertRead=path.match(/^pharmacy\/alerts\/([^/]+)\/read$/);
  if(alertRead&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'dashboard','view');if(denied)return denied;
    const id=decodeURIComponent(alertRead[1]);if(!uuid.test(id))return bad('Alert ID is invalid.',400);
    const [saved]=await db(env,`pharmacy_alerts?id=eq.${id}&store_id=eq.${storeId}&status=eq.unread`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'read',read_at:now(),updated_at:now()})});if(!saved)return bad('Alert not found.',404);return ok(saved);
  }
  const invoiceLinesMatch=path.match(/^pharmacy\/invoices\/([^/]+)\/lines$/);
  if(invoiceLinesMatch&&method==='GET'){
    const invoiceId=decodeURIComponent(invoiceLinesMatch[1]);if(!uuid.test(invoiceId))return bad('Invoice ID is invalid.',400);
    const [invoice]=await db(env,`invoices?id=eq.${invoiceId}&store_id=eq.${storeId}&select=id,kind`);if(!invoice)return bad('Pharmacy invoice not found.',404);
    const denied=permission(s,allowed,invoice.kind==='purchase'?'purchase':'sales','view');if(denied)return denied;
    const [operation]=await db(env,`pharmacy_operations?store_id=eq.${storeId}&invoice_id=eq.${invoiceId}&operation_type=eq.${invoice.kind}&select=id`);if(!operation)return bad('Invoice is not a Pharmacy transaction.',404);
    const lines=await db(env,`invoice_lines?invoice_id=eq.${invoiceId}&select=id,item_id,quantity,unit_price,line_total,tax_percent,discount,cost_price`);if(!lines.length)return ok([]);
    const lineIds=lines.map(x=>x.id),itemIds=[...new Set(lines.map(x=>x.item_id))],extensions=await db(env,`pharmacy_invoice_lines?store_id=eq.${storeId}&invoice_line_id=${idFilter(lineIds)}&select=*`);
    const productIds=[...new Set(extensions.map(x=>x.product_id))];
    const [items,products]=await Promise.all([
      db(env,`inventory_items?store_id=eq.${storeId}&id=${idFilter(itemIds)}&select=id,item_code,description,unit`),
      productIds.length?db(env,`pharmacy_products?store_id=eq.${storeId}&id=${idFilter(productIds)}&select=id,name,strength,dosage_form,base_unit`):[],
    ]);
    const extMap=Object.fromEntries(extensions.map(x=>[x.invoice_line_id,x])),itemMap=Object.fromEntries(items.map(x=>[x.id,x])),productMap=Object.fromEntries(products.map(x=>[x.id,x]));
    return ok(lines.map(x=>{const ext=extMap[x.id]||{},p=productMap[ext.product_id]||{},item=itemMap[x.item_id]||{};return {...x,product_name:[p.name,p.strength,p.dosage_form].filter(Boolean).join(' · ')||item.description||'Medicine',item_code:item.item_code||'',unit_label:ext.unit_label||item.unit||'',unit_factor:n(ext.unit_factor,1),quantity_base:n(ext.quantity_base),base_unit:p.base_unit||item.unit||''}}));
  }
  const purchaseMatch=path.match(/^pharmacy\/purchases\/([^/]+)$/);
  if(purchaseMatch&&method==='GET'){
    const denied=permission(s,allowed,'purchase','view');if(denied)return denied;const id=decodeURIComponent(purchaseMatch[1]);if(!uuid.test(id))return bad('Purchase ID is invalid.',400);
    const detail=await getPurchaseDetail(env,storeId,id);return detail?ok(detail):bad('Pharmacy purchase was not found in this shop.',404);
  }
  if(path==='pharmacy/purchases'&&method==='GET'){
    const denied=permission(s,allowed,'purchase','view');if(denied)return denied;return ok(await getInvoiceSummaries(env,storeId,'purchase'));
  }
  if(path==='pharmacy/purchases'&&method==='POST'){
    const body=await jsonBody(request);return postPharmacyInvoice(env,s,store,body,'purchase',allowed,audit,autoSms);
  }
  if(path==='pharmacy/checkout'&&method==='POST'){
    const body=await jsonBody(request);return postPharmacyInvoice(env,s,store,body,'sale',allowed,audit,autoSms);
  }
  if((path==='pharmacy/returns'||path==='pharmacy/exchanges')&&method==='GET'){
    const denied=permission(s,allowed,'returns_refunds','view');if(denied&&!allowed(s,'sales','view'))return denied;
    return ok(await listReturnRecords(env,storeId,path==='pharmacy/exchanges'?'exchange':null));
  }
  if(path==='pharmacy/returns/lookup'&&method==='GET'){
    const denied=permission(s,allowed,'returns_refunds','add');if(denied&&!allowed(s,'sales','add'))return denied;
    const invoiceNumber=text(query.get('invoice_number'),80);if(!invoiceNumber)return bad('Invoice number is required.',400);
    const result=await lookupReturn(env,storeId,invoiceNumber);return result.error||ok(result.data);
  }
  if(path==='pharmacy/quarantine'&&method==='GET'){
    const denied=permission(s,allowed,'inventory','view');if(denied)return denied;
    return ok(await listQuarantine(env,storeId));
  }
  if((path==='pharmacy/returns'||path==='pharmacy/exchanges')&&method==='POST'){
    const kind=path==='pharmacy/exchanges'?'exchange':'return';
    if(store.status==='read_only'||s.readOnly||s.licenseExpired)return bad('This shop is read-only. An active license is required to change Pharmacy data.',403);
    if(!allowed(s,'returns_refunds','add')&&!allowed(s,'sales','add'))return bad('Permission denied.',403);
    const body=await jsonBody(request);
    if(!uuid.test(String(body.invoice_id||'')))return bad('Original Pharmacy invoice ID is invalid.',400);
    const reason=text(body.reason,500),key=operationKey(body.idempotencyKey);
    if(!reason)return bad('Return reason is required.',400);
    if(!key)return bad('A valid retry-safe operation key is required.',400);
    const built=await buildReturnItems(env,storeId,body.items);if(built.error)return built.error;
    let newItems=[];
    if(kind==='exchange'){
      if(!Array.isArray(body.new_items)||!body.new_items.length||body.new_items.length>100)return bad('Add 1 to 100 replacement medicines for an exchange.',400);
      newItems=body.new_items.map(x=>({product_id:String(x?.product_id||''),unit_label:text(x?.unit_label,40),quantity:n(x?.quantity)}));
      if(newItems.some(x=>!uuid.test(x.product_id)||!x.unit_label||!(x.quantity>0)))return bad('Each replacement needs a medicine, unit and positive quantity.',400);
    }
    const refundMethod=text(body.refund_method||'none',20).toLowerCase(),paymentMethod=text(body.payment_method||'none',20).toLowerCase();
    const methods=['none','cash','bank','bkash','nagad','other'];
    if(!methods.includes(refundMethod)||!methods.includes(paymentMethod))return bad('Choose a valid refund or payment method.',400);
    const [invoice]=await db(env,`invoices?id=eq.${body.invoice_id}&store_id=eq.${storeId}&kind=eq.sale&select=*`);if(!invoice)return bad('Original Pharmacy sale was not found in this shop.',404);
    const returnNumber=`${kind==='exchange'?'PX':'PR'}-${dateToday().replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
    let customerName=invoice.custom_party_name||'Walk-in customer';if(invoice.party_id){const [customer]=await db(env,`customers?id=eq.${invoice.party_id}&store_id=eq.${storeId}&select=name`);if(customer?.name)customerName=customer.name}
    try{
      const result=await db(env,'rpc/pharmacy_post_return_exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_store_id:storeId,p_invoice_id:invoice.id,p_kind:kind,p_return_number:returnNumber,p_customer_name:customerName,p_reason:reason,p_notes:text(body.notes,1000)||null,p_idempotency_key:key,p_created_by:s.id||null,p_items:built.rows,p_new_items:newItems,p_refund_method:refundMethod,p_payment_method:paymentMethod,p_transaction_id:text(body.transaction_id,120)||null})});
      await audit?.(env,s,kind==='exchange'?'record pharmacy exchange':'record pharmacy return','pharmacy return',result.id,{storeId,return_number:result.return_number,invoice_number:invoice.invoice_number,amount:result.amount,settlement:result.settlement_type,refund:result.refund_amount||0});
      return ok({...result,items:undefined},201);
    }catch(e){return bad(e.message||'Return could not be recorded.',/exceeds|insufficient|operation key/i.test(e.message||'')?409:400)}
  }
  if(path==='pharmacy/supplier-returns'&&method==='GET'){
    const denied=permission(s,allowed,'purchase','view');if(denied)return denied;
    return bad('Batch-linked supplier-return history has been retired from the Pharmacy workspace. Existing records remain preserved.',410);
  }
  if(path==='pharmacy/supplier-returns'&&method==='POST'){
    const denied=writeGuard(s,store,allowed,'purchase','add');if(denied)return denied;
    return bad('Supplier-return stock and payable treatment must be confirmed before Pharmacy can post it. No batch, invoice due, or supplier balance is changed.',409);
  }
  if(path==='pharmacy/reports'&&method==='GET'){
    const denied=permission(s,allowed,'report','view');if(denied)return denied;
    const from=query.get('from')||dateToday(),to=query.get('to')||dateToday();if(!isDate(from)||!isDate(to)||from>to)return bad('Choose a valid report date range.',400);
    const data=await loadPharmacyData(env,storeId);return ok(await getReports(env,storeId,from,to,data));
  }
  return bad('Pharmacy route not found.',404);
}
