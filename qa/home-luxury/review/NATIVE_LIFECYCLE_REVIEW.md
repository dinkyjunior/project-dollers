# Independent native lifecycle correction review

The Home-only event-driven native playback correction is technically accepted on its focused evidence. Current motion source is `4a55cb0f869cc4a7b7c2eb54495ebff5a3c3460bd91eec2ea01faaa19372cb52`. It retains CSS timing, adds native pause/resume only for infinite effects in the Home subtree, tracks only its own suspended objects, excludes hidden league scenes, and never changes animation phases or runs a rendering loop. NFL/player motion is outside its ownership.

I read both source and the genuine WebKit probe, verified all 191 current runtime hashes, and independently checked each of 14 passing state pairs. Inactive NFL, the real observed offscreen gate and hidden-document input have zero running native clocks and stable settled currentTime; every resumed main-ring clock advances naturally by more than 10 ms. Reduced motion has no remaining animation objects, and real document departure records paused/pagehide/zero running. The test does not pause, play, cancel or seek animations itself. It waits for the browser's actual nonpending native pause before measuring stationary hold-times, preserving strict zero-running and clock assertions.

The hidden-document branch uses an explicitly disclosed test getter/event, not physical backgrounding. Offscreen testing temporarily moves only the decorative stage and restores its exact style and bounds. The native pagehide/pageshow branch uses real navigation and browser history. This focused proof does not replace final all 20 current-source visual captures, complete functional/motion checks or actual-hosted verification. Previous runtime evidence stays historical.

Focused proof SHA256: `f7c0c419af3d1b24309b1d29b08818661c4b7f4493fa85b4e01b021694d540c5`.

State pairs: initial Home, selected nba, selected nrl, selected ufc, selected nfl, inactive NFL, returned Home, reduced motion, restored motion preference, real observed gate offscreen, restored exact gate position, hidden document condition, restored genuine hidden property, native pageshow return.
