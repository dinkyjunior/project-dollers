/* Independent adapter model tests. These run Node VM objects, not a browser.
 * Expectations come from raw books plus separately audited report disagreements,
 * never from the production report/index producer. No source file is mutated.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root, p));
const adapterPath = process.env.PD_ADAPTER_REVIEW_SOURCE || path.join(root,'assets/source-integrity.js');
const catalogPath = process.env.PD_ADAPTER_REVIEW_CATALOG || path.join(root,'assets/data/game-reports.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = p => JSON.parse(read(p));
const copy = value => JSON.parse(JSON.stringify(value));
const rawPaths = {'team-details':'assets/data/team-details.json','matchup-breakdown':'assets/data/matchup-breakdown.json'};
const historyPath = 'assets/data/player-history.json';
const canonical = {
  '4431492':'00-0039739','4869961':'00-0041525','4432773':'00-0039893',
  '4429025':'00-0038544','3121023':'00-0034351','4432665':'00-0039338','4259545':'00-0036275'
};
const originalIndex = read('assets/data/game-reports.json');
const rawIndex = fs.readFileSync(catalogPath);
const adapterBytes = fs.readFileSync(adapterPath);
const index = JSON.parse(rawIndex);
const independent = parse('qa/game-report/independent/cross-screen-disagreement-matrix.json');
const checks = [], failures = [], fetchLog = [];
function check(name, fn) {
  try { fn(); checks.push({name,pass:true}); }
  catch (error) { checks.push({name,pass:false,error:error.message}); failures.push({name,error:error.message}); }
}
function games(book) {
  return Object.entries(book.teams || {}).flatMap(([club,team]) => ['games','headToHeadGames'].flatMap(key => (team[key] || []).map(game => ({club,key,game}))));
}
function players(book) {
  return Object.entries(book.teams || {}).flatMap(([club,team]) => {
    const rows = Array.isArray(team.players) ? team.players : Object.values(team.players || {});
    return rows.map(player => ({club,player}));
  });
}
function matchingLogs(book, id, team, gsis) {
  return players(book).flatMap(({club,player}) => (player.gameLog || []).filter(row =>
    (row.gameId || row.id) === id && (!team || row.team === team) && (!gsis || String(player.id) === gsis)
  ).map(row => ({club,player,row})));
}
function context(catalogBytes = rawIndex, behavior = {}) {
  const calls = [];
  const window = {};
  const fetch = async (url, options) => {
    const address = String(url); calls.push({url:address,cache:options?.cache}); fetchLog.push(address);
    if (!/assets\/data\/game-reports\.json(?:\?|$)/.test(address)) throw Error(`Unexpected model fetch: ${address}`);
    if (behavior.fail) throw Error('Independent model: catalog transport unavailable');
    return {ok:behavior.status !== 503,status:behavior.status || 200,
      arrayBuffer:async () => Uint8Array.from(catalogBytes).buffer,
      json:async () => JSON.parse(Buffer.from(catalogBytes).toString())};
  };
  const sandbox = {window,fetch,crypto:crypto.webcrypto,TextDecoder,TextEncoder,URL,AbortController,DOMException,
    setTimeout,clearTimeout,console,structuredClone,Date,Uint8Array,ArrayBuffer,
    document:{baseURI:'https://example.test/project-dollers/',dispatchEvent(){}},
    location:{origin:'https://example.test',href:'https://example.test/project-dollers/'},
    CustomEvent:class {constructor(name,details){this.type=name;this.detail=details?.detail;}}};
  vm.runInNewContext(adapterBytes.toString(),sandbox,{filename:adapterPath});
  assert.equal(typeof window.PDSourceIntegrity?.apply,'function','adapter exports apply');
  return {api:window.PDSourceIntegrity,calls};
}
async function apply(ctx,kind,bytes) {
  const data = JSON.parse(bytes);
  return ctx.api.apply(kind,data,Uint8Array.from(bytes).buffer,{});
}
function completeTotal(rows,field) {
  const values = rows.map(row => row[field]);
  return values.length && values.every(value => typeof value === 'number' && Number.isFinite(value)) ? values.reduce((a,b)=>a+b,0) : null;
}
async function run() {
  const ctx = context();
  const effective = {};
  for (const [kind,file] of Object.entries(rawPaths)) {
    const bytes = read(file), raw = JSON.parse(bytes), snapshot = JSON.stringify(raw);
    effective[kind] = await ctx.api.apply(kind,raw,Uint8Array.from(bytes).buffer,{});
    const book = effective[kind];
    check(`${kind}: raw input is unchanged`,() => assert.equal(JSON.stringify(raw),snapshot));
    check(`${kind}: effective is separate`,() => assert.notEqual(book,raw));
    check(`${kind}: copy-on-write shares untouched games and isolates changed statistical branches`,()=> {
      const ids=new Set(index.knownDisagreements.map(issue=>issue.gameId));
      const untouched=games(raw).find(({game})=>!ids.has(game.id));assert.ok(untouched);
      assert.equal(book.teams[untouched.club][untouched.key].find(game=>game.id===untouched.game.id),untouched.game,'Untouched game remains read-only shared');
      for(const issue of independent.knownCrossProviderFields.filter(issue=>!issue.player)) {
        games(raw).filter(({game})=>game.id===issue.game).forEach(({club,key,game})=> {
          const after=book.teams[club][key].find(row=>row.id===game.id);
          assert.notEqual(after,game);assert.notEqual(after.stats[issue.team],game.stats[issue.team]);
        });
      }
    });
    check(`${kind}: verified exact input digest`,() => {
      assert.equal(book._sourceIntegrity.status,'verified');
      assert.equal(book._sourceIntegrity.rawBookSha256,sha(bytes));
    });
    for (const issue of independent.knownCrossProviderFields.filter(issue => !issue.player)) {
      const affected = games(book).filter(item => item.game.id === issue.game);
      check(`${kind}: all ${issue.game} ${issue.team}.${issue.field} duplicates are unavailable`,() => {
        assert.ok(affected.length > 0);
        affected.forEach(({game}) => assert.equal(game.stats[issue.team][issue.field],null));
      });
      check(`${kind}: unrelated ${issue.game} scores/rushing preserved`,() => {
        affected.forEach(({club,key,game}) => {
          const prior=raw.teams[club][key].find(row=>row.id===game.id);
          assert.equal(game.home_score,prior.home_score);assert.equal(game.away_score,prior.away_score);
          assert.equal(game.stats[issue.team].rushing,prior.stats[issue.team].rushing);
        });
      });
    }
    check(`${kind}: source alternatives retain audited values and both source identities`,() => {
      for (const issue of independent.knownCrossProviderFields.filter(row => !row.player || kind === 'matchup-breakdown')) {
        const row=(book.disagreements || []).find(row => row.gameId===issue.game && row.team===issue.team && row.field===issue.field && (!issue.player || row.playerId===canonical[issue.player]));
        assert.ok(row,JSON.stringify(issue));assert.deepEqual(Array.from(row.values),issue.sourceValues);
        issue.sourceIds.forEach(id => assert.ok(row.sourceIds.includes(id),id));
        issue.sourceIds.forEach(id => {
          const source=(book.sources || []).find(source=>source.id===id);
          assert.ok(source?.url && Number.isFinite(Date.parse(source.retrievedAt)),`source ${id} URL/time`);
        });
      }
    });
    check(`${kind}: every original venue label remains unchanged`,() => games(book).forEach(({club,key,game})=> {
      const original=raw.teams[club][key].find(row=>row.id===game.id);assert.equal(game.venue,original.venue);
    }));
  }
  const matchup=effective['matchup-breakdown'], rawMatchup=parse(rawPaths['matchup-breakdown']);
  for (const issue of independent.knownCrossProviderFields.filter(issue=>issue.player)) {
    const gsis=canonical[issue.player], records=matchingLogs(matchup,issue.game,issue.team,gsis);
    check(`${issue.game}: ${gsis} targets unavailable in every matching log`,()=> {
      assert.ok(records.length);records.forEach(({row})=>assert.equal(row.stats.targets,null));
    });
    check(`${issue.game}: target sum/per-game propagate null rather than omit or zero`,()=> {
      records.forEach(({player})=> {
        const selected=player.gameLog.filter(row=>row.season===Number(issue.game.slice(0,4)) && row.team===issue.team);
        assert.equal(completeTotal(selected.map(row=>row.stats),'targets'),null);
      });
    });
    check(`${issue.game}: only disputed numerator invalidates its dependent share`,()=> {
      const all=matchingLogs(matchup,issue.game,issue.team);
      assert.ok(all.length);
      all.forEach(({club,player,row})=> {
        if(!row.advanced)return;
        const prior=matchingLogs(rawMatchup,issue.game,issue.team,player.id).find(item=>item.club===club).row;
        assert.equal(row.advanced.teamTargets,prior.advanced.teamTargets,'Independent PBP denominator retained');
        assert.equal(row.advanced.targetShare,player.id===gsis?null:prior.advanced.targetShare,'Dependent share only affected numerator');
      });
    });
    check(`${issue.game}: independently sourced snaps/red-zone stats retained`,()=> {
      records.forEach(({club,player,row})=>{
        const prior=matchingLogs(rawMatchup,issue.game,issue.team,player.id).find(item=>item.club===club).row;
        ['snaps','offensiveSnapPct','redZoneTargets','redZoneReceptions','redZoneReceivingTD'].forEach(key=>assert.equal(row.advanced?.[key],prior.advanced?.[key],key));
      });
    });
    check(`${issue.game}: disputed current-season target total is unavailable`,()=> {
      records.forEach(({club,player})=> {
        const original=players(rawMatchup).find(item=>item.club===club&&item.player.id===player.id).player;
        if(Number(issue.game.slice(0,4))===Number(matchup.season)) {
          if(Object.prototype.hasOwnProperty.call(original.seasonStats || {},'targets'))assert.equal(player.seasonStats.targets,null);
          else assert.ok(player.seasonStats?.targets===null || player.seasonStats?.targets===undefined,'No invented season aggregate');
        }
        else assert.equal(player.seasonStats?.targets,original.seasonStats?.targets,'Historical conflict does not invalidate current-season totals');
      });
    });
  }
  check('Kickoff conflict masks all game and prior-club player copies',()=> {
    const id='2024_17_ARI_LA';
    const gc=games(matchup).filter(({game})=>game.id===id), pc=matchingLogs(matchup,id);
    assert.ok(gc.length&&pc.length);gc.forEach(({game})=>assert.equal(game.kickoffUtc,null));pc.forEach(({row})=>assert.equal(row.kickoffUtc,null));
  });
  check('Neutral conflict masks game classification and personal-history filters',()=> {
    const id='2020_14_WAS_SF';
    const gc=games(matchup).filter(({game})=>game.id===id), pc=matchingLogs(matchup,id);
    assert.ok(gc.length&&pc.length);gc.forEach(({game})=>assert.equal(game.neutral,null));pc.forEach(({row})=>assert.ok(row.homeAway===null || row.homeAway==='unknown'));
  });
  check('Lazy cross-screen integrity loading never requests any detail report',()=> {
    assert.ok(ctx.calls.length);ctx.calls.forEach(call=>assert.match(call.url,/assets\/data\/game-reports\.json(?:\?|$)/));
  });
  const historyBytes=read(historyPath), historyRaw=JSON.parse(historyBytes), historyBefore=JSON.stringify(historyRaw);
  const history=await ctx.api.apply('player-history',historyRaw,Uint8Array.from(historyBytes).buffer,{});
  check('History exact raw input is preserved separately',()=> {
    assert.equal(JSON.stringify(historyRaw),historyBefore);assert.notEqual(history,historyRaw);
    assert.equal(history._sourceIntegrity.rawBookSha256,sha(historyBytes));assert.equal(history._sourceIntegrity.status,'verified');
  });
  check('Prior-club history kickoff conflict is unavailable for actual retained Sean Murphy-Bunting row',()=> {
    const id='2024_17_ARI_LA', pid='00-0035239';
    assert.ok(historyRaw.players[pid]?.games?.[id]?.kickoffUtc);
    assert.equal(history.players[pid].games[id].kickoffUtc,null);
  });
  check('History source-recorded statistical values are unchanged; no exact target conflict is present',()=> {
    for(const [pid,player] of Object.entries(historyRaw.players)) {
      for(const [gameId,game] of Object.entries(player.games || {})) {
        assert.equal(JSON.stringify(history.players[pid].games[gameId].stats),JSON.stringify(game.stats));
        const exactTargetIssue=independent.knownCrossProviderFields.find(issue=>issue.player&&issue.game===gameId&&canonical[issue.player]===pid);
        assert.equal(exactTargetIssue,undefined,'No disputed target statistic belongs to this stored player/game');
      }
    }
  });
  const reversePath='qa/game-report/independent/reverse-disagreement-audit.json';
  if(fs.existsSync(path.join(root,reversePath))) {
    const reverse=parse(reversePath).issues.filter(issue=>issue.classification==='missing-known-basic-conflict');
    const transferred=reverse.filter(issue=>index.knownDisagreements.some(row=>row.gameId===issue.existingIssue.gameId&&row.playerGsisId===issue.playerGsisId&&row.field===issue.existingIssue.field));
    check('Final inherited catalog covers all five previously masked game-level player conflicts',()=>assert.equal(transferred.length,reverse.length));
    for(const item of transferred) {
      const issue=item.existingIssue, rows=matchingLogs(matchup,issue.gameId,issue.team,item.playerGsisId);
      check(`${issue.gameId}: inherited ${item.playerGsisId}.${issue.field} remains null without changing appearances/other stats`,()=> {
        assert.ok(rows.length);rows.forEach(({club,player,row})=> {
          const original=matchingLogs(rawMatchup,issue.gameId,issue.team,player.id).find(item=>item.club===club).row;
          assert.equal(row.stats[issue.field],null);
          assert.equal(JSON.stringify(row.appearance),JSON.stringify(original.appearance));
          Object.keys(original.stats).filter(key=>key!==issue.field&&!(issue.field==='targets'&&key==='targetShare')).forEach(key=>assert.equal(row.stats[key],original.stats[key],key));
        });
      });
      check(`${issue.gameId}: inherited ${issue.field} alternatives are labelled with independently verified provider values`,()=> {
        const row=matchup.disagreements.find(row=>row.fromIntegrityCatalog&&row.gameId===issue.gameId&&row.playerId===item.playerGsisId&&row.field===issue.field);
        assert.ok(row);assert.ok(Array.isArray(row.readings)&&row.readings.length,'Explicit source-to-value readings required');
        const seen=new Set();row.readings.forEach(reading=>reading.sourceIds.forEach(id=> {
          assert.ok(Object.hasOwn(item.verifiedValuesBySource,id),`Audited source identity ${id}`);
          assert.equal(reading.value,item.verifiedValuesBySource[id],`Correct value for ${id}`);seen.add(id);
        }));
        Object.keys(item.verifiedValuesBySource).forEach(id=>assert.ok(seen.has(id),`Both actual provider readings retained: ${id}`));
      });
    }
  }
  // These are isolated failure models, not network/browser observations.
  async function failureCase(name,catalogBytes,behavior,rawBytes=read(rawPaths['team-details'])) {
    const failed=context(catalogBytes,behavior); let value=null,error=null;
    try {value=await apply(failed,'team-details',rawBytes);} catch(err){error=err;}
    check(name,()=> {
      assert.ok(error || value?._sourceIntegrity?.status!=='verified','Failure must never claim verified');
      if(value){
        const raw=JSON.parse(rawBytes), first=games(value).find(({game})=>game.status==='final');
        assert.ok(first,'degraded identities remain usable');
        const before=raw.teams[first.club][first.key].find(game=>game.id===first.game.id);
        assert.equal(first.game.home_score,before.home_score);assert.equal(first.game.away_score,before.away_score);
        Object.values(first.game.stats || {}).forEach(stats=>['netPassing','rushing','totalOffense'].forEach(field=>assert.equal(stats[field],null)));
      }
    });
  }
  const invalid=copy(index);if(invalid.integrityCatalog)invalid.integrityCatalog.schemaVersion=999;else invalid.schemaVersion=999;
  await failureCase('Unsupported catalog schema never returns verified numerics',Buffer.from(JSON.stringify(invalid)),{});
  await failureCase('Catalog HTTP503 never returns verified numerics',rawIndex,{status:503});
  await failureCase('Catalog transport failure never returns verified numerics',rawIndex,{fail:true});
  await failureCase('Wrong raw-book bytes never return verified numerics',rawIndex,{},Buffer.from(read(rawPaths['team-details']).toString()+'\n'));
  const changedRaw=parse(rawPaths['team-details']); changedRaw.season=1900;let rawError=null,rawResult=null;
  try {rawResult=await context().api.apply('team-details',changedRaw,Uint8Array.from(read(rawPaths['team-details'])).buffer,{});}
  catch(error){rawError=error;}
  check('Parsed input differing from its hashed bytes is never accepted as verified',()=>assert.ok(rawError||rawResult?._sourceIntegrity?.status!=='verified'));
  const absent=copy(index);absent.knownDisagreements.splice(0,1);
  await failureCase('Missing known alternative is rejected by report coverage counts',Buffer.from(JSON.stringify(absent)),{});
  const changedAlternative=copy(index);changedAlternative.knownDisagreements[0].sources[0].retrievedAt='not-a-date';
  await failureCase('Alternative lacking retrieval provenance is rejected',Buffer.from(JSON.stringify(changedAlternative)),{});
  const timestampOnly=copy(index);timestampOnly.generatedAt='2026-10-12T12:30:00Z';timestampOnly.retrievedAt='2026-10-12T12:30:00Z';
  const timestampResult=await apply(context(Buffer.from(JSON.stringify(timestampOnly))),'team-details',read(rawPaths['team-details']));
  check('Catalog timestamp-only update leaves effective research snapshot unchanged',()=>assert.equal(JSON.stringify(timestampResult),JSON.stringify(effective['team-details'])));
  check('sameSnapshot binds kind, raw source bytes and relevant catalog alternatives',()=> {
    assert.equal(typeof ctx.api.sameSnapshot,'function');
    assert.equal(ctx.api.sameSnapshot(effective['team-details'],timestampResult),true);
    for(const key of ['kind','rawBookSha256','appliedCatalogSha256']) {
      const changed={_sourceIntegrity:{...timestampResult._sourceIntegrity,[key]:'changed'}};
      assert.equal(ctx.api.sameSnapshot(effective['team-details'],changed),false,key);
    }
    assert.equal(ctx.api.sameSnapshot(effective['team-details'],{_sourceIntegrity:{...timestampResult._sourceIntegrity,status:'unavailable'}}),false);
    assert.equal(ctx.api.sameSnapshot(null,timestampResult),false);
  });
  const aborted=context(rawIndex,{fail:true}), controller=new AbortController(), unhandled=[];
  const noteUnhandled=(error)=>unhandled.push(String(error));process.on('unhandledRejection',noteUnhandled);controller.abort();let abortError=null;
  try {await aborted.api.apply('team-details',parse(rawPaths['team-details']),Uint8Array.from(read(rawPaths['team-details'])).buffer,{signal:controller.signal});}
  catch(error){abortError=error;}
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));process.off('unhandledRejection',noteUnhandled);
  check('Already-aborted consumer neither verifies stale output nor emits unhandled rejection',()=> {
    assert.equal(abortError?.name,'AbortError');assert.equal(unhandled.length,0,unhandled.join('; '));
  });
  const mutableBehavior={}, recovery=context(rawIndex,mutableBehavior), firstEffective=await apply(recovery,'team-details',read(rawPaths['team-details']));
  mutableBehavior.fail=true;let retryError=null;
  try {await apply(recovery,'team-details',read(rawPaths['team-details']));}catch(error){retryError=error;}
  mutableBehavior.fail=false;const recovered=await apply(recovery,'team-details',read(rawPaths['team-details']));
  check('Catalog transport failure does not poison later legitimate verification',()=> {
    assert.ok(retryError);assert.equal(recovered._sourceIntegrity.status,'verified');
    assert.equal(JSON.stringify(recovered),JSON.stringify(firstEffective));
  });
  const concurrent=context();const simultaneous=await Promise.all(Object.entries(rawPaths).map(([kind,file])=>apply(concurrent,kind,read(file))));
  check('Concurrent Team/Matchup checks share one valid compact catalog request',()=> {
    assert.equal(concurrent.calls.length,1);simultaneous.forEach(value=>assert.equal(value._sourceIntegrity.status,'verified'));
  });
  check('All source books and index remain unchanged throughout model audit',()=> {
    assert.equal(sha(read('assets/data/game-reports.json')),sha(originalIndex));
  });
}
run().catch(error=>failures.push({name:'runner',error:error.stack})).finally(()=> {
  const receipt={generatedAt:new Date().toISOString(),kind:'independent-node-vm-model-tests',nativeBrowser:false,
    helperSha256:sha(fs.readFileSync(__filename)),adapterPath,adapterSha256:sha(adapterBytes),
    adapterFileUnchangedAtClose:fs.existsSync(adapterPath)&&sha(fs.readFileSync(adapterPath))===sha(adapterBytes),
    catalogPath,catalogSha256:sha(rawIndex),draftCatalog:catalogPath!==path.join(root,'assets/data/game-reports.json'),
    sourceHashes:Object.fromEntries([...Object.values(rawPaths),historyPath,'assets/data/game-reports.json'].map(file=>[file,sha(read(file))])),
    checks,failures,fetchLog,status:failures.length?'failed':'passed',qualification:'Actual frozen books and compact index; transport failures are isolated VM test cases. No native-browser, network-performance or visual claims.'};
  const output=process.argv[2] || path.join(__dirname,'adapter-review-results.json');
  if(fs.existsSync(output))throw Error(`Refusing to replace existing audit receipt ${output}`);
  fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:receipt.status,checks:checks.length,failures,receipt:output})+'\n');
  process.exitCode=failures.length?1:0;
});
