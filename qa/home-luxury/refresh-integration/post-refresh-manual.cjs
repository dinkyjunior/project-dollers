'use strict';
// Focused companion to the immutable data-refresh smoke: actual refresh success.
const {launch,runtimeManifest}=require('../functional.cjs');
const {sourceSnapshot,VIEWPORTS}=require('../../run.cjs');
const {redact}=require('../../hosted-webkit.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='https://dinkyjunior.github.io/project-dollers/';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const smokeFile=path.join(__dirname,'post-refresh-results.json'),smoke=JSON.parse(fs.readFileSync(smokeFile,'utf8')),smokeSha=sha(fs.readFileSync(smokeFile));
  assert.equal(smoke.status,'passed');assert.deepEqual(runtimeManifest(),smoke.expectedManifest,'Runtime remains exactly the targeted refreshed-data build');
  const snapshot=sourceSnapshot(),report={status:'running',startedAt:new Date().toISOString(),base,strictTLS:true,engine:'Genuine WebKit26 Linux WPE',physicalIPhoneTested:false,scope:'Native manual-refresh control completes with explicit successful/unchanged status and exact verified data; no broad motion rerun',linkedSmoke:{file:'qa/home-luxury/refresh-integration/post-refresh-results.json',sha256:smokeSha},source:{retrievedAt:snapshot.data.retrievedAt,sha256:snapshot.sha256},results:[]};
  let browser;
  try{
    browser=await launch('webkit',true);
    for(const viewport of VIEWPORTS.slice(0,2)){
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'});
      try{
        const page=await context.newPage(),errors=[],responses=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        assert.equal((await page.goto(base+'#nfl',{waitUntil:'networkidle'})).status(),200);
        await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_UPDATE_STATUS?.state!=='checking');
        assert.deepEqual(await page.evaluate(()=>PD_DATA),snapshot.data);
        page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/assets/data/current.json'))responses.push(response);});
        await page.evaluate(()=>{window.__pdManualRefreshEvents=[];document.addEventListener('pd:update-status',event=>__pdManualRefreshEvents.push(event.detail));});
        await page.locator('.page.active [data-refresh]').click();
        await page.waitForFunction(()=>__pdManualRefreshEvents.some(event=>event.reason==='manual'&&['unchanged','updated','error','offline'].includes(event.state)));
        const events=await page.evaluate(()=>__pdManualRefreshEvents),terminal=events.findLast(event=>event.reason==='manual'&&event.state!=='checking');
        assert.ok(events.some(event=>event.reason==='manual'&&event.state==='checking'),'Native click initiates a fresh check');
        assert.ok(['unchanged','updated'].includes(terminal.state),'Manual refresh explicitly succeeds; retaining data after an error cannot pass');
        assert.equal(await page.locator('.page.active [data-refresh]').getAttribute('aria-busy'),'false');
        assert.deepEqual(await page.evaluate(()=>PD_DATA),snapshot.data,'Successful refresh retains the exact latest verified snapshot');
        const network=[];
        for(const response of responses){assert.ok([200,304].includes(response.status()),'Manual data request succeeds');const record={url:response.url(),status:response.status()};if(response.status()===200){record.sha256=sha(await response.body());assert.equal(record.sha256,snapshot.sha256,'Manual refresh response is the exact latest published JSON');}network.push(record);}
        assert.ok(network.length>0,'Manual refresh performs an actual data request');assert.deepEqual(errors,[]);
        report.results.push({viewport,status:'passed',events,terminal,network,consoleAndJavaScriptErrors:errors});
      }finally{await context.close();}
    }
    assert.deepEqual(runtimeManifest(),smoke.expectedManifest);assert.equal(sha(fs.readFileSync(smokeFile)),smokeSha,'Targeted broad smoke evidence remains unchanged');report.status='passed';
  }catch(error){report.status='failed';report.failure=redact(error.message);throw error;}
  finally{if(browser)await browser.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'post-refresh-manual.json'),redact(JSON.stringify(report,null,2))+'\n');}
  console.log('PASS explicit successful manual refresh at both hosted phone sizes');
}
if(require.main===module)main().catch(error=>{console.error(redact(error.stack));process.exitCode=1;});
