#!/usr/bin/env python3
import copy, hashlib, importlib.util, io, json, pathlib, sys, tempfile, contextlib
sys.dont_write_bytecode=True
ROOT=pathlib.Path('/workspace/project-dollers'); OUT=pathlib.Path('/workspace/recovery-qa/game-report-refresh-review')
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
 (data/'team-details.json').write_text(json.dumps(team));(data/'matchup-breakdown.json').write_text(json.dumps(matchup))
 report=json.loads((ROOT/'assets/data/game-reports'/f"{game['id']}.json").read_bytes()); entry=copy.deepcopy(IDX['games'][game['id']]);index=copy.deepcopy(IDX);index['games']={game['id']:entry};index['eventIdToGameId']={str(game['espnEventId']):game['id']};index['dependencies']={'teamDetailsSha256':m.digest(data/'team-details.json'),'matchupBreakdownSha256':m.digest(data/'matchup-breakdown.json')}
 (data/'game-reports'/f"{game['id']}.json").write_bytes((ROOT/'assets/data/game-reports'/f"{game['id']}.json").read_bytes());(data/'game-reports.json').write_text(json.dumps(index))
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
try:m.fetch_summary('401872967',cache,True);record('malformed-matching-cache-graceful',True)
except Exception as e:record('malformed-matching-cache-graceful',False,error=repr(e))
m.ROOT=oldroot;m.fetch_summary=original_fetch
AFTER=hashes();record('production-protected-inputs-unchanged',BEFORE==AFTER)
receipt={'createdAt':m.now(),'sourceSha256':m.digest(ROOT/'scripts/refresh-game-reports.py'),'helperSha256':m.digest(__file__),'frozenIndexSha256':m.digest(ROOT/'assets/data/game-reports.json'),'cases':cases,'totalCases':len(cases),'failures':[x for x in cases if not x['passed']],'productionInputsUnchanged':BEFORE==AFTER,'reviewScope':'Read-only source review and isolated temporary fixtures only. No browser or provider requests.'}
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
