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
- A real HTTP refresh of an unchanged dataset retains the existing panel, filter, game-row and refresh-button DOM nodes, keyboard focus and selection. Automatic source validation must not interrupt native taps or scrolling.
- All 32 team entry routes retain the correct identity, source links, valid team fixture and compact geometry. The Pittsburgh player-research bridge keeps its existing route and player details.
- All six specialists review actual evidence and source data. Before each push, preserve incoming changes through fetch/rebase. Verify the published exact runtime and actual hosted interactions at both phone sizes and desktop.

Run with a new output path each time:

```sh
node qa/team-details/run.cjs --engine chromium --mobile-only --output qa/team-details/local-chromium-final
python3 qa/team-details/run-durable.py --timeout 4800 -- node qa/team-details/run.cjs --engine webkit --mobile-only --output qa/team-details/local-webkit-final
node qa/team-details/run.cjs --engine chromium --desktop-only --output qa/team-details/local-desktop-final
python3 qa/team-details/run-durable.py --timeout 4800 -- node qa/team-details/run.cjs --engine webkit --mobile-only --base https://dinkyjunior.github.io/project-dollers/ --output qa/team-details/hosted-webkit-final
node qa/team-details/run.cjs --engine webkit --desktop-only --base https://dinkyjunior.github.io/project-dollers/ --output qa/team-details/hosted-desktop-final
```

For long native WebKit runs, the default operational example above allows 4,800 seconds for both serialized phone scenarios. This is a bounded execution budget, not a relaxation of any action or assertion. Software-rendered native WebKit can be substantially slower than Chromium. The durable wrapper writes separate process logs, heartbeats and an exit receipt beside the evidence directory. Choose unused output paths; previous evidence is immutable.

An individual viewport can use the identical frozen runner and assertions:

```sh
python3 qa/team-details/run-durable.py --timeout 4800 -- node qa/team-details/run.cjs --engine webkit --viewport 393x852 --output qa/team-details/local-webkit-393-separate
python3 qa/team-details/run-durable.py --timeout 4800 -- node qa/team-details/run.cjs --engine webkit --viewport 430x896 --output qa/team-details/local-webkit-430-separate
```

Both phone cases are required. The 393 case also checks all 32 team routes. A timed-out parent job remains incomplete even if one of its recorded scenarios completed; complete case evidence requires its exact source/test binding and must be paired with a genuinely completed second-phone case. Do not relabel a partial job as passed.

For the already-running local native v3 job, the coordinator explicitly authorized external Unix supervision to preserve genuine progress. Its original wrapper budget is 2,400 seconds; the separately recorded effective deadline is 4,800 seconds measured from the original start. `supervise-owned-qa.py` verifies the recorded Python parent, its exact Node child, process-group/start identities and unchanged runtime/test hashes. It stops only that watchdog parent, leaves the native runner and browser untouched, imposes a bounded termination deadline, and resumes the original wrapper in `finally` so it reaps the genuine exit and validates the untouched completed report. This operational override is recorded under `local-webkit-final-v3-process/external-supervision/`; it never edits application files, frozen QA helpers or results, and does not itself prove acceptance.

After the full local suites and all specialist release gates pass, `hosted-deployment.cjs` provides a narrower actual-hosting check without repeating the 312-action/83-disclosure suite. It requires the exact original manifest, current manifest and independently reviewed metadata-only transition classification hashes. It runs the frozen provider-refresh scenarios on both phones and desktop, records exact child-report references, then verifies four actual Home sport selections/colors, native lighting/reduced/inactive motion, the venue destination, normal and qualified full-content captures, direct reload and every one of the 231 served runtime bodies. Real source HTTP requests, refresh DOM/focus preservation, report/schedule destinations and the existing Pittsburgh research bridge remain mandatory through the child scenarios. Use `hosted-durable.py --timeout 4800 -- node qa/team-details/hosted-deployment.cjs ...` with a fresh output directory; its named arguments include `--engine`, `--base`, `--original-manifest`, `--original-freeze`, `--manifest`, `--freeze`, `--classification`, `--classification-freeze` and `--output`. This targeted deployment evidence complements the complete local audits and cannot replace them.

Use `--capture-only` for visual iterations. Such runs report `captured-not-accepted` and cannot establish functional acceptance. A passing run requires a completed `results.json` whose status is `passed`, an unchanged runtime/source manifest and unchanged independent test-file hashes throughout execution. A process exit code alone never proves acceptance. Hosted tests retain strict TLS and verify every runtime asset against the tested source hashes.

The user-approved chat attachment defines the visual target. If its original bytes are unavailable locally, identify the independent AI-agent visual inspections honestly; do not claim a separate human audit or invent a pixel-comparison score. Full-content sheets expose the actual internal scroller only on an isolated second app page. Ordinary top/mid/bottom captures retain the normal viewport, scrolling and fixed navigation. Browser emulation does not certify physical iPhone Safari controls or frame rate.
