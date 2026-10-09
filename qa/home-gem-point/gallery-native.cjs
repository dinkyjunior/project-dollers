'use strict';
// Read-only audit of the review gallery, with real browser controls and bytes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('../matchup-breakdown/qa.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const base=arg('--base','http://127.0.0.1:8876/project-dollers/');
const output=path.resolve(arg('--output','qa/home-gem-point/gallery-audit'));
assert.ok(!fs.existsSync(output),'Fresh evidence directory');fs.mkdirSync(output,{recursive:true});
const runtime=q.runtimeManifest(),canonical=q.SHA(Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(runtime).sort().map(k=>[k,runtime[k]])))));
assert.equal(canonical,arg('--runtime-sha'),'Explicit frozen app runtime');
const self=q.SHA(fs.readFileSync(__filename)),gallery='qa/home-gem-point/index.html',galleryHash=q.SHA(fs.readFileSync(gallery));
const expected={};for(const folder of ['baseline-chromium','final-chromium','final-webkit']){const receipt=JSON.parse(fs.readFileSync(path.join(__dirname,folder,'results.json')));assert.equal(receipt.status,'passed');assert.equal(receipt.browserClosed,true);for(const image of receipt.originals)expected[folder+'/'+image.file]=image;}
const report={status:'running',startedAt:new Date().toISOString(),runtimeManifestSha256:canonical,helperSha256:self,gallerySha256:galleryHash,qualification:{actualBrowser:true,nativeControls:true,unmodifiedOriginalPixels:true,DOMOrCSSSubstitution:false,responseSubstitution:false,animationClockSubstitution:false},results:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');let browser;save();
(async()=>{try{browser=await q.launch('chromium',base.startsWith('https:'));const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});page.on('requestfailed',e=>report.errors.push(e.url()+' '+e.failure()?.errorText));page.on('response',e=>{if(e.status()>=400)report.errors.push(e.status()+' '+e.url());});
const response=await page.goto(base+gallery,{waitUntil:'networkidle'});assert.equal(response.status(),200);assert.equal(q.SHA(await response.body()),galleryHash);
for(const engine of ['chromium','webkit'])for(const width of ['393','430'])for(const sport of ['nfl','nba','nrl','ufc']){
 await page.locator('#engine').selectOption(engine);await page.locator('#width').selectOption(width);await page.locator('[data-sport="'+sport+'"]').click();
 await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));
 const before='baseline-chromium/chromium-'+width+'-'+sport+'.png',after='final-'+engine+'/'+engine+'-'+width+'-'+sport+'.png';
 const state=await page.evaluate(async()=>{const images=[];for(const id of ['before','after']){const i=document.getElementById(id),r=await fetch(i.currentSrc,{cache:'no-store'}),bytes=await r.arrayBuffer();images.push({id,src:i.getAttribute('src'),href:document.getElementById(id+'-link').getAttribute('href'),width:i.naturalWidth,height:i.naturalHeight,status:r.status,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')});}return{images,selected:[...document.querySelectorAll('[data-sport][aria-pressed="true"]')].map(b=>b.dataset.sport),report:document.getElementById('after-report').getAttribute('href'),selection:document.getElementById('selection').textContent};});
 assert.deepEqual(state.selected,[sport]);assert.equal(state.report,'final-'+engine+'/results.json');for(const [n,file]of[before,after].entries()){const image=state.images[n];assert.equal(image.src,file);assert.equal(image.href,file);assert.equal(image.status,200);assert.equal(image.sha256,expected[file].sha256);assert.equal(image.width,Number(width)*2);assert.equal(image.height,(width==='393'?852:896)*2);}
 report.results.push({status:'passed',engine,width:Number(width),sport,at:new Date().toISOString(),...state});save();
}
assert.deepEqual(report.errors,[]);assert.equal(report.results.length,16);assert.deepEqual(q.runtimeManifest(),runtime);assert.equal(q.SHA(fs.readFileSync(gallery)),galleryHash);assert.equal(q.SHA(fs.readFileSync(__filename)),self);report.status='passed';report.runtimeUnchanged=true;report.galleryUnchanged=true;report.helperUnchanged=true;await context.close();
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;}finally{if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,report:path.relative(q.ROOT,path.join(output,'results.json')),sha256:q.SHA(fs.readFileSync(path.join(output,'results.json'))),failure:report.failure}));}})();
