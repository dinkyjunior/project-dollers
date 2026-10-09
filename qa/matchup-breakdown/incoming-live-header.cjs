'use strict';
// Additional actual HTTPS proof for the material live-score update in 3735200.
// No accepted helper, app, data, clock, stylesheet or request is substituted.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const q = require('./qa.cjs');
const base = 'https://dinkyjunior.github.io/project-dollers/';
const out = path.resolve(process.argv[2]);
assert.ok(out && !fs.existsSync(out), 'Fresh immutable evidence directory');
fs.mkdirSync(out, {recursive:true});
const runtime = q.runtimeManifest(), data = q.sourceData(), originalTests = q.tests();
const source = {runtimeFiles:runtime, testFiles:originalTests, helperSha256:q.SHA(fs.readFileSync(__filename))};
const report = {status:'running', engine:'webkit', hosted:true, base, source, startedAt:new Date().toISOString(), results:[],
  qualification:{strictTLS:true, sourceSubstitution:false, originalHelpersUnchanged:true, naturalAnimationPhase:true, physicalIPhone:false,
    scope:'Actual visible current live score, clock, quarter and snapshot label at both phone sizes; all235 actual decoded HTTPS bodies verified. Broader accepted controls retain their separate source-bound reviews.'}};
const save = () => fs.writeFileSync(path.join(out,'results.json'), JSON.stringify(report,null,2)+'\n');
save();
let browser;
(async()=>{try {
  browser = await q.launch('webkit',true); report.browserVersion=browser.version();
  const fixture = data.matchup.teams.DAL.fixtureReports['2026_05_TB_DAL'];
  assert.equal(fixture.eventStatus.state,'in'); assert.equal(fixture.liveScore.isFinal,false);
  for (const viewport of [{width:393,height:852},{width:430,height:896}]) {
    const context = await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'});
    const page = await context.newPage(), errors = {console:[],http:[],request:[]};
    page.on('pageerror',e=>errors.console.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.console.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)errors.http.push({url:r.url(),status:r.status()});});
    page.on('requestfailed',r=>errors.request.push({url:r.url(),error:r.failure()?.errorText}));
    try {
      await page.goto(base+'#matchup/DAL?game=2026_05_TB_DAL',{waitUntil:'networkidle'}); await q.ready(page); await q.active(page);
      const semantic=await q.semantic(page); assert.equal(semantic.dataset.sha256,q.SHA(Buffer.from(JSON.stringify(data.matchup))));
      const text = (await page.locator('.mb-fixture-copy').innerText()).replace(/\s+/g,' ').trim();
      assert.ok(text.includes(`TB ${fixture.liveScore.away}–${fixture.liveScore.home} DAL`),'Actual visible score matches both source scores');
      assert.ok(text.includes(fixture.eventStatus.displayClock),'Actual visible source clock');
      assert.ok(text.includes(fixture.eventStatus.displayPeriod),'Actual visible source quarter');
      assert.match(text,/In Progress/); assert.match(text,/Provider snapshot/);
      assert.equal(await page.locator('[data-mb-fixture]').getAttribute('data-mb-fixture'),fixture.gameId);
      const geometry=await q.geometry(page), image=await q.capture(page,out,'live-header-'+viewport.width+'-hosted');
      const actualRequests = errors.request.filter(r=>!['net::ERR_ABORTED','Load request cancelled'].includes(r.error));
      assert.deepEqual(errors.console,[]); assert.deepEqual(errors.http,[]); assert.deepEqual(actualRequests,[]);
      report.results.push({status:'passed',viewport,text,sourceFixture:{...fixture,availability:undefined,qbEvidence:undefined},geometry,image,errors:{...errors,request:actualRequests}}); save();
      if(viewport.width===430) {
        report.servedRuntime=await page.evaluate(async files=>{const rows=[]; for(let i=0;i<files.length;i+=6) rows.push(...await Promise.all(files.slice(i,i+6).map(async file=>{
          const response=await fetch(file,{cache:'no-store'}),body=await response.arrayBuffer(); return {file,status:response.status,bytes:body.byteLength,contentEncoding:response.headers.get('content-encoding'),contentLength:response.headers.get('content-length'),sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(v=>v.toString(16).padStart(2,'0')).join('')};
        }))); return rows;},Object.keys(runtime));
        assert.equal(report.servedRuntime.length,235);
        for(const row of report.servedRuntime){assert.equal(row.status,200,row.file);assert.equal(row.sha256,runtime[row.file],row.file);}
        report.actualFeedCompression=report.servedRuntime.find(r=>r.file==='assets/data/matchup-breakdown.json');
        assert.ok(['gzip','br'].includes(report.actualFeedCompression.contentEncoding));
      }
    } finally {await context.close();}
  }
  assert.deepEqual(q.runtimeManifest(),runtime); assert.deepEqual(q.tests(),originalTests); assert.equal(q.SHA(fs.readFileSync(__filename)),source.helperSha256);
  report.status='passed'; report.unchangedDuringQA=true;
} catch(e) {report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;
} finally {if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,report:path.join(out,'results.json'),sha256:q.SHA(fs.readFileSync(path.join(out,'results.json'))),failure:report.failure}));}
})();
