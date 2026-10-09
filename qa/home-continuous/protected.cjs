'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline.json')));
const allowed=new Set(['index.html','assets/home-aperture.css','assets/home-gem-controls.css','assets/home-gem-layout.css','assets/home-aperture-motion.css','assets/home-aperture-motion.js']);
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
for(const [file,hash]of Object.entries(baseline.sourceBaselineHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,file))),hash,'Preserved fetched source update '+file);
const report={status:'passed',at:new Date().toISOString(),baselineCommit:baseline.commit,sourceBaselineCommit:baseline.sourceBaselineCommit,actualChanges,protectedFiles,nonHomeMarkupSha256:baseline.nonHomeMarkupSha256,sourceBaselineHashes:baseline.sourceBaselineHashes,qualification:'Home-only authorized changes; historical Home nav/title expectations are superseded, original tests are preserved rather than edited.'};
fs.writeFileSync(path.join(__dirname,'protected-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,protectedFiles:protectedFiles.length,changedFiles:actualChanges.length}));
