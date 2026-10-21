/* Shared Pharmacy/Electronics PC draft adapter; never posts an invoice. */
let current=null,generation=0;
export function leaveBillingScanner(){generation++;current?.dispose();current=null}
export async function mountBillingScanner(ctx,products,applyProduct,{kind='sale',noticeElementId='pshScannerState'}={}){
 leaveBillingScanner();const activeGeneration=generation;
 const id=crypto.randomUUID(),terminal=crypto.randomUUID(),key='scanner/drafts/'+id;
 let status='starting',stopped=false,timer=0,polling=null;
 const handled=new Map(),lookup=new Map(products.map(p=>[String(p.id),p]));
 const call=(suffix='',opt={})=>ctx.api(key+suffix+(opt.method==='POST'?'':(suffix.includes('?')?'&':'?')+'terminal_id='+terminal),{...opt,...(opt.method==='POST'?{body:JSON.stringify({terminal_id:terminal,...(opt.body||{})})}:{})});
 const post=(suffix,body={})=>call(suffix,{method:'POST',body});
 const notice=text=>{const el=document.getElementById(noticeElementId);if(el)el.textContent=text};
 function stop(){clearTimeout(timer);window.removeEventListener('beforeunload',onUnload)}
 function cancel(){if(status!=='ready')return;status='cancelled';void post('/cancel').catch(()=>{});stop()}
 function onUnload(){if(status!=='ready')return;void fetch('/api/'+key+'/cancel',{method:'POST',headers:{authorization:'Bearer '+ctx.state.token,'content-type':'application/json'},body:JSON.stringify({terminal_id:terminal}),keepalive:true}).catch(()=>{})}
 const control={id,terminal,kind,get status(){return status},dispose(){if(stopped)return;stopped=true;if(status==='ready')cancel();else stop()},async poll(){
   if(polling)return polling;
   if(status!=='ready'||stopped)return;
   polling=(async()=>{const events=await call('/events');if(stopped)return;
     for(const e of events){if(stopped)return;let outcome=handled.get(e.id);
       if(!outcome){let p=lookup.get(String(e.product_id)),ok=false,reason='Item unavailable on this PC';if(p?.active){try{const result=applyProduct(p);ok=result===true;reason=ok?'':typeof result==='string'?result:'Could not add this item to the PC bill'}catch(err){reason=err.message||reason}}
         outcome={status:ok?'applied':'rejected',reason};handled.set(e.id,outcome)}
       try{await post('/ack',{event_id:e.id,...outcome});notice(outcome.status==='applied'?'✓ Phone item added to the PC '+(kind==='purchase'?'purchase':'sale')+'.':'Phone item was not added: '+outcome.reason)}catch(err){notice('PC added item but acknowledgment is delayed. Save is blocked until it is confirmed.');throw err}
     }
     return events.length;
   })();try{return await polling}finally{polling=null}
 },async prepare(saveKey){
   if(status!=='ready')throw Error('Scanner draft is not ready; do not post this bill.');
   const prepared=async()=>{try{const x=await call('/pc-state');if(x.status==='saving'&&x.save_key===saveKey){status='saving';notice('Phone scans paused while this bill is saving.');return true}}catch{}return false};
   for(let i=0;i<8;i++){try{await control.poll()}catch(e){if(await prepared())return;throw e}
     try{await post('/prepare',{save_key:saveKey});status='saving';notice('Phone scans paused while this bill is saving.');return}catch(e){if(await prepared())return;if(e.status!==409||i===7)throw e;await new Promise(r=>setTimeout(r,160))}}
 },async resume(){await post('/resume',{confirmed_failed:true});status='ready';notice('The save failed; this draft can receive scans again.')},
 async finish(){const x=await post('/finish');status='closed';stop();notice('Invoice verified; this scanner draft is closed.');return x}};
 current=control;
 try{await ctx.api('scanner/drafts',{method:'POST',body:JSON.stringify({terminal_id:terminal,draft_id:id,kind})});
   if(stopped||activeGeneration!==generation){void post('/cancel').catch(()=>{});return null}status='ready';window.addEventListener('beforeunload',onUnload);
   const loop=async()=>{if(stopped||status!=='ready')return;let processed=0;try{processed=await control.poll()||0}catch(e){notice('Phone sync interrupted. Checking again; do not save until all items are confirmed.')}finally{if(!stopped&&status==='ready')timer=setTimeout(loop,document.hidden?1800:processed?120:350)}};
   timer=setTimeout(loop,60);notice('Scanner ready · '+(kind==='purchase'?'purchase':'sale')+' draft '+id.slice(0,8));return control;
 }catch(e){status='unavailable';notice('Scanner unavailable: '+e.message+'. PC billing remains available.');stop();return null}
}
