/* Add decorative diamonds without replacing the approved Home button,
   its label, navigation attributes or existing illumination lifecycle. */
(() => {
  'use strict';
  const button = document.querySelector('.page[data-page="home"] .home-entry[data-home-entry]');
  if (!button || button.querySelector('.home-entry-diamond')) return;
  for (const side of ['left', 'right']) {
    const gem = document.createElement('span');
    gem.className = 'home-entry-diamond is-' + side;
    gem.setAttribute('aria-hidden', 'true');
    button.append(gem);
  }
})();
