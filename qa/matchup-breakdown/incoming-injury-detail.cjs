'use strict';
// Actual ordinary scroll capture of the material Clark provider update.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),q=require('./qa.cjs');
const base='https://dinkyjunior.github.io/project-dollers/',out=path.resolve(process.argv[2]);
assert.ok(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const data=q.sourceData(),runtime=q.runtimeManifest(),originalTests=q.tests(),self=q.SHA(fs.readFileSync(__filename));
const report={status:'running',engine:'webkit',hosted:true,base,startedAt:new Date().toISOString(),source:{runtimeFiles:runtime,testFiles:originalTests,helperSha256:self},results:[],qualification:{strictTLS:true,sourceSubstitution:false,naturalAnimationPhase:true,physicalIPhone:false,scope:'Native Lineup activation and normal scrolling to the actual changed Alijah Clark injury row at both phone sizes. Source disagreements retain their separate report context.'}};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');save();let browser;
(async()=>{try{
  browser=await q.launch('webkit',true);report.browserVersion=browser.version();
  const source=data.matchup.teams.DAL.fixtureReports['2026_05_TB_DAL'].availability.players.find(r=>r.name==='Alijah Clark');
  assert.ok(source);assert.equal(source.reportStatus||source.status,'Questionable');
  for(const viewport of[{width:393,height:852},{width:430,height:896}]){
    const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Australia/Sydney'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+':'+r.url());});
    try{
      await page.goto(base+'#matchup/DAL?game=2026_05_TB_DAL',{waitUntil:'networkidle'});await q.ready(page);await q.active(page);
      assert.equal((await q.semantic(page)).dataset.sha256,q.SHA(Buffer.from(JSON.stringify(data.matchup))));
      await page.locator(q.PAGE+' [data-mb-tab="lineup"]').tap();assert.equal((await page.evaluate(()=>window.MatchupBreakdown.getState())).tab,'lineup');
      const row=page.locator('[data-mb-injury-player]').filter({hasText:'Alijah Clark'});
      assert.equal(await row.count(),1);await row.scrollIntoViewIfNeeded();const text=await row.innerText(),notes=await row.locator('.mb-injury-source-note').evaluateAll(nodes=>nodes.map(n=>n.title));
      assert.match(text,/Alijah Clark/i);assert.match(text,/Questionable/);assert.ok(!text.includes('ESPN-reported INACTIVE'));
      const sourceIds=await row.locator('[data-mb-injury-sources]').evaluateAll(nodes=>nodes.flatMap(n=>n.dataset.mbInjurySources.split(' ')));
      for(const id of source.sourceIds)assert.ok(sourceIds.includes(id));assert.ok(notes.join('\n').includes(source.sourceTimestamp));assert.ok(notes.join('\n').includes(source.injury));
      const geometry=await q.geometry(page),image=await q.capture(page,out,'alijah-clark-'+viewport.width+'-hosted');assert.deepEqual(errors,[]);
      report.results.push({status:'passed',viewport,nativeInputs:[{input:'native-touch',label:'Lineup & Travel',route:new URL(page.url()).hash}],text,source,notes,sourceIds,geometry,image,errors});save();
    }finally{await context.close();}
  }
  assert.deepEqual(q.runtimeManifest(),runtime);assert.deepEqual(q.tests(),originalTests);assert.equal(q.SHA(fs.readFileSync(__filename)),self);report.status='passed';report.unchangedDuringQA=true;
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;
}finally{if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,report:path.join(out,'results.json'),sha256:q.SHA(fs.readFileSync(path.join(out,'results.json'))),failure:report.failure}));}})();
