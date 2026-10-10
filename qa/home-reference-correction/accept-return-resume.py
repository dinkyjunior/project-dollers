#!/usr/bin/env python3
"""Independent assertions over immutable real WPE return evidence."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageChops
root=Path(__file__).resolve().parents[2];out=root/'qa/home-reference-correction/webkit-return-repro';raw=(out/'results.json').read_bytes();r=json.loads(raw);sha=lambda b:hashlib.sha256(b).hexdigest()
assert r['status']=='captured' and r['browserClosed'] and r['sourceStable']
assert all(sha((root/p).read_bytes())==digest for p,digest in r['source'].items())
result={'status':'passed','engine':'genuine-wpe-webkit','sourceReportSha256':sha(raw),'sourceFiles':r['source'],'sourceStillExact':True,'browserClosed':True,'requestedSampleLabelsAreNotWallTimeGuarantees':True,'retainedHiddenRoutePhaseCertified':False,'qualification':'Natural browser return is initially unpainted/paused in WPE. All161 native clocks run and advance after actual settling; no app/CSS/DOM/clock/response changes were used. Requested wait labels do not equal wall times because browser/tool painting has overhead. Native CSS clocks disappear while inactive and restart on return; retained phase is not certified. No physical iPhone/FPS claim.','results':[]}
for row in r['results']:
 assert row['status']=='captured' and row['errors']==[] and row['http']==[]
 samples={x['label']:x for x in row['samples']};a,b=samples['paint-400'],samples['paint-1000'];ac,bc=a['after']['clocks'],b['after']['clocks'];assert len(ac)==len(bc)==161
 for x,y in zip(ac,bc):
  assert (x['name'],x['targetClass'],x['pseudo'])==(y['name'],y['targetClass'],y['pseudo'])
  assert x['state']==y['state']=='running' and y['time']>x['time']+1
 files=[]
 for sample in [a,b]:
  p=out/sample['paint']['file'];assert sha(p.read_bytes())==sample['paint']['sha256'];files.append(p)
 ia,ib=[Image.open(p).convert('RGB') for p in files];assert ia.size==ib.size and ImageChops.difference(ia,ib).getbbox() is not None
 firstRunning=next(x for s in row['samples'] for x in [s['before'],s['after']] if len(x['clocks'])==161 and all(c['state']=='running' for c in x['clocks']))
 zero=row['immediateBeforePaint']['at']
 result['results'].append({'viewport':row['viewport'],'initialPausedClocks':sum(c['state']=='paused' for c in row['immediateBeforePaint']['clocks']),'firstVerifiedRunningElapsedMs':firstRunning['at']-zero,'runningClocks':161,'allOrderedNativeClocksAdvance':True,'settledSampleElapsedMs':[a['after']['at']-zero,b['after']['at']-zero],'naturalPNGPair':[s['paint'] for s in [a,b]],'actualNaturalPaintChanged':True,'consoleOrJSErrors':row['errors'],'HTTPFailures':row['http']})
p=out/'resume-acceptance.json';assert not p.exists();body=(json.dumps(result,indent=2)+'\n').encode();p.write_bytes(body);print(json.dumps({'status':'passed','path':str(p),'sha256':sha(body),'results':result['results']}))
