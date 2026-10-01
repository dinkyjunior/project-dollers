# Project Dollar$

A mobile-first NFL research app with a black/neon identity, authentic player imagery and timestamped public-source data.

Production target: https://dinkyjunior.github.io/project-dollers/

## Current screens

1. Sport selection: NFL functional; NBA, NRL and UFC coming soon.
2. NFL dashboard: conference records, week selection, QB/RB leaders, verified recap results and Steelers fixture.
3. Steelers research: featured/full roster, position filters, inline player statistics, schedule, team statistics and matchup context.

Page 4 is outside scope. Routes use `#home`, `#nfl` and `#steelers`, so direct loads and refresh work under the GitHub Pages subpath.

## Data and assets

The app loads `assets/data/current.json` from the same site. It is a verified cached feed, not play-by-play. `scripts/refresh-data.py` retrieves public nflverse datasets, validates chronology/schema/coverage, and writes the snapshot atomically with `provenance.json`. Required-source failures retain the last validated snapshot; unknown fields remain unavailable. A snapshot older than twelve hours is visibly marked stale.

The `Refresh verified NFL data` workflow is configured for six-hour and manual refreshes on `main`, including an explicit Pages build request for the existing branch-source configuration. Its first production execution and live output must be verified separately.

All runtime logos, 76 authentic player photographs, fonts, icons and stadium artwork are bundled locally. See [asset sources](ASSET_SOURCES.md) and [data review](qa/DATA_REVIEW.md). No player faces were generated or upscaled.

## Development and QA

Static HTML/CSS/JavaScript; no application compilation or API key is required.

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
python3 qa/data.test.py
npm run data:check
npm run data:refresh
npm run qa:hosted
```

Serve the parent directory for the production subpath. [QA evidence](qa/README.md) includes Retina captures at 393×852 and 430×896, three additional responsive sizes, independent reviews and before/after comparison sheets. The approved source is the chat attachment; original bytes and the separately mentioned concept were unavailable.

Work on `codex-rebuild`, preserving the existing checkout. Fetch/rebase before pushing. The latest user request authorizes production publication after QA; see [deployment notes](DEPLOYMENT.md) for actual publication/verification status and limitations.
