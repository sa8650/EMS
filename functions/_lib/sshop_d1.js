/* Atomic D1 implementations for the Supershop RPCs. Kept separate from the
   shared query adapter so the rest of EMS continues to use its existing paths. */
const nowIso=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const n=(x,d=0)=>{const v=Number(x);return Number.isFinite(v)?v:d};
const r2=x=>Math.round((n(x)+Number.EPSILON)*100)/100;
const r3=x=>Math.round((n(x)+Number.EPSILON)*1000)/1000;
const r6=x=>Math.round((n(x)+Number.EPSILON)*1e6)/1e6;
const txt=(x,max=240)=>String(x??'').trim().slice(0,max);
const all=async(env,sql,params=[])=>{const r=await env.DB.prepare(sql).bind(...params).all();if(!r.success)throw Error(r.error||'D1 query failed');return r.results||[]};
const batch=async(env,statements)=>env.DB.batch(statements.map(s=>env.DB.prepare(s.sql).bind(...(s.params||[]))));
const stmt=(sql,params=[])=>({sql,params});
const insert=(table,row)=>{const cols=Object.keys(row);return stmt(`INSERT INTO ${table}(${cols.map(c=>'"'+c+'"').join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,cols.map(c=>row[c]));};
const moneyMethod=new Set(['cash','bank','bkash','nagad','other']);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&Number.isFinite(Date.parse(String(x)+'T00:00:00Z'))&&new Date(String(x)+'T00:00:00Z').toISOString().slice(0,10)===String(x);

async function inventoryCode(env){
  const rows=await all(env,'SELECT item_code FROM inventory_items');let max=0;
  for(const row of rows){const x=parseInt(String(row.item_code||'').replace(/\D/g,''),10);if(Number.isFinite(x))max=Math.max(max,x)}
  return 'ITM-'+String(max+1).padStart(7,'0');
}
function normalizeUnits(input,base){
  if(!Array.isArray(input)||input.length<1||input.length>50)throw Error('Add between 1 and 50 product units');
  const seen=new Set(),units=input.map(u=>({
    unit_label:txt(u.unit_label,60).toLowerCase(),factor_to_base:Number(u.factor_to_base),allow_fractional:!!u.allow_fractional,
    can_purchase:u.can_purchase!==false,can_sell:u.can_sell!==false,
    purchase_price:u.purchase_price==null||u.purchase_price===''?null:Number(u.purchase_price),
    selling_price:u.selling_price==null||u.selling_price===''?null:Number(u.selling_price),
  }));
  for(const u of units){
    if(!u.unit_label||seen.has(u.unit_label))throw Error('Unit labels must be present and unique');seen.add(u.unit_label);
    if(!(u.factor_to_base>0)||!Number.isFinite(u.factor_to_base)||u.factor_to_base>1e9)throw Error('Conversion factors must be positive numbers');
    if((u.purchase_price!=null&&(!Number.isFinite(u.purchase_price)||u.purchase_price<0))||(u.selling_price!=null&&(!Number.isFinite(u.selling_price)||u.selling_price<0)))throw Error('Unit prices cannot be negative');
    if(u.unit_label===base&&u.factor_to_base!==1)throw Error('Base unit conversion must equal 1');
  }
  if(!units.some(u=>u.unit_label===base&&u.factor_to_base===1))throw Error('The base unit must be included with a conversion factor of 1');
  return units;
}

export async function d1SupershopSaveProduct(env,p){
  const storeId=String(p.p_store_id||''),productId=p.p_product_id||null,data=p.p_product||{},units=normalizeUnits(p.p_units,String(data.base_unit||'piece').trim().toLowerCase());
  const name=txt(data.name,180),base=txt(data.base_unit||'piece',60).toLowerCase(),category=txt(data.category,100)||null,subcategory=txt(data.subcategory,100)||null;
  const sku=txt(data.sku,80),barcode=txt(data.barcode,80),supplierId=data.default_supplier_id||null;
  const purchase=r2(data.purchase_price),sale=r2(data.sale_price),mrp=Number.isFinite(Number(data.mrp_per_base))?Number(data.mrp_per_base):sale,tax=Number(data.tax_percent||0),reorder=r3(data.reorder_threshold??5),initial=r3(data.initial_stock??0);
  if(!storeId||!name)throw Error('Shop and product name are required');
  if(![purchase,sale,mrp,tax,reorder,initial].every(Number.isFinite)||purchase<0||sale<0||mrp<0||tax<0||tax>100||reorder<0||initial<0)throw Error('Prices, tax, and stock levels must be valid non-negative values');
  const [store]=await all(env,"SELECT id FROM stores WHERE id=? AND business_type='supershop'",[storeId]);if(!store)throw Error('Supershop shop not found');
  if(supplierId){const [supplier]=await all(env,'SELECT id FROM suppliers WHERE id=? AND store_id=?',[supplierId,storeId]);if(!supplier)throw Error('Default supplier must belong to this shop');}
  if(barcode){const [duplicate]=await all(env,'SELECT inventory_item_id FROM supershop_products WHERE store_id=? AND lower(barcode)=lower(?) AND inventory_item_id<>COALESCE(?,\'\')',[storeId,barcode,productId||'']);if(duplicate)throw Error('Barcode is already assigned to another product in this shop');}
  let existing=null,item=null,itemId=productId;
  if(productId){
    [existing]=await all(env,'SELECT * FROM supershop_products WHERE inventory_item_id=? AND store_id=?',[productId,storeId]);
    [item]=await all(env,'SELECT * FROM inventory_items WHERE id=? AND store_id=?',[productId,storeId]);
    if(!existing||!item)throw Error('Product was not found in this shop');
    if(String(item.unit).toLowerCase()!==base){const [history]=await all(env,'SELECT invoice_line_id FROM supershop_invoice_lines WHERE inventory_item_id=? LIMIT 1',[productId]);if(Number(item.total_stock||0)!==0||history)throw Error('Base unit cannot change after stock or transaction history exists');}
  }else{itemId=uid();}
  const itemCode=sku||item?.item_code||await inventoryCode(env),isActive=data.active===false?0:1,now=nowIso();
  const itemDescription=txt(data.name,180),description=txt(data.description,2000)||null,brand=txt(data.brand,120)||null;
  const movement=[];
  const statements=[];
  if(!existing){
    statements.push(stmt('INSERT INTO inventory_items(id,store_id,item_code,description,unit,sale_price,total_stock,active,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
      itemId,storeId,itemCode,itemDescription,base,sale,initial,isActive,category,now,now]));
    statements.push(stmt('INSERT INTO supershop_products(inventory_item_id,store_id,barcode,brand,subcategory,description,default_supplier_id,mrp_per_base,tax_percent,reorder_threshold,average_cost_base,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
      itemId,storeId,barcode||null,brand,subcategory,description,supplierId,mrp,tax,reorder,purchase,isActive,p.p_created_by||null,now,now]));
    if(initial>0)movement.push(insert('supershop_stock_movements',{id:uid(),store_id:storeId,inventory_item_id:itemId,movement_type:'opening',quantity_base:initial,stock_before:0,stock_after:initial,unit_cost_base:purchase,reference_type:'product',reference_id:null,reason:'Opening stock',idempotency_key:null,created_by:p.p_created_by||null,created_at:now}));
  }else{
    statements.push(stmt('UPDATE inventory_items SET item_code=?,description=?,unit=?,sale_price=?,category=?,active=?,updated_at=? WHERE id=? AND store_id=?',[
      itemCode,itemDescription,base,sale,category,isActive,now,itemId,storeId]));
    statements.push(stmt('UPDATE supershop_products SET barcode=?,brand=?,subcategory=?,description=?,default_supplier_id=?,mrp_per_base=?,tax_percent=?,reorder_threshold=?,average_cost_base=CASE WHEN ?=0 THEN ? ELSE average_cost_base END,active=?,updated_at=? WHERE inventory_item_id=? AND store_id=?',[
      barcode||null,brand,subcategory,description,supplierId,mrp,tax,reorder,Number(item.total_stock||0),purchase,isActive,now,itemId,storeId]));
  }
  for(const u of units){
    statements.push(stmt(`INSERT INTO supershop_product_units(id,store_id,inventory_item_id,unit_label,factor_to_base,allow_fractional,can_purchase,can_sell,purchase_price,selling_price,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(inventory_item_id,unit_label) DO UPDATE SET factor_to_base=excluded.factor_to_base,allow_fractional=excluded.allow_fractional,can_purchase=excluded.can_purchase,can_sell=excluded.can_sell,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,updated_at=excluded.updated_at`,[
      uid(),storeId,itemId,u.unit_label,u.factor_to_base,u.allow_fractional?1:0,u.can_purchase?1:0,u.can_sell?1:0,u.purchase_price,u.selling_price,now,now]));
  }
  statements.push(stmt(`DELETE FROM supershop_product_units WHERE store_id=? AND inventory_item_id=? AND unit_label NOT IN (${units.map(()=>'?').join(',')})`,[storeId,itemId,...units.map(x=>x.unit_label)]));
  statements.push(...movement);
  await batch(env,statements);
  const [created]=await all(env,'SELECT * FROM inventory_items WHERE id=? AND store_id=?',[itemId,storeId]);
  return {...created,...(await all(env,'SELECT * FROM supershop_products WHERE inventory_item_id=? AND store_id=?',[itemId,storeId]))[0],id:itemId,inventory_item_id:itemId};
}

export async function d1SupershopPostInvoice(env,p){
  const storeId=String(p.p_store_id||''),kind=String(p.p_kind||''),opKey=txt(p.p_idempotency_key,160),lines=Array.isArray(p.p_lines)?p.p_lines:[];
  if(!storeId||!['sale','purchase'].includes(kind)||lines.length<1||lines.length>200)throw Error('Shop, invoice type and 1–200 invoice lines are required');
  if(opKey.length<12)throw Error('A valid idempotency key is required');
  const [store]=await all(env,"SELECT id FROM stores WHERE id=? AND business_type='supershop' AND status<>'inactive'",[storeId]);if(!store)throw Error('Supershop shop not found');
  const [prior]=await all(env,'SELECT operation_type,invoice_id FROM supershop_operations WHERE store_id=? AND operation_key=?',[storeId,opKey]);
  if(prior){if(prior.operation_type!==kind||!prior.invoice_id)throw Error('This operation key has already been used');const [old]=await all(env,'SELECT * FROM invoices WHERE id=? AND store_id=?',[prior.invoice_id,storeId]);if(!old)throw Error('Previously posted invoice could not be found');return {...old,idempotent:true};}
  const partyId=p.p_party_id||null;
  if(partyId){const table=kind==='sale'?'customers':'suppliers';const [party]=await all(env,`SELECT id FROM ${table} WHERE id=? AND store_id=?`,[partyId,storeId]);if(!party)throw Error(`${kind==='sale'?'Customer':'Supplier'} must belong to this shop`);}
  const paymentMethod=String(p.p_payment_method||'cash').toLowerCase();if(!moneyMethod.has(paymentMethod))throw Error('Payment method is invalid');
  const invoiceDate=String(p.p_invoice_date||'');if(!validDate(invoiceDate)||!p.p_invoice_number)throw Error('Invoice number and a valid invoice date are required');
  const taxPercent=Number(p.p_tax_percent||0),invoiceDiscount=r2(p.p_discount||0),paid=r2(p.p_paid_amount||0);
  if(!Number.isFinite(taxPercent)||taxPercent<0||taxPercent>100||invoiceDiscount<0||paid<0)throw Error('Invoice tax, discount, or payment is invalid');
  const priceOverride=p.p_allow_price_override!==false;
  let subtotal=0,lineTaxTotal=0,lineDiscountTotal=0;
  const stockLeft=new Map(),prepared=[];
  for(const raw of lines){
    const productId=String(raw.productId||''),unitLabel=txt(raw.unitLabel,60).toLowerCase(),quantity=r3(raw.quantity),freeQuantity=r3(raw.freeQuantity||0);
    if(!productId||!unitLabel||quantity<=0||freeQuantity<0)throw Error('Each line needs a product, unit, positive quantity, and non-negative free quantity');
    if(kind!=='purchase'&&freeQuantity>0)throw Error('Free quantities are only valid on purchases');
    const [row]=await all(env,`SELECT i.id,i.item_code,i.description,i.unit,i.sale_price,i.total_stock,i.active AS item_active,
      sp.average_cost_base,sp.mrp_per_base,sp.tax_percent AS product_tax,sp.active AS product_active,
      u.unit_label,u.factor_to_base,u.allow_fractional,u.can_purchase,u.can_sell,u.purchase_price AS unit_purchase_price,u.selling_price AS unit_selling_price
      FROM inventory_items i JOIN supershop_products sp ON sp.inventory_item_id=i.id AND sp.store_id=i.store_id
      JOIN supershop_product_units u ON u.inventory_item_id=i.id AND u.store_id=i.store_id
      WHERE i.id=? AND i.store_id=? AND lower(u.unit_label)=lower(?)`,[productId,storeId,unitLabel]);
    if(!row||!row.item_active||!row.product_active)throw Error('Product is inactive or does not belong to this shop');
    if(kind==='sale'&&!row.can_sell||kind==='purchase'&&!row.can_purchase)throw Error('Selected unit is not enabled for this transaction');
    if(!row.allow_fractional&&!Number.isInteger(quantity))throw Error(`Unit ${unitLabel} does not allow decimal quantities`);
    const factor=Number(row.factor_to_base),quantityBase=r3(quantity*factor),freeBase=r3(freeQuantity*factor);
    if(!(quantityBase>0))throw Error('Quantity is below the smallest supported stock increment');
    let unitPrice;
    if(kind==='purchase')unitPrice=raw.unitPrice==null||raw.unitPrice===''?(row.unit_purchase_price==null?0:Number(row.unit_purchase_price)):Number(raw.unitPrice);
    else if(priceOverride)unitPrice=raw.unitPrice==null||raw.unitPrice===''?(row.unit_selling_price==null?Number(row.sale_price)*factor:Number(row.unit_selling_price)):Number(raw.unitPrice);
    else unitPrice=row.unit_selling_price==null?Number(row.sale_price)*factor:Number(row.unit_selling_price);
    const lineTaxPercent=raw.taxPercent==null||raw.taxPercent===''?Number(row.product_tax||0):Number(raw.taxPercent),discount=r2(raw.discount||0);
    if(!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(lineTaxPercent)||lineTaxPercent<0||lineTaxPercent>100||discount<0)throw Error('Line price, tax, and discount must be valid non-negative values');
    const lineSubtotal=r2(quantity*unitPrice),lineTax=r2(lineSubtotal*lineTaxPercent/100);
    if(discount>lineSubtotal+lineTax)throw Error('Line discount cannot exceed line total');
    let averageCost=Number(row.average_cost_base||0);
    if(kind==='sale'){
      const available=stockLeft.has(productId)?stockLeft.get(productId):Number(row.total_stock||0);
      if(available<quantityBase-0.0001)throw Error(`Insufficient stock for ${row.description}. Available: ${r3(available)} ${row.unit}.`);
      stockLeft.set(productId,r3(available-quantityBase));
    }
    prepared.push({productId,row,unitLabel,quantity,freeQuantity,factor,quantityBase,freeBase,unitPrice,lineTaxPercent,discount,lineSubtotal,lineTax,lineTotal:r2(lineSubtotal+lineTax-discount),averageCost});
    subtotal+=lineSubtotal;lineTaxTotal+=lineTax;lineDiscountTotal+=discount;
  }
  subtotal=r2(subtotal);lineTaxTotal=r2(lineTaxTotal);lineDiscountTotal=r2(lineDiscountTotal);
  const invoiceTax=r2(subtotal*taxPercent/100),total=r2(subtotal+lineTaxTotal+invoiceTax-lineDiscountTotal-invoiceDiscount);
  if(invoiceDiscount>subtotal+lineTaxTotal+invoiceTax-lineDiscountTotal||paid>total+0.0001)throw Error('Invoice discount or paid amount exceeds the invoice total');
  const invoiceId=uid(),now=nowIso(),verificationToken=uid();
  const invoice={id:invoiceId,store_id:storeId,kind,invoice_number:String(p.p_invoice_number),party_id:partyId,invoice_date:invoiceDate,payment_method:paymentMethod,transaction_id:p.p_transaction_id||null,
    notes:txt(p.p_notes,2000)||null,subtotal,tax_percent:taxPercent,discount:invoiceDiscount,tax_amount:invoiceTax,line_tax_amount:lineTaxTotal,line_discount_amount:lineDiscountTotal,
    paid_amount:paid,total_due:r2(total-paid),created_by:p.p_created_by||null,verification_token:verificationToken,
    custom_party_name:txt(p.p_custom_party_name,180)||null,custom_party_address:txt(p.p_custom_party_address,240)||null,custom_party_phone:txt(p.p_custom_party_phone,60)||null,created_at:now,updated_at:now};
  const stmts=[insert('invoices',invoice)];
  for(const x of prepared){
    const lineId=uid(),receivedBase=r3(x.quantityBase+x.freeBase),globalDiscount=kind==='purchase'&&subtotal>0?r2(invoiceDiscount*(x.lineSubtotal/subtotal)):0;
    const unitCostBase=kind==='sale'?r6(x.averageCost):r6(receivedBase>0?Math.max(0,x.lineSubtotal-x.discount-globalDiscount)/receivedBase:0);
    const invoiceLine={id:lineId,invoice_id:invoiceId,item_id:x.productId,quantity:x.quantity,unit_price:x.unitPrice,line_total:x.lineTotal,tax_percent:x.lineTaxPercent,discount:x.discount,cost_price:r2(unitCostBase*x.factor)};
    stmts.push(insert('invoice_lines',invoiceLine));
    stmts.push(insert('supershop_invoice_lines',{invoice_line_id:lineId,store_id:storeId,inventory_item_id:x.productId,unit_label:x.unitLabel,unit_factor:x.factor,
      quantity_base:kind==='purchase'?receivedBase:x.quantityBase,free_quantity_base:kind==='purchase'?x.freeBase:0,unit_cost_base:unitCostBase,mrp_per_base:Number(x.row.mrp_per_base||0),created_at:now}));
    if(kind==='purchase'){
      const incomingCost=Math.max(0,x.lineSubtotal-x.discount-globalDiscount),received=receivedBase;
      stmts.push(stmt(`UPDATE supershop_products SET average_cost_base=CASE WHEN (SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?)+?>0
        THEN ROUND(((SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?)*average_cost_base+?)/((SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?)+?),6)
        ELSE average_cost_base END,updated_at=? WHERE inventory_item_id=? AND store_id=?`,[
        x.productId,storeId,received,x.productId,storeId,incomingCost,x.productId,storeId,received,now,x.productId,storeId]));
      stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock+?,3),updated_at=? WHERE id=? AND store_id=?',[received,now,x.productId,storeId]));
      stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,?,'purchase',?,total_stock-?,total_stock,?,'invoice',?,?,?, ?,? FROM inventory_items WHERE id=? AND store_id=?`,[
        uid(),storeId,x.productId,received,received,unitCostBase,invoiceId,'Purchase receipt '+invoice.invoice_number,opKey+':purchase:'+lineId,p.p_created_by||null,now,x.productId,storeId]));
    }else{
      stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock-?,3),updated_at=? WHERE id=? AND store_id=?',[x.quantityBase,now,x.productId,storeId]));
      stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,?,'sale',-?,total_stock+?,total_stock,?,'invoice',?,?,?, ?,? FROM inventory_items WHERE id=? AND store_id=?`,[
        uid(),storeId,x.productId,x.quantityBase,x.quantityBase,unitCostBase,invoiceId,'Supershop sale '+invoice.invoice_number,opKey+':sale:'+lineId,p.p_created_by||null,now,x.productId,storeId]));
    }
  }
  stmts.push(insert('supershop_operations',{id:uid(),store_id:storeId,operation_key:opKey,operation_type:kind,result_id:invoiceId,invoice_id:invoiceId,created_by:p.p_created_by||null,created_at:now}));
  await batch(env,stmts);
  const [created]=await all(env,'SELECT * FROM invoices WHERE id=? AND store_id=?',[invoiceId,storeId]);
  return {...created,idempotent:false};
}

export async function d1SupershopAdjustStock(env,p){
  const storeId=String(p.p_store_id||''),itemId=String(p.p_inventory_item_id||''),key=txt(p.p_idempotency_key,160);
  if(key.length<12)throw Error('A valid idempotency key is required');
  const [prior]=await all(env,'SELECT operation_type,result_id FROM supershop_operations WHERE store_id=? AND operation_key=?',[storeId,key]);
  if(prior){if(prior.operation_type!=='adjustment')throw Error('This operation key is already used');return {inventory_item_id:prior.result_id,idempotent:true};}
  const [row]=await all(env,`SELECT i.total_stock,i.unit,sp.average_cost_base FROM inventory_items i JOIN supershop_products sp ON sp.inventory_item_id=i.id AND sp.store_id=i.store_id
    WHERE i.id=? AND i.store_id=? AND sp.active=1`,[itemId,storeId]);if(!row)throw Error('Product was not found in this shop');
  const hasTarget=p.p_target_quantity!=null&&p.p_target_quantity!=='';const before=Number(row.total_stock||0),target=hasTarget?r3(p.p_target_quantity):null,delta=hasTarget?r3(target-before):r3(p.p_delta);
  if(hasTarget&&(!(target>=0)||!Number.isFinite(target)))throw Error('Counted stock cannot be negative');
  if(!Number.isFinite(delta)||delta===0)throw Error('Stock adjustment must change quantity');
  const type=String(p.p_movement_type||'adjustment');if(!['adjustment','stock_count','waste','damage','opening'].includes(type))throw Error('Invalid stock movement type');
  if((type==='damage'||type==='waste')&&delta>=0)throw Error('Damage and waste movements must reduce stock');
  if(type==='opening'&&(delta<=0||before>0))throw Error('Opening stock can only add quantity to an empty product');
  const [store]=await all(env,"SELECT id FROM stores WHERE id=? AND business_type='supershop'",[storeId]);if(!store)throw Error('Supershop shop not found');
  const now=nowIso(),movementId=uid();
  const updateSql=hasTarget
    ? 'UPDATE inventory_items SET total_stock=CASE WHEN total_stock=? THEN ? ELSE -1 END,updated_at=? WHERE id=? AND store_id=?'
    : 'UPDATE inventory_items SET total_stock=ROUND(total_stock+?,3),updated_at=? WHERE id=? AND store_id=?';
  const updateParams=hasTarget?[before,target,now,itemId,storeId]:[delta,now,itemId,storeId];
  const movementSql=hasTarget
    ? `INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
       SELECT ?,?,?,?,?,?,total_stock,?,'adjustment',NULL,?,?,?,? FROM inventory_items WHERE id=? AND store_id=?`
    : `INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
       SELECT ?,?,?,?,?,total_stock-?,total_stock,?,'adjustment',NULL,?,?,?,? FROM inventory_items WHERE id=? AND store_id=?`;
  const movementParams=hasTarget
    ? [movementId,storeId,itemId,type,delta,before,Number(row.average_cost_base||0),txt(p.p_reason,240)||null,key,p.p_created_by||null,now,itemId,storeId]
    : [movementId,storeId,itemId,type,delta,delta,Number(row.average_cost_base||0),txt(p.p_reason,240)||null,key,p.p_created_by||null,now,itemId,storeId];
  const stmts=[stmt(updateSql,updateParams),stmt(movementSql,movementParams)];
  stmts.push(insert('supershop_operations',{id:uid(),store_id:storeId,operation_key:key,operation_type:'adjustment',result_id:itemId,invoice_id:null,created_by:p.p_created_by||null,created_at:now}));
  await batch(env,stmts);
  const [updated]=await all(env,'SELECT total_stock FROM inventory_items WHERE id=? AND store_id=?',[itemId,storeId]);
  return {inventory_item_id:itemId,stock_before:before,stock_after:Number(updated?.total_stock||0),delta,idempotent:false};
}

export async function d1SupershopPostReturn(env,p){
  const storeId=String(p.p_store_id||''),invoiceId=String(p.p_invoice_id||''),key=txt(p.p_idempotency_key,160),items=Array.isArray(p.p_items)?p.p_items:[];
  if(key.length<12||items.length<1||items.length>100)throw Error('Select 1–100 return lines and provide a valid operation key');
  const [prior]=await all(env,"SELECT operation_type,result_id FROM supershop_operations WHERE store_id=? AND operation_key=?",[storeId,key]);
  if(prior){if(prior.operation_type!=='return')throw Error('This operation key is already used');const [old]=await all(env,'SELECT * FROM returns WHERE id=? AND store_id=?',[prior.result_id,storeId]);if(old)return {...old,idempotent:true};throw Error('Previous return could not be found');}
  const [invoice]=await all(env,"SELECT * FROM invoices WHERE id=? AND store_id=? AND kind='sale'",[invoiceId,storeId]);
  const [saleOp]=await all(env,"SELECT id FROM supershop_operations WHERE store_id=? AND invoice_id=? AND operation_type='sale'",[storeId,invoiceId]);
  if(!invoice||!saleOp)throw Error('Original invoice is not a Supershop sale in this shop');
  const grouped=new Map();for(const x of items){const id=String(x.invoiceLineId||'');const old=grouped.get(id);if(old)throw Error('Choose each sold line only once');grouped.set(id,x)}
  const reasons=new Set(['Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other']),conditions=new Set(['Sellable','Damaged','Defective']);
  const prepared=[];let subtotal=0,taxTotal=0,discountTotal=0,penaltyTotal=0,total=0;
  for(const raw of grouped.values()){
    const lineId=String(raw.invoiceLineId||''),qty=r3(raw.quantity),reason=txt(raw.reason,80),reasonNote=txt(raw.reasonNote,240)||null,condition=String(raw.condition||'');
    if(!lineId||!(qty>0))throw Error('Return quantities must be positive');
    if(!reasons.has(reason))throw Error('Select a valid return reason');if(reason==='Other'&&!reasonNote)throw Error('A note is required for Other');if(!conditions.has(condition))throw Error('Select a valid returned-item condition');
    const [line]=await all(env,`SELECT il.id,il.invoice_id,il.item_id,il.quantity,il.unit_price,il.line_total,il.tax_percent,il.discount,
      sl.unit_label,sl.unit_factor,sl.quantity_base,sl.unit_cost_base,ii.description,ii.total_stock
      FROM invoice_lines il JOIN supershop_invoice_lines sl ON sl.invoice_line_id=il.id AND sl.store_id=?
      JOIN inventory_items ii ON ii.id=il.item_id AND ii.store_id=? WHERE il.id=? AND il.invoice_id=?`,[storeId,storeId,lineId,invoiceId]);
    if(!line)throw Error('Return line does not belong to the selected invoice');
    const [used]=await all(env,`SELECT COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.invoice_line_id=? AND r.store_id=?),0)
      +COALESCE((SELECT SUM(ei.quantity) FROM exchange_items ei JOIN exchanges e ON e.id=ei.exchange_id WHERE ei.invoice_line_id=? AND ei.item_type='returned' AND e.store_id=?),0) AS quantity`,[lineId,storeId,lineId,storeId]);
    const returnable=r3(Number(line.quantity)-Number(used?.quantity||0));if(qty>returnable+0.0001)throw Error(`Return quantity exceeds remaining quantity ${returnable}`);
    const base=r3(qty*Number(line.unit_factor)),sub=r2(qty*Number(line.unit_price)),taxPct=Number(line.tax_percent??invoice.tax_percent??0),lineTax=r2(sub*taxPct/100);
    const lineDiscount=Number(line.quantity)>0?r2(Number(line.discount||0)*qty/Number(line.quantity)):0;
    const invoiceDiscount=Number(invoice.subtotal)>0?r2(Number(invoice.discount||0)*sub/Number(invoice.subtotal)):0;
    const discount=r2(lineDiscount+invoiceDiscount),penalty=r2(raw.penalty||0);if(penalty<0||penalty>sub+lineTax-discount)throw Error('Return penalty is invalid');
    const amount=Math.max(0,r2(sub+lineTax-discount-penalty));
    prepared.push({lineId,itemId:line.item_id,qty,base,unitLabel:line.unit_label,factor:Number(line.unit_factor),unitCost:Number(line.unit_cost_base||0),sub,taxPct,lineTax,discount,penalty,amount,reason,reasonNote,condition,stock:Number(line.total_stock||0)});
    subtotal+=sub;taxTotal+=lineTax;discountTotal+=discount;penaltyTotal+=penalty;total+=amount;
  }
  subtotal=r2(subtotal);taxTotal=r2(taxTotal);discountTotal=r2(discountTotal);penaltyTotal=r2(penaltyTotal);total=r2(total);
  const dueReduction=r2(Math.min(total,Math.max(0,Number(invoice.total_due||0)))),refund=r2(total-dueReduction);
  let refundMethod=String(p.p_refund_method||'none').toLowerCase();if(refund>0&&!moneyMethod.has(refundMethod))throw Error('Choose a valid refund method for the amount already paid');if(refund===0)refundMethod='none';
  const [party]=invoice.party_id?await all(env,'SELECT name FROM customers WHERE id=? AND store_id=?',[invoice.party_id,storeId]):[];
  const returnId=uid(),now=nowIso(),retNo=String(p.p_return_number||`RET-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`),retDate=validDate(p.p_return_date)?p.p_return_date:new Date().toISOString().slice(0,10);
  const ret={id:returnId,store_id:storeId,invoice_id:invoiceId,return_number:retNo,customer_id:invoice.party_id||null,customer_name:party?.name||invoice.custom_party_name||'Walk-in Customer',return_date:retDate,
    subtotal,tax_amount:taxTotal,discount_amount:discountTotal,penalty_amount:penaltyTotal,total_return_amount:total,refunded_amount:refund,refund_method:refundMethod,transaction_id:p.p_transaction_id||null,
    status:'refunded',notes:txt(p.p_notes,2000)||null,created_by:p.p_created_by||null,verification_token:uid(),created_at:now,updated_at:now};
  const stmts=[insert('returns',ret)];
  for(const x of prepared){
    stmts.push(insert('return_items',{id:uid(),return_id:returnId,invoice_line_id:x.lineId,item_id:x.itemId,quantity:x.qty,unit_price:r2(x.sub/x.qty),tax_percent:x.taxPct,tax_amount:x.lineTax,discount:x.discount,penalty:x.penalty,return_amount:x.amount,reason:x.reason,reason_note:x.reasonNote,condition:x.condition,created_at:now}));
    if(x.condition==='Sellable'){
      stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock+?,3),updated_at=? WHERE id=? AND store_id=?',[x.base,now,x.itemId,storeId]));
      stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,?,'return_restock',?,total_stock-?,total_stock,?,'return',?,'Sellable customer return',?,?,? FROM inventory_items WHERE id=? AND store_id=?`,[
        uid(),storeId,x.itemId,x.base,x.base,x.unitCost,returnId,key+':return:'+x.lineId,p.p_created_by||null,now,x.itemId,storeId]));
    }else{
      stmts.push(insert('supershop_stock_movements',{id:uid(),store_id:storeId,inventory_item_id:x.itemId,movement_type:x.condition==='Damaged'?'return_damaged':'return_defective',quantity_base:x.base,stock_before:x.stock,stock_after:x.stock,unit_cost_base:x.unitCost,reference_type:'return',reference_id:returnId,reason:`Quarantined customer return (${x.condition})`,idempotency_key:key+':return:'+x.lineId,created_by:p.p_created_by||null,created_at:now}));
    }
  }
  stmts.push(stmt('UPDATE invoices SET total_due=MAX(0,total_due-?),updated_at=? WHERE id=? AND store_id=?',[dueReduction,now,invoiceId,storeId]));
  stmts.push(insert('supershop_operations',{id:uid(),store_id:storeId,operation_key:key,operation_type:'return',result_id:returnId,invoice_id:invoiceId,created_by:p.p_created_by||null,created_at:now}));
  await batch(env,stmts);
  return {...ret,due_reduction:dueReduction,idempotent:false};
}

export async function d1SupershopPostSupplierReturn(env,p){
  const storeId=String(p.p_store_id||''),invoiceId=String(p.p_invoice_id||''),key=txt(p.p_idempotency_key,160),items=Array.isArray(p.p_items)?p.p_items:[];
  if(key.length<12||items.length<1||items.length>100)throw Error('Select 1–100 purchase lines and provide a valid operation key');
  const [prior]=await all(env,'SELECT id FROM supershop_supplier_returns WHERE store_id=? AND idempotency_key=?',[storeId,key]);
  if(prior){const [old]=await all(env,'SELECT * FROM supershop_supplier_returns WHERE id=? AND store_id=?',[prior.id,storeId]);return {...old,idempotent:true};}
  const [invoice]=await all(env,"SELECT * FROM invoices WHERE id=? AND store_id=? AND kind='purchase'",[invoiceId,storeId]);
  const [purchaseOp]=await all(env,"SELECT id FROM supershop_operations WHERE store_id=? AND invoice_id=? AND operation_type='purchase'",[storeId,invoiceId]);
  if(!invoice||!purchaseOp)throw Error('Purchase invoice is not a Supershop purchase in this shop');
  const grouped=new Map();for(const x of items){const id=String(x.invoiceLineId||'');if(grouped.has(id))throw Error('Choose each purchase line only once');grouped.set(id,x)}
  const prepared=[];let total=0;
  for(const raw of grouped.values()){
    const lineId=String(raw.invoiceLineId||''),qty=r3(raw.quantity);if(!lineId||qty<=0)throw Error('Supplier return quantities must be positive');
    const [line]=await all(env,`SELECT il.id,il.item_id,il.quantity,il.unit_price,sl.unit_label,sl.unit_factor,sl.quantity_base,sl.free_quantity_base,sl.unit_cost_base,ii.total_stock
      FROM invoice_lines il JOIN supershop_invoice_lines sl ON sl.invoice_line_id=il.id AND sl.store_id=? JOIN inventory_items ii ON ii.id=il.item_id AND ii.store_id=?
      WHERE il.id=? AND il.invoice_id=?`,[storeId,storeId,lineId,invoiceId]);
    if(!line)throw Error('Selected line does not belong to the Supershop purchase invoice');
    const [used]=await all(env,'SELECT COALESCE(SUM(quantity_base),0) AS quantity,COALESCE(SUM(free_quantity_base),0) AS free FROM supershop_supplier_return_items WHERE invoice_line_id=? AND store_id=?',[lineId,storeId]);
    const base=r3(qty*Number(line.unit_factor)),already=Number(used?.quantity||0),freeAlready=Number(used?.free||0),returnable=r3(Number(line.quantity_base)-already);
    if(base>returnable+0.0001)throw Error(`Supplier return quantity exceeds remaining received stock ${returnable} ${line.unit_label}`);
    if(base>Number(line.total_stock||0)+0.0001)throw Error('Insufficient stock on hand to return this quantity');
    const freeBase=r3(Math.min(base,Math.max(0,Number(line.free_quantity_base||0)-freeAlready))),paidBase=r3(base-freeBase),unitCost=Number(line.factor_to_base)>0?Number(line.unit_price)/Number(line.factor_to_base):0,amount=r2(paidBase*unitCost);
    prepared.push({lineId,itemId:line.item_id,qty,base,freeBase,unitLabel:line.unit_label,factor:Number(line.unit_factor),unitCost,amount,stock:Number(line.total_stock||0)});total+=amount;
  }
  total=r2(total);const dueReduction=r2(Math.min(total,Math.max(0,Number(invoice.total_due||0)))),credit=r2(total-dueReduction),now=nowIso(),id=uid();
  const returnNumber=String(p.p_return_number||`SUPRET-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`),returnDate=validDate(p.p_return_date)?p.p_return_date:new Date().toISOString().slice(0,10),reason=txt(p.p_reason,240);
  if(reason.length<3)throw Error('Supplier return reason is required');
  const header={id,store_id:storeId,purchase_invoice_id:invoiceId,supplier_id:invoice.party_id||null,return_number:returnNumber,return_date:returnDate,total_return_amount:total,due_reduction:dueReduction,supplier_credit:credit,reason,notes:txt(p.p_notes,2000)||null,idempotency_key:key,created_by:p.p_created_by||null,created_at:now};
  const stmts=[insert('supershop_supplier_returns',header)];
  for(const x of prepared){
    stmts.push(insert('supershop_supplier_return_items',{id:uid(),return_id:id,store_id:storeId,invoice_line_id:x.lineId,inventory_item_id:x.itemId,quantity:x.qty,quantity_base:x.base,free_quantity_base:x.freeBase,unit_label:x.unitLabel,unit_factor:x.factor,unit_cost_base:x.unitCost,total_amount:x.amount,created_at:now}));
    stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock-?,3),updated_at=? WHERE id=? AND store_id=?',[x.base,now,x.itemId,storeId]));
    stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
      SELECT ?,?,?,'supplier_return',-?,total_stock+?,total_stock,?,'supplier_return',?,?,?, ?,? FROM inventory_items WHERE id=? AND store_id=?`,[
      uid(),storeId,x.itemId,x.base,x.base,x.unitCost,id,reason,key+':line:'+x.lineId,p.p_created_by||null,now,x.itemId,storeId]));
  }
  stmts.push(stmt('UPDATE invoices SET total_due=MAX(0,total_due-?),updated_at=? WHERE id=? AND store_id=?',[dueReduction,now,invoiceId,storeId]));
  stmts.push(insert('supershop_operations',{id:uid(),store_id:storeId,operation_key:key,operation_type:'supplier_return',result_id:id,invoice_id:invoiceId,created_by:p.p_created_by||null,created_at:now}));
  await batch(env,stmts);
  return {...header,idempotent:false};
}

export async function d1SupershopPostExchange(env,p){
  const storeId=String(p.p_store_id||''),invoiceId=String(p.p_invoice_id||''),key=txt(p.p_idempotency_key,160),returned=Array.isArray(p.p_returned_items)?p.p_returned_items:[],newLines=Array.isArray(p.p_new_items)?p.p_new_items:[];
  if(key.length<12||returned.length<1||returned.length>100||newLines.length<1||newLines.length>100)throw Error('Exchange needs 1–100 returned items and 1–100 replacement items');
  const [prior]=await all(env,"SELECT operation_type,result_id FROM supershop_operations WHERE store_id=? AND operation_key=?",[storeId,key]);
  if(prior){if(prior.operation_type!=='exchange')throw Error('This operation key has already been used');const [old]=await all(env,'SELECT * FROM exchanges WHERE id=? AND store_id=?',[prior.result_id,storeId]);if(old)return {...old,idempotent:true};throw Error('Previous exchange could not be found');}
  const [invoice]=await all(env,"SELECT * FROM invoices WHERE id=? AND store_id=? AND kind='sale'",[invoiceId,storeId]);
  const [saleOp]=await all(env,"SELECT id FROM supershop_operations WHERE store_id=? AND invoice_id=? AND operation_type='sale'",[storeId,invoiceId]);
  if(!invoice||!saleOp)throw Error('Original invoice is not a Supershop sale in this shop');
  const reasons=new Set(['Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other']),conditions=new Set(['Sellable','Damaged','Defective']);
  const returnedItems=[],stockLeft=new Map();let returnedTotal=0;
  const seenReturned=new Set();
  for(const raw of returned){
    const lineId=String(raw.invoiceLineId||''),qty=r3(raw.quantity),reason=txt(raw.reason,80),reasonNote=txt(raw.reasonNote,240)||null,condition=String(raw.condition||'');
    if(!lineId||qty<=0||seenReturned.has(lineId))throw Error('Choose each sold line once and enter a positive exchange quantity');seenReturned.add(lineId);
    if(!reasons.has(reason))throw Error('Select a valid exchange reason');if(reason==='Other'&&!reasonNote)throw Error('A note is required for Other');if(!conditions.has(condition))throw Error('Select a valid returned condition');
    const [line]=await all(env,`SELECT il.id,il.invoice_id,il.item_id,il.quantity,il.unit_price,il.tax_percent,il.discount,sl.unit_label,sl.unit_factor,sl.unit_cost_base,ii.description,ii.total_stock
      FROM invoice_lines il JOIN supershop_invoice_lines sl ON sl.invoice_line_id=il.id AND sl.store_id=?
      JOIN inventory_items ii ON ii.id=il.item_id AND ii.store_id=? WHERE il.id=? AND il.invoice_id=?`,[storeId,storeId,lineId,invoiceId]);
    if(!line)throw Error('Returned item does not belong to the selected invoice');
    const [used]=await all(env,`SELECT COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.invoice_line_id=? AND r.store_id=?),0)
      +COALESCE((SELECT SUM(ei.quantity) FROM exchange_items ei JOIN exchanges e ON e.id=ei.exchange_id WHERE ei.invoice_line_id=? AND ei.item_type='returned' AND e.store_id=?),0) AS quantity`,[lineId,storeId,lineId,storeId]);
    const canReturn=r3(Number(line.quantity)-Number(used?.quantity||0));if(qty>canReturn+0.0001)throw Error(`Exchange quantity exceeds remaining returnable quantity ${canReturn}`);
    const base=r3(qty*Number(line.unit_factor)),sub=r2(qty*Number(line.unit_price)),taxPct=Number(line.tax_percent??invoice.tax_percent??0),tax=r2(sub*taxPct/100);
    const lineDisc=Number(line.quantity)>0?r2(Number(line.discount||0)*qty/Number(line.quantity)):0,invoiceDisc=Number(invoice.subtotal)>0?r2(Number(invoice.discount||0)*sub/Number(invoice.subtotal)):0,discount=r2(lineDisc+invoiceDisc),amount=Math.max(0,r2(sub+tax-discount));
    const item={lineId,itemId:line.item_id,qty,base,unitLabel:line.unit_label,factor:Number(line.unit_factor),unitCost:Number(line.unit_cost_base||0),unitPrice:Number(line.unit_price),taxPct,tax,discount,amount,reason,reasonNote,condition,stock:Number(line.total_stock||0)};
    returnedItems.push(item);returnedTotal+=amount;
    if(condition==='Sellable'){
      const before=stockLeft.has(item.itemId)?stockLeft.get(item.itemId):item.stock;stockLeft.set(item.itemId,r3(before+base));
    }
  }
  const priceOverride=p.p_allow_price_override!==false,newItems=[];let newSubtotal=0,newTax=0,newDiscount=0,newTotal=0;
  for(const raw of newLines){
    const productId=String(raw.productId||''),unitLabel=txt(raw.unitLabel,60).toLowerCase(),qty=r3(raw.quantity);
    if(!productId||!unitLabel||qty<=0)throw Error('Choose a replacement product, unit and positive quantity');
    const [row]=await all(env,`SELECT i.id,i.item_code,i.description,i.unit,i.sale_price,i.total_stock,i.active AS item_active,
      sp.average_cost_base,sp.tax_percent AS product_tax,sp.mrp_per_base,sp.active AS product_active,
      u.unit_label,u.factor_to_base,u.allow_fractional,u.can_sell,u.selling_price AS unit_selling_price
      FROM inventory_items i JOIN supershop_products sp ON sp.inventory_item_id=i.id AND sp.store_id=i.store_id
      JOIN supershop_product_units u ON u.inventory_item_id=i.id AND u.store_id=i.store_id
      WHERE i.id=? AND i.store_id=? AND lower(u.unit_label)=lower(?)`,[productId,storeId,unitLabel]);
    if(!row||!row.item_active||!row.product_active||!row.can_sell)throw Error('Replacement product or unit is unavailable in this shop');
    if(!row.allow_fractional&&!Number.isInteger(qty))throw Error('Replacement unit does not allow decimal quantities');
    const factor=Number(row.factor_to_base),base=r3(qty*factor),available=stockLeft.has(productId)?stockLeft.get(productId):Number(row.total_stock||0);
    if(available<base-0.0001)throw Error(`Insufficient stock for replacement product ${row.description}`);stockLeft.set(productId,r3(available-base));
    let unitPrice;
    if(priceOverride)unitPrice=raw.unitPrice==null||raw.unitPrice===''?(row.unit_selling_price==null?Number(row.sale_price)*factor:Number(row.unit_selling_price)):Number(raw.unitPrice);
    else unitPrice=row.unit_selling_price==null?Number(row.sale_price)*factor:Number(row.unit_selling_price);
    const taxPercent=raw.taxPercent==null||raw.taxPercent===''?Number(row.product_tax||0):Number(raw.taxPercent),discount=r2(raw.discount||0),subtotal=r2(qty*unitPrice),tax=r2(subtotal*taxPercent/100);
    if(!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(taxPercent)||taxPercent<0||taxPercent>100||discount<0||discount>subtotal+tax)throw Error('Replacement price, tax or discount is invalid');
    const item={productId,row,unitLabel,factor,qty,base,unitPrice,taxPercent,discount,subtotal,tax,total:r2(subtotal+tax-discount)};
    newItems.push(item);newSubtotal+=subtotal;newTax+=tax;newDiscount+=discount;newTotal+=item.total;
  }
  returnedTotal=r2(returnedTotal);newSubtotal=r2(newSubtotal);newTax=r2(newTax);newDiscount=r2(newDiscount);newTotal=r2(newTotal);
  const difference=r2(newTotal-returnedTotal),actionType=difference>0?'payment':difference<0?'refund':'even';
  const dueReduction=difference>=0?r2(Math.min(Number(invoice.total_due||0),returnedTotal)):r2(Math.min(Number(invoice.total_due||0),Math.max(0,returnedTotal-newTotal)));
  const refundPaid=Math.max(0,r2(returnedTotal-newTotal-dueReduction));
  let paymentMethod=actionType==='even'||(actionType==='refund'&&refundPaid===0)?'none':String(p.p_payment_method||'cash').toLowerCase();
  if((difference>0||refundPaid>0)&&!moneyMethod.has(paymentMethod))throw Error('Choose a valid exchange payment or refund method');
  const [customer]=invoice.party_id?await all(env,'SELECT name FROM customers WHERE id=? AND store_id=?',[invoice.party_id,storeId]):[];
  const now=nowIso(),id=uid(),exchangeNumber=String(p.p_exchange_number||`EXC-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`),exchangeDate=validDate(p.p_exchange_date)?p.p_exchange_date:new Date().toISOString().slice(0,10);
  const header={id,store_id:storeId,invoice_id:invoiceId,exchange_number:exchangeNumber,customer_id:invoice.party_id||null,customer_name:customer?.name||invoice.custom_party_name||'Walk-in Customer',exchange_date:exchangeDate,
    returned_total:returnedTotal,new_items_subtotal:newSubtotal,new_items_tax:newTax,new_items_discount:newDiscount,new_items_total:newTotal,difference_amount:difference,action_type:actionType,
    payment_method:paymentMethod,transaction_id:p.p_transaction_id||null,status:'completed',notes:txt(p.p_notes,2000)||null,created_by:p.p_created_by||null,verification_token:uid(),created_at:now,updated_at:now};
  const stmts=[insert('exchanges',header)];
  for(const x of returnedItems){
    const exchangeItemId=uid();
    stmts.push(insert('exchange_items',{id:exchangeItemId,exchange_id:id,item_type:'returned',invoice_line_id:x.lineId,item_id:x.itemId,quantity:x.qty,unit_price:x.unitPrice,tax_percent:x.taxPct,tax_amount:x.tax,discount:x.discount,total_amount:x.amount,reason:x.reason,reason_note:x.reasonNote,condition:x.condition,created_at:now}));
    stmts.push(insert('supershop_exchange_lines',{exchange_item_id:exchangeItemId,store_id:storeId,inventory_item_id:x.itemId,unit_label:x.unitLabel,unit_factor:x.factor,quantity_base:x.base,unit_cost_base:x.unitCost,created_at:now}));
    if(x.condition==='Sellable'){
      stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock+?,3),updated_at=? WHERE id=? AND store_id=?',[x.base,now,x.itemId,storeId]));
      stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
        SELECT ?,?,?,'exchange_in',?,total_stock-?,total_stock,?,'exchange',?,'Sellable exchange return',?,?,? FROM inventory_items WHERE id=? AND store_id=?`,[
        uid(),storeId,x.itemId,x.base,x.base,x.unitCost,id,key+':in:'+exchangeItemId,p.p_created_by||null,now,x.itemId,storeId]));
    }else{
      stmts.push(insert('supershop_stock_movements',{id:uid(),store_id:storeId,inventory_item_id:x.itemId,movement_type:x.condition==='Damaged'?'return_damaged':'return_defective',quantity_base:x.base,stock_before:x.stock,stock_after:x.stock,unit_cost_base:x.unitCost,reference_type:'exchange',reference_id:id,reason:`Quarantined exchange return (${x.condition})`,idempotency_key:key+':quarantine:'+exchangeItemId,created_by:p.p_created_by||null,created_at:now}));
    }
  }
  for(const x of newItems){
    const exchangeItemId=uid(),cost=Number(x.row.average_cost_base||0);
    stmts.push(insert('exchange_items',{id:exchangeItemId,exchange_id:id,item_type:'new',invoice_line_id:null,item_id:x.productId,quantity:x.qty,unit_price:x.unitPrice,tax_percent:x.taxPercent,tax_amount:x.tax,discount:x.discount,total_amount:x.total,reason:null,reason_note:null,condition:'Sellable',created_at:now}));
    stmts.push(insert('supershop_exchange_lines',{exchange_item_id:exchangeItemId,store_id:storeId,inventory_item_id:x.productId,unit_label:x.unitLabel,unit_factor:x.factor,quantity_base:x.base,unit_cost_base:cost,created_at:now}));
    stmts.push(stmt('UPDATE inventory_items SET total_stock=ROUND(total_stock-?,3),updated_at=? WHERE id=? AND store_id=?',[x.base,now,x.productId,storeId]));
    stmts.push(stmt(`INSERT INTO supershop_stock_movements(id,store_id,inventory_item_id,movement_type,quantity_base,stock_before,stock_after,unit_cost_base,reference_type,reference_id,reason,idempotency_key,created_by,created_at)
      SELECT ?,?,?,'exchange_out',-?,total_stock+?,total_stock,?,'exchange',?,'Replacement item issued',?,?,? FROM inventory_items WHERE id=? AND store_id=?`,[
      uid(),storeId,x.productId,x.base,x.base,cost,id,key+':out:'+exchangeItemId,p.p_created_by||null,now,x.productId,storeId]));
  }
  stmts.push(stmt('UPDATE invoices SET total_due=MAX(0,total_due-?),updated_at=? WHERE id=? AND store_id=?',[dueReduction,now,invoiceId,storeId]));
  stmts.push(insert('supershop_exchange_settlements',{exchange_id:id,store_id:storeId,due_reduction:dueReduction,payment_received:Math.max(0,difference),refund_paid:refundPaid,created_at:now}));
  stmts.push(insert('supershop_operations',{id:uid(),store_id:storeId,operation_key:key,operation_type:'exchange',result_id:id,invoice_id:invoiceId,created_by:p.p_created_by||null,created_at:now}));
  await batch(env,stmts);
  return {...header,idempotent:false,due_reduction:dueReduction,refund_paid:refundPaid};
}
