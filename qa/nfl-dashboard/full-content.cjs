'use strict';
const assert=require('node:assert/strict'),path=require('node:path');

async function bounded(task,label) {
  let timer;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} exceeded 30 seconds`)),30000);})]);}
  finally{clearTimeout(timer);}
}

async function semantic(page) {
  return page.evaluate(()=>{
    const n=document.querySelector('.page.active');
    if(n?.dataset.page!=='nfl')throw Error('Full-content capture requires actual active NFL screen');
    const text=e=>e.textContent.trim().replace(/\s+/g,' ');
    return {
      data:window.PD_DATA,
      week:n.querySelector('#week-select').value,
      conference:n.querySelector('[data-conference][aria-pressed="true"]').dataset.conference,
      tab:n.querySelector('[data-nfl-tab][aria-selected="true"]').dataset.nflTab,
      division:n.querySelector('#division-select').value,
      form:n.querySelector('#form-select').value,
      sort:n.querySelector('#standings-sort').value,
      standingsExpanded:n.querySelector('[data-standings-toggle]').getAttribute('aria-expanded'),
      expandedTeams:[...n.querySelectorAll('#standings-rows [data-nfl-action="team"][aria-expanded="true"]')].map(e=>e.dataset.team),
      rows:[...n.querySelectorAll('#standings-rows .stand-row')].map(e=>({team:e.querySelector('[data-team]').dataset.team,cells:[...e.querySelectorAll(':scope > [role=cell]')].map(text)})),
      summaries:[...n.querySelectorAll('.nfl-team-summary')].map(text),
      leaders:[...n.querySelectorAll('[data-nfl-leader-panel]')].map(p=>({position:p.dataset.nflLeaderPanel,expanded:p.querySelector('[data-nfl-action="leaders"]').getAttribute('aria-expanded'),rows:[...p.querySelectorAll('.leader-row')].map(text)})),
      fixture:text(n.querySelector('#featured-matchup')),
      recap:text(n.querySelector('#recap-content')),
      previewHidden:n.querySelector('#nfl-inline-preview').hidden
    };
  });
}

async function originalGeometry(page) {
  return page.evaluate(()=>{
    const p=document.querySelector('.page.active'),s=p.querySelector('.page-scroll');
    const nodes=[document.documentElement,document.body,p.closest('.app-shell'),p,s,p.querySelector('.bottom-nav'),p.querySelector('.nfl-source-footer')];
    const r=p.getBoundingClientRect();
    return {url:location.href,scrollTop:s.scrollTop,styles:nodes.map(e=>e.getAttribute('style')),page:{x:r.x,y:r.y,width:r.width,height:r.height}};
  });
}

async function fullContent(page,out,label,helpers) {
  const {ready,active,images,SHA}=helpers,expected=await semantic(page),original=await originalGeometry(page);
  assert.equal(expected.previewHidden,true,'Qualified full-content capture requires closed inline preview; it never silently replaces preview state');
  const isolated=await page.context().newPage();let result,error;
  try {
    await isolated.bringToFront();
    assert.equal((await isolated.goto(page.url(),{waitUntil:'networkidle'})).status(),200,'Isolated capture loads actual app URL');
    await ready(isolated);await active(isolated,'nfl');
    // Recreate source UI state only through genuine controls. No DOM/data clone.
    await isolated.locator('[data-nfl-tab="ladder"]').click();
    await isolated.locator('#week-select').selectOption(expected.week);
    await isolated.locator(`[data-conference="${expected.conference}"]`).click();
    await isolated.locator('#division-select').selectOption(expected.division);
    await isolated.locator('#form-select').selectOption(expected.form);
    await isolated.locator('#standings-sort').selectOption(expected.sort);
    const toggle=isolated.locator('[data-standings-toggle]');
    if(await toggle.getAttribute('aria-expanded')!==expected.standingsExpanded)await toggle.click();
    const selected=await isolated.locator('#standings-rows [data-nfl-action="team"][aria-expanded="true"]').evaluateAll(es=>es.map(e=>e.dataset.team));
    if(JSON.stringify(selected)!==JSON.stringify(expected.expandedTeams)) {
      if(expected.expandedTeams.length)await isolated.locator(`#standings-rows [data-nfl-action="team"][data-team="${expected.expandedTeams[0]}"]`).click();
      else for(const team of selected)await isolated.locator(`#standings-rows [data-nfl-action="team"][data-team="${team}"]`).click();
    }
    for(const position of ['QB','RB','WR']) {
      const target=expected.leaders.find(p=>p.position===position).expanded;
      const control=isolated.locator(`#ladder-leaders [data-nfl-action="leaders"][data-position="${position}"]`);
      if(await control.getAttribute('aria-expanded')!==target)await control.click();
    }
    await isolated.locator(`[data-nfl-tab="${expected.tab}"]`).click();
    await images(isolated);
    await bounded(isolated.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.page.active img')].filter(i=>i.checkVisibility()).map(i=>i.decode?.().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}),'Isolated foreground image/paint readiness');
    const isolatedForeground=await isolated.evaluate(()=>({visibility:document.visibilityState,hasFocus:document.hasFocus()}));
    assert.equal(isolatedForeground.visibility,'visible','Isolated actual application page is foreground-visible');
    assert.deepEqual(await semantic(isolated),expected,'Isolated actual app preserves current verified data and all rendered conference/week/tab/standings/leader semantics');
    const dataSha=SHA(Buffer.from(JSON.stringify(expected.data))),{data,...ui}=expected;
    // Only this sacrificial actual app page receives qualified full exposure.
    await isolated.evaluate(()=>{
      const p=document.querySelector('.page.active'),s=p.querySelector('.page-scroll'),shell=p.closest('.app-shell'),nav=p.querySelector('.bottom-nav'),footer=p.querySelector('.nfl-source-footer');
      document.documentElement.style.overflow='visible';document.body.style.overflow='visible';document.body.style.display='block';document.body.style.padding='0';document.body.style.height='auto';shell.style.margin='0 auto';shell.style.height='auto';shell.style.overflow='visible';p.style.position='relative';p.style.inset='auto';p.style.height='auto';p.style.maxHeight='none';p.style.overflow='visible';s.style.position='relative';s.style.inset='auto';s.style.height='auto';s.style.maxHeight='none';s.style.overflow='visible';s.scrollTop=0;nav.style.position='relative';nav.style.inset='auto';nav.style.width='calc(100% - 20px)';nav.style.margin='0 10px';footer.style.position='relative';footer.style.inset='auto';footer.style.margin='4px 10px 0';
    });
    await isolated.bringToFront();
    await bounded(isolated.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))),'Isolated foreground full-exposure paint');
    const bytes=await isolated.screenshot({path:path.join(out,label+'-full-content.png'),fullPage:true,timeout:30000});
    result={file:label+'-full-content.png',sha256:SHA(bytes),bytes:bytes.length,captureOnlyUnrolledInternalScroll:true,isolatedActualAppPage:true,isolatedForeground,semanticIdentity:{dataSha256:dataSha,uiSha256:SHA(Buffer.from(JSON.stringify(ui))),week:ui.week,conference:ui.conference,tab:ui.tab,division:ui.division,form:ui.form,sort:ui.sort,standingsRows:ui.rows.length,leaderPanels:ui.leaders.map(p=>({position:p.position,rows:p.rows.length,expanded:p.expanded}))},qualification:'Actual same-context browser page loaded the real application URL and recreated current state through native controls. Verified data and rendered conference/week/tab/standings/leader semantics matched before temporary block-flow/scroller-height exposure there. The original functional phone page received no style, DOM, data, animation-time or route substitutions. This full sheet is qualified exposure, not normal phone geometry; untouched viewport and scrolling PNGs establish native presentation.'};
  }catch(e){error=e;}finally{await isolated.close();await page.bringToFront();}
  assert.deepEqual(await semantic(page),expected,'Original functional page source UI semantics are untouched');
  assert.deepEqual(await originalGeometry(page),original,'Original functional page route, styles, scroll position and frame geometry are untouched');
  if(error)throw error;
  result.originalFunctionalPageUntouched=true;
  result.originalForeground=await page.evaluate(()=>({visibility:document.visibilityState,hasFocus:document.hasFocus()}));
  result.originalNaturalMotion=await require('./motion.cjs').naturalPair(page,'Natural original after isolated full-content capture',false);
  return result;
}
module.exports={fullContent,semantic};
