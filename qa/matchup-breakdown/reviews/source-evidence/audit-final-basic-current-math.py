"""Independent current-book arithmetic, selection and final-source review.

Only the independent QA model is executed. No application or builder is imported.
Python separately selects games/rows and recomputes counts, weighted rates and
eligibility from retained immutable snapshot inputs. Changed outputs are real.
"""
import ast, csv, datetime, hashlib, json, math, pathlib, subprocess, sys
from decimal import Decimal

ROOT = pathlib.Path('/workspace/project-dollers')
AFTER = pathlib.Path(sys.argv[1]).resolve()
EXPECTED_SHA = sys.argv[2]
OUT = pathlib.Path(sys.argv[3]).resolve()
book = json.loads(AFTER.read_text())
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

check(sha(AFTER)==EXPECTED_SHA,'ExactAuditedBook')
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


default={}
for ab in ['DAL','TB']:
    s=next(s for s in states if s['team']==ab and s['options']=={'window':5,'season':'cross','venue':'all','mode':'total'})
    default[ab]={k:s[k] for k in ['games','fixture','opponent','rushing','receiving','qbs']}
report={'status':'failed' if failures else 'passed','auditedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'agent':'/root/matchup_sources','snapshotSha256':sha(AFTER),'independentModel':{'path':'qa/matchup-breakdown/model.cjs','sha256':sha(ROOT/'qa/matchup-breakdown/model.cjs')},'auditHelperSha256':sha(__file__),'assertions':sum(checks.values()),'checks':checks,'teams':32,'windowsPerTeam':48,'latestTeamWindowStates':len(states),'mathematicsIndependentlyVerified':not failures,'statisticalProjectionEquivalent':False,'defaultLatestStates':default,'modelOutputSha256':hashlib.sha256(model_output).hexdigest(),'failures':failures,'qualification':'All1536 newest independent-model outputs separately recomputed using Python Decimal/count/eligibility logic. This accepts mathematical selections/counts/denominators/roles for the exact suppliedbook, not factual source rows or browser/visual/release acceptance; independent raw-source evidence is required separately. No production implementation or builder is imported or edited.'}
assert not OUT.exists();OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'path':str(OUT),'sha256':sha(OUT),'status':report['status'],'assertions':report['assertions'],'latestTeamWindowStates':len(states),'failures':failures[:12]}));sys.exit(bool(failures))
