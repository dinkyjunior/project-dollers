import json,hashlib,pathlib,datetime,math
from PIL import Image,ImageChops
root=pathlib.Path('/workspace/project-dollers')
folder=root/'qa/home-reference-correction/hosted-webkit'
reportPath=folder/'results.json'
r=json.loads(reportPath.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert r['status']=='passed' and r['browserClosed'] and r['sourceStable']
assert r['base']=='https://dinkyjunior.github.io/project-dollers/' and r['strictTLS']
assert r['nativeInput'] and not r['DOMStyleClockResponseSubstitution']
assert r['source']==r['finalSource'] and r['dataBodies']==r['finalDataBodies']
assert len(r['source'])==15 and len(r['dataBodies'])==7 and len(r['servedBodies'])==22
for path,h in {**r['source'],**r['dataBodies']}.items():
 assert sha(root/path)==h, path
for row in r['servedBodies']:
 assert row['status']==200 and row['sha256']==row['expectedSha256'] and row['bytes']>0
assert {(x['viewport']['width'],x['viewport']['height']) for x in r['results']}=={(393,852),(430,896)}
images={}
def proofs(obj):
 if isinstance(obj,dict):
  if str(obj.get('file','')).endswith('.png') and 'sha256' in obj:
   p=folder/obj['file'];assert p.is_file() and sha(p)==obj['sha256'],str(p)
   im=Image.open(p).convert('RGB');assert len(im.getcolors(im.width*im.height))>10000, 'Blank/sparse original '+str(p)
   images[obj['file']]=obj['sha256']
  for v in obj.values():proofs(v)
 elif isinstance(obj,list):
  for v in obj:proofs(v)
proofs(r)
for row in r['results']:
 assert row['status']=='passed' and row['errors']==[] and row['http']==[] and row['failures']==[]
 assert {x['sport'] for x in row['originals']}=={'nfl','nba','nrl','ufc'} and len(row['originals'])==4
 assert len(row['actions'])==15
 m=row['motion'];assert m['paintA']['sha256']!=m['paintB']['sha256'] and m['advancing']>0
 assert len(m['first']['paths'])==len(m['second']['paths'])==14
 for a,b in zip(m['first']['paths'],m['second']['paths']):
  assert a['d'].lower().endswith('z') and b['d'].lower().endswith('z') and a['dash']!=b['dash']
 assert m['reduced']['reduced'] and all(x['state']!='running' for x in m['reduced']['clocks'])
 assert not m['resumed']['reduced'] and m['resumed']['state']=='running'
 keyMotion=lambda x:(x['name'],x['index'],x['pseudo'])
 resumed={keyMotion(x):x for x in m['resumed']['clocks']}
 resumedLater={keyMotion(x):x for x in m['resumedLater']['clocks']}
 assert resumed.keys()==resumedLater.keys() and len(resumed)>0
 assert all(resumedLater[k]['state']=='running' and resumedLater[k]['time']>resumed[k]['time']+1 for k in resumed)
 assert m['resumedPaintA']['sha256']!=m['resumedPaintB']['sha256']
 assert all(x['state']!='running' for x in row['inactive']['clocks'])
 key=lambda x:(x['name'],x['index'],x['pseudo'])
 a={key(x):x for x in row['returnMotion']['clocks']}
 b={key(x):x for x in row['returnMotionLater']['clocks']}
 assert a.keys()==b.keys() and len(a)>0
 assert all(b[k]['state']=='running' and b[k]['time']>a[k]['time']+1 for k in a)
 assert row['returnPaintA']['sha256']!=row['returnPaintB']['sha256']
 for pair in [(m['resumedPaintA'],m['resumedPaintB']),(row['returnPaintA'],row['returnPaintB'])]:
  imA,imB=[Image.open(folder/part['file']).convert('RGB') for part in pair]
  assert imA.size==imB.size
  factor=imA.width/row['viewport']['width'];assert factor==2
  geom=row['originals'][0]['geometry']
  for region in ['gate','dock']:
   g=geom[region];box=(max(0,math.floor(g['x']*factor)),max(0,math.floor(g['y']*factor)),min(imA.width,math.ceil(g['right']*factor)),min(imA.height,math.ceil(g['bottom']*factor)))
   d=ImageChops.difference(imA.crop(box),imB.crop(box));rgb=d.split();maximum=ImageChops.lighter(ImageChops.lighter(rgb[0],rgb[1]),rgb[2]);assert sum(maximum.histogram()[2:])>0, 'Actual resumed '+region+' paint must change'
 for img in row['originals']:
  g=img['geometry'];assert g['navCount']==0 and len(g['controls'])==5
  assert g['docWidth']<=g['viewport']['width']+1
  for c in g['controls']:
   assert c['width']>=44 and c['height']>=44
   if not c['disabled']:assert c['hit']
   if c.get('sport'):assert c['text'].strip()==''
receipt={'status':'passed','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reportSha256':sha(reportPath),'productionCommit':'5e8e1f1d3918dc8432a88cb2ba690a809a748d61','scopedExactBodies':22,'viewports':['393x852','430x896'],'nativeActions':30,'verifiedOriginalPNGs':len(images),'errors':0,'httpFailures':0,'failedOrCancelledRequests':0,'visibleOriginalPNGs':True,'settledReducedRestorationMotionAdvances':True,'settledReturnMotionAdvances':True,'bothRestoredPairsRingAndSelectorPaintChanges':True,'immediateReturnTimingCertified':False,'retainedAnimationPhaseCertified':False,'physicalIPhoneCertified':False,'pixelIdenticalApprovedReference':False,'sourceScope':'15 Home files plus seven current-data files; not entire historical repository'}
(folder/'independent-acceptance.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
