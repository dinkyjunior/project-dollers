'use strict';
// Additive current-source acceptance. Original 15 audit helpers are read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const q = require('/workspace/project-dollers/qa/matchup-breakdown/qa.cjs');
const tq = require('/workspace/project-dollers/qa/team-details/qa.cjs');
const model = require('/workspace/project-dollers/qa/matchup-breakdown/model.cjs');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const engine = arg('--engine', 'chromium');
const base = arg('--base', 'http://127.0.0.1:8876/project-dollers/');
const out = path.resolve(arg('--output', '/workspace/recovery-qa/matchup-controls/current-source-delta-' + engine));
assert.ok(['chromium', 'webkit'].includes(engine));
assert.ok(!fs.existsSync(out), 'Every real attempt gets a fresh immutable directory');
fs.mkdirSync(out, {recursive: true});
const data = q.sourceData();
const runtime = q.runtimeManifest();
const originalTests = q.tests();
const manifestSha = q.SHA(Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(runtime).sort().map(key => [key, runtime[key]])))));
const expectedManifest = arg('--runtime-sha', manifestSha);
assert.equal(manifestSha, expectedManifest, 'Run binds the authorized coherent runtime');
const serializeHash = value => q.SHA(Buffer.from(JSON.stringify(value)));
const report = {status: 'running', engine, base, startedAt: new Date().toISOString(), runtimeManifestSha256: manifestSha,
  source: {runtimeFiles: runtime, originalTestFiles: originalTests, testFiles: {...originalTests, 'qa/matchup-breakdown/current-source-delta.cjs': q.SHA(fs.readFileSync(__filename))}, scriptSha256: q.SHA(fs.readFileSync(__filename)),
    currentHash: runtime['assets/data/current.json'], teamHash: runtime['assets/data/team-details.json'], matchupHash: runtime['assets/data/matchup-breakdown.json']},
  qualification: {additiveDeltaAudit: true, originalBaseWholeAuditsUnchanged: true, originalFifteenHelpersUnchanged: true,
    genuineBrowser: true, deviceScaleFactor: 2, nativeTouch: true, physicalIPhone: false, sourceSubstitution: false,
    clockSubstitution: false, DOMOrStyleSubstitution: false, naturalAnimationPhase: true, strictTLS: /^https:/.test(base),
    scope: 'Authoritative team upcoming selectors and incoming source context only; retained full statistical/control authority requires separately proved exact historical equivalence.'},
  results: [], originals: []};
const save = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
save();
let browser;
async function scenario(viewport) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Australia/Sydney'});
  const page = await context.newPage();
  const r = {viewport, status: 'running', startedAt: new Date().toISOString(), inputs: [], checks: [], allClubSelectors: [], errors: [], httpErrors: [], transportErrors: []};
  r.nativeInputs = r.inputs; r.deltaCoverage = {}; report.results.push(r); save();
  page.on('pageerror', error => r.errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') r.errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) r.httpErrors.push({url: response.url(), status: response.status()});});
  page.on('requestfailed', request => r.transportErrors.push({url: request.url(), error: request.failure()?.errorText}));
  const phase = value => {r.phase = value; save(); console.log('DELTA ' + engine + ' ' + viewport.width + ' ' + value);};
  const tap = async (locator, label) => {
    assert.equal(await locator.count(), 1, label + ' has exactly one native control');
    await locator.tap(); r.inputs.push({label, input: 'native-touch', hash: new URL(page.url()).hash});
  };
  const shot = async label => {
    const item = await q.capture(page, out, `${engine}-${viewport.width}-${label}`);
    const record = {...item, path: path.join(out, item.file), engine, viewport};
    report.originals.push(record); save(); return record;
  };
  const exact = async () => {
    const actual = await page.evaluate(async () => {
      const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(v => v.toString(16).padStart(2, '0')).join('');
      return {current: await hash(window.PD_DATA), team: await hash(window.PDTeamDetails.getDataset()), matchup: await hash(window.MatchupBreakdown.getDataset())};
    });
    assert.deepEqual(actual, {current: serializeHash(data.current), team: serializeHash(data.teamForm), matchup: serializeHash(data.matchup)}, 'Actual complete browser datasets match frozen current-source facts');
    return actual;
  };
  const close = async () => {
    await tap(page.locator('#matchup-breakdown-dialog .dialog-close'), 'Close actual research dialog');
    await page.waitForFunction(() => !document.querySelector('#matchup-breakdown-dialog').open && window.MatchupBreakdown.getState().view === null);
  };
  const selectedFixture = async id => {
    await q.ready(page); await q.active(page);
    assert.equal((await page.evaluate(() => window.MatchupBreakdown.getState())).game, id, 'Native control preserves its own source game ID');
    assert.equal(await page.locator(q.PAGE + ' [data-mb-fixture]').getAttribute('data-mb-fixture'), id, 'Visible destination retains exact selected event');
  };
  try {
    phase('own-ready-dallas-future');
    await page.goto(base + '#team/DAL', {waitUntil: 'networkidle'}); await tq.ready(page); await q.active(page, 'team-details');
    const futureId = data.teamForm.teams.DAL.upcomingGameId;
    assert.equal(futureId, data.matchup.teams.DAL.nextScheduledGameId, 'Independent Team future identity agrees with separately published next scheduled matchup');
    const futureRaw = data.teamForm.teams.DAL.games.find(game => game.id === futureId);
    assert.equal(futureRaw.week, 6); assert.equal(futureRaw.away_team, 'DAL'); assert.equal(futureRaw.home_team, 'GB');
    const card = page.locator(tq.TEAM + ' [data-upcoming-game]');
    assert.equal(await card.getAttribute('data-upcoming-game'), futureId, 'Fully ready team card honors source upcoming metadata');
    assert.equal(await card.locator('[data-td-action="matchup"]').getAttribute('data-game'), futureId);
    assert.match(await card.innerText(), /UPCOMING GAME.*WEEK 6/);
    await card.scrollIntoViewIfNeeded(); r.futureTeamCard = await shot('dallas-upcoming-week6');
    await page.locator('#team-window-select').selectOption('3'); r.inputs.push({label: 'Team Last 3', input: 'native-select'});
    await page.locator('#team-season-select').selectOption('current'); r.inputs.push({label: 'Team current season', input: 'native-select'});
    await page.locator('#team-venue-select').selectOption('home'); r.inputs.push({label: 'Team home venue', input: 'native-select'});
    await tap(page.locator(tq.TEAM + ' [data-td-mode="total"]'), 'Team totals');
    const teamBefore = await page.evaluate(() => {const s = window.PDTeamDetails.getState();return {hash: location.hash, team: s.team, tab: s.tab, window: s.window, season: s.season, venue: s.venue, mode: s.mode, expanded: s.expanded};});
    await tap(page.locator(tq.TEAM + ' [data-upcoming-game] [data-td-action="matchup"]'), 'Dallas Week 6 → own matchup');
    await selectedFixture(futureId); r.exactDatasetFingerprints = await exact();
    r.futureQuarterbacks = await q.genericQBSourceCheck(page, data, await page.evaluate(() => window.MatchupBreakdown.getState()));
    await page.locator(q.PAGE + ' .page-scroll').evaluate(el => el.scrollTop = 0); r.futureMatchup = await shot('selected-week6-matchup');
    r.futureGeometry = await q.geometry(page);
    await tap(page.locator(q.PAGE + ' [data-mb-tab="lineup"]'), 'Week 6 Lineup & Travel');
    const futurePanel = await page.locator('#matchup-panel-lineup').innerText();
    assert.match(futurePanel, /LINEUP & TRAVEL.*WEEK 6/);
    assert.match(futurePanel, /Quarterback unavailable/i);
    assert(!futurePanel.includes('ESPN-reported INACTIVE'), 'Reused Week 5 report is not presented as future game-day inactive');
    for (const abbr of ['DAL', 'GB']) {
      const report = data.matchup.teams[abbr].fixtureReports[futureId];
      assert.equal(report.eventStatus.state, 'pre'); assert.equal(report.qbEvidence.playerId, null);
      assert.equal(report.availability.players.length, 0, 'Future selected event has no established game-day inactive entries');
      for (const row of report.availability.currentTeamBulletin || []) {
        assert.equal(row.gameId, null); assert.equal(row.week, null); assert.equal(row.reportedInactive, null);
      }
      if ((report.availability.currentTeamBulletin || []).length) assert(futurePanel.includes('dated current-team bulletin entries'));
    }
    await page.locator(q.PAGE + ' .page-scroll').evaluate(el => el.scrollTop = 0); r.futureLineup = await shot('week6-lineup-context');
    await tap(page.locator(q.PAGE + ' .mb-back'), 'Week 6 → originating Dallas'); await tq.ready(page); await q.active(page, 'team-details');
    const teamAfter = await page.evaluate(() => {const s = window.PDTeamDetails.getState();return {hash: location.hash, team: s.team, tab: s.tab, window: s.window, season: s.season, venue: s.venue, mode: s.mode, expanded: s.expanded};});
    assert.deepEqual(teamAfter, teamBefore, 'Back Dallas preserves actual originating filters, mode, expansion and route');
    assert.equal(await page.locator('[data-upcoming-game]').getAttribute('data-upcoming-game'), futureId);
    r.originatingState = {before: teamBefore, after: teamAfter};
    r.deltaCoverage.futureFixtureIdentity = true; r.deltaCoverage.futureFixtureQBAvailability = true; r.deltaCoverage.originatingTeamReturn = true;
    await tap(page.locator(tq.TEAM + ' [data-upcoming-game] [data-td-action="matchup"]'), 'Dallas future direct-load reload check');
    await selectedFixture(futureId); await page.reload({waitUntil: 'networkidle'}); await selectedFixture(futureId);
    r.directLoadReload = true; r.deltaCoverage.directLoadReload = true;
    r.checks.push('Own-ready DAL W6 card, native exact destination, full reload, scoped future QB/bulletin and Back Dallas state');
    phase('direct-live-research');
    await page.goto(base + '#matchup/DAL', {waitUntil: 'networkidle'}); await q.ready(page); await q.active(page);
    const researchId = data.matchup.teams.DAL.researchGameId;
    const research = data.matchup.teams.DAL.fixtureReports[researchId];
    const raw = data.matchup.teams.DAL.games.find(game => game.id === researchId);
    assert.equal(raw.week, 5); assert.equal(research.eventStatus.state, 'in');
    assert.equal(await page.locator('[data-mb-fixture]').getAttribute('data-mb-fixture'), researchId);
    const liveCopy = await page.locator('.mb-fixture-copy').innerText();
    assert.match(liveCopy, /ESPN.*In Progress/i);
    assert(liveCopy.includes(`${raw.away_team} ${research.liveScore.away}–${research.liveScore.home} ${raw.home_team}`));
    assert(liveCopy.includes(research.eventStatus.detail)); assert.match(liveCopy, /Provider snapshot/);
    assert.match(await page.locator('.mb-crumbs').innerText(), /GAME IN PROGRESS/);
    const selected = await page.evaluate(() => ['DAL', 'TB'].map(abbr => ({abbr, ids: window.MatchupBreakdown.getSelectedGames(abbr).map(game => game.id)})));
    for (const item of selected) {
      assert(!item.ids.includes(researchId), 'Partial live game excluded from ' + item.abbr + ' completed window');
      assert.deepEqual(item.ids, model.games(data.matchup, item.abbr, {window: 5, season: 'cross', venue: 'all'}).map(game => game.id));
    }
    r.live = {gameId: researchId, eventStatus: research.eventStatus, liveScore: research.liveScore, retrievedAt: research.retrievedAt, publishedAt: research.publishedAt, actualCopy: liveCopy, completedWindows: selected};
    r.liveQuarterbacks = await q.genericQBSourceCheck(page, data, await page.evaluate(() => window.MatchupBreakdown.getState()));
    const leaders = await page.locator('[data-mb-leaders]').evaluateAll(nodes => nodes.map(node => ({group: node.dataset.mbLeaders, ids: [...node.querySelectorAll('[data-mb-player-row]')].map(row => row.dataset.mbPlayerRow)})));
    for (const group of leaders) {const [abbr, kind] = group.group.split(':');assert.deepEqual(group.ids, model.leaders(data.matchup, abbr, kind, {window: 5, season: 'cross', venue: 'all', mode: 'total'}).map(player => player.id));}
    r.liveLeaders = leaders; r.deltaCoverage.researchFixtureContext = true; r.deltaCoverage.activeGameExcluded = true;
    await page.locator(q.PAGE + ' .page-scroll').evaluate(el => el.scrollTop = 0); r.liveTop = await shot('direct-week5-live');
    await tap(page.locator(q.PAGE + ' [data-mb-tab="lineup"]'), 'Actual Week 5 Lineup');
    const livePanel = await page.locator('#matchup-panel-lineup').innerText(); assert.match(livePanel, /incomplete and unofficial/);
    r.injuryContexts = [];
    for (const abbr of ['DAL', 'TB']) {
      const selectedReport = data.matchup.teams[abbr].fixtureReports[researchId];
      assert.equal(selectedReport.availability.completeOfficialList, false);
      for (const entry of selectedReport.availability.players) {
        assert.equal(entry.gameId, researchId); assert.equal(entry.team, abbr); assert.equal(entry.week, 5);
        const node = page.locator(`[data-mb-injury-player="${entry.playerId}"]`);
        assert.equal(await node.count(), 1, 'Native injury identity appears once with merged provenance: ' + entry.name);
        const text = await node.innerText(); assert(text.includes(entry.name)); assert(text.includes(entry.reportStatus));
        assert(text.includes('2026 W5'));
        const sourceIds = await node.locator('[data-mb-injury-sources]').evaluateAll(nodes => nodes.flatMap(node => node.dataset.mbInjurySources.split(' ')));
        for (const id of entry.sourceIds || []) assert(sourceIds.includes(id), 'Exact selected event provider preserved for ' + entry.name);
        if (entry.reportedInactive === true) assert(text.includes('ESPN-reported INACTIVE'));
        r.injuryContexts.push({team: abbr, playerId: entry.playerId, name: entry.name, reportStatus: entry.reportStatus, reportedInactive: entry.reportedInactive, actualText: text, sourceIds});
      }
    }
    await page.locator(q.PAGE + ' .page-scroll').evaluate(el => el.scrollTop = 0); r.liveLineup = await shot('week5-lineup-provider-context');
    await tap(page.locator(q.PAGE + ' [data-mb-tab="players"]'), 'Return live research Players');
    const inactive = page.locator('[data-mb-qb-team="TB"] [data-mb-action="qb-status"][data-mb-player]');
    for (let i = 0; i < await inactive.count(); i++) {
      const button = inactive.nth(i), playerId = await button.getAttribute('data-mb-player');
      await tap(button, 'Actual backup QB source status ' + playerId);
      await page.locator('#matchup-breakdown-dialog').waitFor({state: 'visible'});
      const player = data.matchup.teams.TB.players[playerId]; assert((await page.locator('#matchup-dialog-title').innerText()).toLowerCase().includes(player.name.toLowerCase()), 'Native QB dialog retains exact source identity independent of CSS text transform');
      const statusText = await page.locator('#matchup-dialog-content').innerText(); assert.match(statusText, /incomplete provider report; not official confirmation/);
      await close();
    }
    r.deltaCoverage.lineupAvailabilitySourceExact = true;
    r.checks.push('Direct research retains actual sourced live score/period/clock; partial game excluded, historical players/QBs unchanged, selected-event injury provenance is incomplete/unofficial');
    phase('protected-pittsburgh-week6');
    await page.goto(base + '#nfl', {waitUntil: 'networkidle'}); await q.active(page, 'nfl');
    await page.locator('#week-select').selectOption('6'); r.inputs.push({label: 'NFL Week 6', input: 'native-select'});
    const pit = data.current.weeks[6].fixture;
    assert.equal(pit.id, '2026_06_PIT_TB'); assert.equal(pit.odds.status, 'unavailable');
    for (const field of ['awayMoneyline', 'homeMoneyline', 'awayDecimal', 'homeDecimal', 'spread', 'total']) assert.equal(pit.odds[field], null, 'No stale W6 odds: ' + field);
    const renderedCoreOdds = await page.evaluate(() => window.PDApp.getContext().data.weeks[6].fixture.odds); assert.deepEqual(renderedCoreOdds, pit.odds);
    await tap(page.locator('[data-page="nfl"] [data-nfl-action="matchup"]'), 'NFL Week 6 → own Pittsburgh fixture'); await selectedFixture(pit.id);
    await tap(page.locator(q.PAGE + ' .mb-crumbs [data-mb-action="ladder"]'), 'Pittsburgh → retained NFL Week 6'); await q.active(page, 'nfl');
    assert.equal(await page.locator('#week-select').inputValue(), '6');
    await page.goto(base + '#steelers', {waitUntil: 'networkidle'}); await q.active(page, 'steelers');
    await tap(page.locator('[data-team-tab="matchups"]'), 'Protected Steelers matchup research');
    const pricePanel = page.locator('#team-panel-matchups .research-panel').filter({has: page.getByRole('heading', {name: 'Historical pre-game prices'})});
    assert.equal(await pricePanel.count(), 1); const prices = await pricePanel.innerText();
    assert.match(prices, /Verified pre-game head-to-head prices with provider and capture time are unavailable/);
    await pricePanel.scrollIntoViewIfNeeded(); r.protectedPrices = {odds: renderedCoreOdds, actualText: prices, original: await shot('pittsburgh-week6-prices-unavailable')};
    r.deltaCoverage.pittsburghOddsSourceExact = true;
    r.checks.push('Protected NFL W6 native fixture keeps identity and week; core odds are all-null, research explicitly shows unavailable verified prices');
    phase('all32-authoritative-native-selectors');
    for (const [abbr, club] of Object.entries(data.teamForm.teams)) {
      await page.goto(base + '#team/' + abbr, {waitUntil: 'networkidle'}); await tq.ready(page); await q.active(page, 'team-details');
      const eligible = game => Number(game.season) === Number(data.teamForm.season) && [game.home_team, game.away_team].includes(abbr) && !['final', 'cancelled', 'postponed'].includes(game.status);
      const expected = club.games.find(game => game.id === club.upcomingGameId && eligible(game)) || club.games.filter(eligible).sort((a, b) => String(a.kickoffUtc || a.gameday).localeCompare(String(b.kickoffUtc || b.gameday)))[0] || null;
      const node = page.locator(tq.TEAM + ' [data-upcoming-game]');
      assert.equal(await node.count(), expected ? 1 : 0, abbr + ' real upcoming presence');
      if (expected) {
        assert.equal(await node.getAttribute('data-upcoming-game'), expected.id, abbr + ' authoritative visible fixture');
        assert.equal(await node.locator('[data-td-action="matchup"]').getAttribute('data-game'), expected.id);
        await tap(node.locator('[data-td-action="matchup"]'), abbr + ' own upcoming native route'); await selectedFixture(expected.id);
        assert.equal((await page.evaluate(() => window.MatchupBreakdown.getState())).team, abbr);
        await tap(page.locator(q.PAGE + ' .mb-back'), abbr + ' own Back Team'); await tq.ready(page); await q.active(page, 'team-details');
        assert.equal((await page.evaluate(() => window.PDTeamDetails.getState())).team, abbr);
      }
      r.allClubSelectors.push({team: abbr, metadataUpcoming: club.upcomingGameId, renderedAndClickedGame: expected?.id || null, nativeRoundTrip: !!expected});
      save();
    }
    assert.equal(r.allClubSelectors.length, 32); r.deltaCoverage.ownUpcomingCards = r.allClubSelectors.length;
    await page.goto(base + '#matchup/DAL', {waitUntil: 'networkidle'}); await q.ready(page); await q.active(page); await exact();
    r.finalGeometry = await q.geometry(page);
    const realFailures = r.transportErrors.filter(item => !['net::ERR_ABORTED', 'Load request cancelled'].includes(item.error));
    assert.deepEqual(r.errors, []); assert.deepEqual(r.httpErrors, []); assert.deepEqual(realFailures, []);
    r.checks.push('All 32 own-ready authoritative team fixture selectors and native upcoming→matchup→Back Team round trips');
    r.errorEvidence = {javascriptAndConsole: r.errors, http: r.httpErrors, failed: realFailures};
    r.status = 'passed'; r.completedAt = new Date().toISOString(); phase('completed');
  } catch (error) {
    r.status = 'failed'; r.failure = {message: error.message, stack: error.stack};
    try {r.failureOriginal = await shot('failure');} catch (captureError) {r.captureError = captureError.message;}
    throw error;
  } finally {save(); await context.close();}
}
(async () => {
  try {
    browser = await q.launch(engine, /^https:/.test(base)); report.browserVersion = browser.version();
    for (const viewport of [{width: 393, height: 852}, {width: 430, height: 896}]) await scenario(viewport);
    assert.deepEqual(q.runtimeManifest(), runtime, 'Runtime/source remained frozen throughout native audit');
    assert.deepEqual(q.tests(), originalTests, 'All original 15 helpers remained unchanged');
    assert.equal(q.SHA(fs.readFileSync(__filename)), report.source.scriptSha256, 'Additive audit logic unchanged during run');
    report.status = 'passed'; report.unchangedDuringQA = true; report.originalTestLogicUnchangedDuringQA = true;
  } catch (error) {report.status = 'failed'; report.failure = {message: error.message, stack: error.stack}; process.exitCode = 1;}
  finally {
    if (browser) await browser.close(); report.completedAt = new Date().toISOString(); report.browserClosed = true; save();
    fs.writeFileSync(path.join(out, 'originals.json'), JSON.stringify({status: report.status, runtimeManifestSha256: manifestSha, originals: report.originals}, null, 2) + '\n');
    console.log(JSON.stringify({status: report.status, engine, completedAt: report.completedAt, report: path.join(out, 'results.json'), sha256: q.SHA(fs.readFileSync(path.join(out, 'results.json'))), failure: report.failure}));
  }
})();
