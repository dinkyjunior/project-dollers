'use strict';
// Explicit diagnostic interventions only. These pictures cannot accept a release.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const q = require('/workspace/project-dollers/qa/matchup-breakdown/qa.cjs');
const root = q.ROOT;
const out = path.join(root, 'qa/matchup-breakdown/reviews/assets-motion-evidence/webkit-paint-cause-v1');
assert.ok(!fs.existsSync(out), 'Diagnostic evidence directory must be fresh');
fs.mkdirSync(out);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const runtime = q.runtimeManifest();
const report = {
  status: 'running-explicitly-intervened-native-paint-cause-diagnostic',
  startedAt: new Date().toISOString(),
  engine: 'webkit',
  runtimeFiles: runtime,
  runtimeManifestSha256: sha(Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(runtime).sort(([a],[b])=>a.localeCompare(b)))))),
  qualification: 'Diagnostic only: individually labelled transient style interventions, no shared runtime edits, no data substitution, no seeks or global clock pause, baseline restoration recorded. Never release acceptance.',
  captures: [], errors: []
};
const save = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const state = page => page.evaluate(() => {
  const p = document.querySelector('.page.active');
  const clocks = p.getAnimations({subtree:true}).filter(a=>a.animationName?.startsWith('mb-')).map(a=>({name:a.animationName,time:a.currentTime,state:a.playState,target:a.effect.target.className?.baseVal||a.effect.target.className}));
  const paths = [...p.querySelectorAll('.mb-perimeter-light path')].map(e=>({filter:getComputedStyle(e).filter,animation:getComputedStyle(e).animationName,playState:getComputedStyle(e).animationPlayState}));
  return {hash:location.hash,actualState:window.MatchupBreakdown.getState(),gameLogText:p.querySelector('.mb-player-detail')?.innerText,gameLogButtonCount:p.querySelectorAll('.mb-game-strip button').length,pageMotionState:p.dataset.mbMotionState,clocks,paths,reflectionVisibility:[...p.querySelectorAll('.mb-reflection')].map(e=>getComputedStyle(e).visibility),diagnosticStyle:document.querySelector('#assets-motion-paint-diagnostic')?.textContent||null};
});
(async()=>{let browser,context;try {
  save(); browser=await q.launch('webkit'); report.browserVersion=browser.version();
  context=await browser.newContext({viewport:{width:430,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'});
  const page=await context.newPage(); page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:8876/project-dollers/#matchup/DAL?window=3&season=current&mode=average',{waitUntil:'networkidle'}); await q.ready(page); await q.active(page);
  const capture = async(label,intervention)=>{
    const before=await state(page); assert.equal(before.actualState.window,3);assert.equal(before.gameLogButtonCount,3); assert.equal(before.pageMotionState,'running');
    const screenshot=await q.capture(page,out,label); const after=await state(page);
    report.captures.push({label,intervention,before,screenshot,after}); save(); console.log('CAPTURED '+label);
  };
  const setStyle = async text=>page.evaluate(text=>{
    document.querySelector('#assets-motion-paint-diagnostic')?.remove();
    if(text){const e=document.createElement('style');e.id='assets-motion-paint-diagnostic';e.textContent=text;document.head.append(e);}
  },text);
  for(let i=1;i<=2;i++) await capture('baseline-'+i,'none');
  await setStyle('.page[data-page="matchup-breakdown"] .mb-perimeter-light path{filter:none!important}');
  for(let i=1;i<=2;i++) await capture('diagnostic-path-filter-none-'+i,'only path filter:none');
  await setStyle(null);
  for(let i=1;i<=2;i++) await capture('restored-filter-baseline-'+i,'none; filter baseline restored');
  await setStyle('.page[data-page="matchup-breakdown"] .mb-reflection{visibility:hidden!important}');
  for(let i=1;i<=2;i++) await capture('diagnostic-reflections-hidden-'+i,'only reflection visibility:hidden');
  await setStyle(null);
  for(let i=1;i<=2;i++) await capture('restored-all-baseline-'+i,'none; all diagnostic styles removed');
  report.finalNormalState=await state(page); assert.equal(report.finalNormalState.diagnosticStyle,null);
  assert.deepEqual(report.errors,[]); report.unchangedDuringDiagnostic=JSON.stringify(runtime)===JSON.stringify(q.runtimeManifest()); assert.equal(report.unchangedDuringDiagnostic,true);
  report.status='completed-cause-diagnostic-not-release-acceptance';
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;}finally{if(context)await context.close();if(browser)await browser.close();report.completedAt=new Date().toISOString();save();console.log(report.status);}})();
