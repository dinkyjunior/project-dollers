"use strict";
// Targeted live verification for data-only refreshes. Full visual suites remain
// immutable; no application data, source values or screenshots are substituted.
const { webkit } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { ROOT, VIEWPORTS, sourceSnapshot, historySnapshot, selectedFixtureCheck, detailedHistoryCheck } = require("./run.cjs");
const { proxyOptions, redact } = require("./hosted-webkit.cjs");
const base = "https://dinkyjunior.github.io/project-dollers/";
const output = path.join(__dirname, "hosted", "refresh-smoke.json");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const baselineFile = path.join(__dirname, "hosted", "webkit", "results.json");

async function active(page, expected) {
  await page.waitForFunction(id => document.querySelector(".page.active")?.dataset.page === id, expected);
  assert.equal(await page.locator(".page:visible").count(), 1);
}
async function ready(page, data) {
  await page.waitForFunction(() => window.PD_DATA && document.documentElement.dataset.dataReady === "true");
  assert.deepEqual(await page.evaluate(() => window.PD_DATA), data, "Hosted UI loaded the integrated sourced snapshot exactly");
}
async function servedManifest(page, expected) {
  const delivered = await page.evaluate(async paths => {
    const records = [];
    // Bound concurrent audit fetches; these use the genuine browser TLS stack.
    for (let i = 0; i < paths.length; i += 4) {
      records.push(...await Promise.all(paths.slice(i, i + 4).map(async item => {
        const response = await fetch(item, { cache: "no-store" });
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("");
        return { path: item, httpStatus: response.status, sha256: hash, bytes: bytes.byteLength };
      })));
    }
    return records;
  }, Object.keys(expected));
  for (const file of delivered) {
    assert.equal(file.httpStatus, 200, `${file.path}: actual hosted HTTP 200`);
    assert.equal(file.sha256, expected[file.path], `${file.path}: delivered bytes match the integrated worktree`);
  }
  return delivered;
}
async function smoke(browser, viewport, data, history, expected, auditFiles) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "Australia/Sydney" });
  const page = await context.newPage();
  const errors = [], httpErrors = [], failures = [], external = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() }); });
  page.on("requestfailed", request => failures.push({ url: request.url(), failure: request.failure()?.errorText }));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    external.push(url.href); return route.abort();
  });
  try {
    const response = await page.goto(base + "#home", { waitUntil: "networkidle" });
    assert.equal(response.status(), 200); await ready(page, data); await active(page, "home");
    const served = auditFiles ? await servedManifest(page, expected) : undefined;
    await page.locator(".nfl-card").click(); await active(page, "nfl");
    await page.locator("#week-select").selectOption("1");
    await page.locator(".steelers-row").click(); await active(page, "steelers");
    assert.equal(await page.locator("#week-select").inputValue(), "1", "Team entry preserves the selected week");
    const selectedFixture = await selectedFixtureCheck(page, data, "1");
    // The helper's compact branch checks one QB's complete five personal recent
    // and selected-opponent games, all mapped/raw/list fields, prior clubs, bye.
    const research = await detailedHistoryCheck(page, data, history, { width: 430, height: viewport.height });
    assert.equal(research.players.length, 1);
    await page.locator(".page.active [data-sources]").first().click();
    assert.equal(await page.locator("#sources-dialog").isVisible(), true);
    assert.match(await page.locator("#sources-dialog").innerText(), /source|retriev|verified/i);
    await page.keyboard.press("Escape");
    await page.locator(".team-back").click(); await active(page, "nfl");
    await page.locator(".page.active [data-refresh]").click();
    await page.waitForFunction(() => document.querySelector('.page.active [data-refresh]')?.getAttribute('aria-busy') === 'false');
    await ready(page, data);
    await page.locator(".page.active [data-open=home]").click(); await active(page, "home");
    await page.goBack(); await active(page, "nfl");
    await page.goForward(); await active(page, "home");
    for (const destination of ["nfl", "steelers"]) {
      await page.goto(base + "#" + destination, { waitUntil: "networkidle" }); await ready(page, data); await active(page, destination);
      await page.reload({ waitUntil: "networkidle" }); await ready(page, data); await active(page, destination);
    }
    await page.waitForFunction(() => [...document.querySelectorAll('.page.active img')].filter(element => element.checkVisibility()).every(element => element.complete && element.naturalWidth > 0));
    const images = await page.locator(".page.active img").evaluateAll(elements => elements.filter(element => element.checkVisibility()).map(element => ({ src: element.getAttribute("src"), complete: element.complete && element.naturalWidth > 0 })));
    assert.ok(images.length > 0 && images.every(image => image.complete), "Hosted current-roster images load");
    const layout = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    assert.ok(layout.documentWidth <= layout.viewportWidth, "No horizontal overflow");
    assert.deepEqual(errors, []); assert.deepEqual(httpErrors, []); assert.deepEqual(external, []);
    const transportFailures = failures.filter(item => item.failure !== "net::ERR_ABORTED");
    assert.deepEqual(transportFailures, []);
    return { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, status: "passed", servedManifest: served, selectedFixture, playerHistory: research, images, layout, consoleErrors: errors.length, httpErrors: httpErrors.length, failedRequests: transportFailures.length, externalRequests: external.length, cancelledNavigationRequests: failures.filter(item => item.failure === "net::ERR_ABORTED"), checks: ["Home → NFL → Steelers → NFL → Home", "selected historical weekly fixture", "one player's complete recent and selected-opponent histories match exact integrated source rows", "source dialog", "manual verified-data refresh", "browser back/forward", "direct URL and page reload", "current roster images and mobile overflow"] };
  } finally { await context.close(); }
}
async function main() {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const baselineSha = sha(fs.readFileSync(baselineFile));
  assert.equal(baseline.status, "passed", "A completed full hosted WebKit baseline is required");
  const expected = Object.fromEntries(Object.keys(baseline.runtimeManifest).map(file => [file, sha(fs.readFileSync(path.join(ROOT, file)))]));
  const corePaths = Object.keys(expected).filter(file => !file.startsWith("assets/data/"));
  for (const file of corePaths) assert.equal(expected[file], baseline.runtimeManifest[file], `Data-only refresh cannot change application core: ${file}`);
  expected["assets/data/provenance.json"] = sha(fs.readFileSync(path.join(ROOT, "assets/data/provenance.json")));
  const snapshot = sourceSnapshot(), linked = historySnapshot(snapshot.data);
  const provenance = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/provenance.json"), "utf8"));
  const runtimeRoot = process.env.PD_QA_WEBKIT_RUNTIME || "/workspace/.onboarding/webkit-runtime";
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || "/workspace/.onboarding/playwright-browsers";
  const officialDirectory = path.join(cacheRoot, path.basename(path.dirname(webkit.executablePath())));
  const wpe = path.join(officialDirectory, "minibrowser-wpe"), executable = path.join(wpe, "bin", "MiniBrowser");
  const ca = process.env.PD_QA_CA_FILE || "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
  const proof = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package-verification.json"), "utf8"));
  assert.ok(fs.existsSync(executable) && fs.existsSync(ca) && proof.packages.every(item => item.signedIndexChecksumMatched));
  const report = { status: "running", startedAt: new Date().toISOString(), base, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), baselineFullQA: { file: "webkit/results.json", gitHead: baseline.gitHead, completedAt: baseline.completedAt, unchanged: true }, qualification: { engine: "Official Playwright WebKit 26.0 build2248 Linux WPE", ignoreHTTPSErrors: false, hostnameVerificationEnabled: true, providedCAPerRunOnly: true, persistentTrustChanged: false, systemInstallPerformed: false, hasTouch: true, isMobile: true, deviceScaleFactor: 2, scope: "Genuine WebKit mobile emulation; not physical iPhone/Safari controls." }, appCoreShaUnchanged: true, appCoreFiles: corePaths.length, data: { season: snapshot.data.season, currentWeek: snapshot.data.currentWeek, retrievedAt: snapshot.data.retrievedAt, sha256: snapshot.sha256, playerHistorySha256: linked.sha256, historySourceLinkVerified: true, provenanceSha256: expected["assets/data/provenance.json"], provenanceRetrievedAt: provenance.retrievedAt }, expectedManifest: expected, results: [] };
  let browser;
  try {
    browser = await webkit.launch({ headless: true, executablePath: executable, proxy: proxyOptions(), env: { ...process.env, LD_LIBRARY_PATH: [path.join(runtimeRoot, "root", "usr", "lib", "x86_64-linux-gnu"), path.join(wpe, "lib"), path.join(wpe, "sys", "lib")].join(path.delimiter), WEBKIT_EXEC_PATH: path.join(wpe, "bin"), WEBKIT_INJECTED_BUNDLE_PATH: path.join(wpe, "lib"), WEBKIT_FORCE_COMPLEX_TEXT: "1", SSL_CERT_FILE: ca, G_TLS_CA_FILE: ca } });
    report.qualification.version = browser.version();
    for (const viewport of VIEWPORTS.slice(0, 2)) {
      report.results.push(await smoke(browser, viewport, snapshot.data, linked.data, expected, true));
      console.log(`PASS updated hosted ${viewport.width}x${viewport.height}: exact delivered hashes, personal histories, controls and refresh.`);
    }
    for (const [file, hash] of Object.entries(expected)) assert.equal(sha(fs.readFileSync(path.join(ROOT, file))), hash, `${file}: worktree did not change during the smoke run`);
    assert.equal(sha(fs.readFileSync(baselineFile)), baselineSha, "Completed full QA evidence remains immutable");
    report.worktreeRuntimeHashesUnchangedDuringQA = true;
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.message = redact(error.message); throw error; }
  finally {
    if (browser) await browser.close();
    report.completedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, redact(JSON.stringify(report, null, 2)) + "\n");
  }
}
if (require.main === module) {
  if (process.argv.includes("--help")) console.log("Targeted strict live WebKit verification after integrating/publishing a data-only refresh: node qa/hosted-refresh-smoke.cjs. Keeps full QA evidence immutable; writes qa/hosted/refresh-smoke.json only.");
  else main().catch(error => { console.error(redact(error.stack)); process.exitCode = 1; });
}
module.exports = { main };
