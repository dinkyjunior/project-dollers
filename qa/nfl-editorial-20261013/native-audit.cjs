'use strict';
// Native local Chromium QA. Uses real files, requests, browser input and stored
// snapshots. No route mocks, network substitutions, animation or DOM overrides.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8808/project-dollers/');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname));
const folder = path.resolve(process.argv[3] || path.join(__dirname, 'native-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(folder, {recursive:true});
const sourceNames = ['index.html','assets/app.js','assets/nfl-dashboard.js','assets/nfl-editorial.css','assets/home-editorial.css','assets/home-editorial.js'];
const manifest = () => Object.fromEntries(sourceNames.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const report = {qualification:'Actual local Chromium under the GitHub Pages subpath. Screenshots use native viewports. Numeric UI is checked against the retained source snapshot, not independently refreshed external NFL results. Hosted publication, Safari and external source currency are separate.',startedAt:new Date().toISOString(),sourceBefore:manifest(),results:[]};
function diagnostics(page) {
  const result = {pageErrors:[],consoleErrors:[],httpFailures:[],requestFailures:[]};
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => { if(message.type() === 'error') result.consoleErrors.push(message.text()); });
  page.on('response', response => { if(response.status() >= 400) result.httpFailures.push({url:response.url(),status:response.status()}); });
  page.on('requestfailed', request => result.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  return result;
}
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()&&img.complete&&img.naturalWidth>0).map(img=>img.decode())); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function ready(page, pageId='nfl') {
  await page.waitForFunction(id => document.documentElement.dataset.dataReady === 'true' && document.querySelector('.page.active')?.dataset.page === id, pageId, {timeout:30000});
  if(pageId === 'nfl') {
    await page.locator('#standings-rows .stand-row').first().waitFor({state:'attached'});
    await page.waitForFunction(() => [...document.querySelectorAll('[data-page="nfl"] img')].filter(node => node.checkVisibility()).every(node => node.complete && node.naturalWidth > 0));
  }
  await settled(page);
}
async function goNFL(page) {
  await page.goto(base.href + '#nfl', {waitUntil:'networkidle'});
  await ready(page);
  if(await page.locator('#tab-ladder').getAttribute('aria-selected')!=='true')await click(page,'#tab-ladder');
}
async function scrollTo(page, position) {
  await page.locator('[data-page="nfl"] .page-scroll').evaluate((node,position) => node.scrollTo({top:position === 'bottom' ? node.scrollHeight : position,behavior:'instant'}), position);
  await settled(page);
}
async function state(page) {
  return page.evaluate(() => {
    const {data,state} = window.PDApp.getContext();
    return {season:data.season,week:String(state.week),currentWeek:data.currentWeek,throughWeek:data.throughWeek,conference:state.conference,division:state.nflDivision,form:state.nflForm,sort:state.nflSort,expanded:state.standingsExpanded,position:state.nflLeaderPosition,snapshot:data.weeks[state.week],teams:data.teams,weeks:Object.keys(data.weeks)};
  });
}
async function geometry(page) {
  return page.locator('[data-page="nfl"]').evaluate(nfl => {
    const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const visible = node => {const r=node.getBoundingClientRect();return node.checkVisibility() && r.width>1 && r.height>1 && !node.classList.contains('sr-only');};
    const scroll = nfl.querySelector('.page-scroll');
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},documentWidth:document.documentElement.scrollWidth,shell:rect(document.querySelector('.app-shell')),scroll:{...rect(scroll),width:scroll.scrollWidth,clientWidth:scroll.clientWidth,height:scroll.scrollHeight,clientHeight:scroll.clientHeight,top:scroll.scrollTop},hero:rect(nfl.querySelector('.nfl-editorial-hero')),heroImage:[...nfl.querySelectorAll('.nfl-editorial-art img')].map(img=>({...rect(img),src:img.currentSrc,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:getComputedStyle(img).objectFit})),brand:rect(nfl.querySelector('.nfl-editorial-brand')),footer:rect(nfl.querySelector('footer')),controls:[...nfl.querySelectorAll('button,select')].filter(visible).map(node=>({name:node.getAttribute('aria-label')||node.textContent.trim(),tag:node.tagName,...rect(node)})),panels:[...nfl.querySelectorAll('.nfl-framed,.leader-panel')].filter(visible).map(node=>({class:node.className,...rect(node),boxShadow:getComputedStyle(node).boxShadow,borderImage:getComputedStyle(node).borderImageSource})),decodedImages:[...nfl.querySelectorAll('img')].filter(visible).map(img=>({src:img.currentSrc,decoded:img.complete&&img.naturalWidth>0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})),visibleLegacyChrome:[...nfl.querySelectorAll('.nfl-bevel-corner,.nfl-diamond-glint,.nfl-frame-shimmer,.nfl-frame-glints,.bottom-nav')].filter(visible).map(node=>node.className),invalidAriaReferences:[...nfl.querySelectorAll('[aria-controls],[aria-labelledby]')].flatMap(node=>['aria-controls','aria-labelledby'].flatMap(attribute=>(node.getAttribute(attribute)||'').split(/\s+/).filter(Boolean).filter(id=>!document.getElementById(id)).map(id=>({attribute,id})))),runningAnimations:nfl.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').map(animation=>animation.animationName)};
  });
}
function verifyGeometry(g) {
  assert.ok(g.documentWidth<=g.viewport.width+1,'Document has no horizontal overflow');
  assert.ok(g.scroll.width<=g.scroll.clientWidth+1,'NFL scroller has no horizontal overflow');
  assert.deepEqual(g.visibleLegacyChrome,[],'No old mechanical decoration or NFL bottom icon navigation remains visible');
  assert.deepEqual(g.invalidAriaReferences,[],'All generated accessible references resolve');
  assert.ok(g.decodedImages.every(img=>img.decoded),'Every visible NFL image decoded');
  for(const p of g.panels) { assert.equal(p.boxShadow,'none','Editorial panels have no neon shadows'); assert.equal(p.borderImage,'none','Editorial panels use continuous native borders'); }
  for(const c of g.controls) assert.ok(c.x>=g.shell.x-1 && c.x+c.width<=g.shell.x+g.shell.width+1,`Horizontally clipped ${c.name}`);
  assert.equal(g.heroImage.length,1,'One compact stadium photograph header');
  assert.equal(g.heroImage[0].objectFit,'cover','Header crop preserves photo aspect');
}
function frameEqual(home,nfl) { for(const key of ['x','y','width','height']) assert.ok(Math.abs(home[key]-nfl[key])<=.75,`Home/NFL frame ${key}: ${home[key]} vs ${nfl[key]}`); }
async function checkStandings(page) {
  const s = await state(page);
  const rows = await page.locator('#standings-rows .stand-row').evaluateAll(nodes=>nodes.map(node=>({team:node.querySelector('[data-team]').dataset.team,cells:[...node.querySelectorAll(':scope>[role="cell"]')].map(cell=>cell.textContent.trim()),recordLabel:node.querySelector('.nfl-record').getAttribute('aria-label'),chips:[...node.querySelectorAll('.form-chip')].map(chip=>chip.textContent)})));
  const conference = s.snapshot.conferences[s.conference];
  const allowed = conference.filter(team=>s.division==='all'||s.teams.find(t=>(t.abbr||t.id.toUpperCase())===(team.abbr||team.id.toUpperCase()))?.division===s.division);
  assert.equal(rows.length,s.expanded?allowed.length:Math.min(5,allowed.length),'Visible standings count follows actual conference/division and expansion');
  const metric = team => s.sort==='PF'?Number(team.pointsFor):s.sort==='PA'?-Number(team.pointsAgainst):s.sort==='DIFF'?Number(team.pointDifferential??Number(team.pointsFor)-Number(team.pointsAgainst)):Number(team.pct);
  const rankedMetrics=conference.map(metric).filter(Number.isFinite).sort((a,b)=>b-a);
  let previous=Infinity;
  for(const row of rows) {
    assert.equal(row.cells.length,5,'Each standings row has the five editorial columns');
    const team=conference.find(team=>(team.abbr||team.id.toUpperCase())===row.team);
    assert.ok(team,'Displayed team belongs to selected conference');
    assert.equal(row.cells[2],`${team.w}–${team.l}${team.ties==null?'–—':Number(team.ties)>0?'–'+team.ties:''}`,'Displayed W–L/ties match source');
    assert.equal(row.cells[3],String(team.pct??'—'),'Displayed percentage matches source');
    assert.match(row.recordLabel,new RegExp(`^${team.w} wins, ${team.l} losses,`),'Combined record retains accessible individual wins/losses');
    assert.ok(metric(team)<=previous+.0001,'Selected sort metric descends');previous=metric(team);
    assert.ok(row.chips.length<=s.form,'Form never extends beyond selected recent-game window');
  }
  if(s.division==='all'&&!s.expanded) assert.deepEqual(rows.map(row=>metric(conference.find(team=>(team.abbr||team.id.toUpperCase())===row.team))),rankedMetrics.slice(0,5),'Preview is genuine first five sorted records, with no forced featured team');
  const sortedHeaders=await page.locator('.stand-head [aria-sort]').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent.trim(),sort:node.getAttribute('aria-sort')})));
  assert.deepEqual(sortedHeaders,s.sort==='PCT'?[{text:'PCT',sort:'descending'}]:[],'aria-sort applies only to displayed sorted PCT column');
  return {week:s.week,conference:s.conference,division:s.division,form:s.form,sort:s.sort,expanded:s.expanded,rows};
}
async function checkLeaders(page,panel='ladder',expanded=false) {
  const s=await state(page),prefix=panel==='ladder'?'#ladder-leaders':'#players-leaders';
  assert.equal(await page.locator(prefix+' .nfl-editorial-leaders').count(),1,'Single switchable league leaders card');
  const records=s.snapshot.leaders?.[s.position]||[];
  const rows=await page.locator(prefix+' .leader-row').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll(':scope>[role="cell"]')].map(cell=>cell.textContent.trim())));
  const expected=expanded?records:records.slice(0,5);
  assert.equal(rows.length,expected.length,'Leaders count matches actual sourced position rows');
  for(let index=0;index<rows.length;index++) {
    const source=expected[index];
    assert.equal(rows[index].length,4,'Leader columns are rank, player, yards, touchdowns');
    assert.equal(rows[index][0],String(index+1));
    assert.equal(rows[index][1],String(source.short||source.name||'').replace(/^([A-Za-z]{1,3}\.)(?=\S)/,'$1 '));
    assert.equal(rows[index][2],source.yards==null?'—':Number(source.yards).toLocaleString('en-US'));
    assert.equal(rows[index][3],source.td==null?'—':Number(source.td).toLocaleString('en-US'));
  }
  assert.equal(await page.locator(prefix+' [role="tab"][aria-selected="true"]').count(),1);
  assert.equal(await page.locator(prefix+' [role="tab"][aria-selected="true"]').getAttribute('data-position'),s.position);
  return {panel,position:s.position,sourceWeek:s.snapshot.leadersWeek??s.snapshot.throughWeek,rows};
}
async function click(page,selector,touch=false) {const node=page.locator(selector);await node.scrollIntoViewIfNeeded();if(touch)await node.tap();else await node.click();await settled(page);}
async function comprehensive(page,result,touch) {
  const mark=(name,detail)=>result.controls.push({name,status:'PASS',detail});
  const original=await state(page);
  const season=await page.locator('#season-select').evaluate(node=>({disabled:node.disabled,value:node.value,options:[...node.options].map(o=>o.value)}));
  assert.deepEqual(season,{disabled:true,value:String(original.season),options:[String(original.season)]});mark('Only source-backed season is offered',season);
  for(const week of [original.weeks[0],original.week]) {await page.locator('#week-select').selectOption(week);await settled(page);assert.equal((await state(page)).week,week);mark('Week '+week,await checkStandings(page));}
  if(original.weeks.includes('6')) {
    await page.locator('#week-select').selectOption('6');await settled(page);const future=await state(page);assert.equal(future.snapshot.fixture?.status,'scheduled');await click(page,'#featured-matchup [data-nfl-action="matchup"]',touch);await ready(page,'matchup-breakdown');assert.ok(decodeURIComponent(new URL(page.url()).hash).includes(future.snapshot.fixture.id||future.snapshot.fixture.game_id));mark('Scheduled-week matchup uses real upcoming fixture',new URL(page.url()).hash);await goNFL(page);
  }
  if(original.weeks.includes('9')) {
    await page.locator('#week-select').selectOption('9');await settled(page);assert.ok(!(await state(page)).snapshot.fixture);await click(page,'#featured-matchup [data-nfl-action="schedule"]',touch);await page.locator('#nfl-inline-preview').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'#nfl');await click(page,'#nfl-close-preview',touch);await page.locator('#nfl-inline-preview').waitFor({state:'hidden'});mark('Bye-week genuine schedule preview and close');await page.locator('#week-select').selectOption(original.week);await settled(page);
  }
  for(const conf of ['NFC','AFC']) {await click(page,`[data-conference="${conf}"]`,touch);assert.equal(await page.locator(`[data-conference="${conf}"]`).getAttribute('aria-pressed'),'true');mark(conf+' conference',await checkStandings(page));}
  const division=await page.locator('#division-select option').nth(1).getAttribute('value');
  await page.locator('#division-select').selectOption(division);await settled(page);mark('Division filter',await checkStandings(page));
  await page.locator('#division-select').selectOption('all');
  for(const form of ['5','4']) {await page.locator('#form-select').selectOption(form);await settled(page);assert.equal((await state(page)).form,Number(form));mark('Last '+form+' form window',await checkStandings(page));}
  for(const sort of ['PF','PA','DIFF','PCT']) {await page.locator('#standings-sort').selectOption(sort);await settled(page);mark('Sort '+sort,await checkStandings(page));}
  await click(page,'[data-standings-toggle]',touch);assert.equal(await page.locator('[data-standings-toggle]').getAttribute('aria-expanded'),'true');mark('View all conference teams',await checkStandings(page));
  await click(page,'[data-standings-toggle]',touch);assert.equal(await page.locator('[data-standings-toggle]').getAttribute('aria-expanded'),'false');mark('Return to first five',await checkStandings(page));
  const team=await page.locator('#standings-rows [data-nfl-action="team"]').first().getAttribute('data-team');
  const teamSelector=`#nfl-team-${team.toLowerCase()}`;
  if(await page.locator(teamSelector).getAttribute('aria-expanded')==='true')await click(page,teamSelector,touch);
  await click(page,teamSelector,touch);
  assert.equal(await page.locator(teamSelector).getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.nfl-team-summary [role="cell"]').getAttribute('aria-colspan'),'5');
  mark('Selected team expands real summary',team);
  await click(page,`#nfl-team-details-${team.toLowerCase()}`,touch);await ready(page,'team-details');assert.match(new URL(page.url()).hash,new RegExp('^#team/'+team));mark('Team details route',page.url());
  await goNFL(page);
  for(const pos of ['RB','WR','QB']) {await click(page,`#nfl-ladder-position-${pos.toLowerCase()}`,touch);mark(pos+' leader selection',await checkLeaders(page));}
  await page.locator('#nfl-ladder-position-qb').focus();
  await page.keyboard.press('ArrowRight');await settled(page);assert.equal(await page.locator('#nfl-ladder-position-rb').evaluate(node=>node===document.activeElement),true);mark('Position ArrowRight keyboard',await checkLeaders(page));
  await page.keyboard.press('End');await settled(page);assert.equal((await state(page)).position,'WR');mark('Position End keyboard',await checkLeaders(page));
  await page.keyboard.press('Home');await settled(page);assert.equal((await state(page)).position,'QB');mark('Position Home keyboard',await checkLeaders(page));
  await click(page,'#ladder-leaders .nfl-view-all[data-nfl-action="all-players"]',touch);await page.locator('#panel-players').waitFor({state:'visible'});mark('View all source-backed players',await checkLeaders(page,'players',true));
  await click(page,'#players-leaders [data-nfl-action="leaders"]',touch);mark('Show featured players',await checkLeaders(page,'players',false));
  await page.locator('#tab-players').focus();await page.keyboard.press('ArrowRight');await settled(page);assert.equal(await page.locator('#tab-recap').getAttribute('aria-selected'),'true');await page.locator('#panel-recap').waitFor({state:'visible'});mark('Primary tabs keyboard and recap',{recapText:await page.locator('#recap-content').textContent()});
  await page.keyboard.press('Home');await settled(page);assert.equal(await page.locator('#tab-ladder').getAttribute('aria-selected'),'true');mark('Primary tabs return to Ladder');
  await click(page,'#tab-recap',touch);
  const reportLink=page.locator('#recap-content [data-nfl-action="report"]').first();
  if(await reportLink.count()) {
    const gameId=await reportLink.getAttribute('data-game');await reportLink.scrollIntoViewIfNeeded();if(touch)await reportLink.tap();else await reportLink.click();await ready(page,'game-report');assert.ok(decodeURIComponent(new URL(page.url()).hash).includes(gameId));mark('Recap completed-game report route',gameId);await goNFL(page);
  } else mark('Recap correctly offers no unavailable completed report');
  await click(page,'#tab-ladder',touch);
  for(const [selector,position] of [['#nfl-ladder-passing','QB'],['#nfl-ladder-receiving','WR']]) {
    await click(page,selector,touch);await page.locator('#panel-players').waitFor({state:'visible'});assert.equal((await state(page)).position,position);mark('Inline '+position+' leaders link',await checkLeaders(page,'players',true));await click(page,'#tab-ladder',touch);
  }
  for(const action of ['matchup','compare','team-form']) {
    const selected=await state(page),fixture=selected.snapshot.fixture;
    assert.ok(fixture,'Current source-backed Steelers fixture exists for route audit');
    await click(page,`#featured-matchup [data-nfl-action="${action}"]`,touch);
    const destination=action==='team-form'?'team-details':action==='matchup'&&fixture.status==='final'?'game-report':'matchup-breakdown';
    await ready(page,destination);
    const hash=new URL(page.url()).hash;
    assert.ok(hash.includes(action==='team-form'?'team/PIT':action==='matchup'&&fixture.status==='final'?'game-report':'matchup/PIT'));
    if(action!=='team-form')assert.ok(decodeURIComponent(hash).includes(fixture.id||fixture.game_id),'Route retains selected actual fixture ID');
    if(action==='compare')assert.ok(hash.includes('tab=form'),'Compare goes to Form & H2H, including completed fixtures');
    mark('Featured '+action+' destination',{hash,fixtureId:fixture.id||fixture.game_id,status:fixture.status});
    await goNFL(page);
  }
  await click(page,'.nfl-editorial-footer [data-sources]',touch);await page.locator('#sources-dialog').waitFor({state:'visible'});assert.ok((await page.locator('#sources-content').textContent()).includes('sorted by win percentage'));
  const links=await page.locator('#sources-content a').evaluateAll(nodes=>nodes.map(n=>n.href));assert.ok(links.length>0&&links.every(link=>/^https?:\/\//.test(link)));await page.keyboard.press('Escape');await page.locator('#sources-dialog').waitFor({state:'hidden'});mark('Sources dialogue open, source links and Escape',links);
  await click(page,'.nfl-editorial-footer [data-refresh]',touch);await page.waitForFunction(()=>window.PD_UPDATE_STATUS?.state!=='checking');await ready(page);mark('Refresh source snapshot without substituting data',{updateStatus:await page.evaluate(()=>window.PD_UPDATE_STATUS)});
  await click(page,'.nfl-editorial-footer [data-open="home"]',touch);await ready(page,'home');await page.locator('[data-home-entry]').click();await ready(page);mark('Footer Home route and NFL re-entry');
  await click(page,'.nfl-editorial-breadcrumb [data-open="home"]',touch);await ready(page,'home');await page.locator('[data-home-entry]').click();await ready(page);mark('Home breadcrumb and primary NFL re-entry');
  await page.reload({waitUntil:'networkidle'});await ready(page);mark('Direct NFL hash refresh');
}
(async()=> {
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const specification of [{width:393,height:852,dpr:2,touch:true},{width:430,height:896,dpr:2,touch:true},{width:1440,height:1000,dpr:1,touch:false}]) {
      const context=await browser.newContext({viewport:{width:specification.width,height:specification.height},deviceScaleFactor:specification.dpr,isMobile:specification.touch,hasTouch:specification.touch,locale:'en-AU',timezoneId:'Australia/Sydney'});
      try {
        const page=await context.newPage(),result={viewport:specification,controls:[],diagnostics:diagnostics(page)};report.results.push(result);
        const response=await page.goto(base.href+'#home',{waitUntil:'networkidle'});assert.equal(response.status(),200);await ready(page,'home');
        result.homeShell=await page.locator('.app-shell').evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
        await page.locator('[data-home-entry]').click();await ready(page);
        await scrollTo(page,0);result.initial=await geometry(page);verifyGeometry(result.initial);frameEqual(result.homeShell,result.initial.shell);
        result.standings=await checkStandings(page);result.leaders=await checkLeaders(page);
        await page.screenshot({path:path.join(folder,`nfl-${specification.width}-top.png`)});
        const centre=await page.locator('[data-page="nfl"] .page-scroll').evaluate(node=>Math.max(0,(node.scrollHeight-node.clientHeight)/2));await scrollTo(page,centre);await page.screenshot({path:path.join(folder,`nfl-${specification.width}-middle.png`)});
        await scrollTo(page,'bottom');result.bottom=await geometry(page);verifyGeometry(result.bottom);assert.ok(result.bottom.footer.y+result.bottom.footer.height<=result.bottom.scroll.y+result.bottom.scroll.clientHeight+1,'Source footer reachable');await page.screenshot({path:path.join(folder,`nfl-${specification.width}-bottom.png`)});
        if(specification.width===393)await comprehensive(page,result,specification.touch);
        else {
          for(const position of ['RB','WR','QB']) {await click(page,`#nfl-ladder-position-${position.toLowerCase()}`,specification.touch);result.controls.push({name:position+' leaders',status:'PASS',detail:await checkLeaders(page)});}
          await click(page,'#tab-recap',specification.touch);await page.locator('#panel-recap').waitFor({state:'visible'});await click(page,'#tab-ladder',specification.touch);
          await page.reload({waitUntil:'networkidle'});await ready(page);result.controls.push({name:'Direct refresh and tab switching',status:'PASS'});
        }
        result.final=await geometry(page);verifyGeometry(result.final);
        for(const [kind,entries] of Object.entries(result.diagnostics))assert.deepEqual(entries,[],kind+' must be empty');result.status='PASS';
      } finally {await context.close();}
    }
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'en-AU',timezoneId:'Australia/Sydney'});
    try {
      const page=await context.newPage(),d=diagnostics(page);await goNFL(page);const g=await geometry(page);verifyGeometry(g);assert.deepEqual(g.runningAnimations,[],'Reduced-motion editorial NFL has no decorative running animation');
      await click(page,'#nfl-ladder-position-wr',true);await checkLeaders(page);await click(page,'[data-conference="NFC"]',true);await checkStandings(page);
      for(const [kind,entries] of Object.entries(d))assert.deepEqual(entries,[],kind+' must be empty');report.reducedMotion={status:'PASS',geometry:g,diagnostics:d};
    } finally {await context.close();}
    report.status='PASS';
  } catch(error) {report.status='FAIL';report.error=error.stack;process.exitCode=1;}
  finally {
    if(browser)await browser.close();report.browserClosed=true;report.sourceAfter=manifest();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceStable){report.status='FAIL';report.sourceFreezeError='Application source changed during native QA';process.exitCode=1;}report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,folder,results:report.results.map(result=>({viewport:result.viewport,status:result.status,controls:result.controls.length,frame:result.initial?.shell})),error:report.error,sourceStable:report.sourceStable,browserClosed:report.browserClosed,reducedMotion:report.reducedMotion?.status},null,2)+'\n');
  }
})();
