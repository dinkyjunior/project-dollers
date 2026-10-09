'use strict';
// Read-only final receipt validation. Running or failed receipts cannot seal.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('../matchup-breakdown/qa.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const phase=arg('--phase','local');assert.ok(['local','hosted'].includes(phase));
const runtime=q.runtimeManifest(),canonical=q.SHA(Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(runtime).sort().map(k=>[k,runtime[k]])))));
assert.equal(canonical,arg('--runtime-sha'));const tests=q.tests(),nativeHash=q.SHA(fs.readFileSync(path.join(__dirname,'native.cjs')));
const dirs=phase==='local'?[arg('--chromium','local-chromium-final'),arg('--webkit','local-webkit-final')]:[arg('--webkit','hosted-webkit')];
const reports=dirs.map(dir=>{
 const folder=path.join(__dirname,dir),file=path.join(folder,'results.json'),r=JSON.parse(fs.readFileSync(file));
 assert.equal(r.status,'passed',dir);assert.equal(r.phase,'frozen-runtime-native-validation');assert.equal(r.browserClosed,true,dir);
 assert.equal(r.runtimeUnchanged,true);assert.equal(r.originalTestsUnchanged,true);assert.equal(r.helperUnchanged,true);
 assert.equal(r.runtimeManifestSha256,canonical);assert.deepEqual(r.runtimeManifest,runtime);assert.deepEqual(r.originalTestFiles,tests);
 assert.equal(r.helperSha256,nativeHash);assert.equal(q.SHA(fs.readFileSync(path.join(folder,'executed-helper.cjs'))),nativeHash);
 if(phase==='hosted'){assert.equal(r.strictTLS,true);assert.equal(new URL(r.base).origin,'https://dinkyjunior.github.io');}
 let bodySets=0;for(const result of r.results){assert.equal(result.status,'passed');assert.equal(result.contextClosed,true);for(const key of ['javascript','console','http','failed','external'])assert.deepEqual(result.errors[key],[]);
  if(result.servedRuntime){bodySets++;assert.equal(result.servedRuntime.length,Object.keys(runtime).length);for(const body of result.servedRuntime){assert.equal(body.status,200);assert.equal(body.sha256,runtime[body.file]);}}
 }
 assert.equal(bodySets,1,'Exactly one complete HTTP-body set per engine');
 for(const width of [393,430]){const row=r.results.find(v=>v.viewport.width===width);assert.ok(row);assert.equal(row.captures.length,4);assert.deepEqual(row.captures.map(v=>v.sport),['nfl','nba','nrl','ufc']);assert.equal(row.motion.status,'passed');assert.equal(row.motion.frames.length,4);assert.equal(row.motion.reduced.state,'reduced');assert.equal(row.motion.reduced.clocks.filter(c=>c.state==='running').length,0);assert.equal(row.inactiveHome.clocks.filter(c=>c.state==='running').length,0);assert.equal(row.returnHome.state,'running');for(const photo of row.captures)assert.equal(photo.readiness.settled.page,'home');}
 for(const photo of r.originals){assert.equal(q.SHA(fs.readFileSync(path.join(folder,photo.file))),photo.sha256);assert.equal(photo.readiness.noStylesClockOrAnimationMutation,true);if(photo.sport)assert.equal(photo.readiness.settled.page,'home');}
 return{file:path.relative(q.ROOT,file),sha256:q.SHA(fs.readFileSync(file)),engine:r.engine,browserVersion:r.browserVersion,viewports:r.results.map(v=>v.viewport),actions:r.results.reduce((a,v)=>a+v.actions.length,0),untouchedOriginals:r.originals.length,completeBodySets:bodySets,servedRuntimeFiles:Object.keys(runtime).length,cancelledNavigation:r.results.flatMap(v=>v.errors.cancelledNavigation),strictTLS:r.strictTLS};
});
const out=path.join(__dirname,'reviews','native-'+phase+'.json');assert.ok(!fs.existsSync(out),'Immutable seal must be fresh');fs.mkdirSync(path.dirname(out),{recursive:true});
const seal={status:'passed-closed-native-'+phase+'-validation',completedAt:new Date().toISOString(),runtimeManifestSha256:canonical,runtimeFiles:Object.keys(runtime).length,nativeHelperSha256:nativeHash,sealHelperSha256:q.SHA(fs.readFileSync(__filename)),reports,originalTestFiles:tests,qualification:{nativeBrowserOutput:true,noCSSDOMSourceResponseOrClockSubstitution:true,originalHomeNavAndSelectorTitleContractsSupersededByLatestUserRequest:true,physicalIPhoneCertification:false,approvedChatOriginalBinaryAvailable:false,registeredReferencePixelIdentity:false,manualOpticalAcceptanceOwnedBySeparateReviews:true,publicationRuntimeVerified:phase==='hosted',actualPagesJobVerificationOwnedByCoordinator:true}};
fs.writeFileSync(out,JSON.stringify(seal,null,2)+'\n');console.log(JSON.stringify({status:seal.status,file:path.relative(q.ROOT,out),sha256:q.SHA(fs.readFileSync(out)),reports}));
