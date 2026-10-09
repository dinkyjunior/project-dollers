/* Home's existing event-driven visibility controller owns playback. This file
   installs lightweight, pointer-free decorations once; it has no frame loop,
   interval, route observer, data listener or animation restart on refresh. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home || home.dataset.homeGemMotionInstalled === 'true') return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const selectorHues = {
    nfl: ['#00baff', '#00baff'],
    nba: ['#00baff', '#ff2548'],
    nrl: ['#00ff7f', '#00ff7f'],
    ufc: ['#ff153e', '#ff153e']
  };
  const track = 'M16 4H84Q96 4 96 16V84Q96 96 84 96H16Q4 96 4 84V16Q4 4 16 4Z';

  function svgElement(name, attributes) {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function addSelectorCircuit(button, sport, index) {
    if (button.querySelector('.home-gem-selector-circuit')) return;
    const hues = selectorHues[sport];
    if (!hues) return;
    const id = 'home-gem-circuit-' + sport;
    const circuit = svgElement('svg', {
      class: 'home-gem-selector-circuit', viewBox: '0 0 100 100',
      preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
    });
    circuit.style.setProperty('--home-gem-circuit-duration', (6.7 + index * .73) + 's');
    circuit.style.setProperty('--home-gem-circuit-delay', (-index * 1.61 - .42) + 's');
    const defs = svgElement('defs', {});
    const gradient = svgElement('linearGradient', {
      id, x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    for (const [offset, hue] of [['0%', hues[0]], ['49.9%', hues[0]], ['50%', hues[1]], ['100%', hues[1]]]) {
      gradient.append(svgElement('stop', { offset, 'stop-color': hue }));
    }
    defs.append(gradient);
    circuit.append(defs);
    for (const part of ['tail', 'hot', 'pin']) {
      const path = svgElement('path', {
        class: 'home-gem-selector-' + part, d: track, pathLength: '1000',
        fill: 'none', stroke: part === 'pin' ? '#f4ffff' : 'url(#' + id + ')',
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      circuit.append(path);
    }
    button.append(circuit);
  }

  function addGlint(parent, x, y, kind, ordinal) {
    const glint = document.createElement('span');
    glint.className = 'home-gem-glint home-gem-glint-' + kind;
    glint.setAttribute('aria-hidden', 'true');
    glint.style.left = x + '%';
    glint.style.top = y + '%';
    // Randomised once per page load, so glints remain asynchronous without
    // animation frames, repeated layout writes or unpredictable route timers.
    const duration = (kind === 'ring' ? 9 : 5.8) + Math.random() * 4.8;
    glint.style.setProperty('--home-gem-glint-duration', duration.toFixed(3) + 's');
    glint.style.setProperty('--home-gem-glint-delay', (-Math.random() * duration - ordinal * .17).toFixed(3) + 's');
    glint.style.setProperty('--home-gem-glint-angle', (ordinal % 2 ? 18 : -12) + 'deg');
    parent.append(glint);
  }

  [...home.querySelectorAll('[data-home-select]')].forEach((button, index) => {
    addSelectorCircuit(button, button.dataset.homeSelect, index);
  });

  const entry = home.querySelector('[data-home-entry]');
  if (entry) {
    // The original native CTA and its accessible label/navigation are intact.
    // The gemstone stylesheet turns these existing wrappers into clear caps.
    for (const [index, side] of ['left', 'right'].entries()) {
      let cap = entry.querySelector('.home-entry-diamond.is-' + side);
      if (!cap) {
        cap = document.createElement('span');
        cap.className = 'home-entry-diamond is-' + side;
        cap.setAttribute('aria-hidden', 'true');
        entry.append(cap);
      }
      if (!cap.querySelector('.home-gem-glint')) {
        [[28, 28], [76, 52], [38, 79]].forEach(([x, y], ordinal) => {
          addGlint(cap, x, y, 'cap', index * 3 + ordinal);
        });
      }
    }
    if (!entry.querySelector('.home-gem-glint-edge')) {
      addGlint(entry, 24, 4, 'edge', 7);
      addGlint(entry, 78, 94, 'edge', 8);
    }
  }

  const gate = home.querySelector('.aperture-gate');
  if (gate && !gate.querySelector('.home-gem-glint-ring')) {
    // Points sit on metal seams outside the emblem/venue; no highlight is
    // painted over a league logo or control label.
    [[20, 18], [86, 21], [20, 83], [80, 85]].forEach(([x, y], index) => {
      addGlint(gate, x, y, 'ring', 10 + index);
    });
  }

  home.dataset.homeGemMotionInstalled = 'true';
})();
