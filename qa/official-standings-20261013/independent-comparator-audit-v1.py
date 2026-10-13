#!/usr/bin/env python3
"""Independent synthetic interface audit; never actual official source proof."""
import copy,datetime as dt,hashlib,importlib.util,json,pathlib,subprocess,tempfile
ROOT=pathlib.Path('/workspace/project-dollers');SCRIPT=ROOT/'scripts/compare-nfl-standings.py';TEST=ROOT/'qa/official-standings-compare.test.py';OUT=ROOT/'qa/official-standings-20261013/independent-comparator-audit-v1.json'
BEFORE={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (SCRIPT,TEST)}
spec=importlib.util.spec_from_file_location('independent_comparator',SCRIPT);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
NOW=dt.datetime(2026,10,13,3,0,tzinfo=dt.timezone.utc);STAMP='2026-10-13T02:30:00Z'
GROUPS={'AFC':['KC','PIT','TEN','BAL','NE','MIA','LAC','JAX','NYJ','HOU','LV','BUF','CIN','CLE','DEN','IND'],'NFC':['DAL','NYG','LA','WAS','TB','ARI','ATL','CAR','CHI','DET','GB','MIN','NO','PHI','SEA','SF']}
def fixtures():
 groups={}
 for conf,abbrs in GROUPS.items():
  rows=[]
  for i,abbr in enumerate(abbrs):
   w=i%6;l=5-w
   rows.append({'abbr':abbr,'conference':conf,'w':w,'l':l,'ties':0,'pct':f'{w/5:.3f}','pointsFor':100+i,'pointsAgainst':120-i})
  groups[conf]=rows
 snap={'schemaVersion':1,'season':2026,'currentWeek':5,'throughWeek':5,'retrievedAt':STAMP,'teams':[{'abbr':x['abbr'],'conference':x['conference']} for rs in groups.values() for x in rs],'weeks':{'5':{'throughWeek':5,'conferences':copy.deepcopy(groups)}},'provenance':{'standings':{'sourceIds':['synthetic_primary_only']}}}
 official={'schemaVersion':1,'season':2026,'seasonType':'REG','teams':[copy.deepcopy(x) for rs in groups.values() for x in rs],'source':{'url':'https://www.nfl.com/standings/conference/2026/REG','retrievedAt':STAMP,'sha256':'0'*64,'scopeBasis':'page-content','httpStatus':200,'bytes':1}}
 return snap,official
results=[]
def run(name,fun):
 try:fun();results.append({'name':name,'status':'pass'})
 except Exception as e:results.append({'name':name,'status':'fail','error':f'{type(e).__name__}: {e}'})
def compare(a,b):
 before=copy.deepcopy((a,b));r=mod.compare_snapshot(a,b,now=NOW);assert(a,b)==before,'Comparator mutated supplied inputs';assert'not proof of genuine official retrieval' in r['verificationClaim'];return r
def invalid(a,b):
 try:mod.compare_snapshot(a,b,now=NOW)
 except(mod.InvalidStandings,TypeError,KeyError):return
 raise AssertionError('Malformed or impossible normalized input was accepted')
def matched():
 a,b=fixtures();r=compare(a,b);assert r['status']=='match' and r['teamCount']==32 and all(v==32 for v in r['comparedFields'].values())
run('32 independent synthetic identity rows and six numeric fields match without input mutation',matched)
def historical():
 a,b=fixtures();a['weeks']['4']=copy.deepcopy(a['weeks']['5']);a['weeks']['4']['throughWeek']=3
 for rs in a['weeks']['4']['conferences'].values():
  for x in rs:x.update(w=0,l=3,ties=0,pct='0.000')
 r=compare(a,b);assert r['status']=='match' and r['throughWeek']==5
run('Default compares Current only, ignoring different historical W4 rows',historical)
def reordered():
 a,b=fixtures();b['teams'].reverse();r=compare(a,b);assert r['status']=='match' and len(r['orderDifferences'])==2;assert not all(x['onlyWithinEqualPercentageGroups'] for x in r['orderDifferences'])
run('Even whole source row reversal is separate from numeric equality and never an official seed claim',reordered)
def single_metric(field):
 a,b=fixtures();b['teams'][0][field]+=1;r=compare(a,b);assert r['status']=='mismatch';assert {'team':'KC','field':field,'official':b['teams'][0][field],'primary':a['weeks']['5']['conferences']['AFC'][0][field]} in r['differences']
for field in('w','l','ties','pointsFor','pointsAgainst'):run(f'One {field} disagreement fails match and preserves both values',lambda f=field:single_metric(f))
def optional():
 a,b=fixtures()
 for x in b['teams']:
  for field in('pct','pointsFor','pointsAgainst'):x[field]=None
 r=compare(a,b);assert r['status']=='match' and len(r['unavailableComparisons'])==96;assert all(r['comparedFields'][f]==0 for f in('pct','pointsFor','pointsAgainst'))
 b['teams'][0]['pointsFor']=0;r=compare(a,b);assert r['status']=='mismatch' and r['differences'][0]['official']==0
run('96 absent optional cells stay unavailable while explicit zero mismatches positive value',optional)
def rounding():
 a,b=fixtures()
 for x in (a['weeks']['5']['conferences']['AFC'][0],b['teams'][0]):x.update(w=1,l=1,ties=1,pct='.500')
 for x in (a['weeks']['5']['conferences']['AFC'][1],b['teams'][1]):x.update(w=2,l=1,ties=0,pct='.667')
 assert compare(a,b)['status']=='match';b['teams'][1]['pct']='.666';assert compare(a,b)['status']=='mismatch'
run('Tie-aware half win and thirds rounding work; differing displayed third fails',rounding)
for abbr,alias in [('LA','LAR'),('JAX','JAC'),('WAS','WSH'),('LAC','SD'),('LV','OAK'),('LA','STL')]:
 def check(abbr=abbr,alias=alias):
  a,b=fixtures();row=next(x for x in b['teams'] if x['abbr']==abbr);row['abbr']=alias;invalid(a,b)
 run(f'Raw alias {alias} rejected at canonical-only normalized boundary for {abbr}',check)
def identities():
 saved=json.loads((ROOT/'assets/data/current.json').read_bytes());actual={x['abbr']:x['conference'] for x in saved['teams']};assert actual=={abbr:conf for conf,arr in GROUPS.items() for abbr in arr};assert actual['LA']=='NFC' and actual['LAC']=='AFC'
run('Guard current identity set matches all32 saved asset/team definitions including distinct Rams LA and Chargers LAC',identities)
for field in('w','l','ties'):
 for value in(None,True,1.5,-1,'2'):
  def check(field=field,value=value):
   a,b=fixtures();b['teams'][0][field]=value;invalid(a,b)
  run(f'Reject malformed required {field}={value!r}',check)
for season_type in('PRE','POST','regular',None):
 def check(season_type=season_type):
  a,b=fixtures();b['seasonType']=season_type;invalid(a,b)
 run(f'Reject actual normalized body non-REG type {season_type!r}',check)
def wrong_season():
 a,b=fixtures();b['season']=2025;invalid(a,b)
run('Requested URL alone cannot override normalized body season2025 mismatch',wrong_season)
for name,change in [('unscopedURL',{'url':'https://www.nfl.com/standings/'}),('wrongHost',{'url':'https://www.nfl.com.evil.test/standings/conference/2026/REG'}),('sourceScopeURLOnly',{'scopeBasis':'requested-url'}),('redirectToWrongScope',{'finalUrl':'https://www.nfl.com/standings/division/2026/REG'}),('blockedHTTP',{'httpStatus':403}),('missingHash',{'sha256':None})]:
 def check(change=change):
  a,b=fixtures();b['source'].update(change);invalid(a,b)
 run(f'Reject malformed source metadata {name}',check)
for stamp in(None,'2026-10-13T02:30:00','2026-10-13T03:06:00Z','2026-10-12T02:59:00Z'):
 def check(stamp=stamp):
  a,b=fixtures();b['source']['retrievedAt']=stamp;invalid(a,b)
 run(f'Reject missing/naive/>5min future/>24h stale clock {stamp!r}',check)
def offset_clock():
 a,b=fixtures();b['source']['retrievedAt']='2026-10-13T13:30:00+11:00';assert compare(a,b)['status']=='match'
run('Explicit Sydney timezone retrieval resolves to actual UTC timestamp',offset_clock)
def missingcoverage():
 a,b=fixtures();del a['throughWeek'];del a['weeks']['5']['throughWeek'];invalid(a,b)
run('Missing coverage cannot pass None==None',missingcoverage)
def float_coverage():
 a,b=fixtures();a['weeks']['5']['throughWeek']=5.0;invalid(a,b)
run('Current row coverage must be actual integer rather than equal numeric float',float_coverage)
def impossible_record():
 a,b=fixtures()
 for x in(a['weeks']['5']['conferences']['AFC'][0],b['teams'][0]):x.update(w=18,l=0,ties=0,pct='1.000')
 invalid(a,b)
run('REG records cannot represent18 regular-season games',impossible_record)
def cli_exit():
 with tempfile.TemporaryDirectory(prefix='pd-independent-official-',dir='/tmp') as temp:
  root=pathlib.Path(temp);a,b=fixtures();stamp=dt.datetime.now(dt.timezone.utc).isoformat();a['retrievedAt']=stamp;b['source']['retrievedAt']=stamp;ap=root/'app.json';bp=root/'normalized.json';out=root/'result.json'
  for expected,mutation in [(0,lambda x:None),(1,lambda x:x['teams'][0].update(pointsFor=999)),(2,lambda x:x.update(seasonType='POST'))]:
   c=copy.deepcopy(b);mutation(c);ap.write_text(json.dumps(a));bp.write_text(json.dumps(c));before=(ap.read_bytes(),bp.read_bytes());p=subprocess.run(['python3',str(SCRIPT),'--snapshot',str(ap),'--official',str(bp),'--output',str(out)],capture_output=True,text=True);assert p.returncode==expected;assert json.loads(p.stdout)==json.loads(out.read_text());assert before==(ap.read_bytes(),bp.read_bytes())
run('Real CLI returns0 match/1 disagreement/2 invalid with exact receipts and unchanged inputs',cli_exit)
after={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in(SCRIPT,TEST)}
receipt={'status':'pass' if all(x['status']=='pass' for x in results) and after==BEFORE else 'fail','reviewedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'Independent synthetic normalized-JSON interface audit; no official source data / external retrieval / HTML parsing / browser / workflow integration claim','sourceHashesBefore':BEFORE,'sourceHashesAfter':after,'sourceStable':after==BEFORE,'cases':len(results),'passed':sum(x['status']=='pass' for x in results),'failed':[x for x in results if x['status']=='fail'],'results':results,'limitations':['Canonical-only interface rejects raw provider aliases; future official adapter must map genuine NFL identities before supplying normalized input.','Valid source URL/hash/time metadata is not proof of source acquisition.','A five-minute future timestamp tolerance permits clock skew, not an unbounded future source.','No official page body exists; user Ravens/Jaguars contradiction remains unresolved and official values unavailable.']};OUT.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='results'},indent=2))
