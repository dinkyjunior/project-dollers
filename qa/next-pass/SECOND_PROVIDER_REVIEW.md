# Independent public-source review

Reviewed on 2 October 2026, Sydney time. ESPN endpoints returned HTTP 200 at **11:33:56 am AEST** (01:33:56 UTC), using normal certificate verification and the provided environment proxy CA. The official Steelers roster was captured at 11:24:14 am AEST. No authentication or access-control bypass was used.

All **32 teams’ wins, losses, ties, points for and points against** agree between the immutable published nflverse baseline and ESPN: **160 comparisons, zero discrepancies**. Pittsburgh’s **2–1 record, 53 PF and 60 PA** are corroborated by ESPN standings and its team endpoint. This validates those fields; it does not independently validate every historical or advanced statistic.

Week 4 Steelers at Browns also agrees on season, week, kickoff, home/away, venue and neutral-site status. Kickoff was **Friday 2 October, 10:15 am AEST**. ESPN had Cleveland 14–Pittsburgh 7, **1:47 remaining in the second quarter**, at the recorded retrieval. The app’s archived schedule still awaited a verified final result. That is available newer live information, not a completed-game statistical disagreement. The baseline upcoming pointer had already moved to Week 5 after kickoff; the Week 4 schedule row was used for this cross-check.

The roster needs explicit source conflict handling. The app baseline has **77 players**, ESPN’s Steelers roster **76**, and the official Steelers roster **74**. Nine players have membership, jersey, position or roster-bucket conflicts:

| Player | Baseline | Official / ESPN observation | Required handling |
| --- | --- | --- | --- |
| Joey Porter Jr. | PIT, active, #24 | Absent from both PIT rosters; ESPN athlete ID 4426506 says DAL, active, #25 | Flag team/membership conflict; do not silently retain or overwrite as confirmed PIT active. |
| Daequan Hardy | PIT reserve, #31 | Present in ESPN reserve/out group; absent from official roster | Official absence is uncertain membership, not evidence of a release. |
| Cole Burgess | PIT reserve, #85 | Present in ESPN reserve/out group; absent from official roster | Same uncertain membership treatment. |
| Doneiko Slaughter | Practice squad | Both official and ESPN roster place him in active group | Flag active/practice-squad conflict. |
| Lew Nichols III | Practice squad | Official Lew Nichols #31 and exact ESPN ID 4428119 place him active | Flag roster-bucket conflict; preserve confirmed alias identity. |
| Max Hurleman | WR, practice squad | Official WR, Practice Squad/Injured; ESPN RB, reserve/out | Flag position and status disagreement; preserve official injured squad detail. |
| Darius Rush | #36 | Official #38; ESPN jersey unavailable | Flag official jersey conflict; missing ESPN field provides no confirmation. |
| Brandon Johnson | #82 | Official #89; ESPN jersey unavailable | Flag official jersey conflict. |
| Isaiah Hodgins | #89 | Official #82; ESPN jersey unavailable | Flag official jersey conflict. |

All 76 ESPN athletes match a baseline player after exact ESPN ID matching and limited corroborated name normalization; all 74 official names also match. ESPN supplies 71 jerseys and those 71 agree. The official roster supplies all 74 jerseys, with the three conflicts above. ESPN is also missing jerseys for Bradyn Swinson and Car’lin Vigers; missing values are explicitly unavailable.

Gabe Rubio / Gabriel Rubio is a verified alias: GSIS 00-0041400, birth date 9 July 2003, #96; the public nflverse raw roster gives first name Gabriel and ESPN gives ID 4431533. Michael Pittman / Michael Pittman Jr. shares exact ESPN ID 4035687. Broad DB/CB/S, DL/DT/DE, OL/C/G/OT, K/PK and RB/FB groups were compared for compatibility. A compatible broad group does not verify a more specific role. Roster buckets were compared separately from ESPN’s “Day-To-Day” athlete label, which is not a practice participation or game-day inactive report.

Michael Pittman’s nflverse WR rank 2 and ESPN’s first player in the separate `wr2` formation slot are not equivalent ranks. Pat Freiermuth is second in ESPN’s TE slot behind Darnell Washington, consistent with the baseline’s second TE ranking. Neither ordering alone confirms a game-day starter or active status.

A separate public scoreboard request using `Origin: https://dinkyjunior.github.io` returned HTTP 200 at **11:38:54 am AEST**, with `Access-Control-Allow-Origin: *` and `Cache-Control: max-age=8`. This establishes a current technical opportunity for browser live-score updates; the observed headers do not guarantee delivery latency. Keep live scoreboard observations separate from final archived player-history statistics.

The accompanying [JSON report](SECOND_PROVIDER_REVIEW.json) stores source URLs, retrieval timestamps, SHA-256 response hashes, all 32 standing comparisons, all 77 roster comparisons and the observed live game state. Its immutable baseline is commit `f3f6af5`; the application snapshot hash is `ab82352eebfa82c5c304b161caf04f237b818c85ccbf1218deca2c9e401a09a2`. No app, generator, data file or Git state was changed by this review.

Independent historical last-five/opponent-history stat values, advanced metrics, detailed injury/practice participation, travel, forecast and verifiable sportsbook prices were **not checked** in this pass. The Week 4 final result was **unavailable at the capture**, because the game was in progress. Do not present this focused review as independent validation of those datasets.
