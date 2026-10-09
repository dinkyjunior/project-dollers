'use strict';
/* Independent Home regression contract. The VM executes the actual interaction
 * source; browser exports use native inputs on the real app. No response, CSS,
 * DOM, animation phase or clock substitutions are used by browser exports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const HOME = '[data-page="home"]';
const SPORTS = ['nfl', 'nba', 'nrl', 'ufc'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function interactionHarness({stored = null, blockedStorage = false} = {}) {
  class Node {
    constructor(kind, values = {}) {
      this.kind = kind; this.dataset = {}; this.attrs = new Map();
      this.classes = new Set(); this.children = new Map(); this.textContent = '';
      this.classList = {toggle:(value, force) => force ? this.classes.add(value) : this.classes.delete(value),
        remove:value => this.classes.delete(value), contains:value => this.classes.has(value)};
      Object.assign(this, values);
    }
    setAttribute(key, value) {this.attrs.set(key, String(value));}
    getAttribute(key) {
      if(this.attrs.has(key))return this.attrs.get(key);
      const dataKey=key.startsWith('data-')?key.slice(5).replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase()):null;
      return dataKey&&Object.hasOwn(this.dataset,dataKey)?String(this.dataset[dataKey]):null;
    }
    removeAttribute(key) {
      this.attrs.delete(key);
      if(key.startsWith('data-'))delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_match,letter)=>letter.toUpperCase())];
    }
    hasAttribute(key) {return this.getAttribute(key)!==null;}
    toggleAttribute(key, on) {on ? this.attrs.set(key, '') : this.attrs.delete(key);}
    querySelector(selector) {return this.children.get(selector) || null;}
    closest(selector) {
      if (selector === 'button' && ['selector','entry','nav','more'].includes(this.kind)) return this;
      if (selector === '[data-home-select]' && this.kind === 'selector') return this;
      if (selector === '.bottom-nav' && ['nav','more'].includes(this.kind)) return nav;
      return null;
    }
    focus() {context.document.activeElement = this;}
  }
  const selectors = SPORTS.map(sport => {
    const node = new Node('selector', {dataset:{homeSelect:sport}});
    node.setAttribute('data-home-select', sport); return node;
  });
  const home = new Node('home'), entry = new Node('entry'), status = new Node('status');
  entry.setAttribute('data-home-entry', '');
  const label = new Node('label'), arrow = new Node('arrow'), logo = new Node('logo');
  const teamsLabel = new Node('label'), frame = new Node('frame'), nav = new Node('navigation');
  const scenes = SPORTS.map(sport => new Node('scene', {dataset:{homeScene:sport}, hidden:sport !== 'nfl'}));
  const destinations = ['nfl','matchups','insights'].map(destination => {
    const node = new Node('nav', {dataset:destination === 'nfl' ? {open:'nfl'} : {shortcut:destination}});
    node.setAttribute(destination === 'nfl' ? 'data-open' : 'data-shortcut', destination); return node;
  });
  const more = new Node('more'); more.setAttribute('data-more', '');
  entry.children.set('[data-home-entry-label]', label); entry.children.set('[data-home-entry-arrow]', arrow);
  for (const [selector, node] of [['[data-home-entry]',entry],['.home-availability',status],
    ['[data-home-league-logo]',logo],['[data-home-teams-label]',teamsLabel],['.home-frame',frame]]) home.children.set(selector,node);
  home.querySelectorAll = selector => selector === '[data-home-select]' ? selectors : selector === '[data-home-scene]' ? scenes : [];
  home.contains = node => [entry,status,label,arrow,logo,teamsLabel,frame,nav,more,...selectors,...scenes,...destinations].includes(node);
  const handlers = new Map(), dispatched = [], timers = new Map(); let nextTimer = 0;
  home.addEventListener = (type, callback, capture) => {handlers.set(type, {callback,capture});};
  home.dispatchEvent = event => {dispatched.push(event); return true;};
  const context = {
    document:{querySelector:selector => selector === '.page[data-page="home"]' ? home : null, activeElement:null},
    sessionStorage:{getItem:() => {if(blockedStorage)throw new Error('Storage blocked');return stored;},
      setItem:(_key,value) => {if(blockedStorage)throw new Error('Storage blocked');stored=value;}},
    CustomEvent:class {constructor(type, options){this.type=type;Object.assign(this,options);}},
    setTimeout:callback => {const id=++nextTimer;timers.set(id,callback);return id;},
    clearTimeout:id => timers.delete(id)
  };
  const source = fs.readFileSync(path.join(ROOT,'assets/home-interactions.js'),'utf8');
  vm.runInNewContext(source,context,{filename:'actual-assets/home-interactions.js'});
  const fire = (type, target, key) => {
    const event = {target,key,defaultPrevented:false,propagationStopped:false,
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;}};
    assert.ok(handlers.has(type),`${type} is handled by actual interaction source`);
    handlers.get(type).callback(event); return event;
  };
  return {home,selectors,entry,status,label,arrow,logo,teamsLabel,scenes,destinations,more,frame,
    context,handlers,dispatched,fire,stored:()=>stored,timers,sourceSha256:hash(source)};
}

function verifySelected(h, sport) {
  assert.equal(h.home.dataset.homeSport,sport);
  assert.equal(h.frame.getAttribute('data-home-sport'),sport);
  assert.equal(h.selectors.filter(node=>node.getAttribute('aria-pressed')==='true').length,1);
  for (const node of h.selectors) {
    const selected=node.dataset.homeSelect===sport;
    assert.equal(node.getAttribute('aria-pressed'),String(selected));
    assert.equal(node.classList.contains('is-selected'),selected);
  }
  assert.match(h.logo.getAttribute('alt'),new RegExp(`^${sport}\\b`,'i'));
  assert.equal(h.logo.dataset.sport,sport);
  assert.deepEqual(h.scenes.filter(node=>!node.hidden).map(node=>node.dataset.homeScene),[sport]);
  assert.equal(h.entry.disabled,sport!=='nfl');
  assert.equal(h.entry.getAttribute('data-open'),sport==='nfl'?'nfl':null);
  assert.equal(h.arrow.hasAttribute('hidden'),sport!=='nfl');
  assert.equal(h.label.textContent,sport==='nfl'?'Enter':`${sport.toUpperCase()} · Coming soon`);
  assert.equal(h.entry.getAttribute('aria-label'),sport==='nfl'?'Enter NFL research':`${sport.toUpperCase()} research is coming soon`);
  assert.equal(h.teamsLabel.textContent,sport==='ufc'?'Fighters':'Teams');
  assert.doesNotMatch(h.label.textContent,/preview\s+only/i);
}

function auditActualInteractions() {
  const startedAt=new Date().toISOString(), tests=[];
  const test=(name,fn)=>{fn();tests.push({name,status:'passed'});};
  test('Four native button selections preserve semantic state, image, scene, destination and availability',()=>{
    const h=interactionHarness();verifySelected(h,'nfl');
    assert.equal(h.handlers.get('click').capture,true,'Unavailable destinations are guarded before delegated app routing');
    for(const sport of SPORTS) {
      const event=h.fire('click',h.selectors.find(node=>node.dataset.homeSelect===sport));
      assert.equal(event.propagationStopped,false,'Selection does not swallow unrelated app events');
      verifySelected(h,sport);assert.equal(h.stored(),sport);
      const emitted=h.dispatched.at(-1);assert.equal(emitted.type,'pd:home-sport');assert.equal(emitted.detail.sport,sport);
      assert.match(h.status.textContent,sport==='nfl'?/NFL research is ready/:new RegExp(`${sport.toUpperCase()} research is coming soon`));
    }
  });
  test('Coming-soon entry and all unavailable destination shortcuts are captured without closing More',()=>{
    const h=interactionHarness();
    for(const sport of ['nba','nrl','ufc']) {
      h.fire('click',h.selectors.find(node=>node.dataset.homeSelect===sport));
      for(const button of [h.entry,...h.destinations]) {
        const event=h.fire('click',button);assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);
        assert.equal(h.status.classList.contains('is-visible'),true);assert.match(h.status.textContent,new RegExp(sport,'i'));
        assert.match(h.status.textContent,/coming soon/);
      }
      const more=h.fire('click',h.more);assert.equal(more.defaultPrevented,false);assert.equal(more.propagationStopped,false);
      h.fire('keydown',h.selectors[0],'Escape');assert.equal(h.status.classList.contains('is-visible'),false);
    }
    h.fire('click',h.selectors[0]);
    for(const button of [h.entry,...h.destinations]) {
      const event=h.fire('click',button);assert.equal(event.defaultPrevented,false);assert.equal(event.propagationStopped,false);
    }
  });
  test('Keyboard arrows wrap and Home/End select exact focused sport; irrelevant keys remain untouched',()=>{
    const h=interactionHarness();
    const keys=[['ArrowLeft','ufc'],['ArrowRight','nfl'],['End','ufc'],['Home','nfl']];
    let target=h.selectors[0];
    for(const [key,sport] of keys) {
      const event=h.fire('keydown',target,key);assert.equal(event.defaultPrevented,true);verifySelected(h,sport);
      target=h.context.document.activeElement;assert.equal(target.dataset.homeSelect,sport);
    }
    assert.equal(h.fire('keydown',h.selectors[0],'Tab').defaultPrevented,false);
    assert.equal(h.fire('keydown',h.more,'ArrowRight').defaultPrevented,false);
  });
  test('All valid session selections restore and corrupt values safely default to NFL',()=>{
    for(const sport of SPORTS)verifySelected(interactionHarness({stored:sport}),sport);
    for(const value of ['invalid','__proto__','constructor','NFL',''])verifySelected(interactionHarness({stored:value}),'nfl');
  });
  test('Blocked session storage preserves all four fully functional selections',()=>{
    const h=interactionHarness({blockedStorage:true});
    for(const sport of SPORTS){h.fire('click',h.selectors.find(node=>node.dataset.homeSelect===sport));verifySelected(h,sport);}
  });
  return {status:'passed',startedAt,completedAt:new Date().toISOString(),source:'actual assets/home-interactions.js',
    sourceSha256:interactionHarness().sourceSha256,tests,
    qualification:'Event-contract regression on the actual interaction source in a minimal DOM harness; native rendering, pointer interception and production routing require the separate browser audit.'};
}

async function active(page,name) {
  await page.waitForFunction(value=>document.querySelector('.page.active')?.dataset.page===value,name);
  assert.equal(await page.locator('.page:visible').count(),1,'Exactly one app route is visible');
}
async function auditHomeNative(page, {touch=false, reload=true}={}) {
  const evidence={sports:[],guardedDestinations:[],keyboard:[],more:[],refresh:[],geometry:[]};
  await active(page,'home');
  const activate=async selector=>{const node=page.locator(selector);touch?await node.tap():await node.click();};
  const select=async sport=>{
    const before=page.url();await activate(`${HOME} [data-home-select="${sport}"]`);
    await page.waitForFunction(value=>document.querySelector('[data-page="home"]').dataset.homeSport===value,sport);
    assert.equal(page.url(),before,'Sport selection preserves the current Home URL');
    await active(page,'home');
    assert.equal(await page.locator(`${HOME} [data-home-select][aria-pressed="true"]`).count(),1);
    assert.equal(await page.locator(`${HOME} [data-home-select="${sport}"]`).getAttribute('aria-pressed'),'true');
    const cta=page.locator(`${HOME} [data-home-entry]`);
    assert.equal(await cta.isDisabled(),sport!=='nfl');
    assert.equal(await cta.getAttribute('data-open'),sport==='nfl'?'nfl':null);
    assert.equal((await cta.locator('[data-home-entry-label]').innerText()).trim(),sport==='nfl'?'Enter':`${sport.toUpperCase()} · Coming soon`);
    assert.equal(await cta.getAttribute('aria-label'),sport==='nfl'?'Enter NFL research':`${sport.toUpperCase()} research is coming soon`);
    assert.equal(await page.locator(`${HOME} [data-home-entry-arrow]`).isVisible(),sport==='nfl');
    assert.equal((await page.locator(`${HOME} [data-home-teams-label]`).innerText()).trim(),sport==='ufc'?'Fighters':'Teams');
    assert.match(await page.locator(`${HOME} [data-home-league-logo]`).getAttribute('alt'),new RegExp(`^${sport}\\b`,'i'));
    assert.equal(await page.locator(`${HOME} img[data-home-scene]:not([hidden])`).count(),1);
    assert.equal(await page.locator(`${HOME} img[data-home-scene="${sport}"]`).isVisible(),true);
    assert.equal(await page.locator(`${HOME} .home-league,${HOME} [data-home-title]`).count(),0);
    assert.equal(await page.locator(`${HOME} .brand-subtitle`).count(),1);
    assert.doesNotMatch(await page.locator(HOME).innerText(),/preview\s+only|\bNFA\b/i);
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-page="home"] img')].filter(img=>img.checkVisibility()).every(img=>img.complete&&img.naturalWidth>0));
    evidence.sports.push({sport,url:page.url(),entryText:(await cta.innerText()).trim(),input:touch?'native tap':'native click'});
  };
  for(const sport of SPORTS) {
    await select(sport);
    const geometry=await page.locator(HOME).evaluate(home=>{
      const controls=[...home.querySelectorAll('[data-home-select],[data-home-entry],.bottom-nav button')];
      return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
        controls:controls.map(el=>{const r=el.getBoundingClientRect();const sample=[[.5,.5],[.15,.2],[.85,.2],[.15,.8],[.85,.8]];
          return {label:el.getAttribute('aria-label')||el.innerText,disabled:el.disabled,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,
            points:sample.map(([x,y])=>{const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return {inside:hit===el||el.contains(hit),hit:hit?.tagName,hitClass:hit?.getAttribute('class')};})};})};
    });
    assert.ok(geometry.documentWidth<=geometry.viewport.width+1,'No Home horizontal overflow');
    for(const control of geometry.controls) {
      assert.ok(control.width>=44&&control.height>=44,`44px touch target: ${control.label}`);
      assert.ok(control.x>=-1&&control.right<=geometry.viewport.width+1,`Control fits width: ${control.label}`);
      if([393,430].includes(geometry.viewport.width)) {
        assert.ok(control.y>=-1&&control.bottom<=geometry.viewport.height+1,`Primary phone control fits: ${control.label}`);
        assert.ok(control.points.every(point=>point.inside),`Decorative light/gems never intercept control points: ${control.label}`);
      }
    }
    evidence.geometry.push({sport,...geometry});
    if(sport!=='nfl') {
      for(const hook of ['[data-open="nfl"]','[data-shortcut="matchups"]','[data-shortcut="insights"]']) {
        const before=page.url();await activate(`${HOME} .bottom-nav ${hook}`);await active(page,'home');
        assert.equal(page.url(),before,'Coming-soon navigation does not enter a different sport or mutate its URL');
        const status=await page.locator(`${HOME} .home-availability`).innerText();assert.match(status,new RegExp(sport,'i'));assert.match(status,/coming soon/i);
        evidence.guardedDestinations.push({sport,hook,url:page.url(),status});
      }
      await page.keyboard.press('Escape');assert.equal(await page.locator(`${HOME} .home-availability`).evaluate(el=>el.classList.contains('is-visible')),false);
    }
    await activate(`${HOME} [data-more]`);assert.equal(await page.locator('#about-dialog').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#about-dialog').isVisible(),false);
    evidence.more.push({sport,openAndEscapeClose:true});
    if(reload) {
      const before=page.url();await page.reload();await active(page,'home');
      await page.waitForFunction(value=>document.querySelector('[data-page="home"]').dataset.homeSport===value,sport);
      assert.equal(page.url(),before);assert.equal(await page.locator(`${HOME} [data-home-select="${sport}"]`).getAttribute('aria-pressed'),'true');
      evidence.refresh.push({sport,url:page.url(),restoredSessionSelection:true});
    }
  }
  const nfl=page.locator(`${HOME} [data-home-select="nfl"]`);await nfl.focus();
  for(const [key,sport] of [['Home','nfl'],['ArrowLeft','ufc'],['ArrowRight','nfl'],['End','ufc'],['Home','nfl']]) {
    const before=page.url();await page.keyboard.press(key);
    assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),sport);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.homeSelect),sport);
    assert.equal(page.url(),before);evidence.keyboard.push({key,sport,nativeFocus:true,url:page.url()});
  }
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nba');
  await page.keyboard.press('Enter');await active(page,'home');
  await page.keyboard.press('Home');await page.keyboard.press('Space');await active(page,'home');
  assert.equal(await page.locator(HOME).getAttribute('data-home-sport'),'nfl');
  await page.locator(`${HOME} [data-home-entry]`).focus();await page.keyboard.press('Enter');await active(page,'nfl');
  await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeMotionReason==='inactive');
  const running=await page.locator(HOME).evaluate(home=>home.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations===Infinity&&a.playState==='running').map(a=>({name:a.animationName,target:a.effect.target?.className})));
  assert.deepEqual(running,[],'All infinite Home decorative motion stops when NFL is active');
  evidence.nflKeyboardEntry={url:page.url(),homeMotionReason:'inactive',activeInfiniteHomeAnimations:0};
  await activate('[data-page="nfl"] [data-open="home"]');await active(page,'home');
  await page.waitForFunction(()=>document.querySelector('[data-page="home"]').dataset.homeMotionState==='running');
  evidence.return={url:page.url(),selectedSport:await page.locator(HOME).getAttribute('data-home-sport'),motion:'running'};
  return {status:'passed',...evidence,qualification:'Actual native inputs, reloads and hit testing; no substituted data, manipulated DOM/CSS, sought animation phases or altered clock.'};
}

async function auditProtectedNative(page,{base,touch=false,recordAction}={}) {
  assert.ok(base,'Actual app base URL is required for direct-route checks');
  const actions=[],tabs=[],directRoutes=[];
  const record=async value=>{const action={...value,at:new Date().toISOString(),url:page.url()};actions.push(action);if(recordAction)await recordAction(action);};
  const activate=async selector=>{const node=page.locator(selector);touch?await node.tap():await node.click();await record({kind:touch?'tap':'click',selector});};
  const select=async(selector,value)=>{await page.locator(selector).selectOption(value);await record({kind:'native-select-option',selector,value});};
  const ready=async()=>{await page.waitForFunction(()=>document.documentElement.dataset.dataReady==='true'&&window.PD_DATA?.roster?.length>0);};
  await active(page,'home');
  await activate(`${HOME} [data-home-select="nfl"]`);
  await activate(`${HOME} [data-home-entry]`);await active(page,'nfl');await ready();
  for(const tab of ['players','recap','ladder']) {
    await activate(`[data-page="nfl"] [data-nfl-tab="${tab}"]`);
    assert.equal(await page.locator(`[data-page="nfl"] [data-nfl-tab="${tab}"]`).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator(`#panel-${tab}`).isVisible(),true);tabs.push({page:'nfl',tab});
  }
  for(const conference of ['AFC','NFC']) {
    await activate(`[data-page="nfl"] [data-conference="${conference}"]`);
    assert.equal(await page.locator(`[data-conference="${conference}"]`).getAttribute('aria-pressed'),'true');
  }
  await select('#week-select','5');
  assert.equal(await page.locator('#week-select').inputValue(),'5');
  const qb='[data-page="nfl"] #panel-ladder [data-nfl-leader-panel="QB"] [data-nfl-action="leaders"]';
  const expanded=await page.locator(qb).getAttribute('aria-expanded');await activate(qb);
  assert.equal(await page.locator(qb).getAttribute('aria-expanded'),expanded==='true'?'false':'true');
  const standingsToggle='[data-page="nfl"] [data-standings-toggle]';
  if(await page.locator(standingsToggle).getAttribute('aria-expanded')!=='true')await activate(standingsToggle);
  assert.equal(await page.locator(standingsToggle).getAttribute('aria-expanded'),'true','All source-backed conference teams are open through the native control');
  assert.equal(await page.locator('[data-page="nfl"] .stand-row:visible').count(),16,'Every NFC club remains reachable independent of its current ranking');
  const dallas='[data-page="nfl"] [data-nfl-action="team"][data-team="DAL"]';
  if(await page.locator(dallas).getAttribute('aria-expanded')!=='true')await activate(dallas);
  assert.equal(await page.locator('[data-page="nfl"] [data-nfl-action="team"][data-team="DAL"]').getAttribute('aria-expanded'),'true');
  await activate('[data-page="nfl"] [data-nfl-action="team-details"][data-team="DAL"]');await active(page,'team-details');
  await page.waitForFunction(()=>document.documentElement.dataset.teamDataReady==='true'&&window.PDTeamDetails?.getDataset()?.teams?.DAL?.games);
  assert.match(page.url(),/#team\/DAL(?:\?|$)/);
  assert.equal(await page.evaluate(()=>window.PDTeamDetails.getState().team),'DAL');
  for(const tab of ['players','lineup','form']) {
    await activate(`[data-page="team-details"] [data-team-tab="${tab}"]`);
    assert.equal(await page.locator(`#team-tab-${tab}`).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator(`#team-panel-${tab}`).isVisible(),true);tabs.push({page:'team-details',tab});
  }
  const upcoming='[data-page="team-details"] .td-upcoming [data-td-action="matchup"]';
  assert.equal(await page.locator(upcoming).count(),1,'Exactly one Team upcoming-fixture entry');
  const upcomingId=await page.locator(upcoming).getAttribute('data-game');assert.ok(upcomingId,'Actual source-designated upcoming fixture is linked');
  await activate(upcoming);await active(page,'matchup-breakdown');
  await page.waitForFunction(()=>document.documentElement.dataset.matchupDataReady==='true'&&window.MatchupBreakdown?.getDataset()?.teams?.DAL?.games);
  const opened=await page.evaluate(()=>({state:window.MatchupBreakdown.getState(),fixture:window.MatchupBreakdown.getFixture()}));
  assert.equal(opened.state.team,'DAL');assert.equal(opened.state.game,upcomingId);assert.equal(opened.fixture.id,upcomingId,'Team entry and Matchup source fixture agree');
  for(const tab of ['form','lineup','players']) {
    await activate(`[data-page="matchup-breakdown"] [data-mb-tab="${tab}"]`);
    assert.equal(await page.locator(`#matchup-tab-${tab}`).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator(`#matchup-panel-${tab}`).isVisible(),true);tabs.push({page:'matchup-breakdown',tab});
  }
  for(const mode of ['average','total']) {
    await activate(`[data-page="matchup-breakdown"] [data-mb-mode="${mode}"]`);
    assert.equal(await page.locator(`[data-mb-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
  }
  for(const mode of ['opponent','pressure','venue','last5']) {
    await activate(`[data-page="matchup-breakdown"] [data-mb-qb="${mode}"]`);
    assert.equal(await page.locator(`[data-mb-qb="${mode}"]`).getAttribute('aria-selected'),'true');
  }
  await activate('[data-page="matchup-breakdown"] .mb-back[data-mb-action="back"]');await active(page,'team-details');
  assert.equal(await page.evaluate(()=>window.PDTeamDetails.getState().team),'DAL');
  await activate('[data-page="team-details"] .td-back[data-td-action="ladder"]');await active(page,'nfl');
  await activate('[data-page="nfl"] [data-open="home"]');await active(page,'home');
  const routes=[['home','home'],['nfl','nfl'],['steelers','steelers'],['team/DAL?tab=form','team-details'],
    [`matchup/DAL?tab=lineup&game=${encodeURIComponent(upcomingId)}`,'matchup-breakdown']];
  const expectedIndexSha256=hash(fs.readFileSync(path.join(ROOT,'index.html')));
  for(const [route,name] of routes) {
    const target=`${base}#${route}`,previousURL=new URL(page.url());
    const response=await page.goto(target,{waitUntil:'networkidle'});
    const navigationKind=response?'document-http':'same-document-fragment';
    if(response) {
      assert.equal(response.status(),200);
      assert.equal(hash(await response.body()),expectedIndexSha256,'Direct document response matches reviewed app HTML');
    } else {
      const targetURL=new URL(target);
      assert.equal(previousURL.origin, targetURL.origin,'Null navigation response is only valid within the same document origin');
      assert.equal(previousURL.pathname,targetURL.pathname,'Null navigation response is only valid within the same document path');
      assert.equal(previousURL.search,targetURL.search,'Null navigation response is only valid within the same document query');
      assert.equal(page.url(),target,'The exact requested fragment is loaded by native same-document navigation');
    }
    await record({kind:'native-direct-navigation',route,navigationKind,httpStatus:response?.status()??null});
    await ready();await active(page,name);
    if(name==='team-details')await page.waitForFunction(()=>document.documentElement.dataset.teamDataReady==='true');
    if(name==='matchup-breakdown')await page.waitForFunction(()=>document.documentElement.dataset.matchupDataReady==='true');
    const before=page.url(),reloadResponse=await page.reload({waitUntil:'networkidle'});
    assert.ok(reloadResponse,'Every direct-route refresh must perform an actual document request');
    assert.equal(reloadResponse.status(),200,'Every direct-route refresh returns a genuine HTTP 200');
    assert.equal(hash(await reloadResponse.body()),expectedIndexSha256,'Every actual refresh response matches reviewed app HTML');
    await record({kind:'native-reload',route,httpStatus:reloadResponse.status(),indexSha256:expectedIndexSha256});await ready();await active(page,name);
    assert.equal(page.url(),before,'Direct refresh preserves the exact route');
    if(name==='team-details') {await page.waitForFunction(()=>document.documentElement.dataset.teamDataReady==='true');assert.equal(await page.evaluate(()=>window.PDTeamDetails.getState().team),'DAL');}
    if(name==='matchup-breakdown') {
      await page.waitForFunction(()=>document.documentElement.dataset.matchupDataReady==='true');
      const state=await page.evaluate(()=>window.MatchupBreakdown.getState());assert.equal(state.team,'DAL');assert.equal(state.tab,'lineup');assert.equal(state.game,upcomingId);
    }
    directRoutes.push({route,name,navigationKind,directHttpStatus:response?.status()??null,refreshed:true,refreshHttpStatus:reloadResponse.status(),indexSha256:expectedIndexSha256,url:page.url()});
  }
  await activate('[data-page="matchup-breakdown"] [data-mb-action="home"]');await active(page,'home');
  await page.goBack();await record({kind:'native-browser-back'});await active(page,'matchup-breakdown');
  await page.goForward();await record({kind:'native-browser-forward'});await active(page,'home');
  return {status:'passed',actions,tabs,directRoutes,sourceDesignatedFixture:upcomingId,
    qualification:'Protected-flow smoke uses real native routes and source identity; exhaustive statistics audits remain separately source-bound and are not replaced by these controls checks.'};
}
async function controlsAudit(page,options={}) {
  const home=await auditHomeNative(page,{touch:options.viewport?.width<700,reload:true});
  const protectedRoutes=await auditProtectedNative(page,{...options,touch:options.viewport?.width<700});
  return {status:'passed',home,protectedRoutes};
}

module.exports={auditActualInteractions,auditHomeNative,auditProtectedNative,controlsAudit};
if(require.main===module) {
  const result=auditActualInteractions();
  const outputIndex=process.argv.indexOf('--output');
  if(outputIndex>=0) {const file=path.resolve(process.argv[outputIndex+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');}
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
