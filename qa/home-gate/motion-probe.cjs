"use strict";
const { launch } = require('../home-gate.cjs');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const path=require('node:path');
(async()=>{
  const server=spawn('python3',['-m','http.server','8793','--bind','127.0.0.1','--directory','/workspace'],{stdio:'ignore'});
  let browser;
  const report={engine:process.argv[2]||'webkit',samples:[]};
  try{
    for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8793/project-dollers/')).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    browser=await launch(report.engine,false);
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const page=await context.newPage();await page.goto('http://127.0.0.1:8793/project-dollers/#home',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]').dataset.homeMotionState==='running');
    const sample=async label=>report.samples.push({label,...await page.evaluate(()=>{
      const el=document.querySelector('.aperture-travel-sweep'),a=el.getAnimations()[0],home=document.querySelector('.page[data-page="home"]'),css=getComputedStyle(el);
      return{time:performance.now(),visibility:document.visibilityState,homeState:home.dataset.homeMotionState,homeReason:home.dataset.homeMotionReason,computedTransform:css.transform,computedAnimationName:css.animationName,computedPlayState:css.animationPlayState,animation:a?{playState:a.playState,currentTime:a.currentTime,startTime:a.startTime,progress:a.effect.getComputedTiming().progress,timing:a.effect.getTiming()}:null,venueTransform:getComputedStyle(document.querySelector('img[data-home-scene]:not([hidden])')).transform};
    })});
    await sample('initial');await page.waitForTimeout(400);await sample('before screenshot natural400ms');
    await page.evaluate(()=>{window.__probe=document.querySelector('.page.active').getAnimations({subtree:true}).filter(a=>a.playState==='running');for(const a of __probe)a.pause();});
    await page.screenshot({path:path.join(__dirname,'probe.png')});
    await page.evaluate(()=>{for(const a of __probe)a.play();delete window.__probe;});
    await sample('after screenshot resumed');await page.waitForTimeout(400);await sample('after screenshot natural400ms');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await sample('after2RAF');
    await page.screenshot({path:path.join(__dirname,'probe-after.png')});await sample('after second screenshot');
    await context.close();
  }finally{if(browser)await browser.close();server.kill('SIGTERM');fs.writeFileSync(path.join(__dirname,`motion-probe-${report.engine}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
