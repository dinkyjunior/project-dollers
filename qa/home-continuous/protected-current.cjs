'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline.json')));
const allowed=new Set(['index.html','assets/home-aperture.css','assets/home-gem-controls.css','assets/home-gem-layout.css','assets/home-aperture-motion.css','assets/home-aperture-motion.js']);
const bridge=JSON.parse(fs.readFileSync(path.join(__dirname,'source-integration-94e7.json')));
const sourceAuditBytes=fs.readFileSync(path.join(__dirname,'reviews/source-delta-94e7.json'));assert.equal(sha(sourceAuditBytes),'59ab2241a2a44298c659b01c2cc8afcbd903c2d91eb1cb623b9ab8a4e9f2249e');
assert.ok(JSON.parse(sourceAuditBytes).status.startsWith('accepted-current-source-delta'));
const actualChanges=[],protectedFiles=[];
for(const [file,hash]of Object.entries(baseline.trackedHashes)){
 const actual=sha(fs.readFileSync(path.join(ROOT,file)));
 if(actual!==hash){assert.ok(allowed.has(file)||file.startsWith('assets/data/'),'Unapproved modification: '+file);actualChanges.push({file,before:hash,after:actual});}
 else protectedFiles.push({file,sha256:actual});
}
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const marker='      <section class="page nfl-premium-dashboard';
assert.equal(sha(Buffer.from(html.split(marker)[1])),baseline.nonHomeMarkupSha256,'NonHome markup is byte-identical');
const home=html.split('<section class="page active aperture-home')[1].split(marker)[0];
assert.ok(!home.includes('<nav'),'User removed only Home navigation');
assert.equal((home.match(/data-home-select=/g)||[]).length,4);
for(const sport of ['nfl','nba','nrl','ufc'])assert.ok(home.includes('aria-label="Select '+sport.toUpperCase()),'Official icon-only selector has accessible name');
assert.equal((home.match(/continuous-gate\.svg/g)||[]).length,4);
assert.equal((html.match(/data-page="home"/g)||[]).length,1);
for(const file of Object.keys(baseline.sourceBaselineHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,file))),bridge.currentRuntimeManifest[file],'Preserved independently audited94e7 source '+file);
for(const [file,hash]of Object.entries(bridge.currentRuntimeManifest))assert.equal(sha(fs.readFileSync(path.join(ROOT,file))),hash,'Current273 runtime identity '+file);
const report={status:'passed',at:new Date().toISOString(),baselineCommit:baseline.commit,sourceBaselineCommit:baseline.sourceBaselineCommit,currentSourceCommit:bridge.sourceCommit,sourceAuditSha256:sha(sourceAuditBytes),runtimeManifestSha256:bridge.currentRuntimeManifestSha256,actualChanges,protectedFiles,nonHomeMarkupSha256:baseline.nonHomeMarkupSha256,sourceBaselineHashes:baseline.sourceBaselineHashes,currentDatasetHashes:Object.fromEntries(Object.keys(baseline.sourceBaselineHashes).map(f=>[f,bridge.currentRuntimeManifest[f]])),qualification:'Home-only authorized changes; historical Home nav/title expectations are superseded, original tests are preserved rather than edited.'};
fs.writeFileSync(path.join(__dirname,'protected-current-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,protectedFiles:protectedFiles.length,changedFiles:actualChanges.length}));
