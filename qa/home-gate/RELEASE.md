# Approved Page 1 Aperture release

Recorded 7 October 2026 (Australia/Sydney). **Current status: implemented locally; final QA and production publication pending.** No claim that the new Home is live is made by this document.

The user approved implementing and launching the reattached four-sport Project Dollar — Final Home Concept. Production target:

https://dinkyjunior.github.io/project-dollers/

## Implementation and preserved scope

Page 1 is a real HTML/CSS/JavaScript interface with independently rendered branding, sport venues, metallic ring, controls and navigation. The approved singular Project Dollar identity uses aligned diamond PROJECT and gold DOLLAR material lettering with an emerald velvet money bag and gold dollar sign. A wide metallic Aperture gate anchors the mobile layout; reflected stage lighting and architecture carry the sport theme across the panel.

| Home state | Lighting and venue | Entry/navigation behaviour |
| --- | --- | --- |
| NFL | Electric blue, football field/stadium | ENTER NFL opens the existing NFL dashboard; Teams label |
| NBA | Fixed left-blue/right-red split, basketball court | Coming soon; selector works; Teams label |
| NRL | Neon green, rugby field/stadium | Coming soon; selector works; Teams label |
| UFC | Neon red, empty cage/arena | Coming soon; selector works; Fighters label |

"Preview only" is removed. The reference's NFA typo is corrected to NFL. League marks preserve their identities and aspect ratios. Coming-soon entry buttons are disabled; selectors remain interactive with persistent selection, keyboard support and accessible state. Non-NFL Home navigation provides availability feedback rather than opening NFL under another sport name.

The white ring highlight continuously travels around the complete gate while its NBA blue/red base remains stationary. Venue drift, architecture rails, floor reflections and diamond/gold glints animate with transform/opacity effects. Reduced-motion users receive static illumination; motion pauses on hidden documents, inactive Home and offscreen decorative stage. There is no idle JavaScript frame loop.

NFL/Steelers markup is byte-identical to the integrated production baseline and `assets/app.js` is unchanged. Existing data/update/player-research modules and full-card football motion remain intact. The shared About title only changes to the approved singular name. No Page 4 work is included.

## Source and artwork provenance

The visual authority is the user-approved four-phone image reattached in this chat. Its binary bytes were unavailable for saving as `reference/approved_home_gate_reference.png`. Source comparison therefore uses the visible chat attachment; **no exported original panels or pixel-registered source composite are claimed**. The original eight-screen reference remains relevant to Pages 2–3, not the superseded Home design.

The branding and four empty decorative venues were generated as separate implementation layers from the approved concept, then downsampled from native pixels. They are not represented as photographs of official venues/events or extracted reference pixels. No AI player faces were generated. Official/provider-backed league marks and all existing authentic player imagery remain distinct from decorative artwork.

`assets/home/asset-provenance.json` records original identifiers, local source paths, retrieval/review context, native/optimized dimensions, transformations and SHA-256 hashes. The original generated PNGs are retained in the workspace; optimized runtime files are bundled in the repository. Local assets avoid fragile runtime image hotlinks.

## File inventory

| Files | Purpose |
| --- | --- |
| `index.html` | Home layers, accessible selectors/entry, Home navigation hooks and singular page identity |
| `assets/home-premium.css` | Responsive metallic architecture/ring/layout, four fixed theme bases and polished controls |
| `assets/home-interactions.js` | Sport selection, state persistence, keyboard controls and native NFL routing/Coming-soon feedback |
| `assets/home-gate-motion.css`, `assets/home-gate-motion.js` | Continuous ring/background/material motion and lifecycle/reduced-motion controls |
| `assets/home/gate-brand.webp` | Transparent material wordmark, 1800×693, downsampled from 2022×778 native source |
| `assets/home/gate-scenes-{nfl,nba,nrl,ufc}.webp` | Four 1200×1200 decorative environments, downsampled from 1254×1254 native sources |
| `assets/home/nfl.svg`, `assets/home/nba.svg` | Locally bundled official NFL vector and current NBA logoman vector |
| `assets/logos/nrl.webp`, `assets/logos/ufc.svg` | Retained native NRL mark and scalable UFC wordmark |
| `assets/home/README.md`, `assets/home/asset-provenance.json` | Asset quality/source/processing documentation |
| `qa/home-gate.cjs`, `qa/home-gate/README.md` | Responsive/interaction/motion/regression and actual hosted runtime-manifest QA |

The five optimized decorative files total 2,050,522 bytes (about 1.96 MiB). This is asset size, not a measured initial network transfer. The native NRL bitmap remains 500×500; it was not enlarged into a claimed high-resolution replacement. No full-screen screenshot is used as the interface.

## QA status

Two visual refinement cycles and a 320px decorative-overflow correction preceded final testing. Earlier failed/in-progress reports are archived as iteration evidence and are not acceptance results.

| Check | Current result | Evidence |
| --- | --- | --- |
| Data/history and roster regression groups | 22 passed | Existing `npm run test:data` suite; final release task output |
| Source-monitor regression groups | Seven passed | Existing `npm run test:sources` suite; final release task output |
| Updater regression groups | Eight passed | Existing `npm run test:updates` suite; final release task output |
| Update integration preserving focus/deep scroll | Passed | `../next-pass/auto-update-integration.json` |
| Final Chromium: all four states at 393×852, 430×896, 320×700, 768×1024, 1440×1000 | Passed against versioned release HTML; all 183 manifest files match current bytes | `local-chromium/results.json`, completed 10:33:19 AEDT, 7 October; preceding pass retained in `pre-cache-chromium/results.json` |
| Final genuine WebKit: all four states at 393×852 and 430×896 | Passed against versioned release HTML; all 183 manifest files match current bytes | `local-webkit/results.json`, completed 10:35:57 AEDT, 7 October |
| Existing-app regression suite | Passed at all five sizes before release URL versioning; app code remains unchanged, index hash is explicitly pre-cache | `../results.json`, completed 10:31:21 AEDT, 7 October |
| Actual hosted WebKit, both mobile sizes/all states | Pending publication | `hosted-webkit/results.json` when completed |
| Independent served-file hashes, production branch source and workflow review | Pending publication | To be recorded after hosted verification |

New browser reports must record stable exact runtime/data/artwork hashes, zero unplanned console/network/HTTP failures, sharp local imagery, no horizontal overflow, navigation/direct refresh and true live-frame animation changes. Isolated motion/failure harnesses are identified explicitly in `README.md`. Physical iPhone hardware, Safari address/tab controls and a device FPS benchmark remain unrun; browser emulation does not establish those results.

## Publication record — pending

- Working branch: `codex-rebuild`.
- Production source: GitHub Pages `main` / repository root, HTTPS enforced.
- Recovered preceding evidence checkpoint: `808bf015b997715cca4cb103fe1271ceaf732e21`.
- Integrated automatic-data production baseline: `4f38a25cc9409314744667f92d8fc2d13f35ca40`.
- Final application commit: pending.
- Final production/main commit: pending.
- Exact successful Pages build/deploy run: pending.
- Actual hosted verification completion: pending.

Root fetches/rebases before pushing and preserves any newer production data commits. PR #1 is already merged; it must not be represented as an open Draft PR. A build command or successful Git push alone does not establish hosted behaviour. Replace these pending fields only after the exact release and public-site evidence are available.
