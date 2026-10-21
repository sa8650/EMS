import {db} from './db.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const r2=value=>Math.round((num(value)+Number.EPSILON)*100)/100;
const r3=value=>Math.round((num(value)+Number.EPSILON)*1000)/1000;
const total=invoice=>r2(num(invoice.subtotal)+num(invoice.line_tax_amount)+num(invoice.tax_amount)-num(invoice.discount)-num(invoice.line_discount_amount));
const date=value=>String(value||'').slice(0,10);
const sum=(rows,key)=>r2(rows.reduce((v,row)=>v+num(typeof key==='function'?key(row):row[key]),0));
const unique=rows=>[...new Set(rows.filter(Boolean))];
const idIn=ids=>`in.(${ids.join(',')})`;
async function paged(env,path,max=5000,guard=()=>{}){
 const out=[];for(let offset=0;;offset+=500){guard();const batch=await db(env,`${path}${path.includes('?')?'&':'?'}limit=500&offset=${offset}`);out.push(...batch);if(batch.length<500)break;if(out.length>=max)throw Error('Report data exceeds the safe request size. Select a shorter date range.')}return out;
}
async function byIds(env,table,column,ids,storeId,select='*',guard=()=>{}){
 const result=[];for(let i=0;i<ids.length;i+=80){guard();result.push(...await db(env,`${table}?${column}=${idIn(ids.slice(i,i+80))}${storeId?'&store_id=eq.'+storeId:''}&select=${select}`))}return result;
}
function prevPeriod(from,to){const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z'),days=Math.round((end-start)/86400000)+1;return {from:new Date(start-days*86400000).toISOString().slice(0,10),to:new Date(start-86400000).toISOString().slice(0,10)};}
export async function loadPharmacyAnalytics(env,storeId,from,to,context){
 const prev=prevPeriod(from,to),first=prev.from;let count=0;
 const guard=()=>{if(++count>40)throw Error('This report exceeds the Cloudflare request budget. Select a shorter date range or fewer filters.')}
 const get=path=>paged(env,path,5000,guard),ids=(table,column,keys,select='*',scoped=true)=>byIds(env,table,column,keys,scoped?storeId:null,select,guard);
 const [ops,allInvoices,returns,supplierReturns,expenses,recoveries,movements,quarantineRows,batches,suppliers,customers]=await Promise.all([
  get(`pharmacy_operations?store_id=eq.${storeId}&operation_type=in.(sale,purchase)&select=invoice_id,operation_type`),
  get(`invoices?store_id=eq.${storeId}&select=id,kind,invoice_number,invoice_date,party_id,custom_party_name,subtotal,line_tax_amount,tax_amount,discount,line_discount_amount,paid_amount,total_due,created_at&order=invoice_date.desc`),
  get(`pharmacy_returns?store_id=eq.${storeId}&return_date=gte.${first}&return_date=lte.${to}&select=*`),
  get(`pharmacy_supplier_return_headers?store_id=eq.${storeId}&return_date=gte.${first}&return_date=lte.${to}&select=*`),
  get(`expenses?store_id=eq.${storeId}&expense_date=gte.${first}&expense_date=lte.${to}&select=*`),
  get(`due_recoveries?store_id=eq.${storeId}&select=*`),
  get(`pharmacy_stock_movements?store_id=eq.${storeId}&created_at=gte.${first}&created_at=lt.${to}T23:59:59.999Z&select=*&order=created_at.desc`),
  get(`pharmacy_return_items?store_id=eq.${storeId}&restocked=eq.false&condition=in.(damaged,defective,expired,quarantined,recalled)&select=id,return_id,product_id,invoice_line_id,quantity_base,condition,created_at`),
  get(`pharmacy_batches?store_id=eq.${storeId}&quantity_on_hand_base=gt.0&select=id,product_id,batch_number,expiry_date,quantity_on_hand_base,unit_cost`),
  get(`suppliers?store_id=eq.${storeId}&select=id,name`),
  get(`customers?store_id=eq.${storeId}&select=id,name`),
 ]);
 const kinds=Object.fromEntries(ops.map(x=>[x.invoice_id,x.operation_type]));
 const invoices=allInvoices.filter(x=>kinds[x.id]===x.kind);
 const relevant=invoices.filter(x=>date(x.invoice_date)>=first&&date(x.invoice_date)<=to);
 const lines=await ids('invoice_lines','invoice_id',relevant.map(x=>x.id),'id,invoice_id,item_id,quantity,unit_price,line_total,cost_price',false);
 const ext=await ids('pharmacy_invoice_lines','invoice_line_id',lines.map(x=>x.id),'invoice_line_id,product_id,unit_factor,quantity_base,unit_cost_base');
 const returnItems=await ids('pharmacy_return_items','return_id',returns.map(x=>x.id),'id,return_id,invoice_line_id,product_id,quantity_base,amount,restocked,condition');
 const exchangeItems=await ids('pharmacy_exchange_items','exchange_id',returns.filter(x=>x.return_type==='exchange').map(x=>x.id),'id,exchange_id,product_id,quantity_base,amount');
 const supplierLines=await ids('pharmacy_supplier_return_lines','return_id',supplierReturns.map(x=>x.id),'id,return_id,invoice_line_id,product_id,quantity_base,amount,quarantine_item_id');
 const quarantineUsed=await ids('pharmacy_supplier_return_lines','quarantine_item_id',quarantineRows.map(x=>x.id),'quarantine_item_id,quantity_base');
 const oldCosts=await ids('pharmacy_invoice_lines','invoice_line_id',unique([...returnItems.map(x=>x.invoice_line_id),...quarantineRows.map(x=>x.invoice_line_id)]),'invoice_line_id,unit_cost_base');
 return {from,to,previous:prev,products:context.products,invoices,lines,extensions:ext,returns,returnItems,exchangeItems,supplierReturns,supplierLines,expenses,recoveries,movements,quarantineRows,quarantineUsed,oldCosts,batches,suppliers,customers};
}

export function buildPharmacyAnalytics(raw,filters={}){
 const {from,to,previous}=raw,productMap=Object.fromEntries(raw.products.map(p=>[p.id,p]));
 const category=String(filters.category||''),medicine=String(filters.medicine||''),supplier=String(filters.supplier||'');
 const selected=p=>!!p&&(!category||p.category===category)&&(!medicine||p.id===medicine);
 const ext=Object.fromEntries(raw.extensions.map(x=>[x.invoice_line_id,x])),productForLine=l=>productMap[ext[l.id]?.product_id];
 const supplierMap=Object.fromEntries(raw.suppliers.map(x=>[x.id,x.name])),customerMap=Object.fromEntries(raw.customers.map(x=>[x.id,x.name]));
 const scopedInvoices=raw.invoices.filter(i=>!supplier||i.kind!=='purchase'||i.party_id===supplier);
 const invoiceMap=Object.fromEntries(scopedInvoices.map(x=>[x.id,x]));
 const lineByInvoice={};for(const line of raw.lines)(lineByInvoice[line.invoice_id]??=[]).push(line);
 const lineMap=Object.fromEntries(raw.lines.map(x=>[x.id,x]));
 const rowAmount=(i,filteredLines)=>{
  if(!category&&!medicine)return total(i);
  const all=lineByInvoice[i.id]||[],gross=sum(all,'line_total');
  return gross?r2(total(i)*sum(filteredLines,'line_total')/gross):0;
 };
 const relevantLines=i=>(lineByInvoice[i.id]||[]).filter(l=>selected(productForLine(l)));
 const matched=i=>!category&&!medicine||relevantLines(i).length>0;
 const invoiceRows=scopedInvoices.filter(matched).map(i=>{
  const value=rowAmount(i,relevantLines(i)),productNames=unique(relevantLines(i).map(l=>productForLine(l)?.name));
  return {id:i.id,kind:i.kind,date:date(i.invoice_date),reference:i.invoice_number,party:i.kind==='sale'?customerMap[i.party_id]||i.custom_party_name||'Walk-in':supplierMap[i.party_id]||i.custom_party_name||'Walk-in supplier',supplier_id:i.party_id||'',medicine:productNames.join(', '),category:unique(relevantLines(i).map(l=>productForLine(l)?.category)).join(', '),amount:value,paid:!category&&!medicine?num(i.paid_amount):r2(num(i.paid_amount)*value/Math.max(total(i),0.000001)),due:!category&&!medicine?num(i.total_due):r2(num(i.total_due)*value/Math.max(total(i),0.000001)),discount:num(i.discount)+num(i.line_discount_amount),status:num(i.total_due)>0?'Due':'Paid',_raw:i};
 });
 const inPeriod=(value,a=from,b=to)=>date(value)>=a&&date(value)<=b;
 const periodRows=invoiceRows.filter(x=>inPeriod(x.date)),prevRows=invoiceRows.filter(x=>inPeriod(x.date,previous.from,previous.to));
 const saleRows=periodRows.filter(x=>x.kind==='sale'),purchaseRows=periodRows.filter(x=>x.kind==='purchase');
 const pSales=prevRows.filter(x=>x.kind==='sale'),pPurchases=prevRows.filter(x=>x.kind==='purchase');
 const saleCost=window=>{
  const ids=new Set(window.filter(x=>x.kind==='sale').map(x=>x.id));
  return sum(raw.lines.filter(l=>ids.has(l.invoice_id)&&selected(productForLine(l))),l=>num(l.cost_price)*num(l.quantity));
 };
 const medicineStats={};for(const l of raw.lines){const invoice=invoiceMap[l.invoice_id],p=productForLine(l);if(!invoice||invoice.kind!=='sale'||!inPeriod(invoice.invoice_date)||!selected(p))continue;
  const g=medicineStats[p.id]??(medicineStats[p.id]={product_id:p.id,medicine:p.name,category:p.category||'Uncategorized',units_sold:0,revenue:0,cogs:0});
  const all=lineByInvoice[invoice.id]||[],gross=sum(all,'line_total');g.revenue+=gross?total(invoice)*num(l.line_total)/gross:0;g.cogs+=num(l.cost_price)*num(l.quantity);g.units_sold+=num(ext[l.id]?.quantity_base);
 }
 const costMap=Object.fromEntries(raw.oldCosts.map(x=>[x.invoice_line_id,num(x.unit_cost_base)]));
 const returnItems={};for(const item of raw.returnItems)(returnItems[item.return_id]??=[]).push(item);
 const exchangeItems={};for(const item of raw.exchangeItems)(exchangeItems[item.exchange_id]??=[]).push(item);
 const allowedReturn=r=>!supplier&&(!category&&!medicine||(returnItems[r.id]||[]).some(it=>selected(productMap[it.product_id])));
 const returnRows=raw.returns.filter(allowedReturn).map(r=>{
  const items=returnItems[r.id]||[],replacement=exchangeItems[r.id]||[],selectedItems=items.filter(it=>selected(productMap[it.product_id]));
  const allAmount=sum(items,'amount'),matchingAmount=sum(selectedItems,'amount');
  const proportion=(!category&&!medicine)?1:(allAmount>0?matchingAmount/allAmount:items.length?selectedItems.length/items.length:0);
  // Quarantine intake alone is not a cash refund. Only posted settlement reduces revenue.
  const refund=num(r.refund_amount)>0?num(r.refund_amount):r.return_type==='return'&&r.refund_method&&r.refund_method!=='none'?num(r.amount):0;
  const difference=r.return_type==='exchange'?num(r.difference_amount):0;
  const reversal=sum(selectedItems.filter(it=>it.restocked),it=>num(it.quantity_base)*num(costMap[it.invoice_line_id]));
  const replacementCost=sum(replacement.filter(it=>selected(productMap[it.product_id])),it=>num(it.quantity_base)*num(productMap[it.product_id]?.average_cost_base));
  return {id:r.id,date:date(r.return_date||r.created_at),reference:r.return_number,invoice:r.invoice_id,kind:r.return_type||'return',medicine:unique(selectedItems.map(it=>productMap[it.product_id]?.name)).join(', '),category:unique(selectedItems.map(it=>productMap[it.product_id]?.category)).join(', '),quantity:sum(selectedItems,'quantity_base'),amount:r2(num(r.amount)*proportion),refund:r2(refund*proportion),difference:r2(difference*proportion),reversed_cogs:reversal,replacement_cogs:replacementCost,condition:unique(selectedItems.map(it=>it.condition)).join(', '),status:r.settlement_type||'Recorded'};
 });
 const retNow=returnRows.filter(x=>inPeriod(x.date)),retPrev=returnRows.filter(x=>inPeriod(x.date,previous.from,previous.to));
 const supplierLines={};for(const line of raw.supplierLines)(supplierLines[line.return_id]??=[]).push(line);
 const purchaseReturns=raw.supplierReturns.filter(r=>!supplier||r.supplier_id===supplier).map(r=>{
  const all=supplierLines[r.id]||[],parts=all.filter(x=>selected(productMap[x.product_id]));if((category||medicine)&&!parts.length)return null;
  return {id:r.id,date:date(r.return_date),reference:r.return_number,invoice:r.purchase_invoice_id,supplier:supplierMap[r.supplier_id]||'Walk-in supplier',supplier_id:r.supplier_id||'',medicine:unique(parts.map(x=>productMap[x.product_id]?.name)).join(', '),category:unique(parts.map(x=>productMap[x.product_id]?.category)).join(', '),quantity:sum(parts,'quantity_base'),amount:(!category&&!medicine)?num(r.amount):sum(parts,'amount'),due_reduction:(!category&&!medicine)?num(r.due_reduction):r2(num(r.due_reduction)*sum(parts,'amount')/Math.max(num(r.amount),0.000001)),source:parts.some(x=>x.quarantine_item_id)?'Includes quarantine':'Saleable stock',quarantine_recovery:sum(parts.filter(x=>x.quarantine_item_id),'amount'),settlement:r.settlement_method};
 }).filter(Boolean);
 const returnedNow=purchaseReturns.filter(x=>inPeriod(x.date)),returnedPrev=purchaseReturns.filter(x=>inPeriod(x.date,previous.from,previous.to));
 const expenseRows=raw.expenses.filter(x=>inPeriod(x.expense_date)).map(x=>({id:x.id,date:date(x.expense_date),reference:x.expense_code,details:x.details,amount:num(x.total),paid:num(x.paid),due:num(x.due)}));
 const prevExpense=raw.expenses.filter(x=>inPeriod(x.expense_date,previous.from,previous.to));
 const recoveryRows=raw.recoveries.filter(x=>inPeriod(x.created_at)).map(x=>({id:x.id,date:date(x.created_at),source_type:x.source_type,source_id:x.source_id,amount:num(x.amount),method:x.payment_method||'—'}));
 const prevRecoveries=raw.recoveries.filter(x=>inPeriod(x.created_at,previous.from,previous.to));
 const inventory=raw.products.filter(selected).map(p=>({id:p.id,medicine:p.name,category:p.category||'Uncategorized',sku:p.sku||'',quantity:num(p.total_stock),unit:p.base_unit||'unit',cost:num(p.average_cost_base),value:r2(num(p.total_stock)*num(p.average_cost_base)),threshold:num(p.reorder_threshold),status:!p.active?'Inactive':num(p.total_stock)<=0?'Out of stock':num(p.total_stock)<=num(p.reorder_threshold)?'Low stock':'Available'}));
 const used={};for(const line of raw.quarantineUsed)used[line.quarantine_item_id]=r3(num(used[line.quarantine_item_id])+num(line.quantity_base));
 const quarantine=raw.quarantineRows.filter(x=>selected(productMap[x.product_id])).map(x=>{const qty=r3(Math.max(0,num(x.quantity_base)-num(used[x.id])));return {id:x.id,date:date(x.created_at),medicine:productMap[x.product_id]?.name||'Medicine',category:productMap[x.product_id]?.category||'',quantity:qty,unit:productMap[x.product_id]?.base_unit||'unit',condition:x.condition,cost:num(costMap[x.invoice_line_id]??productMap[x.product_id]?.average_cost_base),value:r2(qty*num(costMap[x.invoice_line_id]??productMap[x.product_id]?.average_cost_base))}}).filter(x=>x.quantity>0);
 const today=to,warning=new Date(Date.parse(today+'T00:00:00Z')+30*86400000).toISOString().slice(0,10);
 const expiry=raw.batches.filter(x=>selected(productMap[x.product_id])&&x.expiry_date&&date(x.expiry_date)<=warning).map(x=>({id:x.id,medicine:productMap[x.product_id]?.name||'Medicine',batch:x.batch_number||'—',expiry:date(x.expiry_date),quantity:num(x.quantity_on_hand_base),status:date(x.expiry_date)<today?'Expired (legacy batch)':'Near expiry (legacy batch)'}));
 const movements=raw.movements.filter(x=>inPeriod(x.created_at)&&selected(productMap[x.product_id])).map(x=>({id:x.id,date:date(x.created_at),medicine:productMap[x.product_id]?.name||'Medicine',type:x.movement_type,quantity:num(x.quantity_base),before:num(x.stock_before),after:num(x.stock_after),reference:x.reference_type||'—'}));
 const grossSales=sum(saleRows,'amount'),grossPurchases=sum(purchaseRows,'amount'),refunds=sum(retNow.filter(x=>x.kind==='return'),'refund'),exchangeDelta=sum(retNow.filter(x=>x.kind==='exchange'),'difference');
 const historicalRecoveries={};for(const x of raw.recoveries){const key=x.source_type+':'+x.source_id;historicalRecoveries[key]=r2(num(historicalRecoveries[key])+num(x.amount))}
 const originalPaid=(row,kind)=>Math.max(0,num(row.paid)-num(historicalRecoveries[kind+':'+row.id])*(category||medicine?num(row.amount)/Math.max(total(row._raw),0.000001):1));
 const expensePaid=expenseRows.reduce((sum,x)=>sum+Math.max(0,num(x.paid)-num(historicalRecoveries['expense:'+x.id])),0);
 const reversed=sum(retNow,'reversed_cogs'),replacementCost=sum(retNow,'replacement_cogs'),quarantineRecovery=sum(returnedNow,'quarantine_recovery');
 const netRevenue=r2(grossSales-refunds+exchangeDelta),baseCogs=r2(saleCost(saleRows)-reversed+replacementCost),cogs=r2(baseCogs-quarantineRecovery),grossProfit=r2(netRevenue-cogs),expensesTotal=sum(expenseRows,'amount'),netProfit=r2(grossProfit-expensesTotal);
 const prevGrossSales=sum(pSales,'amount'),prevRevenue=r2(prevGrossSales-sum(retPrev.filter(x=>x.kind==='return'),'refund')+sum(retPrev.filter(x=>x.kind==='exchange'),'difference'));
 const prevGrossProfit=r2(prevRevenue-saleCost(pSales)+sum(retPrev,'reversed_cogs')-sum(retPrev,'replacement_cogs')+sum(returnedPrev,'quarantine_recovery'));
 const prevNetProfit=r2(prevGrossProfit-sum(prevExpense,'total'));
 const customerDues=invoiceRows.filter(x=>x.kind==='sale'&&x.due>0).map(x=>({id:x.id,date:x.date,reference:x.reference,party:x.party,amount:x.amount,paid:x.paid,due:x.due}));
 const supplierDues=invoiceRows.filter(x=>x.kind==='purchase'&&x.due>0).map(x=>({id:x.id,date:x.date,reference:x.reference,party:x.party,amount:x.amount,paid:x.paid,due:x.due,type:'Outstanding'}));
 const supplierPayments=recoveryRows.filter(x=>x.source_type==='purchase').map(x=>{const inv=invoiceRows.find(i=>i.id===x.source_id&&i.kind==='purchase');return {id:x.id,date:x.date,reference:inv?.reference||x.source_id,party:inv?.party||'Supplier',amount:null,paid:x.amount,due:inv?.due??null,type:'Payment'}}).filter(x=>!supplier||invoiceRows.some(i=>i.id===raw.recoveries.find(r=>r.id===x.id)?.source_id&&i.kind==='purchase'));
 const customerRecoveries=recoveryRows.filter(x=>x.source_type==='sale').map(x=>{const inv=invoiceRows.find(i=>i.id===x.source_id&&i.kind==='sale');return {id:x.id,date:x.date,reference:inv?.reference||x.source_id,party:inv?.party||'Customer',amount:null,paid:x.amount,due:inv?.due??null,type:'Recovery'}});
 const metrics={sales:grossSales,purchasesGross:grossPurchases,purchases:r2(grossPurchases-sum(returnedNow,'amount')),salesDue:sum(customerDues,'due'),purchaseDue:sum(supplierDues,'due'),recovered:sum(recoveryRows.filter(x=>x.source_type==='sale'),'amount'),expenses:expensesTotal,stockValue:sum(inventory,'value'),quarantineValue:sum(quarantine,'value'),grossProfit,netProfit,netRevenue,cogs,refunds,purchaseReturns:sum(returnedNow,'amount'),quarantineRecovery,exchangeDifference:exchangeDelta,cashReceived:r2(saleRows.reduce((v,x)=>v+originalPaid(x,'sale'),0)+sum(recoveryRows.filter(x=>x.source_type==='sale'),'amount')-refunds+exchangeDelta),cashPaid:r2(purchaseRows.reduce((v,x)=>v+originalPaid(x,'purchase'),0)+sum(recoveryRows.filter(x=>x.source_type==='purchase'||x.source_type==='expense'),'amount')+expensePaid)};
 const previousMetrics={sales:prevGrossSales,purchasesGross:sum(pPurchases,'amount'),purchases:r2(sum(pPurchases,'amount')-sum(returnedPrev,'amount')),grossProfit:prevGrossProfit,netProfit:prevNetProfit,expenses:sum(prevExpense,'total'),recovered:sum(prevRecoveries.filter(x=>x.source_type==='sale'),'amount')};
 const estimatedExchangeCost=retNow.some(x=>x.kind==='exchange'&&x.replacement_cogs>0);
 const medicinePerformance=raw.products.filter(selected).map(p=>medicineStats[p.id]||{product_id:p.id,medicine:p.name,category:p.category||'Uncategorized',units_sold:0,revenue:0,cogs:0}).map(x=>({...x,units_sold:r3(x.units_sold),revenue:r2(x.revenue),cogs:r2(x.cogs),profit:r2(x.revenue-x.cogs)})).sort((a,b)=>b.units_sold-a.units_sold);
 const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
 const buckets=new Map();for(let i=0;i<days;i++){const d=new Date(Date.parse(from+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);buckets.set(d,{date:d,sales:0,purchases:0,profit:0,grossProfit:0,expenses:0,recovery:0,movements:0})}
 const add=(d,key,value)=>{if(buckets.has(d))buckets.get(d)[key]+=num(value)};
 for(const x of saleRows){add(x.date,'sales',x.amount);add(x.date,'profit',x.amount);add(x.date,'grossProfit',x.amount)}for(const x of purchaseRows)add(x.date,'purchases',x.amount);
 for(const x of retNow){add(x.date,'sales',x.kind==='return'?-x.refund:x.difference);add(x.date,'profit',x.kind==='return'?-x.refund+x.reversed_cogs:x.difference+x.reversed_cogs-x.replacement_cogs);add(x.date,'grossProfit',x.kind==='return'?-x.refund+x.reversed_cogs:x.difference+x.reversed_cogs-x.replacement_cogs)}
 for(const x of returnedNow){add(x.date,'purchases',-x.amount);add(x.date,'grossProfit',x.quarantine_recovery);add(x.date,'profit',x.quarantine_recovery)}
 // Sale COGS uses the cost snapshot saved with each invoice line.
 for(const l of raw.lines){const i=invoiceMap[l.invoice_id];if(i?.kind==='sale'&&inPeriod(i.invoice_date)&&selected(productForLine(l))){add(date(i.invoice_date),'profit',-num(l.cost_price)*num(l.quantity));add(date(i.invoice_date),'grossProfit',-num(l.cost_price)*num(l.quantity))}}
 for(const x of expenseRows){add(x.date,'expenses',x.amount);add(x.date,'profit',-x.amount)}for(const x of recoveryRows)if(x.source_type==='sale')add(x.date,'recovery',x.amount);
 for(const x of movements)if(x.before!==x.after)add(x.date,'movements',x.quantity);
 const charts=[...buckets.values()].map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='date'?v:r2(v)])));
 const pnl=[{label:'Gross sales',amount:grossSales},{label:'Sales refunds',amount:-refunds},{label:'Exchange settlement difference',amount:exchangeDelta},{label:'Net sales revenue',amount:netRevenue},{label:'Cost of goods sold',amount:-baseCogs},{label:'Quarantine supplier recovery',amount:quarantineRecovery},{label:'Gross profit',amount:grossProfit},{label:'Operating expenses',amount:-expensesTotal},{label:'Net profit',amount:netProfit}];
 return {from,to,previous,metrics,previousMetrics,charts,estimatedExchangeCost,filters:{category,medicine,supplier},categories:unique(raw.products.map(p=>p.category)),medicines:raw.products.map(p=>({id:p.id,name:p.name})),suppliers:raw.suppliers,
  sections:{sales:saleRows,purchases:purchaseRows,pnl,valuation:inventory,lowStock:inventory.filter(x=>x.status==='Low stock'),outOfStock:inventory.filter(x=>x.status==='Out of stock'),expiry,quarantine,salesReturns:retNow.filter(x=>x.kind==='return'),purchaseReturns:returnedNow,exchanges:retNow.filter(x=>x.kind==='exchange'),customerDue:[...customerDues.map(x=>({...x,type:'Outstanding'})),...customerRecoveries],supplierDue:[...supplierDues,...supplierPayments],recovery:recoveryRows,expenses:expenseRows,bestSelling:medicinePerformance.filter(x=>x.units_sold>0),leastSelling:[...medicinePerformance].reverse(),movements},
  notes:{expiry:'Expiry tracking was retired from the current aggregate-stock model. These are legacy batch records only; they do not represent current saleable stock.',stock:'Stock and outstanding balances are current snapshots, not historical balances for the date filter. Quarantine is valued separately and excluded from saleable stock.',profit:'Gross profit uses saved sale-line weighted-average cost snapshots. Customer-return COGS reverses only when goods are restocked; quarantined goods retain the cost. Due recovery is cash collection, never a new sale.'}};
}
