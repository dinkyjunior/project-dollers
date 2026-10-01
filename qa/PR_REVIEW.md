# Refine Pages 1–3 against the approved eight-screen render

The user supplied the approved render in chat. Comparing it against the previous draft showed an undersized/upright masthead, short sport grid, boxed flat stadium visual, loose NFL type/rows and only four quiet roster cards. Pages 1–3 now follow the source more closely: a broad slanted metallic/gold/cyan brand, grid boundaries at roughly 26–75% of Home, richer original stadium lighting, compact condensed NFL columns, an illuminated historical fixture and five equal gold/orange roster cards with full perimeter motion.

A second visual pass adjusted grid placement, NBA/UFC edge colors, logo size, foreground football scale, five-card density, jersey labels and irregular edge sparks. Authentic player photos remain untouched. The fifth receiver is verified 2025 Steeler Roman Wilson, preserving source layout without copying unsupported roster membership or statistics.

Validation: offline `npm test` passed at 393×852 and 430×896. It checks navigation/history/direct loads, tabs/filters/selection, all four perimeter edges, reduced motion, alignment and default-page overflow. All images decode with zero external requests, HTTP errors or JS/console errors. Six final PNGs, preserved before captures, six side-by-side before/after sheets, a contact sheet and attachment-based comparison notes are under `qa/`.

The approved source was visible in chat but not exposed as downloadable bytes; the user explicitly instructed proceeding. Comparison notes identify the attachment as authority, and side-by-side artifacts show before/after browser output rather than fabricated reference pixels. This is a material fidelity improvement, not a claim of pixel identity or user approval. Verified 2025 content differs intentionally from illustrative source values; see `ASSET_SOURCES.md`.

Only Pages 1–3 are changed. Page 4 is not implemented, and `main` is untouched. Keep this PR in draft; do not merge without approval.
