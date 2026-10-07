# Production publication and verification

## Current Page 1 neon refinement — deployed and verified

The user-approved Home-only neon application `32f55a67d500bc8bf646679fb1879e318ef2f4b5` is published on `codex-rebuild` and `main`; [Pages run 37551374311](https://github.com/dinkyjunior/project-dollers/actions/runs/37551374311) succeeded for that exact commit at 11:20:40 AEDT, 7 October. Final local Chromium five-size and genuine WebKit two-size QA passed. It preserves brand/tagline and venue artwork, removes the repeated below-gate sport-name/DATA & RESEARCH block, and adds a thicker entrance gate with much stronger glowing/pulsating ring, entry/selected boxes and walls. Existing four-state functionality, reduced motion, Pages 2–3 and data remain intact; Page 4 remains excluded. Read [the complete release record](qa/home-neon/RELEASE.md), [eight actual unpaused mobile captures](qa/home-neon/live-captures/index.html) and [before/after comparisons](qa/home-neon/before-after/index.html).

[Actual-hosted genuine WebKit mobile QA](qa/home-neon/hosted-webkit/results.json) passed all four sports at 393×852 and 430×896 at 11:29:52 AEDT, 7 October (`2026-10-07T00:29:52.727Z`). [Independent genuine WebKit desktop/publication review](qa/home-neon/independent-hosted/results.json) passed at 1440×1000 at 11:26:27 AEDT (`2026-10-07T00:26:27.777Z`). Each independently received HTTP 200 for all 183 delivered runtime/assets files with exact tested application hashes and zero console/JavaScript, HTTP, external runtime or transport failures. Strict TLS/hostname verification remained enabled, and no site/data responses were substituted. Controls, direct routes/refresh, naturally changing ring/venue/pulse layers, reduced motion and lifecycle handling passed; the hosted mobile suite also rechecked Pages 2–3 source histories and full-card perimeter motion. Source review confirms those pages' complete section markup, `assets/app.js` and current/history/provenance data remain byte-identical to the preceding release. Physical iPhone/Safari controls and device FPS remain untested.

The preceding deployment below is verified historical evidence. Its success and captures are not relabelled as proof of the new glow/layout refinements.

## Previous Page 1 launch — deployed and verified

On 7 October 2026 (Australia/Sydney), the approved four-sport Aperture Home launched with "Preview only" removed, Fighters used for UFC, and continuous sport-themed lighting/background motion. Application `ec35fb1b6bcc442cfee89716bc6d1948ba28b557` was published on `codex-rebuild` and `main`. [Pages run 37547594682](https://github.com/dinkyjunior/project-dollers/actions/runs/37547594682) succeeded for that exact commit, including build, deploy and report jobs. Final local Chromium/WebKit QA passed; actual-hosted WebKit passed both primary mobile sizes at 10:44:18 AEDT, and independent hosted 1440×1000 desktop/publication review passed at 10:47:41 AEDT. Pages 2–3 markup and app routing are preserved; Page 4 remains excluded. Read [the release record](qa/home-gate/RELEASE.md) and [actual capture gallery](qa/home-gate/live-captures/index.html).

Recovered preceding evidence was checkpointed as `808bf01` and latest automatic-data production commit `4f38a25` was integrated without replacing its source data. Fresh fetch/rebase preceded ordinary non-forced publication. The 22 data, seven source-monitor and eight updater regression groups and focus/scroll-preserving update integration pass. Continue fetching/rebasing before future pushes and preserve later source refreshes.

[Actual hosted mobile evidence](qa/home-gate/hosted-webkit/results.json) covers all four sports at 393×852 and 430×896, native WebKit mobile/touch mode and DPR2; [independent desktop evidence](qa/home-gate/independent-hosted/results.json) covers 1440×1000, four-state interactions, natural-frame ring/venue movement and a separate publication audit. Each audit received HTTP 200 for all 183 delivered files with exact tested SHA-256 hashes. Both recorded zero console/JavaScript, HTTP, external runtime or transport failures. TLS/hostname verification remained enabled and no site/data responses were substituted. The desktop harness's original static-wrapper selector error is retained as failed test evidence and resolved; corrected sampling passed without an application change. Physical iPhone/Safari controls and device FPS remain unverified.

## Previous verified release — 2 October 2026

The Pages 1–3 application release `a3012937c32681404da17aed662a0d2cba4c7b6b` was published and verified on **2 October 2026 (Australia/Sydney)** at:

https://dinkyjunior.github.io/project-dollers/

GitHub's API confirms branch-source Pages (`legacy`), `main` / root, HTTPS enforced, and built status. [Pages run #48](https://github.com/dinkyjunior/project-dollers/actions/runs/36954044966) completed successfully for that exact application commit; its build, deploy, and report jobs all succeeded. The ordinary public run page independently confirms the same result.

The latest user request authorizes publishing the finished Pages 1–3 pass after QA. Page 4 remains excluded. Fetch/rebase `codex-rebuild` before pushing, fetch `main` before publication, and preserve remote changes. PR #1 was already merged at original commit `c8bf0d2`; its merged head stays frozen there. The subsequent production follow-up is recorded separately rather than presented as an open draft PR. Its review description was updated and [independently confirmed](qa/next-pass/PR_UPDATE_CONFIRMATION.json).

## Actual hosted verification

The actual public URL passed the complete shared browser suite at **393×852 and 430×896 CSS pixels**, DPR2, in both official Firefox 146.0.1 and genuine WebKit 26.0. Both sizes in both engines recorded zero console, HTTP, transport, or external runtime request failures. Navigation/direct refresh, controls, personal and selected-opponent game research, statistics, complete-card and expanded-card perimeter motion, asset quality, geometry, and separately isolated retry/update recovery checks passed. These are genuine hosted browser requests, not locally fulfilled copies of the site.

[The HTTP audit](qa/next-pass/HOSTED_HTTP_AUDIT.json) separately matched all 16 served runtime files to the tested hashes and received HTTP 200 for all 171 bundled asset paths. Current snapshot, history, and provenance/source-version joins passed. The actual lazy history GET transferred **233,052 gzip bytes** for **6,836,610 decoded bytes**; this is the measured response, not a local compression estimate.

[Firefox evidence](qa/hosted/firefox/results.json) completed at 12:09:55 AEST; [WebKit evidence](qa/hosted/webkit/results.json) completed at 12:13:57 AEST on 2 October. WebKit supports native `isMobile`, touch and DPR2. Firefox does not support Playwright `isMobile`; its requested viewport/DPR/touch qualification is explicit. Neither reproduces physical iPhone hardware or Safari's address/tab controls. Those hardware checks remain unrun.

TLS and hostname verification stayed enabled. The supplied environment CA was scoped to disposable Firefox profiles or the per-run WebKit environment; no certificate-error exception, HOME rewrite, or persistent system trust change was used. Firefox profiles were removed after QA. WebKit's eleven verified distribution dependency packages were extracted only in the workspace. Old Chromium certificate/CONNECT failures remain historical engine evidence; they are not the final hosted verification result.

## Automated data refresh after the full-suite release

A later automatic data commit, `9633c03cad6d069c51731795a9d098d713d3100a`, was reported on `origin/main`, with snapshot timestamp 12:18:57 AEST on 2 October. [The recursive comparison](qa/next-pass/POST_RELEASE_AUTO_REFRESH.json) found all 49,842 current-data, 328,354 history, and 495 provenance factual leaves unchanged; only retrieval/check/hash/byte metadata changed in the three linked JSON files. Root safely integrated that incoming refresh and `data:check` passed. The recovered [targeted strict-TLS WebKit report](qa/hosted/refresh-smoke.json) confirms that both 393×852 and 430×896 passed, with served hashes, data joins and navigation verified; it completed at 12:27:13 AEST on 2 October. The full-suite reports above remain immutable evidence for `a3012937`.

## Data delivery

The site is static and uses relative bundled assets/data under `/project-dollers/` with hash navigation. `index.html`, `.nojekyll`, `404.html` and the local asset paths support that subpath. There is no exposed server-side credential or fragile runtime image hotlink.

`.github/workflows/refresh-nfl-data.yml` checks conditional source validators every fifteen minutes around verified game/provider-release windows and hourly otherwise. Changed sources, manual force, or the six-hour safety interval trigger validated refresh. Current snapshot, provenance and lazy history publish together; required-source or validation failures retain the preceding verified snapshot. Token-authored data commits explicitly request `POST /repos/{owner}/{repo}/pages/builds`, because they do not automatically trigger the branch Pages build. The UI marks data stale after twelve hours and treats unverified/missing fields explicitly.

Browser checks run on open/resume/focus/reconnect/manual refresh and while active, using conditional same-origin requests. Replacement history must match its checksum/source versions; preceding verified history survives replacement failure. Provider post-game releases and corrections govern detailed statistics. The repository-dispatch hook has no connected upstream provider relay, and no live in-game provider/backend is configured.

## Reproduce the hosted checks

Synchronize the published snapshot and finish local QA before running:

```sh
python3 qa/hosted-http-audit.py --ca-file /usr/local/share/ca-certificates/environment-proxy-ca.crt
PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/playwright-browsers HOSTED_CA_FILE=/usr/local/share/ca-certificates/environment-proxy-ca.crt node qa/hosted-firefox.cjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.onboarding/playwright-browsers node qa/hosted-webkit.cjs
```

The helper comments document browser/dependency prerequisites. Firefox may require sanctioned scoped execution where the cloud's read-only UID namespace prevents startup; the helper does not self-elevate or silently disable the browser sandbox. Existing Firefox and HTTP evidence is archived before replacement. [Publication status](qa/next-pass/PUBLICATION_STATUS.md) and the selected API/public GitHub JSON reports distinguish application publication, hosted QA, and subsequent data refreshes.
