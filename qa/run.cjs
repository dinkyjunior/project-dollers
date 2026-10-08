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
const zlib = require("node:zlib");
const net = require("node:net");
const ROOT = path.resolve(__dirname, "..");
const VIEWPORTS = [
  { width: 393, height: 852 }, { width: 430, height: 896 },
  { width: 320, height: 700 }, { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
function pngRgb(bytes) {
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===2?3:bytes[25]===6?4:0;
  assert.ok(channels && bytes[24]===8 && bytes[28]===0,'Browser evidence uses an ordinary noninterlaced RGB/RGBA PNG');
  const chunks=[];
  for(let offset=8;offset<bytes.length;) {
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')chunks.push(bytes.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const filtered=zlib.inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  let offset=0;
  for(let y=0;y<height;y++) {
    const filter=filtered[offset++];
    for(let x=0;x<stride;x++) {
      const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,corner):NaN;
      assert.ok(Number.isFinite(predictor),'PNG filter is valid');pixels[y*stride+x]=(filtered[offset++]+predictor)&255;
    }
  }
  return {width,height,channels,pixels};
}
function navigationPixels(png,rects,viewport) {
  const raster=pngRgb(png),scale=raster.width/viewport.width;
  const count=rect=>{
    let total=0;
    for(let y=Math.max(0,Math.floor(rect.y*scale));y<Math.min(raster.height,Math.ceil((rect.y+rect.height)*scale));y++)
      for(let x=Math.max(0,Math.floor(rect.x*scale));x<Math.min(raster.width,Math.ceil((rect.x+rect.width)*scale));x++) {
        const index=(y*raster.width+x)*raster.channels;
        if(raster.pixels[index]+raster.pixels[index+1]+raster.pixels[index+2]>420)total++;
      }
    return total;
  };
  return rects.map(item=>({label:item.label,iconBrightPixels:count(item.icon),labelBrightPixels:count(item.text)}));
}
function sourceSnapshot() {
  const raw = fs.readFileSync(path.join(ROOT, "assets/data/current.json"));
  return { data: JSON.parse(raw), sha256: sha256(raw), bytes: raw.length };
}
function historySnapshot(data) {
  assert.ok(data.playerHistory?.path, "Current data identifies the verified player-history bundle");
  const file = path.resolve(ROOT, data.playerHistory.path);
  assert.ok(file.startsWith(path.join(ROOT, "assets", "data") + path.sep), "History file stays in the local data directory");
  const raw = fs.readFileSync(file), history = JSON.parse(raw);
  assert.equal(sha256(raw), data.playerHistory.sha256, "History bytes match the current snapshot checksum");
  assert.deepEqual(history.currentSourceHashes, data.playerHistory.currentSourceHashes, "History and current statistics use identical source versions");
  assert.equal(history.season, data.season); assert.equal(history.scope, "REG");
  return { data: history, sha256: sha256(raw), bytes: raw.length, path: data.playerHistory.path };
}
const researchNumber = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
async function historyReady(page) {
  await page.waitForFunction(() => document.querySelector('.player-detail:not([hidden])')?.dataset.playerHistoryState === 'ready');
}
async function gameValues(page, player, history, expectedIds) {
  const records = history.players[player.id];
  const ids = await page.locator('.player-detail:not([hidden]) [data-game-id]').evaluateAll(games => games.map(game => game.dataset.gameId));
  assert.deepEqual(ids, expectedIds.slice(0,5), `${player.name}: personal game IDs, order and unpadded count match verified history`);
  let fields = 0;
  for (const id of ids) {
    const source = records.games[id];
    assert.equal(source.playerId, player.id, "History joins by player GSIS identity");
    assert.equal(source.seasonType, "REG"); assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
    const card = page.locator(`.player-detail:not([hidden]) [data-game-id="${id}"]`);
    await card.evaluate(element => { element.open = true; for (const details of element.querySelectorAll('details')) details.open = true; });
    const actual = await card.evaluate(element => ({
      metadata: element.querySelector('.game-meta').textContent,
      club: element.querySelector('.game-line strong').textContent,
      categories: [...element.querySelectorAll('[data-history-category]')].map(group => group.dataset.historyCategory),
      values: [...element.querySelectorAll('[data-stat-key]')].map(cell => ({key:cell.dataset.statKey,value:cell.querySelector('b').textContent.trim()})),
      provenance: [...element.querySelectorAll('.game-full-stats .source-note')].map(note=>note.textContent).join(' '),
      clipped: [...element.querySelectorAll('.game-stat b,.game-quick-stats b')].filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent)
    }));
    for (const category of ["Passing", "Rushing", "Receiving"]) assert.ok(actual.categories.includes(category), `${player.name} ${id}: full ${category} breakdown`);
    const primary={QB:'Passing',RB:'Rushing',WR:'Receiving',TE:'Receiving',DEF:'Defense',K:'Special teams'}[player.filterGroup] || 'Passing';
    assert.equal(actual.categories[0],primary,`${player.name}: full game statistics prioritize the player's position`);
    assert.ok(actual.metadata.includes(String(source.season)) && actual.metadata.includes(`Week ${source.week}`), "Every personal game carries its original season and week");
    assert.ok(actual.club.includes(source.team) && actual.club.includes(source.opponent), "Prior-club identity and real opponent stay visible");
    assert.match(actual.provenance, /Retrieved/); assert.ok(actual.provenance.includes(source.team), "Per-game provenance identifies the original club");
    assert.deepEqual(actual.clipped, [], `${player.name} ${id}: game statistic values are not clipped`);
    for (const value of actual.values) {
      const isList = Object.hasOwn(source.rawLists || {},value.key);
      const expected = Object.hasOwn(source.stats, value.key) ? source.stats[value.key] : isList ? source.rawLists[value.key] : source.rawStats[value.key];
      assert.ok(Object.hasOwn(source.stats, value.key) || Object.hasOwn(source.rawStats, value.key) || isList, `Every displayed statistic has a source field: ${value.key}`);
      const formatted = isList ? Array.isArray(expected) ? expected.join(', ') : expected === null || expected === undefined || expected === '' ? '—' : String(expected) : researchNumber(expected);
      assert.equal(value.value, formatted, `${player.name} ${id} ${value.key}: exact source value, including unavailable versus zero`);
      fields++;
    }
    await card.evaluate(element => { for (const details of element.querySelectorAll('details')) details.open = false; element.open = false; });
  }
  return { games: ids.length, comparedFields: fields, gameIds: ids };
}
async function selectedFixtureCheck(page, data, week) {
  if(await page.locator('.page.active').getAttribute('data-page')!=='nfl') await page.locator('.page.active [data-open="nfl"]').first().click();
  await active(page,"nfl");
  await page.locator('#week-select').selectOption(String(week));
  const fixture = data.weeks[week].fixture;
  await page.locator(fixture ? '#featured-matchup [data-nfl-action="matchup"]' : '.page.active [data-nfl-action="matchups"]').click();
  await active(page,"nfl");
  assert.equal(await page.locator('#nfl-inline-preview').isVisible(),true,'NFL matchup responds inline without opening a destination');
  await page.locator('[data-nfl-action="close-preview"]').click();
  // The approved dashboard intentionally keeps destination buttons on Page 2.
  // Exercise the preserved Page 3 separately through its existing direct URL.
  await page.evaluate(()=>{location.hash='steelers';});
  await active(page,"steelers");
  await page.locator('[data-team-tab="matchups"]').click();
  assert.equal(await page.locator('#team-panel-matchups').isVisible(), true);
  const text = await page.locator('#team-matchup').innerText();
  if (!fixture) {
    assert.match(text, /No Steelers fixture/); assert.ok(text.includes(`Week ${week}`), "A bye retains selected week instead of silently opening another matchup");
    return { week, opponent:null, explicitBye:true };
  }
  const opponent = fixture.home_team === 'PIT' ? fixture.away_team : fixture.home_team;
  assert.ok(text.includes(`WK ${week}`) && text.includes(String(data.season)), "Selected fixture season/week agrees with destination matchup");
  const name = data.teamNames?.[opponent] || data.teams.find(team => team.abbr === opponent)?.name || opponent;
  assert.ok(text.includes(name), `Selected fixture opens ${opponent}, not a different weekly opponent`);
  return { week, opponent, fixtureMatchesDestination:true };
}
async function detailedHistoryCheck(page, data, history, viewport) {
  const fixture = data.weeks[data.currentWeek]?.fixture;
  const opponent = fixture ? fixture.home_team === 'PIT' ? fixture.away_team : fixture.home_team : null;
  await page.locator('.page.active [data-open="nfl"]').first().click(); await active(page,"nfl");
  await page.locator('#week-select').selectOption(String(data.currentWeek));
  await page.evaluate(()=>{location.hash='steelers';}); await active(page,"steelers");
  await page.locator('[data-team-tab="roster"]').click();
  const players = data.roster.filter(player => player.featured).slice(0,viewport.width === 393 ? 5 : 1);
  if (viewport.width === 393) for (const group of ['DEF','K']) {
    const player = data.roster.find(value=>value.filterGroup===group && history.players[value.id]?.last5.length);
    if (player) players.push(player);
  }
  const results = [];
  for (const player of players) {
    if (!player.featured) await page.locator(`[data-filter="${player.filterGroup}"]`).click();
    await page.locator(`[data-player="${player.id}"]`).click(); await historyReady(page);
    const source = history.players[player.id];
    await page.locator('.player-detail:not([hidden]) [data-history-mode="recent"]').click();
    const recent = await gameValues(page,player,history,source.last5);
    await page.locator('.player-detail:not([hidden]) [data-history-mode="opponent"]').click();
    const ids = opponent ? source.byOpponent[opponent]?.gameIds || [] : [];
    const against = await gameValues(page,player,history,ids);
    assert.ok(ids.every(id => source.games[id].opponent === opponent), "Personal opponent history never substitutes team meetings or another opponent");
    results.push({player:player.name,playerId:player.id,opponent,recent,against,priorClubs: [...new Set(ids.map(id=>source.games[id].team))]});
    await page.locator(`[data-player="${player.id}"]`).click();
    assert.equal(await page.locator(`[data-player="${player.id}"]`).getAttribute('aria-expanded'),'false');
    assert.match(await page.locator(`[data-player="${player.id}"]`).getAttribute('aria-label'), /^Show /, "Collapsed research control has the correct accessible label");
  }
  const missing = viewport.width === 393 ? data.roster.find(player=>history.players[player.id]?.last5.length===0) : null;
  if (missing) {
    await page.locator(`[data-filter="${missing.filterGroup}"]`).click();
    await page.locator(`[data-player="${missing.id}"]`).click(); await historyReady(page);
    await page.locator('.player-detail:not([hidden]) [data-history-mode="recent"]').click();
    assert.equal(await page.locator('.player-detail:not([hidden]) [data-game-id]').count(),0,'Missing personal statistics are not padded with invented appearances or zero games');
    assert.match(await page.locator('.player-detail:not([hidden]) .player-history-content').innerText(),/No verified statistics rows/);
  }
  await page.locator('[data-filter="ALL"]').click();
  const first = data.roster.find(player => player.featured);
  await page.locator(`[data-player="${first.id}"]`).click(); await historyReady(page);
  await page.locator('.player-detail:not([hidden]) [data-history-mode="opponent"]').click();
  const bye = Object.entries(data.weeks).find(([,value]) => !value.fixture)?.[0];
  if (bye) {
    await page.locator('[data-history-week]').selectOption(bye);
    assert.match(await page.locator('.player-detail:not([hidden]) .player-history-content').innerText(), /bye|no verified Steelers opponent/i);
    assert.equal(await page.locator('.player-detail:not([hidden]) [data-game-id]').count(),0,"Bye research cannot show another weekly opponent's games");
    await page.locator('[data-history-week]').selectOption(String(data.currentWeek));
  }
  await page.locator('.player-detail:not([hidden]) [data-history-mode="recent"]').click();
  await page.locator(`[data-player="${first.id}"]`).click();
  await resetScroll(page);
  return {status:'passed',players:results,byeOpponentHistoryExplicit:!!bye,missingHistoryExplicit:missing?.id||null};
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
      homeSport: document.querySelector('.page.active[data-page="home"]')?.dataset.homeSport,
    };
  });
  assert.ok(value.width <= value.clientWidth + 1, `${label}: horizontal content overflow ${JSON.stringify(value)}`);
  assert.ok(value.documentWidth <= value.viewportWidth + 1, `${label}: document horizontal overflow`);
  assert.ok(value.navBottom <= value.viewportHeight + 1, `${label}: bottom navigation outside viewport`);
  assert.deepEqual(value.clipped, [], `${label}: internally clipped player/table text`);
  assert.deepEqual(value.navigation.map((item) => item.label), ["Home", value.homeSport === "ufc" ? "Fighters" : "Teams", "Matchups", "Insights", "More"], `${label}: complete navigation labels`);
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
    const selector = { home: ".aperture-stage, .home-entry, .home-sport-option", nfl: ".league-header", steelers: ".player-card" }[screen];
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
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const png = await page.screenshot({ path: path.join(outputDir, file) });
  const rasterRects=await page.locator('.page.active .bottom-nav button').evaluateAll(buttons=>buttons.map(button=>{
    const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    return{label:button.querySelector('span').textContent.trim(),icon:rect(button.querySelector('svg')),text:rect(button.querySelector('span'))};
  }));
  const navigationRaster=navigationPixels(png,rasterRects,viewport);
  if(label!=='sources')for(const item of navigationRaster)
    assert.ok(item.iconBrightPixels>15 && item.labelBrightPixels>15,`${label}: actual PNG contains every painted navigation icon and label ${JSON.stringify(item)}`);
  // Screenshot consistency does not alter the actual shipped motion behavior.
  await page.evaluate(() => {
    for (const a of window.__PD_QA_PAUSED || []) a.play();
    delete window.__PD_QA_PAUSED;
  });
  return { file, capturedAt, sha256: sha256(png), bytes: png.length, viewportCssPixels: viewport, geometry, primaryBounds, navigationRaster };
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
  const current = data.roster.filter((p) => {
    const evidence = p.rosterVerification;
    const corroboratedDeparture = evidence?.officialCurrentMembership === false && evidence.espnCurrentMembership === false && evidence.reportedOtherTeam?.abbr && evidence.reportedOtherTeam.abbr !== 'PIT';
    return p.status !== "cut" && p.status !== "released" && !p.cut && !corroboratedDeparture;
  });
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
    const sourceNumber = player.rosterVerification?.officialNumber ?? player.number;
    assert.equal(card.name, player.name); assert.equal(card.number, `#${sourceNumber === null || sourceNumber === undefined || sourceNumber === '' ? "—" : sourceNumber}`);
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
    const sorted=[...expected].sort((a,b)=>Number(b.pct)-Number(a.pct) || Number(b.pointDifferential)-Number(a.pointDifferential) || a.abbr.localeCompare(b.abbr));
    assert.equal(row[0],String(sorted.indexOf(team)+1),'Row number is sorted record order, not official playoff seeding');
    assert.equal(row[2], String(team.w));
    assert.equal(row[3], String(team.l) + (team.ties ? `+${team.ties}T` : ""));
    assert.equal(row[4],team.pct);
    assert.equal(row[5],String(team.pointsFor)); assert.equal(row[6],String(team.pointsAgainst));
    assert.equal(row[7],`${team.pointDifferential>0?'+':''}${team.pointDifferential}`);
    const games=[...new Map(Object.values(data.weeks).flatMap(w=>w.recap||[]).filter(g=>g.status==='final' && g.season===data.season && g.week<=data.weeks[week].throughWeek).map(g=>[g.id,g])).values()].filter(g=>g.home_team===team.abbr || g.away_team===team.abbr).sort((a,b)=>Number(a.week)-Number(b.week)||String(a.gameday).localeCompare(String(b.gameday))||a.id.localeCompare(b.id));
    const form=games.map(g=>{const own=g.home_team===team.abbr?g.home_score:g.away_score,other=g.home_team===team.abbr?g.away_score:g.home_score;return own>other?'W':own<other?'L':'T';}).slice(-4).join('');
    assert.equal(row[8],form||'—','Form matches retained verified final scores');
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
async function testViewport(browser, { base, outputDir, viewport, data, history = historySnapshot(data).data, strictOffline = true }) {
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
    assert.equal(await page.locator("[data-home-select] img").count(), 4);
    assert.equal(await page.locator('.page[data-page="home"] .home-league, .page[data-page="home"] [data-home-title]').count(),0,'Removed duplicate league heading/subtitle stays absent');
    assert.equal(await page.locator('.page[data-page="home"] .brand-subtitle').count(),1,'One brand research subtitle remains');
    assert.match(await page.locator('.page[data-page="home"] .brand-subtitle').innerText(),/^SPORTS DATA & RESEARCH$/);
    captures.home = await capture(page, "home", viewport, outputDir);
    images.home = await imageQuality(page);
    for (const sport of ['nba','nrl','ufc']) {
      await page.locator(`[data-home-select="${sport}"]`).click();
      assert.equal(await page.locator('.page.active').getAttribute('data-page'),'home','Coming-soon sport never opens a fake destination');
      assert.equal(await page.locator('.page.active').getAttribute('data-home-sport'), sport, 'Every sport selector changes the Home environment');
      assert.match(await page.locator('[data-home-league-logo]').getAttribute('alt'),new RegExp(`^${sport}\\b`,'i'),'Hero logo retains the correct selected-league description');
      assert.equal(await page.locator('[data-home-entry]').isDisabled(), true, 'Coming-soon entry is explicitly disabled');
      assert.match(await page.locator('[data-home-entry-label]').innerText(), new RegExp(`${sport}.*COMING SOON`, 'i'));
      assert.match(await page.locator('.home-availability').innerText(),new RegExp(`${sport}.*coming soon`,'i'),'Every sport tile gives meaningful availability feedback');
      assert.equal(await page.locator('.home-availability').getAttribute('role'),'status','Availability feedback is announced accessibly');
      assert.equal(await page.locator('[data-home-teams-label]').innerText(), sport === 'ufc' ? 'Fighters' : 'Teams');
      assert.doesNotMatch(await page.locator('.page.active').innerText(), /preview only/i, 'Removed preview-only copy never returns');
      await layout(page, `home-${sport}`);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.home-availability').evaluate(element=>element.classList.contains('is-visible')),false,'Escape dismisses sport availability feedback');
    await page.locator('[data-home-select="nfl"]').click();
    assert.equal(await page.locator('[data-home-entry]').isDisabled(), false, 'NFL entry becomes available again');
    await page.locator("[data-home-entry]").click(); await active(page, "nfl");
    assert.equal(await page.locator(".stand-row:visible").count(), 5, "Default dashboard preserves five selected-team density");
    assert.equal(await page.locator(".leader-row:visible").count(),15,'Five verified QB, RB and WR leaders are visible');
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
    await page.locator(".steelers-row button").click(); await active(page,"nfl");
    assert.equal(await page.locator('.steelers-row button').getAttribute('aria-expanded'),'false','Team selection collapses the inline summary without leaving NFL');
    await page.locator(".steelers-row button").click();
    assert.equal(await page.locator('.steelers-row button').getAttribute('aria-expanded'),'true');
    await page.evaluate(()=>{location.hash='steelers';}); await active(page,"steelers");
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
    for (const player of data.roster.filter(player => player.rosterVerification?.reportedOtherTeam?.abbr && player.rosterVerification.officialCurrentMembership === false && player.rosterVerification.espnCurrentMembership === false)) {
      assert.equal(await page.locator(`[data-player-id="${player.id}"]`).count(),0,`${player.name}: corroborated departure cannot appear as a current Steelers player`);
      assert.ok(history.players[player.id],`${player.name}: original legitimate historical statistics are retained`);
    }
    const membershipDispute = data.roster.find(player => player.rosterVerification?.officialCurrentMembership === false && player.rosterVerification.espnCurrentMembership === true);
    if (membershipDispute) {
      const card = page.locator(`[data-player-id="${membershipDispute.id}"]`);
      await card.locator('[data-player]').click();
      assert.match(await card.locator('[data-roster-disagreement]').innerText(),/Roster sources differ/);
      assert.match(await card.locator('.player-info').innerText(),/Roster disputed/);
      await layout(page,'roster-disagreement');
      await card.locator('[data-player]').click();
    }
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
    await historyReady(page);
    captures["steelers-player-details"] = await capture(page, "steelers-player-details", viewport, outputDir);
    const expandedPerimeter = await motionCheck(page);
    const expandedTrack = expandedPerimeter.filter((card) => card.expanded);
    assert.equal(expandedTrack.length, 1, "Exactly one expanded research card");
    assert.equal(expandedTrack[0].expandedResearchVisibleCount, 1, "Research lives inside the complete animated card");
    assert.ok(expandedTrack[0].height > cardBoxes[0].height + 100, "Football perimeter grows to encompass expanded metrics and game history");
    await page.locator('.player-detail:not([hidden]) [data-history-mode="opponent"]').click();
    captures['steelers-opponent-history'] = await capture(page,'steelers-opponent-history',viewport,outputDir);
    const firstGame = page.locator('.player-detail:not([hidden]) .game-breakdown').first();
    if (await firstGame.count()) {
      await firstGame.locator('summary').first().click();
      await page.locator('.page.active .page-scroll').evaluate(scroll=>{
        const full = scroll.querySelector('.game-breakdown[open] .game-full-stats');
        scroll.scrollTop += full.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 14;
      });
      captures['steelers-game-statistics'] = await capture(page,'steelers-game-statistics',viewport,outputDir,false);
      await motionCheck(page);
      await firstGame.evaluate(element=>{element.open=false;});
    }
    await page.locator('.player-detail:not([hidden]) [data-history-mode="recent"]').click();
    await resetScroll(page);
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
    for (const week of await page.locator("[data-week]:visible").evaluateAll((bs) => bs.map((b)=>b.dataset.week))) {
      await page.locator(`[data-week="${week}"]:visible`).click();
      assert.equal(await page.locator("#week-select").inputValue(), week);
    }
    for (const tab of ["players", "recap", "ladder"]) {
      await page.locator(`[data-nfl-tab="${tab}"]`).click();
      assert.equal(await page.locator(`#panel-${tab}`).isVisible(), true);
      if (tab !== "ladder") captures[`nfl-${tab}`] = await capture(page, `nfl-${tab}`, viewport, outputDir);
      await layout(page, `nfl-${tab}`);
    }
    const selectedFixtures = [];
    const fixtureWeeks = ["1", Object.entries(data.weeks).find(([,snapshot])=>!snapshot.fixture)?.[0]].filter(Boolean);
    for (const week of fixtureWeeks) selectedFixtures.push(await selectedFixtureCheck(page,data,week));
    const playerHistory = await detailedHistoryCheck(page,data,history,viewport);
    await layout(page,'detailed-player-history');
    await page.locator('.page.active [data-open="nfl"]').first().click(); await active(page,'nfl');
    await page.locator('[data-nfl-tab="ladder"]').focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('[data-nfl-tab="players"]').getAttribute("aria-selected"), "true");
    for(const action of ['matchups','insights','more']) {
      await page.locator(`.page.active [data-nfl-action="${action}"]`).click();
      await active(page,'nfl');
      assert.equal(await page.locator('#nfl-inline-preview').isVisible(),true,`${action}: dashboard responds inline`);
      await page.locator('[data-nfl-action="close-preview"]').click();
      assert.equal(await page.locator('#nfl-inline-preview').isVisible(),false);
    }
    const sourceButton = page.locator(".page.active [data-sources]:visible").first();
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
    return { viewport, deviceScaleFactor: 2, status: "passed", externalRequests: external.length, consoleErrors: errors.length, httpErrors: responses.length, failedRequests: transportFailures.length, cancelledRequests: failedRequests.filter((r) => r.failure === "net::ERR_ABORTED"), dataset, captures, images, perimeter, expandedPerimeter, selectedFixtures, playerHistory, performance, checks: ["three-page navigation and history", "direct subpath hash loading and refresh", "current committed JSON loaded exactly", "five selected teams and sixteen per conference", "all available sourced week controls", "selected historical fixture and bye retain exact opponent context", "all implemented complete-roster position filters", "full roster expansion and bottom scrolling", "personal recent and selected-opponent game histories match GSIS/source rows", "full passing/rushing/receiving and additional source statistics", "prior-club identity and unpadded history counts", "inline player research expansion", "all NFL/team tabs and keyboard navigation", "bottom shortcuts and source dialog", "all four outer card edges and synchronized travelling border light", "expanded player research inside resized complete-card perimeter", "all five visible navigation labels/icons and 44px touch targets", "primary mobile default cards fully above navigation", "reduced-motion compliance", "Retina source density and correct image fitting", "no horizontal overflow or internal card text clipping", "offline assets and zero HTTP/transport/console/JavaScript failures"] };
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
async function historyFailureRecovery(browser, base, data) {
  const results = [], endpoint = '**/' + data.playerHistory.path;
  const history = historySnapshot(data).data;
  for (const failure of ['checksum','timeout']) {
    const context = await browser.newContext({viewport:VIEWPORTS[0],timezoneId:'Australia/Sydney'});
    // Exercise the real AbortController path without making QA wait twenty seconds.
    if (failure === 'timeout') await context.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (callback,ms,...args) => original(callback,ms === 20000 ? 1000 : ms,...args);
    });
    const page = await context.newPage(); let historyRequests = 0;
    page.on('request',request => { if (request.url().includes(data.playerHistory.path)) historyRequests++; });
    try {
      await page.route(endpoint,route => failure === 'checksum'
        ? route.fulfill({status:200,contentType:'application/json',body:'{"schemaVersion":1,"corrupt":true}'})
        : undefined);
      await page.goto(base+'#steelers',{waitUntil:'networkidle'}); await ready(page);
      assert.equal(historyRequests,0,'Career history is lazy and does not burden initial sport/dashboard load');
      const player = data.roster.find(value=>value.featured);
      await page.locator(`[data-player="${player.id}"]`).click();
      await page.waitForFunction(()=>document.querySelector('.player-detail:not([hidden])')?.dataset.playerHistoryState === 'error');
      assert.equal(await page.locator('.player-card').count(),5,'History failure retains the real roster');
      assert.equal(await page.locator('.player-detail:not([hidden]) [data-game-id]').count(),0,'Unverified history bytes are never displayed');
      await page.locator('.season-overview summary').click();
      assert.equal(await page.locator('[data-season-category="Passing"]').isVisible(),true,'Current verified season statistics survive history failure');
      await page.unroute(endpoint);
      await page.locator('[data-history-retry]').click(); await historyReady(page);
      assert.equal(await page.locator('.player-detail:not([hidden]) [data-game-id]').count(),Math.min(5,history.players[player.id].last5.length));
      assert.equal(await page.locator('.season-overview').getAttribute('open'),'','Retry preserves expanded season statistics');
      results.push({failure,status:'passed',historyRequests,initialLoadLazy:true,unverifiedRowsShown:false,seasonRetained:true,retryRecovered:true,testTimeoutMs:failure==='timeout'?1000:undefined});
    } finally { await context.close(); }
  }
  return {status:'passed',results};
}
async function updatePreservation(browser, base, data) {
  const context = await browser.newContext({viewport:VIEWPORTS[0],timezoneId:'Australia/Sydney'}), page = await context.newPage();
  const endpoint = '**/assets/data/current.json';
  const uiState = () => ({
    page:document.querySelector('.page.active').dataset.page,
    week:document.querySelector('#week-select').value,
    conference:document.querySelector('[data-conference][aria-pressed="true"]')?.dataset.conference,
    nflTab:document.querySelector('[data-nfl-tab][aria-selected="true"]')?.dataset.nflTab,
    teamTab:document.querySelector('[data-team-tab][aria-selected="true"]')?.dataset.teamTab,
    filter:document.querySelector('[data-filter][aria-pressed="true"]')?.dataset.filter,
    rosterExpanded:document.querySelector('[data-roster-toggle]').getAttribute('aria-expanded'),
    standingsExpanded:document.querySelector('[data-standings-toggle]').getAttribute('aria-expanded'),
    openPlayer:document.querySelector('[data-player][aria-expanded="true"]')?.dataset.player,
    historyMode:document.querySelector('.player-detail:not([hidden]) [data-history-mode][aria-pressed="true"]')?.dataset.historyMode,
    seasonOpen:[...document.querySelectorAll('.season-overview[open]')].map(element=>element.dataset.seasonPlayer),
    gameOpen:[...document.querySelectorAll('.game-breakdown[open]')].map(element=>element.dataset.gameId),
    scrolls:[...document.querySelectorAll('.page-scroll')].map(element=>element.scrollTop)
  });
  try {
    await page.goto(base+'#nfl',{waitUntil:'networkidle'}); await ready(page);
    await page.locator('#week-select').selectOption('1');
    await page.locator('[data-conference="NFC"]').click(); await page.locator('[data-standings-toggle]').click();
    await page.locator('[data-nfl-tab="players"]').click();
    await page.evaluate(()=>{location.hash='steelers';}); await active(page,'steelers');
    await page.locator('[data-team-tab="roster"]').click();
    await page.locator('[data-roster-toggle]').click(); await page.locator('[data-filter="QB"]').click();
    const player = data.roster.find(value=>value.featured && value.position==='QB');
    await page.locator(`[data-player="${player.id}"]`).click(); await historyReady(page);
    await page.locator('[data-history-mode="opponent"]').click();
    await page.locator('.season-overview summary').click();
    await page.locator('.game-breakdown').first().evaluate(element=>{element.open=true;});
    await page.waitForTimeout(50);
    await page.locator('.page.active .page-scroll').evaluate(element=>{element.scrollTop=500;});
    const before = await page.evaluate(uiState), baseline = await page.evaluate(()=>window.PD_DATA);
    await page.route(endpoint,route=>route.fulfill({status:503,contentType:'application/json',body:'{"unavailable":true}'}));
    const failed = await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
    assert.equal(failed.state,'error'); assert.deepEqual(await page.evaluate(()=>window.PD_DATA),baseline,'A failed update preserves the entire last verified snapshot');
    assert.deepEqual(await page.evaluate(uiState),before,'A failed update preserves all control selections, expanded research and scroll');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.dataReady),'true','Retained data stays readable rather than switching to initial-load failure');
    assert.match(await page.locator('#data-status').innerText(),/Retained verified data/);
    await page.unroute(endpoint);
    // This isolated transport fixture changes retrieval metadata only. It never
    // writes product data or takes screenshots containing invented statistics.
    const newer = structuredClone(data); newer.retrievedAt = new Date(Date.parse(data.retrievedAt)+1000).toISOString();
    await page.route(endpoint,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(newer)}));
    const updated = await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
    assert.equal(updated.state,'updated'); assert.equal(updated.changed,true);
    assert.deepEqual(await page.evaluate(()=>window.PD_DATA),newer,'A complete validated newer snapshot replaces the baseline atomically');
    const after = await page.evaluate(uiState);
    assert.deepEqual({...after,scrolls:[]},{...before,scrolls:[]},'Verified update preserves selected week/conference/filter/tabs and all expanded history state');
    for (let i=0;i<before.scrolls.length;i++) assert.ok(Math.abs(before.scrolls[i]-after.scrolls[i])<=2,'Verified update preserves reader scroll position');
    await page.unroute(endpoint);
    const older = structuredClone(data); older.retrievedAt = new Date(Date.parse(data.retrievedAt)-1000).toISOString();
    await page.route(endpoint,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(older)}));
    const rejected = await page.evaluate(()=>PDDataUpdates.refresh('manual',{force:true}));
    assert.equal(rejected.state,'error'); assert.deepEqual(await page.evaluate(()=>window.PD_DATA),newer,'An older CDN response never rolls back newer verified data');
    await page.unroute(endpoint);
    let eventChecks = 0;
    await page.route(endpoint,route=>{eventChecks++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(newer)});});
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>PDDataUpdates.getStatus().reason==='online' && PDDataUpdates.getStatus().state==='unchanged');
    assert.equal(eventChecks,1,'Reconnection immediately revalidates the published feed');
    return {status:'passed',failedRefreshRetainsFullSnapshot:true,newerSnapshotAcceptedAtomically:true,olderSnapshotRejected:true,reconnectEventChecks:eventChecks,allSelectionsAndExpandedResearchPreserved:true,scrollPreserved:true,fixtureNote:'Isolated network fixtures changed retrieval metadata only; no test snapshot or screenshots were published'};
  } finally { await context.close(); }
}
async function runQA({ base, outputDir = __dirname, mode = "Local HTTP under /project-dollers/; external requests blocked", viewports = VIEWPORTS, browser }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const source = sourceSnapshot();
  const history = historySnapshot(source.data);
  const startedAt = new Date().toISOString();
  const runtimeFiles = ["index.html", "assets/app.js", "assets/styles.css", "assets/refinements.css", "assets/premium.css", "assets/motion.css", "assets/motion.js", "assets/data-updates.js", "assets/player-research.js", "assets/player-research.css", "assets/home-premium.css", "assets/home-interactions.js", "assets/home-gate-motion.css", "assets/home-gate-motion.js", "assets/home/gate-brand.webp", "assets/home/gate-scenes-nfl.webp", "assets/home/gate-scenes-nba.webp", "assets/home/gate-scenes-nrl.webp", "assets/home/gate-scenes-ufc.webp", "assets/home/nfl.svg", "assets/home/nba.svg", "assets/illumination.css", "assets/data/current.json", "assets/data/player-history.json"];
  runtimeFiles.push('assets/nfl-dashboard.css','assets/nfl-dashboard.js','assets/nfl-dashboard-motion.css','assets/nfl-dashboard-motion.js',...fs.readdirSync(path.join(ROOT,'assets/nfl-dashboard')).map(file=>`assets/nfl-dashboard/${file}`));
  const runtimeManifest = Object.fromEntries(runtimeFiles.map((file) => [file, sha256(fs.readFileSync(path.join(ROOT, file)))]));
  const report = { runtimeManifest, testScriptSha256: sha256(fs.readFileSync(__filename)), worktreeStatus: execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean), startedAt, browser: await browser.version(), mode, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), source: { path: "assets/data/current.json", sha256: source.sha256, bytes: source.bytes }, results: [] };
  try {
    for (const viewport of viewports) {
      report.results.push(await testViewport(browser, { base, outputDir, viewport, data: source.data, history:history.data }));
      console.log(`PASS ${viewport.width}x${viewport.height} at 2x: sourced data, interactions, full card motion, images, layout.`);
    }
    report.feedUnavailableRecovery = await unavailableFeedRecovery(browser, base);
    report.historySource = {path:history.path,sha256:history.sha256,bytes:history.bytes};
    report.historyFailureRecovery = await historyFailureRecovery(browser,base,source.data);
    report.updatePreservation = await updatePreservation(browser,base,source.data);
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
  const outputIndex=process.argv.indexOf('--output');
  const outputDir=path.resolve(outputIndex>=0?process.argv[outputIndex+1]:process.env.PD_QA_OUTPUT||path.join(__dirname,'home-neon','legacy-chromium'));
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
    browser = await launchChromium(); await runQA({ base, browser, outputDir });
    // Use installed WebKit if present, without downloading a browser during QA.
    const wkPath = webkit.executablePath();
    if (fs.existsSync(wkPath)) {
      const safari = await webkit.launch({ headless: true });
      try { await runQA({ base, browser: safari, viewports: VIEWPORTS.slice(0,2), outputDir: path.join(path.dirname(outputDir), "legacy-webkit"), mode: "Installed Playwright WebKit; local HTTP and external requests blocked" }); }
      finally { await safari.close(); }
    } else console.log("WebKit not installed; physical iPhone/Safari remains unverified.");
  } finally {
    if (browser) await browser.close(); server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  }
}
module.exports = { ROOT, VIEWPORTS, sourceSnapshot, historySnapshot, runQA, launchChromium, testViewport, detailedHistoryCheck, selectedFixtureCheck, historyFailureRecovery, updatePreservation };
if (require.main === module) runLocal().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
