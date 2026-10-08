# Dallas team-details acceptance

The user-approved Dallas Form chat render defines the structure and visual treatment. Its scores, record, fixture and neutral venue are illustrative until verified. This task explicitly authorizes the additional team-details screen, its functional controls and the Home diamond entry refinement. Prior QA evidence stays immutable.

Before publication, independently check:

- Home-to-NFL-to-team navigation; ladder breadcrumbs/back; direct team URL and reload; every tab, filter, game expansion/report, aggregation toggle, schedule, venue view, continuation and navigation control.
- Current-season and cross-season completed-game selection, preseason exclusion, venue classification, sample size and consistent statistical denominators. Missing metrics remain unavailable.
- Team record, division, fixtures, kickoff/timezone, results, statistics, roster, depth and injuries have source identifiers, retrieval timestamps and season/week context. Differences or unavailable fields are explicit.
- Masthead, breadcrumbs, hero, upcoming game, tabs, filters, game reports, yardage, snapshot, diamond buttons and navigation receive separate before/after visual review against the attachment.
- Native 393×852, 430×896 and desktop presentation: compact Home-sized app frame, internal scrolling, clean text/assets, no horizontal overflow, clipped controls or obscured content.
- Genuine naturally advancing and painted lighting; reduced-motion and inactive-route pauses; stationary readable factual text.
- No unexpected console/JavaScript errors, HTTP failures, external image dependencies, broken images or transport failures.
- All six specialists review actual evidence and source data. Before each push, preserve incoming changes through fetch/rebase. Verify the published exact runtime and actual hosted interactions at both phone sizes and desktop.

Run with a new output path each time:

```sh
node qa/team-details/run.cjs --engine chromium --mobile-only --output qa/team-details/local-chromium-final
node qa/team-details/run.cjs --engine webkit --mobile-only --output qa/team-details/local-webkit-final
node qa/team-details/run.cjs --engine chromium --desktop-only --output qa/team-details/local-desktop-final
node qa/team-details/run.cjs --engine webkit --mobile-only --base https://dinkyjunior.github.io/project-dollers/ --output qa/team-details/hosted-webkit-final
node qa/team-details/run.cjs --engine webkit --desktop-only --base https://dinkyjunior.github.io/project-dollers/ --output qa/team-details/hosted-desktop-final
```

Use `--capture-only` for visual iterations. Such runs report `captured-not-accepted` and cannot establish functional acceptance. A passing run requires an unchanged runtime/source manifest throughout execution. Hosted tests retain strict TLS and verify every runtime asset against the tested source hashes.
