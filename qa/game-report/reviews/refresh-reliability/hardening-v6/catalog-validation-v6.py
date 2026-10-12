import sys,copy,hashlib,importlib.util,json,pathlib,shutil,datetime
sys.dont_write_bytecode=True
ROOT=pathlib.Path('/workspace/project-dollers');OUT=pathlib.Path('/workspace/recovery-qa/game-report-refresh-review/hardening-v6');script=ROOT/'scripts/refresh-game-reports.py';starting=hashlib.sha256(script.read_bytes()).hexdigest();s=importlib.util.spec_from_file_location('gr_catalog',script);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
protected=[ROOT/'assets/data/game-reports.json',ROOT/'assets/data/team-details.json',ROOT/'assets/data/matchup-breakdown.json',ROOT/'assets/data/player-history.json',*list((ROOT/'assets/data/game-reports').glob('*.json'))]
def bodies():return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
before=bodies();base=OUT/'fixtures'/'catalog-validator';data=base/'assets/data';data.mkdir(parents=True,exist_ok=True);details=data/'game-reports';shutil.copytree(OUT/'fixtures/catalog-details',details)
for name in ('team-details.json','matchup-breakdown.json','player-history.json'):shutil.copyfile(ROOT/'assets/data'/name,data/name)
T=json.loads((data/'team-details.json').read_bytes());M=json.loads((data/'matchup-breakdown.json').read_bytes());index=json.loads((ROOT/'assets/data/game-reports.json').read_bytes());m.ROOT=base
for gid,entry in index['games'].items():
 path=details/f'{gid}.json';r=json.loads(path.read_bytes());entry.update(sha256=m.digest(path),bytes=path.stat().st_size,disagreementCount=len(r.get('disagreements',[])),datasetStatus='partial' if r.get('disagreements') else r['verification']['status'])
index['dependencies']={'teamDetailsSha256':m.digest(data/'team-details.json'),'matchupBreakdownSha256':m.digest(data/'matchup-breakdown.json'),'playerHistorySha256':m.digest(data/'player-history.json')};index['integrityCatalog']={'schemaVersion':1,'dependencies':copy.deepcopy(index['dependencies'])};index['knownDisagreements']=m.disagreement_catalog(index['games'],details,T,M);ip=data/'game-reports.json';ip.write_text(json.dumps(index));checks=[]
def record(n,v,**kw):checks.append(dict(case=n,passed=bool(v),**kw))
try:result=m.validate(ip,details);record('whole-444-reconciled-catalog-validates',result['games']==444 and result['verified']==444,result=result)
except Exception as e:record('whole-444-reconciled-catalog-validates',False,error=repr(e))
def rejects(name,obj):
 ip.write_text(json.dumps(obj))
 try:m.validate(ip,details);record(name,False)
 except (AssertionError,KeyError,ValueError):record(name,True)
 finally:ip.write_text(json.dumps(index))
t=copy.deepcopy(index);t['knownDisagreements'].pop();rejects('catalog-row-omission-rejected',t)
t=copy.deepcopy(index);t['knownDisagreements'][0]['week']+=1;rejects('catalog-context-tamper-rejected',t)
t=copy.deepcopy(index);t['knownDisagreements'][0]['reportSha256']='0'*64;rejects('catalog-body-hash-tamper-rejected',t)
t=copy.deepcopy(index);t['knownDisagreements'][0]['values']=['wrong'];rejects('catalog-alternative-tamper-rejected',t)
t=copy.deepcopy(index);t['integrityCatalog']['dependencies']['playerHistorySha256']='0'*64;rejects('catalog-dependency-tamper-rejected',t)
t=copy.deepcopy(index);t.pop('integrityCatalog');rejects('missing-catalog-rejected',t)
path=data/'player-history.json';old=path.read_bytes();path.write_bytes(old+b'\n')
try:m.validate(ip,details);record('player-history-byte-drift-rejected',False)
except AssertionError as e:record('player-history-byte-drift-rejected','player-history' in str(e),error=str(e))
finally:path.write_bytes(old)
# Restore one conflicting report to its otherwise source-verified unpropagated body and rebind catalogue: validator must still reject it.
gid='2026_03_MIN_TB';path=details/f'{gid}.json';old=path.read_bytes();path.write_bytes((pathlib.Path('/workspace/recovery-qa/game-report-before-integrity')/path.name).read_bytes());t=copy.deepcopy(index);t['games'][gid]['sha256']=m.digest(path);t['games'][gid]['bytes']=len(path.read_bytes());t['knownDisagreements']=m.disagreement_catalog(t['games'],details,T,M);ip.write_text(json.dumps(t))
try:m.validate(ip,details);record('known-conflict-missing-propagation-rejected',False)
except AssertionError as e:record('known-conflict-missing-propagation-rejected','Known research-source' in str(e),error=str(e))
finally:path.write_bytes(old);ip.write_text(json.dumps(index))
record('production-bodies-unchanged',before==bodies());record('source-stable',starting==hashlib.sha256(script.read_bytes()).hexdigest())
receipt=dict(createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),scriptSha256=starting,helperSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),cases=checks,totalCases=len(checks),failures=[c for c in checks if not c['passed']],scope='Full444 report validation in isolated root; production source/data read-only; no provider/browser requests')
(OUT/'catalog-validation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
