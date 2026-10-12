(() => {
  'use strict';
  const dependency = {'team-details':'teamDetailsSha256','matchup-breakdown':'matchupBreakdownSha256','player-history':'playerHistorySha256'};
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (value,key) => Object.prototype.hasOwnProperty.call(value || {},key);
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validHash = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  const gameId = value => value?.gameId || value?.id;
  let pendingCatalog = null, lastCatalog = null;

  function validate(index) {
    if (index?.schemaVersion !== 1 || index.integrityCatalog?.schemaVersion !== 1 || !Array.isArray(index.knownDisagreements) || !index.games || !validTime(index.retrievedAt)) throw new Error('Source disagreement catalog is unavailable or invalid');
    const deps = index.integrityCatalog.dependencies;
    if (!deps || Object.values(dependency).some(key => !validHash(deps[key]) || deps[key] !== index.dependencies?.[key])) throw new Error('Source disagreement catalog versions are invalid');
    const counts = new Map(), identities = new Set();
    for (const issue of index.knownDisagreements) {
      const entry = index.games[issue.gameId];
      if (!entry || Number(issue.season) !== Number(entry.season) || Number(issue.week) !== Number(entry.week) || issue.detailUrl !== entry.detailUrl || issue.reportSha256 !== entry.sha256 || !validHash(issue.reportSha256) || !validTime(issue.reportRetrievedAt)) throw new Error('Source disagreement does not match its verified report');
      if (!['team','player','event','venue'].includes(issue.scope) || !/^[A-Za-z][A-Za-z0-9]*$/.test(issue.field || '') || !['unavailable','disclosed-alias'].includes(issue.resolution) || (issue.scope === 'venue') !== (issue.resolution === 'disclosed-alias')) throw new Error('Source disagreement resolution is unsupported');
      if (issue.scope === 'event' && !['kickoffUtc','neutral','neutralSite'].includes(issue.field)) throw new Error('Source event disagreement field is unsupported');
      if (['team','player'].includes(issue.scope) && ![entry.home_team,entry.away_team].includes(issue.team)) throw new Error('Source disagreement team is invalid');
      if (issue.scope === 'player' && !issue.playerEspnId && !issue.playerGsisId) throw new Error('Source disagreement player identity is unavailable');
      if (!Array.isArray(issue.values) || !Array.isArray(issue.sourceIds) || issue.values.length < 2 || issue.sourceIds.length < 2 || !Array.isArray(issue.sources) || issue.sourceIds.some(id => !issue.sources.some(source => source.id === id && /^https:\/\//.test(source.url || '') && validTime(source.retrievedAt)))) throw new Error('Source disagreement alternatives lack provenance');
      if (issue.readings && (!Array.isArray(issue.readings) || issue.readings.length < 2 || issue.readings.some(reading => !Array.isArray(reading.sourceIds) || !reading.sourceIds.length || !own(reading,'value') || reading.value !== null && !['string','number','boolean'].includes(typeof reading.value) || typeof reading.value === 'number' && !Number.isFinite(reading.value) || reading.sourceIds.some(id => !issue.sourceIds.includes(id))))) throw new Error('Source disagreement value attribution is invalid');
      const key = [issue.gameId,issue.scope,issue.team || '',issue.playerEspnId || issue.playerGsisId || '',issue.field].join('|');
      if (identities.has(key)) throw new Error('Source disagreement catalog contains a duplicate');
      identities.add(key); counts.set(issue.gameId,(counts.get(issue.gameId) || 0)+1);
    }
    for (const [id,entry] of Object.entries(index.games)) if (!Number.isInteger(entry.disagreementCount) || entry.disagreementCount !== (counts.get(id) || 0)) throw new Error('Source disagreement catalog is incomplete');
    return index;
  }

  async function catalog() {
    if (!pendingCatalog) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),18000);
      pendingCatalog = (async () => {
        try {
          await Promise.resolve();
          const response = await fetch('assets/data/game-reports.json',{cache:'no-cache',signal:controller.signal});
          if (!response.ok) throw new Error(`Source disagreement catalog returned HTTP ${response.status}`);
          const value = validate(await response.json()); lastCatalog = value; return value;
        } finally { clearTimeout(timeout); pendingCatalog = null; }
      })();
    }
    return pendingCatalog;
  }

  async function abortable(promise,signal) {
    if (!signal) return promise;
    if (signal.aborted) {promise.catch(() => {});throw new DOMException('Source verification aborted','AbortError');}
    let onAbort;
    try { return await Promise.race([promise,new Promise((resolve,reject) => {onAbort = () => reject(new DOMException('Source verification aborted','AbortError'));signal.addEventListener('abort',onAbort,{once:true});})]); }
    finally { signal.removeEventListener('abort',onAbort); }
  }

  function subjects(data,kind) {
    const games = [], rows = [], players = [];
    if (kind === 'player-history') {
      for (const [id,player] of Object.entries(data.players || {})) {
        players.push({player,abbr:null});
        for (const row of Object.values(player.games || {})) rows.push({row,player,playerId:id,abbr:row.teamCanonical || row.team});
      }
    } else for (const [abbr,club] of Object.entries(data.teams || {})) {
      games.push(...(club.games || []),...(club.headToHeadGames || []));
      for (const report of Object.values(club.fixtureReports || {})) games.push(report);
      const list = kind === 'team-details' ? club.roster : club.players;
      for (const player of Array.isArray(list) ? list : Object.values(list || {})) {
        players.push({player,abbr});
        for (const row of [...(player.gameLog || []),...(player.last5 || [])]) rows.push({row,player,playerId:player.id,abbr:row.teamCanonical || row.team || abbr});
      }
    }
    return {games,rows,players};
  }

  function effectiveStructure(raw,kind,issues) {
    // Source books are read-only. Copy only paths touched by the catalog;
    // retaining an entire second 29 MB matchup tree would waste mobile memory.
    const byGame = new Map();
    for (const issue of issues) {if (!byGame.has(issue.gameId)) byGame.set(issue.gameId,[]);byGame.get(issue.gameId).push(issue);}
    const data = {...raw,sources:[...(raw.sources || [])]};
    function copyGame(game) {
      const list = byGame.get(gameId(game)); if (!list) return game;
      const value = {...game}; if (game.sourceIntegrityIssues) value.sourceIntegrityIssues = [...game.sourceIntegrityIssues];
      const teamIssues = list.filter(issue => issue.scope === 'team');
      if (teamIssues.some(issue => own(game.stats?.[issue.team],issue.field))) {
        value.stats = {...game.stats};
        for (const issue of teamIssues) if (own(game.stats?.[issue.team],issue.field)) value.stats[issue.team] = {...value.stats[issue.team]};
      }
      return value;
    }
    function copyPlayer(player,id,abbr) {
      let value = player;
      const mutable = () => {if (value === player) {value = {...player};if(player.sourceIntegrityIssues)value.sourceIntegrityIssues = [...player.sourceIntegrityIssues];}return value;};
      function copyRow(row) {
        const list = byGame.get(gameId(row)); if (!list) return row;
        const result = {...row};if(row.sourceIntegrityIssues)result.sourceIntegrityIssues = [...row.sourceIntegrityIssues];
        const relevant = list.filter(issue => issue.scope === 'player' && (row.teamCanonical || row.team || abbr) === issue.team && playerMatches(issue,player,id));
        if (relevant.some(issue => own(row.stats,issue.field) || issue.field === 'targets' && own(row.stats,'targetShare'))) result.stats = {...row.stats};
        if (relevant.some(issue => issue.field === 'targets') && row.advanced) result.advanced = {...row.advanced};
        return result;
      }
      if (kind === 'player-history') {
        const entries = Object.entries(player.games || {}).map(([key,row]) => [key,copyRow(row)]);
        if (entries.some(([key,row]) => row !== player.games[key])) mutable().games = Object.fromEntries(entries);
      } else for (const key of ['gameLog','last5']) if (Array.isArray(player[key])) {
        const list = player[key].map(copyRow);if(list.some((row,i) => row !== player[key][i]))mutable()[key] = list;
      }
      if (issues.some(issue => issue.scope === 'player' && Number(issue.season) === Number(raw.season) && playerMatches(issue,player,id) && (own(player.seasonStats,issue.field) || issue.field === 'targets' && own(player.seasonStats,'targetShare')))) mutable().seasonStats = {...player.seasonStats};
      return value;
    }
    if (kind === 'player-history') data.players = Object.fromEntries(Object.entries(raw.players || {}).map(([id,p]) => [id,copyPlayer(p,id,null)]));
    else data.teams = Object.fromEntries(Object.entries(raw.teams || {}).map(([abbr,club]) => {
      const value = {...club};
      for (const key of ['games','headToHeadGames']) if (Array.isArray(club[key])) value[key] = club[key].map(copyGame);
      if (club.fixtureReports) value.fixtureReports = Object.fromEntries(Object.entries(club.fixtureReports).map(([id,game]) => [id,copyGame(game)]));
      const key = kind === 'team-details' ? 'roster' : 'players', list = club[key];
      if (Array.isArray(list)) value[key] = list.map(p => copyPlayer(p,p.id,abbr));
      else if (list) value[key] = Object.fromEntries(Object.entries(list).map(([id,p]) => [id,copyPlayer(p,id,abbr)]));
      return [abbr,value];
    }));
    return data;
  }

  function normalized(issue) {
    return {...issue,playerId:issue.playerGsisId || issue.playerEspnId || null,issue:issue.scope === 'venue' ? 'Provider venue names differ' : 'Verified providers disagree',status:issue.resolution === 'unavailable' ? 'disputed' : 'naming-variant',fromIntegrityCatalog:true};
  }
  const playerMatches = (issue,player,id) => !!(issue.playerGsisId && String(issue.playerGsisId) === String(id || player?.id) || issue.playerEspnId && String(issue.playerEspnId) === String(player?.espnId || player?.espn_id));
  function annotate(target,issue) {
    if (!target.sourceIntegrityIssues) target.sourceIntegrityIssues = [];
    target.sourceIntegrityIssues.push(issue);
  }

  async function apply(kind,raw,bytes,options = {}) {
    const key = dependency[kind];
    if (!key || !raw || !bytes) throw new Error('Source integrity input is invalid');
    if (options.signal?.aborted) throw new DOMException('Source verification aborted','AbortError');
    const [index,rawHash] = await abortable(Promise.all([catalog(),sha(bytes)]),options.signal);
    if (index.integrityCatalog.dependencies[key] !== rawHash) throw new Error('Data and disagreement catalog versions do not match; an unverified mixed snapshot was rejected');
    let decoded = JSON.parse(new TextDecoder().decode(bytes));
    if (JSON.stringify(decoded) !== JSON.stringify(raw)) throw new Error('Decoded data does not match the verified source bytes');
    decoded = null;
    const data = effectiveStructure(raw,kind,index.knownDisagreements);
    const records = subjects(data,kind), relevant = [];
    for (const original of index.knownDisagreements) {
      const issue = normalized(original), matchingGames = records.games.filter(game => gameId(game) === issue.gameId), matchingRows = records.rows.filter(item => gameId(item.row) === issue.gameId);
      let applies = matchingGames.length > 0;
      if (issue.scope === 'player') {
        applies = false;
        for (const item of matchingRows.filter(item => item.abbr === issue.team && playerMatches(issue,item.player,item.playerId))) {
          applies = true; if (own(item.row.stats,issue.field)) item.row.stats[issue.field] = null;
          if (issue.field === 'targets') {
            if (own(item.row.advanced,'targetShare')) item.row.advanced.targetShare = null;
            if (own(item.row.stats,'targetShare')) item.row.stats.targetShare = null;
            // PBP team targets, red-zone counts and snaps have independent
            // provenance; a disputed receiver numerator does not erase them.
          }
          annotate(item.row,issue);
        }
        if (Number(issue.season) === Number(data.season)) for (const item of records.players.filter(item => playerMatches(issue,item.player))) {
          if (own(item.player.seasonStats,issue.field)) {item.player.seasonStats[issue.field] = null;applies = true;annotate(item.player,issue);}
          if (issue.field === 'targets' && own(item.player.seasonStats,'targetShare')) item.player.seasonStats.targetShare = null;
        }
      } else if (issue.scope === 'team') {
        for (const game of matchingGames) {
          if (own(game.stats?.[issue.team],issue.field)) game.stats[issue.team][issue.field] = null;
          annotate(game,issue);
        }
      } else if (issue.scope === 'event') {
        applies = applies || matchingRows.length > 0;
        for (const game of matchingGames) {
          game[issue.field] = null;
          if (['neutral','neutralSite'].includes(issue.field)) {game.neutral = null;game.neutralSite = null;}
          annotate(game,issue);
        }
        for (const {row} of matchingRows) {
          if (issue.field === 'kickoffUtc') row.kickoffUtc = null;
          if (['neutral','neutralSite'].includes(issue.field)) {row.homeAway = 'unknown';if (own(row,'neutral'))row.neutral = null;if(own(row,'neutralSite'))row.neutralSite = null;}
          annotate(row,issue);
        }
      } else if (issue.scope === 'venue') {
        applies = applies || matchingRows.length > 0;
        for (const game of matchingGames) annotate(game,issue);
        for (const {row} of matchingRows) annotate(row,issue);
      }
      if (applies) relevant.push(issue);
    }
    data.disagreements = [...(data.disagreements || []),...relevant];
    const added = relevant.flatMap(issue => issue.sources), existing = new Set((data.sources || []).map(source => [source.id,source.url,source.retrievedAt].join('|')));
    for (const source of added) {const id = [source.id,source.url,source.retrievedAt].join('|');if(!existing.has(id)){(data.sources ||= []).push(clone(source));existing.add(id);}}
    // Index generation/check timestamps alone cannot reset reading position or
    // animation clocks. Actual applicable alternatives and source times can.
    data._sourceIntegrity = {status:'verified',kind,catalogSchemaVersion:1,rawBookSha256:rawHash,applicableDisagreements:relevant.length,appliedCatalogSha256:await sha(new TextEncoder().encode(JSON.stringify(relevant)))};
    if (options.signal?.aborted) throw new DOMException('Source verification aborted','AbortError');
    return data;
  }

  function describeIssue(issue,escape,time) {
    if (!issue.fromIntegrityCatalog) return '';
    const labels = {netPassing:'Net passing yards',totalOffense:'Total offence',targets:'Targets',kickoffUtc:'Kickoff (UTC)',neutralSite:'Neutral-site classification',neutral:'Neutral-site classification',venue:'Venue label'};
    const valueLabel = value => value === null ? 'unavailable' : ['neutral','neutralSite'].includes(issue.field) && typeof value === 'boolean' ? value ? 'Neutral' : 'Non-neutral' : value;
    const sourceLabel = (id,value) => {const source = issue.sources.find(item => item.id === id);return `<a data-si-source="${escape(id)}" ${value !== undefined ? `data-si-value="${escape(String(value))}"` : ''} data-si-retrieved="${escape(source.retrievedAt)}" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name || source.provider || id)}</a> · retrieved ${escape(time(source.retrievedAt))}`;};
    // Old source books do not order their values and source IDs consistently.
    // Attribute only explicit producer readings; never zip the two arrays.
    const alternative = issue.readings?.length ? issue.readings.map(reading => `<span data-si-reading-value="${escape(String(reading.value))}">${escape(valueLabel(reading.value))} · ${reading.sourceIds.map(id => sourceLabel(id,reading.value)).join(' / ')}</span>`).join('<br>') : `Reported alternatives: ${issue.values.map(value => escape(valueLabel(value))).join(' / ')}<br>Sources (value attribution unavailable): ${issue.sourceIds.map(id => sourceLabel(id)).join('<br>')}`;
    return `<p data-source-disagreement="${escape(issue.field)}" data-si-game="${escape(issue.gameId)}" data-si-field="${escape(issue.field)}" data-si-player="${escape(issue.playerGsisId || issue.playerEspnId || '')}"><strong>${escape(issue.playerName || issue.team || 'Event')} · ${escape(labels[issue.field] || issue.field)}</strong><br>${issue.season} Week ${issue.week} · ${escape(issue.gameId)}<br>${alternative}<br>${escape(issue.action || (issue.resolution === 'disclosed-alias' ? 'Source-reported venue naming alternatives; no invented venue identification.' : 'Disputed value and dependent statistics remain unavailable.'))}</p>`;
  }
  const sameSnapshot = (a,b) => a?._sourceIntegrity?.status === 'verified' && b?._sourceIntegrity?.status === 'verified' && a._sourceIntegrity.kind === b._sourceIntegrity.kind && a._sourceIntegrity.rawBookSha256 === b._sourceIntegrity.rawBookSha256 && a._sourceIntegrity.appliedCatalogSha256 === b._sourceIntegrity.appliedCatalogSha256;
  window.PDSourceIntegrity = {apply,sameSnapshot,describeIssue,getLastCatalog:() => lastCatalog ? clone(lastCatalog) : null};
})();
