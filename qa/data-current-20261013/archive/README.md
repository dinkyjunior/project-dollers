# Historical condensed-scoring flag correction candidate

**Candidate only. Published assets have not been changed by this audit.**

The saved older normalizer converted `bool(raw.get(flag))`, so an absent flag,
null, and explicit false all became false. The current normalizer preserves
missing flags as null. Thirty recent reports already use the corrected schema;
414 older reports contain 3,577 condensed scoring rows and 7,154 false flag
cells. Of these, 119 contradict an untouched matching detailed play's true
flag. This does not establish that every other false flag was absent in its
original provider response.

No affected original response was recoverable from the retained evidence:
290 saved compressed source bodies and the two Game Report summary bodies
produced zero exact SHA matches for these 414 reports. Two bounded public
archive requests failed with cloud tunnel HTTP 403. A requested escalated
probe was aborted; no bulk provider retrieval was attempted.

`prepare-conservative-candidate.py` therefore stages a conservative repair,
not a claimed source-verified absence migration. It turns ambiguous condensed
flags into **unknown/null** and adds explicit unavailable provenance. It does
not replace them with detailed-play flags or reinterpret play text. Scores,
quarters, players, statistics, full plays, drives, source hashes, original
retrieval dates and existing generated dates remain unchanged. The new
`correctedAt` is a metadata correction time; `sourceRetrievedAt` is null.
If an original raw response had an explicit false flag, this conservative
repair also makes that value unknown rather than claiming it was absent.

The candidate is at `/workspace/archive-integrity-candidate/` and is not served
by the website. Its index SHA is
`7df24768dcd47f5eb7e4d596003d1be83ddfce555e2bb13f2349d4fc4fb2e652`.
The audit receipt enumerates every changed pointer and the preserved source
hashes. All 444 reports pass the existing generator's complete checksum,
source context, cross-book disagreement, scoring and arithmetic checks.

`index-and-consumer-bridge.json` proves that the only 933 index changes are
828 detail checksum/byte-length changes plus 105 disagreement-catalog report
hash changes. All other index values are unchanged. Current Game Report JS
and CSS do not consume any of these three condensed-scoring/flag field names.
Thus this candidate does not change the rendered report or interaction model.

Root review must approve installation. A new core/Team/Matchup/history snapshot
requires rebuilding the index bindings against those new files afterwards.
This evidence is not a statement that the live website was updated, nor that
the blocked original raw source bodies were independently verified.

## Root installation after all browser processes close

First run the nonmutating default:

```sh
python3 qa/data-current-20261013/archive/install-reviewed-candidate.py
```

After independent acceptance and closure of the browser freeze, root may run:

```sh
python3 qa/data-current-20261013/archive/install-reviewed-candidate.py --apply
```

The installer refuses if any originally audited book, report, index or report
producer changed, or if the audited candidate index hash differs. It validates
all detail bindings again. It copies the candidate into a distinct same-filesystem
staging directory, checks the original source inputs once more, then delegates
to the producer's reviewed `install_candidate` transaction and rollback.
The saved candidate remains available. Directory and index are two separate
atomic filesystem operations; readers must keep the existing checksum gate.
No active browser may overlap this installation.

After a later verified core/Team/Matchup/history data refresh, run the normal
producer's `--index-only` mode to rebind the resulting catalog to the new books,
then run its `--check` again before publication. Do not use this older candidate
to overwrite a refreshed report/data snapshot; the input-hash guard prevents it.
