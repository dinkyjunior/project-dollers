# Production publication status

Application commit: `c8bf0d298d5915460a11b6bc1776d3a9a93a0208` — premium Pages 1–3, current verified NFL snapshot, local assets and final local QA evidence.

On 2026-10-01, the latest remote `codex-rebuild` and `main` were fetched. `codex-rebuild` rebased cleanly; `main` was confirmed to be an ancestor of the tested implementation. Normal, non-forced pushes published the application commit to both branches. A subsequent remote check confirmed `refs/heads/codex-rebuild`, `refs/heads/main` and `refs/pull/1/head` all resolve to that application commit.

The ordinary public [PR #1 page](https://github.com/dinkyjunior/project-dollers/pull/1) independently confirms state **MERGED**, base `main`, head `codex-rebuild`, and both head/merge commit at the application commit. GitHub recognized the production fast-forward as merging the PR. The latest user deployment instruction authorized this production publication. The PR received the implementation and committed review evidence; its proposed description is prepared in [PR_REVIEW.md](PR_REVIEW.md). Editing that description through the GitHub API remained blocked, so no successful description update is claimed.

The documented production source is GitHub Pages `main` / root. Git publication is confirmed. The ordinary public [GitHub Pages run #37](https://github.com/dinkyjunior/project-dollers/actions/runs/36890470769) independently displays **Success** for the exact application commit. Parsed public GitHub PR/build evidence is saved in [public-github-status.json](hosted/public-github-status.json). This confirms the Pages workflow completed successfully; it does not establish the actual served browser behavior. Live Pages configuration remains unreadable through the blocked GitHub API.

## Actual hosted test after publication

`npm run qa:hosted` was run against <https://dinkyjunior.github.io/project-dollers/> after the production push, at **2026-10-01T16:14:54Z**. Chromium could not receive the website: `net::ERR_TUNNEL_CONNECTION_FAILED`. The ordinary same-URL HTTP probe received **403 from the environment CONNECT tunnel**, with `server: envoy`; it did not receive an origin response. Evidence: [results.json](hosted/results.json) and [failure.json](hosted/failure.json).

Hosted rendering, asset loading, refresh, navigation and animation are therefore **unverified**, not failed at the origin and not passed. No hosted screenshot is substituted with a local capture. The local five-viewport QA pass and independent data checks remain valid; runtime hashes identify the exact application content tested.

Actual Safari/iPhone hardware testing remains unrun because official WebKit browser downloads were blocked. The Chromium mobile/touch fallback and its limitation are documented in [SAFARI_REVIEW.md](SAFARI_REVIEW.md).

Documentation and blocked-test evidence may be published in a subsequent commit without changing this application content. The final branch heads will then include that documentation commit. Page 4 remains untouched.
