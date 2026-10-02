# Independent automatic-update integration review

Passed on October 2, 2026 (Sydney), using actual Chromium 151 at 393 × 852 with DPR 2 and the `/project-dollers/` subpath. The helper serves the actual application and uses controlled copies of the verified snapshot/history only for update and fault injection. It does not publish those test values. Runtime and evidence timestamps/hashes are in `auto-update-integration.json`.

`node qa/auto-integration.cjs` passed with zero JavaScript page errors or failed network requests. The initial app load makes one snapshot request; starting the update client does not duplicate it.

The audit selected Week 2, NFC, the NFL player tab, Steelers roster, the WR filter, DK Metcalf, opponent-history mode, season overview, a complete game breakdown and its additional statistics. A newer valid snapshot retained each selection, the expanded player, all three nested details states and scroll position. The focused weekly-opponent selector also survived DOM replacement.

An HTTP 503 and an incomplete nested feed retained the last-good snapshot, player history, fixture, Sources content and all current panels. An injected renderer exception was caught by the application transaction and rolled the data/window/UI back to the prior verified state. Reconnecting revalidated the feed without redrawing unchanged content or resetting selections.

The history checksum changed while the player was open. The app kept the previously verified history visible with an explicit updating notice and its original source times, then accepted the replacement only after checksum/source-version validation. Deep scroll stayed exactly 2,600 pixels before and after the async replacement. The focused source link remained inside the open Sources dialog. A subsequent deliberately wrong history checksum retained the prior verified history and showed the retention notice with original source-time context; all selected and expanded state remained intact.

Two issues found during the first review were fixed and independently rerun: focused controls originally fell back to the document body on refresh, and clearing the history before reloading originally clamped deep scroll from 2,600 to 2,190 pixels. Both now pass.

The interface accurately states that it checks newly published verified data and that live play-by-play/an authorized push feed are not connected. Event-driven refresh is functional; genuine upstream streaming remains an explicit provider/backend limitation, not a finished capability.

The standalone update client also passes eight behavior groups in `node qa/data-updates.test.cjs`, including background/offline pause, focus debounce, conditional requests, single-flight behavior, timeout/backoff, source validation and the optional unconfigured-by-default SSE notification adapter. The wider mobile/desktop visual and functional pass is owned by the integration QA agent.
