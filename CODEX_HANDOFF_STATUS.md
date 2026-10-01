# Project Dollar$ handoff — premium current-data pass

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

Normal requests to the exact GitHub Pages URL fail at the environment CONNECT tunnel with 403 before receiving a website response; GitHub API requests are Forbidden. A Git push is not a hosted-site verification. `npm run qa:hosted` saves the actual blocked outcome under `qa/hosted/` and must be retried after production publication. Pages configuration and refresh workflow execution cannot currently be checked through the API.

Official WebKit downloads also return 403. Chromium iPhone touch/3× and compact-height checks passed, but actual Safari/iPhone hardware is unrun. Independent official/second-provider NFL access was blocked; datasets were independently recomputed but not falsely claimed cross-provider confirmed. Forecast, travel itinerary, confirmed inactives and exactly timed historical prices remain unavailable.

Read `qa/README.md`, the independent review files and `DEPLOYMENT.md` before continuing. Use the existing checkout; no worktree is needed. Fetch and rebase current `codex-rebuild` before another push.
