(() => {
  'use strict';

  // The dashboard is a view of the existing verified snapshot. It never alters
  // the feed, invents results, or routes unfinished destinations to another page.
  let context = null;
  let bound = false;
  let cachedData = null;
  let cachedGames = [];
  let weeklyDataset = null, weeklyGames = [], weeklyReports = {}, weeklyLoading = null, weeklyError = null;
  let weeklyRetry = null, weeklyFailures = 0, lastSnapshot = null, pendingWeeklyRefresh = false;
  // Conference records refresh independently of the larger research books.
  // Neither a standings refresh nor a failed request rewrites those snapshots.
  let standingsDataset = null, standingsRequest = null, standingsError = null, standingsTimer = null;
  let standingsETag = null, standingsModified = null, standingsFailures = 0, standingsLastAttempt = 0;
  const $ = id => document.getElementById(id);
  const exists = value => value !== null && value !== undefined && value !== '';
  const finite = value => exists(value) && Number.isFinite(Number(value));
  const getAbbr = team => team.abbr || String(team.id || '').toUpperCase();
  const rightChevron = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#chevron"></use></svg>';
  // Give source initials readable spacing without changing the stored name.
  const readablePlayerName = player => String(player.short || player.name || '').replace(/^([A-Za-z]{1,3}\.)(?=\S)/, '$1 ');

  function validateStandings(feed) {
    const invalid = () => { throw new Error('The independent standings feed did not pass validation'); };
    if (feed?.schemaVersion !== 1 || !Number.isInteger(feed.season) || feed.source?.status !== 'verified' || !Number.isFinite(Date.parse(feed.source?.retrievedAt)) || !feed.source?.url || feed.ranking?.official !== false || !Array.isArray(feed.teams) || feed.teams.length !== 32 || !feed.weeks || !Object.keys(feed.weeks).length || !Array.isArray(feed.games)) invalid();
    const identities = new Set(feed.teams.map(getAbbr));
    if (identities.size !== 32) invalid();
    for (const [key,week] of Object.entries(feed.weeks)) {
      if (!Number.isInteger(Number(key)) || !Number.isInteger(week.throughWeek) || week.throughWeek < 0 || week.throughWeek > Number(key)) invalid();
      const rows = [...(week.conferences?.AFC || []),...(week.conferences?.NFC || [])];
      if (week.conferences?.AFC?.length !== 16 || week.conferences?.NFC?.length !== 16 || new Set(rows.map(getAbbr)).size !== 32) invalid();
      for (const team of rows) {
        if (!identities.has(getAbbr(team)) || !['w','l','ties','pointsFor','pointsAgainst'].every(field => Number.isInteger(team[field]) && team[field] >= 0) || !finite(team.pct) || Number(team.pct) < 0 || Number(team.pct) > 1) invalid();
      }
      const coverage = week.coverage;
      if (!coverage || !['finalGames','scheduledGames'].every(field => Number.isInteger(coverage[field]) && coverage[field] >= 0) || !['completedGamesInThroughWeek','scheduledGamesInThroughWeek'].every(field => Number.isInteger(week[field]) && week[field] >= 0) || coverage.finalGames > coverage.scheduledGames || week.completedGamesInThroughWeek > week.scheduledGamesInThroughWeek) invalid();
    }
    const gameIds = new Set();
    for (const game of feed.games) {
      if (!game.id || gameIds.has(game.id) || Number(game.season) !== feed.season || game.seasonType !== 'REG' || game.status !== 'final' || !identities.has(game.home_team) || !identities.has(game.away_team) || game.home_team === game.away_team || !Number.isInteger(game.week) || !['home_score','away_score'].every(field => Number.isInteger(game[field]) && game[field] >= 0)) invalid();
      gameIds.add(game.id);
    }
    for (const week of Object.values(feed.weeks)) {
      const finals = feed.games.filter(game => game.week <= week.throughWeek);
      if (finals.length !== week.coverage.finalGames || finals.filter(game => game.week === week.throughWeek).length !== week.completedGamesInThroughWeek) invalid();
      for (const team of [...week.conferences.AFC,...week.conferences.NFC]) {
        const abbr = getAbbr(team), totals = {w:0,l:0,ties:0,pointsFor:0,pointsAgainst:0};
        finals.filter(game => game.home_team === abbr || game.away_team === abbr).forEach(game => {
          const home = game.home_team === abbr, own = home ? game.home_score : game.away_score, other = home ? game.away_score : game.home_score;
          totals[own > other ? 'w' : own < other ? 'l' : 'ties']++;
          totals.pointsFor += own; totals.pointsAgainst += other;
        });
        const played = totals.w + totals.l + totals.ties;
        const pct = played ? (totals.w + totals.ties / 2) / played : 0;
        if (Object.keys(totals).some(field => totals[field] !== team[field]) || Math.abs(pct - Number(team.pct)) > .00051) invalid();
      }
    }
    if (standingsDataset && (feed.season < standingsDataset.season || feed.season === standingsDataset.season && Date.parse(feed.source.retrievedAt) < Date.parse(standingsDataset.source.retrievedAt))) throw new Error('An older standings feed was returned; retaining verified records');
    return feed;
  }

  function scheduleStandingsCheck() {
    clearTimeout(standingsTimer);
    const delay = standingsError ? Math.min(300000,15000 * 2 ** Math.min(standingsFailures - 1,5)) : 300000;
    standingsTimer = setTimeout(() => { if (!document.hidden) loadStandingsSource(true); },delay);
  }

  function loadStandingsSource(force = false) {
    if (standingsRequest) return standingsRequest;
    if (!force && standingsLastAttempt) return Promise.resolve(false);
    standingsLastAttempt = Date.now();
    clearTimeout(standingsTimer);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    const headers = {};
    if (standingsETag) headers['If-None-Match'] = standingsETag;
    if (standingsModified) headers['If-Modified-Since'] = standingsModified;
    standingsRequest = Promise.resolve().then(async () => {
      const response = await fetch(new URL('assets/data/standings.json',document.baseURI),{cache:'no-cache',headers,signal:controller.signal});
      if (response.status !== 304) {
        if (!response.ok) throw new Error(`Standings request failed (HTTP ${response.status})`);
        const feed = validateStandings(await response.json());
        standingsDataset = feed;
        standingsETag = response.headers?.get('ETag') || null;
        standingsModified = response.headers?.get('Last-Modified') || null;
      } else if (!standingsDataset) throw new Error('Standings request returned no validated records');
      standingsError = null; standingsFailures = 0;
      return true;
    }).catch(error => { standingsError = error; standingsFailures++; return false; }).finally(() => {
      clearTimeout(timeout);
      standingsRequest = null;
      scheduleStandingsCheck();
      if (context) rerender();
    });
    return standingsRequest;
  }

  function recordsSnapshot(snapshot) {
    const {data,state} = context;
    // A manually selected historical week keeps its approved entering-week
    // snapshot. The current browsing week takes independently refreshed records.
    const week = standingsDataset?.weeks?.[state.week];
    const savedRetrievedAt = data.sources?.find(source => source.id === 'nflverse_games')?.retrievedAt || data.retrievedAt;
    if (String(state.week) !== String(state.currentBrowsingWeek) || standingsDataset?.season !== data.season || !week || week.throughWeek < snapshot.throughWeek || Date.parse(standingsDataset.source.retrievedAt) < Date.parse(savedRetrievedAt)) return snapshot;
    return {...snapshot,throughWeek:week.throughWeek,conferences:week.conferences,recordsFeed:standingsDataset,recordsCoverage:{...week.coverage,completedGamesInThroughWeek:week.completedGamesInThroughWeek,scheduledGamesInThroughWeek:week.scheduledGamesInThroughWeek}};
  }

  function coverageLabel(snapshot) {
    const coverage = snapshot.recordsCoverage;
    if (coverage) return `Week ${snapshot.throughWeek}: ${coverage.completedGamesInThroughWeek}/${coverage.scheduledGamesInThroughWeek} finals · ${coverage.finalGames}/${coverage.scheduledGames} through Week ${snapshot.throughWeek}`;
    const finals = completedGames(context.data,snapshot.throughWeek).length;
    const scheduled = weeklyDataset ? weeklyGames.filter(game => Number(game.week) <= snapshot.throughWeek).length : null;
    return `${finals}${scheduled === null ? ' retained finals · schedule total unavailable' : `/${scheduled} retained finals through Week ${snapshot.throughWeek}`}`;
  }

  function recordsSource(snapshot) {
    return snapshot.recordsFeed?.source || context.data.sources?.find(source => source.id === 'nflverse_games') || {retrievedAt:context.data.retrievedAt};
  }

  // The team source retains the whole league schedule. Consume its integrity-
  // applied public dataset; never alter a source book or infer final scores.
  function adoptWeeklySource() {
    const next = window.PDTeamDetails?.getDataset();
    if (!next || next._sourceIntegrity?.status !== 'verified' || Number(next.season) !== Number(context?.data.season)) return false;
    if (next === weeklyDataset) return false;
    const games = new Map();
    Object.values(next.teams || {}).forEach(team => (team.games || []).forEach(game => {
      if (game.id && Number(game.season) === Number(next.season) && game.seasonType === 'REG') games.set(game.id,game);
    }));
    weeklyDataset = next;
    weeklyGames = [...games.values()].sort((a,b) => String(a.kickoffUtc || `${a.gameday}T00:00:00Z`).localeCompare(String(b.kickoffUtc || `${b.gameday}T00:00:00Z`)) || a.id.localeCompare(b.id));
    // Catalog cloning happens once per source version, not once per card.
    weeklyReports = window.PDSourceIntegrity?.getLastCatalog()?.games || {};
    weeklyError = null;
    return true;
  }

  function loadWeeklySource(force = false) {
    adoptWeeklySource();
    if (weeklyLoading) { if (force) pendingWeeklyRefresh = true; return; }
    if (!force && (weeklyError || weeklyDataset && Number(weeklyDataset.season) === Number(context?.data.season))) return;
    clearTimeout(weeklyRetry);
    weeklyLoading = Promise.resolve().then(async () => {
      if (!window.PDTeamDetails?.refresh) throw new Error('The league schedule is unavailable');
      const loaded = await window.PDTeamDetails.refresh(force);
      if (loaded === false) throw new Error('The league schedule could not be refreshed; retained verified games');
      adoptWeeklySource();
      if (!weeklyDataset || Number(weeklyDataset.season) !== Number(context?.data.season)) throw new Error('The league schedule could not be verified');
      weeklyFailures = 0; weeklyError = null;
    }).catch(error => { weeklyError = error; weeklyFailures++; }).finally(() => {
      weeklyLoading = null;
      // Keep verified games visible and retry transport/integrity failures.
      if (weeklyError) weeklyRetry = setTimeout(() => { if (!document.hidden) loadWeeklySource(true); },Math.min(300000,15000 * 2 ** Math.min(weeklyFailures-1,4)));
      if (context) rerender();
      if (pendingWeeklyRefresh) { pendingWeeklyRefresh = false; loadWeeklySource(true); }
      if (context?.state.nflPendingMatchup) {
        context.state.nflPendingMatchup = false;
        if (!weeklyError && document.querySelector('.page.active')?.dataset.page === 'nfl') openWeeklyGame(selectedWeeklyGame(context.data.weeks[context.state.week]));
      }
    });
  }

  function gamesThisWeek() {
    if (!weeklyDataset || Number(weeklyDataset.season) !== Number(context.data.season)) return [];
    return weeklyGames.filter(game => Number(game.week) === Number(context.state.week));
  }

  function teamIdentity(abbr) {
    const club = weeklyDataset?.teams?.[abbr] || context.data.teams?.find(team => getAbbr(team) === abbr);
    const name = club?.name || context.teamName(abbr), fullName = club?.fullName || name;
    const city = fullName.endsWith(` ${name}`) ? fullName.slice(0,-name.length-1) : '';
    return {abbr,name,fullName,city:city || 'Location unavailable'};
  }

  function finalGame(game) { return game.status === 'final' && finite(game.home_score) && finite(game.away_score); }
  function hasGameReport(game) {
    const entry = weeklyReports[game.id];
    return game.status === 'final' && entry?.status === 'final' && Number(entry.season) === Number(game.season) && Number(entry.week) === Number(game.week) && entry.home_team === game.home_team && entry.away_team === game.away_team;
  }
  function gameStatus(game) {
    if (game.status === 'final') return finalGame(game) ? 'Final' : 'Final · score unavailable';
    if (game.kickoffUtc && Number.isFinite(Date.parse(game.kickoffUtc)) && Date.parse(game.kickoffUtc) <= Date.now()) return 'Awaiting result';
    return 'Upcoming';
  }
  function selectedWeeklyGame(snapshot) {
    const games = gamesThisWeek(), {state,data} = context;
    const weekKey = `${data.season}/${state.week}`;
    if (state.nflWeeklyWeek !== weekKey || !games.some(game => game.id === state.nflWeeklyGame)) {
      state.nflWeeklyWeek = weekKey;
      state.nflWeeklyGame = games.find(game => game.id === snapshot.fixture?.id)?.id || games[0]?.id || null;
    }
    return games.find(game => game.id === state.nflWeeklyGame) || null;
  }
  function openWeeklyGame(game, compare = false) {
    if (!game) return;
    if (!compare && hasGameReport(game) && window.PDApp?.openGameReport) window.PDApp.openGameReport(game.away_team,game.id,'overview','nfl');
    else window.MatchupBreakdown?.enter(game.away_team,game.id,compare ? 'form' : 'players','nfl');
  }
  function weeklyLoadingMessage(matchup = false) {
    return `<p class="nfl-recap-empty" role="status">${weeklyError ? 'The league schedule could not load.' : weeklyLoading ? context.state.nflPendingMatchup ? 'Opening this week’s matchup after the schedule loads…' : 'Loading this week’s games…' : 'No source games are available for this week.'}</p>${weeklyError ? '<button class="nfl-detail-button" data-nfl-action="weekly-retry">Retry schedule</button>' : matchup && weeklyLoading ? '<button class="nfl-detail-button" data-nfl-action="matchups">Open matchup when ready</button>' : ''}`;
  }

  function completedGames(data, throughWeek) {
    if (cachedData !== data) {
      const games = new Map();
      // Every recap retains the source game ID and actual final score. Unioning
      // those records exposes prior completed weeks without another request.
      Object.values(data.weeks || {}).forEach(week => {
        (week.recap || []).forEach(game => {
          if (game.id && game.status === 'final' && game.season === data.season && finite(game.home_score) && finite(game.away_score)) games.set(game.id, game);
        });
      });
      cachedData = data;
      cachedGames = [...games.values()].sort((a,b) => Number(a.week) - Number(b.week) || String(a.gameday).localeCompare(String(b.gameday)) || a.id.localeCompare(b.id));
    }
    return cachedGames.filter(game => Number(game.week) <= Number(throughWeek));
  }

  function teamResults(data, snapshot, team) {
    const abbr = getAbbr(team);
    const games = (snapshot.recordsFeed?.games || completedGames(data, snapshot.throughWeek)).filter(game => Number(game.week) <= snapshot.throughWeek && (game.home_team === abbr || game.away_team === abbr));
    const sourceIds = [...new Set(games.map(game => game.sourceId).filter(Boolean))];
    const provenance = {status:'derived',season:data.season,throughWeek:snapshot.throughWeek,sourceIds,retrievedAt:snapshot.recordsFeed?.source?.retrievedAt || data.sources?.find(source => source.id === 'nflverse_games')?.retrievedAt || data.retrievedAt,note:'Calculated from complete retained final scores, checked against sourced record and points totals. Home/away follows the source designation, including neutral venues.'};
    const unavailable = () => ({complete:false,games:[],form:[],home:null,away:null,provenance:{...provenance,status:'unavailable',note:'Retained final scores are incomplete or disagree with the sourced record/points totals.'}});
    const expected = Number(team.w) + Number(team.l) + Number(team.ties || 0);
    // A partial historical recap must not masquerade as a complete form or split.
    if (!Number.isFinite(expected) || games.length !== expected) return unavailable();
    const splits = {home:{w:0,l:0,t:0},away:{w:0,l:0,t:0}};
    const results = games.map(game => {
      const home = game.home_team === abbr;
      const own = Number(home ? game.home_score : game.away_score);
      const other = Number(home ? game.away_score : game.home_score);
      const result = own > other ? 'W' : own < other ? 'L' : 'T';
      // Neutral-site games remain in the published home/away designation.
      splits[home ? 'home' : 'away'][result.toLowerCase()] += 1;
      return {game,result,own,other,home,opponent:home ? game.away_team : game.home_team};
    });
    const totalFor = results.reduce((sum,item) => sum + item.own,0);
    const totalAgainst = results.reduce((sum,item) => sum + item.other,0);
    const consistent = results.filter(item => item.result === 'W').length === Number(team.w)
      && results.filter(item => item.result === 'L').length === Number(team.l)
      && (!finite(team.pointsFor) || totalFor === Number(team.pointsFor))
      && (!finite(team.pointsAgainst) || totalAgainst === Number(team.pointsAgainst));
    return consistent ? {complete:true,games:results,form:results.map(item => item.result),...splits,provenance} : unavailable();
  }

  function initializeState(state) {
    if (!Object.hasOwn(state,'nflDivision')) state.nflDivision = 'all';
    if (!Object.hasOwn(state,'nflForm')) state.nflForm = 4;
    if (!Object.hasOwn(state,'nflSort')) state.nflSort = 'PCT';
    if (!Object.hasOwn(state,'nflExpandedTeam')) state.nflExpandedTeam = null;
    if (!Object.hasOwn(state,'nflLeaderExpanded')) state.nflLeaderExpanded = new Set();
    if (!['QB','RB','WR'].includes(state.nflLeaderPosition)) state.nflLeaderPosition = 'RB';
    if (!Object.hasOwn(state,'nflPreview')) state.nflPreview = null;
    if (!Object.hasOwn(state,'nflPreviewReturn')) state.nflPreviewReturn = null;
    if (!Object.hasOwn(state,'nflRecapTeam')) state.nflRecapTeam = 'all';
    if (!(state.nflRecapExpanded instanceof Set)) state.nflRecapExpanded = new Set();
  }

  function sourceContext(snapshot) {
    const {data,timestamp} = context;
    if (snapshot.recordsFeed) return `${data.season} · ${coverageLabel(snapshot)} · ${snapshot.recordsFeed.source.provider || snapshot.recordsFeed.source.id || 'Source-backed records'} · retrieved ${timestamp(snapshot.recordsFeed.source.retrievedAt)}`;
    const sourceIds = data.provenance?.standings?.sourceIds || [];
    const names = sourceIds.map(id => data.sources?.find(source => source.id === id)?.name || id.replaceAll('_',' '));
    const source = data.sources?.find(item => item.id === 'nflverse_games');
    return `${data.season} · records through Week ${snapshot.throughWeek} · ${coverageLabel(snapshot)} · ${names.join(', ') || 'Verified source snapshot'} · retrieved ${timestamp(source?.retrievedAt || data.retrievedAt)}`;
  }

  function record(split) {
    return split ? `${split.w}–${split.l}${split.t ? `–${split.t}` : ''}` : '—';
  }

  function formChips(team, snapshot) {
    const {data,state,esc} = context;
    const result = teamResults(data,snapshot,team);
    if (!result.complete || !result.form.length) return '<span class="nfl-form-unavailable" title="Verified recent results unavailable">—</span>';
    return result.form.slice(-state.nflForm).map(item => `<span class="form-chip ${item === 'W' ? 'win' : item === 'L' ? 'loss' : 'tie'}" title="${item === 'W' ? 'Win' : item === 'L' ? 'Loss' : 'Tie'}">${esc(item)}</span>`).join('');
  }

  function differential(team) {
    if (finite(team.pointDifferential)) return Number(team.pointDifferential);
    return finite(team.pointsFor) && finite(team.pointsAgainst) ? Number(team.pointsFor) - Number(team.pointsAgainst) : null;
  }

  function teamSummary(team, snapshot) {
    const {data,esc,logo,number} = context;
    const abbr = getAbbr(team);
    const result = teamResults(data,snapshot,team);
    const diff = differential(team);
    const value = finite(diff) ? `${diff > 0 ? '+' : ''}${number(diff)}` : '—';
    const metrics = [['PF',number(team.pointsFor)],['PA',number(team.pointsAgainst)],['DIFF',value],['HOME',record(result.home)],['AWAY',record(result.away)]];
    return `<div class="nfl-team-summary" role="row"><div class="nfl-summary-content" role="cell" aria-colspan="5"><div class="nfl-summary-identity"><img src="${esc(logo(team.id))}" alt="" width="500" height="500" decoding="async"><div><small>${esc(team.fullName?.replace(team.name,'').trim() || abbr)}</small><strong>${esc(team.name)}</strong></div></div><div class="nfl-summary-metrics">${metrics.map(([label,metric]) => `<div class="nfl-summary-metric${label === 'DIFF' ? ` ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}` : ''}"><small>${label}</small><strong>${esc(metric)}</strong></div>`).join('')}</div><button id="nfl-team-details-${esc(abbr.toLowerCase())}" class="nfl-detail-button" data-nfl-action="team-details" data-team="${esc(abbr)}">Team details ${rightChevron}</button></div></div>`;
  }

  function standings(snapshot) {
    const {data,state,esc,logo,number} = context;
    const all = [...(snapshot.conferences?.[state.conference] || [])];
    const teamMap = new Map((data.teams || []).map(team => [getAbbr(team),team]));
    const divisions = [...new Set(all.map(team => teamMap.get(getAbbr(team))?.division).filter(Boolean))];
    if (!divisions.includes(state.nflDivision)) state.nflDivision = 'all';
    const division = $('division-select');
    if (division) {
      division.innerHTML = `<option value="all">All</option>${divisions.map(value => `<option value="${esc(value)}">${esc(value.replace(`${state.conference} `,''))}</option>`).join('')}`;
      division.value = state.nflDivision;
    }
    if ($('form-select')) $('form-select').value = String(state.nflForm);
    if ($('standings-sort')) $('standings-sort').value = state.nflSort;
    const sortMetric = team => state.nflSort === 'PF' ? (finite(team.pointsFor) ? Number(team.pointsFor) : NaN) : state.nflSort === 'PA' ? (finite(team.pointsAgainst) ? -Number(team.pointsAgainst) : NaN) : state.nflSort === 'DIFF' ? (finite(differential(team)) ? differential(team) : NaN) : (finite(team.pct) ? Number(team.pct) : NaN);
    all.sort((a,b) => {
      const av = sortMetric(a), bv = sortMetric(b);
      return (Number.isFinite(bv) ? bv : -Infinity) - (Number.isFinite(av) ? av : -Infinity) || Number(b.pct) - Number(a.pct) || (differential(b) ?? -Infinity) - (differential(a) ?? -Infinity) || getAbbr(a).localeCompare(getAbbr(b));
    });
    const filtered = all.filter(team => state.nflDivision === 'all' || teamMap.get(getAbbr(team))?.division === state.nflDivision);
    const teams = state.standingsExpanded ? filtered : filtered.slice(0,5);
    $('table-caption').textContent = `${state.conference} standings`;
    document.querySelector('[data-page="nfl"] .through-week').textContent = coverageLabel(snapshot);
    const mark = $('nfl-conference-mark');
    if (mark) { mark.src = `assets/nfl-dashboard/${state.conference.toLowerCase()}.svg`; mark.alt = state.conference; }
    const sortContext = {
      PCT:{label:'win percentage',column:3,direction:'descending'},
      PF:{label:'points scored',column:null,direction:'descending'},
      PA:{label:'points allowed',column:null,direction:'ascending'},
      DIFF:{label:'point differential',column:null,direction:'descending'}
    }[state.nflSort] || {label:'win percentage',column:3,direction:'descending'};
    const caption = $('table-caption');
    caption.textContent = `${state.conference} records · ${state.nflSort}-sorted`;
    caption.title = `Sorted by ${sortContext.label}; not official playoff seeding`;
    const table = document.querySelector('[data-page="nfl"] .standings');
    let sourceNote = $('nfl-standings-source');
    if (!sourceNote && table) {
      sourceNote = document.createElement('p');
      sourceNote.id = 'nfl-standings-source'; sourceNote.className = 'nfl-standings-source';
      table.insertAdjacentElement('afterend',sourceNote);
    }
    if (sourceNote) {
      const pending = Number(snapshot.recordsFeed?.coverage?.pendingStartedGames || 0);
      sourceNote.textContent = `Record order is not official playoff seeding.${state.nflSort === 'PCT' ? ' Equal percentages use points differential, then team abbreviation.' : ''} ${recordsSource(snapshot).provider || recordsSource(snapshot).name || 'nflverse'} source retrieved ${context.timestamp(recordsSource(snapshot).retrievedAt)}.${pending > 0 ? ` ${pending} past-kickoff game${pending === 1 ? '' : 's'} await sourced results.` : ''}${standingsError ? ' Latest standings check failed; retaining verified records and retrying automatically.' : ''}${snapshot.recordsFeed ? ' Team research and statistics retain their separately dated coverage.' : ''}`;
      sourceNote.title = recordsSource(snapshot).url || '';
    }
    table?.setAttribute('aria-label',`${state.conference} records sorted by ${sortContext.label}; not official playoff seeding`);
    table?.querySelectorAll('[role="columnheader"]').forEach((heading,index) => {
      const selected = index === sortContext.column;
      heading.classList.toggle('nfl-sort-heading',selected);
      if (selected) heading.setAttribute('aria-sort',sortContext.direction); else heading.removeAttribute('aria-sort');
    });
    $('standings-rows').innerHTML = teams.map(team => {
      const abbr = getAbbr(team), expanded = !state.standingsExpanded && state.nflExpandedTeam === abbr;
      const ties = finite(team.ties) ? Number(team.ties) : null;
      const recordText = `${number(team.w)}–${number(team.l)}${ties === null ? '–—' : ties > 0 ? `–${number(ties)}` : ''}`;
      const recordLabel = `${number(team.w)} wins, ${number(team.l)} losses, ${ties === null ? 'ties unavailable' : `${number(ties)} ties`}`;
      return `<div class="stand-row${expanded ? ' is-expanded' : ''}" role="row"><span role="cell" title="Sorted record order; not official playoff seeding">${all.indexOf(team)+1}</span><span class="table-team" role="cell"><button id="nfl-team-${esc(abbr.toLowerCase())}" class="team-link" data-nfl-action="${state.standingsExpanded ? 'team-details' : 'team'}" data-team="${esc(abbr)}"${state.standingsExpanded ? '' : ` aria-expanded="${expanded}"`} aria-label="${esc(team.fullName || team.name)} ${state.standingsExpanded ? 'team details' : 'record details'}"><img src="${esc(logo(team.id))}" alt="" width="500" height="500" decoding="async"><span>${esc(team.name)}</span></button></span><span class="nfl-record" role="cell" aria-label="${esc(recordLabel)}">${esc(recordText)}</span><span class="nfl-pct" role="cell">${exists(team.pct) ? esc(team.pct) : '—'}</span><span class="stand-form" role="cell" aria-label="Recent results, oldest to newest">${formChips(team,snapshot)}</span></div>${expanded ? teamSummary(team,snapshot) : ''}`;
    }).join('');
    const toggle = document.querySelector('[data-page="nfl"] [data-standings-toggle]');
    if (toggle) {
      const label = toggle.querySelector('span:not([aria-hidden])');
      const text = state.standingsExpanded ? 'Show top 5 teams' : `View all ${filtered.length} teams`;
      if (label) label.textContent = text; else toggle.textContent = text;
      toggle.setAttribute('aria-expanded',String(state.standingsExpanded));
    }
    const note = $('nfl-filter-note');
    if (note) { note.hidden = !!teams.length; note.textContent = 'Verified conference records are unavailable for this filter.'; }
  }

  function leaderboards(snapshot, panel) {
    const {state,esc,number,logo} = context;
    const labels = {QB:'Passing',RB:'Rushing',WR:'Receiving'};
    const titles = {QB:'Top passers',RB:'Top rushers',WR:'Top receivers'};
    const position = state.nflLeaderPosition;
    const players = snapshot.leaders?.[position] || [];
    // Ladder stays compact even after the separate Players panel is expanded.
    const expanded = panel === 'players' && state.nflLeaderExpanded.has(position);
    const shown = expanded ? players : players.slice(0,5);
    const week = Object.hasOwn(snapshot,'leadersWeek') ? snapshot.leadersWeek : snapshot.throughWeek;
    const period = finite(week) && Number(week) > 0 ? `Week ${week}` : 'Awaiting verified week';
    const prefix = `nfl-${panel}`;
    const positionTabs = ['QB','RB','WR'].map(value => `<button id="${prefix}-position-${value.toLowerCase()}" role="tab" data-nfl-action="leader-position" data-position="${value}" data-panel="${panel}" aria-selected="${value === position}" aria-controls="${prefix}-leader-results" tabindex="${value === position ? '0' : '-1'}" aria-label="${labels[value]} ${value} leaders">${value}</button>`).join('');
    const rows = shown.map((player,index) => `<div class="leader-row" role="row"><b role="cell">${index+1}</b><span class="nfl-editorial-leader-player" role="cell" title="${esc(player.name)}">${player.team ? `<img src="${esc(logo(player.team))}" alt="" width="500" height="500" decoding="async">` : ''}<span>${esc(readablePlayerName(player))}</span></span><span role="cell">${number(player.yards)}</span><span role="cell">${number(player.td)}</span></div>`).join('');
    const action = panel === 'ladder' ? 'all-players' : 'leaders';
    const linkLabel = expanded ? 'Show featured players' : 'View all players';
    const relatedLinks = panel === 'ladder' ? `<button id="${prefix}-passing" data-nfl-action="all-players" data-position="QB" aria-controls="panel-players">View passing leaders ${rightChevron}</button><button id="${prefix}-receiving" data-nfl-action="all-players" data-position="WR" aria-controls="panel-players">View receiving leaders ${rightChevron}</button>` : '';
    return `<section class="leader-panel nfl-editorial-leaders" data-nfl-leader-panel="${position}" aria-labelledby="${prefix}-leaders-title"><div class="nfl-editorial-leaders-heading"><div><h2 id="${prefix}-leaders-title">${titles[position]}</h2><span>${esc(period)}</span></div><div class="nfl-editorial-position-tabs" role="tablist" data-nfl-leader-tablist aria-label="League leader position">${positionTabs}</div></div><div id="${prefix}-leader-results" role="tabpanel" aria-labelledby="${prefix}-position-${position.toLowerCase()}"><div class="nfl-editorial-leader-table" role="table" aria-label="${labels[position]} yards leaders · ${esc(period)}"><div class="leader-columns" role="row"><span role="columnheader">#</span><span role="columnheader">Player</span><span role="columnheader">YDS</span><span role="columnheader">TD</span></div><div role="rowgroup">${rows}</div></div>${shown.length ? '' : '<p class="nfl-leaders-unavailable">Verified weekly leaders unavailable.</p>'}${expanded ? `<p class="nfl-dataset-note">${players.length} source-backed ${position} records available${players.length <= 5 ? '; no additional rows are published in this snapshot' : ''}.</p>` : ''}</div><div class="nfl-editorial-leader-links"><button id="${prefix}-${position.toLowerCase()}" class="nfl-view-all" data-nfl-action="${action}" data-position="${position}"${panel === 'players' ? ` aria-expanded="${expanded}" aria-controls="${prefix}-leader-results"` : ' aria-controls="panel-players"'}>${linkLabel} ${rightChevron}</button>${relatedLinks}</div></section>`;
  }

  function matchup(snapshot) {
    const {state,esc,logo,date,time,number} = context;
    const game = selectedWeeklyGame(snapshot), games = gamesThisWeek();
    if (!game) return weeklyLoadingMessage(true);
    const index = games.findIndex(item => item.id === game.id);
    const equipment = {PIT:'assets/nfl-dashboard/helmet-pit-upright.webp',IND:'assets/nfl-dashboard/helmet-ind-upright.webp'};
    const side = (abbr,sideClass,designation) => {
      const team = teamIdentity(abbr);
      const helmet = equipment[abbr];
      return `<div class="nfl-matchup-team ${sideClass}${helmet ? ' has-helmet has-upright-helmet' : ' has-team-logo'}" data-weekly-side="${designation.toLowerCase()}" data-team="${esc(abbr)}" aria-label="${esc(team.fullName)} · ${designation}"><div class="nfl-equipment-wrap"><img class="nfl-matchup-helmet" src="${esc(helmet || logo(abbr))}" alt="" width="${helmet ? '1254' : '500'}" height="${helmet ? '1254' : '500'}" decoding="async">${helmet ? `<img class="nfl-matchup-mark" src="${esc(logo(abbr))}" alt="" width="500" height="500" decoding="async">` : ''}</div><small>${designation} · ${esc(team.city)}</small><strong>${esc(team.name)}</strong></div>`;
    };
    const options = games.map(item => {
      const away = teamIdentity(item.away_team), home = teamIdentity(item.home_team);
      const full = `${away.fullName} at ${home.fullName}`;
      return `<option value="${esc(item.id)}" aria-label="${esc(full)}" title="${esc(full)}"${item.id === game.id ? ' selected' : ''}>${esc(away.name)} at ${esc(home.name)}</option>`;
    }).join('');
    const score = finalGame(game) ? `${number(game.away_score)}–${number(game.home_score)}` : 'VS';
    const when = `${gameStatus(game)} · ${date(game)}${game.status === 'final' ? '' : ` · ${time(game)}`}`;
    return `<div class="nfl-weekly-selector"><button id="nfl-weekly-prev" data-nfl-action="weekly-prev" aria-label="Previous weekly matchup"${games.length < 2 ? ' disabled' : ''}><svg class="icon" aria-hidden="true"><use href="assets/icons.svg#back"></use></svg></button><label><span class="sr-only">Select weekly matchup</span><select id="nfl-weekly-game" title="${esc(teamIdentity(game.away_team).fullName)} at ${esc(teamIdentity(game.home_team).fullName)}">${options}</select></label><button id="nfl-weekly-next" data-nfl-action="weekly-next" aria-label="Next weekly matchup"${games.length < 2 ? ' disabled' : ''}>${rightChevron}</button></div><p class="nfl-weekly-game-count" role="status" aria-live="polite">Game ${index+1} of ${games.length} · Week ${esc(state.week)}</p><div class="nfl-matchup-art" data-weekly-game="${esc(game.id)}">${side(game.away_team,'is-home','Away')}<span class="nfl-matchup-vs nfl-weekly-score" aria-label="${finalGame(game) ? `Away ${number(game.away_score)}, home ${number(game.home_score)}` : 'Versus'}">${score}</span>${side(game.home_team,'is-away','Home')}</div><p class="nfl-matchup-meta">${esc(when)} · ${esc(game.venue || 'Venue unavailable')}</p><div class="nfl-matchup-actions"><button class="nfl-matchup-action is-primary" data-nfl-action="matchups" data-game="${esc(game.id)}">${hasGameReport(game) ? 'Open game report' : 'Open matchup'} ${rightChevron}</button><button class="nfl-matchup-action" data-nfl-action="compare" data-game="${esc(game.id)}">Compare teams ${rightChevron}</button><button class="nfl-matchup-action" data-nfl-action="team-form" data-team="${esc(game.away_team)}">${esc(teamIdentity(game.away_team).name)} form ${rightChevron}</button></div>`;
  }

  function recap(snapshot) {
    const {data,state,esc,number,logo,date,time,timestamp} = context;
    const games = gamesThisWeek();
    $('recap-title').textContent = `Week ${state.week} recap`;
    const filter = $('nfl-recap-team');
    const teams = [...new Set(games.flatMap(game => [game.away_team,game.home_team]))].sort((a,b) => teamIdentity(a).fullName.localeCompare(teamIdentity(b).fullName));
    if (!teams.includes(state.nflRecapTeam)) state.nflRecapTeam = 'all';
    if (filter) {
      filter.innerHTML = `<option value="all">All teams</option>${teams.map(abbr => `<option value="${esc(abbr)}">${esc(teamIdentity(abbr).fullName)}</option>`).join('')}`;
      filter.value = state.nflRecapTeam;
      filter.disabled = !games.length;
    }
    const shown = games.filter(game => state.nflRecapTeam === 'all' || [game.home_team,game.away_team].includes(state.nflRecapTeam));
    const finals = games.filter(game => game.status === 'final').length;
    if ($('nfl-recap-count')) $('nfl-recap-count').textContent = `${shown.length} game${shown.length === 1 ? '' : 's'}`;
    if (!games.length) { $('recap-content').innerHTML = weeklyLoadingMessage(); return; }
    const waiting = games.filter(game => gameStatus(game) === 'Awaiting result').length;
    const upcoming = games.filter(game => gameStatus(game) === 'Upcoming').length;
    const period = `${data.season} · Week ${state.week} · ${finals} final${finals === 1 ? '' : 's'}${waiting ? ` · ${waiting} awaiting result` : ''}${upcoming ? ` · ${upcoming} upcoming` : ''}`;
    const note = !finals ? '<p class="nfl-dataset-note">No completed results are available in this saved week yet. Scheduled matchups are shown below.</p>' : '';
    $('recap-content').innerHTML = `<p class="nfl-dataset-note">${esc(period)}</p>${note}${shown.map(game => {
      const away = teamIdentity(game.away_team), home = teamIdentity(game.home_team), complete = finalGame(game), open = state.nflRecapExpanded.has(game.id);
      const row = (team,score,other) => `<span class="nfl-recap-team${complete && Number(score) > Number(other) ? ' is-winner' : ''}" data-team="${esc(team.abbr)}"><img src="${esc(logo(team.abbr))}" alt="" width="500" height="500" decoding="async"><span><small>${esc(team.city)}</small><strong>${esc(team.name)}</strong></span><span class="nfl-recap-score">${complete ? number(score) : '—'}</span></span>`;
      const result = complete ? Number(game.away_score) === Number(game.home_score) ? 'Tied final score' : `${Number(game.away_score) > Number(game.home_score) ? away.fullName : home.fullName} won by ${Math.abs(Number(game.away_score)-Number(game.home_score))}` : 'Final score is not available in this snapshot';
      const issues = (game.sourceIntegrityIssues || []).filter(issue => ['event','venue'].includes(issue.scope)).map(issue => window.PDSourceIntegrity?.describeIssue(issue,esc,timestamp) || '').join('');
      const report = hasGameReport(game);
      return `<article class="nfl-recap-card" data-game="${esc(game.id)}"><button id="nfl-recap-${esc(game.id)}" class="nfl-recap-summary" data-nfl-action="recap-expand" data-game="${esc(game.id)}" aria-expanded="${open}" aria-controls="nfl-recap-detail-${esc(game.id)}" aria-label="${esc(away.fullName)} at ${esc(home.fullName)} · ${esc(gameStatus(game))} · ${open ? 'hide' : 'show'} game details"><span class="nfl-recap-teams">${row(away,game.away_score,game.home_score)}${row(home,game.home_score,game.away_score)}</span><span class="nfl-recap-meta">${esc(gameStatus(game))} · ${esc(date(game))}</span><svg class="icon nfl-recap-chevron" aria-hidden="true"><use href="assets/icons.svg#down"></use></svg></button><div id="nfl-recap-detail-${esc(game.id)}" class="nfl-recap-detail"${open ? '' : ' hidden'}><p><strong>${esc(result)}</strong></p><p>${esc(game.venue || 'Venue unavailable')}<br>${esc(date(game))} · ${esc(time(game))}</p>${issues}<div class="nfl-recap-actions"><button class="nfl-recap-report" data-nfl-action="${report ? 'report' : 'recap-matchup'}" data-game="${esc(game.id)}" data-team="${esc(game.away_team)}">${report ? 'Open game report' : 'Open matchup'} ${rightChevron}</button><button data-nfl-action="recap-compare" data-game="${esc(game.id)}">Compare teams ${rightChevron}</button><button data-nfl-action="team-details" data-team="${esc(game.away_team)}">${esc(away.name)} details</button><button data-nfl-action="team-details" data-team="${esc(game.home_team)}">${esc(home.name)} details</button></div></div></article>`;
    }).join('')}`;
  }

  function preview() {
    const node = $('nfl-inline-preview');
    if (!node) return;
    const {data,state,esc,number,teamName,date,time} = context;
    const request = state.nflPreview;
    node.hidden = !request;
    if (!request) { node.innerHTML = ''; return; }
    const originalSnapshot = data.weeks[state.week];
    const snapshot = originalSnapshot && recordsSnapshot(originalSnapshot);
    const allTeams = [...(snapshot.conferences?.AFC || []),...(snapshot.conferences?.NFC || [])];
    const fixture = snapshot.fixture;
    const opponent = fixture ? fixture.home_team === 'PIT' ? fixture.away_team : fixture.home_team : null;
    let title = '', content = '';
    if (request.action === 'team-details') {
      const team = allTeams.find(item => getAbbr(item) === request.team);
      title = `${team?.fullName || request.team} · record details`;
      const results = team && teamResults(data,snapshot,team);
      content = team ? `<p>${esc(team.record || `${team.w}–${team.l}`)} · ${number(team.pointsFor)} points for · ${number(team.pointsAgainst)} points against · through Week ${snapshot.throughWeek}</p><p>Published home designation: ${record(results.home)} · away: ${record(results.away)}.</p>` : '<p>Verified team details unavailable.</p>';
      content += '<p class="nfl-dataset-note">Full team research is coming soon.</p>';
    } else if (request.action === 'compare') {
      title = 'COMPARE TEAMS';
      const own = allTeams.find(team => getAbbr(team) === 'PIT');
      const other = allTeams.find(team => getAbbr(team) === opponent);
      content = own && other ? `<table class="nfl-preview-table"><caption>Source records through Week ${snapshot.throughWeek}</caption><thead><tr><th>TEAM</th><th>W–L</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>${[own,other].map(team => `<tr><th>${esc(team.name)}</th><td>${esc(team.record)}</td><td>${number(team.pointsFor)}</td><td>${number(team.pointsAgainst)}</td><td>${number(differential(team))}</td></tr>`).join('')}</tbody></table>` : '<p>No verified opponent comparison is available for this week.</p>';
    } else if (request.action === 'team-form') {
      title = 'TEAM FORM · LAST PLAYED GAMES';
      content = ['PIT',opponent].filter(Boolean).map(abbr => {
        const team = allTeams.find(item => getAbbr(item) === abbr);
        const results = team && teamResults(data,snapshot,team);
        return `<h3>${esc(team?.fullName || teamName(abbr))}</h3>${results?.complete && results.games.length ? results.games.slice(-5).map(item => `<div class="nfl-preview-result"><b class="${item.result === 'W' ? 'positive' : item.result === 'L' ? 'negative' : ''}">${item.result}</b><span>Week ${item.game.week} · ${item.home ? 'vs' : '@'} ${esc(teamName(item.opponent))}</span><strong>${item.own}–${item.other}</strong></div>`).join('') : '<p>Verified recent results unavailable.</p>'}`;
      }).join('') + '<p class="nfl-dataset-note">Only played games are shown. Neutral-site games keep the source home/away designation.</p>';
    } else if (request.action === 'matchup' || request.action === 'matchups') {
      title = 'FEATURED MATCHUP';
      content = fixture ? `<p><strong>${esc(teamName(fixture.away_team))} @ ${esc(teamName(fixture.home_team))}</strong></p><p>${fixture.season} · Week ${fixture.week} · ${esc(date(fixture))} · ${esc(time(fixture))}<br>${esc(fixture.venue || 'Venue unavailable')}</p><p class="nfl-dataset-note">Full matchup research is coming soon.</p>` : '<p>No verified Steelers fixture is available for this week.</p>';
    } else if (request.action === 'schedule') {
      title = 'AVAILABLE STEELERS FIXTURES';
      content = (data.steelers?.schedule || []).filter(game => Number(game.week) >= Number(state.week)).slice(0,4).map(game => `<p>Week ${game.week} · ${esc(teamName(game.away_team))} @ ${esc(teamName(game.home_team))}<br>${esc(date(game))}</p>`).join('') || '<p>Verified fixtures unavailable.</p>';
    } else {
      title = request.action === 'teams' ? 'TEAMS' : request.action === 'insights' ? 'INSIGHTS' : 'PROJECT DOLLAR';
      content = `<p>${request.action === 'teams' ? 'Explore conference records with the AFC/NFC controls and select a team to expand its summary.' : request.action === 'insights' ? 'Records, points and recent form are derived from published final scores. Weekly player leaders retain their actual statistics week.' : 'Explore sourced NFL records, recent form and weekly leaders. More sports and research tools are coming soon.'}</p>`;
    }
    node.innerHTML = `<div class="nfl-preview-heading"><h2>${esc(title)}</h2><button id="nfl-close-preview" data-nfl-action="close-preview" aria-label="Close preview">×</button></div>${content}<p class="nfl-dataset-note">${esc(sourceContext(snapshot))}</p>`;
  }

  function render(nextContext) {
    context = nextContext;
    initializeState(context.state);
    if (!lastSnapshot) lastSnapshot = context.data;
    adoptWeeklySource();
    loadWeeklySource();
    loadStandingsSource();
    const {data,state} = context;
    const snapshot = data.weeks[state.week];
    if (!snapshot) return;
    const season = $('season-select');
    if (season) {
      // Historical player coverage is not an available standings season. This
      // dashboard snapshot contains one sourced season and its actual weeks.
      season.innerHTML = `<option value="${context.esc(data.season)}">${context.esc(data.season)} season</option>`;
      season.value = String(data.season);
      season.disabled = true;
      season.title = 'Only this source-backed standings season is currently available';
    }
    $('week-select').value = state.week;
    document.querySelectorAll('[data-conference]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.conference === state.conference)));
    document.querySelectorAll('[data-week]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.week === state.week)));
    const records = recordsSnapshot(snapshot);
    standings(records);
    $('ladder-leaders').innerHTML = leaderboards(snapshot,'ladder');
    $('players-leaders').innerHTML = leaderboards(snapshot,'players');
    $('featured-matchup').innerHTML = matchup(snapshot) + (weeklyError && weeklyGames.length ? '<p class="nfl-dataset-note" role="status">Schedule refresh failed. Retained verified games; retrying automatically.</p>' : '');
    $('fixture-context').textContent = `Week ${state.week}`;
    recap(snapshot);
    preview();
    const provenance = $('nfl-data-context');
    if (provenance) {
      provenance.textContent = `${data.season} · fixtures Week ${state.week} · records: ${coverageLabel(records)} · statistics ${finite(snapshot.leadersWeek) ? `W${snapshot.leadersWeek}` : 'unavailable'}. Records source retrieved ${context.timestamp(recordsSource(records).retrievedAt)}. Schedule source retrieved ${weeklyDataset ? context.timestamp(weeklyDataset.sources?.find(source => source.id === 'nflverse_games')?.retrievedAt) : 'unavailable'}. Statistics source retrieved ${context.timestamp(data.sources?.find(source => source.id === 'nflverse_player_stats')?.retrievedAt || data.retrievedAt)}.`;
      provenance.title = `${sourceContext(records)}. Form and home/away splits are calculated from complete retained final scores; sorted rows are not official playoff seeds. Team research retains its independent source snapshot.`;
    }
    if (!bound) bind();
  }

  function rerender() {
    const page = document.querySelector('[data-page="nfl"]');
    const scroll = page?.querySelector('.page-scroll');
    const top = scroll?.scrollTop;
    const focus = document.activeElement;
    let selector = focus?.id ? `#${CSS.escape(focus.id)}` : null;
    if (!selector && focus?.dataset?.nflAction) selector = `[data-nfl-action="${CSS.escape(focus.dataset.nflAction)}"]${focus.dataset.game ? `[data-game="${CSS.escape(focus.dataset.game)}"]` : ''}${focus.dataset.team ? `[data-team="${CSS.escape(focus.dataset.team)}"]` : focus.dataset.position ? `[data-position="${CSS.escape(focus.dataset.position)}"]` : ''}`;
    render(context);
    if (scroll) scroll.scrollTop = top;
    if (selector && !focus.isConnected) page?.querySelector(selector)?.focus({preventScroll:true});
  }

  function showPanel(tab) {
    const button = $(`tab-${tab}`);
    button?.click();
    button?.focus({preventScroll:true});
  }

  function showTeams() {
    context.state.standingsExpanded = true;
    rerender();
    showPanel('ladder');
    const panel = document.querySelector('[data-page="nfl"] .nfl-standings-panel');
    panel?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
    panel?.querySelector('.team-link')?.focus({preventScroll:true});
  }

  function bind() {
    bound = true;
    document.addEventListener('pd:data-ready',() => {
      if (context && context.data !== lastSnapshot) { lastSnapshot = context.data; loadWeeklySource(true); }
    });
    const resumeSchedule = () => {
      if (!context || document.hidden) return;
      loadWeeklySource(true);
      if (Date.now() - standingsLastAttempt >= (standingsError ? 15000 : 60000)) loadStandingsSource(true);
      else scheduleStandingsCheck();
    };
    document.addEventListener('visibilitychange',resumeSchedule);
    window.addEventListener('focus',resumeSchedule);
    window.addEventListener('online',resumeSchedule);
    window.addEventListener('pageshow',resumeSchedule);
    document.addEventListener('pd:team-data-ready',() => {
      if (context && adoptWeeklySource()) rerender();
    });
    document.addEventListener('click',event => {
      if (context && event.target.closest('[data-refresh]')) loadStandingsSource(true);
    });
    document.addEventListener('click',event => {
      const button = event.target.closest('button');
      if (!button?.closest('[data-page="nfl"]') || !context) return;
      const {state} = context;
      const action = button.dataset.nflAction;
      if (!action && !button.dataset.conference && !button.hasAttribute('data-standings-toggle')) return;
      // Prevent the legacy page navigation handler from opening future screens.
      event.stopImmediatePropagation();
      if (action === 'all-players') {
        const position = ['QB','RB','WR'].includes(button.dataset.position) ? button.dataset.position : state.nflLeaderPosition;
        state.nflLeaderPosition = position;
        state.nflLeaderExpanded.add(position);
        rerender();
        showPanel('players');
        return;
      }
      if (action === 'teams') {
        showTeams();
        return;
      }
      if (action === 'recap' || action === 'weekly-recap') {
        showPanel('recap');
        return;
      }
      if (action === 'weekly-prev' || action === 'weekly-next') {
        const games = gamesThisWeek();
        const index = games.findIndex(game => game.id === state.nflWeeklyGame);
        if (games.length) state.nflWeeklyGame = games[(index + (action === 'weekly-next' ? 1 : -1) + games.length) % games.length].id;
        state.nflPreview = null;
        rerender();
        return;
      }
      if (action === 'weekly-retry') {
        weeklyError = null;
        loadWeeklySource(true);
        rerender();
        return;
      }
      if (action === 'recap-expand') {
        if (gamesThisWeek().some(game => game.id === button.dataset.game)) {
          if (state.nflRecapExpanded.has(button.dataset.game)) state.nflRecapExpanded.delete(button.dataset.game);
          else state.nflRecapExpanded.add(button.dataset.game);
          rerender();
        }
        return;
      }
      if (action === 'report' && window.PDApp?.openGameReport) {
        const game = gamesThisWeek().find(item => item.id === button.dataset.game);
        if (game && hasGameReport(game)) window.PDApp.openGameReport(game.away_team,game.id,'overview','nfl');
        return;
      }
      if (action === 'team-details') {
        window.PDTeamDetails?.enter(button.dataset.team);
        return;
      }
      if (action === 'team-form' && window.PDTeamDetails) {
        window.PDTeamDetails.enter(button.dataset.team);
        return;
      }
      if (['matchup','matchups','compare','recap-matchup','recap-compare'].includes(action)) {
        const fixture = button.dataset.game ? gamesThisWeek().find(game => game.id === button.dataset.game) : selectedWeeklyGame(context.data.weeks[state.week]);
        const compare = action === 'compare' || action === 'recap-compare';
        if (fixture) {
          openWeeklyGame(fixture,compare);
        } else if (action === 'matchups' && !button.dataset.game && weeklyLoading) {
          state.nflPendingMatchup = true;
          rerender();
        }
        return;
      }
      if (button.dataset.conference) { state.conference = button.dataset.conference; state.nflDivision = 'all'; }
      else if (button.hasAttribute('data-standings-toggle')) state.standingsExpanded = !state.standingsExpanded;
      else if (action === 'team') state.nflExpandedTeam = state.nflExpandedTeam === button.dataset.team ? null : button.dataset.team;
      else if (action === 'leader-position') state.nflLeaderPosition = ['QB','RB','WR'].includes(button.dataset.position) ? button.dataset.position : state.nflLeaderPosition;
      else if (action === 'leaders') {
        const position = ['QB','RB','WR'].includes(button.dataset.position) ? button.dataset.position : state.nflLeaderPosition;
        if (state.nflLeaderExpanded.has(position)) state.nflLeaderExpanded.delete(position); else state.nflLeaderExpanded.add(position);
      } else if (action === 'close-preview') state.nflPreview = null;
      else {
        state.nflPreview = {action,team:button.dataset.team};
        state.nflPreviewReturn = button.id ? `#${CSS.escape(button.id)}` : `[data-nfl-action="${CSS.escape(action)}"]`;
      }
      rerender();
      if (action === 'close-preview' && state.nflPreviewReturn) document.querySelector('[data-page="nfl"]')?.querySelector(state.nflPreviewReturn)?.focus({preventScroll:true});
      if (state.nflPreview && action && !['team','leaders','leader-position'].includes(action)) {
        const node = $('nfl-inline-preview');
        node?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'nearest'});
        node?.focus({preventScroll:true});
      }
    },true);
    document.addEventListener('keydown',event => {
      const list = event.target.closest('[data-nfl-leader-tablist]');
      if (!list || !list.closest('[data-page="nfl"]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const id = tabs[next].id;
      tabs[next].click();
      $(id)?.focus({preventScroll:true});
    });
    document.addEventListener('change',event => {
      if (!context || !event.target.closest('[data-page="nfl"]')) return;
      if (event.target.id === 'nfl-weekly-game') {
        if (gamesThisWeek().some(game => game.id === event.target.value)) context.state.nflWeeklyGame = event.target.value;
        context.state.nflPreview = null;
        rerender();
        return;
      }
      if (event.target.id === 'nfl-recap-team') {
        context.state.nflRecapTeam = event.target.value;
        rerender();
        return;
      }
      const keys = {'division-select':'nflDivision','form-select':'nflForm','standings-sort':'nflSort'};
      const key = keys[event.target.id];
      if (!key) return;
      context.state[key] = key === 'nflForm' ? Number(event.target.value) : event.target.value;
      rerender();
    });
  }

  window.PDNFLDashboard = {render,deriveTeamResults:teamResults,refreshStandings:() => loadStandingsSource(true),getStandingsDataset:() => standingsDataset};
})();
