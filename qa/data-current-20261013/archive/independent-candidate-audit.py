#!/usr/bin/env python3
"""Read-only independent whitelist audit. Never installs candidate assets."""
import collections, datetime, hashlib, json, pathlib, re, subprocess
REPO=pathlib.Path('/workspace/project-dollers')
CAND=pathlib.Path('/workspace/archive-integrity-candidate')
OUT=REPO/'qa/data-current-20261013/archive/independent-candidate-audit.json'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def diffs(a,b,path=''):
    if type(a) is type(b) and a==b:return []
    if isinstance(a,dict) and isinstance(b,dict):
        out=[]
        for k in sorted(set(a)|set(b)):
            p=f'{path}/{k}'
            if k not in a or k not in b:out.append((p,a.get(k),b.get(k)))
            else:out.extend(diffs(a[k],b[k],p))
        return out
    if isinstance(a,list) and isinstance(b,list) and len(a)==len(b):
        return [c for i,(x,y) in enumerate(zip(a,b)) for c in diffs(x,y,f'{path}/{i}')]
    return [(path,a,b)]

published=REPO/'assets/data/game-reports.json'
pub_details=REPO/'assets/data/game-reports'
cand_index=CAND/'game-reports.json'
cand_details=CAND/'game-reports'
frozen={str(p.relative_to(REPO)):sha(p) for p in [published,*sorted(pub_details.glob('*.json'))]}
a=json.loads(published.read_bytes());b=json.loads(cand_index.read_bytes())
assert len(a['games'])==len(b['games'])==444
assert set(a['games'])==set(b['games'])
assert {p.stem for p in pub_details.glob('*.json')}=={p.stem for p in cand_details.glob('*.json')}==set(a['games'])
changes=[]; flags=collections.Counter(); changed_rows=0; contradictions=0; preserved_blocks=collections.Counter()
for gid in sorted(a['games']):
    p=pub_details/f'{gid}.json';q=cand_details/f'{gid}.json';old=json.loads(p.read_bytes());new=json.loads(q.read_bytes())
    changeset=diffs(old,new)
    assert a['games'][gid]['sha256']==sha(p)
    assert b['games'][gid]['sha256']==sha(q) and b['games'][gid]['bytes']==q.stat().st_size
    if not changeset:
        assert p.read_bytes()==q.read_bytes()
        continue
    expected=[]; rows=set(); before_raw={play['id']:play for play in old['plays'] if play.get('id')}
    for ptr,previous,next_value in changeset:
        match=re.fullmatch(r'/scoringPlays/(\d+)/(isPenalty|isTurnover)',ptr)
        if match:
            assert previous is False and next_value is None,(gid,ptr)
            i=int(match[1]);field=match[2];rows.add(i);flags[field]+=1;expected.append(ptr)
            if before_raw.get(old['scoringPlays'][i].get('id'),{}).get(field) is True:contradictions+=1
        else:
            assert ptr=='/provenance/scoringPlayFlags' and previous is None,(gid,ptr)
            assert 'scoringPlayFlags' not in old['provenance']
            prov=next_value
            assert set(prov)=={'status','origin','sourceIds','fields','scope','correctedAt','sourceRetrievedAt','note'}
            assert prov['status']=='unavailable' and prov['origin']=='legacy-default-cleared' and prov['sourceIds']==[]
            assert prov['fields']==['isPenalty','isTurnover'] and prov['scope']=='scoringPlays only'
            assert prov['sourceRetrievedAt'] is None
            clock=datetime.datetime.fromisoformat(prov['correctedAt'].replace('Z','+00:00'))
            assert clock.tzinfo is not None and clock<=datetime.datetime.now(datetime.timezone.utc)
            assert 'original raw response is unavailable' in prov['note'] and 'conservatively unknown' in prov['note']
            assert 'No new source retrieval is claimed' in prov['note']
    assert len(expected)>0 and len(changeset)==len(expected)+1
    for key in old:
        if key not in ('scoringPlays','provenance'):
            assert old[key]==new[key],(gid,key)
            preserved_blocks[key]+=1
    assert set(old)==set(new)
    for key in old['provenance']:assert old['provenance'][key]==new['provenance'][key]
    assert len(old['scoringPlays'])==len(new['scoringPlays'])
    for i,(x,y) in enumerate(zip(old['scoringPlays'],new['scoringPlays'])):
        assert set(x)==set(y)
        for key in x:
            if key in ('isPenalty','isTurnover') and x[key] is False:assert y[key] is None
            else:assert type(x[key]) is type(y[key]) and x[key]==y[key]
    changed_rows+=len(rows)
    changes.append({'gameId':gid,'flagCells':len(expected),'scoringRows':len(rows),'beforeSha256':sha(p),'afterSha256':sha(q)})
assert len(changes)==414 and changed_rows==3577 and sum(flags.values())==7154 and contradictions==119
changed_ids={r['gameId'] for r in changes};index_changes=diffs(a,b);index_counter=collections.Counter()
for ptr,previous,next_value in index_changes:
    if match:=re.fullmatch(r'/games/([^/]+)/(sha256|bytes)',ptr):
        assert match[1] in changed_ids
        index_counter[match[2]]+=1
    elif match:=re.fullmatch(r'/knownDisagreements/(\d+)/reportSha256',ptr):
        issue=b['knownDisagreements'][int(match[1])]
        assert issue['gameId'] in changed_ids and next_value==b['games'][issue['gameId']]['sha256']
        index_counter['catalogReportSha256']+=1
    else:raise AssertionError(('Unapproved index change',ptr))
assert dict(index_counter)=={'sha256':414,'bytes':414,'catalogReportSha256':105}
consumers=[]
for p in sorted((REPO/'assets').glob('*.js')):
    body=p.read_text();tokens={k:body.count(k) for k in ('scoringPlays','isPenalty','isTurnover')}
    if any(tokens.values()):consumers.append({'path':str(p.relative_to(REPO)),'tokens':tokens})
assert not consumers,consumers
proc=subprocess.run(['python3','scripts/refresh-game-reports.py','--check','--output',str(cand_index),'--detail-dir',str(cand_details)],cwd=REPO,text=True,capture_output=True)
assert proc.returncode==0,proc.stderr
validation=json.loads(proc.stdout)
assert validation['games']==444 and validation['quarterChecks']==888
assert all(sha(REPO/path)==digest for path,digest in frozen.items()),'Published reports changed while audit ran'
receipt={'status':'pass','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateOnly':True,'publishedReportsUnchanged':True,'candidateIndexSha256':sha(cand_index),'productionIndexSha256':sha(published),'totalReports':444,'changedReports':len(changes),'byteIdenticalUnchangedReports':444-len(changes),'changedCondensedRows':changed_rows,'falseToUnknownCells':sum(flags.values()),'fieldCounts':dict(flags),'detailedTrueContradictionsConservativelyCleared':contradictions,'reportWhitelist':'Only scoringPlays/<row>/isPenalty|isTurnover false→null and added provenance/scoringPlayFlags unavailable metadata','indexChanges':dict(index_counter),'allOtherIndexFieldsIdentical':True,'allOtherReportFieldsIdentical':True,'preservedBlockCounts':dict(preserved_blocks),'consumerTokenMatches':consumers,'validation':validation,'changedReportsSummary':changes,'limitations':['Raw historical provider responses for affected reports are unavailable; null means conservative unknown, not independently verified absence.','Possible genuine explicit false raw values also become unknown. Detailed source flags remain untouched.','No website/app writes, browser rendering, deployment, external source retrieval or new source-clock claim in this audit.','Candidate must be rebound if Team/Matchup/history book hashes change before installation.']}
OUT.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ('changedReportsSummary','preservedBlockCounts')},indent=2))
