# NFL dashboard QA

This runner checks the actual Pages 1–3 app with genuine Chromium or WebKit at
device scale factor 2. It reuses the browser launcher and complete runtime
manifest from [`../home-gate.cjs`](../home-gate.cjs). Install the repository's
locked Playwright dependencies first. Chromium needs its installed executable
(`CHROMIUM_EXECUTABLE`, default `/usr/bin/chromium`). The existing WebKit launcher
requires the official Playwright WPE browser and verified distro libraries;
see [`../home-gate/README.md`](../home-gate/README.md) and
[`../hosted/webkit/RUNTIME_SETUP.md`](../hosted/webkit/RUNTIME_SETUP.md).
`PLAYWRIGHT_BROWSERS_PATH`, `PD_QA_WEBKIT_RUNTIME`, and `PD_QA_CA_FILE` override
those installed paths. Hosted WebKit retains certificate and hostname checks;
it does not disable TLS verification or change system trust.

From the repository root, use a new output directory for every run:

```sh
node qa/nfl-dashboard/run.cjs --engine chromium \
  --output qa/nfl-dashboard/runs/local-chromium-20261008-1

node qa/nfl-dashboard/run.cjs --engine webkit --mobile-only \
  --output /tmp/project-dollar-nfl-webkit-20261008-1

node qa/nfl-dashboard/run.cjs --engine webkit --mobile-only \
  --base https://dinkyjunior.github.io/project-dollers/ \
  --output qa/nfl-dashboard/runs/hosted-webkit-20261008-1
```

`--output` accepts an absolute path or a path relative to the current working
directory. Alternatively, `--run-name unique-name` writes
`qa/nfl-dashboard/unique-name-ENGINE/`. Choose one option; an existing directory
is rejected to preserve previous evidence. Without `--base`, Python 3 serves the
checkout under its directory name using a temporary local port. The runner
stops only the server it started. It also works when the checkout is renamed.

The default run covers 393×852, 430×896, 320×700, 768×1024 and 1440×1000;
`--mobile-only` covers the first two. `--desktop-only` selects only 1440×1000
for a focused local or actual hosted desktop check. The two flags cannot be
combined. Checks include phone enclosure continuity,
overflow, locally bundled Retina-quality images, verified standings and leader
values, sorting, conference/division/form/week controls, tabs and keyboard
selection, in-screen previews, navigation/history, direct URL load and refresh,
native motion lifecycle, reduced motion, and existing Steelers roster/history
and complete-card football regression. Page 4 is excluded. Requests to external
runtime origins are recorded and rejected. Console, JavaScript, HTTP and
transport failures are recorded separately from cancelled navigations.

Each `results.json` records the Git revision, complete runtime hashes, data
snapshot/history hashes, browser version, viewport results and original PNG
hashes. Runtime changes during QA fail the run. Hosted runs additionally fetch
every runtime file and require its bytes to match the checked source. A passing
build or screenshots alone do not establish a passing run: require
`status: "passed"` and inspect the actual PNGs against the approved chat render.

Viewport screenshots keep natural animation timing, real phone geometry and
native image decoding/paint readiness. The full-content screenshot temporarily
unrolls the internal scroller into block flow to expose the entire actual HTML
screen; its recorded qualification distinguishes this capture-only geometry
from a native phone viewport. No source data, images or interface are replaced.

The isolated glyph probe holds panel clocks, captures rank-five and touchdown
glyphs with ornaments visible, then temporarily hides corner ornaments for a
diagnostic crop. It requires zero obscured glyph ink and restores inline styles
and native clock times. The Steelers perimeter probe temporarily samples 32
animation phases to verify all four edges of the complete expanded player card,
then restores native time. Release screenshots do not use forced phases.

Fixtures and statistics are read from the current verified local snapshot, not
copied from illustrative values in the render. Missing history is left unpadded;
source disagreements and unavailable fields remain qualified by the data layer.
Featured helmet artwork is explicitly decorative unbranded equipment with
separate genuine local team marks, not an official photograph or exact equipment
model; other fixtures use their true local logos. Asset provenance is saved in
`assets/nfl-dashboard/asset-provenance.json`.

The original approved reference binary is unavailable to this runner; human
comparison uses the chat attachment and does not claim registered pixel
identity. Engine emulation does not establish physical iPhone frame rate,
background-tab behavior or Safari browser-control coverage. Preserve failed runs
and save a separately named retry after a supported diagnosis.

For the separately audited metadata-only integration in this release,
`integration.cjs --engine chromium --run-name unique-name --freeze <manifest-SHA>`
runs focused source, refresh, geometry and native-motion checks at both phones.
Repeat with `--engine webkit`. It requires exactly the three declared data files
to differ from the approved implementation manifest and preserves all 200 other
runtime hashes. `--manifest` and `--previous-manifest` can name alternate JSON
manifests; defaults use the saved NFL release manifests. This helper does not
establish that arbitrary data changes are metadata-only: the independent source
comparison must already prove that, and the original complete suites remain
separate evidence.
