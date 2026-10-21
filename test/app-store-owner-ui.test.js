import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountAppStore} from '../assets/js/app_store_view.js';

const src=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const renderSource=src.slice(src.indexOf('async function ownerAppStore(){'),src.indexOf('function appModal(',src.indexOf('async function ownerAppStore(){')));
const apps=[
 {id:'1',package_name:'com.ems.connectx',title:'ConnectX',version:'2.0',version_code:2,category:'Communication',developer:'Dexter Studio',description:'Verified service',published:true,download_available:true,featured:true,mandatory:false,apk_size_bytes:200000,apk_r2_key:'release/connectx.apk'},
 {id:'2',package_name:'com.ems.test',title:'Internal tool',version:'1.0',version_code:1,category:'Utility',description:'Not yet available',published:false,download_available:false}
];
function setup(){
 const dom=new JSDOM('<!doctype html><main class="ob"><div id="page"></div></main>',{url:'https://ems.test/'}),prior={document:globalThis.document,location:globalThis.location};
 globalThis.document=dom.window.document;globalThis.location=dom.window.location;
 const $=sel=>dom.window.document.querySelector(sel);
 const build=new Function('api','obHead','obBadge','getOwnerAppIconHtml','obEmpty','lucide','esc','$','mountAppStore','getQrSvg','appModal','toast','confirm',renderSource+'\nreturn ownerAppStore;');
 let edits=[];
 const render=build(async path=>path==='platform/app-store'?apps:apps.filter(x=>x.published),(_p,_sub,action)=>`<div class="ob-head-actions">${action}</div>`,t=>`<span class="ob-badge">${t}</span>`,()=>'<span class="app-icon">◆</span>',t=>t,()=>'',v=>String(v??'').replace(/[&<>"']/g,''),$,mountAppStore,()=>'',x=>edits.push(x),()=>{},()=>true);
 return{dom,$,render,edits,close(){globalThis.document=prior.document;globalThis.location=prior.location;dom.window.close()}};
}
test('Owner release manager keeps edit, delete, signed download, preview, filtering and featured controls in compact rows',async()=>{
 const f=setup();try{
  await f.render();assert.equal(f.dom.window.document.querySelectorAll('.ob-store-release').length,2);
  assert.equal(f.dom.window.document.querySelectorAll('.ob-grid.ob-kpis').length,0,'old KPI grid removed');
  assert.ok(f.$('[data-app-edit="1"]'));assert.ok(f.$('[data-app-delete="1"]'));
  assert.ok(f.$('a[href="/api/app-store/download/com.ems.connectx"]'));
  f.$('#ownerStoreSearch').value='internal';f.$('#ownerStoreSearch').dispatchEvent(new f.dom.window.Event('input'));
  assert.equal(f.$('#ownerStoreCount').textContent,'1 app');assert.equal(f.$('[data-owner-app-index="0"]').hidden,true);
  f.$('#ownerStoreClear').click();f.$('[data-feature-edit="1"]').click();assert.equal(f.edits[0].id,'1');
  f.$('[data-owner-store-view="preview"]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(f.$('#ownerStorePreview .as-hero'));assert.equal(f.$('#ownerStorePreview').hidden,false);
  f.$('[data-owner-store-view="manage"]').click();assert.equal(f.$('#ownerStoreManage').hidden,false);
 }finally{f.close()}
});
