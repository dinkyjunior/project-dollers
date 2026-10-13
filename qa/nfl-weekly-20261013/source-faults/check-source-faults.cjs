'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const ROOT = '/workspace/project-dollers';
const BASE = 'http://127.0.0.1:8809/project-dollers/';
const OUT = __dirname;
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const artifacts = ['assets/nfl-dashboard.js', 'assets/nfl-editorial.css', 'assets/data/team-details.json', 'assets/data/game-reports.json'];
const fingerprints = () => Object.fromEntries(artifacts.map(file => [file, digest(file)]));
const receipt = {
  qualification: 'Explicit fault injection: abort only the first native local team-details.json request, then retry with the real origin; separately delay that one local source behind a controllable test promise. No source response, application state, DOM or browser clock substitutions.',
  startedAt: new Date().toISOString(),
  sourceBefore: fingerprints(),
  checks: [],
  scenarios: {},
};
const check = (name, condition) => { assert.ok(condition, name); receipt.checks.push({ name, passed: true }); };
const snapshot = page => page.evaluate(() => ({
  activePage: document.querySelector('.page.active')?.dataset.page,
  hash: location.hash,
  pendingMatchup: window.PDApp?.getContext()?.state.nflPendingMatchup,
  selectedWeek: window.PDApp?.getContext()?.state.week,
  sourceLoaded: !!window.PDTeamDetails?.getDataset(),
  sourceIntegrity: window.PDTeamDetails?.getDataset()?._sourceIntegrity || null,
  selectedGame: document.querySelector('[data-weekly-game]')?.dataset.weeklyGame || null,
  matchupOptions: [...document.querySelectorAll('#nfl-weekly-game option')].map(option => option.value),
}));
function evidence(page, target) {
  page.on('pageerror', error => target.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') target.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => target.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) target.badResponses.push({ url: response.url(), status: response.status() }); });
}
const makeContext = browser => browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-AU', timezoneId: 'Australia/Sydney' });

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    {
      const context = await makeContext(browser), page = await context.newPage();
      const result = receipt.scenarios.failedSourceThenRetry = { pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [], injectedAbortCount: 0 };
      evidence(page, result);
      const matcher = '**/assets/data/team-details.json';
      const handler = async route => { result.injectedAbortCount++; await route.abort('failed'); };
      await context.route(matcher, handler);
      await page.goto(`${BASE}#nfl`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.dataReady === 'true');
      await page.locator('#featured-matchup [data-nfl-action="weekly-retry"]').waitFor({ state: 'visible', timeout: 12000 });
      result.failureState = await snapshot(page);
      result.failureNotice = await page.locator('#featured-matchup').innerText();
      check('Failed source exposes a schedule error and Retry schedule control', result.failureNotice.includes('The league schedule could not load.') && result.failureNotice.includes('Retry schedule'));
      check('Failed source does not publish fixtures or navigate away from NFL', !result.failureState.sourceLoaded && result.failureState.matchupOptions.length === 0 && result.failureState.activePage === 'nfl');
      check('Fault injection aborted one source request only', result.injectedAbortCount === 1);
      await page.screenshot({ path: path.join(OUT, 'source-failure-393.png') });
      await context.unroute(matcher, handler);
      await page.locator('#featured-matchup [data-nfl-action="weekly-retry"]').click();
      await page.waitForFunction(() => !!document.querySelector('#nfl-weekly-game option') && window.PDTeamDetails?.getDataset()?._sourceIntegrity?.status === 'verified', null, { timeout: 15000 });
      result.recoveredState = await snapshot(page);
      check('Retry loads all 15 selected Week 5 games', Number(result.recoveredState.selectedWeek) === 5 && result.recoveredState.matchupOptions.length === 15);
      check('Retry dataset is integrity verified and bound to the unchanged local source', result.recoveredState.sourceIntegrity.status === 'verified' && result.recoveredState.sourceIntegrity.kind === 'team-details' && result.recoveredState.sourceIntegrity.rawBookSha256 === receipt.sourceBefore['assets/data/team-details.json']);
      check('Recovered error and Retry schedule controls disappear', await page.locator('#featured-matchup [data-nfl-action="weekly-retry"]').count() === 0 && !(await page.locator('#featured-matchup').innerText()).includes('could not load'));
      const expectedGame = result.recoveredState.selectedGame;
      await page.locator('#featured-matchup .nfl-matchup-action.is-primary').click();
      await page.waitForFunction(() => window.PDGameReport?.getReport()?.id && document.querySelector('.page.active')?.dataset.page === 'game-report', null, { timeout: 15000 });
      result.reportState = await page.evaluate(() => ({ hash: location.hash, state: window.PDGameReport.getState(), reportId: window.PDGameReport.getReport().id, activePage: document.querySelector('.page.active').dataset.page }));
      const query = new URLSearchParams(result.reportState.hash.split('?')[1]);
      check('Recovered primary action routes the exact selected event to its report', result.reportState.reportId === expectedGame && query.get('game') === expectedGame && query.get('return') === 'nfl');
      await page.locator('.page.active [data-gr-action="back"]').click();
      await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'nfl');
      check('Recovered game report Back returns to NFL', (await snapshot(page)).hash === '#nfl');
      check('No application exception during source failure and recovery', result.pageErrors.length === 0);
      check('All failed requests are the explicitly injected source failure', result.failedRequests.length === 1 && result.failedRequests.every(request => request.url.endsWith('/assets/data/team-details.json')));
      check('No origin HTTP errors during retry/report recovery', result.badResponses.length === 0);
      result.expectedConsoleErrorQualification = 'The retained console error for net::ERR_FAILED is expected evidence of the intentionally aborted local team-details request; it is not suppressed.';
      await context.close();
    }
    {
      const context = await makeContext(browser), page = await context.newPage();
      const result = receipt.scenarios.cancelPendingHomeMatchup = { pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [], heldSourceRequests: 0 };
      evidence(page, result);
      let releaseSource, sourceHeld;
      const hold = new Promise(resolve => { releaseSource = resolve; });
      const held = new Promise(resolve => { sourceHeld = resolve; });
      await context.route('**/assets/data/team-details.json', async route => { result.heldSourceRequests++; sourceHeld(); await hold; await route.continue(); });
      await page.goto(`${BASE}#home`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.dataReady === 'true');
      await page.locator('[data-home-topics] [data-home-shortcut="matchups"]').click();
      await held;
      await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'nfl' && window.PDApp?.getContext()?.state.nflPendingMatchup === true);
      result.queuedState = await snapshot(page);
      result.queuedNotice = await page.locator('#featured-matchup').innerText();
      check('Cold Home Matchups queues while the real weekly source loads', result.queuedState.pendingMatchup === true && !result.queuedState.sourceLoaded && result.queuedNotice.includes('Opening this week’s matchup after the schedule loads'));
      await page.locator('[data-page="nfl"] .nfl-editorial-brand').click();
      await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'home');
      result.homeBeforeRelease = await snapshot(page);
      releaseSource();
      await page.waitForFunction(() => window.PDTeamDetails?.getDataset()?._sourceIntegrity?.status === 'verified' && window.PDApp?.getContext()?.state.nflPendingMatchup === false, null, { timeout: 15000 });
      result.homeAfterRelease = await snapshot(page);
      check('Leaving NFL cancels automatic matchup navigation after delayed source completes', result.homeAfterRelease.activePage === 'home' && result.homeAfterRelease.hash === '#home' && result.homeAfterRelease.pendingMatchup === false);
      check('Cancelled navigation still retains the verified source without substitutions', result.homeAfterRelease.sourceIntegrity.rawBookSha256 === receipt.sourceBefore['assets/data/team-details.json']);
      check('Cancelled navigation produces no failed requests, HTTP errors or application exceptions', result.pageErrors.length === 0 && result.failedRequests.length === 0 && result.badResponses.length === 0 && result.consoleErrors.length === 0);
      await page.screenshot({ path: path.join(OUT, 'cancelled-matchup-home-393.png') });
      await context.close();
    }
    receipt.passed = true;
  } catch (error) {
    receipt.passed = false; receipt.error = error.stack; process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    receipt.browserClosed = true;
    receipt.sourceAfter = fingerprints();
    receipt.sourceStable = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'source-fault-injection.json'), JSON.stringify(receipt, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.length, sourceStable: receipt.sourceStable, browserClosed: receipt.browserClosed, error: receipt.error || null, receipt: path.join(OUT, 'source-fault-injection.json') }, null, 2) + '\n');
  }
})();
