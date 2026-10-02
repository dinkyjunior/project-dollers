# October 2 follow-up: Home, glow and full player research

The user's new request is to sharpen and animate Home, strengthen every illuminated border, make existing research controls work correctly, and expand player information to the last five recorded games and the last five against the selected weekly opponent. Pages 1–3 remain the scope.

## What changed

- Home uses native outlined vector lettering, stronger blue rails, travelling reflections, cinematic stadium lighting, subtle pointer depth, touch responses and keyboard-accessible coming-soon feedback.
- Blue system borders and gold Steelers borders have brighter cores and controlled bloom. The football and its light trail still follow the complete outer card, including expanded research; offscreen/background/reduced-motion handling remains intact.
- The lazy verified history covers 22 regular seasons, all 77 roster players and every scheduled opponent. Each game carries complete passing/rushing/receiving/TD, defensive, kicking and additional source fields, original club, season/week, result and source times. Up to five recorded games are shown; shorter histories and unavailable values remain explicit.
- Selected-week fixture entry now opens that week's opponent research. Season and game statistics prioritise the player's position while preserving all fields.
- Automatic checks run on open, return, focus, reconnection and refresh, with conditional checks while active. Source monitoring publishes newly released data more promptly. All selections, expanded statistics, focus and deep scroll survive updates and failures.

## Evidence and independent review

The approved eight-screen chat render remains the visual authority. Its bytes were not exposed as a file, so browser before/after images are labelled honestly; no approved-source pixels or hosted screenshots are fabricated. `before/` preserves the preceding production screenshots. [Six final mobile screenshots](contact-sheet.jpg) · [Pages 1–3 before/after](comparison.jpg) · [Home before/after](home-comparison.jpg).

- [Home review](HOME_REVIEW.md) and [independent visual review](VISUAL_REVIEW.md).
- [Data/history audit](DATA_HISTORY_REVIEW.md) and [independent source/runtime review](SOURCE_RUNTIME_REVIEW.md).
- [Motion review](MOTION_REVIEW.md), including full-card expanded-stat geometry and reduced motion.
- [Control audit](CONTROLS_REVIEW.md) and [automatic-update integration review](AUTO_INTEGRATION_REVIEW.md).
- Final primary screenshots and five-viewport functional report remain in [../README.md](../README.md) and [../results.json](../results.json).

Fifteen data/history regressions, seven source-monitor regressions and eight automatic-update behaviour groups pass. Independent raw-input audits found no mismatches among 1,224 retained game rows and 165,240 numeric source cells. The comparison uses the same provider independently; second-provider confirmation is not claimed.

## Update limits

The public source publishes detailed player statistics after games and later corrections. A genuine live in-game/provider push connection is not configured. GitHub scheduled jobs and Pages/browser caching can introduce delays; faster checking does not make unpublished data available. Optional authorised event hooks remain unconnected.

The history file is about 6.84 MB uncompressed and is fetched only when a player is opened. Its gzip estimate is about 193 KB; actual hosted compression has not been verified. Raw historical CSVs are not bundled.

Actual hosted verification and Safari engine/hardware testing must be reported separately. The environment has rejected the public URL at its CONNECT tunnel and official WebKit downloads with 403. A successful local run or deployment workflow is not a hosted-browser pass.
