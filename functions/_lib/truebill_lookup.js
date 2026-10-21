/* A printed invoice number is enumerable. Public number-only checks disclose
 * existence only: never customer, shop, line items, amounts, internal IDs or
 * the private verification token. Full details require the existing QR route. */
import {db} from './db.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function verifyPrintedInvoice(env,input){
 const number=String(input?.invoice_number||'').trim().toUpperCase();
 if(!/^(PUR|SAL)-[A-Z0-9-]{3,74}$/.test(number))return json({error:'Enter a valid PUR- or SAL- invoice number.'},400);
 // Query only the minimum fields. Never fetch or serialize the full document.
 const [invoice]=await db(env,`invoices?invoice_number=eq.${encodeURIComponent(number)}&select=invoice_number,kind&limit=1`);
 if(!invoice)return json({error:'No matching EMS invoice was found.'},404);
 return json({verified:true,record_type:'invoice',invoice_number:invoice.invoice_number,kind:invoice.kind,details_available:false});
}
