'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { NFL, active, ready } = require('./qa.cjs');

async function native(page) {
  return page.locator(NFL).evaluate(n => {
    const scroller = n.querySelector('.page-scroll');
    const rectangle = e => {
      const r = e.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const pageRect = rectangle(n), scrollRect = rectangle(scroller);
    function visibleGeometry(e) {
      const s = getComputedStyle(e), r = rectangle(e);
      if (n.hidden || !n.classList.contains('active') || e.closest('[hidden]') ||
          s.visibility === 'hidden' || s.display === 'none' || r.width <= 0 || r.height <= 0) return false;
      const clip = scroller.contains(e) ? scrollRect : pageRect;
      return Math.min(r.right, clip.right, pageRect.right, innerWidth) - Math.max(r.left, clip.left, pageRect.left, 0) > .1 &&
        Math.min(r.bottom, clip.bottom, pageRect.bottom, innerHeight) - Math.max(r.top, clip.top, pageRect.top, 0) > .1;
    }
    const zoneElements = [...n.querySelectorAll('.nfl-motion-zone')];
    const elements = [...n.querySelectorAll('*')];
    const style = getComputedStyle(n);
    return {
      state:n.dataset.nflMotionState,
      reason:n.dataset.nflMotionReason,
      documentState:{ visibility:document.visibilityState, hasFocus:document.hasFocus() },
      page:{ opacity:Number(style.opacity), transform:style.transform, rect:pageRect },
      zones:zoneElements.map((z,i) => ({ i, visible:z.dataset.nflMotionVisibility,
        visibleGeometry:visibleGeometry(z), label:z.getAttribute('aria-label') || z.className })),
      clocks:n.getAnimations({subtree:true})
        .filter(a => (a.animationName || '').startsWith('nfl-') && a.effect?.getComputedTiming().iterations === Infinity)
        .map(a => {
          const e = a.effect.target, z = e.closest('.nfl-motion-zone'), s = getComputedStyle(e,a.effect.pseudoElement || null);
          return { name:a.animationName, state:a.playState, time:a.currentTime, target:e.className,
            targetIndex:elements.indexOf(e), pseudo:a.effect.pseudoElement || null,
            zone:z?.dataset.nflMotionVisibility || null, zoneIndex:zoneElements.indexOf(z),
            cssVisibility:s.visibility, cssDisplay:s.display, cssPlayState:s.animationPlayState,
            visibleGeometry:visibleGeometry(e) && s.visibility !== 'hidden' && s.display !== 'none' };
        }),
      text:[...n.querySelectorAll('.stand-row,.leader-row')]
        .map(e => ({ transform:getComputedStyle(e).transform, animation:getComputedStyle(e).animationName }))
    };
  });
}

function assertVisibleClockAdvance(first, second, label, requireMedallion) {
  assert.equal(second.state,'running',`${label}: NFL lighting is active`);
  assert.ok(second.page.opacity >= .99,`${label}: the actual NFL page remains fully visible`);
  for (const z of second.zones) {
    if (z.visibleGeometry) assert.equal(z.visible,'in',`${label}: visible zone ${z.label} has a fresh intersection`);
  }
  const key = c => `${c.targetIndex}:${c.name}:${c.pseudo}`;
  const previous = new Map(first.clocks.map(c => [key(c),c]));
  const visible = second.clocks.filter(c => c.visibleGeometry &&
    ['nfl-edge-reflection','nfl-league-circuit','nfl-medallion-emission','nfl-join-scintillation'].includes(c.name));
  const panels = visible.filter(c => c.name === 'nfl-edge-reflection');
  assert.ok(panels.length > 0,`${label}: actual visible panel reflections exist`);
  if (requireMedallion) assert.ok(visible.some(c => c.name === 'nfl-league-circuit'),`${label}: the visible medallion orbit exists`);
  for (const c of visible) {
    const before = previous.get(key(c));
    assert.equal(c.state,'running',`${label}: visible ${c.name} runs natively`);
    assert.ok(before && typeof c.time === 'number' && c.time > before.time + 1,
      `${label}: visible ${c.name} advances without seeking (${before?.time} → ${c.time})`);
  }
  for (const c of second.clocks) {
    if (c.zone === 'out' || c.cssVisibility === 'hidden' || c.cssDisplay === 'none')
      assert.equal(c.state,'paused',`${label}: invisible decorative ${c.name} stays paused`);
  }
  for (const t of second.text) {
    assert.equal(t.transform,'none','Factual table text remains stationary');
    assert.equal(t.animation,'none','No factual-row animation');
  }
  return { visibleAdvancingClocks:visible.length, visiblePanelClocks:panels.length,
    medallionVerified:requireMedallion, naturalTimeVerified:true };
}

async function naturalPair(page,label,requireMedallion) {
  // Browser contexts can leave WPE's renderer in a background page even when
  // document.visibilityState says visible. Use its real foreground operation.
  await page.bringToFront();
  // WPE can expose updated DOM geometry while its foreground compositor has
  // not yet painted or delivered scroll/animation events. Commit a real
  // browser render before sampling its naturally advancing native clocks.
  // This does not inject styles, restart animations or write currentTime.
  await page.screenshot({animations:'allow',timeout:30000});
  await page.waitForTimeout(220);
  const paint = await page.screenshot({animations:'allow',timeout:30000});
  const first = await native(page);
  await page.waitForTimeout(380);
  const laterPaint = await page.screenshot({animations:'allow',timeout:30000});
  const second = await native(page);
  const paintHash = createHash('sha256').update(paint).digest('hex');
  const laterPaintHash = createHash('sha256').update(laterPaint).digest('hex');
  assert.notEqual(paintHash,laterPaintHash,`${label}: actual naturally painted illumination changes between frames`);
  return { first, second, foregroundPaint:{bytes:paint.length,
    sha256:paintHash,laterBytes:laterPaint.length,laterSha256:laterPaintHash,
    naturalPixelChangeVerified:true,
    qualification:'Genuine foreground browser frames at both natural clock samples; no animation seeking or injected styles'},
    assertions:assertVisibleClockAdvance(first,second,label,requireMedallion) };
}

async function motion(page,base) {
  await page.locator(NFL+' .page-scroll').evaluate(s => s.scrollTop=0);
  await page.waitForFunction(() => document.querySelector('.page[data-page="nfl"]').dataset.nflMotionState === 'running');
  const initial = await naturalPair(page,'Natural initial top',true);
  await page.locator(NFL+' .page-scroll').evaluate(s => s.scrollTop=s.scrollHeight);
  const lower = await naturalPair(page,'Natural lower-panel scroll',false);
  assert.ok(lower.second.zones.some(z => z.visible === 'out'),'Top panels genuinely leave the scroller viewport');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => document.querySelector('.page[data-page="nfl"]').dataset.nflMotionState === 'reduced');
  const reduced = await native(page);
  assert.equal(reduced.clocks.filter(c => c.state === 'running').length,0,'Reduced motion has no active native infinite clocks');
  await page.waitForTimeout(150);
  assert.deepEqual((await native(page)).clocks,reduced.clocks,'Reduced-motion clocks remain still');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(() => document.querySelector('.page[data-page="nfl"]').dataset.nflMotionState === 'running');
  await page.locator(NFL+' [data-open="home"]').click();
  await active(page,'home');
  await page.waitForFunction(() => document.querySelector('.page[data-page="nfl"]').dataset.nflMotionState === 'paused');
  const inactive = await native(page);
  assert.equal(inactive.reason,'inactive');
  assert.equal(inactive.clocks.filter(c => c.state === 'running').length,0,'Inactive route runs no native NFL clocks');
  await page.locator('[data-home-select="nfl"]').click();
  await page.locator('[data-home-entry]').click();
  await active(page,'nfl');
  await page.waitForFunction(() => document.querySelector('.page[data-page="nfl"]').dataset.nflMotionState === 'running');
  await page.locator(NFL+' .page-scroll').evaluate(s => s.scrollTop=0);
  const returned = await naturalPair(page,'Home → NFL return',true);
  await page.evaluate(() => window.addEventListener('pagehide',() => {
    const n=document.querySelector('.page[data-page="nfl"]');
    sessionStorage.setItem('__nfl_qa_pagehide',JSON.stringify({state:n.dataset.nflMotionState,
      reason:n.dataset.nflMotionReason,
      documentState:{ visibility:document.visibilityState, hasFocus:document.hasFocus() },running:n.getAnimations({subtree:true})
        .filter(a => (a.animationName || '').startsWith('nfl-') && a.playState === 'running').length}));
  }));
  await page.goto('about:blank');
  await page.goBack({waitUntil:'networkidle'});
  await ready(page);
  await active(page,'nfl');
  const pagehide = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__nfl_qa_pagehide')));
  assert.equal(pagehide.state,'paused');
  assert.equal(pagehide.reason,'pagehide');
  assert.equal(pagehide.running,0,'Genuine document departure pauses all NFL clocks');
  await page.locator(NFL+' .page-scroll').evaluate(s => s.scrollTop=0);
  const restored = await naturalPair(page,'Actual document back/restoration',true);
  await page.goto(base+'#nfl',{waitUntil:'networkidle'});
  await ready(page);
  await active(page,'nfl');
  const direct = await naturalPair(page,'Natural direct URL load',true);
  await page.reload({waitUntil:'networkidle'});
  await ready(page);
  await active(page,'nfl');
  const reloaded = await naturalPair(page,'Natural reload',true);
  return { first:initial.first, second:initial.second, bottom:lower.second, reduced, inactive,
    resumed:returned.second, pagehide, naturalPairs:{initial,lower,returned,restored,direct,reloaded},
    naturalNativeTimeVerified:true, physicalIPhoneFPS:false,
    qualification:'Actual geometry and visible medallion/panel native advancement are required at natural direct load, inner scrolling, Home return, document restoration and reload. No animation time seeking. Physical iPhone hardware/FPS is not claimed.' };
}
module.exports = { motion, native, naturalPair, assertVisibleClockAdvance };
