# Preserved automatic refresh: independent data verification

**PASS** — 2026-10-07T04:16:43.545762+00:00. This is a substantive roster-verification refresh, not a metadata-only refresh. The original [recursive comparison](final-incoming-refresh.json) remains `differences-found`: all **21** declared differences were reviewed, alongside 1,748 pre-existing metadata-path changes.

Baseline `78fd6b51709cacd217a1bf45f5f8315c0f2b65bb` → exact incoming automatic commit `e0419a5676f8bba2548d5f2f1fc52fb4244546c6`. All three incoming JSON files remain byte-for-byte intact; all **188 non-data runtime files** match the frozen visual review. The [machine-readable verification](current-data-verification.json) binds all 191 current runtime files, the diff, code, public response bytes and the real-browser report.

Bradyn Swinson (GSIS `00-0040176`, ESPN `4431424`) remains in the primary retained 2026 Week 5 data as a practice-squad linebacker. The current ESPN roster no longer matches him; the official Steelers roster already omitted him. The app visibly labels his card **Roster disputed**, preserves his original stats/history and shows the explicit source conflict. It does not assert verified current membership or a confirmed departure.

The fresh fallback athlete response verifies his ID/name/2026 context, but simultaneously reports team `PIT` and status `Free Agent`; DOB and jersey are absent. It does not identify a different club. The existing conservative departure rule therefore leaves `reportedOtherTeam: null`. This provider inconsistency is documented rather than silently resolved or turned into fabricated facts.

## Public source corroboration

All four existing public URLs returned HTTP 200 on 7 October 2026 at approximately 04:12 UTC, with certificate and hostname verification enabled. No authentication, source-response substitution, cache-busting or access-control bypass was used. Exact response bytes are saved as small gzip files with raw and stored SHA-256 digests in the [fetch report](current-public-sources/fetch-results.json). Provider-generated redirect query signatures are omitted from the report.

| Source | Independent check | Fresh raw SHA-256 |
| --- | --- | --- |
| [nflverse_roster](https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv) | 959,505-byte primary CSV exactly matches original snapshot hash; Swinson GSIS/ESPN/PIT/LB/57/DEV/Week 5 identity preserved | `003dea6ad15a05f4c62e42d86522654782c9041d3b332c10945689dee29b2461` |
| [official_steelers_roster](https://www.steelers.com/team/players-roster/) | Complete 76-player roster: 53 active, 5 injured reserve, 1 PUP, 16 practice squad, 1 practice-squad injured; no matched Swinson identity | `cea5f22835fd8669cfae7059bd6545ca7df8bf2da932cb17f48ba7f226b0f278` |
| [espn_steelers_roster](https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/pit/roster) | Complete 78 unique 2026/PIT identities in required position groups; no unambiguous Swinson ID/name/birth-date/jersey match | `aef8637557bee1ecb4b53dd273949e7885b411d37d6ae3010d2ccbd29aedb246` |
| [espn_athlete_4431424](https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/4431424) | ID/name/2026 match, team PIT, Free Agent; no DOB/jersey or other club | `f9926ec4e5a2565bf5b7673ac18f457750495e6be2523063fed217e9c8de4a4f` |

The optional providers return dynamic bodies: these fresh response hashes differ from their original 03:21:33 UTC snapshot hashes. The original optional raw bodies were not available in this workspace. Fresh bytes independently reproduce **all 77 meaningful incoming roster-verification decisions** and provider counts (official 76, ESPN 78). This is factual corroboration, not a claim of reproducing the earlier optional body digests. Their recorded snapshot hashes/timestamps remain unchanged.

## Checks inside changed containers

The first recursive comparison intentionally stops inside a changed keyset/list length. This supplemental audit checked those containers independently:

- Source arrays are compared by stable source ID: 29→30 entries, solely `espn_athlete_4431424` added; no source removed or replaced, and all prior entries retain relative order. All previous source objects are substantively identical; only the original enumerated scalar keys `bytes`, `etag`, `retrievedAt`, `sha256` are excluded. The metadata whitelist was not changed.
- Every changed `sourceIds` list adds only that fallback, removes nothing and preserves prior relative ordering. The hash dictionary adds only its matching snapshot digest; existing roster hashes change only at the original enumerated metadata paths.
- Snapshot and provenance source arrays are identical. Mirrored evidence/disagreement/dataset source lists remain consistent.
- The primary roster remains 77 players. Swinson’s primary fields, stats and history are exact; the other 76 players have no factual changes after only the original metadata paths are excluded.
- Every historical game, original club, raw/normalised statistic, dictionary key, list length and scalar type is unchanged. Missing values remain unavailable.
- All 188 visual-review non-data runtime files remain identical. No runtime, original data or historical evidence was edited.

## All 21 declared differences

| # | File / JSON pointer | Reviewed change |
| --- | --- | --- |
| 1 | `assets/data/current.json` `/roster/60/rosterVerification/sourceIds` | Length 2→3; only fallback source added |
| 2 | `assets/data/current.json` `/roster/60/rosterVerification/sourceHashes` | Only fallback source hash key added; existing hashes use unchanged metadata rules |
| 3 | `assets/data/current.json` `/roster/60/rosterVerification/espnCurrentMembership` | `true` → `false` |
| 4 | `assets/data/current.json` `/roster/60/rosterVerification/espnRosterStatus` | `"practiceSquad"` → `null` |
| 5 | `assets/data/current.json` `/roster/60/rosterVerification/espnPosition` | `"LB"` → `null` |
| 6 | `assets/data/current.json` `/roster/60/rosterVerification/issues/0/espn` | `"PIT"` → `"No matched roster entry"` |
| 7 | `assets/data/current.json` `/roster/60/rosterVerification/evidence/espnName` | `"Bradyn Swinson"` → `null` |
| 8 | `assets/data/current.json` `/roster/60/rosterVerification/evidence/espnId` | `"4431424"` → `null` |
| 9 | `assets/data/current.json` `/roster/60/rosterVerification/evidence/identityJoinMethod` | `"ESPN ID or normalized exact name"` → `"No unambiguous matched ESPN identity"` |
| 10 | `assets/data/current.json` `/sources` | Length 29→30; only fallback source added |
| 11 | `assets/data/current.json` `/provenance/crossChecks/sourceIds` | Length 7→8; only fallback source added |
| 12 | `assets/data/current.json` `/provenance/rosterVerification/sourceIds` | Length 2→3; only fallback source added |
| 13 | `assets/data/current.json` `/disagreements/3/espn` | `"PIT"` → `"No matched roster entry"` |
| 14 | `assets/data/current.json` `/disagreements/3/sourceIds` | Length 2→3; only fallback source added |
| 15 | `assets/data/provenance.json` `/sources` | Length 29→30; only fallback source added |
| 16 | `assets/data/provenance.json` `/datasets/crossChecks/sourceIds` | Length 7→8; only fallback source added |
| 17 | `assets/data/provenance.json` `/datasets/rosterVerification/sourceIds` | Length 2→3; only fallback source added |
| 18 | `assets/data/provenance.json` `/validation/disagreements/3/espn` | `"PIT"` → `"No matched roster entry"` |
| 19 | `assets/data/provenance.json` `/validation/disagreements/3/sourceIds` | Length 2→3; only fallback source added |
| 20 | `assets/data/provenance.json` `/rosterVerification/sourceIds` | Length 2→3; only fallback source added |
| 21 | `assets/data/provenance.json` `/rosterVerification/espnRosterCount` | `77` → `78` |

Full per-difference reasoning and exact before/after values are retained in the JSON; none is ignored or reclassified as metadata.

## Real-browser affected-record verification

[Actual Chromium report](current-data-ui.json) **passed** at both 393×852 and 430×896, DPR 2, using the exact current JSON. Native position filtering and card expansion verified the retained disputed card, primary-feed wording and explicit Steelers/ESPN membership disagreement. Both personal history and selected-week Cincinnati history retain the sole original `2025_12_NE_CIN` game, its previous club `NE` and source-matched displayed values; missing games are not padded. The new fallback source link and source conflict are visible. Only three pages exist, with no overflow and zero console/JavaScript, HTTP, external-runtime or genuine transport failures. No screenshot duplication or response substitution was used. This focused Chromium check does not replace the separate complete genuine WebKit regression suite or eventual actual-hosted verification.

Reproduce the read-only audit with `python3 qa/home-luxury/refresh-integration/verify-current-data.py`; its captured public bytes remain immutable. `current-data-ui.cjs` starts a temporary subpath-correct local server and verifies normal browser interactions without changing data.

Verification JSON SHA-256: `a1a09621fe82472b77028fe7979b50f9102c6968d7fe00335b549444f6fe442f`
Incoming diff SHA-256: `735749bcef115e4982f6b18046661250468c5e070c971d0f8f3730599c76ea38`
Affected-record browser report SHA-256: `156c9db157e86a5d5b0b9e68d7a8a5b6cd909d6b6efd7dd2bab33513283d7a63`
