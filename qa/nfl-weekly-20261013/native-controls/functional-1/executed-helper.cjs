'use strict';
// Native end-user interactions only: no replacement responses, app state,
// DOM, clock or CSS. Fixture expectations come from retained source files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const ROOT = '/workspace/project-dollers';
const OUT = process.env.PD_WEEKLY_QA_OUT || path.dirname(__filename);
const BASE = process.env.PD_WEEKLY_QA_BASE || 'http://127.0.0.1:8809/project-dollers/';
const book = JSON.parse(fs.readFileSync(ROOT + '/assets/data/current.json'));
const teamBook = JSON.parse(fs.readFileSync(ROOT + '/assets/data/team-details.json'));
const reportIndex = JSON.parse(fs.readFileSync(ROOT + '/assets/data/game-reports.json'));
const identities = new Map(book.teams.map(team => [team.abbr || team.id.toUpperCase(), team]));
const keptBaseline = JSON.parse(fs.readFileSync(path.dirname(__filename) + '/baseline-preserved.json'));
const audit = {status:'running',startedAt:new Date().toISOString(),checks:[],actions:[],screenshots:[],frames:[],consoleErrors:[],pageErrors:[],httpErrors:[],requestErrors:[],
  qualification:'Native local Chromium in Australia/Sydney. Verifies controls and the retained exact source snapshot; does not independently establish official current data freshness or hosted delivery.'};
fs.mkdirSync(OUT,{recursive:true});
fs.copyFileSync(__filename,OUT+'/executed-helper.cjs');
const check = (name,evidence) => audit.checks.push({name,evidence});
const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const final = game => game.status === 'final' && known(game.away_score) && known(game.home_score);
const currentSources = ['index.html','assets/nfl-dashboard.js','assets/nfl-editorial.css','assets/nfl-weekly.css',...Object.keys(keptBaseline)].filter(name=>fs.existsSync(ROOT+'/'+name));
const hashes = () => Object.fromEntries(currentSources.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(ROOT+'/'+name)).digest('hex')]));
audit.before = hashes();
function weekGames(week) {
  const map = new Map();
  for (const team of Object.values(teamBook.teams)) for (const game of team.games || []) {
    if (Number(game.season)===Number(book.season) && Number(game.week)===Number(week) && (!game.seasonType || game.seasonType==='REG') && game.id) map.set(game.id,game);
  }
  return [...map.values()].sort((a,b)=>String(a.kickoffUtc || a.gameday).localeCompare(String(b.kickoffUtc || b.gameday)) || a.id.localeCompare(b.id));
}
async function route(page,name) {
  await page.waitForFunction(name=>document.querySelector('.page.active')?.dataset.page===name,name);
}
async function ready(page) {
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
  await page.evaluate(async()=>document.fonts.ready);
}
async function click(page,selector) {
  await page.locator(selector).click();
  audit.actions.push({type:'click',selector});
}
async function select(page,selector,value) {
  await page.locator(selector).selectOption(String(value));
  audit.actions.push({type:'select',selector,value:String(value)});
}
async function ladder(page) {
  await route(page,'nfl');
  await click(page,'#tab-ladder');
  await page.waitForFunction(()=>!document.querySelector('#panel-ladder').hidden);
  await page.waitForSelector('#nfl-weekly-game');
}
async function geometry(page,label) {
  const value = await page.evaluate(()=>{
    const r=document.querySelector('.app-shell').getBoundingClientRect();
    const page=document.querySelector('.page.active');
    const scroll=page.querySelector('.page-scroll');
    const controls=[...page.querySelectorAll('button,select')].filter(el=>el.getClientRects().length && !el.closest('[hidden]'));
    return {frame:{x:r.x,y:r.y,width:r.width,height:r.height},scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,
      documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      clippedControls:controls.filter(el=>{const rect=el.getBoundingClientRect();return rect.left<r.left-1 || rect.right>r.right+1}).map(el=>el.id || el.dataset.nflAction || el.textContent.trim())};
  });
  assert.ok(value.scrollWidth<=value.clientWidth+1,label+' page has no horizontal overflow');
  assert.ok(value.documentWidth<=value.viewport+1,label+' document has no horizontal overflow');
  assert.deepEqual(value.clippedControls,[],label+' controls remain within frame');
  audit.frames.push({label,...value});
  return value.frame;
}
async function screenshot(page,name,position='top') {
  await page.locator('[data-page="nfl"] .page-scroll').evaluate((el,pos)=>{el.scrollTop=pos==='bottom'?el.scrollHeight:pos==='middle'?el.scrollHeight/2:0},position);
  await page.screenshot({path:OUT+'/'+name+'.png'});
  audit.screenshots.push(name+'.png');
}
async function standings(page,label) {
  const state=await page.evaluate(()=>{const {state}=window.PDApp.getContext();return {week:state.week,conference:state.conference,expanded:state.standingsExpanded}});
  const rows=await page.locator('#standings-rows .stand-row').evaluateAll(rows=>rows.map(row=>({team:row.querySelector('[data-team]')?.dataset.team,cells:[...row.children].map(cell=>cell.textContent.trim()),className:row.className,expanded:row.querySelector('[data-team]')?.getAttribute('aria-expanded'),style:{background:getComputedStyle(row).backgroundColor,border:getComputedStyle(row).borderColor,shadow:getComputedStyle(row).boxShadow}})));
  const teams=book.weeks[state.week].conferences[state.conference];
  assert.equal(rows.length,state.expanded?teams.length:Math.min(5,teams.length));
  assert.equal(await page.locator('#standings-rows .nfl-team-summary').count(),0,'Zero inline team details');
  assert.equal(await page.locator('#standings-rows button').evaluateAll(buttons=>buttons.filter(button=>/^Team details\b/.test(button.textContent.trim())).length),0,'No repeated Team details controls');
  for(const row of rows) {
    assert.equal(row.cells.length,5,'Uniform standings cells');
    assert.ok(!row.className.includes('is-expanded'),'No expanded team row');
    assert.deepEqual(row.style,rows[0].style,'All teams use the same table treatment');
    const source=teams.find(team=>(team.abbr || team.id.toUpperCase())===row.team);
    assert.ok(source,'Displayed team belongs to selected conference');
    assert.equal(row.cells[1],source.name);
    assert.equal(row.cells[2],`${source.w}–${source.l}${Number(source.ties)>0?`–${source.ties}`:''}`);
    assert.equal(row.cells[3],source.pct || '—');
  }
  check(label,{state,rows});
  return rows;
}
async function report(page,id,team) {
  await route(page,'game-report');
  const query=new URLSearchParams(page.url().split('#')[1].split('?')[1]);
  assert.equal(query.get('game'),id,'Requested event ID in report route');
  assert.equal(query.get('team'),team,'Requested team context in report route');
  const indexed=reportIndex.games[id];
  if(indexed) {
    await page.waitForSelector('.gr-quarter-table tbody tr');
    const payload=JSON.parse(fs.readFileSync(ROOT+'/'+indexed.detailUrl));
    const rows=await page.locator('.gr-quarter-table tbody tr').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.textContent.trim())));
    const opponent=payload.home_team===team?payload.away_team:payload.home_team;
    assert.deepEqual(rows,[team,opponent].map(abbr=>[abbr,...payload.quarters[abbr].map(value=>known(value)?String(value):'—'),String(abbr===payload.home_team?payload.home_score:payload.away_score)]));
    check('exact-event-report-'+id,{team,rows,url:page.url()});
  } else {
    await page.waitForFunction(()=>/unavailable|no verified/i.test(document.querySelector('#game-report-content').textContent));
    assert.equal(await page.locator('.gr-quarter-table').count(),0,'Unavailable report has no invented scores');
    check('unavailable-event-report-'+id,{team,url:page.url()});
  }
}
async function returnFromReport(page) {
  await click(page,'[data-page="game-report"] [data-gr-action="nfl"]');
  await ladder(page);
}

async function uniformTeams(page) {
  await click(page,'[data-page="nfl"] [data-standings-toggle]');
  for(const conference of ['AFC','NFC']) {
    await click(page,'[data-page="nfl"] [data-conference="'+conference+'"]');
    const rows=await standings(page,'all-16-uniform-'+conference);
    for(const row of rows) {
      await click(page,'#nfl-team-'+row.team.toLowerCase());
      await route(page,'team-details');
      await page.waitForSelector('.td-hero h1');
      const text=(await page.locator('.td-hero h1').textContent()).replace(/\s+/g,' ').trim();
      const identity=identities.get(row.team);
      assert.ok(text.toUpperCase().includes(identity.name.toUpperCase()),'Correct full team details identity');
      assert.ok(page.url().includes('#team/'+row.team),'Correct team URL');
      check('uniform-team-click-'+row.team,{url:page.url(),heading:text});
      await click(page,'[data-page="team-details"] .td-back[data-td-action="ladder"]');
      await ladder(page);
      assert.equal(await page.locator('#standings-rows .nfl-team-summary').count(),0,'Return still has zero summaries');
    }
  }
  await click(page,'[data-page="nfl"] [data-conference="AFC"]');
  await click(page,'[data-page="nfl"] [data-standings-toggle]');
  await standings(page,'return-compact-uniform');
}
async function tabKeyboard(page) {
  await page.locator('#tab-ladder').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-players').getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-players');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-recap').getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-recap');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#tab-ladder').getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-ladder');
  check('research-tab-keyboard-and-focus',{sequence:['Ladder','ArrowRight → Top Players','ArrowRight → Weekly Recap','Home → Ladder']});
}
async function layout(page,width) {
  await page.goto(BASE+'#home',{waitUntil:'networkidle'});await ready(page);
  const home=await geometry(page,'home-'+width);
  await click(page,'button[data-home-sport="nfl"]');await click(page,'[data-home-entry]');
  await ladder(page);
  const nfl=await geometry(page,'nfl-'+width);
  assert.deepEqual(nfl,home,'NFL maintains identical compact Home frame');
  const expectedWidth=width>=700?400:Math.min(width,430);
  assert.equal(nfl.width,expectedWidth,'Approved width');
  if(width>=700)assert.equal(nfl.height,770,'Approved desktop height');
  const moved=await page.evaluate(()=>{
    const weekly=document.querySelector('#featured-matchup').closest('section');
    const standings=document.querySelector('.nfl-standings-panel');
    return {before:!!(weekly.compareDocumentPosition(standings)&Node.DOCUMENT_POSITION_FOLLOWING),heading:weekly.querySelector('h2')?.textContent || weekly.previousElementSibling?.textContent};
  });
  assert.ok(moved.before,'Weekly matchup is ahead of standings in DOM');
  assert.ok(/weekly matchup/i.test(moved.heading),'Weekly matchup replaces Featured matchup label');
  await screenshot(page,'nfl-'+width+'-top');
  await screenshot(page,'nfl-'+width+'-middle','middle');
  await screenshot(page,'nfl-'+width+'-bottom','bottom');
  check('compact-native-layout-'+width,{home,nfl,moved});
}

async function selectedWeeklyGame(page,week) {
  const id=await page.locator('#nfl-weekly-game').inputValue();
  const game=weekGames(week).find(game=>game.id===id);
  assert.ok(game,'Selected matchup exists in selected week source');
  const text=await page.locator('#featured-matchup').textContent();
  for(const abbr of [game.away_team,game.home_team]) {
    assert.ok(text.includes(identities.get(abbr).name),'Correct selected team nickname');
    const city=identities.get(abbr).fullName.replace(identities.get(abbr).name,'').trim();
    assert.ok(text.includes(city),'Correct selected team location');
  }
  const date=new Intl.DateTimeFormat('en-AU',{weekday:'short',month:'short',day:'numeric',timeZone:game.kickoffUtc?'Australia/Sydney':'UTC'}).format(new Date(game.kickoffUtc || game.gameday+'T12:00:00Z'));
  assert.ok(text.includes(date),'Correct selected game date');
  assert.ok(text.includes(game.venue || 'Venue unavailable'),'Correct selected game venue');
  const images=await page.locator('#featured-matchup img').evaluateAll(images=>images.map(image=>({src:image.getAttribute('src'),alt:image.alt,decoded:image.complete&&image.naturalWidth>0})));
  assert.ok(images.every(image=>image.decoded),'Weekly game artwork decoded');
  if(final(game)) {
    assert.ok(/open game report/i.test(text),'Final links its game report');
    assert.ok(text.includes(String(game.away_score)) && text.includes(String(game.home_score)),'Both correct source final scores');
  } else {
    assert.ok(/open matchup/i.test(text),'Scheduled fixture links matchup');
    assert.ok(!/FINAL\s*·/i.test(text),'Unplayed fixture is not final');
  }
  return {id,game,text:text.trim(),images};
}
async function weeklyGames(page,week,openReports=false) {
  await select(page,'#week-select',week);await ladder(page);
  await page.waitForSelector('#nfl-weekly-game');
  const expected=weekGames(week);
  const options=await page.locator('#nfl-weekly-game option').evaluateAll(options=>options.map(option=>({id:option.value,label:option.label})));
  assert.equal(options.length,expected.length,'Every selected-week source fixture is available');
  assert.deepEqual([...options.map(option=>option.id)].sort(),expected.map(game=>game.id).sort(),'No other-week or fabricated fixture');
  const initial=await page.locator('#nfl-weekly-game').inputValue();
  const visited=[];
  for(let index=0;index<options.length;index++) {
    const selected=await selectedWeeklyGame(page,week);
    visited.push(selected.id);
    await click(page,'#nfl-weekly-next');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'nfl-weekly-next','Carousel next retains keyboard focus after rendering');
  }
  assert.equal(new Set(visited).size,expected.length,'Next traverses all games exactly once');
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),initial,'Carousel wraps back to initial fixture');
  await click(page,'#nfl-weekly-prev');
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),visited.at(-1),'Previous reverses the sequence');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'nfl-weekly-prev','Carousel previous retains focus');
  check('weekly-all-fixtures-'+week,{sourceCount:expected.length,options,visited});
  for(const source of expected) {
    await select(page,'#nfl-weekly-game',source.id);
    await selectedWeeklyGame(page,week);
    if(openReports && final(source)) {
      await click(page,'#featured-matchup [data-nfl-action="matchups"]');
      await report(page,source.id,source.away_team);
      await returnFromReport(page);
      assert.equal(await page.locator('#week-select').inputValue(),String(week),'Report return keeps week');
      assert.equal(await page.locator('#nfl-weekly-game').inputValue(),source.id,'Report return keeps selected game');
    }
  }
}
async function scheduledMatchup(page) {
  await select(page,'#week-select',6);await ladder(page);
  const source=weekGames(6)[0];
  await select(page,'#nfl-weekly-game',source.id);
  await click(page,'#featured-matchup [data-nfl-action="matchups"]');
  await route(page,'matchup-breakdown');
  await page.waitForSelector('.mb-fixture');
  assert.equal(await page.locator('.mb-fixture').getAttribute('data-mb-fixture'),source.id,'Exact selected upcoming event reaches research');
  const query=new URLSearchParams(page.url().split('#')[1].split('?')[1]);
  assert.equal(query.get('game'),source.id,'Exact event remains in matchup route');
  await click(page,'[data-page="matchup-breakdown"] [data-mb-action="back"]');
  await ladder(page);
  assert.equal(await page.locator('#week-select').inputValue(),'6','Matchup Back retains selected week');
  assert.equal(await page.locator('#nfl-weekly-game').inputValue(),source.id,'Matchup Back retains selected fixture');
  check('scheduled-matchup-exact-event-and-back',{id:source.id});
}

async function recapCards(page,week,filter='all') {
  const snapshot=book.weeks[String(week)];
  const recapWeek=Number(week);
  const expected=weekGames(week).filter(game=>filter==='all' || [game.away_team,game.home_team].includes(filter));
  const cards=await page.locator('.nfl-recap-card').evaluateAll(cards=>cards.map(card=>{
    const summary=card.querySelector('.nfl-recap-summary');
    return {id:summary?.dataset.game || card.dataset.game || card.querySelector('[data-nfl-action="report"]')?.dataset.game,
      teams:[...card.querySelectorAll('.nfl-recap-team')].map(team=>({city:team.querySelector('small')?.textContent.trim(),name:team.querySelector('strong')?.textContent.trim(),score:team.querySelector('.nfl-recap-score')?.textContent.trim(),logo:team.querySelector('img')?.getAttribute('src'),decoded:team.querySelector('img')?.complete && team.querySelector('img')?.naturalWidth>0})),
      expanded:summary?.getAttribute('aria-expanded'),controls:summary?.getAttribute('aria-controls')};
  }));
  assert.equal(cards.length,expected.length,'Recap cards match retained selected recap week/filter');
  assert.deepEqual(cards.map(card=>card.id).sort(),expected.map(game=>game.id).sort(),'Every recap belongs to the correct exact event');
  const playerAssets=JSON.parse(fs.readFileSync(ROOT+'/assets/player-assets.json'));
  for(const card of cards) {
    const source=expected.find(game=>game.id===card.id);
    assert.equal(card.teams.length,2,'Recap shows both genuine teams');
    [source.away_team,source.home_team].forEach((abbr,index)=>{
      const actual=card.teams[index],identity=identities.get(abbr);
      assert.equal(actual.name,identity.name,'Recap nickname correct');
      assert.equal(actual.city,identity.fullName.replace(identity.name,'').trim(),'Recap location correct');
      assert.equal(actual.score,known(index?source.home_score:source.away_score)?String(index?source.home_score:source.away_score):'—','Recap score correct');
      assert.equal(actual.logo,playerAssets.logos[abbr.toLowerCase()].path,'Canonical genuine team logo');
      assert.ok(actual.decoded,'Recap logo fully decoded');
    });
    assert.ok(card.controls,'Recap accordion associates its controlled region');
    assert.ok(['true','false'].includes(card.expanded),'Recap expansion announced');
  }
  if(expected.length)assert.ok((await page.locator('#recap-title').textContent()).includes(String(recapWeek)),'Recap labels actual completed source week');
  else assert.ok(/no verified|no completed|unavailable/i.test(await page.locator('#recap-content').textContent()),'Empty recap clearly qualified');
  check('recap-identities-'+week+'-'+filter,{dashboardWeek:week,recapWeek,filter,cards});
  return cards;
}
async function recap(page,week,width) {
  await select(page,'#week-select',week);await click(page,'#tab-recap');
  await page.waitForFunction(()=>!document.querySelector('#panel-recap').hidden);
  await recapCards(page,week);
  await geometry(page,'recap-'+width);
  await screenshot(page,'nfl-'+width+'-recap-collapsed');
  const summary=page.locator('.nfl-recap-summary').first();
  if(await summary.count()) {
    const controlled=await summary.getAttribute('aria-controls');
    await summary.click();audit.actions.push({type:'click',selector:'.nfl-recap-summary:first'});
    assert.equal(await summary.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#'+controlled).isVisible(),true);
    await page.waitForFunction(id=>!document.querySelector('#'+CSS.escape(id)).hasAttribute('aria-busy'),controlled);
    await geometry(page,'recap-expanded-'+width);
    await screenshot(page,'nfl-'+width+'-recap-expanded');
    await summary.focus();await page.keyboard.press('Enter');
    assert.equal(await summary.getAttribute('aria-expanded'),'false','Recap Enter toggles closed');
    assert.equal(await page.locator('#'+controlled).isVisible(),false,'Collapsed detail hidden');
    const filter=page.locator('.nfl-recap-toolbar select');
    if(await filter.count()) {
      const values=await filter.locator('option').evaluateAll(options=>options.map(option=>option.value));
      const team=values.find(value=>identities.has(value));
      assert.ok(team,'Recap has meaningful selectable team filter');
      await select(page,'.nfl-recap-toolbar select',team);
      await recapCards(page,week,team);
      await geometry(page,'recap-filter-'+width);
      await screenshot(page,'nfl-'+width+'-recap-filtered');
      await select(page,'.nfl-recap-toolbar select','all');
      await recapCards(page,week);
    }
  }
  await ladder(page);
}

async function recapReport(page) {
  await select(page,'#week-select',book.currentWeek);await click(page,'#tab-recap');
  const cards=await recapCards(page,book.currentWeek);
  const first=cards[0];
  await page.locator('.nfl-recap-summary').first().click();
  audit.actions.push({type:'click',selector:'.nfl-recap-summary:first'});
  const source=weekGames(book.currentWeek).find(game=>game.id===first.id);
  const reportButton=page.locator('.nfl-recap-card').first().locator('[data-nfl-action="report"]');
  await reportButton.click();audit.actions.push({type:'click',selector:'.nfl-recap-card:first [data-nfl-action="report"]'});
  await report(page,source.id,source.away_team);
  await click(page,'[data-page="game-report"] [data-gr-action="back"]');
  await route(page,'nfl');
  assert.equal(await page.locator('#panel-recap').isVisible(),true,'Report Back preserves recap panel');
  check('recap-report-and-back',{game:source.id});
  await ladder(page);
}
async function unavailableRecap(page) {
  await select(page,'#week-select',6);await click(page,'#tab-recap');
  await recapCards(page,6);
  assert.equal(await page.locator('.nfl-recap-card').count(),weekGames(6).length,'Future week shows every saved matchup');
  assert.ok(/No completed results/i.test(await page.locator('#recap-content').textContent()),'Source absence of completed results is clear');
  assert.ok((await page.locator('.nfl-recap-score').allTextContents()).every(score=>score==='—'),'No invented upcoming scores');
  await page.locator('.nfl-recap-summary').first().click();
  const source=weekGames(6)[0];
  await page.locator('.nfl-recap-card').first().locator('[data-nfl-action="recap-matchup"]').click();
  await route(page,'matchup-breakdown');await page.waitForSelector('.mb-fixture');
  assert.equal(await page.locator('.mb-fixture').getAttribute('data-mb-fixture'),source.id,'Recap upcoming routes exact event');
  await click(page,'[data-page="matchup-breakdown"] [data-mb-action="back"]');
  await route(page,'nfl');
  assert.equal(await page.locator('#panel-recap').isVisible(),true,'Upcoming recap Back returns its recap tab');
  await page.locator('[data-page="nfl"] .page-scroll').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:OUT+'/nfl-393-recap-unavailable-results.png'});
  audit.screenshots.push('nfl-393-recap-unavailable-results.png');
  check('upcoming-recap-no-invented-results-and-exact-route',{week:6,game:source.id});
  await ladder(page);
}
let browser;
(async()=>{
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    audit.browserVersion=browser.version();
    for(const width of [393,430,1440]) {
      const context=await browser.newContext({viewport:{width,height:width===393?852:width===430?896:900},deviceScaleFactor:width<700?2:1,isMobile:width<700,hasTouch:width<700,locale:'en-AU',timezoneId:'Australia/Sydney'});
      const page=await context.newPage();
      page.on('console',message=>{if(message.type()==='error')audit.consoleErrors.push({width,message:message.text()})});
      page.on('pageerror',error=>audit.pageErrors.push({width,message:error.message}));
      page.on('response',response=>{if(response.status()>=400)audit.httpErrors.push({width,status:response.status(),url:response.url()})});
      page.on('requestfailed',request=>{const error=request.failure()?.errorText;if(error!=='net::ERR_ABORTED')audit.requestErrors.push({width,url:request.url(),error})});
      await layout(page,width);
      await recap(page,book.currentWeek,width);
      await click(page,'[data-page="nfl"] [data-standings-toggle]');
      await standings(page,'native-all16-'+width);
      await geometry(page,'all16-'+width);
      await screenshot(page,'nfl-'+width+'-all16','middle');
      await click(page,'[data-page="nfl"] [data-standings-toggle]');
      console.log(JSON.stringify({stage:'native-layout',width,screenshots:audit.screenshots.filter(name=>name.includes('-'+width+'-'))}));
      if(width===393 && process.env.PD_WEEKLY_QA_MODE!=='visual') {
        await tabKeyboard(page);
        await uniformTeams(page);
        await weeklyGames(page,book.currentWeek,true);
        await weeklyGames(page,6);
        await weeklyGames(page,9);
        await scheduledMatchup(page);
        await recapReport(page);
        await unavailableRecap(page);
        await select(page,'#week-select',book.currentWeek);
        await page.emulateMedia({reducedMotion:'reduce'});
        await geometry(page,'reduced-motion-393');
        await screenshot(page,'nfl-393-reduced-motion');
        check('reduced-motion-native',{screenshot:'nfl-393-reduced-motion.png'});
      }
      await context.close();
    }
    audit.after=hashes();
    audit.styleStable=audit.before['assets/nfl-editorial.css']===audit.after['assets/nfl-editorial.css'];
    const stableKeys=currentSources.filter(name=>process.env.PD_WEEKLY_QA_ALLOW_CSS_CHANGE!=='1' || name!=='assets/nfl-editorial.css');
    assert.deepEqual(Object.fromEntries(stableKeys.map(name=>[name,audit.after[name]])),Object.fromEntries(stableKeys.map(name=>[name,audit.before[name]])),'Frozen implementation and sources unchanged during native audit');
    if(process.env.PD_WEEKLY_QA_ALLOW_CSS_CHANGE==='1')audit.qualification+=' CSS refinements were permitted concurrently; screenshots are provisional pending final visual freeze.';
    for(const [name,expected]of Object.entries(keptBaseline))assert.equal(audit.after[name],expected,name+' remains baseline byte-identical');
    assert.deepEqual(audit.consoleErrors,[],'No console errors');
    assert.deepEqual(audit.pageErrors,[],'No page errors');
    assert.deepEqual(audit.httpErrors,[],'No HTTP errors');
    assert.deepEqual(audit.requestErrors,[],'No failed requests apart from normal cancelled navigation');
    audit.status='passed';
  } catch(error) {
    audit.status='failed';audit.error={message:error.message,stack:error.stack};process.exitCode=1;
  } finally {
    if(browser)await browser.close();
    audit.completedAt=new Date().toISOString();audit.browserClosed=true;
    fs.writeFileSync(OUT+'/results.json',JSON.stringify(audit,null,2)+'\n');
    console.log(JSON.stringify({status:audit.status,path:OUT+'/results.json',checks:audit.checks.length,actions:audit.actions.length,error:audit.error,errors:[...audit.consoleErrors,...audit.pageErrors,...audit.httpErrors,...audit.requestErrors],browserClosed:true}));
  }
})();
