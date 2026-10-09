"""Independent current-book arithmetic, selection and final-source review.

Only the independent QA model is executed. No application or builder is imported.
Python separately selects games/rows and recomputes counts, weighted rates and
eligibility from retained immutable snapshot inputs. Changed outputs are real.
"""
import ast, csv, datetime, hashlib, json, math, pathlib, subprocess, sys
from decimal import Decimal

ROOT = pathlib.Path('/workspace/project-dollers')
BASE = ROOT / 'qa/matchup-breakdown/reviews/source-evidence/incoming-3c1adb0'
AFTER = BASE / 'after/matchup-breakdown.json'
BEFORE = BASE / 'before/matchup-breakdown.json'
book = json.loads(AFTER.read_text())
old = json.loads(BEFORE.read_text())
checks, failures = {}, []

def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def check(ok, kind, context=None):
    checks[kind] = checks.get(kind, 0) + 1
    if not ok: failures.append({'kind': kind, 'context': context})
def numeric(x): return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
def dec(x): return Decimal(str(x))
def same(a, b):
    if numeric(a) and numeric(b): return abs(dec(a)-dec(b)) < Decimal('0.000000001')
    if isinstance(a, dict) and isinstance(b, dict): return a.keys()==b.keys() and all(same(a[k],b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list): return len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
    return a==b
def sort_key(g): return (str(g.get('kickoffUtc') or g.get('gameday') or ''),g['season'],g['week'],str(g.get('id') or g.get('gameId')))
def regular(g): return not g.get('seasonType') or str(g['seasonType']) in ['REG','regular','regular-season','2']
def final(g):
    reports = [book['teams'].get(g[t],{}).get('fixtureReports',{}).get(g['id']) for t in ['home_team','away_team']]
    r = next((r for r in reports if r),None)
    return g.get('status')=='final' and numeric(g.get('home_score')) and numeric(g.get('away_score')) and (r or {}).get('eventStatus',{}).get('state')!='in'
def selected(ab,opt):
    v=lambda g:'neutral' if g.get('neutral') is True else ('home' if g['home_team']==ab else 'away') if g.get('neutral') is False else 'unknown'
    return sorted([g for g in book['teams'][ab]['games'] if final(g) and regular(g) and g['season']<=book['season'] and (opt['season']=='cross' or g['season']==book['season']) and (opt['venue']=='all' or v(g)==opt['venue'])],key=sort_key,reverse=True)[:opt['window']]
def eligible(player,ab,selection):
    ids={g['id'] for g in selection}
    return sorted([r for r in player['gameLog'] if r['gameId'] in ids and r['team']==ab and r.get('appearance',{}).get('status') not in ['DNP','dnp','inactive'] and r.get('appearance',{}).get('value') is not False and (r.get('appearance',{}).get('status')=='verified' or any(numeric(x) for x in r.get('stats',{}).values()))],key=sort_key,reverse=True)
def field(rows,key,mode='total',divisor=None):
    if not rows or any(not numeric(r.get('stats',{}).get(key)) for r in rows):return None
    total=sum((dec(r['stats'][key]) for r in rows),Decimal(0))
    if mode=='average':
        n=len(rows) if divisor is None else divisor
        if n<=0:return None
        total/=n
    return float(total)
def leaders(ab,kind,opt):
    yard='rushingYards' if kind=='rushing' else 'receivingYards';volume='carries' if kind=='rushing' else 'receptions';out=[]
    for p in book['teams'][ab]['players'].values():
        rows=eligible(p,ab,selected(ab,opt));ys=field(rows,yard);vol=field(rows,volume)
        if not rows or ys is None or (kind=='rushing' and (vol is None or vol<=0)) or (kind=='receiving' and not ((field(rows,'targets') or 0)>0 or (vol or 0)>0)):continue
        gp=sum(any(numeric(x) for x in r['stats'].values()) for r in rows)
        keys=['carries','rushingYards','rushingTD'] if kind=='rushing' else ['targets','receptions','receivingYards','receivingTD']
        vals={'GP':gp,**{k:field(rows,k,opt['mode'],gp) for k in keys}}
        if kind=='rushing':vals['rushingYardsPerCarry']=float(dec(ys)/dec(vol)) if vol else None
        out.append({'id':p['id'],'name':p['name'],'rankYards':ys,'rows':[r['gameId'] for r in rows],'values':vals})
    return sorted(out,key=lambda x:(-x['rankYards'],x['name'].casefold()))[:5]
def qb_window(ab,p,opt,opponent=None):
    games={g['id']:g for g in book['teams'][ab]['games']};rows=[]
    for r in p['gameLog']:
        g=games.get(r['gameId']);started=r.get('started',{})
        if g and not final(g):continue
        if not (started.get('candidate') is True or started.get('value') is True) or not regular(r) or r['season']>book['season']:continue
        if opt['season']=='current' and r['season']!=book['season']:continue
        if opt['venue']!='all' and r.get('homeAway')!=opt['venue']:continue
        if opponent is not None and r['opponent']!=opponent:continue
        rows.append(r)
    rows=sorted(rows,key=sort_key,reverse=True)[:opt['window']]
    confirmed=[r for r in rows if r.get('started',{}).get('value') is True and r.get('started',{}).get('status')=='verified']
    return rows,confirmed
def rating(rows):
    a,c,y,t,i=(field(rows,k) for k in ['attempts','completions','passingYards','passingTD','interceptions'])
    if any(v is None for v in [a,c,y,t,i]) or a<=0:return None
    a,c,y,t,i=map(dec,[a,c,y,t,i]);clamp=lambda x:max(Decimal(0),min(Decimal('2.375'),x))
    return float((clamp((c/a-Decimal('.3'))*5)+clamp((y/a-3)/4)+clamp(t/a*20)+clamp(Decimal('2.375')-i/a*25))/6*100)

check(sha(BEFORE)=='e2f6f7ce3296e0835db717b5f7d4eb415898009f09d060a3d853778b8c001401','ExactImmutableBeforeBook')
check(sha(AFTER)=='ea16f6abd01f3b840afe43df2992432ddfc34a08a344f3c29056ca2e8142ce1f','ExactImmutableAfterBook')
node=r"""
const fs=require('fs'),m=require('./qa/matchup-breakdown/model.cjs'),b=JSON.parse(fs.readFileSync(process.argv[1]));const states=[];const fields=['completions','attempts','passingYards','passingTD','interceptions','sacks','sackYardsLost','carries','rushingYards','fumbles','fumblesLost','passingAirYards','passingYardsAfterCatch'];
for(const ab of Object.keys(b.teams).sort())for(const window of[3,5,10])for(const season of['cross','current'])for(const venue of['all','home','away','neutral'])for(const mode of['average','total']){const options={window,season,venue,mode},gs=m.games(b,ab,options),f=m.fixture(b,ab),opponent=f&&(f.home_team===ab?f.away_team:f.home_team),qbs=[];for(const p of Object.values(b.teams[ab].players).filter(p=>p.position==='QB'))for(const scope of['all','opponent']){const q=m.qbWindow(b,ab,p.id,{...options,...(scope==='opponent'?{opponent}:{} )});qbs.push({id:p.id,scope,opponent:scope==='opponent'?opponent:null,candidateIds:q.candidates.map(r=>r.gameId),confirmedIds:q.confirmed.map(r=>r.gameId),unresolvedRoles:q.unresolvedRoles,rolesComplete:q.rolesComplete,fields:Object.fromEntries(fields.map(k=>[k,m.field(q.confirmed,k,mode)])),rating:m.passerRating(q.confirmed)});}states.push({team:ab,options,games:gs.map(g=>g.id),rushing:m.leaders(b,ab,'rushing',options),receiving:m.leaders(b,ab,'receiving',options),playerRows:Object.fromEntries(Object.values(b.teams[ab].players).map(p=>[p.id,m.actualRows(p,ab,gs).map(r=>r.gameId)])),qbs,fixture:f?.id||null,opponent});}process.stdout.write(JSON.stringify(states));
"""
model_output=subprocess.check_output(['node','-e',node,str(AFTER)],cwd=ROOT)
states=json.loads(model_output)
check(len(states)==1536,'All32By48States')
for state in states:
    ab,opt=state['team'],state['options'];context={'team':ab,**opt};games=selected(ab,opt)
    check(state['games']==[g['id'] for g in games],'IndependentCompletedGameSelection',context)
    for kind in ['rushing','receiving']:
        expected=leaders(ab,kind,opt);check(same(state[kind],expected),'IndependentLeaderCountsGPNullsRankAndWeightedRates',{**context,'kind':kind})
    for pid,ids in state['playerRows'].items():
        check(ids==[r['gameId'] for r in eligible(book['teams'][ab]['players'][pid],ab,games)],'IndependentAllPlayerStatEligibility',{**context,'player':pid})
    for q in state['qbs']:
        p=book['teams'][ab]['players'][q['id']];candidates,confirmed=qb_window(ab,p,opt,q['opponent'])
        check(q['candidateIds']==[r['gameId'] for r in candidates] and q['confirmedIds']==[r['gameId'] for r in confirmed],'IndependentRecentRoleCandidatesAndConfirmedStarts',{**context,'player':q['id'],'scope':q['scope']})
        check(q['unresolvedRoles']==len(candidates)-len(confirmed) and q['rolesComplete']==bool(candidates and len(candidates)==len(confirmed)),'UnresolvedNewestRoleRetainsItsSlot',{**context,'player':q['id'],'scope':q['scope']})
        for name,value in q['fields'].items():check(same(value,field(confirmed,name,opt['mode'])),'DecimalQBBasicAggregate',{**context,'player':q['id'],'scope':q['scope'],'field':name})
        check(same(q['rating'],rating(confirmed)),'DecimalNFLPasserRating',{**context,'player':q['id'],'scope':q['scope']})

# New final statistics are compared independently to public provider fields.
summary=json.loads((BASE/'public-source-check/espn-final-summary-401872980.json').read_text());competition=summary['header']['competitions'][0]
check(summary['header']['season']['year']==2026 and summary['header']['season']['type']==2 and summary['header']['week']==5,'IndependentFinalSeasonWeekAndRegularType')
check(competition['status']['type']['state']=='post' and competition['status']['type']['completed'] is True,'IndependentProviderFinalCompletion')
clubs={x['team']['abbreviation']:x for x in competition['competitors']}
check(int(clubs['DAL']['score'])==16 and int(clubs['TB']['score'])==24,'IndependentFinalScoreAndClubIdentity')
provider={x['team']['abbreviation']:{s['name']:s['displayValue'] for s in x['statistics']} for x in summary['boxscore']['teams']}
for ab in ['DAL','TB']:
    game=next(g for g in book['teams'][ab]['games'] if g['id']=='2026_05_TB_DAL');raw=provider[ab];third=list(map(int,raw['thirdDownEff'].split('-')));rz=list(map(int,raw['redZoneAttempts'].split('-')))
    expected={'netPassing':int(raw['netPassingYards']),'rushing':int(raw['rushingYards']),'totalOffense':int(raw['totalYards']),'thirdDownMade':third[0],'thirdDownAttempts':third[1],'redZoneTD':rz[0],'redZoneAttempts':rz[1],'turnovers':int(raw['turnovers']),'penaltyYards':int(raw['totalPenaltiesYards'].split('-')[1])}
    for field_name,value in expected.items():
        check(game['stats'][ab].get(field_name)==value,'IndependentFinalTeamStatistic',{'team':ab,'field':field_name})
        check(game['statsProvenance'][ab]['fieldSources'][field_name]==['team_espn_summary_401872980'],'ExplicitESPNFinalFieldSource',{'team':ab,'field':field_name})
    check(expected['netPassing']+expected['rushing']==expected['totalOffense'],'NetPassingPlusRushTeamTotal',{'team':ab})

# Current weekly-opponent history advances with the research fixture. Shared
# statistical facts remain exact; newly loaded older-opponent records are
# independently checked against their already retained exact public CSVs.
metadata={'retrievedAt','sha256','currentSha256','currentRetrievedAt'}
def facts(v):
    if isinstance(v,list):return [facts(x) for x in v]
    if isinstance(v,dict):return {k:facts(x) for k,x in v.items() if k not in metadata}
    return v
new_rows=[];new_archive_rows=[];secondary_crosscheck_changes=[];removed_archive_rows=[]
mapping_tree=ast.parse((ROOT/'qa/matchup-breakdown/reviews/source-evidence/audit-dataset-final-refresh.py').read_text())
COUNT_MAP=next(ast.literal_eval(n.value) for n in mapping_tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='COUNT_MAP' for t in n.targets))
source_index={s['id']:s for s in book['sources']}
archive_cache={}
def raw_stats(season):
    if season not in archive_cache:
        path=pathlib.Path('/workspace/recovery-qa/matchup-breakdown/data-source-cache')/('stats'+str(season)+'.csv')
        sid='nflverse_player_stats' if season==2026 else 'nflverse_player_stats_'+str(season)
        check(sha(path)==source_index[sid]['sha256'],'ExactRetainedSourceCSVResponseHash',{'season':season,'source':sid})
        with path.open(encoding='utf-8-sig',newline='') as f:archive_cache[season]={(r['player_id'],r['game_id']):r for r in csv.DictReader(f) if r['season_type']=='REG'}
    return archive_cache[season]
with (BASE/'public-source-check/nflverse-final-games.csv').open() as f:source_games=list(csv.DictReader(f))
schedule_index={g['game_id']:g for g in source_games}
for ab,club in book['teams'].items():
    before=old['teams'][ab]
    check(set(club['players'])==set(before['players']),'Unchanged813PlayerIdentityPools',{'team':ab})
    for pid,p in club['players'].items():
        old_rows={r['gameId']:r for r in before['players'][pid]['gameLog']}
        new_ids={r['gameId'] for r in p['gameLog']}
        removed_archive_rows += [{'team':ab,'player':pid,'game':gid} for gid in old_rows if gid not in new_ids]
        for r in p['gameLog']:
            if r['gameId'] in old_rows:
                a,b=facts(old_rows[r['gameId']]),facts(r)
                before_cross,after_cross=a.pop('crosscheck',None),b.pop('crosscheck',None)
                if before_cross!=after_cross:secondary_crosscheck_changes.append({'team':ab,'player':pid,'game':r['gameId'],'before':before_cross,'after':after_cross})
                check(a==b,'PreservedHistoricalStatRoleAndAdvancedRow',{'team':ab,'player':pid,'game':r['gameId']})
            else:
                context={'team':ab,'player':pid,'game':r['gameId']}
                if r['gameId']=='2026_05_TB_DAL':
                    new_rows.append(context)
                    check(ab in ['DAL','TB'] and p['position']=='QB','OnlyNewFinalScheduleRolePlaceholder',context)
                    check(all(x is None for x in r['stats'].values()) and all(x is None for x in r['advanced'].values()),'UnknownWeek5StatsAndAdvancedAreNeverZero',context)
                    check(r['appearance']['status']=='unavailable' and r['started']['candidate'] is True and r['started']['value'] is None and r['started']['status']=='unavailable','UncorroboratedStartNotClaimedConfirmedOrStatisticalGP',context)
                else:
                    new_archive_rows.append(context);raw=raw_stats(r['season']).get((pid,r['gameId']));g=schedule_index.get(r['gameId'])
                    check(raw is not None and g is not None and r['season']<2025,'GenuineRetainedOlderOpponentRecord',context)
                    if raw is None or g is None:continue
                    check(raw['team']==r['team'] and raw['opponent_team']==r['opponent'] and int(raw['season'])==r['season'] and int(raw['week'])==r['week'],'ArchiveOriginalClubOpponentSeasonWeek',context)
                    for name,col in COUNT_MAP.items():
                        rv=raw.get(col);value=None if rv in [None,''] else float(rv);value=abs(value) if name=='sackYardsLost' and value is not None else value
                        check(same(r['stats'].get(name),value),'ArchiveRawCountingCell',{**context,'field':name})
                    check(r['stats']['games']==1,'ArchiveActualStatisticalGameUnit',context)
                    check(all(x is None for x in r['advanced'].values()),'OlderAdvancedCoverageNotInvented',context)
                    starter=g['home_qb_id'] if g['home_team']==r['team'] else g['away_qb_id']
                    check(r['started']['value']==(starter==pid if starter else None),'ArchivePublishedExplicitStarterIdentity',context)
                    rates={'completionPct':None if not raw.get('attempts') or float(raw['attempts'])<=0 else float(raw['completions'])/float(raw['attempts'])*100,'yardsPerAttempt':None if not raw.get('attempts') or float(raw['attempts'])<=0 else float(raw['passing_yards'])/float(raw['attempts']),'yardsPerCarry':None if not raw.get('carries') or float(raw['carries'])<=0 else float(raw['rushing_yards'])/float(raw['carries']),'yardsPerReception':None if not raw.get('receptions') or float(raw['receptions'])<=0 else float(raw['receiving_yards'])/float(raw['receptions']),'passerRating':rating([r])}
                    for k,v in rates.items():check(r['stats'][k] is None if v is None else numeric(r['stats'][k]) and abs(r['stats'][k]-v)<=.050000001,'ArchiveIndependentDerivedRate',{**context,'field':k})
check(len(new_rows)==2,'ExactlyTwoNewUnknownQBRows')
check(len(new_archive_rows)==24,'TwentyFourNewActualWeeklyOpponentArchiveRows')
check(all(x['before'] is not None and x['after'] is None for x in secondary_crosscheck_changes),'SecondaryCorroborationPruningExplicitlyRetained')
for ab,club in book['teams'].items():
    gs=[g for g in source_games if g['season']=='2026' and g['game_type']=='REG' and ab in [g['home_team'],g['away_team']] and g['home_score'] and g['away_score']]
    w=l=t=pf=pa=0
    for g in gs:
        home=g['home_team']==ab;mine=int(g['home_score'] if home else g['away_score']);theirs=int(g['away_score'] if home else g['home_score']);pf+=mine;pa+=theirs;w+=mine>theirs;l+=mine<theirs;t+=mine==theirs
    rec=club['record']
    check((rec['w'],rec['l'],rec['ties'],rec['pointsFor'],rec['pointsAgainst'],rec['games'])==(w,l,t,pf,pa,len(gs)),'All32RecordsFromIndependentPublishedFinalSchedule',{'team':ab})
    check(same(rec['pct'],(w+t/2)/len(gs) if gs else None),'All32PctFromTrueWinTieDenominator',{'team':ab})

default={}
for ab in ['DAL','TB']:
    s=next(s for s in states if s['team']==ab and s['options']=={'window':5,'season':'cross','venue':'all','mode':'total'})
    default[ab]={k:s[k] for k in ['games','fixture','opponent','rushing','receiving']}
report={'status':'failed' if failures else 'passed','auditedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'agent':'/root/matchup_sources','beforeSnapshotSha256':sha(BEFORE),'snapshotSha256':sha(AFTER),'independentModel':{'path':'qa/matchup-breakdown/model.cjs','sha256':sha(ROOT/'qa/matchup-breakdown/model.cjs')},'auditHelperSha256':sha(__file__),'assertions':sum(checks.values()),'checks':checks,'teams':32,'windowsPerTeam':48,'latestTeamWindowStates':len(states),'mathematicsIndependentlyVerified':not failures,'statisticalProjectionEquivalent':False,'newUnknownRoleRows':new_rows,'newGenuineOpponentArchiveRows':new_archive_rows,'removedPriorOpponentArchiveRows':removed_archive_rows,'secondaryCrosscheckChanges':secondary_crosscheck_changes,'initialFailedTaxonomyDiagnostic':{'path':str((BASE/'independent-latest-math-and-final-source.json').relative_to(ROOT)),'sha256':sha(BASE/'independent-latest-math-and-final-source.json'),'qualification':'Initial mathematical state comparisons all passed, but the additional archive-integrity scope assumed only two new records. Actual Week6 opponent histories load24 real archive rows and prune43 secondary recent-summary checks. That failed-closed diagnostic remains unmodified; this current audit independently validates those additional raw source cells and records pruning.'},'defaultLatestStates':default,'modelOutputSha256':hashlib.sha256(model_output).hexdigest(),'finalSourceReceipts':[{'path':str((BASE/'public-source-check'/n).relative_to(ROOT)),'sha256':sha(BASE/'public-source-check'/n)} for n in ['espn-final-summary-401872980-receipt.json','nflverse-final-games-receipt.json']],'failures':failures,'qualification':'Current completed Week5 genuinely changes team-game windows, unknown QB role slots and current weekly-opponent archive coverage. All1536 latest independent-model outputs are separately recomputed using Python Decimal/count/eligibility logic; no equivalence with the previous live fixture is asserted. Fresh normal-TLS public final responses are separate dated corroboration, not falsely relabelled03:25 archived bodies. No production implementation, builder or browser test helper is imported or edited.'}
out=BASE/'independent-latest-math-and-final-source-v2.json';out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'path':str(out.relative_to(ROOT)),'sha256':sha(out),'status':report['status'],'assertions':report['assertions'],'latestTeamWindowStates':len(states),'failures':failures[:12]}))
sys.exit(bool(failures))
