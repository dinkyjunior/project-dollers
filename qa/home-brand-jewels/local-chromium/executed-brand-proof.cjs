'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
const HOME='[data-page="home"]';
async function state(page){
  return page.locator(HOME).evaluate(h=>{
    const svg=h.querySelector('.home-brand-lighting'),m=svg.getScreenCTM(),b=h.querySelector('.brand').getBoundingClientRect();
    const nodes=[...svg.querySelectorAll('.home-brand-point,.home-brand-facet,.home-brand-crystal-reflection,.home-brand-gold-reflection,.home-brand-gold-edge')];
    return {observedAt:performance.now(),nativeDPR:devicePixelRatio,motionState:h.dataset.homeMotionState,
      brand:{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom},
      matrix:m?{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}:null,
      groups:[...svg.querySelectorAll('[data-brand-letter]')].map(g=>{
        const id=g.getAttribute('clip-path').match(/#([^)]*)/)[1],clip=svg.querySelector('#'+id);
        return {letter:g.dataset.brandLetter,material:g.classList.contains('home-brand-gold-letter')?'gold':'crystal',clipId:id,paths:[...clip.querySelectorAll('path')].map(p=>p.getAttribute('d'))};
      }),
      nodes:nodes.map((n,index)=>({index,class:n.getAttribute('class'),letter:n.closest('[data-brand-letter]')?.dataset.brandLetter||null,
        opacity:Number(getComputedStyle(n).opacity),transform:getComputedStyle(n).transform,
        clocks:n.getAnimations().filter(a=>a.effect?.target===n).map(a=>({name:a.animationName,time:a.currentTime,startTime:a.startTime,state:a.playState,
          duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay,infinite:a.effect.getTiming().iterations===Infinity}))}))};
  });
}
async function brandClip(page){const b=await page.locator(HOME+' .brand').boundingBox();return{x:Math.floor(b.x),y:Math.floor(b.y),width:Math.ceil(b.x+b.width)-Math.floor(b.x),height:Math.ceil(b.y+b.height)-Math.floor(b.y)};}
async function perimeterClip(page){return page.locator(HOME).evaluate(h=>{const gate=h.querySelector('.aperture-gate').getBoundingClientRect(),dock=h.querySelector('.home-sport-dock').getBoundingClientRect();return{x:0,y:Math.floor(gate.y),width:innerWidth,height:Math.ceil(dock.bottom+3)-Math.floor(gate.y)};});}
async function crop(page,out,label,clip){await page.bringToFront();const bytes=await page.screenshot({path:out+'/'+label+'.png',clip,animations:'allow'});return{file:label+'.png',clip,sha256:SHA(bytes),bytes:bytes.length,at:new Date().toISOString(),naturalAnimationPhase:true,nativeCrop:true};}
async function sequence(page,out,viewport){
  const clip=await brandClip(page),series=[],start=Date.now(),targets=[0,800,1900,3300,4800,6500];
  for(let i=0;i<targets.length;i++){
    if(i)await page.waitForTimeout(Math.max(0,start+targets[i]-Date.now()));
    const native=await state(page),paint=await crop(page,out,`brand-${viewport.width}x${viewport.height}-${i}`,clip);
    series.push({targetMilliseconds:targets[i],elapsedMilliseconds:Date.now()-start,native,paint});
  }
  const initial=series[0].native,last=series.at(-1).native;
  assert.equal(initial.groups.length,13,'Seven crystal letters and six gold letters retain native face masks');
  assert.equal(initial.groups.filter(g=>g.material==='crystal').length,7);
  assert.equal(initial.groups.filter(g=>g.material==='gold').length,6);
  assert.equal(last.nodes.length,initial.nodes.length);
  for(let i=0;i<initial.nodes.length;i++){
    const a=initial.nodes[i],b=last.nodes[i];assert.equal(a.class,b.class);assert.equal(a.clocks.length,1,'One original native animation per brand object');assert.equal(b.clocks.length,1);
    assert.equal(a.clocks[0].state,'running');assert.equal(b.clocks[0].state,'running');assert.equal(a.clocks[0].infinite,true);assert.equal(b.clocks[0].startTime,a.clocks[0].startTime,'Natural brand sampling retains each original native clock');assert.ok(b.clocks[0].time>a.clocks[0].time+1,'Every facet, pin, edge and shared surface clock advances naturally');
  }
  return {clip,series,nativeSampleSpanMilliseconds:last.observedAt-initial.observedAt,advancingOriginalBrandObjects:initial.nodes.length,
    qualification:'Actual unpaused native brand crops and read-only CSS clocks. Requested phases are natural wall time targets; WPE screenshot serialization can delay actual samples, whose times are recorded. No seeking, forced decoding, style/DOM alteration or response substitution.'};
}
module.exports={state,brandClip,perimeterClip,crop,sequence};
