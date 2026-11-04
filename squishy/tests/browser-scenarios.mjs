// Browser test: drives the eight required touch scenarios in the real page with
// real pointer input (mouse, and CDP multi-touch for the two-finger cases),
// monitors stability from the page's debug hook the whole time, and saves a
// screenshot of each scenario at its peak deformation.
//
//   cd squishy && python3 -m http.server 8000      (in one terminal)
//   node tests/browser-scenarios.mjs [outDir]      (needs `playwright`)
//
// Env: SQUISHY_URL (default http://localhost:8000/), SQUISHY_TIER (low|medium|high),
//      THREE_DIR (serve three@0.170.0 from a local copy instead of the CDN).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// playwright may be installed locally or globally (NODE_PATH)
let pw;
try {
  pw = await import('playwright');
} catch {
  pw = createRequire(import.meta.url)('playwright');
}
const { chromium } = pw;

const URL = process.env.SQUISHY_URL || 'http://localhost:8000/';
const TIER = process.env.SQUISHY_TIER || 'medium';
const OUT = process.argv[2] || 'browser-out';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && logs.push(m.text()));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
if (process.env.THREE_DIR) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/, (route) => {
    const file = path.join(process.env.THREE_DIR, route.request().url().replace(/.*three@0\.170\.0\//, ''));
    if (fs.existsSync(file)) route.fulfill({ path: file, contentType: 'application/javascript' });
    else route.abort();
  });
}
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.addInitScript((tier) => {
  localStorage.setItem('chapssal:quality', JSON.stringify(tier));
  localStorage.setItem('chapssal:hints2', '31');
}, TIER);
await page.goto(`${URL}?debug`);
await page.waitForFunction(() => window.__chapssal?.physics?.hasState, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const cdp = await context.newCDPSession(page);

// ---- helpers ------------------------------------------------------------------
const sleep = (ms) => page.waitForTimeout(ms);
const at = (x, y, z) => page.evaluate(([a, b, c]) => window.__chapssal.restScreenOf(a, b, c), [x, y, z]);
const world = (x, y, z) => page.evaluate(([a, b, c]) => window.__chapssal.screenOf(a, b, c), [x, y, z]);

async function startMonitor() {
  await page.evaluate(() => {
    const m = (window.__mon = { inverted: 0, minJ: Infinity, maxJ: 0, nan: 0, samples: 0, maxDepth: 0, maxStretch: 0, maxForce: 0 });
    clearInterval(window.__monT);
    window.__monT = setInterval(() => {
      const d = window.__chapssal.diag();
      m.samples++;
      m.inverted = Math.max(m.inverted, d.inverted);
      m.minJ = Math.min(m.minJ, d.minJ);
      m.maxJ = Math.max(m.maxJ, d.maxJ);
      m.nan = Math.max(m.nan, d.nan);
      for (const f of window.__chapssal.physics.fingers) {
        m.maxDepth = Math.max(m.maxDepth, f.depth);
        m.maxStretch = Math.max(m.maxStretch, f.stretch);
        m.maxForce = Math.max(m.maxForce, f.force);
      }
    }, 40);
  });
}
const stopMonitor = () => page.evaluate(() => { clearInterval(window.__monT); return window.__mon; });

async function settle(maxMs = 6000) {
  const t0 = Date.now();
  let ke = 1;
  while (Date.now() - t0 < maxMs) {
    await sleep(250);
    ke = await page.evaluate(() => window.__chapssal.physics.stats.ke);
    if (ke < 2e-6) break;
  }
  return ke;
}

const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 14, radiusY: 14, force: 0.8 })),
});

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 170, y: 120, width: 560, height: 520 } });
}

// ---- scenarios -------------------------------------------------------------------
const SCENARIOS = {
  async '1-center-press'() {
    const p = await at(0, 0.95, 1.12);
    await page.keyboard.down('Shift');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(1600);
    await shot('1-center-press');
    await page.mouse.up();
    await page.keyboard.up('Shift');
  },
  async '2-cheek-press'() {
    const p = await at(0.5, 0.77, 1.08);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(1100);
    await shot('2-cheek-press');
    await page.mouse.up();
  },
  async '3-ear-pull'() {
    const p = await at(0.62, 1.95, -0.08);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let k = 1; k <= 16; k++) {
      await page.mouse.move(p.x + k * 4.5, p.y - k * 6.5);
      await sleep(35);
    }
    await sleep(150);
    await shot('3-ear-pull');
    await page.mouse.up();
  },
  async '4-squeeze-both-sides'() {
    const a = await at(-1.12, 0.8, 0.45), b = await at(1.12, 0.8, 0.45);
    await touch('touchStart', [{ ...a, id: 1 }, { ...b, id: 2 }]);
    await sleep(1600);
    await shot('4-squeeze-both-sides');
    await touch('touchEnd', []);
  },
  async '5-press-and-drag'() {
    const a = await at(0, 1.62, 0.35), b = await at(-0.55, 0.72, 1.05);
    await touch('touchStart', [{ ...a, id: 1 }]);
    await sleep(300);
    await touch('touchStart', [{ ...a, id: 1 }, { ...b, id: 2 }]);
    for (let k = 1; k <= 20; k++) {
      await touch('touchMove', [{ ...a, id: 1 }, { x: b.x - k * 4, y: b.y - k * 1.2, id: 2 }]);
      await sleep(40);
      if (k === 14) await shot('5-press-and-drag');
    }
    await touch('touchEnd', [{ ...a, id: 1 }]);
    await sleep(300);
    await touch('touchEnd', []);
  },
  async '6-rapid-kneading'() {
    const spots = [await at(0, 1.4, 0.75), await at(0.6, 0.85, 1.0), await at(-0.6, 0.85, 1.0), await at(0, 0.65, 1.15)];
    for (let k = 0; k < 18; k++) {
      const s = spots[k % spots.length];
      await page.mouse.move(s.x, s.y);
      await page.mouse.down();
      await sleep(60);
      if (k === 13) await shot('6-rapid-kneading');
      await page.mouse.up();
      await sleep(25);
    }
  },
  async '7-shake-and-release'() {
    const p = await world(0.15, 0.06, 1.72); // front rim of the plate
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const t0 = Date.now();
    let shotDone = false;
    while (Date.now() - t0 < 1600) {
      const t = (Date.now() - t0) / 1000;
      await page.mouse.move(p.x + 70 * Math.sin(t * 2 * Math.PI * 3), p.y + 10 * Math.sin(t * 2 * Math.PI * 1.7));
      await sleep(16);
      if (!shotDone && t > 0.9) { await shot('7-shake'); shotDone = true; }
    }
    await page.mouse.up();
    await sleep(120);
    await shot('7-after-release');
  },
  async '8-sequential-multi-part'() {
    const cheek = await at(-0.5, 0.77, 1.08);
    await page.mouse.move(cheek.x, cheek.y);
    await page.mouse.down();
    await sleep(500);
    await page.mouse.up();
    const ear = await at(-0.62, 1.95, -0.08);
    await page.mouse.move(ear.x, ear.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) { await page.mouse.move(ear.x - k * 5, ear.y - k * 5); await sleep(35); }
    await page.mouse.up();
    const top = await at(0.1, 1.6, 0.35), side = await at(1.1, 0.7, 0.5);
    await touch('touchStart', [{ ...top, id: 3 }]);
    await sleep(250);
    await touch('touchStart', [{ ...top, id: 3 }, { ...side, id: 4 }]);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', [{ ...top, id: 3 }, { x: side.x + k * 3, y: side.y + k * 3, id: 4 }]); await sleep(40); }
    await shot('8-sequential-multi-part');
    await touch('touchEnd', [{ ...top, id: 3 }]);
    await touch('touchEnd', []);
    const belly = await at(0, 0.8, 1.12);
    await page.mouse.move(belly.x, belly.y);
    await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
  },
};

const report = [];
await shot('0-rest');
for (const [name, run] of Object.entries(SCENARIOS)) {
  await startMonitor();
  await run();
  const ke = await settle();
  const m = await stopMonitor();
  await shot(`${name}-settled`);
  const fails = [];
  if (m.nan) fails.push('NaN');
  if (m.inverted) fails.push(`inverted tets ${m.inverted}`);
  if (m.minJ < 0.05) fails.push(`minJ ${m.minJ.toFixed(3)}`);
  if (ke > 2e-6) fails.push(`still moving (KE ${ke.toExponential(1)})`);
  report.push({ name, ok: !fails.length, fails, ke, ...m });
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name.padEnd(26)} depth ${m.maxDepth.toFixed(2)} pull ${m.maxStretch.toFixed(2)} F ${m.maxForce.toFixed(2)}N J ${m.minJ.toFixed(2)}..${m.maxJ.toFixed(2)} KE ${ke.toExponential(1)} samples ${m.samples}${fails.length ? '  <-- ' + fails.join('; ') : ''}`);
}
const stats = await page.evaluate(() => window.__chapssal.physics.stats);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ tier: TIER, stats, report, errors: logs }, null, 2));
console.log('physics', JSON.stringify(stats));
if (logs.length) console.log('page errors:\n' + logs.join('\n'));
await browser.close();
process.exitCode = report.every((r) => r.ok) && !logs.length ? 0 : 1;
