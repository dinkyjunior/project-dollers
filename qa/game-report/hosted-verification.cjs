'use strict';
// Bounded real hosted audit after deployment. No browser is launched by loading
// this module; only an explicit CLI invocation starts the official strict WPE.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const gate=require(ROOT+'/qa/home-gate.cjs');
const paint=require(ROOT+'/qa/team-details/capture-ready.cjs');
const {redact}=require(ROOT+'/qa/hosted-webkit.cjs');
const SHA=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const P=id=>`[data-page="${id}"]`;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const known=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const fmt=value=>known(value)?Number(value).toLocaleString('en-AU',{maximumFractionDigits:1}):'—';
const viewportList=[{width:393,height:852},{width:430,height:896},{width:1440,height:900}];

function argumentsFor(args){
  const arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  assert.ok(args.includes('--base'),'Explicit deployed --base required; this helper has no implicit live target');
  const url=new URL(arg('--base'));
  assert.equal(url.protocol,'https:','Hosted verification requires HTTPS with strict TLS');
  assert.ok(!url.username&&!url.password&&!url.search&&!url.hash,'Use the plain deployed base URL without credentials/query/fragment');
  if(!url.pathname.endsWith('/'))url.pathname+='/';
  return{base:url.href,out:path.resolve(arg('--output',__dirname+'/hosted-'+new Date().toISOString().replace(/[:.]/g,'-'))),
    expectedSourceCount:args.includes('--expected-source-count')?Number(arg('--expected-source-count')):null};
}
function dependencies(){
  return Object.fromEntries(['qa/home-gate.cjs','qa/hosted-webkit.cjs','qa/team-details/capture-ready.cjs','qa/team-details/qa.cjs']
    .map(file=>[file,SHA(fs.readFileSync(ROOT+'/'+file))]));
}
async function main(args=process.argv.slice(2)){
  const {base,out,expectedSourceCount}=argumentsFor(args),source=gate.runtimeManifest(),modules=dependencies();
  // Root may intentionally refresh and sync data before this launch. Bind the
  // newly reviewed local candidate, rather than assuming old data body counts.
  if(expectedSourceCount!==null)assert.equal(Object.keys(source).length,expectedSourceCount,'Runtime count matches root-reviewed latest candidate');
  assert.ok(!fs.existsSync(out),'A fresh immutable evidence directory is required');
  fs.mkdirSync(out,{recursive:true});fs.copyFileSync(__filename,out+'/executed-helper.cjs');
  for(const file of Object.keys(modules))fs.copyFileSync(ROOT+'/'+file,out+'/'+file.replaceAll('/','__'));
  const index=JSON.parse(fs.readFileSync(ROOT+'/assets/data/game-reports.json'));
  const selectedId='2026_04_DAL_HOU',meta=index.games[selectedId];assert.ok(meta);
  const selectedBytes=fs.readFileSync(ROOT+'/'+meta.detailUrl),game=JSON.parse(selectedBytes);
  assert.equal(SHA(selectedBytes),meta.sha256);assert.equal(selectedBytes.length,meta.bytes);
  const report={status:'running',base,engine:'Official native WPE WebKit',startedAt:new Date().toISOString(),
    gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    helperSha256:SHA(fs.readFileSync(__filename)),dependencies:modules,source,sourceCount:Object.keys(source).length,
    qualifications:{strictTLS:true,ignoreHTTPSErrors:false,hostnameVerification:true,actualHostedResponses:true,
      deviceScaleFactor:2,physicalIPhone:false,actualDeviceFPS:false,DOMStyleClockResponseSubstitution:false,
      motionSampling:{naturalIntervalsMs:[430,1730],maxFramesPerPhase:3,thirdOnlyIfInitialPairAliases:true},
      scope:'Bounded hosted delivery and representative navigation/control regression; two local suites cover exhaustive unchanged controls and all raw source records.',
      resourceQualification:'Every actually delivered first-party consumer body is checked against the full frozen manifest. The separately labelled required-file check covers app/controllers/books/index and the two selected reports only; unused detail reports are never proactively fetched.'},results:[]};
  const save=()=>fs.writeFileSync(out+'/results.json',redact(JSON.stringify(report,null,2))+'\n');save();
  let browser;
  const ready=async(page,id)=>{
    await page.waitForFunction(id=>document.querySelector('.page.active')?.dataset.page===id,id,{timeout:45000});
    await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_DATA?.roster?.length,null,{timeout:45000});
    if(id==='team-details')await page.waitForFunction(()=>window.PDTeamDetails?.getDataset?.()?._sourceIntegrity?.status==='verified');
    if(id==='matchup-breakdown')await page.waitForFunction(()=>window.MatchupBreakdown?.getDataset?.()?._sourceIntegrity?.status==='verified');
    if(id==='game-report')await page.waitForFunction(()=>document.documentElement.dataset.gameReportDataReady==='true'&&window.PDGameReport.getReport()&&document.querySelector('.page.active .gr-quarter-table'),null,{timeout:45000});
    await page.evaluate(async()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.querySelectorAll('.page.active img')].filter(i=>i.checkVisibility()).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:45000});
    assert.equal(await page.locator('.page:visible').count(),1,'Only intended page is visible');
  };
  const go=async(page,hash)=>{
    const response=await page.goto(base+'#'+hash,{waitUntil:'networkidle',timeout:60000});
    if(response)assert.equal(response.status(),200,'Hosted navigation returns HTTP200');
    else assert.ok(page.url().startsWith(base),'Same-document navigation retains the hosted origin/path');
    assert.equal(new URL(page.url()).origin,new URL(base).origin,'Navigation stays on the deployed origin');
    const id=hash.startsWith('team/')?'team-details':hash.startsWith('matchup/')?'matchup-breakdown':hash.startsWith('game-report')?'game-report':hash;
    await ready(page,id);return id;
  };
  const input=async(page,row,selector,label)=>{
    const locator=page.locator(selector).first();await locator.scrollIntoViewIfNeeded();
    if(row.viewport.width<500)await locator.tap();else await locator.click();
    row.actions.push({label:label||selector,hash:new URL(page.url()).hash,at:new Date().toISOString()});save();
  };
  const close=async(page,row)=>{
    const dialog=page.locator('dialog[open]').first();await dialog.waitFor();
    await dialog.locator('.dialog-close').click();await dialog.waitFor({state:'hidden'});
    row.actions.push({label:'Native dialog close'});save();
  };
  const geometry=async page=>{
    const result=await page.locator('.page.active').evaluate(page=>{
      const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const scroll=page.querySelector('.page-scroll')||page;
      return{page:page.dataset.page,viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
        frame:box(page),scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,
        controls:[...page.querySelectorAll('button,select,summary')].filter(e=>e.checkVisibility()).map(e=>({text:e.innerText,...box(e)})),
        tables:[...page.querySelectorAll('table,.gr-player-row,.td-game-row')].filter(e=>e.checkVisibility()).map(box),
        images:[...page.querySelectorAll('img')].filter(e=>e.checkVisibility()).map(e=>({src:e.currentSrc,natural:[e.naturalWidth,e.naturalHeight]})),
        clipped:page.dataset.page==='game-report'?[...page.querySelectorAll('h1,h2,h3,th,td,.gr-player-name')].filter(e=>e.checkVisibility()&&e.scrollWidth>e.clientWidth+1).map(e=>({text:e.innerText,width:e.clientWidth,scroll:e.scrollWidth})):[]};
    });
    assert.ok(result.documentWidth<=result.viewport.width+1&&result.scrollWidth<=result.clientWidth+1,'Hosted document/page has no horizontal overflow');
    for(const item of [...result.controls,...result.tables])assert.ok(item.x>=result.frame.x-1&&item.right<=result.frame.right+1,'Hosted control/table stays in its actual app frame');
    assert.ok(result.images.every(i=>i.natural[0]>0&&i.natural[1]>0),'Hosted visible images decode');assert.deepEqual(result.clipped,[],'Report text is not clipped');return result;
  };
  const capture=async(page,row,label,anchor)=>{
    if(anchor)await page.locator(anchor).first().scrollIntoViewIfNeeded();
    const native=await paint.capture(page,out,label),bounds=await geometry(page);
    const result={...native,geometry:bounds,untouchedNativeOriginal:true};row.originals.push(result);save();return result;
  };
  const served=async page=>{
    const required=['index.html','assets/app.js','assets/data-updates.js','assets/source-integrity.js',
      'assets/game-report.js','assets/game-report.css','assets/team-details.js','assets/team-details.css',
      'assets/matchup-breakdown.js','assets/matchup-breakdown.css','assets/data/current.json',
      'assets/data/game-reports.json','assets/data/team-details.json','assets/data/matchup-breakdown.json',
      'assets/data/player-history.json',meta.detailUrl,index.games['2025_02_CLE_BAL'].detailUrl];
    for(const file of required)assert.ok(own(source,file),'Required hosted file belongs to the frozen candidate');
    const rows=await page.evaluate(async ({names,token})=>{
      const rows=[];
      for(let position=0;position<names.length;position+=6)rows.push(...await Promise.all(names.slice(position,position+6).map(async file=>{
        const url=new URL(file,document.baseURI);url.searchParams.set('pd_qa_required',token);
        const response=await fetch(url.href,{cache:'no-store'}),bytes=await response.arrayBuffer();
        return{file,url:response.url,status:response.status,bytes:bytes.byteLength,
          sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};
      })));
      return rows;
    },{names:required,token:report.helperSha256.slice(0,16)});
    report.servedRequiredFiles=rows;report.deliveryCoverage={manifestBodies:Object.keys(source).length,
      proactivelyCheckedRequiredBodies:required.length,unusedReportDetailsFetched:0,
      qualification:'Required delivery subset plus every observed actual consumer response; full-manifest identity does not imply all manifest files were fetched.'};save();
    for(const item of rows){assert.equal(item.status,200,'Actual hosted runtime HTTP200: '+item.file);assert.equal(item.sha256,source[item.file],'Actual hosted runtime body equals frozen source: '+item.file);}
    return{bodies:rows.length,allExact:true};
  };
  const sourceProof=async page=>{
    const actual=await page.evaluate(async()=>{
      const values={current:window.PD_DATA,team:window.PDTeamDetails?.getRawDataset?.(),matchup:window.MatchupBreakdown?.getRawDataset?.(),index:window.PDGameReport?.getDataset?.(),detail:window.PDGameReport?.getReport?.()};
      const result={};for(const[name,value]of Object.entries(values))if(value){const bytes=new TextEncoder().encode(JSON.stringify(value));result[name]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}return result;
    });
    for(const[name,file]of [['current','assets/data/current.json'],['team','assets/data/team-details.json'],['matchup','assets/data/matchup-breakdown.json'],['index','assets/data/game-reports.json']])if(actual[name])assert.equal(actual[name],SHA(Buffer.from(JSON.stringify(JSON.parse(fs.readFileSync(ROOT+'/'+file))))),'Actual hosted loaded original book is source exact: '+name);
    if(actual.detail)assert.equal(actual.detail,SHA(Buffer.from(JSON.stringify(game))),'Actual selected hosted report is source exact');return actual;
  };
  const reportValues=async(page,row)=>{
    await ready(page,'game-report');const state=await page.evaluate(()=>window.PDGameReport.getState());assert.equal(state.game,selectedId);assert.equal(state.team,'DAL');
    const rows=await page.locator(P('game-report')+' .gr-quarter-table tbody tr').evaluateAll(rows=>rows.map(r=>({team:r.querySelector('th').innerText.trim(),values:[...r.querySelectorAll('td')].map(v=>v.innerText.trim())})));
    for(const[team,record]of [['DAL',rows[0]],['HOU',rows[1]]]){assert.equal(record.team,game.providerTeamAbbreviations?.[team]||team);assert.deepEqual(record.values,[...game.quarters[team].map(fmt),fmt(team===game.home_team?game.home_score:game.away_score)],'Hosted quarter values match selected source');}
    (row.loadedSourceProofs||=[]).push(await sourceProof(page));await geometry(page);save();
  };
  const profile=async(page,row,selector,team)=>{
    const id=await page.locator(selector).first().getAttribute('data-player'),player=game.players[team].find(p=>String(p.id)===id);assert.ok(player);
    const rosterBefore=await page.evaluate(()=>window.PDApp.getContext().state.openPlayer);
    await input(page,row,selector,'Representative historical player profile');await page.locator('#game-report-dialog[open]').waitFor();
    assert.equal(await page.locator('#game-report-dialog-title').innerText(),player.name+' · '+(game.providerTeamAbbreviations?.[team]||team));
    const values=await page.locator('#game-report-dialog-content > table tbody td').allTextContents();
    assert.deepEqual(values,Object.values(player.stats).map(value=>known(value)?fmt(value):typeof value==='string'&&value?value:'—'),'Hosted selected-game player profile contains every actual stat');
    assert.equal(await page.evaluate(()=>window.PDApp.getContext().state.openPlayer),rosterBefore,'Report profile does not alter hidden roster selection');await close(page,row);
  };
  const sourceLinksProof=async(page,row)=>{
    const actual=await page.locator('#game-report-dialog-content').evaluate(content=>({
      articles:[...content.querySelectorAll('.gr-source-list article')].map(article=>({
        id:article.querySelector('small').textContent.split('SHA-256:')[0].trim(),
        provider:article.querySelector('h3').textContent,statusTime:article.querySelector('p').textContent,
        url:article.querySelector('a[href]')?.href||null,anchorCount:article.querySelectorAll('a[href]').length,
        metadata:article.querySelector('small').textContent})),
      catalog:[...content.querySelectorAll('a[data-si-source]')].map(a=>{const parent=a.closest('[data-si-game]');return{
        game:parent?.dataset.siGame,field:parent?.dataset.siField,player:parent?.dataset.siPlayer,
        id:a.dataset.siSource,value:a.dataset.siValue,retrievedAt:a.dataset.siRetrieved,url:a.href,
        reading:a.closest('[data-si-reading-value]')?.dataset.siReadingValue};}),
      allLinks:[...content.querySelectorAll('a[href]')].map(a=>({url:a.href,
        kind:a.closest('.gr-source-list')?'source-article':a.matches('[data-si-source]')?'explicit-catalog':'unexpected'}))
    }));
    const sources=game.sources||index.sources||[],scope=game.sources?'selected-game':'explicit-index-fallback';
    row.reportSourcesProof={scope,actual,expectedSourceIds:sources.map(s=>s.id)};save();
    assert.deepEqual(actual.articles.map(a=>a.id).sort(),sources.map(s=>s.id).sort(),'Hosted Sources contain every and only declared selected-scope provider id');
    for(const source of sources){
      const article=actual.articles.find(a=>a.id===source.id);assert.ok(article);
      assert.equal(article.anchorCount,/^https:\/\//i.test(source.url||'')?1:0,'Hosted source article has exactly its declared original-source anchor');
      assert.equal(article.provider,String(source.provider||source.name||source.id),'Hosted provider label is source exact');
      assert.equal(article.url,/^https:\/\//i.test(source.url||'')?source.url:null,'Hosted selected-scope provider URL is exact');
      const retrieved=await page.evaluate(value=>value&&Number.isFinite(Date.parse(value))?
        new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)):'Unavailable',source.retrievedAt);
      assert.equal(article.statusTime,`${source.status||'Status unavailable'} · retrieved ${retrieved}`,'Hosted selected-scope retrieval/status text belongs to its exact producer');
      if(source.sha256)assert.ok(article.metadata.includes('SHA-256: '+source.sha256),'Actual provider checksum is source exact');
    }
    for(const link of actual.catalog){
      assert.equal(link.game,game.id,'Any explicit index-catalog link belongs to this exact selected game');
      const candidates=(index.knownDisagreements||[]).filter(issue=>issue.gameId===game.id&&issue.field===link.field&&
        String(issue.playerGsisId||issue.playerEspnId||'')===String(link.player||'')&&
        game.disagreements?.some(d=>d.field===issue.reportField&&String(d.team||'')===String(issue.team||'')&&String(d.playerId||'')===String(issue.playerEspnId||'')));
      const binding=candidates.flatMap(issue=>(issue.readings||[]).flatMap(reading=>reading.sourceIds.map(id=>({
        id,value:String(reading.value),source:issue.sources.find(s=>s.id===id)}))))
        .find(v=>v.id===link.id&&v.value===link.value);
      assert.ok(binding,'Actual catalog link has an explicitly permitted selected-game reading/source association');
      assert.equal(link.reading,binding.value,'Catalog reading value stays bound to its own source');
      assert.equal(link.url,binding.source.url,'Catalog source URL is exact');
      assert.equal(link.retrievedAt,binding.source.retrievedAt,'Catalog retrieval time is exact');
    }
    assert.ok(actual.allLinks.every(link=>link.kind!=='unexpected'),'No unrelated index or undeclared link is presented as selected-game evidence');
    return row.reportSourcesProof;
  };
  const clockSample=async page=>page.locator('.page.active').evaluate(p=>({page:p.dataset.page,visible:document.visibilityState,focus:document.hasFocus(),reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,
    clocks:p.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity).map(a=>{
      const e=a.effect.target,r=e.getBoundingClientRect(),t=a.effect.getComputedTiming();return{target:e.tagName+'.'+e.className,name:a.animationName,pseudo:a.effect.pseudoElement,
        state:a.playState,time:a.currentTime,startTime:a.startTime,duration:t.duration,progress:t.progress,
        fullyVisible:r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};})}));
  const motion=async(page,row,label)=>{
    const firstPaint=await capture(page,row,label+'-a'),first=await clockSample(page);await page.waitForTimeout(430);
    const laterPaint=await capture(page,row,label+'-b'),later=await clockSample(page),proof={first,later,firstPaint,laterPaint};row.motion=proof;save();
    const advances=(a,b)=>{const visible=a.clocks.filter(c=>c.fullyVisible);assert.ok(visible.length>0,'Hosted visible report light clocks exist');for(const c of visible){const next=b.clocks.find(v=>v.target===c.target&&v.name===c.name&&v.pseudo===c.pseudo);assert.ok(next&&next.state==='running'&&next.time>c.time+1,'Every hosted fully visible native light advances');}};
    advances(first,later);
    if(firstPaint.sha256===laterPaint.sha256){proof.initialPairAliases=true;proof.phaseDistances=first.clocks.map(c=>{const n=later.clocks.find(v=>v.target===c.target&&v.name===c.name&&v.pseudo===c.pseudo);return{target:c.target,name:c.name,first:c.progress,later:n?.progress,naturalElapsedMs:n?n.time-c.time:null};});save();await page.waitForTimeout(1730);proof.thirdPaint=await capture(page,row,label+'-c');proof.third=await clockSample(page);save();advances(later,proof.third);}
    assert.ok(new Set([firstPaint.sha256,laterPaint.sha256,...(proof.thirdPaint?[proof.thirdPaint.sha256]:[])]).size>1,'Hosted visible native lighting changes actual painted pixels within the declared bound');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(220);proof.reduced=await clockSample(page);save();assert.equal(proof.reduced.clocks.filter(c=>c.state==='running').length,0,'Hosted reduced-motion stops decorative report clocks');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>{const p=document.querySelector('.page.active'),a=p.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity);return !matchMedia('(prefers-reduced-motion:reduce)').matches&&a.length>0&&a.every(a=>a.playState==='running');});proof.restored=await clockSample(page);save();
  };
  const stage=async(page,row,name,work)=>{const stage={name,status:'running',startedAt:new Date().toISOString()};row.stages.push(stage);save();try{stage.result=await work();stage.status='passed';}catch(error){stage.status='failed';stage.failure={message:redact(error.message),stack:redact(error.stack)};await page.keyboard.press('Escape').catch(()=>{});}finally{stage.completedAt=new Date().toISOString();save();}};

  try{
    browser=await gate.launch('webkit',true);report.browserVersion=browser.version();
    const ca=process.env.PD_QA_CA_FILE||'/usr/local/share/ca-certificates/environment-proxy-ca.crt';report.qualifications.providedCASha256=SHA(fs.readFileSync(ca));save();
    for(const viewport of viewportList){
      const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:viewport.width<500,hasTouch:viewport.width<500,locale:'en-AU',timezoneId:'Australia/Sydney',ignoreHTTPSErrors:false});
      const page=await context.newPage(),row={viewport,status:'running',actions:[],originals:[],stages:[],errors:[],http:[],requestFailures:[],actualConsumerBodies:[]},pending=new Set(),requestIds=new WeakMap();let nextRequestId=0;
      const requestId=request=>{if(!requestIds.has(request))requestIds.set(request,++nextRequestId);return requestIds.get(request);};report.results.push(row);
      page.on('pageerror',e=>row.errors.push(redact(e.message)));page.on('console',m=>{if(m.type()==='error')row.errors.push(redact(m.text()));});
      page.on('requestfailed',request=>row.requestFailures.push({requestId:requestId(request),url:request.url(),error:redact(request.failure()?.errorText)}));
      page.on('response',response=>{
        if(response.status()>=400)row.http.push({url:response.url(),status:response.status()});
        const url=new URL(response.url()),baseUrl=new URL(base);if(url.origin!==baseUrl.origin||!url.pathname.startsWith(baseUrl.pathname))return;
        const file=decodeURIComponent(url.pathname.slice(baseUrl.pathname.length))||'index.html';if(!own(source,file))return;
        // Observe actual delivered consumer bodies, including version-query
        // script URLs. Never replace or intercept a response.
        const kind=url.searchParams.get('pd_qa_required')===report.helperSha256.slice(0,16)?'explicit-required-file-check':'native-consumer',id=requestId(response.request());
        const audit=(async()=>{try{const body=await response.body();row.actualConsumerBodies.push({requestId:id,file,url:response.url(),type:response.request().resourceType(),kind,status:response.status(),bytes:body.length,sha256:SHA(body)});}catch(error){row.actualConsumerBodies.push({requestId:id,file,url:response.url(),kind,status:response.status(),bodyUnavailable:redact(error.message)});}})();pending.add(audit);audit.finally(()=>pending.delete(audit));
      });
      try{
        await stage(page,row,'Hosted Home→NFL→Dallas→previous report→exact Back',async()=>{
          await go(page,'home');for(const sport of ['nfl','nba','nrl','ufc']){await input(page,row,P('home')+` [data-home-select="${sport}"]`);await ready(page,'home');assert.equal(await page.locator(P('home')).getAttribute('data-home-sport'),sport);assert.equal(await page.locator(P('home')+' [data-home-entry]').isDisabled(),sport!=='nfl');await geometry(page);}
          await input(page,row,P('home')+' [data-home-select="nfl"]');await ready(page,'home');await capture(page,row,'hosted-home-'+viewport.width);
          row.naturalConsumerResourcesBeforeAudit=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>({url:e.name,initiatorType:e.initiatorType,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})));
          await input(page,row,P('home')+' [data-home-entry]');await ready(page,'nfl');await input(page,row,P('nfl')+' [data-conference="NFC"]');await page.locator('#division-select').selectOption('all');
          if(!await page.locator(P('nfl')+' [data-nfl-action="team"][data-team="DAL"]').count())await input(page,row,P('nfl')+' [data-standings-toggle]');
          await input(page,row,P('nfl')+' [data-nfl-action="team"][data-team="DAL"]');await input(page,row,P('nfl')+' [data-nfl-action="team-details"][data-team="DAL"]');await ready(page,'team-details');
          await input(page,row,P('team-details')+` [data-team-game="${selectedId}"]`);
          const origin=new URL(page.url()).hash,teamState=await page.evaluate(()=>{const s=window.PDTeamDetails.getState();return{team:s.team,tab:s.tab,window:s.window,season:s.season,venue:s.venue,mode:s.mode,expanded:s.expanded};});
          await input(page,row,P('team-details')+` [data-td-action="report"][data-game="${selectedId}"]`);await reportValues(page,row);await capture(page,row,'hosted-report-top-'+viewport.width,P('game-report')+' .gr-brand');
          await input(page,row,P('game-report')+' [data-gr-action="back"]');await ready(page,'team-details');assert.equal(new URL(page.url()).hash,origin,'Hosted Back returns exact actual origin hash');
          assert.deepEqual(await page.evaluate(()=>{const s=window.PDTeamDetails.getState();return{team:s.team,tab:s.tab,window:s.window,season:s.season,venue:s.venue,mode:s.mode,expanded:s.expanded};}),teamState,'Hosted Back preserves actual team controls/selected game');
          row.returnProof={origin,teamState,restored:true};return row.returnProof;
        });
        if(!report.servedRequiredFiles)await stage(page,row,'Exact required hosted app/controller/books/selected-report bodies',()=>served(page));
        await stage(page,row,'Representative report controls and actual selected-game data',async()=>{
          await go(page,'game-report?team=DAL&game='+selectedId);await reportValues(page,row);
          for(const team of ['DAL','HOU']){await input(page,row,P('game-report')+` button[data-gr-team="${team}"]`);for(const kind of ['passing','rushing','receiving']){await input(page,row,P('game-report')+` [data-gr-kind="${kind}"]`);await geometry(page);if((team==='DAL'&&kind==='passing')||(team==='HOU'&&kind==='receiving')){const player=page.locator(P('game-report')+' button[data-gr-player]').first(),id=await player.getAttribute('data-gr-player'),initial=await player.getAttribute('aria-expanded');await input(page,row,P('game-report')+` button[data-gr-player="${id}"]`);assert.notEqual(await page.locator(P('game-report')+` button[data-gr-player="${id}"]`).getAttribute('aria-expanded'),initial);if(await page.locator(P('game-report')+` button[data-gr-player="${id}"]`).getAttribute('aria-expanded')!=='true')await input(page,row,P('game-report')+` button[data-gr-player="${id}"]`);await profile(page,row,`#gr-player-detail-${id} [data-gr-action="profile"]`,team);}}}
          await capture(page,row,'hosted-report-players-'+viewport.width,P('game-report')+' .gr-performance');
          await input(page,row,P('game-report')+' [data-gr-tab="box-score"]');assert.equal(await page.locator(P('game-report')+' .gr-box-table').count(),20);await reportValues(page,row);await profile(page,row,P('game-report')+' .gr-box-team .gr-box-table:nth-of-type(4) [data-gr-action="profile"]','DAL');
          await input(page,row,P('game-report')+' [data-gr-tab="drives"]');const firstDrive=game.drives[0];await input(page,row,P('game-report')+' .gr-drive>summary');assert.equal(await page.locator(P('game-report')+' .gr-drive').first().getAttribute('open'),'');const actualDrive=await page.locator(P('game-report')+' .gr-drive').first().locator('.gr-play-text').evaluateAll(es=>es.map(e=>e.lastChild.textContent.trim()));assert.deepEqual(actualDrive,game.plays.filter(p=>firstDrive.playIds.includes(p.id)).map(p=>(p.text||p.description||'Description unavailable').trim()));
          await input(page,row,P('game-report')+' [data-gr-tab="plays"]');assert.deepEqual(await page.locator(P('game-report')+' .gr-play p').allTextContents(),game.plays.map(p=>p.text||p.description||'Description unavailable'));await geometry(page);
          await input(page,row,P('game-report')+' .gr-source-card [data-gr-action="sources"]');await page.locator('#game-report-dialog[open]').waitFor();await sourceLinksProof(page,row);await close(page,row);
          await input(page,row,P('game-report')+' [data-gr-tab="overview"]');await input(page,row,P('game-report')+' [data-gr-action="availability"]');await page.locator('#game-report-dialog[open]').waitFor();assert.match(await page.locator('#game-report-dialog-content').innerText(),/source.recorded|unavailable/i);await close(page,row);await capture(page,row,'hosted-report-bottom-'+viewport.width,P('game-report')+' .gr-scoring');
          await motion(page,row,'hosted-report-motion-'+viewport.width);
          await go(page,`game-report?team=DAL&game=${selectedId}&tab=plays&players=HOU&kind=rushing`);await page.reload({waitUntil:'networkidle',timeout:60000});await reportValues(page,row);const state=await page.evaluate(()=>window.PDGameReport.getState());assert.equal(state.tab,'plays');assert.equal(state.kind,'rushing');assert.equal(state.performanceTeam,'HOU');row.actions.push({label:'Actual hosted direct load+document reload preserves report state'});return{state,selectedGame:selectedId,representativeProfiles:3};
        });
        await stage(page,row,'Hosted historical Matchup and Steelers regression',async()=>{
          await go(page,'game-report?team=CLE&game=2025_02_CLE_BAL');await input(page,row,P('game-report')+' [data-gr-action="matchups"]');await ready(page,'matchup-breakdown');assert.equal(await page.evaluate(()=>window.MatchupBreakdown.getFixture().id),'2025_02_CLE_BAL');assert.match(await page.locator(P('matchup-breakdown')+' .mb-season').innerText(),/2025/);assert.match(await page.locator(P('matchup-breakdown')+' .mb-fixture-copy').innerText(),/2025/);assert.match(await page.locator(P('matchup-breakdown')+' .mb-context').innerText(),/Latest 2026 research snapshot/);
          for(const tab of ['players','lineup','form']){await input(page,row,P('matchup-breakdown')+` [data-mb-tab="${tab}"]`);assert.equal(await page.locator(P('matchup-breakdown')+` [data-mb-tab="${tab}"]`).getAttribute('aria-selected'),'true');await geometry(page);}await capture(page,row,'hosted-historical-matchup-'+viewport.width);
          await go(page,'steelers');await input(page,row,P('steelers')+' [data-team-tab="roster"]');await input(page,row,P('steelers')+' [data-player]');await page.waitForFunction(()=>document.querySelector('[data-player-history-state="ready"]'),null,{timeout:45000});await input(page,row,P('steelers')+' [data-history-mode="recent"]');await geometry(page);await capture(page,row,'hosted-steelers-'+viewport.width);return{historicalSeasonCorrect:true,latestResearchExplicit:true,playerHistoryReady:true};
        });
        await Promise.allSettled([...pending]);
        await stage(page,row,'Actual delivered consumer asset/source identity and failures',async()=>{
          const readFailures=row.actualConsumerBodies.filter(item=>item.bodyUnavailable);row.bodyReadFailures=readFailures;
          for(const item of row.actualConsumerBodies.filter(item=>!item.bodyUnavailable)){assert.equal(item.status,200,'Actual served consumer response HTTP200');assert.equal(item.sha256,source[item.file],'Actual consumed body including version-query URL matches source: '+item.url);}
          row.requestCancellations=row.requestFailures.filter(item=>/ERR_ABORTED|cancelled|canceled/i.test(item.error||''));row.genuineRequestFailures=row.requestFailures.filter(item=>!row.requestCancellations.includes(item));
          const genuineReadFailures=readFailures.filter(item=>!row.requestCancellations.some(cancel=>cancel.requestId===item.requestId));assert.deepEqual(genuineReadFailures,[],'Unreadable bodies may only correspond to the same individually recorded canceled request, never another request sharing its URL');assert.deepEqual(row.errors,[],'No hosted console/page exception');assert.deepEqual(row.http,[],'No hosted HTTP failure');assert.deepEqual(row.genuineRequestFailures,[],'No genuine hosted request failure');return{observedResponses:row.actualConsumerBodies.length,
            nativeConsumerResponses:row.actualConsumerBodies.filter(item=>item.kind==='native-consumer').length,
            explicitRequiredFileResponses:row.actualConsumerBodies.filter(item=>item.kind==='explicit-required-file-check').length,
            uniqueActuallyObservedFiles:[...new Set(row.actualConsumerBodies.map(item=>item.file))].length,cancellations:row.requestCancellations.length};
        });
        row.status=row.stages.every(stage=>stage.status==='passed')?'passed':'failed';
      }finally{await context.close();save();}
    }
    report.finalSource=gate.runtimeManifest();report.sourceStable=Object.keys(report.finalSource).length===Object.keys(source).length&&Object.entries(source).every(([file,hash])=>report.finalSource[file]===hash);
    assert.deepEqual(report.finalSource,source,'Frozen source/data/assets remain untouched during hosted QA');assert.deepEqual(dependencies(),modules,'Shared QA helpers stay unchanged');
    report.status=report.results.every(row=>row.status==='passed')?'passed':'failed';if(report.status!=='passed')process.exitCode=1;
  }catch(error){report.status='failed';report.failure={message:redact(error.message),stack:redact(error.stack)};process.exitCode=1;}
  finally{if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();assert.equal(SHA(fs.readFileSync(__filename)),report.helperSha256,'Hosted helper unchanged during execution');save();console.log(JSON.stringify({status:report.status,browserClosed:true,path:out+'/results.json',sha256:SHA(fs.readFileSync(out+'/results.json'))}));}
  return report;
}
module.exports={main,argumentsFor};
if(require.main===module)main();
