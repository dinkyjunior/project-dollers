# Approved Aperture Home launch evidence

This directory is reserved for the new Page 1 launch. Earlier QA reports and
screenshots in `qa/`, `qa/hosted/` and `qa/next-pass/` are not overwritten.

Run local full responsive QA:

```sh
node qa/home-gate.cjs
```

Run genuine WebKit mobile QA against the actual hosted website:

```sh
node qa/home-gate.cjs --engine webkit \
  --base https://dinkyjunior.github.io/project-dollers/ \
  --mobile-only --output qa/home-gate/hosted-webkit
```

The WebKit helper requires the existing official Playwright WPE binary,
workspace-verified distro libraries and supplied per-run proxy CA. TLS and
hostname verification remain enabled. System trust is not changed.

Each run writes its own `results.json`, browser screenshots and an HTML gallery.
It records the complete runtime asset hash manifest and rejects runtime files
changing during the QA run. A hosted run verifies all delivered runtime assets
against that exact manifest, including new Home artwork and data bundles.

The full responsive run covers NFL, NBA, NRL and UFC at 393×852, 430×896,
320×700, 768×1024 and 1440×1000. The two primary mobile sizes additionally cover
live-frame ring/background movement, fixed NBA split colours, reduced motion,
offscreen decorative intersection, inactive Home pause, complete player-card
football geometry, and source-matched player recent/opponent statistics.

Motion is paused only during screenshot exposure. The offscreen check is an
explicitly labelled isolated decorative-stage intersection harness, restored
before further controls or evidence screenshots. Native document departure
exercises the real `pagehide` lifecycle; this is distinct from physical-device
background-tab behaviour.

The approved source is the four-sport gate image reattached by the user in chat.
If original attachment bytes become available at
`reference/approved_home_gate_reference.png`, the HTML gallery includes them.
Otherwise it explicitly identifies chat-source visual inspection and does not
claim a pixel-registered source composite. Mobile engine emulation does not
establish physical iPhone performance or Safari browser-control behaviour.

No pass is claimed until `results.json` exists with `status: "passed"`. Human
visual inspection of actual screenshot proportions, lighting, logo materials,
venue crops and touch-control spacing is still required before deployment.
