'use strict';
// Independent native observation of the actual consumer masks. Expected paths
// were collected before the adapter existed, from verified conflicting sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const matrixPath = path.join(__dirname, 'cross-screen-disagreement-matrix-v4.json');
const matrix = JSON.parse(fs.readFileSync(matrixPath));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => sha(Buffer.from(JSON.stringify(value)));

module.exports = async function audit({page, r, go, ready, input, dialogClose, capture, books}) {
  const proof = {expectedMatrixSha256: sha(fs.readFileSync(matrixPath)), actualMasks: [], nativeViews: []};
  // Independently satisfy the history prerequisite through actual product input.
  await go(page,'steelers');
  await input(page,r,'[data-page="steelers"] [data-team-tab="roster"]','Integrity prerequisite: actual Steelers roster');
  await input(page,r,'[data-page="steelers"] [data-filter="ALL"]','Integrity prerequisite: all actual roster cards');
  const cards=await page.locator('[data-page="steelers"] [data-player]').evaluateAll(es=>es.map(e=>({id:e.dataset.player,expanded:e.getAttribute('aria-expanded')})));
  const closed=cards.find(card=>card.expanded!=='true');assert.ok(closed,'A genuine roster research card exists');
  await input(page,r,`[data-page="steelers"] [data-player="${closed.id}"]`,'Integrity prerequisite: native player research loads raw/effective history');
  await page.waitForFunction(()=>window.PD_HISTORY_RAW&&window.PD_HISTORY?._sourceIntegrity?.status==='verified'&&document.querySelector('[data-player-history-state="ready"]'),null,{timeout:45000});
  proof.historyPrerequisite={player:closed.id,input:'actual roster card',verifiedRawAndEffective:true};

  async function actualReadingPairs(dialog, gameId, field, playerId = '') {
    const expected = books['game-reports.json'].knownDisagreements.find(issue => issue.gameId === gameId && issue.field === field && (!playerId || issue.playerGsisId === playerId));
    assert.ok(expected, 'Exact independent catalog source item exists');
    const element = dialog.locator(`[data-si-game="${gameId}"][data-si-field="${field}"]${playerId ? `[data-si-player="${playerId}"]` : ''}`).first();
    assert.equal(await element.count(), 1, 'Actual source issue is rendered');
    const links = await element.locator('a[data-si-source][data-si-value]').evaluateAll(nodes => nodes.map(node => ({sourceId: node.dataset.siSource, value: node.dataset.siValue, retrievedAt: node.dataset.siRetrieved, href: node.href})));
    const expectedPairs = expected.readings.flatMap(reading => reading.sourceIds.map(sourceId => {const descriptor = expected.sources.find(source => source.id === sourceId);return {sourceId, value: String(reading.value), retrievedAt: descriptor.retrievedAt, href: descriptor.url};}));
    assert.deepEqual(links, expectedPairs, 'Every native provider/value/URL/retrieval pair is correctly attributed');
    return {gameId, field, playerId, links};
  }
  await go(page, 'team/CLE?tab=form&window=5&season=current&venue=all&mode=average');
  await go(page, 'matchup/LV?tab=players&window=5&season=current&venue=all&mode=total&game=2026_03_LV_NO');
  await page.waitForFunction(() => window.PDTeamDetails?.getDataset?.()?._sourceIntegrity?.status === 'verified' && window.MatchupBreakdown?.getDataset?.()?._sourceIntegrity?.status === 'verified');
  const observed = await page.evaluate(async issues => {
    const effective = {'team-details': window.PDTeamDetails.getDataset(), 'matchup-breakdown': window.MatchupBreakdown.getDataset(), 'player-history': window.PD_HISTORY};
    const raw = {'team-details': window.PDTeamDetails.getRawDataset(), 'matchup-breakdown': window.MatchupBreakdown.getRawDataset(), 'player-history': window.PD_HISTORY_RAW};
    const at = (book, location) => location.split(/[.\[\]]/).filter(Boolean).reduce((value, key) => value?.[key], book);
    const rawHashes = {};
    for (const [name, book] of Object.entries(raw)) {
      rawHashes[name] = book ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(book))))].map(value => value.toString(16).padStart(2, '0')).join('') : null;
    }
    return {
      rawHashes,
      statuses: Object.fromEntries(Object.entries(effective).map(([name, book]) => [name, book?._sourceIntegrity?.status])),
      issues: issues.map(issue => ({gameId: issue.gameId, field: issue.field, scope: issue.scope,
        paths: issue.consumers.map(consumer => ({...consumer, effectiveValue: at(effective[consumer.book], consumer.path),
          rawValueObserved: at(raw[consumer.book], consumer.path),
          share: consumer.derivedPath ? at(effective[consumer.book], consumer.derivedPath) : undefined,
          neutralAlias: issue.field === 'neutralSite' && consumer.path.endsWith('.neutralSite') ? at(effective[consumer.book], consumer.path.replace(/\.neutralSite$/, '.neutral')) : undefined}))}))
    };
  }, matrix.disagreements);
  for (const [name, digest] of Object.entries(observed.rawHashes)) {
    assert.ok(digest, 'Original consumer payload retained separately: ' + name);
    assert.equal(digest, canonical(books[name + '.json']), 'Actual original payload is untouched: ' + name);
    assert.equal(observed.statuses[name], 'verified', 'Actual effective consumer has checked compatible catalog: ' + name);
  }
  for (const issue of observed.issues) {
    for (const row of issue.paths) {
      assert.deepEqual(row.rawValueObserved, row.rawValue, 'Original independently recorded source cell preserved: ' + row.path);
      if (row.path.endsWith('.homeAway')) assert.ok(row.effectiveValue === null || row.effectiveValue === 'unknown', 'Disputed neutral classification becomes unknown: ' + row.path);
      else assert.equal(row.effectiveValue, null, 'Known conflict is unavailable before consumer aggregation: ' + row.path);
      if (row.derivedPath) assert.equal(row.share, null, 'Dependent target share is unavailable: ' + row.derivedPath);
      if (issue.field === 'neutralSite' && row.path.endsWith('.neutralSite')) assert.equal(row.neutralAlias, null, 'Both neutral aliases are unavailable');
      proof.actualMasks.push({gameId: issue.gameId, field: issue.field, book: row.book, path: row.path, value: row.effectiveValue});
    }
  }
  // Native own and opposing allowed aggregates must show unavailable in both
  // presentation modes, while independently sourced rushing remains visible.
  for (const [team, side] of [['CLE', 'gained'], ['NYJ', 'allowed']]) {
    await go(page, `team/${team}?tab=form&window=5&season=current&venue=all&mode=average`);
    for (const mode of ['average', 'total']) {
      await input(page, r, `[data-page="team-details"] [data-td-mode="${mode}"]`, 'Conflicted yards: native ' + mode);
      for (const field of ['netPassing', 'totalOffense']) assert.equal((await page.locator(`[data-td-stat="${field}"][data-td-side="${side}"]`).innerText()).trim(), '—', `${team} ${side} ${field} ${mode} cannot silently sum disputed games`);
      assert.match(await page.locator(`[data-td-stat="rushing"][data-td-side="${side}"]`).innerText(), /\d/, 'Unrelated rushing source retained');
    }
    await input(page, r, '[data-page="team-details"] [data-td-action="sources"]', 'Actual source alternatives in ' + team);
    const dialog = page.locator('dialog[open]').first();
    await dialog.waitFor();
    const actualSources = [];
    for (const field of ['netPassing', 'totalOffense']) actualSources.push(await actualReadingPairs(dialog, '2026_05_CLE_NYJ', field));
    await dialogClose(page, r);
    proof.nativeViews.push({team, side, modes: ['average', 'total'], actualSources});
  }
  await go(page, 'matchup/LV?tab=players&window=5&season=current&venue=all&mode=total&game=2026_03_LV_NO');
  const bowers = page.locator('[data-mb-player="00-0039338"][data-mb-team="LV"]').first();
  assert.equal(await bowers.count(), 1, 'Actual independently ranked receiver remains present');
  const receiverRow = page.locator('[data-mb-player-row="00-0039338"][data-mb-team="LV"][data-mb-kind="receiving"]');
  assert.equal((await receiverRow.locator('[data-mb-field="targets"]').innerText()).trim(), '—', 'Conflicted receiver targets total is unavailable');
  await input(page, r, '[data-page="matchup-breakdown"] [data-mb-action="sources"]', 'Receiver sources disclose actual discrepancy');
  await page.locator('dialog[open]').first().waitFor();
  const actualSources = await actualReadingPairs(page.locator('dialog[open]').first(), '2026_03_LV_NO', 'targets', '00-0039338');
  await dialogClose(page, r);
  proof.nativeViews.push({team: 'LV', player: '00-0039338', targets: null, actualSources});
  await go(page, 'matchup/ARI?tab=form&game=2024_17_ARI_LA');
  assert.match(await page.locator('[data-page="matchup-breakdown"] .mb-fixture-copy').innerText(), /Kickoff unavailable/i, 'Conflicted actual kickoff is not republished as settled');
  await capture(page, r, 'source-conflict-kickoff-' + r.viewport.width);
  proof.nativeViews.push({game: '2024_17_ARI_LA', kickoffUtc: null});
  return proof;
};
