'use strict';
// Independent review of the dashboard consumer written by the root agent.
// Executes unmodified function bodies in a non-browser VM; it does not assert
// native layout, fonts, rendering or actual provider truth for these fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const dashboard=fs.readFileSync(path.join(ROOT,'assets/nfl-dashboard.js'),'utf8');
const app=fs.readFileSync(path.join(ROOT,'assets/app.js'),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function extract(body,name,next){const start=body.indexOf(`  function ${name}(`),end=body.indexOf(`  function ${next}(`);assert.ok(start>=0&&end>start);return body.slice(start,end);}
function harness(snapshot,kind){
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',title:'',setAttribute(){}});return nodes.get(id);};
  const state={week:'5',conference:'AFC',standingsExpanded:false,nflLeaderExpanded:new Set()};
  const data={season:2026,currentWeek:5,weeks:{'5':snapshot},teams:[],sources:[{id:'nflverse_games',name:'Games provider',retrievedAt:'2026-10-12T10:00:00Z'}],provenance:{standings:{sourceIds:['nflverse_games']}}};
  const sandbox={context:null,bound:true,state,data,window:{},document:{getElementById:get,querySelector:()=>get('queried'),querySelectorAll:()=>[]},
    standings(){},initializeState(){},matchup(){return 'UNCHANGED MATCHUP';},preview(){},
    esc,number:v=>v===null||v===undefined?'—':String(v),teamName:v=>v,date:()=>'',time:()=>'',timestamp:v=>v,
    sourceNote:(group,label)=>`SOURCE:${group}:${label}`};
  vm.createContext(sandbox);
  if(kind==='dashboard'){
    const helpers=dashboard.split('\n').filter(line=>['  const $ =','  const exists =','  const finite =','  const rightChevron =','  const readablePlayerName ='].some(prefix=>line.startsWith(prefix))).join('\n');
    vm.runInContext(helpers+'\n'+extract(dashboard,'sourceContext','record')+extract(dashboard,'leaderboards','matchup')+extract(dashboard,'recap','preview')+extract(dashboard,'render','rerender'),sandbox);
    sandbox.render({data,state,esc,number:sandbox.number,teamName:sandbox.teamName,timestamp:sandbox.timestamp});
  }else{
    vm.runInContext('const $ = id => document.getElementById(id);\nconst available = value => value !== null && value !== undefined && value !== "";\n'+extract(app,'leaderboard','matchup')+extract(app,'recap','renderDashboard')+extract(app,'renderDashboard','playerDetails'),sandbox);
    sandbox.renderDashboard();
  }
  return {nodes,get,sandbox};
}
function fixture(){return {throughWeek:5,leadersWeek:4,recapWeek:5,conferences:{AFC:[],NFC:[]},leaders:{QB:[],RB:[],WR:[]},
  leadersContext:{partialWeek:true,completedGamesInWeek:11,scheduledGamesInWeek:15},
  recapContext:{partialWeek:true,completedGamesInWeek:13,scheduledGamesInWeek:15},
  recap:[{id:'TEST_FINAL',season:2026,week:5,status:'final',away_team:'DAL',home_team:'HOU',away_score:0,home_score:7}]};}
const results=[];function check(name,fn){fn();results.push({name,status:'pass'});}
check('Root consumer separates published-statistics coverage from final-score recap coverage',()=>{
  const view=harness(fixture(),'dashboard');
  assert.equal((view.get('ladder-leaders').innerHTML.match(/11 of 15 games with published statistics/g)||[]).length,3);
  assert.doesNotMatch(view.get('ladder-leaders').innerHTML,/13 of 15/);
  assert.match(view.get('recap-content').innerHTML,/13 of 15 games final/);
  assert.doesNotMatch(view.get('recap-content').innerHTML,/11 of 15/);
  assert.equal(view.get('recap-title').textContent,'WEEK 5 · RESULTS');
  assert.match(view.get('nfl-data-context').textContent,/records W5 · stats W4 · recap W5/);
  assert.match(view.get('nfl-data-context').title,/2026-10-12T10:00:00Z/);
  assert.match(view.get('recap-content').innerHTML,/0–7/,'Shutout remains a sourced zero rather than unavailable');
});
check('Root consumer explicit-null statistics never substitutes the final-score week',()=>{
  const s=fixture();s.leadersWeek=null;s.leadersContext={partialWeek:false};
  const view=harness(s,'dashboard');
  assert.equal((view.get('ladder-leaders').innerHTML.match(/AWAITING VERIFIED WEEK/g)||[]).length,3);
  assert.doesNotMatch(view.get('ladder-leaders').innerHTML,/PASSING · WEEK 5/);
  assert.match(view.get('nfl-data-context').textContent,/stats unavailable · recap W5/);
});
check('Root consumer supports older context-free snapshots without inventing publication counts',()=>{
  const s=fixture();delete s.leadersContext;delete s.recapContext;delete s.recapWeek;s.recap=s.recap.map(g=>({...g,week:4}));
  const view=harness(s,'dashboard');
  assert.doesNotMatch(view.get('ladder-leaders').innerHTML,/games with published statistics/);
  assert.doesNotMatch(view.get('recap-content').innerHTML,/games final/);
  assert.equal(view.get('recap-title').textContent,'WEEK 4 · RESULTS');
  assert.match(view.get('nfl-data-context').textContent,/stats W4 · recap W4/);
});
check('Root consumer pregame availability treats null as unavailable, not numeric zero',()=>{
  const s=fixture();s.throughWeek=0;s.leadersWeek=null;s.recapWeek=null;s.leadersContext={partialWeek:false};s.recapContext={partialWeek:false};s.recap=[];
  const view=harness(s,'dashboard');
  assert.equal(view.get('recap-title').textContent,'WEEKLY RECAP');
  assert.match(view.get('nfl-data-context').textContent,/stats unavailable · recap unavailable/);
  assert.match(view.get('recap-content').innerHTML,/No verified completed results/);
});
check('App fallback preserves explicit unavailable leader/recap context',()=>{
  const s=fixture();s.throughWeek=5;s.leadersWeek=null;s.recapWeek=null;s.recap=[];s.leadersContext={partialWeek:false};s.recapContext={partialWeek:false};
  const view=harness(s,'fallback');
  assert.match(view.get('ladder-leaders').innerHTML,/AWAITING VERIFIED WEEK/);
  assert.doesNotMatch(view.get('ladder-leaders').innerHTML,/WK 5/);
  assert.match(view.get('players-leaders').innerHTML,/weekly leaders unavailable/);
  assert.equal(view.get('recap-title').textContent,'Weekly recap');
  assert.match(view.get('recap-content').innerHTML,/SOURCE:weeklyRecap:2026 · Verified results unavailable/);
  assert.doesNotMatch(view.get('recap-content').innerHTML,/Week null|Week 0/);
});
check('App fallback keeps legacy undefined-week fields readable',()=>{
  const s=fixture();delete s.leadersWeek;delete s.recapWeek;delete s.leadersContext;delete s.recapContext;
  const view=harness(s,'fallback');
  assert.match(view.get('ladder-leaders').innerHTML,/WK 5/);
  assert.equal(view.get('recap-title').textContent,'Week 5 in numbers');
  assert.match(view.get('recap-content').innerHTML,/Week 5 results/);
});
const receipt={status:'pass',qualification:'Independent read-only root-consumer source binding review. Synthetic fixtures executed in a non-browser VM; no claim of native geometry, zero height change or external-provider verification.',
  dashboardSha256:crypto.createHash('sha256').update(dashboard).digest('hex'),appSha256:crypto.createHash('sha256').update(app).digest('hex'),cases:results.length,results,
  geometryQualification:'Existing page-scoped note class adds roughly one 8px line per partially covered leader panel, plus margins; longer footer may wrap. Native two-phone/desktop QA must assess final bounds. No Home markup or stylesheet edits by this reviewer.'};
fs.writeFileSync(path.join(__dirname,'consumer-coverage-results.json'),JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
