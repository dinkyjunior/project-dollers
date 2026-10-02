(() => {
  'use strict';
  const pages = [...document.querySelectorAll('.page')];
  const state = { week: null, conference: 'AFC', nflTab: 'ladder', teamTab: 'roster', filter: 'ALL', standingsExpanded: false, rosterExpanded: false, openPlayer: null, historyMode: 'recent', openGames: new Set(), seasonOpen: new Set() };
  let data = null, assets = { players: {}, logos: {} };
  let playerHistory = null, historyPromise = null, historyError = null, historyHash = null, updater = null, updateStatus = {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
  const available = value => value !== null && value !== undefined && value !== '';
  const number = (value, decimals) => available(value) && Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, decimals === undefined ? {} : { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';
  const logo = abbr => assets.logos?.[String(abbr).toLowerCase()]?.path || `assets/logos/${String(abbr).toLowerCase()}.png`;
  const teamName = abbr => data?.teamNames?.[abbr] || data?.teams?.find?.(team => team.abbr === abbr)?.name || abbr;
  const seasonLabel = () => `${data.season} regular season`;
  const timestamp = value => value ? new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }) : 'Unavailable';
  const date = game => {
    if (game.kickoffUtc) return new Date(game.kickoffUtc).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
    return game.gameday ? new Date(`${game.gameday}T12:00:00Z`).toLocaleDateString(undefined, { timeZone:'UTC', weekday:'short', month:'short', day:'numeric' }) : 'Date unavailable';
  };
  const time = game => game.kickoffUtc ? new Date(game.kickoffUtc).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit', timeZoneName:'short' }) : 'Kickoff unavailable';
  const sourceNote = (group, context) => {
    const aliases = {leaders:'weeklyLeaders',allowances:'opponentAllowances',history:'historicalMatchups'};
    const provenance = data.provenance?.[aliases[group] || group];
    const ids = provenance?.sourceIds || [];
    const names = ids.map(id => data.sources.find(source => source.id === id)?.name || id.replace(/^nflverse_/, 'nflverse · ').replaceAll('_', ' '));
    return `<p class="source-note">${esc(context || `${provenance?.season || data.season} · through Week ${provenance?.throughWeek ?? data.throughWeek}`)} · ${esc(names.join(', ') || 'nflverse')}<br>Retrieved ${esc(timestamp(data.retrievedAt))}</p>`;
  };
  function openPage(id, writeHash = true) {
    if (!pages.some(page => page.dataset.page === id)) id = 'home';
    const changed = document.querySelector('.page.active')?.dataset.page !== id;
    pages.forEach(page => {
      const active = page.dataset.page === id;
      page.classList.toggle('active', active); page.hidden = !active;
      if (active && changed) page.querySelector('.page-scroll').scrollTop = 0;
    });
    document.querySelectorAll('[data-nav]').forEach(button => {
      if (button.dataset.nav === (id === 'steelers' ? 'nfl' : id)) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (writeHash && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  }
  function selectTab(type, value) {
    document.querySelectorAll(`[data-${type}-tab]`).forEach(tab => {
      const active = tab.dataset[`${type}Tab`] === value;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !active;
    });
    state[`${type}Tab`] = value;
  }
  document.querySelectorAll('[role=tablist]').forEach(list => list.addEventListener('keydown', event => {
    const tabs = [...list.querySelectorAll('[role=tab]')], index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  }));
  function leaderboard(snapshot) {
    return ['QB','RB'].map(position => {
      const players = snapshot.leaders?.[position] || [];
      return `<section class="leader-panel"><h2>TOP 5 ${position}s <span>(WK ${snapshot.leadersWeek ?? snapshot.throughWeek})</span></h2><div class="leader-columns"><span>PLAYER</span><span>YDS</span><span>TD</span></div>${players.length ? players.map((player,index) => `<div class="leader-row"><b>${index+1}</b><span title="${esc(player.name)}">${esc(player.short || player.name)}</span><span>${number(player.yards)}</span><span>${number(player.td)}</span></div>`).join('') : '<p class="section-note">Verified leaders unavailable for this week.</p>'}</section>`;
    }).join('');
  }
  function gameStatus(game) {
    if (game.status === 'final') return 'FINAL';
    if (game.kickoffUtc && new Date(game.kickoffUtc).getTime() <= Date.now()) return 'AWAITING RESULT';
    return 'UPCOMING';
  }
  function matchup(game, link = true) {
    if (!game) return `<div class="bye-card"><img src="${esc(logo('pit'))}" alt="Steelers"><div><strong>No Steelers fixture this week</strong><p>Week ${esc(state.week)} · ${data.season}</p></div></div>`;
    const opponent = game.home_team === 'PIT' ? game.away_team : game.home_team;
    const ownRecord = game.home_team === 'PIT' ? game.home_record : game.away_record;
    const opponentRecord = game.home_team === 'PIT' ? game.away_record : game.home_record;
    const home = game.home_team === 'PIT';
    const status = gameStatus(game);
    const ownScore = home ? game.home_score : game.away_score, opponentScore = home ? game.away_score : game.home_score;
    const details = game.status === 'final' ? `<strong>${number(ownScore)} <span class="versus">–</span> ${number(opponentScore)}</strong><span>FINAL · ${esc(date(game))}</span>` : `<strong>${esc(date(game))}</strong><span>${esc(time(game))}</span>`;
    const tag = link ? 'button' : 'div';
    return `<${tag} class="game-card" ${link ? 'data-open="steelers" data-matchup-entry aria-label="Explore Steelers matchup research"' : ''}><span class="game-team"><img src="${esc(logo('pit'))}" alt="Pittsburgh Steelers" width="500" height="500" decoding="async"><strong>Steelers</strong><small>${esc(ownRecord || '—')} · ${home ? 'HOME' : 'AWAY'}</small></span><span class="game-center"><span class="fixture-week">WK ${game.week} · ${game.season} · ${status}</span>${details}<small>${esc(game.venue || 'Venue unavailable')}</small></span><span class="game-team"><img src="${esc(logo(opponent))}" alt="${esc(teamName(opponent))}" width="500" height="500" decoding="async"><strong>${esc(teamName(opponent))}</strong><small>${esc(opponentRecord || '—')} · ${home ? 'AWAY' : 'HOME'}</small></span></${tag}>`;
  }
  function recap(snapshot) {
    const games = snapshot.recap || [];
    const players = ['QB','RB'].map(position => {
      const player = snapshot.leaders?.[position]?.[0];
      return player ? `<div class="recap-stat"><span>${position === 'QB' ? 'PASSING' : 'RUSHING'} LEADER</span><strong>${esc(player.name)}</strong><b>${number(player.yards)}<small> YDS</small></b><p>${number(player.td)} touchdowns · Week ${snapshot.leadersWeek ?? snapshot.throughWeek}</p></div>` : '';
    }).join('');
    const recapWeek = snapshot.recapWeek ?? snapshot.leadersWeek ?? snapshot.throughWeek;
    const note = Number(state.week) - 1 !== recapWeek ? `<p class="section-note">Latest verified recap: Week ${recapWeek}. Results for Week ${Number(state.week)-1} are not yet available.</p>` : '';
    return `${note}${players}${games.length ? `<section class="research-panel"><h3>Week ${snapshot.leadersWeek ?? snapshot.throughWeek} results</h3>${games.map(game => `<div class="recap-game"><span>${esc(teamName(game.away_team))} @ ${esc(teamName(game.home_team))}</span><b>${number(game.away_score)}–${number(game.home_score)}</b></div>`).join('')}</section>` : `<p class="section-note">No verified results are available for the recap week.</p>`}${sourceNote('leaders', `${data.season} · Week ${snapshot.leadersWeek ?? snapshot.throughWeek}`)}`;
  }
  function renderDashboard() {
    const snapshot = data.weeks[state.week];
    $('week-select').value = state.week;
    document.querySelectorAll('[data-week]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.week === state.week)));
    document.querySelectorAll('[data-conference]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.conference === state.conference)));
    const all = snapshot.conferences[state.conference] || [];
    const compact = state.conference === 'AFC' ? ['KC','BUF','PIT','BAL','HOU'] : ['PHI','DET','SF','GB','DAL'];
    const teams = state.standingsExpanded ? all : all.filter(team => compact.includes(team.abbr || team.id.toUpperCase()));
    $('table-caption').textContent = `${state.conference} ${state.standingsExpanded ? 'CONFERENCE' : 'FEATURED TEAMS'}`;
    document.querySelector('.through-week').textContent = `THROUGH WK ${snapshot.throughWeek}`;
    $('standings-rows').innerHTML = teams.map(team => `<div class="stand-row${team.id === 'pit' ? ' steelers-row' : ''}" role="row"><span role="cell">${available(team.rank) ? esc(team.rank) : '—'}</span><span class="table-team" role="cell">${team.id === 'pit' ? '<button class="team-link" data-open="steelers" aria-label="Explore Pittsburgh Steelers roster">' : ''}<img src="${esc(logo(team.id))}" alt="" width="500" height="500" decoding="async"><span>${esc(team.name)}</span>${team.id === 'pit' ? '</button>' : ''}</span><span role="cell">${team.w}</span><span role="cell" title="${team.ties || 0} ties">${team.l}${team.ties ? `<small class="tie-mark">+${team.ties}T</small>` : ''}</span><span role="cell">${esc(team.pct)}</span><span class="streak ${team.streak?.startsWith('W') ? 'win' : team.streak?.startsWith('L') ? 'loss' : ''}" role="cell">${esc(team.streak || '—')}</span></div>`).join('');
    const toggle = document.querySelector('[data-standings-toggle]');
    toggle.textContent = state.standingsExpanded ? 'Featured teams' : `All ${all.length} teams`;
    toggle.setAttribute('aria-expanded',String(state.standingsExpanded));
    $('ladder-leaders').innerHTML = leaderboard(snapshot);
    $('players-leaders').innerHTML = leaderboard(snapshot) + sourceNote('leaders', `${data.season} · Week ${snapshot.leadersWeek ?? snapshot.throughWeek} · yards leaders`);
    $('featured-matchup').innerHTML = matchup(snapshot.fixture);
    $('fixture-context').textContent = `${data.season} · WEEK ${state.week}`;
    $('recap-title').textContent = `Week ${snapshot.leadersWeek ?? snapshot.throughWeek} in numbers`;
    $('recap-content').innerHTML = recap(snapshot);
  }
  function playerDetails(player) {
    return window.PDPlayerResearch.render(player, {data,state,history:playerHistory,error:historyError,loading:!!historyPromise,logo,teamName,metric,sourceNote});
  }
  function preserveScroll(render) {
    const positions = [...document.querySelectorAll('.page-scroll')].map(node => [node,node.scrollTop]);
    const focused = document.activeElement;
    const card = focused?.closest?.('[data-player-id]');
    let selector = null;
    if (focused?.id) selector = `#${CSS.escape(focused.id)}`;
    else if (focused?.matches?.('[data-history-week]') && card) selector = `[data-player-id="${CSS.escape(card.dataset.playerId)}"] [data-history-week]`;
    else if (focused?.dataset?.historyMode) selector = `[data-history-mode="${CSS.escape(focused.dataset.historyMode)}"]`;
    else if (focused?.dataset?.player) selector = `[data-player="${CSS.escape(focused.dataset.player)}"]`;
    else if (focused?.matches?.('summary')) {
      const detail = focused.parentElement;
      if (detail.dataset.extraGame) selector = `[data-extra-player="${CSS.escape(detail.dataset.extraPlayer)}"][data-extra-game="${CSS.escape(detail.dataset.extraGame)}"] > summary`;
      else if (detail.dataset.gameId) selector = `[data-game-player="${CSS.escape(detail.dataset.gamePlayer)}"][data-game-id="${CSS.escape(detail.dataset.gameId)}"] > summary`;
      else if (detail.dataset.seasonPlayer) selector = `[data-season-player="${CSS.escape(detail.dataset.seasonPlayer)}"] > summary`;
    } else if (focused?.matches?.('[data-refresh]')) selector = '[data-refresh]';
    else if (focused?.matches?.('[data-sources]')) selector = '[data-sources]';
    else if (focused?.closest?.('#sources-content') && focused.matches('a[href]')) selector = `#sources-content a[href="${CSS.escape(focused.getAttribute('href'))}"]`;
    render();
    positions.forEach(([node,top]) => { node.scrollTop = top; });
    if (selector && !focused.isConnected) document.querySelector(selector)?.focus({preventScroll:true});
  }
  async function loadHistory(force = false) {
    if (historyPromise) return historyPromise;
    const summary = data?.playerHistory;
    if (!force && playerHistory && historyHash === summary?.sha256) return playerHistory;
    historyError = null;
    const snapshot = data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),20000);
    historyPromise = (async () => {
      await Promise.resolve();
      try {
        if (!summary?.path || !/^[a-f0-9]{64}$/.test(summary.sha256)) throw new Error('Verified history metadata unavailable');
        const url = new URL(summary.path,document.baseURI);
        if (url.origin !== location.origin || !url.pathname.includes('/assets/data/')) throw new Error('History path invalid');
        const response = await fetch(url.href,{cache:'no-cache',signal:controller.signal});
        if (!response.ok) throw new Error('History unavailable');
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
        if (digest !== summary.sha256) throw new Error('History checksum does not match the verified snapshot');
        const bundle = JSON.parse(new TextDecoder().decode(bytes));
        if (bundle.schemaVersion !== 1 || bundle.season !== snapshot.season || !bundle.players || !Array.isArray(bundle.sources)) throw new Error('History schema invalid');
        if (Object.entries(summary.currentSourceHashes || {}).some(([id,hash]) => bundle.currentSourceHashes?.[id] !== hash)) throw new Error('History source versions do not match');
        if (data.playerHistory?.sha256 !== summary.sha256) return null;
        playerHistory = bundle; historyHash = summary.sha256; window.PD_HISTORY = bundle;
        return bundle;
      } catch (error) {
        if (data.playerHistory?.sha256 === summary?.sha256) historyError = error.message;
        return null;
      } finally {
        clearTimeout(timeout);
        historyPromise = null;
        preserveScroll(() => { renderRoster(); renderSources(); });
        if (data.playerHistory?.sha256 !== summary?.sha256 && state.openPlayer) queueMicrotask(() => loadHistory());
      }
    })();
    preserveScroll(renderRoster);
    return historyPromise;
  }
  function changeWeek(week) {
    if (!data?.weeks[week]) return;
    state.week = String(week);
    preserveScroll(() => { renderDashboard(); renderRoster(); renderTeamMatchup(); });
  }
  function renderRoster() {
    const all = data.roster.filter(player => player.rosterStatus !== 'Cut');
    const selected = state.filter === 'ALL' ? all : all.filter(player => (player.filterGroup || player.position) === state.filter);
    const shown = state.filter === 'ALL' && !state.rosterExpanded ? selected.filter(player => player.featured) : selected;
    $('roster').innerHTML = shown.map((player,index) => {
      const photo = assets.players?.[player.id];
      const role = player.depth?.label && player.depth.label !== 'Unavailable' ? player.depth.label : player.rosterStatus;
      const stats = player.stats || Array.from({length:4}, () => ({ label:'UNAVAILABLE', value:null }));
      return `<article class="player-card${state.openPlayer === player.id ? ' is-expanded' : ''}" data-position="${esc(player.filterGroup || player.position)}" data-player-id="${esc(player.id)}" style="--orbit-delay: -${(index % 5) * 1.8}s" aria-label="${esc(player.name)}, ${esc(player.position)}"><span class="orbit-football" aria-hidden="true"></span><div class="portrait">${photo?.path ? `<img src="${esc(photo.path)}" alt="${esc(player.name)}" width="${photo.width}" height="${photo.height}" loading="${index < 5 ? 'eager' : 'lazy'}" decoding="async">` : '<span class="photo-unavailable">PHOTO<br>UNAVAILABLE</span>'}</div><div class="player-info"><h2><span class="jersey">#${esc(player.number || '—')}</span><span class="player-name">${esc(player.name)}</span></h2><p>${esc(player.position)} <span>· ${esc(role || 'Depth unavailable')}</span></p><div class="player-stats">${stats.slice(0,4).map(stat => `<div><b>${available(stat.value) ? esc(stat.value) : '—'}</b><span>${esc(stat.label)}</span></div>`).join('')}</div></div>${icon('chevron').replace('class="icon"','class="icon card-chevron"')}<button class="player-expander" data-player="${esc(player.id)}" aria-label="${state.openPlayer === player.id ? 'Close' : 'Show'} ${esc(player.name)} research" aria-controls="player-detail-${esc(player.id)}" aria-expanded="${state.openPlayer === player.id}"></button>${playerDetails(player)}</article>`;
    }).join('');
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.filter === state.filter)));
    $('empty-roster').hidden = shown.length > 0;
    const toggle = document.querySelector('[data-roster-toggle]');
    toggle.hidden = state.filter !== 'ALL';
    toggle.textContent = state.rosterExpanded ? 'Show featured players' : `Show complete roster · ${all.length} players`;
    toggle.setAttribute('aria-expanded',String(state.rosterExpanded));
    document.querySelector('.roster-heading').innerHTML = `<span>${state.filter === 'ALL' && !state.rosterExpanded ? 'FEATURED PLAYERS' : `${shown.length} ${state.filter === 'ALL' ? 'ROSTER' : state.filter} PLAYERS`}</span><span>${data.season} · WK 1–${data.provenance?.playerStats?.throughWeek ?? data.throughWeek}</span>`;
    $('roster-note').innerHTML = `${data.season} season totals · tap a card for research<br>Depth chart: ${esc(timestamp(data.roster.find(player => player.depth?.sourceTimestamp)?.depth?.sourceTimestamp))} · <button data-sources>Sources</button>`;
  }
  function metric(label,value,suffix='',decimals) {
    return `<div class="metric"><b>${number(value,decimals)}${available(value) ? esc(suffix) : ''}</b><span>${esc(label)}</span></div>`;
  }
  function resultStrip(games) {
    if (!games?.length) return '<p class="unavailable">Recent results unavailable.</p>';
    return `<div class="result-strip">${games.map(game => {
      const ownHome = game.home_team === 'PIT';
      const own = ownHome ? game.home_score : game.away_score, other = ownHome ? game.away_score : game.home_score;
      const win = own > other, tie = own === other;
      return `<div class="result-chip ${win ? 'win' : tie ? '' : 'loss'}"><b>${win ? 'W' : tie ? 'T' : 'L'} ${own}–${other}</b><span>WK ${game.week} · ${esc(ownHome ? game.away_team : game.home_team)}</span></div>`;
    }).join('')}</div>`;
  }
  function renderSchedule() {
    $('schedule-title').textContent = `${data.season} · Steelers schedule`;
    $('schedule-list').innerHTML = data.steelers.schedule.map(game => {
      const home = game.home_team === 'PIT', opponent = home ? game.away_team : game.home_team;
      const own = home ? game.home_score : game.away_score, other = home ? game.away_score : game.home_score;
      const result = game.status === 'final' ? `${own > other ? 'W' : own === other ? 'T' : 'L'} ${own}–${other}` : time(game);
      return `<div class="schedule-row"><span class="schedule-week">WK ${game.week}</span><img src="${esc(logo(opponent))}" alt="${esc(teamName(opponent))}" width="500" height="500" loading="lazy" decoding="async"><div><strong>${home ? 'vs' : '@'} ${esc(teamName(opponent))}</strong><span>${esc(date(game))}</span></div><div class="schedule-result"><b>${esc(result)}</b><small>${esc(game.status === 'final' ? 'FINAL' : game.venue || 'Venue unavailable')}</small></div></div>`;
    }).join('') + sourceNote('schedule',`${data.season} regular season · local kickoff time`);
  }
  function renderTeamStats() {
    const stats = data.steelers.teamStats || {}, record = data.steelers.record || {};
    const injuries = data.steelers.injuries || [];
    $('team-stats-content').innerHTML = `<h2 class="panel-title">${data.season} · through Week ${stats.throughWeek ?? data.throughWeek}</h2><section class="research-panel"><h3>Steelers · ${record.w ?? '—'}–${record.l ?? '—'}${record.ties ? `–${record.ties}` : ''}</h3><p class="source-note">Record through Week ${data.throughWeek} · statistics through Week ${stats.throughWeek ?? data.throughWeek}</p><div class="metric-grid">${metric('POINTS / GAME',stats.pointsPerGame,'',1)}${metric('POINTS ALLOWED / GAME',stats.pointsAllowedPerGame,'',1)}${metric('NET PASS YDS / GAME',available(stats.netPassingYards) && stats.games ? stats.netPassingYards / stats.games : null,'',1)}${metric('RUSH YDS / GAME',stats.rushingYardsPerGame,'',1)}${metric('GROSS PASS YARDS',stats.passingYards)}${metric('SEASON RUSH YARDS',stats.rushingYards)}${metric('TOTAL YDS / GAME',stats.totalYardsPerGame,'',1)}${metric('COMPLETION %',stats.completionPct,'',1)}</div>${sourceNote('teamStats')}</section><section class="research-panel"><h3>Last ${data.steelers.last5?.length || 0} results</h3>${resultStrip(data.steelers.last5)}${sourceNote('standings')}</section><section class="research-panel"><h3>Week ${data.currentWeek} · injury &amp; practice report</h3>${injuries.length ? `<table class="compact-table"><thead><tr><th>PLAYER</th><th>PRACTICE</th><th>GAME</th></tr></thead><tbody>${injuries.map(injury => `<tr><td>${esc(injury.name || injury.fullName || injury.full_name)}<br><span class="source-note">${esc(injury.injury || 'Injury detail unavailable')}</span></td><td>${esc(injury.practiceStatus || 'Unavailable')}</td><td>${esc(injury.reportStatus || 'Unavailable')}</td></tr>`).join('')}</tbody></table>` : '<p class="unavailable">Verified injury report unavailable.</p>'}<p class="source-note">A missing game designation does not establish availability. Inactives are unavailable until an official list is verified.</p>${sourceNote('injuries',`${data.season} · Week ${data.currentWeek}`)}</section>`;
  }
  function renderTeamMatchup() {
    const game = data.weeks[state.week]?.fixture || null;
    const opponent = game ? (game.home_team === 'PIT' ? game.away_team : game.home_team) : null;
    const research = data.steelers.matchupsByOpponent?.[opponent] || (data.steelers.matchup?.opponent === opponent ? data.steelers.matchup : {opponent});
    $('matchup-title').textContent = game ? `Steelers ${game.home_team === 'PIT' ? 'vs' : '@'} ${teamName(research.opponent || (game.home_team === 'PIT' ? game.away_team : game.home_team))}` : 'Steelers matchup research';
    $('team-matchup').innerHTML = matchup(game,false);
    const allowances = research.allowances || {};
    const context = game ? `${game.season} · Week ${game.week} · ${game.home_team === 'PIT' ? 'Home' : 'Away'}` : seasonLabel();
    const allowanceRows = ['QB','RB','WR','TE'].filter(position => allowances[position]);
    const gameHistory = research.last5 || [];
    const home = game?.home_team === 'PIT';
    const ownRest = game ? (home ? game.homeRest : game.awayRest) : null;
    const otherRest = game ? (home ? game.awayRest : game.homeRest) : null;
    $('matchup-research').innerHTML = `<section class="research-panel"><h3>Game context</h3><p>${esc(game?.venue || 'Venue unavailable')} · ${esc(context)}</p><div class="metric-grid">${metric('STEELERS REST',ownRest,' days')}${metric('OPPONENT REST',otherRest,' days')}</div><p class="source-note">Rest is calculated between scheduled game dates. Travel distance and itinerary are unavailable.</p><p>Weather: <span class="unavailable">Forecast unavailable</span></p>${sourceNote('schedule',context)}</section><section class="research-panel"><h3>${esc(teamName(research.opponent || 'Opponent'))} · positional allowance</h3>${allowanceRows.length ? `<table class="compact-table"><thead><tr><th>POS</th><th>YDS / G</th><th>REC / G</th><th>TD / G</th></tr></thead><tbody>${allowanceRows.map(position => {
      const entry = allowances[position];
      const yards = position === 'QB' ? entry.passingYardsAllowedPerGame : position === 'RB' ? entry.rushingYardsAllowedPerGame : entry.receivingYardsAllowedPerGame;
      return `<tr><td>${position}</td><td>${number(yards,1)}</td><td>${number(entry.receptionsAllowedPerGame,1)}</td><td>${number(entry.tdAllowedPerGame,2)}</td></tr>`;
    }).join('')}</tbody></table><p class="source-note">QB: passing yards · RB: rushing yards · WR/TE: receiving yards. TD includes passing, rushing and receiving by the listed position; per ${allowances.QB?.games ?? 'available'} completed opponent games.</p>` : '<p class="unavailable">Verified positional allowance unavailable.</p>'}${sourceNote('allowances',`${data.season} · ${teamName(opponent || 'Opponent')} · through Week ${research.throughWeek ?? data.provenance?.opponentAllowances?.throughWeek ?? data.throughWeek}`)}</section><section class="research-panel"><h3>Previous meetings</h3>${gameHistory.length ? `<table class="compact-table"><thead><tr><th>DATE</th><th>AWAY</th><th>HOME</th></tr></thead><tbody>${gameHistory.map(meeting => `<tr><td>${esc(meeting.gameday)}</td><td>${esc(meeting.away_team)} ${number(meeting.away_score)}</td><td>${esc(meeting.home_team)} ${number(meeting.home_score)}</td></tr>`).join('')}</tbody></table>` : '<p class="unavailable">Previous meetings unavailable.</p>'}${sourceNote('history','Historical final scores')}</section><section class="research-panel"><h3>Historical pre-game prices</h3><p class="unavailable">Verified pre-game head-to-head prices with provider and capture time are unavailable.</p><p class="source-note">Unattributed archival lines are excluded from the interface.</p></section>`;
  }
  function renderSources() {
    const provenance = Object.entries(data.provenance || {});
    const sources = [...(data.sources || []),...(playerHistory?.sources || []).filter(source=>!data.sources.some(existing=>existing.id === source.id))];
    const labels = { standings:'Conference records',weeklyLeaders:'Weekly leaders',roster:'Current roster',playerStats:'Player statistics',teamStats:'Team statistics',schedule:'Schedule & results',depthChart:'Depth chart',injuries:'Injury & practice reports',opponentAllowances:'Opponent positional allowance',historicalMatchups:'Previous meetings',weatherForecast:'Weather forecast',historicalPrices:'Archival lines (provider/time unavailable)' };
    $('sources-content').innerHTML = `<p>${esc(data.context?.label || seasonLabel())}<br>Retrieved ${esc(timestamp(data.retrievedAt))}</p><p>Records and totals are calculated from sourced scores and statistics. Conference rows are sorted by win percentage; official playoff seeds and tie-break rankings are not asserted.</p><p>The app checks for newly published verified data when opened, resumed or reconnected, and while active. Repository source checks adapt to game windows. Player statistics follow the provider’s post-game release and correction schedule; this is not live play-by-play. An authorised push feed is not connected.</p><div class="coverage-list">${provenance.map(([key,entry]) => `<div><b>${esc(labels[key] || key.replace(/([A-Z])/g,' $1'))}</b><span class="coverage-${esc(entry.status)}">${esc(entry.status)}</span><p>${esc(key === 'weatherForecast' ? 'No verified current forecast is available.' : key === 'crossChecks' ? 'Dataset consistency checks passed. Independent official/provider confirmation is unavailable.' : entry.note || '')}</p></div>`).join('')}</div><p>Official-team and second-provider cross-checks were unavailable where access was denied. Missing injury designations are not treated as healthy status.</p><ul class="source-list">${sources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name || source.id.replaceAll('_',' '))}</a><br>${esc(source.status)} · ${esc(timestamp(source.retrievedAt))}</li>`).join('')}</ul>`;
  }
  function freshness() {
    if (!data) return;
    const age = Math.max(0,Date.now() - new Date(data.retrievedAt).getTime());
    const stale = age > 12 * 60 * 60 * 1000 || data.context?.isCurrent === false;
    const note = $('data-status');
    note.classList.toggle('is-stale',stale);
    const checking = updateStatus.state === 'checking';
    note.innerHTML = `<span>${checking ? 'Checking for updates' : updateStatus.state === 'error' ? 'Retained verified data' : stale ? 'Snapshot may be stale' : 'Verified snapshot'} · ${esc(timestamp(data.retrievedAt))}</span><span class="update-actions"><button data-refresh aria-label="Refresh verified data" aria-busy="${checking}" aria-disabled="${checking}">↻</button><button data-sources>Sources</button></span>`;
    note.title = updateStatus.state === 'error' ? 'The latest update check failed. The last verified snapshot remains available.' : stale ? 'The verified source snapshot may be stale. Check sources before relying on it.' : updateStatus.lastCheckedAt ? `Automatically checked ${timestamp(updateStatus.lastCheckedAt)}. Source publication time is shown separately.` : 'Automatic checks on open, return to the app and reconnect.';
    window.PD_UPDATE_STATUS = updateStatus;
  }
  function renderAll() {
    $('season-context').textContent = `${data.season} REGULAR SEASON`;
    const record = data.steelers.record;
    $('team-context').innerHTML = `${data.season} · CURRENT ROSTER <span>${record.w}–${record.l}${record.ties ? `–${record.ties}` : ''} · THROUGH WEEK ${data.throughWeek}</span>`;
    const weeks = Object.keys(data.weeks).sort((a,b) => Number(a)-Number(b));
    $('week-select').innerHTML = weeks.map(week => `<option value="${week}">Week ${week}${Number(week) === data.currentWeek ? ' · Current' : ''}</option>`).join('');
    $('week-select').disabled = false;
    const nearby = weeks.filter(week => Number(week) >= data.currentWeek - 2 && Number(week) <= data.currentWeek + 1);
    document.querySelector('.week-row').innerHTML = nearby.map(week => `<button data-week="${week}" aria-pressed="${week === state.week}">WEEK ${week}</button>`).join('');
    renderDashboard(); renderRoster(); renderSchedule(); renderTeamStats(); renderTeamMatchup(); renderSources(); freshness();
    document.documentElement.dataset.dataReady = 'true';
    document.dispatchEvent(new CustomEvent('pd:data-ready'));
  }
  function applySnapshot(snapshot) {
    const previous = data;
    const previousWeek = state.week;
    const previousPlayer = state.openPlayer;
    const oldHistoryHash = data?.playerHistory?.sha256;
    try {
      data = snapshot;
      if (!data.weeks[state.week]) state.week = String(data.currentWeek);
      if (state.openPlayer && !data.roster.some(player => player.id === state.openPlayer)) state.openPlayer = null;
      preserveScroll(renderAll);
      window.PD_DATA = data;
    } catch (error) {
      data = previous; state.week = previousWeek; state.openPlayer = previousPlayer;
      window.PD_DATA = previous;
      if (previous) preserveScroll(renderAll);
      throw error;
    }
    if (oldHistoryHash !== data.playerHistory?.sha256) historyError = null;
    if (state.openPlayer && historyHash !== data.playerHistory?.sha256) loadHistory();
  }
  function startUpdates() {
    updater?.stop();
    updater = window.PDDataUpdates.start({
      getSnapshot:() => data,
      onSnapshot:applySnapshot,
      onStatus:status => { updateStatus = status; preserveScroll(freshness); document.dispatchEvent(new CustomEvent('pd:update-status',{detail:status})); },
      checkOnStart:false
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.open) {
      openPage(button.dataset.open);
      if (button.hasAttribute('data-matchup-entry')) selectTab('team','matchups');
      else if (button.dataset.open === 'steelers') selectTab('team','roster');
    }
    if (button.dataset.nflTab) selectTab('nfl',button.dataset.nflTab);
    if (button.dataset.teamTab) selectTab('team',button.dataset.teamTab);
    if (button.hasAttribute('data-more')) $('about-dialog').showModal();
    if (button.hasAttribute('data-sources')) $('sources-dialog').showModal();
    if (button.hasAttribute('data-retry')) loadData();
    if (button.hasAttribute('data-refresh') && updateStatus.state !== 'checking') updater?.refresh('manual',{force:true});
    if (button.hasAttribute('data-history-retry')) loadHistory(true);
    if (!data) return;
    if (button.dataset.conference) { state.conference = button.dataset.conference; renderDashboard(); }
    if (button.dataset.week) changeWeek(button.dataset.week);
    if (button.dataset.historyMode) { state.historyMode = button.dataset.historyMode; preserveScroll(renderRoster); }
    if (button.hasAttribute('data-standings-toggle')) { state.standingsExpanded = !state.standingsExpanded; renderDashboard(); }
    if (button.hasAttribute('data-roster-toggle')) { state.rosterExpanded = !state.rosterExpanded; state.openPlayer = null; renderRoster(); }
    if (button.dataset.filter) { state.filter = button.dataset.filter; state.openPlayer = null; renderRoster(); }
    if (button.dataset.player) {
      const id = button.dataset.player;
      state.openPlayer = state.openPlayer === id ? null : id;
      preserveScroll(renderRoster);
      document.querySelector(`[data-player="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
      if (state.openPlayer) loadHistory();
    }
    if (button.dataset.shortcut) {
      if (button.dataset.shortcut === 'matchups') { openPage('steelers'); selectTab('team','matchups'); }
      else { openPage('nfl'); selectTab('nfl','players'); }
    }
  });
  $('week-select').addEventListener('change',event => changeWeek(event.target.value));
  document.addEventListener('change',event => { if (event.target.matches('[data-history-week]')) changeWeek(event.target.value); });
  document.addEventListener('toggle',event => {
    const game = event.target;
    if (!game.isConnected) return;
    if (game.matches('.additional-statistics')) {
      const key = `${game.dataset.extraPlayer}:${game.dataset.extraGame}:extra`;
      if (game.open) state.openGames.add(key); else state.openGames.delete(key);
      return;
    }
    if (game.matches('.season-overview')) {
      if (game.open) state.seasonOpen.add(game.dataset.seasonPlayer); else state.seasonOpen.delete(game.dataset.seasonPlayer);
      return;
    }
    if (!game.matches('.game-breakdown')) return;
    const key = `${game.dataset.gamePlayer}:${game.dataset.gameId}`;
    if (game.open) state.openGames.add(key); else state.openGames.delete(key);
  },true);
  window.addEventListener('popstate',() => openPage(location.hash.slice(1),false));
  window.addEventListener('hashchange',() => openPage(location.hash.slice(1),false));
  async function loadData() {
    if (data && updater) return updater.refresh('retry',{force:true});
    try {
      const responses = await Promise.all([fetch('assets/data/current.json',{cache:'no-cache'}),fetch('assets/player-assets.json')]);
      if (!responses.every(response => response.ok)) throw new Error('Local feed unavailable');
      const [snapshot,mapping] = await Promise.all(responses.map(response => response.json()));
      if (snapshot.schemaVersion !== 1 || !snapshot.roster?.length || !snapshot.weeks?.[snapshot.currentWeek] || !snapshot.retrievedAt) throw new Error('Local feed invalid');
      assets=mapping; applySnapshot(snapshot); startUpdates();
    } catch (error) {
      $('data-status').innerHTML='<span>Verified data unavailable</span><button data-retry>Retry</button>';
      $('roster').innerHTML='<p class="notice">The verified feed could not load. No statistics are being substituted.</p>';
      $('sources-content').innerHTML='<p>The verified feed could not load. Retry to restore data and its source information.</p>';
      $('featured-matchup').innerHTML='<p class="notice">The verified feed could not load. Try again when a connection is available.</p>';
      document.documentElement.dataset.dataReady='error';
    }
  }
  openPage(location.hash.slice(1),false);
  loadData();
})();
