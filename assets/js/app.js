const $=s=>document.querySelector(s), app=$('#app');let state=JSON.parse(localStorage.getItem('ems.session')||'null');const api=async(path,opt={})=>{let r=await fetch('/api/'+path,{...opt,headers:{'content-type':'application/json',...(state?{authorization:'Bearer '+state.token}:{}),...(opt.headers||{})}}),x=await r.json();if(!r.ok)throw Error(x.error||'Request failed');return x};
const apiUpload=async(path,formData)=>{let r=await fetch('/api/'+path,{method:'POST',headers:state?{authorization:'Bearer '+state.token}:{},body:formData});let x=await r.json();if(!r.ok)throw Error(x.error||'Upload failed');return x};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtAI=t=>{let s=esc(String(t??''));let lines=s.split('\n'),out=[],ul=[],ol=[];const flush=()=>{if(ul.length){out.push('<ul class="aimd">'+ul.map(x=>`<li>${x}</li>`).join('')+'</ul>');ul=[]}if(ol.length){out.push('<ol class="aimd aimdo">'+ol.map(x=>`<li>${x}</li>`).join('')+'</ol>');ol=[]}};for(let line of lines){let t2=line.trim();if(!t2){flush();out.push('');continue}if(/^[-*•]\s/.test(t2)){flush();ul.push(t2.replace(/^[-*•]\s+/,''));continue}if(/^#{1,3}\s/.test(t2)){flush();let lvl=(t2.match(/^#+/)||[''])[0].length;out.push(`<b class="aimd-h${lvl}">${t2.replace(/^#+\s*/,'')}</b>`);continue}if(/^\d+[.)]\s/.test(t2)){flush();ol.push(t2.replace(/^\d+[.)]\s+/,''));continue}flush();out.push(t2)}flush();return out.map(x=>x===''?'<br>':x).join('').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')};
const AI_PROVIDER_GROUPS=[['cf','Cloudflare Workers AI (free, built-in)'],['gemini','Google AI Studio (Gemini)'],['groq','Groq (free tier)'],['cerebras','Cerebras (free tier)'],['deepseek','DeepSeek API (cheap)'],['openrouter','OpenRouter (free :free models)'],['github','GitHub Models / Copilot (free)'],['anthropic','Anthropic Claude']];
const modelOptions=(models,current)=>{if(!models)return `<option value="@cf/meta/llama-3.2-3b-instruct">Llama 3.2 3B (Cloudflare)</option>`;const groups={};for(const [k,v] of Object.entries(models)){(groups[v.provider]??=[]).push([k,v.name])}let html='';if(current&&!models[current])html+=`<optgroup label="Currently saved"><option value="${esc(current)}" selected>${esc(current)} (saved — check provider, model may be retired)</option></optgroup>`;for(const [p,label] of AI_PROVIDER_GROUPS){if(!groups[p]||!groups[p].length)continue;html+=`<optgroup label="${label}">`+groups[p].map(([k,n])=>`<option value="${esc(k)}" ${k===current?'selected':''}>${esc(n)}</option>`).join('')+'</optgroup>'}return html};const money=x=>Number(x||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});const GB2=1024*1024*1024,MB2=1024*1024,KB2=1024;const invoiceMoney=x=>Number(x||0).toLocaleString('en-BD',{minimumFractionDigits:2});const ago=x=>{let m=Math.max(0,Math.floor((Date.now()-new Date(x))/60000));return m<60?m+'m ago':m<1440?Math.floor(m/60)+'h ago':Math.floor(m/1440)+'d ago'};
/* License plan card — "Plan" card design from Uiverse.io by Yaya12085.
   Shared by the landing page pricing section and the administrator Purchase license page. */
const PLAN_ICON_ON='<svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"></path><path fill="currentColor" d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z"></path></svg>';
const PLAN_ICON_OFF='<svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"></path><path fill="currentColor" d="M18.3 5.71 16.89 4.3 12 9.19 7.11 4.3 5.7 5.71l4.89 4.89-4.89 4.89 1.41 1.41L12 12.01l4.89 4.89 1.41-1.41-4.89-4.89z"></path></svg>';
function planCardHtml(p,o={}){const featured=!!o.featured,free=Number(p.price)===0,attr=o.attr||'data-public-plan',label=esc(o.button||'Choose plan');
  const rows=(p.benefits||'Multi-shop admin access\nStaff permissions\nInventory & invoices\nActivity logging').split(/\n|,/).map(x=>x.trim()).filter(Boolean).map(x=>[esc(x),true]);
  rows.push([`Up to <strong>${p.max_stores}</strong> shop${p.max_stores>1?'s':''}`,true]);
  rows.push(p.connectx_enabled?[`ConnectX: <strong>${p.connectx_daily_limit}</strong> emails/day per shop`,true]:['ConnectX not included',false]);
  rows.push(p.zudo_enabled?[`Zudo AI: <strong>${p.zudo_daily_limit}</strong> requests/day per shop`,true]:['Zudo AI not included',false]);
  rows.push(p.business_health_enabled?[`Business AI Health: <strong>${p.business_health_daily_limit}</strong> reports/day per shop`,true]:['Business AI Health not included',false]);
  rows.push(p.truebill_enabled?['TrueBill: invoice <strong>QR verification</strong>',true]:['TrueBill not included',false]);
  rows.push(Number(p.vaultium_gb||0)>0?[`Vaultium: <strong>${p.vaultium_gb} GB</strong> cloud storage`,true]:['Vaultium not included',false]);
  const info=free?'This plan is free — activate it instantly and start running your shop on EMS.':`This plan covers one license for ${p.duration_months} months, activated after bKash / Nagad payment verification.`;
  return `<article class="plan${featured?' featured':''}"><div class="inner">${featured?'<em class="plantag">Featured plan</em>':''}<span class="pricing"><span>${free?'Free':'৳ '+money(p.price)} <small>/ ${p.duration_months} mo</small></span></span><p class="title">${esc(p.title)}</p><p class="info">${info}</p><ul class="features">${rows.map(r=>`<li${r[1]?'':' class="off"'}><span class="icon">${r[1]?PLAN_ICON_ON:PLAN_ICON_OFF}</span><span>${r[0]}</span></li>`).join('')}</ul><div class="action"><button type="button" class="button" ${attr}="${p.id}">${label}</button></div></div></article>`}
let sessionTimer,permissionSyncedFor=null,entitlementSyncedFor=null;function toast(x){let e=$('#toast');e.textContent=x;e.style.display='block';setTimeout(()=>e.style.display='none',3000)}function sessionExpiry(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000}catch{return 0}}function scheduleLogout(){clearTimeout(sessionTimer);if(!state?.token)return;let ms=sessionExpiry(state.token)-Date.now();if(ms<=0)return logout();sessionTimer=setTimeout(()=>{toast('Your session has expired. Please sign in again.');setTimeout(logout,900)},ms)}function save(s){state=s;localStorage.setItem('ems.session',JSON.stringify(s));scheduleLogout()}function logout(){clearTimeout(sessionTimer);localStorage.removeItem('ems.session');localStorage.removeItem('ems.admin.return');state=null;location.reload()}
async function verificationPage(token){
  const shell = (inner)=>`<header class="sitehead"><a class="wordmark" href="/"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></a><button class="appBurger siteBurger" type="button" aria-label="Open navigation menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button><nav><a href="/#features">Features</a><a href="/#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><a href="/?page=contact">Contact</a><button class="secondary" id="adminLogin">Administrator login</button><button id="shopLogin">Shop login</button><button class="emslogin" id="emsLogin">EMS login</button></nav></header><main class="verifyPage">${inner}</main><footer class="sitefoot"><div class="wordmark"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></div><span>© ${new Date().getFullYear()} DoxTox. All rights reserved.</span><span><a href="/?page=contact">Contact</a> · <a href="/?page=terms">Terms & Conditions</a></span></footer><div class="authlayer" id="authlayer" hidden></div>`;
  const wire = ()=>{
    const a=$('#adminLogin'); if(a)a.onclick=()=>showAuth('admin');
    const s=$('#shopLogin'); if(s)s.onclick=()=>showAuth('shop');
    const e=$('#emsLogin'); if(e)e.onclick=()=>showEmsLogin();
    api('public/branding').then(b=>{document.title=(b.website_name||'EMS V1')+' | DoxTox';document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{});
  };
  app.innerHTML = shell(`<section class="verifyCard verifyLoading"><div class="verifyStatus"><svg class="verifyRing" viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="24"/><circle class="spin" cx="26" cy="26" r="24"/></svg><h2>Checking invoice</h2><p>Verifying the official EMS record…</p></div></section>`);
  wire();
  try{
    let d=await api('public/invoice/'+encodeURIComponent(token)),r=d.invoice,p=d.party,shop=r.stores,paid=Number(r.total_due)<=0;
    const inner=`<section class="verifyCard"><div class="verifyStatus success"><svg class="verifyCheck" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7.5 7.5L37 19"/></svg><h2>Invoice Verified</h2><p>This is an authentic EMS invoice record verified by TrueBill.</p></div><header class="invoicePrintHeader"><div class="invoiceShopInfo"><h2>${esc(shop.name)}</h2><p>${esc(shop.address||'')}</p><p>${esc(shop.phone||'')}${shop.phone2?' · '+esc(shop.phone2):''}</p><p>${esc(shop.email||'')}</p>${shop.website?`<p>${esc(shop.website)}</p>`:''}</div><div class="invoiceTitleRight"><small class="verifiedLabel">✓ OFFICIAL EMS VERIFICATION</small><h1>${r.kind==='sale'?'SALES INVOICE':'PURCHASE INVOICE'}</h1><span># ${esc(r.invoice_number)}</span><b class="invoiceStatus verified">Verified</b><em class="verifyPayment ${paid?'paid':'due'}">${paid?'Paid':'Payment due'}</em></div></header><div class="verifyCols"><div><h3>${r.kind==='sale'?'Bill to':'Supplier'}</h3><p><b>ID:</b> ${esc(p?.customer_code||p?.supplier_code||(r.custom_party_name?'Custom customer':'Custom / not registered'))}</p><p><b>Name:</b> ${esc(p?.name||r.custom_party_name||'—')}</p><p><b>Address:</b> ${esc(p?.address||r.custom_party_address||'—')}</p><p><b>Phone:</b> ${esc(p?.phone||r.custom_party_phone||'—')}</p></div><div><h3>Invoice details</h3><p><b>Date:</b> ${esc(r.invoice_date)}</p><p><b>Payment:</b> ${esc(r.payment_method)}</p><p><b>Transaction:</b> ${esc(r.transaction_id||'—')}</p></div></div><div class="tablewrap"><table class="printItems"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${r.invoice_lines.map(x=>`<tr><td>${esc(x.inventory_items?.description||'Item')}<br><small>${esc(x.inventory_items?.item_code||'')}</small></td><td>${esc(x.quantity)}</td><td>${esc(x.inventory_items?.unit||'')}</td><td>${invoiceMoney(x.unit_price)}</td><td>${invoiceMoney(x.line_total)}</td></tr>`).join('')}</tbody></table></div><div class="verifyTotal"><p>Subtotal <b>${invoiceMoney(r.subtotal)}</b></p><p>Tax <b>${invoiceMoney(r.tax_amount)}</b></p><p>Discount <b>${invoiceMoney(r.discount)}</b></p><p>Paid <b>${invoiceMoney(r.paid_amount)}</b></p><p class="dueLine">Total due <b>${invoiceMoney(r.total_due)}</b></p></div><footer>Verified by <span data-brand-name>EMS V1</span> · <span data-powered-by>DoxTox</span></footer></section>`;
    app.innerHTML = shell(inner);
    wire();
  }catch(e){
    app.innerHTML = shell(`<section class="verifyCard"><div class="verifyStatus error"><svg class="verifyCheck" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M18 18l16 16M34 18L18 34"/></svg><h2>Invoice Not Verified</h2><p>${esc(e.message||'This record could not be verified.')}</p><a class="verifyHome" href="/">Return to EMS</a></div></section>`);
    wire();
  }
}
async function publicPage(page){
  const brand=()=>api('public/branding').catch(()=>({product_name:'EMS V1',powered_by:'DoxTox',website_name:'EMS V1'}));
  const chrome=(inner,logoB)=>{const b=logoB;return `<header class="sitehead"><a class="wordmark" href="/"><b data-brand-name>${esc(b.product_name||'EMS V1')}</b><small>powered by <span data-powered-by>${esc(b.powered_by||'DoxTox')}</span></small></a><button class="appBurger siteBurger" type="button" aria-label="Open navigation menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button><nav><a href="/#features">Features</a><a href="/#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><a href="/?page=contact">Contact</a><button class="secondary" id="publicAdmin">Administrator login</button><button id="publicShop">Shop login</button><button class="emslogin" id="publicEms">EMS login</button></nav></header><main class="publicPage">${inner}</main><footer><div class="wordmark"><b data-brand-name>${esc(b.product_name||'EMS V1')}</b><small>powered by <span data-powered-by>${esc(b.powered_by||'DoxTox')}</span></small></div><span>© ${new Date().getFullYear()} ${esc(b.powered_by||'DoxTox')}. All rights reserved.</span><span><a href="/?page=contact">Contact</a> · <a href="/?page=terms">Terms & Conditions</a></span></footer><div class="authlayer" id="authlayer" hidden></div>`};
  const wire=()=>{const a=$('#publicAdmin');if(a)a.onclick=()=>showAuth('admin');const s=$('#publicShop');if(s)s.onclick=()=>showAuth('shop');const e=$('#publicEms');if(e)e.onclick=()=>showEmsLogin();};
  const b=await brand();
  app.innerHTML=chrome('<p class="muted" style="text-align:center;padding:60px 0">Loading…</p>',b);
  wire();
  let root=$('.publicPage');
  try{
    if(page==='blog'){
      let posts=await api('public/blogs');
      root.innerHTML=`<section class="publicHero blogHero"><p class="eyebrow">EMS INSIGHTS</p><h1>${esc(b.website_name||'EMS V1')} Insights</h1><p>Product updates, retail operations advice, and business insights from ${esc(b.powered_by||'DoxTox')}.</p></section><section class="blogGrid">${posts.length?posts.map(x=>`<article><div class="blogCover" ${x.cover_image_url?`style="background-image:url('${esc(x.cover_image_url)}')"`:''}></div><small>${new Date(x.published_at).toLocaleDateString()}</small><h2>${esc(x.title)}</h2><p>${esc(x.excerpt||'Read the latest update.')}</p><a href="/?page=blog-post&id=${x.id}">Read article →</a></article>`).join(''):'<p class="muted">No published articles yet.</p>'}</section>`;
    }else if(page==='blog-post'){
      let post=await api('public/blogs?id='+encodeURIComponent(new URLSearchParams(location.search).get('id')));
      root.innerHTML=`<article class="articlePage"><button class="backlink" id="blogBack">← Back to ${esc(b.website_name||'EMS V1')} Insights</button>${post.cover_image_url?`<div class="articleCover" style="background-image:url('${esc(post.cover_image_url)}')"></div>`:''}<small>${new Date(post.published_at).toLocaleDateString()}</small><h1>${esc(post.title)}</h1><p class="articleExcerpt">${esc(post.excerpt||'')}</p><div class="articleBody">${esc(post.body).replace(/\n/g,'<br>')}</div></article>`;
      const back=$('#blogBack');if(back)back.onclick=()=>publicPage('blog');
    }else if(page==='contact'){
      let [info,branding]=await Promise.all([api('public/page?slug=contact'),brand()]);
      root.innerHTML=`<section class="contactPage"><div class="contactInfo"><p class="eyebrow">CONTACT</p><h1>${esc(info.title)}</h1><div>${esc(info.body).replace(/\n/g,'<br>')}</div><h3>${esc(branding.website_name||'EMS V1')}</h3></div><form class="contactForm" id="publicContact"><h2>Send us a message</h2><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone<input name="phone"></label><label>Subject<input name="subject"></label><label>Message<textarea name="message" rows="6" required></textarea></label><button>Send message</button></form></section>`;
      $('#publicContact').onsubmit=async e=>{e.preventDefault();try{await api('public/contact',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();toast('Your message was submitted successfully.')}catch(err){toast(err.message)}};
    }else{
      let p=await api('public/page?slug='+(page==='terms'?'terms':'about'));
      root.innerHTML=`<section class="aboutPage"><div><p class="eyebrow">${page==='terms'?'LEGAL':'ABOUT EMS'}</p><h1>${esc(p.title)}</h1><div class="articleBody">${esc(p.body).replace(/\n/g,'<br>')}</div></div></section>`;
    }
  }catch(e){root.innerHTML=`<section class="publicHero"><h1>Page unavailable</h1><p>${esc(e.message)}</p></section>`}
}

function login(){let verifyToken=new URLSearchParams(location.search).get('verify'),publicRoute=new URLSearchParams(location.search).get('page');if(verifyToken)return verificationPage(verifyToken);if(publicRoute)return publicPage(publicRoute);app.innerHTML=`<header class="sitehead"><a class="wordmark" href="#top"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></a><button class="appBurger siteBurger" type="button" aria-label="Open navigation menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button><nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><button class="secondary" id="adminLogin">Administrator login</button><button id="shopLogin">Shop login</button><button class="emslogin" id="emsLogin">EMS login</button></nav></header><main id="top" class="website"><section class="hero"><div><p class="eyebrow">MULTI-SHOP MANAGEMENT, MADE SIMPLE</p><h1>Run every part of your shop with clarity.</h1><p class="lead">EMS V1 gives owners and staff one secure place for inventory, purchases, sales, expenses, customers, and store operations.</p><div class="heroactions"><button id="heroStart">Create administrator account</button><button class="secondary" id="heroShop">Shop staff login</button></div><div class="trust"><span>✓ Custom secure credentials</span><span>✓ Cloud-based access</span><span>✓ BDT pricing</span></div></div><div class="heroart"><div class="screen"><div class="screenbar"><i></i><i></i><i></i></div><p>Today at a glance</p><div class="artcards"><b>৳ 24,860<small>Sales today</small></b><b>18<small>Low-stock items</small></b></div><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span>Sales performance</span></div></div></section><section class="logos"><span>Built for retail shops</span><span>Grocery &amp; general stores</span><span>Pharmacy &amp; cosmetics</span><span>Electronics &amp; wholesale</span></section><section id="features" class="section"><p class="eyebrow">ONE SYSTEM, EVERYDAY OPERATIONS</p><h2>Everything a growing shop needs</h2><p class="sectionlead">Designed for shop owners who need accurate records, controlled staff access, and practical decisions—not complicated software.</p><div class="featuregrid"><article><div class="featureicon">${lucide('store')}</div><h3>Multi-store control</h3><p>Create and manage multiple stores from one administrator account. Track license status, activation, and connected devices per shop.</p></article><article><div class="featureicon">${lucide('receipt')}</div><h3>Sales &amp; purchase invoices</h3><p>Prepare invoices that calculate tax, discount, paid amount, and due automatically — with full payment and transaction details.</p></article><article><div class="featureicon">${lucide('package')}</div><h3>Live inventory</h3><p>Stock updates instantly when purchases or sales are posted. Low-stock indicators help you replenish before items run out.</p></article><article><div class="featureicon">${lucide('users')}</div><h3>Customers &amp; suppliers</h3><p>Keep contact details organized and quickly select a customer or supplier with a smart search when creating invoices.</p></article><article><div class="featureicon">${lucide('wallet')}</div><h3>Expense tracking</h3><p>Record shop expenses with paid and due amounts, so you always know exactly where your money is going.</p></article><article><div class="featureicon">${lucide('coins')}</div><h3>Due recovery</h3><p>Track outstanding dues on sales, purchases, and expenses — and record recoveries the moment customers pay.</p></article><article><div class="featureicon">${lucide('user-check')}</div><h3>Staff permissions</h3><p>Create individual staff accounts and control who can view, add, edit, or delete in each operational area.</p></article><article><div class="featureicon">${lucide('chart')}</div><h3>Business reports</h3><p>Get summary, sales, purchase, and expense reports with clear totals and profit figures for any date range.</p></article><article><div class="featureicon">${lucide('shield')}</div><h3>Traceable activity</h3><p>Record operational activity, device logins, attendance, and system errors for stronger accountability.</p></article><article class="premium"><div class="featureicon">${lucide('mail')}</div><em class="featuretag">Premium</em><h3>ConnectX</h3><p>Send professional business emails to customers and suppliers directly through your shop — with invoice attachments.</p></article><article class="premium"><div class="featureicon">${lucide('sparkles')}</div><em class="featuretag">Premium</em><h3>Zudo AI</h3><p>A read-only AI assistant that answers questions about your sales, purchases, inventory, customers, and dues.</p></article><article class="premium"><div class="featureicon">${lucide('activity')}</div><em class="featuretag">Premium</em><h3>AI Business Health</h3><p>Generate a business-health report with a score, risk findings, and practical AI recommendations for any period.</p></article><article class="premium"><div class="featureicon">${lucide('qr')}</div><em class="featuretag">Premium</em><h3>TrueBill</h3><p>Put a scannable QR code on every invoice so customers can verify authenticity with one scan.</p></article><article class="premium"><div class="featureicon">${lucide('msg')}</div><em class="featuretag">Premium</em><h3>HelpDesk</h3><p>A built-in messenger that connects you directly with EMS support for fast help whenever you need it.</p></article></div></section><section class="stats section"><div class="statsgrid"><div class="stat"><b>All-in-one</b><span>Inventory, sales, purchases, expenses, customers &amp; staff in one place</span></div><div class="stat"><b>Multi-shop</b><span>Manage every store from a single administrator account</span></div><div class="stat"><b>Real-time</b><span>Stock and totals update the moment you post a transaction</span></div><div class="stat"><b>Secure</b><span>Custom credentials, device tracking and full activity logs</span></div></div></section>
<section class="section why"><p class="eyebrow">WHY EMS V1</p><h2>Built to run a real shop, not just record it</h2><p class="sectionlead">Every tool is designed around how retail businesses actually work — from the counter to the back office.</p><div class="whygrid"><div class="whycol"><h3>For shop owners</h3><ul><li>One dashboard for sales, stock, dues and expenses</li><li>Know your profit and outstanding dues at a glance</li><li>License-based multi-store control with staff limits</li><li>Approve or restrict staff actions per module</li></ul></div><div class="whycol"><h3>For staff</h3><ul><li>Fast invoice entry with smart customer &amp; item search</li><li>Clear permissions — see and do only what you should</li><li>Attendance and activity tracking built in</li><li>Works on any device with an internet connection</li></ul></div><div class="whycol"><h3>For your customers</h3><ul><li>Professional invoices with tax, discount and due</li><li>Scan-to-verify TrueBill QR codes for trust</li><li>Instant records of every transaction</li><li>Fast due recovery with clear payment history</li></ul></div></div></section>
<section class="workflow"><div><p class="eyebrow">A CLEAR WORKFLOW</p><h2>From setup to sale in four steps</h2><ol><li><b>1</b><div><strong>Create your administrator account</strong><span>Set up your business profile with your own custom credentials.</span></div></li><li><b>2</b><div><strong>Add and activate a store</strong><span>Submit your license payment information for manual verification.</span></div></li><li><b>3</b><div><strong>Add staff, products, and contacts</strong><span>Control what each staff member can access.</span></div></li><li><b>4</b><div><strong>Record purchases and sales</strong><span>Let EMS update stock and financial totals as you work.</span></div></li></ol></div><aside><small>EMS V1 PROMISE</small><h3>Business records that stay organized.</h3><p>Use a single cloud-based workspace for daily shop operations, with access from approved devices.</p><button id="workflowAdmin">Get started as administrator</button></aside></section><section id="pricing" class="section pricing"><p class="eyebrow">STRAIGHTFORWARD PRICING</p><h2>Choose your license period</h2><p class="sectionlead">One store license per selected period. Submit bKash or Nagad payment details after creating a store; each claim is manually verified before activation.</p><div id="publicPricing" class="planGrid"><p class="muted">Loading current EMS license plans…</p></div><p class="fineprint">Payment methods: bKash and Nagad. A transaction ID is required. Payments are subject to manual verification.</p></section><section class="cta"><div><h2>Ready to bring your shop operations together?</h2><p>Create an administrator account and set up your first store.</p></div><button id="ctaStart">Get started</button></section><section class="faq section"><p class="eyebrow">FREQUENTLY ASKED QUESTIONS</p><h2>Before you begin</h2><details><summary>Does EMS use Google, Facebook, or third-party login?</summary><p>No. Administrators and shop staff use custom EMS credentials stored through the application’s secure backend.</p></details><details><summary>When does a store become active?</summary><p>A store is activated after a license payment claim is manually checked and approved.</p></details><details><summary>Can I have different staff access levels?</summary><p>Yes. Staff permissions can be assigned per module for viewing, adding, editing, and deleting records.</p></details><details><summary>What payment methods do you accept?</summary><p>License payments are accepted via bKash and Nagad. Each payment is manually verified before activation.</p></details><details><summary>Can I manage more than one shop?</summary><p>Yes. One administrator account can create and manage multiple shops, depending on the license plan you choose.</p></details><details><summary>What are the premium add-ons?</summary><p>Premium add-ons are optional paid services — ConnectX email, Zudo AI assistant, AI Business Health reports, TrueBill invoice verification, and HelpDesk support chat.</p></details><details><summary>How is inventory tracked?</summary><p>Stock levels update automatically when you post purchases or sales, and low-stock alerts help you reorder before items run out.</p></details><details><summary>Can I verify an invoice is genuine?</summary><p>Yes. TrueBill puts a scannable QR code on invoices, so customers can instantly verify authenticity on our website.</p></details></section></main><footer><div class="wordmark"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></div><span>© ${new Date().getFullYear()} DoxTox. All rights reserved.</span><a href="/?page=contact">Contact</a> · <a href="/?page=terms">Terms & Conditions</a></footer><div class="authlayer" id="authlayer" hidden></div>`;let open=m=>showAuth(m);['adminLogin','workflowAdmin','heroStart','ctaStart'].forEach(id=>$('#'+id).onclick=()=>open('admin'));['shopLogin','heroShop'].forEach(id=>$('#'+id).onclick=()=>open('shop'));$('#emsLogin').onclick=()=>showEmsLogin();document.querySelectorAll('[data-plan]').forEach(x=>x.onclick=()=>open('admin'));api('public/branding').then(b=>{document.title=(b.website_name||'EMS V1')+' | DoxTox';document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{});api('public/license-plans').then(plans=>{let box=$('#publicPricing');box.innerHTML=plans.length?plans.map((p,i)=>planCardHtml(p,{featured:i===1,attr:'data-public-plan'})).join(''):'<p class="muted">No license plans are currently published.</p>';document.querySelectorAll('[data-public-plan]').forEach(x=>x.onclick=()=>open('admin'))}).catch(()=>{$('#publicPricing').innerHTML='<p class="muted">License plans are temporarily unavailable.</p>'})}
function forgotPassword(type){
  const label=type==='owner'?'EMS Owner':type==='admin'?'Administrator':'Shop staff';
  const back=()=>{if(type==='owner')showEmsLogin();else if(type==='admin')showAuth('admin');else showAuth('shop')};
  let resetToken=null, step=1;
  const layer=$('#authlayer');
  layer.hidden=false;
  const render=()=>{
    let body='';
    if(step===1){
      body=type==='staff'
        ?`<h2>Reset ${label} password</h2><p class="muted">Enter your Shop ID and the staff email registered on your account.</p><label>Shop ID<input id="fpShop" inputmode="numeric" maxlength="4" placeholder="4-digit Shop ID"></label><label>Staff email<input id="fpEmail" type="email" placeholder="you@example.com"></label><button type="button" id="fpSend">Send OTP</button><button class="linkbutton" type="button" id="fpToLogin">← Back to sign in</button>`
        :`<h2>Reset ${label} password</h2><p class="muted">Enter the email registered on your account.</p><label>Email<input id="fpEmail" type="email" placeholder="you@example.com"></label><button type="button" id="fpSend">Send OTP</button><button class="linkbutton" type="button" id="fpToLogin">← Back to sign in</button>`;
    }else if(step===2){
      body=`<h2>Enter OTP</h2><p class="muted">We emailed a 6-digit code to your address (valid 10 minutes).</p><label>One-time code<input id="fpOtp" inputmode="numeric" maxlength="6" placeholder="123456"></label><button type="button" id="fpVerify">Verify</button><button class="linkbutton" type="button" id="fpBack">← Change email</button>`;
    }else{
      body=`<h2>New password</h2><p class="muted">Choose a new password (min 10 characters).</p><label>New password<input id="fpPw" type="password" minlength="10"></label><label>Retype new password<input id="fpPw2" type="password" minlength="10"></label><button type="button" id="fpSave">Save new password</button>`;
    }
    layer.innerHTML=`<div class="authmodal"><button class="close" id="fpClose">×</button><p class="eyebrow">PASSWORD RECOVERY</p><form class="fields" id="fpForm">${body}</form></div>`;
    layer.querySelector('#fpClose').onclick=()=>{layer.hidden=true};
    const backBtn=layer.querySelector('#fpToLogin');
    if(backBtn)backBtn.onclick=back;
    if(step===1){
      layer.querySelector('#fpSend').onclick=async()=>{const email=layer.querySelector('#fpEmail').value.trim(),shop=layer.querySelector('#fpShop')?.value.trim();if(!email)return toast('Enter your email.');if(type==='staff'&&!shop)return toast('Enter your Shop ID.');try{const r=await api('auth/forgot-password',{method:'POST',body:JSON.stringify({type,email,shopCode:shop})});resetToken=r.resetToken;if(!resetToken)return toast(r.note||'No account found with that email.');toast('OTP sent — check your email.');step=2;render()}catch(err){toast(err.message)}};
    }else if(step===2){
      layer.querySelector('#fpVerify').onclick=async()=>{const otp=layer.querySelector('#fpOtp').value.trim();if(!otp)return toast('Enter the OTP.');try{await api('auth/verify-otp',{method:'POST',body:JSON.stringify({resetToken,otp})});toast('OTP verified.');step=3;render()}catch(err){toast(err.message)}};
      layer.querySelector('#fpBack').onclick=()=>{step=1;resetToken=null;render()};
    }else{
      layer.querySelector('#fpSave').onclick=async()=>{const pw=layer.querySelector('#fpPw').value,pw2=layer.querySelector('#fpPw2').value;if(pw.length<10)return toast('Password must be at least 10 characters.');if(pw!==pw2)return toast('Passwords do not match.');try{await api('auth/reset-password',{method:'POST',body:JSON.stringify({resetToken,password:pw,password2:pw2})});layer.hidden=true;toast('Password updated. Sign in with your new password.');back()}catch(err){toast(err.message)}};
    }
  };
  render();
}


function showAuth(mode){let layer=$('#authlayer');layer.hidden=false;layer.innerHTML=`<div class="authmodal"><button class="close" id="closeAuth">×</button><p class="eyebrow">EMS V1 ACCESS</p><div class="tabs"><button class="${mode==='admin'?'on':''}" id="tabAdmin">Administrator</button><button class="${mode==='shop'?'on':''}" id="tabShop">Shop staff</button></div><form id="authform" class="fields">${mode==='admin'?`<h2>Administrator sign in</h2><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="10" required></label><button>Sign in</button><button class="linkbutton" type="button" id="forgotAdmin">Forgot password?</button><button class="linkbutton" type="button" id="register">Create administrator account</button>`:`<h2>Shop sign in</h2><label>4-digit Shop ID<input name="storeId" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Example: 1234" required></label><label>Staff User ID or Administrator Email<input name="userId" required></label><label>Password<input name="password" type="password" required></label><button>Sign in to shop</button><button class="linkbutton" type="button" id="forgotShop">Forgot password?</button>`}</form></div>`;$('#closeAuth').onclick=()=>{layer.hidden=true};$('#tabAdmin').onclick=()=>showAuth('admin');$('#tabShop').onclick=()=>showAuth('shop');let reg=$('#register');if(reg)reg.onclick=register;let fa=$('#forgotAdmin');if(fa)fa.onclick=()=>forgotPassword('admin');let fs=$('#forgotShop');if(fs)fs.onclick=()=>forgotPassword('staff');$('#authform').onsubmit=async e=>{e.preventDefault();try{let b=Object.fromEntries(new FormData(e.target));let r=await api('auth/'+(mode==='admin'?'admin/login':'shop/login'),{method:'POST',body:JSON.stringify(b)});if(r.adminReturn)localStorage.setItem('ems.admin.return',JSON.stringify(r.adminReturn));save(r);home()}catch(x){toast(x.message)}}}
function showEmsLogin(){let layer=$('#authlayer');layer.hidden=false;layer.innerHTML=`<div class="authmodal"><button class="close" id="closeAuth">×</button><p class="eyebrow">PRIVATE PLATFORM ACCESS</p><form class="fields" id="emsform"><h2>EMS login</h2><p class="muted">For the EMS platform owner only.</p><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button>Sign in to EMS control</button><button class="linkbutton" type="button" id="forgotOwner">Forgot password?</button><button class="linkbutton" type="button" id="initializeOwner">Initialize first EMS owner</button></form></div>`;$('#closeAuth').onclick=()=>layer.hidden=true;$('#initializeOwner').onclick=()=>emsRegister();$('#forgotOwner').onclick=()=>forgotPassword('owner');$('#emsform').onsubmit=async e=>{e.preventDefault();try{save(await api('auth/ems/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}));home()}catch(x){toast(x.message)}}}
function emsRegister(){let layer=$('#authlayer');layer.innerHTML=`<div class="authmodal"><button class="close" id="closeAuth">×</button><p class="eyebrow">ONE-TIME INITIALIZATION</p><form class="fields" id="ownerform"><h2>Create EMS owner</h2><p class="muted">This is available only while no EMS owner exists. Use a private, strong password.</p><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password <span class="muted">(12+ characters)</span><input name="password" type="password" minlength="12" required></label><button>Initialize EMS owner</button><button class="linkbutton" type="button" id="backEms">Back to EMS login</button></form></div>`;$('#closeAuth').onclick=()=>layer.hidden=true;$('#backEms').onclick=showEmsLogin;$('#ownerform').onsubmit=async e=>{e.preventDefault();try{save(await api('auth/ems/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}));home()}catch(x){toast(x.message)}}}
function register(){let layer=$('#authlayer');layer.hidden=false;layer.innerHTML=`<div class="authmodal"><button class="close" id="closeAuth">×</button><p class="eyebrow">START WITH EMS V1</p><form class="fields" id="reg"><h2>Create administrator account</h2><div class="grid2"><label>Full name<input name="name" required></label><label>Phone<input name="phone" required></label></div><label>Address<textarea name="address"></textarea></label><label>Email<input name="email" type="email" required></label><label>Password <span class="muted">(10+ characters)</span><input name="password" type="password" minlength="10" required></label><button>Create account</button><button type="button" class="linkbutton" id="backLogin">Back to sign in</button></form></div>`;$('#closeAuth').onclick=()=>layer.hidden=true;$('#backLogin').onclick=()=>showAuth('admin');$('#reg').onsubmit=async e=>{e.preventDefault();try{save(await api('auth/admin/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}));home()}catch(x){toast(x.message)}}}
const LUCIDE={
search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
briefcase:'<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
banknote:'<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
filetext:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
history:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
save:'<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
truck:'<path d="M5 18H3a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1h-2"/><path d="M15 9h3l3 3v5a1 1 0 0 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
package:'<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
cart:'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
coins:'<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
chart:'<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
settings:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
sparkles:'<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
devices:'<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M10 19v-3"/><path d="M7 19h5"/><rect x="16" y="12" width="6" height="10" rx="2"/>',
'msg':'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
gem:'<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
list:'<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
palette:'<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.57 1.5-1.5 0-.38-.14-.73-.38-1-.24-.27-.37-.62-.37-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.5-9-10-9z"/>',
file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
rss:'<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
qr:'<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
circle:'<circle cx="12" cy="12" r="10"/>',
activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
sheet:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
docfile:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
folder:'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
'folder-open':'<path d="m6 14 1.45-2.5a2 2 0 0 1 1.73-1H20"/><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2Z"/>',
'folder-plus':'<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/>',
paperclip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
banknote:'<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
percent:'<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
tag:'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
menu:'<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
bell:'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
const lucide=n=>`<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[n]||LUCIDE.circle}</svg>`;
const menus=[['Dashboard','dashboard','dashboard'],['Suppliers','supplier','truck'],['Customers','customer','users'],['Inventory','inventory','package'],['Purchases','purchase','cart'],['Sales','sales','receipt'],['Expense','expense','wallet'],['Due Recover','due_recover','coins'],['Staff Manager','staff','user-check'],['Report','report','chart'],['Settings','settings','settings'],['ConnectX','connectx','mail'],['Zudo','zudo','sparkles'],['Vaultium','vaultium','file']];const canAccess=(section,action='view')=>{if(state?.role==='admin'||state?.adminAccess)return true;if(state?.readOnly&&action!=='view'&&!((section==='connectx'&&action==='add')||(section==='zudo'&&action==='add')))return false;if(section==='dashboard'&&action==='view')return true;let p=state?.permissions||{};return (p[section]||[]).includes(action)};function home(){if(state?.role==='staff'&&permissionSyncedFor!==state.token){Promise.all([api('me'),api('connectx/availability').catch(()=>({enabled:false})),api('zudo/availability').catch(()=>({enabled:false})),api('business-health/availability').catch(()=>({enabled:false,ever:false})),api('vaultium/availability').catch(()=>({enabled:false,ever:false}))]).then(([m,cx,zudo,bh,vault])=>{state.permissions=m.permissions||{};state.readOnly=!!m.readOnly;state.licenseExpired=!!m.licenseExpired;state.connectxEnabled=!!cx.enabled;state.connectxHistory=!!cx.history;state.zudoEnabled=!!zudo.enabled;state.zudoHistory=!!zudo.history;state.businessHealthEnabled=!!bh.enabled;state.businessHealthEver=!!bh.ever;state.vaultiumEnabled=!!vault.enabled;state.vaultiumEver=!!vault.ever;permissionSyncedFor=state.token;save(state);home()}).catch(e=>{toast(e.message);logout()});return}if(state?.role==='admin'&&entitlementSyncedFor!==state.token){api('admin/entitlement').then(x=>{state.licenseExpired=!!x.hasActivatedLicense&&!x.active;state.entitlement=x;entitlementSyncedFor=state.token;save(state);home()}).catch(e=>{toast(e.message);logout()});return}if(state.role==='owner')return ownerHome();if(state.role==='admin')return adminHome();return shopHome()}
function readOnlyNotice(){if(document.querySelector('.licenseExpiryModal')||document.querySelector('.adm-notice')||document.querySelector('.shp-notice'))return;let isAdmin=state?.role==='admin',exp=!!state.licenseExpired;if(isAdmin){let e=document.createElement('div');e.className='adm-modal adm-notice';e.innerHTML=`<div class="adm-modalbox"><div class="adm-modalhead"><h2>${exp?'License expired':'Read-Only mode'}</h2><button type="button" class="adm-x" aria-label="Close">×</button></div><div class="adm-modalbody"><p>${exp?'Your administrator license has expired. To continue operating shops, creating invoices, changing data, or using ConnectX, purchase and activate a new license.':'This shop is currently in Read-Only mode. You can view records but cannot add, edit, or delete data.'}</p><p class="adm-desc">${exp?'Your shop data and license history are safely preserved. Shops are currently operating in Read-Only mode.':'Contact your administrator to restore full access.'}</p><div class="adm-form-actions"><button id="goLicenses" class="adm-btn adm-btn-primary">View license plans</button></div></div></div>`;document.body.append(e);e.querySelector('.adm-x').onclick=()=>e.remove();$('#goLicenses').onclick=()=>{e.remove();adminPage('licenses')};return}let e=shpModal(exp?'License expired':'Read-Only mode',`<p>${exp?'Your administrator license has expired. To continue operating shops, creating invoices, changing data, or using ConnectX, purchase and activate a new license.':'This shop is currently in Read-Only mode. You can view records but cannot add, edit, or delete data.'}</p><p class="shp-desc">${exp?'Your shop data and license history are safely preserved. Shops are currently operating in Read-Only mode.':'Contact your administrator to restore full access.'}</p><div class="shp-form-actions"><button class="shp-btn shp-btn-primary" id="closeExpiry">Continue</button></div>`);e.classList.add('shp-notice');$('#closeExpiry').onclick=()=>e.remove()}
/* title(): replaced by shpHead() in the Shop Panel theme */async function page(p){
  document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('on',x.dataset.page===p));
  const t=$('#shpTopTitle');if(t)t.textContent=SHP_LABEL[p]||p.replaceAll('-',' ');
  let el=$('#page');el.innerHTML=skelFor(SHP_SKEL,p);
  try{
    if(p==='dashboard')return await dashboard();
    if(['suppliers','customers','inventory','expense','staff-manager'].includes(p))return await entity(p);
    if(p==='attendance')return await attendancePage();
    if(p==='salary')return await salaryPage();
    if(p==='vaultium')return await vaultiumPage();
    if(['purchases','sales'].includes(p))return await invoices(p);
    if(p==='sale-invoice')return await invoicePage('sale');
    if(p==='due-recover')return await dueRecover();
    if(p==='report')return await report();
    if(p==='connectx')return await connectX();
    if(p==='zudo')return await zudo();
    if(p==='settings')return await settings();
    el.innerHTML=shpHead('EMS · Shop',p.replaceAll('-',' '))+`<section class="shp-panel"><p>This module is reserved for the next EMS update. It is intentionally not represented with fabricated records.</p></section>`
  }catch(e){el.innerHTML=`<section class="shp-panel"><h2>Could not load this page</h2><p>${esc(e.message)}</p></section>`}
}
/* ================================================================
   EMS OWNER CONSOLE — Agent Bento Grid UI (VengeanceUI style)
   Fresh Owner Panel presentation. Every API call, endpoint, payload,
   permission and workflow below is identical to the original panel.
   All styling lives in assets/css/owner.css (scoped to body.ob-on).
   ================================================================ */
const OB_NAV=[
  {h:'Platform',items:[['overview','Overview','grid']]},
  {h:'Business',items:[['licenses','License control','shield'],['plans','License plans','list'],['administrators','Administrators','users'],['shops','Shops','store']]},
  {h:'Website',items:[['branding','Website branding','palette'],['website-pages','Website pages','file'],['blogs','Blogs','rss'],['contact-messages','Contact messages','inbox']]},
  {h:'Services',items:[['connectx','ConnectX','mail'],['zudo','Zudo AI','sparkles'],['truebill','TrueBill','qr'],['vaultium','Vaultium','package'],['helpdesk','HelpDesk','help'],['addons','Premium Add-Ons','gem']]},
  {h:'System',items:[['factory-reset','Factory reset','refresh']]}
];
const OB_LABEL=Object.fromEntries(OB_NAV.flatMap(g=>g.items.map(([p,l])=>[p,l])));
const OB_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const OB_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const obChip=(icon,tone='violet')=>`<span class="ob-chip ob-t-${tone}">${lucide(icon)}</span>`;
const obBadge=(txt,tone='zinc')=>`<span class="ob-badge ob-t-${tone}">${txt}</span>`;
/* page titles live in the owner topbar; only head actions render */
const obHead=(p,sub='',action='')=>action?`<div class="ob-head-actions">${action}</div>`:'';
const obEmpty=msg=>`<div class="ob-empty"><i></i><p>${msg}</p></div>`;
const obMeter=(used,limit)=>{const pct=Math.max(0,Math.min(100,limit?Math.round(used/limit*100):0));return `<div class="ob-meter" title="${used} of ${limit}"><i style="width:${pct}%"></i></div><span class="ob-meter-note"><b>${used}</b> / ${limit} used today</span>`};
function obModal(title,inner,cls=''){const e=document.createElement('div');e.className='ob-modal';e.innerHTML=`<div class="ob-modalbox ${cls}"><div class="ob-modalhead"><h2>${title}</h2><button type="button" class="ob-x" aria-label="Close">×</button></div><div class="ob-modalbody">${inner}</div></div>`;document.body.append(e);e.querySelector('.ob-x').onclick=()=>e.remove();return e}
const obKpi=(icon,tone,label,value,foot)=>`<section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip(icon,tone)}<span class="ob-kicker">${esc(label)}</span></div><strong class="ob-kpi-val">${value}</strong><span class="ob-kpi-foot">${foot}</span></section>`;


/* ═══════════════ EMS ADMIN CONSOLE (Agent Bento Grid) ═══════════════ */
const ADM_NAV=[
  {h:'Business',items:[['stores','Store manage','store'],['licenses','Licenses','key'],['addons','Premium Add-Ons','gem']]},
  {h:'Account',items:[['profile','My profile','user'],['devices','Devices','devices'],['helpdesk','HelpDesk','help']]}
];
const ADM_LABEL=Object.fromEntries(ADM_NAV.flatMap(g=>g.items.map(([p,l])=>[p,l])));
const ADM_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const ADM_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const admChip=(icon,tone='sky')=>`<span class="adm-chip adm-t-${tone}">${lucide(icon)}</span>`;
const admBadge=(txt,tone='zinc')=>`<span class="adm-badge adm-t-${tone}">${txt}</span>`;
/* page titles live in the admin topbar; only head actions render */
const admHead=(p,sub='',action='')=>action?`<div class="adm-head-actions">${action}</div>`:'';
const admEmpty=msg=>`<div class="adm-empty"><i></i><p>${msg}</p></div>`;

/* ═══ Skeleton loading system — shared by all three Agent Bento panels.
   Markup comes from the SKEL builders; visuals come from the .sk* rules in
   app.css, which read each panel's design tokens (--sk-* mapped in
   owner.css / admin.css / shop.css). Skeletons mirror the real bento
   metrics (20px cards, 4-col KPI grids, 14px tables) so content swaps in
   without layout shift. ═══ */
const sk=(w='',h='')=>`<span class="sk" style="${w?`width:${w};`:''}${h?`height:${h}px;`:''}"></span>`;
const skC=(s=26)=>`<span class="sk sk-c" style="width:${s}px;height:${s}px"></span>`;
const skLines=(n=2)=>`<span class="sk-lines">${Array.from({length:n},(_,i)=>sk(i===n-1?'58%':'92%')).join('')}</span>`;
const SKEL={
  kpi(){return `<div class="sk-card sk-kpi"><div class="sk-row">${skC(26)}${sk('46%')}</div>${sk('72%',22)}${sk('42%')}</div>`},
  kpis:(n=4)=>`<div class="sk-kpis">${Array.from({length:n},()=>SKEL.kpi()).join('')}</div>`,
  head:()=>`<div class="sk-row sk-between">${skLines(2)}${sk('64px',20)}</div>`,
  panel:(inner='')=>`<div class="sk-panel">${SKEL.head()}${inner}</div>`,
  table:(rows=6,cols=6)=>`<div class="sk-tw"><div class="sk-thead">${Array.from({length:cols},()=>sk('64px',8)).join('')}</div>${Array.from({length:rows},(_,r)=>`<div class="sk-tr">${Array.from({length:cols},(_,c)=>sk(c===0?'72px':(82+((r*31+c*47)%70))+'px',11)).join('')}</div>`).join('')}</div>`,
  toolbar:()=>`<div class="sk-toolbar">${sk('118px',34)}${sk('min(420px,58%)',34)}</div>`,
  chips:(n=4)=>`<div class="sk-chips">${Array.from({length:n},(_,i)=>sk((74+i*26)+'px',24)).join('')}</div>`,
  chart:()=>`<div class="sk-fchart">${[62,42,30,52].map(h=>`<div class="sk-fcol"><div class="sk-ftrack">${sk('100%',h)}</div>${sk('56%')}${sk('40%',9)}</div>`).join('')}</div>`,
  trend:()=>`<div class="sk-panel">${SKEL.head()}<div class="sk-trend"></div></div>`,
  kv:(n=8)=>`<div class="sk-kv">${Array.from({length:n},()=>`<div class="sk-kvrow">${sk('34%')}${sk('26%')}</div>`).join('')}</div>`,
  form:(n=4)=>`<div class="sk-formgrid">${Array.from({length:n},()=>`<div class="sk-field">${sk('38%',9)}${sk('100%',34)}</div>`).join('')}</div>`,
  cards:(n=3)=>`<div class="sk-cards">${Array.from({length:n},()=>`<div class="sk-card"><div class="sk-row">${skC(26)}${sk('50%')}</div>${sk('62%',15)}${skLines(3)}${sk('100%',32)}</div>`).join('')}</div>`,
  list:(n=4,avatar=true)=>`<div class="sk-list">${Array.from({length:n},()=>`<div class="sk-listrow">${avatar?skC(28):''}${skLines(2)}</div>`).join('')}</div>`,
  msgs:(n=3)=>`<div class="sk-msgs">${Array.from({length:n},(_,i)=>`<div class="sk-msg" style="align-items:${i%2?'flex-end':'flex-start'}">${sk('44px',8)}${sk((56+i*12)+'%',36+i*10)}</div>`).join('')}</div>`,
  grid:(cols='',a='',b='')=>`<div class="sk-split"${cols?` style="grid-template-columns:${cols}"`:''}>${a}${b}</div>`,
  bars:()=>`<div class="sk-rbars">${sk('100%',14)}${sk('76%',14)}${sk('52%',14)}</div>`,
};
/* per-page skeletons (kept beside each panel's router) */
const SHP_SKEL={
  _:()=>SKEL.panel(SKEL.table()),
  dashboard:()=>SKEL.kpis(4)+SKEL.grid('minmax(0,1fr) minmax(0,1fr)',SKEL.panel(SKEL.chart()),SKEL.panel(SKEL.table(4,7)))+SKEL.trend(),
  suppliers:()=>SKEL.toolbar()+SKEL.table(6,7),customers:()=>SKEL.toolbar()+SKEL.table(6,7),expense:()=>SKEL.toolbar()+SKEL.table(6,7),
  inventory:()=>SKEL.toolbar()+SKEL.table(6,7),purchases:()=>SKEL.toolbar()+SKEL.table(5,8),sales:()=>SKEL.toolbar()+SKEL.table(5,8),'sale-invoice':()=>SKEL.toolbar()+SKEL.panel(SKEL.form(8)),
  'due-recover':()=>SKEL.toolbar()+SKEL.table(5,8),'staff-manager':()=>SKEL.toolbar()+SKEL.table(5,8),
  attendance:()=>SKEL.grid('minmax(0,1.2fr) minmax(0,1fr)',SKEL.panel(SKEL.list(4)),SKEL.panel(SKEL.table(3,6))),
  salary:()=>SKEL.grid('240px minmax(0,1fr)',SKEL.list(4),SKEL.kpis(4)+SKEL.panel(SKEL.form(6))+SKEL.panel(SKEL.table(3,5))),
  report:()=>SKEL.chips(5)+SKEL.kpis(4)+`<div class="sk-grid2">${SKEL.panel(SKEL.bars())}${SKEL.panel(SKEL.kv(4))}</div>`,
  settings:()=>SKEL.chips(2)+SKEL.panel(SKEL.kv(8)),
  connectx:()=>SKEL.grid('230px minmax(0,1fr)',SKEL.list(3),SKEL.panel(SKEL.form(4))),
  zudo:()=>SKEL.grid('212px minmax(0,1fr)',SKEL.list(3,false),`<div class="sk-zmain">${SKEL.msgs(3)}${sk('100%',42)}</div>`),
  vaultium:()=>SKEL.kpis(3)+SKEL.panel(SKEL.table(5,4)),
};
const ADM_SKEL={
  _:()=>SKEL.panel(SKEL.table()),
  stores:()=>SKEL.kpis(4)+SKEL.cards(3)+SKEL.panel(SKEL.table(3,5)),
  licenses:()=>SKEL.kpis(4)+SKEL.cards(3)+SKEL.panel(SKEL.table(3,6)),
  addons:()=>SKEL.cards(3)+SKEL.panel(SKEL.table(4,5)),
  profile:()=>SKEL.panel(SKEL.form(4)),
  devices:()=>SKEL.kpis(3)+SKEL.panel(SKEL.table(5,5)),
  helpdesk:()=>SKEL.panel(SKEL.msgs(4)+sk('100%',42)),
};
const OB_SKEL={
  _:()=>SKEL.panel(SKEL.table()),
  overview:()=>SKEL.kpis(4)+`<div class="sk-grid2">${SKEL.panel(SKEL.table(4,4))}${SKEL.panel(SKEL.kv(5))}</div>`+SKEL.panel(SKEL.table(3,6)),
  licenses:()=>SKEL.toolbar()+SKEL.table(6,7),plans:()=>SKEL.cards(3)+SKEL.panel(SKEL.table(3,5)),
  administrators:()=>SKEL.kpis(4)+SKEL.table(6,6),shops:()=>SKEL.toolbar()+SKEL.table(6,7),
  branding:()=>SKEL.panel(SKEL.form(6)),'website-pages':()=>SKEL.toolbar()+SKEL.table(4,4),
  blogs:()=>SKEL.toolbar()+SKEL.table(4,5),'contact-messages':()=>SKEL.toolbar()+SKEL.table(5,5),
  connectx:()=>SKEL.panel(SKEL.table(4,5)),zudo:()=>SKEL.panel(SKEL.table(4,5)),
  truebill:()=>SKEL.panel(SKEL.table(4,5)),vaultium:()=>SKEL.panel(SKEL.table(4,5)),
  helpdesk:()=>SKEL.grid('300px minmax(0,1fr)',SKEL.list(5),SKEL.panel(SKEL.msgs(4))),
  addons:()=>SKEL.toolbar()+SKEL.table(5,5),'factory-reset':()=>SKEL.panel(SKEL.form(4)),
};
const skelFor=(map,p)=>(map[p]||map._)();
const admMeter=(used,limit)=>{const pct=Math.max(0,Math.min(100,limit?Math.round(used/limit*100):0));return `<div class="adm-meter" title="${used} of ${limit}"><i style="width:${pct}%"></i></div>`};
function admModal(title,inner,cls=''){const e=document.createElement('div');e.className='adm-modal';e.innerHTML=`<div class="adm-modalbox ${cls}"><div class="adm-modalhead"><h2>${title}</h2><button type="button" class="adm-x" aria-label="Close">×</button></div><div class="adm-modalbody">${inner}</div></div>`;document.body.append(e);e.querySelector('.adm-x').onclick=()=>e.remove();return e}
const admKpi=(icon,tone,label,value,foot)=>`<section class="adm-card adm-kpi"><div class="adm-kpi-top">${admChip(icon,tone)}<span class="adm-kicker">${esc(label)}</span></div><strong class="adm-kpi-val">${value}</strong><span class="adm-kpi-foot">${foot}</span></section>`;

function adminHome(){document.body.classList.remove('shp-on');
  document.body.classList.add('adm-on');
  if(!document.body.dataset.admTheme)document.body.dataset.admTheme=localStorage.getItem('ems.admTheme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const dark=document.body.dataset.admTheme==='dark';
  app.innerHTML=`<div class="adm">
    <aside class="adm-side">
      <div class="adm-brand"><span class="adm-mark adm-t-sky">${lucide('grid')}</span><div class="adm-brandtext"><b data-brand-name>${sk('62px',12)}</b><small>powered by <span data-powered-by>${sk('42px',8)}</span></small></div></div>
      <nav class="adm-nav">${ADM_NAV.map(g=>`<div class="adm-navgroup"><p>${esc(g.h)}</p>${g.items.map(([p,l,i])=>`<button data-admin-page="${p}" title="${esc(l)}"><span class="adm-navicon">${lucide(i)}</span><span class="adm-navlabel">${esc(l)}</span>${p==='helpdesk'?`<span class="adm-navbadge" id="ahbBadge" hidden></span>`:''}</button>`).join('')}</div>`).join('')}</nav>
      <div class="adm-sidefoot"><button id="out" class="adm-btn adm-btn-ghost adm-btn-sm">${lucide('undo')} Sign out</button></div>
    </aside>
    <div class="adm-main">
      <header class="adm-top">
        <button class="adm-iconbtn appBurger" id="admBurger" type="button" aria-label="Open navigation menu" aria-expanded="false">${lucide('menu')}</button>
        <div class="adm-toppage"><span>EMS admin console</span><b id="admTopTitle">Store manage</b></div>
        <div class="adm-topactions">
          <button id="ntfBell" class="adm-iconbtn" type="button" title="Notifications" aria-label="Notifications" aria-expanded="false">${lucide('bell')}</button>
          <button id="admTheme" class="adm-iconbtn" type="button" title="Switch light / dark appearance" aria-label="Switch appearance">${dark?ADM_SUN:ADM_MOON}</button>
          <span class="adm-user"><i>${esc(String(state.user.name||'?').slice(0,1).toUpperCase())}</i><b>${esc(state.user.name)}</b></span>
        </div>
      </header>
      <main class="adm-page" id="page"></main>
    </div>
  </div>`;
  $('#out').onclick=logout;
  initNotifications('admin');
  api('public/branding').then(b=>{document.title=(b.website_name||'EMS V1')+' · Admin Console';document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{document.querySelectorAll('[data-brand-name]').forEach(x=>{if(!x.textContent)x.textContent='EMS V1'});document.querySelectorAll('[data-powered-by]').forEach(x=>{if(!x.textContent)x.textContent='DoxTox'})});
  document.querySelectorAll('[data-admin-page]').forEach(x=>x.onclick=()=>adminPage(x.dataset.adminPage));
  $('#admTheme').onclick=()=>{const next=document.body.dataset.admTheme==='dark'?'light':'dark';document.body.dataset.admTheme=next;localStorage.setItem('ems.admTheme',next);$('#admTheme').innerHTML=next==='dark'?ADM_SUN:ADM_MOON};
  if(state.licenseExpired)readOnlyNotice();
  adminPage('stores')
}

async function adminPage(p){
  document.querySelectorAll('[data-admin-page]').forEach(x=>x.classList.toggle('on',x.dataset.adminPage===p));
  const t=$('#admTopTitle');if(t)t.textContent=ADM_LABEL[p]||p;
  let el=$('#page');el.innerHTML=skelFor(ADM_SKEL,p);
  try{
    if(p==='stores')return await stores();
    if(p==='licenses')return await licenses();
    if(p==='addons')return await premiumAddons();
    if(p==='profile')return await profile();
    if(p==='devices')return await devices();
    if(p==='helpdesk')return await helpdeskAdmin();
  }catch(e){el.innerHTML=`<section class="adm-panel"><div class="adm-panel-head"><div><h3>Could not load this page</h3><p class="adm-desc">${esc(e.message)}</p></div></div></section>`}
}
function ownerHome(){document.body.classList.remove('shp-on');
  document.body.classList.add('ob-on');
  if(!document.body.dataset.obTheme)document.body.dataset.obTheme=localStorage.getItem('ems.obTheme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const dark=document.body.dataset.obTheme==='dark';
  app.innerHTML=`<div class="ob">
    <aside class="ob-side">
      <div class="ob-brand"><span class="ob-mark">${lucide('grid')}</span><div class="ob-brandtext"><b data-brand-name>${sk('62px',12)}</b><small>powered by <span data-powered-by>${sk('42px',8)}</span></small></div></div>
      <nav class="ob-nav">${OB_NAV.map(g=>`<div class="ob-navgroup"><p>${esc(g.h)}</p>${g.items.map(([p,l,i])=>`<button data-owner-page="${p}" title="${esc(l)}"><span class="ob-navicon">${lucide(i)}</span><span class="ob-navlabel">${esc(l)}</span>${p==='helpdesk'?'<span class="ob-navbadge" id="ohbBadge" hidden></span>':''}</button>`).join('')}</div>`).join('')}</nav>
      <div class="ob-sidefoot"><button id="out" class="ob-btn ob-btn-ghost ob-btn-sm">${lucide('undo')} Sign out</button></div>
    </aside>
    <div class="ob-main">
      <header class="ob-top">
        <button class="ob-iconbtn appBurger" id="obBurger" type="button" aria-label="Open navigation menu" aria-expanded="false">${lucide('menu')}</button>
        <div class="ob-toppage"><span>EMS owner console</span><b id="obTopTitle">Overview</b></div>
        <div class="ob-topactions">
          <button id="ntfBell" class="ob-iconbtn" type="button" title="Notifications" aria-label="Notifications" aria-expanded="false">${lucide('bell')}</button>
          <button id="obTheme" class="ob-iconbtn" type="button" title="Switch light / dark appearance" aria-label="Switch appearance">${dark?OB_SUN:OB_MOON}</button>
          <span class="ob-user"><i>${esc(String(state.user.name||'?').slice(0,1).toUpperCase())}</i><b>${esc(state.user.name)}</b></span>
        </div>
      </header>
      <main class="ob-page" id="page"></main>
    </div>
  </div>`;
  $('#out').onclick=logout;
  initNotifications('owner');
  api('public/branding').then(b=>{document.title=(b.website_name||'EMS V1')+' · Owner Console';document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{document.querySelectorAll('[data-brand-name]').forEach(x=>{if(!x.textContent)x.textContent='EMS V1'});document.querySelectorAll('[data-powered-by]').forEach(x=>{if(!x.textContent)x.textContent='DoxTox'})});
  document.querySelectorAll('[data-owner-page]').forEach(x=>x.onclick=()=>ownerPage(x.dataset.ownerPage));
  api('platform/helpdesk').then(list=>{const n=list.reduce((t,a)=>t+(a.unread||0),0),b=$('#ohbBadge');if(b){b.textContent=n;b.hidden=n===0}}).catch(()=>{});
  $('#obTheme').onclick=()=>{const next=document.body.dataset.obTheme==='dark'?'light':'dark';document.body.dataset.obTheme=next;localStorage.setItem('ems.obTheme',next);$('#obTheme').innerHTML=next==='dark'?OB_SUN:OB_MOON};
  ownerPage('overview')
}

async function ownerPage(p){
  document.querySelectorAll('[data-owner-page]').forEach(x=>x.classList.toggle('on',x.dataset.ownerPage===p));
  const t=$('#obTopTitle');if(t)t.textContent=OB_LABEL[p]||p;
  let el=$('#page');el.innerHTML=skelFor(OB_SKEL,p);
  try{let d=await api('platform/overview');
    if(p==='overview')return ownerOverview(d);
    if(p==='licenses')return ownerLicenses(d);
    if(p==='plans')return ownerPlans();
    if(p==='administrators')return ownerAdmins(d);
    if(p==='shops')return ownerShops(d);
    if(p==='branding')return ownerBranding();
    if(p==='website-pages')return ownerWebsitePages();
    if(p==='blogs')return ownerBlogs();
    if(p==='contact-messages')return ownerContactMessages();
    if(p==='connectx')return ownerConnectX();
    if(p==='zudo')return ownerZudo();
    if(p==='truebill')return await ownerTrueBill();
    if(p==='vaultium')return await ownerVaultium();
    if(p==='helpdesk')return await ownerHelpdesk();
    if(p==='addons')return await ownerAddons();
    if(p==='factory-reset')return ownerFactoryReset()
  }catch(e){el.innerHTML=`<section class="ob-panel"><div class="ob-panel-head"><div><h3>Could not load platform control</h3><p class="ob-desc">${esc(e.message)}</p></div></div></section>`}
}

function ownerOverview(d){
  const lic=d.licenses||[],act=lic.filter(x=>x.status==='active'),pen=lic.filter(x=>x.status==='pending'),rej=lic.filter(x=>x.status==='rejected');
  const actAdmins=d.admins.filter(x=>x.active).length,actStores=d.stores.filter(x=>x.status==='active').length;
  const segs=[['Active',act.length,'emerald'],['Pending',pen.length,'amber'],['Rejected',rej.length,'rose']].filter(s=>s[1]>0);
  $('#page').innerHTML=obHead('overview','Live snapshot of the EMS platform — accounts, shops and the license verification queue.')+`
  <div class="ob-grid ob-kpis">
    ${obKpi('users','sky','Administrators',d.admins.length,`${actAdmins} active account${actAdmins===1?'':'s'}`)}
    ${obKpi('store','violet','Shops',d.stores.length,`${actStores} active shop${actStores===1?'':'s'}`)}
    ${obKpi('shield','emerald','Active licenses',act.length,`${lic.length} license record${lic.length===1?'':'s'} total`)}
    ${obKpi('clock','amber','Pending verification',pen.length,'payments awaiting review')}
  </div>
  <div class="ob-grid ob-bento">
    <section class="ob-card ob-c2">
      <h3>License activity</h3>
      <p class="ob-desc">Every license record on the platform, grouped by review status.</p>
      <div class="ob-visual ob-dots ob-vpad">
        <div class="ob-stackbar">${segs.length?segs.map(([l,n,t2])=>`<i class="ob-t-${t2}" style="flex:${n}" title="${esc(l)}: ${n}"></i>`).join(''):'<i class="ob-t-zinc" style="flex:1"></i>'}</div>
        <ul class="ob-legend">${segs.length?segs.map(([l,n,t2])=>`<li><i class="ob-dot ob-t-${t2}"></i>${esc(l)} <b>${n}</b></li>`).join(''):'<li><i class="ob-dot ob-t-zinc"></i>No licenses yet <b>0</b></li>'}</ul>
        <p class="ob-live"><i></i>Synced ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
      </div>
    </section>
    <section class="ob-card ob-c4">
      <h3>Pending license payments</h3>
      <p class="ob-desc">Submitted bKash / Nagad claims awaiting verification. Approve them from License control.</p>
      <div class="ob-visual">
        ${pen.length?`<div class="ob-tw"><table><thead><tr><th>Shop</th><th>Method</th><th>Amount</th><th>Transaction ID</th><th>Submitted</th></tr></thead><tbody>${pen.map(x=>`<tr><td>${esc(x.stores?.name||'—')}</td><td>${esc(x.payment_method)}</td><td class="ob-num">${money(x.amount)} BDT</td><td><code>${esc(x.transaction_id)}</code></td><td class="ob-num">${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No pending payments — the verification queue is clear.')}
      </div>
    </section>
  </div>`
}

function ownerLicenses(d){
  $('#page').innerHTML=obHead('licenses','Approve only after verifying the transaction in the official bKash / Nagad merchant portal. Approval activates the related shop and sets its expiry date.')+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>License payment requests</h3><p class="ob-desc">Every submitted license claim with its entitlements and review state.</p></div>${obBadge(d.licenses.length+' records','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Administrator ID</th><th>Administrator</th><th>Shop</th><th>Type</th><th>Period</th><th>ConnectX</th><th>Zudo</th><th>AIBH</th><th>TrueBill</th><th>Vaultium</th><th>Amount</th><th>Payment</th><th>Number</th><th>Transaction ID</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.licenses.map(x=>`<tr><td><code>${esc(x.administrators?.admin_code||'—')}</code></td><td>${esc(x.administrators?.name||'—')}</td><td>${esc(x.stores?.name||'License capacity')}</td><td><code>${esc(x.transaction_type||'new')}</code></td><td class="ob-num">${x.duration_months} mo</td><td class="ob-num">${x.connectx_enabled?x.connectx_daily_limit+'/day':'—'}</td><td>${x.zudo_enabled?'Yes':'—'}</td><td>${x.business_health_enabled?'Yes':'—'}</td><td>${x.truebill_enabled?'Yes':'—'}</td><td class="ob-num">${Number(x.vaultium_gb||0)>0?x.vaultium_gb+' GB':'—'}</td><td class="ob-num">${money(x.amount)} BDT</td><td>${esc(x.payment_method)}</td><td class="ob-num">${esc(x.payment_number)}</td><td><code>${esc(x.transaction_id)}</code></td><td>${obBadge(esc(x.status)+(x.transaction_type==='downgrade'&&x.starts_at&&new Date(x.starts_at)>new Date()?' · scheduled':''),x.status==='active'?'emerald':x.status==='pending'?'amber':'rose')}</td><td class="ob-actions">${x.status==='pending'?`<button class="ob-btn ob-btn-primary ob-btn-sm" data-approve="${x.id}">Approve</button><button class="ob-btn ob-btn-danger ob-btn-sm" data-reject="${x.id}">Reject</button>`:'<span class="ob-checked">Reviewed</span>'}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>reviewLicense(b.dataset.approve,'active'));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>reviewLicense(b.dataset.reject,'rejected'))
}

async function reviewLicense(id,status){let label=status==='active'?'approve and activate':'reject';if(!confirm(`Are you sure you want to ${label} this license payment request?`))return;try{await api('platform/license/'+id,{method:'PATCH',body:JSON.stringify({status,reviewNote:''})});toast(status==='active'?'License approved and activated.':'License rejected.');await ownerPage('licenses')}catch(e){console.error(e);toast('License action failed: '+e.message)}}

async function ownerPlans(){
  let rows=await api('platform/license-plans');
  $('#page').innerHTML=obHead('plans','Publish the plans administrators see in their Purchase License tab. A price of 0 creates an instant free license with no payment form.',`<button id="addPlan" class="ob-btn ob-btn-primary">+ Post license plan</button>`)+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Plan catalogue</h3><p class="ob-desc">Published plans, entitlement limits and pricing.</p></div>${obBadge(rows.length+' plans','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Title</th><th>Duration</th><th>Shop slots</th><th>Price</th><th>ConnectX</th><th>Zudo</th><th>AIBH</th><th>TrueBill</th><th>Vaultium</th><th>Active</th><th>Benefits</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.title)}</b></td><td class="ob-num">${p.duration_months} mo</td><td class="ob-num">${p.max_stores}</td><td class="ob-num">${money(p.price)} BDT</td><td class="ob-num">${p.connectx_enabled?p.connectx_daily_limit+'/shop/day':'—'}</td><td>${p.zudo_enabled?'Yes':'—'}</td><td>${p.business_health_enabled?'Yes':'—'}</td><td>${p.truebill_enabled?'Yes':'—'}</td><td class="ob-num">${Number(p.vaultium_gb||0)>0?p.vaultium_gb+' GB':'—'}</td><td>${p.active?obBadge('Published','emerald'):obBadge('Hidden','zinc')}</td><td class="ob-wrap">${esc(p.benefits)}</td><td><button class="ob-btn ob-btn-soft ob-btn-sm" data-edit-plan="${p.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>
  </section>`;
  $('#addPlan').onclick=()=>planModal();
  document.querySelectorAll('[data-edit-plan]').forEach(x=>x.onclick=()=>planModal(rows.find(p=>p.id===x.dataset.editPlan)))
}

function planModal(plan=null){
  let add=!plan;
  const e=obModal(add?'Post license plan':'Edit license plan',`<form class="ob-form" id="obPlanForm">
    <label>Plan title<input name="title" required value="${esc(plan?.title||'')}"></label>
    <div class="ob-grid2">
      <label>Duration (months)<input name="duration_months" type="number" min="1" required value="${esc(plan?.duration_months||'')}"></label>
      <label>Total shop create limit<input name="max_stores" type="number" min="1" required value="${esc(plan?.max_stores||1)}"></label>
      <label>Price (BDT; enter 0 for free)<input name="price" type="number" min="0" step="0.01" required value="${esc(plan?.price??0)}"></label>
      <label>Availability<select name="active"><option value="true" ${plan?.active!==false?'selected':''}>Published</option><option value="false" ${plan?.active===false?'selected':''}>Hidden</option></select></label>
    </div>
    <div class="ob-entitle">
      <label class="ob-toggle"><span>Include ConnectX</span><span class="ob-switch"><input name="connectx_enabled" type="checkbox" ${plan?.connectx_enabled?'checked':''}><i></i></span></label>
      <label>ConnectX emails per shop / day<input name="connectx_daily_limit" type="number" min="0" value="${esc(plan?.connectx_daily_limit??0)}"></label>
    </div>
    <div class="ob-entitle">
      <label class="ob-toggle"><span>Include Zudo</span><span class="ob-switch"><input name="zudo_enabled" type="checkbox" ${plan?.zudo_enabled?'checked':''}><i></i></span></label>
      <label>Zudo requests per shop / day<input name="zudo_daily_limit" type="number" min="0" value="${esc(plan?.zudo_daily_limit??0)}"></label>
    </div>
    <div class="ob-entitle">
      <label class="ob-toggle"><span>Include Business AI Health</span><span class="ob-switch"><input name="business_health_enabled" type="checkbox" ${plan?.business_health_enabled?'checked':''}><i></i></span></label>
      <label>Business AI Health reports per shop / day<input name="business_health_daily_limit" type="number" min="0" value="${esc(plan?.business_health_daily_limit??0)}"></label>
    </div>
    <div class="ob-entitle">
      <label class="ob-toggle"><span>Include TrueBill</span><span class="ob-switch"><input name="truebill_enabled" type="checkbox" ${plan?.truebill_enabled?'checked':''}><i></i></span></label>
      <p class="ob-note">QR verification on every invoice — applies for the whole license validity, no daily limit.</p>
    </div>
    <div class="ob-entitle"><label>Vaultium storage (GB per administrator — shared across all shops)<input name="vaultium_gb" type="number" min="0" value="${esc(plan?.vaultium_gb??0)}"></label></div>
    <label>Benefits / information<textarea name="benefits" required rows="3">${esc(plan?.benefits||'')}</textarea></label>
    <label>Payment instructions / details<textarea name="payment_details" rows="2">${esc(plan?.payment_details||'')}</textarea></label>
    <button class="ob-btn ob-btn-primary">${add?'Publish license plan':'Save plan'}</button>
  </form>`);
  e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.duration_months=+b.duration_months;b.max_stores=+b.max_stores;b.price=+b.price;b.active=b.active==='true';b.connectx_enabled=e.querySelector('[name=connectx_enabled]').checked;b.connectx_daily_limit=+b.connectx_daily_limit||0;b.zudo_enabled=e.querySelector('[name=zudo_enabled]').checked;b.zudo_daily_limit=+b.zudo_daily_limit||0;b.business_health_enabled=e.querySelector('[name=business_health_enabled]').checked;b.business_health_daily_limit=+b.business_health_daily_limit||0;b.truebill_enabled=e.querySelector('[name=truebill_enabled]').checked;b.vaultium_gb=+b.vaultium_gb||0;await api(add?'platform/license-plans':'platform/license-plan/'+plan.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});e.remove();toast('License plan saved.');ownerPlans()}catch(x){toast(x.message)}}
}

function ownerAdmins(d){
  $('#page').innerHTML=obHead('administrators','Deactivating an administrator blocks new administrator sign-ins. Existing sessions expire automatically.')+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Administrator accounts</h3><p class="ob-desc">Every administrator registered on the platform.</p></div>${obBadge(d.admins.length+' accounts','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Administrator ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Created</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.admins.map(x=>`<tr><td><code>${esc(x.admin_code)}</code></td><td><b>${esc(x.name)}</b></td><td>${esc(x.email)}</td><td class="ob-num">${esc(x.phone||'—')}</td><td class="ob-num">${new Date(x.created_at).toLocaleDateString()}</td><td>${obBadge(x.active?'Active':'Inactive',x.active?'emerald':'zinc')}</td><td><button class="ob-btn ob-btn-soft ob-btn-sm" data-admin-state="${x.id}" data-active="${x.active}">${x.active?'Deactivate':'Activate'}</button></td></tr>`).join('')}</tbody></table></div>
  </section>`;
  document.querySelectorAll('[data-admin-state]').forEach(b=>b.onclick=async()=>{try{await api('platform/administrator/'+b.dataset.adminState,{method:'PATCH',body:JSON.stringify({active:b.dataset.active!=='true'})});toast('Administrator status changed.');ownerPage('administrators')}catch(e){toast(e.message)}})
}

function ownerShops(d){
  $('#page').innerHTML=obHead('shops','Every store created on the platform, with its owner administrator and activation state.')+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>All shops</h3><p class="ob-desc">Shops appear here the moment an administrator creates them.</p></div>${obBadge(d.stores.length+' shops','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Shop</th><th>Shop ID</th><th>Administrator</th><th>Administrator ID</th><th>Email</th><th>Status</th><th>Created</th></tr></thead><tbody>${d.stores.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td><code>${esc(x.shop_code)}</code></td><td>${esc(x.administrators?.name||'—')}</td><td><code>${esc(x.administrators?.admin_code||'—')}</code></td><td>${esc(x.administrators?.email||'—')}</td><td>${obBadge(esc(x.status),x.status==='active'?'emerald':'zinc')}</td><td class="ob-num">${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>
  </section>`
}

async function ownerBranding(){
  let b=await api('platform/settings');
  $('#page').innerHTML=obHead('branding','These fields are reserved for the EMS public website identity. They do not alter customer shop records.')+`
  <section class="ob-panel ob-narrow">
    <div class="ob-panel-head"><div><h3>Website identity</h3><p class="ob-desc">Shown across the public site, invoices header copies and browser titles.</p></div></div>
    <form class="ob-form" id="brandForm">
      <label>Website name<input name="website_name" required value="${esc(b.website_name||'EMS V1')}"></label>
      <label>Product name<input name="product_name" required value="${esc(b.product_name||'EMS V1')}"></label>
      <label>Powered by<input name="powered_by" required value="${esc(b.powered_by||'DoxTox')}"></label>
      <div><button class="ob-btn ob-btn-primary">Save website details</button></div>
    </form>
  </section>`;
  $('#brandForm').onsubmit=async e=>{e.preventDefault();try{await api('platform/settings',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Website branding saved.')}catch(x){toast(x.message)}}
}

async function ownerWebsitePages(){
  const pages=await api('platform/pages'),standard=[['about','About'],['terms','Terms & Conditions'],['contact','Contact Us']],bySlug=Object.fromEntries(pages.map(x=>[x.slug,x]));
  $('#page').innerHTML=obHead('website-pages','Manage the fixed public About, Terms &amp; Conditions and Contact pages.',`<button id="addMissingPages" class="ob-btn ob-btn-primary">+ Add missing standard pages</button>`)+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Public pages</h3><p class="ob-desc">Missing pages fall back to the built-in defaults until added.</p></div></div>
    <div class="ob-tw"><table><thead><tr><th>Page</th><th>URL</th><th>Status</th><th>Action</th></tr></thead><tbody>${standard.map(([slug,label])=>{const page=bySlug[slug];return `<tr><td><b>${esc(page?.title||label)}</b></td><td><code>/${slug}</code></td><td>${page?obBadge('Available','emerald'):obBadge('Missing','amber')}</td><td>${page?`<button class="ob-btn ob-btn-soft ob-btn-sm" data-edit-page="${slug}">Edit page</button>`:`<button class="ob-btn ob-btn-primary ob-btn-sm" data-add-page="${slug}">Add page</button>`}</td></tr>`}).join('')}</tbody></table></div>
  </section>`;
  const editPage=slug=>{
    const p=bySlug[slug]||{title:standard.find(s=>s[0]===slug)?.[1]||slug,body:'',hero_image_prompt:''};
    const e=obModal('Edit '+esc(standard.find(s=>s[0]===slug)?.[1]||slug),`<form class="ob-form">
      <label>Page title<input name="title" value="${esc(p.title)}"></label>
      ${slug==='about'?`<label>Graphics prompt / note<input name="hero_image_prompt" value="${esc(p.hero_image_prompt||'')}"></label>`:''}
      <label>Page content<textarea name="body" rows="14">${esc(p.body)}</textarea></label>
      <button class="ob-btn ob-btn-primary">Save page</button>
    </form>`);
    e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));b.slug=slug;try{await api('platform/pages',{method:'PATCH',body:JSON.stringify(b)});e.remove();toast('Public page saved.');ownerWebsitePages()}catch(err){toast(err.message)}};
  };
  const addPage=async slug=>{try{await api('platform/pages',{method:'POST',body:JSON.stringify({slug})});toast('Standard page added.');ownerWebsitePages()}catch(err){toast(err.message)}};
  $('#addMissingPages').onclick=async()=>{const missing=standard.filter(([slug])=>!bySlug[slug]);if(!missing.length)return toast('All standard public pages already exist.');for(const [slug] of missing)await addPage(slug)};
  document.querySelectorAll('[data-edit-page]').forEach(x=>x.onclick=()=>editPage(x.dataset.editPage));
  document.querySelectorAll('[data-add-page]').forEach(x=>x.onclick=()=>addPage(x.dataset.addPage));
}

async function ownerBlogs(){
  let rows=await api('platform/blogs');
  $('#page').innerHTML=obHead('blogs','Posts published to the public Blog page.',`<button id="addBlog" class="ob-btn ob-btn-primary">+ New blog post</button>`)+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Blog posts</h3><p class="ob-desc">Drafts stay hidden from the public site until published.</p></div>${obBadge(rows.length+' posts','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Title</th><th>Status</th><th>Published</th><th>Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td>${x.published?obBadge('Published','emerald'):obBadge('Draft','zinc')}</td><td class="ob-num">${x.published_at?new Date(x.published_at).toLocaleDateString():'—'}</td><td><button class="ob-btn ob-btn-soft ob-btn-sm" data-blog-edit="${x.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>
  </section>`;
  $('#addBlog').onclick=()=>blogModal();
  document.querySelectorAll('[data-blog-edit]').forEach(b=>b.onclick=()=>blogModal(rows.find(x=>x.id===b.dataset.blogEdit)))
}

function blogModal(post=null){
  const e=obModal((post?'Edit':'New')+' blog post',`<form class="ob-form">
    <label>Title<input name="title" required value="${esc(post?.title||'')}"></label>
    <label>Excerpt<input name="excerpt" value="${esc(post?.excerpt||'')}"></label>
    <label>Cover image URL<input name="cover_image_url" value="${esc(post?.cover_image_url||'')}"></label>
    <label>Article content<textarea name="body" rows="14" required>${esc(post?.body||'')}</textarea></label>
    <label>Publication status<select name="published"><option value="false" ${!post?.published?'selected':''}>Draft</option><option value="true" ${post?.published?'selected':''}>Published</option></select></label>
    <button class="ob-btn ob-btn-primary">Save blog post</button>
  </form>`);
  e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let b=Object.fromEntries(new FormData(ev.target));b.published=b.published==='true';try{await api(post?'platform/blog/'+post.id:'platform/blogs',{method:post?'PATCH':'POST',body:JSON.stringify(b)});e.remove();toast('Blog post saved.');ownerBlogs()}catch(err){toast(err.message)}}
}

async function ownerContactMessages(){
  let rows=await api('platform/contact-messages');
  $('#page').innerHTML=obHead('contact-messages','Messages submitted through the public Contact page.')+`
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Inbox</h3><p class="ob-desc">Most recent ${rows.length} message${rows.length===1?'':'s'} from the public contact form.</p></div>${obBadge(rows.length+' messages','zinc')}</div>
    <div class="ob-tw"><table><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Subject</th><th>Message</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="ob-num">${new Date(x.created_at).toLocaleString()}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.email)}</td><td class="ob-num">${esc(x.phone||'—')}</td><td>${esc(x.subject||'—')}</td><td class="ob-wrap">${esc(x.message)}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table></div>
  </section>`
}

async function ownerZudo(){
  let [x,h]=await Promise.all([api('platform/zudo'),api('platform/business-health').catch(()=>({enabled:false,global_daily_limit:100,usedToday:0,aiBinding:false,models:null}))]);
  const prov=(ready,label,secret,tone)=>`<section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('settings',tone)}<span class="ob-kicker">${esc(label)}</span></div><strong class="ob-kpi-val">${ready?'Ready':'Missing'}</strong><span class="ob-kpi-foot">${ready?'connection detected':'add secret: '+esc(secret)}</span></section>`;
  $('#page').innerHTML=obHead('zudo','Zudo is a read-only AI assistant. Pick any model below — if a provider hits a limit or fails, switch instantly.')+`
  <div class="ob-grid ob-kpis">
    ${prov(x.aiBinding,'Cloudflare Workers AI','AI binding','emerald')}
    ${prov(x.geminiBinding,'Google AI Studio','GEMINI_API_KEY','sky')}
    ${prov(x.groqBinding,'Groq','GROQ_API_KEY','amber')}
    ${prov(x.cerebrasBinding,'Cerebras','CEREBRAS_API_KEY','rose')}
    ${prov(x.deepseekBinding,'DeepSeek','DEEPSEEK_API_KEY','violet')}
    ${prov(x.openrouterBinding,'OpenRouter','OPENROUTER_API_KEY','cyan')}
    ${prov(x.githubBinding,'GitHub Models (Copilot)','GITHUB_TOKEN','emerald')}
    ${prov(x.anthropicBinding,'Anthropic Claude','ANTHROPIC_API_KEY','sky')}
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('sparkles','violet')}<span class="ob-kicker">Zudo usage</span></div><strong class="ob-kpi-val">${x.usedToday||0}<small>/${x.global_daily_limit||0}</small></strong><div class="ob-kpi-meter">${obMeter(x.usedToday||0,x.global_daily_limit||0)}</div></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('activity','cyan')}<span class="ob-kicker">AI Health usage</span></div><strong class="ob-kpi-val">${h.usedToday||0}<small>/${h.global_daily_limit||0}</small></strong><div class="ob-kpi-meter">${obMeter(h.usedToday||0,h.global_daily_limit||0)}</div></section>
  </div>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Provider API keys &amp; free options</h3><p class="ob-desc">Retired model IDs (Gemini 2.0, Groq Llama/QwQ, Cerebras Llama 3.1/Qwen 2.5) are automatically upgraded to their current replacements. Add any of these secrets in Cloudflare Pages &rarr; Settings &rarr; Variables and secrets.</p></div></div>
    <ul class="ob-keylist">
      <li><b>Cloudflare Workers AI</b> — free, works automatically once the <code>AI</code> binding exists in <code>wrangler.toml</code>. No key needed.</li>
      <li><b>Google AI Studio</b> — free key at <code>aistudio.google.com/apikey</code> &rarr; secret <code>GEMINI_API_KEY</code>. Powers Gemini 3.6 Flash / 3.5 Flash-Lite.</li>
      <li><b>Groq</b> — free key at <code>console.groq.com/keys</code> &rarr; <code>GROQ_API_KEY</code>. GPT-OSS 120B/20B.</li>
      <li><b>Cerebras</b> — free key at <code>cloud.cerebras.ai</code> &rarr; <code>CEREBRAS_API_KEY</code>. Llama 3.3 70B, GPT-OSS 120B, Qwen3 32B, Llama 4 Scout.</li>
      <li><b>OpenRouter</b> — free key at <code>openrouter.ai/keys</code> &rarr; <code>OPENROUTER_API_KEY</code>. Gives free access to many models (GPT-OSS, Gemma, Nemotron) and also hosts Meta Llama, Amazon, Mistral and other families.</li>
      <li><b>GitHub Models / Copilot</b> — create a token at <code>github.com/settings/tokens</code> (no scopes needed) &rarr; <code>GITHUB_TOKEN</code>. Free daily quota for GPT-4o mini, DeepSeek V3, Llama 3.3.</li>
      <li><b>DeepSeek</b> — key at <code>platform.deepseek.com</code> &rarr; <code>DEEPSEEK_API_KEY</code>. Very low cost, strong reasoning.</li>
      <li><b>Anthropic Claude</b> — key at <code>console.anthropic.com</code> &rarr; <code>ANTHROPIC_API_KEY</code>. Claude Haiku 4.5 / Sonnet 5.</li>
    </ul>
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Central Zudo controls</h3><p class="ob-desc">Global model and daily request limit for every shop.</p></div></div>
    <form class="ob-form" id="zudoConfig">
      <label>AI model<select name="model">${modelOptions(x.models,x.model)}</select></label>
      <div class="ob-grid2">
        <label>Global daily request limit<input name="global_daily_limit" type="number" min="1" value="${esc(x.global_daily_limit||500)}"></label>
        <label>Zudo status<select name="enabled"><option value="true" ${x.enabled?'selected':''}>Enabled</option><option value="false" ${!x.enabled?'selected':''}>Disabled</option></select></label>
      </div>
      <div><button class="ob-btn ob-btn-primary">Save Zudo configuration</button></div>
    </form>
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Business AI Health controls</h3><p class="ob-desc">A read-only, license-controlled report generator. It uses the same provider connections as Zudo.</p></div></div>
    <form class="ob-form" id="healthConfig">
      <label>AI model<select name="model">${modelOptions(h.models,h.model)}</select></label>
      <div class="ob-grid2">
        <label>Global daily report limit<input name="global_daily_limit" type="number" min="1" value="${esc(h.global_daily_limit||100)}"></label>
        <label>Business AI Health status<select name="enabled"><option value="true" ${h.enabled?'selected':''}>Enabled</option><option value="false" ${!h.enabled?'selected':''}>Disabled</option></select></label>
      </div>
      <div><button class="ob-btn ob-btn-primary">Save Business AI Health controls</button></div>
    </form>
    <div><p class="ob-kicker" style="margin-bottom:8px">Business AI Health reports</p><div id="healthOwnerLogs" class="ob-logwrap">${SKEL.table(4,5)}</div></div>
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Zudo conversation logs</h3><p class="ob-desc">Select a row to inspect the full conversation.</p></div></div>
    <div id="zudoOwnerLogs" class="ob-logwrap">${SKEL.table(4,5)}</div>
  </section>`;
  async function loadLogs(){try{let logs=await api('platform/zudo/logs');$('#zudoOwnerLogs').innerHTML=logs.length?`<div class="ob-tw"><table><thead><tr><th>Created</th><th>Shop ID</th><th>User ID</th><th>Conversation</th><th>Status</th><th>Updated</th></tr></thead><tbody>${logs.map(l=>`<tr class="ob-rowlink" data-zudo-log="${l.id}"><td class="ob-num">${new Date(l.created_at).toLocaleString()}</td><td><code>${esc(l.shop_code||'—')}</code></td><td>${esc(l.user_login_id||'—')}</td><td>${esc(l.title)}</td><td>${l.shop_deleted_at?obBadge('Hidden by shop','zinc'):obBadge('Visible','emerald')}</td><td class="ob-num">${new Date(l.updated_at).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No Zudo conversations yet.');document.querySelectorAll('[data-zudo-log]').forEach(r=>r.onclick=()=>zudoLogModal(r.dataset.zudoLog))}catch(e){$('#zudoOwnerLogs').textContent=e.message}}loadLogs();
  $('#zudoConfig').onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{await api('platform/zudo',{method:'PATCH',body:JSON.stringify(b)});toast('Zudo configuration saved.');ownerZudo()}catch(err){toast(err.message)}};
  async function loadHealthLogs(){try{let logs=await api('platform/business-health/logs');$('#healthOwnerLogs').innerHTML=logs.length?`<div class="ob-tw"><table><thead><tr><th>Created</th><th>Shop ID</th><th>Period</th><th>Score</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="ob-num">${new Date(l.created_at).toLocaleString()}</td><td>${esc(l.store_id)}</td><td class="ob-num">${esc(l.start_date)} — ${esc(l.end_date)}</td><td class="ob-num">${esc(l.score)}/100</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No Business AI Health reports yet.')}catch(e){$('#healthOwnerLogs').textContent=e.message}}loadHealthLogs();
  $('#healthConfig').onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{await api('platform/business-health',{method:'PATCH',body:JSON.stringify(b)});toast('Business AI Health controls saved.');ownerZudo()}catch(err){toast(err.message)}}
}

async function zudoLogModal(id){
  const e=obModal('Zudo conversation',`<div class="ob-zudolog">${SKEL.msgs(4)}</div>`,'ob-modal-wide');
  try{
    const d=await api('platform/zudo/conversation/'+id);
    e.querySelector('.ob-zudolog').innerHTML=`<p class="ob-zudotitle">${esc(d.title)}</p>`+d.messages.map(m=>`<div class="ob-zudomsg ${m.role==='assistant'?'them':'me'}"><span>${m.role==='assistant'?'Zudo':'User'}</span><div>${esc(m.content).replace(/\n/g,'<br>')}</div></div>`).join('')
  }catch(err){e.querySelector('.ob-zudolog').innerHTML=`<p class="ob-note">${esc(err.message)}</p>`}
}

async function ownerConnectX(){
  let x=await api('platform/connectx');
  $('#page').innerHTML=obHead('connectx','Brevo credentials remain in Cloudflare encrypted secrets. Shop users never see provider credentials.')+`
  <div class="ob-grid ob-kpis">
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('mail','emerald')}<span class="ob-kicker">Provider</span></div><strong class="ob-kpi-val" style="font-size:15px">Brevo API</strong><span class="ob-kpi-foot">${x.apiConfigured?'api key detected':'api key missing'}</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('chart','sky')}<span class="ob-kicker">Daily volume</span></div><strong class="ob-kpi-val">${x.usedToday||0}<small>/${x.global_daily_limit||0}</small></strong><div class="ob-kpi-meter">${obMeter(x.usedToday||0,x.global_daily_limit||0)}</div></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('key','amber')}<span class="ob-kicker">License control</span></div><strong class="ob-kpi-val" style="font-size:15px">Plan based</strong><span class="ob-kpi-foot">per-shop daily email allowance</span></section>
  </div>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Central sender and limits</h3><p class="ob-desc">The identity every ConnectX email is sent from.</p></div></div>
    <form class="ob-form" id="cxConfig">
      <div class="ob-grid2">
        <label>From name<input name="from_name" required value="${esc(x.from_name||'EMS ConnectX')}"></label>
        <label>From email<input name="from_email" type="email" required value="${esc(x.from_email||'')}"></label>
        <label>Reply-to email<input name="reply_to" type="email" value="${esc(x.reply_to||'')}"></label>
        <label>Provider<input readonly value="Brevo API"></label>
        <label>Global daily limit<input name="global_daily_limit" type="number" min="1" required value="${esc(x.global_daily_limit||300)}"></label>
        <label>ConnectX status<select name="enabled"><option value="true" ${x.enabled?'selected':''}>Enabled</option><option value="false" ${!x.enabled?'selected':''}>Disabled</option></select></label>
      </div>
      <div><button class="ob-btn ob-btn-primary">Save ConnectX configuration</button></div>
    </form>
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Test Brevo connection</h3><p class="ob-desc">Send one diagnostic test email. The result shows the exact provider response to the EMS owner only.</p></div></div>
    <form class="ob-form" id="cxTestForm">
      <div class="ob-grid2">
        <label>Test recipient email<input id="cxTestTo" type="email" placeholder="you@example.com"></label>
        <div class="ob-form-actions"><button type="button" id="cxTest" class="ob-btn ob-btn-soft">Send test email</button></div>
      </div>
    </form>
    <div id="cxTestResult" class="ob-testresult"></div>
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Recent ConnectX provider logs</h3><p class="ob-desc">The last 100 send attempts across all shops.</p></div></div>
    <div id="cxOwnerLogs" class="ob-logwrap">${SKEL.table(4,5)}</div>
  </section>`;
  async function loadLogs(){try{let logs=await api('platform/connectx/logs');$('#cxOwnerLogs').innerHTML=logs.length?`<div class="ob-tw"><table><thead><tr><th>Time</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Provider result</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="ob-num">${new Date(l.created_at).toLocaleString()}</td><td>${esc(l.to_emails.join(', '))}</td><td>${esc(l.subject)}</td><td>${obBadge(esc(l.status)+(l.shop_deleted_at?' · hidden':''),l.status==='sent'?'emerald':'rose')}</td><td class="ob-wrap">${esc(l.error_message||l.provider_message_id||'Accepted')}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No ConnectX send attempts yet.')}catch(e){$('#cxOwnerLogs').textContent=e.message}}loadLogs();
  $('#cxConfig').onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{await api('platform/connectx',{method:'PATCH',body:JSON.stringify(b)});toast('ConnectX configuration saved.');ownerConnectX()}catch(err){toast(err.message)}};
  $('#cxTest').onclick=async()=>{let b=$('#cxTest');b.disabled=true;$('#cxTestResult').textContent='Testing Brevo…';try{let r=await api('platform/connectx/test',{method:'POST',body:JSON.stringify({to:$('#cxTestTo').value})});$('#cxTestResult').innerHTML='<p class="ob-test-ok">✓ Brevo accepted the test email. Message ID: '+esc(r.messageId||'received')+'</p>'}catch(e){$('#cxTestResult').innerHTML='<p class="ob-test-err">✕ '+esc(e.message)+'</p>'}finally{b.disabled=false}}
}
/* ═══════════ SHOP · Business reports + Business AI Health ═══════════ */
async function report(){
  const [salesRows,purchaseRows,expenseRows,salePartyRows,purPartyRows]=await Promise.all([
    api('invoices?kind=sale'), api('invoices?kind=purchase'), api('expense'),
    api('invoice-parties?kind=sale').catch(()=>[]), api('invoice-parties?kind=purchase').catch(()=>[])
  ]);
  const partyLabel=k=>k==='sales'?'Customer':k==='purchase'?'Supplier':'Category';
  const payMethods=[['cash','Cash'],['bank','Bank'],['bkash','bKash'],['nagad','Nagad'],['card','Card'],['other','Other']];
  const payName=m=>(payMethods.find(x=>x[0]===String(m||'cash').toLowerCase())||[String(m||'cash'),String(m||'Other')])[1];
  const inRange=d=>d&&d>=start&&d<=end;
  const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const downloadCsv=(name,head,dataRows)=>{
    const csv=[head.map(csvCell).join(','),...dataRows.map(r=>r.map(csvCell).join(','))].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  };
  // ── Detailed Sales / Purchase / Expense reports (bento grid, own data only) ──
  const detailReport=kind=>{
    if(kind==='expense'){
      const rows=expenseRows.filter(r=>inRange(r.expense_date))
        .map(r=>({...r,_total:Math.max(0,Number(r.total||0)),_paid:Math.max(0,Number(r.paid||0)),_due:Math.max(0,Number(r.due??(Number(r.total||0)-Number(r.paid||0))))}));
      const totals={count:rows.length,total:rows.reduce((a,r)=>a+r._total,0),paid:rows.reduce((a,r)=>a+r._paid,0),due:rows.reduce((a,r)=>a+r._due,0)};
      const days=Math.max(1,Math.round((new Date(end+'T23:59:59')-new Date(start+'T00:00:00'))/86400000)+1);
      const biggest=rows.reduce((b,r)=>r._total>(b?._total||0)?r:b,null);
      const catMap={};
      rows.forEach(r=>{const c=String(r.details||'General expense').trim()||'General expense';(catMap[c]??={name:c,count:0,total:0,paid:0,due:0});catMap[c].count++;catMap[c].total+=r._total;catMap[c].paid+=r._paid;catMap[c].due+=r._due});
      const cats=Object.values(catMap).sort((a,b)=>b.total-a.total);
      const trend=trendBuckets(rows.map(r=>({date:r.expense_date,value:r._total})));
      return reportShell('expense','Expense detailed report','Every recorded shop expense in the selected period — categories, payment position and a full itemised list.',
        [['Records',totals.count,null,null,'wallet'],['Total expenses',reportMoney(totals.total),null,null,'coins'],['Paid out',reportMoney(totals.paid),null,'emerald','banknote'],['Still payable',reportMoney(totals.due),null,totals.due>0?'rose':null,'clock'],['Daily average',reportMoney(totals.total/days),null,null,'chart'],['Largest',biggest?reportMoney(biggest._total):'—',biggest?String(biggest.details||'Expense').slice(0,22):'no data',null,'coins']],
        `<section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Expense categories</h3><p class="shp-desc">Grouped by expense details — where the money went.</p></div><span class="shp-kicker">${cats.length} categor${cats.length===1?'y':'ies'}</span></div>${cats.length?`<div class="shp-rep-break">${cats.slice(0,8).map(c=>`<div class="shp-rep-barrow"><span title="${esc(c.name)}">${esc(c.name)}</span><div><i class="rose" style="width:${Math.max(3,c.total/(cats[0].total||1)*100)}%"></i></div><b>${reportMoney(c.total)}</b><em>${c.count}×</em></div>`).join('')}</div>`:shpEmpty('No expenses in this period.')}</section>
        <section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Daily expense trend</h3><p class="shp-desc">Total expenses across the period.</p></div></div><div class="shp-rep-trend">${trendBarsHtml(trend,'rose')}</div></section>`,
        `<div class="shp-tw"><table><thead><tr><th>Code</th><th>Date</th><th>Details</th><th>Note</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows.sort((a,b)=>String(b.expense_date).localeCompare(String(a.expense_date))).map(r=>statusRow([`<code>${esc(r.expense_code||shortId(r.id))}</code>`,prettyDate(r.expense_date),`<span class="shp-rep-party">${esc(r.details||'—')}</span>`,r.note?`<span class="shp-rep-note" title="${esc(r.note)}">${esc(r.note)}</span>`:'—',reportMoney(r._total),reportMoney(r._paid),reportMoney(r._due)],r)).join('')||`<tr><td colspan="8">${shpEmpty('No expense records in this period.')}</td></tr>`}</tbody></table></div>`,
        ['Code','Date','Details','Note','Total','Paid','Due','Status'],
        rows.map(r=>[r.expense_code||shortId(r.id),r.expense_date,r.details||'',r.note||'',r._total,r._paid,r._due,statusText(r)])
      );
    }
    const isSale=kind==='sales';
    const parties=isSale?salePartyRows:purPartyRows;
    const pmap=Object.fromEntries(parties.map(x=>[x.id,x]));
    const raw=isSale?salesRows:purchaseRows;
    const rows=raw.filter(r=>inRange(r.invoice_date)).map(r=>({...r,_party:pmap[r.party_id]?.name||r.custom_party_name||(isSale?'Walk-in / custom customer':'Custom / one-off supplier'),_total:amount(r),_paid:Math.max(0,Number(r.paid_amount||0)),_due:Math.max(0,Number(r.total_due||0)),_tax:Math.max(0,Number(r.tax_amount||0)),_disc:Math.max(0,Number(r.discount||0)),_items:(r.invoice_lines||[]).reduce((n,l)=>n+Number(l.quantity||0),0)}));
    const n=rows.length, days=Math.max(1,Math.round((new Date(end+'T23:59:59')-new Date(start+'T00:00:00'))/86400000)+1);
    const sum=(f)=>rows.reduce((a,r)=>a+f(r),0);
    const totals={count:n,total:sum(r=>r._total),paid:sum(r=>r._paid),due:sum(r=>r._due),tax:sum(r=>r._tax),disc:sum(r=>r._disc),avg:n?sum(r=>r._total)/n:0};
    const methodMap={};
    rows.forEach(r=>{const m=String(r.payment_method||'cash').toLowerCase();(methodMap[m]??={m,count:0,total:0,paid:0});methodMap[m].count++;methodMap[m].total+=r._total;methodMap[m].paid+=r._paid});
    const methods=Object.values(methodMap).sort((a,b)=>b.total-a.total);
    const partyMap={};
    rows.forEach(r=>{(partyMap[r._party]??={name:r._party,count:0,total:0,paid:0,due:0});partyMap[r._party].count++;partyMap[r._party].total+=r._total;partyMap[r._party].paid+=r._paid;partyMap[r._party].due+=r._due});
    const topParties=Object.values(partyMap).sort((a,b)=>b.total-a.total).slice(0,6);
    const itemMap={};
    rows.forEach(r=>(r.invoice_lines||[]).forEach(l=>{const name=l.inventory_items?.description||l.inventory_items?.item_code||'Item',k=name; (itemMap[k]??={name:k,qty:0,total:0});itemMap[k].qty+=Number(l.quantity||0);itemMap[k].total+=Number(l.line_total||0)}));
    const topItems=Object.values(itemMap).sort((a,b)=>b.total-a.total).slice(0,6);
    const trend=trendBuckets(rows.map(r=>({date:r.invoice_date,value:r._total})));
    const tone=isSale?'emerald':'amber';
    return reportShell(kind,isSale?'Sales detailed report':'Purchase detailed report',isSale?'Every sales invoice in the selected period — customers, payment methods, items sold and outstanding dues.':'Every purchase bill in the selected period — suppliers, payment methods, items bought and outstanding dues.',
      [['Invoices',n,null,null,'receipt'],['Total '+(isSale?'sales':'purchases'),reportMoney(totals.total),null,null,'coins'],['Collected',reportMoney(totals.paid),null,'emerald','banknote'],['Outstanding',reportMoney(totals.due),null,totals.due>0?'rose':null,'clock'],['Tax included',reportMoney(totals.tax),null,null,'receipt'],['Discounts',reportMoney(totals.disc),null,null,'percent'],['Average '+(isSale?'sale':'bill'),reportMoney(totals.avg),null,null,'chart']],
      `<section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Payment methods</h3><p class="shp-desc">Total value recorded through each payment channel.</p></div><span class="shp-kicker">${methods.length} channel${methods.length===1?'':'s'}</span></div>${methods.length?`<div class="shp-rep-break">${methods.map(x=>`<div class="shp-rep-barrow"><span>${payName(x.m)}</span><div><i class="${tone}" style="width:${Math.max(3,x.total/(methods[0].total||1)*100)}%"></i></div><b>${reportMoney(x.total)}</b><em>${x.count}×</em></div>`).join('')}</div>`:shpEmpty('No invoices in this period.')}</section>
      <section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Top ${partyLabel(kind).toLowerCase()}s</h3><p class="shp-desc">Ranked by total transaction value.</p></div></div><div class="shp-rep-tw"><table><thead><tr><th>${partyLabel(kind)}</th><th>Invoices</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead><tbody>${topParties.map(p=>`<tr><td class="shp-wrap">${esc(p.name)}</td><td>${p.count}</td><td>${reportMoney(p.total)}</td><td>${reportMoney(p.paid)}</td><td class="${p.due>0?'shp-rep-due':''}">${reportMoney(p.due)}</td></tr>`).join('')||`<tr><td colspan="5">${shpEmpty('No data.')}</td></tr>`}</tbody></table></div></section>
      <section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Top ${isSale?'sold':'purchased'} items</h3><p class="shp-desc">From invoice line items.</p></div></div><div class="shp-rep-tw"><table><thead><tr><th>Item</th><th>Qty</th><th>Value</th></tr></thead><tbody>${topItems.map(x=>`<tr><td class="shp-wrap">${esc(x.name)}</td><td>${Number(x.qty).toLocaleString('en-BD')}</td><td>${reportMoney(x.total)}</td></tr>`).join('')||`<tr><td colspan="3">${shpEmpty('No line items in this period.')}</td></tr>`}</tbody></table></div></section>
      <section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Daily trend</h3><p class="shp-desc">${isSale?'Sales':'Purchases'} value across the period.</p></div></div><div class="shp-rep-trend">${trendBarsHtml(trend,tone)}</div></section>`,
      `<div class="shp-tw"><table><thead><tr><th>Invoice</th><th>Date</th><th>${partyLabel(kind)}</th><th>Payment</th><th>Items</th><th>Subtotal</th><th>Tax</th><th>Discount</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows.sort((a,b)=>String(b.invoice_date).localeCompare(String(a.invoice_date))).map(r=>statusRow([`<code>${esc(r.invoice_number)}</code>`,prettyDate(r.invoice_date),`<span class="shp-rep-party">${esc(r._party)}</span>`,payName(r.payment_method),r._items,reportMoney(Number(r.subtotal||0)),reportMoney(r._tax),reportMoney(r._disc),reportMoney(r._paid),reportMoney(r._due)],r)).join('')||`<tr><td colspan="11">${shpEmpty('No invoices in this period.')}</td></tr>`}</tbody></table></div>`,
      ['Invoice','Date',partyLabel(kind),'Payment','Items','Subtotal','Tax','Discount','Paid','Due','Status'],
      rows.map(r=>[r.invoice_number,r.invoice_date,r._party,payName(r.payment_method),r._items,Number(r.subtotal||0),r._tax,r._disc,r._paid,r._due,statusText(r)])
    );
  };

  const localDate=d=>{let x=d?new Date(d+'T00:00:00'):new Date();return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const today=localDate(), monthStart=today.slice(0,8)+'01';
  const amount=r=>Math.max(0,Number(r.subtotal||0)+Number(r.tax_amount||0)-Number(r.discount||0));
  const invoiceData=rows=>rows.map(r=>({date:r.invoice_date,total:amount(r),paid:Math.max(0,Number(r.paid_amount||0)),due:Math.max(0,Number(r.total_due||0))}));
  const expenseData=expenseRows.map(r=>({date:r.expense_date,total:Math.max(0,Number(r.total||0)),paid:Math.max(0,Number(r.paid||0)),due:Math.max(0,Number(r.due??(Number(r.total||0)-Number(r.paid||0))))}));
  const all={sales:invoiceData(salesRows),purchase:invoiceData(purchaseRows),expense:expenseData};
  let active='summary', start=monthStart, end=today;
  const sum=rows=>rows.reduce((a,x)=>({total:a.total+x.total,paid:a.paid+x.paid,due:a.due+x.due}),{total:0,paid:0,due:0});
  const rangeRows=rows=>rows.filter(x=>x.date&&x.date>=start&&x.date<=end);
  const prettyDate=x=>new Date(x+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
  // Reports show full plain numbers (no currency sign and no K abbreviation).
  const reportMoney=x=>Number(x||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
  let reportCsvData=null;
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const statusOf=r=>r._due<=0?'paid':(r._paid>0?'partial':'unpaid');
  const statusText=r=>statusOf(r)==='paid'?'Paid':statusOf(r)==='partial'?'Partial':'Unpaid';
  const statusRow=(cells,r)=>`<tr class="${statusOf(r)==='paid'?'':'shp-rowdue'}">${cells.map(c=>`<td>${c}</td>`).join('')}<td><span class="shp-rep-status ${statusOf(r)}">${statusText(r)}</span></td></tr>`;
  const trendBuckets=entries=>{
    const s=new Date(start+'T00:00:00'),e=new Date(end+'T00:00:00');
    const span=Math.floor((e-s)/86400000)+1,buckets=span<=14?span:12,size=span/buckets;
    const dayVals={};entries.forEach(x=>{if(x.date)dayVals[x.date]=(dayVals[x.date]||0)+Number(x.value||0)});
    return Array.from({length:buckets},(_,bi)=>{
      const lo=Math.floor(bi*size),hi=Math.min(span,Math.ceil((bi+1)*size));let value=0,label='';
      for(let i=lo;i<hi;i++){const d=new Date(s.getTime()+i*86400000);value+=dayVals[ymd(d)]||0;if(i===lo)label=d.toLocaleDateString(undefined,{day:'2-digit',month:'short'})}
      return {label,value};
    });
  };
  const trendBarsHtml=(arr,tone)=>{
    if(!arr.some(x=>x.value>0))return shpEmpty('No value recorded in this period.');
    const max=Math.max(1,...arr.map(x=>x.value));
    return `<div class="shp-rep-bars">${arr.map(x=>`<div class="shp-rep-bar" title="${x.label} · ${reportMoney(x.value)}"><span><i class="${tone}" style="height:${Math.max(4,x.value/max*100)}%"></i></span><small>${x.label}</small></div>`).join('')}</div>`;
  };
  const reportShell=(kind,title,desc,kpis,bento,table,csvHead,csvRows)=>{
    reportCsvData={kind,head:csvHead,rows:csvRows};
    return `<div class="shp-pagegap">
      <section class="shp-panel"><div class="shp-panel-head"><div><h3>${title}</h3><p class="shp-desc">${desc}</p></div><span class="shp-kicker">${esc(state.store?.name||'Shop')} · ${prettyDate(start)} — ${prettyDate(end)}</span></div><div class="shp-form-actions" style="justify-content:flex-start"><button class="shp-btn shp-btn-soft shp-btn-sm" id="reportPrint" type="button">Print report</button><button class="shp-btn shp-btn-soft shp-btn-sm" id="reportExport" type="button">Export CSV</button></div></section>
      <div class="shp-rep-kpis">${kpis.map(([label,val,sub,tone2,icon])=>`<article class="shp-rep-kpi ${tone2||''}"><span class="shp-rep-kpiic">${lucide(icon||'chart')}</span><small>${label}</small><strong>${val}</strong>${sub?`<p>${esc(sub)}</p>`:''}</article>`).join('')}</div>
      <div class="shp-rep-bento">${bento}</div>
      <section class="shp-panel shp-rep-panel"><div class="shp-panel-head"><div><h3>Detailed transactions</h3><p class="shp-desc">Full itemised list for the selected period.</p></div></div>${table}</section>
    </div>`;
  };

  const render=()=>{
    const data={sales:sum(rangeRows(all.sales)),purchase:sum(rangeRows(all.purchase)),expense:sum(rangeRows(all.expense))};
    const profit=data.sales.total-data.purchase.total-data.expense.total, netCash=data.sales.paid-data.purchase.paid-data.expense.paid;
    const cards=[['Sales',data.sales,'sales'],['Purchase',data.purchase,'purchase'],['Expense',data.expense,'expense']];
    const chartMax=Math.max(1,...cards.map(x=>x[1].total));
    $('#page').innerHTML=shpHead('Insights','Business reports','Summary, sales, purchase and expense reports with clear totals and profit figures for any date range.')+`<section class="shp-pagegap">
      <div class="shp-chips shp-rtabs"><button class="shp-chip ${active==='summary'?'on':''}" data-report-tab="summary">Summary report</button><button class="shp-chip ${active==='sales'?'on':''}" data-report-tab="sales">Sales report</button><button class="shp-chip ${active==='purchase'?'on':''}" data-report-tab="purchase">Purchase report</button><button class="shp-chip ${active==='expense'?'on':''}" data-report-tab="expense">Expense report</button>${state.businessHealthEver?`<button class="shp-chip ${active==='health'?'on':''}" data-report-tab="health">Business AI Health</button>`:''}</div>
      <section class="shp-panel shp-rfilter"><div><span class="lbl">Report period</span><b id="reportPeriodText">${prettyDate(start)} — ${prettyDate(end)}</b></div><div class="shp-rdates"><label>From<input id="reportStart" type="date" value="${start}" max="${today}"></label><label>To<input id="reportEnd" type="date" value="${end}" max="${today}"></label><button class="shp-btn shp-btn-primary" id="reportSearch" type="button">Search report</button></div></section>
      ${active==='summary'?`<div class="shp-pagegap">
        <section class="shp-panel"><div class="shp-panel-head"><div><h3>Management report · date range summary</h3><p class="shp-desc">Sales, purchases and expenses based on transactions recorded from ${prettyDate(start)} to ${prettyDate(end)}.</p></div><span class="shp-kicker">${esc(state.store?.name||'Shop')}</span></div><div class="shp-form-actions" style="justify-content:flex-start"><button class="shp-btn shp-btn-soft" id="reportPrint" type="button">Print summary</button></div></section>
        <div class="shp-rkpis">${cards.map(([name,x])=>`<article class="shp-rkpi"><small>Total ${name}</small><strong>${reportMoney(x.total)}</strong><p><span>Paid <b>${reportMoney(x.paid)}</b></span><span>Due <b>${reportMoney(x.due)}</b></span></p></article>`).join('')}<article class="shp-rkpi profit ${profit<0?'negative':''}"><small>Estimated operating profit</small><strong>${profit<0?'−':''}${reportMoney(Math.abs(profit))}</strong><p>Sales − Purchase − Expense</p></article></div>
        <div class="shp-rgrid"><section class="shp-panel"><div class="shp-panel-head"><div><h3>Financial summary</h3><p class="shp-desc">Total value, received or paid amount, and outstanding due.</p></div></div><div class="shp-tw"><table><thead><tr><th>Category</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead><tbody>${cards.map(([n,x,c])=>`<tr><td><span class="shp-rdot ${c}"></span>${n}</td><td>${reportMoney(x.total)}</td><td>${reportMoney(x.paid)}</td><td>${reportMoney(x.due)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="shp-panel"><div class="shp-panel-head"><div><h3>Operating result</h3><p class="shp-desc">Period estimate; it is not a cash-flow figure.</p></div></div><div class="shp-rprofit ${profit<0?'negative':''}">${profit<0?'−':''}${reportMoney(Math.abs(profit))}</div><div class="shp-rformula"><span>Sales <b>${reportMoney(data.sales.total)}</b></span><i>−</i><span>Purchase <b>${reportMoney(data.purchase.total)}</b></span><i>−</i><span>Expense <b>${reportMoney(data.expense.total)}</b></span></div></section></div>
        <div class="shp-rgrid"><section class="shp-panel"><div class="shp-panel-head"><div><h3>Activity comparison</h3><p class="shp-desc">Total transaction value during selected period.</p></div></div><div class="shp-pagegap" style="gap:9px">${cards.map(([n,x,c])=>`<div class="shp-rbar"><span>${n}</span><div><i class="${c}" style="width:${x.total/chartMax*100}%"></i></div><b>${reportMoney(x.total)}</b></div>`).join('')}</div></section>
        <section class="shp-panel"><div class="shp-panel-head"><div><h3>Cash & due position</h3><p class="shp-desc">Based on recorded paid amounts.</p></div></div><div class="shp-rcash"><p><span>Sales received</span><b>${reportMoney(data.sales.paid)}</b></p><p><span>Purchase & expense paid</span><b>${reportMoney(data.purchase.paid+data.expense.paid)}</b></p><p class="total"><span>Net cash movement</span><b>${netCash<0?'−':''}${reportMoney(Math.abs(netCash))}</b></p><p><span>Total outstanding due</span><b>${reportMoney(data.sales.due+data.purchase.due+data.expense.due)}</b></p></div></section></div>
      </div>`:active==='health'?healthView():detailReport(active)}
    </section>`;
    document.querySelectorAll('[data-report-tab]').forEach(b=>b.onclick=()=>{active=b.dataset.reportTab;render()});
    $('#reportSearch').onclick=()=>{let s=$('#reportStart').value,e=$('#reportEnd').value;if(!s||!e)return toast('Please select both dates.');if(s>e)return toast('The start date cannot be after the end date.');start=s;end=e;render()};
    $('#reportPrint')&&($('#reportPrint').onclick=()=>window.print());
    $('#reportExport')&&($('#reportExport').onclick=()=>{if(reportCsvData)downloadCsv('ems-'+reportCsvData.kind+'-report-'+start+'-to-'+end+'.csv',reportCsvData.head,reportCsvData.rows)});
    if(active==='health'){let usage=$('#healthUsage'),button=$('#generateHealth');api('business-health/availability').then(x=>{usage.textContent=x.enabled?`Daily limit: ${x.dailyLimit} · Used: ${x.usedToday} · Remaining: ${x.remaining}`:'Business AI Health is not available for this shop';button.disabled=!x.enabled||x.remaining<=0}).catch(e=>{usage.textContent=e.message;button.disabled=true});button.onclick=async()=>{let s=$('#reportStart').value,e=$('#reportEnd').value;if(!s||!e||s>e)return toast('Choose a valid date range.');button.disabled=true;button.textContent='Analyzing business data…';try{let x=await api('business-health/report',{method:'POST',body:JSON.stringify({startDate:s,endDate:e})});renderHealth(x);usage.textContent=`Daily limit: ${x.usage.dailyLimit} · Used: ${x.usage.usedToday} · Remaining: ${x.usage.remaining}`}catch(err){toast(err.message)}finally{button.disabled=false;button.textContent='Generate AI health report'}}}

  };
  render();
}

const healthView=()=>`<section class="shp-pagegap">
  <section class="shp-panel"><div class="shp-panel-head"><div><h3>Business AI Health</h3><p class="shp-desc">Scans sales, purchases, expenses, dues, discounts, cash collection, margin, low stock, customers, suppliers, staff and system activity — then compares the period with the one before it and gives you an organized AI report with a 7-day action plan. Business AI Health never edits your records.</p></div><div class="shp-health-usage" id="healthUsage">Checking availability…</div></div><div class="shp-form-actions" style="justify-content:flex-start"><button class="shp-btn shp-btn-primary" id="generateHealth" type="button">Generate AI health report</button></div></section>
  <div id="healthResult" class="shp-pagegap"><section class="shp-panel">${shpEmpty('Choose a date range above, then generate a Business AI Health report.')}</section></div>
</section>`;
const renderHealth=x=>{
 let d=x.snapshot||{},m=v=>money(v);
 const list=(rows,empty)=>rows?.length?`<ol>${rows.map(r=>`<li><span>${esc(r.name)}</span><b>${m(r.total)}</b></li>`).join('')}</ol>`:`<p class="shp-desc">${empty}</p>`;
 const pctOr=(v,fmt)=>v==null?'—':(v===0?'0%':(v>0?'▲ +'+v+'%':'▼ '+v+'%'));
 const trend=(rec,goodUp=true)=>{if(!rec)return '';if(rec.pct==null)return `<span class="shp-delta shp-dn">no prior data</span>`;const good=rec.pct===0?null:(rec.pct>0?goodUp:!goodUp);return `<span class="shp-delta ${good==null?'':good?'shp-up':'shp-dn'}">${pctOr(rec.pct)} vs ${rec.prev==null?'—':m(rec.prev)}</span>`};
 const card=(label,val,sub,cls='')=>`<article class="${cls}"><small>${label}</small><b>${val}</b><span>${sub??''}</span></article>`;
 const r=d.ratios||{},tr=d.trend||{},prof=d.profit||{},du=d.due||{},inv=d.inventory||{},per=d.period||{},ppl=d.people||{};
 $('#healthResult').innerHTML=`
<section class="shp-panel"><div class="shp-health-score"><div class="shp-score" style="--pct:${x.score}"><i></i><div style="display:grid;place-items:center"><b>${x.score}</b><small>/ 100</small></div></div>
 <div><span class="shp-kicker">Business health score</span><h3 style="margin-top:4px">${x.score>=80?'Healthy business position':x.score>=60?'Needs attention':'Priority action needed'}</h3>
 <p class="shp-desc">Period ${esc(per.start||'')} to ${esc(per.end||'')} (${per.days||'?'} day(s)), compared with ${esc(per.previousStart||'')} to ${esc(per.previousEnd||'')}. Score blends due collection, discounts, margin, stock, profile completeness and recorded errors.</p>
 <div class="shp-htrends">
  <span>Sales ${trend(tr.sales,true)}</span><span>Est. profit ${trend(tr.profit,true)}</span><span>Expenses ${trend(tr.expense,false)}</span><span>Purchases ${trend(tr.purchase,true)}</span>
 </div></div></div></section>

<div class="shp-hm shp-hm2">
 ${card('Sales',m(d.sales?.total||0),`${d.sales?.count||0} invoice(s) · ${d.sales?.uniqueCustomers||0} buyer(s)`)}
 ${card('Cash collected',m(d.sales?.collected||0),r.collectionRate==null?'—':'Collection '+r.collectionRate+'%',(r.collectionRate!=null&&r.collectionRate<60)?'shp-warn':'')}
 ${card('Est. profit',m(prof.value||0),prof.marginPct==null?'—':'Margin '+prof.marginPct+'%',(prof.value!=null&&prof.value<0)?'shp-bad':prof.marginPct!=null&&prof.marginPct<10?'shp-warn':'')}
 ${card('Total due',m(du.total||0),(r.dueRate==null?'':'Due '+r.dueRate+'% of sales · ')+'Recovered '+m(du.recovered||0),(du.total>0&&(r.dueRate||0)>50)?'shp-bad':'')}
 ${card('Purchases',m(d.purchase?.total||0),`${d.purchase?.count||0} bill(s) · paid ${m(d.purchase?.paid||0)}`)}
 ${card('Expenses',m(d.expense?.total||0),`${d.expense?.count||0} record(s) · paid ${m(d.expense?.paid||0)}`,(r.expenseRatio!=null&&r.expenseRatio>60)?'shp-warn':'')}
 ${card('Discount given',m(d.sales?.discount||0),r.discountRate==null?'Selected period':r.discountRate+'% of sales',(r.discountRate!=null&&r.discountRate>20)?'shp-warn':'')}
 ${card('Average sale',m(d.sales?.avg||0),'Per invoice')}
 ${card('Busiest day',d.busiestDay?esc(d.busiestDay.date):'—',d.busiestDay?m(d.busiestDay.total)+' sold':'No sales in period')}
 ${card('Low stock',inv.lowStockCount||0,(inv.outStockCount?inv.outStockCount+' out of stock · ':'')+'reorder soon',inv.outStockCount?'shp-bad':inv.lowStockCount?'shp-warn':'')}
</div>

<div class="shp-rgrid">
 <section class="shp-panel"><div class="shp-panel-head"><div><h3>Data checks & risks</h3><p class="shp-desc">Automatically calculated from your saved records — each one links to a real figure.</p></div></div>
 <ul class="shp-hfind">${d.findings?.length?d.findings.map(i=>`<li>${esc(i)}</li>`).join(''):'<li>No automated risk was found in this period.</li>'}</ul>
 <p class="shp-desc"><b>Store profile:</b> ${d.missing?.length?'Missing '+esc(d.missing.join(', '))+'. Complete it from shop settings so invoices & emails look professional.':'Email, phone and address are complete.'}</p>
 <p class="shp-desc"><b>Activity captured:</b> ${d.activityCount||0} log entr${d.activityCount===1?'y':'ies'}, ${d.errors||0} system error(s). <b>People on record:</b> ${ppl.customersCount||0} customers, ${ppl.suppliersCount||0} suppliers, ${ppl.staffCount||0} staff.</p>
 </section>
 <section class="shp-panel"><div class="shp-panel-head"><div><h3>This period vs previous</h3><p class="shp-desc">Same number of days, immediately before the chosen range.</p></div></div>
 <table class="shp-htable"><thead><tr><th></th><th>This period</th><th>Previous</th><th>Change</th></tr></thead><tbody>
 ${[['Sales',tr.sales,true],['Purchases',tr.purchase,true],['Expenses',tr.expense,false],['Est. profit',tr.profit,true]].map(([label,rec,goodUp])=>{rec=rec||{};const p=rec.pct;const good=p==null||p===0?'':p>0?(goodUp?'shp-up':'shp-dn'):(goodUp?'shp-dn':'shp-up');return `<tr><td>${label}</td><td>${m(rec.now||0)}</td><td>${m(rec.prev||0)}</td><td class="${good}">${p==null?'—':(p>0?'+':'')+p+'%'}</td></tr>`}).join('')}
 </tbody></table>
 ${du.total>0?`<p class="shp-desc" style="margin-top:10px"><b>Due recovery:</b> ${du.recoveryRate==null?'—':du.recoveryRate+'%'} of dues came back during the period (${m(du.recovered||0)} recovered vs ${m(du.total||0)} still open).</p>`:''}
 </section>
</div>

${inv.lowStockItems?.length?`<section class="shp-panel"><div class="shp-panel-head"><div><h3>Items to reorder first</h3><p class="shp-desc">At or below your low-stock threshold, fewest units first.</p></div></div><div class="shp-hlow">${inv.lowStockItems.map(i=>`<span class="shp-lowchip ${i.stock===0?'out':''}">${esc(i.name||'Unnamed item')} <b>${i.stock} left</b></span>`).join('')}</div></section>`:''}

<section class="shp-panel"><div class="shp-panel-head"><div><h3>Top business contributors</h3><p class="shp-desc">Based on transaction value in the selected date range.</p></div></div><div class="shp-hlead"><div><h3>Top customers</h3>${list(d.topCustomers,'No sales customer data.')}</div><div><h3>Top suppliers</h3>${list(d.topSuppliers,'No purchase supplier data.')}</div><div><h3>Top sales staff</h3>${list(d.topSalesStaff,'No staff sales data.')}</div></div></section>

<section class="shp-panel"><div class="shp-panel-head"><div><h3>AI health report</h3><p class="shp-desc">A friendly, read-only report written from the numbers above — overview, what works, what needs attention, a 7-day action plan, cash & due guidance and growth ideas.</p></div></div><div class="shp-hreport shp-fm">${fmtAI(x.insights||'')}</div></section>`};

function salesTrendChart(t){
  const W=780,H=280,L=56,R=18,T=18,B=36,iw=W-L-R,ih=H-T-B,n=Math.max(2,t.daysInMonth||1);
  const all=t.thisMonth.concat(t.prevMonth),ymax=Math.max(1,...all);
  const x=i=>L+(i*(iw/(n-1)));
  const y=v=>T+ih-((v/ymax)*ih);
  const line=(arr,cls)=>`<polyline class="${cls}"${cls==='shp-tline'?' pathLength="1"':''} points="${arr.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
  const area=(arr,cls)=>`<polygon class="${cls}" points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${arr.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} ${x(n-1).toFixed(1)},${y(0).toFixed(1)}"/>`;
  const dots=(arr,cls)=>arr.map((v,i)=>v>0?`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" class="${cls}"/>`:'').join('');
  const yticks=[0,0.25,0.5,0.75,1].map(f=>{const vv=ymax*f;return `<text class="shp-tylab" x="${L-8}" y="${(y(vv)+3.5).toFixed(1)}" text-anchor="end">${money(vv)}</text><line class="shp-tgrid" x1="${L}" y1="${y(vv).toFixed(1)}" x2="${W-R}" y2="${y(vv).toFixed(1)}"/>`}).join('');
  const xticks=[];for(let i=0;i<n;i++){if(i===0||i===n-1||(i+1)%5===0)xticks.push(`<text class="shp-txlab" x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle">${i+1}</text>`)}
  const up=t.growthPct>=0;
  return `<section class="shp-panel shp-trend shp-rise">
    <div class="shp-trend-head"><div><h2>Sales trend</h2><small>Total transactions: ${money(t.thisTotal)}</small></div><span class="shp-growth ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(t.growthPct).toFixed(2)}%</span></div>
    <div class="shp-trend-legend"><span><i class="l1"></i>This month</span><span><i class="l2"></i>Previous month</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily sales trend">${yticks}${area(t.prevMonth,'shp-tarea-prev')}${line(t.prevMonth,'shp-tline-prev')}${dots(t.prevMonth,'shp-tdot-prev')}${area(t.thisMonth,'shp-tarea')}${line(t.thisMonth,'shp-tline')}${dots(t.thisMonth,'shp-tdot')}${xticks.join('')}</svg>
  </section>`
}
async function attendancePage(){
  const today=new Date(Date.now()+6*3600*1000).toISOString().slice(0,10);
  const dhakaLabel=()=>new Date(Date.now()+6*3600*1000).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  let selected={};
  let status='present';
  $('#page').innerHTML=skelFor(SHP_SKEL,'attendance');const data=await api('attendance?date='+today);
  const renderStaffList=()=>{
    const box=$('#attStaffList'),q=$('#attSearch').value.toLowerCase();
    const rows=data.staffs.filter(x=>!q||(x.full_name+' '+x.user_id+' '+(x.position||'')).toLowerCase().includes(q));
    box.innerHTML=rows.length?rows.map(x=>`<label class="shp-att-item ${selected[x.id]?'on':''}"><input type="checkbox" class="shp-att-check" data-id="${x.id}" ${selected[x.id]?'checked':''}><span class="n"><b>${esc(x.full_name)}</b><small>${esc(x.user_id)} · ${esc(x.position||'—')}</small></span></label>`).join(''):'<p class="shp-desc">No staff members found.</p>';
    box.querySelectorAll('.shp-att-check').forEach(c=>c.onchange=()=>{const id=c.dataset.id;if(c.checked)selected[id]=true;else delete selected[id];renderStaffList()});
  };
  $('#page').innerHTML=shpHead('Staff','Attendance','Mark present or absent for '+esc(dhakaLabel())+' — saved per staff member with an optional note.',`<button class="shp-btn shp-btn-soft" id="attHistoryBtn" type="button">${lucide('history')} Saved history</button><button class="shp-btn shp-btn-soft" id="attBack" type="button">${lucide('undo')} Staff manager</button>`)+`<div class="shp-att">
    <section class="shp-panel">
      <div class="shp-panel-head"><h3>Select staff</h3><span class="shp-kicker">${Object.keys(selected).length} selected</span></div>
      <input id="attSearch" class="shp-search" placeholder="Search staff" style="max-width:100%">
      <label class="shp-att-bulk"><input type="checkbox" id="attBulkAll"> Select all</label>
      <div id="attStaffList" class="shp-att-list"></div>
    </section>
    <section class="shp-panel">
      <div class="shp-panel-head"><h3>Attendance register</h3><span class="shp-att-date">${esc(dhakaLabel())}</span></div>
      <div class="shp-att-slide-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="shp-kicker">Mark attendance as</span>
        <label class="shp-att-slide"><input type="checkbox" id="attStatus" checked><span class="shp-att-track"><i></i></span><span class="shp-att-lbls"><b class="on">Present</b><b>Absent</b></span></label>
      </div>
      <label>Note<textarea id="attNote" rows="3" placeholder="Optional note"></textarea></label>
      <div class="shp-form-actions"><button class="shp-btn shp-btn-primary" id="attSave">Save attendance</button></div>
    </section>
  </div>
  <section class="shp-panel"><div class="shp-panel-head"><h3>Saved attendance</h3><input id="attSavedSearch" class="shp-search" placeholder="Search by name, user ID, or date"></div><div id="attSaved"></div></section>`;
  renderStaffList();
  const attBack=$('#attBack');if(attBack)attBack.onclick=()=>page('staff-manager');
  const attHistoryBtn=$('#attHistoryBtn');if(attHistoryBtn)attHistoryBtn.onclick=()=>$('#attSaved')?.scrollIntoView({behavior:'smooth',block:'start'});
  $('#attSearch').oninput=renderStaffList;
  $('#attBulkAll').onchange=e=>{const ck=e.target.checked;for(const x of data.staffs){if(ck)selected[x.id]=true;else delete selected[x.id]}renderStaffList()};
  $('#attStatus').onchange=e=>{status=e.target.checked?'present':'absent';const lbls=$('#attStatus').closest('.shp-att-slide').querySelectorAll('.shp-att-lbls b');lbls[0].classList.toggle('on',status==='present');lbls[1].classList.toggle('on',status!=='present')};
  const renderSaved=()=>{
    const box=$('#attSaved'),q=($('#attSavedSearch')?.value||'').toLowerCase();
    const rows=data.records.filter(r=>!q||(r.full_name+' '+r.user_id+' '+r.attendance_date).toLowerCase().includes(q));
    box.innerHTML=rows.length?`<div class="shp-tw"><table><thead><tr><th>Date</th><th>Name</th><th>User ID</th><th>Position</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.attendance_date)}</td><td>${esc(r.full_name)}</td><td><code>${esc(r.user_id)}</code></td><td>${esc(r.position||'—')}</td><td>${shpBadge(r.status==='present'?'Present':'Absent',r.status==='present'?'emerald':'rose')}</td><td class="shp-wrap">${esc(r.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="shp-desc">No attendance records found.</p>';
  };
  renderSaved();
  $('#attSavedSearch').oninput=renderSaved;
  $('#attSave').onclick=async()=>{
    const ids=Object.keys(selected);
    if(!ids.length)return toast('Select at least one staff member.');
    const records=ids.map(id=>({staff_id:id,status,note:$('#attNote').value.trim()||null}));
    try{await api('attendance',{method:'POST',body:JSON.stringify({date:today,records})});toast('Attendance saved.');const fresh=await api('attendance');data.records=fresh.records;renderSaved()}catch(e){toast(e.message)}
  };
}

async function salaryPage(){
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNow=()=>new Date(Date.now()+6*3600*1000).toISOString().slice(0,7);
  const monthLabel=ym=>{let [y,m]=String(ym).split('-');return (MN[+m-1]||'')+' '+(y||'')};
  const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const typeBadge=t=>t==='due'?shpBadge('Due','amber'):t==='advance'?shpBadge('Advance','sky'):shpBadge('Current','emerald');
  const statusBadge=d=>Number(d)<=0?shpBadge('Paid','emerald'):shpBadge('Unpaid','rose');
  let staffs=[],summary={},invoices=[],att={present:0,total:0},selected=null,q='';
  const byId=id=>staffs.find(x=>x.id===id);
  const canAdd=canAccess('salary','add'),canDel=canAccess('salary','delete');

  $('#page').innerHTML=shpHead('Staff','Salary','Payroll invoices with attendance-based pay, adjustments and advances.',`<span class="shp-att-date">${lucide('calendar')} ${monthLabel(monthNow())}</span><button class="shp-btn shp-btn-soft" id="salBack">${lucide('undo')} Staff manager</button>`)+`<div class="shp-sal">
    <aside class="shp-sal-side">
      <div class="shp-panel-head"><h3>${lucide('users')} Staff</h3><span class="shp-sal-count" id="salCount">0</span></div>
      <input id="salSearch" class="shp-search" placeholder="Search staff…" style="max-width:100%">
      <div class="shp-sal-list" id="salList"></div>
    </aside>
    <section class="shp-sal-main" id="salMain">${SKEL.kpis(4)+SKEL.panel(SKEL.form(6))+SKEL.panel(SKEL.table(3,5))}</section>
  </div>`;
  $('#salBack').onclick=()=>page('staff-manager');
  $('#salSearch').oninput=e=>{q=e.target.value;renderList()};

  function renderList(){
    let list=q?staffs.filter(x=>JSON.stringify([x.full_name,x.position,x.user_id]).toLowerCase().includes(q.toLowerCase())):staffs;
    $('#salCount').textContent=list.length;
    $('#salList').innerHTML=list.length?list.map(x=>`<button type="button" class="shp-sal-item${x.id===selected?' on':''}" data-id="${x.id}"><span class="shp-sal-ava">${esc(initials(x.full_name))}</span><span class="n"><b>${esc(x.full_name)}</b><small>${esc(x.position||'—')}</small></span><span class="shp-sal-dot${x.active===false?'':' on'}"></span></button>`).join(''):'<p class="shp-desc">No staff found.</p>';
    document.querySelectorAll('.shp-sal-item').forEach(el=>el.onclick=()=>select(el.dataset.id));
  }

  function profileHtml(p){
    const s=summary[p.id]||{};
    return `<div class="shp-sal-prof">
      <div class="who"><span class="shp-sal-ava big">${esc(initials(p.full_name))}</span>
        <div><h3>${esc(p.full_name)}</h3><div class="shp-sal-meta">
          <span>${lucide('briefcase')} ${esc(p.position||'—')}</span>
          <span>${lucide('calendar')} Joined ${esc((p.created_at||'').slice(0,10))}</span>
          <span>${lucide('mail')} ${esc(p.email||'—')}</span>
        </div></div></div>
      <div class="shp-sal-stats">
        <span class="shp-sal-stat">${lucide('banknote')} Base: <b>৳ ${money(s.monthly||0)}</b></span>
        <span class="shp-sal-stat">${lucide('clock')} Present: <b>${att.present}/${att.total}d</b></span>
      </div></div>`;
  }
  function cardsHtml(p){
    const s=summary[p.id]||{};
    return `<div class="shp-grid shp-kpis shp-anim-kpis">${shpKpi('banknote','emerald','Monthly salary','৳ '+money(s.monthly||0),'Base salary')}${shpKpi('wallet','amber','Outstanding due','৳ '+money(s.outstandingDue||0),'Unpaid salary')}${shpKpi('coins','rose','Taken advance','৳ '+money(s.takenAdvance||0),'Advance payments')}${shpKpi('receipt','sky','Total paid · YTD','৳ '+money(s.totalPaidYTD||0),'This year')}</div>`;
  }
  function formHtml(p){
    const s=summary[p.id]||{},pct=att.total>0?Math.round(att.present/att.total*100):0;
    return `<section class="shp-panel"><div class="shp-panel-head"><h3>${lucide('filetext')} Create salary invoice</h3><span class="shp-kicker">Payroll</span></div><div class="shp-sal-form">
      <div class="shp-sal-fgrid">
        <label class="shp-sal-field">Invoice type<select id="salType"><option value="current">Current Salary</option><option value="due">Outstanding Due</option><option value="advance">Advance Payment</option></select></label>
        <label class="shp-sal-field">Salary month<input type="month" id="salMonth" value="${monthNow()}"></label>
        <div class="shp-sal-full" id="salAdjust">
          <div class="shp-sal-att">
            <label class="shp-att-lbl" style="display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;color:var(--shp-text2);cursor:pointer"><input type="checkbox" id="salAttBased"> ${lucide('clock')} Attendance based salary</label>
            <span class="info">Present: <b id="salAttP">${att.present}</b> / <b id="salAttT">${att.total}</b> days · Prorated: <b id="salAttPct">${pct}%</b></span>
          </div>
          <span class="shp-kicker">Salary adjustments · optional</span>
          <div class="shp-sal-adj">
            <div><span class="plus">+</span><label>Incentive</label><input type="number" id="salIncentive" value="0" min="0" step="50"></div>
            <div><span class="plus">+</span><label>Bonus</label><input type="number" id="salBonus" value="0" min="0" step="50"></div>
            <div><span class="minus">−</span><label>Fine</label><input type="number" id="salFine" value="0" min="0" step="50"></div>
            <div><span class="minus">−</span><label>Other deduction</label><input type="number" id="salOther" value="0" min="0" step="50"></div>
          </div>
          <div class="shp-sal-toggles">
            <label><input type="checkbox" id="salAddOut"> Add outstanding due <span class="shp-sal-pv" id="salPvOut">৳ 0</span></label>
            <label><input type="checkbox" id="salCutAdv"> Cut advance payment <span class="shp-sal-pv" id="salPvAdv">৳ 0</span></label>
          </div>
        </div>
        <label class="shp-sal-full">${lucide('banknote')} Paid amount<input type="number" id="salPaid" value="0" min="0" step="50" placeholder="0"><span class="shp-sal-hint" id="salPaidHint">(enter the amount already paid)</span></label>
        <div class="shp-sal-full"><div class="shp-sal-sum">
          <div><span class="sl">Total</span><span class="sv">৳ <span id="salTotal">0</span></span></div>
          <div><span class="sl">Paid</span><span class="sv">৳ <span id="salPaidView">0</span></span></div>
          <div><span class="sl">Due</span><span class="sv">৳ <span id="salDue">0</span></span></div>
          <div><span class="sl">Net payable</span><span class="sv">৳ <span id="salNet">0</span></span></div>
        </div></div>
      </div>
      <div class="shp-sal-actions">
        <button class="shp-btn shp-btn-soft" id="salReset">${lucide('undo')} Reset</button>
        ${canAdd?`<button class="shp-btn shp-btn-primary" id="salSave">${lucide('save')} Save invoice</button>`:'<span class="shp-desc" style="align-self:center;">Read-only access — saving is disabled.</span>'}
      </div></div></section>`;
  }
  function historyHtml(){
    return `<section class="shp-panel"><div class="shp-panel-head"><h3>${lucide('history')} Salary history</h3><span class="shp-kicker">${invoices.length} invoice(s)</span></div><div class="shp-tw"><table><thead><tr><th>Month</th><th>Type</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th>${canDel?'<th></th>':''}</tr></thead><tbody id="salHistoryBody">${invoices.length?invoices.map(h=>`<tr><td><b>${esc(monthLabel(h.salary_month))}</b></td><td>${typeBadge(h.invoice_type)}</td><td>৳ ${money(h.total)}</td><td>৳ ${money(h.paid)}</td><td>৳ ${money(h.due)}</td><td>${statusBadge(h.due)}</td>${canDel?`<td style="text-align:right"><button class="shp-icobtn shp-danger" data-del="${h.id}" title="Delete invoice" aria-label="Delete invoice">${lucide('trash')}</button></td>`:''}</tr>`).join(''):`<tr><td colspan="7" class="shp-desc">No salary invoices yet.</td></tr>`}</tbody></table></div></section>`;
  }

  function calc(){
    if(!selected)return;
    const p=byId(selected),s=summary[selected]||{};
    if(!p)return;
    const num=id=>Math.max(0,parseFloat($('#'+id).value)||0);
    const type=$('#salType').value;
    $('#salAdjust').classList.toggle('hidden',type==='advance');
    $('#salPaidHint').textContent=type==='advance'?'(enter the advance amount to pay now)':'(enter the amount already paid)';
    let base=Number(s.monthly||0);
    const useAtt=$('#salAttBased').checked;
    if(useAtt&&att.total>0)base=Math.round(att.present/att.total*base*100)/100;
    let total,paid;
    if(type==='advance'){total=num('salPaid');paid=total;}
    else{
      total=base+num('salIncentive')+num('salBonus')-num('salFine')-num('salOther');
      if($('#salAddOut').checked)total+=Number(s.outstandingDue||0);
      if($('#salCutAdv').checked)total-=Number(s.takenAdvance||0);
      if(total<0)total=0;
      paid=num('salPaid');
    }
    const due=Math.max(0,total-paid);
    $('#salPvOut').textContent='৳ '+money($('#salAddOut').checked?(s.outstandingDue||0):0);
    $('#salPvAdv').textContent='৳ '+money($('#salCutAdv').checked?(s.takenAdvance||0):0);
    $('#salTotal').textContent=money(total);$('#salPaidView').textContent=money(paid);$('#salDue').textContent=money(due);$('#salNet').textContent=money(total);
  }

  function resetForm(){
    if(!selected)return;
    ['salIncentive','salBonus','salFine','salOther','salPaid'].forEach(id=>$('#'+id).value='0');
    ['salAttBased','salAddOut','salCutAdv'].forEach(id=>$('#'+id).checked=false);
    $('#salType').value='current';$('#salMonth').value=monthNow();
    calc();
  }

  function renderDetail(){
    const p=byId(selected);
    if(!p){$('#salMain').innerHTML='<p class="shp-desc">Select a staff member to manage salary.</p>';return}
    $('#salMain').innerHTML=profileHtml(p)+cardsHtml(p)+formHtml(p)+historyHtml();
    $('#salType').onchange=calc;
    $('#salMonth').onchange=async()=>{await load(true);renderDetail()};
    ['salAttBased','salAddOut','salCutAdv','salIncentive','salBonus','salFine','salOther','salPaid'].forEach(id=>$('#'+id).oninput=calc);
    $('#salReset').onclick=resetForm;
    if(canAdd&&$('#salSave'))$('#salSave').onclick=save;
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this salary invoice?'))return;try{await api('salary/'+b.dataset.del,{method:'DELETE'});toast('Salary invoice deleted.');await load(true);renderList();renderDetail()}catch(e){toast(e.message)}});
    calc();
  }

  async function save(){
    const p=byId(selected);if(!p)return toast('Select a staff member first.');
    const month=$('#salMonth').value;
    if(!/^\d{4}-\d{2}$/.test(month))return toast('Please select a salary month.');
    const type=$('#salType').value,num=id=>Math.max(0,parseFloat($('#'+id).value)||0);
    const rec={staff_id:p.id,salary_month:month,invoice_type:type,base_amount:Number((summary[selected]||{}).monthly||0),attendance_based:$('#salAttBased').checked,present_days:att.present,total_days:att.total,incentive:num('salIncentive'),bonus:num('salBonus'),fine:num('salFine'),other_deduction:num('salOther'),add_outstanding:$('#salAddOut').checked,cut_advance:$('#salCutAdv').checked,paid:num('salPaid')};
    try{
      await api('salary',{method:'POST',body:JSON.stringify(rec)});
      toast('Salary invoice saved for '+p.full_name+'.');
      await load(true);renderList();renderDetail();
    }catch(e){toast(e.message)}
  }

  async function load(keep){
    let url='salary';
    if(keep&&selected)url+='?staff_id='+encodeURIComponent(selected)+'&month='+encodeURIComponent($('#salMonth')?$('#salMonth').value:monthNow());
    let d=await api(url);
    staffs=d.staffs||[];summary=d.summary||{};
    if(keep&&selected){invoices=d.invoices||[];att=d.attendance||{present:0,total:0}}
    else{invoices=[];att={present:0,total:0}}
  }

  async function select(id){
    selected=id;renderList();
    $('#salMain').innerHTML=SKEL.kpis(4)+SKEL.panel(SKEL.form(6))+SKEL.panel(SKEL.table(3,5));
    try{
      let d=await api('salary?staff_id='+encodeURIComponent(id)+'&month='+encodeURIComponent($('#salMonth')?$('#salMonth').value:monthNow()));
      invoices=d.invoices||[];att=d.attendance||{present:0,total:0};summary=d.summary||summary;
      renderDetail();
    }catch(e){$('#salMain').innerHTML='<p class="shp-desc">'+esc(e.message)+'</p>'}
  }

  try{await load(false)}catch(e){toast(e.message)}
  renderList();
  if(staffs.length)await select(staffs[0].id);else $('#salMain').innerHTML='<p class="shp-desc">No staff members yet. Add staff from the Staff manager first.</p>';
}

/* ───────────────────── Vaultium inline file viewer ─────────────────────
   View every supported format inside a bento modal (no new browser tab):
   images · PDF · text/csv/json/log/md · .docx (mammoth) · .xlsx (SheetJS).
   Ported from the InfluenceOS Vaultium upgrade and restyled to EMS. */
const _vScripts={};
const vLoadScript=src=>_vScripts[src]??=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=src;sc.onload=res;sc.onerror=()=>rej(Error('The viewer library could not be loaded.'));document.head.append(sc)});
const vBlobText=blob=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result));fr.onerror=()=>rej(fr.error||Error('Could not read file'));fr.readAsText(blob)});
const vBlobBuf=blob=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error||Error('Could not read file'));fr.readAsArrayBuffer(blob)});
function vaultKind(name,ct){
  const ext=String(name||'').split('.').pop().toLowerCase();
  if(/^image\//.test(ct)||['png','jpg','jpeg','webp','gif','bmp','svg','avif','ico'].includes(ext))return {kind:'image',icon:'image',tone:'fuchsia',label:'Image'};
  if(ct==='application/pdf'||ext==='pdf')return {kind:'pdf',icon:'docfile',tone:'rose',label:'PDF'};
  if(ext==='docx'||ext==='doc')return {kind:'docx',icon:'docfile',tone:'sky',label:'Word'};
  if(ext==='xlsx'||ext==='xls')return {kind:'sheet',icon:'sheet',tone:'emerald',label:'Spreadsheet'};
  if(['txt','csv','json','log','md','xml','yaml','yml','sql','js','ts','css','html','htm'].includes(ext)||ct.startsWith('text/'))return {kind:'text',icon:'filetext',tone:'zinc',label:'Document'};
  return {kind:'other',icon:'file',tone:'amber',label:'File'};
}
const vaultFallback=(name,msg)=>`<div class="fv-fallback"><div class="fv-ico">${lucide('file')}</div><p><b>${esc(name||'File')}</b><br>${esc(msg||'No inline preview for this format — use Download to open it.')}</p></div>`;
async function vaultDownload(f){
  try{
    const r=await fetch('/api/vaultium/file/'+f.id,{headers:{authorization:'Bearer '+state.token}});
    if(!r.ok)throw Error('Download failed');
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=f.filename||'file';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){toast(e.message)}
}
async function vaultFileViewer(id,name){
  const e=shpModal(esc(name||'File'),`<div class="fv-body is-loading" id="fvBody"><div class="fv-fallback"><div class="fv-ico">${lucide('download')}</div><p>Loading file…</p></div></div><div class="fv-actions"><button class="shp-btn shp-btn-soft" id="fvClose" type="button">Close</button><button class="shp-btn shp-btn-primary" id="fvDl" type="button">${lucide('download')} Download</button></div>`,'shp-modal-xl');
  const body=e.querySelector('#fvBody');let blobUrl=null;
  const cleanup=()=>{if(blobUrl)URL.revokeObjectURL(blobUrl)};
  e.querySelector('#fvClose').onclick=()=>{cleanup();e.remove()};
  e.querySelector('.shp-x').onclick=()=>{cleanup();e.remove()};
  e.addEventListener('click',ev=>{if(ev.target===e){cleanup();e.remove()}},true);
  try{
    const r=await fetch('/api/vaultium/file/'+id,{headers:{authorization:'Bearer '+state.token}});
    if(!r.ok){const x=await r.json().catch(()=>({}));throw Error(x.error||'Could not open file')}
    const blob=await r.blob(),url=URL.createObjectURL(blob);blobUrl=url;
    e.querySelector('#fvDl').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=name||'file';document.body.append(a);a.click();a.remove()};
    const ct=String(blob.type||''),k=vaultKind(name,ct),ext=String(name||'').split('.').pop().toLowerCase();
    body.classList.remove('is-loading');
    if(k.kind==='image'){
      body.innerHTML=`<div class="fv-imgbox"><img src="${url}" alt="${esc(name)}"></div>`;
    }else if(k.kind==='pdf'){
      body.innerHTML=`<iframe class="fv-pdf" src="${url}" title="${esc(name)}"></iframe>`;
    }else if(k.kind==='text'){
      body.innerHTML=`<pre class="fv-pre">${esc(await vBlobText(blob))}</pre>`;
    }else if(k.kind==='docx'){
      try{
        await vLoadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
        const out=await window.mammoth.convertToHtml({arrayBuffer:await vBlobBuf(blob)});
        body.innerHTML=`<div class="fv-doc">${out.value||'<p>(empty document)</p>'}</div>`;
      }catch(err){body.innerHTML=vaultFallback(name)}
    }else if(k.kind==='sheet'){
      try{
        await vLoadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        const wb=XLSX.read(await vBlobBuf(blob),{type:'array'}),sh=wb.Sheets[wb.SheetNames[0]];
        body.innerHTML=`<div class="fv-sheet"><b>${esc(wb.SheetNames[0]||'Sheet')}</b>${XLSX.utils.sheet_to_html(sh)}</div>`;
      }catch(err){body.innerHTML=vaultFallback(name)}
    }else{
      body.innerHTML=vaultFallback(name);
    }
  }catch(err){body.classList.remove('is-loading');body.innerHTML=vaultFallback(name,err.message)}
}
/* ───────── Row attachment folders (sales / purchase / expense lists) ───────── */
let attCache=null,attCacheAt=0;
const vFmtSize=v=>{const n=Number(v||0);return n>=GB2?((n/GB2).toFixed(2)+' GB'):n>=MB2?((n/MB2).toFixed(1)+' MB'):(n>=KB2?((n/KB2).toFixed(0)+' KB'):n+' B')};
async function attachmentsIndex(force=false){
 if(!force&&attCache&&Date.now()-attCacheAt<60000)return attCache;
 const [files,av]=await Promise.all([api('vaultium/source-files').catch(()=>[]),api('vaultium/availability').catch(()=>null)]);
 const byInvoice={},byExpense={},byCode={};
 for(const f of files){
  if(f.invoice_id)(byInvoice[f.invoice_id]??=[]).push(f);
  if(f.expense_id)(byExpense[f.expense_id]??=[]).push(f);
  const code=f.expense_code||(!f.invoice_id?f.invoice_number:null);
  if(code)(byCode[code]??=[]).push(f);
 }
 attCache={files,byInvoice,byExpense,byCode,av};attCacheAt=Date.now();
 return attCache;
}
function attListFor(t){
 if(!attCache)return [];
 if(t.t==='inv')return attCache.byInvoice[t.id]||[];
 return attCache.byExpense[t.id]||attCache.byCode[t.code]||[];
}
function folderBtn(target){
 const n=attListFor(target).length;
 return `<button type="button" class="shp-foldbtn ${n?'has':''}" data-att-target='${esc(JSON.stringify(target))}' title="${n?n+' attached file'+(n>1?'s':''):'No attachments — click to attach'}"><span class="shp-foldico">${lucide(n?'folder':'folder-plus')}</span>${n?`<i class="shp-foldn">${n}</i>`:''}</button>`;
}
function attSyncBadges(){
 document.querySelectorAll('[data-att-target]').forEach(b=>{
  let t;try{t=JSON.parse(b.dataset.attTarget)}catch{return}
  const n=attListFor(t).length;
  b.classList.toggle('has',!!n);
  b.title=n?n+' attached file'+(n>1?'s':''):'No attachments — click to attach';
  b.querySelector('.shp-foldico').innerHTML=lucide(n?'folder':'folder-plus');
  let badge=b.querySelector('.shp-foldn');
  if(n){if(!badge){badge=document.createElement('i');badge.className='shp-foldn';b.appendChild(badge)}badge.textContent=n}else if(badge)badge.remove();
 });
}
async function attachmentsModal(target){
 await attachmentsIndex();
 const isInv=target.t==='inv';
 const label=(isInv?'Invoice ':'Expense ')+(target.num||target.code||'');
 const canAdd=!!(attCache.av?.enabled&&canAccess('vaultium','add')),canDel=canAccess('vaultium','delete');
 const e=shpModal(esc(label)+' · file attachments',`<div id="attBody" class="shp-attbody"><div class="shp-attloading">Loading attachments…</div></div>`,'shp-modal-lg');
 const draw=async()=>{
  await attachmentsIndex(true);
  const list=attListFor(target),body=e.querySelector('#attBody');
  const rows=list.length?`<div class="shp-attlist">${list.map(f=>{const k=vaultKind(f.filename,f.content_type);return `<div class="shp-attrow"><span class="shp-chipic shp-t-${k.tone}">${lucide(k.icon)}</span><span class="shp-filemeta"><b class="shp-fname">${esc(f.filename)}</b><small>${vFmtSize(f.size_bytes)} · ${new Date(f.created_at).toLocaleString()}</small></span><span class="shp-rowacts"><button type="button" class="shp-icobtn" data-att-view="${f.id}" title="View ${esc(f.filename)}" aria-label="View">${lucide('eye')}</button><button type="button" class="shp-icobtn dl" data-att-dl="${f.id}" title="Download" aria-label="Download">${lucide('download')}</button>${canDel?`<button type="button" class="shp-icobtn shp-danger" data-att-del="${f.id}" title="Delete" aria-label="Delete">${lucide('trash')}</button>`:''}</span></div>`}).join('')}</div>`:`<div class="shp-attempty">${lucide('folder-open')}<b>No attachments yet</b><small>Files are stored in Vaultium — up to 5 files per record, 5 MB each.</small></div>`;
  const uploader=(canAdd&&list.length<5)?`<div class="shp-attach shp-attach-att"><label class="shp-attachpick"><input type="file" id="attFileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"><span class="shp-attachpickic">${lucide('upload')}</span><span>Click to attach files — max 5 per record, 5 MB each</span></label></div>`:(attCache.av?.enabled?'':'<p class="shp-attnote">Vaultium is not active for this shop — ask the administrator to enable the Vaultium add-on to attach files.</p>');
  body.innerHTML=rows+uploader;
  const find=fid=>attListFor(target).find(x=>x.id===fid);
  body.querySelectorAll('[data-att-view]').forEach(b=>b.onclick=()=>{const f=find(b.dataset.attView);if(f)vaultFileViewer(f.id,f.filename)});
  body.querySelectorAll('[data-att-dl]').forEach(b=>b.onclick=()=>{const f=find(b.dataset.attDl);if(f)vaultDownload(f)});
  body.querySelectorAll('[data-att-del]').forEach(b=>b.onclick=async()=>{const f=find(b.dataset.attDel);if(!f||!confirm('Permanently delete "'+f.filename+'"? This cannot be undone.'))return;try{await api('vaultium/delete',{method:'POST',body:JSON.stringify({id:f.id})});toast('File deleted.');await attachmentsIndex(true);attSyncBadges();draw()}catch(err){toast(err.message)}});
  const fi=body.querySelector('#attFileInput');
  if(fi)fi.onchange=async ev=>{
   const picked=[...ev.target.files];ev.target.value='';
   if(!picked.length)return;
   const room=5-attListFor(target).length;
   if(room<=0)return toast('Maximum 5 files per record.');
   if(picked.length>room)toast('Only '+room+' more file(s) allowed for this record.');
   fi.closest('.shp-attachpick').classList.add('is-busy');
   for(const f of picked.slice(0,room)){
    if(f.size>5*MB2){toast(f.name+' exceeds the 5 MB limit.');continue}
    const fd=new FormData();fd.append('files',f);
    if(isInv){fd.append('invoice_id',target.id);if(target.num)fd.append('invoice_number',target.num)}
    else{fd.append('expense_id',target.id);if(target.code)fd.append('expense_code',target.code)}
    try{await apiUpload('vaultium/upload',fd)}catch(err){toast(err.message);break}
   }
   await attachmentsIndex(true);attSyncBadges();toast('Attachments saved.');draw();
  };
 };
 draw();
}
async function vaultiumPage(){
  const fmt=v=>{const n=Number(v||0);return n>=GB2?((n/GB2).toFixed(2)+' GB'):n>=MB2?((n/MB2).toFixed(1)+' MB'):(n>=KB2?((n/KB2).toFixed(0)+' KB'):n+' B')};
  const [av,files]=await Promise.all([api('vaultium/availability').catch(()=>null),api('vaultium/files')]);
  const gb=av?.gb||0,used=av?.used||0,pct=gb>0?Math.min(100,used/(gb*GB2)*100):0;
  $('#page').innerHTML=shpHead('Tools','Vaultium','Cloud file storage for shop documents and invoice attachments — preview every file without leaving the page.')+`<div class="shp-grid shp-kpis">${shpKpi('file','fuchsia','Storage used',fmt(used),gb>0?('of '+gb+' GB allowance'):'no active plan')}${shpKpi('shield','emerald','Allowance',gb+' GB',av?.enabled?'Active':'Inactive')}${shpKpi('package','sky','Files',files.length,'documents & images')}</div><div class="shp-vault-bar"><i style="width:${pct}%"></i></div><div class="shp-toolbar" style="margin-top:2px"><input id="vaultSearch" class="shp-search" placeholder="Search by invoice number or file name"></div><div id="vaultFiles" class="shp-pagegap"></div>`;
  const renderFiles=list=>{
    $('#vaultFiles').innerHTML=vaultTable(list);
    document.querySelectorAll('[data-vault-view]').forEach(b=>b.onclick=()=>{const f=files.find(x=>x.id===b.dataset.vaultView);if(f)vaultFileViewer(f.id,f.filename)});
    document.querySelectorAll('[data-vault-dl]').forEach(b=>b.onclick=()=>{const f=files.find(x=>x.id===b.dataset.vaultDl);if(f)vaultDownload(f)});
    document.querySelectorAll('[data-vault-del]').forEach(b=>b.onclick=async()=>{const f=files.find(x=>x.id===b.dataset.vaultDel);if(!f)return;if(!confirm('Permanently delete "'+f.filename+'"? This cannot be undone.'))return;try{await api('vaultium/delete',{method:'POST',body:JSON.stringify({id:f.id})});toast('File deleted.');attCache=null;vaultiumPage()}catch(e){toast(e.message)}});
  };
  renderFiles(files);
  $('#vaultSearch').oninput=e=>{const q=e.target.value.toLowerCase();renderFiles(files.filter(f=>(f.invoice_number||'').toLowerCase().includes(q)||(f.expense_code||'').toLowerCase().includes(q)||(f.filename||'').toLowerCase().includes(q)))};
}

function vaultTable(files){
  if(!files.length)return shpEmpty('No files uploaded yet.');
  const fmt=v=>{const n=Number(v||0);return n>=GB2?((n/GB2).toFixed(2)+' GB'):n>=MB2?((n/MB2).toFixed(1)+' MB'):(n>=KB2?((n/KB2).toFixed(0)+' KB'):n+' B')};
  return `<div class="shp-tw"><table><thead><tr><th>File</th><th>Reference</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${files.map(f=>{const k=vaultKind(f.filename,f.content_type),ext=String(f.filename||'').split('.').pop().toUpperCase();const ref=f.expense_code?('Exp · '+f.expense_code):(f.invoice_number||'—');return `<tr><td><div class="shp-filecell"><span class="shp-chipic shp-t-${k.tone}">${lucide(k.icon)}</span><span class="shp-filemeta"><b class="shp-fname">${esc(f.filename)}</b><small>${esc(ext||k.label)}</small></span></div></td><td><code>${esc(ref)}</code></td><td><span class="shp-num">${fmt(f.size_bytes)}</span></td><td>${new Date(f.created_at).toLocaleString()}</td><td><span class="shp-rowacts"><button class="shp-icobtn" data-vault-view="${f.id}" title="View ${esc(f.filename)}" aria-label="View">${lucide('eye')}</button><button class="shp-icobtn dl" data-vault-dl="${f.id}" title="Download" aria-label="Download">${lucide('download')}</button><button class="shp-icobtn shp-danger" data-vault-del="${f.id}" title="Delete" aria-label="Delete">${lucide('trash')}</button></span></td></tr>`}).join('')}</tbody></table></div>`;
}

async function ownerVaultium(){
  const d=await api('platform/vaultium');
  $('#page').innerHTML=obHead('vaultium','Cloud file storage for shops, backed by a single Cloudflare R2 bucket. Pricing and GB allowance are controlled per add-on and license plan.')+`
  <div class="ob-grid ob-kpis">
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('package','emerald')}<span class="ob-kicker">R2 binding</span></div><strong class="ob-kpi-val">${d.r2Binding?'Ready':'Missing'}</strong><span class="ob-kpi-foot">${d.r2Binding?'bucket connected':'add the VAULTIUM binding'}</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('chart','sky')}<span class="ob-kicker">Storage used</span></div><strong class="ob-kpi-val">${d.usedGB}<small> GB</small></strong><span class="ob-kpi-foot">${d.files} file${d.files===1?'':'s'} across all shops</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('key','amber')}<span class="ob-kicker">Setup</span></div><strong class="ob-kpi-val" style="font-size:15px">Add-on based</strong><span class="ob-kpi-foot">license plans / add-ons control GB</span></section>
  </div>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Shop usage</h3><p class="ob-desc">Storage used per shop, with administrator short ID, allowance, period and status.</p></div></div>
    ${d.breakdown&&d.breakdown.length?`<div class="ob-tw"><table><thead><tr><th>Shop ID</th><th>Administrator ID</th><th>Limit</th><th>Usage</th><th>Period (expires)</th><th>Status</th></tr></thead><tbody>${d.breakdown.map(x=>`<tr><td><code>${esc(x.shop_code||'—')}</code></td><td><code>${esc(x.admin_code||'—')}</code></td><td class="ob-num">${x.limit?x.limit+' GB':'—'}</td><td class="ob-num">${esc(x.usedGB)} GB</td><td class="ob-num">${x.expires?new Date(x.expires).toLocaleDateString():'—'}</td><td>${obBadge(esc(x.status),x.status==='Active'?'emerald':'zinc')}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No files uploaded yet.')}
  </section>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Cloudflare R2 setup</h3><p class="ob-desc">One-time platform configuration.</p></div></div>
    <p class="ob-note">Create an R2 bucket in your Cloudflare account and bind it as <b>VAULTIUM</b> in your Pages project (Settings → Functions → R2 bucket bindings). No other configuration is needed — the EMS owner controls pricing and GB via the add-on Setup and license plans.</p>
  </section>`
}
/* ═══════════ SHOP PANEL · Agent Bento Grid shell + helpers ═══════════ */
const SHP_NAV=[
  {h:'Overview',items:[['dashboard','Dashboard','dashboard']]},
  {h:'Operations',items:[['suppliers','Suppliers','truck'],['customers','Customers','users'],['inventory','Inventory','package'],['purchases','Purchases','cart'],['sales','Sales','receipt'],['expense','Expense','wallet'],['due-recover','Due Recover','coins']]},
  {h:'Staff',items:[['staff-manager','Staff Manager','user']]},
  {h:'Insights',items:[['report','Report','chart']]},
  {h:'Tools',items:[['connectx','ConnectX','mail'],['zudo','Zudo','sparkles'],['vaultium','Vaultium','file']]},
  {h:'Preferences',items:[['settings','Settings','settings']]}
];
const SHP_LABEL=Object.fromEntries(SHP_NAV.flatMap(g=>g.items.map(([p,l])=>[p,l])));SHP_LABEL['sale-invoice']='New sales invoice';
const SHP_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const SHP_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const shpTone=x=>x==='sale'||x==='sales'?'emerald':x==='purchase'?'amber':x==='expense'?'rose':x==='inventory'?'sky':'zinc';
const shpChip=(icon,tone='emerald')=>`<span class="shp-chipic shp-t-${tone}">${lucide(icon)}</span>`;
const shpBadge=(txt,tone='zinc')=>`<span class="shp-badge shp-t-${tone}">${txt}</span>`;
/* Shop page titles/subtitles removed per request; action buttons passed as the 4th arg are preserved in a compact toolbar. */
const shpHead=(kicker,titleText,sub='',action='')=>action?`<div class="shp-headactions">${action}</div>`:'';
const shpEmpty=msg=>`<div class="shp-empty"><i></i><p>${msg}</p></div>`;
const shpMeter=(used,limit)=>{const pct=Math.max(0,Math.min(100,limit?Math.round(used/limit*100):100));return `<span class="shp-meter"><i style="width:${pct}%"></i></span>`};
function shpModal(titleText,inner,cls=''){const e=document.createElement('div');e.className='shp-modal';e.innerHTML=`<div class="shp-modalbox ${cls}"><div class="shp-modalhead"><h2>${titleText}</h2><button type="button" class="shp-x" aria-label="Close">×</button></div><div class="shp-modalbody">${inner}</div></div>`;document.body.append(e);e.querySelector('.shp-x').onclick=()=>e.remove();e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});return e}
const shpKpi=(icon,tone,label,value,foot)=>`<section class="shp-card shp-kpi"><div class="shp-kpi-top">${shpChip(icon,tone)}<span class="shp-kicker">${label}</span></div><b class="shp-kpi-val">${value}</b>${foot?`<span class="shp-kpi-foot">${foot}</span>`:''}</section>`;

function shopHome(){
  document.body.classList.remove('adm-on','ob-on');
  document.body.classList.add('shp-on');
  const savedTheme=localStorage.getItem('ems.shpTheme');
  if(savedTheme)document.body.dataset.shpTheme=savedTheme;
  const visible=menus.filter(([,section])=>canAccess(section,'view')&&(section!=='connectx'||state.connectxEnabled||state.connectxHistory)&&(section!=='zudo'||state.zudoEnabled||state.zudoHistory)&&(section!=='vaultium'||state.vaultiumEnabled||state.vaultiumEver));
  const visibleSlugs=new Set(visible.map(([x])=>x.toLowerCase().replaceAll(' ','-')));
  app.innerHTML=`<div class="shp"><aside class="shp-side">
    <div class="shp-brand"><span class="shp-mark shp-t-emerald">${lucide('store')}</span><div class="shp-brandtext"><b data-brand-name>${sk('62px',12)}</b><small>powered by <span data-powered-by>${sk('42px',8)}</span></small></div></div>
    <div class="shp-store"><span class="shp-kicker">Current shop</span><b>${esc(state.store?.name||'—')}</b><span class="shp-store-user"><i>${esc(state.user.name).slice(0,1).toUpperCase()}</i><b>${esc(state.user.name)}</b></span></div>
    <nav class="shp-nav">${SHP_NAV.map(g=>{const items=g.items.filter(([slug])=>visibleSlugs.has(slug));return items.length?`<div class="shp-navgroup"><p>${g.h}</p>${items.map(([slug,label,icon])=>`<button data-page="${slug}" title="${label}"><span class="shp-navicon">${lucide(icon)}</span><span class="shp-navlabel">${label}</span></button>`).join('')}</div>`:''}).join('')}</nav>
    <div class="shp-sidefoot">${state.adminAccess?'<button class="shp-btn shp-btn-ghost" id="returnAdmin">Return to admin</button>':''}<button class="shp-btn shp-btn-soft" id="out">Sign out</button></div>
  </aside><main class="shp-main">
    <header class="shp-top"><button class="shp-iconbtn appBurger" id="shpBurger" type="button" aria-label="Open navigation menu" aria-controls="shpDrawer" aria-expanded="false">${lucide('menu')}</button><div class="shp-toppage"><span>EMS · SHOP</span><b id="shpTopTitle">Dashboard</b></div><div class="shp-topactions"><button class="shp-iconbtn" id="ntfBell" type="button" title="Notifications" aria-label="Notifications" aria-expanded="false">${lucide('bell')}</button>${state.zudoEnabled&&canAccess('zudo','view')?'<button class="shp-iconbtn" id="zudoTopButton" type="button" title="Open Zudo" aria-label="Open Zudo">'+lucide('sparkles')+'</button>':''}${canAccess('attendance','view')?'<button class="shp-iconbtn" id="attTopButton" type="button" title="Attendance" aria-label="Attendance">'+lucide('clock')+'</button>':''}${(state.vaultiumEnabled||state.vaultiumEver)?'<button class="shp-iconbtn" id="vaultTopButton" type="button" title="Vaultium" aria-label="Vaultium">'+lucide('file')+'</button>':''}<button class="shp-iconbtn" id="shpTheme" type="button" title="Toggle theme" aria-label="Toggle theme">${(document.body.dataset.shpTheme==='dark')?SHP_SUN:SHP_MOON}</button></div></header>
    <section class="shp-page" id="page"></section>
  </main></div>`;
  $('#out').onclick=logout;
  initNotifications('shop');
  $('#shpTheme').onclick=()=>{const t=document.body.dataset.shpTheme==='dark'?'':'dark';if(t)document.body.dataset.shpTheme=t;else delete document.body.dataset.shpTheme;localStorage.setItem('ems.shpTheme',t);$('#shpTheme').innerHTML=t==='dark'?SHP_SUN:SHP_MOON};
  api('public/branding').then(b=>{document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{document.querySelectorAll('[data-brand-name]').forEach(x=>{if(!x.textContent)x.textContent='EMS V1'});document.querySelectorAll('[data-powered-by]').forEach(x=>{if(!x.textContent)x.textContent='DoxTox'})});
  if($('#zudoTopButton'))$('#zudoTopButton').onclick=()=>page('zudo');
  if($('#attTopButton'))$('#attTopButton').onclick=()=>page('attendance');
  if($('#vaultTopButton'))$('#vaultTopButton').onclick=()=>page('vaultium');
  if($('#returnAdmin'))$('#returnAdmin').onclick=()=>{let r=JSON.parse(localStorage.getItem('ems.admin.return')||'null');if(r){save(r);localStorage.removeItem('ems.admin.return');home()}};
  document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>page(x.dataset.page));
  page((visible[0]?.[0]||'dashboard').toLowerCase().replaceAll(' ','-'));
  if(state.readOnly||state.licenseExpired)readOnlyNotice()
}

/* ═══════════ SHOP · Entities (suppliers / customers / expense) + inventory ═══════════ */
const SHP_KICKER={suppliers:'Operations',customers:'Operations',inventory:'Operations',purchases:'Operations',sales:'Operations',expense:'Operations','due-recover':'Operations','staff-manager':'Staff',attendance:'Staff',salary:'Staff',report:'Insights',settings:'Preferences',connectx:'Tools',zudo:'Tools',vaultium:'Tools',dashboard:'Overview'};

async function dashboard(){let [d,snapshots,trend]=await Promise.all([api('dashboard'),api('dashboard/activity-snapshot'),api('dashboard/sales-trend').catch(e=>{console.error('sales-trend failed:',e);return null})]),values=[['Sales',d.sales.today,'emerald'],['Purchase',d.purchase.today,'amber'],['Expense',d.expense.today,'rose'],['Sales due',d.sales.dueToday,'sky']],max=Math.max(1,...values.map(x=>Number(x[1])));
$('#page').innerHTML=shpHead('Overview','Dashboard','Today’s money movement across sales, purchases, expenses and dues.')
+`<div class="shp-grid shp-kpis shp-anim-kpis">${shpKpi('receipt','emerald','Sales',money(d.sales.lifetime),'Today: '+money(d.sales.today))}${shpKpi('cart','amber','Purchase',money(d.purchase.lifetime),'Today: '+money(d.purchase.today))}${shpKpi('wallet','rose','Expense',money(d.expense.lifetime),'Today: '+money(d.expense.today))}${shpKpi('coins','sky','Sales due',money(d.sales.dueLifetime),'Today: '+money(d.sales.dueToday))}</div>
<div class="shp-grid shp-anim-panels shp-dash2">
  <section class="shp-panel">
    <div class="shp-panel-head"><div><h3>Today’s financial chart</h3></div><span class="shp-badge shp-t-emerald shp-live"><i></i>Live</span></div>
    <div class="shp-ftotal"><span>Total transaction</span><b>${money(values.slice(0,3).reduce((n,x)=>n+Number(x[1]),0))}</b></div>
    <div class="shp-fchart">${values.map(([name,value,tone])=>`<div class="shp-fbar shp-t-${tone}"><div class="shp-fbar-track"><i style="height:${Math.max(4,Number(value)/max*100)}%"></i></div><b>${money(value)}</b><small>${name}</small></div>`).join('')}</div>
  </section>
  <section class="shp-panel">
    <div class="shp-panel-head"><div><h3>Recent activity</h3></div><span class="shp-kicker">Last 24 hours</span></div>
    ${snapshots.length?`<div class="shp-tw shp-anim-rows"><table><thead><tr><th>Label</th><th>ID</th><th>Total</th><th>Paid</th><th>Due</th><th>By</th><th>Time</th></tr></thead><tbody>${snapshots.map(x=>`<tr><td><span class="shp-tag shp-t-${shpTone(x.label.toLowerCase())}">${esc(x.label)}</span></td><td>${esc(x.id)}</td><td>${x.total==='—'?'—':money(x.total)}</td><td>${x.paid==='—'?'—':money(x.paid)}</td><td>${x.due==='—'?'—':money(x.due)}</td><td>${esc(x.submittedBy)}</td><td>${ago(x.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="shp-desc">No sales, purchases, expenses, or inventory activity during the last 24 hours.</p>'}
  </section>
</div>
${trend?salesTrendChart(trend):''}`;
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.querySelectorAll('#page .shp-kpi-val').forEach((el,i)=>{const target=Number(String(el.textContent).replace(/[^0-9.]/g,''))||0;if(!target)return;const t0=performance.now()+90*i,dur=620,tick=now=>{if(!el.isConnected)return;const k=Math.min(1,Math.max(0,(now-t0)/dur));el.textContent=money(target*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)})}
}
 
async function profile(){let p=await api('admin/profile');$('#page').innerHTML=admHead('profile','Your administrator account credentials and contact details.')+`
  <section class="adm-panel adm-narrow">
    <div class="adm-panel-head"><div><h3>Administrator details</h3><p class="adm-desc">Used for sign-in, license records and EMS support conversations.</p></div></div>
    <form class="adm-form" id="profileForm">
      <div class="adm-grid2">
        <label>Full name<input name="name" required value="${esc(p.name)}"></label>
        <label>Phone<input name="phone" required value="${esc(p.phone)}"></label>
      </div>
      <label>Address<textarea name="address" rows="3">${esc(p.address||'')}</textarea></label>
      <label>Email<input name="email" type="email" required value="${esc(p.email)}"></label>
      <label>New password <span class="adm-sub">Leave blank to keep the existing password.</span><input name="password" type="password" minlength="10"></label>
      <div class="adm-form-actions"><button class="adm-btn adm-btn-primary">Save profile</button></div>
    </form>
  </section>`;
  $('#profileForm').onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.target));if(!b.password)delete b.password;try{let x=await api('admin/profile',{method:'PATCH',body:JSON.stringify(b)});state.user.name=x.name;save(state);toast('Administrator profile updated.')}catch(x){toast(x.message)}}}

function storeCards(rows,usageMap,zudoMap,healthMap,ent){
  if(!rows.length)return admEmpty('No stores yet. Create your first store to begin.');
  return rows.map(r=>{
    const cx=usageMap[r.id],z=zudoMap[r.id],bh=healthMap[r.id];
    const usage=(on,used,limit)=>on?`<div class="adm-feat on"><span>Used</span>${admMeter(used,limit)}<b>${used}/${limit}</b></div>`:'';
    return `<article class="adm-storecard">
      <div class="adm-store-top">
        <div class="adm-store-title"><h3>${esc(r.name)}</h3><code>${esc(r.shop_code)}</code></div>
        ${admBadge(esc(r.status),r.status==='active'?'emerald':r.status==='read_only'?'amber':'zinc')}
      </div>
      ${r.address||r.phone||r.email||r.website?`<div class="adm-store-meta">${r.address?`<span>${esc(r.address)}</span>`:''}${r.phone?`<span>${esc(r.phone)}${r.phone2?' · '+esc(r.phone2):''}</span>`:''}${r.email?`<span>${esc(r.email)}</span>`:''}${r.website?`<span>${esc(r.website)}</span>`:''}</div>`:''}
      <div class="adm-feats">
        <div class="adm-feat ${cx?.enabled?'on':'off'}"><span>ConnectX</span>${cx?.enabled?admMeter(cx.usedToday,cx.dailyLimit)+`<b>${cx.usedToday}/${cx.dailyLimit}</b>`:'<span class="adm-feat-state">—</span>'}</div>
        <div class="adm-feat ${z?.enabled?'on':'off'}"><span>Zudo AI</span>${z?.enabled?admMeter(z.usedToday,z.dailyLimit)+`<b>${z.usedToday}/${z.dailyLimit}</b>`:'<span class="adm-feat-state">—</span>'}</div>
        <div class="adm-feat ${bh?.enabled?'on':'off'}"><span>AI Health</span>${bh?.enabled?admMeter(bh.usedToday,bh.dailyLimit)+`<b>${bh.usedToday}/${bh.dailyLimit}</b>`:'<span class="adm-feat-state">—</span>'}</div>
        <div class="adm-feat ${ent.truebill_enabled?'on adm-t-emerald':'off'}"><span>TrueBill</span>${ent.truebill_enabled?'<span class="adm-feat-tag">Included</span>':'<span class="adm-feat-state">—</span>'}</div>
        <div class="adm-feat ${Number(ent.vaultium_gb||0)>0?'on adm-t-sky':'off'}"><span>Vaultium</span>${Number(ent.vaultium_gb||0)>0?`<span class="adm-feat-tag">${ent.vaultium_gb} GB</span>`:'<span class="adm-feat-state">—</span>'}</div>
      </div>
      <div class="adm-store-actions">
        <button class="adm-btn adm-btn-soft adm-btn-sm" data-edit-store="${r.id}">Edit</button>
        <button class="adm-btn adm-btn-primary adm-btn-sm" data-goto-store2="${r.id}">Go to shop</button>
      </div>
    </article>`;
  }).join('');
}
async function stores(){let [rows,usage,zudoUsage,healthUsage,ent]=await Promise.all([api('admin/stores'),api('admin/connectx-usage'),api('admin/zudo-usage').catch(()=>[]),api('admin/business-health-usage').catch(()=>[]),api('admin/entitlement').catch(()=>({truebill_enabled:false,vaultium_gb:0}))]),usageMap=Object.fromEntries(usage.map(x=>[x.id,x])),zudoMap=Object.fromEntries(zudoUsage.map(x=>[x.id,x])),healthMap=Object.fromEntries(healthUsage.map(x=>[x.id,x]));
  const active=rows.filter(r=>r.status==='active').length,restricted=rows.length-active,lim=Number(ent.shopLimit||0);
  $('#page').innerHTML=admHead('stores','Every shop under your administrator account, with live add-on usage and license capacity.','<button id="manageCapacity" class="adm-btn adm-btn-soft">Manage shop capacity</button><button id="add" class="adm-btn adm-btn-primary">+ Create store</button>')+`
  <div class="adm-grid adm-kpis">
    ${admKpi('store','violet','Stores',rows.length,active+' active')}
    ${admKpi('shield','emerald','Active shops',active,lim?('of '+lim+' allowed by license'):'capacity set by plan')}
    ${admKpi('clock','amber','Restricted',restricted,'read-only or inactive')}
    ${admKpi('mail','sky','ConnectX shops',usage.filter(x=>x.enabled).length,'email add-on in use')}
  </div>
  <div><input id="storeSearch" class="adm-search" placeholder="Search stores by name, shop ID, phone or email"></div>
  <div class="adm-storegrid" id="storeGrid">${storeCards(rows,usageMap,zudoMap,healthMap,ent)}</div>`;
  let fields=[['name','Store name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email'],['website','Website']];
  $('#add').onclick=()=>storeModal(null,fields);
  $('#storeSearch').oninput=e=>{const q=e.target.value.toLowerCase();$('#storeGrid').innerHTML=storeCards(rows.filter(r=>!q||(r.name+' '+r.shop_code+' '+(r.phone||'')+' '+(r.email||'')).toLowerCase().includes(q)),usageMap,zudoMap,healthMap,ent);bindStores()};
  const bindStores=()=>{document.querySelectorAll('[data-edit-store]').forEach(x=>x.onclick=()=>storeModal(rows.find(r=>r.id===x.dataset.editStore),fields));document.querySelectorAll('[data-goto-store2]').forEach(x=>x.onclick=async()=>{try{localStorage.setItem('ems.admin.return',JSON.stringify(state));let s=await api('admin/store/'+x.dataset.gotoStore2+'/goto',{method:'POST',body:'{}'});save(s);home()}catch(e){toast(e.message)}})};
  bindStores();$('#manageCapacity').onclick=()=>shopCapacityModal(rows,stores);}

function shopCapacityModal(rows,refresh){let e=document.createElement('div');e.className='adm-modal';e.innerHTML=`<form class="adm-modalbox adm-modal-wide"><div class="adm-modalhead"><h2>Manage shop capacity</h2><button type="button" class="adm-x" aria-label="Close">×</button></div><div class="adm-modalbody"><p class="adm-desc">Choose which shops operate as Active, Read-Only, Inactive, or Delete. Active shops must not exceed your current license limit.</p><div class="adm-tw"><table><thead><tr><th>Shop</th><th>Shop ID</th><th>Current status</th><th>New status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td><code>${esc(r.shop_code)}</code></td><td>${esc(r.status)}</td><td><select data-capacity-store="${r.id}"><option value="active" ${r.status==='active'?'selected':''}>Active</option><option value="read_only" ${r.status==='read_only'?'selected':''}>Read-Only</option><option value="inactive" ${r.status==='inactive'?'selected':''}>Inactive</option><option value="delete">Delete permanently</option></select></td></tr>`).join('')}</tbody></table></div><div class="adm-note" id="capacityNote"></div><div class="adm-form-actions"><button class="adm-btn adm-btn-primary">Save shop capacity</button></div></div></form>`;document.body.append(e);e.querySelector('.adm-x').onclick=()=>e.remove();let update=()=>{let n=[...e.querySelectorAll('[data-capacity-store]')].filter(x=>x.value==='active').length;$('#capacityNote').textContent=`Selected active shops: ${n}. Your license will validate the allowed capacity when saved.`};e.querySelectorAll('[data-capacity-store]').forEach(x=>x.onchange=update);update();e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let choices=[...e.querySelectorAll('[data-capacity-store]')].map(x=>({id:x.dataset.capacityStore,status:x.value}));if(choices.some(x=>x.status==='delete')&&!confirm('Deleting a shop permanently removes its business data. Continue?'))return;try{await api('admin/store-capacity',{method:'POST',body:JSON.stringify({choices})});e.remove();toast('Shop capacity updated.');refresh()}catch(err){toast(err.message)}}}
function storeModal(record,fields){let add=!record,e=admModal(add?'Create store':'Edit store',`<form class="adm-form">${fields.map(([n,l,r])=>`<label>${l}<input name="${n}" value="${esc(record?.[n]||'')}" ${r?'required':''}></label>`).join('')}<label>Low-stock alert value<input name="low_stock_threshold" type="number" min="0" step="0.001" value="${esc(record?.low_stock_threshold??5)}" required></label><div class="adm-form-actions"><button class="adm-btn adm-btn-primary">${add?'Create store':'Save changes'}</button></div></form>`);e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.low_stock_threshold=Number(b.low_stock_threshold);await api(add?'admin/stores':'admin/store/'+record.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});e.remove();toast(add?'Store created.':'Store updated.');stores()}catch(x){toast(x.message)}}}
async function devices(){let rows=await api('admin/devices');const storesN=new Set(rows.map(x=>x.stores?.name).filter(Boolean)).size,staffN=new Set(rows.map(x=>x.staff?.user_id).filter(Boolean)).size,times=rows.map(x=>new Date(x.last_seen_at)).filter(d=>!isNaN(d)),last=times.sort((a,b)=>b-a)[0];
$('#page').innerHTML=admHead('devices','This list records the most recent sign-in activity for each store and device fingerprint.')+`
  <div class="adm-grid adm-kpis">
    ${admKpi('devices','sky','Devices',rows.length,'tracked fingerprints')}
    ${admKpi('store','violet','Stores',storesN,'with sign-in activity')}
    ${admKpi('user','emerald','Staff accounts',staffN,'unique user IDs')}
    ${admKpi('clock','amber','Latest sign-in',last?last.toLocaleDateString():'—',last?last.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'no activity yet')}
  </div>
  <section class="adm-panel">
    <div class="adm-panel-head"><div><h3>Sign-in activity</h3><p class="adm-desc">Store, staff account, device and last seen time.</p></div></div>
    ${rows.length?`<div class="adm-tw"><table><thead><tr><th>Store</th><th>Staff</th><th>User ID</th><th>Device</th><th>Last seen</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.stores?.name||'—')}</td><td>${esc(x.staff?.full_name||'Unknown')}</td><td><code>${esc(x.staff?.user_id||'—')}</code></td><td class="adm-wrap">${esc(x.user_agent)}</td><td class="adm-num">${esc(new Date(x.last_seen_at).toLocaleString())}</td></tr>`).join('')}</tbody></table></div>`:admEmpty('No device activity recorded yet.')}
  </section>`}

function admPlanCard(p){const free=Number(p.price)===0;const feats=[...(p.benefits||'Multi-shop admin access\nStaff permissions\nInventory & invoices\nActivity logging').split(/\n|,/).map(x=>x.trim()).filter(Boolean).map(x=>[x,true]),[`Up to ${p.max_stores} shop${p.max_stores>1?'s':''}`,true],[p.connectx_enabled?`ConnectX: ${p.connectx_daily_limit} emails/day per shop`:'ConnectX not included',p.connectx_enabled],[p.zudo_enabled?`Zudo AI: ${p.zudo_daily_limit} requests/day per shop`:'Zudo AI not included',p.zudo_enabled],[p.business_health_enabled?`Business AI Health: ${p.business_health_daily_limit} reports/day per shop`:'Business AI Health not included',p.business_health_enabled],[p.truebill_enabled?'TrueBill: invoice QR verification':'TrueBill not included',p.truebill_enabled],[Number(p.vaultium_gb||0)>0?`Vaultium: ${p.vaultium_gb} GB cloud storage`:'Vaultium not included',Number(p.vaultium_gb||0)>0]];
  return `<article class="adm-plan"><div class="adm-plan-price"><span class="adm-kicker">${esc(p.title)}</span><strong>${free?'Free':'৳ '+money(p.price)}</strong><small> / ${p.duration_months} mo</small></div><p class="adm-plan-info">${free?'This plan is free — activate it instantly and start running your shop on EMS.':`This plan covers one license for ${p.duration_months} months, activated after bKash / Nagad payment verification.`}</p><ul class="adm-plan-feats">${feats.map(f=>`<li${f[1]?'':' class="off"'}><span>${esc(f[0])}</span></li>`).join('')}</ul><button class="adm-btn ${free?'adm-btn-primary':'adm-btn-soft'}" data-buy-plan="${p.id}">Choose ${esc(p.title)}</button></article>`}
async function licenses(){let [rows,plans]=await Promise.all([api('admin/licenses'),api('license-plans')]);const ent=state.entitlement||{},latest=rows[0];const licTone=st=>st==='active'?'emerald':st==='pending'?'amber':st==='rejected'?'rose':'zinc';const stat=x=>x.transaction_type==='downgrade'&&x.starts_at&&new Date(x.starts_at)>new Date()?'Scheduled downgrade':x.status;
$('#page').innerHTML=admHead('licenses','Choose a license plan to activate or extend your shops. Payments are verified by EMS before activation.')+`
  <div class="adm-grid adm-kpis">
    ${admKpi('shield',ent.active?'emerald':'rose','License',ent.active?'Active':'Inactive',ent.hasActivatedLicense?(ent.active?'subscription in good standing':'expired — renew to restore access'):'no license activated yet')}
    ${admKpi('calendar','sky','Expires',ent.expiresAt?new Date(ent.expiresAt).toLocaleDateString():'—',ent.expiresAt?'current period end':'activate a plan to begin')}
    ${admKpi('store','violet','Shop allowance',ent.shopLimit||'—','shops allowed by your plan')}
    ${admKpi('receipt','amber','Purchases',rows.length,latest?('latest: '+esc(stat(latest))):'no purchases yet')}
  </div>
  <div class="adm-plans">${plans.length?plans.map(p=>admPlanCard(p)).join(''):admEmpty('No license plan has been published by EMS yet.')}</div>
  <section class="adm-panel">
    <div class="adm-panel-head"><div><h3>My license purchases</h3><p class="adm-desc">Every payment claim you have submitted, with verification status.</p></div></div>
    ${rows.length?`<div class="adm-tw"><table><thead><tr><th>Plan</th><th>Shops</th><th>Duration</th><th>Amount</th><th>Payment</th><th>Transaction ID</th><th>Status</th><th>Expiry</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.license_plans?.title||'Legacy license')}</td><td class="adm-num">${x.max_stores}</td><td>${x.duration_months} months</td><td class="adm-num">${money(x.amount)}</td><td>${esc(x.payment_method)}</td><td><code>${esc(x.transaction_id)}</code></td><td>${admBadge(esc(stat(x)),licTone(stat(x)))}</td><td class="adm-num">${x.starts_at&&new Date(x.starts_at)>new Date()?`Starts: ${esc(x.starts_at)} · Ends: ${esc(x.expires_at)}`:esc(x.expires_at||'—')}</td></tr>`).join('')}</tbody></table></div>`:admEmpty('No license purchases yet.')}
  </section>`;
  document.querySelectorAll('[data-buy-plan]').forEach(x=>x.onclick=()=>buyPlan(plans.find(p=>p.id===x.dataset.buyPlan)))}
function buyPlan(plan){let free=Number(plan.price)===0,e=admModal(`${free?'Activate':'Purchase'} ${esc(plan.title)}`,`<form class="adm-form"><p class="adm-desc">${plan.duration_months} months · maximum ${plan.max_stores} shop${plan.max_stores>1?'s':''} · ${free?'No payment is required.':money(plan.price)+' BDT'}</p>${plan.benefits?`<p class="adm-desc">${esc(plan.benefits)}</p>`:''}${free?'':`<div class="adm-payinfo"><span class="adm-kicker">Payment instructions</span><p>${esc(plan.payment_details||'Follow the payment instructions supplied by EMS.')}</p></div><div class="adm-grid2"><label>Payment method<select name="paymentMethod" required><option value="bkash">bKash</option><option value="nagad">Nagad</option></select></label><label>Payment number<input name="paymentNumber" required></label></div><label>Transaction ID<input name="transactionId" required></label>`}<div class="adm-form-actions"><button class="adm-btn adm-btn-primary">${free?'Activate license':'Submit payment for verification'}</button></div></form>`);
  e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.planId=plan.id;await api('admin/licenses',{method:'POST',body:JSON.stringify(b)});e.remove();toast(free?'License activated.':'Payment claim submitted for EMS verification.');licenses()}catch(x){toast(x.message)}}}
const shortId=id=>String(id||'').replaceAll('-','').slice(0,6).toUpperCase();
async function entity(pageName){let map={suppliers:['supplier','Suppliers',[['name','Name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email']]],customers:['customer','Customers',[['name','Name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email']]],expense:['expense','Expenses',[['expense_date','Date',1],['details','Details',1],['total','Total',1],['paid','Paid',1],['note','Note']]]},config=map[pageName];if(pageName==='staff-manager')return staffManager();if(pageName==='inventory')return inventoryManager();let [kind,label,fields]=config,cols=fields.map(x=>x[0]),rows=await api(kind);if(kind==='expense')await attachmentsIndex(true).catch(()=>null);function render(data=rows){$('#data').innerHTML=crudTable(data,cols,kind)}$('#page').innerHTML=shpHead(SHP_KICKER[pageName]||'Shop',label,kind==='expense'?'Record shop expenses with paid and due amounts.':'Keep contact details organized and searchable.')+`<div class="shp-toolbar">${canAccess(kind,'add')?`<button class="shp-btn shp-btn-primary" id="add">+ Add new</button>`:''}<input id="search" class="shp-search" placeholder="Search records"></div><div class="shp-pagegap" id="data"></div>`;render();$('#search').oninput=e=>render(rows.filter(r=>JSON.stringify(r).toLowerCase().includes(e.target.value.toLowerCase())));if($('#add'))$('#add').onclick=()=>entityModal(kind,label,fields,null,()=>entity(pageName));bindCrud(rows,kind,label,fields,()=>entity(pageName))}
function crudTable(rows,cols,kind){if(!rows.length)return shpEmpty('No records found.');let codeKey={supplier:'supplier_code',customer:'customer_code',expense:'expense_code'}[kind],hasCode=kind!=='inventory';let extraCol=kind==='expense'?'<th>Due</th>':'';let extraVal=r=>kind==='expense'?`<td>${money(r.due)}</td>`:'';return `<div class="shp-tw"><table><thead><tr>${hasCode?'<th>Short ID</th>':''}${cols.map(c=>`<th>${c.replaceAll('_',' ')}</th>`).join('')}${extraCol}<th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr>${hasCode?`<td><code>${esc(r[codeKey]||shortId(r.id))}</code></td>`:''}${cols.map(c=>`<td>${esc(r[c])}</td>`).join('')}${extraVal(r)}<td><span style="display:inline-flex;gap:6px">${kind==='expense'?folderBtn({t:'exp',id:r.id,code:r.expense_code}):''}${kind==='customer'?`<button class="shp-btn shp-btn-soft shp-btn-sm" data-cx-invoices="${r.id}">Invoices</button>`:''}<button class="shp-btn shp-btn-soft shp-btn-sm" data-edit-${kind}="${r.id}" ${canAccess(kind,'edit')?'':'disabled'}>Edit</button><button class="shp-btn shp-btn-danger shp-btn-sm" data-delete-${kind}="${r.id}" ${canAccess(kind,'delete')?'':'disabled'}>Delete</button></span></td></tr>`).join('')}</tbody></table></div>`}
function customerInvoices(customer){
  const e=shpModal(`Invoices — ${esc(customer.name)}`,`<div id="ciBody">${SKEL.table(3,6)}</div>`);
  const renderRows=rows=>{
    e.querySelector('#ciBody').innerHTML=rows.length?`<div class="shp-tw"><table><thead><tr><th>Invoice</th><th>Date</th><th>Subtotal</th><th>Paid</th><th>Due</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.invoice_number)}</td><td>${esc(r.invoice_date)}</td><td>${money(r.subtotal)}</td><td>${money(r.paid_amount)}</td><td>${money(r.total_due)}</td><td><button class="shp-btn shp-btn-soft shp-btn-sm" data-ci-view="${r.id}">View</button></td></tr>`).join('')}</tbody></table></div>`:shpEmpty('No sales invoices for this customer.');
    e.querySelectorAll('[data-ci-view]').forEach(b=>b.onclick=()=>{const inv=rows.find(x=>x.id===b.dataset.ciView);e.remove();invoiceView(inv,'Sales')});
  };
  api('invoices/by-party?kind=sale&party_id='+encodeURIComponent(customer.id))
    .catch(()=>api('invoices?kind=sale').then(rows=>rows.filter(r=>r.party_id===customer.id)))
    .then(renderRows)
    .catch(err=>{e.querySelector('#ciBody').innerHTML='<p class="shp-desc">'+esc(err.message)+'</p>'});
}
function bindCrud(rows,kind,label,fields,refresh){if(kind==='customer')document.querySelectorAll('[data-cx-invoices]').forEach(x=>x.onclick=()=>customerInvoices(rows.find(r=>r.id===x.dataset.cxInvoices)));document.querySelectorAll(`[data-edit-${kind}]`).forEach(x=>x.onclick=()=>entityModal(kind,label,fields,rows.find(r=>r.id===x.dataset['edit'+kind[0].toUpperCase()+kind.slice(1)]),refresh));document.querySelectorAll(`[data-delete-${kind}]`).forEach(x=>x.onclick=async()=>{let id=x.dataset['delete'+kind[0].toUpperCase()+kind.slice(1)];if(!confirm('Delete this record?'))return;try{await api(kind+'/'+id,{method:'DELETE'});toast('Record deleted.');refresh()}catch(e){toast(e.message)}})}
function entityModal(kind,label,fields,record,refresh){let expense=kind==='expense';let fieldHtml=fields.map(([n,l,req])=>{let type=n==='expense_date'?'date':(n==='total'||n==='paid'?'number':'text'),v=record?.[n]??(n==='expense_date'?new Date().toISOString().slice(0,10):(n==='paid'?0:''));return `<label>${l}<input name="${n}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} value="${esc(v)}" ${req?'required':''}></label>`}).join('');let files=[],vault=null;if(expense){api('vaultium/availability').then(v=>{vault=v}).catch(()=>{})}let e=shpModal(`${record?'Edit':'Add'} ${label.slice(0,-1)}`,`<form class="shp-form"><div class="shp-grid2">${fieldHtml}</div>${expense?'<label>Due <input id="expenseDue" readonly></label>':''}${expense?`<div class="shp-attach"><h3 class="shp-kicker">File attachments · Vaultium</h3><label class="shp-attachpick"><input type="file" id="expFileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">Attach files — max 5, 5 MB each</label><div id="expSelected" class="shp-attachchips"></div></div>`:''}<div class="shp-form-actions"><button class="shp-btn shp-btn-primary">${record?'Save changes':'Save'}</button></div></form>`);if(expense){let calc=()=>$('#expenseDue').value=money(Math.max(0,Number(e.querySelector('[name=total]').value||0)-Number(e.querySelector('[name=paid]').value||0)));e.querySelector('[name=total]').oninput=calc;e.querySelector('[name=paid]').oninput=calc;calc();const renderExpFiles=()=>{const box=$('#expSelected');if(!box)return;box.innerHTML=files.length?files.map((f,i)=>`<span class="shp-attachchip"><span>${esc(f.name)} <small>${(f.size/MB2).toFixed(2)} MB</small></span><button type="button" data-exp-rm="${i}">×</button></span>`).join(''):'';box.querySelectorAll('[data-exp-rm]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.expRm,1);renderExpFiles()})};const fi=$('#expFileInput');if(fi)fi.onchange=ev=>{for(const f of [...ev.target.files]){if(files.length>=5){toast('Maximum 5 files.');break}if(f.size>5*MB2){toast(f.name+' exceeds 5 MB.');continue}files.push(f)}ev.target.value='';renderExpFiles()}}e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let b=Object.fromEntries(new FormData(ev.target));if(expense){b.total=Number(b.total);b.paid=Number(b.paid)}try{let saved=await api(record?kind+'/'+record.id:kind,{method:record?'PATCH':'POST',body:JSON.stringify(b)});if(expense&&files.length&&vault&&vault.enabled){for(const file of files){const fd=new FormData();fd.append('files',file);fd.append('expense_id',saved.id);fd.append('expense_code',saved.expense_code||('EXP-'+saved.id.slice(0,8).toUpperCase()));await apiUpload('vaultium/upload',fd)}attCache=null}e.remove();toast('Saved.');refresh()}catch(x){toast(x.message)}}}
async function inventoryManager(){let [rows,cfg]=await Promise.all([api('inventory'),api('shop/settings').catch(()=>({low_stock_threshold:5}))]),lowThreshold=Number(cfg.low_stock_threshold||5),filter='all',lowOnly=false;const render=()=>{let data=rows.filter(r=>{if(filter==='active'&&!r.active)return false;if(filter==='inactive'&&r.active)return false;if(lowOnly&&!(Number(r.total_stock)>0&&Number(r.total_stock)<=lowThreshold))return false;return true});const q=($('#search')?.value||'').toLowerCase();if(q)data=data.filter(r=>JSON.stringify(r).toLowerCase().includes(q));$('#data').innerHTML=invTable(data)};const invTable=list=>{if(!list.length)return shpEmpty('No items found.');return `<div class="shp-tw"><table><thead><tr><th>Item code</th><th>Description</th><th>Unit</th><th>Sale price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(r=>`<tr><td><code>${esc(r.item_code)}</code></td><td class="shp-wrap">${esc(r.description)}</td><td>${esc(r.unit)}</td><td>${money(r.sale_price)}</td><td>${esc(r.total_stock)}${Number(r.total_stock)>0&&Number(r.total_stock)<=lowThreshold?' <span class="shp-low">LOW</span>':''}</td><td>${shpBadge(r.active?'Active':'Inactive',r.active?'emerald':'zinc')}</td><td><span style="display:inline-flex;gap:6px"><button class="shp-btn shp-btn-soft shp-btn-sm" data-edit-inventory="${r.id}">Edit</button><button class="shp-btn shp-btn-danger shp-btn-sm" data-delete-inventory="${r.id}">Delete</button></span></td></tr>`).join('')}</tbody></table></div>`};$('#page').innerHTML=shpHead('Operations','Inventory','Live stock that updates the moment purchases or sales are posted.')+`<div class="shp-toolbar">${canAccess('inventory','add')?`<button class="shp-btn shp-btn-primary" id="addInventory">+ Add new item</button>`:''}<div class="shp-chips"><button class="shp-chip ${filter==='all'?'on':''}" data-f="all">All</button><button class="shp-chip ${filter==='active'?'on':''}" data-f="active">Active</button><button class="shp-chip ${filter==='inactive'?'on':''}" data-f="inactive">Inactive</button><button class="shp-chip ${lowOnly?'on':''}" id="lowOnlyBtn">Low stock</button></div><input id="search" class="shp-search" placeholder="Search inventory"></div><div class="shp-pagegap" id="data"></div>`;render();document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));render()});$('#lowOnlyBtn').onclick=()=>{lowOnly=!lowOnly;$('#lowOnlyBtn').classList.toggle('on',lowOnly);render()};$('#search').oninput=render;if($('#addInventory'))$('#addInventory').onclick=()=>inventoryModal(null,inventoryManager);document.querySelectorAll('[data-edit-inventory]').forEach(x=>x.onclick=()=>inventoryModal(rows.find(r=>r.id===x.dataset.editInventory),inventoryManager));document.querySelectorAll('[data-delete-inventory]').forEach(x=>x.onclick=async()=>{if(!confirm('Delete this inventory item?'))return;try{await api('inventory/'+x.dataset.deleteInventory,{method:'DELETE'});toast('Inventory item deleted.');inventoryManager()}catch(e){toast(e.message)}})}


function inventoryModal(record=null,refresh=inventoryManager){let units=['pcs','box','carton','pack','pair','set','kg','gram','liter','ml','meter','feet','dozen','bag','roll','bottle','can'];let e=shpModal(`${record?'Edit':'Add'} inventory item`,`<form class="shp-form"><label>Item code <span class="shp-desc">Leave blank to auto-generate.</span><input name="item_code" value="${esc(record?.item_code||'')}"></label><label>Description<input name="description" required value="${esc(record?.description||'')}"></label><div class="shp-grid2"><label>Unit<select name="unit" required>${units.map(x=>`<option value="${x}" ${record?.unit===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Sale price<input name="sale_price" type="number" min="0" step="0.01" required value="${esc(record?.sale_price??'')}"></label></div><label>Active status<select name="active"><option value="true" ${record?.active!==false?'selected':''}>Yes — available for sale</option><option value="false" ${record?.active===false?'selected':''}>No — inactive</option></select></label><div class="shp-form-actions"><button class="shp-btn shp-btn-primary">Save item</button></div></form>`);e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let b=Object.fromEntries(new FormData(ev.target));b.active=b.active==='true';try{await api(record?'inventory/'+record.id:'inventory',{method:record?'PATCH':'POST',body:JSON.stringify(b)});e.remove();toast('Inventory item saved.');refresh()}catch(x){toast(x.message)}}}
const permissionLabels={dashboard:'Dashboard',supplier:'Supplier',customer:'Customer',inventory:'Inventory',purchase:'Purchase',sales:'Sales',expense:'Expense',due_recover:'Due Recover',staff:'Staff Manager',report:'Report',settings:'Settings',connectx:'ConnectX',zudo:'Zudo',attendance:'Attendance',salary:'Salary',vaultium:'Vaultium'};const permissionActions=['view','add','edit','delete'];
function permissionEditor(existing={}){return `<section class="shp-perm"><div class="shp-perm-head"><div><h3>Module permissions</h3><p>Select exactly what this staff member may do. Permissions are checked by the server, not only hidden in the interface.</p></div><button type="button" class="shp-btn shp-btn-ghost shp-btn-sm" id="clearPermissions">Clear all</button></div>${Object.entries(permissionLabels).map(([key,label])=>`<div class="shp-perm-row"><strong>${label}</strong><button type="button" class="shp-chip toggleall" data-section="${key}">Toggle all</button><div class="shp-perm-acts">${(key==='zudo'?['view','send','delete']:permissionActions).map(action=>`<label class="shp-perm-pill"><input type="checkbox" data-permission="${key}" value="${action}" ${existing[key]?.includes(action)?'checked':''}><span>${action}</span></label>`).join('')}</div></div>`).join('')}</section>`}
function collectPermissions(root){let out={};root.querySelectorAll('[data-permission]').forEach(x=>{if(x.checked)(out[x.dataset.permission]??=[]).push(x.value)});return out}
async function staffManager(){let rows=await api('staff');$('#page').innerHTML=shpHead('Staff','Staff manager','Individual staff accounts with per-module permissions checked by the server.',(canAccess('attendance','view')?'<button class="shp-btn shp-btn-soft" id="attendanceBtn">Attendance</button> ':'')+(canAccess('salary','view')?'<button class="shp-btn shp-btn-soft" id="salaryBtn">Salary</button>':'')+(canAccess('staff','add')?'<button class="shp-btn shp-btn-primary" id="addStaff">+ Add staff member</button>':''))+`<div class="shp-toolbar"><input id="search" class="shp-search" placeholder="Search staff"></div><div class="shp-pagegap"><div class="shp-tw"><table><thead><tr><th>Name</th><th>Position</th><th>Phone</th><th>User ID</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead><tbody id="staffRows">${staffRows(rows)}</tbody></table></div></div>`;let filter=q=>$('#staffRows').innerHTML=staffRows(rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())));$('#search').oninput=e=>filter(e.target.value);$('#addStaff').onclick=()=>staffModal();$('#attendanceBtn').onclick=()=>page('attendance');if($('#salaryBtn'))$('#salaryBtn').onclick=()=>page('salary');document.querySelectorAll('[data-edit-staff]').forEach(b=>b.onclick=()=>staffModal(rows.find(x=>x.id===b.dataset.editStaff)));document.querySelectorAll('[data-delete-staff]').forEach(b=>b.onclick=async()=>{let person=rows.find(x=>x.id===b.dataset.deleteStaff);if(!confirm(`Remove ${person.full_name}? This cannot be undone.`))return;try{await api('staff/'+person.id,{method:'DELETE'});toast('Staff member removed.');staffManager()}catch(e){toast(e.message)}})}
function staffRows(rows){if(!rows.length)return '<tr><td colspan="7" class="shp-desc">No staff members found.</td></tr>';return rows.map(x=>{let n=Object.values(x.permissions||{}).reduce((a,v)=>a+v.length,0);return `<tr><td>${esc(x.full_name)}</td><td>${esc(x.position)}</td><td>${esc(x.phone)}</td><td><code>${esc(x.user_id)}</code></td><td>${shpBadge(x.active?'Active':'Inactive',x.active?'emerald':'zinc')}</td><td>${n} granted</td><td><span style="display:inline-flex;gap:6px"><button class="shp-btn shp-btn-soft shp-btn-sm" data-edit-staff="${x.id}">Edit</button><button class="shp-btn shp-btn-danger shp-btn-sm" data-delete-staff="${x.id}">Delete</button></span></td></tr>`}).join('')}
function staffModal(person=null){let add=!person;let e=shpModal(add?'Add staff member':'Edit staff member',`<form class="shp-form"><p class="shp-desc">A password is required for a new staff member. For an existing staff member, leave it blank to retain the current password.</p><div class="shp-grid2"><label>Full name<input name="full_name" required value="${esc(person?.full_name||'')}"></label><label>Position<input name="position" value="${esc(person?.position||'')}"></label><label>Phone number<input name="phone" required value="${esc(person?.phone||'')}"></label><label>Email address<input name="email" type="email" value="${esc(person?.email||'')}"></label><label>User ID<input name="user_id" required value="${esc(person?.user_id||'')}"></label><label>Password<input name="password" type="password" ${add?'required minlength="10"':'minlength="10"'} placeholder="${add?'At least 10 characters':'Leave blank to keep current'}"></label><label>Basic salary<input name="basic_salary" type="number" min="0" step="0.01" required value="${esc(person?.basic_salary??0)}"></label><label>Account status<select name="active"><option value="true" ${person?.active!==false?'selected':''}>Active — can sign in</option><option value="false" ${person?.active===false?'selected':''}>Inactive — sign-in blocked</option></select></label></div>${permissionEditor(person?.permissions||{})}<div class="shp-form-actions"><button class="shp-btn shp-btn-primary">${add?'Create active staff account':'Save staff changes'}</button></div></form>`,'shp-modal-xl');e.querySelector('#clearPermissions').onclick=()=>e.querySelectorAll('[data-permission]').forEach(x=>x.checked=false);e.querySelectorAll('.toggleall').forEach(b=>b.onclick=()=>{let boxes=e.querySelectorAll(`[data-permission="${b.dataset.section}"]`),all=[...boxes].every(x=>x.checked);boxes.forEach(x=>x.checked=!all)});e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.active=b.active==='true';b.permissions=collectPermissions(e);if(!b.password)delete b.password;await api(add?'staff':'staff/'+person.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});toast(add?'Staff account created.':'Staff account updated.');e.remove();staffManager()}catch(err){toast(err.message)}}}
async function zudo(){let current=null,conversations=[],usage=null,sending=false;$('#page').innerHTML=shpHead('Tools','Zudo','Friendly answers about your shop data — plus plans, add-ons and this website.')+`<div class="shp-zd"><aside class="shp-zd-side"><div class="brand"><span class="shp-zd-ava shp-t-violet">${lucide('sparkles')}</span><div><b>Zudo</b><small>powered by DoxTox</small></div></div><button class="shp-btn shp-btn-soft" id="zudoNew">+ New chat</button><div id="zudoConversations" class="shp-zd-convs"></div></aside><section class="shp-zd-main"><header class="shp-zd-head"><div><h2>Zudo</h2><span class="sub">Read-only business intelligence</span></div><div class="shp-zd-actions"><span id="zudoUsage" class="shp-zd-usage" aria-live="polite">${sk('150px',10)}</span>${shpBadge('AI Assistant','violet')}</div></header><div class="shp-zd-msgs" id="zudoMessages"><div class="shp-zd-welcome">${ZUDO_LOADER}<b>Hi, I’m Zudo 👋</b><p>Ask me anything about sales, purchases, inventory, customers, expenses and dues, or EMS plans and this website. I reply in the language you write in — English, বাংলা or Banglish (Roman Bangla). I only read data, I never change anything.</p><div class="shp-chips"><button class="shp-chip zudoPrompt">What are my low stock items?</button><button class="shp-chip zudoPrompt">Give me today’s sales summary</button><button class="shp-chip zudoPrompt">Which plan or add-on fits my shop best?</button><button class="shp-chip zudoPrompt">Which customers may have due?</button></div></div></div><form class="shp-zd-composer" id="zudoForm"><textarea id="zudoInput" rows="2" placeholder="Ask Zudo in English, Banglish or বাংলা…"></textarea><button class="shp-btn shp-btn-primary" id="zudoSend" type="submit">Send ✦</button></form></section></div>`;async function loadUsage(){try{usage=await api('zudo/availability');let label=$('#zudoUsage'),send=$('#zudoSend');if(label){label.textContent=usage.enabled?`Daily limit: ${usage.dailyLimit} · Used: ${usage.usedToday} · Remaining: ${usage.remaining}`:'Zudo is not available for this shop';label.classList.toggle('limitReached',!!usage.enabled&&usage.remaining<=0)}if(send)send.disabled=!usage||!usage.enabled||usage.remaining<=0}catch(err){let label=$('#zudoUsage');if(label)label.textContent='Request usage unavailable'}}async function loadConversations(){$('#zudoConversations').innerHTML=SKEL.list(3,false);conversations=await api('zudo/conversations');$('#zudoConversations').innerHTML=conversations.map(x=>`<div class="shp-zd-conv ${x.id===current?'on':''}"><button class="t" data-zudo-conv="${x.id}" title="${esc(x.title)}">${esc(x.title)}</button><button class="m" data-zudo-delete="${x.id}" aria-label="Delete chat" title="Delete chat">${lucide('trash')}</button></div>`).join('')||'<p class="shp-desc">No conversations yet.</p>';document.querySelectorAll('[data-zudo-conv]').forEach(b=>b.onclick=()=>openConversation(b.dataset.zudoConv));document.querySelectorAll('[data-zudo-delete]').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('Delete this Zudo chat and its messages?'))return;try{await api('zudo/conversations/'+b.dataset.zudoDelete,{method:'DELETE'});if(current===b.dataset.zudoDelete){current=null;$('#zudoMessages').innerHTML=`<div class="shp-zd-welcome">${ZUDO_LOADER}<b>New Zudo chat</b><p>Ask a question about your shop data.</p></div>`}loadConversations()}catch(err){toast(err.message)}})}function renderMessages(messages){$('#zudoMessages').innerHTML=messages.map(x=>`<div class="shp-zd-msg ${x.role==='user'?'me':''}"><span>${x.role==='assistant'?'Zudo':'You'}</span><div>${x.role==='assistant'?fmtAI(x.content):esc(x.content).replace(/\n/g,'<br>')}</div></div>`).join('');$('#zudoMessages').scrollTop=$('#zudoMessages').scrollHeight}async function openConversation(id){current=id;$('#zudoMessages').innerHTML=SKEL.msgs(3);renderMessages(await api('zudo/conversations/'+id));loadConversations()}$('#zudoNew').onclick=()=>{current=null;$('#zudoMessages').innerHTML=`<div class="shp-zd-welcome">${ZUDO_LOADER}<b>New Zudo chat</b><p>Ask a question about your shop data.</p></div>`;loadConversations()};document.querySelectorAll('.zudoPrompt').forEach(b=>b.onclick=()=>{$('#zudoInput').value=b.textContent;$('#zudoInput').focus()});$('#zudoForm').onsubmit=async e=>{e.preventDefault();let input=$('#zudoInput'),send=$('#zudoSend'),message=input.value.trim();if(!message||sending)return;if(!usage)await loadUsage();if(!usage?.enabled)return toast('Zudo is not available for this shop.');if(Number(usage.remaining)<=0)return toast('Your daily Zudo request limit has been reached.');sending=true;input.value='';if(send)send.disabled=true;let box=$('#zudoMessages');box.insertAdjacentHTML('beforeend',`<div class="shp-zd-msg me"><span>You</span><div>${esc(message)}</div></div><div class="shp-zd-msg assistant thinking"><span>Zudo</span><div class="shp-zd-thinking">${ZUDO_THINKING_HTML}</div></div>`);startZudoOrbs(box);box.scrollTop=box.scrollHeight;try{let r=await api('zudo/chat',{method:'POST',body:JSON.stringify({conversationId:current,message})});current=r.conversationId;box.querySelector('.thinking')?.remove();box.insertAdjacentHTML('beforeend',`<div class="shp-zd-msg assistant"><span>Zudo</span><div>${fmtAI(r.answer)}</div></div>`);box.scrollTop=box.scrollHeight;loadConversations()}catch(err){box.querySelector('.thinking')?.remove();toast(err.message)}finally{sending=false;await loadUsage();if(usage?.remaining>0)input.focus()}};loadConversations();loadUsage()}
async function connectX(){let tab=state.connectxEnabled?'compose':'inbox',recipientType='customer',selected=null;$('#page').innerHTML=shpHead('Tools','ConnectX','Professional business email to customers, suppliers and staff — with invoice attachments.')+`<div class="shp-cx"><aside class="shp-cx-side shp-t-sky"><div class="brand"><span class="shp-chip-ic">${lucide('mail')}</span><div><b>ConnectX</b><small>Central communication</small></div></div>${state.connectxEnabled?'<button class="tab on" data-cx-tab="compose">Compose<small>New message</small></button>':''}<button class="tab ${state.connectxEnabled?'':'on'}" data-cx-tab="inbox">Inbox<small>Send history</small></button></aside><section id="connectxContent"></section></div>`;async function compose(){let c=$('#connectxContent');c.innerHTML=`<section class="shp-pagegap"><div class="shp-panel"><div class="shp-panel-head"><div><h3>New message</h3><p class="shp-desc">Secure shop email sent through ConnectX.</p></div></div><div class="shp-grid2"><label>Recipient type<select id="cxType"><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="staff">Staff</option></select></label><label>Search and select recipient<input list="cxContacts" id="cxContact" placeholder="Name, email, phone, or ID"><datalist id="cxContacts"></datalist></label></div><div class="shp-cx-contact" id="cxContactInfo">Select a recipient to auto-fill contact details.</div></div><section class="shp-panel"><div class="shp-pagegap" style="gap:10px"><div class="shp-cx-torow"><label>To<input id="cxTo" type="email" placeholder="recipient@email.com"></label><div class="shp-cx-ccrow"><button type="button" class="shp-btn shp-btn-soft shp-btn-sm" id="cxAddCc">+ CC</button><button type="button" class="shp-btn shp-btn-soft shp-btn-sm" id="cxAddBcc">+ BCC</button></div></div><label id="cxCcWrap" hidden>CC<input id="cxCc" placeholder="Separate emails with commas"></label><label id="cxBccWrap" hidden>BCC<input id="cxBcc" placeholder="Separate emails with commas"></label><div class="shp-grid2"><label>Document<select id="cxDoc"><option value="">No attached document</option><option value="sale">Sales invoice</option><option value="purchase">Purchase invoice</option></select></label><label id="cxInvoiceWrap" hidden>Invoice<select id="cxInvoice"></select></label></div><label>Subject<input id="cxSubject" placeholder="Subject"></label><label>Message<textarea id="cxBody" rows="9" placeholder="Write your message here…"></textarea></label><div class="shp-form-actions"><button class="shp-btn shp-btn-primary" id="cxSend" ${canAccess('connectx','add')?'':'disabled'}>Send via ConnectX</button></div></div></section></section>`;let contacts=[];async function contactsLoad(){recipientType=$('#cxType').value;contacts=await api('connectx/contacts?type='+recipientType);$('#cxContacts').innerHTML=contacts.map(x=>`<option value="${esc(x.full_name||x.name)} — ${esc(x.email||'no email')}" data-id="${x.id}">`).join('');selected=null;$('#cxContact').value='';$('#cxTo').value='';$('#cxContactInfo').textContent='Select a recipient to auto-fill contact details.'}async function docs(){let kind=$('#cxDoc').value,wrap=$('#cxInvoiceWrap');wrap.hidden=!kind;if(!kind)return;let rows=await api('connectx/invoices?kind='+kind);$('#cxInvoice').innerHTML='<option value="">Select invoice</option>'+rows.map(x=>`<option value="${x.id}">${esc(x.invoice_number)} · ${money(x.subtotal)}</option>`).join('')}await contactsLoad();$('#cxAddCc').onclick=()=>{$('#cxCcWrap').hidden=false;$('#cxAddCc').style.display='none';$('#cxCc').focus()};$('#cxAddBcc').onclick=()=>{$('#cxBccWrap').hidden=false;$('#cxAddBcc').style.display='none';$('#cxBcc').focus()};$('#cxType').onchange=contactsLoad;$('#cxContact').onchange=e=>{let o=[...$('#cxContacts').options].find(x=>x.value===e.target.value);selected=contacts.find(x=>x.id===o?.dataset.id);if(!selected)return;let name=selected.full_name||selected.name,code=selected.user_id||selected.customer_code||selected.supplier_code||shortId(selected.id);$('#cxTo').value=selected.email||'';$('#cxContactInfo').innerHTML=`<b>${esc(name)}</b><span>ID: ${esc(code)}</span><span>${esc(selected.address||'—')}</span><span>${esc(selected.phone||'—')}</span><span>${esc(selected.email||'No saved email')}</span>`;$('#cxSubject').value=$('#cxDoc').value?`${$('#cxDoc').value==='sale'?'Sales':'Purchase'} Invoice`:'Message from '+(state.store?.name||'your shop')};$('#cxDoc').onchange=docs;$('#cxSend').onclick=async()=>{let b={recipientType,recipientId:selected?.id||null,to:$('#cxTo').value,cc:$('#cxCc').value,bcc:$('#cxBcc').value,subject:$('#cxSubject').value,body:$('#cxBody').value,documentType:$('#cxDoc').value||null,invoiceId:$('#cxInvoice').value||null};let btn=$('#cxSend');btn.disabled=true;btn.textContent='Sending…';try{await api('connectx/send',{method:'POST',body:JSON.stringify(b)});toast('Email sent through ConnectX.');$('#cxBody').value=''}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Send via ConnectX'}}}async function sent(){$('#connectxContent').innerHTML=`<section class="shp-pagegap">${SKEL.toolbar()+SKEL.table(5,6)}</section>`;let rows=await api('connectx/messages');$('#connectxContent').innerHTML=`<section class="shp-pagegap"><div class="shp-toolbar"><input id="cxSearch" class="shp-search" placeholder="Search recipient, subject, or status"></div><div id="cxMessages">${cxTable(rows)}</div></section>`;$('#cxSearch').oninput=e=>{$('#cxMessages').innerHTML=cxTable(rows.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())));bindMessageActions(rows)};bindMessageActions(rows)}function bindMessageActions(rows){document.querySelectorAll('[data-cx-view]').forEach(b=>b.onclick=()=>connectXView(rows.find(x=>x.id===b.dataset.cxView)));document.querySelectorAll('[data-cx-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this message from this shop’s Inbox history? EMS Owner logs will remain permanently available.'))return;try{await api('connectx/messages/'+b.dataset.cxDelete,{method:'DELETE'});toast('Message removed from shop history.');connectX()}catch(e){toast(e.message)}})}function cxTable(rows){return rows.length?`<div class="shp-tw"><table><thead><tr><th>Date</th><th>Recipient</th><th>Subject</th><th>Document</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td class="shp-wrap">${esc(x.to_emails.join(', '))}</td><td class="shp-wrap">${esc(x.subject)}</td><td>${esc(x.invoice_id?'Invoice':'Message')}</td><td>${shpBadge(x.status,x.status==='sent'?'emerald':x.status==='failed'?'rose':'amber')}${x.error_message?`<br><small class="shp-desc" title="${esc(x.error_message)}">${esc(x.error_message)}</small>`:''}</td><td><span class="shp-rowacts"><button class="shp-btn shp-btn-soft shp-btn-sm" data-cx-view="${x.id}">View</button><button class="shp-icobtn shp-danger" data-cx-delete="${x.id}" title="Delete message" aria-label="Delete message" ${canAccess('connectx','delete')?'':'disabled'}>${lucide('trash')}</button></span></td></tr>`).join('')}</tbody></table></div>`:shpEmpty('No sent ConnectX messages yet.')}async function render(){if(tab==='compose')return compose();return sent()}document.querySelectorAll('[data-cx-tab]').forEach(b=>b.onclick=()=>{if(b.disabled)return;tab=b.dataset.cxTab;document.querySelectorAll('[data-cx-tab]').forEach(x=>x.classList.toggle('on',x===b));render()});await render()}
function connectXView(message){let e=shpModal(esc(message.subject),`<div class="shp-cx-email"><div class="shp-cx-email-head"><div><h2>${esc(message.subject)}</h2><p class="shp-desc">To: ${esc(message.to_emails.join(', '))} · ${new Date(message.created_at).toLocaleString()}</p></div></div><div class="shp-cx-email-meta"><span>From: <b>${esc(message.from_email)}</b></span><span>Status: <b>${esc(message.status)}</b></span>${message.cc_emails?.length?`<span>CC: <b>${esc(message.cc_emails.join(', '))}</b></span>`:''}</div><iframe class="shp-cx-frame" sandbox="" srcdoc="${esc(message.body_html)}"></iframe></div>`,'shp-modal-xl')}
async function dueRecover(){
  let history=[],modalState=null;
  const money=v=>Number(v||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
  const sourceLabel=t=>t==='sale'?'Sale':t==='purchase'?'Purchase':'Expense';
  const loadHistory=async()=>{
    $('#dueHistoryWrap').innerHTML=SKEL.table(5,8);
    history=await api('due?history=1');
    renderHistory($('#dueSearch')?.value||'');
  };
  const renderHistory=(q='')=>{
    const list=history.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));
    $('#dueHistoryWrap').innerHTML=list.length?`<div class="shp-tw"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Party / Details</th><th>Recovered</th><th>Remaining due</th><th>Method</th><th>Trx ID</th><th>Recovered by</th><th>Note</th></tr></thead><tbody>${list.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${shpBadge(sourceLabel(x.source_type),'emerald')}</td><td><code>${esc(x.source_reference||shortId(x.source_id))}</code></td><td class="shp-wrap">${esc(x.party_name||x.source_details||'—')}</td><td><b>${money(x.amount)}</b></td><td>${money(x.remaining_due)}</td><td>${esc(x.payment_method||'—')}</td><td>${x.transaction_id?`<code>${esc(x.transaction_id)}</code>`:'—'}</td><td>${esc(x.recovered_by_user||'Administrator')}</td><td class="shp-wrap">${esc(x.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:shpEmpty('No due recovery records found.');
  };
  $('#page').innerHTML=shpHead('Operations','Due recover','Track outstanding dues on sales, purchases and expenses — and record recoveries the moment customers pay.',canAccess('due_recover','add')?`<button class="shp-btn shp-btn-primary" id="openRecoverModal">Recover</button>`:'')+`<div class="shp-toolbar"><input id="dueSearch" class="shp-search" placeholder="Search recovered invoice records"></div><div class="shp-pagegap" id="dueHistoryWrap"></div>`;
  $('#dueSearch').oninput=e=>renderHistory(e.target.value);
  if($('#openRecoverModal'))$('#openRecoverModal').onclick=()=>openRecoverModal();
  const openRecoverModal=()=>{
    const e=shpModal('Recover due','','shp-modal-xl');modalState={mode:'sale',rows:[],selected:null,modal:e};
    e.querySelector('.shp-modalbody').innerHTML=`<div class="shp-due"><section class="shp-due-left"><div class="shp-panel-head"><h3>Due list</h3><div class="shp-chips"><button class="shp-chip on" data-modal-due="sale">Sale</button><button class="shp-chip" data-modal-due="purchase">Purchase</button><button class="shp-chip" data-modal-due="expense">Expense</button></div></div><div class="shp-toolbar"><input id="modalDueSearch" class="shp-search" placeholder="Search due"><button class="shp-btn shp-btn-soft" id="modalDueReload">Reload</button></div><div id="modalDueList">${SKEL.table(4,3)}</div></section><section id="modalRecoverForm"></section></div>`;
    e.querySelectorAll('[data-modal-due]').forEach(b=>b.onclick=()=>{modalState.mode=b.dataset.modalDue;e.querySelectorAll('[data-modal-due]').forEach(x=>x.classList.toggle('on',x===b));loadModalDues()});
    e.querySelector('#modalDueSearch').oninput=()=>renderModalDues();
    e.querySelector('#modalDueReload').onclick=loadModalDues;
    loadModalDues();
  };
  const loadModalDues=async(keepId=null)=>{
    const e=modalState.modal;
    e.querySelector('#modalDueList').innerHTML=SKEL.table(4,3);
    modalState.rows=await api('due?type='+modalState.mode);
    if(modalState.mode!=='expense'){
      const parties=await api(modalState.mode==='sale'?'customer':'supplier');
      const map=Object.fromEntries(parties.map(x=>[x.id,x]));
      modalState.rows=modalState.rows.map(x=>({...x,party:map[x.party_id]}));
    }
    modalState.selected=(keepId?modalState.rows.find(r=>r.id===keepId):null)||modalState.rows[0]||null;
    renderModalDues();
    renderRecoverForm();
  };
  const dueInfo=x=>{
    const m=modalState.mode;
    const due=Number(m==='expense'?x.due:x.total_due),paid=Number(m==='expense'?x.paid:x.paid_amount),total=Number(m==='expense'?x.total:(Number(x.subtotal||0)+Number(x.tax_amount||0)-Number(x.discount||0))),id=m==='expense'?x.expense_code:x.invoice_number,name=m==='expense'?x.details:(x.party?.name||(m==='sale'?'Custom customer':'Unknown supplier')),date=m==='expense'?x.expense_date:x.invoice_date;
    return {due,paid,total,id,name,date};
  };
  const renderModalDues=()=>{
    const e=modalState.modal,q=(e.querySelector('#modalDueSearch').value||'').toLowerCase(),rows=modalState.rows.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
    e.querySelector('#modalDueList').innerHTML=rows.length?`<div class="shp-tw"><table><thead><tr><th>Ref</th><th>Name</th><th>Due</th></tr></thead><tbody>${rows.map(x=>{const d=dueInfo(x);return `<tr class="pick ${modalState.selected?.id===x.id?'on':''}" data-pick-due="${x.id}"><td><code>${esc(d.id)}</code><br><small style="font-family:var(--shp-mono);font-size:8.5px;color:var(--shp-muted)">${esc(d.date)}</small></td><td class="shp-wrap">${esc(d.name)}</td><td><b>${money(d.due)}</b></td></tr>`}).join('')}</tbody></table></div>`:shpEmpty('No due records found.');
    e.querySelectorAll('[data-pick-due]').forEach(r=>r.onclick=()=>{modalState.selected=modalState.rows.find(x=>x.id===r.dataset.pickDue);renderModalDues();renderRecoverForm()});
  };
  const renderRecoverForm=()=>{
    const e=modalState.modal,x=modalState.selected,box=e.querySelector('#modalRecoverForm');
    if(!x){box.innerHTML=`<div class="shp-panel"><p class="shp-desc">Select a due record from the left table.</p></div>`;return}
    const d=dueInfo(x),m=modalState.mode;
    const invFields=m!=='expense'?`<div class="shp-due-grid"><label>Previous tax (${Number(x.tax_percent||0)}%)<input readonly value="${money(x.tax_amount||0)}"></label><label>Previous discount<input readonly value="${money(x.discount||0)}"></label></div><div class="shp-due-grid"><label>New tax %<input id="newTaxPercent" type="number" min="0" max="100" step="0.01" value="${Number(x.tax_percent||0)}"></label><label>New discount<input id="newDiscount" type="number" min="0" step="0.01" value="${Number(x.discount||0)}"></label></div><div class="shp-due-grid"><label>Payment method<select id="recoverPayMethod"><option value="cash">Cash</option><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank</option><option value="other">Other</option></select></label><label>Trx ID<input id="recoverTrxId" placeholder="Transaction ID (optional)"></label></div>`:'';
    box.innerHTML=`<section class="shp-panel"><div class="shp-panel-head"><h3>Recovery</h3>${shpBadge(sourceLabel(m),'sky')}</div><div class="shp-due-sum"><p><span>Reference</span><b>${esc(d.id)}</b></p><p><span>${m==='expense'?'Details':'Party'}</span><b>${esc(d.name)}</b></p></div><div class="shp-due-grid"><label>Total<input readonly value="${money(d.total)}"></label><label>Previous paid<input readonly value="${money(d.paid)}"></label><label>Previous due<input readonly value="${money(d.due)}"></label></div>${invFields}<div class="shp-due-grid"><label>Recover amount<input id="recoverAmount" type="number" min="0.01" max="${d.due}" step="0.01" value="0"></label><label>New due amount<input id="newDue" readonly value="${money(d.due)}"></label></div><label>Note<textarea id="recoverNote" rows="3"></textarea></label><div class="shp-due-actions"><button class="shp-btn shp-btn-primary" id="saveRecover">Save recovery</button><button class="shp-btn shp-btn-soft" id="clearRecover">Clear form</button>${m!=='expense'?'<button class="shp-btn shp-btn-ghost" id="viewDueInvoice">View invoice</button>':''}</div></section>`;
    box.querySelector('#recoverAmount').oninput=ev=>box.querySelector('#newDue').value=money(Math.max(0,d.due-Number(ev.target.value||0)));
    box.querySelector('#clearRecover').onclick=()=>{box.querySelector('#recoverAmount').value=0;box.querySelector('#newDue').value=money(d.due);box.querySelector('#recoverNote').value='';if(m!=='expense'){box.querySelector('#newTaxPercent').value=Number(x.tax_percent||0);box.querySelector('#newDiscount').value=Number(x.discount||0);box.querySelector('#recoverPayMethod').value='cash';box.querySelector('#recoverTrxId').value=''}};
    box.querySelector('#saveRecover').onclick=async()=>{const btn=box.querySelector('#saveRecover');if(btn.disabled)return;const amount=Number(box.querySelector('#recoverAmount').value);if(!amount||amount<=0)return toast('Enter a valid recovery amount.');const payload={sourceType:m,sourceId:x.id,amount,note:box.querySelector('#recoverNote').value};if(m!=='expense'){payload.taxPercent=Number(box.querySelector('#newTaxPercent').value||0);payload.discount=Number(box.querySelector('#newDiscount').value||0);payload.paymentMethod=box.querySelector('#recoverPayMethod').value;payload.transactionId=box.querySelector('#recoverTrxId').value.trim()}btn.disabled=true;try{const res=await api('due',{method:'POST',body:JSON.stringify(payload)});toast(Number(res.remaining_due||0)>0?'Due recovery saved — remaining due '+money(res.remaining_due)+'. The invoice stays in the due list.':'Due recovery saved — invoice fully cleared.');await loadModalDues(x.id);await loadHistory()}catch(err){toast(err.message);btn.disabled=false}};
    if(m!=='expense')box.querySelector('#viewDueInvoice').onclick=()=>invoiceView(x,m==='sale'?'Sales':'Purchase');
  };
  await loadHistory();
}

async function invoices(page){let kind=page==='purchases'?'purchase':'sale',label=kind==='purchase'?'Purchase':'Sales',[rows,parties]=await Promise.all([api('invoices?kind='+kind),api('invoice-parties?kind='+kind),attachmentsIndex(true).catch(()=>null)]);let partyMap=Object.fromEntries(parties.map(x=>[x.id,x]));rows=rows.map(x=>({...x,partyName:partyMap[x.party_id]?.name||x.custom_party_name||'Custom / walk-in customer'}));$('#page').innerHTML=shpHead('Operations',label+' invoices',kind==='purchase'?'Purchase invoices move stock in and update supplier dues.':'Sales invoices move stock out and update customer dues.')+`<div class="shp-toolbar">${canAccess(kind==='sale'?'sales':'purchase','add')?`<button class="shp-btn shp-btn-primary" id="addInvoice">+ Add new ${label.toLowerCase()}</button>`:''}<input id="invoiceSearch" class="shp-search" placeholder="Search invoice number, date, customer, or transaction ID"></div><div class="shp-pagegap" id="invoiceData">${invoiceTable(rows,label)}</div>`;$('#invoiceSearch').oninput=e=>$('#invoiceData').innerHTML=invoiceTable(rows.filter(r=>JSON.stringify(r).toLowerCase().includes(e.target.value.toLowerCase())),label);if($('#addInvoice'))$('#addInvoice').onclick=()=>kind==='sale'?page('sale-invoice'):invoiceModal(kind);document.querySelectorAll('[data-view-invoice]').forEach(b=>b.onclick=()=>invoiceView(rows.find(x=>x.id===b.dataset.viewInvoice),label));document.querySelectorAll('[data-edit-invoice]').forEach(b=>b.onclick=()=>toast('Posted invoice editing will be enabled with the next safe stock-reversal update.'));document.querySelectorAll('[data-delete-invoice]').forEach(b=>b.onclick=async()=>{let r=rows.find(x=>x.id===b.dataset.deleteInvoice);if(!confirm(`Delete ${r.invoice_number}? Inventory movement will be safely reversed.`))return;try{await api('invoices/'+r.id,{method:'DELETE'});toast('Invoice deleted and inventory reversed.');invoices(page)}catch(e){toast(e.message)}})}
function invoiceTable(rows,label){if(!rows.length)return shpEmpty('No '+label.toLowerCase()+' invoices found.');let partyLabel=label==='Sales'?'Customer name':'Supplier name',section=label==='Sales'?'sales':'purchase';return `<div class="shp-tw"><table><thead><tr><th>Invoice</th><th>Date</th><th>${partyLabel}</th><th>Subtotal</th><th>Discount</th><th>Paid</th><th>Due</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr class="${Number(r.total_due)>0?'shp-rowdue':''}"><td>${esc(r.invoice_number)}</td><td>${esc(r.invoice_date)}</td><td class="shp-wrap">${esc(r.partyName)}</td><td>${money(r.subtotal)}</td><td>${money(r.discount)}</td><td>${money(r.paid_amount)}</td><td>${money(r.total_due)}</td><td><span class="shp-rowacts shp-rowacts-table">${folderBtn({t:"inv",id:r.id,num:r.invoice_number})}<button class="shp-btn shp-btn-soft shp-btn-sm" data-view-invoice="${r.id}" ${canAccess(section,'view')?'':'disabled'}>View</button><button class="shp-btn shp-btn-soft shp-btn-sm" data-edit-invoice="${r.id}" ${canAccess(section,'edit')?'':'disabled'}>Edit</button><button class="shp-btn shp-btn-danger shp-btn-sm" data-delete-invoice="${r.id}" ${canAccess(section,'delete')?'':'disabled'}>Delete</button></span></td></tr>`).join('')}</tbody></table></div>`}
/* Item picker modal — shared by the sales page and purchase modal.
   Shows all ACTIVE inventory items (search box on top, single-select table)
   plus a selected-item section: Item · Quantity · Unit · Unit price · Add. */
function openItemPicker(kind,items,onAdd){
  const list=items.filter(x=>x.active);
  let selected=null;
  const e=shpModal('Add item',`<div class="shp-picker">
    <div class="shp-toolbar"><input id="pickSearch" class="shp-search" placeholder="Search item code or description"></div>
    <div id="pickTableWrap"></div>
    <div class="shp-picker-sel"><label>Item<input id="pickItem" readonly tabindex="-1" placeholder="Select an item from the table"></label><label>Quantity<input id="pickQty" type="number" min="0.001" step="0.001" value="1"></label><label>Unit<input id="pickUnit" readonly tabindex="-1"></label><label>${kind==='purchase'?'Buy':'Sale'} price<input id="pickPrice" type="number" min="0" step="0.01"></label><div class="shp-picker-add"><button class="shp-btn shp-btn-primary" type="button" id="pickAdd">Add item</button></div></div>
  </div>`,'shp-modal-xl');
  const currentQ=()=>(e.querySelector('#pickSearch').value||'').toLowerCase();
  const renderTable=()=>{
    const q=currentQ(),rows=list.filter(x=>!q||(x.item_code+' '+x.description).toLowerCase().includes(q));
    e.querySelector('#pickTableWrap').innerHTML=rows.length?`<div class="shp-tw"><table><thead><tr><th>Item code</th><th>Description</th><th>Unit</th><th>Sale price</th><th>Stock</th></tr></thead><tbody>${rows.map(x=>`<tr class="pick ${selected?.id===x.id?'on':''}" data-pick-item="${x.id}"><td><code>${esc(x.item_code)}</code></td><td class="shp-wrap">${esc(x.description)}</td><td>${esc(x.unit)}</td><td>${money(x.sale_price)}</td><td>${esc(x.total_stock)}</td></tr>`).join('')}</tbody></table></div>`:shpEmpty('No active items found.');
    e.querySelectorAll('[data-pick-item]').forEach(r=>r.onclick=()=>{selected=list.find(x=>x.id===r.dataset.pickItem)||null;renderTable();fillSelected()});
  };
  const fillSelected=()=>{
    e.querySelector('#pickItem').value=selected?selected.item_code+' — '+selected.description+(kind==='purchase'&&Number(selected.sale_price||0)>0?'  ·  Current sale price '+money(selected.sale_price):''):'';
    e.querySelector('#pickUnit').value=selected?.unit||'';
    if(selected&&kind==='sale')e.querySelector('#pickPrice').value=selected.sale_price??'';
  };
  e.querySelector('#pickSearch').oninput=()=>renderTable();
  e.querySelector('#pickAdd').onclick=()=>{
    if(!selected)return toast('Select an item from the table first.');
    const q=Number(e.querySelector('#pickQty').value),price=Number(e.querySelector('#pickPrice').value);
    if(!q||q<=0||Number.isNaN(price)||price<0)return toast('Enter a valid quantity and price.');
    if(kind==='purchase'&&Number(selected.sale_price||0)>0&&price>Number(selected.sale_price))return alert('Buy price ('+money(price)+') is greater than the current sale price ('+money(selected.sale_price)+') for '+selected.item_code+' — '+selected.description+'. Please correct the buy price before adding this item.');
    const picked=selected;e.remove();onAdd(picked,q,price);
  };
  renderTable();
}
/* Shared invoice form markup — rendered inside the purchase modal or the sales page. */
function invoiceFormHTML(kind,partyKind,parties,number,vault){return `<form class="shp-form">
<section class="shp-iv-sec"><h3>${kind==='purchase'?'Supplier':'Customer'} information</h3>
<label>Search and select ${partyKind}<input list="partyOptions" id="partySearch" placeholder="Name, phone, or ${partyKind} ID"><datalist id="partyOptions">${parties.map(x=>`<option value="${esc(x.name)} — ${esc(x.phone)}" data-id="${x.id}">`).join('')}</datalist></label>
${kind==='sale'?`<button class="shp-btn shp-btn-soft shp-btn-sm shp-party-clear" type="button" id="clearParty">Clear selection</button><div class="shp-party"><div class="shp-party-ro"><label>Customer ID<input id="customerCode" readonly value="Custom customer"></label><label>Name<input id="customerName" placeholder="Customer name"></label></div><div class="shp-party-ro"><label>Address<input id="customerAddress" placeholder="Customer address"></label><label>Phone<input id="customerPhone" placeholder="Customer phone"></label></div></div>`:''}
${kind==='purchase'?`<button class="shp-btn shp-btn-soft shp-btn-sm shp-party-clear" type="button" id="clearParty">Clear selection</button><div class="shp-party"><div class="shp-party-ro"><label>Supplier ID<input id="supplierCode" readonly></label><label>Name<input id="supplierName" readonly></label></div><div class="shp-party-ro"><label>Address<input id="supplierAddress" readonly></label><label>Phone<input id="supplierPhone" readonly></label></div></div>`:''}
</section>
<section class="shp-iv-sec"><h3>Invoice details</h3>
<div class="shp-grid2"><label>Date<input name="invoiceDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank</option><option value="other">Other</option></select></label><label>Transaction no.<input name="transactionId"></label><label>Invoice no.<input name="invoiceNumber" readonly required value="${esc(number.invoiceNumber)}"></label></div>
<label>Notes<textarea name="notes" rows="2"></textarea></label>
</section>
<section class="shp-iv-sec"><h3>Item</h3>
<div class="shp-iv-addrow"><button class="shp-btn shp-btn-soft" type="button" id="addLine">Add item</button></div>
<div id="lines" class="shp-lines"><span class="shp-lines-empty">No items added.</span></div>
</section>
<section class="shp-iv-sec"><h3>${kind==='purchase'?'Purchase':'Invoice'} summary</h3>
<div class="shp-sumgrid"><label>Subtotal<input id="subtotal" readonly></label><label>Tax (%)<input id="taxPercent" type="number" min="0" step="0.01" value="0"></label><label>Discount<input id="discount" type="number" min="0" step="0.01" value="0"></label><label>Tax amount<input id="taxAmount" readonly></label><label>Paid amount<input id="paidAmount" type="number" min="0" step="0.01" value="0"></label><label>Total due<input id="totalDue" readonly></label></div>
</section>
${vault.enabled?`<section class="shp-iv-sec"><h3>File attachments <span class="muted">· Vaultium</span></h3><div class="shp-attach"><label class="shp-attachpick"><input type="file" id="vaultFileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">Attach files — max 5, 5 MB each</label><div id="vaultSelected" class="shp-attachchips"></div></div></section>`:''}
<div class="shp-iv-actions"><button class="shp-btn shp-btn-soft" type="button" id="clearInvoice">Clear invoice</button><button class="shp-btn shp-btn-primary">Save invoice</button></div>
</form>`}
/* Wires the shared invoice form. `e` is the container (modal box or page panel). */
function wireInvoiceForm(e,kind,{parties,items,vault,onDone}){
  const $q=s=>e.querySelector(s);
  let lines=[],files=[],party=null;
  const renderVaultFiles=()=>{const box=$q('#vaultSelected');if(!box)return;box.innerHTML=files.length?files.map((f,i)=>`<span class="shp-attachchip"><span>${esc(f.name)} <small>${(f.size/MB2).toFixed(2)} MB</small></span><button type="button" data-vault-rm="${i}">×</button></span>`).join(''):'';box.querySelectorAll('[data-vault-rm]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.vaultRm,1);renderVaultFiles()})};
  if(vault.enabled){const fi=$q('#vaultFileInput');if(fi)fi.onchange=ev=>{for(const f of [...ev.target.files]){if(files.length>=5){toast('Maximum 5 files.');break}if(f.size>5*MB2){toast(f.name+' exceeds 5 MB.');continue}files.push(f)}ev.target.value='';renderVaultFiles()};renderVaultFiles()}
  function optionId(text,source){let o=[...source.querySelectorAll('option')].find(x=>x.value===text);return o?.dataset.id}
  function render(){let sub=lines.reduce((n,x)=>n+x.quantity*x.unitPrice,0),tax=sub*Number($q('#taxPercent').value||0)/100,discount=Number($q('#discount').value||0),paid=Number($q('#paidAmount').value||0),due=sub+tax-discount-paid;$q('#subtotal').value=money(sub);$q('#taxAmount').value=money(tax);$q('#totalDue').value=money(due);$q('#lines').innerHTML=lines.length?`<div class="shp-tw"><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th>Total</th><th></th></tr></thead><tbody>${lines.map((x,i)=>`<tr><td class="shp-wrap">${esc(x.item.item_code)} — ${esc(x.item.description)}</td><td>${x.quantity}</td><td>${esc(x.item.unit)}</td><td>${money(x.unitPrice)}</td><td>${money(x.quantity*x.unitPrice)}</td><td><button type="button" class="shp-btn shp-btn-danger shp-btn-sm" data-remove-line="${i}">Remove</button></td></tr>`).join('')}</tbody></table></div>`:'<span class="shp-lines-empty">No items added.</span>';e.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>{lines.splice(+b.dataset.removeLine,1);render()})}
  $q('#partySearch').onchange=x=>{party=parties.find(z=>z.id===optionId(x.target.value,$q('#partyOptions')));if(party&&kind==='sale'){let f=[['customerCode',party.customer_code||shortId(party.id)],['customerName',party.name],['customerAddress',party.address||''],['customerPhone',party.phone||'']];f.forEach(([id,v])=>{let el=$q('#'+id);el.value=v;el.readOnly=true});}if(party&&kind==='purchase'){[['supplierCode',party.supplier_code||shortId(party.id)],['supplierName',party.name],['supplierAddress',party.address||''],['supplierPhone',party.phone||'']].forEach(([id,v])=>$q('#'+id).value=v)};};
  if(kind==='sale')$q('#clearParty').onclick=()=>{party=null;$q('#partySearch').value='';$q('#customerCode').value='Custom customer';[['customerName','customerAddress','customerPhone']].forEach(([id])=>{let el=$q('#'+id);el.value='';el.readOnly=false});};
  if(kind==='purchase')$q('#clearParty').onclick=()=>{party=null;$q('#partySearch').value='';['supplierCode','supplierName','supplierAddress','supplierPhone'].forEach(id=>$q('#'+id).value='')};
  $q('#addLine').onclick=()=>openItemPicker(kind,items,(item,q,price)=>{lines.push({item,quantity:q,unitPrice:price});render()});
  ['taxPercent','discount','paidAmount'].forEach(id=>$q('#'+id).oninput=render);
  $q('#clearInvoice').onclick=()=>{lines=[];party=null;let invoiceNo=$q('[name=invoiceNumber]').value;$q('form').reset();$q('[name=invoiceNumber]').value=invoiceNo;$q('#partySearch').value='';if(kind==='sale'){ $q('#customerCode').value='Custom customer';[['customerName','customerAddress','customerPhone']].forEach(([id])=>{let el=$q('#'+id);el.value='';el.readOnly=false}) }else{['supplierCode','supplierName','supplierAddress','supplierPhone'].forEach(id=>$q('#'+id).value='')}render()};
  $q('form').onsubmit=async ev=>{ev.preventDefault();if(kind==='purchase'&&!party)return toast('Select a valid supplier.');if(kind==='sale'&&!party&&!$q('#customerName').value.trim())return toast('Enter a customer name or select a registered customer.');if(!lines.length)return toast('Add at least one inventory item.');let f=Object.fromEntries(new FormData(ev.target));try{let inv=await api('invoices',{method:'POST',body:JSON.stringify({kind,invoiceNumber:f.invoiceNumber,partyId:party?.id||null,customPartyName:kind==='sale'&&!party?$q('#customerName').value.trim():null,customPartyAddress:kind==='sale'&&!party?$q('#customerAddress').value.trim():null,customPartyPhone:kind==='sale'&&!party?$q('#customerPhone').value.trim():null,invoiceDate:f.invoiceDate,paymentMethod:f.paymentMethod,transactionId:f.transactionId,notes:f.notes,taxPercent:Number($q('#taxPercent').value||0),discount:Number($q('#discount').value||0),paidAmount:Number($q('#paidAmount').value||0),lines:lines.map(x=>({itemId:x.item.id,quantity:x.quantity,unitPrice:x.unitPrice}))})});if(vault.enabled&&files.length){for(const file of files){const fd=new FormData();fd.append('files',file);fd.append('invoice_id',inv.id);fd.append('invoice_number',inv.invoice_number||f.invoiceNumber);await apiUpload('vaultium/upload',fd)}attCache=null}toast('Invoice saved and inventory updated.');onDone(inv)}catch(x){toast(x.message)}};
  render();
}
/* Purchase invoice — stays a modal. */
async function invoiceModal(kind){
  let partyKind=kind==='purchase'?'supplier':'customer',[parties,items,number,vault]=await Promise.all([api('invoice-parties?kind='+kind),api('invoice-items?kind='+kind),api('invoice-number?kind='+kind),api('vaultium/availability').catch(()=>({enabled:false}))]);
  let e=shpModal(`New ${kind==='purchase'?'purchase':'sales'} invoice`,invoiceFormHTML(kind,partyKind,parties,number,vault),'shp-modal-xl');
  wireInvoiceForm(e,kind,{parties,items,vault,onDone:()=>{e.remove();invoices(kind==='purchase'?'purchases':'sales')}});
}
/* Sales invoice — full page instead of a modal. */
async function invoicePage(kind){
  if(!canAccess('sales','add')){toast('Permission denied.');return page('sales')}
  let partyKind=kind==='purchase'?'supplier':'customer',[parties,items,number,vault]=await Promise.all([api('invoice-parties?kind='+kind),api('invoice-items?kind='+kind),api('invoice-number?kind='+kind),api('vaultium/availability').catch(()=>({enabled:false}))]);
  $('#page').innerHTML=shpHead('Operations','New sales invoice','Create a sales invoice — stock moves out and customer dues update automatically.','<button class="shp-btn shp-btn-soft" id="backToSales">← Back to sales</button>')+`<div class="shp-pagegap"><section class="shp-panel" id="invoiceFormWrap">${invoiceFormHTML(kind,partyKind,parties,number,vault)}</section></div>`;
  $('#backToSales').onclick=()=>invoices('sales');
  wireInvoiceForm($('#invoiceFormWrap'),kind,{parties,items,vault,onDone:()=>invoices('sales')});
}

/* Invoice view — the document markup (.invoiceprint family) is shared with the
   public TrueBill verification page and the print window, so it keeps its
   classes; only the modal chrome is the Shop theme. */
async function invoiceView(r,label){let partyKind=r.kind==='sale'?'customer':'supplier';let [parties,staff,store,branding,tb]=await Promise.all([api('invoice-parties?kind='+r.kind),api('staff').catch(()=>[]),api('shop/settings'),api('public/branding'),api('truebill/availability').catch(()=>({enabled:false,ever:false}))]);let party=parties.find(x=>x.id===r.party_id),partyName=party?.name||r.custom_party_name||'—',partyAddress=party?.address||r.custom_party_address||'—',partyPhone=party?.phone||r.custom_party_phone||'—',partyCode=party?.customer_code||party?.supplier_code||(r.custom_party_name?'Custom customer':'Custom / not registered'),submitter=staff.find(x=>x.id===r.created_by),paid=Number(r.total_due)<=0,showQR=!!(tb.enabled||tb.ever),base=(tb.url||location.origin).replace(/\/$/,''),verifyUrl=base+'/?verify='+r.verification_token,qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=165x165&data='+encodeURIComponent(verifyUrl);let e=document.createElement('div');e.className='shp-modal shp-ivmodal';let billLabel=r.kind==='sale'?'Bill to':'Supplier';e.innerHTML=`<div class="shp-modalbox"><div class="shp-modalbody"><section class="invoiceprint"><header class="invoicePrintHeader"><div class="invoiceShopInfo"><h2>${esc(store.name)}</h2><p>${esc(store.address||'')}</p><p>${esc(store.phone||'')}${store.phone2?' · '+esc(store.phone2):''}</p><p>${esc(store.email||'')}</p>${store.website?`<p>${esc(store.website)}</p>`:''}</div><div class="invoiceTitleRight"><h1>${r.kind==='sale'?'SALES INVOICE':'PURCHASE INVOICE'}</h1><span># ${esc(r.invoice_number)}</span><b class="invoiceStatus ${paid?'paid':'due'}">${paid?'Paid':'Due'}</b></div></header><div class="invoicePrintInfo"><div><h3>${billLabel}</h3><p><i>ID:</i> <b>${esc(partyCode)}</b></p><p><i>Name:</i> <b>${esc(partyName)}</b></p><p><i>Address:</i> ${esc(partyAddress)}</p><p><i>Phone:</i> ${esc(partyPhone)}</p></div><div><h3>Invoice details</h3><p><i>Date:</i> <b>${esc(r.invoice_date)}</b></p><p><i>Invoice no.:</i> <b>${esc(r.invoice_number)}</b></p><p><i>Payment method:</i> <b>${esc(r.payment_method)}</b></p><p><i>Transaction ID:</i> <b>${esc(r.transaction_id||'—')}</b></p><p><i>Submit by:</i> <b>${esc(submitter?.user_id||'Administrator')}</b></p></div></div><div class="tablewrap"><table class="printItems"><thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th class="right">Total</th></tr></thead><tbody>${(r.invoice_lines||[]).map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.inventory_items?.description||'Item')}</b><br><small>${esc(x.inventory_items?.item_code||'')}</small></td><td>${esc(x.quantity)}</td><td>${esc(x.inventory_items?.unit||'')}</td><td>${invoiceMoney(x.unit_price)}</td><td class="right">${invoiceMoney(x.line_total)}</td></tr>`).join('')}</tbody></table></div><div class="invoiceBottom">${showQR?`<div class="invoiceQR"><div class="qrwrap"><img src="${qrUrl}" alt="TrueBill QR code"></div><div class="qrtext"><b>Scan For Verify</b><small>TrueBill</small></div></div>`:''}<div class="printTotals"><div><p><span>Subtotal</span><b>${invoiceMoney(r.subtotal)}</b></p><p><span>Tax (${esc(r.tax_percent)}%)</span><b>${invoiceMoney(r.tax_amount)}</b></p><p><span>Discount</span><b>−${invoiceMoney(r.discount)}</b></p><p><span>Paid amount</span><b>−${invoiceMoney(r.paid_amount)}</b></p><p class="dueLine"><span>Total due</span><b>${invoiceMoney(r.total_due)}</b></p><small>${paid?'Balance: Paid in full':'Balance pending'}</small></div></div></div><footer class="invoicePrintFooter"><div><b>Notes:</b><br>${esc(r.notes||'No additional notes.')}</div><div><b>Invoice status:</b> ${paid?'Paid':'Payment due'}<br><small>Generated ${new Date().toLocaleDateString()}</small><br><small>This invoice is a computer generated document · Powered by DoxTox EMS</small></div></footer><div class="printActions"><button id="printInvoice">Print invoice</button><button class="secondary" id="closeInvoice">Close</button></div></section></div></div>`;document.body.append(e);e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});e.querySelector('#closeInvoice').onclick=()=>e.remove();e.querySelector('#printInvoice').onclick=()=>{let w=window.open('','_blank');w.document.write('<html><head><title>'+esc(r.invoice_number)+'</title><style>body{font-family:Arial;padding:12mm 15mm;color:#111;font-size:10px}.printActions{display:none}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#111;color:#fff;text-align:left;padding:6px;font-size:9px}td{padding:5px 6px;border-bottom:1px solid #ddd;font-size:10px}.invoicePrintHeader{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px}.invoiceShopInfo{font-size:10px;line-height:1.3}.invoiceShopInfo h2{font-size:17px;margin:0 0 3px}.invoiceTitleRight{text-align:right}.invoiceTitleRight h1{font-size:21px;margin:0}.invoicePrintInfo{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:14px 0}.invoicePrintInfo h3{font-size:10px;margin:0 0 5px}.invoicePrintInfo p{margin:2px 0}.printTotals{display:flex;justify-content:end;margin-top:10px}.printTotals>div{width:290px}.printTotals p{display:flex;justify-content:space-between;margin:4px 0}.dueLine{border-top:1px solid #ddd;padding-top:7px;font-size:14px}.invoicePrintFooter{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:10px;margin-top:14px;font-size:10px}.invoiceBottom{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:10px}.invoiceQR{display:flex;align-items:flex-start;gap:10px}.invoiceQR img{width:110px;height:110px;border:1px solid #ddd;padding:3px;background:#fff}.qrwrap{display:inline-block;line-height:0}.qrtext{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:110px}.qrtext b{font-size:11px;color:#111}.qrtext small{font-size:9px;color:#666;letter-spacing:.3px}.invoiceBottom .printTotals{margin:0 0 0 auto}</style></head><body>'+e.querySelector('.invoiceprint').innerHTML+'</body></html>');w.document.close();let printed=false,printWhenReady=()=>{if(printed)return;printed=true;setTimeout(()=>w.print(),250)},qr=w.document.querySelector('.invoiceQR img');if(qr&&!qr.complete){qr.addEventListener('load',printWhenReady,{once:true});qr.addEventListener('error',printWhenReady,{once:true});setTimeout(printWhenReady,5000)}else printWhenReady()}}
async function settings(){let tab='store';$('#page').innerHTML=shpHead('Preferences','Settings','Store identity, low-stock alert and the shop activity log.')+`<div class="shp-chips"><button class="shp-chip on" data-setting-tab="store">Store</button><button class="shp-chip" data-setting-tab="activity">Activity Log</button></div><div id="settingContent" class="shp-pagegap"></div>`;async function render(){let el=$('#settingContent');el.innerHTML=`<section class="shp-panel">${SKEL.head()}${tab==='store'?SKEL.kv(8):SKEL.toolbar()+SKEL.table(4,6)}</section>`;if(tab==='store'){let x=await api('shop/settings');el.innerHTML=`<section class="shp-panel"><div class="shp-panel-head"><div><h3>Store details</h3><p class="shp-desc">Managed by your administrator. Contact them to change store identity.</p></div>${shpBadge(x.status==='active'?'Active':'Inactive',x.status==='active'?'emerald':'zinc')}</div><div class="shp-kv"><div><span>Store name</span><b>${esc(x.name)}</b></div><div><span>Shop ID</span><b><code>${esc(x.shop_code)}</code></b></div><div><span>Address</span><b>${esc(x.address||'—')}</b></div><div><span>Phone</span><b>${esc(x.phone||'—')}${x.phone2?' / '+esc(x.phone2):''}</b></div><div><span>Email</span><b>${esc(x.email||'—')}</b></div><div><span>Website</span><b>${esc(x.website||'—')}</b></div><div><span>Low stock alert</span><b>${esc(x.low_stock_threshold)}</b></div><div><span>Status</span><b>${esc(x.status)}</b></div></div></section>`}else{let logs=await api('shop/activity-logs');el.innerHTML=`<section class="shp-panel"><div class="shp-panel-head"><div><h3>Activity Log</h3><p class="shp-desc">Login, create, update, delete, and recovery activity for this shop.</p></div><input id="logSearch" class="shp-search" placeholder="Search activity"></div><div id="logTable">${activityTable(logs)}</div></section>`;$('#logSearch').oninput=e=>$('#logTable').innerHTML=activityTable(logs.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())))}}function activityTable(rows){return rows.length?`<div class="shp-tw"><table><thead><tr><th>Action</th><th>Entity</th><th>Details</th><th>User ID</th><th>User</th><th>Date & time</th></tr></thead><tbody>${rows.map(x=>`<tr><td><span class="shp-tag shp-t-zinc">${esc(x.action)}</span></td><td>${esc(x.entity_type||'—')}</td><td><code>${esc(x.detail||'—')}</code></td><td>${esc(x.actor?.userId||'—')}</td><td>${esc(x.actor?.name||'—')}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`:'<p class="shp-desc">No activity has been recorded for this shop.</p>'}document.querySelectorAll('[data-setting-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.settingTab;document.querySelectorAll('[data-setting-tab]').forEach(x=>x.classList.toggle('on',x===b));render()});await render()}
/* modal(): unused legacy helper removed with the Shop Panel redesign */
/* ───────────────────────── Notification centres (shop & admin) ───────────────────────── */
const NTF_LABELS={connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'};
let ntfScope=null,ntfItems=[],ntfTimer=null,ntfPopEl=null;
function ntfStoreKey(scope){return 'ems.ntf.'+scope+'.'+(scope==='shop'?(state?.storeId||state?.store?.id||'x'):(state?.id||state?.user?.id||'x'));}
function ntfSeen(scope){try{return JSON.parse(localStorage.getItem(ntfStoreKey(scope))||'{}')}catch{return {}}}
function ntfSaveSeen(scope,map){try{localStorage.setItem(ntfStoreKey(scope),JSON.stringify(map))}catch{}}
function ntfEnsurePop(){
 if(ntfPopEl)return ntfPopEl;
 ntfPopEl=document.createElement('div');ntfPopEl.id='ntfPop';ntfPopEl.className='ntf-pop';ntfPopEl.hidden=true;
 ntfPopEl.innerHTML=`<div class="ntf-pophead"><b>Notifications</b><button type="button" class="ntf-markall" id="ntfMarkAll">Mark all read</button><button type="button" class="ntf-close" id="ntfClose" aria-label="Close notifications">${lucide('x')}</button></div><div class="ntf-list" id="ntfList"></div>`;
 document.body.appendChild(ntfPopEl);
 ntfPopEl.querySelector('#ntfClose').onclick=()=>ntfClosePop();
 ntfPopEl.querySelector('#ntfMarkAll').onclick=()=>{let seen=ntfSeen(ntfScope);ntfItems.forEach(x=>seen[x.key]=true);ntfSaveSeen(ntfScope,seen);ntfRenderBadge();ntfRenderList();toast('Notifications marked as read.')};
 document.addEventListener('click',e=>{if(!ntfPopEl||ntfPopEl.hidden)return;if(e.target.closest('#ntfPop')||e.target.closest('#ntfBell'))return;ntfClosePop();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ntfPopEl&&!ntfPopEl.hidden)ntfClosePop()});
 addEventListener('resize',()=>{if(ntfPopEl&&!ntfPopEl.hidden)ntfClosePop()});
 return ntfPopEl;
}
function ntfClosePop(){ntfPopEl.hidden=true;document.body.classList.remove('ntf-open');const b=$('#ntfBell');if(b)b.setAttribute('aria-expanded','false');}
function ntfRenderBadge(){
 let seen=ntfSeen(ntfScope),unread=ntfItems.filter(x=>!seen[x.key]);
 document.querySelectorAll('#ntfBell').forEach(b=>{
  let dot=b.querySelector('.ntf-dot');
  if(unread.length){if(!dot){dot=document.createElement('span');dot.className='ntf-dot';b.appendChild(dot)}dot.textContent=unread.length>9?'9+':unread.length;dot.classList.toggle('ntf-crit',unread.some(x=>x.level==='critical'));}
  else if(dot)dot.remove();
 });
}
function ntfRenderList(){
 let el=$('#ntfList');if(!el)return;let seen=ntfSeen(ntfScope);
 if(!ntfItems.length){el.innerHTML=`<div class="ntf-empty">${lucide('bell')}<b>You're all caught up</b><small>New alerts will appear here.</small></div>`;return}
 el.innerHTML=ntfItems.map(x=>{
  let un=seen[x.key]?'':'ntf-unread';
  return `<button type="button" class="ntf-item ntf-${x.level} ${un}" data-ntf-goto="${esc(x.goto||'')}" data-ntf-key="${esc(x.key)}">
    <span class="ntf-ic">${lucide(x.icon||'bell')}</span>
    <span class="ntf-tx"><b>${esc(x.title)}</b>${x.detail?`<small>${esc(x.detail)}</small>`:''}</span>
    ${un?'<i class="ntf-new"></i>':''}
   </button>`;
 }).join('');
 el.querySelectorAll('[data-ntf-goto]').forEach(b=>b.onclick=()=>{
   let g=b.dataset.ntfGoto,key=b.dataset.ntfKey;
   if(key){let seen=ntfSeen(ntfScope);seen[key]=true;ntfSaveSeen(ntfScope,seen);ntfRenderBadge();}
   ntfClosePop();if(!g)return;
   if(ntfScope==='shop'){try{page(g)}catch{}}else if(ntfScope==='owner'){try{ownerPage(g)}catch{}}else{try{adminPage(g)}catch{}}});
}
async function ntfRefresh(scope){
 try{
  let r=await api('notifications/'+scope);ntfItems=Array.isArray(r.items)?r.items:[];
  if(ntfScope===scope){ntfRenderBadge();if(ntfPopEl&&!ntfPopEl.hidden)ntfRenderList();}
 }catch{/* silent */}
}
function initNotifications(scope){
 ntfScope=scope;ntfEnsurePop();
 ntfPopEl.classList.toggle('ntf-for-shop',scope==='shop');ntfPopEl.classList.toggle('ntf-for-admin',scope==='admin');ntfPopEl.classList.toggle('ntf-for-owner',scope==='owner');
 let bell=$('#ntfBell');
 if(bell)bell.onclick=e=>{
  e.stopPropagation();
  let open=ntfPopEl.hidden;
  if(open){
   let r=bell.getBoundingClientRect();
   let w=Math.min(380,window.innerWidth-20);
   ntfPopEl.style.width=w+'px';
   ntfPopEl.style.top=Math.min(window.innerHeight-60,r.bottom+8)+'px';
   ntfPopEl.style.left=Math.min(Math.max(10,r.right-w),window.innerWidth-w-10)+'px';
   ntfPopEl.style.right='auto';
   ntfPopEl.hidden=false;document.body.classList.add('ntf-open');
   bell.setAttribute('aria-expanded','true');
   ntfRenderList();ntfRefresh(scope);
  }else ntfClosePop();
 };
 ntfRefresh(scope);
 if(ntfTimer)clearInterval(ntfTimer);
 ntfTimer=setInterval(()=>{if(document.hidden)return;ntfRefresh(scope);},90000);
}

/* ───────────────────────── Mobile navigation drawer (all shells) ───────────────────────── */
const drawerBackdrop=document.createElement('div');
drawerBackdrop.id='drawerBackdrop';
drawerBackdrop.setAttribute('aria-hidden','true');
drawerBackdrop.hidden=true;
document.body.appendChild(drawerBackdrop);
// Row attachment folder buttons (sales/purchase/expense lists) — delegated so they survive re-renders.
document.addEventListener('click',ev=>{const b=ev.target.closest('[data-att-target]');if(!b)return;let t;try{t=JSON.parse(b.dataset.attTarget)}catch{return}attachmentsModal(t)});
function drawerOpen(){document.body.classList.add('drawer-open');drawerBackdrop.hidden=false;document.querySelectorAll('.appBurger').forEach(b=>b.setAttribute('aria-expanded','true'));}
function drawerClose(){document.body.classList.remove('drawer-open');drawerBackdrop.hidden=true;document.querySelectorAll('.appBurger').forEach(b=>b.setAttribute('aria-expanded','false'));}
document.addEventListener('click',e=>{
  const burger=e.target.closest('.appBurger');
  if(burger){e.preventDefault();document.body.classList.contains('drawer-open')?drawerClose():drawerOpen();return;}
  if(e.target.closest('#drawerBackdrop')){drawerClose();return;}
  if(e.target.closest('[data-page],[data-admin-page],[data-owner-page],.sitehead nav a,.shp-sidefoot button,.adm-sidefoot button,.ob-sidefoot button'))drawerClose();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')drawerClose()});
addEventListener('resize',()=>{if(window.innerWidth>960)drawerClose()});

if(new URLSearchParams(location.search).get('verify')){verificationPage(new URLSearchParams(location.search).get('verify'))}else if(new URLSearchParams(location.search).get('page')){publicPage(new URLSearchParams(location.search).get('page'))}else if(state){scheduleLogout();home()}else login();
/* Cold-open splash: fade out once the first screen is painted AND the animated intro has played its beat. */
function hideSplash(){try{window.emsSplashHide&&window.emsSplashHide()}catch{}}
let _splashWaited=false;
function splashGate(){
 if(_splashWaited)return;_splashWaited=true;
 let shownAt=window.__splashShownAt||0,minMs=1400,rest=Math.max(0,minMs-(performance.now()-shownAt));
 setTimeout(hideSplash,rest);
}
requestAnimationFrame(()=>requestAnimationFrame(splashGate));

/* ===== Premium Add-Ons ===== */
let addonCart=[],addonCoupon=null;
const ZUDO_LOADER=`<div class="zudoLoader" aria-hidden="true"><div class="loader"><svg width="100" height="100" viewBox="0 0 100 100"><defs><mask id="clipping"><polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon><polygon points="25,25 75,25 50,75" fill="white"></polygon><polygon points="50,25 75,75 25,75" fill="white"></polygon><polygon points="35,35 65,35 50,65" fill="white"></polygon><polygon points="35,35 65,35 50,65" fill="white"></polygon><polygon points="35,35 65,35 50,65" fill="white"></polygon><polygon points="35,35 65,35 50,65" fill="white"></polygon></mask></defs></svg><div class="box"></div></div></div>`;/* ==== Zudo "Thinking…" orb — canvas ribbon-sphere (port of "thinking orb.html") ==== */
const ZUDO_THINKING_HTML='<div class="zudoThinking" style="display:flex;flex-direction:row;align-items:center;gap:8px;width:max-content" role="status" aria-label="Zudo is thinking"><canvas class="zudoOrb" style="width:26px;height:26px;flex:0 0 auto;display:block" aria-hidden="true"></canvas><span class="zudoThinkingText" style="font-style:italic;font-weight:700;font-size:12px;letter-spacing:.3px;color:#64748b;display:inline-flex;align-items:baseline;white-space:nowrap">Thinking<span class="zudoDots" aria-hidden="true"><i></i><i></i><i></i></span></span></div>';
function startZudoOrbs(root){(root||document).querySelectorAll('canvas.zudoOrb').forEach(c=>{if(!c.dataset.orbLive){c.dataset.orbLive='1';zudoOrb(c)}})}
function zudoOrb(canvas){
  if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  /* Original "composing" preset + base profile (exact values from thinking orb.html) */
  const preset={speed:2.34,count:.25,size:.85,spin:0,bandMul:3.9,wobMul:1};
  const BASE={lanes:5,segs:88,ghostN:150,rBase:1.1,rDepth:1.7,rsPow:.6,rMin:.3};
  const lanes=Math.max(1,Math.round(BASE.lanes*Math.sqrt(preset.count)));
  const segs=Math.max(2,Math.round(BASE.segs*Math.sqrt(preset.count)));
  const finalLanes=Math.max(1,Math.round(lanes*preset.bandMul));
  const rBase=BASE.rBase*preset.size,rDepth=BASE.rDepth*preset.size;
  /* Size comes from CSS (.zudoOrb); crisp on HiDPI */
  const DPR=Math.min(2,window.devicePixelRatio||1);
  const SIZE=Math.max(24,Math.round(canvas.getBoundingClientRect().width)||48);
  canvas.width=Math.round(SIZE*DPR);canvas.height=Math.round(SIZE*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  /* Ink: dark dots on light bubbles, light dots on dark bubbles */
  let dark=false;
  try{let el=canvas,n=0;
    while(el&&n++<6){
      const m=getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if(m&&m.length>=3&&(m.length<4||Number(m[3])>.5)){dark=(.2126*m[0]+.7152*m[1]+.0722*m[2])<140;break}
      el=el.parentElement;
    }
  }catch(e){}
  /* Fibonacci sphere + orthographic projection (original math) */
  const GOLD=Math.PI*(3-Math.sqrt(5)),tilt=.3,ST=Math.sin(tilt),CT=Math.cos(tilt);
  const fibDir=(i,n)=>{const y=1-2*(i+.5)/n,r=Math.sqrt(Math.max(0,1-y*y)),a=i*GOLD;return[r*Math.cos(a),y,r*Math.sin(a)]};
  function frame(t){
    const cx=SIZE/2,cy=SIZE/2,R=SIZE/2*.78,spin=preset.spin;
    const yaw=t*.1*spin,sy=Math.sin(yaw),cyw=Math.cos(yaw);
    const P=(x,y,z)=>{const x1=x*cyw+z*sy,z1=-x*sy+z*cyw,y1=y*CT-z1*ST,z2=y*ST+z1*CT;return[cx+x1,cy-y1,z2]};
    const rs=Math.pow(SIZE/300,BASE.rsPow);
    const boost=SIZE<48?Math.min(2.2,48/SIZE):1; /* keeps dot presence at 20-30px */
    const dots=[];
    /* ghost sphere */
    for(let i=0;i<BASE.ghostN;i++){
      const d=fibDir(i,BASE.ghostN),p=P(d[0]*R,d[1]*R,d[2]*R),depth=(p[2]/R+1)/2;
      dots.push({x:p[0],y:p[1],z:p[2],r:.8*rs*boost,white:.78,a:.1+.22*depth});
    }
    /* ribbon plane */
    const ya=t*.24*spin,ta=.55+.3*Math.sin(t*.18)*spin;
    const ux=Math.cos(ya),uy=0,uz=Math.sin(ya);
    const vx=-uz*Math.sin(ta),vy=Math.cos(ta),vz=ux*Math.sin(ta);
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const baseR=R;
    for(let w=0;w<finalLanes;w++){
      const laneOff=(w-(finalLanes-1)/2)*.075;
      const edge=Math.abs(w-(finalLanes-1)/2)/Math.max(1,(finalLanes-1)/2);
      for(let k=0;k<segs;k++){
        const a=k/segs*Math.PI*2;
        const wob=(.16*Math.sin(a*3-t*1.7+w*.22)+.07*Math.sin(a*5+t*1.1))*preset.wobMul;
        const off=laneOff+wob;
        const x=ux*Math.cos(a)+vx*Math.sin(a)+nx*off;
        const y=uy*Math.cos(a)+vy*Math.sin(a)+ny*off;
        const z=uz*Math.cos(a)+vz*Math.sin(a)+nz*off;
        const l=Math.sqrt(x*x+y*y+z*z)||1,rr=baseR;
        const p=P(x/l*rr,y/l*rr,z/l*rr),depth=(p[2]/R+1)/2;
        const radius=Math.max(BASE.rMin,(rBase+rDepth*depth)*(1-.25*edge)*rs*boost);
        const white=.52-.44*depth+.18*edge;
        dots.push({x:p[0],y:p[1],z:p[2],r:radius,white,a:.4+.6*depth});
      }
    }
    dots.sort((a,b)=>a.z-b.z);
    ctx.clearRect(0,0,SIZE,SIZE);
    for(const d of dots){
      let g=Math.round(Math.min(1,Math.max(0,d.white))*255);
      if(dark)g=255-g;
      ctx.fillStyle='rgba('+g+','+g+','+g+','+(d.a==null?1:d.a)+')';
      ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();
    }
  }
  const t0=performance.now();
  function loop(now){
    if(!canvas.isConnected)return; /* thinking bubble removed -> stop animating */
    frame((now-t0)/1000*preset.speed);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
const ADDON_NAMES={connectx:'ConnectX',zudo:'Zudo AI',business_health:'AI Business Health',truebill:'TrueBill',vaultium:'Vaultium'};
const addonName=x=>x.title||ADDON_NAMES[x.addon_key]||x.addon_key;
const addonIcon=k=>k==='connectx'?'✉':k==='zudo'?'✦':k==='truebill'?'▣':k==='vaultium'?'🗄':'▥';
const addonNoLimit=x=>x.addon_key==='truebill';
const addonIsVault=x=>x.addon_key==='vaultium';
const addonArt=x=>`<div class="adm-art">${x.addon_key==='zudo'?(x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" onerror="this.remove()">`:ZUDO_LOADER):(x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" onerror="this.remove()">`:`<i>${addonIcon(x.addon_key)}</i>`)}</div>`;
const addonBadgeCls=st=>st==='active'?'act':st==='pending'?'pend':st==='rejected'?'rej':st==='expired'?'exp':'';


async function helpdeskAdmin(){
  const moneyT=v=>new Date(v).toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  $('#page').innerHTML=admHead('helpdesk','One continuous conversation with EMS support.')+`
  <div class="adm-chat">
    <header class="adm-chat-head"><div><h3>HelpDesk</h3><p class="adm-desc">The whole conversation stays in this one chat with the EMS owner.</p></div><span class="adm-badge adm-t-rose" id="admUnread" hidden></span></header>
    <div class="adm-msgs" id="admMsgs">${SKEL.msgs(4)}</div>
    <form class="adm-composer" id="admForm"><textarea id="admInput" rows="2" placeholder="Describe your issue or question…"></textarea><button id="admSend" type="submit" class="adm-btn adm-btn-primary">Send</button></form>
  </div>`;
  const draw=async(mark=true)=>{
    const d=await api('helpdesk');
    const box=$('#admMsgs');
    box.innerHTML=d.messages.length?d.messages.map(m=>`<div class="adm-msg ${m.sender_type==='admin'?'me':'them'}"><div class="adm-msgbody">${esc(m.content).replace(/\n/g,'<br>')}</div><span class="adm-msgtime">${moneyT(m.created_at)}</span></div>`).join(''):`<div class="adm-chatempty"><b>Welcome to HelpDesk</b><p>Send a message and the EMS owner will reply here. The whole conversation stays in this one chat.</p></div>`;
    box.scrollTop=box.scrollHeight;
    const u=$('#admUnread');if(u){u.textContent=d.unread+' new';u.hidden=d.unread===0}
    const b=$('#ahbBadge');if(b){b.textContent=d.unread;b.hidden=d.unread===0}
    if(mark&&d.messages.some(m=>m.sender_type==='owner'&&!m.read_by_admin))await api('helpdesk',{method:'PATCH',body:'{}'}).catch(()=>{});
  };
  await draw();
  $('#admForm').onsubmit=async e=>{e.preventDefault();const input=$('#admInput'),content=input.value.trim();if(!content)return;const btn=$('#admSend');btn.disabled=true;try{await api('helpdesk',{method:'POST',body:JSON.stringify({content})});input.value='';await draw(false)}catch(err){toast(err.message)}finally{btn.disabled=false;input.focus()}};
}

async function premiumAddons(){
  const d=await api('addons'),now=Date.now(),ent=d.entitlement||null,purchases=d.purchases||[];
  const cartKeys=()=>addonCart.map(i=>i.addon_key);
  function statusOf(x){
    if(!x.enabled)return {key:'disabled',label:'Inactive',cls:'off'};
    if(ent&&((x.addon_key==='connectx'&&ent.connectx_enabled)||(x.addon_key==='zudo'&&ent.zudo_enabled)||(x.addon_key==='business_health'&&ent.business_health_enabled)||(x.addon_key==='truebill'&&ent.truebill_enabled)||(x.addon_key==='vaultium'&&Number(ent.vaultium_gb||0)>0)))return {key:'included',label:'Included in license',cls:'inc'};
    const act=purchases.find(p=>p.addon_key===x.addon_key&&p.status==='active'&&new Date(p.expires_at)>now);
    if(act)return {key:'active',label:'Active until '+new Date(act.expires_at).toLocaleDateString(),cls:'act'};
    const pend=purchases.find(p=>p.addon_key===x.addon_key&&p.status==='pending');
    if(pend)return {key:'pending',label:'Pending review',cls:'pend'};
    if(cartKeys().includes(x.addon_key))return {key:'incart',label:'In cart',cls:'cart'};
    return {key:'buy',label:'Available',cls:'ok'};
  }
  function buttonFor(st){return st.key==='incart'?'In cart':st.key==='included'?'Included':st.key==='active'?'Active':st.key==='pending'?'Pending':st.key==='disabled'?'Inactive':'Add to cart';}
  const money=v=>Number(v||0).toLocaleString('en-BD');
  const stTone=st=>({ok:'sky',act:'emerald',pend:'amber',inc:'violet',cart:'violet',off:'zinc'}[st]||'zinc');
  const included=ent?['connectx_enabled','zudo_enabled','business_health_enabled','truebill_enabled'].filter(k=>ent[k]).length+(Number(ent.vaultium_gb||0)>0?1:0):0;
  const draw=()=>{
    const sub=addonCart.reduce((n,i)=>n+i.validity_days*i.daily_limit*i.unit_price,0);
    const discount=addonCoupon?Math.round(sub*addonCoupon.percent_off)/100:0;
    const grand=sub-discount;
    $('#page').innerHTML=admHead('addons','Optional paid services on top of your license plan. The EMS owner reviews each purchase request.')+`
    <div class="adm-grid adm-kpis">
      ${admKpi('gem','violet','In license',included,'add-ons included by plan')}
      ${admKpi('sparkles','emerald','Active',purchases.filter(p=>p.status==='active'&&new Date(p.expires_at)>now).length,'purchased add-ons running')}
      ${admKpi('clock','amber','Pending',purchases.filter(p=>p.status==='pending').length,'awaiting EMS review')}
      ${admKpi('cart','sky','In cart',addonCart.length,'ready to check out')}
    </div>
    <div class="adm-shop">
      <div class="adm-addons">${d.settings.map(x=>{const st=statusOf(x);return `<article class="adm-addon">${addonArt(x)}<h3>${esc(addonName(x))}</h3><p>${esc(x.details||'')}</p><div class="adm-addon-foot"><span class="adm-badge adm-t-${stTone(st.cls)}">${esc(st.label)}</span><button class="adm-btn adm-btn-sm ${st.key==='buy'?'adm-btn-primary':''}" data-buy-addon="${x.addon_key}" ${st.key==='buy'?'':'disabled'}>${buttonFor(st)}</button></div></article>`}).join('')}</div>
      ${addonCart.length?`<aside class="adm-checkout"><h3>Checkout</h3>${addonCart.map((i,n)=>`<div class="adm-cartitem"><span><b>${esc(addonName(i))}</b><small>${addonIsVault(i)?`${i.daily_limit} GB · ${i.validity_days} month${i.validity_days>1?'s':''}`:addonNoLimit(i)?`${i.validity_days} days`:`${i.daily_limit}/day · ${i.validity_days} days`}</small></span><b>${money(i.validity_days*i.daily_limit*i.unit_price)} BDT</b><button type="button" class="adm-btn adm-btn-ghost adm-btn-sm" data-remove-cart="${n}" title="Remove" aria-label="Remove from cart">×</button></div>`).join('')}<div class="adm-carttotals"><p><span>Subtotal</span><b id="addonSub">${money(sub)} BDT</b></p><div class="adm-couponrow"><input id="addonCoupon" placeholder="Coupon code" ${addonCoupon?`value="${esc(addonCoupon.code)}" readonly`:''}>${addonCoupon?`<button type="button" id="addonCouponClear" class="adm-btn adm-btn-soft adm-btn-sm">Clear</button>`:`<button type="button" id="addonCouponApply" class="adm-btn adm-btn-soft adm-btn-sm">Apply</button>`}</div>${addonCoupon?`<p><span>Coupon (${esc(addonCoupon.code)} −${addonCoupon.percent_off}%)</span><b>−${money(discount)} BDT</b></p>`:''}<p class="grand"><span>Grand Total</span><b id="addonGrand">${money(grand)} BDT</b></p></div>${d.payment_info?`<div class="adm-payinfo"><span class="adm-kicker">Payment instructions</span><p>${esc(d.payment_info).replace(/\n/g,'<br>')}</p></div>`:''}<div class="adm-grid2"><label>Payment method<select id="addonPay"><option value="bkash">bKash</option><option value="nagad">Nagad</option></select></label><label>Payment number<input id="addonPayNumber" placeholder="Required" required></label></div><label>Transaction ID<input id="addonTrx" placeholder="Required" required></label><button type="button" id="addonConfirm" class="adm-btn adm-btn-primary">Confirm purchase</button></aside>`:''}
    </div>
    <section class="adm-panel">
      <div class="adm-panel-head"><div><h3>Purchase history</h3><p class="adm-desc">Every add-on purchase request, with verification status and expiry.</p></div></div>
      ${purchases.length?`<div class="adm-tw"><table><thead><tr><th>Add-on</th><th>Days</th><th>Daily limit</th><th>Amount</th><th>Discount</th><th>Payable</th><th>Payment</th><th>Transaction ID</th><th>Status</th><th>Expiry</th></tr></thead><tbody>${purchases.map(p=>`<tr><td>${esc(ADDON_NAMES[p.addon_key]||p.addon_key)}</td><td class="adm-num">${p.validity_days}</td><td class="adm-num">${p.addon_key==='truebill'?'—':p.addon_key==='vaultium'?p.daily_limit+' GB':p.daily_limit}</td><td class="adm-num">${money(p.amount)} BDT</td><td class="adm-num">${Number(p.discount_amount||0)?'−'+money(p.discount_amount)+' BDT':'—'}</td><td><b>${money(Math.max(0,Number(p.amount||0)-Number(p.discount_amount||0)))} BDT</b></td><td>${esc(p.payment_method)}<br><small>${esc(p.payment_number)}</small></td><td><code>${esc(p.transaction_id)}</code></td><td>${admBadge(esc(p.status),({act:'emerald',pend:'amber',rej:'rose',exp:'zinc'}[addonBadgeCls(p.status)])||'zinc')}</td><td class="adm-num">${p.expires_at?new Date(p.expires_at).toLocaleDateString():'—'}</td></tr>`).join('')}</tbody></table></div>`:admEmpty('No purchases yet.')}
    </section>`;
    document.querySelectorAll('[data-buy-addon]').forEach(b=>b.onclick=()=>addonCartModal(d.settings.find(x=>x.addon_key===b.dataset.buyAddon),draw));
    document.querySelectorAll('[data-remove-cart]').forEach(b=>b.onclick=()=>{addonCart.splice(+b.dataset.removeCart,1);addonCoupon=null;draw()});
    const applyBtn=$('#addonCouponApply');
    if(applyBtn)applyBtn.onclick=async()=>{try{const r=await api('addons/coupon?code='+encodeURIComponent($('#addonCoupon').value));addonCoupon={code:r.code,percent_off:r.percent_off};toast('Coupon applied: −'+r.percent_off+'%');}catch(e){addonCoupon=null;toast(e.message)}draw()};
    const clearBtn=$('#addonCouponClear');
    if(clearBtn)clearBtn.onclick=()=>{addonCoupon=null;draw()};
    const conf=$('#addonConfirm');
    if(conf)conf.onclick=async()=>{const payMethod=$('#addonPay').value,payNumber=$('#addonPayNumber').value.trim(),trx=$('#addonTrx').value.trim();if(!addonCart.length)return toast('Your cart is empty.');if(!payNumber)return toast('Payment number is required.');if(!trx)return toast('Transaction ID is required.');try{await api('addon-checkout',{method:'POST',body:JSON.stringify({items:addonCart,payment_method:payMethod,payment_number:payNumber,transaction_id:trx,coupon:addonCoupon?addonCoupon.code:''})});addonCart=[];addonCoupon=null;toast('Purchase request submitted.');premiumAddons()}catch(e){toast(e.message)}};
  };
  draw();
}

function addonCartModal(x,refresh){
  const noLimit=addonNoLimit(x), isVault=addonIsVault(x);
  const e=admModal(esc(addonName(x)),`<form class="adm-form"><p>${esc(x.details||'')}</p><p class="adm-desc">${isVault?'Price = months × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT (GB is your storage allowance)':noLimit?'Price = validity days × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT':'Price = validity days × daily limit × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT'}</p><div class="adm-grid2">${isVault?`<label>Storage (GB)<input id="agb" type="number" min="${x.min_daily_limit}" max="${x.max_daily_limit}" value="${x.min_daily_limit}" required></label><label>Months<input id="am" type="number" min="${x.min_days}" max="${x.max_days}" value="${x.min_days}" required></label>`:`<label>Validity days<input id="ad" type="number" min="${x.min_days}" max="${x.max_days}" value="${x.min_days}" required></label>${noLimit?'':`<label>Daily limit<input id="al" type="number" min="${x.min_daily_limit}" max="${x.max_daily_limit}" value="${x.min_daily_limit}" required></label>`}`}</div><div class="adm-carttotals"><p class="grand"><span>Total</span><b id="at"></b></p></div><div class="adm-form-actions"><button class="adm-btn adm-btn-primary">Add to cart</button></div></form>`);
  const calc=()=>{let total;if(isVault){total=+$('#am').value*Number(x.unit_price)}else{const days=+$('#ad').value,limit=noLimit?1:+$('#al').value;total=days*limit*Number(x.unit_price)}$('#at').textContent=total.toLocaleString('en-BD')+' BDT'};
  calc();if(isVault){$('#agb').oninput=calc;$('#am').oninput=calc}else{$('#ad').oninput=calc;if(!noLimit)$('#al').oninput=calc}
  e.querySelector('form').onsubmit=v=>{v.preventDefault();let days,limit;if(isVault){days=+$('#am').value;limit=+$('#agb').value;if(days<x.min_days||days>x.max_days)return toast('Months must be between '+x.min_days+' and '+x.max_days+'.');if(limit<x.min_daily_limit||limit>x.max_daily_limit)return toast('Storage must be between '+x.min_daily_limit+' and '+x.max_daily_limit+' GB.')}else{days=+$('#ad').value;if(days<x.min_days||days>x.max_days)return toast('Validity days must be between '+x.min_days+' and '+x.max_days+'.');limit=1;if(!noLimit){limit=+$('#al').value;if(limit<x.min_daily_limit||limit>x.max_daily_limit)return toast('Daily limit must be between '+x.min_daily_limit+' and '+x.max_daily_limit+'.')}}addonCart=addonCart.filter(i=>i.addon_key!==x.addon_key);addonCart.push({addon_key:x.addon_key,title:x.title,validity_days:days,daily_limit:limit,unit_price:Number(x.unit_price)});addonCoupon=null;e.remove();refresh()};
}


async function ownerTrueBill(){
  const [settings,scans]=await Promise.all([api('platform/addons'),api('platform/truebill/scans').catch(()=>[])]);
  const tb=settings.find(x=>x.addon_key==='truebill');
  $('#page').innerHTML=obHead('truebill','TrueBill puts a scannable verification QR code on every invoice, so customers can confirm authenticity on the public site.',tb?'<button id="tbSetup" class="ob-btn ob-btn-primary">Setup TrueBill</button>':'')+`
  <div class="ob-grid ob-kpis">
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('qr',tb&&tb.enabled?'emerald':'zinc')}<span class="ob-kicker">Status</span></div><strong class="ob-kpi-val">${tb&&tb.enabled?'Active':'Inactive'}</strong><span class="ob-kpi-foot">add-on for administrators</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('banknote','amber')}<span class="ob-kicker">Price per day</span></div><strong class="ob-kpi-val">${Number(tb?.unit_price||0).toLocaleString('en-BD')}<small> BDT</small></strong><span class="ob-kpi-foot">per shop license day</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('calendar','sky')}<span class="ob-kicker">Validity range</span></div><strong class="ob-kpi-val" style="font-size:15px">${tb?tb.min_days+' – '+tb.max_days+' days':'—'}</strong><span class="ob-kpi-foot">selectable at checkout</span></section>
    <section class="ob-card ob-kpi"><div class="ob-kpi-top">${obChip('shield','violet')}<span class="ob-kicker">Verification URL</span></div><strong class="ob-kpi-val" style="font-size:13px;word-break:break-all">${esc(tb?.url||'Public base URL')}</strong><span class="ob-kpi-foot">base for QR links</span></section>
  </div>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Verification scans</h3><p class="ob-desc">Recorded when someone scans a TrueBill QR code on an invoice.</p></div>${obBadge(scans.length+' scans','zinc')}</div>
    ${scans.length?`<div class="ob-tw"><table><thead><tr><th>Scanned at</th><th>Shop ID</th><th>Administrator ID</th><th>Invoice no.</th><th>Kind</th></tr></thead><tbody>${scans.map(s=>`<tr><td class="ob-num">${new Date(s.scanned_at).toLocaleString()}</td><td><code>${esc(s.shop_code||'—')}</code></td><td><code>${esc(s.admin_code||'—')}</code></td><td>${esc(s.invoice_number)}</td><td>${esc(s.invoice_kind||'—')}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No scans yet.')}
  </section>`;
  if(tb)$('#tbSetup').onclick=()=>addonSetup(tb);
}
async function ownerAddons(){
  const [settings,purchases]=await Promise.all([api('platform/addons'),api('platform/addon-purchases')]);
  const money=v=>Number(v||0).toLocaleString('en-BD');
  const OB_ADDON_META={connectx:['mail','sky'],zudo:['sparkles','violet'],business_health:['activity','cyan'],truebill:['qr','emerald'],vaultium:['package','amber']};
  $('#page').innerHTML=obHead('addons','Configure the premium add-on catalogue administrators can purchase, and review every checkout request.','<button id="addonCheckoutSetup" class="ob-btn ob-btn-primary">Payment &amp; coupon setup</button>')+`
  <div class="ob-addons">${settings.map(x=>{const [icon,tone]=OB_ADDON_META[x.addon_key]||['gem','violet'];return `<article class="ob-addon">
    <div class="ob-addon-art ob-dots">${x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" onerror="this.remove()">`:obChip(icon,tone)}</div>
    <h3>${esc(addonName(x))}</h3>
    <p>${esc(x.details||'Configure this add-on.')}</p>
    <div class="ob-addon-foot">${obBadge(x.enabled?'Active':'Inactive',x.enabled?'emerald':'zinc')}<button class="ob-btn ob-btn-soft ob-btn-sm" data-addon-setup="${esc(x.addon_key)}">Setup</button></div>
  </article>`}).join('')}</div>
  <section class="ob-panel">
    <div class="ob-panel-head"><div><h3>Purchase requests</h3><p class="ob-desc">Verify the payment claim in your own bKash / Nagad statement before approving.</p></div>${obBadge(purchases.length+' requests','zinc')}</div>
    ${purchases.length?`<div class="ob-tw"><table><thead><tr><th>Admin</th><th>Add-on</th><th>Days</th><th>Daily limit</th><th>Amount</th><th>Discount</th><th>Payable</th><th>Payment</th><th>Transaction ID</th><th>Coupon</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>${purchases.map(x=>`<tr><td>${esc(x.administrators?.name||'—')}<br><small class="ob-sub">${x.administrators?.admin_code?('#'+esc(x.administrators.admin_code)):''}</small></td><td>${esc(ADDON_NAMES[x.addon_key]||x.addon_key)}</td><td class="ob-num">${x.validity_days}</td><td class="ob-num">${x.addon_key==='vaultium'?x.daily_limit+' GB':x.daily_limit}</td><td class="ob-num">${money(x.amount)} BDT</td><td class="ob-num">${Number(x.discount_amount||0)?'−'+money(x.discount_amount)+' BDT':'—'}</td><td class="ob-num"><b>${money(Math.max(0,Number(x.amount||0)-Number(x.discount_amount||0)))} BDT</b></td><td>${esc(x.payment_method)}<br><small class="ob-sub">${esc(x.payment_number)}</small></td><td><code>${esc(x.transaction_id)}</code></td><td>${esc(x.coupon_code||'—')}</td><td class="ob-num">${new Date(x.created_at).toLocaleDateString()}</td><td>${obBadge(esc(x.status),({act:'emerald',pend:'amber',rej:'rose',exp:'zinc'})[addonBadgeCls(x.status)||'zinc'])}</td><td class="ob-actions">${x.status==='pending'?`<button class="ob-btn ob-btn-primary ob-btn-sm" data-addon-review="${x.id}" data-status="active">Approve</button><button class="ob-btn ob-btn-danger ob-btn-sm" data-addon-review="${x.id}" data-status="rejected">Reject</button>`:'<span class="ob-checked">Reviewed</span>'}</td></tr>`).join('')}</tbody></table></div>`:obEmpty('No purchase requests yet.')}
  </section>`;
  $('#addonCheckoutSetup').onclick=async()=>{try{const d=await api('platform/addon-checkout');const e=obModal('Payment &amp; coupon setup',`
    <form class="ob-form" id="obPayForm">
      <label>Checkout payment instructions<textarea name="payment_info" rows="3">${esc(d.settings?.payment_info||'')}</textarea></label>
      <button class="ob-btn ob-btn-primary">Save payment instructions</button>
    </form>
    <hr class="ob-hr">
    <div class="ob-coupons">
      <p class="ob-kicker">Coupon codes</p>
      <div id="obCouponList" class="ob-couponlist"></div>
      <form class="ob-couponadd" id="cpAddForm">
        <input name="code" placeholder="COUPON CODE" maxlength="20">
        <input name="percent_off" type="number" min="1" max="100" placeholder="%">
        <button type="submit" class="ob-btn ob-btn-soft">Add coupon</button>
      </form>
    </div>`);
    const renderCoupons=()=>{const box=e.querySelector('#obCouponList');box.innerHTML=d.coupons.length?d.coupons.map(c=>`<div class="ob-coupon ${c.active?'':'off'}"><div class="ob-couponcode"><b>${esc(c.code)}</b><small>${c.percent_off}% off</small></div><div class="ob-couponactions"><button type="button" class="ob-btn ob-btn-soft ob-btn-sm" data-cp-toggle="${esc(c.code)}">${c.active?'Active':'Inactive'}</button><button type="button" class="ob-btn ob-btn-danger ob-btn-sm" data-cp-del="${esc(c.code)}">Delete</button></div></div>`).join(''):'<p class="ob-note">No coupons yet.</p>';box.querySelectorAll('[data-cp-toggle]').forEach(b=>b.onclick=async()=>{const code=b.dataset.cpToggle,cur=d.coupons.find(c=>c.code===code);try{await api('platform/addon-coupons',{method:'PATCH',body:JSON.stringify({code,active:!cur.active})});cur.active=!cur.active;renderCoupons();toast('Coupon '+(cur.active?'activated':'deactivated')+'.')}catch(err){toast(err.message)}});box.querySelectorAll('[data-cp-del]').forEach(b=>b.onclick=async()=>{const code=b.dataset.cpDel;if(!confirm('Delete coupon '+code+'?'))return;try{await api('platform/addon-coupons?code='+encodeURIComponent(code),{method:'DELETE'});d.coupons=d.coupons.filter(c=>c.code!==code);renderCoupons();toast('Coupon deleted.')}catch(err){toast(err.message)}})};renderCoupons();
    e.querySelector('#obPayForm').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));try{await api('platform/addon-checkout',{method:'PATCH',body:JSON.stringify({payment_info:b.payment_info})});toast('Payment instructions saved.')}catch(err){toast(err.message)}};
    e.querySelector('#cpAddForm').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));try{const x=await api('platform/addon-coupons',{method:'POST',body:JSON.stringify({code:b.code,percent_off:+b.percent_off,active:true})});d.coupons.unshift(x);renderCoupons();ev.target.reset();toast('Coupon added.')}catch(err){toast(err.message)}}
  }catch(err){toast(err.message)}};
  document.querySelectorAll('[data-addon-setup]').forEach(b=>b.onclick=()=>addonSetup(settings.find(x=>x.addon_key===b.dataset.addonSetup)));
  document.querySelectorAll('[data-addon-review]').forEach(b=>b.onclick=async()=>{try{await api('platform/addon-purchases',{method:'PATCH',body:JSON.stringify({id:b.dataset.addonReview,status:b.dataset.status})});toast('Purchase reviewed.');ownerAddons()}catch(e){toast(e.message)}});
}
async function ownerHelpdesk(){
  const moneyT=v=>new Date(v).toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  let list=[],currentAdmin=null;
  const convMessages=m=>m.length?m.map(x=>`<div class="ob-msg ${x.sender_type==='admin'?'them':'me'}"><div class="ob-msgbody">${esc(x.content).replace(/\n/g,'<br>')}</div><span class="ob-msgtime">${moneyT(x.created_at)}</span></div>`).join(''):'<div class="ob-chatempty"><b>No messages yet</b><p>Say hello to start the conversation.</p></div>';
  const renderList=()=>{
    $('#hdList').innerHTML=list.length?list.map(a=>`<button class="ob-chat-item ${currentAdmin===a.id?'on':''}" data-hd-admin="${a.id}"><span class="ob-chat-ava">${esc((a.name||'?').slice(0,1).toUpperCase())}</span><span class="ob-chat-meta"><b>${esc(a.name)}</b><small>#${esc(a.admin_code||'—')} · ${esc(a.email||'')}</small><em>${a.last_message?esc(a.last_message.slice(0,46)):'No messages yet'}</em></span>${a.unread?`<span class="ob-chat-badge">${a.unread}</span>`:''}</button>`).join(''):'<p class="ob-note">No administrators yet.</p>';
    document.querySelectorAll('#hdList [data-hd-admin]').forEach(x=>x.onclick=()=>openChat(x.dataset.hdAdmin));
  };
  const openChat=async adminId=>{
    currentAdmin=adminId;
    const a=list.find(x=>x.id===adminId);
    const right=$('#hdConv');
    right.innerHTML=`<div class="ob-chat-head"><div><h3>${esc(a?.name||'Administrator')}</h3><small>#${esc(a?.admin_code||'—')} · ${esc(a?.email||'')}</small></div>${obBadge('Direct line','violet')}</div><div class="ob-msgs" id="hdConvMsgs">${SKEL.msgs(4)}</div><form class="ob-composer" id="hdConvForm"><textarea id="hdConvInput" rows="2" placeholder="Reply to this administrator…"></textarea><button type="submit" class="ob-btn ob-btn-primary">Send</button></form>`;
    renderList();
    await api('platform/helpdesk/read',{method:'POST',body:JSON.stringify({adminId})}).catch(()=>{});
    let d;
    try{d=await api('platform/helpdesk/conversation/'+adminId)}catch(err){toast(err.message);return}
    const msgs=$('#hdConvMsgs');msgs.innerHTML=convMessages(d.messages);msgs.scrollTop=msgs.scrollHeight;
    $('#hdConvForm').onsubmit=async ev=>{ev.preventDefault();const input=$('#hdConvInput'),content=input.value.trim();if(!content)return;try{await api('platform/helpdesk/send',{method:'POST',body:JSON.stringify({adminId,content})});input.value='';const u=await api('platform/helpdesk/conversation/'+adminId);$('#hdConvMsgs').innerHTML=convMessages(u.messages);const box=$('#hdConvMsgs');box.scrollTop=box.scrollHeight}catch(err){toast(err.message)}};
  };
  list=await api('platform/helpdesk');
  $('#page').innerHTML=obHead('helpdesk','A direct support line between the EMS owner and every administrator.')+`
  <section class="ob-chat">
    <aside class="ob-chat-list">
      <div class="ob-chat-listhead"><h3>Administrators</h3><input id="hdSearch" placeholder="Search…"></div>
      <div class="ob-chat-items" id="hdList">${SKEL.list(4)}</div>
    </aside>
    <section class="ob-chat-conv" id="hdConv">
      <div class="ob-chatempty"><b>Select an administrator</b><p>Choose a conversation on the left to view and reply to their messages.</p></div>
    </section>
  </section>`;
  const totalUnread=list.reduce((n,a)=>n+a.unread,0),b=$('#ohbBadge');if(b){b.textContent=totalUnread;b.hidden=totalUnread===0}
  $('#hdSearch').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#hdList .ob-chat-item').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q))};
  renderList();
}
async function ownerFactoryReset(){
  $('#page').innerHTML=obHead('factory-reset','Irreversible maintenance operation. Everything on the platform is deleted and default settings are re-seeded.')+`
  <section class="ob-panel ob-dangerzone">
    <div class="ob-panel-head"><div><h3>Factory reset EMS</h3><p class="ob-desc">This permanently deletes ALL data — administrators, shops, invoices, inventory, customers, suppliers, expenses, staff, licenses, add-ons, TrueBill scans, HelpDesk messages, Vaultium files, and all platform settings — then re-seeds the defaults. This cannot be undone.</p></div>${obChip('refresh','rose')}</div>
    <form class="ob-form" id="frForm">
      <label>Confirmation text<input id="frConfirm" placeholder="FACTORY RESET EMS"></label>
      <div><button id="frGo" class="ob-btn ob-btn-danger" type="button">Factory reset EMS</button></div>
    </form>
  </section>`;
  $('#frGo').onclick=async()=>{const c=$('#frConfirm').value.trim();if(!confirm('This permanently deletes ALL data. Continue?'))return;try{await api('platform/factory-reset',{method:'POST',body:JSON.stringify({confirmation:c})});toast('Factory reset complete.');logout()}catch(e){toast(e.message)}};
}
function addonSetup(x){
  const noLimit=addonNoLimit(x), isVault=addonIsVault(x);
  const e=obModal(esc(addonName(x))+' setup',`<form class="ob-form">
    <label>Title<input name="title" value="${esc(x.title||'')}" placeholder="${esc(ADDON_NAMES[x.addon_key]||'')}"></label>
    ${noLimit?`<label>Verification URL <span class="ob-sub">(base URL for QR codes)</span><input name="url" type="url" value="${esc(x.url||'')}" placeholder="https://ems.example.com"></label>`:''}
    <label>Image URL (PNG)<input name="image_url" type="url" value="${esc(x.image_url||'')}" placeholder="https://example.com/addon.png"></label>
    <label>Status<select name="enabled"><option value="true" ${x.enabled?'selected':''}>Active</option><option value="false" ${!x.enabled?'selected':''}>Inactive</option></select></label>
    <label>Details<textarea name="details" rows="2">${esc(x.details)}</textarea></label>
    <div class="ob-grid2">
      <label>Unit price${isVault?' (per month)':''}<input name="unit_price" type="number" step=".01" value="${x.unit_price}"></label>
      <label>Minimum ${isVault?'months':'days'}<input name="min_days" type="number" value="${x.min_days}"></label>
      <label>Maximum ${isVault?'months':'days'}<input name="max_days" type="number" value="${x.max_days}"></label>
      ${noLimit?'':`<label>Minimum ${isVault?'GB':'daily limit'}<input name="min_daily_limit" type="number" value="${x.min_daily_limit}"></label><label>Maximum ${isVault?'GB':'daily limit'}<input name="max_daily_limit" type="number" value="${x.max_daily_limit}"></label>`}
    </div>
    <button class="ob-btn ob-btn-primary">Save setup</button>
  </form>`);
  e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));Object.assign(b,{addon_key:x.addon_key,title:b.title,url:noLimit?(b.url?String(b.url).trim():null):null,image_url:b.image_url?String(b.image_url).trim():null,enabled:b.enabled==='true',unit_price:+b.unit_price,min_days:+b.min_days,max_days:+b.max_days,min_daily_limit:noLimit?1:(+b.min_daily_limit||1),max_daily_limit:noLimit?1:(+b.max_daily_limit||1)});try{await api('platform/addons',{method:'PATCH',body:JSON.stringify(b)});e.remove();toast('Add-on setup saved.');ownerAddons()}catch(err){toast(err.message)}};
}
