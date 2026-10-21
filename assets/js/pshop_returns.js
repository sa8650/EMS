/* EMS Pharmacy — Return & Exchange.
   Same flow and look as the Electronics console:
   invoice overview → "Start Return →" → item cards (checkbox, Return Qty, Return Reason,
   Condition, Penalty / Deduction) → refund settlement → "Review & Confirm Return →"
   → "Complete Return & Refund".
   Exchanges use the same item cards plus a replacement item picker. */

const PRX_REASONS=['Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other'];
const PRX_CONDITIONS=[
  {v:'Sellable',label:'Sellable (Restock to inventory)',api:'good',restock:true},
  {v:'Damaged',label:'Damaged (Quarantine · no restock)',api:'damaged',restock:false},
  {v:'Defective',label:'Defective (Quarantine · no restock)',api:'defective',restock:false},
];
const PRX_METHODS=[['cash','Cash'],['bank','Bank'],['bkash','bKash'],['nagad','Nagad'],['other','Other']];
const PRX_LEGACY_CONDITION={good:'Sellable',sellable:'Sellable',damaged:'Damaged',defective:'Defective',expired:'Expired',quarantined:'Quarantined'};

let prxCtx=null;
const prxEsc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prxNum=x=>{const v=Number(x);return Number.isFinite(v)?v:0};
const prxR2=x=>Math.round((prxNum(x)+Number.EPSILON)*100)/100;
const prxMoney=x=>`৳ ${prxCtx.money(prxR2(x))}`;
const prxMethodLabel=m=>(PRX_METHODS.find(x=>x[0]===m)||[null,m&&m!=='none'?m:'—'])[1];
const prxCondOf=v=>PRX_CONDITIONS.find(c=>c.v===v)||PRX_CONDITIONS[0];
const prxProdName=p=>[p?.name||p?.product_name,p?.strength].filter(Boolean).join(' · ')||'Medicine';
const prxDate=x=>x?new Date(String(x).slice(0,10)+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const prxBadge=(txt,tone='zinc')=>`<span class="shp-badge shp-t-${tone}">${txt}</span>`;
const prxBox='background:var(--shp-inset);border:1px solid var(--shp-line);border-radius:8px;padding:14px;margin-bottom:14px';
const prxErrBox='background:color-mix(in srgb,#ef4444 10%,transparent);border:1px solid #ef4444;border-radius:8px;padding:12px;color:#dc2626';

/* Shop modal, identical markup to the Electronics console modal. */
function prxModal(title,inner,cls=''){
  const e=document.createElement('div');
  e.className='shp-modal';
  e.innerHTML=`<div class="shp-modalbox ${cls}"><div class="shp-modalhead"><h2>${title}</h2><button type="button" class="shp-x" aria-label="Close">×</button></div><div class="shp-modalbody">${inner}</div></div>`;
  document.body.append(e);
  e.querySelector('.shp-x').onclick=()=>e.remove();
  e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});
  return e;
}

/* Amount for a returned quantity of a sold line (sold quantity is in sale units). */
function prxLineAmount(line,qty){
  const sold=prxNum(line.sold_quantity);
  return sold>0?prxR2(prxNum(line.line_total)*Math.min(prxNum(qty),sold)/sold):0;
}

export async function pshopReturns(ctx){
  prxCtx=ctx;
  let rows=await ctx.api('pharmacy/returns');
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  let tab='returns',query='';
  const addOk=ctx.canAccess('returns_refunds','add')||ctx.canAccess('sales','add');
  const $=s=>document.querySelector(s);
  const reload=async(openId)=>{
    rows=await ctx.api('pharmacy/returns');render();
    if(openId){const r=rows.find(x=>String(x.id)===String(openId));if(r)prxViewModal(r)}
  };
  const typeOf=r=>r.return_type||'return';
  const condLabel=it=>it.restocked?'Restocked':(PRX_LEGACY_CONDITION[it.condition]||it.condition||'—');
  const condTone=it=>it.restocked?'emerald':'amber';
  const dateOf=r=>prxDate(r.return_date||String(r.created_at||'').slice(0,10));
  const summarize=(items,fmt)=>items.map(fmt).join(', ');
  const retRow=r=>{
    const items=r.items||[];
    const summary=summarize(items,it=>`${prxProdName(it.product)} × ${it.quantity_base}`);
    const method=prxNum(r.refund_amount)>0?`<span class="shp-badge shp-t-emerald">${prxEsc(prxMethodLabel(r.refund_method).toUpperCase())}</span>${r.transaction_id?`<br><small class="shp-desc">Ref: ${prxEsc(r.transaction_id)}</small>`:''}`:'<small class="shp-desc">No refund</small>';
    return `<tr>
      <td><code>${prxEsc(r.return_number)}</code></td>
      <td><code>${prxEsc(r.invoice_number||'—')}</code></td>
      <td class="shp-wrap">${prxEsc(r.customer_name||'Walk-in Customer')}</td>
      <td>${dateOf(r)}</td>
      <td class="shp-wrap" title="${prxEsc(summary)}">${items.length} item${items.length===1?'':'s'}<br><small class="shp-desc">${prxEsc(summary.slice(0,35))}${summary.length>35?'…':''}</small></td>
      <td><b>${prxMoney(r.refund_amount)}</b>${prxNum(r.penalty_amount)>0?`<br><small class="shp-desc">Penalty ${prxMoney(r.penalty_amount)}</small>`:''}</td>
      <td>${method}</td>
      <td>${items.every(it=>it.restocked)?prxBadge('Completed','emerald'):items.some(it=>it.restocked)?prxBadge('Partly restocked','amber'):prxBadge('Quarantined','rose')}</td>
      <td><span style="display:inline-flex;gap:6px"><button class="shp-btn shp-btn-soft shp-btn-sm" data-psh-ret-view="${prxEsc(r.id)}">View</button></span></td>
    </tr>`;
  };
  const excRow=r=>{
    const news=r.new_items||[];
    const retItems=r.items||[];
    const retSummary=summarize(retItems,it=>`${prxProdName(it.product)} × ${it.quantity_base}`);
    const newSummary=summarize(news,it=>`${prxProdName(it.product)} × ${it.quantity_base}`);
    const diff=prxNum(r.difference_amount);
    const diffDisplay=diff>0?`<b style="color:#0284c7">+${prxMoney(diff)}</b>`:diff<0?`<b style="color:#e11d48">-${prxMoney(Math.abs(diff))}</b>`:`<b>${prxMoney(0)}</b>`;
    const pay=r.settlement_type==='customer_pays'
      ?`<span class="shp-badge shp-t-sky">Paid ${prxMoney(diff)}</span><br><small class="shp-desc">${prxEsc(prxMethodLabel(r.payment_method).toUpperCase())}${r.transaction_id?' · Ref: '+prxEsc(r.transaction_id):''}</small>`
      :r.settlement_type==='shop_refunds'
      ?`<span class="shp-badge shp-t-amber">Refunded ${prxMoney(-diff)}</span><br><small class="shp-desc">${prxEsc(prxMethodLabel(r.refund_method).toUpperCase())}${r.transaction_id?' · Ref: '+prxEsc(r.transaction_id):''}</small>`
      :'<span class="shp-badge shp-t-emerald">Even (৳0)</span>';
    return `<tr>
      <td><code>${prxEsc(r.return_number)}</code></td>
      <td><code>${prxEsc(r.invoice_number||'—')}</code></td>
      <td class="shp-wrap">${prxEsc(r.customer_name||'Walk-in Customer')}</td>
      <td>${dateOf(r)}</td>
      <td class="shp-wrap" title="${prxEsc(retSummary)}">${retItems.length} item${retItems.length===1?'':'s'}<br><small class="shp-desc">${prxEsc(retSummary.slice(0,30))}${retSummary.length>30?'…':''}</small></td>
      <td class="shp-wrap" title="${prxEsc(newSummary)}">${news.length} item${news.length===1?'':'s'}<br><small class="shp-desc">${prxEsc(newSummary.slice(0,30))}${newSummary.length>30?'…':''}</small></td>
      <td>${diffDisplay}</td>
      <td>${pay}</td>
      <td>${prxBadge('Completed','emerald')}</td>
      <td><span style="display:inline-flex;gap:6px"><button class="shp-btn shp-btn-soft shp-btn-sm" data-psh-ret-view="${prxEsc(r.id)}">View</button></span></td>
    </tr>`;
  };
  const table=(headers,body,message)=>body.length
    ?`<div class="shp-tw"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`
    :`<div class="shp-empty"><i></i><p>${message}</p></div>`;
  const render=()=>{
    if(ctx.isCurrent&&!ctx.isCurrent())return;
    const q=query.trim().toLowerCase();
    const nRet=rows.filter(r=>typeOf(r)==='return').length,nExc=rows.length-nRet;
    const list=rows.filter(r=>typeOf(r)===(tab==='exchanges'?'exchange':'return')).filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));
    const actions=addOk?`<button type="button" class="shp-btn shp-btn-soft" id="pshExchangeStart"><span style="margin-right:4px">⇄</span> New Exchange</button><button type="button" class="shp-btn shp-btn-primary" id="pshReturnStart">+ New Return</button>`:'';
    const pageEl=document.querySelector('#page');
    if(!pageEl)return;
    const body=tab==='returns'
      ?table(['Return ID','Original Invoice','Customer','Date','Items','Return & Refund Amount','Refund Method','Status','Actions'],list.map(retRow),'No sales returns recorded yet.')
      :table(['Exchange ID','Original Invoice','Customer','Date','Returned Items','New Items','Difference','Payment / Refund','Status','Actions'],list.map(excRow),'No sales exchanges recorded yet.');
    pageEl.innerHTML=`${actions?`<div class="shp-headactions">${actions}</div>`:''}
    <div class="shp-toolbar">
      <div class="shp-chips">
        <button class="shp-chip ${tab==='returns'?'on':''}" data-psh-ret-tab="returns">Returns (${nRet})</button>
        <button class="shp-chip ${tab==='exchanges'?'on':''}" data-psh-ret-tab="exchanges">Exchanges (${nExc})</button>
      </div>
      <input id="pshRetSearch" class="shp-search" placeholder="Search ID, invoice, customer, method, or status" value="${prxEsc(query)}">
    </div>
    <div class="shp-pagegap" id="pshRetData">${body}</div>`;
    const si=$('#pshRetSearch');
    if(si)si.oninput=e=>{query=e.target.value;const pos=e.target.selectionStart;render();const next=$('#pshRetSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch{}}};
    document.querySelectorAll('[data-psh-ret-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.pshRetTab;render()});
    if($('#pshReturnStart'))$('#pshReturnStart').onclick=()=>prxFlow('return',reload);
    if($('#pshExchangeStart'))$('#pshExchangeStart').onclick=()=>prxFlow('exchange',reload);
    document.querySelectorAll('[data-psh-ret-view]').forEach(b=>b.onclick=()=>prxViewModal(rows.find(x=>String(x.id)===b.dataset.pshRetView)));
  };
  render();
}

/* Detail view for a posted return or exchange. */
function prxViewModal(r){
  if(!r)return prxCtx.toast('Return record not found.');
  const isExc=(r.return_type||'return')==='exchange';
  const lines=(r.items||[]).map(it=>`<tr><td><b>${prxEsc(prxProdName(it.product))}</b>${it.reason_note?`<small class="shp-desc" style="display:block">${prxEsc(it.reason_note)}</small>`:''}</td><td>${prxEsc(it.reason||'—')}</td><td>${it.restocked?prxBadge('Restocked','emerald'):prxBadge(prxEsc(PRX_LEGACY_CONDITION[it.condition]||it.condition)+' · Quarantined','rose')}</td><td>${prxEsc(it.quantity_base)} ${prxEsc(it.product?.base_unit||'base units')}</td><td>${prxMoney(it.penalty)}</td><td><b>${prxMoney(it.amount)}</b></td></tr>`).join('');
  const news=(r.new_items||[]).map(it=>`<tr><td><b>${prxEsc(prxProdName(it.product))}</b></td><td>${prxEsc(it.quantity_base)} ${prxEsc(it.product?.base_unit||'base units')}</td><td>${prxMoney(it.amount)}</td></tr>`).join('');
  const diff=prxNum(r.difference_amount);
  const settle=!isExc
    ?(prxNum(r.refund_amount)>0?`Refunded ${prxMoney(r.refund_amount)} · ${prxEsc(prxMethodLabel(r.refund_method))}`:'No refund')
    :r.settlement_type==='customer_pays'?`Customer paid ${prxMoney(diff)} · ${prxEsc(prxMethodLabel(r.payment_method))}`
    :r.settlement_type==='shop_refunds'?`Shop refunded ${prxMoney(-diff)} · ${prxEsc(prxMethodLabel(r.refund_method))}`:'Even exchange';
  const summary=(rows)=>rows.map(([k,v])=>`<div class="shp-ret-summary-row"><span>${k}</span><b>${v}</b></div>`).join('');
  const e=prxModal(`${isExc?'Exchange':'Return'} · ${prxEsc(r.return_number)}`,`
    <div style="font-size:13px;line-height:1.6">
      <div style="${prxBox}">
        <div><b>Original Invoice:</b> <code>${prxEsc(r.invoice_number)}</code></div>
        <div><b>Customer:</b> ${prxEsc(r.customer_name||'Walk-in customer')}</div>
        <div><b>Date:</b> ${prxDate(r.return_date||String(r.created_at||'').slice(0,10))}</div>
        <div><b>Reason:</b> ${prxEsc(r.reason||'—')}</div>
        ${r.notes?`<div><b>Notes:</b> ${prxEsc(r.notes)}</div>`:''}
      </div>
      <h4 style="font-size:13px;margin:12px 0 6px">${isExc?'Returned medicines':'Returned medicines'}</h4>
      <div class="shp-tw"><table><thead><tr><th>Medicine</th><th>Reason</th><th>Condition</th><th>Qty</th><th>Penalty</th><th>Amount</th></tr></thead><tbody>${lines||'<tr><td colspan="6">—</td></tr>'}</tbody></table></div>
      ${isExc?`<h4 style="font-size:13px;margin:14px 0 6px">Replacement medicines</h4><div class="shp-tw"><table><thead><tr><th>Medicine</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${news||'<tr><td colspan="3">—</td></tr>'}</tbody></table></div>`:''}
      <div class="shp-ret-summary-box" style="margin-top:14px">
        ${isExc?summary([['Returned value',prxMoney(r.amount)],['Replacement value',prxMoney(r.new_items_total)]]):summary([['Original Item Amount',prxMoney(r.amount)],...(prxNum(r.penalty_amount)>0?[['Penalty / Restock Fee','−'+prxMoney(r.penalty_amount)]]:[])])}
        <div class="shp-ret-summary-row total"><span>${isExc?'Settlement':'Total Refund to Customer'}</span><b style="font-size:16px;color:#059669">${isExc?settle:prxMoney(r.refund_amount)}</b></div>
      </div>
      ${!isExc?`<p class="shp-desc" style="margin-top:8px">${settle}${r.transaction_id?` · Ref: ${prxEsc(r.transaction_id)}`:''}</p>`:(r.transaction_id?`<p class="shp-desc" style="margin-top:8px">Ref: ${prxEsc(r.transaction_id)}</p>`:'')}
      <div class="shp-form-actions"><button type="button" class="shp-btn shp-btn-primary" id="prxViewClose">Close</button></div>
    </div>`,'shp-modal-xl');
  e.querySelector('#prxViewClose').onclick=()=>e.remove();
}

/* Two-step flow: find invoice, then process it. */
function prxFlow(kind,onDone){
  const ctx=prxCtx;
  const isExc=kind==='exchange';
  const e=prxModal(isExc?'New sales exchange':'New sales return',`
    <div id="prxStep1">
      <p class="shp-desc">Search for the original Pharmacy sales invoice to select medicines for ${isExc?'exchange':'return'}.</p>
      <div style="display:flex;gap:8px;margin:12px 0 16px">
        <input id="prxInvInput" class="shp-search" style="flex:1" placeholder="Enter invoice number (e.g. SAL-000001)" autocomplete="off">
        <button type="button" class="shp-btn shp-btn-primary" id="prxSearch">Search</button>
      </div>
      <div id="prxResult"></div>
    </div>
    <div id="prxStep2" style="display:none"></div>`,'shp-modal-lg');
  const q=s=>e.querySelector(s);
  const invInput=q('#prxInvInput'),searchBtn=q('#prxSearch'),resultBox=q('#prxResult'),step1=q('#prxStep1'),step2=q('#prxStep2');
  let products=null;
  const showStep=(two,title)=>{
    step1.style.display=two?'none':'block';step2.style.display=two?'block':'none';
    const box=e.querySelector('.shp-modalbox');
    box.classList.toggle('shp-modal-xl',two);box.classList.toggle('shp-modal-lg',!two);
    e.querySelector('.shp-modalhead h2').textContent=title;
  };
  const loadProducts=async()=>{
    if(!isExc)return[];
    if(!products)products=(await ctx.api('pharmacy/products?for=pos')).filter(p=>p.active);
    return products;
  };

  const overview=(d)=>{
    const inv=d.invoice,party=d.customer,lines=d.lines||[];
    const partyName=d.customer_name||party?.name||'Walk-in customer';
    const totalReturnable=lines.reduce((s,l)=>s+prxNum(l.returnable_quantity),0);
    resultBox.innerHTML=`
      <div style="${prxBox}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:10px">
          <div><b style="font-size:16px">${prxEsc(inv.invoice_number)}</b><span style="margin-left:8px;color:var(--shp-text2)">${prxDate(inv.invoice_date)}</span></div>
          <div>${prxNum(inv.total_due)<=0?prxBadge('Paid in Full','emerald'):prxBadge('Due: '+prxMoney(inv.total_due),'amber')}</div>
        </div>
        <div class="shp-grid2" style="font-size:12.5px;color:var(--shp-text2)">
          <div><b>Customer:</b> ${prxEsc(partyName)}${party?.customer_code?` (${prxEsc(party.customer_code)})`:''}<br><b>Phone:</b> ${prxEsc(party?.phone||'—')}<br><b>Address:</b> ${prxEsc(party?.address||'—')}</div>
          <div><b>Subtotal:</b> ${prxMoney(inv.subtotal)}<br><b>VAT/Tax:</b> ${prxMoney(inv.tax_amount)} · <b>Discount:</b> ${prxMoney(inv.discount)}<br><b>Paid amount:</b> ${prxMoney(inv.paid_amount)}</div>
        </div>
      </div>
      <div style="margin-top:12px">
        <h4 style="font-size:13px;margin:0 0 8px">Original Invoice Items</h4>
        <div class="shp-tw"><table><thead><tr><th>Medicine</th><th>Unit Price</th><th>Sold Qty</th><th>Returned</th><th>Returnable</th><th>Unit</th></tr></thead><tbody>
          ${lines.map(l=>`<tr>
            <td class="shp-wrap"><b>${prxEsc(prxProdName(l))}</b></td>
            <td>${prxMoney(l.unit_price)}</td>
            <td>${prxEsc(l.sold_quantity)}</td>
            <td>${prxEsc(l.already_returned_quantity)}</td>
            <td><b>${prxEsc(l.returnable_quantity)}</b>${prxNum(l.returnable_quantity)<=0?` ${prxBadge('Returned','zinc')}`:''}</td>
            <td>${prxEsc(l.unit_label||'—')}</td></tr>`).join('')||'<tr><td colspan="6">No medicines on this invoice.</td></tr>'}
        </tbody></table></div>
      </div>
      ${totalReturnable<=0?`<div style="background:color-mix(in srgb,var(--shp-line) 40%,transparent);border:1px solid var(--shp-line);border-radius:8px;padding:12px;margin-top:14px;text-align:center"><b style="color:var(--shp-text2)">This sales invoice has already been fully returned.</b></div>`
        :`<div style="margin-top:16px;text-align:right"><button type="button" class="shp-btn shp-btn-primary" id="prxStart">${isExc?'Start Exchange →':'Start Return →'}</button></div>`}`;
    const start=resultBox.querySelector('#prxStart');
    if(start)start.onclick=async()=>{
      try{await loadProducts()}catch(err){return ctx.toast(err.message)}
      editor(d);
    };
  };

  const editor=(d)=>{
    const inv=d.invoice,party=d.customer,lines=d.lines||[];
    const partyName=d.customer_name||party?.name||'Walk-in customer';
    showStep(true,(isExc?'Process exchange · ':'Process return · ')+inv.invoice_number);
    const sel={};
    lines.forEach(l=>{if(prxNum(l.returnable_quantity)>0)sel[l.invoice_line_id]={selected:false,line:l,qty:Math.min(1,prxNum(l.returnable_quantity)),reason:'Customer Changed Mind',note:'',cond:'Sellable',penalty:0}});
    const reps=[];
    const qtyOf=st=>Math.max(0,prxNum(st.qty));
    const amtOf=st=>prxLineAmount(st.line,qtyOf(st));
    const penOf=st=>isExc?0:Math.max(0,prxNum(st.penalty));
    const netOf=st=>Math.max(0,prxR2(amtOf(st)-penOf(st)));
    const activeRet=()=>Object.values(sel).filter(st=>st.selected&&qtyOf(st)>0);
    const totals=()=>{
      let gross=0,pen=0,net=0;
      activeRet().forEach(st=>{gross+=amtOf(st);pen+=penOf(st);net+=netOf(st)});
      return {gross:prxR2(gross),pen:prxR2(pen),net:prxR2(net),n:activeRet().length};
    };
    const repTotal=()=>prxR2(reps.reduce((s,r)=>s+prxR2(prxNum(r.unit.selling_price)*r.qty),0));
    const diffOf=()=>prxR2(repTotal()-totals().net);
    const repQtyBase=r=>r.qty*prxNum(r.unit.factor_to_base||1);

    const cardHtml=(l)=>{
      const id=l.invoice_line_id,disabled=prxNum(l.returnable_quantity)<=0;
      return `<div class="shp-ret-item-card ${disabled?'disabled':''}" id="prxCard_${id}">
        <div class="shp-ret-row-head">
          <div class="shp-ret-check"><input type="checkbox" data-chk="${id}" ${disabled?'disabled title="Item fully returned"':''}></div>
          <div class="shp-wrap">
            <b style="font-size:13.5px">${prxEsc(prxProdName(l))}</b>
            <div style="font-size:11.5px;color:var(--shp-text2);margin-top:2px">
              Sold: <b>${prxEsc(l.sold_quantity)}</b> ${prxEsc(l.unit_label||'')} · Returnable: <b>${prxEsc(l.returnable_quantity)}</b> · Unit price: <b>${prxMoney(l.unit_price)}</b>
            </div>
          </div>
          <div style="text-align:right">
            <span class="shp-desc" style="font-size:11px">${isExc?'Return Value':'Return Amount'}</span><br>
            <b style="font-size:14px" data-amt="${id}">৳0.00</b>
          </div>
        </div>
        ${disabled?'':`<div class="shp-ret-row-fields" id="prxFields_${id}" style="display:none">
          <label>${isExc?'Exchange Qty':'Return Qty'} (Max: ${prxEsc(l.returnable_quantity)})
            <input type="number" min="0.001" max="${prxEsc(l.returnable_quantity)}" step="0.001" value="${prxEsc(sel[id].qty)}" data-qty="${id}">
          </label>
          <label>Return Reason
            <select data-reason="${id}">${PRX_REASONS.map(r=>`<option value="${prxEsc(r)}">${prxEsc(r)}</option>`).join('')}</select>
          </label>
          <label id="prxNoteWrap_${id}" style="display:none">Reason Note
            <input type="text" placeholder="Explain return reason..." data-note="${id}">
          </label>
          <label>Condition
            <select data-cond="${id}">${PRX_CONDITIONS.map(c=>`<option value="${c.v}">${c.label}</option>`).join('')}</select>
          </label>
          ${isExc?'':`<label>Penalty / Deduction
            <input type="number" min="0" step="0.01" placeholder="0.00" value="0" data-penalty="${id}">
          </label>`}
        </div>`}
      </div>`;
    };

    step2.innerHTML=`
      <div style="${prxBox.replace('margin-bottom:14px','margin-bottom:16px')};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 14px">
        <div><b>Original Invoice:</b> <code>${prxEsc(inv.invoice_number)}</code> · <b>Customer:</b> ${prxEsc(partyName)} · <b>Date:</b> ${prxDate(inv.invoice_date)}</div>
        <div><button type="button" class="shp-btn shp-btn-ghost shp-btn-sm" id="prxBackInv">← Change Invoice</button></div>
      </div>

      ${isExc?`<div class="shp-exc-section">
        <h4><span>1. Select Product to Return (from Original Invoice)</span><span class="shp-badge shp-t-sky" id="prxRetBadge">0 selected</span></h4>
        <p class="shp-desc" style="margin:0 0 10px">Check the medicines being returned, then choose the return reason and condition.</p>
        <div class="shp-ret-items-list">${lines.map(cardHtml).join('')}</div>
      </div>
      <div class="shp-exc-section">
        <h4><span>2. Replacement Products (Exchange)</span><button type="button" class="shp-btn shp-btn-soft shp-btn-sm" id="prxAddRep">+ Add Product</button></h4>
        <p class="shp-desc" style="margin:0 0 10px">Pick the medicines the customer receives in exchange.</p>
        <div id="prxReps" class="shp-pagegap"></div>
      </div>`
      :`<div style="margin-bottom:12px">
        <h4 style="font-size:13px;margin:0 0 4px">Select Items to Return</h4>
        <p class="shp-desc" style="margin:0 0 10px">Choose the medicines and quantities being returned. Original invoice remains completely unchanged.</p>
      </div>
      <div class="shp-ret-items-list">${lines.map(cardHtml).join('')}</div>`}

      ${isExc?`<div class="shp-exc-section"><h4><span>3. Settlement</span></h4>
        <div class="shp-ret-summary-box" id="prxCalc"></div>
        <div id="prxSettleBox" style="background:var(--shp-inset);border:1px solid var(--shp-line);border-radius:8px;padding:14px;margin:14px 0">
          <div class="shp-grid2">
            <label id="prxPayWrap">Customer pays — payment method
              <select id="prxPayMethod">${PRX_METHODS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>
            </label>
            <label id="prxRefundWrap">Store refunds — refund method
              <select id="prxRefundMethod">${PRX_METHODS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>
            </label>
            <label>Transaction / Reference ID
              <input type="text" id="prxTrx" placeholder="e.g. TRX123456 (optional)">
            </label>
          </div>
        </div>
      </div>`
      :`<div class="shp-ret-summary-box" id="prxSummary"></div>
      <div style="background:var(--shp-inset);border:1px solid var(--shp-line);border-radius:8px;padding:14px;margin:14px 0">
        <h4 style="font-size:13px;margin:0 0 10px;display:flex;align-items:center;gap:8px">
          ${prxBadge('Refund to Customer','emerald')}
          <span>2. Immediate Refund Settlement: <b id="prxRefundAmt" style="color:#059669;margin-left:4px">৳0.00</b></span>
        </h4>
        <div class="shp-grid2">
          <label>Refund Method
            <select id="prxRefundMethod">${PRX_METHODS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>
          </label>
          <label>Transaction / Reference ID
            <input type="text" id="prxTrx" placeholder="e.g. TRX123456 / Cheque No (optional)">
          </label>
        </div>
      </div>`}

      <label style="display:block;margin:12px 0">${isExc?'Exchange':'Return'} Notes / Comments (optional)
        <input type="text" id="prxNotes" placeholder="Additional details or reference notes...">
      </label>

      <div class="shp-form-actions">
        <button type="button" class="shp-btn shp-btn-soft" id="prxBack">Back</button>
        <button type="button" class="shp-btn shp-btn-primary" id="prxReview" disabled>Review & Confirm ${isExc?'Exchange':'Return'} →</button>
      </div>`;

    const bindLine=(l)=>{
      const id=l.invoice_line_id,st=sel[id];
      const chk=step2.querySelector(`[data-chk="${id}"]`);
      if(!chk||chk.disabled)return;
      const card=step2.querySelector('#prxCard_'+id),fields=step2.querySelector('#prxFields_'+id);
      const qty=step2.querySelector(`[data-qty="${id}"]`),reason=step2.querySelector(`[data-reason="${id}"]`),
        noteWrap=step2.querySelector('#prxNoteWrap_'+id),note=step2.querySelector(`[data-note="${id}"]`),
        cond=step2.querySelector(`[data-cond="${id}"]`),pen=step2.querySelector(`[data-penalty="${id}"]`);
      chk.onchange=()=>{st.selected=chk.checked;card.classList.toggle('selected',chk.checked);fields.style.display=chk.checked?'grid':'none';updateUI()};
      qty.oninput=()=>{let v=prxNum(qty.value);if(v>prxNum(l.returnable_quantity)){v=prxNum(l.returnable_quantity);qty.value=v}st.qty=v;updateUI()};
      reason.onchange=()=>{st.reason=reason.value;noteWrap.style.display=reason.value==='Other'?'flex':'none';updateUI()};
      note.oninput=()=>{st.note=note.value};
      cond.onchange=()=>{st.cond=cond.value};
      if(pen)pen.oninput=()=>{st.penalty=prxNum(pen.value);updateUI()};
    };
    lines.forEach(bindLine);

    const repRowTotal=r=>prxR2(prxNum(r.unit.selling_price)*prxNum(r.qty));
    const renderReps=()=>{
      const box=step2.querySelector('#prxReps');if(!box)return;
      if(!reps.length){
        box.innerHTML=`<div class="shp-empty" style="border:1px dashed var(--shp-line);border-radius:10px;padding:18px"><i></i><p>No replacement medicine added yet.</p><button type="button" class="shp-btn shp-btn-soft shp-btn-sm" id="prxAddRepEmpty" style="margin-top:8px">+ Add Product (Item Picker)</button></div>`;
        const eb=box.querySelector('#prxAddRepEmpty');if(eb)eb.onclick=()=>step2.querySelector('#prxAddRep').click();
        return;
      }
      box.innerHTML=`<div class="shp-tw"><table><thead><tr>
        <th>Product</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Total</th><th></th>
      </tr></thead><tbody>${reps.map((r,i)=>`<tr>
        <td class="shp-wrap"><b>${prxEsc(prxProdName(r.product))}</b><br><small class="shp-desc">Stock: ${prxEsc(r.product.available_stock??0)} ${prxEsc(r.product.base_unit||'')}</small></td>
        <td>${prxEsc(r.unit.unit_label)}</td>
        <td><input type="number" min="0.001" step="0.001" value="${prxEsc(r.qty)}" data-rq="${i}" style="width:90px"></td>
        <td>${prxMoney(r.unit.selling_price)}</td>
        <td><b data-rtot="${i}">${prxMoney(repRowTotal(r))}</b></td>
        <td><button type="button" class="shp-icobtn shp-danger" data-rdel="${i}" title="Remove">✕</button></td>
      </tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('[data-rq]').forEach(inp=>inp.oninput=()=>{
        const i=+inp.dataset.rq;reps[i].qty=prxNum(inp.value);
        const cell=box.querySelector(`[data-rtot="${i}"]`);if(cell)cell.textContent=prxMoney(repRowTotal(reps[i]));
        updateUI(true);
      });
      box.querySelectorAll('[data-rdel]').forEach(b=>b.onclick=()=>{reps.splice(+b.dataset.rdel,1);renderReps();updateUI()});
    };

    const updateUI=(repsOnly)=>{
      const t=totals();
      if(!repsOnly){
        lines.forEach(l=>{
          const st=sel[l.invoice_line_id];if(!st)return;
          const el=step2.querySelector(`[data-amt="${l.invoice_line_id}"]`);
          if(el)el.textContent=prxMoney(st.selected?netOf(st):0);
        });
      }
      const badge=step2.querySelector('#prxRetBadge');
      if(badge)badge.textContent=`${t.n} selected · Value: ${prxMoney(t.net)}`;
      if(isExc){
        const diff=diffOf(),total=repTotal();
        const calc=step2.querySelector('#prxCalc');
        if(calc){
          const diffHtml=diff>0?`<b style="color:#0284c7">+${prxMoney(diff)} · Customer pays</b>`:diff<0?`<b style="color:#f59e0b">−${prxMoney(-diff)} · Store refunds</b>`:`<b style="color:#10b981">Even exchange (${prxMoney(0)})</b>`;
          calc.innerHTML=`<div class="shp-ret-summary-row"><span>Returned value</span><b>${prxMoney(t.net)}</b></div>
            <div class="shp-ret-summary-row"><span>New replacement total</span><b>${prxMoney(total)}</b></div>
            <div class="shp-ret-summary-row total"><span>Difference</span>${diffHtml}</div>`;
        }
        const pw=step2.querySelector('#prxPayWrap'),rw=step2.querySelector('#prxRefundWrap');
        if(pw)pw.style.display=diff>0?'flex':'none';
        if(rw)rw.style.display=diff<0?'flex':'none';
        const sb=step2.querySelector('#prxSettleBox');if(sb)sb.style.display=diff!==0?'block':'none';
        const btn=step2.querySelector('#prxReview');
        if(btn)btn.disabled=t.n===0||reps.length===0;
      }else{
        const sum=step2.querySelector('#prxSummary');
        if(sum)sum.innerHTML=`
          <div class="shp-ret-summary-row"><span>Original Item Amount</span><b>${prxMoney(t.gross)}</b></div>
          ${t.pen>0?`<div class="shp-ret-summary-row"><span>Penalty / Restock Fee</span><b>−${prxMoney(t.pen)}</b></div>`:''}
          <div class="shp-ret-summary-row total"><span>Total Refund to Customer</span><b style="font-size:18px;color:#059669">${prxMoney(t.net)}</b></div>`;
        const rf=step2.querySelector('#prxRefundAmt');if(rf)rf.textContent=prxMoney(t.net);
        const btn=step2.querySelector('#prxReview');if(btn)btn.disabled=t.n===0||t.net<=0;
      }
    };

    if(isExc){
      renderReps();
      step2.querySelector('#prxAddRep').onclick=()=>prxPicker(products,(product,unit,qty)=>{reps.push({product,unit,qty});renderReps();updateUI()});
    }
    step2.querySelector('#prxBackInv').onclick=()=>{showStep(false,isExc?'New sales exchange':'New sales return');};
    step2.querySelector('#prxBack').onclick=()=>step2.querySelector('#prxBackInv').click();
    step2.querySelector('#prxReview').onclick=()=>{
      const act=activeRet();
      if(!act.length)return ctx.toast(`Please select at least one item to ${isExc?'exchange':'return'}.`);
      for(const st of act){
        const name=prxProdName(st.line);
        if(qtyOf(st)>prxNum(st.line.returnable_quantity)+0.0001)return ctx.toast(`${name}: quantity is more than the returnable quantity.`);
        if(st.reason==='Other'&&!st.note.trim())return ctx.toast(`Please enter a reason note for ${name}.`);
        if(!isExc&&penOf(st)>amtOf(st))return ctx.toast(`Penalty for ${name} cannot be more than its return amount.`);
      }
      if(isExc){
        if(!reps.length)return ctx.toast('Please add at least one replacement product.');
        for(const r of reps){
          if(!(r.qty>0))return ctx.toast(`Please enter a valid quantity for ${prxProdName(r.product)}.`);
          if(repQtyBase(r)>prxNum(r.product.available_stock))return ctx.toast(`Quantity for "${prxProdName(r.product)}" exceeds available stock.`);
        }
      }
      const t=totals(),diff=diffOf();
      const refundMethod=step2.querySelector('#prxRefundMethod')?.value||'cash';
      const payMethod=step2.querySelector('#prxPayMethod')?.value||'cash';
      const trx=step2.querySelector('#prxTrx')?.value?.trim()||null;
      const notes=step2.querySelector('#prxNotes')?.value?.trim()||'';
      if(isExc&&diff>0&&!payMethod)return ctx.toast('Choose a payment method for the difference.');
      if(isExc&&diff<0&&!refundMethod)return ctx.toast('Choose a refund method.');
      const items=act.map(st=>({invoice_line_id:st.line.invoice_line_id,quantity:qtyOf(st),condition:prxCondOf(st.cond).api,reason:st.reason,reason_note:st.note.trim()||null,penalty:penOf(st)}));
      const reasonText=[...new Set(items.map(i=>i.reason))].join(', ');
      const payload={invoice_id:inv.invoice_id,reason:reasonText,notes:notes||null,transaction_id:trx,items};
      if(isExc){
        payload.new_items=reps.map(r=>({product_id:r.product.id,unit_label:r.unit.unit_label,quantity:r.qty}));
        payload.refund_method=diff<0?refundMethod:'none';
        payload.payment_method=diff>0?payMethod:'none';
      }else{
        payload.refund_method=t.net>0?refundMethod:'none';
        payload.payment_method='none';
      }
      prxConfirm({kind,inv,partyName,act,reps,totals:t,diff,refundMethod,payMethod,trx,payload,parent:e,onDone});
    };
    updateUI();
  };

  searchBtn.onclick=doSearch;
  invInput.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();doSearch()}};
  async function doSearch(){
    const val=invInput.value.trim();
    if(!val)return ctx.toast('Please enter an invoice number.');
    resultBox.innerHTML='<p class="shp-desc">Searching invoice...</p>';
    searchBtn.disabled=true;
    try{
      const data=await ctx.api('pharmacy/returns/lookup?invoice_number='+encodeURIComponent(val));
      searchBtn.disabled=false;
      const d={invoice:{id:data.invoice_id,invoice_number:data.invoice_number,invoice_date:data.invoice_date,subtotal:data.subtotal,tax_amount:data.tax_amount,discount:data.discount,paid_amount:data.paid_amount,total_due:data.total_due},
        customer:data.customer||null,customer_name:data.customer_name,lines:data.lines||[]};
      d.invoice.invoice_id=data.invoice_id;
      showStep(false,isExc?'New sales exchange':'New sales return');
      overview(d);
    }catch(err){
      searchBtn.disabled=false;
      resultBox.innerHTML=`<div style="${prxErrBox}">${prxEsc(err.message)}</div>`;
    }
  }
}

/* Confirmation step, same layout as the Electronics console. */
function prxConfirm({kind,inv,partyName,act,reps,totals,diff,refundMethod,payMethod,trx,payload,parent,onDone}){
  const ctx=prxCtx;
  const isExc=kind==='exchange';
  const line=(label,value,extra='')=>`<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${label}</span><b ${extra}>${value}</b></div>`;
  const cm=prxModal(`Confirm sales ${isExc?'exchange':'return'}${isExc?'':' & refund'}`,`
    <div style="font-size:13px;line-height:1.6">
      <div style="${prxBox.replace('margin-bottom:14px','margin-bottom:14px')};padding:12px">
        <div><b>Original Invoice:</b> <code>${prxEsc(inv.invoice_number)}</code></div>
        <div><b>Customer:</b> ${prxEsc(partyName)}</div>
        <div><b>Invoice Date:</b> ${prxDate(inv.invoice_date)}</div>
      </div>
      <h4 style="font-size:13px;margin:12px 0 6px">Returned Items:</h4>
      <div>${act.map(st=>{
        const cond=prxCondOf(st.cond);
        const amt=prxNum(st.penalty)>0&&!isExc?Math.max(0,prxLineAmount(st.line,st.qty)-prxNum(st.penalty)):prxLineAmount(st.line,st.qty);
        return `<div class="shp-ret-confirm-item">
          <div style="display:flex;justify-content:space-between"><b>${prxEsc(prxProdName(st.line))} × ${prxEsc(st.qty)} ${prxEsc(st.line.unit_label||'')}</b><b>${prxMoney(amt)}</b></div>
          <div style="font-size:11.5px;color:var(--shp-text2)">Reason: <b>${prxEsc(st.reason)}</b>${st.note?` (${prxEsc(st.note)})`:''} · Condition: <b>${prxEsc(cond.v)}</b>
            ${cond.restock?' <span class="shp-badge shp-t-emerald" style="font-size:9.5px">Restock</span>':' <span class="shp-badge shp-t-rose" style="font-size:9.5px">Quarantined</span>'}</div>
        </div>`}).join('')}</div>

      ${isExc?`<h4 style="font-size:13px;margin:12px 0 6px">Replacement Items:</h4>
        <div>${reps.map(r=>`<div class="shp-ret-confirm-item"><div style="display:flex;justify-content:space-between"><b>${prxEsc(prxProdName(r.product))} × ${prxEsc(r.qty)} ${prxEsc(r.unit.unit_label)}</b><b>${prxMoney(prxR2(prxNum(r.unit.selling_price)*r.qty))}</b></div></div>`).join('')}</div>`:''}

      <div style="background:var(--shp-card);border:1px solid var(--shp-line);border-radius:8px;padding:12px;margin:16px 0">
        ${isExc?`${line('Returned value',prxMoney(totals.net))}${line('Replacement value',prxMoney(prxR2(reps.reduce((s,r)=>s+prxNum(r.unit.selling_price)*r.qty,0))))}
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--shp-line);padding-top:8px;margin-top:6px;font-size:16px">
            <b>${diff>0?'Customer pays':diff<0?'Store refunds':'Even exchange'}:</b>
            <b style="color:${diff>0?'#0284c7':diff<0?'#f59e0b':'#10b981'}">${diff===0?prxMoney(0):prxMoney(Math.abs(diff))}</b></div>
          ${diff!==0?`<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12.5px;color:var(--shp-text2)"><span>${diff>0?'Payment':'Refund'} Method:</span><b>${prxEsc(prxMethodLabel(diff>0?payMethod:refundMethod).toUpperCase())}${trx?' (Ref: '+prxEsc(trx)+')':''}</b></div>`:''}`
        :`${line('Item amount',prxMoney(totals.gross))}${totals.pen>0?line('Penalty','−'+prxMoney(totals.pen)):''}
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--shp-line);padding-top:8px;margin-top:6px;font-size:16px">
            <b>Total Refund:</b><b style="color:#059669">${prxMoney(totals.net)}</b></div>
          ${totals.net>0?`<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12.5px;color:var(--shp-text2)"><span>Refund Method:</span><b>${prxEsc(prxMethodLabel(refundMethod).toUpperCase())}${trx?' (Ref: '+prxEsc(trx)+')':''}</b></div>`:''}`}
      </div>

      <div class="shp-form-actions">
        <button type="button" class="shp-btn shp-btn-soft" id="prxBackConfirm">Back to Edit</button>
        <button type="button" class="shp-btn shp-btn-primary" id="prxDoConfirm">${isExc?'Complete Exchange':'Complete Return & Refund'}</button>
      </div>
    </div>`,'shp-modal-md');

  cm.querySelector('#prxBackConfirm').onclick=()=>cm.remove();
  cm.querySelector('#prxDoConfirm').onclick=async()=>{
    const btn=cm.querySelector('#prxDoConfirm');
    btn.disabled=true;btn.textContent=isExc?'Processing exchange...':'Processing return...';
    try{
      const res=await ctx.api(isExc?'pharmacy/exchanges':'pharmacy/returns',{method:'POST',body:JSON.stringify({...payload,idempotencyKey:crypto.randomUUID()})});
      cm.remove();parent.remove();
      ctx.toast(`${isExc?'Sales exchange':'Sales return'} ${res.return_number} completed!`);
      if(onDone)await onDone(res.id);
    }catch(err){
      btn.disabled=false;btn.textContent=isExc?'Complete Exchange':'Complete Return & Refund';
      ctx.toast(err.message);
    }
  };
}

/* Replacement item picker, same layout as the Electronics "Add item" picker. */
function prxPicker(products,onAdd){
  const ctx=prxCtx;
  const list=(products||[]).filter(p=>p.active!==false&&(p.units||[]).some(u=>u.can_sell));
  const sellUnits=p=>(p?.units||[]).filter(u=>u.can_sell);
  let selected=null,selUnit=null,cat='all';
  const cats=[...new Set(list.map(p=>String(p.category||'').trim()).filter(Boolean))];
  const e=prxModal('Add replacement product',`<div class="shp-picker">
    <div class="shp-toolbar"><input id="pkSearch" class="shp-search" placeholder="Search medicine, strength or form"></div>
    ${cats.length?`<div class="shp-chips shp-picker-cats" id="pkCats"><button class="shp-chip on" data-cat="all" type="button">All</button>${cats.map(c=>`<button class="shp-chip" data-cat="${prxEsc(c)}" type="button">${prxEsc(c)}</button>`).join('')}</div>`:''}
    <div id="pkTable"></div>
    <div class="shp-picker-sel">
      <label>Product<input id="pkItem" readonly tabindex="-1" placeholder="Select a product from the table"></label>
      <label>Quantity<input id="pkQty" type="number" min="0.001" step="0.001" value="1"></label>
      <label>Unit<select id="pkUnit"></select></label>
      <label>Sale price<input id="pkPrice" readonly tabindex="-1"></label>
      <label>Total<input id="pkTotal" readonly tabindex="-1"></label>
      <div class="shp-picker-add"><button class="shp-btn shp-btn-primary" type="button" id="pkAdd">Add item</button></div>
    </div>
  </div>`,'shp-modal-xl');
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const q=s=>e.querySelector(s);
  const unitOf=()=>sellUnits(selected).find(u=>u.unit_label===q('#pkUnit').value)||null;
  const refresh=()=>{
    const u=unitOf();
    q('#pkPrice').value=u?prxR2(u.selling_price).toFixed(2):'';
    q('#pkTotal').value=u?prxMoney(prxR2(num(u.selling_price)*num(q('#pkQty').value))):'';
  };
  const fillSelected=()=>{
    q('#pkItem').value=selected?prxProdName(selected)+(selected.dosage_form?` · ${selected.dosage_form}`:''):'';
    const units=sellUnits(selected);
    q('#pkUnit').innerHTML=units.map(u=>`<option value="${prxEsc(u.unit_label)}">${prxEsc(u.unit_label)} · ${prxMoney(u.selling_price)}</option>`).join('')||'<option value="">No sellable unit</option>';
    refresh();
  };
  const renderTable=()=>{
    const term=(q('#pkSearch').value||'').toLowerCase();
    const rows=list.filter(p=>(cat==='all'||String(p.category||'').trim()===cat)&&(!term||[p.name,p.strength,p.generic_name,p.dosage_form].filter(Boolean).join(' ').toLowerCase().includes(term)));
    q('#pkTable').innerHTML=rows.length?`<div class="shp-tw"><table><thead><tr><th>Medicine</th><th>Form</th><th>Base unit</th><th>Sale price</th><th>Stock</th></tr></thead><tbody>${rows.map(p=>{
      const first=sellUnits(p)[0];
      return `<tr data-pk="${prxEsc(p.id)}" style="cursor:pointer;${selected&&selected.id===p.id?'background:color-mix(in srgb,var(--shp-accent,#0ea5e9) 12%,transparent)':''}"><td class="shp-wrap"><b>${prxEsc(prxProdName(p))}</b></td><td>${prxEsc(p.dosage_form||'—')}</td><td>${prxEsc(p.base_unit||'—')}</td><td>${first?prxMoney(first.selling_price):'—'}</td><td>${prxEsc(p.available_stock??0)}</td></tr>`}).join('')}</tbody></table></div>`
      :'<div class="shp-empty"><i></i><p>No products match this search.</p></div>';
    q('#pkTable').querySelectorAll('[data-pk]').forEach(r=>r.onclick=()=>{selected=list.find(p=>String(p.id)===r.dataset.pk)||null;selUnit=null;renderTable();fillSelected()});
  };
  q('#pkSearch').oninput=renderTable;
  e.querySelectorAll('#pkCats [data-cat]').forEach(b=>b.onclick=()=>{cat=b.dataset.cat;e.querySelectorAll('#pkCats [data-cat]').forEach(x=>x.classList.toggle('on',x===b));renderTable()});
  q('#pkUnit').onchange=refresh;
  q('#pkQty').oninput=refresh;
  q('#pkAdd').onclick=()=>{
    if(!selected)return ctx.toast('Select a product from the table first.');
    const qty=num(q('#pkQty').value),unit=unitOf();
    if(!unit)return ctx.toast('Choose a sellable unit.');
    if(!(qty>0))return ctx.toast('Enter a valid quantity.');
    if(qty*num(unit.factor_to_base||1)>num(selected.available_stock))return ctx.toast(`Quantity cannot be greater than the available stock (${selected.available_stock} ${selected.base_unit||''}).`);
    e.remove();
    onAdd(selected,unit,qty);
  };
  renderTable();
}
