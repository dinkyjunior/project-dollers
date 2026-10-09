'use strict';
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const old=cp.execFileSync('git',['show','79122be:assets/team-details.js'],{encoding:'utf8'});
const fresh=fs.readFileSync('assets/team-details.js','utf8');
const detailsBody=fs.readFileSync('assets/data/team-details.json');const details=JSON.parse(detailsBody);
const bookBody=fs.readFileSync('assets/data/matchup-breakdown.json');const book=JSON.parse(bookBody);
const extract=source=>source.slice(source.indexOf('  function nextGame() {'),source.indexOf('  function dateTime(game)',source.indexOf('  function nextGame() {')));
function resolve(source,abbr,club,season){return vm.runInNewContext(extract(source)+'\nnextGame()', {dataset:{season},state:{team:abbr},team:()=>club,games:()=>club.games,known:value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)),final:game=>game.status==='final'&&game.home_score!==null&&game.home_score!==undefined&&game.away_score!==null&&game.away_score!==undefined});}
const checks=[];let n=0;
const check=(condition,label,context={})=>{n++;assert.ok(condition,label);checks.push({label,...context});};
const oldResults=[];
for(const [abbr,t]of Object.entries(details.teams)){
 const actual=resolve(fresh,abbr,t,details.season);
 const expected=t.games.find(g=>g.id===t.upcomingGameId);
 check((actual?.id||null)===(expected?.id||null),'All32 explicit upcoming fixtures preserve original exact source identity',{team:abbr,id:actual?.id||null});
 if(actual){check(Number(actual.season)===Number(details.season)&&[actual.home_team,actual.away_team].includes(abbr)&&!['final','cancelled','postponed'].includes(actual.status),'Resolved fixture is same club/current season/non-final',{team:abbr,id:actual.id});}
 if(['DAL','TB'].includes(abbr)){
  const previous=resolve(old,abbr,t,details.season);oldResults.push({team:abbr,oldSelected:previous?.id,newSelected:actual?.id,publishedUpcoming:t.upcomingGameId});
  check(previous?.id!==t.upcomingGameId&&previous?.id==='2026_05_TB_DAL','Genuine old resolver reproduces source ID mismatch with its real final helper',{team:abbr});
  check(book.teams[abbr].researchGameId==='2026_05_TB_DAL','Direct current research fixture stays source-qualified Week5',{team:abbr});
 }
}
const valid={id:'source-valid',season:2026,status:'scheduled',home_team:'DAL',away_team:'GB',kickoffUtc:'2026-10-19T00:20:00Z'};
for(const [name,wrong]of Object.entries({'wrong-season':{season:2025},'wrong-club':{home_team:'TB',away_team:'GB'},'final-without-scores':{status:'final',home_score:null,away_score:null},'cancelled':{status:'cancelled'},'postponed':{status:'postponed'}})){
 const invalid={...valid,...wrong,id:'source-invalid',kickoffUtc:'2026-10-01T00:00:00Z'};
 check(resolve(fresh,'DAL',{upcomingGameId:invalid.id,games:[invalid,valid]},2026)?.id===valid.id,'Invalid explicit reference cannot escape valid current-club fixture fallback',{case:name});
}
for(const id of [null,'unknown-ID'])check(resolve(fresh,'DAL',{upcomingGameId:id,games:[valid]},2026)?.id===valid.id,'Missing/unresolved source ID preserves earliest eligible fallback',{id});
check(resolve(fresh,'DAL',{upcomingGameId:null,games:[]},2026)===null,'No eligible fixture remains unavailable');
const neutral={...valid,kickoffUtc:null,gameday:'2026-10-19',neutral:true};check(resolve(fresh,'DAL',{upcomingGameId:neutral.id,games:[neutral]},2026)?.id===neutral.id,'TBD kickoff and neutral fixture preserve source-designated identity');
const unchangedOutsideFunction=old.replace(extract(old),'NEXTGAME')===fresh.replace(extract(fresh),'NEXTGAME');check(unchangedOutsideFunction,'Only actual nextGame function changes within TeamDetails source');
const report={status:'passed',auditedAt:new Date().toISOString(),agent:'/root/matchup_sources',method:'Execute extracted actual old/new nextGame functions in independent V8 VM with their actual dependencies; source fixture and independent adversarial expectations, no copied production resolver implementation.',checks:n,checksPerformed:checks,oldResolverRegression:oldResults,bindings:{teamDetailsJsSha256:sha(fresh),teamDetailsSnapshotSha256:sha(detailsBody),matchupSnapshotSha256:sha(bookBody)},scope:'Selector only; new f7bd185 source data requires a separate coherent original-response audit. Missing source ID retains labelled unresolved earliest fixture; no clock-derived result or research override.',blockingFindings:[]};
const p='qa/matchup-breakdown/reviews/source-evidence/upcoming-resolver-independent-review.json';fs.writeFileSync(p,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({path:p,sha256:sha(fs.readFileSync(p)),checks:n,status:report.status,bindings:report.bindings,oldResolverRegression:oldResults})+'\n');
