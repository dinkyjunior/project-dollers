'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Execute the shipping route functions without starting network polling. These
// are logic checks; the separate native-browser suites verify actual clicks.
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const routes = source.slice(source.indexOf('  function openPage('), source.indexOf('  function selectTab('));
assert.ok(routes.includes('function openGameReport('), 'Shipping game-report helper must be present');
let activePage = 'nfl';
const pushes = [], calls = [], events = [];
const pages = ['home', 'nfl', 'steelers', 'team-details', 'matchup-breakdown', 'game-report'].map(id => ({
  dataset:{page:id}, hidden:id !== activePage,
  scroll:{scrollTop:123},
  classList:{toggle(name, active) { if (name === 'active' && active) activePage = id; }},
  querySelector() { return this.scroll; }
}));
const context = {
  pages, URLSearchParams,
  location:{hash:'#nfl'},
  history:{pushState(a, b, value) { pushes.push(value); context.location.hash = value; }},
  document:{
    querySelector() { return pages.find(page => page.dataset.page === activePage); },
    querySelectorAll() { return []; },
    dispatchEvent(event) { events.push(event.detail.page); }
  },
  CustomEvent:class { constructor(name, options) { this.name = name; this.detail = options.detail; } },
  window:{
    PDTeamDetails:{route(value) { calls.push(['team', value]); }},
    MatchupBreakdown:{route(value) { calls.push(['matchup', value]); }},
    PDGameReport:{route(value) { calls.push(['report', value]); }}
  }
};
vm.createContext(context);
vm.runInContext(routes, context);
const results = [];
function check(name, fn) { fn(); results.push({name, passed:true}); }
const query = () => new URLSearchParams(context.location.hash.split('?')[1] || '');

check('Report keeps exact event and encoded matchup filter context', () => {
  const origin = 'matchup/DAL?tab=form&game=401872980&venue=away&window=10&mode=average';
  assert.equal(context.openGameReport('tb', '2025_18_TB_DAL', 'box', origin), true);
  assert.equal(activePage, 'game-report');
  assert.equal(query().get('team'), 'TB');
  assert.equal(query().get('game'), '2025_18_TB_DAL');
  assert.equal(query().get('tab'), 'box');
  assert.equal(query().get('return'), origin);
  assert.equal(calls.at(-1)[0], 'report');
  assert.equal(calls.at(-1)[1], context.location.hash.slice(1));
});
check('Direct numeric ESPN alias remains exact and unknown tab defaults to Overview', () => {
  context.openGameReport('DAL', '401872967', 'not-a-tab', 'team/DAL?tab=lineup');
  assert.equal(query().get('game'), '401872967');
  assert.equal(query().get('tab'), 'overview');
  assert.equal(query().get('return'), 'team/DAL?tab=lineup');
});
check('External, malformed and unsupported return destinations stay within team research', () => {
  for (const value of ['https://example.com', '//example.com', 'javascript:alert(1)', 'team/DALevil', 'matchup/../../home', 'game-report?return=https%3A%2F%2Fexample.com']) {
    context.openGameReport('DAL', '2026_04_DAL_HOU', 'overview', value);
    assert.equal(query().get('return'), 'team/DAL', value);
  }
});
check('Legacy team-report deep link does not create a Back reopen loop', () => {
  context.openGameReport('DAL', '2026_04_DAL_HOU', 'overview', 'team/DAL?tab=form&view=report&game=2026_04_DAL_HOU');
  assert.equal(query().get('return'), 'team/DAL?tab=form');
});
check('A second report preserves original return context instead of nesting reports', () => {
  const original = 'matchup/DAL?tab=form&game=401872980';
  context.openGameReport('DAL', '2026_04_DAL_HOU', 'overview', original);
  context.openGameReport('DAL', '2026_03_BAL_DAL', 'plays');
  assert.equal(query().get('return'), original);
});
check('Missing game and malformed team never mutate the current route', () => {
  const before = context.location.hash, count = pushes.length;
  assert.equal(context.openGameReport('DAL', ''), false);
  assert.equal(context.openGameReport('DAL<script>', '401872967'), false);
  assert.equal(context.location.hash, before);
  assert.equal(pushes.length, count);
});
check('Every implemented report tab and legitimate Home/NFL/Steelers return stays intact', () => {
  for (const tab of ['overview','box','drives','plays']) for (const origin of ['home','nfl','steelers']) {
    context.openGameReport('PIT', '2026_04_PIT_IND', tab, origin);
    assert.equal(query().get('tab'), tab);
    assert.equal(query().get('return'), origin);
  }
});
check('Back/forward report dispatch does not add history entries', () => {
  const count = pushes.length, route = 'game-report?team=DAL&game=2026_04_DAL_HOU&tab=drives';
  context.location.hash = `#${route}`;
  context.openPage(route, false);
  assert.equal(pushes.length, count);
  assert.equal(calls.at(-1)[1], route);
  assert.equal(events.at(-1), 'game-report');
});
check('Report aliases dispatch to the report controller and only the matching page is visible', () => {
  context.openPage('game-report/DAL?game=401872967');
  assert.equal(calls.at(-1)[0], 'report');
  assert.equal(pages.filter(page => !page.hidden).length, 1);
  assert.equal(pages.find(page => !page.hidden).dataset.page, 'game-report');
});
check('A legacy team redirect emits the actual report route without a stale team event', () => {
  const original = context.window.PDTeamDetails.route;
  context.window.PDTeamDetails.route = () => context.openGameReport('DAL','2026_04_DAL_HOU');
  context.openPage('team/DAL?view=report&game=2026_04_DAL_HOU',false);
  assert.equal(activePage, 'game-report');
  assert.equal(events.at(-1), 'game-report');
  context.window.PDTeamDetails.route = original;
});
check('Unknown unrelated routes retain the existing safe Home fallback', () => {
  context.openPage('https://example.com');
  assert.equal(activePage, 'home');
  assert.equal(context.location.hash, '#home');
});

const receipt = {scope:'Shipping route logic only; not a substitute for native-browser QA', checkedAt:new Date().toISOString(), checks:results, passed:results.every(row => row.passed)};
fs.writeFileSync(path.join(__dirname, 'route-contract.json'), `${JSON.stringify(receipt,null,2)}\n`);
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
