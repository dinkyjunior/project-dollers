'use strict';
// Actual browser evidence only. This file never substitutes application assets,
// source data, layout, screenshots or animation timing for the capture.
const {launch,runtimeManifest} = require('./functional.cjs');
const {metalEntrance} = require('./functional.cjs');
const fs = require('node:fs'),path = require('node:path'),crypto = require('node:crypto'),assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {redact} = require('../hosted-webkit.cjs');
const ROOT = path.resolve(__dirname,'../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SPORTS = ['nfl','nba','nrl','ufc'];
const VIEWS = [{width:393,height:852},{width:430,height:896}];
async function main(){
  const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const views=args.includes('--initial')?[VIEWS[0],{width:1440,height:1000}]:args.includes('--desktop')?[...VIEWS,{width:1440,height:1000}]:VIEWS;
  const engine=value('--engine')||'chromium',base=value('--base')||'http://127.0.0.1:8790/project-dollers/',out=path.resolve(value('--output')||path.join(__dirname,'iterations','initial'));
  assert.ok(['chromium','webkit'].includes(engine));
  fs.mkdirSync(out,{recursive:true});
  const hosted=base.startsWith('https:'),expectedHtmlSha256=sha(fs.readFileSync(path.join(ROOT,'index.html'))),expectedRuntime=runtimeManifest();
  const report={status:'running',startedAt:new Date().toISOString(),base,engine,deviceScaleFactor:2,actualBrowser:true,isMobile:"per-viewport",hasTouch:"per-viewport",motionPausedForCapture:false,physicalIPhoneTested:false,sourceSubstitution:false,strictTLS:hosted,designReviewRequired:true,designApprovalRecordedHere:false,publicationAuthorizedByThisReport:false,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),testScriptSha256:sha(fs.readFileSync(__filename)),expectedHtmlSha256,runtimeManifest:expectedRuntime,approvedSource:'Reattached four-sport final Home gate render in chat. White strokes on the other screenshot are user annotations, not desired UI.',referenceImageBytesAvailable:fs.existsSync(path.join(ROOT,'reference/approved_home_gate_reference.png')),captures:[]};
  let browser;
  try{
    browser=await launch(engine,hosted);report.browserVersion=browser.version();
    for(const viewport of views){
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:viewport.width<600,hasTouch:viewport.width<600,timezoneId:'Australia/Sydney'});
      try{
        const page=await context.newPage(),errors=[],httpErrors=[],failed=[],external=[];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        page.on('response',response=>{if(response.status()>=400)httpErrors.push({url:response.url(),status:response.status()});});
        page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));
        page.on('request',request=>{if(new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());});
        const response=await page.goto(base+'#home',{waitUntil:'networkidle'});assert.equal(response.status(),200);
        assert.equal(sha(await response.body()),expectedHtmlSha256,'Captures use current actual HTML');
        await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_DATA?.roster?.length>0);
        await page.evaluate(async()=>document.fonts.ready);
        const resourceEvidence=await page.evaluate(()=>{const resources=performance.getEntriesByType('resource').map(e=>({url:e.name,path:new URL(e.name).pathname,initiatorType:e.initiatorType,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,duration:e.duration}));return{resources,totalEncodedResourceBytes:resources.reduce((s,r)=>s+r.encodedBodySize,0),totalTransferBytes:resources.reduce((s,r)=>s+r.transferSize,0),navigation:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,load:e.loadEventEnd,transferSize:e.transferSize})),hardwareFpsCertified:false};});
        (report.viewportResourceEvidence??=[]).push({viewport,initialHome:resourceEvidence});
        for(const sport of (args.includes('--initial')&&viewport.width>=600?['nfl']:SPORTS)){
          if(viewport.width<600)await page.locator(`[data-home-select="${sport}"]`).tap();else await page.locator(`[data-home-select="${sport}"]`).click();
          await page.waitForFunction(value=>document.querySelector('.page[data-page="home"]').dataset.homeSport===value,sport);
          await page.evaluate(async()=>{const finite=document.getAnimations().filter(animation=>animation.effect?.target?.classList?.contains('aperture-league-logo')&&Number.isFinite(animation.effect.getComputedTiming().endTime));await Promise.all(finite.map(animation=>animation.finished.catch(()=>{})));});
          await page.waitForFunction(()=>[...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()).every(img=>img.complete&&img.naturalWidth>0));
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const geometry=await page.locator('.page[data-page="home"]').evaluate(home=>{
            const rect=selector=>{const el=home.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
            const style=selector=>{const el=home.querySelector(selector);if(!el)return null;const s=getComputedStyle(el);return{animationName:s.animationName,animationPlayState:s.animationPlayState,transform:s.transform,opacity:s.opacity,backgroundImage:s.backgroundImage};};
            const imgs=[...home.querySelectorAll('img')].filter(img=>img.checkVisibility()).map(img=>{const r=img.getBoundingClientRect(),s=getComputedStyle(img),scale=(s.objectFit==='cover'?Math.max:Math.min)(r.width/img.naturalWidth,r.height/img.naturalHeight);return{src:new URL(img.currentSrc||img.src).pathname,natural:[img.naturalWidth,img.naturalHeight],rendered:[r.width,r.height],density:1/scale,fit:s.objectFit};});
            const gate=rect('.aperture-gate'),venue=rect('.aperture-venue'),header=rect('.home-header'),brand=rect('.home-header .brand'),subtitle=rect('.brand-subtitle');
            return{viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,homeWidth:home.scrollWidth,scrollWidth:home.querySelector('.page-scroll').scrollWidth,scrollClientWidth:home.querySelector('.page-scroll').clientWidth,gate,venue,header,brand,subtitle,shell:(()=>{const r=home.closest('.app-shell').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};})(),stage:rect('.aperture-stage'),entry:rect('[data-home-entry]'),dock:rect('.home-sport-dock'),nav:rect('.bottom-nav'),brandToGateGap:gate&&subtitle?gate.y-subtitle.bottom:null,ringRadialDepth:gate&&venue?(gate.width-venue.width)/2:null,metalStructureCount:home.querySelectorAll('.aperture-metal,.aperture-metalwork,.aperture-housing,.aperture-support,.aperture-segment').length,ringMotion:style('.aperture-travel-sweep'),motionState:home.dataset.homeMotionState,motionReason:home.dataset.homeMotionReason,images:imgs};
          });
          geometry.metalEntrance=await metalEntrance(page);
          assert.equal(geometry.motionState,'running','Natural Home motion is running');
          assert.ok(geometry.documentWidth<=viewport.width+1,'No document horizontal overflow');
          assert.ok(geometry.scrollWidth<=geometry.scrollClientWidth+1,'No Home content horizontal overflow');
          const file=`home-${sport}-${viewport.width}x${viewport.height}-live.png`,bytes=await page.screenshot({path:path.join(out,file)});
          report.captures.push({sport,viewportCssPixels:viewport,file,sha256:sha(bytes),bytes:bytes.length,capturedAt:new Date().toISOString(),motionPausedForCapture:false,geometry});
        }
        assert.deepEqual(errors,[],'No JavaScript or console errors');assert.deepEqual(httpErrors,[],'No HTTP error responses');assert.deepEqual(failed,[],'No failed requests');assert.deepEqual(external,[],'No external runtime requests');
      }finally{await context.close();}
    }
    assert.deepEqual(runtimeManifest(),expectedRuntime,'No runtime files changed while screenshots were taken');
    report.status='complete';
  }catch(error){report.status='failed';report.failure=redact(error.message);throw error;}
  finally{
    if(browser)await browser.close();report.completedAt=new Date().toISOString();
    report.completedAustraliaSydney=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',dateStyle:'full',timeStyle:'long'}).format(new Date(report.completedAt));
    fs.writeFileSync(path.join(out,'manifest.json'),redact(JSON.stringify(report,null,2))+'\n');
    const cards=report.captures.map(c=>`<figure><figcaption>${c.sport.toUpperCase()} · ${c.viewportCssPixels.width}×${c.viewportCssPixels.height}<small>${engine} · DPR2 · ${hosted?'actual hosted site':'actual local app'} · motion running</small></figcaption><a href="${c.file}"><img src="${c.file}" width="${c.viewportCssPixels.width}" height="${c.viewportCssPixels.height}" alt="Actual ${c.sport.toUpperCase()} Home at ${c.viewportCssPixels.width} by ${c.viewportCssPixels.height}"></a></figure>`).join('\n');
    fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — premium Home browser evidence</title><style>body{margin:0;padding:24px;background:#070b10;color:#ecf3ff;font:15px system-ui}h1{font-size:26px}p{max-width:950px;line-height:1.6}a{color:#59ccff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px}figure{margin:0}figcaption{font-weight:700;margin-bottom:12px}small{display:block;color:#a6b7ca;font-weight:400;margin-top:6px}img{display:block;max-width:100%;height:auto;border:1px solid #32485c}@media(max-width:400px){body{padding:12px}.grid{grid-template-columns:1fr}}</style><h1>Project Dollar — actual premium Home browser evidence</h1><p>Unaltered browser screenshots of the actual app at the labelled viewports. Motion remains running during exposure; these are not generated concept renders. The approved visual reference is the reattached four-sport Home gate render in chat; original reference bytes have not been supplied as a local file. Source comparison requires independent human review against that chat render. Physical iPhone hardware and Safari browser controls are not tested.</p><p>Captured ${report.completedAustraliaSydney}. <a href="manifest.json">Source hashes, geometry and qualifications</a>.</p><div class="grid">${cards}</div></html>`);
  }
  console.log(`Saved ${report.captures.length} actual screenshots: ${path.relative(ROOT,out)}/index.html`);
}
if(require.main===module){
  if(process.argv.includes('--help'))console.log('node qa/home-luxury/capture.cjs [--engine chromium|webkit] [--base URL] [--desktop] [--output DIRECTORY]. Saves actual unpaused browser evidence and a source-bound manifest.');
  else main().catch(error=>{console.error(redact(error.stack));process.exitCode=1;});
}
module.exports={main};
