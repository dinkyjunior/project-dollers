import json,sys,hashlib
from pathlib import Path
from PIL import Image
p=Path(sys.argv[1]);g=json.loads(sys.argv[2]);vw=float(sys.argv[3]);im=Image.open(p).convert('RGB');scale=im.width/vw
rect=tuple(round(z*scale) for z in [g['x']+g['width']*.18,g['y']+g['height']*.36,g['x']+g['width']*.30,g['y']+g['height']*.64]);sample=im.crop(rect);colors=sample.getcolors(sample.width*sample.height)
print(json.dumps({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'pixelRect':rect,'distinctColors':len(colors),'maxChannel':max(max(p) for _,p in colors),'photographicVenuePresent':len(colors)>1000 and max(max(p) for _,p in colors)>80,'readOnlyActualOriginal':True}))
