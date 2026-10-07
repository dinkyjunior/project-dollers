# Codex Cloud Environment — Project Dollar$

The final Page 1 metal entrance and cross-engine floor correction are **deployed and verified** at https://dinkyjunior.github.io/project-dollers/. All six agents accepted all 16 current Chromium/WebKit sport captures against the approved chat render before publication. Complete local Chromium five-size and genuine WebKit two-size suites passed. Actual-hosted WebKit passed both requested phones at 13:13:12 AEDT on 7 October 2026; independent hosted desktop/publication review passed at 13:19:01 AEDT on 7 October 2026. Both hosted audits received HTTP 200 and exact tested hashes for all 184 runtime files with zero console/JavaScript, HTTP, external runtime or transport errors. Independent review accepted all eight final live captures; native manual refresh also passed both phones. Original branding, venues, genuine logos and Pages 2–3 remain; no Page 4. Read [the release record](qa/home-metal/RELEASE.md), [live screenshots](qa/home-metal/live-captures/index.html) and [eight before/after comparisons](qa/home-metal/before-after/index.html).

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

The user-approved further Home-only refinement is deployed and verified as `32f55a67d500bc8bf646679fb1879e318ef2f4b5`. Final local Chromium/WebKit QA passed; exact Pages run `37551374311` succeeded at 11:20:40 AEDT. Actual-hosted genuine WebKit passed both 393×852 and 430×896 at 11:29:52 AEDT, and independent 1440×1000 hosted desktop/publication review passed at 11:26:27 AEDT. Each hosted audit verified all 183 delivered runtime files as HTTP 200 with exact application hashes and zero console/JavaScript, HTTP, external runtime or transport failures. The existing brand artwork, brand tagline and venue artwork inside the gate are retained. The repeated sport-name and DATA & RESEARCH hero block below the gate is removed; selected controls and entry labels retain an accessible current-sport identity. The entrance gate/ring is thicker and much more prominently illuminated, with stronger neon glow and pulse across the ring, entry button, selected sport boxes and architecture/walls.

Preserve the fixed NFL blue, NBA left-blue/right-red, NRL green and UFC red palettes, real selectors/NFL navigation, Coming-soon restrictions, UFC Fighters label, reduced-motion support and animation lifecycle pauses. NBA's hard base stays split; diffuse bloom/reflection can mildly mix at the centre. At application `32f55a67`, Pages 2–3 markup, application code and the three current/history/provenance data files were byte-identical to the preceding release; no Page 4 was added. The actual captures confirm materially stronger edge/glow, legible controls and clean spacing. Read `qa/home-neon/RELEASE.md`, `hosted-webkit/results.json` and `independent-hosted/results.json`; view all eight unpaused primary-size captures in `qa/home-neon/live-captures/index.html` and the corresponding boards in `qa/home-neon/before-after/index.html`. Genuine browser/emulation results do not certify physical iPhone/Safari controls or device FPS, which remain untested. Keep prior `qa/home-gate/` evidence unchanged.

A required fresh pre-publication fetch subsequently found automatic data commit `79b3160b56af66121aed80d29c67274b4e04235a`, already deployed by successful Pages run `37552404155`. It is preserved through rebase. The three data files now have new retrieval/check/validator/checksum metadata (retrieval 11:31:07 AEDT); their bytes differ from the original full-suite manifest. `qa/home-neon/post-refresh/source-diff.json` independently verifies 1,776 metadata-only changes and zero factual/type/collection-shape changes; all 180 other runtime/assets files remain byte-identical to `32f55a67`. Data/checksum validation and 22 data regressions passed after integration. Targeted actual-hosted genuine WebKit checks passed both primary phone sizes at 11:37:02 AEDT (`2026-10-07T00:37:02.046Z`), receiving HTTP 200/exact integrated hashes for all 183 files at each size, with zero console/HTTP/transport/external errors. Routes/refresh, source dialog, current images/geometry and one player's complete personal/opponent last-five source rows passed. Read `qa/home-neon/post-refresh/results.json`; the original full hosted reports remain immutable evidence for the original application/snapshot.

The narrow hosted manual-refresh companion also passed both phone sizes at 11:39:06 AEDT (`2026-10-07T00:39:06.649Z`): native click produced `checking` → successful `unchanged`, with reason `manual`, actual HTTP 200/exact refreshed snapshot hash and zero console/JavaScript errors. Read `qa/home-neon/post-refresh/manual-refresh.json`.

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
