'use strict';
// Exercise the original application controllers in a non-browser VM. Source
// fixtures are synthetic and never written to the app's published data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname,'../../..');
const source = fs.readFileSync(path.join(ROOT,'assets/app.js'),'utf8');
const functions = [
  ['openPage','openGameReport'],
  ['changeWeek','renderRoster'],
  ['applySnapshot','startUpdates']
].map(([name,next]) => source.slice(source.indexOf(`  function ${name}(`),source.indexOf(`  function ${next}(`))).join('\n');
const stateDeclaration = source.split('\n').find(line => line.includes('  const state = '));
const results = [];

function snapshot(currentWeek, maxWeek=18) {
  return {currentWeek,season:2026,weeks:Object.fromEntries(Array.from({length:maxWeek},(_,i)=>[String(i+1),{throughWeek:i+1}])),
    roster:[],playerHistory:{sha256:'unchanged-source'},sources:[]};
}
function harness(route='nfl') {
  const events=[],hashes=[],rendered=[];
  const pages=['home','nfl'].map(id => {
    const classes=new Set(id==='home'?['active']:[]);
    return {dataset:{page:id},hidden:id!=='home',classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},querySelector(){return {scrollTop:3};}};
  });
  const sandbox={data:null,pages,assets:{},window:{},location:{hash:`#${route}`},history:{pushState(_a,_b,url){hashes.push(url);sandbox.location.hash=url;}},
    historyHash:'unchanged-source',historyError:null,loadHistory(){throw new Error('Unexpected player-history reload');},
    document:{querySelector(){return pages.find(p=>p.classList.contains('active'));},querySelectorAll(){return [];},dispatchEvent(event){events.push(event);}},
    CustomEvent:class {constructor(name,options){this.type=name;this.detail=options.detail;}},
    preserveScroll(fn){fn();},renderAll(){rendered.push(sandbox.fixtureState.week);},renderDashboard(){},renderRoster(){},renderTeamMatchup(){}};
  vm.createContext(sandbox);
  vm.runInContext(`${stateDeclaration}\nglobalThis.fixtureState=state;\n${functions}`,sandbox);
  sandbox.openPage(route,false);
  sandbox.events=events;sandbox.hashes=hashes;sandbox.rendered=rendered;
  return sandbox;
}
function check(name, fn) {fn();results.push({name,status:'pass'});}

check('Direct #nfl cold load follows the current week, then advances at the next verified week',()=>{
  const app=harness('nfl');app.applySnapshot(snapshot(5));
  assert.equal(app.fixtureState.week,'5');assert.equal(app.fixtureState.weekMode,'latest');
  assert.equal(app.pages.find(p=>p.classList.contains('active')).dataset.page,'nfl');
  app.applySnapshot(snapshot(6));assert.equal(app.fixtureState.week,'6');
  assert.equal(app.window.PD_DATA.currentWeek,6);assert.equal(app.fixtureState.weekMode,'latest');
  assert.equal(app.location.hash,'#nfl');assert.deepEqual(app.hashes,[]);
});
check('A manually selected historical period remains pinned across updates and navigation',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.changeWeek('2');
  assert.equal(app.fixtureState.weekMode,'pinned');
  app.openPage('home');app.openPage('nfl');app.applySnapshot(snapshot(6));
  assert.equal(app.fixtureState.week,'2');assert.equal(app.fixtureState.weekMode,'pinned');
});
check('A manually selected future research period stays selected when Current advances',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.changeWeek('7');app.applySnapshot(snapshot(6));
  assert.equal(app.fixtureState.week,'7');assert.equal(app.fixtureState.weekMode,'pinned');
});
check('Selecting Current after historical research restores automatic week tracking',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.changeWeek('2');app.changeWeek('5');app.applySnapshot(snapshot(6));
  assert.equal(app.fixtureState.week,'6');assert.equal(app.fixtureState.weekMode,'latest');
});
check('Missing research selection resets safely to Current and retains non-period controls',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.changeWeek('17');
  Object.assign(app.fixtureState,{conference:'NFC',nflTab:'players',nflDivision:'NFC East',nflSort:'PA',nflForm:5});
  app.applySnapshot(snapshot(6,10));
  assert.equal(app.fixtureState.week,'6');assert.equal(app.fixtureState.weekMode,'latest');
  for(const [key,value] of Object.entries({conference:'NFC',nflTab:'players',nflDivision:'NFC East',nflSort:'PA',nflForm:5}))assert.equal(app.fixtureState[key],value);
});
check('Unknown manual week cannot alter the selected period or mode',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.changeWeek('2');app.changeWeek('99');
  assert.equal(app.fixtureState.week,'2');assert.equal(app.fixtureState.weekMode,'pinned');
});
check('Failed rendering rolls back the snapshot, selected week and follow mode',()=>{
  const app=harness();const old=snapshot(5);app.applySnapshot(old);app.changeWeek('17');
  let first=true;app.renderAll=()=>{if(first){first=false;throw new Error('Synthetic render failure');}};
  assert.throws(()=>app.applySnapshot(snapshot(6,10)),/Synthetic render failure/);
  assert.equal(app.data,old);assert.equal(app.window.PD_DATA,old);
  assert.equal(app.fixtureState.week,'17');assert.equal(app.fixtureState.weekMode,'pinned');
});
check('A source correction within the same current week preserves Current and other controls',()=>{
  const app=harness();app.applySnapshot(snapshot(5));app.fixtureState.conference='NFC';app.fixtureState.nflTab='recap';
  app.applySnapshot(snapshot(5));assert.equal(app.fixtureState.week,'5');assert.equal(app.fixtureState.weekMode,'latest');
  assert.equal(app.fixtureState.conference,'NFC');assert.equal(app.fixtureState.nflTab,'recap');
});

const receipt={status:'pass',appJsSha256:crypto.createHash('sha256').update(source).digest('hex'),
  qualification:'Unmodified application function bodies exercised in a non-browser VM; direct #nfl route is supported. No new query routing is asserted. Native rendering/navigation checks remain separate.',cases:results.length,results};
fs.writeFileSync(path.join(__dirname,'week-selection-results.json'),JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
