# Final premium QA evidence — Pages 1–3

The latest October 2 follow-up adds outlined vector Home branding, stronger blue/gold illumination, full last-five personal/opponent statistics and state-preserving automatic checks. Read [the current follow-up review](next-pass/README.md), [latest visual review](next-pass/VISUAL_REVIEW.md), [data/history audit](next-pass/DATA_HISTORY_REVIEW.md), [update integration](next-pass/AUTO_INTEGRATION_REVIEW.md) and [saved environment access correction](next-pass/ENVIRONMENT_ACCESS.md). The primary screenshots and `results.json` below are from that final follow-up run; older independent reviews in this directory document the preceding pass.

The approved eight-screen image supplied in chat is the visual authority. Its first three top-row panels were inspected directly during this refinement. The separately mentioned original concept was not attached in the available context. Original approved-image bytes were not exposed as a repository file; the comparison sheets therefore contain **previous browser output versus final browser output**, never fabricated approved-source pixels.

## Screenshots

Primary viewport sizes are **393 × 852** and **430 × 896**. PNG captures use **2× device scale**, so their files are 786 × 1704 and 860 × 1792 pixels. This preserves Retina detail; viewport dimensions are not inferred from PNG dimensions.

| Page | 393 × 852 | 430 × 896 |
| --- | --- | --- |
| Home | [Screenshot](home-393.png) | [Screenshot](home-430.png) |
| NFL | [Screenshot](nfl-393.png) | [Screenshot](nfl-430.png) |
| Steelers | [Screenshot](steelers-393.png) | [Screenshot](steelers-430.png) |

[Contact sheet](contact-sheet.jpg) · [Latest before/after comparison](next-pass/comparison.jpg) · [Latest visual review](next-pass/VISUAL_REVIEW.md) · [Reference comparison notes](REFERENCE_COMPARISON.md)

Additional captures cover the player accordion, complete-roster bottom, Schedule, Team Stats, Matchups, Top Players, Weekly Recap and Sources. Smaller-phone, tablet and desktop evidence is also saved. The preceding `ae568d1` draft is preserved under `premium-before/`; the older `aa184bd` evidence remains under `before/`.

## Functional and integrity checks

`npm test` passed in Chromium 151.0.7922.173 at **393×852, 430×896, 320×700, 768×1024 and 1440×1000**, all at 2× DPR. Browser timezone is Australia/Sydney. The runner blocks every external runtime request.

Coverage includes navigation and entry-specific destinations, history, direct hash loads, refresh, all conference/week controls, all roster position filters, complete 77-player roster expansion, player accordion, all tabs, keyboard navigation, native dialogs, scrolling, local data and image decoding, Retina density/aspect ratios, text clipping, default primary cards above navigation, reduced motion, and feed failure/retry. All four edges and corners of every featured football track and the expanded research card are sampled; the border light shares its phase. No external requests, failed assets, console errors or JavaScript exceptions were recorded.

`python3 qa/data.test.py` passes fifteen regressions covering partial releases, positional allowance denominators, absent columns, unknown values, cross-season chronology, original clubs, opponent filtering, cached corrections and linked history. Seven source-monitor and eight automatic-update behaviour groups pass. `node qa/auto-integration.cjs` independently verifies focus, deep scroll, nested details, atomic rollback and retained data during faults. `npm run data:check` validates the snapshot, provenance and exact lazy-history checksum/source versions.

[results.json](results.json) records actual run times, source/file hashes, runtime hashes before/after the run, viewport geometry, image density, animation samples and checks. Git HEAD was the preceding draft while the final changes were uncommitted; exact runtime-file hashes establish which content was tested.

## Independent reviews

- [Visual review](VISUAL_REVIEW.md): six primary views and research tabs inspected, two fix cycles, final fixture/card clearance verified.
- [Data review](DATA_REVIEW.md): source CSVs independently recomputed; absent values, depth chart and injury status remain explicit.
- [Performance and accessibility](PERFORMANCE_REVIEW.md): lifecycle, keyboard/dialog, contrast and headless frame-cadence measurements.
- [Mobile/Safari readiness](SAFARI_REVIEW.md): touch and 3× image-density checks at full/compact heights. Actual WebKit download was blocked by 403; Safari/iPhone hardware is unrun.
- [Deployment review](DEPLOYMENT_REVIEW.md): production subpath and scheduled refresh contract; external verification limits.
- [Publication status](PUBLICATION_STATUS.md): confirmed source/production/PR heads and the actual hosted test attempted after publication.

An apparent missing-navigation-label issue in image-tool previews was challenged with pixel measurements; the raw screenshots contain all five labels and icons. The capture harness was separately corrected to finish finite transitions rather than restart them when resuming decoration.

## Reproduce

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
python3 qa/data.test.py
python3 qa/source-updates.test.py
node qa/data-updates.test.cjs
node qa/auto-integration.cjs
npm run data:check
npm run qa:hosted
```

The static app has no compilation step. Local QA serves the parent folder under `/project-dollers/`. Actual hosted verification uses the exact public URL, checks the committed data and the same interactions, and saves transport/access failure as failure. A local pass or Git push does not establish a successful public deployment.
