# Legacy WebKit capture diagnosis

The original two failing broad runs are preserved. This folder contains three controlled cold-flow comparisons against the same 231 application files (manifest fe69378e), exact in-memory executed legacy helper sources and raw measurements/screenshots. Each comparison intentionally stops the broad suite after the diagnostic; its `cold-flow-context/results.json` is not a release pass.

The original screenshot helper pauses/saves a fallback CSS animation, awaits paint while the measured path replaces it, then plays the saved cancelled animation. That revives a second replacing `offsetDistance` clock. Object identity, time and `ready` records distinguish this from pending-seek failure.

Removing capture manipulation leaves one premium clock and passes. The narrower approved fix keeps capture consistency and resumes only stored animations still present and paused; the safe control records all five old fallbacks as `idle` and absent, with every 32-point geometry/phase check passing. Production runtime is unchanged. `helper-only.diff` is the sole legacy-helper change.

A supported cloud machine with the installed Playwright/WPE runtime can reproduce the paired diagnostics from the preserved baseline:

```sh
node qa/team-details/reviews/motion-probe-cold/probe.cjs
node qa/team-details/reviews/motion-probe-cold/probe.cjs --native-capture
node qa/team-details/reviews/motion-probe-cold/probe.cjs --safe-resume
```

The raw executed helper bytes and originally executed probe are preserved separately from the packaged baseline-loading reproducer. Packaged reproducer syntax was checked; the raw three full diagnostics are the execution evidence. Broad protected legacy regression and complete native/hosted release gates remain separate.
