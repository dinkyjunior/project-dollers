'use strict';
// Real browser audit with the original saved week deliberately behind the calendar.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {launchChromium}=require('./run.cjs');
const root=path.resolve(__dirname,'..'),snapshot=JSON.parse(fs.readFileSync(path.join(root,'assets/data/current.json')));snapshot.currentWeek=5;
let version=0,initialFailures=0,weeklyFailures=0,weeklyRequests=[],currentRequests=0,holdWeekly=false,releaseWeekly=null;
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname,relative=pathname.replace(/^\/project-dollers\//,'')||'index.html';
 if(relative==='assets/data/current.json'){
  currentRequests++; if(initialFailures-->0){res.writeHead(503);return res.end();}
  const data=structuredClone(snapshot);if(version)data.generatedAt=data.retrievedAt=new Date(Date.parse(data.retrievedAt)+version*60000).toISOString();
  res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(data));
 }
 if(relative==='assets/data/team-details.json'){
  weeklyRequests.push(req.headers['if-none-match']||null);
  if(holdWeekly){holdWeekly=false;await new Promise(resolve=>{releaseWeekly=resolve;});releaseWeekly=null;}
  if(weeklyFailures-->0){res.writeHead(503);return res.end();}
  if(req.headers['if-none-match']==='"teams-a"'){res.writeHead(304,{'ETag':'"teams-a"'});return res.end();}
  res.setHeader('ETag','"teams-a"');
 }
 const file=path.join(root,relative);if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchChromium(),errors=[];
 try{
 for(const width of [393,430]){
  const page=await browser.newPage({viewport:{width,height:width===393?852:896},timezoneId:'Australia/Sydney'});page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));
  await page.goto(`http://127.0.0.1:${server.address().port}/project-dollers/#nfl`);
  await page.waitForFunction(()=>document.querySelector('#nfl-weekly-game')&&window.PD_DATA);
  assert.equal(await page.locator('#week-select').inputValue(),'6');assert.equal(await page.evaluate(()=>PD_DATA.currentWeek),5);
  assert.equal(await page.locator('#follow-current-week').isVisible(),false);
  await page.locator('#week-select').selectOption('2');assert.equal(await page.locator('#follow-current-week').isVisible(),true);
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await page.locator('#week-select').inputValue(),'2');
  await page.locator('#follow-current-week').click();assert.equal(await page.locator('#week-select').inputValue(),'7');
  await page.clock.setFixedTime(new Date('2026-10-27T04:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  assert.equal(await page.locator('#week-select').inputValue(),'8');
  await page.waitForTimeout(150);let before=weeklyRequests.length;
  await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));await page.waitForTimeout(250);assert.equal(weeklyRequests.length,before,'unchanged snapshot does not reload league file');
  version++;await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));await page.waitForFunction(()=>PD_UPDATE_STATUS.state==='updated');
  await page.waitForTimeout(300);assert.equal(weeklyRequests.length,before+1,'changed snapshot checks league file');assert.equal(weeklyRequests.at(-1),'"teams-a"','conditional request reuses large unchanged source');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 initialFailures=1;weeklyFailures=1;const before=currentRequests,wBefore=weeklyRequests.length;
 const page=await browser.newPage();await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));await page.goto(`http://127.0.0.1:${server.address().port}/project-dollers/#nfl`);
 await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='error');
 await page.waitForFunction(()=>window.PD_DATA,{timeout:12000});assert.ok(currentRequests>=before+2,'initial failure retries automatically');
 await page.waitForFunction(()=>document.querySelector('#nfl-weekly-game'),{timeout:25000});assert.ok(weeklyRequests.length>=wBefore+2,'weekly source failure retries automatically');
 // A newer snapshot can arrive while the preceding schedule check is in flight.
 // Hold the first conditional response, apply a second change, then release it.
 await page.waitForTimeout(300);const raceBefore=weeklyRequests.length;
 holdWeekly=true;version++;await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
 for(let n=0;n<100&&!releaseWeekly;n++)await page.waitForTimeout(20);
 assert.ok(releaseWeekly,'controlled league response is held');
 version++;await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
 assert.equal(weeklyRequests.length,raceBefore+1,'second snapshot queues while first league check is in flight');
 releaseWeekly();
 for(let n=0;n<100&&weeklyRequests.length<raceBefore+2;n++)await page.waitForTimeout(20);
 assert.equal(weeklyRequests.length,raceBefore+2,'newer snapshot triggers another league check after in-flight response');
 await page.waitForTimeout(300);assert.equal(weeklyRequests.length,raceBefore+2,'queued change does not produce a repeated download loop');
 assert.deepEqual(errors,[]);console.log('PASS: both phone widths, stale snapshot Week 6, historical preservation, resume rollover, Follow, changed/unchanged conditional schedule downloads, initial and weekly automatic retries, queued changed-snapshot refresh during in-flight schedule check.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
