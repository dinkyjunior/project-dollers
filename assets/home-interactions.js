/* The Aperture Home is a real, accessible sport selector. Only NFL currently
   has a research destination; selecting another league never changes routes. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home) return;
  const selectors = [...home.querySelectorAll('[data-home-select]')];
  const entry = home.querySelector('[data-home-entry]');
  if (!selectors.length || !entry) return;

  const sports = {
    nfl: { title: 'NFL', logo: 'assets/home/nfl.svg', alt: 'NFL shield' },
    nba: { title: 'NBA', logo: 'assets/home/nba.svg', alt: 'NBA logo' },
    nrl: { title: 'NRL', logo: 'assets/logos/nrl.webp', alt: 'NRL shield' },
    ufc: { title: 'UFC', logo: 'assets/logos/ufc.svg', alt: 'UFC wordmark' }
  };
  const storageKey = 'pd:home-sport:v1';
  const status = home.querySelector('.home-availability');
  const label = entry.querySelector('[data-home-entry-label]');
  const arrow = entry.querySelector('[data-home-entry-arrow]');
  const leagueLogo = home.querySelector('[data-home-league-logo]');
  const scenes = [...home.querySelectorAll('[data-home-scene]')];
  const teamsLabel = home.querySelector('[data-home-teams-label]') ||
    home.querySelector('.bottom-nav [data-nav="nfl"] span');
  let selected = 'nfl';
  let statusTimeout;

  function dismissStatus() {
    clearTimeout(statusTimeout);
    status?.classList.remove('is-visible');
  }
  function announce(message, visible = false) {
    if (!status) return;
    clearTimeout(statusTimeout);
    // Clearing first permits the same availability message to be announced on
    // subsequent activations without constructing extra live-region nodes.
    status.textContent = '';
    status.textContent = message;
    status.classList.toggle('is-visible', visible);
    if (visible) statusTimeout = setTimeout(dismissStatus, 4200);
  }
  function selectSport(sport, announceChange = false) {
    if (!Object.hasOwn(sports, sport)) return;
    const previous = selected;
    const details = sports[sport];
    selected = sport;
    home.dataset.homeSport = sport;
    home.querySelector('.home-frame')?.setAttribute('data-home-sport', sport);
    selectors.forEach(button => {
      const active = button.dataset.homeSelect === sport;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    if (leagueLogo) {
      // The official marks are local assets. Background artwork never supplies
      // labels or logos, so they remain sharp and semantic in all four states.
      leagueLogo.setAttribute('src', details.logo);
      leagueLogo.setAttribute('alt', details.alt);
      leagueLogo.dataset.sport = sport;
    }
    scenes.forEach(scene => { scene.hidden = scene.dataset.homeScene !== sport; });
    const ready = sport === 'nfl';
    const entryText = ready ? 'Enter' : `${details.title} · Coming soon`;
    if (label) label.textContent = entryText;
    else entry.textContent = entryText;
    entry.disabled = !ready;
    entry.setAttribute('aria-label', ready ? 'Enter NFL research' : `${details.title} research is coming soon`);
    if (ready) entry.dataset.open = 'nfl';
    else entry.removeAttribute('data-open');
    if (arrow) arrow.toggleAttribute('hidden', !ready);
    if (teamsLabel) teamsLabel.textContent = sport === 'ufc' ? 'Fighters' : 'Teams';
    try { sessionStorage.setItem(storageKey, sport); } catch { /* Storage is optional. */ }
    if (announceChange) announce(ready
      ? 'NFL research is ready. Enter NFL to explore teams, statistics and matchups.'
      : `${details.title} research is coming soon.`);
    // Motion remains independent of routing and sports-data rendering.
    home.dispatchEvent(new CustomEvent('pd:home-sport', { bubbles: true, detail: { sport, previous } }));
  }

  // Capture only Home's unavailable destinations. Existing NFL navigation,
  // More, browser-history and Pages 2–3 controls retain their established paths.
  home.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !home.contains(button)) return;
    if (button.hasAttribute('data-home-select')) {
      selectSport(button.dataset.homeSelect, true);
      return;
    }
    if (selected === 'nfl') return;
    const navDestination = button.closest('.bottom-nav') &&
      (button.dataset.open === 'nfl' || button.hasAttribute('data-shortcut'));
    if (button.hasAttribute('data-home-entry') || navDestination) {
      event.preventDefault();
      event.stopPropagation();
      announce(`${sports[selected].title} research is coming soon.`, true);
    }
  }, true);
  home.addEventListener('keydown', event => {
    if (event.key === 'Escape') { dismissStatus(); return; }
    const index = selectors.indexOf(event.target.closest('[data-home-select]'));
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? selectors.length - 1 :
      (index + (event.key === 'ArrowRight' ? 1 : -1) + selectors.length) % selectors.length;
    selectors[next].focus();
    selectSport(selectors[next].dataset.homeSelect, true);
  });
  let initial = 'nfl';
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (Object.hasOwn(sports, stored)) initial = stored;
  } catch { /* Private or embedded browsing can block session storage. */ }
  selectSport(initial);
})();
