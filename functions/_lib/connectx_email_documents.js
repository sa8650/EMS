/* Additional shop-scoped ConnectX document choices. Read-only: no invoice,
   payment, refund or stock movement is created by sending an email. */
import {db} from './db.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
const summary=(title,fields)=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #dddddd;font-family:Arial,sans-serif"><tr><td style="padding:18px;border-bottom:2px solid #111"><b>${esc(title)}</b></td></tr><tr><td style="padding:18px">${Object.entries(fields).map(([k,v])=>`<p style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}</td></tr></table>`;
export async function extraEmailDocuments(env,storeId,kind){
 if(kind==='due_reminder'){
  const rows=await db(env,`invoices?store_id=eq.${storeId}&kind=in.(sale,purchase)&total_due=gt.0&select=id,invoice_number,invoice_date,subtotal,paid_amount,total_due,party_id,kind&order=created_at.desc&limit=200`);
  return rows.map(i=>({id:i.id,invoice_number:i.invoice_number,subtotal:i.total_due,document_type:kind}));
 }
 if(kind==='payment'){
  const rows=await db(env,`due_recoveries?store_id=eq.${storeId}&source_type=in.(sale,purchase)&select=id,source_id,source_type,amount,created_at&order=created_at.desc&limit=200`);
  const ids=[...new Set(rows.map(x=>x.source_id).filter(uuid))];
  const invoices=ids.length?await db(env,`invoices?store_id=eq.${storeId}&id=in.(${ids.join(',')})&select=id,invoice_number`):[];
  const labels=new Map(invoices.map(i=>[i.id,i.invoice_number]));
  return rows.filter(r=>labels.has(r.source_id)).map(r=>({id:r.id,invoice_number:`${labels.get(r.source_id)} · payment ${new Date(r.created_at).toLocaleDateString('en-GB')}`,subtotal:r.amount,document_type:kind}));
 }
 if(kind==='refund'){
  const [returns,exchanges]=await Promise.all([
   db(env,`returns?store_id=eq.${storeId}&refunded_amount=gt.0&select=id,return_number,refunded_amount,return_date&order=created_at.desc&limit=100`),
   db(env,`exchanges?store_id=eq.${storeId}&action_type=eq.refund&status=eq.completed&difference_amount=gt.0&select=id,exchange_number,difference_amount,exchange_date&order=created_at.desc&limit=100`)
  ]);
  return [...returns.map(r=>({id:'return:'+r.id,invoice_number:r.return_number,subtotal:r.refunded_amount,document_type:kind})),...exchanges.map(e=>({id:'exchange:'+e.id,invoice_number:e.exchange_number,subtotal:e.difference_amount,document_type:kind}))];
 }
 return null;
}
export async function extraEmailDocument(env,storeId,kind,id,shopName){
 let ref,amount,date,method='',partyId=null,partyName='',partyTable='customers',invoiceId=null,detail='';
 if(kind==='payment'&&uuid(id)){
  const [row]=await db(env,`due_recoveries?id=eq.${id}&store_id=eq.${storeId}&source_type=in.(sale,purchase)&select=*`);
  if(!row)return null;
  const [inv]=await db(env,`invoices?id=eq.${row.source_id}&store_id=eq.${storeId}&select=id,invoice_number,total_due,party_id,kind`);
  if(!inv)return null;
  ref=inv.invoice_number;amount=row.amount;date=row.created_at;method=row.payment_method||'';partyId=inv.party_id;partyTable=inv.kind==='purchase'?'suppliers':'customers';invoiceId=inv.id;
  detail=`<p>Current invoice balance: <b>${esc(money(inv.total_due))} BDT</b></p>`;
 }else if(kind==='due_reminder'&&uuid(id)){
  const [inv]=await db(env,`invoices?id=eq.${id}&store_id=eq.${storeId}&kind=in.(sale,purchase)&total_due=gt.0&select=id,invoice_number,total_due,invoice_date,party_id,kind`);
  if(!inv)return null;
  ref=inv.invoice_number;amount=inv.total_due;date=inv.invoice_date;partyId=inv.party_id;partyTable=inv.kind==='purchase'?'suppliers':'customers';invoiceId=inv.id;
 }else if(kind==='refund'){
  const match=/^(return|exchange):([0-9a-f-]{36})$/i.exec(String(id||''));if(!match||!uuid(match[2]))return null;
  if(match[1]==='return'){
   const [ret]=await db(env,`returns?id=eq.${match[2]}&store_id=eq.${storeId}&refunded_amount=gt.0&select=id,return_number,refunded_amount,return_date,customer_id,invoice_id,refund_method`);
   if(!ret)return null;ref=ret.return_number;amount=ret.refunded_amount;date=ret.return_date;partyId=ret.customer_id;partyName=ret.customer_name||'';invoiceId=ret.invoice_id;method=ret.refund_method||'';
  }else{
   const [exc]=await db(env,`exchanges?id=eq.${match[2]}&store_id=eq.${storeId}&action_type=eq.refund&status=eq.completed&difference_amount=gt.0&select=id,exchange_number,difference_amount,exchange_date,customer_id,invoice_id,payment_method`);
   if(!exc)return null;ref=exc.exchange_number;amount=exc.difference_amount;date=exc.exchange_date;partyId=exc.customer_id;partyName=exc.customer_name||'';invoiceId=exc.invoice_id;method=exc.payment_method||'';
  }
 }else return null;
 if(partyId&&uuid(partyId)){const [party]=await db(env,`${partyTable}?id=eq.${partyId}&store_id=eq.${storeId}&select=name`);partyName=party?.name||partyName}
 return {invoiceId,html:summary({payment:'Payment receipt',due_reminder:'Due reminder',refund:'Refund confirmation'}[kind],{Shop:shopName,Reference:ref,Date:date,Amount:'BDT '+money(amount),...(method?{Method:method}:{})})+detail,values:{shop:shopName,name:partyName,reference:ref,date,total:money(amount),paid:kind==='payment'?money(amount):'',due:kind==='due_reminder'?money(amount):'',amount:money(amount),method}};
}
