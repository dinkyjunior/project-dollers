# Current standings source verification — 13 October 2026 Sydney

The fresh public NFLverse game CSV was retrieved at 2026-10-12T22:55:29.827229Z (09:55:29 Sydney on 13 October), with standard TLS verification. Its SHA-256 is `4a375ede386462975467e85d50a33c6ba80ab6c8a5dee60b10650c70724dc0e6`.

An independent arithmetic implementation recomputed all 32 teams and 224 record / points / percentage / differential fields. They match the committed current snapshot, which was retrieved at 2026-10-12T08:44:57Z. This corroborates the saved primary-provider records with a fresh primary-provider body; it is not independent-provider confirmation.

Week 5 has 14 verified final games out of 15 scheduled. Buffalo at the Los Angeles Rams is scheduled for 2026-10-13T00:15:00Z, or 11:15 Sydney on 13 October. Its score is absent and is not invented or marked final.

NFL official standings, ESPN public standings APIs and ESPN Week 5 scoreboard were attempted. All returned the cloud proxy error `Tunnel connection failed: 403 Forbidden`. The exact initial request receipts are saved. A subsequent approved-escalation request was aborted while pending, so no successful second attempt or source retrieval is claimed. No access controls were bypassed.

Official conference seed / NFL tie-break ordering therefore remains unverified. The app's PCT → point differential → abbreviation order is a useful sortable record view, not official playoff seeding. Make this distinction visible, and show all 16 teams in each conference rather than presenting a compact top-four-plus-Steelers selection as the entire ladder.

`fresh-games-record-comparison.json` contains the recomputed results and remaining fixtures. `consumer-source-review.json` records a scoped read-only source-contract review; browser geometry and actual deployment remain separate root-owned QA tasks.
