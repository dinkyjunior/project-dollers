"""Independent read-only review of the staged conservative archive repair.

Does not run the candidate helper, install files, fetch sources or launch a
browser. Structural equality independently proves the bounded semantic delta.
"""
import collections
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDIT = Path(__file__).resolve().parent
CANDIDATE = Path('/workspace/archive-integrity-candidate')
RECEIPT = AUDIT / 'conservative-candidate-receipt.json'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    receipt = json.loads(RECEIPT.read_bytes())
    original_index_path = ROOT / 'assets/data/game-reports.json'
    candidate_index_path = CANDIDATE / 'game-reports.json'
    old_index = json.loads(original_index_path.read_bytes())
    new_index = json.loads(candidate_index_path.read_bytes())
    frozen = {path: sha(ROOT / path) for path in receipt['inputHashes']}
    assert frozen == receipt['inputHashes'], 'Published candidate inputs have drifted'
    assert sha(candidate_index_path) == receipt['candidateIndexSha256']
    assert set(old_index['games']) == set(new_index['games'])
    assert set(p.stem for p in (CANDIDATE/'game-reports').glob('*.json')) == set(new_index['games'])
    changed = []
    cells = 0
    rows = 0
    contradictions = 0
    field_counts = collections.Counter()
    protected_collections = collections.Counter()
    receipt_by_id = {report['gameId']: report for report in receipt['changedReports']}
    for game_id, original_entry in old_index['games'].items():
        old_path = ROOT / 'assets/data/game-reports' / f'{game_id}.json'
        new_path = CANDIDATE / 'game-reports' / f'{game_id}.json'
        old_bytes, new_bytes = old_path.read_bytes(), new_path.read_bytes()
        assert hashlib.sha256(old_bytes).hexdigest() == original_entry['sha256']
        assert hashlib.sha256(new_bytes).hexdigest() == new_index['games'][game_id]['sha256']
        assert len(new_bytes) == new_index['games'][game_id]['bytes']
        original, candidate = json.loads(old_bytes), json.loads(new_bytes)
        changed_pointers = []
        restored = copy.deepcopy(candidate)
        assert len(original['scoringPlays']) == len(candidate['scoringPlays'])
        detailed = {play['id']: play for play in original['plays'] if play.get('id')}
        changed_rows = set()
        for i, (old_play, new_play) in enumerate(zip(original['scoringPlays'],candidate['scoringPlays'])):
            for field in ('isPenalty','isTurnover'):
                if old_play.get(field) is False:
                    assert new_play[field] is None
                    restored['scoringPlays'][i][field] = False
                    changed_pointers.append(f'/scoringPlays/{i}/{field}')
                    changed_rows.add(i)
                    field_counts[field] += 1
                    if detailed.get(old_play.get('id'),{}).get(field) is True:
                        contradictions += 1
                else:
                    assert old_play.get(field) == new_play.get(field), 'Explicit true, null or absent flags must remain unchanged'
        if changed_pointers:
            provenance = candidate['provenance']['scoringPlayFlags']
            assert provenance['status'] == 'unavailable'
            assert provenance['origin'] == 'legacy-default-cleared'
            assert provenance['sourceIds'] == [] and provenance['sourceRetrievedAt'] is None
            assert provenance['scope'] == 'scoringPlays only'
            assert provenance['fields'] == ['isPenalty','isTurnover']
            assert provenance['correctedAt'] == receipt['correctedAt']
            note = provenance['note'].lower()
            assert 'could have been normalization defaults' in note
            assert 'original raw response is unavailable' in note
            assert 'no new source retrieval is claimed' in note
            assert 'detailed play flags and all scores/statistics remain unchanged' in note
            assert 'absent from the source' not in note and 'source omitted' not in note
            if 'scoringPlayFlags' in original['provenance']:
                restored['provenance']['scoringPlayFlags'] = original['provenance']['scoringPlayFlags']
            else:
                del restored['provenance']['scoringPlayFlags']
            assert restored == original, 'A factual, identity, source or retrieval-clock value changed outside the allowed flags'
            claimed = receipt_by_id[game_id]
            assert claimed['changedPointers'] == changed_pointers
            assert claimed['cells'] == len(changed_pointers) and claimed['rows'] == len(changed_rows)
            assert claimed['beforeSha256'] == hashlib.sha256(old_bytes).hexdigest()
            assert claimed['afterSha256'] == hashlib.sha256(new_bytes).hexdigest()
            changed.append(game_id)
        else:
            assert new_bytes == old_bytes, 'An unaffected report must remain byte-identical'
            assert game_id not in receipt_by_id
        cells += len(changed_pointers)
        rows += len(changed_rows)
        for field in ('stats','players','plays','drives','quarters','sources','retrievedAt','generatedAt','availability','verification'):
            assert candidate[field] == original[field]
            protected_collections[field] += 1
        unchanged_entry = dict(new_index['games'][game_id])
        unchanged_entry['sha256'], unchanged_entry['bytes'] = original_entry['sha256'], original_entry['bytes']
        assert unchanged_entry == original_entry, 'Index game metadata changed outside its checksum and byte length'
    assert len(changed) == receipt['affectedReports'] == 414
    assert cells == receipt['falseToUnknownCells'] == 7154
    assert rows == receipt['affectedCondensedRows'] == 3577
    assert contradictions == receipt['contradictoryFalseCells'] == 119
    assert dict(field_counts) == receipt['fieldCounts']
    restored_index = copy.deepcopy(new_index)
    restored_index['games'] = old_index['games']
    assert len(new_index['knownDisagreements']) == len(old_index['knownDisagreements'])
    for old_issue, new_issue in zip(old_index['knownDisagreements'],new_index['knownDisagreements']):
        assert new_issue['reportSha256'] == new_index['games'][new_issue['gameId']]['sha256']
        restored_issue = dict(new_issue)
        restored_issue['reportSha256'] = old_issue['reportSha256']
        assert restored_issue == old_issue, 'Disagreement meaning, source binding or retrieval clock changed'
    restored_index['knownDisagreements'] = old_index['knownDisagreements']
    assert restored_index == old_index, 'Index metadata changed outside report hashes/lengths and their catalog hashes'
    spec = importlib.util.spec_from_file_location('report_validator',ROOT/'scripts/refresh-game-reports.py')
    report_validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(report_validator)
    validation = report_validator.validate(candidate_index_path,CANDIDATE/'game-reports')
    assert validation['status'] == 'passed' and validation['games'] == 444
    assert all(sha(ROOT/path) == checksum for path,checksum in frozen.items()), 'Published inputs mutated during review'
    result = {'status':'passed','candidateOnly':True,'installed':False,'browserLaunched':False,
              'scope':'Independent full structural comparison of all 444 staged reports against unchanged published originals; no new source truth is asserted.',
              'helperSha256':sha(AUDIT/'prepare-conservative-candidate.py'),'reviewScriptSha256':sha(Path(__file__)),
              'candidateReceiptSha256':sha(RECEIPT),'originalIndexSha256':sha(original_index_path),'candidateIndexSha256':sha(candidate_index_path),
              'reportsChecked':444,'changedReports':len(changed),'unchangedReports':444-len(changed),'falseToUnknownCells':cells,
              'affectedCondensedRows':rows,'previousContradictionsAgainstPreservedDetailedFlags':contradictions,'fieldCounts':dict(field_counts),
              'protectedCollectionsAndClocksChecked':dict(protected_collections),'catalogItemsSemanticallyUnchanged':len(new_index['knownDisagreements']),
              'publishedInputHashesPreserved':len(frozen),'validation':validation,
              'provenanceAssessment':'Conservative unknown is truthful: original raw bodies are unavailable for this correction, source absence is not asserted, no replacement retrieval timestamp is manufactured, and correctedAt is explicitly separate.',
              'limitations':['This is an offline conservative repair, not renewed source verification of archived scores/statistics.',
                             'An original explicitly false scoring flag could also become unknown because original raw evidence cannot distinguish it from a legacy default.',
                             'Root must review and install the candidate after the runtime browser freeze closes.']}
    (AUDIT/'independent-conservative-review.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()
