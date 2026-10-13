const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mode = process.argv[2] || 'after';
const output = __dirname;
const receipt = {mode, url:'http://127.0.0.1:8808/project-dollers/', viewports:[], errors:[], checks:[]};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('[data-page="nfl"] img')].map(img => img.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    for (const [width,height] of [[393,852],[430,896],[1440,900]]) {
      const page = await browser.newPage({viewport:{width,height}, deviceScaleFactor:2, reducedMotion:'reduce'});
      page.on('pageerror', error => receipt.errors.push({width,error:error.message}));
      await page.goto(receipt.url);
      await page.waitForFunction(() => window.PDApp?.getContext?.()?.data?.weeks);
      await page.evaluate(() => window.PDApp.openPage('nfl'));
      await paint(page);
      const ladderPath = path.join(output, `${mode}-ladder-${width}.png`);
      await page.screenshot({path:ladderPath});
      const entry = {width,height, ladderSha256:digest(fs.readFileSync(ladderPath))};
      await page.locator('#tab-recap').click();
      await page.waitForFunction(() => !document.querySelector('#panel-recap').hidden);
      await paint(page);
      entry.recap = await page.evaluate(() => {
        const active = document.querySelector('[data-page="nfl"]');
        const scroll = active.querySelector('.page-scroll');
        const frame = document.querySelector('.app-shell').getBoundingClientRect();
        const rows = [...document.querySelectorAll('#recap-content .nfl-recap-game')].map(row => {
          const teams = row.querySelector(':scope > span');
          const score = row.querySelector(':scope > button, :scope > strong');
          const a=teams.getBoundingClientRect(), b=score.getBoundingClientRect(), r=row.getBoundingClientRect();
          return {teams:teams.textContent.trim(), score:score.textContent.trim(), rowHeight:r.height, separation:b.left-a.right, display:getComputedStyle(row).display, scoreWithinRow:b.right<=r.right+0.5, teamsWithinRow:a.left>=r.left-0.5, linked:score.matches('button[data-nfl-action="report"]')};
        });
        return {frame:{width:frame.width,height:frame.height}, overflow:scroll.scrollWidth>scroll.clientWidth, rows};
      });
      await page.screenshot({path:path.join(output, `${mode}-recap-${width}-top.png`)});
      await page.evaluate(() => {
        const scroll = document.querySelector('.nfl-editorial-dashboard .page-scroll');
        scroll.scrollTop = scroll.scrollHeight;
      });
      await paint(page);
      await page.screenshot({path:path.join(output, `${mode}-recap-${width}-bottom.png`)});
      if (mode === 'after') {
        assert(entry.recap.rows.length > 0, 'Expected actual recap rows');
        assert(!entry.recap.overflow, `Horizontal overflow at ${width}`);
        for (const row of entry.recap.rows) {
          assert.equal(row.display, 'flex');
          assert(row.separation >= 11.5, `Insufficient team/score separation: ${row.teams}`);
          assert(row.scoreWithinRow && row.teamsWithinRow, `Clipped recap row: ${row.teams}`);
        }
        const previous = JSON.parse(fs.readFileSync(path.join(output, 'before-receipt.json'))).viewports.find(view => view.width === width);
        assert.equal(entry.ladderSha256, previous.ladderSha256, `Ladder screenshot changed at ${width}`);
        assert.deepEqual(entry.recap.rows.map(({teams,score,linked})=>({teams,score,linked})), previous.recap.rows.map(({teams,score,linked})=>({teams,score,linked})), 'Recap data/link identity changed');
        receipt.checks.push(`Recap ${width}: all ${entry.recap.rows.length} rows separated, unclipped, same data/report links; Ladder PNG byte-identical.`);
      }
      receipt.viewports.push(entry);
      await page.close();
    }
    assert.equal(receipt.errors.length, 0, 'Runtime errors');
    receipt.stylesheetSha256=digest(fs.readFileSync(path.resolve(output,'../../../assets/nfl-editorial.css')));
    receipt.passed = true;
    fs.writeFileSync(path.join(output, `${mode}-receipt.json`), JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({mode,passed:true,checks:receipt.checks}));
  } catch(error) {
    receipt.passed=false;receipt.failure=error.message;
    fs.writeFileSync(path.join(output, `${mode}-receipt.json`), JSON.stringify(receipt,null,2)+'\n');
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
