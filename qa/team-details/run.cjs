'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {ROOT,TEAM,SHA,WAIT,launch,runtimeManifest,freePort,ready,active,sourceData,semantic,geometry,images,capture,scrollEvidence,fullContent,inventory,motion,routeSmoke}=require('./qa.cjs');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];},engine=arg('--engine')||'chromium',output=arg('--output'),hostedBase=arg('--base'),captureOnly=args.includes('--capture-only');
assert.ok(['chromium','webkit'].includes(engine),'Engine must be chromium or webkit');
assert.ok(output&&!output.startsWith('--'),'A fresh --output path is mandatory');
assert.ok(!(args.includes('--mobile-only')&&args.includes('--desktop-only')),'Choose mobile-only or desktop-only');
const out=path.resolve(output);assert.ok(!fs.existsSync(out),'Previous QA runs are immutable');fs.mkdirSync(out,{recursive:true});
const data=sourceData(),manifest=runtimeManifest();
const testManifest=()=>Object.fromEntries(['qa/team-details/run.cjs','qa/team-details/qa.cjs','qa/team-details/controls.cjs','qa/nfl-dashboard/qa.cjs','qa/home-gate.cjs','qa/hosted-webkit.cjs'].map(file=>[file,SHA(fs.readFileSync(path.join(ROOT,file)))])),testFiles=testManifest();
const report={status:'running',engine,startedAt:new Date().toISOString(),hosted:!!hostedBase,captureOnly,source:{gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),runtimeFiles:manifest,testFiles,currentHash:SHA(fs.readFileSync(ROOT+'/assets/data/current.json')),teamFormHash:SHA(fs.readFileSync(ROOT+'/assets/data/team-details.json'))},data:{season:data.teamForm.season,retrievedAt:data.teamForm.retrievedAt,teams:Object.keys(data.teamForm.teams)},qualification:{deviceScaleFactor:2,genuineBrowser:true,strictTLS:!!hostedBase,physicalIPhone:false,reference:'Approved Dallas team-details / Form chat attachment; illustrative render facts are not accepted source data',originalReferenceBytesAvailable:false,noSiteOrSourceDataSubstitution:true},results:[]};
let browser,server,base=hostedBase;
const save=()=>{const pending=path.join(out,'results.json.next');fs.writeFileSync(pending,JSON.stringify(report,null,2));fs.renameSync(pending,path.join(out,'results.json'));};save();
async function testcase(viewport){
  const mobile=viewport.width<600,context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,timezoneId:'Australia/Sydney'}),page=await context.newPage(),result={viewport,mobile,status:'running',startedAt:new Date().toISOString(),phase:'starting'},errors=[],http=[],failed=[],external=[];
  report.results.push(result);save();
  const checkpoint=phase=>{result.phase=phase;result.checkpointAt=new Date().toISOString();save();};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)http.push({url:r.url(),status:r.status()});});page.on('requestfailed',r=>failed.push({url:r.url(),message:r.failure()?.errorText}));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(base).origin||['data:','blob:','about:'].includes(u.protocol))return route.continue();external.push(u.href);return route.abort();});
  try{
    assert.equal((await page.goto(base+'#home',{waitUntil:'networkidle'})).status(),200);await ready(page,false);await active(page,'home');
    result.homeShell=await page.locator('.page.active').evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y};});
    result.homeDiamondCapture=await capture(page,out,`home-${viewport.width}x${viewport.height}-diamond`);
    checkpoint('home-captured');
    const teamNavigation=await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});
    if(teamNavigation)assert.equal(teamNavigation.status(),200,'Team document navigation returns HTTP200');
    else assert.equal(new URL(page.url()).pathname,new URL(base).pathname,'Same-document team hash navigation retains the verified HTTP application');
    result.teamNavigation={sameDocument:teamNavigation===null,status:teamNavigation?.status()||null};await ready(page);await active(page);
    assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current,'Actual app uses frozen current verified dataset');
    assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),data.teamForm,'Actual app uses frozen team research dataset');
    result.initialGeometry=await geometry(page);assert.ok(Math.abs(result.initialGeometry.page.width-result.homeShell.width)<1,'Team frame matches Home width');assert.ok(Math.abs(result.initialGeometry.page.height-result.homeShell.height)<1,'Team frame matches Home height');if(!mobile)assert.ok(result.initialGeometry.page.width<=400.5,'Desktop team screen preserves the compact 400px phone frame');
    assert.ok(result.initialGeometry.scroller.scrollHeight>result.initialGeometry.scroller.clientHeight,'Tall team screen scrolls inside the app frame');result.images=await images(page);result.controlsBefore=await inventory(page);result.semantic=await semantic(page);
    result.renderMetrics=await page.evaluate(()=>({
      fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),
      resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,initiator:r.initiatorType,durationMs:r.duration,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize})),
      loadingQualification:'Resource timings describe this actual browser scenario and cache state; they do not claim physical iPhone frame rate or real-user mobile network performance.'
    }));
    for(const family of ['NFLTeko','NFLRobotoCondensed'])assert.ok(result.renderMetrics.fonts.some(f=>f.family===family&&f.status==='loaded'),`Native bundled ${family} font is loaded`);
    const label=`team-${viewport.width}x${viewport.height}`;result.scroll=await scrollEvidence(page,out,label);result.fullContent=await fullContent(page,out,label);checkpoint('native-and-full-content-captures-complete');
    if(!captureOnly){
      console.log(`CHECK controls ${engine} ${viewport.width}`);checkpoint('native-controls-running');result.controls=await require('./controls.cjs').controls(page,base,data,{viewport,mobile,onProgress:({phase,evidence})=>{result.controls=evidence;checkpoint(`native-controls-${phase}`);console.log(`PROGRESS ${engine} ${viewport.width} ${phase}`);}});checkpoint('native-controls-complete');console.log(`CHECK controls passed ${engine} ${viewport.width}`);
      await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page);if(mobile){console.log(`CHECK motion ${engine} ${viewport.width}`);checkpoint('native-motion-running');result.motion=await motion(page,base);checkpoint('native-motion-complete');console.log(`CHECK motion passed ${engine} ${viewport.width}`);}
      if(viewport.width===393){console.log(`CHECK all-team routes ${engine}`);checkpoint('all-team-routes-running');result.allTeamRoutes=await routeSmoke(page,base,data,{onProgress:evidence=>{result.allTeamRoutes=evidence;checkpoint(`all-team-routes-${evidence.results.length}-of-${evidence.teams}`);}});checkpoint('all-team-routes-complete');console.log(`CHECK all-team routes passed ${engine}`);}
      await page.reload({waitUntil:'networkidle'});await ready(page);await active(page);assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),data.teamForm,'Direct URL and refresh retain verified team data');result.directLoadReload=true;
    }
    result.finalGeometry=await geometry(page);result.finalVisibleImages=await images(page);result.finalCapture=await capture(page,out,label+'-final');
    const genuine=failed.filter(f=>!['net::ERR_ABORTED','Load request cancelled'].includes(f.message));assert.deepEqual(errors,[],'No JavaScript or console errors');assert.deepEqual(http,[],'No HTTP errors');assert.deepEqual(external,[],'No external runtime dependencies');assert.deepEqual(genuine,[],'No transport failures');result.errors={javascriptAndConsole:errors,http,external,failed:genuine,cancelledNavigation:failed.filter(f=>['net::ERR_ABORTED','Load request cancelled'].includes(f.message))};result.status=captureOnly?'captured-not-accepted':'passed';result.completedAt=new Date().toISOString();checkpoint('scenario-complete');
  }catch(e){result.status='failed';result.phase='failed';if(e.auditEvidence)result.controls=e.auditEvidence;result.failure={message:e.message,stack:e.stack,errors,http,failed,external};try{result.failureCapture=await capture(page,out,`failure-${viewport.width}`);result.failureControls=await inventory(page);}catch(x){result.captureError=x.message;}}
  finally{await context.close();}return result;
}
(async()=>{
  try{
    if(!base){const port=await freePort();base=`http://127.0.0.1:${port}/${encodeURIComponent(path.basename(ROOT))}/`;server=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});let listening=false;for(let i=0;i<40;i++){try{if((await fetch(base)).status===200){listening=true;break;}}catch{}await WAIT(100);}assert.ok(listening,'Local HTTP server is ready');}
    if(!base.endsWith('/'))base+='/';report.base=base;browser=await launch(engine,!!hostedBase);report.browserVersion=browser.version();
    let viewports=args.includes('--desktop-only')?[{width:1440,height:1000}]:args.includes('--mobile-only')?[{width:393,height:852},{width:430,height:896}]:[{width:393,height:852},{width:430,height:896},{width:768,height:1024},{width:1440,height:1000}];
    const single=arg('--viewport');if(single){assert.match(single,/^\d+x\d+$/);const [width,height]=single.split('x').map(Number);viewports=[{width,height}];}
    for(const viewport of viewports){const r=await testcase(viewport);save();console.log(`${r.status.toUpperCase()} ${engine} ${viewport.width}x${viewport.height}${r.failure?' '+r.failure.message:''}`);}
    if(hostedBase&&!captureOnly){const c=await browser.newContext(),p=await c.newPage();try{await p.goto(base,{waitUntil:'networkidle'});const delivered=await p.evaluate(async files=>{const rows=[];for(let i=0;i<files.length;i+=6)rows.push(...await Promise.all(files.slice(i,i+6).map(async file=>{const r=await fetch(file,{cache:'no-store'}),b=await r.arrayBuffer();return {file,status:r.status,bytes:b.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('')};})));return rows;},Object.keys(manifest));for(const r of delivered){assert.equal(r.status,200,`Hosted ${r.file} HTTP200`);assert.equal(r.sha256,manifest[r.file],`Hosted ${r.file} exact reviewed source`);}report.servedRuntime=delivered;}finally{await c.close();}}
    report.unchangedDuringQA=JSON.stringify(runtimeManifest())===JSON.stringify(manifest);assert.equal(report.unchangedDuringQA,true,'Application and source data remain frozen throughout QA');report.testLogicUnchangedDuringQA=JSON.stringify(testManifest())===JSON.stringify(testFiles);assert.equal(report.testLogicUnchangedDuringQA,true,'Exact independent QA logic remains frozen throughout execution');report.status=report.results.every(r=>r.status===(captureOnly?'captured-not-accepted':'passed'))?(captureOnly?'captured-not-accepted':'passed'):'failed';
  }catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};}
  finally{if(browser)await browser.close();if(server){server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}report.completedAt=new Date().toISOString();save();console.log('Evidence '+path.join(out,'results.json'));process.exitCode=['passed','captured-not-accepted'].includes(report.status)?0:1;}
})();
