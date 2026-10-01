# Project Dollar$

Project Dollar$ is the current three-page sports data prototype for the Friday NFL workflow.

## Live site

https://dinkyjunior.github.io/project-dollers/

## Current approved scope

1. Sport selection home screen
2. NFL dashboard
3. Pittsburgh Steelers roster

Page 4 is intentionally not included yet.

## Deployment

GitHub Pages deploys from the `main` branch at the repository root.

Required root files:

- `index.html`
- `.nojekyll`
- `404.html`
- `assets/`

The current build uses relative paths so it works under the `/project-dollers/` GitHub Pages path.

## Current repository

Use this repository for the live prototype:

`dinkyjunior/project-dollers`

The older private `Project-dollars` repository is not the deployment target.

## Draft development

The Pages 1–3 rebuild is on `codex-rebuild` in Draft PR #1. Production `main` is separate.

Serve the parent directory with Python so the site runs under `/project-dollers/`. There is no application build. Browser QA uses pinned Playwright tooling: run `npm ci` and `npm test` from the checkout. See [CODEX_START.md](CODEX_START.md) for cloud commands and [qa/README.md](qa/README.md) for six offline browser captures and validation evidence.

Logos, real player headshots, font, stadium and data snapshots are bundled locally; see [ASSET_SOURCES.md](ASSET_SOURCES.md). Displayed NFL data is a historical 2025 snapshot, not a live feed. The original approved image is missing from the expected reference path, so exact visual acceptance remains pending.
