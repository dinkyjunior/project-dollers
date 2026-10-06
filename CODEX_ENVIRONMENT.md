# Codex Cloud Environment — Project Dollar$

This project should behave like a self-contained repo-backed Codex Cloud task.

## Repository
- Repo: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Production/live branch: `main`
- Original PR: #1 (merged; follow-up evidence is added to its description)

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
- Work on `codex-rebuild`; original PR #1 is merged and its description records the follow-up release/evidence.

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

The user subsequently supplied the approved eight-screen render in chat, and that attachment guided the latest comparison/refinements. Its bytes were not exposed for a repository copy; the user expressly authorized proceeding. Read `reference/CHAT_SOURCE.md` for provenance and `qa/REFERENCE_COMPARISON.md` for evidence. Use the attachment as authority when it is visible, with `REFERENCE_SPEC.md` as fallback in sessions where it is unavailable. User visual approval remains pending.

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

Then continue on `codex-rebuild`, preserving the current user authorization and production/QA rules below.

## Latest task authorization and data

The premium refinement request authorizes production publication after QA. That instruction supersedes the earlier hold on `main` for the preceding draft pass. Page 4 remains excluded. Runtime data is now the verified refreshable 2026 JSON feed; the environment/tooling remains static Python HTTP plus pinned Playwright. Current verified HTTPS retries reach the hosted site, GitHub API, official/ESPN sources and official browser downloads. See `qa/next-pass/PUBLICATION_STATUS.md` for actual hosted browser results; old CONNECT403 reports are historical.

The October 2 follow-up adds a lazy checksum-linked `player-history.json`, a source-change monitor and browser update client. Setup still requires only Node/npm, Python standard library and Chromium; no live-provider key or server backend is configured. Validate with `npm run test:data`, `npm run test:sources`, `npm run test:updates`, `npm run test:integration`, `npm run data:check` and `npm test`. Automated QA uses local files and controlled failure fixtures; archival source downloads are unnecessary for ordinary environment setup.

Optional source verification now compares the complete official Steelers roster with ESPN, binds per-player evidence to source hashes/times and preserves primary historical fields. Blocked optional sources retain valid preceding evidence for the identical primary roster hash; missing verification never implies a confirmed departure.

Additional actual-hosted checks use `npm run qa:hosted:webkit` and `npm run qa:hosted:firefox`. Genuine WebKit runs with signature/checksum-verified distro libraries extracted only under `/workspace/.onboarding/webkit-runtime`; read `qa/hosted/webkit/RUNTIME_SETUP.md`. Firefox uses disposable workspace CA profiles, retaining strict TLS. It may need sanctioned process execution when the container's UID namespace prevents startup. Neither helper rewrites `HOME`, imports persistent trust, or bypasses certificate validation. Physical iPhone/Safari hardware remains unrun.
