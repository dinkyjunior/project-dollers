'use strict';
// Focused native diagnostic. No source, style, DOM, clock or response changes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const gate = require(root + '/qa/home-gate.cjs');
const paint = require(root + '/qa/team-details/capture-ready.cjs');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const engine = arg('--engine', 'webkit');
const base = arg('--base', 'http://127.0.0.1:8876/project-dollers/');
const out = path.resolve(arg('--output', __dirname + '/motion-pose-' + engine));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.ok(!fs.existsSync(out), 'Fresh immutable evidence directory');
fs.mkdirSync(out, {recursive:true});
const receipt = {
  status:'running', engine, base, startedAt:new Date().toISOString(),
  source:gate.runtimeManifest(), helperSha256:sha(fs.readFileSync(__filename)),
  qualifications:{actualBrowser:true, untouchedNativeViewport:true, physicalIPhone:false,
    DOMStyleClockResponseSubstitution:false,
    sampling:{naturalIntervalsMs:[430,1730],maxFramesPerPhase:3,thirdFrameOnlyIfInitialPairAliases:true},
    motion:'Every fully visible actual light must advance, with changed native pixels; all partially/offscreen clocks retained.'},
  results:[]
};
fs.copyFileSync(__filename, out + '/executed-helper.cjs');
const save = () => fs.writeFileSync(out + '/results.json', JSON.stringify(receipt,null,2)+'\n');
save();
let browser;
async function ready(page, pageId) {
  await page.waitForFunction(id => document.querySelector('.page.active')?.dataset.page === id, pageId);
  await page.waitForFunction(() => document.documentElement.dataset.dataReady === 'true');
  if(pageId === 'game-report') await page.waitForFunction(() => document.documentElement.dataset.gameReportDataReady === 'true');
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll('.page.active img')]
    .filter(i => i.checkVisibility()).every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await page.locator('.page:visible').count(),1);
}
async function go(page, hash) {
  const response = await page.goto(base+'#'+hash,{waitUntil:'networkidle'});
  if(response) assert.equal(response.status(),200);
  else assert.ok(page.url().startsWith(base));
  await ready(page, hash.startsWith('game-report')?'game-report':'home');
}
async function tap(page, selector) {
  const item=page.locator(selector).first();
  await item.scrollIntoViewIfNeeded();
  await item.tap();
}
async function sample(page) {
  return page.locator('[data-page="game-report"]').evaluate(p => ({
    visibility:document.visibilityState, focus:document.hasFocus(), reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,
    motion:p.dataset.grMotion, opacity:getComputedStyle(p).opacity,
    clocks:p.getAnimations({subtree:true}).filter(a => a.effect?.getComputedTiming().iterations === Infinity).map(a => {
      const e=a.effect.target, r=e.getBoundingClientRect(), s=a.effect.getComputedTiming();
      return {name:a.animationName, target:e.tagName+'.'+e.className, pseudo:a.effect.pseudoElement,
        state:a.playState, time:a.currentTime, startTime:a.startTime, duration:s.duration, progress:s.progress,
        rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},
        fullyVisible:r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
        partiallyVisible:r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight};
    })
  }));
}
async function snapshot(page,row,name,anchor) {
  if(anchor) await page.locator(anchor).scrollIntoViewIfNeeded();
  const capture=await paint.capture(page,out,name);
  row.originals.push(capture);save();return capture;
}
async function proveMotion(page,row,name) {
  // Natural screenshot paint and real RAF readiness; never seek a CSS clock.
  const firstPaint=await snapshot(page,row,name+'-a');
  const first=await sample(page);
  await page.waitForTimeout(430);
  const laterPaint=await snapshot(page,row,name+'-b');
  const later=await sample(page);
  const proof={first,later,firstPaint,laterPaint};
  proof.initialPhaseDistances=first.clocks.map(clock=>{
    const next=later.clocks.find(c=>c.target===clock.target&&c.name===clock.name&&c.pseudo===clock.pseudo);
    const distance=next&&Number.isFinite(clock.progress)&&Number.isFinite(next.progress)?Math.abs(next.progress-clock.progress):null;
    return {target:clock.target,name:clock.name,pseudo:clock.pseudo,
      circularProgressDistance:distance===null?null:Math.min(distance,1-distance),
      naturalElapsedMs:next?next.time-clock.time:null};
  });
  row.motion.push(proof);save();
  const clocks=first.clocks.filter(c=>c.fullyVisible);
  assert.ok(clocks.length>0,'Actual fully visible report light targets exist');
  for(const clock of clocks){
    const next=later.clocks.find(c=>c.target===clock.target&&c.name===clock.name&&c.pseudo===clock.pseudo);
    assert.ok(next&&next.state==='running'&&next.time>clock.time+1,
      'Every fully visible native light advances: '+JSON.stringify({before:clock,after:next}));
  }
  if(firstPaint.sha256===laterPaint.sha256){
    // A screenshot's own native processing time can land one complete pulse
    // later. The fixed extra interval is declared before execution, not a seek.
    proof.initialPairAliases=true;
    proof.explanation='Initial native frames matched while all visible clocks advanced. Retained phase distances disclose cycle aliasing; one fixed extra natural interval is allowed, with every original retained.';
    save();
    await page.waitForTimeout(1730);
    proof.thirdPaint=await snapshot(page,row,name+'-c');
    proof.third=await sample(page);save();
    for(const clock of later.clocks.filter(c=>c.fullyVisible)){
      const next=proof.third.clocks.find(c=>c.target===clock.target&&c.name===clock.name&&c.pseudo===clock.pseudo);
      assert.ok(next&&next.state==='running'&&next.time>clock.time+1,
        'Every fully visible native light advances through fixed third frame: '+JSON.stringify({before:clock,after:next}));
    }
  }
  assert.ok(new Set([firstPaint.sha256,laterPaint.sha256,...(proof.thirdPaint?[proof.thirdPaint.sha256]:[])]).size>1,
    'Actual visible native light changes painted pixels within declared three-frame bound');
  return proof;
}
(async()=>{
  try {
    browser=await gate.launch(engine,base.startsWith('https:'));
    receipt.browser=browser.version();save();
    for(const viewport of [{width:393,height:852},{width:430,height:896}]) {
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en-AU',timezoneId:'Australia/Sydney'});
      const page=await context.newPage();
      const row={viewport,status:'running',originals:[],motion:[],errors:[],http:[],requestFailures:[],failures:[]};
      receipt.results.push(row);
      page.on('pageerror',e=>row.errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')row.errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400)row.http.push({url:r.url(),status:r.status()});});
      page.on('requestfailed',r=>row.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
      try {
        await go(page,'home');
        row.sports=[];
        for(const sport of ['nfl','nba','nrl','ufc']) {
          await tap(page,`[data-page="home"] [data-home-select="${sport}"]`);
          await ready(page,'home');
          const result=await page.locator('[data-page="home"]').evaluate(p=>({sport:p.dataset.homeSport,
            images:[...p.querySelectorAll('img')].filter(i=>i.checkVisibility()).map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth,height:i.naturalHeight}))}));
          row.sports.push(result);save();assert.equal(result.sport,sport);
          assert.ok(result.images.every(i=>i.complete&&i.width>0&&i.height>0),'Every actual selected sport image decodes');
        }
        for(const team of ['DAL','HOU']) {
          await go(page,`game-report?team=${team}&game=2026_04_DAL_HOU`);
          await snapshot(page,row,`pose-${team}-${viewport.width}`,'[data-page="game-report"] .gr-hero');
          (row.pose||(row.pose=[])).push(await page.locator('[data-page="game-report"] .gr-hero').evaluate(p=>({
            html:p.outerHTML,images:[...p.querySelectorAll('img')].map(i=>({src:i.currentSrc,transform:getComputedStyle(i).transform,natural:[i.naturalWidth,i.naturalHeight]}))
          })));save();
        }
        await go(page,'game-report?team=DAL&game=2026_04_DAL_HOU');
        row.consumerResources=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));
        row.consumerResourceQualification='Natural consumer requests only; this context previously exercised Home and both report viewpoints, so this is not a cold-load proof.';
        // Reproduce real keyboard re-render boundary that failed the old WPE helper.
        await tap(page,'[data-gr-tab="overview"]');
        await page.locator('[data-gr-tab="overview"]').focus();
        await page.keyboard.press('End');
        assert.equal(await page.evaluate(()=>window.PDGameReport.getState().tab),'plays');
        await page.keyboard.press('Home');
        assert.equal(await page.evaluate(()=>window.PDGameReport.getState().tab),'overview');
        row.prePaintAfterKeyboard=await sample(page);save();
        await proveMotion(page,row,`motion-${viewport.width}`);
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForTimeout(220);
        row.reduced=await sample(page);save();
        assert.equal(row.reduced.clocks.filter(c=>c.state==='running').length,0,'Reduced-motion stops every report light');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.waitForFunction(()=>{
          const animations=document.querySelector('[data-page="game-report"]').getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity);
          return !matchMedia('(prefers-reduced-motion:reduce)').matches&&animations.length>0&&animations.every(a=>a.playState==='running');
        });
        await proveMotion(page,row,`restored-motion-${viewport.width}`);
        row.requestCancellations=row.requestFailures.filter(r=>/ERR_ABORTED|cancelled|canceled/i.test(r.error||''));
        row.genuineRequestFailures=row.requestFailures.filter(r=>!row.requestCancellations.includes(r));
        assert.deepEqual(row.errors,[]);assert.deepEqual(row.http,[]);assert.deepEqual(row.genuineRequestFailures,[]);row.status='passed';
      } catch(error) {
        row.status='failed';row.failures.push({message:error.message,stack:error.stack});
      } finally {await context.close();save();}
    }
    receipt.finalSource=gate.runtimeManifest();
    receipt.sourceStable=Object.keys(receipt.finalSource).length===Object.keys(receipt.source).length&&
      Object.entries(receipt.source).every(([file,digest])=>receipt.finalSource[file]===digest);
    assert.deepEqual(receipt.finalSource,receipt.source,'Runtime unchanged throughout actual browser diagnostic');
    receipt.sourceStable=true;
    receipt.status=receipt.results.every(r=>r.status==='passed')?'passed':'failed';
    if(receipt.status!=='passed')process.exitCode=1;
  } catch(error) {
    receipt.status='failed';receipt.failure={message:error.message,stack:error.stack};process.exitCode=1;
  } finally {
    if(browser)await browser.close();receipt.browserClosed=true;receipt.completedAt=new Date().toISOString();
    assert.equal(sha(fs.readFileSync(__filename)),receipt.helperSha256,'Executed helper unchanged');save();
    console.log(JSON.stringify({status:receipt.status,browserClosed:true,path:out+'/results.json',sha256:sha(fs.readFileSync(out+'/results.json'))}));
  }
})();
