/* Sourced geographical illustration. This does not describe a team's journey. */
(() => {
  'use strict';
  let geography = null, loading = null, failure = false, retryTimer = null, attempts = 0, lastAttempt = 0;
  const active = () => document.querySelector('.page.matchup-editorial-page.active');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
  const coordinate = venue => venue?.status === 'sourced' && Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude) && Math.abs(venue.latitude) <= 90 && Math.abs(venue.longitude) <= 180;
  async function load() {
    if (geography || loading || Date.now() - lastAttempt < 4000) return loading;
    lastAttempt = Date.now();
    loading = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),12000);
      try {
        const response = await fetch('assets/matchup-editorial/travel-geography.json?v=20261015-v1',{cache:'force-cache',signal:controller.signal});
        if (!response.ok) throw new Error('Geography unavailable');
        const value = await response.json();
        if (value.schemaVersion !== 1 || !value.teams || !value.venues || !Array.isArray(value.usStates?.features)) throw new Error('Geography invalid');
        geography = value; failure = false; attempts = 0; clearTimeout(retryTimer);
        document.dispatchEvent(new CustomEvent('pd:matchup-travel-ready'));
      } catch (_) {
        failure = true;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (active() && !document.hidden) load(); },Math.min(120000,5000 * 3 ** Math.min(attempts++,3)));
        document.dispatchEvent(new CustomEvent('pd:matchup-travel-ready'));
      } finally { clearTimeout(timeout); loading = null; }
    })();
    return loading;
  }
  function endpoints(game) {
    if (!geography || !game || Number(game.season) !== Number(geography.season)) return null;
    const origin = geography.venues[geography.teams[game.away_team]?.homeVenueKey];
    const venueName = normalized(game.venue);
    // The selected fixture's actual venue must match. Home designation alone
    // cannot establish a destination, particularly for international games.
    const destination = venueName ? Object.values(geography.venues).find(v => [v.name,...(v.aliases || [])].some(name => normalized(name) === venueName)) : null;
    return coordinate(origin) && coordinate(destination) ? {origin,destination} : null;
  }
  const mercator = latitude => Math.log(Math.tan(Math.PI / 4 + Math.max(-85,Math.min(85,latitude)) * Math.PI / 360));
  function projection(origin,destination) {
    const domestic = [origin,destination].every(v => v.longitude >= -125 && v.longitude <= -66 && v.latitude >= 24 && v.latitude <= 50);
    const longitudeSpan = Math.max(22,Math.abs(origin.longitude - destination.longitude));
    const latitudeSpan = Math.max(14,Math.abs(origin.latitude - destination.latitude));
    const centerLon = (origin.longitude + destination.longitude) / 2, centerLat = (origin.latitude + destination.latitude) / 2;
    const bounds = domestic ? [-125,24,-66,50] : [Math.max(-180,centerLon-longitudeSpan*.7),Math.max(-80,centerLat-latitudeSpan*.75),Math.min(180,centerLon+longitudeSpan*.7),Math.min(80,centerLat+latitudeSpan*.75)];
    const left = bounds[0] * Math.PI / 180, right = bounds[2] * Math.PI / 180, bottom = mercator(bounds[1]), top = mercator(bounds[3]);
    const scale = Math.min(640 / (right-left),198 / (top-bottom));
    const xOffset = (700 - (right-left)*scale)/2, yOffset = (236 - (top-bottom)*scale)/2;
    return {domestic,point:([lon,lat]) => [xOffset+(lon*Math.PI/180-left)*scale,yOffset+(top-mercator(lat))*scale]};
  }
  function mapPath(feature,project) {
    const geometry = feature.geometry;
    const polygons = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
    return polygons.flatMap(polygon => polygon.map(ring => ring.map((p,i) => `${i ? 'L' : 'M'}${project(p).map(n => n.toFixed(1)).join(',')}`).join('')+'Z')).join('');
  }
  function curve(start,end) {
    const dx = end[0]-start[0], dy = end[1]-start[1], lift = Math.min(65,Math.max(27,Math.hypot(dx,dy)*.24));
    const control = [(start[0]+end[0])/2,Math.max(18,(start[1]+end[1])/2-lift)];
    const middle = [(start[0]+2*control[0]+end[0])/4,(start[1]+2*control[1]+end[1])/4];
    const angle = Math.atan2(dy,dx)*180/Math.PI;
    return {path:`M${start.join(',')} Q${control.join(',')} ${end.join(',')}`,middle,angle};
  }
  const venueLabel = venue => venue.city || venue.name;
  const wiki = venue => `https://en.wikipedia.org/wiki/${encodeURIComponent(venue.sourceTitle || venue.name).replace(/%20/g,'_')}`;
  function sources(origin,destination,domestic) {
    return `<details class="mtr-sources"><summary>Map sources</summary><p>Venue coordinates: <a href="${escape(wiki(origin))}" target="_blank" rel="noopener noreferrer">${escape(origin.name)}</a> and <a href="${escape(wiki(destination))}" target="_blank" rel="noopener noreferrer">${escape(destination.name)}</a>. Boundaries: <a href="${domestic ? 'https://github.com/topojson/us-atlas' : 'https://www.naturalearthdata.com/about/terms-of-use/'}" target="_blank" rel="noopener noreferrer">${domestic ? 'U.S. Census via US Atlas' : 'Natural Earth'}</a>. These locations do not establish departure time, transport, a team itinerary or live position.</p></details>`;
  }
  function render(game) {
    if (!geography) {
      load();
      return `<header class="mtr-heading"><h2>Team travel</h2><button data-mb-action="replay-route" disabled>Replay route ↻</button></header><div class="mtr-empty"><p>${failure ? 'Sourced map coordinates could not be loaded. Retrying automatically.' : 'Loading sourced map coordinates…'}</p><small>Travel itinerary and live tracking unavailable.</small></div>`;
    }
    const pair = endpoints(game);
    if (!pair) return '<header class="mtr-heading"><h2>Team travel</h2><button data-mb-action="replay-route" disabled>Replay route ↻</button></header><div class="mtr-empty"><p>Verified route coordinates are unavailable for this fixture.</p><small>Travel itinerary and live tracking unavailable.</small></div>';
    const {origin,destination} = pair, project = projection(origin,destination), start = project.point([origin.longitude,origin.latitude]), end = project.point([destination.longitude,destination.latitude]);
    const sameArea = Math.abs(origin.latitude-destination.latitude)<.05 && Math.abs(origin.longitude-destination.longitude)<.05;
    const route = curve(start,end), id = 'mtr-'+String(game.id || 'fixture').replace(/[^a-zA-Z0-9_-]/g,'');
    const features = project.domestic ? geography.usStates.features : geography.worldCountries?.features || [];
    const label = (venue,point,index) => {
      const rightSide = point[0] > 550, anchor = rightSide ? 'end' : 'start', x = Math.max(30,Math.min(670,point[0]+(rightSide ? -11 : 11)));
      const y = Math.max(28,Math.min(218,point[1]+(index ? 23 : -15)));
      return `<text class="mtr-place" x="${x}" y="${y}" text-anchor="${anchor}">${escape(venueLabel(venue))}${venue.state ? `<tspan x="${x}" dy="15">${escape(venue.state)}</tspan>` : ''}</text>`;
    };
    return `<header class="mtr-heading"><div><h2>Team travel</h2><p>${escape(venueLabel(origin))} <span aria-hidden="true">→</span> ${escape(venueLabel(destination))}</p></div><button data-mb-action="replay-route" aria-label="Replay the illustrative route from ${escape(venueLabel(origin))} to ${escape(venueLabel(destination))}" aria-controls="${id}" ${sameArea ? 'disabled' : ''}>Replay route <span aria-hidden="true">↻</span></button></header><p class="mtr-disclosure">${sameArea ? 'Same sourced venue area' : 'Illustrative route'} · Not live tracking</p><svg class="mtr-map" id="${id}" viewBox="0 0 700 236" role="img" aria-labelledby="${id}-title ${id}-description" data-mtr-origin="${escape(game.away_team)}" data-mtr-destination="${escape(game.venue)}"><title id="${id}-title">${escape(venueLabel(origin))} to ${escape(venueLabel(destination))}</title><desc id="${id}-description">Geographical illustration using sourced venue coordinates. A drawn line is not an actual team journey, flight path or live location.</desc><defs><clipPath id="${id}-clip"><rect width="700" height="236"/></clipPath></defs><g class="mtr-geography" clip-path="url(#${id}-clip)">${features.map(f => `<path d="${mapPath(f,project.point)}"/>`).join('')}</g>${sameArea ? '' : `<path class="mtr-route" d="${route.path}"/><g class="mtr-plane" transform="translate(${route.middle.join(' ')}) rotate(${route.angle})" data-mtr-end="${end.join(' ')}" data-mtr-angle="${route.angle}"><path d="M16 0L-10-3-15-11-19-11-15-2-23-1-26-5-29-5-27 0-29 5-26 5-23 1-15 2-19 11-15 11-10 3Z"/><animateMotion class="mtr-flight" begin="indefinite" dur="3.2s" repeatCount="1" rotate="auto" path="${route.path}" fill="freeze"/></g>`}<circle class="mtr-pin" cx="${start[0]}" cy="${start[1]}" r="4.5"/>${sameArea ? '' : `<circle class="mtr-pin" cx="${end[0]}" cy="${end[1]}" r="4.5"/>`}${label(origin,start,0)}${sameArea ? '' : label(destination,end,1)}</svg><p class="mtr-itinerary">Actual travel itinerary unavailable.</p>${sources(origin,destination,project.domestic)}<span class="mtr-replay-status" role="status" aria-live="polite"></span>`;
  }
  function replay(card) {
    const plane = card?.querySelector('.mtr-plane'), animation = plane?.querySelector('.mtr-flight'), status = card?.querySelector('.mtr-replay-status');
    if (!plane || !animation) return;
    plane.removeAttribute('transform');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation.setAttribute('fill','remove'); animation.endElement?.();
      plane.setAttribute('transform',`translate(${plane.dataset.mtrEnd}) rotate(${plane.dataset.mtrAngle})`);
      if (status) status.textContent = 'Illustrative destination highlighted. Reduced motion is enabled.';
    } else {
      animation.setAttribute('fill','freeze');
      animation.beginElement?.();
      if (status) status.textContent = 'Replaying the geographical illustration. This is not live tracking.';
    }
  }
  document.addEventListener('visibilitychange',() => { if (!document.hidden && active() && !geography) load(); });
  window.addEventListener('online',() => { if (active() && !geography) load(); });
  window.PDMatchupTravel = {render,replay,getGeography:() => geography};
})();
