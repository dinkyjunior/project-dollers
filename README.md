# Project Dollar$

A mobile-first NFL research app with a black/neon identity, authentic player imagery and timestamped public-source data.

Production target: https://dinkyjunior.github.io/project-dollers/

## Current screens

1. Sport selection: NFL functional; NBA, NRL and UFC coming soon.
2. NFL dashboard: conference records, week selection, QB/RB leaders, verified recap results and Steelers fixture.
3. Steelers research: featured/full roster, position filters, full player season/game statistics, personal last-five opponent history, schedule, team statistics and selected-week matchup context.

Page 4 is outside scope. Routes use `#home`, `#nfl` and `#steelers`, so direct loads and refresh work under the GitHub Pages subpath.

## Data and assets

The app loads `assets/data/current.json` from the same site. It is a verified cached feed, not play-by-play. `scripts/refresh-data.py` retrieves public nflverse datasets, validates chronology/schema/coverage, and writes the snapshot atomically with `provenance.json`. Required-source failures retain the last validated snapshot; unknown fields remain unavailable. A snapshot older than twelve hours is visibly marked stale.

Player research lazy-loads `assets/data/player-history.json` only when needed. It includes up to five most recent recorded regular-season games and up to five personal meetings with every scheduled weekly opponent, spanning verified 2005–2026 sources and previous clubs. Each game preserves its original season, week, team, opponent, score, complete source statistics and retrieval time. Missing games and fields remain unavailable. The bundle checksum and current source versions must match the snapshot before it is accepted.

Automatic checks run on open, resume, focus, reconnection and user refresh, with conditional checks while active. Selected weeks, filters, details, focus and scroll survive updates; failed or invalid updates retain verified data. The production workflow detects upstream source changes every fifteen minutes around game/provider-release windows and hourly otherwise, with manual and authorized event entry points. Source timestamps are not reset by unchanged HEAD checks.

Detailed player statistics follow the provider's post-game release and correction schedule. A live in-game/push provider is not connected. GitHub scheduling, Pages publication and browser caching add practical delays; checking more often does not create unpublished data. See [source/update review](qa/next-pass/SOURCE_RUNTIME_REVIEW.md).

All runtime logos, 76 authentic player photographs, fonts, icons and stadium artwork are bundled locally. Home uses crisp outlined vector branding, moving border highlights, cinematic lighting and touch/keyboard responses. Blue system borders and gold Steelers borders are brighter; the football and synchronized light trace the full outer card, including every expanded statistic. See [asset sources](ASSET_SOURCES.md) and [history review](qa/next-pass/DATA_HISTORY_REVIEW.md). No player faces were generated or upscaled.

## Development and QA

Static HTML/CSS/JavaScript; no application compilation or API key is required.

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
python3 qa/data.test.py
python3 qa/source-updates.test.py
node qa/data-updates.test.cjs
node qa/auto-integration.cjs
npm run data:check
npm run data:refresh
npm run qa:hosted
```

Serve the parent directory for the production subpath. [QA evidence](qa/README.md) includes Retina captures at 393×852 and 430×896, three additional responsive sizes, independent reviews and before/after comparison sheets. The approved source is the chat attachment; original bytes and the separately mentioned concept were unavailable.

Work on `codex-rebuild`, preserving the existing checkout. Fetch/rebase before pushing. The latest user request authorizes production publication after QA; see [deployment notes](DEPLOYMENT.md) for actual publication/verification status and limitations.
