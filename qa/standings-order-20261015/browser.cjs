'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {launch}=require('../home-gate.cjs');
const ROOT=path.resolve(__dirname,'../..');
const URL=process.env.PD_STANDINGS_QA_URL||'http://127.0.0.1:8133/project-dollers/';
const OUT=process.env.PD_STANDINGS_QA_OUT||__dirname;
const feed=require(ROOT+'/assets/data/standings.json');
const snapshot=require(ROOT+'/assets/data/current.json');
const source=require('./sources/independent-official-comparison.json');
const expected=source.ESPN;
const report={url:URL,at:new Date().toISOString(),phoneResults:[],errors:[]};
fs.mkdirSync(OUT,{recursive:true});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const record=t=>`${t.w}–${t.l}${t.ties?'–'+t.ties:''}`;
async function ready(page){await page.waitForFunction(()=>window.PD_DATA?.roster?.length&&window.PDNFLDashboard?.getStandingsDataset()?.ranking?.official,null,{timeout:25000});await page.evaluate(()=>document.fonts.ready);}
async function active(page,id){await page.waitForFunction(id=>document.querySelector('.page.active')?.dataset.page===id,id,{timeout:15000});}
async function rows(page){return page.locator('#standings-rows .stand-row').evaluateAll(all=>all.map(row=>({abbr:row.querySelector('[data-team]').dataset.team,rank:Number(row.querySelector('[role=cell]').innerText),record:row.querySelector('.nfl-record').innerText,pct:Number(row.querySelector('.nfl-pct').innerText)})));}
function officialRows(conference){return source.officialOrdersESPN[conference].map(abbr=>({abbr,rank:expected[abbr].rank,record:record(expected[abbr]),pct:expected[abbr].w+expected[abbr].l+expected[abbr].ties?(expected[abbr].w+expected[abbr].ties/2)/(expected[abbr].w+expected[abbr].l+expected[abbr].ties):0}));}
async function exactRows(page,conference){const actual=await rows(page), want=officialRows(conference);assert.equal(actual.length,want.length);actual.forEach((row,i)=>{assert.equal(row.abbr,want[i].abbr,`${conference} source order row${i+1}`);assert.equal(row.rank,want[i].rank);assert.equal(row.record,want[i].record);assert.ok(Math.abs(row.pct-want[i].pct)<.00051);});return actual;}
async function geometry(page){const result=await page.evaluate(()=>{const page=document.querySelector('.page.active'),scroll=page.querySelector('.page-scroll'),select=page.querySelector('#standings-sort');let sortLabel=null;if(select?.checkVisibility()){const style=getComputedStyle(select),canvas=document.createElement('canvas').getContext('2d');canvas.font=style.font;sortLabel={text:select.selectedOptions[0].text,width:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),textWidth:canvas.measureText(select.selectedOptions[0].text).width};}return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,scrollClient:scroll.clientWidth,scrollWidth:scroll.scrollWidth,sortLabel,clipped:[...page.querySelectorAll('.stand-row > span,.stand-head > span,.table-label,.through-week,#nfl-standings-source,#standings-sort')].filter(e=>e.checkVisibility()&&e.scrollWidth>e.clientWidth+1).map(e=>({text:e.innerText,width:e.clientWidth,scroll:e.scrollWidth}))};});assert.ok(result.documentWidth<=result.viewport[0]+1);assert.ok(result.scrollWidth<=result.scrollClient+1);assert.deepEqual(result.clipped,[]);if(result.sortLabel)assert.ok(result.sortLabel.textWidth<=result.sortLabel.width,`Native sort option label fits: ${JSON.stringify(result.sortLabel)}`);return result;}
async function capture(page,file){const bytes=await page.screenshot({path:path.join(OUT,file),animations:'disabled'});return {file,sha256:sha(bytes)};}
async function tableTop(page){await page.locator('.page.active .page-scroll').evaluate(scroll=>scroll.scrollTop+=document.querySelector('.nfl-editorial-section-bar').getBoundingClientRect().top-scroll.getBoundingClientRect().top-12);}
async function navigate(page,hash,id=hash){await page.evaluate(hash=>location.hash=hash,hash);await active(page,id);}
(async()=>{
 const browser=await launch('chromium');report.browser=browser.version();
 try{
  for(const viewport of [{width:393,height:852},{width:430,height:896}]){
   const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[],http=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)http.push({url:r.url(),status:r.status()});});page.on('request',r=>requests.push(r.url()));
   await page.goto(URL,{waitUntil:'networkidle'});await ready(page);await active(page,'home');
   const screenshots=[await capture(page,`home-${viewport.width}x${viewport.height}.png`)];await geometry(page);
   const approved=execFileSync('git',['show','43521f6:index.html'],{cwd:ROOT,encoding:'utf8'}),current=fs.readFileSync(ROOT+'/index.html','utf8');
   const home=text=>text.slice(text.indexOf('<section class="page active editorial-home"'),text.indexOf('<section class="page nfl-editorial-dashboard"'));
   assert.equal(home(current),home(approved),'Approved Home markup preserved');
   await page.locator('.page.active [data-open="nfl"]').last().click();await active(page,'nfl');
   assert.equal(await page.locator('#week-select').inputValue(),'6');assert.equal(await page.locator('#standings-sort').inputValue(),'SOURCE');
   await page.waitForFunction(()=>document.querySelector('#nfl-weekly-game')?.options.length===14,null,{timeout:20000});
   const fixtureFirst=await page.locator('#nfl-weekly-game').inputValue();await page.locator('#nfl-weekly-next').click();assert.notEqual(await page.locator('#nfl-weekly-game').inputValue(),fixtureFirst);await page.locator('#nfl-weekly-prev').click();assert.equal(await page.locator('#nfl-weekly-game').inputValue(),fixtureFirst);
   screenshots.push(await capture(page,`nfl-top-${viewport.width}x${viewport.height}.png`));
   await tableTop(page);screenshots.push(await capture(page,`afc-preview-${viewport.width}x${viewport.height}.png`));
   await page.locator('[data-standings-toggle]').click();const afc=await exactRows(page,'AFC');const afcGeometry=await geometry(page);await tableTop(page);screenshots.push(await capture(page,`afc-source-order-${viewport.width}x${viewport.height}.png`));
   assert.match(await page.locator('.through-week').innerText(),/15\/15 finals.*79\/79/);
   await page.locator('#standings-sort').selectOption('PF');const analysis=await rows(page);
   const wantPF=feed.weeks['6'].conferences.AFC.slice().sort((a,b)=>b.pointsFor-a.pointsFor||Number(b.pct)-Number(a.pct)||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)||a.abbr.localeCompare(b.abbr));
   assert.deepEqual(analysis.map(r=>r.abbr),wantPF.map(r=>r.abbr));analysis.forEach(row=>assert.equal(row.rank,expected[row.abbr].rank,'Explicit PF sort preserves source rank numbers'));
   assert.match(await page.locator('#table-caption').innerText(),/PF analysis/);await tableTop(page);screenshots.push(await capture(page,`afc-explicit-pf-${viewport.width}x${viewport.height}.png`));
   for(const sort of ['PA','DIFF']){await page.locator('#standings-sort').selectOption(sort);const sorted=await rows(page);const metric=t=>sort==='PA'?-t.pointsAgainst:t.pointsFor-t.pointsAgainst;const want=feed.weeks['6'].conferences.AFC.slice().sort((a,b)=>metric(b)-metric(a)||Number(b.pct)-Number(a.pct)||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)||a.abbr.localeCompare(b.abbr));assert.deepEqual(sorted.map(r=>r.abbr),want.map(r=>r.abbr));sorted.forEach(row=>assert.equal(row.rank,expected[row.abbr].rank));}
   await page.locator('#standings-sort').selectOption('SOURCE');await exactRows(page,'AFC');
   await page.locator('#division-select').selectOption('AFC North');assert.deepEqual((await rows(page)).map(r=>[r.abbr,r.rank]),[['BAL',2],['CLE',8],['PIT',9],['CIN',10]]);await page.locator('#division-select').selectOption('all');await exactRows(page,'AFC');
   const largeBefore=requests.filter(url=>/assets\/data\/(team-details|player-history|matchup-breakdown|game-reports)\.json/.test(url)).length;
   assert.equal(await page.evaluate(()=>window.PDNFLDashboard.refreshStandings()),true);await exactRows(page,'AFC');
   assert.equal(await page.locator('#nfl-weekly-game').inputValue(),fixtureFirst,'Standings refresh preserves weekly selection');
   assert.equal(requests.filter(url=>/assets\/data\/(team-details|player-history|matchup-breakdown|game-reports)\.json/.test(url)).length,largeBefore,'Standings-only refresh does not redownload research books');
   await page.locator('[data-conference="NFC"]').click();const nfc=await exactRows(page,'NFC');const nfcGeometry=await geometry(page);await tableTop(page);screenshots.push(await capture(page,`nfc-source-order-${viewport.width}x${viewport.height}.png`));
   const note=await page.locator('#nfl-standings-source').innerText();assert.match(note,/ESPN conference standings/);assert.match(note,/NFL\.com conference order differs/);assert.doesNotMatch(note,/points differential|not official playoff seeding/);
   const footer=await page.locator('#nfl-data-context').innerText();assert.match(footer,/fixtures Week 6/);assert.match(footer,/Conference order: ESPN/);assert.match(footer,/Statistics source retrieved Oct 12, 2026/);
   await page.locator('.nfl-info-button[data-sources]').click();await page.waitForFunction(()=>document.querySelector('#sources-dialog')?.open);
   const sourceInfo=await page.locator('[data-current-ladder-sources]').innerText();assert.match(sourceInfo,/32 teams agree/);assert.match(sourceInfo,/4 teams/);for(const name of ['Bears','Lions','Dolphins','Titans'])assert.ok(sourceInfo.includes(name));
   screenshots.push(await capture(page,`sources-comparison-${viewport.width}x${viewport.height}.png`));await page.locator('#sources-dialog .dialog-close').click();
   await page.locator('#week-select').selectOption('5');assert.equal(await page.locator('#follow-current-week').isVisible(),true);
   const historical=await rows(page);const saved=new Map(snapshot.weeks['5'].conferences.NFC.map(t=>[t.abbr,t]));assert.equal(historical.length,16);historical.forEach(row=>assert.equal(row.record,record(saved.get(row.abbr))));
   assert.match(await page.locator('#nfl-standings-source').innerText(),/official conference ranking was not verified/);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await page.locator('#week-select').inputValue(),'5');
   await page.locator('#follow-current-week').click();assert.equal(await page.locator('#week-select').inputValue(),'6');await exactRows(page,'NFC');
   await page.locator('#nfl-team-la').click();await active(page,'team-details');await page.waitForFunction(()=>document.querySelector('.page.active')?.textContent.includes('Rams'),null,{timeout:20000});await geometry(page);screenshots.push(await capture(page,`research-preserved-${viewport.width}x${viewport.height}.png`));
   await navigate(page,'home');assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
   report.phoneResults.push({viewport,afc,nfc,afcGeometry,nfcGeometry,note,footer,sourceInfo,screenshots,errors,http});await context.close();
  }
  // Exercise real browser failure/automatic retry while retaining canonical order.
  const context=await browser.newContext({viewport:{width:393,height:852},timezoneId:'Australia/Sydney'}),page=await context.newPage();await page.clock.install({time:new Date('2026-10-15T00:45:00Z')});
  await page.goto(URL+'#nfl',{waitUntil:'networkidle'});await ready(page);await page.locator('[data-standings-toggle]').click();await exactRows(page,'AFC');
  let attempt=0;await page.route('**/assets/data/standings.json',route=>{attempt++;return attempt===1?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"official-qa"'},body:JSON.stringify(feed)});});
  assert.equal(await page.evaluate(()=>window.PDNFLDashboard.refreshStandings()),false);await exactRows(page,'AFC');assert.match(await page.locator('#nfl-standings-source').innerText(),/retaining verified records and retrying automatically/);
  await page.clock.fastForward(15001);await page.waitForFunction(()=>!document.querySelector('#nfl-standings-source').textContent.includes('Latest standings check failed'),null,{timeout:10000});assert.ok(attempt>=2);await exactRows(page,'AFC');
  report.failureRetry={result:'pass',attempts:attempt,retainedOrder:true};await context.close();
  // A new retrieval date alone cannot discard better sourced standings/order.
  report.newResearchMetadataRegression=[];
  for(const mode of ['incomplete78','identical79']){
   const metadataContext=await browser.newContext({viewport:{width:393,height:852},timezoneId:'Australia/Sydney'}),metadataPage=await metadataContext.newPage();
   const newerMetadata=JSON.parse(JSON.stringify(snapshot));
   newerMetadata.retrievedAt=new Date(Date.parse(feed.source.retrievedAt)+60000).toISOString();
   newerMetadata.sources.find(s=>s.id==='nflverse_games').retrievedAt=newerMetadata.retrievedAt;
   if(mode==='identical79')newerMetadata.weeks['6'].conferences=JSON.parse(JSON.stringify(feed.weeks['6'].conferences));
   await metadataPage.route('**/assets/data/current.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(newerMetadata)}));
   await metadataPage.goto(URL+'#nfl',{waitUntil:'networkidle'});await ready(metadataPage);await metadataPage.locator('[data-standings-toggle]').click();await exactRows(metadataPage,'AFC');
   assert.match(await metadataPage.locator('#table-caption').innerText(),/ESPN/);
   report.newResearchMetadataRegression.push({mode,result:'pass',newerMainRetrieval:newerMetadata.retrievedAt,retainedOfficialOrder:true});await metadataContext.close();
  }
  report.result='pass';
 }catch(error){report.result='fail';report.errors.push(error.stack);throw error;}
 finally{report.testedRuntimeSha256=Object.fromEntries(['index.html','assets/app.js','assets/nfl-dashboard.js','assets/nfl-editorial.css','assets/data/standings.json'].map(file=>[file,sha(fs.readFileSync(ROOT+'/'+file))]));fs.writeFileSync(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify({result:report.result,browser:report.browser,viewports:report.phoneResults.map(r=>r.viewport),failureRetry:report.failureRetry}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
