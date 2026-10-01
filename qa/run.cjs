"use strict";
/* Meaningful regression QA shared with hosted.cjs. External requests are blocked;
   data expectations come from the committed, sourced current.json dataset. */
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const ROOT = path.resolve(__dirname, "..");
const VIEWPORTS = [
  { width: 393, height: 852 }, { width: 430, height: 896 },
  { width: 320, height: 700 }, { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
function sourceSnapshot() {
  const raw = fs.readFileSync(path.join(ROOT, "assets/data/current.json"));
  return { data: JSON.parse(raw), sha256: sha256(raw), bytes: raw.length };
}
async function active(page, expected) {
  await page.waitForFunction((id) => document.querySelector(".page.active")?.dataset.page === id, expected);
  assert.equal(await page.locator(".page:visible").count(), 1);
  await page.evaluate(() => {
    for (const a of document.querySelector(".page.active").getAnimations())
      if (a.effect?.getComputedTiming().iterations === 1) a.finish();
  });
}
async function ready(page) {
  await page.waitForFunction(() => window.PD_DATA && Array.isArray(window.PD_DATA.roster) && document.documentElement.dataset.dataReady === "true");
  await page.evaluate(async () => document.fonts.ready);
}
async function resetScroll(page) {
  await page.locator(".page.active .page-scroll").evaluate((e) => { e.scrollTop = 0; });
}
async function layout(page, label) {
  const value = await page.evaluate(() => {
    const scroll = document.querySelector(".page.active .page-scroll");
    const navElement = document.querySelector(".page.active .bottom-nav");
    const nav = navElement.getBoundingClientRect();
    const navigation = [...navElement.querySelectorAll("button")].map((button) => {
      const label = button.querySelector("span"), icon = button.querySelector("svg");
      const buttonRect = button.getBoundingClientRect(), labelRect = label.getBoundingClientRect(), iconRect = icon.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label);
      const glyph = range.getBoundingClientRect(), style = getComputedStyle(label), iconStyle = getComputedStyle(icon);
      let renderedIcon;
      try { const b = icon.getBBox(); renderedIcon = { width: b.width, height: b.height }; } catch { renderedIcon = { width: 0, height: 0 }; }
      const hit = document.elementFromPoint(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
      return { label: label.textContent.trim(), labelVisible: label.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), iconVisible: icon.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), opacity: +style.opacity, iconOpacity: +iconStyle.opacity, color: style.color, renderedIcon, targetWidth: buttonRect.width, targetHeight: buttonRect.height, hitTarget: !!hit && button.contains(hit), contained: [labelRect, iconRect, glyph].every((r) => r.width > 0 && r.height > 0 && r.left >= nav.left - 1 && r.right <= nav.right + 1 && r.top >= nav.top - 1 && r.bottom <= nav.bottom + 1) };
    });
    const clipped = [];
    for (const e of document.querySelectorAll(".page.active .player-name, .page.active .player-stats b, .page.active .player-stats span, .page.active .stand-row [role=cell]")) {
      if (!e.checkVisibility()) continue;
      const style = getComputedStyle(e);
      const verticalClip = ["hidden", "clip"].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1;
      // A glyph may extend slightly outside a 1.0 line box with visible overflow;
      // that is not clipping. It must still remain inside its complete card.
      const range = document.createRange(); range.selectNodeContents(e);
      const text = range.getBoundingClientRect(), card = e.closest(".player-card")?.getBoundingClientRect();
      const outsideCard = card && (text.left < card.left - 1 || text.right > card.right + 1 || text.top < card.top - 1 || text.bottom > card.bottom + 1);
      if (e.scrollWidth > e.clientWidth + 1 || verticalClip || outsideCard)
        clipped.push({ text: e.textContent.trim(), width: e.clientWidth, scrollWidth: e.scrollWidth, height: e.clientHeight, scrollHeight: e.scrollHeight });
    }
    return {
      width: scroll.scrollWidth, clientWidth: scroll.clientWidth,
      height: scroll.scrollHeight, clientHeight: scroll.clientHeight,
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      navBottom: nav.bottom, viewportHeight: innerHeight, navigation, clipped,
    };
  });
  assert.ok(value.width <= value.clientWidth + 1, `${label}: horizontal content overflow ${JSON.stringify(value)}`);
  assert.ok(value.documentWidth <= value.viewportWidth + 1, `${label}: document horizontal overflow`);
  assert.ok(value.navBottom <= value.viewportHeight + 1, `${label}: bottom navigation outside viewport`);
  assert.deepEqual(value.clipped, [], `${label}: internally clipped player/table text`);
  assert.deepEqual(value.navigation.map((item) => item.label), ["Home", "Teams", "Matchups", "Insights", "More"], `${label}: complete navigation labels`);
  for (const item of value.navigation) {
    assert.ok(item.labelVisible && item.iconVisible && item.opacity > 0 && item.iconOpacity > 0 && item.contained, `${label}: navigation text/icon visibility and bounds ${JSON.stringify(item)}`);
    assert.ok(item.renderedIcon.width > 1 && item.renderedIcon.height > 1, `${label}: navigation SVG has actual painted geometry ${JSON.stringify(item)}`);
    assert.ok(item.targetHeight >= 44 && item.targetWidth >= 44, `${label}: navigation touch target ${JSON.stringify(item)}`);
    // Dialog captures deliberately obscure the nav; test normal-screen hit targets.
    if (label !== "sources") assert.ok(item.hitTarget, `${label}: navigation center is a working hit target ${JSON.stringify(item)}`);
  }
  return value;
}
async function capture(page, label, viewport, outputDir, scrollTop = true) {
  if (scrollTop) await resetScroll(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => i.loading !== "lazy" || i.complete).map((i) => i.decode().catch(() => {})));
    window.__PD_QA_PAUSED = [];
    for (const a of document.getAnimations()) {
      const timing = a.effect?.getComputedTiming();
      if (timing?.iterations !== Infinity) {
        if (a.playState === "running") a.finish();
        continue;
      }
      if (a.playState !== "running") continue;
      a.pause(); window.__PD_QA_PAUSED.push(a);
      if (Number.isFinite(timing.duration)) a.currentTime = 2000;
    }
  });
  const geometry = await layout(page, label);
  const primaryBounds = await page.evaluate((screen) => {
    const selector = { home: ".sport-card", nfl: "#featured-matchup .game-card, #featured-matchup .bye-card", steelers: ".player-card" }[screen];
    if (!selector) return [];
    const scroll = document.querySelector(".page.active .page-scroll").getBoundingClientRect();
    const nav = document.querySelector(".page.active .bottom-nav").getBoundingClientRect();
    return [...document.querySelectorAll(`.page.active ${selector}`)].filter((e) => e.checkVisibility()).map((e) => {
      const r = e.getBoundingClientRect();
      return { element: e.getAttribute("aria-label") || e.textContent.trim().replace(/\s+/g, " ").slice(0, 100), top: r.top, bottom: r.bottom, visibleTop: scroll.top, visibleBottom: Math.min(scroll.bottom, nav.top), fullyVisible: r.top >= scroll.top - 1 && r.bottom <= Math.min(scroll.bottom, nav.top) + 1 };
    });
  }, label);
  if ([393, 430].includes(viewport.width) && ["home", "nfl", "steelers"].includes(label)) {
    assert.ok(primaryBounds.length > 0, `${label}: primary content exists`);
    for (const item of primaryBounds) assert.ok(item.fullyVisible, `${label}: default primary card fits above navigation ${JSON.stringify(item)}`);
  }
  const file = `${label}-${viewport.width}.png`;
  const capturedAt = new Date().toISOString();
  const png = await page.screenshot({ path: path.join(outputDir, file) });
  // Screenshot consistency does not alter the actual shipped motion behavior.
  await page.evaluate(() => {
    for (const a of window.__PD_QA_PAUSED || []) a.play();
    delete window.__PD_QA_PAUSED;
  });
  return { file, capturedAt, sha256: sha256(png), bytes: png.length, viewportCssPixels: viewport, geometry, primaryBounds };
}
async function imageQuality(page) {
  const result = await page.locator(".page.active img").evaluateAll((images) => images.filter((i) => i.checkVisibility()).map((img) => {
    const r = img.getBoundingClientRect(), style = getComputedStyle(img);
    const vector = new URL(img.currentSrc || img.src).pathname.endsWith(".svg");
    const scale = style.objectFit === "cover"
      ? Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight)
      : Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const distortion = Math.abs((r.width / r.height) / (img.naturalWidth / img.naturalHeight) - 1);
    return { src: new URL(img.currentSrc || img.src).pathname, natural: [img.naturalWidth, img.naturalHeight], rendered: [r.width, r.height], objectFit: style.objectFit, vector, sourcePixelsPerCssPixel: vector ? null : 1 / scale, complete: img.complete, distortion };
  }));
  for (const img of result) {
    assert.ok(img.complete && img.natural[0] > 0, `Broken image: ${img.src}`);
    assert.ok(img.vector || img.sourcePixelsPerCssPixel >= 1.95, `Below Retina density: ${JSON.stringify(img)}`);
    assert.ok(["contain", "cover", "scale-down", "none"].includes(img.objectFit) || img.distortion < .04, `Stretched image: ${JSON.stringify(img)}`);
  }
  return result;
}
async function motionCheck(page) {
  await page.waitForFunction(() => [...document.querySelectorAll(".player-card")].filter((c) => c.checkVisibility()).every((c) => {
    const svg = c.querySelector(".card-perimeter-light"), r = c.getBoundingClientRect();
    return c.classList.contains("motion-track-ready") && svg && Math.abs(svg.viewBox.baseVal.width - r.width) < 1 && Math.abs(svg.viewBox.baseVal.height - r.height) < 1;
  }));
  const result = await page.locator(".player-card:visible").evaluateAll((cards) => cards.map((card) => {
    const ball = card.querySelector(".orbit-football"), light = card.querySelector(".perimeter-light-core");
    if (!ball || !light) throw new Error("Card missing football or travelling perimeter light");
    const ballAnimation = ball.getAnimations()[0], lights = card.querySelectorAll(".card-perimeter-light path");
    const animations = [ballAnimation, ...[...lights].map((p) => p.getAnimations()[0])];
    if (animations.some((a) => !a)) throw new Error("Card motion has no active animation");
    const timing = ballAnimation.effect.getTiming();
    if (!animations.every((a) => a.effect.getTiming().duration === timing.duration && a.effect.getTiming().delay === timing.delay)) throw new Error("Football and travelling light timings diverge");
    const bounds = card.getBoundingClientRect(), length = light.getTotalLength(), edges = new Set();
    let maxBorderDistance = 0, maxTrackDistance = 0, maxLightPhaseDifference = 0;
    for (const a of animations) a.pause();
    for (let i = 0; i < 32; i++) {
      // Start in the second iteration so staggered negative delays never require
      // negative WAAPI times immediately after screenshot pause/play operations.
      for (const a of animations) a.currentTime = timing.delay + timing.duration + i * timing.duration / 32;
      const b = ball.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      const distances = { left: Math.abs(x - bounds.left), right: Math.abs(x - bounds.right), top: Math.abs(y - bounds.top), bottom: Math.abs(y - bounds.bottom) };
      const [edge, d] = Object.entries(distances).sort((a,b) => a[1]-b[1])[0];
      maxBorderDistance = Math.max(maxBorderDistance, d); edges.add(edge);
      const expected = light.getPointAtLength(length * i / 32);
      const point = new DOMPoint(expected.x, expected.y).matrixTransform(light.getScreenCTM());
      maxTrackDistance = Math.max(maxTrackDistance, Math.hypot(x-point.x, y-point.y));
      const percent = parseFloat(getComputedStyle(ball).offsetDistance);
      const dashOffset = parseFloat(getComputedStyle(light).strokeDashoffset);
      maxLightPhaseDifference = Math.max(maxLightPhaseDifference, Math.abs(percent - (5 - dashOffset)));
    }
    const research = [...card.querySelectorAll(".player-detail")].filter((e) => e.checkVisibility());
    const enclosed = [...card.querySelectorAll(".portrait,.player-info,.player-detail")].filter((e) => e.checkVisibility()).every((e) => {
      const r = e.getBoundingClientRect();
      return r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
    });
    for (const a of animations) a.play();
    return { player: card.getAttribute("aria-label"), width: bounds.width, height: bounds.height, edges: [...edges].sort(), maxBorderDistance, maxTrackDistance, maxLightPhaseDifference, enclosesPortraitNameAndStats: enclosed, expandedResearchVisibleCount: research.length, expanded: card.classList.contains("is-expanded"), samples: 32, durationMs: timing.duration };
  }));
  for (const card of result) {
    assert.deepEqual(card.edges, ["bottom", "left", "right", "top"], `All four outer edges: ${card.player}`);
    assert.ok(card.maxBorderDistance <= 10, `Football leaves outer border: ${JSON.stringify(card)}`);
    assert.ok(card.maxTrackDistance < 2, `Football and full rectangle track differ: ${JSON.stringify(card)}`);
    assert.ok(card.maxLightPhaseDifference < .2, `Travelling light not synchronized: ${JSON.stringify(card)}`);
    assert.ok(card.enclosesPortraitNameAndStats, `Animation perimeter does not enclose complete card: ${card.player}`);
  }
  return result;
}
async function rafSample(page) {
  return page.evaluate(async () => {
    const gaps = []; let previous;
    await new Promise((resolve) => {
      function tick(time) { if (previous !== undefined) gaps.push(time - previous); previous = time; if (gaps.length >= 90) resolve(); else requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    });
    gaps.sort((a,b) => a-b);
    return { frames: gaps.length, medianMs: gaps[Math.floor(gaps.length / 2)], p95Ms: gaps[Math.floor(gaps.length * .95)], context: "Headless Chromium container observation; not a physical iPhone performance claim" };
  });
}
function rosterForFilter(data, filter, full = true) {
  const current = data.roster.filter((p) => p.status !== "cut" && p.status !== "released" && !p.cut);
  if (filter !== "ALL") return current.filter((p) => p.filterGroup === filter);
  return full ? current : current.filter((p) => p.featured);
}
async function rosterValues(page, data) {
  const cards = await page.locator(".player-card:visible").evaluateAll((items) => items.map((card) => ({
    id: card.dataset.playerId, name: card.querySelector(".player-name").textContent.trim(),
    number: card.querySelector(".jersey").textContent.trim(), position: card.dataset.position,
    stats: [...card.querySelectorAll(".player-stats > div")].map((cell) => ({ value: cell.querySelector("b").textContent.trim(), label: cell.querySelector("span").textContent.trim() })),
  })));
  for (const card of cards) {
    const player = data.roster.find((p) => p.id === card.id);
    assert.ok(player, `Card identifies a sourced player: ${card.id}`);
    assert.equal(card.name, player.name); assert.equal(card.number, `#${player.number || "—"}`);
    assert.equal(card.position, player.filterGroup || player.position);
    assert.deepEqual(card.stats, player.stats.slice(0,4).map((s) => ({ label: s.label, value: s.value === null || s.value === undefined || s.value === "" ? "—" : String(s.value) })), `Visible statistics match the current dataset: ${player.name}`);
  }
}
async function standingsValues(page, data, conference) {
  const week = await page.locator("#week-select").inputValue();
  const expected = data.weeks[week].conferences[conference];
  const actual = await page.locator(".stand-row:visible").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll(":scope > [role=cell]")].map((cell) => cell.textContent.trim())));
  for (const row of actual) {
    const team = expected.find((t) => t.name === row[1]);
    assert.ok(team, `Displayed team must be in ${conference}: ${row[1]}`);
    assert.equal(row[0], team.rank === null ? "—" : String(team.rank));
    assert.equal(row[2], String(team.w));
    assert.equal(row[3], String(team.l) + (team.ties ? `+${team.ties}T` : ""));
    assert.equal(row[4], team.pct); assert.equal(row[5], team.streak || "—");
  }
}
async function datasetCheck(page, expected) {
  const actual = await page.evaluate(() => window.PD_DATA);
  assert.deepEqual(actual, expected, "Browser dataset must exactly match committed sourced current.json");
  assert.equal(actual.context.isCurrent, true, "The dataset must carry verified current-season context");
  assert.equal(actual.season, actual.context.requestedSeason, "Source availability must match the requested current season");
  assert.ok(Number.isFinite(Date.parse(actual.retrievedAt)), "Snapshot retrieval timestamp is required");
  assert.ok(Date.parse(actual.retrievedAt) <= Date.now() + 300000, "Retrieval timestamp cannot be in the future");
  const sourceIds = new Set(actual.sources.map((s) => s.id));
  for (const source of actual.sources) {
    assert.ok(source.url.startsWith("https://"), `Source URL is required: ${source.id}`);
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)), `Source retrieval timestamp: ${source.id}`);
    if (source.status === "verified") assert.match(source.sha256, /^[a-f0-9]{64}$/, `Verified source hash: ${source.id}`);
  }
  for (const [name, provenance] of Object.entries(actual.provenance)) {
    assert.ok(["verified", "derived", "inferred", "partial", "unavailable"].includes(provenance.status), `Explicit integrity status: ${name}`);
    assert.ok(provenance.sourceIds.every((id) => sourceIds.has(id)), `Traceable source IDs: ${name}`);
    if (provenance.status !== "unavailable") assert.ok(provenance.sourceIds.length > 0, `Sourced dataset: ${name}`);
  }
  assert.ok(Array.isArray(actual.disagreements) && Array.isArray(actual.unavailable), "Disagreement and unavailable-data records must remain explicit");
  assert.equal(actual.teams.length, 32, "All NFL teams are represented");
  assert.ok(actual.roster.length > 40, "A complete current roster is required");
  assert.equal(actual.roster.filter((p) => p.featured).length, 5, "Five featured roster players preserve approved presentation");
  return { season: actual.season, retrievedAt: actual.retrievedAt, rosterEntries: actual.roster.length, weekKeys: Object.keys(actual.weeks), sourceCount: actual.sources.length, provenanceDatasets: Object.keys(actual.provenance), disagreementCount: actual.disagreements.length, unavailableFields: actual.unavailable.map((u) => u.field) };
}
async function testViewport(browser, { base, outputDir, viewport, data, strictOffline = true }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: "Australia/Sydney", isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await context.newPage(), external = [], errors = [], responses = [], failedRequests = [], captures = {}, images = {};
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) responses.push({ url: r.url(), status: r.status() }); });
  page.on("requestfailed", (r) => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }));
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin === new URL(base).origin || ["data:", "blob:"].includes(u.protocol)) return route.continue();
    external.push(u.href); return route.abort();
  });
  try {
    const response = await page.goto(base + "#home", { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, `Hosted/local main document HTTP ${response?.status()}`);
    await ready(page); await active(page, "home");
    assert.equal(await page.locator(".page").count(), 3, "Only Pages 1–3 are in scope");
    const dataset = await datasetCheck(page, data);
    assert.equal(await page.locator(".sport-card img").count(), 4);
    captures.home = await capture(page, "home", viewport, outputDir);
    images.home = await imageQuality(page);
    await page.locator(".nfl-card").click(); await active(page, "nfl");
    assert.equal(await page.locator(".stand-row:visible").count(), 5, "Default dashboard preserves five selected-team density");
    assert.equal(await page.locator(".leader-row:visible").count(), 10);
    assert.ok(await page.locator(".steelers-row").count(), "Selected AFC contains Steelers entry point");
    await standingsValues(page, data, "AFC");
    captures.nfl = await capture(page, "nfl", viewport, outputDir);
    images.nfl = await imageQuality(page);
    const fixtureEntry = page.locator("#featured-matchup [data-matchup-entry]");
    if (await fixtureEntry.count()) {
      await fixtureEntry.click(); await active(page, "steelers");
      assert.equal(await page.locator("#team-panel-matchups").isVisible(), true, "Featured fixture opens sourced matchup research within Page 3");
      await page.locator(".team-back").click(); await active(page, "nfl");
    }
    await page.locator(".steelers-row button").click(); await active(page, "steelers");
    assert.equal(await page.locator("#team-panel-roster").isVisible(), true, "Steelers standings roster entry opens Roster after visiting Matchups");
    assert.equal(await page.locator(".player-card:visible").count(), rosterForFilter(data, "ALL", false).length);
    await rosterValues(page, data);
    captures.steelers = await capture(page, "steelers", viewport, outputDir);
    images.steelers = await imageQuality(page);
    const perimeter = await motionCheck(page);
    const cardBoxes = await page.locator(".player-card:visible").evaluateAll((cards) => cards.map((c) => { const r=c.getBoundingClientRect(); return {x:r.x,width:r.width,height:r.height}; }));
    assert.ok(cardBoxes.every((r) => Math.abs(r.x-cardBoxes[0].x)<.5 && Math.abs(r.width-cardBoxes[0].width)<.5 && Math.abs(r.height-cardBoxes[0].height)<.5), "Featured cards have consistent geometry");
    const filters = await page.locator("[data-filter]").evaluateAll((buttons) => buttons.map((b) => b.dataset.filter));
    for (const filter of filters.filter((f) => f !== "ALL")) {
      await page.locator(`[data-filter="${filter}"]`).click();
      assert.equal(await page.locator(".player-card:visible").count(), rosterForFilter(data, filter).length, `${filter}: current complete-roster filter`);
      await rosterValues(page, data);
      await layout(page, `roster-${filter}`);
    }
    await page.locator('[data-filter="ALL"]').click();
    await page.locator("[data-roster-toggle]").click();
    assert.equal(await page.locator(".player-card:visible").count(), rosterForFilter(data, "ALL").length, "Full roster includes all current entries");
    await page.locator(".page.active img").evaluateAll(async (items) => {
      // Exercise each local file at least once; shipped lazy loading is unchanged.
      for (const image of items) image.loading = "eager";
      await Promise.all(items.map((image) => image.decode()));
    });
    images.fullRoster = await imageQuality(page);
    await page.locator(".player-card:visible").last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    captures["steelers-full-bottom"] = await capture(page, "steelers-full-bottom", viewport, outputDir, false);
    const lastCard = await page.locator(".player-card:visible").last().boundingBox();
    const nav = await page.locator(".page.active .bottom-nav").boundingBox();
    assert.ok(lastCard.y + lastCard.height <= nav.y + 1, "Last roster card can scroll above bottom navigation");
    await page.locator("[data-roster-toggle]").click(); await resetScroll(page);
    assert.equal(await page.locator(".player-card:visible").count(), 5);
    const expander = page.locator("[data-player]").first();
    await expander.click(); assert.equal(await expander.getAttribute("aria-expanded"), "true");
    captures["steelers-player-details"] = await capture(page, "steelers-player-details", viewport, outputDir);
    const expandedPerimeter = await motionCheck(page);
    const expandedTrack = expandedPerimeter.filter((card) => card.expanded);
    assert.equal(expandedTrack.length, 1, "Exactly one expanded research card");
    assert.equal(expandedTrack[0].expandedResearchVisibleCount, 1, "Research lives inside the complete animated card");
    assert.ok(expandedTrack[0].height > cardBoxes[0].height + 100, "Football perimeter grows to encompass expanded metrics and game history");
    await expander.click(); assert.equal(await expander.getAttribute("aria-expanded"), "false");
    for (const tab of ["schedule", "stats", "matchups", "roster"]) {
      await page.locator(`[data-team-tab="${tab}"]`).click();
      assert.equal(await page.locator(`#team-panel-${tab}`).isVisible(), true);
      if (tab !== "roster") captures[`steelers-${tab}`] = await capture(page, `steelers-${tab}`, viewport, outputDir);
      await layout(page, `team-${tab}`);
    }
    await page.locator(".team-back").click(); await active(page, "nfl");
    for (const conference of ["NFC", "AFC"]) {
      await page.locator(`[data-conference="${conference}"]`).click();
      assert.equal(await page.locator(`[data-conference="${conference}"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".stand-row:visible").count(), 5);
      await page.locator("[data-standings-toggle]").click();
      assert.equal(await page.locator(".stand-row:visible").count(), 16, `${conference}: entire conference available`);
      await standingsValues(page, data, conference);
      await layout(page, `standings-${conference}`);
      await page.locator("[data-standings-toggle]").click();
    }
    const weeks = Object.keys(data.weeks);
    const options = await page.locator("#week-select option").evaluateAll((items) => items.map((e) => e.value));
    assert.deepEqual(options.sort((a,b)=>+a-+b), weeks.sort((a,b)=>+a-+b), "Week select only offers sourced datasets");
    for (const week of weeks) {
      await page.locator("#week-select").selectOption(week);
      assert.equal(await page.locator("#week-select").inputValue(), week);
      assert.ok((await page.locator("#featured-matchup").innerText()).trim().length > 0, `Week ${week}: fixture or explicit unavailable state`);
      await standingsValues(page, data, "AFC");
      await layout(page, `week-${week}`);
    }
    for (const week of await page.locator("[data-week]").evaluateAll((bs) => bs.map((b)=>b.dataset.week))) {
      await page.locator(`[data-week="${week}"]`).click();
      assert.equal(await page.locator("#week-select").inputValue(), week);
    }
    for (const tab of ["players", "recap", "ladder"]) {
      await page.locator(`[data-nfl-tab="${tab}"]`).click();
      assert.equal(await page.locator(`#panel-${tab}`).isVisible(), true);
      if (tab !== "ladder") captures[`nfl-${tab}`] = await capture(page, `nfl-${tab}`, viewport, outputDir);
      await layout(page, `nfl-${tab}`);
    }
    await page.locator('[data-nfl-tab="ladder"]').focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('[data-nfl-tab="players"]').getAttribute("aria-selected"), "true");
    await page.locator('.page.active [data-shortcut="matchups"]').click();
    await active(page, "steelers");
    assert.equal(await page.locator("#team-panel-matchups").isVisible(), true);
    await page.locator('.page.active [data-shortcut="insights"]').click();
    await active(page, "nfl");
    assert.equal(await page.locator("#panel-players").isVisible(), true);
    await page.locator(".page.active [data-more]").click();
    assert.equal(await page.locator("#about-dialog").isVisible(), true);
    await page.keyboard.press("Escape"); assert.equal(await page.locator("#about-dialog").isVisible(), false);
    const sourceButton = page.locator(".page.active [data-sources]").first();
    if (await sourceButton.count()) {
      await sourceButton.click(); assert.equal(await page.locator("#sources-dialog").isVisible(), true);
      assert.match(await page.locator("#sources-dialog").innerText(), /source|retriev|verified/i);
      captures.sources = await capture(page, "sources", viewport, outputDir);
      await page.keyboard.press("Escape");
    }
    await page.locator('.page.active [data-open="home"]').click(); await active(page, "home");
    await page.goBack(); await active(page, "nfl"); await page.goForward(); await active(page, "home");
    for (const name of ["home", "nfl", "steelers"]) {
      await page.goto(base + "#" + name, { waitUntil: "networkidle" }); await ready(page); await active(page, name);
      await page.reload({ waitUntil: "networkidle" }); await ready(page); await active(page, name);
    }
    const performance = viewport.width === 393 ? await rafSample(page) : undefined;
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".orbit-football").first().isVisible(), false);
    assert.equal(await page.locator(".card-perimeter-light").first().isVisible(), false);
    const animated = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity).length);
    assert.equal(animated, 0, "Reduced motion stops all indefinite decorative animation");
    assert.deepEqual(external, [], "All runtime assets/data are local; no fragile external requests");
    assert.deepEqual(errors, [], "No console errors or JavaScript exceptions");
    assert.deepEqual(responses, [], "No failed HTTP asset/data requests");
    const transportFailures = failedRequests.filter((r) => r.failure !== "net::ERR_ABORTED");
    assert.deepEqual(transportFailures, [], "No network transport failures");
    return { viewport, deviceScaleFactor: 2, status: "passed", externalRequests: external.length, consoleErrors: errors.length, httpErrors: responses.length, failedRequests: transportFailures.length, cancelledRequests: failedRequests.filter((r) => r.failure === "net::ERR_ABORTED"), dataset, captures, images, perimeter, expandedPerimeter, performance, checks: ["three-page navigation and history", "direct subpath hash loading and refresh", "current committed JSON loaded exactly", "five selected teams and sixteen per conference", "all available sourced week controls", "all implemented complete-roster position filters", "full roster expansion and bottom scrolling", "inline player research expansion", "all NFL/team tabs and keyboard navigation", "bottom shortcuts and source dialog", "all four outer card edges and synchronized travelling border light", "expanded player research inside resized complete-card perimeter", "all five visible navigation labels/icons and 44px touch targets", "primary mobile default cards fully above navigation", "reduced-motion compliance", "Retina source density and correct image fitting", "no horizontal overflow or internal card text clipping", "offline assets and zero HTTP/transport/console/JavaScript failures"] };
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, `failure-${viewport.width}.png`) }).catch(() => {});
    error.qaEvidence = { viewport, errors, responses, failedRequests, external, url: page.url(), message: error.message };
    throw error;
  } finally { await context.close(); }
}
async function unavailableFeedRecovery(browser, base) {
  const context = await browser.newContext({ viewport: VIEWPORTS[0], timezoneId: "Australia/Sydney" });
  const page = await context.newPage();
  const endpoint = "**/assets/data/current.json";
  try {
    await page.route(endpoint, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ unavailable: true }) }));
    await page.goto(base + "#nfl", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.dataReady === "error");
    assert.match(await page.locator("#data-status").innerText(), /unavailable/i);
    assert.equal(await page.locator(".stand-row").count(), 0, "Failed feed must not substitute fabricated standings");
    assert.equal(await page.locator(".player-card").count(), 0, "Failed feed must not substitute fabricated roster stats");
    assert.match(await page.locator("#featured-matchup").innerText(), /could not load/i);
    await page.unroute(endpoint);
    await page.locator("[data-retry]").click(); await ready(page);
    assert.equal(await page.locator(".stand-row:visible").count(), 5, "Retry recovers sourced standings");
    return { status: "passed", injectedFailure: "503 on local current.json", unavailableDataShownExplicitly: true, substitutedMockData: false, retryRecovered: true };
  } finally { await context.close(); }
}
async function runQA({ base, outputDir = __dirname, mode = "Local HTTP under /project-dollers/; external requests blocked", viewports = VIEWPORTS, browser }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const source = sourceSnapshot();
  const startedAt = new Date().toISOString();
  const runtimeFiles = ["index.html", "assets/app.js", "assets/styles.css", "assets/refinements.css", "assets/premium.css", "assets/motion.css", "assets/motion.js", "assets/data/current.json"];
  const runtimeManifest = Object.fromEntries(runtimeFiles.map((file) => [file, sha256(fs.readFileSync(path.join(ROOT, file)))]));
  const report = { runtimeManifest, testScriptSha256: sha256(fs.readFileSync(__filename)), worktreeStatus: execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean), startedAt, browser: await browser.version(), mode, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), source: { path: "assets/data/current.json", sha256: source.sha256, bytes: source.bytes }, results: [] };
  try {
    for (const viewport of viewports) {
      report.results.push(await testViewport(browser, { base, outputDir, viewport, data: source.data }));
      console.log(`PASS ${viewport.width}x${viewport.height} at 2x: sourced data, interactions, full card motion, images, layout.`);
    }
    report.feedUnavailableRecovery = await unavailableFeedRecovery(browser, base);
    report.runtimeManifestAfterQA = Object.fromEntries(runtimeFiles.map((file) => [file, sha256(fs.readFileSync(path.join(ROOT, file)))]));
    assert.deepEqual(report.runtimeManifestAfterQA, runtimeManifest, "Runtime changed during QA; rerun to obtain evidence for a single build");
    report.status = "passed";
  } catch (error) {
    report.status = "failed"; report.failure = error.qaEvidence || { message: error.message };
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}
async function launchChromium() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium", args: ["--no-sandbox"], headless: true });
}
async function availablePort() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve)); return port;
}
async function runLocal() {
  const port = await availablePort(), base = `http://127.0.0.1:${port}/project-dollers/`;
  const server = spawn("python3", ["-u", "-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", path.dirname(ROOT)], { stdio: ["ignore", "ignore", "pipe"] });
  let serverError = "", browser; server.stderr.on("data", (chunk) => { serverError += chunk; });
  try {
    for (let n = 0; n < 50; n++) {
      if (server.exitCode !== null) throw new Error(`QA server failed: ${serverError}`);
      try { if ((await fetch(base)).status === 200) break; } catch {}
      if (n === 49) throw new Error("QA server readiness timeout");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await launchChromium(); await runQA({ base, browser });
    // Use installed WebKit if present, without downloading a browser during QA.
    const wkPath = webkit.executablePath();
    if (fs.existsSync(wkPath)) {
      const safari = await webkit.launch({ headless: true });
      try { await runQA({ base, browser: safari, viewports: VIEWPORTS.slice(0,2), outputDir: path.join(__dirname, "webkit"), mode: "Installed Playwright WebKit; local HTTP and external requests blocked" }); }
      finally { await safari.close(); }
    } else console.log("WebKit not installed; physical iPhone/Safari remains unverified.");
  } finally {
    if (browser) await browser.close(); server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  }
}
module.exports = { ROOT, VIEWPORTS, sourceSnapshot, runQA, launchChromium, testViewport };
if (require.main === module) runLocal().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
