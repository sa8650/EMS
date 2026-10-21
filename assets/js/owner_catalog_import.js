export {preflightCatalogDuplicates} from './medicine_duplicates.js';
/* CSV upload controller lives outside Owner page components, so navigating
   between Owner Console pages never cancels a running upload or its progress. */
export const CATALOG_IMPORT_BATCH_SIZE=15;
const STORAGE_KEY='ems.owner.pharmacy.csvUpload';
let current=null,activePromise=null,latestApi=null,onFinished=null;

const persist=()=>{try{if(current)sessionStorage.setItem(STORAGE_KEY,JSON.stringify(current));else sessionStorage.removeItem(STORAGE_KEY)}catch{/* Keep the in-memory upload running even if storage is full or unavailable. */}};
export const catalogImportState=()=>current;
export const onCatalogImportFinished=callback=>{onFinished=callback};

/* Pure batch runner: each request is a NEW Cloudflare Worker invocation.
   A failed request leaves index at the start of that batch for safe retry. */
export async function uploadMasterCsvBatches(task,send,update=()=>{}){
 while(task.index<task.total){
  const offset=task.index,batch=task.rows.slice(offset,offset+CATALOG_IMPORT_BATCH_SIZE);
  const response=await send(batch,offset);
  if(!response||!Number.isInteger(response.created)||!Array.isArray(response.errors)||response.created+response.errors.length!==batch.length)throw Error('The import server returned an incomplete batch. This batch can be retried safely.');
  task.created+=response.created;
  task.errors.push(...response.errors.map(x=>({row:task.rows[offset+Number(x.row)-2]?.csv_row_number||offset+Number(x.row),error:String(x.error||'Could not import medicine.')})));
  task.index+=batch.length;
  update(task);
 }
 return task;
}

function toastElement(){
 if(typeof document==='undefined')return null;
 let box=document.getElementById('obCatalogUploadToast');
 if(!box){box=document.createElement('aside');box.id='obCatalogUploadToast';box.className='ob-csv-toast';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
  box.innerHTML='<div class="ob-csv-toast-head"><strong>Medicine catalog CSV</strong><span data-import-state></span></div><p data-import-file></p><div class="ob-csv-toast-count" data-import-count></div><progress data-import-progress max="100" value="0" aria-label="CSV medicine upload progress"></progress><p class="ob-csv-toast-detail" data-import-detail></p><div class="ob-csv-toast-actions"><button type="button" data-import-retry hidden>Retry remaining rows</button><button type="button" data-import-dismiss hidden>Dismiss</button></div>';
  document.body.appendChild(box);
 }
 return box;
}
function showToast(){
 if(!current)return;
 const box=toastElement();if(!box)return;
 const task=current,checked=task.index+(task.sourceTotal-task.total),pct=task.sourceTotal?Math.round(checked/task.sourceTotal*100):100;
 box.dataset.status=task.status;
 box.querySelector('[data-import-state]').textContent=task.status==='running'?'Uploading…':task.status==='done'?'Complete':'Paused';
 box.querySelector('[data-import-file]').textContent=task.fileName;
 box.querySelector('[data-import-count]').textContent=`${checked} / ${task.sourceTotal} rows checked or imported · ${pct}%`;
 const progress=box.querySelector('[data-import-progress]');progress.value=checked;progress.max=task.sourceTotal||1;progress.setAttribute('aria-valuenow',String(checked));
 box.querySelector('[data-import-detail]').textContent=task.status==='failed'?`Upload paused: ${task.error}. Retry to continue from row ${task.index+2}.`:`${task.created} imported · ${task.errors.length} skipped${task.status==='running'?' · You can use other Owner pages.':''}`;
 const retry=box.querySelector('[data-import-retry]'),dismiss=box.querySelector('[data-import-dismiss]');
 retry.hidden=task.status!=='failed';dismiss.hidden=task.status==='running';
 retry.onclick=()=>{if(task.status!=='failed'||!latestApi)return;task.status='running';task.error='';persist();showToast();void continueImport(task)};
 dismiss.onclick=()=>{if(task.status==='running')return;box.remove();current=null;persist()};
}
async function continueImport(task){
 if(activePromise)return activePromise;
 const work=(async()=>{
  try{
   await uploadMasterCsvBatches(task,(batch)=>latestApi('platform/pharmacy/catalog/import',{method:'POST',body:JSON.stringify({rows:batch})}),()=>{persist();showToast()});
   task.status='done';task.error='';task.rows=[];
  }catch(error){task.status='failed';task.error=String(error?.message||error)}
  persist();showToast();try{onFinished?.(task)}catch(error){console.error('Could not refresh catalog after CSV upload',error)}
 })();
 activePromise=work;
 try{return await work}finally{activePromise=null}
}

export function startOwnerCatalogImport(rows,fileName,api,ownerId,preflightErrors=[],sourceTotal=rows.length){
 if(current?.status==='running')throw Error('A catalog CSV upload is already running. Its progress appears at the bottom of the screen.');
 if(current?.status==='failed'&&current.index<current.total)throw Error('Retry or dismiss the paused CSV upload before starting another.');
 if(!Array.isArray(rows)||rows.length>300||!Number.isInteger(sourceTotal)||sourceTotal<1||sourceTotal>300||rows.length+preflightErrors.length!==sourceTotal)throw Error('Select a CSV with 1 to 300 medicine rows.');
 if(typeof crypto==='undefined'||!crypto.randomUUID)throw Error('A secure browser connection is required to upload CSV files.');
 current={ownerId,fileName:String(fileName||'medicines.csv'),rows:rows.map(row=>({...row,import_row_id:crypto.randomUUID()})),total:rows.length,sourceTotal,index:0,created:0,errors:[...preflightErrors],status:rows.length?'running':'done',error:''};
 latestApi=api;persist();showToast();if(current.status==='running')void continueImport(current);return current;
}

/* Restores an in-progress upload after refreshing the same Owner session.
   A different owner's session cannot resume or display these saved rows. */
export function resumeOwnerCatalogImport(api,ownerId){
 latestApi=api;
 if(!current){try{const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');if(saved?.ownerId===ownerId&&Array.isArray(saved.rows)&&saved.total>0)current=saved}catch{/* no saved task */}}
 if(!current||current.ownerId!==ownerId)return;
 if(!Number.isInteger(current.sourceTotal))current.sourceTotal=current.total;
 showToast();
 if(current.status==='running'&&!activePromise)void continueImport(current);
}
