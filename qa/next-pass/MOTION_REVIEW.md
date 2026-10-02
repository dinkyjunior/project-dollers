# Shared illumination and full-card motion review

Captured 2026-10-02T00:47:10Z (2 October, 10:47 AEST). Actual Chromium output at 393×852 and 430×896, device pixel ratio 2, under `/project-dollers/`. The stylesheet is included in the application; no injected visual replacement or edited screenshots.

The shared frame, navigation rail, standings, leader panels, selected controls, game fixtures, research surfaces and player cards now have brighter, sharper illuminated borders. NFL uses electric blue; Steelers uses gold with restrained orange bloom. A crisp edge remains distinguishable from its soft outer light. Text/photos do not receive a blur or a glow overlay. Home-specific art, wordmark and league tile motion are owned by the Home refinement.

The football and its two travelling light paths use the same measured complete rounded rectangle, duration and phase. Compact cards retain a nine-second lap; long research cards get a longer lap at approximately 110 CSS pixels per second. This avoids speeding the ball excessively when hundreds of additional statistics increase the card height. ResizeObserver updates only when geometry changes; there is no frame-by-frame layout read. IntersectionObserver pauses offscreen cards.

Actual sampled checks passed at both mobile sizes:

- All four outer edges, with 48 position samples per card/scenario.
- Compact cards: 108px / 113px high.
- Recent last-five summaries: 1,476px / 1,481px high, with verified history loaded.
- All five recent game details, all additional-source-statistics disclosures and complete season overview opened: 19,696px / 19,328px high.
- Weekly Browns opponent history, then all five personal opponent-game details, every additional-source disclosure and season overview opened: up to 19,491px / 19,172px high.
- Maximum football-to-border-path distance below 0.23px; matching ball/trail duration and phase in all ten scenarios.
- Portrait, name, all header statistics and the complete research surface enclosed, including all expanded game statistics.
- Four offscreen player cards paused while the first player's research expands.
- Background visibility pause, plus `pagehide`/`pageshow` fallback when measured CSS path support is intentionally unavailable.
- Reduced motion: zero running indefinite decorative animations, football/light hidden.
- No horizontal document overflow, JavaScript exceptions or failed HTTP responses.

The extremely tall cases deliberately open every source-statistic group in every game simultaneously to stress the whole-card perimeter. The default research uses collapsed complete-statistics sections; it does not require viewing 19,000 pixels to compare the six core quick statistics per game. Long outer-track laps are intentionally slower, while the default roster's five compact cards remain continuously active at nine seconds.

Visual inspection at both requested sizes confirms materially stronger border hierarchy, clean text and faces, and a clear blue/gold environment change. Browser/container checks are not a native Safari or physical iPhone performance claim.

The runtime files were hashed before and after the review and remained unchanged during it.

Machine evidence and runtime hashes: [motion/results.json](motion/results.json). Browser screenshots are alongside it.

Final runtime SHA-256 trace:

```text
index.html  0c429ab8af6c8b69a36c56c16cfef4fd1ff13644281e2a93a72a6d5ed4a41a29
assets/illumination.css  d6d3abb3882e658ec1b4a339291501b5cfadd0103da5243b1afc7706efe14a67
assets/motion.css  f3a4f8fff525d42f56376c9a0145f7172ac3d7574f5e26de079a96ae45c0aa8b
assets/motion.js  a4aedbe461010e2edb4970e4dc9db22d6d7ddf527ac49aacd8bc95002a5fea86
assets/player-research.css  66e31e01ed3f8aeb9ff4b03b1ca0460cbc2a858c9f37ad02733a74afb62a1ddb
assets/player-research.js  8b2600e1f20c54302f5dda9f8c51400d8782017848a7920186351b15b77bb488
assets/app.js  962184ba433b371653def96ab77adb9674a4f6e7065e480f67e5687560f1706b
assets/data/current.json  ab82352eebfa82c5c304b161caf04f237b818c85ccbf1218deca2c9e401a09a2
assets/data/player-history.json  2cffbc6efc5d4c7b418bb35b8369a4f97c51de9072a80493c0fb6687b6a2f27b
```
