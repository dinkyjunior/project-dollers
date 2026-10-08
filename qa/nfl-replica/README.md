# NFL reference refinement

This pass responds to the user's rejection of the previous NFL visual result.
The approved tall NFL chat attachment is the reference. Home and Steelers remain
locked; Page 4 is excluded. Real records, rankings and statistics are retained,
so they intentionally differ from the reference's illustrative numbers.

`index.html` compares untouched original BEFORE and AFTER browser screenshots at
393×852 and 430×896, in genuine Chromium and WebKit at device scale factor 2.
Native top and bottom-scrolled screenshots are the authority for the actual
phone enclosure. Full-content PNGs temporarily unroll the internal scroller;
their geometry qualification is recorded in each report. The approved chat
binary was unavailable locally, so no reconstructed reference or registered
pixel-difference claim is made.

Every specialist reviews the same frozen runtime and original AFTER PNGs.
`release-review.json` binds those independent receipts to exact source and image
hashes. Earlier failed or provisional native diagnostics remain separate and
must not be presented as final acceptance.

The complete functional, responsive, native-motion and protected-page suite is
reproducible from the repository root:

```sh
node qa/nfl-dashboard/run.cjs --engine chromium --output /tmp/nfl-new-chromium
node qa/nfl-dashboard/run.cjs --engine webkit --mobile-only --output /tmp/nfl-new-webkit
```

Actual source refresh and structural-rail text-paint checks use the exact frozen
manifest and its SHA-256, rather than a hardcoded runtime file count:

```sh
node qa/nfl-replica/manual-refresh.cjs --engine webkit \
  --manifest qa/nfl-replica/after-runtime-manifest.json --freeze MANIFEST_SHA256 \
  --output /tmp/nfl-new-refresh --rail-glyph \
  --base https://dinkyjunior.github.io/project-dollers/
```

Do not reuse an existing output directory. Hosted WebKit retains certificate and
hostname verification using the environment-provided CA; no TLS bypass is used.
PNG glyph diagnostics temporarily hold clocks and remove frame artwork while
preserving layout, then restore styles and times. Ordinary release screenshots
use natural native animation timing. Emulation does not establish physical
iPhone frame rate or coverage of Safari browser controls.

New fonts are native local Google Fonts subsets with adjacent OFL licenses.
Frames, controls, medallion and crystals are independent SVG layers, not a
flattened screenshot. Helmet equipment is explicitly decorative artwork with
independent genuine team marks; it is not an official photograph, verified
equipment model or player likeness. Asset provenance is recorded separately in
`assets/nfl-dashboard/asset-provenance.json`.
