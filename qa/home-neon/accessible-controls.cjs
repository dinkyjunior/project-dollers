'use strict';
// Explicit accessibility-tree control identity; decorative hero alt is not used.
const {launch,VIEWPORTS}=require('../home-gate.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {once}=require('node:events'),{spawn}=require('node:child_process');
const {redact}=require('../hosted-webkit.cjs');
const ROOT=path.resolve(__dirname,'../..'),HOME='.page[data-page="home"]',sports=['nfl','nba','nrl','ufc'];
async function main(){
  const args=process.argv.slice(2),index=args.indexOf('--base'),hosted=index>=0?args[index+1]:null;
  const out=path.join(__dirname,hosted?'accessible-hosted.json':'accessible-local.json');
  let server,base=hosted;
  if(!base){
    const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
    base=`http://127.0.0.1:${port}/project-dollers/`;
    server=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.dirname(ROOT)],{stdio:'ignore'});
    for(let attempt=0;attempt<50;attempt++){try{if((await fetch(base)).status===200)break;}catch{}if(attempt===49)throw new Error('Accessibility probe local server failed');await new Promise(resolve=>setTimeout(resolve,100));}
  }
  if(!base.endsWith('/'))base+='/';
  const report={status:'running',startedAt:new Date().toISOString(),base,scope:'Actual accessible names/pressed state/live-region/disabled semantics of Home controls; no physical screen-reader claim',strictTLS:!!hosted,results:[]};
  try{
    for(const engine of hosted?['webkit']:['chromium','webkit']){
      const browser=await launch(engine,!!hosted);
      try{
        for(const viewport of engine==='webkit'?VIEWPORTS.slice(0,2):VIEWPORTS){
          const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:viewport.width<600,hasTouch:viewport.width<600});
          try{
            const page=await context.newPage();assert.equal((await page.goto(base+'#home',{waitUntil:'networkidle'})).status(),200);
            await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true');
            const home=page.locator(HOME),states=[];
            assert.equal(await home.locator('.aperture-stage').getAttribute('aria-hidden'),'true','The gate is decorative; accessibility comes from named controls');
            for(const sport of sports){
              const name=`Select ${sport.toUpperCase()}${sport==='nfl'?'':', coming soon'}`,button=home.getByRole('button',{name,exact:true});
              assert.equal(await button.count(),1,'Native sport selector has the correct accessible name');
              await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
              const ctaName=sport==='nfl'?'Enter NFL research':`${sport.toUpperCase()} research is coming soon`;
              const cta=home.getByRole('button',{name:ctaName,exact:true});assert.equal(await cta.count(),1,'CTA has correct accessible current-sport identity');
              assert.equal(await cta.isDisabled(),sport!=='nfl');
              const status=home.getByRole('status');assert.equal(await status.count(),1);assert.equal(await status.getAttribute('aria-live'),'polite');
              assert.match(await status.innerText(),new RegExp(sport,'i'));
              states.push({sport,selectorAccessibleName:name,pressed:await button.getAttribute('aria-pressed'),entryAccessibleName:ctaName,entryDisabled:await cta.isDisabled(),liveRegion:await status.innerText()});
            }
            report.results.push({engine,viewport,status:'passed',states});
          }finally{await context.close();}
        }
      }finally{await browser.close();}
    }
    report.status='passed';
  }catch(error){report.status='failed';report.failure=redact(error.message);throw error;}
  finally{if(server){server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}report.completedAt=new Date().toISOString();fs.writeFileSync(out,redact(JSON.stringify(report,null,2))+'\n');}
  console.log(`PASS named native controls at ${report.results.length} engine/viewports; ${path.relative(ROOT,out)}`);
}
if(require.main===module)main().catch(error=>{console.error(redact(error.stack));process.exitCode=1;});
