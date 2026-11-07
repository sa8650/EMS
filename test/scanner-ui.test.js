import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

/* The scanner UI contract.
 *
 * This is a behaviour test, not a snapshot: it drives the real module with a
 * fake BarcodeDetector and a fake API, and asserts the guarantees that must
 * survive any restyle —
 *   · a guest can reach TrueBill verification and it stays separate from
 *     barcode scanning,
 *   · signing in by PC QR code reaches the workspace without auto-selecting a
 *     bill (the operator chooses the bill explicitly),
 *   · the barcode reader never asks the platform for QR codes,
 *   · a printed invoice number returns only the minimal public answer, while a
 *     scanned TrueBill QR returns the full document.
 */
test('phone QR sign-in is visible, independent of barcode scans, and never auto-selects a bill; public TrueBill renders full result',async()=>{
 const dom=new JSDOM('<!doctype html><div id="app"></div><div id="toast"></div>',{url:'https://ems.example/scanner/',pretendToBeVisual:true});
 const originalInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 for(const key of ['document','history','sessionStorage','location'])globalThis[key]=dom.window[key];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.window=dom.window;
 globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};
 const kinds=[],draft='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',binding='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let nextQr=null,lookupCalls=0,eventPosts=0;
 class Detector{
  constructor({formats}){kinds.push(formats)}
  static async getSupportedFormats(){return ['qr_code','code_128','ean_13']}
  async detect(){const value=nextQr;nextQr=null;return value?[{rawValue:value}]:[]}
 }
 globalThis.BarcodeDetector=dom.window.BarcodeDetector=Detector;
 navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};dom.window.HTMLMediaElement.prototype.play=async()=>{};
 const noop=async()=>{};
 Object.defineProperty(dom.window.HTMLMediaElement.prototype,'srcObject',{configurable:true,set(){},get(){return null}});
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 globalThis.fetch=async(url,opt={})=>{
  const path=new URL(url,location.origin).pathname;let data={};
  if(path.endsWith('/scanner/login/consume'))data={token:'testJwt',user:{name:'Clerk',id:'u1'},store:{name:'Gadget shop',shop_type:'electronics',id:'s1'}};
  else if(path.endsWith('/scanner/drafts'))data=[{draft_id:draft,terminal_label:'counter',kind:'purchase'}];
  else if(path.endsWith('/bind'))data={binding_id:binding,kind:'purchase'};
  else if(path.endsWith('/public/invoice/lookup')){lookupCalls++;data={verified:true,record_type:'invoice',invoice_number:'PUR-12345',kind:'purchase',details_available:false}}
  else if(path.startsWith('/api/public/invoice/'))data={verified:true,record_type:'invoice',invoice:{id:draft,kind:'purchase',invoice_number:'PUR-12345',stores:{name:'Shop One'},invoice_lines:[{quantity:2,unit_price:10,line_total:20,inventory_items:{description:'Medicine'}}],paid_amount:20,subtotal:20,total_due:0}}
  else if(path.endsWith('/status'))data={connected:true,kind:'purchase'};
  else if(path.endsWith('/sync'))data={connected:true,kind:'purchase',events:[]};
  else if(path.endsWith('/events')){if(opt.method==='POST')eventPosts++;data=[]}
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 let mod=null;
 const wait=async(test_,ms=400)=>{for(let i=0;i<ms/8;i++){if(test_())return true;await new Promise(r=>setTimeout(r,8))}return false};
 try{
  mod=await import('../scanner/scanner.js');

  /* ── Guest: verification is reachable and separate from scanning ────────── */
  assert.ok(document.querySelector('#loginQrStart'),'PC QR sign-in has its own start button');
  assert.ok(document.querySelector('#openVerifyPublic'),'a guest entry point to verification exists');
  assert.ok(!document.body.textContent.includes('Install EMS Scanner'),'login has no installation instructions');
  assert.equal(document.querySelector('#accountMode').hidden,false);
  document.querySelector('#qrTab').click();
  assert.equal(document.querySelector('#qrMode').hidden,false);
  assert.equal(document.querySelector('#accountMode').hidden,true,'the two sign-in modes are exclusive');
  document.querySelector('#accountTab').click();

  document.querySelector('#openVerifyPublic').click();
  assert.ok(document.querySelector('#verifyCamera'),'guests can verify');
  assert.ok(document.querySelector('.tabs [data-view=verify]'),'verification keeps its own tab');
  document.querySelector('#verifyBack').click();
  await wait(()=>document.querySelector('#loginQrStart'));

  /* ── Sign in with the PC QR code ───────────────────────────────────────── */
  document.querySelector('#qrTab').click();
  nextQr='https://ems.example/scanner/#login='+'a'.repeat(64);
  document.querySelector('#loginQrStart').click();
  assert.ok(await wait(()=>document.querySelector('#refreshDrafts')),'QR login reached the workspace');
  assert.deepEqual(kinds[0],['qr_code'],'sign-in scanning asks for QR only');

  /* ── Workspace: bento home, no bill chosen yet ─────────────────────────── */
  const home=document.querySelector('#app');
  assert.match(home.textContent,/ELECTRONICS WORKSPACE/,'the workspace names the shop type');
  assert.ok(!home.textContent.includes('Verify an invoice'),'verification is not a home call-to-action');
  assert.match(document.querySelector('#selectedDraft').textContent,/Choose a sale or purchase/,'no bill is chosen automatically');
  assert.ok(document.querySelector('.tabs [data-view=camera]'),'the scan tab is present');

  /* ── Choosing a bill is an explicit action ─────────────────────────────── */
  assert.ok(await wait(()=>document.querySelector('[data-select]')));
  document.querySelector('[data-select]').click();
  assert.ok(await wait(()=>document.querySelector('#selectedDraft')?.textContent.includes('Active draft')));
  assert.ok(document.querySelector('.tabs [data-view=camera]'));

  /* ── Barcode scanning never asks for QR codes ──────────────────────────── */
  document.querySelector('.tabs [data-view=camera]').click();
  assert.ok(document.querySelector('.tabs [data-view=camera]'));
  assert.ok(await wait(()=>document.querySelector('#startCam')));
  document.querySelector('#startCam').click();
  assert.ok(await wait(()=>kinds.length>1));
  assert.ok(kinds.at(-1).includes('code_128'),'the barcode reader covers CODE128');
  assert.ok(!kinds.at(-1).includes('qr_code'),'barcode reader excludes QR');

  /* ── Verify: printed number vs scanned TrueBill QR ─────────────────────── */
  document.querySelector('.tabs [data-view=verify]').click();
  assert.ok(await wait(()=>document.querySelector('#verifyInput')));
  assert.equal(document.querySelector('#verifyProof'),null,'nothing is shown before a check runs');
  assert.equal(document.querySelector('#verifyResult').textContent.trim(),'','the result area starts empty');
  const number=document.querySelector('#verifyInput');number.value='PUR-12345';
  document.querySelector('#verifyForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  assert.ok(await wait(()=>document.querySelector('#verifyResult').textContent.includes('Invoice number found')));
  assert.equal(lookupCalls,1);
  assert.match(document.querySelector('#verifyResult').textContent,/PUR-12345/);
  assert.ok(!document.querySelector('#verifyResult').textContent.includes('Medicine'),'a printed number does not reveal line items');

  nextQr='https://ems.example/?verify=12345678-1234-4234-8234-123456789012';
  document.querySelector('#verifyCamera').click();
  assert.ok(await wait(()=>document.querySelector('#verifyResult').textContent.includes('Medicine')));
  assert.match(document.querySelector('#verifyResult').textContent,/Shop One/);
 } finally {
  // Stop the adaptive poller and the camera loop: both schedule timers that
  // would keep the test process alive.
  mod?.stopCamera?.();
  mod?.state?.poller?.stop?.();
  globalThis.setInterval=originalInterval;
  dom.window.close();
 }
});
