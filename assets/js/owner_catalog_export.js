export const OWNER_CATALOG_SELECTION_LIMIT=200;
export const addOwnerSelections=(selected,ids)=>{
 for(const id of ids)if(selected.size<OWNER_CATALOG_SELECTION_LIMIT)selected.add(id);
 return selected;
};
export const OWNER_CATALOG_EXPORT_COLUMNS=['id','name','generic_name','strength','dosage_form','manufacturer','category','pack_size','barcode','sku','base_unit','purchase_price','sale_price','wholesale_price','reorder_threshold','pack_unit','units_per_pack','pack_selling_price','active','units_json','created_at','updated_at'];
const cell=value=>{
 const str=String(value??'');
 // Quoting also protects commas, double quotes, CR and LF in medicine names.
 return /[",\r\n]/.test(str)?`"${str.replace(/"/g,'""')}"`:str;
};
export function ownerCatalogExportCsv(products){
 const rows=products.map(p=>{
  const units=Array.isArray(p.units)?p.units:[];
  const pack=units.find(u=>String(u.unit_label||'').toLowerCase()!==String(p.base_unit||'').toLowerCase());
  const row={...p,pack_unit:pack?.unit_label||'',units_per_pack:pack?.factor_to_base||'',pack_selling_price:pack?.selling_price??'',units_json:JSON.stringify(units),active:p.active===false?'false':'true'};
  return OWNER_CATALOG_EXPORT_COLUMNS.map(key=>cell(row[key])).join(',');
 });
 return '\uFEFF'+OWNER_CATALOG_EXPORT_COLUMNS.join(',')+'\r\n'+rows.join('\r\n')+(rows.length?'\r\n':'');
}
