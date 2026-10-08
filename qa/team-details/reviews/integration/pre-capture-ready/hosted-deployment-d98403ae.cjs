'use strict';

// Genuine deployment verification after the separately completed full local QA.
// The reviewed provider-refresh scenarios remain frozen and run unchanged.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const refresh=require('./post-refresh.cjs');
const {ROOT,TEAM,SHA,launch,runtimeManifest,sourceData,ready,active,geometry,images,capture,scrollEvidence,fullContent,motion}=require('./qa.cjs');
const {eligibleGames}=require('./controls.cjs');
const HOME='.page[data-page="home"]';
const VIEWPORTS=[{width:393,height:852},{width:430,height:896},{width:1440,height:1000}];
const TEST_FILES=['qa/team-details/hosted-deployment.cjs','qa/team-details/post-refresh.cjs','qa/team-details/verify-source-equivalence.py','qa/team-details/controls.cjs','qa/team-details/qa.cjs','qa/nfl-dashboard/qa.cjs','qa/home-gate.cjs','qa/hosted-webkit.cjs'];
const testManifest=()=>Object.fromEntries(TEST_FILES.map(file=>[file,SHA(fs.readFileSync(path.join(ROOT,file)))]));
const reference=file=>({file:path.relative(ROOT,path.resolve(file)).split(path.sep).join('/'),sha256:SHA(fs.readFileSync(file))});
const load=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function save(file,value){const pending=file+'.next';fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n');fs.renameSync(pending,file);}
function listen(page,base){
  const errors={javascriptAndConsole:[],http:[],external:[],transport:[],cancelledNavigation:[]};
  page.on('pageerror',error=>errors.javascriptAndConsole.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.javascriptAndConsole.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.http.push({url:response.url(),status:response.status()});});
  page.on('request',request=>{const url=new URL(request.url());if(!['data:','blob:','about:'].includes(url.protocol)&&url.origin!==new URL(base).origin)errors.external.push(url.href);});
  page.on('requestfailed',request=>{const row={url:request.url(),message:request.failure()?.errorText};errors[['net::ERR_ABORTED','Load request cancelled'].includes(row.message)?'cancelledNavigation':'transport'].push(row);});
  return errors;
}
function clean(errors){for(const key of ['javascriptAndConsole','http','external','transport'])assert.deepEqual(errors[key],[],'No actual hosted '+key+' failures');}
async function homeGeometry(page){
  const result=await page.locator(HOME).evaluate(root=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},scroller=root.querySelector('.page-scroll'),nav=root.querySelector('.bottom-nav');
    return{viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,frame:rect(root),scroller:{clientWidth:scroller.clientWidth,scrollWidth:scroller.scrollWidth},nav:rect(nav),controls:[...root.querySelectorAll('[data-home-select],[data-home-entry],.bottom-nav button')].map(button=>{const r=rect(button),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:button.innerText,...r,disabled:button.disabled,hit:hit===button||button.contains(hit)};})};
  });
  assert.ok(result.documentWidth<=result.viewport.width+1&&result.scroller.scrollWidth<=result.scroller.clientWidth+1,'Home has no hosted horizontal overflow');
  for(const button of result.controls){assert.ok(button.width>=44&&button.height>=44,'Home retains usable44px controls');assert.ok(button.x>=result.frame.x-1&&button.right<=result.frame.right+1,'Home controls fit the compact frame');if(result.viewport.width<600){assert.ok(button.y>=0&&button.bottom<=result.viewport.height+1,'Phone Home control fits viewport');if(!button.disabled)assert.equal(button.hit,true,'Phone Home control is unobscured');}}
  return result;
}
async function homeClocks(page){return page.locator(HOME).evaluate(root=>{
  const nodes=[...root.querySelectorAll('*')],clip=root.getBoundingClientRect();
  return{state:root.dataset.homeMotionState,reason:root.dataset.homeMotionReason,clocks:root.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity).map(a=>{const target=a.effect.target,r=target.getBoundingClientRect(),style=getComputedStyle(target);return{name:a.animationName,index:nodes.indexOf(target),pseudo:a.effect.pseudoElement||null,state:a.playState,time:a.currentTime,visible:root.classList.contains('active')&&style.display!=='none'&&style.visibility!=='hidden'&&Math.min(r.right,clip.right,innerWidth)>Math.max(r.x,clip.x,0)&&Math.min(r.bottom,clip.bottom,innerHeight)>Math.max(r.y,clip.y,0)};})};
});}
async function homeMotion(page,base){
  await page.bringToFront();await page.screenshot({animations:'allow'});const first=await homeClocks(page),paint=await page.screenshot({animations:'allow'});await page.waitForTimeout(420);const laterPaint=await page.screenshot({animations:'allow'}),second=await homeClocks(page);
  const key=a=>[a.index,a.name,a.pseudo].join(':'),before=new Map(first.clocks.map(a=>[key(a),a])),visible=second.clocks.filter(a=>a.state==='running'&&a.visible);assert.ok(visible.length>0,'Actual hosted Home has naturally running foreground lighting');for(const clock of visible)assert.ok(before.has(key(clock))&&clock.time>before.get(key(clock)).time+1,'Actual Home native clock advances without seeking');assert.notEqual(SHA(paint),SHA(laterPaint),'Actual hosted Home paint changes naturally');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(220);const reduced=await homeClocks(page);assert.equal(reduced.clocks.filter(a=>a.state==='running').length,0,'Hosted reduced-motion suppresses all infinite Home clocks');await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(220);
  await page.goto(base+'#nfl',{waitUntil:'networkidle'});await ready(page,false);await active(page,'nfl');const inactive=await homeClocks(page);assert.equal(inactive.clocks.filter(a=>a.state==='running').length,0,'Hosted inactive Home stops its decorative clocks');await page.goto(base+'#home',{waitUntil:'networkidle'});await active(page,'home');
  return{first,second,visibleAdvancingClocks:visible.length,paint:{sha256:SHA(paint),laterSha256:SHA(laterPaint),actualNaturalPixelChange:true},reduced,inactive,qualification:'Genuine native clocks and unpaused paint; no seeking, CSS injection, virtual clocks, response substitution or physical-iPhone FPS claim.'};
}
async function extras(page,base,viewport,data,out,checkpoint){
  const mobile=viewport.width<600,result={viewport,mobile,status:'running',startedAt:new Date().toISOString(),nativeActions:[],homeSports:[]};
  const action=async(locator,label)=>{assert.equal(await locator.count(),1,'Unique actual hosted control: '+label);await locator.scrollIntoViewIfNeeded();assert.equal(await locator.isEnabled(),true,'Enabled hosted control: '+label);if(mobile)await locator.tap();else await locator.click();result.nativeActions.push({label,input:mobile?'native-touch':'pointer',url:page.url()});};
  const dataset=async()=>{assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current,'Actual hosted current source matches release');assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),data.teamForm,'Actual hosted team source matches release');};
  try{
    assert.equal((await page.goto(base+'#home',{waitUntil:'networkidle'})).status(),200);await ready(page,false);await active(page,'home');
    for(const sport of ['nfl','nba','nrl','ufc']){
      await action(page.locator(`[data-home-select="${sport}"]`),'Select '+sport.toUpperCase());await page.waitForFunction(value=>document.querySelector('[data-page="home"]').dataset.homeSport===value,sport);
      const state=await page.locator(HOME).evaluate(root=>{const style=getComputedStyle(root),entry=root.querySelector('[data-home-entry]');return{sport:root.dataset.homeSport,selected:[...root.querySelectorAll('[data-home-select][aria-pressed="true"]')].map(button=>button.dataset.homeSelect),left:style.getPropertyValue('--home-left').trim(),right:style.getPropertyValue('--home-right').trim(),entryDisabled:entry.disabled,entryText:entry.innerText,teamsLabel:root.querySelector('[data-home-teams-label]').innerText,logoAlt:root.querySelector('[data-home-league-logo]').alt,text:root.innerText};});
      assert.equal(state.sport,sport);assert.deepEqual(state.selected,[sport]);assert.equal(state.entryDisabled,sport!=='nfl');assert.match(state.entryText,sport==='nfl'?/ENTER NFL/:new RegExp(sport.toUpperCase()+'.*COMING SOON'));assert.equal(state.teamsLabel,sport==='ufc'?'Fighters':'Teams');assert.match(state.logoAlt,new RegExp('^'+sport+'\\b','i'));assert.doesNotMatch(state.text,/preview\s+only/i);
      const channels=colour=>{assert.match(colour,/^#[a-f0-9]{6}$/i);return[colour.slice(1,3),colour.slice(3,5),colour.slice(5,7)].map(value=>parseInt(value,16));},left=channels(state.left),right=channels(state.right);
      if(sport==='nba')assert.ok(left[2]>left[0]&&right[0]>right[2],'Hosted NBA palette is blue left/red right');else{assert.equal(state.left,state.right,'Whole-panel sport palette remains coherent');const channel=sport==='nfl'?2:sport==='nrl'?1:0;assert.ok(left[channel]>Math.max(...left.filter((_,index)=>index!==channel)),'Hosted sport has its approved primary hue');}
      const item={sport,state,geometry:await homeGeometry(page),images:await images(page),capture:await capture(page,out,`home-${sport}-${viewport.width}x${viewport.height}-hosted`)};result.homeSports.push(item);await checkpoint('home-'+sport,result);
      if(sport!=='nfl'){const before=page.url();await action(page.locator(HOME+' .bottom-nav [data-open="nfl"]'),sport.toUpperCase()+' coming-soon Teams/Fighters guard');await active(page,'home');assert.equal(page.url(),before,'Coming-soon sport cannot enter NFL');const message=await page.locator('.home-availability').innerText();assert.match(message,new RegExp(sport,'i'));assert.match(message,/coming soon/i);item.comingSoonGuard={sameRoute:true,message};await page.keyboard.press('Escape');}
    }
    await action(page.locator('[data-home-select="nfl"]'),'Restore NFL');result.homeDiamondCapture=result.homeSports.find(item=>item.sport==='nfl').capture;result.homeMotion=await homeMotion(page,base);await checkpoint('home-motion',result);
    await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page);await dataset();result.initialGeometry=await geometry(page);result.images=await images(page);const label=`team-${viewport.width}x${viewport.height}`;result.scroll=await scrollEvidence(page,out,label);result.fullContent=await fullContent(page,out,label);await checkpoint('team-captured',result);
    await action(page.locator(TEAM+' [data-td-action="venues"]'),'Home/Away/Neutral destination');const dialog=page.locator('#team-details-dialog');await dialog.waitFor({state:'visible'});assert.equal(await dialog.getAttribute('data-view'),'venues');
    const rows=await dialog.locator('table').first().locator('tbody tr').evaluateAll(elements=>elements.map(element=>[...element.querySelectorAll('th,td')].map(cell=>cell.textContent.trim())));assert.equal(rows.length,4,'Venue destination includes Home/Away/Neutral/Unknown');
    const venue=game=>game.neutral===true?'neutral':game.neutral===null||game.neutral===undefined?'unknown':game.home_team==='DAL'?'home':'away',seasonGames=data.teamForm.teams.DAL.games.filter(game=>game.status==='final'&&game.season===data.teamForm.season),expected=[];
    for(const[index,kind]of ['home','away','neutral','unknown'].entries()){const games=seasonGames.filter(game=>venue(game)===kind),record={w:0,l:0,t:0};for(const game of games){const own=game.home_team==='DAL'?game.home_score:game.away_score,other=game.home_team==='DAL'?game.away_score:game.home_score;assert.ok(Number.isFinite(own)&&Number.isFinite(other),'Final venue scores are actual source numbers');record[own>other?'w':own<other?'l':'t']++;}const text=record.w+'-'+record.l+(record.t?'-'+record.t:'');assert.equal(rows[index][0],kind.toUpperCase());assert.equal(Number(rows[index][1]),games.length);assert.equal(rows[index][2].replace(/[–−]/g,'-'),text);expected.push({venue:kind,games:games.length,record:text});}
    await action(dialog.locator('[data-td-venue="home"]'),'Apply Home venue form');await dialog.waitFor({state:'hidden'});const state=await page.evaluate(()=>window.PDTeamDetails.getState());assert.equal(state.venue,'home');assert.equal(await page.locator('#team-venue-select').inputValue(),'home');assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getSelectedGames().map(game=>game.id)),eligibleGames(data.teamForm.teams.DAL,data.teamForm.season,state).map(game=>game.id));assert.equal(await page.locator('#team-venue-select').evaluate(element=>element===document.activeElement),true,'Applied venue returns native focus to its exact filter');result.venueDestination={rows,expected,appliedVenue:state.venue,focusRestored:true};await geometry(page);await images(page);await checkpoint('venue-destination',result);
    await page.goto(base+'#team/DAL',{waitUntil:'networkidle'});await ready(page);await active(page);result.motion=await motion(page,base);await checkpoint('team-motion',result);await page.reload({waitUntil:'networkidle'});await ready(page);await active(page);await dataset();result.directLoadReload=true;result.finalGeometry=await geometry(page);result.finalImages=await images(page);result.finalCapture=await capture(page,out,label+'-final');result.completedAt=new Date().toISOString();result.status='passed';return result;
  }catch(error){error.auditEvidence=result;throw error;}
}
async function servedRuntime(browser,base,manifest){
  const context=await browser.newContext(),page=await context.newPage(),errors=listen(page,base);
  try{
    assert.equal((await page.goto(base,{waitUntil:'networkidle'})).status(),200);
    const rows=await page.evaluate(async files=>{const results=[];for(let index=0;index<files.length;index+=6)results.push(...await Promise.all(files.slice(index,index+6).map(async file=>{const response=await fetch(file,{cache:'no-store'}),bytes=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return{file,url:response.url,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('')};})));return results;},Object.keys(manifest));
    assert.equal(rows.length,231);assert.deepEqual(rows.map(row=>row.file).sort(),Object.keys(manifest).sort());for(const row of rows){assert.equal(row.status,200,'Actual hosted runtime HTTP200: '+row.file);assert.equal(row.sha256,manifest[row.file],'Actual hosted runtime exact reviewed bytes: '+row.file);assert.equal(new URL(row.url).origin,new URL(base).origin,'Hosted runtime remains same-origin');}clean(errors);return{status:'passed',rows,errors,qualification:'Every231 actual served response body was hashed in the genuine strict-TLS browser; no response interception or substitutes.'};
  }finally{await context.close();}
}
async function run(options){
  assert.ok(['chromium','webkit'].includes(options.engine));assert.equal(options.base,'https://dinkyjunior.github.io/project-dollers/','Verify the exact user-approved production URL');assert.ok(options.output,'A fresh output directory is required');const out=path.resolve(options.output);assert.equal(fs.existsSync(out),false,'Previous evidence is immutable');fs.mkdirSync(out,{recursive:true});
  const bound=refresh.transition(options),data=sourceData(),tests=testManifest(),report={status:'running',engine:options.engine,hosted:true,base:options.base,startedAt:new Date().toISOString(),source:{...bound.evidence,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),runtimeFiles:bound.current,testFiles:tests,currentHash:SHA(fs.readFileSync(ROOT+'/assets/data/current.json')),teamFormHash:SHA(fs.readFileSync(ROOT+'/assets/data/team-details.json'))},qualification:{scope:'Targeted actual deployment verification; separately completed full local Chromium/WebKit audits remain mandatory. This does not claim the full312-action/83-disclosure suite was repeated on the host.',genuineBrowser:true,strictTLS:true,deviceScaleFactor:2,physicalIPhone:false,noSiteOrSourceDataSubstitution:true,originalReferenceBytesAvailable:false,reference:'User-approved Dallas Form chat attachment; all visual auditors are AI agents.'},providerRefreshReports:[],results:[]};
  const write=()=>save(path.join(out,'results.json'),report);write();let browser;
  try{
    for(const viewport of [null,'1440x1000']){
      const childOut=path.join(out,viewport?'provider-refresh-desktop':'provider-refresh-phones'),child=await refresh.run({...options,output:childOut,viewport});assert.equal(child.status,'passed','Reviewed genuine provider-refresh scenarios complete');assert.equal(child.unchangedDuringQA,true);assert.equal(child.testLogicUnchangedDuringQA,true);assert.deepEqual(child.source.runtimeFiles,bound.current);const evidence=reference(path.join(childOut,'results.json'));report.providerRefreshReports.push({...evidence,viewports:child.results.map(result=>result.viewport),status:child.status,completedAt:child.completedAt});write();
    }
    browser=await launch(options.engine,true);report.browserVersion=browser.version();
    for(const viewport of VIEWPORTS){
      const mobile=viewport.width<600,context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,timezoneId:'Australia/Sydney'}),page=await context.newPage(),errors=listen(page,options.base),initial={viewport,status:'running',phase:'starting',startedAt:new Date().toISOString()};report.results.push(initial);write();
      try{const result=await extras(page,options.base,viewport,data,out,async(phase,evidence)=>{Object.assign(initial,evidence,{phase,checkpointAt:new Date().toISOString()});write();console.log(`Hosted ${options.engine} ${viewport.width} ${phase}`);});Object.assign(initial,result);clean(errors);initial.errors=errors;initial.phase='scenario-complete';}
      catch(error){Object.assign(initial,error.auditEvidence||{},{status:'failed',failure:{message:error.message,stack:error.stack},errors});try{initial.failureCapture=await capture(page,out,'failure-'+viewport.width);}catch(captureError){initial.captureError=captureError.message;}}
      finally{await context.close();write();}
    }
    report.servedRuntime=await servedRuntime(browser,options.base,bound.current);write();assert.deepEqual(runtimeManifest(),bound.current,'Reviewed local runtime stays unchanged through hosted QA');report.unchangedDuringQA=true;assert.deepEqual(testManifest(),tests,'Every actual hosted assertion/helper remains unchanged');report.testLogicUnchangedDuringQA=true;
    for(const reference of report.providerRefreshReports)assert.equal(SHA(fs.readFileSync(path.join(ROOT,reference.file))),reference.sha256,'Reviewed provider-refresh child receipt remains immutable');report.status=report.results.every(result=>result.status==='passed')?'passed':'failed';
  }catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};}
  finally{if(browser)await browser.close();report.completedAt=new Date().toISOString();write();console.log(path.join(out,'results.json'));}return report;
}
module.exports={run,homeGeometry,homeClocks,homeMotion,extras,servedRuntime};
if(require.main===module){const args=process.argv.slice(2),get=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];},options={engine:get('--engine')||'webkit',output:get('--output'),base:get('--base'),originalManifest:get('--original-manifest'),originalFreeze:get('--original-freeze'),classification:get('--classification'),classificationFreeze:get('--classification-freeze'),manifest:get('--manifest'),freeze:get('--freeze')};for(const name of ['output','base','originalManifest','originalFreeze','classification','classificationFreeze','manifest','freeze'])assert.ok(options[name]&&!options[name].startsWith('--'),'Required '+name);run(options).then(report=>{process.exitCode=report.status==='passed'?0:1;},error=>{console.error(error.stack);process.exitCode=1;});}
