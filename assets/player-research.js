(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined,{maximumFractionDigits:2}) : '—';
  const time = value => value ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Unavailable';
  const groups = [
    ['Passing', [['completions','Completions'],['attempts','Attempts'],['passingYards','Passing yards'],['passingTD','Passing TD'],['interceptions','Interceptions'],['completionPct','Completion %'],['passerRating','Passer rating'],['sacks','Sacks taken'],['sackYardsLost','Sack yards lost']]],
    ['Rushing', [['carries','Carries'],['rushingYards','Rushing yards'],['rushingTD','Rushing TD'],['yardsPerCarry','Yards / carry']]],
    ['Receiving', [['receptions','Receptions'],['targets','Targets'],['receivingYards','Receiving yards'],['receivingTD','Receiving TD'],['yardsPerReception','Yards / reception']]],
    ['Defense', [['tackles','Solo tackles'],['assistedTackles','Assisted tackles'],['defensiveSacks','Sacks'],['defensiveInterceptions','Interceptions'],['passesDefended','Passes defended']]],
    ['Special teams', [['fieldGoalsMade','Field goals made'],['fieldGoalAttempts','Field goal attempts'],['punts','Punts'],['puntYards','Punt yards']]]
  ];
  function orderedGroups(player) {
    const order = player.filterGroup === 'RB' ? ['Rushing','Receiving','Passing','Defense','Special teams'] : ['WR','TE'].includes(player.position) ? ['Receiving','Rushing','Passing','Defense','Special teams'] : player.filterGroup === 'DEF' ? ['Defense','Rushing','Receiving','Passing','Special teams'] : player.filterGroup === 'K' ? ['Special teams','Rushing','Receiving','Passing','Defense'] : ['Passing','Rushing','Receiving','Defense','Special teams'];
    return [...groups].sort((a,b) => order.indexOf(a[0])-order.indexOf(b[0]));
  }
  function field(label,key,value) {
    return `<div class="game-stat" data-stat-key="${esc(key)}"><span>${esc(label)}</span><b>${n(value)}</b></div>`;
  }
  function category(label,entries,stats) {
    return `<section class="game-stat-group" data-history-category="${esc(label)}"><h5>${esc(label)}</h5><div class="game-stat-grid">${entries.map(([key,title]) => field(title,key,stats?.[key])).join('')}</div></section>`;
  }
  function humanize(key) {
    const abbreviations = {tds:'TD',td:'TD',epa:'EPA',cpoe:'CPOE',pacr:'PACR',racr:'RACR',wopr:'WOPR',fg:'FG',pat:'PAT',pt:'Punt',def:'Defense',ppr:'PPR',yac:'YAC',qb:'QB'};
    return key.replace(/([a-z])([A-Z])/g,'$1 $2').split(/[_\s]+/).map(word => abbreviations[word.toLowerCase()] || word[0]?.toUpperCase()+word.slice(1)).join(' ');
  }
  function extraStats(game,player,ctx) {
    const raw = Object.entries(game.rawStats || {});
    if (!raw.length) return '';
    const sections = [
      ['Turnovers & two-point plays', /fumble|2pt|two_point/],
      ['Defense · additional', /^def_/],
      ['Kicking, punting & returns', /^(fg_|pat_|pt_|.*return|special_)/],
      ['Additional source statistics', /.*/]
    ];
    // Core statistics already appear above. The original source labels remain
    // available for every extra field; missing source values stay unavailable.
    const core = new Set(['completions','attempts','passing_yards','passing_tds','passing_interceptions','sacks_suffered','sack_yards_lost','carries','rushing_yards','rushing_tds','receptions','targets','receiving_yards','receiving_tds','def_tackles_solo','def_tackle_assists','def_sacks','def_interceptions','def_pass_defended','fg_made','fg_att','pt_att','pt_yards']);
    let remaining = raw.filter(([key]) => !core.has(key));
    const content = sections.map(([label,pattern]) => {
      const entries = remaining.filter(([key]) => pattern.test(key));
      remaining = remaining.filter(([key]) => !pattern.test(key));
      return entries.length ? `<section class="game-stat-group" data-history-category="${esc(label)}"><h5>${esc(label)}</h5><div class="game-stat-grid">${entries.map(([key,value]) => field(humanize(key),key,value)).join('')}</div></section>` : '';
    }).join('');
    const listFields = Object.entries(game.rawLists || {}).map(([key,value]) => `<div class="game-stat" data-stat-key="${esc(key)}"><span>${esc(humanize(key))}</span><b>${Array.isArray(value) ? esc(value.join(', ')) : value === null || value === undefined || value === '' ? '—' : esc(value)}</b></div>`).join('');
    const token = `${player.id}:${game.gameId}:extra`;
    return `<details class="additional-statistics" data-extra-game="${esc(game.gameId)}" data-extra-player="${esc(player.id)}" ${ctx.state.openGames.has(token) ? 'open' : ''}><summary>Additional recorded statistics <span>${raw.length} source fields</span></summary>${content}${listFields ? `<section class="game-stat-group"><h5>Kicking distance lists</h5><div class="game-stat-grid">${listFields}</div></section>` : ''}<p class="source-note">Additional metric labels follow the provider's fields. Unavailable values remain a dash; no missing fields are estimated.</p></details>`;
  }
  function quickStat(label,key,stats) {
    return `<span data-stat-key="${esc(key)}"><small>${esc(label)}</small><b>${n(stats?.[key])}</b></span>`;
  }
  function gameCard(game,player,ctx) {
    const stats = game.stats || {}, token = `${player.id}:${game.gameId}`;
    const kickoff = game.kickoffUtc ? new Date(game.kickoffUtc).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : game.date || 'Date unavailable';
    const score = game.teamScore !== null && game.teamScore !== undefined && game.opponentScore !== null && game.opponentScore !== undefined ? `${game.result || 'Final'} ${n(game.teamScore)}–${n(game.opponentScore)}` : 'Result unavailable';
    const offense = [['PASS YDS','passingYards'],['RUSH YDS','rushingYards'],['REC YDS','receivingYards'],['PASS TD','passingTD'],['RUSH TD','rushingTD'],['REC TD','receivingTD']];
    const quick = player.filterGroup === 'DEF' ? [['SOLO','tackles'],['ASSISTS','assistedTackles'],['SACKS','defensiveSacks'],['INT','defensiveInterceptions'],['PASS DEF','passesDefended'],['RUSH YDS','rushingYards']] : player.filterGroup === 'K' ? [['FG MADE','fieldGoalsMade'],['FG ATT','fieldGoalAttempts'],['PUNTS','punts'],['PUNT YDS','puntYards'],['RUSH YDS','rushingYards'],['REC YDS','receivingYards']] : offense;
    const names = game.sourceIds || [game.statsSourceId || 'nflverse_player_stats'];
    const labels = names.map(id => ctx.history?.sources?.find(source => source.id === id)?.name || id.replace(/^nflverse_/, 'nflverse · ').replaceAll('_',' '));
    return `<details class="game-breakdown" data-game-id="${esc(game.gameId)}" data-game-player="${esc(player.id)}" ${ctx.state.openGames.has(token) ? 'open' : ''}><summary><div class="game-line"><strong><img src="${esc(ctx.logo(game.opponent))}" alt="" width="500" height="500" loading="lazy">${esc(game.team)} ${game.homeAway === 'away' || game.homeAway === 'Away' || game.homeAway === '@' ? '@' : 'vs'} ${esc(game.opponent)}</strong><span class="game-score">${esc(score)}</span></div><span class="game-meta">${esc(kickoff)} · ${esc(game.season)} · Week ${esc(game.week)} · Regular season</span><div class="game-quick-stats">${quick.map(([label,key]) => quickStat(label,key,stats)).join('')}</div><span class="game-expand-label">Complete game statistics</span></summary><div class="game-full-stats">${orderedGroups(player).filter(([label]) => !['Defense','Special teams'].includes(label) || player.filterGroup === (label === 'Defense' ? 'DEF' : 'K') || Object.entries(stats).some(([key,value]) => (label === 'Defense' ? /^(tackles|assisted|defensive|passesDefended)/ : /^(fieldGoal|punt)/).test(key) && Number(value) > 0)).map(([label,entries]) => category(label,entries,stats)).join('')}${extraStats(game,player,ctx)}<p class="source-note">${esc(labels.join(' · '))}<br>Retrieved ${esc(time(game.retrievedAt))}. Stats belong to ${esc(game.team)} in this game. A dash means unavailable; source-derived efficiency metrics remain labelled.</p></div></details>`;
  }
  function seasonGroup(label,entries,stats,metric) {
    return `<section class="season-stat-group" data-season-category="${esc(label)}"><h4>${esc(label)}</h4><div class="metric-grid">${entries.map(([key,title]) => metric(title.toUpperCase(),stats[key])).join('')}</div></section>`;
  }
  function render(player,ctx) {
    const id = `player-detail-${esc(player.id)}`;
    if (ctx.state.openPlayer !== player.id) return `<div class="player-detail" id="${id}" hidden></div>`;
    const stats = player.seasonStats || {}, injury = player.injury || {};
    const history = ctx.history?.players?.[player.id];
    const fixture = ctx.data.weeks?.[ctx.state.week]?.fixture;
    const opponent = fixture ? (fixture.home_team === 'PIT' ? fixture.away_team : fixture.home_team) : null;
    const mode = ctx.state.historyMode, matchup = opponent ? history?.byOpponent?.[opponent] : null;
    const gameIds = mode === 'opponent' ? matchup?.gameIds || [] : history?.last5 || [];
    const games = gameIds.map(gameId => history?.games?.[gameId]).filter(Boolean).slice(0,5);
    const historyState = ctx.error ? ctx.history ? 'retained' : 'error' : ctx.history ? ctx.loading ? 'updating' : 'ready' : ctx.loading ? 'loading' : 'unavailable';
    const updateNote = ctx.history && ctx.error ? '<p class="history-status">Updated history could not be verified. Previous verified history is retained with its original source times.<button data-history-retry>Retry history</button></p>' : ctx.history && ctx.loading ? '<p class="history-status">Updating game history · previous verified history remains visible.</p>' : '';
    const seasonGroups = orderedGroups(player).filter(([label]) => ['Passing','Rushing','Receiving'].includes(label) || label === 'Defense' && player.filterGroup === 'DEF' || label === 'Special teams' && player.filterGroup === 'K');
    const options = Object.keys(ctx.data.weeks).sort((a,b)=>Number(a)-Number(b)).map(week => {
      const game = ctx.data.weeks[week].fixture;
      const abbr = game ? game.home_team === 'PIT' ? game.away_team : game.home_team : 'Bye';
      return `<option value="${week}" ${week === ctx.state.week ? 'selected' : ''}>Week ${week} · ${esc(abbr)}</option>`;
    }).join('');
    let content;
    if (ctx.error && !ctx.history) content = '<p class="history-status">Verified game history could not load. Season statistics are retained.<button data-history-retry>Retry history</button></p>';
    else if (!ctx.history) content = `<p class="history-status">${ctx.loading ? 'Loading verified career game history…' : 'Verified career game history is unavailable.'}</p>`;
    else if (mode === 'opponent' && !opponent) content = `<p class="history-status">Week ${esc(ctx.state.week)} is a bye or has no verified Steelers opponent.</p>`;
    else {
      const coverage = ctx.history.coverage || {};
      const missing = coverage.unavailableSeasons?.length || 0;
      const heading = mode === 'opponent' ? `${games.length} recorded meetings with ${ctx.teamName(opponent)}` : `${games.length} most recent recorded games`;
      content = `<p class="history-summary"><b>${esc(heading)}</b><br>Regular season · latest first · includes previous clubs.${missing ? ` Coverage is partial: ${missing} unavailable seasons.` : ''}</p>${games.length ? `<div class="history-list">${games.map(game => gameCard(game,player,ctx)).join('')}</div>` : '<p class="history-status">No verified statistics rows are available for this selection. Missing games are not replaced with estimates.</p>'}`;
    }

    const status = injury.reportStatus ? `${injury.reportStatus}${injury.injury ? ` · ${injury.injury}` : ''}` : 'Game status unavailable';
    return `<div class="player-detail" id="${id}" data-player-history-state="${historyState}"><p class="research-kicker">Player research</p><div class="research-heading"><h3>Season &amp; game history</h3></div><p class="research-subtitle">${esc(ctx.data.season)} season · ${esc(player.position)} · ${esc(player.rosterStatus || 'Roster status unavailable')}</p><details class="season-overview" data-season-player="${esc(player.id)}" ${ctx.state.seasonOpen.has(player.id) ? 'open' : ''}><summary>${esc(ctx.data.season)} season statistics <span>Full breakdown</span></summary>${seasonGroups.map(([label,entries]) => seasonGroup(label,entries,stats,ctx.metric)).join('')}<p class="source-note">Season statistics cover ${n(stats.games)} recorded games through Week ${esc(ctx.data.provenance?.playerStats?.throughWeek ?? ctx.data.throughWeek)}. A missing row does not establish a played game or zero.</p></details><p class="source-note">Current Week ${esc(ctx.data.currentWeek)}: ${esc(status)}<br>${esc(injury.practiceStatus || 'Practice participation unavailable')}</p><div class="history-switch" role="group" aria-label="Player game history"><button data-history-mode="recent" aria-pressed="${mode === 'recent'}">Last 5 games</button><button data-history-mode="opponent" aria-pressed="${mode === 'opponent'}">${opponent ? `Last 5 vs ${esc(opponent)}` : 'Opponent history'}</button></div><label class="history-week"><span>Weekly opponent</span><select data-history-week aria-label="Select opponent week">${options}</select></label><div class="player-history-content">${updateNote}${content}</div><p class="source-note">Each game shows its original season, week and club. History is current as of source retrieval; selecting a past week does not rewind the dataset.</p>${ctx.sourceNote('playerStats',`${ctx.data.season} · current season totals`)}</div>`;
  }
  window.PDPlayerResearch = Object.freeze({render});
})();
