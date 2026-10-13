'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const ROOT = '/workspace/project-dollers';
const BASE = process.env.PD_NFL_AUDIT_BASE || 'http://127.0.0.1:8000/project-dollers/';
const book = JSON.parse(fs.readFileSync(ROOT + '/assets/data/current.json'));
const files = ['index.html','assets/nfl-dashboard.js','assets/nfl-editorial.css','assets/app.js','assets/home-editorial.js','assets/home-editorial.css','assets/data/current.json'];
const hashes = () => Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(ROOT + '/' + name)).digest('hex')]));
const OUT = '/workspace/.onboarding/nfl-editorial-preservation/native-' + new Date().toISOString().replace(/[:.]/g,'-');
fs.mkdirSync(OUT,{recursive:true});
fs.copyFileSync(__filename,OUT + '/executed-helper.cjs');
const result = {status:'running', startedAt:new Date().toISOString(), sourceBefore:hashes(), checks:[], actions:[], errors:[], httpErrors:[],
  qualification:'Native local Chromium controls and direct refresh, compared with the retained exact JSON snapshot. No source, response, DOM, CSS, clock or state substitution. This does not independently establish official current NFL data freshness or hosted publication.'};
let browser;
const check = (name, evidence) => result.checks.push({name, evidence});
const available = value => value !== null && value !== undefined && value !== '';
const number = value => available(value) && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-AU') : '—';
const diff = team => available(team.pointDifferential) ? Number(team.pointDifferential) : Number(team.pointsFor)-Number(team.pointsAgainst);
const abbr = team => team.abbr || String(team.id).toUpperCase();
function allCompleted(throughWeek) {
  const map = new Map();
  for (const snapshot of Object.values(book.weeks)) for (const game of snapshot.recap || []) {
    if (game.id && game.status === 'final' && game.season === book.season && available(game.home_score) && available(game.away_score)) map.set(game.id,game);
  }
  return [...map.values()].filter(game => Number(game.week) <= throughWeek)
    .sort((a,b) => Number(a.week)-Number(b.week) || String(a.gameday).localeCompare(String(b.gameday)) || a.id.localeCompare(b.id));
}
function expectedForm(team, snapshot, count) {
  const games = allCompleted(snapshot.throughWeek).filter(game => [game.home_team,game.away_team].includes(abbr(team)));
  if (games.length !== Number(team.w)+Number(team.l)+Number(team.ties || 0)) return [];
  const scores = games.map(game => {const home=game.home_team===abbr(team);return {own:Number(home?game.home_score:game.away_score),other:Number(home?game.away_score:game.home_score)};});
  if (scores.filter(score => score.own>score.other).length !== Number(team.w)
    || scores.filter(score => score.own<score.other).length !== Number(team.l)
    || available(team.pointsFor) && scores.reduce((sum,score) => sum+score.own,0) !== Number(team.pointsFor)
    || available(team.pointsAgainst) && scores.reduce((sum,score) => sum+score.other,0) !== Number(team.pointsAgainst)) return [];
  return scores.slice(-count).map(score => score.own>score.other?'W':score.own<score.other?'L':'T');
}
async function click(page, selector) {
  await page.locator(selector).click();
  result.actions.push({type:'click',selector});
}
async function select(page, selector, value) {
  await page.locator(selector).selectOption(String(value));
  result.actions.push({type:'select',selector,value:String(value)});
}
async function route(page, name) {
  await page.waitForFunction(name => document.querySelector('.page.active')?.dataset.page===name,name);
}
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.dataReady==='true');
  await page.evaluate(async () => document.fonts.ready);
}
async function standings(page, label) {
  const state = await page.evaluate(() => {const {state}=window.PDApp.getContext();return {week:String(state.week),conference:state.conference,sort:state.nflSort,division:state.nflDivision,form:state.nflForm,expanded:state.standingsExpanded};});
  const snapshot=book.weeks[state.week];
  assert.ok(snapshot,'Selected source week exists');
  const rows=await page.locator('#standings-rows .stand-row').evaluateAll(rows => rows.map(row => ({team:row.querySelector('[data-team]')?.dataset.team,cells:[...row.querySelectorAll(':scope > [role="cell"]')].map(cell=>cell.textContent.trim()),recordLabel:row.querySelector('.nfl-record')?.getAttribute('aria-label'),form:[...row.querySelectorAll('.form-chip')].map(cell=>cell.textContent.trim())})));
  const all=snapshot.conferences[state.conference];
  const sourceTeams=new Map(book.teams.map(team=>[abbr(team),team]));
  for (const row of rows) {
    const team=all.find(team=>abbr(team)===row.team);
    assert.ok(team,'Displayed team exists in selected source conference');
    assert.equal(row.cells.length,5,'Five compact source standings cells');
    assert.equal(row.cells[1],team.name);
    assert.equal(row.cells[2],`${number(team.w)}–${number(team.l)}${Number(team.ties)>0?`–${number(team.ties)}`:''}`);
    assert.equal(row.recordLabel,`${number(team.w)} wins, ${number(team.l)} losses, ${number(team.ties || 0)} ties`);
    assert.equal(row.cells[3],available(team.pct)?team.pct:'—');
    assert.deepEqual(row.form,expectedForm(team,snapshot,state.form));
    if (state.division!=='all') assert.equal(sourceTeams.get(row.team).division,state.division);
  }
  const expectedCount=all.filter(team=>state.division==='all'||sourceTeams.get(abbr(team)).division===state.division).length;
  assert.equal(rows.length,state.expanded?expectedCount:Math.min(5,expectedCount));
  const ranking=all.map(team=>({team:abbr(team),rank:Number(team.pct),pf:Number(team.pointsFor),pa:Number(team.pointsAgainst),differential:diff(team)}));
  const metric=team=>state.sort==='PF'?team.pf:state.sort==='PA'?-team.pa:state.sort==='DIFF'?team.differential:team.rank;
  for(let i=1;i<rows.length;i++) {
    assert.ok(Number(rows[i].cells[0])>Number(rows[i-1].cells[0]),'Displayed record order increases');
    assert.ok(metric(ranking.find(team=>team.team===rows[i].team))<=metric(ranking.find(team=>team.team===rows[i-1].team)),'Selected source metric is descending');
  }
  if (!state.expanded) {
    const excluded=ranking.filter(team=>!rows.some(row=>row.team===team.team)&&(state.division==='all'||sourceTeams.get(team.team).division===state.division));
    if(excluded.length&&rows.length) assert.ok(excluded.every(team=>metric(team)<=metric(ranking.find(team=>team.team===rows.at(-1).team))),'Compact table contains true first five by selected metric');
  }
  const through=await page.locator('[data-page="nfl"] .through-week').textContent();
  assert.ok(through.includes(String(snapshot.throughWeek)),'Record context is source through week');
  check(label,{state,rows,sourceThroughWeek:snapshot.throughWeek});
}
async function leaders(page, position, panel='ladder', expanded=false) {
  const week=await page.locator('#week-select').inputValue();
  const snapshot=book.weeks[week];
  const section=page.locator('#'+panel+'-leaders .nfl-editorial-leaders');
  const button=section.locator('[data-nfl-action="leader-position"][data-position="'+position+'"]');
  await button.click();result.actions.push({type:'click',selector:'#'+panel+'-leaders [data-position="'+position+'"]'});
  const actual=await section.locator('.leader-row').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.textContent.trim())));
  const expected=snapshot.leaders?.[position] || [];
  const shown=expanded?expected:expected.slice(0,5);
  assert.equal(actual.length,shown.length);
  shown.forEach((player,index)=>{
    assert.equal(actual[index][0],String(index+1));
    assert.equal(actual[index][1],String(player.short||player.name||'').replace(/^([A-Za-z]{1,3}\.)(?=\S)/,'$1 '));
    assert.equal(actual[index][2],number(player.yards));
    assert.equal(actual[index][3],number(player.td));
  });
  const text=(await section.textContent()).toUpperCase();
  if (snapshot.leadersWeek) assert.ok(text.includes('WEEK '+snapshot.leadersWeek),'Actual statistics week displayed');
  else assert.ok(/AWAITING|UNAVAILABLE/.test(text),'Unknown weekly stats remain unavailable');
  check(`leaders-${week}-${panel}-${position}`,{week,sourceStatisticsWeek:snapshot.leadersWeek,rows:actual});
}
async function fixture(page, week) {
  const source=book.weeks[String(week)].fixture;
  const text=await page.locator('#featured-matchup').textContent();
  if (!source) assert.ok(/No Steelers fixture/i.test(text));
  else {
    assert.ok(text.includes(source.venue || 'Venue unavailable'));
    const own=source.home_team==='PIT'?source.home_score:source.away_score;
    const other=source.home_team==='PIT'?source.away_score:source.home_score;
    if (source.status==='final') {
      assert.ok(text.includes(`${number(own)}–${number(other)}`),'Exact source final score');
      assert.ok(/OPEN GAME REPORT/i.test(text));
    } else {
      assert.ok(/(?:OPEN|VIEW) MATCHUP/i.test(text));
      assert.ok(!/FINAL/i.test(text));
    }
    const date=new Intl.DateTimeFormat('en-AU',{weekday:'short',month:'short',day:'numeric',timeZone:source.kickoffUtc?'Australia/Sydney':'UTC'}).format(new Date(source.kickoffUtc || source.gameday+'T12:00:00Z'));
    assert.ok(text.includes(date),'Source kickoff date displayed in native locale');
    if(source.status!=='final'&&source.kickoffUtc) {
      const time=new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:'Australia/Sydney'}).format(new Date(source.kickoffUtc));
      assert.ok(text.includes(time),'Source kickoff time displayed in native timezone');
    }
    const labels=await page.locator('#featured-matchup .nfl-matchup-helmet').evaluateAll(images=>images.map(image=>image.alt));
    const opponent=source.home_team==='PIT'?source.away_team:source.home_team;
    assert.ok(labels.some(label=>label.includes(book.teams.find(team=>abbr(team)==='PIT').fullName)));
    assert.ok(labels.some(label=>label.includes(book.teams.find(team=>abbr(team)===opponent).fullName)));
  }
  check('fixture-'+week,{sourceGame:source?.id||null,status:source?.status||'bye',text:text.trim()});
}
async function report(page, id, team) {
  await route(page,'game-report');
  await page.waitForSelector('.gr-quarter-table tbody tr');
  const payload=JSON.parse(fs.readFileSync(ROOT+'/assets/data/game-reports/'+id+'.json'));
  const rows=await page.locator('.gr-quarter-table tbody tr').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.textContent.trim())));
  const opponent=payload.home_team===team?payload.away_team:payload.home_team;
  assert.deepEqual(rows, [team,opponent].map(abbr=>[abbr,...payload.quarters[abbr].map(String),String(abbr===payload.home_team?payload.home_score:payload.away_score)]));
  assert.ok(page.url().includes(encodeURIComponent(id)),'Event-specific game route');
  check('report-event-'+id,{team,rows,url:page.url()});
}
(async()=>{
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    result.browserVersion=browser.version();
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en-AU',timezoneId:'Australia/Sydney'});
    const page=await context.newPage();
    page.on('pageerror',error=>result.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400)result.httpErrors.push({status:response.status(),url:response.url()});});
    await page.goto(BASE+'#home',{waitUntil:'networkidle'});await ready(page);
    await click(page,'button[data-home-sport="nfl"]');
    await click(page,'[data-home-entry]');await route(page,'nfl');
    const season=await page.locator('#season-select').evaluate(select=>({disabled:select.disabled,values:[...select.options].map(option=>option.value)}));
    assert.deepEqual(season,{disabled:true,values:[String(book.season)]},'Only the actual retained standings season is offered');
    assert.ok((await page.locator('#season-context').textContent()).includes(String(book.season)));
    assert.ok((await page.locator('[data-page="nfl"] .standings').getAttribute('aria-label')).includes('not official playoff seeding'));
    check('retained-season-and-ranking-qualification',{season});
    await standings(page,'current-AFC-compact');await fixture(page,book.currentWeek);
    assert.equal(await page.evaluate(()=>window.PDApp.getContext().state.nflLeaderPosition),'RB','Initial source leader position is rushing');
    await leaders(page,'RB');
    for (const position of ['QB','RB','WR']) await leaders(page,position);
    await click(page,'[data-page="nfl"] [data-standings-toggle]');await standings(page,'current-AFC-full');
    await click(page,'[data-page="nfl"] [data-conference="NFC"]');await standings(page,'current-NFC-full');
    const division=await page.locator('#division-select option').evaluateAll(options=>options.map(option=>option.value).find(value=>value!=='all'));
    await select(page,'#division-select',division);await standings(page,'division-source-records');
    await select(page,'#standings-sort','PF');await standings(page,'division-PF-source-records');
    await select(page,'#division-select','all');
    await select(page,'#standings-sort','PCT');
    await click(page,'[data-page="nfl"] [data-conference="AFC"]');
    for (const week of [1,6,9]) {
      await select(page,'#week-select',week);await standings(page,'week-'+week+'-AFC');
      await leaders(page,'QB');await fixture(page,week);
    }
    await select(page,'#week-select',book.currentWeek);
    await click(page,'#nfl-ladder-passing');await leaders(page,'QB','players',true);await click(page,'#tab-ladder');
    await click(page,'#nfl-ladder-receiving');await leaders(page,'WR','players',true);await click(page,'#tab-ladder');
    await leaders(page,'RB');
    await click(page,'#nfl-ladder-rb');await leaders(page,'RB','players',true);await click(page,'#tab-ladder');
    await click(page,'#nfl-team-pit');
    const details=page.locator('#nfl-team-details-pit');
    if (!await details.isVisible()) await click(page,'#nfl-team-pit');
    const summary=await page.locator('.nfl-team-summary .nfl-summary-metric strong').allTextContents();
    const selectedWeek=await page.locator('#week-select').inputValue();
    const selectedTeam=book.weeks[selectedWeek].conferences.AFC.find(team=>abbr(team)==='PIT');
    assert.deepEqual(summary.slice(0,3),[number(selectedTeam.pointsFor),number(selectedTeam.pointsAgainst),`${diff(selectedTeam)>0?'+':''}${number(diff(selectedTeam))}`]);
    check('PIT-source-summary-metrics',{week:selectedWeek,metrics:summary});
    await click(page,'#nfl-team-details-pit');await route(page,'team-details');
    await page.waitForSelector('.td-tabs');
    const teamURL=page.url();assert.ok(teamURL.includes('team/PIT'));
    await page.reload({waitUntil:'networkidle'});await ready(page);await route(page,'team-details');await page.waitForSelector('.td-tabs');
    check('team-direct-refresh',{url:teamURL});
    await click(page,'[data-page="team-details"] .td-back[data-td-action="ladder"]');await route(page,'nfl');
    await select(page,'#week-select',book.currentWeek);
    await click(page,'#featured-matchup [data-nfl-action="compare"]');await route(page,'matchup-breakdown');
    await page.waitForSelector('.mb-fixture');
    assert.equal(await page.locator('.mb-fixture').getAttribute('data-mb-fixture'),book.weeks[String(book.currentWeek)].fixture.id);
    assert.ok(page.url().includes('tab=form'));
    const matchupURL=page.url();await page.reload({waitUntil:'networkidle'});await ready(page);await route(page,'matchup-breakdown');await page.waitForSelector('.mb-fixture');
    assert.equal(await page.locator('.mb-fixture').getAttribute('data-mb-fixture'),book.weeks[String(book.currentWeek)].fixture.id);
    check('comparison-direct-refresh',{url:matchupURL});
    await click(page,'[data-page="matchup-breakdown"] [data-mb-action="ladder"]');await route(page,'nfl');
    await select(page,'#week-select',book.currentWeek);
    await click(page,'#featured-matchup [data-nfl-action="matchup"]');
    await report(page,book.weeks[String(book.currentWeek)].fixture.id,'PIT');
    const reportURL=page.url();await page.reload({waitUntil:'networkidle'});await ready(page);await report(page,book.weeks[String(book.currentWeek)].fixture.id,'PIT');
    check('report-direct-refresh',{url:reportURL});
    await click(page,'[data-page="game-report"] [data-gr-action="nfl"]');await route(page,'nfl');
    await select(page,'#week-select',6);await click(page,'#featured-matchup [data-nfl-action="matchup"]');await route(page,'matchup-breakdown');
    await page.waitForSelector('.mb-fixture');
    assert.equal(await page.locator('.mb-fixture').getAttribute('data-mb-fixture'),book.weeks['6'].fixture.id);
    check('scheduled-matchup-route',{url:page.url(),game:book.weeks['6'].fixture.id});
    await click(page,'[data-page="matchup-breakdown"] [data-mb-action="home"]');await route(page,'home');
    check('research-return-home',{url:page.url()});
    await context.close();
    result.sourceAfter=hashes();result.sourceStable=JSON.stringify(result.sourceBefore)===JSON.stringify(result.sourceAfter);
    result.status=!result.errors.length&&!result.httpErrors.length&&result.sourceStable?'passed':'failed';
    if(result.status==='failed')process.exitCode=1;
  } catch(error) {
    result.status='failed';result.error={message:error.message,stack:error.stack};process.exitCode=1;
  } finally {
    if(browser)await browser.close();result.browserClosed=true;result.completedAt=new Date().toISOString();
    fs.writeFileSync(OUT+'/results.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status,path:OUT+'/results.json',checks:result.checks.length,actions:result.actions.length,errors:result.errors,httpErrors:result.httpErrors,error:result.error,browserClosed:true}));
  }
})();
