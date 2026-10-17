/* CShop Clothing Business Console pages.
   This module is intentionally isolated from EMS electronics pages. All shop
   data still flows through the existing authenticated EMS API. */
const $ = s => document.querySelector(s);
const SIZE_CATEGORIES = ['Shirts','T-shirts','Trousers','Jeans','Dresses','Sarees','Panjabis','Jackets','Uniforms','Accessories','Fabric','Footwear','Other'];
const SIZE_SYSTEMS = ['alpha','numeric','waist','chest','kids-age','shoe','one-size','custom'];
const STOCK_UNITS = ['pcs','pair','set','dozen','meter','yard'];
const DEFAULT_ALPHA = ['XS','S','M','L','XL','XXL','XXXL'];
const esc = (ctx, v) => ctx.esc(v ?? '');
const money = (ctx, v) => '৳ ' + ctx.money(Number(v || 0));
const localYmd = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const isoDateOffset = (days) => { const d=new Date(); d.setDate(d.getDate()+days); return localYmd(d); };
const fmtDate = x => x ? new Date(String(x).slice(0,10)+'T00:00:00').toLocaleDateString('en-BD',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const variantName = v => [v.product?.name || v.product_name, v.color, v.size_label].filter(Boolean).join(' · ') || v.description || v.item_code || 'Variant';
const skuOf = v => v.variant_sku || v.sku || v.item_code || '—';
const stockOf = v => Number(v.stock ?? v.total_stock ?? v.item?.total_stock ?? 0);
const cshIcon = (ctx,name) => ctx.lucide ? ctx.lucide(name) : '✦';
const cshBtn = (text, action, type='button', cls='') => `<button type="${type}" class="csh-btn ${cls}" ${action?`data-csh-action="${action}"`:''}>${text}</button>`;
const cshHeading = (_eyebrow,_title,_copy,actions='') => actions ? `<div class="csh-page-actions"><div class="csh-heading-actions">${actions}</div></div>` : '';
const cshCard = (label,value,foot,icon='shirt',tone='plum') => `<article class="csh-kpi csh-tone-${tone}"><span class="csh-kpi-icon">${cshIcon(window.__cshCtx||{},icon)}</span><div><small>${label}</small><strong>${value}</strong><span>${foot||''}</span></div></article>`;
const cshEmpty = message => `<div class="csh-empty"><span>◌</span><b>${message}</b></div>`;

function ctxFor(ctx){ window.__cshCtx=ctx; return ctx; }
function cshPanel(title,copy,inner,actions=''){return `<section class="csh-panel"><header class="csh-panel-head"><div><h2>${title}</h2>${copy?`<p>${copy}</p>`:''}</div>${actions?`<div class="csh-panel-actions">${actions}</div>`:''}</header>${inner}</section>`}
function cshModal(title,description,content,wide=false){
  const el=document.createElement('div'); el.className='csh-modal';
  el.innerHTML=`<div class="csh-modal-card ${wide?'csh-modal-wide':''}" role="dialog" aria-modal="true"><header><div><h2>${title}</h2>${description?`<p>${description}</p>`:''}</div><button type="button" class="csh-close" aria-label="Close">×</button></header><div class="csh-modal-content">${content}</div></div>`;
  document.body.append(el); el.querySelector('.csh-close').onclick=()=>el.remove(); el.addEventListener('click',e=>{if(e.target===el)el.remove()}); return el;
}
function cshField(ctx,label,name,value='',opts={}){
  const type=opts.type||'text';
  const help=opts.help?`<small>${opts.help}</small>`:'';
  if(type==='select') return `<label class="csh-field">${label}${help}<select name="${name}" ${opts.id?`id="${opts.id}"`:''} ${opts.required?'required':''}>${(opts.options||[]).map(x=>typeof x==='string'?`<option value="${esc(ctx,x)}" ${String(value)===x?'selected':''}>${esc(ctx,x)}</option>`:`<option value="${esc(ctx,x.value)}" ${String(value)===String(x.value)?'selected':''}>${esc(ctx,x.label)}</option>`).join('')}</select></label>`;
  if(type==='textarea') return `<label class="csh-field">${label}${help}<textarea name="${name}" rows="${opts.rows||3}" ${opts.required?'required':''}>${esc(ctx,value)}</textarea></label>`;
  return `<label class="csh-field">${label}${help}<input name="${name}" ${opts.id?`id="${opts.id}"`:''} type="${type}" value="${esc(ctx,value)}" ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.step?`step="${opts.step}"`:''} ${opts.required?'required':''} ${opts.placeholder?`placeholder="${esc(ctx,opts.placeholder)}"`:''}></label>`;
}
function cshTable(head,rows,empty='No records yet.'){
  if(!rows.length)return cshEmpty(empty);
  return `<div class="csh-table-wrap"><table class="csh-table"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function periodRange(period){
  const today=new Date(), end=localYmd(today); let start=new Date(today);
  if(period==='day'){} else if(period==='week')start.setDate(start.getDate()-6);
  else if(period==='year')start=new Date(today.getFullYear(),0,1);
  else start=new Date(today.getFullYear(),today.getMonth(),1);
  return {startDate:localYmd(start),endDate:end};
}

function cshRelativeTime(value){
  const time=new Date(value||'').getTime();
  if(!Number.isFinite(time))return '—';
  const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));
  if(seconds<45)return 'Just now';
  if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;
  if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;
  if(seconds<604800)return `${Math.floor(seconds/86400)}d ago`;
  return fmtDate(value);
}
function cshActivityMarkup(ctx,rows){
  if(rows===undefined)return `<div class="csh-agent-empty">Activity appears here when your role has view access to Sales, Buying, Returns, Expenses or Stock.</div>`;
  if(rows===null)return `<div class="csh-agent-empty">Recent activity is temporarily unavailable.</div>`;
  if(!Array.isArray(rows)||!rows.length)return `<div class="csh-agent-empty">No recent events in the business sections available to your account.</div>`;
  const icons={sale:'receipt',purchase:'cart',return:'rotate-ccw',exchange:'refresh',purchase_return:'corner-up-left',expense:'wallet',stock:'package',style:'shirt'};
  const tones={sale:'emerald',purchase:'amber',return:'cyan',exchange:'violet',purchase_return:'amber',expense:'rose',stock:'sky',style:'plum'};
  return `<ol class="csh-feed-list" aria-label="Recent Clothing activity" aria-live="polite">${rows.slice(0,7).map((x,i)=>`<li class="csh-feed-row" style="--csh-item-order:${i}"><span class="csh-feed-icon csh-feed-${tones[x.kind]||'zinc'}">${cshIcon(ctx,icons[x.kind]||'activity')}</span><span class="csh-feed-copy"><b>${esc(ctx,x.title||'Shop activity')}</b><small>${esc(ctx,x.detail||'Clothing business update')} · ${esc(ctx,cshRelativeTime(x.timestamp))}</small></span>${x.amount!==null&&x.amount!==undefined&&Number.isFinite(Number(x.amount))?`<strong class="csh-feed-amount">${money(ctx,x.amount)}</strong>`:''}</li>`).join('')}</ol>`;
}
function cshKnowledgeRank(ctx,label,rows,key){
  const top=(rows||[]).slice(0,3);
  if(!top.length)return `<section class="csh-kb-group"><header><b>${label}</b></header><p class="csh-kb-quiet">No demand recorded today.</p></section>`;
  const max=Math.max(1,...top.map(x=>Number(x.quantity||0)));
  return `<section class="csh-kb-group"><header><b>${label}</b><span>${Number(top.reduce((n,x)=>n+Number(x.quantity||0),0)).toLocaleString()} units</span></header>${top.map((x,i)=>`<div class="csh-kb-row" style="--csh-item-order:${i}"><span>${esc(ctx,x[key]||'Unspecified')}</span><i><em style="width:${Math.max(3,Number(x.quantity||0)/max*100)}%"></em></i><b>${Number(x.quantity||0).toLocaleString()}</b></div>`).join('')}</section>`;
}
function cshKnowledgeMarkup(ctx,d){
  const canSales=ctx.canAccess('sales','view')||ctx.canAccess('report','view');
  const canInventory=ctx.canAccess('inventory','view')||ctx.canAccess('report','view');
  if(!canSales||!canInventory)return `<div class="csh-agent-empty">Size, color and style demand is hidden until your role can view both sales and inventory.</div>`;
  const best=(d.bestSellingProducts||[])[0];
  const sizes=d.bestSellingSizes||[],colors=d.bestSellingColors||[];
  return `<div class="csh-kb-spotlight"><span class="csh-agent-overline">TOP SELLING STYLE · TODAY</span>${best?`<div class="csh-kb-style"><b>${esc(ctx,best.name)}</b><span><code>${esc(ctx,best.style_code||'No style code')}</code><i>${Number(best.quantity||0).toLocaleString()} units</i></span></div>`:`<p class="csh-kb-quiet">Your first posted sale will add style demand signals here.</p>`}</div><div class="csh-kb-grid">${cshKnowledgeRank(ctx,'SIZE DEMAND',sizes,'size')}${cshKnowledgeRank(ctx,'COLOR DEMAND',colors,'color')}</div>`;
}
function cshMonitorMarkup(ctx,d){
  const canSales=ctx.canAccess('sales','view')||ctx.canAccess('report','view');
  const canInventory=ctx.canAccess('inventory','view')||ctx.canAccess('report','view');
  const metrics=[];
  if(canSales)metrics.push({label:'Sales revenue',value:money(ctx,d.salesRevenue),note:`${Number(d.salesCount||0).toLocaleString()} invoice${Number(d.salesCount||0)===1?'':'s'} today`,tone:'rose'});
  if(canSales&&canInventory)metrics.push({label:'Gross profit',value:money(ctx,d.grossProfit),note:'Estimated using variant costs',tone:'green'});
  if(canInventory)metrics.push({label:'Stock value',value:money(ctx,d.stockValue),note:`${Number(d.stockUnits||0).toLocaleString()} variant units on hand`,tone:'blue'});
  if(!metrics.length)return `<div class="csh-agent-empty">Sales and stock metrics are hidden by your role permissions.</div>`;
  const styles=canSales&&canInventory?(d.bestSellingProducts||[]).slice(0,5):[];
  const max=Math.max(1,...styles.map(x=>Number(x.quantity||0)));
  const chart=canSales&&canInventory?`<div class="csh-monitor-chart"><div class="csh-agent-subhead"><b>TOP STYLES · UNITS SOLD</b><span>${styles.length} style${styles.length===1?'':'s'}</span></div>${styles.length?`<div class="csh-monitor-bars">${styles.map((x,i)=>`<div class="csh-monitor-bar" style="--csh-bar:${Math.max(4,Number(x.quantity||0)/max*100)}%;--csh-item-order:${i}" title="${esc(ctx,x.name)} · ${Number(x.quantity||0)} units"><span class="csh-monitor-bar-fill"></span><small>${esc(ctx,String(x.style_code||x.name||'Style').slice(0,10))}</small></div>`).join('')}</div>`:`<div class="csh-kb-quiet">Style activity will appear after the first sale.</div>`}</div>`:'';
  return `<div class="csh-agent-metrics" style="--csh-metric-count:${metrics.length}">${metrics.map(x=>`<div class="csh-agent-metric csh-tone-${x.tone||'plum'}"><span>${x.label}</span><b>${x.value}</b><small>${x.note}</small></div>`).join('')}</div>${chart}`;
}


function cshPipelineMarkup(ctx,d){
  const stages=[];
  const add=(label,detail,page,mode,icon,metric,tone='rose')=>stages.push({label,detail,page,mode,icon,metric,tone});
  const inventory=ctx.canAccess('inventory','view');
  if(inventory){
    add('Style catalog','Products, sizes and color variants','clothing-products','VIEW','shirt',`${Number(d.productCount||0).toLocaleString()} styles`,'plum');
    add('Variant matrix','SKU-level size and color control','clothing-products','VIEW','package',`${Number(d.variantCount||0).toLocaleString()} variants`,'blue');
    add('Stock control','Reorder thresholds and transfers','clothing-stock','VIEW','package',`${Number(d.stockUnits||0).toLocaleString()} units · ${Number(d.lowStockCount||0)} low`,'amber');
  }
  const purchaseView=ctx.canAccess('purchase','view');
  if(purchaseView)add('Buying','Receive and return supplier stock',ctx.canAccess('purchase','add')&&inventory?'clothing-purchase':'purchases',ctx.canAccess('purchase','add')&&inventory?'ADD':'VIEW','truck',`${Number(d.purchaseCount||0).toLocaleString()} purchases · ${Number(d.purchaseReturnsCount||0).toLocaleString()} returns`,'amber');
  const salesView=ctx.canAccess('sales','view'),salesAdd=ctx.canAccess('sales','add')&&inventory;
  if(salesView||salesAdd)add('Checkout','Sell exact size/color variants',salesAdd?'clothing-pos':'sales',salesAdd?'ADD':'VIEW','receipt',salesView?`${Number(d.salesCount||0).toLocaleString()} invoices today`:'POS creation enabled','rose');
  if(ctx.canAccess('returns_refunds','view'))add('After-sales','Returns and exchanges','returns-refunds','VIEW','rotate-ccw',`${Number(d.salesReturnsCount||0)} returns · ${Number(d.exchangeCount||0)} exchanges`,'plum');
  if(ctx.canAccess('report','view'))add('Demand insights','Read size, color and style demand','report','VIEW','chart',`${(d.bestSellingSizes||[]).length} sizes · ${(d.bestSellingColors||[]).length} colors`,'green');
  if(!stages.length)return `<div class="csh-agent-empty">No workflow stages are available to this staff account.</div>`;
  return `<div class="csh-pipeline-map" role="list" aria-label="Clothing business workflow"><div class="csh-pipeline-rail" aria-hidden="true"><i></i></div><div class="csh-pipeline-stages">${stages.map((x,i)=>`<button type="button" class="csh-pipeline-stage" role="listitem" data-csh-go="${x.page}" style="--csh-item-order:${i}"><span class="csh-pipeline-node csh-node-${x.tone}">${cshIcon(ctx,x.icon)}</span><b>${esc(ctx,x.label)}</b><small>${esc(ctx,x.detail)}</small><strong>${esc(ctx,x.metric)}</strong><i class="csh-pipeline-mode">${esc(ctx,x.mode)}</i></button>`).join('')}</div></div>`;
}

function cshToolMarkup(ctx,d){
  const tools=[];
  const push=(label,detail,page,mode,icon,meta='',tone='rose')=>tools.push({label,detail,page,mode,icon,meta,tone});
  const salesAdd=ctx.canAccess('sales','add'),salesView=ctx.canAccess('sales','view'),salesPos=salesAdd&&ctx.canAccess('inventory','view');
  if(salesPos||salesView)push(salesPos?'Quick POS':'Sales history',salesPos?'Create a size/color sales invoice':'Review posted sales',salesPos?'clothing-pos':'sales',salesPos?'CREATE':'VIEW',salesPos?'qr':'receipt',salesView?`${Number(d.salesCount||0)} invoices today`:'POS creation enabled','rose');
  const purchaseAdd=ctx.canAccess('purchase','add'),purchaseView=ctx.canAccess('purchase','view'),purchaseReceive=purchaseAdd&&purchaseView&&ctx.canAccess('inventory','view');
  if(purchaseReceive||purchaseView)push(purchaseReceive?'Receive purchase':'Purchase history',purchaseReceive?'Receive variants and update exact stock':'Review posted purchases',purchaseReceive?'clothing-purchase':'purchases',purchaseReceive?'CREATE':'VIEW',purchaseReceive?'truck':'cart',purchaseView?`${Number(d.purchaseCount||0)} purchases today`:'Add permission','amber');
  if(ctx.canAccess('inventory','view')){
    push('Variant stock','Reconcile size and color quantities','clothing-stock','VIEW','package',`${Number(d.lowStockCount||0)} low stock`,'blue');
    push('Products & sizing','Manage styles, variants and size profiles','clothing-products','VIEW','shirt','Catalog','plum');
  }
  if(ctx.canAccess('returns_refunds','view'))push('Sales returns','Process returns and exchanges','returns-refunds','VIEW','rotate-ccw','After-sales','rose');
  if(purchaseView)push('Purchase returns','Return received variants','clothing-purchase-returns',purchaseAdd?'CREATE':'VIEW','corner-up-left','Buying','amber');
  if(ctx.canAccess('report','view'))push('Clothing reports','Review sales, stock and demand','report','VIEW','chart','Insights','green');
  if(!tools.length)return `<div class="csh-agent-empty">No Clothing workflows are available to this staff account.</div>`;
  return `<div class="csh-tool-grid">${tools.map((x,i)=>`<button type="button" class="csh-tool-tile" data-csh-go="${x.page}" style="--csh-item-order:${i}"><span class="csh-tool-icon csh-tone-${x.tone}">${cshIcon(ctx,x.icon)}</span><span class="csh-tool-copy"><b>${esc(ctx,x.label)}</b><small>${esc(ctx,x.detail)}</small></span><span class="csh-tool-meta"><i>${esc(ctx,x.mode)}</i><small>${esc(ctx,x.meta)}</small></span></button>`).join('')}</div>`;
}

export async function cshopDashboard(ctx){
  ctxFor(ctx);
  const {startDate,endDate}=periodRange('day');
  const actions=`${ctx.canAccess('sales','add')&&ctx.canAccess('inventory','view')?`<button class="csh-btn csh-btn-primary" data-csh-go="clothing-pos">${cshIcon(ctx,'qr')} Open POS</button>`:''}${ctx.canAccess('inventory','add')&&ctx.canAccess('inventory','view')?`<button class="csh-btn" data-csh-go="clothing-products">+ Add product</button>`:''}`;
  const activityAllowed=['sales','purchase','returns_refunds','expense','inventory'].some(section=>ctx.canAccess(section,'view'));
  const [d,activity]=await Promise.all([
    ctx.api(`clothing/overview?startDate=${startDate}&endDate=${endDate}`),
    activityAllowed?ctx.api('clothing/activity').catch(()=>null):Promise.resolve(undefined),
  ]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const auditAction=ctx.canAccess('settings','view')?`<button type="button" class="csh-text-btn" data-csh-go="audit-log">Open audit log →</button>`:'';
  $('#page').innerHTML=cshHeading('CLOTHING BUSINESS CONSOLE','Today at a glance','Variant-aware stock, sales and profit for '+esc(ctx,ctx.state.store?.name||'your shop')+'.',actions)+
    `<section class="csh-agent-grid" aria-label="Clothing business dashboard"><article class="csh-agent-card csh-agent-token" style="--csh-order:0"><header class="csh-agent-head"><div class="csh-agent-title"><span class="csh-agent-icon">${cshIcon(ctx,'chart')}</span><div><h2>Token Monitor</h2><p>Clothing commerce · today’s sales and stock</p></div></div><span class="csh-agent-status"><i></i>SHOP DATA</span></header>${cshMonitorMarkup(ctx,d)}</article><article class="csh-agent-card csh-agent-knowledge" style="--csh-order:1"><header class="csh-agent-head"><div class="csh-agent-title"><span class="csh-agent-icon">${cshIcon(ctx,'book-open')}</span><div><h2>Knowledge Base</h2><p>Size, color and style demand from posted invoices</p></div></div>${ctx.canAccess('report','view')?`<button type="button" class="csh-text-btn" data-csh-go="report">Reports →</button>`:''}</header>${cshKnowledgeMarkup(ctx,d)}</article><article class="csh-agent-card csh-agent-activity" style="--csh-order:2"><header class="csh-agent-head"><div class="csh-agent-title"><span class="csh-agent-icon">${cshIcon(ctx,'activity')}</span><div><h2>Activity Feed</h2><p>Recent sales, buying, returns and stock events</p></div></div>${auditAction}</header>${cshActivityMarkup(ctx,activity)}</article><article class="csh-agent-card csh-agent-tools" style="--csh-order:3"><header class="csh-agent-head"><div class="csh-agent-title"><span class="csh-agent-icon">${cshIcon(ctx,'scan-search')}</span><div><h2>Tool Inspector</h2><p>Clothing workflows available to your role</p></div></div></header>${cshToolMarkup(ctx,d)}</article><article class="csh-agent-card csh-agent-pipeline" style="--csh-order:4"><header class="csh-agent-head"><div class="csh-agent-title"><span class="csh-agent-icon">${cshIcon(ctx,'activity')}</span><div><h2>Agent Pipeline</h2><p>Clothing system flow · catalog → variants → stock → commerce → insights</p></div></div><span class="csh-agent-status">WORKFLOW MAP</span></header>${cshPipelineMarkup(ctx,d)}</article></section>`;
  bindGo(ctx);ctx.animateCshop?.();
}
function rankList(ctx,rows,key){
  if(!rows.length)return cshEmpty('No sales in this period.');
  const max=Math.max(1,...rows.map(x=>Number(x.quantity||0)));
  return `<div class="csh-rank-list">${rows.slice(0,6).map(x=>`<div class="csh-rank-row"><b>${esc(ctx,x[key]||'Unspecified')}</b><span><i style="width:${Math.max(4,Number(x.quantity||0)/max*100)}%"></i></span><strong>${Number(x.quantity||0)}</strong></div>`).join('')}</div>`;
}
function bindGo(ctx){ document.querySelectorAll('[data-csh-go]').forEach(b=>b.onclick=()=>ctx.navigate(b.dataset.cshGo)); }

export async function cshopProducts(ctx){
  ctxFor(ctx);
  const [products,suppliers,profiles]=await Promise.all([ctx.api('clothing/products'),ctx.api('supplier').catch(()=>[]),ctx.api('clothing/size-profiles').catch(()=>[])]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const refreshProducts=()=>{if(ctx.isCurrent&&!ctx.isCurrent())return;cshopProducts(ctx)};
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort();
  const actions=ctx.canAccess('inventory','add')?`<button class="csh-btn csh-btn-primary" id="cshAddProduct">+ Add clothing product</button>`:'';
  $('#page').innerHTML=cshHeading('CATALOG','Products & variants','Every item stays separated by size, color, SKU and barcode.',actions)+
    `<div class="csh-toolbar"><input id="cshProductSearch" class="csh-search" placeholder="Search product, style code, brand or variant barcode"><select id="cshProductCategory"><option value="">All categories</option>${categories.map(x=>`<option>${esc(ctx,x)}</option>`).join('')}</select><span class="csh-result-count">${products.length} products</span></div><div id="cshProductRows"></div>`;
  const render=(list)=>{
    $('#cshProductRows').innerHTML=list.length?`<div class="csh-product-grid">${list.map(p=>{
      const imgs=Array.isArray(p.images)?p.images:[];
      const totalStock=(p.variants||[]).reduce((n,v)=>n+Number(v.stock||0),0);
      const value=(p.variants||[]).reduce((n,v)=>n+Number(v.stock||0)*Number(v.cost_price||0),0);
      const colors=[...new Set((p.variants||[]).map(v=>v.color).filter(Boolean))];
      return `<article class="csh-product-card"><div class="csh-product-image">${imgs[0]?`<img src="${esc(ctx,imgs[0])}" alt="${esc(ctx,p.name)}" loading="lazy" onerror="this.remove()">`:`<span>${cshIcon(ctx,'shirt')}</span>`}<small>${esc(ctx,p.category||'Clothing')}</small></div><div class="csh-product-info"><div class="csh-product-title"><div><h3>${esc(ctx,p.name)}</h3><small>${esc(ctx,p.brand||'Unbranded')} · <code>${esc(ctx,p.style_code)}</code></small></div><span class="csh-status ${p.active?'on':'off'}">${p.active?'Active':'Inactive'}</span></div><div class="csh-product-meta"><span>${(p.variants||[]).length} variants</span><span>${totalStock} ${esc(ctx,p.unit||'pcs')}</span><span>Value ${money(ctx,value)}</span></div><div class="csh-swatches">${colors.slice(0,7).map(c=>`<i title="${esc(ctx,c)}" style="--csh-swatch:${colorCss(c)}"></i>`).join('')}${colors.length>7?`<small>+${colors.length-7}</small>`:''}</div><div class="csh-product-actions">${ctx.canAccess('inventory','edit')?`<button class="csh-btn csh-btn-soft" data-csh-edit-product="${p.id}">Edit product</button>`:''}<button class="csh-btn" data-csh-view-stock="${p.id}">Manage variants</button></div></div></article>`;
    }).join('')}</div>`:cshEmpty('No clothing products found. Add your first product and build its size/color matrix.');
    document.querySelectorAll('[data-csh-edit-product]').forEach(b=>b.onclick=()=>productModal(ctx,products.find(p=>p.id===b.dataset.cshEditProduct),suppliers,refreshProducts,profiles));
    document.querySelectorAll('[data-csh-view-stock]').forEach(b=>b.onclick=()=>{ctx.navigate('clothing-stock');setTimeout(()=>{const q=$('#cshVariantSearch');if(q){q.value=products.find(p=>p.id===b.dataset.cshViewStock)?.name||'';q.dispatchEvent(new Event('input'))}},0)});
  };
  render(products);
  if($('#cshAddProduct'))$('#cshAddProduct').onclick=()=>productModal(ctx,null,suppliers,refreshProducts,profiles);
  $('#cshProductSearch').oninput=filter;
  $('#cshProductCategory').onchange=filter;
  function filter(){const q=$('#cshProductSearch').value.toLowerCase(),cat=$('#cshProductCategory').value;render(products.filter(p=>(!cat||p.category===cat)&&(!q||JSON.stringify(p).toLowerCase().includes(q))))}
}
function colorCss(name){
  const map={black:'#202124',white:'#f7f5f2',red:'#e44c54',blue:'#4777d1',navy:'#1e3359',green:'#38876a',olive:'#768044',pink:'#e999b5',beige:'#c9b99d',brown:'#865f45',grey:'#8b9098',gray:'#8b9098',yellow:'#e2bc46',purple:'#8362b4',orange:'#e78648'};
  const k=String(name||'').toLowerCase(); return map[k]||'#a58b9f';
}
function productModal(ctx,product,suppliers,refresh,profiles=[]){
  const defaultProfile=profiles.find(x=>x.category===(product?.category||'T-shirts'))||profiles.find(x=>x.category===SIZE_CATEGORIES[0]);
  const variants=(product?.variants||[]).map(v=>({...v,sku:v.variant_sku||v.sku||'',skuAuto:false,size_label:v.size_label||'',color:v.color||'',cost_price:Number(v.cost_price??product.cost_price??0),sale_price:Number(v.sale_price??product.sale_price??0),reorder_threshold:Number(v.reorder_threshold??product.reorder_threshold??0),active:v.active!==false}));
  const e=cshModal(product?'Edit clothing product':'Add a clothing product',product?'Update style details and every saved size/color variant.':'Add the style once, choose units and prices, then automatically build the size/color stock matrix.',
    `<form id="cshProductForm" class="csh-form">
      <div class="csh-section-label"><div><b>1 · Product details</b><small>Enter the shared information for this clothing style.</small></div></div>
      <div class="csh-form-grid">
        ${cshField(ctx,'Product name','name',product?.name||'',{required:true,placeholder:'e.g. Cotton crew-neck T-shirt'})}
        ${cshField(ctx,'Style code','style_code',product?.style_code||'',{required:true,placeholder:'e.g. TS-204',help:'One unique code for this design. Variant SKUs are generated from it.'})}
        ${cshField(ctx,'Product category','category',product?.category||'T-shirts',{type:'select',required:true,id:'cshProductFormCategory',options:SIZE_CATEGORIES,help:'Used to suggest a saved size profile.'})}
        ${cshField(ctx,'Brand','brand',product?.brand||'',{placeholder:'Optional'})}
        <label class="csh-field">Supplier <small>Optional · link this style to its usual supplier.</small><select name="supplier_id"><option value="">No supplier linked</option>${suppliers.map(s=>`<option value="${esc(ctx,s.id)}" ${s.id===product?.supplier_id?'selected':''}>${esc(ctx,s.name)} · ${esc(ctx,s.supplier_code||'')}</option>`).join('')}</select></label>
        ${cshField(ctx,'Description','description',product?.description||'',{type:'textarea',rows:2,help:'Optional fabric, fit, care or product details.'})}
        <label class="csh-field csh-span-2">Product images <small>Optional · add up to 10 HTTPS image links, separated by commas.</small><input name="images" value="${esc(ctx,(product?.images||[]).join(', '))}" placeholder="https://example.com/product.jpg"></label>
      </div>

      <div class="csh-section-label"><div><b>2 · Units, prices & restock</b><small>Stock is always counted in the stock unit; purchase quantities can be converted automatically.</small></div></div>
      <div class="csh-form-grid">
        ${cshField(ctx,'Stock unit','unit',product?.unit||'pcs',{type:'select',required:true,id:'cshStockUnit',options:STOCK_UNITS,help:'The unit shown in on-hand stock and used for sales.'})}
        ${cshField(ctx,'Purchase unit','purchase_unit',product?.purchase_unit||product?.unit||'pcs',{type:'select',required:true,id:'cshPurchaseUnit',options:STOCK_UNITS,help:'The package unit you usually buy from the supplier.'})}
        ${cshField(ctx,'Stock units in 1 purchase unit','purchase_to_stock',product?.purchase_to_stock??1,{type:'number',min:'0.0001',step:'0.0001',required:true,help:'Example: 1 dozen = 12 pcs. Common pair, dozen and fabric conversions are suggested for you.'})}
        ${cshField(ctx,'Default cost per stock unit','cost_price',product?.cost_price??0,{type:'number',min:'0',step:'0.01',required:true,help:'Used as the starting cost for new variants.'})}
        ${cshField(ctx,'Default selling price per stock unit','sale_price',product?.sale_price??0,{type:'number',min:'0',step:'0.01',required:true,help:'Used as the starting selling price for new variants.'})}
        ${cshField(ctx,'Low-stock alert per variant','reorder_threshold',product?.reorder_threshold??0,{type:'number',min:'0',step:'0.001',required:true,help:'Each size/color variant inherits this threshold; you can adjust it below.'})}
      </div>
      <p class="csh-hint" id="cshConversionPreview"></p>

      <div class="csh-section-label"><div><b>3 · Generate size/color variants</b><small>Each generated combination gets its own stock record and automatic SKU.</small></div><span class="csh-variant-count" id="cshVariantCount">${variants.length} variants</span></div>
      <div class="csh-matrix-builder">
        <label class="csh-field">Sizes <small>Comma-separated · the category size profile fills this automatically.</small><input id="cshSizeList" value="${esc(ctx,variants.map(v=>v.size_label).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ')||(defaultProfile?.sizes?.length?defaultProfile.sizes:DEFAULT_ALPHA).join(', '))}" placeholder="XS, S, M, L, XL"></label>
        <label class="csh-field">Colors <small>Comma-separated · leave blank for a single-color style.</small><input id="cshColorList" value="${esc(ctx,variants.map(v=>v.color).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', '))}" placeholder="Black, White, Navy"></label>
        <label class="csh-field">Sizing system<select id="cshSizeSystem">${SIZE_SYSTEMS.map(x=>`<option value="${x}" ${(product?.size_system||defaultProfile?.size_system||'alpha')===x?'selected':''}>${x.replaceAll('-',' ')}</option>`).join('')}</select></label>
        <button type="button" id="cshBuildMatrix" class="csh-btn csh-btn-soft">Generate variants</button>
      </div>
      <p class="csh-hint" id="cshMatrixPreview">Choose sizes and colors; the console will create one row for every combination.</p>

      <div class="csh-measure-box"><div><b>Optional garment measurement guide</b><small>Record a reference chart in one unit. Measurements are saved with the product.</small></div><div class="csh-measure-grid"><label>Measurement unit<select name="measurement_unit"><option value="cm" ${product?.measurements?.unit!=='in'?'selected':''}>cm</option><option value="in" ${product?.measurements?.unit==='in'?'selected':''}>inches</option></select></label>${['chest','bust','waist','hip','shoulder','sleeve','length'].map(k=>`<label>${k}<input name="measure_${k}" type="number" min="0" step="0.1" value="${esc(ctx,product?.measurements?.[k]??'')}"></label>`).join('')}</div></div>
      <div class="csh-variant-table-wrap" id="cshVariantRows"></div>
      <div class="csh-form-foot"><span>Starting stock is optional and recorded separately for each new size/color. You can also receive stock later through Clothing Purchases.</span><button class="csh-btn csh-btn-primary" type="submit">${product?'Save product & variants':'Create product & variants'}</button></div>
    </form>`,true);
  let rows=variants;
  const form=e.querySelector('#cshProductForm'),styleInput=form.elements.namedItem('style_code');
  const skuToken=value=>String(value||'').trim().replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toUpperCase().slice(0,24)||'ONE';
  const autoSku=(size,color)=>{const style=String(styleInput.value||'').trim().toUpperCase();return style?`${style}-${skuToken(size)}-${skuToken(color)}`.slice(0,80):''};
  const conversionFor=(purchase,stock)=>{
    if(purchase===stock)return 1;
    const known={ 'dozen:pcs':12, 'pair:pcs':2, 'yard:meter':0.9144, 'meter:yard':1.0936 };
    return known[`${purchase}:${stock}`]||1;
  };
  const conversionInput=form.elements.namedItem('purchase_to_stock'),preview=e.querySelector('#cshConversionPreview');
  const updateConversionPreview=()=>{
    const n=Number(conversionInput.value||0),purchase=e.querySelector('#cshPurchaseUnit').value,stock=e.querySelector('#cshStockUnit').value;
    preview.textContent=n>0?`1 ${purchase} is counted as ${n.toLocaleString(undefined,{maximumFractionDigits:4})} ${stock} in stock. Adjust the multiplier if your supplier package is different.`:'Enter a positive conversion amount.';
  };
  const suggestConversion=()=>{conversionInput.value=conversionFor(e.querySelector('#cshPurchaseUnit').value,e.querySelector('#cshStockUnit').value);updateConversionPreview()};
  e.querySelector('#cshPurchaseUnit').onchange=suggestConversion;e.querySelector('#cshStockUnit').onchange=suggestConversion;
  conversionInput.oninput=updateConversionPreview;updateConversionPreview();
  const variantInputs=()=>[...e.querySelectorAll('[data-vfield]')];
  const hasCombo=(size,color)=>rows.some(v=>String(v.size_label||'').trim().toLowerCase()===String(size||'').trim().toLowerCase()&&String(v.color||'').trim().toLowerCase()===String(color||'').trim().toLowerCase());
  const getCombos=()=>{
    const sizes=[...new Set(e.querySelector('#cshSizeList').value.split(',').map(x=>x.trim()).filter(Boolean))];
    const colors=[...new Set(e.querySelector('#cshColorList').value.split(',').map(x=>x.trim()).filter(Boolean))];
    const combos=[];
    if(sizes.length&&colors.length)for(const color of colors)for(const size of sizes)combos.push({size_label:size,color});
    else if(sizes.length)for(const size of sizes)combos.push({size_label:size,color:''});
    else if(colors.length)for(const color of colors)combos.push({size_label:'',color});
    else combos.push({size_label:'',color:''});
    return combos;
  };
  const updateMatrixPreview=()=>{
    const combos=getCombos(),newCount=combos.filter(x=>!hasCombo(x.size_label,x.color)).length;
    const sizes=[...new Set(e.querySelector('#cshSizeList').value.split(',').map(x=>x.trim()).filter(Boolean))],colors=[...new Set(e.querySelector('#cshColorList').value.split(',').map(x=>x.trim()).filter(Boolean))];
    const factor=sizes.length&&colors.length?`${sizes.length} sizes × ${colors.length} colors`:sizes.length?`${sizes.length} sizes`:colors.length?`${colors.length} colors`:'One size/color option';
    e.querySelector('#cshMatrixPreview').textContent=`${factor} · ${newCount} new variant${newCount===1?'':'s'} will be added. SKUs are generated from the style code, size and color.`;
  };
  const renderRows=()=>{
    for(const v of rows)if(!v.id&&v.skuAuto)v.sku=autoSku(v.size_label,v.color);
    e.querySelector('#cshVariantCount').textContent=`${rows.length} variant${rows.length===1?'':'s'}`;
    const target=e.querySelector('#cshVariantRows');
    if(!rows.length){target.innerHTML=cshEmpty('No variants yet. Choose sizes and colors, then generate the matrix.');updateMatrixPreview();return}
    target.innerHTML=`<div class="csh-table-wrap"><table class="csh-table csh-matrix"><thead><tr><th>Size</th><th>Color</th><th>Variant SKU · auto</th><th>Barcode (optional)</th><th>Cost / unit</th><th>Sell / unit</th><th>Reorder at</th><th>Starting stock</th><th>Active</th><th></th></tr></thead><tbody>${rows.map((v,i)=>`<tr><td><input data-vfield="size_label" data-vi="${i}" value="${esc(ctx,v.size_label)}" placeholder="One size"></td><td><input data-vfield="color" data-vi="${i}" value="${esc(ctx,v.color)}" placeholder="Color"></td><td><input data-vfield="sku" data-vi="${i}" value="${esc(ctx,v.sku)}" placeholder="Enter the style code first"></td><td><input data-vfield="barcode" data-vi="${i}" value="${esc(ctx,v.barcode||'')}" placeholder="Optional"></td><td><input data-vfield="cost_price" data-vi="${i}" type="number" min="0" step="0.01" value="${esc(ctx,v.cost_price)}"></td><td><input data-vfield="sale_price" data-vi="${i}" type="number" min="0" step="0.01" value="${esc(ctx,v.sale_price)}"></td><td><input data-vfield="reorder_threshold" data-vi="${i}" type="number" min="0" step="0.001" value="${esc(ctx,v.reorder_threshold)}"></td><td>${v.id?`${Number(v.stock||0)} ${esc(ctx,product?.unit||'pcs')}`:`<input data-vfield="opening_quantity" data-vi="${i}" type="number" min="0" step="0.001" value="${Number(v.opening_quantity||0)}" title="Optional starting stock for this variant">`}</td><td><input data-vfield="active" data-vi="${i}" type="checkbox" ${v.active?'checked':''}></td><td>${v.id?'<span class="csh-lock" title="Saved variant; deactivate it to retain its history">Saved</span>':`<button type="button" class="csh-mini-danger" data-csh-remove-row="${i}" aria-label="Remove variant">×</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    target.querySelectorAll('[data-vfield]').forEach(input=>input.onchange=()=>{
      const v=rows[Number(input.dataset.vi)],key=input.dataset.vfield;
      v[key]=input.type==='checkbox'?input.checked:input.value;
      if(key==='sku')v.skuAuto=!String(v.sku||'').trim();
      if(v.skuAuto&&(key==='size_label'||key==='color')){
        v.sku=autoSku(v.size_label,v.color);
        const skuInput=target.querySelector(`[data-vfield="sku"][data-vi="${input.dataset.vi}"]`);if(skuInput)skuInput.value=v.sku;
      }
      if(key==='size_label'||key==='color')updateMatrixPreview();
    });
    target.querySelectorAll('[data-csh-remove-row]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.cshRemoveRow),1);renderRows()});
    updateMatrixPreview();
  };
  renderRows();
  e.querySelector('#cshProductFormCategory').onchange=()=>{
    if(rows.length)return;
    const profile=profiles.find(x=>x.category===e.querySelector('#cshProductFormCategory').value);
    e.querySelector('#cshSizeList').value=(profile?.sizes?.length?profile.sizes:DEFAULT_ALPHA).join(', ');
    e.querySelector('#cshSizeSystem').value=profile?.size_system||'alpha';updateMatrixPreview();
  };
  styleInput.oninput=()=>{
    rows.forEach((v,i)=>{if(!v.id&&v.skuAuto){v.sku=autoSku(v.size_label,v.color);const input=e.querySelector(`[data-vfield="sku"][data-vi="${i}"]`);if(input)input.value=v.sku}});
  };
  ['cshSizeList','cshColorList'].forEach(id=>e.querySelector('#'+id).oninput=updateMatrixPreview);
  e.querySelector('#cshBuildMatrix').onclick=()=>{
    const combos=getCombos(),fd=new FormData(form),cost=Number(fd.get('cost_price')||0),sell=Number(fd.get('sale_price')||0),reorder=Number(fd.get('reorder_threshold')||0),system=e.querySelector('#cshSizeSystem').value;
    for(const combo of combos)if(!hasCombo(combo.size_label,combo.color))rows.push({...combo,size_system:system,sku:styleInput.value?autoSku(combo.size_label,combo.color):'',skuAuto:true,barcode:'',cost_price:cost,sale_price:sell,reorder_threshold:reorder,opening_quantity:0,active:true});
    renderRows();
  };
  form.onsubmit=async ev=>{
    ev.preventDefault();
    const submit=ev.submitter;
    try{
      const fd=new FormData(form),measurements={unit:fd.get('measurement_unit')||'cm'};
      for(const k of ['chest','bust','waist','hip','shoulder','sleeve','length']){const v=fd.get('measure_'+k);if(v!==''&&v!=null)measurements[k]=Number(v)}
      const productPayload={name:String(fd.get('name')||'').trim(),style_code:String(fd.get('style_code')||'').trim(),category:String(fd.get('category')||'').trim(),brand:String(fd.get('brand')||'').trim()||null,supplier_id:String(fd.get('supplier_id')||'')||null,unit:fd.get('unit'),purchase_unit:fd.get('purchase_unit'),purchase_to_stock:Number(fd.get('purchase_to_stock')||1),cost_price:Number(fd.get('cost_price')||0),sale_price:Number(fd.get('sale_price')||0),reorder_threshold:Number(fd.get('reorder_threshold')||0),description:String(fd.get('description')||'').trim()||null,images:String(fd.get('images')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,10),measurements,active:true};
      if(!productPayload.name||!productPayload.style_code)return ctx.toast('Enter a product name and unique style code first.');
      if(!rows.length)return ctx.toast('Generate at least one size/color variant before saving.');
      const payload={...productPayload,variants:rows.map(v=>({id:v.id||undefined,size_label:String(v.size_label||'').trim()||null,size_system:v.size_system||e.querySelector('#cshSizeSystem').value,color:String(v.color||'').trim()||null,sku:String(v.sku||'').trim()||autoSku(v.size_label,v.color),barcode:String(v.barcode||'').trim()||null,cost_price:Number(v.cost_price??productPayload.cost_price),sale_price:Number(v.sale_price??productPayload.sale_price),reorder_threshold:Number(v.reorder_threshold??productPayload.reorder_threshold),opening_quantity:v.id?undefined:Number(v.opening_quantity||0),active:v.active!==false}))};
      if(submit)submit.disabled=true;
      await ctx.api(product?'clothing/products/'+product.id:'clothing/products',{method:product?'PATCH':'POST',body:JSON.stringify(payload)});
      e.remove();ctx.toast(product?'Product and variants updated.':'Product and variants created.');refresh();
    }catch(err){if(submit)submit.disabled=false;ctx.toast(err.message)}
  };
}

export async function cshopVariants(ctx){
  ctxFor(ctx);
  const [variants,shops]=await Promise.all([ctx.api('clothing/variants'),ctx.api('clothing/stores').catch(()=>[])]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const total=variants.reduce((n,v)=>n+stockOf(v),0),low=variants.filter(v=>stockOf(v)<=Number(v.reorder_threshold||0)).length;
  $('#page').innerHTML=cshHeading('INVENTORY','Variant stock control','Search a style or exact SKU, then expand a style to inspect every size/color variant.',(ctx.canAccess('purchase','add')&&ctx.canAccess('purchase','view')&&ctx.canAccess('inventory','view'))?`<button class="csh-btn csh-btn-primary" data-csh-go="clothing-purchase">Receive purchase</button>`:'')+
    `<div class="csh-kpis csh-kpis-compact"><div class="csh-stat csh-tone-plum"><small>Active variants</small><b>${variants.filter(v=>v.active).length}</b></div><div class="csh-stat csh-tone-blue"><small>Units on hand</small><b>${total.toLocaleString()}</b></div><div class="csh-stat csh-tone-amber"><small>Low stock</small><b class="${low?'csh-warn':''}">${low}</b></div><div class="csh-stat csh-tone-green"><small>Barcode lookup</small><b>Ready</b></div></div><div class="csh-toolbar"><input id="cshVariantSearch" class="csh-search" placeholder="Search product, SKU, barcode, size or color"><select id="cshVariantCategory"><option value="">All categories</option>${[...new Set(variants.map(v=>v.product?.category).filter(Boolean))].sort().map(x=>`<option>${esc(ctx,x)}</option>`).join('')}</select><label class="csh-check-filter"><input id="cshLowOnly" type="checkbox"> Low stock only</label><span class="csh-result-count" id="cshVariantCount">${variants.length} variants</span></div><div id="cshVariantTable"></div>`;
  const expandedGroups=new Set();
  const productKey=v=>String(v.product_id||v.product?.id||`variant:${v.id}`);
  const byProductCount=new Map();for(const v of variants){const k=productKey(v);byProductCount.set(k,(byProductCount.get(k)||0)+1)}
  const variantRow=(v,child=false)=>`<tr class="${child?'csh-variant-child':''}"><td><b>${esc(ctx,variantName(v))}</b><small class="csh-subcell">${esc(ctx,v.product?.category||'')} · ${esc(ctx,v.product?.brand||'')}</small></td><td><code>${esc(ctx,skuOf(v))}</code><small class="csh-subcell">${esc(ctx,v.barcode||'No barcode')}</small></td><td><strong class="csh-stock-value ${stockOf(v)<=Number(v.reorder_threshold||0)?'csh-stock-low':''}">${stockOf(v)} ${esc(ctx,v.unit||'pcs')}</strong></td><td>${money(ctx,v.cost_price)}<small class="csh-subcell">Sell ${money(ctx,v.sale_price)}</small></td><td>${Number(v.reorder_threshold||0)}</td><td><div class="csh-row-actions">${ctx.canAccess('inventory','edit')?`<button data-vprice="${esc(ctx,v.id)}">Price</button><button data-vstock="${esc(ctx,v.id)}">Stock</button>${ctx.state.adminAccess?`<button data-vtransfer="${esc(ctx,v.id)}">Transfer</button>`:''}`:''}<button data-vhistory="${esc(ctx,v.id)}">History</button></div></td></tr>`;
  function render(){
    const q=$('#cshVariantSearch').value.toLowerCase(),cat=$('#cshVariantCategory').value,lowOnly=$('#cshLowOnly').checked;
    const list=variants.filter(v=>(!cat||v.product?.category===cat)&&(!lowOnly||stockOf(v)<=Number(v.reorder_threshold||0))&&(!q||[v.product?.name,v.product?.style_code,v.variant_sku,v.barcode,v.size_label,v.color,v.item_code].join(' ').toLowerCase().includes(q)));
    $('#cshVariantCount').textContent=`${list.length} variant${list.length===1?'':'s'}`;
    const groups=new Map();for(const v of list){const k=productKey(v),arr=groups.get(k)||[];arr.push(v);groups.set(k,arr)}
    const rows=[];
    for(const [key,group] of groups){
      const p=group[0].product||{},allCount=byProductCount.get(key)||group.length;
      if(allCount>1){
        const open=expandedGroups.has(key),units=group.reduce((n,v)=>n+stockOf(v),0),lowCount=group.filter(v=>stockOf(v)<=Number(v.reorder_threshold||0)).length;
        rows.push(`<tr class="csh-variant-group-row"><td colspan="6"><button type="button" class="csh-variant-group-toggle" data-vexpand="${esc(ctx,key)}" aria-expanded="${open}" aria-label="${open?'Collapse':'Expand'} ${esc(ctx,p.name||'product')} variants"><span class="csh-variant-chevron" aria-hidden="true">›</span><span class="csh-variant-group-copy"><b>${esc(ctx,p.name||'Clothing style')}</b><small><code>${esc(ctx,p.style_code||'No style code')}</code> · ${esc(ctx,p.category||'Clothing')} · ${group.length===allCount?`${allCount} size/color variants`:`${group.length} matching of ${allCount} variants`}</small></span><span class="csh-variant-group-meta"><b>${units.toLocaleString()} ${esc(ctx,group[0].unit||'pcs')}</b><small>${lowCount?`${lowCount} low stock`:'Stock healthy'}</small></span></button></td></tr>`);
        if(open)for(const v of group)rows.push(variantRow(v,true));
      }else rows.push(variantRow(group[0]));
    }
    $('#cshVariantTable').innerHTML=cshTable(['Product / variant','SKU · Barcode','Stock','Cost / sell','Reorder','Actions'],rows,'No variants match your search.');
    document.querySelectorAll('[data-vexpand]').forEach(b=>b.onclick=()=>{const key=b.dataset.vexpand;if(expandedGroups.has(key))expandedGroups.delete(key);else expandedGroups.add(key);render()});
    document.querySelectorAll('[data-vprice]').forEach(b=>b.onclick=()=>variantModal(ctx,variants.find(v=>v.id===b.dataset.vprice),refresh));
    document.querySelectorAll('[data-vstock]').forEach(b=>b.onclick=()=>stockModal(ctx,variants.find(v=>v.id===b.dataset.vstock),refresh));
    document.querySelectorAll('[data-vtransfer]').forEach(b=>b.onclick=()=>stockModal(ctx,variants.find(v=>v.id===b.dataset.vtransfer),refresh,shops));
    document.querySelectorAll('[data-vhistory]').forEach(b=>b.onclick=()=>stockHistory(ctx,variants.find(v=>v.id===b.dataset.vhistory)));
  }
  function refresh(){if(ctx.isCurrent&&!ctx.isCurrent())return;cshopVariants(ctx)}
  $('#cshVariantSearch').oninput=render;$('#cshVariantCategory').onchange=render;$('#cshLowOnly').onchange=render;render();bindGo(ctx);
}
function variantModal(ctx,v,refresh){
  if(!v)return;
  const e=cshModal('Edit variant pricing & identifiers',`${variantName(v)} · ${v.product?.style_code||''}`,
    `<form id="cshVariantForm" class="csh-form"><div class="csh-form-grid">${cshField(ctx,'Variant SKU','variant_sku',skuOf(v),{required:true})}${cshField(ctx,'Barcode','barcode',v.barcode||'')}${cshField(ctx,'Cost price / stock unit','cost_price',v.cost_price,{type:'number',min:'0',step:'0.01',required:true})}${cshField(ctx,'Selling price / stock unit','sale_price',v.sale_price,{type:'number',min:'0',step:'0.01',required:true})}${cshField(ctx,'Reorder threshold','reorder_threshold',v.reorder_threshold,{type:'number',min:'0',step:'0.001',required:true})}<label class="csh-field">Status<select name="active"><option value="true" ${v.active?'selected':''}>Active</option><option value="false" ${!v.active?'selected':''}>Inactive</option></select></label></div><div class="csh-form-foot"><span>Prices sync to EMS invoice inventory; on-hand stock is unchanged.</span><button class="csh-btn csh-btn-primary">Save variant</button></div></form>`,false);
  e.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target);try{await ctx.api('clothing/variants/'+v.id,{method:'PATCH',body:JSON.stringify({variant_sku:fd.get('variant_sku'),barcode:fd.get('barcode')||null,cost_price:Number(fd.get('cost_price')),sale_price:Number(fd.get('sale_price')),reorder_threshold:Number(fd.get('reorder_threshold')),active:fd.get('active')==='true'})});e.remove();ctx.toast('Variant updated.');refresh()}catch(err){ctx.toast(err.message)}};
}
function stockModal(ctx,v,refresh,shops=[]){
  if(!v)return;
  const e=cshModal('Update variant stock',`${variantName(v)} · ${skuOf(v)} · Current ${stockOf(v)} ${v.unit||'pcs'}`,
    `<form id="cshStockForm" class="csh-form"><label class="csh-field">Movement<select name="action" id="cshStockAction"><option value="adjustment">Manual adjustment (+ / −)</option><option value="damaged">Remove damaged / defective stock</option><option value="reconciliation">Physical stock reconciliation</option><option value="transfer">Inter-store transfer</option></select></label><div id="cshStockInputs"></div><div class="csh-form-foot"><span>EMS blocks negative stock; every posted change is audited.</span><button class="csh-btn csh-btn-primary">Save stock movement</button></div></form>`,false);
  const select=e.querySelector('#cshStockAction'),box=e.querySelector('#cshStockInputs');
  const draw=()=>{
    const a=select.value;
    if(a==='transfer'){
      box.innerHTML=`<div class="csh-form-grid"><label class="csh-field">Target Clothing shop<select name="target_store_id" required><option value="">Choose shop</option>${shops.filter(x=>x.id!==ctx.state.store.id).map(s=>`<option value="${s.id}">${esc(ctx,s.name)} · ${esc(ctx,s.shop_code)}</option>`).join('')}</select></label>${cshField(ctx,`Quantity (${v.unit||'pcs'})`,'quantity','1',{type:'number',min:'0.001',step:'0.001',required:true})}</div><p class="csh-hint">The target shop must have a matching style, size and color variant.</p>${cshField(ctx,'Transfer note','notes','')}</div>`;
    }else if(a==='reconciliation')box.innerHTML=`<div class="csh-form-grid">${cshField(ctx,'Counted physical quantity', 'counted_quantity',stockOf(v),{type:'number',min:'0',step:'0.001',required:true})}${cshField(ctx,'Reason / note','notes','Physical stock count')}</div>`;
    else box.innerHTML=`<div class="csh-form-grid">${cshField(ctx,a==='damaged'?`Damaged quantity (${v.unit||'pcs'})`:`Adjustment quantity (${v.unit||'pcs'})`,'quantity','1',{type:'number',min:'0.001',step:'0.001',required:true})}${a==='adjustment'?cshField(ctx,'Direction','direction','increase',{type:'select',options:[{value:'increase',label:'Add to stock'},{value:'decrease',label:'Remove from stock'}]}):''}${cshField(ctx,'Reason / note','notes',a==='damaged'?'Damaged / defective stock':'')}</div>`;
  };
  select.onchange=draw;draw();
  e.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();const fd=new FormData(ev.target),action=fd.get('action');
    try{
      if(action==='transfer')await ctx.api('clothing/stock-transfer',{method:'POST',body:JSON.stringify({variantId:v.id,targetStoreId:fd.get('target_store_id'),quantity:Number(fd.get('quantity')),notes:fd.get('notes')||''})});
      else await ctx.api('clothing/stock-adjustment',{method:'POST',body:JSON.stringify({variantId:v.id,action,quantity:Number(fd.get('quantity')||0),direction:fd.get('direction'),countedQuantity:Number(fd.get('counted_quantity')||0),notes:fd.get('notes')||''})});
      e.remove();ctx.toast('Stock movement saved.');refresh();
    }catch(err){ctx.toast(err.message)}
  };
}
async function stockHistory(ctx,v){
  try{
    const rows=await ctx.api('clothing/stock-history?variantId='+encodeURIComponent(v.id));
    const inner=cshTable(['Date','Movement','Quantity','Stock before → after','Note'],rows.map(x=>`<tr><td>${fmtDate(x.created_at)}</td><td><span class="csh-movement-tag">${esc(ctx,String(x.movement_type||'').replaceAll('_',' '))}</span></td><td>${Number(x.quantity||0)} ${esc(ctx,v.unit||'pcs')}</td><td>${x.stock_before??'—'} → ${x.stock_after??'—'}</td><td>${esc(ctx,x.notes||x.condition||'—')}</td></tr>`),'No movement history found for this variant.');
    cshModal('Stock history',`${variantName(v)} · ${skuOf(v)}`,inner,true);
  }catch(err){ctx.toast(err.message)}
}

export async function cshopPOS(ctx,kind='sale'){
  ctxFor(ctx);
  const isPurchase=kind==='purchase',permission=isPurchase?'purchase':'sales';
  if(!ctx.canAccess(permission,'add')){ctx.toast('Permission denied.');ctx.navigate(isPurchase?'purchases':'sales');return}
  const [variants,parties,number]=await Promise.all([
    ctx.api('clothing/variants?active=true'),ctx.api('invoice-parties?kind='+kind),ctx.api('invoice-number?kind='+kind)
  ]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const rows=variants.filter(v=>v.active!==false);
  const cart=new Map();
  const partyLabel=isPurchase?'Supplier':'Customer';
  const actions=`<button class="csh-btn" data-csh-go="${isPurchase?'purchases':'sales'}">← ${isPurchase?'Purchases':'Sales'} history</button>`;
  $('#page').innerHTML=cshHeading(isPurchase?'PURCHASE RECEIVING':'CLOTHING POS',isPurchase?'Receive purchase':'Fast clothing POS',isPurchase?'Receive exact size/color variants from a supplier. Purchase-unit quantities convert to the stock unit.':'Search or scan SKU/barcode, select exact size and color, then bill in seconds.',actions)+
    `<div class="csh-pos-layout"><section class="csh-pos-catalog"><div class="csh-pos-search"><input id="cshPosSearch" class="csh-search" placeholder="Search product, SKU, barcode, size, color"><input id="cshBarcodeScan" class="csh-search csh-scan" placeholder="Scan barcode / SKU and press Enter" autocomplete="off"></div><div class="csh-category-chips" id="cshPosCats"></div><div class="csh-pos-products" id="cshPosProducts"></div></section><aside class="csh-cart"><header><div><span class="csh-eyebrow">${isPurchase?'PURCHASE':'CHECKOUT'}</span><h2>${isPurchase?'Receive items':'Current sale'}</h2></div><b class="csh-invoice-id">${esc(ctx,number.invoiceNumber)}</b></header><div id="cshCartRows"></div><div class="csh-cart-controls"><label class="csh-field">${partyLabel}<select id="cshParty"><option value="">${isPurchase?'Walk-in / custom supplier':'Walk-in customer'}</option>${parties.map(p=>`<option value="${p.id}">${esc(ctx,p.name)} · ${esc(ctx,p[isPurchase?'supplier_code':'customer_code']||'')}</option>`).join('')}</select></label><div class="csh-form-grid"><label class="csh-field">${isPurchase?'Bill date':'Sale date'}<input id="cshDate" type="date" value="${localYmd()}" required></label><label class="csh-field">Payment method<select id="cshPayMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="other">Other</option></select></label></div><div class="csh-form-grid"><label class="csh-field">Tax %<input id="cshTax" type="number" min="0" step="0.001" value="0"></label><label class="csh-field">Invoice discount<input id="cshDiscount" type="number" min="0" step="0.01" value="0"></label></div><div class="csh-form-grid"><label class="csh-field">Paid now<input id="cshPaid" type="number" min="0" step="0.01" value="0"></label><label class="csh-field">Transaction ID<input id="cshTrx" placeholder="Optional"></label></div><label class="csh-field">Notes<input id="cshNotes" placeholder="Optional invoice note"></label><div class="csh-total-box"><span>Subtotal <b id="cshSubtotal">৳ 0.00</b></span><span>Tax <b id="cshTaxAmount">৳ 0.00</b></span><span>Discount <b id="cshDiscountAmount">৳ 0.00</b></span><span class="csh-total">Total <b id="cshTotal">৳ 0.00</b></span><span class="csh-due">Due after payment <b id="cshDue">৳ 0.00</b></span></div><button type="button" id="cshPostInvoice" class="csh-btn csh-btn-primary csh-post-btn">${isPurchase?'Post purchase':'Complete sale'}</button><small class="csh-cart-note">Stock moves on the exact size/color SKU. Partial payments and outstanding dues use EMS billing.</small></div></aside></div>`;
  const categories=[...new Set(rows.map(v=>v.product?.category).filter(Boolean))].sort();let selectedCat='';
  $('#cshPosCats').innerHTML=`<button type="button" class="csh-cat-chip on" data-pos-cat="">All</button>${categories.map(c=>`<button type="button" class="csh-cat-chip" data-pos-cat="${esc(ctx,c)}">${esc(ctx,c)}</button>`).join('')}`;
  document.querySelectorAll('[data-pos-cat]').forEach(b=>b.onclick=()=>{selectedCat=b.dataset.posCat;document.querySelectorAll('[data-pos-cat]').forEach(x=>x.classList.toggle('on',x===b));drawProducts()});
  function add(v){
    const id=v.inventory_item_id||v.item?.id||v.item_id;
    if(!id)return ctx.toast('This variant has no linked inventory record.');
    const key=v.id; let ln=cart.get(key);
    if(!ln){
      const conversion=isPurchase?Number(v.product?.purchase_to_stock||1):1;
      const unitPrice=isPurchase?Number(v.cost_price||v.product?.cost_price||0)*conversion:Number(v.sale_price||0);
      ln={key,v,quantity:1,unitPrice,conversion,entryUnit:isPurchase?(v.product?.purchase_unit||v.unit||'pcs'):(v.unit||'pcs')};cart.set(key,ln);
    }else ln.quantity++;
    drawCart();
  }
  function drawProducts(){
    const q=$('#cshPosSearch').value.toLowerCase();
    const list=rows.filter(v=>(!selectedCat||v.product?.category===selectedCat)&&(!q||[v.product?.name,v.product?.style_code,v.variant_sku,v.barcode,v.size_label,v.color].join(' ').toLowerCase().includes(q)));
    const groups=new Map();for(const v of list){const id=v.product_id;(groups.get(id)||groups.set(id,[]).get(id)).push(v)}
    $('#cshPosProducts').innerHTML=[...groups.values()].map(group=>{const p=group[0].product||{};return `<article class="csh-pos-product"><header><div><span>${esc(ctx,p.category||'Clothing')}</span><h3>${esc(ctx,p.name||'Product')}</h3><small>${esc(ctx,p.brand||'')} · ${esc(ctx,p.style_code||'')}</small></div><small>${group.length} variants</small></header><div class="csh-variant-chips">${group.map(v=>`<button type="button" class="csh-variant-chip" data-add-variant="${v.id}" ${!isPurchase&&stockOf(v)<=0?'disabled':''}><span><i style="--csh-swatch:${colorCss(v.color)}"></i>${esc(ctx,v.color||'Color n/a')} · ${esc(ctx,v.size_label||'One size')}</span><b>${money(ctx,isPurchase?v.cost_price:v.sale_price)}</b><small>${isPurchase?'Stock '+stockOf(v):`${stockOf(v)} ${esc(ctx,v.unit||'pcs')} available`}</small></button>`).join('')}</div></article>`}).join('')||cshEmpty('No matching variants. Add products in the catalog first.');
    document.querySelectorAll('[data-add-variant]').forEach(b=>b.onclick=()=>add(rows.find(v=>v.id===b.dataset.addVariant)));
  }
  function cartLines(){return [...cart.values()]}
  function renderTotals(){
    const subtotal=cartLines().reduce((n,x)=>n+x.quantity*x.unitPrice,0),tax=subtotal*Number($('#cshTax').value||0)/100,discount=Number($('#cshDiscount').value||0),total=Math.max(0,subtotal+tax-discount),paid=Number($('#cshPaid').value||0);
    $('#cshSubtotal').textContent=money(ctx,subtotal);$('#cshTaxAmount').textContent=money(ctx,tax);$('#cshDiscountAmount').textContent=money(ctx,discount);$('#cshTotal').textContent=money(ctx,total);$('#cshDue').textContent=money(ctx,Math.max(0,total-paid));
  }
  function drawCart(){
    const lines=cartLines();
    $('#cshCartRows').innerHTML=lines.length?`<div class="csh-cart-lines">${lines.map(x=>`<article class="csh-cart-line"><div class="csh-cart-line-title"><b>${esc(ctx,variantName(x.v))}</b><small><code>${esc(ctx,skuOf(x.v))}</code> · ${esc(ctx,x.entryUnit)}</small><button type="button" data-cart-remove="${x.key}" aria-label="Remove">×</button></div><div class="csh-cart-line-edit"><label>Qty<input type="number" min="0.001" step="0.001" data-cart-qty="${x.key}" value="${x.quantity}"></label><label>${isPurchase?'Price / '+esc(ctx,x.entryUnit):'Price / '+esc(ctx,x.v.unit||'pcs')}<input type="number" min="0" step="0.01" data-cart-price="${x.key}" value="${x.unitPrice}"></label><strong>${money(ctx,x.quantity*x.unitPrice)}</strong></div></article>`).join('')}</div>`:cshEmpty('Add a size/color variant to the cart.');
    document.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>{cart.delete(b.dataset.cartRemove);drawCart()});
    document.querySelectorAll('[data-cart-qty]').forEach(b=>b.oninput=()=>{let x=cart.get(b.dataset.cartQty);x.quantity=Math.max(0,Number(b.value||0));renderTotals()});
    document.querySelectorAll('[data-cart-price]').forEach(b=>b.oninput=()=>{let x=cart.get(b.dataset.cartPrice);x.unitPrice=Math.max(0,Number(b.value||0));renderTotals()});
    renderTotals();
  }
  drawProducts();drawCart();
  $('#cshPosSearch').oninput=drawProducts;
  $('#cshBarcodeScan').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const q=e.target.value.trim().toLowerCase();if(!q)return;const found=rows.find(v=>String(v.barcode||'').toLowerCase()===q||String(v.variant_sku||'').toLowerCase()===q||String(v.item_code||'').toLowerCase()===q);if(found){if(!isPurchase&&stockOf(found)<=0){ctx.toast('This variant is out of stock.');return}add(found);e.target.value='';}else{ctx.toast('No exact SKU or barcode match.');$('#cshPosSearch').value=e.target.value;drawProducts()}};
  ['cshTax','cshDiscount','cshPaid'].forEach(id=>$('#'+id).oninput=renderTotals);
  $('#cshPostInvoice').onclick=async()=>{
    const lines=cartLines();if(!lines.length)return ctx.toast('Cart is empty.');
    const taxPercent=Number($('#cshTax').value||0),discount=Number($('#cshDiscount').value||0),paidAmount=Number($('#cshPaid').value||0);
    if(taxPercent<0||discount<0||paidAmount<0)return ctx.toast('Tax, discount and paid amount cannot be negative.');
    if(!isPurchase){for(const line of lines)if(line.quantity>stockOf(line.v))return ctx.toast(`Only ${stockOf(line.v)} ${line.v.unit||'pcs'} available for ${variantName(line.v)}.`)}
    const total=lines.reduce((n,x)=>n+x.quantity*x.unitPrice,0)*(1+taxPercent/100)-discount;if(discount>total+discount)return ctx.toast('Discount is higher than the invoice value.');if(paidAmount>total)return ctx.toast('Paid amount cannot exceed the invoice total.');
    const btn=$('#cshPostInvoice');btn.disabled=true;
    try{
      const isConversionPurchase=isPurchase;
      const payload={kind,partyId:$('#cshParty').value||null,invoiceDate:$('#cshDate').value,paymentMethod:$('#cshPayMethod').value,transactionId:$('#cshTrx').value.trim()||null,notes:$('#cshNotes').value.trim()||null,taxPercent,discount,paidAmount,customPartyName:$('#cshParty').value?'':($('#cshParty').options[0]?.textContent||''),lines:lines.map(x=>({itemId:x.v.inventory_item_id||x.v.item?.id||x.v.item_id,quantity:x.quantity*(isConversionPurchase?x.conversion:1),unitPrice:x.unitPrice/(isConversionPurchase?x.conversion:1),taxPercent:0,discount:0}))};
      const posted=await ctx.api('invoices',{method:'POST',body:JSON.stringify(payload)});
      ctx.toast(`${isPurchase?'Purchase':'Sale'} ${posted.invoice_number||number.invoiceNumber} posted. Stock updated by exact variant.`);
      ctx.navigate(isPurchase?'purchases':'sales');
    }catch(err){ctx.toast(err.message);btn.disabled=false}
  };
  bindGo(ctx);
}

function cshVariantMap(rows=[]){
  return new Map(rows.map(v=>[String(v.inventory_item_id||v.item_id||v.item?.id||''),v]).filter(([k])=>k));
}
function cshClothingLabel(ctx,item,variantsByItem){
  const invItem=item?.inventory_items||item?.item||null,id=String(item?.item_id||invItem?.id||item?.id||'');
  const v=variantsByItem?.get?.(id);
  return v?{name:variantName(v),sku:skuOf(v),unit:v.unit||invItem?.unit||'pcs',variant:v}:{name:invItem?.description||item?.description||item?.product_name||'Clothing variant',sku:invItem?.item_code||item?.item_code||item?.sku||'—',unit:invItem?.unit||item?.unit||'pcs',variant:null};
}
function cshReturnDetails(ctx,items,variantsByItem,kind='sale'){
  if(!items?.length)return '—';
  return items.map(it=>{
    const label=cshClothingLabel(ctx,it,variantsByItem),qty=Number(it.quantity||0);
    const itemType=it.item_type,meta=(itemType==='new'?[]:[it.condition,it.reason]).filter(Boolean).join(' · ');
    return `${label.name} · ${qty} ${label.unit}${meta?` (${meta})`:''}`;
  }).join(' / ');
}
function cshSaleReturnRows(ctx,lines,variantsByItem,{deductions=true}={}){
  const heads=['Clothing variant','Sold','Returned','Returnable','Return qty','Condition','Reason',...(deductions?['Deduction']:[]),'Return value'];
  const rows=(lines||[]).map(l=>{
    const label=cshClothingLabel(ctx,l,variantsByItem),max=Number(l.returnable_quantity||0),lineId=esc(ctx,l.id),unitPrice=Number(l.unit_price||0);
    return `<tr><td><div class="csh-variant-ident"><b>${esc(ctx,label.name)}</b><small><code>${esc(ctx,label.sku)}</code> · ${esc(ctx,label.unit)}</small></div></td><td>${Number(l.quantity||0)}</td><td>${Number(l.already_returned_quantity||0)}</td><td>${max}</td><td><input type="number" min="0" max="${max}" step="0.001" value="0" data-csh-rqty="${lineId}" data-price="${unitPrice}" data-tax="${Number(l.tax_percent||0)}" data-disc="${Number(l.discount||0)}" data-sold="${Number(l.quantity||0)}" ${max<=0?'disabled':''} aria-label="Return quantity for ${esc(ctx,label.name)}"></td><td><select data-csh-rcondition aria-label="Returned condition"><option>Sellable</option><option>Damaged</option><option>Defective</option></select></td><td><div class="csh-return-reason"><select data-csh-rreason aria-label="Return reason"><option>Customer Changed Mind</option><option>Wrong Product</option><option>Wrong Specification</option><option>Defective</option><option>Damaged</option><option>Other</option></select><input type="text" data-csh-rnote maxlength="500" placeholder="Note if Other" aria-label="Return reason note"></div></td>${deductions?`<td><input type="number" min="0" step="0.01" value="0" data-csh-rpenalty aria-label="Optional return deduction"></td>`:''}<td><b data-csh-ramount>${money(ctx,0)}</b></td></tr>`;
  });
  return cshTable(heads,rows,'No remaining returnable quantities on this invoice.');
}
function cshReadSaleReturnLines(root,deductions=true){
  return [...root.querySelectorAll('[data-csh-rqty]')].map(input=>{
    const quantity=Number(input.value||0),row=input.closest('tr');if(!(quantity>0))return null;
    return {invoice_line_id:input.dataset.cshRqty,quantity,condition:row.querySelector('[data-csh-rcondition]')?.value||'Sellable',reason:row.querySelector('[data-csh-rreason]')?.value||'Customer Changed Mind',reason_note:row.querySelector('[data-csh-rnote]')?.value?.trim()||null,penalty:deductions?Math.max(0,Number(row.querySelector('[data-csh-rpenalty]')?.value||0)):0,unit_price:Number(input.dataset.price||0),tax_percent:Number(input.dataset.tax||0),discount:Number(input.dataset.disc||0),sold_quantity:Number(input.dataset.sold||0)};
  }).filter(Boolean);
}
function cshReturnLineAmount(x){
  const subtotal=Math.round(x.quantity*x.unit_price*100)/100,tax=Math.round(subtotal*x.tax_percent)/100,discount=x.sold_quantity>0?Math.round(x.quantity/x.sold_quantity*x.discount*100)/100:0,penalty=Math.round(Number(x.penalty||0)*100)/100;
  return Math.max(0,Math.round((subtotal+tax-discount-penalty)*100)/100);
}
function cshBindSaleReturnInputs(ctx,root,deductions,update){
  root.querySelectorAll('[data-csh-rqty],[data-csh-rpenalty]').forEach(input=>input.addEventListener('input',()=>{
    if(input.matches('[data-csh-rqty]')){const max=Number(input.max||0);if(Number(input.value||0)>max)input.value=String(max)}
    if(input.matches('[data-csh-rpenalty]')){if(Number(input.value||0)<0)input.value='0';const row=input.closest('tr'),line=row?cshReadSaleReturnLines(row,true)[0]:null;if(line){line.penalty=0;const cap=cshReturnLineAmount(line);if(Number(input.value||0)>cap)input.value=String(cap)}}
    if(input.matches('[data-csh-rqty]')){const row=input.closest('tr'),deduction=row?.querySelector('[data-csh-rpenalty]'),line=row?cshReadSaleReturnLines(row,true)[0]:null;if(deduction&&line){line.penalty=0;const cap=cshReturnLineAmount(line);if(Number(deduction.value||0)>cap)deduction.value=String(cap)}}
    update();
  }));
  root.querySelectorAll('[data-csh-rcondition],[data-csh-rreason],[data-csh-rnote]').forEach(input=>input.addEventListener('change',update));
  root.querySelectorAll('[data-csh-rreason]').forEach(select=>select.addEventListener('change',()=>{
    const note=select.closest('tr')?.querySelector('[data-csh-rnote]');if(note){note.required=select.value==='Other';note.placeholder=select.value==='Other'?'Required when reason is Other':'Note if Other'}
  }));
}
function cshSalesReturnModal(ctx,variantsByItem,refresh){
  const e=cshModal('Customer return','Find the original sales invoice, then select the exact size/color line(s) and quantities.',`<form id="cshSalesReturnForm" class="csh-form"><div class="csh-return-lookup"><label class="csh-field">Original sales invoice number<input id="cshSalesReturnInvoice" required maxlength="100" placeholder="Scan or enter invoice number"></label><button type="button" id="cshSalesReturnLookup" class="csh-btn">Find invoice</button></div><div id="cshSalesReturnInfo" class="csh-return-info">The server checks this shop’s invoice and remaining returnable quantity.</div><div id="cshSalesReturnLines">${cshEmpty('Invoice details will appear here.')}</div><div class="csh-return-total"><span id="cshSalesReturnCount">0 variants selected</span><span>Recorded refund <b id="cshSalesReturnTotal">${money(ctx,0)}</b></span></div><div class="csh-form-grid">${cshField(ctx,'Refund method recorded','refund_method','cash',{type:'select',options:[{value:'cash',label:'Cash'},{value:'bank',label:'Bank'},{value:'bkash',label:'bKash'},{value:'nagad',label:'Nagad'},{value:'other',label:'Other'},{value:'none',label:'No refund/payment recorded'}]})}${cshField(ctx,'Transaction reference (optional)','transaction_id','',{placeholder:'Receipt, transfer or mobile payment reference'})}${cshField(ctx,'Return notes (optional)','notes','',{placeholder:'Additional context'})}</div><div class="csh-return-policy"><b>Current EMS behavior:</b> posting records the calculated invoice refund immediately. Sellable units return to available stock; damaged/defective units are recorded but excluded from saleable stock. The selected payment method is recorded; this form does not move cash or initiate a bank/mobile payment.</div><div class="csh-form-foot"><span>Final quantity/eligibility is checked again by the server.</span><button id="cshSalesReturnSubmit" class="csh-btn csh-btn-primary" disabled>Post customer return</button></div></form>`,true);
  let lookup=null;const lineBox=e.querySelector('#cshSalesReturnLines'),info=e.querySelector('#cshSalesReturnInfo'),total=e.querySelector('#cshSalesReturnTotal'),count=e.querySelector('#cshSalesReturnCount'),submit=e.querySelector('#cshSalesReturnSubmit');
  const update=()=>{
    const items=cshReadSaleReturnLines(lineBox,false),amount=items.reduce((n,x)=>n+cshReturnLineAmount(x),0);
    total.textContent=money(ctx,amount);count.textContent=`${items.length} variant${items.length===1?'':'s'} · ${items.reduce((n,x)=>n+x.quantity,0).toLocaleString()} units selected`;
    submit.disabled=!lookup||!items.length;
  };
  e.querySelector('#cshSalesReturnLookup').onclick=async()=>{
    const invoiceNumber=e.querySelector('#cshSalesReturnInvoice').value.trim();if(!invoiceNumber)return ctx.toast('Enter or scan a sales invoice number.');
    const button=e.querySelector('#cshSalesReturnLookup');button.disabled=true;button.textContent='Checking invoice…';
    try{
      const data=await ctx.api('returns/invoice-lookup?invoice_number='+encodeURIComponent(invoiceNumber));if(!e.isConnected)return;
      lookup=data;const invoiceLines=(data.lines||[]).map(line=>({...line,tax_percent:Number(line.tax_percent||data.invoice?.tax_percent||0)}));const customer=data.customer?.name||data.invoice?.custom_party_name||'Walk-in customer';
      const date=data.invoice?.invoice_date?fmtDate(data.invoice.invoice_date):'Date not recorded';
      info.innerHTML=`<b>${esc(ctx,data.invoice.invoice_number)}</b><span>${esc(ctx,customer)} · ${esc(ctx,date)}</span><small>${data.lines.length} invoice line${data.lines.length===1?'':'s'} · sale total ${money(ctx,data.invoice.subtotal||0)}</small>`;
      const localVariants=cshVariantMap(invoiceLines.map(l=>l.inventory_items).filter(Boolean).map(item=>({inventory_item_id:item.id,item_code:item.item_code,description:item.description,unit:item.unit})));
      lineBox.innerHTML=cshSaleReturnRows(ctx,invoiceLines,variantsByItem?.size?variantsByItem:localVariants,{deductions:false});
      cshBindSaleReturnInputs(ctx,lineBox,false,update);update();
    }catch(err){if(e.isConnected){lookup=null;info.textContent=err.message;lineBox.innerHTML=cshEmpty('Invoice lookup failed. Check the invoice number and your shop permissions.');update()}}
    finally{if(e.isConnected){button.disabled=false;button.textContent='Find invoice'}}
  };
  e.querySelector('#cshSalesReturnInvoice').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();e.querySelector('#cshSalesReturnLookup').click()}};
  e.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();if(!lookup)return ctx.toast('Find the original invoice first.');
    const fd=new FormData(ev.target),items=cshReadSaleReturnLines(lineBox,false);
    if(!items.length)return ctx.toast('Enter a return quantity for at least one exact variant.');
    if(items.some(x=>x.reason==='Other'&&!x.reason_note))return ctx.toast('Add a note when the return reason is Other.');
    const amount=items.reduce((n,x)=>n+cshReturnLineAmount(x),0);
    try{
      await ctx.api('returns',{method:'POST',body:JSON.stringify({invoice_id:lookup.invoice.id,items:items.map(({unit_price,tax_percent,discount,sold_quantity,penalty,...item})=>item),refund_method:amount>0?fd.get('refund_method'):'none',transaction_id:fd.get('transaction_id')||null,notes:fd.get('notes')||null})});
      e.remove();ctx.toast('Customer return posted. Check the return record for its item condition and recorded refund.');if(!ctx.isCurrent||ctx.isCurrent())refresh();
    }catch(err){ctx.toast(err.message)}
  };
}
function cshExchangeModal(ctx,variants,variantsByItem,refresh){
  const vById=new Map((variants||[]).map(v=>[String(v.inventory_item_id||v.item_id||v.item?.id||''),v]).filter(([k])=>k));
  const e=cshModal('Clothing exchange','Select the original size/color variant, then add in-stock replacement variants. EMS calculates the difference.',`<form id="cshExchangeForm" class="csh-form"><div class="csh-return-lookup"><label class="csh-field">Original sales invoice number<input id="cshExchangeInvoice" required maxlength="100" placeholder="Scan or enter invoice number"></label><button type="button" id="cshExchangeLookup" class="csh-btn">Find invoice</button></div><div id="cshExchangeInfo" class="csh-return-info">The server checks the original invoice and previously returned quantities.</div><section class="csh-return-section"><header><b>Returned variant</b><small>Select the correct size and color actually brought back.</small></header><div id="cshExchangeReturnLines">${cshEmpty('Invoice details will appear here.')}</div></section><section class="csh-return-section"><header><b>Replacement variant</b><small>Only active variants with stock are selectable. Price starts at the current variant price.</small></header><div class="csh-return-lookup"><label class="csh-field">Search replacements<input id="cshExchangeSearch" placeholder="Product, color, size, SKU or barcode"></label><label class="csh-field">In-stock variant<select id="cshExchangeVariant" disabled><option value="">Find an invoice first</option></select></label><button type="button" id="cshExchangeAdd" class="csh-btn" disabled>Add variant</button></div><div id="cshExchangeNewItems">${cshEmpty('Replacement variants will appear after invoice lookup.')}</div></section><div class="csh-exchange-summary"><div><small>Returned value</small><b id="cshExchangeReturned">${money(ctx,0)}</b></div><div><small>Replacement value</small><b id="cshExchangeNewTotal">${money(ctx,0)}</b></div><div class="csh-exchange-difference"><small id="cshExchangeDiffLabel">Difference</small><b id="cshExchangeDifference">${money(ctx,0)}</b></div></div><div id="cshExchangePaymentFields" class="csh-form-grid">${cshField(ctx,'Payment/refund method when a balance is due','payment_method','cash',{type:'select',options:[{value:'cash',label:'Cash'},{value:'bank',label:'Bank'},{value:'bkash',label:'bKash'},{value:'nagad',label:'Nagad'},{value:'other',label:'Other'}]})}${cshField(ctx,'Transaction reference (optional)','transaction_id','',{placeholder:'Receipt, transfer or mobile payment reference'})}</div><label class="csh-field">Exchange notes (optional)<textarea name="notes" rows="2" placeholder="Reason or exchange details"></textarea></label><div class="csh-return-policy">Sellable returned items go back to saleable stock; damaged/defective items remain excluded. A higher replacement value records a customer payment; a lower value records a customer refund. The chosen method/reference is recorded, but EMS does not move money automatically.</div><div class="csh-form-foot"><span>EMS rechecks quantities and replacement stock when posted.</span><button id="cshExchangeSubmit" class="csh-btn csh-btn-primary" disabled>Post exchange</button></div></form>`,true);
  let lookup=null,newItems=[];const returnBox=e.querySelector('#cshExchangeReturnLines'),newBox=e.querySelector('#cshExchangeNewItems'),variantSelect=e.querySelector('#cshExchangeVariant'),search=e.querySelector('#cshExchangeSearch'),addButton=e.querySelector('#cshExchangeAdd'),submit=e.querySelector('#cshExchangeSubmit');
  const returnedAmount=()=>cshReadSaleReturnLines(returnBox,false).reduce((n,x)=>n+cshReturnLineAmount(x),0);
  const replacementAmount=()=>newItems.reduce((n,x)=>n+Math.max(0,Math.round((x.quantity*x.unit_price*(1+x.tax_percent/100)-x.discount)*100)/100),0);
  const renderVariants=()=>{
    if(!lookup){variantSelect.innerHTML='<option value="">Find an invoice first</option>';variantSelect.disabled=true;addButton.disabled=true;return}
    const q=search.value.trim().toLowerCase(),eligible=(variants||[]).filter(v=>v.active!==false&&stockOf(v)>0&&(!q||[variantName(v),skuOf(v),v.barcode].join(' ').toLowerCase().includes(q)));
    variantSelect.innerHTML=`<option value="">Choose a size/color variant</option>${eligible.map(v=>`<option value="${esc(ctx,v.inventory_item_id||v.item_id||v.item?.id)}">${esc(ctx,variantName(v))} · ${esc(ctx,skuOf(v))} · ${stockOf(v)} ${esc(ctx,v.unit||'pcs')} · ${money(ctx,v.sale_price)}</option>`).join('')}`;
    variantSelect.disabled=!eligible.length;addButton.disabled=!eligible.length;
  };
  const renderNewItems=()=>{
    const rows=newItems.map((x,i)=>`<tr><td><b>${esc(ctx,variantName(x.variant))}</b><small class="csh-subcell"><code>${esc(ctx,skuOf(x.variant))}</code></small></td><td>${stockOf(x.variant)} ${esc(ctx,x.variant.unit||'pcs')}</td><td><input type="number" min="0.001" max="${stockOf(x.variant)}" step="0.001" value="${x.quantity}" data-csh-exqty="${i}" aria-label="Replacement quantity"></td><td><input type="number" min="0" step="0.01" value="${x.unit_price}" data-csh-exprice="${i}" aria-label="Replacement unit price"></td><td><input type="number" min="0" step="0.01" value="${x.discount}" data-csh-exdisc="${i}" aria-label="Replacement discount"></td><td><b>${money(ctx,Math.max(0,Math.round((x.quantity*x.unit_price*(1+x.tax_percent/100)-x.discount)*100)/100))}</b></td><td><button type="button" data-csh-exremove="${i}" aria-label="Remove replacement">×</button></td></tr>`);
    newBox.innerHTML=cshTable(['Replacement variant','Available','Qty','Unit price','Discount','Line total',''],rows,'Add at least one replacement variant.');
    newBox.querySelectorAll('[data-csh-exqty],[data-csh-exprice],[data-csh-exdisc]').forEach(input=>input.oninput=()=>{
      const index=Number(input.dataset.cshExqty??input.dataset.cshExprice??input.dataset.cshExdisc),x=newItems[index];if(!x)return;
      if(input.dataset.cshExqty!==undefined){x.quantity=Math.max(0,Number(input.value||0));if(x.quantity>stockOf(x.variant)){x.quantity=stockOf(x.variant);input.value=String(x.quantity)}}
      else if(input.dataset.cshExprice!==undefined)x.unit_price=Math.max(0,Number(input.value||0));
      else x.discount=Math.max(0,Number(input.value||0));
      x.discount=Math.min(x.discount,x.quantity*x.unit_price*(1+x.tax_percent/100));
      const row=input.closest('tr');if(row){const discountInput=row.querySelector('[data-csh-exdisc]');if(discountInput&&Number(discountInput.value||0)!==x.discount)discountInput.value=String(x.discount);row.querySelector('td:nth-child(6) b').textContent=money(ctx,Math.max(0,Math.round((x.quantity*x.unit_price*(1+x.tax_percent/100)-x.discount)*100)/100))}
      updateSummary();
    });
    newBox.querySelectorAll('[data-csh-exremove]').forEach(button=>button.onclick=()=>{newItems.splice(Number(button.dataset.cshExremove),1);renderNewItems();updateSummary()});
  };
  const updateSummary=()=>{
    const r=returnedAmount(),n=replacementAmount(),diff=Math.round((n-r)*100)/100;
    e.querySelector('#cshExchangeReturned').textContent=money(ctx,r);e.querySelector('#cshExchangeNewTotal').textContent=money(ctx,n);
    e.querySelector('#cshExchangeDiffLabel').textContent=diff>0?'Customer pays':diff<0?'Refund to customer':'Even exchange';e.querySelector('#cshExchangeDifference').textContent=money(ctx,Math.abs(diff));
    submit.disabled=!lookup||!cshReadSaleReturnLines(returnBox,false).length||!newItems.some(x=>x.quantity>0);
  };
  e.querySelector('#cshExchangeLookup').onclick=async()=>{
    const invoiceNumber=e.querySelector('#cshExchangeInvoice').value.trim();if(!invoiceNumber)return ctx.toast('Enter or scan a sales invoice number.');
    const button=e.querySelector('#cshExchangeLookup');button.disabled=true;button.textContent='Checking invoice…';
    try{
      const data=await ctx.api('returns/invoice-lookup?invoice_number='+encodeURIComponent(invoiceNumber));if(!e.isConnected)return;
      lookup=data;const invoiceLines=(data.lines||[]).map(line=>({...line,tax_percent:Number(line.tax_percent||data.invoice?.tax_percent||0)}));const customer=data.customer?.name||data.invoice?.custom_party_name||'Walk-in customer';
      e.querySelector('#cshExchangeInfo').innerHTML=`<b>${esc(ctx,data.invoice.invoice_number)}</b><span>${esc(ctx,customer)} · ${esc(ctx,fmtDate(data.invoice.invoice_date))}</span><small>Original tax rate: ${Number(data.invoice.tax_percent||0)}% · only still-returnable line quantities can be exchanged</small>`;
      const localItems=new Map((data.lines||[]).map(l=>[String(l.item_id),l.inventory_items]).filter(([k,v])=>k&&v));
      returnBox.innerHTML=cshSaleReturnRows(ctx,invoiceLines,variantsByItem?.size?variantsByItem:cshVariantMap([...localItems.values()].map(item=>({inventory_item_id:item.id,item_code:item.item_code,description:item.description,unit:item.unit}))),{deductions:false});
      cshBindSaleReturnInputs(ctx,returnBox,false,updateSummary);
      const tax=Math.max(0,Number(data.invoice.tax_percent||0));newItems=[];newBox.dataset.tax=String(tax);renderVariants();renderNewItems();updateSummary();
    }catch(err){if(e.isConnected){lookup=null;e.querySelector('#cshExchangeInfo').textContent=err.message;returnBox.innerHTML=cshEmpty('Invoice lookup failed. Check the invoice number and permissions.');renderVariants();updateSummary()}}
    finally{if(e.isConnected){button.disabled=false;button.textContent='Find invoice'}}
  };
  e.querySelector('#cshExchangeInvoice').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();e.querySelector('#cshExchangeLookup').click()}};
  search.oninput=renderVariants;
  variantSelect.onchange=()=>{addButton.disabled=!variantSelect.value};
  addButton.onclick=()=>{
    const itemId=variantSelect.value,v=vById.get(String(itemId));if(!v)return;
    const existing=newItems.find(x=>String(x.item_id)===String(itemId));
    if(existing){if(existing.quantity+1>stockOf(v))return ctx.toast('Requested replacement exceeds available variant stock.');existing.quantity+=1}
    else newItems.push({item_id:itemId,variant:v,quantity:1,unit_price:Number(v.sale_price||0),discount:0,tax_percent:Number(newBox.dataset.tax||0)});
    renderNewItems();updateSummary();
  };
  e.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();if(!lookup)return ctx.toast('Find the original invoice first.');
    const returned_items=cshReadSaleReturnLines(returnBox,false).map(({unit_price,tax_percent,discount,sold_quantity,...item})=>item),new_items=newItems.filter(x=>x.quantity>0).map(({variant,...item})=>item);
    if(!returned_items.length||!new_items.length)return ctx.toast('Select at least one returned and one replacement variant.');
    if(returned_items.some(x=>x.reason==='Other'&&!x.reason_note))return ctx.toast('Add a note when the return reason is Other.');
    const difference=Math.round((replacementAmount()-returnedAmount())*100)/100,fd=new FormData(ev.target);
    const paymentMethod=difference===0?'none':String(fd.get('payment_method')||'cash');
    try{
      await ctx.api('exchanges',{method:'POST',body:JSON.stringify({invoice_id:lookup.invoice.id,returned_items,new_items,payment_method:paymentMethod,transaction_id:fd.get('transaction_id')||null,notes:fd.get('notes')||null})});
      e.remove();ctx.toast('Clothing exchange posted. Check the exchange record for the final amount and payment/refund direction.');if(!ctx.isCurrent||ctx.isCurrent())refresh();
    }catch(err){ctx.toast(err.message)}
  };
}

export async function cshopReturns(ctx){
  ctxFor(ctx);
  const mayView=ctx.canAccess('returns_refunds','view')||ctx.canAccess('sales','view');
  if(!mayView){ctx.toast('Permission denied.');return}
  const [returnsList,exchangesList,variants]=await Promise.all([
    ctx.api('returns').catch(error=>{throw error}),ctx.api('exchanges').catch(error=>{throw error}),
    ctx.canAccess('inventory','view')?ctx.api('clothing/variants').catch(()=>[]):Promise.resolve([]),
  ]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const variantsByItem=cshVariantMap(variants),canCreate=ctx.canAccess('returns_refunds','add')||ctx.canAccess('sales','add'),canExchange=canCreate&&ctx.canAccess('inventory','view');
  let activeTab='returns',query='';
  const render=()=>{
    const actions=`${canCreate?`<button type="button" class="csh-btn csh-btn-primary" id="cshNewSalesReturn">+ Customer return</button>`:''}${canExchange?`<button type="button" class="csh-btn" id="cshNewClothingExchange">↔ Clothing exchange</button>`:''}`;
    const rTotal=returnsList.reduce((n,x)=>n+Number(x.total_return_amount||0),0),xTotal=exchangesList.reduce((n,x)=>n+Number(x.difference_amount||0),0);
    const items=activeTab==='returns'?returnsList:exchangesList;
    const filtered=items.filter(x=>JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));
    const tabs=`<div class="csh-toolbar csh-after-sales-tabs"><button type="button" class="${activeTab==='returns'?'on':''}" data-csh-after-sales="returns">Customer returns <b>${returnsList.length}</b></button><button type="button" class="${activeTab==='exchanges'?'on':''}" data-csh-after-sales="exchanges">Exchanges <b>${exchangesList.length}</b></button><input id="cshAfterSalesSearch" class="csh-search" value="${esc(ctx,query)}" placeholder="Search invoice, customer, return number or variant"><span class="csh-result-count">${filtered.length} records</span></div>`;
    const returnRows=filtered.map(r=>{
      const inv=r.invoices?.invoice_number||r.invoice_number||'—',customer=r.customer_name||r.customers?.name||'Walk-in customer',details=cshReturnDetails(ctx,r.return_items||[],variantsByItem),date=fmtDate(r.return_date),amt=Number(r.refunded_amount??r.total_return_amount??0),recordLabel=String(r.status||'').toLowerCase()==='refunded'?'Refund recorded':'Return posted';
      return `<tr><td><b>${esc(ctx,r.return_number||'Return')}</b><small class="csh-subcell">${esc(ctx,inv)} · ${esc(ctx,date)}</small></td><td>${esc(ctx,customer)}</td><td>${esc(ctx,details)}</td><td><span class="csh-status ${String(r.status||'').toLowerCase()==='refunded'?'on':'off'}">${recordLabel}</span><small class="csh-subcell">${esc(ctx,r.refund_method||'—')}${r.transaction_id?' · '+esc(ctx,r.transaction_id):''}</small></td><td><b>${money(ctx,amt)}</b></td></tr>`;
    });
    const exchangeRows=filtered.map(x=>{
      const inv=x.invoices?.invoice_number||'—',customer=x.customer_name||x.customers?.name||'Walk-in customer',returned=(x.exchange_items||[]).filter(i=>i.item_type==='returned'),replaced=(x.exchange_items||[]).filter(i=>i.item_type==='new'),diff=Number(x.difference_amount||0),direction=diff>0?'Customer paid':diff<0?'Refund recorded':'Even exchange';
      return `<tr><td><b>${esc(ctx,x.exchange_number||'Exchange')}</b><small class="csh-subcell">${esc(ctx,inv)} · ${esc(ctx,fmtDate(x.exchange_date))}</small></td><td>${esc(ctx,customer)}</td><td><small class="csh-return-subhead">Returned</small>${esc(ctx,cshReturnDetails(ctx,returned,variantsByItem))}<small class="csh-return-subhead">Replacement</small>${esc(ctx,cshReturnDetails(ctx,replaced,variantsByItem))}</td><td>${esc(ctx,direction)}${x.payment_method&&x.payment_method!=='none'?' · '+esc(ctx,x.payment_method):''}${x.transaction_id?' · '+esc(ctx,x.transaction_id):''}</td><td><b>${money(ctx,Math.abs(diff))}</b></td></tr>`;
    });
    $('#page').innerHTML=cshHeading('AFTER-SALES','Clothing returns & exchanges','',actions)+`<div class="csh-kpis csh-kpis-compact">${cshCard('Customer returns',returnsList.length,'Posted sales returns','rotate-ccw','rose')}${cshCard('Return value recorded',money(ctx,rTotal),'Invoice value recorded by EMS','wallet','plum')}${cshCard('Exchanges',exchangesList.length,'Posted exchanges','refresh','blue')}${cshCard('Net exchange difference',money(ctx,xTotal),'Positive = customer payment · negative = refund','arrow-left-right',xTotal<0?'amber':'green')}</div>${tabs}<section class="csh-return-history">${activeTab==='returns'?cshTable(['Return · original sale','Customer','Size/color variants returned','Refund record','Return amount'],returnRows,'No customer returns match your search.') : cshTable(['Exchange · original sale','Customer','Returned & replacement variants','Settlement direction','Difference'],exchangeRows,'No clothing exchanges match your search.')}</section><p class="csh-hint">History is tied to the original invoice and exact variants. Sellable returns are restocked; damaged/defective items stay out of saleable stock. Cash and external payment transfers are not initiated by this screen.</p>`;
    document.querySelectorAll('[data-csh-after-sales]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.cshAfterSales;render()});
    $('#cshAfterSalesSearch').oninput=ev=>{query=ev.target.value;const pos=ev.target.selectionStart;render();const replacement=$('#cshAfterSalesSearch');replacement.focus();replacement.setSelectionRange(pos,pos)};
    if($('#cshNewSalesReturn'))$('#cshNewSalesReturn').onclick=()=>cshSalesReturnModal(ctx,variantsByItem,render);
    if($('#cshNewClothingExchange'))$('#cshNewClothingExchange').onclick=()=>cshExchangeModal(ctx,variants,variantsByItem,render);
  };
  render();
}

export async function cshopPurchaseReturns(ctx){
  ctxFor(ctx);
  const [returnsList,invoices,parties,variantRows]=await Promise.all([
    ctx.api('clothing/purchase-returns'),ctx.api('invoices?kind=purchase'),ctx.api('invoice-parties?kind=purchase').catch(()=>[]),
    ctx.canAccess('inventory','view')?ctx.api('clothing/variants').catch(()=>[]):Promise.resolve([]),
  ]);
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  const variantsByItem=cshVariantMap(variantRows),lineMap=new Map();
  for(const invoice of invoices)for(const line of invoice.invoice_lines||[])lineMap.set(String(line.id),line);
  const supplierMap=new Map((parties||[]).map(x=>[String(x.id),x]));
  let query='';
  const render=()=>{
    const total=returnsList.reduce((n,x)=>n+Number(x.total_return_amount||0),0),units=returnsList.reduce((n,x)=>n+(x.items||[]).reduce((z,i)=>z+Number(i.quantity||0),0),0);
    const actions=ctx.canAccess('purchase','add')?`<button type="button" class="csh-btn csh-btn-primary" id="cshNewPurchaseReturn">+ Supplier return</button>`:'';
    const filtered=returnsList.filter(x=>JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));
    const rows=filtered.map(r=>{
      const invoice=r.purchase_invoice_number||invoices.find(i=>i.id===r.purchase_invoice_id)?.invoice_number||'—',supplier=r.supplier_name||supplierMap.get(String(r.supplier_id))?.name||'Supplier';
      const details=(r.items||[]).map(it=>{const line=lineMap.get(String(it.invoice_line_id)),item=variantsByItem.get(String(it.item_id))||line?.inventory_items||{description:line?.inventory_items?.description||it.item_id,item_code:line?.inventory_items?.item_code,unit:line?.inventory_items?.unit};return `${variantName(item)} · ${Number(it.quantity||0)} ${item.unit||'pcs'}`}).join(' / ')||'—';
      return `<tr><td><b>${esc(ctx,r.return_number)}</b><small class="csh-subcell">${esc(ctx,invoice)} · ${esc(ctx,fmtDate(r.return_date))}</small></td><td>${esc(ctx,supplier)}</td><td>${esc(ctx,details)}</td><td>${esc(ctx,r.reason||'—')}${r.notes?`<small class="csh-subcell">${esc(ctx,r.notes)}</small>`:''}</td><td><b>${money(ctx,r.total_return_amount)}</b></td></tr>`;
    });
    $('#page').innerHTML=cshHeading('BUYING','Supplier purchase returns','',actions)+`<div class="csh-kpis csh-kpis-compact">${cshCard('Supplier returns',returnsList.length,'Posted against purchase invoices','corner-up-left','amber')}${cshCard('Units returned',units.toLocaleString(),'Exact size/color quantities','package','blue')}${cshCard('Return value',money(ctx,total),'Original purchase unit cost','coins','plum')}${cshCard('Purchase bills',invoices.length,'Available for return','receipt','rose')}</div><div class="csh-toolbar"><input id="cshPurchaseReturnSearch" class="csh-search" value="${esc(ctx,query)}" placeholder="Search return number, supplier, invoice or variant"><span class="csh-result-count">${filtered.length} returns</span></div><section class="csh-return-history">${cshTable(['Return · purchase bill','Supplier','Size/color variants returned','Reason','Return value'],rows,'No supplier returns match your search.')}</section><p class="csh-hint">Posting a supplier return deducts the selected exact variants and links the return to the source purchase bill. EMS reduces that bill’s remaining due up to zero; for an already-paid bill, EMS records the return but does not initiate a separate cash refund or supplier-credit payment.</p>`;
    $('#cshPurchaseReturnSearch').oninput=ev=>{query=ev.target.value;const pos=ev.target.selectionStart;render();const replacement=$('#cshPurchaseReturnSearch');replacement.focus();replacement.setSelectionRange(pos,pos)};
    if($('#cshNewPurchaseReturn'))$('#cshNewPurchaseReturn').onclick=()=>cshPurchaseReturnModal(ctx,invoices,returnsList,variantsByItem,supplierMap,render);
  };
  render();
}
function cshPurchaseReturnModal(ctx,invoices,returnsList,variantsByItem,supplierMap,refresh){
  const purch=invoices.filter(x=>x.kind==='purchase'),parties=new Map(purch.map(x=>[String(x.party_id||''),supplierMap.get(String(x.party_id||''))?.name||x.suppliers?.name||x.supplier?.name||'']));
  const options=purch.map(i=>`<option value="${esc(ctx,i.id)}">${esc(ctx,i.invoice_number)} · ${esc(ctx,fmtDate(i.invoice_date))} · ${esc(ctx,parties.get(String(i.party_id||''))||i.custom_party_name||'Supplier')} · Due ${money(ctx,i.total_due)}</option>`).join('');
  const e=cshModal('Return variants to supplier','Select a posted purchase bill and return the exact size/color quantities received on it.',`<form id="cshPurchaseReturnForm" class="csh-form"><label class="csh-field">Original purchase invoice<select id="cshReturnInvoice" required><option value="">Choose a purchase bill</option>${options}</select></label><div id="cshReturnInvoiceInfo" class="csh-return-info">Choose the bill to see purchased, previously returned and currently available variant quantities.</div><div id="cshReturnLines">${cshEmpty('Purchase invoice lines will appear here.')}</div><div class="csh-return-total"><span id="cshPurchaseReturnCount">0 variants selected</span><span>Return value <b id="cshPurchaseReturnTotal">${money(ctx,0)}</b></span></div><div class="csh-form-grid">${cshField(ctx,'Return date','returnDate',localYmd(),{type:'date',required:true})}${cshField(ctx,'Reason','reason','',{required:true,placeholder:'Wrong size run, damaged delivery, excess stock…'})}${cshField(ctx,'Notes (optional)','notes','',{placeholder:'Supplier authorization, credit-note reference'})}</div><div class="csh-return-policy"><b>Current EMS behavior:</b> stock and unreturned bill quantities are validated on the server. The return reduces the source bill’s remaining due up to zero. If that bill has already been paid, no separate supplier refund/credit is initiated by EMS.</div><div class="csh-form-foot"><span>EMS rechecks source quantities and stock atomically when posted.</span><button id="cshPurchaseReturnSubmit" class="csh-btn csh-btn-primary" disabled>Post supplier return</button></div></form>`,true);
  const invSel=e.querySelector('#cshReturnInvoice'),lineBox=e.querySelector('#cshReturnLines'),info=e.querySelector('#cshReturnInvoiceInfo'),total=e.querySelector('#cshPurchaseReturnTotal'),count=e.querySelector('#cshPurchaseReturnCount'),submit=e.querySelector('#cshPurchaseReturnSubmit');
  const update=()=>{
    const inputs=[...e.querySelectorAll('[data-return-line]')],selected=inputs.filter(x=>Number(x.value||0)>0),amount=selected.reduce((n,x)=>n+Math.round(Number(x.value||0)*Number(x.dataset.returnPrice||0)*100)/100,0);
    count.textContent=`${selected.length} variant${selected.length===1?'':'s'} · ${selected.reduce((n,x)=>n+Number(x.value||0),0).toLocaleString()} units selected`;total.textContent=money(ctx,amount);submit.disabled=!invSel.value||!selected.length;
  };
  function draw(){
    const inv=purch.find(x=>x.id===invSel.value);if(!inv){lineBox.innerHTML=cshEmpty('Choose a purchase invoice to inspect its size/color lines.');info.textContent='Choose a bill to view purchased, previously returned and currently available quantities.';update();return}
    const returned={};for(const r of returnsList)if(r.purchase_invoice_id===inv.id)for(const it of r.items||[])returned[it.invoice_line_id]=(returned[it.invoice_line_id]||0)+Number(it.quantity||0);
    const lines=inv.invoice_lines||[];let unavailable=0;
    const rows=lines.map(l=>{
      const raw=l.inventory_items||{},variant=variantsByItem.get(String(l.item_id))||null,label=variant?variantName(variant):raw.description||'Clothing variant',sku=variant?skuOf(variant):raw.item_code||'—',used=Number(returned[l.id]||0),left=Math.max(0,Number(l.quantity||0)-used),stock=variant?stockOf(variant):Number(raw.total_stock),stockKnown=Boolean(variant||raw.total_stock!==undefined&&raw.total_stock!==null),max=stockKnown?Math.min(left,stock):left;
      if(!stockKnown)unavailable++;
      return `<tr><td><b>${esc(ctx,label)}</b><small class="csh-subcell"><code>${esc(ctx,sku)}</code> · ${esc(ctx,raw.unit||variant?.unit||'pcs')}</small></td><td>${Number(l.quantity||0)}</td><td>${used}</td><td>${left}</td><td>${stockKnown?stock:'Server check'}</td><td>${money(ctx,l.unit_price)}</td><td><input type="number" min="0" max="${max}" step="0.001" value="0" data-return-line="${esc(ctx,l.id)}" data-return-left="${max}" data-return-price="${Number(l.unit_price||0)}" ${max<=0?'disabled':''} aria-label="Return quantity for ${esc(ctx,label)}"></td></tr>`;
    });
    lineBox.innerHTML=cshTable(['Variant','Purchased','Previously returned','Still returnable','On hand','Unit cost','Return qty'],rows,'This purchase bill has no eligible Clothing variant lines.');
    const party=parties.get(String(inv.party_id||''))||inv.custom_party_name||'Supplier';info.innerHTML=`<b>${esc(ctx,inv.invoice_number)}</b><span>${esc(ctx,party)} · ${esc(ctx,fmtDate(inv.invoice_date))}</span><small>Bill due ${money(ctx,inv.total_due)} · ${lines.length} variant lines${unavailable?` · current stock validated when posted`:''}</small>`;
    e.querySelectorAll('[data-return-line]').forEach(input=>input.addEventListener('input',()=>{if(Number(input.value||0)>Number(input.max||0))input.value=input.max;update()}));update();
  }
  invSel.onchange=draw;
  e.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();const fd=new FormData(ev.target),items=[...e.querySelectorAll('[data-return-line]')].map(x=>({invoiceLineId:x.dataset.returnLine,quantity:Number(x.value||0)})).filter(x=>x.quantity>0);
    if(!items.length)return ctx.toast('Enter a return quantity for at least one exact variant.');
    for(const x of e.querySelectorAll('[data-return-line]'))if(Number(x.value||0)>Number(x.dataset.returnLeft))return ctx.toast('A return quantity exceeds the unreturned invoice quantity or available stock.');
    if(!String(fd.get('reason')||'').trim())return ctx.toast('Enter a supplier return reason.');
    try{
      await ctx.api('clothing/purchase-returns',{method:'POST',body:JSON.stringify({purchaseInvoiceId:invSel.value,returnDate:fd.get('returnDate'),reason:fd.get('reason'),notes:fd.get('notes'),items})});
      e.remove();ctx.toast('Supplier return posted; exact Clothing stock and the source bill balance were updated.');if(!ctx.isCurrent||ctx.isCurrent())refresh();
    }catch(err){ctx.toast(err.message)}
  };
}

export async function cshopReports(ctx){
  ctxFor(ctx);let period='month';
  const actions=`<div class="csh-periods">${[['day','Daily'],['week','Weekly'],['month','Monthly'],['year','Yearly']].map(([v,l])=>`<button type="button" data-report-period="${v}" class="${period===v?'on':''}">${l}</button>`).join('')}</div>`;
  $('#page').innerHTML=cshHeading('INSIGHTS','Clothing reports','Revenue, estimated gross profit, stock valuation, size/color demand, purchases, expenses and dues.',actions)+`<div class="csh-report-content">Loading clothing metrics…</div>`;
  const load=async()=>{
    const range=periodRange(period),d=await ctx.api(`clothing/overview?startDate=${range.startDate}&endDate=${range.endDate}&report=true`),box=$('.csh-report-content');
    if(ctx.isCurrent&&!ctx.isCurrent())return;
    box.innerHTML=`<div class="csh-range-note">${fmtDate(range.startDate)} — ${fmtDate(range.endDate)}</div><div class="csh-kpis">${cshCard('Sales revenue',money(ctx,d.salesRevenue),'Period revenue','receipt','rose')}${cshCard('Gross profit',money(ctx,d.grossProfit),'Estimated on sold variants','chart','plum')}${cshCard('Items sold',Number(d.itemsSold||0),'Net of returns','shopping-bag','green')}${cshCard('Stock value',money(ctx,d.stockValue),'Cost × current variant stock','package','blue')}${cshCard('Low-stock variants',d.lowStockCount||0,'Reorder threshold per variant','alert-triangle','amber')}</div><div class="csh-grid-two">${cshPanel('Sales & buying','Posted invoices inside the selected period.',cshTable(['Metric','Total'],[['Sales revenue',money(ctx,d.salesRevenue)],['Purchases',money(ctx,d.purchaseTotal)],['Expenses',money(ctx,d.expenseTotal)],['Customer dues',money(ctx,d.salesDue)],['Supplier dues',money(ctx,d.purchaseDue)],['Purchase returns',money(ctx,d.purchaseReturnsTotal)]].map(([a,b])=>`<tr><td>${a}</td><td><b>${b}</b></td></tr>`),'No transactions in this range.'))}${cshPanel('Best-selling styles','Ranked from item-level invoice lines.',cshTable(['Product','Units','Sales value','Gross profit'],(d.bestSellingProducts||[]).map(x=>`<tr><td><b>${esc(ctx,x.name)}</b><small class="csh-subcell">${esc(ctx,x.style_code||'')}</small></td><td>${Number(x.quantity||0)}</td><td>${money(ctx,x.revenue)}</td><td>${money(ctx,x.profit)}</td></tr>`),'No sales in this range.'))}</div><div class="csh-grid-two">${cshPanel('Best-selling sizes','Size demand, based on exact variants.',rankList(ctx,d.bestSellingSizes||[],'size'))}${cshPanel('Best-selling colors','Color demand, based on exact variants.',rankList(ctx,d.bestSellingColors||[],'color'))}</div><div class="csh-report-actions"><button type="button" id="cshReportCsv" class="csh-btn">Export CSV</button><button type="button" id="cshReportPrint" class="csh-btn">Print report</button></div>`;
    ctx.animateCshop?.();
    $('#cshReportCsv').onclick=()=>{
      const lines=[['Metric','Value'],['Start date',range.startDate],['End date',range.endDate],['Sales revenue',d.salesRevenue],['Gross profit',d.grossProfit],['Stock value',d.stockValue],['Items sold',d.itemsSold],['Low-stock variants',d.lowStockCount],['Purchases',d.purchaseTotal],['Expenses',d.expenseTotal],['Customer dues',d.salesDue],['Supplier dues',d.purchaseDue],[],['Best-selling products','Units','Sales','Profit'],...(d.bestSellingProducts||[]).map(x=>[x.name,x.quantity,x.revenue,x.profit]),[],['Best sizes','Units'],...(d.bestSellingSizes||[]).map(x=>[x.size,x.quantity]),[],['Best colors','Units'],...(d.bestSellingColors||[]).map(x=>[x.color,x.quantity])];
      const csv=lines.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`cshop-report-${range.startDate}-${range.endDate}.csv`;a.click();URL.revokeObjectURL(a.href);
    };
    $('#cshReportPrint').onclick=()=>window.print();
  };
  document.querySelectorAll('[data-report-period]').forEach(b=>b.onclick=()=>{period=b.dataset.reportPeriod;document.querySelectorAll('[data-report-period]').forEach(x=>x.classList.toggle('on',x===b));load().catch(e=>ctx.toast(e.message))});
  await load();
}

export async function cshopSettings(ctx){
  ctxFor(ctx);
  let profiles=await ctx.api('clothing/size-profiles');
  if(ctx.isCurrent&&!ctx.isCurrent())return;
  $('#page').innerHTML=cshHeading('CLOTHING SETTINGS','Sizing & units','Set size systems and custom size lists by product category. Garment measurements support centimeters or inches.')+
    `<div class="csh-grid-two"><section class="csh-panel"><header class="csh-panel-head"><div><h2>Size profiles</h2><p>New products can use these category-specific size lists.</p></div></header><div id="cshSizeProfiles">${renderProfiles(ctx,profiles)}</div></section><section class="csh-panel"><header class="csh-panel-head"><div><h2>New size profile</h2><p>Examples: alpha sizes, waist sizes, kids ages, shoe sizing or a custom numeric system.</p></div></header><form id="cshSizeProfileForm" class="csh-form"><label class="csh-field">Category<select name="category" required>${SIZE_CATEGORIES.map(x=>`<option>${esc(ctx,x)}</option>`).join('')}</select></label><label class="csh-field">Sizing system<select name="size_system">${SIZE_SYSTEMS.map(x=>`<option value="${x}">${x.replaceAll('-',' ')}</option>`).join('')}</select></label><label class="csh-field">Sizes, in display order<input name="sizes" required value="${DEFAULT_ALPHA.join(', ')}" placeholder="XS, S, M, L, XL"></label>${ctx.canAccess('inventory','edit')?'<button class="csh-btn csh-btn-primary">Save size profile</button>':'<button class="csh-btn csh-btn-primary" disabled>View only</button>'}</form></section></div><section class="csh-panel"><header class="csh-panel-head"><div><h2>Units & conversions</h2><p>On-hand stock is kept in the product's stock unit. Purchase entry converts the chosen purchase unit into that stock unit before posting an EMS invoice.</p></div></header><div class="csh-unit-grid">${STOCK_UNITS.map(u=>`<span><b>${u}</b><small>${u==='pcs'?'Ready-made pieces':u==='pair'?'Two-piece pairs':u==='set'?'Sets sold together':u==='dozen'?'12 units per dozen':u==='meter'?'Fabric length in metres':'Fabric length in yards'}</small></span>`).join('')}</div><p class="csh-hint">Example: a T-shirt stocked in pcs can be purchased by the dozen with a conversion of 12. Fabric should be stocked as meter or yard, never as pieces.</p></section>`;
  const bindDeletes=()=>document.querySelectorAll('[data-delete-profile]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this size profile?'))return;try{await ctx.api('clothing/size-profiles/'+b.dataset.deleteProfile,{method:'DELETE'});profiles=profiles.filter(x=>x.id!==b.dataset.deleteProfile);$('#cshSizeProfiles').innerHTML=renderProfiles(ctx,profiles);bindDeletes();ctx.toast('Size profile removed.')}catch(err){ctx.toast(err.message)}});
  bindDeletes();
  $('#cshSizeProfileForm').onsubmit=async ev=>{ev.preventDefault();if(!ctx.canAccess('inventory','edit'))return ctx.toast('Permission denied.');const fd=new FormData(ev.target),payload={category:fd.get('category'),size_system:fd.get('size_system'),sizes:fd.get('sizes').split(',').map(x=>x.trim()).filter(Boolean)};try{profiles=await ctx.api('clothing/size-profiles',{method:'POST',body:JSON.stringify(payload)});$('#cshSizeProfiles').innerHTML=renderProfiles(ctx,profiles);bindDeletes();ctx.toast('Size profile saved.')}catch(err){ctx.toast(err.message)}};
}
function renderProfiles(ctx,profiles){
  const rows=(profiles||[]).map(p=>`<article class="csh-profile"><div><b>${esc(ctx,p.category)}</b><small>${esc(ctx,(p.size_system||'custom').replaceAll('-',' '))}</small></div><span>${(p.sizes||[]).map(x=>`<i>${esc(ctx,x)}</i>`).join('')}</span>${ctx.canAccess('inventory','edit')?`<button type="button" data-delete-profile="${p.id}">Remove</button>`:''}</article>`).join('');
  return rows||cshEmpty('No custom profiles yet. XS–XXXL is the default alpha-size suggestion.');
}
