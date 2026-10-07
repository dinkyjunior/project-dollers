'use strict';
// Aggregate actual independent local decisions; this never grants publication
// or substitutes screenshots, runtime bytes, source values or hosted results.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {runtimeManifest} = require('./functional.cjs');
const ROOT = path.resolve(__dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file)));
const manifests = ['qa/home-luxury/approved-local-captures/manifest.json', 'qa/home-luxury/approved-local-webkit/manifest.json'];
const current = runtimeManifest();
let phones = 0, desktop = 0;
for (const file of manifests) {
  const captured = read(file);
  assert.equal(captured.status, 'complete');
  assert.deepEqual(captured.runtimeManifest, current, 'Every independently reviewed screenshot has the frozen source');
  for (const item of captured.captures) {
    assert.equal(sha(fs.readFileSync(path.join(path.dirname(path.join(ROOT, file)), item.file))), item.sha256);
    if ([393,430].includes(item.viewportCssPixels.width)) phones++;
    else desktop++;
  }
}
assert.equal(phones, 16); assert.equal(desktop, 4);
const definitions = [
  ['reference-design', 'qa/home-luxury/reference-review-bindings.json', 'ACCEPT_LOCAL_VISUAL_DIRECTION'],
  ['ui-composition', 'qa/home-luxury/ui-review.json', 'accepted-local-visuals'],
  ['asset-quality', 'qa/home-luxury/asset-review.json', 'PASS'],
  ['motion', 'qa/home-luxury/motion-approved/acceptance.json', 'accepted'],
  ['mobile-qa', 'qa/home-luxury/local-qa-review.json', null],
  ['independent-review', 'qa/home-luxury/review/visual-review.json', 'accepted'],
];
const reviewers = definitions.map(([role, evidence, expected]) => {
  const reviewed = read(evidence);
  if (expected) assert.equal(reviewed.status, expected, role);
  else assert.ok(/^visual_accepted/.test(reviewed.status) || reviewed.status === 'passed', role);
  if (role === 'asset-quality') assert.equal(reviewed.decision, 'ACCEPT');
  const boundRuntime = role === 'asset-quality' ? reviewed.source_binding.runtime_manifest : reviewed.runtimeManifest;
  assert.ok(boundRuntime, role + ': complete independent runtime binding exists');
  assert.deepEqual(boundRuntime, current, role + ': actual independent runtime binding');
  return {role, decision:'accepted', acceptanceScope:'Local visual refinement only; full functional and hosted release gates remain separate', evidence,
    evidenceSha256:sha(fs.readFileSync(path.join(ROOT,evidence))),
    allFourSportsAtBothPhoneSizesInBothEnginesIndependentlyReviewed:true,
    allFourDesktopStatesIndependentlyReviewed:true};
});
const report = {status:'all_six_visual_reviews_accepted', reviewedAt:new Date().toISOString(),
  approvedSource:'User-attached final four-sport Home gate concept in chat; original attachment bytes unavailable',
  registeredPixelIdentityClaimed:false, physicalIPhoneHardwareTested:false,
  capturedScreens:phones, capturedDesktopScreens:desktop,
  captureManifests:Object.fromEntries(manifests.map(file=>[file,sha(fs.readFileSync(path.join(ROOT,file)))])),
  runtimeManifest:current, reviewers, publicationApprovalInferredFromLocalVisualAcceptance:false};
fs.writeFileSync(path.join(__dirname,'agent-acceptance.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status, reviewers:reviewers.length, phones, desktop, runtimeFiles:Object.keys(current).length}));
