# Project Dollar$ — Approved Visual Reference Specification

This file is a fallback textual specification for Codex if the original eight-screen image is not directly available in the current Codex session. The approved eight-screen render from the original ChatGPT Project $ conversation remains the visual source of truth.

## Scope gate
Only Pages 1–3 are approved for rebuild right now:
1. Home / sport selection
2. NFL dashboard
3. Pittsburgh Steelers roster

Do not add Page 4.

## Global visual language
- Predominantly black cinematic background; not a generic space/starfield UI.
- Thin electric-blue outer frame and crisp cyan neon accents.
- Strong contrast: white typography, cyan metadata, gold/yellow Steelers accents.
- Dense, premium sports-data presentation rather than generic dark cards.
- Mobile-first portrait design targeting 393×852 and 430×896.
- Real/recognisable league/team logos.
- Real player photography where practical. Do not generate player faces.
- Motion should enhance the design without changing composition: restrained breathing glows, light sweeps, subtle energy, smooth page transitions.

## Page 1 — Home / Choose Your Sport
Approved render composition:
- Large PROJECT DOLLAR$ masthead in the upper section. PROJECT is metallic/white-blue; DOLLAR has a gold/white treatment and the $ is cyan/green.
- Small spaced subtitle: SPORTS DATA & RESEARCH.
- 2×2 grid of sport cards immediately below:
  - NFL top-left and active: official/recognisable NFL shield, strong electric-blue glowing border, NFL title, LIVE DATA / STATS / RESEARCH / MATCHUPS copy.
  - NBA top-right: recognisable NBA logo, subdued purple/blue/red treatment, COMING SOON.
  - NRL bottom-left: recognisable NRL shield/logo, green/cyan treatment, COMING SOON.
  - UFC bottom-right: recognisable UFC wordmark, red treatment, COMING SOON.
- Lower portion contains a premium American-football/stadium visual, energetic blue/orange lights, not a cartoon emoji.
- Bottom navigation has five compact items: Home, Teams/NFL, Matchups, Insights, More. Home active in blue.
- Keep the overall silhouette close to the render: strong masthead, card grid, stadium visual, bottom nav.

## Page 2 — NFL Dashboard
Approved render composition:
- Top header with NFL shield at left, NFL title, 2025 REGULAR SEASON subtitle, Week 4 selector at right.
- Three primary tabs: LADDER (active cyan), TOP PLAYERS, WEEKLY RECAP.
- AFC/NFC segmented control; AFC active gold/yellow.
- Compact standings table with columns # / TEAM / W / L / PCT / STRK.
- Five rows visible: Chiefs, Bills, Steelers, Ravens, Texans in the approved mockup.
- Steelers row highlighted with a cyan border/glow but must align exactly with every other row.
- Below standings: two side-by-side compact panels:
  - TOP 5 QBs (WEEK 3)
  - TOP 5 RBs (WEEK 3)
- Week 2 / Week 3 / Week 4 / Week 5 selector; Week 4 active gold.
- TOMORROW'S GAME / Friday game card at bottom: Steelers vs Browns with recognisable team logos, date/time, stadium/location, records.
- High information density is intentional. Avoid oversized padding or generic dashboard spacing.
- Bottom navigation present and visually consistent with Page 1.

## Page 3 — Pittsburgh Steelers roster
Approved render composition:
- Header with back affordance, Steelers logo, Pittsburgh Steelers name, record and AFC North position.
- Tabs: Roster (active), Schedule, Team Stats, Matchups.
- Position chips: All, QB, RB, WR, TE, DEF, K.
- Cards are stacked vertically and use Steelers black/gold/orange neon treatment.
- Each player card includes:
  - real player portrait on the left
  - jersey number in yellow/gold
  - player name
  - role/position metadata in cyan/white
  - four compact stat cells along the lower/right region
  - right chevron
- Cards must line up exactly: same width, same left/right edges, consistent heights and gaps.
- A small football travels continuously around the ENTIRE outer perimeter of each player card. It must not orbit only the portrait.
- Example approved roster presentation includes Aaron Rodgers and Jaylen Warren plus receiving options; use current factual roster data only when verified.
- Do not use AI-generated faces, distorted portraits, emoji headshots, or blurry placeholders.

## Visual QA rule
Automated tests are not sufficient. For every page, capture browser screenshots at 393×852 and 430×896 and compare them to the approved render.

A page fails if a human can immediately describe the comparison as “premium render versus cheap HTML approximation.” Continue iterating until the visual gap is materially reduced.

## Functional QA
Must work:
- Home → NFL
- NFL → Steelers
- Steelers → NFL
- NFL → Home
- implemented position filters
- all visible implemented controls

Must also pass:
- no horizontal overflow
- no JS/console errors
- no missing assets/404s
- direct load + refresh under `/project-dollers/`
- Safari/iPhone-safe viewport behaviour
