/* Interpret a TrueBill QR as a local EMS verification token. Never follow an
 * arbitrary QR URL or claim a record verified before EMS confirms it. */
export function truebillCode(value){
 const raw=String(value||'').trim();if(!raw||raw.length>2048)return null;
 let token=raw;
 if(/^https?:\/\//i.test(raw)||raw.startsWith('/')){
  try{const u=new URL(raw,'https://ems.invalid');token=u.searchParams.get('verify')||u.searchParams.get('invoice')||u.pathname.match(/^\/(?:verify|invoice)\/([^/]+)\/?$/)?.[1]||''}catch{return null}
 }
 try{token=decodeURIComponent(token)}catch{return null}
 return /^[a-zA-Z0-9_-]{8,160}$/.test(token)?token:null;
}
export function truebillSummary(response){
 if(!response?.verified)return null;
 const kind=response.record_type||response.type||'invoice';
 const record=kind==='return'?response.return:kind==='exchange'?response.exchange:response.invoice;
 if(!record)return null;
 return {kind:kind==='invoice'?(record.kind==='purchase'?'Purchase invoice':'Sale invoice'):kind==='return'?'Return slip':'Exchange invoice',
   shop:record.stores?.name||'EMS shop',number:record.invoice_number||record.return_number||record.exchange_number||'—',
   date:record.invoice_date||record.return_date||record.exchange_date||'',
   amount:record.total_return_amount??record.total_amount??(Number(record.subtotal||0)+Number(record.tax_amount||0)+Number(record.line_tax_amount||0)-Number(record.discount||0)-Number(record.line_discount_amount||0)),
   id:record.id||''};
}
