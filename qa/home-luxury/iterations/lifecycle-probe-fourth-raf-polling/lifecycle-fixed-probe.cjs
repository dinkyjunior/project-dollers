'use strict';
// Genuine WebKit production lifecycle probe. Native clocks are read, never
// paused/cancelled/played/sought by QA. The application owns that behaviour.
const {launch,runtimeManifest}=require('./functional.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://127.0.0.1:8790/project-dollers/';
async function main(){
 const expected=runtimeManifest(),report={status:'running',startedAt:new Date().toISOString(),engine:'webkit',actualBrowser:true,runtimeManifest:expected,animationPlaybackSubstituted:false,states:[],qualifications:{physicalIPhone:false,documentHiddenCase:'Test-only hidden getter plus visibilitychange; not a native background tab visibility test',offscreenCase:'Move only decorative stage containing the real observed gate; restore exact style and bounds; no evidence screenshots taken'}};
 const browser=await launch('webkit',false);
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();
  await page.goto(BASE+'#home',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
  const sample=()=>page.evaluate(()=>{
   const home=document.querySelector('.page[data-page="home"]');window.__pdQaAnimationIds??=new WeakMap();window.__pdQaAnimationSequence??=0;
   const animations=home.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations===Infinity).map(a=>{
    if(!window.__pdQaAnimationIds.has(a))window.__pdQaAnimationIds.set(a,++window.__pdQaAnimationSequence);
    const target=a.effect.target,hidden=Boolean(target?.closest('[hidden]'));
    return{id:window.__pdQaAnimationIds.get(a),name:a.animationName,playState:a.playState,pending:a.pending,currentTime:a.currentTime,startTime:a.startTime,target:target?.className,pseudo:a.effect.pseudoElement,hidden,visible:target?.checkVisibility(),computedPlayState:target?getComputedStyle(target,a.effect.pseudoElement||null).animationPlayState:null};
   });
   return{at:performance.now(),state:home.dataset.homeMotionState,reason:home.dataset.homeMotionReason,sport:home.dataset.homeSport,display:getComputedStyle(home).display,animations};
  });
  async function stopped(label,expectedState,expectedReason){
   await page.waitForFunction(({state,reason})=>{const h=document.querySelector('.page[data-page="home"]');return h.dataset.homeMotionState===state&&h.dataset.homeMotionReason===reason;},{state:expectedState,reason:expectedReason});
   try{await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').getAnimations({subtree:true}).every(a=>a.effect.getComputedTiming().iterations!==Infinity||a.playState!=='running'),{},{timeout:1500});}catch(error){const first=await sample();await page.waitForTimeout(220);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));report.states.push({label,status:'failed-zero-running',first,second:await sample()});throw error;}
   // Native pause commits its hold-time at the next animation update. Wait for
   // that actual nonpending completion before comparing stationary clocks;
   // the strict zero-running deadline above is unchanged.
   try{await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').getAnimations({subtree:true}).every(a=>a.effect.getComputedTiming().iterations!==Infinity||!a.pending),{},{timeout:3000});}catch(error){report.states.push({label,status:'failed-pause-settlement',observed:await sample()});throw error;}
   const first=await sample();await page.waitForTimeout(220);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const second=await sample();
   const stateRecord={label,first,second,status:'checking'};report.states.push(stateRecord);
   assert.equal(first.animations.filter(a=>a.playState==='running').length,0,label+': zero running native clocks');
   assert.equal(second.animations.filter(a=>a.playState==='running').length,0,label+': zero clocks after natural wait');
   const stable=first.animations.map(a=>{const b=second.animations.find(x=>x.id===a.id);if(!b)return{id:a.id,cancelled:true};assert.ok(Math.abs(Number(b.currentTime)-Number(a.currentTime))<.5,label+': actual paused clock stays fixed');return{id:a.id,firstTime:a.currentTime,secondTime:b.currentTime};});
   Object.assign(stateRecord,{stable,status:'passed'});return{first,second};
  }
  async function resumed(label){
   try{await page.waitForFunction(()=>{const h=document.querySelector('.page[data-page="home"]');return h.dataset.homeMotionState==='running'&&h.getAnimations({subtree:true}).some(a=>a.effect.target?.classList?.contains('aperture-travel-sweep')&&a.effect.getComputedTiming().iterations===Infinity&&a.playState==='running'&&!a.pending&&a.effect.target.checkVisibility());},{},{timeout:3000});}catch(error){report.states.push({label,status:'failed-resume-settlement',observed:await sample()});throw error;}
   const first=await sample();await page.waitForTimeout(220);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const second=await sample();
   const stateRecord={label,first,second,status:'checking'};report.states.push(stateRecord);
   assert.ok(first.animations.some(a=>a.playState==='running'&&a.visible),label+': actual visible animation runs');
   assert.ok(first.animations.some(a=>{const b=second.animations.find(x=>x.id===a.id);return a.target==='aperture-travel-sweep'&&a.visible&&a.playState==='running'&&b&&Number(b.currentTime)-Number(a.currentTime)>10;}),label+': actual settled main-ring clock advances across natural rendered frames');
   for(const a of first.animations.filter(x=>x.hidden)){
    assert.notEqual(a.playState,'running',label+': hidden sport scenery must remain paused');const b=second.animations.find(x=>x.id===a.id);if(b)assert.ok(Math.abs(Number(b.currentTime)-Number(a.currentTime))<.5,label+': hidden scenery clocks remain fixed');
   }
   stateRecord.status='passed';return{first,second};
  }
  await resumed('initial Home');
  for(const sport of ['nba','nrl','ufc','nfl']){await page.locator(`[data-home-select="${sport}"]`).tap();await page.waitForFunction(value=>document.querySelector('.page[data-page="home"]').dataset.homeSport===value,sport);await resumed('selected '+sport);}
  await page.locator('[data-home-entry]').click();await stopped('inactive NFL','paused','inactive');
  await page.locator('.page[data-page="nfl"] [data-nav="home"]').click();await resumed('returned Home');
  await page.emulateMedia({reducedMotion:'reduce'});await stopped('reduced motion','reduced','reduced-motion');
  await page.emulateMedia({reducedMotion:'no-preference'});await resumed('restored motion preference');
  await page.locator('.page[data-page="home"]').evaluate(async home=>{const finite=home.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations));await Promise.all(finite.map(a=>a.finished.catch(()=>{})));});
  const previousStyle=await page.locator('.aperture-stage').getAttribute('style'),previousBounds=await page.locator('.aperture-gate').boundingBox();
  await page.locator('.aperture-stage').evaluate(el=>el.style.setProperty('transform','translateY(-200vh)'));await stopped('real observed gate offscreen','paused','offscreen');
  const offscreen=await page.locator('.aperture-gate').boundingBox();assert.ok(offscreen.y+offscreen.height<0);
  await page.locator('.aperture-stage').evaluate((el,style)=>{if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);},previousStyle);await resumed('restored exact gate position');
  assert.equal(await page.locator('.aperture-stage').getAttribute('style'),previousStyle);const restoredBounds=await page.locator('.aperture-gate').boundingBox();assert.ok(Math.abs(restoredBounds.y-previousBounds.y)<1);report.offscreen={previousBounds,offscreen,restoredBounds,exactInlineStyleRestored:true};
  await page.evaluate(()=>{window.__pdQaPreviousHiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await stopped('hidden document condition','paused','hidden');
  await page.evaluate(()=>{const d=window.__pdQaPreviousHiddenDescriptor;if(d)Object.defineProperty(document,'hidden',d);else delete document.hidden;delete window.__pdQaPreviousHiddenDescriptor;document.dispatchEvent(new Event('visibilitychange'));});await resumed('restored genuine hidden property');
  await page.evaluate(()=>window.addEventListener('pagehide',()=>{const h=document.querySelector('.page[data-page="home"]');sessionStorage.setItem('__pdQaNativePagehide',JSON.stringify({state:h.dataset.homeMotionState,reason:h.dataset.homeMotionReason,running:h.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations===Infinity&&a.playState==='running').length}));}));
  await page.goto('about:blank');await page.goBack({waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');report.nativePagehide=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('__pdQaNativePagehide')));assert.deepEqual(report.nativePagehide,{state:'paused',reason:'pagehide',running:0});await resumed('native pageshow return');
  assert.deepEqual(runtimeManifest(),expected,'No source changes during actual lifecycle probe');report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{await browser.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'lifecycle-fixed-probe.json'),JSON.stringify(report,null,2)+'\n');}
 console.log('Genuine WebKit native lifecycle clocks passed; browser closed.');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
