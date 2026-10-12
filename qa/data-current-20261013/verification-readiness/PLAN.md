# Independent current-data and daily-update verification plan

User-facing date: 13 October 2026, Australia/Sydney. This is a plan and runtime readiness record; it is not a completed fresh-data or hosted acceptance.

## Restore and protect

- Preserve existing source, 24 original backups, all prior passed and failed QA receipts and the approved Home design.
- Bind the final source and every displayed dataset by SHA-256 before browser launch; freeze edits during each browser owner's run.
- Use the existing project-compatible Playwright 1.58.2 from `/workspace/.onboarding/project-dollers/node_modules`. The restored machine otherwise resolves a different global version.
- Installed Chromium 151 can support local browser QA. The official WebKit 2248 and workspace-only authenticated distro libraries must be restored before genuine WebKit and strict-TLS hosted verification. Do not claim browser success from executable presence alone.
- Launch no browsers until the root assigns exclusive ownership. Keep contexts closed between independent passes and publication/snapshot changes.

## Factual acceptance

- Compare all 32 teams' current W/L/T, points for/against, division and conference with independently obtained current public sources. Calculate records from the exact verified final game set and disclose any unresolved provider disagreement.
- Verify that default NFL standings show the latest completed results available in the snapshot. Test historical week selection separately; its cutoff must be named and must not silently masquerade as current standings.
- Confirm season, completed week, selected week, upcoming week and retrieval timestamps across NFL, Team, Matchup, player-history and Game Report. A calendar date is distinct from an NFL season label.
- Validate schedules, final scores, opponent/home/away identity and report routes across all teams. A selected event must never silently substitute a different available game.
- Check current roster and player identity changes, stats coverage, last-five games, weekly-opponent history, injury/practice dates and starter status. Do not infer an unavailable injury status, game, starter or statistic from sample design values.
- Rebuild every dependent book and checksum-bound report catalog together. The integrity adapter must expose disagreements and mask dependent sums/rates instead of choosing a source without disclosure.
- Run core, Team, Matchup and Report validators; the source-backed Team and Matchup tests must use the cache/manifest from this fresh generation, not older release evidence.

## Automatic daily delivery

- Verify scheduled refresh, manual refresh and failure retention using existing behavior tests plus any material new daily/freshness behavior.
- Require a daily full safety refresh even if conditional source validators say unchanged; frequent checks may remain where useful.
- A failed source request or invalid candidate must retain the last valid published snapshot with an honest freshness/error status, not stamp old facts as freshly retrieved.
- Verify publication includes all linked books and individual report files and explicitly requests a Pages rebuild after a bot commit.
- Verify the production Actions run and actual hosted publication. A YAML schedule or locally passing producer is insufficient proof of successful production automation. If authorized GitHub control is inaccessible, report that exact restriction and distinguish verified local behavior from unverified production execution.

## Independent browser passes

Run both native Chromium and genuine native WebKit against the frozen final candidate, preserving immutable separate evidence folders. Target 393×852, 430×896 and 1440×900 with phone touch and DPR2 where applicable.

- Home → NFL; selected defaults; AFC/NFC; division, form, sort and full ladder; historical/current week changes; Top QB/RB/WR; recap and finished fixtures.
- All 32 team and matchup identities; representative schedule, filters, roster, player history, source dialogs and direct-load/refresh transitions.
- Team and Matchup previous results → exact Game Report → exact source screen and selected filters. Overview, every implemented box category, actual full player profile, drives, plays, availability and sources.
- Verify DOM values against the independently frozen source and fresh reference audit, including null versus zero and partial stats coverage.
- No horizontal overflow, clipping, misaligned rows, broken images, failed runtime requests or JavaScript/console errors. Capture actual original viewport PNGs without changing styles, seeking animations, replacing responses or synthesizing text.
- Verify preserved Home geometry/artwork; check report and standings density at both phone sizes. Reduced motion must stop decorative motion and normal preference must resume it. These are browser-emulation checks, not physical-iPhone or measured-FPS certification.

## Actual hosted closure

Use `qa/game-report/hosted-verification.cjs` with an explicit HTTPS base, fresh evidence path and reviewed manifest count. It binds every actually delivered first-party runtime body, exact books and selected reports with strict TLS and hostname verification. Add targeted current-ladder/freshness assertions appropriate to the final default-week fix.

The hosted helper's required-file subset is distinct from a claim to have downloaded every historical report. It must be run against the newest production snapshot after any automatic-refresh publication, not against a stale local freeze. Confirm actual mobile screens, navigation, refresh, assets and current-source values after deployment.

## Current readiness results

`runtime-before.json` records exact installed modules/binaries and missing restored WebKit prerequisites. `pure-behavior-readiness.json` records passing pre-change controller, source-monitor and core-construction tests. They are useful baseline checks, not proof that the live ladders or all newest factual records are correct.
