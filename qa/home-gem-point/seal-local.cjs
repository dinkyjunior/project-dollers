'use strict';
// Read-only coordinator gate. Source integration and hosted acceptance are separate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const q=require('../matchup-breakdown/qa.cjs'),dir=__dirname;
const expected='be79f233d716077ba4a0fe11b5cdc2de825d841608075c9995ba521cf1c58724';
const hash=q.SHA,read=p=>JSON.parse(fs.readFileSync(path.join(dir,p))),bytes=p=>fs.readFileSync(path.join(dir,p));
const freeze=read('final-local-freeze.json'),runtime=q.runtimeManifest();
assert.equal(hash(bytes('final-local-freeze.json')),'f7642eb3b08356931bc959c6905f11610a8c5b9ded4561ae82b5230b6574c2f1');
assert.equal(freeze.runtimeManifestSha256,expected);assert.deepEqual(runtime,freeze.runtimeManifest);
const originalTests=q.tests(),oldHelpers=['qa/home-gem/final-native.cjs','qa/home-gem/controls-audit.cjs'];
for(const [file,digest]of Object.entries(originalTests))assert.equal(digest,hash(cp.execFileSync('git',['show','b62b9be:'+file],{cwd:q.ROOT})));
for(const file of oldHelpers)assert.equal(hash(fs.readFileSync(path.join(q.ROOT,file))),hash(cp.execFileSync('git',['show','b62b9be:'+file],{cwd:q.ROOT})));
const reports=[];
for(const [engine,pin]of [['chromium','0896e7503e94de4dc0359274a2aec25d61ebccd85a07d7734a71fd2c0eedbd7b'],['webkit','6e40d30ba919442393e11e93a8934185e7936bc28b625c7ca5db80958469b31c']]){
 const file='final-'+engine+'/results.json',r=read(file);assert.equal(hash(bytes(file)),pin);
 assert.equal(r.status,'passed');assert.equal(r.browserClosed,true);assert.equal(r.runtimeUnchanged,true);assert.equal(r.helperUnchanged,true);assert.equal(r.originalTestsUnchanged,true);
 assert.deepEqual(r.runtimeManifest,runtime);assert.deepEqual(r.originalTestFiles,originalTests);assert.equal(r.helperSha256,hash(bytes('final-native.cjs')));
 for(const image of r.originals)assert.equal(hash(bytes('final-'+engine+'/'+image.file)),image.sha256);
 for(const width of [393,430]){const phone=r.results.find(v=>v.viewport.width===width);assert.equal(phone.status,'passed');assert.equal(phone.actions.length,45);assert.equal(phone.nativeControls.status,'passed');assert.equal(phone.motion.status,'passed');assert.equal(phone.motion.reflectionVisibility.status,'passed');assert.equal(phone.motion.samples.length,4);
  assert.deepEqual(phone.captures.map(v=>v.sport),['nfl','nba','nrl','ufc']);
  for(const key of ['javascript','console','http','failed','external','cancelledNavigation'])assert.deepEqual(phone.errors[key],[]);
  for(const frame of [...phone.motion.frames,...phone.motion.reflectionVisibility.frames])assert.equal(hash(bytes('final-'+engine+'/'+frame.file)),frame.sha256);
 }
 reports.push({file,sha256:pin,actualBrowserClosed:true});
}
const extraPins={'scroll-chromium/results.json':'61a0599b8b4375d4056909038590f575d360f715e7ef84bdd32cb0f1bf0defe3','scroll-webkit/results.json':'ac4eabc03aa8f03b42cfb318a05497bd7e98a2fce0c6669cca77f639edea097e','gallery-audit-v2/results.json':'257ee32a4cf8a8435b56ccb60e23267ce3600483e1ab93d979711487100fbf1d'};
for(const [file,pin]of Object.entries(extraPins)){const r=read(file);assert.equal(hash(bytes(file)),pin);assert.equal(r.status,'passed');assert.equal(r.browserClosed,true);assert.equal(r.runtimeManifestSha256,expected);reports.push({file,sha256:pin,actualBrowserClosed:true});}
const reviews=[];
const reviewPins={'aperture-final.json':'060fccb27209aad313725c2f2d382f9f1b05f8d1cd3d5b0501011ad7680ae55c','gem-controls-final.json':'3080711f6523136a8262280715247a872bf6b2b77a0c2fe5a8b6c249fda16d06','controls-audit-final.json':'cb9e8348deeada9abe26d7e3efb7835f5247bcc10ae5e8987e34771f834e2e44','motion-final.json':'90f51120bf65fea6baeec0566ccdaa301c775acad29397a4ec6150fd1b7e5220','director-final.json':'0677c6e299d853219d9ab1de494cdcad47e8c4096602e2dc969d6cdb0c1827e4','asset-quality-final.json':'7ee21db7db397109ec9c743ff91c52aea4ca4770fe824e95b00a61bfd87941cc','mobile-qa-final.json':'20c15bb86f217547bd3b484f2ce9e853924ecf3e69fa52e00a9523a99c6e222e'};
for(const [file,pin]of Object.entries(reviewPins)){
 const p='reviews/'+file,r=read(p);assert.ok(['accepted','asset-quality-final-local-dual-browser-passed'].includes(r.status),file+' must explicitly accept');
 assert.match(pin,/^[a-f0-9]{64}$/);assert.equal(hash(bytes(p)),pin,file+' exact independently accepted bytes');
 assert.equal(r.runtimeManifestSha256||r.runtimeBinding?.actualRuntimeManifestSha256,expected);
 if(r.criticalVetoes)assert.deepEqual(r.criticalVetoes,[]);if(r.remainingVisualObjections)assert.deepEqual(r.remainingVisualObjections,[]);
 reviews.push({file:p,sha256:hash(bytes(p)),status:r.status});
}
const rootPin='4e59d46b1e78efb5006a05b039f29944b351ffddd989aae7829a83414a1705a5';assert.equal(hash(bytes('ROOT_VISUAL_REVIEW.md')),rootPin);
const receipt={status:'accepted-local-visual-and-native-gates',completedAt:new Date().toISOString(),runtimeManifestSha256:expected,runtimeFiles:Object.keys(runtime).length,reports,reviews,originalTests,oldHelpers:Object.fromEntries(oldHelpers.map(p=>[p,hash(fs.readFileSync(path.join(q.ROOT,p)))])),rootVisualReview:{file:'ROOT_VISUAL_REVIEW.md',sha256:rootPin},qualification:'Seven independent specialist seals plus root direct latest-chat reference review. Original attachment binary unavailable; not registered pixel identity. Incoming five-book NFL integration and actual hosted strict-TLS acceptance are separate mandatory gates. Historical failed/gallery/prototype receipts remain unchanged.',publicationVerified:false};
const output=path.join(dir,'local-acceptance.json');assert.ok(!fs.existsSync(output),'Fresh immutable receipt required');fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,sha256:hash(fs.readFileSync(output)),reviews:reviews.length}));
