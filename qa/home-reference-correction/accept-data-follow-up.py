import pathlib,json,hashlib,subprocess,datetime
from PIL import Image,ImageChops
root=pathlib.Path('/workspace/project-dollers');folder=root/'qa/home-reference-correction/hosted-data-follow-up'
p=folder/'results.json';r=json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
assert r['status']=='passed' and r['browserClosed'] and r['sourceStable']
assert r['productionCommit']=='f61ba289a49425a5e9dbe4bf3f94948a60140f0d' and r['pagesRun']==38013206902
assert r['strictTLS'] and r['nativeInputs'] and not r['DOMStyleClockResponseSubstitution']
assert r['base']=='https://dinkyjunior.github.io/project-dollers/'
assert r['viewport']=={'width':393,'height':852} and r['deviceScaleFactor']==2
previousPath=root/'qa/home-reference-correction/hosted-webkit/results.json';previous=json.loads(previousPath.read_text())
assert r['previousHomeReportSha256']==sha(previousPath.read_bytes())
assert r['source']==r['finalSource']==previous['source'] and len(r['source'])==15
assert r['dataBodies']==r['finalDataBodies'] and len(r['dataBodies'])==7
for rel,h in {**r['source'],**r['dataBodies']}.items():assert sha((root/rel).read_bytes())==h,rel
assert len(r['servedDataBodies'])==7
for x in r['servedDataBodies']:assert x['status']==200 and x['bytes']>0 and x['sha256']==x['expectedSha256']==r['dataBodies'][x['path']]
assert r['rootBody']['status']==200 and r['rootBody']['sha256']==r['source']['index.html']
code="const fs=require('fs'),crypto=require('crypto');const v=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'));"
expected=subprocess.check_output(['node','-e',code,str(root/'assets/data/current.json')],text=True)
assert r['loadedCurrent']['serializedSha256']==expected
assert len(r['actions'])==2 and len(r['originals'])==4
for x in r['originals']:
 f=folder/x['file'];assert f.is_file() and sha(f.read_bytes())==x['sha256']
 im=Image.open(f).convert('RGB');assert im.size==(786,1704) and len(im.getcolors(im.width*im.height))>10000
assert r['errors']==r['http']==r['failures']==[]
key=lambda c:(c['name'],c['index'],c['pseudo'])
a={key(c):c for c in r['returnSettled']['clocks']};b={key(c):c for c in r['returnLater']['clocks']}
assert a.keys()==b.keys() and len(a)==161
assert r['returnSettled']['opacity']==r['returnLater']['opacity']=='1'
assert all(b[k]['state']=='running' and b[k]['time']>a[k]['time']+1 for k in a)
imA,imB=[Image.open(folder/r['originals'][i]['file']).convert('RGB') for i in [2,3]]
d=ImageChops.difference(imA,imB);channels=d.split();m=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]);assert sum(m.histogram()[2:])>0
receipt={'status':'passed','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionCommit':r['productionCommit'],'actualPagesRun':r['pagesRun'],'reportSha256':sha(p.read_bytes()),'unchangedFullHomeReportSha256':r['previousHomeReportSha256'],'unchangedHomeSourceFiles':15,'scopedNewDataBodies':7,'loadedCurrentIdentityMatches':True,'verifiedVisibleOriginals':4,'nativeActions':2,'errors':0,'httpFailures':0,'failedOrCancelledRequests':0,'actualReturnedClocksAdvance':161,'qualifications':['One-phone data-only follow-up; the original unchanged Home suite covers both target phones and all sports.','This verifies saved-data integrity and actual loaded identity, not independent upstream verification of every historical fact.','Partial injury-preview omissions do not imply healthy or active status.']}
out=folder/'independent-acceptance.json';assert not out.exists();out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
