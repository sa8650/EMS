import qrcode from './qrcode.mjs';
/* Persistent Pharmacy/Electronics header sign-in QR. Installation QR is separate; this one
 * authenticates a phone but never selects a bill or posts an invoice. */
let active=null;
export async function openScannerSignIn(api){
 active?.remove();const modal=document.createElement('div');modal.className='psh-scanner-popup';modal.id='shpScannerLoginModal';
 const close=()=>{clearInterval(modal._clock);modal.remove();if(active===modal)active=null};
 modal.innerHTML='<section role="dialog" aria-modal="true" aria-label="Sign into EMS Scanner"><button id="shpScannerClose" type="button" aria-label="Close">×</button><small>EMS SCANNER · ONE-USE SIGN-IN</small><h2>Sign in on your phone</h2><div id="shpScannerCode" class="psh-pair-qr" role="status">Preparing your sign-in code…</div><p>Use the QR camera on your phone Scanner to sign in as your current shop user. Then choose a live sale or purchase draft on the phone. This code never selects a bill.</p><p id="shpScannerExpiry"></p><button id="shpScannerRenew" type="button">New sign-in QR</button></section>';
 document.body.append(modal);active=modal;modal.querySelector('#shpScannerClose').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
 const show=async()=>{const code=modal.querySelector('#shpScannerCode');code.textContent='Preparing your sign-in code…';clearInterval(modal._clock);try{const result=await api('scanner/login-code',{method:'POST',body:'{}'});if(!modal.isConnected)return;const qr=qrcode(0,'M');qr.addData(result.login_url);qr.make();code.innerHTML=qr.createSvgTag({scalable:true,margin:2});
  const timer=()=>{if(!modal.isConnected){clearInterval(modal._clock);return}const seconds=Math.max(0,Math.ceil((Date.parse(result.expires_at)-Date.now())/1000));modal.querySelector('#shpScannerExpiry').textContent=seconds?`Expires in ${seconds}s · use once only`:'Expired. Choose New sign-in QR.';if(!seconds){code.classList.add('expired');clearInterval(modal._clock)}else code.classList.remove('expired')};timer();modal._clock=setInterval(timer,1000)
 }catch(e){code.textContent='Could not create QR: '+(e.message||'Check your connection and permissions.')}};
 modal.querySelector('#shpScannerRenew').onclick=show;await show();
}
