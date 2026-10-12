'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const q=require('../../home-gate.cjs'),paint=require('../../team-details/capture-ready.cjs');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.resolve(process.argv[2]||path.join(__dirname,'historical-context-native')),SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.ok(!fs.existsSync(OUT),'Immutable native context evidence must be fresh');fs.mkdirSync(OUT);
const source=q.runtimeManifest(),receipt={status:'running',engine:'webkit',startedAt:new Date().toISOString(),source,helperSha256:SHA(fs.readFileSync(__filename)),originals:[],actions:[],errors:[]};
fs.copyFileSync(__filename,OUT+'/executed-helper.cjs');const save=()=>fs.writeFileSync(OUT+'/results.json',JSON.stringify(receipt,null,2)+'\n');save();let browser;
(async()=>{try{
  browser=await q.launch('webkit',false);receipt.browserVersion=browser.version();
  receipt.results=[];
  for(const viewport of [{width:393,height:852},{width:430,height:896},{width:1440,height:900}]){
  const result={viewport};receipt.results.push(result);
  const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:viewport.width<500,hasTouch:viewport.width<500,locale:'en-AU',timezoneId:'Australia/Sydney'}),page=await context.newPage();
  page.on('pageerror',error=>receipt.errors.push(error.message));
  const game='2025_02_CLE_BAL',route='game-report?'+new URLSearchParams({team:'CLE',game,return:'team/CLE'});
  const response=await page.goto('http://127.0.0.1:8876/project-dollers/#'+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);
  await page.waitForFunction(g=>document.querySelector('.page.active')?.dataset.page==='game-report'&&window.PDGameReport?.getReport()?.id===g,game);
  await page.evaluate(()=>document.fonts.ready);
  result.reportState=await page.evaluate(()=>({state:window.PDGameReport.getState(),season:window.PDGameReport.getReport().season}));
  receipt.originals.push(await paint.capture(page,OUT,'selected-2025-game-report-'+viewport.width));
  const target=page.locator('[data-page="game-report"] .gr-bottom-nav [data-gr-action="matchups"]');await target.scrollIntoViewIfNeeded();if(viewport.width<500)await target.tap();else await target.click();
  receipt.actions.push({input:'native-touch',selector:'.gr-bottom-nav [data-gr-action="matchups"]',resultHash:new URL(page.url()).hash});
  await page.waitForFunction(g=>document.querySelector('.page.active')?.dataset.page==='matchup-breakdown'&&window.MatchupBreakdown?.getFixture()?.id===g&&window.MatchupBreakdown?.getDataset()?._sourceIntegrity?.status==='verified',game);
  await page.locator('[data-page="matchup-breakdown"] .mb-fixture').scrollIntoViewIfNeeded();
  receipt.originals.push(await paint.capture(page,OUT,'selected-2025-matchup-context-'+viewport.width));
  result.context=await page.evaluate(()=>({
    state:window.MatchupBreakdown.getState(),selectedFixture:window.MatchupBreakdown.getFixture(),
    datasetSeason:window.MatchupBreakdown.getDataset().season,
    visibleSeasonBadge:document.querySelector('.mb-season')?.innerText,
    visibleFixture:document.querySelector('.mb-fixture-copy')?.innerText,
    visibleResearchContext:document.querySelector('.mb-context')?.innerText,
    selectedFormYears:window.MatchupBreakdown.getSelectedGames().map(g=>g.season),
    visibleTitle:document.querySelector('.mb-title')?.innerText,
    footer:document.querySelector('#matchup-breakdown-footer')?.innerText
  }));
  assert.equal(result.context.selectedFixture.id,game);assert.equal(result.context.selectedFixture.season,2025);
  result.explicitSelectedEventSeason=/2025/.test(result.context.visibleFixture);
  result.currentResearchClearlyQualified=/2026.*(?:snapshot|research)|(?:snapshot|research).*2026/i.test(result.context.visibleResearchContext+' '+result.context.visibleSeasonBadge);
  assert.ok(result.explicitSelectedEventSeason,'Selected 2025 event season must be explicit in its fixture context; a 2026 badge/date without a year is ambiguous');
  assert.ok(result.currentResearchClearlyQualified,'Current last-five research remains explicitly identified as the latest 2026 snapshot, not older pregame figures');
  assert.equal(receipt.errors.length,0);result.status='passed';await context.close();save();
  }
  receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(browser)await browser.close();receipt.browserClosed=true;receipt.finalSource=q.runtimeManifest();receipt.sourceStable=JSON.stringify(source)===JSON.stringify(receipt.finalSource);receipt.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:receipt.status,browserClosed:true,sourceStable:receipt.sourceStable,path:OUT+'/results.json',failure:receipt.failure?.message}));}})();
