import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
test('shop SMS Gateway contains Compose, History and Settings and retains the SMS settings API',()=>{
 for(const tab of ['compose','history','settings'])assert.ok(app.includes(`data-sms-tab="${tab}"`),tab);
 assert.ok(app.includes("renderConnectXSmsSettings($('#connectxSmsContent'))"));
 assert.ok(app.includes("api('shop/sms-settings',{method:'PATCH'"));
 assert.ok(!app.includes('data-setting-tab="sms"'),'shop Settings should not duplicate the moved SMS tab');
 assert.ok(app.includes('data-setting-tab="store"'),'other shop settings remain');
});
test('shop Email has its own Settings tab, no attachment HTML editor, and retains real document choices',()=>{
 assert.ok(app.includes('data-cx-tab="settings"'));
 assert.ok(app.includes("api('connectx/email-settings',{method:'PATCH'"));
 for(const kind of ['sale','purchase','payment','due_reminder','return','exchange','refund']){
  assert.ok(app.includes(`value="${kind}"`),kind+' document option');
  assert.ok(!app.includes('data-cx-template='),'document template editor removed');
 }
 assert.ok(app.includes('state.connectxEmailEnabled'),'email toggle separate from SMS entitlement');
});

test('administrator ConnectX page and shop-toggle route are removed; shop controls SMS switch',()=>{
 const backend=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 assert.ok(!app.includes('adminConnectX('));
 assert.ok(!app.includes("['connectx','ConnectX','mail'],['licenses'"));
 assert.ok(!backend.includes("path==='admin/connectx/overview'"));
 assert.ok(!backend.includes("path.startsWith('admin/connectx/shop/')"));
 assert.ok(app.includes('id="smsEnabled"'));
 assert.ok(app.includes("enabled:el.querySelector('#smsEnabled')?.checked===true"));
});
