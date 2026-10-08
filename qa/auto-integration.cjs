'use strict';
/* Independent update-integration audit; actual app, browser and controlled verified feed. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {launchChromium} = require('./run.cjs');
const ROOT=path.resolve(__dirname,'..');
const base=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/current.json')));
const changed=structuredClone(base);changed.retrievedAt=new Date(Date.parse(base.retrievedAt)+60000).toISOString();changed.generatedAt=changed.retrievedAt;
const playerId='00-0035640';changed.roster.find(p=>p.id===playerId).seasonStats.receivingYards+=17;
const historyBase=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/player-history.json')));
const historyChanged=structuredClone(historyBase);historyChanged.generatedAt=new Date(Date.parse(base.generatedAt)+120000).toISOString();
const historyChangedBytes=Buffer.from(JSON.stringify(historyChanged));
const historyChangedSha=require('node:crypto').createHash('sha256').update(historyChangedBytes).digest('hex');
const changedHistorySnapshot=structuredClone(changed);changedHistorySnapshot.retrievedAt=new Date(Date.parse(base.retrievedAt)+120000).toISOString();changedHistorySnapshot.generatedAt=changedHistorySnapshot.retrievedAt;changedHistorySnapshot.playerHistory.sha256=historyChangedSha;
const invalidSnapshot=structuredClone(changed);delete invalidSnapshot.steelers.record;
const rendererFailureSnapshot=structuredClone(changed);rendererFailureSnapshot.weeks['2'].leaders.QB=[null];
const historyFailedSnapshot=structuredClone(changedHistorySnapshot);historyFailedSnapshot.retrievedAt=new Date(Date.parse(base.retrievedAt)+180000).toISOString();historyFailedSnapshot.playerHistory.sha256='a'.repeat(64);
let mode='base'; const requests=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(!pathname.startsWith('/project-dollers/')){res.writeHead(404);res.end();return;}
 let relative=pathname.slice('/project-dollers/'.length)||'index.html';
 if(relative.includes('..')){res.writeHead(404);res.end();return;}
 if(relative==='assets/data/current.json'){
  requests.push({mode,at:new Date().toISOString(),etag:req.headers['if-none-match']||null});
  if(mode==='fail'){res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');return;}
  const value=mode==='renderfail'?rendererFailureSnapshot:mode==='invalid'?invalidSnapshot:mode==='historyfail'?historyFailedSnapshot:mode==='historynew'?changedHistorySnapshot:mode==='new'?changed:base;
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache','ETag':mode==='new'?'"new-snapshot"':'"base-snapshot"'});res.end(JSON.stringify(value));return;
 }
 if(relative==='assets/data/player-history.json'&&mode==='historynew'){res.writeHead(200,{'Content-Type':'application/json'});res.end(historyChangedBytes);return;}
 const file=path.join(ROOT,relative);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function viewState(page){return page.evaluate(playerId=>({
 activePage:document.querySelector('.page.active')?.dataset.page,
 week:document.querySelector('#week-select')?.value,
 conference:document.querySelector('[data-conference][aria-pressed="true"]')?.dataset.conference,
 nflTab:document.querySelector('[data-nfl-tab][aria-selected="true"]')?.dataset.nflTab,
 teamTab:document.querySelector('[data-team-tab][aria-selected="true"]')?.dataset.teamTab,
 filter:document.querySelector('[data-filter][aria-pressed="true"]')?.dataset.filter,
 expanded:document.querySelector(`[data-player="${playerId}"]`)?.getAttribute('aria-expanded'),
 historyMode:document.querySelector('[data-history-mode][aria-pressed="true"]')?.dataset.historyMode,
 historyWeek:document.querySelector('[data-history-week]')?.value,
 seasonOpen:document.querySelector('.season-overview')?.open,
 gameOpen:[...document.querySelectorAll('.game-breakdown[open]')].map(e=>e.dataset.gameId),
 extraOpen:[...document.querySelectorAll('.additional-statistics[open]')].map(e=>e.dataset.extraGame),
 scroll:[...document.querySelectorAll('.page-scroll')].map(e=>e.scrollTop),
 focus:document.activeElement?.outerHTML?.slice(0,160),
 receivedYards:PD_DATA.roster.find(p=>p.id===playerId).seasonStats.receivingYards,
 historyPresent:!!window.PD_HISTORY,
 dataReady:document.documentElement.dataset.dataReady,
 sourceText:document.querySelector('#sources-content')?.textContent,
 fixtureText:document.querySelector('#featured-matchup')?.textContent
 }),playerId);}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await launchChromium();const errors=[],failedRequests=[];let report;
 try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,timezoneId:'Australia/Sydney'});
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(`http://127.0.0.1:${server.address().port}/project-dollers/#nfl`);await page.waitForFunction(()=>PD_DATA&&PD_UPDATE_STATUS);
  assert.equal(requests.length,1,'app-open check is not duplicated');
  await page.locator('[data-conference="NFC"]').click();await page.locator('#week-select').selectOption('2');await page.locator('[data-nfl-tab="players"]').click();
  // NFL destination controls intentionally remain inline in this approved pass.
  // Audit the preserved research screen through its existing direct hash URL.
  await page.evaluate(()=>{location.hash='steelers';});
  await page.waitForFunction(()=>document.querySelector('.page.active').dataset.page==='steelers');
  await page.locator('[data-team-tab="roster"]').click();await page.locator('[data-filter="WR"]').click();
  await page.locator(`[data-player="${playerId}"]`).click();await page.waitForFunction(()=>window.PD_HISTORY&&document.querySelector('.player-detail[data-player-history-state="ready"]'));
  await page.locator('[data-history-mode="opponent"]').click();
  await page.locator('.season-overview').evaluate(e=>{e.open=true;});await page.locator('.game-breakdown').first().evaluate(e=>{e.open=true;});
  await page.locator('.additional-statistics').first().evaluate(e=>{e.open=true;});
  await page.waitForTimeout(50);
  await page.locator('.page.active .page-scroll').evaluate(e=>{e.scrollTop=450;});
  await page.locator('[data-history-week]').focus();
  const before=await viewState(page);mode='new';
  await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));await page.waitForFunction(()=>PD_UPDATE_STATUS.state==='updated');
  const after=await viewState(page);
  const preserved=['activePage','week','conference','nflTab','teamTab','filter','expanded','historyMode','historyWeek','seasonOpen','gameOpen','extraOpen','scroll','historyPresent'];
  for(const key of preserved)assert.deepEqual(after[key],before[key],`${key} survives changed snapshot`);
  assert.equal(after.receivedYards,before.receivedYards+17,'changed verified data is rendered into state');
  const focusPreserved=after.focus===before.focus;
  mode='invalid';await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));const invalid=await viewState(page);
  for(const key of [...preserved,'receivedYards','sourceText','fixtureText','dataReady'])assert.deepEqual(invalid[key],after[key],`${key} survives incomplete nested feed`);
  assert.equal(await page.evaluate(()=>PD_UPDATE_STATUS.state),'error');
  mode='renderfail';await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));const renderFailed=await viewState(page);
  for(const key of [...preserved,'receivedYards','sourceText','fixtureText','dataReady'])assert.deepEqual(renderFailed[key],after[key],`${key} survives renderer exception rollback`);
  assert.equal(await page.evaluate(()=>PD_UPDATE_STATUS.state),'error');
  mode='fail';await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));const failed=await viewState(page);
  for(const key of [...preserved,'receivedYards','sourceText','fixtureText','dataReady'])assert.deepEqual(failed[key],after[key],`${key} survives refresh failure`);
  assert.match(await page.locator('#data-status').textContent(),/Retained verified data/);
  mode='new';await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>PD_UPDATE_STATUS.state==='unchanged');
  const reconnect=await viewState(page);for(const key of preserved)assert.deepEqual(reconnect[key],after[key],`${key} survives reconnect unchanged check`);
  assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  await page.locator('.page.active .page-scroll').evaluate(e=>{e.scrollTop=2600;});
  const historyBefore=await viewState(page);
  await page.evaluate(()=>document.querySelector('#sources-dialog').showModal());
  await page.locator('#sources-content a').first().focus();
  const sourceFocusBefore=await page.evaluate(()=>document.activeElement?.getAttribute('href'));
  mode='historynew';
  await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
  await page.waitForFunction(sha=>PD_DATA.playerHistory.sha256===sha&&PD_HISTORY&&PD_HISTORY.generatedAt!==undefined&&document.querySelector('.player-detail[data-player-history-state="ready"]'),historyChangedSha);
  const sourceFocusAfter=await page.evaluate(()=>document.activeElement?.getAttribute('href'));
  const sourceFocusPreserved=sourceFocusBefore===sourceFocusAfter;
  assert.equal(sourceFocusPreserved,true,'source link focus remains inside open dialog');
  assert.equal(await page.evaluate(()=>document.querySelector('#sources-dialog').open),true);
  await page.evaluate(()=>document.querySelector('#sources-dialog').close());
  const historyAfter=await viewState(page);
  const historyScrollPreserved=JSON.stringify(historyAfter.scroll)===JSON.stringify(historyBefore.scroll);
  const historyOtherPreserved=preserved.filter(key=>key!=='scroll').every(key=>JSON.stringify(historyAfter[key])===JSON.stringify(historyBefore[key]));
  assert.ok(historyOtherPreserved,'history replacement retains all non-scroll selected state');
  mode='historyfail';await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
  await page.waitForFunction(()=>document.querySelector('.player-detail:not([hidden])')?.textContent.includes('Previous verified history is retained'));
  const retainedHistory=await viewState(page);
  for(const key of preserved)assert.deepEqual(retainedHistory[key],historyAfter[key],`${key} survives rejected new history checksum`);
  assert.match(await page.locator('.player-detail:not([hidden])').textContent(),/original source times/);
  const sourceCopy=await page.locator('#sources-content').textContent();assert.match(sourceCopy,/not live play-by-play/);assert.match(sourceCopy,/push feed is not connected/);
  report={status:focusPreserved&&historyScrollPreserved?'passed':'passed-with-findings',checkedAt:new Date().toISOString(),browser:browser.version(),viewport:{width:393,height:852},appSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT,'assets/app.js'))).digest('hex'),checks:preserved,focusPreserved,sourceFocusPreserved,historyScrollPreserved,historyBeforeScroll:historyBefore.scroll,historyAfterScroll:historyAfter.scroll,focusBefore:before.focus,focusAfter:after.focus,requestCount:requests.length,requests,pageErrors:errors,failedRequests,nestedInvalidPreserved:true,rendererRollbackPreserved:true,historyChecksumFailureRetained:true,sourceClaim:'Accurately states verified publication checks; no live play-by-play or configured push feed.',before:{...before,sourceText:undefined,fixtureText:undefined},after:{...after,sourceText:undefined,fixtureText:undefined},failure:{...failed,sourceText:undefined,fixtureText:undefined}};
  const outputIndex=process.argv.indexOf('--output');
  const reportPath=outputIndex>=0?path.resolve(process.argv[outputIndex+1]):path.join(ROOT,'qa/next-pass/auto-update-integration.json');
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,focusPreserved,sourceFocusPreserved,historyScrollPreserved,historyBeforeScroll:historyBefore.scroll,historyAfterScroll:historyAfter.scroll,checks:preserved,requestCount:requests.length,pageErrors:errors,failedRequests},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
