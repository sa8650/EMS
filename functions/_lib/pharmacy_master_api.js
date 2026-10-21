import {db} from './db.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const error=(message,status=400)=>json({error:message},status);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(value,max)=>String(value??'').trim().slice(0,max);
const r2=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const normalizedKey=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
const medicineIdentity=x=>[x.name,x.strength,x.dosage_form||'other',x.manufacturer,x.pack_size].map(normalizedKey).join('|');
const body=async request=>{try{return await request.json()}catch{return {}}};
async function allRows(env,path){
 const rows=[];for(let offset=0;;offset+=500){const batch=await db(env,`${path}${path.includes('?')?'&':'?'}limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)break}return rows;
}
const write=(env,table,value,method='POST')=>db(env,table,{method,headers:{'content-type':'application/json'},body:JSON.stringify(value)});

export const MASTER_IMPORT_BATCH_LIMIT=15;

async function normalizeProduct(env,raw,existing=null,knownMakers=null){
  raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const name=text(raw.name,180),base=text(raw.base_unit||'tablet',40).toLowerCase();
  if(!name)return {error:'Medicine name is required.'};
  if(!/^[a-z][a-z -]{0,39}$/.test(base))return {error:'Choose a valid base stock unit.'};
  const manufacturer=text(raw.manufacturer,160);const makers=manufacturer?(knownMakers||await db(env,'pharmacy_master_manufacturers?select=name')):[];
  const matched=makers.find(x=>x.name.toLowerCase()===manufacturer.toLowerCase());
  if(manufacturer&&!matched&&manufacturer.toLowerCase()!==String(existing?.manufacturer||'').toLowerCase())return {error:'Choose a manufacturer from the Owner Manufacturers tab.'};
  const prices={};for(const field of ['purchase_price','sale_price','wholesale_price','reorder_threshold']){
    const n=Number(raw[field]??(field==='reorder_threshold'?5:0));if(!Number.isFinite(n)||n<0||n>1e12)return {error:'Prices and low-stock alert must be non-negative numbers.'};prices[field]=field==='reorder_threshold'?Math.round(n*1000)/1000:r2(n);
  }
  const units=Array.isArray(raw.units)?raw.units:[];
  if(!units.length||units.length>50)return {error:'Add between 1 and 50 pack conversions.'};
  const normalized=units.map(item=>{const x=item&&typeof item==='object'?item:{};return {unit_label:text(x.unit_label,60).toLowerCase(),factor_to_base:Number(x.factor_to_base),can_purchase:!!x.can_purchase,can_sell:!!x.can_sell,allow_fractional:!!x.allow_fractional,purchase_price:x.purchase_price==null||x.purchase_price===''?null:Number(x.purchase_price),selling_price:x.selling_price==null||x.selling_price===''?null:Number(x.selling_price)}});
  if(normalized.some(x=>!x.unit_label||!Number.isFinite(x.factor_to_base)||x.factor_to_base<=0||x.factor_to_base>1e9||[x.purchase_price,x.selling_price].some(p=>p!==null&&(!Number.isFinite(p)||p<0)))||new Set(normalized.map(x=>x.unit_label)).size!==normalized.length)return {error:'Pack conversions contain an invalid or duplicate unit.'};
  if(!normalized.some(x=>x.unit_label===base&&x.factor_to_base===1)||!normalized.some(x=>x.can_sell)||!normalized.some(x=>x.can_purchase))return {error:'Include the base stock unit with factor 1, plus enabled purchase and sale units.'};
  const sku=text(raw.sku,80).toUpperCase(),barcode=text(raw.barcode,160);
  if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sku))return {error:'SKU may use letters, numbers, dots, hyphens and underscores.'};
  if(String(raw.pack_size||'').trim().length>120)return {error:'Pack size must be 120 characters or fewer.'};
  return {value:{name,generic_name:text(raw.generic_name,180)||null,strength:text(raw.strength,120)||null,dosage_form:text(raw.dosage_form||'other',60).toLowerCase(),
    manufacturer:matched?.name||manufacturer||null,category:text(raw.category||'Medicine',80)||'Medicine',pack_size:text(raw.pack_size,120)||null,barcode:barcode||null,sku:sku||null,base_unit:base,
    ...prices,units:normalized,active:existing?.active??(raw.active===false||['false','inactive','0','no'].includes(String(raw.active).toLowerCase())?false:true),updated_at:new Date().toISOString()}};
}

export async function ownerPharmacyApi({env,s,path,method,request}){
  if(!path.startsWith('platform/pharmacy/'))return null;
  if(s.role!=='owner')return error('Only the EMS Owner can manage the master Pharmacy catalog.',403);
  if(path==='platform/pharmacy/manufacturers'&&method==='GET')return json(await allRows(env,'pharmacy_master_manufacturers?select=*&order=name.asc'));
  if(path==='platform/pharmacy/manufacturers'&&method==='POST'){
    const name=text((await body(request)).name,160);if(!name)return error('Enter a manufacturer name.');
    const names=await db(env,'pharmacy_master_manufacturers?select=name');if(names.some(x=>x.name.toLowerCase()===name.toLowerCase()))return error('This manufacturer already exists.',409);
    try{return json((await write(env,'pharmacy_master_manufacturers',{name}))[0],201)}catch(e){return error(e.message||'Could not add manufacturer.',409)}
  }
  const maker=path.match(/^platform\/pharmacy\/manufacturers\/([^/]+)$/);
  if(maker&&['PATCH','DELETE'].includes(method)){
    const id=decodeURIComponent(maker[1]);if(!uuid.test(id))return error('Invalid manufacturer ID.');
    const [current]=await db(env,`pharmacy_master_manufacturers?id=eq.${id}&select=*`);if(!current)return error('Manufacturer not found.',404);
    if(method==='DELETE'){
      // Shop medicines are independent snapshots; owner deletion never erases them.
      await db(env,`pharmacy_master_products?manufacturer=eq.${encodeURIComponent(current.name)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({manufacturer:null})});
      await db(env,`pharmacy_master_manufacturers?id=eq.${id}`,{method:'DELETE'});return json({ok:true});
    }
    const name=text((await body(request)).name,160);if(!name)return error('Enter a manufacturer name.');
    const names=await db(env,'pharmacy_master_manufacturers?select=id,name');if(names.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase()))return error('This manufacturer already exists.',409);
    try{const [saved]=await write(env,`pharmacy_master_manufacturers?id=eq.${id}`,{name,updated_at:new Date().toISOString()},'PATCH');
      await write(env,`pharmacy_master_products?manufacturer=eq.${encodeURIComponent(current.name)}`,{manufacturer:name,updated_at:new Date().toISOString()},'PATCH');return json(saved)}catch(e){return error(e.message||'Could not rename manufacturer.',409)}
  }
  if(path==='platform/pharmacy/catalog'&&method==='GET')return json(await allRows(env,'pharmacy_master_products?select=*&order=name.asc'));
  if(path==='platform/pharmacy/catalog'&&method==='POST'){
    const result=await normalizeProduct(env,await body(request));if(result.error)return error(result.error);
    try{return json((await write(env,'pharmacy_master_products',result.value))[0],201)}catch(e){return error(e.message||'Medicine already exists in the master catalog.',409)}
  }
  if(path==='platform/pharmacy/catalog/import'&&method==='POST'){
    const input=await body(request),rows=input?.rows;
    if(!Array.isArray(rows)||!rows.length||rows.length>MASTER_IMPORT_BATCH_LIMIT)return error(`Import 1 to ${MASTER_IMPORT_BATCH_LIMIT} rows per request. The Owner Console splits larger CSV files automatically.`);
    // Cloudflare counts each database call toward the Worker subrequest limit.
    // Validate makers once; the database's unique indexes catch duplicate SKUs/barcodes.
    // Each invocation performs roughly one lookup plus at most 15 inserts.
    const makers=await allRows(env,'pharmacy_master_manufacturers?select=name');
    let created=0;const errors=[],ready=[],seen={sku:new Set(),barcode:new Set(),medicine:new Set()};
    // Preflight this entire request before the first INSERT. The Owner UI has
    // already checked its entire CSV against a fresh master catalog snapshot.
    for(let i=0;i<rows.length;i++){
      const raw=rows[i],rowId=raw?.import_row_id;
      if(rowId!==undefined&&!uuid.test(String(rowId))){errors.push({row:i+2,error:'Invalid CSV import row ID.'});continue}
      const normalized=await normalizeProduct(env,raw,null,makers);
      if(normalized.error){errors.push({row:i+2,error:normalized.error});continue}
      const value=normalized.value;if(rowId)value.id=rowId;
      const keys={sku:normalizedKey(value.sku),barcode:normalizedKey(value.barcode),medicine:medicineIdentity(value)};
      const duplicate=Object.entries(keys).find(([kind,key])=>key&&seen[kind].has(key));
      if(duplicate){errors.push({row:i+2,error:`Duplicate ${duplicate[0]} in this CSV batch.`});continue}
      for(const [kind,key] of Object.entries(keys))if(key)seen[kind].add(key);
      const sameName=await db(env,`pharmacy_master_products?name=ilike.${encodeURIComponent(value.name)}&select=id,name,strength,dosage_form,manufacturer,pack_size,sku,barcode`);
      const matching=sameName.find(p=>medicineIdentity(p)===keys.medicine);
      if(matching){
        if(rowId&&matching.id===rowId&&matching.sku===value.sku&&matching.barcode===value.barcode){created++;continue}
        errors.push({row:i+2,error:'Medicine with the same name, strength, dosage form, manufacturer and pack size already exists.'});continue
      }
      ready.push({row:i+2,value,rowId});
    }
    // Only rows cleared by the duplicate preflight can reach a write.
    for(const {row,value,rowId} of ready){
      try{await write(env,'pharmacy_master_products',value);created++}
      catch(e){
        const message=String(e.message||'Save failed');
        if(!/unique|duplicate/i.test(message))throw e;
        if(rowId){
          // If a response was lost after an insert, retrying the same row must
          // count the already-saved template, not create another medicine.
          const [prior]=await db(env,`pharmacy_master_products?id=eq.${rowId}&select=id,name,sku,barcode`);
          if(prior&&prior.name===value.name&&prior.sku===value.sku&&prior.barcode===value.barcode){created++;continue}
        }
        errors.push({row,error:'SKU or barcode already exists.'});
      }
    }
    return json({created,errors});
  }
  if(path==='platform/pharmacy/catalog/bulk-delete'&&method==='POST'){
    const input=await body(request),ids=[...new Set(input.ids||[])];if(!ids.length||ids.length>200||ids.some(id=>!uuid.test(String(id))))return error('Select between 1 and 200 valid medicines.');
    let deleted=0;for(let i=0;i<ids.length;i+=50){const list=ids.slice(i,i+50);const rows=await db(env,`pharmacy_master_products?id=in.(${list.join(',')})`,{method:'DELETE'});deleted+=rows.length}
    return json({deleted});
  }
  const entry=path.match(/^platform\/pharmacy\/catalog\/([^/]+)$/);
  if(entry&&['PATCH','DELETE'].includes(method)){
    const id=decodeURIComponent(entry[1]);if(!uuid.test(id))return error('Invalid medicine ID.');
    const [current]=await db(env,`pharmacy_master_products?id=eq.${id}&select=*`);if(!current)return error('Medicine not found.',404);
    if(method==='DELETE'){await db(env,`pharmacy_master_products?id=eq.${id}`,{method:'DELETE'});return json({ok:true})}
    const payload=await body(request);
    if(Object.keys(payload).length===1&&typeof payload.active==='boolean')return json((await write(env,`pharmacy_master_products?id=eq.${id}`,{active:payload.active,updated_at:new Date().toISOString()},'PATCH'))[0]);
    const result=await normalizeProduct(env,payload,current);if(result.error)return error(result.error);
    try{return json((await write(env,`pharmacy_master_products?id=eq.${id}`,result.value,'PATCH'))[0])}catch(e){return error(e.message||'Could not update medicine.',409)}
  }
  return error('Unknown Pharmacy owner route.',404);
}
