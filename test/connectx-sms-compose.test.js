import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {SMS_TEMPLATE_EVENT,previewShopSms} from '../assets/js/shop_sms_preview.js';

const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const composeSource=app.slice(app.indexOf('  async function smsCompose('),app.indexOf('  async function smsHistory(){'));
const invoice1={id:'00000001-1111-4111-8111-000000000001',invoice_number:'SAL-100',invoice_date:'2026-10-20',document_type:'sale',party_id:'00000001-1111-4111-8111-000000000010',subtotal:100,paid_amount:60,total_due:48,tax_amount:10,line_tax_amount:2,discount:4,line_discount_amount:0,custom_party_phone:null};
const invoice2={...invoice1,id:'00000001-1111-4111-8111-000000000002',invoice_number:'SAL-101',party_id:'00000001-1111-4111-8111-000000000011',paid_amount:20,total_due:80};
const contacts=[{id:invoice1.party_id,name:'Buyer One',phone:'01700123456'},{id:invoice2.party_id,name:'Buyer Two',phone:'01700987654'}];
const template='Dear {name}: {shop} sale {invoice}, total {total}, paid {paid}, due {due}, amount {amount}.';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function mountedCompose(){
 const dom=new JSDOM('<!doctype html><div id="connectxSmsContent"></div><div id="smsFeedbackBanner"></div>',{url:'https://ems.test/'});
 const prior=globalThis.document;globalThis.document=dom.window.document;
 const requests=[],notices=[],$=selector=>dom.window.document.querySelector(selector);
 const api=async(path,options)=>{
  requests.push([path,options]);
  if(path.startsWith('connectx/contacts'))return contacts;
  if(path.startsWith('connectx/invoices')){
   const filter=new URL('https://ems.test/?'+path.split('?')[1]).searchParams.get('party_id');
   return filter?[invoice1,invoice2].filter(inv=>inv.party_id===filter):[invoice1,invoice2];
  }
  if(path==='connectx/sms/send')return {request_id:'SMS-1',status:'PENDING'};
  throw Error('Unexpected request: '+path);
 };
 const build=new Function('$','api','state','getSmsStats','SMS_TEMPLATE_EVENT','previewShopSms','lucide','canAccess','esc','shortId','generateSmsTemplate','toast','SMS_MESSAGE_TYPES',composeSource+'\nreturn smsCompose;');
 const compose=build($,api,{store:{name:'Saved Shop'}},value=>({length:value.length,parts:1,maxPerPart:160,isUnicode:false,remaining:160-value.length}),SMS_TEMPLATE_EVENT,previewShopSms,()=>'',()=>true,v=>String(v??'').replace(/[&<>"']/g,''),id=>id.slice(0,4),()=> 'Hello',notice=>notices.push(notice),{customer:['Sales Invoice Confirmation','Due Invoice Reminder','Exchange Invoice Confirmation','Return Invoice Confirmation','Custom Message'],supplier:['Purchase Invoice Confirmation','Custom Message'],staff:['Custom Message']});
 return {dom,$,compose,requests,notices,close(){globalThis.document=prior;dom.window.close()}};
}

test('shop Compose displays the saved sale template after selecting an invoice, fills its contact, and queues the reviewed body',async()=>{
 const f=mountedCompose();try{
  await f.compose(true,true,true,{templates:{SALE:template,DUE_REMINDER:'Reminder {invoice}: {due}'}});await tick();
  assert.equal(f.$('#smsInvoiceSelect').value,invoice1.id);
  assert.equal(f.$('#smsBody').value,'Dear Buyer One: Saved Shop sale SAL-100, total 108.00, paid 60.00, due 48.00, amount 60.00.');
  assert.match(f.$('#smsTemplateSource').textContent,/Saved shop template/);
  assert.equal(f.$('#smsTo').value,'01700123456');
  f.$('#smsInvoiceSelect').value=invoice2.id;f.$('#smsInvoiceSelect').dispatchEvent(new f.dom.window.Event('change'));
  assert.match(f.$('#smsBody').value,/Buyer Two: Saved Shop sale SAL-101/);
  assert.equal(f.$('#smsTo').value,'01700987654','changing the invoice cannot retain the previous customer’s phone');
  f.$('#smsSendBtn').click();await tick();
  const send=f.requests.find(([path])=>path==='connectx/sms/send');assert.ok(send);
  assert.equal(JSON.parse(send[1].body).messageBody,'Dear Buyer Two: Saved Shop sale SAL-101, total 108.00, paid 20.00, due 80.00, amount 20.00.');
 }finally{f.close()}
});

test('shop Compose never substitutes a different customer’s invoice and does not reuse a stale template',async()=>{
 const f=mountedCompose();try{
  await f.compose(true,true,true,{templates:{SALE:template}});await tick();
  f.$('#smsContactSearch').value='Buyer One — 01700123456';f.$('#smsContactSearch').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.equal(f.$('#smsInvoiceSelect').options.length,2,'only the selected customer’s invoice is offered');
  f.$('#smsRecType').value='supplier';f.$('#smsRecType').dispatchEvent(new f.dom.window.Event('change'));await tick();
  f.$('#smsMsgType').value='Custom Message';f.$('#smsMsgType').dispatchEvent(new f.dom.window.Event('change'));await tick();
  assert.equal(f.$('#smsInvoiceSelect').value,'');assert.equal(f.$('#smsBody').value,'Hello');
 }finally{f.close()}
});

test('saved SMS placeholder rendering preserves unknown text and sale totals include invoice-level tax/discount',()=>{
 assert.equal(SMS_TEMPLATE_EVENT['Sales Invoice Confirmation'],'SALE');
 assert.equal(previewShopSms('{invoice}: {total}, {unknown}',invoice1,contacts[0],'Saved Shop','SALE'),'SAL-100: 108.00, {unknown}');
});
