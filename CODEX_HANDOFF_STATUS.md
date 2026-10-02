# Project Dollar$ handoff — premium current-data pass

## Latest follow-up — October 2, 2026 (Sydney)

The user approved the base and requested full personal last-five and weekly-opponent statistics, more automatic updates, brighter borders and a crisper/more interactive Home. This pass preserves Pages 1–3. Home now uses native outlined vector branding and deliberate lighting/reflections; shared blue/gold rails are stronger.

Player research lazy-loads a checksum-linked full-statistics bundle spanning verified 2005–2026 regular seasons. It covers 77 players, 1,224 retained game rows and all 14 scheduled opponents, preserving previous clubs and original game context. Shorter histories and unavailable rows are explicit. Selected-week fixture entry now follows the selected opponent. Statistics prioritise the player's position and retain every additional provider field behind a disclosure.

Browser checks run on open, resume, focus, online return and refresh, plus conditional checks while active. Source monitoring detects published changes around game/provider windows. Genuine live in-game/push data is not configured; provider release cadence is documented. Updates preserve filters, selected weeks, native disclosures, focus and deep scroll. Invalid feeds, render failures and rejected history checksums retain verified data and original source times.

Final local QA passed five viewports at 2026-10-02T00:55:14.553Z; all 16 runtime hashes match. Fifteen data/history, seven source-monitor and eight update behaviour regression groups pass. Independent raw CSV audits and rich UI field comparisons passed. Read `qa/next-pass/README.md` and its independent visual, data, source, control, motion and automatic-update reviews for current evidence.

The saved environment allowlist was found to omit the hosted URL. A concrete network/startup draft was saved with the cloud onboarding skill, preserving existing destinations and setup requirements. It does not change live runtime access by itself. Read `qa/next-pass/ENVIRONMENT_ACCESS.md`; actual hosted and Safari verification require the saved access change and successful retries. Publication status for this follow-up is recorded separately after the final push.

## Scope and authorization

Only Pages 1–3 are implemented. No Page 4. Repository `dinkyjunior/project-dollers`; working branch `codex-rebuild`, PR #1; GitHub Pages production source documented as `main` / root. The latest user request explicitly authorizes completing QA, updating the PR and publishing the finished implementation to production. This supersedes the earlier request to keep `main` untouched for the preceding review pass.

## Implementation

Approved eight-screen chat render first three panels remain the visual authority. Original binary bytes and the separately mentioned concept render were unavailable; no approved-source composite is claimed. Two visual fix cycles retained the masthead/tile/standings/five-card silhouettes while improving type, borders, image crops and touch geometry.

76 genuine native headshots, all 32 team marks and league marks are local optimized assets. The stadium art has no people and is explicitly generated background artwork; no faces were generated. WOFF2 type and native WebP imagery are used at runtime.

Current 2026 data supersedes the static 2025 sample. The replaceable local JSON feed carries all 32 records, full Steelers roster, game/player/team stats, depth and injury/practice context, schedule, recaps and matchup research. A standard-library refresh script and six-hour/manual workflow validate and publish changes. The complete rounded player card remains the football track, including expanded inline research.

## Validation

Final Chromium QA passes 393×852, 430×896, 320×700, 768×1024 and 1440×1000 at 2× DPR. Five data regressions and snapshot/provenance checks pass. Six current primary captures, tab/detail evidence and before/after sheets are committed under `qa/`. Six available parallel agent slots were used for functional, visual, source, performance, Safari readiness and deployment review.

The exact tested content is recorded by runtime/data hashes in `qa/results.json`; screenshots do not merely refer to the old pre-commit Git HEAD. Independent reports document no current factual discrepancies, clean mobile geometry, authentic images and motion lifecycle checks.

## External verification limits

The tested application commit `c8bf0d298d5915460a11b6bc1776d3a9a93a0208` has been published to `codex-rebuild` and `main`, preserving remote history; PR #1's remote head was confirmed at that commit. See `qa/PUBLICATION_STATUS.md` for publication and verification evidence.

Ordinary public GitHub HTML independently confirms PR #1 is merged and Pages build/deployment run #37 succeeded for the exact application commit. Minimal sanitized evidence is saved in `qa/hosted/public-github-status.json`. The Pages workflow succeeded; actual served browser behavior is still unverified.

The exact hosted URL was tested again after publication at 2026-10-01T16:14:54Z. Normal requests still fail at the environment CONNECT tunnel with 403 before receiving a website response; GitHub API requests are Forbidden. A Git push is not a hosted-site verification. `npm run qa:hosted` saves the actual blocked outcome under `qa/hosted/`. Actual hosted verification remains pending accessible network transport. Pages configuration and refresh workflow execution cannot currently be checked through the API.

Official WebKit downloads also return 403. Chromium iPhone touch/3× and compact-height checks passed, but actual Safari/iPhone hardware is unrun. Independent official/second-provider NFL access was blocked; datasets were independently recomputed but not falsely claimed cross-provider confirmed. Forecast, travel itinerary, confirmed inactives and exactly timed historical prices remain unavailable.

Read `qa/README.md`, the independent review files and `DEPLOYMENT.md` before continuing. Use the existing checkout; no worktree is needed. Fetch and rebase current `codex-rebuild` before another push.
