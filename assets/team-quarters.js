/* Lazy quarter points for an explicitly expanded team-history game.
   Source books remain read-only; the shared report catalog binds each detail. */
(() => {
  'use strict';
  const states = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const integer = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validHash = value => /^[a-f0-9]{64}$/i.test(String(value || ''));
  const idOf = game => String(game?.id || game?.gameId || '');
  const signature = game => JSON.stringify(['id','season','week','status','home_team','away_team','home_score','away_score'].map(key => game?.[key]));
  const relevantField = item => /quarter|periodscore|eventidentityorfinalscore|^(?:home|away)_score$|^scores?$/i.test(String(item?.field || ''));
  const unavailable = message => Object.assign(new Error(message),{unavailable:true});
  const mounted = id => [...document.querySelectorAll('[data-pd-quarter-game]')].some(node => node.dataset.pdQuarterGame === id && !node.closest('[hidden]') && node.closest('[data-page="team-details"]')?.classList.contains('active'));
  const retained = state => !!state.value && ['loading','error'].includes(state.status);
  const notify = state => document.dispatchEvent(new CustomEvent('pd:team-quarters-updated',{detail:{gameId:state.id,status:state.status,retained:retained(state)}}));

  function catalog() {
    // Team data is admitted only after PDSourceIntegrity has verified this same
    // catalog. Do not download a second catalog or change the game-report route.
    const index = window.PDSourceIntegrity?.getLastCatalog?.() || window.PDGameReport?.getDataset?.();
    if (index?.schemaVersion !== 1 || !index.games || !validTime(index.retrievedAt)) throw new Error('Verified report catalog is not ready.');
    return index;
  }
  function entryFor(game, index) {
    const entry = index.games[idOf(game)];
    if (!entry) throw unavailable('Quarter scores unavailable for this game.');
    for (const key of ['id','season','week','status','home_team','away_team','home_score','away_score'])
      if (entry[key] !== game[key]) throw unavailable('Quarter scores unavailable: game sources differ.');
    if (entry.status !== 'final' || !integer(entry.home_score) || !integer(entry.away_score) || entry.home_team === entry.away_team || entry.verification?.status !== 'verified' || entry.verification?.scoreCrosscheck !== 'verified') throw unavailable('Verified final quarter scores unavailable.');
    if (!/^assets\/data\/game-reports\/[A-Za-z0-9_-]+\.json$/.test(entry.detailUrl || '') || !validHash(entry.sha256) || !integer(entry.bytes) || !entry.bytes) throw new Error('Verified report checksum is unavailable.');
    return entry;
  }
  function extract(report, entry) {
    if (report?.schemaVersion !== 1 || !Array.isArray(report.sources) || !validTime(report.retrievedAt)) throw unavailable('Quarter score provenance unavailable.');
    for (const key of ['id','season','week','status','home_team','away_team','home_score','away_score'])
      if (report[key] !== entry[key]) throw unavailable('Quarter scores unavailable: report identity or final score differs.');
    if (report.verification?.status !== 'verified' || report.verification?.scoreCrosscheck !== 'verified' || report.verification?.quarterArithmetic !== 'verified' || report.provenance?.quarters?.status !== 'verified' || report.provenance?.quarters?.origin !== 'reported' || report.disagreements?.some(relevantField) || report.unavailable?.some(relevantField)) throw unavailable('Verified quarter scores unavailable.');
    const sourceIds = report.provenance.quarters.sourceIds;
    if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some(id => !report.sourceIds?.includes(id) || !report.sources.some(source => source.id === id && source.status === 'verified' && source.httpStatus === 200 && /^https:\/\//i.test(source.url || '') && validTime(source.retrievedAt) && validHash(source.sha256)))) throw unavailable('Quarter score source evidence unavailable.');
    const teams = [entry.home_team,entry.away_team], periods = teams.map(abbr => report.quarters?.[abbr]);
    if (periods.some(values => !Array.isArray(values) || values.length < 4 || values.length > 20 || !values.every(integer)) || periods[0].length !== periods[1].length) throw unavailable('Complete quarter scores unavailable.');
    if (periods.some((values,n) => values.reduce((total,value) => total+value,0) !== entry[n ? 'away_score' : 'home_score'])) throw unavailable('Quarter scores unavailable: totals do not reconcile.');
    return {id:entry.id,signature:signature(entry),hash:entry.sha256,home:entry.home_team,away:entry.away_team,quarters:Object.fromEntries(teams.map((abbr,n) => [abbr,[...periods[n]]])),totals:{[entry.home_team]:entry.home_score,[entry.away_team]:entry.away_score},retrievedAt:report.retrievedAt};
  }
  async function fetchReport(entry) {
    const shared = window.PDGameReport?.getCachedReport?.(entry.id);
    if (shared?.hash === entry.sha256) return shared.value;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch(entry.detailUrl,{cache:'no-cache',signal:controller.signal});
      if (!response.ok) throw new Error(`Quarter report returned HTTP ${response.status}.`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== entry.bytes) throw new Error('Quarter report byte count differs from the verified catalog.');
      if (!window.crypto?.subtle) throw new Error('Cryptographic report verification is unavailable.');
      const hash = [...new Uint8Array(await window.crypto.subtle.digest('SHA-256',bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
      if (hash !== entry.sha256.toLowerCase()) throw new Error('Quarter report checksum differs from the verified catalog.');
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally { clearTimeout(timeout); }
  }
  function schedule(state) {
    clearTimeout(state.timer);
    if (state.status !== 'error') return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (mounted(state.id)) {const before = state.status;load(state);if (!state.pending && before !== state.status) notify(state);}
    },Math.max(0,state.retryAt-Date.now()));
  }
  function load(state) {
    if (state.pending) return state.pending;
    const game = state.game, requestedSignature = signature(game);
    let entry;
    try { entry = entryFor(game,catalog()); }
    catch (error) {
      state.status = error.unavailable ? 'unavailable' : 'error'; state.error = error.message;
      state.retryAt = Date.now()+15000; schedule(state); return null;
    }
    if (state.value?.hash === entry.sha256 && state.value.signature === requestedSignature) {state.status = 'ready';state.error = null;clearTimeout(state.timer);return null;}
    if (state.unavailableHash === entry.sha256 && state.unavailableSignature === requestedSignature) return null;
    if (state.status === 'error' && state.requestHash === entry.sha256 && Date.now() < state.retryAt) {schedule(state);return null;}
    state.requestHash = entry.sha256;state.status = 'loading';clearTimeout(state.timer);
    const pending = (async () => {
      // A cache hit must yield before the finally block releases this lock.
      await Promise.resolve();
      try {
        const value = extract(await fetchReport(entry),entry);
        if (signature(state.game) !== requestedSignature) return;
        state.value = value;state.status = 'ready';state.error = null;state.failures = 0;state.unavailableHash = null;
      } catch (error) {
        if (signature(state.game) !== requestedSignature) return;
        state.status = error.unavailable ? 'unavailable' : 'error';state.error = error.message;
        if (error.unavailable) {state.unavailableHash = entry.sha256;state.unavailableSignature = requestedSignature;}
        else {state.failures++;state.retryAt = Date.now()+Math.min(300000,5000*3**Math.min(state.failures-1,4));}
      } finally {
        state.pending = null;schedule(state);notify(state);
      }
    })();
    state.pending = pending;return pending;
  }
  function render(game, teamAbbr) {
    const id = idOf(game), team = String(teamAbbr || '').toUpperCase();
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ![game?.home_team,game?.away_team].includes(team) || game?.status !== 'final') return '<p class="td-quarter-status" role="status">Quarter scores unavailable.</p>';
    let state = states.get(id);
    if (!state) {state = {id,game,value:null,pending:null,status:'idle',failures:0,retryAt:0};states.set(id,state);}
    state.game = game;
    if (state.value && state.value.signature !== signature(game)) state.value = null;
    load(state);
    const value = state.value, usable = value && state.status !== 'unavailable';
    let content;
    if (usable) {
      const teams = [team,team === value.home ? value.away : value.home], count = value.quarters[team].length;
      const columns = Array.from({length:count},(_,n) => n < 4 ? `Q${n+1}` : n === 4 ? 'OT' : `OT${n-3}`);
      content = `<table class="td-quarter-table"><caption class="sr-only">Quarter points</caption><thead><tr><th scope="col">Team</th>${columns.map(label => `<th scope="col">${label}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>${teams.map(abbr => `<tr><th scope="row">${escape(abbr)}</th>${value.quarters[abbr].map(points => `<td>${points}</td>`).join('')}<td>${value.totals[abbr]}</td></tr>`).join('')}</tbody></table>`;
      if (state.status !== 'ready') content += '<p class="td-quarter-status" role="status">Retained verified quarter scores. Retrying…</p>';
    } else content = `<p class="td-quarter-status" role="status">${state.status === 'loading' ? 'Loading quarter scores…' : state.status === 'error' ? 'Quarter scores unavailable. Retrying automatically…' : 'Quarter scores unavailable.'}</p>`;
    return `<section class="td-quarters" data-pd-quarter-game="${escape(id)}" data-quarter-status="${state.status}" aria-label="Quarter points"${state.status === 'loading' ? ' aria-busy="true"' : ''}>${content}</section>`;
  }
  function retryMounted() {
    if (document.hidden) return;
    for (const state of states.values()) if (mounted(state.id)) {state.retryAt = 0;const before = state.status;load(state);if (!state.pending && before !== state.status) notify(state);}
  }
  window.addEventListener('online',retryMounted);
  window.addEventListener('focus',retryMounted);
  document.addEventListener('visibilitychange',retryMounted);
  document.addEventListener('pd:team-data-ready',retryMounted);
  document.addEventListener('pd:game-report-data-ready',retryMounted);
  window.PDTeamQuarters = {render,getState:id => {const s = states.get(String(id));return s ? {status:s.status,retained:retained(s),hash:s.value?.hash || null,failures:s.failures,retryAt:s.retryAt,error:s.error || null} : null;}};
})();
