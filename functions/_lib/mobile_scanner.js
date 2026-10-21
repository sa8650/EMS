/* Temporary Pharmacy/Electronics draft coordination. Only existing invoice RPCs post stock. */
import { db } from './db.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(error,status=400)=>json({error},status);
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x||''));
const q=x=>encodeURIComponent(x);
const iso=(ms=0)=>new Date(Date.now()+ms).toISOString();
const scannerShopType=store=>{const kind=String(store?.business_type||store?.shop_type||'').trim().toLowerCase();return kind==='pharmacy'||kind==='electronics'?kind:null};
const valid=d=>d?.status==='ready'&&Date.parse(d.expires_at)>Date.now()&&Date.parse(d.last_seen)>Date.now()-45000;
const patch=(env,table,filter,body)=>db(env,`${table}?${filter}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const post=(env,table,body)=>db(env,table,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const digest=async input=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const d1=env=>String(env.DB_DRIVER||'').toLowerCase()==='d1';
// D1 and Postgres both use a single SQL statement to serialize event insertion with the save barrier.
async function enqueue(env,body,shopType='pharmacy'){
 if(!d1(env))return db(env,shopType==='electronics'?'rpc/scanner_inventory_enqueue':'rpc/scanner_enqueue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_id:body.id,p_store:body.store,p_draft:body.draft,p_binding:body.binding,p_user:body.user,p_product:body.product})});
 const table=shopType==='electronics'?'scanner_inventory_events':'scanner_events',products=shopType==='electronics'?'inventory_items':'pharmacy_products';
 const sql=`INSERT INTO ${table} (id,store_id,draft_id,binding_id,product_id,status,created_at)
 SELECT ?,d.store_id,d.id,b.id,?,'pending',? FROM scanner_drafts d JOIN scanner_bindings b ON b.draft_id=d.id AND b.store_id=d.store_id
 JOIN ${products} p ON p.id=? AND p.store_id=d.store_id AND p.active=1
 WHERE d.id=? AND d.store_id=? AND d.status='ready' AND d.expires_at>? AND d.last_seen>? AND b.id=? AND b.phone_user_id=? AND b.revoked_at IS NULL AND b.expires_at>?
 ON CONFLICT(id) DO NOTHING`;
 const r=await env.DB.prepare(sql).bind(body.id,body.product,iso(),body.product,body.draft,body.store,iso(),iso(-45000),body.binding,body.user,iso()).run();
 return r.meta.changes?'ok':'inactive';
}
async function prepare(env,store,draft,pc,key,shopType='pharmacy'){
 if(!d1(env))return db(env,shopType==='electronics'?'rpc/scanner_inventory_prepare':'rpc/scanner_prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_store:store,p_draft:draft,p_pc:pc,p_key:key})});
 const table=shopType==='electronics'?'scanner_inventory_events':'scanner_events';
 const r=await env.DB.prepare(`UPDATE scanner_drafts SET status='saving',save_key=? WHERE id=? AND store_id=? AND pc_user_id=? AND status='ready' AND expires_at>? AND last_seen>? AND NOT EXISTS(SELECT 1 FROM ${table} WHERE draft_id=? AND status='pending')`).bind(key,draft,store,pc,iso(),iso(-45000),draft).run();
 return r.meta.changes?'ok':'pending_or_inactive';
}
async function catalogProducts(env,storeId,request){
 const search=new URL(request.url).searchParams.get('q')?.trim().replace(/[*,()%]/g,'').slice(0,70)||'';
 const base=`pharmacy_products?store_id=eq.${storeId}&active=eq.true`;
 let rows=await db(env,`${base}&${search?`name=ilike.${q('*'+search+'*')}&`:''}select=id,inventory_item_id,name,strength,dosage_form,barcode,base_unit,sale_price&order=name.asc&limit=100`);
 if(search){
  const exact=await db(env,`${base}&barcode=ilike.${q(search)}&select=id,inventory_item_id,name,strength,dosage_form,barcode,base_unit,sale_price&limit=10`);
  const items=await db(env,`inventory_items?store_id=eq.${storeId}&item_code=ilike.${q(search)}&select=id&limit=10`);
  const extra=items.length?await db(env,`${base}&inventory_item_id=in.(${items.map(i=>i.id).join(',')})&select=id,inventory_item_id,name,strength,dosage_form,barcode,base_unit,sale_price&limit=10`):[];
  rows=[...new Map([...exact,...extra,...rows].map(p=>[p.id,p])).values()];
 }
 const ids=rows.map(p=>p.inventory_item_id);
 const items=ids.length?await db(env,`inventory_items?store_id=eq.${storeId}&id=in.(${ids.join(',')})&select=id,item_code,total_stock`):[];
 const map=new Map(items.map(i=>[i.id,i]));
 return rows.map(p=>({...p,sku:map.get(p.inventory_item_id)?.item_code||'',available_stock:Number(map.get(p.inventory_item_id)?.total_stock||0)}));
}
async function inventoryCatalogProducts(env,storeId,request){
 const search=new URL(request.url).searchParams.get('q')?.trim().replace(/[*,()%]/g,'').slice(0,70)||'';
 const base=`inventory_items?store_id=eq.${storeId}&active=eq.true&`;
 let rows=await db(env,base+(search?`description=ilike.${q('*'+search+'*')}&`:'')+'select=id,item_code,description,unit,sale_price,total_stock,active&order=description.asc&limit=100');
 if(search){const codes=await db(env,`${base}item_code=ilike.${q(search)}&select=id,item_code,description,unit,sale_price,total_stock,active&limit=10`);rows=[...new Map([...codes,...rows].map(x=>[x.id,x])).values()]}
 return rows.map(i=>({id:i.id,name:i.description,sku:i.item_code,barcode:i.item_code,base_unit:i.unit,sale_price:i.sale_price,available_stock:Number(i.total_stock||0),active:i.active}));
}
export async function consumeScannerLogin({env,request,token,issueToken,authorize}){
 if(typeof token!=='string'||!/^[-_a-zA-Z0-9]{32,128}$/.test(token))return fail('This sign-in QR is invalid.',400);
 const [code]=await db(env,`scanner_login_codes?token_hash=eq.${await digest(token)}&select=*`);
 if(!code||code.used_at||Date.parse(code.expires_at)<=Date.now())return fail('This sign-in QR was used or expired. Open a new one on the PC.',410);
 const actor=await authorize(code.store_id,code.pc_user_id);
 if(!actor)return fail('PC user can no longer use the Scanner.',403);
 const claimed=await patch(env,'scanner_login_codes',`id=eq.${code.id}&used_at=is.null&expires_at=gt.${q(iso())}`,{used_at:iso()});
 if(!claimed.length)return fail('This sign-in QR has already been used.',410);
 const jwt=await issueToken({...actor,scannerOnly:true,scannerLogin:true,exp:Math.floor(Date.now()/1000)+1200});
 const [store]=await db(env,`stores?id=eq.${code.store_id}&select=id,name,shop_type,business_type`);
 return json({token:jwt,role:'staff',store:{id:code.store_id,name:store?.name||'EMS shop',shop_type:scannerShopType(store)},user:{id:actor.id,name:'Scanner user'},qr_login:true});
}
export async function mobileScannerApi({env,request,path,method,s,allowed}){
 if(!path.startsWith('scanner/'))return null;
 if(!s?.storeId||!['staff','admin'].includes(s.role))return fail('Shop sign-in required.',403);
 const [store]=await db(env,`stores?id=eq.${s.storeId}&select=id,name,shop_code,shop_type,business_type,status,admin_id`);
 if(s.adminAccess){const [admin]=await db(env,`administrators?id=eq.${s.id}&active=eq.true&select=id`);if(!admin||store?.admin_id!==s.id)return fail('Administrator access was revoked.',403)}
 const shopType=scannerShopType(store);if(!shopType)return fail('Scanner billing supports Pharmacy and Electronics shops.',403);
 if(store.status==='inactive')return fail('This shop is inactive.',403);
 const eventTable=shopType==='electronics'?'scanner_inventory_events':'scanner_events',catalog=shopType==='electronics'?inventoryCatalogProducts:catalogProducts;
 if(path==='scanner/profile'&&method==='GET'){
  const [person]=s.adminAccess?await db(env,`administrators?id=eq.${s.id}&select=id,name,email,active`):await db(env,`staff?id=eq.${s.id}&store_id=eq.${s.storeId}&select=id,full_name,user_id,email,active`);
  return json({shop:{id:store.id,name:store.name,code:store.shop_code,type:shopType},user:{id:s.id,name:s.adminAccess?person?.name:person?.full_name,user_id:s.adminAccess?person?.email:person?.user_id,email:person?.email||null,role:s.adminAccess?'Administrator':'Staff'},paired:!!s.scannerOnly,canScan:(!!allowed(s,'sales','add')||!!allowed(s,'purchase','add'))&&!!allowed(s,'inventory','view')&&!s.readOnly&&!s.licenseExpired});
 }
 if(!allowed(s,'inventory','view')||(!allowed(s,'sales','add')&&!allowed(s,'purchase','add'))||s.readOnly||s.licenseExpired)return fail('Billing and catalog permissions are required.',403);
 if(path==='scanner/login-code'&&method==='POST'){
  if(s.scannerOnly)return fail('Create a sign-in QR on the PC, not the phone.',403);
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
  await post(env,'scanner_login_codes',{id:crypto.randomUUID(),store_id:s.storeId,pc_user_id:s.id,token_hash:await digest(secret),expires_at:iso(60000)});
  return json({login_url:new URL('/scanner/#login='+secret,request.url).href,expires_at:iso(60000)});
 }

 if(path==='scanner/catalog'&&method==='GET')return json(await catalog(env,s.storeId,request));
 const params=new URL(request.url).searchParams;
 const body=method==='POST'?await request.json().catch(()=>({})):{};
 const isPc=!s.scannerOnly, storeId=s.storeId;
 if(path==='scanner/drafts'&&method==='POST'){
  if(!isPc||!uuid(body.terminal_id)||!uuid(body.draft_id)||!['sale','purchase'].includes(body.kind||'sale'))return fail('Valid PC terminal, kind and draft ID required.',403);
  const kind=body.kind||'sale';if(!allowed(s,kind==='sale'?'sales':'purchase','add'))return fail('Permission to add '+kind+' bills is required.',403);
  const record={id:body.draft_id,terminal_id:body.terminal_id,store_id:storeId,pc_user_id:s.id,kind,expires_at:iso(4*3600000),last_seen:iso(),status:'ready'};
  await post(env,'scanner_drafts',record);
  // Expired temporary records are disposable and never part of the invoice ledger.
  await db(env,`scanner_login_codes?store_id=eq.${storeId}&expires_at=lt.${q(iso(-86400000))}`,{method:'DELETE'}).catch(()=>{});
  await db(env,`scanner_drafts?store_id=eq.${storeId}&expires_at=lt.${q(iso(-2*86400000))}`,{method:'DELETE'}).catch(error=>console.warn('Scanner cleanup deferred:',error));
  return json({draft_id:record.id,terminal_id:record.terminal_id,status:'ready'},201);
 }
 const id=path.split('/')[2];
 if(!uuid(id))return fail('Valid draft ID required.',400);
 const [draft]=await db(env,`scanner_drafts?id=eq.${id}&store_id=eq.${storeId}&select=*`);
 if(!draft)return fail('Draft not found.',404);
 const kind=draft.kind||'sale';if(!allowed(s,kind==='sale'?'sales':'purchase','add'))return fail('This billing draft is not authorized for your account.',403);
 const pc= isPc&&draft.pc_user_id===s.id&&(body.terminal_id||params.get('terminal_id'))===draft.terminal_id;
 const bindingId=pc?null:(body.binding_id||params.get('binding_id'));
 const [binding]=bindingId&&uuid(bindingId)?await db(env,`scanner_bindings?id=eq.${bindingId}&store_id=eq.${storeId}&draft_id=eq.${id}&phone_user_id=eq.${s.id}&select=*`):[];
 const bound=!!binding&&!binding.revoked_at&&Date.parse(binding.expires_at)>Date.now()&&(!s.scannerOnly||s.scannerLogin);
 if(path===`scanner/drafts/${id}/pc-state`&&method==='GET'){if(!pc)return fail('PC terminal required.',403);return json({status:draft.status,save_key:draft.save_key||null})}
 if(path===`scanner/drafts/${id}/sync`&&method==='GET'){
  if(!bound)return fail('Select this authorized draft again.',403);
  const events=await db(env,`${eventTable}?draft_id=eq.${id}&store_id=eq.${storeId}&binding_id=eq.${binding.id}&select=id,product_id,status,reason,created_at,acknowledged_at&order=created_at.desc&limit=100`);
  return json({draft_id:id,kind,status:draft.status,connected:valid(draft),events});
 }
 if(path===`scanner/drafts/${id}/status`&&method==='GET'){
  if(!bound)return fail('Select this authorized draft again.',403);
  return json({draft_id:id,kind,status:valid(draft)?'ready':draft.status==='ready'?'expired':draft.status,
   expires_at:draft.expires_at,connected:valid(draft),binding_id:binding.id});
 }
 if(path===`scanner/drafts/${id}/bind`&&method==='POST'){
  if(s.scannerOnly&&!s.scannerLogin)return fail('Sign in using a new Scanner QR on the shop PC.',403);
  if(!valid(draft))return fail('Draft unavailable. Ask the PC to create a new bill.',409);
  const record={id:crypto.randomUUID(),store_id:storeId,draft_id:id,phone_user_id:s.id,expires_at:iso(20*60000)};
  await post(env,'scanner_bindings',record);return json({binding_id:record.id,draft_id:id,kind});
 }
 if(path===`scanner/drafts/${id}/catalog`&&method==='GET'){
  if(!bound||!valid(draft))return fail('Select an active authorized bill.',403);
  return json(await catalog(env,storeId,request));
 }
 if(path===`scanner/drafts/${id}/code`&&method==='POST'&&shopType==='electronics'){
  if(!bound||!valid(draft)||!uuid(body.product_id))return fail('Select an active PC bill.',403);
  const [item]=await db(env,`inventory_items?id=eq.${body.product_id}&store_id=eq.${storeId}&active=eq.true&select=item_code,description`);
  return item?json({barcode:item.item_code,name:item.description,existing:true}):fail('Inventory item not found.',404);
 }
 if(path===`scanner/drafts/${id}/code`&&method==='POST'){
  if(!bound||!valid(draft)||!allowed(s,'inventory','edit')||!uuid(body.product_id))return fail('Pharmacy inventory editing permission required.',403);
  const [p]=await db(env,`pharmacy_products?id=eq.${body.product_id}&store_id=eq.${storeId}&active=eq.true&select=id,barcode,name`);
  if(!p)return fail('Medicine not found.',404);
  if(p.barcode)return json({barcode:p.barcode,name:p.name,existing:true});
  const code='EMS'+Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
  const changed=await patch(env,'pharmacy_products',`id=eq.${p.id}&store_id=eq.${storeId}&barcode=is.null`,{barcode:code});
  if(!changed.length){const [fresh]=await db(env,`pharmacy_products?id=eq.${p.id}&store_id=eq.${storeId}&select=barcode`);return json({barcode:fresh?.barcode,name:p.name,existing:true})}
  await post(env,'activity_logs',{store_id:storeId,actor_type:s.adminAccess?'admin':'staff',actor_id:s.id,action:'assign pharmacy scanner barcode',entity_type:'pharmacy product',entity_id:p.id,metadata:{barcode:code}});
  return json({barcode:code,name:p.name,existing:false});
 }
 if(path===`scanner/drafts/${id}/events`&&method==='POST'){
  if(!bound||!uuid(body.event_id)||!uuid(body.product_id))return fail('Select a valid draft and item.',403);
  const [existing]=await db(env,`${eventTable}?id=eq.${body.event_id}&select=id,store_id,draft_id,binding_id,product_id,status,reason`);
  if(existing){if(existing.store_id!==storeId||existing.draft_id!==id||existing.binding_id!==binding.id||existing.product_id!==body.product_id)return fail('Event ID already belongs to another scan.',409);return json({event_id:existing.id,status:existing.status,reason:existing.reason||null});}
  const result=await enqueue(env,{id:body.event_id,store:storeId,draft:id,binding:binding.id,user:s.id,product:body.product_id},shopType);
  if(result!=='ok')return fail('Draft is inactive or item unavailable; scan was NOT queued.',409);
  const [saved]=await db(env,`${eventTable}?id=eq.${body.event_id}&select=store_id,draft_id,binding_id,product_id,status,reason`);
  if(!saved||saved.store_id!==storeId||saved.draft_id!==id||saved.binding_id!==binding.id||saved.product_id!==body.product_id)return fail('Event ID already belongs to another scan.',409);
  return json({event_id:body.event_id,status:saved.status,reason:saved.reason||null},saved.status==='pending'?202:200);
 }
 if(path===`scanner/drafts/${id}/events`&&method==='GET'){
  if(pc){
   if(draft.status!=='ready'||Date.parse(draft.expires_at)<=Date.now())return fail('PC draft closed or expired; do not apply pending scans.',409);
   await patch(env,'scanner_drafts',`id=eq.${id}&store_id=eq.${storeId}&terminal_id=eq.${draft.terminal_id}&status=eq.ready`,{last_seen:iso()});
   return json(await db(env,`${eventTable}?draft_id=eq.${id}&store_id=eq.${storeId}&status=eq.pending&select=*&order=created_at.asc&limit=100`));
  }
  if(!bound)return fail('Select an authorized draft.',403);
  const rows=await db(env,`${eventTable}?draft_id=eq.${id}&store_id=eq.${storeId}&binding_id=eq.${binding.id}&select=id,product_id,status,reason,created_at,acknowledged_at&order=created_at.desc&limit=100`);
  return json(rows);
 }
 if(path===`scanner/drafts/${id}/ack`&&method==='POST'){
  if(!pc||!uuid(body.event_id)||!['applied','rejected'].includes(body.status))return fail('PC acknowledgment required.',403);
  if(!valid(draft))return fail('Draft inactive. Event was NOT acknowledged.',409);
  const updated=await patch(env,eventTable,`id=eq.${body.event_id}&store_id=eq.${storeId}&draft_id=eq.${id}&status=eq.pending`,{status:body.status,reason:body.status==='rejected'?String(body.reason||'Unable to add medicine').slice(0,200):null,acknowledged_at:iso()});
  if(!updated.length){const [event]=await db(env,`${eventTable}?id=eq.${body.event_id}&store_id=eq.${storeId}&draft_id=eq.${id}&select=status`);if(event?.status===body.status)return json({status:event.status});return fail('Event already handled or no longer available.',409)}
  return json({status:body.status});
 }
 if(path===`scanner/drafts/${id}/prepare`&&method==='POST'){
  if(!pc||!uuid(body.save_key))return fail('PC and retry-safe save key required.',403);
  const result=await prepare(env,storeId,id,s.id,body.save_key,shopType);
  if(result!=='ok')return fail(result==='pending'||result==='pending_or_inactive'?'Draft has pending scans or is inactive; resolve before saving.':'Draft is no longer active.',409);
  return json({status:'saving',save_key:body.save_key});
 }
 if(path===`scanner/drafts/${id}/resume`&&method==='POST'){
  if(!pc||draft.status!=='saving'||body.confirmed_failed!==true)return fail('Only a confirmed failed save can resume.',409);
  const [op]=await db(env,shopType==='electronics'?`scanner_invoice_saves?store_id=eq.${storeId}&operation_key=eq.${draft.save_key}&select=invoice_id`:`pharmacy_operations?store_id=eq.${storeId}&operation_key=eq.${draft.save_key}&select=invoice_id`);
  if(op?.invoice_id)return fail('Invoice was already saved. Close this draft instead.',409);
  const updated=await patch(env,'scanner_drafts',`id=eq.${id}&store_id=eq.${storeId}&status=eq.saving&save_key=eq.${draft.save_key}`,{status:'ready',save_key:null,last_seen:iso()});
  return updated.length?json({status:'ready'}):fail('Draft state changed; verify invoice before resuming.',409);
 }
 if(path===`scanner/drafts/${id}/finish`&&method==='POST'){
  if(!pc||!['saving','closed'].includes(draft.status))return fail('Draft not in saving state.',409);
  const [op]=await db(env,shopType==='electronics'?`scanner_invoice_saves?store_id=eq.${storeId}&operation_key=eq.${draft.save_key}&kind=eq.${kind}&select=invoice_id`:`pharmacy_operations?store_id=eq.${storeId}&operation_key=eq.${draft.save_key}&operation_type=eq.${kind}&select=invoice_id`);
  if(!op?.invoice_id)return fail('Official invoice is not confirmed. Keep draft locked and verify the sale.',409);
  if(draft.status==='saving')await patch(env,'scanner_drafts',`id=eq.${id}&store_id=eq.${storeId}&status=eq.saving`,{status:'closed'});
  return json({status:'closed',invoice_id:op.invoice_id});
 }
 if(path===`scanner/drafts/${id}/cancel`&&method==='POST'){
  if(!pc)return fail('PC terminal required.',403);
  if(draft.status==='saving')return fail('Save status uncertain. Verify the invoice before leaving this draft.',409);
  await patch(env,'scanner_drafts',`id=eq.${id}&store_id=eq.${storeId}&status=eq.ready`,{status:'cancelled'});
  await patch(env,eventTable,`draft_id=eq.${id}&store_id=eq.${storeId}&status=in.(pending,applied)`,{status:'rejected',reason:'PC draft cancelled before posting',acknowledged_at:iso()});
  return json({status:'cancelled'});
 }
 return fail('Scanner route not found.',404);
}
export async function scannerActiveDrafts({env,s,allowed}){
 if(!s?.storeId||(!allowed(s,'sales','add')&&!allowed(s,'purchase','add'))||!allowed(s,'inventory','view')||s.readOnly||s.licenseExpired)return fail('Billing permissions required.',403);
 const [store]=await db(env,`stores?id=eq.${s.storeId}&select=shop_type,business_type,status,admin_id`);
 if(s.adminAccess){const [admin]=await db(env,`administrators?id=eq.${s.id}&active=eq.true&select=id`);if(!admin||store?.admin_id!==s.id)return fail('Administrator access was revoked.',403)}
 if(!scannerShopType(store)||store.status==='inactive')return fail('Active Pharmacy or Electronics shops only.',403);
 if(s.scannerOnly&&!s.scannerLogin)return json([]);
 const rows=await db(env,`scanner_drafts?store_id=eq.${s.storeId}&status=eq.ready&expires_at=gt.${q(iso())}&last_seen=gt.${q(iso(-45000))}&select=id,terminal_id,pc_user_id,kind,expires_at,last_seen&order=last_seen.desc&limit=40`);
 return json(rows.filter(d=>allowed(s,(d.kind||'sale')==='sale'?'sales':'purchase','add')).map(d=>({draft_id:d.id,terminal_label:d.terminal_id.slice(0,8),kind:d.kind||'sale',pc_user_id:d.pc_user_id,expires_at:d.expires_at,last_seen:d.last_seen})));
}
