# Project Dollar$ Codex Handoff Status

## Current lane

- Repository: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Review: Draft PR #1
- Production: GitHub Pages, `main`, root folder
- Scope: Pages 1–3 only. No Page 4. Do not merge to `main` without user approval.

## Approved-source refinements

The user supplied the eight-screen approved image in chat and confirmed it is the source of truth. Its first three top-row panels were compared with actual browser output at 393×852 and 430×896. Sequential refinements and a second visual pass materially reduced the gaps in masthead proportions, Home grid placement, foreground stadium lighting, NFL density, navigation/frame treatment and the five-card Steelers stack.

All league/team marks, five genuine player headshots, typefaces and stadium/edge art are local. The Home background is original generated stadium artwork with no people; all portraits are authentic downloaded photographs. The verified historical 2025 snapshot remains clearly labeled. Unsupported source statistics, rankings and roster membership were not copied. See `ASSET_SOURCES.md`.

Offline `npm test` passed at both required sizes with no external requests, missing images, HTTP errors or console/JavaScript errors. It exercises navigation/history/direct loads, tabs, filters, alignment/overflow and all four edges of the perimeter animation. Six final captures, preserved previous-draft captures, six side-by-side before/after comparison sheets, a contact sheet and visual observations are under `qa/`.

## Reference provenance and next review

The chat attachment was visible but not available as file bytes or a download ID. No copy could be written to `reference/approved_eight_screen_reference.jpg`. The user explicitly instructed continuing and producing available comparison evidence rather than blocking. `reference/CHAT_SOURCE.md` and `qa/REFERENCE_COMPARISON.md` identify the attachment as authority; this is no longer an unresolved source-of-truth question.

The side-by-side files contain preserved and refined browser output; they do not fabricate unavailable original pixels. Visual comparison established material improvement, not pixel identity or user visual approval. Fine flare/metallic details and portrait crops remain different. Safari/hardware QA remains unrun.

Before pushing further work, fetch and rebase the latest `codex-rebuild` so remote changes are preserved. Keep PR #1 in draft; `main` and Page 4 remain untouched.
