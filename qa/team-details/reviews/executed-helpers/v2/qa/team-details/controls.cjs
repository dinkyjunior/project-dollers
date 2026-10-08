'use strict';

// Independent native interaction audit. Never substitutes site/source responses.
const assert = require('node:assert/strict');
const TEAM = '.page[data-page="team-details"]';
const DIALOG = '#team-details-dialog';
const CURRENT = '.page[data-page="nfl"]';
const unavailable = value => value === null || value === undefined || value === '';
const finite = value => !unavailable(value) && Number.isFinite(Number(value));
const ownOpponent = (game, abbr) => game.home_team === abbr ? game.away_team : game.home_team;
const venueOf = (game, abbr) => game.neutral === true ? 'neutral' : game.neutral === null || game.neutral === undefined ? 'unknown' : game.home_team === abbr ? 'home' : 'away';
const scores = (game, abbr) => game.home_team === abbr ? [game.home_score,game.away_score] : [game.away_score,game.home_score];
const resultOf = (game, abbr) => { const [own,other]=scores(game,abbr); return finite(own)&&finite(other)?Number(own)>Number(other)?'W':Number(own)<Number(other)?'L':'T':null; };

function eligibleGames(team, season, options={}) {
  const window = Number(options.window || 5);
  return (team.games || []).filter(game => {
    if (game.status !== 'final' || ![game.home_team,game.away_team].includes(team.abbr)) return false;
    if (game.season > season || (options.season === 'current' && Number(game.season) !== Number(season))) return false;
    if (game.seasonType && !['REG','regular','regular-season','2'].includes(String(game.seasonType))) return false;
    if (options.venue && options.venue !== 'all' && venueOf(game,team.abbr) !== options.venue) return false;
    return true;
  }).sort((a,b) => String(b.kickoffUtc || b.gameday || '').localeCompare(String(a.kickoffUtc || a.gameday || '')) || Number(b.season)-Number(a.season) || Number(b.week)-Number(a.week) || String(b.id).localeCompare(String(a.id))).slice(0,window);
}

function aggregate(values, mode='average') {
  const known=values.filter(finite).map(Number);
  return {value:values.length&&known.length===values.length?known.reduce((sum,value)=>sum+value,0)/(mode==='total'?1:known.length):null,known:known.length,eligible:values.length};
}

function derivedMetrics(team, games, mode='average') {
  const result={yards:{},snapshot:{}};
  for (const key of ['netPassing','rushing','totalOffense']) {
    result.yards[key]={};
    for (const side of ['gained','allowed']) result.yards[key][side]=aggregate(games.map(game=>game.stats?.[side==='gained'?team.abbr:ownOpponent(game,team.abbr)]?.[key]),mode);
  }
  result.snapshot.pointsFor=aggregate(games.map(game=>scores(game,team.abbr)[0]),mode);
  result.snapshot.pointsAgainst=aggregate(games.map(game=>scores(game,team.abbr)[1]),mode);
  result.snapshot.penaltyYards=aggregate(games.map(game=>game.stats?.[team.abbr]?.penaltyYards),mode);
  result.snapshot.turnoverMargin=aggregate(games.map(game=>{
    const own=game.stats?.[team.abbr]?.turnovers,other=game.stats?.[ownOpponent(game,team.abbr)]?.turnovers;
    return finite(own)&&finite(other)?Number(other)-Number(own):null;
  }),mode);
  for(const [key,made,attempts] of [['thirdDown','thirdDownMade','thirdDownAttempts'],['redZoneTD','redZoneTD','redZoneAttempts']]) {
    const pairs=games.map(game=>game.stats?.[team.abbr]).filter(stats=>finite(stats?.[made])&&finite(stats?.[attempts]));
    const numerator=pairs.reduce((sum,stats)=>sum+Number(stats[made]),0),denominator=pairs.reduce((sum,stats)=>sum+Number(stats[attempts]),0);
    result.snapshot[key]={value:denominator&&pairs.length===games.length?100*numerator/denominator:null,known:pairs.length,eligible:games.length};
  }
  return result;
}

function numericText(text) {
  const cleaned=String(text).trim().replace(/[−–]/g,'-').replace(/,/g,'');
  if (/^(?:—|–|-|N\/?A|Unavailable)$/i.test(cleaned)) return null;
  const match=cleaned.match(/[+-]?\d+(?:\.\d+)?/);
  return match?Number(match[0]):null;
}

function sameNumber(actual, expected, label, tolerance=.051) {
  if (expected === null) assert.equal(numericText(actual),null,`${label}: unavailable source value is not invented`);
  else assert.ok(numericText(actual)!==null&&Math.abs(numericText(actual)-expected)<=tolerance,`${label}: displayed ${JSON.stringify(actual)} must represent verified ${expected}`);
}

function modeFromOption(option, kind) {
  const text=(option.value+' '+option.label).toLowerCase();
  if(kind==='window') { const match=text.match(/\d+/); assert.ok(match,'Window option identifies a game count'); return Number(match[0]); }
  if(kind==='season') { if(/cross|prior|all/.test(text))return 'cross'; if(/current|2026/.test(text))return 'current'; }
  if(kind==='venue') { if(/all/.test(text))return 'all'; if(/neutral/.test(text))return 'neutral'; if(/home/.test(text))return 'home'; if(/away/.test(text))return 'away'; }
  assert.fail(`Unrecognised ${kind} filter option: ${JSON.stringify(option)}`);
}

async function active(page, id) {
  await page.waitForFunction(value=>document.querySelector('.page.active')?.dataset.page===value,id);
  assert.equal(await page.locator('.page:visible').count(),1,'Exactly one app screen is visible');
}

async function ready(page) {
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&document.documentElement.dataset.teamDataReady==='true'&&window.PDTeamDetails?.getDataset?.());
  await page.evaluate(async()=>document.fonts.ready);
}

async function controls(page, base, data, options={}) {
  const teamData=data.teamForm || data.teamDetails || data;
  const currentData=data.current || null;
  const team=teamData.teams.DAL;
  assert.equal(team.abbr,'DAL','Audit uses Dallas source identity');
  const evidence={startedAt:new Date().toISOString(),source:{season:teamData.season,retrievedAt:teamData.retrievedAt,abbr:team.abbr},nativeClicks:[],filterCases:[],gameReports:[],dialogs:[],inventory:[],coverage:{}};
  const observed=new Map(),exercised=new Set();
  const keyOf=attributes=>['data-td-action','data-team-tab','data-team-game','data-td-mode','data-td-position','data-td-venue','data-game','data-position','data-player','data-open','data-sources','data-home-select','id','aria-label'].filter(name=>attributes[name]).map(name=>name+'='+attributes[name]).join('|');
  async function collect(scope=TEAM) {
    const list=await page.locator(`${scope} button,${scope} select`).evaluateAll(elements=>elements.filter(element=>element.checkVisibility()).map(element=>({tag:element.tagName,text:element.innerText,disabled:element.disabled,attributes:Object.fromEntries([...element.attributes].map(attr=>[attr.name,attr.value])),options:element.tagName==='SELECT'?[...element.options].map(option=>({value:option.value,label:option.textContent})):undefined})));
    for(const item of list) { const key=keyOf(item.attributes); assert.ok(key,`Every control has a stable audit identity: ${item.text}`); observed.set(key,item); }
    return list;
  }
  async function click(locator, label) {
    assert.equal(await locator.count(),1,`Unique control: ${label}`);
    await locator.scrollIntoViewIfNeeded();
    const attributes=await locator.evaluate(element=>Object.fromEntries([...element.attributes].map(attr=>[attr.name,attr.value]))),key=keyOf(attributes);
    assert.equal(await locator.isEnabled(),true,`Enabled control: ${label}`);
    if(options.mobile)await locator.tap();else await locator.click();
    exercised.add(key);evidence.nativeClicks.push({label,key,url:page.url(),input:options.mobile?'native-touch':'pointer'});
  }
  async function select(locator, option, label) {
    const attributes=await locator.evaluate(element=>Object.fromEntries([...element.attributes].map(attr=>[attr.name,attr.value])));
    await locator.selectOption(option.value);exercised.add(keyOf(attributes));
    evidence.nativeClicks.push({label,key:keyOf(attributes),option:option.value,url:page.url()});
  }
  async function enter() {
    await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page,'team-details');
    assert.match(page.url(),/#team\/DAL(?:[/?]|$)/,'Team route is shareable');
    assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),teamData,'UI uses the exact frozen team feed');
    await collect();
  }
  async function noOverflow(scope=TEAM) {
    const dimensions=await page.locator(scope).evaluate(element=>{
      const scroller=element.querySelector('.page-scroll')||element;
      return {viewport:innerWidth,document:document.documentElement.scrollWidth,scroll:scroller.scrollWidth,client:scroller.clientWidth};
    });
    assert.ok(dimensions.document<=dimensions.viewport+1,'Interactive state has no document horizontal scrolling');
    assert.ok(dimensions.scroll<=dimensions.client+1,'Interactive tab/dialog has no horizontal overflow');return dimensions;
  }
  async function tab(name) {
    await click(page.locator(`${TEAM} [data-team-tab="${name}"]`),`${name} tab`);
    const button=page.locator(`${TEAM} [data-team-tab="${name}"]`);
    assert.equal(await button.getAttribute('aria-selected'),'true','Selected tab is announced');
    assert.equal(await button.getAttribute('tabindex'),'0','Selected tab is in the keyboard tab order');
    const panel=await button.getAttribute('aria-controls');assert.ok(panel,'Tabs identify their panel');
    assert.equal(await page.locator('#'+panel).isVisible(),true,`${name} panel is visible`);
    assert.equal(await page.locator(`${TEAM} [data-team-tab][aria-selected="true"]`).count(),1,'Only one tab is selected');
    await collect();await noOverflow();return page.locator('#'+panel);
  }
  async function closeDialog(useEscape=false) {
    if(useEscape) await page.keyboard.press('Escape');
    else await click(page.locator(`${DIALOG} .dialog-close`),'Close detail dialog');
    await page.locator(DIALOG).waitFor({state:'hidden'});
  }
  async function openDialog(action,title,trigger) {
    const button=trigger || page.locator(`${TEAM} [data-td-action="${action}"]:visible`).first();
    await click(button,`${action} destination`);await page.locator(DIALOG).waitFor({state:'visible'});await collect(DIALOG);
    const heading=await page.locator('#team-details-dialog-title').innerText(),content=await page.locator('#team-details-dialog-content').innerText();
    assert.match(heading,title,`${action} opens its relevant destination`);
    assert.doesNotMatch(content,/preview only|later pass|connected in a later|full .* coming soon/i,'A source destination is not a generic deferred preview');
    assert.ok(content.trim().length>35,`${action} has meaningful destination content`);
    const focus=await page.locator(DIALOG).evaluate(element=>element.contains(document.activeElement));assert.equal(focus,true,'Dialog receives native focus');
    const result={action,heading,content,geometry:await noOverflow(DIALOG)};evidence.dialogs.push(result);return result;
  }
  async function filters() {
    const choices={};
    for(const kind of ['window','season','venue'])choices[kind]=await page.locator('#team-'+kind+'-select option').evaluateAll(items=>items.map(item=>({value:item.value,label:item.textContent})));
    return choices;
  }
  async function rowAudit(selection) {
    const expected=eligibleGames(team,teamData.season,selection);
    const actual=await page.locator(`${TEAM} [data-team-game]`).evaluateAll(rows=>rows.map(row=>({id:row.dataset.teamGame,text:row.closest('tr,.td-game-row,[role=row]')?.innerText || row.innerText,expanded:row.getAttribute('aria-expanded')})));
    assert.deepEqual(actual.map(row=>row.id),expected.map(game=>String(game.id)),'Form rows are independently selected source games in exact newest-first order');
    for(let i=0;i<actual.length;i++) {
      const game=expected[i],[own,other]=scores(game,team.abbr),normal=actual[i].text.replace(/[–−]/g,'-');
      assert.ok(normal.includes(String(game.season))&&normal.includes(String(game.week)),`Game row retains season/week: ${game.id}`);
      if(finite(own)&&finite(other))assert.match(normal,new RegExp(`${resultOf(game,team.abbr)}\\s*${own}\\s*-\\s*${other}`),'Game result uses verified scores');
    }
    const stateGames=await page.evaluate(()=>window.PDTeamDetails.getSelectedGames().map(game=>String(game.id)));
    assert.deepEqual(stateGames,expected.map(game=>String(game.id)),'Public selected-game state agrees with independently filtered source');
    return{selection,gameIds:actual.map(row=>row.id),rows:actual};
  }
  async function yardAudit(selection,mode) {
    const expected=derivedMetrics(team,eligibleGames(team,teamData.season,selection),mode),items=[];
    for(const metric of ['netPassing','rushing','totalOffense']) for(const side of ['gained','allowed']) {
      const locator=page.locator(`${TEAM} [data-td-stat="${metric}"][data-td-side="${side}"]`);
      assert.equal(await locator.count(),1,`Aggregate cell exists: ${metric}/${side}`);
      const text=await locator.innerText();sameNumber(text,expected.yards[metric][side].value,`${metric}/${side}/${mode}`,mode==='total'?.001:.051);
      items.push({metric,side,text,expected:expected.yards[metric][side]});
    }
    const snapshot=[];
    for(const metric of ['pointsFor','pointsAgainst','thirdDown','redZoneTD','turnoverMargin','penaltyYards']) {
      const locator=page.locator(`${TEAM} [data-td-snapshot="${metric}"]`);assert.equal(await locator.count(),1,`Snapshot metric exists: ${metric}`);
      const text=await locator.innerText();sameNumber(text,expected.snapshot[metric].value,`${metric}/${mode}`);
      const coverage=await locator.getAttribute('data-coverage');assert.equal(coverage,`${expected.snapshot[metric].known}/${expected.snapshot[metric].eligible}`,'Snapshot exposes actual field coverage');
      snapshot.push({metric,text,coverage,expected:expected.snapshot[metric]});
    }
    return{mode,items,snapshot};
  }
  async function reportAudit(source) {
    assert.equal(await page.locator(DIALOG).getAttribute('data-game'),String(source.id),'Dialog preserves the activated event ID');
    const rows=await page.locator(`${DIALOG} .td-report-table tbody tr`).evaluateAll(elements=>elements.map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent.trim())));
    const fields=['netPassing','rushing','totalOffense','thirdDownMade','thirdDownAttempts','redZoneTD','redZoneAttempts','turnovers','penaltyYards'];assert.equal(rows.length,fields.length,'Game report includes all nine promised team metrics');
    for(let index=0;index<fields.length;index++)for(let side=1;side<=2;side++)sameNumber(rows[index][side],source.stats?.[side===1?team.abbr:ownOpponent(source,team.abbr)]?.[fields[index]]??null,`Report ${source.id}/${fields[index]}/${side}`,0.001);
    return rows;
  }

  try {
  await enter();
  evidence.directLoad=true;
  await page.reload({waitUntil:'networkidle'});await ready(page);await active(page,'team-details');evidence.refresh=true;
  const hero=await page.locator(TEAM).innerText();assert.match(hero,/DALLAS/i);assert.match(hero,/COWBOYS/i);assert.match(hero,new RegExp(String(teamData.season)));assert.doesNotMatch(hero,/DESIGN PREVIEW|SAMPLE DATA|UNVERIFIED DATA/i,'Published UI does not present illustrative records as actual data');

  // Exhaust real dropdown combinations, including empty filtered datasets.
  const choices=await filters();
  assert.ok(choices.window.length>=1&&choices.season.length>=2&&choices.venue.length>=3,'Render filter controls have meaningful source-backed alternatives');
  for(const windowOption of choices.window)for(const seasonOption of choices.season)for(const venueOption of choices.venue) {
    await select(page.locator('#team-window-select'),windowOption,'Game window');
    await select(page.locator('#team-season-select'),seasonOption,'Season context');
    await select(page.locator('#team-venue-select'),venueOption,'Venue context');
    const selection={window:modeFromOption(windowOption,'window'),season:modeFromOption(seasonOption,'season'),venue:modeFromOption(venueOption,'venue')};
    const record=await rowAudit(selection);
    const measured=await require('./qa.cjs').geometry(page);
    record.geometry={documentWidth:measured.documentWidth,selects:measured.selects,clipped:measured.clipped};
    for(const mode of ['average','total']) {await click(page.locator(`${TEAM} [data-td-mode="${mode}"]`),`${mode} aggregate mode`);assert.equal(await page.locator(`${TEAM} [data-td-mode="${mode}"]`).getAttribute('aria-pressed'),'true');record[mode]=await yardAudit(selection,mode);}
    evidence.filterCases.push(record);
  }
  const defaultSelection={window:5,season:'cross',venue:'all'};
  for(const kind of ['window','season','venue']) {
    const option=choices[kind].find(option=>modeFromOption(option,kind)===defaultSelection[kind]);assert.ok(option,`Default ${kind} is available`);
    await select(page.locator('#team-'+kind+'-select'),option,`Restore ${kind}`);
  }
  await click(page.locator(`${TEAM} [data-td-mode="average"]`),'Restore per-game mode');

  // Cover every distinct game disclosure reachable through any supported window/venue.
  const visitedGames=new Set(),largestWindow=Math.max(...choices.window.map(option=>modeFromOption(option,'window')));
  for(const selection of [defaultSelection,...['all','home','away','neutral'].map(venue=>({window:largestWindow,season:'cross',venue}))]) {
    for(const kind of ['window','season','venue'])await select(page.locator('#team-'+kind+'-select'),choices[kind].find(option=>modeFromOption(option,kind)===selection[kind]),`Report window ${kind}`);
    await collect();const gameIds=await page.locator(`${TEAM} [data-team-game]`).evaluateAll(elements=>elements.map(element=>element.dataset.teamGame));
    for(const id of gameIds) {
    if(visitedGames.has(id))continue;visitedGames.add(id);
    let row=page.locator(`${TEAM} [data-team-game="${id}"]`);
    if(await row.getAttribute('aria-expanded')==='true')await click(row,`Collapse game ${id}`);
    await click(row,`Expand game ${id}`);assert.equal(await row.getAttribute('aria-expanded'),'true','Game disclosure announces its expanded state');await collect();
    const source=team.games.find(game=>String(game.id)===id);assert.ok(source,'Expanded event exists in team source');
    const trigger=page.locator(`${TEAM} [data-td-action="report"][data-game="${id}"]`);assert.equal(await trigger.count(),1,'Report control carries matching event identity');
    const report=await openDialog('report',/GAME|REPORT|WEEK/i,trigger);
    const [own,other]=scores(source,team.abbr),normal=report.content.replace(/[—–−]/g,'-');
    assert.match(normal,new RegExp(`${own}\\s*-\\s*${other}|${other}\\s*-\\s*${own}`),'Game report retains actual result');
    assert.match(report.content,new RegExp(String(source.season)),'Game report retains season');assert.match(report.content,/source|retrieved|checked/i,'Game report carries provenance');
    evidence.gameReports.push({id,...report,metrics:await reportAudit(source)});await closeDialog();
    row=page.locator(`${TEAM} [data-team-game="${id}"]`);await click(row,`Collapse report game ${id}`);assert.equal(await row.getAttribute('aria-expanded'),'false');
    }
  }
  for(const kind of ['window','season','venue'])await select(page.locator('#team-'+kind+'-select'),choices[kind].find(option=>modeFromOption(option,kind)===defaultSelection[kind]),`Restore report ${kind}`);

  // Relevant destinations, not generic click acknowledgements.
  for(const [action,title] of [['matchup',/COWBOYS|MATCHUP|UPCOMING/i],['sources',/SOURCE|PROVENANCE/i]]) {
    const triggers=page.locator(`${TEAM} [data-td-action="${action}"]:visible`),count=await triggers.count();
    assert.ok(count>0,`Required ${action} control exists`);
    for(let index=0;index<count;index++) {await openDialog(action,title,triggers.nth(index));await closeDialog(index===count-1);}
  }
  evidence.schedule=[];
  const scheduleGames=team.games.filter(game=>Number(game.season)===Number(teamData.season)).sort((a,b)=>String(a.kickoffUtc||a.gameday).localeCompare(String(b.kickoffUtc||b.gameday)));
  for(const source of scheduleGames) {
    await openDialog('schedule',/SCHEDULE/i);const list=await page.locator(`${DIALOG} [data-td-action][data-game]`).evaluateAll(elements=>elements.map(element=>element.dataset.game));
    assert.deepEqual(list,scheduleGames.map(game=>String(game.id)),'Full schedule shows all real season fixtures in chronological order');
    const action=source.status==='final'?'report':'matchup',button=page.locator(`${DIALOG} [data-td-action="${action}"][data-game="${source.id}"]`);
    await click(button,`Schedule ${action} ${source.id}`);assert.equal(await page.locator(DIALOG).getAttribute('data-game'),String(source.id),'Each schedule button opens its own event');await collect(DIALOG);
    const title=await page.locator('#team-details-dialog-title').innerText();assert.match(title,source.status==='final'?/REPORT/i:/COWBOYS/i);const content=await page.locator('#team-details-dialog-content').innerText();assert.match(content,new RegExp(String(source.season)));
    evidence.schedule.push({id:source.id,action,title,metrics:action==='report'?await reportAudit(source):undefined});await closeDialog();
  }
  evidence.venues=[];
  for(const venue of ['all','home','away','neutral']) {
    await openDialog('venues',/HOME|AWAY|NEUTRAL|VENUE/i);
    const table=await page.locator(`${DIALOG} table tbody tr`).evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent.trim())));
    const finals=team.games.filter(game=>game.status==='final'&&Number(game.season)===Number(teamData.season));
    for(const row of table) {const selected=finals.filter(game=>venueOf(game,team.abbr)===row[0].toLowerCase()),wins=selected.filter(game=>resultOf(game,team.abbr)==='W').length,losses=selected.filter(game=>resultOf(game,team.abbr)==='L').length,ties=selected.filter(game=>resultOf(game,team.abbr)==='T').length;assert.equal(Number(row[1]),selected.length,'Venue games count matches classified source');assert.equal(row[2].replace(/[—–−]/g,'-'),`${wins}-${losses}${ties?'-'+ties:''}`,'Venue record matches actual finals');}
    await click(page.locator(`${DIALOG} [data-td-venue="${venue}"]`),`Show ${venue} form`);await page.locator(DIALOG).waitFor({state:'hidden'});assert.equal(await page.locator('#team-venue-select').inputValue(),venue,'Venue button updates the corresponding real form filter');
    evidence.venues.push(await rowAudit({...defaultSelection,venue}));
  }
  await select(page.locator('#team-venue-select'),choices.venue.find(option=>modeFromOption(option,'venue')==='all'),'Restore all venues');

  const insight=page.locator(`${TEAM} [data-td-action="insights"]`);await click(insight,'Bottom Insights');
  assert.equal(await page.locator('#team-form-snapshot').isVisible(),true,'Insights exposes the implemented form snapshot');
  const snapshotRect=await page.locator('#team-form-snapshot').boundingBox(),frameRect=await page.locator(`${TEAM} .page-scroll`).boundingBox();
  await page.waitForFunction(()=>{const snapshot=document.querySelector('#team-form-snapshot').getBoundingClientRect(),scroller=document.querySelector('.page.active .page-scroll').getBoundingClientRect();return snapshot.top<scroller.bottom&&snapshot.bottom>scroller.top;});evidence.insights={snapshotRect,frameRect};

  // Complete tab/disclosure button inventory including roster and lineup controls.
  evidence.tabs=[];
  for(const name of ['players','lineup','form']) {
    const panel=await tab(name);const text=await panel.innerText();assert.ok(text.trim().length>50,`${name} is an actual implemented panel`);
    assert.doesNotMatch(text,/preview only|full .* coming soon|later pass/i,'Tabs do not hide deferred placeholders');
    evidence.tabs.push({name,text});
    if(name==='players') {
      const positions=await panel.locator('[data-td-position]').evaluateAll(items=>items.map(item=>item.dataset.tdPosition));evidence.positions=[];
      for(const position of positions) {
        await click(panel.locator(`[data-td-position="${position}"]`),`Roster position ${position}`);assert.equal(await panel.locator(`[data-td-position="${position}"]`).getAttribute('aria-pressed'),'true');
        const expected=team.roster.filter(player=>position==='ALL'||player.position===position||position==='DEF'&&['DE','DT','DL','LB','CB','DB','S','SAF','ILB','OLB'].includes(player.position));
        const actual=await panel.locator('.td-player-name b').allTextContents();assert.equal(actual.length,expected.length,'Roster filter uses actual positions');for(let index=0;index<actual.length;index++)assert.ok(actual[index].includes(expected[index].name),'Roster identity is retained');evidence.positions.push({position,names:actual});await collect();
      }
      await click(panel.locator('[data-td-position="ALL"]'),'Restore all roster positions');
      const nativeDetails=panel.locator('details');const count=await nativeDetails.count();
      evidence.playerDisclosures=[];
      for(let index=0;index<count;index++) {
        const detail=nativeDetails.nth(index),summary=detail.locator(':scope > summary');await summary.scrollIntoViewIfNeeded();if(options.mobile)await summary.tap();else await summary.click();assert.equal(await detail.evaluate(element=>element.open),true,'Player disclosure opens');await noOverflow();
        const source=team.roster[index],content=await detail.innerText();assert.ok(content.includes(source.name),'Each player disclosure keeps its own identity');
        const historyRows=await detail.locator('.td-player-history tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent.trim())));assert.equal(historyRows.length,(source.last5||[]).length,'Every retained player last-five row is rendered');
        for(let gameIndex=0;gameIndex<historyRows.length;gameIndex++) {
          const game=source.last5[gameIndex];assert.ok(historyRows[gameIndex][0].includes(String(game.season))&&historyRows[gameIndex][0].includes(String(game.week))&&historyRows[gameIndex][0].includes(game.opponent),'Player history preserves season/week/opponent');
          for(const [column,key] of [[1,'passingYards'],[2,'rushingYards'],[3,'receivingYards']])sameNumber(historyRows[gameIndex][column],game.stats?.[key]??null,`${source.name}/${gameIndex}/${key}`,0.001);
          sameNumber(historyRows[gameIndex][4],game.stats?.totalTD??game.stats?.offensiveTD??null,`${source.name}/${gameIndex}/scored TD`,0.001);
        }
        evidence.playerDisclosures.push({index,name:source.name,historyRows});
        if(options.mobile)await summary.tap();else await summary.click();assert.equal(await detail.evaluate(element=>element.open),false,'Player disclosure closes');
      }
      await collect();
    } else if(name==='lineup') {
      for(const player of team.depth?.players||[])assert.ok(text.includes(player.name),'Verified depth rows are shown');for(const player of team.injuries?.players||[])assert.ok(text.includes(player.name),'Verified injury rows are shown');
      const schedule=panel.locator('[data-td-action="schedule"]');await openDialog('schedule',/SCHEDULE/i,schedule);await closeDialog();
    }
  }
  await page.locator(`${TEAM} [data-team-tab="form"]`).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator(`${TEAM} [data-team-tab="players"]`).getAttribute('aria-selected'),'true','ArrowRight selects next team tab');
  await page.keyboard.press('End');assert.equal(await page.locator(`${TEAM} [data-team-tab="lineup"]`).getAttribute('aria-selected'),'true','End selects final team tab');
  await page.keyboard.press('Home');assert.equal(await page.locator(`${TEAM} [data-team-tab="form"]`).getAttribute('aria-selected'),'true','Home selects first team tab');evidence.tabKeyboard=true;
  await click(page.locator(`${TEAM} [data-td-action="continue"]`),'Continue to Players & QB');assert.equal(await page.locator(`${TEAM} [data-team-tab="players"]`).getAttribute('aria-selected'),'true','Continue and Players & QB share a destination');await tab('form');

  // Every ladder return control must use the real ladder route.
  const ladderCount=await page.locator(`${TEAM} [data-td-action="ladder"]:visible`).count();assert.ok(ladderCount>0,'Ladder return controls exist');
  for(let index=0;index<ladderCount;index++) {await click(page.locator(`${TEAM} [data-td-action="ladder"]:visible`).nth(index),`Ladder return ${index}`);await active(page,'nfl');assert.match(page.url(),/#nfl$/,'Ladder return opens NFL');await enter();}

  // Enter via the real standings button and preserve the originating controls.
  await page.goto(base+'#nfl',{waitUntil:'networkidle'});await ready(page);await active(page,'nfl');
  await page.locator('[data-nfl-tab="ladder"]').click();await page.locator('[data-conference="NFC"]').click();
  await page.locator('#standings-sort').selectOption('PF');await page.locator('#form-select').selectOption('5');
  if(await page.locator('[data-standings-toggle]').getAttribute('aria-expanded')!=='true')await page.locator('[data-standings-toggle]').click();
  const dallas=page.locator('[data-nfl-action="team"][data-team="DAL"]');assert.equal(await dallas.count(),1,'Dallas appears in the complete verified NFC ladder');
  if(await dallas.getAttribute('aria-expanded')!=='true')await dallas.click();await page.locator('[data-nfl-action="team-details"][data-team="DAL"]').click();await active(page,'team-details');await ready(page);
  assert.match(page.url(),/#team\/DAL(?:[/?]|$)/,'Dallas Team details opens Dallas, not an inline preview');
  await click(page.locator(`${TEAM} [data-td-action="ladder"]:visible`).first(),'Back to originating NFC ladder');await active(page,'nfl');
  assert.equal(await page.locator('[data-conference="NFC"]').getAttribute('aria-pressed'),'true','Return preserves originating conference');assert.equal(await page.locator('#standings-sort').inputValue(),'PF','Return preserves sort');assert.equal(await page.locator('#form-select').inputValue(),'5','Return preserves form window');assert.equal(await page.locator('[data-nfl-action="team"][data-team="DAL"]').getAttribute('aria-expanded'),'true','Return preserves selected Dallas record');evidence.ladderRoundTrip=true;

  // Bottom Home and upgraded diamond CTA keep the four approved sport behaviours.
  await enter();await collect();
  const nflCrumb=page.locator(`${TEAM} [data-td-action="nfl"]`);await click(nflCrumb,'NFL breadcrumb');await active(page,'nfl');await enter();
  const responseWait=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/assets/data/team-details.json'));
  const beforeRefresh={state:await page.evaluate(()=>window.PDTeamDetails.getState()),dataset:await page.evaluate(()=>window.PDTeamDetails.getDataset())};
  // Keep real DOM references outside application state. A successful identical
  // refresh must preserve an in-flight interaction instead of replacing cards.
  const unchangedDOM=await page.evaluateHandle(()=>{
    const selectors=['.td-hero','#team-panel-form','#team-window-select','#team-season-select','#team-venue-select','[data-team-game]','[data-td-action="refresh"]'];
    const root=document.querySelector('.page[data-page="team-details"]'),nodes=selectors.map(selector=>({selector,node:root.querySelector(selector)})),events=[];
    const listener=event=>events.push({changed:event.detail?.changed,retrievedAt:event.detail?.retrievedAt});
    document.addEventListener('pd:team-data-ready',listener);return{nodes,events,listener};
  });
  try {
  await page.locator(`${TEAM} [data-td-action="refresh"]`).focus();await click(page.locator(`${TEAM} [data-td-action="refresh"]`),'Refresh team research');const response=await responseWait;assert.ok([200,304].includes(response.status()),'Manual source refresh performs actual successful HTTP validation');await page.waitForFunction(()=>document.querySelector('.page.active [data-td-action="refresh"]')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.locator(`${TEAM} [data-td-action="refresh"]`).evaluate(element=>element===document.activeElement),true,'Keyboard refresh retains focus on its restored control');
  assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),beforeRefresh.dataset,'Unchanged native refresh retains the exact source dataset');
  const identity=await unchangedDOM.evaluate(probe=>({nodes:probe.nodes.map(({selector,node})=>({selector,exists:!!node,connected:!!node?.isConnected,same:document.querySelector('.page[data-page="team-details"]').querySelector(selector)===node})),events:probe.events}));
  for(const node of identity.nodes){assert.equal(node.exists,true,'Unchanged refresh probe targets an existing real node: '+node.selector);assert.equal(node.connected,true,'Unchanged refresh keeps the existing DOM connected: '+node.selector);assert.equal(node.same,true,'Unchanged refresh preserves DOM node identity: '+node.selector);}
  assert.equal(identity.events.length,1,'One actual successful native refresh emits exactly one ready event');assert.equal(identity.events[0].changed,false,'Identical actual HTTP source response announces unchanged data');
  assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getSelectedGames().map(game=>game.id)),eligibleGames(team,teamData.season,{window:beforeRefresh.state.window,season:beforeRefresh.state.season,venue:beforeRefresh.state.venue}).map(game=>game.id),'Refresh retains selected game context');evidence.manualRefresh={status:response.status(),url:response.url(),domIdentity:identity,focusPreserved:true};
  } finally {await unchangedDOM.evaluate(probe=>document.removeEventListener('pd:team-data-ready',probe.listener));await unchangedDOM.dispose();}
  const home=page.locator(`${TEAM} .bottom-nav [data-open="home"]`);assert.equal(await home.count(),1,'Team navigation has a Home control');await click(home,'Bottom Home');await active(page,'home');
  evidence.homeSports=[];
  for(const sport of ['nba','nrl','ufc','nfl']) {
    await page.locator(`[data-home-select="${sport}"]`).click();
    assert.equal(await page.locator('.page[data-page="home"]').getAttribute('data-home-sport'),sport,'Sport themes remain interactive');
    assert.equal(await page.locator('[data-home-entry]').isDisabled(),sport!=='nfl','Only NFL enters the app');
    const text=await page.locator('[data-home-entry]').innerText();assert.doesNotMatch(text,/preview only/i);assert.match(text,sport==='nfl'?/ENTER NFL/:/COMING SOON/);
    if(sport==='ufc')assert.equal((await page.locator('[data-home-teams-label]').innerText()).trim(),'Fighters','UFC retains Fighters');
    evidence.homeSports.push({sport,text,entryDisabled:sport!=='nfl'});
  }
  await page.locator('[data-home-entry]').click();await active(page,'nfl');evidence.homeEntry=true;
  await enter();

  evidence.inventory=[...observed.values()];
  evidence.coverage={observed:[...observed.keys()],exercised:[...exercised],disabled:[...observed].filter(([,item])=>item.disabled).map(([key])=>key),untested:[...observed].filter(([key,item])=>!item.disabled&&!exercised.has(key)).map(([key,item])=>({key,text:item.text}))};
  assert.deepEqual(evidence.coverage.untested,[],'Every visible enabled team/dialog button and selector is actually exercised');
  evidence.completedAt=new Date().toISOString();evidence.status='passed';return evidence;
  } catch(error) { evidence.status='failed';evidence.completedAt=new Date().toISOString();error.auditEvidence=evidence;throw error; }
}

module.exports={TEAM,DIALOG,ready,active,eligibleGames,derivedMetrics,numericText,controls};
