const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const output = '/workspace/project-dollers/qa/nfl-weekly-20261013/design-native';
fs.mkdirSync(output,{recursive:true});
const receipts=[];
const root='/workspace/project-dollers';
const hashes=()=>Object.fromEntries(['index.html','assets/nfl-dashboard.js','assets/nfl-editorial.css'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const before=hashes();
async function settled(page) {
  await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.querySelectorAll('.page.active img')].filter(img=>img.checkVisibility()).map(img=>img.decode().catch(()=>{}))); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
}
async function picture(page,name,selector) {
  if(selector) await page.locator(selector).first().evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
  await settled(page);
  await page.screenshot({path:path.join(output,name+'.png')});
  receipts.push({name,geometry:await page.locator('[data-page="nfl"]').evaluate(node=>({shell:document.querySelector('.app-shell').getBoundingClientRect().toJSON(),documentWidth:document.documentElement.scrollWidth,scrollWidth:node.querySelector('.page-scroll').scrollWidth,clientWidth:node.querySelector('.page-scroll').clientWidth,scrollTop:node.querySelector('.page-scroll').scrollTop}))});
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  for(const viewport of [{width:393,height:852},{width:430,height:896},{width:1440,height:900}]) {
    const ctx=await browser.newContext({viewport,deviceScaleFactor:2,reducedMotion:'reduce',timezoneId:'Australia/Sydney'});
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:8809/project-dollers/#nfl',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&document.querySelector('.page.active')?.dataset.page==='nfl'&&document.querySelector('#nfl-weekly-game option'));
    await picture(page,`${viewport.width}-weekly-top`);
    await page.locator('#week-select').selectOption('4');
    await picture(page,`${viewport.width}-weekly-final`,'.nfl-editorial-matchup-heading');
    await page.locator('[data-standings-toggle]').click();
    await picture(page,`${viewport.width}-all16`,'.nfl-editorial-section-bar');
    await page.locator('#tab-recap').click();
    await picture(page,`${viewport.width}-recap-collapsed`,'#panel-recap');
    await page.locator('.nfl-recap-summary').first().click();
    await picture(page,`${viewport.width}-recap-expanded`,'.nfl-recap-card');
    await page.locator('#nfl-recap-team').selectOption('PIT');
    await picture(page,`${viewport.width}-recap-filtered`,'#panel-recap');
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify({timezone:'Australia/Sydney',nativeLocalBrowser:'Chromium 151, Playwright 1.58.2, DPR 2, reduced motion',before,after:hashes(),receipts},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
