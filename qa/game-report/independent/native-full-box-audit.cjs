'use strict';
const assert = require('node:assert/strict');
const columns = {
  passing: ['completionAttempt', 'passingYards', 'passingTD', 'interceptions'],
  rushing: ['rushingAttempts', 'rushingYards', 'rushingAverage', 'rushingTD'],
  receiving: ['receptions', 'receivingYards', 'targets', 'receivingTD'],
  defensive: ['totalTackles', 'soloTackles', 'defensiveSacks', 'tacklesForLoss'],
  kicking: ['fieldGoalsMade', 'fieldGoalAttempts', 'extraPointsMade', 'kickingPoints'],
  punting: ['punts', 'puntYards', 'grossAvgPuntYards', 'puntsInside20'],
  kickReturns: ['kickoffReturns', 'kickoffReturnYards', 'yardsPerKickoffReturn', 'kickoffReturnTD'],
  puntReturns: ['puntReturns', 'puntReturnYards', 'yardsPerPuntReturn', 'puntReturnTD'],
  fumbles: ['fumbles', 'fumblesLost', 'fumblesRecovered'],
  interceptions: ['defensiveInterceptions', 'interceptionReturnYards', 'interceptionTD']
};
const fmt = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('en-AU', {maximumFractionDigits:1});
function value(player, field) {
  const s = player.stats;
  if (field === 'completionAttempt') return s.completions != null && s.passingAttempts != null ? fmt(s.completions) + '/' + fmt(s.passingAttempts) : '—';
  if (field === 'rushingAverage') return s.rushingYards != null && s.rushingAttempts > 0 ? fmt(s.rushingYards / s.rushingAttempts) : '—';
  return fmt(s[field]);
}
module.exports = async function audit({page, r, input, dialogClose, detail, scope}) {
  const actual = await page.locator(scope + ' .gr-box-team').evaluateAll(teams => teams.map(team => ({
    name: team.querySelector('h3').innerText,
    categories: [...team.querySelectorAll('.gr-box-table')].map(table => ({heading: table.previousElementSibling.innerText,
      rows: [...table.querySelectorAll('tbody tr')].filter(row => row.querySelector('button[data-player]')).map(row => ({
        id: row.querySelector('button').dataset.player,
        team: row.querySelector('button').dataset.playerTeam,
        name: row.querySelector('button').innerText.trim(),
        values: [...row.querySelectorAll('td')].map(cell => cell.innerText.trim())
      }))}))
  })));
  assert.equal(actual.length, 2, 'Actual full box retains both selected event participants');
  const allLinks = [], representatives = [];
  let cells = 0;
  for (let side = 0; side < actual.length; side++) {
    const abbr = [detail.away_team, detail.home_team][side];
    assert.equal(actual[side].categories.length, 10, 'All ten actual statistical category sections exist');
    for (let index = 0; index < Object.keys(columns).length; index++) {
      const kind = Object.keys(columns)[index], category = actual[side].categories[index];
      assert.equal(category.heading.replace(/\s+/g,'').toLowerCase(), kind.toLowerCase(), 'Every actual full-box category is correctly named');
      const expected = detail.players[abbr].filter(player => player.categories.includes(kind));
      assert.deepEqual(category.rows.map(row => row.id), expected.map(player => player.id), 'Every actual ' + abbr + '/' + kind + ' source-recorded category participant is represented');
      for (const row of category.rows) {
        const player = detail.players[abbr].find(p => p.id === row.id);
        assert.equal(row.team, abbr, 'Full box profile is linked to the correct game-side team');
        assert.equal(row.name, player.name, 'Historical source player name retained');
        assert.deepEqual(row.values, columns[kind].map(field => value(player, field)), 'Every full-box cell agrees with selected-game source/explicit unavailable rule');
        cells += row.values.length;
        allLinks.push({team:abbr, id:row.id, kind});
      }
      if (category.rows.length) representatives.push({team:abbr, id:category.rows[0].id, kind});
    }
  }
  const selected = r.viewport.width === 393 ? [...new Map(allLinks.map(link => [link.team + ':' + link.id, link])).values()] : representatives;
  const opened = [];
  for (const link of selected) {
    const player = detail.players[link.team].find(row => row.id === link.id);
    const selector = scope + ` .gr-box-team button[data-gr-action="profile"][data-player="${link.id}"][data-player-team="${link.team}"]`;
    await input(page, r, selector, 'Native full-box historical profile: ' + player.name + ' (' + link.kind + ')');
    const dialog = page.locator('#game-report-dialog');
    await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('#game-report-dialog-title').innerText(), player.name + ' · ' + link.team);
    const fields = await dialog.locator('#game-report-dialog-content > table tbody tr td').allTextContents();
    assert.deepEqual(fields, Object.values(player.stats).map(fmt), 'Native full-box profile exposes every source field without team substitution or missing-to-zero conversion');
    await dialogClose(page, r);
    opened.push(link);
  }
  return {categoriesPerTeam:10, renderedCellsVerified:cells, allLinkedRows:allLinks.length, nativeProfiles:opened,
    inputScope:r.viewport.width === 393 ? 'Every unique team/player profile from the full box at first phone' : 'Representative native profile from every available category on both sides; every displayed row/stat cell verified'};
};
