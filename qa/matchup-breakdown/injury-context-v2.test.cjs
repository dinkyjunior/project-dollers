'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname,'../..');
const source = fs.readFileSync(path.join(root,'assets/matchup-breakdown.js'),'utf8');
const start = source.indexOf('  function depthOnlyInjury(');
const end = source.indexOf('  function lineupContent()',start);
assert.ok(start > 0 && end > start,'Actual runtime injury qualification and markup are present');
const functions = source.slice(start,end);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function run(book,abbr,game) {
  const context = vm.createContext({dataset:book,state:{team:abbr},club:id => book.teams[id || abbr],fixture:() => game,eventReport:(g,id) => book.teams[id]?.fixtureReports?.[g?.id] || null,players:id => Object.values(book.teams[id]?.players || {}),escape,known:value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))});
  vm.runInContext(functions,context);
  return {fixture:vm.runInContext(`mergedInjuries(${JSON.stringify(abbr)})`,context),bulletins:vm.runInContext(`mergedInjuries(${JSON.stringify(abbr)},true)`,context),markup:group => {context.actualGroup=group;return vm.runInContext('injuryMarkup(actualGroup,true)',context);}};
}
const fixture = {id:'2026_06_DAL_GB',season:2026,week:6,home_team:'GB',away_team:'DAL'};
const row = (id,extra={}) => ({playerId:id,name:id,week:6,reportStatus:'Out',sourceTimestamp:'2026-10-09T03:22Z',injury:'Left Thursday’s Week 5 game.',sourceIds:['espn_matchup_depth_DAL'],...extra});
const book = (rows,providers=[]) => ({season:2026,teams:{DAL:{players:{},roster:[],injuries:{week:6,players:rows},fixtureReports:{[fixture.id]:{availability:{players:providers}}}}}});

test('A roster-derived next-week tag never turns a dated depth narrative into game availability',() => {
  const result=run(book([row('dated-depth')]),'DAL',fixture);
  assert.equal(result.fixture.length,0);
  assert.equal(result.bulletins.length,1);
  const html=result.markup(result.bulletins[0]);
  assert.match(html,/data-mb-bulletin-player="dated-depth"/);
  assert.match(html,/Selected-game\/week applicability unavailable/);
  assert.match(html,/2026-10-09T03:22Z/);
  assert.match(html,/Left Thursday’s Week 5 game/);
  assert.match(html,/espn_matchup_depth_DAL/);
  assert.match(html,/<small class="mb-bulletin-detail">2026-10-09T03:22Z · Left Thursday’s Week 5 game\.<\/small>/,'Date and narrative are visible mobile text, not only a hover title');
  assert.ok(!html.includes('2026 W6'));
  assert.ok(!html.includes('ESPN-reported INACTIVE'));
});

test('Explicit unknown-week current-team bulletins remain dated disclosures after a source refresh',() => {
  const data=book([]);
  data.teams.DAL.injuries.currentTeamBulletin=[row('qualified-bulletin',{season:null,week:null,gameId:null,context:'current-team-bulletin',gameApplicability:'unavailable'})];
  const result=run(data,'DAL',fixture);
  assert.equal(result.fixture.length,0);
  assert.equal(result.bulletins.length,1);
  assert.match(result.markup(result.bulletins[0]),/Selected-game\/week applicability unavailable/);
});

test('An independently published same-week NFL report stays in the selected fixture section',() => {
  const actual=row('weekly',{sourceIds:['nflverse_injuries'],practiceStatus:'Limited'});
  const result=run(book([actual]),'DAL',fixture);
  assert.equal(result.fixture.length,1);
  assert.equal(result.fixture[0].id,'weekly');
  assert.equal(result.bulletins.length,0);
});

test('Only exact selected-event provider rows carry the qualified provider inactive report',() => {
  const current=row('event',{gameId:fixture.id,team:'DAL',reportedInactive:true,sourceIds:['espn_fixture_summary_401873007']});
  const wrongWeek={...current,playerId:'wrong-week',week:5};
  const wrongGame={...current,playerId:'wrong-game',gameId:'2026_05_TB_DAL'};
  const result=run(book([], [current,wrongWeek,wrongGame]),'DAL',fixture);
  assert.deepEqual(Array.from(result.fixture,g=>g.id),['event']);
  assert.match(result.fixture[0].contexts.values().next().value.rows[0].providerNote,/incomplete provider report, not an official inactive list/);
});

test('A genuine independent NFL corroboration is retained; another week is excluded',() => {
  const result=run(book([row('corroborated',{sourceIds:['espn_matchup_depth_DAL','nflverse_injuries']}),row('previous-nfl',{week:5,sourceIds:['nflverse_injuries']})]),'DAL',fixture);
  assert.deepEqual(Array.from(result.fixture,g=>g.id),['corroborated']);
  assert.equal(result.bulletins.length,0);
});

test('Current Dallas retains all dated reports and their details without labeling them Week 6',() => {
  const data=JSON.parse(fs.readFileSync(path.join(root,'assets/data/matchup-breakdown.json'),'utf8'));
  const club=data.teams.DAL,game=club.games.find(g=>g.id===club.researchGameId);
  const result=run(data,'DAL',game);
  const depthRows=[...(club.injuries.players || []).filter(r=>r.sourceIds?.length && r.sourceIds.every(id=>/^espn_matchup_depth_/.test(id))),...(club.injuries.currentTeamBulletin || [])];
  assert.ok(depthRows.length>0,'The actual adverse source records are present');
  assert.equal(result.bulletins.length,new Set(depthRows.map(r=>r.playerId)).size);
  assert.ok(result.fixture.every(g=>!depthRows.some(r=>r.playerId===g.id)),'Depth-only records are not selected-week reports');
  for(const original of depthRows) {
    const group=result.bulletins.find(g=>g.id===original.playerId),html=result.markup(group);
    for(const value of [original.name,original.reportStatus,original.sourceTimestamp,original.injury,...original.sourceIds].filter(Boolean)) assert.ok(html.includes(escape(value)),'Original dated source detail retained: '+value);
    assert.ok(!html.includes(`${game.season} W${game.week}`),'Derived week is not asserted');
  }
});


test('Dual depth positions share one identical dated note while distinct evidence and original rows survive',() => {
  const first=row('dual-slot',{name:'Malik Davis',position:'RB'});
  const duplicate={...first,position:'KR'};
  const later={...first,sourceTimestamp:'2026-10-09T04:48Z'};
  const otherNarrative={...first,injury:'Separate source report retained.'};
  const otherSource={...first,sourceIds:['espn_matchup_depth_DAL','espn_distinct_source']};
  const otherStatus={...first,reportStatus:'Questionable'};
  const otherPractice={...first,practiceStatus:'Limited'};
  const data=book([]);
  data.teams.DAL.injuries.currentTeamBulletin=[first,duplicate,later,otherNarrative,otherSource,otherStatus,otherPractice];
  const result=run(data,'DAL',fixture);
  assert.equal(result.fixture.length,0);
  assert.equal(result.bulletins.length,1);
  const group=result.bulletins[0],context=group.contexts.values().next().value,html=result.markup(group);
  assert.equal(context.rows.length,7,'Original provider/depth-position rows are never discarded');
  assert.equal((html.match(/class="mb-bulletin-detail"/g)||[]).length,6,'Only the identical dual-slot note is collapsed; distinct date, narrative, source, status and practice stay separate');
  assert.match(html,/2026-10-09T04:48Z/);
  assert.match(html,/Separate source report retained/);
  assert.match(html,/espn_distinct_source/);
  assert.match(html,/Out \/ Questionable · SOURCE DISAGREEMENT/);
  assert.match(html,/Limited/);
  assert.match(html,/Selected-game\/week applicability unavailable/);
  assert.ok(!html.includes('2026 W6'));
});
