'use strict';
// Read-only, real-browser verification of the one roster identity affected by
// the incoming automatic refresh. No route response or source substitution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process'),{once}=require('node:events');
const {runtimeManifest,launch}=require('../functional.cjs');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.join(__dirname,'current-data-ui.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const manifest=runtimeManifest(),data=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/current.json'))),history=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/player-history.json'))),id='00-0040176',player=data.roster.find(p=>p.id===id);
 const report={status:'running',startedAt:new Date().toISOString(),gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),scriptSha256:sha(fs.readFileSync(__filename)),runtimeManifest:manifest,qualification:{sourceResponsesSubstituted:false,physicalIPhoneTested:false,engine:'actual Chromium',mobileViewports:[{width:393,height:852},{width:430,height:896}],deviceScaleFactor:2,scope:'Affected disputed roster identity and its original personal/opponent history only; complete WebKit suites are recorded separately'},results:[]};
 let browser,server;
 try{
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  const base=`http://127.0.0.1:${port}/project-dollers/`;server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});
  for(let i=0;i<50;i++){try{if((await fetch(base)).status===200)break;}catch{}if(i===49)throw new Error('Local source server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await launch('chromium',false);
  for(const viewport of report.qualification.mobileViewports){
   const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'UTC'}),page=await context.newPage(),errors=[],httpErrors=[],external=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});});page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===new URL(base).origin||['data:','blob:','about:'].includes(u.protocol))return r.continue();external.push(u.href);return r.abort();});
   const response=await page.goto(base+'#steelers',{waitUntil:'networkidle'});assert.equal(response.status(),200);await page.waitForFunction(()=>window.PD_DATA?.roster?.length&&document.querySelector('.page.active')?.dataset.page==='steelers');
   assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data,'Actual browser consumes exact incoming JSON');
   await page.locator('[data-filter="DEF"]').tap();const card=page.locator(`[data-player-id="${id}"]`);assert.equal(await card.count(),1,'Disputed retained primary record stays accessible');
   const collapsedText=await card.innerText();assert.match(collapsedText,/Bradyn Swinson/);assert.match(collapsedText,/Roster disputed/);assert.doesNotMatch(collapsedText,/confirmed departure/i);
   await card.locator(`[data-player="${id}"]`).tap();await page.waitForFunction(playerId=>document.getElementById('player-detail-'+playerId)?.dataset.playerHistoryState==='ready',id);
   const detail=card.locator('.player-detail'),note=await detail.locator('[data-roster-disagreement]').innerText();assert.match(note,/Roster sources differ/);assert.match(note,/ESPN No matched roster entry/);assert.match(note,/espn athlete 4431424/);assert.match(await detail.locator('.research-subtitle').innerText(),/Primary feed: Practice squad/);
   const readGames=async(expected)=>{
    const gameIds=await detail.locator('.game-breakdown').evaluateAll(nodes=>nodes.map(n=>n.dataset.gameId));assert.deepEqual(gameIds,expected,'Original source-linked personal/opponent records retained');
    const checked=[];for(const gameId of expected){const source=history.players[id].games[gameId],game=detail.locator(`[data-game-id="${gameId}"]`);await game.locator('summary').first().tap();
     const fields=await game.locator('.game-full-stats > .game-stat-group [data-stat-key]').evaluateAll(nodes=>nodes.map(n=>({key:n.dataset.statKey,text:n.querySelector('b').textContent})));
     for(const field of fields){const val=source.stats[field.key],formatted=val!==null&&val!==undefined&&val!==''&&Number.isFinite(Number(val))?Number(val).toLocaleString('en-US',{maximumFractionDigits:2}):'—';assert.equal(field.text,formatted,`${gameId} ${field.key}`);}
     checked.push({gameId,season:source.season,week:source.week,originalClub:source.team,opponent:source.opponent,sourceIds:source.sourceIds,fieldCount:fields.length,fields});
    }return checked;
   };
   const personal=await readGames(history.players[id].last5);assert.deepEqual(personal.map(g=>g.gameId),['2025_12_NE_CIN']);
   const cinWeek=Object.keys(data.weeks).find(w=>{const f=data.weeks[w].fixture;return f&&(f.home_team==='CIN'||f.away_team==='CIN');});assert.ok(cinWeek);
   await detail.locator('[data-history-week]').selectOption(cinWeek);await detail.locator('[data-history-mode="opponent"]').tap();assert.match(await detail.locator('.history-summary').innerText(),/1 recorded meetings/);
   // Native selection re-renders the one details element with its saved state.
   for(const g of await detail.locator('.game-breakdown').all())if(await g.getAttribute('open')!==null)await g.locator('summary').first().tap();
   const againstCincinnati=await readGames(history.players[id].byOpponent.CIN.gameIds);
   await page.locator('#roster-note [data-sources]').tap();await page.waitForFunction(()=>document.querySelector('#sources-dialog')?.open===true);
   const fallbackLink=page.locator('#sources-content a').filter({hasText:'espn athlete 4431424'});assert.equal(await fallbackLink.count(),1);assert.equal(await fallbackLink.getAttribute('href'),data.sources.find(s=>s.id==='espn_athlete_4431424').url);
   const sourcesText=await page.locator('#sources-content').innerText();assert.match(sourcesText,/Bradyn Swinson/);assert.match(sourcesText,/No matched roster entry/);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#sources-dialog').open);
   assert.equal(await page.locator('.page').count(),3);const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth>innerWidth,active:document.querySelector('.page.active .page-scroll').scrollWidth>document.querySelector('.page.active .page-scroll').clientWidth}));assert.deepEqual(overflow,{document:false,active:false});
   assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed.filter(f=>!['net::ERR_ABORTED','Load request cancelled'].includes(f.error)),[]);
   report.results.push({status:'passed',viewport,collapsedText,rosterDisagreement:note,currentMembershipAssertion:'Not confirmed. Visible Roster disputed and Primary feed labels; no invented other team or departure.',personal,againstCincinnati,opponentWeek:Number(cinWeek),fallbackSourceLink:await fallbackLink.getAttribute('href'),sourcesDisagreementVisible:true,overflow,errors:{consoleAndJavaScript:errors,http:httpErrors,external,failed}});await context.close();
  }
  assert.deepEqual(runtimeManifest(),manifest,'No runtime source changed during affected-record QA');report.status='passed';
 }catch(e){report.status='failed';report.error={message:e.message,stack:e.stack};throw e;}
 finally{if(browser){await browser.close();report.browserClosed=true;}if(server){server.kill();report.serverClosed=true;}report.completedAt=new Date().toISOString();fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({status:report.status,results:report.results.length,output:path.relative(ROOT,OUT)}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
