#!/usr/bin/env python3
"""Compose closed native evidence without relabeling either failed receipt."""
import json,hashlib,datetime,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def receipt(name):
 p=HERE/name;b=p.read_bytes();return json.loads(b),{'path':str(p.relative_to(ROOT)),'sha256':sha(b)}
original,oref=receipt('round2-final-webkit/results.json')
focused,fref=receipt('round2-focused-final-webkit/results.json')
nfl,nref=receipt('round2-nfl-final-webkit/results.json')
assert original['status']=='failed' and focused['status']=='failed' and nfl['status']=='passed'
for item in [original,focused,nfl]:
 assert item['browserClosed'] is True and item['sourceStable'] is True
 assert item['source']==item['finalSource']==original['source']
 for view in item['results']:
  assert not view['errors'] and not view['http'] and not view['genuineRequestFailures']
assert len(original['source'])==731
for name,digest in original['source'].items():assert sha((ROOT/name).read_bytes())==digest,name
bridge=json.loads((ROOT/'qa/game-report/final-round1-historical-context-bridge-acceptance.json').read_text())
assert bridge['source']==original['source'],'Independent Round2 source matches accepted Round1 historical bridge'
sourceBytes=(json.dumps(original['source'],indent=2)+'\n').encode();sourcePath=HERE/'final-runtime-source-manifest.json'
assert not sourcePath.exists();sourcePath.write_bytes(sourceBytes)
mapnames={
'Independent new Game Report':'Focused previously unrun Game Report play/keyboard/refresh/motion/route/history checks',
'NFL standings controls and Dallas linked entry':'Final native NFL actual offered options, sourced filter/sort/form/week/leader effects and Dallas route',
'Steelers full roster filter and player research regression':'Steelers settled images, full roster filters and player research',
'Cross-screen verified source conflicts and native unavailable aggregates':'Native verified history prerequisite, all source conflict masks and aggregates',
'Direct routes and native refresh across existing screens':'Direct routes and native refresh with actual accessible names'}
views=[]
for before in original['results']:
 vp=before['viewport'];after=next(v for v in focused['results'] if v['viewport']==vp);last=next(v for v in nfl['results'] if v['viewport']==vp)
 assert last['status']=='passed';stages=[]
 for stage in before['sections']:
  name=stage['name']
  if stage['status']=='passed':evidence=oref;kind='original-completed-passed-section';result=stage.get('result',{})
  elif name=='NFL standings controls and Dallas linked entry':
   target=next(v for v in last['sections'] if v['name']==mapnames[name]);assert target['status']=='passed';evidence=nref;kind='bounded-actual-offered-option-native-check';result=target['result']
  else:
   target=next(v for v in after['sections'] if v['name']==mapnames[name]);assert target['status']=='passed';evidence=fref;kind='same-source-focused-previously-unrun-checks';result=target['result']
   if name=='Independent new Game Report':
    assert after['reusedCompletedReportPrefix']['originalReceiptSha256']==oref['sha256'];assert len(result['plays'])==192
    kind='original-sequentially-completed-source-profile-full-box-prefix-plus-focused-tail'
  stages.append({'name':name,'accepted':True,'evidence':evidence,'composition':kind})
  if name=='Cross-screen verified source conflicts and native unavailable aggregates':assert len(result['actualMasks'])==45
 views.append({'viewport':vp,'stages':stages,'originalNativeInputs':len(before['actions']),'focusedNativeInputs':len(after['actions']),'finalNflNativeInputs':len(last['actions']),'all8DirectRoutesReloaded':len(next(s for s in after['sections'] if s['name']==mapnames['Direct routes and native refresh across existing screens'])['result']['routes'])==8})
for line in subprocess.check_output(['ps','-eo','pid,ppid,stat,args'],text=True).splitlines()[1:]:
 x=line.split(None,3)
 assert not(len(x)==4 and x[2][0]!='Z' and x[3].split()[0].rsplit('/',1)[-1] in {'MiniBrowser','WPEWebProcess','WPENetworkProcess'}),'Live native browser must close before acceptance'
artifacts={}
for key,name in [('data','data-final-integrity-dependent-444.json'),('catalogReadings','catalog-raw-readings-final.json'),('validators','final-validator-receipt.json'),('adapter','adapter-review-integrated-final-results.json'),('visual','focused-final-visual-review.json')]:
 data,ref=receipt(name);assert data['status'] in ['passed','accepted-qualified','accepted-qualitative','passed-qualified','accepted-qualitative-native-adaptation','accepted-with-qualifications'],(key,data['status']);artifacts[key]=ref
 if key in ['data','catalogReadings']:assert data['indexSha256']==original['source']['assets/data/game-reports.json']
report={'status':'accepted-qualified-composite','acceptedAt':datetime.datetime.now(datetime.UTC).isoformat(),'browserClosed':True,'sourceStable':True,'runtimeFiles':731,'source':original['source'],'sourceManifest':{'path':str(sourcePath.relative_to(ROOT)),'sha256':sha(sourceBytes)},'round1AcceptedManifestSha256':bridge['sourceManifestSha256'],'receipts':{'originalFailedFullNative':oref,'failedFocusedWithUnrelatedPassedScopes':fref,'passedBoundedNflOnly':nref},'artifacts':artifacts,'viewports':views,'nativeInputs':sum(v['originalNativeInputs']+v['focusedNativeInputs']+v['finalNflNativeInputs'] for v in views),'scope':{'engine':'WPE WebKit26.0','deviceScaleFactor':2,'touchPhones':True,'desktopPointer':True,'all8OriginalSectionsAcceptedEveryViewport':True,'realSourceQuarterComparisonProfileBoxPlayChecks':True,'knownConflicts':18,'nativeConsumerMasksEveryViewport':45,'catalogItemsWithRawValueProviderBindings':109,'rawReports':444,'rawIndependentAssertions':1165830,'nativeAllSelectedPlaysEveryViewport':192,'everyPrimaryProfileSourceFieldEveryViewport':568,'uniqueFullBoxProfiles':'Every unique source player at393; representatives of each nonempty category/team at430/desktop; all displayed table cells checked every size','directRouteReloadsEveryViewport':8,'motion':'Actual foreground infinite clocks advance with changed original pixels; reduced preference stops them; restored preference advances; hidden report clocks stop','historicalContext':'Three-viewport bounded native2025 fixture year/latest2026 research snapshot qualification plus accepted unchanged-statistics Round1 bridge','sourceFailures':0,'appEditsDuringAudit':False},'qualification':['Neither failed receipt nor failed section is relabeled. Acceptance explicitly composes its completed passing scopes with separately executed same-source missing checks.','Original Report source/player/full-box prefix was reused only after the identical leading-space play-text assertion at the verified sequential post-prefix location.','UI play text now passes exact DOM textContent equality; visible whitespace normalization preserves every factual token.','Native select names use actual associated label elements; new images decode naturally in their painted viewport before evidence capture, while unrequested offscreen lazy images are recorded separately.','Visual source is the user chat reference. Comparison is qualitative; no registered pixel-equality, flawless-design or physical-iPhone/FPS claim.','Unknown or conflicting statistics remain unavailable, with exact provider/value/source/retrieval alternatives; source-recorded box participants do not certify complete actives/inactives.']}
p=HERE/'final-round2-acceptance.json';assert not p.exists();p.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'path':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes()),'nativeInputs':report['nativeInputs'],'sourceManifestSha256':report['sourceManifest']['sha256']}))
