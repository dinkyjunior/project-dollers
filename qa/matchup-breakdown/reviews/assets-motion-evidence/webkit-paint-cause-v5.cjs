'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('/workspace/project-dollers/qa/matchup-breakdown/qa.cjs');
const out=path.join(q.ROOT,'qa/matchup-breakdown/reviews/assets-motion-evidence/webkit-paint-cause-v5');assert.ok(!fs.existsSync(out));fs.mkdirSync(out);
const report={status:'running-actual-reduced-motion-cause-diagnostic',startedAt:new Date().toISOString(),runtimeFiles:q.runtimeManifest(),captures:[],qualification:'Actual native media preference and explicitly qualified perimeter-only diagnostic clip, never release acceptance. No clock seeks/pauses, source substitutions or production edits.'};
const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');
(async()=>{let browser,context;try{save();browser=await q.launch('webkit');context=await browser.newContext({viewport:{width:430,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'});const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:8876/project-dollers/#matchup/DAL?window=3&season=current&mode=average',{waitUntil:'networkidle'});await q.ready(page);await q.active(page);
const state=()=>page.evaluate(()=>{const p=document.querySelector('.page.active');return{reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,motionState:p.dataset.mbMotionState,actualState:window.MatchupBreakdown.getState(),gameLog:p.querySelector('.mb-player-detail').innerText,clocks:p.getAnimations({subtree:true}).map(a=>({name:a.animationName,time:a.currentTime,state:a.playState})),clips:[...p.querySelectorAll('.mb-perimeter-light,.mb-frame-glints')].map(e=>getComputedStyle(e).clipPath),diagnostic:document.querySelector('#assets-motion-paint-diagnostic')?.textContent||null};});
const capture=async label=>{const before=await state(),screenshot=await q.capture(page,out,label);report.captures.push({label,before,screenshot,after:await state()});save();console.log('CAPTURED '+label);};
for(let i=1;i<=4;i++)await capture('actual-reduced-motion-'+i);
report.status='waiting-personal-reduced-image-check';save();console.log('REDUCED_IMAGES_READY; write decision.txt with clip or stop');
let decision='stop';for(let i=0;i<150;i++){if(fs.existsSync(out+'/decision.txt')){decision=fs.readFileSync(out+'/decision.txt','utf8').trim();break;}await new Promise(r=>setTimeout(r,200));}
await page.emulateMedia({reducedMotion:'no-preference'});
if(decision==='clip'){
const clip='polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,7px 7px,7px calc(100% - 7px),calc(100% - 7px) calc(100% - 7px),calc(100% - 7px) 7px,7px 7px)';
assert.equal(await page.evaluate(c=>CSS.supports('clip-path',c),clip),true);
await page.evaluate(c=>{const e=document.createElement('style');e.id='assets-motion-paint-diagnostic';e.textContent='.page[data-page="matchup-breakdown"] .mb-perimeter-light,.page[data-page="matchup-breakdown"] .mb-frame-glints{clip-path:'+c+'!important}.page[data-page="matchup-breakdown"] .mb-diamond-spark{clip-path:inset(0 calc(100% - 7px) 0 0)!important}.page[data-page="matchup-breakdown"] .mb-diamond-spark.is-right{clip-path:inset(0 0 0 calc(100% - 7px))!important}';document.head.append(e);},clip);
for(let i=1;i<=4;i++)await capture('diagnostic-perimeter-edge-clip-'+i);
await page.evaluate(()=>document.querySelector('#assets-motion-paint-diagnostic').remove());await capture('restored-normal-baseline');
report.status='completed-reduced-and-perimeter-clip-diagnostic-not-accepted';
}else report.status='stopped-after-reduced-diagnostic-no-css-probing';
report.finalNormalState=await state();report.finalRuntimeFiles=q.runtimeManifest();report.completedAt=new Date().toISOString();
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;}finally{if(context)await context.close();if(browser)await browser.close();save();console.log(report.status);}})();
