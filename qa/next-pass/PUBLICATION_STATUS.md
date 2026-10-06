# Published application and actual hosted QA

Recorded 2 October 2026 (Australia/Sydney). Application commit: `a3012937c32681404da17aed662a0d2cba4c7b6b`.

The implemented Pages 1–3 follow-up was published to `codex-rebuild` and production `main`. [GitHub Pages run #48](https://github.com/dinkyjunior/project-dollers/actions/runs/36954044966) succeeded for that exact application commit. The API confirms `main` / root, branch-source Pages, and enforced HTTPS. The actual target is:

https://dinkyjunior.github.io/project-dollers/

| Verification | Result | Evidence |
|---|---|---|
| Published application build/deploy | Success; exact `a3012937`, all three jobs passed | [Selected GitHub API status](GITHUB_API_RELEASE_STATUS.json), [ordinary public run summary](PUBLIC_GITHUB_DEPLOYMENT.json) |
| Actual HTTPS bodies/assets | All 16 runtime hashes match; 171/171 asset HEADs return 200; data/history/provenance joins pass | [HTTP audit](HOSTED_HTTP_AUDIT.json) |
| Actual hosted Firefox 146.0.1 | Both 393×852 and 430×896, DPR2/touch: complete shared suite passed | [Report](../hosted/firefox/results.json), [engine/TLS qualification](../hosted/firefox/engine-and-tls.json) |
| Actual hosted WebKit 26.0 | Both 393×852 and 430×896, native mobile mode/DPR2/touch: complete shared suite passed | [Report](../hosted/webkit/results.json), [engine/TLS qualification](../hosted/webkit/engine-and-tls.json) |
| Local Chromium 151 | 393×852, 430×896, 320×700, 768×1024 and 1440×1000 passed | [Local report](../results.json) |

Both hosted engines recorded zero console, HTTP, transport, or external runtime request failures. Checks include all three screens, navigation/history/direct refresh, standings/week/team/filter controls, individual/opponent histories and source values, expanded statistics, complete outer-card football/light tracks, reduced motion, sharp/local images, text/card geometry, and separately labelled request-failure/retry/monotonic-update/state-and-scroll recovery.

Representative current screenshots:

| Page | WebKit 393×852 | WebKit 430×896 |
|---|---|---|
| Home | [View](../hosted/webkit/home-393.png) | [View](../hosted/webkit/home-430.png) |
| NFL | [View](../hosted/webkit/nfl-393.png) | [View](../hosted/webkit/nfl-430.png) |
| Steelers | [View](../hosted/webkit/steelers-393.png) | [View](../hosted/webkit/steelers-430.png) |

The measured lazy history transfer is 233,052 gzip bytes for 6,836,610 decoded bytes. Hashes before/after QA remained stable. Firefox's supplied CA existed only in disposable task profiles, all removed afterwards; WebKit used the supplied CA per run and verified workspace-only distribution libraries. Both retained TLS/hostname verification with `ignoreHTTPSErrors:false`. No HOME/system trust modification or credential/profile commitment occurred.

PR #1 is the **merged original release** at `c8bf0d298d5915460a11b6bc1776d3a9a93a0208`, merged at 02:14 AEST on 2 October. Its API head remains frozen at that original commit. The authorized later application `a3012937` is published separately on the repository branches; it is not falsely described as the still-open head of Draft PR #1. Its review description was updated and [independently confirmed](PR_UPDATE_CONFIRMATION.json).

After this immutable full-suite pass, normal automatic refresh advanced `origin/main` to `9633c03cad6d069c51731795a9d098d713d3100a` (snapshot 12:18:57 AEST on 2 October). [POST_RELEASE_AUTO_REFRESH.json](POST_RELEASE_AUTO_REFRESH.json) confirms all 49,842 current, 328,354 history, and 495 provenance factual leaves remain identical; the three linked JSON files changed retrieval/check/hash/byte metadata only. Root safely integrated that incoming update and `data:check` passed. The recovered [targeted strict-TLS WebKit report](../hosted/refresh-smoke.json) confirms **both 393×852 and 430×896 passed**, completed at 12:27:13 AEST on 2 October, with served manifests, linked data and navigation verified. This report does not relabel the earlier full suite as a test of a later commit or establish completion of the subsequently approved Aperture Home launch.

Physical iPhone hardware and Safari browser chrome remain unrun. Firefox cannot emulate Playwright `isMobile`; its viewport/DPR/touch limitation is recorded. Genuine Linux WebKit supports mobile mode but does not reproduce physical hardware. No upstream provider push relay or live in-game provider is configured; the validated polling/refresh pipeline is active. Page 4 remains outside scope. Earlier Chromium trust/CONNECT failures are preserved as historical evidence and do not represent the final Firefox/WebKit hosted outcome.
