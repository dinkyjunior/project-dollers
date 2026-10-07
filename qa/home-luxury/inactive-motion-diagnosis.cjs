'use strict';
// Observes genuine CSS playback completion after real Home → NFL navigation.
// It does not pause/cancel/seek animations or change application DOM/style.
const {launch,runtimeManifest}=require('./functional.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const expected=runtimeManifest(),report={startedAt:new Date().toISOString(),engine:'webkit',actualBrowser:true,fixtureUsed:false,runtimeManifest:expected,attempts:[]};
 const browser=await launch('webkit',false);
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();
  await page.goto('http://127.0.0.1:8790/project-dollers/#home',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
  const snapshot=()=>page.evaluate(()=>{
   const home=document.querySelector('.page[data-page="home"]');
   const animations=()=>home.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations===Infinity).map(a=>({name:a.animationName,playState:a.playState,pending:a.pending,currentTime:a.currentTime,target:a.effect.target?.className,pseudo:a.effect.pseudoElement,visible:a.effect.target?.checkVisibility()}));
   const before=animations(),styles=[...home.querySelectorAll('.aperture-travel-sweep,.aperture-metal-glint-sweep,.home-architecture-shimmer,.home-floor-shimmer,.aperture-neon-halo,.aperture-floor-reflection,.brand-glint')].map(el=>({class:el.className,animationName:getComputedStyle(el).animationName,playState:getComputedStyle(el).animationPlayState}));
   return{at:performance.now(),state:home.dataset.homeMotionState,reason:home.dataset.homeMotionReason,display:getComputedStyle(home).display,variable:getComputedStyle(home).getPropertyValue('--home-motion-play-state'),before,styles,after:animations()};
  });
  for(let attempt=0;attempt<3;attempt++){
   const before=await snapshot();await page.locator('[data-home-entry]').click();
   await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='paused');
   const immediate=await snapshot();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const afterTwoFrames=await snapshot();
   let terminalError=null;try{await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').getAnimations({subtree:true}).every(a=>a.effect.getComputedTiming().iterations!==Infinity||a.playState!=='running'),{},{timeout:1500});}catch(error){terminalError=error.message;}
   const terminal=await snapshot();report.attempts.push({attempt,before,immediate,afterTwoFrames,terminal,terminalError});
   assert.equal(terminalError,null,'Infinite Home animations actually stop after native navigation within1500ms');
   await page.goto('http://127.0.0.1:8790/project-dollers/#home',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='running');
  }
  assert.deepEqual(runtimeManifest(),expected);report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{await browser.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'inactive-motion-diagnosis.json'),JSON.stringify(report,null,2)+'\n');}
 console.log('Observed three genuine Home → NFL pause completions; browser closed.');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
