"use strict";
/* Home-specific evidence: real browser images, availability feedback, touch
   bounds, outlined logo density, pointer response and reduced motion. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const output = __dirname;
const base = process.env.HOME_QA_URL || "http://127.0.0.1:8970/project-dollers/";
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const report = { generatedAt: new Date().toISOString(), source: "Approved top-left Home panel supplied in chat; original bytes unavailable.", engine: browser.version(), results: [] };
  for (const width of [393, 430]) {
    const height = width === 393 ? 852 : 896;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: "Australia/Sydney" });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base); await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].filter(i => i.checkVisibility()).map(i => i.decode().catch(() => {}))));
    const geometry = await page.evaluate(() => {
      const home = document.querySelector('[data-page="home"]'), scroll = home.querySelector('.page-scroll'), nav = home.querySelector('.bottom-nav').getBoundingClientRect();
      const tiles = [...home.querySelectorAll('.sport-card')].map(card => {
        const r = card.getBoundingClientRect(); const image = card.querySelector('img'); const i = image.getBoundingClientRect();
        return { sport: card.querySelector('strong').textContent, width: r.width, height: r.height, bottom: r.bottom, navTop: nav.top, sourcePixelsPerCssPixel: Math.min(image.naturalWidth / i.width, image.naturalHeight / i.height) };
      });
      const mark = home.querySelector('.home-brand-mark');
      return { overflow: scroll.scrollWidth - scroll.clientWidth, tiles, logo: { src: mark.currentSrc, natural: [mark.naturalWidth, mark.naturalHeight], complete: mark.complete }, movements: [...home.getAnimations({subtree:true})].filter(a => a.effect?.getTiming().iterations === Infinity).length };
    });
    assert.equal(geometry.overflow, 0);
    assert.ok(geometry.logo.complete && geometry.logo.src.endsWith('home-brand.svg'));
    for (const tile of geometry.tiles) { assert.ok(tile.bottom < tile.navTop); assert.ok(tile.width > 44 && tile.height > 44); assert.ok(tile.sport === 'UFC' || tile.sourcePixelsPerCssPixel >= 2); }
    assert.ok(geometry.movements >= 10, 'Stage/tile reflections/border travels have actual animations');
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 2000; }
        else if (animation.playState === 'running') animation.finish();
      }
    });
    await page.screenshot({ path: path.join(output, `home-after-${width}.png`) });
    for (const sport of ['NBA','NRL','UFC']) {
      await page.locator(`[data-sport-comingsoon="${sport}"]`).tap();
      await page.waitForFunction(() => +getComputedStyle(document.querySelector('.home-availability')).opacity > .9);
      assert.equal(await page.locator('.home-availability').innerText(), `${sport} research is coming soon. Explore NFL research now.`);
      assert.equal(await page.locator('.page.active').getAttribute('data-page'), 'home');
      await page.keyboard.press('Escape');
    }
    const nba = page.locator('[data-sport-comingsoon="NBA"]'); await nba.focus(); await page.keyboard.press('Enter');
    assert.ok((await page.locator('.home-availability').innerText()).startsWith('NBA'));
    await page.keyboard.press('Escape');
    await page.locator('.nfl-card').tap();
    await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'nfl');
    await page.locator('[data-page="nfl"] [data-open="home"]').tap();
    await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'home');
    assert.deepEqual(errors, []);
    report.results.push({ width, height, dpr: 2, geometry, availabilityControls: 'touch and keyboard passed', navigation: 'Home → NFL → Home passed', errors });
    await context.close();
  }
  const pointerContext = await browser.newContext({ viewport: { width:1440, height:1000 } });
  const pointer = await pointerContext.newPage(); await pointer.goto(base);
  const tile = pointer.locator('.nfl-card'); const bounds = await tile.boundingBox();
  await pointer.mouse.move(bounds.x + bounds.width*.8, bounds.y + bounds.height*.2);
  await pointer.waitForFunction(() => document.querySelector('.nfl-card').style.getPropertyValue('--tile-tilt-x') !== '');
  const response = await tile.evaluate(e => ({ x: e.style.getPropertyValue('--tile-x'), tilt: e.style.getPropertyValue('--tile-tilt-x') }));
  await pointer.mouse.move(1,1); await pointer.waitForFunction(() => !document.querySelector('.nfl-card').style.getPropertyValue('--tile-tilt-x'));
  report.pointerResponse = response; await pointerContext.close();
  const reduced = await browser.newContext({ viewport: { width:393,height:852 }, reducedMotion:'reduce' });
  const page = await reduced.newPage(); await page.goto(base);
  const unwanted = await page.evaluate(() => [...document.querySelector('[data-page="home"]').getAnimations({subtree:true})].filter(a => String(a.animationName || '').startsWith('home-') && a.playState === 'running').map(a => a.animationName));
  assert.deepEqual(unwanted, []); report.reducedMotion = 'All added Home loops disabled';
  await reduced.close(); await browser.close();
  fs.writeFileSync(path.join(output, 'home-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Home browser, touch/keyboard, pointer and reduced-motion QA passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
