#!/usr/bin/env node
'use strict';

// Executes the actual private resolver from the runtime file. Expected outcomes
// are fixture-ID contracts, not a second implementation of its sorting policy.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname,'../..');
const source = fs.readFileSync(path.join(root,'assets/team-details.js'),'utf8');
const resolver = source.match(/  function nextGame\(\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(resolver,'Actual runtime nextGame function is present');

function resolve(book,abbr) {
  const club = book.teams[abbr];
  const context = vm.createContext({dataset:book,state:{team:abbr},team:() => club,games:() => club?.games || []});
  return vm.runInContext(`${resolver}\nnextGame()`,context);
}
function game(id,week,extra = {}) {
  return {id,season:2026,week,home_team:'DAL',away_team:'TB',status:'scheduled',kickoffUtc:`2026-10-${String(week+4).padStart(2,'0')}T00:15:00Z`,...extra};
}
function book(games,upcomingGameId) {
  return {season:2026,teams:{DAL:{games,upcomingGameId}}};
}

test('Published all-club explicit upcoming IDs resolve to the same source fixture',() => {
  const data = JSON.parse(fs.readFileSync(path.join(root,'assets/data/team-details.json'),'utf8'));
  let checked = 0;
  for (const [abbr,club] of Object.entries(data.teams)) {
    if (!club.upcomingGameId) continue;
    const expected = club.games.find(row => row.id === club.upcomingGameId);
    assert.ok(expected,`${abbr} upcoming source ID exists`);
    assert.equal(resolve(data,abbr)?.id,expected.id,abbr);
    checked++;
  }
  assert.equal(checked,32,'Every current club has its source-designated upcoming fixture');
});

test('Source-designated upcoming fixture wins over an older unfinished game',() => {
  const older = game('older-unfinished',5);
  const upcoming = game('source-upcoming',6,{home_team:'GB',away_team:'DAL'});
  assert.equal(resolve(book([older,upcoming],'source-upcoming'),'DAL'),upcoming);
});

test('Selecting the next scheduled team fixture does not change the current research fixture',() => {
  const team = JSON.parse(fs.readFileSync(path.join(root,'assets/data/team-details.json'),'utf8'));
  const research = JSON.parse(fs.readFileSync(path.join(root,'assets/data/matchup-breakdown.json'),'utf8'));
  const selected = resolve(team,'DAL');
  assert.equal(selected.id,team.teams.DAL.upcomingGameId);
  assert.equal(selected.id,research.teams.DAL.nextScheduledGameId);
  assert.notEqual(selected.id,research.teams.DAL.researchGameId);
  assert.equal(research.teams.DAL.fixtureReports[research.teams.DAL.researchGameId].eventStatus.state,'in');
});

for (const [label,extra] of [
  ['wrong season',{season:2025}],
  ['another club',{home_team:'GB',away_team:'TB'}],
  ['final with verified scores',{status:'final',home_score:7,away_score:0}],
  ['final even when scores are unavailable',{status:'final',home_score:null,away_score:null}],
  ['cancelled',{status:'cancelled'}],
  ['postponed',{status:'postponed'}]
]) test(`Invalid explicit fixture: ${label} cannot supersede a valid unfinished game`,() => {
  const fallback = game('fallback',6);
  const invalid = game('explicit-invalid',5,extra);
  assert.equal(resolve(book([invalid,fallback],'explicit-invalid'),'DAL'),fallback);
});

test('Missing or unknown explicit ID retains earliest unfinished fallback',() => {
  const earlier = game('earlier',5),later = game('later',6);
  for (const id of [undefined,null,'','not-in-source'])
    assert.equal(resolve(book([later,earlier],id),'DAL'),earlier);
});

test('No valid current-club unfinished fixture returns unavailable',() => {
  const invalid = game('completed',5,{status:'final',home_score:7,away_score:0});
  assert.equal(resolve(book([invalid],'completed'),'DAL'),null);
  assert.equal(resolve(book([],null),'DAL'),null);
});

test('TBD kickoff and neutral venue retain the explicit source identity',() => {
  const earlier = game('earlier',5);
  const selected = game('source-tbd-neutral',6,{kickoffUtc:null,gameday:'2026-10-19',neutral:true});
  assert.equal(resolve(book([earlier,selected],selected.id),'DAL'),selected);
});
