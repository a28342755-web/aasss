// Floor generator check: 361 floors must be reachable from the elevator, on the 0.25 m grid, overlap-free,
// inside the plan, with real doors and at most 10 lights and 10 windows. Exits 1 on any failure.
// Run from anywhere: node poolrooms/test/gen.mjs   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'assert') errors.push(m.text()); });
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__loaded === true, null, { timeout: 120000 });
await page.click('.card.pool');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });

const r = await page.evaluate(() => {
  const pr = window.__pr, bad = [], al = (v) => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9, t0 = performance.now();
  let n = 0;
  for (let f = -60; f <= 300; f++, n++) {
    const D = pr.genFloor(f), main = D.rooms.filter((rm) => rm.kind);
    if (!pr.reachable(D)) bad.push([f, 'unreachable']);
    if (D.wins.length > 10) bad.push([f, 'wins ' + D.wins.length]);
    if (D.lights.length > 10) bad.push([f, 'lights ' + D.lights.length]);
    const rects = [...D.rooms.map((rm) => [rm.x0, rm.z0, rm.x1, rm.z1]), ...D.pools.flatMap((p) => p.rects), ...D.steps, ...D.holes];
    for (const q of rects) if (![q[0], q[1], q[2], q[3]].every(al) || q[2] <= q[0] || q[3] <= q[1]) bad.push([f, 'rect ' + q.slice(0, 4).join(',')]);
    for (const rm of D.rooms) if (rm.x0 < -39 || rm.x1 > 39 || rm.z0 < -9 || rm.z1 > 69) bad.push([f, 'out of plan']);
    for (let a = 0; a < D.rooms.length; a++) for (let b = a + 1; b < D.rooms.length; b++) {
      const A = D.rooms[a], B = D.rooms[b];
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.z0 < B.z1 && B.z0 < A.z1) bad.push([f, `rooms ${a} and ${b} overlap`]);
    }
    for (const rm of main) for (const d of rm.doors) {
      const ns = d.side === 'n' || d.side === 's', lo = ns ? rm.x0 : rm.z0, hi = ns ? rm.x1 : rm.z1;
      if (d.lo < lo || d.hi > hi || d.hi - d.lo < 2) bad.push([f, `door ${d.side} ${d.lo}..${d.hi} outside ${lo}..${hi}`]);
    }
    for (const w of D.wins) if (!al(w[2])) bad.push([f, 'window off grid']);
  }
  return { n, ms: (performance.now() - t0) / n, bad };
});
await browser.close();

for (const b of r.bad.slice(0, 30)) console.error('floor', ...b);
for (const e of errors) console.error('page:', e);
console.log(`${r.n} floors, ${r.ms.toFixed(1)} ms each, ${r.bad.length} problems, ${errors.length} page errors`);
process.exitCode = r.bad.length || errors.length ? 1 : 0;
