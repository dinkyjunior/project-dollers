/* Independent luxury-entrance publication/desktop audit. Run only AFTER all
   visual reviewers accept and the actual application is deployed:
   node qa/home-luxury/review/review.cjs APPLICATION_SHA PAGES_RUN_ID
   Genuine WebKit over verified HTTPS. No fixture replies or forced phases. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
// Retain every rendered functional assertion while avoiding duplicate paused
// screenshots. The separate natural-light loop below saves the four live views.
if(!process.argv.includes('--no-screenshots'))process.argv.push('--no-screenshots');
const {launch, testViewport, runtimeManifest, metalEntrance} = require('../functional.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = 'https://dinkyjunior.github.io/project-dollers/';
const applicationCommit = process.argv[2], runId = process.argv[3];
assert.match(applicationCommit || '', /^[a-f0-9]{40}$/, 'Supply actual deployed application SHA');
assert.match(runId || '', /^\d+$/, 'Supply actual successful Pages run ID');
const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], {encoding:'utf8'}));
const report = {
  status:'running', startedAt:new Date().toISOString(), base, applicationCommit,
  approvedVisualSource:'User-reattached four-sport final Home gate render in chat; white freehand annotations on the rejected screenshot are not desired UI.',
  originalReferencePixelsBundled:false, pixelRegisteredReferenceComparisonClaimed:false,
  scope:'New compact luxury Page 1: four sports, desktop publication and natural light; no Page 4. Earlier metal visual acceptance is superseded by user rejection.',
  testScriptSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  qualification:{
    engine:'Official Playwright genuine WebKit', viewport:{width:1440,height:1000}, deviceScaleFactor:2,
    ignoreHTTPSErrors:false, certificateAndHostnameVerification:true, suppliedCAPerRunOnly:true,
    sourceDataSubstituted:false, physicalIPhoneTested:false, physicalDeviceFpsMeasured:false,
    duplicatePausedScreenshotFilesSaved:false,
    motionSampling:'Running-state guard and 81 natural requestAnimationFrame samples per sport, with at most ten additional real 350ms observations if an authored reflection dwell or narrow pulse window needs longer exposure. Animation time/phase is never forced.'
  }
};
let browser;
(async()=>{
  const pages=api('repos/dinkyjunior/project-dollers/pages');
  const main=api('repos/dinkyjunior/project-dollers/git/ref/heads/main');
  const codex=api('repos/dinkyjunior/project-dollers/git/ref/heads/codex-rebuild');
  const run=api(`repos/dinkyjunior/project-dollers/actions/runs/${runId}`);
  const jobs=api(`repos/dinkyjunior/project-dollers/actions/runs/${runId}/jobs`);
  report.github={
    pages:{status:pages.status,source:pages.source,buildType:pages.build_type,httpsEnforced:pages.https_enforced,htmlUrl:pages.html_url},
    mainSha:main.object.sha,developmentSha:codex.object.sha,
    workflow:{id:run.id,status:run.status,conclusion:run.conclusion,headSha:run.head_sha,htmlUrl:run.html_url,updatedAt:run.updated_at},
    jobs:jobs.jobs.map(({name,status,conclusion})=>({name,status,conclusion}))
  };
  assert.equal(main.object.sha,applicationCommit,'Production branch matches supplied deployment');
  assert.equal(codex.object.sha,applicationCommit,'Development branch matches supplied deployment');
  assert.deepEqual(pages.source,{branch:'main',path:'/'});
  assert.equal(pages.https_enforced,true);assert.equal(pages.status,'built');
  assert.equal(run.head_sha,applicationCommit);assert.equal(run.conclusion,'success');
  assert.ok(jobs.jobs.length>0&&jobs.jobs.every(job=>job.conclusion==='success'));
  const manifest=runtimeManifest();report.expectedRuntimeManifest=manifest;
  browser=await launch('webkit',true);report.qualification.browserVersion=browser.version();
  const data=JSON.parse(fs.readFileSync('assets/data/current.json','utf8'));
  const history=JSON.parse(fs.readFileSync('assets/data/player-history.json','utf8'));
  report.desktop=await testViewport(browser,{base,out:__dirname,viewport:{width:1440,height:1000},data,history});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,timezoneId:'Australia/Sydney'});
  const page=await context.newPage(), errors=[],httpErrors=[],failedRequests=[],externalRequests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)httpErrors.push({url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('request',request=>{if(new URL(request.url()).origin!==new URL(base).origin)externalRequests.push(request.url());});
  await page.goto(base+'#home',{waitUntil:'networkidle'});
  await page.evaluate(async()=>document.fonts.ready);
  assert.equal(await page.locator('[data-page="home"] [data-home-title]').count(),0);
  assert.equal(await page.locator('[data-page="home"] .home-league-title').count(),0);
  assert.equal((await page.locator('[data-page="home"] .brand-subtitle').textContent()).trim(),'SPORTS DATA & RESEARCH');
  assert.equal(await page.locator('[data-page="home"]').getByText('Preview only',{exact:false}).count(),0);
  report.repeatedHeroRemoved=true;report.brandTaglinePreserved=true;report.previewOnlyRemoved=true;report.liveMotion=[];
  for(const sport of ['nfl','nba','nrl','ufc']){
    await page.locator(`[data-home-select="${sport}"]`).click();
    await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeMotionState==='running');
    await page.waitForFunction(()=>[...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()).every(img=>img.complete&&img.naturalWidth>0));
    assert.equal((await page.locator('[data-home-teams-label]').textContent()).trim(),sport==='ufc'?'Fighters':'Teams');
    await page.waitForFunction(()=>!document.querySelector('[data-page="home"]').dataset.homeReveal);
    const entrance=await metalEntrance(page);
    assert.ok(entrance.materialToEntryGap<=34,'Actual opaque chrome has a compact floor-to-entry join');
    const samples=await page.evaluate(async()=>{
      const home=document.querySelector('[data-page="home"]');
      const style=(selector,pseudo=null)=>getComputedStyle(home.querySelector(selector),pseudo);
      const fixedPalette=()=>{const s=getComputedStyle(home);return{left:s.getPropertyValue('--home-left').trim(),right:s.getPropertyValue('--home-right').trim()};};
      const read=()=>({
        sampledAt:performance.now(),state:home.dataset.homeMotionState,
        ring:style('.aperture-travel-sweep').transform,
        metalGlint:style('.aperture-metal-glint-sweep').transform,
        metalHousing:{transform:style('.aperture-metal-housing').transform,animationName:style('.aperture-metal-housing').animationName},
        venue:style('img[data-home-scene]:not([hidden])').transform,
        fixedCorridor:{transform:style('.home-corridor').transform,filter:style('.home-corridor').filter,animationName:style('.home-corridor').animationName},
        architectureReflection:style('.home-architecture-shimmer').transform,
        stadiumReflection:style('.aperture-venue','::before').transform,
        fixedPalette:fixedPalette(),
        pulse:{
          outerRing:Number(style('.aperture-neon-halo').opacity),
          innerRing:Number(style('.aperture-neon-halo-inner').opacity),
          entry:Number(style('.home-entry','::before').opacity),
          selectedBox:Number(style('.home-sport-option[aria-pressed="true"]','::before').opacity),
          wall:Number(style('.home-wall-left .home-rail-light').opacity)
        }
      });
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const frames=[read()];
      for(let frame=0;frame<80;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));frames.push(read());}
      const ranges=()=>Object.fromEntries(Object.keys(frames[0].pulse).map(key=>{
        const values=frames.map(sample=>sample.pulse[key]),minimum=Math.min(...values),maximum=Math.max(...values);
        return[key,{minimum,maximum,range:maximum-minimum}];
      }));
      // The19s architectural glide intentionally holds its opening pose for15%.
      // Observe actual elapsed time while retaining the same motion assertions.
      let extraNaturalObservations=0;
      for(let attempt=0;attempt<10;attempt++){
        const last=frames[frames.length-1];
        if(last.architectureReflection!==frames[0].architectureReflection&&Object.values(ranges()).every(value=>value.range>.025))break;
        await new Promise(resolve=>setTimeout(resolve,350));
        await new Promise(resolve=>requestAnimationFrame(resolve));
        frames.push(read());extraNaturalObservations++;
      }
      return{first:frames[0],last:frames[frames.length-1],framesSampled:frames.length,extraNaturalObservations,pulseRange:ranges()};
    });
    assert.equal(samples.first.state,'running');assert.equal(samples.last.state,'running');
    assert.notEqual(samples.first.ring,samples.last.ring,`${sport} ring naturally moves`);
    assert.notEqual(samples.first.metalGlint,samples.last.metalGlint,`${sport} narrow metal glint naturally travels`);
    assert.deepEqual(samples.first.metalHousing,samples.last.metalHousing,`${sport} substantial metal housing stays fixed`);
    assert.equal(samples.first.metalHousing.animationName,'none',`${sport} structural shell does not spin`);
    assert.notEqual(samples.first.venue,samples.last.venue,`${sport} visible venue naturally moves`);
    assert.deepEqual(samples.first.fixedCorridor,samples.last.fixedCorridor,`${sport} corridor material and colour stay stationary`);
    assert.equal(samples.first.fixedCorridor.animationName,'none',`${sport} architecture remains fixed while reflected light moves`);
    assert.notEqual(samples.first.architectureReflection,samples.last.architectureReflection,`${sport} architectural reflection naturally moves`);
    assert.notEqual(samples.first.stadiumReflection,samples.last.stadiumReflection,`${sport} stadium reflected light naturally moves`);
    assert.deepEqual(samples.first.fixedPalette,samples.last.fixedPalette,`${sport} sport lighting is stationary while highlights move`);
    for(const [layer,range]of Object.entries(samples.pulseRange))assert.ok(range.range>.025,`${sport} ${layer} pulses across natural frames`);
    const captureFile=`home-${sport}-1440x1000-live.png`;
    const captureBytes=await page.screenshot({path:path.join(__dirname,captureFile)});
    report.liveMotion.push({sport,entrance,...samples,capture:{file:captureFile,sha256:crypto.createHash('sha256').update(captureBytes).digest('hex'),motionPausedForCapture:false}});
  }
  report.servedManifest=await page.evaluate(async files=>{
    const rows=[];
    for(let index=0;index<files.length;index+=6)rows.push(...await Promise.all(files.slice(index,index+6).map(async file=>{
      const response=await fetch(file,{cache:'no-store'}),bytes=await response.arrayBuffer();
      return{path:file,status:response.status,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('')};
    })));
    return rows;
  },Object.keys(manifest));
  for(const row of report.servedManifest){assert.equal(row.status,200,row.path);assert.equal(row.sha256,manifest[row.path],row.path);}
  assert.deepEqual(runtimeManifest(),manifest,'Application unchanged during independent audit');
  assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(failedRequests,[]);assert.deepEqual(externalRequests,[]);
  report.additionalConsoleErrors=errors;report.additionalHttpErrors=httpErrors;report.additionalFailedRequests=failedRequests;report.additionalExternalRequests=externalRequests;
  await context.close();report.status='passed';
})().catch(error=>{report.status='failed';report.failure=String(error.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();report.completedAt=new Date().toISOString();
  report.completedAustraliaSydney=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',dateStyle:'full',timeStyle:'long'}).format(new Date(report.completedAt));
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,applicationCommit,completedAt:report.completedAt,servedFiles:report.servedManifest?.length,movingSports:report.liveMotion?.length,failure:report.failure},null,2));
});
