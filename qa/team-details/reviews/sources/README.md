# Independent Dallas source review

The approved source is the user's Dallas team-details chat attachment. Its figures
were treated as illustrative until independently corroborated. This review does
not claim pixel identity, direct official corroboration, a live provider feed or
completed browser acceptance.

`source-audit.json` records the exact audited team snapshot hash, original source
URLs, response hashes, retrieval times, checks, retained provider differences and
the independently verified Dallas fixture/record/form. Original raw responses are
kept outside Git under `/workspace/recovery-qa/team-details/sources-independent/`;
the builder's distinct response cache is under
`/workspace/recovery-qa/team-details/source-cache/`.

The checker independently retrieves and parses nflverse regular-season schedules,
2025/2026 player statistics and 2026 roster/injury data, ESPN's Dallas schedule for
both seasons, current team/roster and all 21 Dallas final-game summaries. It also
checks the original builder responses against their published hashes and checks
the latest published depth order. It never imports the new builder's calculations.

Coverage includes all 32 teams, 544 distinct regular-season fixtures, all Dallas
roster identities, every published season/last-five player statistical field,
team net-passing/rushing/offence values, selected game efficiency/penalties,
injury participation/status and current record/next event. Other teams' rosters
remain explicitly unavailable in this approved Dallas pass. Missing observations
remain null, and historical player clubs/seasons are retained.

Four differences caught during review remain explicit in the dataset:

- Dallas–Washington 2025 Week 17: nflverse's `FedExField` and ESPN's
  `Northwest Stadium` labels are both retained; the display policy uses the current
  ESPN event label with a recorded discrepancy.
- Dallas–Washington 2026 Week 18: ESPN marks the time invalid/TBD. The precise
  kickoff is unavailable instead of displaying a provisional timestamp.
- Israel Abanikanda's jersey: 37 versus 25; the displayed number is unavailable.
- Jordan Hudson's jersey: 81 versus 18; the displayed number is unavailable.

Broad defensive position groups versus specific positions, such as DB/CB/S or
DL/DT/DE, are classification differences rather than contradictory player facts.
Absent ESPN roster entries do not prove departure. Depth rank does not establish
confirmed starter status, and missing injury entries do not establish health.

Official Cowboys access returned a proxy 403 and the tested NFL team schedule
routes returned 404. Those errors are retained; the report claims ESPN+nflverse
corroboration only. No access control was bypassed.

The `totalTD` compatibility field means rushing plus receiving touchdowns scored.
Passing touchdowns remain separately credited; `touchdownsAccountedFor` includes
passing as well. These definitions prevent crediting one touchdown twice as a
team score.

Re-run against saved evidence:

```sh
python3 qa/team-details/source-audit.py
```

Retrieve fresh independent evidence and audit a future snapshot:

```sh
python3 qa/team-details/source-audit.py --refresh --output /workspace/recovery-qa/team-details/fresh-source-audit.json
```

Source checks are distinct from UI acceptance. Final review must additionally
inspect actual browser captures, source/disagreement disclosure, season/week
context, game-specific report routing and all functional audit results for the
same frozen runtime.

`final-review.json` preserves the iteration-3 scoped acceptance. The later
`final-crop-review.json` binds this specialist's data/source controls and actual
iteration-4 image inspection to the final 231-file runtime manifest. It preserves
the earlier evidence and does not substitute for the complete regression and
hosted release gates. Both native phone source panels were rechecked against all
31 exact citations and all four disclosed differences; prior game reports and
players' original historical clubs were also checked in the actual browser.

`refresh-workflow-audit.json` documents the four-file Git publication gate, fresh
runner-cache validation, required-source failure preservation and explicit Pages
build request. It records 11 team-data, 22 core-data and 7 source-update tests,
with none skipped. The workflow initially omitted the cache argument from the
team-data tests; that omission was corrected so the scheduled validation also
checks raw source arithmetic and cached response hashes. This review does not
claim an observed GitHub Actions execution or an upstream live push feed.

`refresh-integration-audit.json` records six isolated natural HTTP fixture cases
for the later refresh fix. An unchanged response preserved actual DOM nodes,
native focus and the lighting animation object/start time; a changed statistical
value with the same retrieval timestamp still repainted. Older data and a
deliberate HTTP 503 retained the last good fixture, and a subsequent identical
successful response cleared each error. The changed football figures are
synthetic fixtures only. They were never written to repository data or published.
The exact helper sources and hashes are retained in
`refresh-integration-reproducer.json`; its separate server and browser are
stopped in `finally`. The first harness incorrectly expected the verbose error
instead of the UI's generic `UPDATE FAILED` marker; that assertion-only mistake
is preserved outside Git, and the corrected six-case run passed.

`final-refresh-review.json` is the latest scoped source acceptance. It binds the
iteration-5 runtime and actual phone captures, the unchanged real dataset, the
repeated native citation checks and the isolated refresh integration. All earlier
receipts remain historical; the broader native regression and actual hosted
verification must separately finish before publication is reported complete.
