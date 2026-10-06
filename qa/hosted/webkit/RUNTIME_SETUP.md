# Supported WebKit runtime and strict hosted QA

The official Playwright WebKit 26.0, build 2248, is downloaded into `/workspace/.onboarding/playwright-browsers/webkit-2248`. This is the real Linux WPE WebKit engine. Mobile viewport, DPR and touch checks do not reproduce actual iPhone hardware or Safari browser chrome.

Seven libraries were initially missing: GTK 4, Graphene, HarfBuzz ICU, Manette, Hyphen, WOFF2 and GLES. The first attempts against the environment's existing Debian snapshot and configured mirror returned CONNECT 403. After actual transport to the authorized official Debian mirror became available, ordinary HTTPS APT downloaded seven library packages and four required dependencies into `/workspace/.onboarding/webkit-runtime/packages`.

APT configuration, source list, package lists, cache and extracted files live only inside that workspace directory. No package was installed into the system. The sources use HTTPS `deb.debian.org`, suite `trixie`, with the existing `/usr/share/keyrings/debian-archive-keyring.gpg` keyring and normal signature verification. The supplied environment CA is explicitly scoped to the request/runtime; certificate and hostname verification remain enabled. Metadata-expiry checks were not disabled for the new mirror.

Verification was independently repeated with Sequoia's installed `sqv`, using its current cryptographic policy and requiring a signature dated on or after 1 September 2026. The authenticated Release's SHA256 matched the uncompressed Packages index. Every downloaded `.deb` SHA256 then matched the corresponding exact package/version/architecture record before `dpkg-deb --extract` unpacked it into the workspace `root` directory. [package-verification.json](package-verification.json) records all eleven versions, sizes, hashes and the authenticated index chain. No package binaries are committed.

The official `pw_run.sh` bundle wrapper replaces `LD_LIBRARY_PATH`. The QA helper therefore uses Playwright's supported `executablePath` option with the exact official WPE `bin/MiniBrowser` and supplies the equivalent official bundle environment plus the verified workspace library path for this run. `ldd` confirmed no unresolved WPE binary or engine dependencies. No browser sandbox or certificate-security flags were disabled.

Run the complete shared hosted suite after local QA and publication have stabilized:

```sh
node qa/hosted-webkit.cjs
```

The helper defaults to the workspace paths above. `PLAYWRIGHT_BROWSERS_PATH`, `PD_QA_WEBKIT_RUNTIME` and `PD_QA_CA_FILE` can select other verified task-specific paths. It uses the environment-provided proxy without printing it, keeps normal TLS/hostname validation, and creates disposable browser contexts. It does not alter `HOME`, global certificate stores, browser binaries, app files or live data.

The primary suite runs the real hosted URL at 393×852 and 430×896 with native `isMobile`, touch and 2× DPR. Baseline data and images are loaded from the hosted site. Deliberate checksum/timeout/503/older-snapshot recovery tests intercept requests only in separately labelled isolated contexts. `results.json` records runtime/data hashes, controls, full player statistics, motion, layout, image checks and actual browser captures; `engine-and-tls.json` states the engine and trust scope explicitly.

The final full shared suite passed at both target viewports on 2026-10-02T02:13:57.666Z, after GitHub Pages run 36954044966 completed successfully for application commit `a3012937c32681404da17aed662a0d2cba4c7b6b` and strict-TLS release probes matched the local index and data hashes. All sixteen runtime/data hashes stayed unchanged during QA. The saved evidence includes 26 actual hosted screenshots, exact player-history/source-field comparisons, selected-opponent and bye controls, full-card motion, Retina assets, layout/navigation, source-conflict handling, and isolated failure/retry/update-state preservation. Both mobile runs recorded zero console, HTTP, transport or external-runtime request errors. [results.json](results.json) remains the detailed authority; [summary.json](summary.json) is a compact digest. This is a genuine WebKit mobile-emulation result, with the physical iPhone/Safari-browser-control limits stated above.
