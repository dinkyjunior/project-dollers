/* Four editorial sport previews share one Home. Only NFL has research routes;
   unavailable sports never open a substitute screen or sample data. */
(() => {
  'use strict';
  const home = document.querySelector('.editorial-home[data-page="home"]');
  if (!home) return;

  const menuToggle = home.querySelector('[data-home-menu-toggle]');
  const menu = home.querySelector('[data-home-menu]');
  const status = home.querySelector('[data-home-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const selectors = [...home.querySelectorAll('[data-home-sport]')];
  const art = home.querySelector('[data-home-art]') || home.querySelector('.editorial-art');
  const artSource = art?.querySelector('source');
  const artImage = art?.querySelector('img');
  const leagueLogo = home.querySelector('[data-home-league-logo]');
  const entry = home.querySelector('[data-home-entry]');
  const entryLabel = entry?.querySelector('[data-home-entry-label]');
  const availability = home.querySelector('[data-home-availability]');
  const topics = home.querySelector('[data-home-topics]');
  const topicButtons = [...(topics?.querySelectorAll('button') || [])];
  const sports = {
    nfl: {name:'NFL',logo:'assets/home/nfl.svg',art:'assets/home/editorial-stadium.webp',mobile:'assets/home/editorial-stadium-mobile.webp',topics:['Standings','Players','Matchups']},
    nba: {name:'NBA',logo:'assets/home/nba.svg',art:'assets/home/editorial-immersive-nba.webp',mobile:'assets/home/editorial-immersive-nba-mobile.webp',topics:['Standings','Players','Matchups']},
    nrl: {name:'NRL',logo:'assets/logos/nrl.webp',art:'assets/home/editorial-immersive-nrl.webp',mobile:'assets/home/editorial-immersive-nrl-mobile.webp',topics:['Ladder','Players','Matchups']},
    ufc: {name:'UFC',logo:'assets/logos/ufc.svg',art:'assets/home/editorial-immersive-ufc.webp',mobile:'assets/home/editorial-immersive-ufc-mobile.webp',topics:['Rankings','Fighters','Matchups']}
  };
  const storageKey = 'pd-home-sport';
  let menuOpen = false;
  let announcementFrame = null;
  let pageVisible = true;
  let selected = 'nfl';
  let artSequence = 0;
  let artListeners = null;

  function announce(message) {
    if (!status) return;
    if (announcementFrame !== null) cancelAnimationFrame(announcementFrame);
    status.textContent = '';
    status.classList.add('is-visible');
    // A fresh accessibility-tree update also announces repeated activations.
    announcementFrame = requestAnimationFrame(() => {
      announcementFrame = null;
      if (!home.hidden && home.classList.contains('active')) status.textContent = message;
    });
  }

  function dismissStatus() {
    if (announcementFrame !== null) cancelAnimationFrame(announcementFrame);
    announcementFrame = null;
    if (status) {
      status.textContent = '';
      status.classList.remove('is-visible');
    }
  }

  function setMenu(open, returnFocus = false) {
    if (!menu || !menuToggle) return;
    menuOpen = open;
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    home.classList.toggle('is-menu-open', open);
    if (open) {
      menu.querySelector('button:not([disabled]), a[href]')?.focus({preventScroll:true});
    } else if (returnFocus && !home.hidden) {
      menuToggle.focus({preventScroll:true});
    }
  }

  function updateArtwork(sport, afterReady) {
    if (!artImage) return;
    const sequence = ++artSequence;
    artListeners?.abort();
    const listeners = new AbortController();
    artListeners = listeners;
    const details = sports[sport];
    let loaded = false;
    const current = () => sequence === artSequence && selected === sport;
    const ready = () => {
      if (!current() || loaded) return;
      loaded = true;
      listeners.abort();
      art.hidden = false;
      home.dataset.homeArtState = 'ready';
      afterReady?.();
    };
    const fail = () => {
      if (!current() || loaded) return;
      // A failed preview must not display another sport's venue as its own.
      art.hidden = true;
      home.dataset.homeArtState = 'unavailable';
      announce(`${details.name} selected. The venue image could not load. Research availability is unchanged.`);
    };
    const decodeDisplayedImage = () => {
      // A responsive picture can replace its source during orientation change.
      // Its later load recovers a decode cancelled by that source replacement.
      artImage.addEventListener('load', ready, {once:true,signal:listeners.signal});
      artImage.addEventListener('error', fail, {once:true,signal:listeners.signal});
      if (typeof artImage.decode === 'function') artImage.decode().then(ready, fail);
      else if (artImage.complete) { if (artImage.naturalWidth) ready(); else fail(); }
    };
    home.dataset.homeArtState = 'loading';
    if (artImage.getAttribute('src') === details.art &&
        (!artSource || artSource.getAttribute('srcset') === details.mobile)) {
      decodeDisplayedImage();
      return;
    }
    const preload = new Image();
    const mobile = artSource && window.matchMedia(artSource.media || '(max-width: 430px)').matches;
    const apply = () => {
      if (!current()) return;
      if (artSource) artSource.srcset = details.mobile;
      artImage.src = details.art;
      decodeDisplayedImage();
    };
    preload.src = mobile ? details.mobile : details.art;
    if (typeof preload.decode === 'function') preload.decode().then(apply, fail);
    else if (preload.complete) { if (preload.naturalWidth) apply(); else fail(); }
    else { preload.onload = apply; preload.onerror = fail; }
  }

  function selectSport(sport, announceSelection = false) {
    if (!Object.hasOwn(sports, sport)) return;
    const details = sports[sport];
    const ready = sport === 'nfl';
    const changed = selected !== sport;
    selected = sport;
    // Entry and topic availability change before artwork starts decoding.
    // A fast selection can never carry an NFL route into another sport.
    if (entry) {
      entry.disabled = !ready;
      if (ready) entry.dataset.open = 'nfl';
      else entry.removeAttribute('data-open');
      entry.setAttribute('aria-label', ready ? 'Explore NFL research' : `${details.name} research is coming soon`);
      if (entryLabel) entryLabel.textContent = ready ? 'Explore NFL' : `${details.name} · Coming soon`;
      entry.querySelector('svg')?.toggleAttribute('hidden', !ready);
    }
    topicButtons.forEach((button, index) => {
      const label = details.topics[index] || '';
      button.disabled = !ready;
      button.textContent = label;
      button.setAttribute('aria-label', ready ? `Explore NFL ${label.toLowerCase()}` : `${details.name} ${label.toLowerCase()} — coming soon`);
    });
    topics?.setAttribute('aria-label', `${details.name} research${ready ? '' : ' — coming soon'}`);
    home.dataset.homeSport = sport;
    selectors.forEach(button => {
      const active = button.dataset.homeSport === sport;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    if (leagueLogo) {
      leagueLogo.src = details.logo;
      leagueLogo.alt = details.name;
    }
    if (availability) availability.textContent = ready ? 'Available now' : 'Coming soon';
    try { sessionStorage.setItem(storageKey, sport); } catch { /* Storage is optional. */ }
    updateArtwork(sport, () => {
      if (!announceSelection || !changed || home.hidden || !home.classList.contains('active')) return;
      home.querySelector('.page-scroll')?.scrollTo({top:0,behavior:reducedMotion.matches ? 'auto' : 'smooth'});
    });
    if (announceSelection) announce(ready
      ? 'NFL selected. Research is available now.'
      : `${details.name} selected. Research is coming soon.`);
  }

  function openShortcut(destination) {
    const app = window.PDApp;
    if (!app?.openPage || !app?.openLadder) {
      announce('NFL research is loading. Please try again in a moment.');
      return;
    }
    if (destination === 'matchups' && !app.getContext?.().data) {
      announce('Matchup research is loading. Please try again in a moment.');
      return;
    }
    if (destination === 'standings' || destination === 'nfl') {
      app.openLadder('PIT');
      document.getElementById('tab-ladder')?.focus({preventScroll:true});
    } else if (destination === 'players') {
      app.openPage('nfl');
      const tab = document.getElementById('tab-players');
      tab?.click();
      tab?.focus({preventScroll:true});
    } else if (destination === 'matchups') {
      // The NFL controller resolves the selected week's verified fixture and
      // chooses the existing matchup or completed-game report destination.
      app.openLadder('PIT');
      document.querySelector('[data-page="nfl"] [data-nfl-action="matchups"]')?.click();
    }
  }

  home.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control || !home.contains(control) || control.disabled) return;
    if (control.hasAttribute('data-home-menu-toggle')) {
      setMenu(!menuOpen, menuOpen);
      return;
    }
    const sport = control.dataset.homeSport;
    if (Object.hasOwn(sports, sport)) {
      event.preventDefault();
      event.stopPropagation();
      const fromMenu = !!control.closest('[data-home-menu]');
      setMenu(false, fromMenu);
      selectSport(sport, true);
      return;
    }
    if (control.dataset.homeShortcut) {
      openShortcut(control.dataset.homeShortcut);
      return;
    }
    if (control.dataset.open) setMenu(false);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || home.hidden || !home.classList.contains('active')) return;
    if (menuOpen) {
      event.preventDefault();
      setMenu(false, true);
    } else {
      dismissStatus();
    }
  });
  document.addEventListener('click', event => {
    if (!menuOpen || menu?.contains(event.target) || menuToggle?.contains(event.target)) return;
    setMenu(false);
  });
  menu?.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (menuOpen && !menu.contains(document.activeElement) && document.activeElement !== menuToggle) setMenu(false);
    });
  });

  function updateMotionState() {
    const running = pageVisible && !document.hidden && !home.hidden &&
      home.classList.contains('active') && !reducedMotion.matches;
    home.dataset.homeMotionState = running ? 'running' : 'paused';
  }
  document.addEventListener('pd:route-change', event => {
    if (event.detail?.page !== 'home') {
      setMenu(false);
      dismissStatus();
    }
    updateMotionState();
  });
  document.addEventListener('visibilitychange', updateMotionState);
  window.addEventListener('pagehide', () => {pageVisible = false; updateMotionState();});
  window.addEventListener('pageshow', () => {pageVisible = true; updateMotionState();});
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', updateMotionState);
  else reducedMotion.addListener(updateMotionState);

  setMenu(false);
  let initialSport = 'nfl';
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (Object.hasOwn(sports, stored)) initialSport = stored;
  } catch { /* Private or embedded browsing can block optional storage. */ }
  selectSport(initialSport);
  updateMotionState();
})();
