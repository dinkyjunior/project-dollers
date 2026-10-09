'use strict';
// A bounded review of the eight actual hosted originals already opened with
// view_image by the sole browser owner; this does not generate or alter pixels.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('../matchup-breakdown/qa.cjs');
const folder=path.join(__dirname,'hosted-webkit'),file=path.join(folder,'results.json');
const bytes=fs.readFileSync(file),report=JSON.parse(bytes);
assert.equal(report.status,'passed');assert.equal(report.browserClosed,true);assert.equal(report.strictTLS,true);
const out=path.join(__dirname,'reviews','hosted-phone-paint.json');assert.ok(!fs.existsSync(out),'Immutable review must be fresh');
const originals=[];
for(const result of report.results){
 assert.ok([393,430].includes(result.viewport.width));assert.equal(result.status,'passed');
 for(const capture of result.captures){
  const image=report.originals.find(v=>v.file===capture.file);assert.ok(image);
  assert.equal(q.SHA(fs.readFileSync(path.join(folder,image.file))),image.sha256);
  assert.equal(image.readiness.settled.page,'home');assert.equal(image.readiness.noStylesClockOrAnimationMutation,true);
  originals.push({file:path.relative(q.ROOT,path.join(folder,image.file)),sha256:image.sha256,bytes:image.bytes,sport:image.sport,viewport:image.viewport,pixelSize:{width:image.readiness.pixels.width,height:image.readiness.pixels.height},nativeEntryPaint:capture.layout.entry,nativeHomeNavCount:capture.layout.navCount,wholePhoneOriginalOpened:true});
 }
}
assert.equal(originals.length,8);
const review={status:'passed-bounded-hosted-phone-paint-review',reviewer:'/root/home_native_qa',completedAt:new Date().toISOString(),report:{file:path.relative(q.ROOT,file),sha256:q.SHA(bytes)},runtimeManifestSha256:report.runtimeManifestSha256,originals,observations:{continuousSmoothChromeCastingAndLightCore:true,expandedVenueOpeningsAndOfficialCentralMarks:true,crystalCapsAndTranslucentReadableEnterOrComingSoon:true,fourTranslucentOfficialIconSelectorsWithNoVisibleNames:true,originalDiamondProjectAndWarmGoldDollarRetained:true,greenMoneyBagUntouched:true,noHomeBottomNavigation:true,noClippedPhoneControlsOrHorizontalOverflow:true,nativeNaturalMotionAndReducedPreferenceEvidenceSeparatelyRecorded:true},qualification:{directWholePhoneOriginalInspection:true,noPixelGenerationOrEditing:true,noDOMCSSResponseClockOverride:true,registeredReferencePixelComparison:false,approvedChatOriginalBinaryAvailable:false,physicalIPhoneOrDeviceFPSCertification:false,scope:'Eight hosted Home sport-state originals at the two requested phone sizes. Motion behavior and protected routes are bound separately to the closed native report; this review does not extend to physical Safari chrome or unobserved provider source responses.'}};
fs.writeFileSync(out,JSON.stringify(review,null,2)+'\n');console.log(JSON.stringify({status:review.status,file:path.relative(q.ROOT,out),sha256:q.SHA(fs.readFileSync(out))}));
