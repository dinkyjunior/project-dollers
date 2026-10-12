#!/usr/bin/env node
/* Independent read-only Game Report integrity review.
 * This is a Node VM with a minimal fake DOM/fetch transport. It exercises
 * exact application JavaScript and local verified payload bytes, not browser
 * paint, actual HTTP, pointer actions, or performance. No app source is edited.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
const read = name => fs.readFileSync(path.join(root,name));
const json = name => JSON.parse(read(name));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const source = read('assets/game-report.js').toString();
const indexPath = 'assets/data/game-reports.json';
const index = json(indexPath);
const gameA = '2026_04_DAL_HOU';
const gameB = '2026_01_DAL_NYG';
const route = id => `game-report?team=DAL&game=${id}`;
function fixture(hook, exposePureFunctions = false) {
  const events = [], requests = [];
  const context = {
    window: {crypto:crypto.webcrypto,addEventListener(){},PDApp:{getContext(){return {data:{teams:[]},logo:abbr=>`assets/logos/${abbr.toLowerCase()}.png`};}}},
    crypto:crypto.webcrypto,
    document:{querySelector(){return null;},getElementById(){return null;},addEventListener(){},dispatchEvent(event){events.push({type:event.type,...event.detail});},documentElement:{dataset:{}}},
    location:{hash:''},history:{replaceState(){}},
    CustomEvent:function(type,params){this.type=type;this.detail=params?.detail;},
    matchMedia(){return {matches:false,addEventListener(){}};},setInterval(){},setTimeout,clearTimeout,
    AbortController,TextDecoder,URLSearchParams,Number,Date,Intl,
    fetch:async url=>{requests.push(url);let bytes=read(url);if(hook)bytes=await hook(url,bytes);return {ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}
  };
  vm.createContext(context);
  const executed = exposePureFunctions ? source.replace('  window.PDGameReport=',
    '  window.PDAudit={state,setReport:value=>report=value,playerValue,selectedPlayers,snapshot,scoring,boxScore};\n  window.PDGameReport=') : source;
  vm.runInContext(executed,context);
  return {api:context.window.PDGameReport,pure:context.window.PDAudit,events,requests};
}
async function main() {
  const output = {
    schemaVersion:1,checkedAt:new Date().toISOString(),reviewer:'report_ui_integrity_review',
    scope:'Read-only exact-source Node VM with minimal fake DOM and locally supplied fetch bytes. Independent structural audit of every indexed report and an independently preserved ESPN summary. No browser, actual HTTP, visual, touch, or frame-rate claim.',
    sources:{gameReportJS:{path:'assets/game-report.js',sha256:sha(source)},gameReportCSS:{path:'assets/game-report.css',sha256:sha(read('assets/game-report.css'))},index:{path:indexPath,sha256:sha(read(indexPath))}},
    fixedFindings:[
      'Fractional defensive sacks and tackles for loss previously rounded to whole integers; the UI lead corrected playerValue formatting to preserve one decimal.',
      'Cached A to B to A could finish synchronously before loading=pending, stranding a resolved Promise and preventing refresh; the UI lead inserted a microtask before refresh body execution.'
    ],
    checks:[]
  };
  let test=fixture();for(const id of [gameA,gameB,gameA])await test.api.route(route(id));
  let prior=test.requests.length;await test.api.refresh(true);
  output.checks.push({case:'cached A to B to A, then forced refresh',passed:test.requests.length-prior===2,fetchStubCalls:test.requests.length-prior,reportId:test.api.getReport()?.id});
  for(const mode of ['bytes','hash','identity']) {
    const modifiedIndex=JSON.parse(JSON.stringify(index));
    let detail=Buffer.from(read(modifiedIndex.games[gameA].detailUrl));
    if(mode==='bytes')detail=Buffer.concat([detail,Buffer.from(' ')]);
    if(mode==='hash')detail[40]=detail[40]===48?49:48;
    if(mode==='identity'){const modified=JSON.parse(detail);modified.id='wrong-identity';detail=Buffer.from(JSON.stringify(modified));modifiedIndex.games[gameA].sha256=sha(detail);modifiedIndex.games[gameA].bytes=detail.length;}
    test=fixture((url,bytes)=>url===indexPath?Buffer.from(JSON.stringify(modifiedIndex)):url===modifiedIndex.games[gameA].detailUrl?detail:bytes);
    await test.api.route(route(gameA));const event=test.events.at(-1);
    output.checks.push({case:`${mode} mismatch rejected`,passed:test.api.getReport()===null&&event.type==='pd:game-report-data-error',error:event.message});
  }
  let fail=false;
  test=fixture((url,bytes)=>{if(fail&&url===indexPath)throw new Error('Independent audit simulated network failure');return bytes;});
  await test.api.route(route(gameA));fail=true;await test.api.refresh(true);
  output.checks.push({case:'same-game failure retains preceding verified report',passed:test.api.getReport()?.id===gameA&&test.events.at(-1).retained===true,error:test.events.at(-1).message});
  let old=false;
  test=fixture((url,bytes)=>{if(old&&url===indexPath){const modified=JSON.parse(bytes);modified.retrievedAt='2020-01-01T00:00:00Z';return Buffer.from(JSON.stringify(modified));}return bytes;});
  await test.api.route(route(gameA));old=true;await test.api.refresh(true);
  output.checks.push({case:'older index rejected without losing report',passed:test.api.getReport()?.id===gameA&&test.events.at(-1).message.includes('Older report snapshot rejected'),error:test.events.at(-1).message});
  let release,started=false;
  test=fixture(async(url,bytes)=>{if(url.endsWith(gameA+'.json')&&!started){started=true;await new Promise(resolve=>release=resolve);}return bytes;});
  const pendingA=test.api.route(route(gameA));while(!started)await Promise.resolve();await test.api.route(route(gameB));release();await pendingA;
  output.checks.push({case:'delayed A response cannot replace completed route B',passed:test.api.getReport()?.id===gameB,reportId:test.api.getReport()?.id});
  fail=false;
  test=fixture((url,bytes)=>{if(fail&&url.endsWith(gameB+'.json'))throw new Error('Independent audit simulated unavailable different game');return bytes;});
  await test.api.route(route(gameA));fail=true;await test.api.route(route(gameB));
  output.checks.push({case:'unavailable new game does not retain another game',passed:test.api.getReport()===null&&test.events.at(-1).retained===false,error:test.events.at(-1).message});
  const structural={indexedReports:0,playerRows:0,teamViews:0,knownQuarterSumsChecked:0,fractionalSackRows:0,fractionalTacklesForLossRows:0,unavailableReceivingTargets:0,errors:[],boxCategoryRows:{}};
  const teams=new Set();
  for(const entry of Object.values(index.games)) {
    structural.indexedReports++;const bytes=read(entry.detailUrl),detail=JSON.parse(bytes);
    if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)structural.errors.push({id:entry.id,type:'index/detail integrity'});
    for(const field of ['id','home_team','away_team','season','week','status','home_score','away_score'])if(detail[field]!==entry[field])structural.errors.push({id:entry.id,type:'identity',field});
    for(const abbr of [detail.away_team,detail.home_team]) {
      teams.add(abbr);structural.teamViews++;
      const quarters=detail.quarters?.[abbr]||[];
      if(quarters.length&&quarters.every(value=>typeof value==='number'&&Number.isFinite(value))) {
        structural.knownQuarterSumsChecked++;
        const finalScore=detail.home_team===abbr?detail.home_score:detail.away_score;
        if(quarters.reduce((sum,value)=>sum+value,0)!==finalScore)structural.errors.push({id:entry.id,type:'quarter arithmetic',abbr});
      }
      for(const player of detail.players?.[abbr]||[]) {
        structural.playerRows++;
        if(player.team&&player.team!==abbr)structural.errors.push({id:entry.id,type:'player/team identity',player:player.id});
        for(const category of player.categories||[])structural.boxCategoryRows[category]=(structural.boxCategoryRows[category]||0)+1;
        for(const [key,count] of [['defensiveSacks','fractionalSackRows'],['tacklesForLoss','fractionalTacklesForLossRows']])if(typeof player.stats?.[key]==='number'&&player.stats[key]%1)structural[count]++;
        if(player.categories?.includes('receiving')&&player.stats?.targets==null)structural.unavailableReceivingTargets++;
      }
    }
  }
  const assetManifest=json('assets/player-assets.json');structural.logoTeams=teams.size;
  for(const abbr of teams){const logo=assetManifest.logos?.[abbr.toLowerCase()]?.path||`assets/logos/${abbr.toLowerCase()}.png`;if(!fs.existsSync(path.join(root,logo)))structural.errors.push({type:'missing team logo',abbr,path:logo});}
  structural.canonicalLALogo=assetManifest.logos?.la?.path;
  output.structural=structural;
  const pure=fixture(null,true).pure;pure.setReport(json(index.games[gameA].detailUrl));pure.state.team='DAL';
  const formatting={null:pure.playerValue({stats:{targets:null}},'targets'),zero:pure.playerValue({stats:{targets:0}},'targets'),halfSack:pure.playerValue({stats:{defensiveSacks:.5}},'defensiveSacks'),halfTFL:pure.playerValue({stats:{tacklesForLoss:.5}},'tacklesForLoss')};
  output.checks.push({case:'null, zero and fractional defensive counts stay distinct',passed:formatting.null==='—'&&formatting.zero==='0'&&formatting.halfSack==='0.5'&&formatting.halfTFL==='0.5',actual:formatting});
  const report=json(index.games[gameA].detailUrl),summary={gameId:gameA,quarters:report.quarters,stats:report.stats,snapshotStrongText:pure.snapshot().match(/<strong>[^<]+<\/strong>/g),cumulativeValues:pure.scoring().match(/<b>\d+<\/b>/g),performanceSelections:[]};
  for(const team of ['DAL','HOU'])for(const kind of ['passing','rushing','receiving']){pure.state.performanceTeam=team;pure.state.kind=kind;const rows=pure.selectedPlayers();summary.performanceSelections.push({team,kind,rows:rows.length,leader:rows[0]?.name,leaderYards:rows[0]?.stats[`${kind}Yards`]});}
  summary.fullBoxHeadings=pure.boxScore().match(/<h4>[^<]+<\/h4>/g);output.currentGame=summary;
  const rawFile='/workspace/recovery-qa/game-report-source-cache/espn-summary-401872967.json';
  const rawBytes=fs.readFileSync(rawFile),raw=JSON.parse(rawBytes),rawSource={path:rawFile,sha256:sha(rawBytes),bytes:rawBytes.length,sourceMatches:report.sources.some(s=>s.sha256===sha(rawBytes)&&s.bytes===rawBytes.length),categoryRows:0,statCells:0,mismatches:[]};
  for(const side of raw.boxscore.players){const abbr=side.team.abbreviation,byId=new Map(report.players[abbr].map(p=>[p.espnId,p]));for(const category of side.statistics)for(const row of category.athletes||[]){rawSource.categoryRows++;const player=byId.get(row.athlete.id);for(let i=0;i<category.keys.length;i++){rawSource.statCells++;const key=category.keys[i];if(player?.rawStats?.[category.name]?.[key]!==row.stats[i])rawSource.mismatches.push({abbr,id:row.athlete.id,category:category.name,key});}}}
  output.independentRawSource=rawSource;
  output.passed=output.checks.every(check=>check.passed)&&structural.errors.length===0&&rawSource.sourceMatches&&rawSource.mismatches.length===0;
  process.stdout.write(JSON.stringify(output,null,2)+'\n');if(!output.passed)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
