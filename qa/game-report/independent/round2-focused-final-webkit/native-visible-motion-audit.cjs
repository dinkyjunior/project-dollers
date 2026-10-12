'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const PIXELS = 'import hashlib,io,sys\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")\nprint(hashlib.sha256(im.tobytes()).hexdigest())';
const schedule = [690, 2190]; // Declared before running; at most three untouched frames.
async function sample(page, scope) {
  return page.locator(scope).evaluate(p => {
    const scroll = p.querySelector('.page-scroll') || p, clip = scroll.getBoundingClientRect();
    const floor = Math.max(0, clip.top), ceiling = Math.min(innerHeight, clip.bottom);
    return {motion:p.dataset.grMotion, now:performance.now(), clocks:p.getAnimations({subtree:true}).filter(a => a.effect?.getComputedTiming().iterations === Infinity).map((a,index) => {
      const t = a.effect.target, rect = t.getBoundingClientRect(), timing = a.effect.getComputedTiming();
      return {key:index + ':' + a.animationName + ':' + (a.effect.pseudoElement || ''), name:a.animationName,
        target:t.className?.baseVal || t.className, pseudo:a.effect.pseudoElement,
        currentTime:a.currentTime, startTime:a.startTime, playState:a.playState, pending:a.pending,
        duration:timing.duration, progress:timing.progress,
        fullyVisible:rect.width > 0 && rect.height > 0 && rect.top >= floor && rect.bottom <= ceiling && rect.left >= 0 && rect.right <= innerWidth,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    })};
  });
}
module.exports = async function audit({page,r,capture,scope,out}) {
  await page.locator(scope + ' .gr-tabs').scrollIntoViewIfNeeded();
  await page.bringToFront();
  const proof = {scheduleMs:schedule, maximumOriginalFramesPerPhase:3,
    qualification:'Original unpaused PNGs plus every fully visible native infinite light clock. Fixed bounded natural sampling accounts for equal-pixel phases; no seeking, pausing, overriding styles, clock replacement or response substitution.'};
  async function phase(name) {
    const frames = [];
    async function original() {
      const png = await capture(page,r,'native-motion-' + name + '-' + r.viewport.width + '-' + frames.length);
      const bytes = fs.readFileSync(path.join(out,png.file));
      const pixelsSha256 = execFileSync('python3',['-c',PIXELS],{input:bytes,encoding:'utf8'}).trim();
      frames.push({file:png.file,pixelsSha256,clocks:await sample(page,scope)});
    }
    await original();
    for (const delay of schedule) {
      await page.waitForTimeout(delay);
      await original();
      if (new Set(frames.map(frame => frame.pixelsSha256)).size > 1) break;
    }
    const first = frames[0].clocks.clocks.filter(clock => clock.fullyVisible);
    assert.ok(first.length,'A real infinite lighting clock is fully visible in the native viewport');
    for (let i = 1; i < frames.length; i++) for (const start of first) {
      const next = frames[i].clocks.clocks.find(clock => clock.key === start.key);
      assert.ok(next,'The same native clock remains present while reading');
      assert.equal(next.playState,'running','Each fully visible native light is running');
      assert.ok(next.currentTime > start.currentTime + 1,'Every fully visible unseeked light clock advances');
      assert.equal(next.startTime,start.startTime,'No native clock restart is hidden in the measurement');
    }
    assert.ok(new Set(frames.map(frame => frame.pixelsSha256)).size > 1,'Actual native pixels change within the fixed three-frame schedule');
    return {frames,visibleClockCount:first.length,pixelChanged:true};
  }
  proof.normal = await phase('normal');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(150);
  proof.reduced = await sample(page,scope);
  assert.equal(proof.reduced.clocks.filter(clock => clock.playState === 'running').length,0,'Actual reduced-motion preference stops report infinite light');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForTimeout(150);
  proof.restored = await phase('restored');
  return proof;
};
module.exports.sample = sample;
