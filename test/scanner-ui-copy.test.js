import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Toaster, esc, money, shortId, eventState, LINK_LABEL, tile, empty} from '../scanner/ui.js';

/* The scanner's voice and its toasts.
 *
 * The UI brief was blunt: better toasts, and none of the leftover explanatory
 * sub-copy. These tests hold that line, because copy and toast behaviour are
 * exactly what a later "small tweak" quietly puts back. */

/* Toaster uses the global document/requestAnimationFrame, exactly as it does in
 * the app, so the test provides them the same way the browser would. */
const dom = () => {
  const window = new JSDOM('<!doctype html><div id="toast"></div>').window;
  globalThis.document = window.document;
  globalThis.requestAnimationFrame = callback => { callback(0); return 0; };
  return {window, host: window.document.getElementById('toast')};
};

test('a repeated message replaces its own toast instead of stacking copies', () => {
  const {window, host} = dom();
  const toaster = new Toaster(host);
  toaster.ok('Sent to the PC', {topic: 'send'});
  toaster.ok('Sent to the PC', {topic: 'send'});
  toaster.ok('Sent to the PC', {topic: 'send'});
  assert.equal(host.children.length, 1, 'one topic, one toast');
  toaster.ok('Second item sent', {topic: 'send'});
  assert.equal(host.children.length, 1);
  assert.equal(host.querySelector('.toast-text').textContent, 'Second item sent');
  toaster.clear();
  window.close();
});

test('toasts cap at three and announce errors assertively', () => {
  const {window, host} = dom();
  const toaster = new Toaster(host);
  for (const topic of ['a', 'b', 'c', 'd', 'e']) toaster.ok(topic, {topic});
  assert.ok(host.children.length <= 3, 'the stack never covers the camera preview');
  const other = new Toaster(host);
  const bad = other.bad('Not sent', {topic: 'x'});
  assert.equal(bad.getAttribute('role'), 'alert');
  toaster.clear();
  other.clear();
  window.close();
});

test('a toast can be dismissed by the operator and carries no markup', () => {
  const {window, host} = dom();
  const toaster = new Toaster(host);
  const el = toaster.bad('<b>Not sent</b>', {topic: 'send'});
  assert.equal(el.querySelector('.toast-text').textContent, '<b>Not sent</b>');
  assert.equal(el.querySelector('.toast-text').children.length, 0, 'message text is never parsed as HTML');
  el.querySelector('.toast-close').click();
  toaster.clear();
  window.close();
});

test('empty messages are dropped rather than shown as a blank bubble', () => {
  const {window, host} = dom();
  const toaster = new Toaster(host);
  assert.equal(toaster.show('   '), null);
  assert.equal(toaster.show(''), null);
  assert.equal(host.children.length, 0);
  toaster.clear();
  window.close();
});

test('everything interpolated into markup is escaped', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(`O'Brien & Sons`), 'O&#39;Brien &amp; Sons');
  assert.equal(esc(null), '');
  const markup = tile({title: '<script>x</script>', note: 'a & b'});
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.equal(empty({text: '<b>'}).includes('<b>'), false);
});

test('money and ids render the same way the rest of EMS renders them', () => {
  assert.match(money(1250), /1,250\.00/);
  assert.equal(money(undefined), '—');
  assert.equal(money('not a number'), '—');
  assert.equal(shortId('aaaaaaaa-bbbb-cccc'), 'AAAAAAAA');
  assert.equal(shortId(null), '');
});

test('every scan state has one agreed label, so the list and the toast cannot disagree', () => {
  const statuses = ['sending', 'pending', 'applied', 'rejected', 'error'];
  for (const status of statuses) {
    const state = eventState(status);
    assert.ok(state.label && state.tone, status);
    assert.ok(!/[.!]$/.test(state.label), `${status} label is a fragment, not a sentence`);
  }
  assert.equal(eventState('applied').tone, 'ok');
  assert.equal(eventState('rejected').tone, 'bad');
  assert.equal(eventState('nonsense').label, 'Unknown', 'an unexpected server value degrades safely');
  for (const [key, value] of Object.entries(LINK_LABEL)) assert.ok(value.text, key);
});
