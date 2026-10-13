const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../../..');
const current = fs.readFileSync(path.join(root, 'assets/matchup-breakdown.js'), 'utf8');
const original = fs.readFileSync(path.join(__dirname, 'before-matchup-breakdown.js'), 'utf8');

function runtime(source, hash = '#nfl', activePage = 'nfl') {
  const functions = source.slice(source.indexOf('  function writeRoute()'), source.indexOf('  async function refresh('));
  const routes = [];
  const sandbox = {
    URLSearchParams,
    state: { team: 'DAL', tab: 'players', window: 5, season: 'cross', venue: 'all', mode: 'total', qb: 'last5', player: null, kind: 'receiving', game: null, returnRoute: 'team/DAL', fromLadder: false },
    location: { hash },
    document: { querySelector: () => ({ dataset: { page: activePage } }) },
    window: { PDTeamDetails: { getState: () => ({ fromLadder: true }) }, PDApp: {} },
    history: { replaceState: (_state, _title, value) => { sandbox.location.hash = value; } },
    render: () => {},
    refresh: () => Promise.resolve(),
  };
  sandbox.window.PDApp.openPage = route => { routes.push(route); sandbox.location.hash = `#${route}`; sandbox.route(route); };
  vm.createContext(sandbox);
  vm.runInContext(functions, sandbox);
  return { sandbox, routes };
}

const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, passed: true }); };
for (const origin of [{ hash: '#nfl', page: 'nfl' }, { hash: '#team/DAL?tab=form', page: 'team-details' }, { hash: '#team/TB', page: 'team-details' }]) {
  for (const args of [['DAL', '2026_06_DAL_GB', 'players'], ['PIT', '2026_06_PIT_TB', 'form']]) {
    check(`Legacy three-argument behavior: ${origin.hash} / ${args[0]} / ${args[2]}`, () => {
      const before = runtime(original, origin.hash, origin.page), after = runtime(current, origin.hash, origin.page);
      before.sandbox.enter(...args); after.sandbox.enter(...args);
      assert.deepEqual(after.routes, before.routes);
      assert.deepEqual(JSON.parse(JSON.stringify(after.sandbox.state)), JSON.parse(JSON.stringify(before.sandbox.state)));
    });
  }
}
check('NFL override preserves selected team/game/tab and marks ladder origin', () => {
  const r = runtime(current);
  r.sandbox.enter('pit', '2026_06_PIT_TB', 'form', 'nfl');
  const route = r.routes.at(-1), query = new URLSearchParams(route.split('?')[1]);
  assert.equal(route.split('?')[0], 'matchup/PIT'); assert.equal(query.get('game'), '2026_06_PIT_TB');
  assert.equal(query.get('tab'), 'form'); assert.equal(query.get('return'), 'nfl');
  assert.equal(r.sandbox.state.returnRoute, 'nfl'); assert.equal(r.sandbox.state.fromLadder, true);
});
check('Fresh direct matchup URL restores NFL return state', () => {
  const r = runtime(current, '#home', 'home');
  r.sandbox.route('matchup/BUF?game=2026_05_BUF_LA&return=nfl');
  assert.equal(r.sandbox.state.returnRoute, 'nfl'); assert.equal(r.sandbox.state.fromLadder, true);
  assert.equal(r.sandbox.state.game, '2026_05_BUF_LA');
});
check('Research tab/filter URL writes retain NFL return', () => {
  const r = runtime(current); r.sandbox.enter('PIT', '2026_06_PIT_TB', 'players', 'nfl');
  r.sandbox.state.tab = 'lineup'; r.sandbox.state.window = 3; r.sandbox.writeRoute();
  const query = new URLSearchParams(r.sandbox.location.hash.split('?')[1]);
  assert.equal(query.get('return'), 'nfl'); assert.equal(query.get('tab'), 'lineup'); assert.equal(query.get('window'), '3');
  assert.equal(query.get('game'), '2026_06_PIT_TB');
});
check('Return override does not leak into subsequent same-team URL', () => {
  const r = runtime(current); r.sandbox.enter('PIT', '2026_06_PIT_TB', 'players', 'nfl');
  r.sandbox.route('matchup/PIT?game=2026_07_PIT_JAX');
  assert.equal(r.sandbox.state.returnRoute, 'team/PIT'); assert.equal(r.sandbox.state.fromLadder, false);
});
for (const unsafe of ['https://example.com', 'home', 'team/TB', 'NFL', 'nfl\n']) {
  check(`Unsupported URL return rejected: ${JSON.stringify(unsafe)}`, () => {
    const r = runtime(current); r.sandbox.enter('PIT', '2026_06_PIT_TB', 'players', 'nfl');
    r.sandbox.route(`matchup/PIT?game=2026_06_PIT_TB&return=${encodeURIComponent(unsafe)}`);
    assert.equal(r.sandbox.state.returnRoute, 'team/PIT'); assert.equal(r.sandbox.state.fromLadder, false);
    r.sandbox.writeRoute(); assert.equal(new URLSearchParams(r.sandbox.location.hash.split('?')[1]).get('return'), null);
  });
}
check('Unsupported fourth argument retains legacy team origin', () => {
  const r = runtime(current, '#team/DAL?tab=form', 'team-details');
  r.sandbox.enter('DAL', '2026_06_DAL_GB', 'players', 'https://example.com');
  assert.equal(r.sandbox.state.returnRoute, 'team/DAL?tab=form');
  assert.equal(new URLSearchParams(r.routes.at(-1).split('?')[1]).get('return'), null);
});

const receipt = {
  scope: 'Targeted optional NFL matchup return routing; no source-data or statistics logic edits',
  beforeSha256: crypto.createHash('sha256').update(original).digest('hex'),
  afterSha256: crypto.createHash('sha256').update(current).digest('hex'),
  checks,
  passed: true,
  browserVerification: 'Deferred until parent freezes the integrated weekly dashboard.',
};
fs.writeFileSync(path.join(__dirname, 'route-contract-checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, checks: checks.length, signature: 'enter(abbr, id, tab, returnRoute = null)' }));
