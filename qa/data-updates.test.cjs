'use strict';
/* Behavior tests for source revalidation, not screenshots or implementation mirrors. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/data-updates.js'), 'utf8');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/current.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const waitMicrotasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(overrides = {}) {
  let clock = Date.parse('2026-10-02T04:00:00Z'), nextTimer = 1;
  const timers = new Map(), requests = [], statuses = [], updates = [], streams = [];
  const window = new EventTarget(), document = new EventTarget();
  document.baseURI = 'http://localhost/project-dollers/'; document.hidden = false;
  const navigator = { onLine: true };
  let snapshot = clone(base), handle;
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  class FakeEventSource {
    constructor(url) { this.url = url; this.closed = false; streams.push(this); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    message(value, id = '') { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value), lastEventId: id }); }
  }
  const sandbox = {
    window, document, navigator, location: new URL(document.baseURI), URL, EventSource: FakeEventSource,
    Date: FakeDate, AbortController, console,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => { requests.push({ url, options }); return handle(url, options); }
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const response = (value = snapshot, status = 200, etag = 'test-version') => ({ status, ok: status >= 200 && status < 300, headers: { get: key => key === 'ETag' ? etag : null }, json: async () => clone(value) });
  handle = async () => response();
  const controller = window.PDDataUpdates.start({
    getSnapshot: () => snapshot,
    onSnapshot: async value => { updates.push(value); snapshot = value; },
    onStatus: value => statuses.push(value),
    checkOnStart: false,
    minIntervalMs: 1000, activeIntervalMs: 2000, timeoutMs: 1000,
    ...overrides
  });
  return { window, document, navigator, controller, requests, statuses, updates, streams, timers, response,
    setHandle(fn) { handle = fn; }, snapshot: () => snapshot,
    async advance(ms) { clock += ms; const due = [...timers.entries()].filter(([, timer]) => timer.at <= clock); for (const [id, timer] of due) { if (timers.delete(id)) timer.fn(); } await waitMicrotasks(); },
    async event(target, type) { target.dispatchEvent(new Event(type)); await waitMicrotasks(); },
    cleanup() { controller.stop(); }
  };
}
(async () => {
  let tests = 0;
  {
    const h = harness();
    assert.equal(h.requests.length, 0, 'initial app load need not immediately duplicate its JSON request');
    await h.controller.refresh(); assert.equal(h.updates.length, 0, 'unchanged JSON must not redraw selected controls');
    assert.equal(h.controller.getStatus().state, 'unchanged');
    h.setHandle(async () => h.response(null, 304));
    await h.controller.refresh(); assert.equal(h.requests[1].options.headers['If-None-Match'], 'test-version');
    assert.equal(h.updates.length, 0, '304 retains last good data');
    h.cleanup(); tests++;
  }
  {
    const h = harness(); const newer = clone(base); newer.retrievedAt = '2026-10-02T03:01:00Z';
    newer.roster[0].seasonStats.rushingYards = 42;
    h.setHandle(async () => h.response(newer, 200, 'new'));
    await h.controller.refresh(); assert.equal(h.updates.length, 1); assert.equal(h.snapshot().roster[0].seasonStats.rushingYards, 42);
    h.setHandle(async () => h.response(base));
    assert.equal((await h.controller.refresh()).state, 'error'); assert.equal(h.snapshot().retrievedAt, newer.retrievedAt, 'older feeds cannot replace newer verified data');
    h.setHandle(async () => h.response({ schemaVersion: 1 }));
    assert.equal((await h.controller.refresh()).state, 'error'); assert.equal(h.updates.length, 1, 'invalid schema retains the last complete data');
    const invalidPanels = clone(newer); delete invalidPanels.steelers.record;
    h.setHandle(async () => h.response(invalidPanels));
    assert.equal((await h.controller.refresh()).state, 'error'); assert.equal(h.updates.length, 1, 'incomplete nested panels never reach the UI callback');
    h.setHandle(async () => h.response(null, 503));
    assert.equal((await h.controller.refresh()).state, 'error'); assert.equal(h.snapshot().retrievedAt, newer.retrievedAt, 'HTTP failures retain good data');
    h.cleanup(); tests++;
  }
  {
    const h = harness(); let complete;
    h.setHandle(() => new Promise(resolve => { complete = resolve; }));
    const a = h.controller.refresh(), b = h.controller.refresh();
    assert.equal(a, b, 'manual refreshes share one in-flight request'); assert.equal(h.requests.length, 1);
    complete(h.response()); await a;
    await h.event(h.window, 'focus'); await h.event(h.window, 'pageshow');
    assert.equal(h.requests.length, 1, 'focus/pageshow bursts do not duplicate requests');
    h.cleanup(); tests++;
  }
  {
    const h = harness();
    h.document.hidden = true; await h.event(h.document, 'visibilitychange'); await h.advance(5000);
    assert.equal(h.requests.length, 0, 'hidden page has no timer polling');
    h.document.hidden = false; await h.event(h.document, 'visibilitychange');
    assert.equal(h.requests.length, 1, 'returning to visible page checks for newly published data');
    h.navigator.onLine = false; await h.event(h.window, 'offline'); await h.advance(5000);
    assert.equal(h.requests.length, 1, 'offline page has no timer polling');
    h.navigator.onLine = true; await h.event(h.window, 'online');
    assert.equal(h.requests.length, 2, 'reconnect revalidates immediately');
    await h.advance(2000); assert.equal(h.requests.length, 3, 'active fallback checks while visible/online');
    h.cleanup(); tests++;
  }
  {
    const h = harness();
    h.setHandle(async () => h.response(null, 503)); await h.controller.refresh();
    assert.equal(h.controller.getStatus().state, 'error');
    await h.advance(2000); assert.equal(h.requests.length, 1, 'failed check backs off instead of frequent repeated requests');
    await h.event(h.window, 'focus'); assert.equal(h.requests.length, 1, 'focus respects error backoff');
    await h.advance(2000); assert.equal(h.requests.length, 2, 'backoff eventually retries');
    h.setHandle(async () => h.response()); await h.controller.refresh();
    assert.equal(h.controller.getStatus().state, 'unchanged', 'user refresh bypasses backoff and can recover');
    h.cleanup(); tests++;
  }
  {
    const h = harness();
    h.setHandle((url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('Aborted'); error.name = 'AbortError'; reject(error); })));
    const pending = h.controller.refresh(); await h.advance(1000); const result = await pending;
    assert.equal(result.state, 'error'); assert.match(result.message, /timed out/); assert.equal(h.updates.length, 0);
    h.cleanup(); tests++;
  }
  {
    const h = harness({ streamUrl: 'https://authorized-provider.example/notifications' });
    assert.equal(h.streams.length, 1); assert.equal(h.controller.getStatus().streamState, 'connecting');
    const s = h.streams[0]; s.open(); assert.equal(h.controller.getStatus().streamState, 'connected');
    s.message('not JSON'); s.message({ type: 'snapshot', snapshot: base }); s.message({ type: 'dataChanged', retrievedAt: 'invalid' });
    await waitMicrotasks(); assert.equal(h.requests.length, 0, 'unrecognized stream data never substitutes arbitrary statistics');
    s.message({ type: 'dataChanged' }, 'notification1'); await waitMicrotasks();
    assert.equal(h.requests.length, 1, 'valid provider event immediately revalidates same-origin verified data');
    s.message({ type: 'dataChanged' }, 'notification1'); await waitMicrotasks(); assert.equal(h.requests.length, 1, 'duplicate notification ID ignored');
    let complete;
    h.setHandle(() => new Promise(resolve => { complete = resolve; }));
    const pending = h.controller.refresh();
    s.message({ type: 'dataChanged' }, 'notification2');
    assert.equal(h.requests.length, 2, 'provider notifications share existing request');
    h.setHandle(async () => h.response()); complete(h.response()); await pending; await waitMicrotasks();
    assert.equal(h.requests.length, 3, 'a notification arriving during an old check queues a fresh follow-up');
    h.document.hidden = true; await h.event(h.document, 'visibilitychange'); assert.equal(s.closed, true);
    s.open(); assert.equal(h.controller.getStatus().streamState, 'paused', 'stale closed stream cannot report connected');
    h.document.hidden = false; await h.event(h.document, 'visibilitychange'); assert.equal(h.streams.length, 2);
    h.cleanup(); assert.equal(h.streams[1].closed, true); tests++;
  }
  {
    const h = harness(); assert.equal(h.streams.length, 0, 'no configured provider means no external stream request');
    h.cleanup(); await h.event(h.window, 'focus'); await h.advance(5000);
    assert.equal(h.requests.length, 0, 'stop removes all listeners and timers'); tests++;
  }
  console.log(`PASS: ${tests} automatic-update behavior groups (events, unchanged/304, provenance, rollback, single-flight, pause, reconnect, backoff, timeout, optional stream).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
