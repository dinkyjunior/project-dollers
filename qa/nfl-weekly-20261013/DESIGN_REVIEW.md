# NFL weekly interface visual review

Reviewed the actual local HTTP build under `/project-dollers/`, using Chromium 151 and Playwright 1.58.2. Final captures use native 393 × 852, 430 × 896 and 1440 × 900 viewports, DPR 2, reduced motion, and the user's `Australia/Sydney` timezone. No browser routes, rendered text, images or statistics were substituted for screenshots.

## Result

**PASS for the requested visual changes.** The approved compact photographic NFL header and quiet editorial language are preserved. The user requested new interaction layouts rather than supplying a new reference for these controls; this review does not claim an exact new-render replica or independent live data verification.

- Weekly matchup is immediately below the research tabs and before Standings. The visible selector names fit, while the card retains city and team names. Previous/next controls and the primary entry have clear 40px finger targets.
- The final score stays on one upright line in a 64px center column. The city/name labels sit below the decorative helmet images, with a darker lower band for contrast. Genuine team logos remain contained and sharp when helmet art is unavailable.
- The expanded 16-team standings view uses equal row heights and backgrounds. Steelers has no inserted detail summary or special selected treatment.
- Weekly Recap replaces the old crowded name/score list with individual two-team cards. Full city or regional labels, nicknames and genuine 32px logos are visible. Scores align independently on the right, and winners receive restrained teal emphasis.
- Expanded recap actions fit in a clean two-column grid. The team filter, result count and explicit week context remain visible. Recap dates and times reflect Sydney's applicable UTC offset rather than the test machine's default timezone.
- The retained frame is 393 × 756.171875 at the small phone viewport, 430 × 802.671875 at the larger phone viewport, and 400 × 770 on desktop. All 18 captured states have no horizontal overflow.

## Findings corrected before sign-off

The first native visual pass exposed a 22–34 final score wrapping vertically in the inherited 44px column and city text overlapping the helmets. The CSS owner widened the center column, set upright tabular score text, enlarged the artwork region to 132px, and moved the labels below 90px helmet art. A later pass exposed long selected game labels clipping; root shortened visible labels to nicknames and retained full franchise names in accessible labels and titles. The final native captures confirm those corrections.

## Evidence and limits

Final native captures and unchanged-before/after source hashes are in `design-native/geometry.json`; the executed helper and all 18 PNGs are retained beside it. Representative originals reviewed include both phone widths for weekly matchup, uniform standings, recap collapsed, recap expanded and filtered recap, plus the desktop weekly composition. Comparison baseline: `../nfl-editorial-20261013/native-editorial-v4-states/nfl-393-weekly-recap.png`.

Final source hashes:

| File | SHA-256 |
| --- | --- |
| `index.html` | `9ec678e455d26097af3dc85de64da83e1565a6007f3db5be937be6ebecd797fb` |
| `assets/nfl-dashboard.js` | `6b0f953aac1185f6211a0094c5c5b68546a749c23e09f23a557fc11d29b405ae` |
| `assets/nfl-editorial.css` | `bdec390a44d050a855cfb50780d712410f09ea61168167a206bf4884293cc994` |

This is a local Chromium visual review. Hosted delivery, Safari behavior, external NFL standings reconciliation and the currentness of saved statistics are separate checks. The existing source/staleness indicators remain visible.
