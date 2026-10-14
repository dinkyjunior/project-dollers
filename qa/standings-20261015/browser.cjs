'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {launch} = require('../home-gate.cjs');
const ROOT = path.resolve(__dirname, '../..');
const URL = process.env.PD_STANDINGS_QA_URL || 'http://127.0.0.1:8133/project-dollers/';
const OUT = process.env.PD_STANDINGS_QA_OUT || __dirname;
const snapshot = require(ROOT + '/assets/data/current.json');
const feed = require(ROOT + '/assets/data/standings.json');
const report = {url:URL, engine:'Chromium', phoneResults:[], preserved:[], errors:[]};
fs.mkdirSync(OUT,{recursive:true});
async function ready(page) {
  await page.waitForFunction(()=>window.PD_DATA?.roster?.length && window.PDNFLDashboard?.getStandingsDataset(),null,{timeout:25000});
  await page.evaluate(()=>document.fonts.ready);
}
async function active(page, value) { await page.waitForFunction(id=>document.querySelector('.page.active')?.dataset.page===id,value,{timeout:15000}); }
async function route(page, hash) { await page.evaluate(value=>location.hash=value,hash); await active(page,hash.startsWith('team/')?'team-details':hash); }
async function geometry(page) {
  const data = await page.evaluate(()=>{
    const page=document.querySelector('.page.active'), scroll=page.querySelector('.page-scroll');
    const clipped=[...page.querySelectorAll('.stand-row > span,.stand-head > span,.table-label,.through-week,#nfl-standings-source')].filter(e=>e.checkVisibility()&&e.scrollWidth>e.clientWidth+1).map(e=>({text:e.innerText,width:e.clientWidth,scroll:e.scrollWidth}));
    return {width:innerWidth,document:document.documentElement.scrollWidth,scrollClient:scroll.clientWidth,scrollWidth:scroll.scrollWidth,clipped};
  });
  assert.ok(data.document<=data.width+1, 'No document horizontal scroll');
  assert.ok(data.scrollWidth<=data.scrollClient+1,'No framed page horizontal scroll');
  assert.deepEqual(data.clipped,[],'No clipped standings labels, cells or coverage');
  return data;
}
async function capture(page, file) {
  await page.screenshot({path:path.join(OUT,file),animations:'disabled'});
  return file;
}
async function tableTop(page) {
  await page.locator('.page.active .page-scroll').evaluate(scroll=>{
    const table=document.querySelector('.nfl-editorial-section-bar');
    scroll.scrollTop += table.getBoundingClientRect().top-scroll.getBoundingClientRect().top-12;
  });
}
async function readRows(page) {
  return page.locator('#standings-rows .stand-row').evaluateAll(rows=>rows.map(row=>({abbr:row.querySelector('[data-team]').dataset.team,record:row.querySelector('.nfl-record').innerText,pct:row.querySelector('.nfl-pct').innerText})));
}
function expectedRows(conference, week) {
  return week.conferences[conference].slice().sort((a,b)=>Number(b.pct)-Number(a.pct)||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)||a.abbr.localeCompare(b.abbr)).map(t=>({abbr:t.abbr,record:`${t.w}–${t.l}${t.ties?'–'+t.ties:''}`,pct:String(t.pct)}));
}
(async()=>{
  const browser=await launch('chromium'); report.browserVersion=browser.version();
  try {
    for(const viewport of [{width:393,height:852},{width:430,height:896}]) {
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
      const page=await context.newPage(), errors=[], failures=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400) failures.push({url:r.url(),status:r.status()});});
      await page.goto(URL,{waitUntil:'networkidle'}); await ready(page); await active(page,'home');
      const homeGeometry=await geometry(page), screenshots=[];
      screenshots.push(await capture(page,`home-${viewport.width}x${viewport.height}.png`));
      // Preserve the approved Home DOM and image choices against the release.
      const approvedIndex=execFileSync('git',['show','a5944b2:index.html'],{cwd:ROOT,encoding:'utf8'});
      const currentIndex=fs.readFileSync(ROOT+'/index.html','utf8');
      const homeSection=text=>text.slice(text.indexOf('<section class="page active editorial-home"'),text.indexOf('<section class="page nfl-editorial-dashboard"'));
      assert.equal(homeSection(currentIndex),homeSection(approvedIndex),'Approved Home markup unchanged');
      await page.locator('.page.active [data-open="nfl"]').last().click(); await active(page,'nfl');
      assert.equal(await page.locator('#week-select').inputValue(),'6');
      assert.equal(await page.locator('#follow-current-week').isVisible(),false);
      await page.waitForFunction(()=>document.querySelector('#nfl-weekly-game')?.options.length===14,null,{timeout:20000});
      screenshots.push(await capture(page,`nfl-top-${viewport.width}x${viewport.height}.png`));
      const coverage=await page.locator('.through-week').innerText();
      assert.match(coverage,/15\/15 finals/); assert.match(coverage,/79\/79/);
      const source=await page.locator('#nfl-standings-source').innerText();
      assert.match(source,/not official playoff seeding/); assert.match(source,/source retrieved/);
      const footer=await page.locator('#nfl-data-context').innerText();
      assert.match(footer,/fixtures Week 6/); assert.match(footer,/statistics W5/);
      assert.match(footer,/Records source retrieved Oct 15, 2026/);
      assert.match(footer,/Statistics source retrieved Oct 12, 2026/);
      await tableTop(page); screenshots.push(await capture(page,`afc-preview-${viewport.width}x${viewport.height}.png`));
      await page.locator('[data-standings-toggle]').click();
      assert.deepEqual(await readRows(page),expectedRows('AFC',feed.weeks['6']));
      assert.equal(await page.locator('#nfl-team-buf').locator('..').locator('..').locator('.nfl-record').innerText(),'4–1');
      const afcGeometry=await geometry(page); await tableTop(page);
      screenshots.push(await capture(page,`afc-all-${viewport.width}x${viewport.height}.png`));
      await page.locator('[data-conference="NFC"]').click();
      assert.deepEqual(await readRows(page),expectedRows('NFC',feed.weeks['6']));
      assert.equal(await page.locator('#nfl-team-la').locator('..').locator('..').locator('.nfl-record').innerText(),'2–3');
      const nfcGeometry=await geometry(page); await tableTop(page);
      screenshots.push(await capture(page,`nfc-all-${viewport.width}x${viewport.height}.png`));
      await page.locator('.page.active .page-scroll').evaluate(scroll=>scroll.scrollTop=scroll.scrollHeight);
      screenshots.push(await capture(page,`source-footer-${viewport.width}x${viewport.height}.png`));
      // Manual historical selection keeps saved entering-week records.
      await page.locator('#week-select').selectOption('5');
      assert.deepEqual(await readRows(page),expectedRows('NFC',snapshot.weeks['5']));
      assert.equal(await page.locator('#follow-current-week').isVisible(),true);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(await page.locator('#week-select').inputValue(),'5');
      const historyContext=await page.locator('#nfl-data-context').innerText();
      assert.match(historyContext,/Records source retrieved Oct 12, 2026/);
      await page.locator('#follow-current-week').click();
      assert.equal(await page.locator('#week-select').inputValue(),'6');
      assert.deepEqual(await readRows(page),expectedRows('NFC',feed.weeks['6']));
      // Existing links continue to open independently dated research.
      await page.locator('#nfl-team-la').click(); await active(page,'team-details');
      await page.waitForFunction(()=>document.querySelector('.page.active')?.textContent.includes('Rams'),null,{timeout:20000});
      const teamGeometry=await geometry(page);
      screenshots.push(await capture(page,`team-research-${viewport.width}x${viewport.height}.png`));
      await route(page,'nfl');
      await route(page,'steelers'); await page.waitForTimeout(150);
      const steelersGeometry=await geometry(page);
      screenshots.push(await capture(page,`steelers-research-${viewport.width}x${viewport.height}.png`));
      await route(page,'home');
      assert.deepEqual(errors,[],'No JavaScript/console errors'); assert.deepEqual(failures,[],'No HTTP failures');
      report.phoneResults.push({viewport,homeGeometry,afcGeometry,nfcGeometry,teamGeometry,steelersGeometry,coverage,source,footer,historyContext,screenshots,errors,failures});
      await context.close();
    }
    report.result='pass';
  } catch(error) { report.result='fail'; report.errors.push(error.stack); throw error; }
  finally { fs.writeFileSync(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n'); await browser.close(); }
  console.log(JSON.stringify({result:report.result,browser:report.browserVersion,viewports:report.phoneResults.map(r=>r.viewport)}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
