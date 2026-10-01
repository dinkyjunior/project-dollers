# Codex Cloud Environment — Project Dollar$

This project should behave like a self-contained repo-backed Codex Cloud task.

## Repository
- Repo: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Production/live branch: `main`
- Draft PR: #1

## Scope
Only Pages 1–3 are in scope:
1. Home / sport selection
2. NFL dashboard
3. Pittsburgh Steelers roster

Do not add Page 4.

## Deployment difference from June Tracker
June Tracker used Cloudflare Workers. Project Dollar$ uses GitHub Pages.

For Project Dollar$:
- Production is GitHub Pages from `main` `/ (root)`.
- The site must work under `/project-dollers/`.
- Keep `main` untouched until the rebuild passes visual and functional QA.
- Work on `codex-rebuild` and continue Draft PR #1.

## Local / Cloud testing
The repo is a static site. Use a local HTTP server and Chromium/Playwright for QA.

Required viewports:
- 393x852
- 430x896

Required navigation checks:
- Home -> NFL
- NFL -> Steelers
- Steelers -> NFL
- NFL -> Home

## Asset policy
Core visual QA must not depend on external hotlinked images that may return 403 inside Codex Cloud.

Use repo-local assets for anything needed to render and compare the core experience.

The approved visual reference is expected at:
`reference/approved_eight_screen_reference.jpg`

The user subsequently supplied the approved eight-screen render in chat, and that attachment guided the latest comparison/refinements. Its bytes were not exposed for a repository copy; the user expressly authorized proceeding. Read `reference/CHAT_SOURCE.md` for provenance and `qa/REFERENCE_COMPARISON.md` for evidence. Use the attachment as authority when it is visible, with `REFERENCE_SPEC.md` as fallback in sessions where it is unavailable. User visual approval remains pending.

Where real league/team/player imagery is required, prefer downloading/bundling stable local copies into the repo during the rebuild rather than relying on runtime hotlinks.

## Start instruction
Read in this order:
1. `CODEX_START.md`
2. `AGENTS.md`
3. `README_FOR_CODEX.md`
4. `CODEX_TASK.md`
5. `QA_ACCEPTANCE.md`
6. `REFERENCE_SPEC.md`
7. `reference/approved_eight_screen_reference.jpg`

Then continue the rebuild on `codex-rebuild` and do not merge to `main` until approved.

## Latest task authorization and data

The premium refinement request authorizes production publication after QA. That instruction supersedes the earlier hold on `main` for the preceding draft pass. Page 4 remains excluded. Runtime data is now the verified refreshable 2026 JSON feed; the environment/tooling remains static Python HTTP plus pinned Playwright. Actual hosted and Safari verification are tracked separately in `qa/` and remain blocked where official requests receive proxy403.
