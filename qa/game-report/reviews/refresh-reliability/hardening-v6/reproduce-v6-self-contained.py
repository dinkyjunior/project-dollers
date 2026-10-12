#!/usr/bin/env python3
"""Reproduce the immutable79-case review using NEW, outside-repo fixtures only.

Run with --repo /path/to/project-dollers --output /outside/repo/new-review.
Exact accepted source/index hashes are required. No provider or browser is used.
Five unmasked input cells are reconstructed from explicit ESPN readings, in
isolated copies only. The CLE dependent aggregate uses a controlled test value
(999), not an asserted historical total. Production values are never rewritten.
Both sibling v6 helper files and the saved repository independent ESPN summary/TLS receipt must be present. No external recovery cache is required.
"""
import argparse, copy, hashlib, json, os, pathlib, subprocess, sys
sys.dont_write_bytecode=True
SOURCE='1e0bb61a60cb5033f2f48eea17b6ca8315b8f789669f01c19a11a26c8b82526e'
INDEX='cd43314dc28faead43694a5c8658fd009cbdcf23caa16ce6221e0349dd679208'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args();root=a.repo.resolve();out=a.output.resolve();helper_root=pathlib.Path(__file__).resolve().parent
assert sha(root/'scripts/refresh-game-reports.py')==SOURCE,'Generator differs from accepted frozen source'
assert sha(root/'assets/data/game-reports.json')==INDEX,'Report index differs from accepted frozen snapshot'
assert out!=root and root not in out.parents,'Fixtures must be outside the repository'
assert not out.exists(),'Choose a NEW output directory; prior receipts are immutable'
protected=[root/'scripts/refresh-game-reports.py',*list((root/'assets/data').glob('*.json')),*list((root/'assets/data/game-reports').glob('*.json'))]
before={str(x.relative_to(root)):sha(x) for x in protected}
raw_path=root/'qa/game-report/independent/source-check/espn-401872967.json';evidence_path=raw_path.with_suffix('.receipt.json');body=raw_path.read_bytes();evidence=json.loads(evidence_path.read_bytes());summary=json.loads(body);url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872967'
assert evidence['status']==200 and evidence['strictTLS'] is True and evidence['url']==url,'Saved independent source transport verification is invalid'
assert evidence['sha256']==hashlib.sha256(body).hexdigest() and evidence['bytes']==len(body),'Saved independent source bytes differ from verified receipt'
assert str(summary['header']['id'])=='401872967','Saved independent source event identity differs'
from datetime import datetime
assert datetime.fromisoformat(evidence['retrievedAt'].replace('Z','+00:00')).tzinfo is not None,'Saved retrieval timestamp must have timezone'
out.mkdir(parents=True);cache=out/'selected-source-cache';cache.mkdir();(cache/'espn-summary-401872967.json').write_bytes(body);cache_meta={'id':'espn_game_report_401872967','provider':'ESPN','url':url,'required':False,'tlsVerified':True,'status':'verified','retrievedAt':evidence['retrievedAt'],'httpStatus':200,'etag':None,'lastModified':None,'sha256':evidence['sha256'],'bytes':len(body)};(cache/'espn-summary-401872967.meta.json').write_text(json.dumps(cache_meta,indent=2)+'\n');origins=out/'reconstructed-inputs';origins.mkdir();book=json.loads((root/'assets/data/matchup-breakdown.json').read_bytes());basics={'completions','attempts','passingYards','passingTD','interceptions','sacks','sackYardsLost','carries','rushingYards','rushingTD','receptions','targets','receivingYards','receivingTD','fumbles'}
issues=[i for i in book['disagreements'] if i.get('gameId') and i.get('playerId') and i.get('field') in basics]
for gid in sorted({i['gameId'] for i in issues}):
 report=json.loads((root/'assets/data/game-reports'/f'{gid}.json').read_bytes())
 for issue in [i for i in issues if i['gameId']==gid]:
  identity=next(x for x in book['teams'][issue['team']]['players'].values() if x['id']==issue['playerId']);pid=str(identity['espnId']);field='players.'+issue['field'];old=next(x for x in report['disagreements'] if x.get('team')==issue['team'] and str(x.get('playerId'))==pid and x['field']==field);readings=[r['value'] for r in old['readings'] if any(s.startswith('espn_') for s in r['sourceIds'])];assert readings and len(set(readings))==1;value=readings[0];assert value==issue['values'][1]
  player=next(x for x in report['players'][issue['team']] if str(x['espnId'])==pid);player['stats'][issue['field']]=value;player['provenance']['fieldSources'][issue['field']]=[f"espn_game_report_{report['espnEventId']}"];report['disagreements'].remove(old);player['provenance']['status']='disputed' if any(str(x.get('playerId'))==pid and x.get('team')==issue['team'] for x in report['disagreements']) else 'verified'
 if gid=='2026_05_CLE_NYJ':
  report['stats']['CLE']['sackYardsLost']=999;report['statsProvenance']['CLE'].get('fieldStatus',{}).pop('sackYardsLost',None);report['unavailable']=[x for x in report['unavailable'] if x.get('field')!='stats.CLE.sackYardsLost']
 (origins/f'{gid}.json').write_text(json.dumps(report))
original_out='/workspace/recovery-qa/game-report-refresh-review/hardening-v6'
for name in ('isolated-review-v6.py','catalog-validation-v6.py'):
 text=(helper_root/name).read_text();text=text.replace("ROOT=pathlib.Path('/workspace/project-dollers')",f'ROOT=pathlib.Path({str(root)!r})').replace(f"OUT=pathlib.Path('{original_out}')",f'OUT=pathlib.Path({str(out)!r})').replace("pathlib.Path('/workspace/recovery-qa/game-report-before-integrity')",f'pathlib.Path({str(origins)!r})').replace("CACHE=pathlib.Path('/workspace/recovery-qa/game-report-source-cache')",f'CACHE=pathlib.Path({str(cache)!r})');(out/name).write_text(text)
 with (out/(name+'.stdout.json')).open('w') as handle:subprocess.run([sys.executable,str(out/name)],check=True,stdout=handle,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
r=json.loads((out/'receipt.json').read_text());v=json.loads((out/'catalog-validation-receipt.json').read_text());assert not r['failures'] and not v['failures'];assert r['sourceSha256']==v['scriptSha256']==SOURCE;assert r['totalCases']+v['totalCases']==79;assert before=={str(x.relative_to(root)):sha(x) for x in protected},'Production changed during reproduction'
with (out/'current-check.json').open('w') as handle:subprocess.run([sys.executable,str(root/'scripts/refresh-game-reports.py'),'--check'],check=True,stdout=handle,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
receipt={'accepted':True,'sourceSha256':SOURCE,'indexSha256':INDEX,'cases':79,'reliabilityReceiptSha256':sha(out/'receipt.json'),'catalogReceiptSha256':sha(out/'catalog-validation-receipt.json'),'productionUnchanged':True,'selectedSource':{'repoPath':str(raw_path.relative_to(root)),'sha256':evidence['sha256'],'bytes':len(body),'retrievedAt':evidence['retrievedAt'],'httpStatus':200,'strictTLS':True,'receiptSha256':sha(evidence_path)},'runnerSha256':sha(pathlib.Path(__file__)),'fixtureQualification':'Five isolated unmasked player fields restored from source-bound ESPN readings; dependent CLE aggregate input999 is a controlled test value, not an asserted historical total. No archival backup dataset is required.'};(out/'reproduction.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
