const $=s=>document.querySelector(s), app=$('#app');let state=JSON.parse(localStorage.getItem('ems.session')||'null');const api=async(path,opt={})=>{let r=await fetch('/api/'+path,{...opt,headers:{'content-type':'application/json',...(state?{authorization:'Bearer '+state.token}:{}),...(opt.headers||{})}}),x=await r.json();if(!r.ok)throw Error(x.error||'Request failed');return x};
const apiUpload=async(path,formData)=>{let r=await fetch('/api/'+path,{method:'POST',headers:state?{authorization:'Bearer '+state.token}:{},body:formData});let x=await r.json();if(!r.ok)throw Error(x.error||'Upload failed');return x};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtAI=t=>{let s=esc(String(t??''));let lines=s.split('\n'),out=[],list=[];const flush=()=>{if(list.length){out.push('<ul class="aimd">'+list.map(x=>`<li>${x}</li>`).join('')+'</ul>');list=[]}};for(let line of lines){let t2=line.trim();if(!t2){flush();out.push('');continue}if(/^[-*•]\s/.test(t2)){list.push(t2.replace(/^[-*•]\s+/,''));continue}if(/^#{1,3}\s/.test(t2)){flush();let lvl=(t2.match(/^#+/)||[''])[0].length;out.push(`<b class="aimd-h${lvl}">${t2.replace(/^#+\s*/,'')}</b>`);continue}if(/^\d+[.)]\s/.test(t2)){list.push(t2.replace(/^\d+[.)]\s+/,''));continue}flush();out.push(t2)}flush();return out.map(x=>x===''?'<br>':x).join('').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')};
const modelOptions=(models,current)=>{if(!models)return `<option value="@cf/meta/llama-3.2-3b-instruct">Llama 3.2 3B (Cloudflare)</option>`;const groups={cf:[],gemini:[],groq:[],cerebras:[]};for(const [k,v] of Object.entries(models)){groups[v.provider]&&groups[v.provider].push([k,v.name])}const labels={cf:'Cloudflare Workers AI',gemini:'Google AI Studio (Gemini)',groq:'Groq',cerebras:'Cerebras'};let html='';for(const p of ['cf','gemini','groq','cerebras']){if(!groups[p].length)continue;html+=`<optgroup label="${labels[p]}">`+groups[p].map(([k,n])=>`<option value="${esc(k)}" ${k===current?'selected':''}>${esc(n)}</option>`).join('')+'</optgroup>'}return html};const money=x=>Number(x||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});const GB2=1024*1024*1024,MB2=1024*1024,KB2=1024;const invoiceMoney=x=>Number(x||0).toLocaleString('en-BD',{minimumFractionDigits:2});const ago=x=>{let m=Math.max(0,Math.floor((Date.now()-new Date(x))/60000));return m<60?m+'m ago':m<1440?Math.floor(m/60)+'h ago':Math.floor(m/1440)+'d ago'};
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
  const shell = (inner)=>`<header class="sitehead"><a class="wordmark" href="/"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></a><nav><a href="/#features">Features</a><a href="/#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><a href="/?page=contact">Contact</a><button class="secondary" id="adminLogin">Administrator login</button><button id="shopLogin">Shop login</button><button class="emslogin" id="emsLogin">EMS login</button></nav></header><main class="verifyPage">${inner}</main><footer class="sitefoot"><div class="wordmark"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></div><span>© ${new Date().getFullYear()} DoxTox. All rights reserved.</span><span><a href="/?page=contact">Contact</a> · <a href="/?page=terms">Terms & Conditions</a></span></footer><div class="authlayer" id="authlayer" hidden></div>`;
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
  const chrome=(inner,logoB)=>{const b=logoB;return `<header class="sitehead"><a class="wordmark" href="/"><b data-brand-name>${esc(b.product_name||'EMS V1')}</b><small>powered by <span data-powered-by>${esc(b.powered_by||'DoxTox')}</span></small></a><nav><a href="/#features">Features</a><a href="/#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><a href="/?page=contact">Contact</a><button class="secondary" id="publicAdmin">Administrator login</button><button id="publicShop">Shop login</button><button class="emslogin" id="publicEms">EMS login</button></nav></header><main class="publicPage">${inner}</main><footer><div class="wordmark"><b data-brand-name>${esc(b.product_name||'EMS V1')}</b><small>powered by <span data-powered-by>${esc(b.powered_by||'DoxTox')}</span></small></div><span>© ${new Date().getFullYear()} ${esc(b.powered_by||'DoxTox')}. All rights reserved.</span><span><a href="/?page=contact">Contact</a> · <a href="/?page=terms">Terms & Conditions</a></span></footer><div class="authlayer" id="authlayer" hidden></div>`};
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

function login(){let verifyToken=new URLSearchParams(location.search).get('verify'),publicRoute=new URLSearchParams(location.search).get('page');if(verifyToken)return verificationPage(verifyToken);if(publicRoute)return publicPage(publicRoute);app.innerHTML=`<header class="sitehead"><a class="wordmark" href="#top"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></a><nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="/?page=about">About</a><a href="/?page=blog">Blog</a><button class="secondary" id="adminLogin">Administrator login</button><button id="shopLogin">Shop login</button><button class="emslogin" id="emsLogin">EMS login</button></nav></header><main id="top" class="website"><section class="hero"><div><p class="eyebrow">MULTI-SHOP MANAGEMENT, MADE SIMPLE</p><h1>Run every part of your shop with clarity.</h1><p class="lead">EMS V1 gives owners and staff one secure place for inventory, purchases, sales, expenses, customers, and store operations.</p><div class="heroactions"><button id="heroStart">Create administrator account</button><button class="secondary" id="heroShop">Shop staff login</button></div><div class="trust"><span>✓ Custom secure credentials</span><span>✓ Cloud-based access</span><span>✓ BDT pricing</span></div></div><div class="heroart"><div class="screen"><div class="screenbar"><i></i><i></i><i></i></div><p>Today at a glance</p><div class="artcards"><b>৳ 24,860<small>Sales today</small></b><b>18<small>Low-stock items</small></b></div><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span>Sales performance</span></div></div></section><section class="logos"><span>Built for retail shops</span><span>Grocery &amp; general stores</span><span>Pharmacy &amp; cosmetics</span><span>Electronics &amp; wholesale</span></section><section id="features" class="section"><p class="eyebrow">ONE SYSTEM, EVERYDAY OPERATIONS</p><h2>Everything a growing shop needs</h2><p class="sectionlead">Designed for shop owners who need accurate records, controlled staff access, and practical decisions—not complicated software.</p><div class="featuregrid"><article><div class="featureicon">${lucide('store')}</div><h3>Multi-store control</h3><p>Create and manage multiple stores from one administrator account. Track license status, activation, and connected devices per shop.</p></article><article><div class="featureicon">${lucide('receipt')}</div><h3>Sales &amp; purchase invoices</h3><p>Prepare invoices that calculate tax, discount, paid amount, and due automatically — with full payment and transaction details.</p></article><article><div class="featureicon">${lucide('package')}</div><h3>Live inventory</h3><p>Stock updates instantly when purchases or sales are posted. Low-stock indicators help you replenish before items run out.</p></article><article><div class="featureicon">${lucide('users')}</div><h3>Customers &amp; suppliers</h3><p>Keep contact details organized and quickly select a customer or supplier with a smart search when creating invoices.</p></article><article><div class="featureicon">${lucide('wallet')}</div><h3>Expense tracking</h3><p>Record shop expenses with paid and due amounts, so you always know exactly where your money is going.</p></article><article><div class="featureicon">${lucide('coins')}</div><h3>Due recovery</h3><p>Track outstanding dues on sales, purchases, and expenses — and record recoveries the moment customers pay.</p></article><article><div class="featureicon">${lucide('user-check')}</div><h3>Staff permissions</h3><p>Create individual staff accounts and control who can view, add, edit, or delete in each operational area.</p></article><article><div class="featureicon">${lucide('chart')}</div><h3>Business reports</h3><p>Get summary, sales, purchase, and expense reports with clear totals and profit figures for any date range.</p></article><article><div class="featureicon">${lucide('shield')}</div><h3>Traceable activity</h3><p>Record operational activity, device logins, attendance, and system errors for stronger accountability.</p></article><article class="premium"><div class="featureicon">${lucide('mail')}</div><em class="featuretag">Premium</em><h3>ConnectX</h3><p>Send professional business emails to customers and suppliers directly through your shop — with invoice attachments.</p></article><article class="premium"><div class="featureicon">${lucide('sparkles')}</div><em class="featuretag">Premium</em><h3>Zudo AI</h3><p>A read-only AI assistant that answers questions about your sales, purchases, inventory, customers, and dues.</p></article><article class="premium"><div class="featureicon">${lucide('activity')}</div><em class="featuretag">Premium</em><h3>AI Business Health</h3><p>Generate a business-health report with a score, risk findings, and practical AI recommendations for any period.</p></article><article class="premium"><div class="featureicon">${lucide('qr')}</div><em class="featuretag">Premium</em><h3>TrueBill</h3><p>Put a scannable QR code on every invoice so customers can verify authenticity with one scan.</p></article><article class="premium"><div class="featureicon">${lucide('msg')}</div><em class="featuretag">Premium</em><h3>HelpDesk</h3><p>A built-in messenger that connects you directly with EMS support for fast help whenever you need it.</p></article></div></section><section class="stats section"><div class="statsgrid"><div class="stat"><b>All-in-one</b><span>Inventory, sales, purchases, expenses, customers &amp; staff in one place</span></div><div class="stat"><b>Multi-shop</b><span>Manage every store from a single administrator account</span></div><div class="stat"><b>Real-time</b><span>Stock and totals update the moment you post a transaction</span></div><div class="stat"><b>Secure</b><span>Custom credentials, device tracking and full activity logs</span></div></div></section>
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
tag:'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>'
};
const lucide=n=>`<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[n]||LUCIDE.circle}</svg>`;
const menus=[['Dashboard','dashboard','dashboard'],['Suppliers','supplier','truck'],['Customers','customer','users'],['Inventory','inventory','package'],['Purchases','purchase','cart'],['Sales','sales','receipt'],['Expense','expense','wallet'],['Due Recover','due_recover','coins'],['Staff Manager','staff','user-check'],['Report','report','chart'],['Settings','settings','settings'],['ConnectX','connectx','mail'],['Zudo','zudo','sparkles'],['Vaultium','vaultium','file']];const canAccess=(section,action='view')=>{if(state?.role==='admin'||state?.adminAccess)return true;if(state?.readOnly&&action!=='view'&&!((section==='connectx'&&action==='add')||(section==='zudo'&&action==='add')))return false;if(section==='dashboard'&&action==='view')return true;let p=state?.permissions||{};return (p[section]||[]).includes(action)};function home(){if(state?.role==='staff'&&permissionSyncedFor!==state.token){Promise.all([api('me'),api('connectx/availability').catch(()=>({enabled:false})),api('zudo/availability').catch(()=>({enabled:false})),api('business-health/availability').catch(()=>({enabled:false,ever:false})),api('vaultium/availability').catch(()=>({enabled:false,ever:false}))]).then(([m,cx,zudo,bh,vault])=>{state.permissions=m.permissions||{};state.readOnly=!!m.readOnly;state.licenseExpired=!!m.licenseExpired;state.connectxEnabled=!!cx.enabled;state.connectxHistory=!!cx.history;state.zudoEnabled=!!zudo.enabled;state.zudoHistory=!!zudo.history;state.businessHealthEnabled=!!bh.enabled;state.businessHealthEver=!!bh.ever;state.vaultiumEnabled=!!vault.enabled;state.vaultiumEver=!!vault.ever;permissionSyncedFor=state.token;save(state);home()}).catch(e=>{toast(e.message);logout()});return}if(state?.role==='admin'&&entitlementSyncedFor!==state.token){api('admin/entitlement').then(x=>{state.licenseExpired=!!x.hasActivatedLicense&&!x.active;state.entitlement=x;entitlementSyncedFor=state.token;save(state);home()}).catch(e=>{toast(e.message);logout()});return}if(state.role==='owner')return ownerHome();let admin=state.role==='admin', visibleMenus=menus.filter(([,section])=>canAccess(section,'view')&&(section!=='connectx'||state.connectxEnabled||state.connectxHistory)&&(section!=='zudo'||state.zudoEnabled||state.zudoHistory)&&(section!=='vaultium'||state.vaultiumEnabled||state.vaultiumEver));app.innerHTML=`<div class="shell${admin?'':' dash2'}"><aside class="sidebar ${admin?'adminSidebar':''}"><div class="sidebarBrand"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small>${admin?'':`<em class="sidebarStore">${esc(state.store?.name||'')}</em>`}</div><nav class="nav">${admin?`<button data-page="profile"><span class="menuicon">${lucide('user')}</span>My Profile</button><button data-page="stores"><span class="menuicon">${lucide('store')}</span>Store Manage</button><button data-page="licenses"><span class="menuicon">${lucide('key')}</span>Licenses</button><button data-page="devices"><span class="menuicon">${lucide('devices')}</span>Devices</button><button data-page="helpdesk"><span class="menuicon">${lucide('msg')}</span>HelpDesk<span class="hdbadge" id="hbBadge" hidden></span></button><button data-page="addons"><span class="menuicon">${lucide('gem')}</span>Premium Add-Ons</button>`:visibleMenus.map(([x,,icon])=>`<button data-page="${x.toLowerCase().replaceAll(' ','-')}"><span class="menuicon">${lucide(icon)}</span>${x}</button>`).join('')}</nav>${admin?'':`<div class="sidebottom">${state.adminAccess?'<button class="secondary" id="returnAdmin">Return to admin</button>':''}<button class="logoutmenu" id="out">Logout</button></div>`}</aside><main class="main"><header class="top"><div class="topHeaderSpacer"></div><div class="shopTopActions"><span class="topUser"><span class="headerProfile">${esc(state.user.name).slice(0,1).toUpperCase()}</span>${esc(state.user.name)}</span>${!admin&&state.zudoEnabled&&canAccess('zudo','view')?'<button class="zudoTopButton" id="zudoTopButton" type="button" title="Open Zudo" aria-label="Open Zudo">✦</button>':''}${!admin&&canAccess('attendance','view')?'<button class="zudoTopButton" id="attTopButton" type="button" title="Attendance" aria-label="Attendance">✓</button>':''}${!admin&&(state.vaultiumEnabled||state.vaultiumEver)?'<button class="zudoTopButton" id="vaultTopButton" type="button" title="Vaultium" aria-label="Vaultium">🗄</button>':''}${admin?'<button class="secondary" id="out">Logout</button>':''}</div></header><section class="page" id="page"></section></main></div>`;$('#out').onclick=logout;api('public/branding').then(b=>{document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{});if($('#zudoTopButton'))$('#zudoTopButton').onclick=()=>page('zudo');if($('#attTopButton'))$('#attTopButton').onclick=()=>page('attendance');if($('#vaultTopButton'))$('#vaultTopButton').onclick=()=>page('vaultium');if($('#returnAdmin'))$('#returnAdmin').onclick=()=>{let r=JSON.parse(localStorage.getItem('ems.admin.return')||'null');if(r){save(r);localStorage.removeItem('ems.admin.return');home()}};document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>page(x.dataset.page));page(admin?'stores':(visibleMenus[0]?.[0]||'dashboard').toLowerCase().replaceAll(' ','-'));if(state.readOnly||state.licenseExpired)readOnlyNotice()}
function readOnlyNotice(){if(document.querySelector('.licenseExpiryModal'))return;let isAdmin=state?.role==='admin',exp=!!state.licenseExpired,e=document.createElement('div');e.className='modal licenseExpiryModal';e.innerHTML=`<section class="modalbox expiryNotice"><div class="expiryIcon">${exp?'!':'ⓘ'}</div><h2>${exp?'License expired':'Read-Only mode'}</h2><p>${exp?'Your administrator license has expired. To continue operating shops, creating invoices, changing data, or using ConnectX, purchase and activate a new license.':'This shop is currently in Read-Only mode. You can view records but cannot add, edit, or delete data.'}</p><p class="muted">${exp?'Your shop data and license history are safely preserved. Shops are currently operating in Read-Only mode.':'Contact your administrator to restore full access.'}</p>${isAdmin?'<button id="goLicenses">View license plans</button>':'<button id="closeExpiry">Continue</button>'}</section>`;document.body.append(e);if(isAdmin)$('#goLicenses').onclick=()=>{e.remove();page('licenses')};else $('#closeExpiry').onclick=()=>e.remove()}
function title(t,button='',middle=''){return `<div class="head"><div><h1>${t}</h1></div>${middle}${button}</div>`}async function page(p){document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===p));let el=$('#page');el.innerHTML='<p class="muted">Loading…</p>';try{if(p==='dashboard')return await dashboard();if(p==='profile')return await profile();if(p==='stores')return await stores();if(p==='licenses')return await licenses();if(p==='devices')return await devices();if(p==='helpdesk')return await helpdeskAdmin();if(p==='addons')return await premiumAddons();if(['suppliers','customers','inventory','expense','staff-manager'].includes(p))return await entity(p);if(p==='attendance')return await attendancePage();if(p==='salary')return await salaryPage();if(p==='vaultium')return await vaultiumPage();if(['purchases','sales'].includes(p))return await invoices(p);if(p==='due-recover')return await dueRecover();if(p==='report')return await report();if(p==='connectx')return await connectX();if(p==='zudo')return await zudo();if(p==='settings')return await settings();el.innerHTML=title(p.replaceAll('-',' '))+`<section class="panel"><p>This module is reserved for the next EMS update. It is intentionally not represented with fabricated records.</p></section>`}catch(e){el.innerHTML=`<section class="panel"><h2>Could not load this page</h2><p>${esc(e.message)}</p></section>`}}
/* ================================================================
   EMS OWNER CONSOLE — BaseCN-style UI (UI-only redesign)
   Replaces the legacy owner panel rendering. Every API call,
   endpoint, payload, permission and workflow is unchanged.
   ================================================================ */
const OC_PAGES=['overview','claims','shops','licenses','plans','administrators','connectx','zudo','truebill','vaultium','helpdesk','addons','branding','website-pages','blogs','contact-messages','factory-reset'];
const OC_NAV=[
 {h:'Overview',items:[['overview','Dashboard','dashboard']]},
 {h:'Business',items:[['claims','Payments & Claims','coins'],['shops','Shops','store'],['licenses','Licenses','shield'],['plans','Plans','list']]},
 {h:'Access',items:[['administrators','Administrators','users']]},
 {h:'Services',items:[['connectx','ConnectX','mail'],['zudo','Zudo AI','sparkles'],['truebill','TrueBill','qr'],['vaultium','Vaultium','file'],['helpdesk','HelpDesk','msg'],['addons','Premium Add-Ons','gem']]},
 {h:'Settings',items:[['branding','Branding','palette'],['website-pages','Website pages','file'],['blogs','Blogs','rss'],['contact-messages','Contact messages','inbox'],['factory-reset','Factory reset','refresh']]}
];
const OC_LABEL=Object.fromEntries(OC_NAV.flatMap(g=>g.items.map(([p,l])=>[p,l])));
const OC_SVG={
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
 alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
 info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
 out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
 chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
 sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
 moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
 eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
 user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
 send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
 refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
 key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
 mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
 msg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
 circle:'<circle cx="12" cy="12" r="10"/>'
};
const ocIcon=n=>`<svg class="oc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${OC_SVG[n]||LUCIDE[n]||OC_SVG.circle||''}</svg>`;
const ocAvTone=s=>{const tones=['','purple','blue','green','orange','rose','teal'];let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return tones[h%tones.length]};
const ocAv=s=>`<span class="oc-ava2 ${ocAvTone(s)}">${esc(String(s||'?').trim().slice(0,1).toUpperCase()||'?')}</span>`;
const ocPill=(cls,txt)=>({cls,txt});
const ocLicPill=st=>st==='active'?ocPill('ok','Active'):st==='pending'?ocPill('warn','Pending'):st==='rejected'?ocPill('err','Rejected'):ocPill('neu',String(st||'—'));
const ocAddonPill=st=>st==='active'?ocPill('ok','Active'):st==='pending'?ocPill('warn','Pending'):st==='rejected'?ocPill('err','Rejected'):st==='expired'?ocPill('neu','Expired'):ocPill('neu',String(st||'—'));
const ocDate=v=>{if(!v)return '—';try{return new Date(v).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}catch{return '—'}};
const ocDT=v=>{if(!v)return '—';try{return new Date(v).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return '—'}};
const ocView=html=>`<div class="oc-inner">${html}</div>`;
const ocHead=(title,sub='',actions='')=>`<div class="oc-ph"><div style="min-width:0"><h1>${title}</h1>${sub?`<p class="oc-psub">${sub}</p>`:''}</div>${actions?`<div class="oc-pacts">${actions}</div>`:''}</div>`;
const ocStat=(lbl,val,foot,icon,tone='accent',click='')=>`<div class="oc-stat${click?' clickable':''}"${click?` data-oc-go="${click}"`:''}><div class="oc-st"><span class="oc-lbl">${lbl}</span>${icon?`<span class="oc-sicon" style="background:var(--oc-${tone==='accent'?'accent-soft':tone==='ok'?'ok-soft':tone==='warn'?'warn-soft':tone==='err'?'err-soft':tone==='info'?'info-soft':'neu-soft'});color:var(--oc-${tone==='accent'?'accent':tone})">${icon}</span>`:''}</div><strong>${val}</strong>${foot?`<div class="oc-sfoot">${foot}</div>`:''}</div>`;
const ocEmpty=(ic,t,sub='')=>`<div class="oc-empty"><div class="oc-ebox">${ic||ocIcon('info')}</div><b>${t}</b>${sub?`<p>${sub}</p>`:''}</div>`;
const ocLoading=t=>`<div class="oc-loading"><span class="oc-spin"></span>${t||'Loading…'}</div>`;
const ocCall=(kind,html)=>`<div class="oc-call ${kind}"><span class="oc-cic">${kind==='warn'?ocIcon('alert'):kind==='danger'?ocIcon('alert'):kind==='ok'?ocIcon('check'):ocIcon('info')}</span><div>${html}</div></div>`;
const ocTblWrap=inner=>`<div class="oc-tblwrap">${inner}</div>`;
const ocSearch=(ph,extra='')=>`<div class="oc-search">${ocIcon('search')}<input class="oc-input" type="search" placeholder="${esc(ph)}"${extra}></div>`;
const ocEmptyTd=(n,html)=>`<tr><td colspan="${n}">${html||ocEmpty(ocIcon('search'),'Nothing found','Try a different filter or search term.')}</td></tr>`;

/* ---------- shared UI factories (dialogs, menus, confirm) ---------- */
function ocDialog(o){const root=document.createElement('div');root.className='oc-mask';
root.innerHTML=`<div class="oc-dlg ${o.size||''}" role="dialog" aria-modal="true"><div class="oc-dh">${o.icon?`<span class="oc-dic ${o.tone||'info'}">${o.icon}</span>`:''}<h2>${o.title}</h2><button type="button" class="oc-dx" aria-label="Close">×</button></div>${o.body!==undefined?`<div class="oc-db">${o.body}</div>`:''}<div class="oc-df ${o.footerLeft?'left':''}">${o.footer||''}</div></div>`;
document.body.appendChild(root);
const close=()=>{root.remove();document.removeEventListener('keydown',onKey)};
const onKey=e=>{if(e.key==='Escape')close()};
document.addEventListener('keydown',onKey);
root.querySelector('.oc-dx').onclick=()=>{close();o.onClose&&o.onClose()};
root.addEventListener('mousedown',e=>{if(e.target===root){close();o.onClose&&o.onClose()}});
return {root,close,el:root.querySelector('.oc-dlg'),body:root.querySelector('.oc-db')};
}
function ocConfirm(o){return new Promise(res=>{const d=ocDialog({title:o.title||'Are you sure?',icon:ocIcon(o.tone==='danger'||o.danger?'alert':'info'),tone:o.danger?'danger':'warn',size:'sm',
 body:`<p class="oc-dsub" style="margin:0">${o.message||''}</p>${o.detail?`<div style="margin-top:10px">${o.detail}</div>`:''}`,
 footer:`<button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-c="1">${o.cancelText||'Cancel'}</button><button type="button" class="oc-btn ${o.danger?'oc-btn-danger':'oc-btn-primary'} oc-btn-sm" data-oc-y="1">${o.confirmText||'Continue'}</button>`,
 onClose:()=>res(false)});
 d.el.querySelector('[data-oc-y]').onclick=()=>{d.close();res(true)};
 d.el.querySelector('[data-oc-c]').onclick=()=>{d.close();res(false)};
})}
function ocPop(anchor,html,align){const p=document.createElement('div');p.className='oc-menu'+(align==='left'?' left':'');p.innerHTML=html;document.body.appendChild(p);
const r=anchor.getBoundingClientRect();p.style.top=(r.bottom+6)+'px';if(align==='left')p.style.left=r.left+'px';else p.style.right=Math.max(8,window.innerWidth-r.right)+'px';
const kill=()=>{p.remove();document.removeEventListener('mousedown',kill,true);document.removeEventListener('keydown',esc,true)};
const esc=e=>{if(e.key==='Escape')kill()};
document.addEventListener('mousedown',kill,true);document.addEventListener('keydown',esc,true);
return p}
const ocGo=el=>{const p=el.closest('[data-oc-go]');if(p)ownerPage(p.dataset.ocGo)};
function ocBindGo(){document.querySelectorAll('[data-oc-go]').forEach(x=>{if(!x.dataset.ocBound){x.dataset.ocBound='1';x.onclick=()=>ownerPage(x.dataset.ocGo)}})}


/* ---------- Console shell ---------- */
function ocThemeInit(){const t=localStorage.getItem('ems.oc.theme')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.body.dataset.theme=t;return t}
function ocUserMenu(anchor){const m=document.createElement('div');
m.innerHTML=`
 <div class="oc-mhead"><b>${esc(state?.user?.name||'EMS Owner')}</b><small>${esc(state?.user?.email||'')} · Platform owner</small></div>
 <button type="button" class="oc-mi err" data-oc-u="out">${ocIcon('out')}Sign out</button>`;
const pop=ocPop(anchor,m.innerHTML,'right');pop.dataset.ocMenu='user';
pop.querySelectorAll('[data-oc-u]').forEach(b=>b.onclick=()=>{pop.remove();if(b.dataset.ocU==='out')logout()});
}
function ocThemeToggle(){const cur=document.body.dataset.theme==='dark';const next=cur?'light':'dark';document.body.dataset.theme=next;localStorage.setItem('ems.oc.theme',next);const b=$('#ocTheme');if(b)b.innerHTML=next==='dark'?ocIcon('sun'):ocIcon('moon')}
function ocSideToggle(){const shell=document.querySelector('.oc-shell');if(!shell)return;
 if(window.innerWidth>980){const c=shell.classList.toggle('oc-c');localStorage.setItem('ems.oc.collapsed',c?'1':'0')}
 else{const open=shell.classList.toggle('oc-m');let mask=document.querySelector('.oc-mask.mob');if(open&&!mask){mask=document.createElement('div');mask.className='oc-mask mob';mask.onclick=()=>{shell.classList.remove('oc-m');mask.remove()};document.body.appendChild(mask)}else if(!open&&mask)mask.remove()}}
function ownerHome(){
 ocThemeInit();
 const collapsed=localStorage.getItem('ems.oc.collapsed')==='1';
 document.body.classList.add('oc');
 /* safety: owner.css must be present for the console theme */
 try{
  const has=[...document.styleSheets].some(s=>s.href&&s.href.endsWith('owner.css'));
  if(!has){const l=document.createElement('link');l.rel='stylesheet';l.href='assets/css/owner.css';document.head.appendChild(l)}
 }catch(e){}
 const navHtml=OC_NAV.map(g=>`<div class="oc-navg">${esc(g.h)}</div>`+g.items.map(([p,l,ic])=>`<button class="oc-navitem" data-owner-page="${p}" title="${esc(l)}" aria-label="${esc(l)}"><span class="oc-ico">${lucide(ic)}</span><span class="oc-lbl">${esc(l)}</span>${p==='helpdesk'?`<span class="oc-badge" id="ohbBadge" hidden></span>`:''}${p==='claims'?`<span class="oc-badge" id="ocClaimsBadge" hidden></span>`:''}</button>`).join('')).join('');
 app.innerHTML=`<div class="oc-shell${collapsed?' oc-c':''}">
  <aside class="oc-side"><div class="oc-brand"><span class="oc-logo" data-brand-mark="1">E</span><div class="oc-bname"><b data-brand-name>EMS V1</b><small>powered by <span data-powered-by>DoxTox</span></small></div></div>
  <nav class="oc-nav">${navHtml}</nav>
  <div class="oc-sidefoot"><div class="oc-user" id="ocSideUser" title="${esc(state?.user?.email||'')}"><span class="oc-ava">${esc((state?.user?.name||'O').slice(0,1).toUpperCase())}</span><span class="oc-uinf"><b>${esc(state?.user?.name||'EMS Owner')}</b><small>${esc(state?.user?.email||'Platform owner')}</small></span></div>
  <button type="button" class="oc-sideout" id="ocSideOut" title="Sign out"><span class="oc-ico">${ocIcon('out')}</span><span class="oc-lbl">Sign out</span></button></div></aside>
  <div class="oc-main"><header class="oc-top"><button class="oc-burger" id="ocBurger" type="button" aria-label="Toggle navigation"><span></span><span></span><span></span></button>
   <div class="oc-crumb"><span class="oc-sub">Owner console</span><span class="oc-sep">/</span><b id="ocCrumb">Dashboard</b></div><div class="oc-topsp"></div>
   <div class="oc-topR"><button class="oc-theme" id="ocTheme" type="button" title="Toggle light / dark theme" aria-label="Toggle theme">${document.body.dataset.theme==='dark'?ocIcon('sun'):ocIcon('moon')}</button>
   <button class="oc-avatar" id="ocUserBtn" type="button" title="Account menu"><span class="oc-ava">${esc((state?.user?.name||'O').slice(0,1).toUpperCase())}</span><span><span class="oc-uname">${esc(state?.user?.name||'Owner')}</span><span class="oc-urole">Platform owner</span></span><span class="oc-caret">${ocIcon('chev')}</span></button></div></header>
  <section class="oc-page" id="page"></section></div></div>`;
 $('#ocBurger').onclick=ocSideToggle;
 $('#ocTheme').onclick=ocThemeToggle;
 const openUserMenu=anchor=>{const open=document.querySelector('.oc-menu[data-oc-menu="user"]');if(open){open.remove();return}ocUserMenu(anchor)};
 $('#ocUserBtn').onclick=e=>{e.stopPropagation();openUserMenu($('#ocUserBtn'))};
 $('#ocSideOut').onclick=logout;
 document.querySelectorAll('.oc-navitem').forEach(x=>x.onclick=()=>{const p=x.dataset.ownerPage;if(window.innerWidth<=980)ocSideToggle();ownerPage(p)});
 api('public/branding').then(b=>{if(document.title.indexOf('|')<0)document.title=(b.website_name||'EMS V1')+' | Owner';document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=b.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=b.powered_by||'DoxTox')}).catch(()=>{});
 api('platform/helpdesk').then(list=>{const n=list.reduce((t,a)=>t+(a.unread||0),0),b=$('#ohbBadge');if(b){b.textContent=n;b.hidden=n===0}}).catch(()=>{});
 ownerPage('overview');
}

/* ---------- Page dispatcher (same routing + API as before) ---------- */
async function ownerPage(p){
 if(!OC_PAGES.includes(p))p='overview';
 document.querySelectorAll('[data-owner-page]').forEach(x=>x.classList.toggle('active',x.dataset.ownerPage===p));
 const cr=$('#ocCrumb');if(cr)cr.textContent=OC_LABEL[p]||'Dashboard';
 const el=$('#page');el.innerHTML=ocView(ocLoading('Loading platform data…'));
 try{
  const d=await api('platform/overview');
  if(p==='overview')return ownerOverview(d);
  if(p==='claims')return ownerClaims(d);
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
  if(p==='factory-reset')return ownerFactoryReset();
 }catch(e){
  el.innerHTML=ocView(ocCall('danger',`<b>Could not load platform control</b><div>${esc(e.message||'Request failed')}</div>`)+`<div style="display:flex;gap:9px"><button type="button" class="oc-btn oc-btn-secondary" id="ocRetry">${ocIcon('refresh')}Try again</button></div>`);
  const r=$('#ocRetry');if(r)r.onclick=()=>ownerPage(p);
 }
}

/* ---------- Dashboard (platform overview) ---------- */
function ownerOverview(d){
 const lic=d.licenses||[],pending=lic.filter(x=>x.status==='pending'),active=lic.filter(x=>x.status==='active');
 const revenue=active.reduce((t,x)=>t+Number(x.amount||0),0),pendingAmt=pending.reduce((t,x)=>t+Number(x.amount||0),0);
 const shops=d.stores||[],activeShops=shops.filter(x=>x.status==='active').length;
 const mon=v=>money(v);
 $('#page').innerHTML=ocView(ocHead('Dashboard','Platform overview of administrators, shops, licenses and payment claims.')+`
 <div class="oc-cards">
  ${ocStat('Administrators',d.admins.length,`${d.admins.filter(a=>a.active).length} active`,ocIcon('user'),'accent','administrators')}
  ${ocStat('Shops',shops.length,`${activeShops} active · ${shops.length-activeShops} other`,ocIcon('store'),'info','shops')}
  ${ocStat('Active licenses',active.length,`${pending.length} pending review`,ocIcon('shield'),'ok','licenses')}
  ${ocStat('Pending claims',pending.length,`৳ ${mon(pendingAmt)} awaiting verification`,ocIcon('alert'),pending.length?'warn':'neu','claims')}
 </div>
 ${pending.length?ocCall('warn',`<b>${pending.length} license payment claim${pending.length>1?'s':''} pending.</b> Approve only after verifying the bKash / Nagad transaction ID in the official merchant portal.`):ocCall('ok','<b>No pending license claims.</b> All submitted payments have been reviewed.')}
 <div class="oc-cards">
  ${ocStat('Collected (active)',`৳ ${mon(revenue)}`,`across ${active.length} active license${active.length===1?'':'s'}`,ocIcon('banknote'),'ok')}
  ${ocStat('Read-only shops',shops.filter(x=>x.status==='read_only').length,'operating with read-only access','','neu')}
  ${ocStat('Inactive shops',shops.filter(x=>x.status==='inactive').length,'blocked from sign-in','','neu')}
  ${ocStat('Rejected claims',lic.filter(x=>x.status==='rejected').length,'visible in the Licenses register','','neu')}
 </div>
 <div style="display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:18px;align-items:start" class="oc-dashgrid">
  <div class="oc-card"><div class="oc-cardhead"><div><h2>Pending license payments</h2><p>Review the queue in Payments &amp; Claims.</p></div>
   <button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-go="claims">Open queue ${ocIcon('chev')}</button></div>
   <div class="oc-cardbody">
   ${pending.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Claimed</th><th>Administrator</th><th>Shop</th><th class="num">Amount</th><th>Method</th><th>Transaction ID</th><th style="text-align:right">Action</th></tr></thead><tbody>
   ${pending.slice(0,6).map(x=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDate(x.created_at)}</td>
   <td><div class="oc-cellstack"><b>${esc(x.administrators?.name||'—')}</b><small><code class="oc-code">${esc(x.administrators?.admin_code||'—')}</code></small></div></td>
   <td>${esc(x.stores?.name||'<span class="oc-mut">License capacity</span>')}</td>
   <td class="num"><b>৳ ${mon(x.amount)}</b></td><td><span class="oc-tag">${esc(x.payment_method||'—')}</span><div class="oc-mut" style="font-size:11.5px">${esc(x.payment_number||'')}</div></td>
   <td><code class="oc-code">${esc(x.transaction_id||'—')}</code></td>
   <td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-appr="${x.id}">${ocIcon('check')}Approve</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-rej="${x.id}">Reject</button></div></td></tr>`).join('')}
   </tbody></table>`):ocEmpty(ocIcon('check'),'All caught up','No license payment claims are waiting for review.')}
   </div></div>
  <div style="display:grid;gap:18px">
   <div class="oc-card"><div class="oc-cardhead"><h2>Recent administrators</h2></div><div class="oc-cardbody" style="padding-top:12px">
    ${d.admins.slice(0,4).map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--oc-line2)"><span class="oc-ava2">${esc((a.name||'?').slice(0,1).toUpperCase())}</span><div style="flex:1;min-width:0"><b style="font-size:13px;display:block">${esc(a.name)}</b><small style="color:var(--oc-mut)">${esc(a.email||'')}</small></div><code class="oc-code">${esc(a.admin_code||'—')}</code></div>`).join('')||'<p class="oc-mut" style="margin:0">No administrators yet.</p>'}
   </div></div>
   <div class="oc-card"><div class="oc-cardhead"><h2>Latest shops</h2><button type="button" class="oc-btn oc-btn-ghost oc-btn-sm" data-oc-go="shops">All shops ${ocIcon('chev')}</button></div><div class="oc-cardbody" style="padding-top:12px">
    ${shops.slice(0,4).map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--oc-line2)"><span class="oc-ava2">${esc((s.name||'?').slice(0,1).toUpperCase())}</span><div style="flex:1;min-width:0"><b style="font-size:13px;display:block">${esc(s.name)}</b><small style="color:var(--oc-mut)">${esc(s.administrators?.name||'—')}</small></div><code class="oc-code">${esc(s.shop_code||'—')}</code>${ocPill(s.status).txt?`<span class="oc-pill ${s.status==='active'?'ok':s.status==='read_only'?'warn':'neu'}">${esc(s.status==='read_only'?'read-only':s.status)}</span>`:''}</div>`).join('')||'<p class="oc-mut" style="margin:0">No shops yet.</p>'}
   </div></div>
  </div>
 </div>`);
 bindLicActions(pending.map(x=>x.id));
 ocBindGo();
}
function bindLicActions(ids){document.querySelectorAll('[data-oc-appr]').forEach(b=>{const id=b.dataset.ocAppr;if(ids.includes(id))b.onclick=()=>ocLicenseReview(id,'active','claims')});document.querySelectorAll('[data-oc-rej]').forEach(b=>{const id=b.dataset.ocRej;if(ids.includes(id))b.onclick=()=>ocLicenseReview(id,'rejected','claims')})}

/* ---------- Payments & Claims ---------- */
async function ownerClaims(d){
 let [purchases]=await Promise.all([api('platform/addon-purchases').catch(()=>[])]);
 const lic=(d.licenses||[]),claims=lic.filter(x=>x.status==='pending'),addonPending=purchases.filter(x=>x.status==='pending');
 const mon=v=>money(v);let tab='license';
 const addonNameOf=x=>x.addon_key==='connectx'?'ConnectX':x.addon_key==='zudo'?'Zudo AI':x.addon_key==='business_health'?'AI Business Health':x.addon_key==='truebill'?'TrueBill':x.addon_key==='vaultium'?'Vaultium':x.addon_key||'—';
 const licRows=()=>claims.map(x=>`<tr><td style="white-space:nowrap" class="oc-mut">${ocDT(x.created_at)}</td>
  <td><div class="oc-cellstack"><b>${esc(x.administrators?.name||'—')}</b><small><code class="oc-code">${esc(x.administrators?.admin_code||'')}</code> · ${esc(x.administrators?.email||'')}</small></div></td>
  <td>${esc(x.stores?.name||'<span class="oc-mut">License capacity</span>')}</td>
  <td>${x.duration_months} months · ${x.max_stores||'—'} shop${Number(x.max_stores)>1?'s':''}</td>
  <td class="num"><b>৳ ${mon(x.amount)}</b></td>
  <td><span class="oc-tag">${esc(x.payment_method||'—')}</span><div class="oc-mut" style="font-size:11.5px">${esc(x.payment_number||'')}</div></td>
  <td><code class="oc-code">${esc(x.transaction_id||'—')}</code></td>
  <td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-appr="${x.id}">${ocIcon('check')}Approve</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-rej="${x.id}">Reject</button></div></td></tr>`).join('');
 const addonRows=()=>addonPending.map(x=>`<tr><td style="white-space:nowrap" class="oc-mut">${ocDT(x.created_at)}</td>
  <td><b>${esc(addonNameOf(x))}</b><div class="oc-mut" style="font-size:11.6px">${x.addon_key==='vaultium'?x.validity_days+' months · '+x.daily_limit+' GB':x.addon_key==='truebill'?x.validity_days+' days':x.validity_days+' days · '+x.daily_limit+'/day'}</div></td>
  <td><div class="oc-cellstack"><b>${esc(x.administrators?.name||'—')}</b><small><code class="oc-code">${esc(x.administrators?.admin_code||'')}</code></small></div></td>
  <td class="num"><b>৳ ${mon(x.amount)}</b>${Number(x.discount_amount)?`<div class="oc-mut" style="font-size:11.5px">− ${mon(x.discount_amount)} coupon</div>`:''}</td>
  <td class="num"><b>৳ ${mon(Math.max(0,Number(x.amount)-Number(x.discount_amount)))}</b></td>
  <td><span class="oc-tag">${esc(x.payment_method||'—')}</span><div class="oc-mut" style="font-size:11.5px">${esc(x.payment_number||'')}</div></td>
  <td><code class="oc-code">${esc(x.transaction_id||'—')}</code>${x.coupon_code?`<div class="oc-mut" style="font-size:11.5px">coupon ${esc(x.coupon_code)}</div>`:''}</td>
  <td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-addappr="${x.id}">${ocIcon('check')}Approve</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-addrej="${x.id}">Reject</button></div></td></tr>`).join('');
 const render=()=>{
  $('#page').innerHTML=ocView(ocHead('Payments & Claims','Verify submitted bKash / Nagad payments and approve or reject claims. Activation is automatic on approval — nothing else changes.',`<button type="button" class="oc-btn oc-btn-secondary" data-oc-refresh="1">${ocIcon('refresh')}Refresh</button>`)+`
  <div class="oc-tabs">
   <button type="button" class="oc-tab ${tab==='license'?'on':''}" data-oc-tab="license">License payments <span class="oc-cnt">${claims.length}</span></button>
   <button type="button" class="oc-tab ${tab==='addon'?'on':''}" data-oc-tab="addon">Add-on payments <span class="oc-cnt">${addonPending.length}</span></button>
  </div>
  <div class="oc-cards">
   ${ocStat('Pending license claims',claims.length,`৳ ${mon(claims.reduce((t,x)=>t+Number(x.amount),0))} total`,ocIcon('banknote'),'warn')}
   ${ocStat('Pending add-on claims',addonPending.length,`৳ ${mon(addonPending.reduce((t,x)=>t+Math.max(0,Number(x.amount)-Number(x.discount_amount)),0))} payable`,ocIcon('gem'),'warn')}
   ${ocStat('Approved this page','—','live register in Licenses','','ok','licenses')}
  </div>
  ${ocCall('warn','<b>Manual verification required.</b> Always confirm the transaction ID in the official bKash / Nagad merchant app or statement before approving. Approval activates the shop instantly and sets the license expiry date.')}
  ${tab==='license'?`<div class="oc-card is-flush"><div class="oc-cardhead"><div><h2>License payment claims</h2><p>New, renewal, upgrade and downgrade requests submitted by administrators.</p></div></div>
   <div class="oc-cardbody">${claims.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Claimed</th><th>Administrator</th><th>Shop</th><th>License</th><th class="num">Amount</th><th>Payment</th><th>Transaction ID</th><th style="text-align:right">Action</th></tr></thead><tbody>${licRows()}</tbody></table>`):ocEmpty(ocIcon('check'),'No pending license claims','When an administrator submits a payment claim it appears here for verification.')}</div></div>`
  :`<div class="oc-card is-flush"><div class="oc-cardhead"><div><h2>Add-on payment claims</h2><p>Premium add-on purchases (ConnectX, Zudo AI, AI Business Health, TrueBill, Vaultium) pending review.</p></div></div>
   <div class="oc-cardbody">${addonPending.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Claimed</th><th>Add-on</th><th>Administrator</th><th class="num">Amount</th><th class="num">Payable</th><th>Payment</th><th>Transaction ID</th><th style="text-align:right">Action</th></tr></thead><tbody>${addonRows()}</tbody></table>`):ocEmpty(ocIcon('check'),'No pending add-on claims','Add-on purchase requests from administrators appear here for review.')}</div></div>`}
  `);
  document.querySelectorAll('[data-oc-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.ocTab;render()});
  const rf=$('[data-oc-refresh]');if(rf)rf.onclick=()=>ownerPage('claims');
  document.querySelectorAll('[data-oc-appr]').forEach(b=>b.onclick=()=>ocLicenseReview(b.dataset.ocAppr,'active','claims'));
  document.querySelectorAll('[data-oc-rej]').forEach(b=>b.onclick=()=>ocLicenseReview(b.dataset.ocRej,'rejected','claims'));
  document.querySelectorAll('[data-oc-addappr]').forEach(b=>b.onclick=()=>ocAddonReview(b.dataset.ocAddappr,'active','claims'));
  document.querySelectorAll('[data-oc-addrej]').forEach(b=>b.onclick=()=>ocAddonReview(b.dataset.ocAddrej,'rejected','claims'));
  ocBindGo();
 };
 render();
 const badge=$('#ocClaimsBadge');if(badge){const n=claims.length+addonPending.length;badge.textContent=n;badge.hidden=n===0}
}
function ocLicenseReview(id,status,refresh){
 const approve=status==='active';
 const label=approve?'approve and activate':'reject';
 ocConfirm({title:approve?'Approve license payment?':'Reject license payment?',message:`Are you sure you want to ${label} this license payment request?`,danger:!approve,
  confirmText:approve?'Approve & activate':'Reject claim',cancelText:'Cancel',
  detail:approve?'<div class="oc-chk"><li><span class="oc-ch">'+ocIcon('check')+'</span>Transaction ID checked in the bKash / Nagad merchant portal</li><li><span class="oc-ch">'+ocIcon('check')+'</span>Sender number matches the payment number</li><li><span class="oc-ch">'+ocIcon('check')+'</span>Amount matches the requested license price</li></div>':''})
 .then(ok=>{if(!ok)return;(async()=>{try{
  await api('platform/license/'+id,{method:'PATCH',body:JSON.stringify({status,reviewNote:''})});
  toast(approve?'License approved and activated.':'License rejected.');
  ownerPage(refresh||'licenses');
 }catch(e){console.error(e);toast('License action failed: '+e.message)}})()});
}
async function reviewLicense(id,status){ocLicenseReview(id,status,'licenses')}
function ocAddonReview(id,status,refresh){
 const approve=status==='active';
 const label=approve?'approve':'reject';
 ocConfirm({title:approve?'Approve add-on purchase?':'Reject add-on purchase?',message:`Are you sure you want to ${label} this add-on payment request?`,danger:!approve,confirmText:approve?'Approve purchase':'Reject request',cancelText:'Cancel'})
 .then(ok=>{if(!ok)return;(async()=>{try{
  await api('platform/addon-purchases',{method:'PATCH',body:JSON.stringify({id,status})});
  toast('Add-on purchase '+(approve?'approved and activated.':'rejected.'));
  ownerPage(refresh||'addons');
 }catch(e){toast(e.message)}})()});
}

/* ---------- Licenses register ---------- */
function ownerLicenses(d){
 const lic=(d.licenses||[]);let filter='all',q='';
 const feats=x=>`<span class="oc-mut" style="white-space:nowrap">CX ${x.connectx_enabled?`<b>${x.connectx_daily_limit}</b>/d`:'—'}</span><span class="oc-mut" style="white-space:nowrap">Zudo ${x.zudo_enabled?'<b>Yes</b>':'—'}</span><span class="oc-mut" style="white-space:nowrap">AIBH ${x.business_health_enabled?'<b>Yes</b>':'—'}</span><span class="oc-mut" style="white-space:nowrap">TrueBill ${x.truebill_enabled?'<b>Yes</b>':'—'}</span><span class="oc-mut" style="white-space:nowrap">Vault ${Number(x.vaultium_gb||0)>0?`<b>${x.vaultium_gb} GB</b>`:'—'}</span>`;
 const counts={all:lic.length,pending:lic.filter(x=>x.status==='pending').length,active:lic.filter(x=>x.status==='active').length,rejected:lic.filter(x=>x.status==='rejected').length};
 const rows=()=>lic.filter(x=>(filter==='all'||x.status===filter)&&(!q||JSON.stringify([x.administrators?.name,x.stores?.name,x.payment_number,x.transaction_id,x.administrators?.admin_code]).toLowerCase().includes(q)));
 const render=()=>{
  const data=rows();
  $('#page').innerHTML=ocView(ocHead('Licenses','Complete license register. New, renewal, upgrade and downgrade transactions with payment and review status.',
  `<div class="oc-fchip" style="border:0;background:transparent;cursor:default"><span class="oc-pill ${counts.pending?'warn':'ok'}">${counts.pending} pending review</span></div><button type="button" class="oc-btn oc-btn-secondary" data-oc-go="claims">Review queue ${ocIcon('chev')}</button>`)+`
  <div class="oc-toolrow"><div class="oc-filters" style="margin:0">${[['all','All'],['pending','Pending'],['active','Active'],['rejected','Rejected']].map(([f,l])=>`<button type="button" class="oc-fchip ${filter===f?'on':''}" data-oc-f="${f}">${l} ${counts[f]||''}</button>`).join('')}</div>${ocSearch('Search administrator, shop, number or transaction ID…',' id="ocLicSearch"')}</div>
  <div class="oc-card is-flush"><div class="oc-tblwrap clean"><table class="oc-tbl"><thead><tr><th>Administrator</th><th>Shop</th><th>Type</th><th>Period</th><th>Entitlements</th><th class="num">Amount</th><th>Payment</th><th>Transaction ID</th><th>Status</th><th style="text-align:right">Action</th></tr></thead><tbody>
  ${data.length?data.map(x=>{const p=ocLicPill(x.status);const scheduled=x.transaction_type==='downgrade'&&x.starts_at&&new Date(x.starts_at)>new Date();
   return `<tr><td><div class="oc-cellstack"><b>${esc(x.administrators?.name||'—')}</b><small><code class="oc-code">${esc(x.administrators?.admin_code||'—')}</code></small></div></td>
   <td>${esc(x.stores?.name||'<span class="oc-mut">License capacity</span>')}</td>
   <td><span class="oc-tag">${esc(x.transaction_type||'new')}</span></td>
   <td class="oc-mut">${x.duration_months} mo</td>
   <td style="white-space:nowrap;font-size:12px;line-height:1.9">${feats(x)}</td>
   <td class="num"><b>৳ ${money(x.amount)}</b></td>
   <td><span class="oc-tag">${esc(x.payment_method||'—')}</span><div class="oc-mut" style="font-size:11.5px">${esc(x.payment_number||'')}</div></td>
   <td><code class="oc-code">${esc(x.transaction_id||'—')}</code></td>
   <td><span class="oc-pill ${p.cls}">${p.txt}</span>${scheduled?`<div class="oc-mut" style="font-size:11px">scheduled downgrade</div>`:''}</td>
   <td><div class="oc-acts">${x.status==='pending'?`<button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-appr="${x.id}">${ocIcon('check')}Approve</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-rej="${x.id}">Reject</button>`:`<span class="oc-mut" style="font-size:12px">Reviewed</span>`}</div></td></tr>`}).join(''):ocEmptyTd(10,ocEmpty(ocIcon('shield'),'No licenses in this view','Try clearing the status filter or search term.'))}
  </tbody></table></div></div>`);
  document.querySelectorAll('[data-oc-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.ocF;render()});
  const s=$('#ocLicSearch');if(s)s.oninput=e=>{q=e.target.value.trim().toLowerCase();render()};
  document.querySelectorAll('[data-oc-appr]').forEach(b=>b.onclick=()=>ocLicenseReview(b.dataset.ocAppr,'active','licenses'));
  document.querySelectorAll('[data-oc-rej]').forEach(b=>b.onclick=()=>ocLicenseReview(b.dataset.ocRej,'rejected','licenses'));
  ocBindGo();
 };
 render();
}

/* ---------- License plans ---------- */
async function ownerPlans(){
 const rows=await api('platform/license-plans');
 const published=rows.filter(p=>p.active!==false),free=rows.filter(p=>Number(p.price)===0);
 const featRows=p=>[
  [true,`<b>${p.duration_months} months</b> per license`],
  [true,`Up to <b>${p.max_stores}</b> shop${p.max_stores>1?'s':''}`],
  [p.connectx_enabled?true:false,p.connectx_enabled?`ConnectX <b>${p.connectx_daily_limit}</b> emails/day per shop`:'ConnectX not included'],
  [p.zudo_enabled?true:false,p.zudo_enabled?`Zudo AI <b>${p.zudo_daily_limit}</b> requests/day per shop`:'Zudo AI not included'],
  [p.business_health_enabled?true:false,p.business_health_enabled?`AI Business Health <b>${p.business_health_daily_limit}</b> reports/day`:'AI Business Health not included'],
  [p.truebill_enabled?true:false,'TrueBill invoice QR verification'],
  [Number(p.vaultium_gb||0)>0?true:false,`Vaultium <b>${p.vaultium_gb} GB</b> storage`]
 ];
 $('#page').innerHTML=ocView(ocHead('License plans','The catalogue administrators see in their Purchase License tab. Price 0 = instant free license with no payment form.',
 `<button type="button" class="oc-btn" id="ocAddPlan">${ocIcon('plus')}Post license plan</button>`)+`
 <div class="oc-cards">${ocStat('Published plans',published.length,'visible to administrators','','ok')}${ocStat('Hidden plans',rows.length-published.length,'not shown in the catalogue','','neu')}${ocStat('Free plans',free.length,'instant activation','','info')}${ocStat('Cheapest paid','৳ '+money(Math.min(...rows.filter(p=>Number(p.price)>0).map(p=>Number(p.price)),Infinity)===Infinity?0:Math.min(...rows.filter(p=>Number(p.price)>0).map(p=>Number(p.price)))),'per license period','','accent')}</div>
 <div class="oc-plans">${rows.length?rows.map(p=>`<div class="oc-plan">
  <div class="oc-ptop"><div><h3>${esc(p.title)}</h3><div class="oc-price"><b>${Number(p.price)===0?'Free':'৳ '+money(p.price)}</b><small>/ ${p.duration_months} mo</small></div></div><span class="oc-pill ${p.active!==false?'ok':'neu'}">${p.active!==false?'Published':'Hidden'}</span></div>
  <div class="oc-pbody"><ul class="oc-feats">${featRows(p).map(([on,html])=>`<li class="${on?'on':'off'}">${ocIcon(on?'check':'x')}<span>${html}</span></li>`).join('')}</ul>
  ${p.benefits?`<div class="oc-benefits">${esc(p.benefits)}</div>`:''}
  ${p.payment_details?`<div style="font-size:11.8px;color:var(--oc-faint)">Payment details: ${esc(p.payment_details)}</div>`:''}</div>
  <div class="oc-pfoot"><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-editplan="${p.id}">Edit plan</button></div></div>`).join(''):'<div class="oc-card" style="grid-column:1/-1">'+ocEmpty(ocIcon('tag'),'No license plans yet','Publish your first license plan to let administrators purchase licenses.')+'</div>'}</div>`);
 $('#ocAddPlan').onclick=()=>planModal();
 document.querySelectorAll('[data-oc-editplan]').forEach(x=>x.onclick=()=>planModal(rows.find(p=>p.id===x.dataset.ocEditplan)));
}
function planModal(plan=null){
 const add=!plan;
 const d=ocDialog({title:add?'Post license plan':'Edit license plan',icon:ocIcon('tag'),tone:'info',size:'lg',
 body:`<form id="ocPlanForm" class="oc-formgrid">
  <div class="oc-fgrid"><div class="oc-span3"><label class="oc-flabel">Plan title <span class="oc-freq">*</span></label><input class="oc-input" name="title" required value="${esc(plan?.title||'')}" placeholder="e.g. Standard 6-month"></div>
  <div><label class="oc-flabel">Duration (months) <span class="oc-freq">*</span></label><input class="oc-input" type="number" min="1" required name="duration_months" value="${esc(plan?.duration_months||'')}"></div>
  <div><label class="oc-flabel">Total shop create limit <span class="oc-freq">*</span></label><input class="oc-input" type="number" min="1" required name="max_stores" value="${esc(plan?.max_stores||1)}"></div>
  <div><label class="oc-flabel">Price (BDT; 0 = free) <span class="oc-freq">*</span></label><input class="oc-input" type="number" min="0" step="0.01" required name="price" value="${esc(plan?.price??0)}"></div>
  <div><label class="oc-flabel">Availability</label><select class="oc-select" name="active"><option value="true" ${plan?.active!==false?'selected':''}>Published</option><option value="false" ${plan?.active===false?'selected':''}>Hidden</option></select></div></div>
  <hr class="oc-rule" style="margin:2px 0">
  <div style="font-size:12px;font-weight:750;letter-spacing:.6px;text-transform:uppercase;color:var(--oc-mut)">Licensed entitlements</div>
  ${[['connectx','ConnectX','emails per shop / day'],['zudo','Zudo AI','requests per shop / day'],['business_health','AI Business Health','reports per shop / day']].map(([k,l,h])=>`<div class="oc-fgrid" style="align-items:end"><div style="display:flex;align-items:center;gap:9px;min-height:36px"><input type="checkbox" id="ocplan_${k}" name="${k}_enabled" style="width:15px;height:15px;accent-color:var(--oc-accent);flex:0 0 auto" ${plan?.[k+'_enabled']?'checked':''}><label for="ocplan_${k}" class="oc-flabel" style="margin:0">Include ${l}</label></div><div><label class="oc-flabel">${h}</label><input class="oc-input" type="number" min="0" name="${k}_daily_limit" value="${esc(plan?.[k+'_daily_limit']??0)}"></div></div>`).join('')}
  <div class="oc-fgrid" style="align-items:center"><div style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="ocplan_truebill" name="truebill_enabled" style="width:15px;height:15px;accent-color:var(--oc-accent);flex:0 0 auto" ${plan?.truebill_enabled?'checked':''}><label for="ocplan_truebill" class="oc-flabel" style="margin:0">Include TrueBill — QR verification on every invoice, whole license validity (no daily limit)</label></div></div>
  <div><label class="oc-flabel">Vaultium storage (GB per administrator — shared across all shops)</label><input class="oc-input" type="number" min="0" name="vaultium_gb" value="${esc(plan?.vaultium_gb??0)}"></div>
  <div><label class="oc-flabel">Benefits / information <span class="oc-freq">*</span></label><textarea class="oc-textarea" name="benefits" rows="3" required>${esc(plan?.benefits||'')}</textarea></div>
  <div><label class="oc-flabel">Payment instructions / details</label><textarea class="oc-textarea" name="payment_details" rows="2">${esc(plan?.payment_details||'')}</textarea></div>
  </form>`});
 ocPlanFormSubmit(d,plan);
}
function ocPlanFormSubmit(d,plan){const add=!plan,form=d.body.querySelector('#ocPlanForm');
 const btn=document.createElement('button');btn.type='submit';btn.className='oc-btn oc-btn-sm';btn.textContent=add?'Publish license plan':'Save plan';btn.form='ocPlanForm';
 d.el.querySelector('.oc-df').appendChild(btn);
 form.onsubmit=async ev=>{ev.preventDefault();try{
  const b=Object.fromEntries(new FormData(form));
  b.duration_months=+b.duration_months;b.max_stores=+b.max_stores;b.price=+b.price;b.active=b.active==='true';
  b.connectx_enabled=form.querySelector('[name=connectx_enabled]').checked;b.connectx_daily_limit=+b.connectx_daily_limit||0;
  b.zudo_enabled=form.querySelector('[name=zudo_enabled]').checked;b.zudo_daily_limit=+b.zudo_daily_limit||0;
  b.business_health_enabled=form.querySelector('[name=business_health_enabled]').checked;b.business_health_daily_limit=+b.business_health_daily_limit||0;
  b.truebill_enabled=form.querySelector('[name=truebill_enabled]').checked;b.vaultium_gb=+b.vaultium_gb||0;
  await api(add?'platform/license-plans':'platform/license-plan/'+plan.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});
  d.close();toast('License plan saved.');ownerPlans();
 }catch(x){toast(x.message)}};
}

/* ---------- Administrators ---------- */
function ownerAdmins(d){
 const admins=d.admins||[];let q='';
 const rows=()=>admins.filter(a=>!q||JSON.stringify([a.name,a.email,a.phone,a.admin_code]).toLowerCase().includes(q));
 const render=()=>{
  const data=rows();
  $('#page').innerHTML=ocView(ocHead('Administrators','Administrator accounts across the platform. Deactivating an administrator blocks new sign-ins; existing sessions expire automatically.')+`
  <div class="oc-cards">${ocStat('Administrators',admins.length,`${admins.filter(a=>a.active).length} active`,ocIcon('user'),'accent')}${ocStat('Active',admins.filter(a=>a.active).length,'can sign in to their shops','','ok')}${ocStat('Deactivated',admins.filter(a=>!a.active).length,'sign-in blocked','','neu')}</div>
  <div class="oc-toolrow">${ocSearch('Search by name, email, phone or administrator ID…',' id="ocAdmSearch"')}</div>
  <div class="oc-card is-flush"><div class="oc-tblwrap clean"><table class="oc-tbl"><thead><tr><th>Administrator</th><th>Contact</th><th>Created</th><th>Status</th><th style="text-align:right">Action</th></tr></thead><tbody>
  ${data.length?data.map(a=>`<tr><td><div style="display:flex;align-items:center;gap:10px"><span class="oc-ava2">${esc((a.name||'?').slice(0,1).toUpperCase())}</span><div class="oc-cellstack"><b>${esc(a.name)}</b><small><code class="oc-code">#${esc(a.admin_code)}</code></small></div></div></td>
  <td class="oc-mut">${esc(a.email||'—')}<div style="font-size:11.8px">${esc(a.phone||'')}</div></td>
  <td class="oc-mut">${ocDate(a.created_at)}</td>
  <td><span class="oc-pill ${a.active?'ok':'neu'}">${a.active?'Active':'Inactive'}</span></td>
  <td><div class="oc-acts">${a.active?`<button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-toggle="${a.id}" data-oc-state="0">Deactivate</button>`:`<button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-toggle="${a.id}" data-oc-state="1">Activate</button>`}</div></td></tr>`).join(''):ocEmptyTd(5,ocEmpty(ocIcon('user'),'No administrators yet','Administrators appear here once they register an account.'))}
  </tbody></table></div></div>`);
  const s=$('#ocAdmSearch');if(s)s.oninput=e=>{q=e.target.value.trim().toLowerCase();render()};
  document.querySelectorAll('[data-oc-toggle]').forEach(b=>b.onclick=async()=>{
   const id=b.dataset.ocToggle,toActive=b.dataset.ocState==='1';
   const ok=await ocConfirm({title:toActive?'Activate administrator?':'Deactivate administrator?',danger:!toActive,confirmText:toActive?'Activate account':'Deactivate',cancelText:'Cancel',message:toActive?'This administrator will be able to sign in again.':'This administrator will be blocked from signing in. Existing sessions expire automatically.'});
   if(!ok)return;
   try{await api('platform/administrator/'+id,{method:'PATCH',body:JSON.stringify({active:toActive})});toast('Administrator status changed.');ownerPage('administrators')}catch(e){toast(e.message)}
  });
 };
 render();
}

/* ---------- Shops ---------- */
function ownerShops(d){
 const shops=(d.stores||[]);let q='';
 const rows=()=>shops.filter(s=>!q||JSON.stringify([s.name,s.shop_code,s.administrators?.name,s.administrators?.email]).toLowerCase().includes(q));
 const render=()=>{
  const data=rows();
  $('#page').innerHTML=ocView(ocHead('Shops','Every shop registered on the platform, with its administrator and operating status.')+`
  <div class="oc-cards">${ocStat('Total shops',shops.length,'registered','','accent')}${ocStat('Active',shops.filter(s=>s.status==='active').length,'operating normally','','ok')}${ocStat('Read-only',shops.filter(s=>s.status==='read_only').length,'viewing only','','warn')}${ocStat('Inactive',shops.filter(s=>s.status==='inactive').length,'disabled','','neu')}</div>
  <div class="oc-toolrow">${ocSearch('Search by shop name, Shop ID or administrator…',' id="ocShopSearch"')}</div>
  <div class="oc-card is-flush"><div class="oc-tblwrap clean"><table class="oc-tbl"><thead><tr><th>Shop</th><th>Shop ID</th><th>Administrator</th><th>Administrator ID</th><th>Email</th><th>Status</th><th>Created</th></tr></thead><tbody>
  ${data.length?data.map(s=>`<tr><td><div style="display:flex;align-items:center;gap:10px"><span class="oc-ava2">${esc((s.name||'?').slice(0,1).toUpperCase())}</span><b>${esc(s.name)}</b></div></td>
  <td><code class="oc-code">${esc(s.shop_code)}</code></td>
  <td>${esc(s.administrators?.name||'—')}</td>
  <td><code class="oc-code">${esc(s.administrators?.admin_code||'—')}</code></td>
  <td class="oc-mut">${esc(s.administrators?.email||'—')}</td>
  <td><span class="oc-pill ${s.status==='active'?'ok':s.status==='read_only'?'warn':'neu'}">${esc(s.status==='read_only'?'read-only':s.status)}</span></td>
  <td class="oc-mut">${ocDate(s.created_at)}</td></tr>`).join(''):ocEmptyTd(7,ocEmpty(ocIcon('store'),'No shops yet','Shops appear here as soon as they are registered.'))}
  </tbody></table></div></div>`);
  const s=$('#ocShopSearch');if(s)s.oninput=e=>{q=e.target.value.trim().toLowerCase();render()};
 };
 render();
}

/* ---------- Branding (platform settings) ---------- */
async function ownerBranding(){
 let b=await api('platform/settings');
 $('#page').innerHTML=ocView(ocHead('Branding','Public website identity of EMS. These fields only affect the EMS public site — they never alter customer shop records.')+`
 <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:18px;align-items:start" class="oc-dashgrid">
  <div class="oc-card"><div class="oc-cardhead"><h2>Brand details</h2><p>Shown on the landing page, auth screens and invoice footers.</p></div>
   <div class="oc-cardbody"><form id="ocBrandForm" class="oc-formgrid">
    <div><label class="oc-flabel">Website name</label><input class="oc-input" name="website_name" required value="${esc(b.website_name||'EMS V1')}" data-oc-live="wname"></div>
    <div><label class="oc-flabel">Product name</label><input class="oc-input" name="product_name" required value="${esc(b.product_name||'EMS V1')}" data-oc-live="pname"></div>
    <div><label class="oc-flabel">Powered by</label><input class="oc-input" name="powered_by" required value="${esc(b.powered_by||'DoxTox')}" data-oc-live="pby"></div>
    <div style="display:flex;justify-content:flex-end"><button type="submit" class="oc-btn">Save brand details</button></div>
   </form></div></div>
  <div class="oc-card"><div class="oc-cardhead"><h2>Preview</h2><p>How the wordmark renders.</p></div><div class="oc-cardbody">
   <div style="border:1px dashed var(--oc-line);border-radius:10px;padding:20px 18px;background:var(--oc-surface2)">
    <div style="display:flex;align-items:center;gap:11px"><span class="oc-logo" style="width:34px;height:34px;border-radius:9px;background:var(--oc-accent);color:#fff;display:grid;place-items:center;font-weight:800">E</span>
    <div><div style="font-weight:800;font-size:17px" id="ocPrevName">${esc(b.product_name||'EMS V1')}</div><small style="color:var(--oc-mut)">powered by <b id="ocPrevPby">${esc(b.powered_by||'DoxTox')}</b></small></div></div>
    <hr class="oc-rule"><div style="font-size:12px;color:var(--oc-mut)">Website name:<br><b id="ocPrevWn" style="color:var(--oc-text)">${esc(b.website_name||'EMS V1')}</b></div></div>
   <p class="oc-hint">The wordmark already updates across the console when saved.</p></div></div>
 </div>`);
 const f=$('#ocBrandForm');
 f.querySelectorAll('[data-oc-live]').forEach(i=>i.oninput=()=>{const v=i.value;$('#ocPrevName').textContent=String(v).trim()||'EMS V1'});
 f.onsubmit=async e=>{e.preventDefault();try{
  await api('platform/settings',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(f)))});
  toast('Website branding saved.');
  api('public/branding').then(br=>{document.querySelectorAll('[data-brand-name]').forEach(x=>x.textContent=br.product_name||'EMS V1');document.querySelectorAll('[data-powered-by]').forEach(x=>x.textContent=br.powered_by||'DoxTox')}).catch(()=>{});
  ownerBranding();
 }catch(x){toast(x.message)}};
}

/* ---------- Website pages ---------- */
async function ownerWebsitePages(){
 const pages=await api('platform/pages'),standard=[['about','About'],['terms','Terms & Conditions'],['contact','Contact Us']],bySlug=Object.fromEntries(pages.map(x=>[x.slug,x]));
 $('#page').innerHTML=ocView(ocHead('Website pages','The fixed public pages of the EMS website — About, Terms &amp; Conditions and Contact.',`<button type="button" class="oc-btn oc-btn-secondary" id="ocAddMissing">${ocIcon('plus')}Add missing standard pages</button>`)+`
 <div class="oc-cards">${standard.map(([slug,label])=>{const p=bySlug[slug];return `<div class="oc-card" style="margin:0"><div class="oc-cardbody">
  <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><b style="font-size:14.5px">${esc(p?.title||label)}</b><span class="oc-pill ${p?'ok':'warn'}">${p?'Available':'Missing'}</span></div>
  <div class="oc-mut" style="font-size:12.4px;margin-top:2px">/<span class="oc-code">${slug}</span></div>
  ${p?`<p class="oc-hint">${esc(String(p.body||'').slice(0,90))}${(p.body||'').length>90?'…':''}</p>`:`<p class="oc-hint">Not created yet — the public /${slug} page currently returns 404.</p>`}
  <div style="display:flex;gap:8px;margin-top:10px">${p?`<button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-pageedit="${slug}">Edit page</button>`:`<button type="button" class="oc-btn oc-btn-sm" data-oc-pageadd="${slug}">${ocIcon('plus')}Create page</button>`}</div>
 </div></div>`}).join('')}</div>`);
 const editPage=slug=>{const p=bySlug[slug]||{title:(standard.find(s=>s[0]===slug)||[])[1]||slug,body:'',hero_image_prompt:''};
  const d=ocDialog({title:'Edit '+esc((standard.find(s=>s[0]===slug)||[])[1]||slug),icon:ocIcon('file'),tone:'info',size:'lg',
  body:`<form id="ocPageForm" class="oc-formgrid">
   <div><label class="oc-flabel">Page title</label><input class="oc-input" name="title" value="${esc(p.title)}"></div>
   ${slug==='about'?`<div><label class="oc-flabel">Graphics prompt / note</label><input class="oc-input" name="hero_image_prompt" value="${esc(p.hero_image_prompt||'')}"></div>`:''}
   <div><label class="oc-flabel">Page content</label><textarea class="oc-textarea" name="body" rows="14">${esc(p.body)}</textarea></div></form>`});
  const form=d.body.querySelector('form');
  const btn=document.createElement('button');btn.className='oc-btn oc-btn-sm';btn.type='submit';btn.textContent='Save page';btn.form='ocPageForm';
  d.el.querySelector('.oc-df').appendChild(btn);
  form.onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(form));b.slug=slug;try{
   await api('platform/pages',{method:'PATCH',body:JSON.stringify(b)});d.close();toast('Public page saved.');ownerWebsitePages();
  }catch(err){toast(err.message)}};
 };
 const addPage=async slug=>{try{await api('platform/pages',{method:'POST',body:JSON.stringify({slug})});toast('Standard page added.');ownerWebsitePages()}catch(err){toast(err.message)}};
 $('#ocAddMissing').onclick=async()=>{const missing=standard.filter(([slug])=>!bySlug[slug]);if(!missing.length)return toast('All standard public pages already exist.');for(const [slug] of missing){await api('platform/pages',{method:'POST',body:JSON.stringify({slug})}).catch(err=>{toast(err.message);return null})}ownerWebsitePages();toast('Standard pages added.')};
 document.querySelectorAll('[data-oc-pageedit]').forEach(x=>x.onclick=()=>editPage(x.dataset.ocPageedit));
 document.querySelectorAll('[data-oc-pageadd]').forEach(x=>x.onclick=()=>addPage(x.dataset.ocPageadd));
}

/* ---------- Blogs ---------- */
async function ownerBlogs(){
 const rows=await api('platform/blogs');let q='';
 const data=()=>rows.filter(x=>!q||JSON.stringify([x.title,x.slug]).toLowerCase().includes(q));
 const render=()=>{
  const list=data();
  $('#page').innerHTML=ocView(ocHead('Blog posts','Articles published on the EMS public site.',`<button type="button" class="oc-btn" id="ocAddBlog">${ocIcon('plus')}New blog post</button>`)+`
  <div class="oc-cards">${ocStat('Total posts',rows.length,'written so far','','accent')}${ocStat('Published',rows.filter(x=>x.published).length,'live on the website','','ok')}${ocStat('Drafts',rows.filter(x=>!x.published).length,'not visible publicly','','warn')}</div>
  <div class="oc-toolrow">${ocSearch('Search by title…',' id="ocBlogSearch"')}</div>
  <div class="oc-card is-flush"><div class="oc-tblwrap clean"><table class="oc-tbl"><thead><tr><th>Post</th><th>Status</th><th>Published</th><th style="text-align:right">Action</th></tr></thead><tbody>
  ${list.length?list.map(x=>`<tr><td><div style="display:flex;align-items:center;gap:11px;min-width:0">${x.cover_image_url?`<img src="${esc(x.cover_image_url)}" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--oc-line);flex:0 0 auto" onerror="this.style.display='none'">`:`<span class="oc-icob">${ocIcon('file')}</span>`}<div class="oc-cellstack"><b style="max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.title)}</b><small>/${esc(x.slug||'')}</small></div></div></td>
  <td><span class="oc-pill ${x.published?'ok':'warn'}">${x.published?'Published':'Draft'}</span></td>
  <td class="oc-mut">${x.published_at?ocDate(x.published_at):'—'}</td>
  <td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-blogedit="${x.id}">Edit</button></div></td></tr>`).join(''):ocEmptyTd(4,ocEmpty(ocIcon('rss'),'No blog posts yet','Write the first post for the public EMS site.'))}
  </tbody></table></div></div>`);
  const s=$('#ocBlogSearch');if(s)s.oninput=e=>{q=e.target.value.trim().toLowerCase();render()};
  $('#ocAddBlog').onclick=()=>blogModal();
  document.querySelectorAll('[data-oc-blogedit]').forEach(b=>b.onclick=()=>blogModal(rows.find(x=>x.id===b.dataset.ocBlogedit)));
 };
 render();
}
function blogModal(post=null){
 const d=ocDialog({title:post?'Edit blog post':'New blog post',icon:ocIcon('rss'),tone:'info',size:'lg',
 body:`<form id="ocBlogForm" class="oc-formgrid">
  <div><label class="oc-flabel">Title</label><input class="oc-input" name="title" required value="${esc(post?.title||'')}"></div>
  <div><label class="oc-flabel">Excerpt</label><input class="oc-input" name="excerpt" value="${esc(post?.excerpt||'')}"></div>
  <div><label class="oc-flabel">Cover image URL</label><input class="oc-input" name="cover_image_url" value="${esc(post?.cover_image_url||'')}" placeholder="https://…"></div>
  <div><label class="oc-flabel">Article content</label><textarea class="oc-textarea" name="body" rows="12" required>${esc(post?.body||'')}</textarea></div>
  <div><label class="oc-flabel">Publication status</label><select class="oc-select" name="published"><option value="false" ${!post?.published?'selected':''}>Draft</option><option value="true" ${post?.published?'selected':''}>Published</option></select></div></form>`});
 const form=d.body.querySelector('form');
 const btn=document.createElement('button');btn.className='oc-btn oc-btn-sm';btn.type='submit';btn.textContent='Save blog post';btn.form='ocBlogForm';
 d.el.querySelector('.oc-df').appendChild(btn);
 form.onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(form));b.published=b.published==='true';try{
  await api(post?'platform/blog/'+post.id:'platform/blogs',{method:post?'PATCH':'POST',body:JSON.stringify(b)});
  d.close();toast('Blog post saved.');ownerBlogs();
 }catch(err){toast(err.message)}};
}

/* ---------- Contact messages ---------- */
async function ownerContactMessages(){
 const rows=await api('platform/contact-messages');let q='';
 const data=()=>rows.filter(x=>!q||JSON.stringify([x.name,x.email,x.phone,x.subject,x.message]).toLowerCase().includes(q));
 const render=()=>{
  const list=data();
  $('#page').innerHTML=ocView(ocHead('Contact messages','Messages submitted through the public Contact page.',`<span class="oc-pill neu">${rows.length} total</span>`)+`
  <div class="oc-toolrow">${ocSearch('Search name, email, subject or message…',' id="ocMsgSearch"')}</div>
  <div class="oc-card is-flush"><div class="oc-tblwrap clean"><table class="oc-tbl"><thead><tr><th>Received</th><th>Sender</th><th>Subject</th><th>Message</th><th>Status</th><th style="text-align:right">Action</th></tr></thead><tbody>
  ${list.length?list.map((x,i)=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDT(x.created_at)}</td>
  <td><div style="display:flex;align-items:center;gap:9px"><span class="oc-ava2">${esc((x.name||'?').slice(0,1).toUpperCase())}</span><div class="oc-cellstack"><b>${esc(x.name)}</b><small>${esc(x.email||'')}${x.phone?' · '+esc(x.phone):''}</small></div></div></td>
  <td><b>${esc(x.subject||'—')}</b></td>
  <td style="max-width:300px"><span class="oc-ellip">${esc(x.message)}</span></td>
  <td><span class="oc-pill neu">${esc(x.status||'new')}</span></td>
  <td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-msgview="${i}">${ocIcon('eye')}View</button></div></td></tr>`).join(''):ocEmptyTd(6,ocEmpty(ocIcon('inbox'),'No messages yet','Contact form submissions appear here.'))}
  </tbody></table></div></div>`);
  const s=$('#ocMsgSearch');if(s)s.oninput=e=>{q=e.target.value.trim().toLowerCase();render()};
  document.querySelectorAll('[data-oc-msgview]').forEach(b=>b.onclick=()=>{const x=list[+b.dataset.ocMsgview];if(!x)return;
   const d=ocDialog({title:esc(x.subject||'Message')||'Message',icon:ocIcon('inbox'),tone:'info',size:'lg',
   body:`<div class="oc-dl" style="margin-bottom:16px"><div class="oc-di"><small>From</small><div>${esc(x.name)}</div></div><div class="oc-di"><small>Email</small><div>${esc(x.email)}</div></div><div class="oc-di"><small>Phone</small><div>${esc(x.phone||'—')}</div></div><div class="oc-di"><small>Received</small><div>${ocDT(x.created_at)}</div></div><div class="oc-di span2"><small>Subject</small><div>${esc(x.subject||'—')}</div></div></div>
   <div style="border:1px solid var(--oc-line);border-radius:9px;background:var(--oc-surface2);padding:14px 15px;white-space:pre-wrap;line-height:1.65;font-size:13.2px">${esc(x.message)}</div>`})});
 };
 render();
}

/* ---------- ConnectX (owner) ---------- */
async function ownerConnectX(){
 const x=await api('platform/connectx');
 const cfgOk=!!x.apiConfigured,used=Number(x.usedToday||0),limit=Number(x.global_daily_limit||0);
 $('#page').innerHTML=ocView(ocHead('ConnectX','Central provider, sender identity and daily limits for ConnectX email. Brevo credentials stay in Cloudflare encrypted secrets.')+`
 <div class="oc-cards">
  ${ocStat('Provider','Brevo API',cfgOk?'API key detected':'API key missing',ocIcon('mail'),cfgOk?'ok':'warn')}
  ${ocStat('Status',x.enabled?'Enabled':'Disabled','shop sending '+(x.enabled?'allowed':'blocked'),'',x.enabled?'ok':'neu')}
  ${ocStat('Global daily limit',limit,`used today: ${used}`,ocIcon('activity'),'accent')}
  ${ocStat('From email',esc(x.from_email||'—'),esc(x.from_name||''),'','info')}
 </div>
 ${limit>0?`<div class="oc-card"><div class="oc-cardhead"><h2>Today's global usage</h2><p>${used} of ${limit} emails sent today across every shop.</p></div><div class="oc-cardbody"><div class="oc-progress ${used>=limit?'':'ok'}" style="margin:0"><i style="width:${Math.min(100,used/limit*100)}%"></i></div></div></div>`:''}
 <div class="oc-card"><div class="oc-cardhead"><h2>Central sender and limits</h2><p>Shop users never see provider credentials.</p></div>
  <div class="oc-cardbody"><form id="cxConfig" class="oc-formgrid">
   <div class="oc-fgrid">
    <div><label class="oc-flabel">From name</label><input class="oc-input" name="from_name" required value="${esc(x.from_name||'EMS ConnectX')}"></div>
    <div><label class="oc-flabel">From email</label><input class="oc-input" name="from_email" type="email" required value="${esc(x.from_email||'')}"></div>
    <div><label class="oc-flabel">Reply-to email</label><input class="oc-input" name="reply_to" type="email" value="${esc(x.reply_to||'')}"></div>
    <div><label class="oc-flabel">Global daily limit</label><input class="oc-input" name="global_daily_limit" type="number" min="1" required value="${esc(x.global_daily_limit||300)}"></div>
    <div><label class="oc-flabel">ConnectX status</label><select class="oc-select" name="enabled"><option value="true" ${x.enabled?'selected':''}>Enabled</option><option value="false" ${!x.enabled?'selected':''}>Disabled</option></select></div>
   </div>
   <div style="display:flex;justify-content:flex-end"><button type="submit" class="oc-btn">Save ConnectX configuration</button></div>
  </form></div></div>
 <div class="oc-card"><div class="oc-cardhead"><h2>Test Brevo connection</h2><p>Send one diagnostic test email. The result shows the exact provider response to you only.</p></div>
  <div class="oc-cardbody"><div class="oc-fgrid" style="align-items:end"><div><label class="oc-flabel">Test recipient email</label><input class="oc-input" type="email" id="cxTestTo" placeholder="you@example.com"></div>
  <div style="display:flex;align-items:flex-end"><button type="button" class="oc-btn" id="cxTest">Send test email</button></div></div><div id="cxTestResult" style="margin-top:11px"></div></div></div>
 <div class="oc-card is-flush"><div class="oc-cardhead"><h2>Recent provider logs</h2><p>Latest 100 send attempts from all shops.</p></div><div class="oc-cardbody" id="cxOwnerLogs"><div class="oc-loading"><span class="oc-spin"></span>Loading logs…</div></div></div>`);
 async function loadLogs(){try{
  const logs=await api('platform/connectx/logs');
  const box=$('#cxOwnerLogs');
  box.innerHTML=logs.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Time</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Provider result</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDT(l.created_at)}</td><td class="oc-mut">${esc(l.to_emails.join(', '))}</td><td><b>${esc(l.subject)}</b></td><td><span class="oc-pill ${l.status==='sent'?'ok':l.status==='failed'?'err':'warn'}">${esc(l.status)}</span>${l.shop_deleted_at?'<div class="oc-mut" style="font-size:11px">hidden by shop</div>':''}</td><td class="oc-mut" style="max-width:260px"><span class="oc-ellip" title="${esc(l.error_message||l.provider_message_id||'Accepted')}">${esc(l.error_message||l.provider_message_id||'Accepted')}</span></td></tr>`).join('')}</tbody></table>`):ocEmpty(ocIcon('mail'),'No ConnectX send attempts yet','Logs appear here as soon as shops send email through ConnectX.');
 }catch(e){$('#cxOwnerLogs').innerHTML=ocEmpty(ocIcon('alert'),'Logs unavailable',esc(e.message))}}
 loadLogs();
 $('#cxConfig').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{
  await api('platform/connectx',{method:'PATCH',body:JSON.stringify(b)});toast('ConnectX configuration saved.');ownerConnectX();
 }catch(err){toast(err.message)}};
 $('#cxTest').onclick=async()=>{const btn=$('#cxTest'),to=$('#cxTestTo').value.trim();if(!to)return toast('Enter a test recipient email.');btn.disabled=true;btn.textContent='Testing…';$('#cxTestResult').innerHTML='';try{
  const r=await api('platform/connectx/test',{method:'POST',body:JSON.stringify({to})});
  $('#cxTestResult').innerHTML=ocCall('ok',`<b>Brevo accepted the test email.</b><div>Message ID: ${esc(r.messageId||'received')}</div>`);
 }catch(e){$('#cxTestResult').innerHTML=ocCall('danger',`<b>Test failed.</b><div>${esc(e.message)}</div>`)}
 finally{btn.disabled=false;btn.textContent='Send test email'}};
}

/* ---------- Zudo AI + AI Business Health (owner) ---------- */
async function ownerZudo(){
 const [x,h]=await Promise.all([api('platform/zudo'),api('platform/business-health').catch(()=>({enabled:false,global_daily_limit:100,usedToday:0,aiBinding:false,models:null}))]);
 const prov=(key,label,secret,ready)=>`<div class="oc-card" style="margin:0"><div class="oc-cardbody" style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><b style="font-size:13.6px">${label}</b><div class="oc-mut" style="font-size:12px">${ready?'API key / binding detected':'Add secret: '+esc(secret)}</div></div><span class="oc-pill ${ready?'ok':'warn'}">${ready?'Ready':'Missing'}</span></div></div>`;
 $('#page').innerHTML=ocView(ocHead('Zudo AI','Zudo is read-only. Pick any AI model — if a provider hits a limit or fails, switch instantly.')+`
 <div class="oc-cards">${prov('cf','Cloudflare Workers AI','AI binding',!!x.aiBinding)}${prov('gem','Google AI Studio (Gemini)','GEMINI_API_KEY',!!x.geminiBinding)}${prov('groq','Groq','GROQ_API_KEY',!!x.groqBinding)}${prov('cere','Cerebras','CEREBRAS_API_KEY',!!x.cerebrasBinding)}</div>
 <div class="oc-cards">${ocStat('Global daily limit',x.global_daily_limit||0,`used today: ${x.usedToday||0}`,ocIcon('activity'),'accent')}${ocStat('Zudo status',x.enabled?'Enabled':'Disabled','global switch for all shops','',x.enabled?'ok':'neu')}</div>
 <div class="oc-card"><div class="oc-cardhead"><h2>Central Zudo controls</h2><p>One model powers Zudo across the platform.</p></div><div class="oc-cardbody"><form id="zudoConfig" class="oc-formgrid">
  <div class="oc-fgrid"><div><label class="oc-flabel">AI model</label><select class="oc-select" name="model">${modelOptions(x.models,x.model)}</select></div>
  <div><label class="oc-flabel">Global daily request limit</label><input class="oc-input" name="global_daily_limit" type="number" min="1" value="${esc(x.global_daily_limit||500)}"></div>
  <div><label class="oc-flabel">Zudo status</label><select class="oc-select" name="enabled"><option value="true" ${x.enabled?'selected':''}>Enabled</option><option value="false" ${!x.enabled?'selected':''}>Disabled</option></select></div></div>
  <div style="display:flex;justify-content:flex-end"><button type="submit" class="oc-btn">Save Zudo configuration</button></div></form></div></div>
 <div class="oc-card"><div class="oc-cardhead"><h2>Business AI Health controls</h2><p>Read-only, license-controlled report generator using the same provider connections as Zudo.</p></div><div class="oc-cardbody">
  <div class="oc-cards" style="margin-bottom:15px">${ocStat('Global daily limit',h.global_daily_limit||0,`used today: ${h.usedToday||0}`,ocIcon('activity'),'accent')}${ocStat('Status',h.enabled?'Enabled':'Disabled','','',h.enabled?'ok':'neu')}${ocStat('License control','Plan based','per-shop daily report allowance','','info')}</div>
  <form id="healthConfig" class="oc-formgrid">
   <div class="oc-fgrid"><div><label class="oc-flabel">AI model</label><select class="oc-select" name="model">${modelOptions(h.models,h.model)}</select></div>
   <div><label class="oc-flabel">Global daily report limit</label><input class="oc-input" name="global_daily_limit" type="number" min="1" value="${esc(h.global_daily_limit||100)}"></div>
   <div><label class="oc-flabel">Business AI Health status</label><select class="oc-select" name="enabled"><option value="true" ${h.enabled?'selected':''}>Enabled</option><option value="false" ${!h.enabled?'selected':''}>Disabled</option></select></div></div>
   <div style="display:flex;justify-content:flex-end"><button type="submit" class="oc-btn">Save Business AI Health controls</button></div></form>
  <hr class="oc-rule"><div class="oc-cardhead" style="padding:0"><div><h2>Recent AI Business Health reports</h2><p>Latest 100 reports across all shops.</p></div></div><div id="healthOwnerLogs" style="margin-top:10px"><div class="oc-loading"><span class="oc-spin"></span>Loading reports…</div></div></div></div>
 <div class="oc-card is-flush"><div class="oc-cardhead"><h2>Zudo conversation logs</h2><p>Latest 100 conversations. Click a row to open the conversation viewer.</p></div><div class="oc-cardbody" id="zudoOwnerLogs"><div class="oc-loading"><span class="oc-spin"></span>Loading logs…</div></div></div>`);
 async function loadLogs(){try{
  const logs=await api('platform/zudo/logs');
  const box=$('#zudoOwnerLogs');
  box.innerHTML=logs.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Created</th><th>Shop ID</th><th>User ID</th><th>Conversation</th><th>Status</th><th>Updated</th><th style="text-align:right">Action</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDT(l.created_at)}</td><td><code class="oc-code">${esc(l.shop_code||'—')}</code></td><td class="oc-mut">${esc(l.user_login_id||'—')}</td><td><b>${esc(l.title)}</b></td><td>${l.shop_deleted_at?'<span class="oc-pill warn">Hidden by shop</span>':'<span class="oc-pill ok">Visible</span>'}</td><td class="oc-mut" style="white-space:nowrap">${ocDT(l.updated_at)}</td><td><div class="oc-acts"><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-oc-zlog="${l.id}">${ocIcon('eye')}View</button></div></td></tr>`).join('')}</tbody></table>`):ocEmpty(ocIcon('msg'),'No Zudo conversations yet','When staff and administrators chat with Zudo, conversations appear here.');
  document.querySelectorAll('[data-oc-zlog]').forEach(r=>r.onclick=()=>zudoLogModal(r.dataset.ocZlog));
 }catch(e){$('#zudoOwnerLogs').innerHTML=ocEmpty(ocIcon('alert'),'Logs unavailable',esc(e.message))}}
 loadLogs();
 async function loadHealthLogs(){try{
  const logs=await api('platform/business-health/logs');
  const box=$('#healthOwnerLogs');
  box.innerHTML=logs.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Created</th><th>Store ID</th><th>Period</th><th>Score</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDT(l.created_at)}</td><td><code class="oc-code">${esc(l.store_id)}</code></td><td class="oc-mut">${esc(l.start_date)} — ${esc(l.end_date)}</td><td><span class="oc-pill ${Number(l.score)>=80?'ok':Number(l.score)>=60?'warn':'err'}">${esc(l.score)}/100</span></td></tr>`).join('')}</tbody></table>`):ocEmpty(ocIcon('chart'),'No Business AI Health reports yet','Reports generated by shops appear here.');
 }catch(e){$('#healthOwnerLogs').innerHTML=ocEmpty(ocIcon('alert'),'Reports unavailable',esc(e.message))}}
 loadHealthLogs();
 $('#zudoConfig').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{
  await api('platform/zudo',{method:'PATCH',body:JSON.stringify(b)});toast('Zudo configuration saved.');ownerZudo();
 }catch(err){toast(err.message)}};
 $('#healthConfig').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.enabled=b.enabled==='true';b.global_daily_limit=+b.global_daily_limit;try{
  await api('platform/business-health',{method:'PATCH',body:JSON.stringify(b)});toast('Business AI Health controls saved.');ownerZudo();
 }catch(err){toast(err.message)}};
}
async function zudoLogModal(id){
 try{
  const d=await api('platform/zudo/conversation/'+id);
  const dlg=ocDialog({title:'Zudo conversation',icon:ocIcon('msg'),tone:'info',size:'lg',
  body:`<div class="oc-dl" style="margin-bottom:14px"><div class="oc-di"><small>Title</small><div>${esc(d.title||'—')}</div></div><div class="oc-di"><small>Messages</small><div>${d.messages?.length||0}</div></div></div>
  <div style="display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow-y:auto;padding-right:4px">${(d.messages||[]).map(m=>`<div style="align-self:${m.role==='assistant'?'flex-start':'flex-end'};max-width:85%"><div style="padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;background:${m.role==='assistant'?'var(--oc-neu-soft)':'var(--oc-accent)'};color:${m.role==='assistant'?'var(--oc-text)':'#fff'}">${esc(m.content)}</div><div class="oc-mut" style="font-size:10.6px;margin:3px 4px 0">${m.role==='assistant'?'Zudo':'User'} · ${ocDT(m.created_at)}</div></div>`).join('')||ocEmpty(ocIcon('msg'),'No messages')}</div>`});
 }catch(e){toast('Conversation could not be loaded: '+e.message)}
}

/* ---------- TrueBill (owner) ---------- */
async function ownerTrueBill(){
 const [settings,scans]=await Promise.all([api('platform/addons'),api('platform/truebill/scans').catch(()=>[])]);
 const tb=settings.find(x=>x.addon_key==='truebill');
 $('#page').innerHTML=ocView(ocHead('TrueBill','Invoice QR verification. Scan records are written whenever an invoice QR is verified on the public site.',tb?'<button type="button" class="oc-btn oc-btn-secondary" id="tbSetup">Setup TrueBill</button>':'')+`
 <div class="oc-cards">
  ${ocStat('Status',tb&&tb.enabled?'Active':'Inactive','add-on visibility for shop checkout','',(tb&&tb.enabled)?'ok':'neu')}
  ${ocStat('Price',`৳ ${Number(tb?.unit_price||0).toLocaleString('en-BD')}`,'per day of validity','','accent')}
  ${ocStat('Validity range',tb?`${tb.min_days}–${tb.max_days} days`:'—','choose at purchase','','info')}
  ${ocStat('Verification URL',esc(tb?.url||'Public base URL'),'used in QR codes','','info')}
 </div>
 ${tb&&tb.enabled?`<div class="oc-card"><div class="oc-cardhead"><h2>How it works</h2></div><div class="oc-cardbody"><ul class="oc-chk"><li><span class="oc-ch">${ocIcon('check')}</span>Every posted invoice gets a unique verification QR when TrueBill is active on the license or add-on.</li><li><span class="oc-ch">${ocIcon('check')}</span>Scanning opens the public EMS verification page — each scan is recorded below.</li><li><span class="oc-ch">${ocIcon('check')}</span>Coverage is controlled by license plans and add-on sales; no daily limit applies.</li></ul></div></div>`:''}
 <div class="oc-card is-flush"><div class="oc-cardhead"><h2>Verification scans</h2><p>Recorded when someone scans a TrueBill QR code on an invoice.</p></div><div class="oc-cardbody">${scans.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Scanned at</th><th>Shop ID</th><th>Administrator ID</th><th>Invoice no.</th><th>Kind</th></tr></thead><tbody>${scans.map(s=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDT(s.scanned_at)}</td><td><code class="oc-code">${esc(s.shop_code||'—')}</code></td><td><code class="oc-code">${esc(s.admin_code||'—')}</code></td><td><b>${esc(s.invoice_number)}</b></td><td><span class="oc-tag">${esc(s.invoice_kind||'—')}</span></td></tr>`).join('')}</tbody></table>`):ocEmpty(ocIcon('qr'),'No scans yet','Scans appear here the first time an invoice QR code is verified.')}</div></div>`);
 if(tb)$('#tbSetup').onclick=()=>addonSetup(tb,ownerTrueBill);
}

/* ---------- Vaultium (owner) ---------- */
async function ownerVaultium(){
 const d=await api('platform/vaultium');
 const bd=d.breakdown||[];
 $('#page').innerHTML=ocView(ocHead('Vaultium','Cloud file storage attached to invoices and expenses. Storage GB is allocated through license plans and add-ons.')+`
 <div class="oc-cards">
  ${ocStat('R2 binding',d.r2Binding?'Ready':'Missing',d.r2Binding?'Bucket connected':'Add VAULTIUM binding in Cloudflare','',d.r2Binding?'ok':'err')}
  ${ocStat('Storage used',`${d.usedGB||0} GB`,'across all shops','','accent')}
  ${ocStat('Files',d.files||0,'documents & images','','info')}
  ${ocStat('Allocation','Add-on based','license plans / add-ons control GB','','neu')}
 </div>
 <div class="oc-card is-flush"><div class="oc-cardhead"><h2>Shop usage</h2><p>Storage used per shop, with administrator short ID, allowance, period and status.</p></div><div class="oc-cardbody">
 ${bd.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Shop ID</th><th>Administrator ID</th><th>Limit</th><th>Usage</th><th>Period (expires)</th><th>Status</th></tr></thead><tbody>${bd.map(x=>{const lim=Number(x.limit||0),used=Number(x.usedGB||0),pct=lim>0?Math.min(100,used/lim*100):0;return `<tr><td><code class="oc-code">${esc(x.shop_code||'—')}</code></td><td><code class="oc-code">${esc(x.admin_code||'—')}</code></td><td>${x.limit?x.limit+' GB':'—'}</td><td><div style="min-width:140px"><b>${x.usedGB} GB</b>${lim>0?`<div class="oc-progress ${pct>=90?'':'ok'}" style="margin-top:3px"><i style="width:${pct}%"></i></div>`:''}</div></td><td class="oc-mut">${x.expires?ocDate(x.expires):'—'}</td><td><span class="oc-pill ${x.status==='Active'?'ok':'neu'}">${esc(x.status)}</span></td></tr>`}).join('')}</tbody></table>`):ocEmpty(ocIcon('file'),'No files uploaded yet','Once shops attach files through Vaultium, usage appears here.')}</div></div>
 <div class="oc-card"><div class="oc-cardhead"><h2>Cloudflare R2 setup</h2></div><div class="oc-cardbody"><p class="oc-dsub" style="margin:0 0 8px">Create an R2 bucket in your Cloudflare account and bind it as <b>VAULTIUM</b> in this Pages project (Settings → Functions → R2 bucket bindings). No other configuration is needed — you control pricing and GB via license plans and add-on Setup.</p></div></div>`);
}

/* ---------- HelpDesk (owner) ---------- */
async function ownerHelpdesk(){
 const moneyT=v=>ocDT(v);
 let list=[],currentAdmin=null;
 const convMessages=m=>m.length?m.map(x=>`<div class="oc-hdmsg ${x.sender_type==='admin'?'them':'me'}"><div class="oc-hdbub">${esc(x.content).replace(/\n/g,'<br>')}</div><span class="oc-hdt">${moneyT(x.created_at)}</span></div>`).join(''):'';
 const renderList=()=>{
  const box=$('#hdList');if(!box)return;
  box.innerHTML=list.length?list.map(a=>`<button type="button" class="oc-hditem ${currentAdmin===a.id?'on':''}" data-hd-admin="${a.id}">
   <span class="oc-ava2">${esc((a.name||'?').slice(0,1).toUpperCase())}</span>
   <span class="oc-hdmeta"><b>${esc(a.name)}</b><small>#${esc(a.admin_code||'—')} · ${esc(a.email||'')}</small><em>${a.last_message?esc(a.last_message.slice(0,52)):'No messages yet'}</em></span>
   ${a.unread?`<em class="oc-hdb">${a.unread}</em>`:''}</button>`).join(''):'<div style="padding:22px 16px;text-align:center;color:var(--oc-mut)">No administrators yet.</div>';
  document.querySelectorAll('#hdList [data-hd-admin]').forEach(x=>x.onclick=()=>openChat(x.dataset.hdAdmin));
 };
 const openChat=async adminId=>{
  currentAdmin=adminId;
  const a=list.find(x=>x.id===adminId);
  const right=$('#hdConv');
  right.innerHTML=`<div class="oc-hdconvhead"><span class="oc-ava2">${esc((a?.name||'?').slice(0,1).toUpperCase())}</span><div style="flex:1;min-width:0"><b>${esc(a?.name||'Administrator')}</b> <small class="oc-mut">#${esc(a?.admin_code||'—')} · ${esc(a?.email||'')}</small></div><span class="oc-pill ${a?.active!==false?'ok':'neu'}">${a?.active!==false?'Active':'Inactive'}</span></div>
  <div class="oc-hdmsgs" id="hdConvMsgs"><div class="oc-loading"><span class="oc-spin"></span>Loading conversation…</div></div>
  <form class="oc-hdcomp" id="hdConvForm"><textarea class="oc-textarea" id="hdConvInput" rows="1" placeholder="Reply to this administrator…"></textarea><button type="submit" class="oc-btn" aria-label="Send">${ocIcon('send')}</button></form>`;
  renderList();
  await api('platform/helpdesk/read',{method:'POST',body:JSON.stringify({adminId})}).catch(()=>{});
  let c;
  try{c=await api('platform/helpdesk/conversation/'+adminId)}catch(err){toast(err.message);return}
  const msgs=$('#hdConvMsgs');msgs.innerHTML=convMessages(c.messages)||ocEmpty(ocIcon('msg'),'No messages yet','Say hello to this administrator.');
  msgs.scrollTop=msgs.scrollHeight;
  const ta=$('#hdConvInput');if(ta){const auto=()=>{ta.style.height='auto';ta.style.height=Math.min(130,ta.scrollHeight)+'px'};ta.oninput=auto}
  $('#hdConvForm').onsubmit=async ev=>{ev.preventDefault();const input=$('#hdConvInput'),content=input.value.trim();if(!content)return;try{
   await api('platform/helpdesk/send',{method:'POST',body:JSON.stringify({adminId,content})});
   input.value='';input.style.height='auto';
   const u=await api('platform/helpdesk/conversation/'+adminId);
   const box=$('#hdConvMsgs');box.innerHTML=convMessages(u.messages);box.scrollTop=box.scrollHeight;
   const fresh=await api('platform/helpdesk');list=fresh;renderList();updateBadge(list);
  }catch(err){toast(err.message)}};
 };
 const updateBadge=arr=>{const n=arr.reduce((t,a)=>t+(a.unread||0),0),b=$('#ohbBadge');if(b){b.textContent=n;b.hidden=n===0}};
 list=await api('platform/helpdesk');
 $('#page').innerHTML=ocView(ocHead('HelpDesk','One continuous conversation thread with each administrator.')+`
 <div class="oc-hd"><div class="oc-hdlist"><div class="oc-hdsearch">${ocSearch('Search administrators…',' id="hdSearch"')}</div><div class="oc-hdrows" id="hdList"></div></div>
 <section class="oc-hdconv" id="hdConv"><div class="oc-hdempty"><span class="oc-icob" style="width:46px;height:46px;margin:0 auto 12px">${ocIcon('msg')}</span><b>Select an administrator</b><p>Choose a conversation on the left to view and reply to their messages.</p></div></section></div>`);
 updateBadge(list);
 const s=$('#hdSearch');if(s)s.oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#hdList .oc-hditem').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q))};
 renderList();
}

/* ---------- Premium Add-Ons (owner) ---------- */
async function ownerAddons(){
 const [settings,purchases]=await Promise.all([api('platform/addons'),api('platform/addon-purchases')]);
 const money=v=>Number(v||0).toLocaleString('en-BD');
 let filter='all';
 const pending=purchases.filter(x=>x.status==='pending');
 const data=()=>purchases.filter(x=>filter==='all'||x.status===filter);
 const render=()=>{
  const rows=data();
  $('#page').innerHTML=ocView(ocHead('Premium Add-Ons','Optional paid services — ConnectX email, Zudo AI, AI Business Health, TrueBill verification and Vaultium storage.',
  `<button type="button" class="oc-btn oc-btn-secondary" id="addonCheckoutSetup">Payment &amp; coupon setup</button>`)+`
  <div class="oc-cards">
   ${ocStat('Add-ons',settings.length,'configured services','','accent')}
   ${ocStat('Active for shops',settings.filter(x=>x.enabled).length,'purchasable right now','','ok')}
   ${ocStat('Pending purchases',pending.length,'awaiting review','','warn')}
   ${ocStat('Collected (active)',`৳ ${money(purchases.filter(x=>x.status==='active').reduce((t,x)=>t+Math.max(0,Number(x.amount)-Number(x.discount_amount)),0))}`,'from approved add-on sales','','info')}
  </div>
  <div class="oc-owneraddons" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:14px;margin-bottom:18px">
   ${settings.map(x=>`<div class="oc-card" style="margin:0;display:flex;flex-direction:column"><div class="oc-cardbody" style="display:flex;flex-direction:column;gap:9px;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div class="addonArt" style="height:56px;width:56px;border-radius:10px;background:var(--oc-surface2);border:1px solid var(--oc-line2);display:grid;place-items:center;overflow:hidden;flex:0 0 auto">${addonArt(x)}</div><span class="oc-pill ${x.enabled?'ok':'neu'}">${x.enabled?'Active':'Inactive'}</span></div>
    <h3 style="margin:0;font-size:14.6px">${esc(addonName(x))}</h3>
    <p style="margin:0;font-size:12.4px;color:var(--oc-mut);line-height:1.5;flex:1">${esc(x.details||'')}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11.4px"><span class="oc-tag">৳ ${money(x.unit_price)}${x.addon_key==='vaultium'?'/month':'/day'}</span><span class="oc-tag">${x.addon_key==='vaultium'?x.min_days+'–'+x.max_days+' mo':x.min_days+'–'+x.max_days+' d'}</span>${x.addon_key!=='truebill'&&x.addon_key!=='vaultium'?`<span class="oc-tag">${x.min_daily_limit}–${x.max_daily_limit}/d</span>`:''}</div>
    <div style="display:flex;justify-content:flex-end"><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-addon-setup="${x.addon_key}">Setup</button></div></div></div>`).join('')}
  </div>
  <div class="oc-card is-flush"><div class="oc-cardhead"><div><h2>Purchase requests</h2><p>Approve after verifying the bKash / Nagad transaction ID in the merchant portal.</p></div></div>
  <div class="oc-cardbody" style="padding-top:4px">
   <div class="oc-filters" style="margin:8px 0 13px">${[['all','All'],['pending','Pending'],['active','Active'],['rejected','Rejected'],['expired','Expired']].map(([f,l])=>`<button type="button" class="oc-fchip ${filter===f?'on':''}" data-oc-f="${f}">${l}</button>`).join('')}</div>
   ${rows.length?ocTblWrap(`<table class="oc-tbl"><thead><tr><th>Requested</th><th>Administrator</th><th>Add-on</th><th class="num">Amount</th><th class="num">Discount</th><th class="num">Payable</th><th>Payment</th><th>Transaction ID</th><th>Status</th><th style="text-align:right">Action</th></tr></thead><tbody>
   ${rows.map(x=>`<tr><td class="oc-mut" style="white-space:nowrap">${ocDate(x.created_at)}</td>
   <td><div class="oc-cellstack"><b>${esc(x.administrators?.name||'—')}</b><small><code class="oc-code">${x.administrators?.admin_code?('#'+esc(x.administrators.admin_code)):'—'}</code></small></div></td>
   <td><b>${esc(ADDON_NAMES[x.addon_key]||x.addon_key)}</b><div class="oc-mut" style="font-size:11.6px">${x.addon_key==='vaultium'?x.validity_days+' months · '+x.daily_limit+' GB':x.addon_key==='truebill'?x.validity_days+' days':x.validity_days+' days · '+x.daily_limit+'/day'}</div></td>
   <td class="num">${money(x.amount)} BDT</td>
   <td class="num oc-mut">${Number(x.discount_amount||0)?'− '+money(x.discount_amount)+' BDT':'—'}</td>
   <td class="num"><b>${money(Math.max(0,Number(x.amount||0)-Number(x.discount_amount||0)))} BDT</b></td>
   <td><span class="oc-tag">${esc(x.payment_method||'—')}</span><div class="oc-mut" style="font-size:11.5px">${esc(x.payment_number||'')}</div></td>
   <td><code class="oc-code">${esc(x.transaction_id||'—')}</code>${x.coupon_code?`<div class="oc-mut" style="font-size:11.5px">${esc(x.coupon_code)}</div>`:''}</td>
   <td><span class="oc-pill ${x.status==='active'?'ok':x.status==='pending'?'warn':x.status==='rejected'?'err':'neu'}">${esc(x.status)}</span>${x.expires_at?`<div class="oc-mut" style="font-size:11px">${ocDate(x.expires_at)}</div>`:''}</td>
   <td><div class="oc-acts">${x.status==='pending'?`<button type="button" class="oc-btn oc-btn-ok oc-btn-sm" data-oc-addappr="${x.id}">${ocIcon('check')}Approve</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-oc-addrej="${x.id}">Reject</button>`:`<span class="oc-mut" style="font-size:12px">Reviewed</span>`}</div></td></tr>`).join('')}</tbody></table>`):ocEmpty(ocIcon('gem'),'No purchase requests','Purchase requests from administrators appear here.')}
  </div></div>`);
  document.querySelectorAll('[data-oc-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.ocF;render()});
  document.querySelectorAll('[data-addon-setup]').forEach(b=>b.onclick=()=>addonSetup(settings.find(x=>x.addon_key===b.dataset.addonSetup),ownerAddons));
  document.querySelectorAll('[data-oc-addappr]').forEach(b=>b.onclick=()=>ocAddonReview(b.dataset.ocAddappr,'active','addons'));
  document.querySelectorAll('[data-oc-addrej]').forEach(b=>b.onclick=()=>ocAddonReview(b.dataset.ocAddrej,'rejected','addons'));
  $('#addonCheckoutSetup').onclick=async()=>{
   try{
    const c=await api('platform/addon-checkout');
    const dlg=ocDialog({title:'Payment & coupon setup',icon:ocIcon('tag'),tone:'info',size:'lg',
    body:`<div style="display:grid;gap:18px">
     <form id="cpPayForm" class="oc-formgrid"><div><h3 style="margin:0 0 3px;font-size:14px">Checkout payment instructions</h3><p class="oc-hint" style="margin:2px 0 9px">Shown to administrators at add-on checkout.</p><label class="oc-flabel">Instructions</label><textarea class="oc-textarea" name="payment_info" rows="3">${esc(c.settings?.payment_info||'')}</textarea><div style="display:flex;justify-content:flex-end;margin-top:9px"><button type="submit" class="oc-btn oc-btn-secondary oc-btn-sm">Save payment instructions</button></div></div></form>
     <div><h3 style="margin:0 0 9px;font-size:14px">Coupon codes</h3><div id="cpCouponList" class="oc-cplist"></div>
     <form id="cpAddForm" class="oc-fgrid" style="margin-top:10px;grid-template-columns:1fr 110px auto;align-items:end"><div><label class="oc-flabel">Code</label><input class="oc-input" name="code" placeholder="OFFER20" maxlength="20" required></div><div><label class="oc-flabel">% off</label><input class="oc-input" name="percent_off" type="number" min="1" max="100" placeholder="20" required></div><button type="submit" class="oc-btn oc-btn-sm">Add coupon</button></form></div></div>`});
    const renderCoupons=()=>{const box=dlg.body.querySelector('#cpCouponList');
     box.innerHTML=c.coupons.length?`<div style="display:grid;gap:7px">${c.coupons.map(cp=>`<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--oc-line);border-radius:8px;padding:8px 11px"><code class="oc-code">${esc(cp.code)}</code><span class="oc-pill accent">${cp.percent_off}% off</span><div style="flex:1"></div><span class="oc-pill ${cp.active?'ok':'neu'}">${cp.active?'Active':'Inactive'}</span><button type="button" class="oc-btn oc-btn-secondary oc-btn-sm" data-cp-toggle="${esc(cp.code)}">Toggle</button><button type="button" class="oc-btn oc-btn-dangerghost oc-btn-sm" data-cp-del="${esc(cp.code)}">Delete</button></div>`).join('')}</div>`:'<p class="oc-mut">No coupons yet.</p>';
     box.querySelectorAll('[data-cp-toggle]').forEach(b=>b.onclick=async()=>{const code=b.dataset.cpToggle,cur=c.coupons.find(x=>x.code===code);try{await api('platform/addon-coupons',{method:'PATCH',body:JSON.stringify({code,active:!cur.active})});cur.active=!cur.active;renderCoupons();toast('Coupon '+(cur.active?'activated.':'deactivated.'))}catch(err){toast(err.message)}});
     box.querySelectorAll('[data-cp-del]').forEach(b=>b.onclick=async()=>{const code=b.dataset.cpDel;const ok=await ocConfirm({title:'Delete coupon',danger:true,confirmText:'Delete',message:`Delete coupon code ${code}? This cannot be undone.`});if(!ok)return;try{await api('platform/addon-coupons?code='+encodeURIComponent(code),{method:'DELETE'});c.coupons=c.coupons.filter(x=>x.code!==code);renderCoupons();toast('Coupon deleted.')}catch(err){toast(err.message)}});
    };
    renderCoupons();
    dlg.body.querySelector('#cpPayForm').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));try{await api('platform/addon-checkout',{method:'PATCH',body:JSON.stringify({payment_info:b.payment_info})});toast('Payment instructions saved.')}catch(err){toast(err.message)}};
    dlg.body.querySelector('#cpAddForm').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));try{const x=await api('platform/addon-coupons',{method:'POST',body:JSON.stringify({code:b.code,percent_off:+b.percent_off,active:true})});c.coupons.unshift(x);renderCoupons();ev.target.reset();toast('Coupon added.')}catch(err){toast(err.message)}};
   }catch(err){toast(err.message)}
  };
 };
 render();
}
function addonSetup(x,after){
 const noLimit=addonNoLimit(x),isVault=addonIsVault(x);
 const d=ocDialog({title:esc(addonName(x))+' setup',icon:ocIcon('gem'),tone:'info',size:'lg',
 body:`<form id="ocAddonForm" class="oc-formgrid">
  <div><label class="oc-flabel">Title</label><input class="oc-input" name="title" value="${esc(x.title||'')}" placeholder="${esc(ADDON_NAMES[x.addon_key]||'')}"></div>
  ${noLimit?`<div><label class="oc-flabel">Verification URL <span class="oc-opt">(base URL for QR codes)</span></label><input class="oc-input" name="url" type="url" value="${esc(x.url||'')}" placeholder="https://ems.example.com"></div>`:''}
  <div><label class="oc-flabel">Image URL (PNG)</label><input class="oc-input" name="image_url" type="url" value="${esc(x.image_url||'')}" placeholder="https://example.com/addon.png"></div>
  <div class="oc-fgrid">
   <div><label class="oc-flabel">Status</label><select class="oc-select" name="enabled"><option value="true" ${x.enabled?'selected':''}>Active</option><option value="false" ${!x.enabled?'selected':''}>Inactive</option></select></div>
   <div><label class="oc-flabel">Unit price${isVault?' (per month)':''}</label><input class="oc-input" name="unit_price" type="number" step=".01" value="${x.unit_price}"></div>
   <div><label class="oc-flabel">Minimum ${isVault?'months':'days'}</label><input class="oc-input" name="min_days" type="number" value="${x.min_days}"></div>
   <div><label class="oc-flabel">Maximum ${isVault?'months':'days'}</label><input class="oc-input" name="max_days" type="number" value="${x.max_days}"></div>
   ${noLimit?'':`<div><label class="oc-flabel">Minimum ${isVault?'GB':'daily limit'}</label><input class="oc-input" name="min_daily_limit" type="number" value="${x.min_daily_limit}"></div>
   <div><label class="oc-flabel">Maximum ${isVault?'GB':'daily limit'}</label><input class="oc-input" name="max_daily_limit" type="number" value="${x.max_daily_limit}"></div>`}
  </div>
  <div><label class="oc-flabel">Details</label><textarea class="oc-textarea" name="details" rows="3">${esc(x.details)}</textarea></div></form>`});
 const form=d.body.querySelector('#ocAddonForm');
 const btn=document.createElement('button');btn.type='submit';btn.className='oc-btn oc-btn-sm';btn.textContent='Save setup';btn.form='ocAddonForm';
 d.el.querySelector('.oc-df').appendChild(btn);
 form.onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(form));Object.assign(b,{addon_key:x.addon_key,title:b.title,url:noLimit?(b.url?String(b.url).trim():null):null,image_url:b.image_url?String(b.image_url).trim():null,enabled:b.enabled==='true',unit_price:+b.unit_price,min_days:+b.min_days,max_days:+b.max_days,min_daily_limit:noLimit?1:(+b.min_daily_limit||1),max_daily_limit:noLimit?1:(+b.max_daily_limit||1)});try{
  await api('platform/addons',{method:'PATCH',body:JSON.stringify(b)});
  d.close();toast('Add-on setup saved.');(after||ownerAddons)();
 }catch(err){toast(err.message)}};
}

/* ---------- Factory reset ---------- */
async function ownerFactoryReset(){
 $('#page').innerHTML=ocView(ocHead('Factory reset','Danger zone — permanently wipes the entire EMS platform.')+`
 <div class="oc-card" style="border-color:var(--oc-err-line);max-width:760px"><div class="oc-cardhead"><h2 style="color:var(--oc-err)">Factory reset EMS</h2></div>
 <div class="oc-cardbody">
  ${ocCall('danger','<b>This permanently deletes ALL data</b> — administrators, shops, invoices, inventory, customers, suppliers, expenses, staff, licenses, add-ons, TrueBill scans, HelpDesk messages, Vaultium files and all platform settings — then re-seeds the defaults. This cannot be undone.')}
  <div class="oc-formgrid"><div><label class="oc-flabel">Type <code class="oc-code" style="font-size:12px">FACTORY RESET EMS</code> to confirm</label><input class="oc-input" id="frConfirm" placeholder="FACTORY RESET EMS" autocomplete="off" style="max-width:320px"></div>
  <div style="display:flex;gap:9px"><button type="button" class="oc-btn oc-btn-danger" id="frGo">${ocIcon('alert')}Factory reset EMS</button><button type="button" class="oc-btn oc-btn-secondary" data-oc-go="overview">Cancel</button></div></div>
 </div></div>`);
 const go=$('#frGo');
 const upd=()=>{go.disabled=$('#frConfirm').value.trim()!=='FACTORY RESET EMS'};
 $('#frConfirm').oninput=upd;upd();
 go.onclick=async()=>{
  const c=$('#frConfirm').value.trim();
  const ok=await ocConfirm({title:'Factory reset EMS',danger:true,confirmText:'Reset everything',message:'This permanently deletes ALL data. Continue?',detail:'<div class="oc-chk"><li><span class="oc-ch">'+ocIcon('x')+'</span>All administrators, shops, invoices and business records will be deleted</li><li><span class="oc-ch">'+ocIcon('x')+'</span>Default platform settings will be re-seeded</li><li><span class="oc-ch">'+ocIcon('x')+'</span>You will be signed out</li></div>'});
  if(!ok)return;
  try{await api('platform/factory-reset',{method:'POST',body:JSON.stringify({confirmation:c})});toast('Factory reset complete.');logout()}catch(e){toast(e.message)}
 };
}






















async function report(){
  const [salesRows,purchaseRows,expenseRows]=await Promise.all([
    api('invoices?kind=sale'), api('invoices?kind=purchase'), api('expense')
  ]);
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
const healthView=()=>`<section class="businessHealth">
  <section class="healthHero"><div><span>Read-only AI assessment</span><h2>Business AI Health</h2><p>Scan the selected sales, purchase, expense, due, customer, supplier, staff, store-profile and activity data. Business AI Health never edits your records.</p></div><div class="healthUsage" id="healthUsage">Checking availability…</div></section>
  <section class="healthStart"><div><h3>Generate health report</h3><p>The AI evaluates only the selected date range and gives practical, data-based suggestions.</p></div><button id="generateHealth" type="button">Generate AI health report</button></section>
  <div id="healthResult" class="healthResult"><div class="reportEmpty">Choose a date range above, then generate a Business AI Health report.</div></div>
</section>`;
const renderHealth=x=>{let d=x.snapshot,m=v=>reportMoney(v),list=(rows,empty)=>rows?.length?`<ol>${rows.map(r=>`<li><span>${esc(r.name)}</span><b>${m(r.total)}</b></li>`).join('')}</ol>`:`<p class="muted">${empty}</p>`;$('#healthResult').innerHTML=`<section class="healthScore"><div class="scoreRing"><b>${x.score}</b><span>/ 100</span></div><div><span>Business health score</span><h2>${x.score>=80?'Healthy business position':x.score>=60?'Needs attention':'Priority action needed'}</h2><p>Calculated from the selected period’s due level, discount level, store profile completeness and recorded system errors.</p></div></section><div class="healthMetrics"><article><small>Sales</small><b>${m(d.sales.total)}</b><span>${d.sales.count} invoice(s)</span></article><article><small>Purchase</small><b>${m(d.purchase.total)}</b><span>${d.purchase.count} invoice(s)</span></article><article><small>Expense</small><b>${m(d.expense.total)}</b><span>${d.expense.count} record(s)</span></article><article><small>Total due</small><b>${m(d.due.total)}</b><span>Recovered: ${m(d.due.recovered)}</span></article><article><small>Discount given</small><b>${m(d.sales.discount)}</b><span>Selected period</span></article><article><small>System errors</small><b>${d.errors}</b><span>Activity: ${d.activityCount}</span></article></div><div class="healthGrid"><section class="reportPanel"><div class="reportPanelHead"><div><h2>Data checks & risks</h2><p>Automatically calculated from your saved records.</p></div></div><ul class="healthFindings">${d.findings?.length?d.findings.map(i=>`<li>${esc(i)}</li>`).join(''):'<li>No automated risk was found in this selected period.</li>'}</ul><p class="healthProfile"><b>Store profile:</b> ${d.missing?.length?'Missing '+esc(d.missing.join(', '))+'.':'Email, phone and address are complete.'}</p></section><section class="reportPanel"><div class="reportPanelHead"><div><h2>Top business contributors</h2><p>Based on transaction value in the selected date range.</p></div></div><div class="healthLeaders"><div><h3>Top customers</h3>${list(d.topCustomers,'No sales customer data.')}</div><div><h3>Top suppliers</h3>${list(d.topSuppliers,'No purchase supplier data.')}</div><div><h3>Top sales staff</h3>${list(d.topSalesStaff,'No staff sales data.')}</div></div></section></div><section class="reportPanel healthInsights"><div class="reportPanelHead"><div><h2>AI business recommendations</h2><p>Read-only suggestions created from the calculated summary.</p></div></div><div>${esc(x.insights).replace(/\n/g,'<br>')}</div></section>`};


  const render=()=>{
    const data={sales:sum(rangeRows(all.sales)),purchase:sum(rangeRows(all.purchase)),expense:sum(rangeRows(all.expense))};
    const profit=data.sales.total-data.purchase.total-data.expense.total, netCash=data.sales.paid-data.purchase.paid-data.expense.paid;
    const cards=[['Sales',data.sales,'sales'],['Purchase',data.purchase,'purchase'],['Expense',data.expense,'expense']];
    const chartMax=Math.max(1,...cards.map(x=>x[1].total));
    $('#page').innerHTML=title('Business reports')+`<section class="reportPage">
      <div class="reportTabs" role="tablist"><button class="${active==='summary'?'on':''}" data-report-tab="summary">Summary report</button><button class="${active==='sales'?'on':''}" data-report-tab="sales">Sales report</button><button class="${active==='purchase'?'on':''}" data-report-tab="purchase">Purchase report</button><button class="${active==='expense'?'on':''}" data-report-tab="expense">Expense report</button>${state.businessHealthEver?`<button class="${active==='health'?'on':''}" data-report-tab="health">Business AI Health</button>`:''}</div>
      <section class="reportFilter"><div><span class="reportFilterLabel">Report period</span><b id="reportPeriodText">${prettyDate(start)} — ${prettyDate(end)}</b></div><div class="reportDateFields"><label>From<input id="reportStart" type="date" value="${start}" max="${today}"></label><label>To<input id="reportEnd" type="date" value="${end}" max="${today}"></label><button id="reportSearch" type="button">Search report</button></div></section>
      ${active==='summary'?`<div class="reportBody">
        <section class="reportIntro"><div><span>Management report</span><h2>Date range summary</h2><b class="reportStoreName">${esc(state.store?.name||'Shop')}</b><p>Sales, purchases and expenses based on transactions recorded from ${prettyDate(start)} to ${prettyDate(end)}.</p></div><button class="secondary" id="reportPrint" type="button">Print summary</button></section>
        <div class="reportKpis">${cards.map(([name,x,cls])=>`<article class="reportKpi ${cls}"><small>Total ${name}</small><strong>${reportMoney(x.total)}</strong><p><span>Paid <b>${reportMoney(x.paid)}</b></span><span>Due <b>${reportMoney(x.due)}</b></span></p></article>`).join('')}<article class="reportKpi profit ${profit<0?'negative':''}"><small>Estimated operating profit</small><strong>${profit<0?'−':''}${reportMoney(Math.abs(profit))}</strong><p>Sales − Purchase − Expense</p></article></div>
        <div class="reportGrid"><section class="reportPanel reportSummaryTable"><div class="reportPanelHead"><div><h2>Financial summary</h2><p>Total value, received or paid amount, and outstanding due.</p></div></div><div class="tablewrap"><table><thead><tr><th>Category</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead><tbody>${cards.map(([n,x,c])=>`<tr><td><span class="reportDot ${c}"></span>${n}</td><td>${reportMoney(x.total)}</td><td>${reportMoney(x.paid)}</td><td>${reportMoney(x.due)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="reportPanel reportProfit"><div class="reportPanelHead"><div><h2>Operating result</h2><p>Period estimate; it is not a cash-flow figure.</p></div></div><div class="reportProfitValue ${profit<0?'negative':''}">${profit<0?'−':''}${reportMoney(Math.abs(profit))}</div><div class="reportFormula"><span>Sales <b>${reportMoney(data.sales.total)}</b></span><i>−</i><span>Purchase <b>${reportMoney(data.purchase.total)}</b></span><i>−</i><span>Expense <b>${reportMoney(data.expense.total)}</b></span></div></section></div>
        <div class="reportGrid"><section class="reportPanel"><div class="reportPanelHead"><div><h2>Activity comparison</h2><p>Total transaction value during selected period.</p></div></div><div class="reportBarChart">${cards.map(([n,x,c])=>`<div class="reportBarRow"><span>${n}</span><div><i class="${c}" style="width:${x.total/chartMax*100}%"></i></div><b>${reportMoney(x.total)}</b></div>`).join('')}</div></section>
        <section class="reportPanel"><div class="reportPanelHead"><div><h2>Cash & due position</h2><p>Based on recorded paid amounts.</p></div></div><div class="reportCashRows"><p><span>Sales received</span><b>${reportMoney(data.sales.paid)}</b></p><p><span>Purchase & expense paid</span><b>${reportMoney(data.purchase.paid+data.expense.paid)}</b></p><p class="total"><span>Net cash movement</span><b>${netCash<0?'−':''}${reportMoney(Math.abs(netCash))}</b></p><p><span>Total outstanding due</span><b>${reportMoney(data.sales.due+data.purchase.due+data.expense.due)}</b></p></div></section></div>
      </div>`:active==='health'?healthView():`<section class="reportComing"><span>Coming next update</span><h2>${active[0].toUpperCase()+active.slice(1)} report</h2><p>The detailed ${active} report tab has been prepared. It will include transaction filters, customer or supplier details, payment status, export and print options in the next update.</p></section>`}
    </section>`;
    document.querySelectorAll('[data-report-tab]').forEach(b=>b.onclick=()=>{active=b.dataset.reportTab;render()});
    $('#reportSearch').onclick=()=>{let s=$('#reportStart').value,e=$('#reportEnd').value;if(!s||!e)return toast('Please select both dates.');if(s>e)return toast('The start date cannot be after the end date.');start=s;end=e;render()};
    $('#reportPrint')&&( $('#reportPrint').onclick=()=>window.print() );
    if(active==='health'){let usage=$('#healthUsage'),button=$('#generateHealth');api('business-health/availability').then(x=>{usage.textContent=x.enabled?`Daily limit: ${x.dailyLimit} · Used: ${x.usedToday} · Remaining: ${x.remaining}`:'Business AI Health is not available for this shop';button.disabled=!x.enabled||x.remaining<=0}).catch(e=>{usage.textContent=e.message;button.disabled=true});button.onclick=async()=>{let s=$('#reportStart').value,e=$('#reportEnd').value;if(!s||!e||s>e)return toast('Choose a valid date range.');button.disabled=true;button.textContent='Analyzing business data…';try{let x=await api('business-health/report',{method:'POST',body:JSON.stringify({startDate:s,endDate:e})});renderHealth(x);usage.textContent=`Daily limit: ${x.usage.dailyLimit} · Used: ${x.usage.usedToday} · Remaining: ${x.usage.remaining}`}catch(err){toast(err.message)}finally{button.disabled=false;button.textContent='Generate AI health report'}}}

  };
  render();
}

function salesTrendChart(t){
  const W=780,H=280,L=56,R=18,T=18,B=36,iw=W-L-R,ih=H-T-B,n=Math.max(2,t.daysInMonth||1);
  const all=t.thisMonth.concat(t.prevMonth),ymax=Math.max(1,...all);
  const x=i=>L+(i*(iw/(n-1)));
  const y=v=>T+ih-((v/ymax)*ih);
  const line=arr=>arr.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area=arr=>`${x(0).toFixed(1)},${y(0).toFixed(1)} `+arr.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')+` ${x(n-1).toFixed(1)},${y(0).toFixed(1)}`;
  const dots=arr=>arr.map((v,i)=>v>0?`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" class="tdot"/>`:'').join('');
  const yticks=[0,0.25,0.5,0.75,1].map(f=>{const vv=ymax*f;return `<text class="tylab" x="${L-8}" y="${(y(vv)+3.5).toFixed(1)}" text-anchor="end">${money(vv)}</text><line class="tgrid" x1="${L}" y1="${y(vv).toFixed(1)}" x2="${W-R}" y2="${y(vv).toFixed(1)}"/>`}).join('');
  const xticks=[];for(let i=0;i<n;i++){if(i===0||i===n-1||(i+1)%5===0)xticks.push(`<text class="txlab" x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle">${i+1}</text>`)}
  const up=t.growthPct>=0;
  return `<section class="panel salesTrendCard">
    <div class="trendHead"><div><h2>Sales Trend</h2><small>Total Transactions: ${money(t.thisTotal)}</small></div><span class="trendGrowth ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(t.growthPct).toFixed(2)}%</span></div>
    <div class="trendLegend"><span class="lgi"><i class="ldot ldot1"></i>This Month</span><span class="lgi"><i class="ldot ldot2"></i>Previous Month</span></div>
    <svg class="trendSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sales trend line chart">
      <defs><linearGradient id="trg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity=".28"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>
      ${yticks}${xticks.join('')}
      <polygon class="tarea" points="${area(t.thisMonth)}" fill="url(#trg1)"/>
      <polyline class="tline tline2" points="${line(t.prevMonth)}"/>
      <polyline class="tline tline1" points="${line(t.thisMonth)}"/>
      ${dots(t.thisMonth)}
    </svg>
  </section>`;
}
async function attendancePage(){
  const today=new Date(Date.now()+6*3600*1000).toISOString().slice(0,10);
  const dhakaLabel=()=>new Date(Date.now()+6*3600*1000).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  let selected={}; // staff_id -> true
  let status='present';
  const data=await api('attendance?date='+today);
  const renderStaffList=()=>{
    const box=$('#attStaffList'),q=$('#attSearch').value.toLowerCase();
    const rows=data.staffs.filter(x=>!q||(x.full_name+' '+x.user_id+' '+(x.position||'')).toLowerCase().includes(q));
    box.innerHTML=rows.length?rows.map(x=>`<div class="attStaffRow"><label class="attCheck"><input type="checkbox" class="attSel" data-id="${x.id}" ${selected[x.id]?'checked':''}></label><div class="attMeta"><b>${esc(x.full_name)}</b><small>${esc(x.user_id)} · ${esc(x.position||'—')}</small></div></div>`).join(''):'<p class="muted">No staff members found.</p>';
    box.querySelectorAll('.attSel').forEach(c=>c.onchange=()=>{const id=c.dataset.id;if(c.checked)selected[id]=true;else delete selected[id];renderStaffList()});
  };
  $('#page').innerHTML=title('Attendance')+`<div class="attWrap">
    <section class="attPanel">
      <div class="attDivider"></div>
      <div class="attHead"><h2>Select staff</h2><input id="attSearch" class="headsearch" placeholder="Search staff"></div>
      <div class="attSection1">
        <label class="attBulk"><input type="checkbox" id="attBulkAll"> Select all</label>
        <div id="attStaffList" class="attStaffList"></div>
      </div>
    </section>
    <section class="attPanel attRight">
      <div class="attDivider"></div>
      <div class="attHead"><h2>Attendance register</h2><span class="attDate">${esc(dhakaLabel())}</span></div>
      <div class="attSection2">
        <div class="attSlideRow"><span>Mark attendance as</span>
          <label class="attSlide" id="attSlide"><input type="checkbox" id="attStatus" checked><span class="attSlideTrack"><i></i></span><span class="attSlideLabels"><b class="on">Present</b><b>Absent</b></span></label>
        </div>
        <label>Note<textarea id="attNote" rows="3" placeholder="Optional note"></textarea></label>
        <button id="attSave">Save attendance</button>
      </div>
    </section>
  </div>
  <section class="panel attList"><div class="attListHead"><h2>Saved attendance</h2><input id="attSavedSearch" class="headsearch" placeholder="Search by name, user ID, or date"></div><div id="attSaved"></div></section>`;
  renderStaffList();
  $('#attSearch').oninput=renderStaffList;
  $('#attBulkAll').onchange=e=>{const ck=e.target.checked;for(const x of data.staffs){if(ck)selected[x.id]=true;else delete selected[x.id]}renderStaffList()};
  $('#attStatus').onchange=e=>{status=e.target.checked?'present':'absent'};
  const renderSaved=()=>{
    const box=$('#attSaved'),q=($('#attSavedSearch')?.value||'').toLowerCase();
    const rows=data.records.filter(r=>!q||(r.full_name+' '+r.user_id+' '+r.attendance_date).toLowerCase().includes(q));
    box.innerHTML=rows.length?`<div class="tablewrap"><table><thead><tr><th>Date</th><th>Name</th><th>User ID</th><th>Position</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.attendance_date)}</td><td>${esc(r.full_name)}</td><td>${esc(r.user_id)}</td><td>${esc(r.position||'—')}</td><td><span class="attBadge ${r.status}">${r.status}</span></td><td>${esc(r.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No attendance records found.</p>';
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

function vaultPreview(url,name){
  const e=document.createElement('div');e.className='modal vaultPreviewModal';
  e.innerHTML=`<div class="modalbox vaultPreviewBox"><div class="modalhead"><h2>${esc(name)}</h2><button type="button" id="vpClose">×</button></div><div class="vaultPreviewBody"><img src="${url}" alt="${esc(name)}"></div></div>`;
  document.body.append(e);
  e.querySelector('#vpClose').onclick=()=>{e.remove();URL.revokeObjectURL(url)};
  e.addEventListener('click',ev=>{if(ev.target===e){e.remove();URL.revokeObjectURL(url)}});
}
async function salaryPage(){
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNow=()=>new Date(Date.now()+6*3600*1000).toISOString().slice(0,7);
  const monthLabel=ym=>{let [y,m]=String(ym).split('-');return (MN[+m-1]||'')+' '+(y||'')};
  const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const typeBadge=t=>t==='due'?'<span class="salBadge salBdue">Due</span>':t==='advance'?'<span class="salBadge salBadv">Advance</span>':'<span class="salBadge salBcur">Current</span>';
  const statusBadge=d=>Number(d)<=0?'<span class="salBadge salBpaid">Paid</span>':'<span class="salBadge salBunpaid">Unpaid</span>';
  let staffs=[],summary={},invoices=[],att={present:0,total:0},selected=null,q='';
  const byId=id=>staffs.find(x=>x.id===id);
  const canAdd=canAccess('salary','add'),canDel=canAccess('salary','delete');

  $('#page').innerHTML=title('Salary')+`<div class="salWrap">
    <div class="salHead">
      <div class="salBrand"><span class="salBrandIcon">${lucide('coins')}</span><div><h2>Staff Salary</h2><small>Payroll invoices · attendance-based pay · advances</small></div></div>
      <div class="salHeadRight"><span class="salDateBadge">${lucide('calendar')} ${monthLabel(monthNow())}</span><button class="salGhost" id="salBack">${lucide('undo')} Staff manager</button></div>
    </div>
    <div class="salGrid">
      <aside class="salSide">
        <div class="salSideHead"><h3>${lucide('users')} Staff</h3><span class="salCount" id="salCount">0</span></div>
        <div class="salSearch">${lucide('search')}<input id="salSearch" placeholder="Search staff…"></div>
        <div class="salList" id="salList"></div>
      </aside>
      <section class="salMain" id="salMain"><p class="muted">Loading payroll…</p></section>
    </div></div>`;
  $('#salBack').onclick=()=>page('staff-manager');
  $('#salSearch').oninput=e=>{q=e.target.value;renderList()};

  function renderList(){
    let list=q?staffs.filter(x=>JSON.stringify([x.full_name,x.position,x.user_id]).toLowerCase().includes(q.toLowerCase())):staffs;
    $('#salCount').textContent=list.length;
    $('#salList').innerHTML=list.length?list.map(x=>`<div class="salStaffItem${x.id===selected?' active':''}" data-id="${x.id}"><div class="salAvatar">${esc(initials(x.full_name))}</div><div class="salInfo"><div class="salName">${esc(x.full_name)}</div><div class="salRole">${esc(x.position||'—')}</div></div><span class="salDot${x.active===false?'':' on'}"></span></div>`).join(''):'<p class="salEmpty">No staff found.</p>';
    document.querySelectorAll('.salStaffItem').forEach(el=>el.onclick=()=>select(el.dataset.id));
  }

  function profileHtml(p){
    const s=summary[p.id]||{};
    return `<div class="salProfile">
      <div class="salProfileLeft">
        <div class="salBigAvatar">${esc(initials(p.full_name))}</div>
        <div><h3>${esc(p.full_name)}</h3><div class="salMeta">
          <span>${lucide('briefcase')} ${esc(p.position||'—')}</span>
          <span>${lucide('calendar')} Joined ${esc((p.created_at||'').slice(0,10))}</span>
          <span>${lucide('mail')} ${esc(p.email||'—')}</span>
        </div></div>
      </div>
      <div class="salProfileRight">
        <span class="salStatBadge">${lucide('banknote')} Base: <b>৳ ${money(s.monthly||0)}</b></span>
        <span class="salStatBadge">${lucide('clock')} Present: <b>${att.present}/${att.total}d</b></span>
      </div></div>`;
  }
  function cardsHtml(p){
    const s=summary[p.id]||{};
    return `<div class="salCards">
      <div class="salCard accBlue"><div class="lbl">Monthly Salary</div><div class="val">৳ ${money(s.monthly||0)}</div></div>
      <div class="salCard accOrange"><div class="lbl">Outstanding Due</div><div class="val">৳ ${money(s.outstandingDue||0)}</div></div>
      <div class="salCard accRed"><div class="lbl">Taken Advance</div><div class="val">৳ ${money(s.takenAdvance||0)}</div></div>
      <div class="salCard accGreen"><div class="lbl">Total Paid (YTD)</div><div class="val">৳ ${money(s.totalPaidYTD||0)}</div></div>
    </div>`;
  }
  function formHtml(p){
    const s=summary[p.id]||{},pct=att.total>0?Math.round(att.present/att.total*100):0;
    return `<div class="salBox">
      <div class="salBoxTitle">${lucide('filetext')} Create salary invoice</div>
      <div class="salFormGrid">
        <label class="salField">Invoice type<select id="salType"><option value="current">Current Salary</option><option value="due">Outstanding Due</option><option value="advance">Advance Payment</option></select></label>
        <label class="salField">Salary month<input type="month" id="salMonth" value="${monthNow()}"></label>
        <div class="salFull salAdjust" id="salAdjust">
          <div class="salAttRow">
            <label class="salCheck"><input type="checkbox" id="salAttBased"> <span>${lucide('clock')} Attendance based salary</span></label>
            <span class="salAttInfo">Present: <b id="salAttP">${att.present}</b> / <b id="salAttT">${att.total}</b> days · Prorated: <b id="salAttPct">${pct}%</b></span>
          </div>
          <label class="salAdjLbl">Salary adjustments <small>(optional)</small></label>
          <div class="salAdjGrid">
            <div class="salAdj"><span class="plus">+</span><label>Incentive</label><input type="number" id="salIncentive" value="0" min="0" step="50"></div>
            <div class="salAdj"><span class="plus">+</span><label>Bonus</label><input type="number" id="salBonus" value="0" min="0" step="50"></div>
            <div class="salAdj"><span class="minus">−</span><label>Fine</label><input type="number" id="salFine" value="0" min="0" step="50"></div>
            <div class="salAdj"><span class="minus">−</span><label>Other deduction</label><input type="number" id="salOther" value="0" min="0" step="50"></div>
          </div>
          <div class="salToggles">
            <label class="salCheck"><input type="checkbox" id="salAddOut"> Add outstanding due <span class="salPv" id="salPvOut">৳ 0</span></label>
            <label class="salCheck"><input type="checkbox" id="salCutAdv"> Cut advance payment <span class="salPv" id="salPvAdv">৳ 0</span></label>
          </div>
        </div>
        <div class="salFull salPaidRow">
          <label>${lucide('banknote')} Paid amount</label>
          <input type="number" id="salPaid" value="0" min="0" step="50" placeholder="0">
          <small id="salPaidHint">(enter the amount already paid)</small>
        </div>
        <div class="salFull"><div class="salSummary">
          <div class="salSum hiBlue"><div class="sl">Total</div><div class="sv">৳ <span id="salTotal">0</span></div></div>
          <div class="salSum hiGreen"><div class="sl">Paid</div><div class="sv">৳ <span id="salPaidView">0</span></div></div>
          <div class="salSum hiRed"><div class="sl">Due</div><div class="sv">৳ <span id="salDue">0</span></div></div>
          <div class="salSum hiNet"><div class="sl">Net payable</div><div class="sv">৳ <span id="salNet">0</span></div></div>
        </div></div>
      </div>
      <div class="salActions">
        <button class="salGhost" id="salReset">${lucide('undo')} Reset</button>
        ${canAdd?`<button class="salSave" id="salSave">${lucide('save')} Save invoice</button>`:'<span class="muted" style="align-self:center;">Read-only access — saving is disabled.</span>'}
      </div></div>`;
  }
  function historyHtml(){
    return `<div class="salBox salHistory"><div class="salBoxTitle">${lucide('history')} Salary history</div><div class="salTableWrap"><table class="salTable"><thead><tr><th>Month</th><th>Type</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th>${canDel?'<th></th>':''}</tr></thead><tbody id="salHistoryBody">${invoices.length?invoices.map(h=>`<tr><td><b>${esc(monthLabel(h.salary_month))}</b></td><td>${typeBadge(h.invoice_type)}</td><td>৳ ${money(h.total)}</td><td>৳ ${money(h.paid)}</td><td>৳ ${money(h.due)}</td><td>${statusBadge(h.due)}</td>${canDel?`<td><button class="salDel danger" data-del="${h.id}" title="Delete invoice">×</button></td>`:''}</tr>`).join(''):`<tr><td colspan="7" class="salEmpty">No salary invoices yet.</td></tr>`}</tbody></table></div></div>`;
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
    if(!p){$('#salMain').innerHTML='<p class="muted">Select a staff member to manage salary.</p>';return}
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
    $('#salMain').innerHTML='<p class="muted">Loading…</p>';
    try{
      let d=await api('salary?staff_id='+encodeURIComponent(id)+'&month='+encodeURIComponent($('#salMonth')?$('#salMonth').value:monthNow()));
      invoices=d.invoices||[];att=d.attendance||{present:0,total:0};summary=d.summary||summary;
      renderDetail();
    }catch(e){$('#salMain').innerHTML='<p class="muted">'+esc(e.message)+'</p>'}
  }

  try{await load(false)}catch(e){toast(e.message)}
  renderList();
  if(staffs.length)await select(staffs[0].id);else $('#salMain').innerHTML='<p class="muted">No staff members yet. Add staff from the Staff manager first.</p>';
}
async function vaultiumPage(){
  const fmt=v=>{const n=Number(v||0);return n>=GB2?((n/GB2).toFixed(2)+' GB'):n>=MB2?((n/MB2).toFixed(1)+' MB'):(n>=KB2?((n/KB2).toFixed(0)+' KB'):n+' B')};
  const [av,files]=await Promise.all([api('vaultium/availability').catch(()=>null),api('vaultium/files')]);
  const gb=av?.gb||0,used=av?.used||0,pct=gb>0?Math.min(100,used/(gb*GB2)*100):0;
  $('#page').innerHTML=title('Vaultium')+`<div class="vaultCards"><section class="card"><small>Storage used</small><strong>${fmt(used)}</strong><span class="muted">${gb>0?('of '+gb+' GB allowance'):'no active plan'}</span></section><section class="card"><small>Allowance</small><strong>${gb} GB</strong><span class="muted">${av?.enabled?'Active':'Inactive'}</span></section><section class="card"><small>Files</small><strong>${files.length}</strong><span class="muted">documents & images</span></section></div><div class="vaultBar"><i style="width:${pct}%"></i></div><div class="flatlist" style="margin-top:16px"><input id="vaultSearch" class="headsearch" placeholder="Search by invoice number or file name"><div id="vaultFiles">${vaultTable(files)}</div></div>`;
  $('#vaultSearch').oninput=e=>{const q=e.target.value.toLowerCase();$('#vaultFiles').innerHTML=vaultTable(files.filter(f=>(f.invoice_number||'').toLowerCase().includes(q)||(f.filename||'').toLowerCase().includes(q)))};
  document.querySelectorAll('[data-vault-view]').forEach(b=>b.onclick=async()=>{try{const f=files.find(x=>x.id===b.dataset.vaultView);const r=await fetch('/api/vaultium/file/'+b.dataset.vaultView,{headers:{authorization:'Bearer '+state.token}});if(!r.ok)throw Error('View failed');const blob=await r.blob();const url=URL.createObjectURL(blob);if((f.content_type||'').startsWith('image/')){vaultPreview(url,f.filename)}else{const w=window.open(url,'_blank');if(!w){toast('Pop-up blocked. Use Download instead.');URL.revokeObjectURL(url)}}}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-vault-dl]').forEach(b=>b.onclick=async()=>{try{const f=files.find(x=>x.id===b.dataset.vaultDl);const r=await fetch('/api/vaultium/file/'+b.dataset.vaultDl,{headers:{authorization:'Bearer '+state.token}});if(!r.ok)throw Error('Download failed');const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=f.filename||'file';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-vault-del]').forEach(b=>b.onclick=async()=>{const f=files.find(x=>x.id===b.dataset.vaultDel);if(!confirm('Permanently delete "'+f.filename+'"? This cannot be undone.'))return;try{await api('vaultium/delete',{method:'POST',body:JSON.stringify({id:f.id})});toast('File deleted.');vaultiumPage()}catch(e){toast(e.message)}});
}
function vaultTable(files){
  if(!files.length)return '<p class="muted">No files uploaded yet.</p>';
  const fmt=v=>{const n=Number(v||0);return n>=GB2?((n/GB2).toFixed(2)+' GB'):n>=MB2?((n/MB2).toFixed(1)+' MB'):(n>=KB2?((n/KB2).toFixed(0)+' KB'):n+' B')};
  return `<div class="tablewrap"><table><thead><tr><th>File</th><th>Invoice</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${files.map(f=>`<tr><td>${esc(f.filename)}</td><td><code class="shopid">${esc(f.invoice_number||'—')}</code></td><td>${esc(f.content_type||'—')}</td><td>${fmt(f.size_bytes)}</td><td>${new Date(f.created_at).toLocaleString()}</td><td class="actions"><button class="secondary" data-vault-view="${f.id}">View</button><button class="secondary" data-vault-dl="${f.id}">Download</button><button class="danger" data-vault-del="${f.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
}

async function dashboard(){let [d,snapshots,trend]=await Promise.all([api('dashboard'),api('dashboard/activity-snapshot'),api('dashboard/sales-trend').catch(e=>{console.error('sales-trend failed:',e);return null})]),values=[['Sales',d.sales.today,'#6366f1'],['Purchase',d.purchase.today,'#f59e0b'],['Expense',d.expense.today,'#f43f5e'],['Sales due',d.sales.dueToday,'#0ea5e9']],max=Math.max(1,...values.map(x=>Number(x[1])));$('#page').innerHTML=`<div class="cards">${[['Sales',d.sales,'#6366f1'],['Purchase',d.purchase,'#f59e0b'],['Expense',d.expense,'#f43f5e'],['Sales due',{lifetime:d.sales.dueLifetime,today:d.sales.dueToday},'#0ea5e9']].map(([n,v,c])=>`<section class="card dashboard-glass"><span class="kpiicon" style="background:${c}18;color:${c}">${n==='Sales'?'↗':n==='Purchase'?'↓':n==='Expense'?'−':n==='Sales due'?'⌁':'!'}</span><small>${n} · Lifetime / Today</small><strong>${n==='Low stock'?v.lifetime:money(v.lifetime)}</strong><span class="muted">Today: ${n==='Low stock'?v.today:money(v.today)}</span></section>`).join('')}</div><div class="dashcolumns"><section class="financialCard dashboard-glass"><div class="financialHead"><span class="financialIcon">↗</span><h2>Today’s Financial Chart</h2></div><hr><div class="financialTotal"><small>Total Transaction</small><strong>${money(values.slice(0,3).reduce((n,x)=>n+Number(x[1]),0))}</strong></div><div class="financialChart"><div class="financeYAxis">${[100,75,50,25,0].map(t=>`<span>${money(max*t/100)}</span>`).join('')}</div><div class="financeBody"><div class="financeGrid">${[1,2,3,4,5].map(()=>'<i></i>').join('')}</div><div class="financeBars">${values.map(([name,value,color])=>`<div class="financeBarGroup"><div class="financeTrack"><b>${money(value)}</b><i class="financeBar ${name==='Sales'?'sales':name==='Purchase'?'purchase':name==='Expense'?'expense':'due'}" style="height:${Math.max(3,Number(value)/max*100)}%"></i></div><span>${name}</span></div>`).join('')}</div><div class="financeXAxis"><span>0</span><span>${money(max/4)}</span><span>${money(max/2)}</span><span>${money(max*0.75)}</span><span>${money(max)}</span></div><small class="financeAxisLabel">Amount</small></div></div></section><section class="panel activitypanel dashboard-glass"><h2>Recent activity · last 24 hours</h2><div class="activitytable">${snapshots.length?`<div class="tablewrap"><table><thead><tr><th>Label</th><th>ID</th><th>Total</th><th>Paid</th><th>Due</th><th>Submitted by</th><th>Time</th></tr></thead><tbody>${snapshots.map(x=>`<tr><td><span class="activitytag ${x.label.toLowerCase()}">${esc(x.label)}</span></td><td>${esc(x.id)}</td><td>${x.total==='—'?'—':money(x.total)}</td><td>${x.paid==='—'?'—':money(x.paid)}</td><td>${x.due==='—'?'—':money(x.due)}</td><td>${esc(x.submittedBy)}</td><td>${ago(x.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No sales, purchases, expenses, or inventory activity during the last 24 hours.</p>'}</div></section>${trend?salesTrendChart(trend):''}</div>`} 
function table(rows,cols){if(!rows.length)return '<p class="muted">No records found.</p>';return `<div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${c.replaceAll('_',' ')}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
async function profile(){let p=await api('admin/profile');$('#page').innerHTML=title('My administrator profile')+`<form class="panel fields" id="profileForm"><div class="grid2"><label>Full name<input name="name" required value="${esc(p.name)}"></label><label>Phone<input name="phone" required value="${esc(p.phone)}"></label></div><label>Address<textarea name="address">${esc(p.address||'')}</textarea></label><label>Email<input name="email" type="email" required value="${esc(p.email)}"></label><label>New password <span class="muted">Leave blank to keep the existing password.</span><input name="password" type="password" minlength="10"></label><button>Save profile</button></form>`;$('#profileForm').onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.target));if(!b.password)delete b.password;try{let x=await api('admin/profile',{method:'PATCH',body:JSON.stringify(b)});state.user.name=x.name;save(state);toast('Administrator profile updated.')}catch(x){toast(x.message)}}}
function storeCards(rows,usageMap,zudoMap,healthMap,ent){
  if(!rows.length)return '<p class="muted">No stores yet. Create your first store to begin.</p>';
  return rows.map(r=>{
    const cx=usageMap[r.id],z=zudoMap[r.id],bh=healthMap[r.id];
    const pill=(on,txt)=>{if(!on)return `<span class="stFeat off">${txt}</span>`;return ''};
    return `<article class="storeCard">
      <div class="storeCardTop">
        <div class="storeCardTitle"><h3>${esc(r.name)}</h3><code class="shopid">${esc(r.shop_code)}</code></div>
        <span class="statuspill ${r.status==='active'?'active':'inactive'}">${r.status}</span>
      </div>
      <div class="storeCardMeta">
        ${r.address?`<span>📍 ${esc(r.address)}</span>`:''}${r.phone?`<span>📞 ${esc(r.phone)}</span>`:''}${r.email?`<span>✉ ${esc(r.email)}</span>`:''}${r.website?`<span>🌐 ${esc(r.website)}</span>`:''}
      </div>
      <div class="storeCardFeats">
        <span class="stFeat ${cx?.enabled?'on':'off'}">ConnectX ${cx?.enabled?`${cx.usedToday}/${cx.dailyLimit}`:'—'}</span>
        <span class="stFeat ${z?.enabled?'on':'off'}">Zudo ${z?.enabled?`${z.usedToday}/${z.dailyLimit}`:'—'}</span>
        <span class="stFeat ${bh?.enabled?'on':'off'}">AIBH ${bh?.enabled?`${bh.usedToday}/${bh.dailyLimit}`:'—'}</span>
        <span class="stFeat ${ent.truebill_enabled?'on':'off'}">TrueBill</span>
        <span class="stFeat ${Number(ent.vaultium_gb||0)>0?'on':'off'}">Vaultium ${Number(ent.vaultium_gb||0)>0?ent.vaultium_gb+'GB':''}</span>
      </div>
      <div class="storeCardActions">
        <button class="secondary" data-edit-store="${r.id}">Edit</button>
        <button data-goto-store2="${r.id}">Go to shop</button>
      </div>
    </article>`;
  }).join('');
}
async function stores(){let [rows,usage,zudoUsage,healthUsage,ent]=await Promise.all([api('admin/stores'),api('admin/connectx-usage'),api('admin/zudo-usage').catch(()=>[]),api('admin/business-health-usage').catch(()=>[]),api('admin/entitlement').catch(()=>({truebill_enabled:false,vaultium_gb:0}))]),usageMap=Object.fromEntries(usage.map(x=>[x.id,x])),zudoMap=Object.fromEntries(zudoUsage.map(x=>[x.id,x])),healthMap=Object.fromEntries(healthUsage.map(x=>[x.id,x]));$('#page').innerHTML=title('Store management','<button id="manageCapacity" class="secondary">Manage shop capacity</button><button id="add">+ Create store</button>')+`<div class="storeHead"><input id="storeSearch" class="headsearch" placeholder="Search stores by name, shop ID, phone or email"></div><div class="storeGrid" id="storeGrid">${storeCards(rows,usageMap,zudoMap,healthMap,ent)}</div>`;let fields=[['name','Store name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email'],['website','Website']];$('#add').onclick=()=>storeModal(null,fields);$('#storeSearch').oninput=e=>{const q=e.target.value.toLowerCase();$('#storeGrid').innerHTML=storeCards(rows.filter(r=>!q||(r.name+' '+r.shop_code+' '+(r.phone||'')+' '+(r.email||'')).toLowerCase().includes(q)),usageMap,zudoMap,healthMap,ent);bindStores()};const bindStores=()=>{document.querySelectorAll('[data-edit-store]').forEach(x=>x.onclick=()=>storeModal(rows.find(r=>r.id===x.dataset.editStore),fields));document.querySelectorAll('[data-goto-store2]').forEach(x=>x.onclick=async()=>{try{localStorage.setItem('ems.admin.return',JSON.stringify(state));let s=await api('admin/store/'+x.dataset.gotoStore2+'/goto',{method:'POST',body:'{}'});save(s);home()}catch(e){toast(e.message)}})};bindStores();$('#manageCapacity').onclick=()=>shopCapacityModal(rows,stores);}
function shopCapacityModal(rows,refresh){let e=document.createElement('div');e.className='modal';e.innerHTML=`<form class="modalbox capacityModal"><div class="modalhead"><div><h2>Manage shop capacity</h2><p class="muted">Choose which shops operate as Active, Read-Only, Inactive, or Delete. Active shops must not exceed your current license limit.</p></div><button type="button">×</button></div><div class="tablewrap"><table><thead><tr><th>Shop</th><th>Shop ID</th><th>Current status</th><th>New status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td><code class="shopid">${esc(r.shop_code)}</code></td><td>${esc(r.status)}</td><td><select data-capacity-store="${r.id}"><option value="active" ${r.status==='active'?'selected':''}>Active</option><option value="read_only" ${r.status==='read_only'?'selected':''}>Read-Only</option><option value="inactive" ${r.status==='inactive'?'selected':''}>Inactive</option><option value="delete">Delete permanently</option></select></td></tr>`).join('')}</tbody></table></div><div class="capacityNote" id="capacityNote"></div><button>Save shop capacity</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();let update=()=>{let n=[...e.querySelectorAll('[data-capacity-store]')].filter(x=>x.value==='active').length;$('#capacityNote').textContent=`Selected active shops: ${n}. Your license will validate the allowed capacity when saved.`};e.querySelectorAll('[data-capacity-store]').forEach(x=>x.onchange=update);update();e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let choices=[...e.querySelectorAll('[data-capacity-store]')].map(x=>({id:x.dataset.capacityStore,status:x.value}));if(choices.some(x=>x.status==='delete')&&!confirm('Deleting a shop permanently removes its business data. Continue?'))return;try{await api('admin/store-capacity',{method:'POST',body:JSON.stringify({choices})});e.remove();toast('Shop capacity updated.');refresh()}catch(err){toast(err.message)}}}
function storeModal(record,fields){let add=!record,e=document.createElement('div');e.className='modal';e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${add?'Create store':'Edit store'}</h2><button type="button">×</button></div>${fields.map(([n,l,r])=>`<label>${l}<input name="${n}" value="${esc(record?.[n]||'')}" ${r?'required':''}></label>`).join('')}<label>Low-stock alert value<input name="low_stock_threshold" type="number" min="0" step="0.001" value="${esc(record?.low_stock_threshold??5)}" required></label><button>${add?'Create store':'Save changes'}</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.low_stock_threshold=Number(b.low_stock_threshold);await api(add?'admin/stores':'admin/store/'+record.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});e.remove();toast(add?'Store created.':'Store updated.');stores()}catch(x){toast(x.message)}}}
async function devices(){let rows=await api('admin/devices');$('#page').innerHTML=title('Connected devices')+`<section class="panel"><p class="muted">This list records the most recent sign-in activity for each store and device fingerprint.</p>${table(rows.map(x=>({store:x.stores?.name,staff:x.staff?.full_name||'Unknown',user_id:x.staff?.user_id||'—',device:x.user_agent,last_seen:x.last_seen_at})),['store','staff','user_id','device','last_seen'])}</section>`}
async function licenses(){let [rows,plans]=await Promise.all([api('admin/licenses'),api('license-plans')]);$('#page').innerHTML=title('Purchase license')+`<section class="planGrid">${plans.length?plans.map(p=>planCardHtml(p,{button:'Choose '+p.title,attr:'data-buy-plan'})).join(''):'<section class="panel"><p class="muted">No license plan has been published by EMS yet.</p></section>'}</section><section class="panel"><h2>My license purchases</h2>${table(rows.map(x=>({plan:x.license_plans?.title||'Legacy license',shops:x.max_stores,duration:x.duration_months+' months',amount:money(x.amount),payment:x.payment_method,transaction:x.transaction_id,status:x.transaction_type==='downgrade'&&x.starts_at&&new Date(x.starts_at)>new Date()?'Scheduled downgrade':x.status,expires:x.starts_at&&new Date(x.starts_at)>new Date()?`Starts: ${x.starts_at} · Ends: ${x.expires_at}`:(x.expires_at||'—')})),['plan','shops','duration','amount','payment','transaction','status','expires'])}</section>`;document.querySelectorAll('[data-buy-plan]').forEach(x=>x.onclick=()=>buyPlan(plans.find(p=>p.id===x.dataset.buyPlan)))}
function buyPlan(plan){let free=Number(plan.price)===0,e=document.createElement('div');e.className='modal';e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${free?'Activate':'Purchase'} ${esc(plan.title)}</h2><button type="button">×</button></div><p class="muted">${plan.duration_months} months · maximum ${plan.max_stores} shop${plan.max_stores>1?'s':''} · ${free?'No payment is required.':money(plan.price)}</p><p>${esc(plan.benefits||'')}</p>${free?'':`<div class="paymentinfo">${esc(plan.payment_details||'Follow the payment instructions supplied by EMS.')}</div><label>Payment method<select name="paymentMethod" required><option value="bkash">bKash</option><option value="nagad">Nagad</option></select></label><label>Payment number<input name="paymentNumber" required></label><label>Transaction ID<input name="transactionId" required></label>`}<button>${free?'Activate license':'Submit payment for verification'}</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.planId=plan.id;await api('admin/licenses',{method:'POST',body:JSON.stringify(b)});e.remove();toast(free?'License activated.':'Payment claim submitted for EMS verification.');licenses()}catch(x){toast(x.message)}}}
const shortId=id=>String(id||'').replaceAll('-','').slice(0,6).toUpperCase();
async function entity(pageName){let map={suppliers:['supplier','Suppliers',[['name','Name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email']]],customers:['customer','Customers',[['name','Name',1],['address','Address'],['phone','Phone',1],['phone2','Second phone'],['email','Email']]],expense:['expense','Expenses',[['expense_date','Date',1],['details','Details',1],['total','Total',1],['paid','Paid',1],['note','Note']]]},config=map[pageName];if(pageName==='staff-manager')return staffManager();if(pageName==='inventory')return inventoryManager();let [kind,label,fields]=config,cols=fields.map(x=>x[0]),rows=await api(kind);function render(data=rows){$('#data').innerHTML=crudTable(data,cols,kind)}$('#page').innerHTML=title(label,canAccess(kind,'add')?`<button id="add">+ Add new</button>`:'',`<input id="search" class="headsearch" placeholder="Search records">`)+`<div class="flatlist"><div id="data"></div></div>`;render();$('#search').oninput=e=>render(rows.filter(r=>JSON.stringify(r).toLowerCase().includes(e.target.value.toLowerCase())));if($('#add'))$('#add').onclick=()=>entityModal(kind,label,fields,null,()=>entity(pageName));bindCrud(rows,kind,label,fields,()=>entity(pageName))}
function crudTable(rows,cols,kind){if(!rows.length)return '<p class="muted">No records found.</p>';let codeKey={supplier:'supplier_code',customer:'customer_code',expense:'expense_code'}[kind],hasCode=kind!=='inventory';let extraCol=kind==='expense'?'<th>Due</th>':'';let extraVal=r=>kind==='expense'?`<td>${money(r.due)}</td>`:'';return `<div class="tablewrap"><table><thead><tr>${hasCode?'<th>Short ID</th>':''}${cols.map(c=>`<th>${c.replaceAll('_',' ')}</th>`).join('')}${extraCol}<th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr>${hasCode?`<td><code class="shopid">${esc(r[codeKey]||shortId(r.id))}</code></td>`:''}${cols.map(c=>`<td>${esc(r[c])}</td>`).join('')}${extraVal(r)}<td class="actions">${kind==='customer'?`<button class="secondary" data-cx-invoices="${r.id}">Invoices</button>`:''}<button class="secondary" data-edit-${kind}="${r.id}" ${canAccess(kind,'edit')?'':'disabled'}>Edit</button><button class="danger" data-delete-${kind}="${r.id}" ${canAccess(kind,'delete')?'':'disabled'}>Delete</button></td></tr>`).join('')}</tbody></table></div>`}
function customerInvoices(customer){
  const e=document.createElement('div');e.className='modal d2';
  e.innerHTML=`<div class="modalbox"><div class="modalhead"><h2>Invoices — ${esc(customer.name)}</h2><button type="button" id="ciClose">×</button></div><div id="ciBody"><p class="muted">Loading…</p></div></div>`;
  document.body.append(e);
  e.querySelector('#ciClose').onclick=()=>e.remove();
  e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});
  const renderRows=rows=>{
    e.querySelector('#ciBody').innerHTML=rows.length?`<div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Subtotal</th><th>Paid</th><th>Due</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.invoice_number)}</td><td>${esc(r.invoice_date)}</td><td>${money(r.subtotal)}</td><td>${money(r.paid_amount)}</td><td>${money(r.total_due)}</td><td class="actions"><button class="secondary" data-ci-view="${r.id}">View</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No sales invoices for this customer.</p>';
    e.querySelectorAll('[data-ci-view]').forEach(b=>b.onclick=()=>{const inv=rows.find(x=>x.id===b.dataset.ciView);e.remove();invoiceView(inv,'Sales')});
  };
  api('invoices/by-party?kind=sale&party_id='+encodeURIComponent(customer.id))
    .catch(()=>api('invoices?kind=sale').then(rows=>rows.filter(r=>r.party_id===customer.id)))
    .then(renderRows)
    .catch(err=>{e.querySelector('#ciBody').innerHTML='<p class="muted">'+esc(err.message)+'</p>'});
}
function bindCrud(rows,kind,label,fields,refresh){if(kind==='customer')document.querySelectorAll('[data-cx-invoices]').forEach(x=>x.onclick=()=>customerInvoices(rows.find(r=>r.id===x.dataset.cxInvoices)));document.querySelectorAll(`[data-edit-${kind}]`).forEach(x=>x.onclick=()=>entityModal(kind,label,fields,rows.find(r=>r.id===x.dataset['edit'+kind[0].toUpperCase()+kind.slice(1)]),refresh));document.querySelectorAll(`[data-delete-${kind}]`).forEach(x=>x.onclick=async()=>{let id=x.dataset['delete'+kind[0].toUpperCase()+kind.slice(1)];if(!confirm('Delete this record?'))return;try{await api(kind+'/'+id,{method:'DELETE'});toast('Record deleted.');refresh()}catch(e){toast(e.message)}})}
function entityModal(kind,label,fields,record,refresh){let expense=kind==='expense',e=document.createElement('div');e.className='modal d2';let fieldHtml=fields.map(([n,l,req])=>{let type=n==='expense_date'?'date':(n==='total'||n==='paid'?'number':'text'),v=record?.[n]??(n==='expense_date'?new Date().toISOString().slice(0,10):(n==='paid'?0:''));return `<label>${l}<input name="${n}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} value="${esc(v)}" ${req?'required':''}></label>`}).join('');let files=[],vault=null;if(expense){api('vaultium/availability').then(v=>{vault=v}).catch(()=>{})}e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${record?'Edit':'Add'} ${label.slice(0,-1)}</h2><button type="button">×</button></div><div class="grid2">${fieldHtml}</div>${expense?'<label>Due <input id="expenseDue" readonly></label>':''}${expense?`<div class="vaultAttach"><h3>File attachments <span class="muted">(Vaultium)</span></h3><label class="vaultPick"><input type="file" id="expFileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">Attach files — max 5, 5 MB each</label><div id="expSelected" class="vaultSelected"></div></div>`:''}<button>${record?'Save changes':'Save'}</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();if(expense){let calc=()=>$('#expenseDue').value=money(Math.max(0,Number(e.querySelector('[name=total]').value||0)-Number(e.querySelector('[name=paid]').value||0)));e.querySelector('[name=total]').oninput=calc;e.querySelector('[name=paid]').oninput=calc;calc();const renderExpFiles=()=>{const box=$('#expSelected');if(!box)return;box.innerHTML=files.length?files.map((f,i)=>`<div class="vaultChip"><span>${esc(f.name)} <small>${(f.size/MB2).toFixed(2)} MB</small></span><button type="button" class="vaultX" data-exp-rm="${i}">×</button></div>`).join(''):'';box.querySelectorAll('[data-exp-rm]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.expRm,1);renderExpFiles()})};const fi=$('#expFileInput');if(fi)fi.onchange=ev=>{for(const f of [...ev.target.files]){if(files.length>=5){toast('Maximum 5 files.');break}if(f.size>5*MB2){toast(f.name+' exceeds 5 MB.');continue}files.push(f)}ev.target.value='';renderExpFiles()}}e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let b=Object.fromEntries(new FormData(ev.target));if(expense){b.total=Number(b.total);b.paid=Number(b.paid)}try{let saved=await api(record?kind+'/'+record.id:kind,{method:record?'PATCH':'POST',body:JSON.stringify(b)});if(expense&&files.length&&vault&&vault.enabled){for(const file of files){const fd=new FormData();fd.append('files',file);fd.append('invoice_number',saved.expense_code||('EXP-'+saved.id.slice(0,8).toUpperCase()));await apiUpload('vaultium/upload',fd)}}e.remove();toast('Saved.');refresh()}catch(x){toast(x.message)}}}
async function inventoryManager(){let [rows,cfg]=await Promise.all([api('inventory'),api('shop/settings').catch(()=>({low_stock_threshold:5}))]),lowThreshold=Number(cfg.low_stock_threshold||5),filter='all',lowOnly=false;const render=()=>{let data=rows.filter(r=>{if(filter==='active'&&!r.active)return false;if(filter==='inactive'&&r.active)return false;if(lowOnly&&!(Number(r.total_stock)>0&&Number(r.total_stock)<=lowThreshold))return false;return true});const q=($('#search')?.value||'').toLowerCase();if(q)data=data.filter(r=>JSON.stringify(r).toLowerCase().includes(q));$('#data').innerHTML=invTable(data)};const invTable=list=>{if(!list.length)return '<p class="muted">No items found.</p>';return `<div class="tablewrap"><table><thead><tr><th>Item code</th><th>Description</th><th>Unit</th><th>Sale price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(r=>`<tr><td><code class="shopid">${esc(r.item_code)}</code></td><td>${esc(r.description)}</td><td>${esc(r.unit)}</td><td>${money(r.sale_price)}</td><td>${esc(r.total_stock)}${Number(r.total_stock)>0&&Number(r.total_stock)<=lowThreshold?' <span class="lowstock">LOW</span>':''}</td><td><span class="statuspill ${r.active?'active':'inactive'}">${r.active?'Active':'Inactive'}</span></td><td class="actions"><button class="secondary" data-edit-inventory="${r.id}">Edit</button><button class="danger" data-delete-inventory="${r.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`};$('#page').innerHTML=title('Inventory',canAccess('inventory','add')?'<button id="addInventory">+ Add new item</button>':'',`<input id="search" class="headsearch" placeholder="Search inventory">`)+`<div class="filtersrow"><button class="fchip ${filter==='all'?'on':''}" data-f="all">All</button><button class="fchip ${filter==='active'?'on':''}" data-f="active">Active</button><button class="fchip ${filter==='inactive'?'on':''}" data-f="inactive">Inactive</button><button class="fchip ${lowOnly?'on':''}" id="lowOnlyBtn">Low stock</button></div><div class="flatlist"><div id="data"></div></div>`;render();document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));render()});$('#lowOnlyBtn').onclick=()=>{lowOnly=!lowOnly;$('#lowOnlyBtn').classList.toggle('on',lowOnly);render()};$('#search').oninput=render;if($('#addInventory'))$('#addInventory').onclick=()=>inventoryModal(null,inventoryManager);document.querySelectorAll('[data-edit-inventory]').forEach(x=>x.onclick=()=>inventoryModal(rows.find(r=>r.id===x.dataset.editInventory),inventoryManager));document.querySelectorAll('[data-delete-inventory]').forEach(x=>x.onclick=async()=>{if(!confirm('Delete this inventory item?'))return;try{await api('inventory/'+x.dataset.deleteInventory,{method:'DELETE'});toast('Inventory item deleted.');inventoryManager()}catch(e){toast(e.message)}})}


function inventoryModal(record=null,refresh=inventoryManager){let units=['pcs','box','carton','pack','pair','set','kg','gram','liter','ml','meter','feet','dozen','bag','roll','bottle','can'];let e=document.createElement('div');e.className='modal d2';e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${record?'Edit':'Add'} inventory item</h2><button type="button">×</button></div><label>Item code <span class="muted">Leave blank to auto-generate.</span><input name="item_code" value="${esc(record?.item_code||'')}"></label><label>Description<input name="description" required value="${esc(record?.description||'')}"></label><div class="grid2"><label>Unit<select name="unit" required>${units.map(x=>`<option value="${x}" ${record?.unit===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Sale price<input name="sale_price" type="number" min="0" step="0.01" required value="${esc(record?.sale_price??'')}"></label></div><label>Active status<select name="active"><option value="true" ${record?.active!==false?'selected':''}>Yes — available for sale</option><option value="false" ${record?.active===false?'selected':''}>No — inactive</option></select></label><button>Save item</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let b=Object.fromEntries(new FormData(ev.target));b.active=b.active==='true';try{await api(record?'inventory/'+record.id:'inventory',{method:record?'PATCH':'POST',body:JSON.stringify(b)});e.remove();toast('Inventory item saved.');refresh()}catch(x){toast(x.message)}}}
const permissionLabels={dashboard:'Dashboard',supplier:'Supplier',customer:'Customer',inventory:'Inventory',purchase:'Purchase',sales:'Sales',expense:'Expense',due_recover:'Due Recover',staff:'Staff Manager',report:'Report',settings:'Settings',connectx:'ConnectX',zudo:'Zudo',attendance:'Attendance',salary:'Salary',vaultium:'Vaultium'};const permissionActions=['view','add','edit','delete'];
function permissionEditor(existing={}){return `<section class="permissionbox"><div class="permissiontitle"><div><h3>Module permissions</h3><p>Select exactly what this staff member may do. Permissions are checked by the server, not only hidden in the interface.</p></div><button type="button" class="secondary" id="clearPermissions">Clear all</button></div>${Object.entries(permissionLabels).map(([key,label])=>`<div class="permissionrow"><strong>${label}</strong><button type="button" class="toggleall" data-section="${key}">Toggle all</button><div class="permissionactions">${(key==='zudo'?['view','send','delete']:permissionActions).map(action=>`<label class="switchlabel"><input type="checkbox" data-permission="${key}" value="${action}" ${existing[key]?.includes(action)?'checked':''}><span>${action}</span></label>`).join('')}</div></div>`).join('')}</section>`}
function collectPermissions(root){let out={};root.querySelectorAll('[data-permission]').forEach(x=>{if(x.checked)(out[x.dataset.permission]??=[]).push(x.value)});return out}
async function staffManager(){let rows=await api('staff');$('#page').innerHTML=title('Staff manager',(canAccess('attendance','view')?'<button id="attendanceBtn">Attendance</button> ':'')+(canAccess('salary','view')?'<button id="salaryBtn">Salary</button>':'')+(canAccess('staff','add')?'<button id="addStaff">+ Add staff member</button>':''),`<input id="search" class="headsearch" placeholder="Search staff">`)+`<div class="flatlist"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Position</th><th>Phone</th><th>User ID</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead><tbody id="staffRows">${staffRows(rows)}</tbody></table></div></div>`;let filter=q=>$('#staffRows').innerHTML=staffRows(rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())));$('#search').oninput=e=>filter(e.target.value);$('#addStaff').onclick=()=>staffModal();$('#attendanceBtn').onclick=()=>page('attendance');if($('#salaryBtn'))$('#salaryBtn').onclick=()=>page('salary');document.querySelectorAll('[data-edit-staff]').forEach(b=>b.onclick=()=>staffModal(rows.find(x=>x.id===b.dataset.editStaff)));document.querySelectorAll('[data-delete-staff]').forEach(b=>b.onclick=async()=>{let person=rows.find(x=>x.id===b.dataset.deleteStaff);if(!confirm(`Remove ${person.full_name}? This cannot be undone.`))return;try{await api('staff/'+person.id,{method:'DELETE'});toast('Staff member removed.');staffManager()}catch(e){toast(e.message)}})}
function staffRows(rows){if(!rows.length)return '<tr><td colspan="7" class="muted">No staff members found.</td></tr>';return rows.map(x=>{let n=Object.values(x.permissions||{}).reduce((a,v)=>a+v.length,0);return `<tr><td>${esc(x.full_name)}</td><td>${esc(x.position)}</td><td>${esc(x.phone)}</td><td>${esc(x.user_id)}</td><td><span class="statuspill ${x.active?'active':'inactive'}">${x.active?'Active':'Inactive'}</span></td><td>${n} granted</td><td class="actions"><button class="secondary" data-edit-staff="${x.id}">Edit</button><button class="danger" data-delete-staff="${x.id}">Delete</button></td></tr>`}).join('')}
function staffModal(person=null){let add=!person,e=document.createElement('div');e.className='modal d2';e.innerHTML=`<form class="modalbox staffmodal fields"><div class="modalhead"><div><h2>${add?'Add staff member':'Edit staff member'}</h2><p class="muted">A password is required for a new staff member. For an existing staff member, leave it blank to retain the current password.</p></div><button type="button">×</button></div><div class="grid2"><label>Full name<input name="full_name" required value="${esc(person?.full_name||'')}"></label><label>Position<input name="position" value="${esc(person?.position||'')}"></label><label>Phone number<input name="phone" required value="${esc(person?.phone||'')}"></label><label>Email address<input name="email" type="email" value="${esc(person?.email||'')}"></label><label>User ID<input name="user_id" required value="${esc(person?.user_id||'')}"></label><label>Password<input name="password" type="password" ${add?'required minlength="10"':'minlength="10"'} placeholder="${add?'At least 10 characters':'Leave blank to keep current'}"></label><label>Basic salary<input name="basic_salary" type="number" min="0" step="0.01" required value="${esc(person?.basic_salary??0)}"></label><label>Account status<select name="active"><option value="true" ${person?.active!==false?'selected':''}>Active — can sign in</option><option value="false" ${person?.active===false?'selected':''}>Inactive — sign-in blocked</option></select></label></div>${permissionEditor(person?.permissions||{})}<button>${add?'Create active staff account':'Save staff changes'}</button></form>`;document.body.append(e);e.querySelector('.modalhead button').onclick=()=>e.remove();e.querySelector('#clearPermissions').onclick=()=>e.querySelectorAll('[data-permission]').forEach(x=>x.checked=false);e.querySelectorAll('.toggleall').forEach(b=>b.onclick=()=>{let boxes=e.querySelectorAll(`[data-permission="${b.dataset.section}"]`),all=[...boxes].every(x=>x.checked);boxes.forEach(x=>x.checked=!all)});e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{let b=Object.fromEntries(new FormData(ev.target));b.active=b.active==='true';b.permissions=collectPermissions(e);if(!b.password)delete b.password;await api(add?'staff':'staff/'+person.id,{method:add?'POST':'PATCH',body:JSON.stringify(b)});toast(add?'Staff account created.':'Staff account updated.');e.remove();staffManager()}catch(err){toast(err.message)}}}
async function zudo(){let current=null,conversations=[],usage=null,sending=false;$('#page').innerHTML=`<div class="zudo"><aside class="zudoSide"><div class="zudoBrand">✦ <b>Zudo</b><small>powered by DoxTox</small></div><button id="zudoNew">+ New chat</button><div id="zudoConversations"></div></aside><section class="zudoMain"><header><div><h2>Zudo</h2><span>Read-only business intelligence</span></div><div class="zudoHeaderActions"><span id="zudoUsage" class="zudoUsage" aria-live="polite">Loading request usage…</span><span class="zudoBadge">AI Assistant</span></div></header><div class="zudoMessages" id="zudoMessages"><div class="zudoWelcome">${ZUDO_LOADER}<b>Hello, I’m Zudo.</b><p>Ask about sales, purchases, inventory, customers, expenses, and due data. I only read your current shop data.</p><div><button class="zudoPrompt">What are my low stock items?</button><button class="zudoPrompt">Give me today’s sales summary</button><button class="zudoPrompt">Which customers may have due?</button></div></div></div><form class="zudoComposer" id="zudoForm"><textarea id="zudoInput" rows="2" placeholder="Ask Zudo about your shop…"></textarea><button id="zudoSend" type="submit">Send ✦</button></form></section></div>`;async function loadUsage(){try{usage=await api('zudo/availability');let label=$('#zudoUsage'),send=$('#zudoSend');if(label){label.textContent=usage.enabled?`Daily limit: ${usage.dailyLimit} · Used: ${usage.usedToday} · Remaining: ${usage.remaining}`:'Zudo is not available for this shop';label.classList.toggle('limitReached',!!usage.enabled&&usage.remaining<=0)}if(send)send.disabled=!usage||!usage.enabled||usage.remaining<=0}catch(err){let label=$('#zudoUsage');if(label)label.textContent='Request usage unavailable'}}async function loadConversations(){conversations=await api('zudo/conversations');$('#zudoConversations').innerHTML=conversations.map(x=>`<div class="zudoConvRow ${x.id===current?'on':''}"><button class="zudoConv" data-zudo-conv="${x.id}">${esc(x.title)}</button><button class="zudoMore" data-zudo-more="${x.id}" aria-label="Conversation options">⋯</button><div class="zudoMoreMenu" data-zudo-menu="${x.id}" hidden><button class="danger" data-zudo-delete="${x.id}">Delete chat</button></div></div>`).join('')||'<p class="muted">No conversations yet.</p>';document.querySelectorAll('[data-zudo-conv]').forEach(b=>b.onclick=()=>openConversation(b.dataset.zudoConv));document.querySelectorAll('[data-zudo-more]').forEach(b=>b.onclick=e=>{e.stopPropagation();let menu=document.querySelector(`[data-zudo-menu="${b.dataset.zudoMore}"]`);let wasHidden=menu.hidden;document.querySelectorAll('[data-zudo-menu]').forEach(m=>m.hidden=true);menu.hidden=!wasHidden});document.querySelectorAll('[data-zudo-delete]').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('Delete this Zudo chat and its messages?'))return;try{await api('zudo/conversations/'+b.dataset.zudoDelete,{method:'DELETE'});if(current===b.dataset.zudoDelete){current=null;$('#zudoMessages').innerHTML='<div class="zudoWelcome">${ZUDO_LOADER}<b>New Zudo chat</b><p>Ask a question about your shop data.</p></div>'}loadConversations()}catch(err){toast(err.message)}})}function renderMessages(messages){$('#zudoMessages').innerHTML=messages.map(x=>`<div class="zudoMsg ${x.role}"><span>${x.role==='assistant'?'Zudo':'You'}</span><div>${x.role==='assistant'?fmtAI(x.content):esc(x.content).replace(/\n/g,'<br>')}</div></div>`).join('');$('#zudoMessages').scrollTop=$('#zudoMessages').scrollHeight}async function openConversation(id){current=id;renderMessages(await api('zudo/conversations/'+id));loadConversations()}$('#zudoNew').onclick=()=>{current=null;$('#zudoMessages').innerHTML='<div class="zudoWelcome">${ZUDO_LOADER}<b>New Zudo chat</b><p>Ask a question about your shop data.</p></div>';loadConversations()};document.querySelectorAll('.zudoPrompt').forEach(b=>b.onclick=()=>{$('#zudoInput').value=b.textContent;$('#zudoInput').focus()});$('#zudoForm').onsubmit=async e=>{e.preventDefault();let input=$('#zudoInput'),send=$('#zudoSend'),message=input.value.trim();if(!message||sending)return;if(!usage)await loadUsage();if(!usage?.enabled)return toast('Zudo is not available for this shop.');if(Number(usage.remaining)<=0)return toast('Your daily Zudo request limit has been reached.');sending=true;input.value='';if(send)send.disabled=true;let box=$('#zudoMessages');box.insertAdjacentHTML('beforeend',`<div class="zudoMsg user"><span>You</span><div>${esc(message)}</div></div><div class="zudoMsg assistant thinking"><span>Zudo</span><div>${ZUDO_THINKING_HTML}</div></div>`);startZudoOrbs(box);box.scrollTop=box.scrollHeight;try{let r=await api('zudo/chat',{method:'POST',body:JSON.stringify({conversationId:current,message})});current=r.conversationId;box.querySelector('.thinking')?.remove();box.insertAdjacentHTML('beforeend',`<div class="zudoMsg assistant"><span>Zudo</span><div>${fmtAI(r.answer)}</div></div>`);box.scrollTop=box.scrollHeight;loadConversations()}catch(err){box.querySelector('.thinking')?.remove();toast(err.message)}finally{sending=false;await loadUsage();if(usage?.remaining>0)input.focus()}};loadConversations();loadUsage()}
async function connectX(){let tab=state.connectxEnabled?'compose':'inbox',recipientType='customer',selected=null;$('#page').innerHTML=`<div class="connectx"><aside class="connectxnav"><div class="connectxbrand">✉ <b>ConnectX</b><small>Central communication</small></div>${state.connectxEnabled?'<button class="on" data-cx-tab="compose">✎ Compose</button>':''}<button class="${state.connectxEnabled?'':'on'}" data-cx-tab="inbox">▣ Inbox <small>Send history</small></button></aside><section class="connectxmain" id="connectxContent"></section></div>`;async function compose(){let c=$('#connectxContent');c.innerHTML=`<div class="cxhead"><h2>New message</h2><span>Secure shop email</span></div><div class="cxcompose"><div class="cxrecipient"><label>Recipient type<select id="cxType"><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="staff">Staff</option></select></label><label>Search and select recipient<input list="cxContacts" id="cxContact" placeholder="Name, email, phone, or ID"><datalist id="cxContacts"></datalist></label><div class="cxcontact" id="cxContactInfo">Select a recipient to auto-fill contact details.</div></div><div class="cxfields"><label class="cxToLabel">To<input id="cxTo" type="email" placeholder="recipient@email.com"><span class="cxAddRecipients"><button type="button" class="secondary" id="cxAddCc">+ CC</button><button type="button" class="secondary" id="cxAddBcc">+ BCC</button></span></label><label class="cxOptionalRecipient" id="cxCcWrap" hidden>CC<input id="cxCc" placeholder="Separate emails with commas"></label><label class="cxOptionalRecipient" id="cxBccWrap" hidden>BCC<input id="cxBcc" placeholder="Separate emails with commas"></label><label>Document<select id="cxDoc"><option value="">No attached document</option><option value="sale">Sales invoice</option><option value="purchase">Purchase invoice</option></select></label><label id="cxInvoiceWrap" hidden>Invoice<select id="cxInvoice"></select></label><label>Subject<input id="cxSubject" placeholder="Subject"></label><label>Message<textarea id="cxBody" rows="9" placeholder="Write your message here…"></textarea></label><button id="cxSend" ${canAccess('connectx','add')?'':'disabled'}>Send via ConnectX</button></div></div>`;let contacts=[];async function contactsLoad(){recipientType=$('#cxType').value;contacts=await api('connectx/contacts?type='+recipientType);$('#cxContacts').innerHTML=contacts.map(x=>`<option value="${esc(x.full_name||x.name)} — ${esc(x.email||'no email')}" data-id="${x.id}">`).join('');selected=null;$('#cxContact').value='';$('#cxTo').value='';$('#cxContactInfo').textContent='Select a recipient to auto-fill contact details.'}async function docs(){let kind=$('#cxDoc').value,wrap=$('#cxInvoiceWrap');wrap.hidden=!kind;if(!kind)return;let rows=await api('connectx/invoices?kind='+kind);$('#cxInvoice').innerHTML='<option value="">Select invoice</option>'+rows.map(x=>`<option value="${x.id}">${esc(x.invoice_number)} · ${esc(x.invoice_date)} · ${money(x.subtotal)}</option>`).join('')}await contactsLoad();$('#cxAddCc').onclick=()=>{$('#cxCcWrap').hidden=false;$('#cxAddCc').style.display='none';$('#cxCc').focus()};$('#cxAddBcc').onclick=()=>{$('#cxBccWrap').hidden=false;$('#cxAddBcc').style.display='none';$('#cxBcc').focus()};$('#cxType').onchange=contactsLoad;$('#cxContact').onchange=e=>{let o=[...$('#cxContacts').options].find(x=>x.value===e.target.value);selected=contacts.find(x=>x.id===o?.dataset.id);if(!selected)return;let name=selected.full_name||selected.name,code=selected.user_id||selected.customer_code||selected.supplier_code||shortId(selected.id);$('#cxTo').value=selected.email||'';$('#cxContactInfo').innerHTML=`<b>${esc(name)}</b><span>ID: ${esc(code)}</span><span>${esc(selected.address||'—')}</span><span>${esc(selected.phone||'—')}</span><span>${esc(selected.email||'No saved email')}</span>`;$('#cxSubject').value=$('#cxDoc').value?`${$('#cxDoc').value==='sale'?'Sales':'Purchase'} Invoice`:'Message from '+(state.store?.name||'your shop')};$('#cxDoc').onchange=docs;$('#cxSend').onclick=async()=>{let b={recipientType,recipientId:selected?.id||null,to:$('#cxTo').value,cc:$('#cxCc').value,bcc:$('#cxBcc').value,subject:$('#cxSubject').value,body:$('#cxBody').value,documentType:$('#cxDoc').value||null,invoiceId:$('#cxInvoice').value||null};let btn=$('#cxSend');btn.disabled=true;btn.textContent='Sending…';try{await api('connectx/send',{method:'POST',body:JSON.stringify(b)});toast('Email sent through ConnectX.');$('#cxBody').value=''}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Send via ConnectX'}}}async function sent(){let rows=await api('connectx/messages');$('#connectxContent').innerHTML=`<div class="cxhead"><h2>Inbox · Send history</h2><span>${rows.length} recent messages</span></div><div class="cxsearch"><input id="cxSearch" placeholder="Search recipient, subject, or status"></div><div id="cxMessages">${cxTable(rows)}</div>`;$('#cxSearch').oninput=e=>{$('#cxMessages').innerHTML=cxTable(rows.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())));bindMessageActions(rows)};bindMessageActions(rows)}function bindMessageActions(rows){document.querySelectorAll('[data-cx-view]').forEach(b=>b.onclick=()=>connectXView(rows.find(x=>x.id===b.dataset.cxView)));document.querySelectorAll('[data-cx-more]').forEach(b=>b.onclick=e=>{e.stopPropagation();let menu=document.querySelector(`[data-cx-menu="${b.dataset.cxMore}"]`),wasHidden=menu.hidden;document.querySelectorAll('[data-cx-menu]').forEach(m=>m.hidden=true);menu.hidden=!wasHidden});document.querySelectorAll('[data-cx-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this message from this shop’s Inbox history? EMS Owner logs will remain permanently available.'))return;try{await api('connectx/messages/'+b.dataset.cxDelete,{method:'DELETE'});toast('Message removed from shop history.');connectX()}catch(e){toast(e.message)}})}function cxTable(rows){return rows.length?`<div class="tablewrap"><table><thead><tr><th>Date</th><th>Recipient</th><th>Subject</th><th>Document</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${esc(x.to_emails.join(', '))}</td><td>${esc(x.subject)}</td><td>${esc(x.invoice_id?'Invoice':'Message')}</td><td><span class="cxstatus ${esc(x.status)}">${esc(x.status)}</span>${x.error_message?`<small class="cxerror" title="${esc(x.error_message)}">${esc(x.error_message)}</small>`:''}</td><td class="actions"><button class="secondary" data-cx-view="${x.id}">View</button><div class="cxMoreWrap"><button class="cxMore" data-cx-more="${x.id}" aria-label="Message options">⋯</button><div class="cxMoreMenu" data-cx-menu="${x.id}" hidden><button class="danger" data-cx-delete="${x.id}" ${canAccess('connectx','delete')?'':'disabled'}>Delete message</button></div></div></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No sent ConnectX messages yet.</p>'}async function render(){if(tab==='compose')return compose();return sent()}document.querySelectorAll('[data-cx-tab]').forEach(b=>b.onclick=()=>{if(b.disabled)return;tab=b.dataset.cxTab;document.querySelectorAll('[data-cx-tab]').forEach(x=>x.classList.toggle('on',x===b));render()});await render()}
function connectXView(message){let e=document.createElement('div');e.className='modal cxViewModal';e.innerHTML=`<section class="modalbox cxEmailView"><div class="modalhead"><div><h2>${esc(message.subject)}</h2><p class="muted">To: ${esc(message.to_emails.join(', '))} · ${new Date(message.created_at).toLocaleString()}</p></div><button>×</button></div><div class="cxEmailMeta"><span>From: ${esc(message.from_email)}</span><span>Status: <b class="cxstatus ${esc(message.status)}">${esc(message.status)}</b></span>${message.cc_emails?.length?`<span>CC: ${esc(message.cc_emails.join(', '))}</span>`:''}</div><iframe class="cxEmailFrame" sandbox="" srcdoc="${esc(message.body_html)}"></iframe></section>`;document.body.append(e);e.querySelector('.modalhead button').onclick=()=>e.remove()}
async function dueRecover(){
  let history=[],modalState=null;
  const money=v=>Number(v||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
  const sourceLabel=t=>t==='sale'?'Sale':t==='purchase'?'Purchase':'Expense';
  const loadHistory=async()=>{
    $('#dueHistoryWrap').innerHTML='<p class="muted">Loading recovered records…</p>';
    history=await api('due?history=1');
    renderHistory($('#dueSearch')?.value||'');
  };
  const renderHistory=(q='')=>{
    const list=history.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));
    $('#dueHistoryWrap').innerHTML=list.length?`<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Party / Details</th><th>Recovered</th><th>Remaining due</th><th>Recovered by</th><th>Note</th></tr></thead><tbody>${list.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td><span class="statuspill active">${esc(sourceLabel(x.source_type))}</span></td><td><code class="shopid">${esc(x.source_reference||shortId(x.source_id))}</code></td><td>${esc(x.party_name||x.source_details||'—')}</td><td><b>${money(x.amount)}</b></td><td>${money(x.remaining_due)}</td><td>${esc(x.recovered_by_user||'Administrator')}</td><td>${esc(x.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No due recovery records found.</p>';
  };
  $('#page').innerHTML=title('Due recover',canAccess('due_recover','add')?`<button id="openRecoverModal">Recover</button>`:'',`<input id="dueSearch" class="headsearch" placeholder="Search recovered invoice records">`)+`<div class="flatlist" id="dueHistoryWrap"></div>`;
  $('#dueSearch').oninput=e=>renderHistory(e.target.value);
  if($('#openRecoverModal'))$('#openRecoverModal').onclick=()=>openRecoverModal();
  const openRecoverModal=()=>{
    const e=document.createElement('div');e.className='modal d2';
    modalState={mode:'sale',rows:[],selected:null,modal:e};
    e.innerHTML=`<div class="modalbox dueRecoverBox"><div class="modalhead"><h2>Recover due</h2><button type="button" id="drClose">×</button></div><div class="dueworkspace"><section class="dueleft"><h2>Due list</h2><div class="duetabs"><button class="on" data-modal-due="sale">Sale</button><button data-modal-due="purchase">Purchase</button><button data-modal-due="expense">Expense</button></div><div class="duesearch"><input id="modalDueSearch" placeholder="Search due"><button class="secondary" id="modalDueReload">Reload</button></div><div id="modalDueList"><p class="muted">Loading…</p></div></section><section class="dueright" id="modalRecoverForm"><div class="duesummary"><p class="muted">Select a due record from the left table.</p></div></section></div></div>`;
    document.body.append(e);
    e.querySelector('#drClose').onclick=()=>e.remove();
    e.addEventListener('click',ev=>{if(ev.target===e)e.remove()});
    e.querySelectorAll('[data-modal-due]').forEach(b=>b.onclick=()=>{modalState.mode=b.dataset.modalDue;e.querySelectorAll('[data-modal-due]').forEach(x=>x.classList.toggle('on',x===b));loadModalDues()});
    e.querySelector('#modalDueSearch').oninput=()=>renderModalDues();
    e.querySelector('#modalDueReload').onclick=loadModalDues;
    loadModalDues();
  };
  const loadModalDues=async()=>{
    const e=modalState.modal;
    e.querySelector('#modalDueList').innerHTML='<p class="muted">Loading…</p>';
    modalState.rows=await api('due?type='+modalState.mode);
    if(modalState.mode!=='expense'){
      const parties=await api(modalState.mode==='sale'?'customer':'supplier');
      const map=Object.fromEntries(parties.map(x=>[x.id,x]));
      modalState.rows=modalState.rows.map(x=>({...x,party:map[x.party_id]}));
    }
    modalState.selected=modalState.rows[0]||null;
    renderModalDues();
    renderRecoverForm();
  };
  const dueInfo=x=>{
    const m=modalState.mode;
    const due=Number(m==='expense'?x.due:x.total_due),paid=Number(m==='expense'?x.paid:x.paid_amount),total=Number(m==='expense'?x.total:x.subtotal),id=m==='expense'?x.expense_code:x.invoice_number,name=m==='expense'?x.details:(x.party?.name||(m==='sale'?'Custom customer':'Unknown supplier')),date=m==='expense'?x.expense_date:x.invoice_date;
    return {due,paid,total,id,name,date};
  };
  const renderModalDues=()=>{
    const e=modalState.modal,q=(e.querySelector('#modalDueSearch').value||'').toLowerCase(),rows=modalState.rows.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
    e.querySelector('#modalDueList').innerHTML=rows.length?`<div class="tablewrap dueshort"><table><thead><tr><th>Ref</th><th>Name</th><th>Due</th></tr></thead><tbody>${rows.map(x=>{const d=dueInfo(x);return `<tr class="${modalState.selected?.id===x.id?'selected':''}" data-pick-due="${x.id}"><td><code class="shopid">${esc(d.id)}</code><small>${esc(d.date)}</small></td><td>${esc(d.name)}</td><td><b>${money(d.due)}</b></td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted">No due records found.</p>';
    e.querySelectorAll('[data-pick-due]').forEach(r=>r.onclick=()=>{modalState.selected=modalState.rows.find(x=>x.id===r.dataset.pickDue);renderModalDues();renderRecoverForm()});
  };
  const renderRecoverForm=()=>{
    const e=modalState.modal,x=modalState.selected,box=e.querySelector('#modalRecoverForm');
    if(!x){box.innerHTML='<div class="duesummary"><p class="muted">Select a due record from the left table.</p></div>';return}
    const d=dueInfo(x),m=modalState.mode;
    box.innerHTML=`<div class="duesummary"><p><b>Reference:</b> ${esc(d.id)}</p><p><b>${m==='expense'?'Details':'Party'}:</b> ${esc(d.name)}</p><div class="duegrid"><label>Total<input readonly value="${money(d.total)}"></label><label>Previous paid<input readonly value="${money(d.paid)}"></label><label>Previous due<input readonly value="${money(d.due)}"></label></div></div><div class="duegrid"><label>Recover amount<input id="recoverAmount" type="number" min="0.01" max="${d.due}" step="0.01" value="0"></label><label>New due amount<input id="newDue" readonly value="${money(d.due)}"></label></div><label>Note<textarea id="recoverNote" rows="3"></textarea></label><div class="dueactions"><button id="saveRecover">Save recovery</button><button class="secondary" id="clearRecover">Clear form</button>${m!=='expense'?'<button class="secondary" id="viewDueInvoice">View invoice</button>':''}</div>`;
    box.querySelector('#recoverAmount').oninput=ev=>box.querySelector('#newDue').value=money(Math.max(0,d.due-Number(ev.target.value||0)));
    box.querySelector('#clearRecover').onclick=()=>{box.querySelector('#recoverAmount').value=0;box.querySelector('#newDue').value=money(d.due);box.querySelector('#recoverNote').value=''};
    box.querySelector('#saveRecover').onclick=async()=>{const amount=Number(box.querySelector('#recoverAmount').value);if(!amount||amount<=0)return toast('Enter a valid recovery amount.');try{await api('due',{method:'POST',body:JSON.stringify({sourceType:m,sourceId:x.id,amount,note:box.querySelector('#recoverNote').value})});toast('Due recovery saved.');await loadModalDues();await loadHistory()}catch(err){toast(err.message)}};
    if(m!=='expense')box.querySelector('#viewDueInvoice').onclick=()=>invoiceView(x,m==='sale'?'Sales':'Purchase');
  };
  await loadHistory();
}

async function invoices(page){let kind=page==='purchases'?'purchase':'sale',label=kind==='purchase'?'Purchase':'Sales',[rows,parties]=await Promise.all([api('invoices?kind='+kind),api('invoice-parties?kind='+kind)]);let partyMap=Object.fromEntries(parties.map(x=>[x.id,x]));rows=rows.map(x=>({...x,partyName:partyMap[x.party_id]?.name||x.custom_party_name||'Custom / walk-in customer'}));$('#page').innerHTML=title(label+' invoices',canAccess(kind==='sale'?'sales':'purchase','add')?`<button id="addInvoice">+ Add new ${label.toLowerCase()}</button>`:'',`<input id="invoiceSearch" class="headsearch" placeholder="Search invoice number, date, customer, or transaction ID">`)+`<div class="flatlist"><div id="invoiceData">${invoiceTable(rows,label)}</div></div>`;$('#invoiceSearch').oninput=e=>$('#invoiceData').innerHTML=invoiceTable(rows.filter(r=>JSON.stringify(r).toLowerCase().includes(e.target.value.toLowerCase())),label);if($('#addInvoice'))$('#addInvoice').onclick=()=>invoiceModal(kind);document.querySelectorAll('[data-view-invoice]').forEach(b=>b.onclick=()=>invoiceView(rows.find(x=>x.id===b.dataset.viewInvoice),label));document.querySelectorAll('[data-edit-invoice]').forEach(b=>b.onclick=()=>toast('Posted invoice editing will be enabled with the next safe stock-reversal update.'));document.querySelectorAll('[data-delete-invoice]').forEach(b=>b.onclick=async()=>{let r=rows.find(x=>x.id===b.dataset.deleteInvoice);if(!confirm(`Delete ${r.invoice_number}? Inventory movement will be safely reversed.`))return;try{await api('invoices/'+r.id,{method:'DELETE'});toast('Invoice deleted and inventory reversed.');invoices(page)}catch(e){toast(e.message)}})}
function invoiceTable(rows,label){if(!rows.length)return '<p class="muted">No '+label.toLowerCase()+' invoices found.</p>';let partyLabel=label==='Sales'?'Customer name':'Supplier name',section=label==='Sales'?'sales':'purchase';return `<div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>${partyLabel}</th><th>Subtotal</th><th>Discount</th><th>Paid</th><th>Due</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr class="${Number(r.total_due)>0?'dueInvoice':''}"><td>${esc(r.invoice_number)}</td><td>${esc(r.invoice_date)}</td><td>${esc(r.partyName)}</td><td>${money(r.subtotal)}</td><td>${money(r.discount)}</td><td>${money(r.paid_amount)}</td><td>${money(r.total_due)}</td><td class="actions"><button class="secondary" data-view-invoice="${r.id}" ${canAccess(section,'view')?'':'disabled'}>View</button><button class="secondary" data-edit-invoice="${r.id}" ${canAccess(section,'edit')?'':'disabled'}>Edit</button><button class="danger" data-delete-invoice="${r.id}" ${canAccess(section,'delete')?'':'disabled'}>Delete</button></td></tr>`).join('')}</tbody></table></div>`}
async function invoiceModal(kind){let partyKind=kind==='purchase'?'supplier':'customer',[parties,items,number,vault]=await Promise.all([api('invoice-parties?kind='+kind),api('invoice-items?kind='+kind),api('invoice-number?kind='+kind),api('vaultium/availability').catch(()=>({enabled:false}))]);let lines=[],files=[];let e=document.createElement('div');e.className='modal d2';e.innerHTML=`<form class="modalbox invoiceform fields"><div class="modalhead"><h2>New ${kind==='purchase'?'purchase':'sales'} invoice</h2><button type="button">×</button></div><section class="invoiceSection"><h3>${kind==='purchase'?'Supplier':'Customer'} information</h3><label>Search and select ${partyKind}<input list="partyOptions" id="partySearch" placeholder="Name, phone, or ${partyKind} ID"><datalist id="partyOptions">${parties.map(x=>`<option value="${esc(x.name)} — ${esc(x.phone)}" data-id="${x.id}">`).join('')}</datalist></label>${kind==='sale'?`<button class="clearParty secondary" type="button" id="clearParty">Clear selection</button><div class="partyFields"><label>Customer ID<input id="customerCode" readonly value="Custom customer"></label><label>Name<input id="customerName" placeholder="Customer name"></label><label>Address<textarea id="customerAddress" rows="2" placeholder="Customer address"></textarea></label><label>Phone<input id="customerPhone" placeholder="Customer phone"></label></div>`:''}${kind==='purchase'?`<button class="clearParty secondary" type="button" id="clearParty">Clear selection</button><div class="partyFields"><label>Supplier ID<input id="supplierCode" readonly></label><label>Name<input id="supplierName" readonly></label><label>Address<textarea id="supplierAddress" rows="2" readonly></textarea></label><label>Phone<input id="supplierPhone" readonly></label></div>`:''}</section><section class="invoiceSection"><h3>Invoice details</h3><div class="grid2"><label>Date<input name="invoiceDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank</option><option value="other">Other</option></select></label><label>Transaction no.<input name="transactionId"></label><label>Invoice no.<input name="invoiceNumber" readonly required value="${esc(number.invoiceNumber)}"></label></div><label>Notes<textarea name="notes"></textarea></label></section><section class="invoiceSection itemEntrySection"><h3>Item</h3><div class="grid2"><label>Search inventory item<input list="itemOptions" id="itemSearch" placeholder="Item code or description"><datalist id="itemOptions">${items.filter(x=>kind==='purchase'||x.active).map(x=>`<option value="${esc(x.item_code)} — ${esc(x.description)}" data-id="${x.id}">`).join('')}</datalist></label><label>Quantity<input id="lineQty" type="number" min="0.001" step="0.001" value="1"></label><label>${kind==='purchase'?'Buy':'Sale'} price<input id="linePrice" type="number" min="0" step="0.01"></label><div><label>&nbsp;</label><button class="secondary" type="button" id="addLine">Add item</button></div></div><div id="lines">No items added.</div></section><section class="invoiceSection"><h3>Purchase summary</h3><div class="summarygrid"><label>Subtotal<input id="subtotal" readonly></label><label>Tax (%)<input id="taxPercent" type="number" min="0" step="0.01" value="0"></label><label>Discount<input id="discount" type="number" min="0" step="0.01" value="0"></label><label>Tax amount<input id="taxAmount" readonly></label><label>Paid amount<input id="paidAmount" type="number" min="0" step="0.01" value="0"></label><label>Total due<input id="totalDue" readonly></label></div></section>${vault.enabled?`<section class="invoiceSection"><h3>File attachments <span class="muted">(Vaultium)</span></h3><div class="vaultAttach"><label class="vaultPick"><input type="file" id="vaultFileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">Attach files — max 5, 5 MB each</label><div id="vaultSelected" class="vaultSelected"></div></div></section>`:''}<div class="invoicebuttons"><button>Save invoice</button><button class="secondary" type="button" id="clearInvoice">Clear invoice</button></div></form>`;document.body.append(e);const renderVaultFiles=()=>{const box=$('#vaultSelected');if(!box)return;box.innerHTML=files.length?files.map((f,i)=>`<div class="vaultChip"><span>${esc(f.name)} <small>${(f.size/MB2).toFixed(2)} MB</small></span><button type="button" class="vaultX" data-vault-rm="${i}">×</button></div>`).join(''):'';box.querySelectorAll('[data-vault-rm]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.vaultRm,1);renderVaultFiles()})};if(vault.enabled){const fi=$('#vaultFileInput');if(fi)fi.onchange=ev=>{for(const f of [...ev.target.files]){if(files.length>=5){toast('Maximum 5 files.');break}if(f.size>5*MB2){toast(f.name+' exceeds 5 MB.');continue}files.push(f)}ev.target.value='';renderVaultFiles()};renderVaultFiles()}let party=null;function optionId(text,source){let o=[...source.querySelectorAll('option')].find(x=>x.value===text);return o?.dataset.id}function render(){let sub=lines.reduce((n,x)=>n+x.quantity*x.unitPrice,0),tax=sub*Number($('#taxPercent').value||0)/100,discount=Number($('#discount').value||0),paid=Number($('#paidAmount').value||0),due=sub+tax-discount-paid;$('#subtotal').value=money(sub);$('#taxAmount').value=money(tax);$('#totalDue').value=money(due);$('#lines').innerHTML=lines.length?`<div class="tablewrap"><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th>Total</th><th></th></tr></thead><tbody>${lines.map((x,i)=>`<tr><td>${esc(x.item.item_code)} — ${esc(x.item.description)}</td><td>${x.quantity}</td><td>${esc(x.item.unit)}</td><td>${money(x.unitPrice)}</td><td>${money(x.quantity*x.unitPrice)}</td><td><button type="button" class="danger" data-remove-line="${i}">Remove</button></td></tr>`).join('')}</tbody></table></div>`:'No items added.';e.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>{lines.splice(+b.dataset.removeLine,1);render()})}e.querySelector('.modalhead button').onclick=()=>e.remove();$('#partySearch').onchange=x=>{party=parties.find(z=>z.id===optionId(x.target.value,$('#partyOptions')));if(party&&kind==='sale'){let f=[['customerCode',party.customer_code||shortId(party.id)],['customerName',party.name],['customerAddress',party.address||''],['customerPhone',party.phone||'']];f.forEach(([id,v])=>{let el=$('#'+id);el.value=v;el.readOnly=true});}if(party&&kind==='purchase'){[['supplierCode',party.supplier_code||shortId(party.id)],['supplierName',party.name],['supplierAddress',party.address||''],['supplierPhone',party.phone||'']].forEach(([id,v])=>$('#'+id).value=v)};};if(kind==='sale')$('#clearParty').onclick=()=>{party=null;$('#partySearch').value='';$('#customerCode').value='Custom customer';[['customerName','customerAddress','customerPhone']].forEach(([id])=>{let el=$('#'+id);el.value='';el.readOnly=false});};if(kind==='purchase')$('#clearParty').onclick=()=>{party=null;$('#partySearch').value='';['supplierCode','supplierName','supplierAddress','supplierPhone'].forEach(id=>$('#'+id).value='')};$('#itemSearch').onchange=()=>{let item=items.find(z=>z.id===optionId($('#itemSearch').value,$('#itemOptions')));if(item&&kind==='sale')$('#linePrice').value=item.sale_price??'';};$('#addLine').onclick=()=>{let item=items.find(z=>z.id===optionId($('#itemSearch').value,$('#itemOptions'))),q=Number($('#lineQty').value),price=Number($('#linePrice').value);if(!item||!q||q<=0||Number.isNaN(price)||price<0)return toast('Select an item and enter a valid quantity and price.');lines.push({item,quantity:q,unitPrice:price});$('#itemSearch').value='';$('#lineQty').value=1;$('#linePrice').value='';render()};['taxPercent','discount','paidAmount'].forEach(id=>$('#'+id).oninput=render);$('#clearInvoice').onclick=()=>{lines=[];party=null;let invoiceNo=e.querySelector('[name=invoiceNumber]').value;e.querySelector('form').reset();e.querySelector('[name=invoiceNumber]').value=invoiceNo;$('#partySearch').value='';if(kind==='sale'){ $('#customerCode').value='Custom customer';[['customerName','customerAddress','customerPhone']].forEach(([id])=>{let el=$('#'+id);el.value='';el.readOnly=false}) }else{['supplierCode','supplierName','supplierAddress','supplierPhone'].forEach(id=>$('#'+id).value='')}$('#itemSearch').value='';$('#lineQty').value=1;$('#linePrice').value='';render()};e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(kind==='purchase'&&!party)return toast('Select a valid supplier.');if(kind==='sale'&&!party&&!$('#customerName').value.trim())return toast('Enter a customer name or select a registered customer.');if(!lines.length)return toast('Add at least one inventory item.');let f=Object.fromEntries(new FormData(ev.target));try{let inv=await api('invoices',{method:'POST',body:JSON.stringify({kind,invoiceNumber:f.invoiceNumber,partyId:party?.id||null,customPartyName:kind==='sale'&&!party?$('#customerName').value.trim():null,customPartyAddress:kind==='sale'&&!party?$('#customerAddress').value.trim():null,customPartyPhone:kind==='sale'&&!party?$('#customerPhone').value.trim():null,invoiceDate:f.invoiceDate,paymentMethod:f.paymentMethod,transactionId:f.transactionId,notes:f.notes,taxPercent:Number($('#taxPercent').value||0),discount:Number($('#discount').value||0),paidAmount:Number($('#paidAmount').value||0),lines:lines.map(x=>({itemId:x.item.id,quantity:x.quantity,unitPrice:x.unitPrice}))})});if(vault.enabled&&files.length){for(const file of files){const fd=new FormData();fd.append('files',file);fd.append('invoice_id',inv.id);fd.append('invoice_number',inv.invoice_number||f.invoiceNumber);await apiUpload('vaultium/upload',fd)}}e.remove();toast('Invoice saved and inventory updated.');invoices(kind==='purchase'?'purchases':'sales')}catch(x){toast(x.message)}};render()}
async function invoiceView(r,label){let partyKind=r.kind==='sale'?'customer':'supplier';let [parties,staff,store,branding,tb]=await Promise.all([api('invoice-parties?kind='+r.kind),api('staff').catch(()=>[]),api('shop/settings'),api('public/branding'),api('truebill/availability').catch(()=>({enabled:false,ever:false}))]);let party=parties.find(x=>x.id===r.party_id),partyName=party?.name||r.custom_party_name||'—',partyAddress=party?.address||r.custom_party_address||'—',partyPhone=party?.phone||r.custom_party_phone||'—',partyCode=party?.customer_code||party?.supplier_code||(r.custom_party_name?'Custom customer':'Custom / not registered'),submitter=staff.find(x=>x.id===r.created_by),paid=Number(r.total_due)<=0,showQR=!!(tb.enabled||tb.ever),base=(tb.url||location.origin).replace(/\/$/,''),verifyUrl=base+'/?verify='+r.verification_token,qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=165x165&data='+encodeURIComponent(verifyUrl);let e=document.createElement('div');e.className='modal invoiceviewmodal';let billLabel=r.kind==='sale'?'Bill to':'Supplier';e.innerHTML=`<section class="invoiceprint"><header class="invoicePrintHeader"><div class="invoiceShopInfo"><h2>${esc(store.name)}</h2><p>${esc(store.address||'')}</p><p>${esc(store.phone||'')}${store.phone2?' · '+esc(store.phone2):''}</p><p>${esc(store.email||'')}</p>${store.website?`<p>${esc(store.website)}</p>`:''}</div><div class="invoiceTitleRight"><h1>${r.kind==='sale'?'SALES INVOICE':'PURCHASE INVOICE'}</h1><span># ${esc(r.invoice_number)}</span><b class="invoiceStatus ${paid?'paid':'due'}">${paid?'Paid':'Due'}</b></div></header><div class="invoicePrintInfo"><div><h3>${billLabel}</h3><p><i>ID:</i> <b>${esc(partyCode)}</b></p><p><i>Name:</i> <b>${esc(partyName)}</b></p><p><i>Address:</i> ${esc(partyAddress)}</p><p><i>Phone:</i> ${esc(partyPhone)}</p></div><div><h3>Invoice details</h3><p><i>Date:</i> <b>${esc(r.invoice_date)}</b></p><p><i>Invoice no.:</i> <b>${esc(r.invoice_number)}</b></p><p><i>Payment method:</i> <b>${esc(r.payment_method)}</b></p><p><i>Transaction ID:</i> <b>${esc(r.transaction_id||'—')}</b></p><p><i>Submit by:</i> <b>${esc(submitter?.user_id||'Administrator')}</b></p></div></div><div class="tablewrap"><table class="printItems"><thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th class="right">Total</th></tr></thead><tbody>${(r.invoice_lines||[]).map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.inventory_items?.description||'Item')}</b><br><small>${esc(x.inventory_items?.item_code||'')}</small></td><td>${esc(x.quantity)}</td><td>${esc(x.inventory_items?.unit||'')}</td><td>${invoiceMoney(x.unit_price)}</td><td class="right">${invoiceMoney(x.line_total)}</td></tr>`).join('')}</tbody></table></div><div class="invoiceBottom">${showQR?`<div class="invoiceQR"><div class="qrwrap"><img src="${qrUrl}" alt="TrueBill QR code"></div><div class="qrtext"><b>Scan For Verify</b><small>TrueBill</small></div></div>`:''}<div class="printTotals"><div><p><span>Subtotal</span><b>${invoiceMoney(r.subtotal)}</b></p><p><span>Tax (${esc(r.tax_percent)}%)</span><b>${invoiceMoney(r.tax_amount)}</b></p><p><span>Discount</span><b>−${invoiceMoney(r.discount)}</b></p><p><span>Paid amount</span><b>−${invoiceMoney(r.paid_amount)}</b></p><p class="dueLine"><span>Total due</span><b>${invoiceMoney(r.total_due)}</b></p><small>${paid?'Balance: Paid in full':'Balance pending'}</small></div></div></div><footer class="invoicePrintFooter"><div><b>Notes:</b><br>${esc(r.notes||'No additional notes.')}</div><div><b>Invoice status:</b> ${paid?'Paid':'Payment due'}<br><small>Generated ${new Date().toLocaleDateString()}</small><br><small>This invoice is a computer generated document · Powered by DoxTox EMS</small></div></footer><div class="printActions"><button id="printInvoice">Print invoice</button><button class="secondary" id="closeInvoice">Close</button></div></section>`;document.body.append(e);e.querySelector('#closeInvoice').onclick=()=>e.remove();e.querySelector('#printInvoice').onclick=()=>{let w=window.open('','_blank');w.document.write('<html><head><title>'+esc(r.invoice_number)+'</title><style>body{font-family:Arial;padding:12mm 15mm;color:#111;font-size:10px}.printActions{display:none}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#111;color:#fff;text-align:left;padding:6px;font-size:9px}td{padding:5px 6px;border-bottom:1px solid #ddd;font-size:10px}.invoicePrintHeader{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px}.invoiceShopInfo{font-size:10px;line-height:1.3}.invoiceShopInfo h2{font-size:17px;margin:0 0 3px}.invoiceTitleRight{text-align:right}.invoiceTitleRight h1{font-size:21px;margin:0}.invoicePrintInfo{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:14px 0}.invoicePrintInfo h3{font-size:10px;margin:0 0 5px}.invoicePrintInfo p{margin:2px 0}.printTotals{display:flex;justify-content:end;margin-top:10px}.printTotals>div{width:290px}.printTotals p{display:flex;justify-content:space-between;margin:4px 0}.dueLine{border-top:1px solid #ddd;padding-top:7px;font-size:14px}.invoicePrintFooter{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:10px;margin-top:14px;font-size:10px}.invoiceBottom{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:10px}.invoiceQR{display:flex;align-items:flex-start;gap:10px}.invoiceQR img{width:110px;height:110px;border:1px solid #ddd;padding:3px;background:#fff}.qrwrap{display:inline-block;line-height:0}.qrtext{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:110px}.qrtext b{font-size:11px;color:#111}.qrtext small{font-size:9px;color:#666;letter-spacing:.3px}.invoiceBottom .printTotals{margin:0 0 0 auto}</style></head><body>'+e.querySelector('.invoiceprint').innerHTML+'</body></html>');w.document.close();let printed=false,printWhenReady=()=>{if(printed)return;printed=true;setTimeout(()=>w.print(),250)},qr=w.document.querySelector('.invoiceQR img');if(qr&&!qr.complete){qr.addEventListener('load',printWhenReady,{once:true});qr.addEventListener('error',printWhenReady,{once:true});setTimeout(printWhenReady,5000)}else printWhenReady()}}
async function settings(){let tab='store';$('#page').innerHTML=title('Settings')+`<div class="settingtabs"><button class="on" data-setting-tab="store">Store</button><button data-setting-tab="activity">Activity Log</button></div><div id="settingContent"></div>`;async function render(){let el=$('#settingContent');el.innerHTML='<section class="panel"><p class="muted">Loading…</p></section>';if(tab==='store'){let x=await api('shop/settings');el.innerHTML=`<section class="storeDetails"><div><span>Store name</span><b>${esc(x.name)}</b></div><div><span>Shop ID</span><b><code class="shopid">${esc(x.shop_code)}</code></b></div><div><span>Address</span><b>${esc(x.address||'—')}</b></div><div><span>Phone</span><b>${esc(x.phone||'—')}${x.phone2?' / '+esc(x.phone2):''}</b></div><div><span>Email</span><b>${esc(x.email||'—')}</b></div><div><span>Website</span><b>${esc(x.website||'—')}</b></div><div><span>Low stock alert</span><b>${esc(x.low_stock_threshold)}</b></div><div><span>Status</span><b><span class="statuspill ${x.status==='active'?'active':'inactive'}">${esc(x.status)}</span></b></div></section>`}else{let logs=await api('shop/activity-logs');el.innerHTML=`<section class="panel"><div class="loghead"><div><h2>Activity Log</h2><p class="muted">Login, create, update, delete, and recovery activity for this shop.</p></div><input id="logSearch" placeholder="Search activity"></div><div id="logTable">${activityTable(logs)}</div></section>`;$('#logSearch').oninput=e=>$('#logTable').innerHTML=activityTable(logs.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())))}}function activityTable(rows){return rows.length?`<div class="tablewrap"><table><thead><tr><th>Action</th><th>Entity</th><th>Details</th><th>User ID</th><th>User</th><th>Date & time</th></tr></thead><tbody>${rows.map(x=>`<tr><td><span class="logaction">${esc(x.action)}</span></td><td>${esc(x.entity_type||'—')}</td><td><code class="shopid">${esc(x.detail||'—')}</code></td><td>${esc(x.actor?.userId||'—')}</td><td>${esc(x.actor?.name||'—')}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No activity has been recorded for this shop.</p>'}document.querySelectorAll('[data-setting-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.settingTab;document.querySelectorAll('[data-setting-tab]').forEach(x=>x.classList.toggle('on',x===b));render()});await render()}
function modal(head,fields,submit){let e=document.createElement('div');e.className='modal';e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${head}</h2><button type="button">×</button></div>${fields.map(([n,l,r])=>`<label>${l}<input name="${n}" ${r?'required':''}></label>`).join('')}<button>Save</button></form>`;document.body.append(e);e.querySelector('[type=button]').onclick=()=>e.remove();e.querySelector('form').onsubmit=async x=>{x.preventDefault();try{await submit(Object.fromEntries(new FormData(x.target)));e.remove()}catch(err){toast(err.message)}}}
if(new URLSearchParams(location.search).get('verify')){verificationPage(new URLSearchParams(location.search).get('verify'))}else if(new URLSearchParams(location.search).get('page')){publicPage(new URLSearchParams(location.search).get('page'))}else if(state){scheduleLogout();home()}else login();

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
const addonArt=x=>`<div class="addonArt">${x.addon_key==='zudo'?(x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" onerror="this.remove()">`:ZUDO_LOADER):(x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" onerror="this.remove()">`:`<i>${addonIcon(x.addon_key)}</i>`)}</div>`;
const addonBadgeCls=st=>st==='active'?'act':st==='pending'?'pend':st==='rejected'?'rej':st==='expired'?'exp':'';

async function helpdeskAdmin(){
  const moneyT=v=>new Date(v).toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  $('#page').innerHTML=`<div class="hdwrap"><div class="hdchat"><header class="hdhead"><div><h2>◔ HelpDesk</h2><span>One continuous conversation with EMS support</span></div><span class="hdunread" id="hdUnread" hidden></span></header><div class="hdmsgs" id="hdMsgs"><p class="muted">Loading conversation…</p></div><form class="hdcomposer" id="hdForm"><textarea id="hdInput" rows="2" placeholder="Describe your issue or question…"></textarea><button id="hdSend" type="submit">Send</button></form></div></div>`;
  const draw=async(mark=true)=>{
    const d=await api('helpdesk');
    const box=$('#hdMsgs');
    box.innerHTML=d.messages.length?d.messages.map(m=>`<div class="hdmsg ${m.sender_type==='admin'?'me':'them'}"><div class="hdmsgbody">${esc(m.content).replace(/\n/g,'<br>')}</div><span class="hdtime">${moneyT(m.created_at)}</span></div>`).join(''):`<div class="hdempty"><b>Welcome to HelpDesk</b><p>Send a message and the EMS owner will reply here. The whole conversation stays in this one chat.</p></div>`;
    box.scrollTop=box.scrollHeight;
    const u=$('#hdUnread');if(u){u.textContent=d.unread+' new';u.hidden=d.unread===0}
    const b=$('#hbBadge');if(b){b.textContent=d.unread;b.hidden=d.unread===0}
    if(mark&&d.messages.some(m=>m.sender_type==='owner'&&!m.read_by_admin))await api('helpdesk',{method:'PATCH',body:'{}'}).catch(()=>{});
  };
  await draw();
  $('#hdForm').onsubmit=async e=>{e.preventDefault();const input=$('#hdInput'),content=input.value.trim();if(!content)return;const btn=$('#hdSend');btn.disabled=true;try{await api('helpdesk',{method:'POST',body:JSON.stringify({content})});input.value='';await draw(false)}catch(err){toast(err.message)}finally{btn.disabled=false;input.focus()}};
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
  const draw=()=>{
    const sub=addonCart.reduce((n,i)=>n+i.validity_days*i.daily_limit*i.unit_price,0);
    const discount=addonCoupon?Math.round(sub*addonCoupon.percent_off)/100:0;
    const grand=sub-discount;
    $('#page').innerHTML=title('Premium Add-Ons')+`<div class="addonShop"><div><section class="addonGrid">${d.settings.map(x=>{const st=statusOf(x);return `<article class="addonCard">${addonArt(x)}<h2>${esc(addonName(x))}</h2><p>${esc(x.details||'')}</p><small class="statusBadge ${st.cls}">${esc(st.label)}</small><button data-buy-addon="${x.addon_key}" ${st.key==='buy'?'':'disabled'}>${buttonFor(st)}</button></article>`}).join('')}</section></div>${addonCart.length?`<aside class="addonCheckout"><h2>Checkout</h2>${addonCart.map((i,n)=>`<div class="cartItem"><span>${esc(addonName(i))}<small>${addonIsVault(i)?`${i.daily_limit} GB · ${i.validity_days} month${i.validity_days>1?'s':''}`:addonNoLimit(i)?`${i.validity_days} days`:`${i.daily_limit}/day · ${i.validity_days} days`}</small></span><b>${money(i.validity_days*i.daily_limit*i.unit_price)} BDT</b><button class="danger" data-remove-cart="${n}" title="Remove">×</button></div>`).join('')}<div class="cartTotals"><p><span>Subtotal</span><b id="addonSub">${money(sub)} BDT</b></p><div class="couponRow"><input id="addonCoupon" placeholder="Coupon code" ${addonCoupon?`value="${esc(addonCoupon.code)}" readonly`:''}>${addonCoupon?`<button type="button" id="addonCouponClear" class="ghost">Clear</button>`:`<button type="button" id="addonCouponApply">Apply</button>`}</div>${addonCoupon?`<p><span>Coupon (${esc(addonCoupon.code)} −${addonCoupon.percent_off}%)</span><b>−${money(discount)} BDT</b></p>`:''}<p class="grand"><span>Grand Total</span><b id="addonGrand">${money(grand)} BDT</b></p></div>${d.payment_info?`<div class="paymentInfo"><h3>Payment instructions</h3><p>${esc(d.payment_info).replace(/\n/g,'<br>')}</p></div>`:''}<label>Payment method<select id="addonPay"><option value="bkash">bKash</option><option value="nagad">Nagad</option></select></label><label>Payment number<input id="addonPayNumber" placeholder="Required" required></label><label>Transaction ID<input id="addonTrx" placeholder="Required" required></label><button id="addonConfirm">Confirm purchase</button></aside>`:''}</div><section class="panel addonHistory"><h2>Purchase history</h2>${purchases.length?`<div class="tablewrap"><table><thead><tr><th>Add-on</th><th>Days</th><th>Daily limit</th><th>Amount</th><th>Discount</th><th>Payable</th><th>Payment</th><th>Transaction ID</th><th>Status</th><th>Expiry</th></tr></thead><tbody>${purchases.map(p=>`<tr><td>${esc(ADDON_NAMES[p.addon_key]||p.addon_key)}</td><td>${p.validity_days}</td><td>${p.addon_key==='truebill'?'—':p.addon_key==='vaultium'?p.daily_limit+' GB':p.daily_limit}</td><td>${money(p.amount)} BDT</td><td>${Number(p.discount_amount||0)?'−'+money(p.discount_amount)+' BDT':'—'}</td><td><b>${money(Math.max(0,Number(p.amount||0)-Number(p.discount_amount||0)))} BDT</b></td><td>${esc(p.payment_method)}<br><small>${esc(p.payment_number)}</small></td><td>${esc(p.transaction_id)}</td><td><span class="statusBadge ${addonBadgeCls(p.status)}">${esc(p.status)}</span></td><td>${p.expires_at?new Date(p.expires_at).toLocaleDateString():'—'}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">No purchases yet.</p>`}</section>`;
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
  const e=document.createElement('div');e.className='modal';
  e.innerHTML=`<form class="modalbox fields"><div class="modalhead"><h2>${esc(addonName(x))}</h2><button type="button">×</button></div><p>${esc(x.details||'')}</p><p class="muted">${isVault?'Price = months × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT (GB is your storage allowance)':noLimit?'Price = validity days × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT':'Price = validity days × daily limit × '+Number(x.unit_price).toLocaleString('en-BD')+' BDT'}</p><div class="grid2">${isVault?`<label>Storage (GB)<input id="agb" type="number" min="${x.min_daily_limit}" max="${x.max_daily_limit}" value="${x.min_daily_limit}" required></label><label>Months<input id="am" type="number" min="${x.min_days}" max="${x.max_days}" value="${x.min_days}" required></label>`:`<label>Validity days<input id="ad" type="number" min="${x.min_days}" max="${x.max_days}" value="${x.min_days}" required></label>${noLimit?'':`<label>Daily limit<input id="al" type="number" min="${x.min_daily_limit}" max="${x.max_daily_limit}" value="${x.min_daily_limit}" required></label>`}`}</div><p class="addonModalTotal"><span>Total</span><b id="at"></b></p><button>Add to cart</button></form>`;
  document.body.append(e);
  const calc=()=>{let total;if(isVault){total=+$('#am').value*Number(x.unit_price)}else{const days=+$('#ad').value,limit=noLimit?1:+$('#al').value;total=days*limit*Number(x.unit_price)}$('#at').textContent=total.toLocaleString('en-BD')+' BDT'};
  calc();if(isVault){$('#agb').oninput=calc;$('#am').oninput=calc}else{$('#ad').oninput=calc;if(!noLimit)$('#al').oninput=calc}
  e.querySelector('[type=button]').onclick=()=>e.remove();
  e.querySelector('form').onsubmit=v=>{v.preventDefault();let days,limit;if(isVault){days=+$('#am').value;limit=+$('#agb').value;if(days<x.min_days||days>x.max_days)return toast('Months must be between '+x.min_days+' and '+x.max_days+'.');if(limit<x.min_daily_limit||limit>x.max_daily_limit)return toast('Storage must be between '+x.min_daily_limit+' and '+x.max_daily_limit+' GB.')}else{days=+$('#ad').value;if(days<x.min_days||days>x.max_days)return toast('Validity days must be between '+x.min_days+' and '+x.max_days+'.');limit=1;if(!noLimit){limit=+$('#al').value;if(limit<x.min_daily_limit||limit>x.max_daily_limit)return toast('Daily limit must be between '+x.min_daily_limit+' and '+x.max_daily_limit+'.')}}addonCart=addonCart.filter(i=>i.addon_key!==x.addon_key);addonCart.push({addon_key:x.addon_key,title:x.title,validity_days:days,daily_limit:limit,unit_price:Number(x.unit_price)});addonCoupon=null;e.remove();refresh()};
}







