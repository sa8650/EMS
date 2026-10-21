import {OWNER_CATALOG_SELECTION_LIMIT,addOwnerSelections,ownerCatalogExportCsv} from './owner_catalog_export.js';
import {openOwnerMedicineModal} from './pshop.js';
import {catalogImportState,onCatalogImportFinished,preflightCatalogDuplicates,startOwnerCatalogImport} from './owner_catalog_import.js';

export function parseMasterCsv(source){
 const text=String(source||'').replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
   const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||!cell)quoted=!quoted;else cell+=c}
   else if(c===','&&!quoted){row.push(cell);cell=''}
   else if((c==='\r'||c==='\n')&&!quoted){row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';if(c==='\r'&&text[i+1]==='\n')i++}
   else cell+=c;
 }
 if(quoted)throw Error('Unclosed quotation mark in CSV file.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length<2)throw Error('The CSV must have a header and at least one medicine.');
 const headers=rows.shift().map(h=>h.trim().toLowerCase());if(!headers.includes('name'))throw Error('A CSV column named name is required.');
 if(new Set(headers).size!==headers.length)throw Error('CSV headers cannot repeat.');
 return rows.map((cells,index)=>{
   if(cells.length!==headers.length)throw Error(`CSV row ${index+2}: expected ${headers.length} columns, found ${cells.length}.`);
   const raw=Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]));
   const base=raw.base_unit||'tablet',sell=raw.sale_price||0,buy=raw.purchase_price||0;
   const units=[{unit_label:base,factor_to_base:1,can_purchase:true,can_sell:true,purchase_price:Number(buy),selling_price:Number(sell)}];
   if(raw.pack_unit&&raw.pack_unit.toLowerCase()!==base.toLowerCase())units.push({unit_label:raw.pack_unit,factor_to_base:Number(raw.units_per_pack),can_purchase:true,can_sell:true,selling_price:raw.pack_selling_price?Number(raw.pack_selling_price):null});
   return {...raw,units,active:!['false','inactive','0','no'].includes(String(raw.active||'true').toLowerCase())};
 });
}
const TEMPLATE_COLUMNS=['name','generic_name','strength','dosage_form','manufacturer','category','pack_size','barcode','sku','base_unit','purchase_price','sale_price','wholesale_price','reorder_threshold','pack_unit','units_per_pack','pack_selling_price','active'];
function downloadCsv(){const content=TEMPLATE_COLUMNS.join(',')+'\r\n'+['Example Medicine','Example Generic','500 mg','tablet','','OTC','10 tablets per strip','','','tablet','3','5','4','5','strip','10','45','true'].join(',')+'\r\n';const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='owner-medicine-catalog-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
const productName=p=>[p.name,p.strength,p.dosage_form].filter(Boolean).join(' · ');

export async function ownerPharmacySettings(ctx,initialTab='catalog'){
 const root=ctx.root,esc=ctx.esc,api=ctx.api,toast=ctx.toast;
 let tab=initialTab,selection=new Set(),query='';
 root.innerHTML=`<section class="ob-pharm-intro ob-panel"><div class="ob-panel-head"><div><h3>Pharmacy Settings</h3><p class="ob-desc">Manage master medicine templates and shared manufacturers. Shops import a copy, then independently manage their suppliers, shelves, prices and stock.</p></div></div><div class="ob-pharm-tabs"><button type="button" data-owner-pharm-tab="catalog">Medicine Catalog</button><button type="button" data-owner-pharm-tab="manufacturers">Manufacturers</button></div></section><div id="obPharmacyBody" class="ob-pharm-body"></div>`;
 const body=root.querySelector('#obPharmacyBody');
 onCatalogImportFinished(()=>{if(root.querySelector('#obPharmacyBody')===body&&tab==='catalog')void render()});
 const updateTabs=()=>root.querySelectorAll('[data-owner-pharm-tab]').forEach(b=>{b.classList.toggle('on',b.dataset.ownerPharmTab===tab);b.setAttribute('aria-selected',String(b.dataset.ownerPharmTab===tab))});
 root.querySelectorAll('[data-owner-pharm-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.ownerPharmTab;selection.clear();query='';render()});
 const context={api,toast,esc,money:ctx.money,lucide:ctx.lucide};
 const busy=()=>{body.innerHTML='<section class="ob-panel"><p class="ob-desc">Loading Pharmacy settings…</p></section>'};
 const render=async()=>{updateTabs();busy();try{if(tab==='catalog')await catalog();else await manufacturers()}catch(err){body.innerHTML=`<section class="ob-panel"><h3>Could not load Pharmacy settings</h3><p class="ob-desc">${esc(err.message)}</p><button type="button" class="ob-btn ob-btn-soft" id="obPharmRetry">Retry</button></section>`;body.querySelector('#obPharmRetry').onclick=render}};
 async function catalog(){
   const [products,makers]=await Promise.all([api('platform/pharmacy/catalog'),api('platform/pharmacy/manufacturers')]);
   for(const id of selection)if(!products.some(p=>p.id===id))selection.delete(id);
   const upload=catalogImportState(),importReport=upload?.status==='done'?upload:null;
   body.innerHTML=`<section class="ob-panel"><div class="ob-panel-head"><div><h3>Master medicine catalog</h3><p class="ob-desc">Add or edit templates here. Inactive templates cannot be newly imported. Deleting a template, including bulk delete, never deletes a shop's imported medicine.</p></div><span class="ob-badge ob-t-violet">${products.length} templates</span></div>
     <div class="ob-pharm-toolbar"><button type="button" class="ob-btn ob-btn-primary" id="obPharmAdd">+ Add medicine</button><label class="ob-btn ob-btn-soft ob-pharm-file">Upload CSV<input type="file" accept=".csv,text/csv" id="obPharmCsv" ${upload?.status==='running'?'disabled':''} hidden></label><button type="button" class="ob-btn ob-btn-soft" id="obPharmSample">Download CSV template</button><button type="button" class="ob-btn ob-btn-soft" id="obPharmExport">Download actual catalog CSV</button><input type="search" id="obPharmSearch" placeholder="Search medicine, generic, maker, category or SKU" aria-label="Search master catalog" value="${esc(query)}"></div>
     ${upload?.status==='running'?`<p class="ob-desc">CSV upload is running in the background (${upload.index}/${upload.total} rows). You can navigate to other Owner pages.</p>`:''}<div class="ob-pharm-select"><label><input type="checkbox" id="obPharmSelectAll"> Select shown (up to 200)</label><span id="obPharmSelection">${selection.size} / ${OWNER_CATALOG_SELECTION_LIMIT} selected</span><button type="button" class="ob-btn ob-btn-soft" id="obPharmClear" ${selection.size?'':'disabled'}>Clear selection</button><button type="button" class="ob-btn ob-btn-danger" id="obPharmBulk" ${selection.size?'':'disabled'}>Delete selected templates</button></div>${importReport?`<details class="ob-pharm-report" ${importReport.errors.length?'open':''}><summary>Last CSV upload: ${importReport.created} imported, ${importReport.errors.length} skipped</summary>${importReport.errors.length?`<ul>${importReport.errors.slice().sort((a,b)=>a.row-b.row).map(x=>`<li>Row ${x.row}: ${esc(x.error)}</li>`).join('')}</ul>`:'<p>All rows imported successfully.</p>'}</details>`:''}<div id="obPharmList"></div></section>`;
   const find=id=>products.find(p=>p.id===id),search=body.querySelector('#obPharmSearch');
   const draw=()=>{
     const q=query.trim().toLowerCase(),visible=products.filter(p=>[p.name,p.generic_name,p.manufacturer,p.category,p.sku,p.strength,p.barcode].join(' ').toLowerCase().includes(q)),all=body.querySelector('#obPharmSelectAll');
     all.checked=visible.length>0&&visible.every(p=>selection.has(p.id));all.indeterminate=visible.some(p=>selection.has(p.id))&&!all.checked;
     body.querySelector('#obPharmSelection').textContent=`${selection.size} / ${OWNER_CATALOG_SELECTION_LIMIT} selected`;body.querySelector('#obPharmBulk').disabled=!selection.size;
     body.querySelector('#obPharmList').innerHTML=visible.length?`<div class="ob-tw"><table><thead><tr><th>Select</th><th>Medicine</th><th>Manufacturer</th><th>Category</th><th>MRP / base</th><th>Status</th><th>Actions</th></tr></thead><tbody>${visible.map(p=>`<tr><td><input type="checkbox" data-master-check="${esc(p.id)}" aria-label="Select ${esc(p.name)}" ${selection.has(p.id)?'checked':''} ${selection.size>=OWNER_CATALOG_SELECTION_LIMIT&&!selection.has(p.id)?'disabled':''}></td><td class="ob-wrap"><b>${esc(productName(p))}</b><small>${esc(p.generic_name||p.sku||'')}</small></td><td>${esc(p.manufacturer||'—')}</td><td>${esc(p.category||'—')}</td><td>৳ ${ctx.money(Number(p.sale_price||0))}</td><td><span class="ob-badge ob-t-${p.active?'emerald':'zinc'}">${p.active?'Active':'Inactive'}</span></td><td><div class="ob-actions"><button type="button" class="ob-btn ob-btn-soft ob-btn-sm" data-master-edit="${esc(p.id)}">Edit</button><button type="button" class="ob-btn ob-btn-soft ob-btn-sm" data-master-toggle="${esc(p.id)}">${p.active?'Deactivate':'Activate'}</button><button type="button" class="ob-btn ob-btn-danger ob-btn-sm" data-master-delete="${esc(p.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="ob-empty"><p>${q?'No templates match this search.':'No templates yet. Add a medicine or upload a CSV.'}</p></div>`;
     body.querySelectorAll('[data-master-check]').forEach(b=>b.onchange=()=>{b.checked?addOwnerSelections(selection,[b.dataset.masterCheck]):selection.delete(b.dataset.masterCheck);draw()});
     body.querySelectorAll('[data-master-edit]').forEach(b=>b.onclick=()=>openOwnerMedicineModal(context,find(b.dataset.masterEdit),products,makers,render));
     body.querySelectorAll('[data-master-toggle]').forEach(b=>b.onclick=async()=>{const p=find(b.dataset.masterToggle);b.disabled=true;try{await api('platform/pharmacy/catalog/'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({active:!p.active})});toast(`Template ${p.active?'deactivated':'activated'}.`);await render()}catch(e){b.disabled=false;toast(e.message)}});
     body.querySelectorAll('[data-master-delete]').forEach(b=>b.onclick=async()=>{const p=find(b.dataset.masterDelete);if(!confirm(`Delete ${p.name} from the MASTER catalog? Already imported shop medicines remain unchanged.`))return;b.disabled=true;try{await api('platform/pharmacy/catalog/'+encodeURIComponent(p.id),{method:'DELETE'});selection.delete(p.id);toast('Master template deleted.');await render()}catch(e){b.disabled=false;toast(e.message)}});
   };
   search.oninput=()=>{query=search.value;draw()};body.querySelector('#obPharmSelectAll').onchange=e=>{const q=query.trim().toLowerCase(),shown=products.filter(p=>[p.name,p.generic_name,p.manufacturer,p.category,p.sku,p.strength,p.barcode].join(' ').toLowerCase().includes(q));if(e.target.checked)addOwnerSelections(selection,shown.map(p=>p.id));else for(const p of shown)selection.delete(p.id);draw()};
   body.querySelector('#obPharmClear').onclick=()=>{selection.clear();draw()};
   body.querySelector('#obPharmAdd').onclick=()=>openOwnerMedicineModal(context,null,products,makers,render);
   body.querySelector('#obPharmBulk').onclick=async()=>{const ids=[...selection];if(!ids.length)return;if(!confirm(`Delete ${ids.length} selected MASTER template${ids.length===1?'':'s'}? Medicines already imported by shops will not be affected.`))return;const btn=body.querySelector('#obPharmBulk');btn.disabled=true;try{const result=await api('platform/pharmacy/catalog/bulk-delete',{method:'POST',body:JSON.stringify({ids})});selection.clear();toast(`${result.deleted} master templates deleted. Shop medicines were not changed.`);await render()}catch(e){btn.disabled=false;toast(e.message)}};
   body.querySelector('#obPharmSample').onclick=downloadCsv;
   body.querySelector('#obPharmExport').onclick=async()=>{const btn=body.querySelector('#obPharmExport');btn.disabled=true;try{const latest=await api('platform/pharmacy/catalog');const blob=new Blob([ownerCatalogExportCsv(latest)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='owner-medicine-catalog-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast(`Downloaded ${latest.length} actual master medicine templates.`)}catch(err){toast(err.message)}finally{btn.disabled=false}};
   body.querySelector('#obPharmCsv').onchange=async event=>{
     const file=event.target.files?.[0];event.target.value='';if(!file)return;
     if(file.size>1024*1024)return toast('CSV files must be 1 MB or smaller.');
     try{
       const rows=parseMasterCsv(await file.text());if(rows.length>300)return toast('Upload at most 300 medicine rows at a time.');
       const active=catalogImportState();if(active?.status==='running')return toast('A CSV upload is already running. Check the progress toast.');
       if(active?.status==='failed'&&active.index<active.total)return toast('Retry or dismiss the paused CSV upload before starting another.');
       // Fetch the latest catalog and check the WHOLE file before any import POST.
       const existing=await api('platform/pharmacy/catalog'),check=preflightCatalogDuplicates(rows,existing);
       const preview=check.errors.slice(0,3).map(x=>`Row ${x.row}: ${x.error}`).join('\n');
       if(check.rows.length&&!confirm(`Duplicate check complete for ${rows.length} CSV rows.\n${check.errors.length} duplicate(s) will be skipped; ${check.rows.length} unique medicine(s) will be uploaded.${preview?'\n\n'+preview:''}\n\nContinue?`))return;
       startOwnerCatalogImport(check.rows,file.name,api,ctx.ownerId,check.errors,rows.length);
       await render();
     }catch(err){toast(err.message)}
   };
   draw();
 }
 function makerModal(record,records){
   const e=document.createElement('div');e.className='ob-modal';e.innerHTML=`<section class="ob-modalbox"><div class="ob-modalhead"><h2>${record?'Edit':'Add'} global manufacturer</h2><button type="button" class="ob-x" aria-label="Close">×</button></div><div class="ob-modalbody"><form class="ob-form"><label>Manufacturer name<input type="text" name="name" required maxlength="160" value="${esc(record?.name||'')}" placeholder="e.g. Acme Pharma"></label><button type="submit" class="ob-btn ob-btn-primary">Save manufacturer</button></form></div></section>`;document.body.append(e);e.querySelector('.ob-x').onclick=()=>e.remove();e.onclick=ev=>{if(ev.target===e)e.remove()};
   e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const button=e.querySelector('[type=submit]');button.disabled=true;try{await api(record?'platform/pharmacy/manufacturers/'+encodeURIComponent(record.id):'platform/pharmacy/manufacturers',{method:record?'PATCH':'POST',body:JSON.stringify({name:new FormData(ev.target).get('name')})});e.remove();toast('Global manufacturer saved.');render()}catch(err){button.disabled=false;toast(err.message)}};
 }
 async function manufacturers(){
   const rows=await api('platform/pharmacy/manufacturers');body.innerHTML=`<section class="ob-panel"><div class="ob-panel-head"><div><h3>Global manufacturers</h3><p class="ob-desc">These names appear by default in every Pharmacy shop. Shop users cannot delete them; private names added by a shop are not shown here. Deleting a global name leaves already imported shop medicines untouched.</p></div><button type="button" class="ob-btn ob-btn-primary" id="obMakerAdd">+ Add manufacturer</button></div><input type="search" id="obMakerSearch" class="ob-pharm-search" placeholder="Search global manufacturers" aria-label="Search global manufacturers"><div id="obMakerList"></div></section>`;
   const draw=()=>{const q=body.querySelector('#obMakerSearch').value.toLowerCase(),list=rows.filter(x=>x.name.toLowerCase().includes(q));body.querySelector('#obMakerList').innerHTML=list.length?`<div class="ob-tw"><table><thead><tr><th>Manufacturer</th><th>Scope</th><th>Actions</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td><span class="ob-badge ob-t-violet">All Pharmacy shops</span></td><td><div class="ob-actions"><button type="button" class="ob-btn ob-btn-soft ob-btn-sm" data-owner-maker-edit="${esc(x.id)}">Edit</button><button type="button" class="ob-btn ob-btn-danger ob-btn-sm" data-owner-maker-delete="${esc(x.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="ob-empty"><p>${q?'No manufacturers match your search.':'No global manufacturers yet.'}</p></div>`;
     body.querySelectorAll('[data-owner-maker-edit]').forEach(b=>b.onclick=()=>makerModal(rows.find(x=>x.id===b.dataset.ownerMakerEdit),rows));
     body.querySelectorAll('[data-owner-maker-delete]').forEach(b=>b.onclick=async()=>{const maker=rows.find(x=>x.id===b.dataset.ownerMakerDelete);if(!confirm(`Remove ${maker.name} from the global manufacturer list? Master templates using this name will be unassigned; shop medicine copies retain their details.`))return;b.disabled=true;try{await api('platform/pharmacy/manufacturers/'+encodeURIComponent(maker.id),{method:'DELETE'});toast('Global manufacturer deleted.');render()}catch(e){b.disabled=false;toast(e.message)}});
   };body.querySelector('#obMakerAdd').onclick=()=>makerModal(null,rows);body.querySelector('#obMakerSearch').oninput=draw;draw();
 }
 await render();
}
