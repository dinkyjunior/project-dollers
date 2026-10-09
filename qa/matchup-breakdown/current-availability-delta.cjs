'use strict';
// Actual native supplement for the incoming provider availability differences.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const q = require('./qa.cjs'), tq = require('../team-details/qa.cjs');
const args = process.argv.slice(2), arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key)+1] : fallback;
const engine = arg('--engine', 'chromium'), base = arg('--base', 'http://127.0.0.1:8876/project-dollers/'), out = path.resolve(arg('--output', 'qa/matchup-breakdown/current-availability-' + engine));
assert.ok(['chromium', 'webkit'].includes(engine)); assert.ok(!fs.existsSync(out), 'Every genuine run has immutable fresh evidence'); fs.mkdirSync(out, {recursive:true});
const data = q.sourceData(), runtime = q.runtimeManifest(), originalTests = q.tests(), self = 'qa/matchup-breakdown/current-availability-delta.cjs', scriptHash = q.SHA(fs.readFileSync(__filename));
const canonical = q.SHA(Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(runtime).sort().map(key => [key,runtime[key]])))));
assert.equal(canonical, arg('--runtime-sha', canonical));
const requested = [
  ['GB','2026_06_DAL_GB','currentTeamBulletin'], ['GB','2026_05_CHI_GB','players'],
  ['HOU','2026_05_HOU_TEN','players'], ['LA','2026_05_BUF_LA','players'],
  ['LAC','2026_06_LAC_KC','currentTeamBulletin'], ['LAC','2026_05_DEN_LAC','players'],
  ['MIN','2026_05_MIN_NO','players'], ['NO','2026_05_MIN_NO','players'],
  ['NYG','2026_05_NYG_WAS','players'], ['PHI','2026_06_CAR_PHI','currentTeamBulletin'],
  ['PHI','2026_05_PHI_JAX','players'], ['SEA','2026_05_SF_SEA','players']
];
for (const [abbr,id,field] of requested) assert(Array.isArray(data.matchup.teams[abbr].fixtureReports[id].availability[field]), 'Exact independently identified changed source group exists');
const report = {status:'running',engine,base,startedAt:new Date().toISOString(),runtimeManifestSha256:canonical,
  source:{runtimeFiles:runtime,originalTestFiles:originalTests,testFiles:{...originalTests,[self]:scriptHash},matchupHash:runtime['assets/data/matchup-breakdown.json']},
  qualification:{additiveAvailabilityDelta:true,originalFifteenUnchanged:true,genuineNativeTouch:true,deviceScaleFactor:2,physicalIPhone:false,naturalAnimationPhase:true,sourceSubstitution:false,clockSubstitution:false,DOMOrStyleSubstitution:false,strictTLS:/^https:/.test(base),scope:'All 12 independent changed current injury/future bulletin groups; each is asserted against actual native rendered identity/status/practice/source context and both selected-fixture QB cards.'},
  coverage:[],results:[],originals:[]};
const save = () => fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n'); save(); let browser;
const normal = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const unique = values => [...new Set(values.filter(value => value!==null&&value!==undefined&&String(value).trim()).map(value=>normal(value)))];
function expectedInjuries(abbr,game) {
  const club=data.matchup.teams[abbr],snapshot=Array.isArray(club.injuries)?club.injuries:club.injuries?.players||[];
  const selected=club.fixtureReports[game.id];
  const rows=snapshot.filter(row=>Number(row.season??data.matchup.season)===Number(game.season)&&Number(row.week??club.injuries?.week)===Number(game.week)).map(row=>({row,provider:false}));
  for(const row of selected?.availability?.players||[]) if(row.gameId===game.id&&row.team===abbr&&Number(row.week)===Number(game.week)) rows.push({row,provider:true});
  const roster=[...Object.values(club.players||{}),...(Array.isArray(club.roster)?club.roster:[])],groups=new Map();
  for(const item of rows) {
    const row=item.row,canonicalPlayer=roster.find(player=>normal(player.name)===normal(row.name));
    const id=String(row.playerId||row.id||canonicalPlayer?.id||`${abbr}:${normal(row.name)}`);
    if(!groups.has(id))groups.set(id,{id,name:row.name||canonicalPlayer?.name||'Player unavailable',rows:[],sources:new Set()});
    const group=groups.get(id);group.rows.push(item);
    for(const sourceId of row.sourceIds||club.injuries?.sourceIds||[])group.sources.add(sourceId);
  }
  return groups;
}
async function scenario(viewport) {
  const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'}),page=await context.newPage();
  const r={viewport,status:'running',startedAt:new Date().toISOString(),nativeInputs:[],coverage:[],availabilityCoverage:[],errors:{javascriptAndConsole:[],http:[],failed:[]}};
  report.results.push(r);save();
  page.on('pageerror',error=>r.errors.javascriptAndConsole.push(error.message));page.on('console',message=>{if(message.type()==='error')r.errors.javascriptAndConsole.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)r.errors.http.push({url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>r.errors.failed.push({url:request.url(),error:request.failure()?.errorText}));
  const tap=async(locator,label)=>{assert.equal(await locator.count(),1);await locator.tap();r.nativeInputs.push({label,input:'native-touch',hash:new URL(page.url()).hash});};
  try {
    for(const [abbr,id,field] of requested) {
      console.log(`AVAILABILITY ${engine} ${viewport.width} ${abbr} ${id} ${field}`);
      await page.goto(base+'#matchup/'+abbr+'?game='+id,{waitUntil:'networkidle'});await q.ready(page);await q.active(page);
      const state=await page.evaluate(()=>window.MatchupBreakdown.getState());assert.equal(state.team,abbr);assert.equal(state.game,id);
      assert.equal(await page.locator('[data-mb-fixture]').getAttribute('data-mb-fixture'),id);
      assert.equal((await q.semantic(page)).dataset.sha256,q.SHA(Buffer.from(JSON.stringify(data.matchup))), 'Genuine complete browser data equals exact independently frozen snapshot');
      const game=data.matchup.teams[abbr].games.find(game=>game.id===id),sourceReport=data.matchup.teams[abbr].fixtureReports[id];
      const quarterbacks=await q.genericQBSourceCheck(page,data,state);
      await tap(page.locator(q.PAGE+' [data-mb-tab="lineup"]'),'Native selected-event Lineup '+abbr+'/'+id);
      assert.equal((await page.evaluate(()=>window.MatchupBreakdown.getState())).tab,'lineup');
      const card=page.locator('.mb-lineup-card').filter({has:page.getByRole('heading',{name:new RegExp('^'+(abbr==='DAL'?'DALLAS':abbr==='TB'?'TAMPA BAY':data.matchup.teams[abbr].fullName.replace(data.matchup.teams[abbr].name,'').trim()).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' · LINEUP$','i')})});
      assert.equal(await card.count(),1,'Own club Lineup card is unique');
      const expected=expectedInjuries(abbr,game),actualIds=await card.locator('[data-mb-injury-player]').evaluateAll(nodes=>nodes.map(node=>node.dataset.mbInjuryPlayer));
      assert.deepEqual(actualIds,[...expected.keys()],'Native injury identity set exactly equals selected-week snapshot plus selected-event provider rows; omissions never prove health');
      const rendered=[];
      for(const [playerId,group]of expected) {
        const node=card.locator('[data-mb-injury-player="'+playerId+'"]');assert.equal(await node.count(),1);const text=await node.innerText();
        assert(normal(text).includes(normal(group.name)),'Complete own injury identity visible');
        for(const value of unique(group.rows.map(({row})=>row.reportStatus||row.status)))assert(normal(text).includes(value),'Every known source designation remains visible');
        for(const value of unique(group.rows.map(({row})=>row.practiceStatus||row.practice)))assert(normal(text).includes(value),'Every known practice designation remains visible');
        if(unique(group.rows.map(({row})=>row.reportStatus||row.status)).length>1)assert(text.includes('SOURCE DISAGREEMENT'),'Conflicting game designations remain disclosed');
        if(unique(group.rows.map(({row})=>row.practiceStatus||row.practice)).length>1)assert(text.includes('SOURCE DISAGREEMENT'),'Conflicting practice designations remain disclosed');
        assert(text.includes(game.season+' W'+game.week),'Known source context remains selected fixture week');
        const ids=[...new Set(await node.locator('[data-mb-injury-sources]').evaluateAll(nodes=>nodes.flatMap(node=>node.dataset.mbInjurySources.split(' ').filter(Boolean))))];
        assert.deepEqual(ids.sort(),[...group.sources].sort(),'Every exact injury provider provenance ID survives merge');
        const inactive=group.rows.some(({row,provider})=>provider&&row.reportedInactive===true);
        assert.equal(text.includes('ESPN-reported INACTIVE'),inactive,'Only actual selected-event provider INACTIVE is labelled inactive');
        if(inactive)assert(text.includes('incomplete provider report, not an official inactive list.'));
        rendered.push({playerId,name:group.name,actualText:text,sourceIds:ids});
      }
      for(const [playerId,group] of expected){const notes=await card.locator('[data-mb-injury-player="'+playerId+'"] .mb-injury-source-note').evaluateAll(nodes=>nodes.map(node=>node.title).join('\n'));for(const {row} of group.rows){if(row.sourceTimestamp)assert(notes.includes(row.sourceTimestamp),'Exact dated source timestamp survives native injury disclosure');if(row.injury)assert(notes.includes(row.injury),'Every known source injury detail remains in native disclosure');}}
      const panelText=await page.locator('#matchup-panel-lineup').innerText();
      assert.match(panelText,/Official complete inactives[\s\S]*incomplete and unofficial/);
      const bulletins=sourceReport.availability.currentTeamBulletin||[];
      if(bulletins.length) {
        assert((await card.innerText()).includes(bulletins.length+' dated current-team bulletin entries'),'Exact reused bulletin count is visible on own club');
        assert((await card.innerText()).includes('They do not establish availability or inactivity for Week '+game.week));
        for(const row of bulletins){assert.equal(row.gameId,null);assert.equal(row.eventId,null);assert.equal(row.week,null);assert.equal(row.reportedInactive,null);}
      }
      const geometry=await q.geometry(page);
      await card.scrollIntoViewIfNeeded();
      const image=await q.capture(page,out,`${engine}-${viewport.width}-${abbr}-${id}-${field}`);
      const original={...image,path:path.join(out,image.file),engine,viewport,team:abbr,gameId:id,field};report.originals.push(original);
      const evidence={team:abbr,gameId:id,field,status:'passed',sourceRows:sourceReport.availability[field],quarterbacks,renderedInjuries:rendered,bulletinCount:bulletins.length,geometry,original};
      r.coverage.push(evidence);r.availabilityCoverage.push({team:abbr,gameId:id,field,status:'passed'});report.coverage.push({engine,viewport,team:abbr,gameId:id,field,status:'passed'});save();
    }
    // A separate untouched original records the meaningful returned Dallas view.
    await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await tq.ready(page);await q.active(page,'team-details');
    const upcoming=data.teamForm.teams.DAL.upcomingGameId;assert.equal(await page.locator('[data-upcoming-game]').getAttribute('data-upcoming-game'),upcoming);
    await tap(page.locator(tq.TEAM+' [data-upcoming-game] [data-td-action="matchup"]'),'Dallas own future before native Back');await q.ready(page);await q.active(page);assert.equal((await page.evaluate(()=>window.MatchupBreakdown.getState())).game,upcoming);
    await tap(page.locator(q.PAGE+' .mb-back'),'Native Back Dallas');await tq.ready(page);await q.active(page,'team-details');assert.equal((await page.evaluate(()=>window.PDTeamDetails.getState())).team,'DAL');assert.equal(await page.locator('[data-upcoming-game]').getAttribute('data-upcoming-game'),upcoming);
    await page.locator('[data-upcoming-game]').scrollIntoViewIfNeeded();const backImage=await q.capture(page,out,`${engine}-${viewport.width}-returned-dallas-week6`);report.originals.push({...backImage,path:path.join(out,backImage.file),engine,viewport,role:'native-returned-dallas'});r.returnedDallasOriginal=backImage;
    assert.equal(r.coverage.length,12);assert.deepEqual(r.errors.javascriptAndConsole,[]);assert.deepEqual(r.errors.http,[]);
    const cancelled=r.errors.failed.filter(row=>['net::ERR_ABORTED','Load request cancelled'].includes(row.error));r.errors.cancelledNavigation=cancelled;r.errors.failed=r.errors.failed.filter(row=>!cancelled.includes(row));assert.deepEqual(r.errors.failed,[]);
    r.status='passed';r.completedAt=new Date().toISOString();save();
  }catch(error){r.status='failed';r.failure={message:error.message,stack:error.stack};try{const image=await q.capture(page,out,engine+'-'+viewport.width+'-failure');r.failureOriginal=image;}catch{}throw error;}
  finally{save();await context.close();}
}
(async()=>{try{
  browser=await q.launch(engine,/^https:/.test(base));report.browserVersion=browser.version();
  for(const viewport of[{width:393,height:852},{width:430,height:896}])await scenario(viewport);
  assert.deepEqual(q.runtimeManifest(),runtime);assert.deepEqual(q.tests(),originalTests);assert.equal(q.SHA(fs.readFileSync(__filename)),scriptHash);
  report.status='passed';report.unchangedDuringQA=true;report.testLogicUnchangedDuringQA=true;report.originalTestLogicUnchangedDuringQA=true;
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();save();fs.writeFileSync(path.join(out,'originals.json'),JSON.stringify({status:report.status,runtimeManifestSha256:canonical,originals:report.originals},null,2)+'\n');console.log(JSON.stringify({status:report.status,engine,report:path.join(out,'results.json'),sha256:q.SHA(fs.readFileSync(path.join(out,'results.json'))),completedAt:report.completedAt,failure:report.failure}));}})();
