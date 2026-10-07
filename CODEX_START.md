# Codex Start Here

You are working on the `codex-rebuild` branch of `dinkyjunior/project-dollers`.

Read these files before editing code:
1. `AGENTS.md`
2. `README_FOR_CODEX.md`
3. `CODEX_TASK.md`
4. `QA_ACCEPTANCE.md`
5. `REFERENCE_SPEC.md`

If the original approved eight-screen Project Dollar$ render is visible in the Codex conversation context, treat that image as the highest visual authority. If not, use `REFERENCE_SPEC.md` as the fallback until the image is available.

Current release: the user-approved Home-only neon application `32f55a67d500bc8bf646679fb1879e318ef2f4b5` is deployed and verified. Final local Chromium/WebKit QA passed; exact Pages run `37551374311` succeeded at 11:20:40 AEDT, 7 October. Actual-hosted WebKit passed all four states at 393×852 and 430×896 at 11:29:52 AEDT; independent 1440×1000 hosted desktop/publication review passed at 11:26:27 AEDT. Both hosted audits verified all 183 delivered files as HTTP 200 with exact application hashes and zero console/JavaScript, HTTP, external runtime or transport failures. Brand artwork/tagline and inside-gate venue artwork are retained, the repeated below-gate sport-name/DATA & RESEARCH block is removed, and the entrance gate/ring/CTA/selected boxes/walls have stronger illuminated edges and pulse. Preserve readable text, accessible current-sport identity, the four fixed themes, existing controls/Coming-soon scope, reduced motion and lifecycle pauses. Pages 2–3 markup/application/data are unchanged; do not add Page 4. Read `qa/home-neon/RELEASE.md`, the [actual unpaused gallery](qa/home-neon/live-captures/index.html) and [before/after comparisons](qa/home-neon/before-after/index.html). Physical iPhone/Safari controls and device FPS remain untested. Do not generate new branding or venue artwork.

The preceding Page 1 launch is complete: the four-sport circular Aperture gate application `ec35fb1b6bcc442cfee89716bc6d1948ba28b557` is deployed and verified on the actual website. The user-reattached gate render supersedes the old eight-screen Home panel only. Final local Chromium/WebKit, actual-hosted mobile WebKit and independent hosted desktop/publication checks passed for that release. Keep its evidence under `qa/home-gate/`, and read `qa/home-gate/RELEASE.md` for exact historical commits/results and the source-image limitation. Those passes do not establish completion of the newer neon refinement.

Approved Home details: singular Project Dollar diamond/gold masthead and emerald money bag; electric-blue NFL, fixed blue-left/red-right NBA, neon-green NRL and neon-red UFC full-panel themes; all sport selectors work; only NFL enters a dashboard. Other entry buttons retain Coming soon but lose "Preview only". UFC's Home navigation uses Fighters; other sports use Teams. Correct NFA to NFL. Add continuously travelling ring lighting, moving background layers, reflections and glints with reduced-motion/hidden-page handling. Before reporting completion, compare all four states at both primary iPhone sizes and desktop, test existing routes/refresh and Pages 2–3 regressions, then deploy and verify the actual hosted URL.

Those behaviours and live motion are verified in `qa/home-gate/hosted-webkit/results.json` (393×852 and 430×896) and `qa/home-gate/independent-hosted/results.json` (1440×1000 desktop). Both actual-hosted audits matched 183 delivered files to tested hashes with strict TLS and no source substitution. The actual unpaused capture gallery is `qa/home-gate/live-captures/index.html`. The original wrapper-selector desktop harness mistake is archived and resolved; physical iPhone/Safari chrome and device FPS remain untested.

For the current neon pass, use explicit output paths so the prior `qa/home-gate/` evidence is preserved:

```sh
node qa/home-gate.cjs --output qa/home-neon/local-chromium
node qa/home-gate.cjs --engine webkit --mobile-only --output qa/home-neon/local-webkit
node qa/home-gate.cjs --engine webkit --mobile-only --base https://dinkyjunior.github.io/project-dollers/ --output qa/home-neon/hosted-webkit
```

The helper name remains `qa/home-gate.cjs`; its tested default now targets `qa/home-neon/`. Do not explicitly target `qa/home-gate/` outputs, which are immutable historical evidence. Read `qa/home-neon/RELEASE.md` and the existing helper qualifications; genuine WebKit uses the verified workspace runtime and strict TLS. Original chat-reference bytes are unavailable for a repository copy, so do not claim a pixel-registered source composite. Decorative implementation artwork is bundled with provenance in `assets/home/`.

Immediate mission: rebuild/refine Pages 1–3 only. Do not create Page 4.

Work sequentially: Page 1 → visual QA → Page 2 → visual QA → Page 3 → visual QA → integration QA.

Develop on `codex-rebuild` and preserve PR #1's review history. Its original draft is now merged; current production authorization is recorded below. Publish only tested changes and preserve remote automatic updates.

## Development and QA

Use the existing checkout; cloud tasks are already isolated. Do not create a Git worktree unless the user explicitly requests one. Check branch and working changes before editing.

The app is a static site. For local development serve the parent `/workspace` directory so `/project-dollers/` matches GitHub Pages:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace
```

For reproducible offline browser QA, from `/workspace/project-dollers`:

```sh
npm ci --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
npm test
```

Npm is for QA tooling only; no app build or live API credentials are required. The test starts its own temporary Python server and Chromium and saves six screenshots under `qa/`. Read `qa/README.md` and `ASSET_SOURCES.md`. Never replace verified data with invented values or reintroduce runtime hotlinks. Keep attribution when changing the stadium or font.

The user supplied the approved eight-screen render as a chat attachment. It was used directly for the latest visual comparison and sequential refinements; see `reference/CHAT_SOURCE.md` and `qa/REFERENCE_COMPARISON.md`. The attachment bytes were not available for copying to the expected image path, and the user explicitly instructed continuing without blocking. Do not mistake that file limitation for absence of an approved source. Current screenshots and side-by-side before/after evidence remain subject to user visual approval.

## Latest production pass

The latest user request authorizes publishing after final QA; it supersedes the earlier no-main restriction for this completed pass. Preserve the Pages 1–3 scope. Current runtime data is `assets/data/current.json`, generated by `scripts/refresh-data.py`, not the historical `snapshot.js`. Run `python3 qa/data.test.py`, `npm run data:check`, `npm test` and post-publication `npm run qa:hosted`. Read current `CODEX_HANDOFF_STATUS.md` and `DEPLOYMENT.md` for exact external verification limits.

## October 2 follow-up

The user requested full personal last-five and weekly-opponent game statistics, automatic updates, stronger illuminated borders and a sharper/more interactive Home. The lazy history bundle is checksum-linked to the snapshot; do not replace it with guessed figures or treat a missing statistics row as an appearance. Preserve selected-week matchup context and state through refresh. Run `npm run test:data`, `npm run test:sources`, `npm run test:updates`, `npm run test:integration`, `npm test`, and `npm run data:check`. Read the latest `qa/next-pass/` reviews. Actual upstream push remains unconnected and must not be described as live.

The final application release is `a301293`, published on both branches; PR #1 was already merged. Its description records this follow-up separately from the original PR head. Actual hosted WebKit and Firefox QA passed both primary sizes with strict TLS; use `npm run qa:hosted:webkit` and `npm run qa:hosted:firefox` with the documented workspace runtimes in this cloud. Default Chromium's hosted TLS failure is engine-specific and does not supersede those passes. Read `qa/hosted/README.md` and `qa/next-pass/PUBLICATION_STATUS.md`. Fetch/rebase the latest `codex-rebuild` and integrate incoming production data before every subsequent push.

The recovered targeted refresh report at `qa/hosted/refresh-smoke.json` confirms that `9633c03` also passed both 393×852 and 430×896 hosted WebKit checks at 12:27:13 AEST on 2 October. Do not leave its 430px result described as pending.
