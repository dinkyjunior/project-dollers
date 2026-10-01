# Codex Cloud Environment — Project Dollar$

This project should behave like a self-contained repo-backed Codex Cloud task.

## Repository
- Repo: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Production/live branch: `main`
- Draft PR: #1

## Scope
Only Pages 1–3 are in scope:
1. Home / sport selection
2. NFL dashboard
3. Pittsburgh Steelers roster

Do not add Page 4.

## Deployment difference from June Tracker
June Tracker used Cloudflare Workers. Project Dollar$ uses GitHub Pages.

For Project Dollar$:
- Production is GitHub Pages from `main` `/ (root)`.
- The site must work under `/project-dollers/`.
- Keep `main` untouched until the rebuild passes visual and functional QA.
- Work on `codex-rebuild` and continue Draft PR #1.

## Local / Cloud testing
The repo is a static site. Use a local HTTP server and Chromium/Playwright for QA.

Required viewports:
- 393x852
- 430x896

Required navigation checks:
- Home -> NFL
- NFL -> Steelers
- Steelers -> NFL
- NFL -> Home

## Asset policy
Core visual QA must not depend on external hotlinked images that may return 403 inside Codex Cloud.

Use repo-local assets for anything needed to render and compare the core experience.

The approved visual reference is expected at:
`reference/approved_eight_screen_reference.jpg`

It was absent from the remote `codex-rebuild` branch at handoff commit `2a11d82`. Until restored, use `REFERENCE_SPEC.md` as the permitted fallback and leave original-render visual acceptance pending. Bundled assets and browser evidence are now in the repository; see `ASSET_SOURCES.md` and `qa/README.md`.

Where real league/team/player imagery is required, prefer downloading/bundling stable local copies into the repo during the rebuild rather than relying on runtime hotlinks.

## Start instruction
Read in this order:
1. `CODEX_START.md`
2. `AGENTS.md`
3. `README_FOR_CODEX.md`
4. `CODEX_TASK.md`
5. `QA_ACCEPTANCE.md`
6. `REFERENCE_SPEC.md`
7. `reference/approved_eight_screen_reference.jpg`

Then continue the rebuild on `codex-rebuild` and do not merge to `main` until approved.
