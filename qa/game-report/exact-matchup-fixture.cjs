'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..'), source = fs.readFileSync(path.join(root, 'assets/matchup-breakdown.js'), 'utf8');
const bytes = fs.readFileSync(path.join(root, 'assets/data/matchup-breakdown.json')), dataset = JSON.parse(bytes);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const state = {team:'DAL',game:null};
const context = {state,dataset,club:abbr=>dataset.teams[abbr || state.team],final:game=>game.status === 'final',Number,String,Map};
vm.createContext(context);
const start = source.indexOf('  const allGames ='), end = source.indexOf('  const otherTeam =', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(source.slice(start,end) + '\nthis.selectedFixture = fixture;', context);
const cases = [];
for (const [team,club] of Object.entries(dataset.teams)) {
  state.team=team;
  for (const game of (club.games || []).slice(0,1)) {
    state.game=game.id; assert.equal(context.selectedFixture()?.id,game.id); cases.push({team,kind:'explicit-schedule',game:game.id});
  }
  const archived=(club.headToHeadGames || []).find(game=>!(club.games || []).some(row=>row.id === game.id));
  if (archived) {
    state.game=archived.id; assert.equal(context.selectedFixture()?.id,archived.id); cases.push({team,kind:'explicit-archived-H2H',game:archived.id});
  }
  state.game='missing-event-that-must-not-be-substituted';
  assert.equal(context.selectedFixture(),null); cases.push({team,kind:'missing-explicit-unavailable'});
  state.game=null;
  const expected=(club.games || []).find(game=>game.id===club.researchGameId) || (club.games || []).find(game=>game.id===club.upcomingGameId);
  if (expected) {assert.equal(context.selectedFixture()?.id,expected.id); cases.push({team,kind:'default-research',game:expected.id});}
}
state.team='INVALID'; state.game='2026_04_DAL_HOU'; assert.equal(context.selectedFixture(),null);
const output={status:'passed',qualification:'Exact shipping fixture function and its source collectors exercised in a Node VM against the real dataset. No browser/network claim or application mutation.',sourceSha256:sha(source),datasetSha256:sha(bytes),caseCount:cases.length+1,cases};
fs.writeFileSync(path.join(__dirname,'exact-matchup-fixture.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,caseCount:output.caseCount,sourceSha256:output.sourceSha256}));
