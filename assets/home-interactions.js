/* Local Home interactions. League availability remains explicit; no fake
   destinations or old concept screens are introduced. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const status = home.querySelector('.home-availability');
  let statusTimeout;
  for (const card of home.querySelectorAll('.sport-card')) {
    let frame;
    const reset = () => {
      cancelAnimationFrame(frame);
      for (const key of ['--tile-x', '--tile-y', '--tile-tilt-x', '--tile-tilt-y']) card.style.removeProperty(key);
    };
    card.addEventListener('pointermove', event => {
      if (reduced.matches || !finePointer.matches || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = card.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
        card.style.setProperty('--tile-x', `${x * 100}%`);
        card.style.setProperty('--tile-y', `${y * 100}%`);
        card.style.setProperty('--tile-tilt-x', `${(0.5 - y) * 3}deg`);
        card.style.setProperty('--tile-tilt-y', `${(x - 0.5) * 3}deg`);
      });
    });
    card.addEventListener('pointerleave', reset);
    card.addEventListener('blur', reset);
    card.addEventListener('click', () => {
      const sport = card.dataset.sportComingsoon;
      if (!sport) return;
      clearTimeout(statusTimeout);
      status.textContent = `${sport} research is coming soon. Explore NFL research now.`;
      status.classList.add('is-visible');
      card.classList.add('is-tapped');
      setTimeout(() => card.classList.remove('is-tapped'), 220);
      statusTimeout = setTimeout(() => status.classList.remove('is-visible'), 4200);
    });
    reduced.addEventListener('change', reset);
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') status.classList.remove('is-visible');
  });
})();
