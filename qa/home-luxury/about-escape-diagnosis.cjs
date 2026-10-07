'use strict';
// Observational genuine-browser diagnosis. No application edits, fixtures,
// default-event cancellation, animation seeking or direct dialog.close().
const {launch,runtimeManifest}=require('./functional.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');
async function main(){
 const expected=runtimeManifest(),report={startedAt:new Date().toISOString(),engine:'webkit',actualBrowser:true,fixtureUsed:false,runtimeManifest:expected,attempts:[]};
 const browser=await launch('webkit',false);
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8790/project-dollers/#home',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
  await page.locator('[data-home-select="ufc"]').tap();
  await page.locator('.page[data-page="home"] [data-open="nfl"]').click();
  await page.evaluate(()=>{
   window.__aboutEscapeEvents=[];
   const dialog=document.querySelector('#about-dialog');
   for(const type of ['cancel','close','keydown'])dialog.addEventListener(type,event=>window.__aboutEscapeEvents.push({type,key:event.key??null,at:performance.now(),open:dialog.open,defaultPrevented:event.defaultPrevented}));
  });
  for(let attempt=0;attempt<4;attempt++){
   await page.locator('.page[data-page="home"] [data-more]').last().click();
   await page.waitForFunction(()=>document.querySelector('#about-dialog').open);
   await page.evaluate(()=>{window.__aboutEscapeEvents=[];});
   await page.keyboard.press('Escape');
   const snapshot=()=>page.evaluate(()=>{const d=document.querySelector('#about-dialog');return{at:performance.now(),open:d.open,visible:d.checkVisibility(),display:getComputedStyle(d).display,active:document.activeElement?.outerHTML.slice(0,160),events:[...window.__aboutEscapeEvents]};});
   const immediate=await snapshot();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const afterTwoFrames=await snapshot();
   let terminalError=null;
   try{await page.waitForFunction(()=>!document.querySelector('#about-dialog').open&&!document.querySelector('#about-dialog').checkVisibility(),{},{timeout:1500});}catch(error){terminalError=error.message;}
   const terminal=await snapshot();
   report.attempts.push({attempt,immediate,afterTwoFrames,terminal,terminalError});
   assert.equal(terminalError,null,'Native Escape must actually close About within1500ms');
   assert.equal(terminal.open,false);assert.equal(terminal.visible,false);
  }
  assert.deepEqual(runtimeManifest(),expected,'Diagnosis did not alter runtime');
  report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{await browser.close();report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'about-escape-diagnosis.json'),JSON.stringify(report,null,2)+'\n');}
 console.log('Observed four genuine native Escape completions; browser closed.');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
