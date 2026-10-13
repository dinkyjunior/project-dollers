"""Read-only scope and preservation gate for the smaller Home refinement."""
import datetime, hashlib, json, pathlib, subprocess
from html.parser import HTMLParser

ROOT=pathlib.Path('/workspace/project-dollers')
OUT=pathlib.Path('/workspace/.onboarding/home-interiors-preservation')
context=json.loads((OUT/'baseline-context.json').read_text())
manifest=json.loads((OUT/'protected-manifest.json').read_text())
failures=[]
for name,expected in manifest.items():
    p=ROOT/name
    if not p.is_file():
        failures.append({'path':name,'issue':'missing protected file'})
        continue
    body=p.read_bytes()
    actual=hashlib.sha256(body).hexdigest()
    if actual!=expected['sha256'] or len(body)!=expected['bytes']:
        failures.append({'path':name,'issue':'protected production content changed','expected':expected['sha256'],'actual':actual})

before=(OUT/'baseline-index.html').read_text()
after=(ROOT/'index.html').read_text()
marker='<section class="page nfl-premium-dashboard'
tail_same=before[before.index(marker):]==after[after.index(marker):]
if not tail_same:failures.append({'path':'index.html','issue':'NFL or later research markup changed'})

class Includes(HTMLParser):
    def __init__(self):super().__init__();self.items=[]
    def handle_starttag(self,tag,attrs):
        if tag not in {'script','link'}:return
        d=dict(attrs);target=d.get('src') if tag=='script' else d.get('href')
        if not target or target.startswith(('assets/home-editorial.css','assets/home-editorial.js')):return
        self.items.append((tag,attrs))

p=Includes();p.feed(before);q=Includes();q.feed(after)
includes_same=p.items==q.items
if not includes_same:failures.append({'path':'index.html','issue':'existing non-Home asset include/order changed'})

head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
dirty=subprocess.check_output(['git','status','--short'],cwd=ROOT,text=True).splitlines()
required={name:{'sha256':manifest[name]['sha256'],'bytes':manifest[name]['bytes'],'unchanged':not any(f.get('path')==name for f in failures)} for name in context['requiredUnchangedArt']}
result={'status':'passed' if not failures else 'failed','baselineProductionCommit':context['baselineProductionCommit'],'candidateBaseCommit':head,'workingTreeStatus':dirty,'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protectedFiles':len(manifest),'dataFiles':context['dataFiles'],'NFLAndLaterMarkupByteIdentical':tail_same,'existingNonHomeIncludesIdentical':includes_same,'requiredUnchangedArt':required,'currentHomeSourceHashes':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['index.html','assets/home-editorial.css','assets/home-editorial.js']},'failures':failures,'qualification':'Working Home candidate bound by current source hashes. Data/production preservation is not provider freshness or hosted verification. Only Home CSS/JS, non-NFL scenes and Home markup may change.'}
(OUT/'preservation-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','baselineProductionCommit','candidateBaseCommit','protectedFiles','dataFiles','NFLAndLaterMarkupByteIdentical','existingNonHomeIncludesIdentical','requiredUnchangedArt','failures']},indent=2))
raise SystemExit(0 if not failures else 1)
