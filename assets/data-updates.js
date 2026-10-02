/* Verified snapshot updates for a static, same-origin app.
   Event-triggered revalidation + an active-page fallback; this is not a push/live feed. */
(() => {
  'use strict';
  let current = null;
  const API_VERSION = 1;
  const nowISO = () => new Date().toISOString();
  const dateMillis = value => typeof value === 'string' ? Date.parse(value) : NaN;

  function validate(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1 ||
        !Number.isInteger(snapshot.season) || !Number.isInteger(snapshot.currentWeek) ||
        !snapshot.weeks || !snapshot.weeks[snapshot.currentWeek] ||
        !Array.isArray(snapshot.roster) || !snapshot.roster.length ||
        !Array.isArray(snapshot.sources) || !snapshot.sources.length ||
        !snapshot.provenance || !snapshot.steelers ||
        !Number.isFinite(dateMillis(snapshot.retrievedAt))) {
      throw new Error('The refreshed feed is incomplete. The last verified snapshot remains available.');
    }
    const invalid = () => { throw new Error('The refreshed feed has incomplete panels. The last verified snapshot remains available.'); };
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!object(snapshot.steelers.record) || !['w','l'].every(key => Number.isInteger(snapshot.steelers.record[key]) && snapshot.steelers.record[key] >= 0) ||
        !Array.isArray(snapshot.steelers.schedule) ||
        ['last5','injuries'].some(key => snapshot.steelers[key] !== undefined && !Array.isArray(snapshot.steelers[key]))) invalid();
    for (const week of Object.values(snapshot.weeks)) {
      if (!object(week) || !object(week.conferences) ||
          !['AFC','NFC'].every(conference => Array.isArray(week.conferences[conference])) ||
          (week.recap !== undefined && !Array.isArray(week.recap)) ||
          (week.leaders !== undefined && (!object(week.leaders) || ['QB','RB'].some(position => week.leaders[position] !== undefined && !Array.isArray(week.leaders[position]))))) invalid();
      for (const teams of Object.values(week.conferences)) {
        if (!Array.isArray(teams) || teams.some(team => !object(team) || typeof team.id !== 'string' || typeof team.name !== 'string' ||
            !['w','l'].every(key => Number.isInteger(team[key]) && team[key] >= 0))) invalid();
      }
    }
    const ids = new Set();
    for (const player of snapshot.roster) {
      if (!player || typeof player.id !== 'string' || ids.has(player.id) || typeof player.name !== 'string' ||
          (player.stats !== undefined && !Array.isArray(player.stats)))
        throw new Error('The refreshed roster is invalid. The last verified snapshot remains available.');
      ids.add(player.id);
    }
    const sourceIds = new Set();
    for (const source of snapshot.sources) {
      if (!object(source) || typeof source.id !== 'string' || sourceIds.has(source.id) ||
          (source.status === 'verified' && !Number.isFinite(dateMillis(source.retrievedAt)))) invalid();
      sourceIds.add(source.id);
    }
    for (const group of ['standings', 'roster', 'playerStats', 'schedule']) {
      const entry = snapshot.provenance[group];
      if (!entry || !['verified', 'derived', 'unavailable'].includes(entry.status) ||
          !Array.isArray(entry.sourceIds) || (entry.status !== 'unavailable' && !entry.sourceIds.length) || entry.sourceIds.some(id => !sourceIds.has(id))) {
        throw new Error('The refreshed source information is invalid. The last verified snapshot remains available.');
      }
    }
    return snapshot;
  }

  function create(options = {}) {
    if (typeof options.getSnapshot !== 'function' || typeof options.onSnapshot !== 'function')
      throw new TypeError('PDDataUpdates.start requires getSnapshot and onSnapshot callbacks.');
    const url = new URL(options.snapshotUrl || 'assets/data/current.json', document.baseURI);
    if (url.origin !== location.origin)
      throw new TypeError('Snapshot updates must use a same-origin URL.');
    const streamUrl = options.streamUrl ? new URL(options.streamUrl, document.baseURI) : null;
    if (streamUrl && streamUrl.origin !== location.origin && streamUrl.protocol !== 'https:')
      throw new TypeError('A configured notification stream must use HTTPS.');
    const minIntervalMs = Math.max(1000, Number(options.minIntervalMs) || 60000);
    const activeIntervalMs = Math.max(minIntervalMs, Number(options.activeIntervalMs) || 120000);
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 12000);
    const maxBackoffMs = Math.max(activeIntervalMs, Number(options.maxBackoffMs) || 15 * 60000);
    let running = true, timer = null, request = null, inFlight = null, stream = null, lastEventId = null, pendingInvalidation = false;
    let lastAttempt = 0, failures = 0, etag = null, lastGood = options.getSnapshot();
    let content = lastGood ? JSON.stringify(lastGood) : null;
    let state = { state: 'idle', mode: 'event-revalidation', source: url.pathname, streamState: streamUrl ? 'waiting' : 'not-configured',
      lastCheckedAt: null, lastChangedAt: null, sourceRetrievedAt: lastGood?.retrievedAt || null,
      nextCheckAt: null, reason: 'start', message: 'Checks on open, return to the app, reconnect and refresh. This is a verified snapshot, not a live stream.' };

    function emit(next) {
      state = { ...state, ...next };
      if (typeof options.onStatus === 'function') {
        try { options.onStatus({ ...state }); } catch (error) { console.error('Data-update status callback failed.', error); }
      }
    }
    function delay() { return Math.min(maxBackoffMs, activeIntervalMs * (2 ** Math.min(failures, 4))); }
    function schedule(wait = delay()) {
      clearTimeout(timer); timer = null;
      if (!running || document.hidden || navigator.onLine === false) {
        state.nextCheckAt = null; return;
      }
      state.nextCheckAt = new Date(Date.now() + wait).toISOString();
      timer = setTimeout(() => { timer = null; refresh('active-check'); }, wait);
    }
    function syncBaseline() {
      const snapshot = options.getSnapshot();
      if (snapshot && snapshot !== lastGood) {
        lastGood = snapshot; content = JSON.stringify(snapshot);
        state.sourceRetrievedAt = snapshot.retrievedAt || null;
      }
    }
    async function perform(reason) {
      syncBaseline(); lastAttempt = Date.now();
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), timeoutMs);
      emit({ state: 'checking', reason, nextCheckAt: null, message: 'Checking the published verified feed for changes.' });
      try {
        const headers = etag ? { 'If-None-Match': etag } : {};
        const response = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin', headers, signal: request.signal });
        if (!running) return { state: 'stopped', changed: false };
        if (response.status === 304) {
          if (!lastGood) throw new Error('A cached feed is unavailable. Refresh again to load verified data.');
          failures = 0;
          emit({ state: 'unchanged', lastCheckedAt: nowISO(), reason, message: 'Checked: no new published data is available.' });
          return { state: 'unchanged', changed: false, snapshot: lastGood };
        }
        if (!response.ok) throw new Error(`Feed check failed (HTTP ${response.status}). The last verified snapshot remains available.`);
        const snapshot = validate(await response.json());
        const baseline = lastGood;
        if (baseline && (snapshot.season < baseline.season ||
            (snapshot.season === baseline.season && dateMillis(snapshot.retrievedAt) < dateMillis(baseline.retrievedAt)))) {
          throw new Error('An older feed was returned. The newer verified snapshot remains available.');
        }
        const nextContent = JSON.stringify(snapshot), changed = nextContent !== content;
        if (changed) {
          // The UI callback owns selection and scroll preservation. Accept only after it succeeds.
          await options.onSnapshot(snapshot, { reason, checkedAt: nowISO(), previousRetrievedAt: baseline?.retrievedAt || null });
          if (!running) return { state: 'stopped', changed: false };
          lastGood = snapshot; content = nextContent;
        }
        etag = response.headers.get('ETag') || null;
        failures = 0;
        emit({ state: changed ? 'updated' : 'unchanged', lastCheckedAt: nowISO(),
          lastChangedAt: changed ? nowISO() : state.lastChangedAt, sourceRetrievedAt: lastGood.retrievedAt,
          reason, message: changed ? 'New verified snapshot loaded.' : 'Checked: no new published data is available.' });
        return { state: changed ? 'updated' : 'unchanged', changed, snapshot: lastGood };
      } catch (error) {
        if (!running) return { state: 'stopped', changed: false };
        failures += 1;
        const offline = navigator.onLine === false;
        const message = error.name === 'AbortError' ? 'The feed check timed out. The last verified snapshot remains available.' : error.message;
        emit({ state: offline ? 'offline' : 'error', reason, lastCheckedAt: nowISO(), message });
        return { state: offline ? 'offline' : 'error', changed: false, message, snapshot: lastGood };
      } finally {
        clearTimeout(timeout); request = null;
      }
    }
    function refresh(reason = 'manual', refreshOptions = {}) {
      if (!running) return Promise.resolve({ state: 'stopped', changed: false });
      if (inFlight) {
        if (reason === 'provider-event') pendingInvalidation = true;
        return inFlight;
      }
      clearTimeout(timer); timer = null;
      if (navigator.onLine === false) {
        emit({ state: 'offline', reason, nextCheckAt: null, message: 'Offline. The last verified snapshot remains available; reconnecting checks for updates.' });
        return Promise.resolve({ state: 'offline', changed: false, snapshot: lastGood });
      }
      const manual = reason === 'manual' || reason === 'retry' || refreshOptions.force === true || reason === 'provider-event';
      if (!manual && document.hidden) {
        emit({ state: 'paused', reason, nextCheckAt: null, message: 'Background checks paused. Returning to the app checks for updates.' });
        return Promise.resolve({ state: 'paused', changed: false });
      }
      // Debounce focus/visibility/pageshow bursts; user refresh is immediate.
      const sinceAttempt = Date.now() - lastAttempt;
      const waitUntilNext = failures ? Math.max(minIntervalMs, delay()) : minIntervalMs;
      if (!manual && sinceAttempt < waitUntilNext) {
        schedule(Math.max(1000, waitUntilNext - sinceAttempt));
        return Promise.resolve({ state: 'throttled', changed: false, snapshot: lastGood });
      }
      inFlight = perform(reason).finally(() => {
        inFlight = null;
        if (pendingInvalidation && running && !document.hidden && navigator.onLine !== false) {
          pendingInvalidation = false; refresh('provider-event', { force: true });
        } else schedule();
      });
      return inFlight;
    }
    function closeStream() {
      stream?.close(); stream = null;
      if (streamUrl) state.streamState = 'paused';
    }
    function openStream() {
      if (!streamUrl || stream || !running || document.hidden || navigator.onLine === false) return;
      if (typeof EventSource !== 'function') {
        emit({ streamState: 'unsupported' }); return;
      }
      try {
        stream = new EventSource(streamUrl.href);
        const connectedStream = stream;
        emit({ streamState: 'connecting' });
        stream.onopen = () => { if (running && stream === connectedStream && !document.hidden) emit({ streamState: 'connected' }); };
        stream.onerror = () => { if (running && stream === connectedStream && !document.hidden) emit({ streamState: 'reconnecting' }); };
        stream.onmessage = event => {
          // Provider notifications only invalidate the verified same-origin feed.
          // Arbitrary stream JSON never replaces sourced statistics directly.
          if (!running || stream !== connectedStream || document.hidden || typeof event.data !== 'string' || event.data.length > 65536) return;
          let notification;
          try { notification = JSON.parse(event.data); } catch { return; }
          if (notification?.type !== 'dataChanged' ||
              (notification.retrievedAt !== undefined && !Number.isFinite(dateMillis(notification.retrievedAt)))) return;
          if (event.lastEventId && event.lastEventId === lastEventId) return;
          if (event.lastEventId) lastEventId = event.lastEventId;
          refresh('provider-event', { force: true });
        };
      } catch { emit({ streamState: 'unavailable' }); }
    }
    const onFocus = () => { openStream(); refresh('focus'); };
    const onPageShow = () => { openStream(); refresh('pageshow'); };
    const onOnline = () => { failures = 0; lastAttempt = 0; openStream(); refresh('online'); };
    const onOffline = () => { closeStream(); clearTimeout(timer); timer = null; emit({ state: 'offline', nextCheckAt: null, reason: 'offline', message: 'Offline. The last verified snapshot remains available; reconnecting checks for updates.' }); };
    const onVisibility = () => {
      if (document.hidden) {
        closeStream(); clearTimeout(timer); timer = null;
        emit({ state: 'paused', nextCheckAt: null, reason: 'visibility', message: 'Background checks paused. Returning to the app checks for updates.' });
      } else { openStream(); refresh('visible'); }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    const controller = {
      refresh,
      getStatus: () => ({ ...state }),
      stop() {
        running = false; closeStream(); clearTimeout(timer); timer = null; request?.abort();
        window.removeEventListener('focus', onFocus); window.removeEventListener('pageshow', onPageShow);
        window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisibility);
        emit({ state: 'stopped', nextCheckAt: null });
      }
    };
    openStream();
    controller.startPromise = options.checkOnStart === false ? Promise.resolve({ state: 'unchanged', changed: false, snapshot: lastGood }) : refresh('start');
    if (options.checkOnStart === false) { emit({ state: 'idle' }); schedule(); }
    return controller;
  }

  window.PDDataUpdates = {
    version: API_VERSION,
    start(options) { current?.stop(); current = create(options); return current; },
    refresh(reason = 'manual', options = {}) { return current ? current.refresh(reason, options) : Promise.resolve({ state: 'not-started', changed: false }); },
    getStatus() { return current?.getStatus() || { state: 'not-started' }; },
    stop() { current?.stop(); current = null; }
  };
})();
