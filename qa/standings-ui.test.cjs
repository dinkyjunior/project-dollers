'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../assets/nfl-dashboard.js'),'utf8');
const feed = JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/data/standings.json'),'utf8'));
const research = JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/data/current.json'),'utf8'));
const activeWeek = String(feed.currentBrowsingWeek);
const screenshotOrder = {
  AFC:['KC','BAL','JAX','BUF','NE','DEN','LV','CLE','PIT','CIN','NYJ','IND','HOU','MIA','LAC','TEN'],
  NFC:['SF','MIN','NYG','CAR','GB','DET','CHI','SEA','LA','ATL','PHI','DAL','WAS','TB','NO','ARI']
};
const clone = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

function harness() {
  let clock = Date.parse(feed.source.retrievedAt) + 3600000, timerId = 0, handle;
  const timers = new Map(), requests = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{id,innerHTML:'',textContent:'',value:'',scrollTop:0,classList:{toggle() {}},setAttribute() {},removeAttribute() {},querySelectorAll:() => [],querySelector:selector => node(selector)});
    return nodes.get(id);
  };
  const document = {baseURI:'http://localhost/project-dollers/',hidden:false,getElementById:node,querySelector:node,querySelectorAll:() => [],addEventListener() {}};
  const window = {addEventListener() {},PDTeamDetails:{getDataset:() => ({season:research.season,_sourceIntegrity:{status:'verified'},teams:{}})}};
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const sandbox = {window,document,Date:TestDate,URL,AbortController,
    setTimeout(fn,delay) { const id = ++timerId; timers.set(id,{fn,at:clock+delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch:async (url,options) => { requests.push({url:String(url),options}); return handle(url,options); }};
  vm.createContext(sandbox); vm.runInContext(source,sandbox);
  const response = (body = feed,status = 200,etag = 'feed-v1') => ({status,ok:status >= 200 && status < 300,headers:{get:key => key === 'ETag' ? etag : key === 'Last-Modified' ? feed.source.retrievedAt : null},json:async () => clone(body)});
  handle = async () => response();
  return {api:window.PDNFLDashboard,requests,timers,response,node,setHandle(value) { handle = value; },
    render(data = research,state = {week:activeWeek,currentBrowsingWeek:activeWeek,conference:'AFC'}) {
      window.PDNFLDashboard.render({data,state,esc:String,number:value => value ?? '—',logo:value => String(value),teamName:value => String(value),date:value => String(value),time:value => String(value),timestamp:value => String(value),sourceNote:() => ''});
      return state;
    },
    async advance(ms) { clock += ms; const due = [...timers.entries()].filter(([,timer]) => timer.at <= clock); for (const [id,timer] of due) if (timers.delete(id)) timer.fn(); await flush(); }};
}

(async () => {
  let groups = 0;
  {
    const h = harness();
    assert.equal(await h.api.refreshStandings(),true,'genuine standalone feed validates independently of research books');
    const loaded = h.api.getStandingsDataset();
    assert.equal(loaded.weeks[activeWeek].coverage.finalGames,feed.games.filter(game => game.week <= loaded.weeks[activeWeek].throughWeek).length);
    if (loaded.weeks[activeWeek].throughWeek === 5) assert.equal(loaded.weeks[activeWeek].conferences.AFC.find(team => team.abbr === 'BUF').record,'4–1','the missing Buffalo final is included');
    h.setHandle(async () => h.response(null,304));
    await h.api.refreshStandings();
    assert.equal(h.requests[1].options.headers['If-None-Match'],'feed-v1','conditional check avoids downloading unchanged records');
    assert.equal(h.requests[1].options.cache,'no-cache');
    assert.equal(h.api.getStandingsDataset(),loaded,'304 retains validated dataset identity');
    assert.match(h.requests[0].url,/\/project-dollers\/assets\/data\/standings\.json$/,'subpath-safe source URL');
    groups++;
  }
  {
    const h = harness(); await h.api.refreshStandings(); const good = h.api.getStandingsDataset();
    const bad = clone(feed); bad.weeks[activeWeek].conferences.AFC.find(team => team.abbr === 'BUF').w++;
    h.setHandle(async () => h.response(bad));
    assert.equal(await h.api.refreshStandings(),false,'record totals that do not reconcile with retained final scores are rejected');
    assert.equal(h.api.getStandingsDataset(),good);
    const old = clone(feed); old.source.retrievedAt = new Date(Date.parse(feed.source.retrievedAt)-1000).toISOString();
    h.setHandle(async () => h.response(old));
    assert.equal(await h.api.refreshStandings(),false,'older source retrieval cannot roll verified records back');
    assert.equal(h.api.getStandingsDataset(),good);
    h.setHandle(async () => h.response(null,503));
    assert.equal(await h.api.refreshStandings(),false,'HTTP failures retain last validated records');
    assert.equal(h.api.getStandingsDataset(),good);
    groups++;
  }
  {
    const h = harness(); h.setHandle(async () => h.response(null,503));
    assert.equal(await h.api.refreshStandings(),false);
    const count = h.requests.length;
    await h.advance(14999); assert.equal(h.requests.length,count,'failure backoff avoids request loops');
    h.setHandle(async () => h.response());
    await h.advance(1); assert.equal(h.requests.length,count+1,'failed standalone load retries automatically');
    assert.equal(h.api.getStandingsDataset().season,feed.season);
    groups++;
  }
  {
    const h = harness(); let complete;
    h.setHandle(() => new Promise(resolve => { complete = resolve; }));
    const first = h.api.refreshStandings(), second = h.api.refreshStandings();
    assert.equal(first,second,'refresh requests share a single in-flight load'); await flush();
    assert.equal(h.requests.length,1); complete(h.response()); await first;
    h.setHandle((url,options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',() => { const error = new Error('timeout'); error.name = 'AbortError'; reject(error); })));
    const pending = h.api.refreshStandings(); await flush(); await h.advance(15000);
    assert.equal(await pending,false,'timed-out requests retain validated standings');
    assert.ok(h.api.getStandingsDataset()); groups++;
  }
  {
    const h = harness(); await h.api.refreshStandings();
    const records = h.api.getStandingsDataset(), week = records.weeks[activeWeek];
    const snapshot = {...research.weeks[activeWeek],throughWeek:week.throughWeek,recordsFeed:records};
    const buffalo = week.conferences.AFC.find(team => team.abbr === 'BUF');
    const results = h.api.deriveTeamResults(research,snapshot,buffalo);
    assert.equal(results.complete,true,'new record form uses its exact matching final-score evidence');
    assert.equal(results.games.length,buffalo.w + buffalo.l + buffalo.ties);
    if (week.throughWeek === 5) assert.equal(results.form.at(-1),'W');
    assert.equal(results.provenance.retrievedAt,records.source.retrievedAt);
    const incomplete = {...snapshot,recordsFeed:{...records,games:records.games}};
    // Remove the actual last Buffalo result without depending on provider ID spelling.
    incomplete.recordsFeed.games = records.games.filter(game => game.id !== results.games.at(-1).game.id);
    assert.equal(h.api.deriveTeamResults(research,incomplete,buffalo).complete,false,'missing retained results never fabricate form or home/away splits');
    groups++;
  }
  {
    const h = harness(); await h.api.refreshStandings();
    h.render();
    assert.match(h.node('nfl-standings-source').textContent,feed.ranking.official ? /Order: ESPN conference standings/ : /official conference ranking was not verified/,'ranking source or limitation is visible');
    assert.match(h.node('nfl-standings-source').textContent,new RegExp(feed.source.retrievedAt));
    const currentCaption = h.node('[data-page="nfl"] .through-week').textContent;
    assert.match(currentCaption,/finals/,'exact result coverage is visible');
    const historyWeek = String(Math.max(1,Number(activeWeek)-1));
    h.render(research,{week:historyWeek,currentBrowsingWeek:activeWeek,conference:'AFC'});
    assert.doesNotMatch(h.node('nfl-standings-source').textContent,new RegExp(feed.source.retrievedAt),'manual historical selection preserves its original source snapshot');
    const newerResearch = clone(research);
    const latest = new Date(Date.parse(feed.source.retrievedAt)+1000).toISOString();
    newerResearch.sources.find(source => source.id === 'nflverse_games').retrievedAt = latest;
    h.render(newerResearch);
    assert.match(h.node('nfl-standings-source').textContent,new RegExp(feed.source.retrievedAt),'a newer retrieval timestamp on incomplete research does not remove verified source order');
    newerResearch.weeks[activeWeek].conferences = clone(feed.weeks[activeWeek].conferences);
    h.render(newerResearch);
    assert.match(h.node('nfl-standings-source').textContent,new RegExp(feed.source.retrievedAt),'a date-only primary refresh with identical complete records retains verified conference order');
    if (feed.ranking.official) assert.match(h.node('table-caption').textContent,/standings · ESPN/);
    // Model a later validated score correction with unchanged game count.
    // Only this in-memory test fixture changes; published source data is preserved.
    newerResearch.weeks[activeWeek].conferences.AFC[0].pointsFor++;
    h.render(newerResearch);
    assert.match(h.node('nfl-standings-source').textContent,new RegExp(latest),'genuinely changed primary records with equal coverage take precedence over older standalone records');
    assert.doesNotMatch(h.node('nfl-standings-source').textContent,new RegExp(feed.source.retrievedAt));
    newerResearch.weeks[activeWeek].throughWeek = feed.weeks[activeWeek].throughWeek + 1;
    h.render(newerResearch);
    assert.match(h.node('nfl-standings-source').textContent,new RegExp(latest),'primary records covering a later week take precedence');
    groups++;
  }
  if (feed.ranking.official) {
    const h = harness(); assert.equal(await h.api.refreshStandings(),true);
    const renderedRows = () => [...h.node('standings-rows').innerHTML.matchAll(/class="stand-row[^\"]*" role="row"><span role="cell" title="[^\"]*">(\d+)<\/span>.*?data-team="([A-Z]+)"/g)].map(match => ({rank:Number(match[1]),abbr:match[2]}));
    for (const conference of ['AFC','NFC']) {
      const state = {week:activeWeek,currentBrowsingWeek:activeWeek,conference,standingsExpanded:true,nflSort:'PCT'};
      h.render(research,state);
      assert.equal(state.nflSort,'SOURCE','legacy PCT selection migrates to provider conference order');
      const expected = feed.conferenceOrder.conferences[conference];
      assert.deepEqual(renderedRows().map(team => team.abbr),expected,`${conference} default follows all16 verified provider seeds`);
      assert.deepEqual(renderedRows().map(team => team.rank),Array.from({length:16},(_,index) => index+1));
      if (feed.currentBrowsingWeek === 6 && feed.weeks[activeWeek].throughWeek === 5) assert.deepEqual(expected,screenshotOrder[conference],`${conference} matches the complete user ESPN screenshot, including all tie groups`);
      state.nflSort = 'PF'; h.render(research,state);
      const sourceRows = feed.weeks[activeWeek].conferences[conference];
      assert.ok(renderedRows().every(team => sourceRows.find(sourceTeam => sourceTeam.abbr === team.abbr).rank === team.rank),'explicit points analysis retains actual ESPN rank numbers');
      assert.match(h.node('table-caption').textContent,/PF analysis/,'analysis ordering has a separate visible label');
      state.nflSort = 'SOURCE'; h.render(research,state);
      assert.deepEqual(renderedRows().map(team => team.abbr),expected,'returning to source order restores exact provider ranking');
    }
    const good = h.api.getStandingsDataset();
    const corrupted = [];
    let bad = clone(feed); bad.weeks[activeWeek].conferences.NFC.reverse(); corrupted.push(bad);
    bad = clone(feed); bad.weeks[activeWeek].conferences.AFC[1].rank = 1; corrupted.push(bad);
    bad = clone(feed); bad.sources.find(source => source.id === bad.ranking.sourceId).status = 'unavailable'; corrupted.push(bad);
    bad = clone(feed); bad.conferenceOrder.season--; corrupted.push(bad);
    bad = clone(feed); bad.conferenceOrder.conferences.NFC[3] = 'SEA'; corrupted.push(bad);
    bad = clone(feed); delete bad.conferenceOrder; corrupted.push(bad);
    bad = clone(feed); bad.ranking.official = false; corrupted.push(bad);
    const historicalWeek = Object.keys(feed.weeks).find(week => week !== activeWeek);
    bad = clone(feed); bad.weeks[historicalWeek].conferences.AFC[0].rank = 1; corrupted.push(bad);
    for (const invalidFeed of corrupted) {
      h.setHandle(async () => h.response(invalidFeed));
      assert.equal(await h.api.refreshStandings(),false,'unverified, duplicated, misordered or wrong-season provider ranks are rejected');
      assert.equal(h.api.getStandingsDataset(),good,'invalid provider evidence preserves the entire last verified dataset');
    }
    groups++;
  }
  console.log(`PASS: ${groups} independent standings UI groups (record reconciliation, conditional requests, rollback, retained failure/retry/timeout, sourced form, historical preservation, newer-primary precedence, all32 ESPN screenshot ranks, analysis rank preservation, invalid provider evidence rejection).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
