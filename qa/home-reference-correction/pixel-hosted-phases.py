#!/usr/bin/env python3
"""Read-only visibility and regional movement of saved genuine hosted PNGs."""
import sys,json,hashlib,math
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
folder=Path(sys.argv[1]); raw=(folder/'results.json').read_bytes(); report=json.loads(raw)
assert report['status']=='passed' and report['browserClosed']
result={'status':'passed','sourceReportSha256':hashlib.sha256(raw).hexdigest(),'readOnlyAnalysis':True,'images':{},'results':[],'qualification':'Original browser image bytes remain unchanged. Rectangles are cropped only in memory for analysis. Uniform/blank paints are rejected separately from changed-paint checks. Region differences include genuine local backgrounds; this is not per-diamond animation, frame-rate, physical-device or registered approved-reference certification.'}
def proofs(obj):
 if isinstance(obj,dict):
  if str(obj.get('file','')).endswith('.png') and 'sha256' in obj:
   p=folder/obj['file']; body=p.read_bytes();assert hashlib.sha256(body).hexdigest()==obj['sha256']; im=Image.open(p).convert('RGB'); colors=im.getcolors(im.width*im.height);stats={'sha256':obj['sha256'],'bytes':len(body),'dimensions':im.size,'distinctRGBColours':len(colors),'channelExtrema':im.getextrema()};assert stats['distinctRGBColours']>1000,('Visible non-uniform genuine Home/NFL capture required',p);result['images'][obj['file']]=stats
  for v in obj.values():proofs(v)
 elif isinstance(obj,list):
  for v in obj:proofs(v)
proofs(report)
for r in report['results']:
 pairs=[('natural',r['motion']['paintA'],r['motion']['paintB']),('reduced-restored',r['motion']['resumedPaintA'],r['motion']['resumedPaintB']),('returned-home',r['returnPaintA'],r['returnPaintB'])]
 for phase,pa,pb in pairs:
  a,b=[Image.open(folder/p['file']).convert('RGB') for p in [pa,pb]];assert a.size==b.size;scale=a.width/r['viewport']['width'];assert scale==2
  row={'viewport':r['viewport'],'phase':phase,'pair':[pa['file'],pb['file']],'regions':{}}
  for name,key in [('ringAndField','gate'),('gemstoneEnter','entry'),('selectorPerimeters','dock'),('brandLighting','brand')]:
   v=r['originals'][0]['geometry'][key];box=(max(0,math.floor(v['x']*scale)),max(0,math.floor(v['y']*scale)),min(a.width,math.ceil(v['right']*scale)),min(a.height,math.ceil(v['bottom']*scale)));diff=ImageChops.difference(a.crop(box),b.crop(box));ch=diff.split();mx=ImageChops.lighter(ImageChops.lighter(ch[0],ch[1]),ch[2]);hist=mx.histogram();changed=sum(hist[2:]);total=mx.width*mx.height
   row['regions'][name]={'pixelBounds':box,'pixels':total,'changedPixelsOver1RGB':changed,'changedFractionOver1RGB':changed/total,'changedPixelsOver10RGB':sum(hist[11:]),'meanChannelChange':ImageStat.Stat(diff).mean,'changedBounds':mx.getbbox()}
   if name in ['ringAndField','selectorPerimeters']:assert changed>0,('Natural actual perimeter paint must change',phase,name)
  result['results'].append(row)
path=folder/'pixel-phase-motion.json';assert not path.exists();body=(json.dumps(result,indent=2)+'\n').encode();path.write_bytes(body)
print(json.dumps({'status':'passed','images':len(result['images']),'file':str(path),'sha256':hashlib.sha256(body).hexdigest(),'regions':[{'viewport':x['viewport'],'phase':x['phase'],'changes':{k:v['changedFractionOver1RGB'] for k,v in x['regions'].items()}} for x in result['results']]}))
