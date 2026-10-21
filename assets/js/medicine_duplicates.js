/* Shared browser-side duplicate matching for Owner templates and shop medicines. */
const normalized=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
export const medicineIdentity=row=>[row?.name,row?.strength,row?.dosage_form||'other',row?.manufacturer,row?.pack_size].map(normalized).join('|');
export function findMedicineDuplicate(candidate,existing,{checkSku=true}={}){
 const sku=checkSku?normalized(candidate?.sku):'',barcode=normalized(candidate?.barcode),identity=normalized(candidate?.name)?medicineIdentity(candidate):'';
 for(const record of existing||[]){
  if(sku&&normalized(record.sku)===sku)return {record,kind:'SKU'};
  if(barcode&&normalized(record.barcode)===barcode)return {record,kind:'barcode'};
  if(identity&&normalized(record.name)&&medicineIdentity(record)===identity)return {record,kind:'medicine details'};
 }
 return null;
}

/* Check the whole file before any writes. Keep original CSV line numbers. */
export function preflightCatalogDuplicates(rows,existing=[]){
 const indexes={sku:new Map(),barcode:new Map(),medicine:new Map()},errors=[],uniqueRows=[];
 const keys=row=>({sku:normalized(row.sku),barcode:normalized(row.barcode),medicine:normalized(row.name)?medicineIdentity(row):''});
 for(const record of existing){const parts=keys(record);for(const [kind,key] of Object.entries(parts))if(key&&!indexes[kind].has(key))indexes[kind].set(key,{source:'catalog',row:null})}
 for(let i=0;i<rows.length;i++){
  const row=rows[i],number=i+2,parts=keys(row);
  const collision=Object.entries(parts).map(([kind,key])=>key?{kind,entry:indexes[kind].get(key)}:null).find(x=>x?.entry);
  if(collision){const {kind,entry}=collision;errors.push({row:number,error:entry.source==='catalog'?`Already in Owner catalog (matching ${kind==='medicine'?'medicine name, strength, form, manufacturer and pack size':kind}).`:`Duplicate of CSV row ${entry.row} (matching ${kind==='medicine'?'medicine details':kind}).`});continue}
  uniqueRows.push({...row,csv_row_number:number});
  for(const [kind,key] of Object.entries(parts))if(key)indexes[kind].set(key,{source:'csv',row:number});
 }
 return {rows:uniqueRows,errors};
}

/* Copy only store-safe fields from a global template. Shop SKU, supplier, shelf
   and stock are never copied from the Owner's catalog. */
export function shopTemplatePayload(template){
 const fields=['name','generic_name','strength','dosage_form','manufacturer','category','pack_size','barcode','base_unit','purchase_price','sale_price','wholesale_price','reorder_threshold'];
 const data=Object.fromEntries(fields.map(field=>[field,template[field]??null]));
 return {...data,sku:'',supplier_id:null,default_location_id:null,units:(Array.isArray(template.units)?template.units:[]).map(u=>({...u}))};
}
export function planMarketplaceImport(templates,shopProducts,manufacturers=[]){
 const seen=[...(shopProducts||[])],ready=[],skipped=[];
 for(const template of templates){
  const data=shopTemplatePayload(template);
  const match=findMedicineDuplicate(data,seen,{checkSku:false});
  if(match){skipped.push({template,reason:`Already in your Pharmacy catalog (matching ${match.kind}).`});continue}
  if(data.manufacturer&&!manufacturers.some(x=>String(x.name||x).toLowerCase()===String(data.manufacturer).toLowerCase())){
   skipped.push({template,reason:'Manufacturer is no longer available. Use Customize to choose a manufacturer.'});continue;
  }
  ready.push({template,data});seen.push({...data,id:template.id});
 }
 return {ready,skipped};
}
