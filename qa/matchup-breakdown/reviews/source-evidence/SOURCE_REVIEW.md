# Independent matchup source review

The attached matchup render is the visual authority. Its example names, rankings and statistics do not certify facts. This review fetches public provider bodies independently with TLS certificate and hostname verification enabled; no inherited caches, response substitution or access-control bypass is used.

## Fixture and player availability

The independent ESPN 2026 Dallas/Tampa schedules and event `401872980` corroborate Tampa Bay at Dallas, Week 5, **Friday 9 October 2026, 11:15 AM AEDT**, at AT&T Stadium, Arlington, Texas (`2026-10-09T00:15Z`). Preserve date/time and event identity; this fixture is earlier than the Australian weekend rather than relabeling it a weekend game.

The actual current sources corroborate Dak Prescott and Jalon Daniels on the relevant rosters. Baker Mayfield is reported **Out**, thumb injury, with ESPN injury update dated `2026-10-05T19:07Z`, corroborated by the nflverse Week 5 report. That is a reported availability status, not a confirmed game-day inactive list. TB depth order still lists Mayfield first and Daniels second; projecting Daniels after excluding reported-Out Mayfield is an explicit inference, not a confirmed starter.

The pinned nflreadr schedule dictionary defines `away_qb_id` and `home_qb_id` as starting-quarterback GSIS identifiers. They can support a source-reported **last five starts** window, subject to genuine cross-source role disputes described below. Passing attempts alone cannot. Daniels has two 2026 statistical rows (Week 3 relief and Week 4) but just one source-confirmed NFL start. Do not pad that to five or import college starts. Team-game logs and personal start histories must remain distinct.

All named players should be linked by GSIS/ESPN identifiers. Short names in concept art are not identity keys. Current sourced rankings differ from the illustrative preview; statistical truth takes precedence over the illustrative row order.

## Independent numerical evidence

`independent-numeric-reference-v2.json` computes counts and sums with Python Decimal from independently retrieved 2025/2026 raw CSVs without importing the production builder. It exposes current active and all non-CUT/RET roster pools separately, actual five-team-game windows, statistical-game counts, snap-confirmed appearances and explicit QB-start IDs.

The corresponding ten independent ESPN game-summary bodies corroborate **570 numeric cells** for passing, rushing, receiving and lost fumbles. Two historical/current-ID mappings remain uncovered. One genuine source disagreement exists: **Ted Hurst III, 2026 Week 3 Minnesota at Tampa Bay, targets = 3 in nflverse versus 4 in ESPN**. Mark the field disputed; window target totals and team target-share denominators depending on it cannot silently remain verified. Do not choose the source merely because it matches the render.

The earlier `independent-numeric-reference.json` is retained as a non-acceptance diagnostic: its generic key comparison accidentally included defensive interception categories as passing interceptions. Version 2 restricts the appropriate offensive categories, eliminating four false discrepancies. This is an audit-helper correction only; no production facts or source bodies were modified.

## Coverage and denominators

Missing statistical rows do not prove DNP and must not become zero. Confirmed appearance can use a matching player snap row with positive offense/defense/special-team snaps. A missing snap row remains unknown unless a complete official participation list independently certifies DNP.

The public snap-count sources contain player `offense_snaps` and rounded `offense_pct`, not an exact team-snap denominator. Report player snap totals with covered games. Individual-game published percentages are valid; do not manufacture full-window weighted snap share by dividing by rounded percentages, taking maximum individual snaps or treating attempts plus runs plus sacks as exact team snaps.

Public play-by-play can support explicitly computed red-zone targets/attempts, air yards, scramble/designed-run context and sack rates where its fields and complete-game coverage support those formulas. It does not make quarterback-hit counts a pressure proxy or permit fabricated routes, blitz rates or under-pressure efficiency. Unavailable metrics must open useful explanations with source status rather than inert buttons or invented values.

## Source disagreements and unavailable sources

Current roster differences need explicit reconciliation: nflverse lists TB Easton Stick and Josh Williams as DEV while ESPN lists Active. Dallas Hunter Luepke/Emari Demercado are nflverse ACT but absent from the independent ESPN current roster; absence is not proof of CUT. Do not silently apply an eligibility pool chosen to resemble the preview.

Official Dallas/Buccaneers roster and injury HTML returned tunnel HTTP 403. Public ESPN core game-participation endpoints and the nflreadr documentation site also returned 403; the exact failed requests are recorded and no bypass attempted. The provider's own public GitHub documentation succeeded and is pinned to commit `23f915a5be30415aeaa0c5c80cd23b2c69cda122`. Generic ESPN `/teams/.../injuries` returned a two-byte `{}`: HTTP 200 alone is not injury coverage. Use meaningful roster/depth/upcoming-summary and weekly-report content instead.

## Acceptance pending

These source findings and raw reference calculations are not final application acceptance. The final dataset, refresh workflow, provenance controls and actual common mobile/desktop screenshots still require independent inspection against the attachment and these sources. Original response bytes, timestamps and SHA-256 receipts are retained under this directory.

## Starting-role cross-check (additional final-candidate correction)

Independent scans of full 2005–2026 raw statistics and explicit schedule starting-QB IDs found 24 provider-reported starting roles with no statistical row. Twenty-three lack a snap row; one, Case Keenum in 2026 Week 4, has one offensive snap. Absence of a statistical row or snap row does not prove no start. ESPN/AP explicitly says Keenum was behind center on Chicago’s first play while Bagent was split wide, corroborating that one-snap start.

A separate fresh retrieval of 23 event-matched ESPN summaries exposed twelve direct AP starting/inactive/replacement disagreements with the schedule. `starting-role-contradictions.json` retains exact quotes, article publication timestamps, event IDs, mapped GSIS IDs, source response hashes and retrieval receipts. Both affected player roles must be marked disputed/null; the app must not silently prefer one source. Examples include Tua Tagovailoa explicitly inactive against Carolina in 2026 Week 2 while Cooper Rush was the fill-in starter, and Spencer Rattler explicitly starting instead of Jake Haener in 2024 Weeks 16–17. Eleven other source-reported roles remain uncorroborated rather than assumed confirmed.

The numerical audit retains failures as immutable diagnostic receipts. Initial independent helper comparisons mistakenly treated binary-float representations of published percentages as exact Decimal values and did not canonicalise historical franchise aliases; correcting the helper eliminated those audit-only false positives. Genuine issues subsequently found and fixed in the builder were 67 missing HB-position snap joins, 13 Bo Melton historical CB-position offensive snap joins, partial-play-by-play completeness and scramble dropback denominators. Candidate 4 passed 695,622 independent checks over 8,165 retained player-game rows on dataset `2af0a50dc8b3f80c07d12848c8cc3f41fbc2fef00d2c9b00a0456e5653f4437b`; this is superseded by further starting-role corrections and is not release acceptance.

The source-monitor review executed twelve existing/new meaningful tests. Public source-body change checks, explicit unknown states for incomparable/equal-length HEAD responses, optional-source transitions, full-fetch fallback and atomic five-dataset publication were inspected. It is provider polling, not instantaneous live push; unavailable advanced tracking, unitless weather, unpublished inactives and private pre-game prices remain unavailable.

## Final numerical/source candidate — passed

`audit-final-numeric-1.json` passed **712,149 independent assertions** across **8,173 retained player-game rows** and **75 exact raw HTTP-response archives**, bound to matchup JSON SHA-256 `7257dd9d55ec7b62c91c42b2505bb5c32a0f0edf1c31c3b693c64bac69c2e97c`. The independent helper imports no production calculation code. It recomputes counting statistics, Decimal rates, offensive touchdown definitions, exact snap mapping, actual PBP event counts/coverage/denominators and checks current dependency/source-response/archive hashes and season/week/retrieval contexts.

All twelve observed starting-role disagreements remain explicitly disputed/null on both retained QB sides, with exact independently fetched AP quotes, event identities, publication dates and response hashes. Uncorroborated source-only roles remain unavailable; a newly exposed archived Mariota role makes twelve unknown candidates rather than eleven. Keenum’s genuine one-snap/no-stat start remains corroborated, with player statistics and statistical GP unavailable. Requested QB windows retain disputed/unknown recent slots rather than replacing them with older starts, and aggregate start statistics are withheld while role coverage is incomplete.

This passes the numerical/source candidate only. Final application acceptance additionally requires the announced common actual-browser originals, immutable runtime binding and the complete native-control suites. Publication and actual hosted verification belong to the root agent and must not be inferred from this audit.

## Coherent latest-source candidate — passed

After preserving automatic update `a90d046e8275d4f36eaea438d15b4bc388b6e790`, the rebuilt matchup JSON SHA-256 is `b9dfc8f9d2665fa0b2601c2341c39a5efc9a39478708a9cd49bbd92e97a83290`. `audit-final-numeric-2.json` passed **712,172 assertions**, **8,173 retained player-game rows**, and **75 exact response archives**, with zero failures. Current core/team dependencies, original cached HTTP retrieval times, reviewed-role evidence dependency and fresh quote event/publication/source/hash metadata are checked. Plain-text quotes are validated against HTML-normalised current article text; matching current responses are not mislabelled retained evidence. Previous receipts remain scoped to their earlier exact books.

`incoming-a90-semantic-audit.json` independently reconstructs the complete 1,895-field difference inventory from read-only old commit `4f4643e` and actual newer files. There are no keyset, list-length or scalar-type changes. It identifies 1,667 retrieval/verification timestamps, 61 raw response hash/size/validator changes, 163 raw-source identity links, three linked-dataset checksums and one refresh-deadline advance. The new deadline is verified to be six hours after the actual new core retrieval. Schema-specific consumed projections preserve every identity, eligibility/status, injury, statistic, fixture, market, season/week and substantive disagreement value; these projections are equal. Thirty-four source-contract identities changed, so raw games/ESPN/official whole bodies are expressly not claimed equal.

Final browser/runtime acceptance remains pending the common original inventory; these passes do not certify publication or hosted delivery.
