// Pool motions on floors 1..24: at every pool side with dry deck behind it, walk off the edge (fall, splash, float),
// turn back and push into the edge: the climb must start and end standing on the deck. Thin walls at an edge may never
// be climbed through, and a falling swimmer's eye stays above the water. Exits 1 on any failure.
// Run from anywhere: node poolrooms/test/pool.mjs   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'assert') errors.push(m.text()); });
await page.addInitScript(() => {                                     // freeze the game's own frame clock: only our simulate() steps count
  const raf = window.requestAnimationFrame.bind(window); let held = 0; window.__freeze = false;
  window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__freeze) held = t; cb(held); });
});
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__loaded === true, null, { timeout: 120000 });
await page.click('.card.pool');
await page.waitForFunction(() => window.__ready === true && window.__pr.me.pool, null, { timeout: 240000 });

const r = await page.evaluate(() => {
  window.__freeze = true;
  const pr = window.__pr, p = pr.player, SWIM = 1.35, EYE = 1.62, out = { edges: 0, walled: 0, bad: [], longestClimb: 0, lowestEyeOverWater: 9 };
  const step = (keys, until, max) => {
    pr.setActive(true); Object.assign(pr.keys, keys); let t = 0;
    while (t < max && !until() && Number.isFinite(p.gy + p.x + p.z)) { pr.simulate(1 / 60); t += 1 / 60; }
    for (const k in keys) pr.keys[k] = false; pr.setActive(false); return t;
  };
  for (let f = 1; f <= 24; f++) for (const pool of pr.genFloor(f).pools) {
    if (pool.water === null) continue;
    const deep = pool.bottom <= pool.water - SWIM + 0.01;
    for (const q of pool.rects) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((ax ? q[2] - q[0] : q[3] - q[1]) < 2.2) continue;
      const ex = ax > 0 ? q[2] : ax < 0 ? q[0] : (q[0] + q[2]) / 2, ez = az > 0 ? q[3] : az < 0 ? q[1] : (q[1] + q[3]) / 2, tag = `floor ${f} edge ${ex},${ez}`;
      pr.tp(f, ex - ax * 1.2, ez - az * 1.2);
      const g = (d, s = 0) => pr.groundAt(ex + ax * d - az * s, ez + az * d + ax * s);
      if (![0.2, 0.6, 1.0, 1.4].every((d) => [-0.35, 0, 0.35].every((s) => g(d, s) === 0))) continue;           // dry deck behind
      if (![-0.4, -1.0].every((d) => [-0.35, 0, 0.35].every((s) => (g(d, s) ?? 0) < -0.6))) continue;          // a real drop in front
      let wall = false; for (let d = -0.3; d <= 0.2; d += 0.01) if (g(d) === null) wall = true;
      if (wall) {                                                                    // swim up to it and push: no climb may start
        if (!deep) continue;
        out.walled++; pr.tp(f, ex - ax * 1.2, ez - az * 1.2, Math.atan2(-ax, -az), 0); step({}, () => false, 0.5); step({ KeyW: true }, () => p.climb, 2.5);
        if (p.climb) out.bad.push(tag + ': climbed through a wall');
        p.climb = null; continue;
      }
      out.edges++;
      pr.tp(f, ex + ax * 0.8, ez + az * 0.8, Math.atan2(ax, az), 0);                 // on the deck, facing the water: walk off
      step({ KeyW: true }, () => p.gy < -0.3, 4); step({}, () => false, 0.3);
      let lo = 9; step({}, () => { lo = Math.min(lo, p.gy); return !p.vy && p.gy < -0.3; }, 4);
      if (deep) out.lowestEyeOverWater = Math.min(out.lowestEyeOverWater, lo + EYE - pool.water);
      if (p.gy > -0.3 || p.vy) { out.bad.push(tag + ': never settled in the water'); continue; }
      p.yaw = Math.atan2(-ax, -az);                                                  // turn back and push into the edge
      step({ KeyW: true }, () => p.climb, 4);
      if (!p.climb) { out.bad.push(tag + ': no climb'); continue; }
      out.longestClimb = Math.max(out.longestClimb, step({}, () => !p.climb, 4));
      if (p.climb || pr.groundAt(p.x, p.z) !== 0 || Math.abs(p.gy) > 0.01) out.bad.push(tag + `: climb ended at gy ${p.gy.toFixed(2)}`);
    }
  }
  return out;
});
await browser.close();

if (r.lowestEyeOverWater < 0.05) r.bad.push(`eye only ${r.lowestEyeOverWater.toFixed(2)} m over the water on entry`);
if (r.longestClimb > 2) r.bad.push(`a climb took ${r.longestClimb.toFixed(2)} s`);
for (const b of r.bad.slice(0, 30)) console.error(b);
for (const e of errors) console.error('page:', e);
console.log(`${r.edges} pool edges in and out, ${r.walled} walled edges refused, longest climb ${r.longestClimb.toFixed(2)} s, ` +
  `eye >= ${r.lowestEyeOverWater.toFixed(2)} m over water, ${r.bad.length} problems, ${errors.length} page errors`);
process.exitCode = r.bad.length || errors.length || !r.edges ? 1 : 0;
