'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const ROOT = '/workspace/project-dollers';
const BASE = 'http://127.0.0.1:8000/project-dollers/';
const OUT = '/workspace/.onboarding/home-immersive-preservation/frame-after-' + new Date().toISOString().replace(/[:.]/g, '-');
const prior = JSON.parse(fs.readFileSync('/workspace/.onboarding/home-immersive-preservation/frame-production-baseline.json'));
const files = ['assets/home-editorial.css', 'assets/home-editorial.js', 'assets/nfl-dashboard.css', 'assets/app.js', 'index.html'];
const hashes = () => Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(ROOT + '/' + name)).digest('hex')]));
const rect = element => {
  const value = element.getBoundingClientRect();
  return {x:value.x, y:value.y, width:value.width, height:value.height, right:value.right, bottom:value.bottom};
};
fs.mkdirSync(OUT, {recursive:true});
fs.copyFileSync(__filename, OUT + '/executed-helper.cjs');
const result = {
  status:'running', startedAt:new Date().toISOString(), sourceBefore:hashes(), results:[], errors:[],
  qualification:'Native local Chromium geometry. Four sport previews and NFL compare enclosure, not intrinsic scroll content. No response, clock, DOM or CSS substitution.'
};
let browser;
async function measure(page) {
  return page.evaluate(() => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return {x:value.x, y:value.y, width:value.width, height:value.height, right:value.right, bottom:value.bottom};
    };
    const active = document.querySelector('.page.active');
    const shell = document.querySelector('.app-shell');
    const scroll = active.querySelector('.page-scroll');
    const canvas = active.querySelector('.editorial-canvas');
    const entry = active.querySelector('[data-home-entry]');
    const art = active.querySelector('.editorial-art');
    const image = art?.querySelector('img');
    return {
      page:active.dataset.page, sport:active.dataset.homeSport || null,
      shell:rect(shell), borderRadius:getComputedStyle(shell).borderRadius,
      canvas:canvas ? rect(canvas) : null,
      scroll:{width:scroll.scrollWidth, clientWidth:scroll.clientWidth},
      documentWidth:document.documentElement.scrollWidth,
      visibleHeadline:!!canvas?.querySelector('h1:not(.sr-only)'),
      entry:entry ? {fontSize:parseFloat(getComputedStyle(entry).fontSize), rect:rect(entry)} : null,
      art:art ? {rect:rect(art), state:active.dataset.homeArtState,
        imageRect:rect(image), currentSrc:image.currentSrc, naturalWidth:image.naturalWidth,
        naturalHeight:image.naturalHeight, objectFit:getComputedStyle(image).objectFit} : null
    };
  });
}
(async () => {
  try {
    browser = await chromium.launch({executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox']});
    result.browserVersion = browser.version();
    for (const viewport of [{width:393,height:852},{width:430,height:896},{width:768,height:1024},{width:1440,height:900}]) {
      const context = await browser.newContext({viewport, deviceScaleFactor:2, isMobile:viewport.width < 500,
        hasTouch:viewport.width < 500, locale:'en-AU', timezoneId:'Australia/Sydney'});
      const page = await context.newPage();
      const row = {viewport, home:[]};
      result.results.push(row);
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('console', message => {if (message.type() === 'error') result.errors.push(message.text());});
      try {
        await page.goto(BASE + '#home', {waitUntil:'networkidle'});
        await page.waitForFunction(() => document.documentElement.dataset.dataReady === 'true');
        await page.evaluate(async () => document.fonts.ready);
        for (const sport of ['nfl','nba','nrl','ufc']) {
          await page.locator('button[data-home-sport="' + sport + '"]').click();
          await page.waitForFunction(sport => {
            const home = document.querySelector('.editorial-home');
            return home.dataset.homeSport === sport && home.dataset.homeArtState === 'ready';
          }, sport);
          row.home.push(await measure(page));
        }
        await page.goto(BASE + '#nfl', {waitUntil:'networkidle'});
        await page.waitForFunction(() => document.querySelector('.page.active')?.dataset.page === 'nfl');
        row.nfl = await measure(page);
        const old = prior.results.find(entry => entry.viewport.width === viewport.width).measurements.find(entry => entry.page === 'nfl');
        row.nflSizingPreserved = ['x','y','width','height'].every(key => Math.abs(row.nfl.shell[key] - old.shell[key]) <= .05)
          && row.nfl.borderRadius === old.shellStyles.borderRadius;
        for (const home of row.home) {
          home.delta = Object.fromEntries(['x','y','width','height'].map(key => [key, home.shell[key] - row.nfl.shell[key]]));
          home.sameDimensionsAndCenter = Object.values(home.delta).every(value => Math.abs(value) <= .05)
            && home.borderRadius === row.nfl.borderRadius;
          home.canvasMatchesEnclosure = Math.abs(home.canvas.width - home.shell.width) <= .05;
          home.entryToCanvasRatio = home.entry.fontSize / home.canvas.width;
          home.proportionsRemainPhoneScale = !home.visibleHeadline && home.entryToCanvasRatio >= .034 && home.entryToCanvasRatio <= .041;
          home.noHorizontalOverflow = home.scroll.width <= home.scroll.clientWidth + 1 && home.documentWidth <= viewport.width + 1;
          home.correctArt = home.art.state === 'ready' && home.art.naturalWidth > 0
            && home.art.currentSrc.includes(sport === 'nfl' ? 'editorial-stadium' : 'editorial-immersive-' + sport);
        }
      } finally {
        await context.close();
      }
    }
    result.sourceAfter = hashes();
    result.sourceStable = JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter);
    result.status = !result.errors.length && result.sourceStable && result.results.every(row => row.nflSizingPreserved && row.home.every(home =>
      home.sameDimensionsAndCenter && home.canvasMatchesEnclosure && home.proportionsRemainPhoneScale && home.noHorizontalOverflow && home.correctArt)) ? 'passed' : 'failed';
    if (result.status === 'failed') process.exitCode = 1;
  } catch (error) {
    result.status = 'failed';
    result.error = {message:error.message, stack:error.stack};
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    result.browserClosed = true;
    result.completedAt = new Date().toISOString();
    fs.writeFileSync(OUT + '/results.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({status:result.status, path:OUT + '/results.json', sourceStable:result.sourceStable, errors:result.errors,
      results:result.results.map(row => ({viewport:row.viewport, nflSizingPreserved:row.nflSizingPreserved, home:row.home.map(home => ({sport:home.sport,
        shell:home.shell, delta:home.delta, sameDimensionsAndCenter:home.sameDimensionsAndCenter,
        noHorizontalOverflow:home.noHorizontalOverflow, correctArt:home.correctArt}))})), browserClosed:true}));
  }
})();
