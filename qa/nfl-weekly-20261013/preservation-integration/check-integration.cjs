'use strict';
// Independent native-browser integration and presentation/source checks.
// No response substitution, app-state mutation, artificial clock or DOM edits.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const ROOT = '/workspace/project-dollers';
const OUT = __dirname;
const BASE = 'http://127.0.0.1:8809/project-dollers/';
const book = JSON.parse(fs.readFileSync(ROOT + '/assets/data/current.json'));
const rawTeams = JSON.parse(fs.readFileSync(ROOT + '/assets/data/team-details.json'));
const reportIndex = JSON.parse(fs.readFileSync(ROOT + '/assets/data/game-reports.json'));
const sourceNames = ['index.html','assets/nfl-dashboard.js','assets/nfl-editorial.css','assets/app.js','assets/source-integrity.js','assets/team-details.js','assets/matchup-breakdown.js','assets/game-report.js','assets/home-editorial.js','assets/home-editorial.css'];
const hashes = () => Object.fromEntries(sourceNames.map(name => [name,crypto.createHash('sha256').update(fs.readFileSync(ROOT+'/'+name)).digest('hex')]));
const audit = {status:'running',startedAt:new Date().toISOString(),sourceBefore:hashes(),checks:[],frames:[],diagnostics:[],
  qualification:'Native local Chromium under /project-dollers/ in Australia/Sydney. Source equality checks compare retained snapshot data only; independent official currency and hosted delivery remain outside this audit.'};
const check = (name,evidence) => audit.checks.push({name,evidence});
const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const final = game => game.status === 'final' && known(game.home_score) && known(game.away_score);
function games(week) {
  const unique = new Map();
  for(const team of Object.values(rawTeams.teams)) for(const game of team.games || []) {
    if(Number(game.season) === Number(book.season) && Number(game.week) === Number(week) && (!game.seasonType || ['REG','2'].includes(String(game.seasonType)))) unique.set(game.id,game);
  }
  return [...unique.values()].sort((a,b)=>String(a.kickoffUtc || a.gameday).localeCompare(String(b.kickoffUtc || b.gameday)) || String(a.id).localeCompare(String(b.id)));
}
async function ready(page,name='nfl') {
  await page.waitForFunction(name => document.documentElement.dataset.dataReady === 'true' && document.querySelector('.page.active')?.dataset.page === name,name);
  await page.evaluate(async()=>document.fonts.ready);
}
async function settled(page) {
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
}
async function shell(page) {
  return page.evaluate(()=>{
    const rect=document.querySelector('.app-shell').getBoundingClientRect(),active=document.querySelector('.page.active'),scroll=active.querySelector('.page-scroll');
    return {page:active.dataset.page,frame:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},overflow:scroll.scrollWidth-scroll.clientWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth};
  });
}
function watch(page) {
  page.on('pageerror',error=>audit.diagnostics.push({type:'pageerror',error:error.message}));
  page.on('console',message=>{if(message.type()==='error')audit.diagnostics.push({type:'console',error:message.text()});});
  page.on('response',response=>{if(response.status()>=400)audit.diagnostics.push({type:'response',status:response.status(),url:response.url()});});
  page.on('requestfailed',request=>audit.diagnostics.push({type:'requestfailed',url:request.url(),error:request.failure()?.errorText}));
}
async function homeAndFrame(page,viewport) {
  await page.goto(BASE+'#home',{waitUntil:'networkidle'});
  await ready(page,'home');
  let frame;
  for(const sport of ['nfl','nba','nrl','ufc']) {
    await page.locator(`button[data-home-sport="${sport}"]`).click();
    await page.waitForFunction(sport=>{const home=document.querySelector('[data-page="home"]');return home.dataset.homeSport===sport && home.dataset.homeArtState==='ready';},sport);
    const row=await shell(page);frame ||=row.frame;
    assert.deepEqual(row.frame,frame,`${sport} Home frame unchanged`);
    assert.ok(row.overflow<=1 && row.documentOverflow<=1,`${sport} has no horizontal overflow`);
    assert.equal(await page.locator('[data-home-entry]').isDisabled(),sport!=='nfl',`${sport} entry gating`);
    const images=await page.locator('[data-page="home"] img').evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).map(node=>({src:node.currentSrc,decoded:node.complete&&node.naturalWidth>0})));
    assert.ok(images.every(image=>image.decoded),`${sport} Home images decoded`);
    check(`${viewport.width}-${sport}-Home-preserved`,{frame:row.frame,images});
  }
  await page.locator('button[data-home-sport="nfl"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeSport==='nfl');
  await page.locator('[data-home-entry]').click();await ready(page);await settled(page);
  const row=await shell(page);assert.deepEqual(row.frame,frame,'NFL preserves Home enclosure');
  assert.ok(row.overflow<=1 && row.documentOverflow<=1,'NFL has no horizontal overflow');
  const expected=viewport.width===393?{x:0,y:47.90625,width:393,height:756.171875}:{x:0,y:46.65625,width:430,height:802.671875};
  assert.deepEqual(row.frame,expected,'Approved compact frame unchanged');
  audit.frames.push({viewport,...row});
}
async function exactReport(page,game,team) {
  await ready(page,'game-report');
  await page.waitForFunction(id=>window.PDGameReport?.getReport()?.id===id,game.id);
  const query=new URLSearchParams(new URL(page.url()).hash.slice(1).split('?')[1]);
  assert.equal(query.get('game'),game.id);assert.equal(query.get('team'),team);assert.equal(query.get('return'),'nfl');
  const indexed=reportIndex.games[game.id];assert.ok(indexed,'Exact final event has retained report');
  const bytes=fs.readFileSync(ROOT+'/'+indexed.detailUrl);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),indexed.sha256);
  const retained=JSON.parse(bytes),live=await page.evaluate(()=>{const report=window.PDGameReport.getReport();return {id:report.id,home_team:report.home_team,away_team:report.away_team,home_score:report.home_score,away_score:report.away_score,quarters:report.quarters};});
  assert.deepEqual(live,{id:retained.id,home_team:retained.home_team,away_team:retained.away_team,home_score:retained.home_score,away_score:retained.away_score,quarters:retained.quarters});
  check('Report is checksum-bound exact selected event',live);
  await page.locator('[data-page="game-report"] [data-gr-action="back"]').first().click();await ready(page);
  assert.equal(new URL(page.url()).hash,'#nfl','Back returns to ladder');
}

async function confirmMatchup(page,game,tab='form') {
  await ready(page,'matchup-breakdown');
  await page.waitForFunction(id=>document.querySelector('.mb-fixture')?.dataset.mbFixture===id,game.id);
  const state=await page.evaluate(()=>window.MatchupBreakdown.getState());
  assert.equal(state.team,game.away_team,'Selected away-team context retained');
  assert.equal(state.game,game.id,'Selected fixture context retained');
  assert.equal(state.tab,tab);assert.equal(state.returnRoute,'nfl');
  const header=await page.locator('.mb-fixture-copy').innerText();
  for(const abbr of [game.away_team,game.home_team]) {
    const club=rawTeams.teams[abbr];const city=club.fullName.replace(club.name,'').trim();
    assert.ok(header.toUpperCase().includes(city.toUpperCase()),`${city} appears in the exact fixture header`);
  }
  assert.match(await page.locator('.mb-back').innerText(),/Back to NFL/);
  const query=new URLSearchParams(new URL(page.url()).hash.slice(1).split('?')[1]);
  assert.equal(query.get('game'),game.id);assert.equal(query.get('return'),'nfl');
  check('Matchup research matches selected teams/event and return destination',{state,header,url:page.url()});
}
async function weeklyProjection(page) {
  await page.locator('#week-select').selectOption('5');
  await page.waitForSelector('#nfl-weekly-game');
  const expected=games(5);
  const options=await page.locator('#nfl-weekly-game option').evaluateAll(nodes=>nodes.map(node=>({id:node.value,label:node.textContent.trim()})));
  assert.deepEqual(options.map(option=>option.id),expected.map(game=>game.id),'All selected-week source games represented once, in kickoff order');
  const order=await page.locator('#panel-ladder').evaluate(panel=>{
    const matchup=panel.querySelector('.matchup-section'),standings=panel.querySelector('.nfl-standings-panel');
    return !!(matchup.compareDocumentPosition(standings)&Node.DOCUMENT_POSITION_FOLLOWING);
  });assert.equal(order,true,'Weekly matchup precedes standings');
  await page.locator('#tab-recap').click();
  await page.waitForFunction(count=>document.querySelectorAll('#recap-content .nfl-recap-card').length===count,expected.length);
  await page.waitForFunction(()=>[...document.querySelectorAll('#recap-content .nfl-recap-team img')].every(img=>img.complete&&img.naturalWidth>0));
  const cards=await page.locator('#recap-content .nfl-recap-card').evaluateAll(cards=>cards.map(card=>({
    id:card.dataset.game,meta:card.querySelector('.nfl-recap-meta').textContent.trim(),
    teams:[...card.querySelectorAll('.nfl-recap-team')].map(team=>({abbr:team.dataset.team,city:team.querySelector('small').textContent.trim(),name:team.querySelector('strong').textContent.trim(),score:team.querySelector('.nfl-recap-score').textContent.trim(),image:team.querySelector('img').getAttribute('src'),winner:team.classList.contains('is-winner')}))
  })));
  assert.deepEqual(cards.map(card=>card.id),expected.map(game=>game.id),'Recap is the exact same selected-week event set');
  const imageMap=await page.evaluate(()=>Object.fromEntries(window.PDApp.getContext().data.teams.map(team=>[team.abbr||team.id.toUpperCase(),window.PDApp.getContext().logo(team.abbr||team.id.toUpperCase())])));
  for(const card of cards) {
    const game=expected.find(game=>game.id===card.id);assert.equal(card.teams.length,2);
    assert.deepEqual(card.teams.map(team=>team.abbr),[game.away_team,game.home_team]);
    for(const team of card.teams) {
      const club=rawTeams.teams[team.abbr];assert.equal(team.name,club.name);assert.equal(team.city,club.fullName.replace(club.name,'').trim());assert.equal(team.image,imageMap[team.abbr]);
      const score=team.abbr===game.home_team?game.home_score:game.away_score,other=team.abbr===game.home_team?game.away_score:game.home_score;
      assert.equal(team.score,final(game)?String(score):'—','Scores are event-specific; unplayed scores stay unavailable');
      assert.equal(team.winner,final(game)&&Number(score)>Number(other));
    }
    assert.ok(final(game)?/^Final/.test(card.meta):/^(Upcoming|Awaiting result)/.test(card.meta),'Status corresponds to source completion');
  }
  check('Independent selected-week card projection uses all identities, genuine logos and source scores',{options,cards});
  await page.locator('#nfl-recap-team').selectOption('PHI');
  assert.equal(await page.locator('.nfl-recap-card').count(),1);
  assert.equal(await page.locator('.nfl-recap-card').getAttribute('data-game'),'2026_05_PHI_JAX');
  await page.locator('#nfl-recap-team').selectOption('all');await page.locator('#tab-ladder').click();
}
async function roundTrips(page) {
  await page.locator('#week-select').selectOption('5');await settled(page);
  const game=games(5).find(game=>game.id==='2026_05_TB_DAL');assert.ok(game);
  await page.locator('#nfl-weekly-game').selectOption(game.id);await settled(page);
  await page.locator('#featured-matchup [data-nfl-action="matchups"]').click();
  await exactReport(page,game,game.away_team);
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),game.id);
  await page.locator('#featured-matchup [data-nfl-action="compare"]').click();
  await confirmMatchup(page,game,'form');
  // Changing an existing matchup tab invokes writeRoute; the safe NFL return
  // must persist rather than disappear and return to an unrelated team page.
  await page.locator('#matchup-tab-players').click();await settled(page);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1).split('?')[1]).get('return'),'nfl');
  await page.locator('.mb-back').click();await ready(page);
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),game.id);
  await page.locator('#featured-matchup [data-nfl-action="team-form"]').click();
  await ready(page,'team-details');
  await page.waitForFunction(abbr=>window.PDTeamDetails?.getState()?.team===abbr&&!!document.querySelector('.td-hero'),game.away_team);
  assert.match(new URL(page.url()).hash,/^#team\/TB/);
  assert.match(await page.locator('.td-hero').innerText(),/Tampa Bay/i);
  await page.locator('[data-page="team-details"] [data-td-action="ladder"]').first().click();await ready(page);
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),game.id);
  check('Team-form route uses selected fixture team and returns to selected game',{game:game.id,team:game.away_team});

  const upcoming=games(6).find(game=>game.id==='2026_06_NYJ_NE');assert.ok(upcoming);
  await page.locator('#week-select').selectOption('6');await page.locator('#nfl-weekly-game').selectOption(upcoming.id);
  await page.locator('#featured-matchup [data-nfl-action="matchups"]').click();await confirmMatchup(page,upcoming,'players');
  const routeBefore=page.url();await page.reload({waitUntil:'networkidle'});await confirmMatchup(page,upcoming,'players');
  await page.locator('.mb-back').click();await ready(page);assert.equal(new URL(page.url()).hash,'#nfl');
  check('Direct refresh preserves exact upcoming event and Back to NFL',{routeBefore,routeAfter:page.url()});

  // Exercise the unchanged three-argument caller through the actual Team
  // Details UI; no direct controller calls or app-state injection.
  await page.locator('[data-conference="AFC"]').click();
  if(await page.locator('[data-standings-toggle]').getAttribute('aria-expanded')!=='true')await page.locator('[data-standings-toggle]').click();
  await page.locator('#standings-rows .team-link[data-team="NE"]').click();await ready(page,'team-details');
  await page.waitForSelector('[data-page="team-details"] [data-td-action="matchup"]');
  await page.locator('[data-page="team-details"] [data-td-action="matchup"]').first().click();await ready(page,'matchup-breakdown');
  await page.waitForSelector('.mb-fixture');
  const legacy=await page.evaluate(()=>window.MatchupBreakdown.getState());
  assert.equal(legacy.team,'NE');assert.match(legacy.returnRoute,/^team\/NE/);
  assert.ok(!(await page.locator('.mb-back').innerText()).includes('Back to NFL'));
  await page.locator('.mb-back').click();await ready(page,'team-details');
  assert.match(new URL(page.url()).hash,/^#team\/NE/);
  check('Existing team-origin matchup Back remains team-specific',{legacy,url:page.url()});
  const selected=await page.evaluate(()=>({week:window.PDApp.getContext().state.week,id:document.querySelector('#nfl-weekly-game').value}));
  const shortcutGame=games(selected.week).find(game=>game.id===selected.id);assert.ok(shortcutGame);
  await page.locator('[data-page="team-details"] [data-open="home"]').first().click();await ready(page,'home');
  await page.locator('[data-home-topics] [data-home-shortcut="matchups"]').click();
  if(final(shortcutGame))await exactReport(page,shortcutGame,shortcutGame.away_team);
  else {await confirmMatchup(page,shortcutGame,'players');await page.locator('.mb-back').click();await ready(page);}
  check('Home Matchups shortcut opens the selected weekly event',{week:selected.week,id:selected.id});
}

(async()=>{
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    audit.browserVersion=browser.version();
    for(const viewport of [{width:393,height:852},{width:430,height:896}]) {
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en-AU',timezoneId:'Australia/Sydney'});
      try {
        const page=await context.newPage();watch(page);await homeAndFrame(page,viewport);
        if(viewport.width===393) {await weeklyProjection(page);await roundTrips(page);}
      } finally {await context.close();}
    }
    assert.deepEqual(audit.diagnostics,[],'No page, console, request or HTTP failures');
    audit.status='PASS';
  } catch(error) {audit.status='FAIL';audit.error=error.stack;process.exitCode=1;}
  finally {
    if(browser)await browser.close();audit.browserClosed=true;audit.sourceAfter=hashes();
    audit.sourceStable=JSON.stringify(audit.sourceBefore)===JSON.stringify(audit.sourceAfter);
    if(!audit.sourceStable){audit.status='FAIL';process.exitCode=1;}
    audit.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(OUT,'integration-results.json'),JSON.stringify(audit,null,2)+'\n');
    process.stdout.write(JSON.stringify({status:audit.status,checks:audit.checks.length,frames:audit.frames,sourceStable:audit.sourceStable,diagnostics:audit.diagnostics,browserClosed:audit.browserClosed,error:audit.error},null,2)+'\n');
  }
})();
