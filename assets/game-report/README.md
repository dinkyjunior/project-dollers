# Game Report visual assets

The visual authority is the user's Game Report attachment in this chat. Its original image binary was not accessible as a local uploaded file. The example Dallas–Houston 34–30 score and other sample values are design content, not a verified fixture.

- `hou.svg` is the unchanged official Houston Texans identity vector retrieved from NFL's public logo CDN. Dallas uses the existing unchanged `assets/team-details/dal.svg`.
- `helmet-dal-decorative.webp` and `helmet-hou-decorative.webp` are generated **empty, unbranded decorative equipment**, rendered in silver/navy and dark navy/red. They contain no people or generated faces. They are not official product photographs or verified helmet models. Original official team vectors must be separate overlays.
- Helmet images retain their native 1254 × 1254 dimensions and alpha channel. They were compressed once with WebP quality 93 and alpha quality 100; they were not enlarged, cropped, recoloured or stretched. Full-resolution PNG masters remain in `/workspace/generated_images/` at the paths recorded in `asset-provenance.json`.
- Existing chrome frames, controls, diamonds and fonts remain native vectors and local font files. Existing stadium art is decorative scenery, not proof of the actual venue.

Use `object-fit: contain` for equipment, show complete silhouettes, and use the equipment only for its matching Dallas or Houston identity. Other team reports use their actual local identity marks. Keep every report label, score, player and statistic bound to the selected real fixture.

`asset-provenance.json` records exact bytes, SHA-256 hashes, native geometry, source classifications, successful official SVG retrieval and ordinary public source checks. Manufacturer, retailer and some team domains returned proxy 403; no access controls were bypassed.
