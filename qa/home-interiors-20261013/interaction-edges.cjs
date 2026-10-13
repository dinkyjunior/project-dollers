const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const report = {checks:[],intentionalFaults:[],errors:[],startedAt:new Date().toISOString()};
const base = process.argv[2] || 'http://127.0.0.1:8000/project-dollers/';
const output = process.argv[3] || '/tmp/project-dollar-home-edges.json';
let browser;
const record = (name,detail) => report.checks.push({name,passed:true,detail});
const state = page => page.evaluate(() => {
  const home=document.querySelector('.editorial-home');
  const entry=home.querySelector('[data-home-entry]');
  const art=home.querySelector('[data-home-art]');
  const image=art.querySelector('img');
  return {sport:home.dataset.homeSport,artState:home.dataset.homeArtState,artHidden:art.hidden,artDisplay:getComputedStyle(art).display,src:image.currentSrc,decoded:image.complete&&image.naturalWidth>0,entryDisabled:entry.disabled,entryRoute:entry.getAttribute('data-open'),entryLabel:entry.textContent.trim(),topics:[...home.querySelectorAll('[data-home-topics] button')].map(button=>({label:button.textContent,disabled:button.disabled})),pressed:[...home.querySelectorAll('button[data-home-sport]')].filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.homeSport),status:home.querySelector('[data-home-status]').textContent,hash:location.hash,motion:home.dataset.homeMotionState};
});
const select = async (page,sport) => {
  await page.evaluate(sport=>document.querySelector(`button[data-home-sport="${sport}"]`).click(),sport);
};
const ready = (page,sport) => page.waitForFunction(sport=>{
  const home=document.querySelector('.editorial-home');
  return home.dataset.homeSport===sport&&home.dataset.homeArtState==='ready';
},sport,{timeout:10000});
(async()=>{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'en-AU',timezoneId:'Australia/Sydney'});
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({type:'pageerror',message:error.message}));
  await page.goto(base+'#home');
  await ready(page,'nfl');
  assert.equal((await state(page)).decoded,true);
  record('initial NFL picture actually decoded',await state(page));

  let releaseNBA;
  const nbaGate=new Promise(resolve=>{releaseNBA=resolve;});
  let finishNBA;
  const nbaHandled=new Promise(resolve=>{finishNBA=resolve;});
  let intercepted=false;
  await page.route('**/editorial-interior-nba-mobile.webp',async route=>{
    try {
      intercepted=true;
      const response=await route.fetch();
      await nbaGate;
      await route.fulfill({response});
    } finally { finishNBA(); }
  });
  await select(page,'nba');
  const immediateNBA=await state(page);
  assert.equal(immediateNBA.sport,'nba');
  assert.equal(immediateNBA.entryDisabled,true);
  assert.equal(immediateNBA.entryRoute,null);
  assert.ok(immediateNBA.topics.every(topic=>topic.disabled));
  assert.deepEqual(immediateNBA.pressed,['nba']);
  await page.waitForFunction(()=>document.querySelector('.editorial-home').dataset.homeArtState==='loading');
  await select(page,'nrl');
  await ready(page,'nrl');
  await select(page,'nfl');
  await ready(page,'nfl');
  assert.equal(intercepted,true);
  releaseNBA();
  await nbaHandled;
  await page.unroute('**/editorial-interior-nba-mobile.webp');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const finalRace=await state(page);
  assert.equal(finalRace.sport,'nfl');
  assert.ok(finalRace.src.endsWith('/editorial-stadium-mobile.webp'));
  assert.equal(finalRace.entryDisabled,false);
  record('delayed NBA → NRL → NFL preserves latest picture and immediate route gating',{immediateNBA,finalRace});

  await page.route('**/editorial-interior-ufc-mobile.webp',route=>route.abort('failed'));
  report.intentionalFaults.push({url:'editorial-interior-ufc-mobile.webp',fault:'blocked image request for recovery test'});
  await select(page,'ufc');
  await page.waitForFunction(()=>document.querySelector('.editorial-home').dataset.homeArtState==='unavailable');
  const unavailable=await state(page);
  assert.equal(unavailable.sport,'ufc');
  assert.equal(unavailable.artHidden,true);
  assert.equal(unavailable.artDisplay,'none');
  assert.equal(unavailable.entryDisabled,true);
  assert.equal(unavailable.entryRoute,null);
  await page.unroute('**/editorial-interior-ufc-mobile.webp');
  await select(page,'nfl');
  await ready(page,'nfl');
  const recovered=await state(page);
  assert.equal(recovered.artHidden,false);
  assert.equal(recovered.decoded,true);
  record('failed UFC venue hides stale scene and NFL selection recovers',{unavailable,recovered});

  await select(page,'nba');
  await ready(page,'nba');
  await page.reload();
  await ready(page,'nba');
  assert.equal((await state(page)).entryDisabled,true);
  record('selected NBA restores after direct Home refresh',await state(page));
  await page.setViewportSize({width:431,height:896});
  await page.evaluate(()=>document.querySelector('[data-home-art] img').decode());
  assert.ok((await state(page)).src.endsWith('/editorial-interior-nba.webp'));
  await page.setViewportSize({width:393,height:852});
  await page.evaluate(()=>document.querySelector('[data-home-art] img').decode());
  assert.ok((await state(page)).src.endsWith('/editorial-interior-nba-mobile.webp'));
  record('responsive picture crosses mobile breakpoint without sport mismatch',await state(page));

  await page.goto(base+'#nfl');
  await ready(page,'nba');
  assert.equal(await page.locator('.page.active').getAttribute('data-page'),'nfl');
  assert.equal((await state(page)).motion,'paused');
  record('direct NFL route preserves hidden selected preview and pauses Home motion',await state(page));
  await context.close();

  const noStorage=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce'});
  await noStorage.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked for test','SecurityError');}}));
  const storagePage=await noStorage.newPage();
  storagePage.on('pageerror',error=>report.errors.push({type:'pageerror-storage',message:error.message}));
  await storagePage.goto(base+'#home');
  await ready(storagePage,'nfl');
  await select(storagePage,'nrl');
  await ready(storagePage,'nrl');
  assert.equal((await state(storagePage)).entryDisabled,true);
  await storagePage.reload();
  await ready(storagePage,'nfl');
  record('blocked optional session storage keeps selection functional and safe NFL fallback',await state(storagePage));
  await noStorage.close();
  assert.deepEqual(report.errors,[]);
  report.passed=true;
})().catch(error=>{report.passed=false;report.failure={message:error.message,stack:error.stack};process.exitCode=1;}).finally(async()=>{
  if(browser) await browser.close();
  report.browserClosed=true;
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({passed:report.passed,checks:report.checks.length,output,failure:report.failure?.message})+'\n');
});
