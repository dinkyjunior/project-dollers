'use strict';
// Reproducible independent source/value check for all wired team routes and
// the real bridge to existing, separately sourced Steelers player research.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../../..');
const {launch,freePort,ready,active,sourceData,runtimeManifest}=require(ROOT+'/qa/team-details/qa.cjs');
const {eligibleGames,derivedMetrics,numericText}=require(ROOT+'/qa/team-details/controls.cjs');
const args=process.argv.slice(2),output=args[args.indexOf('--output')+1];
assert.ok(args.includes('--output')&&output&&!output.startsWith('--'),'Fresh --output directory required');
const out=path.resolve(output);assert.equal(fs.existsSync(out),false,'Never overwrite a prior audit');fs.mkdirSync(out,{recursive:true});
const SHA=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes=fs.readFileSync(ROOT+'/qa/team-details/candidate-runtime-manifest.json'),frozen=JSON.parse(manifestBytes);
const report={status:'running',startedAt:new Date().toISOString(),qualification:'Independent genuine Chromium 393 native routes and source-derived values. No source/request substitution. Pixel identity and physical iPhone performance are not claimed.',source:{manifestSha256:SHA(manifestBytes),runtimeFiles:runtimeManifest(),testSha256:SHA(fs.readFileSync(__filename))},routes:[]};
let browser,server;
(async()=>{try{
  assert.deepEqual(report.source.runtimeFiles,frozen,'Runtime matches agreed frozen candidate');
  const port=await freePort(),base=`http://127.0.0.1:${port}/project-dollers/`;
  server=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});
  for(let n=0;n<30;n++){try{if((await fetch(base)).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await launch('chromium',false);
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const data=sourceData();
  for(const [abbr,team] of Object.entries(data.teamForm.teams)){
    await page.goto(base+'#team/'+abbr);await ready(page);await active(page);
    assert.equal(await page.evaluate(()=>window.PDTeamDetails.getState().team),abbr);
    const ids=await page.locator('.page.active [data-team-game]').evaluateAll(elements=>elements.map(element=>element.dataset.teamGame)),games=eligibleGames(team,data.teamForm.season,{window:5,season:'cross',venue:'all'});
    assert.deepEqual(ids,games.map(game=>String(game.id)),'Rendered recent games match independently selected source rows');
    const expected=derivedMetrics(team,games,'average'),values=[];
    for(const metric of ['netPassing','rushing','totalOffense'])for(const side of ['gained','allowed']){
      const text=await page.locator(`.page.active [data-td-stat="${metric}"][data-td-side="${side}"]`).innerText(),actual=numericText(text),value=expected.yards[metric][side].value;
      if(value===null)assert.equal(actual,null,'Incomplete source coverage remains unavailable');else assert.ok(actual!==null&&Math.abs(actual-value)<=.051,'Displayed statistic equals independently derived verified value');
      values.push({metric,side,text,expected:value});
    }
    report.routes.push({abbr,heading:await page.locator('.page.active .td-hero h1').innerText(),ids,values});
  }
  assert.equal(report.routes.length,32,'Every wired club was independently checked');
  await page.goto(base+'#team/PIT');await ready(page);await page.locator('.page.active [data-team-tab="players"]').tap();
  const bridge=page.locator('.page.active [data-open="steelers"]');assert.equal(await bridge.count(),1,'PIT player research has a real existing destination');
  await bridge.tap();await active(page,'steelers');assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current,'Existing research retains its own verified source dataset');
  assert.ok(await page.locator('#roster [data-player]').count()>0,'Existing genuine roster remains populated');
  await page.locator('[data-filter="QB"]').tap();const player=page.locator('#roster [data-player]').first(),playerId=await player.getAttribute('data-player');await player.tap();
  await page.locator(`#player-detail-${playerId}[data-player-history-state="ready"]`).waitFor({state:'visible'});
  const detail=page.locator('#player-detail-'+playerId),sourcePlayer=data.current.roster.find(item=>item.id===playerId);assert.ok(sourcePlayer,'PIT research identity comes from its current verified roster');
  assert.ok((await detail.innerText()).includes(sourcePlayer.position),'Research retains player position');
  await detail.locator('[data-history-mode="opponent"]').tap();assert.equal(await detail.locator('[data-history-mode="opponent"]').getAttribute('aria-pressed'),'true','Existing weekly-opponent research remains interactive');
  await detail.locator('[data-history-mode="recent"]').tap();assert.equal(await detail.locator('[data-history-mode="recent"]').getAttribute('aria-pressed'),'true','Existing personal last-five research remains interactive');
  report.steelersBridge={status:'passed',route:page.url(),playerId,playerName:sourcePlayer.name,rosterFeedSeason:data.current.season,rosterFeedRetrievedAt:data.current.retrievedAt,teamFormRetrievedAt:data.teamForm.retrievedAt,historyStatus:await detail.getAttribute('data-player-history-state')};
  assert.deepEqual(errors,[],'No JavaScript or console errors');report.errors=errors;await context.close();
  report.unchangedDuringRun=JSON.stringify(runtimeManifest())===JSON.stringify(report.source.runtimeFiles);assert.equal(report.unchangedDuringRun,true,'Runtime remained frozen during independent audit');report.status='passed';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};}
finally{if(browser)await browser.close();if(server)server.kill('SIGTERM');report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({out,status:report.status,routes:report.routes.length,bridge:report.steelersBridge,failure:report.failure})+'\n');process.exitCode=report.status==='passed'?0:1;}})();
