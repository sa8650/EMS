import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPharmacyAnalytics} from '../functions/_lib/pharmacy_reports.js';
import {reportCsv,reportXlsx} from '../assets/js/pharmacy_report_exports.js';
const period={from:'2026-10-01',to:'2026-10-31',previous:{from:'2026-09-01',to:'2026-09-30'}};
const base={...period,products:[{id:'p',name:'Medicine',category:'OTC',sku:'PH-1',base_unit:'tablet',total_stock:6,reorder_threshold:3,average_cost_base:4,active:true}],
 invoices:[{id:'sale',kind:'sale',invoice_date:'2026-10-10',invoice_number:'SAL-01',subtotal:100,tax_amount:0,discount:0,paid_amount:90,total_due:10}],
 lines:[{id:'line',invoice_id:'sale',quantity:10,line_total:100,cost_price:4}],extensions:[{invoice_line_id:'line',product_id:'p',quantity_base:10}],
 returns:[{id:'return',invoice_id:'sale',return_number:'RET-1',return_date:'2026-10-11',return_type:'return',amount:20,refund_amount:18}],
 returnItems:[{id:'ri',return_id:'return',invoice_line_id:'line',product_id:'p',quantity_base:2,amount:20,restocked:true,condition:'sellable'}],
 exchangeItems:[],supplierReturns:[],supplierLines:[],expenses:[{id:'exp',expense_date:'2026-10-11',details:'Rent',total:10,paid:10}],recoveries:[{id:'due',source_type:'sale',source_id:'sale',amount:5,created_at:'2026-10-12T00:00:00Z'}],
 movements:[],quarantineRows:[],quarantineUsed:[],oldCosts:[{invoice_line_id:'line',unit_cost_base:4}],batches:[],suppliers:[],customers:[]};

test('report recognizes refund, reversible COGS, expenses and due recovery without doubling sales',()=>{
 const data=buildPharmacyAnalytics(base);
 assert.equal(data.metrics.sales,100);assert.equal(data.metrics.refunds,18);assert.equal(data.metrics.netRevenue,82);
 assert.equal(data.metrics.cogs,32);assert.equal(data.metrics.grossProfit,50);assert.equal(data.metrics.netProfit,40);
 assert.equal(data.metrics.recovered,5);assert.equal(data.metrics.salesDue,10);assert.equal(data.metrics.stockValue,24);
 assert.equal(data.sections.salesReturns.length,1);assert.equal(data.sections.pnl.at(-1).amount,40);
 assert.equal(data.charts.find(x=>x.date==='2026-10-11').grossProfit,-10);
});

test('quarantined returns retain original sale COGS and are valued outside saleable inventory',()=>{
 const raw={...base,returnItems:[{...base.returnItems[0],restocked:false,condition:'damaged'}],quarantineRows:[{id:'ri',invoice_line_id:'line',product_id:'p',quantity_base:2,condition:'damaged',created_at:'2026-10-11'}]};
 const data=buildPharmacyAnalytics(raw);
 assert.equal(data.metrics.cogs,40);assert.equal(data.metrics.grossProfit,42);assert.equal(data.metrics.quarantineValue,8);
 assert.equal(data.metrics.stockValue,24);
 const sent={...raw,quarantineUsed:[{quarantine_item_id:'ri',quantity_base:1}]};assert.equal(buildPharmacyAnalytics(sent).metrics.quarantineValue,4);
});

test('real CSV and XLSX report exports escape spreadsheet formulas without network dependencies',async()=>{
 const csv=reportCsv(['Medicine','Value'],[['=HYPERLINK("x")',12.5],['Medicine, plus',-2]]);
 assert.match(csv,/"'=HYPERLINK\(""x""\)"/);assert.match(csv,/"Medicine, plus"/);
 const bytes=new Uint8Array(await reportXlsx(['Medicine','Value'],[['OTC',12.5]]).arrayBuffer());
 assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);
 assert.match(new TextDecoder().decode(bytes),/Pharmacy Report/);
});
