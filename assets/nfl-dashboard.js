(() => {
  'use strict';

  // The dashboard is a view of the existing verified snapshot. It never alters
  // the feed, invents results, or routes unfinished destinations to another page.
  let context = null;
  let bound = false;
  let cachedData = null;
  let cachedGames = [];
  const $ = id => document.getElementById(id);
  const exists = value => value !== null && value !== undefined && value !== '';
  const finite = value => exists(value) && Number.isFinite(Number(value));
  const getAbbr = team => team.abbr || String(team.id || '').toUpperCase();
  const rightChevron = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#chevron"></use></svg>';
  // Give source initials readable spacing without changing the stored name.
  const readablePlayerName = player => String(player.short || player.name || '').replace(/^([A-Za-z]{1,3}\.)(?=\S)/, '$1 ');

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
    const games = completedGames(data, snapshot.throughWeek).filter(game => game.home_team === abbr || game.away_team === abbr);
    const sourceIds = [...new Set(games.map(game => game.sourceId).filter(Boolean))];
    const provenance = {status:'derived',season:data.season,throughWeek:snapshot.throughWeek,sourceIds,retrievedAt:data.sources?.find(source => source.id === 'nflverse_games')?.retrievedAt || data.retrievedAt,note:'Calculated from complete retained final scores, checked against sourced record and points totals. Home/away follows the source designation, including neutral venues.'};
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
    if (!Object.hasOwn(state,'nflExpandedTeam')) state.nflExpandedTeam = 'PIT';
    if (!Object.hasOwn(state,'nflLeaderExpanded')) state.nflLeaderExpanded = new Set();
    if (!Object.hasOwn(state,'nflPreview')) state.nflPreview = null;
    if (!Object.hasOwn(state,'nflPreviewReturn')) state.nflPreviewReturn = null;
  }

  function sourceContext(snapshot) {
    const {data,timestamp} = context;
    const sourceIds = data.provenance?.standings?.sourceIds || [];
    const names = sourceIds.map(id => data.sources?.find(source => source.id === id)?.name || id.replaceAll('_',' '));
    const source = data.sources?.find(item => item.id === 'nflverse_games');
    return `${data.season} · records through Week ${snapshot.throughWeek} · ${names.join(', ') || 'Verified source snapshot'} · retrieved ${timestamp(source?.retrievedAt || data.retrievedAt)}`;
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
    return `<div class="nfl-team-summary" role="row"><div class="nfl-summary-content" role="cell" aria-colspan="9"><div class="nfl-summary-identity"><img src="${esc(logo(team.id))}" alt="" width="500" height="500" decoding="async"><div><small>${esc(team.fullName?.replace(team.name,'').trim() || abbr)}</small><strong>${esc(team.name)}</strong></div></div><div class="nfl-summary-metrics">${metrics.map(([label,metric]) => `<div class="nfl-summary-metric${label === 'DIFF' ? ` ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}` : ''}"><small>${label}</small><strong>${esc(metric)}</strong></div>`).join('')}</div><button id="nfl-team-details-${esc(abbr.toLowerCase())}" class="nfl-detail-button" data-nfl-action="team-details" data-team="${esc(abbr)}">Team details ${rightChevron}</button></div></div>`;
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
    const sortMetric = team => state.nflSort === 'PF' ? Number(team.pointsFor) : state.nflSort === 'PA' ? -Number(team.pointsAgainst) : state.nflSort === 'DIFF' ? differential(team) : Number(team.pct);
    all.sort((a,b) => {
      const av = sortMetric(a), bv = sortMetric(b);
      return (Number.isFinite(bv) ? bv : -Infinity) - (Number.isFinite(av) ? av : -Infinity) || Number(b.pct) - Number(a.pct) || (differential(b) ?? -Infinity) - (differential(a) ?? -Infinity) || getAbbr(a).localeCompare(getAbbr(b));
    });
    const filtered = all.filter(team => state.nflDivision === 'all' || teamMap.get(getAbbr(team))?.division === state.nflDivision);
    let teams = filtered;
    if (!state.standingsExpanded && filtered.length > 5) {
      const featured = new Set(filtered.slice(0,4).map(getAbbr));
      featured.add(state.conference === 'AFC' && filtered.some(team => getAbbr(team) === 'PIT') ? 'PIT' : getAbbr(filtered[4]));
      for (const team of filtered) {
        if (featured.size >= 5) break;
        featured.add(getAbbr(team));
      }
      teams = filtered.filter(team => featured.has(getAbbr(team)));
    }
    $('table-caption').textContent = `${state.conference} STANDINGS`;
    document.querySelector('[data-page="nfl"] .through-week').textContent = `THROUGH WEEK ${snapshot.throughWeek}`;
    const mark = $('nfl-conference-mark');
    if (mark) { mark.src = `assets/nfl-dashboard/${state.conference.toLowerCase()}.svg`; mark.alt = state.conference; }
    const sortContext = {
      PCT:{label:'win percentage',column:4,direction:'descending'},
      PF:{label:'points scored',column:5,direction:'descending'},
      PA:{label:'points allowed',column:6,direction:'ascending'},
      DIFF:{label:'point differential',column:7,direction:'descending'}
    }[state.nflSort] || {label:'win percentage',column:4,direction:'descending'};
    const table = document.querySelector('[data-page="nfl"] .standings');
    table?.setAttribute('aria-label',`${state.conference} records sorted by ${sortContext.label}; not official playoff seeding`);
    table?.querySelectorAll('[role="columnheader"]').forEach((heading,index) => {
      const selected = index === sortContext.column;
      heading.classList.toggle('nfl-sort-heading',selected);
      if (selected) heading.setAttribute('aria-sort',sortContext.direction); else heading.removeAttribute('aria-sort');
    });
    $('standings-rows').innerHTML = teams.map(team => {
      const abbr = getAbbr(team), diff = differential(team), expanded = state.nflExpandedTeam === abbr;
      return `<div class="stand-row${abbr === 'PIT' ? ' steelers-row' : ''}${expanded ? ' is-expanded' : ''}" role="row"><span role="cell" title="Sorted record order; not official playoff seeding">${all.indexOf(team)+1}</span><span class="table-team" role="cell"><button id="nfl-team-${esc(abbr.toLowerCase())}" class="team-link" data-nfl-action="team" data-team="${esc(abbr)}" aria-expanded="${expanded}" aria-label="${esc(team.fullName || team.name)} record details"><img src="${esc(logo(team.id))}" alt="" width="500" height="500" decoding="async"><span>${esc(team.name)}</span></button></span><span role="cell">${number(team.w)}</span><span role="cell" title="${team.ties || 0} ties">${number(team.l)}${team.ties ? `<small class="tie-mark">+${team.ties}T</small>` : ''}</span><span class="nfl-pct" role="cell">${esc(team.pct || '—')}</span><span role="cell">${number(team.pointsFor)}</span><span role="cell">${number(team.pointsAgainst)}</span><span class="${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}" role="cell">${finite(diff) ? `${diff > 0 ? '+' : ''}${number(diff)}` : '—'}</span><span class="stand-form" role="cell" aria-label="Recent results, oldest to newest">${formChips(team,snapshot)}</span></div>${expanded ? teamSummary(team,snapshot) : ''}`;
    }).join('');
    const toggle = document.querySelector('[data-page="nfl"] [data-standings-toggle]');
    if (toggle) {
      const label = toggle.querySelector('span:not([aria-hidden])');
      const text = state.standingsExpanded ? 'SHOW FEATURED TEAMS' : `VIEW ALL ${filtered.length} TEAMS`;
      if (label) label.textContent = text; else toggle.textContent = text;
      toggle.setAttribute('aria-expanded',String(state.standingsExpanded));
    }
    const note = $('nfl-filter-note');
    if (note) { note.hidden = !!teams.length; note.textContent = 'Verified conference records are unavailable for this filter.'; }
  }

  function leaderboards(snapshot, panel) {
    const {state,esc,number} = context;
    const labels = {QB:'PASSING',RB:'RUSHING',WR:'RECEIVING'};
    return ['QB','RB','WR'].map(position => {
      const players = snapshot.leaders?.[position] || [];
      const expanded = state.nflLeaderExpanded.has(position);
      const shown = expanded ? players : players.slice(0,5);
      const week = snapshot.leadersWeek ?? snapshot.throughWeek;
      return `<section class="leader-panel nfl-leader-panel nfl-framed nfl-motion-zone" data-nfl-leader-panel="${position}"><span class="nfl-frame-shimmer" aria-hidden="true"></span><span class="nfl-bevel-corner is-tl" aria-hidden="true"></span><span class="nfl-bevel-corner is-tr" aria-hidden="true"></span><span class="nfl-bevel-corner is-bl" aria-hidden="true"></span><span class="nfl-bevel-corner is-br" aria-hidden="true"></span><div class="nfl-leader-heading"><div><h2>TOP ${position}s</h2><span>${labels[position]} · ${finite(week) && Number(week) > 0 ? `WEEK ${week}` : 'AWAITING VERIFIED WEEK'}</span></div><button id="nfl-${panel}-${position.toLowerCase()}" class="nfl-view-all" data-nfl-action="leaders" data-position="${position}" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'View all available'} ${position} leaders">${expanded ? 'Show less' : 'View all'} ${rightChevron}</button></div><div class="leader-columns"><span>#</span><span>PLAYER</span><span>YDS</span><span>TD</span></div>${shown.length ? shown.map((player,index) => `<div class="leader-row"><b>${index+1}</b><span title="${esc(player.name)}">${esc(readablePlayerName(player))}</span><span>${number(player.yards)}</span><span>${number(player.td)}</span></div>`).join('') : '<p class="nfl-leaders-unavailable">Verified weekly leaders unavailable.</p>'}${expanded ? `<p class="nfl-dataset-note">${players.length} source-backed ${position} records available${players.length <= 5 ? '; no additional rows are published in this snapshot' : ''}.</p>` : ''}</section>`;
    }).join('');
  }

  function matchup(snapshot) {
    const {data,state,esc,logo,teamName,date,time,number} = context;
    const game = snapshot.fixture;
    if (!game) return `<div class="nfl-bye-state"><img src="${esc(logo('pit'))}" alt="Pittsburgh Steelers" width="500" height="500"><strong>No Steelers fixture this week</strong><span>Week ${esc(state.week)} · ${data.season}</span><button data-nfl-action="schedule">View available schedule</button></div>`;
    const opponent = game.home_team === 'PIT' ? game.away_team : game.home_team;
    const info = abbr => (data.teams || []).find(team => getAbbr(team) === abbr);
    const equipment = {PIT:'assets/nfl-dashboard/helmet-pit-upright.webp',IND:'assets/nfl-dashboard/helmet-ind-upright.webp'};
    const side = (abbr,sideClass) => {
      const team = info(abbr);
      const short = team?.name || teamName(abbr);
      const city = team?.fullName?.replace(short,'').trim() || abbr;
      const helmet = equipment[abbr];
      return `<div class="nfl-matchup-team ${sideClass}${helmet ? ' has-helmet has-upright-helmet' : ' has-team-logo'}"><div class="nfl-equipment-wrap"><img class="nfl-matchup-helmet" src="${esc(helmet || logo(abbr))}" alt="${esc(team?.fullName || short)}${helmet ? ' decorative helmet' : ''}" width="${helmet ? '1254' : '500'}" height="${helmet ? '1254' : '500'}" decoding="async">${helmet ? `<img class="nfl-matchup-mark" src="${esc(logo(abbr))}" alt="" width="500" height="500" decoding="async">` : ''}</div><small>${esc(city)}</small><strong>${esc(short)}</strong></div>`;
    };
    const final = game.status === 'final';
    const ownScore = game.home_team === 'PIT' ? game.home_score : game.away_score;
    const otherScore = game.home_team === 'PIT' ? game.away_score : game.home_score;
    const when = final ? `FINAL · ${number(ownScore)}–${number(otherScore)} · ${date(game)}` : `${date(game)} · ${time(game)}`;
    return `<div class="nfl-matchup-art">${side('PIT','is-home')}<span class="nfl-matchup-vs" aria-hidden="true">VS</span>${side(opponent,'is-away')}</div><p class="nfl-matchup-meta">${esc(when)} · ${esc(game.venue || 'Venue unavailable')}</p><div class="nfl-matchup-actions"><button class="nfl-matchup-action is-primary" data-nfl-action="matchup">VIEW MATCHUP ${rightChevron}</button><button class="nfl-matchup-action" data-nfl-action="compare">COMPARE TEAMS ${rightChevron}</button><button class="nfl-matchup-action" data-nfl-action="team-form">TEAM FORM ${rightChevron}</button></div>`;
  }

  function recap(snapshot) {
    const {esc,number,teamName} = context;
    const week = snapshot.recapWeek ?? snapshot.leadersWeek;
    const games = snapshot.recap || [];
    $('recap-title').textContent = finite(week) && Number(week) > 0 ? `WEEK ${week} · RESULTS` : 'WEEKLY RECAP';
    $('recap-content').innerHTML = games.length ? `<p class="nfl-dataset-note">${context.data.season} · completed source results for Week ${esc(week)}</p>${games.map(game => `<div class="nfl-recap-game"><span>${esc(teamName(game.away_team))} <small>@</small> ${esc(teamName(game.home_team))}</span><strong>${number(game.away_score)}–${number(game.home_score)}</strong></div>`).join('')}` : '<p class="nfl-dataset-note">No verified completed results are available for this recap week.</p>';
  }

  function preview() {
    const node = $('nfl-inline-preview');
    if (!node) return;
    const {data,state,esc,number,teamName,date,time} = context;
    const request = state.nflPreview;
    node.hidden = !request;
    if (!request) { node.innerHTML = ''; return; }
    const snapshot = data.weeks[state.week];
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
    const {data,state} = context;
    const snapshot = data.weeks[state.week];
    if (!snapshot) return;
    $('week-select').value = state.week;
    document.querySelectorAll('[data-conference]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.conference === state.conference)));
    document.querySelectorAll('[data-week]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.week === state.week)));
    standings(snapshot);
    $('ladder-leaders').innerHTML = leaderboards(snapshot,'ladder');
    $('players-leaders').innerHTML = leaderboards(snapshot,'players');
    $('featured-matchup').innerHTML = matchup(snapshot);
    $('fixture-context').textContent = `WEEK ${state.week}`;
    recap(snapshot);
    preview();
    const provenance = $('nfl-data-context');
    if (provenance) {
      provenance.textContent = `${data.season} · source-backed snapshot · records W${snapshot.throughWeek} · stats ${finite(snapshot.leadersWeek) ? `W${snapshot.leadersWeek}` : 'unavailable'}`;
      provenance.title = `${sourceContext(snapshot)}. Form and home/away splits are calculated from complete retained final scores; sorted rows are not official playoff seeds.`;
    }
    if (!bound) bind();
  }

  function rerender() {
    const page = document.querySelector('[data-page="nfl"]');
    const scroll = page?.querySelector('.page-scroll');
    const top = scroll?.scrollTop;
    const focus = document.activeElement;
    let selector = focus?.id ? `#${CSS.escape(focus.id)}` : null;
    if (!selector && focus?.dataset?.nflAction) selector = `[data-nfl-action="${CSS.escape(focus.dataset.nflAction)}"]${focus.dataset.team ? `[data-team="${CSS.escape(focus.dataset.team)}"]` : focus.dataset.position ? `[data-position="${CSS.escape(focus.dataset.position)}"]` : ''}`;
    render(context);
    if (scroll) scroll.scrollTop = top;
    if (selector && !focus.isConnected) page?.querySelector(selector)?.focus({preventScroll:true});
  }

  function bind() {
    bound = true;
    document.addEventListener('click',event => {
      const button = event.target.closest('button');
      if (!button?.closest('[data-page="nfl"]') || !context) return;
      const {state} = context;
      const action = button.dataset.nflAction;
      if (!action && !button.dataset.conference && !button.hasAttribute('data-standings-toggle')) return;
      // Prevent the legacy page navigation handler from opening future screens.
      event.stopImmediatePropagation();
      if (action === 'team-details') {
        window.PDTeamDetails?.enter(button.dataset.team);
        return;
      }
      if (button.dataset.conference) { state.conference = button.dataset.conference; state.nflDivision = 'all'; }
      else if (button.hasAttribute('data-standings-toggle')) state.standingsExpanded = !state.standingsExpanded;
      else if (action === 'team') state.nflExpandedTeam = state.nflExpandedTeam === button.dataset.team ? null : button.dataset.team;
      else if (action === 'leaders') {
        const position = button.dataset.position;
        if (state.nflLeaderExpanded.has(position)) state.nflLeaderExpanded.delete(position); else state.nflLeaderExpanded.add(position);
      } else if (action === 'close-preview') state.nflPreview = null;
      else {
        state.nflPreview = {action,team:button.dataset.team};
        state.nflPreviewReturn = button.id ? `#${CSS.escape(button.id)}` : `[data-nfl-action="${CSS.escape(action)}"]`;
      }
      rerender();
      if (action === 'close-preview' && state.nflPreviewReturn) document.querySelector('[data-page="nfl"]')?.querySelector(state.nflPreviewReturn)?.focus({preventScroll:true});
      if (state.nflPreview && action && action !== 'team' && action !== 'leaders') {
        const node = $('nfl-inline-preview');
        node?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'nearest'});
        node?.focus({preventScroll:true});
      }
    },true);
    document.addEventListener('change',event => {
      if (!context || !event.target.closest('[data-page="nfl"]')) return;
      const keys = {'division-select':'nflDivision','form-select':'nflForm','standings-sort':'nflSort'};
      const key = keys[event.target.id];
      if (!key) return;
      context.state[key] = key === 'nflForm' ? Number(event.target.value) : event.target.value;
      rerender();
    });
  }

  window.PDNFLDashboard = {render,deriveTeamResults:teamResults};
})();
