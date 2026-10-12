#!/usr/bin/env python3
import copy, hashlib, importlib.util, io, json, pathlib, sys, tempfile, contextlib
sys.dont_write_bytecode=True
ROOT=pathlib.Path('/workspace/project-dollers'); OUT=pathlib.Path('/workspace/recovery-qa/game-report-refresh-review/hardening-v4')
IMPORTED_SOURCE_SHA=hashlib.sha256((ROOT/'scripts/refresh-game-reports.py').read_bytes()).hexdigest()
s=importlib.util.spec_from_file_location('review_gr',ROOT/'scripts/refresh-game-reports.py'); m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
T=json.loads((ROOT/'assets/data/team-details.json').read_bytes()); M=json.loads((ROOT/'assets/data/matchup-breakdown.json').read_bytes()); IDX=json.loads((ROOT/'assets/data/game-reports.json').read_bytes())
G=next(g for t in T['teams'].values() for g in t.get('games',[]) if g.get('id')=='2026_04_DAL_HOU')
CACHE=pathlib.Path('/workspace/recovery-qa/game-report-source-cache'); S=json.loads((CACHE/'espn-summary-401872967.json').read_bytes()); META=json.loads((CACHE/'espn-summary-401872967.meta.json').read_bytes())
SOURCES={x['id']:x for x in [*T['sources'],*M['sources']]}
protected=[ROOT/'assets/data/'+pathlib.Path(p) if False else ROOT/p for p in ['scripts/refresh-game-reports.py','scripts/refresh-data.py','assets/data/current.json','assets/data/team-details.json','assets/data/matchup-breakdown.json','assets/data/player-history.json','assets/data/game-reports.json']]
protected += list((ROOT/'assets/data/game-reports').glob('*.json'))
def hashes():return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
BEFORE=hashes(); cases=[]
def record(name,passed,**kw):cases.append(dict(case=name,passed=bool(passed),**kw))
def normalize(s):return m.normalize_report(G,s,META,SOURCES,{}, {})
for key,value in [('header',None),('boxscore',None),('drives',None),('gameInfo',None),('scoringPlays',None)]:
 d=copy.deepcopy(S);d[key]=value
 try:
  r=normalize(d); record('provider-null-'+key,True,status=r['verification']['status'])
 except Exception as e:record('provider-null-'+key,False,error=repr(e))
for path,value in [(('header','competitions'),None),(('boxscore','teams'),None),(('boxscore','players'),None),(('drives','previous'),None),(('drives','current'),None)]:
 d=copy.deepcopy(S);d[path[0]][path[1]]=value
 try:r=normalize(d);record('provider-null-'+'-'.join(path),True,status=r['verification']['status'])
 except Exception as e:record('provider-null-'+'-'.join(path),False,error=repr(e))
for key in ('boxscore','drives','gameInfo','scoringPlays'):
 d=copy.deepcopy(S);d.pop(key,None)
 try:r=normalize(d);record('provider-absent-'+key,True,status=r['verification']['status'])
 except Exception as e:record('provider-absent-'+key,False,error=repr(e))
record('null-number-not-zero',all(m.numeric(v) is None for v in [None,'','--','—','-','N/A','NaN','inf','garbage']))
record('real-zero-preserved',m.numeric('0')==0)
record('strict-ssl-cert-and-hostname',m.refresh.verified_ssl_context().verify_mode==2 and m.refresh.verified_ssl_context().check_hostname)
oldroot=m.ROOT; original_fetch=m.fetch_summary

def fixture(name,game=G):
 base=OUT/'fixtures'/name;base.mkdir(parents=True,exist_ok=True)
 data=base/'assets/data';(data/'game-reports').mkdir(parents=True,exist_ok=True)
 team=copy.deepcopy(T);team['teams']={'DAL':dict(games=[copy.deepcopy(game)])}
 matchup=copy.deepcopy(M);matchup['teams']={}
 (data/'team-details.json').write_text(json.dumps(team));(data/'matchup-breakdown.json').write_text(json.dumps(matchup));(data/'player-history.json').write_bytes((ROOT/'assets/data/player-history.json').read_bytes())
 report=json.loads((ROOT/'assets/data/game-reports'/f"{game['id']}.json").read_bytes()); entry=copy.deepcopy(IDX['games'][game['id']]);index=copy.deepcopy(IDX);index['games']={game['id']:entry};index['eventIdToGameId']={str(game['espnEventId']):game['id']};index['dependencies']={'teamDetailsSha256':m.digest(data/'team-details.json'),'matchupBreakdownSha256':m.digest(data/'matchup-breakdown.json')}
 (data/'game-reports'/f"{game['id']}.json").write_bytes((ROOT/'assets/data/game-reports'/f"{game['id']}.json").read_bytes());index['dependencies']['playerHistorySha256']=m.digest(data/'player-history.json');index['integrityCatalog']={'schemaVersion':1,'dependencies':copy.deepcopy(index['dependencies'])};index['knownDisagreements']=m.disagreement_catalog(index['games'],data/'game-reports',team,matchup);(data/'game-reports.json').write_text(json.dumps(index))
 return base,data,game,entry

def main_call(base,data,extra=()):
 m.ROOT=base;old=sys.argv;sys.argv=['review','--output',str(data/'game-reports.json'),'--detail-dir',str(data/'game-reports'),*extra]
 try:
  with contextlib.redirect_stdout(io.StringIO()):m.main()
 finally:sys.argv=old

base,data,g,entry=fixture('outage-retention');path=data/'game-reports'/f"{g['id']}.json";before=m.digest(path);calls=[]
def outage(event,*args):calls.append(event);return None,dict(id=f'espn_game_report_{event}',url=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event}',status='unavailable',retrievedAt=m.now(),error='isolated outage')
m.fetch_summary=outage;main_call(base,data);new=json.loads((data/'game-reports.json').read_bytes())['games'][g['id']]
record('temporary-outage-retains-verified-report',m.digest(path)==before and new['revalidation']['status']=='unavailable' and new['retrievedAt']==entry['retrievedAt'] and len(calls)==1)
base,data,g,entry=fixture('index-only-context-rebind');path=data/'game-reports'/f"{g['id']}.json";before=m.digest(path)
book=json.loads((data/'team-details.json').read_bytes());book['generatedAt']='2030-01-01T00:00:00Z';(data/'team-details.json').write_text(json.dumps(book));m.ROOT=base
try:m.validate(data/'game-reports.json',data/'game-reports');record('stale-dependency-rejected',False)
except AssertionError:record('stale-dependency-rejected',True)
calls.clear();main_call(base,data,['--index-only']);record('index-only-rebind-retains-bytes-no-network',m.digest(path)==before and not calls)
base,data,g,entry=fixture('index-only-score-mismatch');before=m.digest(data/'game-reports.json');book=json.loads((data/'team-details.json').read_bytes());book['teams']['DAL']['games'][0]['home_score']+=1;(data/'team-details.json').write_text(json.dumps(book));calls.clear()
try:main_call(base,data,['--index-only']);record('index-only-score-mismatch-rejected-before-write',False)
except ValueError:record('index-only-score-mismatch-rejected-before-write',m.digest(data/'game-reports.json')==before and not calls)
base,data,g,entry=fixture('archive-reuse');book=json.loads((data/'team-details.json').read_bytes());book['currentWeek']=7;(data/'team-details.json').write_text(json.dumps(book));path=data/'game-reports'/f"{g['id']}.json";before=m.digest(path);calls.clear();main_call(base,data);record('archival-reuse-retains-bytes-no-network',m.digest(path)==before and not calls)
base,data,g,entry=fixture('context-drift');path=data/'game-reports'/f"{g['id']}.json";before=m.digest(path);oldindex=m.digest(data/'game-reports.json')
def drift(event,*args):
 book=json.loads((data/'team-details.json').read_bytes());book['generatedAt']='2031-01-01T00:00:00Z';(data/'team-details.json').write_text(json.dumps(book));return copy.deepcopy(S),dict(META,checkedAt='2030-01-01T00:00:00Z')
m.fetch_summary=drift
try:main_call(base,data);record('input-drift-guard',False)
except AssertionError as e:
 record('input-drift-guard',True,error=str(e),detailFileChangedBeforeGuard=m.digest(path)!=before,indexFileRetained=m.digest(data/'game-reports.json')==oldindex)
base,data,g,entry=fixture('invalid-scoring-write');path=data/'game-reports'/f"{g['id']}.json";before=m.digest(path);oldindex=m.digest(data/'game-reports.json')
def badscoring(event,*args):
 d=copy.deepcopy(S);d['scoringPlays'][-1]['homeScore']+=1;return d,META
m.fetch_summary=badscoring
try:main_call(base,data);record('invalid-scoring-rejected',False)
except AssertionError as e:
 record('invalid-scoring-rejected',True,error=str(e),detailFileChangedBeforeValidation=m.digest(path)!=before,indexFileChangedBeforeValidation=m.digest(data/'game-reports.json')!=oldindex)
# Malformed JSON whose metadata checksum matches still must not escape as a cached valid object.
cache=OUT/'fixtures'/'malformed-cache';cache.mkdir(parents=True,exist_ok=True);cp=cache/'espn-summary-401872967.json';cp.write_bytes(b'{');meta=dict(META,sha256=m.digest(cp));cp.with_suffix('.meta.json').write_text(json.dumps(meta))
m.fetch_summary=original_fetch
try:
 original_open=m.urllib.request.urlopen; original_sleep=m.time.sleep; calls_cache=[]
 def no_network(request,**kwargs):
  calls_cache.append(request.full_url);raise OSError('Isolated no-network outage')
 m.urllib.request.urlopen=no_network;m.time.sleep=lambda _:None
 result,source=m.fetch_summary('401872967',cache,True);record('malformed-matching-cache-graceful',result is None and source['status']=='unavailable' and len(calls_cache)==3)
except Exception as e:record('malformed-matching-cache-graceful',False,error=repr(e))
m.ROOT=oldroot;m.fetch_summary=original_fetch
# Explicitly inspect missing/null datasets independently of the final-score gate.
for key in ('absent','null'):
 d=copy.deepcopy(S)
 if key=='absent':d.pop('boxscore')
 else:d['boxscore']=None
 r=normalize(d)
 record('boxscore-'+key+'-provenance-unavailable',r['verification']['status']=='verified' and r['provenance']['boxscore']['status']=='unavailable' and {'boxscore','teamStatistics','playerStatistics'}.issubset({u['field'] for u in r['unavailable']}))
# Cache replay checks against exact local byte bodies; urlopen is an isolated stub only.
class Response:
 status=200
 headers={}
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self):return json.dumps(S).encode()
network_calls=[]
def local_response(request,**kwargs):
 network_calls.append(request.full_url)
 assert kwargs['context'].check_hostname and kwargs['context'].verify_mode==2
 return Response()
m.urllib.request.urlopen=local_response
checks=[('valid',None),('tls-false',('tlsVerified',False)),('http-206',('httpStatus',206)),('wrong-byte-count',('bytes',1)),('wrong-url',('url','https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=999999999')),('wrong-hash',('sha256','0'*64)),('naive-timestamp',('retrievedAt','2026-10-12T00:00:00')),('invalid-timestamp',('retrievedAt','invalid')),('wrong-status',('status','unavailable'))]
for name,mutation in checks:
 cache=OUT/'fixtures'/('cache-'+name);cache.mkdir(parents=True,exist_ok=True);cp=cache/'espn-summary-401872967.json';body=json.dumps(S).encode();cp.write_bytes(body);meta=dict(META,bytes=len(body),sha256=m.digest(cp))
 if mutation:meta[mutation[0]]=mutation[1]
 cp.with_suffix('.meta.json').write_text(json.dumps(meta));network_calls.clear();result,source=m.fetch_summary('401872967',cache,True)
 record('cache-'+name+'-validated',result['header']['id']==S['header']['id'] and (not network_calls if name=='valid' else len(network_calls)==1) and source['tlsVerified'] is True and source['httpStatus']==200)
for name,bad in [('wrong-header',dict(S,header=dict(S['header'],id='999999999'))),('invalid-json-type',[]),('malformed-json',b'{')]:
 cache=OUT/'fixtures'/('cache-'+name);cache.mkdir(parents=True,exist_ok=True);cp=cache/'espn-summary-401872967.json';body=bad if isinstance(bad,bytes) else json.dumps(bad).encode();cp.write_bytes(body);meta=dict(META,bytes=len(body),sha256=m.digest(cp));cp.with_suffix('.meta.json').write_text(json.dumps(meta));network_calls.clear();result,source=m.fetch_summary('401872967',cache,True)
 record('cache-'+name+'-rejected',result['header']['id']==S['header']['id'] and len(network_calls)==1)
m.urllib.request.urlopen=original_open;m.time.sleep=original_sleep
# The original failure guards now must retain *both* index and detail bytes.
for c in cases:
 if c['case']=='input-drift-guard':c['passed']=c['passed'] and not c['detailFileChangedBeforeGuard'] and c['indexFileRetained']
 if c['case']=='invalid-scoring-rejected':c['passed']=c['passed'] and not c['detailFileChangedBeforeValidation'] and not c['indexFileChangedBeforeValidation']
# Filesystem install failure at each of the three rename boundaries restores originals.
orig_replace=pathlib.Path.replace
for failpoint in ('old-detail-rename','new-detail-install','new-index-install'):
 base=OUT/'fixtures'/('install-'+failpoint);base.mkdir(parents=True,exist_ok=True);details=base/'details';details.mkdir();(details/'old.json').write_bytes(b'old-detail');index=base/'index.json';index.write_bytes(b'old-index');stage=base/'stage';stage.mkdir();newdetails=stage/'details';newdetails.mkdir();(newdetails/'new.json').write_bytes(b'new-detail');newindex=stage/'index.json';newindex.write_bytes(b'new-index')
 def failed_replace(self,target):
  trigger= (failpoint=='old-detail-rename' and self==details) or (failpoint=='new-detail-install' and self==newdetails) or (failpoint=='new-index-install' and self==base/'.index.json.installing')
  if trigger:raise OSError('Isolated rename failure: '+failpoint)
  return orig_replace(self,target)
 pathlib.Path.replace=failed_replace
 try:
  m.install_candidate(newindex,newdetails,index,details);record('installation-'+failpoint+'-rollback',False)
 except OSError:
  record('installation-'+failpoint+'-rollback',index.read_bytes()==b'old-index' and details.is_dir() and (details/'old.json').read_bytes()==b'old-detail' and not (details/'new.json').exists() and not (base/'.index.json.installing').exists())
 finally:pathlib.Path.replace=orig_replace
# New integrity behavior uses exact game/team/canonical identity, then checksum-bound catalogues.
basic_issues=[i for i in M.get('disagreements',[]) if i.get('field') in (*m.BASIC_FIELDS,'fumbles') and i.get('gameId') and i.get('playerId')]
affected={i['gameId'] for i in basic_issues}
record('five-known-basics-three-reports',len(basic_issues)==5 and len(affected)==3)
changes=[]
for gid in sorted(affected):
 r=json.loads((ROOT/'assets/data/game-reports'/f'{gid}.json').read_bytes());prior=copy.deepcopy(r);changed=m.reconcile_known_player_conflicts(r,M);second=m.reconcile_known_player_conflicts(r,M)
 issues=[i for i in basic_issues if i['gameId']==gid]
 mask_ok=True;all_sources={s['id']:s for s in r['sources']};expected=[]
 for i in issues:
  identity=next(p for p in M['teams'][i['team']]['players'].values() if p['id']==i['playerId']);espn=str(identity['espnId']);p=next(p for p in r['players'][i['team']] if str(p['espnId'])==espn);d=next(d for d in r['disagreements'] if str(d.get('playerId'))==espn and d['field']=='players.'+i['field'] and d.get('team')==i['team']);expected.append((i,identity,d))
  mask_ok &= p['stats'][i['field']] is None and p['provenance']['status']=='disputed' and set(i['values']).issubset(d['values']) and set(i['sourceIds']).issubset(d['sourceIds'])
  mask_ok &= all(all_sources[s]==next(sv for sv in M['sources'] if sv['id']==s) for s in i['sourceIds'])
 record('known-conflict-'+gid+'-null-evidence-idempotent',changed and not second and mask_ok)
 scalar_keys=['id','espnEventId','home_team','away_team','home_score','away_score','season','week','quarters','stats','plays','drives','scoringPlays','retrievedAt']
 record('known-conflict-'+gid+'-unrelated-event-facts-preserved',all(prior[k]==r[k] for k in scalar_keys))
 # Negative contexts never propagate a different team's same-looking player ID or wrong event.
 for kind in ('wrong-game','wrong-team','wrong-gsis'):
  incorrect=copy.deepcopy(M)
  incorrect['disagreements']=[copy.deepcopy(issues[0])]
  if kind=='wrong-game':incorrect['disagreements'][0]['gameId']='2020_01_FAKE_FAKE'
  elif kind=='wrong-team':incorrect['disagreements'][0]['team']='XXX'
  else:incorrect['disagreements'][0]['playerId']='wrong-gsis'
  untouched=copy.deepcopy(prior)
  try:m.reconcile_known_player_conflicts(untouched,incorrect);record('known-conflict-'+gid+'-'+kind+'-refused',untouched==prior)
  except AssertionError:record('known-conflict-'+gid+'-'+kind+'-refused',untouched==prior)
 changes.append((gid,r))
# Copy exact untouched bodies to isolate whole-444 catalog generation; substitute only3 corrected report copies.
import shutil
catalog_dir=OUT/'fixtures'/'catalog-details';shutil.copytree(ROOT/'assets/data/game-reports',catalog_dir)
entries=copy.deepcopy(IDX['games'])
for gid,r in changes:
 m.atomic_json(catalog_dir/f'{gid}.json',r);entries[gid]['sha256']=m.digest(catalog_dir/f'{gid}.json');entries[gid]['bytes']=(catalog_dir/f'{gid}.json').stat().st_size
catalog=m.disagreement_catalog(entries,catalog_dir,T,M)
record('catalog-current104-plus5-equals109',len(catalog)==109 and sum(i['resolution']=='unavailable' for i in catalog)==18 and sum(i['resolution']=='disclosed-alias' for i in catalog)==91)
record('catalog-context-bodyhash-canonical-identity',all(c['reportSha256']==entries[c['gameId']]['sha256'] and c['detailUrl']==entries[c['gameId']]['detailUrl'] and c['season']==entries[c['gameId']]['season'] and c['week']==entries[c['gameId']]['week'] and (c['scope']!='player' or c['playerGsisId'] and c['playerEspnId'] and c['playerName']) for c in catalog))
# Deliberately catalogue known provider-source mapping issue separately: sourceIDs were sortedESPN-first but alternatives primary-first.
for i in basic_issues:
 identity=next(p for p in M['teams'][i['team']]['players'].values() if p['id']==i['playerId']);c=next(c for c in catalog if c['gameId']==i['gameId'] and c['team']==i['team'] and c.get('playerEspnId')==str(identity['espnId']) and c['field']==i['field']);mapped=c.get('sourceValues') or c.get('valueBySourceId') or c.get('valuesBySourceId')
 record('catalog-explicit-source-value-map-'+i['gameId']+'-'+i['field'],bool(mapped),mapping=mapped)
AFTER=hashes();record('production-protected-inputs-unchanged',BEFORE==AFTER);record('source-stable-before-import-through-review',IMPORTED_SOURCE_SHA==BEFORE['scripts/refresh-game-reports.py']==AFTER['scripts/refresh-game-reports.py'])
receipt={'createdAt':m.now(),'sourceSha256':IMPORTED_SOURCE_SHA,'helperSha256':m.digest(__file__),'frozenIndexSha256':m.digest(ROOT/'assets/data/game-reports.json'),'cases':cases,'totalCases':len(cases),'failures':[x for x in cases if not x['passed']],'productionInputsUnchanged':BEFORE==AFTER,'reviewScope':'Read-only source review and isolated temporary fixtures only. No browser or provider requests.'}
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
