/* Source-backed completed-game research. The approved chat render supplies
   visual hierarchy; scores and every report row come from the selected game. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = () => document.querySelector('[data-page="game-report"]');
  const active = () => page()?.classList.contains('active');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const fmt = (value, places = 0) => known(value) ? Number(value).toLocaleString('en-AU', {maximumFractionDigits:places}) : '—';
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="${['medical','document','box-score','play'].includes(name) ? 'assets/game-report/ui-icons.svg' : ['shield','info','calendar','stadium'].includes(name) ? 'assets/team-details/ui-icons.svg' : 'assets/icons.svg'}#${name}"></use></svg>`;
  const state = {team:'DAL',game:null,tab:'overview',performanceTeam:'DAL',kind:'passing',expanded:undefined,returnRoute:'team/DAL'};
  let index = null, report = null, error = null, loading = null, checkedAt = 0, generation = 0, lastFocus = null, lastFocusAttrs = null, dialogState = null;
  const detailCache = new Map();
  const safeReturn = (value, abbr = state.team) => /^(?:(?:team\/|matchup\/)(?:[A-Z]{2,3})(?:\?|$)|(?:home|nfl|steelers)$)/i.test(String(value || '')) && !/[<>\r\n]/.test(value) ? value : `team/${abbr}`;
  const current = () => window.PDApp?.getContext()?.data;
  const identities = {DAL:['Dallas','Cowboys'],HOU:['Houston','Texans'],TB:['Tampa Bay','Buccaneers'],PIT:['Pittsburgh','Steelers']};
  function identity(abbr) {
    const t = current()?.teams?.find(item => item.abbr === abbr) || {}, fallback = identities[abbr];
    const historic = report?.teamNames?.[abbr];
    const fullName = historic || t.fullName || (fallback ? fallback.join(' ') : abbr);
    const nickname = historic ? historic.split(' ').at(-1) : t.name || fallback?.[1] || abbr;
    return {abbr,fullName,name:nickname,city:fullName.replace(nickname,'').trim() || fallback?.[0] || abbr};
  }
  const logo = abbr => abbr === 'DAL' ? 'assets/team-details/dal.svg' : abbr === 'HOU' ? 'assets/game-report/hou.svg' : window.PDApp?.getContext()?.logo(abbr) || `assets/logos/${String(abbr).toLowerCase()}.webp`;
  const pair = () => report ? [state.team, report.home_team === state.team ? report.away_team : report.home_team] : [];
  const score = abbr => report ? report.home_team === abbr ? report.home_score : report.away_score : null;
  const stats = abbr => report?.stats?.[abbr] || {};
  const playerRows = (abbr = state.performanceTeam) => Array.isArray(report?.players?.[abbr]) ? report.players[abbr] : [];
  const quarters = abbr => (report?.quarters?.[abbr] || []).map(item => known(item) ? Number(item) : known(item?.value) ? Number(item.value) : known(item?.score) ? Number(item.score) : null);
  const fullName = abbr => identity(abbr).fullName;
  const displayAbbr = abbr => report?.providerTeamAbbreviations?.[abbr] || abbr;
  const equipment = abbr => ['DAL','HOU'].includes(abbr) ? `<div class="gr-helmet gr-helmet-${abbr.toLowerCase()}" aria-label="${esc(fullName(abbr))} decorative helmet"><img class="gr-helmet-shell" src="assets/game-report/helmet-${abbr.toLowerCase()}-decorative.webp" alt="" width="1254" height="1254"><img class="gr-helmet-mark" src="${esc(logo(abbr))}" alt="${esc(fullName(abbr))}" width="500" height="500"></div>` : `<img class="gr-fallback-team-mark" src="${esc(logo(abbr))}" alt="${esc(fullName(abbr))}" width="500" height="500">`;
  const titleCity = abbr => identity(abbr).city.toUpperCase();
  const navigationCity = abbr => {const t=current()?.teams?.find(item=>item.abbr===abbr);return (t?.fullName?.replace(t.name,'').trim() || identities[abbr]?.[0] || abbr).toUpperCase();};
  const timestamp = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)) : 'Unavailable';
  function datetime(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Kickoff unavailable';
    return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
  }
  const namedButton = (label, action, extra = '', cls = '') => `<button class="gr-button ${cls}" data-gr-action="${action}" ${extra}>${esc(label)} ${icon('chevron')}</button>`;
  const gem = (label, action, extra = '') => namedButton(label,action,extra,'gr-gem-button');
  const panelHeading = (title, extra = '', mark = 'diamond') => `<header class="gr-panel-heading">${mark === 'diamond' ? '<img class="gr-diamond" src="assets/nfl-dashboard/diamond-premium.svg" alt="" width="50" height="66">' : `<img class="gr-heading-mark" src="${esc(logo(mark))}" alt="" width="500" height="500">`}<h2>${esc(title)}</h2>${extra}</header>`;
  function header() {
    return `<header class="gr-brand"><img class="gr-brand-mark" src="assets/home/gate-brand-lossless.webp" alt="Project Dollar" width="2022" height="778"><p>SPORTS DATA &amp; RESEARCH</p></header><button class="gr-back gr-button" data-gr-action="back">${icon('back')} BACK TO ${esc(navigationCity(state.team))}</button><div class="gr-breadcrumb"><div class="gr-crumbs"><button data-gr-action="nfl">NFL</button>${icon('chevron')}<button data-gr-action="team">${esc(navigationCity(state.team))}</button>${icon('chevron')}<span>GAME REPORT</span></div><div class="gr-league"><img src="assets/home/nfl.svg" alt="NFL" width="500" height="500"><span>GAME REPORT</span></div></div>`;
  }
  function hero() {
    const sides = pair(), qCount = Math.max(4, ...sides.map(abbr => quarters(abbr).length));
    return `<section class="gr-hero gr-framed" aria-labelledby="game-report-title"><h1 id="game-report-title">GAME REPORT</h1><div class="gr-score-scene">${sides.map((abbr,i) => `<div class="gr-competitor gr-competitor-${i}">${equipment(abbr)}<h2><span>${esc(identity(abbr).city)}</span><strong>${esc(identity(abbr).name)}</strong></h2></div>`).join('')}<div class="gr-score-center"><div class="gr-scoreline"><strong class="gr-score-own">${fmt(score(sides[0]))}</strong><span>–</span><strong class="gr-score-other">${fmt(score(sides[1]))}</strong></div><strong class="gr-game-status">${esc(report.status === 'final' ? 'FINAL' : report.status?.toUpperCase() || 'STATUS UNAVAILABLE')}${qCount > 4 ? ' · OT' : ''}</strong><p>${esc(report.venue || 'Venue unavailable')}</p><small>${esc(report.season)} · WEEK ${esc(report.week)}<br>${esc(datetime(report.kickoffUtc))}</small></div></div><div class="gr-quarter-table-wrap"><table class="gr-quarter-table"><thead><tr><th scope="col">TEAM</th>${Array.from({length:qCount},(_,n) => `<th scope="col">${n < 4 ? `Q${n+1}` : n === 4 ? 'OT' : `OT${n-3}`}</th>`).join('')}<th scope="col">TOTAL</th></tr></thead><tbody>${sides.map(abbr => `<tr><th scope="row"><img src="${esc(logo(abbr))}" alt="" width="500" height="500">${esc(displayAbbr(abbr))}</th>${Array.from({length:qCount},(_,n) => `<td>${fmt(quarters(abbr)[n])}</td>`).join('')}<td>${fmt(score(abbr))}</td></tr>`).join('')}</tbody></table></div>${report.disagreements?.length ? `<p class="gr-dispute">${report.disagreements.some(issue => issue.field !== 'venue') ? 'Some sources disagree. Affected values remain unavailable; inspect Sources.' : 'Provider venue labels differ. Inspect Sources.'}</p>` : ''}</section>`;
  }
  function tabs() {
    return `<div class="gr-tabs" role="tablist" aria-label="Game report sections">${[['overview','OVERVIEW'],['box-score','BOX SCORE'],['drives','DRIVES'],['plays','PLAYS']].map(([tab,label]) => `<button id="game-report-tab-${tab}" class="gr-button" data-gr-tab="${tab}" role="tab" aria-selected="${state.tab === tab}" aria-controls="game-report-panel-${tab}" tabindex="${state.tab === tab ? '0' : '-1'}">${label}</button>`).join('')}</div>`;
  }
  const difference = (a,b) => known(a) && known(b) ? Number(a)-Number(b) : null;
  const signed = n => known(n) ? `${Number(n)>0?'+':''}${fmt(n)}` : '—';
  function snapshot() {
    const [own,other] = pair(), ownQ = quarters(own)[3], oppQ = quarters(other)[3];
    const rush = difference(stats(own).rushing,stats(other).rushing), pass = difference(stats(other).netPassing,stats(own).netPassing);
    const fourth = known(ownQ) && known(oppQ) ? `${fmt(ownQ)}–${fmt(oppQ)}` : '—';
    return `<section class="gr-panel gr-framed gr-snapshot">${panelHeading('GAME SNAPSHOT')}<div class="gr-snapshot-grid"><article class="gr-snapshot-tile"><img src="${esc(logo(own))}" alt="" width="500" height="500"><div><h3>${esc(displayAbbr(own))} Q4</h3><strong>${fourth}</strong><p>${known(ownQ)&&known(oppQ) ? Number(ownQ)>Number(oppQ) ? `OUTSCORED ${esc(displayAbbr(other))} IN Q4` : Number(ownQ)<Number(oppQ) ? `OUTSCORED BY ${esc(displayAbbr(other))} IN Q4` : 'LEVEL IN Q4' : 'QUARTER DATA UNAVAILABLE'}</p></div></article><article class="gr-snapshot-tile"><img src="${esc(logo(own))}" alt="" width="500" height="500"><div><h3>${esc(displayAbbr(own))} RUSH</h3><strong>${signed(rush)}</strong><p>${known(rush) ? `RUSHING YARDS VS ${esc(displayAbbr(other))}` : 'RUSHING DATA UNAVAILABLE'}</p></div></article><article class="gr-snapshot-tile"><img src="${esc(logo(other))}" alt="" width="500" height="500"><div><h3>${esc(displayAbbr(other))} PASS</h3><strong>${signed(pass)}</strong><p>${known(pass) ? `NET PASSING YARDS VS ${esc(displayAbbr(own))}` : 'PASSING DATA UNAVAILABLE'}</p></div></article></div></section>`;
  }
  function statDisplay(abbr,key) {
    const s = stats(abbr);
    if (key === 'thirdDown') return known(s.thirdDownMade) && known(s.thirdDownAttempts) ? `${fmt(s.thirdDownMade)}/${fmt(s.thirdDownAttempts)}` : '—';
    if (key === 'penalties') return known(s.penalties) && known(s.penaltyYards) ? `${fmt(s.penalties)}–${fmt(s.penaltyYards)}` : '—';
    if (key === 'possession') return typeof s.possession === 'string' && /^\d{1,3}:\d{2}$/.test(s.possession) ? esc(s.possession) : '—';
    return fmt(s[key]);
  }
  const comparisonMetrics = [['Total offence','totalOffense'],['Net passing','netPassing'],['Rushing','rushing'],['Turnovers','turnovers'],['Third downs','thirdDown'],['Possession','possession'],['Penalties','penalties']];
  function comparison() {
    const sides = pair();
    return `<section class="gr-panel gr-framed gr-comparison">${panelHeading('TEAM COMPARISON',`<img class="gr-heading-mark gr-heading-opponent" src="${esc(logo(sides[1]))}" alt="" width="500" height="500">`,sides[0])}<table><thead><tr><th scope="col">${esc(titleCity(sides[0]))}</th><th scope="col">STATISTIC</th><th scope="col">${esc(titleCity(sides[1]))}</th></tr></thead><tbody>${comparisonMetrics.map(([label,key],i) => `<tr class="${i === 0 ? 'is-highlighted' : ''}"><td data-gr-stat="${key}" data-gr-team="${esc(sides[0])}">${statDisplay(sides[0],key)}</td><th scope="row">${label}</th><td data-gr-stat="${key}" data-gr-team="${esc(sides[1])}">${statDisplay(sides[1],key)}</td></tr>`).join('')}</tbody></table></section>`;
  }
  const performanceColumns = {passing:[['CMP/ATT','completionAttempt'],['YDS','passingYards'],['TD','passingTD'],['INT','interceptions']],rushing:[['ATT','rushingAttempts'],['YDS','rushingYards'],['AVG','rushingAverage'],['TD','rushingTD']],receiving:[['REC','receptions'],['YDS','receivingYards'],['TGT','targets'],['TD','receivingTD']]};
  const boxColumns = {...performanceColumns,defensive:[['TACK','totalTackles'],['SOLO','soloTackles'],['SACK','defensiveSacks'],['TFL','tacklesForLoss']],kicking:[['FGM','fieldGoalsMade'],['FGA','fieldGoalAttempts'],['XPM','extraPointsMade'],['PTS','kickingPoints']],punting:[['PUNT','punts'],['YDS','puntYards'],['AVG','grossAvgPuntYards'],['IN20','puntsInside20']],kickReturns:[['RET','kickoffReturns'],['YDS','kickoffReturnYards'],['AVG','yardsPerKickoffReturn'],['TD','kickoffReturnTD']],puntReturns:[['RET','puntReturns'],['YDS','puntReturnYards'],['AVG','yardsPerPuntReturn'],['TD','puntReturnTD']],fumbles:[['FUM','fumbles'],['LOST','fumblesLost'],['REC','fumblesRecovered']],interceptions:[['INT','defensiveInterceptions'],['YDS','interceptionReturnYards'],['TD','interceptionTD']]};
  function playerValue(player,key) {
    const s = player.stats || {};
    if (key === 'completionAttempt') return known(s.completions) && known(s.passingAttempts) ? `${fmt(s.completions)}/${fmt(s.passingAttempts)}` : '—';
    if (key === 'rushingAverage') return known(s.rushingYards) && known(s.rushingAttempts) && Number(s.rushingAttempts)>0 ? fmt(Number(s.rushingYards)/Number(s.rushingAttempts),1) : '—';
    return fmt(s[key],1);
  }
  function selectedPlayers() {
    const marker = state.kind === 'passing' ? 'passingAttempts' : state.kind === 'rushing' ? 'rushingAttempts' : 'receptions';
    return playerRows().filter(player => player.categories?.includes(state.kind) || player.statCategories?.includes(state.kind) || known(player.stats?.[marker]) || state.kind === 'receiving' && known(player.stats?.targets)).sort((a,b) => Number(b.stats?.[state.kind === 'passing' ? 'passingYards' : state.kind === 'rushing' ? 'rushingYards' : 'receivingYards'] ?? -Infinity) - Number(a.stats?.[state.kind === 'passing' ? 'passingYards' : state.kind === 'rushing' ? 'rushingYards' : 'receivingYards'] ?? -Infinity));
  }
  function performance() {
    const columns = performanceColumns[state.kind], rows = selectedPlayers();
    if (state.expanded !== null && !rows.some(p => String(p.id) === String(state.expanded))) state.expanded = rows[0]?.id || null;
    const teams = `<div class="gr-team-switch" role="group" aria-label="Player performance team">${pair().map(abbr => `<button class="gr-button" data-gr-team="${esc(abbr)}" aria-pressed="${state.performanceTeam === abbr}">${esc(titleCity(abbr))}</button>`).join('')}</div>`;
    return `<section class="gr-panel gr-framed gr-performance" id="game-report-performances">${panelHeading('PLAYER PERFORMANCES',teams)}<div class="gr-performance-tabs" role="group" aria-label="Player statistical category">${Object.keys(performanceColumns).map(kind => `<button class="gr-button" data-gr-kind="${kind}" aria-pressed="${state.kind === kind}">${kind[0].toUpperCase()+kind.slice(1)}</button>`).join('')}</div><div class="gr-player-table-head" aria-hidden="true"><span>PLAYER</span>${columns.map(([label]) => `<span>${label}</span>`).join('')}<span></span></div><div class="gr-player-list">${rows.map(player => {const expanded = String(state.expanded) === String(player.id);return `<article class="gr-player ${expanded ? 'is-expanded' : ''}"><button class="gr-player-row" data-gr-player="${esc(player.id)}" aria-expanded="${expanded}" aria-controls="gr-player-detail-${esc(player.id)}"><span class="gr-player-identity"><img src="${esc(logo(state.performanceTeam))}" alt="" width="500" height="500"><span><strong>${esc(player.name)}</strong><small>${esc(player.position || 'Position unavailable')}${player.jersey ? ` · #${esc(player.jersey)}` : ''}</small></span></span>${columns.map(([,key]) => `<b>${playerValue(player,key)}</b>`).join('')}${icon('chevron')}</button><div class="gr-player-expansion" id="gr-player-detail-${esc(player.id)}" ${expanded ? '' : 'hidden'}><small>${esc(report.season)} W${esc(report.week)} · Source-recorded game stats</small>${namedButton('OPEN PLAYER PROFILE','profile',`data-player="${esc(player.id)}"`)}</div></article>`;}).join('') || '<p class="gr-empty">Verified player statistics unavailable for this team and category. Missing rows are not zero or DNP.</p>'}</div></section>`;
  }
  function scoring() {
    const labels = [['Q1',1],['HALF',2],['Q3',3],['FINAL',null]];
    const cumulative = (abbr,count) => {const qs = quarters(abbr).slice(0,count);return qs.length === count && qs.every(known) ? qs.reduce((sum,n)=>sum+Number(n),0) : null;};
    return `<section class="gr-panel gr-framed gr-scoring">${panelHeading('SCORING BY QUARTER')}<div class="gr-cumulative-grid">${labels.map(([label,count]) => `<article class="gr-cumulative"><h3>${label}</h3>${pair().map(abbr => `<div><img src="${esc(logo(abbr))}" alt="" width="500" height="500"><span>${esc(displayAbbr(abbr))}</span><b>${fmt(count ? cumulative(abbr,count) : score(abbr))}</b></div>`).join('')}</article>`).join('')}</div><div class="gr-two-actions">${gem('OPEN FULL BOX SCORE','box-score')}${gem('OPEN PLAY-BY-PLAY','plays')}</div></section>`;
  }
  function availabilityText() {
    const availability = report?.availability;
    if (!availability || availability.status === 'unavailable') return 'Historical availability unreported';
    return 'Boxscore participants · status unreported';
  }
  function ancillary() {
    return `<section class="gr-ancillary gr-framed"><button class="gr-information" data-gr-action="availability">${icon('medical')}<span><strong>AVAILABILITY &amp; PARTICIPATION</strong><small>${availabilityText()}</small></span>${icon('chevron')}</button><div class="gr-source-card">${icon('document')}<span><strong>SOURCES</strong><small>Game-specific evidence<br>— = unavailable</small></span>${namedButton('VIEW SOURCES','sources')}</div></section>`;
  }
  function overview() {return snapshot()+comparison()+performance()+scoring()+ancillary();}
  function boxScore() {
    return `<section class="gr-panel gr-framed">${panelHeading('FULL BOX SCORE')}<p class="gr-context">${esc(report.season)} · Week ${esc(report.week)} · ${esc(displayAbbr(report.away_team))} at ${esc(displayAbbr(report.home_team))}. Source-recorded categories; unavailable fields remain —.</p>${pair().map(abbr => `<section class="gr-box-team"><h3><img src="${esc(logo(abbr))}" alt="" width="500" height="500">${esc(fullName(abbr))}</h3>${Object.entries(boxColumns).map(([kind,cols]) => {const rows = playerRows(abbr).filter(p => p.categories?.includes(kind) || p.statCategories?.includes(kind) || known(p.stats?.[cols[1][1]]) && performanceColumns[kind] || kind === 'receiving' && known(p.stats?.targets));return `<h4>${esc(kind.replace(/([A-Z])/g,' $1').toUpperCase())}</h4><table class="gr-box-table"><thead><tr><th scope="col">PLAYER</th>${cols.map(([label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(p => `<tr><th scope="row"><button data-gr-action="profile" data-player="${esc(p.id)}" data-player-team="${esc(abbr)}">${esc(p.name)} ${icon('chevron')}</button></th>${cols.map(([,key]) => `<td>${playerValue(p,key)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length+1}">Verified ${esc(kind)} rows unavailable.</td></tr>`}</tbody></table>`;}).join('')}</section>`).join('')}<p class="gr-context">Open a player profile for every published statistical category, including defensive and special-teams values where available.</p>${gem('VIEW TEAM COMPARISON','comparison')}</section>${comparison()}${ancillary()}`;
  }
  const listData = key => Array.isArray(report?.[key]) ? report[key] : Array.isArray(report?.[key]?.items) ? report[key].items : [];
  function drives() {
    const items = listData('drives');
    return `<section class="gr-panel gr-framed gr-drives">${panelHeading('DRIVES')}<p class="gr-context">${items.length ? `${items.length} source-recorded drives · possession, outcome and timing as published.` : 'Verified drive details are unavailable for this game. No drive sequence is invented.'}</p>${items.map((drive,n) => {const linkedPlays=Array.isArray(drive.plays)?drive.plays:Array.isArray(drive.playIds)?listData('plays').filter(p=>drive.playIds.includes(p.id)):[];return `<details class="gr-drive"><summary><img src="${esc(logo(drive.team || drive.teamAbbr || report.away_team))}" alt="" width="500" height="500"><span><strong>${esc(displayAbbr(drive.team || drive.teamAbbr || 'Team unavailable'))} · DRIVE ${n+1}</strong><small>${esc(drive.result || drive.displayResult || drive.description || 'Outcome unavailable')}</small></span><span>${known(drive.yards) ? `${fmt(drive.yards)} YDS` : '—'} ${icon('chevron')}</span></summary><dl><dt>Period</dt><dd>${esc(drive.period || drive.start?.quarter || 'Unavailable')}</dd><dt>Plays</dt><dd>${fmt(drive.playsCount ?? (Array.isArray(drive.plays) ? drive.plays.length : drive.plays))}</dd><dt>Time of possession</dt><dd>${esc(drive.duration || drive.timeOfPossession || drive.possessionTime || 'Unavailable')}</dd><dt>Start</dt><dd>${esc([drive.start?.clock,drive.start?.fieldPosition].filter(Boolean).join(' · ') || drive.start?.text || 'Unavailable')}</dd><dt>End</dt><dd>${esc([drive.end?.clock,drive.end?.fieldPosition].filter(Boolean).join(' · ') || drive.end?.text || 'Unavailable')}</dd></dl>${linkedPlays.map(play=>`<p class="gr-play-text"><small>${known(play.quarter)?`Q${fmt(play.quarter)}`:'Q—'} · ${esc(play.clock || '—')}</small> ${esc(play.text || play.description || 'Description unavailable')}</p>`).join('')}</details>`;}).join('')}${gem('OPEN PLAY-BY-PLAY','plays')}</section>${ancillary()}`;
  }
  function plays() {
    const items = listData('plays');
    return `<section class="gr-panel gr-framed gr-plays">${panelHeading('PLAY-BY-PLAY')}<p class="gr-context">${items.length ? `${items.length} source-recorded plays · chronological provider order. Descriptions are not independently inferred.` : 'Verified play-by-play is unavailable for this game. No plays or scoring events are invented.'}</p>${items.map(play => `<article class="gr-play ${play.scoringPlay ? 'is-scoring' : ''}"><div><strong>${known(play.quarter ?? play.period?.number ?? play.period) ? `Q${fmt(play.quarter ?? play.period?.number ?? play.period)}` : 'PERIOD —'}</strong><span>${esc(play.clock?.displayValue || play.clock || '—')}</span>${play.scoringPlay ? '<b>SCORING PLAY</b>' : ''}</div><p>${esc(play.text || play.description || 'Description unavailable')}</p>${known(play.awayScore) && known(play.homeScore) ? `<small>${esc(displayAbbr(report.away_team))} ${fmt(play.awayScore)} · ${esc(displayAbbr(report.home_team))} ${fmt(play.homeScore)}</small>` : ''}</article>`).join('')}${gem('OPEN FULL BOX SCORE','box-score')}</section>${ancillary()}`;
  }
  function navigation() {
    return `<nav class="gr-bottom-nav gr-framed" aria-label="Game report navigation">${[['home','home','Home'],['team','shield','Teams'],['matchups','matchups','Matchups'],['insights','insights','Insights'],['sources','more','More']].map(([action,mark,label]) => `<button data-gr-action="${action}" ${action === 'team' ? 'aria-current="page"' : ''}>${icon(mark)}<span>${label}</span></button>`).join('')}</nav><footer class="gr-footer"><button data-gr-action="sources">${icon('info')} SOURCES</button><span>${report?.disagreements?.length ? 'SOURCE DISAGREEMENTS' : 'SOURCE-BACKED GAME REPORT'}<small>${report ? `${esc(report.season)} · W${esc(report.week)} · ${esc(timestamp(report.retrievedAt || index?.retrievedAt))}` : '— = UNAVAILABLE'}</small></span></footer>`;
  }
  function render() {
    const holder = $('game-report-content'); if (!holder) return;
    const scroll = page()?.querySelector('.page-scroll'), oldScroll = scroll?.scrollTop || 0;
    const focused = holder.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, focusData = focused?.dataset ? {...focused.dataset} : null;
    if (!report) {
      holder.innerHTML = `${header()}<section class="gr-panel gr-framed gr-loading"><h1>GAME REPORT</h1><p role="status">${esc(error || (loading ? 'Loading the selected source-backed game…' : 'Select a completed game from team history to open its report.'))}</p>${error ? namedButton('RETRY VERIFIED REPORT','refresh') : ''}</section>${navigation()}`;
      return;
    }
    if (!pair().includes(state.performanceTeam)) state.performanceTeam = state.team;
    holder.innerHTML = `${header()}${hero()}${error ? `<p class="gr-retained" role="status">${esc(error)}</p>` : ''}${tabs()}${['overview','box-score','drives','plays'].map(tab => `<div id="game-report-panel-${tab}" role="tabpanel" aria-labelledby="game-report-tab-${tab}" ${state.tab === tab ? '' : 'hidden'}>${state.tab === tab ? ({overview, 'box-score':boxScore,drives,plays}[tab])() : ''}</div>`).join('')}${navigation()}`;
    if (scroll) scroll.scrollTop = oldScroll;
    if (focusId) $(focusId)?.focus({preventScroll:true});
    else if (focusData) {
      const target = [...holder.querySelectorAll('button')].find(node => Object.entries(focusData).every(([key,value]) => node.dataset[key] === value));
      target?.focus({preventScroll:true});
    }
    updateMotion();
  }
  function allPlayerStats(player) {
    const labels = {completions:'Completions',passingAttempts:'Passing attempts',passingYards:'Passing yards',passingTD:'Passing touchdowns',interceptions:'Interceptions',rushingAttempts:'Rushing attempts',rushingYards:'Rushing yards',rushingTD:'Rushing touchdowns',receptions:'Receptions',targets:'Targets',receivingYards:'Receiving yards',receivingTD:'Receiving touchdowns'};
    const fields = Object.entries(player.stats || {});
    return `<table><tbody>${fields.map(([key,value]) => `<tr><th scope="row">${esc(labels[key] || key.replace(/([A-Z])/g,' $1'))}</th><td>${known(value) ? fmt(value,1) : typeof value === 'string' && value ? esc(value) : '—'}</td></tr>`).join('') || '<tr><td>Verified player statistics unavailable.</td></tr>'}</tbody></table>`;
  }
  function sourceContent() {
    const sources = report?.sources || index?.sources || [];
    return `<p>${report ? `${esc(report.season)} · Week ${esc(report.week)} · ${esc(displayAbbr(report.away_team))} at ${esc(displayAbbr(report.home_team))}` : 'Selected game report'}. Every published value belongs to this game. Missing statistics are unavailable, not zero.</p><p>Report retrieved ${esc(timestamp(report?.retrievedAt || index?.retrievedAt))}.</p>${report?.disagreements?.length ? `<h3>Source disagreements</h3>${report.disagreements.map(issue => {const catalogIssue = index?.knownDisagreements?.find(item => item.gameId === report.id && item.reportField === issue.field && item.team === (issue.team || null) && String(item.playerEspnId || '') === String(issue.playerId || ''));return catalogIssue && window.PDSourceIntegrity?.describeIssue ? window.PDSourceIntegrity.describeIssue({...catalogIssue,fromIntegrityCatalog:true},esc,timestamp) : `<p>${esc(issue.field || issue.type || 'Reported disagreement')}: ${esc(issue.issue || issue.message || issue.note || JSON.stringify(issue))}</p>`;}).join('')}` : ''}${report?.unavailable?.length ? `<h3>Unavailable data</h3>${report.unavailable.map(item => `<p>${esc(item.reason || "This field was not supplied by the verified sources.")}</p>`).join('')}` : ''}<div class="gr-source-list">${sources.map(source => `<article><h3>${esc(source.provider || source.name || source.id)}</h3><p>${esc(source.status || 'Status unavailable')} · retrieved ${esc(timestamp(source.retrievedAt))}</p>${/^https:\/\//i.test(source.url || '') ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open original source ${icon('chevron')}</a>` : '<p>Source URL unavailable</p>'}<small>${esc(source.id || '')}${source.sha256 ? `<br>SHA-256: ${esc(source.sha256)}` : ''}</small></article>`).join('') || '<p>Source metadata unavailable.</p>'}</div>`;
  }
  function ensureDialog() {
    let dialog = $('game-report-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'game-report-dialog'; dialog.className = 'gr-dialog'; dialog.setAttribute('aria-labelledby','game-report-dialog-title');
      dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close game report details">×</button></form><h2 id="game-report-dialog-title"></h2><div id="game-report-dialog-content"></div>';
      document.body.append(dialog);
      dialog.addEventListener('close',() => {
        dialogState = null;
        const target = lastFocus?.isConnected ? lastFocus : lastFocusAttrs ? [...page().querySelectorAll('button')].find(button=>Object.entries(lastFocusAttrs).every(([key,value])=>button.dataset[key]===value)) : null;
        if(target && active())target.focus({preventScroll:true});
      });
    }
    return dialog;
  }
  function showDialog(action,node) {
    if (!report && action !== 'sources') return;
    const dialog = ensureDialog(); let title = 'GAME REPORT', content = '';
    if (action === 'sources') {title='SOURCES & FRESHNESS';content=sourceContent();}
    else if (action === 'profile') {
      const abbr = node.dataset.playerTeam || state.performanceTeam, player = playerRows(abbr).find(item => String(item.id) === String(node.dataset.player));
      title = player ? `${player.name} · ${displayAbbr(abbr)}` : 'PLAYER UNAVAILABLE';
      content = player ? `<p>${esc(player.position || 'Position unavailable')}${player.jersey ? ` · #${esc(player.jersey)}` : ''} · ${esc(report.season)} W${esc(report.week)} · ${esc(displayAbbr(report.away_team))} at ${esc(displayAbbr(report.home_team))}</p><p>Recorded performance for this selected game. Participation is source-recorded; a missing row does not establish DNP.</p>${allPlayerStats(player)}${player.espnId && /^\d+$/.test(String(player.espnId)) ? `<a href="https://www.espn.com/nfl/player/_/id/${esc(player.espnId)}" target="_blank" rel="noopener noreferrer">Open ESPN player profile ${icon('chevron')}</a>` : ''}<details><summary>Source evidence</summary>${sourceContent()}</details>` : '<p>This player row is unavailable in the selected report.</p>';
    } else if (action === 'availability') {
      title = 'AVAILABILITY & PARTICIPATION';
      const items = report.availability?.players || report.availability?.items || [], notes = report.availability?.note || report.availability?.notes;
      content = `<p>Pregame status and in-game participation require evidence from this exact game. Current injury lists are not substituted for historical availability.</p>${notes ? `<p>${esc(Array.isArray(notes) ? notes.join(' ') : notes)}</p>` : ''}${Array.isArray(items) && items.length ? `<table><thead><tr><th>PLAYER</th><th>STATUS</th></tr></thead><tbody>${items.map(item => `<tr><th>${esc(item.name || item.player || 'Player unavailable')}</th><td>${esc(item.status || 'Unavailable')}</td></tr>`).join('')}</tbody></table>` : '<p>Verified pregame/in-game availability reports unavailable.</p>'}<h3>SOURCE-RECORDED BOXSCORE PARTICIPANTS</h3>${pair().map(abbr => `<details><summary>${esc(fullName(abbr))} · ${playerRows(abbr).length} recorded player rows</summary><ul>${playerRows(abbr).map(p => `<li><button data-gr-action="profile" data-player="${esc(p.id)}" data-player-team="${esc(abbr)}">${esc(p.name)} · ${esc(p.position || 'Position unavailable')}</button></li>`).join('')}</ul></details>`).join('')}<p>The boxscore records statistical participants; it is not the complete active/inactive list and does not establish an injury diagnosis or reason for absence.</p>${sourceContent()}`;
    }
    $('game-report-dialog-title').textContent=title;$('game-report-dialog-content').innerHTML=content;dialogState={action,attrs:{...node.dataset}};
    if (!dialog.open) {lastFocus=node;lastFocusAttrs={...node.dataset};dialog.showModal();}else dialog.querySelector('.dialog-close')?.focus({preventScroll:true});
  }
  function writeRoute() {
    const q = new URLSearchParams({team:state.team});if(state.game)q.set('game',state.game);if(state.tab !== 'overview')q.set('tab',state.tab);
    if(state.returnRoute !== `team/${state.team}`)q.set('return',state.returnRoute);
    if(state.performanceTeam !== state.team)q.set('players',state.performanceTeam);if(state.kind !== 'passing')q.set('kind',state.kind);
    history.replaceState(null,'',`#game-report?${q}`);
  }
  function changeTab(tab,focus = true) {
    if(!['overview','box-score','drives','plays'].includes(tab))return;
    state.tab=tab;writeRoute();render();const node=$(`game-report-tab-${tab}`);if(focus){node?.scrollIntoView({block:'start',behavior:'auto'});node?.focus({preventScroll:true});}
  }
  function route(value) {
    const [path,query] = String(value || 'game-report').split('?'), q = new URLSearchParams(query || '');
    const abbr = String(q.get('team') || path.split('/')[1] || 'DAL').toUpperCase();
    const selectedGame = q.get('game'), changed = abbr !== state.team || selectedGame !== state.game;
    if(changed){generation++;report=null;error=null;state.expanded=undefined;}
    state.team = /^[A-Z]{2,3}$/.test(abbr) ? abbr : 'DAL';state.game=selectedGame;state.tab=q.get('tab')==='box'?'box-score':['overview','box-score','drives','plays'].includes(q.get('tab'))?q.get('tab'):'overview';
    state.performanceTeam = /^[A-Z]{2,3}$/.test(q.get('players') || '') ? q.get('players') : state.team;state.kind=['passing','rushing','receiving'].includes(q.get('kind'))?q.get('kind'):'passing';
    state.returnRoute=safeReturn(q.get('return'),state.team);render();return refresh(false,changed);
  }
  function enter({team='DAL',gameId,tab='overview',returnRoute=location.hash.slice(1)} = {}) {
    const abbr=String(team).toUpperCase(),q=new URLSearchParams({team:abbr});if(gameId)q.set('game',gameId);if(tab!=='overview')q.set('tab',tab);q.set('return',safeReturn(returnRoute,abbr));
    window.PDApp?.openPage(`game-report?${q}`);
  }
  async function fetchJSON(url,expectedHash=null,expectedBytes=null) {
    const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(url,{cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error(`Verified report request returned HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();
      if(known(expectedBytes)&&bytes.byteLength!==Number(expectedBytes))throw new Error('Report byte count does not match the verified index. Refresh the report snapshot.');
      if(expectedHash){if(!/^[a-f0-9]{64}$/i.test(expectedHash)||!window.crypto?.subtle)throw new Error('Cryptographic report verification is unavailable.');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expectedHash.toLowerCase())throw new Error('The game report checksum does not match its verified index. The inconsistent report was rejected.');}
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    finally {clearTimeout(timer);}
  }
  async function refresh(force=false,routeChanged=false) {
    if(loading&&!routeChanged)return loading;
    if(report&&!force&&!routeChanged&&Date.now()-checkedAt<60000)return report;
    const ticket=++generation,requestedTeam=state.team,requestedGame=state.game;
    const pending = (async()=>{
      // Even a fully cached route must yield before its finally clears loading.
      // Otherwise a synchronously resolved promise can strand the refresh lock.
      await Promise.resolve();
      try {
        let nextIndex=index;
        if(!index||force||Date.now()-checkedAt>=60000){nextIndex=await fetchJSON('assets/data/game-reports.json');if(nextIndex.schemaVersion!==1||!nextIndex.games||!Array.isArray(nextIndex.sources)||!Number.isFinite(Date.parse(nextIndex.retrievedAt)))throw new Error('Verified report index is invalid');if(index&&Date.parse(nextIndex.retrievedAt)<Date.parse(index.retrievedAt))throw new Error('Older report snapshot rejected');}
        if(ticket!==generation)return;
        index=nextIndex;
        const candidates=Object.values(index.games).filter(game=>game.home_team===requestedTeam||game.away_team===requestedTeam);
        const entry=requestedGame ? index.games[requestedGame] || candidates.find(game=>String(game.espnEventId)===requestedGame) : candidates.filter(game=>game.status==='final').sort((a,b)=>String(b.kickoffUtc || b.gameday || '').localeCompare(String(a.kickoffUtc || a.gameday || '')))[0];
        if(!entry)throw new Error('This game has no verified report in the available source coverage. Choose another completed game from team history.');
        if(entry.home_team!==requestedTeam&&entry.away_team!==requestedTeam)throw new Error('The selected game does not involve this team.');
        const url=entry.detailUrl;
        if(typeof url!=='string'||!/^assets\/data\/game-reports\/[A-Za-z0-9_-]+\.json$/.test(url))throw new Error('Verified report detail path is invalid');
        if(!/^[a-f0-9]{64}$/i.test(entry.sha256 || '')||!known(entry.bytes)||Number(entry.bytes)<1)throw new Error('Verified report checksum or byte count is unavailable.');
        const cached=detailCache.get(entry.id),next=cached&&cached.hash===entry.sha256&&!force?cached.value:await fetchJSON(url,entry.sha256,entry.bytes);
        if(ticket!==generation)return;
        if(next.schemaVersion!==1||next.id!==entry.id||next.home_team!==entry.home_team||next.away_team!==entry.away_team||next.season!==entry.season||next.week!==entry.week||next.status!==entry.status||next.home_score!==entry.home_score||next.away_score!==entry.away_score||!Array.isArray(next.sources)||!Number.isFinite(Date.parse(next.retrievedAt)))throw new Error('The report does not match the requested game identity, score or provenance.');
        const changed=!report||report.id!==entry.id||cached?.hash!==entry.sha256,recovered=error!==null;
        report=next;detailCache.set(entry.id,{hash:entry.sha256,value:next});state.game=entry.id;checkedAt=Date.now();error=null;document.documentElement.dataset.gameReportDataReady='true';
        if(active()){writeRoute();if(changed||recovered){render();if(dialogState)showDialog(dialogState.action,{dataset:dialogState.attrs});}}
        document.dispatchEvent(new CustomEvent('pd:game-report-data-ready',{detail:{gameId:entry.id,retrievedAt:next.retrievedAt,changed,recovered}}));return report;
      } catch(err) {
        if(ticket!==generation)return;
        const nextError=`${report ? 'Retained the preceding report for this game. ' : ''}${err.name==='AbortError'?'The report request timed out.':err.message}`,errorChanged=error!==nextError;
        error=nextError;document.documentElement.dataset.gameReportDataReady=report?'true':'error';if(active()&&(errorChanged||!report))render();
        document.dispatchEvent(new CustomEvent('pd:game-report-data-error',{detail:{gameId:requestedGame,message:error,retained:!!report}}));
      } finally {if(ticket===generation){loading=null;if(active())page()?.querySelector('[data-gr-action="refresh"]')?.setAttribute('aria-busy','false');}}
    })();loading=pending;if(!report&&active())render();return pending;
  }
  document.addEventListener('click',event=>{
    const node=event.target.closest('button');if(!node||!node.closest('[data-page="game-report"],#game-report-dialog'))return;
    if(!node.dataset.grTab&&!node.dataset.grTeam&&!node.dataset.grKind&&!node.dataset.grPlayer&&!node.dataset.grAction)return;
    // Legacy roster handling also recognizes generic data-player attributes.
    // Consume this route's controls before those unrelated listeners run.
    event.stopImmediatePropagation();
    if(node.dataset.grTab)return changeTab(node.dataset.grTab);
    if(node.dataset.grTeam){state.performanceTeam=node.dataset.grTeam;state.expanded=undefined;writeRoute();render();return;}
    if(node.dataset.grKind){state.kind=node.dataset.grKind;state.expanded=undefined;writeRoute();render();return;}
    if(node.dataset.grPlayer){state.expanded=String(state.expanded)===node.dataset.grPlayer?null:node.dataset.grPlayer;render();return;}
    const action=node.dataset.grAction;
    if(action==='back')return window.PDApp?.openPage(safeReturn(state.returnRoute));
    if(action==='team')return window.PDApp?.openPage(`team/${state.team}`);
    if(action==='nfl')return window.PDApp?.openLadder(state.team,true);
    if(action==='home')return window.PDApp?.openPage('home');
    if(action==='matchups')return window.MatchupBreakdown?.enter(state.team,report?.id,'form');
    if(action==='refresh'){node.setAttribute('aria-busy','true');return refresh(true);}
    if(['box-score','drives','plays'].includes(action))return changeTab(action);
    if(action==='insights'){changeTab('overview',false);$('game-report-performances')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
    if(action==='comparison'){changeTab('overview',false);page()?.querySelector('.gr-comparison')?.scrollIntoView({block:'center',behavior:'auto'});return;}
    if(['sources','profile','availability'].includes(action))showDialog(action,node);
  });
  document.addEventListener('keydown',event=>{const list=event.target.closest('.gr-tabs');if(!list||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const items=[...list.querySelectorAll('[role="tab"]')],n=items.indexOf(document.activeElement);if(n<0)return;event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(n+(event.key==='ArrowRight'?1:-1)+items.length)%items.length].click();});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function updateMotion(){if(page())page().dataset.grMotion=!document.hidden&&active()&&!reduced.matches?'running':'paused';}
  reduced.addEventListener?.('change',updateMotion);
  document.addEventListener('pd:route-change',event=>{updateMotion();if(event.detail?.page!=='game-report'&&$('game-report-dialog')?.open)$('game-report-dialog').close();});
  document.addEventListener('visibilitychange',()=>{updateMotion();if(!document.hidden&&active())refresh();});
  window.addEventListener('focus',()=>{if(active())refresh();});window.addEventListener('online',()=>{if(active())refresh(true);});
  document.addEventListener('pd:data-ready',()=>{if(active())refresh(true);});
  setInterval(()=>{if(!document.hidden&&active())refresh();},90000);
  window.PDGameReport={route,enter,refresh,render,getState:()=>({...state}),getDataset:()=>index,getReport:()=>report};
  if(/^#game-report(?:\/|\?|$)/i.test(location.hash))route(location.hash.slice(1));
})();
