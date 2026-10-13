# Independent Home integration and preservation review

This review exercises the real checkout under the GitHub Pages subpath using pinned Playwright 1.58.2 and native Chromium 151. Phone viewports are 393 × 852 and 430 × 896, DPR 2 with touch; desktop is 1440 × 900. No DOM, style, response, data or clock substitution was used.

- `native-home-integration-freeze1.json`: 18 passing stages and 45 native inputs covering menu, coming-soon sports, both NFL entry points, named research shortcuts, conference/week controls, Home return/reload and Dallas Team/Matchup direct refresh. Home did not request the larger Team, Matchup or Report books before entry. No JavaScript, console, HTTP, genuine request or horizontal-overflow failures.
- `native-roster-report-final.json`: passing bounded follow-up at all three sizes. Legacy roster RB/ALL filters, player expansion/collapse after verified-history loading, direct roster refresh and NFL return; direct 2025 Cleveland–Baltimore Report, exact saved quarters, all four Report tabs, direct refresh and return to source Team.
- All 452 files under `assets/data` remained byte-identical to the saved baseline at commit ade6d46. The source manifest is included. This is preservation evidence, not a fresh official NFL verification.
- Existing current-week controller tests also passed 8/8 on the unchanged application source.

The first bounded follow-up stopped on an immediate helper `scrollIntoViewIfNeeded` after verified history replaced the roster card. Its original receipt and exact helper are preserved. The final helper waits for the existing `PD_HISTORY` publication before the next native action. No app or dataset fix was applied to make it pass.

Home visuals after freeze 1 received only a CSS stadium offset/shade/light adjustment and the NFL row fill. Routing, Home controls, research markup and source books did not change. Final Home visual comparisons are recorded separately by the mobile and visual reviewers.

All browser contexts and browsers closed. This evidence does not certify hosted deployment, physical iPhone Safari, official NFL agreement or an active production daily refresh. Those remain separate requirements.
