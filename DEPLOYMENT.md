# Production publication and verification

Repository: `dinkyjunior/project-dollers`
Target: https://dinkyjunior.github.io/project-dollers/
Documented GitHub Pages source: `main` / root.

The latest user request authorizes publishing the completed Pages 1–3 pass after QA. Page 4 remains excluded. Development stays on `codex-rebuild` until reviewed code and evidence are committed; fetch/rebase that branch before pushing and preserve all remote changes. Fetch `main` before publishing and integrate rather than overwrite any divergent production changes.

The site is static. `index.html`, `.nojekyll`, `404.html` and relative `assets/` paths support `/project-dollers/`; routes use hash navigation. No compilation command constitutes deployment.

## Scheduled data

`.github/workflows/refresh-nfl-data.yml` retrieves and validates the feed every six hours or manually on `main`. Its token has contents/pages write permissions. Because token-authored commits do not trigger the automatic branch Pages build, the workflow explicitly requests `POST /repos/{owner}/{repo}/pages/builds`. Required-source or validation failures keep the prior snapshot; the UI marks stale data after twelve hours. New unbundled player images display unavailable rather than a guessed hotlink until the local asset mapping is maintained.

The existing branch-source configuration is documented in the repository. Live Pages configuration, build status and the first refresh execution cannot currently be read because the GitHub API is denied by the environment. If the repository has moved to workflow-source Pages, upload/deploy-pages configuration would be needed; do not assert that without evidence.

## Actual hosted QA

Run `npm run qa:hosted` after publication. It opens the exact public URL in Chromium at both primary sizes, checks the committed data and functional interactions, and saves evidence. It must receive the site and pass; local QA and Git branch publication are separate claims.

Current normal HTTPS probes fail at the environment CONNECT tunnel with 403 / `ERR_TUNNEL_CONNECTION_FAILED`, before reaching the hosted website. See `qa/hosted/failure.json` and `qa/DEPLOYMENT_REVIEW.md`. This blocks confirmation of actual public deployment and browser behavior; it is not evidence that the origin website failed. No proxy or access control was bypassed.

The tested application commit `c8bf0d298d5915460a11b6bc1776d3a9a93a0208` was published to `codex-rebuild` and production `main` on 2026-10-01 after fetching/rebasing. PR #1's remote head was also confirmed at that commit. The actual hosted test was repeated after publication at 16:14:54 UTC and remained blocked at the CONNECT tunnel. [Publication evidence](qa/PUBLICATION_STATUS.md) records the distinction between confirmed Git publication and unverified public deployment.

The public GitHub page independently confirms PR #1 is merged and [Pages run #37](https://github.com/dinkyjunior/project-dollers/actions/runs/36890470769) succeeded for that exact application commit. The production deployment workflow is therefore confirmed successful; actual hosted-browser verification remains blocked. The PR description could not be edited through the denied API; the reviewed description and QA evidence are committed to its branch.
