// The guns in all three modes: 1 draws the pistol; a shot lands on the wall that is drawn where it was aimed (within 3 cm, facing
// back); the magazine runs dry and reloads itself; 2 swaps to the rifle, which fires on its own while the trigger is held, with both
// gloves on it (each hand within 1 mm of where it belongs on the gun); the Backrooms creature staggers and the hard-mode entity
// dissolves when hit.
// Exits 1 on any failure.
// Run from anywhere: node poolrooms/test/gun.mjs   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const bad = [];
async function open(card, hook) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => bad.push(`${card} page: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'assert') bad.push(`${card} page: ${m.text()}`); });
  await page.goto(new URL('../index.html', import.meta.url).href);
  await page.waitForFunction(() => window.__loaded === true, null, { timeout: 120000 });
  await page.click(card);
  await page.waitForFunction((h) => window[h] && window[h].me && window[h].me.gun, hook, { timeout: 240000 });
  return page;
}

// ---- Poolrooms: aim at the far wall of the lobby on floor 1, first person
{
  const page = await open('.card.pool', '__pr');
  const r = await page.evaluate(async () => {
    const T = await import('three'), pr = window.__pr, g = pr.me.gun, out = {};
    pr.setActive(true); pr.setView(false);
    const step = (s) => { for (let i = 0; i < Math.round(s * 60); i++) { pr.simulate(1 / 60); g.update(1 / 60); } };
    pr.tp(1, 2, 5, -Math.PI / 2, 0);                                     // in the lobby, facing +x
    g.toggle('pistol'); step(0.5);
    const cam = pr.camera; cam.position.set(2, 1.62, 5); cam.rotation.set(0, -Math.PI / 2, 0); cam.updateMatrixWorld();
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(0, 0), cam);   // what is really drawn straight ahead
    out.wall = rc.intersectObjects(pr.floorGroups[1].children, true).find((h) => h.distance > 0.2)?.distance;
    out.fired = g.fire(); out.hit = g.st.hit && Math.hypot(g.st.hit.p[0] - 2, g.st.hit.p[1] - 1.62, g.st.hit.p[2] - 5); out.n = g.st.hit && g.st.hit.n;
    for (let i = 0; i < 12; i++) { step(0.2); g.fire(); }                // 8 rounds, then a dry click starts the reload
    out.reloading = g.st.reload >= 0; step(2.2); out.ammo = g.st.ammo.pistol;
    // the rifle: swap, hold the trigger for a second; both hands where they belong on it
    g.toggle('rifle'); step(1.0); out.rifle = g.cur;
    const B = pr.me.body.B, gun = pr.scene.getObjectByName('rifle'), hands = {};
    for (const [s, h] of [['Right', [0.03, -0.0463, 0.071]], ['Left', [-0.054, 0.0852, -0.258]]]) hands[s] = B[s + 'Hand'].getWorldPosition(new T.Vector3()).distanceTo(gun.localToWorld(new T.Vector3(...h)));
    out.hands = hands; const a0 = g.st.ammo.rifle; g.trigger(true); step(1.0); g.trigger(false); out.burst = a0 - g.st.ammo.rifle;
    return out;
  });
  if (!r.fired) bad.push('poolrooms: the drawn gun did not fire');
  else if (!r.hit || Math.abs(r.hit - r.wall) > 0.03) bad.push(`poolrooms: shot landed ${r.hit && r.hit.toFixed(3)} m ahead, the drawn wall is at ${r.wall && r.wall.toFixed(3)} m`);
  else if (r.n[0] !== -1) bad.push(`poolrooms: bullet hole faces ${r.n}`);
  if (!r.reloading || r.ammo !== 8) bad.push(`poolrooms: empty magazine reloading ${r.reloading}, ammo after ${r.ammo}`);
  if (r.rifle !== 'rifle') bad.push(`poolrooms: key 2 left ${r.rifle} in hand`);
  for (const s in r.hands || {}) if (!(r.hands[s] < 0.001)) bad.push(`poolrooms: ${s.toLowerCase()} glove ${(r.hands[s] * 100).toFixed(1)} cm off the rifle`);
  if (!(r.burst >= 9)) bad.push(`poolrooms: holding the trigger fired ${r.burst} rifle rounds in a second`);
  console.log(`poolrooms: shot landed ${r.hit && r.hit.toFixed(3)} m ahead, wall drawn at ${r.wall && r.wall.toFixed(3)} m, reload ok ${r.reloading && r.ammo === 8}, ` +
    `rifle burst ${r.burst} rounds, gloves off the rifle by ${Object.values(r.hands || {}).map((d) => (d * 1000).toFixed(2) + ' mm').join(' / ')}`);
  await page.close();
}

// ---- Backrooms and hard mode: the monster 3.5 m ahead in first person; key 1 draws, a shot or three must reach it
for (const [card, hook] of [['.card.back', '__br'], ['.card.hard', '__hd']]) {
  const page = await open(card, hook);
  if (hook === '__hd') { await page.click('#hd-enter'); await page.waitForFunction(() => window.__hd.state() === 'play', null, { timeout: 20000 }); }
  else await page.evaluate(() => { const b = window.__br; b.setActive(true); b.skipIntro(); document.getElementById('br-overlay').hidden = true; });
  await page.keyboard.press('Digit1');
  const r = await page.evaluate((hook) => {
    const h = window[hook], p = h.player, g = h.me.gun, tick = (s) => { for (let i = 0; i < s * 30; i++) (h.step || h.tick)(1 / 30); };
    tick(0.5); const drawn = g.drawn;
    const ahead = (d) => [p.x - Math.sin(p.yaw) * d, p.z - Math.cos(p.yaw) * d];
    let clear = false;                                                   // turn until 3.5 m ahead is in plain view
    for (let k = 0; k < 4 && !clear; k++) {
      if (k) { p.yaw += Math.PI / 2; if ('yawT' in p) p.yawT = p.yaw; tick(0.3); }
      const [x, z] = ahead(3.5); clear = hook === '__br' ? h.playerSees(x, z) : !h.occluded(p.x, p.z, x, z);
    }
    if (!clear) return { drawn, skip: true };                            // boxed in on all four sides: nothing to aim along
    const [x, z] = ahead(3.5);
    if (hook === '__br') { Object.assign(h.mon, { x, z, state: 'patrol', stagger: 0 }); h.mon.L.root.visible = true; h.placeCreature(); }
    else Object.assign(h.ent, { x, z, shown: { x, z }, vis: true, ghost: false, mode: 'watch', life: 20 });
    if ('pitchT' in p) p.pitchT = 0; p.pitch = 0;
    let hit = false;
    for (let i = 0; i < 3 && !hit; i++) { g.fire(); hit = hook === '__br' ? h.mon.stagger > 0 : h.ent.mode === 'fade'; tick(0.25); }
    return { drawn, hit, wall: g.st.hit && !g.st.hit.target };
  }, hook);
  if (!r.drawn) bad.push(`${hook}: key 1 did not draw the gun`);
  if (!r.hit && !r.skip) bad.push(`${hook}: the monster did not react to shots${r.wall ? ' (a wall was in the way)' : ''}`);
  console.log(`${hook}: drawn ${r.drawn}, monster reacted ${r.hit}`);
  await page.close();
}
await browser.close();

for (const b of bad.slice(0, 30)) console.error(b);
console.log(`${bad.length} problems`);
process.exitCode = bad.length ? 1 : 0;
