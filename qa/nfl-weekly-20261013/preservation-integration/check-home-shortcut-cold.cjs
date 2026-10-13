'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const {chromium}=require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const root='/workspace/project-dollers',out=__dirname;
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(root+'/assets/nfl-dashboard.js')).digest('hex');
const result={qualification:'Actual first-load click with native local requests. No network delays, interception, clock/DOM/app substitutions.',startedAt:new Date().toISOString(),sourceBefore:hash(),errors:[]};
(async()=>{
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en-AU',timezoneId:'Australia/Sydney'});
    const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
    await page.goto('http://127.0.0.1:8809/project-dollers/#home',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
    result.beforeClick=await page.evaluate(()=>({page:document.querySelector('.page.active').dataset.page,week:window.PDApp.getContext().state.week,weeklySourceLoaded:!!window.PDTeamDetails.getDataset(),weeklyActionPresent:!!document.querySelector('[data-page="nfl"] [data-nfl-action="matchups"]')}));
    await page.locator('[data-home-topics] [data-home-shortcut="matchups"]').click();
    try {await page.waitForFunction(()=>['game-report','matchup-breakdown'].includes(document.querySelector('.page.active')?.dataset.page),null,{timeout:10000});}
    catch(error){result.routeTimeout=error.message;}
    result.afterClick=await page.evaluate(()=>({page:document.querySelector('.page.active').dataset.page,hash:location.hash,weeklySourceLoaded:!!window.PDTeamDetails.getDataset(),weeklyActionPresent:!!document.querySelector('[data-page="nfl"] [data-nfl-action="matchups"]')}));
    if(!['game-report','matchup-breakdown'].includes(result.afterClick.page))throw new Error('Cold Home Matchups shortcut stopped at NFL');
    if(result.afterClick.page==='game-report')await page.locator('[data-page="game-report"] [data-gr-action="back"]').first().click();
    else await page.locator('.mb-back').click();
    await page.waitForFunction(()=>document.querySelector('.page.active')?.dataset.page==='nfl');
    await page.locator('#week-select').selectOption('6');
    await page.locator('#nfl-weekly-game').selectOption('2026_06_NYJ_NE');
    await page.locator('[data-page="nfl"] .nfl-editorial-breadcrumb [data-open="home"]').click();
    await page.locator('[data-home-topics] [data-home-shortcut="matchups"]').click();
    await page.waitForFunction(()=>document.querySelector('.page.active')?.dataset.page==='matchup-breakdown');
    await page.waitForFunction(()=>document.querySelector('.mb-fixture')?.dataset.mbFixture==='2026_06_NYJ_NE');
    result.readyUpcoming=await page.evaluate(()=>({page:document.querySelector('.page.active').dataset.page,hash:location.hash,state:window.MatchupBreakdown.getState()}));
    if(result.readyUpcoming.state.game!=='2026_06_NYJ_NE'||result.readyUpcoming.state.returnRoute!=='nfl')throw new Error('Ready Home shortcut did not retain selected upcoming event and NFL return');
    await page.locator('.mb-back').click();await page.waitForFunction(()=>document.querySelector('.page.active')?.dataset.page==='nfl');
    result.backFromUpcoming=await page.evaluate(()=>({hash:location.hash,week:document.querySelector('#week-select').value,game:document.querySelector('#nfl-weekly-game').value}));
    if(result.backFromUpcoming.week!=='6'||result.backFromUpcoming.game!=='2026_06_NYJ_NE')throw new Error('Ready Home shortcut Back lost weekly selection');
    result.status='PASS';await context.close();
  } catch(error){result.status='FAIL';result.error=error.stack;process.exitCode=1;}
  finally {
    if(browser)await browser.close();result.browserClosed=true;result.sourceAfter=hash();result.sourceStable=result.sourceBefore===result.sourceAfter;
    if(!result.sourceStable||result.errors.length){result.status='FAIL';process.exitCode=1;}
    result.finishedAt=new Date().toISOString();fs.writeFileSync(out+'/home-shortcut-cold-results.json',JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }
})();
