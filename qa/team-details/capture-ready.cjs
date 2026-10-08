'use strict';

// Settle the real finite route entry before capturing naturally moving artwork.
// This module never changes styles, routes, clocks, animations or image bytes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {capture:originalCapture}=require('./qa.cjs');
const PIXELS=`import io,json,math,sys
from PIL import Image
image=Image.open(io.BytesIO(sys.stdin.buffer.read()));assert image.format=='PNG'
image=image.convert('RGBA');state=json.loads(sys.argv[1]);rect=state['rect'];sx=image.width/state['viewport']['width'];sy=image.height/state['viewport']['height'];assert sx==sy
left=max(0,math.ceil((rect['x']+12)*sx));right=min(image.width,math.floor((rect['right']-12)*sx));top=max(0,math.ceil((rect['y']+12)*sy));bottom=min(image.height,math.floor((rect['bottom']-12)*sy));assert right>left and bottom>top
samples=bright=0;pixels=image.load()
for y in range(top,bottom,4):
 for x in range(left,right,4):
  r,g,b,a=pixels[x,y];samples+=1;bright+=int(a>=128 and r+g+b>210)
print(json.dumps(dict(width=image.width,height=image.height,insetCssPixels=12,sampleStridePixels=4,samples=samples,brightSamples=bright,brightFraction=bright/max(1,samples),minimumBrightFraction=.01,brightnessRgbSumThreshold=210)))`;
function interiorPixels(bytes,state){
  const result=JSON.parse(execFileSync('python3',['-c',PIXELS,JSON.stringify(state)],{input:bytes,encoding:'utf8',maxBuffer:20000}));
  assert.ok(result.samples>=100&&result.brightSamples>=50&&result.brightFraction>=0.01,'Actual app interior is painted; a blank/faded outer-frame-only screenshot is rejected');
  return{...result,status:'passed',qualification:'Read-only Pillow check of actual PNG interior excludes the outer12 CSSpx frame. It guards blank evidence, not visual fidelity or physical-device performance.'};
}

async function state(page){
  return page.locator('.page.active').evaluate(root=>{
    const style=getComputedStyle(root),r=root.getBoundingClientRect();
    return{page:root.dataset.page,hash:location.hash,foreground:document.visibilityState,opacity:Number(style.opacity),display:style.display,visibility:style.visibility,viewport:{width:innerWidth,height:innerHeight},rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},finiteEntryAnimations:root.getAnimations().filter(animation=>animation.animationName==='page-in'&&Number.isFinite(animation.effect?.getComputedTiming().iterations)).map(animation=>({name:animation.animationName,state:animation.playState,time:animation.currentTime,pending:animation.pending,progress:animation.effect.getComputedTiming().progress}))};
  });
}

async function capture(page,out,label){
  await page.bringToFront();const initial=await state(page);
  await page.waitForFunction(()=>{
    const root=document.querySelector('.page.active');if(!root||document.visibilityState!=='visible')return false;
    const style=getComputedStyle(root);
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>=0.999&&root.getAnimations().filter(animation=>animation.animationName==='page-in'&&Number.isFinite(animation.effect?.getComputedTiming().iterations)).every(animation=>animation.playState==='finished'&&animation.effect.getComputedTiming().progress===1);
  },null,{timeout:10000});
  const frameTimestamps=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(first=>requestAnimationFrame(second=>resolve([first,second])))));
  assert.ok(frameTimestamps[1]>frameTimestamps[0],'Two distinct genuine browser frames settled naturally');
  const settled=await state(page);assert.equal(settled.page,initial.page,'Capture settling preserves the active page');assert.equal(settled.hash,initial.hash,'Capture settling preserves the route');assert.equal(settled.foreground,'visible');assert.ok(settled.opacity>=0.999&&settled.display!=='none'&&settled.visibility!=='hidden','Actual finite page entry is visibly settled');
  const result=await originalCapture(page,out,label),pixels=interiorPixels(fs.readFileSync(path.join(out,result.file)),settled);
  return{...result,readiness:{status:'passed',initial,settled,frameTimestamps,genuineAnimationFrames:2,finiteEntryNaturallyFinished:true,noStylesClockOrAnimationMutation:true,pixels,qualification:'Foregrounded actual app waited for the finite page-in transition to finish naturally, then two genuine animation frames. Original unpaused screenshot bytes are retained, without retries, seeking, pausing or substitution.'}};
}

module.exports={capture,state,interiorPixels};
