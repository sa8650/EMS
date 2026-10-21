import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_IMPORT_BATCH_SIZE,preflightCatalogDuplicates,uploadMasterCsvBatches} from '../assets/js/owner_catalog_import.js';

const makeTask=n=>({rows:Array.from({length:n},(_,i)=>({name:`Medicine ${i}`,import_row_id:`stable-row-${i}`})),total:n,index:0,created:0,errors:[],status:'running'});

test('CSV upload uses small Worker invocations and reports file-wide row progress',async()=>{
 const task=makeTask(38),sizes=[],progress=[];
 await uploadMasterCsvBatches(task,async(batch,offset)=>{
   sizes.push(batch.length);
   assert.ok(batch.length<=CATALOG_IMPORT_BATCH_SIZE);
   return {created:batch.length-(offset===15?1:0),errors:offset===15?[{row:3,error:'SKU already exists.'}]:[]};
 },state=>progress.push(state.index));
 assert.deepEqual(sizes,[15,15,8]);
 assert.deepEqual(progress,[15,30,38]);
 assert.equal(task.created,37);
 assert.deepEqual(task.errors,[{row:18,error:'SKU already exists.'}]);
});

test('a failed batch remains at its starting row and can be retried without dropping earlier progress',async()=>{
 const task=makeTask(33),saved=new Set(),attempts=[];let interrupted=false;
 const send=async(batch,offset)=>{
   attempts.push(offset);
   if(offset===15&&!interrupted){interrupted=true;for(const row of batch.slice(0,3))saved.add(row.import_row_id);throw Error('Network interrupted after a partial insert')}
   for(const row of batch)saved.add(row.import_row_id);
   return {created:batch.length,errors:[]};
 };
 await assert.rejects(uploadMasterCsvBatches(task,send),/Network interrupted/);
 assert.equal(task.index,15);assert.equal(task.created,15);
 await uploadMasterCsvBatches(task,send);
 assert.deepEqual(attempts,[0,15,15,30]);
 assert.equal(task.index,33);assert.equal(task.created,33);assert.equal(saved.size,33);
});

test('incomplete batch responses cannot advance the progress counter',async()=>{
 const task=makeTask(18);
 await assert.rejects(uploadMasterCsvBatches(task,async()=>({created:1,errors:[]})),/incomplete batch/);
 assert.equal(task.index,0);assert.equal(task.created,0);
});

test('progress toast stays mounted on document.body while Owner pages change',async()=>{
 const oldDocument=globalThis.document,oldStorage=globalThis.sessionStorage;
 const values=new Map(),boxNodes=[];
 const fakeBox=()=>({id:'',dataset:{},fields:new Map(),innerHTML:'',setAttribute(){},querySelector(selector){if(!this.fields.has(selector))this.fields.set(selector,{textContent:'',hidden:false,value:0,max:100,setAttribute(){}});return this.fields.get(selector)},remove(){const i=boxNodes.indexOf(this);if(i>=0)boxNodes.splice(i,1)}});
 globalThis.document={body:{appendChild(node){boxNodes.push(node)}},createElement:fakeBox,getElementById(id){return boxNodes.find(x=>x.id===id)||null}};
 globalThis.sessionStorage={setItem(k,v){values.set(k,v)},getItem(k){return values.get(k)||null},removeItem(k){values.delete(k)}};
 try{
  const mod=await import('../assets/js/owner_catalog_import.js?dom-smoke');
  const pending=[],api=()=>new Promise(resolve=>pending.push(resolve)),page={innerHTML:'Medicine Catalog'};
  mod.startOwnerCatalogImport(Array.from({length:16},(_,i)=>({name:'Medicine '+i})), 'catalog.csv',api,'owner-1');
  const toast=boxNodes[0];assert.equal(toast.id,'obCatalogUploadToast');
  assert.equal(toast.querySelector('[data-import-dismiss]').hidden,true);
  page.innerHTML='Owner overview';
  assert.equal(boxNodes[0],toast,'changing the Owner page must not remove the body-mounted toast');
  pending.shift()({created:15,errors:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(toast.querySelector('[data-import-count]').textContent,'15 / 16 rows checked or imported · 94%');
  pending.shift()({created:1,errors:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(toast.querySelector('[data-import-state]').textContent,'Complete');
  assert.equal(toast.querySelector('[data-import-dismiss]').hidden,false);
  assert.equal(mod.catalogImportState().created,16);
 }finally{globalThis.document=oldDocument;globalThis.sessionStorage=oldStorage}
});

test('refresh restores the same Owner upload with stable row IDs',async()=>{
 const previous=globalThis.sessionStorage,storage=new Map();
 globalThis.sessionStorage={setItem(k,v){storage.set(k,v)},getItem(k){return storage.get(k)||null},removeItem(k){storage.delete(k)}};
 const saved={ownerId:'owner-2',fileName:'resume.csv',rows:[{name:'A',import_row_id:'a-row'},{name:'B',import_row_id:'b-row'}],total:2,index:0,created:0,errors:[],status:'running',error:''};
 storage.set('ems.owner.pharmacy.csvUpload',JSON.stringify(saved));
 try{
  const mod=await import('../assets/js/owner_catalog_import.js?resume-smoke');
  const received=[];mod.resumeOwnerCatalogImport(async(_path,request)=>{received.push(JSON.parse(request.body).rows.map(r=>r.import_row_id));return {created:2,errors:[]}},'owner-2');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(received,[['a-row','b-row']]);
  assert.equal(mod.catalogImportState().status,'done');
  assert.equal(JSON.parse(storage.get('ems.owner.pharmacy.csvUpload')).created,2);
 }finally{globalThis.sessionStorage=previous}
});


test('whole-file preflight skips existing and within-file duplicates before any insert',()=>{
 const catalog=[{name:'Pain relief',strength:'500 mg',dosage_form:'tablet',manufacturer:'Acme',pack_size:'10 tablets',sku:'CAT-1',barcode:'012345'}];
 const rows=[
  {name:'Other product',sku:'cat-1'},
  {name:'Other barcode',barcode:'012345'},
  {name:'  PAIN   RELIEF ',strength:'500 MG',dosage_form:'Tablet',manufacturer:'acme',pack_size:'10 tablets'},
  {name:'Gel Alpha',strength:'1%',dosage_form:'gel',manufacturer:'Nova',pack_size:'tube'},
  {name:'gel alpha',strength:'1%',dosage_form:'GEL',manufacturer:'nova',pack_size:'tube'},
  {name:'Gel Alpha',strength:'2%',dosage_form:'gel',manufacturer:'Nova',pack_size:'tube'},
 ];
 const preflight=preflightCatalogDuplicates(rows,catalog);
 assert.deepEqual(preflight.errors.map(x=>x.row),[2,3,4,6]);
 assert.match(preflight.errors[0].error,/catalog/);
 assert.match(preflight.errors[3].error,/CSV row 5/);
 assert.deepEqual(preflight.rows.map(x=>x.csv_row_number),[5,7]);
});

test('filtered rows keep their original CSV line numbers when a later batch fails validation',async()=>{
 const source=[{name:'Known',sku:'ABC'},{name:'New A'},{name:'New B'}];
 const check=preflightCatalogDuplicates(source,[{name:'Known',sku:'ABC'}]);
 const task={rows:check.rows,total:2,sourceTotal:3,index:0,created:0,errors:[...check.errors],status:'running'};
 await uploadMasterCsvBatches(task,async()=>({created:1,errors:[{row:3,error:'Invalid amount'}]}));
 assert.deepEqual(task.errors.map(x=>x.row),[2,4]);
 assert.equal(task.created,1);
});

test('Marketplace preflight rejects shop duplicates and repeated Owner templates, but allows distinct strengths',async()=>{
 const {planMarketplaceImport,shopTemplatePayload,findMedicineDuplicate}=await import('../assets/js/medicine_duplicates.js');
 const a={id:'a',name:'Alpha',strength:'5 mg',dosage_form:'tablet',manufacturer:'Acme',pack_size:'box',sku:'OWNER-A',barcode:'012',units:[{unit_label:'tablet',factor_to_base:1}]};
 const b={...a,id:'b',name:' Beta ',barcode:'',strength:'2 mg',sku:'OWNER-B'};
 const duplicate={...b,id:'c',name:'BETA',sku:'OWNER-C'};
 const distinct={...a,id:'d',barcode:'',strength:'10 mg',sku:'OWNER-D'};
 const plan=planMarketplaceImport([a,b,duplicate,distinct],[{...a,id:'shop-id',sku:'PH-ONE'}],[{name:'Acme'}]);
 assert.deepEqual(plan.ready.map(x=>x.template.id),['b','d']);
 assert.deepEqual(plan.skipped.map(x=>x.template.id),['a','c']);
 assert.equal(shopTemplatePayload(b).sku,'');assert.equal(shopTemplatePayload(b).supplier_id,null);
 assert.equal(findMedicineDuplicate({...a,sku:''},[{...a,sku:'PH-SHOP'}],{checkSku:false}).kind,'barcode');
});

test('Owner selection stops at 200 and actual catalog CSV contains real rows and quoted values',async()=>{
 const {OWNER_CATALOG_SELECTION_LIMIT,addOwnerSelections,ownerCatalogExportCsv}=await import('../assets/js/owner_catalog_export.js');
 const selected=addOwnerSelections(new Set(),Array.from({length:260},(_,i)=>`record-${i}`));
 assert.equal(selected.size,OWNER_CATALOG_SELECTION_LIMIT);
 addOwnerSelections(selected,['record-251']);assert.equal(selected.has('record-251'),false);
 selected.delete('record-0');addOwnerSelections(selected,['record-251']);assert.equal(selected.has('record-251'),true);
 const csv=ownerCatalogExportCsv([{id:'id1',name:'Medicine, "Plus"',active:false,base_unit:'tablet',units:[{unit_label:'tablet',factor_to_base:1},{unit_label:'strip',factor_to_base:10,selling_price:20}]}]);
 assert.match(csv,/id,name,generic_name/);assert.match(csv,/"Medicine, ""Plus"""/);
 assert.match(csv,/,strip,10,20,false,/);assert.match(csv,/units_json/);
 assert.equal(csv.split('id1').length-1,1);
});
