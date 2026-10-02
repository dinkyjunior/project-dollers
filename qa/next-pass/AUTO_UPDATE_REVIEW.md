# Automatic data updates — October 2, 2026 (Sydney)

The app now has an event-driven revalidation client in `assets/data-updates.js`. It checks the same-origin verified feed when the app opens, returns to the foreground, receives a focus/pageshow event, reconnects, or the user requests refresh. While visible and online it also has a two-minute fallback check. Background/offline checks pause. Repeated focus events are debounced; manual refresh bypasses the automatic-check backoff.

A feed check does not imply that the sports provider has published new statistics. The status distinguishes the last check from the source retrieval time. Unchanged JSON or HTTP 304 does not redraw the UI. Failed requests, invalid data/source information, timeouts and older snapshots retain the last-good snapshot. Requests are single-flight, have a 12-second timeout and exponential retry backoff (maximum 15 minutes). There are no default runtime requests to external data hosts.

## Integration contract

Load the initial snapshot and local image mapping, then start:

```js
const updates = PDDataUpdates.start({
  getSnapshot: () => data,
  onSnapshot: (snapshot, context) => applySnapshotPreservingState(snapshot),
  onStatus: status => showUpdateStatus(status),
  snapshotUrl: 'assets/data/current.json',
  checkOnStart: false
});
await updates.startPromise;
```

`checkOnStart: false` avoids duplicating the successful initial JSON request; that initial request is the app-open check. Root/app integration owns preservation of selected week, conference, tab, roster filter, expanded player and scroll. `refresh(reason = 'manual', { force: true })`, `getStatus()` and `stop()` are available on the returned controller and the global API. `getStatus()` includes state, reason, source retrieval time, last check/change times and next check. A newer snapshot reaches `onSnapshot` only after schema, roster uniqueness and provenance validation. The callback must successfully accept it before the update client treats it as the new baseline.

## Push support and source limits

A configured, authorized `streamUrl` can supply Server-Sent Event notifications. No stream is configured by default, so the app does not claim a push connection. The adapter accepts only JSON `dataChanged` notifications, optionally with a valid retrieval timestamp, and deduplicates notification IDs. Notifications immediately trigger a same-origin feed check; arbitrary streamed JSON never substitutes unverified player statistics. Streams close while the app is hidden/offline and reopen on return. “Connected” requires an actual EventSource open event.

GitHub Pages is static hosting and currently has no running push/backend endpoint. Genuine immediate upstream delivery requires an authorized provider webhook/stream and a backend that validates and publishes updates. That has not been fabricated or presented as finished. The separate repository workflow detects provider source changes more often around games and documented publishing windows; GitHub scheduling and provider release cadence remain practical limits. NFLverse documents nightly player-stat releases, so a faster client cannot turn those files into live play-by-play.

Normal public ESPN scoreboard/team endpoint requests were denied by the environment CONNECT tunnel (403); Chromium reported `ERR_TUNNEL_CONNECTION_FAILED`. The public raw GitHub snapshot was readable with normal Python HTTP and advertised `Access-Control-Allow-Origin: *`, but normal Chromium access failed with `ERR_CERT_AUTHORITY_INVALID`. Browser security was not disabled. It is also a published snapshot cached for five minutes, not a live sports provider. It is therefore not enabled as a runtime replacement. See `auto-update-source-probes.json` for actual evidence.

## Validation

- `node qa/data-updates.test.cjs`: eight behavior groups passed for initial-load request deduplication, JSON/304 deduplication, newer/invalid/older feeds, failure preservation, concurrency, focus debounce, background/offline pause, reconnect, backoff, timeout, and optional stream validation/lifecycle.
- Actual Chromium 151 same-origin HTTP test passed: real fetch and ETag/304 handling, update acceptance exactly once, 503 preservation, reconnect, and zero JavaScript page errors. See `auto-update-browser.json`.
- UI state preservation and mobile layout are covered by the independent integrated application QA; this standalone review does not claim those results before that agent completes them.
