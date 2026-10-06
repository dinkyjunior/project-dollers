/* Independent actual-hosted desktop, motion, publication and served-byte audit.
   No runtime substitutions; genuine WebKit retains TLS/hostname verification. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {launch, testViewport, runtimeManifest} = require('../../home-gate.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = 'https://dinkyjunior.github.io/project-dollers/';
const applicationCommit = 'ec35fb1b6bcc442cfee89716bc6d1948ba28b557';
const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], {encoding: 'utf8'}));
const report = {
  status: 'running', startedAt: new Date().toISOString(), base, applicationCommit,
  priorHarness: {
    directory: '../independent-hosted-wrapper-harness',
    classification: 'Harness selector error: transform was queried on a static venue wrapper instead of its animated visible image. The preceding desktop functionality passed; no application defect was identified. Original failed evidence retained.'
  },
  qualification: {
    engine: 'Official Playwright genuine WebKit', viewport: {width: 1440, height: 1000},
    deviceScaleFactor: 2, ignoreHTTPSErrors: false, certificateAndHostnameVerification: true,
    sourceDataSubstituted: false, suppliedCAPerRunOnly: true, physicalIPhoneTested: false,
    motionSampling: 'Natural requestAnimationFrame callbacks; visible animated scene image; running-state guard. No animations are forced or substituted.'
  }
};
let browser;
(async () => {
  const pages = api('repos/dinkyjunior/project-dollers/pages');
  const main = api('repos/dinkyjunior/project-dollers/git/ref/heads/main');
  const codex = api('repos/dinkyjunior/project-dollers/git/ref/heads/codex-rebuild');
  const run = api('repos/dinkyjunior/project-dollers/actions/runs/37547594682');
  const jobs = api('repos/dinkyjunior/project-dollers/actions/runs/37547594682/jobs');
  report.github = {
    pages: {status: pages.status, source: pages.source, buildType: pages.build_type, httpsEnforced: pages.https_enforced, htmlUrl: pages.html_url},
    mainSha: main.object.sha, developmentSha: codex.object.sha,
    workflow: {id: run.id, status: run.status, conclusion: run.conclusion, headSha: run.head_sha, htmlUrl: run.html_url, updatedAt: run.updated_at},
    jobs: jobs.jobs.map(({name,status,conclusion})=>({name,status,conclusion}))
  };
  assert.equal(main.object.sha, applicationCommit);
  assert.equal(codex.object.sha, applicationCommit);
  assert.deepEqual(pages.source, {branch: 'main', path: '/'});
  assert.equal(pages.https_enforced, true);
  assert.equal(pages.status, 'built');
  assert.equal(run.head_sha, applicationCommit);
  assert.equal(run.conclusion, 'success');
  assert.ok(jobs.jobs.every(job=>job.conclusion==='success'));
  const manifest = runtimeManifest();
  report.expectedRuntimeManifest = manifest;
  browser = await launch('webkit', true);
  report.qualification.browserVersion = browser.version();
  const data = JSON.parse(fs.readFileSync('assets/data/current.json', 'utf8'));
  const history = JSON.parse(fs.readFileSync('assets/data/player-history.json', 'utf8'));
  report.desktop = await testViewport(browser, {base, out: __dirname, viewport: {width:1440,height:1000}, data, history});
  const context = await browser.newContext({viewport:{width:1440,height:1000}, deviceScaleFactor:2, timezoneId:'Australia/Sydney'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {if(message.type()==='error') errors.push(message.text());});
  await page.goto(base+'#home', {waitUntil:'networkidle'});
  report.liveMotion = [];
  for (const sport of ['nfl','nba','nrl','ufc']) {
    await page.locator(`[data-home-select="${sport}"]`).click();
    await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeMotionState==='running');
    const samples = await page.evaluate(async()=>{
      const home=document.querySelector('[data-page="home"]');
      const read=()=>({
        sampledAt: performance.now(), state: home.dataset.homeMotionState,
        ring: getComputedStyle(home.querySelector('.aperture-travel-sweep')).transform,
        venue: getComputedStyle(home.querySelector('img[data-home-scene]:not([hidden])')).transform,
        fixedPalette: getComputedStyle(home.querySelector('.aperture-inset')).backgroundImage
      });
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const first=read();
      for(let frame=0;frame<30;frame++) await new Promise(requestAnimationFrame);
      return {first,second:read(),requestAnimationFrames:30};
    });
    assert.equal(samples.first.state,'running');
    assert.equal(samples.second.state,'running');
    assert.notEqual(samples.first.ring,samples.second.ring,`${sport} ring actually moves`);
    assert.notEqual(samples.first.venue,samples.second.venue,`${sport} visible venue actually moves`);
    assert.equal(samples.first.fixedPalette,samples.second.fixedPalette,`${sport} base palette is stationary`);
    report.liveMotion.push({sport,...samples});
  }
  report.servedManifest = await page.evaluate(async files => {
    const rows=[];
    for(let index=0;index<files.length;index+=6) rows.push(...await Promise.all(files.slice(index,index+6).map(async file=>{
      const response=await fetch(file,{cache:'no-store'}),bytes=await response.arrayBuffer();
      return {path:file,status:response.status,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('')};
    })));
    return rows;
  },Object.keys(manifest));
  for(const row of report.servedManifest){assert.equal(row.status,200,row.path);assert.equal(row.sha256,manifest[row.path],row.path);}
  assert.deepEqual(runtimeManifest(),manifest);
  assert.deepEqual(errors,[]);
  report.additionalConsoleErrors=errors;
  await context.close();
  report.status='passed';
})().catch(error=>{report.status='failed';report.failure=String(error.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,applicationCommit,completedAt:report.completedAt,servedFiles:report.servedManifest?.length,desktop:report.desktop?.status,movingSports:report.liveMotion?.length,failure:report.failure},null,2));
});
