'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto,createHash} = require('node:crypto');
const root = path.resolve(__dirname,'../..');
const source = fs.readFileSync(path.join(root,'assets/team-quarters.js'),'utf8');
const game = {id:'2026_05_TB_DAL',season:2026,week:5,status:'final',home_team:'DAL',away_team:'TB',home_score:16,away_score:24};
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(change = () => {}) {
  const value = {schemaVersion:1,...clone(game),retrievedAt:'2026-10-12T08:45:42Z',quarters:{DAL:[7,3,0,6],TB:[0,7,17,0]},verification:{status:'verified',scoreCrosscheck:'verified',quarterArithmetic:'verified'},provenance:{quarters:{status:'verified',origin:'reported',sourceIds:['espn']}},sourceIds:['espn'],sources:[{id:'espn',status:'verified',httpStatus:200,url:'https://example.com/summary',retrievedAt:'2026-10-12T08:45:42Z',sha256:'a'.repeat(64)}],disagreements:[],unavailable:[]};
  change(value);
  const bytes = Buffer.from(JSON.stringify(value));
  const entry = {...clone(game),detailUrl:`assets/data/game-reports/${game.id}.json`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),verification:clone(value.verification)};
  return {value,bytes,entry};
}
function harness(initial = fixture(), options = {}) {
  let current = initial, mounted = true, now = 100000;
  const timers = new Map(), events = [], fetches = [], listeners = new Map();let nextTimer = 1;
  const on = (name,fn) => {if (!listeners.has(name)) listeners.set(name,[]);listeners.get(name).push(fn);};
  class FakeDate extends Date {static now() {return now;}}
  const doc = {hidden:false,querySelectorAll:() => mounted ? [{dataset:{pdQuarterGame:game.id},closest:s => s === '[hidden]' ? null : {classList:{contains:() => true}}}] : [],addEventListener:on,dispatchEvent:event => {events.push(event);for (const fn of listeners.get(event.type) || []) fn(event);}};
  const win = {crypto:webcrypto,addEventListener:on,PDSourceIntegrity:{getLastCatalog:() => options.noCatalog ? null : {schemaVersion:1,retrievedAt:'2026-10-12T08:45:42Z',games:{[game.id]:current.entry}}},PDGameReport:{getCachedReport:() => options.cached ? {hash:current.entry.sha256,value:current.value} : null}};
  const context = {window:win,document:doc,Date:FakeDate,AbortController,TextDecoder,CustomEvent:class {constructor(type,init) {this.type=type;this.detail=init.detail;}},setTimeout:(fn,ms) => {const id=nextTimer++;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async (url,settings) => {fetches.push({url,settings});if(options.networkError)throw new Error('offline');if(options.httpError)return {ok:false,status:503};const bytes=options.corrupt === 'hash' ? Buffer.from(current.bytes.toString().replace('reported','REPORTed')) : options.corrupt ? Buffer.concat([current.bytes,Buffer.from(' ')]) : current.bytes;return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}};
  vm.runInNewContext(source,context);
  return {api:win.PDTeamQuarters,events,fetches,options,set current(value){current=value;},set mounted(value){mounted=value;},async settle(){for(let i=0;i<1000&&win.PDTeamQuarters.getState(game.id)?.status==='loading';i++)await new Promise(resolve=>setTimeout(resolve,1));},async tick(ms){now+=ms;const due=[...timers].filter(([,t])=>t.at<=now);for(const [id,t]of due){timers.delete(id);t.fn();}await this.settle();},emit(type){for(const fn of listeners.get(type)||[])fn({type});}};
}
test('No request until expansion; repeated renders share an in-flight and successful load',async()=>{
  const h=harness();assert.equal(h.fetches.length,0);assert.match(h.api.render(game,'DAL'),/Loading quarter scores/);h.api.render(game,'DAL');await h.settle();
  assert.equal(h.fetches.length,1);assert.equal(h.api.getState(game.id).status,'ready');assert.equal(h.api.getState(game.id).retained,false);const html=h.api.render(game,'TB');assert.match(html,/<th scope="row">TB<\/th><td>0<\/td><td>7<\/td><td>17<\/td><td>0<\/td><td>24<\/td>/);assert.match(html,/<th scope="row">DAL<\/th><td>7<\/td><td>3<\/td><td>0<\/td><td>6<\/td><td>16<\/td>/);assert.doesNotMatch(html,/yards|Open game report|href=/i);assert.equal(h.fetches.length,1);assert.equal(h.events.at(-1).type,'pd:team-quarters-updated');
});
test('Previously checksum-verified report cache is reused without downloading bytes',async()=>{const h=harness(fixture(),{cached:true});h.api.render(game,'DAL');await h.settle();assert.equal(h.fetches.length,0);assert.equal(h.api.getState(game.id).status,'ready');});
test('Reported overtime is included, without padding a missing opponent period',async()=>{
  const f=fixture(r=>{r.quarters={DAL:[7,3,0,6,0],TB:[0,7,17,0,0]};});const h=harness(f);h.api.render(game,'DAL');await h.settle();assert.match(h.api.render(game,'DAL'),/<th scope="col">OT<\/th>/);
  const bad=harness(fixture(r=>{r.quarters.DAL.push(0);}));bad.api.render(game,'DAL');await bad.settle();assert.equal(bad.api.getState(game.id).status,'unavailable');assert.doesNotMatch(bad.api.render(game,'DAL'),/<table/);
});
for(const [label,change]of [
  ['quarter sum does not match final',r=>r.quarters.DAL[0]=6],
  ['quarter is null',r=>r.quarters.DAL[0]=null],
  ['quarter is a string',r=>r.quarters.DAL[0]='7'],
  ['quarter is negative',r=>r.quarters.DAL[0]=-7],
  ['quarter source is unverified',r=>r.sources[0].status='unavailable'],
  ['quarter-specific conflict',r=>r.disagreements.push({field:'quarters.DAL'})],
  ['report wrong season',r=>r.season=2025],
  ['quarter provenance is computed',r=>r.provenance.quarters.origin='computed']
])test(`Rejects ${label} without invented allocation`,async()=>{const h=harness(fixture(change));h.api.render(game,'DAL');await h.settle();assert.equal(h.api.getState(game.id).status,'unavailable');assert.doesNotMatch(h.api.render(game,'DAL'),/<table/);assert.equal(h.fetches.length,1);});
test('An unrelated passing-yard disagreement does not discard verified quarter points',async()=>{const h=harness(fixture(r=>r.disagreements.push({field:'netPassing'})));h.api.render(game,'DAL');await h.settle();assert.equal(h.api.getState(game.id).status,'ready');});
test('Checksum or byte mismatch retries automatically and recovers while expansion stays mounted',async()=>{const h=harness(fixture(),{corrupt:true});h.api.render(game,'DAL');await h.settle();assert.equal(h.api.getState(game.id).status,'error');assert.doesNotMatch(h.api.render(game,'DAL'),/<table/);h.options.corrupt=false;await h.tick(5000);assert.equal(h.fetches.length,2);assert.equal(h.api.getState(game.id).status,'ready');});
test('Failed requests stop retry downloads when collapsed and resume on next expansion',async()=>{const h=harness(fixture(),{networkError:true});h.api.render(game,'DAL');await h.settle();h.mounted=false;await h.tick(5000);assert.equal(h.fetches.length,1);h.options.networkError=false;h.mounted=true;h.api.render(game,'DAL');await h.settle();assert.equal(h.fetches.length,2);assert.equal(h.api.getState(game.id).status,'ready');});
test('A changed catalog triggers one new load; failure retains truthful previous verified quarters',async()=>{const h=harness();h.api.render(game,'DAL');await h.settle();const next=fixture(r=>{r.quarters.DAL=[0,10,0,6];});h.current=next;h.options.networkError=true;h.api.render(game,'DAL');await h.settle();const retained=h.api.render(game,'DAL');assert.equal(h.api.getState(game.id).retained,true);assert.match(retained,/Retained verified quarter scores/);assert.match(retained,/<td>7<\/td><td>3<\/td>/);h.options.networkError=false;await h.tick(5000);assert.match(h.api.render(game,'DAL'),/<td>0<\/td><td>10<\/td>/);assert.equal(h.fetches.length,3);assert.equal(h.api.getState(game.id).retained,false);});
test('A source final-score mismatch hides old quarters and makes no new report request',async()=>{const h=harness();h.api.render(game,'DAL');await h.settle();const html=h.api.render({...game,home_score:17},'DAL');assert.doesNotMatch(html,/<table/);assert.equal(h.fetches.length,1);});
test('Catalog readiness is retried without downloading a duplicate catalog',async()=>{const h=harness(fixture(),{noCatalog:true,cached:true});h.api.render(game,'DAL');assert.equal(h.api.getState(game.id).status,'error');h.options.noCatalog=false;await h.tick(15000);assert.equal(h.api.getState(game.id).status,'ready');assert.equal(h.fetches.length,0);assert.equal(h.events.at(-1).detail.status,'ready');});

test('Same-length tampering is rejected by SHA-256 before any quarter points are admitted',async()=>{const h=harness(fixture(),{corrupt:'hash'});h.api.render(game,'DAL');await h.settle();assert.equal(h.api.getState(game.id).status,'error');assert.match(h.api.getState(game.id).error,/checksum/);assert.doesNotMatch(h.api.render(game,'DAL'),/<table/);});
test('HTTP503 is retried after the pending lock clears and online recovery preserves the event contract',async()=>{const h=harness(fixture(),{httpError:true});h.api.render(game,'DAL');await h.settle();assert.equal(h.api.getState(game.id).status,'error');h.options.httpError=false;h.emit('online');await h.settle();assert.equal(h.api.getState(game.id).status,'ready');assert.equal(h.fetches.length,2);assert.deepEqual(Object.keys(h.events.at(-1).detail).sort(),['gameId','retained','status']);});
test('All160 published default Last5 entries render their actual validated quarter vectors from shared cache',async()=>{
  const book=JSON.parse(fs.readFileSync(path.join(root,'assets/data/team-details.json'),'utf8')),index=JSON.parse(fs.readFileSync(path.join(root,'assets/data/game-reports.json'),'utf8'));
  const reports=new Map();let requests=0;
  const doc={hidden:false,querySelectorAll:()=>[],addEventListener:()=>{},dispatchEvent:()=>{}};
  const win={crypto:webcrypto,addEventListener:()=>{},PDSourceIntegrity:{getLastCatalog:()=>index},PDGameReport:{getCachedReport:id=>{const e=index.games[id];if(!reports.has(id))reports.set(id,JSON.parse(fs.readFileSync(path.join(root,e.detailUrl),'utf8')));return {hash:e.sha256,value:reports.get(id)};}}};
  vm.runInNewContext(source,{window:win,document:doc,AbortController,TextDecoder,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setTimeout,clearTimeout,fetch:()=>{requests++;throw new Error('Shared verified reports must not download again');}});
  const rows=[];
  for(const [abbr,club]of Object.entries(book.teams)){
    const games=club.games.filter(g=>g.status==='final'&&Number.isInteger(g.home_score)&&Number.isInteger(g.away_score)&&(!g.seasonType||['REG','2'].includes(String(g.seasonType)))).sort((a,b)=>String(b.kickoffUtc||b.gameday).localeCompare(String(a.kickoffUtc||a.gameday))||b.season-a.season||b.week-a.week).slice(0,5);
    for(const g of games){rows.push([abbr,g]);win.PDTeamQuarters.render(g,abbr);}
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows.length,160);assert.equal(reports.size,82);
  for(const [abbr,g]of rows){const html=win.PDTeamQuarters.render(g,abbr),report=reports.get(g.id);assert.equal(win.PDTeamQuarters.getState(g.id).status,'ready',g.id);for(const a of [g.home_team,g.away_team])assert.ok(html.includes(`<th scope="row">${a}</th>${report.quarters[a].map(q=>`<td>${q}</td>`).join('')}`),`${g.id} ${a} genuine quarter row`);}
  assert.equal(requests,0);
});
