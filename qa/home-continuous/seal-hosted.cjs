'use strict';
// Fresh hosted receipt: retain the closed local/source qualifications and
// delegate every native runtime, helper, image and HTTP-body check unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const q=require('../matchup-breakdown/qa.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const runtimeSha=arg('--runtime-sha'),webkit=arg('--webkit','hosted-webkit');
const output=path.join(__dirname,'reviews','hosted-native-qa.json');
assert.ok(!fs.existsSync(output),'Immutable hosted QA receipt must be fresh');
const readReceipt=file=>{const bytes=fs.readFileSync(file);return{file:path.relative(q.ROOT,file),sha256:q.SHA(bytes),receipt:JSON.parse(bytes)};};
const local=readReceipt(path.join(__dirname,'reviews','native-qa.json'));
const source=readReceipt(path.join(__dirname,'reviews','source-delta-94e7.json'));
assert.equal(local.receipt.status,'passed-local-native');
assert.equal(local.receipt.runtimeManifestSha256,runtimeSha);
assert.equal(source.receipt.status,'accepted-current-source-delta-with-evidence-qualifications');
const sealed=execFileSync(process.execPath,[path.join(__dirname,'seal-native.cjs'),'--phase','hosted','--webkit',webkit,'--runtime-sha',runtimeSha],{cwd:q.ROOT,encoding:'utf8'});
const hosted=readReceipt(path.join(__dirname,'reviews','native-hosted.json'));
assert.equal(hosted.receipt.status,'passed-closed-native-hosted-validation');
assert.equal(hosted.receipt.runtimeManifestSha256,runtimeSha);
const native=hosted.receipt.reports[0];
assert.equal(native.engine,'webkit');assert.equal(native.strictTLS,true);
const receipt={
 status:'passed-hosted-native',completedAt:new Date().toISOString(),
 runtimeManifestSha256:runtimeSha,runtimeFiles:hosted.receipt.runtimeFiles,
 hostedNativeReceipt:{file:hosted.file,sha256:hosted.sha256},
 hostedReport:native,
 localNativeReceipt:{file:local.file,sha256:local.sha256,status:local.receipt.status},
 qualifiedSourceReceipt:{file:source.file,sha256:source.sha256,status:source.receipt.status},
 originalTestFiles:hosted.receipt.originalTestFiles,
 nativeHelperSha256:hosted.receipt.nativeHelperSha256,
 sealHelperSha256:q.SHA(fs.readFileSync(__filename)),
 qualification:{
  ...hosted.receipt.qualification,
  earlierLocalScreenshotsRetainTheirOriginalRuntimeBindings:true,
  sourceAuditRetainsItsEvidenceQualifications:true,
  sourceProviderRawResponseReplayCertification:false,
  historicalSourceManifestFailuresNotRelabelledPassing:true,
  freshHostedNativeEvidence:true
 }
};
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,file:path.relative(q.ROOT,output),sha256:q.SHA(fs.readFileSync(output)),delegatedValidation:JSON.parse(sealed)}));
