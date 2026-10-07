/* Independent neon release/publication/desktop audit. Run only after deployment:
   node qa/home-neon/independent-hosted/review.cjs APPLICATION_SHA PAGES_RUN_ID
   Actual HTTPS/genuine WebKit; no fixture responses or forced animation phases. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {launch, testViewport, runtimeManifest} = require('../../home-gate.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = 'https://dinkyjunior.github.io/project-dollers/';
const applicationCommit = process.argv[2], runId = process.argv[3];
assert.match(applicationCommit || '', /^[a-f0-9]{40}$/);
assert.match(runId || '', /^\d+$/);
const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], {encoding:'utf8'}));
const report = {
  status:'running', startedAt:new Date().toISOString(), base, applicationCommit,
  testScriptSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  qualification:{
    engine:'Official Playwright genuine WebKit', viewport:{width:1440,height:1000}, deviceScaleFactor:2,
    ignoreHTTPSErrors:false, certificateAndHostnameVerification:true, suppliedCAPerRunOnly:true,
    sourceDataSubstituted:false, physicalIPhoneTested:false, physicalDeviceFpsMeasured:false,
    motionSampling:'Visible animated venue image; running-state guard; 80 natural requestAnimationFrame samples per sport. No animation time/phase is forced.'
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
  assert.equal(main.object.sha,applicationCommit);assert.equal(codex.object.sha,applicationCommit);
  assert.deepEqual(pages.source,{branch:'main',path:'/'});assert.equal(pages.https_enforced,true);assert.equal(pages.status,'built');
  assert.equal(run.head_sha,applicationCommit);assert.equal(run.conclusion,'success');assert.ok(jobs.jobs.every(job=>job.conclusion==='success'));
  const manifest=runtimeManifest();report.expectedRuntimeManifest=manifest;
  browser=await launch('webkit',true);report.qualification.browserVersion=browser.version();
  const data=JSON.parse(fs.readFileSync('assets/data/current.json','utf8'));
  const history=JSON.parse(fs.readFileSync('assets/data/player-history.json','utf8'));
  report.desktop=await testViewport(browser,{base,out:__dirname,viewport:{width:1440,height:1000},data,history});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,timezoneId:'Australia/Sydney'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'#home',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-page="home"] [data-home-title]').count(),0);
  assert.equal(await page.locator('[data-page="home"] .home-league-title').count(),0);
  assert.equal((await page.locator('[data-page="home"] .brand-subtitle').textContent()).trim(),'SPORTS DATA & RESEARCH');
  report.repeatedHeroRemoved=true;report.brandTaglinePreserved=true;report.liveMotion=[];
  for(const sport of ['nfl','nba','nrl','ufc']){
    await page.locator(`[data-home-select="${sport}"]`).click();
    await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeMotionState==='running');
    const samples=await page.evaluate(async()=>{
      const home=document.querySelector('[data-page="home"]');
      const style=(selector,pseudo=null)=>getComputedStyle(home.querySelector(selector),pseudo);
      const read=()=>({
        sampledAt:performance.now(),state:home.dataset.homeMotionState,
        ring:style('.aperture-travel-sweep').transform,
        venue:style('img[data-home-scene]:not([hidden])').transform,
        fixedPalette:style('.aperture-inset').backgroundImage,
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
      const pulseRange=Object.fromEntries(Object.keys(frames[0].pulse).map(key=>{
        const values=frames.map(sample=>sample.pulse[key]),minimum=Math.min(...values),maximum=Math.max(...values);
        return[key,{minimum,maximum,range:maximum-minimum}];
      }));
      return{first:frames[0],last:frames[frames.length-1],framesSampled:frames.length,pulseRange};
    });
    assert.equal(samples.first.state,'running');assert.equal(samples.last.state,'running');
    assert.notEqual(samples.first.ring,samples.last.ring,`${sport} ring naturally moves`);
    assert.notEqual(samples.first.venue,samples.last.venue,`${sport} visible venue naturally moves`);
    assert.equal(samples.first.fixedPalette,samples.last.fixedPalette,`${sport} fixed palette stays stationary`);
    for(const [layer,range]of Object.entries(samples.pulseRange))assert.ok(range.range>.025,`${sport} ${layer} visibly pulses across natural frames`);
    report.liveMotion.push({sport,...samples});
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
  assert.deepEqual(runtimeManifest(),manifest);assert.deepEqual(errors,[]);report.additionalConsoleErrors=errors;
  await context.close();report.status='passed';
})().catch(error=>{report.status='failed';report.failure=String(error.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,applicationCommit,completedAt:report.completedAt,servedFiles:report.servedManifest?.length,movingSports:report.liveMotion?.length,failure:report.failure},null,2));
});
