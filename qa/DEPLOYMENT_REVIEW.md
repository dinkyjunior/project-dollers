# Production deployment readiness review

Reviewed 2 October 2026, 01:38 AEST (2026-10-01 15:38 UTC). This is a readiness audit, not a successful deployment claim.

The user's latest rebuild request explicitly authorizes publishing the finished, verified Pages 1–3 implementation to production. Earlier handoff instructions requiring a later approval to merge are superseded by that instruction. Page 4 remains outside scope. This reviewer has not pushed, merged, changed Pages settings, or invoked a build.

## Hosting contract

- Repository: `dinkyjunior/project-dollers`.
- Required URL: <https://dinkyjunior.github.io/project-dollers/>.
- Documented Pages source: production branch `main`, root directory. This is recorded in `AGENTS.md` and `CODEX_ENVIRONMENT.md`; live settings could not be independently queried during this audit.
- The repository has `.nojekyll`. The app is static; it needs no server-side runtime, third-party hotlinked assets, or exposed API credentials.
- `npm run qa:hosted` uses the exact production URL, checks the browser's loaded dataset against local `assets/data/current.json`, and exercises both requested mobile sizes. It records an access failure explicitly instead of treating a local test as proof of deployment.

## Scheduled data publishing

`.github/workflows/refresh-nfl-data.yml` runs every six hours and supports manual dispatch. Its refresh job is limited to `refs/heads/main`, validates the snapshot, stages only the two data JSON files, and rebases before pushing. A failed data refresh/check does not publish unverified values.

The workflow grants `contents: write` for snapshot commits and `pages: write` for its explicit `POST /repos/{owner}/{repo}/pages/builds`. The latter is deliberate: commits made using `GITHUB_TOKEN` do not automatically trigger the normal branch-based Pages rebuild. The explicit build request is the appropriate branch-source Pages mechanism and does not require storing a personal token. This assumes the documented main/root source remains enabled; it does not configure or enable Pages.

Official API documentation: <https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build>. Live documentation was not retrievable from this environment; the implementation was reviewed against the endpoint's documented contract, not a freshly fetched copy. If the repository has instead changed to `build_type: workflow`, a proper upload/deploy-pages workflow would be required rather than this legacy branch-source build request.

The build request runs even when the refreshed data produces no diff. That may perform an unnecessary rebuild, but it also retries a previously failed Pages publication. A successful data commit or build-request acceptance alone does not establish that the public site is serving the new files.

## Independent access checks

These ordinary, read-only requests were repeated during this review:

| Request | Observed result | What it establishes |
|---|---|---|
| `curl --head --location https://dinkyjunior.github.io/project-dollers/` | Environment CONNECT tunnel returns HTTP 403; curl exits 56 | No website HTTP response was reached. This is not evidence that the site itself returns 403 or is down. |
| `gh api repos/dinkyjunior/project-dollers/pages` | Forbidden | Live Pages source/build settings cannot currently be read from this workspace. |
| `curl --head --location https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28` | Environment CONNECT tunnel returns HTTP 403 | Live official documentation is inaccessible through the same normal route. |
| Existing actual-URL Chromium run, `qa/hosted/results.json` | `net::ERR_TUNNEL_CONNECTION_FAILED` before Home loaded | Hosted browser QA did not run; local QA cannot substitute for this result. |

No alternate credential extraction, access-control bypass, external upload, or unofficial mirror was used. Available execution tools provide local browsers and shell networking; they do not provide a separate authorized remote browser route.

## Release verification requirements

After complete visual, functional, data, and performance QA, preserve concurrent remote changes by fetching/rebasing `codex-rebuild` before updating Draft PR #1. Refresh and inspect `main` before the authorized production merge/push. Verify remote branch object IDs after publishing; that establishes Git publication only.

Once the normal hosted route is accessible, run `npm run qa:hosted` against the exact URL and save its screenshots/report. Confirm the served current JSON matches the published snapshot, the three screens and every implemented interaction work, local assets/fonts decode, perimeter motion/reduced motion work, both mobile sizes render correctly, direct hash refresh works, and console/HTTP/transport failures are absent. Check actual published runtime file hashes or an unambiguous revision marker as well when diagnosing Pages caching.

If the exact URL remains inaccessible after publication, report the production Git update separately from hosted deployment verification. Do not claim the public deployment is verified, do not fabricate hosted screenshots, and retain the actual failure evidence. The remaining access check is a real limitation, not a reason to abandon the authorized implementation and local QA.
