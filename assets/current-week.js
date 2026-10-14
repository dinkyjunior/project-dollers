/* Browsing windows use schedule dates, never the snapshot's coverage week. */
(function(root) {
  'use strict';
  const zone = 'America/New_York';
  const dayNumber = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return match ? Date.UTC(+match[1], +match[2]-1, +match[3]) / 86400000 : NaN;
  };
  function localDay(now) {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    return dayNumber(`${get('year')}-${get('month')}-${get('day')}`);
  }
  function resolve(data, now = new Date(), league = root.PDTeamDetails?.getDataset?.()) {
    const games = [...(data.steelers?.schedule || []), ...Object.values(data.weeks || {}).map(week => week.fixture).filter(Boolean)];
    if (league?._sourceIntegrity?.status === 'verified' && Number(league.season) === Number(data.season)) {
      Object.values(league.teams || {}).forEach(team => (team.games || []).forEach(game => {
        if (Number(game.season) === Number(data.season) && game.seasonType === 'REG') games.push(game);
      }));
    }
    const windows = new Map();
    for (const game of games) {
      const week = Number(game.week);
      const day = dayNumber(game.gameday);
      if (!Number.isInteger(week) || !Number.isFinite(day) || !data.weeks?.[week]) continue;
      // UTC here is date arithmetic only; localDay above establishes New York's date.
      const weekday = new Date(day * 86400000).getUTCDay();
      const start = day - ((weekday + 5) % 7);
      windows.set(week, Math.min(windows.get(week) ?? Infinity, start));
    }
    // A team bye has no fixture. Fill only gaps bounded by two sourced anchors
    // that independently agree on an uninterrupted seven-day NFL week sequence.
    const anchors = [...windows].sort((a,b) => a[0]-b[0]);
    for (let index = 1; index < anchors.length; index++) {
      const [beforeWeek,beforeStart] = anchors[index-1];
      const [afterWeek,afterStart] = anchors[index];
      if (afterStart - beforeStart !== (afterWeek-beforeWeek)*7) continue;
      for (let week = beforeWeek+1; week < afterWeek; week++) {
        if (data.weeks?.[week]) windows.set(week,beforeStart+(week-beforeWeek)*7);
      }
    }
    const today = localDay(now);
    const ordered = [...windows].sort((a,b) => a[1]-b[1]);
    const active = ordered.find(([,start]) => today >= start && today < start + 7);
    if (active) return String(active[0]);
    // Outside sourced windows, retain the nearest sourced season boundary.
    const past = ordered.filter(([,start]) => start <= today);
    return String((past.length ? past[past.length-1] : ordered[0])?.[0] ?? data.currentWeek);
  }
  const api = {resolve,localDay};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDCurrentWeek = api;
})(typeof window === 'object' ? window : globalThis);
