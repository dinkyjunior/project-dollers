# Final premium QA evidence — Pages 1–3

The approved eight-screen image supplied in chat is the visual authority. Its first three top-row panels were inspected directly during this refinement. The separately mentioned original concept was not attached in the available context. Original approved-image bytes were not exposed as a repository file; the comparison sheets therefore contain **previous browser output versus final browser output**, never fabricated approved-source pixels.

## Screenshots

Primary viewport sizes are **393 × 852** and **430 × 896**. PNG captures use **2× device scale**, so their files are 786 × 1704 and 860 × 1792 pixels. This preserves Retina detail; viewport dimensions are not inferred from PNG dimensions.

| Page | 393 × 852 | 430 × 896 |
| --- | --- | --- |
| Home | [Screenshot](home-393.png) | [Screenshot](home-430.png) |
| NFL | [Screenshot](nfl-393.png) | [Screenshot](nfl-430.png) |
| Steelers | [Screenshot](steelers-393.png) | [Screenshot](steelers-430.png) |

[Contact sheet](contact-sheet.jpg) · [Before/after viewer](comparisons/index.html) · [Reference comparison notes](REFERENCE_COMPARISON.md)

Additional captures cover the player accordion, complete-roster bottom, Schedule, Team Stats, Matchups, Top Players, Weekly Recap and Sources. Smaller-phone, tablet and desktop evidence is also saved. The preceding `ae568d1` draft is preserved under `premium-before/`; the older `aa184bd` evidence remains under `before/`.

## Functional and integrity checks

`npm test` passed in Chromium 151.0.7922.173 at **393×852, 430×896, 320×700, 768×1024 and 1440×1000**, all at 2× DPR. Browser timezone is Australia/Sydney. The runner blocks every external runtime request.

Coverage includes navigation and entry-specific destinations, history, direct hash loads, refresh, all conference/week controls, all roster position filters, complete 77-player roster expansion, player accordion, all tabs, keyboard navigation, native dialogs, scrolling, local data and image decoding, Retina density/aspect ratios, text clipping, default primary cards above navigation, reduced motion, and feed failure/retry. All four edges and corners of every featured football track and the expanded research card are sampled; the border light shares its phase. No external requests, failed assets, console errors or JavaScript exceptions were recorded.

`python3 qa/data.test.py` passes five regressions covering partial score/stat releases, positional allowance denominators, absent columns, unknown numeric values and future-week recap context. `npm run data:check` validates the snapshot and canonical provenance checksum.

[results.json](results.json) records actual run times, source/file hashes, runtime hashes before/after the run, viewport geometry, image density, animation samples and checks. Git HEAD was the preceding draft while the final changes were uncommitted; exact runtime-file hashes establish which content was tested.

## Independent reviews

- [Visual review](VISUAL_REVIEW.md): six primary views and research tabs inspected, two fix cycles, final fixture/card clearance verified.
- [Data review](DATA_REVIEW.md): source CSVs independently recomputed; absent values, depth chart and injury status remain explicit.
- [Performance and accessibility](PERFORMANCE_REVIEW.md): lifecycle, keyboard/dialog, contrast and headless frame-cadence measurements.
- [Mobile/Safari readiness](SAFARI_REVIEW.md): touch and 3× image-density checks at full/compact heights. Actual WebKit download was blocked by 403; Safari/iPhone hardware is unrun.
- [Deployment review](DEPLOYMENT_REVIEW.md): production subpath and scheduled refresh contract; external verification limits.

An apparent missing-navigation-label issue in image-tool previews was challenged with pixel measurements; the raw screenshots contain all five labels and icons. The capture harness was separately corrected to finish finite transitions rather than restart them when resuming decoration.

## Reproduce

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
python3 qa/data.test.py
npm run data:check
npm run qa:hosted
```

The static app has no compilation step. Local QA serves the parent folder under `/project-dollers/`. Actual hosted verification uses the exact public URL, checks the committed data and the same interactions, and saves transport/access failure as failure. A local pass or Git push does not establish a successful public deployment.
