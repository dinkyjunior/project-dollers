/* Editorial Home controls use the existing research routes and source-selected
   fixture. Unavailable sports stay on Home and never open a substitute screen. */
(() => {
  'use strict';
  const home = document.querySelector('.editorial-home[data-page="home"]');
  if (!home) return;

  const menuToggle = home.querySelector('[data-home-menu-toggle]');
  const menu = home.querySelector('[data-home-menu]');
  const status = home.querySelector('[data-home-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sports = {nba:'NBA',nrl:'NRL',ufc:'UFC'};
  let menuOpen = false;
  let announcementFrame = null;
  let pageVisible = true;

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
    if (!control || !home.contains(control)) return;
    if (control.hasAttribute('data-home-menu-toggle')) {
      setMenu(!menuOpen, menuOpen);
      return;
    }
    const sport = control.dataset.homeSport;
    if (Object.hasOwn(sports, sport)) {
      const fromMenu = !!control.closest('[data-home-menu]');
      setMenu(false, fromMenu);
      announce(`${sports[sport]} research is coming soon. NFL research is available now.`);
      return;
    }
    if (control.dataset.homeShortcut) {
      openShortcut(control.dataset.homeShortcut);
      return;
    }
    if (control.dataset.open) setMenu(false);
  });

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
  updateMotionState();
})();
