// Pool motions on floors P..24 (P is the pool floor): at every pool side with dry deck behind it, walk off the edge (fall, splash, float),
// turn back and push into the edge: the climb must start and end standing on the deck, and a falling swimmer's eye stays above
// the water. On floor P, lane ropes, floats and ladders are solid, and no climb starts through a ladder.
// Exits 1 on any failure.
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
  const pr = window.__pr, p = pr.player, SWIM = 1.35, EYE = 1.62, out = { edges: 0, bad: [], longestClimb: 0, lowestEyeOverWater: 9 };
  const tp = (...a) => { pr.tp(...a); pr.npc.on = false; };             // the wandering NPC is solid: keep it out of the way
  const step = (keys, until, max) => {
    pr.setActive(true); Object.assign(pr.keys, keys); let t = 0;
    while (t < max && !until() && Number.isFinite(p.gy + p.x + p.z)) { pr.simulate(1 / 60); t += 1 / 60; }
    for (const k in keys) pr.keys[k] = false; pr.setActive(false); return t;
  };
  for (let f = 0; f <= 24; f++) for (const pool of pr.genFloor(f).pools) {
    if (pool.water === null) continue;
    const deep = pool.bottom <= pool.water - SWIM + 0.01;
    for (const q of pool.rects) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((ax ? q[2] - q[0] : q[3] - q[1]) < 2.2) continue;
      const ex = ax > 0 ? q[2] : ax < 0 ? q[0] : (q[0] + q[2]) / 2, ez = az > 0 ? q[3] : az < 0 ? q[1] : (q[1] + q[3]) / 2, tag = `floor ${f} edge ${ex},${ez}`;
      tp(f, ex - ax * 1.2, ez - az * 1.2);
      const g = (d, s = 0) => pr.groundAt(ex + ax * d - az * s, ez + az * d + ax * s);
      if (![0.2, 0.6, 1.0, 1.4].every((d) => [-0.35, 0, 0.35].every((s) => g(d, s) === 0))) continue;           // dry deck behind
      if (![-0.4, -1.0].every((d) => [-0.35, 0, 0.35].every((s) => (g(d, s) ?? 0) < -0.6))) continue;          // a real drop in front
      let open = true; for (let d = -0.8; d <= 1.4; d += 0.1) for (let s = -0.4; s <= 0.401; s += 0.05) if (g(d, s) === null) open = false;
      if (!open) continue;                                                           // a ladder or rope on the way in: not this spot
      out.edges++;
      tp(f, ex + ax * 0.8, ez + az * 0.8, Math.atan2(ax, az), 0);                    // on the deck, facing the water: walk off
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
  // floor P (hall x -26..26, z 6.25..56.25): lap pool x -23.5..-15.5 with ropes at x -21.5 / -19.5 / -17.5, ladders at its south end
  const face = (x, z) => Math.atan2(-x, -z);
  pr.tp(0, -22.5, 30, face(1, 0), 0); step({ KeyW: true }, () => false, 3);
  if (p.x > -21.5 - 0.06 - 0.25) out.bad.push(`swam through a lane rope to x ${p.x.toFixed(2)}`);
  pr.tp(0, -24.6, 12.0, face(1, 0), 0); step({ KeyW: true }, () => false, 3);
  if (p.x > -22.82 - 0.25) out.bad.push(`walked through the ladder to x ${p.x.toFixed(2)}`);
  pr.tp(0, -22.5, 13.6, face(0, -1), 0); step({ KeyW: true }, () => p.climb, 2.5);  // swim into that ladder from the water
  if (p.climb) out.bad.push('climbed out through a ladder'); else if (p.z < 12.45 + 0.25) out.bad.push(`swam into the ladder to z ${p.z.toFixed(2)}`);
  p.climb = null;
  const fl = pr.floaters.filter((f) => f.fi === 0 && f.r > 0.3 && f.x > -9 && f.x < 9)[0];
  if (!fl) out.bad.push('no float in the lagoon on floor P');
  else {
    const x0 = fl.obj.position.x, z0 = fl.obj.position.z, sx = x0 > 0 ? x0 - 1.8 : x0 + 1.8, dir = x0 > 0 ? 1 : -1;
    pr.tp(0, sx, z0, face(dir, 0), 0); let closest = 9;
    step({ KeyW: true }, () => { closest = Math.min(closest, Math.hypot(fl.obj.position.x - p.x, fl.obj.position.z - p.z) - fl.r - 0.28); return false; }, 2.5);
    const moved = Math.hypot(fl.obj.position.x - x0, fl.obj.position.z - z0);
    if (moved < 0.2) out.bad.push(`the float did not move when swum into (${moved.toFixed(2)} m)`);
    if (closest < -0.05) out.bad.push(`swam ${(-closest).toFixed(2)} m into a float`);
    out.floatMoved = +moved.toFixed(2);
  }
  return out;
});
await browser.close();

if (r.lowestEyeOverWater < 0.05) r.bad.push(`eye only ${r.lowestEyeOverWater.toFixed(2)} m over the water on entry`);
if (r.longestClimb > 4) r.bad.push(`a climb took ${r.longestClimb.toFixed(2)} s`);
for (const b of r.bad.slice(0, 30)) console.error(b);
for (const e of errors) console.error('page:', e);
console.log(`${r.edges} pool edges in and out, longest climb ${r.longestClimb.toFixed(2)} s, float pushed ${r.floatMoved} m, ` +
  `eye >= ${r.lowestEyeOverWater.toFixed(2)} m over water, ${r.bad.length} problems, ${errors.length} page errors`);
process.exitCode = r.bad.length || errors.length || !r.edges ? 1 : 0;
