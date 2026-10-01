# CODEX_TASK.md — Immediate task

## Goal
Take the existing repository `dinkyjunior/project-dollers` and rebuild/refine ONLY Pages 1–3 until they visually track the approved eight-screen reference much more closely.

The current implementation is a functioning deployment, but the user considers the visual fidelity unacceptable.

## User's concrete complaints about the current build
1. Home page is not close enough to the approved render.
2. Real/official-looking logos were missing or replaced by weak approximations.
3. The overall environment drifted into a generic “space” look.
4. The Steelers row/button on the NFL page did not align with the other rows.
5. The interface looked blurry in places.
6. Earlier player portraits looked AI-generated/cross-eyed and unacceptable.
7. The user explicitly wants real player imagery.
8. The user wants exact-like-for-like visual treatment, not an “inspired by” redesign.

## Page 1 — Home / sports
Match the first approved panel:
- premium Project Dollar$ masthead
- NFL, NBA, NRL, UFC 2x2 card grid
- true/recognizable league logos
- NFL card active with bright electric blue glow
- NBA/NRL/UFC subdued but still premium
- black cinematic backdrop
- stadium / football visual near the bottom
- bottom navigation matching the render
- NO cheap emoji football / basketball
- NO generic starfield taking over the composition

## Page 2 — NFL dashboard
Match the second approved panel:
- NFL logo + league heading
- Week 4 control
- Ladder / Top Players / Weekly Recap tabs
- AFC / NFC toggle
- compact standings table
- Steelers row highlighted in cyan
- Top 5 QBs + Top 5 RBs panels
- week selector
- Friday/tomorrow game card
- real team logos
- consistent row alignment
- high information density

## Page 3 — Pittsburgh Steelers roster
Match the third approved panel:
- Steelers header with real team logo
- black/gold treatment
- tabs: Roster / Schedule / Team Stats / Matchups
- position filters
- player list cards with real player imagery
- gold/orange neon card treatment
- football motion around the entire outer border of player cards
- consistent card dimensions
- clean aligned stats inside each card

## Real player imagery
Do not generate portraits.
Use actual public/official sports headshots where practical.
If an external CDN is used, make sure the site remains robust; consider caching/bundling where licensing and workflow allow.
Never substitute an AI face simply because it is easier.

## Technical preference
The current site is simple static GitHub Pages. Keep it simple unless a framework clearly improves reliability.
A clean static HTML/CSS/JS implementation is acceptable.
A small Vite/React app is acceptable only if deployment remains simple and subpath-safe.

Do not introduce complexity merely for appearance.

## Required iteration loop
1. Inspect current repo.
2. Inspect the approved reference available to you from the user's local project folder/context.
3. Rebuild Page 1.
4. Screenshot Page 1 at 393x852 and 430x896.
5. Compare with approved reference and adjust.
6. Repeat for Page 2.
7. Repeat for Page 3.
8. Test integration.
9. Test `/project-dollers/` hosting path.
10. Only then commit/push.

## DO NOT
- add Page 4
- invent new product features
- add predictions/ticket building
- use low-res screenshot crops as the interface
- use placeholder logos
- use AI-generated faces
- claim visual acceptance based on automated tests alone
