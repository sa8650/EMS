import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountBillingScanner,leaveBillingScanner} from '../assets/js/billing_scanner.js';

test('Electronics PC adapter applies one inventory event, acknowledges it and uses prepare/finish without posting itself',async()=>{
 const dom=new JSDOM('<div id="electronicsScannerState"></div>',{url:'https://ems.test/'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 const item={id:crypto.randomUUID(),description:'Charger',item_code:'CH-1',sale_price:12,total_stock:4,active:true};
 const id=crypto.randomUUID(),calls=[],event={id,product_id:item.id};let queue=[event],added=0;
 const ctx={state:{token:'test'},api:async(path,opt={})=>{
  calls.push(path);
  if(path==='scanner/drafts')return {draft_id:crypto.randomUUID()};
  if(path.includes('/events?')){const next=queue;queue=[];return next}
  if(path.includes('/ack'))return {status:'applied'};
  if(path.includes('/prepare'))return {status:'saving'};
  if(path.includes('/finish'))return {status:'closed'};
  if(path.includes('/pc-state'))return {status:'ready'};
  throw Error('Unexpected PC scanner request: '+path);
 }};
 try{
  const pc=await mountBillingScanner(ctx,[item],p=>{added++;assert.equal(p.id,item.id);return true},{kind:'purchase',noticeElementId:'electronicsScannerState'});
  assert.ok(pc);await pc.poll();assert.equal(added,1);assert.ok(calls.some(x=>x.endsWith('/ack')));
  queue=[event];await pc.poll();assert.equal(added,1,'replayed UUID cannot create a second PC line');
  await pc.prepare(crypto.randomUUID());assert.equal(pc.status,'saving');await pc.finish();assert.equal(pc.status,'closed');
  assert.ok(calls.some(x=>x.endsWith('/prepare')));assert.ok(calls.some(x=>x.endsWith('/finish')));
  assert.ok(calls.every(x=>!x.includes('invoice')&&!x.includes('checkout')),'PC adapter does not post official invoices');
 }finally{leaveBillingScanner();dom.window.close()}
});

test('Electronics scanned purchase price is explicit and console header Scanner is available without replacing the existing invoice form',()=>{
 const src=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
 assert.match(src,/addInventoryScan\(item\)/);
 assert.match(src,/line\.needsPrice=true/);
 assert.match(src,/Set the buy price for every scanned purchase item/);
 assert.match(src,/shpScannerLogin/);
 assert.match(src,/wireElectronicsScannerForm\(/);
 assert.match(src,/scanner\.prepare\(key\)/);
 assert.match(src,/scanner\.finish\(\)/);
});
