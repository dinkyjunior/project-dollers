'use strict';
// Independent native-browser check. No routes, datasets, screenshots, storage,
// requests or fonts are mocked. This does not certify live NFL facts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('/workspace/.onboarding/project-dollers/node_modules/playwright');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8000/project-dollers/');
assert.ok(base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname), 'Local native audit only');
const root = path.resolve(__dirname, '../..');
const folder = path.resolve(process.argv[3] || path.join(__dirname, 'native-' + new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(folder, {recursive:true});
const sourceFiles = ['index.html','assets/home-editorial.css','assets/home-editorial.js','assets/app.js','assets/home/editorial-stadium.webp','assets/home/editorial-stadium-mobile.webp','assets/home/editorial-wordmark.webp'];
const manifest = () => Object.fromEntries(sourceFiles.map(file => [file, fs.existsSync(path.join(root,file)) ? crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex') : null]));
const originalManifest = manifest();
const allViewports = [{width:393,height:852,touch:true,dpr:2},{width:430,height:896,touch:true,dpr:2},{width:768,height:1024,touch:false,dpr:1},{width:1440,height:1000,touch:false,dpr:1}];
const selectedViewports = process.argv[4] === 'phones' ? allViewports.filter(viewport=>viewport.touch) : allViewports;
const homeSelector = '.editorial-home[data-page="home"]';
const results = [];
const report = {qualification:'Local Chromium native layout and controls. Source freshness, WebKit and hosted delivery are separate.',browser:'Chromium /usr/bin/chromium; Playwright 1.58.2',matrix:process.argv[4] === 'phones' ? 'phones' : 'four-viewports',startedAt:new Date().toISOString(),sourceBefore:originalManifest,results};
const record = (name, fn) => Promise.resolve().then(fn).then(value => ({name,status:'passed',...(value === undefined ? {} : {value})}));
const delay = async page => page.waitForTimeout(180);
function listeners(page) {
  const errors=[], httpFailures=[], requestFailures=[];
  page.on('pageerror', error => errors.push({kind:'pageerror',message:error.message}));
  page.on('console', message => {if(message.type()==='error') errors.push({kind:'console',message:message.text()});});
  page.on('response', response => {if(response.status()>=400) httpFailures.push({url:response.url(),status:response.status()});});
  page.on('requestfailed', request => requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  return {errors,httpFailures,requestFailures};
}
async function ready(page, id) {
  await page.waitForFunction(id=>document.querySelector('.page.active')?.dataset.page===id,id,{timeout:30000});
  await page.evaluate(async()=>document.fonts.ready);
  await delay(page);
}
async function homeReady(page) {
  await ready(page,'home');
  await page.locator(homeSelector).waitFor({state:'visible'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.editorial-home img')].filter(img=>img.checkVisibility()).every(img=>img.complete&&img.naturalWidth>0),null,{timeout:30000});
}
async function go(page, route) {
  const response = await page.goto(base.href+'#'+route,{waitUntil:'networkidle'});
  if(response) assert.equal(response.status(),200);
  assert.equal(new URL(page.url()).origin,base.origin);
  assert.equal(new URL(page.url()).hash,'#'+route);
}
async function geometry(page) {
  return page.locator(homeSelector).evaluate(home=>{
    const scroll=home.querySelector('.page-scroll');
    const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    const selectors=['header','h1','[data-home-entry]','[data-home-menu-toggle]','.editorial-sport.is-available[data-open="nfl"]','[data-home-sport="nba"]','[data-home-sport="nrl"]','[data-home-sport="ufc"]','footer'];
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},home:rect(home),shell:rect(document.querySelector('.app-shell')),scroll:{width:scroll.scrollWidth,clientWidth:scroll.clientWidth,height:scroll.scrollHeight,clientHeight:scroll.clientHeight,top:scroll.scrollTop},elements:Object.fromEntries(selectors.map(selector=>{const node=home.querySelector(selector);return[selector,node?{...rect(node),fontFamily:getComputedStyle(node).fontFamily,fontSize:getComputedStyle(node).fontSize,lineHeight:getComputedStyle(node).lineHeight}:null];})),images:[...home.querySelectorAll('img')].map(img=>({src:img.currentSrc||img.src,alt:img.alt,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,...rect(img),objectFit:getComputedStyle(img).objectFit,objectPosition:getComputedStyle(img).objectPosition,visible:img.checkVisibility(),complete:img.complete})),runningAnimations:home.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>({name:a.animationName||null,duration:a.effect?.getComputedTiming().duration}))};
  });
}
function noOverflow(g) {
  assert.ok(g.document.width<=g.viewport.width+1,`Document overflow ${g.document.width}/${g.viewport.width}`);
  assert.ok(g.scroll.width<=g.scroll.clientWidth+1,`Home overflow ${g.scroll.width}/${g.scroll.clientWidth}`);
}
async function activate(page, locator, touch) {if(touch) await locator.tap();else await locator.click();}
async function returnHome(page) {
  await page.locator('.page[data-page="nfl"] [data-open="home"]').first().click();
  await homeReady(page);
}
async function nflReady(page) {
  await ready(page,'nfl');
  await page.waitForFunction(()=>!!window.PD_DATA?.currentWeek,null,{timeout:30000});
  const size=await page.locator('.app-shell').boundingBox();
  assert.ok(size.width<=430.5,'NFL must retain its compact research frame');
  return size;
}
(async()=>{
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const specification of selectedViewports) {
      const context=await browser.newContext({viewport:{width:specification.width,height:specification.height},deviceScaleFactor:specification.dpr,isMobile:specification.touch,hasTouch:specification.touch,locale:'en-AU',timezoneId:'Australia/Sydney'});
      const page=await context.newPage();
      const diagnostics=listeners(page);
      const result={viewport:specification,checks:[],diagnostics};results.push(result);
      try {
        await go(page,'home');await homeReady(page);
        result.top=await geometry(page);noOverflow(result.top);
        assert.equal((await page.locator(homeSelector+' h1').innerText()).replace(/\s+/g,' ').trim(),'See the whole game.','Headline matches the approved render');
        await page.screenshot({path:path.join(folder,`home-top-${specification.width}.png`)});
        const scroll=page.locator(homeSelector+' .page-scroll');
        await scroll.evaluate(node=>node.scrollTop=node.scrollHeight);await delay(page);
        result.bottom=await geometry(page);noOverflow(result.bottom);
        assert.ok(result.bottom.scroll.top+result.bottom.scroll.clientHeight>=result.bottom.scroll.height-2,'Footer/end of Home must be reachable');
        await page.screenshot({path:path.join(folder,`home-bottom-${specification.width}.png`)});
        for(const sport of ['nba','nrl','ufc']) {
          await activate(page,page.locator(homeSelector+` [data-home-sport="${sport}"]`).last(),specification.touch);
          await page.waitForFunction(sport=>document.querySelector('[data-home-status]')?.textContent.includes(sport.toUpperCase()),sport);
          assert.equal(new URL(page.url()).hash,'#home','Coming-soon sport must remain on Home');
          assert.equal(await page.locator('.page.active').getAttribute('data-page'),'home');
          result.checks.push({name:sport+' coming soon',status:'passed'});
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-home-status]').innerText(),'');
        await scroll.evaluate(node=>node.scrollTop=0);await delay(page);
        const toggle=page.locator('[data-home-menu-toggle]');
        const menu=page.locator('[data-home-menu]');
        await toggle.focus();await page.keyboard.press('Enter');
        await menu.waitFor({state:'visible'});
        assert.equal(await toggle.getAttribute('aria-expanded'),'true');
        assert.ok(await menu.evaluate(node=>node.contains(document.activeElement)),'Menu open transfers keyboard focus to enabled destination');
        noOverflow(await geometry(page));
        if(specification.width===393) await page.screenshot({path:path.join(folder,'home-menu-393.png')});
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'),'false');
        assert.ok(await toggle.evaluate(node=>node===document.activeElement),'Escape returns focus to menu toggle');
        result.checks.push({name:'keyboard menu and Escape focus return',status:'passed'});
        await activate(page,toggle,specification.touch);
        await menu.waitFor({state:'visible'});
        await menu.locator('[data-open="nfl"]').first().click();
        result.nflShellFromMenu=await nflReady(page);
        assert.equal(await toggle.getAttribute('aria-expanded'),'false');
        result.checks.push({name:'menu NFL route and frame',status:'passed'});
        await returnHome(page);
        await activate(page,page.locator(homeSelector+' [data-home-entry]'),specification.touch);
        result.nflShellFromCTA=await nflReady(page);
        if(specification.width===393) await page.screenshot({path:path.join(folder,'nfl-after-home-393.png')});
        await returnHome(page);
        await activate(page,page.locator(homeSelector+' .editorial-sport.is-available[data-open="nfl"]'),specification.touch);
        await nflReady(page);await returnHome(page);
        result.checks.push({name:'Explore NFL and NFL row; Home–NFL–Home',status:'passed'});
        await go(page,'nfl');await nflReady(page);await page.reload({waitUntil:'networkidle'});await nflReady(page);
        await go(page,'home');await homeReady(page);await page.reload({waitUntil:'networkidle'});await homeReady(page);
        result.checks.push({name:'direct Home/NFL load and refresh',status:'passed'});
        assert.deepEqual(diagnostics.errors,[],'No page/console errors');
        assert.deepEqual(diagnostics.httpFailures,[],'No failing HTTP responses');
        assert.deepEqual(diagnostics.requestFailures,[],'No failed requests');
        result.status='passed';
      } catch(error) {result.status='failed';result.error=String(error.stack||error);throw error;}
      finally {await context.close();}
    }
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'en-AU',timezoneId:'Australia/Sydney'});
    try {
      const page=await context.newPage();const diagnostics=listeners(page);
      await go(page,'home');await homeReady(page);
      const g=await geometry(page);noOverflow(g);
      assert.equal(await page.locator(homeSelector).getAttribute('data-home-motion-state'),'paused');
      assert.deepEqual(g.runningAnimations,[],'Reduced-motion Home must have no running decorative animations');
      await page.locator('[data-home-menu-toggle]').tap();await page.locator('[data-home-menu]').waitFor({state:'visible'});await page.keyboard.press('Escape');
      assert.deepEqual(diagnostics.errors,[]);assert.deepEqual(diagnostics.httpFailures,[]);assert.deepEqual(diagnostics.requestFailures,[]);
      report.reducedMotion={status:'passed',geometry:g,diagnostics};
    } finally {await context.close();}
    report.sourceAfter=manifest();assert.deepEqual(report.sourceAfter,originalManifest,'Audited source must remain unchanged');
    report.sourceStable=true;report.status='passed';
  } catch(error) {report.status='failed';report.error=String(error.stack||error);process.exitCode=1;}
  finally {
    if(browser)await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();
    fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify({status:report.status,folder,results:results.map(r=>({viewport:r.viewport,status:r.status,error:r.error})),reducedMotion:report.reducedMotion?.status,error:report.error,browserClosed:report.browserClosed},null,2)+'\n');
  }
})();
