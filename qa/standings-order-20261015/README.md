# Conference source-order release audit — 15 October 2026

The default ladder must reproduce ESPN's published conference ranks, including its tie ordering. The API's `playoffSeed` field supplies that order. Its raw NFC entries array differs from its published ranks (Carolina is rank 4), so using array order or sorting by percentage/points is insufficient.

`independent-data.py` independently parses the saved actual ESPN API and NFL HTML captures in `sources/`, without importing the producer. It verifies all 32 released ranks, wins, losses, ties, percentages, points for and points against. ESPN HTML/API agreement and original HTTP 200 receipts are documented by the separate source auditor in `sources/independent-official-comparison.json`.

The canonical ESPN orders are:

- AFC: KC, BAL, JAX, BUF, NE, DEN, LV, CLE, PIT, CIN, NYJ, IND, HOU, MIA, LAC, TEN.
- NFC: SF, MIN, NYG, CAR, GB, DET, CHI, SEA, LA, ATL, PHI, DAL, WAS, TB, NO, ARI.

NFL.com agrees on all 32 records and PF/PA, but its supplied rank differs for four clubs: Bears ESPN 7/NFL 6, Lions 6/7, Dolphins 14/16, Titans 16/14. This is disclosed in the ladder and Sources dialog; the release must not claim agreement on those ranks.

`browser.cjs` uses actual Chromium 151 at 393×852 and 430×896, device scale 2, touch enabled, Australia/Sydney timezone. It checks all 32 visible records/ranks against independently captured ESPN data, default SOURCE order, explicit PF/PA/DIFF analysis with ESPN rank numbers retained, return to SOURCE, division filtering, Week 6, all 14 fixtures, weekly previous/next selection, historical week preservation across resume, Follow current week, source dates and the source comparison dialog. It also checks that standings refreshes preserve the fixture selection and avoid redownloading research books, and that a genuine HTTP 503 retains validated standings then retries automatically after 15 seconds.

Two browser regressions intercept only test responses: a newer research retrieval timestamp with incomplete records, and a newer timestamp with identical complete records, must both retain independently validated ESPN order. These synthetic responses are never written into production data.

Screenshots were personally inspected for source ordering, alignment, readable dates, source disagreements, preserved Home/research appearance, and control clipping. A small native select label clip was found during the first pass; the UI agent widened the sort control, and the final audit measures rendered option text as well as element overflow. The compact frame and visual hierarchy are preserved.

Preservation is checked against `43521f6`: original current/team/report books, Home and existing research controllers remain byte-identical. App source-dialog additions are isolated; archives and artwork remain unchanged. Old research is separately dated and remains visibly stale when appropriate.

Run the site under `/project-dollers/` on port 8133, then run `python3 qa/standings-order-20261015/independent-data.py` and `node qa/standings-order-20261015/browser.cjs`. For hosted verification, set `PD_STANDINGS_QA_URL` to the Pages URL and `PD_STANDINGS_QA_OUT` to a new evidence directory. `browser.json` records exact tested runtime hashes. WebKit's previously verified runtime is absent; no browser packages were installed and this audit claims Chromium testing only.
