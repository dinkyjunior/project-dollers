# Bundled visual assets and provenance

League and team marks, player photography, fonts, interface icons and background artwork are served from relative repository paths. The application does not depend on hotlinked images or remotely loaded fonts. Every optimized asset has a source URL or local source identifier, SHA-256 checksum, source checksum, transformation description and processing/retrieval context in [assets/sources.json](assets/sources.json).

## League and team logos

NFL, NBA and NRL league logos and all 32 NFL team marks are bundled as lossless WebP files in `assets/logos/`. These originate from ESPN's public image CDN. Most original files are 500×500 pixels. The Jets endpoint supplied a larger native image; it was downsampled to a 500-pixel box using Lanczos. No logo was upscaled. Transparent margins and original proportions are retained.

These 500-pixel assets support sharp mobile presentation at up to three device pixels per CSS pixel. They are substantially larger than the marks displayed in dashboard tables, headers and fixture cards. Logo mapping, native dimensions and source URLs are in [assets/player-assets.json](assets/player-assets.json). ESPN abbreviations `lar`/`wsh` also have `LA`/`WAS` aliases for nflverse team codes.

The UFC wordmark remains a bundled SVG from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:UFC_Logo.svg?uselang=en), credited there to UFC. Commons identifies it as a public-domain text logo; trademark rights still apply. The ESPN marks remain the property of the respective leagues and teams. Public access to an image does not establish permission for commercial reuse.

## Authentic player photography

The 2026 Week 4 Steelers roster contains 77 players when active, developmental and reserve records are included and released (`CUT`) records are excluded. Authentic photographic headshots were available for 76 of those players through ESPN's public image CDN. Each is stored as `assets/players/{espnId}.webp`, retaining the native 600×436 dimensions with quality-90 WebP compression. No upscaling, generated faces, recoloring, synthetic uniform changes or face substitutions were used.

Player IDs are matched to nflverse roster records by GSIS ID. Nineteen missing ESPN IDs were recovered through the public [nflverse player identity dataset](https://github.com/nflverse/nflverse-data/releases/download/players/players.csv), with matching birth dates checked before downloading. Exact identity source hashes and IDs are recorded internally. Photo mapping is keyed by GSIS ID, so the UI does not need to guess a URL for a missing ID.

Michael Pittman (`4035687`) has a verified 2026 Pittsburgh roster record and an authentic black-uniform photograph. Aaron Rodgers (`8439`), Jaylen Warren (`4569987`), DK Metcalf (`4047650`) and Pat Freiermuth (`4361411`) also have native photographs. The current dataset places Jaylen Warren at jersey number 30 and Pittman at number 11; old reference artwork does not override verified current roster information.

Gabe Rubio has no verified ESPN identity ID in the available datasets. The official NFL public image host returned 403, so his photo is explicitly unavailable. The UI must display its neutral non-photographic fallback rather than request a guessed URL or substitute another face. A few authentic CDN photos retain a previous uniform colour, including Isaiah Hodgins, Darius Rush and Travis Homer; those photographs have not been digitally recolored.

Photography remains the property of the respective rights holders. These source records document provenance, not a commercial reuse license. The blocked NFL image host and ESPN roster API were not bypassed.

## Background, fonts and interface artwork

- `assets/football-stadium.webp` is a quality-90 WebP derivative of the existing original `football-stadium.png`, retaining its native 1983×793 dimensions. It depicts a football and stadium and contains no people. It is generated background artwork, not a photograph of an identified venue, game or player. The original PNG remains bundled for traceability.
- Anton, Barlow Black Italic and Barlow Condensed Semibold are bundled as Latin-1 and UI-punctuation WOFF2 subsets. Their original TTF files and SIL Open Font License files remain in `assets/fonts/`. Subsetting reduces transfer size while keeping the existing typography and licensed font names.
- `assets/home-brand.svg` uses native outlines from the bundled Barlow Black Italic font, with repository-authored metallic vector fills and a restrained edge. The 12.5 KB scalable wordmark replaces the soft live-text glow on Home. It contains no raster screenshot crop, upscaled pixels or generated lettering; its font license and source hash are retained in `assets/sources.json`.
- `assets/icons.svg`, `assets/energy.svg` and `assets/roster-energy.svg` are original scalable interface artwork. They are rendered as vectors rather than low-resolution raster decorations. `assets/football.svg` is retained as an earlier unused fallback.
- Legacy `assets/stadium.jpg` is **Heinz Field**, Joey Gannon, March 30, 2006: [Commons description](https://commons.wikimedia.org/wiki/File:Heinz_Field.jpg?uselang=en), [original Flickr](https://www.flickr.com/photos/67961268@N00/120510253/), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). It is retained from the historical draft and is not the current Home backdrop. Its original bytes, attribution and license are preserved.

The previous PNG logos, five named-player PNGs and TTF fonts are retained as historical source/fallback files. The current interface should prefer the optimized WebP/WOFF2 mappings. Lazy loading and appropriately sized image rendering keep the full-roster asset collection out of the initial transfer.

## Sports-data provenance

The current production data and its source/cross-check context are recorded separately in [assets/data/current.json](assets/data/current.json) and [assets/data/provenance.json](assets/data/provenance.json). The original `snapshot.js` and `roster-source.json` are historical 2025 draft artifacts, not current-season authority. Current roster membership, jerseys, fixtures and statistics follow verified source records rather than mock values in the supplied visual renders.
