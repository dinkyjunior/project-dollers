# Actual production-browser QA — October 2, 2026

The exact website, https://dinkyjunior.github.io/project-dollers/, was opened after application commit `a3012937c32681404da17aed662a0d2cba4c7b6b` deployed successfully. Both engines fetched the actual hosted application, local images and verified JSON directly. The shared suite separately injects labelled failure/recovery scenarios; its ordinary screen captures use real delivery.

| Engine | 393 × 852 | 430 × 896 | Completed (UTC) |
| --- | --- | --- | --- |
| Genuine WebKit 26, Linux WPE | Passed | Passed | 02:13:57 |
| Firefox 146 | Passed | Passed | 02:09:55 |

Both runs recorded zero console errors, HTTP errors, failed requests and external runtime requests. Navigation, direct loads, refresh, conference/week controls, roster filters/tabs, player histories, full statistics, selected opponents, local image quality, layout, complete-card border motion, reduced motion and update state/recovery passed. All 16 runtime hashes match final local Chromium QA, which also passed smaller phone, tablet and desktop sizes.

## Actual hosted screenshots

The primary captures below are genuine WebKit output, using mobile viewport/touch support and 2× DPR. PNG dimensions are therefore twice the CSS viewport dimensions.

| Page | 393 × 852 | 430 × 896 |
| --- | --- | --- |
| Home | [Screenshot](webkit/home-393.png) | [Screenshot](webkit/home-430.png) |
| NFL dashboard | [Screenshot](webkit/nfl-393.png) | [Screenshot](webkit/nfl-430.png) |
| Steelers | [Screenshot](webkit/steelers-393.png) | [Screenshot](webkit/steelers-430.png) |

[Six-screen sheet](contact-sheet.jpg) · [WebKit report](webkit/results.json) · [Firefox report](firefox/results.json) · [Hosted HTTP/hash audit](../next-pass/HOSTED_HTTP_AUDIT.json) · [Previous/current browser comparisons](../next-pass/comparison.jpg)

Each engine directory also contains full game statistics, opponent history, schedule, team stats, matchup, recap and source captures. [WebKit runtime setup](webkit/RUNTIME_SETUP.md), [verified package chain](webkit/package-verification.json) and [Firefox engine/TLS qualification](firefox/engine-and-tls.json) document reproducibility.

## Scope and security

TLS and hostname verification stayed enabled. WebKit used the provided CA only in its task environment and signature/checksum-verified Debian libraries extracted under the workspace. Firefox used fresh disposable workspace certificate profiles, all removed after the run. No persistent trust store, system library installation, rewritten `HOME` or certificate-error bypass was used.

WebKit is the genuine engine with native mobile/touch support; it does not reproduce physical iPhone hardware or Safari browser controls. Firefox supports viewport/DPR/touch but not Playwright's `isMobile`; it is a second-engine check. Physical iPhone/Safari testing remains unrun. The root `failure.json`/`results.json` retain default Chromium's engine-specific proxy certificate failure; those files do not supersede the successful strict-TLS WebKit/Firefox runs. Earlier Firefox and HTTP evidence is archived with its original application context.

The approved visual source is the chat attachment. Its original file bytes were unavailable, so comparison sheets show clearly labelled previous versus current browser output rather than invented approved-source pixels. Page 4 remains outside scope.
