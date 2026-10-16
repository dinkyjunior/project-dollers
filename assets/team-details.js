(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = () => document.querySelector('[data-page="team-details"]');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const fmt = (value, places = 0) => known(value) ? Number(value).toLocaleString('en-AU',{maximumFractionDigits:places}) : '—';
  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${['calendar','stadium','shield','info'].includes(name) ? 'assets/team-details/ui-icons.svg' : 'assets/icons.svg'}#${name}"></use></svg>`;
  const state = {team:'DAL',tab:'form',window:5,season:'cross',venue:'all',mode:'average',expanded:null,initialized:false,fromLadder:false,view:null,game:null,playerOpen:new Set()};
  let dataset = null, rawDataset = null, rawBytes = null, etag = null, loading = null, error = null, lastCheck = 0, returnFocus = null, returnFocusSelector = null;
  const upcomingLayout = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const {target} of entries) {
      const height = target.getBoundingClientRect().height;
      if (height > 0) target.parentElement.style.setProperty('--td-upcoming-overlap', `${height * 0.7}px`);
    }
  }) : null;
  const team = abbr => dataset?.teams?.[abbr || state.team];
  const current = () => window.PDApp?.getContext()?.data;
  const identity = abbr => team(abbr) || current()?.teams?.find(item => item.abbr === abbr) || {abbr,name:abbr,fullName:abbr};
  const name = abbr => identity(abbr).name || abbr;
  const panelName = () => state.team === 'DAL' ? 'DALLAS' : state.team;
  const cityName = abbr => identity(abbr).fullName?.replace(identity(abbr).name,'').trim() || abbr;
  const logo = abbr => abbr === 'DAL' ? 'assets/team-details/dal.svg' : window.PDApp?.getContext()?.logo(abbr) || `assets/logos/${String(abbr).toLowerCase()}.webp`;
  const active = () => !!page()?.classList.contains('active');
  const games = () => team()?.games || [];
  const final = game => game.status === 'final' && known(game.home_score) && known(game.away_score);
  const home = game => game.home_team === state.team;
  const opponent = game => home(game) ? game.away_team : game.home_team;
  const ownScore = game => home(game) ? game.home_score : game.away_score;
  const otherScore = game => home(game) ? game.away_score : game.home_score;
  const outcome = game => !final(game) ? null : Number(ownScore(game)) > Number(otherScore(game)) ? 'W' : Number(ownScore(game)) < Number(otherScore(game)) ? 'L' : 'T';
  const venueKind = game => game.neutral === true ? 'neutral' : game.neutral === false ? home(game) ? 'home' : 'away' : 'unknown';
  const sortRecent = (a,b) => String(b.kickoffUtc || b.gameday).localeCompare(String(a.kickoffUtc || a.gameday)) || Number(b.season)-Number(a.season) || Number(b.week)-Number(a.week);
  function selectedGames() {
    return games().filter(game => final(game) && (!game.seasonType || ['REG','2'].includes(String(game.seasonType))) && (state.season === 'cross' || Number(game.season) === Number(dataset.season)) && (state.venue === 'all' || venueKind(game) === state.venue)).sort(sortRecent).slice(0,state.window);
  }
  const seasonGames = () => games().filter(game => final(game) && Number(game.season) === Number(dataset.season) && (!game.seasonType || ['REG','2'].includes(String(game.seasonType)))).sort(sortRecent);
  function record(items) {
    if (!items.length) return '0–0';
    const wins = items.filter(game => outcome(game) === 'W').length, losses = items.filter(game => outcome(game) === 'L').length, ties = items.filter(game => outcome(game) === 'T').length;
    return `${wins}–${losses}${ties ? `–${ties}` : ''}`;
  }
  function nextGame() {
    const eligible = game => Number(game.season) === Number(dataset.season) && (game.home_team === state.team || game.away_team === state.team) && game.status !== 'final' && !['cancelled','postponed'].includes(game.status);
    const upcomingId = team()?.upcomingGameId;
    const upcoming = upcomingId ? games().find(game => game.id === upcomingId && eligible(game)) : null;
    return upcoming || games().filter(eligible).sort((a,b) => String(a.kickoffUtc || a.gameday).localeCompare(String(b.kickoffUtc || b.gameday)))[0] || null;
  }
  function dateTime(game) {
    if (!game?.kickoffUtc) return 'Kickoff unavailable';
    const value = new Date(game.kickoffUtc);
    if (!Number.isFinite(value.getTime())) return 'Kickoff unavailable';
    const date = new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short'}).format(value);
    const time = new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(value);
    return `${date} · ${time}`;
  }
  const timestamp = value => value ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)) : 'Unavailable';
  const sourceIds = item => item?.sourceIds || [];
  const stats = (game, abbr = state.team) => game.stats?.[abbr] || {};
  function completeValue(items, getter, average = state.mode === 'average') {
    const values = items.map(getter), covered = values.filter(known).length;
    return {value: items.length && covered === items.length ? values.reduce((sum,value) => sum + Number(value),0) / (average ? items.length : 1) : null,covered,total:items.length};
  }
  function aggregate(field, allowed = false, items = selectedGames()) {
    return completeValue(items,game => stats(game,allowed ? opponent(game) : state.team)[field]);
  }
  function conversion(made, attempts, items) {
    const numer = completeValue(items,game => stats(game)[made],false), denom = completeValue(items,game => stats(game)[attempts],false);
    return {value: known(numer.value) && known(denom.value) && denom.value > 0 ? 100*numer.value/denom.value : null,covered:Math.min(numer.covered,denom.covered),total:items.length};
  }
  const coverage = result => result.total ? `${result.covered} of ${result.total} games verified` : 'No eligible games';
  const metricCell = result => `<span title="${escape(coverage(result))}" data-coverage="${result.covered}/${result.total}">${fmt(result.value,state.mode === 'average' ? 1 : 0)}</span>`;
  function chips(items) {
    const square = 'M6 0H24A6 6 0 0 1 30 6V24A6 6 0 0 1 24 30H6A6 6 0 0 1 0 24V6A6 6 0 0 1 6 0Z';
    const letters = {W:'M5 7H9L11 18L13 7H17L19 18L21 7H25L21 23H17L15 13L13 23H9Z',L:'M10 7H14V19H22V23H10Z',T:'M6 7H24V11H17V23H13V11H6Z'};
    return items.slice().reverse().map(game => {
      const result = outcome(game), label = `${game.season} Week ${game.week} · ${result} ${ownScore(game)}–${otherScore(game)}`;
      return `<span class="td-form-chip ${result === 'W' ? 'is-win' : result === 'L' ? 'is-loss' : 'is-tie'}" data-outcome="${result}" role="img" aria-label="${escape(label)}" title="${escape(label)}"><svg class="td-form-glyph" viewBox="0 0 30 30" width="30" height="30" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${square}${letters[result] || letters.T}"/></svg><span class="sr-only">${result}</span></span>`;
    }).join('');
  }
  const diamond = (label, action, extra = '') => `<button class="td-diamond-button${action === 'continue' ? ' td-continue' : ''}" data-td-action="${action}" ${extra}>${escape(label)} ${icon('chevron')}</button>`;
  function editorialHeader() {
    return `<header class="team-brand td-editorial-header"><a class="brand-home-link" href="#home" aria-label="Project Dollar Home"><img class="td-brand-mark" src="assets/branding/project-dollar-jewel-bag-emerald.png" alt="Project Dollar" width="500" height="500"></a><span class="td-brand-subtitle" hidden>Sports data &amp; research</span><button class="td-header-menu" data-td-action="menu" aria-label="Open team navigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M3 12h18M3 19h18" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button></header><div class="td-breadcrumb td-editorial-crumbs"><button class="td-back" data-td-action="ladder">${icon('back')} NFL ladder</button><span class="td-editorial-crumb-divider" aria-hidden="true"></span><div class="td-crumbs"><button data-td-action="ladder">Teams</button><span aria-hidden="true">/</span><span>${escape(identity(state.team).fullName || state.team)}</span></div></div>`;
  }
  function masthead(content = '') {
    const club = team() || current()?.teams?.find(item => item.abbr === state.team);
    const scene = club ? `url('${new URL(`assets/team-stadiums-20261016/${state.team.toLowerCase()}.webp`,document.baseURI).href}')` : 'none';
    return `<div class="td-editorial-masthead" data-stadium-team="${club ? escape(state.team) : ''}" style="--td-hero-image:${scene}">${editorialHeader()}${content}</div>`;
  }
  function hero() {
    const t = identity(state.team), items = seasonGames();
    const wordmark = new URL(`assets/team-wordmarks-20261016/${state.team.toLowerCase()}.svg`,document.baseURI).href;
    const crest = ['LA','NYG','NYJ'].includes(state.team) ? `assets/team-crests-20261016/${state.team.toLowerCase()}.svg` : logo(state.team);
    // Team form and its record share the same integrity-applied completed games.
    // A browsing-week field from another snapshot is not a coverage comparator.
    return `<section class="td-hero td-framed"><img class="td-team-logo" src="${escape(crest)}" alt="${escape(t.fullName)} logo" width="500" height="500"><div class="td-hero-copy"><h1 class="td-wordmark-title"><span class="sr-only">${escape(t.fullName)}</span><span class="td-team-wordmark" aria-hidden="true" style="--td-wordmark-image:url('${escape(wordmark)}')"></span></h1><p class="td-hero-meta">${escape(t.division || t.conference || 'NFL')}</p><div class="td-hero-bottom"><div class="td-record-wrap"><small class="td-record-label">RECORD</small><strong class="td-record" aria-label="${dataset.season} research record across ${items.length} verified completed games">${record(items)}</strong></div><div class="td-form"><small>FORM</small><div class="td-form-chips">${chips(items.slice(0,5))}</div></div></div></div></section>`;
  }
  function upcoming() {
    const game = nextGame();
    if (!game) return `<section class="td-upcoming td-framed"><h2>UPCOMING GAME</h2><p>No verified upcoming fixture is available.</p></section>`;
    const opp = opponent(game), past = game.kickoffUtc && Date.parse(game.kickoffUtc) < Date.now();
    return `<section class="td-upcoming td-framed" data-upcoming-game="${escape(game.id)}"><div class="td-upcoming-info"><h2>${past ? 'AWAITING RESULT' : 'UPCOMING MATCHUP'} · WEEK ${game.week}</h2><div class="td-upcoming-opponent"><img class="td-opponent-logo" src="${escape(logo(opp))}" alt="${escape(identity(opp).fullName)} logo" width="500" height="500"><div class="td-upcoming-copy"><h3><small>vs</small> ${escape(identity(opp).fullName)}</h3><p>${escape(venueKind(game) === 'unknown' ? 'Venue designation unavailable' : venueKind(game))} · ${escape(game.venue || 'Venue unavailable')}<br>${escape(dateTime(game))}</p></div></div></div>${diamond('Open matchup breakdown','matchup',`data-game="${escape(game.id)}"`)}</section>`;
  }
  function panelHead(title, extra = '') {
    return `<header class="td-panel-head"><h2>${escape(title)}</h2>${extra}</header>`;
  }
  function filters(items) {
    return `<div class="td-filters"><label><select id="team-window-select" aria-label="Game window">${[3,5,10].map(n => `<option value="${n}" ${state.window === n ? 'selected' : ''}>Last ${n}</option>`).join('')}</select>${icon('chevron')}</label><label><select id="team-season-select" aria-label="Season filter"><option value="cross" ${state.season === 'cross' ? 'selected' : ''}>Cross-season</option><option value="current" ${state.season === 'current' ? 'selected' : ''}>${dataset.season} only</option></select>${icon('chevron')}</label><label><select id="team-venue-select" aria-label="Venue filter">${[['all','All venues'],['home','Home'],['away','Away'],['neutral','Neutral']].map(([v,l]) => `<option value="${v}" ${state.venue === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron')}</label></div>`;
  }
  function gameExpansion(game) {
    const own = stats(game), other = stats(game,opponent(game));
    const lines = [['Total offense','totalOffense'],['Net passing', 'netPassing'],['Rushing','rushing']];
    return `<div class="td-game-report" data-game="${escape(game.id)}" id="team-game-${escape(game.id)}"><h3>${escape(cityName(state.team))} ${fmt(ownScore(game))}–${fmt(otherScore(game))} ${escape(cityName(opponent(game)))} <span>· Final · ${game.season} Week ${game.week}</span></h3><div class="td-game-report-body"><table class="td-game-stats td-game-stats-table"><thead><tr><th scope="col"><span class="td-stats-label">YARDS</span></th><th scope="col">${escape(state.team)}</th><th scope="col">${escape(opponent(game))}</th></tr></thead><tbody>${lines.map(([label,key]) => `<tr class="td-game-stat"><th scope="row">${label}</th><td>${fmt(own[key])}</td><td>${fmt(other[key])}</td></tr>`).join('')}</tbody></table><button class="td-game-open" data-td-action="report" data-game="${escape(game.id)}">Open game report ${icon('chevron')}</button></div></div>`;
  }
  function gamesPanel(items) {
    return `<section class="td-panel td-games td-framed">${panelHead(`LAST ${state.window === 5 ? 'FIVE' : state.window} GAMES`)}<div class="td-table-head" aria-hidden="true"><span>OPPONENT</span><span>RESULT</span></div><div class="td-game-list">${items.length ? items.map(game => { const expanded = state.expanded === game.id, opp = opponent(game); return `<button class="td-game-row ${expanded ? 'is-expanded' : ''}" data-team-game="${escape(game.id)}" aria-expanded="${expanded}" aria-controls="team-game-${escape(game.id)}"><span class="td-game-opponent"><img class="td-opponent-logo" src="${escape(logo(opp))}" alt="" width="500" height="500"><span class="td-game-opponent-copy"><span>${venueKind(game) === 'neutral' ? '' : home(game) ? '' : '@ '}${escape(name(opp))}${venueKind(game) === 'neutral' ? ' (N)' : ''}</span><small class="td-game-context">${game.season} W${game.week}${game.season !== dataset.season ? '<span class="td-prior-season"> · Prior season</span>' : ''}</small></span></span><span class="td-game-result ${outcome(game) === 'W' ? 'td-win' : outcome(game) === 'L' ? 'td-loss' : ''}">${outcome(game)} ${fmt(ownScore(game))}–${fmt(otherScore(game))}</span>${icon('chevron','td-row-chevron')}</button>${expanded ? gameExpansion(game) : `<div id="team-game-${escape(game.id)}" hidden></div>`}`; }).join('') : '<p class="td-empty">No verified completed games match these filters.</p>'}</div>${items.some(game => venueKind(game) === 'neutral') ? `<p class="td-neutral-note">N = verified neutral venue: ${escape([...new Set(items.filter(game => venueKind(game) === 'neutral').map(game => game.venue))].join(', '))}</p>` : ''}</section>`;
  }
  function yardsPanel(items) {
    const modes = `<div class="td-mode-controls" role="group" aria-label="Statistical presentation"><button data-td-mode="average" aria-pressed="${state.mode === 'average'}">Per game</button><button data-td-mode="total" aria-pressed="${state.mode === 'total'}">Totals</button></div>`;
    return `<section class="td-panel td-yards td-framed">${panelHead('YARDS GAINED & ALLOWED',modes)}<table class="td-yards-table"><thead><tr><th><span class="td-stats-label">METRIC</span></th><th>GAINED</th><th>ALLOWED</th></tr></thead><tbody>${[['Net passing <small>(accounts for sacks)</small>','netPassing'],['Rushing','rushing'],['Total offense','totalOffense']].map(([label,key]) => `<tr><th scope="row">${label}</th><td data-td-stat="${key}" data-td-side="gained">${metricCell(aggregate(key,false,items))}</td><td data-td-stat="${key}" data-td-side="allowed">${metricCell(aggregate(key,true,items))}</td></tr>`).join('')}</tbody></table><p class="td-coverage-note">${items.length} selected games · ${state.mode === 'average' ? 'per game' : 'totals'} · — = unavailable, disputed or incomplete coverage</p></section>`;
  }
  function snapshots(items) {
    const metrics = [
      ['POINTS FOR',completeValue(items,ownScore)],['POINTS AGAINST',completeValue(items,otherScore)],
      ['THIRD DOWNS',conversion('thirdDownMade','thirdDownAttempts',items),'%'],['RED-ZONE TD%',conversion('redZoneTD','redZoneAttempts',items),'%'],
      ['TURNOVER MARGIN',completeValue(items,game => known(stats(game).turnovers) && known(stats(game,opponent(game)).turnovers) ? stats(game,opponent(game)).turnovers - stats(game).turnovers : null)],
      ['PENALTY YARDS',aggregate('penaltyYards',false,items)]
    ];
    return `<section class="td-panel td-snapshot td-framed" id="team-form-snapshot">${panelHead('TEAM FORM SNAPSHOT')}<div class="td-stat-grid">${metrics.map(([label,result,suffix=''],index) => `<div class="td-stat-tile"><span>${label}</span><strong data-td-snapshot="${['pointsFor','pointsAgainst','thirdDown','redZoneTD','turnoverMargin','penaltyYards'][index]}" title="${escape(coverage(result))}" data-coverage="${result.covered}/${result.total}">${fmt(result.value,1)}${known(result.value) ? suffix : ''}</strong></div>`).join('')}</div><div class="td-snapshot-actions"><button data-td-action="venues">Home / away / neutral splits <span aria-hidden="true">↗</span></button><button data-td-action="schedule">Full schedule <span aria-hidden="true">↗</span></button></div></section>`;
  }
  function formContent() {
    const items = selectedGames();
    if (!state.initialized) { state.expanded = items[0]?.id || null; state.initialized = true; }
    if (state.expanded && !items.some(game => game.id === state.expanded)) state.expanded = items[0]?.id || null;
    return `${filters(items)}${gamesPanel(items)}<div class="td-form-cards">${yardsPanel(items)}${snapshots(items)}</div>${diamond('Continue to players & QB','continue')}`;
  }
  function playersContent() {
    const roster = team()?.roster || [];
    const positions = ['ALL','QB','RB','WR','TE','DEF','K'];
    const chosen = state.position || 'ALL';
    const filtered = roster.filter(player => chosen === 'ALL' || player.position === chosen || chosen === 'DEF' && ['DE','DT','DL','LB','CB','DB','S','SAF','ILB','OLB'].includes(player.position));
    return `<section class="td-panel td-framed td-players">${panelHead(`${panelName()} · PLAYERS & QB`)}<p class="td-coverage-note">${dataset.season} current roster · verified season totals when available</p><div class="td-position-controls" role="group" aria-label="Player position">${positions.map(pos => `<button data-td-position="${pos}" aria-pressed="${chosen === pos}">${pos}</button>`).join('')}</div>${filtered.length ? filtered.map(player => { const s = player.seasonStats || {}, scoredTD = known(s.rushingTD) && known(s.receivingTD) ? Number(s.rushingTD)+Number(s.receivingTD) : null, metrics = player.position === 'QB' ? [['PASS',s.passingYards],['PASS TD',s.passingTD],['RUSH',s.rushingYards],['RUSH TD',s.rushingTD]] : ['DE','DT','DL','LB','CB','DB','S','SAF','ILB','OLB'].includes(player.position) ? [['TACKLES',s.tackles],['ASSISTS',s.assistedTackles],['SACKS',s.defensiveSacks],['INT',s.defensiveInterceptions]] : [['RUSH',s.rushingYards],['REC',s.receivingYards],['CATCH',s.receptions],['TD SCORED',scoredTD]]; return `<details class="td-player" data-td-player="${escape(player.id)}" ${state.playerOpen.has(player.id) ? 'open' : ''}><summary><span class="td-player-name"><b>#${escape(player.jersey ?? player.number ?? '—')} ${escape(player.name)}</b><small>${escape(player.position)} · ${escape(player.depth?.label || ({ACT:'Active',RES:'Reserve',INA:'Inactive'}[player.status]) || player.status || 'Starter status unavailable')}</small></span><span class="td-player-metrics">${metrics.map(([label,value]) => `<span><small>${label}</small><b>${fmt(value)}</b></span>`).join('')}</span></summary><div class="td-player-history">${(dataset.disagreements || []).some(issue => issue.playerId === player.id && issue.field === 'jersey') ? '<p class="td-disagreement">Jersey sources differ. The number remains unavailable pending reconciliation. Open Sources for both values.</p>' : ''}<h3>LAST 5 RECORDED REGULAR-SEASON STATISTIC ROWS</h3>${player.last5?.length ? `<table><thead><tr><th>GAME</th><th>PASS</th><th>RUSH</th><th>REC</th><th>TD</th></tr></thead><tbody>${player.last5.map(game => `<tr><th>${game.season} W${game.week} · ${escape(game.team || state.team)} vs ${escape(game.opponent)}</th><td>${fmt(game.stats?.passingYards)}</td><td>${fmt(game.stats?.rushingYards)}</td><td>${fmt(game.stats?.receivingYards)}</td><td>${fmt(game.stats?.offensiveTD ?? game.stats?.totalTD)}</td></tr>`).join('')}</tbody></table>` : '<p>Verified game-level player statistics unavailable.</p>'}<p>Depth order is separate from confirmed starters. Passing touchdowns are shown separately from touchdowns scored.</p></div></details>`; }).join('') : state.team === 'PIT' ? '<button class="td-diamond-button" data-open="steelers">OPEN STEELERS PLAYER RESEARCH</button>' : '<p class="td-empty">Verified current roster unavailable. No player identities or statistics are substituted.</p>'}</section>`;
  }
  function lineupContent() {
    const game = nextGame(), depth = team()?.depth, injuries = team()?.injuries;
    const depthPlayers = Array.isArray(depth) ? depth : depth?.players || [];
    const injuryPlayers = Array.isArray(injuries) ? injuries : injuries?.players || [];
    return `<section class="td-panel td-framed">${panelHead('LINEUP & TRAVEL')}<h3>UPCOMING VENUE & REST</h3>${game ? `<dl class="td-info-grid"><dt>Opponent</dt><dd>${escape(identity(opponent(game)).fullName)}</dd><dt>Venue</dt><dd>${escape(game.venue || 'Unavailable')}</dd><dt>Home / away / neutral</dt><dd>${venueKind(game).toUpperCase()}</dd><dt>Kickoff</dt><dd>${escape(dateTime(game))}</dd><dt>Published rest days</dt><dd>${fmt(home(game) ? game.homeRest : game.awayRest)}</dd><dt>Travel itinerary</dt><dd>Unavailable</dd><dt>Weather forecast</dt><dd>Unavailable</dd></dl>` : '<p>Verified upcoming venue unavailable.</p>'}<h3>DEPTH CHART</h3>${depthPlayers.length ? depthPlayers.map(player => `<p>${escape(player.position)} · ${escape(player.name)} · ${escape(player.label || (known(player.rank) ? `Depth rank ${player.rank} · ${player.unit || 'Unit unavailable'}` : 'Rank unavailable'))}</p>`).join('') : '<p>Verified current depth chart unavailable. Roster order is not treated as starter status.</p>'}<h3>INJURY & PRACTICE REPORTS</h3>${injuryPlayers.length ? injuryPlayers.map(player => `<p>${escape(player.name)} · ${escape(player.reportStatus || player.status || 'Game status unavailable')} · ${escape(player.practiceStatus || player.practice || 'Practice participation unavailable')}</p>`).join('') : '<p>Verified current reports unavailable. Missing reports do not mean healthy. Confirmed game-day inactives unavailable.</p>'}${diamond('VIEW FULL SCHEDULE','schedule')}</section>`;
  }
  function focusSelector(node) {
    if (!node) return null;
    if (node.id) return `#${CSS.escape(node.id)}`;
    if (node.matches?.('summary') && node.parentElement.dataset.tdPlayer) return `[data-td-player="${CSS.escape(node.parentElement.dataset.tdPlayer)}"] > summary`;
    for (const attr of ['data-team-game','data-td-mode','data-td-position','data-td-action']) {
      const value = node.getAttribute?.(attr);
      if (value) return `[${attr}="${CSS.escape(value)}"]${node.dataset.game ? `[data-game="${CSS.escape(node.dataset.game)}"]` : ''}`;
    }
    return null;
  }
  function render() {
    const holder = $('team-details-content'); if (!holder) return;
    upcomingLayout?.disconnect();
    if (page()) page().dataset.team = state.team;
    if (!dataset || !team()) {
      holder.innerHTML = `${masthead()}<section class="td-panel td-framed"><h1>${escape(identity(state.team).fullName)} research</h1><p>${error ? escape(error) : dataset ? 'This team is unavailable in the verified research feed.' : 'Loading verified team data…'}</p>${error ? '<button data-td-action="retry">Retry verified data</button>' : ''}</section>`;
      return;
    }
    const scroll = page().querySelector('.page-scroll'), top = scroll.scrollTop, focused = document.activeElement, focusedSelector = focusSelector(focused);
    holder.innerHTML = `${masthead(hero())}${upcoming()}<div class="td-tabs" role="tablist" aria-label="Team research">${[['form','Form'],['players','Players & QB'],['lineup','Lineup & travel']].map(([tab,label]) => `<button id="team-tab-${tab}" data-team-tab="${tab}" role="tab" aria-selected="${state.tab === tab}" aria-controls="team-panel-${tab}" tabindex="${state.tab === tab ? '0' : '-1'}">${label}</button>`).join('')}</div>${['form','players','lineup'].map(tab => `<div id="team-panel-${tab}" role="tabpanel" aria-labelledby="team-tab-${tab}" ${state.tab !== tab ? 'hidden' : ''}>${tab === state.tab ? tab === 'form' ? formContent() : tab === 'players' ? playersContent() : lineupContent() : ''}</div>`).join('')}<div class="td-editorial-source-line"><button data-td-action="sources">View sources <span aria-hidden="true">↗</span></button><span>${dataset.season} research · ${escape(timestamp(dataset.retrievedAt))}</span></div>`;
    upcomingLayout?.observe(holder.querySelector('.td-upcoming'));
    scroll.scrollTop = top;
    const stale = Date.now() - Date.parse(dataset.retrievedAt) > 12*60*60*1000;
    $('team-details-footer').innerHTML = `<button data-td-action="sources">${icon('info')} Sources</button><span>${error ? 'RETAINED VERIFIED DATA · UPDATE FAILED' : stale ? 'SNAPSHOT MAY BE STALE' : 'VERIFIED SOURCES'} · ${dataset.season} · ${escape(timestamp(dataset.retrievedAt))}</span><button data-td-action="refresh" aria-label="Refresh team research">↻</button>`;
    if (focusedSelector) page().querySelector(focusedSelector)?.focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('pd:team-render'));
    if (state.view) { const view = state.view; state.view = null; if (['report','schedule','matchup','venues','sources','menu'].includes(view)) show(view,state.game); }
  }
  function sourcesContent(item) {
    if (!dataset) return `<p>Research data could not be verified against the source disagreement catalog. No unchecked statistics are displayed.</p><p>${escape(error || 'Verification is still in progress.')}</p><button data-td-action="retry">Retry verified data</button>`;
    const ids = sourceIds(item), sources = dataset.sources.filter(source => !ids.length || ids.includes(source.id));
    const contextGames = new Set([...games(),...(team()?.roster || []).flatMap(player => player.last5 || [])].map(game => game.gameId || game.id));
    const finals = seasonGames(), selected = selectedGames(), through = finals.length ? Math.max(...finals.map(game => Number(game.week))) : null;
    const recordCoverage = !item ? `<p class="td-source-coverage">${dataset.season} record ${record(finals)} · ${finals.length} verified final${finals.length === 1 ? '' : 's'}${through ? ` through Week ${through}` : ''}. Selected form: ${selected.length} completed games · ${selected.filter(game => Number(game.season) === Number(dataset.season)).length} current-season${selected.some(game => Number(game.season) !== Number(dataset.season)) ? ' + prior-season coverage' : ''}. Preseason excluded.</p>` : '';
    const issues = (dataset.disagreements || []).filter(issue => issue.fromIntegrityCatalog ? item ? issue.gameId === item.id : contextGames.has(issue.gameId) || issue.team === state.team : !item || issue.gameId === item.id || issue.team === state.team);
    return `${error ? `<p class="td-disagreement">${escape(error)}</p>` : ''}${issues.length ? `<section class="td-disagreement"><h3>SOURCE DIFFERENCES</h3>${issues.map(issue => issue.fromIntegrityCatalog ? window.PDSourceIntegrity.describeIssue(issue,escape,timestamp) : `<p>${escape(issue.issue)} · ${escape(issue.field)}${issue.playerId ? ` · ${escape(team()?.roster?.find(player => player.id === issue.playerId)?.name || issue.playerId)}` : ''}<br>${escape(issue.values?.join(' / ') || '')}<br>${escape(issue.action)}</p>`).join('')}</section>` : ''}${recordCoverage}<p class="td-source-context">${item?.season || dataset.season} regular season${item ? ` · Week ${item.week} · ${escape(item.id)}` : ''} · retrieved ${escape(timestamp(dataset.retrievedAt))}<br>Missing or disputed fields = unavailable. Derived metrics use the selected completed games only. Updates follow provider publication, not live play-by-play.</p><ul>${sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name || source.id)}</a><br>${escape(source.status)} · ${escape(timestamp(source.retrievedAt))}</li>`).join('')}</ul>`;
  }
  function reportContent(game) {
    if (!game) return '<p>This event is unavailable in the verified dataset.</p>';
    const own = stats(game), other = stats(game,opponent(game));
    return `<p class="td-report-score">${escape(identity(game.away_team).fullName)} ${fmt(game.away_score)} — ${fmt(game.home_score)} ${escape(identity(game.home_team).fullName)}</p><p>${game.season} · Week ${game.week} · ${escape(game.status.toUpperCase())}<br>${escape(dateTime(game))} · ${escape(game.venue || 'Venue unavailable')}</p><table class="td-report-table"><thead><tr><th>METRIC</th><th>${escape(state.team)}</th><th>${escape(opponent(game))}</th></tr></thead><tbody>${[['Net passing','netPassing'],['Rushing','rushing'],['Total offence','totalOffense'],['Third downs made','thirdDownMade'],['Third down attempts','thirdDownAttempts'],['Red-zone TDs','redZoneTD'],['Red-zone attempts','redZoneAttempts'],['Turnovers','turnovers'],['Penalty yards','penaltyYards']].map(([label,key]) => `<tr><th>${label}</th><td>${fmt(own[key])}</td><td>${fmt(other[key])}</td></tr>`).join('')}</tbody></table>${sourcesContent(game)}`;
  }
  function show(action, id, trigger) {
    if (!dataset && !['sources','menu'].includes(action)) return;
    const dialog = $('team-details-dialog'), game = id ? games().find(game => game.id === id) : nextGame();
    if (action === 'report' && window.PDApp?.openGameReport) {
      if (dialog?.open) dialog.close();
      window.PDApp.openGameReport(state.team,game?.id || id);
      return;
    }
    let title, content;
    if (action === 'menu') {
      title = `${name(state.team)} · Team navigation`;
      content = `<div class="td-menu-actions"><button data-td-action="home">Home ${icon('chevron')}</button><button data-td-action="ladder">NFL ladder ${icon('chevron')}</button><button data-td-action="schedule">Full schedule ${icon('chevron')}</button><button data-td-action="venues">Home / away / neutral splits ${icon('chevron')}</button><button data-td-action="sources">Sources &amp; integrity ${icon('chevron')}</button></div>`;
    }
    else if (action === 'report') { title = `${name(state.team)} · Game report`; content = reportContent(game); }
    else if (action === 'schedule') {
      title = `${name(state.team)} · ${dataset.season} schedule`;
      content = `<div class="td-schedule-list">${games().filter(game => game.season === dataset.season).sort((a,b) => -sortRecent(a,b)).map(game => `<button data-td-action="${final(game) ? 'report' : 'matchup'}" data-game="${escape(game.id)}"><strong>W${game.week} · ${venueKind(game) === 'neutral' ? 'N · ' : home(game) ? 'vs ' : '@ '}${escape(name(opponent(game)))}</strong><span>${final(game) ? `${outcome(game)} ${fmt(ownScore(game))}–${fmt(otherScore(game))}` : escape(dateTime(game))}</span></button>`).join('')}</div>${sourcesContent()}`;
    } else if (action === 'venues') {
      title = `${name(state.team)} · Venue breakdown`;
      content = `<p>Completed ${dataset.season} regular-season games. Neutral uses the source’s explicit venue designation.</p><table><thead><tr><th>VENUE</th><th>GAMES</th><th>RECORD</th></tr></thead><tbody>${['home','away','neutral','unknown'].map(kind => { const rows = seasonGames().filter(game => venueKind(game) === kind); return `<tr><th>${kind.toUpperCase()}</th><td>${rows.length}</td><td>${record(rows)}</td></tr>`; }).join('')}</tbody></table><div class="td-venue-actions">${['all','home','away','neutral'].map(kind => `<button data-td-venue="${kind}">Show ${kind} form</button>`).join('')}</div>${sourcesContent()}`;
    } else if (action === 'matchup') {
      title = game ? `${name(state.team)} vs ${name(opponent(game))}` : 'Matchup unavailable';
      content = game ? `<div class="td-dialog-matchup"><img src="${escape(logo(state.team))}" alt="${escape(name(state.team))}" width="500" height="500"><strong>VS</strong><img src="${escape(logo(opponent(game)))}" alt="${escape(name(opponent(game)))}" width="500" height="500"></div><p>${game.season} · WEEK ${game.week} · ${escape(game.status.toUpperCase())}<br>${escape(dateTime(game))}<br>${escape(game.venue || 'Venue unavailable')} · ${venueKind(game).toUpperCase()}</p><table><thead><tr><th>TEAM</th><th>CURRENT RECORD</th></tr></thead><tbody>${[state.team,opponent(game)].map(abbr => { const rows = team(abbr)?.games?.filter(g => final(g) && g.season === dataset.season) || []; const w = rows.filter(g => (g.home_team === abbr ? g.home_score > g.away_score : g.away_score > g.home_score)).length; const l = rows.filter(g => (g.home_team === abbr ? g.home_score < g.away_score : g.away_score < g.home_score)).length; return `<tr><th>${escape(identity(abbr).fullName)}</th><td>${w}–${l}${rows.length > w+l ? `–${rows.length-w-l}` : ''}</td></tr>`; }).join('')}</tbody></table><p>Verified fixture overview. Weather, confirmed inactives and exact pre-game prices are unavailable.</p>${sourcesContent(game)}` : '<p>No verified upcoming fixture is available.</p>';
    } else { title = `${name(state.team)} · Sources & integrity`; content = sourcesContent(); }
    $('team-details-dialog-title').textContent = title; $('team-details-dialog-content').innerHTML = content;
    dialog.dataset.view = action; dialog.dataset.game = game?.id || '';
    if (!dialog.open) { returnFocus = trigger || document.activeElement; returnFocusSelector = focusSelector(returnFocus); dialog.showModal(); }
  }
  function writeRoute() {
    const params = new URLSearchParams(); if (state.tab !== 'form') params.set('tab',state.tab);
    const route = `team/${state.team}${params.size ? `?${params}` : ''}`;
    if (location.hash !== `#${route}`) history.replaceState(null,'',`#${route}`);
  }
  function enter(abbr) { state.fromLadder = true; window.PDApp?.openPage(`team/${String(abbr || 'DAL').toUpperCase()}`); }
  function route(value) {
    const [path,query] = value.split('?'), abbr = path.split('/')[1]?.toUpperCase() || 'DAL';
    if (state.team !== abbr) { state.team = abbr; state.expanded = null; state.initialized = false; state.venue = 'all'; }
    const params = new URLSearchParams(query || ''); state.tab = ['form','players','lineup'].includes(params.get('tab')) ? params.get('tab') : 'form';
    state.view = params.get('view'); state.game = params.get('game');
    render(); refresh();
  }
  async function refresh(force = false) {
    if (loading) return loading; if (dataset && !force && Date.now()-lastCheck < 60000) return;
    lastCheck = Date.now();
    const refreshButton = page()?.querySelector('[data-td-action=refresh]');
    if (refreshButton) { refreshButton.setAttribute('aria-busy','true'); refreshButton.setAttribute('aria-disabled','true'); }
    loading = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
      try {
        const response = await fetch('assets/data/team-details.json',{cache:'no-cache',headers:etag ? {'If-None-Match':etag} : {},signal:controller.signal});
        if (response.status !== 304 && !response.ok) throw new Error(`Verified team feed returned HTTP ${response.status}`);
        if (response.status === 304 && !rawBytes) throw new Error('Cached team source is unavailable');
        const bytes = response.status === 304 ? rawBytes : await response.arrayBuffer(), raw = response.status === 304 ? rawDataset : JSON.parse(new TextDecoder().decode(bytes)); if (raw.schemaVersion !== 1 || !raw.teams?.DAL?.games || !Number.isFinite(Date.parse(raw.retrievedAt)) || !raw.sources?.length) throw new Error('Verified team dataset is invalid');
        if (!window.PDSourceIntegrity) throw new Error('Source integrity verification is unavailable');
        const value = await window.PDSourceIntegrity.apply('team-details',raw,bytes,{signal:controller.signal});
        if (dataset && Date.parse(value.retrievedAt) < Date.parse(dataset.retrievedAt)) throw new Error('Older team snapshot rejected; preceding verified snapshot retained');
        const changed = !window.PDSourceIntegrity.sameSnapshot(dataset,value), recovered = error !== null;
        if (changed) dataset = value; rawDataset = raw; rawBytes = bytes;
        etag = response.headers.get('ETag') || etag;
        error = null; document.documentElement.dataset.teamDataReady = 'true';
        // A successful check of the same snapshot keeps live controls and their
        // animation clocks intact. Full-content comparison still applies source
        // corrections that share a retrieval timestamp; recovery clears errors.
        if (active() && (changed || recovered)) { render(); const dialog = $('team-details-dialog'); if (dialog.open) show(dialog.dataset.view,dialog.dataset.game); }
        document.dispatchEvent(new CustomEvent('pd:team-data-ready',{detail:{changed,recovered,checkedAt:new Date().toISOString()}}));
        return true;
      } catch (err) {
        error = `${dataset ? 'Retained preceding verified data. ' : ''}${err.name === 'AbortError' ? 'Team source request timed out.' : err.message}`;
        document.documentElement.dataset.teamDataReady = dataset ? 'true' : 'error'; if (active()) render();
        return false;
      } finally { clearTimeout(timeout); loading = null; page()?.querySelector('[data-td-action=refresh]')?.setAttribute('aria-busy','false'); page()?.querySelector('[data-td-action=refresh]')?.setAttribute('aria-disabled','false'); }
    })();
    return loading;
  }
  document.addEventListener('click',event => {
    const button = event.target.closest('button'); if (!button || (!button.closest('[data-page="team-details"]') && !button.closest('#team-details-dialog'))) return;
    const action = button.dataset.tdAction;
    if (action || button.dataset.teamTab || button.dataset.teamGame || button.dataset.tdMode || button.dataset.tdPosition || button.dataset.tdVenue) event.stopImmediatePropagation();
    if (button.dataset.teamTab) { state.tab = button.dataset.teamTab; writeRoute(); render(); $(`team-tab-${state.tab}`)?.focus({preventScroll:true}); }
    else if (button.dataset.teamGame) { state.expanded = state.expanded === button.dataset.teamGame ? null : button.dataset.teamGame; render(); document.querySelector(`[data-team-game="${CSS.escape(button.dataset.teamGame)}"]`)?.focus({preventScroll:true}); }
    else if (button.dataset.tdMode) { state.mode = button.dataset.tdMode; render(); document.querySelector(`[data-td-mode="${state.mode}"]`)?.focus({preventScroll:true}); }
    else if (button.dataset.tdPosition) { state.position = button.dataset.tdPosition; render(); document.querySelector(`[data-td-position="${state.position}"]`)?.focus({preventScroll:true}); }
    else if (button.dataset.tdVenue) { state.venue = button.dataset.tdVenue; state.expanded = null; state.initialized = false; returnFocus = null; returnFocusSelector = '#team-venue-select'; $('team-details-dialog').close(); state.tab = 'form'; writeRoute(); render(); $('team-venue-select')?.focus({preventScroll:true}); }
    else if (action === 'home') window.PDApp?.openPage('home');
    else if (action === 'ladder' || action === 'nfl') window.PDApp?.openLadder(state.team,!state.fromLadder);
    else if (action === 'continue') { state.tab = 'players'; writeRoute(); render(); $('team-tab-players')?.scrollIntoView({block:'start',behavior:'auto'}); $('team-tab-players')?.focus({preventScroll:true}); }
    else if (action === 'insights') { state.tab = 'form'; writeRoute(); render(); $('team-form-snapshot')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
    else if (action === 'refresh' || action === 'retry') refresh(true);
    else if (action === 'report' && window.PDApp?.openGameReport) {
      if ($('team-details-dialog')?.open) $('team-details-dialog').close();
      window.PDApp.openGameReport(state.team,button.dataset.game);
    }
    else if (action === 'matchup' && window.MatchupBreakdown) {
      if ($('team-details-dialog')?.open) $('team-details-dialog').close();
      window.MatchupBreakdown.enter(state.team,button.dataset.game);
    }
    else if (action && ['matchup','schedule','venues','report','sources','menu'].includes(action)) show(action,button.dataset.game,button);
  });
  document.addEventListener('toggle',event => {
    const node = event.target; if (!node.isConnected || !node.matches?.('.td-player[data-td-player]')) return;
    if (node.open) state.playerOpen.add(node.dataset.tdPlayer); else state.playerOpen.delete(node.dataset.tdPlayer);
  },true);
  document.addEventListener('keydown',event => {
    if (!event.target.closest('.td-tabs') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...page().querySelectorAll('.td-tabs [role=tab]')], index = tabs.indexOf(document.activeElement);
    if (index < 0) return; event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  });
  document.addEventListener('change',event => {
    const key = {'team-window-select':'window','team-season-select':'season','team-venue-select':'venue'}[event.target.id]; if (!key) return;
    state[key] = key === 'window' ? Number(event.target.value) : event.target.value; state.initialized = false; render();
  });
  $('team-details-dialog')?.addEventListener('close',() => {
    const target = returnFocus?.isConnected ? returnFocus : returnFocusSelector ? page()?.querySelector(returnFocusSelector) : null;
    if (target && active()) target.focus({preventScroll:true});
  });
  document.addEventListener('pd:route-change',event => { if (event.detail?.page !== 'team-details' && $('team-details-dialog')?.open) $('team-details-dialog').close(); });
  document.addEventListener('pd:data-ready',() => { if (active()) { render(); refresh(true); } });
  document.addEventListener('visibilitychange',() => { if (!document.hidden && active()) refresh(); });
  window.addEventListener('focus',() => { if (active()) refresh(); });
  window.addEventListener('online',() => { if (active()) refresh(true); });
  setInterval(() => { if (!document.hidden && active()) refresh(); },90000);
  window.PDTeamDetails = {route,enter,render,refresh,getState:() => ({...state}),getDataset:() => dataset,getRawDataset:() => rawDataset,getSelectedGames:selectedGames};
})();
