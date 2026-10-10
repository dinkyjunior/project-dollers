#!/usr/bin/env python3
"""Read-only region analysis of untouched natural browser PNG pairs."""
import hashlib,json,math,sys
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
out=Path(sys.argv[1]); raw=(out/'results.json').read_bytes(); report=json.loads(raw)
assert report['status']=='passed' and report['browserClosed']
result={'status':'passed','sourceReportSha256':hashlib.sha256(raw).hexdigest(),'engine':report['engine'],'readOnlyAnalysis':True,'qualification':'Pixel differences are measured on region crops in memory from original untouched natural viewport screenshots. No images are edited or saved, and no DOM, CSS, animation clocks or responses are substituted. A region contains its genuine background; this proves changed regional paint, not animation of every individual diamond or a physical-device frame rate.','results':[]}
for r in report['results']:
    m=r['motion']; paths=[out/m[k]['file'] for k in ['paintA','paintB']]
    for k,p in zip(['paintA','paintB'],paths): assert hashlib.sha256(p.read_bytes()).hexdigest()==m[k]['sha256']
    a,b=[Image.open(p).convert('RGB') for p in paths]; assert a.size==b.size
    scale=a.width/r['viewport']['width']; assert scale==2
    row={'viewport':r['viewport'],'pair':[m[k]['file'] for k in ['paintA','paintB']],'regions':{}}
    g=r['originals'][0]['geometry']
    for name,key in [('ringAndField','gate'),('gemstoneEnter','entry'),('selectorPerimeters','dock'),('brandLighting','brand')]:
        v=g[key];box=(max(0,math.floor(v['x']*scale)),max(0,math.floor(v['y']*scale)),min(a.width,math.ceil(v['right']*scale)),min(a.height,math.ceil(v['bottom']*scale)))
        diff=ImageChops.difference(a.crop(box),b.crop(box)); channels=diff.split(); maximum=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]); hist=maximum.histogram(); changed=sum(hist[2:]); total=diff.width*diff.height
        row['regions'][name]={'nativeRect':v,'pixelBounds':box,'pixels':total,'changedPixelsOver1RGB':changed,'changedFractionOver1RGB':changed/total,'changedPixelsOver10RGB':sum(hist[11:]),'maxRGBChange':max(i for i,n in enumerate(hist) if n),'meanChannelChange':ImageStat.Stat(diff).mean,'changedBoundsWithinRegion':maximum.getbbox()}
        assert changed>0, f'Actual naturally changed {name} region required'
    result['results'].append(row)
body=(json.dumps(result,indent=2)+'\n').encode(); dest=out/'pixel-region-motion.json';assert not dest.exists();dest.write_bytes(body)
print(json.dumps({'status':result['status'],'engine':report['engine'],'file':str(dest),'sha256':hashlib.sha256(body).hexdigest(),'regions':[{ 'viewport':r['viewport'], 'changes':{k:v['changedFractionOver1RGB'] for k,v in r['regions'].items()}} for r in result['results']]}))
