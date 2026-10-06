"use strict";
// Independent Home-only launch QA. Existing reports remain immutable.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const { proxyOptions, redact } = require("./hosted-webkit.cjs");
const ROOT = path.resolve(__dirname, "..");
const HOME = '.page[data-page="home"]';
const SPORTS = ["nfl", "nba", "nrl", "ufc"];
const VIEWPORTS = [{width:393,height:852},{width:430,height:896},{width:320,height:700},{width:768,height:1024},{width:1440,height:1000}];
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (file,value) => fs.writeFileSync(file, redact(JSON.stringify(value,null,2))+"\n");
async function active(page,id) {
  await page.waitForFunction(value => document.querySelector('.page.active')?.dataset.page === value,id);
  assert.equal(await page.locator('.page:visible').count(),1,"Exactly one in-scope page is visible");
}
async function ready(page) {
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true' && window.PD_DATA?.roster?.length>0);
  await page.evaluate(async()=>document.fonts.ready);
}
async function images(page) {
  await page.waitForFunction(()=>[...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()).every(img=>img.complete && img.naturalWidth>0));
  const list=await page.locator('.page.active img').evaluateAll(items=>items.filter(img=>img.checkVisibility()).map(img=>{
    const rect=img.getBoundingClientRect(),style=getComputedStyle(img),url=new URL(img.currentSrc||img.src);
    const fit=style.objectFit,cover=fit==='cover',scale=(cover?Math.max:Math.min)(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
    return {src:url.pathname,origin:url.origin,vector:url.pathname.endsWith('.svg'),natural:[img.naturalWidth,img.naturalHeight],rendered:[rect.width,rect.height],objectFit:fit,density:1/scale,distortion:Math.abs((rect.width/rect.height)/(img.naturalWidth/img.naturalHeight)-1)};
  }));
  for(const img of list) {
    assert.equal(img.origin,new URL(page.url()).origin,`Locally bundled image: ${img.src}`);
    assert.ok(img.vector || img.density>=1.95,`Retina image density: ${JSON.stringify(img)}`);
    assert.ok(['contain','cover','scale-down','none'].includes(img.objectFit)||img.distortion<.04,`No stretched image: ${img.src}`);
  }
  return list;
}
async function geometry(page) {
  const data=await page.evaluate(()=>{
    const home=document.querySelector('.page[data-page="home"]'),scroll=home.querySelector('.page-scroll');
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const nav=rect(home.querySelector('.bottom-nav'));
    const controls=[...home.querySelectorAll('[data-home-select],[data-home-entry],.bottom-nav button')].map(el=>{
      const r=rect(el),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return{kind:el.hasAttribute('data-home-select')?'selector':el.hasAttribute('data-home-entry')?'entry':'navigation',label:el.innerText.trim(),...r,hitTarget:hit===el||el.contains(hit),disabled:el.disabled};
    });
    return{viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,homeWidth:home.scrollWidth,scrollWidth:scroll.scrollWidth,scrollClientWidth:scroll.clientWidth,scrollHeight:scroll.scrollHeight,scrollClientHeight:scroll.clientHeight,nav,controls};
  });
  assert.ok(data.documentWidth<=data.viewport.width+1,"No document horizontal overflow");
  assert.ok(data.scrollWidth<=data.scrollClientWidth+1,"No Home content horizontal overflow");
  assert.ok(data.nav.bottom<=data.viewport.height+1,"Bottom navigation fits viewport");
  for(const item of data.controls) {
    assert.ok(item.width>=44 && item.height>=44,`44px touch target: ${JSON.stringify(item)}`);
    assert.ok(item.x>=-1 && item.right<=data.viewport.width+1,`Control fits width: ${item.label}`);
    if([393,430].includes(data.viewport.width)) {
      assert.ok(item.y>=-1 && item.bottom<=data.viewport.height+1,`Primary mobile control fits viewport: ${item.label}`);
      assert.ok(item.kind==='navigation'||item.bottom<=data.nav.y+1,`Control above navigation: ${item.label}`);
      assert.ok(item.disabled||item.hitTarget,`Unobscured interactive control: ${item.label}`);
    }
  }
  return data;
}
async function select(page,sport,touch=false) {
  const button=page.locator(`[data-home-select="${sport}"]`);
  assert.equal(await button.isEnabled(),true,"Every sport selector remains interactive");
  if(touch)await button.tap();else await button.click();
  await page.waitForFunction(value=>document.querySelector('.page[data-page="home"]').dataset.homeSport===value,sport);
  assert.equal(await page.locator(`${HOME} [data-home-select][aria-pressed="true"]`).count(),1);
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.equal((await page.locator('[data-home-title]').innerText()).trim(),sport.toUpperCase());
  assert.equal(await page.locator(`[data-home-scene="${sport}"]`).evaluate(el=>el.hidden),false);
  for(const other of SPORTS.filter(value=>value!==sport)) assert.equal(await page.locator(`[data-home-scene="${other}"]`).evaluate(el=>el.hidden),true);
  const cta=page.locator('[data-home-entry]');
  assert.equal(await cta.isDisabled(),sport!=='nfl');
  assert.equal(await cta.getAttribute('data-open'),sport==='nfl'?'nfl':null);
  const arrow=page.locator('[data-home-entry-arrow]');
  assert.equal(await arrow.isVisible(),sport==='nfl','Entry arrow is visible only for the functional NFL destination');
  assert.equal(await arrow.getAttribute('hidden'),sport==='nfl'?null:'');
  assert.match(await cta.innerText(),sport==='nfl'?/ENTER NFL/:new RegExp(`${sport.toUpperCase()}.*COMING SOON`));
  assert.equal((await page.locator('[data-home-teams-label]').innerText()).trim(),sport==='ufc'?'Fighters':'Teams');
  const text=await page.locator(HOME).innerText();
  assert.doesNotMatch(text,/preview\s+only|\bNFA\b/i);
  const palette=await page.locator(HOME).evaluate(el=>{
    const style=getComputedStyle(el);
    return{left:style.getPropertyValue('--home-left').trim(),right:style.getPropertyValue('--home-right').trim()};
  });
  const channels=colour=>{assert.match(colour,/^#[a-f0-9]{6}$/i);return[colour.slice(1,3),colour.slice(3,5),colour.slice(5,7)].map(value=>parseInt(value,16));};
  const left=channels(palette.left),right=channels(palette.right);
  if(sport==='nba'){assert.ok(left[2]>left[0] && right[0]>right[2],'NBA fixed left blue/right red system palette');}
  else{assert.equal(palette.left,palette.right,`${sport}: coherent whole-panel palette`);const channel=sport==='nfl'?2:sport==='nrl'?1:0;assert.ok(left[channel]>Math.max(...left.filter((_,index)=>index!==channel)),`${sport}: correct primary hue`);}
  for(const other of SPORTS.filter(value=>value!==sport))assert.equal(await page.locator(`[data-home-scene="${other}"]`).evaluate(el=>getComputedStyle(el).animationPlayState),'paused','Inactive venue animation is paused');
  await images(page);
}
async function screenshot(page,sport,viewport,out) {
  // Restore pointer modality without adding keyboard-only focus rings to a
  // touch screenshot. Status text is a visually hidden accessible live region.
  await page.locator('[data-home-title]').click();
  await page.evaluate(()=>document.querySelector('.page.active .page-scroll').scrollTop=0);
  const layout=await geometry(page),quality=await images(page);
  // Pause only while capturing; motion is tested separately while running.
  const paused=await page.evaluate(()=>{
    const list=document.getAnimations().filter(animation=>animation.effect?.target?.closest?.('.page.active')&&animation.playState==='running');
    const style=document.createElement('style');style.id='__pd-home-qa-capture';
    style.textContent='.page.active,.page.active::before,.page.active::after,.page.active *,.page.active *::before,.page.active *::after{animation-play-state:paused!important;transition:none!important}';
    document.head.append(style);return list.length;
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const file=`home-${sport}-${viewport.width}x${viewport.height}.png`,bytes=await page.screenshot({path:path.join(out,file)});
  await page.evaluate(()=>document.getElementById('__pd-home-qa-capture')?.remove());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return{file,sha256:sha(bytes),bytes:bytes.length,capturedAt:new Date().toISOString(),viewportCssPixels:viewport,deviceScaleFactor:2,captureOnlyPausedAnimations:paused,layout,images:quality};
}
async function motion(page) {
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='running');
  const sample=()=>page.evaluate(()=>{
    const home=document.querySelector('.page[data-page="home"]');
    const read=selector=>{const el=home.querySelector(selector);if(!el)throw new Error(`Missing motion element ${selector}`);const style=getComputedStyle(el);return{transform:style.transform,opacity:style.opacity,animationName:style.animationName,playState:style.animationPlayState};};
    return{state:home.dataset.homeMotionState,reason:home.dataset.homeMotionReason,sweep:read('.aperture-travel-sweep'),venue:read('img[data-home-scene]:not([hidden])'),rail:getComputedStyle(home.querySelector('.aperture-inset')).backgroundImage};
  });
  const first=await sample();await page.waitForTimeout(280);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const second=await sample();
  assert.notEqual(first.sweep.transform,second.sweep.transform,"Continuous ring highlight physically moves across frames");
  assert.notEqual(first.venue.transform,second.venue.transform,"Venue depth physically moves across frames");
  assert.equal(first.rail,second.rail,"The base sport palette remains fixed while highlights travel");
  assert.notEqual(first.sweep.animationName,'none');assert.equal(first.sweep.playState,'running');
  const nba=await page.locator(HOME).getAttribute('data-home-sport')==='nba';
  if(nba) {
    assert.ok(first.rail.includes('gradient'),"NBA has a fixed two-colour rail gradient");
    assert.match(first.rail,/rgb\(\s*\d+,\s*\d+,\s*\d+\)/,"NBA gradient contains real colours");
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='reduced');
  const reduced=await sample();await page.waitForTimeout(100);const still=await sample();
  assert.deepEqual(reduced,still,"Reduced-motion preference leaves Home decorative motion still");
  const running=await page.locator(HOME).evaluate(home=>home.getAnimations({subtree:true}).filter(a=>a.playState==='running' && a.effect.getComputedTiming().iterations===Infinity).length);
  assert.equal(running,0,"Reduced motion has no active infinite decorative animation");
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='running');
  // Isolated intersection harness: move only the decorative gate out of view,
  // then restore its exact inline style. No evidence screenshots use this state.
  const previousStyle=await page.locator('.aperture-stage').getAttribute('style');
  await page.locator('.aperture-stage').evaluate(el=>el.style.setProperty('transform','translateY(-200vh)'));
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionReason==='offscreen');
  const offscreen=await page.locator(HOME).getAttribute('data-home-motion-state');assert.equal(offscreen,'paused');
  await page.locator('.aperture-stage').evaluate((el,previous)=>{if(previous===null)el.removeAttribute('style');else el.setAttribute('style',previous);},previousStyle);
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='running');
  return{first,second,stationaryBasePalette:true,reducedMotion:{state:reduced.state,activeInfiniteAnimations:running},offscreen:{state:offscreen,qualification:'Isolated decorative-stage intersection harness; exact inline style restored before screenshots or further controls'}};
}
async function routeGuards(page) {
  const items=[];
  for(const sport of SPORTS.filter(value=>value!=='nfl')) {
    await select(page,sport);
    for(const hook of ['[data-open="nfl"]','[data-shortcut="matchups"]','[data-shortcut="insights"]']) {
      const before=page.url();await page.locator(`${HOME} .bottom-nav ${hook}`).click();
      await active(page,'home');assert.equal(page.url(),before,"Coming-soon navigation never enters NFL or mutates route");
      const message=await page.locator('.home-availability').innerText();assert.match(message,new RegExp(sport,'i'));assert.match(message,/coming soon/i);
      assert.equal(await page.locator('.home-availability').getAttribute('role'),'status');
      items.push({sport,control:hook,message});
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.home-availability').evaluate(el=>el.classList.contains('is-visible')),false);
  }
  return items;
}
async function performanceEvidence(page) {
  const network=await page.evaluate(()=>{
    const resources=performance.getEntriesByType('resource').map(item=>({path:new URL(item.name).pathname,initiatorType:item.initiatorType,transferSize:item.transferSize,encodedBodySize:item.encodedBodySize,decodedBodySize:item.decodedBodySize,duration:item.duration}));
    const navigation=performance.getEntriesByType('navigation')[0];
    return{navigation:{domContentLoaded: navigation.domContentLoadedEventEnd,load:navigation.loadEventEnd,responseStart:navigation.responseStart,responseEnd:navigation.responseEnd,transferSize:navigation.transferSize},resources,totalTransferBytes:resources.reduce((sum,item)=>sum+item.transferSize,0),totalEncodedResourceBytes:resources.reduce((sum,item)=>sum+item.encodedBodySize,0),totalDecodedResourceBytes:resources.reduce((sum,item)=>sum+item.decodedBodySize,0),historyLoadedOnHome:resources.some(item=>item.path.endsWith('/player-history.json'))};
  });
  assert.equal(network.historyLoadedOnHome,false,'Large player history remains lazy on Home');
  const cadence=await page.evaluate(()=>new Promise(resolve=>{
    const intervals=[];let previous;function frame(time){if(previous!==undefined)intervals.push(time-previous);previous=time;if(intervals.length<12)requestAnimationFrame(frame);else{const sorted=[...intervals].sort((a,b)=>a-b);resolve({sampledFrames:intervals.length,medianIntervalMs:sorted[Math.floor(sorted.length*.5)],p95IntervalMs:sorted[Math.floor(sorted.length*.95)],maximumIntervalMs:sorted.at(-1)});}}requestAnimationFrame(frame);
  }));
  return{network,animationFrameCadence:cadence,qualification:'Browser measurements in a cloud container; loopback timings or hosted proxy timings as indicated by base. Animation-frame cadence is not physical iPhone/GPU/FPS certification.'};
}
async function historyValues(page,history,player,ids) {
  const actual=await page.locator('.player-detail:not([hidden]) [data-game-id]').evaluateAll(cards=>cards.map(card=>({id:card.dataset.gameId,fields:[...card.querySelectorAll('[data-stat-key]')].map(field=>({key:field.dataset.statKey,value:field.querySelector('b').textContent.trim()}))})));
  assert.deepEqual(actual.map(card=>card.id),ids.slice(0,5),"Displayed personal game IDs match verified source order without padding");
  let comparedFields=0;
  for(const game of actual) for(const field of game.fields) {
    const source=history.players[player.id].games[game.id],isList=Object.hasOwn(source.rawLists||{},field.key);
    const value=Object.hasOwn(source.stats,field.key)?source.stats[field.key]:isList?source.rawLists[field.key]:source.rawStats[field.key];
    assert.ok(Object.hasOwn(source.stats,field.key)||Object.hasOwn(source.rawStats,field.key)||isList,`Field has source: ${field.key}`);
    const expected=isList?(Array.isArray(value)?value.join(', '):value===null||value===undefined||value===''?'—':String(value)):(value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:2}));
    assert.equal(field.value,expected,`Source-backed player statistic ${game.id}/${field.key}`);comparedFields++;
  }
  return{gameIds:actual.map(card=>card.id),comparedFields};
}
async function football(page) {
  await page.waitForFunction(()=>{
    const card=document.querySelector('.player-card:has(.player-detail:not([hidden]))'),svg=card?.querySelector('.card-perimeter-light');
    return card?.classList.contains('motion-track-ready') && svg && Math.abs(svg.viewBox.baseVal.height-card.getBoundingClientRect().height)<1;
  });
  const live=()=>page.locator('.player-card:has(.player-detail:not([hidden]))').evaluate(card=>({ball:getComputedStyle(card.querySelector('.orbit-football')).offsetDistance,light:getComputedStyle(card.querySelector('.perimeter-light-core')).strokeDashoffset}));
  const first=await live();await page.waitForTimeout(280);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const second=await live();
  assert.notEqual(first.ball,second.ball,'Football advances naturally across live frames');assert.notEqual(first.light,second.light,'Synchronized perimeter light advances naturally across live frames');
  const result=await page.locator('.player-card:has(.player-detail:not([hidden]))').evaluate(card=>{
    const ball=card.querySelector('.orbit-football'),light=card.querySelector('.perimeter-light-core'),bounds=card.getBoundingClientRect(),svg=card.querySelector('.card-perimeter-light');
    if(!ball||!light||!svg)throw new Error('Expanded card is missing full-perimeter football/light');
    if(Math.abs(svg.viewBox.baseVal.height-bounds.height)>1||Math.abs(svg.viewBox.baseVal.width-bounds.width)>1)throw new Error('Football track does not surround the complete expanded card');
    const animations=[ball.getAnimations()[0],...[...card.querySelectorAll('.card-perimeter-light path')].map(path=>path.getAnimations()[0])];
    if(animations.some(animation=>!animation))throw new Error('Football/perimeter light must all have active animations');
    const animation=animations[0],timing=animation.effect.getTiming(),saved=animations.map(item=>({time:item.currentTime,state:item.playState}));
    if(!animations.every(item=>item.effect.getTiming().duration===timing.duration&&item.effect.getTiming().delay===timing.delay))throw new Error('Football and lights have different timing');
    for(const item of animations)item.pause();const edges=new Set();let maximumBorderDistance=0,maximumPhaseDifference=0;
    for(let i=0;i<32;i++) {
      for(const item of animations)item.currentTime=timing.delay+timing.duration+i*timing.duration/32;
      const b=ball.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
      const nearest=Object.entries({left:Math.abs(x-bounds.left),right:Math.abs(x-bounds.right),top:Math.abs(y-bounds.top),bottom:Math.abs(y-bounds.bottom)}).sort((a,b)=>a[1]-b[1])[0];edges.add(nearest[0]);maximumBorderDistance=Math.max(maximumBorderDistance,nearest[1]);
      maximumPhaseDifference=Math.max(maximumPhaseDifference,Math.abs(parseFloat(getComputedStyle(ball).offsetDistance)-(5-parseFloat(getComputedStyle(light).strokeDashoffset))));
    }
    animations.forEach((item,index)=>{item.currentTime=saved[index].time;if(saved[index].state==='running')item.play();});
    if(edges.size!==4||maximumBorderDistance>12)throw new Error(`Football fails complete card perimeter: ${[...edges]}, ${maximumBorderDistance}`);
    if(maximumPhaseDifference>.1)throw new Error(`Football and travelling-light phase diverges ${maximumPhaseDifference}`);
    return{edges:[...edges],maximumBorderDistance,maximumPhaseDifference,expandedCardHeight:bounds.height,trackHeight:svg.viewBox.baseVal.height,openCompleteGames:card.querySelectorAll('.game-breakdown[open]').length,openAdditionalStatistics:card.querySelectorAll('.additional-statistics[open]').length,openSeason:card.querySelectorAll('.season-overview[open]').length};
  });
  return{...result,liveFrames:{first,second}};
}
async function regression(page,viewport,out,data,history) {
  await select(page,'nfl');await page.locator('[data-home-entry]').click();await active(page,'nfl');
  await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='paused');
  const paused=await page.locator(HOME).getAttribute('data-home-motion-reason');assert.equal(paused,'inactive');
  const infinite=await page.locator(HOME).evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations===Infinity&&a.playState==='running').length);
  assert.equal(infinite,0,"Home animation pauses while NFL/Steelers is open");
  assert.equal(await page.locator('.stand-row:visible').count(),5);assert.equal(await page.locator('.leader-row:visible').count(),10);
  await page.locator('[data-conference="NFC"]').click();assert.equal(await page.locator('[data-conference="NFC"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-conference="AFC"]').click();
  await page.locator('[data-nfl-tab="players"]').click();assert.equal(await page.locator('#panel-players').isVisible(),true);
  await page.locator('[data-nfl-tab="recap"]').click();assert.equal(await page.locator('#panel-recap').isVisible(),true);
  await page.locator('[data-nfl-tab="ladder"]').click();
  await page.locator('#week-select').selectOption(String(data.currentWeek));
  const nflFile=`regression-nfl-${viewport.width}.png`;await page.screenshot({path:path.join(out,nflFile)});
  await page.locator('.steelers-row button').click();await active(page,'steelers');
  await page.locator('[data-filter="QB"]').click();
  const names=await page.locator('.player-card:visible').evaluateAll(cards=>cards.map(card=>card.dataset.playerId));
  assert.ok(names.length>0&&names.every(id=>data.roster.find(player=>player.id===id)?.filterGroup==='QB'),"QB filter retains legitimate QB entries");
  await page.locator('[data-filter="ALL"]').click();
  const player=data.roster.find(value=>value.featured&&value.position==='QB');
  await page.locator(`[data-player="${player.id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.player-detail:not([hidden])')?.dataset.playerHistoryState==='ready');
  const recent=await historyValues(page,history,player,history.players[player.id].last5);
  await page.locator('.player-detail:not([hidden]) [data-history-mode="opponent"]').click();
  const fixture=data.weeks[data.currentWeek].fixture,opponent=fixture?(fixture.home_team==='PIT'?fixture.away_team:fixture.home_team):null;
  const against=await historyValues(page,history,player,opponent?history.players[player.id].byOpponent[opponent]?.gameIds||[]:[]);
  await page.locator('.player-detail:not([hidden]) [data-history-mode="recent"]').click();
  await page.locator('.player-detail:not([hidden])').evaluate(el=>{const game=el.querySelector('.game-breakdown');if(game){game.open=true;const extra=game.querySelector('.additional-statistics');if(extra)extra.open=true;}const season=el.querySelector('.season-overview');if(season)season.open=true;});
  await page.locator('.page.active .page-scroll').evaluate(el=>el.scrollTop=0);
  const perimeter=await football(page);
  assert.ok(perimeter.openCompleteGames>0 && perimeter.openAdditionalStatistics>0 && perimeter.openSeason>0,'Complete game, additional fields and season rows expand inside the animated card perimeter');
  await page.locator(`[data-player="${player.id}"]`).click();
  for(const tab of ['schedule','stats','matchups','roster']) {await page.locator(`[data-team-tab="${tab}"]`).click();assert.equal(await page.locator(`#team-panel-${tab}`).isVisible(),true);}
  const teamFile=`regression-steelers-${viewport.width}.png`;await page.screenshot({path:path.join(out,teamFile)});
  await page.locator('.team-back').click();await active(page,'nfl');
  await page.locator('.page.active [data-open="home"]').click();await active(page,'home');
  await page.goBack();await active(page,'nfl');await page.goForward();await active(page,'home');
  for(const destination of ['nfl','steelers','home']) {await page.goto(new URL(`#${destination}`,page.url()).href,{waitUntil:'networkidle'});await ready(page);await active(page,destination);await page.reload({waitUntil:'networkidle'});await ready(page);await active(page,destination);}
  return{status:'passed',screenshots:[nflFile,teamFile],homeMotionPausedWhileInactive:true,player:player.name,recent,against,opponent,football:perimeter,checks:['Home → NFL → Steelers → NFL → Home','AFC/NFC','week selector','NFL tabs','QB/ALL filters','all team tabs','source-matched personal last-five/relevant-opponent history','complete expanded player-card football perimeter','back/forward','direct URL and refresh']};
}
async function testViewport(browser,{base,out,viewport,data,history}) {
  const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:viewport.width<600,hasTouch:viewport.width<600,timezoneId:'Australia/Sydney'});
  const page=await context.newPage(),errors=[],httpErrors=[],external=[],failed=[],result={viewport,deviceScaleFactor:2,status:'running',states:[]};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',response=>{if(response.status()>=400)httpErrors.push({url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>failed.push({url:request.url(),failure:request.failure()?.errorText}));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(base).origin||['data:','blob:','about:'].includes(url.protocol))return route.continue();external.push(url.href);return route.abort();});
  try {
    const response=await page.goto(base+'#home',{waitUntil:'networkidle'});assert.equal(response.status(),200);await ready(page);await active(page,'home');
    assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data,'The visible app uses the committed verified source snapshot');
    assert.equal(await page.locator('.page').count(),3,"Only Pages 1–3 exist");
    assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nfl',"Fresh session defaults NFL");
    result.initialHomePerformance=await performanceEvidence(page);
    for(const sport of SPORTS) {
      await select(page,sport,viewport.width<600);
      const capture=await screenshot(page,sport,viewport,out);
      const animation=[393,430].includes(viewport.width)?await motion(page):null;
      result.states.push({sport,capture,motion:animation});
    }
    await select(page,'nba');await page.locator('[data-home-select="nba"]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nrl');assert.equal(await page.locator('[data-home-select="nrl"]').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('End');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'ufc');
    await page.keyboard.press('Home');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nfl');
    await page.locator('[data-home-select="nba"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nba');await active(page,'home');
    await page.locator('[data-home-select="nrl"]').focus();await page.keyboard.press('Space');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nrl');
    await page.reload({waitUntil:'networkidle'});await ready(page);await active(page,'home');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nrl',"Selection is remembered after refresh");
    result.routeGuards=await routeGuards(page);
    await page.locator(`${HOME} [data-more]`).last().click();assert.equal(await page.locator('#about-dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#about-dialog').isVisible(),false);
    if([393,430].includes(viewport.width))result.regression=await regression(page,viewport,out,data,history);
    // Exercise native scrolling and check final controls remain reachable.
    await page.locator(`${HOME} .page-scroll`).evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.locator('[data-home-select="nfl"]').scrollIntoViewIfNeeded();await page.locator('[data-home-select="nfl"]').click();await active(page,'home');
    await page.locator(`${HOME} .page-scroll`).evaluate(el=>{el.scrollTop=0;});
    // Genuine document departure triggers pagehide; capture the resulting state.
    await page.evaluate(()=>window.addEventListener('pagehide',()=>sessionStorage.setItem('__pd_qa_pagehide',JSON.stringify({state:document.querySelector('.page[data-page="home"]').dataset.homeMotionState,reason:document.querySelector('.page[data-page="home"]').dataset.homeMotionReason}))));
    await page.goto('about:blank');await page.goBack({waitUntil:'networkidle'});await ready(page);
    result.pagehide=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('__pd_qa_pagehide')));
    assert.equal(result.pagehide.state,'paused');assert.equal(result.pagehide.reason,'pagehide');
    assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(external,[]);
    const genuineFailures=failed.filter(item=>!['net::ERR_ABORTED','Load request cancelled'].includes(item.failure));assert.deepEqual(genuineFailures,[]);
    result.errors={consoleAndJavaScript:errors,http:httpErrors,external,failed:genuineFailures,cancelledNavigations:failed.filter(item=>['net::ERR_ABORTED','Load request cancelled'].includes(item.failure))};
    result.status='passed';return result;
  } catch(error) {error.qaViewport=viewport;error.qaCollected={errors,httpErrors,external,failed,result};throw error;}
  finally {await context.close();}
}
function runtimeManifest() {
  const files=['index.html'];
  const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {const full=path.join(directory,entry.name);if(entry.isDirectory())walk(full);else files.push(path.relative(ROOT,full));}};
  walk(path.join(ROOT,'assets'));
  return Object.fromEntries(files.sort().map(file=>[file,sha(fs.readFileSync(path.join(ROOT,file)))]));
}
async function servedManifest(page,manifest) {
  const results=await page.evaluate(async expected=>{
    const rows=[];for(let index=0;index<expected.length;index+=6)rows.push(...await Promise.all(expected.slice(index,index+6).map(async file=>{const response=await fetch(file,{cache:'no-store'}),bytes=await response.arrayBuffer();return{path:file,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};})));return rows;
  },Object.keys(manifest));
  for(const row of results){assert.equal(row.status,200,`Hosted ${row.path} HTTP200`);assert.equal(row.sha256,manifest[row.path],`Hosted ${row.path} matches tested worktree`);}
  return results;
}
async function launch(engine,hosted=false) {
  if(engine==='chromium')return chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const runtime=process.env.PD_QA_WEBKIT_RUNTIME||'/workspace/.onboarding/webkit-runtime',cache=process.env.PLAYWRIGHT_BROWSERS_PATH||'/workspace/.onboarding/playwright-browsers';
  const wpe=path.join(cache,path.basename(path.dirname(webkit.executablePath())),'minibrowser-wpe'),executable=path.join(wpe,'bin','MiniBrowser'),ca=process.env.PD_QA_CA_FILE||'/usr/local/share/ca-certificates/environment-proxy-ca.crt';
  const proof=JSON.parse(fs.readFileSync(path.join(runtime,'package-verification.json'),'utf8'));
  assert.ok(fs.existsSync(executable)&&fs.existsSync(ca)&&proof.packages.every(item=>item.signedIndexChecksumMatched),'Verified official WebKit and supplied CA exist');
  return webkit.launch({headless:true,executablePath:executable,proxy:hosted?proxyOptions():undefined,env:{...process.env,LD_LIBRARY_PATH:[path.join(runtime,'root','usr','lib','x86_64-linux-gnu'),path.join(wpe,'lib'),path.join(wpe,'sys','lib')].join(path.delimiter),WEBKIT_EXEC_PATH:path.join(wpe,'bin'),WEBKIT_INJECTED_BUNDLE_PATH:path.join(wpe,'lib'),WEBKIT_FORCE_COMPLEX_TEXT:'1',SSL_CERT_FILE:ca,G_TLS_CA_FILE:ca}});
}
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function gallery(out,report) {
  const primary=report.results.filter(result=>[393,430].includes(result.viewport.width));
  const reference=path.join(ROOT,'reference','approved_home_gate_reference.png');
  const exists=fs.existsSync(reference);
  const panels=primary.flatMap(result=>result.states.map(state=>`<figure><figcaption>${state.sport.toUpperCase()} · ${result.viewport.width}×${result.viewport.height} · actual ${report.engine} browser at DPR2</figcaption><img src="${state.capture.file}" width="${result.viewport.width}" height="${result.viewport.height}" alt="Actual ${state.sport.toUpperCase()} Home"></figure>`)).join('\n');
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — Home gate QA</title><style>body{margin:0;padding:24px;background:#090b0e;color:#eef4ff;font:15px system-ui}h1{font-size:24px}p{max-width:1000px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}figure{margin:0}figcaption{margin-bottom:10px}img{max-width:100%;height:auto;display:block;border:1px solid #28445f}.reference{width:100%;max-width:1800px;margin-bottom:30px}</style><h1>Project Dollar — actual Home gate browser evidence</h1><p>Captured ${report.completedAt}. Animations were paused only during screenshot exposure; motion was verified across live frames separately. Mobile emulation is not physical iPhone/Safari-controls testing.</p>${exists?'<h2>Approved reference</h2><img class="reference" src="../../../reference/approved_home_gate_reference.png" alt="Approved four-sport Home gate source"><p>Approved source shown at its native composite proportions; browser captures below are real responsive layouts, not stretched copies.</p>':'<p>The approved source is the four-sport gate render reattached in chat. Original reference bytes are not present in this report; these screenshots are actual browser evidence, not pixel-registered side-by-side composites. A human visual comparison against the chat source is required.</p>'}<div class="grid">${panels}</div></html>`);
}
async function main() {
  const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const engine=value('--engine')||'chromium',hosted=value('--base'),out=path.resolve(value('--output')||path.join(__dirname,'home-gate',hosted?'hosted-'+engine:'local-'+engine));
  assert.ok(['chromium','webkit'].includes(engine));fs.mkdirSync(out,{recursive:true});
  let server,browser,base=hosted;
  if(!base){const port=await freePort();base=`http://127.0.0.1:${port}/project-dollers/`;server=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch(base)).status===200)break;}catch{}if(i===49)throw new Error('Local QA server failed');await sleep(100);}}
  if(!base.endsWith('/'))base+='/';
  const manifest=runtimeManifest(),data=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/current.json'),'utf8')),history=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/data/player-history.json'),'utf8'));
  const report={status:'running',startedAt:new Date().toISOString(),base,engine,scope:'Page1 four-sport launch plus Pages2/3 regression; no Page4',gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),testScriptSha256:sha(fs.readFileSync(__filename)),runtimeManifest:manifest,source:{retrievedAt:data.retrievedAt,season:data.season,currentWeek:data.currentWeek},qualification:{deviceScaleFactor:2,primaryViewports:VIEWPORTS.slice(0,2),actualBrowserEngine:true,physicalIPhoneTested:false,nativeBackgroundTabVisibilityTested:false,strictTLS:new URL(base).protocol==='https:',transport:new URL(base).protocol==='https:'?'HTTPS with certificate and hostname verification':'Loopback HTTP; TLS not applicable',sourceDataSubstituted:false,externalRuntimeRequestsBlocked:true},results:[]};
  try {
    browser=await launch(engine,!!hosted);report.browserVersion=browser.version();
    const viewports=args.includes('--mobile-only')?VIEWPORTS.slice(0,2):VIEWPORTS;
    for(const viewport of viewports){report.results.push(await testViewport(browser,{base,out,viewport,data,history}));console.log(`PASS ${engine} Home four sports + interactions ${viewport.width}x${viewport.height}`);}
    if(hosted){const context=await browser.newContext(),page=await context.newPage();try{await page.goto(base,{waitUntil:'networkidle'});report.servedManifest=await servedManifest(page,manifest);}finally{await context.close();}}
    assert.deepEqual(runtimeManifest(),manifest,'No runtime changed during QA');report.status='passed';
  } catch(error){report.status='failed';report.failure={message:redact(error.message),viewport:error.qaViewport,evidence:error.qaCollected};throw error;}
  finally {if(browser)await browser.close();if(server){server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}report.completedAt=new Date().toISOString();json(path.join(out,'results.json'),report);gallery(out,report);}
  console.log(`Evidence: ${path.relative(ROOT,out)}/results.json`);return report;
}
module.exports={main,testViewport,runtimeManifest,VIEWPORTS,launch};
if(require.main===module){if(process.argv.includes('--help'))console.log('node qa/home-gate.cjs [--engine chromium|webkit] [--base https://dinkyjunior.github.io/project-dollers/] [--mobile-only] [--output qa/home-gate/...]. Existing QA directories are untouched.');else main().catch(error=>{console.error(redact(error.stack));process.exitCode=1;});}
