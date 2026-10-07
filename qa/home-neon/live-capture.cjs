'use strict';
// Presentation captures only: functional reports remain separate and immutable.
const{launch}=require('../home-gate.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{execFileSync}=require('node:child_process');
const{redact}=require('../hosted-webkit.cjs');
const ROOT=path.resolve(__dirname,'../..'),out=path.join(__dirname,'live-captures'),base='https://dinkyjunior.github.io/project-dollers/';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const views=[{width:393,height:852},{width:430,height:896}],sports=['nfl','nba','nrl','ufc'];
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const report={status:'running',startedAt:new Date().toISOString(),base,presentationOnly:true,source:'Actual public GitHub Pages website; no application/data/artwork substitution',localGitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),expectedHtmlSha256:sha(fs.readFileSync(path.join(ROOT,'index.html'))),engine:'Genuine official Playwright WebKit 26 Linux WPE',deviceScaleFactor:2,isMobile:true,hasTouch:true,strictTLS:true,motionPausedForCapture:false,physicalIPhoneTested:false,captures:[]};
  let browser;
  try{
    browser=await launch('webkit',true);report.browserVersion=browser.version();
    for(const viewport of views){
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'});
      try{
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        const response=await page.goto(base+'#home',{waitUntil:'networkidle'});assert.equal(response.status(),200);
        const deliveredHtmlSha256=sha(await response.body());assert.equal(deliveredHtmlSha256,report.expectedHtmlSha256,'Presentation still uses the verified published HTML');
        await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_DATA?.roster?.length>0);await page.evaluate(async()=>document.fonts.ready);
        for(const sport of sports){
          await page.locator(`[data-home-select="${sport}"]`).tap();
          await page.waitForFunction(value=>document.querySelector('.page[data-page="home"]').dataset.homeSport===value,sport);
          await page.waitForFunction(()=>[...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()).every(img=>img.complete&&img.naturalWidth>0));
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const motion=await page.locator('.page[data-page="home"]').evaluate(home=>({state:home.dataset.homeMotionState,reason:home.dataset.homeMotionReason,ringAnimation:getComputedStyle(home.querySelector('.aperture-travel-sweep')).animationName,ringPlayState:getComputedStyle(home.querySelector('.aperture-travel-sweep')).animationPlayState,haloOpacity:getComputedStyle(home.querySelector('.aperture-neon-halo')).opacity,innerHaloOpacity:getComputedStyle(home.querySelector('.aperture-neon-halo-inner')).opacity,entryPulseOpacity:getComputedStyle(home.querySelector('.home-entry'),'::before').opacity,selectedPulseOpacity:getComputedStyle(home.querySelector('[data-home-select][aria-pressed="true"]'),'::before').opacity,rootReducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches}));
          assert.equal(motion.state,'running');assert.equal(motion.ringPlayState,'running');
          const file=`home-${sport}-${viewport.width}x${viewport.height}-live.png`,bytes=await page.screenshot({path:path.join(out,file)});
          report.captures.push({sport,viewportCssPixels:viewport,deviceScaleFactor:2,capturedAt:new Date().toISOString(),file,sha256:sha(bytes),bytes:bytes.length,deliveredHtmlSha256,activeMotion:motion,motionPausedForCapture:false,verifiedData:await page.evaluate(()=>({season:PD_DATA.season,currentWeek:PD_DATA.currentWeek,retrievedAt:PD_DATA.retrievedAt}))});
        }
        assert.deepEqual(errors,[],'Presentation browser has no JavaScript errors');
      }finally{await context.close();}
    }
    report.status='complete';
  }catch(error){report.status='failed';report.failure=redact(error.message);throw error;}
  finally{
    if(browser)await browser.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'manifest.json'),redact(JSON.stringify(report,null,2))+'\n');
    const cards=report.captures.map(item=>`<figure><figcaption>${item.sport.toUpperCase()} · ${item.viewportCssPixels.width}×${item.viewportCssPixels.height}<small>Actual hosted website · WebKit · DPR2 · motion running</small></figcaption><a href="${item.file}"><img src="${item.file}" width="${item.viewportCssPixels.width}" height="${item.viewportCssPixels.height}" alt="Actual ${item.sport.toUpperCase()} Home at ${item.viewportCssPixels.width}×${item.viewportCssPixels.height}"></a><a class="download" href="${item.file}" download>Download full-resolution screenshot</a></figure>`).join('\n');
    const humanDate=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',dateStyle:'medium',timeStyle:'short'}).format(new Date(report.completedAt))+' Australia/Sydney';
    fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — refined neon Home</title><style>body{margin:0;padding:24px;background:#070b10;color:#ecf3ff;font:15px system-ui}h1{font-size:26px}p{max-width:950px;line-height:1.6}a{color:#59ccff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px}figure{margin:0}figcaption{font-weight:700;margin-bottom:12px}small{display:block;color:#a6b7ca;font-weight:400;margin-top:6px}img{display:block;max-width:100%;height:auto;border:1px solid #32485c}.download{display:inline-block;margin-top:10px}@media(max-width:400px){body{padding:12px}.grid{grid-template-columns:1fr}}</style><h1>Project Dollar — refined neon Home</h1><p>Eight actual screenshots of the stronger-neon refinement from <a href="${base}">the working website</a>, at both primary iPhone screen sizes. All four sports are selectable; NFL opens research and the others remain Coming soon. Captures use genuine WebKit at Retina resolution with motion running. The larger illuminated gate, breathing halos and thicker controls are captured directly from the app. These are browser screenshots, not new concept renders.</p><p>The approved four-sport render was supplied in chat; the latest user-authorized stronger neon and removed repeated heading take precedence. <a href="../before-after/index.html">View preceding deployed Home versus this refinement</a>. Functional and source verification is recorded separately in <a href="../hosted-webkit/results.json">the hosted QA report</a>. These mobile-engine captures do not reproduce physical iPhone hardware or Safari browser controls. Captured ${humanDate}.</p><div class="grid">${cards}</div></html>`);
  }
  console.log(`Saved ${report.captures.length} unpaused actual hosted screenshots: qa/home-neon/live-captures/index.html`);
}
if(require.main===module)main().catch(error=>{console.error(redact(error.stack));process.exitCode=1;});
