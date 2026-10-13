# Home interior interaction review

Reviewed the frozen Home markup, `assets/home-editorial.js`, scoped CSS and the native `native-interiors-v1/results.json` receipt. No application code or research data was changed during this review.

- All four icon-only selectors retain accessible sport names, `aria-pressed` and one selected state. Selection stays on `#home`.
- No JavaScript dependency remains on the removed visible league name, row name, row number, headline or description.
- NFL entry and its three topic buttons remain enabled only for NFL. Other selections synchronously disable those buttons and remove the entry route before artwork decoding starts. The menu explicitly links to existing NFL destinations in every preview.
- Menu disclosure, first-item focus, Escape with focus return, outside dismissal, focus departure and route cleanup remain intact.
- The NFL portrait assets are unchanged. NBA, NRL and UFC use the reviewed interior asset paths. The responsive `<picture>` handles the 430 px breakpoint; the interior CSS preserves the native 3:2 composition without stretching.
- Image sequencing guards both success and failure. A superseded decode cannot replace the latest selection. A failed selected image hides the previous venue; a later successful selection restores it.
- Optional session storage, hidden-page motion suspension and reduced motion remain intact.

The existing native audit passed 16 sport/viewport combinations at 393, 430, 768 and 1440 px, including menu Escape/focus and Home → NFL → Home framing.

A bounded native Chromium edge check was also rerun against these new interior paths: **7/7 passed**, with no JavaScript errors and the browser closed. It covered delayed NBA → NRL → NFL selection, synchronous route gating, deliberately blocked UFC artwork and recovery, persisted selection after refresh, responsive 393 ↔ 431 px artwork, direct NFL loading with Home motion paused, and blocked optional session storage. The deliberate image fault was recorded separately from ordinary site behavior. Its local receipt is `/tmp/project-dollar-home-interior-edges-v1.json`.

No confirmed Home interaction defect was found. This review qualifies local native Chromium behavior; it does not certify hosted delivery, Safari or NFL data freshness. Loading and image-failure messages currently use the existing screen-reader live region.
