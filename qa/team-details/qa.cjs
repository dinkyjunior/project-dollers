'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ROOT,launch,runtimeManifest,freePort,WAIT}=require('../nfl-dashboard/qa.cjs');
const TEAM='.page[data-page="team-details"]';
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
async function ready(page,team=true){
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_DATA?.roster?.length);
  if(team){
    await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.teamDataReady));
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.teamDataReady),'true','Team research dataset loads successfully');
    await page.waitForFunction(()=>window.PDTeamDetails?.getDataset&&document.querySelector('[data-page="team-details"] .td-hero'));
  }
  await page.evaluate(async()=>document.fonts.ready);
}
async function active(page,id='team-details'){
  await page.waitForFunction(value=>document.querySelector('.page.active')?.dataset.page===value,id);
  assert.equal(await page.locator('.page:visible').count(),1,'Exactly one application screen is visible');
}
function sourceData(){
  return {current:JSON.parse(fs.readFileSync(ROOT+'/assets/data/current.json','utf8')),teamForm:JSON.parse(fs.readFileSync(ROOT+'/assets/data/team-details.json','utf8'))};
}
async function semantic(page){
  return page.evaluate(()=>{
    const p=document.querySelector('.page.active');
    if(p?.dataset.page!=='team-details')throw Error('A genuine active team screen is required');
    return {hash:location.hash,data:window.PDTeamDetails.getDataset(),state:window.PDTeamDetails.getState(),selectedGames:window.PDTeamDetails.getSelectedGames().map(g=>g.id),text:p.querySelector('.team-details-content').innerText.replace(/\s+/g,' ').trim()};
  });
}
async function geometry(page){
  const g=await page.locator(TEAM).evaluate(p=>{
    const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
    const s=p.querySelector('.page-scroll'),nav=p.querySelector('.bottom-nav');
    const nodes=[...p.querySelectorAll('.td-table-head,.td-game-row,.td-yards-row,[role=row],table')].filter(e=>e.checkVisibility());
    const controls=[...p.querySelectorAll('button,select,a[href]')].filter(e=>e.checkVisibility()).map(e=>{
      const b=r(e),clip=s.contains(e)?r(s):r(p),onscreen=b.y>=Math.max(0,clip.y)&&b.bottom<=Math.min(innerHeight,clip.bottom),hit=onscreen?document.elementFromPoint(b.x+b.width/2,b.y+b.height/2):null;
      return {tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||e.id).trim(),...b,onscreen,hit:!hit?null:hit===e||e.contains(hit),disabled:!!e.disabled};
    });
    const clipped=[...p.querySelectorAll('th,td,.td-table-head>span,.td-game-row>span,.td-yards-row>span')].filter(e=>e.checkVisibility()&&e.scrollWidth>e.clientWidth+1).map(e=>({text:e.innerText,width:e.clientWidth,scrollWidth:e.scrollWidth}));
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),selects=[...p.querySelectorAll('select')].filter(e=>e.checkVisibility()).map(e=>{const st=getComputedStyle(e),text=e.selectedOptions[0]?.text||'';ctx.font=`${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;return{id:e.id,text,selectedTextWidth:ctx.measureText(text).width,availableWidth:e.clientWidth-parseFloat(st.paddingLeft||0)-parseFloat(st.paddingRight||0),appearance:st.appearance,font:ctx.font};});
    const back=p.querySelector('.td-back'),tagline=p.querySelector('.td-brand-subtitle'),a=r(back),b=r(tagline),walker=document.createTreeWalker(back,NodeFilter.SHOW_TEXT);let backText;while(walker.nextNode())if(walker.currentNode.textContent.trim()){backText=walker.currentNode;break;}
    const range=document.createRange();if(backText)range.selectNodeContents(backText);
    const visual={back:{...a,text:back.innerText,textRects:backText?[...range.getClientRects()].map(x=>({x:x.x,y:x.y,width:x.width,height:x.height})):[]},tagline:b,backTaglineOverlapArea:Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)),panels:[...p.querySelectorAll('.td-hero,.td-upcoming,.td-games,.td-yards,.td-snapshot,.td-continue')].map(e=>({class:e.className,...r(e)})),headings:[...p.querySelectorAll('.td-panel h2,.td-upcoming h2')].map(e=>({text:e.innerText,...r(e),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,font:getComputedStyle(e).font}))};
    return {viewport:{width:innerWidth,height:innerHeight},page:r(p),frame:r(p.querySelector('.team-details-content')),documentWidth:document.documentElement.scrollWidth,pageScrollWidth:p.scrollWidth,scroller:{...r(s),scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,scrollHeight:s.scrollHeight,clientTop:s.clientTop,clientHeight:s.clientHeight,scrollTop:s.scrollTop},nav:r(nav),footer:r(p.querySelector('.td-footer')),rows:nodes.map(e=>({...r(e),text:e.innerText})),controls,clipped,selects,visual};
  });
  assert.ok(g.documentWidth<=g.viewport.width+1,'No document horizontal overflow');
  assert.ok(g.scroller.scrollWidth<=g.scroller.clientWidth+1,'No team content horizontal overflow');
  assert.ok(g.nav.x>=g.page.x-1&&g.nav.right<=g.page.right+1,'Navigation fits the framed width');
  assert.ok(g.nav.y>=g.page.y-1&&g.nav.bottom<=g.page.bottom+1,'Navigation fits the framed height');
  assert.ok(g.scroller.bottom<=g.nav.y+1,'Team content stays above fixed navigation');
  for(const row of g.rows)assert.ok(row.x>=g.page.x-1&&row.right<=g.page.right+1,`Table fits frame: ${row.text}`);
  for(const c of g.controls){assert.ok(c.x>=g.page.x-1&&c.right<=g.page.right+1,`Control fits width: ${c.text}`);if(c.onscreen&&!c.disabled)assert.equal(c.hit,true,`Control can be hit: ${c.text}`);}
  assert.deepEqual(g.clipped,[],'Visible table labels and values are not truncated');
  for(const select of g.selects)assert.ok(select.selectedTextWidth<=select.availableWidth+1,`Selected filter text fits: ${JSON.stringify(select)}`);
  return g;
}
async function images(page){return require('../nfl-dashboard/qa.cjs').images(page);}
async function capture(page,out,label){
  await page.bringToFront();
  const bytes=await page.screenshot({path:path.join(out,label+'.png'),animations:'allow',timeout:30000});
  return {file:label+'.png',sha256:SHA(bytes),bytes:bytes.length,at:new Date().toISOString(),naturalAnimationPhase:true};
}
async function scrollEvidence(page,out,label){
  const s=page.locator(TEAM+' .page-scroll'),dims=await s.evaluate(e=>({height:e.scrollHeight,client:e.clientHeight}));
  const max=Math.max(0,dims.height-dims.client),offsets=[0,Math.round(max/2),max],names=['top','mid','bottom'],shots=[];
  for(let i=0;i<offsets.length;i++){
    await s.evaluate((e,y)=>e.scrollTop=y,offsets[i]);await page.waitForTimeout(160);
    shots.push({...await capture(page,out,label+'-'+names[i]),scrollTop:await s.evaluate(e=>e.scrollTop),geometry:await geometry(page)});
  }
  await s.evaluate(e=>e.scrollTop=0);return {...dims,shots};
}
async function fullContent(page,out,label){
  const expected=await semantic(page),original=await page.locator(TEAM).evaluate(p=>({scroll:p.querySelector('.page-scroll').scrollTop,styles:[p.closest('.app-shell'),p,p.querySelector('.page-scroll'),p.querySelector('.bottom-nav'),p.querySelector('.td-footer')].map(e=>e.getAttribute('style'))}));
  const isolated=await page.context().newPage();let result,error;
  try{
    await isolated.bringToFront();assert.equal((await isolated.goto(page.url(),{waitUntil:'networkidle'})).status(),200);await ready(isolated);await active(isolated);await images(isolated);
    assert.deepEqual(await semantic(isolated),expected,'Isolated actual app reproduces default team controls, selected games and source data');
    await isolated.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.page.active img')].filter(i=>i.checkVisibility()).map(i=>i.decode?.().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await isolated.evaluate(()=>{
      const p=document.querySelector('.page.active'),s=p.querySelector('.page-scroll'),shell=p.closest('.app-shell'),nav=p.querySelector('.bottom-nav'),footer=p.querySelector('.td-footer');
      document.documentElement.style.overflow='visible';document.body.style.overflow='visible';document.body.style.display='block';document.body.style.padding='0';document.body.style.height='auto';shell.style.margin='0 auto';shell.style.height='auto';shell.style.overflow='visible';p.style.position='relative';p.style.inset='auto';p.style.height='auto';p.style.maxHeight='none';p.style.overflow='visible';s.style.position='relative';s.style.inset='auto';s.style.height='auto';s.style.maxHeight='none';s.style.overflow='visible';s.scrollTop=0;nav.style.position='relative';nav.style.inset='auto';nav.style.width='calc(100% - 20px)';nav.style.margin='0 10px';footer.style.position='relative';footer.style.inset='auto';footer.style.margin='4px 10px 0';
    });
    await isolated.bringToFront();await isolated.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const bytes=await isolated.screenshot({path:path.join(out,label+'-full-content.png'),fullPage:true,animations:'allow',timeout:30000});
    result={file:label+'-full-content.png',sha256:SHA(bytes),bytes:bytes.length,naturalAnimationPhase:true,isolatedActualAppPage:true,captureOnlyUnrolledInternalScroll:true,semanticDataSha256:SHA(Buffer.from(JSON.stringify(expected.data))),qualification:'A separate genuine same-context app page loaded the actual URL and matched source data, default UI state and selected games. Only that sacrificial capture page received temporary block-flow exposure. Normal top/mid/bottom screenshots establish untouched phone geometry.'};
  }catch(e){error=e;}finally{await isolated.close();await page.bringToFront();}
  assert.deepEqual(await semantic(page),expected,'Original phone source, controls and route remain unchanged');
  assert.deepEqual(await page.locator(TEAM).evaluate(p=>({scroll:p.querySelector('.page-scroll').scrollTop,styles:[p.closest('.app-shell'),p,p.querySelector('.page-scroll'),p.querySelector('.bottom-nav'),p.querySelector('.td-footer')].map(e=>e.getAttribute('style'))})),original,'Original phone scroll and geometry styles remain unchanged');
  if(error)throw error;result.originalFunctionalPageUntouched=true;return result;
}
async function inventory(page){return page.locator(TEAM+' button,'+TEAM+' select,'+TEAM+' a[href]').evaluateAll(es=>es.map((e,index)=>({index,tag:e.tagName,text:e.innerText,visible:e.checkVisibility(),disabled:!!e.disabled,id:e.id,attrs:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),options:e.tagName==='SELECT'?[...e.options].map(o=>({text:o.text,value:o.value})):undefined})));}
async function nativeMotion(page){return page.locator(TEAM).evaluate(p=>{
  const s=p.querySelector('.page-scroll'),pr=p.getBoundingClientRect(),sr=s.getBoundingClientRect(),elements=[...p.querySelectorAll('*')];
  const visible=e=>{const b=e.getBoundingClientRect(),st=getComputedStyle(e),clip=s.contains(e)?sr:pr;return p.classList.contains('active')&&!p.hidden&&st.display!=='none'&&st.visibility!=='hidden'&&Math.min(b.right,clip.right,innerWidth)>Math.max(b.left,clip.left,0)&&Math.min(b.bottom,clip.bottom,innerHeight)>Math.max(b.top,clip.top,0);};
  return {state:p.dataset.tdMotionState||p.dataset.teamMotionState,reason:p.dataset.tdMotionReason||p.dataset.teamMotionReason,pageOpacity:Number(getComputedStyle(p).opacity),foreground:document.visibilityState,clocks:p.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity).map(a=>({name:a.animationName,index:elements.indexOf(a.effect.target),pseudo:a.effect.pseudoElement||null,time:a.currentTime,state:a.playState,visible:visible(a.effect.target)}))};
});}
async function motion(page,base){
  await page.locator(TEAM+' .page-scroll').evaluate(s=>s.scrollTop=0);await page.bringToFront();await page.screenshot({animations:'allow'});await page.waitForTimeout(200);
  const first=await nativeMotion(page),paint=await page.screenshot({animations:'allow'});await page.waitForTimeout(420);const laterPaint=await page.screenshot({animations:'allow'}),second=await nativeMotion(page);
  assert.ok(second.pageOpacity>=.99,'Team screen is fully visible during motion evidence');
  const key=c=>`${c.index}:${c.name}:${c.pseudo}`,before=new Map(first.clocks.map(c=>[key(c),c])),visible=second.clocks.filter(c=>c.visible&&c.state==='running');
  assert.ok(visible.length>0,'Team has naturally running visible decorative lighting');
  for(const c of visible)assert.ok(before.has(key(c))&&c.time>before.get(key(c)).time+1,`Natural native motion advances: ${c.name}`);
  assert.notEqual(SHA(paint),SHA(laterPaint),'Actual unpaused foreground lighting produces visibly different painted frames');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(220);const reduced=await nativeMotion(page);assert.equal(reduced.clocks.filter(c=>c.state==='running').length,0,'Reduced motion disables infinite team animation');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(220);
  await page.goto(base+'#home',{waitUntil:'networkidle'});await active(page,'home');const inactive=await nativeMotion(page);assert.equal(inactive.clocks.filter(c=>c.state==='running').length,0,'Inactive team route runs no decorative clocks');
  await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page);return {first,second,visibleAdvancingClocks:visible.length,paint:{sha256:SHA(paint),laterSha256:SHA(laterPaint),actualNaturalPixelChange:true},reduced,inactive,qualification:'Native clocks and genuine unpaused foreground frames were sampled without seeking, animation mocking or style injection. Mobile emulation does not certify physical iPhone FPS.'};
}
async function routeSmoke(page,base,data){
  const results=[];
  for(const [abbr,team] of Object.entries(data.teamForm.teams)){
    await page.goto(base+'#team/'+abbr,{waitUntil:'networkidle'});await ready(page);await active(page);
    assert.equal(await page.evaluate(()=>window.PDTeamDetails.getState().team),abbr,`Direct team route identifies ${abbr}`);
    const heading=(await page.locator(TEAM+' .td-hero h1').innerText()).replace(/\s+/g,' ').trim();
    assert.ok(heading.includes(team.name.toUpperCase()),`Hero identifies source team ${abbr}: ${heading}`);
    await page.locator(TEAM+' .page-scroll').evaluate(s=>s.scrollTop=0);
    const g=await geometry(page),asset=await images(page);
    const upcomingNode=page.locator(TEAM+' [data-upcoming-game]'),upcoming=await upcomingNode.count()?await upcomingNode.getAttribute('data-upcoming-game'):null;
    if(upcoming)assert.ok(team.games.some(game=>game.id===upcoming),`Upcoming event belongs to ${abbr}`);
    await page.locator(TEAM+' .td-footer [data-td-action="sources"]').click();
    const dialog=page.locator('#team-details-dialog');await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.getAttribute('data-view'),'sources',`Specific ${abbr} source view opens`);
    const sources=await dialog.locator('a[href]').evaluateAll(es=>es.map(e=>e.href));assert.ok(sources.length>0,`${abbr} research exposes source URLs`);for(const source of sources)assert.match(source,/^https:\/\//,'Source links retain HTTPS');
    await dialog.locator('.dialog-close').click();await dialog.waitFor({state:'hidden'});
    results.push({team:abbr,heading,route:'#team/'+abbr,upcomingEvent:upcoming,sourceLinks:sources,geometry:{page:g.page,scroller:g.scroller,clipped:g.clipped,selects:g.selects},images:asset});
  }
  await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page);
  return {status:'passed',teams:results.length,results,qualification:'Actual direct routes, rendered identities, current event association, local asset decoding, source dialogs and geometry were checked for every wired club. This does not claim exhaustive player/report interaction coverage outside the approved Dallas screen.'};
}
module.exports={ROOT,TEAM,SHA,WAIT,launch,runtimeManifest,freePort,ready,active,sourceData,semantic,geometry,images,capture,scrollEvidence,fullContent,inventory,nativeMotion,motion,routeSmoke};
