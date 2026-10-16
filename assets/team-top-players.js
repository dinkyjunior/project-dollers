(() => {
  'use strict';
  const URL = 'assets/data/team-top-players.json';
  const PHOTO_BASE = 'assets/team-player-photos-20261016/';
  const TEAM_CODES = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
  const LOCAL_PHOTOS = new Set(["8439", "12483", "14880", "15818", "15847", "15864", "16737", "16800", "2573401", "2576336", "2576925", "2576980", "2577417", "2578570", "2969939", "2972515", "2973405", "2976212", "2977187", "2991662", "3040151", "3042519", "3043078", "3045523", "3046439", "3046779", "3051876", "3051889", "3052587", "3054212", "3054850", "3116164", "3116165", "3116365", "3116389", "3117251", "3117256", "3121023", "3121422", "3122840", "3126486", "3139477", "3149687", "3912547", "3915416", "3915511", "3916148", "3916387", "3916433", "3917315", "3917792", "3918298", "3925357", "3929630", "3929645", "4032473", "4035538", "4035671", "4036131", "4036133", "4036378", "4037457", "4038441", "4038815", "4038941", "4040655", "4040715", "4047650", "4239934", "4239993", "4239996", "4240703", "4241389", "4241416", "4241457", "4241474", "4241478", "4241985", "4242335", "4242355", "4242512", "4243003", "4243331", "4248528", "4249836", "4258173", "4259545", "4262921", "4360248", "4360310", "4360423", "4360569", "4360689", "4360761", "4360763", "4360939", "4361050", "4361307", "4361370", "4361409", "4361411", "4361432", "4361496", "4361577", "4361579", "4361741", "4362238", "4362478", "4362619", "4362628", "4362921", "4366963", "4367209", "4371733", "4372016", "4373626", "4373678", "4374302", "4379399", "4384852", "4385690", "4426338", "4426348", "4426354", "4426386", "4426388", "4426502", "4426515", "4426844", "4427095", "4427366", "4427728", "4428331", "4428557", "4428718", "4428850", "4429013", "4429023", "4429025", "4429059", "4429086", "4429096", "4429160", "4429205", "4429501", "4429615", "4429676", "4429795", "4429835", "4430027", "4430539", "4430737", "4430807", "4430878", "4430968", "4431299", "4431431", "4431452", "4431459", "4431492", "4431545", "4431611", "4432577", "4432620", "4432665", "4432710", "4434153", "4567048", "4567750", "4568490", "4569173", "4569371", "4569559", "4569587", "4569603", "4569618", "4569987", "4572680", "4575131", "4576297", "4586312", "4595342", "4595348", "4596334", "4596448", "4596472", "4597500", "4599739", "4600981", "4601080", "4608686", "4608810", "4612826", "4635008", "4678008", "4682648", "4683062", "4683151", "4685247", "4685278", "4685382", "4685472", "4685512", "4685555", "4685702", "4685720", "4686422", "4686468", "4686612", "4686658", "4688380", "4688813", "4689114", "4695883", "4696044", "4696882", "4696981", "4697815", "4701936", "4702555", "4711533", "4715355", "4722893", "4819231", "4832800", "4832846", "4832955", "4837248", "4869645", "4869961", "4870653", "4870808", "4871023", "4879194", "4882093", "4883647", "4887558", "4890973", "4912274", "5081432", "5083076", "5083315", "5083754", "5344782"]);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const fmt = value => finite(value) ? value.toLocaleString('en-US') : '—';
  let feed = null, acceptedBytes = null, etag = null, pending = null, failure = null, checkedAt = 0, retryTimer = null, retryDelay = 15000;
  const visible = () => !document.hidden && !!document.querySelector('[data-page="team-details"].active [data-team-tab="players"][aria-selected="true"]');
  const safePhoto = value => {
    try { const url = new globalThis.URL(value); return url.protocol === 'https:' && ['static.www.nfl.com','static.clubs.nfl.com','a.espncdn.com','a1.espncdn.com','a2.espncdn.com','a3.espncdn.com','a4.espncdn.com'].includes(url.hostname) ? url.href : null; } catch { return null; }
  };
  function validate(value) {
    if (!value || !Number.isInteger(value.season) || !Number.isFinite(Date.parse(value.retrievedAt)) || !value.teams || Object.keys(value.teams).length !== 32 || TEAM_CODES.some(abbr => !value.teams[abbr]) || !Array.isArray(value.sources) || !value.sources.length) throw new Error('The top-player feed does not contain a complete validated league snapshot.');
    if (value.sources.some(source => source.status !== 'verified' || source.httpStatus !== 200 || !String(source.url || '').startsWith('https://') || !Number.isFinite(Date.parse(source.retrievedAt)) || !/^[a-f0-9]{64}$/i.test(source.sha256 || ''))) throw new Error('Player source retrieval evidence is unavailable.');
    for (const [abbr, club] of Object.entries(value.teams)) {
      if (!club || !Array.isArray(club.rushing) || !Array.isArray(club.receiving) || club.rushing.length < 1 || club.rushing.length > 4 || club.receiving.length < 1 || club.receiving.length > 4 || !club.quarterback || club.quarterback.position !== 'QB' || club.coverage?.status !== 'verified' || club.coverage.teamScoped !== true || club.coverage.season !== value.season || club.coverage.seasonType !== 'REG' || !Array.isArray(club.coverage.gameIds) || !club.coverage.gameIds.length) throw new Error('Invalid top-player team coverage.');
      for (const player of [club.quarterback, ...club.rushing, ...club.receiving].filter(Boolean)) {
        if (!player.id || !player.name || player.team !== abbr || !player.seasonStats || typeof player.seasonStats !== 'object' || !Array.isArray(player.gameIds) || !player.gameIds.length || player.gameIds.some(id => !club.coverage.gameIds.includes(id))) throw new Error('Invalid top-player identity or team-season totals.');
        for (const value of Object.values(player.seasonStats)) if (value !== null && !finite(value)) throw new Error('Invalid top-player statistic.');
      }
    }
    return value;
  }
  function notify() { window.dispatchEvent(new CustomEvent('pd:team-top-players-updated', {detail:{available:!!feed, retained:!!feed && !!failure, error:failure}})); }
  async function load(options = {}) {
    if (pending) return pending;
    if (!options.force && feed && Date.now() - checkedAt < 300000) return feed;
    pending = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      try {
        let changed = false;
        const recovering = !!failure;
        const response = await fetch(URL, {cache:'no-cache', headers:feed && etag ? {'If-None-Match':etag} : {}, signal:controller.signal});
        if (response.status === 304) { if (!feed) throw new Error('No retained player snapshot is available.'); }
        else {
          if (!response.ok) throw new Error(`Player source snapshot unavailable (HTTP ${response.status}).`);
          const bytes = await response.text(), next = validate(JSON.parse(bytes));
          if (feed && Date.parse(next.retrievedAt) < Date.parse(feed.retrievedAt)) throw new Error('Older player source snapshot refused; retained validated totals.');
          changed = bytes !== acceptedBytes;
          if (changed) { feed = next; acceptedBytes = bytes; }
          etag = response.headers.get('ETag');
        }
        checkedAt = Date.now(); failure = null; retryDelay = 15000; clearTimeout(retryTimer); if (changed || recovering) notify(); return feed;
      } catch (error) {
        failure = error.name === 'AbortError' ? 'Player source snapshot request timed out.' : error.message;
        clearTimeout(retryTimer); retryTimer = setTimeout(() => load({force:true}), retryDelay); retryDelay = Math.min(retryDelay * 2, 300000); notify(); return feed;
      } finally { clearTimeout(timeout); pending = null; }
    })();
    return pending;
  }
  function photo(player) {
    const id = /^\d+$/.test(String(player.espnId || '')) ? String(player.espnId) : null;
    const remote = safePhoto(player.headshotUrl);
    const local = id && LOCAL_PHOTOS.has(id) ? `${PHOTO_BASE}espn-${id}.png` : null;
    const source = local || remote;
    return `<span class="td-top-player-photo-wrap">${source ? `<img class="td-top-player-photo" src="${esc(source)}"${local && remote ? ` data-top-player-fallback="${esc(remote)}"` : ''} alt="${esc(player.name)}" width="48" height="48" loading="lazy" decoding="async">` : ''}<span class="td-top-player-photo-unavailable"${source ? ' hidden' : ''}>Photo unavailable</span></span>`;
  }
  function metric(value, label) { return `<span class="td-top-stat"><strong>${esc(value)}</strong><small>${esc(label)}</small></span>`; }
  function row(player, category) {
    const stats = player.seasonStats;
    const values = category === 'passing' ? [[`${fmt(stats.completions)}/${fmt(stats.attempts)}`,'COMP/ATT'],[fmt(stats.passingYards),'PASS YD'],[fmt(stats.passingTD),'TD'],[fmt(stats.interceptions),'INT']]
      : category === 'rushing' ? [[fmt(stats.carries),'CAR'],[fmt(stats.rushingYards),'RUSH YD'],[fmt(stats.rushingTD),'TD']]
      : [[fmt(stats.receptions),'REC'],[fmt(stats.receivingYards),'REC YD'],[fmt(stats.receivingTD),'TD']];
    const jersey = player.jersey ?? player.number;
    return `<li class="td-top-player" data-player-id="${esc(player.id)}">${photo(player)}<div class="td-top-player-copy"><strong class="td-top-player-name">${esc(player.name)}</strong><span class="td-top-player-meta">${esc([jersey !== null && jersey !== undefined && jersey !== '' ? `#${jersey}` : null, player.position].filter(Boolean).join(' · '))}</span></div><div class="td-top-player-stats">${values.map(([value,label]) => metric(value,label)).join('')}</div></li>`;
  }
  function group(players, category, heading, note) {
    return `<section class="td-top-player-group" data-category="${category}"><h3>${heading}${players.length && players.length < 4 ? ` · ${players.length} recorded` : ''}</h3>${players.length ? `<ol class="td-top-player-list">${players.map(player => row(player,category)).join('')}</ol>` : '<p class="td-empty">Verified team-season player totals are unavailable.</p>'}${note ? `<p class="td-top-player-note">${esc(note)}</p>` : ''}</section>`;
  }
  function render(team, dataset) {
    if (!feed && !pending) load();
    const abbr = typeof team === 'string' ? team : team?.abbr;
    const club = feed?.season === Number(dataset?.season) ? feed.teams[abbr] : null;
    if (!club) return `<section class="td-top-players"><h2>Top Players</h2><p class="td-empty">${failure ? 'Player totals are unavailable. Retrying automatically.' : feed ? 'Verified player totals are unavailable for this season.' : 'Loading verified team-season player totals…'}</p></section>`;
    return `<section class="td-top-players" data-top-player-season="${feed.season}"><section class="td-top-qb"><h3>Passing leader</h3>${club.quarterback ? `<ol class="td-top-player-list">${row(club.quarterback,'passing')}</ol>` : '<p class="td-empty">Verified quarterback totals are unavailable.</p>'}</section>${group(club.rushing,'rushing','Top rushers')}${group(club.receiving,'receiving','Top receivers')}<p class="td-top-player-coverage">${esc(feed.season)} season${club.coverage?.throughWeek ? ` · Stats through Week ${esc(club.coverage.throughWeek)}` : ''}${failure ? ' · Update failed; retained validated totals. Retrying automatically.' : ''}</p></section>`;
  }
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('.td-top-player-photo')) return;
    const fallback = safePhoto(image.dataset.topPlayerFallback);
    delete image.dataset.topPlayerFallback;
    if (fallback) { image.src = fallback; return; }
    image.hidden = true; const message = image.parentElement?.querySelector('.td-top-player-photo-unavailable'); if (message) message.hidden = false;
  }, true);
  window.PDTeamTopPlayers = {render, load, refresh:(force = false) => force || visible() ? load({force}) : Promise.resolve(feed), getDataset:() => feed};
  document.addEventListener('visibilitychange', () => { if (visible()) load(); });
  window.addEventListener('focus', () => { if (visible()) load(); });
  setInterval(() => { if (visible()) load(); }, 300000);
})();
