// Self-checks for the shared game logic: `node whiteout/test.mjs`
import assert from 'node:assert/strict';
import { World, moveBody, findVault, rayHitbox, sampleAt, R, H_STAND, F } from './src/core.js';
import { collisionBoxes, SPAWNS, NAV_NODES, NAV_EDGES, MAT } from './src/map.js';
import { Sim, validateClaim } from './src/sim.js';

const world = new World(collisionBoxes());
const body = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, r: R, h: H_STAND, onGround: false });
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

ok('raycast hits the west wall of the main alley', () => {
  const h = world.raycast(0, 1.5, 0, -1, 0, 0, 100);
  assert.ok(h && Math.abs(h.t - 3.5) < 1e-6 && h.n[0] === 1 && h.mat === MAT.BRICK);
});
ok('raycast down hits snow', () => {
  const h = world.raycast(0, 1.5, 0, 0, -1, 0, 100);
  assert.ok(h && Math.abs(h.t - 1.5) < 1e-6 && h.mat === MAT.SNOW);
});
ok('body lands and walls stop it', () => {
  const b = body(0, 2, 0);
  for (let i = 0; i < 60; i++) moveBody(world, b, 1 / 60);
  assert.ok(b.onGround && Math.abs(b.y) < 1e-6);
  b.vx = -6;
  for (let i = 0; i < 60; i++) { b.vx = -6; moveBody(world, b, 1 / 60); }
  assert.ok(b.x > -3.5 + R - 0.01 && b.x < -3.5 + R + 0.01, 'stopped at wall, x=' + b.x);
});
ok('steps up the loading dock stairs', () => {
  const b = body(24.6, 0, -5.7);
  for (let i = 0; i < 120; i++) { b.vx = 3; moveBody(world, b, 1 / 60); }
  assert.ok(Math.abs(b.y - 1.15) < 1e-6, 'on dock, y=' + b.y);
});
ok('vaults the jersey barrier', () => {
  const b = body(-1.5, 0, -14.6); b.onGround = true;
  const v = findVault(world, b, 0, -1);
  assert.ok(v && v.kind === 'vault', JSON.stringify(v));
  const end = v.path[v.path.length - 1];
  assert.ok(end[2] < -16.3 && world.bodyFree(end[0], end[1], end[2], R, H_STAND));
});
ok('mantles onto the loading dock', () => {
  const b = body(26.0, 0, -13); b.onGround = true;
  const v = findVault(world, b, 1, 0);
  assert.ok(v && v.kind === 'mantle' && Math.abs(v.path[2][1] - 1.15) < 1e-6, JSON.stringify(v));
});
ok('no vault into a building wall', () => {
  const b = body(-3.0, 0, 0); b.onGround = true;
  assert.equal(findVault(world, b, -1, 0), null);
});
ok('hitboxes: head, chest, legs, miss', () => {
  const st = [0, 0, 0, 0, 0, 0];
  assert.equal(rayHitbox(0, 1.63, 5, 0, 0, -1, 100, st).zone, 0);
  assert.equal(rayHitbox(0.1, 1.3, 5, 0, 0, -1, 100, st).zone, 1);
  assert.equal(rayHitbox(0.11, 0.4, 5, 0, 0, -1, 100, st).zone, 4);
  assert.equal(rayHitbox(0.6, 1.3, 5, 0, 0, -1, 100, st), null);
  const crouched = [0, 0, 0, Math.PI / 2, 0, F.CROUCH];
  assert.equal(rayHitbox(5, 1.6, 0, -1, 0, 0, 100, crouched), null, 'crouched head is lower');
});
ok('interpolation lerps and snaps across teleports', () => {
  const buf = [{ t: 0, s: [0, 0, 0, 0, 0, 0] }, { t: 100, s: [1, 0, 0, 0, 0, 0] }, { t: 200, s: [20, 0, 0, 0, 0, 0] }];
  assert.ok(Math.abs(sampleAt(buf, 50)[0] - 0.5) < 1e-9);
  assert.equal(sampleAt(buf, 150)[0], 20);
});
ok('spawns are clear', () => {
  for (const [x, y, z] of SPAWNS) assert.ok(world.bodyFree(x, y, z, R, H_STAND), 'spawn ' + [x, y, z]);
});
ok('nav nodes and edges are walkable', () => {
  for (const [a, b] of NAV_EDGES) {
    const A = NAV_NODES[a], B = NAV_NODES[b], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let s = 0; s <= len; s += 0.2) {
      const x = A[0] + (B[0] - A[0]) * s / len, z = A[1] + (B[1] - A[1]) * s / len;
      const y = world.floorAt(x, z, R, 1.2);
      assert.ok(world.bodyFree(x, y, z, R, H_STAND), `edge ${a}-${b} blocked at ${x.toFixed(2)},${z.toFixed(2)}`);
    }
  }
  const seen = new Set([0]), q = [0];
  while (q.length) { const i = q.pop(); for (const [a, b] of NAV_EDGES) for (const [u, v] of [[a, b], [b, a]]) if (u === i && !seen.has(v)) { seen.add(v); q.push(v); } }
  assert.equal(seen.size, NAV_NODES.length, 'nav graph connected');
});
ok('host validates an honest lag-compensated claim and rejects a wallbang', () => {
  const hist = [{ t: 1000, s: [0, 0, -10, 0, 0, 0] }, { t: 1033, s: [0.2, 0, -10, 0, 0, 0] }];
  const st = sampleAt(hist, 1016);
  const o = [st[0], 1.63, 0], d = [0, 0, -1];
  const zone = validateClaim(world, hist, { rt: 1016, o, d, zone: 0 }, [o[0], 0, 0]);
  assert.equal(zone, 0);
  const wall = validateClaim(world, [{ t: 0, s: [-6, 0, 0, 0, 0, 0] }], { rt: 0, o: [0, 1.5, 0], d: [-1, 0, 0], zone: 1 }, [0, 0, 0]);
  assert.equal(wall, -1, 'shot through the alley wall must not count');
});
ok('domination soak: 4v4 bots fight and take points, snapshot stays under 4 KiB', () => {
  const sim = new Sim(world);
  let t = 0;
  for (let i = 0; i < 60 * 240; i++) { t += 1000 / 60; sim.update(1 / 60, t); if (i % 2 === 0) sim.snapshot(t); }
  const ents = [...sim.ents.values()], kills = ents.reduce((a, e) => a + e.kills, 0);
  assert.equal(ents.filter((e) => e.team === 0).length, 4); assert.equal(ents.filter((e) => e.team === 1).length, 4);
  assert.ok(kills >= 4, 'bots should have fought, kills=' + kills);
  assert.ok(sim.score[0] + sim.score[1] > 0 && sim.zones.some((z) => z.owner >= 0), 'points should be captured ' + JSON.stringify(sim.zones));
  for (const e of ents) assert.ok(Number.isFinite(e.x) && e.y > -0.01 && e.y < 3, 'bot in bounds ' + [e.x, e.y, e.z]);
  const size = JSON.stringify({ v: 4, n: 'Operator-123', j: Date.now(), on: 1, away: 0, t, s: [0, 0, 0, 0, 0, 0], e: [], h: sim.snapshot(t) }).length;
  assert.ok(size < 3500, 'host presence ' + size + ' bytes');
  console.log('   kills', kills, 'score', sim.score.join(':'), 'zones', sim.zones.map((z) => z.owner).join(','), 'host presence', size, 'bytes');
});
ok('no friendly fire: a teammate claim is rejected', () => {
  const sim = new Sim(world);
  const a = sim.makeEnt(10, false, 'pa', 0), b = sim.makeEnt(11, false, 'pb', 0);
  for (const e of [a, b]) Object.assign(e, { alive: true, flags: 0, y: 0, x: 0 });
  a.z = 0; b.z = -6; b.buf = [{ t: 0, s: [0, 0, -6, 0, 0, 0] }];
  sim.claim(a, { target: 11, zone: 1, rt: 0, o: [0, 1.4, 0], d: [0, 0, -1] }, false);
  assert.equal(b.hp, 100);
  b.team = 1; sim.claim(a, { target: 11, zone: 1, rt: 0, o: [0, 1.4, 0], d: [0, 0, -1] }, false);
  assert.equal(b.hp, 66);
});
console.log(n, 'checks passed');
