# Project Dollar$ Codex Handoff Status

## Current lane

- Repository: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Review: Draft PR #1
- Production: GitHub Pages, `main`, root folder
- Scope: Pages 1–3 only. No Page 4. Do not merge to `main` without user approval.

## Rebuild completed for draft review

The static HTML/CSS/JavaScript implementation now uses repository-local league/team logos, four real player headshots, an included display font, a stadium photograph and vector interface art. There are no runtime external image, font or data dependencies. Download sources, attribution and hashes are documented in `ASSET_SOURCES.md`.

The interface uses a clearly labeled, verified historical 2025 snapshot. Dashboard week/conference controls, NFL/team tabs, roster filters, navigation and About work within the existing three pages. Roster cards share exact geometry and have a football animation around the complete perimeter. Unused old illustrated portrait SVGs were removed.

`npm test` passed at 393×852 and 430×896 with external requests blocked. Six browser captures, alignment/overflow results, navigation results and animation checks are in `qa/`. See `qa/README.md` for detailed evidence and limitations.

## Required next visual step

The handoff originally described `reference/approved_eight_screen_reference.jpg`, but the file was absent from the remote Draft PR #1 branch when this task fetched it. The fallback in `REFERENCE_SPEC.md` guided the rebuild. The original reference still must be supplied/restored for exact side-by-side review; current captures do not establish final visual approval.

Continue on `codex-rebuild`. Read `CODEX_START.md`, inspect the six captures, locate the approved original render and iterate sequentially Page 1 → Page 2 → Page 3. Safari/hardware QA, original-render visual acceptance and production deployment are not claimed.
