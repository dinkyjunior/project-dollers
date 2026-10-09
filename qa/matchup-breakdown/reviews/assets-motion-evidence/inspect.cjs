'use strict';
/* Independent read-only asset/lifecycle audit. Actual local/hosted HTML and
   source responses are used; no route interception, styles or clock seeking. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../../..');
const { runtimeManifest } = require(path.join(root, 'qa/nfl-dashboard/qa.cjs'));
const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key) + 1];
const base = arg('--base');
const out = path.resolve(arg('--output'));
assert.ok(/^https?:\/\//.test(base) && base.endsWith('/'), 'Actual HTTP application base is required');
assert.ok(!fs.existsSync(out), 'Every independent run preserves preceding evidence');
fs.mkdirSync(out, { recursive: true });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = { status: 'running', startedAt: new Date().toISOString(), base, scenarios: [], qualification: { genuineChromium: true, deviceScaleFactor: 2, physicalIPhone: false, noFPSCertification: true, noRuntimeMutationOrSourceSubstitution: true, naturalAnimationPhases: true } };
const save = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
save();
let browser;
async function snapshot(page) {
  return page.locator('[data-page="matchup-breakdown"]').evaluate(p => {
    const r = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    const s = p.querySelector('.page-scroll');
    const clocks = p.getAnimations({ subtree: true }).filter(a => a.animationName?.startsWith('mb-') && a.effect.getComputedTiming().iterations === Infinity).map(a => ({ name: a.animationName, time: a.currentTime, state: a.playState, zone: a.effect.target.closest('.mb-motion-zone')?.dataset.mbMotionVisibility || null }));
    const controls = [...p.querySelectorAll('button,select,a[href]')].filter(e => e.checkVisibility()).map(e => {
      const b = r(e), text = e.getAttribute('aria-label') || e.innerText || e.selectedOptions?.[0]?.textContent || '';
      const inView = b.y >= Math.max(0, r(s).y) && b.bottom <= Math.min(innerHeight, r(s).bottom);
      const hit = inView && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { tag: e.tagName, text, ...b, inView, hit: !inView ? null : !!hit && (hit === e || e.contains(hit)), disabled: !!e.disabled, tabIndex: e.tabIndex };
    });
    const images = [...p.querySelectorAll('img')].filter(e => e.checkVisibility()).map(e => {
      const b = r(e), css = getComputedStyle(e), url = new URL(e.currentSrc || e.src);
      return { path: url.pathname, origin: url.origin, decoded: e.complete && e.naturalWidth > 0, native: [e.naturalWidth, e.naturalHeight], rendered: [b.width, b.height], objectFit: css.objectFit, vector: /\.svg$/.test(url.pathname), density: Math.min(e.naturalWidth / b.width, e.naturalHeight / b.height), aspectDistortion: Math.abs((b.width / b.height) / (e.naturalWidth / e.naturalHeight) - 1) };
    });
    return { reason: p.dataset.mbMotionReason, state: p.dataset.mbMotionState, clocks, page: r(p), scroll: { ...r(s), width: s.clientWidth, contentWidth: s.scrollWidth, contentHeight: s.scrollHeight, top: s.scrollTop }, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, controls, images, decorationAccessible: [...p.querySelectorAll('.mb-perimeter-light,.mb-frame-glints,.mb-reflection,.mb-diamond-spark')].every(e => e.getAttribute('aria-hidden') === 'true' && !e.matches('a,button,[tabindex="0"]')) };
  });
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'matchup-breakdown' && document.querySelector('.mb-qb-panel') && document.querySelector('.page.active')?.dataset.mbMotionState === 'running');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.page.active img')].map(e => e.decode().catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function capture(page, name) {
  const bytes = await page.screenshot({ path: path.join(out, name + '.png'), animations: 'allow' });
  return { file: name + '.png', sha256: sha(bytes), bytes: bytes.length, naturalUnpaused: true };
}
async function scenario(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, timezoneId: 'Australia/Sydney' });
  const page = await context.newPage();
  const item = { viewport, status: 'running', errors: [], http: [], external: [], screenshots: [] };
  report.scenarios.push(item); save();
  page.on('pageerror', e => item.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') item.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) item.http.push({ url: r.url(), status: r.status() }); });
  page.on('request', r => { const u = new URL(r.url()); if (u.origin !== new URL(base).origin && /^https?:$/.test(u.protocol)) item.external.push(u.href); });
  try {
    assert.equal((await page.goto(base + '#matchup/DAL', { waitUntil: 'networkidle' })).status(), 200);
    await ready(page);
    item.first = await snapshot(page);
    item.loading = await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation').map(e => ({ duration: e.duration, domContentLoaded: e.domContentLoadedEventEnd })), resources: performance.getEntriesByType('resource').filter(e => /assets\/(?:data\/matchup-breakdown|matchup-breakdown|home\/gate-brand|home\/gate-scenes-nfl|fonts\/)/.test(e.name)).map(e => ({ url: e.name, initiatorType: e.initiatorType, duration: e.duration, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize, transferSize: e.transferSize })) }));
    assert.ok(item.first.documentWidth <= viewport.width + 1, 'No outer horizontal scroll');
    assert.ok(item.first.scroll.contentWidth <= item.first.scroll.width + 1, 'No internal horizontal scroll');
    assert.equal(item.first.decorationAccessible, true, 'All decorative light layers are excluded from accessibility and input');
    for (const c of item.first.controls) { assert.ok(c.x >= item.first.page.x - 1 && c.right <= item.first.page.right + 1, 'Native control fits frame: ' + c.text); if (c.inView && !c.disabled) assert.equal(c.hit, true, 'Visible control receives actual hit: ' + c.text); }
    for (const im of item.first.images) { assert.equal(im.decoded, true, 'Visible image decoded: ' + im.path); assert.equal(im.origin, new URL(base).origin, 'Local image'); assert.ok(im.vector || im.density >= 1.9, 'Retina density: ' + im.path); assert.ok(im.objectFit === 'contain' || im.aspectDistortion < .04, 'Brand and identity mark proportions retained'); }
    item.screenshots.push(await capture(page, `matchup-${viewport.width}-top-a`));
    await page.waitForTimeout(420);
    item.second = await snapshot(page);
    item.screenshots.push(await capture(page, `matchup-${viewport.width}-top-b`));
    const advancing = item.first.clocks.filter((a, i) => a.zone === 'in' && a.state === 'running' && item.second.clocks[i]?.time > a.time);
    assert.ok(advancing.length >= 4, 'At least four real foreground native CSS clocks naturally advance');
    assert.ok(item.second.clocks.filter(a => a.zone === 'out').every(a => a.state !== 'running'), 'Offscreen clocks are paused');
    assert.notEqual(item.screenshots[0].sha256, item.screenshots[1].sha256, 'Actual unpaused paints naturally change');
    item.advancingClockCount = advancing.length;
    await page.locator('[data-page="matchup-breakdown"] .page-scroll').evaluate(s => { s.scrollTop = Math.floor((s.scrollHeight - s.clientHeight) / 2); });
    await page.waitForTimeout(100);
    item.middle = await snapshot(page); item.screenshots.push(await capture(page, `matchup-${viewport.width}-middle`));
    assert.ok(item.middle.clocks.filter(a => a.zone === 'out').every(a => a.state !== 'running'), 'Offscreen clocks pause after genuine internal scroll');
    await page.locator('[data-page="matchup-breakdown"] .page-scroll').evaluate(s => { s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(100);
    item.bottom = await snapshot(page); item.screenshots.push(await capture(page, `matchup-${viewport.width}-bottom`));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    item.reduced = await snapshot(page);
    assert.equal(item.reduced.clocks.filter(a => a.state === 'running').length, 0, 'Reduced motion leaves no running infinite hardware clocks');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(100);
    await page.locator('[data-page="matchup-breakdown"] .mb-bottom-nav [data-mb-action="home"]').click();
    await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'home');
    await page.waitForTimeout(150);
    item.inactive = await snapshot(page);
    assert.equal(item.inactive.clocks.filter(a => a.state === 'running').length, 0, 'Leaving route pauses every matchup clock');
    await page.goto(base + '#matchup/DAL', { waitUntil: 'networkidle' }); await ready(page);
    await page.keyboard.press('Tab');
    item.focus = await page.evaluate(() => { const e = document.activeElement, css = getComputedStyle(e); return { tag: e.tagName, text: e.innerText, nativeFocusVisible: e.matches(':focus-visible'), outlineWidth: css.outlineWidth, outlineStyle: css.outlineStyle, inMatchup: !!e.closest('[data-page="matchup-breakdown"]') }; });
    assert.equal(item.focus.inMatchup, true, 'Keyboard focus enters actual new route'); assert.equal(item.focus.nativeFocusVisible, true, 'Native keyboard focus-visible matches'); assert.notEqual(item.focus.outlineStyle, 'none', 'Keyboard outline is present');
    await page.evaluate(() => window.addEventListener('pagehide', () => {
      const p = document.querySelector('[data-page="matchup-breakdown"]');
      const running = p.getAnimations({ subtree: true }).filter(a => a.animationName?.startsWith('mb-') && a.effect.getComputedTiming().iterations === Infinity && a.playState === 'running').length;
      sessionStorage.setItem('__pd_mb_asset_pagehide', JSON.stringify({ state: p.dataset.mbMotionState, reason: p.dataset.mbMotionReason, runningInfiniteClocks: running }));
    }));
    await page.goto('about:blank');
    await page.goBack({ waitUntil: 'networkidle' }); await ready(page);
    item.genuinePagehide = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__pd_mb_asset_pagehide')));
    assert.equal(item.genuinePagehide.state, 'paused', 'Actual document departure pauses matchup lighting');
    assert.equal(item.genuinePagehide.reason, 'pagehide', 'Actual document departure reaches the owned lifecycle handler');
    assert.equal(item.genuinePagehide.runningInfiniteClocks, 0, 'No matchup infinite clocks run during actual departure');
    item.documentReturn = await snapshot(page);
    assert.equal(item.documentReturn.state, 'running', 'Actual document return resumes active matchup lighting');
    assert.deepEqual(item.errors, [], 'No script/console errors'); assert.deepEqual(item.http, [], 'No failed asset/source HTTP requests'); assert.deepEqual(item.external, [], 'No hotlinked runtime requests');
    item.status = 'passed';
  } catch (e) { item.status = 'failed'; item.failure = { message: e.message, stack: e.stack }; try { item.screenshots.push(await capture(page, `failure-${viewport.width}`)); } catch {} }
  finally { item.completedAt = new Date().toISOString(); save(); await context.close(); }
}
(async () => {
  try {
    report.runtimeFiles = runtimeManifest();
    report.runtimeManifestSha256 = sha(Buffer.from(JSON.stringify(report.runtimeFiles)));
    report.auditLogicSha256 = sha(fs.readFileSync(__filename));
    report.motionModuleSha256 = sha(fs.readFileSync(path.join(root, 'assets/matchup-breakdown-motion.js')));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browserVersion = browser.version();
    for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 896 }, { width: 1440, height: 1000 }]) await scenario(viewport);
    assert.equal(sha(fs.readFileSync(path.join(root, 'assets/matchup-breakdown-motion.js'))), report.motionModuleSha256, 'Independent motion code unchanged during audit');
    assert.deepEqual(runtimeManifest(), report.runtimeFiles, 'Actual complete runtime remains unchanged during independent audit');
    assert.equal(sha(fs.readFileSync(__filename)), report.auditLogicSha256, 'Actual audit logic remains unchanged during execution');
    report.status = report.scenarios.every(r => r.status === 'passed') ? 'passed' : 'failed';
  } catch (e) { report.status = 'failed'; report.failure = { message: e.message, stack: e.stack }; }
  finally { if (browser) await browser.close(); report.completedAt = new Date().toISOString(); save(); process.exitCode = report.status === 'passed' ? 0 : 1; console.log(JSON.stringify({ status: report.status, output: path.join(out, 'results.json') })); }
})();
