'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const model=require('../../model.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const beforeBody=fs.readFileSync('/workspace/recovery-qa/matchup-sources-3735200-before/matchup-breakdown.json');
const afterBody=fs.readFileSync(process.argv[2]);
const before=JSON.parse(beforeBody),after=JSON.parse(afterBody);const checks={};const failures=[];
const canonical=value=>JSON.stringify(value,Object.keys(value||{}).sort());
const check=(ok,kind,ctx={})=>{checks[kind]=(checks[kind]||0)+1;if(!ok)failures.push({kind,...ctx});};
const eq=(a,b,kind,ctx={})=>check(JSON.stringify(a)===JSON.stringify(b),kind,ctx);
const metadata=new Set(['retrievedAt','scheduleRetrievedAt','checkedAt','generatedAt','sha256','bytes','etag','lastModified','tlsVerified','currentRetrievedAt','currentSha256','teamDetailsRetrievedAt','teamDetailsSha256']);
function facts(v){if(Array.isArray(v))return v.map(facts);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!metadata.has(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,facts(x)]));return v;}
const identity=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['gameLog','provenance','sourceIds','retrievedAt'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,facts(v)]));
const row=r=>facts(r);
const rows=rs=>rs.map(row);
const completedFixture=g=>Object.fromEntries(['id','season','seasonType','week','home_team','away_team','home_score','away_score','neutral','kickoffUtc','gameday','status','stats','venue'].map(k=>[k,facts(g[k]??null)]));
const role=q=>({candidates:rows(q.candidates),confirmed:rows(q.confirmed),unresolvedRoles:q.unresolvedRoles,rolesComplete:q.rolesComplete});
check(sha(beforeBody)==='5f74fb4648db53bea09dc64936dd1b5909a6ae91078216edcfc27f5a2cf2149a','ExactPreviouslyHostedCurrentSnapshot');check(sha(afterBody)==='e2f6f7ce3296e0835db717b5f7d4eb415898009f09d060a3d853778b8c001401','ExactIncoming373Snapshot');
const teams=Object.keys(before.teams).sort();eq(teams,Object.keys(after.teams).sort(),'Exact32Teams');
const windows=[];for(const window of[3,5,10])for(const season of['cross','current'])for(const venue of['all','home','away','neutral'])for(const mode of['average','total'])windows.push({window,season,venue,mode});
let branches=0,players=0,qbs=0;
const availabilityDifferences=[];const fixtureStateDifferences=[];
function sortedReports(v){return JSON.stringify(facts(v),null,0);}
for(const abbr of teams){
 const a=before.teams[abbr],b=after.teams[abbr];const pids=Object.keys(a.players).sort();eq(pids,Object.keys(b.players).sort(),'PlayerIdentityPool',{team:abbr});
 for(const pid of pids){players++;eq(identity(a.players[pid]),identity(b.players[pid]),'AllPlayerIdentityAndAvailabilityFacts',{team:abbr,player:pid});eq(rows(a.players[pid].gameLog),rows(b.players[pid].gameLog),'AllPlayerStatLogAndRoleFacts',{team:abbr,player:pid});}
 const qbIds=pids.filter(pid=>a.players[pid].position==='QB');qbs+=qbIds.length;
 for(const options of windows){branches++;const ctx={team:abbr,...options};const ga=model.games(before,abbr,options),gb=model.games(after,abbr,options);
  eq(ga.map(completedFixture),gb.map(completedFixture),'SelectedCompletedTeamGameFacts',ctx);
  for(const kind of['rushing','receiving'])eq(model.leaders(before,abbr,kind,options),model.leaders(after,abbr,kind,options),'LeadersIDsRankGPNullsCountsAndRates',{...ctx,kind});
  for(const pid of pids)eq(rows(model.actualRows(a.players[pid],abbr,ga)),rows(model.actualRows(b.players[pid],abbr,gb)),'AllPlayerSelectedStatAppearanceEligibility',{...ctx,player:pid});
  const fa=model.fixture(before,abbr),fb=model.fixture(after,abbr);eq(fa?.id||null,fb?.id||null,'DirectResearchFixtureIdentity',ctx);
  const opponent=fa&&(fa.home_team===abbr?fa.away_team:fa.home_team);
  for(const pid of qbIds)for(const scope of['all','opponent']){
   const opts={...options,...(scope==='opponent'?{opponent}:{} )};const qa=model.qbWindow(before,abbr,pid,opts),qb=model.qbWindow(after,abbr,pid,opts);
   eq(role(qa),role(qb),'ActualQBCandidatesConfirmedStartsNullRolesAndAdvancedFacts',{...ctx,player:pid,scope});
   for(const field of['completions','attempts','passingYards','passingTD','interceptions','sacks','sackYardsLost','carries','rushingYards','fumbles','fumblesLost','passingAirYards','passingYardsAfterCatch'])eq(model.field(qa.confirmed,field,options.mode),model.field(qb.confirmed,field,options.mode),'QBSelectedBasicCountsAndRateDenominators',{...ctx,player:pid,scope,field});
   eq(model.passerRating(qa.confirmed),model.passerRating(qb.confirmed),'IndependentQBRating',{...ctx,player:pid,scope});
  }
 }
 const fixtureIds=[...new Set([a.researchGameId,a.upcomingGameId,a.nextScheduledGameId,b.researchGameId,b.upcomingGameId,b.nextScheduledGameId].filter(Boolean))].sort();
 for(const gid of fixtureIds){const ga=model.fixture(before,abbr,{game:gid}),gb=model.fixture(after,abbr,{game:gid});eq(ga?.id,gb?.id,'EveryResearchUpcomingAndNextScheduledIdentity',{team:abbr,game:gid});eq(facts(model.projectedQB(before,abbr,ga)),facts(model.projectedQB(after,abbr,gb)),'FixtureQBProjectionAvailabilityAndRoleFacts',{team:abbr,game:gid});}
 for(const gid of new Set([...Object.keys(a.fixtureReports||{}),...Object.keys(b.fixtureReports||{})])){
  const ra=a.fixtureReports?.[gid],rb=b.fixtureReports?.[gid];
  if(JSON.stringify(ra?.eventStatus)!==JSON.stringify(rb?.eventStatus)||JSON.stringify(ra?.liveScore)!==JSON.stringify(rb?.liveScore))fixtureStateDifferences.push({team:abbr,gameId:gid,before:{state:ra?.eventStatus,score:ra?.liveScore,publishedAt:ra?.publishedAt},after:{state:rb?.eventStatus,score:rb?.liveScore,publishedAt:rb?.publishedAt}});
  for(const field of['players','currentTeamBulletin']){
   const aa=ra?.availability?.[field]||[],bb=rb?.availability?.[field]||[];const key=p=>String(p.playerId||p.espnId||p.name);const ma=new Map(aa.map(p=>[key(p),p])),mb=new Map(bb.map(p=>[key(p),p]));
   check(ma.size===aa.length&&mb.size===bb.length,'AvailabilityIdentityIsUnique',{team:abbr,game:gid,field});
   for(const id of new Set([...ma.keys(),...mb.keys()])){
    const old=ma.get(id),fresh=mb.get(id);if(!old||!fresh){availabilityDifferences.push({team:abbr,gameId:gid,field,playerId:id,before:old?facts(old):null,after:fresh?facts(fresh):null});continue;}
    const aFacts=facts(old),bFacts=facts(fresh);delete aFacts.sourceTimestamp;delete bFacts.sourceTimestamp;
    if(JSON.stringify(aFacts)!==JSON.stringify(bFacts))availabilityDifferences.push({team:abbr,gameId:gid,field,playerId:id,before:aFacts,after:bFacts});
   }
  }
 }
}
const output=process.argv[3];
const report={status:failures.length?'failed':'passed',auditedAt:new Date().toISOString(),agent:'/root/matchup_sources',beforeSnapshotSha256:sha(beforeBody),afterSnapshotSha256:sha(afterBody),snapshotSha256:sha(afterBody),independentModel:{path:'qa/matchup-breakdown/model.cjs',sha256:sha(fs.readFileSync('qa/matchup-breakdown/model.cjs'))},auditHelperSha256:sha(fs.readFileSync(__filename)),beforeHostedAcceptedReceipt:{path:'qa/matchup-breakdown/reviews/sources-hosted-upcoming-delta.json',sha256:sha(fs.readFileSync('qa/matchup-breakdown/reviews/sources-hosted-upcoming-delta.json'))},statisticalProjectionEquivalent:failures.length===0,assertions:Object.values(checks).reduce((a,b)=>a+b,0),checks,teams:teams.length,playerIdentityCount:players,qbIdentityCount:qbs,windowsPerTeam:windows.length,totalTeamWindowBranches:branches,options:windows,availabilityEquivalent:availabilityDifferences.length===0,availabilityDifferences,fixtureStateDifferences,failures,scope:'Independent frozen QA model expectations for every32 club and48 game/season/venue/unit state, both leader boards, all player statistical appearance eligibility, all QB candidate/confirmed scopes and basic/advanced facts. Distinct current live event, injury/bulletin availability and publication changes are retained separately and independently raw-source audited; they are not silently removed or treated as equivalence. No browser coverage or physical-device claim.',excludedOnlySourceMetadataKeys:[...metadata].sort()};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({path:output,sha256:sha(fs.readFileSync(output)),status:report.status,assertions:report.assertions,statisticalProjectionEquivalent:report.statisticalProjectionEquivalent,availabilityDifferences:availabilityDifferences.length,fixtureStateDifferences:fixtureStateDifferences.length,failures:failures.slice(0,10),beforeSnapshotSha256:report.beforeSnapshotSha256,afterSnapshotSha256:report.afterSnapshotSha256})+'\n');process.exit(failures.length?1:0);
