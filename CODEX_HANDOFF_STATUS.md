# Project Dollar$ Codex Handoff Status

This repository has been prepared for a Codex Cloud workflow analogous to the June Tracker setup, except deployment is via GitHub Pages instead of Cloudflare.

## Current Codex lane
- Repo: `dinkyjunior/project-dollers`
- Working branch: `codex-rebuild`
- Draft PR: #1
- Live branch: `main`

## Important
The current Codex environment setup reported that navigation and mobile checks passed, but external image validation was blocked by 403 responses from hotlinked image hosts.

This is not a GitHub Pages problem and not a Cloudflare-vs-GitHub difference. It is a Codex Cloud network / hotlink dependency issue.

The rebuild should therefore be self-contained:
- keep the approved reference inside the repo
- bundle core visual assets locally whenever practical
- do not make visual QA depend on external hotlinked player/team images

## Approved reference
Codex must use the repo-local approved reference once present at:
`reference/approved_eight_screen_reference.jpg`

## Next task
Continue from `CODEX_START.md`, rebuild Pages 1–3 only, and keep all work on `codex-rebuild` until the user approves the result.
