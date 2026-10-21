import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('phone QR sign-in is visible, independent of barcode scans, and never auto-selects a bill; public TrueBill renders full result',async()=>{
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://ems.example/scanner/',pretendToBeVisual:true});
 const originalInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 for(const key of ['document','history','sessionStorage','location'])globalThis[key]=dom.window[key];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.window=dom.window;
 globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};
 const kinds=[],draft='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',binding='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let nextQr=null,lookupCalls=0;
 class Detector{
  constructor({formats}){kinds.push(formats)}
  static async getSupportedFormats(){return ['qr_code','code_128','ean_13']}
  async detect(){const value=nextQr;nextQr=null;return value?[{rawValue:value}]:[]}
 }
 globalThis.BarcodeDetector=dom.window.BarcodeDetector=Detector;
 navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};dom.window.HTMLMediaElement.prototype.play=async()=>{};
 globalThis.fetch=async(url,opt={})=>{
  const path=new URL(url,location.origin).pathname;let data={};
  if(path.endsWith('/scanner/login/consume'))data={token:'testJwt',user:{name:'Clerk'},store:{name:'Gadget shop',shop_type:'electronics'}};
  else if(path.endsWith('/scanner/drafts'))data=[{draft_id:draft,terminal_label:'counter',kind:'purchase'}];
  else if(path.endsWith('/bind'))data={binding_id:binding,kind:'purchase'};
  else if(path.endsWith('/public/invoice/lookup')){lookupCalls++;data={verified:true,record_type:'invoice',invoice_number:'PUR-12345',kind:'purchase',details_available:false}}
  else if(path.startsWith('/api/public/invoice/'))data={verified:true,record_type:'invoice',invoice:{id:draft,kind:'purchase',invoice_number:'PUR-12345',stores:{name:'Shop One'},invoice_lines:[{quantity:2,unit_price:10,line_total:20,inventory_items:{description:'Medicine'}}],paid_amount:20,subtotal:20,total_due:0}}
  else if(path.endsWith('/status'))data={connected:true,kind:'purchase'};else if(path.endsWith('/sync'))data={connected:true,kind:'purchase',events:[]};
  else if(path.endsWith('/events'))data=[];
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  await import('../scanner/scanner.js');
  assert.ok(document.querySelector('#loginQrStart'));assert.ok(document.querySelector('#openVerifyPublic'));
  assert.ok(!document.body.textContent.includes('Install EMS Scanner'),'login has no installation instructions');
  document.querySelector('#openVerifyPublic').click();assert.ok(document.querySelector('#verifyCamera'),'guests can verify');document.querySelector('#verifyBack').click();
  assert.equal(document.querySelector('#accountMode').hidden,false);document.querySelector('#qrTab').click();assert.equal(document.querySelector('#qrMode').hidden,false);
  nextQr='https://ems.example/scanner/#login='+'a'.repeat(64);
  document.querySelector('#loginQrStart').click();
  for(let i=0;i<25&&!document.querySelector('#refreshDrafts');i++)await new Promise(r=>setTimeout(r,8));
  assert.ok(document.querySelector('#refreshDrafts'),'QR login reached dashboard');assert.deepEqual(kinds[0],['qr_code']);
  assert.match(document.querySelector('#app').textContent,/ELECTRONICS WORKSPACE/);assert.ok(!document.querySelector('#app').textContent.includes('Verify an invoice'),'the home verification card has been removed');
  assert.ok(document.querySelector('.tabs [data-view=verify]'),'TrueBill remains reachable from its own tab');
  assert.match(document.querySelector('#selectedDraft').textContent,/Choose a sale or purchase/);
  await new Promise(r=>setTimeout(r,10));document.querySelector('[data-select]').click();
  for(let i=0;i<15&&!document.querySelector('#selectedDraft')?.textContent.includes('Active draft');i++)await new Promise(r=>setTimeout(r,8));
  assert.match(document.querySelector('#selectedDraft').textContent,/Active draft/);
  document.querySelector('.tabs [data-view=camera]').click();document.querySelector('#startCam').click();await new Promise(r=>setTimeout(r,12));
  assert.ok(kinds.at(-1).includes('code_128'));assert.ok(!kinds.at(-1).includes('qr_code'),'barcode reader excludes QR');
  document.querySelector('.tabs [data-view=verify]').click();
  const number=document.querySelector('#verifyInput');number.value='PUR-12345';
  assert.equal(document.querySelector('#verifyProof'),null);
  document.querySelector('#verifyForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  for(let i=0;i<15&&!document.querySelector('#verifyResult').textContent.includes('Invoice number found');i++)await new Promise(r=>setTimeout(r,8));
  assert.equal(lookupCalls,1);assert.match(document.querySelector('#verifyResult').textContent,/Invoice number found/);assert.ok(!document.querySelector('#verifyResult').textContent.includes('Medicine'));
  nextQr='https://ems.example/?verify=12345678-1234-4234-8234-123456789012';document.querySelector('#verifyCamera').click();
  for(let i=0;i<25&&!document.querySelector('#verifyResult').textContent.includes('Medicine');i++)await new Promise(r=>setTimeout(r,8));
  assert.match(document.querySelector('#verifyResult').textContent,/Medicine/);assert.match(document.querySelector('#verifyResult').textContent,/Shop One/);
 }finally{globalThis.setInterval=originalInterval;dom.window.close()}
});
