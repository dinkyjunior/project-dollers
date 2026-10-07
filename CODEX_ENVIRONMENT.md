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

The user subsequently supplied the approved eight-screen render in chat, and that attachment guided the earlier comparison/refinements. Its bytes were not exposed for a repository copy; the user expressly authorized proceeding. Read `reference/CHAT_SOURCE.md` for provenance and `qa/REFERENCE_COMPARISON.md` for historical evidence. On 7 October 2026 (Australia/Sydney), the user reattached and approved the four-sport circular Aperture gate concept for Page 1 and explicitly authorized its implementation and launch. That newer attachment is the Page 1 visual authority; the eight-screen reference still applies to Pages 2–3. Do not generate another concept or interpret the approved image as a flattened interface.

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

## Current Page 1 neon refinement — 7 October 2026 (Australia/Sydney)

The user-approved further Home-only refinement is implemented and passes final local Chromium/WebKit QA; production publication and actual-hosted acceptance remain pending. The previous verified launch below does not establish completion of these new live-site changes. The existing brand artwork, brand tagline and venue artwork inside the gate are retained. The repeated sport-name and DATA & RESEARCH hero block below the gate is removed; selected controls and entry labels retain an accessible current-sport identity. The entrance gate/ring is thicker and much more prominently illuminated, with stronger neon glow and pulse across the ring, entry button, selected sport boxes and architecture/walls.

Preserve the fixed NFL blue, NBA left-blue/right-red, NRL green and UFC red palettes, real selectors/NFL navigation, Coming-soon restrictions, UFC Fighters label, reduced-motion support and animation lifecycle pauses. Do not change Pages 2–3, data or Page 4. Compare actual mobile/desktop captures with the preceding release to confirm a materially stronger edge/glow, legible controls, clean spacing and no halo covering text. Save new evidence under `qa/home-neon/` and verify the actual hosted site after publication before claiming completion.

## Previous approved Page 1 launch — 7 October 2026 (Australia/Sydney)

The approved Home application is deployed and verified as `ec35fb1b6bcc442cfee89716bc6d1948ba28b557`. Final local Chromium/WebKit QA passed, the exact Pages workflow succeeded, actual-hosted WebKit passed both primary mobile sizes, and independent hosted desktop/publication review passed. Both hosted audits verified all 183 delivered runtime files as HTTP 200 with exact tested hashes. Existing NFL/Steelers markup and `assets/app.js` were retained. Do not touch Page 4. The circular gate uses real, accessible sport selectors and native NFL navigation. NFL is functional; NBA, NRL and UFC are selectable Home states whose entry buttons say Coming soon without "Preview only". UFC's Home navigation label is Fighters; other Home states use Teams. The supplied render's NFA typo is corrected to NFL.

The implementation uses singular Project Dollar branding with aligned diamond PROJECT and polished-gold DOLLAR, plus an emerald velvet money bag and gold dollar sign. Full-panel themes are electric blue NFL, fixed left-blue/right-red NBA, neon green NRL and neon red UFC. Continuous travelling ring highlights, background movement, reflections and material glints respect reduced motion and pause when hidden/offscreen. Crisp assets are bundled locally. All four states, navigation, refresh and existing Pages 2–3 regression checks were exercised before publication and on the actual website afterwards.

Implementation artwork, native dimensions, local source identifiers and optimized hashes are recorded in `assets/home/asset-provenance.json`. The original approved chat image remains the authority but its binary bytes were unavailable for exporting a reference panel; generated decorative layers are not claimed as extracted source pixels. New QA and final release facts are recorded under `qa/home-gate/`, particularly `RELEASE.md`. Older QA evidence was checkpointed separately as `808bf01` before this implementation. Latest integrated automatic-data production head is `4f38a25`; preserve subsequent remote changes before push.

Read `qa/home-gate/hosted-webkit/results.json` (10:44:18 AEDT, 7 October) and `qa/home-gate/independent-hosted/results.json` (10:47:41 AEDT) for exact hosted results. The user-facing actual capture gallery is `qa/home-gate/live-captures/index.html`. Physical iPhone hardware/Safari browser controls and device FPS remain unverified.

## Latest task authorization and data

The premium refinement request authorizes production publication after QA. That instruction supersedes the earlier hold on `main` for the preceding draft pass. Page 4 remains excluded. Runtime data is now the verified refreshable 2026 JSON feed; the environment/tooling remains static Python HTTP plus pinned Playwright. Current verified HTTPS retries reach the hosted site, GitHub API, official/ESPN sources and official browser downloads. See `qa/next-pass/PUBLICATION_STATUS.md` for actual hosted browser results; old CONNECT403 reports are historical.

The October 2 follow-up adds a lazy checksum-linked `player-history.json`, a source-change monitor and browser update client. Setup still requires only Node/npm, Python standard library and Chromium; no live-provider key or server backend is configured. Validate with `npm run test:data`, `npm run test:sources`, `npm run test:updates`, `npm run test:integration`, `npm run data:check` and `npm test`. Automated QA uses local files and controlled failure fixtures; archival source downloads are unnecessary for ordinary environment setup.

Optional source verification now compares the complete official Steelers roster with ESPN, binds per-player evidence to source hashes/times and preserves primary historical fields. Blocked optional sources retain valid preceding evidence for the identical primary roster hash; missing verification never implies a confirmed departure.

Additional actual-hosted checks use `npm run qa:hosted:webkit` and `npm run qa:hosted:firefox`. Genuine WebKit runs with signature/checksum-verified distro libraries extracted only under `/workspace/.onboarding/webkit-runtime`; read `qa/hosted/webkit/RUNTIME_SETUP.md`. Firefox uses disposable workspace CA profiles, retaining strict TLS. It may need sanctioned process execution when the container's UID namespace prevents startup. Neither helper rewrites `HOME`, imports persistent trust, or bypasses certificate validation. Physical iPhone/Safari hardware remains unrun.
