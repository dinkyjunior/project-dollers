# Saved environment access correction

The running app development workflow is ready: pinned Chromium/Playwright and Python can render and test the static site under `/project-dollers/`. All required local functional, data, source-monitor, automatic-update and integrity checks pass.

Reading the saved cloud configuration found a restricted allowlist containing only `a.espncdn.com`, `commons.wikimedia.org` and `upload.wikimedia.org`, plus the package-manager preset. The required hosted website and API/browser verification destinations were absent. The saved startup text also described the previous hotlink prototype and unimplemented controls, which is now obsolete.

Using [cloud-environment-onboarding:setup](skill://plugin_connector_1p_ed5feb9070a08191b08c81c47947bc16/setup/SKILL.md), a configuration draft was saved successfully with:

- Updated complete `start_skill` instructions for the current local assets, checksum-linked lazy history, full controls and actual repository QA commands.
- Network destinations preserving the three existing image hosts and adding the exact public website, GitHub/API/raw/release destinations, public ESPN/official verification hosts, official Playwright downloads and `snapshot.debian.org`/`deb.debian.org` for signature-verified browser runtime libraries.
- The existing installation instructions, secrets and unrelated configuration fields left in place.

Draft persistence was confirmed with `status: saved`. No secret values were inspected, copied or requested. No API/provider subscription was invented.

The skill explicitly states: **“Saving persists configuration; it does not execute scripts, apply runtime changes, or publish.”** Its [onboarding contract](skill://plugin_connector_1p_ed5feb9070a08191b08c81c47947bc16/setup/references/onboarding.md) distinguishes saved drafts from the running machine. The user can apply the draft in environment settings; hosted/API/WebKit access then needs a real retry before any readiness claim. Saving this draft is not evidence those destinations became reachable.

This configuration review did not block application refinement or Git publication. The final app was published in commit `a3012937c32681404da17aed662a0d2cba4c7b6b` and Pages run 36954044966 succeeded.

## Actual retries after saving

Subsequent ordinary HTTPS requests now reach the hosted website and the GitHub API successfully. This observation establishes current reachability; it does not establish that draft persistence itself applied a runtime change. [GitHub API release metadata](GITHUB_API_RELEASE_STATUS.json) confirms Pages uses `main` / root with HTTPS enforced. Official Playwright Firefox and WebKit downloads now succeed as well.

[Hosted HTTP evidence](HOSTED_HTTP_AUDIT.json) records verified TLS/hostname checks against the exact production URL. All 16 served runtime bodies match the final local QA hashes, all 171 repository asset URLs return 200, and current/history/provenance checksums agree. The history response actually transfers as 233,052 gzip bytes, decoding to 6,836,610 bytes. This is observed hosted compression, not an estimate.

Default Chromium still reports `ERR_CERT_AUTHORITY_INVALID`: the environment's supplied public proxy CA is available to curl but absent from Chromium's persistent user NSS store. Automatic approval review rejected adding it to the permanent store because that would extend HTTPS trust beyond this QA task, recommending temporary per-run trust. The rejected import was not executed. No certificate-error bypass was used. A private mount-namespace trial was unavailable (`uid map: Read-only file system`); it changed no trust store. Alternative browser verification uses workspace-only temporary profiles and the supplied CA, keeping TLS and hostname validation enabled. See the current publication report for the resulting browser status.

Both alternatives completed successfully against the original hosted URL: Firefox 146 at 02:09:55 UTC and genuine WebKit 26 at 02:13:57 UTC, each at 393×852 and 430×896. Firefox uses disposable workspace NSS profiles, all removed afterwards. WebKit uses the supplied CA only in its task environment and signed/checksummed Debian libraries extracted under the workspace. No persistent trust or system library installation was performed. See [hosted evidence](../hosted/README.md); this is browser-engine testing, not physical iPhone hardware validation.
