'use strict';
// Independent proof of the new metal gate's naturally rendered motion. No
// animation is sought, paused for exposure, sped up or replaced by this test.
const { launch, runtimeManifest } = require('../home-gate.cjs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { redact } = require('../hosted-webkit.cjs');
const ROOT = path.resolve(__dirname, '../..');
const HOME = '.page[data-page="home"]';
const SPORTS = ['nfl', 'nba', 'nrl', 'ufc'];
const VIEWS = [{ width: 393, height: 852 }, { width: 430, height: 896 }];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function sample(page) {
  return page.locator(HOME).evaluate(home => {
    const read = selector => {
      const el = home.querySelector(selector);
      if (!el) throw new Error(`Missing metal gate motion hook: ${selector}`);
      const style = getComputedStyle(el);
      return {
        transform: style.transform,
        opacity: style.opacity,
        animationName: style.animationName,
        playState: style.animationPlayState,
        backgroundImage: style.backgroundImage,
        maskImage: style.maskImage,
        filter: style.filter,
        overflow: style.overflow,
        isolation: style.isolation,
        position: style.position,
        zIndex: style.zIndex,
      };
    };
    const bounds = selector => {
      const r = home.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const ground = bounds('.home-floor'), gate = bounds('.aperture-gate');
    const entry = bounds('[data-home-entry]'), reflection = bounds('.aperture-floor-reflection');
    const clipX = Math.ceil(Math.max(0, ground.x));
    const clipY = Math.ceil(Math.max(0, ground.y));
    const floorClip = {
      x: clipX, y: clipY,
      width: Math.floor(Math.min(innerWidth, ground.right)) - clipX,
      height: Math.floor(Math.min(innerHeight, ground.bottom, entry.y)) - clipY,
    };
    return {
      state: home.dataset.homeMotionState,
      reason: home.dataset.homeMotionReason,
      sport: home.dataset.homeSport,
      flare: read('.aperture-travel-sweep'),
      metalGlint: read('.aperture-metal-glint-sweep'),
      fixedMetal: read('.aperture-metal-housing'),
      fixedMetalHalf: read('.aperture-metal-half'),
      fixedChannel: read('.aperture-inset'),
      floorReflection: read('.aperture-floor-reflection'),
      groundPlane: read('.home-floor'),
      floorShimmer: read('.home-floor-shimmer'),
      groundGeometry: { ground, gate, entry, reflection, floorClip },
      reflectedMetal: read('.home-metal-reflection-image'),
      reflectedMetalHalf: read('.home-metal-reflection-half'),
      halo: read('.aperture-neon-halo'),
      innerHalo: read('.aperture-neon-halo-inner'),
      venue: read('img[data-home-scene]:not([hidden])'),
      infiniteAnimations: home.getAnimations({ subtree: true }).filter(animation =>
        animation.effect.getComputedTiming().iterations === Infinity
      ).map(animation => ({
        target: animation.effect.target.className,
        name: animation.animationName,
        state: animation.playState,
      })),
    };
  });
}

async function naturalFrames(page) {
  await page.waitForTimeout(650);
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  ));
}

async function lifecycle(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'reduced');
  const reduced = await sample(page);
  await naturalFrames(page);
  const still = await sample(page);
  assert.deepEqual(reduced, still, 'Reduced motion leaves every new decorative layer still');
  assert.equal(still.infiniteAnimations.filter(animation => animation.state === 'running').length, 0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'running');
  const stage = page.locator('.aperture-stage');
  const originalStyle = await stage.getAttribute('style');
  await stage.evaluate(el => el.style.setProperty('transform', 'translateY(-200vh)'));
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionReason === 'offscreen');
  const offscreen = await sample(page);
  assert.equal(offscreen.flare.playState, 'paused');
  assert.equal(offscreen.metalGlint.playState, 'paused');
  assert.equal(offscreen.floorReflection.playState, 'paused');
  assert.equal(offscreen.floorShimmer.playState, 'paused');
  await stage.evaluate((el, value) => {
    if (value === null) el.removeAttribute('style');
    else el.setAttribute('style', value);
  }, originalStyle);
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'running');

  // Isolated visibility-input branch test. Headless cloud rendering does not
  // certify native OS tab/background transitions. Restore the exact own-property
  // descriptor and active event state before any further capture or navigation.
  await page.evaluate(() => {
    window.__pdHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionReason === 'hidden');
  const hidden = await sample(page);
  assert.equal(hidden.state, 'paused');
  for (const key of ['flare', 'metalGlint', 'floorReflection', 'floorShimmer']) assert.equal(hidden[key].playState, 'paused');
  await page.evaluate(() => {
    if (window.__pdHiddenDescriptor) Object.defineProperty(document, 'hidden', window.__pdHiddenDescriptor);
    else delete document.hidden;
    delete window.__pdHiddenDescriptor;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'running');

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const pagehide = await sample(page);
  assert.equal(pagehide.reason, 'pagehide');
  assert.equal(pagehide.flare.playState, 'paused');
  assert.equal(pagehide.metalGlint.playState, 'paused');
  assert.equal(pagehide.floorReflection.playState, 'paused');
  assert.equal(pagehide.floorShimmer.playState, 'paused');
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'running');

  await page.locator('[data-home-select="nfl"]').tap();
  await page.locator('[data-home-entry]').tap();
  await page.waitForFunction(() => document.querySelector('.page.active').dataset.page === 'nfl');
  const inactive = await sample(page);
  assert.equal(inactive.reason, 'inactive');
  assert.equal(inactive.flare.playState, 'paused');
  assert.equal(inactive.metalGlint.playState, 'paused');
  assert.equal(inactive.floorReflection.playState, 'paused');
  assert.equal(inactive.floorShimmer.playState, 'paused');
  assert.equal(inactive.infiniteAnimations.filter(animation => animation.state === 'running').length, 0);
  return {
    reduced, offscreen, hidden, pagehide, inactive,
    qualification: 'Offscreen testing moves only the decorative stage and restores its exact style. The hidden branch uses an isolated document.hidden input override and restores its original descriptor. Pagehide/pageshow listener checks dispatch events; native OS backgrounding is not claimed. No animation phases are sought or forced.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const base = value('--base') || 'http://127.0.0.1:8765/project-dollers/';
  const out = path.resolve(value('--output') || path.join(__dirname, 'motion-review'));
  const engine = value('--engine') || 'chromium';
  fs.mkdirSync(out, { recursive: true });
  const manifest = runtimeManifest();
  const report = {
    status: 'running', startedAt: new Date().toISOString(), base, engine,
    testScriptSha256: sha(fs.readFileSync(__filename)),
    runtimeManifest: manifest, viewports: VIEWS, deviceScaleFactor: 2,
    approvedSource: 'The four-sport final Home gate render reattached in chat. Marked white strokes on the separate screenshot are annotations, not product styling.',
    naturalAnimationFrames: true, animationPhaseSubstituted: false,
    metalTextureStationary: true, nativeHardwareTested: false,
    states: [], lifecycle: [],
  };
  let browser;
  try {
    browser = await launch(engine, base.startsWith('https:'));
    report.browserVersion = browser.version();
    for (const viewport of VIEWS) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Australia/Sydney' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        const response = await page.goto(base + '#home', { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        await page.evaluate(async () => document.fonts.ready);
        for (const sport of SPORTS) {
          await page.locator(`[data-home-select="${sport}"]`).tap();
          await page.waitForFunction(selected => document.querySelector('.page[data-page="home"]').dataset.homeSport === selected, sport);
          await page.waitForFunction(() => [...document.querySelectorAll('.page.active img')].filter(img => img.checkVisibility()).every(img => img.complete && img.naturalWidth > 0));
          await page.waitForFunction(() => document.querySelector('.page[data-page="home"]').dataset.homeMotionState === 'running');
          const first = await sample(page);
          const g = first.groundGeometry;
          assert.equal(first.groundPlane.transform, 'none', 'The new ground plane avoids the rejected 3D paint hierarchy');
          assert.equal(first.groundPlane.overflow, 'hidden', 'The moving floor light is clipped to the bounded ground');
          assert.equal(first.groundPlane.isolation, 'isolate', 'The ground owns a contained compositing surface');
          assert.notEqual(first.groundPlane.maskImage, 'none', 'The ground has an explicit feathered edge mask');
          assert.ok(g.ground.x >= -1 && g.ground.right <= viewport.width + 1, 'The ground remains bounded to the phone width');
          assert.ok(g.ground.y >= g.gate.bottom - 8 && g.ground.y <= g.gate.bottom + 1, 'The ground joins the portal pedestal without an empty strip');
          assert.ok(g.reflection.height > 0 && g.floorClip.width > 0 && g.floorClip.height > 0, 'The floor and reflected parent have visible measurable geometry');
          const fileA = `${sport}-${viewport.width}x${viewport.height}-frame-a.png`;
          const bytesA = await page.locator('.aperture-gate').screenshot({ path: path.join(out, fileA), animations: 'allow' });
          const floorA = `${sport}-${viewport.width}x${viewport.height}-floor-a.png`;
          const floorBytesA = await page.screenshot({ path: path.join(out, floorA), clip: g.floorClip, animations: 'allow' });
          await naturalFrames(page);
          const second = await sample(page);
          const fileB = `${sport}-${viewport.width}x${viewport.height}-frame-b.png`;
          const bytesB = await page.locator('.aperture-gate').screenshot({ path: path.join(out, fileB), animations: 'allow' });
          const floorB = `${sport}-${viewport.width}x${viewport.height}-floor-b.png`;
          const floorBytesB = await page.screenshot({ path: path.join(out, floorB), clip: second.groundGeometry.floorClip, animations: 'allow' });
          assert.notEqual(first.flare.transform, second.flare.transform, 'The recessed channel flare travels naturally');
          assert.notEqual(first.metalGlint.transform, second.metalGlint.transform, 'The new polished-metal reflection travels naturally');
          assert.notEqual(first.venue.transform, second.venue.transform, 'The venue breathes naturally behind fixed league artwork');
          assert.deepEqual(first.fixedMetal, second.fixedMetal, 'The solid metal portal stays stationary');
          assert.deepEqual(first.fixedMetalHalf, second.fixedMetalHalf, 'The NBA red half stays stationary with its fixed colour treatment');
          assert.deepEqual(first.reflectedMetal, second.reflectedMetal, 'The reflected metal stays fixed beneath its moving light');
          assert.deepEqual(first.reflectedMetalHalf, second.reflectedMetalHalf, 'The reflected NBA red half retains its fixed colour treatment');
          assert.notEqual(first.floorReflection.opacity, second.floorReflection.opacity, 'The new metal reflection breathes naturally with the floor light');
          assert.notEqual(first.floorShimmer.transform, second.floorShimmer.transform, 'The new bounded floor light travels naturally');
          assert.deepEqual(first.groundPlane, second.groundPlane, 'The 2D ground surface remains stationary under the moving light');
          assert.deepEqual(first.groundGeometry, second.groundGeometry, 'Clipping and reflected-parent geometry remain stable');
          assert.equal(first.fixedChannel.backgroundImage, second.fixedChannel.backgroundImage, 'Sport colours stay fixed under moving highlights');
          assert.notEqual(sha(bytesA), sha(bytesB), 'Actual gate pixels change between unpaused frames');
          assert.notEqual(sha(floorBytesA), sha(floorBytesB), 'Actual bounded-floor pixels change between naturally rendered frames');
          for (const frame of [first, second]) {
            assert.ok(Number(frame.halo.opacity) >= .679, 'The outer neon retains a strong baseline throughout its pulse');
            assert.ok(Number(frame.innerHalo.opacity) >= .759, 'The recessed neon retains a strong baseline throughout its pulse');
          }
          for (const key of ['flare', 'metalGlint', 'halo', 'innerHalo', 'floorReflection', 'floorShimmer', 'venue']) assert.equal(second[key].playState, 'running');
          report.states.push({
            sport, viewport, first, second,
            frames: [{ file: fileA, sha256: sha(bytesA), bytes: bytesA.length }, { file: fileB, sha256: sha(bytesB), bytes: bytesB.length }],
            floorFrames: [{ file: floorA, sha256: sha(floorBytesA), bytes: floorBytesA.length }, { file: floorB, sha256: sha(floorBytesB), bytes: floorBytesB.length }],
          });
        }
        report.lifecycle.push({ viewport, ...(await lifecycle(page)) });
        assert.deepEqual(errors, [], 'No console or JavaScript errors in independent motion review');
      } finally { await context.close(); }
    }
    assert.deepEqual(runtimeManifest(), manifest, 'No runtime was edited during this review');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = redact(error.message); throw error;
  } finally {
    if (browser) await browser.close();
    report.completedAt = new Date().toISOString();
    report.completedAustraliaSydney = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'long' }).format(new Date(report.completedAt));
    fs.writeFileSync(path.join(out, 'results.json'), redact(JSON.stringify(report, null, 2)) + '\n');
  }
  console.log(`PASS independent ${engine} metal motion: eight natural frame pairs, stationary material, fixed palettes and lifecycle. ${path.relative(ROOT, out)}/results.json`);
}
if (require.main === module) main().catch(error => { console.error(redact(error.stack)); process.exitCode = 1; });
module.exports = { main };
