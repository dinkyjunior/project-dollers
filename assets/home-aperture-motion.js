/* Home's existing event-driven visibility controller owns playback. This file
   installs lightweight, pointer-free decorations once; it has no frame loop,
   interval, route observer, data listener or animation restart on refresh. */
(() => {
  'use strict';
  const home = document.querySelector('.page[data-page="home"]');
  if (!home || home.dataset.homeGemMotionInstalled === 'true') return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const selectorSports = new Set(['nfl', 'nba', 'nrl', 'ufc']);
  const lightCircuits = new Map();
  // Measured solid optical rims in the polished atlas's shared 1488 × 224
  // presentation frame. The circuit follows gemstone material, not its larger
  // native hit target. Every outline starts at top centre and runs clockwise.
  const entryOpticalRims = {
    nfl: [[744, 5], [1412, 5], [1481, 64], [1481, 171], [1412, 220], [76, 220], [6, 171], [6, 64], [76, 5]],
    nba: [[744, 5], [1412, 5], [1481, 65], [1481, 169], [1412, 217], [76, 217], [6, 169], [6, 65], [76, 5]],
    nrl: [[744, 5], [1412, 5], [1481, 64], [1481, 168], [1412, 215], [76, 215], [6, 168], [6, 64], [76, 5]],
    ufc: [[744, 6], [1412, 6], [1481, 64], [1481, 166], [1412, 214], [76, 214], [6, 166], [6, 64], [76, 6]]
  };

  function svgElement(name, attributes) {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function addRingSpecularGradient() {
    const channel = home.querySelector('.aperture-channel-art');
    if (!channel || channel.querySelector('#home-aperture-moving-specular')) return;
    let defs = channel.querySelector('defs');
    if (!defs) {
      defs = svgElement('defs', {});
      channel.prepend(defs);
    }
    const gradient = svgElement('linearGradient', {
      id: 'home-aperture-moving-specular', x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    for (const [offset, side] of [['0%', 'left'], ['49.9%', 'left'], ['50%', 'right'], ['100%', 'right']]) {
      gradient.append(svgElement('stop', {
        offset, 'stop-color': 'var(--home-motion-highlight-' + side + ')'
      }));
    }
    defs.append(gradient);
  }

  function addSelectorCircuit(button, sport) {
    if (button.querySelector('.home-gem-selector-circuit')) return;
    if (!selectorSports.has(sport)) return;
    const id = 'home-gem-circuit-' + sport;
    const circuit = svgElement('svg', {
      class: 'home-gem-selector-circuit', viewBox: '0 0 100 100',
      preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
    });
    const defs = svgElement('defs', {});
    const gradient = svgElement('linearGradient', {
      id, x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    // Each button owns its fixed sport colours. The selected sport changes
    // the surrounding room, never the four individual selector gradients.
    for (const [offset, side] of [['0%', 'left'], ['49.9%', 'left'], ['50%', 'right'], ['100%', 'right']]) {
      gradient.append(svgElement('stop', {
        offset, 'stop-color': 'var(--gem-selector-' + side + ')'
      }));
    }
    defs.append(gradient);
    circuit.append(defs);
    for (const part of ['tail', 'hot', 'pin']) {
      const path = svgElement('path', {
        class: 'home-gem-selector-' + part, pathLength: '1000',
        fill: 'none', stroke: part === 'pin' ? '#f4ffff' : 'url(#' + id + ')',
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      circuit.append(path);
    }
    button.append(circuit);
    lightCircuits.set(button, { circuit, kind: 'selector' });
    measureLightCircuit(button);
  }

  function measureLightCircuit(button) {
    const installed = lightCircuits.get(button);
    if (!installed) return;
    const { circuit, kind } = installed;
    // Border-free controls use border-box sizing. Resolved CSS dimensions keep
    // fractional grid widths intact and exclude transient hover transforms.
    const controlStyle = getComputedStyle(button);
    const width = Number.parseFloat(controlStyle.width) || button.offsetWidth;
    const height = Number.parseFloat(controlStyle.height) || button.offsetHeight;
    if (!width || !height) return;
    circuit.setAttribute('viewBox', `0 0 ${width + 4} ${height + 4}`);
    if (kind === 'entry') {
      const face = getComputedStyle(button, '::before');
      const artWidth = Number.parseFloat(face.width) || width;
      const artHeight = Number.parseFloat(face.height) || artWidth * 224 / 1488;
      const left = 2 + (Number.parseFloat(face.left) || 0);
      const top = 2 + (height - artHeight) / 2;
      const rim = entryOpticalRims[home.dataset.homeSport] || entryOpticalRims.nfl;
      const d = rim.map(([x, y], index) => (index ? 'L' : 'M') +
        (left + x * artWidth / 1488).toFixed(3) + ' ' +
        (top + y * artHeight / 224).toFixed(3)).join(' ') + 'Z';
      circuit.querySelectorAll('path').forEach(path => path.setAttribute('d', d));
      return;
    }
    const radius = Math.min(12, width / 2, height / 2);
    // SVG coordinates use this native button's measured pixels. The highlight
    // starts at top centre and travels clockwise, like both ring lanes. A
    // resize changes only this closed path, never its CSS phase or clock.
    const d = `M${2 + width / 2} 2H${2 + width - radius}Q${2 + width} 2 ${2 + width} ${2 + radius}V${2 + height - radius}Q${2 + width} ${2 + height} ${2 + width - radius} ${2 + height}H${2 + radius}Q2 ${2 + height} 2 ${2 + height - radius}V${2 + radius}Q2 2 ${2 + radius} 2H${2 + width / 2}Z`;
    circuit.querySelectorAll('path').forEach(path => path.setAttribute('d', d));
  }

  function addEntryCircuit(button) {
    if (button.querySelector('.home-gem-entry-circuit')) return;
    const id = 'home-gem-circuit-entry';
    const circuit = svgElement('svg', {
      class: 'home-gem-entry-circuit', viewBox: '0 0 100 100',
      preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
    });
    const defs = svgElement('defs', {});
    const gradient = svgElement('linearGradient', {
      id, x1: '0%', y1: '0%', x2: '100%', y2: '0%'
    });
    for (const [offset, side] of [['0%', 'left'], ['49.9%', 'left'], ['50%', 'right'], ['100%', 'right']]) {
      gradient.append(svgElement('stop', {
        offset, 'stop-color': 'rgb(var(--home-gem-light-' + side + '-rgb))'
      }));
    }
    defs.append(gradient);
    circuit.append(defs);
    for (const part of ['tail', 'hot', 'pin']) {
      circuit.append(svgElement('path', {
        class: 'home-gem-entry-' + part, pathLength: '1000', fill: 'none',
        stroke: part === 'pin' ? '#f4ffff' : 'url(#' + id + ')',
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    }
    button.append(circuit);
    lightCircuits.set(button, { circuit, kind: 'entry' });
    measureLightCircuit(button);
    // The existing sport-selector event updates geometry only. The same CSS
    // animation objects, duration and phase survive every selection.
    home.addEventListener('pd:home-sport', () => measureLightCircuit(button));
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

  function installBrandLighting() {
    const brand = home.querySelector('.home-header .brand');
    if (!brand || brand.querySelector('.home-brand-lighting')) return;
    // Sampled paths use the existing normalized 1800 × 693 coordinate space;
    // the approved 2022 × 778 lossless raster itself remains byte-for-byte intact.
    // Inset face outlines exclude the gold mounts, letter counters, background
    // and green moneybag. Points were sampled on existing bright crystal facets.
    // This gives every PROJECT letter distributed scintillation; the individual
    // diamonds in the raster artwork are not separately editable objects.
    const crystalLetters = [
      ['P', 'M72 76H220L245 99V204L220 229H146V305H72V267H86V120H72Z M145 124H193V184H145Z',
        [[167,90],[128,111],[233,90],[92,153],[218,147],[143,150],[230,210],[95,192],[152,213],[137,252],[185,216],[107,225],[143,291],[89,267],[104,294]]],
      ['R', 'M288 76H417L446 104V201L403 224L446 305H386L345 235H338V305H288Z M335 120H394V184H335Z',
        [[383,117],[416,93],[311,84],[317,153],[428,150],[398,144],[365,198],[311,198],[428,198],[389,219],[404,258],[326,240],[404,294],[296,270],[329,288]]],
      ['O', 'M510 76H612L638 103V277L612 303H510L484 277V103Z M530 121H591V266H530Z',
        [[543,99],[588,93],[513,105],[615,153],[501,135],[630,123],[519,204],[495,183],[630,192],[603,213],[609,243],[498,231],[552,282],[510,282],[618,285]]],
      ['J', 'M775 77H822V279L797 305H695L677 286V224H719V266H775Z',
        [[802,112],[775,91],[814,85],[799,151],[775,130],[811,202],[781,196],[793,235],[688,244],[718,247],[778,286],[733,295],[811,280]]],
      ['E', 'M857 76H982V123H909V172H975V217H909V266H982V305H857Z',
        [[949,105],[892,99],[865,84],[871,126],[907,162],[868,156],[883,198],[961,177],[964,210],[907,258],[868,255],[907,219],[937,297],[868,288],[967,279]]],
      ['C', 'M1050 76H1151L1180 103V147H1128V123H1062V266H1128V224H1180V277L1151 304H1050L1022 277V103Z',
        [[1153,99],[1075,117],[1048,84],[1144,141],[1030,126],[1030,162],[1051,210],[1060,180],[1168,258],[1141,225],[1030,258],[1123,279],[1090,282],[1060,270]]],
      ['T', 'M1222 77H1366V123H1320V305H1270V123H1222Z',
        [[1341,97],[1308,121],[1308,85],[1275,139],[1314,166],[1278,199],[1317,208],[1278,169],[1287,253],[1317,256],[1296,286]]]
    ];
    // Conservative polished front faces leave the deep counters and shaded
    // bevels intact. The large $ on the moneybag is deliberately outside them.
    const goldLetters = [
      ['D', 'M69 353H224L250 379V586L223 612H69Z M130 395H196L206 413V551L189 567H130Z', [[74,358],[245,385],[75,607]]],
      ['O', 'M319 352H464L489 379V586L463 612H319L289 584V381Z M337 398H414L431 416V549L414 567H337Z', [[321,357],[483,384],[322,607]]],
      ['L1', 'M544 352H600V554H679V612H544Z', [[549,357],[595,357],[673,607]]],
      ['L2', 'M730 352H790V554H870V612H730Z', [[735,357],[785,357],[864,607]]],
      ['A', 'M981 353H1040L1112 612H1059L1040 554H964L946 612H908Z M977 397H1030L1052 518H949Z', [[984,360],[1037,360],[1062,605]]],
      ['R', 'M1164 353H1318L1355 377V442L1311 484L1355 612H1296L1262 523H1225V612H1164Z M1210 400H1310L1315 452L1295 472H1210Z', [[1170,358],[1348,380],[1350,607]]]
    ];
    const lighting = svgElement('svg', {
      class: 'home-brand-lighting', viewBox: '0 0 1800 693',
      preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false'
    });
    const defs = svgElement('defs', {});
    function gradient(kind, id, attrs, stops) {
      const light = svgElement(kind, { id, ...attrs });
      stops.forEach(([offset, colour, opacity]) => light.append(svgElement('stop', {
        offset, 'stop-color': colour, 'stop-opacity': opacity
      })));
      defs.append(light);
    }
    gradient('linearGradient', 'home-brand-gold-sun', {
      x1: '0%', y1: '0%', x2: '18%', y2: '100%'
    }, [['0%', '#fff6c0', '.6'], ['30%', '#ffd27a', '.16'],
      ['65%', '#ffc74d', '0'], ['100%', '#ffeab1', '.22']]);
    gradient('linearGradient', 'home-brand-crystal-sweep', {
      x1: '0%', y1: '100%', x2: '100%', y2: '0%'
    }, [['0%', '#adcfff', '0'], ['34%', '#adcfff', '0'],
      ['43%', '#c8e7ff', '.16'], ['47%', '#eff9ff', '.5'],
      ['49%', '#fff', '.93'], ['52%', '#e8f5ff', '.5'],
      ['59%', '#aacfff', '.1'], ['68%', '#adcfff', '0'], ['100%', '#adcfff', '0']]);
    gradient('linearGradient', 'home-brand-gold-sweep', {
      x1: '0%', y1: '100%', x2: '100%', y2: '0%'
    }, [['0%', '#ffc764', '0'], ['26%', '#ffc764', '0'],
      ['38%', '#ffe29b', '.12'], ['46%', '#fff0b9', '.4'],
      ['49%', '#fff9d7', '.94'], ['53%', '#fff4c7', '.58'],
      ['62%', '#ffd884', '.14'], ['76%', '#ffc764', '0'], ['100%', '#ffc764', '0']]);
    gradient('linearGradient', 'home-brand-gold-edge', {
      x1: '0%', y1: '0%', x2: '32%', y2: '100%'
    }, [['0%', '#fffbe2', '.97'], ['28%', '#ffe69a', '.5'],
      ['58%', '#ffc15e', '.08'], ['100%', '#fff2be', '.85']]);
    for (const metal of [false, true]) {
      gradient('radialGradient', 'home-brand-' + (metal ? 'gold' : 'crystal') + '-pin-bloom', {},
        [['0%', metal ? '#fff3c2' : '#edf8ff', '.78'],
          ['24%', metal ? '#ffe5a4' : '#cfe8ff', '.3'],
          ['100%', metal ? '#ffcf79' : '#b5d8ff', '0']]);
    }
    const crystalFaces = svgElement('clipPath', {
      id: 'home-brand-crystal-faces', clipPathUnits: 'userSpaceOnUse'
    });
    const goldFaces = svgElement('clipPath', {
      id: 'home-brand-gold-faces', clipPathUnits: 'userSpaceOnUse'
    });
    defs.append(crystalFaces, goldFaces);
    lighting.append(defs);

    let pointOrdinal = 0;
    function addPoint(parent, x, y, metal, pin) {
      const ordinal = pointOrdinal++;
      const duration = metal ? 7.8 : 4.9 + ordinal % 9 * .23;
      const point = svgElement('g', {
        class: pin ? 'home-brand-point home-brand-point-' + (metal ? 'gold' : 'crystal') : 'home-brand-facet',
        transform: `translate(${x} ${y})`
      });
      // Deterministic phases avoid synchronized flashes. CSS owns the clock;
      // the shared Home lifecycle controls when these decorative lights run.
      point.style.setProperty('--brand-point-duration', duration.toFixed(2) + 's');
      point.style.setProperty('--brand-point-delay', (-(ordinal * .61803398875 % 1) * duration).toFixed(3) + 's');
      if (!pin) {
        const size = 10 + ordinal % 4 * 3;
        const angle = ordinal % 2 ? 18 : -23;
        const cut = svgElement('g', { transform: `rotate(${angle})` });
        // Small triangular planes catch light inside sampled native diamonds.
        // They leave the raster's detailed cut, blue shadows and settings visible.
        cut.append(svgElement('path', {
          d: `M${-size} 0L0 ${-size * .7}L${size * .28} 0Z`, fill: '#f7fcff', opacity: '.9'
        }));
        cut.append(svgElement('path', {
          d: `M0 ${-size * .7}L${size} ${size * .12}L${size * .28} 0Z`, fill: '#c4e3ff', opacity: '.54'
        }));
        cut.append(svgElement('path', {
          d: `M${-size} 0L${size * .28} 0L0 ${size * .62}Z`, fill: '#e9f7ff', opacity: '.38'
        }));
        point.append(cut);
      } else {
        const size = metal ? 20 + ordinal % 3 * 3 : 15 + ordinal % 4 * 2.7;
        const waist = metal ? 1.9 : 1.55;
        const halfArm = size * .48;
        point.append(svgElement('circle', {
          r: (size * .9).toFixed(2),
          fill: 'url(#home-brand-' + (metal ? 'gold' : 'crystal') + '-pin-bloom)'
        }));
        point.append(svgElement('path', {
          class: 'home-brand-point-rays',
          d: `M0 ${-size}L${waist} ${-waist}L${size} 0L${waist} ${waist}L0 ${size}L${-waist} ${waist}L${-size} 0L${-waist} ${-waist}Z`
        }));
        point.append(svgElement('path', {
          class: 'home-brand-point-fine',
          d: `M${-halfArm} ${-halfArm}L.8 -.8L${halfArm} ${halfArm}L-.8 .8Z M${halfArm} ${-halfArm}L.8 .8L${-halfArm} ${halfArm}L-.8 -.8Z`
        }));
        point.append(svgElement('circle', { class: 'home-brand-point-core', r: metal ? '2.8' : '2.4' }));
      }
      parent.append(point);
    }

    const crystalReflection = svgElement('g', { 'clip-path': 'url(#home-brand-crystal-faces)' });
    crystalReflection.append(svgElement('rect', {
      class: 'home-brand-crystal-reflection', x: '0', y: '65', width: '340', height: '250',
      fill: 'url(#home-brand-crystal-sweep)'
    }));
    lighting.append(crystalReflection);
    crystalLetters.forEach(([letter, face, points]) => {
      const id = 'home-brand-crystal-face-' + letter;
      const clip = svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
      clip.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      crystalFaces.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      defs.append(clip);
      const scintillation = svgElement('g', {
        class: 'home-brand-crystal-letter', 'data-brand-letter': letter, 'clip-path': 'url(#' + id + ')'
      });
      points.forEach(([x, y], index) => addPoint(scintillation, x, y, false, index % 4 === 0));
      lighting.append(scintillation);
    });
    const goldReflection = svgElement('g', { 'clip-path': 'url(#home-brand-gold-faces)' });
    goldReflection.append(svgElement('rect', {
      class: 'home-brand-gold-warmth', x: '60', y: '345', width: '1310', height: '275',
      fill: 'url(#home-brand-gold-sun)'
    }));
    goldReflection.append(svgElement('rect', {
      class: 'home-brand-gold-reflection', x: '0', y: '340', width: '420', height: '285',
      fill: 'url(#home-brand-gold-sweep)'
    }));
    lighting.append(goldReflection);
    const goldEdges = [
      'M74 358H221L245 381 M74 390V606H222L245 583',
      'M322 357H461L484 381 M294 390V581L322 607H461L484 583',
      'M549 357H595 M549 373V607H674',
      'M735 357H785 M735 373V607H865',
      'M984 358H1037L1060 442 M913 607H943 M1062 607H1107',
      'M1169 358H1316L1350 381 M1169 390V607H1220 M1299 607H1350'
    ];
    goldLetters.forEach(([letter, face, points], index) => {
      const id = 'home-brand-gold-face-' + letter;
      const clip = svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
      clip.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      goldFaces.append(svgElement('path', { d: face, 'clip-rule': 'evenodd' }));
      defs.append(clip);
      const reflection = svgElement('g', {
        class: 'home-brand-gold-letter', 'data-brand-letter': letter, 'clip-path': 'url(#' + id + ')'
      });
      const edge = svgElement('path', {
        class: 'home-brand-gold-edge', d: goldEdges[index], fill: 'none',
        stroke: 'url(#home-brand-gold-edge)', 'stroke-width': '3.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      });
      edge.style.setProperty('--brand-edge-delay', (-2.8 - index * .43).toFixed(2) + 's');
      reflection.append(edge);
      points.forEach(([x, y]) => addPoint(reflection, x, y, true, true));
      lighting.append(reflection);
    });
    brand.append(lighting);
  }

  addRingSpecularGradient();

  [...home.querySelectorAll('[data-home-select]')].forEach(button => {
    addSelectorCircuit(button, button.dataset.homeSelect);
  });

  const entry = home.querySelector('[data-home-entry]');
  if (entry) {
    addEntryCircuit(entry);
    // The original native CTA and its accessible label/navigation are intact.
    // The photographic gemstone atlas remains underneath these small glints.
    for (const [index, side] of ['left', 'right'].entries()) {
      let cap = entry.querySelector('.home-entry-diamond.is-' + side);
      if (!cap) {
        cap = document.createElement('span');
        cap.className = 'home-entry-diamond is-' + side;
        cap.setAttribute('aria-hidden', 'true');
        entry.append(cap);
      }
      if (!cap.querySelector('.home-gem-glint')) {
        // These points follow the white specular hits and cut intersections
        // in the native jewel endcaps, leaving the dark centre text clear.
        const facets = side === 'left'
          ? [[57, 10], [19, 72], [77, 48]]
          : [[43, 16], [81, 76], [23, 52]];
        facets.forEach(([x, y], ordinal) => {
          addGlint(cap, x, y, 'cap', index * 3 + ordinal);
        });
      }
      if (!cap.querySelector('.home-gem-facet-reflection')) {
        const reflection = document.createElement('span');
        reflection.className = 'home-gem-facet-reflection';
        reflection.setAttribute('aria-hidden', 'true');
        const duration = 9.7 + Math.random() * 4.4;
        reflection.style.setProperty('--home-gem-facet-duration', duration.toFixed(3) + 's');
        reflection.style.setProperty('--home-gem-facet-delay', (-Math.random() * duration).toFixed(3) + 's');
        cap.append(reflection);
      }
    }
    if (!entry.querySelector('.home-gem-glint-edge')) {
      addGlint(entry, 24, 4, 'edge', 7);
      addGlint(entry, 78, 94, 'edge', 8);
    }
  }

  const gate = home.querySelector('.aperture-gate');
  if (gate && !gate.querySelector('.home-gem-glint-ring')) {
    // These points belong to the restored photographic casting's outer metal.
    // The entrance scene and emblem remain clear of synthetic glints.
    [[14, 30], [86, 30], [32, 94], [68, 94]].forEach(([x, y], index) => {
      addGlint(gate, x, y, 'ring', 10 + index);
    });
  }

  // Measure only at native layout events. Resizing a viewport or returning to
  // Home updates the real perimeter; animation remains entirely CSS driven.
  if ('ResizeObserver' in window) {
    const circuitResize = new ResizeObserver(entries => {
      entries.forEach(({ target }) => measureLightCircuit(target));
    });
    lightCircuits.forEach((installed, button) => circuitResize.observe(button));
  } else {
    window.addEventListener('resize', () => {
      lightCircuits.forEach((installed, button) => measureLightCircuit(button));
    }, { passive: true });
  }

  installBrandLighting();

  // Measuring native controls can flush styles. Keep every continuous lane
  // unanimated until all of them exist, then start their zero-delay CSS clocks
  // together in one style update. Sport selection and resizing do not reset it.
  home.dataset.homeLightCircuitReady = 'true';
  home.dataset.homeGemMotionInstalled = 'true';
})();
