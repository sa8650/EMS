/* Cloudflare Pages Function: custom auth + tenant-enforced EMS API */
import {db,dbConfigured} from '../_lib/db.js';
import {connectxSmsRoutes,enqueueAutoSms} from '../_lib/connectx_sms.js';
import {simCarrierRoutes} from '../_lib/connectx_sim_carriers.js';
import {publicAppStoreRoutes} from '../_lib/app_store.js';
import {ownerAppStoreRoutes} from '../_lib/app_store_admin.js';
const enc = new TextEncoder(), dec = new TextDecoder();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(message,status=400)=>json({error:message},status);
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function hmac(v,key){return crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']),enc.encode(v));}
async function token(payload,key){let h=b64u(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))),p=b64u(enc.encode(JSON.stringify(payload)));return h+'.'+p+'.'+b64u(await hmac(h+'.'+p,key));}
async function session(req,key){let x=req.headers.get('authorization')?.replace('Bearer ',''); if(!x)return null;let [h,p,s]=x.split('.');if(!h||!p||!s||b64u(await hmac(h+'.'+p,key))!==s)return null;let d=JSON.parse(dec.decode(unb64(p)));return d.exp>Date.now()/1000?d:null;}
async function decodeSigned(t,key){if(!t)return null;let [h,p,s]=String(t).split('.');if(!h||!p||!s)return null;try{if(b64u(await hmac(h+'.'+p,key))!==s)return null;let d=JSON.parse(dec.decode(unb64(p)));return d.exp>Date.now()/1000?d:null}catch{return null}}
async function sendBrevo(env,to,subject,html){try{if(!env.BREVO_API_KEY||!to)return false;let [cfg]=await db(env,'connectx_settings?select=*');let from=cfg?.from_email||'no-reply@ems.local',name=cfg?.from_name||'EMS V1';let res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{name,email:from},to:[{email:to}],subject,htmlContent:html})});return res.ok}catch{return false}}
const PBKDF2_ITERATIONS=100000; /* Cloudflare Workers WebCrypto maximum */
async function hash(password,salt=b64u(crypto.getRandomValues(new Uint8Array(16)))){let bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']),256);return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${b64u(bits)}`;}
async function check(password,stored){let [,i,s,v]=stored.split('$'),iterations=+i;if(!iterations||iterations>PBKDF2_ITERATIONS)return false;let bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(s),iterations,hash:'SHA-256'},await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']),256);return b64u(bits)===v;}
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
const shortId=id=>String(id||'').replaceAll('-','').slice(0,6).toUpperCase();
const emailList=v=>String(v||'').split(/[;,]/).map(x=>x.trim().toLowerCase()).filter(Boolean);const validEmail=x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);const safeText=x=>String(x||'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
async function body(req){try{return await req.json()}catch{return {}}}
async function audit(env,s,action,entity,id,meta={}){try{let storeId=s?.storeId||(entity==='store'?id:(meta?.storeId||null));await db(env,'activity_logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:storeId,actor_type:s?.role||'staff',actor_id:s?.id||null,action,entity_type:entity,entity_id:id||null,metadata:meta||{}})});}catch(e){console.error('Audit failed:',e)}}
async function currentEntitlement(env,adminId){let now=new Date().toISOString(),[x]=await db(env,`current_entitlements?admin_id=eq.${adminId}&status=eq.active&starts_at=lte.${now}&expires_at=gt.${now}&select=*`);if(!x)return null;let [license]=await db(env,`licenses?id=eq.${x.current_license_id}&select=status,expires_at`);if(!license||license.status!=='active'||!license.expires_at||new Date(license.expires_at)<=new Date())return null;return x}
async function enforceEntitlement(env,adminId){let entitlement=await currentEntitlement(env,adminId);if(entitlement)return entitlement;await db(env,`stores?admin_id=eq.${adminId}&status=neq.inactive`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'read_only',updated_at:new Date().toISOString()})});await db(env,`current_entitlements?admin_id=eq.${adminId}&status=eq.active`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'expired',updated_at:new Date().toISOString()})});return null}
async function addonPlan(env,adminId,addonKey){let now=new Date().toISOString();let [p]=await db(env,`addon_purchases?admin_id=eq.${adminId}&addon_key=eq.${addonKey}&status=eq.active&expires_at=gt.${now}&select=*`);return p?{daily_limit:Number(p.daily_limit||0),expires_at:p.expires_at}:null}
async function featureEver(env,storeId,key){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id`);if(!store)return false;let col=key==='connectx'?'connectx_enabled':key==='zudo'?'zudo_enabled':key==='truebill'?'truebill_enabled':key==='vaultium'?'vaultium_gb':'business_health_enabled';let cond=key==='vaultium'?'gt.0':'is.true';let [lic]=await db(env,`licenses?admin_id=eq.${store.admin_id}&${col}=${cond}&status=eq.active&select=id&limit=1`);if(lic)return true;let [addon]=await db(env,`addon_purchases?admin_id=eq.${store.admin_id}&addon_key=eq.${key}&status=neq.rejected&select=id&limit=1`);if(addon)return true;let table=key==='connectx'?'connectx_messages':key==='zudo'?'zudo_conversations':key==='truebill'?'truebill_scans':key==='vaultium'?'vaultium_files':'business_health_reports';let [use]=await db(env,`${table}?store_id=eq.${storeId}&select=id&limit=1`);return !!use}
const laterDate=(a,b)=>{a=a?new Date(a):null;b=b?new Date(b):null;if(!a)return b?b.toISOString():null;if(!b)return a.toISOString();return a>b?a.toISOString():b.toISOString()};
async function businessHealthPlan(env,storeId){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id,status`);if(!store||!['active','read_only'].includes(store.status))return null;let [ent,addon]=await Promise.all([currentEntitlement(env,store.admin_id),addonPlan(env,store.admin_id,'business_health')]);let lic=ent?.business_health_enabled?{daily:Number(ent.business_health_daily_limit||0),expires:ent.expires_at}:null;if(!lic&&!addon)return null;return {business_health_daily_limit:Math.max(lic?lic.daily:0,addon?addon.daily_limit:0),expires_at:laterDate(lic?lic.expires:null,addon?addon.expires_at:null)}}
async function truebillPlan(env,storeId){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id,status`);if(!store||!['active','read_only'].includes(store.status))return null;let [ent,addon]=await Promise.all([currentEntitlement(env,store.admin_id),addonPlan(env,store.admin_id,'truebill')]);let lic=ent?.truebill_enabled?{expires:ent.expires_at}:null;if(!lic&&!addon)return null;return {enabled:true,expires_at:laterDate(lic?lic.expires:null,addon?addon.expires_at:null)}}
const GB=1024*1024*1024;
let _vaultExpCols=null;
/* Detects whether vaultium_files has the expense_id/expense_code columns.
 * Old deployments that have not run migration_vaultium_expense_links yet
 * return false, and every Vaultium query/insert then falls back to the
 * legacy shape so the feature keeps working instead of erroring. */
async function vaultExpenseColumns(env){
 if(_vaultExpCols!==null)return _vaultExpCols;
 // A WHERE on the column fails on old schemas for BOTH drivers: PostgREST
 // rejects unknown columns (400), and the D1 driver compiles the same WHERE.
 // (The select-projection alone is not enough — D1 always does SELECT *.)
 try{await db(env,'vaultium_files?expense_id=is.null&select=id&limit=1');_vaultExpCols=true}catch{_vaultExpCols=false}
 return _vaultExpCols;
}
let _duePayCols=null;
/* Detects whether due_recoveries has the payment_method/transaction_id
 * columns (migration 034). Older deployments return false, and recoveries
 * keep working without payment details instead of erroring. */
async function duePayCols(env){
 if(_duePayCols!==null)return _duePayCols;
 try{await db(env,'due_recoveries?payment_method=is.null&select=id&limit=1');_duePayCols=true}catch{_duePayCols=false}
 return _duePayCols;
}
async function vaultFileRows(env,storeId,limit){
 const has=await vaultExpenseColumns(env);
 const cols=has
  ?'id,invoice_id,invoice_number,expense_id,expense_code,filename,content_type,size_bytes,created_at'
  :'id,invoice_id,invoice_number,filename,content_type,size_bytes,created_at';
 let rows=await db(env,`vaultium_files?store_id=eq.${storeId}&select=${cols}&order=created_at.desc&limit=${limit}`);
 if(!has)rows=rows.map(r=>({...r,expense_id:null,
  // Legacy expense uploads were stored with invoice_id NULL and invoice_number = EXP-code.
  expense_code:r.invoice_id?null:(r.invoice_number||null)}));
 return rows;
}
async function vaultiumPlan(env,storeId){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id,status`);if(!store||!['active','read_only'].includes(store.status))return null;let [ent,addon]=await Promise.all([currentEntitlement(env,store.admin_id),addonPlan(env,store.admin_id,'vaultium')]);let lic=ent&&Number(ent.vaultium_gb||0)>0?{gb:Number(ent.vaultium_gb),expires:ent.expires_at}:null;if(!lic&&!addon)return null;return {gb:Math.max(lic?lic.gb:0,addon?Number(addon.daily_limit||0):0),expires_at:laterDate(lic?lic.expires:null,addon?addon.expires_at:null)}}
async function connectxPlan(env,storeId){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id,status`);if(!store||!['active','read_only'].includes(store.status))return null;let [ent,addon]=await Promise.all([currentEntitlement(env,store.admin_id),addonPlan(env,store.admin_id,'connectx')]);let lic=ent?.connectx_enabled?{daily:Number(ent.connectx_daily_limit||0),expires:ent.expires_at}:null;if(!lic&&!addon)return null;return {connectx_daily_limit:Math.max(lic?lic.daily:0,addon?addon.daily_limit:0),expires_at:laterDate(lic?lic.expires:null,addon?addon.expires_at:null)}}
async function zudoPlan(env,storeId){let [store]=await db(env,`stores?id=eq.${storeId}&select=admin_id,status`);if(!store||!['active','read_only'].includes(store.status))return null;let [ent,addon]=await Promise.all([currentEntitlement(env,store.admin_id),addonPlan(env,store.admin_id,'zudo')]);let lic=ent?.zudo_enabled?{daily:Number(ent.zudo_daily_limit||0),expires:ent.expires_at}:null;if(!lic&&!addon)return null;return {zudo_daily_limit:Math.max(lic?lic.daily:0,addon?addon.daily_limit:0),expires_at:laterDate(lic?lic.expires:null,addon?addon.expires_at:null)}}
const AI_PROVIDERS={
 '@cf/meta/llama-3.2-3b-instruct':{name:'Llama 3.2 3B Instruct (Cloudflare · free)',provider:'cf'},
 'gemini:gemini-3.6-flash':{name:'Gemini 3.6 Flash (Google)',provider:'gemini'},
 'gemini:gemini-3.5-flash-lite':{name:'Gemini 3.5 Flash-Lite (Google)',provider:'gemini'},
 'groq:openai/gpt-oss-120b':{name:'GPT-OSS 120B (Groq · free tier)',provider:'groq'},
 'groq:openai/gpt-oss-20b':{name:'GPT-OSS 20B (Groq · free tier)',provider:'groq'},
 'groq:qwen/qwen3.6-27b':{name:'Qwen3.6 27B vision (Groq · preview)',provider:'groq'},
 'cerebras:llama-3.3-70b':{name:'Llama 3.3 70B (Cerebras · free)',provider:'cerebras'},
 'cerebras:gpt-oss-120b':{name:'GPT-OSS 120B (Cerebras · free)',provider:'cerebras'},
 'cerebras:qwen-3-32b':{name:'Qwen3 32B (Cerebras · free)',provider:'cerebras'},
 'cerebras:llama-4-scout-17b-16e-instruct':{name:'Llama 4 Scout 17B (Cerebras · free)',provider:'cerebras'},
 'deepseek:deepseek-chat':{name:'DeepSeek Chat V3 (DeepSeek direct)',provider:'deepseek'},
 'deepseek:deepseek-reasoner':{name:'DeepSeek Reasoner R1 (DeepSeek direct)',provider:'deepseek'},
 'openrouter:openai/gpt-oss-120b:free':{name:'GPT-OSS 120B (OpenRouter · free)',provider:'openrouter'},
 'openrouter:openai/gpt-oss-20b:free':{name:'GPT-OSS 20B (OpenRouter · free)',provider:'openrouter'},
 'openrouter:google/gemma-4-31b-it:free':{name:'Gemma 4 31B (OpenRouter · free)',provider:'openrouter'},
 'openrouter:nvidia/nemotron-3-super-120b-a12b:free':{name:'Nemotron 3 Super 120B (OpenRouter · free)',provider:'openrouter'},
 'github:gpt-4o-mini':{name:'GPT-4o mini (GitHub Models · Copilot, free)',provider:'github'},
 'github:DeepSeek-V3':{name:'DeepSeek V3 (GitHub Models · Copilot, free)',provider:'github'},
 'github:Meta-Llama-3.3-70B-Instruct':{name:'Llama 3.3 70B (GitHub Models · Copilot, free)',provider:'github'},
 'anthropic:claude-haiku-4-5':{name:'Claude Haiku 4.5 (Anthropic)',provider:'anthropic'},
 'anthropic:claude-sonnet-5':{name:'Claude Sonnet 5 (Anthropic)',provider:'anthropic'}
};
/* Saved model ids that providers have retired/decommissioned -> current replacement.
 * Applied transparently so shops keep working after provider-side removals. */
const AI_MODEL_FALLBACKS={
 'gemini:gemini-2.0-flash':'gemini:gemini-3.6-flash',
 'gemini:gemini-2.0-flash-lite':'gemini:gemini-3.5-flash-lite',
 'groq:llama-3.3-70b-versatile':'groq:openai/gpt-oss-120b',
 'groq:qwen-qwq-32b':'groq:openai/gpt-oss-120b',
 'groq:llama-3.1-8b-instant':'groq:openai/gpt-oss-20b',
 'cerebras:llama3.1-8b':'cerebras:llama-3.3-70b',
 'cerebras:qwen-2.5-7b':'cerebras:qwen-3-32b',
 'cerebras:gpt-oss-20b':'cerebras:gpt-oss-120b'
};
function modernModel(id){let m=String(id||'@cf/meta/llama-3.2-3b-instruct');if(AI_MODEL_FALLBACKS[m])m=AI_MODEL_FALLBACKS[m];if(aiProvider(m)==='cf'&&(m.includes('llama-3.1')||m.includes('infire')))m='@cf/meta/llama-3.2-3b-instruct';return m}
/* Detects the user's writing mode so the model cannot drift to the language of
 * earlier turns. Returns a hard directive appended to the LATEST user message:
 * 'bangla' (Bengali script), 'banglish' (Roman Bengali), 'english', or
 * 'same' (Hindi/Arabic/other — reply in that language and script). */
function zudoLangMode(q){
 const s=String(q||'');
 if(/[\u0980-\u09FF]/.test(s))return 'bangla';
 if(/[\u0900-\u097F]/.test(s))return 'hindi';
 if(/[\u0600-\u06FF]/.test(s))return 'arabic';
 const words=s.toLowerCase().match(/[a-z']+/g)||[];
 const banglish=new Set(['ami','amr','amar','amake','amakey','amader','apni','apnar','apnake','tumi','tomar','tomake','tui','tor','kothay','kotha','koto','kivabe','keno','kichu','kichute','kono','kon','ache','achhe','achen','achilo','nai','nei','thakbe','thake','thakto','hobe','hobena','hoy','hoye','hoeche','hoyche','hoyese','geche','geche','giye','gelo','gulo','gula','korbo','korbona','koro','korben','korte','korchen','kori','korite','chai','chan','chao','chay','chaichi','dao','din','deoya','debe','deben','dite','diyecho','diyechi','diyechilen','bolo','bolun','bolte','bujhi','bujhte','bujh','parba','parben','paro','parchi','ektu','ekta','ekhon','aaj','aj','kal','roja','bhalo','valo','khub','kom','komme','beshi','taka','dokan','bikri','kroy','baad','pao','pabe','paben','pawa','lagbe','lagto','darun','sob','soba','naki','tahole','tarpor','somossa','ossubidha','osubidha','vai','bhai','apu','salam','namaskar','doya','koruna','jan','janen','jano','ache','vala','mot','kichui','tuku','gn']);
 if(words.some(w=>banglish.has(w)))return 'banglish';
 return 'english';
}
function zudoLangDirective(q){
 const mode=zudoLangMode(q);
 if(mode==='bangla')return '- The question above is in BENGALI (Bangla) script. Write your ENTIRE reply in natural, warm Bengali/Bangla script (অ আ ক খ). Do not use English sentences; common product/number words may stay as-is.';
 if(mode==='banglish')return '- The question above is in BANGLISH (Bengali written in Roman/Latin letters, e.g. "amar koto sale hoyeche?"). Write your ENTIRE reply in the SAME Banglish style — warm, simple Bengali using Roman letters (e.g. "Apnar ajker sale hoyeche ৳..."). Do NOT use Bengali script and do NOT answer in English.';
 if(mode==='hindi')return '- The question above is in Hindi (Devanagari script). Write your ENTIRE reply in the same Hindi language and script.';
 if(mode==='arabic')return '- The question above is in Arabic script. Write your ENTIRE reply in the same language and script.';
 return '- The question above is in English. Write your ENTIRE reply ONLY in English, even if earlier messages in this conversation used Bangla or Banglish.';
}
const aiProvider=m=>{const k=String(m||'');const pfx=k.split(':')[0];if(k.startsWith('@cf/'))return 'cf';if(['gemini','groq','cerebras','deepseek','openrouter','github','anthropic'].includes(pfx))return pfx;return 'cf'};
const aiConfigured=(env,m)=>{if(env.MOCK_AI==='1')return true;const p=aiProvider(m);return {cf:!!env.AI,gemini:!!env.GEMINI_API_KEY,groq:!!env.GROQ_API_KEY,cerebras:!!env.CEREBRAS_API_KEY,deepseek:!!env.DEEPSEEK_API_KEY,openrouter:!!env.OPENROUTER_API_KEY,github:!!env.GITHUB_TOKEN,anthropic:!!env.ANTHROPIC_API_KEY}[p]};
async function openaiCompat(url,key,model,messages,temperature,maxTokens,extraHeaders){const res=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json',...(extraHeaders||{})},body:JSON.stringify({model,messages,temperature,max_tokens:maxTokens||1024})});const out=await res.json().catch(()=>({}));if(!res.ok)throw Error(out?.error?.message||out?.message||'AI request failed');return String(out?.choices?.[0]?.message?.content||'')}
async function runAI(env,model,messages,temperature=0.3,maxTokens=1024){
 if(env.MOCK_AI==='1'){
  if(messages.some(m=>typeof m.content==='string'&&(m.content.includes('DATA SNAPSHOT')||m.content.includes('Business Health Advisor')))){
   return '# Business health overview\nThe shop recorded solid performance with steady gross sales and manageable return volume.\n\n# What is working well\n- Sales performance and inventory restock movement\n- Due recoveries and cash receipts\n\n# What needs attention\n- Monitor customer returns and refunds\n- Manage low-stock items\n\n# Your 7-day action plan\n1. Review returned item conditions and reasons\n2. Reorder fast-selling stock\n3. Follow up on sales dues\n4. Inspect quarantined damaged merchandise\n5. Update customer contact information\n\n# Cash and due collection guidance\n- Promptly collect invoice balances\n\n# Growth ideas\n- Bundle accessories with core inventory';
  }
  let userMsg = (messages.find(m => m.role === 'user')?.content || '').toLowerCase();
  if (userMsg.includes('quarantine') || userMsg.includes('damaged') || userMsg.includes('defective')) {
   return 'Based on the store quarantine records, we currently track quarantined Damaged and Defective products isolated from active sellable inventory, including returned item codes, descriptions, quantities, and customer reasons.';
  }
  return 'Based on current shop data, customer returns, product exchanges, refunds, sellable inventory, and quarantined damaged/defective merchandise are fully tracked.';
 }
 const m=modernModel(model),p=aiProvider(m);
 if(p==='gemini'){if(!env.GEMINI_API_KEY)throw Error('Gemini API key is not configured. Add GEMINI_API_KEY to Cloudflare secrets.');const gm=m.slice(7);const sys=messages.filter(x=>x.role==='system').map(x=>x.content).join('\n\n');const contents=messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]}));const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${env.GEMINI_API_KEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents,systemInstruction:sys?{parts:[{text:sys}]}:undefined,generationConfig:{temperature,maxOutputTokens:maxTokens}})});const out=await res.json().catch(()=>({}));if(!res.ok)throw Error(out?.error?.message||'Gemini request failed');return String(out?.candidates?.[0]?.content?.parts?.[0]?.text||'')}
 if(p==='groq'){if(!env.GROQ_API_KEY)throw Error('Groq API key is not configured. Add GROQ_API_KEY to Cloudflare secrets.');return openaiCompat('https://api.groq.com/openai/v1/chat/completions',env.GROQ_API_KEY,m.slice(5),messages,temperature,maxTokens)}
 if(p==='cerebras'){if(!env.CEREBRAS_API_KEY)throw Error('Cerebras API key is not configured. Add CEREBRAS_API_KEY to Cloudflare secrets.');return openaiCompat('https://api.cerebras.ai/v1/chat/completions',env.CEREBRAS_API_KEY,m.slice(9),messages,temperature,maxTokens)}
 if(p==='deepseek'){if(!env.DEEPSEEK_API_KEY)throw Error('DeepSeek API key is not configured. Add DEEPSEEK_API_KEY to Cloudflare secrets.');return openaiCompat('https://api.deepseek.com/v1/chat/completions',env.DEEPSEEK_API_KEY,m.slice(9),messages,temperature,maxTokens)}
 if(p==='openrouter'){if(!env.OPENROUTER_API_KEY)throw Error('OpenRouter API key is not configured. Add OPENROUTER_API_KEY to Cloudflare secrets.');return openaiCompat('https://openrouter.ai/api/v1/chat/completions',env.OPENROUTER_API_KEY,m.slice(11),messages,temperature,maxTokens,{'HTTP-Referer':'https://ems-v1.app','X-Title':'EMS V1 · Zudo AI'})}
 if(p==='github'){if(!env.GITHUB_TOKEN)throw Error('GitHub token is not configured. Add GITHUB_TOKEN to Cloudflare secrets (GitHub Models, free).');return openaiCompat('https://models.inference.ai.azure.com/chat/completions',env.GITHUB_TOKEN,m.slice(7),messages,temperature,maxTokens)}
 if(p==='anthropic'){if(!env.ANTHROPIC_API_KEY)throw Error('Anthropic API key is not configured. Add ANTHROPIC_API_KEY to Cloudflare secrets.');const sys=messages.filter(x=>x.role==='system').map(x=>x.content).join('\n\n');const amessages=messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content}));const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:m.slice(10),max_tokens:maxTokens,temperature,system:sys||undefined,messages:amessages})});const out=await res.json().catch(()=>({}));if(!res.ok)throw Error(out?.error?.message||'Anthropic request failed');return String(out?.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')||'')}
 if(!env.AI)throw Error('Cloudflare AI binding is not configured.');const r=await env.AI.run(m,{messages,temperature,max_tokens:maxTokens});return String(r?.response||r?.result?.response||'')}

const tables={supplier:'suppliers',customer:'customers',inventory:'inventory_items',expense:'expenses',staff:'staff'};
const perms={supplier:'supplier',customer:'customer',inventory:'inventory',expense:'expense',staff:'staff'};
const PERMISSION_SECTIONS=['dashboard','supplier','customer','inventory','purchase','sales','returns_refunds','expense','due_recover','staff','report','settings','connectx','zudo','attendance','salary','vaultium'];
const PERMISSION_ACTIONS=['view','add','edit','delete'];
function normalizePermissions(input){let output={};for(const section of PERMISSION_SECTIONS){let values=Array.isArray(input?.[section])?input[section]:[],actions=section==='zudo'?['view','send','delete']:PERMISSION_ACTIONS;output[section]=actions.filter(action=>values.includes(action));}return output}
function allowed(s,section,verb){if(s.readOnly&&verb!=='view')return false;if(s.role==='admin'||s.adminAccess)return true;if(section==='dashboard'&&verb==='view')return true;let actions=(s.permissions||{})[section]||[];if(!actions.length&&section==='returns_refunds')actions=(s.permissions||{})['sales']||[];return actions.includes(verb)||(section==='connectx'&&verb==='send'&&actions.includes('add'))||(section==='zudo'&&verb==='add'&&(actions.includes('send')||actions.includes('add')))}
function allowedAddon(s,section,verb){if(s.role==='admin'||s.adminAccess)return true;let actions=(s.permissions||{})[section]||[];return actions.includes(verb)||(section==='connectx'&&verb==='send'&&actions.includes('add'))||(section==='zudo'&&verb==='add'&&(actions.includes('send')||actions.includes('add')))}
function publicStaff(r){delete r.password_hash;return r}
export async function onRequest(context){const {request,env,params}=context, path=(params.path||[]).join('/'), method=request.method;try{
 {let missing=['SESSION_SECRET'].filter(k=>!env[k]);if(!dbConfigured(env))missing.push(String(env.DB_DRIVER||'').toLowerCase()==='d1'?'DB (D1 binding)':'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or set DB_DRIVER=d1 with a D1 binding named DB)');if(missing.length)return fail('Server configuration is incomplete: missing '+missing.join(', ')+'.',500);}
 const publicStoreResponse=await publicAppStoreRoutes({env,request,path,method});
 if(publicStoreResponse)return publicStoreResponse;
 if(path==='auth/admin/register'&&method==='POST'){let b=await body(request),email=(b.email||'').trim().toLowerCase();if(!b.name||!b.phone||!email||!b.password||b.password.length<10)return fail('Name, phone, valid email and a 10-character password are required.');let exists=await db(env,`administrators?email=eq.${encodeURIComponent(email)}&select=id`);if(exists.length)return fail('That email is already registered.',409);let adminCode;for(let i=0;i<12;i++){adminCode=String(crypto.getRandomValues(new Uint32Array(1))[0]%9000+1000);let used=await db(env,`administrators?admin_code=eq.${adminCode}&select=id`);if(!used.length)break;adminCode=null}if(!adminCode)throw Error('Could not reserve an Administrator ID. Please retry.');let [a]=await db(env,'administrators',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:b.name.trim(),address:b.address||null,phone:b.phone.trim(),email,password_hash:await hash(b.password),admin_code:adminCode})});return json({token:await token({id:a.id,role:'admin',exp:Math.floor(Date.now()/1000)+28800},env.SESSION_SECRET),user:{id:a.id,name:a.name,email:a.email},role:'admin'});}
 if(path==='auth/admin/login'&&method==='POST'){let b=await body(request),[a]=await db(env,`administrators?email=eq.${encodeURIComponent((b.email||'').toLowerCase())}&select=*`);if(!a)return fail('Wrong email or password.',401);if(!a.active)return fail('Your administrator account is deactivated. Contact EMS support.',403);if(!await check(b.password||'',a.password_hash))return fail('Wrong email or password.',401);return json({token:await token({id:a.id,role:'admin',exp:Math.floor(Date.now()/1000)+28800},env.SESSION_SECRET),user:{id:a.id,admin_code:a.admin_code,name:a.name,email:a.email,phone:a.phone,address:a.address,active:a.active,created_at:a.created_at},role:'admin'});}
 if(path==='auth/shop/login'&&method==='POST'){let b=await body(request),[store]=await db(env,`stores?shop_code=eq.${encodeURIComponent(b.storeId||'')}&select=id,status,name,admin_id,category`);if(!store)return fail('Wrong Shop ID.',401);if(!await enforceEntitlement(env,store.admin_id))store.status='read_only';if(store.status==='inactive')return fail('This shop is deactivated. Contact the administrator.',403);let [st]=await db(env,`staff?store_id=eq.${store.id}&user_id=eq.${encodeURIComponent(b.userId||'')}&select=*`), fp=request.headers.get('cf-connecting-ip')+'|'+request.headers.get('user-agent');if(st){if(!st.active)return fail('This user account is deactivated. Contact your shop administrator.',403);if(!await check(b.password||'',st.password_hash))return fail('Wrong user ID or password.',401);await db(env,'device_logins?on_conflict=store_id,device_fingerprint',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({store_id:store.id,staff_id:st.id,device_fingerprint:fp,user_agent:request.headers.get('user-agent')})});await db(env,'activity_logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:store.id,actor_type:'staff',actor_id:st.id,action:'staff login',entity_type:'session',entity_id:st.id,metadata:{user_id:st.user_id,staff_name:st.full_name,user_agent:request.headers.get('user-agent'),ip:request.headers.get('cf-connecting-ip')}})});return json({token:await token({id:st.id,role:'staff',storeId:store.id,permissions:normalizePermissions(st.permissions||{}),readOnly:store.status==='read_only',exp:Math.floor(Date.now()/1000)+28800},env.SESSION_SECRET),user:{id:st.id,name:st.full_name},store:{id:store.id,name:store.name,category:store.category||'General Store'},role:'staff',readOnly:store.status==='read_only'})}let [admin]=await db(env,`administrators?id=eq.${store.admin_id}&email=eq.${encodeURIComponent((b.userId||'').toLowerCase())}&select=*`);if(!admin)return fail('Wrong user ID or password.',401);if(!admin.active)return fail('Your administrator account is deactivated. Contact EMS support.',403);if(!await check(b.password||'',admin.password_hash))return fail('Wrong user ID or password.',401);let permissions=Object.fromEntries(PERMISSION_SECTIONS.map(x=>[x,PERMISSION_ACTIONS]));await db(env,'device_logins?on_conflict=store_id,device_fingerprint',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({store_id:store.id,staff_id:null,device_fingerprint:fp,user_agent:request.headers.get('user-agent')})});await db(env,'activity_logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:store.id,actor_type:'admin',actor_id:admin.id,action:'administrator shop login',entity_type:'store',entity_id:store.id,metadata:{admin_email:admin.email,admin_name:admin.name,user_agent:request.headers.get('user-agent'),ip:request.headers.get('cf-connecting-ip')}})});let adminReturn={token:await token({id:admin.id,role:'admin',exp:Math.floor(Date.now()/1000)+28800},env.SESSION_SECRET),user:{id:admin.id,name:admin.name,email:admin.email},role:'admin'};return json({token:await token({id:admin.id,role:'staff',storeId:store.id,permissions,adminAccess:true,readOnly:store.status==='read_only',exp:Math.floor(Date.now()/1000)+28800},env.SESSION_SECRET),user:{id:admin.id,name:admin.name},store:{id:store.id,name:store.name,category:store.category||'General Store'},role:'staff',adminAccess:true,readOnly:store.status==='read_only',adminReturn})}
 if(path==='auth/ems/register'&&method==='POST'){let owners=await db(env,'ems_owners?select=id&limit=1');if(owners.length)return fail('The EMS owner has already been initialized. Use EMS login.',403);let b=await body(request),email=(b.email||'').trim().toLowerCase();if(!b.name||!email||!b.password||b.password.length<12)return fail('Name, email, and a password of at least 12 characters are required.');let [o]=await db(env,'ems_owners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:b.name,email,password_hash:await hash(b.password)})});return json({token:await token({id:o.id,role:'owner',exp:Math.floor(Date.now()/1000)+14400},env.SESSION_SECRET),user:{id:o.id,name:o.name,email:o.email},role:'owner'});}
 if(path==='auth/ems/login'&&method==='POST'){let b=await body(request),[o]=await db(env,`ems_owners?email=eq.${encodeURIComponent((b.email||'').toLowerCase())}&select=*`);if(!o)return fail('Wrong EMS email or password.',401);if(!o.active)return fail('This EMS owner account is deactivated.',403);if(!await check(b.password||'',o.password_hash))return fail('Wrong EMS email or password.',401);return json({token:await token({id:o.id,role:'owner',exp:Math.floor(Date.now()/1000)+14400},env.SESSION_SECRET),user:{id:o.id,name:o.name,email:o.email},role:'owner'});}
 if(path==='public/page'&&method==='GET'){let slug=new URL(request.url).searchParams.get('slug'),[x]=await db(env,`public_pages?slug=eq.${encodeURIComponent(slug||'')}&select=slug,title,body,hero_image_prompt,updated_at`);if(!x)return fail('Page not found.',404);return json(x)}
 if(path==='public/blogs'&&method==='GET'){let id=new URL(request.url).searchParams.get('id');if(id){let [x]=await db(env,`blog_posts?id=eq.${id}&published=is.true&select=*&limit=1`);if(!x)return fail('Blog post not found.',404);return json(x)}return json(await db(env,'blog_posts?published=is.true&select=id,title,slug,excerpt,cover_image_url,published_at&order=published_at.desc'))}
 if(path==='public/contact'&&method==='POST'){let b=await body(request);if(!b.name||!validEmail(b.email)||!b.message)return fail('Name, valid email, and message are required.');let [x]=await db(env,'contact_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:String(b.name).slice(0,120),email:String(b.email).toLowerCase(),phone:b.phone||null,subject:b.subject||null,message:String(b.message).slice(0,5000)})});return json({ok:true,id:x.id},201)}
 if(path==='public/branding'&&method==='GET'){ let [x]=await db(env,'platform_settings?setting_key=eq.branding&select=setting_value');return json(x?.setting_value||{product_name:'EMS V1',powered_by:'DoxTox',website_name:'EMS V1',public_base_url:''});}
 if(path==='public/license-plans'&&method==='GET'){return json(await db(env,'license_plans?active=is.true&select=id,title,duration_months,max_stores,benefits,price,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb&order=price.asc'));}
 if(path.startsWith('public/invoice/')&&method==='GET'){
  let token=decodeURIComponent(path.split('/')[2]||'').trim();
  if(!token)return fail('Verification token is required.',400);

  const isUuid = /^[0-9a-f-]{36}$/i.test(token);

  // 1. Try invoices (by verification_token or id)
  let invoice = null;
  if(isUuid){
    let [byUuid]=await db(env,`invoices?verification_token=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoice_lines(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    invoice = byUuid;
    if(!invoice){
      let [byId]=await db(env,`invoices?id=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoice_lines(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
      invoice = byId;
    }
  } else {
    let [byTok]=await db(env,`invoices?verification_token=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoice_lines(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    invoice = byTok;
  }
  if(invoice){
    await db(env,'truebill_scans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:invoice.store_id||null,invoice_id:invoice.id,invoice_number:invoice.invoice_number,invoice_kind:invoice.kind,ip_address:request.headers.get('cf-connecting-ip')||null,user_agent:request.headers.get('user-agent')||null})}).catch(()=>{});
    let table=invoice.kind==='sale'?'customers':'suppliers',[party]=invoice.party_id?await db(env,`${table}?id=eq.${invoice.party_id}&select=*`).catch(()=>[]):[];
    return json({verified:true,record_type:'invoice',type:'invoice',invoice,party:party||null});
  }

  // 2. Try returns (lookup by id first if UUID, then verification_token; catches missing column errors gracefully)
  let ret = null;
  if(isUuid){
    let [byId]=await db(env,`returns?id=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoices(invoice_number,invoice_date),return_items(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    ret = byId;
  }
  if(!ret){
    let [byTok]=await db(env,`returns?verification_token=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoices(invoice_number,invoice_date),return_items(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    ret = byTok;
  }
  if(ret){
    await db(env,'truebill_scans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:ret.store_id||null,invoice_id:ret.id,invoice_number:ret.return_number,invoice_kind:'return',ip_address:request.headers.get('cf-connecting-ip')||null,user_agent:request.headers.get('user-agent')||null})}).catch(()=>{});
    let [party]=ret.customer_id?await db(env,`customers?id=eq.${ret.customer_id}&select=*`).catch(()=>[]):[];
    return json({verified:true,record_type:'return',type:'return',return:ret,party:party||null,invoice:ret.invoices||ret});
  }

  // 3. Try exchanges (lookup by id first if UUID, then verification_token; catches missing column errors gracefully)
  let exc = null;
  if(isUuid){
    let [byId]=await db(env,`exchanges?id=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoices(invoice_number,invoice_date),exchange_items(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    exc = byId;
  }
  if(!exc){
    let [byTok]=await db(env,`exchanges?verification_token=eq.${encodeURIComponent(token)}&select=*,stores(name,address,phone,phone2,email,website),invoices(invoice_number,invoice_date),exchange_items(*,inventory_items(item_code,description,unit))`).catch(()=>[]);
    exc = byTok;
  }
  if(exc){
    await db(env,'truebill_scans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:exc.store_id||null,invoice_id:exc.id,invoice_number:exc.exchange_number,invoice_kind:'exchange',ip_address:request.headers.get('cf-connecting-ip')||null,user_agent:request.headers.get('user-agent')||null})}).catch(()=>{});
    let [party]=exc.customer_id?await db(env,`customers?id=eq.${exc.customer_id}&select=*`).catch(()=>[]):[];
    return json({verified:true,record_type:'exchange',type:'exchange',exchange:exc,party:party||null,invoice:exc.invoices||exc});
  }

  return fail('Invoice verification record was not found.',404);
 }
 
 if(path==='auth/forgot-password'&&method==='POST'){
  let b=await body(request),type=b.type,email=(b.email||'').trim().toLowerCase(),otp=String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000);
  let found=null,account=null;
  if(type==='admin'){let [a]=await db(env,`administrators?email=eq.${encodeURIComponent(email)}&select=id,email,active`);if(a){found={email:a.email,type:'admin'};account=a}}
  else if(type==='owner'){let [o]=await db(env,`ems_owners?email=eq.${encodeURIComponent(email)}&select=id,email,active`);if(o){found={email:o.email,type:'owner'};account=o}}
  else if(type==='staff'){let [store]=await db(env,`stores?shop_code=eq.${encodeURIComponent(b.shopCode||'')}&select=id`);if(store){let [st]=await db(env,`staff?store_id=eq.${store.id}&email=eq.${encodeURIComponent(email)}&select=id,email,active,full_name`);if(st){found={email:st.email,type:'staff',storeId:store.id};account=st}}}
  if(!found)return json({ok:true,resetToken:null,note:'If the account exists, an OTP was sent.'});
  let otpHash=b64u(await hmac(otp,env.SESSION_SECRET));
  let resetToken=await token({email:found.email,type:found.type,storeId:found.storeId||null,otpHash,exp:Math.floor(Date.now()/1000)+600},env.SESSION_SECRET);
  let label=type==='owner'?'EMS Owner':type==='admin'?'Administrator':'Shop staff';
  await sendBrevo(env,found.email,'Your EMS password reset code',`<div style="font-family:Arial,sans-serif;color:#111;line-height:1.6"><h2 style="margin:0 0 10px">Password reset</h2><p>Use this one-time code to reset your ${label} password:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#1d4ed8">${otp}</p><p style="color:#666;font-size:13px">This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>`);
  return json({ok:true,resetToken});
 }
 if(path==='auth/verify-otp'&&method==='POST'){
  let b=await body(request),t=b.resetToken,otp=String(b.otp||'').trim();
  if(!t||!otp)return fail('Reset token and OTP are required.',400);
  let d=await decodeSigned(t,env.SESSION_SECRET);
  if(!d)return fail('Reset code is invalid or has expired.',401);
  let h=b64u(await hmac(otp,env.SESSION_SECRET));
  if(h!==d.otpHash)return fail('Incorrect OTP.',401);
  return json({ok:true});
 }
 if(path==='auth/reset-password'&&method==='POST'){
  let b=await body(request),t=b.resetToken,pw=String(b.password||''),pw2=String(b.password2||'');
  if(!t)return fail('Reset token is required.',400);
  if(pw.length<10)return fail('Password must contain at least 10 characters.',400);
  if(pw!==pw2)return fail('Passwords do not match.',400);
  let d=await decodeSigned(t,env.SESSION_SECRET);
  if(!d)return fail('Reset code is invalid or has expired.',401);
  let ph=await hash(pw);
  if(d.type==='admin'){await db(env,`administrators?email=eq.${encodeURIComponent(d.email)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({password_hash:ph})})}
  else if(d.type==='owner'){await db(env,`ems_owners?email=eq.${encodeURIComponent(d.email)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({password_hash:ph})})}
  else if(d.type==='staff'&&d.storeId){await db(env,`staff?store_id=eq.${d.storeId}&email=eq.${encodeURIComponent(d.email)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({password_hash:ph})})}
  else return fail('Account not found.',404);
  return json({ok:true});
 }
let s=await session(request,env.SESSION_SECRET);if(!s)return fail('Please sign in.',401);if(s.role==='staff'&&!s.adminAccess){let [currentStaff]=await db(env,`staff?id=eq.${s.id}&store_id=eq.${s.storeId}&select=active,permissions`);if(!currentStaff||!currentStaff.active)return fail('This user account is deactivated. Contact your shop administrator.',403);s.permissions=normalizePermissions(currentStaff.permissions||{})}if(s.storeId&&s.role!=='connectx_device'){let [sessionStore]=await db(env,`stores?id=eq.${s.storeId}&select=admin_id,status`);if(sessionStore){const ent=await enforceEntitlement(env,sessionStore.admin_id);s.readOnly=s.readOnly||sessionStore.status==='read_only'||!ent;s.licenseExpired=!ent}}
 {let carrier=await simCarrierRoutes({env,request,path,method,session:s,audit});if(carrier)return carrier;}
 {let cx=await connectxSmsRoutes({env,request,path,method,s,json,fail,body,token,audit,allowed});if(cx)return cx;}
 if(path==='me')return json(s);
 if(path==='platform/overview'){if(s.role!=='owner')return fail('Forbidden',403);let [admins,stores,licenses]=await Promise.all([db(env,'administrators?select=id,admin_code,name,email,phone,active,created_at&order=created_at.desc'),db(env,'stores?select=id,name,shop_code,status,admin_id,created_at,administrators(name,email,admin_code)&order=created_at.desc'),db(env,'licenses?select=*,administrators:administrators!licenses_admin_id_fkey(name,email,admin_code),stores(name,shop_code)&order=created_at.desc')]);return json({admins,stores,licenses});}
 if(path.startsWith('platform/administrator/')){if(s.role!=='owner')return fail('Forbidden',403);let id=path.split('/')[2];if(method==='PATCH'){let b=await body(request);let [x]=await db(env,`administrators?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean({active:b.active}))});await db(env,'platform_activity_logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner_id:s.id,action:b.active?'activate administrator':'deactivate administrator',entity_type:'administrator',entity_id:id})});return json({id:x.id,name:x.name,email:x.email,active:x.active})}}
 if(path==='platform/license-plans'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET')return json(await db(env,'license_plans?select=*&order=created_at.desc'));if(method==='POST'){let b=await body(request);let [x]=await db(env,'license_plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(clean(b))});return json(x,201)}}
 if(path.startsWith('platform/license-plan/')){if(s.role!=='owner')return fail('Forbidden',403);let id=path.split('/')[2];if(method==='PATCH'){let b=await body(request);let [x]=await db(env,`license_plans?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean(b))});return json(x)}}
 if(path==='platform/connectx'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET'){let [x]=await db(env,'connectx_settings?select=*');let today=new Date().toISOString().slice(0,10),used=await db(env,`connectx_messages?created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id`);return json({...x,usedToday:used.length,apiConfigured:!!env.BREVO_API_KEY})}if(method==='PATCH'){let b=await body(request);let [x]=await db(env,'connectx_settings?on_conflict=id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:true,provider:'brevo_api',from_name:b.from_name,from_email:b.from_email,reply_to:b.reply_to||null,global_daily_limit:Number(b.global_daily_limit),enabled:!!b.enabled,updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}}
 if(path==='platform/connectx/logs'&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);return json(await db(env,'connectx_messages?select=store_id,to_emails,subject,status,error_message,provider_message_id,shop_deleted_at,created_at&order=created_at.desc&limit=100'))}
 if(path==='platform/connectx/test'&&method==='POST'){if(s.role!=='owner')return fail('Forbidden',403);let b=await body(request),to=emailList(b.to);if(to.length!==1||!validEmail(to[0]))return fail('Enter one valid test recipient email.');let [cfg]=await db(env,'connectx_settings?select=*');if(!cfg?.from_email)return fail('Save a valid ConnectX From Email first.');if(!env.BREVO_API_KEY)return fail('BREVO_API_KEY is missing from Cloudflare Production secrets.',503);let res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{name:cfg.from_name,email:cfg.from_email},replyTo:cfg.reply_to?{email:cfg.reply_to}:undefined,to:[{email:to[0]}],subject:'ConnectX Provider Test',htmlContent:'<p>ConnectX provider test successful.</p>'})}),out=await res.json().catch(()=>({}));if(!res.ok)return fail('Brevo rejected test: '+(out.message||('HTTP '+res.status)),502);return json({ok:true,messageId:out.messageId||null})}
 if(path==='platform/zudo'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET'){let [x]=await db(env,'zudo_settings?select=*');let today=new Date().toISOString().slice(0,10),used=await db(env,`zudo_messages?role=eq.user&created_at=gte.${today}T00:00:00Z&select=id`);return json({...x,usedToday:used.length,aiBinding:!!env.AI,geminiBinding:!!env.GEMINI_API_KEY,groqBinding:!!env.GROQ_API_KEY,cerebrasBinding:!!env.CEREBRAS_API_KEY,deepseekBinding:!!env.DEEPSEEK_API_KEY,openrouterBinding:!!env.OPENROUTER_API_KEY,githubBinding:!!env.GITHUB_TOKEN,anthropicBinding:!!env.ANTHROPIC_API_KEY,models:AI_PROVIDERS})}if(method==='PATCH'){let b=await body(request);let [x]=await db(env,'zudo_settings?on_conflict=id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:true,enabled:!!b.enabled,model:b.model||'@cf/meta/llama-3.2-3b-instruct',global_daily_limit:Number(b.global_daily_limit),updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}}
 if(path==='platform/zudo/logs'&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);let convs=await db(env,'zudo_conversations?select=id,store_id,user_id,title,shop_deleted_at,created_at,updated_at&order=updated_at.desc&limit=100'),storeIds=[...new Set(convs.map(c=>c.store_id).filter(Boolean))],stores=storeIds.length?await db(env,`stores?id=in.(${storeIds.join(',')})&select=id,shop_code`):[],staffs=storeIds.length?await db(env,`staff?store_id=in.(${storeIds.join(',')})&select=id,user_id`):[],admins=await db(env,'administrators?select=id,email'),storeMap=Object.fromEntries(stores.map(x=>[x.id,x.shop_code])),staffMap=Object.fromEntries(staffs.map(x=>[x.id,x.user_id])),adminMap=Object.fromEntries(admins.map(x=>[x.id,x.email]));return json(convs.map(c=>({...c,shop_code:storeMap[c.store_id]||null,user_login_id:staffMap[c.user_id]||adminMap[c.user_id]||null})))}
 if(path.match(/^platform\/zudo\/conversation\/[^/]+$/)&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);let id=path.split('/')[3],[c]=await db(env,`zudo_conversations?id=eq.${id}&select=id,title`);if(!c)return fail('Conversation not found.',404);let msgs=await db(env,`zudo_messages?conversation_id=eq.${id}&select=role,content,created_at&order=created_at.asc`);return json({title:c.title,messages:msgs})}
 if(path==='platform/factory-reset'&&method==='POST'){ if(s.role!=='owner')return fail('Forbidden',403);let b=await body(request);if(b.confirmation!=='FACTORY RESET EMS')return fail('Enter the exact confirmation text: FACTORY RESET EMS',400);await db(env,'rpc/factory_reset_ems',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return json({ok:true})}
 if(path==='platform/pages'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET')return json(await db(env,'public_pages?select=*&order=slug'));if(method==='POST'){let b=await body(request),slug=String(b.slug||'').trim();if(!slug)return fail('Slug is required.',400);let titles={about:'About',terms:'Terms & Conditions',contact:'Contact Us'},body2={about:'About this platform and what it does.',terms:'Terms and conditions of use.',contact:'How to reach support.'}[slug]||'';let [x]=await db(env,'public_pages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug,title:b.title||titles[slug]||slug,body:b.body||body2,hero_image_prompt:b.hero_image_prompt||null,updated_by:s.id})});return json(x,201)}if(method==='PATCH'){let b=await body(request);let [x]=await db(env,`public_pages?slug=eq.${b.slug}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:b.title,body:b.body,hero_image_prompt:b.hero_image_prompt||null,updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}}
 if(path==='platform/blogs'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET')return json(await db(env,'blog_posts?select=*&order=created_at.desc'));if(method==='POST'){let b=await body(request),slug=String(b.slug||b.title||'post').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);let [x]=await db(env,'blog_posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:b.title,slug,excerpt:b.excerpt||null,body:b.body,cover_image_url:b.cover_image_url||null,published:!!b.published,published_at:b.published?new Date().toISOString():null,created_by:s.id})});return json(x,201)}}
 if(path.match(/^platform\/blog\/[^/]+$/)&&method==='PATCH'){if(s.role!=='owner')return fail('Forbidden',403);let id=path.split('/')[2],b=await body(request);let [x]=await db(env,`blog_posts?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean({...b,published_at:b.published?new Date().toISOString():null,updated_at:new Date().toISOString()}))});return json(x)}
 if(path==='platform/contact-messages'&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);return json(await db(env,'contact_messages?select=*&order=created_at.desc&limit=300'))}
 if(path==='platform/settings'){ if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET'){let [x]=await db(env,'platform_settings?setting_key=eq.branding&select=*');return json(x?.setting_value||{})}if(method==='PATCH'){let b=await body(request);let [x]=await db(env,'platform_settings?setting_key=eq.branding',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({setting_value:b,updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}}
 if(path.startsWith('platform/license/')){if(s.role!=='owner')return fail('Forbidden',403);let id=path.split('/')[2];if(method==='PATCH'){let b=await body(request),[l]=await db(env,`licenses?id=eq.${id}&select=*`);if(!l)return fail('License not found',404);if(!['active','rejected'].includes(b.status))return fail('Use active or rejected status.',400);let starts=null,expires=null,transactionType='new';if(b.status==='active'){let current=await currentEntitlement(env,l.admin_id),now=new Date();if(current?.current_license_id){let [old]=await db(env,`licenses?id=eq.${current.current_license_id}&select=plan_id,max_stores,connectx_enabled`);if(old?.plan_id===l.plan_id){transactionType='renewal';starts=current.expires_at&&new Date(current.expires_at)>now?new Date(current.expires_at):now}else if(l.max_stores>current.shop_limit||(!current.connectx_enabled&&l.connectx_enabled)){transactionType='upgrade';starts=now}else{transactionType='downgrade';starts=now}}else starts=now;expires=new Date(starts);expires.setMonth(expires.getMonth()+l.duration_months)}let [x]=await db(env,`licenses?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:b.status,transaction_type:transactionType,starts_at:starts?.toISOString(),expires_at:expires?.toISOString(),reviewed_at:new Date().toISOString(),reviewed_by:null,review_note:b.reviewNote||null})});if(b.status==='active')await db(env,'rpc/apply_current_entitlement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_license_id:id})});await db(env,'platform_activity_logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner_id:s.id,action:b.status+' '+transactionType+' license',entity_type:'license',entity_id:id})});return json(x)}}

 /* ══════════════════════════════════════════════════════════════════════
    EMS OFFICIAL APP STORE (Platform Owner Publisher & Storefront Engine)
    ══════════════════════════════════════════════════════════════════════ */
 const ownerStoreResponse=await ownerAppStoreRoutes({env,request,path,method,session:s,audit});
 if(ownerStoreResponse)return ownerStoreResponse;

 if(path==='admin/entitlement'){if(s.role!=='admin')return fail('Forbidden',403);let [entitlement,anyLic]=await Promise.all([enforceEntitlement(env,s.id),db(env,`licenses?admin_id=eq.${s.id}&select=id&limit=1`)]);return json({active:!!entitlement,hasActivatedLicense:anyLic.length>0,expiresAt:entitlement?.expires_at||null,shopLimit:entitlement?.shop_limit||0,truebill_enabled:!!entitlement?.truebill_enabled,vaultium_gb:Number(entitlement?.vaultium_gb||0),zudo_enabled:!!entitlement?.zudo_enabled,business_health_enabled:!!entitlement?.business_health_enabled,connectx_enabled:!!entitlement?.connectx_enabled})}
 if(path==='admin/profile'){if(s.role!=='admin')return fail('Forbidden',403);if(method==='GET'){let [x]=await db(env,`administrators?id=eq.${s.id}&select=id,admin_code,name,address,phone,email,active,created_at`);return json(x)}if(method==='PATCH'){let b=await body(request);if(b.password){if(b.password.length<10)return fail('Password must contain at least 10 characters.');b.password_hash=await hash(b.password);delete b.password}let [x]=await db(env,`administrators?id=eq.${s.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean(b))});return json({id:x.id,admin_code:x.admin_code,name:x.name,address:x.address,phone:x.phone,email:x.email,active:x.active,created_at:x.created_at})}}
 if(path==='admin/connectx/overview'&&method==='GET'){
  if(s.role!=='admin')return fail('Forbidden',403);
  let today=new Date().toISOString().slice(0,10);
  let [stores,entitlement,devices,smsSettingsRows,emailUsage,smsUsage]=await Promise.all([
    db(env,`stores?admin_id=eq.${s.id}&select=id,name,address,phone,shop_code,status,category&order=created_at.desc`),
    currentEntitlement(env,s.id),
    db(env,`connectx_devices?administrator_id=eq.${s.id}&select=*&order=last_seen.desc`).catch(()=>[]),
    db(env,'connectx_shop_sms_settings?select=*').catch(()=>[]),
    db(env,`connectx_messages?created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id,store_id`).catch(()=>[]),
    db(env,`connectx_sms_messages?created_at=gte.${today}T00:00:00Z&select=id,store_id,status`).catch(()=>[])
  ]);
  let smsMap=Object.fromEntries(smsSettingsRows.map(x=>[x.store_id,x]));
  let devByStore={};
  for(let d of devices){
    (devByStore[d.store_id]||=[]).push({
      ...d,
      online:(d.last_seen&&(Date.now()-new Date(d.last_seen).getTime())<3*60*1000)&&d.status!=='revoked'
    });
  }
  let emailCountByStore={},smsCountByStore={};
  for(let e of emailUsage)emailCountByStore[e.store_id]=(emailCountByStore[e.store_id]||0)+1;
  for(let sm of smsUsage){
    let c=(smsCountByStore[sm.store_id]||={sent:0,failed:0,pending:0});
    if(sm.status==='sent')c.sent++;
    else if(sm.status==='failed')c.failed++;
    else if(sm.status==='queued'||sm.status==='sending')c.pending++;
  }
  let storeNames=Object.fromEntries(stores.map(x=>[x.id,x.name]));
  return json({
    entitlement,
    devices:devices.map(d=>({
      ...d,
      shop_name:storeNames[d.store_id]||'General Shop',
      online:(d.last_seen&&(Date.now()-new Date(d.last_seen).getTime())<3*60*1000)&&d.status!=='revoked'
    })),
    shops:stores.map(st=>({
      id:st.id,
      name:st.name,
      shop_code:st.shop_code,
      status:st.status,
      category:st.category,
      address:st.address,
      phone:st.phone,
      email:{
        enabled:!!entitlement?.connectx_enabled,
        dailyLimit:entitlement?.connectx_daily_limit||0,
        usedToday:emailCountByStore[st.id]||0
      },
      sms:{
        settings:smsMap[st.id]||{
          store_id:st.id,enabled:true,gateway_mode:'connectx',
          auto_sale:true,auto_payment:true,auto_due_reminder:false,
          auto_return:true,auto_exchange:true,auto_refund:true
        },
        today:smsCountByStore[st.id]||{sent:0,failed:0,pending:0},
        connected:(devByStore[st.id]||[]).some(d=>(d.status==='active'||d.status==='pending_test')&&d.status!=='revoked'),
        devices:devByStore[st.id]||[]
      }
    }))
  });
 }
 if(path.startsWith('admin/connectx/shop/')&&method==='PATCH'){
  if(s.role!=='admin')return fail('Forbidden',403);
  let storeId=path.split('/')[3];
  let [st]=await db(env,`stores?id=eq.${storeId}&admin_id=eq.${s.id}&select=id`);
  if(!st)return fail('Shop not found for this administrator.',404);
  let b=await body(request);
  if(b.smsSettings){
    let patch={store_id:storeId,updated_at:new Date().toISOString()};
    for(let k of ['enabled','auto_sale','auto_payment','auto_due_reminder','auto_return','auto_exchange','auto_refund']){
      if(b.smsSettings[k]!==undefined)patch[k]=!!b.smsSettings[k];
    }
    if(b.smsSettings.gateway_mode)patch.gateway_mode=String(b.smsSettings.gateway_mode);
    await db(env,'connectx_shop_sms_settings?on_conflict=store_id',{
      method:'POST',
      headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(patch)
    });
  }
  await audit(env,s,'update ConnectX shop settings','connectx',storeId,{changes:Object.keys(b)});
  return json({ok:true});
 }
 if(path==='admin/connectx-usage'){if(s.role!=='admin')return fail('Forbidden',403);let stores=await db(env,`stores?admin_id=eq.${s.id}&select=id,name,shop_code`),today=new Date().toISOString().slice(0,10),out=[];for(let store of stores){let plan=await connectxPlan(env,store.id),used=await db(env,`connectx_messages?store_id=eq.${store.id}&created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id`);out.push({...store,enabled:!!plan,dailyLimit:plan?.connectx_daily_limit||0,usedToday:used.length,expiresAt:plan?.expires_at||null})}return json(out)}
 if(path==='admin/zudo-usage'&&method==='GET'){if(s.role!=='admin')return fail('Forbidden',403);let stores=await db(env,`stores?admin_id=eq.${s.id}&select=id,name,shop_code,status`),today=new Date().toISOString().slice(0,10),out=await Promise.all(stores.map(async store=>{let used=await db(env,`zudo_messages?store_id=eq.${store.id}&role=eq.user&created_at=gte.${today}T00:00:00Z&select=id`),plan=await zudoPlan(env,store.id),enabled=!!plan&&store.status==='active',dailyLimit=enabled?Number(plan.zudo_daily_limit||0):0;return {...store,enabled,dailyLimit,usedToday:used.length,remaining:Math.max(0,dailyLimit-used.length),expiresAt:enabled?plan.expires_at:null}}));return json(out)}
 if(path==='admin/devices'){if(s.role!=='admin')return fail('Forbidden',403);return json(await db(env,`device_logins?select=*,stores!inner(name),staff(full_name,user_id)&stores.admin_id=eq.${s.id}&order=last_seen_at.desc`));}
 if(path==='admin/stores') {if(s.role!=='admin')return fail('Forbidden',403);if(method==='GET'){await enforceEntitlement(env,s.id);return json(await db(env,`stores?admin_id=eq.${s.id}&select=*&order=created_at.desc`));}let b=await body(request);if(method==='POST'){let [entitlement,existing]=await Promise.all([currentEntitlement(env,s.id),db(env,`stores?admin_id=eq.${s.id}&select=id`)]);let permitted=Number(entitlement?.shop_limit||0);if(!permitted)return fail('Purchase and activate a license plan before creating your first shop.',403);if(existing.length>=permitted)return fail('Your current license capacity has been reached. Upgrade or renew your license to create another shop.',403);let shopCode;for(let i=0;i<12;i++){shopCode=String(crypto.getRandomValues(new Uint32Array(1))[0]%9000+1000);let used=await db(env,`stores?shop_code=eq.${shopCode}&select=id`);if(!used.length)break;shopCode=null}if(!shopCode)throw Error('Could not reserve a Shop ID. Please retry.');let cat=String(b.category||'General Store').trim()||'General Store';let [r]=await db(env,'stores',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...clean(b),category:cat,admin_id:s.id,status:'active',shop_code:shopCode})});await audit(env,s,'create','store',r.id,{storeId:r.id,name:r.name,category:cat});return json(r,201)}}
 if(path==='admin/store-capacity'&&method==='POST'){if(s.role!=='admin')return fail('Forbidden',403);let b=await body(request),entitlement=await enforceEntitlement(env,s.id),stores=await db(env,`stores?admin_id=eq.${s.id}&select=id,status&order=created_at.asc`),choices=b.choices||[];if(!Array.isArray(choices)||choices.length!==stores.length)return fail('Invalid shop capacity selection.',400);let ids=new Set(stores.map(x=>x.id)),active=choices.filter(x=>x.status==='active');if(!entitlement||active.length>entitlement.shop_limit)return fail(`Your current license allows ${entitlement?.shop_limit||0} active shop(s).`,403);if(choices.some(x=>!ids.has(x.id)||!['active','read_only','inactive','delete'].includes(x.status)))return fail('Invalid shop selection.',400);for(let choice of choices){if(choice.status==='delete')await db(env,`stores?id=eq.${choice.id}&admin_id=eq.${s.id}`,{method:'DELETE'});else await db(env,`stores?id=eq.${choice.id}&admin_id=eq.${s.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:choice.status})})}await audit(env,s,'manage shop capacity','stores',null,{choices});return json({ok:true})}
 if(path.match(/^admin\/store\/[^/]+\/goto$/)&&method==='POST'){ if(s.role!=='admin')return fail('Forbidden',403);let id=path.split('/')[2],[store]=await db(env,`stores?id=eq.${id}&admin_id=eq.${s.id}&select=id,name,status,category`);if(!store)return fail('Store not found',404);if(!await enforceEntitlement(env,s.id))store.status='read_only';if(store.status==='inactive')return fail('This shop is inactive.',403);let permissions=Object.fromEntries(PERMISSION_SECTIONS.map(x=>[x,PERMISSION_ACTIONS]));await audit(env,s,'administrator shop access','store',id,{storeId:id,name:store.name});return json({token:await token({id:s.id,role:'staff',storeId:id,permissions,adminAccess:true,readOnly:store.status==='read_only',exp:Math.floor(Date.now()/1000)+3600},env.SESSION_SECRET),user:{id:s.id,name:'Administrator'},store:{id,name:store.name,category:store.category||'General Store'},role:'staff',adminAccess:true,readOnly:store.status==='read_only'});}
 if(path.startsWith('admin/store/')){if(s.role!=='admin')return fail('Forbidden',403);let id=path.split('/')[2], [store]=await db(env,`stores?id=eq.${id}&admin_id=eq.${s.id}&select=*`);if(!store)return fail('Store not found',404);if(method==='PATCH'){let b=await body(request);if(b.status==='active'){let entitlement=await enforceEntitlement(env,s.id),shops=await db(env,`stores?admin_id=eq.${s.id}&select=id&order=created_at.asc`),position=shops.findIndex(x=>x.id===id)+1;if(!entitlement||position>entitlement.shop_limit)return fail('This shop exceeds your current license capacity and must remain Read-Only. Upgrade your license to activate it.',403)}let [r]=await db(env,`stores?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean(b))});await audit(env,s,'update','store',id,{storeId:id,changed:Object.keys(clean(b))});return json(r)}if(method==='DELETE'){await db(env,`stores?id=eq.${id}`,{method:'DELETE'});await audit(env,s,'delete','store',id,{storeId:id,name:store.name});return json({ok:true})}}
 if(path==='license-plans'&&method==='GET'){return json(await db(env,'license_plans?active=is.true&select=*&order=price.asc'));}
 if(path==='admin/licenses'&&s.role==='admin'){if(method==='GET')return json(await db(env,`licenses?admin_id=eq.${s.id}&select=*,license_plans(title,max_stores)&order=created_at.desc`));if(method==='POST'){let b=await body(request),[plan]=await db(env,`license_plans?id=eq.${b.planId}&active=is.true&select=*`);if(!plan)return fail('Selected license plan is unavailable.',404);if(Number(plan.price)===0){let prior=await db(env,`licenses?admin_id=eq.${s.id}&plan_id=eq.${plan.id}&status=eq.active&select=id`);if(prior.length)return fail('This free license plan has already been activated for your administrator account.',409)}let data={admin_id:s.id,plan_id:plan.id,duration_months:plan.duration_months,amount:plan.price,max_stores:plan.max_stores,connectx_enabled:plan.connectx_enabled,connectx_daily_limit:plan.connectx_daily_limit,zudo_enabled:plan.zudo_enabled,zudo_daily_limit:plan.zudo_daily_limit,business_health_enabled:plan.business_health_enabled,business_health_daily_limit:plan.business_health_daily_limit,truebill_enabled:plan.truebill_enabled,vaultium_gb:Number(plan.vaultium_gb||0),status:plan.price===0?'active':'pending'};if(plan.price>0){if(!['bkash','nagad'].includes(b.paymentMethod)||!b.paymentNumber||!b.transactionId)return fail('Payment method, payment number, and transaction ID are required.');let prior=await db(env,`licenses?payment_method=eq.${b.paymentMethod}&transaction_id=eq.${encodeURIComponent(b.transactionId)}&select=id`);if(prior.length)return fail('This payment transaction ID has already been submitted. Use the correct unique bKash/Nagad transaction ID.',409);Object.assign(data,{payment_method:b.paymentMethod,payment_number:b.paymentNumber,transaction_id:b.transactionId})}else {let starts=new Date(),expires=new Date(starts);expires.setMonth(expires.getMonth()+plan.duration_months);Object.assign(data,{payment_method:'other',payment_number:'free',transaction_id:'free-'+crypto.randomUUID(),starts_at:starts.toISOString(),expires_at:expires.toISOString(),reviewed_at:starts.toISOString(),review_note:'Automatically approved free license plan'})}let [r]=await db(env,'licenses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});if(plan.price===0)await db(env,'rpc/apply_current_entitlement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_license_id:r.id})});return json(r,201)}}
 if(path==='invoice-number'&&method==='GET'){let kind=new URL(request.url).searchParams.get('kind');if(!['sale','purchase'].includes(kind))return fail('Invalid invoice type.');let number=await db(env,'rpc/peek_ems_invoice_number',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_kind:kind})});return json({invoiceNumber:number})}
 if(path==='invoice-items'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let kind=new URL(request.url).searchParams.get('kind'),section=kind==='purchase'?'purchase':'sales';if(!['sale','purchase'].includes(kind)||!allowed(s,section,'view'))return fail('Permission denied.',403);return json(await db(env,`inventory_items?store_id=eq.${s.storeId}&select=id,item_code,description,unit,sale_price,total_stock,active,category&order=description.asc`))}
 if(path==='invoice-parties'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let kind=new URL(request.url).searchParams.get('kind'),section=kind==='purchase'?'purchase':'sales';if(!['sale','purchase'].includes(kind)||!allowed(s,section,'view'))return fail('Permission denied.',403);let table=kind==='purchase'?'suppliers':'customers',code=kind==='purchase'?'supplier_code':'customer_code';return json(await db(env,`${table}?store_id=eq.${s.storeId}&select=id,name,address,phone,${code}&order=name.asc`))}
 if(path.match(/^invoices\/[^/]+$/)&&method==='DELETE'){if(!s.storeId)return fail('Shop access required.',403);let id=path.split('/')[1],[inv]=await db(env,`invoices?id=eq.${id}&store_id=eq.${s.storeId}&select=kind,invoice_number`);if(!inv)return fail('Invoice not found.',404);if(!allowed(s,inv.kind==='purchase'?'purchase':'sales','delete'))return fail('Permission denied.',403);try{await db(env,'rpc/delete_posted_invoice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_store_id:s.storeId,p_invoice_id:id})});}catch(pe){return fail(pe.message||'Invoice could not be deleted.',400);}await audit(env,s,'delete',inv.kind+' invoice',id,{invoice_number:inv.invoice_number,kind:inv.kind});return json({ok:true})}
 if(path==='invoices'){if(!s.storeId)return fail('Shop access required.',403);if(method==='GET'){let q=new URL(request.url).searchParams.get('kind'),section=q==='purchase'?'purchase':'sales';if(!['sale','purchase'].includes(q)||!allowed(s,section,'view'))return fail('Permission denied.',403);return json(await db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.${q}&select=*,invoice_lines(*,inventory_items(item_code,description,unit))&order=created_at.desc`))}if(method==='POST'){let b=await body(request), section=b.kind==='purchase'?'purchase':'sales';if(!allowed(s,section,'add'))return fail('Permission denied.',403);let payload={p_store_id:s.storeId,p_kind:b.kind,p_party_id:b.partyId||null,p_invoice_date:b.invoiceDate,p_payment_method:b.paymentMethod||'cash',p_transaction_id:b.transactionId||null,p_notes:b.notes||null,p_tax_percent:Number(b.taxPercent||0),p_discount:Number(b.discount||0),p_paid_amount:Number(b.paidAmount||0),p_created_by:s.id,p_lines:b.lines};let x=null,rj=null,lastErr=null;for(let attempt=0;attempt<4;attempt++){let actualInvoiceNumber=await db(env,'rpc/next_ems_invoice_number',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_kind:b.kind})});try{rj=await db(env,'rpc/post_invoice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,p_invoice_number:actualInvoiceNumber})})}catch(pe){lastErr=pe.message||'Invoice could not be posted';if(/duplicate|already exists|UNIQUE/i.test(lastErr))continue;throw Error(lastErr)}x=rj;break}if(!x)throw Error(lastErr||'Invoice could not be posted');if(b.kind==='sale'&&!b.partyId){let [updated]=await db(env,`invoices?id=eq.${x.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({custom_party_name:b.customPartyName||null,custom_party_address:b.customPartyAddress||null,custom_party_phone:b.customPartyPhone||null})});x=updated}await audit(env,s,'post',b.kind+' invoice',x.id,{invoice_number:x.invoice_number||actualInvoiceNumber,kind:b.kind,party_id:b.partyId||null,total:x.subtotal,paid:x.paid_amount,due:x.total_due,payment_method:b.paymentMethod||'cash'});if(b.kind==='sale'){try{await enqueueAutoSms(env,s,'SALE',x,{phone:b.customPartyPhone,name:b.customPartyName,partyId:b.partyId,invoiceNumber:x.invoice_number,invoiceId:x.id,idempotencyKey:'SALE:'+x.id})}catch(e){console.error('ConnectX SMS queue',e)}}return json(x,201)}}
 if(path==='inventory/damaged-defective'&&method==='GET'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'inventory','view')&&!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
  let [returnsList, exchangesList]=await Promise.all([
   db(env,`returns?store_id=eq.${s.storeId}&select=id,return_number,return_date,customer_name,invoice_id,invoices(invoice_number),return_items(*,inventory_items(item_code,description,unit,category))&order=created_at.desc`).catch(()=>[]),
   db(env,`exchanges?store_id=eq.${s.storeId}&select=id,exchange_number,exchange_date,customer_name,invoice_id,invoices(invoice_number),exchange_items(*,inventory_items(item_code,description,unit,category))&order=created_at.desc`).catch(()=>[])
  ]);
  let list=[];
  for(let r of (returnsList||[])){
   for(let it of (r.return_items||[])){
    if(it.condition==='Damaged'||it.condition==='Defective'){
     list.push({
      id:it.id,
      return_id:r.id,
      exchange_id:null,
      source_type:'return',
      return_number:r.return_number,
      return_date:r.return_date,
      customer_name:r.customer_name||'Walk-in Customer',
      invoice_number:r.invoices?.invoice_number||'—',
      item_id:it.item_id,
      item_code:it.inventory_items?.item_code||'—',
      description:it.inventory_items?.description||'Item',
      unit:it.inventory_items?.unit||'pcs',
      original_category:it.inventory_items?.category||'Uncategorized',
      category:'Damage/Defective',
      quantity:Number(it.quantity),
      unit_price:Number(it.unit_price),
      return_amount:Number(it.return_amount||0),
      condition:it.condition,
      reason:it.reason,
      reason_note:it.reason_note||null,
      created_at:it.created_at
     });
    }
   }
  }
  for(let exc of (exchangesList||[])){
   for(let it of (exc.exchange_items||[])){
    if(it.item_type==='returned'&&(it.condition==='Damaged'||it.condition==='Defective')){
     list.push({
      id:it.id,
      return_id:null,
      exchange_id:exc.id,
      source_type:'exchange',
      return_number:exc.exchange_number,
      return_date:exc.exchange_date,
      customer_name:exc.customer_name||'Walk-in Customer',
      invoice_number:exc.invoices?.invoice_number||'—',
      item_id:it.item_id,
      item_code:it.inventory_items?.item_code||'—',
      description:it.inventory_items?.description||'Item',
      unit:it.inventory_items?.unit||'pcs',
      original_category:it.inventory_items?.category||'Uncategorized',
      category:'Damage/Defective',
      quantity:Number(it.quantity),
      unit_price:Number(it.unit_price),
      return_amount:Number(it.total_amount||0),
      condition:it.condition,
      reason:it.reason||'—',
      reason_note:it.reason_note||null,
      created_at:it.created_at
     });
    }
   }
  }
  list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return json(list);
 }
 if(path==='returns/invoice-lookup'&&method==='GET'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
  let invNum=String(new URL(request.url).searchParams.get('invoice_number')||'').trim();
  if(!invNum)return fail('Invoice number is required.',400);
  let invoices=await db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&select=*,invoice_lines(*,inventory_items(id,item_code,description,unit,sale_price,total_stock))`);
  let inv=invoices.find(x=>x.invoice_number.toLowerCase()===invNum.toLowerCase());
  if(!inv)return fail('Sales invoice "'+invNum+'" not found in this shop.',404);
  let party=inv.party_id?(await db(env,`customers?id=eq.${inv.party_id}&select=*`))[0]:null;
  let [existingReturns, existingExchanges]=await Promise.all([
   db(env,`returns?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,return_items(*)`).catch(()=>[]),
   db(env,`exchanges?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,exchange_items(*)`).catch(()=>[])
  ]);
  let returnedMap={};
  for(let ret of (existingReturns||[])){
   for(let it of (ret.return_items||[])){
    let k=it.invoice_line_id||it.item_id;
    returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
   }
  }
  for(let exc of (existingExchanges||[])){
   for(let it of (exc.exchange_items||[])){
    if(it.item_type==='returned'){
     let k=it.invoice_line_id||it.item_id;
     returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
    }
   }
  }
  let lines=(inv.invoice_lines||[]).map(l=>{
   let already=returnedMap[l.id]||returnedMap[l.item_id]||0;
   let returnable=Math.max(0,Math.round((Number(l.quantity)-already)*1000)/1000);
   return {
    ...l,
    already_returned_quantity:already,
    returnable_quantity:returnable,
    is_fully_returned:returnable<=0
   };
  });
  return json({invoice:inv,customer:party,lines,existingReturns,existingExchanges});
 }
 if(path==='returns'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(method==='GET'){
   if(!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
   let q=new URL(request.url).searchParams.get('invoice_id');
   let filter=q?`&invoice_id=eq.${q}`:'';
   let rows=await db(env,`returns?store_id=eq.${s.storeId}${filter}&select=*,invoices(invoice_number,invoice_date,total_due,paid_amount,subtotal),customers(name,phone,customer_code),return_items(*,inventory_items(item_code,description,unit))&order=created_at.desc`);
   return json(rows);
  }
  if(method==='POST'){
   if(!allowed(s,'returns_refunds','add')&&!allowed(s,'sales','add'))return fail('Permission denied.',403);
   let b=await body(request);
   if(!b.invoice_id||!Array.isArray(b.items)||!b.items.length)return fail('Invoice ID and at least one return item are required.',400);
   let [inv]=await db(env,`invoices?id=eq.${b.invoice_id}&store_id=eq.${s.storeId}&kind=eq.sale&select=*,invoice_lines(*)`);
   if(!inv)return fail('Sales invoice not found in this shop.',404);
   let [existingReturns, existingExchanges]=await Promise.all([
    db(env,`returns?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,return_items(*)`).catch(()=>[]),
    db(env,`exchanges?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,exchange_items(*)`).catch(()=>[])
   ]);
   let returnedMap={};
   for(let ret of (existingReturns||[])){
    for(let it of (ret.return_items||[])){
     let k=it.invoice_line_id||it.item_id;
     returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
    }
   }
   for(let exc of (existingExchanges||[])){
    for(let it of (exc.exchange_items||[])){
     if(it.item_type==='returned'){
      let k=it.invoice_line_id||it.item_id;
      returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
     }
    }
   }
   let validReasons=['Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other'];
   let validConditions=['Sellable','Damaged','Defective'];
   let processedItems=[],subtotalSum=0,taxSum=0,discSum=0,penaltySum=0,grandTotal=0;
   for(let itemReq of b.items){
    let line=inv.invoice_lines.find(l=>l.id===itemReq.invoice_line_id||l.item_id===itemReq.item_id);
    if(!line)return fail('Selected item does not belong to this invoice.',400);
    let qty=Number(itemReq.quantity);
    if(isNaN(qty)||qty<=0)return fail('Return quantity must be greater than zero.',400);
    let already=returnedMap[line.id]||0;
    let returnable=Math.max(0,Math.round((Number(line.quantity)-already)*1000)/1000);
    if(qty>returnable+0.0001)return fail(`Return quantity (${qty}) exceeds remaining returnable quantity (${returnable}).`,400);
    returnedMap[line.id]=already+qty;
    let reason=String(itemReq.reason||'').trim();
    if(!validReasons.includes(reason))return fail('Valid return reason is required.',400);
    let reasonNote=itemReq.reason_note?String(itemReq.reason_note).trim():null;
    if(reason==='Other'&&!reasonNote)return fail('Note is required when return reason is Other.',400);
    let condition=String(itemReq.condition||'').trim();
    if(!validConditions.includes(condition))return fail('Valid condition is required.',400);
    let uPrice=Number(line.unit_price);
    let lSub=Math.round(qty*uPrice*100)/100;
    let taxPct=Number(line.tax_percent||inv.tax_percent||0);
    let lTax=Math.round(lSub*taxPct)/100;
    let origSoldQty=Number(line.quantity);
    let lineOrigDisc=Number(line.discount||0);
    let lDisc=origSoldQty>0?Math.round((qty/origSoldQty)*lineOrigDisc*100)/100:0;
    let penalty=Math.max(0,Math.round(Number(itemReq.penalty||0)*100)/100);
    let lineTotal=Math.max(0,Math.round((lSub+lTax-lDisc-penalty)*100)/100);
    subtotalSum+=lSub;taxSum+=lTax;discSum+=lDisc;penaltySum+=penalty;grandTotal+=lineTotal;
    processedItems.push({
     invoice_line_id:line.id,
     item_id:line.item_id,
     quantity:qty,
     unit_price:uPrice,
     tax_percent:taxPct,
     tax_amount:lTax,
     discount:lDisc,
     penalty:penalty,
     return_amount:lineTotal,
     reason,
     reason_note:reasonNote,
     condition,
     imei_serial:null
    });
   }
   let year=new Date().getFullYear();
   let prefix=`RET-${year}-`;
   let existingReturnsList=await db(env,`returns?store_id=eq.${s.storeId}&select=return_number`);
   let maxNum=0;
   for(let r of (existingReturnsList||[])){
    let rNum=String(r.return_number||'');
    if(rNum.startsWith(prefix)){
     let p=parseInt(rNum.slice(prefix.length),10);
     if(!isNaN(p)&&p>maxNum)maxNum=p;
    }
   }
   let returnNumber=`${prefix}${String(maxNum+1).padStart(5,'0')}`;
   let party=inv.party_id?(await db(env,`customers?id=eq.${inv.party_id}&select=id,name`))[0]:null;
   let custName=party?.name||inv.custom_party_name||'Walk-in Customer';
   let refundMethod=String(b.refund_method||'cash').toLowerCase().trim();
   if(!['cash','bank','bkash','nagad','other','none'].includes(refundMethod))refundMethod='cash';
   let trxId=b.transaction_id?String(b.transaction_id).trim():null;
   let finalRefundAmt=Math.round(grandTotal*100)/100;
   let retPayload = {
    store_id:s.storeId,
    invoice_id:inv.id,
    return_number:returnNumber,
    verification_token:crypto.randomUUID(),
    customer_id:party?.id||null,
    customer_name:custName,
    return_date:new Date().toISOString().slice(0,10),
    subtotal:Math.round(subtotalSum*100)/100,
    tax_amount:Math.round(taxSum*100)/100,
    discount_amount:Math.round(discSum*100)/100,
    penalty_amount:Math.round(penaltySum*100)/100,
    total_return_amount:finalRefundAmt,
    refunded_amount:finalRefundAmt,
    refund_method:refundMethod,
    transaction_id:trxId,
    status:'refunded',
    notes:b.notes?String(b.notes).trim():null,
    created_by:s.id
   };
   let ret = null;
   try {
    [ret] = await db(env,'returns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(retPayload)});
   } catch(err) {
    if (err.message && err.message.includes('verification_token')) {
      delete retPayload.verification_token;
      [ret] = await db(env,'returns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(retPayload)});
    } else {
      throw err;
    }
   }
   for(let it of processedItems){
    await db(env,'return_items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     ...it,
     return_id:ret.id
    })});
    let [itemRow]=await db(env,`inventory_items?id=eq.${it.item_id}&store_id=eq.${s.storeId}&select=*`);
    let stockBefore=Number(itemRow?.total_stock||0);
    let stockAfter=stockBefore;
    let movType='return_restock';
    if(it.condition==='Sellable'){
     stockAfter=stockBefore+it.quantity;
     await db(env,`inventory_items?id=eq.${it.item_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({
      total_stock:stockAfter,
      updated_at:new Date().toISOString()
     })});
    }else if(it.condition==='Damaged')movType='return_damaged';
    else if(it.condition==='Defective')movType='return_defective';
    await db(env,'inventory_stock_movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     store_id:s.storeId,
     item_id:it.item_id,
     return_id:ret.id,
     movement_type:movType,
     quantity:it.quantity,
     stock_before:stockBefore,
     stock_after:stockAfter,
     condition:it.condition,
     notes:it.reason+(it.reason_note?` (${it.reason_note})`:''),
     created_by:s.id
    })});
   }
   await audit(env,s,'create sales return','returns',ret.id,{return_number:returnNumber,invoice_number:inv.invoice_number,amount:ret.total_return_amount,refunded_amount:ret.refunded_amount,refund_method:ret.refund_method});
   try{await enqueueAutoSms(env,s,'RETURN',inv,{phone:inv.custom_party_phone,name:custName,partyId:inv.party_id,invoiceNumber:returnNumber,amount:finalRefundAmt,invoiceId:inv.id,sourceId:ret.id,idempotencyKey:'RETURN:'+ret.id});if(finalRefundAmt>0)await enqueueAutoSms(env,s,'REFUND',inv,{phone:inv.custom_party_phone,name:custName,partyId:inv.party_id,invoiceNumber:returnNumber,amount:finalRefundAmt,invoiceId:inv.id,sourceId:ret.id,idempotencyKey:'REFUND:'+ret.id})}catch(e){console.error('ConnectX SMS queue',e)}
   return json({ok:true,return:ret,returnNumber},201);
  }
 }
 if(path.match(/^returns\/[^/]+$/)&&method==='GET'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
  let id=path.split('/')[1];
  let [ret]=await db(env,`returns?id=eq.${id}&store_id=eq.${s.storeId}&select=*,invoices(*),customers(*),return_items(*,inventory_items(item_code,description,unit)),inventory_stock_movements(*,inventory_items(item_code,description,unit))`);
  if(!ret)return fail('Return not found.',404);
  let staffList=await db(env,`staff?store_id=eq.${s.storeId}&select=id,user_id,full_name`);
  let staffMap=Object.fromEntries(staffList.map(st=>[st.id,st]));
  ret.created_by_user=staffMap[ret.created_by]?.user_id||staffMap[ret.created_by]?.full_name||'Administrator';
  return json(ret);
 }
 if(path==='exchanges'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(method==='GET'){
   if(!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
   let q=new URL(request.url).searchParams.get('invoice_id');
   let filter=q?`&invoice_id=eq.${q}`:'';
   let rows=await db(env,`exchanges?store_id=eq.${s.storeId}${filter}&select=*,invoices(invoice_number,invoice_date,total_due,paid_amount,subtotal),customers(name,phone,customer_code),exchange_items(*,inventory_items(item_code,description,unit)),inventory_stock_movements(*)&order=created_at.desc`);
   return json(rows);
  }
  if(method==='POST'){
   if(!allowed(s,'returns_refunds','add')&&!allowed(s,'sales','add'))return fail('Permission denied.',403);
   let b=await body(request);
   if(!b.invoice_id)return fail('Original invoice ID is required.',400);
   if(!Array.isArray(b.returned_items)||!b.returned_items.length)return fail('At least one returned item is required for exchange.',400);
   if(!Array.isArray(b.new_items)||!b.new_items.length)return fail('At least one replacement/new item is required for exchange.',400);

   let [inv]=await db(env,`invoices?id=eq.${b.invoice_id}&store_id=eq.${s.storeId}&kind=eq.sale&select=*,invoice_lines(*)`);
   if(!inv)return fail('Sales invoice not found in this shop.',404);

   let [existingReturns, existingExchanges]=await Promise.all([
    db(env,`returns?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,return_items(*)`).catch(()=>[]),
    db(env,`exchanges?store_id=eq.${s.storeId}&invoice_id=eq.${inv.id}&select=*,exchange_items(*)`).catch(()=>[])
   ]);

   let returnedMap={};
   for(let ret of (existingReturns||[])){
    for(let it of (ret.return_items||[])){
     let k=it.invoice_line_id||it.item_id;
     returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
    }
   }
   for(let exc of (existingExchanges||[])){
    for(let it of (exc.exchange_items||[])){
     if(it.item_type==='returned'){
      let k=it.invoice_line_id||it.item_id;
      returnedMap[k]=(returnedMap[k]||0)+Number(it.quantity);
     }
    }
   }

   let validReasons=['Customer Changed Mind','Defective','Wrong Product','Damaged','Wrong Specification','Other'];
   let validConditions=['Sellable','Damaged','Defective'];
   let processedReturnedItems=[], returnedTotalSum=0;

   for(let itemReq of b.returned_items){
    let line=inv.invoice_lines.find(l=>l.id===itemReq.invoice_line_id||l.item_id===itemReq.item_id);
    if(!line)return fail('Selected returned product does not belong to this invoice.',400);
    let qty=Number(itemReq.quantity);
    if(isNaN(qty)||qty<=0)return fail('Exchange quantity must be greater than zero.',400);
    let already=returnedMap[line.id]||0;
    let returnable=Math.max(0,Math.round((Number(line.quantity)-already)*1000)/1000);
    if(qty>returnable+0.0001)return fail(`Exchange quantity (${qty}) exceeds remaining returnable quantity (${returnable}).`,400);
    returnedMap[line.id]=already+qty;

    let reason=String(itemReq.reason||'').trim();
    if(!validReasons.includes(reason))return fail('Valid return reason is required.',400);
    let reasonNote=itemReq.reason_note?String(itemReq.reason_note).trim():null;
    if(reason==='Other'&&!reasonNote)return fail('Note is required when return reason is Other.',400);
    let condition=String(itemReq.condition||'').trim();
    if(!validConditions.includes(condition))return fail('Valid condition is required.',400);

    let uPrice=Number(line.unit_price);
    let lSub=Math.round(qty*uPrice*100)/100;
    let taxPct=Number(line.tax_percent||inv.tax_percent||0);
    let lTax=Math.round(lSub*taxPct)/100;
    let origSoldQty=Number(line.quantity);
    let lineOrigDisc=Number(line.discount||0);
    let lDisc=origSoldQty>0?Math.round((qty/origSoldQty)*lineOrigDisc*100)/100:0;
    let lineTotal=Math.max(0,Math.round((lSub+lTax-lDisc)*100)/100);
    returnedTotalSum+=lineTotal;

    processedReturnedItems.push({
     invoice_line_id:line.id,
     item_id:line.item_id,
     quantity:qty,
     unit_price:uPrice,
     tax_percent:taxPct,
     tax_amount:lTax,
     discount:lDisc,
     total_amount:lineTotal,
     reason,
     reason_note:reasonNote,
     condition
    });
   }

   let processedNewItems=[], newSubtotal=0, newTax=0, newDisc=0, newTotalSum=0;
   for(let itemReq of b.new_items){
    let [invItem]=await db(env,`inventory_items?id=eq.${itemReq.item_id}&store_id=eq.${s.storeId}&select=*`);
    if(!invItem)return fail('Replacement product not found in inventory.',404);
    if(invItem.active===false)return fail(`Product "${invItem.description}" is inactive.`,400);
    let qty=Number(itemReq.quantity);
    if(isNaN(qty)||qty<=0)return fail('Replacement quantity must be greater than zero.',400);
    let curStock=Number(invItem.total_stock||0);
    if(curStock<qty)return fail(`Insufficient stock for "${invItem.description}". Available: ${curStock}, Requested: ${qty}.`,400);

    let price=itemReq.unit_price!=null&&!isNaN(Number(itemReq.unit_price))?Number(itemReq.unit_price):Number(invItem.sale_price||0);
    if(price<0)return fail('Product price cannot be negative.',400);
    let taxPct=Math.max(0,Number(itemReq.tax_percent||0));
    let disc=Math.max(0,Number(itemReq.discount||0));
    let lSub=Math.round(qty*price*100)/100;
    let lTax=Math.round(lSub*taxPct)/100;
    if(disc>lSub+lTax)return fail('Discount cannot exceed line subtotal and tax.',400);
    let lineTotal=Math.max(0,Math.round((lSub+lTax-disc)*100)/100);

    newSubtotal+=lSub;
    newTax+=lTax;
    newDisc+=disc;
    newTotalSum+=lineTotal;

    processedNewItems.push({
     item_id:invItem.id,
     quantity:qty,
     unit_price:price,
     tax_percent:taxPct,
     tax_amount:lTax,
     discount:disc,
     total_amount:lineTotal,
     invItem
    });
   }

   returnedTotalSum=Math.round(returnedTotalSum*100)/100;
   newTotalSum=Math.round(newTotalSum*100)/100;
   let diff=Math.round((newTotalSum-returnedTotalSum)*100)/100;
   let actionType='even';
   let payMethod=String(b.payment_method||'cash').toLowerCase();

   if(diff>0){
    actionType='payment';
    if(!['cash','bank','bkash','nagad','other'].includes(payMethod))return fail('Valid payment method is required for additional payment.',400);
   }else if(diff<0){
    actionType='refund';
    if(!['cash','bank','bkash','nagad','other'].includes(payMethod))return fail('Valid refund method is required for customer refund.',400);
   }else{
    actionType='even';
    payMethod='none';
   }
   let trxId=b.transaction_id?String(b.transaction_id).trim():null;

   let year=new Date().getFullYear();
   let prefix=`EXC-${year}-`;
   let existingExchangesList=await db(env,`exchanges?store_id=eq.${s.storeId}&select=exchange_number`);
   let maxNum=0;
   for(let r of (existingExchangesList||[])){
    let exNum=String(r.exchange_number||'');
    if(exNum.startsWith(prefix)){
     let p=parseInt(exNum.slice(prefix.length),10);
     if(!isNaN(p)&&p>maxNum)maxNum=p;
    }
   }
   let exchangeNumber=`${prefix}${String(maxNum+1).padStart(5,'0')}`;
   let party=inv.party_id?(await db(env,`customers?id=eq.${inv.party_id}&select=*`))[0]:null;
   let custName=party?.name||inv.custom_party_name||'Walk-in Customer';

   let excPayload = {
    store_id:s.storeId,
    invoice_id:inv.id,
    exchange_number:exchangeNumber,
    verification_token:crypto.randomUUID(),
    customer_id:inv.party_id||null,
    customer_name:custName,
    exchange_date:new Date().toISOString().slice(0,10),
    returned_total:returnedTotalSum,
    new_items_subtotal:newSubtotal,
    new_items_tax:newTax,
    new_items_discount:newDisc,
    new_items_total:newTotalSum,
    difference_amount:diff,
    action_type:actionType,
    payment_method:payMethod,
    transaction_id:trxId,
    status:'completed',
    notes:b.notes?String(b.notes).trim():null,
    created_by:s.id
   };
   let excRecord = null;
   try {
    [excRecord] = await db(env,'exchanges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(excPayload)});
   } catch(err) {
    if (err.message && err.message.includes('verification_token')) {
      delete excPayload.verification_token;
      [excRecord] = await db(env,'exchanges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(excPayload)});
    } else {
      throw err;
    }
   }

   // Insert returned items
   for(let rit of processedReturnedItems){
    await db(env,'exchange_items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     exchange_id:excRecord.id,
     item_type:'returned',
     invoice_line_id:rit.invoice_line_id,
     item_id:rit.item_id,
     quantity:rit.quantity,
     unit_price:rit.unit_price,
     tax_percent:rit.tax_percent,
     tax_amount:rit.tax_amount,
     discount:rit.discount,
     total_amount:rit.total_amount,
     reason:rit.reason,
     reason_note:rit.reason_note,
     condition:rit.condition
    })});

    if(rit.condition==='Sellable'){
     let [cur]=await db(env,`inventory_items?id=eq.${rit.item_id}&select=total_stock`);
     let curStock=Number(cur?.total_stock||0);
     let newStock=Math.round((curStock+rit.quantity)*1000)/1000;
     await db(env,`inventory_items?id=eq.${rit.item_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({total_stock:newStock,updated_at:new Date().toISOString()})});
     await db(env,'inventory_stock_movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      store_id:s.storeId,
      item_id:rit.item_id,
      exchange_id:excRecord.id,
      movement_type:'exchange_restock',
      quantity:rit.quantity,
      stock_before:curStock,
      stock_after:newStock,
      condition:'Sellable',
      notes:`Restocked from exchange ${exchangeNumber} (Original: ${inv.invoice_number})`,
      created_by:s.id
     })});
    }else{
     await db(env,'inventory_stock_movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      store_id:s.storeId,
      item_id:rit.item_id,
      exchange_id:excRecord.id,
      movement_type:rit.condition==='Damaged'?'exchange_damaged':'exchange_defective',
      quantity:rit.quantity,
      stock_before:null,
      stock_after:null,
      condition:rit.condition,
      notes:`Quarantined (${rit.condition}) from exchange ${exchangeNumber} - excluded from stock`,
      created_by:s.id
     })});
    }
   }

   // Insert new items and deduct stock
   for(let nit of processedNewItems){
    await db(env,'exchange_items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     exchange_id:excRecord.id,
     item_type:'new',
     invoice_line_id:null,
     item_id:nit.item_id,
     quantity:nit.quantity,
     unit_price:nit.unit_price,
     tax_percent:nit.tax_percent,
     tax_amount:nit.tax_amount,
     discount:nit.discount,
     total_amount:nit.total_amount,
     reason:null,
     reason_note:null,
     condition:'Sellable'
    })});

    let [cur]=await db(env,`inventory_items?id=eq.${nit.item_id}&select=total_stock`);
    let curStock=Number(cur?.total_stock||0);
    let newStock=Math.max(0,Math.round((curStock-nit.quantity)*1000)/1000);
    await db(env,`inventory_items?id=eq.${nit.item_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({total_stock:newStock,updated_at:new Date().toISOString()})});
    await db(env,'inventory_stock_movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     store_id:s.storeId,
     item_id:nit.item_id,
     exchange_id:excRecord.id,
     movement_type:'exchange_out',
     quantity:-nit.quantity,
     stock_before:curStock,
     stock_after:newStock,
     condition:'Sellable',
     notes:`Deducted for exchange ${exchangeNumber} (Original: ${inv.invoice_number})`,
     created_by:s.id
    })});
   }

   await audit(env,s,'create sales exchange','exchanges',excRecord.id,{exchange_number:exchangeNumber,invoice_number:inv.invoice_number,returned_total:retTotal,new_items_total:newTotal,difference:diff,action_type:actionType});
   try{await enqueueAutoSms(env,s,'EXCHANGE',inv,{phone:inv.custom_party_phone,name:custName,partyId:inv.party_id,invoiceNumber:exchangeNumber,amount:Math.abs(diff),invoiceId:inv.id,sourceId:excRecord.id,idempotencyKey:'EXCHANGE:'+excRecord.id});if(actionType==='refund'&&diff<0)await enqueueAutoSms(env,s,'REFUND',inv,{phone:inv.custom_party_phone,name:custName,partyId:inv.party_id,invoiceNumber:exchangeNumber,amount:Math.abs(diff),invoiceId:inv.id,sourceId:excRecord.id,idempotencyKey:'REFUND-EXC:'+excRecord.id})}catch(e){console.error('ConnectX SMS queue',e)}
   return json({ok:true,exchange:excRecord,exchangeNumber},201);
  }
 }
 if(path.match(/^exchanges\/[^/]+$/)&&method==='GET'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'returns_refunds','view')&&!allowed(s,'sales','view'))return fail('Permission denied.',403);
  let id=path.split('/')[1];
  let [exc]=await db(env,`exchanges?id=eq.${id}&store_id=eq.${s.storeId}&select=*,invoices(*),customers(*),exchange_items(*,inventory_items(item_code,description,unit)),inventory_stock_movements(*,inventory_items(item_code,description,unit))`);
  if(!exc)return fail('Exchange not found.',404);
  let [staff]=exc.created_by?await db(env,`staff?id=eq.${exc.created_by}&select=user_id,full_name`):[];
  exc.created_by_user=staff?(staff.user_id||staff.full_name):'Administrator';
  return json(exc);
 }
 if(path==='shop/settings'){if(!s.storeId)return fail('Shop access required.',403);if(method==='GET'){let [store]=await db(env,`stores?id=eq.${s.storeId}&select=name,shop_code,address,phone,phone2,email,website,low_stock_threshold,status,category`);return json(store)}if(method==='PATCH'){if(!allowed(s,'settings','edit')&&s.role!=='admin')return fail('Permission denied.',403);let b=await body(request),allowedKeys=['address','phone','phone2','email','website','low_stock_threshold','category'],patchData={};for(let k of allowedKeys){if(b[k]!==undefined)patchData[k]=b[k];}if(patchData.low_stock_threshold!==undefined)patchData.low_stock_threshold=Number(patchData.low_stock_threshold);let [updated]=await db(env,`stores?id=eq.${s.storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean(patchData))});await audit(env,s,'update store settings','settings',s.storeId,{fields:Object.keys(patchData)});return json(updated)}}
 if(path==='shop/audit-log'&&method==='POST'){if(!s.storeId)return fail('Shop access required.',403);let b=await body(request);await audit(env,s,b.action||'client action',b.entity_type||'system',b.entity_id||null,b.metadata||{});return json({ok:true})}
 if(path==='shop/activity-logs'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let [logs,staffs,suppliers,customers,items,expenses,invoices,returnsList,exchangesList,storesList,adminsList]=await Promise.all([db(env,`activity_logs?store_id=eq.${s.storeId}&select=*&order=created_at.desc&limit=500`),db(env,`staff?store_id=eq.${s.storeId}&select=id,user_id,full_name`),db(env,`suppliers?store_id=eq.${s.storeId}&select=id,supplier_code,name`),db(env,`customers?store_id=eq.${s.storeId}&select=id,customer_code,name`),db(env,`inventory_items?store_id=eq.${s.storeId}&select=id,item_code,description,sale_price`),db(env,`expenses?store_id=eq.${s.storeId}&select=id,expense_code,total,details`).catch(()=>[]),db(env,`invoices?store_id=eq.${s.storeId}&select=id,invoice_number,kind,subtotal,paid_amount,total_due,payment_method`),db(env,`returns?store_id=eq.${s.storeId}&select=id,return_number,total_return_amount,refunded_amount,refund_method,invoice_id`).catch(()=>[]),db(env,`exchanges?store_id=eq.${s.storeId}&select=id,exchange_number,difference_amount,invoice_id`).catch(()=>[]),db(env,`stores?id=eq.${s.storeId}&select=id,name,admin_id,shop_code,category`).catch(()=>[]),db(env,`administrators?select=id,name,email,admin_code`).catch(()=>[])]);let currentStore=storesList[0]||{},adminMap=Object.fromEntries(adminsList.map(a=>[a.id,a])),storeAdmin=adminMap[currentStore.admin_id]||null,staffMap=Object.fromEntries(staffs.map(x=>[x.id,x])),supplierMap=Object.fromEntries(suppliers.map(x=>[x.id,x])),customerMap=Object.fromEntries(customers.map(x=>[x.id,x])),itemMap=Object.fromEntries(items.map(x=>[x.id,x])),expenseMap=Object.fromEntries(expenses.map(x=>[x.id,x])),invoiceMap=Object.fromEntries(invoices.map(x=>[x.id,x])),returnMap=Object.fromEntries(returnsList.map(x=>[x.id,x])),exchangeMap=Object.fromEntries(exchangesList.map(x=>[x.id,x]));let out=logs.map(x=>{let meta=typeof x.metadata==='string'?JSON.parse(x.metadata||'{}'):(x.metadata||{});let actor={userId:'SYSTEM',name:'System',role:'System',tone:'zinc'};if(x.actor_type==='admin'){let a=adminMap[x.actor_id]||storeAdmin;actor={userId:a?.admin_code?`ADMIN-${a.admin_code}`:'ADMIN',name:a?.name||'Administrator',role:'Administrator',email:a?.email||null,tone:'sky'}}else if(x.actor_type==='staff'){let st=staffMap[x.actor_id];actor={userId:st?.user_id||meta?.user_id||'STAFF',name:st?.full_name||meta?.staff_name||'Staff Member',role:'Staff',tone:'emerald'}}else if(x.actor_type==='owner'){actor={userId:'OWNER',name:'Platform Owner',role:'EMS Owner',tone:'violet'}};let ent=String(x.entity_type||'').toLowerCase(),act=String(x.action||'').toLowerCase(),where={module:'General',slug:'dashboard',icon:'grid',tone:'zinc'};if(ent.includes('sale invoice')||ent==='sales'||(act.includes('sale')&&!act.includes('return')&&!act.includes('exchange')))where={module:'Sales',slug:'sales',icon:'receipt',tone:'emerald'};else if(ent.includes('purchase invoice')||ent==='purchases'||ent==='purchase'||act.includes('purchase'))where={module:'Purchases',slug:'purchases',icon:'cart',tone:'amber'};else if(ent==='returns'||ent==='exchanges'||act.includes('return')||act.includes('exchange'))where={module:'Return & Exchange',slug:'returns-refunds',icon:'rotate-ccw',tone:'cyan'};else if(ent==='inventory'||act.includes('stock')||ent.includes('item'))where={module:'Inventory',slug:'inventory',icon:'package',tone:'sky'};else if(ent==='customer'||act.includes('customer'))where={module:'Customers',slug:'customers',icon:'users',tone:'violet'};else if(ent==='supplier'||act.includes('supplier'))where={module:'Suppliers',slug:'suppliers',icon:'truck',tone:'amber'};else if(ent==='expense'||act.includes('expense'))where={module:'Expense',slug:'expense',icon:'wallet',tone:'rose'};else if(act.includes('due')||ent.includes('due'))where={module:'Due Recover',slug:'due-recover',icon:'coins',tone:'sky'};else if(ent==='staff'||act.includes('staff account'))where={module:'Staff Manager',slug:'staff-manager',icon:'user-check',tone:'blue'};else if(ent==='attendance'||act.includes('attendance'))where={module:'Attendance',slug:'attendance',icon:'clock',tone:'indigo'};else if(ent==='staff_salary'||act.includes('salary'))where={module:'Salary',slug:'salary',icon:'banknote',tone:'emerald'};else if(ent==='connectx'||act.includes('connectx')||act.includes('email'))where={module:'ConnectX',slug:'connectx',icon:'mail',tone:'sky'};else if(ent==='zudo'||act.includes('zudo'))where={module:'Zudo AI',slug:'zudo',icon:'sparkles',tone:'purple'};else if(ent==='vaultium'||act.includes('vaultium')||act.includes('file'))where={module:'Vaultium',slug:'vaultium',icon:'file',tone:'teal'};else if(ent==='report'||act.includes('report')||act.includes('health'))where={module:'Report',slug:'report',icon:'chart',tone:'blue'};else if(ent==='store'||ent==='settings'||act.includes('setting'))where={module:'Settings',slug:'settings',icon:'settings',tone:'zinc'};else if(ent==='session'||act.includes('login')||act.includes('access'))where={module:'Access & Auth',slug:'dashboard',icon:'shield',tone:'emerald'};let inv=invoiceMap[x.entity_id],ret=returnMap[x.entity_id],exc=exchangeMap[x.entity_id],itm=itemMap[x.entity_id],cst=customerMap[x.entity_id],sup=supplierMap[x.entity_id],exp=expenseMap[x.entity_id],stf=staffMap[x.entity_id];let code=meta.invoice_number||meta.return_number||meta.exchange_number||meta.code||inv?.invoice_number||ret?.return_number||exc?.exchange_number||itm?.item_code||cst?.customer_code||sup?.supplier_code||exp?.expense_code||stf?.user_id||(x.entity_id?shortId(x.entity_id):'—');let name=meta.name||meta.description||meta.full_name||meta.category||itm?.description||cst?.name||sup?.name||exp?.details||stf?.full_name||'';let actionLabel=x.action,actionTone='zinc',summary='';if(act==='post'&&ent.includes('sale')){actionLabel='Sale Invoice Posted';actionTone='emerald';let tot=meta.total??inv?.subtotal,paid=meta.paid??meta.paid_amount??inv?.paid_amount;summary=`Posted sales invoice ${code}${tot!==undefined?` (Total: ৳ ${tot}${paid!==undefined?`, Paid: ৳ ${paid}`:''})`:''}`;}else if(act==='post'&&ent.includes('purchase')){actionLabel='Purchase Invoice Posted';actionTone='amber';let tot=meta.total??inv?.subtotal;summary=`Posted purchase invoice ${code}${tot!==undefined?` (Total: ৳ ${tot})`:''}`;}else if(act==='delete'&&ent.includes('invoice')){actionLabel='Invoice Deleted';actionTone='rose';summary=`Deleted invoice ${code}`;}else if(act.includes('return')){actionLabel='Sales Return & Refund';actionTone='cyan';let amt=meta.amount??ret?.total_return_amount;summary=`Processed return ${code} for invoice ${meta.invoice_number||'order'}${amt?` (Refund: ৳ ${amt})`:''}`;}else if(act.includes('exchange')){actionLabel='Sales Exchange';actionTone='cyan';let diff=meta.difference??exc?.difference_amount;summary=`Processed exchange ${code} for invoice ${meta.invoice_number||'order'}${diff!==undefined?` (Difference: ৳ ${diff})`:''}`;}else if(act.includes('recover due')){actionLabel='Due Recovered';actionTone='sky';let amt=meta.amount;summary=`Recovered due on ${code}${amt?` (Amount: ৳ ${amt}${meta.paymentMethod?' via '+meta.paymentMethod:''})`:''}`;}else if(act==='create'&&ent==='inventory'){actionLabel='Item Created';actionTone='emerald';summary=`Added inventory item ${code}${name?` (${name})`:''}`;}else if(act==='update'&&ent==='inventory'){actionLabel='Item Updated';actionTone='amber';summary=`Updated inventory item ${code}${name?` (${name})`:''}`;}else if(act==='delete'&&ent==='inventory'){actionLabel='Item Deleted';actionTone='rose';summary=`Deleted inventory item ${code}${name?` (${name})`:''}`;}else if(act==='create'&&ent==='customer'){actionLabel='Customer Added';actionTone='emerald';summary=`Registered customer ${code}${name?` (${name})`:''}`;}else if(act==='update'&&ent==='customer'){actionLabel='Customer Updated';actionTone='amber';summary=`Updated customer ${code}${name?` (${name})`:''}`;}else if(act==='delete'&&ent==='customer'){actionLabel='Customer Deleted';actionTone='rose';summary=`Deleted customer ${code}${name?` (${name})`:''}`;}else if(act==='create'&&ent==='supplier'){actionLabel='Supplier Added';actionTone='emerald';summary=`Registered supplier ${code}${name?` (${name})`:''}`;}else if(act==='update'&&ent==='supplier'){actionLabel='Supplier Updated';actionTone='amber';summary=`Updated supplier ${code}${name?` (${name})`:''}`;}else if(act==='delete'&&ent==='supplier'){actionLabel='Supplier Deleted';actionTone='rose';summary=`Deleted supplier ${code}${name?` (${name})`:''}`;}else if(act==='create'&&ent==='expense'){actionLabel='Expense Recorded';actionTone='rose';let tot=meta.total??exp?.total;summary=`Recorded shop expense ${code}${tot?` (Total: ৳ ${tot})`:''}`;}else if(act==='update'&&ent==='expense'){actionLabel='Expense Updated';actionTone='amber';summary=`Updated shop expense ${code}`;}else if(act==='delete'&&ent==='expense'){actionLabel='Expense Deleted';actionTone='rose';summary=`Deleted shop expense ${code}`;}else if(act==='create'&&ent==='staff'){actionLabel='Staff Account Created';actionTone='emerald';summary=`Created staff account ${code}${name?` (${name})`:''}`;}else if(act==='update'&&ent==='staff'){actionLabel='Staff Account Updated';actionTone='amber';summary=`Updated staff account ${code}${name?` (${name})`:''}`;}else if(act==='delete'&&ent==='staff'){actionLabel='Staff Account Deleted';actionTone='rose';summary=`Removed staff account ${code}`;}else if(act.includes('attendance')){actionLabel='Attendance Logged';actionTone='indigo';summary=`Recorded attendance for ${meta.staff_count||meta.count||'staff members'}${meta.date?` on ${meta.date}`:''}`;}else if(act==='create salary invoice'){actionLabel='Salary Issued';actionTone='blue';summary=`Created salary invoice ${code}${meta.staff_name?` for ${meta.staff_name}`:''}${meta.total?` (৳ ${meta.total})`:''}`;}else if(act==='delete salary invoice'){actionLabel='Salary Voided';actionTone='rose';summary=`Voided salary invoice ${code}`;}else if(act.includes('sms')||ent==='sms'){actionLabel=act.includes('delete')||act.includes('cancel')?'ConnectX SMS Cancelled':'ConnectX SMS Queued';actionTone=act.includes('delete')?'rose':'sky';summary=act.includes('delete')?`Cancelled queued SMS to ${meta.to_phone||'recipient'}`:`Queued ConnectX SMS to ${meta.recipient_name||meta.to_phone||'recipient'} (${meta.message_type||'SMS'})`;}else if(act.includes('email')||act.includes('connectx')){actionLabel=act.includes('hide')?'ConnectX Archived':'ConnectX Email Sent';actionTone=act.includes('hide')?'zinc':'sky';summary=act.includes('hide')?`Archived ConnectX email record`:`Dispatched business email to ${meta.to||'recipient'}${meta.documentType?` (${meta.documentType})`:''}`;}else if(act.includes('zudo')){actionLabel=act.includes('hide')?'Zudo Query Cleared':'Zudo AI Request';actionTone=act.includes('hide')?'zinc':'purple';summary=act.includes('hide')?`Archived Zudo AI conversation`:`Executed Zudo AI analytical query`;}else if(act.includes('vaultium')||act.includes('file')){actionLabel=act.includes('delete')?'Vaultium File Deleted':'Vaultium File Uploaded';actionTone=act.includes('delete')?'rose':'teal';summary=act.includes('delete')?`Deleted attachment from Vaultium: ${meta.filename||'file'}`:`Uploaded ${meta.count||1} file(s) to Vaultium${meta.filenames?': '+meta.filenames.join(', '):''}`;}else if(act.includes('health')||ent.includes('health')){actionLabel='AI Health Diagnostic';actionTone='blue';summary=`Generated AI Business Health diagnosis report${meta.score?` (Score: ${meta.score}/100)`:''}`;}else if(act==='staff login'){actionLabel='Staff Sign-In';actionTone='emerald';summary=`Staff member ${actor.name} (${actor.userId}) signed in to shop terminal`;}else if(act==='administrator shop login'){actionLabel='Admin Sign-In';actionTone='sky';summary=`Administrator ${actor.name} signed in to shop terminal`;}else if(act==='administrator shop access'){actionLabel='Admin Console Switch';actionTone='sky';summary=`Administrator switched into shop terminal from admin console`;}else if(ent==='store'||ent==='settings'||act.includes('setting')){actionLabel='Settings Updated';actionTone='zinc';summary=`Updated shop configuration${meta.fields?.length?` (${meta.fields.join(', ')})`:''}`;}else{actionLabel=x.action;summary=`${x.action} on ${x.entity_type||'record'} ${code}`;}return {id:x.id,created_at:x.created_at,actor,who:actor,where,what:{action:x.action,entity_type:x.entity_type,entity_id:x.entity_id,label:actionLabel,tone:actionTone,code,name,summary,metadata:meta},action:x.action,entity_type:x.entity_type,entity_id:x.entity_id,detail:code,summary,metadata:meta};});return json(out)}
 if(path==='addons/coupon'&&s.role==='admin'&&method==='GET'){let code=(new URL(request.url).searchParams.get('code')||'').trim().toUpperCase();if(!code)return fail('Enter a coupon code.',400);let [c]=await db(env,`addon_coupons?code=eq.${encodeURIComponent(code)}&active=is.true&select=*`);if(!c)return fail('Invalid or inactive coupon code.',404);return json({code:c.code,percent_off:Number(c.percent_off||0)})}
 if(path==='addons'&&s.role==='admin'){
  if(method==='GET'){let [settings,purchases,entitlement,payinfo]=await Promise.all([db(env,'addon_settings?select=*&order=addon_key'),db(env,`addon_purchases?admin_id=eq.${s.id}&select=*&order=created_at.desc`),currentEntitlement(env,s.id),db(env,'addon_checkout_settings?select=payment_info')]);return json({settings,purchases,entitlement,payment_info:(payinfo[0]||{}).payment_info||''})}
 }
 if(path==='addon-checkout'&&s.role==='admin'&&method==='POST'){
  let b=await body(request),items=Array.isArray(b.items)?b.items:[];if(!items.length)return fail('Cart is empty.',400);let payMethod=b.payment_method,payNumber=String(b.payment_number||'').trim(),trxId=String(b.transaction_id||'').trim();if(!['bkash','nagad'].includes(payMethod)||!payNumber||!trxId)return fail('Payment method, payment number, and transaction ID are required.',400);let coupon=null,percent=0;if(String(b.coupon||'').trim()){let code=String(b.coupon).trim().toUpperCase();let [c]=await db(env,`addon_coupons?code=eq.${encodeURIComponent(code)}&active=is.true&select=*`);if(!c)return fail('Invalid or inactive coupon code.',400);coupon=c.code;percent=Number(c.percent_off||0)}let prior=await db(env,`addon_purchases?transaction_id=eq.${encodeURIComponent(trxId)}&select=id`);if(prior.length)return fail('This transaction ID has already been submitted. Use the correct unique bKash/Nagad transaction ID.',409);let ent=await currentEntitlement(env,s.id),created=[];
  for(let item of items){let [cfg]=await db(env,`addon_settings?addon_key=eq.${item.addon_key}&enabled=is.true&select=*`),days=Number(item.validity_days),limit=item.addon_key==='truebill'?1:Number(item.daily_limit);if(item.addon_key==='connectx'&&ent?.connectx_enabled)return fail('ConnectX is already included in your active license.',409);if(item.addon_key==='zudo'&&ent?.zudo_enabled)return fail('Zudo AI is already included in your active license.',409);if(item.addon_key==='business_health'&&ent?.business_health_enabled)return fail('AI Business Health is already included in your active license.',409);if(item.addon_key==='truebill'&&ent?.truebill_enabled)return fail('TrueBill is already included in your active license.',409);if(item.addon_key==='vaultium'&&ent&&Number(ent.vaultium_gb||0)>0)return fail('Vaultium is already included in your active license.',409);if(!cfg||days<cfg.min_days||days>cfg.max_days||limit<cfg.min_daily_limit||limit>cfg.max_daily_limit)return fail('Invalid add-on selection.',400);let [active]=await db(env,`addon_purchases?admin_id=eq.${s.id}&addon_key=eq.${item.addon_key}&status=eq.active&expires_at=gt.${new Date().toISOString()}&select=id`);if(active)return fail('This add-on is already active.',409);let [pending]=await db(env,`addon_purchases?admin_id=eq.${s.id}&addon_key=eq.${item.addon_key}&status=eq.pending&select=id`);if(pending)return fail('A purchase request for this add-on is already pending review.',409);let amount=days*limit*Number(cfg.unit_price),discount=Math.round(amount*percent)/100,[x]=await db(env,'addon_purchases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({admin_id:s.id,addon_key:item.addon_key,validity_days:days,daily_limit:limit,unit_price:cfg.unit_price,amount,coupon_code:coupon,discount_amount:discount,payment_method:payMethod,payment_number:payNumber,transaction_id:trxId,status:'pending'})});created.push(x)}return json(created,201)
 }
 if(path==='platform/addon-checkout'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET'){let [settings]=await db(env,'addon_checkout_settings?select=*');return json({settings,coupons:await db(env,'addon_coupons?select=*&order=created_at.desc')})}if(method==='PATCH'){let b=await body(request);await db(env,'addon_checkout_settings?on_conflict=id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:true,payment_info:String(b.payment_info||''),updated_by:s.id,updated_at:new Date().toISOString()})});if(String(b.code||'').trim())await db(env,'addon_coupons?on_conflict=code',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({code:String(b.code).trim().toUpperCase(),percent_off:Number(b.percent_off||0),active:true})});return json({ok:true})}}
 if(path==='platform/addon-coupons'){
  if(s.role!=='owner')return fail('Forbidden',403);
  if(method==='POST'){let b=await body(request),code=String(b.code||'').trim().toUpperCase(),pct=Number(b.percent_off||0);if(!code)return fail('Enter a coupon code.',400);if(!pct||pct<=0||pct>100)return fail('Discount percent must be between 1 and 100.',400);let [x]=await db(env,'addon_coupons?on_conflict=code',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({code,percent_off:pct,active:b.active!==false})});return json(x,201)}
  if(method==='PATCH'){let b=await body(request),code=String(b.code||'').trim().toUpperCase();if(!code)return fail('Coupon code is required.',400);let upd={};if(b.active!==undefined)upd.active=!!b.active;if(b.percent_off!==undefined){let pct=Number(b.percent_off||0);if(!pct||pct<=0||pct>100)return fail('Discount percent must be between 1 and 100.',400);upd.percent_off=pct}if(!Object.keys(upd).length)return fail('Nothing to update.',400);let [x]=await db(env,`addon_coupons?code=eq.${encodeURIComponent(code)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(upd)});if(!x)return fail('Coupon not found.',404);return json(x)}
  if(method==='DELETE'){let code=String((new URL(request.url).searchParams.get('code')||'').trim().toUpperCase());if(!code)return fail('Coupon code is required.',400);await db(env,`addon_coupons?code=eq.${encodeURIComponent(code)}`,{method:'DELETE'});return json({ok:true})}
 }
 if(path==='platform/truebill/scans'&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);let scans=await db(env,'truebill_scans?select=id,invoice_id,store_id,invoice_number,invoice_kind,scanned_at,ip_address&order=scanned_at.desc&limit=300'),storeIds=[...new Set(scans.map(x=>x.store_id).filter(Boolean))],stores=storeIds.length?await db(env,`stores?id=in.(${storeIds.join(',')})&select=id,shop_code,admin_id`):[],admins=await db(env,'administrators?select=id,admin_code,name'),storeMap=Object.fromEntries(stores.map(x=>[x.id,x])),adminMap=Object.fromEntries(admins.map(x=>[x.id,x]));return json(scans.map(s=>({...s,shop_code:storeMap[s.store_id]?.shop_code||null,admin_code:storeMap[s.store_id]?adminMap[storeMap[s.store_id].admin_id]?.admin_code||null:null})))}

 if(path==='platform/addons'){
  if(s.role!=='owner')return fail('Forbidden',403);
  if(method==='GET')return json(await db(env,'addon_settings?select=*&order=addon_key'));
  if(method==='PATCH'){let b=await body(request);let [x]=await db(env,`addon_settings?addon_key=eq.${b.addon_key}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!!b.enabled,title:b.title,image_url:b.image_url||null,url:b.url||null,details:b.details,unit_price:Number(b.unit_price),min_days:Number(b.min_days),max_days:Number(b.max_days),min_daily_limit:Number(b.min_daily_limit||1),max_daily_limit:Number(b.max_daily_limit||1),updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}
 }
 if(path==='platform/addon-purchases'){
  if(s.role!=='owner')return fail('Forbidden',403);
  if(method==='GET')return json(await db(env,'addon_purchases?select=*,administrators(name,admin_code)&order=created_at.desc'));
  if(method==='PATCH'){let b=await body(request),[r]=await db(env,`addon_purchases?id=eq.${b.id}&select=*`);if(!r)return fail('Purchase not found.',404);let starts=b.status==='active'?new Date():null,expires=starts?new Date(starts):null;if(expires){expires.setDate(expires.getDate()+Number(r.validity_days))}let [x]=await db(env,`addon_purchases?id=eq.${r.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:b.status,starts_at:starts?.toISOString(),expires_at:expires?.toISOString(),reviewed_at:new Date().toISOString()})});return json(x)}
 }
 if(path==='truebill/availability'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let [plan,ever,cfg]=await Promise.all([truebillPlan(env,s.storeId),featureEver(env,s.storeId,'truebill'),db(env,'addon_settings?addon_key=eq.truebill&select=url')]);return json({enabled:!!plan,ever,url:(cfg[0]&&cfg[0].url)||null})}
 if(path==='admin/business-health-usage'&&method==='GET'){
  if(s.role!=='admin')return fail('Forbidden',403);let stores=await db(env,`stores?admin_id=eq.${s.id}&select=id,name,shop_code,status`),today=new Date().toISOString().slice(0,10),out=await Promise.all(stores.map(async store=>{let used=await db(env,`business_health_reports?store_id=eq.${store.id}&created_at=gte.${today}T00:00:00Z&select=id`),plan=await businessHealthPlan(env,store.id),enabled=!!plan&&store.status==='active',dailyLimit=enabled?plan.business_health_daily_limit:0;return {...store,enabled,dailyLimit,usedToday:used.length,remaining:Math.max(0,dailyLimit-used.length),expiresAt:enabled?plan.expires_at:null}}));return json(out)
 }

 if(path==='business-health/availability'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let plan=await businessHealthPlan(env,s.storeId),ever=await featureEver(env,s.storeId,'business_health'),today=new Date().toISOString().slice(0,10),used=await db(env,`business_health_reports?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&select=id`);if(!plan)return json({enabled:false,ever,dailyLimit:0,usedToday:used.length,remaining:0});return json({enabled:true,ever:true,dailyLimit:plan.business_health_daily_limit,usedToday:used.length,remaining:Math.max(0,plan.business_health_daily_limit-used.length)})}
 if(path==='business-health/report'&&method==='POST'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'report','view'))return fail('Permission denied.',403);
  let b=await body(request),start=b.startDate,end=b.endDate;
  if(!start||!end||start>end)return fail('Choose a valid date range.',400);
  let plan=await businessHealthPlan(env,s.storeId);
  if(!plan)return fail('Business AI Health is not available for this shop. Purchase the add-on or an eligible license.',403);
  let [cfg]=await db(env,'business_health_settings?select=*');
  if(!cfg?.enabled)return fail('Business AI Health is currently disabled by EMS Owner.',403);
  if(!aiConfigured(env,cfg.model))return fail('The selected Business AI Health model is not configured. EMS Owner must add the matching API key.',503);
  let today=new Date().toISOString().slice(0,10),[globalUsed,shopUsed]=await Promise.all([db(env,`business_health_reports?created_at=gte.${today}T00:00:00Z&select=id`),db(env,`business_health_reports?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&select=id`)]);
  if(globalUsed.length>=Number(cfg.global_daily_limit||100))return fail('Business AI Health global daily limit has been reached.',429);
  if(shopUsed.length>=plan.business_health_daily_limit)return fail('Your shop has reached its daily Business AI Health limit.',429);
  const ymd=d=>d.toISOString().slice(0,10);
  const sd=new Date(start+'T00:00:00'),ed=new Date(end+'T00:00:00');
  const days=Math.max(1,Math.round((ed-sd)/86400000)+1);
  const prevEnd=new Date(sd.getTime()-86400000),prevStart=new Date(prevEnd.getTime()-(days-1)*86400000);
  const ps=ymd(prevStart),pe=ymd(prevEnd);
  let [store,sales,purchases,expenses,recoveries,errors,activity,customers,suppliers,staff,prevSales,prevPurchases,prevExpenses,inventory,returnsList,exchangesList,prevReturnsList,prevExchangesList]=await Promise.all([
   db(env,`stores?id=eq.${s.storeId}&select=id,name,address,phone,phone2,email,website,low_stock_threshold`),
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&invoice_date=gte.${start}&invoice_date=lte.${end}&select=party_id,custom_party_name,created_by,invoice_date,subtotal,discount,tax_amount,paid_amount,total_due`),
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.purchase&invoice_date=gte.${start}&invoice_date=lte.${end}&select=party_id,invoice_date,subtotal,paid_amount`),
   db(env,`expenses?store_id=eq.${s.storeId}&expense_date=gte.${start}&expense_date=lte.${end}&select=expense_date,details,total,paid,due`),
   db(env,`due_recoveries?store_id=eq.${s.storeId}&created_at=gte.${start}T00:00:00Z&created_at=lte.${end}T23:59:59Z&select=amount`),
   db(env,`error_logs?store_id=eq.${s.storeId}&created_at=gte.${start}T00:00:00Z&created_at=lte.${end}T23:59:59Z&select=id`),
   db(env,`activity_logs?store_id=eq.${s.storeId}&created_at=gte.${start}T00:00:00Z&created_at=lte.${end}T23:59:59Z&select=id`),
   db(env,`customers?store_id=eq.${s.storeId}&select=id,name`),
   db(env,`suppliers?store_id=eq.${s.storeId}&select=id,name`),
   db(env,`staff?store_id=eq.${s.storeId}&select=id,full_name,user_id`),
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&invoice_date=gte.${ps}&invoice_date=lte.${pe}&select=subtotal`),
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.purchase&invoice_date=gte.${ps}&invoice_date=lte.${pe}&select=subtotal`),
   db(env,`expenses?store_id=eq.${s.storeId}&expense_date=gte.${ps}&expense_date=lte.${pe}&select=total`),
   db(env,`inventory_items?store_id=eq.${s.storeId}&active=is.true&select=id,item_code,description,total_stock,sale_price&order=total_stock.asc&limit=500`),
   db(env,`returns?store_id=eq.${s.storeId}&return_date=gte.${start}&return_date=lte.${end}&select=total_return_amount,refunded_amount,subtotal,penalty_amount`).catch(()=>[]),
   db(env,`exchanges?store_id=eq.${s.storeId}&exchange_date=gte.${start}&exchange_date=lte.${end}&select=returned_total,new_items_total,difference_amount,action_type`).catch(()=>[]),
   db(env,`returns?store_id=eq.${s.storeId}&return_date=gte.${ps}&return_date=lte.${pe}&select=total_return_amount`).catch(()=>[]),
   db(env,`exchanges?store_id=eq.${s.storeId}&exchange_date=gte.${ps}&exchange_date=lte.${pe}&select=new_items_total`).catch(()=>[])
  ]);
  let money=v=>Number(v||0),sum=(rows,f)=>rows.reduce((n,r)=>n+money(f(r)),0),pct=(a,b)=>b>0?Math.round((a-b)/b*100):null;
  let salesTotal=sum(sales,r=>r.subtotal),salesDiscount=sum(sales,r=>r.discount),salesCollected=sum(sales,r=>r.paid_amount),purchaseTotal=sum(purchases,r=>r.subtotal),purchasePaid=sum(purchases,r=>r.paid_amount),expenseTotal=sum(expenses,r=>r.total),expensePaid=sum(expenses,r=>r.paid),recovered=sum(recoveries,r=>r.amount),dueTotal=sum(sales,r=>r.total_due);
  let returnsTotal=sum(returnsList,r=>r.total_return_amount),refundsTotal=sum(returnsList,r=>r.refunded_amount),exchangesTotal=sum(exchangesList,r=>r.new_items_total);
  let prevReturnsTotal=sum(prevReturnsList,r=>r.total_return_amount),prevExchangesTotal=sum(prevExchangesList,r=>r.new_items_total);
  let prevSalesTotal=sum(prevSales,r=>r.subtotal),prevPurchaseTotal=sum(prevPurchases,r=>r.subtotal),prevExpenseTotal=sum(prevExpenses,r=>r.total);
  let netSales=Math.max(0,salesTotal-returnsTotal);
  let profit=netSales-purchaseTotal-expenseTotal,prevProfit=Math.max(0,prevSalesTotal-prevReturnsTotal)-prevPurchaseTotal-prevExpenseTotal;
  let avgSale=sales.length?Math.round(salesTotal/sales.length):0;
  let uniqueCustomers=new Set(sales.map(r=>r.party_id||r.custom_party_name).filter(Boolean)).size;
  let threshold=Number(store[0]?.low_stock_threshold||5);
  let lowStock=inventory.filter(r=>Number(r.total_stock||0)<=threshold);
  let outStock=lowStock.filter(r=>Number(r.total_stock||0)===0);
  let dayMap={};for(let r of sales){dayMap[r.invoice_date]=(dayMap[r.invoice_date]||0)+money(r.subtotal)}
  let busiestDay=Object.entries(dayMap).sort((a,b)=>b[1]-a[1])[0]||null;
  let cName=Object.fromEntries(customers.map(x=>[x.id,x.name])),sName=Object.fromEntries(suppliers.map(x=>[x.id,x.name])),stName=Object.fromEntries(staff.map(x=>[x.id,x.full_name]));
  let top=(rows,key,nameMap)=>{let m={};for(let r of rows){let id=r[key];if(!id)continue;m[id]=(m[id]||0)+money(r.subtotal)}return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,t])=>({name:nameMap[id]||'—',total:t}))};
  let topCustomers=top(sales,'party_id',cName),topSuppliers=top(purchases,'party_id',sName),topSalesStaff=top(sales,'created_by',stName);
  let storeRow=store[0]||{};
  let missing=[];if(!storeRow.address)missing.push('address');if(!storeRow.phone)missing.push('phone');if(!storeRow.email)missing.push('email');
  let returnRate=salesTotal>0?Math.round(returnsTotal/salesTotal*100):0;
  let collectionRate=salesTotal>0?Math.round(salesCollected/salesTotal*100):null,dueRate=salesTotal>0?Math.round(dueTotal/salesTotal*100):null,discountRate=salesTotal>0?Math.round(salesDiscount/salesTotal*100):null,expenseRatio=salesTotal>0?Math.round(expenseTotal/salesTotal*100):null,recoveryRate=(dueTotal+recovered)>0?Math.round(recovered/(dueTotal+recovered)*100):null,marginPct=netSales>0?Math.round(profit/netSales*100):null;
  let fmtB=v=>money(v).toLocaleString('en-BD')+' BDT';
  let findings=[];
  if(sales.length===0)findings.push('No sales were recorded in the selected period — records may be missing or the shop was inactive.');
  if(dueTotal>0)findings.push('Outstanding customer dues of '+fmtB(dueTotal)+' remain uncollected from this period\'s sales.');
  if(collectionRate!==null&&collectionRate<60)findings.push('Collection rate is only '+collectionRate+'% — more than 40% of sales value is leaving the shop as due.');
  if(dueRate!==null&&dueRate>50)findings.push('Due level is high: '+dueRate+'% of sales value is still owed by customers.');
  if(discountRate!==null&&discountRate>20)findings.push('Discounts are unusually high at '+discountRate+'% of sales ('+fmtB(salesDiscount)+').');
  if(returnsTotal>0)findings.push('Customer returns totaled '+fmtB(returnsTotal)+' across '+returnsList.length+' return(s) ('+returnRate+'% of gross sales refunded).');
  if(returnRate>15)findings.push('High return rate: '+returnRate+'% of sales value was returned or refunded.');
  if(exchangesList.length>0)findings.push(exchangesList.length+' sales exchange(s) processed representing '+fmtB(exchangesTotal)+' in replacement merchandise.');
  if(profit<0&&salesTotal>0)findings.push('Purchases and expenses ('+fmtB(purchaseTotal+expenseTotal)+') exceeded sales ('+fmtB(salesTotal)+') — the period ran at a loss of '+fmtB(Math.abs(profit))+'.');
  else if(marginPct!==null&&marginPct<10)findings.push('Operating margin is thin at '+marginPct+'% — costs are eating most of the sales value.');
  if(outStock.length)findings.push(outStock.length+' item(s) are completely out of stock and may be losing walk-in sales.');
  else if(lowStock.length)findings.push(lowStock.length+' item(s) are at or below the low-stock threshold ('+threshold+' units).');
  if(recoveryRate!==null&&recoveryRate<20&&dueTotal>0)findings.push('Only '+recoveryRate+'% of dues were recovered during the period.');
  if(errors.length)findings.push(errors.length+' system error(s) were recorded during this period.');
  if(missing.length)findings.push('Store profile is incomplete — missing: '+missing.join(', ')+'. Completed profiles look professional on invoices and emails.');
  if(!findings.length)findings.push('No automatic risks were found for this period.');
  let score=100;
  if(salesTotal<=0)score-=15;else score-=Math.min(25,Math.round((dueRate||0)/100*25));
  if(collectionRate!==null&&collectionRate<60)score-=10;
  if(discountRate!==null)score-=Math.min(10,Math.max(0,Math.round((discountRate-10)/2)));
  if(returnRate>10)score-=Math.min(10,Math.round((returnRate-10)/2));
  if(salesTotal>0){if(profit<0)score-=15;else if((marginPct||0)<10)score-=8}
  score-=Math.min(10,lowStock.length*2);
  score-=Math.min(10,missing.length*3);
  score-=Math.min(10,errors.length*3);
  score=Math.max(0,Math.min(100,Math.round(score)));
  let trend={sales:{now:salesTotal,prev:prevSalesTotal,pct:pct(salesTotal,prevSalesTotal)},netSales:{now:netSales,prev:Math.max(0,prevSalesTotal-prevReturnsTotal),pct:pct(netSales,Math.max(0,prevSalesTotal-prevReturnsTotal))},returns:{now:returnsTotal,prev:prevReturnsTotal,pct:pct(returnsTotal,prevReturnsTotal)},exchanges:{now:exchangesTotal,prev:prevExchangesTotal,pct:pct(exchangesTotal,prevExchangesTotal)},purchase:{now:purchaseTotal,prev:prevPurchaseTotal,pct:pct(purchaseTotal,prevPurchaseTotal)},expense:{now:expenseTotal,prev:prevExpenseTotal,pct:pct(expenseTotal,prevExpenseTotal)},profit:{now:profit,prev:prevProfit,pct:pct(profit,prevProfit)}};
  let snapshot={period:{start,end,days,previousStart:ps,previousEnd:pe,returnAmount:returnsTotal,exchangeTotal:exchangesTotal,refundAmount:refundsTotal},sales:{total:salesTotal,count:sales.length,collected:salesCollected,discount:salesDiscount,avg:avgSale,uniqueCustomers},netSales,returns:{total:returnsTotal,refunded:refundsTotal,count:returnsList.length,returnRate},exchanges:{total:exchangesTotal,count:exchangesList.length},purchase:{total:purchaseTotal,count:purchases.length,paid:purchasePaid},expense:{total:expenseTotal,count:expenses.length,paid:expensePaid},profit:{value:profit,marginPct},due:{total:dueTotal,recovered,recoveryRate},ratios:{collectionRate,dueRate,discountRate,expenseRatio,returnRate},trend,inventory:{lowStockCount:lowStock.length,outStockCount:outStock.length,lowStockItems:lowStock.slice(0,8).map(r=>({name:r.description||r.item_code,stock:Number(r.total_stock||0)}))},busiestDay:busiestDay?{date:busiestDay[0],total:busiestDay[1]}:null,people:{customersCount:customers.length,suppliersCount:suppliers.length,staffCount:staff.length},errors:errors.length,activityCount:activity.length,findings,missing,topCustomers,topSuppliers,topSalesStaff};
  let activeModel=modernModel(cfg.model||'@cf/meta/llama-3.2-3b-instruct');
  let systemPrompt='You are the EMS Business Health Advisor — a warm, practical retail business coach for Bangladeshi shopkeepers. You write an organized, easy-to-relate-to health report from the shop\'s own numbers. Use simple business language (no jargon), short paragraphs and bullet lists. Money is BDT (you may use ৳). Base every statement on the supplied DATA only — never invent figures, names or dates. Be specific and quote the real numbers. Format your reply with exactly these markdown headings, in this order:\n# Business health overview\n2-3 friendly sentences: the headline result for the period, how it compares with the previous period, and one strength plus one concern.\n# What is working well\n3 to 5 bullets that reference real figures (e.g. collection, recovery, top customers, margin, low errors).\n# What needs attention\n3 to 5 bullets, each naming the actual number and what it means in plain words.\n# Your 7-day action plan\nExactly 5 numbered, specific, doable steps (dues to chase, items to reorder, discounts to review, records to complete) that this exact shop can act on this week.\n# Cash and due collection guidance\n2 to 3 practical bullets about collecting dues and managing cash.\n# Growth ideas\n2 to 3 simple, realistic suggestions that fit a shop with this data (e.g. reorder best-sellers, follow up top customers, bundle slow items).\nDo not add any other sections and do not reveal field names or JSON.';
  let prompt='Period: '+start+' to '+end+' ('+days+' day(s)), compared with the previous '+days+' day(s): '+ps+' to '+pe+'.\n\nDATA SNAPSHOT (all money in BDT):\n'+JSON.stringify({store:{name:storeRow.name,address:storeRow.address,phone:storeRow.phone,email:storeRow.email},snapshot})+'\n\nWrite the full health report now. Make it about 30% more detailed than a short summary, but stay skimmable; every section above must be present and reference real numbers.';
  let result=await runAI(env,activeModel,[{role:'system',content:systemPrompt},{role:'user',content:prompt}],0.35,2048);
  let insights=String(result||'No health report could be generated for this period. Please try again.');
  let [rep]=await db(env,'business_health_reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:s.storeId,user_id:s.id,start_date:start,end_date:end,score,snapshot,insights})});
  await audit(env,s,'Business AI Health report','report',rep.id);
  return json({score,snapshot,insights,usage:{dailyLimit:plan.business_health_daily_limit,usedToday:shopUsed.length+1,remaining:Math.max(0,plan.business_health_daily_limit-shopUsed.length-1)}});
 }
 if(path==='platform/business-health'){if(s.role!=='owner')return fail('Forbidden',403);if(method==='GET'){let [x]=await db(env,'business_health_settings?select=*');let today=new Date().toISOString().slice(0,10),used=await db(env,`business_health_reports?created_at=gte.${today}T00:00:00Z&select=id`);return json({...(x||{enabled:false,global_daily_limit:100,model:'@cf/meta/llama-3.2-3b-instruct'}),usedToday:used.length,aiBinding:!!env.AI,geminiBinding:!!env.GEMINI_API_KEY,groqBinding:!!env.GROQ_API_KEY,cerebrasBinding:!!env.CEREBRAS_API_KEY,deepseekBinding:!!env.DEEPSEEK_API_KEY,openrouterBinding:!!env.OPENROUTER_API_KEY,githubBinding:!!env.GITHUB_TOKEN,anthropicBinding:!!env.ANTHROPIC_API_KEY,models:AI_PROVIDERS})}if(method==='PATCH'){let b=await body(request);let [x]=await db(env,'business_health_settings?on_conflict=id',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:true,enabled:!!b.enabled,model:b.model||'@cf/meta/llama-3.2-3b-instruct',global_daily_limit:Number(b.global_daily_limit),updated_by:s.id,updated_at:new Date().toISOString()})});return json(x)}}
 if(path==='platform/business-health/logs'&&method==='GET'){if(s.role!=='owner')return fail('Forbidden',403);return json(await db(env,'business_health_reports?select=store_id,start_date,end_date,score,created_at&order=created_at.desc&limit=100'))}

 if(path==='zudo/availability'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let entitlement=await zudoPlan(env,s.storeId),ever=await featureEver(env,s.storeId,'zudo'),today=new Date().toISOString().slice(0,10),used=await db(env,`zudo_messages?store_id=eq.${s.storeId}&role=eq.user&created_at=gte.${today}T00:00:00Z&select=id`);if(!entitlement)return json({enabled:false,history:ever,dailyLimit:0,usedToday:used.length,remaining:0});return json({enabled:true,history:true,dailyLimit:entitlement.zudo_daily_limit,usedToday:used.length,remaining:Math.max(0,entitlement.zudo_daily_limit-used.length)})}
 if(path==='zudo/conversations'&&method==='GET'){if(!s.storeId||!allowed(s,'zudo','view'))return fail('Permission denied.',403);return json(await db(env,`zudo_conversations?store_id=eq.${s.storeId}&user_id=eq.${s.id}&shop_deleted_at=is.null&select=*&order=updated_at.desc&limit=50`))}
 if(path.match(/^zudo\/conversations\/[^/]+$/)&&method==='GET'){if(!s.storeId||!allowed(s,'zudo','view'))return fail('Permission denied.',403);let id=path.split('/')[2],[c]=await db(env,`zudo_conversations?id=eq.${id}&store_id=eq.${s.storeId}&user_id=eq.${s.id}&select=id`);if(!c)return fail('Conversation not found.',404);return json(await db(env,`zudo_messages?conversation_id=eq.${id}&select=*&order=created_at.asc`))}
 if(path.match(/^zudo\/conversations\/[^/]+$/)&&method==='DELETE'){if(!s.storeId||!allowed(s,'zudo','delete'))return fail('Permission denied.',403);let id=path.split('/')[2];await db(env,`zudo_conversations?id=eq.${id}&store_id=eq.${s.storeId}&user_id=eq.${s.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({shop_deleted_at:new Date().toISOString(),shop_deleted_by:s.id})});await audit(env,s,'hide Zudo conversation','zudo',id);return json({ok:true})}
 if(path==='zudo/chat'&&method==='POST'){
  if(!s.storeId||!allowedAddon(s,'zudo','add'))return fail('Permission denied.',403);
  let plan=await zudoPlan(env,s.storeId);
  if(!plan)return fail('Zudo is not available for this shop. Purchase a Zudo AI add-on or an eligible license.',403);
  let b=await body(request),question=String(b.message||b.question||'').trim();
  if(question.length<2||question.length>2000)return fail('Enter a question between 2 and 2000 characters.');
  let [cfg]=await db(env,'zudo_settings?select=*');
  if(!cfg?.enabled)return fail('Zudo is currently disabled by EMS Owner.',403);
  if(!aiConfigured(env,cfg.model))return fail('The selected Zudo AI model is not configured. EMS Owner must add the matching API key.',503);
  let today=new Date().toISOString().slice(0,10),[globalUsed,shopUsed]=await Promise.all([
   db(env,`zudo_messages?role=eq.user&created_at=gte.${today}T00:00:00Z&select=id`),
   db(env,`zudo_messages?store_id=eq.${s.storeId}&role=eq.user&created_at=gte.${today}T00:00:00Z&select=id`)
  ]);
  if(globalUsed.length>=cfg.global_daily_limit)return fail('Zudo global daily request limit has been reached.',429);
  if(shopUsed.length>=plan.zudo_daily_limit)return fail('Your shop has reached its daily Zudo limit.',429);
  let [store]=await db(env,`stores?id=eq.${s.storeId}&select=id,name,shop_code,address,phone,phone2,email,website,status,low_stock_threshold,admin_id`);
  if(!store)return fail('Shop not found.',404);
  let conversationId=b.conversationId,[conversation]=conversationId?await db(env,`zudo_conversations?id=eq.${conversationId}&store_id=eq.${s.storeId}&user_id=eq.${s.id}&select=*`):[];
  if(!conversation){let [x]=await db(env,'zudo_conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:s.storeId,user_id:s.id,title:question.slice(0,80)})});conversation=x;conversationId=x.id}
  await db(env,'zudo_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversation_id:conversationId,store_id:s.storeId,user_id:s.id,role:'user',content:question})});
  let [sales,purchases,expenses,items,customers,connectxMessages,administrators,licenses,entitlements,history,pages,blogs,plans,addonCatalog,checkoutCfg,activeAddons,returnsData,exchangesData,suppliers,staffList,dueRecoveries,damagedDefective]=await Promise.all([
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&select=subtotal,total_due,paid_amount,tax_amount,discount,invoice_date,party_id,invoice_number&order=invoice_date.desc&limit=250`),
   db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.purchase&select=subtotal,total_due,paid_amount,tax_amount,discount,invoice_date,party_id,invoice_number&order=invoice_date.desc&limit=250`),
   db(env,`expenses?store_id=eq.${s.storeId}&select=expense_code,total,paid,due,expense_date,details&order=expense_date.desc&limit=250`),
   db(env,`inventory_items?store_id=eq.${s.storeId}&select=id,item_code,description,unit,category,total_stock,sale_price,active&order=total_stock.asc&limit=500`),
   db(env,`customers?store_id=eq.${s.storeId}&select=customer_code,name,address,phone,phone2,email&limit=250`),
   db(env,`connectx_messages?store_id=eq.${s.storeId}&shop_deleted_at=is.null&select=created_at,sent_at,status,recipient_type,from_email,to_emails,cc_emails,bcc_emails,subject,custom_body,invoice_id,error_message&order=created_at.desc&limit=100`),
   db(env,`administrators?id=eq.${store.admin_id}&select=admin_code,name,address,phone,email,active,created_at`),
   db(env,`licenses?admin_id=eq.${store.admin_id}&select=id,plan_id,duration_months,amount,max_stores,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,status,transaction_type,starts_at,expires_at,created_at,license_plans(title)&order=created_at.desc&limit=25`),
   db(env,`current_entitlements?admin_id=eq.${store.admin_id}&select=current_license_id,shop_limit,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,status,starts_at,expires_at,updated_at`),
   db(env,`zudo_messages?conversation_id=eq.${conversationId}&user_id=eq.${s.id}&select=role,content,created_at&order=created_at.asc&limit=20`),
   db(env,'public_pages?select=slug,title,body,updated_at').catch(()=>[]),
   db(env,'blog_posts?published=is.true&select=title,slug,excerpt,published_at&order=published_at.desc&limit=20').catch(()=>[]),
   db(env,'license_plans?active=is.true&select=id,title,duration_months,max_stores,benefits,payment_details,price,connectx_enabled,connectx_daily_limit,zudo_enabled,zudo_daily_limit,business_health_enabled,business_health_daily_limit,truebill_enabled,vaultium_gb&order=price.asc').catch(()=>[]),
   db(env,'addon_settings?enabled=is.true&select=addon_key,title,details,unit_price,min_days,max_days,min_daily_limit,max_daily_limit,url&order=unit_price.asc').catch(()=>[]),
   db(env,'addon_checkout_settings?select=payment_info&limit=1').catch(()=>[]),
   db(env,`addon_purchases?admin_id=eq.${store.admin_id}&select=addon_key,status,validity_days,daily_limit,amount,starts_at,expires_at,created_at&order=created_at.desc&limit=25`).catch(()=>[]),
   db(env,`returns?store_id=eq.${s.storeId}&select=id,return_number,return_date,customer_name,total_return_amount,refunded_amount,penalty_amount,payment_method,reason,return_items(*,inventory_items(item_code,description,unit,category))&order=created_at.desc&limit=100`).catch(()=>[]),
   db(env,`exchanges?store_id=eq.${s.storeId}&select=id,exchange_number,exchange_date,customer_name,returned_total,new_items_total,difference_amount,action_type,payment_method,exchange_items(*,inventory_items(item_code,description,unit,category))&order=created_at.desc&limit=100`).catch(()=>[]),
   db(env,`suppliers?store_id=eq.${s.storeId}&select=supplier_code,name,address,phone,email&limit=150`).catch(()=>[]),
   db(env,`staff?store_id=eq.${s.storeId}&select=user_id,full_name,role,phone,email,active&limit=50`).catch(()=>[]),
   db(env,`due_recoveries?store_id=eq.${s.storeId}&select=source_type,amount,remaining_due,payment_method,transaction_id,created_at&order=created_at.desc&limit=50`).catch(()=>[]),
   Promise.resolve().then(async()=>{
     let [retList, excList] = await Promise.all([
       db(env,`returns?store_id=eq.${s.storeId}&select=id,return_number,return_date,customer_name,return_items(*,inventory_items(item_code,description,unit,category))`).catch(()=>[]),
       db(env,`exchanges?store_id=eq.${s.storeId}&select=id,exchange_number,exchange_date,customer_name,exchange_items(*,inventory_items(item_code,description,unit,category))`).catch(()=>[])
     ]);
     let q = [];
     for(let r of (retList||[])){
       for(let it of (r.return_items||[])){
         if(it.condition==='Damaged'||it.condition==='Defective'){
           q.push({
             item_code: it.inventory_items?.item_code || '—',
             description: it.inventory_items?.description || 'Item',
             category: it.inventory_items?.category || 'Damage/Defective',
             condition: it.condition,
             quantity: Number(it.quantity),
             unit: it.inventory_items?.unit || 'pcs',
             reason: it.reason,
             reason_note: it.reason_note || '',
             source: 'Return #' + r.return_number,
             customer: r.customer_name || 'Customer',
             date: r.return_date
           });
         }
       }
     }
     for(let exc of (excList||[])){
       for(let it of (exc.exchange_items||[])){
         if(it.item_type==='returned' && (it.condition==='Damaged'||it.condition==='Defective')){
           q.push({
             item_code: it.inventory_items?.item_code || '—',
             description: it.inventory_items?.description || 'Item',
             category: it.inventory_items?.category || 'Damage/Defective',
             condition: it.condition,
             quantity: Number(it.quantity),
             unit: it.inventory_items?.unit || 'pcs',
             reason: it.reason,
             reason_note: it.reason_note || '',
             source: 'Exchange #' + exc.exchange_number,
             customer: exc.customer_name || 'Customer',
             date: exc.exchange_date
           });
         }
       }
     }
     return q;
   }).catch(()=>[])
  ]);
  let shopData={...store};delete shopData.admin_id;
  let website={pages:(pages||[]).map(p=>({page:p.slug,title:p.title,content:p.body,updatedAt:p.updated_at})),blogPosts:blogs||[]};
  let purchasable={licensePlans:(plans||[]).map(p=>({name:p.title,durationMonths:p.duration_months,maxShops:p.max_stores,priceBDT:Number(p.price||0),features:p.benefits||p.payment_details||'',connectxDaily:p.connectx_enabled?p.connectx_daily_limit:0,zudoDaily:p.zudo_enabled?p.zudo_daily_limit:0,businessHealthDaily:p.business_health_enabled?p.business_health_daily_limit:0,truebillIncluded:!!p.truebill_enabled,vaultiumGB:Number(p.vaultium_gb||0)})),addOns:(addonCatalog||[]).map(a=>({key:a.addon_key,name:a.title,description:a.details,pricePerDayBDT:Number(a.unit_price||0),minDays:a.min_days,maxDays:a.max_days,minDailyLimit:a.min_daily_limit,maxDailyLimit:a.max_daily_limit,setupUrl:a.url||null})),paymentInstructions:(checkoutCfg&&checkoutCfg[0]&&checkoutCfg[0].payment_info)||null,currentAddOnPurchases:(activeAddons||[]).map(a=>({addon:a.addon_key,status:a.status,validityDays:a.validity_days,dailyLimit:a.daily_limit,starts:a.starts_at,expires:a.expires_at}))};
  let context=JSON.stringify({shop:shopData,administrator:administrators[0]||null,license:{currentEntitlement:entitlements[0]||null,history:licenses},zudo:{dailyLimit:plan.zudo_daily_limit,usedToday:shopUsed.length,remaining:Math.max(0,Number(plan.zudo_daily_limit)-shopUsed.length)},connectx:{messages:connectxMessages},sales,purchases,expenses,returns:returnsData,exchanges:exchangesData,inventory:items,quarantine_damaged_defective:damagedDefective,suppliers,staff:staffList,due_recoveries:dueRecoveries,customers,website,purchasable});
  let priorHistory=history.slice(0,-1).map(x=>({role:x.role,content:x.content}));
  let activeModel=modernModel(cfg.model||'@cf/meta/llama-3.2-3b-instruct');
  let result=null,aiError=null;
  try{result=await runAI(env,activeModel,[{role:'system',content:"You are Zudo, the friendly in-app business assistant for EMS V1 (powered by DoxTox). Shop owners and staff ask you about their shop, the product, pricing, and the public website, and you answer from the data provided.\n\nYOUR PERSONALITY:\n- Talk like a warm, sharp, reassuring human business advisor — never like a robot reading a database.\n- Greet naturally when greeted. Be encouraging, and explain things simply for a busy shopkeeper, as if chatting on WhatsApp.\n- LANGUAGE RULE (very important) — follow the user's LATEST message exactly, ignoring the language of earlier messages:\n  * English writing (Latin letters, English words) -> reply ONLY in English.\n  * Banglish, meaning Bengali written in Roman/Latin letters (words like ami, amar, koto, ache, korbo, chai, dao, bolo, kivabe, keno) -> reply ONLY in warm, simple Banglish (Roman Bengali letters). Do NOT use Bengali script for Banglish.\n  * Bengali/Bangla script (\u0985-\u09df letters: \u0986\u09ae\u09bf, \u0995\u09a4) -> reply ONLY in natural Bengali/Bangla script.\n  * Any other language (Hindi, Arabic, etc.) -> reply in that same language and script.\n  Never mix scripts: a Banglish question must get Roman-letter Banglish; a Bengali-script question must get Bengali-script Bangla; an English question must get English only.\n- Use short, natural sentences. Light emoji are welcome when they make an answer friendlier (💰 📦 ⚠️ ✅), but do not overdo them.\n\nWHAT YOU CAN ANSWER:\n- Shop operations & full database: sales, purchases, expenses, due recoveries, customers, suppliers, staff, attendance/salary context, returns, refunds, exchanges, and ConnectX emails — always pull the real numbers from CURRENT SHOP DATA.\n- Complete Inventory: live stock levels, categories, units, sale prices, low stock, out-of-stock items, and active status.\n- Quarantine (Damage/Defective Products): you have full direct visibility into the quarantine list (quarantine_damaged_defective) — all returned or exchanged products marked Damaged or Defective, their condition, quantity, reasons, notes, customer names, dates, and slip numbers. Explain that quarantined defective/damaged products are isolated from normal sellable inventory.\n- Pricing & upgrades: the purchasable.licensePlans and purchasable.addOns arrays list exactly what is available with prices (BDT), durations, shop limits, feature flags and daily quotas. Explain them clearly, compare options, recommend the best fit, and mention the purchasable.paymentInstructions if present. Tell them the shop Administrator activates plans/add-ons (bKash/Nagad checkout) — you cannot purchase or change anything yourself.\n- The product & website: answer \"what is EMS\", About, Terms, Contact details and published blog highlights from website.pages and website.blogPosts. If a page body is empty, say the page has no published content yet.\n- Their current plan/quota: license.currentEntitlement, license.history, zudo usage limits and purchasable.currentAddOnPurchases.\n\nHOW TO FORMAT:\n- Answer the question COMPLETELY — never stop mid-sentence, mid-list or cut the answer short; use as many words as the question genuinely needs.\n- Lead with the direct answer, then use short headings or bullet lists when they genuinely help. Short questions get short answers; detailed questions get full step-by-step answers.\n- Turn raw figures into friendly insight: totals, what stands out, and one practical suggestion (for example a stock to reorder or a due to chase).\n- Money is Bangladeshi Taka — write it as ৳ or BDT. Render dates in a readable form (e.g. 16 Sep 2026).\n- Keep it skimmable and avoid repeating the question, but completeness beats brevity.\n\nRULES:\n- The supplied data is the only source of truth. Never invent numbers, prices, dates, names, or features.\n- If the data does not contain the answer, say so honestly in plain words and suggest what to check or whom to ask.\n- You are read-only: you cannot create, edit, delete, buy, or send anything — never imply otherwise.\n- Never reveal passwords, hashes, API keys, tokens, or internal IDs/field names.\n- Never output JSON, raw arrays, code, SQL, or database column names — convert everything into normal human language."},...priorHistory,{role:'user',content:'CURRENT SHOP DATA: '+context+'\n\nQUESTION: '+question+'\n\nLANGUAGE FOR THIS REPLY (highest priority, overrides every earlier message):\n'+zudoLangDirective(question)+'\n\nWrite a COMPLETE answer and never stop mid-sentence or mid-list.'}],0.3)}catch(e){aiError=e.message||'AI provider failed to respond'}
  let answer=String(result||'').trim();
  if(!answer)answer=aiError?('⚠️ I could not reach my AI brain just now ('+String(aiError).slice(0,140)+'). Your conversation is saved — please send the message again.'):'Zudo could not generate a response. Please try again.';
  await db(env,'zudo_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversation_id:conversationId,store_id:s.storeId,user_id:s.id,role:'assistant',content:answer})});
  await db(env,`zudo_conversations?id=eq.${conversationId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({updated_at:new Date().toISOString()})});
  await audit(env,s,'Zudo AI request','zudo',conversationId);
  return json({conversationId,answer});
 }
 if(path==='connectx/availability'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let entitlement=await connectxPlan(env,s.storeId),ever=await featureEver(env,s.storeId,'connectx'),today=new Date().toISOString().slice(0,10),used=await db(env,`connectx_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id`);if(!entitlement)return json({enabled:false,history:ever,dailyLimit:0,usedToday:used.length,remaining:0});return json({enabled:true,history:true,dailyLimit:entitlement.connectx_daily_limit,usedToday:used.length,remaining:Math.max(0,entitlement.connectx_daily_limit-used.length),expiresAt:entitlement.expires_at})}
 if(path==='connectx/contacts'&&method==='GET'){if(!s.storeId||!allowed(s,'connectx','view'))return fail('Permission denied.',403);let type=new URL(request.url).searchParams.get('type'),table={customer:'customers',supplier:'suppliers',staff:'staff'}[type];if(!table)return fail('Invalid contact type.');let select=type==='staff'?'id,full_name,phone,email,user_id':type==='customer'?'id,name,address,phone,email,customer_code':'id,name,address,phone,email,supplier_code';return json(await db(env,`${table}?store_id=eq.${s.storeId}&select=${select}&order=created_at.desc`))}
 if(path==='connectx/invoices'&&method==='GET'){
  if(!s.storeId||!allowed(s,'connectx','view'))return fail('Permission denied.',403);
  let kind=new URL(request.url).searchParams.get('kind');
  let partyId=new URL(request.url).searchParams.get('party_id');
  let partyFilter=partyId?`&party_id=eq.${partyId}`:'';
  if(!['sale','purchase','return','exchange'].includes(kind))return fail('Invalid document type.');
  if(kind==='return'){
    let custFilter=partyId?`&customer_id=eq.${partyId}`:'';
    let rows=await db(env,`returns?store_id=eq.${s.storeId}${custFilter}&select=id,return_number,return_date,total_return_amount,refunded_amount,refund_method,customer_id,customer_name,invoice_id,invoices(invoice_number),return_items(id,quantity)&order=created_at.desc&limit=200`).catch(()=>[]);
    return json(rows.map(r=>({id:r.id,invoice_number:r.return_number,original_invoice_number:r.invoices?.invoice_number||null,invoice_date:r.return_date,subtotal:r.total_return_amount,paid_amount:r.refunded_amount,total_due:0,refund_amount:r.refunded_amount,refund_method:r.refund_method||'Cash',party_id:r.customer_id,customer_name:r.customer_name,item_count:(r.return_items||[]).reduce((a,x)=>a+Number(x.quantity||1),0)||(r.return_items?.length||1),document_type:'return'})));
  }
  if(kind==='exchange'){
    let custFilter=partyId?`&customer_id=eq.${partyId}`:'';
    let rows=await db(env,`exchanges?store_id=eq.${s.storeId}${custFilter}&select=id,exchange_number,exchange_date,new_items_total,difference_amount,action_type,payment_method,customer_id,customer_name,invoice_id,invoices(invoice_number),exchange_items(id,quantity,item_type)&order=created_at.desc&limit=200`).catch(()=>[]);
    return json(rows.map(r=>({id:r.id,invoice_number:r.exchange_number,original_invoice_number:r.invoices?.invoice_number||null,invoice_date:r.exchange_date,subtotal:r.new_items_total,paid_amount:r.new_items_total,total_due:r.difference_amount,difference_amount:r.difference_amount,action_type:r.action_type,payment_method:r.payment_method||'Cash',party_id:r.customer_id,customer_name:r.customer_name,item_count:(r.exchange_items||[]).filter(x=>x.item_type==='new').reduce((a,x)=>a+Number(x.quantity||1),0)||(r.exchange_items?.length||1),document_type:'exchange'})));
  }
  let rows=await db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.${kind}${partyFilter}&select=id,invoice_number,invoice_date,subtotal,paid_amount,total_due,payment_method,party_id,custom_party_name,invoice_lines(id,quantity)&order=created_at.desc&limit=200`);
  return json(rows.map(r=>({id:r.id,invoice_number:r.invoice_number,invoice_date:r.invoice_date,subtotal:r.subtotal,paid_amount:r.paid_amount,total_due:r.total_due,payment_method:r.payment_method,party_id:r.party_id,party_name:r.custom_party_name,item_count:(r.invoice_lines||[]).reduce((a,x)=>a+Number(x.quantity||1),0)||(r.invoice_lines?.length||1),document_type:r.kind})));
 }
 if(path.match(/^connectx\/sms\/messages\/[^/]+$/)&&method==='DELETE'){if(!s.storeId||(!allowed(s,'connectx','delete')&&s.role!=='admin'&&!s.adminAccess))return fail('Permission denied.',403);let id=path.split('/')[3];let [x]=await db(env,`connectx_sms_messages?id=eq.${id}&store_id=eq.${s.storeId}&select=*`);if(!x)return fail('SMS record not found.',404);await db(env,`connectx_sms_messages?id=eq.${id}&store_id=eq.${s.storeId}`,{method:'DELETE'});await audit(env,s,'cancel ConnectX SMS','connectx',id,{to_phone:x.to_phone,recipient_name:x.recipient_name,status:x.status});return json({ok:true})}
 if(path==='connectx/sms/queue'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);return json(await db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&status=eq.queued&select=*&order=created_at.asc&limit=50`))}
 if(path.match(/^connectx\/sms\/status\/[^/]+$/)&&method==='PATCH'){if(!s.storeId)return fail('Shop access required.',403);let id=path.split('/')[3];let b=await body(request),allowedStatus=['queued','sending','sent','failed'];if(b.status&&!allowedStatus.includes(b.status))return fail('Invalid SMS status',400);let patch={};if(b.status)patch.status=b.status;if(b.device_id)patch.device_id=b.device_id;if(b.attempts!==undefined)patch.attempts=Number(b.attempts);if(b.error_message!==undefined)patch.error_message=b.error_message;if(b.status==='sent')patch.sent_at=new Date().toISOString();let [upd]=await db(env,`connectx_sms_messages?id=eq.${id}&store_id=eq.${s.storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});return json(upd||{ok:true})}
 if(path==='connectx/sms/messages'&&method==='GET'){
  if(!s.storeId||!allowed(s,'connectx','view'))return fail('Permission denied.',403);
  let qs=new URL(request.url).searchParams,st=qs.get('status'),rec=qs.get('recipient_type'),filter=`store_id=eq.${s.storeId}`;
  if(st)filter+=`&status=eq.${encodeURIComponent(st)}`;
  if(rec)filter+=`&recipient_type=eq.${encodeURIComponent(rec)}`;
  let [msgs,invoices,returns,exchanges]=await Promise.all([
    db(env,`connectx_sms_messages?${filter}&select=*&order=created_at.desc&limit=250`),
    db(env,`invoices?store_id=eq.${s.storeId}&select=id,invoice_number,kind`).catch(()=>[]),
    db(env,`returns?store_id=eq.${s.storeId}&select=id,return_number`).catch(()=>[]),
    db(env,`exchanges?store_id=eq.${s.storeId}&select=id,exchange_number`).catch(()=>[])
  ]);
  let invMap=Object.fromEntries(invoices.map(x=>[x.id,x.invoice_number]));
  let retMap=Object.fromEntries(returns.map(x=>[x.id,x.return_number]));
  let excMap=Object.fromEntries(exchanges.map(x=>[x.id,x.exchange_number]));
  return json(msgs.map(m=>({
    ...m,
    invoice_number:invMap[m.invoice_id]||retMap[m.invoice_id]||excMap[m.invoice_id]||null
  })));
 }
 if(path==='connectx/sms/send'&&method==='POST'){
  if(!s.storeId||(!allowedAddon(s,'connectx','send')&&!allowed(s,'connectx','add')&&s.role!=='admin'&&!s.adminAccess))return fail('Permission denied.',403);
  let [smsSettings]=await db(env,`connectx_shop_sms_settings?store_id=eq.${s.storeId}&select=enabled`).catch(()=>[]);
  if(smsSettings&&smsSettings.enabled===false)return fail('SMS Gateway is disabled for this shop by the administrator.',403);
  let b=await body(request),toPhone=String(b.toPhone||b.to||'').trim(),cleanDigits=toPhone.replace(/[^0-9+]/g,'');
  if(!cleanDigits||cleanDigits.length<6)return fail('Valid recipient phone number is required.',400);
  let msgBody=String(b.messageBody||b.message||'').trim();
  if(!msgBody)return fail('SMS message body cannot be empty.',400);
  let entitlement=await connectxPlan(env,s.storeId);
  if(!entitlement)return fail('ConnectX is not available for this shop. Purchase a ConnectX add-on or an eligible license.',403);
  let today=new Date().toISOString().slice(0,10);
  let [usedToday]=await Promise.all([db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&status=in.(queued,sending,sent)&select=id`)]);
  let maxDaily=entitlement.connectx_daily_limit||100;
  if(usedToday.length>=maxDaily)return fail(`Your shop has reached its daily ConnectX SMS limit (${maxDaily}/day).`,429);
  let fiveSecAgo=new Date(Date.now()-5000).toISOString();
  let recentDup=await db(env,`connectx_sms_messages?store_id=eq.${s.storeId}&to_phone=eq.${encodeURIComponent(cleanDigits)}&created_at=gte.${fiveSecAgo}&select=id`);
  if(recentDup.length)return fail('Duplicate SMS detected. Please wait a few seconds before retrying.',409);
  let recType=['customer','supplier','staff','manual'].includes(b.recipientType)?b.recipientType:'customer';
  let [record]=await db(env,'connectx_sms_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:s.storeId,user_id:s.id,recipient_type:recType,recipient_id:b.recipientId||null,recipient_name:String(b.recipientName||'').trim()||null,to_phone:cleanDigits,message_type:String(b.messageType||'Custom Message').trim(),invoice_id:b.invoiceId||null,message_body:msgBody,status:'queued',attempts:0,created_at:new Date().toISOString()})});
  await audit(env,s,'queue ConnectX SMS','connectx',record.id,{to_phone:cleanDigits,recipient_name:record.recipient_name,message_type:record.message_type,invoice_id:record.invoice_id});
  return json({ok:true,id:record.id,status:'queued',message:'✓ SMS queued for ConnectX'},201);
 }
 if(path.match(/^connectx\/messages\/[^/]+$/)&&method==='DELETE'){if(!s.storeId||!allowed(s,'connectx','delete'))return fail('Permission denied.',403);let id=path.split('/')[2];let [x]=await db(env,`connectx_messages?id=eq.${id}&store_id=eq.${s.storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({shop_deleted_at:new Date().toISOString(),shop_deleted_by:s.id})});if(!x)return fail('Message not found.',404);await audit(env,s,'hide ConnectX history','connectx',id);return json({ok:true})}
 if(path==='connectx/messages'&&method==='GET'){if(!s.storeId||!allowed(s,'connectx','view'))return fail('Permission denied.',403);return json(await db(env,`connectx_messages?store_id=eq.${s.storeId}&shop_deleted_at=is.null&select=*&order=created_at.desc&limit=100`))}
 if(path==='connectx/send'&&method==='POST'){
  if(!s.storeId||!allowedAddon(s,'connectx','send'))return fail('Permission denied.',403);
  let b=await body(request),to=emailList(b.to),cc=emailList(b.cc),bcc=emailList(b.bcc);
  if(!to.length||![...to,...cc,...bcc].every(validEmail)||!String(b.subject||'').trim())return fail('Valid recipient email and subject are required.');
  let [cfg]=await db(env,'connectx_settings?select=*');
  if(!cfg?.enabled)return fail('ConnectX sending is not enabled by EMS Owner.',403);
  if(!env.BREVO_API_KEY&&env.MOCK_EMAIL!=='1')return fail('ConnectX provider is not configured. Contact EMS Owner.',503);
  let [shop]=await db(env,`stores?id=eq.${s.storeId}&select=name`);
  let senderName=shop?.name||cfg.from_name;
  let today=new Date().toISOString().slice(0,10),[globalUsed,shopUsed]=await Promise.all([
    db(env,`connectx_messages?created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id`),
    db(env,`connectx_messages?store_id=eq.${s.storeId}&created_at=gte.${today}T00:00:00Z&status=eq.sent&select=id`)
  ]);
  let entitlement=await connectxPlan(env,s.storeId);
  if(!entitlement)return fail('ConnectX is not available for this shop. Purchase a ConnectX add-on or an eligible license.',403);
  if(globalUsed.length>=cfg.global_daily_limit)return fail('ConnectX daily global email limit has been reached.',429);
  if(shopUsed.length>=entitlement.connectx_daily_limit)return fail('Your shop has reached its daily ConnectX email limit.',429);
  let html='<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55">'+safeText(b.body||'').replace(/\n/g,'<br>');
  if(b.documentType&&!b.invoiceId)return fail('Select a document before sending.',400);
  let attachedInvoiceId=null;
  if(b.invoiceId){
    let money=v=>Number(v||0).toLocaleString('en-BD',{minimumFractionDigits:2});
    let originUrl=new URL(request.url).origin;
    let tbPlan=await truebillPlan(env,s.storeId);
    let tbActive=!!tbPlan;
    if(b.documentType==='return'){
      let [ret]=await db(env,`returns?id=eq.${b.invoiceId}&store_id=eq.${s.storeId}&select=*,return_items(*,inventory_items(item_code,description,unit)),stores(name,address,phone,phone2,email,website)`);
      if(!ret)return fail('Selected return slip was not found in this shop.',404);
      attachedInvoiceId=ret.invoice_id||null;
      let [party]=ret.customer_id?await db(env,`customers?id=eq.${ret.customer_id}&select=*`):[];
      let [origInv]=ret.invoice_id?await db(env,`invoices?id=eq.${ret.invoice_id}&select=invoice_number`):[];
      let partyName=party?.name||ret.customer_name||'Customer',partyAddress=party?.address||'—',partyPhone=party?.phone||'—',partyCode=party?.customer_code||'—';
      let qrUrl=tbActive&&ret.verification_token?`${originUrl}/?verify=${ret.verification_token}`:'';
      html+='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #dddddd;font-family:Arial,sans-serif;color:#141414"><tr><td style="padding:20px;border-bottom:2px solid #111111"><table role="presentation" width="100%"><tr><td style="vertical-align:top"><b style="font-size:19px">'+safeText(ret.stores?.name||shop?.name||'')+'</b><br><span style="font-size:12px;color:#555">'+safeText(ret.stores?.address||'')+'<br>'+safeText(ret.stores?.phone||'')+'<br>'+safeText(ret.stores?.email||'')+'</span></td><td style="vertical-align:top;text-align:right"><b style="font-size:20px;color:#b91c1c">RETURN SLIP</b><br><span style="font-size:12px"># '+safeText(ret.return_number)+'</span><br><span style="display:inline-block;margin-top:8px;padding:4px 10px;background:#2e7d32;color:#ffffff;font-size:11px">REFUNDED</span></td></tr></table></td></tr><tr><td style="padding:20px"><table role="presentation" width="100%"><tr><td width="50%" style="vertical-align:top"><b style="font-size:11px">CUSTOMER</b><br><span style="font-size:12px;line-height:1.6">ID: '+safeText(partyCode)+'<br>Name: '+safeText(partyName)+'<br>Address: '+safeText(partyAddress)+'<br>Phone: '+safeText(partyPhone)+'</span></td><td width="50%" style="vertical-align:top"><b style="font-size:11px">RETURN DETAILS</b><br><span style="font-size:12px;line-height:1.6">Date: '+safeText(ret.return_date)+'<br>Original Invoice: '+(origInv?safeText(origInv.invoice_number):'—')+'<br>Refund Method: '+safeText(ret.payment_method||'Cash')+'<br>Reason: '+safeText(ret.reason||'Customer Return')+'</span></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse"><tr style="background:#111111;color:#ffffff"><th style="padding:8px;text-align:left;font-size:11px">RETURNED ITEM</th><th style="padding:8px;font-size:11px">CONDITION</th><th style="padding:8px;font-size:11px">QTY</th><th style="padding:8px;font-size:11px">UNIT PRICE</th><th style="padding:8px;text-align:right;font-size:11px">TOTAL</th></tr>'+(ret.return_items||[]).map(x=>'<tr><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px">'+safeText(x.inventory_items?.description||'Item')+'<br><span style="font-size:10px;color:#777">'+safeText(x.inventory_items?.item_code||'')+'</span></td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center"><span style="text-transform:capitalize">'+safeText(x.condition||'sellable')+'</span></td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+safeText(x.quantity)+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+money(x.unit_price)+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:right">'+money(x.total_amount||x.line_total)+'</td></tr>').join('')+'</table><table role="presentation" align="right" width="280" style="margin-top:18px"><tr><td style="padding:4px;font-size:12px">Subtotal</td><td style="padding:4px;text-align:right;font-size:12px">'+money(ret.subtotal||ret.total_return_amount)+'</td></tr>'+(Number(ret.penalty_amount||0)?'<tr><td style="padding:4px;font-size:12px">Deduction / Fee</td><td style="padding:4px;text-align:right;font-size:12px">−'+money(ret.penalty_amount)+'</td></tr>':'')+'<tr><td style="padding:9px 4px;border-top:1px solid #111;font-size:15px"><b>Refunded Amount</b></td><td style="padding:9px 4px;border-top:1px solid #111;text-align:right;font-size:15px;color:#2e7d32"><b>'+money(ret.refunded_amount||ret.total_return_amount)+'</b></td></tr></table><div style="clear:both"></div>'+(qrUrl?'<div style="margin-top:16px;padding-top:12px;border-top:1px dashed #ccc;font-size:11px;color:#666">TrueBill Digital Verification: <a href="'+qrUrl+'" target="_blank" style="color:#0284c7">Verify Online</a></div>':'')+'</td></tr></table>';
    }else if(b.documentType==='exchange'){
      let [exc]=await db(env,`exchanges?id=eq.${b.invoiceId}&store_id=eq.${s.storeId}&select=*,exchange_items(*,inventory_items(item_code,description,unit)),stores(name,address,phone,phone2,email,website)`);
      if(!exc)return fail('Selected exchange slip was not found in this shop.',404);
      attachedInvoiceId=exc.invoice_id||null;
      let [party]=exc.customer_id?await db(env,`customers?id=eq.${exc.customer_id}&select=*`):[];
      let [origInv]=exc.invoice_id?await db(env,`invoices?id=eq.${exc.invoice_id}&select=invoice_number`):[];
      let partyName=party?.name||exc.customer_name||'Customer',partyAddress=party?.address||'—',partyPhone=party?.phone||'—',partyCode=party?.customer_code||'—';
      let qrUrl=tbActive&&exc.verification_token?`${originUrl}/?verify=${exc.verification_token}`:'';
      let actionBadge=exc.action_type==='customer_pays'?'CUSTOMER PAID':exc.action_type==='shop_refunds'?'STORE REFUNDED':'EVEN EXCHANGE';
      let badgeColor=exc.action_type==='shop_refunds'?'#2e7d32':exc.action_type==='customer_pays'?'#0284c7':'#4b5563';
      let retItems=(exc.exchange_items||[]).filter(x=>x.item_type==='returned');
      let newItems=(exc.exchange_items||[]).filter(x=>x.item_type==='new');
      html+='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #dddddd;font-family:Arial,sans-serif;color:#141414"><tr><td style="padding:20px;border-bottom:2px solid #111111"><table role="presentation" width="100%"><tr><td style="vertical-align:top"><b style="font-size:19px">'+safeText(exc.stores?.name||shop?.name||'')+'</b><br><span style="font-size:12px;color:#555">'+safeText(exc.stores?.address||'')+'<br>'+safeText(exc.stores?.phone||'')+'<br>'+safeText(exc.stores?.email||'')+'</span></td><td style="vertical-align:top;text-align:right"><b style="font-size:20px;color:#d97706">EXCHANGE SLIP</b><br><span style="font-size:12px"># '+safeText(exc.exchange_number)+'</span><br><span style="display:inline-block;margin-top:8px;padding:4px 10px;background:'+badgeColor+';color:#ffffff;font-size:11px">'+actionBadge+'</span></td></tr></table></td></tr><tr><td style="padding:20px"><table role="presentation" width="100%"><tr><td width="50%" style="vertical-align:top"><b style="font-size:11px">CUSTOMER</b><br><span style="font-size:12px;line-height:1.6">ID: '+safeText(partyCode)+'<br>Name: '+safeText(partyName)+'<br>Address: '+safeText(partyAddress)+'<br>Phone: '+safeText(partyPhone)+'</span></td><td width="50%" style="vertical-align:top"><b style="font-size:11px">EXCHANGE DETAILS</b><br><span style="font-size:12px;line-height:1.6">Date: '+safeText(exc.exchange_date)+'<br>Original Invoice: '+(origInv?safeText(origInv.invoice_number):'—')+'<br>Settlement: '+safeText(exc.payment_method||'Cash')+'<br>Notes: '+safeText(exc.notes||'—')+'</span></td></tr></table>'+
      '<div style="margin-top:14px;font-weight:bold;font-size:12px;color:#b91c1c">RETURNED ITEMS</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:collapse"><tr style="background:#fef2f2;color:#991b1b"><th style="padding:6px 8px;text-align:left;font-size:11px">ITEM</th><th style="padding:6px 8px;font-size:11px">CONDITION</th><th style="padding:6px 8px;font-size:11px">QTY</th><th style="padding:6px 8px;font-size:11px">UNIT PRICE</th><th style="padding:6px 8px;text-align:right;font-size:11px">TOTAL</th></tr>'+retItems.map(x=>'<tr><td style="padding:6px 8px;border-bottom:1px solid #fee2e2;font-size:12px">'+safeText(x.inventory_items?.description||'Item')+'</td><td style="padding:6px 8px;border-bottom:1px solid #fee2e2;font-size:12px;text-align:center"><span style="text-transform:capitalize">'+safeText(x.condition||'sellable')+'</span></td><td style="padding:6px 8px;border-bottom:1px solid #fee2e2;font-size:12px;text-align:center">'+safeText(x.quantity)+'</td><td style="padding:6px 8px;border-bottom:1px solid #fee2e2;font-size:12px;text-align:center">'+money(x.unit_price)+'</td><td style="padding:6px 8px;border-bottom:1px solid #fee2e2;font-size:12px;text-align:right">'+money(x.total_amount)+'</td></tr>').join('')+'</table>'+
      '<div style="margin-top:14px;font-weight:bold;font-size:12px;color:#047857">NEW / REPLACEMENT ITEMS</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:collapse"><tr style="background:#ecfdf5;color:#065f46"><th style="padding:6px 8px;text-align:left;font-size:11px">ITEM</th><th style="padding:6px 8px;font-size:11px">QTY</th><th style="padding:6px 8px;font-size:11px">UNIT PRICE</th><th style="padding:6px 8px;text-align:right;font-size:11px">TOTAL</th></tr>'+newItems.map(x=>'<tr><td style="padding:6px 8px;border-bottom:1px solid #d1fae5;font-size:12px">'+safeText(x.inventory_items?.description||'Item')+'</td><td style="padding:6px 8px;border-bottom:1px solid #d1fae5;font-size:12px;text-align:center">'+safeText(x.quantity)+'</td><td style="padding:6px 8px;border-bottom:1px solid #d1fae5;font-size:12px;text-align:center">'+money(x.unit_price)+'</td><td style="padding:6px 8px;border-bottom:1px solid #d1fae5;font-size:12px;text-align:right">'+money(x.total_amount)+'</td></tr>').join('')+'</table>'+
      '<table role="presentation" align="right" width="280" style="margin-top:18px"><tr><td style="padding:4px;font-size:12px">Returned Items Total</td><td style="padding:4px;text-align:right;font-size:12px">'+money(exc.returned_total)+'</td></tr><tr><td style="padding:4px;font-size:12px">New Items Total</td><td style="padding:4px;text-align:right;font-size:12px">'+money(exc.new_items_total)+'</td></tr><tr><td style="padding:9px 4px;border-top:1px solid #111;font-size:15px"><b>Settlement ('+actionBadge+')</b></td><td style="padding:9px 4px;border-top:1px solid #111;text-align:right;font-size:15px"><b>'+money(exc.difference_amount)+'</b></td></tr></table><div style="clear:both"></div>'+(qrUrl?'<div style="margin-top:16px;padding-top:12px;border-top:1px dashed #ccc;font-size:11px;color:#666">TrueBill Digital Verification: <a href="'+qrUrl+'" target="_blank" style="color:#0284c7">'+qrUrl+'</a></div>':'')+'</td></tr></table>';
    }else{
      let [inv]=await db(env,`invoices?id=eq.${b.invoiceId}&store_id=eq.${s.storeId}&select=*,invoice_lines(*,inventory_items(item_code,description,unit)),stores(name,address,phone,phone2,email,website)`);
      if(!inv)return fail('Selected invoice was not found in this shop.',404);
      attachedInvoiceId=inv.id;
      let partyTable=inv.kind==='sale'?'customers':'suppliers',[party]=inv.party_id?await db(env,`${partyTable}?id=eq.${inv.party_id}&select=*`):[],partyName=party?.name||inv.custom_party_name||'—',partyAddress=party?.address||inv.custom_party_address||'—',partyPhone=party?.phone||inv.custom_party_phone||'—',partyCode=party?.customer_code||party?.supplier_code||(inv.custom_party_name?'Custom customer':'—');
      html+='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #dddddd;font-family:Arial,sans-serif;color:#141414"><tr><td style="padding:20px;border-bottom:2px solid #111111"><table role="presentation" width="100%"><tr><td style="vertical-align:top"><b style="font-size:19px">'+safeText(inv.stores.name)+'</b><br><span style="font-size:12px;color:#555">'+safeText(inv.stores.address||'')+'<br>'+safeText(inv.stores.phone||'')+'<br>'+safeText(inv.stores.email||'')+'</span></td><td style="vertical-align:top;text-align:right"><b style="font-size:20px">'+safeText(inv.kind==='sale'?'SALES INVOICE':'PURCHASE INVOICE')+'</b><br><span style="font-size:12px"># '+safeText(inv.invoice_number)+'</span><br><span style="display:inline-block;margin-top:8px;padding:4px 10px;background:'+(Number(inv.total_due)<=0?'#2e7d32':'#b7791f')+';color:#ffffff;font-size:11px">'+(Number(inv.total_due)<=0?'PAID':'DUE')+'</span></td></tr></table></td></tr><tr><td style="padding:20px"><table role="presentation" width="100%"><tr><td width="50%" style="vertical-align:top"><b style="font-size:11px">'+safeText(inv.kind==='sale'?'BILL TO':'SUPPLIER')+'</b><br><span style="font-size:12px;line-height:1.6">ID: '+safeText(partyCode)+'<br>Name: '+safeText(partyName)+'<br>Address: '+safeText(partyAddress)+'<br>Phone: '+safeText(partyPhone)+'</span></td><td width="50%" style="vertical-align:top"><b style="font-size:11px">INVOICE DETAILS</b><br><span style="font-size:12px;line-height:1.6">Date: '+safeText(inv.invoice_date)+'<br>Payment: '+safeText(inv.payment_method)+'<br>Transaction: '+safeText(inv.transaction_id||'—')+'</span></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse"><tr style="background:#111111;color:#ffffff"><th style="padding:8px;text-align:left;font-size:11px">ITEM</th><th style="padding:8px;font-size:11px">QTY</th><th style="padding:8px;font-size:11px">UNIT</th><th style="padding:8px;font-size:11px">UNIT PRICE</th><th style="padding:8px;font-size:11px">VAT</th><th style="padding:8px;font-size:11px">DISC.</th><th style="padding:8px;text-align:right;font-size:11px">TOTAL</th></tr>'+inv.invoice_lines.map(x=>'<tr><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px">'+safeText(x.inventory_items?.description||'Item')+'<br><span style="font-size:10px;color:#777">'+safeText(x.inventory_items?.item_code||'')+'</span></td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+safeText(x.quantity)+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+safeText(x.inventory_items?.unit||'')+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+money(x.unit_price)+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+(Number(x.tax_percent||0)?money(Math.round(Number(x.quantity)*Number(x.unit_price)*Number(x.tax_percent)/100*100)/100):'—')+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">'+(Number(x.discount||0)?'−'+money(x.discount):'—')+'</td><td style="padding:8px;border-bottom:1px solid #ddd;font-size:12px;text-align:right">'+money(x.line_total)+'</td></tr>').join('')+'</table><table role="presentation" align="right" width="280" style="margin-top:18px"><tr><td style="padding:4px;font-size:12px">Subtotal</td><td style="padding:4px;text-align:right;font-size:12px">'+money(inv.subtotal)+'</td></tr>'+(Number(inv.line_tax_amount||0)?'<tr><td style="padding:4px;font-size:12px">Item VAT</td><td style="padding:4px;text-align:right;font-size:12px">+'+money(inv.line_tax_amount)+'</td></tr>':'')+'<tr><td style="padding:4px;font-size:12px">Tax</td><td style="padding:4px;text-align:right;font-size:12px">'+money(inv.tax_amount)+'</td></tr><tr><td style="padding:4px;font-size:12px">Discount</td><td style="padding:4px;text-align:right;font-size:12px">−'+money(inv.discount)+'</td></tr>'+(Number(inv.line_discount_amount||0)?'<tr><td style="padding:4px;font-size:12px">Item discount</td><td style="padding:4px;text-align:right;font-size:12px">−'+money(inv.line_discount_amount)+'</td></tr>':'')+'<tr><td style="padding:4px;font-size:12px">Paid Amount</td><td style="padding:4px;text-align:right;font-size:12px">−'+money(inv.paid_amount)+'</td></tr><tr><td style="padding:9px 4px;border-top:1px solid #111;font-size:15px"><b>Total Due</b></td><td style="padding:9px 4px;border-top:1px solid #111;text-align:right;font-size:15px"><b>'+money(inv.total_due)+'</b></td></tr></table><div style="clear:both"></div></td></tr></table>';
    }
  }
  html+='</div>';
  let [msg]=await db(env,'connectx_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:s.storeId,user_id:s.id,recipient_type:b.recipientType||'manual',recipient_id:b.recipientId||null,invoice_id:attachedInvoiceId,from_email:cfg.from_email,to_emails:to,cc_emails:cc,bcc_emails:bcc,subject:String(b.subject).trim(),custom_body:String(b.body||''),body_html:html,provider:'brevo_api',status:'sending'})});
  let out={messageId:'mock-msg-'+Date.now()};
  if(env.MOCK_EMAIL!=='1'){
    let res;
    try{
      res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{name:senderName,email:cfg.from_email},replyTo:cfg.reply_to?{email:cfg.reply_to}:undefined,to:to.map(email=>({email})),...(cc.length?{cc:cc.map(email=>({email}))}:{}),...(bcc.length?{bcc:bcc.map(email=>({email}))}:{}),subject:msg.subject,htmlContent:html})});
    }catch{
      // A timeout may happen *after* the provider accepts a message. Never
      // leave "sending" forever or tell the shop to blindly resend it.
      await db(env,`connectx_messages?id=eq.${msg.id}&store_id=eq.${s.storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'failed',error_message:'Provider delivery unconfirmed. It may have been sent; check the recipient before retrying.'})});
      return fail('Email delivery unconfirmed. Check the recipient before retrying.',502)
    }
    out=await res.json().catch(()=>({}));
    if(!res.ok){await db(env,`connectx_messages?id=eq.${msg.id}&store_id=eq.${s.storeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'failed',error_message:String(out.message||'Provider rejected message').slice(0,400)})});return fail('Email could not be sent. Please try again later.',502)}
  }
  await db(env,`connectx_messages?id=eq.${msg.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'sent',provider_message_id:out.messageId||null,sent_at:new Date().toISOString()})});
  await audit(env,s,'send ConnectX email','connectx',msg.id,{to,documentType:b.documentType||null,invoiceId:b.invoiceId||null});
  return json({ok:true,id:msg.id},201)
 }
 if(path==='due'){
  if(!s.storeId)return fail('Shop access required.',403);
  let qs=new URL(request.url).searchParams,type=qs.get('type')||'sale',id=s.storeId;
  if(method==='GET'){
    if(qs.get('history')==='1'){
      if(!allowed(s,'due_recover','view'))return fail('Permission denied.',403);
      let rows=await db(env,`due_recoveries?store_id=eq.${id}&select=*&order=created_at.desc&limit=300`);
      let invIds=rows.filter(r=>r.source_type!=='expense').map(r=>r.source_id).filter(Boolean), expIds=rows.filter(r=>r.source_type==='expense').map(r=>r.source_id).filter(Boolean);
      const uniq=a=>[...new Set(a)];
      let invoices=uniq(invIds).length?await db(env,`invoices?id=in.(${uniq(invIds).join(',')})&store_id=eq.${id}&select=id,kind,invoice_number,invoice_date,party_id,custom_party_name,subtotal,paid_amount,total_due`):[];
      let expenses=uniq(expIds).length?await db(env,`expenses?id=in.(${uniq(expIds).join(',')})&store_id=eq.${id}&select=id,expense_code,expense_date,details,total,paid,due`):[];
      let staffIds=uniq(rows.map(r=>r.recovered_by).filter(Boolean)), staff=staffIds.length?await db(env,`staff?id=in.(${staffIds.join(',')})&store_id=eq.${id}&select=id,user_id,full_name`):[];
      let custIds=uniq(invoices.filter(x=>x.kind==='sale'&&x.party_id).map(x=>x.party_id)), supIds=uniq(invoices.filter(x=>x.kind==='purchase'&&x.party_id).map(x=>x.party_id));
      let customers=custIds.length?await db(env,`customers?id=in.(${custIds.join(',')})&store_id=eq.${id}&select=id,name`):[], suppliers=supIds.length?await db(env,`suppliers?id=in.(${supIds.join(',')})&store_id=eq.${id}&select=id,name`):[];
      let invMap=Object.fromEntries(invoices.map(x=>[x.id,x])), expMap=Object.fromEntries(expenses.map(x=>[x.id,x])), staffMap=Object.fromEntries(staff.map(x=>[x.id,x])), custMap=Object.fromEntries(customers.map(x=>[x.id,x])), supMap=Object.fromEntries(suppliers.map(x=>[x.id,x]));
      return json(rows.map(r=>{let src=r.source_type==='expense'?expMap[r.source_id]:invMap[r.source_id], user=staffMap[r.recovered_by];let party=null;if(src){party=r.source_type==='expense'?src.details:(src.kind==='purchase'?(supMap[src.party_id]?.name):(custMap[src.party_id]?.name||src.custom_party_name));}return {...r,source_reference:src?(r.source_type==='expense'?src.expense_code:src.invoice_number):null,source_date:src?(r.source_type==='expense'?src.expense_date:src.invoice_date):null,source_details:src?(r.source_type==='expense'?src.details:null):null,party_name:party,total:src?(r.source_type==='expense'?src.total:src.subtotal):null,paid:src?(r.source_type==='expense'?src.paid:src.paid_amount):null,remaining_due:src?Number(r.source_type==='expense'?src.due:src.total_due):null,recovered_by_user:user?(user.user_id||user.full_name):'Administrator'}}));
    }
    if(!allowed(s,'due_recover','view'))return fail('Permission denied.',403);
    if(type==='expense')return json(await db(env,`expenses?store_id=eq.${id}&due=gt.0&select=*&order=expense_date.asc`));
    if(!['sale','purchase'].includes(type))return fail('Invalid due type.');
    return json(await db(env,`invoices?store_id=eq.${id}&kind=eq.${type}&total_due=gt.0&select=*,invoice_lines(*,inventory_items(item_code,description,unit))&order=invoice_date.asc`))
  }
  if(method==='POST'){
    if(!allowed(s,'due_recover','add'))return fail('Permission denied.',403);
    let b=await body(request),amount=Math.round(Number(b.amount)*100)/100;
    if(!['sale','purchase','expense'].includes(b.sourceType)||!b.sourceId||!amount||amount<=0)return fail('A valid source and recovery amount are required.');
    let table=b.sourceType==='expense'?'expenses':'invoices',[source]=await db(env,`${table}?id=eq.${b.sourceId}&store_id=eq.${id}&select=*`);
    if(!source)return fail('Due source not found.',404);
    if(b.sourceType==='expense'){
      let due=Math.round(Number(source.due)*100)/100;
      if(amount>due)return fail('Recovery amount cannot exceed the outstanding due.',400);
      await db(env,`expenses?id=eq.${source.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({paid:Math.round((Number(source.paid)+amount)*100)/100})});
      let [upd]=await db(env,`expenses?id=eq.${source.id}&select=*`);
      let [r]=await db(env,'due_recoveries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store_id:id,source_type:b.sourceType,source_id:b.sourceId,amount,note:b.note||null,recovered_by:s.id})});
      await audit(env,s,'recover due','expense',b.sourceId,{amount,code:source.expense_code||('EXP-'+shortId(source.id)),total:source.total});
      return json({...r,remaining_due:upd?Math.round(Number(upd.due)*100)/100:Math.round((due-amount)*100)/100},201)
    }
    /* sale / purchase — optional tax & discount adjustment plus payment details.
       The remaining due is always recomputed from the invoice's own numbers
       (subtotal + tax - discount - paid) so a partial recovery keeps the
       invoice visible in the due list with its true outstanding balance. */
    let subtotal=Number(source.subtotal||0),
        taxPercent=(b.taxPercent!=null&&b.taxPercent!=='')?Number(b.taxPercent):Number(source.tax_percent||0),
        discount=(b.discount!=null&&b.discount!=='')?Number(b.discount):Number(source.discount||0);
    if(Number.isNaN(taxPercent)||taxPercent<0||taxPercent>100)return fail('New tax percent must be between 0 and 100.',400);
    if(Number.isNaN(discount)||discount<0)return fail('New discount cannot be negative.',400);
    let taxAmount=Math.round(subtotal*taxPercent)/100,
        grand=Math.round((subtotal+taxAmount-discount)*100)/100;
    if(grand<0)return fail('New discount cannot exceed the invoice subtotal plus tax.',400);
    let paidBefore=Math.round(Number(source.paid_amount||0)*100)/100;
    if(paidBefore>grand)return fail('The new tax/discount would make the invoice total lower than the amount already paid.',400);
    let dueNow=Math.round((grand-paidBefore)*100)/100;
    if(amount>dueNow)return fail('Recovery amount cannot exceed the outstanding due ('+dueNow.toFixed(2)+').',400);
    let newPaid=Math.round((paidBefore+amount)*100)/100,
        newDue=Math.max(0,Math.round((grand-newPaid)*100)/100);
    await db(env,`invoices?id=eq.${source.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({paid_amount:newPaid,total_due:newDue,tax_percent:taxPercent,discount:discount,tax_amount:taxAmount})});
    let payCols=await duePayCols(env),
        recBody={store_id:id,source_type:b.sourceType,source_id:b.sourceId,amount,note:b.note||null,recovered_by:s.id};
    if(payCols){recBody.payment_method=['cash','bkash','nagad','bank','other'].includes(b.paymentMethod)?b.paymentMethod:null;recBody.transaction_id=b.transactionId?String(b.transactionId).slice(0,120):null}
    let [r]=await db(env,'due_recoveries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(recBody)});
    await audit(env,s,'recover due',b.sourceType+' invoice',b.sourceId,{amount,code:source.invoice_number,invoice_number:source.invoice_number,taxPercent,discount,paymentMethod:recBody.payment_method||null});
    if(b.sourceType==='sale'){try{await enqueueAutoSms(env,s,'PAYMENT',source,{phone:source.custom_party_phone,name:source.custom_party_name,partyId:source.party_id,invoiceNumber:source.invoice_number,amount,due:newDue,paid:newPaid,invoiceId:source.id,sourceId:r.id,idempotencyKey:'PAYMENT:'+r.id})}catch(e){console.error('ConnectX SMS queue',e)}}
    return json({...r,remaining_due:newDue},201)
  }
 }
 if(path==='dashboard/activity-snapshot'){let id=s.storeId;if(!id)return fail('Shop access required.',403);let since=new Date(Date.now()-86400000).toISOString(),[invoices,expenses,inventory,logs,staffs,recentReturns,recentExchanges]=await Promise.all([db(env,`invoices?store_id=eq.${id}&created_at=gte.${since}&select=kind,invoice_number,subtotal,paid_amount,total_due,created_at,created_by`),db(env,`expenses?store_id=eq.${id}&created_at=gte.${since}&select=id,total,paid,due,created_at,created_by`),db(env,`inventory_items?store_id=eq.${id}&select=id,item_code`),db(env,`activity_logs?store_id=eq.${id}&created_at=gte.${since}&entity_type=eq.inventory&select=action,entity_id,actor_id,created_at`),db(env,`staff?store_id=eq.${id}&select=id,user_id`),db(env,`returns?store_id=eq.${id}&created_at=gte.${since}&select=return_number,total_return_amount,refunded_amount,created_at,created_by`).catch(()=>[]),db(env,`exchanges?store_id=eq.${id}&created_at=gte.${since}&select=exchange_number,new_items_total,difference_amount,created_at,created_by`).catch(()=>[])]);let users=Object.fromEntries(staffs.map(x=>[x.id,x.user_id])),items=Object.fromEntries(inventory.map(x=>[x.id,x.item_code]));let snapshots=[...invoices.map(x=>({label:x.kind==='sale'?'Sale':'Purchase',id:x.invoice_number,total:x.subtotal,paid:x.paid_amount,due:x.total_due,submittedBy:users[x.created_by]||'Administrator',createdAt:x.created_at})),...recentReturns.map(x=>({label:'Return',id:x.return_number,total:x.total_return_amount,paid:x.refunded_amount,due:0,submittedBy:users[x.created_by]||'Administrator',createdAt:x.created_at})),...recentExchanges.map(x=>({label:'Exchange',id:x.exchange_number,total:x.new_items_total,paid:x.new_items_total,due:x.difference_amount,submittedBy:users[x.created_by]||'Administrator',createdAt:x.created_at})),...expenses.map(x=>({label:'Expense',id:'EXP-'+shortId(x.id),total:x.total,paid:x.paid,due:x.due,submittedBy:users[x.created_by]||'Administrator',createdAt:x.created_at})),...logs.filter(x=>items[x.entity_id]).map(x=>({label:'Inventory',id:items[x.entity_id],total:'—',paid:'—',due:'—',submittedBy:users[x.actor_id]||'Administrator',createdAt:x.created_at}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));return json(snapshots)}
 if(path==='dashboard'){
  let id=s.storeId;if(!id)return fail('Choose a store.',400);
  let [store]=await db(env,`stores?id=eq.${id}&select=low_stock_threshold`);
  let [sales,purchase,expense,returnsList,exchangesList,salariesList,low,recent]=await Promise.all([
    db(env,`invoices?store_id=eq.${id}&kind=eq.sale&select=subtotal,total_due,invoice_date`),
    db(env,`invoices?store_id=eq.${id}&kind=eq.purchase&select=subtotal,invoice_date`),
    db(env,`expenses?store_id=eq.${id}&select=total,expense_date`),
    db(env,`returns?store_id=eq.${id}&select=total_return_amount,refunded_amount,return_date`).catch(()=>[]),
    db(env,`exchanges?store_id=eq.${id}&select=returned_total,new_items_total,difference_amount,action_type,exchange_date`).catch(()=>[]),
    db(env,`staff_salary_invoices?store_id=eq.${id}&select=total,paid,due,created_at`).catch(()=>[]),
    db(env,`inventory_items?store_id=eq.${id}&active=is.true&select=*&total_stock=lte.${store.low_stock_threshold}`),
    db(env,`activity_logs?store_id=eq.${id}&select=*&order=created_at.desc&limit=10`)
  ]);
  let sum=a=>a.reduce((x,y)=>x+Number(y.subtotal??y.total??0),0),
      due=a=>a.reduce((x,y)=>x+Number(y.total_due??y.due??0),0),
      today=new Date().toISOString().slice(0,10);

  let returnSum=a=>a.reduce((x,y)=>x+Number(y.total_return_amount||0),0);
  let refundSum=a=>a.reduce((x,y)=>x+Number(y.refunded_amount||0),0);
  let exchangeSum=a=>a.reduce((x,y)=>x+Number(y.new_items_total||0),0);
  let salarySum=a=>a.reduce((x,y)=>x+Number(y.paid||y.total||0),0);

  return json({
    sales:{lifetime:sum(sales),today:sum(sales.filter(x=>x.invoice_date===today)),dueLifetime:due(sales),dueToday:due(sales.filter(x=>x.invoice_date===today))},
    purchase:{lifetime:sum(purchase),today:sum(purchase.filter(x=>x.invoice_date===today))},
    expense:{lifetime:sum(expense),today:sum(expense.filter(x=>x.expense_date===today))},
    returns:{lifetime:returnSum(returnsList),today:returnSum(returnsList.filter(x=>x.return_date===today)),countLifetime:returnsList.length,countToday:returnsList.filter(x=>x.return_date===today).length},
    refunds:{lifetime:refundSum(returnsList),today:refundSum(returnsList.filter(x=>x.return_date===today))},
    exchanges:{lifetime:exchangeSum(exchangesList),today:exchangeSum(exchangesList.filter(x=>x.exchange_date===today)),countLifetime:exchangesList.length,countToday:exchangesList.filter(x=>x.exchange_date===today).length},
    salary:{lifetime:salarySum(salariesList),today:salarySum(salariesList.filter(x=>String(x.created_at||'').slice(0,10)===today))},
    lowStock:low,
    recent
  });
 }


 /* Notifications — SHOP scope only: stock, overdue invoices/expenses, business health. Never administrator-panel items. */
 if(path==='notifications/shop'&&method==='GET'){
  if(!s.storeId)return fail('Shop access required.',403);
  let id=s.storeId, today=new Date();
  let cutoff=new Date(today);cutoff.setDate(cutoff.getDate()-30);let isoCut=cutoff.toISOString().slice(0,10);
  let [thresholdRow]=await db(env,`stores?id=eq.${id}&select=low_stock_threshold,name`);
  let lowThreshold=Number(thresholdRow?.low_stock_threshold??5);
  let [items,overdueInvoices,overdueExpenses,health,customers,suppliers]=await Promise.all([
   db(env,`inventory_items?store_id=eq.${id}&active=is.true&total_stock=lte.${lowThreshold}&select=id,item_code,description,total_stock,unit&order=total_stock.asc&limit=100`).catch(()=>[]),
   db(env,`invoices?store_id=eq.${id}&total_due=gt.0&invoice_date=lte.${isoCut}&select=id,kind,invoice_number,invoice_date,party_id,custom_party_name,total_due,paid_amount,subtotal&order=invoice_date.asc&limit=200`).catch(()=>[]),
   db(env,`expenses?store_id=eq.${id}&due=gt.0&expense_date=lte.${isoCut}&select=id,expense_code,expense_date,details,total,paid,due&order=expense_date.asc&limit=200`).catch(()=>[]),
   db(env,`business_health_reports?store_id=eq.${id}&select=id,score,insights,created_at&order=created_at.desc&limit=1`).catch(()=>[]),
   db(env,`customers?store_id=eq.${id}&select=id,name`).catch(()=>[]),
   db(env,`suppliers?store_id=eq.${id}&select=id,name`).catch(()=>[])
  ]);
  let notes=[], at=new Date().toISOString();
  let out=items.filter(x=>Number(x.total_stock)<=0), low=items.filter(x=>Number(x.total_stock)>0);
  if(out.length)notes.push({key:'stock-out',level:'critical',icon:'package',title:out.length+' item'+(out.length>1?'s are':' is')+' out of stock',detail:out.slice(0,5).map(x=>x.description||x.item_code).join(', ')+(out.length>5?' and '+(out.length-5)+' more':''),goto:'inventory',at});
  if(low.length)notes.push({key:'low-stock',level:'warning',icon:'package',title:low.length+' low-stock item'+(low.length>1?'s':''),detail:low.slice(0,5).map(x=>(x.description||x.item_code)+' ('+x.total_stock+' '+(x.unit||'')+')').join(', ')+(low.length>5?' and '+(low.length-5)+' more':''),goto:'inventory',at});
  let custMap=Object.fromEntries(customers.map(x=>[x.id,x.name])), supMap=Object.fromEntries(suppliers.map(x=>[x.id,x.name]));
  let overdueSales=overdueInvoices.filter(x=>x.kind==='sale'), overduePurchases=overdueInvoices.filter(x=>x.kind==='purchase');
  let bd=new Intl.NumberFormat('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(overdueSales.length){
   let total=overdueSales.reduce((n,x)=>n+Number(x.total_due||0),0);
   notes.push({key:'overdue-sales',level:'warning',icon:'coins',title:overdueSales.length+' customer invoice'+(overdueSales.length>1?'s are':' is')+' overdue by 30+ days',detail:'৳ '+bd.format(total)+' due · '+overdueSales.slice(0,4).map(x=>(custMap[x.party_id]||x.custom_party_name||x.invoice_number)).join(', ')+(overdueSales.length>4?' …':''),goto:'due-recover',at});
  }
  if(overduePurchases.length){
   let total=overduePurchases.reduce((n,x)=>n+Number(x.total_due||0),0);
   notes.push({key:'overdue-purchases',level:'warning',icon:'cart',title:overduePurchases.length+' supplier bill'+(overduePurchases.length>1?'s are':' is')+' overdue by 30+ days',detail:'৳ '+bd.format(total)+' payable · '+overduePurchases.slice(0,4).map(x=>(supMap[x.party_id]||x.invoice_number)).join(', ')+(overduePurchases.length>4?' …':''),goto:'due-recover',at});
  }
  if(overdueExpenses.length){
   let total=overdueExpenses.reduce((n,x)=>n+Number(x.due||0),0);
   notes.push({key:'overdue-expenses',level:'info',icon:'wallet',title:overdueExpenses.length+' expense'+(overdueExpenses.length>1?'s are':' is')+' unpaid after 30+ days',detail:'৳ '+bd.format(total)+' due · '+overdueExpenses.slice(0,4).map(x=>x.details||x.expense_code).join(', ')+(overdueExpenses.length>4?' …':''),goto:'expense',at});
  }
  let h=health[0];
  if(h&&Number(h.score)<60)notes.push({key:'business-health',level:h.score<40?'critical':'warning',icon:'chart',title:'Business health score is low ('+h.score+'/100)',detail:'Open the Business AI Health report for practical recommendations.',goto:'report',at:h.created_at});
  let order={critical:0,warning:1,info:2};
  notes.sort((a,b)=>order[a.level]-order[b.level]);
  return json({items:notes,counts:{critical:notes.filter(x=>x.level==='critical').length,warning:notes.filter(x=>x.level==='warning').length,info:notes.filter(x=>x.level==='info').length},generatedAt:at});
 }
 /* Notifications — ADMIN scope only: license, add-ons, shop capacity, helpdesk. Never store-operational items. */
 if(path==='notifications/admin'&&method==='GET'){
  if(s.role!=='admin')return fail('Forbidden',403);
  let notes=[], now=new Date(), isoNow=now.toISOString(), in14=new Date(now);in14.setDate(in14.getDate()+14);let in7=new Date(now);in7.setDate(in7.getDate()+7);
  let [ent,licenses,stores,unreadHelp,addons]=await Promise.all([
   currentEntitlement(env,s.id),
   db(env,`licenses?admin_id=eq.${s.id}&select=id,status,amount,duration_months,transaction_type,starts_at,expires_at,review_note,created_at&order=created_at.desc&limit=50`),
   db(env,`stores?admin_id=eq.${s.id}&select=id,shop_code,name,status,created_at`),
   db(env,`helpdesk_messages?admin_id=eq.${s.id}&sender_type=eq.owner&read_by_admin=eq.false&select=id,content,created_at&order=created_at.desc&limit=5`),
   db(env,`addon_purchases?admin_id=eq.${s.id}&select=id,addon_key,status,validity_days,daily_limit,amount,review_note,starts_at,expires_at,created_at&order=created_at.desc&limit=50`)
  ]);
  let pendingLic=licenses.filter(x=>x.status==='pending'), rejectedLic=licenses.filter(x=>x.status==='rejected').slice(0,3);
  let everLicensed=licenses.length>0;
  if(!ent){
   notes.push({key:'license-inactive',level:'critical',icon:'shield',title:everLicensed?'No active license':'No active license yet',detail:everLicensed?'Your license has expired or is not active. Shops are in read-only mode until a license is activated.':'Activate a license plan to start using your shops.',goto:'licenses',at:licenses[0]?.expires_at||isoNow});
  }else if(ent.expires_at && new Date(ent.expires_at)<=in14){
   let days=Math.max(0,Math.ceil((new Date(ent.expires_at)-now)/86400000));
   notes.push({key:'license-expiring',level:'warning',icon:'shield',title:'License expires in '+days+' day'+(days===1?'':'s'),detail:'Renew before expiry to keep your shops active and avoid read-only mode.',goto:'licenses',at:ent.expires_at});
  }
  if(pendingLic.length)notes.push({key:'license-pending',level:'info',icon:'clock',title:pendingLic.length+' license payment'+(pendingLic.length>1?'s are':' is')+' under review',detail:'EMS verifies bKash/Nagad payments before activation.',goto:'licenses',at:pendingLic[0].created_at});
  rejectedLic.forEach((x,i)=>notes.push({key:'license-rejected-'+x.id,level:'warning',icon:'shield',title:'A license payment was rejected',detail:x.review_note?String(x.review_note).slice(0,140):'Please contact EMS support or submit the payment again.',goto:'licenses',at:x.created_at}));
  let readOnlyStores=stores.filter(x=>x.status==='read_only'), activeStores=stores.filter(x=>x.status==='active');
  if(readOnlyStores.length)notes.push({key:'shops-readonly',level:'warning',icon:'store',title:readOnlyStores.length+' shop'+(readOnlyStores.length>1?'s are':' is')+' in read-only mode',detail:'Your plan allows '+(ent?.shop_limit||0)+' active shop(s). Oldest shops stay active; newer ones become read-only until you upgrade.',goto:'stores',at:isoNow});
  else if(ent&&stores.length>=Number(ent.shop_limit||0)&&Number(ent.shop_limit)>0)notes.push({key:'shops-at-capacity',level:'info',icon:'store',title:'You have reached your shop limit ('+ent.shop_limit+')',detail:'New shops will be read-only until you upgrade your license.',goto:'licenses',at:isoNow});
  if(unreadHelp.length)notes.push({key:'helpdesk',level:unreadHelp.length>2?'warning':'info',icon:'msg',title:unreadHelp.length+' unread message'+(unreadHelp.length>1?'s':'')+' from EMS support',detail:String(unreadHelp[0].content||'').slice(0,140),goto:'helpdesk',at:unreadHelp[0].created_at});
  let pendingAdd=addons.filter(x=>x.status==='pending'), rejectedAdd=addons.filter(x=>x.status==='rejected'), activeAdd=addons.filter(x=>x.status==='active');
  if(pendingAdd.length)notes.push({key:'addon-pending',level:'info',icon:'sparkles',title:pendingAdd.length+' add-on request'+(pendingAdd.length>1?'s are':' is')+' under review',detail:pendingAdd.slice(0,4).map(x=>({connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'}[x.addon_key]||x.addon_key)).join(', '),goto:'addons',at:pendingAdd[0].created_at});
  rejectedAdd.slice(0,3).forEach(x=>notes.push({key:'addon-rejected-'+x.id,level:'warning',icon:'sparkles',title:({connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'}[x.addon_key]||'Add-on')+' request was rejected',detail:x.review_note?String(x.review_note).slice(0,140):'Please contact EMS support.',goto:'addons',at:x.created_at}));
  activeAdd.forEach(x=>{if(x.expires_at&&new Date(x.expires_at)<=in7){let days=Math.max(0,Math.ceil((new Date(x.expires_at)-now)/86400000));let name={connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'}[x.addon_key]||'Add-on';notes.push({key:'addon-expiring-'+x.id,level:'warning',icon:'sparkles',title:name+' expires in '+days+' day'+(days===1?'':'s'),detail:'Renew from the add-ons page to keep the feature active.',goto:'addons',at:x.expires_at})}});
  let order={critical:0,warning:1,info:2};
  notes.sort((a,b)=>order[a.level]-order[b.level] || new Date(b.at)-new Date(a.at));
  return json({items:notes,counts:{critical:notes.filter(x=>x.level==='critical').length,warning:notes.filter(x=>x.level==='warning').length,info:notes.filter(x=>x.level==='info').length},generatedAt:isoNow});
 }
 if(path==='notifications/owner'&&method==='GET'){
  if(s.role!=='owner')return fail('Forbidden',403);
  let notes=[], now=new Date(), isoNow=now.toISOString();
  let [licenses,addons,unreadMsgs,admins,newContacts,stores] = await Promise.all([
   db(env,'licenses?select=id,status,amount,created_at&order=created_at.desc&limit=200'),
   db(env,'addon_purchases?select=id,addon_key,status,created_at&order=created_at.desc&limit=200'),
   db(env,'helpdesk_messages?sender_type=eq.admin&read_by_owner=eq.false&select=id,admin_id,content,created_at&order=created_at.desc&limit=50'),
   db(env,'administrators?select=id,admin_code,name'),
   db(env,'contact_messages?status=eq.new&select=id,name,subject,message,created_at&order=created_at.desc&limit=20'),
   db(env,'stores?select=id,status,created_at')
  ]);
  let pendingLic=licenses.filter(x=>x.status==='pending');
  if(pendingLic.length)notes.push({key:'owner-license-pending',level:pendingLic.length>5?'critical':'warning',icon:'clock',title:pendingLic.length+' license payment'+(pendingLic.length>1?'s are':' is')+' waiting for verification',detail:'Review bKash/Nagad payments and activate or reject them from License control.',goto:'licenses',at:pendingLic[0].created_at});
  let pendingAdd=addons.filter(x=>x.status==='pending');
  if(pendingAdd.length)notes.push({key:'owner-addon-pending',level:'warning',icon:'sparkles',title:pendingAdd.length+' add-on purchase'+(pendingAdd.length>1?'s are':' is')+' pending review',detail:pendingAdd.slice(0,4).map(x=>({connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'}[x.addon_key]||x.addon_key)).join(', '),goto:'addons',at:pendingAdd[0].created_at});
  let adminName={};admins.forEach(a=>{adminName[a.id]=a.name||a.admin_code||'Administrator'});
  let helpByAdmin={};unreadMsgs.forEach(m=>{(helpByAdmin[m.admin_id]=helpByAdmin[m.admin_id]||[]).push(m)});
  let helpEntries=Object.entries(helpByAdmin).sort((a,b)=>new Date(b[1][0].created_at)-new Date(a[0][0].created_at));
  if(unreadMsgs.length){
   let total=unreadMsgs.length;
   notes.push({key:'owner-helpdesk',level:total>5?'critical':'warning',icon:'msg',title:total+' unread HelpDesk message'+(total>1?'s':'')+' from '+helpEntries.length+' admin'+(helpEntries.length>1?'s':''),detail:(adminName[helpEntries[0][0]]||'Administrator')+': '+String(helpEntries[0][1][0].content||'').slice(0,120),goto:'helpdesk',at:unreadMsgs[0].created_at});
  }
  if(newContacts.length)notes.push({key:'owner-contact-new',level:'info',icon:'msg',title:newContacts.length+' new contact message'+(newContacts.length>1?'s':''),detail:String((newContacts[0].subject?newContacts[0].subject+' — ':'')+(newContacts[0].message||'')).slice(0,120)+' ('+newContacts[0].name+')',goto:'contact-messages',at:newContacts[0].created_at});
  let readOnly=stores.filter(x=>x.status==='read_only');
  if(readOnly.length)notes.push({key:'owner-shops-readonly',level:'info',icon:'store',title:readOnly.length+' shop'+(readOnly.length>1?'s are':' is')+' in read-only mode',detail:'These shops are over their plan limits and await a license upgrade.',goto:'shops',at:isoNow});
  let dayAgo=new Date(now-86400000).toISOString();
  let newStores=stores.filter(x=>x.created_at>=dayAgo);
  if(newStores.length)notes.push({key:'owner-shops-new',level:'info',icon:'store',title:newStores.length+' new shop'+(newStores.length>1?'s':'')+' in the last 24 hours',detail:'Platform growth snapshot.',goto:'shops',at:newStores[0].created_at});
  let order={critical:0,warning:1,info:2};
  notes.sort((a,b)=>order[a.level]-order[b.level] || new Date(b.at)-new Date(a.at));
  return json({items:notes.slice(0,30),counts:{critical:notes.filter(x=>x.level==='critical').length,warning:notes.filter(x=>x.level==='warning').length,info:notes.filter(x=>x.level==='info').length},generatedAt:isoNow});
 }
 if(path==='dashboard/sales-trend'&&method==='GET'){
  if(!s.storeId)return fail('Choose a store.',400);
  // Same query shape as the working 'dashboard' route (no date-range filter) — filter in JS.
  const rows=await db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.sale&select=invoice_date,subtotal&order=invoice_date.asc&limit=5000`);
  const now=new Date(),y=now.getFullYear(),m=now.getMonth();
  const daysIn=(yy,mm)=>new Date(yy,mm+1,0).getDate();
  const pad=n=>String(n).padStart(2,'0');
  const curDays=daysIn(y,m);
  const prevY=m===0?y-1:y, prevM=m===0?11:m-1;
  const prevDays=daysIn(prevY,prevM);
  const curPrefix=y+'-'+pad(m+1)+'-', prevPrefix=prevY+'-'+pad(prevM+1)+'-';
  const thisMonth=new Array(curDays).fill(0), prevMonth=new Array(prevDays).fill(0);
  for(const r of rows){
    const d=String(r.invoice_date||''), v=Number(r.subtotal||0);
    if(!d)continue;
    if(d.startsWith(curPrefix)){const day=parseInt(d.slice(8,10),10);if(day>=1&&day<=curDays)thisMonth[day-1]+=v}
    else if(d.startsWith(prevPrefix)){const day=parseInt(d.slice(8,10),10);if(day>=1&&day<=prevDays)prevMonth[day-1]+=v}
  }
  const thisTotal=thisMonth.reduce((a,b)=>a+b,0), prevTotal=prevMonth.reduce((a,b)=>a+b,0);
  const growthPct=prevTotal>0?((thisTotal-prevTotal)/prevTotal)*100:(thisTotal>0?100:0);
  return json({daysInMonth:curDays,thisMonth,prevMonth,thisTotal,prevTotal,growthPct});
 }
 if(path==='helpdesk'&&s.role==='admin'){
  if(method==='GET'){let msgs=await db(env,`helpdesk_messages?admin_id=eq.${s.id}&select=*&order=created_at.asc`),unread=msgs.filter(m=>m.sender_type==='owner'&&!m.read_by_admin).length;return json({messages:msgs,unread})}
  if(method==='POST'){let b=await body(request),content=String(b.content||'').trim();if(!content)return fail('Message cannot be empty.',400);let [m]=await db(env,'helpdesk_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({admin_id:s.id,sender_type:'admin',content,read_by_admin:true,read_by_owner:false})});await audit(env,s,'send helpdesk message','helpdesk',null,{id:m.id});return json(m,201)}
  if(method==='PATCH'){await db(env,`helpdesk_messages?admin_id=eq.${s.id}&sender_type=eq.owner&read_by_admin=eq.false`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({read_by_admin:true})});return json({ok:true})}
 }
 if(path==='helpdesk/unread'&&s.role==='admin'&&method==='GET'){let msgs=await db(env,`helpdesk_messages?admin_id=eq.${s.id}&sender_type=eq.owner&read_by_admin=eq.false&select=id`);return json({unread:msgs.length})}
 if(path==='platform/helpdesk'&&s.role==='owner'){
  if(method==='GET'){let [admins,msgs]=await Promise.all([db(env,'administrators?select=id,admin_code,name,email,phone&order=name.asc'),db(env,'helpdesk_messages?select=*&order=created_at.asc')]);let last={},unread={};for(let m of msgs){last[m.admin_id]=m;if(m.sender_type==='admin'&&!m.read_by_owner)unread[m.admin_id]=(unread[m.admin_id]||0)+1}return json(admins.map(a=>({...a,unread:unread[a.id]||0,last_message:last[a.id]?.content||null,last_at:last[a.id]?.created_at||null})))}
 }
 if(path==='platform/helpdesk/send'&&s.role==='owner'&&method==='POST'){let b=await body(request),content=String(b.content||'').trim(),adminId=b.adminId;if(!adminId||!content)return fail('Administrator and message are required.',400);let [m]=await db(env,'helpdesk_messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({admin_id:adminId,sender_type:'owner',content,read_by_admin:false,read_by_owner:true})});return json(m,201)}
 if(path.match(/^platform\/helpdesk\/conversation\/[^/]+$/)&&s.role==='owner'&&method==='GET'){let id=path.split('/')[3];let [admin,msgs]=await Promise.all([db(env,`administrators?id=eq.${id}&select=id,admin_code,name,email,phone`),db(env,`helpdesk_messages?admin_id=eq.${id}&select=*&order=created_at.asc`)]);if(!admin)return fail('Administrator not found.',404);return json({admin:admin[0],messages:msgs})}
 if(path==='platform/helpdesk/read'&&s.role==='owner'&&method==='POST'){let b=await body(request);if(!b.adminId)return fail('Administrator is required.',400);await db(env,`helpdesk_messages?admin_id=eq.${b.adminId}&sender_type=eq.admin&read_by_owner=eq.false`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({read_by_owner:true})});return json({ok:true})}

 if(path==='attendance'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'attendance','view'))return fail('Permission denied.',403);
  const dhaka=new Date(Date.now()+6*3600*1000);
  if(method==='GET'){
    let [records,staffs]=await Promise.all([
      db(env,`attendance?store_id=eq.${s.storeId}&select=*&order=attendance_date.desc,created_at.desc&limit=2000`),
      db(env,`staff?store_id=eq.${s.storeId}&select=id,full_name,user_id,position`)
    ]);
    let staffMap=Object.fromEntries(staffs.map(x=>[x.id,x]));
    return json({date:dhaka.toISOString().slice(0,10),records:records.map(r=>({...r,full_name:staffMap[r.staff_id]?.full_name||'—',user_id:staffMap[r.staff_id]?.user_id||'—',position:staffMap[r.staff_id]?.position||''})),staffs});
  }
  if(method==='POST'){
    if(!allowed(s,'attendance','add'))return fail('Permission denied.',403);
    let b=await body(request),records=Array.isArray(b.records)?b.records:[];
    if(!b.date)return fail('Date is required.',400);
    if(!records.length)return fail('Select at least one staff member.',400);
    let out=[];
    for(let rec of records){
      if(!rec.staff_id||!['present','absent'].includes(rec.status))return fail('Invalid attendance entry.',400);
      let [r]=await db(env,'attendance?on_conflict=staff_id,attendance_date',{method:'POST',headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({store_id:s.storeId,staff_id:rec.staff_id,attendance_date:b.date,status:rec.status,note:rec.note||null,recorded_by:s.id})});
      out.push(r);
    }
    await audit(env,s,'record attendance','attendance',null,{date:b.date,count:out.length});
    return json(out,201);
  }
 }

 if(path==='salary'||path.startsWith('salary/')){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'salary','view'))return fail('Permission denied.',403);
  if(method==='GET'){
    const url=new URL(request.url);
    let staffs=await db(env,`staff?store_id=eq.${s.storeId}&select=id,full_name,position,phone,email,user_id,basic_salary,active,created_at&order=created_at.asc`);
    let staffId=url.searchParams.get('staff_id'),month=url.searchParams.get('month')||'';
    let invoices=[],attendance={present:0,total:0};
    if(staffId&&staffs.some(x=>x.id===staffId)){
      let from,to;
      if(/^\d{4}-\d{2}$/.test(month)){let [y,m]=month.split('-').map(Number);from=new Date(Date.UTC(y,m-1,1)).toISOString().slice(0,10);to=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);}
      else{let d=new Date();from=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString().slice(0,10);to=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString().slice(0,10);}
      let [inv,att]=await Promise.all([
        db(env,`staff_salary_invoices?store_id=eq.${s.storeId}&staff_id=eq.${staffId}&select=*&order=created_at.desc&limit=200`),
        db(env,`attendance?store_id=eq.${s.storeId}&staff_id=eq.${staffId}&attendance_date=gte.${from}&attendance_date=lt.${to}&select=status`).then(rows=>({present:rows.filter(x=>x.status==='present').length,total:rows.length}))
      ]);
      invoices=inv;attendance=att;
    }
    let all=await db(env,`staff_salary_invoices?store_id=eq.${s.storeId}&select=staff_id,invoice_type,total,paid,due,created_at&order=created_at.desc&limit=5000`);
    let year=new Date().getUTCFullYear(),summary={};
    for(let st of staffs){
      let rows=all.filter(x=>x.staff_id===st.id);
      summary[st.id]={
        monthly:Number(st.basic_salary||0),
        outstandingDue:Math.round(rows.reduce((a,x)=>a+Number(x.due||0),0)*100)/100,
        takenAdvance:Math.round(rows.filter(x=>x.invoice_type==='advance').reduce((a,x)=>a+Number(x.total||0),0)*100)/100,
        totalPaidYTD:Math.round(rows.filter(x=>new Date(x.created_at).getUTCFullYear()===year).reduce((a,x)=>a+Number(x.paid||0),0)*100)/100
      };
    }
    return json({staffs,summary,invoices,attendance});
  }
  if(method==='POST'&&path==='salary'){
    if(!allowed(s,'salary','add'))return fail('Permission denied.',403);
    let b=await body(request);
    let [person]=await db(env,`staff?id=eq.${b.staff_id}&store_id=eq.${s.storeId}&select=id,basic_salary`);
    if(!person)return fail('Staff member not found in this shop.',404);
    if(!['current','due','advance'].includes(b.invoice_type))return fail('Invalid invoice type.',400);
    if(!/^\d{4}-\d{2}$/.test(b.salary_month||''))return fail('Salary month (YYYY-MM) is required.',400);
    const num=x=>Math.max(0,Number(x)||0);
    let all=await db(env,`staff_salary_invoices?store_id=eq.${s.storeId}&staff_id=eq.${b.staff_id}&select=invoice_type,total,due`);
    let outstanding=all.reduce((a,x)=>a+Number(x.due||0),0);
    let advanceTaken=all.filter(x=>x.invoice_type==='advance').reduce((a,x)=>a+Number(x.total||0),0);
    let base=b.invoice_type==='advance'?0:num(b.base_amount),total,paid;
    if(b.invoice_type==='advance'){total=num(b.paid);paid=total;}
    else{
      total=base+num(b.incentive)+num(b.bonus)-num(b.fine)-num(b.other_deduction);
      if(b.add_outstanding)total+=outstanding;
      if(b.cut_advance)total-=advanceTaken;
      if(total<0)total=0;
      paid=Math.min(num(b.paid),total);
    }
    let rec={store_id:s.storeId,staff_id:person.id,salary_month:b.salary_month+'-01',invoice_type:b.invoice_type,base_amount:base,attendance_based:!!b.attendance_based,present_days:Number.isInteger(b.present_days)?b.present_days:null,total_days:Number.isInteger(b.total_days)?b.total_days:null,incentive:num(b.incentive),bonus:num(b.bonus),fine:num(b.fine),other_deduction:num(b.other_deduction),add_outstanding:!!b.add_outstanding,cut_advance:!!b.cut_advance,total:Math.round(total*100)/100,paid:Math.round(paid*100)/100,note:b.note?String(b.note).slice(0,500):null,created_by:s.id};
    let [out]=await db(env,'staff_salary_invoices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)});
    await audit(env,s,'create salary invoice','staff_salary',out.id,{staff_id:person.id,type:b.invoice_type,total:rec.total});
    return json(out,201);
  }
  if(method==='DELETE'&&path.startsWith('salary/')){
    if(!allowed(s,'salary','delete'))return fail('Permission denied.',403);
    let id=path.split('/')[1];
    let [rec]=await db(env,`staff_salary_invoices?id=eq.${id}&store_id=eq.${s.storeId}&select=id`);
    if(!rec)return fail('Salary invoice not found.',404);
    await db(env,`staff_salary_invoices?id=eq.${id}`,{method:'DELETE'});
    await audit(env,s,'delete salary invoice','staff_salary',id,{});
    return json({ok:true});
  }
 }
 if(path==='vaultium/availability'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let [store]=await db(env,`stores?id=eq.${s.storeId}&select=admin_id`),adminId=store?.admin_id;let [plan,usedRows,ever]=await Promise.all([vaultiumPlan(env,s.storeId),adminId?db(env,`vaultium_files?admin_id=eq.${adminId}&select=size_bytes`):[],featureEver(env,s.storeId,'vaultium')]);let used=(usedRows||[]).reduce((n,r)=>n+Number(r.size_bytes||0),0);return json({enabled:!!plan,ever,gb:plan?plan.gb:0,used,usedFormatted:(used/GB).toFixed(2),expiresAt:plan?plan.expires_at:null})}
 if(path==='vaultium/files'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);if(!allowed(s,'vaultium','view'))return fail('Permission denied.',403);let q=new URL(request.url).searchParams.get('q');let rows=await vaultFileRows(env,s.storeId,500);if(q){q=q.toLowerCase();rows=rows.filter(r=>(r.invoice_number||'').toLowerCase().includes(q)||(r.expense_code||'').toLowerCase().includes(q)||(r.filename||'').toLowerCase().includes(q)||(r.invoice_id||'').startsWith(q)||(r.expense_id||'').startsWith(q))}return json(rows)}
 if(path==='vaultium/source-files'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);return json(await vaultFileRows(env,s.storeId,2000))}
 if(path==='vaultium/usage'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let [store]=await db(env,`stores?id=eq.${s.storeId}&select=admin_id`),adminId=store?.admin_id;let rows=await db(env,`vaultium_files?admin_id=eq.${adminId}&select=size_bytes`),used=rows.reduce((n,r)=>n+Number(r.size_bytes||0),0),plan=await vaultiumPlan(env,s.storeId);return json({used,usedGB:(used/GB).toFixed(2),gb:plan?plan.gb:0})}
 if(path==='vaultium/upload'&&method==='POST'){
  if(!s.storeId)return fail('Shop access required.',403);
  if(!allowed(s,'vaultium','add'))return fail('Permission denied.',403);
  let plan=await vaultiumPlan(env,s.storeId);
  if(!plan)return fail('Vaultium is not available for this shop. Purchase the add-on or an eligible license.',403);
  if(!env.VAULTIUM)return fail('Vaultium R2 bucket is not configured by EMS Owner.',503);
  let fd=await request.formData();
  let files=[...fd.getAll('files')].filter(x=>x&&x.name);
  let invoiceId=fd.get('invoice_id')||null, invoiceNumber=fd.get('invoice_number')||null;
  let expenseId=fd.get('expense_id')||null, expenseCode=fd.get('expense_code')||null;
  if(!files.length)return fail('Select at least one file.',400);
  if(files.length>5)return fail('Maximum 5 files per record.',400);
  let [store]=await db(env,`stores?id=eq.${s.storeId}&select=admin_id`),adminId=store?.admin_id;
  if(expenseId){let [exp]=await db(env,`expenses?id=eq.${expenseId}&store_id=eq.${s.storeId}&select=id,expense_code`);if(!exp)return fail('Expense record not found.',404);expenseCode=expenseCode||exp.expense_code||null}
  const hasExpCols=await vaultExpenseColumns(env);
  // On old schemas (pre expense-link migration) expense files were keyed by invoice_number = EXP-code.
  let sourceFilter;
  if(expenseId)sourceFilter=hasExpCols?`expense_id=eq.${expenseId}`:`invoice_number=eq.${encodeURIComponent(expenseCode||'')}`;
  else sourceFilter=`invoice_id=eq.${invoiceId||'00000000-0000-0000-0000-000000000000'}`;
  let existing=await db(env,`vaultium_files?${sourceFilter}&select=id`);
  if(existing.length+files.length>5)return fail('Maximum 5 files per record.',400);
  let usedRows=await db(env,`vaultium_files?admin_id=eq.${adminId}&select=size_bytes`),used=usedRows.reduce((n,r)=>n+Number(r.size_bytes||0),0);
  let cap=plan.gb*GB;
  for(const f of files){if(f.size>5*1024*1024)return fail('Each file must be 5 MB or less.',400);if(!f.size)return fail('Empty file not allowed.',400)}
  let incoming=files.reduce((n,f)=>n+f.size,0);
  if(used+incoming>cap)return fail('Storage limit reached. Upgrade or delete files to free space.',400);
  let out=[];
  for(const f of files){
    let ext=(f.name.split('.').pop()||'').toLowerCase();
    if(['mp4','webm','mov','avi','mkv'].includes(ext))return fail('Video files are not allowed.',400);
    let folder=expenseId?('expense/'+expenseId):(invoiceId||'misc');
    let r2key=`${adminId}/${folder}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    await env.VAULTIUM.put(r2key,f.stream(),{httpMetadata:{contentType:f.type||'application/octet-stream'}});
    let row={admin_id:adminId,store_id:s.storeId,invoice_id:invoiceId||null,invoice_number:invoiceNumber||null,expense_id:expenseId||null,expense_code:expenseCode||null,filename:f.name,content_type:f.type||'application/octet-stream',size_bytes:f.size,r2_key:r2key,uploaded_by:s.id};
    if(!hasExpCols){
     // Legacy schema: store expense links in invoice_number (the old convention), drop expense_* columns.
     if(expenseId)row.invoice_number=expenseCode;
     delete row.expense_id;delete row.expense_code;
    }
    let [r]=await db(env,'vaultium_files',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)});
    out.push(r);
  }
  await audit(env,s,'upload file','vaultium',null,{filenames:files.map(f=>f.name),count:files.length,invoice_number:invoiceNumber,expense_code:expenseCode});
  return json(out,201);
 }
 if(path.match(/^vaultium\/file\/[^/]+$/)&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let id=path.split('/')[2],inline=new URL(request.url).searchParams.get('view')==='1';let [file]=await db(env,`vaultium_files?id=eq.${id}&store_id=eq.${s.storeId}&select=*`);if(!file)return fail('File not found.',404);if(!env.VAULTIUM)return fail('Vaultium R2 bucket is not configured.',503);let obj=await env.VAULTIUM.get(file.r2_key);if(!obj)return fail('File missing from storage.',404);let disposition=(inline?'inline':'attachment')+'; filename="'+encodeURIComponent(file.filename)+'"';return new Response(obj.body,{headers:{'content-type':file.content_type||'application/octet-stream','content-disposition':disposition,'cache-control':'private'}})}
 if(path==='vaultium/delete'&&method==='POST'){if(!s.storeId)return fail('Shop access required.',403);if(!allowed(s,'vaultium','delete'))return fail('Permission denied.',403);let b=await body(request);if(!b.id)return fail('File id required.',400);let [file]=await db(env,`vaultium_files?id=eq.${b.id}&store_id=eq.${s.storeId}&select=*`);if(!file)return fail('File not found.',404);try{await env.VAULTIUM.delete(file.r2_key)}catch{}await db(env,`vaultium_files?id=eq.${file.id}`,{method:'DELETE'});await audit(env,s,'delete file','vaultium',file.id,{filename:file.filename,invoice_number:file.invoice_number,expense_code:file.expense_code});return json({ok:true})}
 if(path==='platform/vaultium'&&s.role==='owner'&&method==='GET'){let [rows,stores,admins,ents,addons]=await Promise.all([db(env,'vaultium_files?select=store_id,admin_id,size_bytes'),db(env,'stores?select=id,shop_code,admin_id'),db(env,'administrators?select=id,admin_code,name'),db(env,'current_entitlements?select=admin_id,vaultium_gb,status,expires_at'),db(env,'addon_purchases?addon_key=eq.vaultium&select=admin_id,status,expires_at,validity_days,daily_limit&order=created_at.desc')]);let used=rows.reduce((n,r)=>n+Number(r.size_bytes||0),0);let storeMap=Object.fromEntries(stores.map(x=>[x.id,x])),adminMap=Object.fromEntries(admins.map(x=>[x.id,x]));let entMap={};for(const e of ents){if(!entMap[e.admin_id]||(Number(entMap[e.admin_id].gb||0)<=Number(e.vaultium_gb||0)))entMap[e.admin_id]={gb:Number(e.vaultium_gb||0),expires:e.expires_at,status:e.status}}let addonMap={};for(const a of addons){if(!addonMap[a.admin_id])addonMap[a.admin_id]=a}let byStore={};for(const r of rows){if(!r.store_id)continue;const s=storeMap[r.store_id];if(!s)continue;byStore[r.store_id]=(byStore[r.store_id]||0)+Number(r.size_bytes||0)}let breakdown=Object.entries(byStore).map(([sid,bytes])=>{const s=storeMap[sid]||{},a=adminMap[s.admin_id]||{},ent=entMap[s.admin_id],addon=addonMap[s.admin_id];let limit=Math.max(ent?.gb||0,Number(addon?.daily_limit||0));let expires=addon?.status==='active'?addon.expires_at:ent?.expires||null;let status=limit>0?(expires&&new Date(expires)>new Date()?'Active':'Expired'):'None';return {store_id:sid,shop_code:s.shop_code||null,admin_code:a.admin_code||null,admin_name:a.name||null,used:bytes,usedGB:(bytes/GB).toFixed(2),limit,expires,status}}).sort((a,b)=>b.used-a.used);return json({r2Binding:!!env.VAULTIUM,used,usedGB:(used/GB).toFixed(2),files:rows.length,breakdown})}

 if(path==='invoices/by-party'&&method==='GET'){if(!s.storeId)return fail('Shop access required.',403);let q=new URL(request.url).searchParams.get('kind'),party=new URL(request.url).searchParams.get('party_id'),section=q==='purchase'?'purchase':'sales';if(!['sale','purchase'].includes(q)||!allowed(s,section,'view'))return fail('Permission denied.',403);if(!party)return fail('Party id is required.',400);return json(await db(env,`invoices?store_id=eq.${s.storeId}&kind=eq.${q}&party_id=eq.${party}&select=*,invoice_lines(*,inventory_items(item_code,description,unit))&order=created_at.desc`))}
 let [kind,id]=path.split('/');let table=tables[kind];if(table){let section=perms[kind];if(!allowed(s,section,method==='GET'?'view':method==='POST'?'add':method==='PATCH'?'edit':'delete'))return fail('Permission denied.',403);let filter=`store_id=eq.${s.storeId}`;if(method==='GET'){let records=await db(env,`${table}?${filter}&select=*&order=created_at.desc`);return json(kind==='staff'?records.map(publicStaff):records)}if(method==='POST'){let b=await body(request);if(kind==='staff'){if(!b.password||b.password.length<10)return fail('Staff password must contain at least 10 characters.');b.password_hash=await hash(b.password);delete b.password;b.permissions=normalizePermissions(b.permissions)}if(kind==='inventory'&&!String(b.item_code||'').trim())delete b.item_code;let [r]=await db(env,table,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...clean(b),store_id:s.storeId,...(kind==='staff'||kind==='supplier'||kind==='customer'||kind==='inventory'?{}:{created_by:s.id})})});await audit(env,s,'create',kind,r.id,{code:r.item_code||r.customer_code||r.supplier_code||r.expense_code||r.user_id||null,name:r.name||r.description||r.full_name||r.category||null,total:r.total||r.sale_price||null});return json(kind==='staff'?publicStaff(r):r,201)}if(!id)return fail('Record ID required.');if(method==='PATCH'){let b=await body(request);if(kind==='staff'&&b.password){if(b.password.length<10)return fail('Staff password must contain at least 10 characters.');b.password_hash=await hash(b.password);delete b.password}if(kind==='staff'&&b.permissions)b.permissions=normalizePermissions(b.permissions);let [r]=await db(env,`${table}?id=eq.${id}&${filter}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(clean(b))});await audit(env,s,'update',kind,id,{code:r.item_code||r.customer_code||r.supplier_code||r.expense_code||r.user_id||null,name:r.name||r.description||r.full_name||r.category||null,fields:Object.keys(clean(b))});return json(kind==='staff'?publicStaff(r):r)}if(method==='DELETE'){let [target]=await db(env,`${table}?id=eq.${id}&${filter}&select=*`);await db(env,`${table}?id=eq.${id}&${filter}`,{method:'DELETE'});await audit(env,s,'delete',kind,id,{code:target?.item_code||target?.customer_code||target?.supplier_code||target?.expense_code||target?.user_id||null,name:target?.name||target?.description||target?.full_name||target?.category||null});return json({ok:true})}}
 return fail('Endpoint not found.',404);
 }catch(e){console.error(e);return fail(e.message||'Unexpected server error.',500)}}
