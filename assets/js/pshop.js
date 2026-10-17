/* EMS Pharmacy Console — real server-backed screens, scoped by shop permission. */
const $=s=>document.querySelector(s);
const esc=(ctx,x)=>ctx.esc(x??'');
const escapeHtml=x=>String(x??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney=(ctx,x)=>`৳ ${ctx.money(Number(x||0))}`;
const fmtDate=x=>x?new Date(x+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const isoToday=()=>new Date().toISOString().slice(0,10);
const clampNum=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
const icon=(ctx,name)=>ctx.lucide?ctx.lucide(name):'';
const button=(ctx,text,kind='soft',attrs='')=>`<button type="button" class="psh-btn ${kind==='primary'?'psh-btn-primary':kind==='soft'?'psh-btn-soft':kind==='danger'?'psh-btn-danger':''}" ${attrs}>${text}</button>`;
const heading=(ctx,actions='')=>`<div class="psh-toolbar">${actions}</div>`;
const card=(ctx,label,value,sub,tone='blue',ico='package')=>`<article class="psh-kpi psh-tone-${tone}"><span class="psh-kpi-icon" aria-hidden="true">${icon(ctx,ico)}</span><div><small>${esc(ctx,label)}</small><b>${value}</b><span>${esc(ctx,sub||'')}</span></div></article>`;
const empty=message=>`<div class="psh-empty"><span>＋</span><p>${message}</p></div>`;
const table=(headers,rows,message='No records found.')=>rows.length?`<div class="psh-table-wrap"><table class="psh-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:empty(message);
function modal(ctx,title,content,wide=false){const e=document.createElement('div');e.className='psh-modal';e.innerHTML=`<section class="psh-modal-card ${wide?'wide':''}" role="dialog" aria-modal="true"><header><div><span class="psh-kicker">PHARMACY WORKSPACE</span><h2>${esc(ctx,title)}</h2></div><button type="button" class="psh-close" aria-label="Close">×</button></header><div class="psh-modal-body">${content}</div></section>`;document.body.append(e);e.querySelector('.psh-close').onclick=()=>e.remove();e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});return e}
function input(name,label,value='',opts={}){const type=opts.type||'text',step=opts.step||'any',min=opts.min??'',placeholder=opts.placeholder||'';return `<label class="psh-field">${label}<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${type==='number'?`step="${escapeHtml(step)}" min="${escapeHtml(min)}"`:''} ${opts.required?'required':''} ${placeholder?`placeholder="${escapeHtml(placeholder)}"`:''} ${opts.readonly?'readonly':''}></label>`}
function select(name,label,options,value=''){return `<label class="psh-field">${label}<select name="${escapeHtml(name)}">${options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${String(value)===String(v)?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></label>`}
function formActions(label='Save'){return `<div class="psh-form-actions"><button class="psh-btn psh-btn-primary" type="submit">${label}</button></div>`}
function rowAction(id,action,label){return `<button type="button" class="psh-icon-btn" data-psh-${action}="${id}" title="${label}" aria-label="${label}">${label}</button>`}
function assertCurrent(ctx){return !ctx.isCurrent||ctx.isCurrent()}
function page(ctx,html){if(assertCurrent(ctx)&&$('#page'))$('#page').innerHTML=html}
function statusPill(text,tone='good'){return `<span class="psh-status psh-status-${tone}">${text}</span>`}
function productLabel(p){return [p.name,p.strength,p.dosage_form].filter(Boolean).join(' · ')}
function setNotice(ctx,text,type='info'){const box=$('#pshNotice');if(box){box.hidden=!text;box.className=`psh-notice psh-notice-${type}`;box.textContent=text}}

function productModal(ctx,product,products,suppliers,manufacturers,shelves,categories,refresh){
 const units=product?.units?.length?product.units:[{unit_label:product?.base_unit||'tablet',factor_to_base:1,can_purchase:true,can_sell:true,allow_fractional:false,selling_price:product?.sale_price||0,purchase_price:product?.purchase_price||0}];
 const unitOptions=['piece','tablet','capsule','strip','blister','box','bottle','tube','vial','ampoule','sachet','ml','g','other'];
  const unitSelect=(cur='')=>{const list=[...unitOptions];if(cur&&!list.includes(cur))list.unshift(cur);return `<select aria-label="Unit name" data-unit-name class="psh-unit-select">${list.map(v=>`<option value="${esc(ctx,v)}" ${v===cur?'selected':''}>${esc(ctx,v)}</option>`).join('')}</select>`};
 const dosageForms=['tablet','capsule','syrup','suspension','drops','cream','ointment','injection','inhaler','medical device','hygiene','healthcare supply','other'];
 const categoryList=[...new Set([...(Array.isArray(categories)?categories:[]),...(products||[]).map(p=>p.category),product?.category,'Medicine'].map(x=>String(x??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const category=String(product?.category||'Medicine');
 const categoryMarkup=`<div class="psh-field psh-category-field"><label for="pshProductCategory">Category</label><div class="psh-category-control"><select id="pshProductCategory" name="category" required>${categoryList.map(v=>`<option value="${esc(ctx,v)}" ${v===category?'selected':''}>${esc(ctx,v)}</option>`).join('')}</select><button type="button" id="pshCategoryToggle" class="psh-category-add-toggle">＋ Add category</button></div><div id="pshNewCategoryPanel" class="psh-category-add-panel" hidden><label class="psh-field" for="pshNewCategory">New category<input id="pshNewCategory" type="text" maxlength="80" autocomplete="off" placeholder="e.g. First aid"></label><button type="button" id="pshCategorySave" class="psh-btn psh-btn-primary">Add</button></div><small>Choose a store category or add a new one.</small></div>`;
 const unitRows=units.map(u=>`<div class="psh-unit-row" data-psh-unit-row>${unitSelect(u.unit_label)}<input type="number" min="0.000001" step="any" data-unit-factor value="${u.factor_to_base}" aria-label="Units in base"><input type="number" min="0" step="0.01" data-unit-price value="${u.selling_price??''}" placeholder="Sell price" aria-label="Selling price"><label><input type="checkbox" data-unit-purchase ${u.can_purchase?'checked':''}> Buy</label><label><input type="checkbox" data-unit-sell ${u.can_sell?'checked':''}> Sell</label><button type="button" data-unit-remove aria-label="Remove unit">×</button></div>`).join('');
 const maker=String(product?.manufacturer||product?.brand||'');
 const makerOptions=manufacturers.map(m=>m.name);
 if(maker&&!makerOptions.some(x=>x.toLowerCase()===maker.toLowerCase()))makerOptions.push(maker);
 const selectedShelf=String(product?.default_location_id||'');
 const form=`<form id="pshProductForm" class="psh-form"><div class="psh-form-section"><h3>Basic information</h3><div class="psh-form-grid">
 <label class="psh-field">Medicine Name<input name="name" required maxlength="180" value="${esc(ctx,product?.name||'')}"></label>
 <label class="psh-field">Generic<input name="generic_name" maxlength="180" value="${esc(ctx,product?.generic_name||'')}"></label>
 <label class="psh-field" id="pshStrengthLabel">Strength<input name="strength" id="pshStrength" list="pshStrengthSuggestions" placeholder="e.g. 500 mg per tablet" value="${esc(ctx,product?.strength||'')}"><datalist id="pshStrengthSuggestions"></datalist></label>
 <label class="psh-field">Dosage Form<select name="dosage_form" id="pshDosageForm">${dosageForms.map(v=>`<option value="${esc(ctx,v)}" ${product?.dosage_form===v?'selected':''}>${esc(ctx,v)}</option>`).join('')}</select></label>
 <label class="psh-field">Manufacturer<select name="manufacturer"><option value="">Select manufacturer</option>${makerOptions.sort((a,b)=>a.localeCompare(b)).map(v=>`<option value="${esc(ctx,v)}" ${v.toLowerCase()===maker.toLowerCase()?'selected':''}>${esc(ctx,v)}</option>`).join('')}</select><small>Manage names under Supplier &amp; Manufacturer.</small></label>
 <label class="psh-field">Supplier<select name="supplier_id"><option value="">No default supplier</option>${suppliers.map(x=>`<option value="${esc(ctx,x.id)}" ${product?.supplier_id===x.id?'selected':''}>${esc(ctx,x.name)}</option>`).join('')}</select></label>
 ${categoryMarkup}
 <label class="psh-field">Pack Size<input name="pack_size" maxlength="120" value="${esc(ctx,product?.pack_size||'')}" placeholder="e.g. 10 tablets per strip"><small>Description only; set actual quantities in Pack conversions below.</small></label>
 </div></div><details class="psh-product-options"><summary>Optional pricing, stock &amp; pack units</summary><div class="psh-form-grid">
 <label class="psh-field">Barcode<input name="barcode" value="${esc(ctx,product?.barcode||'')}" autocomplete="off"></label>
 <label class="psh-field">SKU<input name="sku" value="${esc(ctx,product?.sku||'')}" placeholder="Leave blank to auto-generate"></label>
 <label class="psh-field">Base stock unit<select name="base_unit">${unitOptions.map(v=>`<option value="${esc(ctx,v)}" ${(product?.base_unit||'tablet')===v?'selected':''}>${esc(ctx,v)}</option>`).join('')}</select><small>Medicine stock is stored in this unit.</small></label>
 <label class="psh-field">Purchase price per base unit<input name="purchase_price" type="number" min="0" step="0.01" value="${product?.purchase_price??0}"></label>
 <label class="psh-field">MRP / Retail Price per base unit<input name="sale_price" type="number" min="0" step="0.01" required value="${product?.sale_price??0}"></label>
 <label class="psh-field">Wholesale Price per base unit<input name="wholesale_price" type="number" min="0" step="0.01" value="${product?.wholesale_price??0}"></label>
 <label class="psh-field">Low-Stock Alert<input name="reorder_threshold" type="number" min="0" step="0.001" value="${product?.reorder_threshold??5}"></label>
 <label class="psh-field">Rack / Shelf<select name="default_location_id"><option value="">No rack / shelf</option>${shelves.filter(x=>x.active||String(x.id)===selectedShelf).map(x=>`<option value="${esc(ctx,x.id)}" ${String(x.id)===selectedShelf?'selected':''}>${esc(ctx,x.label)}</option>`).join('')}</select><small>Location label only; stock remains aggregate.</small></label>
 </div><section class="psh-unit-editor"><header><div><b>Pack conversions</b><small>Set how many base units each purchase or sale unit contains. No preset conversion is assumed.</small></div><button type="button" id="pshAddUnit" class="psh-text-btn">＋ Add unit</button></header><div class="psh-unit-head"><span>Unit</span><span>Base units in pack</span><span>Selling price</span><span>Buy / sell</span></div><div id="pshUnitRows">${unitRows}</div></section></details>${formActions(product?'Save medicine':'Add medicine')}</form>`;
 const e=modal(ctx,product?'Edit medicine':'Add medicine',form,true),rows=e.querySelector('#pshUnitRows');
 const categorySelect=e.querySelector('#pshProductCategory'),newCategoryPanel=e.querySelector('#pshNewCategoryPanel'),newCategoryInput=e.querySelector('#pshNewCategory'),categorySave=e.querySelector('#pshCategorySave');
 e.querySelector('#pshCategoryToggle').onclick=()=>{newCategoryPanel.hidden=!newCategoryPanel.hidden;if(!newCategoryPanel.hidden)newCategoryInput.focus()};
 const saveCategory=async()=>{const name=newCategoryInput.value.trim();if(!name)return newCategoryInput.focus();const existing=[...categorySelect.options].find(o=>o.value.trim().toLowerCase()===name.toLowerCase());if(existing){categorySelect.value=existing.value;newCategoryInput.value='';newCategoryPanel.hidden=true;return}categorySave.disabled=true;try{const result=await ctx.api('pharmacy/categories',{method:'POST',body:JSON.stringify({category:name})}),savedName=String(result?.category||name),option=[...categorySelect.options].find(o=>o.value.trim().toLowerCase()===savedName.toLowerCase());if(!option)categorySelect.add(new Option(savedName,savedName));categorySelect.value=option?.value||savedName;if(Array.isArray(categories)&&!categories.some(x=>String(x).trim().toLowerCase()===savedName.toLowerCase()))categories.push(savedName);newCategoryInput.value='';newCategoryPanel.hidden=true;ctx.toast(result?.added===false?'Existing category selected.':'Category added.')}catch(err){ctx.toast(err.message)}finally{categorySave.disabled=false}};
 categorySave.onclick=saveCategory;newCategoryInput.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();saveCategory()}};
 const strengthOptions={
  tablet:{label:'Strength per tablet',placeholder:'e.g. 500 mg per tablet'},
  capsule:{label:'Strength per capsule',placeholder:'e.g. 250 mg per capsule'},
  syrup:{label:'Concentration',placeholder:'e.g. 125 mg/5 mL'},
  suspension:{label:'Concentration',placeholder:'e.g. 100 mg/5 mL'},
  drops:{label:'Concentration',placeholder:'e.g. 10 mg/mL'},
  cream:{label:'Strength / concentration',placeholder:'e.g. 1% or 10 mg/g'},
  ointment:{label:'Strength / concentration',placeholder:'e.g. 1% or 10 mg/g'},
  injection:{label:'Concentration',placeholder:'e.g. 10 mg/mL'},
  inhaler:{label:'Strength per actuation',placeholder:'e.g. 100 mcg/actuation'},
  'medical device':{label:'Specification / size',placeholder:'e.g. adult medium'},
  hygiene:{label:'Specification / size',placeholder:'e.g. 500 mL'},
  'healthcare supply':{label:'Specification / size',placeholder:'e.g. sterile, 10 cm'},
  other:{label:'Strength / specification',placeholder:'Enter strength or specification'}
 };
 const updateStrength=()=>{const cfg=strengthOptions[e.querySelector('#pshDosageForm').value]||strengthOptions.other,label=e.querySelector('#pshStrengthLabel'),field=e.querySelector('#pshStrength');label.firstChild.textContent=cfg.label;field.placeholder=cfg.placeholder};
 e.querySelector('#pshDosageForm').onchange=updateStrength;updateStrength();
 const bindUnits=()=>{rows.querySelectorAll('[data-unit-remove]').forEach(b=>b.onclick=()=>{if(rows.querySelectorAll('[data-psh-unit-row]').length>1)b.closest('[data-psh-unit-row]').remove()});};bindUnits();
 e.querySelector('#pshAddUnit').onclick=()=>{rows.insertAdjacentHTML('beforeend',`<div class="psh-unit-row" data-psh-unit-row>${unitSelect('strip')}<input type="number" min="0.000001" step="any" data-unit-factor value="1" aria-label="Units in base"><input type="number" min="0" step="0.01" data-unit-price placeholder="Sell price" aria-label="Selling price"><label><input type="checkbox" data-unit-purchase> Buy</label><label><input type="checkbox" data-unit-sell checked> Sell</label><button type="button" data-unit-remove aria-label="Remove unit">×</button></div>`);bindUnits()};
 e.querySelector('#pshProductForm').onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target),data=Object.fromEntries(fd);data.prescription_required=product?.prescription_required??false;data.description=product?.description||'';data.units=[...rows.querySelectorAll('[data-psh-unit-row]')].map(r=>({unit_label:r.querySelector('[data-unit-name]').value.trim(),factor_to_base:Number(r.querySelector('[data-unit-factor]').value||0),selling_price:r.querySelector('[data-unit-price]').value===''?null:Number(r.querySelector('[data-unit-price]').value),can_purchase:r.querySelector('[data-unit-purchase]').checked,can_sell:r.querySelector('[data-unit-sell]').checked})).filter(u=>u.unit_label);const baseLabel=String(data.base_unit||'tablet').toLowerCase();let baseRow=data.units.find(u=>u.unit_label.toLowerCase()===baseLabel);if(!baseRow){baseRow={unit_label:baseLabel,factor_to_base:1,can_purchase:true,can_sell:true};data.units.unshift(baseRow)}baseRow.factor_to_base=1;baseRow.can_sell=true;baseRow.selling_price=Number(data.sale_price||0);if(baseRow.purchase_price===undefined)baseRow.purchase_price=Number(data.purchase_price||0);try{await ctx.api(product?`pharmacy/products/${product.id}`:'pharmacy/products',{method:product?'PATCH':'POST',body:JSON.stringify(data)});e.remove();ctx.toast('Medicine saved.');refresh()}catch(err){ctx.toast(err.message)}};
}
const pCatOf=p=>String(p.category||'').trim();
const pIsLow=p=>!!p.active&&Number(p.available_stock||0)<=Number(p.reorder_threshold||0);
const pSkel=(ctx,text)=>`<div class="shp-empty"><i></i><p>${esc(ctx,text)}</p></div>`;

export async function pshopProducts(ctx,keep=null){
 const [products,suppliers,manufacturers,shelves,quarantine,pharmacyCategories]=await Promise.all([
   ctx.api('pharmacy/products'),
   ctx.api('supplier').catch(()=>[]),
   ctx.api('pharmacy/manufacturers'),
   ctx.api('pharmacy/shelves'),
   ctx.api('pharmacy/quarantine').catch(()=>[]),
   ctx.api('pharmacy/categories').catch(()=>[]),
 ]);
 if(!assertCurrent(ctx))return;
 const savedCategories=Array.isArray(pharmacyCategories)?pharmacyCategories:[];
 const st=keep||{status:'all',lowOnly:false,cat:'all',query:'',tab:'medicines'};
 const canAdd=ctx.canAccess('inventory','add'),canEdit=ctx.canAccess('inventory','edit'),canDelete=ctx.canAccess('inventory','delete');
 const cats=[...new Set(products.map(pCatOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const reload=()=>pshopProducts(ctx,st);

 const filtered=()=>{
   const q=st.query.trim().toLowerCase();
   return products.filter(p=>{
     if(st.status==='active'&&!p.active)return false;
     if(st.status==='inactive'&&p.active)return false;
     if(st.lowOnly&&!pIsLow(p))return false;
     if(st.cat==='__none__'&&pCatOf(p))return false;
     if(st.cat!=='all'&&st.cat!=='__none__'&&pCatOf(p)!==st.cat)return false;
     if(q&&![p.name,p.generic_name,p.manufacturer,p.strength,p.sku,p.barcode,p.dosage_form,p.category,p.pack_size].filter(Boolean).join(' ').toLowerCase().includes(q))return false;
     return true;
   });
 };

 const medTable=list=>{
   if(!list.length)return pSkel(ctx,'No medicines match these filters.');
   return `<div class="shp-tw"><table><thead><tr>
     <th>SKU</th><th>Medicine</th><th>Category</th><th>Base unit</th><th>MRP / base unit</th><th>Stock</th><th>Status</th><th>Actions</th>
   </tr></thead><tbody>${list.map(p=>{
     const stock=Number(p.available_stock||0);
     const stockCell=`${esc(ctx,stock)} ${esc(ctx,p.base_unit||'')}${stock<=0?' <span class="shp-badge shp-t-rose">Out</span>':pIsLow(p)?' <span class="shp-low">LOW</span>':''}`;
     return `<tr>
       <td><code>${esc(ctx,p.sku||'—')}</code></td>
       <td class="shp-wrap"><b>${esc(ctx,productLabel(p))}</b>${p.generic_name?`<br><small class="shp-desc">${esc(ctx,p.generic_name)}</small>`:''}</td>
       <td>${esc(ctx,pCatOf(p)||'Uncategorized')}</td>
       <td>${esc(ctx,p.base_unit||'—')}</td>
       <td>${fmtMoney(ctx,p.sale_price)}</td>
       <td>${stockCell}</td>
       <td>${p.active?'<span class="shp-badge shp-t-emerald">Active</span>':'<span class="shp-badge shp-t-zinc">Inactive</span>'}</td>
       <td><span style="display:inline-flex;gap:6px">
         <button class="shp-btn shp-btn-soft shp-btn-sm" data-psh-edit-product="${esc(ctx,p.id)}" ${canEdit?'':'disabled'}>Edit</button>
         <button class="shp-btn ${p.active?'shp-btn-danger':'shp-btn-primary'} shp-btn-sm" data-psh-toggle-product="${esc(ctx,p.id)}" ${canEdit?'':'disabled'}>${p.active?'Deactivate':'Activate'}</button>
         <button class="shp-btn shp-btn-danger shp-btn-sm" data-psh-delete-product="${esc(ctx,p.id)}" ${canDelete?'':'disabled'} title="Delete only if there is no stock or transaction history">Delete</button>
       </span></td>
     </tr>`;}).join('')}</tbody></table></div>`;
 };

 const quarantineTable=list=>{
   const banner=`<div style="background:color-mix(in srgb,#f43f5e 10%,transparent);border:1px solid #f43f5e;border-radius:8px;padding:12px 16px;margin-bottom:14px">
     <b style="color:#e11d48">Quarantined damaged or defective medicines</b>
     <div style="font-size:12px;color:var(--shp-text2);margin-top:2px">Held here and <b>not included in sellable stock</b>. Record returns from Return &amp; Exchange.</div></div>`;
   if(!list.length)return banner+pSkel(ctx,'No damaged or defective medicines in quarantine.');
   return banner+`<div class="shp-tw"><table><thead><tr>
     <th>Medicine</th><th>Condition</th><th>Quarantined qty</th><th>Return no.</th><th>Original invoice</th><th>Customer</th><th>Reason</th><th>Date</th>
   </tr></thead><tbody>${list.map(x=>`<tr>
     <td class="shp-wrap"><b>${esc(ctx,retProdName(x))}</b></td>
     <td>${x.condition==='defective'?'<span class="shp-badge shp-t-rose">Defective</span>':'<span class="shp-badge shp-t-amber">'+esc(ctx,retCondLabel(x.condition))+'</span>'}</td>
     <td><b style="color:#e11d48">${esc(ctx,x.quantity_base)}</b> ${esc(ctx,x.base_unit||'')}<br><small class="shp-desc">Excluded from stock</small></td>
     <td><code>${esc(ctx,x.return_number)}</code></td>
     <td><code>${esc(ctx,x.invoice_number)}</code></td>
     <td class="shp-wrap">${esc(ctx,x.customer_name||'Walk-in customer')}</td>
     <td class="shp-wrap">${esc(ctx,x.reason||'—')}</td>
     <td>${fmtDate(x.return_date)}</td>
   </tr>`).join('')}</tbody></table></div>`;
 };

 const render=()=>{
   const list=filtered();
   const lowAll=products.filter(pIsLow).length;
   const catChips=`<div class="shp-chips shp-cat-chips" id="pshCatChips">
     <button class="shp-chip ${st.cat==='all'?'on':''}" data-cat="all">All categories</button>
     ${cats.map(c=>`<button class="shp-chip ${st.cat===c?'on':''}" data-cat="${esc(ctx,c)}">${esc(ctx,c)}</button>`).join('')}
     <button class="shp-chip ${st.cat==='__none__'?'on':''}" data-cat="__none__">Uncategorized</button>
     <button class="shp-chip ${st.tab==='quarantine'?'on':''}" data-tab="quarantine" style="border-color:#f43f5e"><span class="shp-badge shp-t-rose" style="margin-right:4px;font-size:10px">Quarantine</span>Damaged / defective (${quarantine.length})</button>
   </div>`;
   const toolbar=`<div class="shp-toolbar">
     ${canAdd?'<button class="shp-btn shp-btn-primary" id="pshAddProduct">+ Add medicine</button>':''}
     <div class="shp-chips">
       <button class="shp-chip ${st.status==='all'?'on':''}" data-status="all">All</button>
       <button class="shp-chip ${st.status==='active'?'on':''}" data-status="active">Active</button>
       <button class="shp-chip ${st.status==='inactive'?'on':''}" data-status="inactive">Inactive</button>
       <button class="shp-chip ${st.lowOnly?'on':''}" id="pshLowOnly">Low stock (${lowAll})</button>
     </div>
     <input id="pshProductSearch" class="shp-search" placeholder="Search medicine, generic, manufacturer, strength, SKU or barcode" value="${esc(ctx,st.query)}">
   </div>`;
   const body=st.tab==='quarantine'?quarantineTable(quarantine.filter(x=>JSON.stringify(x).toLowerCase().includes(st.query.trim().toLowerCase()))):medTable(list);
   const count=st.tab==='quarantine'?`${quarantine.length} quarantined record${quarantine.length===1?'':'s'}`:`${list.length} of ${products.length} medicine${products.length===1?'':'s'}`;
   const pageEl=document.querySelector('#page');
   if(!pageEl)return;
   pageEl.innerHTML=`${toolbar}${catChips}<p class="shp-desc" style="margin:0 0 10px">${esc(ctx,count)}</p><div class="shp-pagegap" id="pshProductData">${body}</div>`;
   bind();
 };

 const bind=()=>{
   const search=document.querySelector('#pshProductSearch');
   if(search)search.oninput=e=>{st.query=e.target.value;const pos=e.target.selectionStart;render();const next=document.querySelector('#pshProductSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch{}}};
   document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{st.status=b.dataset.status;st.tab='medicines';render()});
   const low=document.querySelector('#pshLowOnly');if(low)low.onclick=()=>{st.lowOnly=!st.lowOnly;st.tab='medicines';render()};
   document.querySelectorAll('#pshCatChips [data-cat]').forEach(b=>b.onclick=()=>{st.cat=b.dataset.cat;st.tab='medicines';render()});
   document.querySelectorAll('#pshCatChips [data-tab]').forEach(b=>b.onclick=()=>{st.tab=st.tab==='quarantine'?'medicines':'quarantine';render()});
   document.querySelectorAll('[data-psh-edit-product]').forEach(b=>b.onclick=()=>productModal(ctx,products.find(x=>x.id===b.dataset.pshEditProduct),products,suppliers,manufacturers,shelves,savedCategories,reload));
   document.querySelectorAll('[data-psh-toggle-product]').forEach(b=>b.onclick=async()=>{
     const p=products.find(x=>x.id===b.dataset.pshToggleProduct);if(!p)return;
     const next=!p.active;
     if(!next&&!confirm(`Deactivate ${productLabel(p)}? It will be hidden from POS and cannot be sold until it is activated again.`))return;
     b.disabled=true;
     try{
       await ctx.api(`pharmacy/products/${encodeURIComponent(p.id)}/status`,{method:'POST',body:JSON.stringify({active:next})});
       ctx.toast(`${productLabel(p)} ${next?'activated':'deactivated'}.`);
       await reload();
     }catch(err){b.disabled=false;ctx.toast(err.message)}
   });
   document.querySelectorAll('[data-psh-delete-product]').forEach(b=>b.onclick=async()=>{
     const p=products.find(x=>x.id===b.dataset.pshDeleteProduct);if(!p)return;
     if(!confirm(`Permanently delete ${productLabel(p)}? Deletion is allowed only when the medicine has zero stock and no transaction history. Deactivate it instead to keep records.`))return;
     b.disabled=true;
     try{await ctx.api(`pharmacy/products/${encodeURIComponent(p.id)}`,{method:'DELETE'});ctx.toast(`${productLabel(p)} deleted.`);await reload()}catch(err){b.disabled=false;ctx.toast(err.message)}
   });
   const add=document.querySelector('#pshAddProduct');if(add)add.onclick=()=>productModal(ctx,null,products,suppliers,manufacturers,shelves,savedCategories,reload);
 };
 render();
}

export async function pshopDashboard(ctx){
 const data=await ctx.api('pharmacy/overview');if(!assertCurrent(ctx))return;
 const m=data.metrics||{},weekly=data.weekly||[],recent=data.recent||[],activity=data.activity||[];
 const kpi=(name,value,detail,tone,ico,money=false)=>`<section class="shp-card shp-kpi psh-overview-kpi"><div class="shp-kpi-top"><span class="shp-chipic shp-t-${tone}" aria-hidden="true">${icon(ctx,ico)}</span><span class="shp-kicker">${name}</span></div><b class="shp-kpi-val">${money?fmtMoney(ctx,value):esc(ctx,value??0)}</b><span class="shp-kpi-foot">${detail}</span></section>`;
 const todayBars=[['Sales',m.salesToday,'emerald'],['Purchases',m.purchasesToday,'amber'],['Customer due',m.customerDueToday,'sky'],['Supplier due',m.supplierDueToday,'violet']];
 const todayMax=Math.max(1,...todayBars.map(([,value])=>Number(value)||0)),weekMax=Math.max(1,...weekly.flatMap(x=>[Number(x.sales)||0,Number(x.purchases)||0]));
 const weekSales=weekly.reduce((sum,x)=>sum+Number(x.sales||0),0),weekPurchases=weekly.reduce((sum,x)=>sum+Number(x.purchases||0),0);
 const viewTime=x=>{const date=new Date(x);return Number.isFinite(date.getTime())?date.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'};
 page(ctx,`<div class="psh-overview-head"><div><span class="psh-kicker">PHARMACY · OVERVIEW</span><h2>Dashboard</h2><p>Sales, stock, and shop activity in one place.</p></div>${button(ctx,'Refresh data','soft','id="pshDashboardRefresh"')}</div>
 <div class="shp-grid shp-kpis shp-anim-kpis psh-overview-kpis">
  ${kpi('Sales',m.sales,`Today: ${fmtMoney(ctx,m.salesToday)}`,'emerald','receipt',true)}
  ${kpi('Purchases',m.purchases,`Today: ${fmtMoney(ctx,m.purchasesToday)}`,'amber','cart',true)}
  ${kpi('Customer due',m.customerDue,`On today’s invoices: ${fmtMoney(ctx,m.customerDueToday)}`,'sky','coins',true)}
  ${kpi('Supplier due',m.supplierDue,`On today’s invoices: ${fmtMoney(ctx,m.supplierDueToday)}`,'violet','truck',true)}
  ${kpi('Stock value',m.stockValue,'On-hand inventory at average cost','cyan','package',true)}
  ${kpi('Active medicines',m.medicines,'In the pharmacy catalog','blue','pill')}
  ${kpi('Low stock',m.lowStock,'At or below reorder level','amber','alert-triangle')}
  ${kpi('Out of stock',m.outOfStock,'No units on hand','rose','bell')}
 </div>
 <div class="shp-grid shp-anim-panels psh-overview-panels">
  <section class="shp-panel psh-financial-panel"><div class="shp-panel-head"><div><h3>Today’s financial chart</h3><p class="shp-desc">Invoice totals and remaining dues on today’s pharmacy invoices.</p></div><span class="shp-badge shp-t-emerald shp-live"><i></i>Live</span></div><div class="shp-ftotal"><span>Sales + purchases today</span><b>${fmtMoney(ctx,Number(m.salesToday||0)+Number(m.purchasesToday||0))}</b></div><div class="shp-fchart">${todayBars.map(([name,value,tone])=>`<div class="shp-fbar shp-t-${tone}"><div class="shp-fbar-track" role="img" aria-label="${name}: ${fmtMoney(ctx,value)}"><i style="height:${Math.max(0,Number(value||0)/todayMax*100)}%"></i></div><b>${fmtMoney(ctx,value)}</b><small>${name}</small></div>`).join('')}</div></section>
  <section class="shp-panel psh-week-panel"><div class="shp-panel-head"><div><h3>Last 7 days</h3><p class="shp-desc">Sales vs. purchases by invoice date (UTC).</p></div><div class="psh-week-legend"><span><i class="sale"></i> Sales</span><span><i class="purchase"></i> Purchases</span></div></div><div class="psh-week-totals"><span>Sales <b>${fmtMoney(ctx,weekSales)}</b></span><span>Purchases <b>${fmtMoney(ctx,weekPurchases)}</b></span></div><div class="psh-week-chart" aria-label="Daily pharmacy sales and purchases">${weekly.map(x=>`<div class="psh-week-day" role="img" aria-label="${fmtDate(x.date)}: sales ${fmtMoney(ctx,x.sales)}, purchases ${fmtMoney(ctx,x.purchases)}"><div class="psh-week-bars"><i class="sale" style="height:${Math.max(0,Number(x.sales||0)/weekMax*100)}%"></i><i class="purchase" style="height:${Math.max(0,Number(x.purchases||0)/weekMax*100)}%"></i></div><span>${fmtDate(x.date).slice(0,6)}</span></div>`).join('')}</div></section>
 </div>
 <div class="shp-grid shp-anim-panels psh-overview-panels psh-overview-lists">
  <section class="shp-panel psh-activity-panel"><div class="shp-panel-head"><div><h3>Recent activity</h3><p class="shp-desc">Shop actions in the last 24 hours.</p></div>${ctx.canAccess('settings','view')?button(ctx,'Full audit log →','soft','data-psh-go="audit-log"'):''}</div>${activity.length?`<div class="psh-activity-list">${activity.map(x=>`<div class="psh-activity-item"><span class="psh-activity-dot" aria-hidden="true"></span><div><b>${esc(ctx,String(x.action||'Activity').replaceAll('_',' '))}</b><small>${esc(ctx,x.entity_type||'Shop')} · ${esc(ctx,x.actor_name||'System')}</small></div><time datetime="${esc(ctx,x.created_at||'')}">${esc(ctx,viewTime(x.created_at))}</time></div>`).join('')}</div>`:pSkel(ctx,'No shop activity in the last 24 hours.')}</section>
  <section class="shp-panel psh-transactions-panel"><div class="shp-panel-head"><div><h3>Recent transactions</h3><p class="shp-desc">Latest pharmacy sales and purchases.</p></div><span class="shp-kicker">${recent.length} shown</span></div>${recent.length?`<div class="shp-tw shp-anim-rows"><table><thead><tr><th>Invoice</th><th>Type</th><th>Party</th><th>Total</th><th>Paid</th><th>Due</th><th>Posted</th></tr></thead><tbody>${recent.map(x=>`<tr><td><b>${esc(ctx,x.invoice_number||'—')}</b></td><td><span class="shp-tag shp-t-${x.kind==='purchase'?'amber':'emerald'}">${x.kind==='purchase'?'Purchase':'Sale'}</span></td><td>${esc(ctx,x.party_name||'Walk-in')}</td><td>${fmtMoney(ctx,x.total)}</td><td>${fmtMoney(ctx,x.paid_amount)}</td><td>${fmtMoney(ctx,x.total_due)}</td><td>${esc(ctx,viewTime(x.created_at||x.invoice_date))}</td></tr>`).join('')}</tbody></table></div>`:pSkel(ctx,'No pharmacy transactions yet.')}</section>
 </div>`);
 $('#pshDashboardRefresh').onclick=()=>pshopDashboard(ctx);
 document.querySelectorAll('[data-psh-go]').forEach(b=>b.onclick=()=>ctx.navigate(b.dataset.pshGo));
}

export async function pshopPOS(ctx){
 const [allProducts,customers]=await Promise.all([ctx.api('pharmacy/products?for=pos'),ctx.api('invoice-parties?kind=sale').catch(()=>[])]);const products=allProducts.filter(p=>p.active);if(!assertCurrent(ctx))return;
 const cart=new Map();let category='all';const actions='';let posView='card';try{posView=localStorage.getItem('ems.pharmacy.posView')==='list'?'list':'card'}catch{}
 page(ctx,`${heading(ctx,actions)}<section class="psh-panel psh-pos-head"><div><span class="psh-kicker">FAST COUNTER BILLING</span><h2>Pharmacy POS</h2><p>Scan a barcode or search by medicine, generic name, manufacturer or SKU. Stock is checked as one aggregate quantity per medicine.</p></div></section><div class="psh-pos-layout"><section class="psh-panel psh-pos-catalog"><div class="psh-pos-catalog-tools"><div class="psh-pos-search"><input id="pshPosSearch" class="psh-search" placeholder="Scan barcode or search medicines" autocomplete="off"><button id="pshBarcodeGo" class="psh-btn psh-btn-primary">Add</button></div><div id="pshPosViewToggle" class="psh-pos-view-toggle"></div></div><div class="psh-category-chips" id="pshCategories"></div><div id="pshPosProducts" class="psh-pos-products"></div></section><aside class="psh-panel psh-pos-cart"><header class="psh-panel-head"><div><span class="psh-kicker">CHECKOUT</span><h2>Current sale</h2></div><b class="psh-invoice-id">EMS invoice no. on post</b></header><div id="pshCartLines"></div><div class="psh-form-grid">${select('customer_id','Customer',[['','Walk-in customer'],...customers.map(c=>[c.id,c.name])])}${input('invoice_date','Sale date',isoToday(),{type:'date',required:true})}${select('payment_method','Payment method',[['cash','Cash'],['bank','Bank'],['bkash','bKash'],['nagad','Nagad'],['other','Other']])}${input('transaction_id','Transaction reference','',{placeholder:'Optional'})}${input('tax_percent','Invoice tax %',0,{type:'number',min:'0',step:'0.001'})}${input('discount','Invoice discount',0,{type:'number',min:'0',step:'0.01'})}${input('paid_amount','Paid now',0,{type:'number',min:'0',step:'0.01'})}</div><div class="psh-total-box"><div><span>Subtotal</span><b id="pshSubtotal">${fmtMoney(ctx,0)}</b></div><div><span>Tax & line discounts</span><b id="pshLineTotals">${fmtMoney(ctx,0)}</b></div><div class="grand"><span>Total</span><b id="pshGrandTotal">${fmtMoney(ctx,0)}</b></div><div><span>Due after payment</span><b id="pshDue">${fmtMoney(ctx,0)}</b></div></div><button class="psh-btn psh-btn-primary psh-checkout" id="pshCheckout">Complete sale</button><small class="psh-help">Posting deducts stock and uses weighted-average cost for Pharmacy COGS. Stock is rechecked by the server.</small><p id="pshNotice" class="psh-notice" hidden></p></aside></div>`);
 document.querySelectorAll('[data-psh-go]').forEach(b=>b.onclick=()=>ctx.navigate(b.dataset.pshGo));
 const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort();$('#pshCategories').innerHTML=`<button class="psh-chip on" data-psh-cat="all">All</button>${categories.map(c=>`<button class="psh-chip" data-psh-cat="${esc(ctx,c)}">${esc(ctx,c)}</button>`).join('')}`;
 function drawProducts(){
  const q=$('#pshPosSearch').value.toLowerCase(),list=products.filter(p=>(category==='all'||p.category===category)&&(!q||[p.name,p.generic_name,p.manufacturer,p.brand,p.sku,p.barcode,p.strength,p.dosage_form].join(' ').toLowerCase().includes(q)));
  $('#pshPosViewToggle').innerHTML=`<div class="psh-view-toggle" role="group" aria-label="Medicine view"><button type="button" data-pos-view="card" aria-pressed="${posView==='card'}" class="${posView==='card'?'on':''}">▦ Cards</button><button type="button" data-pos-view="list" aria-pressed="${posView==='list'}" class="${posView==='list'?'on':''}">☷ List</button></div>`;
  const low=p=>Number(p.available_stock||0)<=Number(p.reorder_threshold||0);
  const cards=list.map(p=>`<button type="button" class="psh-pos-product" data-psh-add="${p.id}" ${Number(p.available_stock||0)<=0?'disabled':''}><span class="psh-pos-product-icon">${icon(ctx,'pill')||icon(ctx,'package')}</span><b>${esc(ctx,productLabel(p))}</b><small>${esc(ctx,p.manufacturer||p.brand||p.generic_name||p.sku)} · ${esc(ctx,p.available_stock||0)} ${esc(ctx,p.base_unit)} on hand</small><strong>${fmtMoney(ctx,p.sale_price)}</strong>${low(p)?'<i class="psh-low-note">Low stock</i>':''}</button>`).join('');
  const rows=list.map(p=>`<button type="button" class="psh-pos-product psh-pos-row" data-psh-add="${p.id}" ${Number(p.available_stock||0)<=0?'disabled':''}><span class="psh-pos-row-main"><b>${esc(ctx,productLabel(p))}</b><small>${esc(ctx,p.manufacturer||p.brand||p.generic_name||p.sku||'')}${p.sku?' · '+esc(ctx,p.sku):''}</small></span><span class="psh-pos-row-stock">${esc(ctx,p.available_stock||0)} ${esc(ctx,p.base_unit)} on hand${low(p)?'<i class="psh-low-note">Low stock</i>':''}</span><strong>${fmtMoney(ctx,p.sale_price)}</strong></button>`).join('');
  const root=$('#pshPosProducts');root.className=`psh-pos-products ${posView==='list'?'is-list':'is-card'}`;
  root.innerHTML=list.length?(posView==='list'?rows:cards):empty('No matching medicines.');
  document.querySelectorAll('[data-pos-view]').forEach(b=>b.onclick=()=>{posView=b.dataset.posView;try{localStorage.setItem('ems.pharmacy.posView',posView)}catch{}drawProducts()});
  document.querySelectorAll('[data-psh-add]').forEach(b=>b.onclick=()=>addProduct(products.find(p=>p.id===b.dataset.pshAdd)))}
 function addProduct(p){if(!p||Number(p.available_stock||0)<=0)return ctx.toast('No stock available.');const u=p.units?.find(x=>x.can_sell)||p.units?.[0]||{unit_label:p.base_unit,factor_to_base:1,selling_price:p.sale_price};if(!cart.has(p.id))cart.set(p.id,{product:p,unit:u,quantity:1,unitPrice:Number(u.selling_price??(Number(p.sale_price||0)*Number(u.factor_to_base||1))),discount:0,taxPercent:0});drawCart()}
 function totals(){let sub=0,lineTax=0,lineDiscount=0;for(const x of cart.values()){const amount=x.quantity*x.unitPrice;sub+=amount;lineTax+=Math.round(amount*x.taxPercent)/100;lineDiscount+=x.discount}const root=$('#pshCartLines')?.closest('.psh-pos-cart'),discount=Number(root?.querySelector('[name=discount]')?.value||0),taxPercent=Number(root?.querySelector('[name=tax_percent]')?.value||0),tax=Math.round(sub*taxPercent)/100,total=Math.max(0,Math.round((sub+tax+lineTax-lineDiscount-discount)*100)/100),paid=Number(root?.querySelector('[name=paid_amount]')?.value||0),over=Array.from(cart.values()).some(x=>x.quantity*Number(x.unit.factor_to_base||1)>Number(x.product.available_stock||0)+1e-9);$('#pshSubtotal').textContent=fmtMoney(ctx,sub);$('#pshLineTotals').textContent=fmtMoney(ctx,lineTax-lineDiscount);$('#pshGrandTotal').textContent=fmtMoney(ctx,total);$('#pshDue').textContent=fmtMoney(ctx,Math.max(0,total-paid));$('#pshCheckout').disabled=!cart.size||paid>total||over;setNotice(ctx,over?'A line exceeds the medicine’s on-hand quantity. Reduce the quantity before posting.':'',over?'warning':'info')}
 function drawCart(){const root=$('#pshCartLines'),rows=[...cart.entries()].map(([id,x])=>`<div class="psh-cart-row" data-cart-product="${id}"><div class="psh-cart-product"><div class="psh-cart-head"><div><b>${esc(ctx,productLabel(x.product))}</b><small>${esc(ctx,x.product.sku||'')} · ${Number(x.product.available_stock||0)} ${esc(ctx,x.product.base_unit)} on hand</small></div><b class="psh-cart-line-total">${fmtMoney(ctx,x.quantity*x.unitPrice-x.discount)}</b></div></div><div class="psh-cart-controls"><label class="psh-cart-field psh-cart-unit">Unit<select data-cart-unit="${id}">${(x.product.units||[]).filter(u=>u.can_sell).map(u=>`<option value="${u.id}" ${String(u.id)===String(x.unit.id)?'selected':''}>${esc(ctx,u.unit_label)} · ×${esc(ctx,u.factor_to_base)}</option>`).join('')||`<option value="">${esc(ctx,x.product.base_unit)}</option>`}</select></label><label class="psh-cart-field psh-cart-qty">Qty<input type="number" min="0.001" step="any" max="${Number(x.product.available_stock||0)/Math.max(.000001,Number(x.unit.factor_to_base||1))}" value="${x.quantity}" data-cart-qty="${id}"></label><label class="psh-cart-field psh-cart-price">Price<input type="number" min="0" step="0.01" value="${x.unitPrice}" data-cart-price="${id}" ${ctx.canAccess('inventory','edit')?'':'disabled'}></label><label class="psh-cart-field psh-cart-discount">Discount<input type="number" min="0" step="0.01" value="${x.discount}" data-cart-discount="${id}"></label><button type="button" data-cart-remove="${id}" aria-label="Remove">×</button></div></div>`);root.innerHTML=rows.join('')||empty('Scan or select a medicine to begin.');root.querySelectorAll('[data-cart-unit]').forEach(el=>el.onchange=()=>{const x=cart.get(el.dataset.cartUnit),u=(x.product.units||[]).find(z=>String(z.id)===String(el.value));if(u){x.unit=u;x.unitPrice=Number(u.selling_price??(Number(x.product.sale_price||0)*Number(u.factor_to_base||1)));drawCart()}});root.querySelectorAll('[data-cart-qty],[data-cart-price],[data-cart-discount]').forEach(el=>el.oninput=el.onchange=()=>{const id=el.dataset.cartQty||el.dataset.cartPrice||el.dataset.cartDiscount,x=cart.get(id);if(!x)return;if(el.dataset.cartQty)x.quantity=Math.max(.001,Number(el.value||0));if(el.dataset.cartPrice)x.unitPrice=Math.max(0,Number(el.value||0));if(el.dataset.cartDiscount)x.discount=Math.max(0,Number(el.value||0));totals()});root.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>{cart.delete(b.dataset.cartRemove);drawCart()});root.closest('.psh-pos-cart').querySelectorAll('[name=discount],[name=tax_percent],[name=paid_amount]').forEach(el=>el.oninput=totals);totals()}
 $('#pshPosSearch').oninput=drawProducts;$('#pshPosSearch').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();addScanned()}};$('#pshBarcodeGo').onclick=addScanned;function addScanned(){const q=$('#pshPosSearch').value.trim().toLowerCase();if(!q)return;const p=products.find(x=>String(x.barcode||'').toLowerCase()===q||String(x.sku||'').toLowerCase()===q)||products.find(x=>productLabel(x).toLowerCase().includes(q)||String(x.generic_name||'').toLowerCase().includes(q));if(!p)return ctx.toast('No medicine matched that barcode or search.');addProduct(p);$('#pshPosSearch').value='';drawProducts();$('#pshPosSearch').focus()}
 document.querySelectorAll('[data-psh-cat]').forEach(b=>b.onclick=()=>{category=b.dataset.pshCat;document.querySelectorAll('[data-psh-cat]').forEach(x=>x.classList.toggle('on',x===b));drawProducts()});drawProducts();drawCart();
 $('#pshCheckout').onclick=async()=>{const button=$('#pshCheckout');if(button.disabled)return;button.disabled=true;button.textContent='Posting…';try{const body={kind:'sale',partyId:$('[name=customer_id]').value||null,invoiceDate:$('[name=invoice_date]').value,paymentMethod:$('[name=payment_method]').value,transactionId:$('[name=transaction_id]').value||null,taxPercent:Number($('[name=tax_percent]').value||0),discount:Number($('[name=discount]').value||0),paidAmount:Number($('[name=paid_amount]').value||0),idempotencyKey:crypto.randomUUID(),lines:[...cart.values()].map(x=>({productId:x.product.id,unitLabel:x.unit.unit_label,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount,taxPercent:x.taxPercent}))};const result=await ctx.api('pharmacy/checkout',{method:'POST',body:JSON.stringify(body)});cart.clear();ctx.toast(`Sale posted · ${result.invoice_number}`);ctx.navigate('sales')}catch(e){ctx.toast(e.message);button.disabled=false;button.textContent='Complete sale'}};
}

async function purchaseModal(ctx,products,suppliers,refresh){
 const [parties,number]=await Promise.all([ctx.api('invoice-parties?kind=purchase').catch(()=>suppliers||[]),ctx.api('invoice-number?kind=purchase').catch(()=>({invoiceNumber:''}))]);
 const toItem=p=>{const units=(p.units||[]).filter(u=>u.can_purchase).map(u=>({...u,purchase_price:u.purchase_price??(Number(p.purchase_price||0)*Number(u.factor_to_base||1))}));return {id:p.id,item_code:p.sku||'—',description:productLabel(p),unit:p.base_unit,sale_price:p.sale_price,total_stock:p.available_stock,category:p.category,active:true,supplier_id:p.supplier_id||null,units:units.length?units:[{id:`base-${p.id}`,unit_label:p.base_unit,factor_to_base:1,purchase_price:p.purchase_price??0,selling_price:p.sale_price??0}]}};
 const items=products.map(toItem),vault={enabled:false};
 const e=ctx.shpModal('Receive pharmacy purchase',ctx.invoiceFormHTML('purchase','supplier',parties,number,vault),'shp-modal-xl');
 e.classList.add('psh-ivmodal');
 ctx.wireInvoiceForm(e,'purchase',{parties,items,vault,onDone:()=>{e.remove();refresh()},submit:(body,lines)=>submitPharmacyPurchase(ctx,body,lines,products)});
}
async function submitPharmacyPurchase(ctx,body,lines,products){
 const supplierId=String(body.partyId||'');
 if(!supplierId)throw Error('Choose a supplier for this purchase.');
 const payloadLines=lines.map(x=>{const p=products.find(z=>String(z.id)===String(x.item.id));return {productId:x.item.id,unitLabel:x.unit?.unit_label||p?.base_unit,quantity:Number(x.quantity),freeQuantity:0,unitPrice:Number(x.unitPrice||0),salePrice:Number(p?.sale_price||0),_supplier:p?.supplier_id||null}});
 if(payloadLines.some(l=>!l.unitLabel))throw Error('Select a buy unit for each medicine.');
 if(payloadLines.some(l=>String(l._supplier||'')!==supplierId))throw Error('Each medicine must belong to the selected supplier.');
 return ctx.api('pharmacy/purchases',{method:'POST',body:JSON.stringify({supplierId,invoiceDate:body.invoiceDate,supplierReference:null,paymentMethod:body.paymentMethod,transactionId:body.transactionId||null,paidAmount:Number(body.paidAmount||0),taxPercent:Number(body.taxPercent||0),discount:Number(body.discount||0),notes:body.notes||null,idempotencyKey:crypto.randomUUID(),lines:payloadLines.map(({_supplier,...l})=>l)})});
}
/* Purchase view uses the Electronics invoice view modal (pharmacy line names are resolved inside it). */
async function viewPurchase(ctx,id){
 try{const rows=await ctx.api('invoices?kind=purchase');const r=rows.find(x=>String(x.id)===String(id));if(!r)return ctx.toast('Purchase record not found.');ctx.invoiceView(r,'Purchase invoice')}catch(e){ctx.toast(e.message)}
}

export async function pshopPurchases(ctx){
 const [rows,products,suppliers]=await Promise.all([ctx.api('pharmacy/purchases'),ctx.api('pharmacy/products'),ctx.api('invoice-parties?kind=purchase').catch(()=>[])]);if(!assertCurrent(ctx))return;
 const add=ctx.canAccess('purchase','add')?button(ctx,'＋ Receive purchase','primary','id="pshAddPurchase"'):'';
 const lines=rows.map(x=>`<tr><td><b>${esc(ctx,x.invoice_number)}</b></td><td>${esc(ctx,x.supplier_reference||x.notes||'—')}</td><td>${esc(ctx,x.party_name||'—')}</td><td>${fmtDate(x.invoice_date)}</td><td>${esc(ctx,x.item_count||0)}</td><td>${fmtMoney(ctx,x.total)}</td><td>${fmtMoney(ctx,x.paid_amount)}</td><td>${fmtMoney(ctx,x.total_due)}</td><td><div class="psh-actions"><button type="button" class="psh-btn" data-purchase-view="${x.id}">View</button><button type="button" class="psh-btn" disabled aria-disabled="true" title="Purchase editing is disabled; view the saved record instead.">Edit</button><button type="button" class="psh-btn" disabled aria-disabled="true" title="Purchase deletion is disabled to preserve the audit and stock history.">Delete</button></div></td></tr>`);
 page(ctx,`${heading(ctx,add)}<section class="psh-panel"><header class="psh-panel-head"><div><span class="psh-kicker">PURCHASING</span><h2>Pharmacy purchases</h2><p>Receive a purchase and review its history from this page. Partial payments, discount, tax and due are recorded on each invoice. Saved purchases are view-only; Edit and Delete are disabled to preserve stock and audit history.</p></div><span class="psh-count">${rows.length} purchases</span></header>${table(['EMS invoice','Supplier reference','Supplier','Date','Items','Total','Paid','Due','Actions'],lines,'No pharmacy purchases yet. Receive your first purchase to begin.')}</section>`);
 if($('#pshAddPurchase'))$('#pshAddPurchase').onclick=()=>purchaseModal(ctx,products,suppliers,()=>pshopPurchases(ctx));
 document.querySelectorAll('[data-purchase-view]').forEach(b=>b.onclick=()=>viewPurchase(ctx,b.dataset.purchaseView));
}


export async function pshopMovements(ctx){
 const rows=await ctx.api('pharmacy/movements');if(!assertCurrent(ctx))return;let query='',kind='all';const labels={purchase:'Purchase receipt',sale:'POS sale',customer_return_intake:'Customer return intake',adjustment:'Adjustment',expiry:'Legacy stock event',shelf_move:'Legacy stock movement',customer_return_restock:'Legacy return record',supplier_return:'Supplier return',legacy_stock_event:'Legacy stock movement'};
 const draw=()=>{const list=rows.filter(x=>(kind==='all'||x.movement_type===kind)&&JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));page(ctx,`${heading(ctx,`<input id="pshMovementSearch" class="psh-search" placeholder="Search medicine, invoice or reason" value="${esc(ctx,query)}"><select id="pshMovementFilter" class="psh-filter"><option value="all">All movements</option>${[...new Set(rows.map(x=>x.movement_type))].map(x=>`<option value="${esc(ctx,x)}">${esc(ctx,labels[x]||x.replaceAll('_',' '))}</option>`).join('')}</select>`)}<section class="psh-panel"><header class="psh-panel-head"><div><span class="psh-kicker">AGGREGATE STOCK HISTORY</span><h2>Stock movements</h2><p>Purchases, sales and quarantined customer returns. Quantities are stored in each medicine’s base stock unit.</p></div><span class="psh-count">Latest ${rows.length} records</span></header>${table(['Date','Medicine','Movement','Quantity','Stock before → after','Reference / reason'],list.map(x=>{const reference=x.invoice?.invoice_number||x.pharmacy_return?.return_number||(x.reference_type==='legacy_stock_event'?'Legacy stock history':x.reference_type)||'—';return `<tr><td>${fmtDate(String(x.created_at||'').slice(0,10))}</td><td><b>${esc(ctx,x.product?.name||'Medicine')}</b><small>${esc(ctx,x.product?.strength||'')}</small></td><td>${statusPill(esc(ctx,labels[x.movement_type]||x.movement_type||'Movement'),x.movement_type==='sale'?'good':x.movement_type==='customer_return_intake'?'warning':'info')}</td><td>${esc(ctx,x.quantity_base)} ${esc(ctx,x.product?.base_unit||'base units')}</td><td>${esc(ctx,x.stock_before)} → ${esc(ctx,x.stock_after)}</td><td><b>${esc(ctx,reference)}</b><small>${esc(ctx,x.reason||'')}</small></td></tr>`}), 'No pharmacy stock movements recorded.')}</section>`);$('#pshMovementSearch').oninput=e=>{query=e.target.value;const pos=e.target.selectionStart;draw();const next=$('#pshMovementSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch{}}};$('#pshMovementFilter').value=kind;$('#pshMovementFilter').onchange=e=>{kind=e.target.value;draw()}};draw()
}

export async function pshopAlerts(ctx,view={}){
 const alerts=await ctx.api('pharmacy/alerts');if(!assertCurrent(ctx))return;
 const active=alerts.filter(a=>a.status!=='resolved'),unread=active.filter(a=>a.status==='unread');
 const critical=active.filter(a=>a.severity==='critical');
 const canMark=!ctx.state?.readOnly&&!ctx.state?.licenseExpired;
 const canOpen=ctx.canAccess('inventory','view');
 let filter=['action','active','resolved','all'].includes(view.filter)?view.filter:'action',query=String(view.query||'');
 page(ctx,`<section class="psh-alerts-intro"><div><span class="psh-kicker">PHARMACY · ACTION CENTER</span><h2>Alerts</h2><p>Spot medicines that need attention, acknowledge what you’ve seen, and keep resolved alerts for reference.</p></div><div class="psh-alerts-actions">${button(ctx,'Refresh','soft','id="pshAlertsRefresh"')}${canMark?button(ctx,'Mark all unread as read','soft',`id="pshAlertsReadAll" ${unread.length?'':'disabled'}`):''}</div></section>
 <div class="psh-alert-summary" aria-label="Alert summary"><div class="critical"><span>Out of stock</span><strong>${critical.length}</strong><small>Needs replenishment</small></div><div class="warning"><span>Unread</span><strong>${unread.length}</strong><small>Waiting for review</small></div><div><span>Active alerts</span><strong>${active.length}</strong><small>Includes acknowledged</small></div></div>
 <section class="psh-panel psh-alerts-panel"><div class="psh-alerts-filters"><div class="psh-alert-tabs" role="group" aria-label="Filter pharmacy alerts"><button type="button" data-psh-alert-filter="action" aria-pressed="${filter==='action'}">Needs attention <span>${unread.length}</span></button><button type="button" data-psh-alert-filter="active" aria-pressed="${filter==='active'}">Active <span>${active.length}</span></button><button type="button" data-psh-alert-filter="resolved" aria-pressed="${filter==='resolved'}">Resolved <span>${alerts.length-active.length}</span></button><button type="button" data-psh-alert-filter="all" aria-pressed="${filter==='all'}">All <span>${alerts.length}</span></button></div><label class="psh-alert-search"><span class="sr-only">Search alerts</span><input type="search" id="pshAlertSearch" value="${esc(ctx,query)}" placeholder="Search medicine or details" autocomplete="off"></label></div><p class="psh-alert-results" id="pshAlertCount" aria-live="polite"></p><div class="psh-alert-page-list" id="pshAlertResults"></div></section>`);
 const list=$('#pshAlertResults'),count=$('#pshAlertCount');
 const draw=()=>{
   const matching=alerts.filter(a=>{
     const inTab=filter==='action'?a.status==='unread':filter==='active'?a.status!=='resolved':filter==='resolved'?a.status==='resolved':true;
     return inTab&&`${a.title||''} ${a.detail||''}`.toLowerCase().includes(query);
   }).sort((a,b)=>Number(b.status==='unread')-Number(a.status==='unread')||Number(b.severity==='critical')-Number(a.severity==='critical')||new Date(b.updated_at)-new Date(a.updated_at));
   count.textContent=`${matching.length} ${matching.length===1?'alert':'alerts'} shown`;
   list.innerHTML=matching.length?matching.map(a=>`<article class="psh-alert-page-row ${a.status==='read'?'read':''} ${a.status==='resolved'?'resolved':''}"><span class="psh-alert-icon psh-alert-${a.severity==='critical'?'critical':'warning'}" aria-hidden="true">${icon(ctx,a.severity==='critical'?'alert-triangle':'bell')}</span><div class="psh-alert-content"><div class="psh-alert-meta">${statusPill(a.status==='resolved'?'Resolved':a.severity==='critical'?'Out of stock':'Low stock',a.status==='resolved'?'info':a.severity==='critical'?'bad':'warning')}${a.status==='unread'?'<span class="psh-alert-unread">New</span>':''}</div><b>${esc(ctx,a.title)}</b><p>${esc(ctx,a.detail)}</p><small>Updated ${fmtDate(String(a.updated_at||'').slice(0,10))}${a.status==='read'?' · Acknowledged':''}</small></div><div class="psh-alert-row-actions">${canOpen&&a.status!=='resolved'?button(ctx,'View medicines','soft','data-alert-go="pharmacy-products"'):''}${canMark&&a.status==='unread'?button(ctx,'Mark read','soft',`data-alert-read="${esc(ctx,a.id)}"`):''}</div></article>`).join(''):`<div class="psh-alert-empty"><span>${icon(ctx,'bell')}</span><h3>${query?'No matches found':filter==='action'?'You’re all caught up':filter==='resolved'?'No resolved alerts yet':'No alerts here'}</h3><p>${query?'Try a different medicine name or clear your search.':filter==='action'?'New low-stock and out-of-stock alerts will appear here.':'Alerts update automatically when pharmacy stock changes.'}</p></div>`;
   list.querySelectorAll('[data-alert-go]').forEach(b=>b.onclick=()=>ctx.navigate(b.dataset.alertGo));
   list.querySelectorAll('[data-alert-read]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await ctx.api(`pharmacy/alerts/${encodeURIComponent(b.dataset.alertRead)}/read`,{method:'POST',body:'{}'});await pshopAlerts(ctx,{filter,query})}catch(e){b.disabled=false;ctx.toast(e.message)}});
 };
 draw();
 $('#pshAlertsRefresh').onclick=()=>pshopAlerts(ctx,{filter,query});
 $('#pshAlertSearch').oninput=e=>{query=e.target.value.trim().toLowerCase();draw()};
 document.querySelectorAll('[data-psh-alert-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.pshAlertFilter;document.querySelectorAll('[data-psh-alert-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()});
 if(canMark)$('#pshAlertsReadAll').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const result=await ctx.api('pharmacy/alerts/read-all',{method:'POST',body:'{}'});ctx.toast(`${result.count} ${result.count===1?'alert':'alerts'} marked as read.`);await pshopAlerts(ctx,{filter,query})}catch(err){b.disabled=false;ctx.toast(err.message)}};
}

export async function pshopReports(ctx){
 let from=new Date(Date.now()-29*86400000).toISOString().slice(0,10),to=isoToday(),data=null,request=0;
 const tabs=`<div class="psh-report-tabs" role="tablist" aria-label="Report type"><button type="button" data-shared-report="ems" aria-selected="false">EMS reports</button><button type="button" data-shared-report="pharmacy" aria-selected="true">Pharmacy reports</button></div>`;
 const draw=async()=>{const thisRequest=++request;try{data=await ctx.api(`pharmacy/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}catch(e){if(thisRequest===request)ctx.toast(e.message);return}if(thisRequest!==request||!assertCurrent(ctx))return;
 page(ctx,`${tabs}${heading(ctx,`<label class="psh-inline-field">From<input id="pshReportFrom" type="date" value="${from}"></label><label class="psh-inline-field">To<input id="pshReportTo" type="date" value="${to}"></label><button class="psh-btn psh-btn-primary" id="pshReportApply">Apply</button>`)}<div class="psh-kpis">${card(ctx,'Sales',fmtMoney(ctx,data.sales_total),'For selected dates','blue','receipt')}${card(ctx,'Gross profit',fmtMoney(ctx,data.gross_profit),'Weighted-average COGS','green','chart')}${card(ctx,'Purchases',fmtMoney(ctx,data.purchase_total),'Supplier receipts','amber','cart')}${card(ctx,'Returns received',fmtMoney(ctx,data.return_total),'Quarantined; no settlement posted','rose','rotate-ccw')}</div><section class="psh-panel"><header class="psh-panel-head"><div><span class="psh-kicker">MEDICINE PERFORMANCE</span><h2>Sales & stock cost</h2><p>Sales are measured against weighted-average base cost for the selected period.</p></div></header>${table(['Medicine','Units sold','Sales value','COGS','Gross profit'],(data.products||[]).map(p=>`<tr><td><b>${esc(ctx,productLabel(p))}</b><small>${esc(ctx,p.sku||'')}</small></td><td>${esc(ctx,p.units_sold||0)} ${esc(ctx,p.base_unit)}</td><td>${fmtMoney(ctx,p.sales_value)}</td><td>${fmtMoney(ctx,p.cogs)}</td><td>${fmtMoney(ctx,p.gross_profit)}</td></tr>`),'No sales in the selected range.')}</section><section class="psh-panel"><header class="psh-panel-head"><div><span class="psh-kicker">REORDER</span><h2>Stock risk summary</h2><p>Aggregate on-hand quantities at or below the medicine’s reorder threshold.</p></div></header>${table(['Risk','Medicine','On hand','Unit'],(data.risks||[]).map(x=>`<tr><td>${statusPill(esc(ctx,x.kind),x.kind==='out of stock'?'bad':'warning')}</td><td>${esc(ctx,x.product_name)}</td><td>${esc(ctx,x.quantity||0)}</td><td>${esc(ctx,x.unit||'')}</td></tr>`),'No current stock risk records.')}</section>`);
 document.querySelectorAll('[data-shared-report]').forEach(b=>b.onclick=()=>b.dataset.sharedReport==='ems'?ctx.navigate('report'):ctx.navigate('pharmacy-reports'));
 $('#pshReportApply').onclick=()=>{const start=$('#pshReportFrom').value,end=$('#pshReportTo').value;if(!start||!end||start>end)return ctx.toast('Choose a valid date range.');from=start;to=end;draw()};
 };
 await draw();
}

/* ---- Return & Exchange (condition-based restock) ---- */
const RET_METHODS=[['cash','Cash'],['bank','Bank'],['bkash','bKash'],['nagad','Nagad'],['other','Other']];
const retMethodLabel=m=>(RET_METHODS.find(x=>x[0]===m)||[null,m||'—'])[1];
const retCondLabel=c=>({good:'Good',sellable:'Good',damaged:'Damaged',defective:'Defective',expired:'Expired',quarantined:'Quarantined'})[c]||c||'—';
const retCondTone=c=>(c==='good'||c==='sellable')?'good':'warning';
const retProdName=p=>[p?.name||p?.product_name,p?.strength].filter(Boolean).join(' · ')||'Medicine';

/* Return & Exchange lives in pshop_returns.js (Electronics console model). */
export { pshopReturns } from './pshop_returns.js';
