"use strict";
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = 8765;
const base = `http://127.0.0.1:${port}/project-dollers/`;
const results = [];
const server = spawn(
  "python3",
  [
    "-u",
    "-m",
    "http.server",
    String(port),
    "--bind",
    "127.0.0.1",
    "--directory",
    path.dirname(root),
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk;
});
async function readiness() {
  for (let n = 0; n < 50; n++) {
    if (server.exitCode !== null)
      throw new Error(`QA server failed: ${serverError}`);
    try {
      const r = await fetch(base);
      if (r.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`QA server did not become ready: ${serverError}`);
}
async function active(page, expected) {
  assert.equal(
    await page.locator(".page.active").getAttribute("data-page"),
    expected,
  );
  assert.equal(await page.locator(".page:visible").count(), 1);
  // Measure settled layouts rather than transient fractional transition bounds.
  await page.evaluate(() => {
    document
      .querySelector(".page.active")
      .getAnimations()
      .forEach((animation) => animation.finish());
  });
}
async function capture(page, name, width) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    );
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 2000;
    }
  });
  const scroll = page.locator(".page.active .page-scroll");
  const geometry = await scroll.evaluate((e) => ({
    width: e.scrollWidth,
    clientWidth: e.clientWidth,
    height: e.scrollHeight,
    clientHeight: e.clientHeight,
  }));
  assert.equal(
    geometry.width,
    geometry.clientWidth,
    `${name}: horizontal scroll`,
  );
  assert.ok(
    geometry.height <= geometry.clientHeight + 1,
    `${name}: default content clipped (${geometry.height}/${geometry.clientHeight})`,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: path.join(__dirname, `${name}-${width}.png`) });
  return geometry;
}
(async () => {
  let browser;
  try {
    await readiness();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
      args: ["--no-sandbox"],
      headless: true,
    });
    for (const [width, height] of [
      [393, 852],
      [430, 896],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const external = [],
        errors = [],
        responses = [],
        geometry = {};
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          responses.push({ url: response.url(), status: response.status() });
      });
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin) return route.continue();
        external.push(url.href);
        return route.abort();
      });
      await page.goto(base + "#home", { waitUntil: "networkidle" });
      await active(page, "home");
      assert.equal(await page.locator(".sport-card img").count(), 4);
      assert.equal(
        await page.locator(".page").count(),
        3,
        "Only Pages 1–3 are in scope",
      );
      geometry.home = await capture(page, "home", width);
      await page.locator(".nfl-card").click();
      await active(page, "nfl");
      assert.equal(await page.locator(".stand-row").count(), 5);
      assert.equal(await page.locator(".leader-row:visible").count(), 10);
      const rowBoxes = await page.locator(".stand-row").evaluateAll((rows) =>
        rows.map((row) => {
          const r = row.getBoundingClientRect();
          return { x: r.x, width: r.width, height: r.height };
        }),
      );
      assert.ok(
        rowBoxes.every(
          (r) =>
            r.x === rowBoxes[0].x &&
            r.width === rowBoxes[0].width &&
            r.height === rowBoxes[0].height,
        ),
        "Standings rows must align",
      );
      assert.match(
        await page.locator(".steelers-row").innerText(),
        /2\s+1\s+0\.667\s+W1/,
      );
      assert.match(
        await page.locator("#featured-matchup").innerText(),
        /Vikings/,
      );
      geometry.nfl = await capture(page, "nfl", width);
      await page.locator(".steelers-row button").click();
      await active(page, "steelers");
      assert.equal(await page.locator(".player-card:visible").count(), 5);
      const cards = await page.locator(".player-card").evaluateAll((cards) =>
        cards.map((card) => {
          const r = card.getBoundingClientRect();
          return { x: r.x, width: r.width, height: r.height };
        }),
      );
      assert.ok(
        cards.every(
          (c) =>
            c.x === cards[0].x &&
            c.width === cards[0].width &&
            c.height === cards[0].height,
        ),
        "Player cards must align",
      );
      assert.match(
        await page.locator(".player-card").first().innerText(),
        /#8\s+Aaron Rodgers[\s\S]*586[\s\S]*65\.1%/,
      );
      geometry.steelers = await capture(page, "steelers", width);
      const edges = await page.evaluate(() => {
        const ball = document.querySelector(".orbit-football");
        const animation = ball.getAnimations()[0];
        const card = ball.parentElement.getBoundingClientRect();
        const edges = new Set();
        for (let i = 0; i < 32; i++) {
          animation.currentTime = (i * 9000) / 32;
          const r = ball.getBoundingClientRect();
          const x = r.x + r.width / 2,
            y = r.y + r.height / 2;
          const distances = {
            left: Math.abs(x - card.left),
            right: Math.abs(x - card.right),
            top: Math.abs(y - card.top),
            bottom: Math.abs(y - card.bottom),
          };
          const [edge, distance] = Object.entries(distances).sort(
            (a, b) => a[1] - b[1],
          )[0];
          if (distance > 9)
            throw new Error(`Football leaves perimeter: ${distance}`);
          edges.add(edge);
        }
        return [...edges].sort();
      });
      assert.deepEqual(edges, ["bottom", "left", "right", "top"]);
      for (const [filter, count] of [
        ["QB", 1],
        ["RB", 1],
        ["WR", 2],
        ["TE", 1],
        ["DEF", 0],
        ["K", 0],
        ["ALL", 5],
      ]) {
        await page.locator(`[data-filter="${filter}"]`).click();
        assert.equal(await page.locator(".player-card:visible").count(), count);
        assert.equal(
          await page.locator("#empty-roster").isVisible(),
          count === 0,
        );
      }
      for (const tab of ["schedule", "stats", "matchups", "roster"]) {
        await page.locator(`[data-team-tab="${tab}"]`).click();
        assert.equal(
          await page.locator(`#team-panel-${tab}`).isVisible(),
          true,
        );
      }
      await page.locator(".team-back").click();
      await active(page, "nfl");
      await page.locator('[data-conference="NFC"]').click();
      assert.match(await page.locator("#standings-rows").innerText(), /Eagles/);
      await page.locator('[data-conference="AFC"]').click();
      await page.locator("#week-select").selectOption("3");
      assert.match(await page.locator(".through-week").innerText(), /WEEK 2/);
      await page.locator('[data-week="5"]').click();
      assert.match(
        await page.locator("#featured-matchup").innerText(),
        /Bye week/,
      );
      await page.locator('[data-week="4"]').click();
      for (const tab of ["players", "recap", "ladder"]) {
        await page.locator(`[data-nfl-tab="${tab}"]`).click();
        assert.equal(await page.locator(`#panel-${tab}`).isVisible(), true);
      }
      await page.locator('[data-nfl-tab="ladder"]').focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page
          .locator('[data-nfl-tab="players"]')
          .getAttribute("aria-selected"),
        "true",
      );
      await page.locator('.page.active [data-shortcut="matchups"]').click();
      assert.equal(await page.locator("#panel-ladder").isVisible(), true);
      await page.locator('.page.active [data-shortcut="insights"]').click();
      assert.equal(await page.locator("#panel-players").isVisible(), true);
      await page.locator(".page.active [data-more]").click();
      assert.equal(await page.locator("#about-dialog").isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#about-dialog").isVisible(), false);
      await page.locator('.page.active [data-open="home"]').click();
      await active(page, "home");
      await page.goBack();
      await active(page, "nfl");
      await page.goForward();
      await active(page, "home");
      for (const name of ["home", "nfl", "steelers"]) {
        await page.goto(base + "#" + name, { waitUntil: "networkidle" });
        await active(page, name);
        await page.reload({ waitUntil: "networkidle" });
        await active(page, name);
      }
      const broken = await page
        .locator("img")
        .evaluateAll((images) =>
          images
            .filter((img) => !img.complete || !img.naturalWidth)
            .map((img) => img.src),
        );
      assert.deepEqual(broken, [], "All bundled images must decode");
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page.locator(".orbit-football").first().isVisible(),
        false,
      );
      assert.deepEqual(
        external,
        [],
        "Runtime must never request external assets",
      );
      assert.deepEqual(errors, [], "No console errors or JS exceptions");
      assert.deepEqual(responses, [], "No HTTP errors");
      results.push({
        viewport: { width, height },
        status: "passed",
        externalRequests: 0,
        consoleErrors: 0,
        httpErrors: 0,
        brokenImages: 0,
        perimeterEdges: edges,
        geometry,
        checks: [
          "three-page navigation",
          "direct hash loads and refresh",
          "history back and forward",
          "AFC/NFC selection",
          "week select and chips",
          "NFL and team tabs",
          "keyboard tab navigation",
          "all seven position filters",
          "bottom navigation and about dialog",
          "standings and roster alignment",
          "all four perimeter edges",
          "reduced motion",
          "local image decoding",
          "offline runtime",
        ],
      });
      await page.close();
    }
    fs.writeFileSync(
      path.join(__dirname, "results.json"),
      JSON.stringify(
        {
          browser: await browser.version(),
          mode: "External network requests blocked",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS: offline functional and visual captures at ${results.map((r) => `${r.viewport.width}x${r.viewport.height}`).join(", ")}. Six screenshots saved in qa/.`,
    );
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
