# Weekly recap spacing correction — v5

The standalone NFL style removed the old dashboard's flex row layout. Recap team names and their linked scores consequently ran together. This correction explicitly separates the team text and score controls, allows team text to wrap naturally, and keeps score controls intact.

The bounded native Chromium audit passed at 393 × 852, 430 × 896 and 1440 × 900, all with DPR 2 and reduced motion. All 16 source recap rows have at least 12px of separation, fit their row, and retain identical team text, scores and report links. No horizontal overflow or runtime errors occurred. Every before/after Ladder PNG is byte-identical, so the approved Ladder composition is unchanged.

`before-receipt.json` records the original layout; `after-receipt.json` records the correction. The stylesheet snapshots preserve both versions. Native Recap screenshots retain the actual application shell and inner scrolling; no scene, score or source data was changed.

Reproduce with `node qa/nfl-editorial-20261013/recap-fix-v5/check-recap.cjs after` against the local server at `http://127.0.0.1:8808/project-dollers/`.
