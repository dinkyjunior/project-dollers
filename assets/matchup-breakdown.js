(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = () => document.querySelector('[data-page="matchup-breakdown"]');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const fmt = (value, digits = 0) => known(value) ? Number(value).toLocaleString('en-AU',{maximumFractionDigits:digits}) : '—';
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="${['calendar','stadium','shield','info'].includes(name) ? 'assets/team-details/ui-icons.svg' : 'assets/icons.svg'}#${name}"></use></svg>`;
  const state = {team:'DAL',tab:'players',window:5,season:'cross',venue:'all',mode:'total',qb:'last5',player:null,kind:'receiving',game:null,returnRoute:'team/DAL',fromLadder:false,view:null};
  let dataset = null, loading = null, error = null, lastCheck = 0, checkedAt = null, returnFocus = null, returnSelector = null;
  const active = () => !!page()?.classList.contains('active');
  const club = abbr => dataset?.teams?.[abbr || state.team];
  const identity = abbr => club(abbr) || window.PDApp?.getContext()?.data?.teams?.find(t => t.abbr === abbr) || {abbr,name:abbr,fullName:abbr};
  const city = abbr => identity(abbr).fullName?.replace(identity(abbr).name,'').trim() || abbr;
  const panelName = abbr => abbr === 'DAL' ? 'DALLAS' : abbr === 'TB' ? 'TAMPA BAY' : city(abbr);
  const compactPanelName = abbr => !['DAL','TB'].includes(abbr) && panelName(abbr).length >= 10 ? abbr : panelName(abbr);
  const logo = abbr => ['DAL','TB'].includes(abbr) ? `assets/team-details/${abbr.toLowerCase()}.svg` : window.PDApp?.getContext()?.logo(abbr) || `assets/logos/${String(abbr).toLowerCase()}.webp`;
  const eventReport = (game,abbr = state.team) => game ? club(abbr)?.fixtureReports?.[game.id] || null : null;
  const reportedEvent = game => eventReport(game,state.team) || eventReport(game,game?.home_team) || eventReport(game,game?.away_team);
  const final = game => game?.status === 'final' && known(game.home_score) && known(game.away_score) && reportedEvent(game)?.eventStatus?.state !== 'in';
  const selectedEvidence = (abbr,player = null) => {
    const game = fixture(), report = eventReport(game,abbr), evidence = player?.qbEvidence || club(abbr)?.qbEvidence || club(abbr)?.projectedQB;
    if (!player && report?.qbEvidence) return report.qbEvidence;
    const availability = report?.availability?.players?.find(row => String(row.playerId) === String(player?.id));
    const matching = evidence && game && Number(evidence.season) === Number(game.season) && Number(evidence.week) === Number(game.week);
    if (availability) return {...(matching ? evidence : {}),reportStatus:availability.reportStatus,reportedInactive:availability.reportedInactive,officialConfirmed:availability.officialConfirmed,practiceStatus:availability.weeklyReport?.practiceStatus || null,season:report.season,week:report.week,gameId:report.gameId,sourceTimestamp:availability.sourceTimestamp,sourceIds:[...new Set([...(availability.sourceIds || []),...(availability.weeklyReport?.sourceIds || []),...(matching ? evidence.sourceIds || [] : [])])],note:'Selected-event ESPN provider report; incomplete and not an official inactive list. Absence does not establish active or healthy status.'};
    return matching ? evidence : {status:'unavailable',playerId:null,projected:false,confirmed:false,note:'QB availability/projection for the selected fixture is unavailable; another week’s report is not substituted.',sourceIds:report?.sourceIds || []};
  };
  const completedLog = (row,abbr) => {const game = allGames(abbr).find(item => item.id === gameId(row));return !game || final(game);};
  const fixtureLabel = game => reportedEvent(game)?.eventStatus?.state === 'in' ? 'GAME IN PROGRESS' : final(game) || reportedEvent(game)?.eventStatus?.completed === true ? 'GAME REPORT' : 'UPCOMING GAME';
  function liveStatus(game) {
    const report = reportedEvent(game), event = report?.eventStatus, score = report?.liveScore;
    if (event?.state === 'in' || event?.completed === true) return `<small data-mb-event-status="${escape(event.state)}">ESPN · ${escape(event.description || (event.completed ? 'Final' : 'In progress'))}${known(score?.away) && known(score?.home) ? ` · ${escape(game.away_team)} ${fmt(score.away)}–${fmt(score.home)} ${escape(game.home_team)}` : ''}${event.detail ? ` · ${escape(event.detail)}` : ''}<br>Provider snapshot · ${escape(timestamp(report.publishedAt || report.retrievedAt))}</small>`;
    return game && final(game) ? `<small>FINAL · ${escape(game.away_team)} ${fmt(game.away_score)}–${fmt(game.home_score)} ${escape(game.home_team)}</small>` : '';
  }
  const recent = (a,b) => String(b.kickoffUtc || b.gameday || '').localeCompare(String(a.kickoffUtc || a.gameday || '')) || Number(b.season)-Number(a.season) || Number(b.week)-Number(a.week);
  const opponentOf = (game, abbr) => game.home_team === abbr ? game.away_team : game.home_team;
  const venueOf = (game, abbr) => !game ? 'unknown' : game.neutral === true ? 'neutral' : game.neutral === false ? game.home_team === abbr ? 'home' : 'away' : 'unknown';
  const allGames = abbr => club(abbr)?.games || [];
  const availableGames = abbr => [...new Map([...allGames(abbr),...(club(abbr)?.headToHeadGames || [])].map(game => [game.id,game])).values()];
  function fixture() {
    const games = allGames(state.team);
    return games.find(g => g.id === state.game) || games.find(g => g.id === club()?.researchGameId) || games.find(g => g.id === club()?.upcomingGameId) || games.filter(g => Number(g.season) === Number(dataset?.season) && !final(g) && !['cancelled','postponed'].includes(g.status)).sort((a,b) => String(a.kickoffUtc || a.gameday || '').localeCompare(String(b.kickoffUtc || b.gameday || '')))[0] || null;
  }
  const otherTeam = () => fixture() ? opponentOf(fixture(),state.team) : null;
  const teamPair = () => [state.team,otherTeam()].filter(Boolean);
  function selectedGames(abbr = state.team) {
    return allGames(abbr).filter(g => final(g) && (!g.seasonType || ['REG','2'].includes(String(g.seasonType))) && (state.season === 'cross' || Number(g.season) === Number(dataset?.season)) && (state.venue === 'all' || venueOf(g,abbr) === state.venue)).sort(recent).slice(0,state.window);
  }
  const players = abbr => {
    const p = club(abbr)?.players;
    return Array.isArray(p) ? p : p && typeof p === 'object' ? Object.values(p) : [];
  };
  const shortName = player => (player.shortName || player.short || String(player.name || 'Unavailable').replace(/^(\S)\S*\s+/, '$1. ')).replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i,'');
  const playerById = (abbr,id) => players(abbr).find(p => String(p.id) === String(id));
  const logs = player => Array.isArray(player?.gameLog) ? player.gameLog : [];
  const gameId = row => row.gameId || row.id;
  const rowFor = (player,game,abbr) => logs(player).find(row => gameId(row) === game.id && (!row.team || row.team === abbr));
  const stat = (row,key) => row?.stats?.[key];
  const verifiedDNP = row => row?.appearance?.status === 'dnp' || row?.appearance?.status === 'verified' && row.appearance.value === false;
  const verifiedStart = row => row?.started?.value === true && row.started.status === 'verified';
  const recordedStatistics = row => Object.values(row?.stats || {}).some(known);
  const appeared = row => !!row && !verifiedDNP(row) && (row.appearance?.status === 'verified' || row.appearance?.status === 'recorded' || Object.values(row.stats || {}).some(known));
  const eligibleRows = (player,abbr) => selectedGames(abbr).map(game => ({game,row:rowFor(player,game,abbr)})).filter(({row}) => appeared(row));
  function sumRows(rows,key) {
    const values = rows.map(row => stat(row,key));
    return values.length && values.every(known) ? values.reduce((sum,v) => sum+Number(v),0) : null;
  }
  function playerSummary(player,abbr,kind) {
    const rows = eligibleRows(player,abbr).map(item => item.row), gp = rows.filter(recordedStatistics).length;
    const keys = kind === 'rushing' ? ['carries','rushingYards','rushingTD'] : ['targets','receptions','receivingYards','receivingTD'];
    const s = Object.fromEntries(keys.map(key => [key,sumRows(rows,key)]));
    const yard = kind === 'rushing' ? 'rushingYards' : 'receivingYards';
    return {player,abbr,rows,gp,stats:s,yards:s[yard],average:kind === 'rushing' && known(s.carries) && Number(s.carries) > 0 && known(s.rushingYards) ? Number(s.rushingYards)/Number(s.carries) : null};
  }
  function leaders(abbr,kind) {
    return players(abbr).map(player => playerSummary(player,abbr,kind)).filter(p => p.gp && known(p.yards) && (kind === 'rushing' ? known(p.stats.carries) && Number(p.stats.carries)>0 : known(p.stats.targets) && Number(p.stats.targets)>0 || known(p.stats.receptions) && Number(p.stats.receptions)>0)).sort((a,b) => Number(b.yards)-Number(a.yards) || String(a.player.name).localeCompare(String(b.player.name))).slice(0,5);
  }
  function selectedPlayer() {
    const split = state.player?.indexOf(':');
    if (split > 0) {
      const abbr = state.player.slice(0,split), player = playerById(abbr,state.player.slice(split+1));
      if (player && teamPair().includes(abbr)) return {player,abbr};
    }
    const other = otherTeam(), choices = other ? leaders(other,'receiving') : [];
    const godwin = choices.find(item => /chris godwin/i.test(item.player.name || ''));
    const choice = godwin || choices[0] || leaders(state.team,'receiving')[0] || leaders(state.team,'rushing')[0];
    return choice ? {player:choice.player,abbr:choice.abbr} : null;
  }
  function displayValue(value,gp,digits = 0) { return fmt(state.mode === 'average' && known(value) && gp ? Number(value)/gp : value,state.mode === 'average' ? Math.max(1,digits) : digits); }
  function timestamp(value) {
    const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date) : 'Unavailable';
  }
  function dateTime(game) {
    if (!game?.kickoffUtc || !Number.isFinite(Date.parse(game.kickoffUtc))) return 'Kickoff unavailable';
    const date = new Date(game.kickoffUtc);
    return `${new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short'}).format(date)} · ${new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date)}`;
  }
  const button = (text,action,extra = '',cls = '') => `<button class="${cls}" data-mb-action="${action}" ${extra}>${escape(text)}${icon('chevron')}</button>`;
  const diamond = (text,action,extra = '',cls = '') => cls.includes('mb-continue') ? `<section class="mb-continue mb-framed">${button(text,action,extra,'mb-diamond-button')}</section>` : button(text,action,extra,`mb-diamond-button ${cls}`);
  function header() {
    return `<div class="mb-ambient" aria-hidden="true"></div><header class="mb-brand"><img class="mb-brand-mark" src="assets/home/gate-brand.webp" alt="Project Dollar" width="1800" height="693"><p class="mb-brand-subtitle">SPORTS DATA & RESEARCH</p><button class="mb-back${state.team !== 'DAL' ? ' mb-back-wrap' : ''}" data-mb-action="back">${icon('back')} Back to ${escape(city(state.team))}</button><div class="mb-season"><img src="assets/home/nfl.svg" alt="NFL" width="500" height="500"><span>NFL<br>${dataset?.season || ''} REGULAR SEASON</span></div></header><div class="mb-breadcrumb mb-framed"><div class="mb-crumbs"><button data-mb-action="nfl">NFL</button>${icon('chevron')}<button data-mb-action="ladder">LADDER</button>${icon('chevron')}<button data-mb-action="back">${escape(panelName(state.team))}</button>${icon('chevron')}<button data-mb-action="fixture">${fixtureLabel(fixture())}</button></div></div>`;
  }
  function fixtureHeader() {
    const game = fixture(), opponent = otherTeam();
    return `<section class="mb-title mb-framed"><h1>MATCHUP BREAKDOWN</h1></section><section class="mb-fixture mb-framed${!teamPair().every(abbr => ['DAL','TB'].includes(abbr)) ? ' mb-generic-fixture' : ''}" data-mb-fixture="${escape(game?.id || '')}"><button class="mb-fixture-team" data-mb-action="team" data-mb-team="${escape(state.team)}" aria-label="Open ${escape(identity(state.team).fullName)} team details"><img class="mb-fixture-logo" src="${escape(logo(state.team))}" alt="${escape(identity(state.team).fullName)}" width="500" height="500"></button><div class="mb-fixture-copy"><h2>${game ? `${escape(city(game.away_team))} AT ${escape(city(game.home_team))} · WEEK ${game.week}` : 'VERIFIED FIXTURE UNAVAILABLE'}</h2><p>${escape(dateTime(game))}<br>${escape(game?.venue || 'Venue unavailable')}${game?.location ? ` · ${escape(game.location)}` : ''}</p>${liveStatus(game)}</div>${opponent ? `<button class="mb-fixture-team" data-mb-action="team" data-mb-team="${escape(opponent)}" aria-label="Open ${escape(identity(opponent).fullName)} team details"><img class="mb-fixture-logo" src="${escape(logo(opponent))}" alt="${escape(identity(opponent).fullName)}" width="500" height="500"></button>` : ''}</section>`;
  }
  function tabs() {
    return `<div class="mb-tabs" role="tablist" aria-label="Matchup research">${[['form','Form & H2H'],['players','Players & QB'],['lineup','Lineup & Travel']].map(([value,label]) => `<button id="matchup-tab-${value}" data-mb-tab="${value}" role="tab" aria-controls="matchup-panel-${value}" aria-selected="${state.tab === value}" tabindex="${state.tab === value ? '0' : '-1'}">${label}</button>`).join('')}</div>`;
  }
  function context() {
    return `<div class="mb-context"><div class="mb-settings mb-context-settings"><label>Window <select class="mb-select" id="matchup-window-select" aria-label="Matchup game window">${[3,5,10].map(n => `<option value="${n}" ${state.window === n ? 'selected' : ''}>Last ${n}</option>`).join('')}</select></label><div class="mb-mode-controls" role="group" aria-label="Matchup statistical presentation"><button data-mb-mode="total" aria-pressed="${state.mode === 'total'}">Totals</button><button data-mb-mode="average" aria-pressed="${state.mode === 'average'}">Per game</button></div><label><select class="mb-select" id="matchup-season-select" aria-label="Matchup season filter"><option value="cross" ${state.season === 'cross' ? 'selected' : ''}>Cross-season</option><option value="current" ${state.season === 'current' ? 'selected' : ''}>${dataset.season} only</option></select></label><label><select class="mb-select" id="matchup-venue-select" aria-label="Matchup venue filter">${[['all','All venues'],['home','Home'],['away','Away'],['neutral','Neutral']].map(([v,l]) => `<option value="${v}" ${state.venue === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><div class="mb-context-note mb-verification"><span>Last ${state.window} team games · GP = stat games · DNP ≠ 0</span><button data-mb-action="sources">${error ? 'RETAINED DATA · CHECK FAILED' : 'SOURCES'} · — UNAVAILABLE/DISPUTED ${icon('info')}</button></div></div>`;
  }
  function leaderPanel(abbr,kind) {
    const rows = leaders(abbr,kind), rush = kind === 'rushing';
    const columns = rush ? ['PLAYER','GP','ATT','YDS','AVG','TD',''] : ['PLAYER','GP','TGT','REC','YDS','TD',''];
    return `<section class="mb-leader-panel mb-framed" data-mb-leaders="${escape(abbr)}:${kind}"><header class="mb-panel-head"><img class="mb-team-emblem" src="${escape(logo(abbr))}" alt="" width="500" height="500"><h2 title="${escape(identity(abbr).fullName)}" aria-label="${escape(identity(abbr).fullName)} top ${rows.length} ${rush ? 'rushers' : 'receivers'}"><span>${escape(compactPanelName(abbr))} · TOP ${rows.length || ''}</span> <span>${rush ? 'RUSHERS' : 'RECEIVERS'}</span></h2><span class="mb-ranking-tag">Verified yards</span></header><table class="mb-leader-table"><thead><tr>${columns.map((c,index) => `<th scope="col" ${index === columns.length-1 ? 'aria-label="Open player research"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(item => {
      const p = item.player, attrs = `data-mb-player="${escape(p.id)}" data-mb-team="${escape(abbr)}" data-mb-kind="${kind}"`, cells = rush ? [fmt(item.gp),displayValue(item.stats.carries,item.gp),displayValue(item.stats.rushingYards,item.gp),fmt(item.average,1),displayValue(item.stats.rushingTD,item.gp)] : [fmt(item.gp),displayValue(item.stats.targets,item.gp),displayValue(item.stats.receptions,item.gp),displayValue(item.stats.receivingYards,item.gp),displayValue(item.stats.receivingTD,item.gp)];
      const fields = rush ? ['GP','carries','rushingYards','rushingYardsPerCarry','rushingTD'] : ['GP','targets','receptions','receivingYards','receivingTD'];
      return `<tr data-mb-player-row="${escape(p.id)}" data-mb-team="${escape(abbr)}" data-mb-kind="${kind}"><th scope="row"><button class="mb-player-button mb-name-wrap" ${attrs} title="${escape(p.name)}" aria-label="Open ${escape(p.name)} ${kind} game log">${escape(shortName(p))}</button></th>${cells.map((cell,index) => {const field = fields[index], disputed = (dataset.disagreements || []).some(issue => issue.playerId === p.id && issue.field === field && item.rows.some(row => gameId(row) === issue.gameId));return `<td data-mb-field="${field}" ${disputed ? `data-mb-status="disputed" title="${escape(`${p.name} · ${field}: sources disagree; open Sources for both values`)}" aria-label="${escape(`${field} unavailable: sources disagree`)}"` : ''}>${cell}</td>`;}).join('')}<td><button class="mb-player-open" ${attrs} aria-label="Open ${escape(p.name)} ${kind} game log">${icon('chevron')}</button></td></tr>`;
    }).join('') || `<tr><td colspan="7" class="mb-empty">Verified eligible ${rush ? 'rushing' : 'receiving'} appearances unavailable.</td></tr>`}</tbody></table>${rows.length < 5 ? `<p class="mb-coverage-note">${rows.length} eligible player${rows.length === 1 ? '' : 's'} verified. No placeholder rows.</p>` : ''}</section>`;
  }
  function playerDetail() {
    const selected = selectedPlayer();
    if (!selected) return `<section class="mb-player-detail mb-framed"><h2>PLAYER GAME LOG</h2><p class="mb-empty">Verified player history is unavailable for this selected team-game window.</p></section>`;
    const {player,abbr} = selected, games = selectedGames(abbr), kind = state.kind, metric = kind === 'rushing' ? 'rushingYards' : 'receivingYards';
    return `<section class="mb-player-detail mb-framed" data-mb-player-detail="${escape(abbr)}:${escape(player.id)}"><header class="mb-panel-head"><img class="mb-team-emblem" src="${escape(logo(abbr))}" alt="" width="500" height="500"><div><h2>${escape(player.name)} · ${escape(abbr)}</h2><p class="mb-player-subtitle">${kind === 'rushing' ? 'RUSHER' : 'RECEIVER'} GAME LOG · LAST ${games.length} TEAM GAMES</p></div><small>Team-game window; DNP is not zero.</small></header><div class="mb-game-strip"><strong>GAME LOG:</strong>${games.map((game,index) => { const row = rowFor(player,game,abbr), value = stat(row,metric), notPlayed = verifiedDNP(row); return `<button data-mb-action="player-game" data-mb-game="${escape(game.id)}" data-mb-player="${escape(player.id)}" data-mb-team="${escape(abbr)}" title="${escape(`${game.season} Week ${game.week} vs ${opponentOf(game,abbr)} · ${notPlayed ? 'Verified DNP' : known(value) ? `${fmt(value)} ${kind} yards` : 'Statistic unavailable'}`)}">G${index+1} <b>${notPlayed ? 'DNP' : fmt(value)}</b></button>`; }).join('') || '<span>No eligible completed team games.</span>'}</div><div class="mb-player-insights">${button('Targets & snaps','targets')}${button('Routes & red zone','routes')}${button('Why a low game?','low')}</div></section>`;
  }
  function projectedQB(abbr) {
    const teamEvidence = selectedEvidence(abbr);
    if (teamEvidence?.status === 'unavailable') return {player:null,label:'QB unavailable',evidence:teamEvidence};
    if (teamEvidence?.status === 'disputed') return {player:null,label:'QB disputed',evidence:teamEvidence};
    const list = players(abbr).filter(p => p.position === 'QB'), ranked = list.filter(p => known(p.qbEvidence?.depthRank ?? p.depth?.rank)).sort((a,b) => Number(a.qbEvidence?.depthRank ?? a.depth?.rank)-Number(b.qbEvidence?.depthRank ?? b.depth?.rank));
    const projectedId = teamEvidence?.playerId;
    const player = list.find(p => String(p.id) === String(projectedId)) || ranked[0] || list.sort((a,b) => Number(b.seasonStats?.passingYards || 0)-Number(a.seasonStats?.passingYards || 0))[0] || null;
    if (!player) return {player:null,label:'QB unavailable',evidence:null};
    const evidence = {...selectedEvidence(abbr,player),...teamEvidence};
    const confirmed = (evidence.confirmedStarter === true || evidence.confirmed === true) && evidence.status === 'verified';
    return {player,evidence,label:confirmed ? 'Confirmed QB' : evidence.projected === true && evidence.status === 'inferred' ? 'Projected QB' : known(evidence.depthRank ?? player.depth?.rank) ? 'Depth-chart QB' : 'QB projection unavailable'};
  }
  function qbRows(abbr,player) {
    if (!player) return [];
    let rows = logs(player).filter(row => completedLog(row,abbr) && (row.started?.candidate === true || row.started?.value === true) && (!row.seasonType || ['REG','2'].includes(String(row.seasonType))) && (state.season === 'cross' || Number(row.season) === Number(dataset?.season)) && (state.venue === 'all' || row.homeAway === state.venue));
    if (state.qb === 'opponent') rows = rows.filter(row => row.opponent === (abbr === state.team ? otherTeam() : state.team));
    if (state.qb === 'venue') rows = rows.filter(row => row.homeAway === venueOf(fixture(),abbr));
    return rows.sort(recent).slice(0,state.window);
  }
  function passerRating(s) {
    if (!['attempts','completions','passingYards','passingTD','interceptions'].every(key => known(s[key])) || Number(s.attempts) <= 0) return null;
    const a = Number(s.attempts), cap = n => Math.max(0,Math.min(2.375,n));
    return 100*(cap((Number(s.completions)/a-.3)*5)+cap((Number(s.passingYards)/a-3)*.25)+cap(Number(s.passingTD)/a*20)+cap(2.375-Number(s.interceptions)/a*25))/6;
  }
  function qbSummary(abbr,player) {
    const rows = qbRows(abbr,player), pressure = state.qb === 'pressure', gp = rows.filter(verifiedStart).length, rolesComplete = rows.length > 0 && gp === rows.length;
    const keys = ['attempts','completions','passingYards','passingTD','interceptions','sacks','carries','rushingYards','fumbles'];
    const s = Object.fromEntries(keys.map(key => [key,pressure || !rolesComplete ? null : sumRows(rows,key)]));
    if (pressure && rolesComplete) {
      for (const key of keys) {
        const values = rows.map(row => row.advanced?.underPressure?.[key]);
        s[key] = values.length && values.every(known) ? values.reduce((sum,value) => sum+Number(value),0) : null;
      }
    }
    return {rows,stats:s,gp,roleSlots:rows.length,unresolvedRoles:rows.length-gp,completionPct:known(s.completions) && known(s.attempts) && Number(s.attempts)>0 ? 100*Number(s.completions)/Number(s.attempts) : null,yardsPerAttempt:known(s.passingYards) && known(s.attempts) && Number(s.attempts)>0 ? Number(s.passingYards)/Number(s.attempts) : null,rating:passerRating(s)};
  }
  function qbCard(abbr) {
    const {player,label,evidence} = projectedQB(abbr), summary = qbSummary(abbr,player), s = summary.stats, gp = summary.gp;
    const pair = (a,b) => `${displayValue(a,gp)} / ${displayValue(b,gp)}`;
    const values = [['CMP / ATT',pair(s.completions,s.attempts)],['CMP%',known(summary.completionPct) ? `${fmt(summary.completionPct,1)}%` : '—'],['PASS YDS',displayValue(s.passingYards,gp)],['YDS / ATT',fmt(summary.yardsPerAttempt,1)],['TD / INT',pair(s.passingTD,s.interceptions)],['PASSER RATING',fmt(summary.rating,1)],['SACKS',displayValue(s.sacks,gp)],['RUSH ATT / YDS',pair(s.carries,s.rushingYards)],['FUMBLES',displayValue(s.fumbles,gp)]];
    const report = evidence?.reportStatus || evidence?.gameStatus || player?.injury?.reportStatus;
    const fields = ['completions/attempts','completionPct','passingYards','yardsPerAttempt','passingTD/interceptions','passerRating','sacks','carries/rushingYards','fumbles'];
    const last = summary.rows.find(verifiedStart), missing = gp && gp < state.window;
    const injuredBackups = players(abbr).filter(p => p.position === 'QB' && p.id !== player?.id && (selectedEvidence(abbr,p).reportStatus || selectedEvidence(abbr,p).reportedInactive === true));
    const aside = missing ? `<aside class="mb-qb-last-start"><strong aria-label="Last source-verified start against ${escape(last.opponent)}">LAST START · vs ${escape(last.opponent)}</strong><small>${last.season} W${last.week} · all plays</small><dl><dt>CMP / ATT</dt><dd>${fmt(stat(last,'completions'))} / ${fmt(stat(last,'attempts'))}</dd><dt>PASS YDS</dt><dd>${fmt(stat(last,'passingYards'))}</dd><dt>TD</dt><dd>${fmt(stat(last,'passingTD'))}</dd><dt>INT</dt><dd>${fmt(stat(last,'interceptions'))}</dd><dt>RUSH YDS</dt><dd>${fmt(stat(last,'rushingYards'))}</dd></dl><p>${summary.unresolvedRoles ? `${gp} confirmed in ${summary.roleSlots} selected slot${summary.roleSlots === 1 ? '' : 's'}; no padding.` : `${gp} verified start${gp === 1 ? '' : 's'} available; no padding.`}</p></aside>` : '';
    return `<section class="mb-qb-card" data-mb-qb-team="${escape(abbr)}"><header class="mb-qb-heading"><img class="mb-team-emblem" src="${escape(logo(abbr))}" alt="" width="500" height="500"><h3>${escape(player?.name || 'Quarterback unavailable')} · ${escape(abbr)}</h3><button class="mb-qb-tag" data-mb-action="qb-status" data-mb-team="${escape(abbr)}">${escape(label)}</button></header><div class="mb-qb-body"><table class="mb-stat-table"><tbody>${values.map(([key,value],index) => `<tr><th scope="row">${key}</th><td data-mb-field="${fields[index]}">${escape(value)}</td></tr>`).join('')}</tbody></table>${aside}</div><p class="mb-qb-coverage">${gp} verified start${gp === 1 ? '' : 's'}${summary.unresolvedRoles ? ` · ${summary.unresolvedRoles} disputed/unavailable role${summary.unresolvedRoles === 1 ? '' : 's'}; totals unavailable` : ''} · ${state.qb === 'pressure' ? 'pressure splits; — = unavailable' : state.mode === 'average' ? 'per start; rates from totals' : 'totals; rates from totals'}</p>${report ? `<button class="mb-qb-injury" data-mb-action="qb-status" data-mb-team="${escape(abbr)}">${escape(report)} · sources</button>` : ''}${injuredBackups.map(p => `<button class="mb-qb-injury" data-mb-action="qb-status" data-mb-team="${escape(abbr)}" data-mb-player="${escape(p.id)}">${escape(shortName(p))} · ${escape(selectedEvidence(abbr,p).reportedInactive === true ? 'ESPN-reported INACTIVE' : selectedEvidence(abbr,p).reportStatus)}</button>`).join('')}${!gp ? '<p class="mb-qb-no-start">Verified starts unavailable; unresolved source roles are retained without substituting older starts.</p>' : ''}</section>`;
  }
  function qbPanel() {
    return `<section class="mb-qb-panel mb-framed" id="matchup-qb-panel"><header class="mb-panel-head"><span class="mb-qb-symbol" aria-hidden="true">${icon('settings')}</span><h2>QUARTERBACK DEEP DIVE</h2></header><div class="mb-qb-grid" id="matchup-qb-context" role="tabpanel" aria-labelledby="matchup-qb-${state.qb}">${teamPair().map(qbCard).join('')}</div><div class="mb-qb-tabs" role="tablist" aria-label="Quarterback research context">${[['last5',`Last ${state.window} starts`],['opponent','Vs opponent'],['pressure','Under pressure'],['venue','Home / away']].map(([value,label]) => `<button id="matchup-qb-${value}" data-mb-qb="${value}" role="tab" aria-controls="matchup-qb-context" aria-selected="${state.qb === value}" tabindex="${state.qb === value ? '0' : '-1'}">${label}</button>`).join('')}</div><div class="mb-insight-grid">${[['Pressure & sack rate','pressure'],['Scrambles & designed runs','scrambles'],['Pass depth & air yards','depth'],['Protection & blitz','protection'],['Red-zone attempts','redzone'],['Receiver target share','share']].map(([label,action]) => button(label,action)).join('')}</div><p class="mb-coverage-note">Starts require source confirmation. Prior clubs remain in personal history. Missing advanced tracking is unavailable.</p></section>`;
  }
  function playersContent() {
    const pair = teamPair();
    return `${context()}<div class="mb-leader-grid">${['rushing','receiving'].map(kind => pair.map(abbr => leaderPanel(abbr,kind)).join('')).join('')}</div>${playerDetail()}${qbPanel()}${diamond('CONTINUE TO LINEUP & TRAVEL','continue','','mb-continue mb-framed')}`;
  }
  function score(game,abbr) {
    const own = game.home_team === abbr ? game.home_score : game.away_score, other = game.home_team === abbr ? game.away_score : game.home_score;
    return !final(game) ? '—' : `${Number(own)>Number(other) ? 'W' : Number(own)<Number(other) ? 'L' : 'T'} ${fmt(own)}–${fmt(other)}`;
  }
  function formContent() {
    const opponent = otherTeam(), old = club()?.headToHeadCoverage, historical = old?.opponent === opponent ? availableGames(state.team) : allGames(state.team);
    const h2h = opponent ? historical.filter(game => final(game) && opponentOf(game,state.team) === opponent && (state.season === 'cross' || Number(game.season) === Number(dataset.season)) && (state.venue === 'all' || venueOf(game,state.team) === state.venue)).sort(recent).slice(0,state.window) : [];
    return `${context()}<div class="mb-form-grid">${teamPair().map(abbr => `<section class="mb-form-panel mb-panel mb-framed"><header class="mb-panel-head"><img class="mb-team-emblem" src="${escape(logo(abbr))}" alt="" width="500" height="500"><h2>${escape(panelName(abbr))} · LAST ${state.window} GAMES</h2></header><table class="mb-form-table"><thead><tr><th>GAME</th><th>OPPONENT</th><th>RESULT</th><th title="Yards gained">YDS FOR</th><th title="Yards allowed">YDS AG</th><th></th></tr></thead><tbody>${selectedGames(abbr).map(game => `<tr><th>${game.season} W${game.week}</th><td>${venueOf(game,abbr) === 'away' ? '@ ' : ''}${escape(opponentOf(game,abbr))}${venueOf(game,abbr) === 'neutral' ? ' (N)' : ''}</td><td>${score(game,abbr)}</td><td>${fmt(game.stats?.[abbr]?.totalOffense)}</td><td>${fmt(game.stats?.[opponentOf(game,abbr)]?.totalOffense)}</td><td>${button('Report','report',`data-mb-game="${escape(game.id)}" data-mb-team="${escape(abbr)}"`)}</td></tr>`).join('') || '<tr><td colspan="6">Verified completed games unavailable.</td></tr>'}</tbody></table></section>`).join('')}</div><section class="mb-h2h mb-panel mb-framed"><header class="mb-panel-head"><h2>HEAD-TO-HEAD · ${escape(state.team)} vs ${escape(opponent || '—')}</h2></header>${h2h.length ? `<table class="mb-form-table"><thead><tr><th>GAME</th><th>VENUE</th><th>RESULT</th><th></th></tr></thead><tbody>${h2h.map(game => `<tr><th>${game.season} W${game.week}</th><td>${escape(game.venue || 'Unavailable')}</td><td>${score(game,state.team)}</td><td>${button('Report','report',`data-mb-game="${escape(game.id)}" data-mb-team="${escape(state.team)}"`)}</td></tr>`).join('')}</tbody></table>` : '<p class="mb-empty">No verified completed head-to-head games in the available history. No earlier result is substituted.</p>'}<p class="mb-coverage-note">${escape(old?.opponent === opponent ? old.note || 'Source-linked historical regular-season meetings; no padded rows.' : `Historical team-game coverage: ${dataset.coverage?.seasons?.join(', ') || 'see Sources'} regular seasons.`)}</p></section>${diamond('CONTINUE TO PLAYERS & QB','players','','mb-continue mb-framed')}`;
  }
  function mergedInjuries(abbr) {
    const injury = club(abbr)?.injuries, game = fixture(), report = eventReport(game,abbr);
    const snapshot = Array.isArray(injury) ? injury : injury?.players || [];
    const rows = snapshot.filter(row => game && Number(row.season ?? dataset?.season) === Number(game.season) && Number(row.week ?? injury?.week) === Number(game.week));
    for (const row of report?.availability?.players || []) if (row.gameId === game?.id && row.team === abbr && Number(row.week) === Number(game.week)) rows.push({...row,providerNote:row.reportedInactive === true ? 'ESPN-reported INACTIVE; incomplete provider report, not an official inactive list.' : 'ESPN event availability report; no absence-to-healthy inference.'});
    const normalizedName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
    const roster = Array.isArray(club(abbr)?.roster) ? club(abbr).roster : [];
    const candidates = [...players(abbr),...roster], groups = new Map();
    for (const row of rows) {
      const canonical = candidates.find(player => normalizedName(player.name) === normalizedName(row.name));
      const id = row.playerId || row.id || canonical?.id || `${abbr}:${normalizedName(row.name)}`;
      if (!groups.has(String(id))) groups.set(String(id),{id,name:row.name || canonical?.name || 'Player unavailable',contexts:new Map()});
      const group = groups.get(String(id)), season = row.season ?? injury?.season ?? dataset?.season, week = row.week ?? injury?.week;
      const key = `${season ?? 'unknown'}:${week ?? 'unknown'}`;
      if (!group.contexts.has(key)) group.contexts.set(key,{season,week,rows:[],sourceIds:new Set()});
      const context = group.contexts.get(key); context.rows.push(row);
      for (const sourceId of row.sourceIds || injury?.sourceIds || []) context.sourceIds.add(sourceId);
    }
    return [...groups.values()];
  }
  function injuryMarkup(group) {
    const unique = values => [...new Map(values.filter(value => value !== null && value !== undefined && String(value).trim() !== '').map(value => [String(value).trim().toLowerCase(),String(value).trim()])).values()];
    return `<div class="mb-injury-entry" data-mb-injury-player="${escape(group.id)}">${[...group.contexts.values()].map(context => {
      const reports = unique(context.rows.map(row => row.reportStatus || row.status)), practices = unique(context.rows.map(row => row.practiceStatus || row.practice));
      const sources = [...context.sourceIds], label = known(context.season) && known(context.week) ? `${context.season} W${context.week}` : 'Season/week context unavailable';
      const note = context.rows.map(row => `${row.injury || 'Injury detail unavailable'} · ${row.sourceTimestamp || 'Report time unavailable'} · ${(row.sourceIds || []).join(', ')}`).join('\n');
      return `<p data-mb-injury-sources="${escape(sources.join(' '))}">${escape(group.name)} · ${escape(reports.length ? `${reports.join(' / ')}${reports.length > 1 ? ' · SOURCE DISAGREEMENT' : ''}` : 'Game status unavailable')}<small>${escape(practices.length ? `${practices.join(' / ')}${practices.length > 1 ? ' · SOURCE DISAGREEMENT' : ''}` : 'Practice participation unavailable')}</small>${context.rows.filter(row => row.providerNote).map(row => `<small>${escape(row.providerNote)}</small>`).join('')}<small class="mb-injury-source-note" title="${escape(note)}">${escape(label)} · ${sources.length} source${sources.length === 1 ? '' : 's'} · see Sources</small></p>`;
    }).join('')}</div>`;
  }
  function lineupContent() {
    const game = fixture();
    return `<section class="mb-travel mb-panel mb-framed"><header class="mb-panel-head"><h2>LINEUP & TRAVEL · WEEK ${escape(game?.week || '—')}</h2></header><dl class="mb-info-grid"><dt>Kickoff</dt><dd>${escape(dateTime(game))}</dd><dt>Venue</dt><dd>${escape(game?.venue || 'Unavailable')}</dd><dt>Surface / roof</dt><dd>${escape(game?.surface || 'Unavailable')} / ${escape(game?.roof || 'Unavailable')}</dd>${teamPair().map(abbr => `<dt>${escape(abbr)} · home / away</dt><dd>${escape(game ? venueOf(game,abbr).toUpperCase() : 'Unavailable')}</dd><dt>${escape(abbr)} · published rest days</dt><dd>${fmt(game ? game.home_team === abbr ? game.homeRest : game.awayRest : null)}</dd>`).join('')}<dt>Travel itinerary</dt><dd>Unavailable</dd><dt>Weather forecast</dt><dd>${escape(game?.weather?.status === 'verified' ? game.weather.summary : 'Unavailable')}</dd><dt>Official complete inactives</dt><dd>${teamPair().every(abbr => eventReport(game,abbr)?.availability?.completeOfficialList === true) ? 'See explicitly source-confirmed event reports' : 'Unavailable · ESPN provider reports below are incomplete and unofficial'}</dd></dl><div class="mb-lineup-actions">${teamPair().map(abbr => button(`${panelName(abbr)} schedule`,'schedule',`data-mb-team="${escape(abbr)}"`)).join('')}</div></section><div class="mb-lineup-grid">${teamPair().map(abbr => {
      const depth = club(abbr)?.depth, d = Array.isArray(depth) ? depth : depth?.players || [], injuryRows = mergedInjuries(abbr), selectedReport = eventReport(game,abbr), bulletins = selectedReport?.availability?.currentTeamBulletin || [];
      return `<section class="mb-lineup-card mb-panel mb-framed"><header class="mb-panel-head"><img class="mb-team-emblem" src="${escape(logo(abbr))}" alt="" width="500" height="500"><h2>${escape(panelName(abbr))} · LINEUP</h2></header><h3>QB & DEPTH CHART</h3><p>${escape(projectedQB(abbr).player?.name || 'Quarterback unavailable')} · ${escape(projectedQB(abbr).label)}</p><details class="mb-depth-list"><summary>${d.length ? `${d.length} source-linked depth entries` : 'Depth information unavailable'}</summary>${d.map(p => `<p>${escape(p.position)} · ${escape(p.name)} · ${escape(p.label || (known(p.rank) ? `Depth rank ${p.rank}` : 'Rank unavailable'))}</p>`).join('') || '<p>No verified depth entries available.</p>'}</details><h3>INJURY & PRACTICE REPORTS</h3>${injuryRows.map(injuryMarkup).join('') || '<p class="mb-empty">Selected-fixture injury/practice reports unavailable. Missing reports do not mean healthy.</p>'}${bulletins.length ? `<p class="mb-coverage-note">${bulletins.length} dated current-team bulletin entries are attached to this future endpoint. They do not establish availability or inactivity for Week ${escape(game.week)}.</p>` : ''}${button('QB status & evidence','qb-status',`data-mb-team="${escape(abbr)}"`)}</section>`;
    }).join('')}</div>${diamond('BACK TO PLAYERS & QB','players','','mb-continue mb-framed')}`;
  }
  function navbar() {
    return [['home','Home','home'],['teams','Teams','shield'],['matchups','Matchups','matchups'],['insights','Insights','insights'],['sources','More','more']].map(([action,label,symbol]) => `<button data-mb-action="${action}" ${action === 'matchups' ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('');
  }
  function focusSelector(node) {
    if (!node) return null;
    if (node.id) return `#${CSS.escape(node.id)}`;
    for (const attr of ['data-mb-action','data-mb-player','data-mb-tab','data-mb-mode','data-mb-qb']) {
      const value = node.getAttribute?.(attr); if (!value) continue;
      let selector = `button[${attr}="${CSS.escape(value)}"]`;
      for (const extra of ['data-mb-team','data-mb-kind','data-mb-game']) if (node.hasAttribute(extra)) selector += `[${extra}="${CSS.escape(node.getAttribute(extra))}"]`;
      const section = node.closest?.('#matchup-bottom-nav,#matchup-footer');
      return section ? `#${section.id} ${selector}` : selector;
    }
    return null;
  }
  function footer() {
    const node = $('matchup-footer'); if (!node) return;
    const stale = dataset && Date.now()-Date.parse(dataset.retrievedAt)>12*60*60*1000;
    node.innerHTML = `<button data-mb-action="sources">${icon('info')} Sources</button><span>${error ? 'RETAINED DATA · CHECK FAILED' : stale ? 'SNAPSHOT MAY BE STALE' : 'SOURCE-BACKED MATCHUP'} · ${dataset?.season || ''}<small>${escape(timestamp(dataset?.retrievedAt))}</small></span><button class="mb-refresh" data-mb-action="refresh" aria-label="Refresh verified matchup data" aria-busy="${!!loading}" aria-disabled="${!!loading}">↻</button>`;
    node.dataset.checkedAt = checkedAt || '';
  }
  function ensureDialog() {
    let dialog = $('matchup-breakdown-dialog');
    if (dialog || !page()) return dialog;
    dialog = document.createElement('dialog'); dialog.id = 'matchup-breakdown-dialog'; dialog.className = 'mb-dialog'; dialog.setAttribute('aria-labelledby','matchup-dialog-title');
    dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close matchup research">×</button></form><h2 id="matchup-dialog-title"></h2><div id="matchup-dialog-content"></div>';
    page().appendChild(dialog);
    dialog.addEventListener('close',() => { state.view = null; const target = returnFocus?.isConnected ? returnFocus : returnSelector ? page()?.querySelector(returnSelector) : null; if (target && active()) target.focus({preventScroll:true}); });
    return dialog;
  }
  function render() {
    const holder = $('matchup-breakdown-content'); if (!holder) return;
    const scroll = page()?.querySelector('.page-scroll'), top = scroll?.scrollTop || 0, selector = focusSelector(document.activeElement);
    holder.innerHTML = !dataset || !club() ? `${header()}<section class="mb-framed mb-loading"><h1>MATCHUP BREAKDOWN</h1><p>${escape(error || (dataset ? 'This team is unavailable in the verified matchup feed.' : 'Loading verified matchup research…'))}</p>${button('Retry verified data','refresh')}</section>` : `${header()}${fixtureHeader()}${tabs()}${['form','players','lineup'].map(tab => `<div id="matchup-panel-${tab}" class="mb-tab-panel" role="tabpanel" aria-labelledby="matchup-tab-${tab}" ${state.tab !== tab ? 'hidden' : ''}>${state.tab !== tab ? '' : tab === 'form' ? formContent() : tab === 'lineup' ? lineupContent() : playersContent()}</div>`).join('')}`;
    const nav = $('matchup-bottom-nav'); if (nav && !nav.querySelector('button')) nav.insertAdjacentHTML('afterbegin',navbar());
    if (scroll) scroll.scrollTop = top;
    footer(); ensureDialog();
    if (selector) page()?.querySelector(selector)?.focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('pd:matchup-render',{detail:{team:state.team,tab:state.tab}}));
  }
  function sourceContent(ids = []) {
    const sources = (dataset?.sources || []).filter(source => !ids.length || ids.includes(source.id));
    const issues = (dataset?.disagreements || []).filter(issue => !issue.team || teamPair().includes(issue.team));
    return `<p>${dataset?.season || ''} regular season · through Week ${dataset?.throughWeek ?? '—'}<br>Retrieved ${escape(timestamp(dataset?.retrievedAt))}${checkedAt ? `<br>Browser checked ${escape(timestamp(checkedAt))}` : ''}</p><p>Totals use published statistical rows; starts and snap-confirmed appearances are separate. GP counts source-recorded statistical games with at least one published numeric statistical field within the selected team-game window; snap-confirmed appearances and starts are tracked separately. A statistical row does not by itself confirm physical participation. Selected windows exclude preseason. Missing or disputed statistics, tracking, practice or inactives are unavailable. A statistical appearance is not proof of a start. No missing game is set to zero. Checks follow published source updates, not a connected live play-by-play feed.</p>${issues.length ? `<section class="mb-source-differences"><h3>SOURCE DISAGREEMENTS</h3>${issues.map(issue => `<p>${escape(issue.playerId ? `${playerById(issue.team || state.team,issue.playerId)?.name || issue.playerId} · ` : '')}${escape(issue.issue || issue.field)}${issue.gameId ? `<br>${escape(issue.gameId)}` : ''}<br>${escape(issue.values?.join(' / ') || '')}<br>${escape(issue.action || 'Disputed value remains unavailable.')}</p>`).join('')}</section>` : ''}<ul class="mb-source-list">${sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name || source.id)}</a><br>${escape(source.status)} · ${escape(timestamp(source.retrievedAt))}</li>`).join('')}</ul>`;
  }
  const rowSourceIds = rows => [...new Set(rows.flatMap(row => [...(row.sourceIds || []),...(row.appearance?.sourceIds || []),...(row.started?.sourceIds || []),...Object.values(row.advancedProvenance?.fieldSources || {}).flat(),...(row.disagreements || []).flatMap(issue => issue.sourceIds || [])]))];
  const humanField = key => String(key).replace(/([A-Z])/g,' $1').replace(/^./,c => c.toUpperCase());
  function allStats(row) {
    return `<details class="mb-all-stats"><summary>All published game statistics</summary><table><tbody>${Object.entries(row?.stats || {}).map(([key,value]) => `<tr><th>${escape(humanField(key))}</th><td>${fmt(value,1)}</td></tr>`).join('') || '<tr><td>Unavailable</td></tr>'}</tbody></table></details>`;
  }
  const opponentHistoryButton = (player,abbr) => player ? button(`Last 5 vs ${abbr === state.team ? otherTeam() || 'opponent' : state.team}`,'opponent-history',`data-mb-team="${escape(abbr)}" data-mb-player="${escape(player.id)}"`) : '';
  function historyTable(player,abbr,keys) {
    const rows = selectedGames(abbr).map(game => ({game,row:rowFor(player,game,abbr)}));
    return `<div class="mb-dialog-table-wrap"><table><thead><tr><th>GAME</th><th>STATUS</th>${keys.map(([label]) => `<th>${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(({game,row}) => `<tr><th>${game.season} W${game.week} · ${escape(opponentOf(game,abbr))}</th><td>${verifiedDNP(row) ? 'DNP' : appeared(row) ? 'Verified row' : 'Unavailable'}</td>${keys.map(([,key,advanced]) => `<td>${fmt(advanced ? row?.advanced?.[key] : row?.stats?.[key],1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function reportContent(game,abbr) {
    if (!game) return '<p>This game is unavailable in the verified matchup source.</p>';
    const own = game.stats?.[abbr] || {}, other = game.stats?.[opponentOf(game,abbr)] || {};
    return `<p>${final(game) ? `${escape(game.away_team)} ${fmt(game.away_score)} — ${fmt(game.home_score)} ${escape(game.home_team)}` : `${escape(game.away_team)} at ${escape(game.home_team)}`}<br>${game.season} WEEK ${game.week} · ${escape(reportedEvent(game)?.eventStatus?.description || game.status || 'Unavailable')}<br>${escape(dateTime(game))}<br>${escape(game.venue || 'Venue unavailable')}</p>${liveStatus(game)}<table><thead><tr><th>METRIC</th><th>${escape(abbr)}</th><th>${escape(opponentOf(game,abbr))}</th></tr></thead><tbody>${[['Net passing','netPassing'],['Rushing','rushing'],['Total offence','totalOffense'],['Third downs made','thirdDownMade'],['Third-down attempts','thirdDownAttempts'],['Red-zone touchdowns','redZoneTD'],['Red-zone attempts','redZoneAttempts'],['Turnovers','turnovers'],['Penalty yards','penaltyYards']].map(([label,key]) => `<tr><th>${label}</th><td>${fmt(own[key])}</td><td>${fmt(other[key])}</td></tr>`).join('')}</tbody></table>${sourceContent([...new Set([...(game.sourceIds || []),...(reportedEvent(game)?.sourceIds || [])])])}`;
  }
  function dialogContent(action,buttonNode) {
    const selected = selectedPlayer(), abbr = buttonNode?.dataset.mbTeam || selected?.abbr || state.team, p = buttonNode?.dataset.mbPlayer ? playerById(abbr,buttonNode.dataset.mbPlayer) : selected?.player;
    let title = 'Matchup sources & integrity', content = sourceContent();
    const windowRows = p ? eligibleRows(p,abbr).map(item => item.row) : [];
    if (action === 'player-game') {
      const game = allGames(abbr).find(g => g.id === buttonNode.dataset.mbGame), row = p && game ? rowFor(p,game,abbr) : null;
      title = `${p?.name || 'Player'} · ${game?.season || ''} Week ${game?.week || '—'}`;
      content = `<p>${escape(abbr)} vs ${escape(game ? opponentOf(game,abbr) : '—')} · ${escape(game?.venue || 'Venue unavailable')}<br>${escape(dateTime(game))}</p><p>${verifiedDNP(row) ? 'Source-confirmed DNP. Statistics are not filled with zero.' : row && Object.values(row.stats || {}).some(known) ? 'Source-recorded game-level statistical row. A statistical row does not by itself confirm physical participation or a start.' : row?.started?.value === true && row.started.status === 'verified' ? 'Source-designated quarterback start; player statistics unavailable. Not zero or DNP.' : 'Player appearance/statistics unavailable for this team game. Missing data does not establish DNP.'}</p><table><tbody>${[['PASS YDS','passingYards'],['PASS TD','passingTD'],['CMP','completions'],['PASS ATT','attempts'],['INT','interceptions'],['SACKS','sacks'],['RUSH ATT','carries'],['RUSH YDS','rushingYards'],['RUSH TD','rushingTD'],['TARGETS','targets'],['RECEPTIONS','receptions'],['REC YDS','receivingYards'],['REC TD','receivingTD'],['FUMBLES','fumbles']].map(([label,key]) => `<tr><th>${label}</th><td>${fmt(stat(row,key))}</td></tr>`).join('')}</tbody></table>${allStats(row)}${opponentHistoryButton(p,abbr)}${sourceContent(row ? rowSourceIds([row]) : game?.sourceIds || [])}`;
    } else if (action === 'opponent-history') {
      const weeklyOpponent = abbr === state.team ? otherTeam() : state.team;
      const history = logs(p).filter(row => completedLog(row,abbr) && row.opponent === weeklyOpponent && (!row.seasonType || ['REG','2'].includes(String(row.seasonType))) && (state.season === 'cross' || Number(row.season) === Number(dataset.season)) && (state.venue === 'all' || row.homeAway === state.venue)).sort(recent).slice(0,5);
      title = `${p?.name || 'Player'} · Last 5 vs ${weeklyOpponent || 'opponent'}`;
      content = `<p>${history.length} source-recorded regular-season game entr${history.length === 1 ? 'y' : 'ies'} against this fixture’s opponent within available source coverage; ${history.filter(row => Object.values(row.stats || {}).some(known)).length} contain published statistical values. Previous clubs and source-designated starts without statistics are retained. Missing statistics are unavailable; missing games are not invented or padded.</p>${history.map(row => `<section class="mb-opponent-game"><h3>${row.season} W${row.week} · ${escape(row.team)} vs ${escape(row.opponent)}</h3><p>${escape(dateTime(row))} · ${escape(row.homeAway || 'Venue designation unavailable')}</p><table><tbody>${[['PASS','passingYards'],['PASS TD','passingTD'],['RUSH','rushingYards'],['RUSH TD','rushingTD'],['REC','receivingYards'],['REC TD','receivingTD'],['TARGETS','targets'],['RECEPTIONS','receptions']].map(([label,key]) => `<tr><th>${label}</th><td>${fmt(stat(row,key))}</td></tr>`).join('')}</tbody></table>${allStats(row)}</section>`).join('') || '<p>Verified opponent-specific player history unavailable.</p>'}${sourceContent(rowSourceIds(history))}`;
    } else if (['targets','routes','low'].includes(action)) {
      title = `${p?.name || 'Player'} · ${action === 'targets' ? 'Targets & snaps' : action === 'routes' ? 'Routes & red zone' : 'Game context'}`;
      const keys = action === 'targets' ? [['TARGETS','targets'],['REC','receptions'],['REC YDS','receivingYards'],['OFF SNAPS','snaps',true],['SNAP%','offensiveSnapPct',true]] : action === 'routes' ? [['ROUTES','routes',true],['RZ TGT','redZoneTargets',true],['RZ REC','redZoneReceptions',true],['RZ REC TD','redZoneReceivingTD',true]] : [['TARGETS','targets'],['REC','receptions'],['REC YDS','receivingYards'],['CARRIES','carries'],['RUSH YDS','rushingYards']];
      content = p ? `${historyTable(p,abbr,keys)}<p>${action === 'low' ? 'Verified volume and game context are shown above. A cause for low production cannot be established from totals alone; injury, routes, coverage and coaching intent are not inferred.' : '— = unavailable tracking or incomplete source coverage. Missing rows are not DNP or zero.'}</p>${opponentHistoryButton(p,abbr)}${sourceContent(rowSourceIds(windowRows))}` : '<p>Choose a verified player row to open their research.</p>';
    } else if (['pressure','scrambles','depth','protection','redzone','share'].includes(action)) {
      const settings = {pressure:{title:'Pressure & sack rate',keys:[['PRESSURES','pressures',true],['DROPBACKS','dropbacks',true],['SACKS','sacks'],['SACK%','sackRate',true]]},scrambles:{title:'Scrambles & designed runs',keys:[['SCRAMBLES','scrambles',true],['DESIGNED RUNS','designedRuns',true],['RUSH ATT','carries'],['RUSH YDS','rushingYards']]},depth:{title:'Pass depth & air yards',keys:[['AIR YDS','passingAirYards'],['A-DOT','averageDepthOfTarget',true],['DEEP ATT','deepAttempts',true]]},protection:{title:'Protection & blitz',keys:[['BLITZES','blitz',true],['PRESSURES','pressures',true],['HITS','qbHits',true],['SACKS','sacks']]},redzone:{title:'Red-zone attempts',keys:[['RZ PASS ATT','redZonePassAttempts',true],['RZ PASS TD','redZonePassTD',true],['RZ RUSH ATT','redZoneRushAttempts',true]]},share:{title:'Receiver target share',keys:[['TARGETS','targets'],['REC','receptions'],['REC YDS','receivingYards']]}};
      const config = settings[action]; title = config.title;
      content = teamPair().map(teamAbbr => {
        const q = projectedQB(teamAbbr).player, starts = qbRows(teamAbbr,q);
        if (action === 'share') {
          return `<h3>${escape(panelName(teamAbbr))} · RECEIVER TARGET SHARE</h3><p>Each source-derived game percentage uses that game’s complete team-target denominator. Missing or disputed player targets invalidate the dependent share; no average of percentages is asserted.</p>${leaders(teamAbbr,'receiving').map(item => `<h4>${escape(item.player.name)}</h4>${historyTable(item.player,teamAbbr,[['TARGETS','targets'],['TEAM TARGETS','teamTargets',true],['TARGET SHARE%','targetShare',true]])}`).join('') || '<p>Verified receiver rows unavailable.</p>'}`;
        }
        return `<h3>${escape(q?.name || 'QB unavailable')} · ${escape(teamAbbr)}</h3><table><thead><tr><th>START / ROLE STATUS</th>${config.keys.map(([label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${starts.map(row => `<tr><th>${row.season} W${row.week} vs ${escape(row.opponent)}<small>${verifiedStart(row) ? 'Confirmed' : row.started?.status === 'disputed' ? 'Disputed role' : 'Role unavailable'}</small></th>${config.keys.map(([,key,advanced]) => `<td>${fmt(verifiedStart(row) ? advanced ? row.advanced?.[key] : stat(row,key) : null,1)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${config.keys.length+1}">Verified starts unavailable.</td></tr>`}</tbody></table>${action === 'pressure' ? `<p>Pressure and sack rates require a verified dropback denominator. Sacks are not substituted for pressure.</p>` : ''}`;
      }).join('')+`<p>Advanced tracking remains unavailable when absent. Basic totals are not substituted for named splits.</p>${sourceContent()}`;
    } else if (action === 'qb-status') {
      const projected = projectedQB(abbr), qbPlayer = buttonNode?.dataset.mbPlayer ? playerById(abbr,buttonNode.dataset.mbPlayer) : projected.player, evidence = qbPlayer?.id === projected.player?.id ? projected.evidence : selectedEvidence(abbr,qbPlayer);
      title = `${qbPlayer?.name || 'QB unavailable'} · ${abbr} evidence`;
      content = `<p>${escape(qbPlayer?.id === projected.player?.id ? projected.label : 'Roster quarterback')}. ${escape(evidence?.note || 'Depth rank does not guarantee the game-day starter.')}</p><dl><dt>Depth rank</dt><dd>${fmt(evidence?.depthRank ?? qbPlayer?.depth?.rank)}</dd><dt>Game status</dt><dd>${escape(evidence?.reportStatus || evidence?.gameStatus || 'Unavailable')}</dd><dt>Provider-reported inactive</dt><dd>${evidence?.reportedInactive === true ? 'ESPN-reported INACTIVE · incomplete provider report; not official confirmation' : 'Unavailable / not established'}</dd><dt>Practice participation</dt><dd>${escape(evidence?.practiceStatus || 'Unavailable')}</dd><dt>Confirmed starter</dt><dd>${(evidence?.confirmedStarter === true || evidence?.confirmed === true) && evidence?.status === 'verified' ? 'Source-confirmed' : 'Unavailable'}</dd><dt>Projection</dt><dd>${evidence?.projected === true && evidence?.status === 'inferred' ? 'Inferred from source-linked depth and injury reports' : 'Unavailable / not projected'}</dd></dl>${sourceContent([...new Set([...(evidence?.sourceIds || []),...(evidence?.injurySourceIds || [])])])}`;
    } else if (action === 'report' || action === 'fixture') {
      const game = action === 'fixture' ? fixture() : availableGames(abbr).find(g => g.id === buttonNode.dataset.mbGame);
      title = game ? `${game.away_team} at ${game.home_team} · Week ${game.week}` : 'Game unavailable'; content = reportContent(game,abbr);
    } else if (action === 'schedule') {
      title = `${identity(abbr).fullName} · ${dataset.season} schedule`;
      content = `<table><thead><tr><th>WEEK</th><th>OPPONENT</th><th>KICKOFF / RESULT</th></tr></thead><tbody>${allGames(abbr).filter(g => Number(g.season) === Number(dataset.season)).sort((a,b) => Number(a.week)-Number(b.week)).map(g => `<tr><th>W${g.week}</th><td>${venueOf(g,abbr) === 'away' ? '@ ' : ''}${escape(opponentOf(g,abbr))}${venueOf(g,abbr) === 'neutral' ? ' (N)' : ''}</td><td>${final(g) ? escape(score(g,abbr)) : escape(dateTime(g))}<button data-mb-action="report" data-mb-team="${escape(abbr)}" data-mb-game="${escape(g.id)}">Open game ${icon('chevron')}</button></td></tr>`).join('')}</tbody></table>${sourceContent()}`;
    }
    return {title,content};
  }
  function show(action,node,preserveView = false) {
    if (!dataset) return;
    const dialog = ensureDialog(); if (!dialog) return;
    const wasOpen = dialog.open, focused = wasOpen && dialog.contains(document.activeElement) ? document.activeElement : null;
    const focusedHref = focused?.matches('a[href]') ? focused.getAttribute('href') : null, focusedSelector = focused ? focusSelector(focused) : null;
    const oldDetails = [...$('matchup-dialog-content').querySelectorAll('details')], detailFocus = focused?.matches('summary') ? oldDetails.indexOf(focused.parentElement) : -1;
    const openedDetails = preserveView ? oldDetails.map(detail => detail.open) : [], oldScroll = dialog.scrollTop;
    const content = dialogContent(action,node); $('matchup-dialog-title').textContent = content.title; $('matchup-dialog-content').innerHTML = content.content;
    const newDetails = [...$('matchup-dialog-content').querySelectorAll('details')];
    if (preserveView) {newDetails.forEach((detail,index) => {detail.open = openedDetails[index] === true;});dialog.scrollTop = oldScroll;}
    state.view = {action,attrs:{...node?.dataset}};
    if (!dialog.open) { returnFocus = node || document.activeElement; returnSelector = focusSelector(returnFocus); dialog.showModal(); }
    else if (focused) {
      const target = focused.isConnected ? focused : focusedHref ? [...dialog.querySelectorAll('a[href]')].find(link => link.getAttribute('href') === focusedHref) : preserveView && detailFocus >= 0 ? newDetails[detailFocus]?.querySelector('summary') : focusedSelector ? dialog.querySelector(focusedSelector) : null;
      (target || dialog.querySelector('.dialog-close')).focus({preventScroll:true});
    }
  }
  function writeRoute() {
    const q = new URLSearchParams(); if (state.tab !== 'players') q.set('tab',state.tab); if (state.game) q.set('game',state.game);
    if (state.window !== 5) q.set('window',state.window); if (state.season !== 'cross') q.set('season',state.season); if (state.venue !== 'all') q.set('venue',state.venue); if (state.mode !== 'total') q.set('mode',state.mode); if (state.qb !== 'last5') q.set('qb',state.qb); if (state.player) {q.set('player',state.player);q.set('kind',state.kind);}
    const value = `matchup/${state.team}${q.size ? `?${q}` : ''}`; if (location.hash !== `#${value}`) history.replaceState(null,'',`#${value}`);
  }
  function enter(abbr = 'DAL',id = null,tab = 'players') {
    const teamAbbr = String(abbr || 'DAL').toUpperCase(), originTeam = location.hash.match(/^#team\/([A-Z]+)(?:\?|$)/i)?.[1]?.toUpperCase();
    state.returnRoute = originTeam === teamAbbr ? location.hash.slice(1) : `team/${teamAbbr}`;
    state.fromLadder = document.querySelector('.page.active')?.dataset.page === 'nfl' || originTeam === teamAbbr && window.PDTeamDetails?.getState()?.fromLadder === true;
    if (state.team !== teamAbbr) {state.team = teamAbbr;state.player = null;state.venue = 'all';}
    state.game = id || null; state.tab = ['form','players','lineup'].includes(tab) ? tab : 'players';
    const params = new URLSearchParams(); if (id) params.set('game',id);if (state.tab !== 'players')params.set('tab',state.tab);
    window.PDApp?.openPage(`matchup/${teamAbbr}${params.size ? `?${params}` : ''}`);
  }
  function route(value) {
    const [path,query] = String(value || 'matchup/DAL').split('?'), abbr = path.split('/')[1]?.toUpperCase() || 'DAL', q = new URLSearchParams(query || '');
    if (state.team !== abbr) {state.returnRoute = `team/${abbr}`;state.fromLadder = false;}
    state.team = abbr; state.tab = ['form','players','lineup'].includes(q.get('tab')) ? q.get('tab') : 'players'; state.window = [3,5,10].includes(Number(q.get('window'))) ? Number(q.get('window')) : 5;
    state.season = q.get('season') === 'current' ? 'current' : 'cross'; state.venue = ['all','home','away','neutral'].includes(q.get('venue')) ? q.get('venue') : 'all'; state.mode = q.get('mode') === 'average' ? 'average' : 'total'; state.qb = ['last5','opponent','pressure','venue'].includes(q.get('qb')) ? q.get('qb') : 'last5'; state.player = q.get('player'); state.kind = q.get('kind') === 'rushing' ? 'rushing' : 'receiving'; state.game = q.get('game');
    render(); return refresh();
  }
  async function refresh(force = false) {
    if (loading) return loading;
    if (dataset && !force && Date.now()-lastCheck<60000) return dataset;
    lastCheck = Date.now(); page()?.querySelector('[data-mb-action="refresh"]')?.setAttribute('aria-busy','true');
    loading = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
      try {
        const response = await fetch('assets/data/matchup-breakdown.json',{cache:'no-cache',signal:controller.signal});
        if (!response.ok) throw new Error(`Verified matchup feed returned HTTP ${response.status}`);
        const value = await response.json();
        if (value.schemaVersion !== 1 || !value.teams?.DAL?.games || !Number.isFinite(Date.parse(value.retrievedAt)) || !Array.isArray(value.sources) || !value.sources.length) throw new Error('Verified matchup dataset is invalid');
        if (dataset && Date.parse(value.retrievedAt)<Date.parse(dataset.retrievedAt)) throw new Error('Older matchup snapshot rejected; preceding verified data retained');
        const changed = !dataset || JSON.stringify(dataset)!==JSON.stringify(value), recovered = error !== null, open = state.view;
        if (changed) dataset = value;
        error = null; checkedAt = new Date().toISOString(); document.documentElement.dataset.matchupDataReady = 'true';
        if (active() && (changed || recovered)) {render();if(open)show(open.action,{dataset:open.attrs},true);}
        document.dispatchEvent(new CustomEvent('pd:matchup-data-ready',{detail:{changed,recovered,checkedAt,reason:force ? 'manual-or-source' : 'entry-or-poll'}}));
        return dataset;
      } catch (err) {
        error = `${dataset ? 'Retained preceding verified data. ' : ''}${err.name === 'AbortError' ? 'Matchup source request timed out.' : err.message}`;
        document.documentElement.dataset.matchupDataReady = dataset ? 'true' : 'error'; if (active() && !dataset) render();
        document.dispatchEvent(new CustomEvent('pd:matchup-data-error',{detail:{message:error,retained:!!dataset}}));
      } finally {
        clearTimeout(timeout); loading = null;
        if (active()) { const footerNode = $('matchup-footer'), span = footerNode?.querySelector('span'); if (span && dataset) {span.innerHTML = `${error ? 'RETAINED DATA · CHECK FAILED' : 'SOURCE-BACKED MATCHUP'} · ${dataset.season}<small>${escape(timestamp(dataset.retrievedAt))}</small>`;footerNode.dataset.checkedAt = checkedAt || '';}
          const refreshButton = page()?.querySelector('[data-mb-action="refresh"]');refreshButton?.setAttribute('aria-busy','false');refreshButton?.setAttribute('aria-disabled','false');
        }
      }
    })(); return loading;
  }
  function changeTab(tab,focus = true) {
    state.tab = tab; writeRoute(); render(); const node = $(`matchup-tab-${tab}`); if (focus) {node?.scrollIntoView({block:'start',behavior:'auto'});node?.focus({preventScroll:true});}
  }
  document.addEventListener('click',event => {
    const node = event.target.closest('button') || event.target.closest('tr[data-mb-player-row]')?.querySelector('.mb-player-button'); if (!node || !node.closest('[data-page="matchup-breakdown"]')) return;
    if (node.dataset.mbTab) return changeTab(node.dataset.mbTab);
    if (node.dataset.mbMode) {state.mode = node.dataset.mbMode;writeRoute();render();page()?.querySelector(`[data-mb-mode="${state.mode}"]`)?.focus({preventScroll:true});return;}
    if (node.dataset.mbQb) {state.qb = node.dataset.mbQb;writeRoute();render();page()?.querySelector(`[data-mb-qb="${state.qb}"]`)?.focus({preventScroll:true});return;}
    const action = node.dataset.mbAction;
    if (!action && node.dataset.mbPlayer) {state.player = `${node.dataset.mbTeam}:${node.dataset.mbPlayer}`;state.kind = node.dataset.mbKind || 'receiving';writeRoute();render();const detail = page()?.querySelector('[data-mb-player-detail]');detail?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});detail?.querySelector('button')?.focus({preventScroll:true});return;}
    if (action === 'back' || action === 'teams') {window.PDApp?.openPage(state.returnRoute || `team/${state.team}`);return;}
    if (action === 'team') {window.PDApp?.openPage(`team/${node.dataset.mbTeam || state.team}`);return;}
    if (action === 'nfl' || action === 'ladder') {window.PDApp?.openLadder(state.team,!state.fromLadder);return;}
    if (action === 'home') {window.PDApp?.openPage('home');return;}
    if (action === 'continue') return changeTab('lineup');
    if (action === 'players' || action === 'matchups') return changeTab('players');
    if (action === 'insights') {changeTab('players',false);$('matchup-qb-panel')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});page()?.querySelector('[data-mb-qb]')?.focus({preventScroll:true});return;}
    if (action === 'refresh') {if(!loading)refresh(true);return;}
    if (action) show(action,node);
  });
  document.addEventListener('change',event => {
    const key = {'matchup-window-select':'window','matchup-season-select':'season','matchup-venue-select':'venue'}[event.target.id]; if (!key) return;
    state[key] = key === 'window' ? Number(event.target.value) : event.target.value;writeRoute();render();$(event.target.id)?.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event => {
    const list = event.target.closest('.mb-tabs,.mb-qb-tabs'); if (!list || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const items = [...list.querySelectorAll('[role="tab"]')], index = items.indexOf(document.activeElement); if(index<0)return;event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;items[next].click();
  });
  document.addEventListener('pd:route-change',event => { if(event.detail?.page !== 'matchup-breakdown' && $('matchup-breakdown-dialog')?.open)$('matchup-breakdown-dialog').close(); });
  document.addEventListener('pd:data-ready',() => {if(active())refresh(true);});
  document.addEventListener('visibilitychange',() => {if(!document.hidden && active())refresh();});
  window.addEventListener('focus',() => {if(active())refresh();});
  window.addEventListener('online',() => {if(active())refresh(true);});
  setInterval(() => {if(!document.hidden && active())refresh();},90000);
  window.MatchupBreakdown = {route,enter,render,refresh,getState:() => ({...state}),getDataset:() => dataset,getSelectedGames:selectedGames,getFixture:fixture,getFixtureReport:() => reportedEvent(fixture()),getLeaders:leaders,getQBSummary:abbr => qbSummary(abbr,projectedQB(abbr).player)};
  if (/^#matchup\//i.test(location.hash)) route(location.hash.slice(1));
})();
