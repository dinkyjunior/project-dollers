'use strict';
// Actual published review UI, native select keys and native source download.
// Reads DOM/source bodies only; no styles, responses, clocks or UI substituted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('../matchup-breakdown/qa.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const base=arg('--base','https://dinkyjunior.github.io/project-dollers/');
assert.equal(base,'https://dinkyjunior.github.io/project-dollers/');
const out=path.resolve(q.ROOT,arg('--output','qa/home-continuous/hosted-gallery'));
assert.ok(!fs.existsSync(out),'Fresh immutable gallery output required');
const runtime=q.runtimeManifest(),runtimeSha=q.SHA(Buffer.from(JSON.stringify(runtime))),tests=q.tests(),self=q.SHA(fs.readFileSync(__filename));
assert.equal(runtimeSha,arg('--runtime-sha'));
const assets=['qa/home-continuous/index.html','qa/home-continuous/RELEASE.md','reference/HOME_CONTINUOUS_CORRECTIONS.md'];
for(const engine of ['hosted-webkit','local-webkit-current','local-chromium-final'])for(const [w,h]of [[393,852],[430,896]])for(const sport of ['nfl','nba','nrl','ufc'])assets.push('qa/home-continuous/'+engine+'/home-'+sport+'-'+w+'x'+h+'.png');
for(const w of [393,430])for(const sport of ['nfl','nba','nrl','ufc'])assets.push('qa/home-gem-point/live-captures-v2/webkit-'+w+'-'+sport+'.png');
const source='backups/project-dollar-home-continuous-source.zip';
const manifest=Object.fromEntries([...assets,source].map(file=>[file,{sha256:q.SHA(fs.readFileSync(path.join(q.ROOT,file))),bytes:fs.statSync(path.join(q.ROOT,file)).size}]));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'executed-helper.cjs'),fs.readFileSync(__filename));
const report={status:'running',startedAt:new Date().toISOString(),base,engine:'webkit',strictTLS:true,runtimeManifestSha256:runtimeSha,helperSha256:self,originalTestFiles:tests,publicationAssets:manifest,results:[],originals:[],errors:{javascript:[],console:[],http:[],failed:[],external:[]},qualification:{actualPublishedGallery:true,nativeKeyboardSelects:true,nativeDownload:true,noCSSDOMSourceResponseClockSubstitution:true,earlierChromiumScreenshotsRetainTheirOldSourceBinding:true,physicalIPhoneCertification:false}};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');save();
let browser;const origin=new URL(base).origin;
async function choose(page,id,index,value,result){
 await page.locator('#'+id).focus();await page.keyboard.press('Home');for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
 assert.equal(await page.locator('#'+id).inputValue(),value);result.actions.push({kind:'native-keyboard-select',id,keys:['Home',...Array(index).fill('ArrowDown'),'Tab'],value});
}
async function painted(page){await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function shot(page,name){await page.bringToFront();const bytes=await page.screenshot({path:path.join(out,name+'.png'),animations:'allow'});const row={file:name+'.png',sha256:q.SHA(bytes),bytes:bytes.length,nativeUntouchedScreenshot:true,at:new Date().toISOString()};report.originals.push(row);save();return row;}
(async()=>{try{
 browser=await q.launch('webkit',true);report.browserVersion=browser.version();
 for(const viewport of [{width:393,height:852},{width:430,height:896}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.errors.javascript.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.console.push(e.text());});page.on('response',e=>{if(e.status()>=400)report.errors.http.push({url:e.url(),status:e.status()});});page.on('requestfailed',e=>report.errors.failed.push({url:e.url(),error:e.failure()?.errorText}));page.on('request',e=>{if(new URL(e.url()).origin!==origin)report.errors.external.push(e.url());});
  const result={viewport,status:'running',actions:[],combinations:[]};report.results.push(result);save();
  try{
   const response=await page.goto(base+'qa/home-continuous/',{waitUntil:'networkidle'});assert.equal(response.status(),200);assert.equal(q.SHA(await response.body()),manifest['qa/home-continuous/index.html'].sha256);
   await painted(page);assert.equal(await page.locator('#engine').inputValue(),'hosted-webkit');result.defaultLiveEvidence=true;
   const engineOptions=await page.locator('#engine option').allTextContents();assert.match(engineOptions[2],/prior data snapshot/,'Historical Chromium data qualification is visible');
   const sizes=[[393,852],[430,896]],engines=['hosted-webkit','local-webkit-current','local-chromium-final'],sports=['nfl','nba','nrl','ufc'];
   for(let e=0;e<engines.length;e++){await choose(page,'engine',e,engines[e],result);for(let w=0;w<sizes.length;w++){await choose(page,'size',w,String(sizes[w][0]),result);for(let s=0;s<sports.length;s++){
    await choose(page,'sport',s,sports[s],result);await painted(page);
    const state=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,detail:document.getElementById('detail').textContent,images:['before','after'].map(id=>{const i=document.getElementById(id),r=i.getBoundingClientRect();return{id,src:i.currentSrc,href:document.getElementById(id+'-link').href,alt:i.alt,natural:[i.naturalWidth,i.naturalHeight],rendered:[r.width,r.height],left:r.left,right:r.right};})}));
    assert.ok(state.documentWidth<=state.viewportWidth+1,'Responsive public gallery has no horizontal overflow');
    const paths=['qa/home-gem-point/live-captures-v2/webkit-'+sizes[w][0]+'-'+sports[s]+'.png','qa/home-continuous/'+engines[e]+'/home-'+sports[s]+'-'+sizes[w][0]+'x'+sizes[w][1]+'.png'];
    for(let i=0;i<2;i++){const image=state.images[i];assert.equal(image.src,base+paths[i]);assert.equal(image.href,image.src);assert.deepEqual(image.natural,[sizes[w][0]*2,sizes[w][1]*2]);assert.ok(Math.abs((image.rendered[0]/image.rendered[1])/(image.natural[0]/image.natural[1])-1)<.01,'Gallery screenshot is proportional');assert.ok(image.left>=0&&image.right<=viewport.width+1);}
    result.combinations.push({engine:engines[e],size:sizes[w],sport:sports[s],state});save();
   }}}
   await choose(page,'engine',0,'hosted-webkit',result);await choose(page,'size',viewport.width===393?0:1,String(viewport.width),result);await choose(page,'sport',0,'nfl',result);await painted(page);
   // Browser-native wheel input exposes the ordinary scrollable top and footer.
   await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.wheel(0,-20000);await page.waitForFunction(()=>scrollY<1);result.top=await shot(page,'gallery-'+viewport.width+'-top');
   await page.mouse.wheel(0,20000);await page.waitForFunction(()=>{const r=document.querySelector('footer').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;});result.footer=await shot(page,'gallery-'+viewport.width+'-footer');
   const links=await page.locator('footer a').evaluateAll(a=>a.map(e=>({text:e.textContent,href:e.href,download:e.hasAttribute('download')})));result.footerLinks=links;assert.ok(links.some(v=>v.href===base+source&&v.download));
   if(viewport.width===430){
    const rows=await page.evaluate(async files=>{const rows=[];for(let i=0;i<files.length;i+=6)rows.push(...await Promise.all(files.slice(i,i+6).map(async file=>{const r=await fetch('/project-dollers/'+file,{cache:'no-store'}),bytes=await r.arrayBuffer();return{file,status:r.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};})));return rows;},assets);
    for(const body of rows){assert.equal(body.status,200,body.file);assert.deepEqual({sha256:body.sha256,bytes:body.bytes},manifest[body.file],body.file);}result.actualPublishedBodies=rows;
    const pending=page.waitForEvent('download');await page.locator('footer a[download]').tap();const download=await pending;assert.equal(await download.failure(),null);
    const downloaded=fs.readFileSync(await download.path());result.sourceBackupDownload={url:download.url(),suggestedFilename:download.suggestedFilename(),bytes:downloaded.length,sha256:q.SHA(downloaded),nativeFooterTap:true};assert.equal(result.sourceBackupDownload.url,base+source);assert.deepEqual({bytes:downloaded.length,sha256:q.SHA(downloaded)},manifest[source]);
   }
   result.status='passed';
  }catch(e){result.status='failed';result.failure={message:e.message,stack:e.stack};throw e;}finally{await context.close();result.contextClosed=true;result.completedAt=new Date().toISOString();save();}
 }
 // A download may cause an explicitly retained native navigation cancellation.
 report.errors.cancelledNativeDownload=report.errors.failed.filter(e=>e.url===base+source&&['Load request cancelled','net::ERR_ABORTED'].includes(e.error));report.errors.failed=report.errors.failed.filter(e=>!report.errors.cancelledNativeDownload.includes(e));
 for(const key of ['javascript','console','http','failed','external'])assert.deepEqual(report.errors[key],[],'Actual published gallery '+key);
 assert.deepEqual(q.runtimeManifest(),runtime);assert.deepEqual(q.tests(),tests);assert.equal(q.SHA(fs.readFileSync(__filename)),self);for(const[file,identity]of Object.entries(manifest))assert.equal(q.SHA(fs.readFileSync(path.join(q.ROOT,file))),identity.sha256,'Published review source remained stable '+file);
 report.runtimeUnchanged=true;report.originalTestsUnchanged=true;report.helperUnchanged=true;report.status='passed';
}catch(e){report.status='failed';report.failure={message:e.message,stack:e.stack};process.exitCode=1;}finally{if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,file:path.relative(q.ROOT,path.join(out,'results.json')),sha256:q.SHA(fs.readFileSync(path.join(out,'results.json'))),failure:report.failure}));}})();
