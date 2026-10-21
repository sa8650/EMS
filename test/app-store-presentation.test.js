import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {JSDOM} from 'jsdom';
import {mountAppStore} from '../assets/js/app_store_view.js';
import {ownerAppStoreRoutes} from '../functions/_lib/app_store_admin.js';
import {publicAppStoreRoutes} from '../functions/_lib/app_store.js';

function fixture(){
 const sql=new Database(':memory:');sql.exec(readFileSync(new URL('../supabase/d1/schema.sql',import.meta.url),'utf8'));
 const bucket={head:async(key)=>key.includes('/available.apk')?{size:123456}:null};
 const env={DB_DRIVER:'d1',APP_STORAGE:bucket,DB:{prepare(query){return{bind(...v){const values=v.map(x=>typeof x==='boolean'?Number(x):x),exec=()=>{const stmt=sql.prepare(query);return{success:true,results:stmt.reader?stmt.all(...values):(stmt.run(...values),[])}};return{async all(){return exec()},async run(){const r=sql.prepare(query).run(...values);return{meta:{changes:r.changes}}}}}}}}};
 const owner=(method='GET',body={},path='platform/app-store')=>ownerAppStoreRoutes({env,session:{role:'owner',id:'owner'},path,method,request:new Request('https://ems.test/api/'+path,{method,body:method==='GET'?undefined:JSON.stringify(body)}),audit:async()=>{}});
 const publicList=()=>publicAppStoreRoutes({env,path:'app-store/apps',method:'GET',request:new Request('https://ems.test/api/app-store/apps')});
 return{sql,owner,publicList};
}

test('D1 App Store metadata publishes only real releases, keeps hidden apps private, and rejects unsafe links',async()=>{
 const f=fixture();try{
  const payload={package_name:'com.ems.example',title:'Real release',description:'Released Android app',version:'2.0.0',version_code:20,apk_r2_key:'app-store/com.ems.example/available.apk',apk_size_bytes:123456,apk_filename:'real.apk',published:true,category:'Business tools',developer:'Dexter Studio',featured:true,web_url:'https://ems.test/app',screenshot_urls:['https://ems.test/shot.png']};
  const created=await f.owner('POST',payload);assert.equal(created.status,201,await created.clone().text());
  const rows=await (await f.publicList()).json();assert.equal(rows.length,2);assert.equal(rows[0].kind,'pwa');assert.equal(rows[1].download_url,'/api/app-store/download/com.ems.example');assert.equal(rows[1].category,'Business tools');assert.deepEqual(rows[1].screenshot_urls,['https://ems.test/shot.png']);assert.equal(rows[1].featured,true);
  const hidden=await f.owner('POST',{...payload,package_name:'com.ems.hidden',apk_r2_key:'',apk_url:'',published:false,featured:true});assert.equal(hidden.status,201,await hidden.clone().text());
  assert.equal((await (await f.publicList()).json()).length,2,'draft cannot appear as featured or public listing');
  const unsafe=await f.owner('POST',{...payload,package_name:'com.ems.unsafe',web_url:'javascript:alert(1)'});assert.equal(unsafe.status,400);
  const unsafeShot=await f.owner('POST',{...payload,package_name:'com.ems.unsafe',screenshot_urls:['data:image/svg+xml,<svg/>']});assert.equal(unsafeShot.status,400);
  const all=await (await f.owner()).json();assert.equal(all.length,2);assert.equal(all.find(x=>x.package_name==='com.ems.example').developer,'Dexter Studio');
 }finally{f.sql.close()}
});

test('Shared App Store filters real apps, opens matching modal, hides unavailable downloads, inherits EMS theme and supports keyboard close',()=>{
 const dom=new JSDOM('<!doctype html><div id="page"></div>',{url:'https://ems.test/',pretendToBeVisual:true});
 const old={document:globalThis.document,location:globalThis.location};globalThis.document=dom.window.document;globalThis.location=dom.window.location;
 try{
  const apps=[{id:'1',package_name:'com.ems.one',title:'One & Only',category:'Business tools',developer:'Dexter Studio',featured:true,version:'2.0.0',download_available:true,download_url:'/api/app-store/download/com.ems.one',apk_filename:'one.apk',web_url:'https://ems.test/one',screenshot_urls:['https://ems.test/image.png'],description:'Inventory'}, {id:'2',package_name:'com.ems.two',title:'Private draft',category:'Utility',download_available:false,web_url:'javascript:alert(1)',description:'Unavailable'}];
  mountAppStore(document.querySelector('#page'),apps,{brand:'Dexter Studio'});
  assert.equal(document.querySelectorAll('.as-card').length,2);assert.equal(document.querySelectorAll('.as-feature').length,1);
  assert.equal(document.querySelector('.as-page-head'),null,'the site/console already owns the App Store heading');
  assert.equal(document.querySelector('.as-hero .as-search input')?.getAttribute('type'),'text','one clean search input lives in the hero');
  assert.doesNotMatch(document.querySelector('.ems-store').textContent,/Official EMS releases for your shop|EMS · APPS & TOOLS/);
  assert.equal(document.querySelectorAll('.as-card')[1].querySelector('a'),null,'unavailable app has no fabricated link');
  document.querySelector('.as-search input').value='One';document.querySelector('.as-search input').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(document.querySelectorAll('.as-card').length,1);assert.equal(document.querySelector('.as-count').textContent,'1 app');
  document.querySelector('.as-card').click();assert.equal(document.querySelector('.as-modal').hidden,false);assert.match(document.querySelector('.as-sheet').textContent,/App information/);
  assert.equal(document.querySelectorAll('.as-shots img').length,1);assert.equal(document.querySelector('.as-sheet a[href^="/api/app-store/download"]')?.getAttribute('href'),'/api/app-store/download/com.ems.one');
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector('.as-modal').hidden,true);
  assert.equal(document.querySelector('.as-theme'),null,'App Store has no independent theme control');
  document.body.classList.add('adm-on','adm-dark');assert.equal(document.querySelector('.ems-store').dataset.theme,undefined,'EMS console owns the theme');
  assert.match(readFileSync(new URL('../assets/css/app_store_view.css',import.meta.url),'utf8'),/body\.adm-on \.ems-store/);
  document.querySelector('.as-search input').value='none';document.querySelector('.as-search input').dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(document.querySelector('.as-empty').hidden,false);
 }finally{globalThis.document=old.document;globalThis.location=old.location;dom.window.close()}
});

test('D1 presentation migration upgrades an existing App Store without replacing APK data',()=>{
 const sql=new Database(':memory:');try{
  sql.exec(readFileSync(new URL('../supabase/d1/migration_app_store.sql',import.meta.url),'utf8'));
  sql.exec("INSERT INTO app_store_apps(id,package_name,title,version_code,apk_url) VALUES('one','com.ems.old','Old app',9,'https://ems.test/old.apk')");
  sql.exec(readFileSync(new URL('../supabase/d1/migration_app_store_presentation.sql',import.meta.url),'utf8'));
  const row=sql.prepare("SELECT * FROM app_store_apps WHERE id='one'").get();
  assert.equal(row.apk_url,'https://ems.test/old.apk');assert.equal(row.version_code,9);
  assert.equal(row.category,'EMS applications');assert.equal(row.featured,0);assert.equal(row.screenshot_urls,'[]');
 }finally{sql.close()}
});

test('Owner manager exposes curation, search, category filters and same storefront preview without removing release tools',()=>{
 const src=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
 const start=src.indexOf('async function ownerAppStore()'),end=src.indexOf('function appModal(',start);
 const manager=src.slice(start,end),editor=src.slice(end,src.indexOf('function ownerConnectX',end)>end?src.indexOf('function ownerConnectX',end):undefined);
 for(const part of ['ownerStoreSearch','data-owner-category','data-feature-edit','ownerStorePreview','mountAppStore','data-app-edit','data-app-delete','addNewAppBtn'])assert.ok(manager.includes(part),part);
 for(const part of ['name="category"','name="developer"','name="web_url"','name="screenshot_urls"','name="featured"','appApkFile','appIconFile','release_notes'])assert.ok(editor.includes(part),part);
});
