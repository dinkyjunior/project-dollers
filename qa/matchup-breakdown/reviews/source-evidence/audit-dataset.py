#!/usr/bin/env python3
"""Independently recompute the published matchup research; never import builders."""
import argparse,collections,csv,datetime,gzip,hashlib,json,math,re,html
from decimal import Decimal,InvalidOperation
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
COUNT_MAP={'completions':'completions','attempts':'attempts','passingYards':'passing_yards','passingTD':'passing_tds','interceptions':'passing_interceptions','sacks':'sacks_suffered','sackYardsLost':'sack_yards_lost','carries':'carries','rushingYards':'rushing_yards','rushingTD':'rushing_tds','receptions':'receptions','targets':'targets','receivingYards':'receiving_yards','receivingTD':'receiving_tds','passingAirYards':'passing_air_yards','passingYardsAfterCatch':'passing_yards_after_catch','passingFirstDowns':'passing_first_downs','passingTwoPointConversions':'passing_2pt_conversions','sackFumbles':'sack_fumbles','sackFumblesLost':'sack_fumbles_lost','rushingFumbles':'rushing_fumbles','rushingFumblesLost':'rushing_fumbles_lost','rushingFirstDowns':'rushing_first_downs','rushingTwoPointConversions':'rushing_2pt_conversions','receivingFumbles':'receiving_fumbles','receivingFumblesLost':'receiving_fumbles_lost','receivingAirYards':'receiving_air_yards','receivingYardsAfterCatch':'receiving_yards_after_catch','receivingFirstDowns':'receiving_first_downs','receivingTwoPointConversions':'receiving_2pt_conversions','specialTeamsTD':'special_teams_tds','fumbles':'fumbles_total','fumblesLost':'fumbles_lost_total'}
PBP_COUNT=('redZoneTargets','redZoneReceptions','redZoneReceivingTD','redZonePassAttempts','redZonePassTD','dropbacks','qbHits','scrambles','scrambleYards','designedRuns','designedRunYards','deepAttempts','deepCompletions','deepYards','redZoneRushAttempts')
def sha(b):return hashlib.sha256(b).hexdigest()
def D(x):
 if x is None or x=='':return None
 try:
  v=Decimal(str(x));return v if v.is_finite() else None
 except InvalidOperation:return None
def near(actual,expected):return (actual is None and expected is None) or actual is not None and expected is not None and abs(D(actual)-expected)<=Decimal('0.050000001')
def csvrows(path):
 with gzip.open(path,'rt',encoding='utf-8-sig',newline='') as f:yield from csv.DictReader(f)
def audit(output):
 b=(ROOT/'assets/data/matchup-breakdown.json').read_bytes();data=json.loads(b);manifest=json.loads((ROOT/'qa/matchup-breakdown/data/source-manifest.json').read_text());sources={s['id']:s for s in data['sources']};archives={s['id']:s for s in manifest['sources'] if s.get('bodyPath')};issues=[];checks=collections.Counter()
 def check(ok,kind,**context):
  checks[kind]+=1
  if not ok:issues.append({'kind':kind,**context})
 check(manifest['snapshotSha256']==sha(b),'sourceManifestDatasetBinding')
 for s in archives.values():
  p=ROOT/s['bodyPath'];saved=p.read_bytes();check(sha(saved)==s['archiveSha256'],'archiveChecksum',sourceId=s['id']);body=saved if s['archiveEncoding']=='original-gzip' else gzip.decompress(saved);check(sha(body)==s['sha256'],'actualResponseChecksum',sourceId=s['id']);check(s['httpStatus']==200 and s['status']=='verified' and bool(s.get('retrievedAt')),'sourceHTTPTime',sourceId=s['id']);check(sources[s['id']]['sha256']==s['sha256'],'datasetSourceBinding',sourceId=s['id'])
 for field,file in [('currentSha256','current.json'),('teamDetailsSha256','team-details.json')]:check(data['dependencies'][field]==sha((ROOT/'assets/data'/file).read_bytes()),'liveDependencyChecksum',field=field)
 check(data['dependencies'].get('startingRoleEvidenceSha256')==sha((ROOT/'qa/matchup-breakdown/data/starting-role-evidence.json').read_bytes()),'reviewedRoleEvidenceDependency')
 games={r['game_id']:r for r in csvrows(ROOT/archives['nflverse_games']['bodyPath']) if r.get('game_type')=='REG'}
 entries={(pid,e['gameId']):(team,pl,e) for team,t in data['teams'].items() for pid,pl in t['players'].items() for e in pl['gameLog']};stats={}
 for sid,s in archives.items():
  if not sid.startswith('nflverse_player_stats'):continue
  for r in csvrows(ROOT/s['bodyPath']):
   key=(r.get('player_id'),r.get('game_id'))
   if key in entries and r.get('season_type')=='REG':check(key not in stats,'uniqueRawPlayerGame',playerGame=key);stats[key]=r
 reviewed=json.loads((Path(__file__).parent/'starting-role-contradictions.json').read_text())
 reviewed_roles={(pid,item['gameId']):item for item in reviewed['contradictions'] for pid in (item['primaryQBId'],item['secondaryQBId'])}
 missing={(item['playerId'],item['gameId']) for item in data['coverage']['startingQBMissingStatistics']}
 def role_evidence(key,e,item=None):
  role=e['started'];proof=role.get('evidence',{});sid=next((sid for sid in role.get('sourceIds',[]) if sid.startswith('espn_start_summary_')),None)
  check(bool(sid) and sid in archives,'independentRoleResponseExists',playerGame=key)
  if not sid or sid not in archives:return
  archive=archives[sid];saved=(ROOT/archive['bodyPath']).read_bytes();body=saved if archive['archiveEncoding']=='original-gzip' else gzip.decompress(saved);response=json.loads(body);article=response.get('article',{});story=' '.join(html.unescape(re.sub('<[^>]+>',' ',article.get('story',''))).split())
  check(bool(proof.get('quote')) and proof['quote'] in story and proof.get('quoteField')=='article.story','actualRoleQuote',playerGame=key)
  check(str(article.get('gameId'))==str(e['espnEventId']) and proof.get('publishedAt')==article.get('published') and proof.get('sha256')==sha(body) and proof.get('retrievedAt')==archive['retrievedAt'],'actualRolePublicationEventResponse',playerGame=key)
  if item:
   check(proof.get('quote')==item['quote'] and sha(body)==item['sha256'],'independentlyFetchedRoleDisagreement',playerGame=key)
   check(role.get('retainedEvidence') is not True and str(proof.get('eventId'))==str(e['espnEventId']) and set(proof.get('sourceIds',[]))=={'nflverse_games',sid},'freshRoleRevalidationMetadata',playerGame=key)
 for key,(team,pl,e) in entries.items():
  r=stats.get(key);g=games.get(e['gameId']);check(g is not None,'actualREGGame',playerGame=key)
  if not g:continue
  canonical=lambda a:{'OAK':'LV','SD':'LAC','STL':'LA','LAR':'LA','JAC':'JAX','WSH':'WAS'}.get(a,a)
  check(e['team'] in (canonical(g['home_team']),canonical(g['away_team'])) and D(g['home_score']) is not None and D(g['away_score']) is not None,'actualREGFinalContext',playerGame=key)
  starter=g['home_qb_id'] if e['team']==canonical(g['home_team']) else g['away_qb_id'];role=e['started'];reviewed_item=reviewed_roles.get(key)
  if reviewed_item:
   if starter==reviewed_item['secondaryQBId']:
    check(role['value']==(key[0]==starter) and role['status']=='verified' and role.get('corroborated') is True,'resolvedProviderStartingAgreement',playerGame=key)
   else:check(role['value'] is None and role['status']=='disputed' and role.get('candidate') is True and role.get('reportedValue')==(key[0]==starter),'explicitDisputedStartingRole',playerGame=key)
   role_evidence(key,e,reviewed_item)
  elif key in missing and not role.get('corroborated'):
   check(role['value'] is None and role['status']=='unavailable' and role.get('candidate') is True,'uncorroboratedRoleUnavailable',playerGame=key)
  else:
   check(role['value']==(key[0]==starter if starter else None),'explicitStartingQB',playerGame=key)
   if role.get('corroborated'):role_evidence(key,e)
  check(e['provenance']['season']==e['season'] and e['provenance']['week']==e['week'] and bool(e['provenance'].get('retrievedAt')),'valueSeasonWeekTime',playerGame=key)
  for f in ('routes','pressures','blitz','blitzes'):check(e['advanced'].get(f) is None,'honestUnavailableAdvanced',playerGame=key,field=f)
  for f,v in e['advanced'].items():
   if v is not None:check(bool(e['advancedProvenance']['fieldSources'].get(f)) and all(sources[sid]['status']=='verified' for sid in e['advancedProvenance']['fieldSources'].get(f,[])),'advancedFieldProvenance',playerGame=key,field=f)
  if not r:
   check(key in missing and key[0]==starter and pl['position']=='QB' and 'nflverse_games' in e['sourceIds'],'explicitMissingStatStartCandidate',playerGame=key)
   check(all(v is None for v in e['stats'].values()),'missingStatsRemainNullNotGPZero',playerGame=key)
   check(e['appearance']['status'] in ('unavailable','verified'),'missingStatAppearanceNotInvented',playerGame=key)
   if e['appearance']['status']=='verified':check(D(e['advanced'].get('snaps')) is not None and D(e['advanced']['snaps'])>0,'missingStatsPositiveSnapAppearance',playerGame=key)
   continue
  check(key not in missing,'actualStatRowNotMissingPlaceholder',playerGame=key)
  check(r['team']==e['team'] and r['opponent_team']==e['opponent'] and int(r['season'])==e['season'] and int(r['week'])==e['week'],'statContext',playerGame=key)
  disputed={d['field'] for d in e.get('disagreements',[])}
  check(e['stats'].get('games')==1,'actualStatisticalGameUnit',playerGame=key)
  for field,column in COUNT_MAP.items():
   expected=D(r.get(column));expected=abs(expected) if field=='sackYardsLost' and expected is not None else expected
   if field in disputed:check(e['stats'][field] is None,'disputedStatNull',playerGame=key,field=field);continue
   check(D(e['stats'].get(field))==expected,'rawCountingStat',playerGame=key,field=field,expected=str(expected),actual=e['stats'].get(field))
  st=e['stats'];ratio=lambda a,z:D(a)/D(z) if D(a) is not None and D(z) is not None and D(z)>0 else None
  rates={'completionPct':None if ratio(st['completions'],st['attempts']) is None else ratio(st['completions'],st['attempts'])*100,'yardsPerAttempt':ratio(st['passingYards'],st['attempts']),'yardsPerCarry':ratio(st['rushingYards'],st['carries']),'yardsPerReception':ratio(st['receivingYards'],st['receptions'])}
  if D(st['attempts']) is not None and D(st['attempts'])>0 and all(D(st[f]) is not None for f in ('completions','passingYards','passingTD','interceptions')):
   clamp=lambda v:min(Decimal('2.375'),max(Decimal(0),v));att=D(st['attempts']);rates['passerRating']=(clamp((D(st['completions'])/att-Decimal('.3'))*5)+clamp((D(st['passingYards'])/att-3)*Decimal('.25'))+clamp(D(st['passingTD'])/att*20)+clamp(Decimal('2.375')-D(st['interceptions'])/att*25))/6*100
  else:rates['passerRating']=None
  for field,value in rates.items():check(near(st.get(field),value),'independentRate',playerGame=key,field=field,expected=str(value),actual=st.get(field))
  for field,components in [('offensiveTD',['rushingTD','receivingTD']),('touchdownsAccountedFor',['passingTD','rushingTD','receivingTD'])]:
   values=[D(st[c]) for c in components];expected=sum(values) if all(v is not None for v in values) else None;check(D(st.get(field))==expected,'touchdownDefinition',playerGame=key,field=field)
 for item in reviewed['contradictions']:
  matches=[c for c in data['coverage']['startingRoleDisagreements'] if c['gameId']==item['gameId'] and set(c['playerIds'])=={item['primaryQBId'],item['secondaryQBId']}]
  g=games[item['gameId']];resolved=item['secondaryQBId'] in {g['home_qb_id'],g['away_qb_id']}
  check(not matches if resolved else len(matches)==1 and matches[0]['status']=='disputed' and matches[0]['evidence']['quote']==item['quote'],'allIndependentlyObservedRoleDisputesRetainedOrResolved',gameId=item['gameId'])
 for team,t in data['teams'].items():
  for pid,pl in t['players'].items():
   if pl['position']!='QB':continue
   coverage=pl['qbStartCoverage'];rows=pl['gameLog'];check(coverage['verifiedCount']==sum(e['started']['value'] is True and e['started']['status']=='verified' for e in rows),'honestVerifiedStartCount',playerId=pid)
   for field,status in [('disputedGameIds','disputed'),('unavailableGameIds','unavailable')]:check(set(coverage[field])=={e['gameId'] for e in rows if e['started'].get('candidate') and e['started']['status']==status},'honestUnresolvedStartCoverage',playerId=pid,field=field)
 # Independent snap mapping from the preserved provider's PFR/GSIS IDs.
 ids={r['pfr_id']:r['gsis_id'] for r in csvrows(ROOT/archives['nflverse_player_ids']['bodyPath']) if r.get('pfr_id') and r.get('gsis_id')}
 for sid,s in archives.items():
  if not sid.startswith('nflverse_snaps_'):continue
  for r in csvrows(ROOT/s['bodyPath']):
   key=(ids.get(r['pfr_player_id']),r['game_id'])
   if key not in entries or r['game_type']!='REG':continue
   e=entries[key][2];check(D(e['advanced']['snaps'])==D(r['offense_snaps']),'exactPlayerSnaps',playerGame=key);check(D(e['advanced']['offensiveSnapPct']) is not None and abs(D(e['advanced']['offensiveSnapPct'])-D(r['offense_pct'])*100)<Decimal('1e-10'),'publishedGameSnapPercentage',playerGame=key)
 # Independently accumulate explicit PBP counters and demand final END GAME marker.
 for sid,s in archives.items():
  if not sid.startswith('nflverse_pbp_'):continue
  count=collections.defaultdict(collections.Counter);target=collections.Counter();ends={};seen=set()
  for r in csvrows(ROOT/s['bodyPath']):
   gid=r['game_id'];g=games.get(gid)
   if not g or r['season_type']!='REG' or not g['home_score'] or not g['away_score']:continue
   seen.add(gid)
   if r.get('desc','').strip()=='END GAME':ends[gid]=D(r.get('total_home_score'))==D(g['home_score']) and D(r.get('total_away_score'))==D(g['away_score'])
   if not r['posteam'] or r.get('play_deleted')=='1' or r['play_type']=='no_play' or r.get('two_point_attempt')=='1':continue
   passer,receiver,rusher=r['passer_player_id'],r['receiver_player_id'],r['rusher_player_id'];red=D(r['yardline_100']) is not None and Decimal(0)<D(r['yardline_100'])<=20;attempt=r['pass_attempt']=='1' and r['sack']!='1'
   if receiver and attempt:
    target[(gid,r['posteam'])]+=1
    if red:
     count[(receiver,gid)]['redZoneTargets']+=1;count[(receiver,gid)]['redZoneReceptions']+=r['complete_pass']=='1';count[(receiver,gid)]['redZoneReceivingTD']+=r['pass_touchdown']=='1'
   qb=passer or (rusher if r['qb_scramble']=='1' else '')
   if qb:
    c=count[(qb,gid)];c['dropbacks']+=r['qb_dropback']=='1';c['qbHits']+=r['qb_hit']=='1'
    if r['qb_scramble']=='1':c['scrambles']+=1;c['scrambleYards']+=D(r['rushing_yards']) or 0
    if red and attempt:c['redZonePassAttempts']+=1;c['redZonePassTD']+=r['pass_touchdown']=='1'
    if attempt and D(r['air_yards']) is not None and D(r['air_yards'])>=20:c['deepAttempts']+=1;c['deepCompletions']+=r['complete_pass']=='1';c['deepYards']+=D(r['passing_yards']) or 0
   if rusher and r['rush_attempt']=='1' and r['qb_scramble']!='1' and r['qb_kneel']!='1':count[(rusher,gid)]['designedRuns']+=1;count[(rusher,gid)]['designedRunYards']+=D(r['rushing_yards']) or 0
   if rusher and red and r['rush_attempt']=='1' and r['qb_kneel']!='1':count[(rusher,gid)]['redZoneRushAttempts']+=1
  coverage=data['coverage']['pbp'][str(s['season'])]
  for gid in coverage.get('completeGames',[]):check(ends.get(gid) is True,'actualPBPGameEnd',gameId=gid)
  valid=set(coverage.get('completeGames',[]))
  for key,(team,pl,e) in entries.items():
   if e['gameId'] not in valid:continue
   for field in PBP_COUNT:check(D(e['advanced'][field])==D(count[key][field]),'explicitPBPCount',playerGame=key,field=field,expected=str(count[key][field]),actual=e['advanced'][field])
   denominator=target[(e['gameId'],e['team'])];check(D(e['advanced']['teamTargets'])==D(denominator),'actualPBPTeamTargetDenominator',playerGame=key)
   expected=D(e['stats']['targets'])/denominator*100 if denominator>0 and D(e['stats']['targets']) is not None else None;check(near(e['advanced']['targetShare'],expected),'targetShareDenominator',playerGame=key)
   db=count[key]['dropbacks'];expected=D(e['stats']['sacks'])/db*100 if db>0 and D(e['stats']['sacks']) is not None else None;check(near(e['advanced']['sackRate'],expected),'sackRateDropbackDenominator',playerGame=key)
 for team,t in data['teams'].items():
  q=t['qbEvidence'];check(q['confirmed'] is False,'projectionNotConfirmation',team=team)
  if q['playerId']:check(q['status']=='inferred' and not any(i['playerId']==q['playerId'] and str(i.get('reportStatus') or '').lower() in ('out','injured reserve','inactive') for i in t['injuries']['players']),'projectedQBAvailability',team=team)
 check(sha((ROOT/'assets/data/matchup-breakdown.json').read_bytes())==sha(b),'datasetUnchangedDuringAudit')
 report={'status':'passed' if not issues else 'failed','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshotSha256':sha(b),'datasetSha256':sha(b),'sourceManifestSha256':sha((ROOT/'qa/matchup-breakdown/data/source-manifest.json').read_bytes()),'auditHelperSha256':sha(Path(__file__).read_bytes()),'method':'Independent Decimal arithmetic and public-response checksum checks; no production imports. Distinct statistical rows, explicit starting QB IDs, snap participation, actual END GAME PBP coverage, raw red-zone/deep/run counts, denominator-safe rates and unavailable/disputed fields. This is numeric/source acceptance only, not browser/visual/release acceptance.','sourcesAudited':len(archives),'playerGameRows':len(entries),'assertions':sum(checks.values()),'checks':dict(checks),'failures':issues}
 out=ROOT/output;assert not out.exists();out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('failures','checks')},indent=2));print('firstFailures',json.dumps(issues[:10]))
 return not issues
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args();raise SystemExit(0 if audit(args.output) else 1)
