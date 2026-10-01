# Bundled visual assets and research data

The application loads every logo, portrait, font, icon, football illustration and stadium image from a relative repository path. There are no runtime image hotlinks, remote fonts or API requests. Attribution links in the About dialog are links, not automatically loaded resources.

## Logos and player photography

- NFL, NBA and NRL league logos: ESPN CDN, original 500px assets.
- Chiefs, Bills, Steelers, Ravens, Texans, Browns, Eagles, Lions, 49ers, Packers, Cowboys, Vikings, Patriots and Seahawks logos: ESPN CDN, original 500px assets.
- Aaron Rodgers (ESPN ID 8439), Jaylen Warren (4569987), DK Metcalf (4047650) Roman Wilson (4431492) and Pat Freiermuth (4361411): original ESPN photographic headshots, 600×436px. No generated faces, portrait substitutions, recoloring, or upscaling.
- UFC vector wordmark: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:UFC_Logo.svg?uselang=en), credited there to UFC. Commons identifies it as a public-domain text logo; trademark rights remain applicable.
- ESPN sports marks and headshots remain the property of their respective owners. These bundled copies identify leagues, teams and players in the research prototype; they are not a grant of commercial reuse rights.

Exact download URLs and SHA-256 hashes for the unmodified downloaded assets are in [assets/sources.json](assets/sources.json).

## Stadium, type and interface art

- Legacy `assets/stadium.jpg` (retained from the earlier draft; no longer used by Home): **Heinz Field**, Joey Gannon, March 30, 2006. [Commons description](https://commons.wikimedia.org/wiki/File:Heinz_Field.jpg?uselang=en); [original Flickr](https://www.flickr.com/photos/67961268@N00/120510253/); [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). Original image bytes are preserved. The UI crops it and applies CSS brightness, saturation and contrast changes. This legacy photograph is not rendered in the current Home scene. Its attribution and license are retained here.
- `assets/fonts/Anton-Regular.ttf`: Anton, Google Fonts. SIL Open Font License is bundled in `assets/fonts/OFL.txt`.
- `Barlow-BlackItalic.ttf` and `BarlowCondensed-SemiBold.ttf`: Barlow and Barlow Condensed, Google Fonts. Their SIL Open Font Licenses are bundled as `Barlow-OFL.txt` and `BarlowCondensed-OFL.txt`.
- `assets/football-stadium.png`: original generated stadium/football artwork, 1983×793px, prepared specifically for the Home foreground. It contains no people. The asset is independent of the approved interface render; HTML/CSS implements every actual interface component. The supplied original PNG is bundled unchanged, with SHA-256 in `assets/sources.json`.
- `assets/icons.svg`, `assets/energy.svg` and `assets/roster-energy.svg`: original scalable interface art and edge-light effects. `assets/football.svg` is retained as the earlier draft's unused vector fallback.

## Verified 2025 research snapshot

The season is deliberately labeled **2025** to match the available reference specification. It is historical and does not claim live 2026 roster, standings, schedule or statistical accuracy.

- Selected player names, positions, Steelers affiliation and jersey numbers: [nflverse 2025 roster release](https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2025.csv). The five relevant records and source hash are retained in `assets/data/roster-source.json`.
- Player statistics: [nflverse 2025 weekly player statistics](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv).
- Team records and fixtures: [nflverse/nfldata games](https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv).
- Processed data, source URLs and original-file hashes: `assets/data/snapshot.js`.

Dashboard Week 2–5 selections show team records **through the prior week** and that prior week's QB/RB leaders. Leaders are sorted by passing yards for QBs and rushing yards for RBs, with name as the deterministic tie break. The team table includes the reference's selected teams, not an official conference ranking; its rank column is deliberately unpopulated. Win percentage is `(wins + ties/2) / games`; streak counts consecutive identical results through the selected cutoff.

Roster stats are cumulative 2025 regular-season Weeks 1–3. Completion rate is completions/attempts; YPC is rushing yards/carries; YPR is receiving yards/receptions. Starter/depth-chart labels, AFC North position, and unverified player data are not asserted. Roman Wilson supplies the fifth verified 2025 Steelers card. The approved illustration's Michael Pittman Jr. does not appear in that season's Pittsburgh roster, so his membership and mock statistics were not copied.

The verified Week 4 Steelers fixture is against the Vikings on September 28, 2025, not the previous prototype's unsupported Friday/Browns fixture. No stadium location is asserted because the upstream Week 4 stadium field conflicts with the game's known neutral-site designation. Week 5 correctly displays a bye. The schedule panel is restricted to Weeks 2–5; it does not imply a complete season schedule.
