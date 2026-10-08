'use strict';

// Acceptance delta for an independently audited, metadata-only provider refresh.
// This deliberately does not modify or repeat the frozen full interaction suite.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {ROOT,TEAM,SHA,WAIT,launch,runtimeManifest,freePort,ready,active,geometry,images,capture}=require('./qa.cjs');
const legacy=require('../nfl-dashboard/qa.cjs');
const {eligibleGames,derivedMetrics,numericText}=require('./controls.cjs');
const ALLOWED=['assets/data/current.json','assets/data/player-history.json','assets/data/provenance.json'];
const VIEWPORTS={'393x852':{width:393,height:852},'430x896':{width:430,height:896},'1440x1000':{width:1440,height:1000}};
function selectedViewports(value){
  if(value===null||value===undefined)return[VIEWPORTS['393x852'],VIEWPORTS['430x896']];
  assert.ok(Object.hasOwn(VIEWPORTS,value),'Explicit viewport must be393x852,430x896 or1440x1000');
  return[VIEWPORTS[value]];
}
const timestamps=new Set(['generatedAt','retrievedAt','scheduleRetrievedAt','checkedAt','refreshAfter']);
const hashes=new Set(['sha256','primaryRosterSha256','snapshotSha256CanonicalJson','playerHistorySha256']);
const validators=new Set(['etag','lastModified','bytes']);
const jsonType=x=>x===null?'null':Array.isArray(x)?'array':typeof x;
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const norm=s=>String(s).replace(/[–−]/g,'-').replace(/\s+/g,' ').trim();

function metadataCategory(parts,before,after){
  const key=parts.at(-1);
  if(timestamps.has(key)&&typeof before==='string'&&typeof after==='string'&&Number.isFinite(Date.parse(before))&&Number.isFinite(Date.parse(after)))return 'metadata-timestamp';
  if((hashes.has(key)||parts.includes('sourceHashes')||parts.includes('currentSourceHashes'))&&typeof before==='string'&&typeof after==='string'&&/^[a-f0-9]{64}$/.test(before)&&/^[a-f0-9]{64}$/.test(after))return 'metadata-content-hash';
  if(validators.has(key)){
    if(key==='bytes'&&Number.isInteger(before)&&Number.isInteger(after)&&before>=0&&after>=0)return 'metadata-source-validator';
    if(key!=='bytes'&&typeof before==='string'&&typeof after==='string')return 'metadata-source-validator';
  }
  return null;
}
function walk(before,after,parts,changes){
  assert.equal(jsonType(after),jsonType(before),'Metadata refresh cannot change JSON types: '+parts.join('/'));
  if(Array.isArray(before)){
    assert.equal(after.length,before.length,'Metadata refresh cannot change array length: '+parts.join('/'));
    before.forEach((value,index)=>walk(value,after[index],[...parts,String(index)],changes));return;
  }
  if(before&&typeof before==='object'){
    assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort(),'Metadata refresh cannot change keys: '+parts.join('/'));
    Object.keys(before).sort().forEach(key=>walk(before[key],after[key],[...parts,key],changes));return;
  }
  if(Object.is(before,after))return;
  const category=metadataCategory(parts,before,after);
  assert.ok(category,'Unexpected factual or unclassified JSON change: '+parts.join('/'));
  changes.push({path:parts.join('/'),kind:'value',category,before,after});
}
function transition(options){
  const originalBytes=fs.readFileSync(options.originalManifest),currentBytes=fs.readFileSync(options.manifest),classificationBytes=fs.readFileSync(options.classification);
  assert.equal(SHA(originalBytes),options.originalFreeze,'Prior manifest must be the accepted raw manifest');
  assert.equal(SHA(currentBytes),options.freeze,'Current manifest must match its explicit raw hash');
  if(options.classificationFreeze)assert.equal(SHA(classificationBytes),options.classificationFreeze,'Classification is bound to the reviewed raw report');
  const original=JSON.parse(originalBytes),current=JSON.parse(currentBytes),audit=JSON.parse(classificationBytes);
  assert.equal(Object.keys(original).length,231,'Original approval binds all 231 runtime files');
  assert.deepEqual(Object.keys(current).sort(),Object.keys(original).sort(),'Runtime file set is preserved');
  const changed=Object.keys(current).filter(file=>current[file]!==original[file]).sort();
  assert.deepEqual(changed,ALLOWED.slice().sort(),'Exactly the three audited provider metadata JSON files may differ');
  assert.deepEqual(runtimeManifest(),current,'Actual workspace is the explicitly bound current implementation');
  assert.equal(audit.status,'passed','Metadata classification must pass before the narrowed acceptance scope is valid');
  assert.equal(audit.footballValueChanges,0,'Classifier reports zero changed football facts');
  assert.equal(audit.typeKeyAndArrayShapeChanges,0,'Classifier reports zero changed types, keys or array shape');
  assert.deepEqual(audit.files.map(file=>file.path).sort(),changed,'Classifier enumerates exactly the changed files');
  assert.equal(audit.DallasConsistency?.recordMatches,true,'Dallas ladder and detail records remain consistent');
  assert.equal(audit.DallasConsistency?.gamesSourceHashMatches,true,'Dallas detail source remains consistent with current refresh');
  assert.equal(audit.RosterImpact?.samePlayerIdentitySet,true,'Existing roster identities remain unchanged');
  assert.equal(audit.RosterImpact?.footballFactsChanged,false,'Existing roster football values remain unchanged');
  assert.match(audit.baselineCommit,/^[a-f0-9]{40}$/,'An accessible exact baseline commit is required');
  const changes=[],byFile=[];
  for(const file of changed){
    const evidence=audit.files.find(item=>item.path===file),beforeBytes=execFileSync('git',['show',`${audit.baselineCommit}:${file}`],{cwd:ROOT,maxBuffer:20*1024*1024}),afterBytes=fs.readFileSync(path.join(ROOT,file));
    assert.equal(SHA(beforeBytes),original[file],'Baseline git JSON matches the accepted original file: '+file);
    assert.equal(evidence.beforeSha256,original[file],'Classification links the accepted original checksum: '+file);
    assert.equal(SHA(afterBytes),current[file],'Actual refreshed JSON matches current manifest: '+file);
    assert.equal(evidence.afterSha256,current[file],'Classification links current checksum: '+file);
    const count=changes.length;walk(JSON.parse(beforeBytes),JSON.parse(afterBytes),[file],changes);
    byFile.push({file,beforeSha256:original[file],afterSha256:current[file],metadataLeaves:changes.length-count});
  }
  const ordered=items=>items.slice().sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(ordered(changes),ordered(audit.allChanges),'Independent recursive diff equals every classified changed leaf');
  assert.equal(changes.length,audit.leafChangeCount,'Independent changed-leaf count equals the classification');
  const counts={};for(const change of changes)counts[change.category]=(counts[change.category]||0)+1;
  assert.deepEqual(counts,audit.categories,'Independent metadata categories equal classification totals');
  assert.deepEqual(audit.changeKinds,{value:changes.length},'Every change is a classified scalar value change');
  return {original,current,audit,evidence:{originalManifestSha256:SHA(originalBytes),currentManifestSha256:SHA(currentBytes),classificationSha256:SHA(classificationBytes),baselineCommit:audit.baselineCommit,incomingCommit:audit.incomingCommit,changedFiles:byFile,unchangedRuntimeFiles:231-changed.length,independentlyVerifiedMetadataLeaves:changes.length,categories:counts,footballValueChanges:0,typeKeyAndArrayShapeChanges:0}};
}
async function exactFetch(page,base,file,manifest){
  const result=await page.evaluate(async url=>{const response=await fetch(url,{cache:'no-store'}),bytes=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return{url:response.url,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')};},new URL(file,base).href);
  assert.equal(result.status,200,'Actual same-origin source file returns HTTP 200: '+file);assert.equal(result.sha256,manifest[file],'Actual source body exactly matches current manifest: '+file);return result;
}
async function responseBytes(response,file,manifest){
  assert.ok([200,304].includes(response.status()),'Actual native refresh performs successful HTTP validation');await response.finished();
  const result={url:response.url(),httpStatus:response.status()};
  if(response.status()===200){const body=await response.body();result.responseBytes=body.length;result.sha256=SHA(body);assert.equal(result.sha256,manifest[file],'Actual native refresh body matches manifest');}
  return result;
}
async function noOverflow(page,selector='.page.active'){
  const result=await page.locator(selector).evaluate(element=>{const b=element.getBoundingClientRect(),s=element.querySelector('.page-scroll')||element;return{documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,x:b.x,right:b.right,width:b.width,clientWidth:s.clientWidth,scrollWidth:s.scrollWidth};});
  assert.ok(result.documentWidth<=result.viewport+1,'No horizontal document overflow');assert.ok(result.x>=-1&&result.right<=result.viewport+1,'Active screen or dialog fits viewport');assert.ok(result.scrollWidth<=result.clientWidth+1,'Active content fits without horizontal scrolling');return result;
}
async function scenario(page,base,viewport,data,manifest,out){
  const mobile=viewport.width<600,result={viewport,mobile,nativeInputMode:mobile?'touch':'pointer',status:'running',nativeActions:[],sourceBodies:[],tabs:[]},team=data.teamForm.teams.DAL;
  const tap=async(locator,label)=>{assert.equal(await locator.count(),1,'Unique native control: '+label);await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();result.nativeActions.push(label);};
  const close=async()=>{await tap(page.locator('#team-details-dialog .dialog-close'),'Close team dialog');await page.locator('#team-details-dialog').waitFor({state:'hidden'});};
  const open=async(action,selector)=>{await tap(page.locator(selector||`${TEAM} [data-td-action="${action}"]:visible`).first(),action+' destination');await page.locator('#team-details-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#team-details-dialog').getAttribute('data-view'),action,'Native destination matches its action');await noOverflow(page,'#team-details-dialog');return await page.locator('#team-details-dialog-content').innerText();};
  const dataset=async()=>{assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current,'Actual current dataset matches refreshed JSON');assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getDataset()),data.teamForm,'Existing complete team dataset remains unchanged');};
  const select=async(kind,value)=>{const locator=page.locator('#team-'+kind+'-select');await locator.scrollIntoViewIfNeeded();await locator.focus();await locator.selectOption(value);result.nativeActions.push('Select '+kind+'='+value);};
  const tab=async(name)=>{await tap(page.locator(`${TEAM} [data-team-tab="${name}"]`),name+' tab');assert.equal(await page.locator(`${TEAM} [data-team-tab="${name}"]`).getAttribute('aria-selected'),'true');assert.equal(await page.locator(`#team-panel-${name}`).isVisible(),true);result.tabs.push({tab:name,geometry:await geometry(page),images:await images(page)});};
  const retained=async selection=>{for(const [key,value]of Object.entries(selection))assert.equal(String(await page.evaluate(k=>window.PDTeamDetails.getState()[k],key)),String(value),'Selected '+key+' context is retained');assert.deepEqual(await page.evaluate(()=>window.PDTeamDetails.getSelectedGames().map(game=>String(game.id))),eligibleGames(team,data.teamForm.season,selection).map(game=>String(game.id)),'Selected events retain their independently derived source context');};

  try {
  assert.equal((await page.goto(base+'#team/DAL',{waitUntil:'networkidle'})).status(),200);await ready(page);await active(page);await dataset();result.directGeometry=await geometry(page);await images(page);
  if(!mobile)assert.ok(result.directGeometry.page.width<=400.5,'Desktop preserves the compact400px application frame');
  result.sourceBodies.push(await exactFetch(page,base,'assets/data/current.json',manifest),await exactFetch(page,base,'assets/data/team-details.json',manifest));
  await page.reload({waitUntil:'networkidle'});await ready(page);await active(page);await dataset();result.directReload=true;
  await tap(page.locator(`${TEAM} .bottom-nav [data-open="home"]`),'Team → Home');await active(page,'home');await images(page);await noOverflow(page);result.homeCapture=await capture(page,out,`home-${viewport.width}x${viewport.height}-metadata-refreshed`);
  await tap(page.locator('[data-home-select="nfl"]'),'Select NFL');await tap(page.locator('[data-home-entry]'),'Enter NFL');await active(page,'nfl');await images(page);await noOverflow(page);
  await tap(page.locator('[data-conference="NFC"]'),'NFL NFC ladder');const all=page.locator('.page.active [data-standings-toggle]');if(await all.getAttribute('aria-expanded')!=='true')await tap(all,'Show all NFC clubs');
  const dallas=page.locator('[data-nfl-action="team"][data-team="DAL"]');if(await dallas.getAttribute('aria-expanded')!=='true')await tap(dallas,'Expand Dallas ladder record');await tap(page.locator('[data-nfl-action="team-details"][data-team="DAL"]'),'Open Dallas Team details');await active(page);await ready(page);await dataset();result.homeLadderTeamRoundTrip=true;

  const matchup=await open('matchup',`${TEAM} .td-upcoming [data-td-action="matchup"]`),matchupId=await page.locator('#team-details-dialog').getAttribute('data-game'),fixture=team.games.find(game=>game.id===matchupId);
  assert.ok(fixture&&fixture.status==='scheduled','Upcoming CTA opens its exact verified scheduled fixture');assert.ok(matchup.includes(String(fixture.season))&&norm(matchup).includes('WEEK '+fixture.week),'Upcoming destination retains season and week');result.upcomingMatchup={event:matchupId,season:fixture.season,week:fixture.week,content:matchup};await close();

  const selection={window:10,season:'current',venue:'home'};for(const[k,v]of Object.entries(selection))await select(k,String(v));await retained(selection);
  for(const name of['players','lineup','form']){await tab(name);await retained(selection);}
  await tap(page.locator(`${TEAM} [data-td-mode="total"]`),'Totals');const sums=derivedMetrics(team,eligibleGames(team,data.teamForm.season,selection),'total');
  result.aggregate=[];for(const metric of['netPassing','rushing','totalOffense'])for(const side of['gained','allowed']){const text=await page.locator(`${TEAM} [data-td-stat="${metric}"][data-td-side="${side}"]`).innerText(),value=sums.yards[metric][side].value;assert.equal(numericText(text),value,'Refreshed selection total agrees with actual source');result.aggregate.push({metric,side,text,value});}
  const game=eligibleGames(team,data.teamForm.season,selection)[0];assert.ok(game,'Selected actual home finals exist');const row=page.locator(`${TEAM} [data-team-game="${game.id}"]`);if(await row.getAttribute('aria-expanded')!=='true')await tap(row,'Expand actual game '+game.id);
  const report=await open('report',`${TEAM} [data-td-action="report"][data-game="${game.id}"]`);assert.equal(await page.locator('#team-details-dialog').getAttribute('data-game'),game.id);assert.ok(report.includes(String(game.season)),'Report preserves event season');
  const opponent=game.home_team==='DAL'?game.away_team:game.home_team,fields=['netPassing','rushing','totalOffense','thirdDownMade','thirdDownAttempts','redZoneTD','redZoneAttempts','turnovers','penaltyYards'],rows=await page.locator('#team-details-dialog .td-report-table tbody tr').evaluateAll(elements=>elements.map(element=>[...element.querySelectorAll('th,td')].map(cell=>cell.textContent.trim())));assert.equal(rows.length,9);
  fields.forEach((field,index)=>['DAL',opponent].forEach((abbr,side)=>assert.equal(numericText(rows[index][side+1]),game.stats?.[abbr]?.[field]??null,'Event report metric matches source')));result.report={event:game.id,season:game.season,week:game.week,rows};await close();
  await open('schedule');const scheduled=await page.locator('#team-details-dialog [data-game]').evaluateAll(elements=>elements.map(element=>element.dataset.game));assert.equal(scheduled.length,team.games.filter(game=>game.season===data.teamForm.season).length,'Schedule retains every source season event');result.scheduleEvents=scheduled;await close();
  const content=await open('sources',`${TEAM} .td-footer [data-td-action="sources"]`),links=await page.locator('#team-details-dialog a[href]').evaluateAll(elements=>elements.map(element=>({url:element.href,target:element.target,rel:element.rel})));
  assert.deepEqual(links.map(link=>link.url),data.teamForm.sources.map(source=>source.url),'Actual Sources URLs remain exact dataset sources');for(const link of links){assert.equal(link.target,'_blank');assert.ok(link.rel.includes('noopener')&&link.rel.includes('noreferrer'));}
  const teamTime=await page.evaluate(t=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(t)),data.teamForm.retrievedAt);
  assert.ok(content.includes(String(data.teamForm.season))&&content.includes('retrieved '+teamTime),'Sources retain exact season and retrieval context');for(const issue of data.teamForm.disagreements||[])assert.ok(content.includes(issue.issue),'Source disagreement remains explicit');result.teamSources={content,links,sourceRetrievedAt:data.teamForm.retrievedAt,formattedSourceTime:teamTime};await close();
  await page.waitForFunction(()=>document.querySelector('.page.active [data-td-action="refresh"]')?.getAttribute('aria-busy')!=='true');
  const domProbe=await page.evaluateHandle(()=>{const root=document.querySelector('.page.active'),selectors=['.td-hero','#team-window-select','#team-season-select','#team-venue-select','[data-team-game]','[data-td-action="refresh"]'],nodes=selectors.map(selector=>({selector,node:root.querySelector(selector)})),events=[];const listener=event=>events.push({changed:event.detail?.changed,recovered:event.detail?.recovered});document.addEventListener('pd:team-data-ready',listener);return{nodes,events,listener};});
  try {
  const teamResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/assets/data/team-details.json')&&response.request().method()==='GET');await page.locator(`${TEAM} [data-td-action="refresh"]`).focus();await tap(page.locator(`${TEAM} [data-td-action="refresh"]`),'Native team refresh');result.teamRefresh=await responseBytes(await teamResponse,'assets/data/team-details.json',manifest);
  await page.waitForFunction(()=>document.querySelector('.page.active [data-td-action="refresh"]')?.getAttribute('aria-busy')==='false');assert.equal(await page.locator(`${TEAM} [data-td-action="refresh"]`).evaluate(element=>element===document.activeElement),true,'Actual team refresh retains focused control');await dataset();await retained(selection);assert.equal(await page.locator(`${TEAM} [data-td-mode="total"]`).getAttribute('aria-pressed'),'true','Actual refresh retains aggregate mode');result.teamRefresh.exactRevalidation=await exactFetch(page,base,'assets/data/team-details.json',manifest);result.teamRefresh.filterContextRetained=true;
  result.teamRefresh.domIdentity=await domProbe.evaluate(probe=>({nodes:probe.nodes.map(({selector,node})=>({selector,exists:!!node,connected:!!node?.isConnected,same:document.querySelector('.page.active').querySelector(selector)===node})),events:probe.events}));for(const node of result.teamRefresh.domIdentity.nodes)assert.ok(node.exists&&node.connected&&node.same,'Successful identical refresh preserves actual DOM identity: '+node.selector);assert.equal(result.teamRefresh.domIdentity.events.length,1);assert.equal(result.teamRefresh.domIdentity.events[0].changed,false);
  }finally{await domProbe.evaluate(probe=>document.removeEventListener('pd:team-data-ready',probe.listener));await domProbe.dispose();}
  result.afterTeamRefreshGeometry=await geometry(page);await images(page);await page.locator(`${TEAM} .page-scroll`).evaluate(element=>element.scrollTop=0);result.teamCapture=await capture(page,out,`team-${viewport.width}x${viewport.height}-metadata-refreshed`);

  await page.goto(base+'#team/PIT',{waitUntil:'networkidle'});await ready(page);await active(page);await tap(page.locator('.page.active [data-team-tab="players"]'),'PIT Players tab');await tap(page.locator('.page.active [data-open="steelers"]'),'Existing Steelers research');await active(page,'steelers');assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current);
  await tap(page.locator('[data-filter="QB"]'),'Existing QB filter');const player=page.locator('#roster [data-player]').first(),playerId=await player.getAttribute('data-player');await tap(player,'Existing quarterback research');const detail=page.locator(`#player-detail-${playerId}[data-player-history-state="ready"]`);await detail.waitFor({state:'visible'});
  assert.equal(data.current.playerHistory.sha256,manifest['assets/data/player-history.json'],'Current feed links the exact refreshed player history checksum');const history=load(ROOT+'/assets/data/player-history.json');assert.ok(history.players[playerId],'Actual selected research player exists in linked source');result.sourceBodies.push(await exactFetch(page,base,'assets/data/player-history.json',manifest),await exactFetch(page,base,'assets/data/provenance.json',manifest));
  for(const mode of['opponent','recent']){await tap(detail.locator(`[data-history-mode="${mode}"]`),'Existing history '+mode);assert.equal(await detail.locator(`[data-history-mode="${mode}"]`).getAttribute('aria-pressed'),'true');await noOverflow(page);}
  result.steelersBridge={playerId,playerName:data.current.roster.find(player=>player.id===playerId)?.name,historyStatus:await detail.getAttribute('data-player-history-state'),historySha256:data.current.playerHistory.sha256,retrievedAt:data.current.playerHistory.retrievedAt};await images(page);

  await page.goto(base+'#nfl',{waitUntil:'networkidle'});await ready(page,false);await active(page,'nfl');await page.waitForFunction(()=>window.PD_UPDATE_STATUS&&window.PD_UPDATE_STATUS.state!=='checking');const old=await page.evaluate(()=>window.PD_UPDATE_STATUS),currentResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/assets/data/current.json')&&response.request().method()==='GET');const refresh=page.locator(legacy.NFL+' [data-refresh]');await refresh.focus();await tap(refresh,'Native existing current-data refresh');result.currentRefresh=await responseBytes(await currentResponse,'assets/data/current.json',manifest);
  await page.waitForFunction(previous=>window.PD_UPDATE_STATUS?.reason==='manual'&&['unchanged','updated'].includes(window.PD_UPDATE_STATUS.state)&&window.PD_UPDATE_STATUS.lastCheckedAt!==previous,old.lastCheckedAt);assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current);assert.equal(await refresh.evaluate(element=>element===document.activeElement),true,'Existing manual refresh retains focus');const status=await page.evaluate(()=>window.PD_UPDATE_STATUS);assert.equal(status.sourceRetrievedAt,data.current.retrievedAt);result.currentRefresh.status=status;result.currentRefresh.exactRevalidation=await exactFetch(page,base,'assets/data/current.json',manifest);
  await tap(page.locator(legacy.NFL+' #data-status [data-sources]'),'Existing refreshed Sources');await page.locator('#sources-dialog').waitFor({state:'visible'});const retrieved=await page.evaluate(t=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}),data.current.retrievedAt);result.currentSources=await page.locator('#sources-content').innerText();assert.ok(result.currentSources.includes('Retrieved '+retrieved),'Sources display the exact newly retrieved time');await noOverflow(page,'#sources-dialog');await page.keyboard.press('Escape');await page.locator('#sources-dialog').waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});await ready(page,false);await active(page,'nfl');assert.deepEqual(await page.evaluate(()=>window.PD_DATA),data.current);result.finalNflGeometry=await legacy.geometry(page);assert.deepEqual(result.finalNflGeometry.clipped,[]);await images(page);result.nflCapture=await capture(page,out,`nfl-${viewport.width}x${viewport.height}-metadata-refreshed`);
  return result;
  }catch(error){error.auditEvidence=result;throw error;}
}
async function run(options){
  const out=path.resolve(options.output);assert.equal(fs.existsSync(out),false,'Preserve all original QA evidence; a fresh output directory is required');fs.mkdirSync(out,{recursive:true});
  const report={status:'running',engine:options.engine,hosted:!!options.base,startedAt:new Date().toISOString(),qualification:{genuineNativeBrowser:true,physicalIPhone:false,deviceScaleFactor:2,naturalAnimationPhase:true,noFixtureOrResponseSubstitution:true,strictTLS:true,scope:'Metadata-only provider integration acceptance delta; full frozen button, motion and visual reports are preserved separately.'},results:[]};
  let server,browser,base=options.base;
  try{
    assert.ok(['chromium','webkit'].includes(options.engine),'A genuine supported browser engine is required');const viewports=selectedViewports(options.viewport),bound=transition(options);report.source={...bound.evidence,runtimeFiles:bound.current,testFiles:{}};report.requestedViewports=viewports;
    for(const file of['qa/team-details/post-refresh.cjs','qa/team-details/controls.cjs','qa/team-details/qa.cjs','qa/nfl-dashboard/qa.cjs','qa/home-gate.cjs','qa/hosted-webkit.cjs'])report.source.testFiles[file]=SHA(fs.readFileSync(path.join(ROOT,file)));
    const data={current:load(ROOT+'/assets/data/current.json'),teamForm:load(ROOT+'/assets/data/team-details.json')};
    if(!base){const port=await freePort();base=`http://127.0.0.1:${port}/${encodeURIComponent(path.basename(ROOT))}/`;server=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});let online=false;for(let n=0;n<30;n++){try{online=(await fetch(base)).status===200;if(online)break;}catch{}await WAIT(100);}assert.ok(online,'Real local static server becomes ready');}
    if(!base.endsWith('/'))base+='/';if(options.base)assert.equal(new URL(base).protocol,'https:','Hosted evidence requires HTTPS');report.base=base;browser=await launch(options.engine,!!options.base);report.browserVersion=browser.version();
    for(const viewport of viewports){
      const mobile=viewport.width<600,context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,timezoneId:'Australia/Sydney'}),page=await context.newPage(),errors=[],http=[],failed=[],external=[];let result;
      page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)http.push({url:response.url(),status:response.status()});});page.on('requestfailed',request=>failed.push({url:request.url(),message:request.failure()?.errorText}));page.on('request',request=>{const url=new URL(request.url());if(!['data:','blob:','about:'].includes(url.protocol)&&url.origin!==new URL(base).origin)external.push(url.href);});
      try{result=await scenario(page,base,viewport,data,bound.current,out);result.errors={javascriptAndConsole:errors,http,external,transport:failed.filter(item=>!['net::ERR_ABORTED','Load request cancelled'].includes(item.message)),cancelled:failed.filter(item=>['net::ERR_ABORTED','Load request cancelled'].includes(item.message))};for(const key of['javascriptAndConsole','http','external','transport'])assert.deepEqual(result.errors[key],[],'No actual runtime '+key+' errors');result.status='passed';}
      catch(error){result={...(error.auditEvidence||result),viewport,status:'failed',failure:{message:error.message,stack:error.stack},errors:{javascriptAndConsole:errors,http,failed,external}};try{await page.screenshot({path:path.join(out,`failure-${viewport.width}.png`),animations:'allow'});}catch{}}
      finally{await context.close();}report.results.push(result);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));process.stdout.write(`${options.engine} ${viewport.width} ${result.status}\n`);
    }
    assert.deepEqual(runtimeManifest(),bound.current,'Current runtime stays unchanged throughout genuine browser acceptance');report.unchangedDuringQA=true;
    for(const[file,hash]of Object.entries(report.source.testFiles))assert.equal(SHA(fs.readFileSync(path.join(ROOT,file))),hash,'QA logic is unchanged throughout acceptance');report.testLogicUnchangedDuringQA=true;report.status=report.results.every(result=>result.status==='passed')?'passed':'failed';
  }catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};}
  finally{if(browser)await browser.close();if(server){server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));process.stdout.write(path.join(out,'results.json')+'\n');}
  return report;
}
module.exports={transition,walk,metadataCategory,selectedViewports,run};
if(require.main===module){const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];},options={engine:get('--engine'),output:get('--output'),base:get('--base'),viewport:get('--viewport'),originalManifest:get('--original-manifest'),originalFreeze:get('--original-freeze'),classification:get('--classification'),classificationFreeze:get('--classification-freeze'),manifest:get('--manifest'),freeze:get('--freeze')};for(const name of['output','originalManifest','originalFreeze','classification','manifest','freeze'])assert.ok(options[name]&&!options[name].startsWith('--'),'Required CLI argument '+name);run(options).then(report=>{process.exitCode=report.status==='passed'?0:1;},error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});}
