'use strict';
// Independent, read-only local asset/loading review. Screenshots default to /tmp.
// Run against an already running server; never edits assets or production state.
const {launch} = require('../../home-gate.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../../..');
const argument = name => {const index = process.argv.indexOf(name);return index < 0 ? null : process.argv[index + 1];};
const base = argument('--base') || 'http://127.0.0.1:8765/project-dollers/';
const output = path.resolve(argument('--output') || '/tmp/pd-home-neon-assets');
fs.mkdirSync(output, {recursive:true});
const runtimeFiles = ['assets/home-premium.css','assets/home-gate-motion.css','assets/home-gate-motion.js','assets/home-interactions.js','index.html'];
const hashes = () => Object.fromEntries(runtimeFiles.map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,file))).digest('hex')]));
const initialHashes = hashes();
(async()=>{
 const browser=await launch('chromium',false);const report={kind:'Independent read-only local Home asset/neon audit',capturedAt:new Date().toISOString(),assetChecks:[],viewports:[]};const provenance=JSON.parse(fs.readFileSync(repo+'/assets/home/asset-provenance.json'));
 for(const asset of provenance.assets){const buf=fs.readFileSync(path.join(repo,asset.path));const sha=crypto.createHash('sha256').update(buf).digest('hex');report.assetChecks.push({path:asset.path,bytes:buf.length,sha256:sha,unchanged:sha===asset.sha256});}
 for(const viewport of [{width:393,height:852},{width:430,height:896}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true});const page=await context.newPage();const requests=[],responses=[],pending=[],failures=[],errors=[];let stage='startup';
  page.on('request',r=>requests.push({stage,url:r.url(),type:r.resourceType()}));page.on('requestfailed',r=>failures.push({stage,url:r.url(),failure:r.failure()}));page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{const at=stage;pending.push((async()=>{let bytes=null;try{await r.finished();bytes=(await r.body()).length}catch{}responses.push({stage:at,url:r.url(),status:r.status(),bytes,type:r.request().resourceType()});})());});
  await page.goto(base.replace(/#.*$/, '') + '#home',{waitUntil:'networkidle'});const startupCount=requests.length;const states=[];
  for(const sport of ['nfl','nba','nrl','ufc']){
   stage='select-'+sport;const before=requests.length;await page.locator('[data-home-select="'+sport+'"]').click();await page.waitForFunction(s=>{const home=document.querySelector('.aperture-home');const image=home.querySelector('[data-home-scene="'+s+'"]');return home.dataset.homeSport===s&&image.complete&&image.naturalWidth>0&&home.dataset.homeMotionState==='running'},sport);await page.waitForLoadState('networkidle');
   const state=await page.evaluate(()=>{const home=document.querySelector('.aperture-home');const bounds=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const image=el=>({src:el.currentSrc,nativeWidth:el.naturalWidth,nativeHeight:el.naturalHeight,bounds:bounds(el),filter:getComputedStyle(el).filter,fit:getComputedStyle(el).objectFit});return{sport:home.dataset.homeSport,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},docWidth:document.documentElement.scrollWidth,homeWidth:home.scrollWidth,scrollWidth:home.querySelector('.page-scroll').scrollWidth,clientWidth:home.querySelector('.page-scroll').clientWidth,motion:home.dataset.homeMotionState,theme:{left:getComputedStyle(home).getPropertyValue('--home-left'),right:getComputedStyle(home).getPropertyValue('--home-right')},brand:image(home.querySelector('.home-brand-mark')),logo:image(home.querySelector('[data-home-league-logo]')),scene:image(home.querySelector('[data-home-scene="'+home.dataset.homeSport+'"]')),gate:bounds(home.querySelector('.aperture-gate')),neonFrame:home.querySelector('.aperture-neon-frame')?bounds(home.querySelector('.aperture-neon-frame')):null,controls:[...home.querySelectorAll('.home-entry,.home-sport-option,.bottom-nav button')].map(el=>({label:el.innerText.trim(),bounds:bounds(el),visible:el.checkVisibility()}))}});
   state.requests=requests.slice(before);state.screenshot=output+'/'+sport+'-'+viewport.width+'x'+viewport.height+'-dpr3.png';await page.screenshot({path:state.screenshot});states.push(state);
  }
  const reclickStart=requests.length;for(const s of ['nfl','nba','nrl','ufc']){stage='second-'+s;await page.locator('[data-home-select="'+s+'"]').click();await page.waitForLoadState('networkidle');}await Promise.all(pending);
  const counts={};for(const r of requests)counts[r.url]=(counts[r.url]||0)+1;report.viewports.push({viewport,dpr:3,states,startupRequests:requests.slice(0,startupCount),startupScenes:requests.slice(0,startupCount).filter(r=>r.url.includes('gate-scenes')),secondCycleRequests:requests.slice(reclickStart),responses,duplicates:Object.entries(counts).filter(([u,n])=>n>1),externalRequests:requests.filter(r=>new URL(r.url).origin!==new URL(base).origin),failures,errors});await context.close();
 }
 report.base=base;
 report.browserVersion=browser.version();
 report.qualification={physicalIPhoneTested:false, screenshotsDuringNaturalMotion:true, localHTTP:new URL(base).protocol==='http:', bodyByteCountsAreUncompressed:true};
 report.runtimeHashes=hashes();
 assert.deepEqual(report.runtimeHashes,initialHashes,'Runtime changed during this audit');
 assert.ok(report.assetChecks.every(row=>row.unchanged),'A protected Home artwork file changed');
 for(const view of report.viewports){
  assert.equal(view.externalRequests.length,0,'No external runtime requests');
  assert.equal(view.failures.length,0,'No failed requests');
  assert.equal(view.errors.length,0,'No browser errors');
  assert.equal(view.duplicates.length,0,'No duplicate resource URLs');
  assert.equal(view.secondCycleRequests.length,0,'Repeat sport selection reuses loaded assets');
  assert.equal(view.startupScenes.length,1,'Only one scene loads on fresh Home');
  assert.ok(view.startupScenes[0].url.endsWith('gate-scenes-nfl.webp'));
  for(const state of view.states){
   assert.ok(state.docWidth<=state.viewport.width,'No horizontal document overflow');
   assert.equal(state.scrollWidth,state.clientWidth,'No horizontal Home overflow');
   for(const control of state.controls) assert.ok(control.bounds.x>=0 && control.bounds.right<=state.viewport.width+.5 && control.bounds.bottom<=state.viewport.height+.5,'Control clipped offscreen');
  }
 }
 report.status='passed';
 report.completedAt=new Date().toISOString();
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({capturedAt:report.capturedAt,assetsUnchanged:report.assetChecks.every(r=>r.unchanged),views:report.viewports.map(v=>({viewport:v.viewport,startupScenes:v.startupScenes,secondCycleRequests:v.secondCycleRequests,duplicates:v.duplicates,externalRequests:v.externalRequests,failures:v.failures,errors:v.errors,states:v.states.map(s=>({sport:s.sport,docWidth:s.docWidth,viewport:s.viewport,gate:s.gate,logo:s.logo,brand:s.brand,scene:s.scene,theme:s.theme,offscreenControls:s.controls.filter(c=>c.bounds.x<0||c.bounds.right>s.viewport.width+.5||c.bounds.bottom>s.viewport.height+.5)}))}))},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
